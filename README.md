# Taktland – die Schweizer Bahn kennenlernen

Eine kostenlose Web-App (PWA) unter [taktland.ch](https://taktland.ch): Bahnhöfe, Strecken, Tunnel,
Brücken und Bahnübergänge der Schweiz kennenlernen, im Zug mitfahren und alles festhalten.
Die Inhalte entstehen aus offenen Daten, in gleicher Form für alle Bahnhöfe, je nach Datenlage
unterschiedlich ausführlich. Ohne Konto, ohne Werbung; der Fortschritt bleibt auf dem Gerät.

**Taktland gibt nur weiter, was belegt ist.** Fehlt etwas, sagt die App es.
Die Regeln dazu stehen in [CLAUDE.md](CLAUDE.md), geprüft werden sie mechanisch, ohne Sprachmodell,
von `generator/validate.py` und den weiteren Prüfern beim Veröffentlichen.

## Was die App kann

| Bereich | Inhalt |
|---|---|
| **Bahnland** | 1'189 Bahnhöfe mit Kapiteln und Selbstkontrollfragen, 156 Linienseiten, die Seite «Strecke» (Weg zwischen zwei Bahnhöfen mit Tunneln und Brücken), Übersichten zu Tunneln, Brücken und Bahnübergängen |
| **Fahren** | «Mitfahren» im Zug: per Standort meldet Taktland Tunnel, Brücken, Bahnhöfe und Bahnübergänge vorher mit einem Ton; Karte nah, ganzer Weg oder Gelände in 3D. «Probefahren» spielt einen Weg im Zeitraffer ab. «Fahrtblatt» zum Ausdrucken |
| **Spiele** | Modellbahn (Strecken als Modell im Gelände, auch mit VR-Brille), Geo, Duell, Bahnhofsuche; Geo und Bahnhofsuche auch auf mehreren Geräten |
| **Standort** | was in der Nähe liegt |
| **Reisetasche** | Logbuch der Fahrten, Sammelheft, Favoriten |

Ein Modell der Modellbahn ist ausdrücklich kein Abbild der Wirklichkeit (Zug und Gleise nicht
massstäblich, Zeitraffer); die App sagt das auf der Seite Modellbahn.

## Stand

| Schritt | Status |
|---|---|
| Fakten für alle Bahnhöfe (`data/facts`) | 1'189, aus offenen Daten erzeugt |
| Profile mit Texten und Fragen (`data/profiles`) | 1'189, Deutsch, alle geprüft |
| Linienseiten (`data/linienprofile`) | 156 |
| App mit Bahnland, Fahren, Spiele, Standort, Reisetasche | in Betrieb unter taktland.ch |
| Französisch und Italienisch | offen |

## Schnellstart

```bash
python3 -m venv .venv && .venv/bin/pip install pandas pillow anthropic
python3 pipeline/fetch.py                        # Datensätze laden
.venv/bin/python pipeline/build_facts.py --all   # Fakten je Bahnhof erzeugen
.venv/bin/python generator/bauen.py --alle       # Profile aus Fakten und Bauplan bauen
.venv/bin/python generator/validate.py --alle    # Profile prüfen
.venv/bin/python pipeline/export_app.py          # Daten für die App bereitstellen
npm --prefix app run dev                         # App unter http://localhost:5173
```

Die vollständige Liste der Befehle (Linien, Strecken, Karten, Gelände, Luftbild, Fahrplan) steht in
[CLAUDE.md](CLAUDE.md) unter «Befehle».

## Profile

Ein Profil ist ein Ergebnis, kein Werkstück: `generator/bauen.py` baut es aus der Faktendatei und
dem Eintrag in `data/bauplan.json`; von Hand wird es nie geändert. Neue Bahnhöfe kommen mit
`generator/bauplan.py` in den Bauplan. Das Vorgehen steht in [CLAUDE.md](CLAUDE.md), die Regeln für
Texte und Fragen in [generator/SCHEMA.md](generator/SCHEMA.md).

Der ältere Weg über ein Sprachmodell (`generator/erzeuge.py`) braucht einen Schlüssel von
console.anthropic.com. Den Schlüssel nie in eine Datei schreiben und nie in einem Screenshot zeigen:
Das Repository ist öffentlich.

## Aufbau

```
pipeline/     Rohdaten laden und zu Fakten, Netz, Karten, Gelände und Luftbild verdichten
belegt/       wiederverwendbarer Unterbau: Faktenbasis, Regelwerk, Erzeuger (siehe belegt/README.md)
generator/    Profile und Linienseiten bauen und prüfen; SCHEMA.md mit den Regeln
app/          die PWA (React, Vite, Tailwind, three.js für 3D)
web/          die Seite taktland.ch (reines HTML)
server/       Zähler und Spielräume auf cyon (von Hand hochgeladen)
data/         Fakten, Profile, Linien, Netz, Karten, Gelände, Luftbild (Rohdaten nicht in Git)
docs/         datenlage.md (was die Daten hergeben) und ideen-fahrtmodus.md (Merkliste)
```

Einzelheiten zu jeder Datei in `data/` stehen in [CLAUDE.md](CLAUDE.md) unter «Aufbau».

## Wie die Ehrlichkeit abgesichert ist

1. Die Fakten werden erzeugt, nicht geschrieben. Texte entstehen nur um diese Fakten herum.
2. Jeder Fakt und jede Frage trägt einen `factRef`, einen Pfad in die Faktendatei.
   `validate.py` löst ihn auf und vergleicht den Wert.
3. Jede Zahl in einem Text muss in den Fakten vorkommen, auch gerundet.
4. Deutungen sind gesperrt: *stammen aus, gilt als, dürfte, vermutlich, seit Jahren* …
5. Allgemeines Fachwissen steht getrennt im Feld `erlaeuterung` und darf den Bahnhof
   nicht nennen. Die App kennzeichnet es als allgemeine Erklärung.
6. Was fehlt, steht im Block `luecken` und erscheint in der App unter
   «Was diese Daten nicht sagen».

Ein Gegentest liegt bei: `generator/tests/halluzination.de.json` enthält zwölf
erfundene Angaben. `validate.py` findet alle. Beim Veröffentlichen (`.github/workflows/pages.yml`)
laufen die Tests, alle Prüfer und der Bau; schlägt etwas fehl, geht nichts online.

## Datenquellen

SBB Open Data ([data.sbb.ch](https://data.sbb.ch)), opentransportdata.swiss, Bundesamt für Verkehr BAV,
Bundesamt für Landestopografie swisstopo, Bundesamt für Statistik BFS, Bundesamt für
Bevölkerungsschutz BABS und Bundesamt für Umwelt BAFU. Was wofür stammt, steht in der App in der
Fusszeile unter «Alle Datenquellen und Lizenzen» und unter Info. Taktland ist ein privates
Projekt und kein Angebot einer Bahnunternehmung.
