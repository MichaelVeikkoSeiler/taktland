import type { BahnhofIndex, Profil } from './typen'

const BASIS = import.meta.env.BASE_URL

/** Einmal geladene Daten im Speicher halten, damit Offline-Aufrufe schnell sind. */
const zwischenspeicher = new Map<string, unknown>()

async function holen<T>(pfad: string): Promise<T> {
  const treffer = zwischenspeicher.get(pfad)
  if (treffer) return treffer as T
  const antwort = await fetch(`${BASIS}${pfad}`)
  if (!antwort.ok) throw new Error(`${pfad} nicht gefunden (${antwort.status})`)
  const daten = (await antwort.json()) as T
  zwischenspeicher.set(pfad, daten)
  return daten
}

export const indexLaden = () => holen<BahnhofIndex>('data/index.json')

export const profilLaden = (uic: number, sprache = 'de') =>
  holen<Profil>(`data/profile/${uic}.${sprache}.json`)
