/**
 * Favoriten und letzte Fahrten des Fahrtmodus. Sie bleiben auf diesem Gerät
 * (localStorage) und werden nie gesendet. Ohne Speicher gibt es sie nicht,
 * der Fahrtmodus geht trotzdem.
 */

/** Eine Fahrt als UIC von Start, Ziel und wahlweise einem Bahnhof dazwischen */
export interface GemerkteFahrt {
  von: number
  nach: number
  ueber: number | null
}

interface Gemerkt {
  favoriten: GemerkteFahrt[]
  letzte: GemerkteFahrt[]
  /** Probefahrten zum Anwählen, Starten und Löschen (Michael, 2026-09-26) */
  probefahrten: GemerkteFahrt[]
}

/** Die ersten Probefahrten, von Michael gewünscht (2026-09-26): Biel/Bienne –
 *  Yverdon-les-Bains, Thun – Brig, Zürich HB – Bern, dazu Walenstadt –
 *  Ziegelbrücke (5 Tunnel, 45 Brücken). Sie stehen da, bis sie gelöscht werden. */
const ERSTE_PROBEFAHRTEN: GemerkteFahrt[] = [
  { von: 8504300, nach: 8504200, ueber: null },
  { von: 8507100, nach: 8501609, ueber: null },
  { von: 8503000, nach: 8507000, ueber: null },
  { von: 8509414, nach: 8503225, ueber: null },
]

const SCHLUESSEL = 'taktland.fahrten.v1'
/** So viele letzte Fahrten bleiben stehen */
const LETZTE = 5

function gueltig(x: unknown): x is GemerkteFahrt {
  const f = x as GemerkteFahrt
  return !!f && Number.isInteger(f.von) && Number.isInteger(f.nach)
    && (f.ueber === null || Number.isInteger(f.ueber))
}

export function gemerktLesen(): Gemerkt {
  try {
    const x = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}')
    return {
      favoriten: Array.isArray(x.favoriten) ? x.favoriten.filter(gueltig) : [],
      letzte: Array.isArray(x.letzte) ? x.letzte.filter(gueltig) : [],
      // noch nie gespeichert: die ersten Probefahrten; eine geleerte Liste bleibt leer
      probefahrten: Array.isArray(x.probefahrten) ? x.probefahrten.filter(gueltig) : ERSTE_PROBEFAHRTEN,
    }
  } catch {
    return { favoriten: [], letzte: [], probefahrten: ERSTE_PROBEFAHRTEN }
  }
}

function schreiben(g: Gemerkt) {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(g)) } catch { /* ohne Speicher nichts gemerkt */ }
}

export function gleicheFahrt(a: GemerkteFahrt, b: GemerkteFahrt) {
  return a.von === b.von && a.nach === b.nach && a.ueber === b.ueber
}

/** Nach dem Start des Fahrtmodus: vorne in die letzten Fahrten */
export function letzteMerken(f: GemerkteFahrt) {
  const g = gemerktLesen()
  g.letzte = [f, ...g.letzte.filter((x) => !gleicheFahrt(x, f))].slice(0, LETZTE)
  schreiben(g)
}

export function istFavorit(f: GemerkteFahrt) {
  return gemerktLesen().favoriten.some((x) => gleicheFahrt(x, f))
}

/** Favorit setzen oder entfernen; gibt den neuen Stand zurück */
export function favoritUmschalten(f: GemerkteFahrt): Gemerkt {
  const g = gemerktLesen()
  g.favoriten = g.favoriten.some((x) => gleicheFahrt(x, f))
    ? g.favoriten.filter((x) => !gleicheFahrt(x, f))
    : [...g.favoriten, f]
  schreiben(g)
  return g
}

export function letzteLoeschen(): Gemerkt {
  const g = gemerktLesen()
  g.letzte = []
  schreiben(g)
  return g
}

export function istProbefahrt(f: GemerkteFahrt) {
  return gemerktLesen().probefahrten.some((x) => gleicheFahrt(x, f))
}

/** Als Probefahrt merken oder wieder entfernen; gibt den neuen Stand zurück */
export function probefahrtUmschalten(f: GemerkteFahrt): Gemerkt {
  const g = gemerktLesen()
  g.probefahrten = g.probefahrten.some((x) => gleicheFahrt(x, f))
    ? g.probefahrten.filter((x) => !gleicheFahrt(x, f))
    : [...g.probefahrten, f]
  schreiben(g)
  return g
}

/** Eine entfernte Probefahrt an ihrer alten Stelle wieder einsetzen («Rückgängig») */
export function probefahrtEinsetzen(f: GemerkteFahrt, stelle: number): Gemerkt {
  const g = gemerktLesen()
  if (!g.probefahrten.some((x) => gleicheFahrt(x, f))) g.probefahrten.splice(stelle, 0, f)
  schreiben(g)
  return g
}
