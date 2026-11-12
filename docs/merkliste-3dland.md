# Merkliste 3D-Land

Vorgemerkt von Michael am 2026-10-26, noch nicht begonnen. Alles nur für 3dland.ch, solange nichts anderes entschieden ist.
Vor dem Einbau je Idee die Datenlage und die Nutzungsbedingungen der Quelle prüfen; was nicht aus einer Quelle stammt, wird
wie überall als Annahme benannt.

## Eigene Tour laden

Eine GPX-Datei (Wanderung, Velotour) vom Gerät laden. Die Linie liegt auf dem Gelände, ein Punkt fährt sie nach, dazu das
Höhenprofil in der Wand des Sockels. Die Datei bleibt auf dem Gerät und wird nicht gesendet.

## Gemeinsam am Tisch

Zwei oder mehr Leute sehen dasselbe Modell, mit Brille oder auf dem Handy, und zeigen einander mit dem Strahl Dinge. Die
Vermittlung über spiel.taktland.ch (server/spiel/raum.php) gibt es schon für «Geo»; darauf aufbauen. Das aufwendigste der vier.

## Zeitreise

Alte Karten von swisstopo (Angebot «Zeitreise»: Dufourkarte, Siegfriedkarte, ältere Landeskarten) mit einem Regler über das
Gelände legen, um zu sehen, wie Orte gewachsen und Flüsse begradigt worden sind. Lizenz und Abruf der alten Karten zuerst klären.

## Modell drucken

Das gewählte Feld als Datei für den 3D-Drucker (etwa STL), mit Sockel, auf Wunsch mit Seegrund und Fels. Massstab und
Überhöhung wählbar, die Masse sagt die Datei.

## Ansichten merken

Vorgemerkt von Michael am 2026-11-12: «User sollen individuelle Perspektiven und deren Einstellung der Knöpfe als Favoriten abspeichern
können». Machbar: je Ansicht die Stufe, das Feld (LV95), die Kamera und ihr Ziel im Raum des Modells, alle Schalter, die Zeit («Jetzt»
oder fest) und der Ton, mit einem Namen in einer Liste unter dem Modell, nur auf dem Gerät (localStorage, wie die Favoriten in Taktland,
nach links wischen löscht). Öffnen lädt die Stufen wie die Rückkehr aus dem Führerstand (rueckkehr in src/mitfahren.ts) und setzt die
Kamera. Dazu denkbar: eine Ansicht als Link teilen (alles in der Adresse, ohne Server). In der Brille ohne Kamera, nur Feld und Schalter.

## Physische Modelle

Vorgemerkt von Michael am 2026-11-12: «Später je nach Nachfrage physische Modelle bauen: Zug (Kultstatus) Haus, Bäume etc». Erst wenn
Nachfrage da ist. Grundlage wären die gezeichneten Formen der App (Zug aus komponenten/ZugForm.ts, Gebäude aus swissBUILDINGS3D, Bäume)
als Dateien für den 3D-Druck, verwandt mit «Modell drucken» oben. Vorher klären: Lizenz von swissBUILDINGS3D und SWISSIMAGE für
verkaufte Gegenstände, die Form des Zugs ohne Nähe zu Fahrzeugen oder Marken einer Bahn (heute kein bestimmtes Vorbild, die Spitze
karminrot), Arbeitgeber (siehe Gespräch), Herstellung, Versand, Gewährleistung und Steuern.
