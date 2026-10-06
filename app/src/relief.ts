import { holen } from './daten'
import type { Fahrweg } from './fahrt'

/**
 * Was die App über die 3D-Reliefs wissen muss, ohne three.js zu laden (das steckt in
 * komponenten/Relief.tsx und lädt erst, wenn ein Relief gezeigt wird).
 */

/** Näherungsformel von swisstopo, wie in pipeline/build_relief.py */
export function lv95(lat: number, lon: number): [number, number] {
  const p = (lat * 3600 - 169028.66) / 10000
  const l = (lon * 3600 - 26782.5) / 10000
  return [
    2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
    1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3,
  ]
}

interface ReliefUebersicht { reliefs: Array<{ name: string; titel: string; linie: string; rahmen: [number, number, number, number] }> }

/** So viel des Wegs muss im Ausschnitt liegen, damit «3D» erscheint */
const MIN_IM_RELIEF_M = 5000

/** Das Relief, durch das der Weg am längsten führt, oder null */
export async function reliefFuer(fahrweg: Fahrweg): Promise<{ name: string; titel: string } | null> {
  const u = await holen<ReliefUebersicht>('data/relief/index.json').catch(() => null)
  if (!u) return null
  let best: { name: string; titel: string; m: number } | null = null
  for (const r of u.reliefs) {
    const [e0, n0, e1, n1] = r.rahmen
    let m = 0
    for (let i = 1; i < fahrweg.punkte.length; i++) {
      const a = fahrweg.punkte[i]
      const [e, n] = lv95(a.lat, a.lon)
      if (e >= e0 && e <= e1 && n >= n0 && n <= n1) m += a.s - fahrweg.punkte[i - 1].s
    }
    if (m >= MIN_IM_RELIEF_M && (!best || m > best.m)) best = { name: r.name, titel: r.titel, m }
  }
  return best && { name: best.name, titel: best.titel }
}

