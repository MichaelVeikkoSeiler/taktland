#!/usr/bin/env python3
"""Kirchen für die Glocken in «3D Schweiz» (Michael, 2026-11-10: Vorschlag «Kirchenglocken zur vollen Stunde», gewählt).

swissTLMRegio (swisstopo) führt Kirchen als Punkte (Ebene tlmregio_miscellaneous_poi, Objektart Kirche). Das Skript schreibt nur ihre
Lage nach data/kirchen.json. Ob eine Kirche Glocken hat und wann sie schlagen, steht in keiner Quelle; die App lässt bei jeder schlagen.

    .venv/bin/python pipeline/build_kirchen.py
"""
import json
import sqlite3
import struct
from datetime import date
from pathlib import Path

from build_bodenbedeckung import laden as tlmregio_laden

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "kirchen.json"


def wkb_punkt(b: bytes):
    """ein Punkt aus einer GeoPackage-Geometrie"""
    flags = b[3]
    pos = 8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
    ordnung = "<" if b[pos] == 1 else ">"
    return struct.unpack_from(ordnung + "dd", b, pos + 5)


def main():
    db = sqlite3.connect(tlmregio_laden())
    punkte = sorted({(round(e), round(n)) for (geom,) in db.execute(
        "select geom from tlmregio_miscellaneous_poi where objval = 'Kirche'") for e, n in [wkb_punkt(geom)]})
    # platzsparend: nach Osten geordnet, je Punkt Differenz zum vorigen in Metern
    flach, pe, pn = [], 0, 0
    for e, n in punkte:
        flach += [e - pe, n - pn]
        pe, pn = e, n
    ZIEL.write_text(json.dumps({
        "quelle": "swissTLMRegio, swisstopo: Kirchen (tlmregio_miscellaneous_poi, Objektart Kirche)",
        "geladen": date.today().isoformat(),
        "hinweis": "Lage in LV95, Meter; je Kirche die Differenz zur vorigen (die erste zu 0, 0). Glocken und Läutzeiten stehen in keiner Quelle.",
        "kirchen": flach,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{ZIEL.relative_to(ROOT)}: {len(punkte)} Kirchen, {ZIEL.stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
