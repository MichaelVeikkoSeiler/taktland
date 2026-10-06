"""Gelände der ganzen Schweiz in Kacheln, für «3D» auf jeder Fahrt.

Michael, 2026-10-06: «dass man alle Strecken optional 3D darstellen könnte und bekannte
Bergstrecken zusätzlich irgendwo an einem passenden Ort abrufbar wären». Ein Relief je
Strecke (build_relief.py) reicht dafür nicht; hier entsteht ein Gelände für das ganze Netz,
das die App beim Fahren nur rund um den Zug lädt.

Kacheln von 10 km auf 10 km, Höhen aus swissALTIRegio (swisstopo) auf 50 m gemittelt, also
200 × 200 Felder, Zeilen von Norden nach Süden, ganze Meter. Alle Kacheln, die die Schweiz
(Landesgrenze aus kartengrund.json) mit 5 km Rand berühren, dazu die höchstens 3 km neben einer
Bahnlinie (SBB-Linien aus strecken_geometrie.json, andere Bahnen aus dem Schienennetz des BAV),
damit auch Strecken über die Grenze Gelände haben. So hat die Ansicht rund um den Zug keine Löcher.

Gespeichert je Zeile als Differenz zum linken Nachbarn (Int16, das erste Feld als Höhe),
gepackt mit gzip: so halb so gross wie roh. Die Endung .hgz, damit kein Server die Datei
selbst entpackt; die App entpackt mit DecompressionStream.

    .venv/bin/python pipeline/build_gelaende.py
"""
import gzip
import json
from datetime import date
from pathlib import Path

import numpy as np

import build_relief
import schienennetz

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "gelaende"

KACHEL_M = 10_000
RASTER_M = 50
ZELLEN = KACHEL_M // RASTER_M
#: so weit neben einer Bahnlinie muss eine Kachel noch da sein
NEBEN_M = 3_000
#: so viele Kacheln je Seite werden auf einmal gelesen
BLOCK = 10


def bahnpunkte():
    pts = []
    for nr in json.loads((ROOT / "data" / "strecken_geometrie.json").read_text(encoding="utf-8"))["linien"]:
        pts += [(x, y) for _, x, y in build_relief.linie_punkte(nr)]
    linien, _ = schienennetz.je_linie()
    for l in linien.values():
        for seg in l["segmente"]:
            pts += [build_relief.wgs84_zu_lv95(la, lo) for la, lo in seg["zug"]]
    return pts


def kacheln_am_netz():
    raus = set()
    for x, y in bahnpunkte():
        for dx in (-NEBEN_M, 0, NEBEN_M):
            for dy in (-NEBEN_M, 0, NEBEN_M):
                raus.add((int((x + dx) // KACHEL_M), int((y + dy) // KACHEL_M)))
    return sorted(raus)


#: so weit über die Landesgrenze hinaus
RAND_M = 5_000


def kacheln_im_land():
    """Kacheln, die die Schweiz mit RAND_M Rand berühren: die Landesfläche auf 1 km gerastert"""
    from scipy.ndimage import binary_dilation
    from skimage.draw import polygon
    land = json.loads((ROOT / "data" / "kartengrund.json").read_text(encoding="utf-8"))["land"]
    e0, n0, e1, n1 = 2_400_000, 1_000_000, 2_900_000, 1_350_000
    raster = np.zeros(((n1 - n0) // 1000, (e1 - e0) // 1000), bool)
    for z in land:
        la, lo = z["start"]
        pts = [build_relief.wgs84_zu_lv95(la / 1e5, lo / 1e5)]
        for i in range(0, len(z["d"]), 2):
            la, lo = la + z["d"][i], lo + z["d"][i + 1]
            pts.append(build_relief.wgs84_zu_lv95(la / 1e5, lo / 1e5))
        zeilen = [(n1 - y) / 1000 for _, y in pts]
        spalten = [(x - e0) / 1000 for x, _ in pts]
        rr, cc = polygon(zeilen, spalten, raster.shape)
        raster[rr, cc] ^= True
    raster = binary_dilation(raster, iterations=RAND_M // 1000)
    raus = set()
    for j, i in zip(*np.nonzero(raster)):
        raus.add(((e0 + i * 1000) // KACHEL_M, (n1 - (j + 1) * 1000) // KACHEL_M))
    return raus


def packen(h):
    d = np.diff(h.astype(np.int32), axis=1, prepend=0)
    d[:, 0] = h[:, 0]
    return gzip.compress(d.astype("<i2").tobytes(), 9, mtime=0)


def main():
    kacheln = sorted(set(kacheln_am_netz()) | kacheln_im_land())
    print(f"{len(kacheln)} Kacheln")
    ZIEL.mkdir(parents=True, exist_ok=True)
    bloecke = sorted({(ex // BLOCK, ny // BLOCK) for ex, ny in kacheln})
    gesamt = 0
    for bx, by in bloecke:
        rahmen = (bx * BLOCK * KACHEL_M, by * BLOCK * KACHEL_M, (bx + 1) * BLOCK * KACHEL_M, (by + 1) * BLOCK * KACHEL_M)
        h = build_relief.gelaende(rahmen, RASTER_M)
        h = np.clip(np.round(h), 0, 65535)
        for ex, ny in kacheln:
            if (ex // BLOCK, ny // BLOCK) != (bx, by):
                continue
            # Zeilen von Norden: die nördlichste Kachel des Blocks steht oben
            i0 = (ex - bx * BLOCK) * ZELLEN
            j0 = ((by + 1) * BLOCK - 1 - ny) * ZELLEN
            stueck = h[j0:j0 + ZELLEN, i0:i0 + ZELLEN]
            daten = packen(stueck)
            (ZIEL / f"{ex}_{ny}.hgz").write_bytes(daten)
            gesamt += len(daten)
        print(f"Block {bx}/{by} fertig, bisher {gesamt / 1e6:.1f} MB")
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissALTIRegio, Bundesamt für Landestopografie swisstopo, auf 50 m gemittelt",
        "geladen": date.today().isoformat(),
        "kachel_m": KACHEL_M, "raster_m": RASTER_M, "zellen": ZELLEN,
        "hinweis": f"Die Schweiz mit {RAND_M // 1000} km Rand und höchstens {NEBEN_M // 1000} km neben jeder Bahnlinie. "
                   "Je Zeile Differenzen "
                   "zum linken Nachbarn (Int16), gzip.",
        "kacheln": [f"{ex}_{ny}" for ex, ny in kacheln],
    }, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(kacheln)} Kacheln, {gesamt / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
