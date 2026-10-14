"""Bäume und Wald entlang der Bahnlinien für den Führerstand, ein Versuch auf den Strecken der Gebäude (Michael,
2026-10-13: «Bäume und Wälder … im gleichen Schema wie die Gebäude … einblenden», «zuerst ohne gemessene Baumhöhen»).

Quelle: swissTLM3D (swisstopo), die Ebenen Einzelbaum (je Baum ein Punkt) und Bodenbedeckung (Wald, Wald offen,
Gebüschwald, Gehölzfläche als Umrisse), geladen mit pipeline/fetch_tlm3d.py --baeume nach data/raw/tlm3d. Nur bis BAND_M
neben den Bahnlinien der Strecken in pipeline/build_gebaeude.py.

- Einzelbäume stehen dort, wo die Quelle sie hat.
- Waldflächen werden mit Bäumen gefüllt, auf einem leicht verschobenen Raster (DICHTE je Art). Wo im Wald ein Baum steht,
  steht in keiner Quelle: die Fläche ist echt, die einzelnen Bäume darin sind gezeichnet.
- Die Höhe steht in keiner der beiden Ebenen; die App nimmt je Art eine feste Höhe an (Relief.tsx, BAUM_HOEHE_M).
- Die Farbe der Krone ist die des Luftbilds an dieser Stelle (data/luftbild_nah, 2,5 m), sonst ein Grün.

Je Kachel von KACHEL_M eine Datei {Ost}_{Nord}.bmd (gzip): Ost und Nord der Kachel in Metern (Int32), die Zahl der Bäume
(UInt32), dann je Baum Ost und Nord in Dezimetern ab der Ecke (UInt16), die Art (UInt8: 0 Einzelbaum, 1 Wald, 2 Wald offen,
3 Gebüschwald, 4 Gehölzfläche) und die Farbe (3 × UInt8). Die Höhe des Bodens nimmt die App aus ihrem Gelände.

Mit --kanton BE VS … (oder --alle) statt dessen das ganze Band neben allen Bahnlinien eines Kantons (pipeline/umgebung.py)
für daten.taktland.ch nach data/baeume_extern, je Kanton ein Verzeichnis index-{Kanton}.json.

    .venv/bin/python pipeline/build_baeume.py
    .venv/bin/python pipeline/build_baeume.py --kanton BE
"""
import argparse
import time
import gzip
import io
import json
import struct
import sys
from datetime import date
from pathlib import Path

import numpy as np
import shapefile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_gebaeude  # noqa: E402
import build_scharf  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "data" / "raw" / "tlm3d"
ZIEL = ROOT / "data" / "baeume"
KACHEL_M = 500
BAND_M = 400
ARTEN = {"Einzelbaum": 0, "Wald": 1, "Wald offen": 2, "Gebueschwald": 3, "Gehoelzflaeche": 4}
#: Abstand der gezeichneten Bäume in einer Fläche, je Art (in keiner Quelle)
DICHTE = {1: 8.0, 2: 16.0, 3: 6.0, 4: 9.0}
GRUEN = (70, 95, 55)
#: Lichtraum fürs Bild (Michael, 2026-10-14: «auch die Bäume an den anderen Gleisen entfernen»): kein Baum, dessen Krone näher
#: als LICHTRAUM_M an eine Gleisachse aus swissTLM3D käme; Kronenradius je Art wie BAUM_FORM in der App, je Baum bis 25 %
#: grösser. Nicht im Tunnel und nicht in Galerien, darüber bleibt der Wald. In keiner Quelle.
LICHTRAUM_M = 5
KRONE_M = {0: 3.5, 1: 3.2, 2: 4.0, 3: 2.2, 4: 3.0}
UNTER_TAG = ("Tunnel", "Galerie")


def einzelbaeume(e0, n0, e1, n1):
    """die Einzelbäume im Rechteck: POINTZ hat je Satz 8 Byte Kopf und 36 Byte Inhalt"""
    raus = []
    for teil in ("WEST", "OST"):
        p = ROH / f"swissTLM3D_TLM_EINZELBAUM_{teil}.shp"
        n = (p.stat().st_size - 100) // 44
        assert 100 + n * 44 == p.stat().st_size, "unerwartete Satzlänge"
        a = np.memmap(p, dtype=np.dtype([("kopf", ">i4", 2), ("typ", "<i4"), ("x", "<f8"), ("y", "<f8"), ("z", "<f8"),
                                         ("m", "<f8")]), mode="r", offset=100, shape=(n,))
        x, y = np.asarray(a["x"]), np.asarray(a["y"])
        w = (x >= e0) & (x <= e1) & (y >= n0) & (y <= n1)
        raus.append(np.stack([x[w], y[w]], axis=1))
    return np.concatenate(raus)


def gleise(e0, n0, e1, n1):
    """die Gleisachsen aus swissTLM3D im Rechteck, ohne Tunnel und Galerien, als Stücke (n × 4)"""
    r = shapefile.Reader(str(ROH / "swissTLM3D_TLM_EISENBAHN"))
    stuecke = []
    for sr in r.iterShapeRecords(bbox=[e0, n0, e1, n1], fields=["KUNSTBAUTE"]):
        if sr.record["KUNSTBAUTE"] in UNTER_TAG:
            continue
        pts = np.array(sr.shape.points)[:, :2]
        teile = list(sr.shape.parts) + [len(pts)]
        for a, z in zip(teile, teile[1:]):
            q = pts[a:z]
            if len(q) >= 2:
                stuecke.append(np.hstack([q[:-1], q[1:]]))
    return np.concatenate(stuecke) if stuecke else np.zeros((0, 4))


def ohne_gleis(b, stuecke):
    """die Bäume, deren Krone (KRONE_M · 1,25) mehr als LICHTRAUM_M von jeder Gleisachse entfernt bleibt"""
    if not len(b) or not len(stuecke):
        return b
    frei = np.array([KRONE_M.get(int(a), 3.5) * 1.25 + LICHTRAUM_M for a in range(5)])[b[:, 2].astype(int)]
    rand = frei.max()
    behalten = np.ones(len(b), bool)
    qe, qn = (b[:, 0] // KACHEL_M).astype(int), (b[:, 1] // KACHEL_M).astype(int)
    se0, sn0 = np.minimum(stuecke[:, 0], stuecke[:, 2]), np.minimum(stuecke[:, 1], stuecke[:, 3])
    se1, sn1 = np.maximum(stuecke[:, 0], stuecke[:, 2]), np.maximum(stuecke[:, 1], stuecke[:, 3])
    for k in set(zip(qe.tolist(), qn.tolist())):
        w = np.nonzero((qe == k[0]) & (qn == k[1]))[0]
        x0, y0 = k[0] * KACHEL_M - rand, k[1] * KACHEL_M - rand
        x1, y1 = x0 + KACHEL_M + 2 * rand, y0 + KACHEL_M + 2 * rand
        s = stuecke[(se1 >= x0) & (se0 <= x1) & (sn1 >= y0) & (sn0 <= y1)]
        if not len(s):
            continue
        px, py = b[w, 0][:, None], b[w, 1][:, None]
        ax, ay, dx, dy = s[:, 0][None], s[:, 1][None], (s[:, 2] - s[:, 0])[None], (s[:, 3] - s[:, 1])[None]
        t = np.clip(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
        d = np.hypot(px - ax - t * dx, py - ay - t * dy).min(axis=1)
        behalten[w] = d >= frei[w]
    return b[behalten]


def innen(px, py, ringe):
    """welche Punkte in den Ringen liegen (gerade-ungerade, Löcher fallen so heraus)"""
    try:
        from matplotlib.path import Path as Pfad
    except ImportError:
        Pfad = None
    if Pfad is not None:
        drin = np.zeros(px.shape, bool)
        pts = np.stack([px, py], axis=1)
        for r in ringe:
            if len(r) >= 3:
                drin ^= Pfad(r[:, :2]).contains_points(pts)
        return drin
    drin = np.zeros(px.shape, bool)
    for r in ringe:
        x0, y0 = r[:-1, 0], r[:-1, 1]
        x1, y1 = r[1:, 0], r[1:, 1]
        for k in range(0, len(x0), 400):
            a, b, c, d = x0[k:k + 400], y0[k:k + 400], x1[k:k + 400], y1[k:k + 400]
            kreuzt = ((b[None, :] > py[:, None]) != (d[None, :] > py[:, None])) & \
                     (px[:, None] < (c - a)[None, :] * (py[:, None] - b[None, :]) / ((d - b)[None, :] + 1e-12) + a[None, :])
            drin ^= (kreuzt.sum(axis=1) % 2).astype(bool)
    return drin


def flaechen(e0, n0, e1, n1, kacheln, rng=None):
    """Bäume in den Waldflächen, die das Rechteck berühren, nur in den Kacheln am Band"""
    raus = []
    rng = rng or np.random.default_rng(7)
    for teil in ("WEST", "OST"):
        r = shapefile.Reader(str(ROH / f"swissTLM3D_TLM_BODENBEDECKUNG_{teil}"))
        for sr in r.iterShapeRecords(bbox=[e0, n0, e1, n1], fields=["OBJEKTART"]):
            art = ARTEN.get(sr.record["OBJEKTART"])
            if not art:
                continue
            s = sr.shape
            pts = np.array(s.points)[:, :2]
            ringe = [pts[a:b] for a, b in zip(s.parts, list(s.parts[1:]) + [len(pts)])]
            bx0, by0, bx1, by1 = s.bbox
            d = DICHTE[art]
            for qe in range(int(bx0 // KACHEL_M), int(bx1 // KACHEL_M) + 1):
                for qn in range(int(by0 // KACHEL_M), int(by1 // KACHEL_M) + 1):
                    if (qe, qn) not in kacheln:
                        continue
                    xs = np.arange(max(bx0, qe * KACHEL_M), min(bx1, (qe + 1) * KACHEL_M), d)
                    ys = np.arange(max(by0, qn * KACHEL_M), min(by1, (qn + 1) * KACHEL_M), d)
                    if not len(xs) or not len(ys):
                        continue
                    gx, gy = np.meshgrid(xs, ys)
                    gx = gx.ravel() + rng.uniform(-0.35, 0.35, gx.size) * d
                    gy = gy.ravel() + rng.uniform(-0.35, 0.35, gy.size) * d
                    w = innen(gx, gy, ringe)
                    if w.any():
                        raus.append(np.stack([gx[w], gy[w], np.full(w.sum(), art)], axis=1))
    return np.concatenate(raus) if raus else np.zeros((0, 3))


def schreiben(ziel, b, bild):
    """b: Bäume (n × 3: Ost, Nord, Art); je Kachel eine .bmd; gibt {Kachel: Zahl} und die Grösse zurück"""
    qe, qn = (b[:, 0] // KACHEL_M).astype(int), (b[:, 1] // KACHEL_M).astype(int)
    zahl, groesse = {}, 0
    for k in sorted(set(zip(qe.tolist(), qn.tolist()))):
        w = (qe == k[0]) & (qn == k[1])
        t = b[w]
        a = np.zeros(len(t), dtype=[("x", "<u2"), ("y", "<u2"), ("art", "u1"), ("f", "u1", 3)])
        a["x"] = np.clip(np.round((t[:, 0] - k[0] * KACHEL_M) * 10), 0, 5000)
        a["y"] = np.clip(np.round((t[:, 1] - k[1] * KACHEL_M) * 10), 0, 5000)
        a["art"] = t[:, 2]
        a["f"] = [bild.farbe(x, y) or GRUEN for x, y in t[:, :2]]
        datei = ziel / f"{k[0]}_{k[1]}.bmd"
        datei.write_bytes(gzip.compress(struct.pack("<iiI", k[0] * KACHEL_M, k[1] * KACHEL_M, len(a)) + a.tobytes(), 9))
        groesse += datei.stat().st_size
        zahl[f"{k[0]}_{k[1]}"] = len(a)
    return zahl, groesse


def kanton(kt, band, kt_ringe, bild):
    import umgebung
    ziel = ROOT / "data" / "baeume_extern"
    ziel.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    kacheln = band.kacheln(kt, kt_ringe)
    qe = [k[0] for k in kacheln]; qn = [k[1] for k in kacheln]
    e0, n0, e1, n1 = min(qe) * KACHEL_M, min(qn) * KACHEL_M, (max(qe) + 1) * KACHEL_M, (max(qn) + 1) * KACHEL_M
    eb = einzelbaeume(e0, n0, e1, n1)
    eb = np.concatenate([eb, np.zeros((len(eb), 1))], axis=1)
    fl = flaechen(e0, n0, e1, n1, kacheln, np.random.default_rng(abs(hash(kt)) % 1000))
    b = np.concatenate([eb, fl])

    imKanton = np.array([(int(x // KACHEL_M), int(y // KACHEL_M)) in kacheln for x, y in b[:, :2]], bool) if len(b) else np.zeros(0, bool)
    b = b[imKanton]
    b = b[band.nah(b[:, 0], b[:, 1])]
    vorher = len(b)
    b = ohne_gleis(b, gleise(e0, n0, e1, n1))
    print(f"{kt}: {vorher - len(b)} Bäume im Lichtraum der Gleise weggelassen", flush=True)
    print(f"{kt}: {len(kacheln)} Kacheln, {len(eb)} Einzelbäume und {len(fl)} gezeichnete im Rechteck, {len(b)} am Band, "
          f"{time.time() - t0:.0f} s", flush=True)
    zahl, groesse = schreiben(ziel, b, bild)
    (ziel / f"index-{kt}.json").write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo): Einzelbaum und Bodenbedeckung; Kronenfarbe aus SWISSIMAGE (swisstopo) auf 2,5 m",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "band_m": umgebung.BAND_M, "kanton": kt,
        "hinweis": "Einzelbäume wie in der Quelle; Waldflächen mit gezeichneten Bäumen gefüllt (Abstand je Art in keiner "
                   "Quelle); Höhe in keiner Quelle",
        "kacheln": zahl,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{kt}: {len(b)} Bäume in {len(zahl)} Kacheln, {groesse / 1e6:.1f} MB, {time.time() - t0:.0f} s", flush=True)



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kanton", nargs="*", help="Kantone für daten.taktland.ch, z. B. BE VS")
    ap.add_argument("--alle", action="store_true", help="alle Kantone, zuerst BE, VS, NE, VD")
    a = ap.parse_args()
    if a.kanton or a.alle:
        import umgebung
        kt_ringe = umgebung.kantone()
        band = umgebung.Band()
        bild = build_gebaeude.Luftbild()
        for kt in (umgebung.alle_kantone() if a.alle else a.kanton):
            kanton(kt, band, kt_ringe, bild)
        return
    versuch()


def versuch():
    strecken = [s for orte in build_gebaeude.STRECKEN for s in build_scharf.strecken_entlang(orte)]
    alle = np.array(strecken)
    e0, n0 = alle[:, [0, 2]].min() - BAND_M, alle[:, [1, 3]].min() - BAND_M
    e1, n1 = alle[:, [0, 2]].max() + BAND_M, alle[:, [1, 3]].max() + BAND_M
    print(f"{len(strecken)} Stücke Bahnlinie, Rechteck {e1 - e0:.0f} × {n1 - n0:.0f} m")
    # die Kacheln am Band
    s = np.linspace(0, KACHEL_M, 11)
    kacheln = set()
    for qe in range(int(e0 // KACHEL_M), int(e1 // KACHEL_M) + 1):
        for qn in range(int(n0 // KACHEL_M), int(n1 // KACHEL_M) + 1):
            gx, gy = np.meshgrid(qe * KACHEL_M + s, qn * KACHEL_M + s)
            if build_scharf.abstand(strecken, gx.ravel(), gy.ravel()).min() <= BAND_M + 40:
                kacheln.add((qe, qn))
    print(f"{len(kacheln)} Kacheln am Band")
    eb = einzelbaeume(e0, n0, e1, n1)
    eb = np.concatenate([eb, np.zeros((len(eb), 1))], axis=1)
    print(f"{len(eb)} Einzelbäume im Rechteck")
    fl = flaechen(e0, n0, e1, n1, kacheln)
    print(f"{len(fl)} gezeichnete Bäume in Waldflächen")
    b = np.concatenate([eb, fl])
    # nur am Band; in Stücken, abstand() rechnet je Punkt gegen alle Linien
    nah = np.zeros(len(b), bool)
    for k in range(0, len(b), 20000):
        nah[k:k + 20000] = build_scharf.abstand(strecken, b[k:k + 20000, 0], b[k:k + 20000, 1]) <= BAND_M
    b = b[nah]
    vorher = len(b)
    b = ohne_gleis(b, gleise(e0, n0, e1, n1))
    print(f"{vorher - len(b)} Bäume im Lichtraum der Gleise weggelassen")
    print(f"{len(b)} Bäume am Band")
    bild = build_gebaeude.Luftbild()
    je = {}
    for x, y, art in b:
        je.setdefault((int(x // KACHEL_M), int(y // KACHEL_M)), []).append((x, y, int(art)))
    ZIEL.mkdir(parents=True, exist_ok=True)
    for p in ZIEL.glob("*.bmd"):
        p.unlink()
    groesse = 0
    for (qe, qn), liste in je.items():
        buf = io.BytesIO()
        buf.write(struct.pack("<iiI", qe * KACHEL_M, qn * KACHEL_M, len(liste)))
        for x, y, art in liste:
            r, g, bl = bild.farbe(x, y) or GRUEN
            buf.write(struct.pack("<HHBBBB", round((x - qe * KACHEL_M) * 10), round((y - qn * KACHEL_M) * 10), art, r, g, bl))
        datei = ZIEL / f"{qe}_{qn}.bmd"
        datei.write_bytes(gzip.compress(buf.getvalue(), 9))
        groesse += datei.stat().st_size
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo): Einzelbaum und Bodenbedeckung; Kronenfarbe aus SWISSIMAGE (swisstopo) auf 2,5 m",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "band_m": BAND_M,
        "hinweis": "Versuch: Einzelbäume wie in der Quelle; Waldflächen mit gezeichneten Bäumen gefüllt (Abstand je Art in "
                   "keiner Quelle); Höhe in keiner Quelle",
        "kacheln": sorted(f"{qe}_{qn}" for qe, qn in je),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(b)} Bäume in {len(je)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
