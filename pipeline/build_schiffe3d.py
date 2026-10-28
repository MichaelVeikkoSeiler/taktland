#!/usr/bin/env python3
"""Schiffe laut Fahrplan für 3D-Land (3dland.ch), nicht für Taktland (Michael, 2026-10-28: «Ja gern, tolle Idee»).

Aufgerufen von pipeline/build_zuege3d.py, das den Fahrplan (GTFS von opentransportdata.swiss) nur einmal liest: die
Fahrten der Schiffe (GTFS route_type 4 und 1000) mit ihren Halten an den Ländten. Zwischen zwei Ländten fährt ein Schiff
auf den Kurslinien von swissTLMRegio (data/schifflinien.json, pipeline/build_schifflinien.py), der kürzeste Weg auf
diesen Linien; eine Ländte hängt an der nächsten Stelle einer Linie bis ANLEGEN_M. Findet sich kein Weg, fehlt das
Schiff auf diesem Stück (es fährt nicht quer übers Land).

Nicht darin, und so in der App benannt: Verspätungen, Ausfälle, Extrafahrten und Fahrten nur als Takt; der wirkliche
Kurs, wo er von der Linie der Landeskarte abweicht.

Ausgabe nach data/schiffe3d/schiffe.json (nicht in Git, der Workflow von 3dland.ch baut es täglich): Quelle, Stand,
Zeitraum, Verkehrstage wie bei den Zügen, die Ländten [Name, Ost, Nord], die Wege je Paar von Ländten («a>b»: erster
Punkt, dann Differenzen in Metern) und die Fahrten [Nummer, Gattung, Linie, Ziel, Verkehrstage, [Ländte, Ankunft,
Abfahrt, …]].
"""
import heapq
import json
import math
import shutil
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINIEN = ROOT / "data" / "schifflinien.json"
ZIEL = ROOT / "data" / "schiffe3d"
SCHIFF = {4, 1000}
#: so weit darf eine Ländte neben der nächsten Kurslinie liegen; fast alle liegen näher als 300 m (gemessen 2026-10-28)
ANLEGEN_M = 600
#: Enden von Linien, die so nah an einer anderen Linie liegen, gelten als verbunden
VERBINDEN_M = 60
#: ein Weg, der mehr als so oft länger ist als die Luftlinie (plus 1 km), ist kein Kurs, sondern ein Umweg über das Netz
#: (Bellevue–Corsier GE quer über den See und zurück, 15 km statt 4,4; gemessen 2026-10-28); gewählt
UMWEG = 2.2
RASTER_M = 500


def netz_bauen():
    """Punkte und Kanten aus den Kurslinien; die Punkte im Raster RASTER_M für die Suche nach dem nächsten"""
    roh = json.loads(LINIEN.read_text(encoding="utf-8"))
    punkte, nachbarn, enden = [], defaultdict(list), []
    for _, flach in roh["linien"]:
        e, n = flach[0], flach[1]
        idx = [len(punkte)]
        punkte.append((e, n))
        for i in range(2, len(flach), 2):
            e += flach[i]; n += flach[i + 1]
            idx.append(len(punkte))
            punkte.append((e, n))
        for a, b in zip(idx, idx[1:]):
            d = math.dist(punkte[a], punkte[b])
            nachbarn[a].append((b, d)); nachbarn[b].append((a, d))
        enden.append((idx[0], set(idx)))
        enden.append((idx[-1], set(idx)))
    raster = defaultdict(list)
    for i, (e, n) in enumerate(punkte):
        raster[(int(e // RASTER_M), int(n // RASTER_M))].append(i)

    def nahe(e, n, bis):
        r = math.ceil(bis / RASTER_M)
        ke, kn = int(e // RASTER_M), int(n // RASTER_M)
        for x in range(ke - r, ke + r + 1):
            for y in range(kn - r, kn + r + 1):
                for i in raster.get((x, y), ()):
                    d = math.dist((e, n), punkte[i])
                    if d <= bis:
                        yield d, i

    for ende, eigene in enden:
        for d, i in nahe(*punkte[ende], VERBINDEN_M):
            if i not in eigene:
                nachbarn[ende].append((i, d)); nachbarn[i].append((ende, d))
    return punkte, nachbarn, nahe


def bauen(info, g_name, von, bis, tage, linien, fahrten, halte, laendten):
    """linien: route_id → (Gattung, Linie); fahrten: trip_id → (route_id, service_id, Nummer, Ziel);
    halte: trip_id → [(Folge, Ländte, Ankunft, Abfahrt)]; laendten: Ländte → (Name, Ost, Nord)"""
    punkte, nachbarn, nahe = netz_bauen()
    # jede Ländte als eigener Punkt am nächsten Punkt einer Kurslinie
    knoten = {}
    gebraucht = {x[1] for h in halte.values() for x in h}
    for k, (_, e, n) in laendten.items():
        if k not in gebraucht:
            continue
        best = min(nahe(e, n, ANLEGEN_M), default=None)
        if best is None:
            continue
        i = len(punkte)
        punkte.append((e, n))
        nachbarn[i].append((best[1], best[0])); nachbarn[best[1]].append((i, best[0]))
        knoten[k] = i
    print(f"Schiffe: {len(knoten)} von {len(gebraucht)} Ländten an einer Kurslinie (bis {ANLEGEN_M} m)")

    wege, ohne_weg = {}, 0

    def weg(a, b):
        if (a, b) in wege:
            return wege[(a, b)]
        raus = None
        if a in knoten and b in knoten:
            s, z = knoten[a], knoten[b]
            dist, vor, haufen = {s: 0.0}, {}, [(0.0, s)]
            while haufen:
                d, u = heapq.heappop(haufen)
                if u == z:
                    break
                if d > dist[u]:
                    continue
                for v, w in nachbarn[u]:
                    # nicht durch eine andere Ländte hindurch (deren Stich zur Linie ist kein Kurs)
                    if v >= len(punkte) - len(knoten) and v != z:
                        continue
                    if d + w < dist.get(v, math.inf):
                        dist[v] = d + w; vor[v] = u
                        heapq.heappush(haufen, (dist[v], v))
            luft = math.dist(punkte[s], punkte[z])
            if z in dist and dist[z] <= luft * UMWEG + 1000:
                folge, u = [z], z
                while u != s:
                    u = vor[u]; folge.append(u)
                raus = [punkte[i] for i in reversed(folge)]
        wege[(a, b)] = raus
        return raus

    zusammen = {}
    for tid, h in halte.items():
        h.sort()
        folge = []
        for _, k, a, b in h:
            if folge and folge[-1][0] == k:
                folge[-1] = (k, folge[-1][1], b)
            else:
                folge.append((k, a, b))
        if len(folge) < 2:
            continue
        rid, sid, nr, ziel = fahrten[tid]
        gattung, linie = linien[rid]
        s = (gattung, linie, nr, ziel, tuple(folge))
        zusammen[s] = zusammen.get(s, 0) | tage.get(sid, 0)

    tage_liste, tage_index, laendte_index, raus = [], {}, {}, []
    for (gattung, linie, nr, ziel, folge), bits in sorted(zusammen.items(), key=lambda x: repr(x[0])):
        if not bits:
            continue
        for (a, *_), (b, *_) in zip(folge, folge[1:]):
            if weg(a, b) is None:
                ohne_weg += 1
        if bits not in tage_index:
            tage_index[bits] = len(tage_liste); tage_liste.append(format(bits, "x"))
        flach = []
        for k, an, ab in folge:
            if k not in laendte_index:
                laendte_index[k] = len(laendte_index)
            flach += [laendte_index[k], an, ab]
        raus.append([nr, gattung, linie, ziel, tage_index[bits], flach])
    print(f"Schiffe: {len(raus)} Fahrten, Paare von Ländten ohne Weg auf den Kurslinien (dort nicht gezeichnet): {ohne_weg}")

    def platt(p):
        f = [round(p[0][0]), round(p[0][1])]
        for (e0, n0), (e1, n1) in zip(p, p[1:]):
            f += [round(e1) - round(e0), round(n1) - round(n0)]
        return f

    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    ZIEL.mkdir(parents=True)
    liste = sorted(laendte_index, key=laendte_index.get)
    (ZIEL / "schiffe.json").write_text(json.dumps({
        "quelle": "Fahrplan als GTFS, opentransportdata.swiss; Kurslinien: swissTLMRegio, swisstopo",
        "datei": g_name,
        "stand": info["feed_version"],
        "von": von.isoformat(),
        "bis": bis.isoformat(),
        "hinweis": "Nur Schiffe, mit den Zeiten laut Fahrplan (Minuten ab Mitternacht des Verkehrstags, über 1440 nach "
                   "Mitternacht), je Halt Ländte, Ankunft, Abfahrt. Der Weg zwischen zwei Ländten ist der kürzeste auf den "
                   "Kurslinien von swissTLMRegio; ohne Weg fehlt das Schiff auf diesem Stück. Nicht darin: Verspätungen, "
                   "Ausfälle, Extrafahrten, Fahrten nur als Takt.",
        "tage": tage_liste,
        "laendten": [[laendten[k][0], round(laendten[k][1]), round(laendten[k][2])] for k in liste],
        "wege": {f"{laendte_index[a]}>{laendte_index[b]}": platt(w) for (a, b), w in wege.items()
                 if w and a in laendte_index and b in laendte_index},
        "fahrten": raus,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"data/schiffe3d/schiffe.json: {(ZIEL / 'schiffe.json').stat().st_size / 1e3:.0f} KB")
