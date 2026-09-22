import type {
  BahnhofIndex, KartenDaten, LinienProfil, LinienVerzeichnis, Profil, StandortDaten, StreckenGeometrie,
  StreckenNetz,
  Uebersicht, Vergleichsdaten,
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

/** Bricht die Verbindung ab (schwacher Empfang, GitHub spielt gerade eine neue
 *  Version ein), wird nach einer Sekunde ein zweites Mal geladen. */
async function abrufen(url: string) {
  try {
    return await fetch(url)
  } catch {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      return await fetch(url)
    } catch {
      throw new Error('Die Verbindung zum Server kam nicht zustande.')
    }
  }
}

async function holen<T>(pfad: string): Promise<T> {
  const treffer = zwischenspeicher.get(pfad)
  if (treffer) return treffer as T
  const antwort = await abrufen(`${BASIS}${pfad}`)
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

/** Das Netz für die Seite «Strecke» */
export async function streckenLaden(): Promise<StreckenNetz> {
  return holen<StreckenNetz>('data/strecken.json')
}

/** Lage der Linien, erst geladen, wenn der Fahrtmodus startet */
export async function geometrieLaden(): Promise<StreckenGeometrie> {
  return holen<StreckenGeometrie>('data/strecken_geometrie.json')
}

/** Das Streckennetz für die kleine Karte zu den Tunneln */
export async function karteLaden(): Promise<KartenDaten> {
  return holen<KartenDaten>('data/karte.json')
}

/** Lage der Tunnel, Brücken und Bahnübergänge für die Seite «Standort» */
export async function standortLaden(): Promise<StandortDaten> {
  return holen<StandortDaten>('data/standort.json')
}
