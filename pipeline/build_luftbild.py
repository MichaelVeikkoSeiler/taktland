"""Luftbild für das Gelände in 3D (Michael, 2026-10-06: «die Landschaft ist leer»).

SWISSIMAGE 10 cm von swisstopo, in der Fassung mit 2 m pro Bildpunkt (je Kachel von 1 km auf
data.geo.admin.ch), auf 10 m gemittelt und in dasselbe 10-km-Raster gelegt wie die Geländekacheln
(build_gelaende.py): je Kachel ein JPEG von 1000 × 1000 Bildpunkten, Zeilen von Norden nach Süden.

Je Kilometer der neueste Jahrgang; welche Jahre in einer Kachel stecken, hält index.json fest.
Wo swisstopo keine Kachel hat (Ausland), bleibt das Bild leer (weiss), und die App zeigt dort
die Farben des Geländes.

Die 2-m-Kacheln landen in data/raw/swissimage/ (nicht in Git) und werden nur einmal geladen.

    .venv/bin/python pipeline/build_luftbild.py albula        # die Kacheln einer Bergstrecke
    .venv/bin/python pipeline/build_luftbild.py --orte Gümmenen Müntschemier   # rund um Bahnhöfe

Mit --orte alle Kacheln, die höchstens FAHRT_RAND_M neben dem Rechteck um die genannten Bahnhöfe
liegen (Namen wie in data/strecken.json): so viel zeigt «3D» beim Fahren um den Zug.
"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "luftbild"
ROH = ROOT / "data" / "raw" / "swissimage"
STAC = "https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissimage-dop10/items"

KACHEL_M = 10_000
#: Bildpunkte je Kachel: 10 m
PIXEL = 1000
#: je Kilometer so viele Bildpunkte
JE_KM = PIXEL * 1000 // KACHEL_M


def lv95_zu_wgs84(e, n):
    """Näherungsformel von swisstopo, auf etwa einen Meter genau"""
    y, x = (e - 2_600_000) / 1e6, (n - 1_200_000) / 1e6
    lam = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    phi = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3
    return phi * 100 / 36, lam * 100 / 36


def holen(url):
    return json.loads(subprocess.run(["curl", "-sf", "--retry", "3", url], capture_output=True, check=True).stdout)


def km_kacheln(ex, ny):
    """{(km Ost, km Nord): (Jahr, URL der 2-m-Fassung)} in einer 10-km-Kachel, je km der neueste Jahrgang"""
    e0, n0 = ex * KACHEL_M, ny * KACHEL_M
    la0, lo0 = lv95_zu_wgs84(e0 - 500, n0 - 500)
    la1, lo1 = lv95_zu_wgs84(e0 + KACHEL_M + 500, n0 + KACHEL_M + 500)
    url = f"{STAC}?bbox={min(lo0, lo1)},{min(la0, la1)},{max(lo0, lo1)},{max(la0, la1)}&limit=100"
    raus = {}
    while url:
        d = holen(url)
        for f in d["features"]:
            _, jahr, km = f["id"].rsplit("_", 2)
            ke, kn = (int(x) for x in km.split("-"))
            if not (e0 // 1000 <= ke < (e0 + KACHEL_M) // 1000 and n0 // 1000 <= kn < (n0 + KACHEL_M) // 1000):
                continue
            href = next((a["href"] for a in f["assets"].values() if a.get("eo:gsd") == 2.0), None)
            if href and (ke, kn) not in raus or href and int(jahr) > raus[(ke, kn)][0]:
                raus[(ke, kn)] = (int(jahr), href)
        url = next((l["href"] for l in d["links"] if l["rel"] == "next"), None)
    return raus


def laden(href):
    datei = ROH / href.rsplit("/", 1)[1]
    if not datei.exists():
        ROH.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "-sf", "--retry", "3", "-o", str(datei), href], check=True)
    return datei


def kachel_bauen(ex, ny):
    km = km_kacheln(ex, ny)
    bild = np.full((PIXEL, PIXEL, 3), 255, np.uint8)
    with ThreadPoolExecutor(16) as pool:
        dateien = dict(zip(km, pool.map(laden, [h for _, h in km.values()])))
    for (ke, kn), datei in dateien.items():
        with rasterio.open(datei) as d:
            a = d.read([1, 2, 3], out_shape=(3, JE_KM, JE_KM), resampling=Resampling.average)
        i0 = (ke - ex * KACHEL_M // 1000) * JE_KM
        j0 = ((ny + 1) * KACHEL_M // 1000 - kn - 1) * JE_KM
        bild[j0:j0 + JE_KM, i0:i0 + JE_KM] = np.transpose(a, (1, 2, 0))
    ZIEL.mkdir(parents=True, exist_ok=True)
    Image.fromarray(bild).save(ZIEL / f"{ex}_{ny}.jpg", quality=78, optimize=True, progressive=True)
    jahre = sorted({j for j, _ in km.values()})
    return {"jahre": jahre, "km": len(km)}


def kacheln_fuer(name):
    r = json.loads((ROOT / "data" / "relief" / f"{name}.json").read_text(encoding="utf-8"))["raster"]
    e0, n1 = r["ost"], r["nord"]
    e1, n0 = e0 + r["breite"] * r["m"], n1 - r["hoehe"] * r["m"]
    return [(ex, ny) for ex in range(e0 // KACHEL_M, (e1 - 1) // KACHEL_M + 1)
            for ny in range(n0 // KACHEL_M, (n1 - 1) // KACHEL_M + 1)]


#: halbe Seite des Ausschnitts beim Fahren (FENSTER_M in komponenten/Relief.tsx)
FAHRT_RAND_M = 15_000


def kacheln_um_orte(orte):
    import build_relief
    d = json.loads((ROOT / "data" / "strecken.json").read_text(encoding="utf-8"))
    lage = {name: d["lagen"][abk] for abk, name in d["punkte"].items() if abk in d["lagen"]}
    fehlt = [o for o in orte if o not in lage]
    if fehlt:
        raise SystemExit(f"nicht im Netz: {', '.join(fehlt)}")
    pts = [build_relief.wgs84_zu_lv95(*lage[o]) for o in orte]
    e0, e1 = min(e for e, _ in pts) - FAHRT_RAND_M, max(e for e, _ in pts) + FAHRT_RAND_M
    n0, n1 = min(n for _, n in pts) - FAHRT_RAND_M, max(n for _, n in pts) + FAHRT_RAND_M
    return [(ex, ny) for ex in range(int(e0) // KACHEL_M, int(e1) // KACHEL_M + 1)
            for ny in range(int(n0) // KACHEL_M, int(n1) // KACHEL_M + 1)]


def main():
    args = sys.argv[1:] or ["albula"]
    if args[0] == "--orte":
        gruppen = [kacheln_um_orte(args[1:])]
    else:
        gruppen = [kacheln_fuer(name) for name in args]
    ix_datei = ZIEL / "index.json"
    ix = json.loads(ix_datei.read_text(encoding="utf-8")) if ix_datei.exists() else {"kacheln": {}}
    for kacheln in gruppen:
        for ex, ny in kacheln:
            k = f"{ex}_{ny}"
            if k in ix["kacheln"] and (ZIEL / f"{k}.jpg").exists():
                continue
            info = kachel_bauen(ex, ny)
            ix["kacheln"][k] = info
            print(f"{k}: {info['km']} km², Jahre {info['jahre']}, {(ZIEL / f'{k}.jpg').stat().st_size / 1024:.0f} KB")
    ix.update({
        "quelle": "SWISSIMAGE 10 cm, Bundesamt für Landestopografie swisstopo, gemittelt auf 10 m",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "pixel": PIXEL,
        "hinweis": "Je Kilometer der neueste Jahrgang; die Jahre je Kachel stehen bei der Kachel.",
    })
    ix_datei.write_text(json.dumps(ix, ensure_ascii=False, indent=0), encoding="utf-8")
    gesamt = sum(p.stat().st_size for p in ZIEL.glob("*.jpg"))
    print(f"{len(ix['kacheln'])} Kacheln, {gesamt / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
