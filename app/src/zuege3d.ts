/**
 * Züge laut Fahrplan für 3D-Land (3dland.ch), nicht für Taktland (Michael, 2026-10-26: «gehen wir mal die Züge an. Aber NUR für
 * 3DLand»). Die Daten baut pipeline/build_zuege3d.py im Workflow von 3dland.ch und legt sie neben die Seite (zuege3d/); je
 * 10-km-Kachel die Fahrten, deren Weg sie berührt. Hier steht, wo ein Zug zu einer Zeit laut Fahrplan ist: an einem Halt
 * zwischen Ankunft und Abfahrt, sonst zwischen zwei Halten. Zwischen zwei Halten fährt er gleichmässig auf dem kürzesten
 * Weg im Netz, eine Annahme: Anfahren, Bremsen und der wirkliche Weg stehen in keiner unserer Quellen.
 */
import { geometrieLaden, holen, streckenLaden } from './daten'
import { type Fahrweg, fahrwegBauen, geometrieLesen } from './fahrt'
import type { StreckenNetz } from './typen'
import { type Nachbarn, wegSuchen } from './wegsuche'

export interface ZugIndex {
  quelle: string; datei: string; stand: string; von: string; bis: string; kachel_m: number; hinweis: string
  tage: string[]; kacheln: string[]
  /** Werte je Halt: 3 (Betriebspunkt, Ankunft, Abfahrt), seit 2026-10-26 4 mit dem Gleis */
  je_halt?: number
}

export interface ZugFahrt {
  id: number; nummer: string; gattung: string; linie: string; ziel: string
  /** Verkehrstage, Bit 0 = index.von */
  tage: number
  /** die Halte: Betriebspunkt, Ankunft und Abfahrt in Minuten ab Mitternacht des Verkehrstags (null am Anfang und Ende) */
  halte: Array<{ abk: string; an: number | null; ab: number | null; gleis: string | null }>
}

/** die Daten liegen auf 3dland.ch neben der Seite, nicht bei taktland.ch */
const adresse = (pfad: string) => new URL(`zuege3d/${pfad}`, window.location.href).href

let indexVorrat: Promise<ZugIndex | null> | null = null
export function zugIndexLaden(): Promise<ZugIndex | null> {
  indexVorrat ??= holen<ZugIndex>(adresse('index.json')).catch(() => null)
  return indexVorrat
}

type Roh = [number, string, string, string, string, number, Array<string | number | null>]

/** die Fahrten der Kacheln um ein Rechteck in LV95, je Fahrt einmal */
export async function zuegeLaden(ix: ZugIndex, e0: number, n0: number, e1: number, n1: number): Promise<ZugFahrt[]> {
  const k = ix.kachel_m, da = new Set(ix.kacheln), namen: string[] = []
  for (let ex = Math.floor(e0 / k); ex <= Math.floor(e1 / k); ex++) {
    for (let ny = Math.floor(n0 / k); ny <= Math.floor(n1 / k); ny++) if (da.has(`${ex}_${ny}`)) namen.push(`${ex}_${ny}`)
  }
  const tage = ix.tage.map((t) => parseInt(t, 16))
  const alle = new Map<number, ZugFahrt>()
  for (const liste of await Promise.all(namen.map((n) => holen<Roh[]>(adresse(`${n}.json`)).catch(() => [] as Roh[])))) {
    for (const [id, nummer, gattung, linie, ziel, t, flach] of liste) {
      if (alle.has(id)) continue
      const halte: ZugFahrt['halte'] = []
      const je = ix.je_halt ?? 3
      for (let i = 0; i + 2 < flach.length; i += je) {
        halte.push({ abk: flach[i] as string, an: flach[i + 1] as number | null, ab: flach[i + 2] as number | null,
          gleis: je >= 4 ? (flach[i + 3] as string | null) : null })
      }
      alle.set(id, { id, nummer, gattung, linie, ziel, tage: tage[t] ?? 0, halte })
    }
  }
  return [...alle.values()]
}

/** jetzt in der Schweiz: Tag ab index.von und Minuten ab Mitternacht mit Bruchteil */
/** nur in der Testfassung (VITE_S3D_TEST): so viele Minuten später als jetzt */
export const zugTest = { versatzMin: 0 }
export function jetztImFahrplan(ix: Pick<ZugIndex, 'von'>, zeit = new Date(Date.now() + zugTest.versatzMin * 60_000)): { tag: number; minuten: number } {
  const teile = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(zeit).map((p) => [p.type, p.value]))
  const heute = Date.UTC(Number(teile.year), Number(teile.month) - 1, Number(teile.day))
  const [j, m, t] = ix.von.split('-').map(Number)
  const tag = Math.round((heute - Date.UTC(j, m - 1, t)) / 86_400_000)
  return { tag, minuten: Number(teile.hour) * 60 + Number(teile.minute) + Number(teile.second) / 60 }
}

/** so lange steht ein Zug vor der ersten Abfahrt und nach der letzten Ankunft am Bahnhof (Michael, 2026-10-26: «Wenn sie halten
 *  verschwinden sie»); eine Annahme, gewählt: wie lange er dort steht, steht nicht im Fahrplan (block_id fehlt bei fast allen Zügen) */
export const ZUG_STEHT_MIN = 5

export type ZugStelle =
  | { art: 'halt'; i: number }
  | { art: 'fahrt'; i: number; anteil: number }

/** wo eine Fahrt am Tag und zur Minute laut Fahrplan ist, null: heute nicht unterwegs; auch Fahrten des Vortags nach Mitternacht */
export function zugStelle(f: ZugFahrt, tag: number, minuten: number): ZugStelle | null {
  for (const [d, m] of [[tag, minuten], [tag - 1, minuten + 1440]] as const) {
    if (d < 0 || !((f.tage >> d) & 1)) continue
    const h = f.halte, z = h.length - 1
    const erst = h[0].ab ?? h[0].an, letzt = h[z].an ?? h[z].ab
    if (erst === null || letzt === null || m < erst - ZUG_STEHT_MIN || m > letzt + ZUG_STEHT_MIN) continue
    for (let i = 0; i <= z; i++) {
      let an = h[i].an ?? h[i].ab!, ab = h[i].ab ?? h[i].an!
      if (i === 0) an = Math.min(an, erst - ZUG_STEHT_MIN)
      if (i === z) ab = Math.max(ab, letzt + ZUG_STEHT_MIN)
      if (m >= an && m <= ab) return { art: 'halt', i }
      const weiter = h[i + 1]
      if (!weiter) break
      const dort = weiter.an ?? weiter.ab!
      if (m > ab && m < dort) return { art: 'fahrt', i, anteil: (m - ab) / Math.max(0.01, dort - ab) }
    }
  }
  return null
}

/** Netz, Linien und Wege zwischen zwei Halten, einmal geladen und gerechnet */
export interface ZugNetz { netz: StreckenNetz; weg: (a: string, b: string) => Fahrweg | null }
let netzVorrat: Promise<ZugNetz> | null = null
export function zugNetzLaden(): Promise<ZugNetz> {
  netzVorrat ??= (async () => {
    const [netz, geo] = await Promise.all([streckenLaden(), geometrieLaden()])
    const linien = geometrieLesen(geo)
    const nachbarn: Nachbarn = new Map()
    for (const e of netz.abschnitte) {
      nachbarn.set(e.von, [...(nachbarn.get(e.von) ?? []), [e.nach, e]])
      nachbarn.set(e.nach, [...(nachbarn.get(e.nach) ?? []), [e.von, e]])
    }
    const wege = new Map<string, Fahrweg | null>()
    const weg = (a: string, b: string) => {
      const s = `${a}>${b}`
      if (!wege.has(s)) {
        const w = wegSuchen(nachbarn, a, b)
        let fw: Fahrweg | null = null
        if (w && w.abschnitte.length) {
          try { fw = fahrwegBauen(netz, linien, w.punkte, w.abschnitte, () => undefined, () => false) } catch { fw = null }
        }
        wege.set(s, fw)
      }
      return wege.get(s)!
    }
    return { netz, weg }
  })()
  return netzVorrat
}
