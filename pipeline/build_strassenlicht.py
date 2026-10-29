"""Strassen- und Bahnhofslicht für «3D Schweiz» (Michael, 2026-10-29: «Irgendwie fehlt schon noch eine Straßen- und allgemeine
Bahnhofbeleuchtung. Kannst du das nicht erfinden und einbauen?»).

Die Lampen selbst sind erfunden: keine unserer Quellen kennt Strassenlampen oder Perronbeleuchtung. Belegt ist nur, wo Strassen und
Gleise liegen. Daraus gewählt:
- Strassenlicht: auf Strassen aus swissTLM3D (Ebene TLM_STRASSE, Objektart in STRASSEN, ohne Tunnel) innerhalb von Siedlungen
  (swissTLMRegio, Bodenbedeckung Siedl und Stadtzentr), alle STRASSE_ABSTAND_M eine Lampe.
- Bahnhofslicht: auf Gleisen aus swissTLM3D (Ebene TLM_EISENBAHN, nur Bahn, ohne Tram, Metro, Tunnel und Standseilbahnen) bis BAHNHOF_M um die Lage
  jedes Bahnhofs im Netz von Taktland (data/strecken.json), alle GLEIS_ABSTAND_M eine Lampe.

Je 10-km-Kachel der Geländekacheln eine Datei {Ost}_{Nord}.lgz (gzip): die Zahl der Lampen (UInt32), dann je Lampe Ost und Nord
in Metern ab der Ecke der Kachel (UInt16) und die Art (UInt8: 1 Strasse, 2 Bahnhof). Nach data/strassenlicht, mit index.json.

    .venv/bin/python pipeline/build_strassenlicht.py      # nach fetch_tlm3d.py --strassen
"""
import gzip
import json
import math
import sqlite3
import struct
from datetime import date
from pathlib import Path

import numpy as np
import shapefile
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
STRASSE = ROOT / "data" / "raw" / "tlm3d" / "swissTLM3D_TLM_STRASSE"
BAHN = ROOT / "data" / "raw" / "tlm3d" / "swissTLM3D_TLM_EISENBAHN"
REGIO = ROOT / "data" / "raw" / "tlmregio" / "swissTLMRegio_Product_LV95.gpkg"
ZIEL = ROOT / "data" / "strassenlicht"
KACHEL_M = 10_000
#: Strassen mit Licht (Objektarten von TLM_STRASSE); Wege, Autobahnen und Plätze ohne (gewählt)
STRASSEN = {"3m Strasse", "4m Strasse", "6m Strasse", "8m Strasse", "10m Strasse"}
#: Abstand der Lampen (gewählt, in keiner Quelle)
STRASSE_ABSTAND_M = 35
GLEIS_ABSTAND_M = 30
BAHNHOF_M = 250
#: höchstens eine Lampe je Zelle so vieler Meter (gewählt)
ZELLE_M = {1: 15, 2: 25}
#: Raster der Siedlungsmaske
MASKE_M = 25
RAHMEN = (2_480_000, 1_070_000, 2_840_000, 1_300_000)


def wgs84_zu_lv95(la, lo):
    p = (la * 3600 - 169028.66) / 10000
    l = (lo * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return e, n


def polygone(b):
    """Polygone aus einer GeoPackage-Geometrie (2D, Polygon oder MultiPolygon): je Polygon die Ringe als (Ost, Nord)"""
    pos = 8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(b[3] >> 1) & 7]

    def lies(pos):
        o = "<" if b[pos] == 1 else ">"
        roh = struct.unpack_from(o + "I", b, pos + 1)[0]
        typ, dim = roh % 1000, 2 + (roh // 1000 in (1, 2)) + (roh // 1000 == 3) * 2
        pos += 5
        if typ == 3:
            n = struct.unpack_from(o + "I", b, pos)[0]
            pos += 4
            ringe = []
            for _ in range(n):
                m = struct.unpack_from(o + "I", b, pos)[0]
                pos += 4
                w = struct.unpack_from(o + "d" * (dim * m), b, pos)
                pos += 8 * dim * m
                ringe.append(list(zip(w[0::dim], w[1::dim])))
            return [ringe], pos
        if typ == 6:
            n = struct.unpack_from(o + "I", b, pos)[0]
            pos += 4
            alle = []
            for _ in range(n):
                t, pos = lies(pos)
                alle += t
            return alle, pos
        raise ValueError(f"Geometrietyp {roh} nicht erwartet")
    return lies(pos)[0]


def siedlung():
    """Maske der Siedlungen im Raster MASKE_M: True in Siedl und Stadtzentr, Löcher frei"""
    x0, y0, x1, y1 = RAHMEN
    b, h = (x1 - x0) // MASKE_M, (y1 - y0) // MASKE_M
    bild = Image.new("1", (b, h), 0)
    g = ImageDraw.Draw(bild)
    zu = lambda ring: [((e - x0) / MASKE_M, (y1 - n) / MASKE_M) for e, n in ring]
    for (geom,) in sqlite3.connect(REGIO).execute(
            "select geom from tlmregio_landcover_landcover where objval in ('Siedl', 'Stadtzentr')"):
        for poly in polygone(geom):
            g.polygon(zu(poly[0]), fill=1)
            for loch in poly[1:]:
                g.polygon(zu(loch), fill=0)
    return np.array(bild, dtype=bool)


def entlang(pts, abstand, rest):
    """Punkte alle abstand Meter entlang einer Linie, rest: wie weit seit der letzten Lampe; gibt Punkte und neuen Rest"""
    raus = []
    for (a, c), (d, e) in zip(pts, pts[1:]):
        l = math.hypot(d - a, e - c)
        s = abstand - rest
        while s <= l:
            t = s / l if l else 0
            raus.append((a + (d - a) * t, c + (e - c) * t))
            s += abstand
        rest = l - (s - abstand)
    return raus, rest


def main():
    x0, y0, x1, y1 = RAHMEN
    maske = siedlung()
    drin = lambda e, n: (x0 <= e < x1 and y0 <= n < y1 and maske[int((y1 - n) // MASKE_M), int((e - x0) // MASKE_M)])
    lampen = {}
    zahl = {1: 0, 2: 0}

    belegt = set()

    def setzen(e, n, art):
        # höchstens eine Lampe je Zelle: viele kurze Stücke (Weichen, Kreuzungen) bekämen sonst je eine eigene, im Gleisfeld von Bern
        # wurde das ein weisser Fleck
        z = ZELLE_M[art]
        zelle = (art, int(e // z), int(n // z))
        if zelle in belegt:
            return
        belegt.add(zelle)
        k = (int(e // KACHEL_M), int(n // KACHEL_M))
        lampen.setdefault(k, []).append((round(e - k[0] * KACHEL_M), round(n - k[1] * KACHEL_M), art))
        zahl[art] += 1

    r = shapefile.Reader(str(STRASSE))
    for i, rec in enumerate(r.iterRecords(fields=["OBJEKTART", "KUNSTBAUTE"])):
        if rec["OBJEKTART"] not in STRASSEN or rec["KUNSTBAUTE"] == "Tunnel":
            continue
        s = r.shape(i)
        pts = [p[:2] for p in s.points]
        teile = list(s.parts) + [len(pts)]
        for a, b in zip(teile, teile[1:]):
            punkte, _ = entlang(pts[a:b], STRASSE_ABSTAND_M, STRASSE_ABSTAND_M / 2)
            for e, n in punkte:
                if drin(e, n):
                    setzen(e, n, 1)
    # Bahnhöfe des Netzes und ihre Lage
    netz = json.loads((ROOT / "data" / "strecken.json").read_text(encoding="utf-8"))
    orte = np.array([wgs84_zu_lv95(*netz["lagen"][abk]) for uic, abk in netz["bahnhoefe"].items()
                     if int(uic) > 0 and abk in netz["lagen"]])
    zelle = {}
    for e, n in orte:
        zelle.setdefault((int(e // 1000), int(n // 1000)), []).append((e, n))

    def am_bahnhof(e, n):
        ke, kn = int(e // 1000), int(n // 1000)
        return any(math.hypot(e - a, n - c) <= BAHNHOF_M for de in (-1, 0, 1) for dn in (-1, 0, 1)
                   for a, c in zelle.get((ke + de, kn + dn), ()))

    r = shapefile.Reader(str(BAHN))
    felder = [f[0] for f in r.fields[1:]]
    for i, rec in enumerate(r.iterRecords()):
        d = dict(zip(felder, rec))
        if d.get("KUNSTBAUTE") == "Tunnel" or d.get("VERKEHRSMI") != "Bahn" or d.get("STANDSEILB") not in ("Falsch", None, ""):
            continue
        s = r.shape(i)
        pts = [p[:2] for p in s.points]
        teile = list(s.parts) + [len(pts)]
        for a, b in zip(teile, teile[1:]):
            punkte, _ = entlang(pts[a:b], GLEIS_ABSTAND_M, GLEIS_ABSTAND_M / 2)
            for e, n in punkte:
                if am_bahnhof(e, n):
                    setzen(e, n, 2)
    ZIEL.mkdir(parents=True, exist_ok=True)
    for p in ZIEL.glob("*.lgz"):
        p.unlink()
    groesse = 0
    for (ex, ny), liste in lampen.items():
        a = np.array(liste, dtype=np.int32)
        a[:, :2] = np.clip(a[:, :2], 0, KACHEL_M)
        teile = [struct.pack("<I", len(a)), b"".join(struct.pack("<HHB", int(x), int(y), int(t)) for x, y, t in a)]
        datei = ZIEL / f"{ex}_{ny}.lgz"
        datei.write_bytes(gzip.compress(b"".join(teile), 9, mtime=0))
        groesse += datei.stat().st_size
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo), Ebenen Strasse und Eisenbahn; Siedlungen aus swissTLMRegio (swisstopo); Bahnhöfe aus data/strecken.json",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M,
        "hinweis": "Lampen erfunden: in keiner Quelle; nur die Lage von Strassen, Gleisen, Siedlungen und Bahnhöfen ist belegt. "
                   f"Strassen ({', '.join(sorted(STRASSEN))}) in Siedlungen alle {STRASSE_ABSTAND_M} m, Gleise bis {BAHNHOF_M} m um "
                   f"Bahnhöfe alle {GLEIS_ABSTAND_M} m, je Zelle von {ZELLE_M[1]} m (Strasse) und {ZELLE_M[2]} m (Bahnhof) höchstens eine",
        "arten": {"1": "Strasse", "2": "Bahnhof"}, "lampen": {"strasse": zahl[1], "bahnhof": zahl[2]},
        "kacheln": sorted(f"{ex}_{ny}" for ex, ny in lampen),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{zahl[1]} Strassenlampen, {zahl[2]} am Bahnhof, {len(lampen)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
