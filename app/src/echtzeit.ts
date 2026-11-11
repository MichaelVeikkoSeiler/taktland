/**
 * Echtzeit der Züge in der Virtuellen Schweiz (Michael, 2026-11-11: «Langsam könnten wir uns an die realen Zugfahrzeiten heranwagen», «ok gehen wirs
 * an»): GTFS-Realtime von opentransportdata.swiss, geholt von server/spiel/echtzeit.php auf spiel.taktland.ch (mit dem Schlüssel, höchstens zwei
 * Abfragen je Minute); die App fragt dort alle ECHTZEIT_ALLE_MS nach den Fahrten, die gerade unterwegs sind, und schreibt je Fahrt und Verkehrstag
 * die Verspätung je Halt in ZugFahrt.echt. Gemeldet sind nur Zeiten an den Halten (auf 0,1 Minuten genau); wo der Zug dazwischen ist, rechnet
 * zuege3d.ts weiter selbst. Fahrten, die nicht im Fahrplan stehen, fehlen (ihr Weg ist unbekannt).
 */
import { holen } from './daten'
import { type ZugFahrt, type ZugIndex } from './zuege3d'

export const ECHTZEIT_URL: string = import.meta.env.VITE_ECHTZEIT_URL ?? 'https://spiel.taktland.ch/echtzeit.php'
/** so oft fragt die App, gewählt: die Plattform erneuert alle 30 s, echtzeit.php holt höchstens alle 35 s */
export const ECHTZEIT_ALLE_MS = 30_000
/** älter als das gilt die Meldung nicht mehr (Server oder Plattform stehen), gewählt */
export const ECHTZEIT_ALT_S = 600

/** je Halt die Verspätung in Minuten bei Ankunft und Abfahrt; ohne Meldung davor 0 (laut Fahrplan) */
export interface Echtzeit { an: number[]; ab: number[]; ausfall: boolean; halt: boolean[]; gemeldet: boolean[] }

/** wie es um die Echtzeit steht, für Schild und Anleitung */
export const echtzeitStand: { ok: boolean; grund: string | null; zeit: number } = { ok: false, grund: null, zeit: 0 }

const adresse = (pfad: string) => new URL(`zuege3d/${pfad}`, window.location.href).href
type Reise = [string, number[]]
let reisenVorrat: Promise<Reise[][] | null> | null = null
function reisenLaden(): Promise<Reise[][] | null> {
  reisenVorrat ??= holen<Reise[][]>(adresse('fahrten.json')).catch(() => null)
  return reisenVorrat
}

/** Tag ab index.von aus start_date (JJJJMMTT) */
function tagVon(ix: ZugIndex, datum: string): number {
  const [j, m, t] = ix.von.split('-').map(Number)
  return Math.round((Date.UTC(+datum.slice(0, 4), +datum.slice(4, 6) - 1, +datum.slice(6, 8)) - Date.UTC(j, m - 1, t)) / 86_400_000)
}

type Meldung = [number, number | null, number | null, number]
/** die Meldungen einer Fahrt auf ihre Halte: an einem Halt mit Meldung deren Verspätung, sonst die der letzten Meldung davor (so verlangt es
 *  GTFS-RT), vor der ersten Meldung keine */
function aufHalte(seqs: number[], art: number, meldungen: Meldung[]): Echtzeit {
  const m = [...meldungen].sort((a, b) => a[0] - b[0])
  const e: Echtzeit = { an: [], ab: [], ausfall: art === 3 || art === 7, halt: [], gemeldet: [] }
  let j = 0, letzte: number | null = null
  for (const s of seqs) {
    while (j < m.length && m[j][0] < s) { letzte = m[j][2] ?? m[j][1] ?? letzte; j++ }
    let an: number | null = letzte, ab: number | null = letzte, aus = false, gemeldet = false
    if (j < m.length && m[j][0] === s) {
      an = m[j][1] ?? m[j][2] ?? letzte; ab = m[j][2] ?? m[j][1] ?? an
      aus = m[j][3] === 1; gemeldet = m[j][1] !== null || m[j][2] !== null
      letzte = ab; j++
    }
    e.an.push((an ?? 0) / 60); e.ab.push((ab ?? 0) / 60); e.halt.push(aus); e.gemeldet.push(gemeldet || letzte !== null)
  }
  return e
}

/** fragt nach den Fahrten und schreibt die Echtzeit in f.echt; bleibt still, wenn es nicht geht (dann gilt der Fahrplan) */
export async function echtzeitHolen(ix: ZugIndex, fahrten: ZugFahrt[]): Promise<void> {
  const reisen = await reisenLaden()
  if (!reisen) { echtzeitStand.ok = false; echtzeitStand.grund = 'ohne Fahrtnummern'; return }
  const je = new Map<string, { f: ZugFahrt; seqs: number[] }>()
  for (const f of fahrten) for (const [tid, seqs] of reisen[f.id] ?? []) if (seqs.length === f.halte.length) je.set(tid, { f, seqs })
  if (!je.size) return
  let a: { v: string; zeit: number; alter: number; f: Record<string, Array<[string, number, Meldung[]]>> }
  try {
    const r = await fetch(`${ECHTZEIT_URL}?a=fahrten`, { method: 'POST', body: JSON.stringify({ t: [...je.keys()] }), signal: AbortSignal.timeout(20_000) })
    if (!r.ok) throw new Error(String(r.status))
    a = await r.json()
  } catch { echtzeitStand.ok = false; echtzeitStand.grund = 'nicht erreichbar'; return }
  // die Fahrtnummern wechseln mit jeder Fassung des Fahrplans: nur dieselbe
  if (a.v !== ix.stand) { echtzeitStand.ok = false; echtzeitStand.grund = 'andere Fassung des Fahrplans'; return }
  if (a.alter > ECHTZEIT_ALT_S) { echtzeitStand.ok = false; echtzeitStand.grund = 'veraltet'; return }
  echtzeitStand.ok = true; echtzeitStand.grund = null; echtzeitStand.zeit = a.zeit
  const neu = new Map<ZugFahrt, Map<number, Echtzeit>>()
  for (const [tid, liste] of Object.entries(a.f)) {
    const x = je.get(tid)
    if (!x) continue
    for (const [datum, art, meldungen] of liste) {
      const tag = tagVon(ix, datum)
      if (!((x.f.tage >> tag) & 1)) continue
      ;(neu.get(x.f) ?? neu.set(x.f, new Map()).get(x.f)!).set(tag, aufHalte(x.seqs, art, meldungen))
    }
  }
  // gefragt und nichts gemeldet: keine Echtzeit (die Plattform meldet nur, was sich ändert, oder die Bahn liefert nichts)
  for (const { f } of je.values()) f.echt = neu.get(f)
}
