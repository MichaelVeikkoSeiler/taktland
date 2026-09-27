import type {
  BahnhofIndex, BodenbedeckungDaten, IndexEintrag, KartenDaten, LinienProfil, LinienVerzeichnis, Profil, StandortDaten, StreckenGeometrie,
  FlaechenDaten, KartengrundDaten, SeenDaten, SehenswertDaten, StreckenNetz,
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

/** Gipfel, KGS-Objekte und Seilbahnen für die Karten */
export async function sehenswertLaden(): Promise<SehenswertDaten> {
  return holen<SehenswertDaten>('data/sehenswert.json')
}

/** BLN, Pärke und Moorlandschaften für die Karten */
export async function flaechenLaden(): Promise<FlaechenDaten> {
  return holen<FlaechenDaten>('data/flaechen.json')
}

/** Grund der Karten: Schweiz, Kantone, Flüsse, Höhenstufen */
export async function kartengrundLaden(): Promise<KartengrundDaten> {
  return holen<KartengrundDaten>('data/kartengrund.json')
}

/** Wald und Siedlung (swissTLMRegio), gut 4 MB: erst laden, wenn eine Karte sie zeigt */
export async function bodenbedeckungLaden(): Promise<BodenbedeckungDaten> {
  return holen<BodenbedeckungDaten>('data/bodenbedeckung.json')
}

/** Die Seen für die Karten */
export async function seenLaden(): Promise<SeenDaten> {
  return holen<SeenDaten>('data/seen.json')
}

/** Lage der Tunnel, Brücken und Bahnübergänge für die Seite «Standort» */
export async function standortLaden(): Promise<StandortDaten> {
  return holen<StandortDaten>('data/standort.json')
}

/**
 * Bahnhöfe zur Wahl beim Fahren: die im Netz und die Ziele ohne Bahnhofsnummer
 * (Michael, 2026-09-27: «Brig nach Iselle»), diese ohne Bahnhofseite.
 */
export function fahrtZiele(index: BahnhofIndex | null): IndexEintrag[] {
  return [
    ...(index?.bahnhoefe ?? []).filter((b) => b.im_netz),
    ...(index?.ziele_ohne_bahnhof ?? []).map((z): IndexEintrag => ({
      uic: z.uic, name: z.name, kanton: null, tier: 'S', dwv: null, lat: z.lat, lon: z.lon,
      sprachen: [], im_netz: true, ohne_bahnhofseite: true })),
  ]
}

/** Name zu einer Nummer, auch für die Ziele ohne Bahnhofsnummer */
export function namenFuerFahrt(index: BahnhofIndex | null): Map<number, string> {
  return new Map(fahrtZiele(index).map((b) => [b.uic, b.name]))
}
