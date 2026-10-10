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
   Auch eine gerundete 0 ist nicht «keiner»: 119 Güterzüge im Jahr sind pro
   Tag 0, aber es sind welche.
   Und ein Platzhalter der Quelle ist keine Zahl: Die SBB schreibt 49 für
   «weniger als 50 Ein- und Aussteigende». In den Fakten bleibt das Feld leer,
   `dwv_unter` hält die Grenze fest, die App sagt «weniger als 50».

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
   weder beim Sortieren noch beim Zuordnen oder beim Hotspot. Bei Jahreszahlen
   gilt statt 5 % ein Abstand von mindestens 10 Jahren (Michael, 2026-10-04). Ein Schieberegler
   darf höchstens ein Viertel seiner Spanne als richtig werten. Gleichstand ist
   kein Vorsprung: Bei gleich vielen Zügen pro Tag ist kein Abschnitt «am
   stärksten befahren». Genauso wenig darf eine Frage ihre Antwort verraten:
   «In welchem Bezirk liegt Meilen?» mit der Antwort Meilen prüft nichts. Und
   was gefragt wird, steht im Kapitel, im Text oder in der Faktenliste
   darüber: Eine Sortierfrage nach Zahlen, die nirgends stehen, ist Raten.

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
app/         PWA (React, Vite, Tailwind); Lizenztexte mitgelieferter Bibliotheken in app/public/lizenzen/
             drittsoftware.txt, bei einer neuen Bibliothek dort ergänzen
app/public/status.json  Schalter: "verfuegbar": false macht Taktland auf allen Geräten unbenutzbar
             (src/verfuegbar.ts), fehlt die Datei ebenso; ohne Empfang höchstens 30 Tage weiter
web/         Seite für taktland.ch (reines HTML); pipeline/export_web.py stellt sie mit der App unter
             /app/ zusammen und setzt die Zahlen (data-zahl) aus dem Index der App ein
server/zaehler/  Zähler auf zaehler.taktland.ch (Webhosting bei cyon, von Hand hochladen): je Tag nur
             die Zahl der Aufrufe (web), der Geräte (app) und der neuen Geräte (neu), ohne IP und Kennung;
             die App meldet höchstens einmal am Tag (src/zaehlen.ts), liste/ ist mit Passwort geschützt
server/spiel/  Vermittlung für «Geo» und «Bahnhofsuche» auf mehreren Geräten auf spiel.taktland.ch (cyon,
             von Hand hochladen): raum.php reicht je Raum nur Ereignisse weiter (Beitritt, Start, Tipp,
             Weiter), ohne IP; Räume verfallen nach sechs Stunden. Gerechnet wird auf den Geräten
             (src/spielraum.ts, komponenten/Raum.tsx, Schweiz11Online.tsx, ErratenOnline.tsx), zum
             Ausprobieren mit VITE_SPIEL_URL gegen php -S
data/raw/    heruntergeladene CSV, nicht in Git
data/facts/  geprüfte Fakten je Bahnhof: 1189, die mit SBB-Infrastruktur, die anderer
             Bahnen (BLS, RhB, MGB, MOB, ZB, SOB, MVR …) mit Daten für mindestens drei
             Kapitel (ALLE_BAHNHOEFE_VON, ANDERE_AB_KAPITEL in pipeline/sources.py) und die
             14 Haltestellen der BTI ohne Frequenzdaten (HALTESTELLEN_OHNE_FREQUENZ): nur
             Stammdaten, «Fahrgastzahl nicht erfasst», nicht im Duell
data/bauplan.json  was pro Bahnhof von Hand entschieden ist
data/profiles/ lernbare Profile je Bahnhof und Sprache, gebaut, nie von Hand geändert
data/linien/   Fakten je Linie (Strecke, Bahnhöfe, Tunnel), aus pipeline/build_linien.py;
             dazu Linien anderer Bahnen und das Kapitel Netz aus dem Schienennetz des BAV
             (pipeline/schienennetz.py, Stand 2021, ohne Tramlinien)
data/linienprofile/ Linienseiten, gebaut mit generator/linien.py, nie von Hand geändert
data/linien_uebersicht.json  was ohne eigene Linienseite bleibt, samt den Brücken darauf,
             und der Tag, an dem jede Quelle der Linien geladen wurde
data/strecken.json  Netz für die Seite «Strecke»: Abschnitte mit Personenzügen, dazu Stücke
             anderer Bahnen aus dem Schienennetz (RhB, MGB, MOB, zb …), je Abschnitt die
             Bahn und die Tunnel und Brücken seiner Linie (pipeline/build_strecken.py); dazu
             Iselle di Trasquera als Ziel ohne Bahnhofsnummer (GRENZPUNKTE, Nummer -1): Lage am
             Ende der Kilometrierung der Linie 100, in der App ohne Bahnhofseite
data/strecken_geometrie.json  Lage der Linien für den Fahrtmodus (Kilometrierung,
             platzsparend als Differenzen), erst beim Start des Fahrtmodus geladen
data/karte.json  vereinfachtes Streckennetz und Tunnelbereiche für die kleine Karte
             bei Tunneln, Brücken und auf den Linienseiten (pipeline/build_karte.py),
             selbst gezeichnet, ohne Kartendienst
data/seen.json  Seen für alle Karten aus swissTLMRegio von swisstopo wie die Flüsse
             (pipeline/build_seen.py), nur Umriss und Name, Seen unter 0,1 km² fehlen
data/kartenlinien.json  feinere Kantonsgrenzen und Bahnlinien aus swissTLMRegio für die Karte von «Geo»,
             nur zum Zeichnen (pipeline/build_kartenlinien.py), erst dort geladen
data/sehenswert.json  Gipfel mit Höhe (swisstopo), Kulturgüter von nationaler Bedeutung
             (BABS) und Seilbahnen mit Bundeskonzession (BAV) für die Karten
             (pipeline/build_sehenswert.py)
data/bodenbedeckung.json  Wald und Siedlung aus swissTLMRegio (swisstopo), vereinfacht,
             kleine Flächen fehlen, nur zum Zeichnen (pipeline/build_bodenbedeckung.py)
data/flaechen.json  BLN, Pärke und Moorlandschaften (BAFU), vereinfachte Umrisse
data/kartengrund.json  Grund aller Karten: Schweiz und Kantone (BFS g1), Flüsse mit Namen
             (swissTLMRegio, beschriftet in der App), Höhenstufen ab 1000, 2000 und 3000 m (swissALTIRegio), Ortsnamen der
             Landeskarte 1:1 Million ab 2000 Einwohnern, gesetzt auf den Ortspunkt aus swissTLMRegio, nur zum
             Zeichnen (pipeline/build_kartengrund.py, braucht rasterio, scipy, scikit-image)
data/tlm_bauwerke.json  Tunnel, Galerien und Brücken aller Bahnen aus swissTLM3D
             (pipeline/fetch_tlm3d.py, pipeline/build_tlm_bauwerke.py), ohne Länge (beim Fahren mit der Länge
             ihrer Zeichnung, zugLaengeM in src/fahrt.ts); im
             Fahrtmodus auf Strecken anderer Bahnen, deren Verlauf aus dem Schienennetz kommt; zum Abschnitt gehört ein
             Bauwerk bis 30 m neben dem Verlauf, ein Tunnel auch bis 120 m, wenn er dann 60 % des Abschnitts begleitet
             (Lötschberg-Basistunnel, Albulatunnel: zwei Röhren, Verlauf und Zeichnung liegen auseinander)
data/tunnel_richtung.json  Anfang und Ende von SBB-Tunneln laut swissTLM3D (pipeline/build_tunnel_richtung.py),
             auch wo die Länge nur in eine Richtung passt (Vingelz, Simplon, Heitersberg: dort lag der Bereich bis
             2,7 km verschoben), sobald es genau einen Treffer gibt; der Kilometer der SBB liegt oft im Tunnel,
             nicht am Portal; bei gleichem Namen in swissTLM3D darf er bis 1 km
             daneben liegen (Pfaffensprungtunnel)
data/bruecken_bereich.json  Anfang, Ende und Länge von SBB-Brücken laut Zeichnung von swissTLM3D,
             nur wo eindeutig (pipeline/build_bruecken_bereich.py); die SBB nennt keine Länge
data/schweiz11.json  Pool für das Spiel «Geo»: Bahnhöfe, Tunnel und Brücken mit Ziel (Mitte des
             Bauwerks), Kanton laut Kantonsfläche (BFS) und Stufe nach Rang (pipeline/build_schweiz11.py, nach
             export_app.py); dazu die Kantonsflächen für das Spielgebiet
data/erraten.json  Pool für das Spiel «Bahnhofsuche»: je Bahnhof die sechs Hinweise aus data/facts (Kanton,
             Bezirk, Ein- und Aussteigende, Höhe, Bahn, Züge von) und die Stufe nach Rang
             (pipeline/build_erraten.py); Spiellogik in app/src/erraten.ts, getrennt von der Darstellung
data/relief/   3D-Reliefs: Gotthard-Bergstrecke (Linie 600, Erstfeld bis Biasca), Albulalinie (RhB 940,
             Thusis bis St. Moritz), Lötschberg-Bergstrecke (BLS 300, Frutigen bis Brig), Brig–Zermatt
             (MGB 140), Brüniglinie (zb 470, Luzern bis Meiringen), Furka-Oberalp (MGB 610, Brig bis Disentis),
             Berninalinie (RhB 950, St. Moritz bis Campocologno; Tirano liegt in Italien), Chur–Arosa (RhB 930),
             Montreux–Zweisimmen (MOB 120), Hergiswil–Engelberg (zb 480), Lausanne–Solothurn (SBB 150, 200, 210 und
             410 hintereinander, «teile»: der Weg zählt dann Meter ab Lausanne, nicht die Kilometrierung): der
             Ausschnitt in den Geländekacheln (data/gelaende, keine eigenen Höhen mehr), Linie, Tunnel und Brücken mit Anfang und Ende
             (bei anderen Bahnen Linie aus dem Schienennetz des BAV, Bauwerke aus swissTLM3D ohne Namen),
             Bahnhöfe, Gipfel; index.json nennt die Bergstrecken für «Probefahren» (Abschnitt Bergstrecken, als Probefahrt ohne Brille) und die Modellbahn samt Probefahrt (Über hält sie
             auf der Bergstrecke)
             (pipeline/build_relief.py); in der App komponenten/Relief.tsx mit three.js, erst dort geladen;
             auf der eigenen Seite «Mit VR-Brille» (WebXR, Quest 3): Modell 1,2 m breit auf Tischhöhe; ein Abzug trägt es, beide
             skalieren und drehen (bis 8-fach, lange Strecken bis 0,3 m je km, BRILLE_GROESST_M_JE_KM; gezeichnet ab 1 cm vor den Augen), Thumbstick dreht und hebt, rechte Greiftaste setzt zurück, linke schaltet das Zuggeräusch; Probefahrt: der Zug wartet am Anfang, A startet, B hält
             an, X halbiert das Tempo (bis ¼), Y verdoppelt es (bis 16-fach); Knopf «Zuggeräusch» wie beim Fahren;
             mit Passthrough, wo die Brille es kann; erscheint nur, wo der Browser WebXR meldet;
             ein Knopf «Mit VR-Brille» (Modellbahn), der ganze Zug steht am Anfang bereit und fährt nach A in 2,5 Minuten über das
             Modell (Zeitraffer, kein Fahrplan); Hinweise in der Brille hängen am Blick, nicht am Modell; beim Betreten eine
             Tafel mit den Tasten und rotem Knopf «Schliessen» (Strahl und Abzug oder A), sie bleibt bis dahin; erst das nächste A startet; am Ziel hält er und zeigt die Knöpfe «Fahrt wiederholen»,
             «Zurückfahren» (Steuerwagen voraus) und «Fahrt beenden», mit dem Strahl oder A, X, B; bis zum ersten A zeigt ein wippender roter Pfeil von oben auf die Lok;
             der Zug ist Lok, 4 Wagen und ein Steuerwagen gleicher Länge (hinten abgeschrägt wie die Lok; rot ist immer die Spitze in Fahrtrichtung), hell mit dunklem Fensterband und dunklen
             Übergängen, der Kopf gerundet mit Frontscheibe, nur die Spitze karminrot; in der Brille näher als 0,8 m
             kleiner (mit der Wurzel des Abstands, höchstens bis 40 %); Bahnhöfe als dünner Mast in Dunkelgrau mit
             dem Namen oben auf eckigem dunkelgrauem Schild, Seilbahnen als feine Linie, Seen auf dem Luftbild ohne Fläche, aus der Nähe kleiner, «nicht massstäblich»;
             die Höhe der Gleise steht in keiner Quelle: die Linie folgt dem Gelände, gemittelt über 400 m davor und danach, 3 m darüber, höher nur wo das Gelände darüber ragt (LINIE_UEBER_M; vorher 25 m, Michael, 2026-10-10: «deutlich über dem Boden»);
             die Wagen drehen nur um die Senkrechte und neigen sich höchstens 4° (ZUG_NEIGUNG_MAX; vorher 7°, Michael, 2026-10-10), kippen nie zur Seite
data/gelaende/  Gelände der ganzen Schweiz (5 km Rand, dazu 3 km neben jeder Bahnlinie) in Kacheln von 10 km
             zu 50 m aus swissALTIRegio, je Zeile Differenzen und gzip (.hgz, 550 Kacheln, 18 MB;
             pipeline/build_gelaende.py): «3D» auf jeder Fahrt und Probefahrt, 30 km um eine Mitte 7 km vor dem Zug, der Ausschnitt
             wandert alle 12 km mit, das nächste Fenster wird schon vorher geladen (fensterVorladen) (app/src/gelaende.ts, GelaendeFahrt in komponenten/Relief.tsx); Lautsprecher-Knopf (an: Wellen auf
             Anthrazit, aus: Kreuz auf Weiss) fürs Zuggeräusch: Rollen und
             Radschläge, gerechnet in src/audio.ts, folgen dem Tempo (im Zeitraffer gestaucht, ab 5000 km/h gleich), steigen beim Anfahren in
             2,5 s an und klingen 2,5 s vor dem Ziel aus, im Tunnel dumpfer und lauter mit Widerhall, auf Brücken
             hohler, am Anfang aus; Knopf «Hinter den Zug» setzt die Kamera schräg hinter den Zug, «Führerstand» vorne in den Zug mit Blick die Strecke entlang (auch bei der Modellbahn; Michael, 2026-10-10), dort nah am Zug das feine Gelände aus data/gelaende_nah (4 km im Quadrat, Mitte 1,2 km voraus, neu nach 800 m, FEIN_SEITE_M in Relief.tsx) mit dem Nahbild, das grobe Gelände sinkt darunter, die Linie liegt 1 m über dem feinen Gelände, ein 1,5 m breites Band, quer zur Fahrt immer waagrecht (Michael, 2026-10-10: «immer schön plan»), im Tunnel wird das Bild dunkel (40 m ab dem Portal ein- und ausgeblendet, TUNNEL_DUNKEL); unter Fahren keine Brille (Michael, 2026-10-08); die Angaben unter dem Bild klappen auf («Modell, nicht massstäblich: Quellen und Grenzen»), Tunnel ohne Länge zeigt 3D nicht (früher eine graue Kugel; Michael, 2026-10-10).
             Spiel «Modellbahn» unter Spiele (2026-10-08 kurz «Modellbahn VR») (komponenten/Modellbahn.tsx, #/modellbahn, für alle, die Brille nur mit WebXR):
             auf der Seite Modellbahn der Kasten «Modellbahn: ein Modell zum Anschauen, kein Abbild der Wirklichkeit»
             (komponenten/ModellHinweis.tsx), unten nach den Strecken (man liest ihn nicht jedes Mal), unter jedem Modell nur ein Satz mit Link «Was nicht stimmt» dorthin; Zug fährt in allen 3D-Ansichten in 2 s an und bremst am Ziel in 2 s ab (ANFAHREN_S in Relief.tsx, ANFAHREN_MS in Fahrtmodus.tsx); eine gemerkte Probefahrt (&fest=1) zeigt Start, Ziel, Über und ihre Linien nur zum Lesen, ohne Felder zum Ändern;
             die Linie dunkelgrau mit Rand wie in 3D beim Fahren (FARBEN.weg), in der Brille ein flaches Band statt einer Röhre,
             auf dem der Zug fährt (eine Röhre schluckte ihn aus der Nähe), Tunnel darin gestrichelt mit 12 mm Strich und 8 mm Lücke auf
             dem Tisch wie die Striche auf dem Bildschirm aus der Nähe (BRILLE_STRICH_M),
             «Höhe wie echt / 2-fach» unter der Karte (Michael, 2026-10-10: «damit man von der Karte mehr sieht»), rechts oben in der Karte ein Knopf fürs Vollbild (ModellKarte): die Karte füllt den Bildschirm, wo der Browser es kann auch ohne seine Leisten (useEchtesVollbild in Netzkarte.tsx, gilt auch für die Karte beim Fahren), darin Höhe, Zuggeräusch, Zug fahren, Anhalten, Führerstand und Tempo, Namen so gross wie daneben; darunter «Zug fahren» und «Anhalten» auf dem Bildschirm, das Tempo «2.5 Min.» über die ganze Strecke oder 1×, 2×, 4×, 8× von 100 km/h (MODELL_TEMPI; das wirkliche Tempo einer Strecke steht in keiner Quelle; Michael, 2026-10-10), bei der Probefahrt 1×, 2×, 4×, 8×, 20×, 50×, 200× (ZEITRAFFER in Fahrtmodus.tsx), das Zuggeräusch und «Mit VR-Brille» (immer rot; ohne WebXR
             geht er nicht und sagt beim Tippen, was es dafür braucht); die
             Bergstrecken und Lausanne–Solothurn als Modell (#/modellbahn/gotthard, alte Adressen #/relief/…, #/fahrt/3d/…
             führen dorthin; #/relief/… kommt von der Linienseite, «Zurück» führt zur Linie), die eigenen Probefahrten aus «Fahren»
             wie dort (aufklappen, Richtung wählen, × oder wischen löscht, «Rückgängig»; dieselbe Liste), «Als Modell ansehen» auf der Seite Strecke, und «Eigene Strecke» (#/modellbahn/strecke, die Seite Strecke mit modell, bis 200 km Weg; ist ein Weg gewählt, steht das Modell gleich unter dem Titel, Von, Nach, Über und die Linien darunter, Michael, 2026-10-10;
             MODELL_HOECHSTENS_M in src/relief.ts: länger lädt das Gelände zu langsam; ModellStrecke): die ganze Strecke als Modell wie die Bergstrecken, Gelände nur in einem Band links und rechts,
             je nach Länge 5 bis 15 km (etwa 2'000 km² wie das Gotthard-Modell, bandBreite) (nur diese Kacheln, das Netz ohne leere Punkte), ab 3 Millionen Feldern im Band gröber,
             Luftbilder verkleinert; Seen, Gipfel und Kulturgüter nur im Band; in Modellen über 100 km nur Seen ab
             8 km² beschriftet, Masten mit der Grösse des Modells höher; die Reliefs in
             data/relief bleiben für die Bergstrecken als Ganzes und
             holen ihr Gelände ebenfalls aus den Kacheln
data/luftbild/  Luftbild für das Gelände in 3D: SWISSIMAGE (swisstopo, 2-m-Fassung je km von data.geo.admin.ch),
             auf 10 m gemittelt, JPEG im 10-km-Raster der Geländekacheln, je km der neueste Jahrgang (2017 bis 2025),
             die Jahre je Kachel in index.json (pipeline/build_luftbild.py --alle: 508 Kacheln der ganzen Schweiz,
             105 MB; Kacheln ohne Bild von swisstopo, im Ausland, fehlen; die 2-m-Rohbilder werden je Kachel
             gelöscht); in der App ein Knopf «Luftbild», Gebiete darauf nur als Umriss; fehlt ein Bild oder lädt es nicht,
             zeigt das Gelände dort seine Farben, ebenso wo die Kachel reinweiss ist (keine Aufnahme jenseits der Grenze, ohneLeeres); höchstens 25 Bilder bleiben geladen (src/gelaende.ts)
data/luftbild_nah/  Nahbild: dasselbe Luftbild auf 2,5 m, nur bis 500 m neben den Bahnlinien aus swissTLMRegio
             (data/kartenlinien.json), je km ein JPEG von 400 × 400, weiter weg weiss (pipeline/build_luftbild_nah.py, etwa
             10'000 km, Rohbilder gleich gelöscht; Michael, 2026-10-10: «die Landschaft ist sehr verschwommen»); in der App ein
             zweites Netz aus denselben Punkten wie das Gelände, 6 km um den Blickpunkt, neu ab 1,5 km Weg, nur näher als 25 km
             (NAH_SEITE_M in Relief.tsx), Weiss und ein Saum von 4 Bildpunkten durchsichtig (NAH_SAUM in src/gelaende.ts),
             darauf die Umrisse und das Kilometernetz wie darunter
data/gelaende_nah/  feines Gelände für den Führerstand: swissALTI3D (swisstopo, 2-m-Fassung, nur deren Übersicht gelesen) auf 10 m,
             dieselben Kilometer wie data/luftbild_nah, je km 100 × 100 Höhen in .hgz (Int32 tiefste Höhe in dm, dann
             Differenzen je Zeile; pipeline/build_gelaende_nah.py, 97 MB, 9'672 km); in der App feinLaden in src/gelaende.ts
data/standort.json  Lage jedes Tunnels, jeder Brücke und jedes Bahnübergangs aus der
             Quelle, für die Seite «Standort» (pipeline/build_linien.py)
```

## Befehle

```bash
python pipeline/fetch.py                    # Datasets laden
python3 pipeline/fetch_schienennetz.py      # Schienennetz des BAV laden (31 MB)
.venv/bin/python pipeline/build_facts.py --all   # Fakten für alle Bahnhöfe
.venv/bin/python generator/validate.py --alle    # Profile prüfen
.venv/bin/python generator/bauplan.py 8502226 8506300  # neue Bahnhöfe in den Bauplan
.venv/bin/python generator/bauen.py 8502218 --zeigen   # Profil bauen und lesen
.venv/bin/python generator/bauen.py --alle --pruefen   # was würde ein Neubau ändern?
.venv/bin/python generator/bauen.py --alle             # alle Profile neu bauen
python3 generator/offen.py 8                     # die nächsten Bahnhöfe ohne Profil
.venv/bin/python generator/sortieren_richten.py --alle   # knappe Sortierfragen zeigen
.venv/bin/python pipeline/build_linien.py        # Fakten für die Linien
.venv/bin/python generator/linien.py 600 --zeigen    # Linienseite bauen und lesen
.venv/bin/python generator/linien.py --alle          # alle Linienseiten bauen
.venv/bin/python generator/linien.py --validieren    # Linienseiten prüfen
.venv/bin/python pipeline/build_strecken.py      # Netz für die Seite «Strecke»
python3 generator/strecken.py --validieren       # Tunnel und Brücken je Abschnitt prüfen
python3 generator/strecken.py "Zürich HB" "Lugano"   # Weg zeigen
.venv/bin/python pipeline/build_karte.py         # Netz für die kleine Tunnelkarte
.venv/bin/python pipeline/build_seen.py         # Seen für die Karten (swissTLMRegio)
python3 pipeline/build_sehenswert.py             # Gipfel, Kulturgüter, Seilbahnen, Flächen
.venv/bin/python pipeline/build_bodenbedeckung.py  # Wald und Siedlung (swissTLMRegio)
.venv/bin/python pipeline/build_kartengrund.py   # Grenzen, Flüsse, Höhenstufen für die Karten
python3 pipeline/fetch_tlm3d.py                  # Ebene Eisenbahn aus swissTLM3D (60 MB von 3,6 GB)
.venv/bin/python pipeline/build_tlm_bauwerke.py  # Tunnel und Brücken aller Bahnen, vor build_strecken
.venv/bin/python pipeline/build_tunnel_richtung.py  # Anfang und Ende der SBB-Tunnel laut swissTLM3D
.venv/bin/python pipeline/build_bruecken_bereich.py  # Brückenlängen laut swissTLM3D, vor build_strecken
.venv/bin/python pipeline/build_schweiz11.py   # Pool für «Geo», nach export_app
.venv/bin/python pipeline/build_erraten.py      # Pool für «Bahnhofsuche» aus data/facts
.venv/bin/python pipeline/build_kartenlinien.py   # Kantonsgrenzen und Bahnlinien für die Karte von «Geo»
.venv/bin/python pipeline/build_relief.py       # Bergstrecken in 3D (Ausschnitt, Linie, Bauwerke; Gelände aus den Kacheln)
.venv/bin/python pipeline/build_gelaende.py     # Geländekacheln der ganzen Schweiz für «3D» auf jeder Fahrt
.venv/bin/python pipeline/build_luftbild.py --alle   # Luftbild (SWISSIMAGE) der ganzen Schweiz, Stunden, vor export_app
.venv/bin/python pipeline/build_luftbild.py --orte Gümmenen Müntschemier   # Luftbild rund um eine Strecke
.venv/bin/python pipeline/build_luftbild_nah.py      # Nahbild (2,5 m) entlang der Bahnlinien, etwa eine Stunde, vor export_app
.venv/bin/python pipeline/build_gelaende_nah.py      # feines Gelände (10 m) entlang der Bahnlinien für den Führerstand, vor export_app
```

Die Linienseiten folgen denselben Regeln wie die Bahnhöfe. Eine Linie ist eine
Strecke der Infrastruktur (Linie 600), keine Zuglinie. Ihre Kilometrierung ist
ein Standort, keine Länge; Länge, Baujahr und Spurzahl einer Linie stehen nicht
in den Daten (`docs/datenlage.md`).

**Ein Profil ist ein Ergebnis, kein Werkstück.** Es entsteht mit
`generator/bauen.py` aus der Faktendatei und dem Eintrag in `data/bauplan.json`
und wird nie von Hand geändert. Wer etwas ändern will, ändert den Baukasten,
die Pipeline oder den Bauplan und baut neu. So wirkt jede neue Regel mit einem
Befehl auf alle Bahnhöfe.

Neue Profile entstehen in Schüben von 20, gelesen in Gruppen von fünf: mit
`bauplan.py` in den Bauplan eintragen (der Vorschlag für die Stammdaten-Frage
wird beim Lesen geprüft), mit `bauen.py … --zeigen` lesen, dann bauen. Was dabei
auffällt, wird zur Regel im Baukasten, zur Prüfregel oder zum Abschnitt in
`generator/SCHEMA.md`, danach wird alles neu gebaut.

## Gestaltung

Die App folgt der öffentlichen Designdokumentation der SBB (digital.sbb.ch), mit eigener
Akzentfarbe: Karmin `#a8102e` wie die Bildmarke (im Dunkelmodus `#d63a55`) nur für Wichtiges,
statt des SBB-Rots (Michael, 2026-09-27; in Tailwind weiter `sbb-red`), sonst Weiss, Milk `#f6f6f6`, Cloud `#e5e5e5`,
Metal `#767676`, Charcoal `#212121`. Keine Farbverläufe, kantige Flächen,
Helvetica als Ersatz für die nicht frei lizenzierte Hausschrift SBB Web.

Listen und Karten, die zu etwas führen, sind **Kacheln**: helles Grau `#ebebeb`
(Milk um 4,5 % dunkler), leicht abgerundet, ohne Rahmen (Michael, 2026-09-25). Dafür gibt es die Klassen
`kachel`, `kachel-link` und `kachelliste` in `app/src/index.css`. Alle Knöpfe, rote, gewählte
und weisse mit Rand, haben dieselben leicht abgerundeten Ecken (`rounded-lg`, Michael, 2026-09-26); gewählte Knöpfe sind
Anthracite `#5a5a5a` statt Schwarz (Michael, 2026-09-25). Kacheln und Knöpfe sind die
einzige Ausnahme von den kantigen Flächen.

Eigene Einträge (Probefahrten, gemerkte Fahrten, Favoriten, Fahrten im Logbuch) lassen sich **nach links wischen**:
der Eintrag bleibt aufgeschoben, und ein Tipp auf die rote Fläche «Löschen» löscht ihn ohne weitere Rückfrage (`komponenten/Wischen.tsx`,
Michael, 2026-10-08, ohne Rückfrage seit 2026-10-09). Das × daneben bleibt für Maus und Tastatur.

Was lädt, zeigt oben ein **Ladebalken** in Karmin (`komponenten/Ladebalken.tsx`, Michael, 2026-10-10): er zählt alles, was über
`holen`, `holenBinaer` oder `ladenVerfolgen` in `src/daten.ts` geht (auch die nachgeladenen Teile für 3D), erscheint erst nach
250 ms und füllt sich mit dem Anteil der fertigen Dateien; die Abfragen von «Geo» online, der Zähler und status.json zählen nicht mit.
Beim Laden einer 3D-Szene (szeneLaden) steht er ganz oben in deren Karte, nicht oben in der App (`<Ladebalken inKarte />`, Michael, 2026-10-10), läuft sofort und mindestens 3 Sekunden sichtbar von 0 bis 100 %, in zufälligen,
ungleichen Schritten mit kurzen Halten, ein Spiel, keine Messung (Michael, 2026-10-10); steht der Browser beim Bauen still, zählt
die Zeit nicht; lädt danach noch etwas, kriecht er bis 98 %. 6 Pixel hoch.

In der Fusszeile rechts neben der Bildmarke zwei Symbole, «Taktland teilen» und «Einstellungen» (`komponenten/Teilen.tsx`, Michael, 2026-10-10): Teilen öffnet auf dem Handy das Teilen-Menü des
Geräts, sonst E-Mail, WhatsApp und «Link kopieren»; geteilt wird nur https://taktland.ch mit einem Satz, nichts vom Fortschritt.

**Die Bildmarke von Taktland** ist ein weisses «T» aus einer Linie mit fünf Haltepunkten auf
karminrotem (`#a8102e`), abgerundetem Quadrat; alle Haltepunkte sind Ringe, der Stamm biegt
unten nach rechts ab (`app/public/logo.svg`, Entwürfe in `entwuerfe/logo/`, Michael, 2026-09-30). Sie steht vor dem
Namen im Kopf und ist das App-Symbol; ihr Karminrot ist auch die Akzentfarbe der App.

**Kein Logo, keine Bildmarke der SBB.** Die Farb- und Formensprache ist übernommen,
die Marke nicht. In der Fusszeile steht, dass Taktland kein Angebot einer Bahn ist, ohne Namen
(Michael, 2026-09-29: «einer Bahnunternehmung»).

## Sprache

Deutsch, Schweizer Rechtschreibung: **ss statt ß**. Zahlen ab 1000 mit Apostroph (5'000; Michael, 2026-10-04).
«Perron» statt Bahnsteig, «Billett» statt Fahrkarte.

## Quellenangabe

Die Daten stammen von data.sbb.ch. Die Lizenz verlangt eine Quellenangabe, die in
der App sichtbar sein muss: In der Fusszeile steht immer eine Zeile mit allen Quellen, was wofür ist, klappt
darunter auf («Alle Datenquellen und Lizenzen», details/summary, Michael, 2026-10-09). Kein SBB-Logo, kein Auftritt, der ein offizielles
SBB-Produkt suggeriert.
