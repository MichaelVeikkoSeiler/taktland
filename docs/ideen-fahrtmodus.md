# Fahrtmodus: vorgemerkte Ideen

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
Sprachansage, Vibration, Challenge, neues App-Symbol und Illustrationen
(von Michael).

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

## Risiken, beim Bauen beachten

- **Speicher auf dem Gerät:** Sammelheft, abgehakte Objekte und Favoriten liegen im
  Speicher des Browsers. Safari auf dem iPhone löscht ihn bei Websites, die sieben
  Tage nicht besucht wurden, nicht aber bei Apps auf dem Home-Bildschirm. Darum
  als App installieren und eine Sicherung zum Herunterladen anbieten.
- **Challenge:** ohne Server, über einen geteilten Code oder Link.
- **Grössere Funktionen** zuerst auf einem Branch, erst danach nach `main`.

Alles unten folgt den Regeln in `CLAUDE.md`: nur Angaben aus den Daten, keine
gerechneten Grössen (keine Summe der Tunnellängen), Lücken benennen.

## Einstieg

- **Eigener Knopf «Fahrtmodus»**, als eigener Reiter oder Spezial-Knopf in der
  Navigation, direkt zur Auswahl der Fahrt.
- **Nur Ziel eingeben:** Start ist der nächste Bahnhof per GPS.
- **Ohne Ziel:** Aus einigen GPS-Punkten Linie und Richtung erkennen
  (`strecken_geometrie.json`) und melden, was auf der Linie vorne liegt; bei
  einem Linienwechsel neu suchen.
- **Pendelfunktion und Favoriten:** feste Fahrten und letzte Fahrten, ein Tipp
  bis zum Start (auf dem Gerät gespeichert).
- **Verknüpfung auf dem App-Symbol:** `shortcuts` im Manifest der PWA
  («Fahrtmodus», «Letzte Fahrt»), vor allem Android.
- **Neues App-Symbol** (gestaltet von Michael).

## Anzeige

- **Streckenband:** Zug-Symbol fährt auf die kommenden Objekte zu, im Massstab
  des Wegs.
- **Ring um die Anzeige:** füllt sich bis zur Meldung, bei «Gleich» gross.
- **Kleine Karte mit eigener Position:** aus `karte.json`, ohne Kartendienst.
- **Im Tunnel:** «Ausfahrt in etwa …» mit Sekunden und einer Fläche, die sich
  füllt (nur wo die Ausfahrt bekannt ist, sonst Hinweis).
- **Objektillustrationen:** Tunnel, Brücke, Bahnhof; zeichnet Michael selbst.

## Nach der Fahrt

- **Fahrtbilanz:** Zählung der durchfahrenen Tunnel, Brücken, Bahnhöfe und die
  Liste dazu.
- **Abgehakte Objekte:** auf dem Gerät gemerkt, was schon durchfahren ist.
- **Sammelheft mit «Was fehlt noch?»**, als Challenge: «Wer hat mehr Tunnel
  durchfahren?» Offene Frage: Ein Vergleich mit anderen braucht einen Weg,
  Stände zu teilen (etwa einen Code oder Link zum Vergleichen), denn heute
  bleibt alles auf dem Gerät und Taktland hat keinen Server für Nutzerdaten.
- **Quiz zur Fahrt:** Fragen nur zu den Objekten dieser Fahrt, nach den Regeln
  für Fragen (keine Glücksfragen).
