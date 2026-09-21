# Datenlage – geprüft am 19.09.2026

Ergebnis der Erkundung von data.sbb.ch (60 Datasets im Katalog).
Alle Zahlen stammen aus `pipeline/explore.py` und `pipeline/coverage.py`.

## Korrekturen am ursprünglichen Briefing

| Annahme im Briefing | Befund |
|---|---|
| `equipement` = Ausstattung hindernisfreies Reisen | **Existiert nicht.** Ersatz: `21197_behig-haltekantesegment` (BehiG-Konformität pro Segment) und `haltestelle-visuell-taktile-sicherheitslinie` |
| Abfahrtsplakate: ID noch ermitteln | **`abfahrtsplakate0`**, 768 Records, 99 % der SBB-Bahnhöfe |
| `haltestelle-haltekante` liefert Haltekanten | **Nein.** Alle gleisbezogenen Spalten (designation, length, boardingareaheight, compassdirection) sind zu 100 % leer. Das Dataset ist ein Dienststellen-Verzeichnis und liefert Höhe ü. M., Gemeinde, Betreiber, Verkehrsmittel |
| `anzahl-sbb-bahnhofbenutzer` deckt ~700 Bahnhöfe ab | **Nein, nur 28 Bahnhöfe.** Die 728 Records sind 28 Bahnhöfe × 13 Jahre |
| Olten ist Stufe M | Olten hat einen Bahnhofplan und 86 700 DWV (oberstes Prozent). Nach der Tier-Regel ist Olten **L** |
| opentransportdata.swiss für Stammdaten nötig | Vorerst nicht. Stammdaten liegen bei data.sbb.ch. GTFS bleibt offen für das Kapitel Verbindungen |

## Grundgesamtheit

`passagierfrequenz` kennt 1178 Bahnhöfe, davon **769 mit ISB = SBB** (759 mit Daten aus 2025).
Die übrigen gehören BLS (113), RhB (102), MGB (39), ZB (36), SOB (33) und weiteren.

## Abdeckung, gemessen an den 769 SBB-Bahnhöfen

| Dataset | Abdeckung | Verwendbar für |
|---|---|---|
| `passagierfrequenz` | 100 % | Steckbrief, Frequenzverlauf seit 2018 |
| `perron` | 100 % | Perronlänge, -typ, niveaufreier Zugang |
| `abfahrtsplakate0` | 99 % | Abfahrtsplakat als PDF |
| `haltestelle-haltekante` | 99 % | Höhe ü. M., Gemeinde, Verkehrsmittel |
| `haltestelle-wartehallen` | 77 % | Wartehallen |
| `haltestelle-visuell-taktile-sicherheitslinie` | 76 % | Hindernisfreiheit |
| `21197_behig-haltekantesegment` | 82 % (629 von 769) | Gleisnummern, Perronhöhen, BehiG |
| `sektortafel` | 50 % | Sektoren pro Gleis |
| `wifistation` | 9 % | WLAN |
| `haltestelle-karte-trafimage` | 8 % (60 Bahnhöfe) | Bahnhofplan, Plan-Hotspots |
| `anzahl-sbb-bahnhofbenutzer-tagesverlauf` | **3 % (25 Bahnhöfe)** | Tagesrhythmus |

Das Kapitel **Tagesrhythmus ist damit ein Sonderfall für 25 grosse Bahnhöfe**, kein Standardkapitel
für Stufe M, wie im Briefing angenommen.

## Join-Schlüssel

Zielschlüssel ist durchgehend die 7-stellige UIC/DiDok-Nummer.

- `bpuic` – direkt verwendbar (perron, sektortafel, wifistation, plan, plakat, …)
- `uic` – wie bpuic, wird aber als Float geliefert (`passagierfrequenz`)
- `didok` – UIC ohne Länderpräfix: `3000` → `8503000`, also `uic = 8500000 + didok` (BehiG)
- `bps` – Betriebspunkt-Kürzel (`ZUE`, `SCHB`). Brücke über `linie-mit-betriebspunkten`:
  1357 Kürzel, **keines mehrdeutig**. Nötig für billetautomat, billetentwerter, haltestelle-uhr
- Name – nur `anzahl-sbb-bahnhofbenutzer` und `…-wochentag`. 26 von 28 Namen treffen direkt

## Wichtige Einschränkung für die Fragen

**Die offenen Daten kennen nicht alle Gleise eines Bahnhofs.**
Zürich HB erscheint mit den Gleisen 3–18. Die Tiefbahnhöfe Museumstrasse (21–24) und
Löwenstrasse (31–34) sowie die Kopfgleise 1–2 fehlen vollständig.

Eine Frage «Wie viele Gleise hat Zürich HB?» wäre mit diesen Daten falsch beantwortet.
Deshalb heissen die Felder in `facts/*.json` `anzahl_mit_daten` statt `anzahl` und tragen
einen `hinweis`. Der Storyboard-Agent darf daraus **keine Gesamtzahlen** bilden.

Ebenso vorsichtig zu behandeln:
- `zugzahlen` zählt Züge **pro Streckenabschnitt**, nicht Halte am Bahnhof.
  Je Abschnitt liegen zwei Zeilen vor (eine pro Richtung); die Pipeline fasst sie zusammen.
- `21197_behig-haltekantesegment` hat Stand **2023**, alle übrigen Kern-Datasets 2025/2026.

## Nicht verwendet

- `21196_behig-haltekantepunkt` – 496 783 Records, Punktgenauigkeit ohne Mehrwert fürs Lernen
- `dienststellen-gemass-opentransportdataswiss` – 60 111 Records aller Schweizer TU
- `jahresformation`, `ist-daten-sbb`, `rollmaterial` – nicht bahnhofsbezogen

## Linien und Tunnel (Linienseiten)

Im Katalog von data.sbb.ch (60 Datensätze, geprüft 2026-09-21) steht zu Strecken:

- `linie` – 432 Linien mit Name, Anfangs- und Endpunkt und Kilometrierung von–bis.
  Die Differenz ist **nicht** als Länge belegt: Linie 210 beginnt bei km 19.115,
  Linie 220 bei km -0.4.
- `linie-mit-betriebspunkten` – welcher Betriebspunkt bei welchem Kilometer auf welcher Linie liegt.
- `tunnel` – 289 Tunnel, vollständig mit Länge, Jahr der ersten Inbetriebnahme,
  Tunnelsystem (Röhren und Spuren), Linie und Kilometer. Neun haben eine Bemerkung zur
  Länge oder zum Umfang («Länge der Oströhre», «4947m gehört Frankreich»). Das Feld
  Kanton ist nicht verlässlich («St.AuslandGallen») und wird nicht verwendet.
- `brucken` (4057, ohne Länge und Baujahr), `bahnubergang` (1064, mit Sicherungsart und
  Zahl der gekreuzten Gleise) – noch nicht verwendet.

**Nicht in den offenen Daten:** die Länge einer Linie, ein Bau- oder Eröffnungsjahr der
Linie, ob sie ein- oder mehrspurig ist (nur das Tunnelsystem sagt es, und nur für den
Tunnel). Die Linienseiten führen das als Lücke.

**Grauzone:** In `zugzahlen` ergibt Trassenkilometer geteilt durch Anzahl Züge bei 98 %
der Abschnitte immer denselben Wert, sehr wahrscheinlich die Länge des Abschnitts. Die
SBB beschreibt das nicht; verwendet wird es erst, wenn sie es bestätigt.
