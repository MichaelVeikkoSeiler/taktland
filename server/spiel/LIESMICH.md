# Vermittlung für «Geo» auf mehreren Geräten

Läuft auf `spiel.taktland.ch` (Webhosting bei cyon, Ordner `public_html/spiel.taktland.ch`),
nicht bei GitHub. Von Hand hochladen, wenn sich hier etwas ändert.

- `raum.php` eröffnet Spielräume und reicht ihre Ereignisse weiter, nur mit Herkunft taktland.ch
- `daten/` enthält je Raum eine Datei `r-CODE.json`; `daten/.htaccess` sperrt den Ordner,
  Räume verfallen nach sechs Stunden
- Prüfen: `https://spiel.taktland.ch/raum.php?a=test` zeigt `{"ok":true}`
