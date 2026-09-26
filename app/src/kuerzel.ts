/**
 * Kürzel vor den Namen von Brücken und Tunneln in den Quellen der SBB
 * («PDu Bahndamm», «U Kantonsstrasse», «PI de Clarens», «Sot. …»). Was sie
 * bedeuten, erklärt die Quelle nicht (docs/datenlage.md); Taktland löst sie
 * darum nicht auf. Im Fahrtmodus stören sie (Michael, 2026-09-26: «eher
 * störend als nützlich»): Dort steht der Name ohne das Kürzel gross, der
 * Name laut Quelle klein darunter. Weggelassen wird nur ein erstes Wort aus
 * dieser Liste, gezählt in data/raw/brucken.csv und tunnel.csv; Wörter wie
 * «Pont», «Ponte», «Viadukt» oder «Aarebr.» bleiben.
 */
const KUERZEL = new Set([
  'PI', 'U', 'PU', 'WU', 'Du', 'SU', 'SU.', 'Su', 'SUe', 'Sot.', 'Sot', 'Sott.', 'Pt', 'PT', 'Pte.',
  'BDu', 'PDu', 'WDu', 'KDu', 'LDu', 'DU', 'BU', 'Vi', 'Viad', 'Via', 'Via.', 'Br', 'Br.', 'Aq', 'AQ',
  'Attr.', 'Attr', 'Sent.', 'Rus.', 'Rusc.', 'Rus.sot.', 'Sot.Str.', 'Str.sot.', 'Sot.rus.', 'SM',
  'Überw.', 'Gal', 'TC',
])

/** Zusätze, die in der Quelle nach dem Kürzel stehen («PI voy Lausanne est», «Sot. str.
 *  Via Iragna», «Sent. Pers. Scaretta»): ebenfalls unerklärt, darum ebenfalls weg
 *  (Michael, 2026-09-26: «Das Voy verstehe ich auch nicht») */
const ZUSATZ = new Set([
  'voy', 'voy.', 'voyag', 'voyag.', 'voyageurs', 'piet', 'piét', 'piet.', 'piét.', 'piétons', 'pietons',
  'pers', 'pers.', 'sot', 'sot.', 'str', 'str.', 'rus', 'rus.', 'rusc', 'rusc.', 'attr', 'attr.', 'sent',
  'sent.', 'po', 'po.', 'p', 'ped', 'ped.', '.', 'sent.sot.', 'sent.attr.',
])
/** Verhältniswörter am Anfang, die nach dem Weglassen übrig bleiben («PI de Clarens») */
const VORNE = new Set(['de', 'du', 'des', 'sur', 'sous', 'di', 'del', 'della', 'sul', 'sulla'])

/** Der Name ohne führendes Kürzel und seine Zusätze; bleibt nichts übrig, der ganze Name.
 *  Der Name laut Quelle geht nicht verloren: Wo gekürzt wird, steht er klein dabei. */
export function ohneKuerzel(name: string): string {
  const w = name.trim().split(/\s+/)
  if (!KUERZEL.has(w[0]) && !['Sent.sot.', 'Sent.attr.'].includes(w[0])) return name
  let i = 1
  while (i < w.length - 1 && ZUSATZ.has(w[i].toLowerCase())) i++
  while (i < w.length - 1 && VORNE.has(w[i].toLowerCase())) i++
  return i < w.length ? w.slice(i).join(' ') : name
}
