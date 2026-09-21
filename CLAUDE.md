# Taktland – Regeln für die Arbeit an diesem Projekt

## Die oberste Regel: nichts erfinden

Taktland gibt **ehrliche, belegbare Informationen**. Absolut nichts wird erfunden.
Fehlt etwas oder ist etwas unklar, steht ein entsprechender Hinweis dort.

Das gilt für jede Zahl, jeden Satz und jede Frage in der App. Es gilt auch dann,
wenn eine Aussage allgemein bekannt oder offensichtlich richtig ist.

### Was daraus folgt

1. **Jede Aussage über einen Bahnhof stammt aus `data/facts/{uic}.json`.**
   Diese Datei wird aus offenen Daten erzeugt, nicht geschrieben. Was dort nicht
   steht, darf nicht in die App — auch nicht als Nebensatz.

2. **Keine Deutungen.** Verboten sind Sätze wie «Olten ist ein Pendlerbahnhof»,
   «gilt als Knotenbahnhof», «stammt aus älteren Bauzuständen», «liegt am oberen
   Zürichsee», «damit haben lange Züge Platz». Das sind Schlüsse, keine Daten.

3. **Keine Vergleiche mit anderen Bahnhöfen**, solange die Vergleichszahl nicht in
   derselben Faktendatei steht. «Der grösste Bahnhof der Schweiz» ist nicht belegt,
   auch wenn es stimmt.

4. **Allgemeines Fachwissen** – was ein Sektor ist, warum 55 cm wichtig sind – ist
   erlaubt, aber nur im Feld `erlaeuterung` und ohne Bezug auf diesen Bahnhof.
   Die App kennzeichnet es sichtbar als Erläuterung, nicht als Bahnhofsangabe.

5. **Lücken werden benannt, nicht verschwiegen.** Jede Faktendatei führt `luecken`.
   Jedes Profil übernimmt sie unverändert, die App zeigt sie an.

6. **Eine 0 heisst «nicht erfasst», nicht «nicht vorhanden».** Deshalb heissen die
   Felder `wlan_erfasst`, `billettautomaten_erfasst`, `anzahl_mit_daten`.

7. **Eine fehlende Angabe ist keine Tatsache.** Das ist die häufigste Fehlerklasse
   im ganzen Projekt, und sie steckte mehrfach in den Feldnamen selbst: `km`
   klang nach Länge, `gleisquerung_noetig` nach einer Tatsache, eine leere
   Höhenliste las sich wie «keine 55 cm». Ein Feldname muss sagen, was gemessen
   wurde, nicht was man daraus schliessen könnte. Wo es drei Fälle gibt - ja,
   nein, keine Angabe -, bekommt jeder sein eigenes Feld.

8. **Keine gerechneten Grössen.** Weder Summen noch Verhältnisse, auch nicht in
   Worten («die Hälfte»). Steht eine Zahl nicht in den Fakten und wird sie
   gebraucht, gehört sie in die Pipeline, nicht in den Text.

9. **Keine Glücksfragen.** Was gefragt wird, muss man wissen können. Werte, die
   weniger als 5 % auseinanderliegen, werden nicht gegeneinander gefragt,
   weder beim Sortieren noch beim Zuordnen oder beim Hotspot. Gleichstand ist
   kein Vorsprung: Bei gleich vielen Zügen pro Tag ist kein Abschnitt «am
   stärksten befahren».

### Wie es geprüft wird

```bash
.venv/bin/python generator/validate.py --alle
```

Der Validator prüft mechanisch, ohne Sprachmodell: jeder `factRef` muss auflösbar
sein, jeder Wert muss stimmen, jede Zahl im Text muss aus den Fakten stammen, keine
Vermutungswörter, keine verschwiegene Lücke. Kein Profil geht ohne grünes Häkchen
in die App.

Die Regeln im Detail: `generator/SCHEMA.md`. Die Datenlage: `docs/datenlage.md`.

## Aufbau

```
pipeline/    Rohdaten laden und zu facts/{uic}.json verdichten (Python, pandas)
generator/   Profile schreiben und prüfen
app/         PWA (React, Vite, Tailwind)
data/raw/    heruntergeladene CSV, nicht in Git
data/facts/  geprüfte Fakten je Bahnhof, 769 SBB-Bahnhöfe
data/profiles/ lernbare Profile je Bahnhof und Sprache
```

## Befehle

```bash
python pipeline/fetch.py                    # Datasets laden
.venv/bin/python pipeline/build_facts.py --all   # Fakten für alle Bahnhöfe
.venv/bin/python generator/validate.py --alle    # Profile prüfen
python3 generator/offen.py 8                     # die nächsten Bahnhöfe ohne Profil
.venv/bin/python generator/sortieren_richten.py --alle   # knappe Sortierfragen zeigen
```

Neue Profile entstehen in Schüben von acht mit `generator/baukasten.py`. Jedes
wird mit `zeigen()` gelesen, bevor es gespeichert wird. Was dabei auffällt,
wird zur Prüfregel oder zum Abschnitt in `generator/SCHEMA.md`.

## Gestaltung

Die App folgt der öffentlichen Designdokumentation der SBB (digital.sbb.ch):
Rot `#eb0000` nur für Wichtiges, sonst Weiss, Milk `#f6f6f6`, Cloud `#e5e5e5`,
Metal `#767676`, Charcoal `#212121`. Keine Farbverläufe, kantige Flächen,
Helvetica als Ersatz für die nicht frei lizenzierte Hausschrift SBB Web.

**Kein Logo, keine Bildmarke der SBB.** Die Farb- und Formensprache ist übernommen,
die Marke nicht. In der Fusszeile steht, dass Taktland kein Angebot der SBB ist.

## Sprache

Deutsch, Schweizer Rechtschreibung: **ss statt ß**. Zahlen über 9999 mit Apostroph.
«Perron» statt Bahnsteig, «Billett» statt Fahrkarte.

## Quellenangabe

Die Daten stammen von data.sbb.ch. Die Lizenz verlangt eine Quellenangabe, die in
der App sichtbar sein muss. Kein SBB-Logo, kein Auftritt, der ein offizielles
SBB-Produkt suggeriert.
