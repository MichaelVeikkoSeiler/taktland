/**
 * Die laufende Fahrt im Fahrtmodus. Schliesst das Handy die Seite (wenig
 * Speicher, lange im Hintergrund), fragt Taktland beim nächsten Öffnen, ob die
 * Fahrt weitergehen soll (Michael, 2026-09-26). Nur auf diesem Gerät
 * (localStorage), nie gesendet; der Standort selbst wird nicht gespeichert,
 * nur die Stelle auf dem Weg.
 */

export interface LaufendeFahrt {
  von: number
  nach: number
  ueber: number | null
  /** «Lugano → Bern» */
  titel: string
  /** kennzeichnet die Fahrt im Sammelheft und Logbuch */
  beginn: number
  /** Stelle auf dem Weg beim ersten Standort und beim letzten, Meter */
  startS: number | null
  s: number | null
  /** Länge des Wegs beim Start: Nur wenn er gleich herauskommt, gilt die Stelle */
  laenge: number
  /** zuletzt gemerkt, Millisekunden */
  zeit: number
  /** «Ohne Ziel»: Beim Fortsetzen sucht Taktland die Linie neu */
  ohne?: boolean
  /** der gewählte Zug, falls einer gewählt wurde */
  zug?: string
}

const SCHLUESSEL = 'taktland.laufend.v1'
const EREIGNIS = 'taktland-laufend'
/** Älter als das fragt Taktland nicht mehr: Die Fahrt ist sicher vorbei */
export const FORTSETZEN_BIS_H = 12

export function laufendLesen(): LaufendeFahrt | null {
  try {
    const x = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? 'null') as LaufendeFahrt | null
    if (!x || !Number.isInteger(x.von) || !Number.isInteger(x.nach) || typeof x.beginn !== 'number') return null
    if (Date.now() - x.zeit > FORTSETZEN_BIS_H * 3600_000) return null
    return x
  } catch {
    return null
  }
}

function schreiben(x: LaufendeFahrt | null) {
  try {
    if (x) localStorage.setItem(SCHLUESSEL, JSON.stringify(x))
    else localStorage.removeItem(SCHLUESSEL)
  } catch { /* ohne Speicher kein Fortsetzen */ }
  window.dispatchEvent(new Event(EREIGNIS))
}

export function laufendBeginnen(x: Omit<LaufendeFahrt, 'zeit' | 'startS' | 's'>) {
  schreiben({ ...x, startS: null, s: null, zeit: Date.now() })
}

/** Die Stelle nachführen, ohne dass die Anzeige neu zeichnet */
export function laufendStelle(beginn: number, startS: number, s: number) {
  const x = laufendLesen()
  if (!x || x.beginn !== beginn) return
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify({ ...x, startS, s, zeit: Date.now() })) } catch { /* */ }
}

export function laufendZug(beginn: number, zug: string | undefined) {
  const x = laufendLesen()
  if (x && x.beginn === beginn) schreiben({ ...x, zug })
}

/** Läuft die Fahrt gerade auf dieser Seite, fragt Taktland nicht nach ihr */
let hier = false
export const laufendHier = () => hier
export function laufendHierSetzen(x: boolean) {
  hier = x
  window.dispatchEvent(new Event(EREIGNIS))
}

export function laufendEnde() {
  schreiben(null)
}

/** Meldet jede Änderung, auch aus einem anderen Reiter des Browsers */
export function laufendBeobachten(f: () => void) {
  const beiSpeicher = (e: StorageEvent) => { if (e.key === SCHLUESSEL) f() }
  window.addEventListener(EREIGNIS, f)
  window.addEventListener('storage', beiSpeicher)
  return () => {
    window.removeEventListener(EREIGNIS, f)
    window.removeEventListener('storage', beiSpeicher)
  }
}
