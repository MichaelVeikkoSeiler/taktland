#!/usr/bin/env python3
"""Stellt die Werte bereit, mit denen sich Bahnhoefe vergleichen lassen.

Nicht jeder Wert taugt dafuer. Verglichen werden darf nur, was fuer beide
Bahnhoefe wirklich gemessen wurde. Bei erfassten Bestaenden - Perrons, Gleise,
Billettautomaten - kann ein Unterschied blosse Datenluecke sein: «Aarau hat
mehr Perrons als Brig» waere dann eine Behauptung ueber die Wirklichkeit, die
die Daten nicht tragen.

Darum trennt jede Kategorie zwischen

    art = "messwert"   die Groesse ist erhoben, der Vergleich gilt der Wirklichkeit
    art = "erfasst"    verglichen wird der Datenbestand, nicht die Wirklichkeit

Die Frage in der App ist entsprechend formuliert.

    python pipeline/build_vergleich.py
"""
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "data" / "facts"
ZIEL = ROOT / "data" / "vergleich.json"

#: min_abstand und min_anteil halten unfaire Paare heraus. Zwei Bahnhoefe mit
#: 1200 und 1210 Reisenden ergeben keine Frage, sondern einen Muenzwurf.
KATEGORIEN = [
    {
        "id": "dwv",
        "pfad": ["steckbrief", "dwv"],
        "titel": "Ein- und Aussteigende",
        "frage": "An welchem Bahnhof steigen an einem Werktag mehr Personen ein und aus?",
        "frage_mehrere": "An welchem dieser Bahnhöfe steigen an einem Werktag am meisten Personen ein und aus?",
        "einheit": "pro Werktag",
        "art": "messwert",
        "quelle": "passagierfrequenz",
        "min_abstand": 200,
        "min_anteil": 0.2,
    },
    {
        "id": "dnwv",
        "pfad": ["steckbrief", "dnwv"],
        "titel": "An freien Tagen",
        "frage": "An welchem Bahnhof steigen an einem freien Tag mehr Personen ein und aus?",
        "frage_mehrere": "An welchem dieser Bahnhöfe steigen an einem freien Tag am meisten Personen ein und aus?",
        "einheit": "an einem freien Tag",
        "art": "messwert",
        "quelle": "passagierfrequenz",
        "hinweis": "Ein freier Tag ist ein Wochenend- oder Feiertag. Die Rangfolge "
                   "kann eine andere sein als an Werktagen.",
        "min_abstand": 200,
        "min_anteil": 0.2,
    },
    {
        "id": "hoehe",
        "pfad": ["stammdaten", "hoehe_m_ue_m"],
        "titel": "Höhe über Meer",
        "frage": "Welcher Bahnhof liegt höher über Meer?",
        "frage_mehrere": "Welcher dieser Bahnhöfe liegt am höchsten über Meer?",
        "einheit": "m ü. M.",
        "art": "messwert",
        "quelle": "haltestelle-haltekante",
        "min_abstand": 60,
        "min_anteil": 0.0,
    },
    {
        "id": "zuege",
        "pfad": ["zuege", "staerkster_abschnitt", "zuege_pro_tag"],
        "titel": "Züge pro Tag",
        "frage": "Auf welchem meistbefahrenen Abschnitt verkehren mehr Züge pro Tag?",
        "frage_mehrere": "Bei welchem dieser Bahnhöfe verkehren auf dem meistbefahrenen Abschnitt am meisten Züge pro Tag?",
        "einheit": "Züge pro Tag",
        "art": "messwert",
        "quelle": "zugzahlen",
        "hinweis": "Gezählt wird der stärkste Streckenabschnitt am Bahnhof, beide "
                   "Richtungen zusammen. Ein Zug, der durchfährt, zählt gleich wie "
                   "einer, der hält.",
        "min_abstand": 30,
        "min_anteil": 0.25,
    },
    {
        "id": "perron",
        "pfad": ["perrons", "laengste_m"],
        "titel": "Längstes erfasstes Perron",
        "frage": "Welcher Bahnhof hat das längere erfasste Perron?",
        "frage_mehrere": "Welcher dieser Bahnhöfe hat das längste erfasste Perron?",
        "einheit": "Meter",
        "art": "erfasst",
        "quelle": "perron",
        "hinweis": "Verglichen wird, was in den offenen Daten steht. Perrons ohne "
                   "Daten fehlen im Vergleich.",
        "min_abstand": 40,
        "min_anteil": 0.15,
    },
]


def holen(d, pfad):
    for teil in pfad:
        if not isinstance(d, dict):
            return None
        d = d.get(teil)
    return d if isinstance(d, (int, float)) and not isinstance(d, bool) else None


def main():
    bahnhoefe = []
    for p in sorted(FACTS.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        werte = {}
        for k in KATEGORIEN:
            v = holen(d, k["pfad"])
            if v is not None:
                werte[k["id"]] = v
        if not werte:
            continue
        bahnhoefe.append({"uic": d["uic"], "name": d["name"],
                          "kanton": d.get("kanton"), "werte": werte})

    # der Datenstand der Fakten, nicht der Tag, an dem diese Datei gebaut wurde
    staende = sorted({json.loads((FACTS / f"{b['uic']}.json").read_text(encoding="utf-8"))
                      .get("datenstand", "") for b in bahnhoefe[:1]})
    raus = {
        "datenstand": staende[-1] if staende and staende[-1] else str(date.today()),
        "hinweis": "Jeder Wert stammt unveraendert aus data/facts/{uic}.json. "
                   "Die Fragen entstehen in der App aus diesen Werten, es wird "
                   "nichts geschrieben und nichts geschaetzt.",
        "kategorien": [{k: v for k, v in kat.items() if k != "pfad"} for kat in KATEGORIEN],
        "bahnhoefe": bahnhoefe,
    }
    ZIEL.write_text(json.dumps(raus, ensure_ascii=False, indent=1), encoding="utf-8")
    groesse = ZIEL.stat().st_size / 1024
    print(f"vergleich.json: {len(bahnhoefe)} Bahnhöfe, "
          f"{len(KATEGORIEN)} Kategorien ({groesse:.0f} KB)")
    for kat in KATEGORIEN:
        n = sum(1 for b in bahnhoefe if kat["id"] in b["werte"])
        print(f"  {kat['id']:<8}{n:>4} Bahnhöfe  ({kat['art']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
