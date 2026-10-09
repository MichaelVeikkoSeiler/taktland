"""Feines Gelände entlang der Bahnlinien, für die Sicht aus dem Führerstand (Michael, 2026-10-10: «die nähere
Umgebung in maximaler Qualität … nur 1 bis 2 km um die Strecke»).

swissALTI3D von swisstopo, in der Fassung mit 2 m je Kilometer (Cloud Optimized GeoTIFF auf data.geo.admin.ch),
auf 10 m gemittelt: je Kilometer 100 × 100 Höhen, Zeilen von Norden nach Süden, in Dezimetern. Dieselben Kilometer
wie das Nahbild (build_luftbild_nah.py): höchstens NAH_M neben einer Bahnlinie aus swissTLMRegio. Gelesen wird nur
die verkleinerte Fassung im GeoTIFF, nicht die ganze Kachel.

Gespeichert wie das grobe Gelände (build_gelaende.py) als .hgz: vorne die tiefste Höhe der Kachel in Dezimetern
(Int32), dann je Zeile die Differenz zum linken Nachbarn über dieser Höhe (Int16), gepackt mit gzip.
index.json hält je Kilometer das Jahr der Aufnahme fest. Was schon gebaut ist, bleibt.

    .venv/bin/python pipeline/build_gelaende_nah.py
"""
import gzip
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_luftbild  # noqa: E402
import build_luftbild_nah  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "gelaende_nah"
STAC = "https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items"
#: Höhen je Kilometer und Seite: 10 m
JE_KM = 100


def km_quellen(ex, ny):
    """{(km Ost, km Nord): (Jahr, URL der 2-m-Fassung)} in einer 10-km-Kachel, je km der neueste Jahrgang"""
    e0, n0 = ex * 10_000, ny * 10_000
    la0, lo0 = build_luftbild.lv95_zu_wgs84(e0 - 500, n0 - 500)
    la1, lo1 = build_luftbild.lv95_zu_wgs84(e0 + 10_500, n0 + 10_500)
    url = f"{STAC}?bbox={min(lo0, lo1)},{min(la0, la1)},{max(lo0, lo1)},{max(la0, la1)}&limit=100"
    raus = {}
    while url:
        d = build_luftbild.holen(url)
        for f in d["features"]:
            _, jahr, km = f["id"].rsplit("_", 2)
            ke, kn = (int(x) for x in km.split("-"))
            if not (ex * 10 <= ke < ex * 10 + 10 and ny * 10 <= kn < ny * 10 + 10):
                continue
            href = next((a["href"] for a in f["assets"].values()
                         if a.get("eo:gsd") == 2.0 and a.get("type", "").startswith("image/tiff")), None)
            if href and ((ke, kn) not in raus or int(jahr) > raus[(ke, kn)][0]):
                raus[(ke, kn)] = (int(jahr), href)
        url = next((l["href"] for l in d["links"] if l["rel"] == "next"), None)
    return raus


def packen(h):
    dm = np.round(h * 10).astype(np.int32)
    tief = int(dm.min())
    d = np.diff(dm - tief, axis=1, prepend=0)
    return gzip.compress(np.int32(tief).tobytes() + d.astype("<i2").tobytes(), 9, mtime=0)


def km_bauen(ke, kn, href):
    for versuch in range(4):
        try:
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                              GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="3"):
                with rasterio.open("/vsicurl/" + href) as d:
                    h = d.read(1, out_shape=(JE_KM, JE_KM), resampling=Resampling.average)
            (ZIEL / f"{ke}_{kn}.hgz").write_bytes(packen(h))
            return True
        except rasterio.errors.RasterioIOError:
            continue
    return False


def main():
    km = build_luftbild_nah.kilometer()
    print(f"{len(km)} Kilometer höchstens {build_luftbild_nah.NAH_M} m neben einer Bahnlinie")
    ZIEL.mkdir(parents=True, exist_ok=True)
    index_datei = ZIEL / "index.json"
    jahre = json.loads(index_datei.read_text(encoding="utf-8"))["km"] if index_datei.exists() else {}
    zehner = sorted({(ke // 10, kn // 10) for ke, kn in km})
    for nr, (ex, ny) in enumerate(zehner, 1):
        offen = [(ke, kn) for ke, kn in km if ke // 10 == ex and kn // 10 == ny and not (ZIEL / f"{ke}_{kn}.hgz").exists()]
        if not offen:
            continue
        quelle = km_quellen(ex, ny)
        auftraege = [(ke, kn, quelle[(ke, kn)]) for ke, kn in offen if (ke, kn) in quelle]
        with ThreadPoolExecutor(16) as pool:
            ok = list(pool.map(lambda a: km_bauen(a[0], a[1], a[2][1]), auftraege))
        for (ke, kn, (jahr, _)), gut in zip(auftraege, ok):
            if gut:
                jahre[f"{ke}_{kn}"] = jahr
        teil = index_datei.with_suffix(".teil")
        teil.write_text(json.dumps({
            "quelle": "swissALTI3D (swisstopo), Fassung 2 m, auf 10 m gemittelt",
            "geladen": date.today().isoformat(), "je_km": JE_KM, "nah_m": build_luftbild_nah.NAH_M,
            "hinweis": "nur Kilometer höchstens nah_m neben einer Bahnlinie aus swissTLMRegio; Höhen in Dezimetern",
            "km": dict(sorted(jahre.items())),
        }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        teil.replace(index_datei)
        print(f"{nr}/{len(zehner)} {ex}_{ny}: {sum(ok)} km", flush=True)


if __name__ == "__main__":
    main()
