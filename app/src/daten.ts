import type {
  BahnhofIndex, BodenbedeckungDaten, IndexEintrag, KartenDaten, LinienProfil, LinienVerzeichnis, Profil, StandortDaten, StreckenGeometrie,
  FlaechenDaten, KartengrundDaten, KartenlinienDaten, SeenDaten, SehenswertDaten, StreckenNetz,
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

/* ---------- Ladebalken ---------- */

/** Was gerade lädt, für den Ladebalken oben (komponenten/Ladebalken.tsx; Michael, 2026-10-10: «Egal wo, wenn irgendwo
 *  etwas am Laden ist, soll eine Progressbar erscheinen»): seit dem letzten Stillstand begonnen und fertig */
export const laden = { begonnen: 0, fertig: 0,
  /** eine 3D-Szene lädt seit diesem Zeitpunkt (performance.now), sonst null: der Balken läuft dann mindestens
   *  SZENE_MS von 0 bis 100 % (Michael, 2026-10-10: «mindestens 3 Sekunden … nicht linear») */
  szeneAb: null as number | null,
  /** so viele Ladebalken stehen gerade in einer Karte (Michael, 2026-10-10: «in der Karte ganz oben»); dann zeigt der
   *  oben in der App die Szene nicht */
  inKarte: 0 }
export const SZENE_MS = 3000
const zuhoerer = new Set<() => void>()
export function ladenBeobachten(f: () => void) { zuhoerer.add(f); return () => { zuhoerer.delete(f) } }
const melden = () => zuhoerer.forEach((f) => f())

/** Eine 3D-Szene beginnt zu laden; läuft der Balken für eine Szene schon, bleibt er, wo er ist */
export function szeneLaden() {
  if (laden.szeneAb !== null) return
  laden.szeneAb = performance.now()
  melden()
}
/** der Ladebalken ist mit der Szene fertig */
export function szeneFertig() { laden.szeneAb = null; melden() }
export function balkenInKarte(dazu: 1 | -1) { laden.inKarte += dazu; melden() }

/** Zählt ein Versprechen im Ladebalken mit, bis es erfüllt oder gescheitert ist */
export function ladenVerfolgen<T>(p: Promise<T>): Promise<T> {
  if (laden.begonnen === laden.fertig) { laden.begonnen = 0; laden.fertig = 0 }
  laden.begonnen++
  melden()
  const ende = () => { laden.fertig++; melden() }
  p.then(ende, ende)
  return p
}

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

export async function holen<T>(pfad: string): Promise<T> {
  const treffer = zwischenspeicher.get(pfad)
  if (treffer) return treffer as T
  const daten = await ladenVerfolgen((async () => {
    const antwort = await abrufen(`${BASIS}${pfad}`)
    if (!antwort.ok) throw new Error(`${pfad} nicht gefunden (${antwort.status})`)
    return (await antwort.json()) as T
  })())
  zwischenspeicher.set(pfad, daten)
  return daten
}

/** Binärdaten wie die Höhen eines Reliefs (pipeline/build_relief.py) */
export async function holenBinaer(pfad: string): Promise<ArrayBuffer> {
  return ladenVerfolgen((async () => {
    const antwort = await abrufen(`${BASIS}${pfad}`)
    if (!antwort.ok) throw new Error(`${pfad} nicht gefunden (${antwort.status})`)
    return antwort.arrayBuffer()
  })())
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
export async function uebersichtLaden<T>(art: 'tunnel' | 'bruecken' | 'bahnuebergaenge'): Promise<Uebersicht<T>> {
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

/** Kantonsgrenzen und Bahnlinien für die Karte von «Geo», erst dort geladen */
export async function kartenlinienLaden(): Promise<KartenlinienDaten> {
  return holen<KartenlinienDaten>('data/kartenlinien.json')
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
