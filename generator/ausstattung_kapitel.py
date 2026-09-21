#!/usr/bin/env python3
"""Baut das Kapitel «Ausstattung» aus den Fakten, ohne Sprachmodell.

Das Kapitel besteht aus erfassten Stückzahlen und Perronbelägen. Ein Modell
fügt dem nichts hinzu, was nicht schon in den Daten steht - es würde nur
Geld kosten und die Gefahr einer Deutung mitbringen. Darum hier mechanisch.

Die Sätze gleichen sich zwangsläufig über die Bahnhöfe hinweg. Das ist bei
einer Aufzählung von Beständen hinnehmbar und ehrlicher als eine Vielfalt,
die es in den Daten nicht gibt.

    python generator/ausstattung_kapitel.py data/profiles/8502113.de.json
    python generator/ausstattung_kapitel.py --alle
    python generator/ausstattung_kapitel.py --alle --neu   # bestehende Kapitel neu bauen

Vorsicht mit --neu: Es baut auch die Antwortoptionen neu, und zwar mit dem
aktuellen Generator. Nachbesserungen von distraktoren_richten.py gehen dabei
verloren. Für eine einzelne geänderte Regel lieber gezielt ersetzen, wie es
sortieren_richten.py mit den Sortierfragen tut.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from distraktoren import vorschlaege  # noqa: E402
from taktland import PROFILES, fakten_laden, klar_getrennt  # noqa: E402

#: Wie die Bestände im Text heissen. Immer «erfasst», nie «vorhanden»:
#: ein fehlender Eintrag heisst nicht, dass der Gegenstand fehlt.
BESTAENDE = [
    ("sitzbaenke", "Sitzbank", "Sitzbänke"),
    ("infopunkte", "Infopunkt", "Infopunkte"),
    ("schliessfaecher", "Schliessfach", "Schliessfächer"),
]


def ch(n):
    return f"{int(n):,}".replace(",", "'")


def aufzaehlen(teile):
    if len(teile) == 1:
        return teile[0]
    return ", ".join(teile[:-1]) + " sowie " + teile[-1]


def body_text(name, a):
    saetze = []
    teile = [f"{ch(a[feld])} {mehrz if a[feld] != 1 else einz}"
             for feld, einz, mehrz in BESTAENDE if feld in a]
    if teile:
        # Vernier: «sind für Vernier 1 Sitzbank erfasst»
        einzeln = len(teile) == 1 and teile[0].startswith("1 ")
        saetze.append(f"In den offenen Daten {'ist' if einzeln else 'sind'} für {name} "
                      f"{aufzaehlen(teile)} erfasst.")
    pb = a.get("perronbelag")
    if pb:
        arten = pb["belagsarten"]
        n = pb["anzahl_perrons_mit_daten"]
        # Sissach: «Zu 1 Perrons liegt der Belag vor, erfasst ist überall: …»
        zu = "Zu 1 Perron" if n == 1 else f"Zu {n} Perrons"
        if len(arten) == 1:
            # Nominativ, weil sich die Belagsnamen nicht zuverlaessig beugen
            # lassen: «aus Bituminöses Mischgut» war falsch.
            saetze.append(f"{zu} liegt der Belag vor: {arten[0]}." if n == 1 else
                          f"{zu} liegt der Belag vor, erfasst ist überall: {arten[0]}.")
        else:
            saetze.append(f"{zu} liegt der Belag vor, erfasst sind {aufzaehlen(arten)}.")
    saetze.append("Die Erhebung ist unvollständig: Was nicht aufgeführt ist, fehlt "
                  "in den Daten und nicht zwingend vor Ort.")
    return " ".join(saetze)


def fakten_karten(a):
    karten = []
    for feld, einz, mehrz in BESTAENDE:
        if feld in a:
            karten.append({"label": f"{mehrz} erfasst", "value": a[feld],
                           "source": "mobiliar-im-bahnhof",
                           "factRef": f"ausstattung.{feld}"})
    pb = a.get("perronbelag")
    if pb:
        karten.append({"label": "Perrons mit erfasstem Belag",
                       "value": pb["anzahl_perrons_mit_daten"],
                       "source": "perronoberflache",
                       "factRef": "ausstattung.perronbelag.anzahl_perrons_mit_daten"})
    return karten


def frage_bestand(uic, a, feld, einz, mehrz, nummer=0):
    """Frage auf eine erfasste Stückzahl. Der Typ wechselt nach Reihenfolge."""
    wert = a[feld]
    erklaerung = (f"Erfasst {'ist' if wert == 1 else 'sind'} {ch(wert)} {mehrz if wert != 1 else einz}. "
                  "Die Zahl gibt den erhobenen Bestand wieder, nicht "
                  "zwingend den Bestand vor Ort.")

    if nummer % 3 == 2 and wert >= 8:
        # Schieberegler braucht eine sinnvolle Spanne, darum erst ab 8
        # bewusst unsymmetrisch: Der Regler startet unten, eine mittige
        # Spanne wuerde die Antwort verschenken
        spanne = max(4, round(wert * 0.8))
        return {
            "type": "slider",
            "prompt": f"Wie viele {mehrz} sind in den offenen Daten erfasst?",
            "min": max(0, wert - round(spanne * 0.5)), "max": wert + spanne,
            "step": 1, "unit": mehrz, "correct": wert,
            "explanation": erklaerung,
            "factRef": f"ausstattung.{feld}",
            "difficulty": 2,
        }

    frei, alle_frei = vorschlaege(uic, wert, 3)
    optionen = sorted({wert, *[int(f) for f in frei]})
    if len(optionen) < 3:
        return None
    # Lückentext nur ab 2: «sind ___ Infopunkte erfasst» mit der Antwort 1
    # ergab «1 Infopunkte». Dann die Frageform, die für jede Zahl passt.
    luecke = nummer % 3 == 1 and wert != 1
    fr = {
        "type": "cloze" if luecke else "single_choice",
        "prompt": (f"In den offenen Daten sind ___ {mehrz} erfasst."
                   if luecke
                   else f"Wie viele {mehrz} sind in den offenen Daten erfasst?"),
        "options": [ch(o) for o in optionen],
        "correct": optionen.index(wert),
        "explanation": erklaerung,
        "factRef": f"ausstattung.{feld}",
        "difficulty": 1,
    }
    if not alle_frei:
        fr["optionen_aus_fakten"] = True
    return fr


def frage_belag(a):
    """Single Choice auf den Belag, wenn es nur einen gibt."""
    pb = a.get("perronbelag")
    if not pb or len(pb["belagsarten"]) != 1:
        return None
    richtig = pb["belagsarten"][0]
    andere = ["Bituminöses Mischgut", "Verbundstein-Pflästerung", "Beton-Belag",
              "Gussasphalt", "Naturstein-Pflästerung", "Kiessandbelag"]
    optionen = [richtig] + [x for x in andere if x != richtig][:3]
    optionen.sort()
    return {
        "type": "single_choice",
        # Knonau: ein Perron mit Belag, die Frage sprach von «den Perrons»
        "prompt": ("Welcher Belag ist für das erfasste Perron verzeichnet?"
                   if pb["anzahl_perrons_mit_daten"] == 1 else "Welcher Belag ist für die Perrons erfasst?"),
        "options": optionen,
        "correct": optionen.index(richtig),
        "explanation": (f"Für das Perron mit Daten ist {richtig} erfasst."
                        if pb["anzahl_perrons_mit_daten"] == 1 else
                        f"Für alle Perrons mit Daten ist {richtig} erfasst."),
        "factRef": "ausstattung.perronbelag.belagsarten",
        "optionen_aus_fakten": True,
        "difficulty": 2,
    }


def frage_flaeche(a):
    """Sortieren nach erfasster Perronfläche, wenn die Werte eindeutig sind."""
    pb = a.get("perronbelag")
    if not pb:
        return None
    items = []
    for i, e in enumerate(pb["items"]):
        items.append({"label": f"Perron {e['nr']}", "value": e["flaeche_m2"],
                      "factRef": f"ausstattung.perronbelag.items[{i}].flaeche_m2"})
    # Fast gleiche Flächen lassen sich nicht auseinanderhalten: nur die
    # deutlich verschiedenen bleiben, sonst entfällt die Frage.
    klar = klar_getrennt(items)
    if len(klar) < 3:
        return None
    items = klar[:4]
    gross, klein = items[0], items[-1]
    return {
        "type": "sort",
        "prompt": "Ordne die Perrons nach erfasster Belagsfläche, grösste zuerst.",
        "richtung": "absteigend",
        "items": items,
        "factRef": "ausstattung.perronbelag.items",
        "explanation": (f"{gross['label']} hat mit {ch(gross['value'])} Quadratmetern "
                        f"die grösste erfasste Belagsfläche, {klein['label']} mit "
                        f"{ch(klein['value'])} die kleinste der gezeigten."
                        + (" Perrons mit fast gleicher Belagsfläche bleiben weg."
                           if len(klar) < len(pb["items"]) else "")),
        "difficulty": 2,
    }


def kapitel_bauen(uic, name, a):
    fragen = []
    for nr, (feld, einz, mehrz) in enumerate(BESTAENDE):
        if feld in a:
            if fr := frage_bestand(uic, a, feld, einz, mehrz, nr):
                fragen.append(fr)
    if fr := frage_belag(a):
        fragen.append(fr)
    if fr := frage_flaeche(a):
        fragen.append(fr)
    if not fragen:
        return None
    return {
        "id": "ausstattung",
        "title": "Ausstattung",
        "body": body_text(name, a),
        "facts": fakten_karten(a),
        "questions": fragen,
    }


def einfuegen(profil, fakten, neu=False):
    """Setzt das Kapitel hinter services, sonst ans Ende."""
    a = fakten.get("ausstattung")
    if not a:
        return False
    da = [i for i, k in enumerate(profil["chapters"]) if k.get("id") == "ausstattung"]
    if da and not neu:
        return False
    kap = kapitel_bauen(fakten["uic"], fakten["name"], a)
    if da:
        if kap:
            profil["chapters"][da[0]] = kap
        else:
            del profil["chapters"][da[0]]
        return True
    if not kap:
        return False
    stellen = [i for i, k in enumerate(profil["chapters"]) if k.get("id") == "services"]
    profil["chapters"].insert(stellen[0] + 1 if stellen else len(profil["chapters"]), kap)
    return True


def main():
    pfade = [Path(x) for x in sys.argv[1:] if not x.startswith("--")]
    if "--alle" in sys.argv:
        pfade = sorted(PROFILES.glob("*.json"))
    if not pfade:
        print(__doc__)
        return 1
    n = 0
    for p in pfade:
        profil = json.loads(p.read_text(encoding="utf-8"))
        vorher = json.dumps(profil, ensure_ascii=False, indent=2)
        if einfuegen(profil, fakten_laden(profil["uic"]), neu="--neu" in sys.argv):
            nachher = json.dumps(profil, ensure_ascii=False, indent=2)
            if nachher != vorher:
                p.write_text(nachher, encoding="utf-8")
                n += 1
    print(f"{n} Profile mit neuem oder geändertem Kapitel Ausstattung")
    return 0


if __name__ == "__main__":
    sys.exit(main())
