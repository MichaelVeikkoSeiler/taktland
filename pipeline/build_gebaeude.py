"""Gebäude entlang der Bahnlinien für den Führerstand, ein Versuch auf Gümmenen–Bern (Michael, 2026-10-13: «Ja, fang mit
dem Versuch auf Gümmenen Bern an»), dann auf den Strecken der scharfen Umgebung bis Neuchâtel («Restliche Strecke bis
Neuchatel»).

Quelle: swissBUILDINGS3D 3.0 (swisstopo), je Kartenblatt als CityGML, der neueste Jahrgang mit CityGML. Gelesen werden die
Dach- und Wandflächen jedes Gebäudes, nur Gebäude mit ihrer Mitte bis BAND_M neben den Bahnlinien aus swissTLMRegio, die
höchstens KORRIDOR_M neben dem Zug durch die Orte liegen (wie pipeline/build_scharf.py). Jede Fläche wird in Dreiecke
zerlegt (Ohrenschneiden, mapbox_earcut); Löcher in Flächen bleiben zu.

Farben: Dächer in der Farbe des Luftbilds an ihrer Stelle (SWISSIMAGE auf 2,5 m, data/luftbild_nah, gemittelt über 3 × 3
Bildpunkte); Wände in einem Grau, das in keiner Quelle steht. Wände reichen unten WAND_TIEFER_M tiefer als in der Quelle,
damit sie auf dem gröberen Gelände der App nicht schweben.

Je Kachel von KACHEL_M eine Datei {Ost}_{Nord}.bgz (gzip): vorne Ost und Nord der Kachel in Metern und die tiefste Höhe in
Dezimetern (je Int32), die Zahl der Ecken (UInt32), dann je Ecke Ost, Höhe, Nord in Dezimetern ab der Ecke der Kachel und
der tiefsten Höhe (Int16) und die Farbe (3 × UInt8, dazu 1 Byte frei), je drei Ecken ein Dreieck. index.json hält die
Kacheln und je Kachel die Jahrgänge der Blätter fest.

Mit --kanton BE VS … statt dessen das ganze Band neben allen Bahnlinien eines Kantons (pipeline/umgebung.py) für
daten.taktland.ch nach data/gebaeude_extern, je Kanton ein Verzeichnis index-{Kanton}.json; die geladenen Blätter werden
danach gelöscht (Michael, 2026-10-13: «Als erstes den Kanton Bern, dann Kanton Wallis, dann Kanton Neuenburg und Waadt.
Dann der Rest.»). --alle baut alle Kantone in dieser Reihenfolge.

    .venv/bin/python pipeline/build_gebaeude.py
    .venv/bin/python pipeline/build_gebaeude.py --kanton BE
"""
import argparse
import time
import gzip
import io
import json
import struct
import sys
import urllib.request
import zipfile
from datetime import date
from pathlib import Path
from xml.etree.ElementTree import iterparse

import mapbox_earcut as earcut
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_scharf  # noqa: E402
import build_relief  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "gebaeude"
ROH = ROOT / "data" / "raw" / "gebaeude"
NAH = ROOT / "data" / "luftbild_nah"
STAC = "https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_3_0/items"
KACHEL_M = 500
BAND_M = 400
WAND_TIEFER_M = 2.0
WAND = (196, 192, 184)
#: die Strecken des Versuchs, je in Fahrtreihenfolge: die der scharfen Umgebung bis Neuchâtel (pipeline/build_scharf.py)
STRECKEN = build_scharf.STRECKEN[:3]
GML = "{http://www.opengis.net/gml}"
BLDG = "{http://www.opengis.net/citygml/building/2.0}"


def stac(url):
    for versuch in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print(f"  STAC: {e}, Versuch {versuch + 2}")
            time.sleep(5 * (versuch + 1))
    raise SystemExit("STAC nicht erreichbar")


def blaetter(strecken, kacheln=None, bbox=None):
    """die Kartenblätter, die das Band berühren: {Blatt: (Jahr, Adresse der CityGML)}, je Blatt der neueste Jahrgang;
    mit kacheln die Blätter, die eine dieser Kacheln berühren"""
    if bbox is None:
        d = json.loads((ROOT / "data" / "strecken.json").read_text(encoding="utf-8"))
        lage = {name: d["lagen"][abk] for abk, name in d["punkte"].items() if abk in d["lagen"]}
        orte = [o for st in STRECKEN for o in st]
        lat = [lage[o][0] for o in orte]; lon = [lage[o][1] for o in orte]
        bbox = (min(lon) - 0.02, min(lat) - 0.015, max(lon) + 0.02, max(lat) + 0.015)
    raus, url = {}, f"{STAC}?bbox={','.join(f'{v:.5f}' for v in bbox)}&limit=100"
    while url:
        seite = stac(url)
        for f in seite["features"]:
            teile = f["id"].split("_")
            if len(teile) < 5:
                continue
            jahr, blatt = int(teile[3]), teile[4]
            # nur Blätter, die das Band berühren: ein Punkt der Linien im Blatt, um BAND_M vergrössert
            w, s_, o, n_ = f["bbox"]
            e0, n0 = build_relief.wgs84_zu_lv95(s_, w); e1, n1 = build_relief.wgs84_zu_lv95(n_, o)
            if kacheln is not None:
                k = KACHEL_M
                if not any(e0 - k <= qe * k <= e1 and n0 - k <= qn * k <= n1 for qe, qn in kacheln):
                    continue
            elif not any(e0 - BAND_M <= x <= e1 + BAND_M and n0 - BAND_M <= y <= n1 + BAND_M for st in strecken for x, y in
                       ((st[0], st[1]), (st[2], st[3]))):
                continue
            gml = [a["href"] for a in f["assets"].values() if a["href"].endswith(".citygml.zip")]
            if gml and (blatt not in raus or raus[blatt][0] < jahr):
                raus[blatt] = (jahr, gml[0])
        url = next((l["href"] for l in seite.get("links", []) if l["rel"] == "next"), None)
    return raus


def laden(blatt, jahr, href):
    ROH.mkdir(parents=True, exist_ok=True)
    datei = ROH / f"{jahr}_{blatt}.citygml.zip"
    for versuch in range(4):
        if datei.exists():
            break
        try:
            with urllib.request.urlopen(href, timeout=600) as r:
                daten = r.read()
            datei.with_suffix(".teil").write_bytes(daten)
            datei.with_suffix(".teil").rename(datei)
        except Exception as e:  # abgebrochene Übertragung: noch einmal
            print(f"  {blatt}: {e}, Versuch {versuch + 2}")
            time.sleep(10 * (versuch + 1))
    return datei if datei.exists() else None


class Luftbild:
    """Farbe des Luftbilds auf 2,5 m (data/luftbild_nah, je km 400 × 400, Zeilen von Norden)"""
    def __init__(self):
        self.km = {}

    def farbe(self, e, n):
        ke, kn = int(e // 1000), int(n // 1000)
        if (ke, kn) not in self.km:
            while len(self.km) >= 300:  # ein Kanton hat Tausende km, nur die letzten bleiben im Speicher
                self.km.pop(next(iter(self.km)))
            p = NAH / f"{ke}_{kn}.jpg"
            self.km[(ke, kn)] = np.asarray(Image.open(p).convert("RGB")) if p.exists() else None
        a = self.km[(ke, kn)]
        if a is None:
            return None
        je = a.shape[0] / 1000
        x, y = int((e - ke * 1000) * je), int(((kn + 1) * 1000 - n) * je)
        f = a[max(0, y - 1):y + 2, max(0, x - 1):x + 2].reshape(-1, 3).astype(float)
        # weiss heisst ausserhalb des Nahbilds
        if f.mean() > 244:
            return None
        return tuple(int(v) for v in f.mean(axis=0))


def dreiecke(p):
    """eine ebene Fläche (k × 3) in Dreiecke, als Liste von Eckenlisten"""
    if len(p) > 3 and np.allclose(p[0], p[-1]):
        p = p[:-1]
    if len(p) < 3:
        return []
    if len(p) == 3:
        return [p]
    # Normale nach Newell, dann in die Ebene der zwei anderen Achsen
    nrm = np.zeros(3)
    for a, b in zip(p, np.roll(p, -1, axis=0)):
        nrm += [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]
    weg = int(np.argmax(np.abs(nrm)))
    zwei = p[:, [i for i in range(3) if i != weg]].astype(np.float64)
    idx = earcut.triangulate_float64(zwei - zwei.mean(axis=0), np.array([len(zwei)], dtype=np.uint32))
    return [p[idx[i:i + 3]] for i in range(0, len(idx), 3)]


def gebaeude(datei):
    """je Gebäude seine Dach- und Wandflächen: [(art, Punkte k × 3)]"""
    with zipfile.ZipFile(datei) as z:
        name = next(n for n in z.namelist() if n.endswith(".gml"))
        with z.open(name) as f:
            for _, el in iterparse(f, events=("end",)):
                if el.tag != BLDG + "Building":
                    continue
                flaechen = []
                for art in ("RoofSurface", "WallSurface"):
                    for fl in el.iter(BLDG + art):
                        for pl in fl.iter(GML + "exterior"):
                            pos = pl.find(f".//{GML}posList")
                            if pos is None or not pos.text:
                                continue
                            flaechen.append((art, np.array(pos.text.split(), dtype=float).reshape(-1, 3)))
                el.clear()
                if flaechen:
                    yield flaechen


def schreiben(ziel, kacheln):
    """je Kachel eine .bgz; kacheln: {(qe, qn): [(Dreiecke n × 3 × 3, Farben n × 3)]}; gibt die Grösse zurück"""
    groesse = 0
    for (qe, qn), teile in kacheln.items():
        drei = np.concatenate([d for d, _ in teile]); farben = np.concatenate([f for _, f in teile])
        e0, n0 = qe * KACHEL_M, qn * KACHEL_M
        h0 = int(np.floor(drei[:, :, 2].min() * 10))
        a = np.zeros(len(drei) * 3, dtype=[("x", "<i2"), ("h", "<i2"), ("y", "<i2"), ("f", "u1", 4)])
        p = drei.reshape(-1, 3)
        a["x"] = np.round((p[:, 0] - e0) * 10); a["h"] = np.round(p[:, 2] * 10) - h0; a["y"] = np.round((p[:, 1] - n0) * 10)
        a["f"][:, :3] = np.repeat(farben, 3, axis=0)
        datei = ziel / f"{qe}_{qn}.bgz"
        datei.write_bytes(gzip.compress(struct.pack("<iiiI", e0, n0, h0, len(a)) + a.tobytes(), 9))
        groesse += datei.stat().st_size
    return groesse


def sammeln(fl, bild, ziel):
    """die Dreiecke eines Gebäudes in die Liste ziel"""
    alle = np.concatenate([p for _, p in fl])
    me, mn = alle[:, 0].mean(), alle[:, 1].mean()
    boden = alle[:, 2].min()
    dach = bild.farbe(me, mn) or (150, 140, 130)
    drei, farben = [], []
    for art, p in fl:
        if art == "WallSurface":
            p = p.copy()
            p[p[:, 2] < boden + 0.3, 2] -= WAND_TIEFER_M
        for d in dreiecke(p):
            drei.append(d); farben.append(dach if art == "RoofSurface" else WAND)
    if drei:
        ziel.append((np.array(drei, dtype=np.float64), np.array(farben, dtype=np.uint8)))


def kanton(kt, band, kt_ringe, bild):
    """das Band eines Kantons nach data/gebaeude_extern"""
    import umgebung
    ziel = ROOT / "data" / "gebaeude_extern"
    ziel.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    kacheln = band.kacheln(kt, kt_ringe)
    bl = blaetter(None, kacheln, umgebung.bbox_wgs84(kacheln))
    print(f"{kt}: {len(kacheln)} Kacheln, {len(bl)} Kartenblätter", flush=True)
    je, jahre, zahl, groesse = {}, {}, 0, 0
    for i, (blatt, (jahr, href)) in enumerate(sorted(bl.items()), 1):
        datei = laden(blatt, jahr, href)
        if datei is None:
            print(f"  {blatt}: nicht geladen, fehlt", flush=True)
            continue
        n_blatt, hier = 0, {}
        try:
            for fl in gebaeude(datei):
                alle = np.concatenate([p for _, p in fl])
                me, mn = alle[:, 0].mean(), alle[:, 1].mean()
                k = (int(me // KACHEL_M), int(mn // KACHEL_M))
                if k not in kacheln or not band.abstand(k[0], k[1], np.array([me]), np.array([mn]))[0] <= umgebung.BAND_M:
                    continue
                sammeln(fl, bild, hier.setdefault(k, []))
                jahre.setdefault(k, set()).add(jahr)
                n_blatt += 1
        except Exception as e:  # noqa: BLE001  ein kaputtes Blatt soll nicht den Kanton anhalten
            print(f"  {blatt}: {e}", flush=True)
        for k, v in hier.items():
            je.setdefault(k, []).extend(v)
        datei.unlink()
        zahl += n_blatt
        print(f"  {i}/{len(bl)} {blatt} ({jahr}): {n_blatt} Gebäude, {time.time() - t0:.0f} s", flush=True)
    for k in je:
        (ziel / f"{k[0]}_{k[1]}.bgz").unlink(missing_ok=True)
    groesse = schreiben(ziel, je)
    (ziel / f"index-{kt}.json").write_text(json.dumps({
        "quelle": "swissBUILDINGS3D 3.0 (swisstopo); Dachfarbe aus SWISSIMAGE (swisstopo) auf 2,5 m",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "band_m": umgebung.BAND_M, "kanton": kt,
        "hinweis": "nur Gebäude bis band_m neben den Bahnlinien (swissTLMRegio); Wandfarbe in keiner Quelle; Wände unten "
                   f"{WAND_TIEFER_M:g} m verlängert",
        "kacheln": {f"{qe}_{qn}": sorted(jahre[(qe, qn)]) for qe, qn in sorted(je)},
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{kt}: {zahl} Gebäude in {len(je)} Kacheln, {groesse / 1e6:.1f} MB, {time.time() - t0:.0f} s", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kanton", nargs="*", help="Kantone für daten.taktland.ch, z. B. BE VS")
    ap.add_argument("--alle", action="store_true", help="alle Kantone, zuerst BE, VS, NE, VD")
    a = ap.parse_args()
    if a.kanton or a.alle:
        import umgebung
        kt_ringe = umgebung.kantone()
        band = umgebung.Band()
        bild = Luftbild()
        for kt in (umgebung.alle_kantone() if a.alle else a.kanton):
            kanton(kt, band, kt_ringe, bild)
        return
    versuch()


def versuch():
    strecken = [s for orte in STRECKEN for s in build_scharf.strecken_entlang(orte)]
    print(f"{len(strecken)} Stücke Bahnlinie")
    bl = blaetter(strecken)
    print(f"{len(bl)} Kartenblätter: {', '.join(f'{b} ({j})' for b, (j, _) in sorted(bl.items()))}")
    bild = Luftbild()
    kacheln = {}
    jahre = {}
    zahl = 0
    for blatt, (jahr, href) in sorted(bl.items()):
        datei = laden(blatt, jahr, href)
        n_blatt = 0
        for fl in gebaeude(datei):
            alle = np.concatenate([p for _, p in fl])
            me, mn = alle[:, 0].mean(), alle[:, 1].mean()
            if build_scharf.abstand(strecken, np.array([me]), np.array([mn]))[0] > BAND_M:
                continue
            boden = alle[:, 2].min()
            dach = bild.farbe(me, mn) or (150, 140, 130)
            k = (int(me // KACHEL_M), int(mn // KACHEL_M))
            ziel = kacheln.setdefault(k, [])
            for art, p in fl:
                if art == "WallSurface":
                    p = p.copy()
                    p[p[:, 2] < boden + 0.3, 2] -= WAND_TIEFER_M
                farbe = dach if art == "RoofSurface" else WAND
                for d in dreiecke(p):
                    ziel.append((d, farbe))
            jahre.setdefault(k, set()).add(jahr)
            n_blatt += 1
        zahl += n_blatt
        print(f"  {blatt}: {n_blatt} Gebäude")
    ZIEL.mkdir(parents=True, exist_ok=True)
    for p in ZIEL.glob("*.bgz"):
        p.unlink()
    groesse = 0
    for (qe, qn), drei in kacheln.items():
        e0, n0 = qe * KACHEL_M, qn * KACHEL_M
        tief = min(d[:, 2].min() for d, _ in drei)
        h0 = int(np.floor(tief * 10))
        buf = io.BytesIO()
        buf.write(struct.pack("<iiiI", e0, n0, h0, len(drei) * 3))
        for d, (r, g, b) in drei:
            for x, y, z in d:
                buf.write(struct.pack("<hhhBBBB", round((x - e0) * 10), round(z * 10) - h0, round((y - n0) * 10), r, g, b, 0))
        datei = ZIEL / f"{qe}_{qn}.bgz"
        datei.write_bytes(gzip.compress(buf.getvalue(), 9))
        groesse += datei.stat().st_size
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissBUILDINGS3D 3.0 (swisstopo); Dachfarbe aus SWISSIMAGE (swisstopo) auf 2,5 m",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "band_m": BAND_M, "strecken": STRECKEN,
        "hinweis": "Versuch: nur Gebäude bis band_m neben den Bahnlinien; Wandfarbe in keiner Quelle; Wände unten "
                   f"{WAND_TIEFER_M:g} m verlängert",
        "kacheln": {f"{qe}_{qn}": sorted(jahre[(qe, qn)]) for qe, qn in sorted(kacheln)},
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{zahl} Gebäude in {len(kacheln)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
