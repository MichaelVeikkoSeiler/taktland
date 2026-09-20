"""belegt - Texte aus Daten erzeugen, ohne dass etwas erfunden wird.

Der Gedanke: Fakten werden aus einer Quelle erzeugt, nicht geschrieben. Ein
Sprachmodell formuliert nur um diese Fakten herum. Jede Aussage traegt einen
Verweis auf den Fakt, aus dem sie stammt, und eine mechanische Pruefung stellt
fest, ob der Verweis haelt.

Dieses Paket kennt weder Bahnhoefe noch Kapitel noch Fragen. Es bringt die
Bausteine mit:

    Faktenbasis   Fakten laden, Pfade aufloesen, Werte vergleichen
    Regelwerk     Wortlisten fuer Vermutungen, Verallgemeinerungen, Schreibweise
    Bericht       Fehler und Warnungen sammeln
    Erzeuger      die Schleife aus Anfrage, Pruefung und Korrekturrunde

Was ein Dokument ist, welche Abschnitte es hat und welche Felder Pflicht sind,
legt das jeweilige Projekt fest.
"""
from belegt.bericht import Bericht
from belegt.fakten import Faktenbasis
from belegt.regeln import Regelwerk

__all__ = ["Bericht", "Faktenbasis", "Regelwerk"]
