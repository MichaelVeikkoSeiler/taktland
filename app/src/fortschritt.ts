/** Fortschritt liegt nur auf dem Gerät. Kein Login, kein Server, kein Tracking. */

const SCHLUESSEL = 'taktland.fortschritt.v1'

export interface Antwort {
  richtig: boolean
  zeitpunkt: number
}

/** { "8503000": { "steckbrief:0": { richtig: true, zeitpunkt: … } } } */
type Speicher = Record<string, Record<string, Antwort>>

function lesen(): Speicher {
  try {
    return JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}') as Speicher
  } catch {
    return {}
  }
}

function schreiben(s: Speicher) {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(s))
  } catch {
    // Privater Modus oder voller Speicher: Fortschritt geht verloren, die App läuft weiter
  }
}

export function antwortSpeichern(uic: number, frageId: string, richtig: boolean) {
  const s = lesen()
  s[uic] = { ...(s[uic] ?? {}), [frageId]: { richtig, zeitpunkt: Date.now() } }
  schreiben(s)
}

export function antwortenLesen(uic: number): Record<string, Antwort> {
  return lesen()[uic] ?? {}
}

export function bahnhofZuruecksetzen(uic: number) {
  const s = lesen()
  delete s[uic]
  schreiben(s)
}

export function allesZuruecksetzen() {
  try {
    localStorage.removeItem(SCHLUESSEL)
  } catch {
    // nichts zu tun
  }
}

export function bearbeiteBahnhoefe(): number[] {
  return Object.keys(lesen()).map(Number)
}
