# Merkliste Taktland

Seit 2026-09-26 heisst der Fahrtmodus in der App «Fahren» (Michael).

Aufgeräumt am 2026-09-25. Offen für Samstag, 2026-09-26: Netzzugang freigeben,
dann Seen, Sehenswürdigkeiten (Schritt 1) und BTI.

Vorgemerkt von Michael am 2026-09-23, noch nicht begonnen. Hintergrund: Eine
Recherche (rund 25 Suchen) fand kein Angebot, das für eine frei gewählte Strecke
im Schweizer Netz per GPS Tunnel, Brücken und Bahnhöfe mit Zeit und Ton vorher
meldet. Am nächsten kommt Soundscape für Android (Ansage beim Einfahren, ohne
Vorwarnung, ohne Längen, ohne Brücken). Ohne Gewähr: App-Stores und sbb.ch waren
bei der Recherche gesperrt.

## Stand und Entscheide

- **Einziger Nutzer ist Michael**, bis auf Weiteres. Ein Server für Nutzerdaten
  und Datenschutzfragen stehen darum nicht an.
- **Testfahrt 1 (2026-09-22), Bern – Zürich HB – Lugano:** hat gut geklappt.
  **Testfahrt 2:** die Rückfahrt am 2026-09-25. Ergänzungen davor sind willkommen.
- **Ton abschaltbar:** Das gibt es schon, als Häkchen «Ton bei der Meldung» in den
  Einstellungen des Fahrtmodus. Es bleibt so.
- **Bei Unsicherheit nachfragen:** Ist nicht klar, auf welcher Linie der Zug
  fährt, fragt Taktland nach («Welche Linie fährst du?»), statt zu raten. Gilt
  vor allem für «Ohne Ziel», wo Linien nebeneinander liegen (Limmattal, grosse
  Bahnhöfe).
- **Kein SBB-Gong, fix ausgeschlossen.** Eigene Klänge ja, kein Nachbau des Gongs.

- **Testfahrt 2:** 10 und 20 Sekunden haben sich bewährt.
- **Testfahrt 3 (2026-09-25), Lugano – Melide:** sehr gut, GPS auf etwa 10 m.
  Rückmeldung: Durchfahrenes verschwand aus Band und Karte, das Protokoll war
  schwer zu finden. Behoben: Band zeigt den ganzen Weg, Durchfahrenes bleibt
  stehen, seit 2026-09-25 in voller Farbe; die Fahrten stehen im Logbuch.

## Plan bis Samstag, 2026-09-26

Entschieden am 2026-09-23, Schritt für Schritt. Was «später» heisst, bleibt auf
der Merkliste unten.

**Einbauen:**
1. Spezialknopf «Fahrtmodus», direkt zur Auswahl der Fahrt
2. Wahl «Nur Ziel»: Man kann wählen, ob man nur das Ziel eingibt (Start ist
   dann der nächste Bahnhof per GPS) oder Start und Ziel wie bisher
3. Favoriten und letzte Fahrten
4. Streckenband
5. Ring um die Anzeige, bei «Gleich» gross
6. Im Tunnel «Ausfahrt in etwa …» mit Sekunden und einer Fläche, die sich füllt
7. Kleine Karte mit Position
8. Fahrtbilanz
9. Abgehakte Objekte
10. Sammelheft mit «Was fehlt noch?»: am Abend als Liste ansehen, und wieder
    löschen können (es ist erst ein Test)
11. Quiz zur Fahrt

**Stand 2026-09-24:** alle 11 Punkte eingebaut und in `main` (Paket A: 1–3,
Paket B: 4–7, Paket C: 8–11). Illustrationen und Piktos (Tunnel, Brücke, Bahnhof,
Auftaktbild der Seite «Fahrtmodus») folgen von Michael; bis dahin einfache
Zeichen und das Bild der Strecken.

**Später:** Verknüpfung auf dem App-Symbol, eigener Klang je Art,
Sprachansage, Vibration, Challenge, neues App-Symbol und Piktos (von Michael).

**Erledigt seit 2026-09-24** (alles in `main`):
- Reiter: Bahnland, Duell, Standort, Reisetasche (Logbuch, Sammelheft,
  Favoriten), Info mit der Demo; roter Knopf «Fahrtmodus» ohne Zug-Zeichen.
- Auftaktbilder von Michael für Fahrtmodus, Logbuch/Reisetasche, Info, Demo.
- Kacheln `#ebebeb`, abgerundete rote und gewählte Knöpfe (Anthracite).
- Favoritenbahnhöfe mit Stern in jeder Bahnhofsuche, alphabetisch, «+ Bahnhof
  hinzufügen»; im Fahrtmodus «Gemerkte Fahrten» statt Favoriten; letzte
  Fahrten, Sammelheft und Logbuch nur noch in der Reisetasche.
- Fahrtmodus: Tunnel schwarz, Brücken orange, Bahnhöfe blau (`#1d3f8a`), auch
  Ring und Fläche; Bahnhöfe als Punkte, Band kleiner, Durchfahrenes in voller
  Farbe; Meldungen innerhalb 40 s als Karten übereinander; abgerundet.
- Ton: weicher Zweiklang G4–D5 statt Piepen.
- Fahrtbilanz: Objekte zum Aufklappen mit den Angaben aus den Daten.
- Demo-Video (Probefahrt Lugano–Bellinzona) unter Info.

**«Ohne Ziel»:** am 2026-09-24 nochmals gefragt; Michael will warten. Nach der
Testfahrt am Samstag wieder ansprechen.

**Vorgehen (Michael, 2026-09-24):** Alles geht direkt nach `main`. Sichtbare
Änderungen zuerst als Screenshot an Michael; erst nach seinem OK pushen.

## Barrierefreiheit: Fahrtmodus für blinde und sehbehinderte Menschen

Idee von Michael, 2026-09-24. Das nächste Angebot dieser Art ist Soundscape für
Android (siehe oben): Es sagt Tunnel erst beim Einfahren an, ohne Vorwarnung.
Was es bräuchte:
- **Sprachansage** («In 20 Sekunden: Zimmerbergtunnel, 9385 Meter»), nur mit
  Angaben aus den Daten; steht schon unter «später»
- **Bildschirmleser** (VoiceOver, TalkBack): Meldungen als Live-Region, alle
  Knöpfe beschriftet, Ring und Streckenband mit Textalternative
  - *Eingebaut 2026-09-24:* jede Meldung als Satz für Bildschirmleser
    («In etwa 20 Sekunden: Tunnel Zimmerbergtunnel. 1’984 Meter, Linie 660»);
    die Statuszeile (GPS, Tempo) liest er nicht mehr laufend vor
- **Vibration**, wo das Gerät sie kann (Android)
- **Bedienung ohne Hinsehen:** grosse Flächen, wenige Schritte bis zum Start
  (Favoriten, «Nur Ziel»)
- **Testen mit Betroffenen**, etwa über einen Blinden- und Sehbehindertenverband,
  bevor etwas als barrierefrei gilt

### Ideen vom 2026-09-26 (Michael: «in die Merkliste aufnehmen»)

Noch nicht beschlossen. Vorgehen: zuerst mit Betroffenen reden (etwa über einen
Blinden- und Sehbehindertenverband), dann bauen. Am wenigsten Aufwand bei vermutlich
viel Nutzen: Sprachansage, «Wo bin ich?» und Aussteige-Erinnerung, alle auf dem Gerät,
ohne Server.

**Blinde und sehbehinderte Menschen**
- **Sprachansage ohne Bildschirmleser:** das Handy spricht selbst («In 20 Sekunden:
  Bahnhof Olten»), mit der Sprachausgabe des Browsers, auf dem Gerät.
- **Nächster Halt laut Fahrplan** ansagen, mit «Welcher Zug?» (Punkt 4, auf dem
  Branch): vermutlich der grösste Nutzen, weil Durchsagen im Zug ausfallen oder schwer
  verständlich sein können. Immer «laut Fahrplan», ohne Verspätungen. Auch ein Argument
  fürs Gespräch mit dem Vorgesetzten: Hilfe für Reisende, keine Konkurrenz zur SBB-App.
- **«Wo bin ich?»:** ein grosser Knopf, der auf Tipp sagt, zwischen welchen Bahnhöfen
  der Zug ist, was als Nächstes kommt und wie lange noch.
- **Aussteige-Erinnerung** vor dem Ziel, etwa zwei Minuten vorher, deutlicher als die
  übrigen Meldungen.
- **Eigener Klang je Art** (Tunnel, Brücke, Bahnhof), steht schon unter «später».
- **Vibrationsmuster je Art** auf Android; auf dem iPhone lässt der Browser keine
  Vibration zu.
- **Grosse Schrift und hoher Kontrast** als eigene Einstellung.

**Hörbehinderte Menschen**
- Ring, Farbe und «Gleich» wirken schon ohne Ton; dazu Vibration statt Ton.
- Nächster Halt als Text (mit Punkt 4), für alle, die Durchsagen nicht hören.

**Menschen mit eingeschränkter Mobilität**
- **Vorlauf vor dem Ziel wählbar** (etwa 2 oder 5 Minuten), um rechtzeitig aufzustehen.
- **Perronhöhen des Zielbahnhofs** aus den Fakten zeigen, wo erfasst. Streng nach der
  Regel: fehlt eine Angabe, heisst das nicht «nicht vorhanden».
- Nicht in den Daten und darum nur als Lücke zu nennen: stufenfreier Einstieg,
  Ausstiegsseite, ob Lifte gehen.

**Menschen, die Orientierung oder Ruhe brauchen**
- **Einfache Ansicht:** nur das Wichtigste, gross («Noch 12 Minuten bis Bern»,
  mit Punkt 4 «Noch 3 Halte»), ohne Karte und Band.
- **Tunnel mit Ende ankündigen** («Ausfahrt in etwa 2 min») gibt es schon; ob das
  Menschen hilft, denen Tunnel unangenehm sind, müssten Betroffene sagen.
- **Ruhemodus:** nur Bahnhöfe oder nur das Ziel; geht heute schon über die Einstellungen.

## Für Familien

Ideen vom 2026-09-26 (Michael: «in die Merkliste»), noch nicht beschlossen. Heute
schon nützlich: Tunnel mit «Gleich» und «Ausfahrt in etwa …», Sehenswertes links und
rechts, Probefahrt zur Vorfreude, kein Konto, keine Werbung.

**Vorschlag zuerst** (wenig Aufwand, nur Daten, die Taktland schon hat): Reise-Bingo,
Tunnel-Schätzen, «Wie lange noch?».

**Spiele während der Fahrt**
- **Tunnel-Schätzen:** vor dem Tunnel schätzt jede Person die Sekunden, Taktland misst
  Einfahrt bis Ausfahrt auf dem Gerät. Nur bei Tunneln mit bekanntem Anfang und Ende.
- **Reise-Bingo:** vor der Fahrt eine Karte aus dem Weg (ein Tunnel, eine Brücke, ein
  See rechts, ein Gipfel links, ein Bahnhof), die Kinder haken ab. Alles aus den Daten.
- **Familienduell:** zwei bis vier Personen abwechselnd auf einem Handy, jede mit
  eigenem Punktestand.
- **Quiz zur Fahrt, leichtere Stufe:** weniger Zahlen, mehr «Welcher Tunnel kam zuerst?».

**Für Kinder gemacht**
- **Kinderansicht:** grosse Piktos (von Michael), kurze Sätze, ohne Karte, der Zug im Band.
- **«Wie lange noch?»** als grosse Anzeige; mit «Welcher Zug?» auch «noch 3 Halte laut
  Fahrplan».
- **Ein Sammelheft pro Kind** auf einem Familienhandy, Namen nur auf dem Gerät.
- **Abzeichen** aus Zählungen und Schwellen der Daten («erster Tunnel über 5 km»,
  «10 Brücken»); keine Summen wie «insgesamt 23 km Tunnel» (CLAUDE.md, Regel 8).

**Vor der Fahrt**
- **Fahrtblatt als PDF zum Ausdrucken** (Michael, 2026-09-26): vor der Fahrt eine Karte
  des Wegs (selbst gezeichnet wie die Karten in der App, mit Seen und Bahnhöfen) und
  Sachen zum Ausfüllen während der Fahrt, etwa die Tunnel, Brücken und Bahnhöfe des
  Wegs in Fahrtrichtung zum Abhaken, Felder «Wie lange hat der Tunnel gedauert?»,
  Sehenswertes links und rechts zum Ankreuzen, Platz für eine Zeichnung. Alles aus den
  Daten des Wegs, auf dem Gerät erzeugt, ohne Server. Passt zu Reise-Bingo und
  Tunnel-Schätzen; auch ohne Handy im Zug nutzbar.
  *Umgesetzt:* eigener Abschnitt «Fahrtblatt» unter «Fahren», nur dort. Obere Hälfte
  des Blatts die Karte mit Nordpfeil und Legende, bei dicht liegenden Nummern bis zwei
  vergrösserte Ausschnitte (A, B); untere Hälfte zum Ausfüllen.

**Erinnerungen**
- **Reisetagebuch zum Ausdrucken:** eine Seite pro Fahrt, Datum, Weg, Durchfahrenes,
  Platz für eine Zeichnung, auf dem Gerät erzeugt.

**Worauf achten**
- Auch für Kinder nichts erfinden: kein Maskottchen mit ausgedachten «Wusstest du …?».
  Kindgerecht heisst einfacher sagen, nicht mehr behaupten.
- Keine Daten über Kinder, kein Konto.
- Ton: für Familien lauter, für Mitreisende leise; Hinweis auf Kopfhörer.
- Französisch und Italienisch wären für Familien in der Romandie und im Tessin
  Voraussetzung; «Fahren» gibt es heute nur auf Deutsch.

## Messbarkeit: Wie wird Taktland genutzt?

Idee von Michael, 2026-09-24: Die Wirkung sollte bis zu einem gewissen Grad
messbar sein. Heute misst Taktland nichts, und das Versprechen lautet: kein
Konto, keine Auswertung, der Standort bleibt auf dem Gerät. Darum in Stufen:
1. **Eigenes Protokoll auf dem Gerät:** Das Sammelheft ist es schon (Fahrten,
   Datum, Objekte). Dazu ein Export als Datei, den man freiwillig weitergeben kann.
2. **Pilot mit Freiwilligen:** Testpersonen schicken ihren Export, etwa nach
   einem Monat. Keine Technik nötig, volle Kontrolle bei den Nutzern.
3. **Zählung ohne Personenbezug, nur mit Einwilligung:** etwa «Fahrtmodus
   gestartet», «Fahrt beendet», ohne Standort, ohne Kennung. Braucht einen
   Server, eine Datenschutzerklärung und eine Änderung des Versprechens in der
   App. Erst nach Klärung mit der SBB.
Was sich so messen lässt: wie oft und wie lange der Fahrtmodus läuft. Ob
Menschen deswegen mehr Bahn fahren, zeigt erst eine Befragung.

## Sehenswürdigkeiten links und rechts der Strecke

Idee von Michael, 2026-09-25. Nur aus amtlichen offenen Daten, Quellen geprüft
am 2026-09-25 (über Suchresultate; opendata.swiss und swisstopo waren aus der
Arbeitsumgebung gesperrt, die Bedingungen je Datensatz beim Laden nochmals prüfen):
- **Sorglos-Paket**, alle «Freie Nutzung, Quellenangabe Pflicht», auch
  kommerziell, ohne Bewilligung:
  - swissNAMES3D (swisstopo): Gipfel mit Höhe, Seen; OGD seit 2021
  - KGS-Inventar (BABS), nur A-Objekte (nationale Bedeutung, rund 3400)
  - UNESCO-Welterbe Kultur- (BAK) und Naturstätten (BAFU)
  - BLN (BAFU), Landschaften als Flächen, später
- **Nicht nehmen:** OpenStreetMap (ODbL, Weitergabe unter gleichen Bedingungen),
  Wikidata/Wikipedia (Qualität und Herkunft uneinheitlich, Texte CC BY-SA).
- Gezeigt werden nur Name, Art, Höhe, Quelle; Seite (in Fahrtrichtung) und
  Stelle rechnet die Pipeline, der Validator prüft. Hinweis in der App: ob es
  zu sehen ist, sagen die Daten nicht.
- **Schritt 1 beschlossen** (Michael, 2026-09-25): KGS-A-Objekte und
  UNESCO-Welterbe, zuerst im Umkreis von 15 km um Lugano und entlang
  Lugano–Zürich–Bern–Müntschemier. Wartet auf Netzzugang zu `opendata.swiss`,
  `ckan.opendata.swiss`, `data.geo.admin.ch`, `api3.geo.admin.ch`. Vorschlag
  Abstand zur Strecke: 2 km, nach der Testfahrt anpassen.

### Auswahl vom 2026-09-26 (Michael: «übernehmen», Bau wartet noch)

Quellen im Katalog von geo.admin.ch (STAC) gefunden; Bedingungen je Datensatz
beim Laden prüfen und in der Pipeline festhalten.
1. **Gipfel mit Höhe:** Swiss Map Vector 1000 (swisstopo), Ebene
   `T15_DKM1M_HOEHENKOTE` (96 Höhenkoten) und Namen; schon geladen für die
   Seen (`data/raw/swiss-map-vector1000`), gleiche Lizenz. Erster Schritt.
2. **KGS-Objekte von nationaler Bedeutung:** `ch.babs.kulturgueter` (BABS).
3. **Seilbahnen mit Bundeskonzession:** `ch.bav.seilbahnen-bundeskonzession`
   (BAV); passt zum Bahnthema.
4. **Flächen:** BLN `ch.bafu.bundesinventare-bln`, Pärke
   `ch.bafu.schutzgebiete-paerke_nationaler_bedeutung`, Nationalpark
   `ch.bafu.schutzgebiete-schweizerischer_nationalpark`, Moorlandschaften
   `ch.bafu.bundesinventare-moorlandschaften`. Meldung «du fährst durch …»
   statt links/rechts.
- Nicht gewählt, bleiben als Möglichkeit: UNESCO-Welterbe (BAK, BAFU), ISOS
  (BAK), IVS (ASTRA), Auen.
- In der App: nur Name, Art, Höhe, Quelle; Seite und Stelle aus der Pipeline,
  vom Validator geprüft; eigene Art im Fahrtmodus, abschaltbar, eigene Farbe;
  Hinweis «Ob es zu sehen ist, sagen die Daten nicht».

## Seen auf den Karten

**Eingebaut 2026-09-26** (206 Seen, 188 mit Namen, aus Swiss Map Vector 1000;
Fläche `#c9def1`, Name `#3f6a93`). Test auf der Fahrt Lugano–Bern.

Idee von Michael, 2026-09-25:
- **Alle Seen** der Quelle, nicht nur die grössten. Damit braucht es keine
  Flächenangabe und keine Rangliste.
- Quelle: vereinfachte Landeskarte 1:1 Mio. von swisstopo als Vektordaten
  (Seen als Flächen), passend zur kleinen, selbst gezeichneten Karte. «Alle»
  heisst: alle Seen, die diese Quelle führt; kleine Seen fehlen dort, das steht
  als Hinweis bei der Karte.
- Überall, wo die Netzkarte gezeichnet wird: Fahrtmodus, Linienseiten, Tunnel,
  Brücken, Logbuch. Unter dem Streckennetz.
- Farbe von Claude festgelegt (Michael: «helles Blau selber durch dich
  definiert»): Fläche `#d6e7f5`, Name `#4a7196`; dunkel Fläche `#1d2c3a`,
  Name `#8fb3d4`.
- Namen immer, wenn vertretbar: nur wenn der See auf dem Bildschirm gross genug
  ist und der Name nicht mit einem anderen Namen oder einem Bahnhof kollidiert.

## Netzzugang freigeben (Michael, am Samstag auf dem Laptop)

Sehenswürdigkeiten und Seen brauchen Daten, die aus der Arbeitsumgebung
gesperrt sind. So freigeben:
1. Im Browser claude.ai/code öffnen, die Sitzung «Taktland-Korrekturen».
2. Oben die Umgebung **«Standard»** antippen, dann «Bearbeiten».
3. Unter «Network access» «Custom» wählen und diese Adressen erlauben:
   `data.geo.admin.ch`, `api3.geo.admin.ch`, `www.swisstopo.admin.ch`,
   `opendata.swiss`, `ckan.opendata.swiss`; für neue Bahnhöfe (BTI) auch
   `data.sbb.ch`, für den Fahrplan später `opentransportdata.swiss` und
   `data.opentransportdata.swiss`.
4. Speichern, dann Claude «frei» schreiben. Claude prüft, ob die Adressen
   erreichbar sind; sonst in einer neuen Sitzung weiter.

Anleitung: https://code.claude.com/docs/en/claude-code-on-the-web

## Demo-Video

Reiter «Demo» mit einer Aufnahme der App (Michael, 2026-09-25); Aufnahme mit
`docs/demo-aufnahme.mjs`. Heute Probefahrt Lugano–Bellinzona, davor gut sieben
Minuten (im Video rund 20 s) ohne Meldung bis zum Ceneri-Basistunnel.
- **Vorschlag für eine neue Aufnahme:** Walenstadt–Ziegelbrücke (Linie 890,
  5 Tunnel, darunter der Kerenzerbergtunnel mit 3955 m, 45 Brücken), kurz und
  laufend etwas zu melden. Alternative: Lugano–Mendrisio (3 Tunnel, 41 Brücken).
- **Prüfen:** Brunnen–Flüelen führt über die Linien 600 und 604; es sieht so aus,
  als meldete Taktland Tunnel beider Gleise (etwa Morschach- und Stutzecktunnel).
- Hell-Dunkel-Knopf liegt im Bild der Demo über der Karte «Standort»; allenfalls
  verschieben.

## Probefahrt

Michael, 2026-09-25: «Probefahrt extrem attraktiv!» Die Probefahrt spielt einen
Weg 20-mal schneller ab und zeigt ohne Zugfahrt, was der Fahrtmodus kann. Ideen
dazu, noch nicht beschlossen:
- Probefahrt sichtbarer machen, etwa als eigene Kachel auf der Startseite oder
  mit vorgeschlagenen Strecken (Walenstadt–Ziegelbrücke, Lugano–Mendrisio).
- Wählbares Tempo (10-, 20-, 50-mal).
- Probefahrt als Einstieg für Leute, die gerade nicht im Zug sitzen, auch für
  Präsentationen.

## Test mit anderen

Idee, 2026-09-25: Bisher nutzt nur Michael Taktland. Nächster Schritt: 10–20
Leute aus dem Umfeld eine Woche lang pendeln lassen, zuerst Bahnbegeisterte
und Pendelnde.
- Vorher: Demo und Probefahrt als Einstieg, kurze Anleitung zum Installieren
  auf dem Home-Bildschirm.
- Danach fragen: Was hast du behalten? Was hat gestört? Hast du den Fahrtmodus
  im Zug wirklich geöffnet? Würdest du Taktland weiterempfehlen?
- Beobachten ohne Messung auf dem Gerät: Taktland sendet nichts; was zählt,
  sagen die Leute selbst.
- Offene Punkte, die der Test zeigt: Verständlichkeit ohne Erklärung, GPS und
  Akku, offene Seite im Zug.

## Welcher Zug? (Zug erkennen, Stufe 1)

**Gebaut 2026-09-26, bleibt auf dem Branch** `claude/taktland-korrektionen-ka4jp8`
(Michael: «Punkt 4 bleibt»): Fahrplan ist Kerngeschäft der SBB-App, erst nach dem
Gespräch mit dem Vorgesetzten nach `main`. Der Fahrplan käme beim Veröffentlichen aus dem
GTFS, zweimal pro Woche neu.

Idee, 2026-09-25, damals noch nicht beschlossen («warte noch»). Heute kennt Taktland
nur Standort und Weg, keinen Fahrplan. Stufe 1, ohne Server und ohne Schlüssel:
- **0. Quelle:** Fahrplan als GTFS von opentransportdata.swiss; Bedingungen
  beim Laden prüfen. Braucht Netzzugang zu `opentransportdata.swiss` und
  `data.opentransportdata.swiss` (zusätzlich zu den Adressen oben).
- **1. Pipeline:** nur Züge und nur Bahnhöfe in Taktland; je Zug Nummer, Ziel,
  Halte mit Fahrplanzeiten, Verkehrstage; nach Abschnitten aufgeteilt, die App
  lädt nur den eigenen Weg. Stand und Gültigkeit sichtbar.
- **2. «In welchem Zug sitzt du?»** beim Start: die Züge, die laut Fahrplan
  bald ab dem Start Richtung Ziel fahren, dazu «Keiner davon». Die App nimmt nie
  selbst einen Zug an; ohne Wahl läuft alles wie heute.
- **3. Dann:** Zug oben («IC 2 nach Lugano»), «Nächster Halt laut Fahrplan»
  mit Fahrplanzeit, Zugnummer im Logbuch.
- **4. Lücken benennen:** keine Verspätungen, Extrazüge, Ersatzbusse,
  Baustellen.
- **5. Zuerst Teststrecken** (Michaels häufigste Strecken), dann alle.
- Philosophie bleibt: der Zug kommt von der Nutzerin oder vom Nutzer, Zeiten
  heissen «laut Fahrplan», Quelle in der Fusszeile.
- Aufwand einige Tage (Pipeline). Vorsicht: Fahrplan ist Kerngeschäft der
  SBB-App; beim Gespräch mit dem Vorgesetzten erwähnen.
- Später (Stufe 2) Echtzeit und Verspätung: bräuchte einen Schlüssel und damit
  einen Server; widerspricht «kein Server», darum offen.

## BTI Biel–Täuffelen–Ins

Erledigt am 2026-09-26 (Michael: «Strecke + schlanke Seiten»). Die 14
Haltestellen stehen nicht in der Passagierfrequenz; sie haben nur Stammdaten und
eine Frage zur Höhe, die Fahrgastzahl steht als Lücke da, im Duell spielen sie
nicht mit. Linie 261 hat eine Linienseite aus dem Schienennetz des BAV. Im Netz
zählt die BTI wie ein Abschnitt mit 20 Zügen pro Tag (2026-09-27, Michael: «diese
Linie bevorzugen, wenn man Ins oder Ins Dorf bis Biel eingibt»): Ins – Biel und Ins
Dorf – Biel führen über Täuffelen, Dornach – Marin-Epagnier bleibt auf SBB und BLS.
Vorher (wie ein Zug pro Tag) lief sogar Ins Dorf – Biel über Kerzers und Lyss. Endpunkte im Schienennetz sind
«Biel/Bienne [Gleis 11]» und «Ins [Gleis 11]», sie gelten als die Bahnhöfe.

## Andere Bahnen im Netz

Erledigt am 2026-09-26 in der Nacht (Michael: «Warum ist Meiringen nicht erfasst?»,
«Los»). Stücke von 29 Linien aus dem Schienennetz des BAV (RhB, MGB, MOB, MVR, zb,
KWO, OeBB, dazu einzelne Stücke von SBB und BLS), 1186 von 1189 Bahnhöfen im Netz.
Auswahl «Bahnen» auf «Strecke», bei «Neue Fahrt» und im Fahrtblatt (Michael: «filtern
können, ob man alle Bahnen oder nur einzelne berücksichtigt haben möchte»).
Offen, für Michael:
- Museumsbahnen Blonay-Chamby und Furka-Bergstrecke aufnehmen, dann in der Auswahl
  «Bahnen» zu Beginn aus?
- Luzern – Interlaken Ost führt über Bern; «Über Meiringen» legt den Brünig fest.
- Karte: Linie 118 (Châtel-St-Denis – Montbovon) hat keine Linienseite und fehlt im grauen Netz.

## Einträge über Geräte hinweg

Vorgemerkt 2026-09-26 (Michael: «dass meine Eintragungen in Taktland von Gerät zu Gerät
bleiben … Was heisst es, wenn wir dies ändern?»). Zu besprechen, nicht gebaut.

## Fahrt fortsetzen

**Eingebaut 2026-09-26:** Die Stelle auf dem Weg (nicht der Standort) wird alle fünf
Sekunden gemerkt; beim Öffnen fragt Taktland bis zwölf Stunden danach.

Idee, 2026-09-26 (Michael: «Ja»): Schliesst das Handy die Seite ganz (wenig
Speicher, lange im Hintergrund), endet heute der Fahrtmodus; beim Neustart
zählt das Sammelheft erst ab dem neuen Standort, das Stück dazwischen fehlt.
Vorschlag: die laufende Fahrt (Weg, Start, bisher Durchfahrenes, Einstellungen)
auf dem Gerät merken und beim Öffnen fragen «Fahrt Lugano → Bern fortsetzen?».
Beim Fortsetzen zählt alles zwischen dem letzten gespeicherten Standort und dem
neuen als durchfahren, wie heute nach einer Pause im Hintergrund.

## Risiken, beim Bauen beachten

- **Speicher auf dem Gerät:** Logbuch, Sammelheft und Favoriten liegen im
  Speicher des Browsers. Safari auf dem iPhone löscht ihn bei Websites, die sieben
  Tage nicht besucht wurden, nicht aber bei Apps auf dem Home-Bildschirm. Darum
  als App installieren und eine Sicherung zum Herunterladen anbieten. *Sicherung
  eingebaut 2026-09-26* (Logbuch: «Sicherung herunterladen» und «einlesen»).
- **Challenge:** ohne Server, über einen geteilten Code oder Link.
- **Grössere Funktionen** zuerst auf einem Branch, erst danach nach `main`.

Alles unten folgt den Regeln in `CLAUDE.md`: nur Angaben aus den Daten, keine
gerechneten Grössen (keine Summe der Tunnellängen), Lücken benennen.

## Einstieg

- ~~**Eigener Knopf «Fahrtmodus»**~~ erledigt: roter Knopf neben dem Namen.
- ~~**Nur Ziel eingeben**~~ erledigt: Start ist der nächste Bahnhof per GPS.
- ~~**Ohne Ziel**~~ eingebaut 2026-09-26: Abschnitt und Richtung aus den Standorten, der
  Weg folgt derselben Linie bis zur Verzweigung, dann neu gesucht; liegen Strecken
  nebeneinander, fragt Taktland «Welche Linie fährst du?». Ursprüngliche Idee: Aus einigen GPS-Punkten Linie und Richtung erkennen
  (`strecken_geometrie.json`) und melden, was auf der Linie vorne liegt; bei
  einem Linienwechsel neu suchen.
- ~~**Pendelfunktion**~~ erledigt als «Gemerkte Fahrten» (ein Tipp bis zum
  Start); letzte Fahrten zeigt das Logbuch.
- **Verknüpfung auf dem App-Symbol:** `shortcuts` im Manifest der PWA
  («Fahrtmodus», «Letzte Fahrt»), vor allem Android.
- **Neues App-Symbol** (gestaltet von Michael).

## Anzeige

- ~~**Streckenband**~~ erledigt.
- ~~**Ring um die Anzeige**~~ erledigt, in der Farbe des Objekts.
- ~~**Kleine Karte mit eigener Position**~~ erledigt; Seen kommen dazu (oben).
- ~~**Im Tunnel**~~ erledigt: «Ausfahrt in etwa …» mit Balken.
- **Objektillustrationen (Piktos):** Tunnel, Brücke, Bahnhof; zeichnet Michael selbst. Offen.

## Nach der Fahrt

- ~~**Fahrtbilanz**~~ erledigt, mit aufklappbaren Angaben.
- ~~**Abgehakte Objekte**~~ erledigt (Sammelheft).
- ~~**Sammelheft mit «Was fehlt noch?»**~~ erledigt. Offen bleibt die Challenge: «Wer hat mehr Tunnel
  durchfahren?» Offene Frage: Ein Vergleich mit anderen braucht einen Weg,
  Stände zu teilen (etwa einen Code oder Link zum Vergleichen), denn heute
  bleibt alles auf dem Gerät und Taktland hat keinen Server für Nutzerdaten.
- ~~**Quiz zur Fahrt**~~ erledigt.

## Eigene Einträge (Michael, 2026-09-30: «auf die Merkliste nehmen»)

- **Persönliche Orte erfassen:** eigene Orte am Weg festhalten, etwa das Haus der
  Grosseltern oder eine Stelle mit schöner Aussicht, und sie beim Fahren gemeldet
  bekommen wie Sehenswertes. Bleibt auf dem Gerät und kommt in die Sicherung.
- **Objekten ohne Namen einen Namen geben:** Tunnel und Brücken anderer Bahnen
  (swissTLM3D) heissen oft nur «Brücke ohne Namen». Die Nutzerin oder der Nutzer kann
  selbst einen Namen geben, etwa «Saaneviadukt». Der Name muss sichtbar als eigener
  gekennzeichnet sein (etwa «selbst benannt»), damit er nie wie eine Angabe aus den
  Daten wirkt; der Name laut Quelle bleibt daneben erkennbar («ohne Namen laut
  swisstopo»). Nur auf dem Gerät, nie in Fragen oder Vergleichen.

## Brille (Michael, 2026-10-06: «für die Merkliste»)

- **Neue Auftaktbilder generieren** (Michael, 2026-10-08: «bitte nimm das in die Merkliste»): die Bilder zum
  Auftakt der Seiten neu machen, passend zum heutigen Stand (3D, Brille, Bergstrecken unter Probefahrten).
- **Kürzerer Weg in die Brille** erledigt 2026-10-08: mit Brille steht bei jeder Richtung einer Probefahrt und
  einer Bergstrecke neben «Abspielen» ein roter Knopf «In der Brille»; er öffnet gleich das Modell der Strecke,
  es bleibt der Tipp auf «In der Brille ansehen» (den verlangt der Browser). Ohne Brille kein Hinweis darauf.
  Dazu in der Fahrtanzeige ein roter Reiter «Brille» rechts von «3D» statt des Knopfs «Strecke in der Brille».
- **Brille nur auf kurzen Strecken** (Michael, 2026-10-08, Romanshorn – Genève-Aéroport: Kacheln zu langsam): bis
  170 km Weg, bei eigenen Probefahrten bis 120 km Luftlinie; sonst fehlt der Knopf ganz.
- **Zugmodelle zur Wahl** (Michael, 2026-10-08: «verschiedene Zugmodelle … wie zum Beispiel ein Feuerwehrzug»):
  bei der Probefahrt in der Brille Pendelzug (heute), kurzer Regionalzug, langer Güterzug, Feuerwehrzug (Lösch- und
  Rettungszug), später Bergbahn. Wahl auf der Seite neben «In der Brille ansehen», Pendelzug vorgewählt, letzte Wahl
  gemerkt. Nach Bahn eingegrenzt (kein langer Güterzug bei RhB, MGB, MOB, zb), Länge auf kurzen Strecken begrenzt.
  Kein echtes Vorbild, keine Marken, «kein bestimmter Zugtyp» bleibt; keine erfundene Geschwindigkeit je Modell,
  höchstens ein eigenes gerechnetes Geräusch.
- **Hinweis «Modell, kein Abbild»** erledigt 2026-10-08: vor jedem «In der Brille ansehen» ein Kasten mit rotem Rand,
  was in der Brille nicht der Wirklichkeit entspricht; dazu eine rote Zeile auf der Tafel in der Brille.
- **3D bei hohem Tempo** erledigt 2026-10-08: Fenster 7 km vor dem Zug, neu erst nach 12 km, das nächste wird
  vorausgeladen.

- **Brille beim Fahren in der ganzen Schweiz** (Michael, 2026-10-07: «Funktioniert die Brille überall?»,
  dann «Auf die Merkliste»): heute gibt es «In der Brille ansehen» nur auf den Seiten der Bergstrecken. Erledigt 2026-10-08 als
  «Strecke in der Brille» (ganze Strecke als Modell, Band von 5 km).
  Die 3D-Ansicht beim Fahren und bei Probefahrten (30 km um den Zug, wandert mit) hätte dieselbe Szene;
  zu klären ist, wie das Modell auf dem Tisch mitwandert, ohne dass es in der Brille springt.
- **In den Zug wechseln:** Bei der Probefahrt in der Brille die Sicht eines Fahrgasts einnehmen,
  also vom Modell auf dem Tisch in den Zug wechseln und die Strecke von dort aus sehen. Zu klären:
  - In der Brille wird es leicht übel, wenn sich die Sicht bewegt, ohne dass man sich selbst bewegt.
    Ein sanfter Anfang wäre, über dem Zug zu schweben und ihm von hinten nachzuschauen, statt im
    Wagen zu sitzen; dazu eine Taste zum Hin- und Herwechseln.
  - Aus der Nähe fällt auf, was nicht in den Daten steht: Die Höhe der Gleise steht in keiner
    Quelle, die Linie liegt aufs Gelände gelegt, in Tunneln und auf Brücken gerade zwischen den
    Enden. Das Gelände hat 50 m Raster, ohne Häuser und Bäume. Das muss sichtbar dabeistehen.
  - Im Tunnel zeigt die Sicht aus dem Zug nichts; dort eher kurz aussen bleiben oder abblenden.
- **Eigenes Zugmodell:** Michael modelliert selbst einen Zug und schickt ihn als GLB (unter etwa 2 MB, ohne
  Logo und ohne Lackierung einer bestimmten Bahn). Er ersetzt dann die Kästen aus three.js (ZUG_* in
  komponenten/Relief.tsx); Lizenz und Urheber kommen in Info. «Nicht massstäblich» bleibt stehen.
- **Ansichten als Fahrgast oder Lokführer:** zum Hinweis «in den Zug wechseln» oben; Lokführer mit Blick
  nach vorn, Fahrgast seitlich aus dem Fenster. Dieselben offenen Fragen (Übelkeit, Gleishöhe, Tunnel).
