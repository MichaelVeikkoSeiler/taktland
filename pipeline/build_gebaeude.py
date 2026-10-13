"""Gebäude entlang der Bahnlinien für den Führerstand, ein Versuch auf Gümmenen–Bern (Michael, 2026-10-13: «Ja, fang mit
dem Versuch auf Gümmenen Bern an»).

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

    .venv/bin/python pipeline/build_gebaeude.py
"""
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

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "gebaeude"
ROH = ROOT / "data" / "raw" / "gebaeude"
NAH = ROOT / "data" / "luftbild_nah"
STAC = "https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_3_0/items"
KACHEL_M = 500
BAND_M = 400
WAND_TIEFER_M = 2.0
WAND = (196, 192, 184)
#: der Versuch, in Fahrtreihenfolge
ORTE = ["Gümmenen", "Rosshäusern", "Bern Riedbach", "Bern Bümpliz Nord", "Bern Stöckacker", "Bern"]
GML = "{http://www.opengis.net/gml}"
BLDG = "{http://www.opengis.net/citygml/building/2.0}"


def blaetter(strecken):
    """die Kartenblätter, die das Band berühren: {Blatt: (Jahr, Adresse der CityGML)}, je Blatt der neueste Jahrgang"""
    d = json.loads((ROOT / "data" / "strecken.json").read_text(encoding="utf-8"))
    lage = {name: d["lagen"][abk] for abk, name in d["punkte"].items() if abk in d["lagen"]}
    lat = [lage[o][0] for o in ORTE]; lon = [lage[o][1] for o in ORTE]
    bbox = f"{min(lon) - 0.02},{min(lat) - 0.015},{max(lon) + 0.02},{max(lat) + 0.015}"
    raus, url = {}, f"{STAC}?bbox={bbox}&limit=100"
    while url:
        with urllib.request.urlopen(url, timeout=60) as r:
            seite = json.load(r)
        for f in seite["features"]:
            teile = f["id"].split("_")
            if len(teile) < 5:
                continue
            jahr, blatt = int(teile[3]), teile[4]
            gml = [a["href"] for a in f["assets"].values() if a["href"].endswith(".citygml.zip")]
            if gml and (blatt not in raus or raus[blatt][0] < jahr):
                raus[blatt] = (jahr, gml[0])
        url = next((l["href"] for l in seite.get("links", []) if l["rel"] == "next"), None)
    return raus


def laden(blatt, jahr, href):
    ROH.mkdir(parents=True, exist_ok=True)
    datei = ROH / f"{jahr}_{blatt}.citygml.zip"
    if not datei.exists():
        with urllib.request.urlopen(href, timeout=600) as r:
            datei.write_bytes(r.read())
    return datei


class Luftbild:
    """Farbe des Luftbilds auf 2,5 m (data/luftbild_nah, je km 400 × 400, Zeilen von Norden)"""
    def __init__(self):
        self.km = {}

    def farbe(self, e, n):
        ke, kn = int(e // 1000), int(n // 1000)
        if (ke, kn) not in self.km:
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


def main():
    strecken = build_scharf.strecken_entlang(ORTE)
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
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "band_m": BAND_M, "orte": ORTE,
        "hinweis": "Versuch: nur Gebäude bis band_m neben den Bahnlinien; Wandfarbe in keiner Quelle; Wände unten "
                   f"{WAND_TIEFER_M:g} m verlängert",
        "kacheln": {f"{qe}_{qn}": sorted(jahre[(qe, qn)]) for qe, qn in sorted(kacheln)},
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{zahl} Gebäude in {len(kacheln)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
