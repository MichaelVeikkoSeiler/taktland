#!/usr/bin/env python3
"""Tunnel und Brücken aller Bahnen aus swissTLM3D: data/tlm_bauwerke.json.

Die Daten der SBB führen Tunnel und Brücken nur auf ihrer eigenen
Infrastruktur. Auf Strecken anderer Bahnen fehlten sie (Michael, 2026-09-26,
im Zug Bern – Müntschemier: «Genau hier sind wir in einem BLS Tunnel»,
«Hier sind wir auf einem Viadukt»). swissTLM3D von swisstopo führt jede
Bahnachse mit dem Merkmal KUNSTBAUTE (Tunnel, Galerie, Brücke, gedeckte
Brücke), bei einem Teil auch mit Namen.

Verwendet: die Ebene TLM_EISENBAHN, nur Bahnen (keine Trams, keine Metro), nur
die Achse der Karte (ACHSE_DKM, eine Linie je Strecke statt je Gleis), ohne
Anschlussgleise, ausser Betrieb und Museumsbahnen. Aneinanderstossende Stücke
derselben Art und desselben Namens werden ein Bauwerk. Eine Länge steht nicht
in der Quelle; die gezeichnete Linie ist keine gemessene Länge und wird nicht
als Länge gezeigt. Nur für die Auswahl «grössere Brücken» im Fahrtmodus hält
gezeichnet_ab_100m fest, ob die Linie auf der Karte mindestens 100 m lang ist.

Kostenlose Geodaten (OGD) von swisstopo, Quellenangabe Pflicht. Die Datei
(3,6 GB) wird nicht ganz geladen: pipeline/fetch_tlm3d.py holt aus dem ZIP nur
die Ebene TLM_EISENBAHN nach data/raw/tlm3d/.

    .venv/bin/python pipeline/build_tlm_bauwerke.py
"""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import shapefile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_seen import nach_wgs84, vereinfachen  # noqa: E402
from fetch_tlm3d import AUSGABE, STAND  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "tlm_bauwerke.json"

ARTEN = {"Tunnel": "tunnel", "Galerie": "galerie", "Bruecke": "bruecke", "Gedeckte Bruecke": "gedeckte_bruecke"}
#: Vereinfachung der Linie, Meter
TOLERANZ_M = 10


def name_von(roh):
    """«Galleria … | Gotthard-Basistunnel | Tunnel da …»: alle Sprachen, wie in der Quelle"""
    teile = [t.strip() for t in (roh or "").split("|") if t.strip()]
    return " / ".join(teile) or None


def main():
    r = shapefile.Reader(str(AUSGABE / "swissTLM3D_TLM_EISENBAHN"), encoding="utf-8")
    stuecke = []
    for sr in r.iterShapeRecords():
        x = sr.record
        art = ARTEN.get(x["KUNSTBAUTE"])
        if (not art or x["VERKEHRSMI"] != "Bahn" or x["ACHSE_DKM"] != "Wahr" or x["AUSSER_BET"] == "Wahr"
                or x["ANSCHLUSSG"] == "Wahr" or x["MUSEUMSBAH"] == "Wahr"):
            continue
        pts = [tuple(p[:2]) for p in sr.shape.points]
        if len(pts) >= 2:
            stuecke.append({"art": art, "name": name_von(x["NAME"]), "pts": pts})

    # zusammenhängende Stücke gleicher Art und gleichen Namens verbinden
    def k(p):
        return (round(p[0]), round(p[1]))
    an = defaultdict(list)
    for i, s in enumerate(stuecke):
        an[(s["art"], s["name"], k(s["pts"][0]))].append(i)
        an[(s["art"], s["name"], k(s["pts"][-1]))].append(i)
    gesehen, bauwerke = set(), []
    for i in range(len(stuecke)):
        if i in gesehen:
            continue
        gesehen.add(i)
        linie = list(stuecke[i]["pts"])
        art, name = stuecke[i]["art"], stuecke[i]["name"]
        for _ in range(2):                      # erst nach hinten, dann nach vorn verlängern
            while True:
                weiter = [j for j in an[(art, name, k(linie[-1]))] if j not in gesehen]
                if not weiter:
                    break
                j = weiter[0]
                gesehen.add(j)
                p = stuecke[j]["pts"]
                linie += (p if k(p[0]) == k(linie[-1]) else p[::-1])[1:]
            linie.reverse()
        bauwerke.append({"art": art, "name": name, "pts": linie})

    raus = {}
    for n, b in enumerate(sorted(bauwerke, key=lambda b: (b["pts"][0][1], b["pts"][0][0]))):
        laenge = sum(math.dist(p, q) for p, q in zip(b["pts"], b["pts"][1:]))
        pts = vereinfachen(b["pts"], TOLERANZ_M)
        ganz = [(round(la * 1e5), round(lo * 1e5)) for la, lo in (nach_wgs84(*p) for p in pts)]
        d = [v for (a0, o0), (a1, o1) in zip(ganz, ganz[1:]) for v in (a1 - a0, o1 - o0)]
        eintrag = {"art": b["art"], "start": list(ganz[0]), "d": d}
        if b["name"]:
            eintrag["name"] = b["name"]
        if b["art"] in ("bruecke", "gedeckte_bruecke"):
            eintrag["gezeichnet_ab_100m"] = laenge >= 100
        raus[f"t{n}"] = eintrag

    ZIEL.write_text(json.dumps({
        "quelle": "swissTLM3D, Bundesamt für Landestopografie swisstopo",
        "stand": STAND,
        "hinweis": "Tunnel, Galerien und Brücken aller Bahnen (TLM_EISENBAHN, KUNSTBAUTE), je eine Achse "
                   "der Karte, ohne Anschlussgleise, ausser Betrieb und Museumsbahnen. Linie: start = "
                   "[Breite, Länge] mal 100000, d = Differenzen. Keine Länge: gezeichnet_ab_100m sagt nur, "
                   "ob die Linie auf der Karte mindestens 100 m lang ist.",
        "bauwerke": raus,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    zahl = defaultdict(int)
    for b in raus.values():
        zahl[b["art"]] += 1
    print(f"tlm_bauwerke.json: {len(raus)} Bauwerke {dict(zahl)}, "
          f"{sum(1 for b in raus.values() if 'name' in b)} mit Namen ({ZIEL.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
