/** Laub- oder Nadelbaum nach der Höhe über Meer (Michael, 2026-10-24, nach einer Übersicht der Höhenstufen der Alpentäler):
 *  bis 800 m vor allem Laubbäume (kollin, seit 2026-11-16 mit Nadelbäumen gemischt, NADEL_TIEF_*), 800 bis 1'500 m gemischt (montan), ab 1'500 m Nadelbäume (subalpin). Eine Annahme fürs Bild:
 *  welcher Baum wo steht, steht in keiner Quelle; swissTLM3D kennt Wald, aber nicht Laub- oder Nadelwald. In der Mischstufe
 *  steigt der Anteil der Nadelbäume mit der Höhe gleichmässig von 0 auf 100 %. */
export const LAUB_BIS_M = 800, NADEL_AB_M = 1500

/** auch im Flachland stehen Tannen (Michael, 2026-11-16: «es gibt auch im Flachland, bei 600 Meter zum Beispiel über Meer, auch viele
 *  Tannenbäume … Insofern gibt es dort ein Mischverhältnis»): bis LAUB_BIS_M so viele Nadelbäume im Wald, bei Einzelbäumen weniger (gewählt, in
 *  keiner Quelle); darüber steigt der Anteil bis NADEL_AB_M gleichmässig auf 100 % */
export const NADEL_TIEF_WALD = 0.4, NADEL_TIEF_EINZELN = 0.1

/** ein Nadelbaum? Je Stelle immer gleich (gestreut, nicht zufällig bei jedem Bau); wald: im Wald, nicht ein Einzelbaum */
export function istNadel(e: number, n: number, hoeheM: number, wald = true): boolean {
  if (hoeheM >= NADEL_AB_M) return true
  const tief = wald ? NADEL_TIEF_WALD : NADEL_TIEF_EINZELN
  const anteil = hoeheM <= LAUB_BIS_M ? tief : tief + (1 - tief) * (hoeheM - LAUB_BIS_M) / (NADEL_AB_M - LAUB_BIS_M)
  const r = Math.sin(e * 39.3468 + n * 11.135) * 24634.6345
  return r - Math.floor(r) < anteil
}

/** ein Nadelbaum ist schmaler als ein Laubbaum gleicher Art: so viel seiner Breite (gewählt, in keiner Quelle) */
export const NADEL_BREITE = 0.55

/** und so viel seiner Höhe (gewählt, in keiner Quelle; Michael, 2026-10-25: «Nadelbäume 20% weniger hoch») */
export const NADEL_HOEHE = 0.8
