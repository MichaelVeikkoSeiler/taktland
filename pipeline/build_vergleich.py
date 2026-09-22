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
LINIEN = ROOT / "data" / "linien"
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


#: Tunnel gegeneinander. Die Werte stammen aus data/linien/{nr}.json. Länge und
#: Jahr sind für alle 289 Tunnel der Quelle erfasst.
#: richtung «tiefster»: vorn liegt der kleinere Wert (das frühere Jahr).
TUNNEL_KATEGORIEN = [
    {
        "id": "tunnel_laenge",
        "pfad": ["laenge_m"],
        "titel": "Länge",
        "frage": "Welcher Tunnel ist länger?",
        "frage_mehrere": "Welcher dieser Tunnel ist am längsten?",
        "einheit": "Meter",
        "art": "messwert",
        "quelle": "tunnel",
        "hinweis": "Verglichen wird die Länge, wie die Quelle sie angibt. Bei einigen "
                   "Tunneln sagt eine Bemerkung, was sie umfasst.",
        "min_abstand": 100,
        "min_anteil": 0.2,
    },
    {
        "id": "tunnel_jahr",
        "pfad": ["inbetriebnahme_jahr"],
        "titel": "Erste Inbetriebnahme",
        "frage": "Welcher Tunnel ging früher erstmals in Betrieb?",
        "frage_mehrere": "Welcher dieser Tunnel ging am frühesten erstmals in Betrieb?",
        "einheit": "",
        "art": "messwert",
        "quelle": "tunnel",
        "richtung": "tiefster",
        "format": "jahr",
        "min_abstand": 10,
        "min_anteil": 0.0,
    },
]


#: Linien gegeneinander. Verglichen wird, wie viel auf einer Linie erfasst ist,
#: nicht die Linie selbst: Länge, Baujahr und Spurzahl stehen nicht in den
#: Daten. Darum sind alle Kategorien «erfasst». Werte unter 1 fehlen: Eine
#: Linie ohne erfassten Tunnel tritt in der Tunnelfrage nicht an.
#: einheit_einzahl: «1 Brücke», nicht «1 Brücken».
LINIEN_KATEGORIEN = [
    {
        "id": "linie_bahnhoefe",
        "pfad": ["bahnhoefe", "anzahl_in_taktland"],
        "titel": "Bahnhöfe",
        "frage": "Auf welcher Linie sind mehr Bahnhöfe erfasst?",
        "frage_mehrere": "Auf welcher dieser Linien sind am meisten Bahnhöfe erfasst?",
        "einheit": "Bahnhöfe",
        "einheit_einzahl": "Bahnhof",
        "art": "erfasst",
        "quelle": "linie-mit-betriebspunkten",
        "hinweis": "Gezählt sind die Bahnhöfe aus Taktland, die in den offenen Daten auf "
                   "der Linie liegen.",
        "min_abstand": 2,
        "min_anteil": 0.25,
    },
    {
        "id": "linie_betriebspunkte",
        "pfad": ["bahnhoefe", "betriebspunkte_erfasst"],
        "titel": "Betriebspunkte",
        "frage": "Auf welcher Linie sind mehr Betriebspunkte erfasst?",
        "frage_mehrere": "Auf welcher dieser Linien sind am meisten Betriebspunkte erfasst?",
        "einheit": "Betriebspunkte",
        "einheit_einzahl": "Betriebspunkt",
        "art": "erfasst",
        "quelle": "linie-mit-betriebspunkten",
        "hinweis": "Betriebspunkte sind Stellen, die der Bahnbetrieb unterscheidet, etwa "
                   "Bahnhöfe, Haltestellen und Abzweigungen. Verglichen wird, was in den "
                   "offenen Daten steht.",
        "min_abstand": 3,
        "min_anteil": 0.2,
    },
    {
        "id": "linie_tunnel",
        "pfad": ["tunnel", "anzahl_erfasst"],
        "titel": "Tunnel",
        "frage": "Auf welcher Linie sind mehr Tunnel erfasst?",
        "frage_mehrere": "Auf welcher dieser Linien sind am meisten Tunnel erfasst?",
        "einheit": "Tunnel",
        "einheit_einzahl": "Tunnel",
        "art": "erfasst",
        "quelle": "tunnel",
        "hinweis": "Verglichen wird, was in den offenen Daten steht. Linien ohne "
                   "erfassten Tunnel treten bei dieser Frage nicht an.",
        "min_abstand": 1,
        "min_anteil": 0.25,
    },
    {
        "id": "linie_bruecken",
        "pfad": ["bruecken", "anzahl_erfasst"],
        "titel": "Brücken",
        "frage": "Auf welcher Linie sind mehr Brücken erfasst?",
        "frage_mehrere": "Auf welcher dieser Linien sind am meisten Brücken erfasst?",
        "einheit": "Brücken",
        "einheit_einzahl": "Brücke",
        "art": "erfasst",
        "quelle": "brucken",
        "hinweis": "Verglichen wird, was in den offenen Daten steht. Linien ohne "
                   "erfasste Brücke treten bei dieser Frage nicht an.",
        "min_abstand": 3,
        "min_anteil": 0.2,
    },
    {
        "id": "linie_bahnuebergaenge",
        "pfad": ["bahnuebergaenge", "anzahl_erfasst"],
        "titel": "Bahnübergänge",
        "frage": "Auf welcher Linie sind mehr Bahnübergänge erfasst?",
        "frage_mehrere": "Auf welcher dieser Linien sind am meisten Bahnübergänge erfasst?",
        "einheit": "Bahnübergänge",
        "einheit_einzahl": "Bahnübergang",
        "art": "erfasst",
        "quelle": "bahnubergang",
        "hinweis": "Verglichen wird, was in den offenen Daten steht. Linien ohne "
                   "erfassten Bahnübergang treten bei dieser Frage nicht an.",
        "min_abstand": 2,
        "min_anteil": 0.25,
    },
]

#: Kanton, wie ihn die Tunnelquelle schreibt, zum Kürzel. Was hier fehlt, ist
#: kein Kanton («St.AuslandGallen», «Bourgogne-Franche-Comté»): Diese Tunnel
#: spielen nur in der ganzen Schweiz mit. «Aargau / Bern» gehört zu beiden.
#: generator/validate_vergleich.py prüft die Zuordnung mit einer eigenen Liste.
KANTON_AUS_QUELLE = {
    "Aargau": "AG", "Appenzell Ausserrhoden": "AR", "Appenzell Innerrhoden": "AI",
    "Basel-Landschaft": "BL", "Basel-Stadt": "BS", "Bern": "BE", "Fribourg": "FR",
    "Genève": "GE", "Glarus": "GL", "Graubünden": "GR", "Jura": "JU", "Luzern": "LU",
    "Neuchâtel": "NE", "Nidwalden": "NW", "Obwalden": "OW", "St. Gallen": "SG",
    "Schaffhausen": "SH", "Schwyz": "SZ", "Solothurn": "SO", "Thurgau": "TG",
    "Ticino": "TI", "Uri": "UR", "Valais": "VS", "Vaud": "VD", "Zug": "ZG", "Zürich": "ZH",
}


def kantone(wert):
    """«Aargau / Bern» wird ["AG", "BE"], «St.AuslandGallen» wird []."""
    teile = [t.strip() for t in (wert or "").split("/")]
    return sorted({KANTON_AUS_QUELLE[t] for t in teile if t in KANTON_AUS_QUELLE})


def linien_eintraege():
    """Jede Linie mit Seite und ihren erfassten Beständen. Linien anderer Bahnen
    aus dem Schienennetz des BAV treten nicht an: Ihre Bahnhöfe und
    Betriebspunkte zählt eine andere Quelle, Tunnel und Brücken fehlen."""
    raus = []
    for p in sorted(LINIEN.glob("*.json"), key=lambda x: int(x.stem)):
        f = json.loads(p.read_text(encoding="utf-8"))
        if f.get("quelle") == "schienennetz":
            continue
        werte = {}
        for k in LINIEN_KATEGORIEN:
            v = holen(f, k["pfad"])
            if v is not None and v >= 1:
                werte[k["id"]] = v
        if werte:
            raus.append({"linie": f["linie"], "name": f["name"], "werte": werte})
    return raus


def abgerufen(quelle):
    """Der Tag, an dem dieser Datensatz geladen wurde, wie build_linien.py ihn
    festhält."""
    u = json.loads((ROOT / "data" / "linien_uebersicht.json").read_text(encoding="utf-8"))
    return u["abgerufen"][quelle]


def tunnel_eintraege():
    """Jeder Tunnel mit Linie, Stelle in der Faktendatei, Bemerkung und den
    Kantonen, die sein Eintrag nennt."""
    raus = []
    for p in sorted(LINIEN.glob("*.json"), key=lambda x: int(x.stem)):
        f = json.loads(p.read_text(encoding="utf-8"))
        for i, t in enumerate((f.get("tunnel") or {}).get("items", [])):
            werte = {k["id"]: t[k["pfad"][0]] for k in TUNNEL_KATEGORIEN
                     if isinstance(t.get(k["pfad"][0]), (int, float))}
            if werte:
                raus.append({"id": f"{f['linie']}:{i}", "name": t["name"], "linie": f["linie"],
                             "bemerkung": t.get("bemerkung"), "kantone": kantone(t.get("kanton")),
                             "werte": werte})
    return raus


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
        "tunnel_kategorien": [{k: v for k, v in kat.items() if k != "pfad"}
                              for kat in TUNNEL_KATEGORIEN],
        "tunnel": tunnel_eintraege(),
        # die Tunnel kommen aus einem eigenen Abruf, mit eigenem Stand; die
        # Linien aus mehreren, ihr Stand ist der neueste davon
        "tunnel_datenstand": abgerufen("tunnel"),
        "linien_datenstand": max((json.loads(p.read_text(encoding="utf-8"))["datenstand"]
                                  for p in LINIEN.glob("*.json")), default=None),
        "linien_kategorien": [{k: v for k, v in kat.items() if k != "pfad"}
                              for kat in LINIEN_KATEGORIEN],
        "linien": linien_eintraege(),
    }
    ZIEL.write_text(json.dumps(raus, ensure_ascii=False, indent=1), encoding="utf-8")
    groesse = ZIEL.stat().st_size / 1024
    print(f"vergleich.json: {len(bahnhoefe)} Bahnhöfe, "
          f"{len(KATEGORIEN)} Kategorien ({groesse:.0f} KB)")
    for kat in KATEGORIEN:
        n = sum(1 for b in bahnhoefe if kat["id"] in b["werte"])
        print(f"  {kat['id']:<8}{n:>4} Bahnhöfe  ({kat['art']})")
    for kat in TUNNEL_KATEGORIEN:
        n = sum(1 for t in raus["tunnel"] if kat["id"] in t["werte"])
        print(f"  {kat['id']:<14}{n:>4} Tunnel  ({kat['art']})")
    ohne = sum(1 for t in raus["tunnel"] if not t["kantone"])
    print(f"  {ohne} Tunnel ohne Kanton, spielen nur in der ganzen Schweiz")
    for kat in LINIEN_KATEGORIEN:
        n = sum(1 for li in raus["linien"] if kat["id"] in li["werte"])
        print(f"  {kat['id']:<22}{n:>4} Linien  ({kat['art']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
