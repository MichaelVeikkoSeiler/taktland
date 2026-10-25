"""
Ufer der Seen mit gemessenem Grund für «3D Schweiz» (Michael, 2026-10-25: «Warum ist das Wasser hier über das Ufer getreten?»):
die Flächen «Stehende Gewaesser» aus swissTLM3D (swisstopo, Ebene Bodenbedeckung), nur die, in denen Grund aus data/seegrund liegt,
nach Douglas-Peucker auf 1 m vereinfacht. Der Umriss aus swissTLMRegio (data/seen.json, 25 m) deckte flaches Land am Ufer mit Wasser.

Je See eine .ugz (gzip): UInt32 Zahl der Ringe, je Ring UInt32 Zahl der Punkte, Int32 Ost und Nord des ersten in dm, dann je Punkt
Int16 Differenzen in dm (längere Schritte geteilt). Der erste Ring einer Fläche ist ihr Ufer, die folgenden ihre Inseln; ein See kann
mehrere Flächen haben, jede beginnt mit einem Ring im Uhrzeigersinn ihres Ufers, Inseln laufen andersherum (wie im Shapefile).

    python3 pipeline/fetch_tlm3d.py --seen          # die Bodenbedeckung aus swissTLM3D (etwa 2,8 GB)
    .venv/bin/python pipeline/build_seeufer.py      # nach build_seegrund.py
"""
import gzip
import json
import struct
from datetime import date
from pathlib import Path

import numpy as np
import shapefile

ROOT = Path(__file__).resolve().parent.parent
TLM = ROOT / "data" / "raw" / "tlm3d"
SEEGRUND = ROOT / "data" / "seegrund"
ZIEL = ROOT / "data" / "seeufer"
TOLERANZ_M = 1.0


def vereinfachen(p, tol):
    """Douglas-Peucker, ohne Rekursion"""
    n = len(p)
    if n < 4:
        return p
    behalten = np.zeros(n, bool)
    behalten[0] = behalten[-1] = True
    stapel = [(0, n - 1)]
    while stapel:
        a, b = stapel.pop()
        if b <= a + 1:
            continue
        s = p[a + 1:b]
        d = p[b] - p[a]
        l = np.hypot(*d)
        if l == 0:
            abst = np.hypot(*(s - p[a]).T)
        else:
            abst = np.abs(d[0] * (s[:, 1] - p[a][1]) - d[1] * (s[:, 0] - p[a][0])) / l
        i = int(np.argmax(abst))
        if abst[i] > tol:
            k = a + 1 + i
            behalten[k] = True
            stapel += [(a, k), (k, b)]
    return p[behalten]


def innen(px, py, ring):
    """gerade-ungerade: welche Punkte im Ring liegen"""
    x, y = ring[:, 0], ring[:, 1]
    x2, y2 = np.roll(x, -1), np.roll(y, -1)
    drin = np.zeros(len(px), bool)
    for a, b, c, d in zip(x, y, x2, y2):
        kreuzt = (b > py) != (d > py)
        if not kreuzt.any():
            continue
        xs = a + (py - b) / np.where(d - b == 0, 1e-9, d - b) * (c - a)
        drin ^= kreuzt & (px < xs)
    return drin


def seegrund_punkte():
    """je See die Mitten seiner Felder mit Grund (jedes vierte genügt zum Zuordnen)"""
    ix = json.loads((SEEGRUND / "index.json").read_text())
    k, m, z = ix["kachel_m"], ix["raster_m"], ix["zellen"]
    je = {}
    for t in ix["kacheln"]:
        ex, ny = map(int, t.split("_"))
        roh = gzip.decompress((SEEGRUND / f"{t}.sgz").read_bytes())
        g = np.frombuffer(roh[4:4 + z * z * 2], "<u2").reshape(z, z)
        s = np.frombuffer(roh[4 + z * z * 2:], "u1").reshape(z, z)
        jj, ii = np.nonzero(g != 65535)
        for nr in np.unique(s[jj, ii]):
            w = s[jj, ii] == nr
            e = ex * k + (ii[w] + 0.5) * m
            n = (ny + 1) * k - (jj[w] + 0.5) * m
            alt = je.get(int(nr), (np.empty(0), np.empty(0)))
            je[int(nr)] = (np.concatenate([alt[0], e[::4]]), np.concatenate([alt[1], n[::4]]))
    return ix, je


def ring_packen(r):
    dm = np.round(r * 10).astype(np.int64)
    punkte = [dm[0]]
    for p in dm[1:]:
        q = punkte[-1]
        schritte = int(np.ceil(np.abs(p - q).max() / 32000)) or 1
        for s in range(1, schritte + 1):
            punkte.append(q + (p - q) * s // schritte)
    a = np.array(punkte)
    d = np.diff(a, axis=0).astype("<i2")
    return struct.pack("<Iii", len(a), int(a[0][0]), int(a[0][1])) + d.tobytes()


def main():
    ix, punkte = seegrund_punkte()
    ZIEL.mkdir(parents=True, exist_ok=True)
    flaechen = {nr: [] for nr in punkte}
    for shp in sorted(TLM.glob("swissTLM3D_TLM_BODENBEDECKUNG_*.shp")):
        r = shapefile.Reader(str(shp))
        felder = [f[0] for f in r.fields[1:]]
        i_art = felder.index("OBJEKTART")
        for nr_rec in range(len(r)):
            if r.record(nr_rec)[i_art] != "Stehende Gewaesser":
                continue
            form = r.shape(nr_rec)
            x0, y0, x1, y1 = form.bbox
            for nr, (pe, pn) in punkte.items():
                w = (pe >= x0) & (pe <= x1) & (pn >= y0) & (pn <= y1)
                if not w.any():
                    continue
                teile = list(form.parts) + [len(form.points)]
                ringe = [np.array(form.points[teile[i]:teile[i + 1]])[:, :2] for i in range(len(teile) - 1)]
                if innen(pe[w], pn[w], ringe[0]).any():
                    flaechen[nr].append([vereinfachen(rg, TOLERANZ_M) for rg in ringe])
                    break
        print(shp.name, {ix["seen"][nr]["name"]: len(f) for nr, f in flaechen.items() if f}, flush=True)
    liste = []
    for nr, fl in flaechen.items():
        if not fl:
            continue
        name = ix["seen"][nr]["name"]
        ringe = [rg for f in fl for rg in f if len(rg) >= 4]
        roh = struct.pack("<I", len(ringe)) + b"".join(ring_packen(rg) for rg in ringe)
        (ZIEL / f"{name}.ugz").write_bytes(gzip.compress(roh, 9))
        alle = np.concatenate([fl_[0] for fl_ in fl])
        liste.append({"datei": f"{name}.ugz", "see": nr, "titel": ix["seen"][nr]["titel"], "flaechen": len(fl),
                      "punkte": int(sum(len(rg) for rg in ringe)),
                      "rahmen": [int(alle[:, 0].min()), int(alle[:, 1].min()), int(alle[:, 0].max()) + 1, int(alle[:, 1].max()) + 1]})
        print(name, len(fl), "Flächen", liste[-1]["punkte"], "Punkte", flush=True)
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissTLM3D, Bundesamt für Landestopografie swisstopo, Bodenbedeckung «Stehende Gewaesser», auf 1 m vereinfacht",
        "geladen": date.today().isoformat(),
        "hinweis": "je See gzip: UInt32 Ringe, je Ring UInt32 Punkte, Int32 Ost und Nord in dm, dann Int16 Differenzen in dm; "
                   "Ufer im Uhrzeigersinn, Inseln andersherum; see ist die Nummer in data/seegrund/index.json",
        "seen": liste,
    }, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
