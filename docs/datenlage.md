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
Entscheidend ist die ISB im neuesten Jahr.

Dazu kommen alle Bahnhöfe der BLS (`ALLE_BAHNHOEFE_VON`) und Bahnhöfe anderer Bahnen,
wenn die Daten für mindestens drei Kapitel reichen (`ANDERE_AB_KAPITEL` in
`pipeline/sources.py`, angewandt in `build_facts.py --all`): Stand 2026-09-22 sind es 406,
nämlich BLS 116, RhB 100, MGB 39, ZB 36, MOB 36, SOB 34, MVR 31, TRAVYS 9, OeBB
(Oensingen-Balsthal-Bahn) 3, TPF 1 und BOB 1, zusammen **1175**. Drei Bahnhöfe mit nur
zwei Kapiteln bleiben weg, etwa Tirano ohne Stammdaten. Die meisten haben drei Kapitel
(Steckbrief, Stammdaten, Services); Zugzahlen gibt es nur für SOB, TRAVYS und BLS, Gleise
und Hindernisfreiheit für einen Teil der ZB und BLS. Die App kennzeichnet sie mit dem
Kürzel der Bahn (`isb` im Index). Fünf davon (Köniz,
Müntschemier, Ins, Spiez, Thun) kamen vorher auf ausdrücklichen Wunsch und stehen weiter
unter `ZUSAETZLICH`. Thun führt `passagierfrequenz` von 2018 bis 2024 mit ISB SBB, 2025
mit BLS; es ist der einzige Bahnhof mit einem solchen Wechsel. Den Bahnhöfen anderer
Bahnen fehlen Perrons und Linien, die Datensätze dazu decken nur die SBB-Infrastruktur ab.
Thun hat als einziger einen Bahnhofplan, Tagesrhythmus und Ausstattung (9 Kapitel), die
übrigen haben 6. Die Betreiberin in den Stammdaten ist bei ihnen «BLS AG (…)»,
«Schweizerische Südostbahn (sob)» und so weiter, nicht die SBB.

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

- `linie` – 433 Linien mit Name, Anfangs- und Endpunkt und Kilometrierung von–bis.
  Die Differenz ist **nicht** als Länge belegt: Linie 210 beginnt bei km 19.115,
  Linie 220 bei km -0.4. Neu geladen 2026-09-22: dazu kam nur Linie 135 (St-Triphon
  Raffinerie), sonst kein Wert geändert. `linie` gehört zur Stufe `linien` von
  `pipeline/sources.py`, nicht zu den Bahnhöfen: Die Bahnhofseiten lesen sie nicht, ein
  Neuladen verschiebt ihren Datenstand darum nicht. Der Datenstand einer Linienseite ist
  der neueste ihrer Quellen; die Übersichten «Tunnel» und «Brücken» und das Tunnel-Duell
  nennen den Tag, an dem ihre eigene Quelle geladen wurde (`abgerufen` in
  `data/linien_uebersicht.json`).
- `linie-mit-betriebspunkten` – welcher Betriebspunkt bei welchem Kilometer auf welcher Linie liegt.
- `tunnel` – 289 Tunnel, vollständig mit Länge, Jahr der ersten Inbetriebnahme,
  Tunnelsystem (Röhren und Spuren), Linie und Kilometer. Neun haben eine Bemerkung zur
  Länge oder zum Umfang («Länge der Oströhre», «4947m gehört Frankreich»). Das Feld
  Kanton steht wie in der Quelle in den Fakten und dient im Duell der Auswahl nach
  Kanton. Sechs Einträge sind kein Kanton (5× «St.AuslandGallen», 1× «Bourgogne-Franche-
  Comté»); diese Tunnel spielen nur in der ganzen Schweiz mit. Stichprobe 2026-09-22: Bei
  238 von 256 Tunneln auf Linien mit Bahnhof nennt die Quelle denselben Kanton wie beim
  nächstgelegenen Bahnhof der Linie, die 18 übrigen liegen nahe einer Kantonsgrenze
  (Oelbergtunnel SZ bei Sisikon UR, Kalkofentunnel SZ bei Walchwil ZG).
- `brucken` – 4057 Brücken mit Name, Linie, Kilometer, Kanton und Zahl der Baueinheiten,
  ohne Länge und Baujahr. 3898 davon liegen auf den 111 Linien mit Seite, 159 auf 57
  Linien ohne eigene Seite (weniger als zwei Bahnhöfe in Taktland, kein Tunnel). Diese
  159 schreibt `pipeline/build_linien.py` nach `data/linien_uebersicht.json`; in der App
  stehen sie in der Übersicht «Brücken», mit Linie, aber ohne Verweis. Linie 9599 fehlt
  in `linie`, ihr Name ist darum nicht erfasst. Die Namen tragen unerklärte Abkürzungen
  (PI, PU, WU, Du, SU …). Die Beschreibung nennt als letzte Aktualisierung auf Deutsch
  «Januar 24», auf Englisch «Jan 2026».
- `bahnubergang` – 1064 Bahnübergänge, 1011 davon auf Linien mit Seite. Verwendet sind
  Name, Kilometer, Sicherungsart (das deutsche Feld `sicherungsart`, nicht das
  mehrsprachige `sicherungsart_text`) und die Zahl der gekreuzten Gleise. Nicht verwendet:
  Eigentum, Nutzung, Gleiskategorie und `andreaskreuz_ohne_signale`. Ihre Beschreibungen
  fehlen oder stammen aus anderen Datensätzen («Bezeichnung der Treppe/Rampe», «Art der
  Rückmeldung der effektiven Ankunftszeit»). Zweimal steht 0 gekreuzte Gleise, das gilt
  als nicht erfasst. Laut Beschreibung wöchentlich aktualisiert.

**Nicht in den offenen Daten:** die Länge einer Linie und ein Bau- oder Eröffnungsjahr der
Linie. Die Linienseiten führen das als Lücke. Ob eine Linie ein- oder mehrspurig ist, steht
nicht in den Daten der SBB, wohl aber im Schienennetz des BAV (nächster Abschnitt).

## Schienennetz des BAV: Linien anderer Bahnen und Kapitel «Netz»

Die Daten der SBB führen ihre eigenen Linien und nur Teile weniger anderer (920 der RhB):
408 der 1175 Bahnhöfe liegen dort auf keiner Linie, fast alle anderer Bahnen (Ins, Spiez,
die RhB). Das «Schienennetz» des
Bundesamts für Verkehr (`ch.bav.schienennetz`, data.geo.admin.ch, Lizenz Opendata BY:
freie Nutzung, Quellenangabe Pflicht) beschreibt die Linien aller Bahnen. Geladen mit
`pipeline/fetch_schienennetz.py` (INTERLIS-Datei, deutsch, 30.9 MB, nicht in Git), gelesen
mit `pipeline/schienennetz.py`.

- **Stand:** Die Datei trägt `ENDSTATE="2021-07-06"`, jedes Objekt «Stand 2021-07-06». Beim
  BAV geändert wurde die Datei am 15.9.2025, der Inhalt ist von 2021. Die App nennt 2021.
- **Inhalt:** 460 Linien (KmLinie: Datenherr, Nummer, Name), 3210 Knoten (Betriebspunkt mit
  Nummer wie die UIC der Bahnhöfe, Name, Abkürzung, Lage in LV95), 3424 Segmente (km Anfang
  und Ende, Infrastrukturbetreiberin, Streckengleise, Spurweite, Elektrifizierung,
  Linienzug). Jede Nummer kommt nur einmal vor, auch über die Bahnen hinweg. 1169 der 1175
  Bahnhöfe sind Knoten.
- **Tramlinien** (VBZ, BVB, Bernmobil, TPG, BLT, Glattalbahn: 126 Linien) tragen Nummern mit
  Buchstaben («Z021», «T003») und berühren keinen Bahnhof aus Taktland. Sie sind
  ausgeschlossen, auch auf der Seite «Strecke».
- **Neue Linienseiten:** 44 Linien, die in den Daten der SBB fehlen, mit mindestens zwei
  Bahnhöfen aus Taktland: BLSN 13, SOB 8, RhB 7, MVR 4, zb 3, MGB 2, MOB 2, je eine
  cmBC, TPFH, OeBB, ETB, KWO. Das Kürzel ist der Datenherr, wie er in der Quelle steht.
  Anfang und Ende nennt das Schienennetz nicht: Die Seite nennt die Betriebspunkte mit dem
  kleinsten und dem grössten Kilometer. Tunnel, Brücken und Bahnübergänge führt nur die SBB.
  Im Linien-Duell treten diese Linien nicht an, ihre Zählungen stammen aus einer anderen
  Quelle.
- **Kapitel «Netz»** auf 150 Linien (allen, die das Schienennetz führt; es fehlen 235, 241,
  9210, 9250, 9660): je Abschnitt Streckengleise, Spurweite, Strom und
  Infrastrukturbetreiberin, gezählt in der Pipeline. Die Lücke «Ein- oder mehrspurig» fällt
  dort weg, dafür steht «Stand des Schienennetzes».
- **Weitere Bahnhöfe laut BAV** auf 6 Linien der SBB (220, 201, 290, 770, 853, 920):
  Bahnhöfe, die das Schienennetz auf der Linie führt, die SBB aber nicht (Ins auf 220, 22
  Bahnhöfe auf der RhB-Linie 920).
- **Kilometer:** 21 von 3884 Punkten liegen auf derselben Linie bei zwei Kilometern (Horw
  4.485 und 4.524); es gilt der kleinere.
- **Strecke:** Abschnitte anderer Bahnen erhalten die Linie des Schienennetzes, wenn dort
  genau eine Linie beide Enden führt: 201 von 261. Ins – Müntschemier liegt auf 220;
  Müntschemier – Kerzers nicht, weil die Linie 220 dort über «Kerzers BLS» führt, einen
  eigenen Betriebspunkt neben «Kerzers».
- **Karte:** Linien mit Seite, die die Kilometrierung der SBB nicht oder nur zum Teil kennt,
  zeichnet `build_karte.py` aus den Segmenten (254 Stücke). Deren Kilometer ist nur an den
  Enden erfasst und dazwischen nach dem Weg verteilt, nur für die Lage der Bahnhöfe auf der
  Karte. Umrechnung LV95 → WGS84 mit der Näherungsformel von swisstopo (etwa 1 m).

**Grauzone:** In `zugzahlen` ergibt Trassenkilometer geteilt durch Anzahl Züge bei 98 %
der Abschnitte immer denselben Wert, sehr wahrscheinlich die Länge des Abschnitts. Die
SBB beschreibt das nicht; verwendet wird es erst, wenn sie es bestätigt.

## Strecke zwischen zwei Bahnhöfen

Die Seite «Strecke» zählt Tunnel und Brücken entlang eines Wegs
(`pipeline/build_strecken.py`, geprüft mit `generator/strecken.py --validieren`).

- **Netz:** die Abschnitte der `zugzahlen` mit Personenzügen im neuesten Jahr (1558
  Abschnitte, 1413 Betriebspunkte). `linie-mit-betriebspunkten` allein taugt nicht: Es
  führt auch Projekte («Projekt Juradurchstich» 9501, Brüttenertunnel, Zimmerberg-
  Basistunnel 2, Durchgangsbahnhof Luzern) und nur 1067 der Betriebspunkte des Netzes.
- **Zuordnung:** Jeder Betriebspunkt wird auf `linienkilometrierung` projiziert (Punkte
  meist alle 100 m). Nennt `linie-mit-betriebspunkten` den Kilometer des Punkts, gilt
  dieser. Liegt auf einer Linie ein weiterer Betriebspunkt zwischen den Enden, führt der
  Abschnitt nicht über sie (Aespli – Löchligut: Neubaustrecke 400 durch den Grauholz-
  tunnel, nicht Linie 450 über Zollikofen). 11 Abschnitte liegen auf zwei Linien
  nacheinander (Olten – Rothrist). 1296 von 1297 SBB-Abschnitten sind zugeordnet.
- **Gegenprobe:** Lausanne – Brig, Luzern – Olten und Aarau – Lenzburg liegen ganz auf
  einer Linie; der Weg ergibt dieselben Tunnel und Brücken wie die Linie zwischen den
  beiden Bahnhöfen.
- **Tunnel:** Der Kilometer liegt an einem Portal, welchem, sagt die Quelle nicht. Passt
  die Länge nur in eine Richtung auf die Linie (Gotthard-Basistunnel), gilt der Bereich,
  sonst der Punkt. Die zwei Röhren des Gotthard-Basistunnels sind zwei Linien (594, 595),
  der Tunnel ist nur auf 594 erfasst.
- **Weg:** kürzeste Luftlinie, Abschnitte mit wenig Personenzügen teurer (beide
  Richtungen zusammen) und ein Zuschlag je Abschnitt, weil Fernzüge Strecken ohne Halt
  bevorzugen. Geprüft an 27 Strecken mit bekanntem Weg der Fernzüge: 26 stimmen (vorher
  20), etwa Basel – Zürich über Brugg und Zürich – Thalwil durch den Zimmerberg-
  Basistunnel. Winterthur – Chur führt weiter über Rapperswil; «Über» legt den Weg fest.
- **Grenzen:** kein Fahrplan, der Weg ist berechnet. 261 Abschnitte gehören anderen Bahnen (BLS, SOB, TPF …),
  dort gibt es keine Tunnel- und Brückendaten (Lötschberg). Fünf Bahnhöfe liegen nicht im
  Netz: Bure-Casernes, Grandgourt, Jestetten, Lottstetten, Mols.

**Fahrtmodus:** Auf der Seite «Strecke» legt `app/src/fahrt.ts` den Weg als Linienzug an
(Kilometrierung der Linien, auf Abschnitten anderer Bahnen gerade von Ende zu Ende) und
den GPS-Standort darauf. Tunnel werden an ihrem Kilometer gemeldet; die Ausfahrt kennt er
nur, wo die Richtung der Länge eindeutig ist (`tunnel_bereiche`). Die Zeit bis zum Objekt
ist Weg durch Tempo, eine Schätzung. Getestet mit vorgespieltem Standort (Einfahrt
Gotthard-Basistunnel, Standort 80 km neben der Strecke, Tunnel ohne GPS), nicht im Zug.

### Linien auf der Seite «Strecke»

Unter jedem gewählten Bahnhof stehen alle Linien aus seinen Fakten (`linien.items`, Quelle
`linie-mit-betriebspunkten`), im Index als `linien`. 408 der 1175 Bahnhöfe führt diese
Quelle auf keiner Linie, fast alle anderer Bahnen (BLS 116, RhB 100, MGB 39 …), dazu zwei
der SBB; die App sagt «in den Daten zu den Linien nicht erfasst», nicht «keine Linie».
Das Ergebnis nennt die Linien des Wegs aus den `teile` der Abschnitte. Bei 11 Abschnitten,
die auf zwei Linien liegen (Rothrist – Olten: 450, dann 500), nennen die Daten den Punkt
des Wechsels nicht; die App schreibt «Wechsel zwischen Rothrist und Olten». Die Namen
aller 433 Linien aus `linie` stehen in `linien.json` (`namen`).

## Kleine Karte bei Tunneln, Brücken und Linien

`pipeline/build_karte.py` vereinfacht die Kilometrierung aller 338 Linien auf 30 m
(Douglas-Peucker, 8407 Punkte, 125 KB) und schreibt für jeden Tunnel den Bereich auf der
Linie, gleich wie die Seite Strecke. Die App zeichnet daraus eine Karte: grau das Netz,
dunkel die Linie, rot die Tunnel. Bei 271 von 289 Tunneln gibt die Quelle nur den
Kilometer eines Portals, nicht die Richtung der Länge: Sie erscheinen als Punkt. Zur
Orientierung stehen zwölf grosse Bahnhöfe mit ihrer Lage aus den Fakten darin. Brücken
sind immer Punkte bei ihrem Kilometer, eine Länge ist nicht erfasst. Keine
Kartenbilder eines fremden Dienstes; die Zusage im Datenschutz bleibt gültig.

Auf jeder Linienseite steht dieselbe Karte, dazu weisse Punkte für die Bahnhöfe der Linie
in Taktland, gesetzt an ihrem Kilometer aus der Linienseite (`bahnhoefe.items[].km`).
Beschriftet sind nur der erste und der letzte. Der Kilometer ist der Standort auf der
Linie, keine Entfernung; der Punkt liegt darum dort, wo die Kilometrierung diesen Wert
hat.

## Seite «Standort»

`tunnel` und `brucken` führen je Eintrag `geopos`, `bahnubergang` führt `geoposition`:
Breite und Länge, bei allen 289 Tunneln, 4057 Brücken und 1064 Bahnübergängen gefüllt
(Abruf 2026-09-21). `pipeline/build_linien.py` schreibt sie, auf sechs Stellen gerundet
wie die Lage der Bahnhöfe, nach `data/standort.json`: je Eintrag Linie, Stelle in der
Liste seiner Linie, Name, Breite, Länge. Die Bahnübergänge auf Linien ohne eigene Seite
stehen dafür neu in `data/linien_uebersicht.json` (`bahnuebergaenge_ohne_seite_liste`).
`generator/tests/test_standort.py` prüft, dass jede Zeile zu ihrem Eintrag gehört und
keiner fehlt.

Was der Punkt eines Tunnels ist, beschreibt die Quelle nicht. Stichprobe 2026-09-22:
Bei 282 von 289 Tunneln liegt er höchstens 150 m neben der Linie. Beim Simplontunnel
liegt er beim Kilometer 148.4 der Linie 100, erfasst ist der Tunnel bei km 165.714. Bei
den Kehrtunneln am Gotthard (Pfaffensprung, Wattingen, Leggistein, Freggio, Prato,
Pianotondo, Travi) liegt er 200 bis 290 m neben der gezeichneten Linie. Die App zeigt
den Punkt, wie er in der Quelle steht, und sagt, dass ein Tunnel dabei ein einzelner
Punkt ist.

Die App rechnet auf dem Gerät nur den Abstand: Luftlinie vom Standort zum Punkt, bei den
Linien zur vereinfachten Linienführung aus `data/karte.json` (auf 30 m vereinfacht). Die
Linien sind alle der Kilometrierung, auch Linien anderer Bahnen, soweit sie dort stehen
(Linie 610 Brig - Andermatt - Disentis), und Projektlinien (Linie 9780 Bruttenertunnel
West); ihr Name stammt aus `linie`.
