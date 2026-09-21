#!/usr/bin/env python3
"""Schlaegt falsche Antworten vor, die keinen echten Faktenwert treffen.

Ein Distraktor, der anderswo in der Faktendatei vorkommt, ist unfair: er ist
irgendwo richtig. Dieses Skript nennt Zahlen in plausibler Naehe, die frei sind.

    python generator/distraktoren.py 8503000 49
"""
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from belegt.fakten import Faktenbasis  # noqa: E402

FACTS = Path(__file__).resolve().parent.parent / "data" / "facts"


def vorschlaege(uic, wert, anzahl=3, auffuellen=True):
    """Gibt (liste, alle_frei) zurueck.

    alle_frei ist False, wenn nicht genug unbelegte Zahlen zu finden waren und
    aufgefuellt werden musste. Bei kleinen Werten ist das der Normalfall, weil
    fast jede kleine Zahl irgendwo in den Fakten steht, etwa als Gleisnummer.
    Die Frage muss dann optionen_aus_fakten setzen.
    """
    fb = Faktenbasis.aus_datei(FACTS / f"{uic}.json")
    belegt = fb.zahlen

    def runden(x):
        stelle = 10 ** max(0, len(str(int(abs(x)))) - 2)
        return round(x / stelle) * stelle

    def kandidaten(faktoren):
        frei_, ersatz_ = [], []
        for faktor in faktoren:
            k = runden(wert * faktor)
            if not k or k == wert or k in frei_ or k in ersatz_:
                continue
            (frei_ if k not in belegt else ersatz_).append(k)
        return frei_, ersatz_

    # Frueher wurden zuerst die kleineren Werte probiert. Fanden sich genug,
    # war die richtige Antwort immer die groesste, und im Bestand war die
    # kleinste Option nur in 12 Prozent der Faelle richtig. Jetzt wird fest
    # je Wert bestimmt, wie viele Vorschlaege unter und wie viele ueber dem
    # richtigen Wert liegen - damit landet die Antwort auf jeder Position
    # etwa gleich oft, und ein zweiter Lauf macht dieselben Vorschlaege.
    unten_frei, unten_ersatz = kandidaten((0.85, 0.7, 0.55, 0.4, 0.3, 0.2))
    oben_frei, oben_ersatz = kandidaten((1.2, 1.4, 1.7, 2.2, 3.0, 4.0))
    streu = int(hashlib.md5(f"{uic}:{wert}".encode()).hexdigest(), 16)
    soll_unten = streu % (anzahl + 1)
    # reicht eine Seite nicht, gleicht die andere aus
    soll_unten = min(soll_unten, len(unten_frei))
    soll_oben = min(anzahl - soll_unten, len(oben_frei))
    soll_unten = min(anzahl - soll_oben, len(unten_frei))
    frei = unten_frei[:soll_unten] + oben_frei[:soll_oben]
    ersatz = [k for k in unten_frei + oben_frei if k not in frei] + unten_ersatz + oben_ersatz
    alle_frei = len(frei) >= anzahl
    liste = frei[:anzahl]
    if auffuellen and not alle_frei:
        liste = (frei + ersatz)[:anzahl]
    return [int(f) if float(f).is_integer() else f for f in liste], alle_frei


if __name__ == "__main__":
    uic, wert = sys.argv[1], float(sys.argv[2])
    liste, frei = vorschlaege(uic, wert, 3)
    print(f"{wert}: {liste}" + ("" if frei else "   (nicht alle frei, optionen_aus_fakten setzen)"))


def eindeutige_auswahl(items, feld, anzahl=3):
    """Wählt Elemente aus, deren Wert nur einmal vorkommt und die weit auseinanderliegen.

    Eine Sortieraufgabe mit zwei gleichen Werten ist nicht lösbar, und zwei Werte
    dicht beieinander sind Raten. Gibt eine Liste von (index, element) zurück,
    absteigend nach Wert.
    """
    haeufigkeit = {}
    for it in items:
        haeufigkeit[it.get(feld)] = haeufigkeit.get(it.get(feld), 0) + 1
    kandidaten = [(i, it) for i, it in enumerate(items)
                  if it.get(feld) is not None and haeufigkeit[it[feld]] == 1]
    if len(kandidaten) < anzahl:
        return []
    kandidaten.sort(key=lambda x: x[1][feld], reverse=True)
    # gleichmässig über die Spanne verteilen, damit die Abstände deutlich sind
    schritt = (len(kandidaten) - 1) / (anzahl - 1)
    gewaehlt = [kandidaten[round(i * schritt)] for i in range(anzahl)]
    return gewaehlt
