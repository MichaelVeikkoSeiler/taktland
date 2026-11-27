/**
 * Sprache von 3dland.ch, vor allem anderen bestimmt (als erster Import in src/dreidland.tsx, damit jeder Text schon in der Sprache
 * entsteht): ?lang=en oder ?lang=de in der Adresse, sonst die gemerkte Wahl (localStorage dreidland.sprache), sonst die Sprache des
 * Browsers (beginnt sie mit «de», Deutsch, sonst Englisch).
 */
import { type Sprache, spracheSetzen } from './sprache'

export const SPRACHE_SCHLUESSEL = 'dreidland.sprache'

function bestimmen(): Sprache {
  const q = new URLSearchParams(location.search).get('lang')
  if (q === 'en' || q === 'de') return q
  try {
    const g = localStorage.getItem(SPRACHE_SCHLUESSEL)
    if (g === 'en' || g === 'de') return g
  } catch { /* ohne Speicher: nach dem Browser */ }
  return (navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en'
}

const s = bestimmen()
spracheSetzen(s)
document.documentElement.lang = s === 'en' ? 'en' : 'de-CH'

/** Sprache wählen: merken und die Seite mit ?lang=… neu laden, der Hash bleibt */
export function spracheWaehlen(neu: Sprache) {
  try { localStorage.setItem(SPRACHE_SCHLUESSEL, neu) } catch { /* nur in der Adresse */ }
  const p = new URLSearchParams(location.search)
  p.set('lang', neu)
  location.href = location.pathname + '?' + p.toString() + location.hash
}
