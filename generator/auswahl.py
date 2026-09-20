#!/usr/bin/env python3
"""Waehlt Bahnhoefe so aus, dass moeglichst viele Datenkonstellationen vorkommen.

Nicht die groessten oder die bekanntesten, sondern die, welche die Vorlage an
neuen Stellen fordert: fehlende Gleisdaten, Hilfstritte, Gleisquerung, andere
Betreiberinnen, Sprachregionen, Randfaelle bei den Services.

    python generator/auswahl.py 10
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "data" / "facts"
PROFILES = ROOT / "data" / "profiles"

# Sprachregion grob nach Kanton, fuer die Vielfalt der Namen und Streckenbezeichnungen
WELSCH = {"VD", "GE", "NE", "JU"}
ITALIENISCH = {"TI"}
ZWEISPRACHIG = {"FR", "VS", "BE", "GR"}


def merkmale(d):
    """Menge von Eigenschaften, die eine Datenkonstellation beschreiben."""
    m = set()
    sb = d["steckbrief"]
    g = d.get("gleise") or {}
    h = d.get("hindernisfreiheit") or {}
    p = d.get("perrons") or {}
    sv = d.get("services") or {}
    li = d.get("linien") or {}
    z = d.get("zuege") or {}

    m.add(f"stufe:{d['tier']}")
    isb = str(sb.get("isb") or "?").strip()
    m.add(f"betreiberin:{isb}")
    kt = sb.get("kanton") or "?"
    m.add("sprache:fr" if kt in WELSCH else
          "sprache:it" if kt in ITALIENISCH else
          "sprache:gemischt" if kt in ZWEISPRACHIG else "sprache:de")

    n = g.get("anzahl_mit_daten", 0)
    m.add("gleise:keine" if n == 0 else "gleise:1-2" if n <= 2 else
          "gleise:3-5" if n <= 5 else "gleise:6-10" if n <= 10 else "gleise:viele")
    hoehen = g.get("perronhoehen_cm", [])
    m.add(f"perronhoehen:{min(len(hoehen), 4)}")
    if 55 in hoehen:
        m.add("hat55")
    if hoehen and 55 not in hoehen:
        m.add("ohne55")          # nirgends stufenfrei
    if h.get("segmente_mit_hilfstritt"):
        m.add("hilfstritt")
    if h.get("gleisquerung_noetig"):
        m.add("gleisquerung")
    if not h:
        m.add("hindernisfreiheit:fehlt")
    if p.get("anzahl_mit_daten", 0) == 0:
        m.add("perrons:fehlen")
    if any(i.get("sektoren") for i in g.get("items", [])):
        m.add("sektoren:ja")
    else:
        m.add("sektoren:nein")

    m.add("tagesrhythmus:ja" if d.get("tagesrhythmus") else "tagesrhythmus:nein")
    m.add("bahnhofplan:ja" if d.get("bahnhofplan") else "bahnhofplan:nein")
    m.add("bahnhofbenutzer:ja" if d.get("bahnhofbenutzer") else "bahnhofbenutzer:nein")

    anz_li = li.get("anzahl", 0)
    m.add("linien:keine" if anz_li == 0 else "linien:1" if anz_li == 1 else
          "linien:2-3" if anz_li <= 3 else "linien:4+")
    if not z:
        m.add("zugzahlen:fehlen")
    if sb.get("bemerkung"):
        m.add("bemerkung:ja")
    if sv.get("wlan_erfasst"):
        m.add("wlan:ja")
    if "billettautomaten_erfasst" not in sv:
        m.add("ausstattung:fehlt")
    elif sv.get("billettautomaten_erfasst") == 0:
        m.add("automaten:keine")
    if sv.get("wartehallen_erfasst", 0) > 5:
        m.add("wartehallen:viele")
    if len(str(sb.get("evu") or "").split(",")) >= 3:
        m.add("evu:mehrere")

    # Feinere Merkmale, damit die Auswahl auch dann noch etwas unterscheidet,
    # wenn die groben Konstellationen schon abgedeckt sind.
    m.add(f"kanton:{kt}")
    for i in g.get("items", []):
        if i.get("perrontyp"):
            m.add(f"perrontyp:{i['perrontyp']}")
        s = i.get("sektoren") or []
        if s:
            m.add(f"sektoren_ab:{s[0]}")
            m.add(f"sektoren_bis:{s[-1]}")
    for i in p.get("items", []):
        if i.get("typ"):
            m.add(f"perrontyp:{i['typ']}")
    for typ in sv.get("automat_typen", []) or []:
        m.add(f"automat:{typ}")
    hoehe = (d.get("stammdaten") or {}).get("hoehe_m_ue_m")
    if hoehe:
        m.add("lage:tief" if hoehe < 300 else "lage:hoch" if hoehe > 900 else "lage:mittel")
    laengste = p.get("laengste_m")
    if laengste:
        m.add("perron:sehr_kurz" if laengste < 120 else
              "perron:sehr_lang" if laengste > 500 else "perron:mittel")
    n_abschnitte = len(z.get("abschnitte", []))
    m.add("abschnitte:viele" if n_abschnitte >= 8 else
          "abschnitte:wenige" if n_abschnitte <= 2 else "abschnitte:mittel")
    return m


def laden():
    return [json.loads(f.read_text(encoding="utf-8")) for f in sorted(FACTS.glob("*.json"))]


def fertige():
    return {json.loads(f.read_text(encoding="utf-8"))["uic"]
            for f in PROFILES.glob("*.json")}


def waehlen(anzahl):
    alle = laden()
    schon = fertige()
    abgedeckt = set()
    for d in alle:
        if d["uic"] in schon:
            abgedeckt |= merkmale(d)

    offen = [d for d in alle if d["uic"] not in schon]
    gewaehlt = []
    for _ in range(anzahl):
        # den Bahnhof nehmen, der am meisten Neues bringt; bei Gleichstand den
        # mit der hoeheren Frequenz, damit die Auswahl relevant bleibt
        bester = max(offen, key=lambda d: (len(merkmale(d) - abgedeckt),
                                           d["steckbrief"].get("dwv") or 0))
        neu = merkmale(bester) - abgedeckt
        if not neu and gewaehlt:
            break
        gewaehlt.append((bester, neu))
        abgedeckt |= merkmale(bester)
        offen.remove(bester)
    return gewaehlt, abgedeckt


def main():
    anzahl = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    alle = laden()
    vorhanden = set()
    for d in alle:
        vorhanden |= merkmale(d)
    schon = fertige()
    heute = set()
    for d in alle:
        if d["uic"] in schon:
            heute |= merkmale(d)

    print(f"Merkmale insgesamt: {len(vorhanden)}")
    print(f"Durch die {len(schon)} fertigen Profile abgedeckt: {len(heute)}")
    fehlt = sorted(vorhanden - heute)
    print(f"Noch nicht abgedeckt ({len(fehlt)}): {', '.join(fehlt)}\n")

    gewaehlt, danach = waehlen(anzahl)
    print(f"{'Bahnhof':<24}{'UIC':>9}{'St':>3}{'DWV':>8}  neue Merkmale")
    for d, neu in gewaehlt:
        print(f"{d['name']:<24}{d['uic']:>9}{d['tier']:>3}"
              f"{d['steckbrief'].get('dwv') or 0:>8}  {', '.join(sorted(neu)) or '—'}")
    print(f"\nNach diesen {len(gewaehlt)}: {len(danach)} von {len(vorhanden)} Merkmalen abgedeckt")
    rest = sorted(vorhanden - danach)
    if rest:
        print(f"Dann noch offen: {', '.join(rest)}")


if __name__ == "__main__":
    main()
