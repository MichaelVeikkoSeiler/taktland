/**
 * «Welcher Zug?» (Stufe 1, Michael, 2026-09-26): welche Züge laut Fahrplan
 * bald vom Start Richtung Ziel fahren, und der nächste Halt des gewählten
 * Zugs. Taktland nimmt nie selbst einen Zug an: Den Zug wählt die Nutzerin
 * oder der Nutzer. Alle Zeiten gelten «laut Fahrplan»; Verspätungen, Ausfälle,
 * Extrazüge und Ersatzbusse kennt Taktland nicht.
 */
import { fahrplanFahrtenLaden, fahrplanHaltLaden, fahrplanInfoLaden } from './daten'
import type { FahrplanFahrt, FahrplanInfo } from './typen'

/** So weit zurück und voraus sucht die Frage beim Start */
const ZURUECK_MIN = 20
const VORAUS_MIN = 60
const HOECHSTENS = 6

export interface Zug {
  id: number
  fahrt: FahrplanFahrt
  /** Mitternacht des Verkehrstags, Millisekunden */
  tag: number
  /** Abfahrt am Start und Ankunft am Ziel, Millisekunden */
  ab: number
  an: number
}

/** Verkehrstag d (Mitternacht, Ortszeit) im Fahrplan? */
function faehrt(info: FahrplanInfo, muster: number, tag: Date) {
  const [j, m, t] = info.von.split('-').map(Number)
  const i = Math.round((tag.getTime() - new Date(j, m - 1, t).getTime()) / 86_400_000)
  if (i < 0) return false
  const hex = info.tage[muster]
  const stelle = Math.floor(i / 4)
  if (stelle >= hex.length) return false
  return ((parseInt(hex[hex.length - 1 - stelle], 16) >> (i % 4)) & 1) === 1
}

const mitternacht = (d: Date, plusTage = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusTage)

/** «IC 2», «S 10», «IR 36»; ohne Linie die Gattung */
export function zugName(f: FahrplanFahrt) {
  const l = f.l || f.g
  const m = /^([A-Za-z]+)(\d.*)$/.exec(l)
  return m ? `${m[1]} ${m[2]}` : l
}

export function uhr(ms: number) {
  return new Date(ms).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
}

export type Zugsuche = { art: 'ohneFahrplan'; bis: string | null } | { art: 'zuege'; zuege: Zug[]; stand: string }

/** Züge, die laut Fahrplan um jetzt vom Start zum Ziel fahren (beide mit Halt) */
export async function zuegeSuchen(von: number, nach: number, jetzt = new Date()): Promise<Zugsuche> {
  let info: FahrplanInfo
  try { info = await fahrplanInfoLaden() } catch { return { art: 'ohneFahrplan', bis: null } }
  const [a, b] = await Promise.all([fahrplanHaltLaden(von), fahrplanHaltLaden(nach)])
  const amZiel = new Map(b.map(([id, an, ab]) => [id, an ?? ab]))
  const funde: Array<Omit<Zug, 'fahrt'> & { muster: number }> = []
  for (const tagOffset of [0, -1]) {
    const tag = mitternacht(jetzt, tagOffset)
    for (const [id, , ab, muster] of a) {
      const an = amZiel.get(id)
      if (ab === null || an == null || an <= ab) continue
      const abMs = tag.getTime() + ab * 60_000
      if (abMs < jetzt.getTime() - ZURUECK_MIN * 60_000 || abMs > jetzt.getTime() + VORAUS_MIN * 60_000) continue
      if (!faehrt(info, muster, tag)) continue
      funde.push({ id, tag: tag.getTime(), ab: abMs, an: tag.getTime() + an * 60_000, muster })
    }
  }
  const heute = mitternacht(jetzt).getTime()
  const [j, m, t] = info.bis.split('-').map(Number)
  if (!funde.length && heute > new Date(j, m - 1, t).getTime()) return { art: 'ohneFahrplan', bis: info.bis }
  funde.sort((x, y) => x.ab - y.ab)
  const gewaehlt = funde.slice(0, HOECHSTENS)
  const zuege = await Promise.all(gewaehlt.map(async (z) => ({ ...z, fahrt: await fahrtLaden(z.id, info) })))
  return { art: 'zuege', zuege, stand: info.stand }
}

async function fahrtLaden(id: number, info: FahrplanInfo) {
  const d = await fahrplanFahrtenLaden(Math.floor(id / info.je_datei))
  return d[id % info.je_datei]
}

/** Der nächste Halt nach dem Halt am Bahnhof uic, oder null am Ende */
export function haltNach(z: Zug, uic: number) {
  const i = z.fahrt.h.findIndex((x) => x[0] === uic)
  return i >= 0 && i + 1 < z.fahrt.h.length ? z.fahrt.h[i + 1] : null
}

/** Minuten ab Mitternacht des Verkehrstags in Millisekunden */
export const zeitVon = (z: Zug, min: number) => z.tag + min * 60_000

/** «Stand 23.9.2026» aus «20260923» */
export function standText(stand: string) {
  return `${Number(stand.slice(6, 8))}.${Number(stand.slice(4, 6))}.${stand.slice(0, 4)}`
}

/** Einen gemerkten Zug wieder laden (Fahrt fortsetzen); passt die Nummer nicht mehr, keiner */
export async function zugLaden(g: { id: number; tag: number; n: string }): Promise<Zug | null> {
  try {
    const info = await fahrplanInfoLaden()
    const fahrt = await fahrtLaden(g.id, info)
    return fahrt && fahrt.n === g.n ? { id: g.id, fahrt, tag: g.tag, ab: 0, an: 0 } : null
  } catch {
    return null
  }
}
