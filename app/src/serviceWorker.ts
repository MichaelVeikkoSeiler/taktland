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
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return

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
