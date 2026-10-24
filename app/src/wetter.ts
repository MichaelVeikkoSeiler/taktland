/**
 * Das echte Wetter für die Modellbahn (Michael, 2026-10-24: «dass bei der Modellbahn immer das reale Wetter simuliert wird …
 * trotzdem hat man die Option, auf Schönwetter umzuschalten»): die letzte Messung der nächsten Wetterstation von MeteoSchweiz
 * (SwissMetNet, Open Government Data, alle 10 Minuten), daraus Bewölkung und Niederschlag fürs Bild.
 *
 * Gemessen werden Sonnenscheindauer, Niederschlag, Temperatur und Globalstrahlung; Bewölkung, Regen oder Schnee misst die Station
 * nicht. Darum, als Annahmen fürs Bild: bewölkt ist der Teil der letzten 10 Minuten ohne Sonnenschein (nur am Tag, nachts misst
 * niemand Sonne), Niederschlag ist gefallen, wenn in den letzten 30 Minuten mindestens NASS_AB_MM fiel, und bei höchstens
 * SCHNEE_BIS_C Grad wird er als Schnee gezeichnet.
 */
import { holen } from './daten'

export interface Station { kuerzel: string; name: string; e: number; n: number; hoehe: number }
export interface Wetter {
  station: Station
  /** Zeit der Messung (UTC aus der Quelle) */
  zeit: Date
  temperatur: number | null
  /** mm in den letzten 30 Minuten */
  niederschlag: number | null
  /** 0 klar bis 1 bedeckt; null nachts oder ohne Messung der Sonne */
  bewoelkt: number | null
  /** was gezeichnet wird */
  art: 'klar' | 'bewoelkt' | 'regen' | 'schnee'
  /** 0 bis 1, wie stark es regnet oder schneit */
  staerke: number
}

const QUELLE = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/'
/** Annahmen fürs Bild, nicht aus der Quelle */
const NASS_AB_MM = 0.1, SCHNEE_BIS_C = 1, STARK_AB_MM = 2, TAG_AB_WM2 = 10, BEWOELKT_AB = 0.5

let stationen: Promise<Station[]> | null = null
function stationenLaden() {
  stationen ??= holen<{ stationen: Array<[string, string, number, number, number]> }>('data/wetterstationen.json')
    .then((d) => d.stationen.map(([kuerzel, name, e, n, hoehe]) => ({ kuerzel, name, e, n, hoehe })))
    .catch((f) => { stationen = null; throw f })
  return stationen
}

/** «24.10.2026 06:20» in UTC */
function zeitLesen(t: string) {
  const m = /^(\d+)\.(\d+)\.(\d+) (\d+):(\d+)$/.exec(t.trim())
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])) : null
}

async function messungLesen(s: Station): Promise<Wetter | null> {
  const k = s.kuerzel.toLowerCase()
  const antwort = await fetch(`${QUELLE}${k}/ogd-smn_${k}_t_now.csv`, { signal: AbortSignal.timeout(15000) })
  if (!antwort.ok) return null
  const zeilen = (await antwort.text()).trim().split(/\r?\n/).map((z) => z.split(';'))
  const kopf = zeilen[0]
  const spalte = (name: string) => kopf.indexOf(name)
  const [iZeit, iT, iR, iS, iG] = ['reference_timestamp', 'tre200s0', 'rre150z0', 'sre000z0', 'gre000z0'].map(spalte)
  const zahl = (z: string[], i: number) => (i >= 0 && z[i] !== undefined && z[i] !== '' ? Number(z[i]) : null)
  // die letzte Zeile mit Temperatur oder Niederschlag, dazu die zwei davor für den Niederschlag in 30 Minuten
  const daten = zeilen.slice(1).filter((z) => zahl(z, iT) !== null || zahl(z, iR) !== null)
  const letzte = daten[daten.length - 1]
  if (!letzte) return null
  const zeit = zeitLesen(letzte[iZeit] ?? '')
  if (!zeit || Date.now() - zeit.getTime() > 2 * 3600e3) return null
  const regen = daten.slice(-3).map((z) => zahl(z, iR))
  const niederschlag = regen.every((r) => r === null) ? null : regen.reduce<number>((a, r) => a + (r ?? 0), 0)
  const sonne = zahl(letzte, iS), strahlung = zahl(letzte, iG)
  const bewoelkt = sonne === null || strahlung === null || strahlung < TAG_AB_WM2 ? null : Math.max(0, Math.min(1, 1 - sonne / 10))
  const temperatur = zahl(letzte, iT)
  const nass = (niederschlag ?? 0) >= NASS_AB_MM
  const art = nass ? (temperatur !== null && temperatur <= SCHNEE_BIS_C ? 'schnee' : 'regen') : (bewoelkt ?? 0) >= BEWOELKT_AB ? 'bewoelkt' : 'klar'
  return { station: s, zeit, temperatur, niederschlag, bewoelkt, art, staerke: nass ? Math.min(1, 0.3 + (niederschlag ?? 0) / STARK_AB_MM) : 0 }
}

/** die Messung der nächsten Station mit Messwerten bei Ost e, Nord n (LV95); null, wenn keine antwortet */
export async function wetterBei(e: number, n: number): Promise<Wetter | null> {
  const liste = [...await stationenLaden()].sort((a, b) => Math.hypot(a.e - e, a.n - n) - Math.hypot(b.e - e, b.n - n))
  // die nächsten drei: nicht jede Station misst alles, manche liefern gerade nichts
  for (const s of liste.slice(0, 3)) {
    const w = await messungLesen(s).catch(() => null)
    if (w) return w
  }
  return null
}

/** kurz für die Anzeige im Bild */
export function wetterText(w: Wetter) {
  const art = { klar: 'sonnig', bewoelkt: 'bewölkt', regen: 'Regen', schnee: 'Schnee' }[w.art]
  const nacht = w.bewoelkt === null && w.art !== 'regen' && w.art !== 'schnee' ? 'Bewölkung nachts nicht gemessen' : art
  const t = w.temperatur !== null ? `, ${w.temperatur.toLocaleString('de-CH', { maximumFractionDigits: 1 })} °C` : ''
  const uhr = w.zeit.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
  return `Wetter ${w.station.name} ${uhr}: ${nacht}${t} (MeteoSchweiz)`
}
