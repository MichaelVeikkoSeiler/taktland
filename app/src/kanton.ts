/** Die Passagierfrequenz führt Jestetten und Lottstetten mit «Ausland» statt
 *  eines Kantonskürzels. «Kanton Ausland» gäbe es nicht. */
export function kantonText(kanton: string): string {
  return kanton === 'Ausland' ? 'Ausland' : `Kanton ${kanton}`
}

/** Wo die Quellen verschiedene Kantone nennen (Moutier: BE laut Passagierfrequenz, JU laut
 *  Haltestellendaten), stehen beide da: «Kanton BE / JU». Taktland wählt keine Quelle aus. */
export function kantoneText(e: { kanton: string | null; kanton_auch?: string[] }): string | null {
  if (!e.kanton) return null
  return e.kanton_auch?.length ? `Kanton ${[e.kanton, ...e.kanton_auch].join(' / ')}` : kantonText(e.kanton)
}
