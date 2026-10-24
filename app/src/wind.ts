/**
 * Wind für die Windhose in der Modellbahn und in «3D Schweiz» (Michael, 2026-10-24: «eine Windhose hinzufügen, wo man sehen kann,
 * wie die Windverhältnisse sind. Auch mit Prognose für die nächste Woche»): die Messung kommt mit dem Wetter (src/wetter.ts), die
 * Prognose aus der lokalen Prognose von MeteoSchweiz (ogd-local-forecasting, Open Government Data, stündlich neu, je Station
 * Stundenwerte bis 192 Stunden voraus): Windgeschwindigkeit als Stundenmittel (fu3010h0), Böenspitze als Stundenmaximum
 * (fu3010h1) und Windrichtung als Stundenmittel (dkl010h0), alle Zeiten in UTC; dazu der Niederschlag als Stundensumme (rre150h0) und die
 * Temperatur als Stundenmittel (tre200h0) für Regen und Schnee zur gewählten Stunde (Michael, 2026-10-24: «Regen auch einblenden mit der
 * gleichen Prognose wie die Windhose»), gezeichnet nach denselben Annahmen wie bei der Messung (src/wetter.ts).
 *
 * Eine Datei je Grösse und Lauf ist etwa 32 MB gross, die Zeilen nach Punktart und Nummer (als Text) geordnet; die App sucht die
 * Zeilen ihrer Station mit Teilabrufen (Range) und holt so nur einige Kilobyte.
 */
import { NASS_AB_MM, SCHNEE_BIS_C, STARK_AB_MM, type Station, type Wind } from './wetter'

const QUELLE = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-local-forecasting/'
// Sonnenscheindauer in Minuten (sre000h0) und Globalstrahlung (gre000h0) je Stunde für die Bewölkung, wie bei der Messung
const GROESSEN = ['fu3010h0', 'fu3010h1', 'dkl010h0', 'rre150h0', 'tre200h0', 'sre000h0', 'gre000h0'] as const
/** die Punktart «Station» in der Prognose */
const STATION = '1'

/** eine Stunde der Prognose: Wind, Niederschlag in mm in dieser Stunde, Temperatur in °C */
export interface WindStunde extends Wind {
  zeit: Date; mm: number | null; temperatur: number | null
  /** 0 klar bis 1 bedeckt aus der Sonnenscheindauer der Stunde, null nachts oder ohne Angabe */
  bewoelkt: number | null
}

/** was gezeichnet wird: Regen oder Schnee und wie stark (0 bis 1), nach denselben Annahmen wie bei der Messung; die Schwelle gilt dort
 *  für 30 Minuten, hier für eine Stunde, darum die Stärke erst beim Doppelten voll */
export function niederAusStunde(s: WindStunde): { art: 'regen' | 'schnee'; staerke: number } | null {
  if (s.mm === null || s.mm < NASS_AB_MM) return null
  return { art: s.temperatur !== null && s.temperatur <= SCHNEE_BIS_C ? 'schnee' : 'regen', staerke: Math.min(1, 0.3 + s.mm / (2 * STARK_AB_MM)) }
}

const zwei = (x: number) => String(x).padStart(2, '0')
const datei = (lauf: Date, groesse: string) => {
  const t = `${lauf.getUTCFullYear()}${zwei(lauf.getUTCMonth() + 1)}${zwei(lauf.getUTCDate())}`
  return `${QUELLE}${t}-ch/vnut12.lssw.${t}${zwei(lauf.getUTCHours())}00.${groesse}.csv`
}

let laufZwischen: { bis: number; lauf: Promise<{ lauf: Date; laengen: number[] } | null> } | null = null
/** der neueste Lauf (für alle Stationen gleich, zehn Minuten behalten) */
function neuesterLauf() {
  if (!laufZwischen || laufZwischen.bis < Date.now()) laufZwischen = { bis: Date.now() + 600e3, lauf: laufSuchen() }
  return laufZwischen.lauf
}
/** der neueste Lauf, den es für alle Grössen schon gibt, mit der Grösse jeder Datei */
async function laufSuchen(): Promise<{ lauf: Date; laengen: number[] } | null> {
  const jetzt = new Date(); jetzt.setUTCMinutes(0, 0, 0)
  for (let zurueck = 0; zurueck < 8; zurueck++) {
    const lauf = new Date(jetzt.getTime() - zurueck * 3600e3)
    const laengen = await Promise.all(GROESSEN.map(async (g) => {
      const a = await fetch(datei(lauf, g), { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null)
      return a?.ok ? Number(a.headers.get('content-length')) || 0 : 0
    }))
    if (laengen.every((l) => l > 0)) return { lauf, laengen }
  }
  return null
}

async function stueck(url: string, von: number, bis: number) {
  const a = await fetch(url, { headers: { Range: `bytes=${von}-${bis}` }, signal: AbortSignal.timeout(15000) })
  if (!a.ok) throw new Error(`Prognose ${a.status}`)
  return a.text()
}

/** [Punktart, Nummer] einer Zeile; so ist die Datei geordnet (als Text) */
const vergleich = (a: [string, string], b: [string, string]) => (a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[1] === b[1] ? 0 : a[1] < b[1] ? -1 : 1)

/** wie bei der Messung: am Tag (Strahlung ab 10 W/m²) der Teil der Stunde ohne Sonne */
function bewoelktAus(sonneMin: number | null, strahlung: number | null) {
  return sonneMin === null || strahlung === null || strahlung < 10 ? null : Math.max(0, Math.min(1, 1 - sonneMin / 60))
}

/** alle Zeilen eines Punkts in einer Datei: halbieren, bis der Bereich klein ist, dann ihn ganz holen; anteil: wo der Punkt in einer
 *  anderen Datei desselben Laufs lag (die Dateien sind gleich geordnet), dann nur in dessen Nähe suchen */
async function zeilenVon(url: string, laenge: number, punkt: number, anteil?: number): Promise<{ zeilen: Array<[Date, number | null]>; anteil: number }> {
  const ziel: [string, string] = [STATION, String(punkt)]
  let lo = 0, hi = laenge
  if (anteil !== undefined) {
    // erst prüfen, ob der Punkt im Fenster liegt, sonst wie gewohnt
    const a = Math.max(0, Math.floor(anteil * laenge) - 262144), b = Math.min(laenge, Math.floor(anteil * laenge) + 262144)
    const schluessel = async (bei: number) => {
      const t = (await stueck(url, bei, bei + 400)).split('\n')[1]?.split(';')
      return t && t.length >= 4 ? vergleich([t[1], t[0]], ziel) : 1
    }
    if ((a === 0 || await schluessel(a) < 0) && (b === laenge || await schluessel(b) >= 0)) { lo = a; hi = b }
  }
  while (hi - lo > 16384) {
    const mitte = Math.floor((lo + hi) / 2)
    const text = await stueck(url, mitte, mitte + 400)
    const zeile = text.split('\n')[1]
    const t = zeile?.split(';')
    if (!t || t.length < 4) { hi = mitte; continue }
    if (vergleich([t[1], t[0]], ziel) < 0) lo = mitte; else hi = mitte
  }
  // ein Punkt hat etwa 220 Zeilen zu 25 bis 30 Zeichen
  const text = await stueck(url, lo, Math.min(laenge - 1, hi + 12000))
  const aus: Array<[Date, number | null]> = []
  for (const z of text.split('\n')) {
    const t = z.split(';')
    if (t.length < 4 || t[1] !== ziel[0] || t[0] !== ziel[1]) continue
    const d = t[2]
    const zeit = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10), +d.slice(10, 12)))
    aus.push([zeit, t[3].trim() === '' ? null : Number(t[3])])
  }
  return { zeilen: aus, anteil: lo / laenge }
}

const zwischen = new Map<string, { bis: number; daten: Promise<WindStunde[] | null> }>()

/** die stündliche Prognose für die Station, von der laufenden Stunde an; null, wenn sie nicht erreichbar ist */
export function windPrognose(s: Station): Promise<WindStunde[] | null> {
  if (s.prognose === null) return Promise.resolve(null)
  const alt = zwischen.get(s.kuerzel)
  if (alt && alt.bis > Date.now()) return alt.daten
  const daten = (async () => {
    const l = await neuesterLauf()
    if (!l) return null
    // die erste Datei ganz durchsuchen, die anderen nur um dieselbe Stelle
    const erste = await zeilenVon(datei(l.lauf, GROESSEN[0]), l.laengen[0], s.prognose!)
    const reihen = [erste.zeilen, ...(await Promise.all(GROESSEN.slice(1).map((g, i) =>
      zeilenVon(datei(l.lauf, g), l.laengen[i + 1], s.prognose!, erste.anteil)))).map((x) => x.zeilen)]
    const nach = reihen.map((r) => new Map(r.map(([z, w]) => [z.getTime(), w])))
    const ab = Date.now() - 3600e3
    return reihen[0].filter(([z]) => z.getTime() >= ab).map(([z, kmh]) => ({
      zeit: z, kmh, boe: nach[1].get(z.getTime()) ?? null, richtung: nach[2].get(z.getTime()) ?? null,
      mm: nach[3].get(z.getTime()) ?? null, temperatur: nach[4].get(z.getTime()) ?? null,
      bewoelkt: bewoelktAus(nach[5].get(z.getTime()) ?? null, nach[6].get(z.getTime()) ?? null),
    }))
  })().catch(() => null)
  // eine Stunde behalten, einen Fehler nur kurz
  zwischen.set(s.kuerzel, { bis: Date.now() + 3600e3, daten })
  void daten.then((d) => { if (!d) zwischen.set(s.kuerzel, { bis: Date.now() + 60e3, daten }) })
  return daten
}

/** «SW» zu Grad, woher der Wind weht */
export function himmelsrichtungKurz(grad: number) {
  return ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round((((grad % 360) + 360) % 360) / 45) % 8]
}
