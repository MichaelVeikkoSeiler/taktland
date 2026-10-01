#!/usr/bin/env python3
"""Der Grund der Karten: data/kartengrund.json (Michael, 2026-09-27: «den weissen
Hintergrund langweilig»; Muster 1, 2 und 3).

- land: die Schweiz als Fläche und die Kantone, aus den generalisierten Grenzen
  des BFS (g1, Stand 2026-01-01, data.geo.admin.ch). Die Karte zeichnet das
  Ausland leicht grau und die Kantonsgrenzen fein.
- fluesse: die breiteren Fliessgewässer aus Swiss Map Vector 1000 von swisstopo
  (Ebene T26_DKM1M_GEWAESSER_LIN, Strichbreite der Landeskarte LB1000 ab
  FLUSS_AB_MM), mit Namen, wie die Quelle sie führt.
- orte: Ortsnamen der Landeskarte 1:1 Million (Swiss Map Vector 1000, Ebene
  T03_DKM1M_ORTSCHAFT_PKT_ANNO) ab ORTE_AB_KLASSE, mit der Einwohnerklasse der
  Quelle und der Mitte der Beschriftung, wie sie auf der Landeskarte steht; für
  die Namen auf dem Fahrtblatt (Michael, 2026-09-27: «Thun, Interlaken, Brig, Visp»)
- hoehen: Flächen über HOEHEN_STUFEN Metern aus swissALTIRegio von swisstopo,
  gemittelt auf RASTER_M, geglättet, als Höhenlinien; flache Töne, keine Schattierung.

Alles Kostenlose Geodaten (OGD) mit Quellenangabe. Gezeichnet, nicht gedeutet:
keine Zahl aus dieser Datei steht als Angabe in der App.

    .venv/bin/python pipeline/build_kartengrund.py     # braucht rasterio
"""
import json
import sqlite3
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_seen import laden as smv_laden, vereinfachen, wkb_polygone  # noqa: E402
from schienennetz import lv95_zu_wgs84  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
ZIEL = ROOT / "data" / "kartengrund.json"
GRENZEN = RAW / "grenzen"
ALTI = RAW / "alti_raster.npz"
BFS = ("https://data.geo.admin.ch/ch.bfs.historisierte-administrative_grenzen_g1/"
       "historisierte-administrative_grenzen_g1_2026-01-01/historisierte-administrative_grenzen_g1_2026-01-01_{}_2056.geojson")
ALTI_URL = ("/vsicurl/https://data.geo.admin.ch/ch.swisstopo.swissaltiregio/swissaltiregio/"
            "swissaltiregio_2056_5728.tif")

#: Rahmen der Karte in LV95 (Ost, Nord): die Schweiz mit etwas Rand, wie die Seen
RAHMEN = (2_470_000, 1_060_000, 2_850_000, 1_310_000)
HOEHEN_STUFEN = [1000, 2000, 3000]
RASTER_M = 200
#: Glättung des Rasters in Zellen (Gauss), gegen Treppen und Zacken
GLAETTEN = 1.2
FLUSS_AB_MM = 0.24
#: Einwohnerklassen der Quelle, klein nach gross; ab «2000-9999» kommen sie mit
ORTE_KLASSEN = ["Ort_2000-9999", "Ort_10000-49999", "Ort_50000-99999", "Ort_100000-1000000",
                "Ort_Groesser_1000000"]
ORTE_AB_KLASSE = 0
TOLERANZ_GRENZE_M = 100
#: Flüsse mit allen Punkten der Quelle, gezeichnet als Kurve (Michael, 2026-10-01: «extrem eckig»)
TOLERANZ_FLUSS_M = 0
TOLERANZ_HOEHE_M = 60
#: kleinere Flächen und Löcher fallen weg
MIN_FLAECHE_M2 = 8 * RASTER_M * RASTER_M


def kodieren(pts_lv95):
    """[Breite, Länge] mal 100000, erster Punkt und Differenzen, wie seen.json"""
    ganz = []
    for e, n in pts_lv95:
        la, lo = lv95_zu_wgs84(e, n)
        p = (round(la * 1e5), round(lo * 1e5))
        if not ganz or p != ganz[-1]:
            ganz.append(p)
    return {"start": list(ganz[0]),
            "d": [v for (a0, o0), (a1, o1) in zip(ganz, ganz[1:]) for v in (a1 - a0, o1 - o0)]}


def flaeche(ring):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))) / 2


def grenzen():
    GRENZEN.mkdir(parents=True, exist_ok=True)
    raus = {}
    for art in ("land", "kanton"):
        datei = GRENZEN / f"g1_{art}.geojson"
        if not datei.exists():
            import urllib.request
            urllib.request.urlretrieve(BFS.format(art), datei)
        d = json.loads(datei.read_text(encoding="utf-8"))
        ringe = []
        for f in d["features"]:
            if art == "land" and f["properties"].get("CODE_ISO") != "CH":
                continue
            g = f["geometry"]
            polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
            for poly in polys:
                for ring in poly:
                    r = vereinfachen([tuple(p[:2]) for p in ring], TOLERANZ_GRENZE_M)
                    if len(r) >= 4 and flaeche(r) >= MIN_FLAECHE_M2:
                        ringe.append(kodieren(r))
        raus[art] = ringe
    return raus


def wkb_linien(b):
    """Linien aus einer GeoPackage-Geometrie (LineString oder MultiLineString)"""
    import struct
    flags = b[3]
    pos = 8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
    ordnung = "<" if b[pos] == 1 else ">"
    typ = struct.unpack_from(ordnung + "I", b, pos + 1)[0] % 1000
    pos += 5
    def linie(pos):
        o = "<" if b[pos] == 1 else ">"
        pos += 5
        m = struct.unpack_from(o + "I", b, pos)[0]
        pos += 4
        w = struct.unpack_from(o + "d" * (2 * m), b, pos)
        return list(zip(w[0::2], w[1::2])), pos + 16 * m
    if typ == 2:
        pos -= 5
        return [linie(pos)[0]]
    n = struct.unpack_from(ordnung + "I", b, pos)[0]
    pos += 4
    raus = []
    for _ in range(n):
        z, pos = linie(pos)
        raus.append(z)
    return raus


def fluesse():
    gpkg = smv_laden()
    c = sqlite3.connect(gpkg)
    x0, y0, x1, y1 = RAHMEN
    raus = []
    for shape, name, lb in c.execute(
            "select SHAPE, NAME, LB1000 from T26_DKM1M_GEWAESSER_LIN where LB1000 >= ?", (FLUSS_AB_MM,)):
        for z in wkb_linien(shape):
            if not any(x0 <= e <= x1 and y0 <= n <= y1 for e, n in z):
                continue
            z = vereinfachen(z, TOLERANZ_FLUSS_M)
            if len(z) >= 2:
                eintrag = {"b": round(float(lb), 2), **kodieren(z)}
                if name:
                    eintrag["name"] = name
                raus.append(eintrag)
    return raus


def orte():
    """Ortsnamen mit Einwohnerklasse (1 = 2000-9999 … 5 = über 1 Million) und der
    Mitte ihrer Beschriftung auf der Landeskarte 1:1 Million"""
    c = sqlite3.connect(smv_laden())
    x0, y0, x1, y1 = RAHMEN
    # ein Name über zwei Zeilen («Oster-» / «mundigen») steht in zwei Zeilen der Quelle mit
    # derselben ORIG_FID; ANNOTEXT hat den ganzen Namen mit Zeilenumbruch. Die Zeilen
    # bleiben, wie die Landeskarte sie setzt: ob ein Bindestrich zum Namen gehört
    # (La Chaux-de-Fonds) oder nur trennt (Ostermundigen), sagt die Quelle nicht.
    teile = defaultdict(list)
    for shape, text, symbol, fid in c.execute(
            "select SHAPE, ANNOTEXT, Symbol, ORIG_FID from T03_DKM1M_ORTSCHAFT_PKT_ANNO"):
        if symbol in ORTE_KLASSEN[ORTE_AB_KLASSE:] and text:
            teile[fid].append((text, symbol, [p for z in wkb_linien(shape) for p in z]))
    raus = []
    for liste in teile.values():
        text, symbol, _ = liste[0]
        pts = [p for _, _, ps in liste for p in ps]
        e = sum(p[0] for p in pts) / len(pts)
        n = sum(p[1] for p in pts) / len(pts)
        if not (x0 <= e <= x1 and y0 <= n <= y1):
            continue
        la, lo = lv95_zu_wgs84(e, n)
        zeilen = [z.strip() for z in text.replace("\r\n", "\n").split("\n") if z.strip()]
        raus.append({"name": "\n".join(zeilen), "klasse": ORTE_KLASSEN.index(symbol) + 1,
                     "lage": [round(la, 5), round(lo, 5)]})
    return sorted(raus, key=lambda o: (-o["klasse"], o["name"]))


def hoehen_raster():
    """Mittlere Höhe je RASTER_M-Feld aus swissALTIRegio (Übersicht des COG, nur
    der Rahmen), einmal geladen und in data/raw gespeichert"""
    if ALTI.exists():
        z = np.load(ALTI)
        return z["h"], tuple(z["ursprung"])
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    with rasterio.open(ALTI_URL) as ds:
        fenster = from_bounds(*RAHMEN, transform=ds.transform)
        f = RASTER_M / ds.res[0]
        h = ds.read(1, window=fenster, out_shape=(int(fenster.height / f), int(fenster.width / f)),
                    resampling=Resampling.average)
    h = np.where(h > 10_000, np.nan, h)
    np.savez_compressed(ALTI, h=h, ursprung=np.array([RAHMEN[0], RAHMEN[3]]))
    return h, (RAHMEN[0], RAHMEN[3])


def hoehen():
    """Je Stufe die Flächen darüber als Höhenlinien (Marching Squares auf dem
    geglätteten Raster), Ringe für evenodd: Löcher ergeben sich von selbst"""
    from scipy.ndimage import gaussian_filter
    from skimage.measure import find_contours
    h, (e0, n0) = hoehen_raster()
    g = gaussian_filter(np.nan_to_num(h, nan=0.0), GLAETTEN)
    # ein Rand tiefer als jede Stufe, damit jede Linie geschlossen ist
    g = np.pad(g, 1, constant_values=-1000.0)
    raus = []
    for stufe in HOEHEN_STUFEN:
        ringe = []
        for c in find_contours(g, stufe):
            # Zeile, Spalte → Ost, Nord (Mitte der Zelle), ohne den Rand
            ring = [(e0 + (col - 1 + 0.5) * RASTER_M, n0 - (row - 1 + 0.5) * RASTER_M) for row, col in c]
            r = vereinfachen(ring, TOLERANZ_HOEHE_M)
            if len(r) >= 4 and flaeche(r) >= MIN_FLAECHE_M2:
                ringe.append(kodieren(r))
        raus.append({"ab_m": stufe, "ringe": ringe})
    return raus


def main():
    raus = {
        "quellen": ["BFS, generalisierte Gemeindegrenzen g1 (Stand 2026-01-01)",
                    "swisstopo, Swiss Map Vector 1000", "swisstopo, swissALTIRegio"],
        "geladen": date.today().isoformat(),
        "hinweis": "Nur zum Zeichnen: Ringe und Linien als [Breite, Länge] mal 100000, start und "
                   f"Differenzen d. Höhen gemittelt auf {RASTER_M} m und geglättet; keine Angaben. "
                   "orte: klasse 1 = 2000-9999 Einwohner, 2 = 10000-49999, 3 = 50000-99999, "
                   "4 = 100000-1000000, 5 = über 1 Million laut Quelle; lage = Mitte der Beschriftung; name mit \\n, wo die Landeskarte ihn auf zwei Zeilen setzt.",
        **grenzen(),
        "fluesse": fluesse(),
        "orte": orte(),
        "hoehen": hoehen(),
    }
    ZIEL.write_text(json.dumps(raus, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"kartengrund.json: {ZIEL.stat().st_size / 1024:.0f} KB; Kantone {len(raus['kanton'])} Ringe, "
          f"Flüsse {len(raus['fluesse'])}, Höhen " + ", ".join(f"{s['ab_m']} m: {len(s['ringe'])}" for s in raus["hoehen"]))


if __name__ == "__main__":
    main()
