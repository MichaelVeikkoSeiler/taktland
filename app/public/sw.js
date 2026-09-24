/**
 * Service Worker für Taktland.
 *
 * Ziel: Wer die App einmal geöffnet hat, kommt auch ohne Empfang an die Inhalte.
 * Im Bahnhofsuntergeschoss oder im Tunnel ist das der Normalfall.
 *
 * Beim Installieren wird die Startseite geholt, die darin verlinkten Dateien
 * werden mitgenommen und ebenso die Profile der Bahnhöfe. Sonst fehlte beim
 * ersten Besuch ausgerechnet das Programm, und die App bliebe offline leer.
 *
 * Es wird nichts an einen Server gemeldet. Der Cache liegt auf dem Gerät.
 */
const VERSION = 'taktland-v5'
const SHELL = './'

/** So viele Profile werden im Voraus gespeichert. Bei vielen Bahnhöfen ist
 *  das nicht mehr sinnvoll, dann zählt nur noch, was besucht wurde. */
const PROFILE_IM_VORAUS = 20

async function vorratAnlegen() {
  const cache = await caches.open(VERSION)
  const antwort = await fetch(SHELL, { cache: 'reload' })
  await cache.put(SHELL, antwort.clone())

  // Alles, was die Startseite verlinkt: Programm, Gestaltung, Symbole, Manifest
  const html = await antwort.text()
  const verlinkt = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => `./${m[1]}`)

  const dateien = new Set([...verlinkt, './data/index.json', './data/vergleich.json'])

  // Die Profile dazu, damit auch ein noch nicht geöffneter Bahnhof funktioniert
  try {
    const index = await (await fetch('./data/index.json')).json()
    const mitProfil = (index.bahnhoefe ?? []).filter((b) => b.sprachen?.length)
    for (const b of mitProfil.slice(0, PROFILE_IM_VORAUS)) {
      for (const sprache of b.sprachen) dateien.add(`./data/profile/${b.uic}.${sprache}.json`)
    }
  } catch {
    // ohne Index gibt es eben keine Profile im Voraus
  }

  // einzeln, damit eine fehlende Datei nicht alles scheitern lässt
  await Promise.all([...dateien].map((pfad) =>
    cache.add(pfad).catch(() => undefined)))
}

self.addEventListener('install', (e) => {
  e.waitUntil(vorratAnlegen().catch(() => undefined).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const anfrage = e.request
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== self.location.origin) return

  // Das Demo-Video nicht über den Cache: Browser holen es stückweise (Range),
  // das braucht die Antwort des Servers
  if (anfrage.headers.has('range') || new URL(anfrage.url).pathname.endsWith('.mp4')) return

  // Seitenaufruf: erst das Netz, damit Aktualisierungen ankommen; sonst der Cache.
  // «no-cache» fragt beim Server nach, ob es eine neuere Fassung gibt. Ohne
  // das hielt der Browser die Seite bis zu 10 Minuten fest (GitHub Pages
  // erlaubt so lange), und eine Korrektur kam erst später an.
  if (anfrage.mode === 'navigate') {
    e.respondWith(
      fetch(anfrage.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((antwort) => {
          const kopie = antwort.clone()
          caches.open(VERSION).then((c) => c.put(SHELL, kopie))
          return antwort
        })
        .catch(() => caches.match(SHELL).then((t) => t ?? Response.error())),
    )
    return
  }

  // Bahnhofsdaten: erst das Netz. Ein Profil, das eine Korrektur erhalten hat,
  // soll nicht erst beim uebernaechsten Oeffnen ankommen. Ohne Empfang
  // antwortet der Cache.
  if (new URL(anfrage.url).pathname.includes('/data/')) {
    e.respondWith(
      fetch(anfrage, { cache: 'no-cache' })
        .then((antwort) => {
          if (antwort.ok) {
            const kopie = antwort.clone()
            caches.open(VERSION).then((c) => c.put(anfrage, kopie))
          }
          return antwort
        })
        .catch(() => caches.match(anfrage).then((t) => t ?? Response.error())),
    )
    return
  }

  // Programmteile: aus dem Cache antworten, im Hintergrund erneuern
  e.respondWith(
    caches.match(anfrage).then((treffer) => {
      const ausDemNetz = fetch(anfrage)
        .then((antwort) => {
          if (antwort.ok) {
            const kopie = antwort.clone()
            caches.open(VERSION).then((c) => c.put(anfrage, kopie))
          }
          return antwort
        })
        .catch(() => treffer ?? Response.error())
      return treffer ?? ausDemNetz
    }),
  )
})
