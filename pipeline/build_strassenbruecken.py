#!/usr/bin/env python3
"""Strassen- und Wegbrücken über der Bahn aus swissTLM3D: data/strassenbruecken.json.

Michael, 2026-10-15: «Kommt eine Autobrücke, unter der man unten durchfahren würde … führt [sie] nicht über die
Bahnstrecke oben hinüber. Ist es möglich, eine Autobrücke zu konstruieren?»

swissTLM3D (swisstopo) führt Strassen und Wege als Linien mit Höhe (TLM_STRASSE, PolyLineZ); KUNSTBAUTE sagt, welches
Stück eine Brücke ist. Behalten wird ein Brückenstück, wenn es im Grundriss eine Gleisachse aus TLM_EISENBAHN kreuzt und
dort mindestens UEBER_M höher liegt als sie: dann führt es über die Bahn. Die Höhe ist die der Strassenachse laut
swissTLM3D. Die Breite steht nur im Namen der Klasse («4m Strasse», «2m Weg»); Autobahn, Autostrasse, Ein- und Ausfahrt
und Zufahrten nennen keine, dort bleibt sie leer und die App nimmt eine Annahme.

    python3 pipeline/fetch_tlm3d.py --strassen
    .venv/bin/python pipeline/build_strassenbruecken.py
"""
import json
import math
import re
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "data" / "raw" / "tlm3d"
ZIEL = ROOT / "data" / "strassenbruecken.json"
STAND = "2026-02"

BRUECKEN = ("Bruecke", "Bruecke mit Treppe", "Gedeckte Bruecke", "Steg", "Bruecke mit Galerie")
#: so viel höher als die Gleisachse muss die Strasse am Kreuzungspunkt liegen
UEBER_M = 3.0
ZELLE_M = 200


def kreuzung(a, b, c, d):
    """Schnitt der Strecken a–b und c–d im Grundriss: (t auf a–b, u auf c–d) oder None"""
    rx, ry = b[0] - a[0], b[1] - a[1]
    sx, sy = d[0] - c[0], d[1] - c[1]
    nenner = rx * sy - ry * sx
    if abs(nenner) < 1e-9:
        return None
    qx, qy = c[0] - a[0], c[1] - a[1]
    t = (qx * sy - qy * sx) / nenner
    u = (qx * ry - qy * rx) / nenner
    return (t, u) if 0 <= t <= 1 and 0 <= u <= 1 else None


def main():
    # die Gleisachsen in Zellen
    bahn = shapefile.Reader(str(ROH / "swissTLM3D_TLM_EISENBAHN"), encoding="utf-8")
    zellen = {}
    for s in bahn.iterShapes():
        p, z = s.points, list(s.z)
        for i in range(len(p) - 1):
            a, b = (*p[i], z[i]), (*p[i + 1], z[i + 1])
            for qe in range(int(min(a[0], b[0]) // ZELLE_M), int(max(a[0], b[0]) // ZELLE_M) + 1):
                for qn in range(int(min(a[1], b[1]) // ZELLE_M), int(max(a[1], b[1]) // ZELLE_M) + 1):
                    zellen.setdefault((qe, qn), []).append((a, b))
    print(f"Gleisachsen in {len(zellen)} Zellen")

    strasse = shapefile.Reader(str(ROH / "swissTLM3D_TLM_STRASSE"), encoding="utf-8")
    kandidaten = [(i, art) for i, (art, kb) in enumerate(strasse.iterRecords(fields=["OBJEKTART", "KUNSTBAUTE"]))
                  if kb in BRUECKEN]
    print(f"{len(kandidaten)} Brückenstücke in swissTLM3D")
    raus, arten = [], {}
    for i, art in kandidaten:
        s = strasse.shape(i)
        p, z = s.points, list(s.z)
        ueber = False
        for k in range(len(p) - 1):
            a, b = p[k], p[k + 1]
            gesehen = set()
            for qe in range(int(min(a[0], b[0]) // ZELLE_M), int(max(a[0], b[0]) // ZELLE_M) + 1):
                for qn in range(int(min(a[1], b[1]) // ZELLE_M), int(max(a[1], b[1]) // ZELLE_M) + 1):
                    for c, d in zellen.get((qe, qn), []):
                        if (c, d) in gesehen:
                            continue
                        gesehen.add((c, d))
                        x = kreuzung(a, b, c, d)
                        if not x:
                            continue
                        zs = z[k] + x[0] * (z[k + 1] - z[k])
                        zb = c[2] + x[1] * (d[2] - c[2])
                        if zs - zb >= UEBER_M:
                            ueber = True
                            break
                    if ueber:
                        break
                if ueber:
                    break
            if ueber:
                break
        if not ueber:
            continue
        m = re.match(r"(\d+)m ", art)
        e0, n0, h0 = round(p[0][0]), round(p[0][1]), round(z[0] * 10)
        punkte = []
        for (e, n), h in zip(p, z):
            punkte += [round((e - e0) * 10), round((n - n0) * 10), round(h * 10) - h0]
        raus.append({"e": e0, "n": n0, "h": h0, "b": int(m.group(1)) if m else None, "art": art, "d": punkte})
        arten[art] = arten.get(art, 0) + 1
    ZIEL.write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo), TLM_STRASSE und TLM_EISENBAHN",
        "stand": STAND,
        "hinweis": "Strassen- und Wegbrücken, die eine Gleisachse kreuzen und dort mindestens 3 m über ihr liegen. "
                   "e, n: Anfang in LV95 (m), h: seine Höhe in dm; d: je Punkt Ost, Nord und Höhe in dm ab dem Anfang. "
                   "b: Breite laut Klasse (art) in m, leer wo die Klasse keine nennt.",
        "bruecken": raus,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"strassenbruecken.json: {len(raus)} Brücken über der Bahn ({ZIEL.stat().st_size / 1024:.0f} KB)")
    print("  ", sorted(arten.items(), key=lambda x: -x[1]))


if __name__ == "__main__":
    main()
