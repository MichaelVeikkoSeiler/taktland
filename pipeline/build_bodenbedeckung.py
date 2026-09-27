#!/usr/bin/env python3
"""Wald, Siedlung und Stadtzentrum für die Karten: data/bodenbedeckung.json
(Michael, 2026-09-27: «Wald, Siedlung und ggf. noch Stadtzentrum»).

Quelle: swissTLMRegio von swisstopo (Landschaftsmodell 1:200'000), Ebene
tlmregio_landcover_landcover, objval «Wald», «Siedl» und «Stadtzentr». Die
Flächen werden vereinfacht und sehr kleine weggelassen, damit die Karten schnell
bleiben. Nur zum Zeichnen: keine Zahl aus dieser Datei steht als Angabe in der App.

    .venv/bin/python pipeline/build_bodenbedeckung.py
"""
import json
import sqlite3
import sys
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_kartengrund import flaeche  # noqa: E402
from build_seen import vereinfachen, wkb_polygone  # noqa: E402
from schienennetz import lv95_zu_wgs84  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "tlmregio"
ZIEL = ROOT / "data" / "bodenbedeckung.json"
JAHR = 2026
URL = (f"https://data.geo.admin.ch/ch.swisstopo.swisstlmregio/swisstlmregio_{JAHR}/"
       f"swisstlmregio_{JAHR}_2056.gpkg.zip")
GPKG = RAW / "swissTLMRegio_Product_LV95.gpkg"

#: objval der Quelle → Schlüssel in der Datei, Toleranz der Vereinfachung und
#: kleinste Fläche in m², die noch kommt
ARTEN = {
    "Wald": ("wald", 150, 2_000_000),
    "Siedl": ("siedlung", 100, 1_000_000),
    "Stadtzentr": ("stadtzentrum", 25, 0),
}


#: Koordinaten in Grad mal FAKTOR, ganzzahlig: etwa 10 m, genug für Flächen dieser Grösse
FAKTOR = 10_000


def kodieren(pts_lv95):
    """[Breite, Länge] mal FAKTOR, erster Punkt und Differenzen"""
    ganz = []
    for e, n in pts_lv95:
        la, lo = lv95_zu_wgs84(e, n)
        p = (round(la * FAKTOR), round(lo * FAKTOR))
        if not ganz or p != ganz[-1]:
            ganz.append(p)
    return {"start": list(ganz[0]),
            "d": [v for (a0, o0), (a1, o1) in zip(ganz, ganz[1:]) for v in (a1 - a0, o1 - o0)]}


def laden() -> Path:
    if GPKG.exists():
        return GPKG
    RAW.mkdir(parents=True, exist_ok=True)
    zip_pfad = RAW / "tlmregio.gpkg.zip"
    urllib.request.urlretrieve(URL, zip_pfad)
    with zipfile.ZipFile(zip_pfad) as z:
        z.extract(GPKG.name, RAW)
    zip_pfad.unlink()
    return GPKG


def main():
    c = sqlite3.connect(laden())
    raus = {
        "quelle": f"swissTLMRegio {JAHR}, Bundesamt für Landestopografie swisstopo, Bodenbedeckung",
        "geladen": date.today().isoformat(),
        "faktor": FAKTOR,
        "hinweis": "Nur zum Zeichnen: Ringe als [Breite, Länge] mal faktor, start und Differenzen d, "
                   "vereinfacht; kleine Flächen fehlen (ARTEN in pipeline/build_bodenbedeckung.py). "
                   "Löcher sind eigene Ringe, gezeichnet mit evenodd.",
    }
    for objval, (schluessel, toleranz, min_m2) in ARTEN.items():
        ringe = []
        for (geom,) in c.execute("select geom from tlmregio_landcover_landcover where objval = ?", (objval,)):
            for poly in wkb_polygone(geom):
                # der äussere Ring entscheidet, ob die Fläche kommt; Löcher nur mit ihr
                if flaeche(poly[0]) < min_m2:
                    continue
                for i, ring in enumerate(poly):
                    r = vereinfachen(ring, toleranz)
                    if len(r) >= 4 and (i == 0 or flaeche(r) >= min_m2):
                        k = kodieren(r)
                        if len(k["d"]) >= 6:
                            ringe.append(k)
        raus[schluessel] = ringe
    ZIEL.write_text(json.dumps(raus, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"bodenbedeckung.json: {ZIEL.stat().st_size / 1024:.0f} KB; "
          + ", ".join(f"{s}: {len(raus[s])} Ringe" for s, _, _ in ARTEN.values()))


if __name__ == "__main__":
    main()
