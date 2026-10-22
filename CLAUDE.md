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
server/daten/  daten.taktland.ch (cyon, Ordner public_html/daten, von Hand hochgeladen, Michael, 2026-10-12): grosse Kacheln,
             die nicht in die App passen (GitHub Pages höchstens 1 GB); .htaccess erlaubt den Abruf von taktland.ch (CORS);
             scharf/: der Workflow «Scharfe Umgebung» (.github/workflows/scharf.yml, von Hand zu starten) baut die Strecken aus
             pipeline/scharf_reihen.sh in vier Reihen gleichzeitig (Reihe 5: Nachträge, einzeln mit reihen = [5], Biel/Bienne–Täuffelen–Ins der BTI; holen.php
             holt dann mit NUR = 'scharf-r5-' nur deren Pakete; Reihen 6a bis 6h: alle übrigen Bahnlinien aus swissTLMRegio ohne die Kacheln der
             Reihen 1 bis 5 und der App, 117'407 Kacheln, davon nur etwa 28'000 in der Schweiz (die übrigen liegen im Ausland, ohne SWISSIMAGE, r6a und r6h ganz), gepackt etwa 2,8 GB, in acht Teilen, build_scharf.py --rest 3/8, holen.php mit NUR = 'scharf-r6';
             Michael, 2026-10-15: «Alles scharf machen»), schnürt Pakete (pipeline/scharf_pakete.py, je höchstens 400 MB,
             der Index der Reihe als scharf/index-rN.json im letzten) und legt sie ins Release «scharf-1»; holen.php, einmal nach
             public_html/daten hochgeladen und geöffnet, holt sie, packt sie aus, fügt die Verzeichnisse zu scharf/index.json
             zusammen und löscht sich (Dateien im Chat höchstens 30 MB, Releases darf die Sitzung nicht anlegen); zusammen.php fügt nur die
             Verzeichnisse zusammen, ohne zu laden, wenn holen.php vor dem letzten Schritt endete (Michael, 2026-10-17: gebaeude/index.json fehlte)
server/spiel/  Vermittlung für «Geo» und «Bahnhofsuche» auf mehreren Geräten auf spiel.taktland.ch (cyon,
             von Hand hochladen): raum.php reicht je Raum nur Ereignisse weiter (Beitritt, Start, Tipp,
             Weiter), ohne IP; Räume verfallen nach sechs Stunden. Gerechnet wird auf den Geräten
             (src/spielraum.ts, komponenten/Raum.tsx, Schweiz11Online.tsx, ErratenOnline.tsx), zum
             Ausprobieren mit VITE_SPIEL_URL gegen php -S
dreidland/   3dland.ch (Michael, 2026-10-21): nur «3D Schweiz» als eigene Seite aus demselben Code (app/3dland.html,
             src/dreidland.tsx, vite.3dland.config.ts, scripts/3dland_fertig.mjs; eigene Bildmarke und Auftaktbild hell und dunkel als
             Platzhalter von Michael, 2026-10-21: app/public-3dland, src/assets/auftakt-3dland-*.webp; sonst die Farben von Taktland),
             ohne eigene Daten: holt sie von taktland.ch/app/ (VITE_DATEN_BASIS in src/daten.ts und src/schweiz11.ts) und
             daten.taktland.ch; das Repository 3dland enthält nur den Workflow dreidland/veroeffentlichen.yml (je Repository nur eine
             eigene Domain bei GitHub Pages), der täglich und von Hand baut; Einrichten in dreidland/LIESMICH.md
data/raw/    heruntergeladene CSV, nicht in Git
data/facts/  geprüfte Fakten je Bahnhof: 1194, die mit SBB-Infrastruktur, die anderer
             Bahnen (BLS, RhB, MGB, MOB, ZB, SOB, MVR …) mit Daten für mindestens drei
             Kapitel (ALLE_BAHNHOEFE_VON, ANDERE_AB_KAPITEL in pipeline/sources.py) und die
             14 Haltestellen der BTI und 5 der transN Travers–Buttes (Linie 221, Michael, 2026-10-11) ohne
             Frequenzdaten (HALTESTELLEN_OHNE_FREQUENZ): nur
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
             anderer Bahnen aus dem Schienennetz (RhB, MGB, MOB, zb …, die Linien 261 BTI und 221 transN ohne Zugzahlen
             in BAV_OHNE_ZUGZAHLEN, Travers Ouest gilt als Travers), je Abschnitt die
             Bahn und die Tunnel und Brücken seiner Linie (pipeline/build_strecken.py), dazu je Teil bruecken_3d: Brücken aus
             swissTLM3D (beide Enden höchstens 50 m neben der Linie, ab 30 m), wo keine SBB-Brücke mit Länge liegt, nur fürs Bild
             und die Höhe der Linie in 3D, nicht gemeldet und keiner SBB-Brücke zugeschrieben (Fahrweg.nurBild; Michael,
             2026-10-14: in Bern schwebte das Gleis über der Aare, der Viadukt der Lorraine ist in swissTLM3D ein Stück, bei
             der SBB vier Brücken ohne Länge); dazu
             Iselle di Trasquera als Ziel ohne Bahnhofsnummer (GRENZPUNKTE, Nummer -1): Lage am
             Ende der Kilometrierung der Linie 100, in der App ohne Bahnhofseite
data/strecken_geometrie.json  Lage der Linien für den Fahrtmodus (Kilometrierung,
             platzsparend als Differenzen), erst beim Start des Fahrtmodus geladen; Abschnitte anderer Bahnen ohne Verlauf im
             Schienennetz des BAV bekommen den kürzesten Weg im Gleisnetz von swissTLM3D, höchstens 1,5-mal so lang wie die Luftlinie
             (verlauf_nach_tlm in build_strecken.py, 9 Abschnitte; Michael, 2026-10-15: Hondrich Süd–Spiez lag als Gerade bis 800 m neben
             dem Hondrichtunnel, der Zug fuhr durch den Berg und sah Häuser und Bäume von unten), ebenso wo der Verlauf des BAV ein Stück von
             100 m mehr als 25 m neben jedem Gleis liegt, wenn der Weg höchstens 25 % länger oder 20 % kürzer ist (abseits_m, 27 Abschnitte:
             Preda–Spinas durch den neuen Albulatunnel, Furka, Oberalp, Kalpetran, Vereina …); im Gleisnetz wird eine Achse geteilt, wo eine
             andere in sie mündet; Kilometersprünge (dieselben km an zwei Orten, Linien 201, 251, 610, 651, 710) nach der Lage geordnet, die km
             des doppelten Stücks dazwischen verteilt (sprung_ordnen; vorher sprang die Linie bei Eschenbach LU 300 m vor und zurück);
             gefunden mit der Prüfung über das ganze Netz (app/scripts/netzpruefung.ts, Michael, 2026-10-16): je Abschnitt dieselben
             Funktionen wie die App (fahrwegBauen, src/gleisweg.ts) ohne Browser, in etwa 20 s; meldet Stücke neben oder ohne Gleis,
             Wackler, steile Stellen und Tunnel, die nur das Gleisnetz kennt (Ergebnis in data/raw/netzpruefung, nicht in Git); offen:
             Biberist Ost–Solothurn und Burgdorf–Burgdorf Steinhof West (Gerade, der Weg im Gleisnetz kehrt um oder ist zu lang),
             Campocologno–Tirano (Italien, ohne swissTLM3D)
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
data/schweiz11.json  Pool für das Spiel «Geo» (Handy quer: Karte links, Aufgabe und Knöpfe rechts, «Tipp bestätigen» bleibt unten sichtbar; Variante quer in index.css, Michael, 2026-10-10): Bahnhöfe, Tunnel und Brücken mit Ziel (Mitte des
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
             die Höhe der Gleise aus swissTLM3D (data/gleishoehe, gleisHoehenLaden; Michael, 2026-10-15, Albula: «wie auf einer Achterbahn»), 3 m darüber,
             höher nur wo das Gelände ausserhalb von Tunneln darüber ragt; wo keine Achse daneben liegt, folgt die Linie wie früher dem Gelände, gemittelt über 400 m davor und danach (LINIE_UEBER_M; vorher 25 m, Michael, 2026-10-10: «deutlich über dem Boden»);
             die Wagen drehen nur um die Senkrechte und neigen sich höchstens 4° (ZUG_NEIGUNG_MAX; vorher 7°, Michael, 2026-10-10), kippen nie zur Seite
data/gelaende/  Gelände der ganzen Schweiz (5 km Rand, dazu 3 km neben jeder Bahnlinie) in Kacheln von 10 km
             zu 50 m aus swissALTIRegio, je Zeile Differenzen und gzip (.hgz, 550 Kacheln, 18 MB;
             pipeline/build_gelaende.py): «3D» auf jeder Fahrt und Probefahrt, 30 km um eine Mitte 7 km vor dem Zug, der Ausschnitt
             wandert alle 12 km mit, das nächste Fenster wird schon vorher geladen (fensterVorladen) (app/src/gelaende.ts, GelaendeFahrt in komponenten/Relief.tsx); Lautsprecher-Knopf (an: Wellen auf
             Anthrazit, aus: Kreuz auf Weiss) fürs Zuggeräusch: Rollen und
             Radschläge, gerechnet in src/audio.ts, folgen dem Tempo (im Zeitraffer gestaucht, ab 5000 km/h gleich), steigen beim Anfahren in
             2,5 s an und klingen 2,5 s vor dem Ziel aus, im Tunnel dumpfer und lauter mit Widerhall, auf Brücken
             hohler, am Anfang aus; Knopf «Hinter den Zug» setzt die Kamera schräg hinter den Zug, der eigene Standort beim Fahren am Anfang des Wegs am Ende des Zugs, nach ZUG_VORNE_BIS_M (800 m) sanft in seiner Mitte, auch an Zwischenhalten und am Ziel (stelleDerSpitze; Michael, 2026-10-11), «Führerstand» vorne in den Zug mit Blick die Strecke entlang (auch bei der Modellbahn; Michael, 2026-10-10), beim Fahren mit GPS an der eigenen Stelle im Zug statt an der Spitze (blickM; Michael, 2026-10-16, Müntschemier–Bern: sonst sah er, was 70 bis 120 m weiter hinten etwa 4 s später am Fenster vorbeikam), das Auge 3 m über der Linie (FUEHRERSTAND_HOEHE_M; vorher 4 m, Michael, 2026-10-15: sonst fuhr man durch die Dächer der Perrons; in keiner Quelle), dort nah am Zug das feine Gelände aus data/gelaende_nah (4 km im Quadrat, Mitte 1,2 km voraus, neu nach 800 m, FEIN_SEITE_M in Relief.tsx) mit dem Nahbild, das grobe Gelände sinkt darunter, die Linie liegt 1 m über dem feinen Gelände, das bis 10 m neben ihr auf ihre Höhe gebracht wird und bis 24 m ausläuft, nicht auf Brücken und in Tunneln (trasse, TRASSE_HALB_M, TRASSE_RAND_M; Michael, 2026-10-17, MOB: «schneidet die Linie die realen Trassen immer wieder viel zu stark»; Breite der Trasse in keiner Quelle), gezeichnet als zwei helle, halb durchsichtige Schienen auf dem Luftbild (Michael, 2026-10-14: «Nur zwei Schienen»; 2026-10-15: «mit 50% Transparenz»; vorher ein dunkelgraues Band 1,95 m breit, Schwellen gab es kurz, nicht gewünscht): Normalspur überall, je 15 cm breit (SPUR_M, SCHIENE_M; Spurweite und Breite in keiner Quelle), auch im Tunnel durchgezogen, quer zur Fahrt immer waagrecht (Michael, 2026-10-10: «immer schön plan»), jeder Tunnel ist eine Röhre, in die der Zug fährt und durch die man blickt, auch beim Drehen und Zoomen in den Berg hinein (Michael, 2026-10-12): seit 2026-10-13 nach Michaels Modellbahn-Vorbild ein Hufeisen (Wände 4,2 m neben der Linie bis 2,8 m über ihr, darüber ein Halbkreis, Boden flach 0,4 m unter der Linie), Lichtband an der Wand, nur von innen gezeichnet, von aussen nur dort, wo das feine Gelände sie ganz überdeckt, im Tunnel ganz (Michael, 2026-10-16: vor Gümmenen sah man in den Ecken hinaus) (sonst stand sie in der Landschaft; gemauerte Portale gab es kurz, zu massiv, Michael, 2026-10-13), dunkel erst 20 m im Tunnel (PORTAL_INNEN_M, bei kurzen Tunneln ein Viertel der Länge; Michael: sonst war es hinter dem Eingang gleich wieder hell), Querschnitt und Licht in keiner Quelle (ROEHRE_R_M …, tunnelRoehre in Relief.tsx); die Wand aus Fels (Michael, 2026-10-13): gezeichnetes Felsbild mit Flecken und Rissen, auch als Relief im Licht, die Wand bis 7 % uneben, an den Portalen glatt (felsMaterial, ROEHRE_RAUH), nicht aus einer Quelle; im Tunnel bleiben 7 % des Tageslichts, das Stirnlicht leuchtet die Röhre aus (TUNNEL_TAGESLICHT, Michael, 2026-10-13: «deutlich heller, wenn man das Licht anlässt»; vorher eine dunkle Fläche über dem Bild, 0,97, dann 0,2); bei der Probefahrt bis 200 km (MODELL_HOECHSTENS_M) in 3D die ganze Strecke als Band wie in der Modellbahn (bandLaden), die Szene wird unterwegs nie neu gebaut, darum dort auch «Mit VR-Brille» (Michael, 2026-10-14: an beiden Orten dieselbe 3D-Ansicht; vorher unter Fahren keine Brille, 2026-10-08), in der Brille A weiter, B anhalten, X und Y Tempo der Probefahrt, im Führerstand das Pult; länger der Ausschnitt von 30 km ohne Brille; in der Brille der Modellbahn setzt Thumbstick drücken in den Führerstand (Michael,
             2026-10-12: «im Führerstand sitzen und sich mit dem Kopf wirklich drehen»): die Welt in Originalgrösse um den Kopf, das Auge
             im Zug dort, wo der Kopf beim Einsteigen war, die Welt dreht mit dem Gleis, der Kopf frei; Zug etwa 3 m breit, Schilder 5 m,
             Zeichen ein Zehntel, Sicht 40 km, Tragen und Thumbstick ruhen (kabine, KABINE_* in Relief.tsx); dort ein ganzer Führerraum um das Pult (Fuehrerpult.raum, nur in der Brille; Michael, 2026-10-13): Boden, Seitenwände mit grossem offenem Seitenfenster (1,45 × 2 m, Michael, 2026-10-13: «viel grösser»), Decke, Rückwand mit Tür (nicht zu öffnen), Stuhl, Masse geschätzt; das Auge 15 cm höher über dem Pult als auf dem Bildschirm (KABINE_HOEHER_M); war «Führerstand» auf dem
             Bildschirm gewählt, beginnt die Brille dort; geprüft mit dem Emulator IWER (Meta), nicht auf einer Quest; im Führerstand ein Pult (komponenten/Fuehrerpult.ts, Michael, 2026-10-12, nach seinem Referenzbild,
             ohne Markenzeichen; alle Kästen mit gerundeten Kanten bis 3,5 cm und die Bildschirme mit runden Ecken, rund(), Michael, 2026-10-13: «alles ziemlich kantig»): Fensterrahmen mit zwei Wischern (A-Säulen dunkelgrau wie das Pult, flache Bänder, oben breiter und zum Fahrer hin ins Dach gebogen; Michael, 2026-10-13), drei Anzeigen (Strecke: Start, Ziel, gefahren, noch, gemessen entlang der
             gezeichneten Strecke; Tacho 0 bis 220 km/h mit Herkunft SIMULATION, GPS oder PROBEFAHRT, daneben die Vorschau: Pfeil, Entfernung, Zeichen und Name des
             Nächsten voraus; Voraus: die nächsten drei Bahnhöfe, Tunnel und Brücken mit Entfernung auf einer Linie durch ihre Zeichen
             (vorListe, Michael, 2026-10-13, nach seinem Vorbild), Namen aus den Daten, sonst «ohne Namen»), Hebel Bremse (0, B, SB) und Geschwindigkeitswahl
             (0 bis 220 in Zehnern, PULT_HOECHST_KMH; vorher 160, Michael, 2026-10-13), beide Skalen rechts neben dem Hebel, Tasten Schnellbremse (nochmals drücken löst sie, «Zug fahren» löst jede Bremse und fährt wieder mit der Wahl von vorher, «Anhalten» bremst auf 0; Michael, 2026-10-13: «wieder fahren können»), Zuggeräusch, Signalhorn (gerechnet, signalhorn in src/audio.ts), Stirnlicht
             (SpotLight, Stärke 0 statt unsichtbar; Zeichen: Scheinwerfer mit schrägen Strahlen wie das Abblendlicht im Auto, scheinwerfer; Michael, 2026-10-14), Pultlicht (Zeichen: Leuchte über dem Pult, pultleuchte; Michael, 2026-10-14), Wischer, Dämmerung (N; Michael, 2026-10-13: gemalter Abendhimmel, Licht von Himmel und
             Sonne auf 30 und 25 %, Sonne rötlich, DAEMMERUNG_* in Relief.tsx, eine Stimmung, keine Tageszeit); im Tunnel und in der Dämmerung leuchten
             die Zeichen der Tasten warm, das Pult ist dann dunkel (Tageslicht im Pult auf 12 %, Pultlicht auf 8 %), damit sie und die Anzeigen hervorstechen (Fuehrerpult.nacht, Michael, 2026-10-13); davor eine zweite, kleinere Reihe (Michael, 2026-10-14: «alle Knöpfe als reale Knöpfe im Führerraum»): Hinter den Zug, Zum Start (S; Michael, 2026-10-15: «das Abfahren beim Start Bahnhof … erleben»: der Zug steht wieder am Startbahnhof, die Probefahrt angehalten, die Modellbahn wartet auf das Pult; wer in den ersten 10 km in den Führerstand wechselt, kommt ebenso dorthin, START_NAH_M; angehalten zeigt der Tacho 0), Höhe wie echt und Höhe 2-fach (flacher und hoher Berg), Tunnel, Brücken, Bahnhöfe und beim Fahren Bahnübergänge melden (beim Fahren dessen Einstellungen, sonst nur die Anzeige Voraus); Tasten mit Zustand haben vorne einen grünen Leuchtstreifen; in der Probefahrt wählt der rechte Hebel die Stufe des Zeitraffers (Skala mit deren Tempi), die Bremse hält an, gelöst fährt der Zug weiter (PultAussen in Fuehrerpult.ts), vor dem Start steht der Zug am Anfang; Hover hebt hervor und nennt den Namen, Klick, Tastatur (Pfeile, B, 0,
             Leertaste, H, L, P, W, T) und in der Brille Strahl und Abzug, dort A, B Tempo, X, Y Bremse; in der Modellbahn fährt der Zug im
             Führerstand nach dem Pult (Fuehrerpult.schritt: 3 m/s² anfahren, 1,5 ausrollen, 3 bremsen, 6 Schnellbremse, Annahmen ohne
             Quelle, viel schneller als ein Zug; vorher 0,5, 0,3, 0,8 und 1,4, Michael, 2026-10-14: «wesentlich schneller», hält vor dem Ende), beim Fahren zeigt der Tacho das Tempo aus dem Fahrtmodus (GPS oder Probefahrt mal Zeitraffer) und die
             Hebel sind gesperrt; auf dem Bildschirm in einer eigenen Szene über der Landschaft (zweiter Durchgang; Landschaft und Pult je mit eigenem Ausschnitt, fuehrerstandBild: das Pult füllt die Breite mit beiden Hebeln, quer höchstens 45 % der Höhe, unten am Rand; hoch von schräg oben, 24° um seine Mitte gedreht und 1,3-mal so weit weg, so etwa doppelt so hoch und weniger verzogen (Michael, 2026-10-14: «viel zu extrem verzogen … darf doch circa doppelt so hoch sein»), der Fensterrahmen dabei mit eigener, gerader Kamera (rahmenKamera, Ebene 3) bis an den Bildrand gestreckt, auf dem Bildschirm ohne Dachplatte; über den Anzeigen eine Abdeckung 20 cm hoch mit den Tasten Sicht links, Schliessen (nur im Vollbild), Sicht rechts (Pfeile links und rechts); die Landschaft waagrecht etwa 80° quer und 70° hoch, der Horizont in der Mitte des Fensters über dem Pult, hoch bei 55 %; Michael, 2026-10-14: «In beiden Formaten soll die Sicht auf die Strecke möglichst attraktiv sein»; Hebel links und rechts der Tastenreihe, Tasten 12 cm, näher; Michael, 2026-10-14: «auf dem Mobile sieht man die Hebel nicht»,
             2 cm tiefer und 25 cm weiter weg als in der Brille, PULT_BILD_*; Tasten gross auf einer Leiste, Michael, 2026-10-13: «klein und weit weg»; neben den Anzeigen nur die Pultbeleuchtung, keine doppelten Schalter), in der Brille in Originalgrösse vor dem Kopf; die Angaben unter dem Bild klappen auf («Modell, nicht massstäblich: Quellen und Grenzen»), Tunnel ohne Länge zeigt 3D nicht (früher eine graue Kugel; Michael, 2026-10-10). Im Vollbild im Führerstand (Fahren und Modellbahn) nur das Bild über den ganzen Bildschirm, hoch wie quer, ohne Knöpfe darüber, alles als Tasten am Pult, auch Sicht links, Schliessen und Sicht rechts (Michael, 2026-10-14: «nicht als zweidimensionale Steuerknöpfe, sondern visuell dreidimensional»; der Blick dreht je 45°, höchstens 135°, seitenblickDrehen), beim Fahren die Ankunft darüber (Michael, 2026-10-14: «ein echtes Vollformat», «Oben nur wenige»). Sonst im Vollbild alle Knöpfe oben (unten legt Android seinen Hinweis zum Beenden darüber), «Schliessen» beschriftet, die Zurück-Taste schliesst es (useEchtesVollbild, eigener Eintrag im Verlauf; Michael, 2026-10-11); im Führerstand Namen erst 1 km vor dem Ort (SCHILD_FUEHRERSTAND_KM); Bahnhöfe dort ohne Mast und Fahne, statt dessen eine Ortstafel rechts der Linie in ihrer Richtung (Michael, 2026-10-14: «in Bodennähe und so dass man es beim Vorbeifahren gut lesen kann», «immer nur eine Ortstafel»): dunkelgraue Tafel 9 × 1,8 m mit dem Namen in Weiss auf beiden Seiten, 7,5 m neben der Linie, Unterkante 1,8 m über ihr, auf zwei Pfosten, 35° zum Gleis gedreht (TAFEL_* in Relief.tsx; Lage, Grösse und Gestalt in keiner Quelle, die Stelle ist die des Bahnhofs in den Daten); der Verlauf im Führerstand geglättet nach dem Radius (glatt, siehe data/scharf; vorher über 80 m gemittelt, das schnitt die Kurven um 5 bis 10 m, Michael, 2026-10-14). Das feine Gelände lädt einen Ausschnitt nach dem andern, ein neuer bricht den laufenden nicht ab (feinLaedt), Gebäude und Bäume die nahen zuerst und alle gleich angefragt (nachNaehe), die Bilder der scharfen Kacheln bleiben über den Neubau hinweg (scharfBilder; Michael, 2026-10-16: ab Wankdorf keine Gebäude, «sehr verschwommen»: jeder Ausschnitt brach den alten ab und warf die Bilder weg, beim schnellen Fahren kam nichts an); in der zweiten Reihe des Pults Höhe nur, wo sie sich ändern lässt, «Hinter den Zug» nicht in der Brille (zweiteLegen; Michael, 2026-10-16: «wenn das nicht geht, kannst du den Knopf entfernen»). Hintergrund aller 3D-Ansichten ein gemalter Himmel (himmel in Relief.tsx): oben blau, zum Horizont heller und dunstig, als Rundum-Bild, im Dunkelmodus dunkelblau (Michael, 2026-10-11: «hellblauen natürlichen Himmel»).
             Spiel «Modellbahn» unter Spiele (2026-10-08 kurz «Modellbahn VR») (komponenten/Modellbahn.tsx, #/modellbahn, für alle, die Brille nur mit WebXR):
             auf der Seite Modellbahn der Kasten «Modellbahn: ein Modell zum Anschauen, kein Abbild der Wirklichkeit»
             (komponenten/ModellHinweis.tsx), unten nach den Strecken (man liest ihn nicht jedes Mal), unter jedem Modell nur ein Satz mit Link «Was nicht stimmt» dorthin; Zug fährt in allen 3D-Ansichten in 2 s an und bremst am Ziel in 2 s ab (ANFAHREN_S in Relief.tsx, ANFAHREN_MS in Fahrtmodus.tsx); eine gemerkte Probefahrt (&fest=1) hat «Start → Ziel» als Titel und zeigt Start, Ziel, Über und ihre Linien nur zum Lesen, ohne Felder zum Ändern;
             unter jedem Modell und im Vollbild hinter «Ein- und ausblenden» die Schalter Gipfel, Kultur, Seilbahnen, Gebiete, Luftbild
             und Km-Netz, bei Probefahrten und eigener Strecke dazu «Tunnel melden» und «Brücken melden» (SehenswertLegende mit bauwerke):
             Tunnel und Brücken sind immer gezeichnet, die Schalter steuern nur die Vorankündigung unten im Modell, «Tunnel … in 400 m»,
             10 s im gefahrenen Tempo vorher, mindestens 200 m, Brücken wie beim Fahren ab 3 Baueinheiten (Vorankuendigung in Relief.tsx;
             Michael, 2026-10-12); der Zug im Tunnel mit Deckkraft 0,28 (vorher 0,35); das Modell auf der Seite
             ab 600 px Breite quer, auch nach dem Vollbild (bildHoehe);
             die Linie dunkelgrau mit Rand wie in 3D beim Fahren (FARBEN.weg), in der Brille ein flaches Band statt einer Röhre,
             auf dem der Zug fährt (eine Röhre schluckte ihn aus der Nähe), Tunnel darin gestrichelt mit 12 mm Strich und 8 mm Lücke auf
             dem Tisch wie die Striche auf dem Bildschirm aus der Nähe (BRILLE_STRICH_M),
             «Höhe wie echt / 2-fach» unter der Karte (Michael, 2026-10-10: «damit man von der Karte mehr sieht»), rechts oben in der Karte ein Knopf fürs Vollbild (ModellKarte): die Karte füllt den Bildschirm, wo der Browser es kann auch ohne seine Leisten (useEchtesVollbild in Netzkarte.tsx, gilt auch für die Karte beim Fahren), darin Höhe, Zuggeräusch, Zug fahren, Anhalten, Führerstand und Tempo, Namen so gross wie daneben; darunter «Zug fahren» und «Anhalten» auf dem Bildschirm, das Tempo «2.5 Min.» über die ganze Strecke oder 1×, 2×, 4×, 8×, 16×, 32× von 100 km/h (MODELL_TEMPI, 16× und 32× seit 2026-10-12; das wirkliche Tempo einer Strecke steht in keiner Quelle; Michael, 2026-10-10), bei der Probefahrt 1×, 2×, 4×, 8×, 20×, 50×, 200× (ZEITRAFFER in Fahrtmodus.tsx), in 3D nur bis 8× = 800 km/h, schneller kamen feines Gelände und scharfe Bilder nicht nach, beim Wechsel in 3D fährt sie so schnell weiter (ZEITRAFFER_3D_HOECHST; Michael, 2026-10-14: «tempo drosseln und 2000 nicht mehr anbieten»), das Zuggeräusch und «Mit VR-Brille» (immer rot; ohne WebXR
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
data/schweiz3d/  Übersicht für das Spiel «3D Schweiz» (Michael, 2026-10-18): die Geländekacheln auf 500 m gemittelt (hoehen.hgz,
             UInt16, nicht .gz, das liefert ein Server als gepackt aus) und das Luftbild auf 100 m (luftbild.jpg), 1,8 MB
             (pipeline/build_schweiz3d.py, nach build_gelaende und build_luftbild); in der App komponenten/Schweiz3D.tsx (#/schweiz3d):
             vier Stufen, die Schweiz, darin ein Feld von 20 km (Gelände 50 m, Luftbild 10 m), darin eines von
             4 km (feines Gelände und Nahbild, wo es sie gibt, sonst wie die Region, mit Hinweis), darin eines von 1 km im 5-m-Raster
             (Michael, 2026-10-19: «noch eine Ausschnittsgrösse mehr im Detail»; nahLaden: die scharfe Umgebung, Gelände 2 m und Luftbild
             25 cm, wo es sie gibt, bis 200 m neben den Bahnlinien, sonst wie das Feld darüber, mit Hinweis); gewählt wird ein Quadrat, keine
             Region und kein Tal (deren Grenzen stehen in keiner Quelle), die Karte zum Feld nennt Orte der Landeskarte, den höchsten
             Gipfel, Seen und den Kanton der Mitte; «Überrasch mich» wählt das Feld um einen zufälligen Gipfel; jede Stufe steht auf einem Sockel (Michael, 2026-10-19: «auf einem Holzsockel … wie ein Deko-Element»; vorher liefen die Ränder ins Leere; danach statt Holz «eine schwarze Wand, die sich aber dennoch schattieren lässt», «etwas höher»): rundum eine fast schwarze, matte Wand von der Kante des Geländes bis 6 % der Breite unter den tiefsten Punkt, darunter eine Platte, 2,5 % dick und 1,2 % breiter (SOCKEL_* in Schweiz3D.tsx; je Seite ein eigener Grauton, damit man die Seiten gut unterscheidet), nicht aus einer Quelle; die Sonne hoch im Süden, leicht nach Westen (Michael, 2026-10-19: «ungefähr der realen Sonneneinstrahlung»; ein Sonnenstand, keine Uhrzeit); die Kamera beginnt schräg von Südwesten mit Blick nach Nordosten, so weit weg, dass der ganze Block ins Bild passt; mit der Brille (WebXR)
             steht das Modell 1,2 m breit auf dem Tisch, die Sitzung bleibt beim Eintauchen, ein kurzer Abzug wählt mit dem Strahl, nochmals
             Abzug im Feld taucht ein; wie in der Modellbahn trägt ein gehaltener Abzug (ab 3 cm oder 0,4 s) das Modell, beide skalieren
             (0,25- bis 8-fach) und drehen es (Michael, 2026-10-21: «gepackt und gedreht … Gleich oder ähnlich wie in Taktland»), Greiftaste
             eine Stufe zurück, Thumbstick dreht und hebt, drücken stellt es zurück, eine Tafel nennt das Feld; beim Betreten eine Tafel mit den Tasten und rotem Knopf
             «Schliessen» (Strahl und Abzug oder A), sie bleibt bis dahin, vorher gilt kein anderer Abzug (Michael, 2026-10-21); alle Stufen in echter Höhe,
             ohne Überhöhung (Michael, 2026-10-21: «Keine mehrfachen Erhöhungen mehr»; vorher Schweiz 3-fach, sonst wählbar 2-fach);
             geprüft mit dem Emulator IWER, nicht auf einer Quest; Details der ganzen Schweiz auf daten.taktland.ch (Michael,
             2026-10-19: «Lade noch mehr Detailkarten für Schweiz 3D»): je Kilometer Luftbild auf 2,5 m und Gelände auf 10 m wie
             Nahbild und feines Gelände, aber ohne weissen Rand (pipeline/build_schweiz3d_details.py nach data/schweiz3d_extern, nicht
             in Git, etwa 2,3 GB, 4,5 MB je 10-km-Kachel), gebaut vom Workflow «3D Schweiz Details» (.github/workflows/schweiz3d.yml,
             von Hand, acht Teile, je etwa 30 Minuten), Pakete mit scharf_pakete.py --art schweiz3d im Release «schweiz3d-1», geholt
             von holen.php (HOLEN = 'schweiz3d-1') nach schweiz3d/; die App (schweiz3dLaden in src/gelaende.ts) nimmt sie in der
             Region fürs Bild (so viele Bildpunkte, wie die Leinwand fasst) und im Feld vor allem anderen, fehlt der Index dort,
             bleibt es bei den Daten entlang der Bahnlinien; für die Stufe 1 km dasselbe noch feiner (Michael, 2026-10-19: «die ganze Schweiz in
             diesem Detailgrad», «nimm mal 50cm»): je Kilometer Luftbild auf 50 cm (2000 × 2000, aus der Fassung 10 cm) und Gelände auf
             5 m (200 × 200), build_schweiz3d_details.py --fein nach data/schweiz3dfein_extern (nicht in Git, etwa 34 GB, 67 MB je
             10-km-Kachel, 45 s), Workflow «3D Schweiz fein» (.github/workflows/schweiz3dfein.yml, 16 Teile), Release «schweiz3dfein-1»,
             holen.php (HOLEN = 'schweiz3dfein-1') nach schweiz3dfein/; in nahLaden die scharfe Umgebung zuerst, dann diese, dann das Feld;
             Höhenscheiben (Michael, 2026-10-20): auf 1'000, 2'000, 3'000 und 4'000 m (rot, gelb, grün, blau, Farben gewählt) je eine
             durchsichtige Scheibe über das ganze Modell, eine feine Linie in den Wänden und dieselbe Höhe als halb durchsichtige Linie auf dem
             Gelände (Marching Squares je Stück; Michael, 2026-10-21: «So sieht man die Grenzen besser»), beide 1,6 Bildpunkte breit, beim
             Zoomen gleich (LineMaterial, HOEHEN_LINIE_PX), nur zwischen tiefstem und höchstem Punkt, Schalter
             «Höhen 1'000 m» (HOEHEN_STUFEN); + und − in Kreisen in der Mitte jeder Wand (nur an den Wänden zur Kamera) setzen in den Stufen
             20 km, 4 km und 1 km an dieser Seite eine Reihe Stücke an oder nehmen sie weg (Bestand: je Stück ein eigenes Gelände mit Bild,
             der Sockel um alle), höchstens 3 je Richtung und 9 im Ganzen, auf dem Handy 4 (JE_RICHTUNG, hoechstens(); eine Annahme zum
             Speicher der Grafik, nicht gemessen), ist die Grenze erreicht, ist der Knopf grau und ein Tipp erklärt warum; was darunter fehlt,
             ergänzt eine Region um das Stück (unterFuer)
             Sonne und Schatten (Michael, 2026-10-21: «Sonnen und Schattenzeiten einbauen. Realistisch. Zeit und Datum auf dem Mobile und
             Brille wählbar»): Schalter «Sonne und Schatten», Datum und Uhrzeit (Schweizer Zeit, je 15 Minuten, «Jetzt»), am Anfang heute
             12 Uhr; der Sonnenstand über der Mitte des Modells gerechnet (src/sonne.ts, Näherung des Astronomical Almanac, ohne Brechung),
             die Sonne gehört zum Modell (dreht mit in der Brille), Schatten mit der Schattenkarte von three.js (4096, auf dem Handy 2048),
             Gelände, Gebäude und Bäume werfen Schatten, Berge ausserhalb des Modells nicht; unter dem Horizont nur Himmelslicht, tief am
             Himmel wärmer (Stimmung, kein gemessenes Licht); in der Brille alle Schalter an den Wänden des Modells, auf allen vier Seiten
             (Michael, 2026-10-22: «die Steuerelemente an den Wänden der Modelle … so wie Schalter», vorher Tafeln vor der Nase): flach im
             Band unter dem tiefsten Punkt, links der Knöpfe + und − Höhen, Wanderwege (ab 20 km), Gebäude und Bäume (wo es sie gibt), rechts
             Sonne und, wenn sie an ist, Datum und Uhrzeit mit −1 h, +1 h, −1 Mon., +1 Mon., Jetzt (Strahl und Abzug); als Knöpfe einer Steuerung
             (Michael, 2026-10-22: «wie richtige … physische Knöpfe»): aus dunkel und 1,1 % der Breite vorstehend, an 0,3 % eingedrückt und
             leuchtend mit Schein auf der Wand, Gelände gelb, Gebäude und Bäume grün, Sonne rot (KNOPF_*, LICHT), die Zeit als flache Anzeige;
             jeder Druck klickt wie ein rastender Druckknopf, gerechnet (knopfTon in src/audio.ts; Michael, 2026-10-22: «passend und absolut
             authentisch»); Schalter «Orte» für die Ortschaften, am Anfang aus; Höhenlinien und Orte blenden sich in 2,5 s von vorne
             (zum Betrachter) nach hinten ein und genau rückwärts aus, eine Ebene quer zum Blick schneidet ab (VERLAUF_S, verlaufSetzen),
             dazu ein Rauschen mit vielen kleinen Ticks, steigend beim Ein-, fallend beim Ausblenden (verlaufTon); Klang und Dauer gewählt; in der Brille
             ohne die durchsichtigen Höhenscheiben (nur ihre Linien) und Bäume ohne eigenen Schatten (Michael, 2026-10-22: Höhen und Bäume
             zusammen «etwas zu viel»; in verlaufSetzen); an kürzeren Wänden kleiner; nur die Wände zur Brille; Grösse und Farben gewählt (Schalter-Effekt in
             Schweiz3D.tsx); alle Schalter am Anfang aus, auch Höhen und Sonne (Michael, 2026-10-22: «Alles defaultmässig ausgeschaltet»)
data/schweiz3d/orte.json  Ortschaften für «3D Schweiz» (Michael, 2026-10-21: «wie wir das bei Taktland schon haben»): alle Ortschaften
             und Weiler aus swissTLMRegio mit Rang nach der Objektart (build_schweiz3d.py, 18'096 Orte); in der App wie die Bahnhöfe der
             Modellbahn ein dünner dunkelgrauer Mast (2 Bildpunkte) mit eckigem dunkelgrauem Schild mittig darauf, Name in Weiss, je Stufe ab einem Rang und höchstens
             so viele, mit Abstand zueinander (ORT_* in Schweiz3D.tsx; in der ganzen Schweiz nur Orte in der Schweiz)
data/schweiz3d_probe/  Gebäude und Bäume für «3D Schweiz» in zwei Probeausschnitten (Michael, 2026-10-20: «Köniz und Gantrisch»):
             alles in 6 × 6 km um Köniz und 8 × 8 km um den Gantrisch, nicht nur neben der Bahn, Formate wie data/gebaeude und data/baeume,
             Farben aus SWISSIMAGE 2 m (pipeline/build_schweiz3d_probe.py, 14'864 Gebäude, etwa 630'000 Bäume, etwa 11 MB); in der App in den Stufen
             4 km und 1 km, Schalter «Gebäude» und «Bäume» je für sich nur dort, am Anfang aus (Michael, 2026-10-22: «defaultmässig keine Bäume und keine Gebäude», «separate Schalter»), in der Brille an den Wänden (probeLaden in src/gelaende.ts); die ganze Schweiz siehe
             data/schweiz3dumwelt_extern
data/schweiz3dumwelt_extern/  Gebäude und Bäume der ganzen Schweiz für «3D Schweiz» und 3dland.ch auf daten.taktland.ch, nicht in Git
             (Michael, 2026-10-21: «Bäume und Gebäude für 3DLand»): wie die Probeausschnitte alles, nicht nur neben der Bahn,
             pipeline/build_schweiz3d_umwelt.py --art gebaeude|baeume --teil k/n in Streifen der 10-km-Spalten von West nach Ost
             (jede Kachel genau einem Streifen), Dächer aus SWISSIMAGE 2 m über das Netz, Kronen aus data/luftbild (10 m); Workflow
             «3D Schweiz Gebäude und Bäume» (.github/workflows/schweiz3dumwelt.yml, von Hand, Gebäude 18 Streifen, Bäume 9),
             Release «schweiz3dumwelt-1», holen.php (HOLEN = 'schweiz3dumwelt-1') nach schweiz3dumwelt/gebaeude/ und /baeume/;
             die App (probeLaden, probeDa, umweltGanz in src/gelaende.ts) nimmt diese vor den Probeausschnitten; in einem Modell
             höchstens 1,2 Millionen gezeichnete Waldbäume, auf dem Handy 300'000, in der Brille 50'000 (Michael, 2026-10-22: nach dem Eintauchen ins Feld von 4 km stand die Brille, das letzte Bild drehte mit dem Kopf), darüber wird der Wald lichter, Einzelbäume bleiben
             (BAUM_HOECHSTENS in Schweiz3D.tsx; eine Annahme zur Grafik, nicht gemessen); ihre Programme der Grafik übersetzt compileAsync, bevor sie erscheinen, und die Materialien einer Stufe werden erst 4 s nach dem Wechsel weggeräumt, damit die nächste die übersetzten Programme weiter nutzt (spaeterWeg; sonst stand die Seite beim Eintauchen Sekunden still); das Bild des Felds von 4 km hat 2048 Bildpunkte (etwa 2 m, die Daten 2,5 m; vorher 4096), das von 1 km in der Brille 2048 statt 4096, die Schattenkarte dort 2048 (BRILLE_SCHATTEN_PX); verliert die Grafik ihren Zustand (webglcontextlost), endet die Sitzung und die Seite sagt es (Michael, 2026-10-22: beim zweiten Eintauchen drehte die Landschaft mit dem Kopf, auch ohne Bäume)
data/wanderwege/  Wanderwege für «3D Schweiz» (Michael, 2026-10-21: «alle Wanderwege der Schweiz»): swissTLM3D (swisstopo), Ebene
             Strasse, jedes Stück mit WANDERWEGE Wanderweg, Bergwanderweg oder Alpinwanderweg, ohne Stücke in Tunneln, nur die Lage, nach
             Douglas-Peucker auf 2 m vereinfacht, je 10-km-Kachel eine .wwg (pipeline/build_wanderwege.py, 408'970 Stücke, 9,3 MB); in der
             App ab der Stufe 20 km, auf das Gelände des Modells gelegt und so dicht wie sein Raster unterteilt, gelb, rot und blau mit
             weissem Rand in Bildpunkten (Farben nach den Wegweisern gewählt, WANDER_FARBEN in Schweiz3D.tsx), Schalter «Wanderwege», am Anfang aus
             (Michael, 2026-10-21); in der Brille ein Schalter an den Wänden
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
data/scharf/   scharfe Umgebung, ein Versuch nur auf Müntschemier–Bern, Bern–Biel/Bienne, Biel/Bienne–Neuchâtel und Neuchâtel–Buttes (Michael, 2026-10-11): SWISSIMAGE
             10 cm auf 25 cm (JPEG 1000 × 1000) und swissALTI3D 2 m (126 × 126 Punkte, .hgz mit UInt16 über der tiefsten
             Höhe, 65535 ausserhalb), je Kachel von 250 m, nur 200 m neben den Bahnlinien aus swissTLMRegio, die höchstens
             700 m neben dem Zug durch die Orte einer Strecke liegen (STRECKEN in pipeline/build_scharf.py, 1'499 Kacheln, 201 MB); im Führerstand ein Netz je Kachel, eigenes Bild
             nur bis 800 m um einen Punkt 400 m voraus, mit dem Tempo weiter voraus, 4 s Fahrt, höchstens 1,6 km mehr (SCHARF_BILD_M, SCHARF_VORAUS_S in Relief.tsx; Michael, 2026-10-14: bei 2'000 km/h fuhr der Zug durch die Kacheln, bevor ihre Bilder da waren), sonst die Leinwand des feinen
             Geländes, das darunter 5 m sinkt; nur mit Luftbild; im Führerstand der Verlauf alle 5 m geglättet, mit einer Glockenkurve so breit, dass eine Kurve höchstens 0,5 m nach innen rückt
             (σ = √(2·R·0,5 m), 6 bis 35 m, an den Enden gespiegelt, glatt und glattBei in src/gleisweg.ts, GLATT_*; Michael, 2026-10-16, Bern–Zürich: «Kurvenelemente … die es sicher nicht braucht … eckig»; vorher Douglas-Peucker und Catmull-Rom durch jeden Punkt, das gab zwischen Bern und Zollikofen 71 Stellen mit Radien unter 150 m), Höhe der Linie einmal je feinem Gelände gerechnet (profilRechnen): Gelände unter der Linie ohne Brücken und
             Tunnel (swissALTI3D zeigt dort Talgrund oder Berg), Median über 50 m davor und danach gegen Unterführungen und Gräben, dann
             Mittel über 150 m (vorher 40 m; Michael, 2026-10-15: Münchenbuchsee–Schüpfen schlängelte, die Linie liegt einen bis zwei Meter neben
             dem Gleis und mass Damm und Einschnitt), zuletzt über 30 m (PROFIL_MEDIAN_M …; Michael, 2026-10-11: «kleine Unebenheiten»), Täler und Buckel ohne Brücke oder Tunnel in den Daten (schmaler als 1,5 km, mehr als 6 m tief, irgendwo steiler als 8 %) gerade über- oder unterquert, ohne Bauwerk zu zeichnen (TAL_FENSTER_M …; Lorrainebrücke in Bern, deren Länge in keiner Quelle steht), 150 m vor und nach einem Tunnel eine Gerade, die Linie nie darüber (TUNNEL_ANLAUF_M), wo es die Höhe der Gleise aus data/gleishoehe gibt, gilt sie (1 m darüber) statt all dessen; ein Ende
             ausserhalb des feinen Geländes mit der groben Höhe, verschoben um den Unterschied am anderen Ende, Tunnel und Brücken für die Höhe immer alle, auch wenn ihre Zeichen
             ausgeschaltet sind (wegDerFahrt), Blick in Richtung des Gleises unter dem Auge, geneigt zur Linie 300 m voraus, Brücken als schlichte Platte ohne Pfeiler (Pfeiler in keiner
             Quelle; Michael, 2026-10-11: «Aufbau von Brücken, damit die Strecke … flach darüber führt»), so breit wie die Gleise darauf laut
             data/bahnbruecken.json, 3,5 m über die äussersten hinaus, die anderen Gleise als Schienen darauf, je Gleis ein fester Abstand
             über die ganze Brücke (Median; Michael, 2026-10-15: «parallel zueinander»), die Platte gleich breit (brueckeQuer; Michael, 2026-10-15:
             «gemäß der Anzahl Gleise»; Rand und Gleisabstand 4,5 m in keiner Quelle); Bahn- und Strassenbrücken mit gemalter Oberfläche
             (brueckenBild: Beton mit Körnung und Schalungsfugen, Schotter zwischen zwei Randbalken, Belag) und von Hand gesetzter Ambient
             Occlusion (dunkler in Ecken und unten; Michael, 2026-10-15: «ein bisschen Körnung, ein bisschen Ambient Occlusion»), in keiner Quelle; unter jeder gezeichneten Bahn- und Strassenbrücke ist das
             Luftbild (Nahbild und scharf) retuschiert: quer zur Brücke zwischen den Rändern aufgefüllt, je Rand über 16 m gemittelt, 2,5 m
             breiter als die Brücke, darauf die Körnung des Bodens daneben, je Block von 2 m von einer zufälligen Stelle der nahen Seite, nur die
             Helligkeit weniger ihr Mittel, begrenzt auf ±22 (Michael, 2026-10-15: «inhaltsbasiertes Auffüllen») (retuschieren; Michael, 2026-10-15: «wegzuretuschieren»; keine KI, nicht aus einer Quelle; gespiegelt
             erfand es Häuser)
data/gebaeude/  Gebäude, ein Versuch, zuerst auf Gümmenen–Bern (Michael, 2026-10-13): swissBUILDINGS3D 3.0 (swisstopo, CityGML je Kartenblatt,
             der neueste Jahrgang), Dach- und Wandflächen in Dreiecke zerlegt (mapbox_earcut), nur Gebäude mit ihrer Mitte bis 400 m neben
             den Bahnlinien, Dächer in der Farbe des Nahbilds (SWISSIMAGE 2,5 m), Wände grau (in keiner Quelle), unten 2 m verlängert; Wände und Dächer mit gemalter Körnung, Wände am Boden und unter dem Dach dunkler (Ambient Occlusion von Hand, src/gebaeudeBild.ts; Michael, 2026-10-22: «etwas Körnung und Schattierung»; in keiner Quelle, auch in «3D Schweiz»);
             je 500 m eine .bgz (pipeline/build_gebaeude.py, 23'732 Gebäude, 10,5 MB; seit 2026-10-13 alle Strecken der scharfen Umgebung von Müntschemier über Bern und Biel/Bienne bis Neuchâtel); in der App nur im Führerstand, mit dem feinen
             Gelände geladen (gebaeudeSetzen in Relief.tsx, gebaeudeKachel in src/gelaende.ts)
data/baeume/  Bäume und Wald, ein Versuch auf denselben Strecken (Michael, 2026-10-13: «zuerst ohne gemessene Baumhöhen»): swissTLM3D
             (swisstopo), Einzelbäume wo die Quelle sie hat, Waldflächen (Wald, Wald offen, Gebüschwald, Gehölzfläche) mit gezeichneten
             Bäumen gefüllt (Abstand je Art, DICHTE, in keiner Quelle), Kronenfarbe aus dem Nahbild; je 500 m eine .bmd (gzip; nicht .tgz,
             das liefert ein Apache oft als gepackt aus), pipeline/build_baeume.py, 201'787 Bäume, 1,4 MB; in der App nur im Führerstand
             ein InstancedMesh je Kachel, Krone und Stamm, Höhe und Breite je Art in keiner Quelle (BAUM_FORM in Relief.tsx, 4 bis 20 m,
             je Baum ±25 %), der Fuss auf dem scharfen oder feinen Gelände; keine Krone näher als 5 m an der gezeichneten Strecke
             (Lichtraum fürs Bild, in keiner Quelle, BAUM_LICHTRAUM_M; Michael, 2026-10-14: «Teilweise liegen Bäume auf der Strecke»)
data/gleishoehe/  Höhe der Gleise: alle Gleisachsen aus swissTLM3D (TLM_EISENBAHN, PolyLineZ, ohne Standseilbahnen) alle 20 m, je Stück
             ob laut KUNSTBAUTE im Tunnel (Zahl der Punkte negativ; die App macht daraus Tunnel ab 50 m, wo der Weg keinen kennt, nur fürs Bild,
             mitGleisTunneln), in
             Kacheln von 10 km (pipeline/build_gleishoehe.py, 340 Kacheln, 4,3 MB); die App sucht alle 10 m die Achse höchstens 25 m neben ihrem
             Weg, höchstens 45° schräg; welches Gleis, entscheidet eine Folge über den ganzen Weg (Viterbi): nah am Weg, wenig Sprung quer, teuer
             nur steiler als 8 % (GLEIS_STEIL; Michael, 2026-10-16, St. Gallen–Gossau: das flache Bündel neben der fallenden Hauptlinie gab
             «eine kleine Achterbahn», 8 m auf 100 m; Kehrtunnel übereinander bleiben getrennt), Lücken bis 1,5 km gerade, über 30 m
             gemittelt (gleisHoehenLaden in Relief.tsx); gilt für die Linie in 3D und im Führerstand, auch in Tunneln und auf Brücken; sonst wie früher aus dem Gelände;
             im Führerstand rastet die Linie auch seitlich auf die Achse ein (Abstand über 50 m gemittelt, dasselbe Gleis wie für die Höhe, an Lücken über 200 m auslaufend, pkGleis; Michael, 2026-10-15, BTI: bis 19 m «neben der Realität»), Suche bis 25 m
data/bahnbruecken.json  Gleisachsen auf Brücken aus swissTLM3D (TLM_EISENBAHN, KUNSTBAUTE Brücke), je Gleis eine Achse, dazu
             ANZAHL_SPUREN wo genannt (pipeline/build_bahnbruecken.py, 6'708 Achsen, 421 KB); für die Breite der Bahnbrücken im Führerstand; die eigene Linie gilt als
             die nächste Achse (näher als 4,5 m), die anderen rücken um denselben Versatz mit; Achsen an weniger als einem Viertel der
             Messstellen (kurze Weichenstücke) zählen nicht (GLEIS_BEGLEITET in Relief.tsx; Michael, 2026-10-21, Lorraineviadukt: «Realität
             hat nur 4 Spuren», gezeichnet waren 6)
data/strassenbruecken.json  Strassen- und Wegbrücken über der Bahn aus swissTLM3D (TLM_STRASSE mit Höhe, KUNSTBAUTE Brücke): nur
             Stücke, die eine Gleisachse aus TLM_EISENBAHN kreuzen und dort mindestens 3 m über ihr liegen (pipeline/build_strassenbruecken.py,
             1'858 Brücken, 257 KB; Michael, 2026-10-15: «Ist es möglich, eine Autobrücke zu konstruieren?»); in der App nur im Führerstand,
             mit dem feinen Gelände gesetzt (strassenSetzen in Relief.tsx): Verlauf und Höhe der Strassenachse aus der Quelle, die Breite
             aus dem Namen der Klasse («4m Strasse»), sonst eine Annahme (STRASSE_BREITE_ANNAHME: Autobahn 12 m je Fahrbahn …), als Trog
             mit Platte 1 m dick und Brüstungen 1 m hoch, Beton mit Belag, Masse und Gestalt in keiner Quelle
data/gebaeude_extern/, data/baeume_extern/  Gebäude und Bäume je Kanton für daten.taktland.ch, nicht in Git (build_gebaeude.py und
             build_baeume.py --kanton BE …, --alle; das Band je Kanton in pipeline/umgebung.py: alle Bahnlinien aus swissTLMRegio, 400 m,
             Kacheln nach dem Kanton ihrer Mitte, BFS g1); Reihenfolge nach Michael (2026-10-13): BE, VS, NE und VD, dann der Rest;
             Gebäude je Kartenblatt der neueste Jahrgang, CityGML oder, wo es nur sie gibt (Wallis, Waadt …), FileGDB über ogr2ogr
             (gdal-bin); Bäume im Führerstand nur bis 1,7 km um die Mitte voraus, Krone 20 Dreiecke mit Kugelnormalen (BAUM_BIS_M; im
             dichtesten Wald von Bern sonst bis 67'000 Bäume im Quadrat);
             Bäume nicht im Lichtraum der Gleise: keine Krone näher als 5 m an einer Gleisachse aus swissTLM3D (Ebene Eisenbahn, ohne
             Tunnel und Galerien; LICHTRAUM_M in build_baeume.py; Michael, 2026-10-14: «auch die Bäume an den anderen Gleisen entfernen»);
             gebaut vom Workflow «Gebäude und Bäume» (.github/workflows/umgebung.yml, von Hand zu starten, Auswahl alles, gebaeude oder baeume), Pakete
             (pipeline/umgebung_pakete.py) im Release «umgebung-1», geholt von server/daten/holen.php (HOLEN = 'umgebung-1'); die App
             liest gebaeude/index.json und baeume/index.json von dort, deren Kacheln gehen vor (die der App haben nur die Strecken des ersten Versuchs; Michael, 2026-10-14: in Biel fehlte die Hälfte), die der App nur, wo dort keine sind; fehlt ein Verzeichnis dort, fragt die App nach einer Minute wieder nach (NOCHMALS_MS in src/gelaende.ts, auch scharf/; Michael,
             2026-10-17: auf der Brille fehlten die Gebäude noch, als sie längst auf dem Server lagen)
data/scharf_extern/  weitere scharfe Kacheln für daten.taktland.ch, nicht in Git (build_scharf.py --extern, mit --relief NAME
             entlang eines Reliefs oder --weg A B … entlang des Wegs der App); die App liest dort scharf/index.json (DATEN_URL in
             src/gelaende.ts), die Kacheln der App gehen vor, fehlt der Index, gelten nur diese
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
cd app && npx vite build -c scripts/vite.netzpruefung.config.ts && node node_modules/.netzpruefung/netzpruefung.js   # Prüfung über das ganze Netz
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
.venv/bin/python pipeline/build_schweiz3d.py        # Übersicht der Schweiz für «3D Schweiz», vor export_app
.venv/bin/python pipeline/build_schweiz3d_details.py --teil 3/8   # Details für «3D Schweiz» (daten.taktland.ch)
.venv/bin/python pipeline/build_schweiz3d_details.py --fein --teil 3/16   # dito auf 50 cm und 5 m für die Stufe 1 km
.venv/bin/python pipeline/build_wanderwege.py            # Wanderwege der Schweiz für «3D Schweiz» (nach fetch_tlm3d.py --strassen), vor export_app
.venv/bin/python pipeline/build_schweiz3d_probe.py         # Gebäude und Bäume um Köniz und den Gantrisch für «3D Schweiz», vor export_app
.venv/bin/python pipeline/build_schweiz3d_umwelt.py --art baeume --teil 3/9   # Gebäude oder Bäume der ganzen Schweiz (daten.taktland.ch)
.venv/bin/python pipeline/build_luftbild_nah.py      # Nahbild (2,5 m) entlang der Bahnlinien, etwa eine Stunde, vor export_app
.venv/bin/python pipeline/build_gelaende_nah.py      # feines Gelände (10 m) entlang der Bahnlinien für den Führerstand, vor export_app
.venv/bin/python pipeline/build_scharf.py --extern --relief gotthard   # scharfe Kacheln für daten.taktland.ch
.venv/bin/python pipeline/build_gebaeude.py       # Gebäude (swissBUILDINGS3D) entlang Gümmenen–Bern, vor export_app
.venv/bin/python pipeline/build_scharf.py --extern --weg Bern Olten     # dito entlang des Wegs der App
.venv/bin/python pipeline/build_scharf.py --extern --rest 3/8          # alle übrigen Bahnlinien, Teil 3 von 8 (sonst Reihe 6c im Workflow)
python3 pipeline/fetch_tlm3d.py --baeume          # Einzelbaum und Bodenbedeckung aus swissTLM3D (etwa 3,3 GB)
python3 pipeline/fetch_tlm3d.py --strassen        # Strassen aus swissTLM3D (520 MB, entpackt 3,3 GB)
.venv/bin/python pipeline/build_strassenbruecken.py   # Strassenbrücken über der Bahn, vor export_app
.venv/bin/python pipeline/build_gleishoehe.py         # Höhe der Gleise aus swissTLM3D, vor export_app
.venv/bin/python pipeline/build_bahnbruecken.py       # Gleisachsen auf Brücken (Breite der Bahnbrücken), vor export_app
.venv/bin/python pipeline/build_baeume.py         # Bäume und Wald entlang Gümmenen–Neuchâtel, vor export_app
.venv/bin/python pipeline/build_gebaeude.py --kanton BE   # Gebäude eines Kantons für daten.taktland.ch (--alle: alle)
.venv/bin/python pipeline/build_baeume.py --kanton BE     # dito Bäume
.venv/bin/python pipeline/umgebung_pakete.py --teil be    # Pakete für das Release umgebung-1
bash pipeline/scharf_reihen.sh 1                                       # eine der vier Reihen scharfer Strecken (sonst im Workflow)
.venv/bin/python pipeline/scharf_pakete.py --teil r1                    # Pakete für das Release scharf-1
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

Zusatzinformationen, Quellenangaben und Hinweise unter Karten, Modellen, Listen und beim Fahren stehen in einer **Klappe**,
am Anfang zu («Quellen und Hinweise», `komponenten/Klappe.tsx`, Michael, 2026-10-12: «die ganze Bleiwüste unterhalb der Karte»);
Lücken bleiben sichtbar (Regel 5), die Quellenzeile der Fusszeile ebenso.

**Reiter** (Michael, 2026-10-16): «Fahren» ist nur noch Mitfahren, ohne Unterreiter, und nur mit Ziel, der Start ist der nächste Bahnhof per GPS (Michael, 2026-10-21: ohne «Start und Ziel» und ohne «Ohne Ziel»; komponenten/Fahrt.tsx); die Probefahrten (aufklappen, je Richtung «Probefahrt»
oder «Als Modell», Reihenfolge, hinzufügen, löschen; komponenten/Probefahrten.tsx) und die Bergstrecken als Probefahrt stehen bei
Spiele, Modellbahn (#/fahrt/probe führt dorthin); das Fahrtblatt ist der vierte Reiter der Reisetasche (#/fahrtblatt, FahrtblattWahl.tsx).

**Wo bin ich?** (Spiele, #/wobinich, Michael, 2026-10-18): fünf Runden, je ein zufälliges Stück einer Linie aus data/strecken.json
(5 bis 45 km Weg, höchstens ein Viertel der Fahrt im Tunnel, beide Enden in der Schweiz; src/wobinich.ts), im Führerstand wie bei der
Probefahrt (GelaendeFahrt mit verdeckt und vorneAnfang: keine Schilder, keine Ortstafeln, am Pult «?» statt Start und Ziel und nur die Art
des Nächsten), 45 s Fahrt, Tempo 40 bis 120 km/h am Pult (Fahrzeit und Tempo fürs Spiel gewählt, in keiner Quelle), dann ein Pin auf der
Karte von «Geo» mit den Hilfen vom Start, gewertet wie dort (punkte, nullGrenzeM für die ganze Schweiz); in der Auflösung die Bahnhöfe
davor und danach und die Linie. Das Bild der Kachel ist vorerst das des Fahrtmodus.

**Desktop** (ab 1280 px, Tailwind `xl`, Michael, 2026-10-12): die Spalte bis 1152 px breit (App.tsx), Fliesstext höchstens
48rem (index.css), ungeordnete Kachellisten in Spalten von mindestens 26rem, Listen mit `md:grid-cols-2` dreispaltig, das
Auftaktbild als flaches Band (400 px, vorher 288; Michael, 2026-10-13: «ca. 140 %», Auftakt.tsx); Modelle links (2/3) mit Knöpfen rechts (ZWEI_SPALTEN in Relief.tsx), beim
Fahren Karte und Streckenband links und stehend, alles andere rechts; Bahnhof- und Linienseite oben Angaben links, Karte rechts,
in jedem Kapitel mit Fragen links Text und Fakten, rechts die Fragen (KapitelBlock). Handy und Tablet bleiben, wie sie sind. Beim Fahren im Vollbild auf dem Handy quer zwei Spalten: links das Bild über die ganze Höhe, rechts schmal Umschalter, Schliessen, die Meldung und bei der Probefahrt Anhalten und Tempo; ohne die Schalter Tunnel … Gebiete und ohne die Tempozeile (FahrtKarte, vollbildLeiste; Michael, 2026-10-14: «Nur das Nötigste … mehr Sicht auf die Strecke»); im Führerstand sitzt das Pult auf schmalen Bildschirmen am unteren Rand, auf flachen 8 cm tiefer. Handy und Tablet lassen sich drehen (manifest.webmanifest `orientation: any`, Michael, 2026-10-13: quer mehr Sicht nach links und rechts im Führerstand); eine installierte App behält «portrait» aus dem alten Manifest, bis Android sie erneuert, darum erlaubt das Vollbild das Drehen selbst (screen.orientation.lock('any') in useEchtesVollbild, Michael, 2026-10-14).

Eigene Einträge (Probefahrten, gemerkte Fahrten, Favoriten, Fahrten im Logbuch) lassen sich **nach links wischen**:
der Eintrag bleibt aufgeschoben, und ein Tipp auf die rote Fläche «Löschen» löscht ihn ohne weitere Rückfrage (`komponenten/Wischen.tsx`,
Michael, 2026-10-08, ohne Rückfrage seit 2026-10-09). Das × daneben bleibt für Maus und Tastatur.

Was lädt, zeigt oben ein **Ladebalken** in Karmin (`komponenten/Ladebalken.tsx`, Michael, 2026-10-10): er zählt alles, was über
`holen`, `holenBinaer` oder `ladenVerfolgen` in `src/daten.ts` geht (auch die nachgeladenen Teile für 3D; antwortet ein Server 20 s nicht,
gibt der Abruf auf, ANTWORT_MS, Michael, 2026-10-21: cyon hatte PHP abgeschaltet, «Wird geladen …» blieb stehen), erscheint erst nach
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
