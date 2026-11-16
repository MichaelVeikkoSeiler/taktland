#!/usr/bin/env python3
"""Gröbere Fassungen des Luftbilds für die grossen Ausschnitte der Virtuellen Schweiz (128 und 64 km).

Dort zeigt die Leinwand je 10-km-Kachel nur etwa 160 bis 650 Bildpunkte; die Kacheln in data/luftbild haben 1000
(10 m). Vorher lud das Handy für 128 km gegen 170 volle Kacheln, etwa 48 MB, und verkleinerte sie erst dann (gemessen
2026-11-15 vor der Bekanntmachung; Michael: «Ja, bitte so umsetzen»). Hier dieselben Bilder, nur kleiner gerechnet:
330 Bildpunkte (etwa 30 m, 128 km am Desktop, 64 km auf dem Handy) und 165 (etwa 60 m, 128 km auf dem Handy), je
Kachel derselbe Name; die App nimmt die kleinste, die mindestens so viele Bildpunkte hat, wie die Leinwand zeigt. Keine neue Quelle, nur verkleinert.

    .venv/bin/python pipeline/build_luftbild_grob.py      # nach build_luftbild.py, vor export_app
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
QUELLE = ROOT / "data" / "luftbild"
ZIEL = ROOT / "data" / "luftbild_grob"
STUFEN = (165, 330)
QUALITAET = 82  # gewählt, wie die vollen Kacheln etwa


def main():
    namen = sorted(QUELLE.glob("*.jpg"))
    for px in STUFEN:
        ordner = ZIEL / str(px)
        ordner.mkdir(parents=True, exist_ok=True)
        for p in namen:
            ziel = ordner / p.name
            if ziel.exists() and ziel.stat().st_mtime >= p.stat().st_mtime:
                continue
            with Image.open(p) as b:
                b.convert("RGB").resize((px, px), Image.LANCZOS).save(ziel, "JPEG", quality=QUALITAET, optimize=True)
        groesse = sum(f.stat().st_size for f in ordner.iterdir())
        print(f"luftbild_grob/{px}: {len(namen)} Kacheln, {groesse / 1e6:.1f} MB")
    (ZIEL / "index.json").write_text(json.dumps({
        "pixel": list(STUFEN),
        "hinweis": "Dieselben Kacheln wie data/luftbild, verkleinert auf die genannten Bildpunkte je 10 km.",
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
