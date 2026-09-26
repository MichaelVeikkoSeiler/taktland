# Merkliste Taktland

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

Idee, 2026-09-25, noch nicht beschlossen («warte noch»). Heute kennt Taktland
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

Wunsch von Michael, 2026-09-25: «das BTI Bähnli Biel Ins aufnehmen». Heute
fehlen die Bahnhöfe dazwischen (Nidau, Ipsach, Täuffelen, Siselen …); Biel/Bienne
und Ins sind drin. Die Infrastruktur betreibt nicht die SBB (nach meinem Wissen
Aare Seeland mobil, beim Laden prüfen).
- Braucht die Rohdaten von `data.sbb.ch` (hier gesperrt, `data/raw` fehlt in
  der Arbeitsumgebung) und das Schienennetz des BAV.
- Vorgehen: prüfen, welche BTI-Bahnhöfe in den Quellen stehen und für wie viele
  Kapitel die Daten reichen; die Bahn in `ALLE_BAHNHOEFE_VON` oder die
  Bahnhöfe einzeln in `ZUSAETZLICH` (pipeline/sources.py); Fakten bauen,
  Bauplan, Profile in Gruppen von fünf lesen; Linie aus dem Schienennetz.
- Im Fahrtmodus wie bei anderen Bahnen: Bahnhöfe ja, Tunnel und Brücken fehlen
  in den Daten, der Weg ist gerade von Bahnhof zu Bahnhof gezogen.

## Fahrt fortsetzen

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
  als App installieren und eine Sicherung zum Herunterladen anbieten.
- **Challenge:** ohne Server, über einen geteilten Code oder Link.
- **Grössere Funktionen** zuerst auf einem Branch, erst danach nach `main`.

Alles unten folgt den Regeln in `CLAUDE.md`: nur Angaben aus den Daten, keine
gerechneten Grössen (keine Summe der Tunnellängen), Lücken benennen.

## Einstieg

- ~~**Eigener Knopf «Fahrtmodus»**~~ erledigt: roter Knopf neben dem Namen.
- ~~**Nur Ziel eingeben**~~ erledigt: Start ist der nächste Bahnhof per GPS.
- **Ohne Ziel:** Aus einigen GPS-Punkten Linie und Richtung erkennen
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
