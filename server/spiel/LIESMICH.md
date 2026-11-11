# Vermittlung für Spiele auf mehreren Geräten («Geo», «Bahnhofsuche»)

Läuft auf `spiel.taktland.ch` (Webhosting bei cyon, Ordner `public_html/spiel.taktland.ch`),
nicht bei GitHub. Von Hand hochladen, wenn sich hier etwas ändert.

- `raum.php` eröffnet Spielräume und reicht ihre Ereignisse weiter, nur mit Herkunft taktland.ch
- `daten/` enthält je Raum eine Datei `r-CODE.json`; `daten/.htaccess` sperrt den Ordner,
  Räume verfallen nach sechs Stunden
- Prüfen: `https://spiel.taktland.ch/raum.php?a=test` zeigt `{"ok":true}`

## Echtzeit der Züge (`echtzeit.php`, seit 2026-11-11)

Holt die Verspätungen und Ausfälle (GTFS-Realtime) von opentransportdata.swiss für die Züge in der Virtuellen Schweiz,
höchstens alle 35 Sekunden (erlaubt sind zwei Abfragen je Minute), und gibt den Geräten nur die gefragten Fahrten weiter.

1. `echtzeit.php` neben `raum.php` hochladen.
2. Im API-Manager von opentransportdata.swiss einen Schlüssel für «GTFS-RT» holen und als einzige Zeile in die Datei
   `daten/echtzeit-schluessel.txt` schreiben, dann hochladen (der Ordner `daten/` ist gesperrt). Der Schlüssel kommt nie ins Repository.
3. Prüfen: `https://spiel.taktland.ch/echtzeit.php?a=test` zeigt `{"ok":true,"schluessel":true}`.

Im Ordner `daten/` legt das Skript `rt-meta.json` (Zeitpunkt, Fassung des Fahrplans, Fehler) und `rt-0.json` bis `rt-31.json` ab;
sie werden bei jedem Abruf überschrieben.
