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

export function oeffnenZaehlen() {
  if (location.hostname !== 'taktland.ch' || !navigator.onLine) return
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
