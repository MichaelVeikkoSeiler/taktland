#!/usr/bin/env python3
"""Verdichtet Linien, Betriebspunkte und Tunnel zu data/linien/{nr}.json.

Eine Linie ist hier eine Strecke der Infrastruktur mit ihrer Nummer, etwa
Linie 600 Immensee - Bellinzona - Chiasso. Keine Zuglinie wie eine S-Bahn:
Der Fahrplan ist nicht Teil dieser Daten.

Aufgenommen werden Linien mit mindestens zwei Bahnhöfen aus data/facts oder
mit mindestens einem Tunnel. Ohne die Tunnel-Regel fehlten Gotthard- und
Ceneri-Basistunnel, Grauholz- und Zimmerbergtunnel: Sie liegen auf eigenen
Linien ohne Bahnhof in Taktland (594 «GBT West», 400, 722).
Wie bei den Bahnhöfen gilt: Was nicht in den Rohdaten steht, kommt nicht in
die Fakten, und was fehlt, steht in `luecken`.

Was die Daten nicht hergeben (geprüft im Katalog von data.sbb.ch):
- die Länge einer Linie. Erfasst sind Anfangs- und End-Kilometer. Linie 210
  beginnt bei km 19.115; die Differenz ist nicht belegt als Länge.
- ein Bau- oder Eröffnungsjahr der Linie. Ein Jahr gibt es nur für Tunnel.
- ob eine Linie ein- oder mehrspurig ist. Das Tunnelsystem sagt es nur für
  den Tunnel.
- Länge und Baujahr einer Brücke. Erfasst sind Name, Kilometer, Kanton und
  die Zahl der Baueinheiten.
- die Bedeutung einiger Felder bei den Bahnübergängen: Eigentum, Nutzung und
  Gleiskategorie beschreibt die Quelle nicht oder mit Texten aus anderen
  Datensätzen. Verwendet sind Sicherungsart und Zahl der gekreuzten Gleise.

Dazu kommt das «Schienennetz» des BAV (pipeline/schienennetz.py, Stand 2021):
- Linien anderer Bahnen (BLS, SOB, RhB …), die in den Daten der SBB fehlen,
  mit mindestens zwei Bahnhöfen aus Taktland. Tramlinien nicht: Sie tragen im
  Schienennetz Nummern mit Buchstaben («Z021», «T003»).
- auf jeder Linie, die es dort gibt, das Kapitel Netz: je Abschnitt zwischen
  zwei Betriebspunkten Infrastrukturbetreiberin, Streckengleise, Spurweite und
  Elektrifizierung
- Bahnhöfe, die das Schienennetz auf einer Linie der SBB zusätzlich führt
  (Ins auf Linie 220)

    .venv/bin/python pipeline/build_linien.py
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import schienennetz  # noqa: E402
from sources import DATASETS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
FACTS = ROOT / "data" / "facts"
ZIEL = ROOT / "data" / "linien"
#: Zahlen über alle Linien. Liegt ausserhalb von data/linien, dort ist jede
#: Datei eine Linie.
UEBERSICHT = ROOT / "data" / "linien_uebersicht.json"
# Lage jedes Tunnels, jeder Brücke und jedes Bahnübergangs für die Seite «Standort»
STANDORT = ROOT / "data" / "standort.json"

#: So viele Bahnhöfe aus Taktland braucht eine Linie ohne Tunnel für eine
#: eigene Seite, und jede Linie für ein Kapitel Bahnhöfe. Mit einem allein
#: gibt es nichts zu ordnen.
MINDESTENS_BAHNHOEFE = 2

QUELLEN = ["linie", "linie-mit-betriebspunkten", "tunnel", "brucken", "bahnubergang"]
#: vom BAV, nicht von data.sbb.ch (pipeline/fetch_schienennetz.py)
QUELLEN_BAV = ["schienennetz"]


def load(name):
    return pd.read_csv(RAW / f"{name}.csv", sep=";", low_memory=False)


def num(v):
    if v is None or pd.isna(v):
        return None
    v = v.item() if hasattr(v, "item") else v
    return int(v) if isinstance(v, float) and v.is_integer() else v


def txt(v):
    """Text wie in der Quelle, doppelte Leerschläge zu einem («WU Obere  Bauelhaustr.»)."""
    if v is None or pd.isna(v):
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def datenstand():
    abruf = json.loads((RAW / "_abruf.json").read_text(encoding="utf-8"))
    return max(abruf[q] for q in QUELLEN + QUELLEN_BAV)


def abgerufen(quelle):
    """Wann dieser eine Datensatz geladen wurde. Der datenstand der Linie ist
    das neueste Datum aller Quellen; im Satz zu den Bahnübergängen stand darum
    der Tag, an dem «linie» neu geladen wurde, nicht der der Bahnübergänge."""
    return json.loads((RAW / "_abruf.json").read_text(encoding="utf-8"))[quelle]


def endpunkt_uic(gruppe, name, km, namen):
    """Der Bahnhof am Anfang oder Ende der Linie, falls es einer aus Taktland ist.

    linie.csv nennt nur den Namen. Die Nummer steht in der Liste der
    Betriebspunkte derselben Linie. Steht der Name dort zweimal (Biel/Bienne
    auf Linie 210), entscheidet der Kilometer. Ohne eindeutigen Treffer kein
    Link: meist ist der Endpunkt eine Abzweigung."""
    treffer = gruppe[gruppe.bezeichnung_bps == name]
    if len(treffer) > 1:
        treffer = treffer[(treffer.km - km).abs() < 0.01]
    if len(treffer) != 1 or pd.isna(treffer.iloc[0].uic):
        return None
    uic = int(treffer.iloc[0].uic)
    return uic if uic in namen else None


def bahnhoefe_aus_facts():
    namen = {}
    for p in FACTS.glob("*.json"):
        f = json.loads(p.read_text(encoding="utf-8"))
        namen[f["uic"]] = f["name"]
    return namen


def tunnel_items(df):
    items = []
    for _, r in df.sort_values("km_go").iterrows():
        items.append({
            "name": txt(r["name"]),
            "laenge_m": num(r.lange_bahntunnel),
            "inbetriebnahme_jahr": num(pd.to_numeric(r["1_inbetr_jahr_bahntunnel"], errors="coerce")),
            "tunnelsystem": txt(r.tunnelsystem),
            "km": num(r.km_go),
            "bemerkung": txt(r.bemerkung),
            # wie in der Quelle, auch die sechs Einträge, die kein Kanton sind
            # («St.AuslandGallen», «Bourgogne-Franche-Comté»)
            "kanton": txt(r.kanton),
        })
    return items


def bruecken_items(df):
    items = []
    for _, r in df.sort_values("km").iterrows():
        items.append({
            "name": txt(r["name"]),
            "km": num(r.km),
            "baueinheiten": num(r.anzahl_baueinheit),
            "kanton": txt(r.kanton),
        })
    return items


def lagen(df, sortfeld, geofeld, nr, items):
    """Die Lage jedes Eintrags wie in der Quelle, in der Reihenfolge der
    Einträge: [Linie, Stelle, Name, Breite, Länge]. Die Stelle führt zum
    Eintrag in der Liste der Linie. Gerundet auf sechs Stellen wie die Lage
    der Bahnhöfe (build_facts.py), etwa 10 cm. Fehlt die Lage, bleibt sie null."""
    raus = []
    for i, (_, r) in enumerate(df.sort_values(sortfeld).iterrows()):
        assert txt(r["name"]) == items[i]["name"], (nr, i, r["name"])
        try:
            la, lo = (round(float(x), 6) for x in str(r[geofeld]).split(",", 1))
        except ValueError:
            la = lo = None
        raus.append([int(nr), i, txt(r["name"]), la, lo])
    return raus


def standort_schreiben(standort):
    """Eine Zeile je Eintrag, damit Änderungen in Git lesbar bleiben"""
    kopf = {k: v for k, v in standort.items() if not isinstance(v, list)}
    teile = [json.dumps(k, ensure_ascii=False) + ": " + json.dumps(v, ensure_ascii=False)
             for k, v in kopf.items()]
    for art in ("tunnel", "bruecken", "bahnuebergaenge"):
        zeilen = ",\n".join(" " + json.dumps(z, ensure_ascii=False) for z in standort[art])
        teile.append(f'"{art}": [\n{zeilen}\n]')
    STANDORT.write_text("{\n" + ",\n".join(teile) + "\n}\n", encoding="utf-8")


def nach_kanton(items):
    """Wie viele Brücken je Eintrag im Feld Kanton, die meisten zuerst.
    Gezählt hier, nicht im Text."""
    zaehler = {}
    for it in items:
        if it["kanton"]:
            zaehler[it["kanton"]] = zaehler.get(it["kanton"], 0) + 1
    return [{"kanton": k, "anzahl": n}
            for k, n in sorted(zaehler.items(), key=lambda x: (-x[1], x[0]))]


def uebergang_items(df):
    """Nur Felder, deren Bedeutung aus den Werten klar ist. Eigentum, Nutzung und
    Gleiskategorie beschreibt die Quelle nicht oder mit Texten aus anderen
    Datensätzen («Für wen ist die Treppe/Rampe vorgesehen»)."""
    items = []
    for _, r in df.sort_values("km").iterrows():
        gleise = num(r.anz_kreuz_gleise)
        items.append({
            "name": txt(r["name"]),
            "km": num(r.km),
            "sicherungsart": txt(r.sicherungsart),
            # 0 gekreuzte Gleise ist keine Angabe, sondern keine Zahl
            "gleise": gleise if gleise else None,
        })
    return items


def nach_feld(items, feld):
    """Wie viele Einträge je Wert, die meisten zuerst. Gezählt hier, nicht im Text."""
    zaehler = {}
    for it in items:
        if it[feld]:
            zaehler[it[feld]] = zaehler.get(it[feld], 0) + 1
    return [{"wert": k, "anzahl": n} for k, n in sorted(zaehler.items(), key=lambda x: (-x[1], x[0]))]


def einzige_oder_alle(items, feld, beste):
    """Indizes der Einträge mit dem besten Wert. Gleichstand ist kein
    Vorsprung: Sind es mehrere, nennt der Text alle."""
    werte = [it[feld] for it in items if it[feld] is not None]
    if not werte:
        return []
    ziel = beste(werte)
    return [i for i, it in enumerate(items) if it[feld] == ziel]


def nach_wert(segmente, feld):
    """Wie viele Abschnitte je Wert, die meisten zuerst. Gezählt hier, nicht im Text."""
    zaehler = {}
    for x in segmente:
        zaehler[x[feld]] = zaehler.get(x[feld], 0) + 1
    return [{"wert": w, "abschnitte": n} for w, n in sorted(zaehler.items(), key=lambda x: (-x[1], str(x[0])))]


def netz(bav, stand_bav):
    """Das Kapitel Netz: je Abschnitt zwischen zwei Betriebspunkten wie im
    Schienennetz des BAV, dazu gezählt je Wert."""
    items = [{"von": x["von"], "bis": x["bis"], "km_von": num(x["km_anfang"]),
              "km_bis": num(x["km_ende"]), "isb": x["isb"], "gleise": x["gleise"],
              "spurweite": x["spurweite"], "strom": x["strom"]} for x in bav["segmente"]]
    return {
        "source": "schienennetz",
        "hinweis": "Je Abschnitt zwischen zwei Betriebspunkten, wie im Schienennetz des BAV. "
                   "gleise ist die Zahl der Streckengleise, isb die Infrastrukturbetreiberin, "
                   "bahn der Datenherr der Linie, je als Abkürzung der Quelle.",
        "stand": stand_bav,
        "bahn": bav["datenherr"],
        "abschnitte_erfasst": len(items),
        "nach_isb": nach_wert(items, "isb"),
        "nach_gleisen": nach_wert(items, "gleise"),
        "nach_spurweite": nach_wert(items, "spurweite"),
        "nach_strom": nach_wert(items, "strom"),
        "items": items,
    }


def bav_fakten(nr, bav, namen, stand):
    """Eine Linie, die es nur im Schienennetz des BAV gibt. Anfang und Ende
    nennt die Quelle nicht: Aufgeführt sind die Betriebspunkte mit dem
    kleinsten und dem grössten Kilometer."""
    erster, letzter = bav["punkte"][0], bav["punkte"][-1]
    eigene = [p for p in bav["punkte"] if p["nummer"] in namen]
    return {
        "linie": int(nr),
        "name": bav["name"],
        "datenstand": stand,
        "quelle": "schienennetz",
        "strecke": {
            "source": "schienennetz",
            "hinweis": "Kilometer: Standorte entlang der Linie laut Schienennetz des BAV. Anfang "
                       "und Ende nennt die Quelle nicht; aufgeführt sind die Betriebspunkte mit "
                       "dem kleinsten und dem grössten Kilometer.",
            "kleinster_km_bei": erster["name"],
            "kleinster_km": num(erster["km"]),
            "kleinster_km_bei_uic": erster["nummer"] if erster["nummer"] in namen else None,
            "groesster_km_bei": letzter["name"],
            "groesster_km": num(letzter["km"]),
            "groesster_km_bei_uic": letzter["nummer"] if letzter["nummer"] in namen else None,
        },
        "bahnhoefe": {
            "source": "schienennetz",
            "hinweis": "Nur Bahnhöfe aus Taktland, nach ihrem Kilometer auf der Linie laut "
                       "Schienennetz des BAV geordnet.",
            "betriebspunkte_erfasst": len(bav["punkte"]),
            "anzahl_in_taktland": len(eigene),
            "items": [{"uic": p["nummer"], "name": namen[p["nummer"]], "km": num(p["km"])}
                      for p in eigene],
        },
    }


def luecken(f):
    fehlt = []

    def lueckt(thema, grund, quelle):
        fehlt.append({"thema": thema, "grund": grund, "quelle": quelle})

    bav = f.get("quelle") == "schienennetz"
    if bav:
        lueckt("Linie einer anderen Bahn",
               "Diese Linie fehlt in den Daten der SBB. Sie stammt aus dem Schienennetz des "
               "Bundesamts für Verkehr (BAV). Tunnel, Brücken und Bahnübergänge sind nur in den "
               "Daten der SBB erfasst.",
               "schienennetz")
        lueckt("Länge der Linie",
               "Die Länge der Linie steht nicht in den offenen Daten. Erfasst ist der Kilometer "
               "jedes Betriebspunkts, ein Standort auf der Linie.",
               "schienennetz")
        lueckt("Anfang und Ende",
               "Welcher Betriebspunkt Anfang und welcher Ende der Linie ist, nennt das "
               "Schienennetz nicht. Aufgeführt sind die Betriebspunkte mit dem kleinsten und dem "
               "grössten Kilometer.",
               "schienennetz")
    else:
        lueckt("Länge der Linie",
               "Die Länge der Linie steht nicht in den offenen Daten. Erfasst sind der "
               "Anfangs- und der End-Kilometer ihrer Kilometrierung.",
               "linie")
    lueckt("Baujahr der Linie",
           "Wann die Linie gebaut oder eröffnet wurde, steht nicht in den offenen Daten. "
           "Ein Jahr ist nur für Tunnel erfasst: das Jahr der ersten Inbetriebnahme.",
           "schienennetz" if bav else "linie, tunnel")
    if f.get("netz"):
        lueckt("Stand des Schienennetzes",
               f"Das Schienennetz des BAV trägt den Stand vom {f['netz']['stand']}. Was sich "
               "seither geändert hat, ist darin nicht erfasst.",
               "schienennetz")
    else:
        lueckt("Ein- oder mehrspurig",
               "Wie viele Gleise die Linie hat, steht in den Daten der SBB nicht, und im "
               "Schienennetz des BAV fehlt diese Linie. Erfasst ist das nur für Tunnel, als "
               "Tunnelsystem.",
               "linie, tunnel")
    bh = f["bahnhoefe"]
    quelle_bh = bh["source"]
    if not bh["anzahl_in_taktland"]:
        lueckt("Bahnhöfe",
               f"Keiner der {bh['betriebspunkte_erfasst']} erfassten Betriebspunkte dieser Linie "
               "ist ein Bahnhof in Taktland.",
               quelle_bh)
    elif bh["betriebspunkte_erfasst"] > bh["anzahl_in_taktland"]:
        lueckt("Weitere Betriebspunkte",
               f"Aufgeführt sind die {bh['anzahl_in_taktland']} Bahnhöfe, die Taktland kennt. "
               f"{'Das Schienennetz' if bav else 'Die Liste der Betriebspunkte'} führt für diese "
               f"Linie {bh['betriebspunkte_erfasst']} "
               f"{'Betriebspunkte' if bav else 'Einträge'}. Die übrigen sind in Taktland nicht als "
               "Bahnhof geführt.",
               quelle_bh)
    if f.get("bruecken"):
        lueckt("Länge und Baujahr der Brücken",
               "Länge und Baujahr der Brücken stehen nicht in den offenen Daten. Erfasst "
               "sind Name, Kilometer, Kanton und die Zahl der Baueinheiten.",
               "brucken")
        lueckt("Namen der Brücken",
               "Die Namen stehen wie in der Quelle, oft mit Abkürzungen wie «PI», «PU» oder "
               "«WU». Was diese bedeuten, erklärt die Quelle nicht.",
               "brucken")
        lueckt("Stand der Brückendaten",
               "Die Beschreibung der Quelle nennt als letzte Aktualisierung auf Deutsch "
               "«Januar 24», auf Englisch «Jan 2026».",
               "brucken")
    elif not bav:
        lueckt("Brücken",
               "Für diese Linie ist keine Brücke erfasst. Das schliesst nicht aus, "
               "dass es eine gibt.",
               "brucken")
    bue = f.get("bahnuebergaenge")
    if bue:
        lueckt("Einträge zu den Bahnübergängen",
               "Namen und Sicherungsart stehen wie in der Quelle, auch abgekürzt, etwa "
               "«VRA» oder «Bedarfsschrankenanl». Einige Felder beschreibt die Quelle mit "
               "Texten aus anderen Datensätzen, etwa den Namen als «Bezeichnung der "
               "Treppe/Rampe». Verwendet sind nur die Sicherungsart und die Zahl der "
               "gekreuzten Gleise.",
               "bahnubergang")
        if bue["ohne_sicherungsart"]:
            lueckt("Sicherungsart",
                   f"Bei {bue['ohne_sicherungsart']} der erfassten Bahnübergänge ist keine "
                   "Sicherungsart eingetragen.",
                   "bahnubergang")
        if bue["ohne_gleiszahl"]:
            lueckt("Zahl der Gleise",
                   f"Bei {bue['ohne_gleiszahl']} der erfassten Bahnübergänge ist keine Zahl "
                   "der gekreuzten Gleise eingetragen, oder sie steht auf 0.",
                   "bahnubergang")
        lueckt("Stand der Bahnübergänge",
               "Die Quelle wird laut ihrer Beschreibung wöchentlich aktualisiert und "
               f"vervollständigt. Taktland zeigt den Stand vom {abgerufen('bahnubergang')}.",
               "bahnubergang")
    elif not bav:
        lueckt("Bahnübergänge",
               "Für diese Linie ist kein Bahnübergang erfasst. Das schliesst nicht aus, "
               "dass es einen gibt.",
               "bahnubergang")
    if not f.get("tunnel") and not bav:
        lueckt("Tunnel",
               "Für diese Linie ist kein Tunnel erfasst. Das schliesst nicht aus, "
               "dass es einen gibt.",
               "tunnel")
    lueckt("Züge auf der Linie",
           "Welche Züge auf dieser Linie fahren, ist nicht Teil dieser Daten. Eine Linie "
           "ist hier eine Strecke der Infrastruktur, keine Zuglinie wie eine S-Bahn.",
           "schienennetz" if bav else "linie")
    return fehlt


def main():
    stand = datenstand()
    namen = bahnhoefe_aus_facts()
    linie = load("linie").set_index("linie")
    bp = load("linie-mit-betriebspunkten")
    bp["uic"] = pd.to_numeric(bp.bpuic, errors="coerce")
    tunnel = load("tunnel")
    tunnel["linie"] = pd.to_numeric(tunnel.linie, errors="coerce")
    bruecken = load("brucken")
    bruecken["linie"] = pd.to_numeric(bruecken.linie, errors="coerce")
    uebergaenge = load("bahnubergang")
    uebergaenge["linie"] = pd.to_numeric(uebergaenge.linie, errors="coerce")

    ZIEL.mkdir(parents=True, exist_ok=True)
    for alt in ZIEL.glob("*.json"):
        alt.unlink()

    bav_linien, stand_bav = schienennetz.je_linie()
    geschrieben = []
    #: Name jeder Linie mit Seite, wie auf ihrer Seite
    seiten_namen = {}
    standort = {"tunnel": [], "bruecken": [], "bahnuebergaenge": []}

    def fertig(f, nr):
        """Tunnel, Brücken und Bahnübergänge aus den Daten der SBB, das Netz aus
        dem Schienennetz des BAV, dann Lücken und Kapitel, und schreiben."""
        tu = tunnel[tunnel.linie == nr]
        bav = bav_linien.get(str(int(nr)))
        if bav:
            f["netz"] = netz(bav, stand_bav)
        if not tu.empty:
            items = tunnel_items(tu)
            standort["tunnel"] += lagen(tu, "km_go", "geopos", nr, items)
            laengste = einzige_oder_alle(items, "laenge_m", max)
            aelteste = einzige_oder_alle(items, "inbetriebnahme_jahr", min)
            f["tunnel"] = {
                "source": "tunnel",
                "hinweis": "Länge, Jahr der ersten Inbetriebnahme, Tunnelsystem und Kanton wie "
                           "in der Quelle. km ist der Kilometer auf der Linie.",
                "anzahl_erfasst": len(items),
                # Gleichstand: alle mit dem besten Wert, und wie viele es sind,
                # damit der Text die Zahl nicht selbst zählen muss
                "laengste": laengste,
                "anzahl_laengste": len(laengste),
                "aelteste": aelteste,
                "anzahl_aelteste": len(aelteste),
                "items": items,
            }
        br = bruecken[bruecken.linie == nr]
        if not br.empty:
            items = bruecken_items(br)
            standort["bruecken"] += lagen(br, "km", "geopos", nr, items)
            meiste = einzige_oder_alle(items, "baueinheiten", max)
            f["bruecken"] = {
                "source": "brucken",
                "hinweis": "Name, Kilometer und Kanton wie in der Quelle. Eine Brücke besteht "
                           "aus einer oder mehreren Baueinheiten; Länge und Baujahr fehlen.",
                "anzahl_erfasst": len(items),
                "nach_kanton": nach_kanton(items),
                "meiste_baueinheiten": items[meiste[0]]["baueinheiten"] if meiste else None,
                "mit_meisten": meiste,
                "anzahl_mit_meisten": len(meiste),
                "items": items,
            }
        ue = uebergaenge[uebergaenge.linie == nr]
        if not ue.empty:
            items = uebergang_items(ue)
            standort["bahnuebergaenge"] += lagen(ue, "km", "geoposition", nr, items)
            meiste = einzige_oder_alle(items, "gleise", max)
            f["bahnuebergaenge"] = {
                "source": "bahnubergang",
                "hinweis": "Name und Sicherungsart wie in der Quelle. gleise ist die Zahl der "
                           "gekreuzten Gleise; 0 und leere Felder stehen als null.",
                "anzahl_erfasst": len(items),
                "nach_sicherungsart": nach_feld(items, "sicherungsart"),
                "ohne_sicherungsart": sum(1 for it in items if not it["sicherungsart"]),
                "ohne_gleiszahl": sum(1 for it in items if not it["gleise"]),
                "meiste_gleise": items[meiste[0]]["gleise"] if meiste else None,
                "mit_meisten_gleisen": meiste,
                "anzahl_mit_meisten_gleisen": len(meiste),
                "items": items,
            }
        f["luecken"] = luecken(f)
        mit_kapitel = {"strecke": True, "tunnel": bool(f.get("tunnel")),
                       "bruecken": bool(f.get("bruecken")),
                       "bahnuebergaenge": bool(f.get("bahnuebergaenge")),
                       "bahnhoefe": f["bahnhoefe"]["anzahl_in_taktland"] >= MINDESTENS_BAHNHOEFE,
                       "weitere_bahnhoefe": bool(f.get("weitere_bahnhoefe")),
                       "netz": bool(f.get("netz"))}
        f["verfuegbare_kapitel"] = [k for k in ("strecke", "bahnhoefe", "weitere_bahnhoefe", "netz",
                                                "tunnel", "bruecken", "bahnuebergaenge")
                                    if mit_kapitel[k]]
        (ZIEL / f"{int(nr)}.json").write_text(json.dumps(f, ensure_ascii=False, indent=1) + "\n",
                                             encoding="utf-8")
        geschrieben.append(int(nr))
        seiten_namen[str(int(nr))] = f["name"]

    for nr, gruppe in bp.groupby("linie"):
        eigene = gruppe[gruppe.uic.isin(namen)].sort_values("km")
        tu = tunnel[tunnel.linie == nr]
        if nr not in linie.index or (eigene.uic.nunique() < MINDESTENS_BAHNHOEFE and tu.empty):
            continue
        li = linie.loc[nr]
        f = {
            "linie": int(nr),
            "name": txt(li.linienname),
            "datenstand": stand,
            "strecke": {
                "source": "linie",
                "hinweis": "Kilometrierung: Standortangaben entlang der Linie. "
                           "Die Differenz ist nicht als Länge der Linie belegt.",
                "anfang": txt(li.bpk_anfang),
                "ende": txt(li.bpk_ende),
                "km_anfang": num(li.km_anfang),
                "km_ende": num(li.km_ende),
                # Bahnhof aus Taktland am Anfang oder Ende, sonst null
                "anfang_uic": endpunkt_uic(gruppe, li.bpk_anfang, li.km_anfang, namen),
                "ende_uic": endpunkt_uic(gruppe, li.bpk_ende, li.km_ende, namen),
            },
            "bahnhoefe": {
                "source": "linie-mit-betriebspunkten",
                "hinweis": "Nur Bahnhöfe aus Taktland, nach ihrem Kilometer auf der Linie geordnet.",
                "betriebspunkte_erfasst": int(gruppe.abkurzung_bpk.nunique()),
                "anzahl_in_taktland": int(eigene.uic.nunique()),
                "items": [{"uic": int(r.uic), "name": namen[int(r.uic)], "km": num(r.km)}
                          for _, r in eigene.iterrows()],
            },
        }
        # Bahnhöfe, die das Schienennetz des BAV auf dieser Linie zusätzlich führt
        bav = bav_linien.get(str(int(nr)))
        schon = {it["uic"] for it in f["bahnhoefe"]["items"]}
        weitere = [x for x in (bav or {}).get("punkte", []) if x["nummer"] in namen and x["nummer"] not in schon]
        if weitere:
            f["weitere_bahnhoefe"] = {
                "source": "schienennetz",
                "hinweis": "Bahnhöfe aus Taktland, die das Schienennetz des BAV auf dieser Linie "
                           "führt, die Liste der Betriebspunkte der SBB aber nicht. Kilometer laut "
                           "Schienennetz.",
                "anzahl": len(weitere),
                "items": [{"uic": x["nummer"], "name": namen[x["nummer"]], "km": num(x["km"])}
                          for x in weitere],
            }
        fertig(f, nr)
    print(f"{len(geschrieben)} Linien aus den Daten der SBB")

    # Linien anderer Bahnen, die nur das Schienennetz des BAV führt; keine
    # Tramlinien (Nummern mit Buchstaben)
    for nummer, bav in sorted(bav_linien.items(), key=lambda x: x[0]):
        if not nummer.isdigit() or int(nummer) in geschrieben:
            continue
        f = bav_fakten(nummer, bav, namen, stand)
        if f["bahnhoefe"]["anzahl_in_taktland"] < MINDESTENS_BAHNHOEFE:
            continue
        fertig(f, int(nummer))
    print(f"{len(geschrieben)} Linien geschrieben nach data/linien")

    # Was ohne eigene Seite bleibt, wird gezählt und in der App genannt
    ohne = bruecken[~bruecken.linie.isin(geschrieben)]
    ohne_ue = uebergaenge[~uebergaenge.linie.isin(geschrieben)]
    # Die Brücken darauf stehen in der Übersicht aller Brücken, mit ihrer
    # Linie. Den Namen der Linie gibt es nur, wenn linie.csv sie führt.
    bruecken_ohne_seite = [
        {"linie": int(nr),
         "name": txt(linie.loc[nr].linienname) if nr in linie.index else None,
         "items": bruecken_items(gruppe)}
        for nr, gruppe in ohne.groupby("linie")
    ]
    # ebenso die Bahnübergänge darauf: Die Seite «Standort» nennt sie
    uebergaenge_ohne_seite = [
        {"linie": int(nr),
         "name": txt(linie.loc[nr].linienname) if nr in linie.index else None,
         "items": uebergang_items(gruppe)}
        for nr, gruppe in ohne_ue.groupby("linie")
    ]
    for liste, df, art, sortfeld, geofeld in (
            (bruecken_ohne_seite, ohne, "bruecken", "km", "geopos"),
            (uebergaenge_ohne_seite, ohne_ue, "bahnuebergaenge", "km", "geoposition")):
        for x in liste:
            standort[art] += lagen(df[df.linie == x["linie"]], sortfeld, geofeld,
                                   x["linie"], x["items"])
    # Name jeder Linie aus «linie», für Linien mit Seite der Name auf der Seite
    # (bei Linien anderer Bahnen aus dem Schienennetz des BAV)
    alle_namen = {str(int(nr)): txt(r.linienname) for nr, r in linie.iterrows()}
    alle_namen.update(seiten_namen)
    alle_namen = dict(sorted(alle_namen.items(), key=lambda x: int(x[0])))
    standort = {
        "datenstand": {q: abgerufen(q) for q in ("linie", "tunnel", "brucken", "bahnubergang")},
        "hinweis": "Lage wie in der Quelle (tunnel und brucken: geopos, bahnubergang: "
                   "geoposition), gerundet auf sechs Stellen. Eine Zeile: Linie, Stelle, Name, "
                   "Breite, Länge. Die Stelle ist der Platz des Eintrags in der Liste seiner "
                   "Linie in data/linien/, auf Linien ohne eigene Seite in "
                   "data/linien_uebersicht.json.",
        "linien": {nr: [name, int(nr) in geschrieben] for nr, name in alle_namen.items()},
        **standort,
    }
    standort_schreiben(standort)
    print(f"standort.json: {len(standort['tunnel'])} Tunnel, {len(standort['bruecken'])} "
          f"Brücken, {len(standort['bahnuebergaenge'])} Bahnübergänge")
    uebersicht = {
        "datenstand": stand,
        # je Datensatz der Tag des Abrufs: Die Übersichten «Tunnel» und «Brücken»
        # und das Tunnel-Duell nennen den Stand ihrer eigenen Quelle, nicht den
        # neuesten aller Quellen
        "abgerufen": {q: abgerufen(q) for q in QUELLEN + QUELLEN_BAV},
        "hinweis": "Brücken und Bahnübergänge auf Linien ohne eigene Seite: weniger als zwei "
                   "Bahnhöfe in Taktland und kein Tunnel.",
        "bruecken_ohne_seite": int(len(ohne)),
        "linien_ohne_seite_mit_bruecken": int(ohne.linie.nunique()),
        "bahnuebergaenge_ohne_seite": int(len(ohne_ue)),
        "linien_ohne_seite_mit_bahnuebergaengen": int(ohne_ue.linie.nunique()),
        "linien_ohne_seite_mit_bruecken_oder_bahnuebergaengen":
            int(len(set(ohne.linie) | set(ohne_ue.linie))),
        "bruecken_ohne_seite_liste": bruecken_ohne_seite,
        "bahnuebergaenge_ohne_seite_liste": uebergaenge_ohne_seite,
        # Name jeder Linie, auch ohne eigene Seite (Seite «Strecke»)
        "linien_namen": alle_namen,
    }
    UEBERSICHT.write_text(json.dumps(uebersicht, ensure_ascii=False, indent=1) + "\n",
                          encoding="utf-8")
    print(f"ohne Seite: {uebersicht['bruecken_ohne_seite']} Brücken und "
          f"{uebersicht['bahnuebergaenge_ohne_seite']} Bahnübergänge auf "
          f"{uebersicht['linien_ohne_seite_mit_bruecken_oder_bahnuebergaengen']} Linien")


if __name__ == "__main__":
    assert all(q in DATASETS for q in QUELLEN), "Quelle fehlt in sources.py"
    main()
