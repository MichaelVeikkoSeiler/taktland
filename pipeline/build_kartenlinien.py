#!/usr/bin/env python3
"""Feinere Linien für die Karte des Spiels «Geo»: data/kartenlinien.json.

Michael, 2026-10-03: «Die Karten sind sehr grob gezeichnet. Die Bahnlinien, die
Kantonsgrenzen …». Die Kantonsgrenzen der Geo-Karte kamen aus den generalisierten
Grenzen des BFS (g1), die Bahnlinien anderer Bahnen aus dem Schienennetz des BAV
mit wenigen Punkten. Beides gibt es feiner in swissTLMRegio von swisstopo:

- kantonsgrenzen: Ebene swisstlmregio_hoheitsgrenze, Objektart «Kantonsgrenze» der
  Schweiz (hierarchieebene «Kanton») und die kantonalen Grenzen in Seen («See
  (kantonal)»)
- bahnlinien: Ebene tlmregio_transportation_railway, Normal-, Schmal- und
  Mehrspur (NS_Bahn, SS_Bahn, MS_Bahn, auch mit Autoverlad), ohne Seilbahnen

Nur zum Zeichnen, vereinfacht um TOLERANZ_M; keine Zahl daraus steht in der App.
Kostenlose Geodaten (OGD) von swisstopo mit Quellenangabe.

    .venv/bin/python pipeline/build_kartenlinien.py     # nach build_bodenbedeckung (lädt swissTLMRegio)
"""
import json
import sqlite3
import struct
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
from build_bodenbedeckung import laden, RAW  # noqa: E402
from build_kartengrund import zusammenfuegen  # noqa: E402
from build_seen import vereinfachen  # noqa: E402
from schienennetz import lv95_zu_wgs84  # noqa: E402

ZIEL = ROOT / "data" / "kartenlinien.json"
GRENZEN = RAW / "swissTLMRegio_BOUNDARIES_LV95.gpkg"
TOLERANZ_M = 15
BAHNEN = ("NS_Bahn", "SS_Bahn", "MS_Bahn", "NS_BahnAuto", "SS_BahnAuto")


def linien(b: bytes):
    """Linien aus einer GeoPackage-Geometrie, auch mit Höhe (Z) oder Mass (M)"""
    pos = 8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(b[3] >> 1) & 7]

    def lies(pos):
        o = "<" if b[pos] == 1 else ">"
        roh = struct.unpack_from(o + "I", b, pos + 1)[0]
        typ = roh & 0xFFFF
        dim = 2 + (1 if (roh & 0x80000000) or 1000 <= typ % 4000 < 2000 or typ >= 3000 else 0) \
            + (1 if (roh & 0x40000000) or 2000 <= typ % 4000 < 3000 or typ >= 3000 else 0)
        art = typ % 1000
        pos += 5
        n = struct.unpack_from(o + "I", b, pos)[0]
        pos += 4
        if art == 2:
            w = struct.unpack_from(o + "d" * (dim * n), b, pos)
            return [list(zip(w[0::dim], w[1::dim]))], pos + 8 * dim * n
        alle = []
        for _ in range(n):
            teil, pos = lies(pos)
            alle += teil
        return alle, pos

    return lies(pos)[0]


def kodieren(pts):
    """[Breite, Länge] mal 100000, erster Punkt und Differenzen, wie seen.json"""
    ganz = []
    for e, n in pts:
        la, lo = lv95_zu_wgs84(e, n)
        p = (round(la * 1e5), round(lo * 1e5))
        if not ganz or p != ganz[-1]:
            ganz.append(p)
    d = []
    for (a, b), (c, e) in zip(ganz, ganz[1:]):
        d += [c - a, e - b]
    return {"start": list(ganz[0]), "d": d}


def main():
    g = sqlite3.connect(GRENZEN)
    grenzen = [z for (geom,) in g.execute(
        "select geom from swisstlmregio_hoheitsgrenze where objektart = 'Kantonsgrenze' "
        "and hierarchieebene_name = 'Kanton' or hierarchieebene_name = 'See (kantonal)'") for z in linien(geom)]
    c = sqlite3.connect(laden())
    platz = ",".join("?" * len(BAHNEN))
    bahnen = [z for (geom,) in c.execute(
        f"select geom from tlmregio_transportation_railway where objval in ({platz})", BAHNEN) for z in linien(geom)]
    # Stücke, die aneinanderstossen, zu längeren Linien: weniger Anfänge, kleinere Datei
    raus = {}
    for name, stuecke in (("kantonsgrenzen", grenzen), ("bahnlinien", bahnen)):
        raus[name] = [kodieren(z) for z in (vereinfachen(z, TOLERANZ_M) for z in zusammenfuegen(stuecke))
                      if len(z) >= 2]
    daten = {
        "quelle": "swissTLMRegio, Bundesamt für Landestopografie swisstopo",
        "lizenz": "Kostenlose Geodaten (OGD) von swisstopo, Quellenangabe Pflicht",
        "geladen": date.today().isoformat(),
        "hinweis": (f"Nur zum Zeichnen, vereinfacht auf {TOLERANZ_M} m. Linien als [Breite, Länge] mal "
                    "100000, start und Differenzen d. kantonsgrenzen: Kantonsgrenzen der Schweiz, auch in "
                    "Seen; bahnlinien: Normal-, Schmal- und Mehrspur, ohne Seilbahnen."),
        **raus,
    }
    ZIEL.write_text(json.dumps(daten, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"kartenlinien.json: {len(raus['kantonsgrenzen'])} Stücke Kantonsgrenze, "
          f"{len(raus['bahnlinien'])} Bahnlinien, {ZIEL.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
