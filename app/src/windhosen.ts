/**
 * Vier Windhosen über das Modell verteilt (Michael, 2026-10-24: «Windhose: immer vier davon verteilen»): in «3D Schweiz» je eine in der
 * Mitte jedes Viertels, in der Modellbahn entlang der Strecke; jede mit dem Wind der nächsten Station zu ihrem Platz, die Wind misst (Messung und Prognose wie src/wind.ts). Die Windhose
 * steht also nicht an der Station; welche Station sie zeigt, nennt die Tafel. Liegen zwei Viertel derselben Station am nächsten,
 * zeigen beide denselben Wind.
 */
import { messungVon, stationenBei, windVerlauf, type Station, type Wind, type WindZeit } from './wetter'
import { windPrognose, type WindStunde } from './wind'

export interface WindPlatz {
  /** wo die Windhose steht (LV95) und welches Viertel */
  e: number; n: number; viertel: string
  station: Station | null
  messung: Wind | null
  /** kommt nach, null bis dahin oder ohne */
  prognose: WindStunde[] | null
  /** die Messungen von heute, alle 10 Minuten */
  heute: WindZeit[]
  /** die Stundenwerte früherer Tage, erst geladen, wenn eine solche Zeit gewählt ist (windFrueher) */
  frueher: WindZeit[] | null
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
    let station: Station | null = liste[0] ?? null, messung: Wind | null = null, heute: WindZeit[] = []
    for (const s of liste.slice(0, 3)) {
      const m = await messungVon(s)
      if (m?.wind) { station = s; messung = m.wind; heute = m.verlauf ?? []; break }
    }
    const platz: WindPlatz = { e, n, viertel, station, messung, prognose: null, heute, frueher: null }
    if (station) void windPrognose(station).then((p) => { platz.prognose = p; nachher() })
    return platz
  }))
}

/** der Wind eines Platzes: gemessen (zeit null) oder zur Stunde der Prognose */
export function windZur(p: WindPlatz, zeit: Date | null): Wind | null {
  if (!zeit) return p.messung
  return p.prognose?.find((s) => s.zeit.getTime() === zeit.getTime()) ?? null
}

/** am nächsten bei t, höchstens bis um */
function naechste<T extends { zeit: Date }>(liste: T[] | null, t: number, um: number): T | null {
  let best: T | null = null, d = um
  for (const x of liste ?? []) { const dx = Math.abs(x.zeit.getTime() - t); if (dx <= d) { d = dx; best = x } }
  return best
}

/** der Wind eines Platzes zur gewählten Zeit (Michael, 2026-11-01: «wenn man die Zeit nach vorne oder zurückspult … Prognose gegen vorne
 *  und gegen hinten … quasi als Historie nach hinten»): bis 10 Minuten um jetzt die letzte Messung, später die Stunde der Prognose (bis
 *  30 Minuten daneben), früher die Messung von heute (bis 10 Minuten daneben) oder der Stundenwert früherer Tage (bis 30 Minuten
 *  daneben); sonst nichts (die Windhose hängt grau, die Zahlen sind «–») */
export function windBei(p: WindPlatz, zeit: Date | null): Wind | null {
  if (!zeit) return p.messung
  const t = zeit.getTime(), jetzt = Date.now()
  if (Math.abs(t - jetzt) <= 10 * 60e3) return p.messung
  if (t > jetzt) return naechste(p.prognose, t, 30 * 60e3)
  return naechste(p.heute, t, 10 * 60e3) ?? naechste(p.frueher, t, 30 * 60e3)
}

/** braucht die Zeit Stundenwerte früherer Tage, werden sie geladen; nachher, wenn sie da sind */
export function windFrueher(plaetze: WindPlatz[], zeit: Date | null, nachher: () => void) {
  if (!zeit) return
  const t = zeit.getTime()
  for (const p of plaetze) {
    if (!p.station || (p.heute.length && p.heute[0].zeit.getTime() - 10 * 60e3 <= t) || t > Date.now()) continue
    if (p.frueher?.length && p.frueher[0].zeit.getTime() - 30 * 60e3 <= t) continue
    void windVerlauf(p.station, zeit).then((v) => { if (v !== p.frueher) { p.frueher = v; nachher() } })
  }
}
