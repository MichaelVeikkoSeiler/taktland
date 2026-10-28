#!/usr/bin/env python3
"""Kurslinien der Schiffe für 3D-Land (Michael, 2026-10-28: «Vielleicht findest du ja die Routen aus Flyern oder Seekarten»).

swissTLMRegio (swisstopo) führt die Kursschifflinien und Autofähren als Linien, wie sie auf der Landeskarte stehen
(Ebene tlmregio_transportation_ship, Objektart Kursschiff_Linie und Autofaehre). Das Skript schreibt sie klein nach
data/schifflinien.json, damit der Workflow von 3dland.ch (nur Python ohne Pakete) die Schiffe des Fahrplans auf diesen
Linien fahren lassen kann (pipeline/build_schiffe3d.py). Wie genau die Linien dem gefahrenen Kurs folgen, sagt die Quelle nicht.

    .venv/bin/python pipeline/build_schifflinien.py
"""
import json
import sqlite3
from datetime import date
from pathlib import Path

from build_bodenbedeckung import laden as tlmregio_laden
from build_seen import wkb_linien

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "schifflinien.json"


def main():
    db = sqlite3.connect(tlmregio_laden())
    linien = []
    for geom, art in db.execute("select geom, objval from tlmregio_transportation_ship"):
        for teil in wkb_linien(geom):
            punkte = [(round(e), round(n)) for e, n in teil]
            # doppelte Punkte nach dem Runden weg
            punkte = [p for i, p in enumerate(punkte) if i == 0 or p != punkte[i - 1]]
            if len(punkte) < 2:
                continue
            # platzsparend: erster Punkt, dann Differenzen in Metern
            flach = [punkte[0][0], punkte[0][1]]
            for (e0, n0), (e1, n1) in zip(punkte, punkte[1:]):
                flach += [e1 - e0, n1 - n0]
            linien.append([1 if art == "Autofaehre" else 0, flach])
    ZIEL.write_text(json.dumps({
        "quelle": "swissTLMRegio, swisstopo: Kursschifflinien und Autofähren (tlmregio_transportation_ship)",
        "geladen": date.today().isoformat(),
        "hinweis": "Je Linie: 1 Autofähre, 0 Kursschiff, dann LV95 in Metern, erster Punkt und danach Differenzen.",
        "linien": linien,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{ZIEL.relative_to(ROOT)}: {len(linien)} Linien, {ZIEL.stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
