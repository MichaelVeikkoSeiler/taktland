import type {
  BahnhofIndex, LinienProfil, LinienVerzeichnis, Profil, Uebersicht, Vergleichsdaten,
} from './typen'

const BASIS = import.meta.env.BASE_URL

/**
 * Eingebettete Daten, falls die Seite als einzelne Datei ausgeliefert wird.
 * Dann gibt es keine Nebendateien, die geladen werden könnten.
 */
interface EingebetteteDaten {
  index: BahnhofIndex
  profile: Record<string, Profil>
}
const eingebettet = (window as unknown as { __TAKTLAND__?: EingebetteteDaten }).__TAKTLAND__

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

export async function indexLaden(): Promise<BahnhofIndex> {
  if (eingebettet) return eingebettet.index
  return holen<BahnhofIndex>('data/index.json')
}

export async function profilLaden(uic: number, sprache = 'de'): Promise<Profil> {
  const schluessel = `${uic}.${sprache}`
  if (eingebettet) {
    const p = eingebettet.profile[schluessel]
    if (p) return p
    throw new Error(`Profil ${schluessel} ist nicht eingebettet`)
  }
  return holen<Profil>(`data/profile/${schluessel}.json`)
}

export async function linienLaden(): Promise<LinienVerzeichnis> {
  return holen<LinienVerzeichnis>('data/linien.json')
}

export async function linienProfilLaden(nr: number, sprache = 'de'): Promise<LinienProfil> {
  return holen<LinienProfil>(`data/linien/${nr}.${sprache}.json`)
}

export async function vergleichLaden(): Promise<Vergleichsdaten> {
  return holen<Vergleichsdaten>('data/vergleich.json')
}

/** Alle erfassten Tunnel oder Brücken mit ihrer Linie */
export async function uebersichtLaden<T>(art: 'tunnel' | 'bruecken'): Promise<Uebersicht<T>> {
  return holen<Uebersicht<T>>(`data/${art}.json`)
}
