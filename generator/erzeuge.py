#!/usr/bin/env python3
"""Erzeugt Bahnhofsprofile mit Claude und prüft sie gegen die Fakten.

    python generator/erzeuge.py 8503504                 # ein Bahnhof
    python generator/erzeuge.py --auswahl 10            # die 10 vielfältigsten
    python generator/erzeuge.py --alle --stapel         # alle offenen, im Batch
    python generator/erzeuge.py 8503504 --probelauf     # nur den Auftrag zeigen

Braucht ANTHROPIC_API_KEY in der Umgebung (ausser bei --probelauf).

Schalter: --modell claude-sonnet-5, --aufwand low|medium|high, --stapel, --limit 5

Kostenbremse: Ohne --limit wird nie mehr als 2 Dollar ausgegeben. Schätzt der
Lauf darüber, fragt das Programm nach; überschreitet der laufende Betrag die
Grenze, bricht es ab. Mit --limit 10 setzt man sie höher.
Im Stapel kostet es die Hälfte, dauert aber bis zu 24 Stunden.
Veröffentlicht wird nur, was die Prüfung besteht.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from auswahl import laden as fakten_alle, waehlen  # noqa: E402
from belegt.erzeugung import Auftrag, Erzeuger  # noqa: E402
from taktland import (FACTS, PROFILES, SCHEMA, fakten_laden,  # noqa: E402
                      pruefe, umfang_erwartet)

def ch(n):
    """12345 -> 12'345, ohne den umgebenden Text anzutasten."""
    return f"{int(n):,}".replace(",", "'")


SYSTEM = """Du schreibst Lernprofile für Schweizer Bahnhöfe.

Die oberste Regel: Du erfindest nichts. Jede Zahl und jede Aussage stammt aus
der Faktendatei, die dir mitgegeben wird, und trägt einen factRef, der darauf
zeigt. Was dort nicht steht, existiert für dich nicht - auch wenn du es weisst.

Keine Deutungen, keine Vergleiche mit anderen Bahnhöfen, kein Geografie- oder
Geschichtswissen. Allgemeines Fachwissen gehört ins Feld erlaeuterung und darf
den Bahnhof nicht nennen.

Du antwortest ausschliesslich mit dem JSON-Dokument, ohne Text davor oder danach.

Das Regelwerk im Wortlaut:

""" + SCHEMA.read_text(encoding="utf-8")


#: Preise je Million Token (Eingabe, Ausgabe), Stand 2026-06
PREISE = {"claude-opus-5": (5.0, 25.0), "claude-sonnet-5": (2.0, 10.0)}

#: Gemessen an Arbon, dem ersten erzeugten Profil: 22'577 Eingabe- und
#: 18'127 Ausgabe-Token über zwei Runden. Die Ausgabe ist weit höher als die
#: reine Textlänge, weil Opus vor dem Schreiben denkt und diese Token
#: mitzählen. Ein Aufwand unter "high" senkt das deutlich.
GEMESSEN_EIN = 22_600
GEMESSEN_AUS = 18_100
AUFWAND_FAKTOR = {"low": 0.45, "medium": 0.7, "high": 1.0, "xhigh": 1.5, "max": 2.2}


def kosten_schaetzen(auftraege, stapel=False, modell="claude-opus-5", aufwand="high"):
    """Was ein Lauf ungefähr kostet, gerechnet mit gemessenen Werten.

    Die frühere Schätzung ging von der Textlänge aus und lag um das Fünffache
    daneben, weil die Denk-Token fehlten.
    """
    ein_preis, aus_preis = PREISE.get(modell, PREISE["claude-opus-5"])
    f = AUFWAND_FAKTOR.get(aufwand, 1.0)
    n = len(auftraege)
    preis = (n * GEMESSEN_EIN / 1e6 * ein_preis
             + n * GEMESSEN_AUS * f / 1e6 * aus_preis)
    return preis / 2 if stapel else preis


def auftrag_bauen(fakten):
    """Baut den Auftrag für einen Bahnhof."""
    min_k, max_k, min_f, max_f = umfang_erwartet(fakten)
    schlank = {k: v for k, v in fakten.items() if k != "luecken"}
    anfrage = f"""Schreibe das Profil für diesen Bahnhof.

Umfang nach Datenlage: {min_k} bis {max_k} Kapitel, {min_f} bis {max_f} Fragen.
Nutze möglichst verschiedene Fragetypen, nicht nur single_choice.
Die Felder luecken und gleise lässt du weg, die trägt die Pipeline selbst ein.

Verfügbare Kapitel: {', '.join(fakten['verfuegbare_kapitel'])}

Die Fakten:

```json
{json.dumps(schlank, ensure_ascii=False, indent=2)}
```"""
    return Auftrag(kennung=str(fakten["uic"]), system=SYSTEM, anfrage=anfrage,
                   mitgabe={"uic": fakten["uic"]})


def pruefer(dokument, mitgabe):
    """Die Prüffunktion, die der Erzeuger nach jeder Runde aufruft."""
    fakten = fakten_laden(mitgabe["uic"])
    bericht, _ = pruefe(dokument, fakten, fix=True)
    return bericht


def speichern(dokument, uic):
    fakten = fakten_laden(uic)
    bericht, dokument = pruefe(dokument, fakten, fix=True)
    if not bericht.ok:
        return bericht
    ziel = PROFILES / f"{uic}.{dokument.get('lang', 'de')}.json"
    ziel.write_text(json.dumps(dokument, ensure_ascii=False, indent=2), encoding="utf-8")
    return bericht


def offene_uics():
    fertig = {json.loads(f.read_text(encoding="utf-8"))["uic"] for f in PROFILES.glob("*.json")}
    return [d["uic"] for d in fakten_alle() if d["uic"] not in fertig]


def main():
    args = sys.argv[1:]
    probelauf = "--probelauf" in args
    stapel = "--stapel" in args

    if "--auswahl" in args:
        n = int(args[args.index("--auswahl") + 1])
        uics = [d["uic"] for d, _ in waehlen(n)[0]]
    elif "--alle" in args:
        uics = offene_uics()
    else:
        uics = [int(a) for a in args if a.isdigit()]
    if not uics:
        print(__doc__)
        return 1

    auftraege = [auftrag_bauen(fakten_laden(u)) for u in uics]
    print(f"{len(auftraege)} Bahnhöfe: "
          + ", ".join(fakten_laden(u)["name"] for u in uics[:6])
          + (" …" if len(uics) > 6 else ""))

    if probelauf:
        a = auftraege[0]
        print(f"\n--- Systemauftrag ({len(a.system)} Zeichen) ---\n{a.system[:600]} …")
        print(f"\n--- Anfrage für {a.kennung} ({len(a.anfrage)} Zeichen) ---\n{a.anfrage[:900]} …")
        zeichen = sum(len(a.system) + len(a.anfrage) for a in auftraege)
        marken = zeichen // 4
        # Opus 5: 5 $ je Million Eingabe, 25 $ je Million Ausgabe
        aus = sum(umfang_erwartet(fakten_laden(int(a.kennung)))[3] for a in auftraege) * 120
        preis = marken / 1e6 * 5 + aus / 1e6 * 25
        print(f"\nEingabe rund {ch(marken)} Token, Ausgabe geschätzt {ch(aus)} Token")
        print(f"Grobe Kosten: ${preis:.2f} einzeln, ${preis / 2:.2f} im Stapel "
              f"(ohne Korrekturrunden)")
        return 0

    # Kostenbremse: Ohne Rückfrage wird nie mehr als dieser Betrag ausgegeben.
    limit = float(args[args.index("--limit") + 1]) if "--limit" in args else 2.00
    modell = args[args.index("--modell") + 1] if "--modell" in args else "claude-opus-5"
    aufwand = args[args.index("--aufwand") + 1] if "--aufwand" in args else "high"
    geschaetzt = kosten_schaetzen(auftraege, stapel, modell, aufwand)
    print(f"Modell {modell}, Aufwand {aufwand}"
          + (", im Stapel" if stapel else "")
          + f" - geschätzt ${geschaetzt:.2f} "
            f"(${geschaetzt / max(len(auftraege), 1):.2f} je Bahnhof)")
    if geschaetzt > limit:
        print(f"\nDas liegt über der eingebauten Grenze von ${limit:.2f}.")
        try:
            antwort = input("Wirklich starten? Tippe JA und Enter: ").strip()
        except EOFError:
            antwort = ""
        if antwort != "JA":
            print("Abgebrochen. Es wurde nichts ausgegeben.")
            return 1

    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        print("\nEs ist kein Schlüssel hinterlegt. Der Generator ruft die Claude-API auf\n"
              "und braucht dafür einen API-Schlüssel von console.anthropic.com:\n\n"
              "    export ANTHROPIC_API_KEY=sk-ant-...\n\n"
              "Das ist ein anderes Konto als das Claude-Abo und wird pro Nutzung\n"
              "abgerechnet. Mit --probelauf siehst du vorher, was ein Lauf kosten würde.")
        return 1

    erzeuger = Erzeuger(modell=modell, effort=aufwand)

    if stapel:
        sid = erzeuger.stapel_starten(auftraege)
        print(f"Stapel gestartet: {sid}")
        erzeuger.stapel_abwarten(sid)
        ergebnisse = erzeuger.stapel_ergebnisse(
            sid, pruefer, {a.kennung: a.mitgabe for a in auftraege})
    else:
        ergebnisse = {}
        ausgegeben = 0.0
        for i, a in enumerate(auftraege, 1):
            if ausgegeben > limit:
                print(f"\nGrenze von ${limit:.2f} erreicht (${ausgegeben:.2f} ausgegeben). "
                      f"{len(auftraege) - i + 1} Bahnhöfe nicht bearbeitet.")
                break
            name = fakten_laden(int(a.kennung))["name"]
            print(f"[{i}/{len(auftraege)}] {name} …", end=" ", flush=True)
            e = erzeuger.erzeuge(a, pruefer)
            ergebnisse[a.kennung] = e
            ep, ap = PREISE.get(modell, PREISE["claude-opus-5"])
            ausgegeben += (e.kosten.get("eingabe", 0) / 1e6 * ep
                           + e.kosten.get("ausgabe", 0) / 1e6 * ap)
            print("ok" if e.ok else f"gescheitert ({e.fehlermeldung or 'Prüfung'})",
                  f"nach {e.runden} Runde(n)", f"[${ausgegeben:.2f} bisher]")

    gut = 0
    kosten = {"eingabe": 0, "ausgabe": 0}
    for kennung, e in ergebnisse.items():
        for s in kosten:
            kosten[s] += e.kosten.get(s, 0)
        if e.ok:
            bericht = speichern(e.dokument, int(kennung))
            if bericht.ok:
                gut += 1
                continue
        name = fakten_laden(int(kennung))["name"]
        print(f"\n✗ {name} ({kennung}): {e.fehlermeldung or ''}")
        if e.bericht:
            for zeile in e.bericht.zeilen()[:6]:
                print(zeile)

    ep, ap = PREISE.get(modell, PREISE["claude-opus-5"])
    preis = kosten["eingabe"] / 1e6 * ep + kosten["ausgabe"] / 1e6 * ap
    if stapel:
        preis /= 2
    print(f"\n{gut} von {len(ergebnisse)} Profile geschrieben. "
          f"{ch(kosten['eingabe'])} Eingabe- und {ch(kosten['ausgabe'])} Ausgabe-Token, "
          f"rund ${preis:.2f}")
    print("Danach: python pipeline/export_app.py, dann committen.")
    return 0 if gut == len(ergebnisse) else 1


if __name__ == "__main__":
    sys.exit(main())
