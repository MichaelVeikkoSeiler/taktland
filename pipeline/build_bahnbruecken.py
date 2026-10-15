#!/usr/bin/env python3
"""Gleisachsen auf Brücken aus swissTLM3D: data/bahnbruecken.json.

Michael, 2026-10-15: «Es wäre schön, wenn du Eisenbahnbrücken so breit bauen kannst, gemäß der Anzahl Gleise, die du
auf der Karte siehst.» swissTLM3D (swisstopo) zeichnet in TLM_EISENBAHN jedes Gleis als eigene Achse (der Viadukt der
Lorraine in Bern hat vier nebeneinander); KUNSTBAUTE sagt, welches Stück eine Brücke ist. Die App sucht an jeder
gezeichneten Brücke die Achsen daneben und baut die Platte so breit, dass alle darauf liegen. ANZAHL_SPUREN nennt bei
manchen Achsen 1 oder 2; steht dort 2 und liegt keine zweite Achse daneben, trägt die eine Achse zwei Gleise.

    python3 pipeline/fetch_tlm3d.py
    .venv/bin/python pipeline/build_bahnbruecken.py
"""
import json
import math
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "data" / "raw" / "tlm3d"
ZIEL = ROOT / "data" / "bahnbruecken.json"
STAND = "2026-02"

BRUECKEN = ("Bruecke", "Gedeckte Bruecke")
#: kürzere Stücke tragen keine Brücke, die die App zeichnet (Übergänge zwischen zwei Achsen)
KUERZESTE_M = 5


def main():
    bahn = shapefile.Reader(str(ROH / "swissTLM3D_TLM_EISENBAHN"), encoding="utf-8")
    namen = [f[0] for f in bahn.fields[1:]]
    ik, isp = namen.index("KUNSTBAUTE"), namen.index("ANZAHL_SPU")
    raus = []
    for i, rec in enumerate(bahn.iterRecords()):
        if rec[ik] not in BRUECKEN:
            continue
        p = bahn.shape(i).points
        if len(p) < 2 or sum(math.dist(p[k], p[k + 1]) for k in range(len(p) - 1)) < KUERZESTE_M:
            continue
        e0, n0 = round(p[0][0]), round(p[0][1])
        d = []
        for e, n in p:
            d += [round((e - e0) * 10), round((n - n0) * 10)]
        sp = rec[isp]
        raus.append({"e": e0, "n": n0, "s": int(sp) if sp in ("1", "2") else None, "d": d})
    ZIEL.write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo), TLM_EISENBAHN",
        "stand": STAND,
        "hinweis": "Gleisachsen auf Brücken (KUNSTBAUTE Bruecke, Gedeckte Bruecke), je Gleis eine Achse. e, n: Anfang "
                   "in LV95 (m); d: je Punkt Ost und Nord in dm ab dem Anfang; s: ANZAHL_SPUREN laut Quelle, leer wo "
                   "sie keine nennt.",
        "achsen": raus,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"bahnbruecken.json: {len(raus)} Achsen auf Brücken ({ZIEL.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
