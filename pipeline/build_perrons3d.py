#!/usr/bin/env python3
"""Perrons für «3D Schweiz» und den Führerstand (Michael, 2026-11-04: «Bahnhof Bern kann man Perrons und Gleise (Vertiefungen) bauen? So ist
alles flach», 2026-11-05: «An beiden Orten bitte, Perrons bauen»).

Belegt: die Perronkanten der SBB (data.sbb.ch, BehiG Haltekantesegment, 21197_behig-haltekantesegment.csv), je Haltekante Punkte in LV95, die
Perronnummer, das Kundengleis und die Höhe der Kante in der Legende («P 55» = 55 cm, «<=P20» = höchstens 20 cm, gezeichnet mit 20 cm); die
Höhe des Gleises aus den Gleisachsen von swissTLM3D (TLM_EISENBAHN, nur Bahn, ohne Tunnel, Unterführungen, Gebäude, Standseilbahnen).

Gewählt (in keiner Quelle): bei zwei Kanten eines Perrons die Fläche dazwischen; bei nur einer Kante (Aussen- und Hausperrons, oder wo die
zweite fehlt) eine Breite von BREITE_EINSEITIG_M auf der vom Gleis abgewandten Seite; Hilfskanten und Kanten ohne Höhe fehlen; ohne Gleisachse
ausserhalb von Tunneln bis NAH_M neben der Kante (unterirdische Perrons, etwa RBS in Bern) fehlt der Perron.

Ausgabe data/perrons3d.json: je Perron die Bahnhofsnummer, die Perronnummer und der Umriss, je Punkt E, N (LV95, dm), die Höhe des Gleises
(dm über Meer) und die Höhe der Kante über dem Gleis (cm).

    .venv/bin/python pipeline/build_perrons3d.py      # nach fetch.py und fetch_tlm3d.py, vor export_app
"""
import csv
import heapq
import json
import math
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "data" / "raw"
ZIEL = ROOT / "data" / "perrons3d.json"
#: so breit ist ein Perron mit nur einer Kante, gewählt
BREITE_EINSEITIG_M = 4.0
#: so weit darf die Gleisachse neben einem Punkt der SBB liegen (sie liegen auf der Achse; weiter weg ist es ein anderes Gleis, etwa über einem unterirdischen Bahnhof), gewählt
NAH_M = 1.0
#: so weit liegt die Kante neben der Gleisachse; die Punkte der SBB liegen auf der Achse (gemessen: 10'356 von 10'831 höchstens 30 cm
#: daneben), der Abstand steht in keiner unserer Quellen, gewählt
KANTE_M = 1.65
#: Sektortafeln bis so weit neben dem Gleis gehören zu seinem Perron, gewählt
TAFEL_M = 8.0
#: breiter ist kein Perron zwischen zwei Kanten (sonst gehören die Kanten nicht zusammen), gewählt
BREITE_HOECHSTENS_M = 30.0
ZELLE_M = 50


def abstand_strecke(m, a, b):
    se, sn = b[0] - a[0], b[1] - a[1]
    l2 = se * se + sn * sn
    t = max(0.0, min(1.0, ((m[0] - a[0]) * se + (m[1] - a[1]) * sn) / l2)) if l2 else 0.0
    return math.hypot(a[0] + t * se - m[0], a[1] + t * sn - m[1])


def wgs84_zu_lv95(la, lo):
    p = (la * 3600 - 169028.66) / 10000
    l = (lo * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return e, n


def vereinfachen(p, eps):
    """Douglas-Peucker: nur die Punkte, die mehr als eps von der Geraden abweichen"""
    if len(p) < 3:
        return p
    a, b = p[0], p[-1]
    i, dmax = 0, -1.0
    for k in range(1, len(p) - 1):
        d = abstand_strecke(p[k], a, b)
        if d > dmax:
            i, dmax = k, d
    if dmax <= eps:
        return [a, b]
    return vereinfachen(p[:i + 1], eps)[:-1] + vereinfachen(p[i:], eps)


def main(pruefen=None):
    bahn = shapefile.Reader(str(ROH / "tlm3d" / "swissTLM3D_TLM_EISENBAHN"), encoding="utf-8")
    felder = [f[0] for f in bahn.fields[1:]]
    zellen = defaultdict(list)
    for i, rec in enumerate(bahn.iterRecords()):
        d = dict(zip(felder, rec))
        if d.get("VERKEHRSMI") != "Bahn" or d.get("STANDSEILB") not in ("Falsch", None, "") \
                or d.get("KUNSTBAUTE") in ("Tunnel", "Unterfuehrung", "in/auf Gebaeude"):
            continue
        s = bahn.shape(i)
        p, z = s.points, s.z
        teile = list(s.parts) + [len(p)]
        for a0, b0 in zip(teile, teile[1:]):
            for k in range(a0, b0 - 1):
                a, b = (p[k][0], p[k][1], z[k]), (p[k + 1][0], p[k + 1][1], z[k + 1])
                for qe in range(int(min(a[0], b[0]) // ZELLE_M), int(max(a[0], b[0]) // ZELLE_M) + 1):
                    for qn in range(int(min(a[1], b[1]) // ZELLE_M), int(max(a[1], b[1]) // ZELLE_M) + 1):
                        zellen[(qe, qn)].append((a, b))

    # das Gleisnetz: Ecken auf 0,1 m gerundet, je Ecke die Nachbarn mit Abstand
    nachbarn = defaultdict(list)
    for segs in zellen.values():
        for a, b in segs:
            ka, kb = (round(a[0], 1), round(a[1], 1)), (round(b[0], 1), round(b[1], 1))
            l = math.hypot(b[0] - a[0], b[1] - a[1])
            if ka != kb:
                nachbarn[ka].append((kb, l))
                nachbarn[kb].append((ka, l))
    for k in nachbarn:
        nachbarn[k] = list(set(nachbarn[k]))

    def fuss(e, n):
        """der nächste Fusspunkt auf einer Gleisachse bis NAH_M: (Abstand, E, N, Ecke a, Ecke b) oder None"""
        best = None
        for qe in range(int(e // ZELLE_M) - 1, int(e // ZELLE_M) + 2):
            for qn in range(int(n // ZELLE_M) - 1, int(n // ZELLE_M) + 2):
                for a, b in zellen.get((qe, qn), ()):
                    se, sn = b[0] - a[0], b[1] - a[1]
                    l2 = se * se + sn * sn
                    if not l2:
                        continue
                    t = max(0.0, min(1.0, ((e - a[0]) * se + (n - a[1]) * sn) / l2))
                    fe, fn = a[0] + t * se, a[1] + t * sn
                    d = math.hypot(fe - e, fn - n)
                    if d <= NAH_M and (best is None or d < best[0]):
                        best = (d, fe, fn, (round(a[0], 1), round(a[1], 1)), (round(b[0], 1), round(b[1], 1)))
        return best

    def weg(f0, f1, hoechstens):
        """der kürzeste Weg im Gleisnetz von Fusspunkt f0 nach f1 als Punkte, oder None"""
        if {f0[3], f0[4]} == {f1[3], f1[4]}:
            return [(f0[1], f0[2]), (f1[1], f1[2])]
        start, ziel = (f0[1], f0[2]), (f1[1], f1[2])
        abst = {start: 0.0}
        vor = {}
        offen = [(0.0, start)]
        ende = {f1[3]: math.hypot(f1[3][0] - ziel[0], f1[3][1] - ziel[1]), f1[4]: math.hypot(f1[4][0] - ziel[0], f1[4][1] - ziel[1])}
        while offen:
            d, k = heapq.heappop(offen)
            if k == ziel:
                pfad = [k]
                while pfad[-1] in vor:
                    pfad.append(vor[pfad[-1]])
                return pfad[::-1]
            if d > abst.get(k, math.inf) or d > hoechstens:
                continue
            if k == start:
                nb = [(f0[3], math.hypot(f0[3][0] - start[0], f0[3][1] - start[1])), (f0[4], math.hypot(f0[4][0] - start[0], f0[4][1] - start[1]))]
            else:
                nb = list(nachbarn.get(k, ()))
            if k in ende:
                nb.append((ziel, ende[k]))
            for j, l in nb:
                nd = d + l
                if nd < abst.get(j, math.inf):
                    abst[j] = nd
                    vor[j] = k
                    heapq.heappush(offen, (nd, j))
        return None

    def entlang(punkte):
        """die Kante zwischen ihren Punkten der Gleisachse nach (Michael, 2026-11-05, Zürich: «Bei Zürich stimmen die Perron bei den Kurven
        nicht … aus den Karten die Standorte der Gleise berücksichtigen»): die Quelle nennt eine Kante von 400 m oft nur mit Anfang und Ende,
        gerade dazwischen schnitt sie die Kurve; hier der Weg der nächsten Achse, im Abstand der Kante an beiden Enden"""
        raus = [punkte[0]]
        for p, q in zip(punkte, punkte[1:]):
            l = math.hypot(q[0] - p[0], q[1] - p[1])
            fp, fq = fuss(*p), fuss(*q)
            pfad = weg(fp, fq, 1.3 * l + 20) if l > 15 and fp and fq else None
            if not pfad or len(pfad) < 2:
                raus.append(q)
                continue
            # der seitliche Abstand mit Vorzeichen an beiden Enden
            def seite(pt, a, b):
                de, dn = b[0] - a[0], b[1] - a[1]
                ll = math.hypot(de, dn) or 1
                return ((pt[0] - a[0]) * -dn + (pt[1] - a[1]) * de) / ll
            sp, sq = seite(p, pfad[0], pfad[1]), seite(q, pfad[-2], pfad[-1])
            # die Punkte der SBB liegen auf der Achse: ein kleiner Abstand ist Ungenauigkeit
            if abs(sp) < 0.5 and abs(sq) < 0.5:
                sp = sq = 0.0
            if sp * sq < 0:
                raus.append(q)
                continue
            # alle 5 m auf dem Weg
            laengen = [0.0]
            for a, b in zip(pfad, pfad[1:]):
                laengen.append(laengen[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
            ganz = laengen[-1]
            if ganz <= 0 or ganz > 1.3 * l + 20:
                raus.append(q)
                continue
            s, i = 5.0, 0
            while s < ganz - 2.5:
                while laengen[i + 1] < s:
                    i += 1
                a, b = pfad[i], pfad[i + 1]
                t = (s - laengen[i]) / ((laengen[i + 1] - laengen[i]) or 1)
                de, dn = b[0] - a[0], b[1] - a[1]
                ll = math.hypot(de, dn) or 1
                o = sp + (sq - sp) * s / ganz
                raus.append((a[0] + t * de - dn / ll * o, a[1] + t * dn + de / ll * o))
                s += 5.0
            raus.append(q)
        return vereinfachen(raus, 0.15)

    if pruefen:
        return pruefen(fuss, weg, entlang)

    def achse(e, n):
        """der nächste Fusspunkt auf einer Gleisachse bis NAH_M: (Abstand, E, N, Höhe) oder None"""
        best = None
        for qe in range(int(e // ZELLE_M) - 1, int(e // ZELLE_M) + 2):
            for qn in range(int(n // ZELLE_M) - 1, int(n // ZELLE_M) + 2):
                for a, b in zellen.get((qe, qn), ()):
                    se, sn = b[0] - a[0], b[1] - a[1]
                    l2 = se * se + sn * sn
                    if not l2:
                        continue
                    t = max(0.0, min(1.0, ((e - a[0]) * se + (n - a[1]) * sn) / l2))
                    fe, fn = a[0] + t * se, a[1] + t * sn
                    d = math.hypot(fe - e, fn - n)
                    if d <= NAH_M and (best is None or d < best[0]):
                        best = (d, fe, fn, a[2] + t * (b[2] - a[2]))
        return best

    # die Kanten: je Bahnhof, Perron und Kundengleis die Punkte der Haltekanten der Reihe nach
    kanten = defaultdict(lambda: defaultdict(list))
    hoehe = {}
    namen = {}
    with open(ROH / "21197_behig-haltekantesegment.csv", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            if r["perrontyp"] == "Hilfskante" or not r["e"] or not r["didok"]:
                continue
            m = re.match(r"\d\d_(<=)?P\s?(\d+)", r["legende"].strip())
            if not m:
                continue
            uic = 8500000 + int(float(r["didok"]))
            schl = (uic, r["perron_nr"].strip())
            kante = (r["kundengleisnr"].strip(), r["haltekante_fid"])
            kanten[schl][kante].append((float(r["dist_ab_hk_anfang"] or 0), float(r["e"]), float(r["n"])))
            hoehe[(schl, kante)] = int(m.group(2))
            namen[uic] = r["bezeichnung_offiziell"]

    def linie(punkte):
        punkte = sorted(punkte)
        raus = []
        for _, e, n in punkte:
            if not raus or math.hypot(e - raus[-1][0], n - raus[-1][1]) > 0.5:
                raus.append((e, n))
        return raus

    # die Sektortafeln stehen auf dem Perron: sie sagen, auf welcher Seite des Gleises er liegt
    tafeln = defaultdict(list)
    with open(ROH / "sektortafel.csv", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            uic, pos = r["bpuic"].strip(), r["geopos"].strip()
            if uic.isdigit() and pos:
                la, lo = (float(x) for x in pos.split(","))
                tafeln[int(uic)].append(wgs84_zu_lv95(la, lo))

    def versetzt(pa, o):
        """die Linie um o m nach links (in ihrer Richtung) versetzt"""
        aus = []
        for i, (e, n) in enumerate(pa):
            j0, j1 = pa[max(0, i - 1)], pa[min(len(pa) - 1, i + 1)]
            te, tn = j1[0] - j0[0], j1[1] - j0[1]
            tl = math.hypot(te, tn) or 1
            aus.append((e - tn / tl * o, n + te / tl * o))
        return aus

    def links_von(pa, pt):
        """+1, wenn der Punkt links der Linie liegt, sonst -1, und der Abstand"""
        best = None
        for a, b in zip(pa, pa[1:]):
            d = abstand_strecke(pt, a, b)
            if best is None or d < best[0]:
                best = (d, a, b)
        d, a, b = best
        kreuz = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0])
        return (1 if kreuz > 0 else -1), d

    def seite_einzeln(uic, pa):
        """die Seite eines Perrons mit nur einer Kante: wo seine Sektortafeln stehen (bis TAFEL_M neben der Linie), sonst
        die Seite ohne anderes Gleis bis FREI_M daneben; sonst unbekannt (None)"""
        st = [links_von(pa, t) for t in tafeln.get(uic, ()) if links_von(pa, t)[1] <= TAFEL_M]
        st = [x for x in st if x[1] >= 1.0]
        if st:
            summe = sum(x[0] for x in st)
            if summe:
                return 1 if summe > 0 else -1
        frei = []
        for sg in (1, -1):
            m = pa[len(pa) // 2]
            belegt = False
            for o in (3.0, 4.5, 6.0):
                q = versetzt(pa, sg * o)[len(pa) // 2]
                g = achse(*q)
                if g and g[0] < 1.5:
                    belegt = True
            if not belegt:
                frei.append(sg)
        return frei[0] if len(frei) == 1 else None

    raus, ohne_achse, einseitig, zweiseitig, ohne_seite = [], 0, 0, 0, 0
    for (uic, nr), ks in kanten.items():
        liste = [(k, entlang(linie(p)), hoehe[((uic, nr), k)]) for k, p in ks.items()]
        liste = [x for x in liste if len(x[1]) >= 2]
        if not liste:
            continue
        # zwei Kanten: die zwei längsten; liegen sie zu weit auseinander, gilt jede für sich
        liste.sort(key=lambda x: -sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(x[1], x[1][1:])))
        paare = []
        if len(liste) >= 2:
            a, b = liste[0], liste[1]
            # die Mitte der kürzeren Kante zur längeren (a ist die längere)
            mb = b[1][len(b[1]) // 2]
            dmin = min(abstand_strecke(mb, p, q) for p, q in zip(a[1], a[1][1:]))
            if 2 * KANTE_M + 1 <= dmin <= BREITE_HOECHSTENS_M:
                paare.append((a, b))
            else:
                paare += [(a, None), (b, None)]
        else:
            paare.append((liste[0], None))
        for a, b in paare:
            pa = a[1]
            if b:
                pb = b[1]
                # B in derselben Richtung wie A
                if math.hypot(pb[0][0] - pa[0][0], pb[0][1] - pa[0][1]) > math.hypot(pb[-1][0] - pa[0][0], pb[-1][1] - pa[0][1]):
                    pb = pb[::-1]
                sg = links_von(pa, pb[len(pb) // 2])[0]
                ka, kb = versetzt(pa, sg * KANTE_M), versetzt(pb, -sg * KANTE_M)
                # je Punkt der längeren Kante die andere Seite: die kürzere, wo sie daneben liegt, sonst die Breite eines Perrons mit einer Kante
                aussen = versetzt(pa, sg * (KANTE_M + BREITE_EINSEITIG_M))
                gegen, gegen_gleis = [], []
                for i, pt in enumerate(ka):
                    best = None
                    for j in range(len(kb) - 1):
                        q0, q1 = kb[j], kb[j + 1]
                        se, sn = q1[0] - q0[0], q1[1] - q0[1]
                        l2 = se * se + sn * sn
                        if not l2:
                            continue
                        t = ((pt[0] - q0[0]) * se + (pt[1] - q0[1]) * sn) / l2
                        if not 0 <= t <= 1:
                            continue
                        fe, fn = q0[0] + t * se, q0[1] + t * sn
                        d = math.hypot(fe - pt[0], fn - pt[1])
                        if d <= BREITE_HOECHSTENS_M and (best is None or d < best[0]):
                            g0, g1 = pb[j], pb[j + 1]
                            best = (d, (fe, fn), (g0[0] + t * (g1[0] - g0[0]), g0[1] + t * (g1[1] - g0[1])))
                    if best:
                        gegen.append((best[1][0], best[1][1], b[2]))
                        gegen_gleis.append(best[2])
                    else:
                        gegen.append((aussen[i][0], aussen[i][1], a[2]))
                        gegen_gleis.append(pa[i])
                umriss = [(e, n, a[2]) for e, n in ka] + gegen[::-1]
                gleise = list(pa) + gegen_gleis[::-1]
                zweiseitig += 1
            else:
                sg = seite_einzeln(uic, pa)
                if sg is None:
                    ohne_seite += 1
                    continue
                ka, kb = versetzt(pa, sg * KANTE_M), versetzt(pa, sg * (KANTE_M + BREITE_EINSEITIG_M))
                umriss = [(e, n, a[2]) for e, n in ka] + [(e, n, a[2]) for e, n in kb[::-1]]
                gleise = list(pa) + list(pa[::-1])
                einseitig += 1
            # die Höhe des Gleises je Punkt: die nächste Achse am Gleis dieser Kante
            zs = []
            for e, n in gleise:
                g = achse(e, n)
                zs.append(g[3] if g else None)
            bekannt = [z for z in zs if z is not None]
            if len(bekannt) < max(2, len(zs) // 3):
                ohne_achse += 1
                continue
            for i, z in enumerate(zs):
                if z is None:
                    zs[i] = min(((abs(j - i), bz) for j, bz in enumerate(zs) if bz is not None))[1]
            raus.append({"u": uic, "nr": nr, "p": [[round(e * 10), round(n * 10), round(z * 10), h] for (e, n, h), z in zip(umriss, zs)]})

    ZIEL.write_text(json.dumps({
        "quelle": "Perronkanten: SBB Open Data (BehiG Haltekantesegment, data.sbb.ch), Höhe der Kante laut Legende; Höhe des Gleises: swissTLM3D (swisstopo)",
        "geladen": date.today().isoformat(),
        "hinweis": f"je Punkt E, N (LV95, dm), Höhe des Gleises (dm ü. M.), Höhe der Kante über dem Gleis (cm); ein Perron mit einer Kante "
                   f"{BREITE_EINSEITIG_M:g} m breit (gewählt); ohne Gleisachse ausserhalb von Tunneln bis {NAH_M:g} m neben der Kante fehlt er",
        "perrons": raus,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(raus)} Perrons ({zweiseitig} mit zwei Kanten, {einseitig} mit einer), {ohne_achse} ohne Gleisachse, {ohne_seite} ohne bekannte Seite, "
          f"{ZIEL.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
