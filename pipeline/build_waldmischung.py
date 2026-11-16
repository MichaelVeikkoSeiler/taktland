"""
Waldmischungsgrad für die Bäume in «3D Schweiz» und im Führerstand (Michael, 2026-11-16: «Stimmt eigentlich das Waldverhältnis Tannen und
Laubwald? Wenn du dort eine Quelle hast, kannst du diese gerne berücksichtigen»): Waldmischungsgrad LFI des BAFU
(ch.bafu.landesforstinventar-waldmischungsgrad, data.geo.admin.ch, Stand 2023-10-31), modelliert aus Sentinel-1 und -2 mit maschinellem
Lernen, je Zelle von 10 m der Anteil Laubbäume an den sichtbaren Kronen in Prozent, für alle Bestockungen; laut Quelle kann er vom
Mischungsgrad der Stichproben des Landesforstinventars abweichen.

Hier auf 50 m gemittelt (nur Zellen mit Angabe), in den 10-km-Kacheln des Geländes. Je Kachel eine .mgz (gzip): 200 × 200 UInt8, Laubanteil
0 bis 100 (Zeilen von Norden), 255 ohne Angabe.

    .venv/bin/python pipeline/build_waldmischung.py    # lädt die Datei einmal (171 MB) nach data/raw, vor export_app
"""
import gzip
import json
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "waldmischung"
QUELLE = ("https://data.geo.admin.ch/ch.bafu.landesforstinventar-waldmischungsgrad/landesforstinventar-waldmischungsgrad/"
          "landesforstinventar-waldmischungsgrad_2056.tif")
ROH = ROOT / "data" / "raw" / "waldmischungsgrad_2056.tif"
KACHEL_M, RASTER_M, QUELLE_M = 10_000, 50, 10
ZELLEN = KACHEL_M // RASTER_M
FAKTOR = RASTER_M // QUELLE_M
KEIN = 255


def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    if not ROH.exists():
        ROH.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(QUELLE, ROH)
    namen = []
    with rasterio.open(ROH) as d:
        t = d.transform
        x0, y0 = round(t.c), round(t.f)
        assert round(t.a) == QUELLE_M and round(-t.e) == QUELLE_M and x0 % KACHEL_M == 0 and y0 % KACHEL_M == 0
        je = KACHEL_M // QUELLE_M
        for ty in range(d.height // je):
            for tx in range(d.width // je):
                a = d.read(1, window=Window(tx * je, ty * je, je, je)).astype(np.int16)
                gueltig = (a >= 0) & (a <= 100)
                if not gueltig.any():
                    continue
                g = gueltig.reshape(ZELLEN, FAKTOR, ZELLEN, FAKTOR)
                summe = np.where(gueltig, a, 0).reshape(ZELLEN, FAKTOR, ZELLEN, FAKTOR).sum(axis=(1, 3))
                zahl = g.sum(axis=(1, 3))
                werte = np.where(zahl > 0, np.round(summe / np.maximum(zahl, 1)), KEIN).astype(np.uint8)
                ex = (x0 + tx * KACHEL_M) // KACHEL_M
                ny = (y0 - (ty + 1) * KACHEL_M) // KACHEL_M
                name = f"{ex}_{ny}"
                (ZIEL / f"{name}.mgz").write_bytes(gzip.compress(werte.tobytes(), 9))
                namen.append(name)
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "Waldmischungsgrad LFI, BAFU (ch.bafu.landesforstinventar-waldmischungsgrad), Stand 2023-10-31",
        "geladen": date.today().isoformat(),
        "kachel_m": KACHEL_M, "raster_m": RASTER_M, "ohne": KEIN,
        "kacheln": sorted(namen),
    }, ensure_ascii=False) + "\n", encoding="utf-8")
    groesse = sum(f.stat().st_size for f in ZIEL.glob("*.mgz"))
    print(f"waldmischung: {len(namen)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
