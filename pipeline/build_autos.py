#!/usr/bin/env python3
"""Autos auf Autobahnen und Autostrassen für «3D Schweiz» (Michael, 2026-11-10: «Möglich Autos aus den Autobahnen wegzuretuschieren und durch
fahrende Modelle zu ersetzen?», gewählt: nur Autobahnen und Autostrassen, nur in der Virtuellen Schweiz, Dichte erst bei der ASTRA prüfen,
eigener Knopf «Autos»).

Belegt sind die Lage der Fahrbahnen (swissTLM3D, TLM_STRASSE, OBJEKTART Autobahn und Autostrasse, mit Höhe) und der Verkehr an den
Zählstellen des ASTRA (Strassenverkehrszählung übergeordnetes Netz, data.geo.admin.ch, Jahr 2025): Nt ist der mittlere Verkehr je Stunde am
Tag (6 bis 22 Uhr), Nn in der Nacht (22 bis 6 Uhr), beide Richtungen zusammen (16 Nt + 8 Nn ergibt den DTV), dazu der Anteil Schwerverkehr
in % am Tag und in der Nacht (PrctHeavyTrafficDay, PrctHeavyTrafficNight). Erfunden sind die Autos selbst,
ihre Lage, ihr Tempo und ihre Spur.

Je Fahrbahn: Autobahnen haben getrennte Fahrbahnen (RICHTUNGSG Wahr), in Fahrtrichtung gezeichnet (Rechtsverkehr: die Gegenfahrbahn liegt
links, an 5'570 von 5'581 Fahrbahnen mit gegenläufiger Nachbarin geprüft). Autostrassen ohne Trennung tragen beide Richtungen auf einer Achse. Die Stücke werden zu
Ketten verbunden, wo genau eines weiterführt; Tunnel, Galerien, Unterführungen und Stücke in Gebäuden zählen zur Länge der Kette (die Autos
fahren hindurch), sind aber nicht in den Kacheln. Je Kette gilt die Zählstelle, die über das Netz der Fahrbahnen am nächsten liegt (höchstens
ZAEHL_BIS_M); ohne eine bleibt der Verkehr leer, die App nimmt dann eine gewählte Dichte.

Je 10-km-Kachel eine Datei {Ost}_{Nord}.agz (gzip, JSON): je Stück [kette, art, länge der kette, s0, brücke, Ost, Nord, Höhe dm,
[dOst, dNord, dHöhe dm …]], art 0 Fahrbahn einer Richtung, 1 beide Richtungen; s0 der Abstand des ersten Punkts vom Anfang der Kette.
index.json nennt je Kette die Zählstelle oder null.

Übrige Strassen (Michael, 2026-11-10: «Jetzt mehr Verkehr auf anderen Strassen»): swissTLM3D OBJEKTART 10m, 8m, 6m, 4m und 3m Strasse, Ein- und
Ausfahrt; der Verkehr laut Verkehrsmodell des ARE (Belastung Personen- und Güterverkehr Strasse, NPVM 2023 und AMG des UVEK, data.geo.admin.ch,
DTV aller Fahrzeuge und der Lastwagen und Lastzüge je Abschnitt; ein Modell, keine Zählung): alle 20 m einer Achse der nächste Abschnitt des
Modells bis ARE_BIS_M daneben, höchstens ARE_WINKEL schräg, je Stück der Median, wenn mindestens die Hälfte der Proben trifft; Ketten nur aus
Stücken derselben Klasse und Richtungsart, an Knoten mit genau zwei; je Kette der Median nach Länge, ohne Autos unter STRASSE_AB_DTV am Tag
oder wenn weniger als die Hälfte der Länge einen Wert hat. Den DTV teilt der Anteil am Tag laut den Zählstellen des ASTRA (Median von 16 Nt
durch DTV) auf Tag und Nacht. Je Stück dazu [Verkehr je Stunde am Tag, in der Nacht, Anteil Schwerverkehr %, Breite laut Klasse, Tempo]; art 2
beide Richtungen, 3 eine Richtung (RICHTUNGSG Wahr, wie bei den Autobahnen in Fahrtrichtung gezeichnet, an der Fahrbahn gilt der Wert des
Modells für diese Richtung). Tempo gewählt nach Klasse, innerhalb und ausserhalb der Siedlungen (swissTLMRegio).

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

import numpy as np
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
KNOTEN_M = 2.0
ARE_URL = ("https://data.geo.admin.ch/ch.are.belastung-personenverkehr-strasse/belastung-personenverkehr-strasse/"
           "belastung-personenverkehr-strasse_2056.gpkg")
#: Klasse: Breite laut Name (Ein- und Ausfahrt gewählt) und Tempo in km/h in und ausserhalb von Siedlungen (gewählt; innerorts ein Mittel samt
#: Halten an Kreuzungen und Ampeln, die nicht gezeichnet sind, darum unter 50; die Dichte ist Verkehr durch Tempo)
STRASSEN = {"10m Strasse": (10, 35, 80), "8m Strasse": (8, 35, 80), "6m Strasse": (6, 35, 80), "4m Strasse": (4, 30, 60),
            "3m Strasse": (3, 25, 50), "Einfahrt": (5, 60, 60), "Ausfahrt": (5, 60, 60)}
#: Probe alle so viele Meter, Abschnitt des Modells bis so weit daneben und höchstens so schräg (gewählt)
ARE_PROBE_M, ARE_BIS_M, ARE_WINKEL = 20, 12, 25
#: ohne Autos unter so vielen Fahrzeugen am Tag (DTV laut Modell, beide Richtungen; gewählt)
STRASSE_AB_DTV = 500
#: Achsen auf so viele Meter vereinfacht (Douglas-Peucker, gewählt)
EINFACH_M = 0.5


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
            raus.append({**o, "jahr": int(g("Year")), "dtv": int(g("DTV")), "nt": int(g("Nt")), "nn": int(g("Nn")),
                         # Anteil Schwerverkehr in % am Tag und in der Nacht (Michael, 2026-11-10: «Bitte auch LKWs einfügen»)
                         "lkw_tag": float(g("PrctHeavyTrafficDay") or "nan"), "lkw_nacht": float(g("PrctHeavyTrafficNight") or "nan")})
    return raus


def winkel(de, dn):
    return math.atan2(dn, de)


def ketten_bilden(stuecke):
    """Ketten aus Stücken {p, einweg}: gerichtete verbunden, wo genau eines weiterführt, ungerichtete an Knoten mit genau zwei; je Kette die
    Liste (Stück, umgekehrt)"""
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
    ketten, gesehen = [], set()
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

    def anderes_ende(x, kn):
        xp = stuecke[x]["p"]
        return knoten(xp[-1]) if knoten(xp[0]) == kn else knoten(xp[0])

    for k, st in enumerate(stuecke):
        if st["einweg"] or k in gesehen:
            continue
        x, kn, besucht = k, knoten(st["p"][0]), {k}
        while len(an[kn]) == 2:
            y = an[kn][0] if an[kn][1] == x else an[kn][1]
            if y in besucht or y in gesehen or y == x:
                break
            besucht.add(y)
            x, kn = y, anderes_ende(y, kn)
        kette = []
        while x is not None and x not in gesehen:
            gesehen.add(x)
            umg = knoten(stuecke[x]["p"][0]) != kn
            kette.append((x, umg))
            kn = anderes_ende(x, kn)
            weiter = [y for y in an[kn] if y != x and y not in gesehen]
            x = weiter[0] if len(an[kn]) == 2 and weiter else None
        ketten.append(kette)
    return ketten


def einfach(p, tol=EINFACH_M):
    """Douglas-Peucker in der Ebene, die Höhe der bleibenden Punkte bleibt"""
    if len(p) <= 2:
        return p
    behalten = [False] * len(p)
    behalten[0] = behalten[-1] = True
    stapel = [(0, len(p) - 1)]
    while stapel:
        a, b = stapel.pop()
        ae, an_, be, bn = p[a][0], p[a][1], p[b][0], p[b][1]
        l = math.hypot(be - ae, bn - an_)
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            if l < 1e-9:
                d = math.hypot(p[i][0] - ae, p[i][1] - an_)
            else:
                d = abs((be - ae) * (an_ - p[i][1]) - (ae - p[i][0]) * (bn - an_)) / l
            if d > best:
                best, bi = d, i
        if best > tol:
            behalten[bi] = True
            stapel += [(a, bi), (bi, b)]
    return [q for q, k in zip(p, behalten) if k]


def are_werte(stuecke):
    """je Stück (DTV, Anteil Schwerverkehr %) laut Verkehrsmodell des ARE oder None"""
    import shapely
    from shapely import wkb
    roh = ROOT / "data" / "raw" / "are_belastung_strasse.gpkg"
    if not roh.exists():
        roh.write_bytes(urllib.request.urlopen(ARE_URL, timeout=600).read())
    import sqlite3
    geoms, dtv, schwer = [], [], []
    for g, d, lw, lz in sqlite3.connect(roh).execute("select geom, DTV_FZG, DTV_LW, DTV_LZ from Personen_Gueterverkehr_Strasse"):
        n = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(g[3] >> 1) & 7]
        geoms.append(wkb.loads(bytes(g[8 + n:]))); dtv.append(d or 0); schwer.append((lw or 0) + (lz or 0))
    geoms, dtv, schwer = np.array(geoms), np.array(dtv, float), np.array(schwer, float)
    baum = shapely.STRtree(geoms)
    pts, dirs, owner = [], [], []
    for k, st in enumerate(stuecke):
        p = np.array([q[:2] for q in st["p"]])
        d = np.diff(p, axis=0); l = np.hypot(d[:, 0], d[:, 1]); cum = np.concatenate([[0], np.cumsum(l)]); L = cum[-1]
        if L < 1:
            continue
        ss = np.arange(ARE_PROBE_M / 2, L, ARE_PROBE_M) if L > ARE_PROBE_M else np.array([L / 2])
        j = np.clip(np.searchsorted(cum, ss) - 1, 0, len(l) - 1)
        t = (ss - cum[j]) / np.maximum(l[j], 1e-9)
        pts.append(p[j] + (p[j + 1] - p[j]) * t[:, None]); dirs.append(np.arctan2(d[j, 1], d[j, 0])); owner.append(np.full(len(ss), k))
    pts, dirs, owner = np.concatenate(pts), np.concatenate(dirs), np.concatenate(owner)
    P = shapely.points(pts)
    (pi, gi), _ = baum.query_nearest(P, max_distance=ARE_BIS_M, return_distance=True, all_matches=False)
    G = geoms[gi]
    loc = shapely.line_locate_point(G, P[pi])
    a = shapely.get_coordinates(shapely.line_interpolate_point(G, np.maximum(loc - 1, 0)))
    b = shapely.get_coordinates(shapely.line_interpolate_point(G, loc + 1))
    w = np.arctan2(b[:, 1] - a[:, 1], b[:, 0] - a[:, 0])
    ok = np.abs(((w - dirs[pi]) + np.pi / 2) % np.pi - np.pi / 2) < math.radians(ARE_WINKEL)
    wert = np.full(len(pts), np.nan); wert[pi[ok]] = dtv[gi[ok]]
    anteil = np.full(len(pts), np.nan); anteil[pi[ok]] = 100 * schwer[gi[ok]] / np.maximum(dtv[gi[ok]], 1)
    raus = [None] * len(stuecke)
    reihe = np.argsort(owner, kind="stable")
    grenzen = np.flatnonzero(np.diff(owner[reihe])) + 1
    for gruppe in np.split(reihe, grenzen):
        if not len(gruppe):
            continue
        v = wert[gruppe]
        if np.isnan(v).mean() > 0.5:
            continue
        raus[owner[gruppe[0]]] = (float(np.nanmedian(v)), float(np.nanmedian(anteil[gruppe])))
    print(f"ARE: {ok.sum()} von {len(pts)} Proben getroffen")
    return raus


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

    # Fahrtrichtung der getrennten Fahrbahnen: swissTLM3D zeichnet sie in Fahrtrichtung (geprüft 2026-11-10: von 5'581 Fahrbahnen mit einer
    # gegenläufigen Nachbarfahrbahn 6 bis 80 m daneben liegt diese bei 5'570 links, Rechtsverkehr); bis dahin wurden sie nach der nächsten
    # parallelen Fahrbahn gedreht, das drehte 408 falsch, wo die nächste in dieselbe Richtung führt (Michael, 2026-11-10, Grauholz:
    # «fahren die Autos teils auf der Gegenspur»)

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

    # übrige Strassen (Michael, 2026-11-10: «Jetzt mehr Verkehr auf anderen Strassen»)
    tag_anteil = float(np.median([16 * x["nt"] / x["dtv"] for x in stellen if x["dtv"]]))
    print(f"Anteil am Tag laut ASTRA: {tag_anteil:.3f}")
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from build_strassenlicht import siedlung, RAHMEN, MASKE_M
    maske = siedlung()
    x0, y0, x1, y1 = RAHMEN
    in_siedlung = lambda e, n: (x0 <= e < x1 and y0 <= n < y1 and bool(maske[int((y1 - n) // MASKE_M), int((e - x0) // MASKE_M)]))
    strassen = []
    for i, rec in enumerate(r.iterRecords(fields=["OBJEKTART", "KUNSTBAUTE", "RICHTUNGSG"])):
        art, kb, rg = rec
        if art not in STRASSEN:
            continue
        sh = r.shape(i)
        teile = list(sh.parts) + [len(sh.points)]
        for a_, b_ in zip(teile, teile[1:]):
            p = [(q[0], q[1], sh.z[j]) for j, q in zip(range(a_, b_), sh.points[a_:b_])]
            if len(p) >= 2:
                strassen.append({"p": p, "einweg": rg == "Wahr", "kb": kb, "klasse": art})
    print(f"übrige Strassen: {len(strassen)} Stücke")
    werte = are_werte(strassen)
    nr0 = len(ketten)
    zahl_s, km_s = 0, 0.0
    for klasse in STRASSEN:
        for einweg in (False, True):
            ids = [k for k, st in enumerate(strassen) if st["klasse"] == klasse and st["einweg"] == einweg]
            teil = [strassen[k] for k in ids]
            for kette in ketten_bilden(teil):
                laengen = [sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(teil[x]["p"], teil[x]["p"][1:])) for x, _ in kette]
                L = sum(laengen)
                mit = [(werte[ids[x]], l) for (x, _), l in zip(kette, laengen) if werte[ids[x]] is not None]
                if L < 1 or sum(l for _, l in mit) < L / 2:
                    continue
                # Median nach Länge
                mit.sort(key=lambda t: t[0][0])
                halb, summe, dtv_, schwer_ = sum(l for _, l in mit) / 2, 0.0, 0.0, 0.0
                for (d, sw), l in mit:
                    summe += l
                    if summe >= halb:
                        dtv_, schwer_ = d, sw
                        break
                if dtv_ < STRASSE_AB_DTV:
                    continue
                c = nr0 + zahl_s
                zahl_s += 1; km_s += L / 1000
                drin = sum(l for (x, _), l in zip(kette, laengen) if in_siedlung(*teil[x]["p"][len(teil[x]["p"]) // 2][:2]))
                breite, kmh_in, kmh_aus = STRASSEN[klasse]
                v = [round(dtv_ * tag_anteil / 16, 1), round(dtv_ * (1 - tag_anteil) / 8, 1), round(schwer_, 1), breite,
                     kmh_in if drin >= L / 2 else kmh_aus]
                s0 = 0.0
                for (x, umg), l in zip(kette, laengen):
                    st = teil[x]
                    p = st["p"][::-1] if umg else st["p"]
                    if st["kb"] not in VERSTECKT:
                        q = einfach(p)
                        e0, n0, h0 = round(q[0][0], 1), round(q[0][1], 1), round(q[0][2] * 10)
                        d = []
                        for pp in q:
                            d += [round(pp[0] - e0, 1), round(pp[1] - n0, 1), round(pp[2] * 10) - h0]
                        eintrag = [c, 3 if einweg else 2, round(L, 1), round(s0, 1), 1 if st["kb"] in BRUECKE else 0, e0, n0, h0, d, *v]
                        for kk in {(int(pp[0] // KACHEL_M), int(pp[1] // KACHEL_M)) for pp in q}:
                            kacheln[kk].append(eintrag)
                    s0 += l
    print(f"übrige Strassen: {zahl_s} Ketten, {km_s:.0f} km")

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
        "quelle": "swissTLM3D (swisstopo), TLM_STRASSE; Strassenverkehrszählung übergeordnetes Netz (ASTRA); Verkehrsmodell des ARE",
        "jahr_zaehlung": jahr, "geladen": date.today().isoformat(), "kachel_m": KACHEL_M,
        "hinweis": "Nt und Nn: mittlerer Verkehr je Stunde, Tag 6 bis 22 Uhr und Nacht 22 bis 6 Uhr, beide Richtungen; je Kette die Zählstelle, "
                   f"die über das Netz am nächsten liegt, bis {ZAEHL_BIS_M // 1000} km. Autos, Lage, Tempo und Spur erfunden.",
        "zaehlstellen": [[s["nr"], s["name"], s["strasse"], s["nt"], s["nn"], s["dtv"],
                          None if s["lkw_tag"] != s["lkw_tag"] else s["lkw_tag"], None if s["lkw_nacht"] != s["lkw_nacht"] else s["lkw_nacht"]] for s in stellen],
        "ketten": [None if x is None else x[0] for x in beste],
        "strassen": {"quelle": "Belastung Personen- und Güterverkehr Strasse (ARE), NPVM 2023 und AMG des UVEK, ein Modell",
                     "tag_anteil": round(tag_anteil, 3), "ab_dtv": STRASSE_AB_DTV, "ketten": zahl_s, "km": round(km_s)},
        "kacheln": sorted(f"{ex}_{ny}" for ex, ny in kacheln),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(kacheln)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
