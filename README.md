# Taktland – Bahnhöfe entdecken

Eine Web-App, mit der man jeden Schweizer SBB-Bahnhof auswählen, erkunden und mit
Selbstkontrollfragen kennenlernen kann. Die Inhalte entstehen automatisch aus offenen
Daten – für 769 Bahnhöfe, in gleicher Form, je nach Datenlage unterschiedlich ausführlich.

**Taktland gibt nur weiter, was belegt ist.** Fehlt etwas, sagt die App es.
Die Regeln dazu stehen in [CLAUDE.md](CLAUDE.md), geprüft werden sie von
`generator/validate.py`.

## Stand

| Schritt | Status |
|---|---|
| Datenquellen geprüft und geladen (21 Datensätze) | fertig |
| Fakten für alle 769 SBB-Bahnhöfe | fertig |
| Profile mit Texten und Fragen | 4 Bahnhöfe (Zürich HB, Olten, Pfäffikon SZ, Schönbühl SBB) |
| App: Suche, Kapitel, Selbstkontrolle | fertig |
| Offline und Installation auf dem Startbild | eingebaut, **noch nicht auf einem Gerät geprüft** |
| Französisch und Italienisch | offen |

## Schnellstart

```bash
python3 -m venv .venv && .venv/bin/pip install pandas pillow anthropic
python3 pipeline/fetch.py                        # Datensätze von data.sbb.ch laden
.venv/bin/python pipeline/build_facts.py --all   # Fakten je Bahnhof erzeugen
.venv/bin/python generator/validate.py --alle    # Profile prüfen
.venv/bin/python pipeline/export_app.py          # Daten für die App bereitstellen
npm --prefix app run dev                         # App unter http://localhost:5173
```

## Profile erzeugen

```bash
python generator/erzeuge.py --auswahl 10 --probelauf   # zeigt Auftrag und Kosten
export ANTHROPIC_API_KEY=sk-ant-...                    # console.anthropic.com
python generator/erzeuge.py --auswahl 10               # erzeugen, einzeln
python generator/erzeuge.py --alle --stapel            # alle offenen, halber Preis
```

Der Generator erzeugt ein Profil, lässt es prüfen und gibt dem Modell bei
Fehlern die Liste zurück, bis zu dreimal. **Nur was die Prüfung besteht, wird
gespeichert.** Für alle 747 noch offenen Bahnhöfe rechnet der Probelauf mit
rund 55 Dollar einzeln oder 28 Dollar im Stapel.

## Aufbau

```
pipeline/     Rohdaten laden, prüfen, zu Fakten verdichten
  explore.py      Katalog und Schemas von data.sbb.ch ansehen
  fetch.py        21 Datensätze als CSV laden
  coverage.py     Abdeckung und Verknüpfbarkeit prüfen
  build_facts.py  data/facts/{uic}.json erzeugen
  export_app.py   Daten für die App bereitstellen
belegt/       wiederverwendbarer Unterbau: Faktenbasis, Regelwerk, Erzeuger
              kennt keine Bahnhöfe, siehe belegt/README.md
generator/    Profile schreiben und prüfen
  SCHEMA.md       Regeln für die Texte und Fragen
  taktland.py     die Bahnhofslogik auf dem Unterbau
  validate.py     mechanische Prüfung gegen die Fakten
  erzeuge.py      Profile mit Claude erzeugen, einzeln oder als Stapel
  auswahl.py      wählt Bahnhöfe nach Datenvielfalt aus
  distraktoren.py schlägt falsche Antworten vor, die keinen echten Wert treffen
app/          React, Vite, Tailwind
data/
  raw/        heruntergeladene CSV (nicht in Git)
  facts/      769 geprüfte Faktendateien
  profiles/   fertige Profile je Bahnhof und Sprache
docs/
  datenlage.md  was die offenen Daten hergeben und was nicht
```

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
erfundene Angaben. `validate.py` findet alle.

## Datenquelle

Alle Angaben stammen von [data.sbb.ch](https://data.sbb.ch). Die Lizenz verlangt eine
Quellenangabe, die in der App sichtbar ist. Taktland ist ein privates Lernprojekt und
kein Angebot der SBB.
