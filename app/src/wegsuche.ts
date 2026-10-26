import type { StreckenAbschnitt } from './typen'

/** Weg im Netz der Seite «Strecke», aus komponenten/Strecke.tsx herausgelöst, damit 3D-Land ihn ohne die Seite nutzen kann */
export interface Weg {
  punkte: string[]
  abschnitte: StreckenAbschnitt[]
}

export type Nachbarn = Map<string, Array<[string, StreckenAbschnitt]>>

/**
 * Kürzester Weg nach dem Gewicht der Abschnitte (Dijkstra). Das Gewicht ist
 * die Luftlinie, bei wenig befahrenen Abschnitten erhöht; es dient nur der
 * Suche und wird nirgends angezeigt. generator/strecken.py sucht gleich.
 */
export function wegSuchen(nachbarn: Nachbarn, start: string, ziel: string): Weg | null {
  if (start === ziel) return { punkte: [start], abschnitte: [] }
  const dist = new Map<string, number>([[start, 0]])
  const vor = new Map<string, [string, StreckenAbschnitt]>()
  const haufen: Array<[number, string]> = [[0, start]]
  const tauschen = (i: number, j: number) => { [haufen[i], haufen[j]] = [haufen[j], haufen[i]] }
  const hinein = (x: [number, string]) => {
    haufen.push(x)
    let i = haufen.length - 1
    while (i > 0 && haufen[(i - 1) >> 1][0] > haufen[i][0]) { tauschen(i, (i - 1) >> 1); i = (i - 1) >> 1 }
  }
  const heraus = () => {
    const oben = haufen[0]
    const letzter = haufen.pop()!
    if (haufen.length) {
      haufen[0] = letzter
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let k = i
        if (l < haufen.length && haufen[l][0] < haufen[k][0]) k = l
        if (r < haufen.length && haufen[r][0] < haufen[k][0]) k = r
        if (k === i) break
        tauschen(i, k)
        i = k
      }
    }
    return oben
  }
  while (haufen.length) {
    const [d, u] = heraus()
    if (u === ziel) break
    if (d > (dist.get(u) ?? Infinity)) continue
    for (const [v, e] of nachbarn.get(u) ?? []) {
      const neu = d + e.gewicht
      if (neu < (dist.get(v) ?? Infinity)) {
        dist.set(v, neu)
        vor.set(v, [u, e])
        hinein([neu, v])
      }
    }
  }
  if (!dist.has(ziel)) return null
  const punkte = [ziel]
  const abschnitte: StreckenAbschnitt[] = []
  let u = ziel
  while (u !== start) {
    const [p, e] = vor.get(u)!
    abschnitte.push(e)
    punkte.push(p)
    u = p
  }
  return { punkte: punkte.reverse(), abschnitte: abschnitte.reverse() }
}

