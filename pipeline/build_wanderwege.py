"""Wanderwege für «3D Schweiz» (Michael, 2026-10-21: «alle Wanderwege der Schweiz auf 3D-Schweiz einbauen»).

Quelle: swissTLM3D (swisstopo), Ebene TLM_STRASSE, das Merkmal WANDERWEGE (Wanderweg, Bergwanderweg, Alpinwanderweg; leer
heisst: in der Quelle nicht als Wanderweg eingetragen), geladen mit pipeline/fetch_tlm3d.py --strassen nach data/raw/tlm3d.
Stücke in Tunneln fallen weg (KUNSTBAUTE Tunnel): auf das Gelände gelegt, liefen sie über den Berg.

Je Stück nur die Lage, ohne Höhe: die App legt die Linie auf ihr eigenes Gelände, sonst schwebte sie über dem groben Gelände
oder verschwände darin. Vereinfacht nach Douglas-Peucker mit VEREINFACHT_M, auf ganze Meter gerundet.

Je 10-km-Kachel der Geländekacheln (nach der Mitte des Stücks) eine Datei {Ost}_{Nord}.wwg (gzip, nicht .gz, das liefert ein
Server oft als gepackt aus): die Zahl der Stücke (UInt32), dann je Stück die Art (UInt8: 1 Wanderweg, 2 Bergwanderweg,
3 Alpinwanderweg), die Zahl der Punkte (UInt16) und je Punkt Ost und Nord in Metern ab der Ecke der Kachel (Int16).
Nach data/wanderwege, mit index.json.

    .venv/bin/python pipeline/build_wanderwege.py
"""
import gzip
import json
import struct
from datetime import date
from pathlib import Path

import numpy as np
import shapefile

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "data" / "raw" / "tlm3d" / "swissTLM3D_TLM_STRASSE"
ZIEL = ROOT / "data" / "wanderwege"
KACHEL_M = 10_000
VEREINFACHT_M = 2.0
ARTEN = {"Wanderweg": 1, "Bergwanderweg": 2, "Alpinwanderweg": 3}


def vereinfacht(p, tol):
    """Douglas-Peucker ohne Rekursion; p: n × 2"""
    if len(p) <= 2:
        return p
    behalten = np.zeros(len(p), bool)
    behalten[0] = behalten[-1] = True
    stapel = [(0, len(p) - 1)]
    while stapel:
        a, b = stapel.pop()
        if b - a < 2:
            continue
        d = p[b] - p[a]
        l = np.hypot(*d) or 1.0
        q = p[a + 1:b] - p[a]
        abst = np.abs(q[:, 0] * d[1] - q[:, 1] * d[0]) / l
        k = int(np.argmax(abst))
        if abst[k] > tol:
            m = a + 1 + k
            behalten[m] = True
            stapel += [(a, m), (m, b)]
    return p[behalten]


def main():
    r = shapefile.Reader(str(ROH))
    kacheln, zahl, punkte = {}, {1: 0, 2: 0, 3: 0}, 0
    for i, rec in enumerate(r.iterRecords(fields=["WANDERWEGE", "KUNSTBAUTE"])):
        art = ARTEN.get(rec["WANDERWEGE"])
        if not art or rec["KUNSTBAUTE"] == "Tunnel":
            continue
        s = r.shape(i)
        pts = np.array(s.points, dtype=np.float64)[:, :2]
        teile = list(s.parts) + [len(pts)]
        for a, b in zip(teile, teile[1:]):
            q = vereinfacht(pts[a:b], VEREINFACHT_M)
            if len(q) < 2:
                continue
            m = q.mean(axis=0)
            k = (int(m[0] // KACHEL_M), int(m[1] // KACHEL_M))
            rel = np.round(q - (k[0] * KACHEL_M, k[1] * KACHEL_M)).astype(np.int32)
            if np.abs(rel).max() > 32000 or len(rel) > 65535:
                continue
            kacheln.setdefault(k, []).append((art, rel.astype("<i2")))
            zahl[art] += 1
            punkte += len(rel)
    ZIEL.mkdir(parents=True, exist_ok=True)
    for p in ZIEL.glob("*.wwg"):
        p.unlink()
    groesse = 0
    for (ex, ny), liste in kacheln.items():
        teile = [struct.pack("<I", len(liste))]
        for art, rel in liste:
            teile.append(struct.pack("<BH", art, len(rel)))
            teile.append(rel.tobytes())
        datei = ZIEL / f"{ex}_{ny}.wwg"
        datei.write_bytes(gzip.compress(b"".join(teile), 9, mtime=0))
        groesse += datei.stat().st_size
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo), Ebene Strasse, Merkmal WANDERWEGE",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "vereinfacht_m": VEREINFACHT_M,
        "arten": {"1": "Wanderweg", "2": "Bergwanderweg", "3": "Alpinwanderweg"},
        "hinweis": "nur Stücke, die in der Quelle als Wanderweg eingetragen sind; ohne Stücke in Tunneln; Lage ohne Höhe",
        "stuecke": {ARTEN_NAME: zahl[a] for ARTEN_NAME, a in ARTEN.items()},
        "kacheln": sorted(f"{ex}_{ny}" for ex, ny in kacheln),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{sum(zahl.values())} Stücke ({zahl}), {punkte} Punkte, {len(kacheln)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
