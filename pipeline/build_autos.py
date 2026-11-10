#!/usr/bin/env python3
"""Autos auf Autobahnen und Autostrassen für «3D Schweiz» (Michael, 2026-11-10: «Möglich Autos aus den Autobahnen wegzuretuschieren und durch
fahrende Modelle zu ersetzen?», gewählt: nur Autobahnen und Autostrassen, nur in der Virtuellen Schweiz, Dichte erst bei der ASTRA prüfen,
eigener Knopf «Autos»).

Belegt sind die Lage der Fahrbahnen (swissTLM3D, TLM_STRASSE, OBJEKTART Autobahn und Autostrasse, mit Höhe) und der Verkehr an den
Zählstellen des ASTRA (Strassenverkehrszählung übergeordnetes Netz, data.geo.admin.ch, Jahr 2025): Nt ist der mittlere Verkehr je Stunde am
Tag (6 bis 22 Uhr), Nn in der Nacht (22 bis 6 Uhr), beide Richtungen zusammen (16 Nt + 8 Nn ergibt den DTV). Erfunden sind die Autos selbst,
ihre Lage, ihr Tempo und ihre Spur.

Je Fahrbahn: Autobahnen haben getrennte Fahrbahnen (RICHTUNGSG Wahr), die Richtung der Zeichnung ist nicht die Fahrtrichtung. Angenommen
wird Rechtsverkehr: die Gegenfahrbahn liegt links. Autostrassen ohne Trennung tragen beide Richtungen auf einer Achse. Die Stücke werden zu
Ketten verbunden, wo genau eines weiterführt; Tunnel, Galerien, Unterführungen und Stücke in Gebäuden zählen zur Länge der Kette (die Autos
fahren hindurch), sind aber nicht in den Kacheln. Je Kette gilt die Zählstelle, die über das Netz der Fahrbahnen am nächsten liegt (höchstens
ZAEHL_BIS_M); ohne eine bleibt der Verkehr leer, die App nimmt dann eine gewählte Dichte.

Je 10-km-Kachel eine Datei {Ost}_{Nord}.agz (gzip, JSON): je Stück [kette, art, länge der kette, s0, brücke, Ost, Nord, Höhe dm,
[dOst, dNord, dHöhe dm …]], art 0 Fahrbahn einer Richtung, 1 beide Richtungen; s0 der Abstand des ersten Punkts vom Anfang der Kette.
index.json nennt je Kette [Nt, Nn, Zählstelle] oder null.

    python3 pipeline/fetch_tlm3d.py --strassen
    .venv/bin/python pipeline/build_autos.py
"""
import gzip
import heapq
import io
import json
import math
import re
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "data" / "raw" / "tlm3d"
ZIEL = ROOT / "data" / "autos"
KACHEL_M = 10_000
ZAEHL_URL = ("https://data.geo.admin.ch/ch.astra.strassenverkehrszaehlung-uebergeordnet/strassenverkehrszaehlung-uebergeordnet/"
             "strassenverkehrszaehlung-uebergeordnet_2056.xtf.zip")
VERSTECKT = {"Tunnel", "Galerie", "Unterfuehrung", "in/auf Gebaeude"}
BRUECKE = {"Bruecke", "Gedeckte Bruecke", "Bruecke mit Galerie"}
#: eine Zählstelle gehört zur Fahrbahn bis so weit daneben, gewählt
ZAEHL_AN_M = 120
#: so weit über das Netz der Fahrbahnen gilt eine Zählstelle, gewählt
ZAEHL_BIS_M = 40_000
#: die Gegenfahrbahn: parallel (höchstens 30° schräg), 6 bis 80 m daneben, gewählt
GEGEN_MIN_M, GEGEN_MAX_M, GEGEN_GRAD = 6, 80, 30
KNOTEN_M = 2.0


def zaehlstellen():
    roh = ROOT / "data" / "raw" / "astra_zaehlung.xtf.zip"
    if not roh.exists():
        roh.write_bytes(urllib.request.urlopen(ZAEHL_URL, timeout=120).read())
    z = zipfile.ZipFile(io.BytesIO(roh.read_bytes()))
    t = z.read(next(n for n in z.namelist() if n.endswith(".xtf") and "Catalogue" not in n)).decode("utf-8")
    orte = {}
    for body in re.findall(r"<RoadTrafficCensus_V1_1\.RoadTrafficCensus\.MeasurementLocation TID[^>]*>(.*?)</RoadTrafficCensus_V1_1\."
                           r"RoadTrafficCensus\.MeasurementLocation>", t, re.S):
        g = lambda k: (re.search(rf"<{k}>([^<]*)</{k}>", body) or [None, None])[1]
        orte[g("MLocId")] = {"nr": g("MLocNr"), "name": g("MLocName"), "strasse": g("StreetDesignation"),
                             "e": float(re.search(r"<C1>([^<]+)", body)[1]), "n": float(re.search(r"<C2>([^<]+)", body)[1])}
    raus = []
    for body in re.findall(r"<RoadTrafficCensus_V1_1\.RoadTrafficCensus\.Indicator TID[^>]*>(.*?)</RoadTrafficCensus_V1_1\."
                           r"RoadTrafficCensus\.Indicator>", t, re.S):
        if 'REF="ch.astra.roadtrafficcensus.300"' not in body:  # nur beide Richtungen zusammen
            continue
        g = lambda k: (re.search(rf"<{k}>([^<]*)</{k}>", body) or [None, None])[1]
        o = orte.get(re.search(r'rMeasurementLocation REF="([^"]+)"', body)[1])
        if o and g("Nt") and g("Nn"):
            raus.append({**o, "jahr": int(g("Year")), "dtv": int(g("DTV")), "nt": int(g("Nt")), "nn": int(g("Nn"))})
    return raus


def winkel(de, dn):
    return math.atan2(dn, de)


def main():
    stellen = zaehlstellen()
    print(f"Zählstellen mit Werten: {len(stellen)}")

    r = shapefile.Reader(str(ROH / "swissTLM3D_TLM_STRASSE"), encoding="utf-8")
    felder = [f[0] for f in r.fields[1:]]
    stuecke = []  # {p: [(e,n,z)], einweg, kb}
    for i, rec in enumerate(r.iterRecords(fields=["OBJEKTART", "KUNSTBAUTE", "RICHTUNGSG"])):
        art, kb, rg = rec
        if art not in ("Autobahn", "Autostrasse"):
            continue
        s = r.shape(i)
        teile = list(s.parts) + [len(s.points)]
        for a, b in zip(teile, teile[1:]):
            p = [(q[0], q[1], s.z[j]) for j, q in zip(range(a, b), s.points[a:b])]
            if len(p) >= 2:
                stuecke.append({"p": p, "einweg": rg == "Wahr", "kb": kb})
    print(f"Stücke: {len(stuecke)}")

    # Raster der Strecken je 200 m für die Suche nach der Gegenfahrbahn und der Zählstelle
    RASTER = 200
    gitter = defaultdict(list)
    for k, st in enumerate(stuecke):
        p = st["p"]
        for i in range(len(p) - 1):
            for gx in range(int(min(p[i][0], p[i + 1][0]) // RASTER), int(max(p[i][0], p[i + 1][0]) // RASTER) + 1):
                for gy in range(int(min(p[i][1], p[i + 1][1]) // RASTER), int(max(p[i][1], p[i + 1][1]) // RASTER) + 1):
                    gitter[(gx, gy)].append((k, i))

    def naechste(e, n, bis, nur=None):
        """(Abstand, Stück, Segment, quer, Richtung des Segments) aller Segmente bis `bis` m"""
        raus = []
        for gx in range(int((e - bis) // RASTER), int((e + bis) // RASTER) + 1):
            for gy in range(int((n - bis) // RASTER), int((n + bis) // RASTER) + 1):
                for k, i in gitter.get((gx, gy), ()):
                    if nur is not None and not nur(k):
                        continue
                    a, b = stuecke[k]["p"][i], stuecke[k]["p"][i + 1]
                    de, dn = b[0] - a[0], b[1] - a[1]
                    l2 = de * de + dn * dn
                    if not l2:
                        continue
                    t = max(0.0, min(1.0, ((e - a[0]) * de + (n - a[1]) * dn) / l2))
                    fe, fn = a[0] + t * de, a[1] + t * dn
                    d = math.hypot(e - fe, n - fn)
                    if d <= bis:
                        raus.append((d, k, i, de, dn))
        return raus

    # Fahrtrichtung der getrennten Fahrbahnen: die Gegenfahrbahn liegt links (Rechtsverkehr, angenommen)
    gedreht = unklar = 0
    for k, st in enumerate(stuecke):
        if not st["einweg"]:
            continue
        p = st["p"]
        stimmen = 0
        for i in range(len(p) - 1):
            a, b = p[i], p[i + 1]
            de, dn = b[0] - a[0], b[1] - a[1]
            l = math.hypot(de, dn)
            if l < 1:
                continue
            me, mn = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            ue, un = de / l, dn / l
            best = None
            for d, k2, i2, de2, dn2 in naechste(me, mn, GEGEN_MAX_M, lambda x: x != k and stuecke[x]["einweg"]):
                if d < GEGEN_MIN_M:
                    continue
                l2 = math.hypot(de2, dn2)
                cos = (ue * de2 + un * dn2) / l2
                if abs(cos) < math.cos(math.radians(GEGEN_GRAD)):
                    continue
                if best is None or d < best[0]:
                    best = (d, k2, i2, cos)
            if not best:
                continue
            q = stuecke[best[1]]["p"]
            qe, qn = (q[best[2]][0] + q[best[2] + 1][0]) / 2, (q[best[2]][1] + q[best[2] + 1][1]) / 2
            links = (ue * (qn - mn) - un * (qe - me)) > 0
            # gegenläufig gezeichnet oder nicht: entscheidend ist nur, auf welcher Seite die andere Fahrbahn liegt
            stimmen += (1 if links else -1) * l
        if stimmen < 0:
            st["p"] = st["p"][::-1]
            gedreht += 1
        elif stimmen == 0:
            unklar += 1
    print(f"Fahrbahnen gedreht: {gedreht}, ohne Gegenfahrbahn: {unklar}")

    # Ketten: Knoten an den Enden, verbunden, wo genau ein Stück weiterführt
    knoten = lambda q: (round(q[0] / KNOTEN_M), round(q[1] / KNOTEN_M))
    aus, ein, an = defaultdict(list), defaultdict(list), defaultdict(list)
    for k, st in enumerate(stuecke):
        a, b = knoten(st["p"][0]), knoten(st["p"][-1])
        if st["einweg"]:
            aus[a].append(k); ein[b].append(k)
        else:
            an[a].append(k); an[b].append(k)
    nach = {}
    for k, st in enumerate(stuecke):
        if st["einweg"]:
            b = knoten(st["p"][-1])
            if len(aus[b]) == 1 and len(ein[b]) == 1:
                nach[k] = aus[b][0]
    vor = {v: k for k, v in nach.items()}
    ketten = []  # Liste von (stück, umgekehrt)
    gesehen = set()
    for k, st in enumerate(stuecke):
        if not st["einweg"] or k in gesehen:
            continue
        anfang = k
        while anfang in vor and vor[anfang] not in gesehen and vor[anfang] != k:
            anfang = vor[anfang]
        kette, x = [], anfang
        while x is not None and x not in gesehen:
            gesehen.add(x); kette.append((x, False)); x = nach.get(x)
        ketten.append(kette)
    # Autostrassen ohne Trennung: an Knoten mit genau zwei solchen Stücken verbunden
    def anderes_ende(x, kn):
        xp = stuecke[x]["p"]
        return knoten(xp[-1]) if knoten(xp[0]) == kn else knoten(xp[0])

    for k, st in enumerate(stuecke):
        if st["einweg"] or k in gesehen:
            continue
        # zuerst rückwärts zum Anfang der Kette
        x, kn, besucht = k, knoten(st["p"][0]), {k}
        while len(an[kn]) == 2:
            y = an[kn][0] if an[kn][1] == x else an[kn][1]
            if y in besucht or y in gesehen or y == x:
                break
            besucht.add(y)
            x, kn = y, anderes_ende(y, kn)
        # x ist das erste Stück, kn sein freies Ende: vorwärts sammeln
        kette = []
        while x is not None and x not in gesehen:
            gesehen.add(x)
            umg = knoten(stuecke[x]["p"][0]) != kn
            kette.append((x, umg))
            kn = anderes_ende(x, kn)
            weiter = [y for y in an[kn] if y != x and y not in gesehen]
            x = weiter[0] if len(an[kn]) == 2 and weiter else None
        ketten.append(kette)
    print(f"Ketten: {len(ketten)}")

    # Zählstelle je Kette: über das Netz der Fahrbahnen (ungerichtet), von den Stücken an jeder Zählstelle aus
    kette_von = {}
    for c, kette in enumerate(ketten):
        for x, _ in kette:
            kette_von[x] = c
    nachbar = defaultdict(set)
    for kn in set(list(aus) + list(ein) + list(an)):
        alle = aus[kn] + ein[kn] + an[kn]
        cs = {kette_von[x] for x in alle}
        for c in cs:
            nachbar[c] |= cs - {c}
    laenge = [sum(sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(stuecke[x]["p"], stuecke[x]["p"][1:])) for x, _ in kette)
              for kette in ketten]
    beste = [None] * len(ketten)
    heap = []
    for z, s in enumerate(stellen):
        for d, k2, i2, _, _ in naechste(s["e"], s["n"], ZAEHL_AN_M):
            heapq.heappush(heap, (d, kette_von[k2], z))
    while heap:
        d, c, z = heapq.heappop(heap)
        if beste[c] is not None or d > ZAEHL_BIS_M:
            continue
        beste[c] = (z, d)
        for c2 in nachbar[c]:
            if beste[c2] is None:
                heapq.heappush(heap, (d + laenge[c] / 2 + laenge[c2] / 2, c2, z))
    mit = sum(1 for x in beste if x is not None)
    print(f"Ketten mit Zählstelle: {mit} von {len(ketten)}, "
          f"{sum(l for l, x in zip(laenge, beste) if x) / 1000:.0f} von {sum(laenge) / 1000:.0f} km")

    kacheln = defaultdict(list)
    for c, kette in enumerate(ketten):
        s0 = 0.0
        L = round(laenge[c], 1)
        for x, umg in kette:
            st = stuecke[x]
            p = st["p"][::-1] if umg else st["p"]
            l = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(p, p[1:]))
            if st["kb"] not in VERSTECKT:
                e0, n0, h0 = round(p[0][0], 1), round(p[0][1], 1), round(p[0][2] * 10)
                d = []
                for q in p:
                    d += [round(q[0] - e0, 1), round(q[1] - n0, 1), round(q[2] * 10) - h0]
                eintrag = [c, 0 if st["einweg"] else 1, L, round(s0, 1), 1 if st["kb"] in BRUECKE else 0, e0, n0, h0, d]
                for kk in {(int(q[0] // KACHEL_M), int(q[1] // KACHEL_M)) for q in p}:
                    kacheln[kk].append(eintrag)
            s0 += l

    ZIEL.mkdir(parents=True, exist_ok=True)
    for f in ZIEL.glob("*.agz"):
        f.unlink()
    groesse = 0
    for (ex, ny), liste in kacheln.items():
        f = ZIEL / f"{ex}_{ny}.agz"
        f.write_bytes(gzip.compress(json.dumps(liste, separators=(",", ":")).encode(), 9, mtime=0))
        groesse += f.stat().st_size
    jahr = max(s["jahr"] for s in stellen)
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo), TLM_STRASSE, Autobahn und Autostrasse; Strassenverkehrszählung übergeordnetes Netz (ASTRA)",
        "jahr_zaehlung": jahr, "geladen": date.today().isoformat(), "kachel_m": KACHEL_M,
        "hinweis": "Nt und Nn: mittlerer Verkehr je Stunde, Tag 6 bis 22 Uhr und Nacht 22 bis 6 Uhr, beide Richtungen; je Kette die Zählstelle, "
                   f"die über das Netz am nächsten liegt, bis {ZAEHL_BIS_M // 1000} km. Autos, Lage, Tempo und Spur erfunden.",
        "zaehlstellen": [[s["nr"], s["name"], s["strasse"], s["nt"], s["nn"], s["dtv"]] for s in stellen],
        "ketten": [None if x is None else x[0] for x in beste],
        "kacheln": sorted(f"{ex}_{ny}" for ex, ny in kacheln),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(kacheln)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
