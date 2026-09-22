import type { ListenArt } from './typen'

/** Filter einer Liste: nur Einträge, deren Feld diesen Wert hat. wert null
 *  heisst: in den Daten steht nichts. */
export interface Filter { feld: string; wert: string | null }

/** Der Wert einer Kachel als Text, wie er in der Adresse steht */
export function filterText(wert: string | number | null | undefined) {
  return wert === null || wert === undefined ? null : String(wert)
}

/** #/linie/600/bruecken, gefiltert #/linie/600/bruecken?kanton=Ticino.
 *  Ein leerer Wert (?sicherungsart=) heisst: nichts eingetragen. Mit eintrag
 *  (#/linie/600/bruecken?eintrag=12) hebt die Liste diesen Eintrag hervor. */
export function listenAdresse(nr: number, art: ListenArt, filter?: Filter | null, eintrag?: number) {
  const basis = `#/linie/${nr}/${art}`
  if (eintrag !== undefined) return `${basis}?eintrag=${eintrag}`
  return filter ? `${basis}?${filter.feld}=${encodeURIComponent(filter.wert ?? '')}` : basis
}

/** Der Filter aus dem Teil nach dem Fragezeichen, sonst null */
export function filterAusAdresse(abfrage: string | undefined): Filter | null {
  if (!abfrage) return null
  const [erstes] = [...new URLSearchParams(abfrage).entries()].filter(([k]) => k !== 'eintrag')
  return erstes ? { feld: erstes[0], wert: erstes[1] === '' ? null : erstes[1] } : null
}

/** Die Stelle des hervorgehobenen Eintrags, sonst null */
export function eintragAusAdresse(abfrage: string | undefined): number | null {
  const v = new URLSearchParams(abfrage ?? '').get('eintrag')
  return v !== null && /^\d+$/.test(v) ? Number(v) : null
}
