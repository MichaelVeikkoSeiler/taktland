"""Übersicht der ganzen Schweiz für das Spiel «3D Schweiz» (Michael, 2026-10-18): dieselben Daten wie die Geländekacheln
(data/gelaende, swissALTIRegio auf 50 m) und das Luftbild (data/luftbild, SWISSIMAGE auf 10 m), nur gröber, damit die
ganze Schweiz auf einmal lädt: Höhen auf 500 m (Mittel der 50-m-Felder), ein Luftbild auf 100 m.

    .venv/bin/python pipeline/build_schweiz3d.py
"""
import gzip
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GELAENDE = ROOT / "data" / "gelaende"
LUFTBILD = ROOT / "data" / "luftbild"
ZIEL = ROOT / "data" / "schweiz3d"
GROB_M = 500
BILD_M = 100


def kachel(name, zellen):
    d = np.frombuffer(gzip.decompress((GELAENDE / f"{name}.hgz").read_bytes()), "<i2").reshape(zellen, zellen)
    return np.cumsum(d.astype(np.int32), axis=1).astype(np.float32)


def main():
    ix = json.loads((GELAENDE / "index.json").read_text(encoding="utf-8"))
    k, m, zellen = ix["kachel_m"], ix["raster_m"], ix["zellen"]
    lagen = [tuple(map(int, n.split("_"))) for n in ix["kacheln"]]
    ex0, ex1 = min(e for e, _ in lagen), max(e for e, _ in lagen) + 1
    ny0, ny1 = min(n for _, n in lagen), max(n for _, n in lagen) + 1
    je = k // GROB_M
    breite, hoehe = (ex1 - ex0) * je, (ny1 - ny0) * je
    h = np.zeros((hoehe, breite), np.uint16)
    f = GROB_M // m
    for ex, ny in lagen:
        a = kachel(f"{ex}_{ny}", zellen)
        leer = a <= 0
        a[leer] = np.nan
        with np.errstate(all="ignore"):
            g = np.nanmean(a.reshape(je, f, je, f), axis=(1, 3))
        g = np.where(np.isfinite(g), np.round(g), 0)
        j0 = (ny1 - 1 - ny) * je
        h[j0:j0 + je, (ex - ex0) * je:(ex - ex0 + 1) * je] = g.astype(np.uint16)
    ZIEL.mkdir(parents=True, exist_ok=True)
    (ZIEL / "hoehen.hgz").write_bytes(gzip.compress(h.astype("<u2").tobytes(), 9, mtime=0))

    lb = json.loads((LUFTBILD / "index.json").read_text(encoding="utf-8"))
    px = k // BILD_M
    bild = Image.new("RGB", ((ex1 - ex0) * px, (ny1 - ny0) * px), (216, 213, 194))
    jahre = set()
    for name, info in lb["kacheln"].items():
        ex, ny = map(int, name.split("_"))
        if not (ex0 <= ex < ex1 and ny0 <= ny < ny1) or not (LUFTBILD / f"{name}.jpg").exists():
            continue
        t = Image.open(LUFTBILD / f"{name}.jpg").convert("RGB").resize((px, px), Image.LANCZOS)
        bild.paste(t, ((ex - ex0) * px, (ny1 - 1 - ny) * px))
        jahre |= set(info.get("jahre", []))
    bild.save(ZIEL / "luftbild.jpg", quality=82, optimize=True, progressive=True)
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle_gelaende": ix["quelle"] + f", für die Übersicht auf {GROB_M} m gemittelt",
        "quelle_luftbild": lb["quelle"] + f", für die Übersicht auf {BILD_M} m verkleinert",
        "ost": ex0 * k, "nord": ny1 * k, "m": GROB_M, "breite": breite, "hoehe": hoehe, "bild_m": BILD_M,
        "jahre": sorted(jahre), "hinweis": "Höhen in Metern als UInt16, Zeilen von Norden, 0: keine Höhe.",
    }, ensure_ascii=False), encoding="utf-8")
    print(f"{breite} × {hoehe} Höhen, Luftbild {bild.size[0]} × {bild.size[1]}, "
          f"{sum(p.stat().st_size for p in ZIEL.iterdir()) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
