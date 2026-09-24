/**
 * Das Sammelheft: welche Tunnel, Brücken und Bahnhöfe im Fahrtmodus
 * durchfahren wurden, und die Fahrten dazu. Nur auf diesem Gerät
 * (localStorage), nie gesendet. Die Probefahrt schreibt nichts hinein.
 */

export type ErlebtArt = 'tunnel' | 'bruecke' | 'bahnhof'

export interface ErlebtesObjekt {
  art: ErlebtArt
  /** Tunnel und Brücken: «Linie:Stelle»; Bahnhöfe: die UIC */
  kennung: string
  name: string
  /** erstes Mal durchfahren, Millisekunden */
  zeit: number
}

export interface ErlebteFahrt {
  beginn: number
  von: string
  nach: string
  /** in der Reihenfolge der Fahrt, auch schon früher erlebte */
  objekte: Array<{ art: ErlebtArt; kennung: string; name: string }>
}

interface Heft {
  objekte: Record<string, ErlebtesObjekt>
  fahrten: ErlebteFahrt[]
}

export const ERLEBT_SCHLUESSEL = 'taktland.sammelheft.v1'

export const schluesselVon = (art: ErlebtArt, kennung: string) => `${art} ${kennung}`

export function heftLesen(): Heft {
  try {
    const x = JSON.parse(localStorage.getItem(ERLEBT_SCHLUESSEL) ?? '{}')
    return {
      objekte: x.objekte && typeof x.objekte === 'object' ? x.objekte : {},
      fahrten: Array.isArray(x.fahrten) ? x.fahrten : [],
    }
  } catch {
    return { objekte: {}, fahrten: [] }
  }
}

function schreiben(h: Heft) {
  try { localStorage.setItem(ERLEBT_SCHLUESSEL, JSON.stringify(h)) } catch { /* ohne Speicher kein Heft */ }
}

/** Eine neue Fahrt beginnt; gibt ihren Beginn zurück, der sie kennzeichnet */
export function fahrtBeginnen(von: string, nach: string): number {
  const h = heftLesen()
  const beginn = Date.now()
  h.fahrten = [{ beginn, von, nach, objekte: [] }, ...h.fahrten]
  schreiben(h)
  return beginn
}

/** Ein Objekt ist durchfahren: ins Heft und zur Fahrt */
export function durchfahren(beginn: number, o: { art: ErlebtArt; kennung: string; name: string }) {
  const h = heftLesen()
  const k = schluesselVon(o.art, o.kennung)
  if (!h.objekte[k]) h.objekte[k] = { ...o, zeit: Date.now() }
  const fahrt = h.fahrten.find((f) => f.beginn === beginn)
  if (fahrt && !fahrt.objekte.some((x) => x.art === o.art && x.kennung === o.kennung)) fahrt.objekte.push(o)
  schreiben(h)
}

/** Fahrten ohne ein einziges durchfahrenes Objekt fallen weg */
export function leereFahrtenWeg() {
  const h = heftLesen()
  const vorher = h.fahrten.length
  h.fahrten = h.fahrten.filter((f) => f.objekte.length > 0)
  if (h.fahrten.length !== vorher) schreiben(h)
}

export function heftLoeschen() {
  try { localStorage.removeItem(ERLEBT_SCHLUESSEL) } catch { /* nichts zu löschen */ }
}

/** Wann ein Objekt zum ersten Mal durchfahren wurde, sonst null */
export function erlebtAm(art: ErlebtArt, kennung: string): number | null {
  return heftLesen().objekte[schluesselVon(art, kennung)]?.zeit ?? null
}

export function datum(ms: number) {
  return new Date(ms).toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric', year: 'numeric' })
}
