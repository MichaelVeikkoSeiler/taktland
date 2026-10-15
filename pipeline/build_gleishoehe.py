#!/usr/bin/env python3
"""Höhe der Gleise aus swissTLM3D: data/gleishoehe/{ke}_{kn}.hgz.

Michael, 2026-10-15, Albula: «Wenn ich diese abfahre, fühle ich mich wie auf einer Achterbahn.» Bisher folgte die Linie in
3D dem Gelände, gemittelt; in den Bergen fiel sie in jedes Tobel und stieg über jede Rippe. swissTLM3D (swisstopo) führt
jede Gleisachse in TLM_EISENBAHN als Linie mit Höhe (PolyLineZ), auch in Tunneln und auf Brücken: an der Albula steigen
die Achsen lückenlos von 1'330 m bei Bergün auf 1'815 m im Albulatunnel. Die App sucht entlang ihres Wegs die Achse
daneben und nimmt deren Höhe.

Je Kachel von KACHEL_M die Achsen, die sie berühren, in Stücken, alle SCHRITT_M ein Punkt; gzip von: Int32 tiefste Höhe
in dm, dann je Stück Int16 Zahl der Punkte und je Punkt Int16 Ost und Nord in halben Metern ab der Ecke der Kachel
(Süd-West) und Int16 Höhe in dm über der tiefsten. Ein Stück reicht einen Punkt über den Rand, damit kein Abschnitt
fehlt. Standseilbahnen nicht.

    python3 pipeline/fetch_tlm3d.py
    .venv/bin/python pipeline/build_gleishoehe.py
"""
import gzip
import json
import math
import struct
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "data" / "raw" / "tlm3d"
ZIEL = ROOT / "data" / "gleishoehe"
STAND = "2026-02"
KACHEL_M = 10000
SCHRITT_M = 20


def nachfahren(p, z):
    """die Achse alle SCHRITT_M neu abgetastet, Ecken bleiben"""
    raus = [(p[0][0], p[0][1], z[0])]
    for k in range(len(p) - 1):
        (a, b), (c, d) = p[k], p[k + 1]
        l = math.hypot(c - a, d - b)
        teile = max(1, math.ceil(l / SCHRITT_M))
        for t in range(1, teile + 1):
            f = t / teile
            raus.append((a + f * (c - a), b + f * (d - b), z[k] + f * (z[k + 1] - z[k])))
    return raus


def main():
    bahn = shapefile.Reader(str(ROH / "swissTLM3D_TLM_EISENBAHN"), encoding="utf-8")
    namen = [f[0] for f in bahn.fields[1:]]
    iss = namen.index("STANDSEILB")
    kacheln = {}
    for i, rec in enumerate(bahn.iterRecords()):
        if rec[iss] == "Wahr":
            continue
        s = bahn.shape(i)
        if len(s.points) < 2:
            continue
        pkt = nachfahren(s.points, list(s.z))
        # in Stücke je Kachel, mit einem Punkt Überlapp
        drin = [(int(e // KACHEL_M), int(n // KACHEL_M)) for e, n, _ in pkt]
        for k in set(drin):
            stueck = []
            for j, q in enumerate(pkt):
                nahe = drin[j] == k or (j > 0 and drin[j - 1] == k) or (j + 1 < len(pkt) and drin[j + 1] == k)
                if nahe:
                    stueck.append(q)
                elif stueck:
                    kacheln.setdefault(k, []).append(stueck)
                    stueck = []
            if len(stueck) > 1:
                kacheln.setdefault(k, []).append(stueck)
    if ZIEL.exists():
        for alt in ZIEL.glob("*.hgz"):
            alt.unlink()
    ZIEL.mkdir(parents=True, exist_ok=True)
    groesse, geschrieben = 0, []
    for (ke, kn), stuecke in sorted(kacheln.items()):
        stuecke = [s for s in stuecke if len(s) > 1]
        if not stuecke:
            continue
        geschrieben.append(f"{ke}_{kn}")
        z0 = math.floor(min(q[2] for s in stuecke for q in s) * 10)
        roh = bytearray(struct.pack("<i", z0))
        for s in stuecke:
            roh += struct.pack("<h", len(s))
            for e, n, z in s:
                roh += struct.pack("<hhh", round((e - ke * KACHEL_M) * 2), round((n - kn * KACHEL_M) * 2), round(z * 10) - z0)
        daten = gzip.compress(bytes(roh), 9)
        (ZIEL / f"{ke}_{kn}.hgz").write_bytes(daten)
        groesse += len(daten)
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo), TLM_EISENBAHN",
        "stand": STAND,
        "kachel_m": KACHEL_M,
        "schritt_m": SCHRITT_M,
        "kacheln": geschrieben,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"gleishoehe/: {len(geschrieben)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
