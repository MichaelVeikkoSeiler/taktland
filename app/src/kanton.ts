/** Die Passagierfrequenz führt Jestetten und Lottstetten mit «Ausland» statt
 *  eines Kantonskürzels. «Kanton Ausland» gäbe es nicht. */
export function kantonText(kanton: string): string {
  return kanton === 'Ausland' ? 'Ausland' : `Kanton ${kanton}`
}
