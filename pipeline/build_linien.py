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

    .venv/bin/python pipeline/build_linien.py
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sources import DATASETS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
FACTS = ROOT / "data" / "facts"
ZIEL = ROOT / "data" / "linien"
#: Zahlen über alle Linien. Liegt ausserhalb von data/linien, dort ist jede
#: Datei eine Linie.
UEBERSICHT = ROOT / "data" / "linien_uebersicht.json"

#: So viele Bahnhöfe aus Taktland braucht eine Linie ohne Tunnel für eine
#: eigene Seite, und jede Linie für ein Kapitel Bahnhöfe. Mit einem allein
#: gibt es nichts zu ordnen.
MINDESTENS_BAHNHOEFE = 2

QUELLEN = ["linie", "linie-mit-betriebspunkten", "tunnel", "brucken", "bahnubergang"]


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
    return max(abruf[q] for q in QUELLEN)


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


def luecken(f):
    fehlt = []

    def lueckt(thema, grund, quelle):
        fehlt.append({"thema": thema, "grund": grund, "quelle": quelle})

    lueckt("Länge der Linie",
           "Die Länge der Linie steht nicht in den offenen Daten. Erfasst sind der "
           "Anfangs- und der End-Kilometer ihrer Kilometrierung.",
           "linie")
    lueckt("Baujahr der Linie",
           "Wann die Linie gebaut oder eröffnet wurde, steht nicht in den offenen Daten. "
           "Ein Jahr ist nur für Tunnel erfasst: das Jahr der ersten Inbetriebnahme.",
           "linie, tunnel")
    lueckt("Ein- oder mehrspurig",
           "Wie viele Gleise die Linie hat, steht nicht in den offenen Daten. "
           "Erfasst ist das nur für Tunnel, als Tunnelsystem.",
           "linie, tunnel")
    bh = f["bahnhoefe"]
    if not bh["anzahl_in_taktland"]:
        lueckt("Bahnhöfe",
               f"Keiner der {bh['betriebspunkte_erfasst']} erfassten Betriebspunkte dieser Linie "
               "ist ein Bahnhof in Taktland.",
               "linie-mit-betriebspunkten")
    elif bh["betriebspunkte_erfasst"] > bh["anzahl_in_taktland"]:
        lueckt("Weitere Betriebspunkte",
               f"Aufgeführt sind die {bh['anzahl_in_taktland']} Bahnhöfe, die Taktland kennt. "
               f"Die Liste der Betriebspunkte führt für diese Linie {bh['betriebspunkte_erfasst']} "
               "Einträge. Die übrigen sind in Taktland nicht als Bahnhof geführt.",
               "linie-mit-betriebspunkten")
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
    else:
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
               f"vervollständigt. Taktland zeigt den Stand vom {f['datenstand']}.",
               "bahnubergang")
    else:
        lueckt("Bahnübergänge",
               "Für diese Linie ist kein Bahnübergang erfasst. Das schliesst nicht aus, "
               "dass es einen gibt.",
               "bahnubergang")
    if not f.get("tunnel"):
        lueckt("Tunnel",
               "Für diese Linie ist kein Tunnel erfasst. Das schliesst nicht aus, "
               "dass es einen gibt.",
               "tunnel")
    lueckt("Züge auf der Linie",
           "Welche Züge auf dieser Linie fahren, ist nicht Teil dieser Daten. Eine Linie "
           "ist hier eine Strecke der Infrastruktur, keine Zuglinie wie eine S-Bahn.",
           "linie")
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

    geschrieben = []
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
        if not tu.empty:
            items = tunnel_items(tu)
            laengste = einzige_oder_alle(items, "laenge_m", max)
            aelteste = einzige_oder_alle(items, "inbetriebnahme_jahr", min)
            f["tunnel"] = {
                "source": "tunnel",
                "hinweis": "Länge, Jahr der ersten Inbetriebnahme und Tunnelsystem wie in der "
                           "Quelle. km ist der Kilometer auf der Linie.",
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
                       "bahnhoefe": f["bahnhoefe"]["anzahl_in_taktland"] >= MINDESTENS_BAHNHOEFE}
        f["verfuegbare_kapitel"] = [k for k in ("strecke", "bahnhoefe", "tunnel", "bruecken",
                                                "bahnuebergaenge") if mit_kapitel[k]]
        (ZIEL / f"{nr}.json").write_text(json.dumps(f, ensure_ascii=False, indent=1) + "\n",
                                        encoding="utf-8")
        geschrieben.append(int(nr))
    print(f"{len(geschrieben)} Linien geschrieben nach data/linien")

    # Was ohne eigene Seite bleibt, wird gezählt und in der App genannt
    ohne = bruecken[~bruecken.linie.isin(geschrieben)]
    ohne_ue = uebergaenge[~uebergaenge.linie.isin(geschrieben)]
    uebersicht = {
        "datenstand": stand,
        "hinweis": "Brücken und Bahnübergänge auf Linien ohne eigene Seite: weniger als zwei "
                   "Bahnhöfe in Taktland und kein Tunnel.",
        "bruecken_ohne_seite": int(len(ohne)),
        "linien_ohne_seite_mit_bruecken": int(ohne.linie.nunique()),
        "bahnuebergaenge_ohne_seite": int(len(ohne_ue)),
        "linien_ohne_seite_mit_bahnuebergaengen": int(ohne_ue.linie.nunique()),
        "linien_ohne_seite_mit_bruecken_oder_bahnuebergaengen":
            int(len(set(ohne.linie) | set(ohne_ue.linie))),
    }
    UEBERSICHT.write_text(json.dumps(uebersicht, ensure_ascii=False, indent=1) + "\n",
                          encoding="utf-8")
    print(f"ohne Seite: {uebersicht['bruecken_ohne_seite']} Brücken und "
          f"{uebersicht['bahnuebergaenge_ohne_seite']} Bahnübergänge auf "
          f"{uebersicht['linien_ohne_seite_mit_bruecken_oder_bahnuebergaengen']} Linien")


if __name__ == "__main__":
    assert all(q in DATASETS for q in QUELLEN), "Quelle fehlt in sources.py"
    main()
