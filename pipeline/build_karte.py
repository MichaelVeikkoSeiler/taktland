#!/usr/bin/env python3
"""Die kleine Karte zu den Tunneln: data/karte.json.

Keine Kartenbilder eines fremden Dienstes: Die App zeichnet die Karte selbst,
aus dem Streckennetz der SBB (linienkilometrierung). Sie zeigt, wo auf dem Netz
ein Tunnel liegt, keine Strassen, Orte oder Grenzen. Zur Orientierung stehen
einige grosse Bahnhöfe mit ihrem Namen und ihrer Lage aus den Fakten darin.

Jede Linie ist vereinfacht (Douglas-Peucker, TOLERANZ_M): Punkte, die weniger
als so weit neben der Verbindung ihrer Nachbarn liegen, fallen weg. Jeder
Punkt behält seinen Kilometer, damit ein Tunnel an seinem Kilometer auf der
Linie liegt. Ein Sprung in der Kilometrierung (zwei Punkte über SPRUNG_KM
auseinander) trennt die Linie in Stücke, sonst zöge die Karte eine Gerade.

    .venv/bin/python pipeline/build_karte.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_strecken import tunnel_bereich  # noqa: E402
from sources import DATASETS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
LINIEN = ROOT / "data" / "linien"
FACTS = ROOT / "data" / "facts"
ZIEL = ROOT / "data" / "karte.json"

QUELLEN = ["linienkilometrierung", "tunnel"]
TOLERANZ_M = 30
SPRUNG_KM = 1.5
M_LAT, M_LON = 111_200, 73_000

#: Bahnhöfe zur Orientierung, verteilt über das Land. Name und Lage aus den Fakten.
ORTE = ["Genève", "Lausanne", "Bern", "Basel SBB", "Zürich HB", "Luzern", "St. Gallen",
        "Chur", "Lugano", "Brig", "Neuchâtel", "Bellinzona"]


def vereinfachen(x, y, toleranz):
    behalten = np.zeros(len(x), bool)
    behalten[0] = behalten[-1] = True
    stapel = [(0, len(x) - 1)]
    while stapel:
        a, b = stapel.pop()
        if b <= a + 1:
            continue
        dx, dy = x[b] - x[a], y[b] - y[a]
        laenge = np.hypot(dx, dy) or 1.0
        d = np.abs(dy * (x[a + 1:b] - x[a]) - dx * (y[a + 1:b] - y[a])) / laenge
        i = int(np.argmax(d))
        if d[i] > toleranz:
            behalten[a + 1 + i] = True
            stapel += [(a, a + 1 + i), (a + 1 + i, b)]
    return behalten


def kodieren(km, lat, lon):
    """Wie strecken_geometrie.json: erster Punkt [Meter, Breite, Länge] in
    ganzen Zahlen (Grad mal 100000), danach Differenzen"""
    m = np.round(km * 1000).astype(int)
    la = np.round(lat * 1e5).astype(int)
    lo = np.round(lon * 1e5).astype(int)
    return {"start": [int(m[0]), int(la[0]), int(lo[0])],
            "d": [int(v) for trio in zip(np.diff(m), np.diff(la), np.diff(lo)) for v in trio]}


def main():
    abruf = json.loads((RAW / "_abruf.json").read_text(encoding="utf-8"))
    lk = pd.read_csv(RAW / "linienkilometrierung.csv", sep=";", low_memory=False)
    lat, lon = zip(*(map(float, s.split(",")) for s in lk.geo_point_2d))
    lk["lat"], lk["lon"] = lat, lon

    linien, bereich, punkte = {}, {}, 0
    for nr, g in lk.groupby("linienr"):
        g = g.sort_values("km")
        km, la, lo = g.km.values, g.lat.values, g.lon.values
        bereich[int(nr)] = (float(km.min()), float(km.max()))
        x, y = lo * M_LON, la * M_LAT
        # an Sprüngen trennen
        schnitt = np.where(np.hypot(np.diff(x), np.diff(y)) > SPRUNG_KM * 1000)[0] + 1
        stuecke = []
        for a, b in zip([0, *schnitt], [*schnitt, len(km)]):
            if b - a < 2:
                continue
            k = vereinfachen(x[a:b], y[a:b], TOLERANZ_M)
            stuecke.append(kodieren(km[a:b][k], la[a:b][k], lo[a:b][k]))
            punkte += int(k.sum())
        if stuecke:
            linien[str(int(nr))] = stuecke

    # Tunnel: Bereich wie auf der Seite Strecke, für alle Tunnel der Linienfakten
    tunnel = {}
    for p in LINIEN.glob("*.json"):
        f = json.loads(p.read_text(encoding="utf-8"))
        for i, t in enumerate((f.get("tunnel") or {}).get("items", [])):
            lo_, hi_ = bereich[f["linie"]]
            v, w = tunnel_bereich(t["km"], t["laenge_m"], lo_, hi_)
            tunnel[f"{f['linie']}:{i}"] = [round(v, 3), round(w, 3)]

    namen = {}
    for p in FACTS.glob("*.json"):
        f = json.loads(p.read_text(encoding="utf-8"))
        if f["name"] in ORTE:
            sb = f["steckbrief"]
            namen[f["name"]] = [round(sb["lat"], 5), round(sb["lon"], 5)]
    orte = [{"name": n, "lage": namen[n]} for n in ORTE if n in namen]

    raus = {
        "datenstand": max(abruf[q] for q in QUELLEN),
        "quellen": QUELLEN,
        "hinweis": "Linien: je Stück start = [Meter, Breite, Länge] als ganze Zahlen (Grad mal "
                   "100000), d = Differenzen; vereinfacht auf {} m. tunnel: km von, km bis auf "
                   "der Linie, gleich, wenn die Richtung der Länge nicht erfasst ist. orte: Lage "
                   "aus den Fakten, nur zur Orientierung.".format(TOLERANZ_M),
        "linien": linien,
        "tunnel": dict(sorted(tunnel.items())),
        "orte": orte,
    }
    ZIEL.write_text(json.dumps(raus, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"karte.json: {len(linien)} Linien, {punkte} Punkte, {len(tunnel)} Tunnel, "
          f"{len(orte)} Orte ({ZIEL.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    assert all(q in DATASETS for q in QUELLEN), "Quelle fehlt in sources.py"
    main()
