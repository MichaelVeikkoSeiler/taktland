import type { ListenArt } from './typen'

/** Filter einer Liste: nur Einträge, deren Feld diesen Wert hat. wert null
 *  heisst: in den Daten steht nichts. */
export interface Filter { feld: string; wert: string | null }

/** #/linie/600/bruecken, gefiltert #/linie/600/bruecken?kanton=Ticino.
 *  Ein leerer Wert (?sicherungsart=) heisst: nichts eingetragen. */
export function listenAdresse(nr: number, art: ListenArt, filter?: Filter | null) {
  const basis = `#/linie/${nr}/${art}`
  return filter ? `${basis}?${filter.feld}=${encodeURIComponent(filter.wert ?? '')}` : basis
}

/** Der Filter aus dem Teil nach dem Fragezeichen, sonst null */
export function filterAusAdresse(abfrage: string | undefined): Filter | null {
  if (!abfrage) return null
  const [erstes] = [...new URLSearchParams(abfrage).entries()]
  return erstes ? { feld: erstes[0], wert: erstes[1] === '' ? null : erstes[1] } : null
}
