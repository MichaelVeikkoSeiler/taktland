#!/usr/bin/env python3
"""Schlaegt falsche Antworten vor, die keinen echten Faktenwert treffen.

Ein Distraktor, der anderswo in der Faktendatei vorkommt, ist unfair: er ist
irgendwo richtig. Dieses Skript nennt Zahlen in plausibler Naehe, die frei sind.

    python generator/distraktoren.py 8503000 49
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import alle_zahlen  # noqa: E402

FACTS = Path(__file__).resolve().parent.parent / "data" / "facts"


def vorschlaege(uic, wert, anzahl=3, auffuellen=True):
    """Gibt (liste, alle_frei) zurueck.

    alle_frei ist False, wenn nicht genug unbelegte Zahlen zu finden waren und
    aufgefuellt werden musste. Bei kleinen Werten ist das der Normalfall, weil
    fast jede kleine Zahl irgendwo in den Fakten steht, etwa als Gleisnummer.
    Die Frage muss dann optionen_aus_fakten setzen.
    """
    facts = json.loads((FACTS / f"{uic}.json").read_text(encoding="utf-8"))
    belegt = alle_zahlen(facts)
    frei, ersatz = [], []
    for faktor in (0.4, 0.55, 0.7, 0.85, 1.2, 1.4, 1.7, 2.2, 3.0):
        kandidat = wert * faktor
        stelle = 10 ** max(0, len(str(int(abs(kandidat)))) - 2)
        kandidat = round(kandidat / stelle) * stelle
        if not kandidat or kandidat == wert:
            continue
        ziel = frei if kandidat not in belegt else ersatz
        if kandidat not in frei and kandidat not in ersatz:
            ziel.append(kandidat)
    alle_frei = len(frei) >= anzahl
    liste = frei[:anzahl]
    if auffuellen and not alle_frei:
        liste = (frei + ersatz)[:anzahl]
    return [int(f) if float(f).is_integer() else f for f in liste], alle_frei


if __name__ == "__main__":
    uic, wert = sys.argv[1], float(sys.argv[2])
    liste, frei = vorschlaege(uic, wert, 3)
    print(f"{wert}: {liste}" + ("" if frei else "   (nicht alle frei, optionen_aus_fakten setzen)"))
