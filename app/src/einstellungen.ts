import { useSyncExternalStore } from 'react'

/**
 * Persönliche Einstellungen (Michael, 2026-10-01): Bildschirm wach halten beim
 * Fahren, Schriftgrösse und Schriftart. Sie bleiben auf diesem Gerät.
 */
export type Groesse = 'normal' | 'gross' | 'sehrgross'
export type Schrift = 'helvetica' | 'grotesk' | 'system' | 'serif'
export interface Einstellungen { wach: boolean; groesse: Groesse; schrift: Schrift }

const SCHLUESSEL = 'taktland.einstellungen.v1'

/** Schriftgrösse als Anteil der Grundgrösse; alle Masse der App hängen daran (rem) */
export const GROESSEN: Record<Groesse, { text: string; prozent: number }> = {
  // «Basic» statt «Normal» (Michael, 2026-10-01: wer gross wählt, ist nicht «nicht normal»)
  normal: { text: 'Basic', prozent: 100 },
  gross: { text: 'Gross', prozent: 112.5 },
  sehrgross: { text: 'Sehr gross', prozent: 125 },
}

/**
 * Vier Schriften, keine von einem fremden Dienst geladen: Helvetica wie bisher, Space
 * Grotesk (Florian Karsten, SIL Open Font License, in der App mitgeliefert; Michael,
 * 2026-10-01), die Schrift des Handys (auf Android meist Roboto, auf dem iPhone San
 * Francisco) und eine Serifenschrift. Space Grotesk lädt erst, wenn man sie wählt.
 */
export const SCHRIFTEN: Record<Schrift, { text: string; familie: string }> = {
  helvetica: { text: 'Helvetica', familie: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif' },
  grotesk: { text: 'Space Grotesk', familie: '"Space Grotesk Variable", "Helvetica Neue", Helvetica, Arial, sans-serif' },
  system: { text: 'Schrift des Handys', familie: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  serif: { text: 'Serifenschrift', familie: 'Georgia, Charter, "Noto Serif", "Times New Roman", serif' },
}

let stand: Einstellungen = lesen()
const hoerer = new Set<() => void>()

function lesen(): Einstellungen {
  let x: Record<string, unknown> = {}
  try { x = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}') } catch { /* Standard */ }
  return {
    wach: x.wach !== false,
    groesse: (Object.keys(GROESSEN) as Groesse[]).includes(x.groesse as Groesse) ? x.groesse as Groesse : 'normal',
    schrift: (Object.keys(SCHRIFTEN) as Schrift[]).includes(x.schrift as Schrift) ? x.schrift as Schrift : 'helvetica',
  }
}

/** Schriftgrösse und Schriftart auf die ganze Seite legen */
export function anwenden() {
  const h = document.documentElement
  h.style.fontSize = stand.groesse === 'normal' ? '' : `${GROESSEN[stand.groesse].prozent}%`
  h.style.setProperty('--font-sans', SCHRIFTEN[stand.schrift].familie)
}

export function einstellungenSetzen(neu: Partial<Einstellungen>) {
  stand = { ...stand, ...neu }
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(stand)) } catch { /* nur für jetzt */ }
  anwenden()
  hoerer.forEach((h) => h())
}

export function useEinstellungen(): Einstellungen {
  return useSyncExternalStore((h) => { hoerer.add(h); return () => hoerer.delete(h) }, () => stand)
}
