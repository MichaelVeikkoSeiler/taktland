# belegt

Texte aus Daten erzeugen, ohne dass etwas erfunden wird.

Der Gedanke: Fakten werden aus einer Quelle **erzeugt**, nicht geschrieben. Ein
Sprachmodell formuliert nur um diese Fakten herum. Jede Aussage trägt einen
Verweis auf den Fakt, aus dem sie stammt, und eine mechanische Prüfung stellt
fest, ob der Verweis hält.

Dieses Paket kennt weder Bahnhöfe noch Kapitel noch Fragen. Es bringt die
Bausteine mit; was ein Dokument ist, legt das jeweilige Projekt fest.

## Bausteine

| Baustein | Aufgabe |
|---|---|
| `Faktenbasis` | Fakten laden, Pfade wie `gleise.items[0].laenge_m` auflösen, Werte vergleichen, alle Zahlen kennen |
| `Regelwerk` | Wortlisten für Vermutungen, Verallgemeinerungen und Vergleiche; prüft Texte auf unbelegte Zahlen |
| `Bericht` | sammelt Fehler und Warnungen; Fehler verhindern die Veröffentlichung |
| `Erzeuger` | die Schleife aus Anfrage, Prüfung und Korrekturrunde, einzeln oder als Stapel |

## Ein Beispiel

```python
from belegt import Faktenbasis, Regelwerk, Bericht

fakten = Faktenbasis.aus_datei("data/facts/8503000.json")
fakten.aufloesen("steckbrief.dwv")        # 480900
fakten.passt("55 cm", 55)                 # True, Einheit stört nicht
fakten.belegt(4711)                       # False, steht nirgends

regeln = Regelwerk()
bericht = Bericht("Probe")
regeln.pruefe_text("Der Bahnhof gilt als Knoten und hat 4711 Gleise.",
                   "test", fakten, bericht)
bericht.ok        # False
bericht.fehler    # unbelegte Zahl 4711, Deutung «gilt als»
```

## Was ein Projekt selbst festlegt

1. **Die Faktenquelle** — wie aus Rohdaten geprüfte Fakten werden
2. **Die Dokumentstruktur** — welche Abschnitte, welche Pflichtfelder
3. **Die Prüffunktion** — was über die Textregeln hinaus gelten soll
4. **Den Auftrag** an das Modell

Wie das aussieht, zeigt `generator/taktland.py` im selben Repository:
gut 300 Zeilen für Kapitel, Fragetypen und Umfangsregeln, auf diesem Unterbau.

## Erzeugen

```python
from belegt.erzeugung import Auftrag, Erzeuger

erzeuger = Erzeuger(modell="claude-opus-5")
ergebnis = erzeuger.erzeuge(
    Auftrag(kennung="8503000", system=regelwerk_text, anfrage=fakten_als_json),
    pruefen=meine_prueffunktion,
)
ergebnis.ok        # hat die Prüfung bestanden
ergebnis.runden    # wie oft nachgebessert werden musste
```

Scheitert die Prüfung, bekommt das Modell die Fehlerliste und bessert nach,
bis zu dreimal. Was danach nicht besteht, wird nicht veröffentlicht.

Für grössere Mengen gibt es `stapel_starten`, `stapel_abwarten` und
`stapel_ergebnisse`: die Batch-API kostet die Hälfte und braucht bis zu
24 Stunden.

## Grenzen

Die Prüfung fängt, was sich mechanisch fassen lässt: nicht auflösbare Verweise,
falsche Werte, unbelegte Zahlen, gesperrte Wendungen. Sie fängt **nicht** jede
Deutung. «Liegt am oberen Zürichsee» ist sachlich richtig, steht aber in keiner
Faktendatei — so etwas findet nur ein Mensch beim Lesen. Deshalb gehört zu
jedem grösseren Lauf eine Stichprobe.
