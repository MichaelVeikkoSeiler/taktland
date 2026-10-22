"""Übersicht der ganzen Schweiz für das Spiel «3D Schweiz» (Michael, 2026-10-18): dieselben Daten wie die Geländekacheln
(data/gelaende, swissALTIRegio auf 50 m) und das Luftbild (data/luftbild, SWISSIMAGE auf 10 m), nur gröber, damit die
ganze Schweiz auf einmal lädt: Höhen auf 500 m (Mittel der 50-m-Felder), ein Luftbild auf 100 m.

Dazu orte.json (Michael, 2026-10-21: «die Ortschaften eintragen … wie wir das bei Taktland schon haben»): alle Ortschaften und
Weiler aus swissTLMRegio (swisstopo, Namen, Objektart …Ortschaft… und Weiler) mit Lage in LV95 und einem Rang nach der Objektart
der Quelle (HOrtschaft3 6, HOrtschaft2 5, HOrtschaft1 4, GOrtschaft 3, MOrtschaft 2, KOrtschaft 1, Weiler 0); welche die App
in welcher Stufe zeigt, entscheidet dieser Rang.

    .venv/bin/python pipeline/build_schweiz3d.py
"""
import gzip
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GELAENDE = ROOT / "data" / "gelaende"
LUFTBILD = ROOT / "data" / "luftbild"
# Grundton, wo es kein Luftbild gibt (wie die Leinwand der Region in komponenten/Schweiz3D.tsx, #d8d5c2)
GRUND = (216, 213, 194)
ZIEL = ROOT / "data" / "schweiz3d"
GROB_M = 500
BILD_M = 100


def kachel(name, zellen):
    d = np.frombuffer(gzip.decompress((GELAENDE / f"{name}.hgz").read_bytes()), "<i2").reshape(zellen, zellen)
    return np.cumsum(d.astype(np.int32), axis=1).astype(np.float32)


RANG = {"HOrtschaft3": 6, "HOrtschaft2": 5, "HOrtschaft1": 4, "GOrtschaft": 3, "MOrtschaft": 2, "KOrtschaft": 1, "Weiler": 0}


def orte():
    """[Name, Ost, Nord, Rang] aller Ortschaften und Weiler aus swissTLMRegio"""
    import sqlite3
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from build_bodenbedeckung import laden
    from build_kartengrund import punkt
    raus = []
    for geom, n1, n2, art in sqlite3.connect(laden()).execute(
            "select geom, namn1, namn2, objval from tlmregio_names_namedlocation"):
        # N_A: kein zweiter Name in der Quelle
        if art not in RANG or not n1 or n1 == "N_A":
            continue
        e, n = punkt(geom)
        raus.append([n1 if not n2 or n2 == "N_A" else f"{n1}/{n2}", round(e), round(n), RANG[art]])
    return sorted(raus, key=lambda o: (-o[3], o[0]))


def main():
    ix = json.loads((GELAENDE / "index.json").read_text(encoding="utf-8"))
    k, m, zellen = ix["kachel_m"], ix["raster_m"], ix["zellen"]
    lagen = [tuple(map(int, n.split("_"))) for n in ix["kacheln"]]
    ex0, ex1 = min(e for e, _ in lagen), max(e for e, _ in lagen) + 1
    ny0, ny1 = min(n for _, n in lagen), max(n for _, n in lagen) + 1
    je = k // GROB_M
    breite, hoehe = (ex1 - ex0) * je, (ny1 - ny0) * je
    h = np.zeros((hoehe, breite), np.uint16)
    f = GROB_M // m
    for ex, ny in lagen:
        a = kachel(f"{ex}_{ny}", zellen)
        leer = a <= 0
        a[leer] = np.nan
        with np.errstate(all="ignore"):
            g = np.nanmean(a.reshape(je, f, je, f), axis=(1, 3))
        g = np.where(np.isfinite(g), np.round(g), 0)
        j0 = (ny1 - 1 - ny) * je
        h[j0:j0 + je, (ex - ex0) * je:(ex - ex0 + 1) * je] = g.astype(np.uint16)
    ZIEL.mkdir(parents=True, exist_ok=True)
    (ZIEL / "hoehen.hgz").write_bytes(gzip.compress(h.astype("<u2").tobytes(), 9, mtime=0))

    lb = json.loads((LUFTBILD / "index.json").read_text(encoding="utf-8"))
    px = k // BILD_M
    bild = Image.new("RGB", ((ex1 - ex0) * px, (ny1 - ny0) * px), GRUND)
    jahre = set()
    for name, info in lb["kacheln"].items():
        ex, ny = map(int, name.split("_"))
        if not (ex0 <= ex < ex1 and ny0 <= ny < ny1) or not (LUFTBILD / f"{name}.jpg").exists():
            continue
        t = Image.open(LUFTBILD / f"{name}.jpg").convert("RGB").resize((px, px), Image.LANCZOS)
        bild.paste(t, ((ex - ex0) * px, (ny1 - 1 - ny) * px))
        jahre |= set(info.get("jahre", []))
    # jenseits der Grenze hat swisstopo keine Aufnahme, die Kacheln sind dort reinweiss: in denselben Grundton wie die Stellen
    # ganz ohne Kachel (Michael, 2026-10-22: «Kachelung mit den zwei hellgrau sieht nicht hübsch aus»), samt 2 Bildpunkten
    # Saum, den das JPEG aufgehellt hat; Schnee und Gletscher erreichen 250 nicht in allen drei Farben
    a = np.asarray(bild).copy()
    leer = a.min(axis=2) >= 250
    for _ in range(2):
        leer = leer | np.roll(leer, 1, 0) | np.roll(leer, -1, 0) | np.roll(leer, 1, 1) | np.roll(leer, -1, 1)
    a[leer] = GRUND
    bild = Image.fromarray(a)
    bild.save(ZIEL / "luftbild.jpg", quality=82, optimize=True, progressive=True)
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle_gelaende": ix["quelle"] + f", für die Übersicht auf {GROB_M} m gemittelt",
        "quelle_luftbild": lb["quelle"] + f", für die Übersicht auf {BILD_M} m verkleinert",
        "ost": ex0 * k, "nord": ny1 * k, "m": GROB_M, "breite": breite, "hoehe": hoehe, "bild_m": BILD_M,
        "jahre": sorted(jahre), "hinweis": "Höhen in Metern als UInt16, Zeilen von Norden, 0: keine Höhe.",
    }, ensure_ascii=False), encoding="utf-8")
    o = orte()
    (ZIEL / "orte.json").write_text(json.dumps({
        "quelle": "swissTLMRegio (swisstopo), Namen: Ortschaften und Weiler",
        "hinweis": "je Ort Name, Ost, Nord (LV95), Rang nach der Objektart der Quelle: 6 HOrtschaft3 … 1 KOrtschaft, 0 Weiler",
        "orte": o,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(o)} Orte")
    print(f"{breite} × {hoehe} Höhen, Luftbild {bild.size[0]} × {bild.size[1]}, "
          f"{sum(p.stat().st_size for p in ZIEL.iterdir()) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
