#!/usr/bin/env python3
"""Die Seen für die Karten: data/seen.json.

Quelle: Swiss Map Vector 1000 von swisstopo, die Landeskarte 1:1 Million als
Vektordaten (Ebene T22_DKM1M_GEWAESSER_PLY, Objektart «See»). Kostenlose
Geodaten (OGD): nutzen, bearbeiten und weitergeben erlaubt, auch kommerziell;
Quellenangabe Pflicht («Bundesamt für Landestopografie swisstopo»), geprüft am
2026-09-26 auf swisstopo.admin.ch (Nutzungsbedingungen OGD).

Aufgenommen sind alle Seen der Quelle, die im Rahmen der Karte liegen (Michael,
2026-09-25: «Alle Seen, nicht nur die 50 grössten»). In diesem Massstab fehlen
kleine Seen; das steht als Hinweis in der App. Namen stehen, wie die Quelle sie
führt, ohne Sprachkürzel («Zürichsee [GER]» wird «Zürichsee»); Seen ohne Namen
bleiben ohne Namen. Keine Flächen, keine Ränge: Die App zeichnet nur.

Umrechnung LV95 → WGS84 nach den Näherungsformeln von swisstopo (etwa 1 m
genau), Vereinfachung nach Douglas-Peucker um TOLERANZ_M. Ohne zusätzliche
Bibliotheken.

    python3 pipeline/build_seen.py            # lädt die Quelle, falls sie fehlt
"""
import json
import re
import sqlite3
import struct
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "swiss-map-vector1000"
ZIEL = ROOT / "data" / "seen.json"

URL = ("https://data.geo.admin.ch/ch.swisstopo.swiss-map-vector1000/"
       "swiss-map-vector1000/swiss-map-vector1000_2056.gpkg.zip")
EBENE = "T22_DKM1M_GEWAESSER_PLY"
TOLERANZ_M = 60
#: Rahmen der Karte in LV95 (Ost, Nord): die Schweiz mit etwas Rand
RAHMEN = (2_470_000, 1_060_000, 2_850_000, 1_310_000)


def laden() -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    zipdatei = RAW / "swiss-map-vector1000_2056.gpkg.zip"
    if not zipdatei.exists():
        print("lade", URL)
        urllib.request.urlretrieve(URL, zipdatei)
    gpkg = next(RAW.glob("**/*.gpkg"), None)
    if gpkg is None:
        with zipfile.ZipFile(zipdatei) as z:
            z.extractall(RAW)
        gpkg = next(RAW.glob("**/*.gpkg"))
    return gpkg


def wkb_polygone(b: bytes):
    """Polygone aus einer GeoPackage-Geometrie: Liste von Polygonen, je eine
    Liste von Ringen, je eine Liste von (Ost, Nord)."""
    flags = b[3]
    envelope = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
    pos = 8 + envelope

    def lies(pos):
        ordnung = "<" if b[pos] == 1 else ">"
        typ = struct.unpack_from(ordnung + "I", b, pos + 1)[0] % 1000
        pos += 5
        if typ == 3:
            n = struct.unpack_from(ordnung + "I", b, pos)[0]
            pos += 4
            ringe = []
            for _ in range(n):
                m = struct.unpack_from(ordnung + "I", b, pos)[0]
                pos += 4
                werte = struct.unpack_from(ordnung + "d" * (2 * m), b, pos)
                pos += 16 * m
                ringe.append(list(zip(werte[0::2], werte[1::2])))
            return [ringe], pos
        if typ == 6:
            n = struct.unpack_from(ordnung + "I", b, pos)[0]
            pos += 4
            alle = []
            for _ in range(n):
                teil, pos = lies(pos)
                alle += teil
            return alle, pos
        raise ValueError(f"Geometrietyp {typ} nicht erwartet")

    return lies(pos)[0]


def nach_wgs84(e: float, n: float) -> tuple[float, float]:
    """LV95 → WGS84 (Breite, Länge), Näherung von swisstopo"""
    y = (e - 2_600_000) / 1e6
    x = (n - 1_200_000) / 1e6
    lam = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    phi = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x \
        - 0.0447 * y * y * x - 0.0140 * x ** 3
    return phi * 100 / 36, lam * 100 / 36


def vereinfachen(pts, toleranz):
    if len(pts) < 4:
        return pts
    behalten = [False] * len(pts)
    behalten[0] = behalten[-1] = True
    stapel = [(0, len(pts) - 1)]
    while stapel:
        a, b = stapel.pop()
        if b <= a + 1:
            continue
        (xa, ya), (xb, yb) = pts[a], pts[b]
        dx, dy = xb - xa, yb - ya
        laenge = (dx * dx + dy * dy) ** 0.5
        bester, weit = -1, -1.0
        for i in range(a + 1, b):
            x, y = pts[i]
            d = (abs(dy * (x - xa) - dx * (y - ya)) / laenge) if laenge else ((x - xa) ** 2 + (y - ya) ** 2) ** 0.5
            if d > weit:
                bester, weit = i, d
        if weit > toleranz:
            behalten[bester] = True
            stapel += [(a, bester), (bester, b)]
    return [p for p, k in zip(pts, behalten) if k]


def name_von(roh: str | None) -> str | None:
    if not roh:
        return None
    teile = [re.sub(r"\s*\[[A-Z]{3}\]\s*$", "", t.strip()) for t in roh.split("|")]
    return " / ".join(t for t in teile if t) or None


def innen(pt, ring):
    x, y = pt
    drin = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            drin = not drin
    return drin


def namenspunkt(ringe):
    """Ein Punkt sicher im See für den Namen: auf der waagrechten Linie durch
    die Mitte die Mitte des breitesten Abschnitts im Wasser"""
    aussen = ringe[0]
    ys = [p[1] for p in aussen]
    beste = None
    for anteil in (0.5, 0.4, 0.6, 0.3, 0.7):
        y = min(ys) + (max(ys) - min(ys)) * anteil
        schnitte = []
        for ring in ringe:
            for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
                if (y1 > y) != (y2 > y):
                    schnitte.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
        schnitte.sort()
        for a, b in zip(schnitte[0::2], schnitte[1::2]):
            if beste is None or b - a > beste[0]:
                beste = (b - a, ((a + b) / 2, y))
        if beste:
            return beste[1]
    return aussen[0]


def main():
    gpkg = laden()
    db = sqlite3.connect(gpkg)
    seen = []
    punkte = 0
    for shape, name_lang in db.execute(
            f'select SHAPE, NAME_LANG from "{EBENE}" where OBJEKTART = ?', ("See",)):
        teile = wkb_polygone(shape)
        # der Name nur einmal, beim ausgedehntesten Teil (Rahmen des Ufers)
        def ausdehnung(pg):
            es, ns = [p[0] for p in pg[0]], [p[1] for p in pg[0]]
            return (max(es) - min(es)) * (max(ns) - min(ns))
        haupt = max(range(len(teile)), key=lambda i: ausdehnung(teile[i])) if teile else -1
        for nr, polygon in enumerate(teile):
            es = [p[0] for p in polygon[0]]
            ns = [p[1] for p in polygon[0]]
            if max(es) < RAHMEN[0] or min(es) > RAHMEN[2] or max(ns) < RAHMEN[1] or min(ns) > RAHMEN[3]:
                continue
            ringe = [vereinfachen(r, TOLERANZ_M) for r in polygon]
            ringe = [r for r in ringe if len(r) >= 4]
            if not ringe:
                continue
            eintrag = {"ringe": []}
            for r in ringe:
                werte = [nach_wgs84(e, n) for e, n in r[:-1]]  # ohne den wiederholten Schlusspunkt
                ganz = [(round(la * 1e5), round(lo * 1e5)) for la, lo in werte]
                d = []
                for (la0, lo0), (la1, lo1) in zip(ganz, ganz[1:]):
                    d += [la1 - la0, lo1 - lo0]
                eintrag["ringe"].append({"start": list(ganz[0]), "d": d})
                punkte += len(ganz)
            name = name_von(name_lang) if nr == haupt else None
            if name:
                eintrag["name"] = name
                la, lo = nach_wgs84(*namenspunkt(ringe))
                eintrag["namenspunkt"] = [round(la, 5), round(lo, 5)]
            seen.append(eintrag)
    daten = {
        "quelle": "Swiss Map Vector 1000, Bundesamt für Landestopografie swisstopo",
        "lizenz": "Kostenlose Geodaten (OGD) von swisstopo, Quellenangabe Pflicht",
        "geladen": date.today().isoformat(),
        "hinweis": ("Seen der Landeskarte 1:1 Million, vereinfacht auf "
                    f"{TOLERANZ_M} m; kleine Seen fehlen in diesem Massstab. Ringe: start = "
                    "[Breite, Länge] mal 100000, d = Differenzen; der erste Ring ist das Ufer, "
                    "weitere sind Inseln. Namen wie in der Quelle, ohne Sprachkürzel."),
        "seen": seen,
    }
    ZIEL.write_text(json.dumps(daten, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    mit_namen = sum(1 for s in seen if "name" in s)
    print(f"seen.json: {len(seen)} Seen, davon {mit_namen} mit Namen, {punkte} Punkte, "
          f"{ZIEL.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
