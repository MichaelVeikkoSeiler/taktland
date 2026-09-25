/**
 * Favoritenbahnhöfe (Michael, 2026-09-25: «Reisetasche mit Favoriten»). Eine
 * Liste von UIC-Nummern in der Reihenfolge, in der sie dazukamen. Sie bleibt
 * auf diesem Gerät (localStorage) und wird nie gesendet. Ohne Speicher gibt es
 * keine Favoriten, alles andere geht trotzdem.
 *
 * Alle Stellen, die Bahnhöfe suchen, lesen dieselbe Liste über
 * useFavoriten(); ändert eine sie, sehen es die anderen sofort, auch in einem
 * zweiten Fenster.
 *
 * Nicht zu verwechseln mit den gemerkten Fahrten des Fahrtmodus (fahrten.ts).
 * Beim Löschen des Fortschritts bleiben die Favoriten wie jene: Sie sind eine
 * Einstellung, kein Ergebnis.
 */
import { useSyncExternalStore } from 'react'

const SCHLUESSEL = 'taktland.favoriten.v1'
const EREIGNIS = 'taktland-favoriten'

let zwischenspeicher: { roh: string | null; liste: number[] } | null = null

function lesen(): number[] {
  let roh: string | null = null
  try { roh = localStorage.getItem(SCHLUESSEL) } catch { /* ohne Speicher */ }
  if (zwischenspeicher && zwischenspeicher.roh === roh) return zwischenspeicher.liste
  let liste: number[] = []
  try {
    const x = JSON.parse(roh ?? '[]')
    // keine Duplikate, nur ganze Zahlen
    if (Array.isArray(x)) liste = [...new Set(x.filter((u) => Number.isInteger(u)))] as number[]
  } catch { /* kaputter Eintrag: leer beginnen */ }
  zwischenspeicher = { roh, liste }
  return liste
}

function schreiben(liste: number[]) {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify([...new Set(liste)])) } catch { /* dann gilt es nur jetzt nicht */ }
  window.dispatchEvent(new Event(EREIGNIS))
}

function abonnieren(melden: () => void) {
  const beiSpeicher = (e: StorageEvent) => { if (e.key === SCHLUESSEL) melden() }
  window.addEventListener(EREIGNIS, melden)
  window.addEventListener('storage', beiSpeicher)
  return () => {
    window.removeEventListener(EREIGNIS, melden)
    window.removeEventListener('storage', beiSpeicher)
  }
}

export function favoritHinzufuegen(uic: number) {
  const liste = lesen()
  if (!liste.includes(uic)) schreiben([...liste, uic])
}

export function favoritEntfernen(uic: number) {
  schreiben(lesen().filter((u) => u !== uic))
}

/** Wieder an die alte Stelle, etwa nach «Rückgängig» */
export function favoritEinsetzen(uic: number, stelle: number) {
  const liste = lesen().filter((u) => u !== uic)
  liste.splice(Math.max(0, Math.min(stelle, liste.length)), 0, uic)
  schreiben(liste)
}

export function favoritUmschalten(uic: number) {
  if (lesen().includes(uic)) favoritEntfernen(uic)
  else favoritHinzufuegen(uic)
}

/** Die Favoriten, immer aktuell */
export function useFavoriten(): number[] {
  return useSyncExternalStore(abonnieren, lesen, () => [])
}
