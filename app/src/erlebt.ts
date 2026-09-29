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
  /** die Bahn (SBB, BLS, RhB …) für die Auswahl im Sammelheft; fehlt bei älteren Einträgen */
  bahn?: string
}

export interface ErlebteFahrt {
  beginn: number
  von: string
  nach: string
  /** in der Reihenfolge der Fahrt, auch schon früher erlebte */
  objekte: Array<{ art: ErlebtArt; kennung: string; name: string; bahn?: string }>
  /** eigene Notiz im Logbuch */
  notiz?: string
  /** von Hand ins Logbuch eingetragen, ohne Fahrtmodus: keine Objekte erfasst */
  manuell?: boolean
  /** gefahrene Meter auf der gezeichneten Strecke, vom ersten Standort bis zum
   *  letzten; erst seit 2026-09-28 erfasst (Michael), ältere Fahrten ohne */
  weg_m?: number
  /** der gefahrene Weg für die Karte im Logbuch, je erkannte Linie ein Stück: erster
   *  Punkt [Breite, Länge] mal 10000 und Differenzen; seit 2026-09-30 (Michael: «die
   *  Strecke … nicht schwarz»), ältere Fahrten ohne */
  wege?: Array<{ start: [number, number]; d: number[] }>
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
export function durchfahren(beginn: number, o: { art: ErlebtArt; kennung: string; name: string; bahn?: string }) {
  const h = heftLesen()
  const k = schluesselVon(o.art, o.kennung)
  if (!h.objekte[k]) h.objekte[k] = { ...o, zeit: Date.now() }
  const fahrt = h.fahrten.find((f) => f.beginn === beginn)
  if (fahrt && !fahrt.objekte.some((x) => x.art === o.art && x.kennung === o.kennung)) fahrt.objekte.push(o)
  schreiben(h)
}

/** Die gefahrenen Meter der Fahrt nachführen */
export function wegSetzen(beginn: number, m: number) {
  const h = heftLesen()
  const f = h.fahrten.find((x) => x.beginn === beginn)
  if (!f || !(m >= 0)) return
  f.weg_m = Math.round(m)
  schreiben(h)
}

/** Den gefahrenen Weg nachführen: Stück «teil» (bei «Ohne Ziel» eines je Linie) */
export function wegLinieSetzen(beginn: number, teil: number, punkte: Array<{ lat: number; lon: number }>) {
  const h = heftLesen()
  const f = h.fahrten.find((x) => x.beginn === beginn)
  if (!f || punkte.length < 2) return
  const ganz = punkte.map((p) => [Math.round(p.lat * 1e4), Math.round(p.lon * 1e4)] as [number, number])
  const d: number[] = []
  for (let i = 1; i < ganz.length; i++) d.push(ganz[i][0] - ganz[i - 1][0], ganz[i][1] - ganz[i - 1][1])
  const wege = f.wege ?? []
  wege[teil] = { start: ganz[0], d }
  f.wege = wege.filter(Boolean)
  schreiben(h)
}

/** Die Punkte eines gespeicherten Wegstücks, in Grad */
export function wegPunkte(w: { start: [number, number]; d: number[] }) {
  let [la, lo] = w.start
  const raus = [{ lat: la / 1e4, lon: lo / 1e4 }]
  for (let i = 0; i + 1 < w.d.length; i += 2) { la += w.d[i]; lo += w.d[i + 1]; raus.push({ lat: la / 1e4, lon: lo / 1e4 }) }
  return raus
}

/** Fahrten ohne ein einziges durchfahrenes Objekt fallen weg */
export function leereFahrtenWeg() {
  const h = heftLesen()
  const vorher = h.fahrten.length
  h.fahrten = h.fahrten.filter((f) => f.manuell || f.notiz || f.objekte.length > 0)
  if (h.fahrten.length !== vorher) schreiben(h)
}

/** Löscht die erlebten Objekte; das Logbuch mit den Fahrten bleibt */
export function heftLoeschen() {
  const h = heftLesen()
  h.objekte = {}
  schreiben(h)
}

/* ---------- Logbuch ---------- */

/** Eigene Notiz zu einer Fahrt; leer entfernt sie */
export function notizSetzen(beginn: number, notiz: string) {
  const h = heftLesen()
  const f = h.fahrten.find((x) => x.beginn === beginn)
  if (!f) return
  if (notiz.trim()) f.notiz = notiz.trim()
  else delete f.notiz
  schreiben(h)
}

/** Eine Fahrt ohne Fahrtmodus von Hand eintragen */
export function fahrtEintragen(beginn: number, von: string, nach: string, notiz: string) {
  const h = heftLesen()
  h.fahrten = [{ beginn, von, nach, objekte: [], manuell: true, ...(notiz.trim() ? { notiz: notiz.trim() } : {}) },
               ...h.fahrten].sort((a, b) => b.beginn - a.beginn)
  schreiben(h)
}

/** Eine Fahrt aus dem Logbuch; die erlebten Objekte im Sammelheft bleiben */
export function fahrtLoeschen(beginn: number) {
  const h = heftLesen()
  h.fahrten = h.fahrten.filter((f) => f.beginn !== beginn)
  schreiben(h)
}

export function logbuchLoeschen() {
  const h = heftLesen()
  h.fahrten = []
  schreiben(h)
}

/** Wann ein Objekt zum ersten Mal durchfahren wurde, sonst null */
export function erlebtAm(art: ErlebtArt, kennung: string): number | null {
  return heftLesen().objekte[schluesselVon(art, kennung)]?.zeit ?? null
}

export function datum(ms: number) {
  return new Date(ms).toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric', year: 'numeric' })
}
