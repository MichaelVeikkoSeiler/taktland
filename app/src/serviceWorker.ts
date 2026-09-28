/** Solange das gilt, lädt die App nicht von selbst neu: während einer Fahrt */
let gesperrt = 0
export function neuLadenSperren(): () => void {
  gesperrt++
  return () => { gesperrt-- }
}

/** Das Programm, mit dem diese Seite läuft: «./assets/index-AbC123.js» */
function programm(html: string): string | null {
  return html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1]
    ?? html.match(/<script[^>]+src="([^"]+)"[^>]+type="module"/)?.[1] ?? null
}

/**
 * Kommt die App aus dem Hintergrund zurück, schaut sie nach, ob es eine neue
 * Version gibt, und lädt dann neu (Michael, 2026-09-28): Sonst sah man den
 * neuen Stand erst, wenn man die App ganz schloss. Nicht während einer Fahrt,
 * nicht beim Schreiben in einem Feld, und höchstens einmal pro Minute.
 */
function neueVersionPruefen() {
  const jetzt = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src')
  if (!jetzt) return
  let zuletzt = 0
  const pruefen = async () => {
    if (document.visibilityState !== 'visible' || gesperrt > 0 || Date.now() - zuletzt < 60_000) return
    const feld = document.activeElement
    if (feld instanceof HTMLInputElement || feld instanceof HTMLTextAreaElement) return
    zuletzt = Date.now()
    try {
      const antwort = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'no-store' })
      if (!antwort.ok) return
      const neu = programm(await antwort.text())
      if (neu && neu !== jetzt && gesperrt === 0) window.location.reload()
    } catch { /* ohne Empfang bleibt der Stand */ }
  }
  document.addEventListener('visibilitychange', () => { void pruefen() })
  window.addEventListener('focus', () => { void pruefen() })
}

/**
 * Meldet den Service Worker an, damit die App ohne Empfang funktioniert.
 * Nur im gebauten Stand, beim Entwickeln stört er nur.
 *
 * Achtung: Ein Service Worker läuft nur über HTTPS oder auf localhost.
 * Ruft man die App im Heimnetz über die IP-Adresse auf (http://192.168.…),
 * bleibt die Offline-Funktion aus. Für einen echten Test braucht es eine
 * Veröffentlichung mit HTTPS.
 */
export function serviceWorkerAnmelden() {
  if (import.meta.env.DEV) return
  neueVersionPruefen()
  if (!('serviceWorker' in navigator)) return

  // Übernimmt ein neuer Service Worker die Seite, liegen im Speicher noch die
  // Inhalte des alten. Ohne diesen Neustart sähe man den neuen Stand erst beim
  // übernächsten Öffnen - bei einer korrigierten Angabe ist das zu spät.
  // Der erste Besuch überhaupt löst nichts aus, dort gab es keinen Vorgänger.
  const hatteSchonEinen = Boolean(navigator.serviceWorker.controller)
  let neustartLaeuft = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (neustartLaeuft || !hatteSchonEinen) return
    neustartLaeuft = true
    window.location.reload()
  })

  const anmelden = () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // Ohne Service Worker läuft die App weiter, nur eben nicht offline.
        // Das ist etwa in eingebetteten Ansichten der Fall, die ihn verbieten.
      })
  }

  // Bei Modul-Skripten kann 'load' bereits vorbei sein, bevor dieser Code läuft.
  if (document.readyState === 'complete') anmelden()
  else window.addEventListener('load', anmelden, { once: true })
}
