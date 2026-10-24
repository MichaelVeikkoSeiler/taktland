/**
 * Vier Windhosen über das Modell verteilt (Michael, 2026-10-24: «Windhose: immer vier davon verteilen»): in «3D Schweiz» je eine in der
 * Mitte jedes Viertels, in der Modellbahn entlang der Strecke; jede mit dem Wind der nächsten Station zu ihrem Platz, die Wind misst (Messung und Prognose wie src/wind.ts). Die Windhose
 * steht also nicht an der Station; welche Station sie zeigt, nennt die Tafel. Liegen zwei Viertel derselben Station am nächsten,
 * zeigen beide denselben Wind.
 */
import { messungVon, stationenBei, type Station, type Wind } from './wetter'
import { windPrognose, type WindStunde } from './wind'

export interface WindPlatz {
  /** wo die Windhose steht (LV95) und welches Viertel */
  e: number; n: number; viertel: string
  station: Station | null
  messung: Wind | null
  /** kommt nach, null bis dahin oder ohne */
  prognose: WindStunde[] | null
}

/** die Mitten der vier Viertel des Rechtecks Ost e0 bis e1, Nord n0 bis n1 */
export function viertelMitten(e0: number, n0: number, e1: number, n1: number) {
  return ([[0.25, 0.75, 'Nordwesten'], [0.75, 0.75, 'Nordosten'], [0.25, 0.25, 'Südwesten'], [0.75, 0.25, 'Südosten']] as const)
    .map(([fx, fy, viertel]) => ({ e: e0 + (e1 - e0) * fx, n: n0 + (n1 - n0) * fy, viertel }))
}

/** zu jedem Platz die Station und ihre Messung; nachher: wenn eine Prognose angekommen ist */
export async function windPlaetze(punkte: Array<{ e: number; n: number; viertel: string }>, nachher: () => void): Promise<WindPlatz[]> {
  return Promise.all(punkte.map(async ({ e, n, viertel }): Promise<WindPlatz> => {
    const liste = await stationenBei(e, n)
    let station: Station | null = liste[0] ?? null, messung: Wind | null = null
    for (const s of liste.slice(0, 3)) {
      const m = await messungVon(s)
      if (m?.wind) { station = s; messung = m.wind; break }
    }
    const platz: WindPlatz = { e, n, viertel, station, messung, prognose: null }
    if (station) void windPrognose(station).then((p) => { platz.prognose = p; nachher() })
    return platz
  }))
}

/** der Wind eines Platzes: gemessen (zeit null) oder zur Stunde der Prognose */
export function windZur(p: WindPlatz, zeit: Date | null): Wind | null {
  if (!zeit) return p.messung
  return p.prognose?.find((s) => s.zeit.getTime() === zeit.getTime()) ?? null
}
