"""Bauart der Brücken in der Schweiz aus Wikidata (Michael, 2026-11-08: «kannst du auch recherchieren, wie die Brücke architektonisch
ungefähr aussieht, damit du diese ungefähr so nachbauen kannst? Torbogen, Stahlbrücke, etc.», dann «Ja gern»).

swissTLM3D kennt Lage, Höhe und Klasse einer Brücke, nicht ihre Bauart. Wikidata (CC0) nennt für viele Brücken in der Schweiz,
was sie sind (P31, etwa Bogenbrücke, Fachwerkbrücke, Hängebrücke, Balkenbrücke, Viadukt), woraus (P186, Stahl, Beton, Stein,
Holz) und wo (P625). Hier nur die Abfrage, ohne Deutung: je Brücke Name, Lage in LV95, die Bezeichnungen der Arten und
Materialien auf Deutsch (sonst Englisch) und die Länge (P2043), wo genannt; die App ordnet sie den Brücken aus swissTLM3D zu.

Die Sitzung von Claude erreicht Wikidata nicht, der Workflow «Brückenart» (.github/workflows/brueckenart.yml) schon; er legt
data/brueckenart.json ins Repository.
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "brueckenart.json"
URL = "https://query.wikidata.org/sparql"
ABFRAGE = """
SELECT ?b ?name ?koord
  (GROUP_CONCAT(DISTINCT ?art; separator="|") AS ?arten)
  (GROUP_CONCAT(DISTINCT ?stoff; separator="|") AS ?stoffe)
  (SAMPLE(?laenge) AS ?l)
WHERE {
  ?b wdt:P31/wdt:P279* wd:Q12280 ;
     wdt:P17 wd:Q39 ;
     wdt:P625 ?koord .
  OPTIONAL { ?b wdt:P31 ?a . ?a rdfs:label ?art . FILTER(LANG(?art) = "de") }
  OPTIONAL { ?b wdt:P186 ?m . ?m rdfs:label ?stoff . FILTER(LANG(?stoff) = "de") }
  OPTIONAL { ?b p:P2043/psn:P2043/wikibase:quantityAmount ?laenge }
  OPTIONAL { ?b rdfs:label ?name . FILTER(LANG(?name) = "de") }
}
GROUP BY ?b ?name ?koord
"""


def wgs84_zu_lv95(la, lo):
    """Näherung von swisstopo (etwa 1 m genau)"""
    p = (la * 3600 - 169028.66) / 10000
    l = (lo * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return e, n


def abfragen():
    anfrage = urllib.request.Request(URL + "?" + urllib.parse.urlencode({"query": ABFRAGE, "format": "json"}),
                                     headers={"User-Agent": "taktland-pipeline/1.0 (https://taktland.ch)",
                                              "Accept": "application/sparql-results+json"})
    for versuch in range(4):
        try:
            with urllib.request.urlopen(anfrage, timeout=300) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:  # noqa: BLE001
            print(f"Wikidata: {e}, nochmals", flush=True)
            time.sleep(30 * (versuch + 1))
    sys.exit("Wikidata nicht erreicht")


def main():
    zeilen = abfragen()
    bruecken = []
    for z in zeilen:
        punkt = z["koord"]["value"]  # Point(lon lat)
        try:
            lo, la = (float(x) for x in punkt[punkt.index("(") + 1:punkt.index(")")].split())
        except ValueError:
            continue
        e, n = wgs84_zu_lv95(la, lo)
        if not (2480000 < e < 2840000 and 1070000 < n < 1300000):
            continue
        laenge = z.get("l", {}).get("value")
        bruecken.append({
            "id": z["b"]["value"].rsplit("/", 1)[-1],
            "name": z.get("name", {}).get("value"),
            "e": round(e), "n": round(n),
            "arten": sorted(a for a in z.get("arten", {}).get("value", "").split("|") if a),
            "stoffe": sorted(a for a in z.get("stoffe", {}).get("value", "").split("|") if a),
            "laenge_m": round(float(laenge)) if laenge and not math.isnan(float(laenge)) else None,
        })
    bruecken.sort(key=lambda b: b["id"])
    ZIEL.write_text(json.dumps({
        "quelle": "Wikidata (CC0), Abfrage über query.wikidata.org: Brücken in der Schweiz (P31/P279* Q12280, P17 Q39) mit Lage (P625)",
        "geladen": date.today().isoformat(),
        "hinweis": "arten: Bezeichnungen von P31 auf Deutsch, stoffe: von P186; Lage in LV95 aus WGS84 genähert (etwa 1 m); laenge_m aus P2043",
        "bruecken": bruecken,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    arten = {}
    for b in bruecken:
        for a in b["arten"]:
            arten[a] = arten.get(a, 0) + 1
    print(f"{len(bruecken)} Brücken nach {ZIEL}", flush=True)
    for a, k in sorted(arten.items(), key=lambda x: -x[1])[:40]:
        print(f"  {k:5d} {a}")


if __name__ == "__main__":
    main()
