"""Liest das «Schienennetz» des BAV (data/raw/schienennetz_2056_de.xtf).

Die Datei ist INTERLIS 2.3 (XML). Drei Arten von Objekten:
- KmLinie: eine Linie mit Datenherr (der Bahn, die sie führt), Nummer und Name
- Netzknoten: ein Betriebspunkt mit Nummer (wie die UIC der Bahnhöfe), Name,
  Abkürzung und Lage
- Netzsegment: ein Stück Linie zwischen zwei Knoten, mit Kilometer am Anfang
  und am Ende, Infrastrukturbetreiberin, Zahl der Streckengleise, Spurweite,
  Elektrifizierung und dem Linienzug

Stand der Daten laut Datei: ENDSTATE des Behälters und «Stand» jedes Objekts.
Laden mit pipeline/fetch_schienennetz.py.
"""
import math
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
DATEI = RAW / "schienennetz_2056_de.xtf"

NS = "{http://www.interlis.ch/INTERLIS2.3}"
TU = "Schienennetz_LV95_V1_3.Schienennetz.TU"
BP = "Schienennetz_LV95_V1_3.Schienennetz.Betriebspunkt"
GUELTIG = "Schienennetz_LV95_V1_3.Schienennetz.Gueltigkeit"

#: Werte der Quelle, wie sie in der App stehen. Die Quelle schreibt «mm1435»
#: und «Wechselstrom_16_7Hz»; das ist dieselbe Angabe in lesbarer Form.
SPURWEITE = {"mm1435": "1435 mm", "mm1000": "1000 mm", "mm800": "800 mm", "mm750": "750 mm",
             "mm1200": "1200 mm", "mm600": "600 mm", "mm1000_1435": "1000 mm und 1435 mm"}
STROM = {"Wechselstrom_16_7Hz": "Wechselstrom 16,7 Hz", "Gleichstrom": "Gleichstrom",
         "nicht_elektrifiziert": "nicht elektrifiziert", "Wechselstrom_50Hz": "Wechselstrom 50 Hz",
         "Drehstrom": "Drehstrom", "Wechselstrom_16_7Hz_Gleichstrom": "Wechselstrom 16,7 Hz und Gleichstrom",
         "Wechselstrom_16_7Hz_50Hz": "Wechselstrom 16,7 Hz und 50 Hz"}


def _text(el, pfad):
    x = el.find("/".join(NS + p for p in pfad.split("/")))
    return None if x is None else (x.text or "").strip()


def lv95_zu_wgs84(e, n):
    """Näherungsformel von swisstopo, auf etwa einen Meter genau"""
    y = (e - 2_600_000) / 1_000_000
    x = (n - 1_200_000) / 1_000_000
    lon = (2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x
           - 0.0436 * y ** 3)
    lat = (16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x
           - 0.0447 * y * y * x - 0.0140 * x ** 3)
    return lat * 100 / 36, lon * 100 / 36


def lesen():
    """Alle Linien, Knoten und Segmente. Segmente mit Linienzug in WGS84."""
    linien, knoten, segmente, stand = {}, {}, [], None
    for ereignis, el in ET.iterparse(DATEI, events=("start", "end")):
        if ereignis == "start":
            if el.get("BID") and el.get("ENDSTATE"):
                stand = el.get("ENDSTATE")
            continue
        tid = el.get("TID")
        if tid is None:
            continue
        art = el.tag.rsplit(".", 1)[-1]
        if art == "KmLinie":
            linien[tid] = {"nummer": _text(el, "Nummer"), "name": _text(el, "Name"),
                           "datenherr": _text(el, f"Datenherr/{TU}/TUAbkuerzung"),
                           "stand": _text(el, f"Gueltigkeit/{GUELTIG}/Stand")}
        elif art == "Netzknoten":
            c = el.find(f"{NS}Geometrie/{NS}COORD")
            lat, lon = lv95_zu_wgs84(float(c.find(NS + "C1").text), float(c.find(NS + "C2").text))
            knoten[tid] = {"nummer": int(_text(el, f"Betriebspunkt/{BP}/Nummer")),
                           "name": _text(el, f"Betriebspunkt/{BP}/Name"),
                           "abkuerzung": _text(el, f"Betriebspunkt/{BP}/Abkuerzung"),
                           "lat": lat, "lon": lon}
        elif art == "Netzsegment":
            zug = [lv95_zu_wgs84(float(c.find(NS + "C1").text), float(c.find(NS + "C2").text))
                   for c in el.iter(NS + "COORD")]
            segmente.append({
                "km_anfang": float(_text(el, "KmAnfang")), "km_ende": float(_text(el, "KmEnde")),
                "isb": _text(el, f"Infrastrukturbetreiber/{TU}/TUAbkuerzung"),
                "gleise": int(_text(el, "AnzahlStreckengleise")),
                "spurweite": SPURWEITE[_text(el, "Spurweite")],
                "strom": STROM[_text(el, "Elektrifizierung")],
                "anfang": el.find(NS + "rAnfangsknoten").get("REF"),
                "ende": el.find(NS + "rEndknoten").get("REF"),
                "linie": el.find(NS + "rKmLinie").get("REF"),
                "zug": zug,
            })
        el.clear()
    return linien, knoten, segmente, stand


def je_linie():
    """Je Liniennummer: Name, Datenherr, die Segmente nach Kilometer und die
    Betriebspunkte mit ihrem Kilometer. Liegt ein Betriebspunkt auf derselben
    Linie bei zwei Kilometern (21 Fälle, Horw 4.485 und 4.524), gilt der
    kleinere."""
    linien, knoten, segmente, stand = lesen()
    nach = defaultdict(list)
    for s in segmente:
        nach[s["linie"]].append(s)
    raus = {}
    for tid, l in linien.items():
        segs = sorted(nach[tid], key=lambda s: (s["km_anfang"], s["km_ende"]))
        punkte = {}
        for s in segs:
            for ref, km in ((s["anfang"], s["km_anfang"]), (s["ende"], s["km_ende"])):
                k = knoten[ref]
                if k["nummer"] not in punkte or km < punkte[k["nummer"]]["km"]:
                    punkte[k["nummer"]] = {**k, "km": km}
        raus[l["nummer"]] = {
            **l,
            "segmente": [{**{k: v for k, v in s.items() if k not in ("anfang", "ende", "linie")},
                          "von": knoten[s["anfang"]]["name"], "bis": knoten[s["ende"]]["name"],
                          "von_nummer": knoten[s["anfang"]]["nummer"],
                          "bis_nummer": knoten[s["ende"]]["nummer"]} for s in segs],
            "punkte": sorted(punkte.values(), key=lambda p: (p["km"], p["name"])),
        }
    return raus, stand


def abstand_m(a, b):
    """Grob, für die Vereinfachung des Linienzugs"""
    return math.hypot((a[0] - b[0]) * 111_200, (a[1] - b[1]) * 76_000)
