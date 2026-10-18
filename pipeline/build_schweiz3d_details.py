"""Details für «3D Schweiz» auf daten.taktland.ch (Michael, 2026-10-19: «Lade noch mehr Detailkarten für Schweiz 3D»): für
jeden Kilometer der Schweiz, nicht nur entlang der Bahnlinien, das Luftbild auf 2,5 m und das Gelände auf 10 m.

Dieselben Quellen und Formate wie das Nahbild (build_luftbild_nah.py, SWISSIMAGE 10 cm in der Fassung 2 m) und das feine
Gelände (build_gelaende_nah.py, swissALTI3D in der Fassung 2 m), aber ohne weissen Rand: je Kilometer ein JPEG von
400 × 400 Bildpunkten und eine .hgz mit 100 × 100 Höhen. Für die App sind das rund 2 GB, mehr als GitHub Pages trägt;
darum liegen sie in data/schweiz3d_extern (nicht in Git), der Workflow «3D Schweiz Details» packt sie ins Release
«schweiz3d-1», und server/daten/holen.php holt sie nach daten.taktland.ch/schweiz3d/.

Die Kilometer sind die, für die swisstopo ein Bild oder eine Höhe hat, in den 10-km-Kacheln mit Luftbild
(data/luftbild/index.json); geteilt nach diesen Kacheln in gleich grosse Teile. Was schon gebaut ist, bleibt.

    .venv/bin/python pipeline/build_schweiz3d_details.py --teil 3/8
    .venv/bin/python pipeline/build_schweiz3d_details.py 260_120   # nur diese 10-km-Kacheln, zum Ausprobieren
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_gelaende_nah  # noqa: E402
import build_luftbild  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "schweiz3d_extern"
BILD_JE_KM = 400
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
           GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="3")


def lesen(href, farbig, seite):
    for _ in range(4):
        try:
            with rasterio.Env(**ENV), rasterio.open("/vsicurl/" + href) as d:
                if farbig:
                    return d.read([1, 2, 3], out_shape=(3, seite, seite), resampling=Resampling.average)
                return d.read(1, out_shape=(seite, seite), resampling=Resampling.average)
        except rasterio.errors.RasterioIOError:
            continue
    return None


def bild_bauen(ke, kn, href):
    a = lesen(href, True, BILD_JE_KM)
    if a is None:
        return False
    Image.fromarray(np.transpose(a, (1, 2, 0)).astype(np.uint8)).save(ZIEL / f"{ke}_{kn}.jpg", quality=72, optimize=True,
                                                                       progressive=True)
    return True


def hoehe_bauen(ke, kn, href):
    h = lesen(href, False, build_gelaende_nah.JE_KM)
    if h is None:
        return False
    (ZIEL / f"{ke}_{kn}.hgz").write_bytes(build_gelaende_nah.packen(h))
    return True


def main():
    argv = sys.argv[1:]
    zehner = sorted(tuple(map(int, n.split("_"))) for n in
                    json.loads((ROOT / "data" / "luftbild" / "index.json").read_text(encoding="utf-8"))["kacheln"])
    if argv[:1] == ["--teil"]:
        teil, teile = map(int, argv[1].split("/"))
        zehner = zehner[(teil - 1) * len(zehner) // teile:teil * len(zehner) // teile]
    elif argv:
        zehner = [z for z in zehner if f"{z[0]}_{z[1]}" in argv]
    ZIEL.mkdir(parents=True, exist_ok=True)
    index_datei = ZIEL / "index.json"
    kacheln = json.loads(index_datei.read_text(encoding="utf-8"))["kacheln"] if index_datei.exists() else {}
    for nr, (ex, ny) in enumerate(zehner, 1):
        bilder = {k: v for k, v in build_luftbild.km_kacheln(ex, ny).items() if not (ZIEL / f"{k[0]}_{k[1]}.jpg").exists()}
        hoehen = {k: v for k, v in build_gelaende_nah.km_quellen(ex, ny).items() if not (ZIEL / f"{k[0]}_{k[1]}.hgz").exists()}
        with ThreadPoolExecutor(16) as pool:
            ok_b = list(pool.map(lambda kv: bild_bauen(*kv[0], kv[1][1]), bilder.items()))
            ok_h = list(pool.map(lambda kv: hoehe_bauen(*kv[0], kv[1][1]), hoehen.items()))
        for ((ke, kn), (jahr, _)), gut in zip(bilder.items(), ok_b):
            if gut:
                kacheln.setdefault(f"{ke}_{kn}", [None, None])[0] = jahr
        for ((ke, kn), (jahr, _)), gut in zip(hoehen.items(), ok_h):
            if gut:
                kacheln.setdefault(f"{ke}_{kn}", [None, None])[1] = jahr
        teil_datei = index_datei.with_suffix(".teil")
        teil_datei.write_text(json.dumps({
            "quelle_bild": "SWISSIMAGE 10 cm (swisstopo), Fassung 2 m, auf 2,5 m gemittelt",
            "quelle_hoehe": "swissALTI3D (swisstopo), Fassung 2 m, auf 10 m gemittelt",
            "geladen": date.today().isoformat(), "bild_je_km": BILD_JE_KM, "hoehe_je_km": build_gelaende_nah.JE_KM,
            "strecken": [],
            "hinweis": "je Kilometer: Jahr des Bilds, Jahr der Höhe (null: fehlt); Höhen wie data/gelaende_nah in Dezimetern",
            "kacheln": dict(sorted(kacheln.items())),
        }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        teil_datei.replace(index_datei)
        print(f"{nr}/{len(zehner)} {ex}_{ny}: {sum(ok_b)} Bilder, {sum(ok_h)} Höhen", flush=True)


if __name__ == "__main__":
    main()
