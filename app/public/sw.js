/**
 * Service Worker für Taktland.
 *
 * Ziel: Wer einen Bahnhof einmal geöffnet hat, kommt auch ohne Empfang an die
 * Inhalte. Im Bahnhofsuntergeschoss ist das der Normalfall.
 *
 * Es wird nichts an einen Server gemeldet. Der Cache liegt auf dem Gerät.
 */
const VERSION = 'taktland-v1'
const SHELL = './'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll([SHELL, './manifest.webmanifest', './data/index.json']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),   // ohne Netz trotzdem installieren
  )
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

  // Seitenaufruf: erst das Netz, damit Aktualisierungen ankommen; sonst der Cache
  if (anfrage.mode === 'navigate') {
    e.respondWith(
      fetch(anfrage)
        .then((antwort) => {
          const kopie = antwort.clone()
          caches.open(VERSION).then((c) => c.put(SHELL, kopie))
          return antwort
        })
        .catch(() => caches.match(SHELL).then((t) => t ?? Response.error())),
    )
    return
  }

  // Profile und Programmteile: aus dem Cache antworten, im Hintergrund erneuern
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
