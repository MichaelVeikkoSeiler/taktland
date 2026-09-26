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

/** Der Name ohne führendes Kürzel; bleibt nichts übrig, der ganze Name */
export function ohneKuerzel(name: string): string {
  const [erstes, ...rest] = name.trim().split(/\s+/)
  return KUERZEL.has(erstes) && rest.length ? rest.join(' ') : name
}
