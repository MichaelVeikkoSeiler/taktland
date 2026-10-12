# daten.taktland.ch

Grosse Kacheln, die nicht in die App passen (GitHub Pages: 1 GB). Webhosting bei cyon, Ordner
`public_html/daten`, von Hand hochgeladen.

- `.htaccess` (dieser Ordner): erlaubt der App den Abruf (CORS), Zwischenspeicher, keine Verzeichnisliste
- `scharf/`: scharfe Umgebung aus `pipeline/build_scharf.py --extern …` (`data/scharf_extern`, nicht in Git),
  als ZIP hochladen und im Dateimanager von cyon mit «Extrahieren» auspacken; `index.json` zuletzt ersetzen

Die App (`app/src/gelaende.ts`, `DATEN_URL`) liest `scharf/index.json` von hier und nimmt Kacheln der App vor,
fehlt der Index, gelten nur diese.
