"""Nahbild: das Luftbild schärfer, nur entlang der Bahnlinien (Michael, 2026-10-10: «die Landschaft ist
sehr verschwommen … die Umgebung müsste nicht so weit von der Strecke entfernt abgebildet werden»).

SWISSIMAGE 10 cm von swisstopo, in der Fassung mit 2 m pro Bildpunkt (dieselben Kacheln wie
build_luftbild.py), auf 2,5 m gemittelt: je Kilometer ein JPEG von 400 × 400 Bildpunkten, Zeilen von
Norden nach Süden, Name «Ost-km_Nord-km» wie bei swisstopo. Nur Kilometer, die höchstens NAH_M neben
einer Bahnlinie liegen, und darin nur die Bildpunkte bis NAH_M neben der Linie; der Rest ist weiss und
in der App durchsichtig (ohneLeeres in src/gelaende.ts), dort bleibt das Luftbild von build_luftbild.py.
Die Linien sind die Bahnlinien aus swissTLMRegio in data/kartenlinien.json. Nur in den
10-km-Kacheln, für die es ein Luftbild gibt.

Je Kilometer der neueste Jahrgang; index.json hält ihn je Kilometer fest. Die 2-m-Rohbilder werden
gleich wieder gelöscht. Was schon gebaut ist, bleibt; ein abgebrochener Lauf geht beim nächsten weiter.

    .venv/bin/python pipeline/build_luftbild_nah.py            # alle, Stunden
    .venv/bin/python pipeline/build_luftbild_nah.py --zaehlen  # nur zählen, was dazugehört
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
import build_luftbild  # noqa: E402
from build_relief import wgs84_zu_lv95  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "luftbild_nah"
#: Bildpunkte je Kilometer: 2,5 m
JE_KM = 400
#: so weit neben einer Bahnlinie gehört ein Kilometer dazu
NAH_M = 500


def linien():
    """die Bahnlinien aus swissTLMRegio, je Linie [(Ost, Nord)]"""
    d = json.loads((ROOT / "data" / "kartenlinien.json").read_text(encoding="utf-8"))
    for z in d["bahnlinien"]:
        la, lo = z["start"]
        pts = [wgs84_zu_lv95(la / 1e5, lo / 1e5)]
        for i in range(0, len(z["d"]), 2):
            la += z["d"][i]; lo += z["d"][i + 1]
            pts.append(wgs84_zu_lv95(la / 1e5, lo / 1e5))
        yield pts


def kilometer():
    """{(km Ost, km Nord): [Strecken (e0, n0, e1, n1) bis NAH_M daneben]}, in Kacheln mit Luftbild"""
    mit_bild = set(json.loads((ROOT / "data" / "luftbild" / "index.json").read_text(encoding="utf-8"))["kacheln"])
    raus = {}
    for pts in linien():
        for (e0, n0), (e1, n1) in zip(pts, pts[1:]):
            for ke in range(int(min(e0, e1) - NAH_M) // 1000, int(max(e0, e1) + NAH_M) // 1000 + 1):
                for kn in range(int(min(n0, n1) - NAH_M) // 1000, int(max(n0, n1) + NAH_M) // 1000 + 1):
                    if f"{ke // 10}_{kn // 10}" in mit_bild and abstand(e0, n0, e1, n1, ke, kn).min() <= NAH_M:
                        raus.setdefault((ke, kn), []).append((e0, n0, e1, n1))
    return raus


def abstand(e0, n0, e1, n1, ke, kn, je_km=8):
    """Abstand jedes Bildpunkts eines Kilometers (je_km × je_km, Zeilen von Norden) zur Strecke"""
    s = (np.arange(je_km) + 0.5) * 1000 / je_km
    e, n = np.meshgrid(ke * 1000 + s, (kn + 1) * 1000 - s)
    de, dn = e1 - e0, n1 - n0
    t = np.clip(((e - e0) * de + (n - n0) * dn) / ((de * de + dn * dn) or 1), 0, 1)
    return np.hypot(e - e0 - t * de, n - n0 - t * dn)


def km_bauen(ke, kn, href, strecken):
    datei = build_luftbild.laden(href)
    try:
        with rasterio.open(datei) as d:
            a = np.transpose(d.read([1, 2, 3], out_shape=(3, JE_KM, JE_KM), resampling=Resampling.average), (1, 2, 0))
        nah = np.zeros((JE_KM, JE_KM), bool)
        for st in strecken:
            nah |= abstand(*st, ke, kn, JE_KM) <= NAH_M
        # weiter weg weiss: in der App durchsichtig, und das JPEG bleibt klein
        a = np.where(nah[..., None], np.minimum(a, 245), 255).astype(np.uint8)
        Image.fromarray(a).save(ZIEL / f"{ke}_{kn}.jpg", quality=72, optimize=True, progressive=True)
    finally:
        datei.unlink(missing_ok=True)


def main():
    km = kilometer()
    print(f"{len(km)} Kilometer höchstens {NAH_M} m neben einer Bahnlinie")
    if "--zaehlen" in sys.argv:
        return
    nur = [a for a in sys.argv[1:] if not a.startswith("--")]
    if nur:
        # zum Ausprobieren: nur diese 10-km-Kacheln, etwa 260_120
        km = {k: v for k, v in km.items() if f"{k[0] // 10}_{k[1] // 10}" in nur}
    ZIEL.mkdir(parents=True, exist_ok=True)
    index_datei = ZIEL / "index.json"
    jahre = json.loads(index_datei.read_text(encoding="utf-8"))["km"] if index_datei.exists() else {}
    zehner = sorted({(ke // 10, kn // 10) for ke, kn in km})
    for nr, (ex, ny) in enumerate(zehner, 1):
        offen = [(ke, kn) for ke, kn in km if ke // 10 == ex and kn // 10 == ny and not (ZIEL / f"{ke}_{kn}.jpg").exists()]
        if not offen:
            continue
        quelle = build_luftbild.km_kacheln(ex, ny)
        auftraege = [(ke, kn, quelle[(ke, kn)]) for ke, kn in offen if (ke, kn) in quelle]
        with ThreadPoolExecutor(16) as pool:
            list(pool.map(lambda a: km_bauen(a[0], a[1], a[2][1], km[(a[0], a[1])]), auftraege))
        for ke, kn, (jahr, _) in auftraege:
            jahre[f"{ke}_{kn}"] = jahr
        # erst ganz schreiben, dann umbenennen: ein Abbruch lässt kein halbes index.json zurück
        teil = index_datei.with_suffix(".teil")
        teil.write_text(json.dumps({
            "quelle": "SWISSIMAGE 10 cm (swisstopo), Fassung 2 m, auf 2,5 m gemittelt",
            "geladen": date.today().isoformat(), "je_km": JE_KM, "nah_m": NAH_M,
            "hinweis": "nur Kilometer höchstens nah_m neben einer Bahnlinie aus swissTLMRegio; je Kilometer der neueste Jahrgang",
            "km": dict(sorted(jahre.items())),
        }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        teil.replace(index_datei)
        print(f"{nr}/{len(zehner)} {ex}_{ny}: {len(auftraege)} km", flush=True)


if __name__ == "__main__":
    main()
