# daten.taktland.ch

Grosse Kacheln, die nicht in die App passen (GitHub Pages: 1 GB). Webhosting bei cyon, Ordner
`public_html/daten`, von Hand hochgeladen.

- `.htaccess` (dieser Ordner): erlaubt der App den Abruf (CORS), Zwischenspeicher, keine Verzeichnisliste
- `scharf/`: scharfe Umgebung aus `pipeline/build_scharf.py --extern …` (`data/scharf_extern`, nicht in Git),
  als ZIP hochladen und im Dateimanager von cyon mit «Extrahieren» auspacken; `index.json` zuletzt ersetzen
- `gebaeude/` und `baeume/`: Gebäude und Bäume je Kanton (Michael, 2026-10-13), gebaut vom Workflow «Gebäude und Bäume»
  (`.github/workflows/umgebung.yml`, Release `umgebung-1`); `holen.php` hochladen und öffnen (dort `HOLEN = 'umgebung-1'`),
  es holt die Pakete, fügt `index-{Kanton}.json` zu `index.json` zusammen und löscht sich. Die neue `.htaccess` mit
  `.bgz` und `.bmd` vorher hochladen.

Die App (`app/src/gelaende.ts`, `DATEN_URL`) liest `scharf/index.json`, `gebaeude/index.json` und `baeume/index.json` von
hier und nimmt Kacheln der App vor, fehlt der Index, gelten nur diese.
