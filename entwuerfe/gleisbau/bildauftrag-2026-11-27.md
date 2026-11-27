# Bildauftrag Gleisbau, neue Elemente (2026-11-27)

Für ChatGPT, im gleichen System wie die bisherigen Bilder des Gleisbaus. Bitte die bisherigen Bilder als Vorlage mitschicken
(zum Beispiel gb_obj_kirche_01, gb_obj_bauernhof_01, gb_bau_depot_01, gb_bau_gueterschuppen_01, gb_bau_galerie_01).

## Für alle Bilder gleich

- Stil genau wie die bisherigen Bilder: flache, freundliche Illustration, klare Formen, weiche Schatten, leicht von oben gesehen,
  Licht von oben links, kräftige, aber nicht grelle Farben, Dächer rot oder grau wie bei Depot und Güterschuppen.
- Keine Schrift, keine Logos, keine Marken, keine Menschen.
- PNG mit durchsichtigem Hintergrund, ohne Schachbrett, ohne Boden und ohne Wiese ums Objekt (die Wiese zeichnet das Spiel).
- Quadratisch, mindestens 1024 × 1024 Bildpunkte.
- Dateiname wie angegeben, Kleinbuchstaben, ohne Umlaute.

## A) Objekte allein in einem Feld

Wie Kirche und Bauernhof: das Objekt freigestellt, unten der Fuss auf dem Boden, schräg von vorne oben gesehen, steht in der Mitte
des Bilds und füllt es in der Breite etwa zu 80 %. Das Spiel stellt es auf ein Feld neben das Gleis.

1. **gb_obj_wasserturm_01** – Wasserturm der Bahn: schlanker Turm aus rotem Backstein, oben ein runder Wasserbehälter in hellem
   Grau oder Beige mit Kegeldach, seitlich ein Rohr nach unten mit Ausleger zum Gleis hin.
2. **gb_obj_tankstelle_01** – Dieseltankstelle für Loks: ein liegender weisser Tank auf zwei Betonsockeln mit karminrotem Band,
   daneben eine gelbe Zapfsäule mit Schlauch.
3. **gb_obj_stellwerk_01** – Stellwerk: zweistöckiges, schmales Haus mit hellem Putz, oben ringsum grosse Fenster (die Kanzel),
   rotes Walmdach, unten eine Tür und zwei kleine Fenster.
4. **gb_obj_unterwerk_01** – Unterwerk für den Bahnstrom: eingezäunter Platz mit Kies, darauf zwei graue Transformatoren mit
   Isolatoren, zwei Masten mit Querträger und Leitungen, am Zaun ein gelbes Warnschild mit Blitz (ohne Schrift).
5. **gb_obj_hafenkran_01** – Hafenkran: gelber Portalkran auf zwei Beinen, Kabine oben, Ausleger schräg nach oben, am Haken ein
   blauer Container.

## B) Industrie, statt der gezeichneten Hallen

Wie die Häuser im Dorf: einzelne Gebäude freigestellt, schräg von vorne oben, je etwa so gross, dass zwei auf ein Feld passen.
Das Spiel verteilt sie auf Feldern mit «Industrie».

6. **gb_obj_industrie_halle_01** – Fabrikhalle mit Sägezahndach (Oberlichter), Wände grau oder hellbraun, ein Rolltor.
7. **gb_obj_industrie_halle_02** – lange Lagerhalle mit flachem Dach und mehreren Rampentoren.
8. **gb_obj_industrie_silo_01** – zwei bis drei runde Silos aus Beton nebeneinander, mit Treppe und Steg oben.
9. **gb_obj_industrie_kamin_01** – kleineres Werkgebäude mit hohem Kamin aus Backstein.

## C) Bauwerke über dem Gleis, ganzes Feld

Wie Depot, Güterschuppen und Galerie: ganzes quadratisches Feld, **das Gleis läuft senkrecht durch die Mitte** (von oben nach
unten), gesehen fast senkrecht von oben. Das Gleis selbst nicht zeichnen oder nur sehr blass, das Spiel zeichnet es darunter.
Bild nicht zuschneiden, Rand durchsichtig.

10. **gb_bau_laerm_01** – Lärmschutzwand: links neben dem Gleis eine lange grüngraue Wand aus Elementen über die ganze Höhe des
    Felds, von Kante zu Kante, damit mehrere Felder nahtlos aneinanderpassen. Rechts nichts.
11. **gb_bau_unterfuehrung_01** – Treppenabgang einer Personenunterführung: auf der rechten Seite des Gleises, im unteren Viertel
    des Felds, eine Treppe nach unten mit Geländer und kleinem Dach, so wie er auf einem Perron neben dem Gleis stünde.
12. **gb_bau_viadukt_01** – Viadukt aus Stein: das Gleis liegt auf einer steinernen Brücke, man sieht die Brüstungen links und
    rechts und darunter schräg die Bögen und Pfeiler. Oben und unten von Kante zu Kante, damit mehrere Felder nahtlos ein langes
    Viadukt ergeben.
13. **gb_bau_drehscheibe_01** – Drehscheibe, die Grube: eine runde, gemauerte Grube, die fast das ganze Feld füllt, unten ein
    Laufkranz aus Stahl, von allen vier Kanten führt ein kurzes Gleis an den Rand der Grube. Ohne die Bühne.
14. **gb_bau_drehscheibe_buehne_01** – Drehscheibe, die Bühne allein: eine waagrechte Stahlbrücke mit zwei Schienen, so lang wie
    der Durchmesser der Grube, quer durch die Mitte des Bilds, sonst alles durchsichtig. Das Spiel dreht sie.

## Nach dem Erstellen

Die PNG in einen Ordner legen und mir schicken (oder in den Chat). Ich bereite sie mit entwuerfe/gleisbau/bilder_vorbereiten.py
vor und setze sie anstelle der heute gezeichneten Platzhalter ein.
