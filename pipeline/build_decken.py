#!/usr/bin/env python3
"""Decken über Gleisen für «3D Schweiz» (Michael, 2026-11-05, Bern: «bei den Perrons unter der Decke sieht man Autos. Das ist wohl
die Textur des Parkings. Bitte setze diese Textur auf die Decke oberhalb … Unterhalb … eine anthrazitfarbene Textur»).

Belegt: die Gebäude aus swissBUILDINGS3D (data/gebaeude, pipeline/build_gebaeude.py, nur wo schon gebaut) und die Gleisachsen aus
swissTLM3D (TLM_EISENBAHN, nur Bahn, ohne Tunnel). Eine Decke ist eine Dachfläche (Dreieck, nach oben gerichtet), unter der eine
Gleisachse mindestens UEBER_M tiefer liegt, dazu die angrenzenden Dachdreiecke auf etwa derselben Höhe (bis GLEICH_M); gewählt.

Ausgabe data/decken.json: je Decke die Dreiecke, je Ecke E, N (LV95, dm) und Höhe (dm ü. M.).

    .venv/bin/python pipeline/build_decken.py      # nach build_gebaeude.py und fetch_tlm3d.py, vor export_app
"""
import gzip
import json
import math
import struct
from collections import defaultdict
from datetime import date
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "decken.json"
#: so viel höher als das Gleis liegt eine Decke mindestens, gewählt
UEBER_M = 4.0
#: angrenzende Dächer bis so viel höher oder tiefer gehören zur selben Decke, gewählt
GLEICH_M = 1.5
#: Dachdreiecke: die Normale höchstens so weit von der Senkrechten (cos), gewählt
FLACH = 0.95
ZELLE_M = 50


def main():
    # die Gleisachsen ausserhalb von Tunneln alle 5 m
    bahn = shapefile.Reader(str(ROOT / "data" / "raw" / "tlm3d" / "swissTLM3D_TLM_EISENBAHN"), encoding="utf-8")
    felder = [f[0] for f in bahn.fields[1:]]
    punkte = defaultdict(list)
    for i, rec in enumerate(bahn.iterRecords()):
        d = dict(zip(felder, rec))
        if d.get("VERKEHRSMI") != "Bahn" or d.get("KUNSTBAUTE") == "Tunnel":
            continue
        s = bahn.shape(i)
        p, z = s.points, s.z
        teile = list(s.parts) + [len(p)]
        for a0, b0 in zip(teile, teile[1:]):
            for k in range(a0, b0 - 1):
                l = math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1])
                for j in range(int(l // 5) + 1):
                    t = j * 5 / l if l else 0
                    e, n = p[k][0] + t * (p[k + 1][0] - p[k][0]), p[k][1] + t * (p[k + 1][1] - p[k][1])
                    punkte[(int(e // ZELLE_M), int(n // ZELLE_M))].append((e, n, z[k] + t * (z[k + 1] - z[k])))

    def innen(e, n, a, b, c):
        d1 = (e - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (n - b[1])
        d2 = (e - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (n - c[1])
        d3 = (e - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (n - a[1])
        neg, pos = d1 < 0 or d2 < 0 or d3 < 0, d1 > 0 or d2 > 0 or d3 > 0
        return not (neg and pos)

    decken = []
    for datei in sorted((ROOT / "data" / "gebaeude").glob("*.bgz")):
        roh = gzip.decompress(datei.read_bytes())
        e0, n0, h0, z = struct.unpack_from("<iiiI", roh, 0)
        ecken = [struct.unpack_from("<hhh", roh, 16 + k * 10) for k in range(z)]
        dachs = []
        for d in range(0, z - 2, 3):
            tri = [(e0 + ecken[q][0] / 10, n0 + ecken[q][2] / 10, (h0 + ecken[q][1]) / 10) for q in range(d, d + 3)]
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = tri
            ux, uy, uz, vx, vy, vz = bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            l = math.sqrt(nx * nx + ny * ny + nz * nz)
            if l and abs(nz) / l >= FLACH:
                dachs.append(tri)
        if not dachs:
            continue
        # über einem Gleis?
        ueber = []
        for i, tri in enumerate(dachs):
            es, ns = [p[0] for p in tri], [p[1] for p in tri]
            hoch = min(p[2] for p in tri)
            treffer = False
            for qe in range(int(min(es) // ZELLE_M), int(max(es) // ZELLE_M) + 1):
                for qn in range(int(min(ns) // ZELLE_M), int(max(ns) // ZELLE_M) + 1):
                    for e, n, hz in punkte.get((qe, qn), ()):
                        if hoch - hz >= UEBER_M and innen(e, n, *tri):
                            treffer = True
                            break
                    if treffer:
                        break
                if treffer:
                    break
            if treffer:
                ueber.append(i)
        if not ueber:
            continue
        # die angrenzenden Dachdreiecke auf derselben Höhe dazu (gemeinsame Ecke)
        jeEcke = defaultdict(list)
        for i, tri in enumerate(dachs):
            for p in tri:
                jeEcke[(round(p[0], 1), round(p[1], 1))].append(i)
        drin = set(ueber)
        offen = list(ueber)
        while offen:
            i = offen.pop()
            mz = sum(p[2] for p in dachs[i]) / 3
            for p in dachs[i]:
                for j in jeEcke[(round(p[0], 1), round(p[1], 1))]:
                    if j not in drin and abs(sum(q[2] for q in dachs[j]) / 3 - mz) <= GLEICH_M:
                        drin.add(j)
                        offen.append(j)
        decken.append({"t": [[round(p[0] * 10), round(p[1] * 10), round(p[2] * 10)] for i in sorted(drin) for p in dachs[i]]})
        print(datei.stem, len(ueber), "über Gleisen,", len(drin), "Dreiecke")

    ZIEL.write_text(json.dumps({
        "quelle": "Dächer: swissBUILDINGS3D (swisstopo), nur wo in data/gebaeude; Gleisachsen: swissTLM3D (swisstopo)",
        "geladen": date.today().isoformat(),
        "hinweis": f"je Decke Dreiecke, je Ecke E, N (LV95, dm) und Höhe (dm ü. M.); Dächer mindestens {UEBER_M:g} m über einer Gleisachse "
                   f"und angrenzende bis {GLEICH_M:g} m Unterschied (gewählt)",
        "decken": decken,
    }, separators=(",", ":")), encoding="utf-8")
    print(len(decken), "Decken,", ZIEL.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
