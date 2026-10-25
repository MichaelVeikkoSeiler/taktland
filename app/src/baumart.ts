/** Laub- oder Nadelbaum nach der Höhe über Meer (Michael, 2026-10-24, nach einer Übersicht der Höhenstufen der Alpentäler):
 *  bis 800 m Laubbäume (kollin), 800 bis 1'500 m gemischt (montan), ab 1'500 m Nadelbäume (subalpin). Eine Annahme fürs Bild:
 *  welcher Baum wo steht, steht in keiner Quelle; swissTLM3D kennt Wald, aber nicht Laub- oder Nadelwald. In der Mischstufe
 *  steigt der Anteil der Nadelbäume mit der Höhe gleichmässig von 0 auf 100 %. */
export const LAUB_BIS_M = 800, NADEL_AB_M = 1500

/** ein Nadelbaum? Je Stelle immer gleich (gestreut, nicht zufällig bei jedem Bau) */
export function istNadel(e: number, n: number, hoeheM: number): boolean {
  if (hoeheM <= LAUB_BIS_M) return false
  if (hoeheM >= NADEL_AB_M) return true
  const r = Math.sin(e * 39.3468 + n * 11.135) * 24634.6345
  return r - Math.floor(r) < (hoeheM - LAUB_BIS_M) / (NADEL_AB_M - LAUB_BIS_M)
}

/** ein Nadelbaum ist schmaler als ein Laubbaum gleicher Art: so viel seiner Breite (gewählt, in keiner Quelle) */
export const NADEL_BREITE = 0.55

/** und so viel seiner Höhe (gewählt, in keiner Quelle; Michael, 2026-10-25: «Nadelbäume 20% weniger hoch») */
export const NADEL_HOEHE = 0.8
