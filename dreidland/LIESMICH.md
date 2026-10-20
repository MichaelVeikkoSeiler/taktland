# 3dland.ch

«3D Schweiz» als eigene Seite. Der Code bleibt hier in Taktland (`app/3dland.html`, `app/src/dreidland.tsx`,
`app/vite.3dland.config.ts`, `app/scripts/3dland_fertig.mjs`); das Repository **3dland** enthält nur den Workflow
`veroeffentlichen.yml` von hier (als `.github/workflows/veroeffentlichen.yml`). GitHub Pages erlaubt je Repository nur
eine eigene Domain, darum ein zweites Repository.

Einmal einrichten:

1. Auf GitHub ein öffentliches Repository `3dland` anlegen.
2. Den Workflow hineinlegen (macht Claude, sobald das Repository da ist).
3. Im Repository unter Settings → Pages bei «Source» **GitHub Actions** wählen, bei «Custom domain» `3dland.ch`
   eintragen, nach der Prüfung «Enforce HTTPS» einschalten.
4. Beim Anbieter der Domain die DNS-Einträge setzen (wie bei taktland.ch):
   - `3dland.ch` A: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
   - `3dland.ch` AAAA: 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153
   - `www.3dland.ch` CNAME: `michaelveikkoseiler.github.io`

Die Daten kommen von taktland.ch/app/ (GitHub Pages erlaubt den Abruf von anderswo) und daten.taktland.ch
(`.htaccess` mit `Access-Control-Allow-Origin *`). Ausprobieren mit eigenen Daten: `VITE_DATEN_BASIS=http://…/`.
