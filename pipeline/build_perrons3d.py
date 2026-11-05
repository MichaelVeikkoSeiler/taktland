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
#: so weit darf die Gleisachse neben der Kante liegen (Kante bis Gleismitte etwa 1,7 m, dazu Ungenauigkeit), gewählt
NAH_M = 4.0
#: breiter ist kein Perron zwischen zwei Kanten (sonst gehören die Kanten nicht zusammen), gewählt
BREITE_HOECHSTENS_M = 30.0
ZELLE_M = 50


def abstand_strecke(m, a, b):
    se, sn = b[0] - a[0], b[1] - a[1]
    l2 = se * se + sn * sn
    t = max(0.0, min(1.0, ((m[0] - a[0]) * se + (m[1] - a[1]) * sn) / l2)) if l2 else 0.0
    return math.hypot(a[0] + t * se - m[0], a[1] + t * sn - m[1])


def main():
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

    raus, ohne_achse, einseitig, zweiseitig = [], 0, 0, 0
    for (uic, nr), ks in kanten.items():
        liste = [(k, linie(p), hoehe[((uic, nr), k)]) for k, p in ks.items()]
        liste = [x for x in liste if len(x[1]) >= 2]
        if not liste:
            continue
        # zwei Kanten: die zwei längsten; liegen sie zu weit auseinander, gilt jede für sich
        liste.sort(key=lambda x: -sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(x[1], x[1][1:])))
        paare = []
        if len(liste) >= 2:
            a, b = liste[0], liste[1]
            ma = a[1][len(a[1]) // 2]
            dmin = min(abstand_strecke(ma, p, q) for p, q in zip(b[1], b[1][1:]))
            if 2 <= dmin <= BREITE_HOECHSTENS_M:
                paare.append((a, b))
            else:
                paare += [(a, None), (b, None)]
        else:
            paare.append((liste[0], None))
        for a, b in paare:
            umriss = []
            if b:
                pa, pb = a[1], b[1]
                # B in derselben Richtung wie A
                if math.hypot(pb[0][0] - pa[0][0], pb[0][1] - pa[0][1]) > math.hypot(pb[-1][0] - pa[0][0], pb[-1][1] - pa[0][1]):
                    pb = pb[::-1]
                umriss = [(e, n, a[2]) for e, n in pa] + [(e, n, b[2]) for e, n in pb[::-1]]
                zweiseitig += 1
            else:
                pa = a[1]
                # vom Gleis weg: die Achse am mittleren Punkt, die Seite dorthin, wo sie nicht liegt
                m = pa[len(pa) // 2]
                g = achse(*m)
                if not g:
                    ohne_achse += 1
                    continue
                k0, k1 = pa[max(0, len(pa) // 2 - 1)], pa[min(len(pa) - 1, len(pa) // 2 + 1)]
                de, dn = k1[0] - k0[0], k1[1] - k0[1]
                l = math.hypot(de, dn) or 1
                qe, qn = -dn / l, de / l
                if (m[0] - g[1]) * qe + (m[1] - g[2]) * qn < 0:
                    qe, qn = -qe, -qn
                aussen = []
                for i, (e, n) in enumerate(pa):
                    j0, j1 = pa[max(0, i - 1)], pa[min(len(pa) - 1, i + 1)]
                    te, tn = j1[0] - j0[0], j1[1] - j0[1]
                    tl = math.hypot(te, tn) or 1
                    ne_, nn_ = -tn / tl, te / tl
                    if ne_ * qe + nn_ * qn < 0:
                        ne_, nn_ = -ne_, -nn_
                    aussen.append((e + ne_ * BREITE_EINSEITIG_M, n + nn_ * BREITE_EINSEITIG_M, a[2]))
                umriss = [(e, n, a[2]) for e, n in pa] + aussen[::-1]
                einseitig += 1
            # die Höhe des Gleises je Punkt: die nächste Achse an der Kante (für die Aussenseite die des nächsten Kantenpunkts)
            zs = []
            for e, n, _ in umriss:
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
    print(f"{len(raus)} Perrons ({zweiseitig} mit zwei Kanten, {einseitig} mit einer), {ohne_achse} ohne Gleisachse, "
          f"{ZIEL.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
