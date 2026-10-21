"""Gebäude und Bäume der ganzen Schweiz für «3D Schweiz» und 3dland.ch (Michael, 2026-10-21: «Bäume und Gebäude für
3DLand»), für daten.taktland.ch. Wie die Probeausschnitte (pipeline/build_schweiz3d_probe.py) alles, nicht nur neben der
Bahn, in denselben Formaten (.bgz, .bmd je Kachel von 500 m, pipeline/build_gebaeude.py und build_baeume.py).

Gebaut wird in Streifen von Norden nach Süden: Teil k von n nimmt die 10-km-Spalten der Geländekacheln von Ost SPALTEN
zwischen den Grenzen k-1 und k; jede Kachel von 500 m gehört so genau einem Teil, und die Läufe des Workflows (.github/
workflows/schweiz3dumwelt.yml) bauen nichts doppelt.

- Gebäude: swissBUILDINGS3D 3.0 (swisstopo), je Kartenblatt der neueste Jahrgang, die Blätter, die den Streifen berühren;
  ein Gebäude gehört der Kachel seiner Mitte. Dachfarbe aus SWISSIMAGE (swisstopo, Fassung 2 m, je km auf 2,5 m gemittelt,
  über das Netz gelesen wie in build_schweiz3d_details.py), Wände grau (in keiner Quelle), unten WAND_TIEFER_M länger.
- Bäume: swissTLM3D (swisstopo), Einzelbäume wie in der Quelle, Waldflächen mit gezeichneten Bäumen gefüllt (Abstand je
  Art, build_baeume.DICHTE, in keiner Quelle), ohne Kronen im Lichtraum der Gleise; Kronenfarbe aus dem Luftbild der App
  (data/luftbild, SWISSIMAGE auf 10 m), sonst ein Grün. Braucht pipeline/fetch_tlm3d.py --baeume.

Nach data/schweiz3dumwelt_extern/{gebaeude,baeume}/ mit index-{teil}.json; --packen schnürt daraus Pakete von höchstens
400 MB (ungepackt gespeichert, die Kacheln sind schon gzip) nach data/schweiz3dumwelt_pakete, Pfade unter
schweiz3dumwelt/; server/daten/holen.php (HOLEN = 'schweiz3dumwelt-1') fügt die Verzeichnisse zu index.json zusammen.

    .venv/bin/python pipeline/build_schweiz3d_umwelt.py --art gebaeude --teil 3/16
    .venv/bin/python pipeline/build_schweiz3d_umwelt.py --art baeume --teil 3/16
    .venv/bin/python pipeline/build_schweiz3d_umwelt.py --packen --teil g3
"""
import argparse
import gzip
import json
import shutil
import struct
import sys
import time
import zipfile
from collections import OrderedDict
from datetime import date
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
ROOT = Path(__file__).resolve().parent.parent
EXTERN = ROOT / "data" / "schweiz3dumwelt_extern"
PAKETE = ROOT / "data" / "schweiz3dumwelt_pakete"
TMP = ROOT / "data" / "raw" / "schweiz3dumwelt_tmp"
K = 500
#: die 10-km-Spalten der Schweiz (Ost 2'480 bis 2'840 km), von West nach Ost
SPALTEN = list(range(248, 284))
#: Norden und Süden der Schweiz in LV95, mit Rand
N0, N1 = 1_070_000, 1_300_000
GROESSE = 400_000_000
GRUEN = (70, 95, 55)


def streifen(teil):
    """Teil «k/n» → Ost von, Ost bis in Metern; die Spalten gleichmässig auf die Teile"""
    k, n = (int(x) for x in teil.split("/"))
    a = (k - 1) * len(SPALTEN) // n
    b = k * len(SPALTEN) // n
    return SPALTEN[a] * 10_000, (SPALTEN[b - 1] + 1) * 10_000


class Dachbild:
    """Farbe an einer Stelle aus SWISSIMAGE 2 m, je km auf 400 × 400 gelesen, erst wenn gebraucht; die letzten 400 km
    bleiben im Speicher (ein Kartenblatt hat etwa 210 km²)"""

    def __init__(self):
        self.km, self.adressen = OrderedDict(), {}

    def _km(self, ke, kn):
        if (ke, kn) in self.km:
            self.km.move_to_end((ke, kn))
            return self.km[(ke, kn)]
        import build_luftbild
        import build_schweiz3d_details
        blk = (ke // 10, kn // 10)
        if blk not in self.adressen:
            try:
                self.adressen[blk] = {k: h for k, (_, h) in build_luftbild.km_kacheln(*blk).items()}
            except Exception as e:  # noqa: BLE001  ohne Luftbild bleibt die Farbe aus der Annahme
                print(f"  Luftbild {blk}: {e}", flush=True)
                self.adressen[blk] = {}
        href = self.adressen[blk].get((ke, kn))
        a = build_schweiz3d_details.lesen(href, True, 400) if href else None
        a = None if a is None else np.transpose(a, (1, 2, 0))
        self.km[(ke, kn)] = a
        while len(self.km) > 400:
            self.km.popitem(last=False)
        return a

    def farbe(self, e, n):
        a = self._km(int(e // 1000), int(n // 1000))
        if a is None:
            return None
        x, y = int((e % 1000) * 0.4), int((1000 - n % 1000) * 0.4)
        f = a[max(0, y - 1):y + 2, max(0, x - 1):x + 2].reshape(-1, 3).astype(float)
        if not len(f) or f.mean() > 244:
            return None
        return tuple(int(v) for v in f.mean(axis=0))


def gebaeude(teil):
    import build_gebaeude
    e_von, e_bis = streifen(teil)
    ziel = EXTERN / "gebaeude"
    ziel.mkdir(parents=True, exist_ok=True)
    tmp = TMP / f"g{teil.replace('/', '_')}"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    t0 = time.time()
    import umgebung
    la0, lo0 = umgebung.lv95_zu_wgs84(e_von - 200, N0)
    la1, lo1 = umgebung.lv95_zu_wgs84(e_bis + 200, N1)
    # die Kacheln des Streifens als Grenze für blaetter(): nur Blätter, die eine Kachel des Streifens berühren (die Blätter
    # sind Teile von Kartenblättern, etwa 4 × 3 km: jede Kachel zählt)
    kacheln = {(qe, qn) for qe in range(e_von // K, e_bis // K) for qn in range(N0 // K, N1 // K)}
    bl = build_gebaeude.blaetter(None, kacheln, (lo0 - 0.02, la0, lo1 + 0.02, la1))
    print(f"Teil {teil}: Ost {e_von} bis {e_bis}, {len(bl)} Kartenblätter", flush=True)
    bild, jahre, zahl = Dachbild(), {}, 0
    for i, (blatt, (jahr, href)) in enumerate(sorted(bl.items()), 1):
        datei = build_gebaeude.laden(blatt, jahr, href)
        if datei is None:
            print(f"  {blatt}: nicht geladen, fehlt", flush=True)
            continue
        n_blatt, hier = 0, {}
        try:
            for fl in build_gebaeude.gebaeude(datei):
                alle = np.concatenate([p for _, p in fl])
                me, mn = alle[:, 0].mean(), alle[:, 1].mean()
                if not e_von <= me < e_bis:
                    continue
                k = (int(me // K), int(mn // K))
                build_gebaeude.sammeln(fl, bild, hier.setdefault(k, []))
                jahre.setdefault(k, set()).add(jahr)
                n_blatt += 1
        except Exception as e:  # noqa: BLE001  ein kaputtes Blatt soll nicht den Streifen anhalten
            print(f"  {blatt}: {e}", flush=True)
        # je Kachel angehängt, eine Kachel kann auf zwei Blättern liegen
        for (qe, qn), teile in hier.items():
            with open(tmp / f"{qe}_{qn}.bin", "ab") as f:
                for d, fa in teile:
                    f.write(struct.pack("<I", len(d)))
                    f.write(d.astype("<f8").tobytes())
                    f.write(fa.astype("u1").tobytes())
        datei.unlink()
        zahl += n_blatt
        print(f"  {i}/{len(bl)} {blatt} ({jahr}): {n_blatt} Gebäude, {time.time() - t0:.0f} s", flush=True)
    groesse = 0
    for p in sorted(tmp.glob("*.bin")):
        qe, qn = (int(x) for x in p.stem.split("_"))
        roh, o, teile = p.read_bytes(), 0, []
        while o < len(roh):
            (m,) = struct.unpack_from("<I", roh, o); o += 4
            d = np.frombuffer(roh, "<f8", m * 9, o).reshape(m, 3, 3); o += m * 72
            fa = np.frombuffer(roh, "u1", m * 3, o).reshape(m, 3); o += m * 3
            teile.append((d, fa))
        groesse += build_gebaeude.schreiben(ziel, {(qe, qn): teile})
    shutil.rmtree(tmp, ignore_errors=True)
    name = teil.replace("/", "von")
    (ziel / f"index-g{name}.json").write_text(json.dumps({
        "quelle": "swissBUILDINGS3D 3.0 (swisstopo); Dachfarbe aus SWISSIMAGE (swisstopo) auf 2,5 m",
        "geladen": date.today().isoformat(), "kachel_m": K,
        "hinweis": "alle Gebäude der Quelle; Wandfarbe in keiner Quelle; Wände unten "
                   f"{build_gebaeude.WAND_TIEFER_M:g} m verlängert",
        "kacheln": {f"{qe}_{qn}": sorted(j) for (qe, qn), j in sorted(jahre.items())},
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Teil {teil}: {zahl} Gebäude in {len(jahre)} Kacheln, {groesse / 1e6:.0f} MB, {time.time() - t0:.0f} s", flush=True)


class Kronenbild:
    """Farbe aus dem Luftbild der App (data/luftbild, je 10-km-Kachel 1000 × 1000, 10 m, Zeilen von Norden)"""

    def __init__(self):
        self.kacheln = {}

    def farben(self, e, n):
        from PIL import Image
        raus = np.tile(np.array(GRUEN, np.uint8), (len(e), 1))
        ex, ny = (e // 10_000).astype(int), (n // 10_000).astype(int)
        for k in set(zip(ex.tolist(), ny.tolist())):
            if k not in self.kacheln:
                p = ROOT / "data" / "luftbild" / f"{k[0]}_{k[1]}.jpg"
                self.kacheln[k] = np.asarray(Image.open(p).convert("RGB")) if p.exists() else None
                if len(self.kacheln) > 12:
                    self.kacheln.pop(next(iter(self.kacheln)))
            a = self.kacheln[k]
            if a is None:
                continue
            w = (ex == k[0]) & (ny == k[1])
            je = a.shape[0] / 10_000
            x = np.clip(((e[w] - k[0] * 10_000) * je).astype(int), 0, a.shape[1] - 1)
            y = np.clip((((k[1] + 1) * 10_000 - n[w]) * je).astype(int), 0, a.shape[0] - 1)
            f = a[y, x]
            # weiss heisst: keine Aufnahme
            gut = f.mean(axis=1) <= 244
            ziel = np.nonzero(w)[0]
            raus[ziel[gut]] = f[gut]
        return raus


def baeume(teil):
    import build_baeume
    e_von, e_bis = streifen(teil)
    ziel = EXTERN / "baeume"
    ziel.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    bild, zahl, groesse, alle = Kronenbild(), {}, 0, 0
    # je 10-km-Spalte, damit der Speicher reicht
    for ex in range(e_von // 10_000, e_bis // 10_000):
        e0, e1 = ex * 10_000, (ex + 1) * 10_000
        for ny0 in range(N0 // 10_000, (N1 - 1) // 10_000 + 1, 5):
            n0, n1 = max(N0, ny0 * 10_000), min(N1, (ny0 + 5) * 10_000)
            kacheln = {(qe, qn) for qe in range(e0 // K, e1 // K) for qn in range(n0 // K, n1 // K)}
            eb = build_baeume.einzelbaeume(e0, n0, e1, n1)
            eb = np.concatenate([eb, np.zeros((len(eb), 1))], axis=1)
            fl = build_baeume.flaechen(e0, n0, e1, n1, kacheln, np.random.default_rng(ex * 1000 + ny0))
            b = np.concatenate([eb, fl])
            b = b[(b[:, 0] >= e0) & (b[:, 0] < e1) & (b[:, 1] >= n0) & (b[:, 1] < n1)]
            if not len(b):
                continue
            b = build_baeume.ohne_gleis(b, build_baeume.gleise(e0, n0, e1, n1))
            # je Kachel geordnet schreiben
            schl = (b[:, 0] // K).astype(np.int64) * 100_000 + (b[:, 1] // K).astype(np.int64)
            ordnung = np.argsort(schl, kind="stable")
            b, schl = b[ordnung], schl[ordnung]
            farben = bild.farben(b[:, 0], b[:, 1])
            grenzen = np.nonzero(np.diff(schl))[0] + 1
            for a_, z_ in zip(np.r_[0, grenzen], np.r_[grenzen, len(b)]):
                qe, qn = int(schl[a_] // 100_000), int(schl[a_] % 100_000)
                t = b[a_:z_]
                a = np.zeros(len(t), dtype=[("x", "<u2"), ("y", "<u2"), ("art", "u1"), ("f", "u1", 3)])
                a["x"] = np.clip(np.round((t[:, 0] - qe * K) * 10), 0, 5000)
                a["y"] = np.clip(np.round((t[:, 1] - qn * K) * 10), 0, 5000)
                a["art"] = t[:, 2]
                a["f"] = farben[a_:z_]
                datei = ziel / f"{qe}_{qn}.bmd"
                datei.write_bytes(gzip.compress(struct.pack("<iiI", qe * K, qn * K, len(a)) + a.tobytes(), 9))
                groesse += datei.stat().st_size
                zahl[f"{qe}_{qn}"] = len(a)
            alle += len(b)
            print(f"  Spalte {ex}, Nord ab {n0}: {len(b)} Bäume, {time.time() - t0:.0f} s", flush=True)
    name = teil.replace("/", "von")
    (ziel / f"index-b{name}.json").write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo): Einzelbaum und Bodenbedeckung; Kronenfarbe aus SWISSIMAGE (swisstopo) auf 10 m",
        "geladen": date.today().isoformat(), "kachel_m": K,
        "hinweis": "Einzelbäume wie in der Quelle; Waldflächen mit gezeichneten Bäumen gefüllt (Abstand je Art in keiner "
                   "Quelle); Höhe in keiner Quelle; keine Krone im Lichtraum der Gleise",
        "kacheln": zahl,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Teil {teil}: {alle} Bäume in {len(zahl)} Kacheln, {groesse / 1e6:.0f} MB, {time.time() - t0:.0f} s", flush=True)


def packen(teil):
    """die Kacheln aus EXTERN als ZIP-Pakete, die Verzeichnisse ins letzte"""
    PAKETE.mkdir(parents=True, exist_ok=True)
    for alt in PAKETE.glob(f"schweiz3dumwelt-{teil}-*.zip"):
        alt.unlink()
    dateien, verzeichnisse = [], []
    for art in ("gebaeude", "baeume"):
        q = EXTERN / art
        if q.exists():
            for p in sorted(q.iterdir()):
                (verzeichnisse if p.suffix == ".json" else dateien).append((p, f"schweiz3dumwelt/{art}/{p.name}"))
    if not verzeichnisse:
        raise SystemExit("nichts gebaut")
    pakete, jetzt, summe = [], [], 0
    for p, pfad in dateien:
        g = p.stat().st_size
        if jetzt and summe + g > GROESSE:
            pakete.append(jetzt); jetzt, summe = [], 0
        jetzt.append((p, pfad)); summe += g
    pakete.append(jetzt + verzeichnisse)
    for i, inhalt in enumerate(pakete, 1):
        name = PAKETE / f"schweiz3dumwelt-{teil}-{i:02d}.zip"
        with zipfile.ZipFile(name, "w", zipfile.ZIP_STORED) as z:
            for p, pfad in inhalt:
                z.write(p, pfad)
        print(f"{name.name}: {len(inhalt)} Dateien, {name.stat().st_size / 1e6:.0f} MB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--art", choices=["gebaeude", "baeume"])
    ap.add_argument("--teil", required=True, help="beim Bauen k/n, beim Packen der Name der Pakete")
    ap.add_argument("--packen", action="store_true")
    ap.add_argument("--nord", nargs=2, type=int, metavar=("VON", "BIS"), help="nur zum Ausprobieren: Nord in km, z. B. 1236 1244")
    a = ap.parse_args()
    if a.nord:
        global N0, N1
        N0, N1 = a.nord[0] * 1000, a.nord[1] * 1000
    if a.packen:
        packen(a.teil)
    elif a.art == "gebaeude":
        gebaeude(a.teil)
    elif a.art == "baeume":
        baeume(a.teil)
    else:
        ap.error("--art oder --packen")


if __name__ == "__main__":
    main()
