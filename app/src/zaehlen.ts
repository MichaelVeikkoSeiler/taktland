/**
 * Zählt, wie oft die App geöffnet wird (Michael, 2026-09-29: «wie viele
 * Personen die App später benutzen»). Höchstens einmal pro Tag und Gerät
 * geht «app» an zaehler.taktland.ch, beim allerersten Öffnen «neu». Gesendet
 * wird nur dieses eine Wort, keine Kennung; der Tag der letzten Meldung
 * bleibt auf dem Gerät. Schlägt es fehl, merkt niemand etwas.
 * Nur auf taktland.ch, nicht beim Entwickeln oder in der Vorschau.
 */
const ZAEHLER = 'https://zaehler.taktland.ch/zaehlen.php'
export const GEZAEHLT = 'taktland.gezaehlt.v1'
/** eigene Geräte ausnehmen (Michael, 2026-11-20: «eigene Geräte ausnehmen»): einmal je Gerät und Browser
 *  taktland.ch/?nichtzaehlen oder …/app/#/?nichtzaehlen öffnen, zurück mit ?wiederzaehlen; nur ein Merker auf dem Gerät,
 *  gilt für die Seite und die App (dieselbe Herkunft), web/index.html liest denselben */
export const NICHT_ZAEHLEN = 'taktland.nichtzaehlen'

/** liest ?nichtzaehlen und ?wiederzaehlen aus der Adresse; wahr, wenn dieses Gerät nicht gezählt wird */
export function nichtGezaehlt(): boolean {
  try {
    const adresse = location.search + location.hash
    if (/[?&]nichtzaehlen\b/.test(adresse) && localStorage.getItem(NICHT_ZAEHLEN) !== '1') {
      localStorage.setItem(NICHT_ZAEHLEN, '1')
      alert('Dieses Gerät wird ab jetzt nicht mehr gezählt (gilt für diesen Browser).')
    } else if (/[?&]wiederzaehlen\b/.test(adresse) && localStorage.getItem(NICHT_ZAEHLEN) === '1') {
      localStorage.removeItem(NICHT_ZAEHLEN)
      alert('Dieses Gerät wird wieder gezählt.')
    }
    return localStorage.getItem(NICHT_ZAEHLEN) === '1'
  } catch { return false }
}

export function oeffnenZaehlen() {
  if (location.hostname !== 'taktland.ch' || !navigator.onLine) return
  if (nichtGezaehlt()) return
  const d = new Date()
  const heute = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let zuletzt: string | null
  try { zuletzt = localStorage.getItem(GEZAEHLT) } catch { return }
  if (zuletzt === heute) return
  try { localStorage.setItem(GEZAEHLT, heute) } catch { return }
  const url = `${ZAEHLER}?w=${zuletzt === null ? 'neu' : 'app'}`
  try {
    if (!navigator.sendBeacon?.(url)) void fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => {})
  } catch { /* nie stören */ }
}
