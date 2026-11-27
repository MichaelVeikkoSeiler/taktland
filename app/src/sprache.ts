/**
 * Sprache der Texte (Michael, 2026-11-27: 3dland.ch auch auf Englisch, Taktland bleibt deutsch). Taktland ruft spracheSetzen nie auf, dort
 * bleibt alles deutsch; 3dland.ch setzt die Sprache in src/dreidland-sprache.ts, bevor irgendein Text entsteht.
 *
 * t('deutscher Text') gibt bei 'de' den Text selbst, bei 'en' den Eintrag aus EN (src/sprache-en.ts), fehlt er, den deutschen Text.
 * Platzhalter {name} werden in beiden Sprachen mit werte ersetzt.
 */
import { EN } from './sprache-en'

export type Sprache = 'de' | 'en'
let aktuell: Sprache = 'de'

export function spracheSetzen(s: Sprache) { aktuell = s }
export const sprache = () => aktuell

export function t(de: string, werte?: Record<string, string | number>): string {
  const text = aktuell === 'en' ? (EN[de] ?? de) : de
  return werte ? text.replace(/\{(\w+)\}/g, (ganz, k: string) => (k in werte ? String(werte[k]) : ganz)) : text
}

/** Gebietsschema für Zahlen und Daten: de-CH (5'000), auf Englisch en-GB (5,000) */
export const zahlOrt = () => (aktuell === 'en' ? 'en-GB' : 'de-CH')
/** eine Zahl wie in der Sprache üblich */
export const zahl = (n: number) => n.toLocaleString(zahlOrt())
