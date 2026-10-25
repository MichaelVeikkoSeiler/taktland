"""
Felsoberfläche für die Wände von «3D Schweiz» (Michael, 2026-10-25: «über den geologischen Untergrund … damit auch die Wände
entsprechend realistisch sind»): swissBEDROCK von swisstopo, das Höhenmodell der Felsoberfläche unter dem Lockergestein (Band BEM,
10 m, in m ü. M.), hier auf 50 m gemittelt in die 10-km-Kacheln des Geländes (data/gelaende). In der Wand liegt dann zwischen der
Oberfläche des Modells und dem Fels das Lockergestein.

Je Kachel eine .fgz (gzip): 200 × 200 Int16, Höhe des Felses in m ü. M. (Zeilen von Norden), -32768 ohne Angabe.

    .venv/bin/python pipeline/build_fels.py         # alle 370 Kacheln, liest über das Netz nur das Band BEM, etwa eine halbe Stunde
"""
import gzip
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "fels"
STAC = "https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.geologie-swissbedrock/items?limit=100"
KACHEL_M, RASTER_M = 10_000, 50
ZELLEN = KACHEL_M // RASTER_M
KEIN = -32768


def eintraege():
    url, alle = STAC, []
    while url:
        d = json.load(urllib.request.urlopen(url, timeout=60))
        for f in d["features"]:
            href = next(a["href"] for a in f["assets"].values() if a["href"].endswith(".tif"))
            alle.append(href)
        url = next((l["href"] for l in d["links"] if l["rel"] == "next"), None)
    return alle


def eine(href):
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="4",
                      GDAL_HTTP_RETRY_DELAY="2"):
        with rasterio.open("/vsicurl/" + href) as d:
            b = d.bounds
            if round(b.right - b.left) != KACHEL_M or round(b.top - b.bottom) != KACHEL_M:
                raise ValueError(f"unerwartete Grösse {b}")
            a = d.read(1, out_shape=(ZELLEN, ZELLEN), resampling=Resampling.average, masked=True)
            ex, ny = int(round(b.left)) // KACHEL_M, int(round(b.bottom)) // KACHEL_M
    werte = np.where(np.ma.getmaskarray(a) | (a.filled(-9999) <= -9000), KEIN, np.round(a.filled(0))).astype("<i2")
    if (werte != KEIN).sum() == 0:
        return None
    name = f"{ex}_{ny}"
    (ZIEL / f"{name}.fgz").write_bytes(gzip.compress(werte.tobytes(), 9))
    return name


def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    hrefs = eintraege()
    print(len(hrefs), "Kacheln", flush=True)
    kacheln = []
    with ThreadPoolExecutor(8) as ex:
        for i, name in enumerate(ex.map(eine, hrefs)):
            if name:
                kacheln.append(name)
            if i % 20 == 0:
                print(i, flush=True)
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissBEDROCK, Bundesamt für Landestopografie swisstopo, Felsoberfläche (BEM), auf 50 m gemittelt",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "raster_m": RASTER_M, "zellen": ZELLEN,
        "hinweis": "Int16, Höhe der Felsoberfläche in m ü. M., Zeilen von Norden, -32768 ohne Angabe",
        "kacheln": sorted(kacheln),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(kacheln), "Kacheln nach", ZIEL.relative_to(ROOT))


if __name__ == "__main__":
    main()
