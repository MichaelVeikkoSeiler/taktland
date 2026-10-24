import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { holen, holenBinaer, kartengrundLaden, seenLaden, sehenswertLaden, szeneLaden } from '../daten'
import { ausschnittLaden, type BaumKachel, feinHoehe, feinLaden, type GebaeudeKachel, gelaendeIndex, KEINE_HOEHE, luftbildLaden, nahbildLaden, type Raster, ohneLeeres, probeDa, probeLaden, SCHARF_KACHEL_M, umweltGanz, wanderwegeLaden, scharfBild, scharfHoehe, scharfLaden, schweiz3dLaden } from '../gelaende'
import { lv95, useBrilleMoeglich } from '../relief'
import { himmelsrichtung, jetztInDerSchweiz, schweizerZeit, type Sonnenstand, sonnenstand, uhrzeit } from '../sonne'
import { imGebiet, type Pool, schweiz11Laden } from '../schweiz11'
import type { SeenDaten, SehenswertDaten } from '../typen'
import { Ladebalken } from './Ladebalken'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'
import { useEchtesVollbild, VollbildKnopf } from './Netzkarte'
import { fensterLicht, gebaeudeFlaechen, gebaeudeMaterial, lichtAnteil } from '../gebaeudeBild'
import { knopfTon, verlaufTon } from '../audio'
import { istNadel, NADEL_BREITE } from '../baumart'
import { messungVon, type Station, stationenBei, type Wetter, type Wind } from '../wetter'
import { niederAusStunde, type WindStunde } from '../wind'
import { type WindPlatz, windPlaetze, windZur } from '../windhosen'
import { type Niederschlag, niederschlagBauen } from './Niederschlag'
import { type VierWindhosen, vierWindhosenBauen } from './Windhose'
import { WindTafel } from './WindTafel'
import { Abschnitt } from './Anleitung'

/**
 * «3D Schweiz» (Michael, 2026-10-18: «die Berge und Täler der Schweiz besser erkunden … von der ganzen Schweiz bis ins
 * Quartier eines Bergdorfes»): drei Stufen. Die ganze Schweiz aus der Übersicht (data/schweiz3d, Gelände auf 500 m, Luftbild
 * auf 100 m), darin ein Feld von 20 km wählen und eintauchen (Gelände auf 50 m, Luftbild auf 10 m), darin ein Feld von 4 km
 * (feines Gelände auf 10 m und Nahbild auf 2,5 m, wo es sie gibt: bis 500 m neben den Bahnlinien; sonst bleibt es bei 50 m).
 *
 * Gewählt wird ein Quadrat, keine Region und kein Tal: wo ein Tal oder eine Region beginnt und endet, steht in keiner
 * unserer Quellen. Was die Karte zum Feld nennt, steht in den Daten: Orte der Landeskarte, Gipfel, Seen, der Kanton der Mitte.
 */

type Stufe = 'schweiz' | 'region' | 'ort' | 'nah'
/** Grösse des Felds, das man in einer Stufe wählt, und das Raster, auf das es rückt; in der Stufe «nah» wählt man nichts mehr
 *  (Michael, 2026-10-19: «noch eine Ausschnittsgrösse mehr im Detail») */
const FELD_M: Record<Exclude<Stufe, 'nah'>, number> = { schweiz: 20_000, region: 4_000, ort: 1_000 }
const RASTER_M: Record<Exclude<Stufe, 'nah'>, number> = { schweiz: 5_000, region: 1_000, ort: 250 }
const KARMIN = '#a8102e'

interface Uebersicht { ost: number; nord: number; m: number; breite: number; hoehe: number; quelle_gelaende: string; quelle_luftbild: string }
/** rahmen: welches Rechteck das Bild zeigt (Ost und Nord der Ecke links oben, Breite und Höhe in Metern) */
interface Gelaende { raster: Raster; h: Float32Array; bild: HTMLCanvasElement; rahmen: { e0: number; n1: number; b: number; h: number }; quellen: string[]; hinweis?: string }
interface Feld { e: number; n: number; seite: number }
type Seite = 'n' | 'o' | 's' | 'w'
/** was die Schalter ein- und ausschalten */
type Schalter = 'hoehen' | 'orte' | 'gipfel' | 'wandern' | 'gebaeude' | 'baeume' | 'sonne' | 'wind'
/** Ein Feld und was an seinen Seiten angesetzt ist (Michael, 2026-10-20: «An den Wänden ein Plus und oder ein Minus … zum
 *  Erweitern resp. reduzieren der Kacheln»): je Stück ein Gelände, Schlüssel «di_dj» in Feldern Ost und Nord vom Anker */
interface Bestand { anker: Feld; teile: Map<string, Gelaende>; di: [number, number]; dj: [number, number] }
/** so viele Stücke je Richtung und im Ganzen; jedes hat sein eigenes Bild von bis zu 4096 × 4096 Bildpunkten, das die
 *  Grafik des Geräts halten muss (etwa 85 MB). Die Grenze ist eine Annahme, nicht gemessen: auf dem Handy 4, sonst 9 */
const JE_RICHTUNG = 3
/** läuft gerade eine Sitzung in der Brille (für die Grösse der Bilder beim Laden) */
let inDerBrille = false
/** Materialien einer Stufe erst wegräumen, wenn die nächste gezeichnet ist (Michael, 2026-10-22, Brille: nach dem zweiten
 *  Eintauchen stand ein Bild vor den Augen und drehte mit dem Kopf): three.js behält ein übersetztes Programm der Grafik nur,
 *  solange ein Material es braucht; räumt die alte Stufe zuerst alles weg, übersetzt die neue alle Programme nochmals, die Seite
 *  steht dabei Sekunden still und die Brille zeigt so lange ihr letztes Bild. Die Wartezeit ist gewählt */
const MATERIAL_WEG_MS = 4000
const spaeterWeg = (materialien: Array<THREE.Material | undefined>) => {
  setTimeout(() => { for (const m of materialien) m?.dispose() }, MATERIAL_WEG_MS)
}
const hoechstens = () => (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700 ? 4 : 9)

const einzeln = (anker: Feld, g: Gelaende): Bestand => ({ anker, teile: new Map([['0_0', g]]), di: [0, 0], dj: [0, 0] })
const teilFeld = (b: Bestand, di: number, dj: number): Feld => ({ e: b.anker.e + di * b.anker.seite, n: b.anker.n + dj * b.anker.seite, seite: b.anker.seite })
const imRaster = (r: Raster, e: number, n: number) => e >= r.ost && e <= r.ost + r.breite * r.m && n <= r.nord && n >= r.nord - r.hoehe * r.m
/** Höhe an einer Stelle aus dem Stück, in dem sie liegt, sonst am Rand des ersten */
function bestandHoehe(b: Bestand, e: number, n: number) {
  for (const t of b.teile.values()) if (imRaster(t.raster, e, n)) return hoeheIm(t, e, n)
  return hoeheIm(b.teile.values().next().value!, e, n)
}
/** das Bild der Stücke darunter auf eine Leinwand ab Ost e0, Nord n1, s Bildpunkte je Meter */
function unterZeichnen(g: CanvasRenderingContext2D, b: Bestand, e0: number, n1: number, s: number) {
  for (const t of b.teile.values()) g.drawImage(t.bild, (t.rahmen.e0 - e0) * s, (n1 - t.rahmen.n1) * s, t.rahmen.b * s, t.rahmen.h * s)
}
/** was unter einem Feld liegt: die Stücke der Stufe darüber, wo sie es ganz decken, sonst eine Region um das Feld */
async function unterFuer(f: Feld, unter: Bestand | null): Promise<Bestand> {
  const ecken = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => [f.e + a * f.seite * 0.499, f.n + c * f.seite * 0.499])
  if (unter && ecken.every(([e, n]) => [...unter.teile.values()].some((t) => imRaster(t.raster, e, n)))) return unter
  const r = { e: Math.round(f.e / RASTER_M.schweiz) * RASTER_M.schweiz, n: Math.round(f.n / RASTER_M.schweiz) * RASTER_M.schweiz, seite: FELD_M.schweiz }
  return einzeln(r, await regionLaden(r))
}
interface Zusatz {
  sw: SehenswertDaten; seen: SeenDaten; orte: Array<{ name: string; klasse: number; lage: [number, number] }>; pool: Pool
  /** Ortschaften und Weiler aus swissTLMRegio: Name, Ost, Nord, Rang (data/schweiz3d/orte.json) */
  ortschaften: Array<[string, number, number, number]>
}

/* ---------- Daten ---------- */

async function uebersichtLaden(): Promise<Gelaende> {
  const ix = await holen<Uebersicht>('data/schweiz3d/index.json')
  const gepackt = await holenBinaer('data/schweiz3d/hoehen.hgz')
  const roh = await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  const u = new Uint16Array(roh)
  const bild = await createImageBitmap(new Blob([await holenBinaer('data/schweiz3d/luftbild.jpg')], { type: 'image/jpeg' }))
  const c = document.createElement('canvas')
  c.width = Math.min(4096, bild.width); c.height = Math.round(c.width * bild.height / bild.width)
  c.getContext('2d')!.drawImage(bild, 0, 0, c.width, c.height)
  return { raster: { ost: ix.ost, nord: ix.nord, m: ix.m, breite: ix.breite, hoehe: ix.hoehe }, h: Float32Array.from(u), bild: c,
           rahmen: { e0: ix.ost, n1: ix.nord, b: ix.breite * ix.m, h: ix.hoehe * ix.m }, quellen: [ix.quelle_gelaende, ix.quelle_luftbild] }
}

async function regionLaden(f: Feld): Promise<Gelaende> {
  // ein Feld mehr als die Seite: so stossen angesetzte Stücke ohne Lücke aneinander
  const { raster_m: rm } = await gelaendeIndex()
  const a = await ausschnittLaden({ ost: f.e - f.seite / 2, nord: f.n + f.seite / 2, m: rm, breite: f.seite / rm + 1, hoehe: f.seite / rm + 1 })
  const lb = await luftbildLaden(a.raster)
  const { ost, nord, m, breite, hoehe } = a.raster
  const c = document.createElement('canvas')
  c.width = c.height = 2048
  const g = c.getContext('2d')!
  g.fillStyle = '#d8d5c2'; g.fillRect(0, 0, c.width, c.height)
  const sx = c.width / (breite * m), sy = c.height / (hoehe * m)
  for (const k of lb?.kacheln ?? []) {
    g.drawImage(k.bild, (k.ex * lb!.kachel_m - ost) * sx, (nord - (k.ny + 1) * lb!.kachel_m) * sy, lb!.kachel_m * sx, lb!.kachel_m * sy)
  }
  // schärfer, wo daten.taktland.ch die Details hat: je Kilometer so viele Bildpunkte, wie die Leinwand fasst
  const d = await schweiz3dLaden(ost, nord - hoehe * m, ost + breite * m, nord, Math.ceil(sx * 1000), true).catch(() => null)
  for (const k of d?.bilder ?? []) g.drawImage(k.bild, (k.ke * 1000 - ost) * sx, (nord - (k.kn + 1) * 1000) * sy, 1000 * sx, 1000 * sy)
  return { raster: a.raster, h: Float32Array.from(a.h), bild: c, rahmen: { e0: ost, n1: nord, b: breite * m, h: hoehe * m },
           quellen: [a.quelle, d?.bilder.length ? `${d.quelle_bild}, hier auf etwa ${Math.round(1 / sx)} m, Aufnahmen ${d.bildJahre.join(', ')}`
             : lb ? `SWISSIMAGE (swisstopo), auf 10 m gemittelt, Aufnahmen ${lb.jahre.join(', ')}` : 'ohne Luftbild'] }
}

/** Ort: 4 km im 10-m-Raster; feines Gelände und Nahbild, wo es sie gibt, sonst das Gelände der Region */
async function ortLaden(f: Feld, region: Bestand): Promise<Gelaende> {
  const e0 = f.e - f.seite / 2, n1 = f.n + f.seite / 2
  const m = 10, breite = f.seite / m + 1
  const [fein, nah, details] = await Promise.all([feinLaden(e0, f.n - f.seite / 2, e0 + f.seite, n1).catch(() => null),
                                                  nahbildLaden(e0, f.n - f.seite / 2, e0 + f.seite, n1).catch(() => null),
                                                  schweiz3dLaden(e0, f.n - f.seite / 2, e0 + f.seite, n1).catch(() => null)])
  const h = new Float32Array(breite * breite)
  let feine = 0
  for (let j = 0; j < breite; j++) {
    for (let i = 0; i < breite; i++) {
      const e = e0 + i * m, n = n1 - j * m
      // zuerst die Details der ganzen Schweiz, dann das feine Gelände entlang der Bahnlinien
      const z = (details?.fein.km.size ? feinHoehe(details.fein, e, n) : null) ?? (fein ? feinHoehe(fein, e, n) : null)
      if (z !== null) feine++
      h[j * breite + i] = z ?? bestandHoehe(region, e, n)
    }
  }
  // das Bild: das Luftbild der Region darunter, das Nahbild darüber; 2048 Bildpunkte auf 4 km sind etwa 2 m, feiner als die
  // Daten (2,5 m); vorher 4096, viermal so viel Speicher der Grafik ohne schärferes Bild (Michael, 2026-10-22: Brille stand)
  const c = document.createElement('canvas')
  c.width = c.height = 2048
  const g = c.getContext('2d')!
  const s = c.width / f.seite
  unterZeichnen(g, region, e0, n1, s)
  for (const k of nah?.kacheln ?? []) g.drawImage(k.bild, (k.ke * 1000 - e0) * s, (n1 - (k.kn + 1) * 1000) * s, 1000 * s, 1000 * s)
  for (const k of details?.bilder ?? []) g.drawImage(k.bild, (k.ke * 1000 - e0) * s, (n1 - (k.kn + 1) * 1000) * s, 1000 * s, 1000 * s)
  const anteil = feine / h.length
  const ganz = !!details?.fein.km.size
  const rq = region.teile.values().next().value!.quellen
  return {
    raster: { ost: e0, nord: n1, m, breite, hoehe: breite }, h, bild: c, rahmen: { e0, n1, b: f.seite, h: f.seite },
    quellen: [ganz ? `${details!.quelle_hoehe}, Aufnahmen ${details!.fein.jahre.join(', ')}`
                : anteil > 0 ? 'swissALTI3D (swisstopo), auf 10 m gemittelt, nur bis 500 m neben den Bahnlinien' : rq[0],
              details?.bilder.length ? `${details.quelle_bild}, Aufnahmen ${details.bildJahre.join(', ')}`
                : nah ? 'SWISSIMAGE (swisstopo), auf 2,5 m, nur bis 500 m neben den Bahnlinien, sonst auf 10 m' : rq[1]],
    hinweis: anteil < 0.98 ? (anteil === 0 ? 'Hier gibt es noch keine feineren Daten: Gelände auf 50 m, Luftbild auf 10 m wie in der Region.'
      : ganz ? 'Am Rand fehlen feinere Daten, dort wie in der Region.' : 'Feiner nur bis 500 m neben den Bahnlinien, weiter weg wie in der Region.') : undefined,
  }
}

/** Nah: 1 km im 5-m-Raster; wo es die scharfe Umgebung gibt (bis 200 m neben den Bahnlinien), Gelände auf 2 m und Luftbild auf
 *  25 cm, sonst das Gelände und Bild des Felds darüber */
/** Höhe aus Kilometerkacheln mit je_km × je_km Feldern (Zeilen von Norden, Feldmitten), zwischen ihnen linear, oder null */
function kmHoehe(km: Map<string, Float32Array>, je_km: number, e: number, n: number): number | null {
  const z = 1000 / je_km
  const feld = (I: number, J: number) => {
    const ke = Math.floor(I / je_km), kn = Math.floor(J / je_km)
    const a = km.get(`${ke}_${kn}`)
    return a ? a[(je_km - 1 - (J - kn * je_km)) * je_km + I - ke * je_km] : null
  }
  const x = e / z - 0.5, y = n / z - 0.5, I = Math.floor(x), J = Math.floor(y), fx = x - I, fy = y - J
  const a = feld(I, J), b = feld(I + 1, J), c = feld(I, J + 1), d = feld(I + 1, J + 1)
  if (a === null || b === null || c === null || d === null) return null
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

async function nahLaden(f: Feld, ort: Bestand): Promise<Gelaende> {
  const e0 = f.e - f.seite / 2, n0 = f.n - f.seite / 2, n1 = f.n + f.seite / 2
  const m = 5, breite = f.seite / m + 1
  // die scharfe Umgebung entlang der Bahnlinien, und für die ganze Schweiz Bild auf 50 cm und Gelände auf 5 m (schweiz3dfein)
  const [scharf, fein] = await Promise.all([scharfLaden(e0, n0, e0 + f.seite, n1).catch(() => null),
                                            schweiz3dLaden(e0, n0, e0 + f.seite, n1, 0, false, 'schweiz3dfein').catch(() => null)])
  const h = new Float32Array(breite * breite)
  let scharfe = 0, feine = 0
  for (let j = 0; j < breite; j++) {
    for (let i = 0; i < breite; i++) {
      const e = e0 + i * m, n = n1 - j * m
      const z = scharf ? scharfHoehe(scharf, e, n) : null
      const zf = z === null && fein?.fein.km.size ? kmHoehe(fein.fein.km, fein.je_km, e, n) : null
      if (z !== null) scharfe++
      else if (zf !== null) feine++
      h[j * breite + i] = z ?? zf ?? bestandHoehe(ort, e, n)
    }
  }
  // in der Brille 2048 Bildpunkte (50 cm wie die Daten der ganzen Schweiz, das scharfe Bild auf 25 cm nur halb so scharf):
  // die Grafik der Brille ist die eines Handys und zeichnet jedes Bild zweimal
  const c = document.createElement('canvas')
  c.width = c.height = inDerBrille ? 2048 : 4096
  const g = c.getContext('2d')!
  const s = c.width / f.seite, k = SCHARF_KACHEL_M
  unterZeichnen(g, ort, e0, n1, s)
  for (const b of fein?.bilder ?? []) g.drawImage(b.bild, (b.ke * 1000 - e0) * s, (n1 - (b.kn + 1) * 1000) * s, 1000 * s, 1000 * s)
  const namen = [...(scharf?.kacheln.keys() ?? [])]
  // weiter als 200 m von den Bahnlinien ist das scharfe Bild weiss: dort durchsichtig, sonst deckt es das Bild darunter zu
  // (Michael, 2026-10-19, Brienz: weisse Streifen)
  const bilder = await Promise.all(namen.map((n) => scharfBild(n).then((b) => ohneLeeres(b, 3)).catch(() => null)))
  namen.forEach((n, i) => {
    const b = bilder[i]
    if (!b) return
    const [qe, qn] = n.split('_').map(Number)
    g.drawImage(b, (qe * k - e0) * s, (n1 - (qn + 1) * k) * s, k * s, k * s)
  })
  const anteil = scharfe / h.length, anteilFein = (scharfe + feine) / h.length
  const feinBild = !!fein?.bilder.length
  const oq = ort.teile.values().next().value!.quellen
  return {
    raster: { ost: e0, nord: n1, m, breite, hoehe: breite }, h, bild: c, rahmen: { e0, n1, b: f.seite, h: f.seite },
    quellen: [[anteil > 0 && 'swissALTI3D (swisstopo), 2 m, bis 200 m neben den Bahnlinien', feine > 0 && fein!.quelle_hoehe,
               anteilFein < 1 && oq[0]].filter(Boolean).join('; sonst '),
              [bilder.some(Boolean) && 'SWISSIMAGE (swisstopo) auf 25 cm, bis 200 m neben den Bahnlinien',
               feinBild && `${fein!.quelle_bild}, Aufnahmen ${fein!.bildJahre.join(', ')}`, !feinBild && oq[1]].filter(Boolean).join('; sonst ')],
    hinweis: anteilFein === 0 && !feinBild
      ? 'Schärfer als im Feld darüber gibt es hier noch nichts: Gelände auf 10 m, Luftbild auf 2,5 m. Schärfere Daten gibt es bisher nur nahe an den Bahnlinien.'
      : anteilFein < 0.98 ? 'Am Rand fehlen schärfere Daten, dort wie im Feld darüber.' : undefined,
  }
}

function hoeheIm(gl: Gelaende, e: number, n: number) {
  const { ost, nord, m, breite, hoehe } = gl.raster
  const x = Math.max(0, Math.min(breite - 1.001, (e - ost) / m - 0.5)), y = Math.max(0, Math.min(hoehe - 1.001, (nord - n) / m - 0.5))
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
  const z = (a: number, b: number) => gl.h[b * breite + a]
  return z(i, j) * (1 - fx) * (1 - fy) + z(i + 1, j) * fx * (1 - fy) + z(i, j + 1) * (1 - fx) * fy + z(i + 1, j + 1) * fx * fy
}

/* ---------- Orte suchen ---------- */

/** klein, ohne Akzente und Satzzeichen, damit «zurich» Zürich und «st gallen» St. Gallen findet */
function suchform(t: string) {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.\-'’()/]/g, ' ').replace(/\s+/g, ' ').trim()
}
const SUCHE_TREFFER = 8, SUCHE_PRUEFEN = 40

/** Suche in den Ortschaften und Weilern (data/schweiz3d/orte.json), den Gipfeln und Hügeln (data/schweiz3d/gipfel.json, beide aus
 *  swissTLMRegio, die Gipfel erst beim ersten Tippen geladen) und den Seen mit Namen (data/seen.json; Michael, 2026-10-23: «Gipfel
 *  und Seen auch»): zuerst die, deren Name so beginnt, dann die, in deren Name es vorkommt, je nach Rang; Orte mit dem Kanton laut
 *  Kantonsfläche (BFS), Gipfel mit der Höhe. Der Rang der Gipfel und Seen neben dem der Orte (0 bis 6) ist gewählt, nicht aus einer Quelle */
/** Seen wie eine grössere Ortschaft, Gipfel nach ihrer Objektart (3 HGipfel … 0 Hügel) zwischen 1,5 und 3 */
const SUCHE_RANG = { see: 3, gipfelAb: 1.5, gipfelJe: 0.5 }
interface Eintrag { name: string; e: number; n: number; rang: number; art: 'ort' | 'gipfel' | 'see'; hoehe?: number | null }
function OrtSuche({ zusatz, waehlen }: { zusatz: Zusatz; waehlen: (e: number, n: number, name: string) => void }) {
  const [text, setText] = useState('')
  const [offen, setOffen] = useState(false)
  const [gipfel, setGipfel] = useState<Array<[string, number, number, number | null, number]>>([])
  const gipfelGeholt = useRef(false)
  const gipfelHolen = () => {
    if (gipfelGeholt.current) return
    gipfelGeholt.current = true
    holen<{ gipfel: typeof gipfel }>('data/schweiz3d/gipfel.json').then((d) => setGipfel(d.gipfel)).catch(() => { gipfelGeholt.current = false })
  }
  const eintraege = useMemo(() => {
    const l: Eintrag[] = zusatz.ortschaften.map(([name, e, n, rang]) => ({ name, e, n, rang, art: 'ort' }))
    for (const [name, e, n, hoehe, rang] of gipfel) l.push({ name, e, n, rang: SUCHE_RANG.gipfelAb + rang * SUCHE_RANG.gipfelJe, art: 'gipfel', hoehe })
    // ein See kann aus mehreren Flächen mit demselben Namen bestehen: nur einmal
    const seen = new Set<string>()
    for (const x of zusatz.seen.seen) {
      if (!x.name || !x.namenspunkt || seen.has(x.name)) continue
      seen.add(x.name)
      const [e, n] = lv95(x.namenspunkt[0], x.namenspunkt[1])
      l.push({ name: x.name, e, n, rang: SUCHE_RANG.see, art: 'see' })
    }
    return l
  }, [zusatz, gipfel])
  const formen = useMemo(() => eintraege.map((x) => suchform(x.name)), [eintraege])
  const treffer = useMemo(() => {
    const q = suchform(text)
    if (q.length < 2) return []
    const vorne: number[] = [], drin: number[] = []
    formen.forEach((f, i) => { if (f.startsWith(q)) vorne.push(i); else if (f.includes(' ' + q)) drin.push(i) })
    const o = eintraege
    const ordnen = (a: number, b: number) => o[b].rang - o[a].rang || formen[a].length - formen[b].length || o[a].name.localeCompare(o[b].name, 'de-CH')
    // von den besten SUCHE_PRUEFEN Orten der Kanton: was in der Schweiz liegt, kommt vor das Ausland; Gipfel und Seen ohne, ein Gipfel
    // auf der Grenze (Matterhorn) liegt in der vereinfachten Kantonsfläche oft knapp ausserhalb
    const liste = [...vorne.sort(ordnen), ...drin.sort(ordnen)].slice(0, SUCHE_PRUEFEN).map((i) => {
      const x = o[i]
      const [la, lo] = wgs(x.e, x.n)
      const kanton = [...zusatz.pool.kantone.keys()].find((k) => imGebiet(zusatz.pool, k, la, lo))
      const art = x.art === 'see' ? 'See' : x.art === 'gipfel' ? (x.rang === SUCHE_RANG.gipfelAb ? 'Hügel' : 'Gipfel') : null
      const wo = art ? `${art}${x.hoehe != null ? ` ${x.hoehe.toLocaleString('de-CH')} m` : ''}` : kanton ?? 'Ausland'
      return { name: x.name, e: x.e, n: x.n, wo, schweiz: !!kanton || x.art !== 'ort' }
    })
    return [...liste.filter((t) => t.schweiz), ...liste.filter((t) => !t.schweiz)].slice(0, SUCHE_TREFFER)
  }, [text, formen, eintraege, zusatz])
  const nehmen = (t: { name: string; e: number; n: number }) => { waehlen(t.e, t.n, t.name); setText(t.name); setOffen(false) }
  return (
    <div className="relative w-52 max-w-[calc(48vw-2.5rem)]">
      <input type="search" value={text} placeholder="Ort, Gipfel, See" aria-label="Ort, Gipfel oder See suchen" autoComplete="off" enterKeyHint="search"
             onChange={(e) => { setText(e.target.value); setOffen(true); gipfelHolen() }} onFocus={() => { setOffen(true); gipfelHolen() }}
             onKeyDown={(e) => { if (e.key === 'Enter' && treffer[0]) { nehmen(treffer[0]); e.currentTarget.blur() } else if (e.key === 'Escape') setOffen(false) }}
             className="w-full rounded-lg border border-sbb-cloud bg-white/90 px-2.5 py-1 text-sm dark:border-sbb-iron dark:bg-sbb-midnight/90" />
      {offen && suchform(text).length >= 2 && (
        <ul className="absolute left-0 top-full z-10 w-max min-w-full max-w-[80vw] mt-1 max-h-72 overflow-auto rounded-lg bg-white/95 text-sm shadow-lg dark:bg-sbb-charcoal/95">
          {treffer.length ? treffer.map((t) => (
            <li key={`${t.name}_${t.e}_${t.n}`}>
              <button type="button" onClick={() => nehmen(t)} className="w-full px-2.5 py-1.5 text-left hover:bg-sbb-milk dark:hover:bg-sbb-iron">
                <span className="font-medium">{t.name}</span> <span className="text-xs text-sbb-metal dark:text-sbb-storm">{t.wo}</span>
              </button>
            </li>
          )) : <li className="px-2.5 py-1.5 text-sbb-metal dark:text-sbb-storm">Nichts mit diesem Namen</li>}
        </ul>
      )}
    </div>
  )
}

/* ---------- was im Feld liegt ---------- */

function imFeld(f: Feld, la: number, lo: number) {
  const [e, n] = lv95(la, lo)
  return Math.abs(e - f.e) <= f.seite / 2 && Math.abs(n - f.n) <= f.seite / 2
}

function feldInhalt(f: Feld, z: Zusatz | null) {
  if (!z) return null
  const orte = z.orte.filter((o) => imFeld(f, o.lage[0], o.lage[1])).sort((a, b) => b.klasse - a.klasse).slice(0, 3).map((o) => o.name)
  const gipfel = z.sw.gipfel.filter((g) => g.hoehe_m !== null && imFeld(f, g.lage[0], g.lage[1]))
    .sort((a, b) => b.hoehe_m! - a.hoehe_m!)[0] ?? null
  const seen = z.seen.seen.filter((s) => s.name && s.namenspunkt && imFeld(f, s.namenspunkt[0], s.namenspunkt[1])).map((s) => s.name!).slice(0, 3)
  const [la, lo] = wgs(f.e, f.n)
  const kanton = [...z.pool.kantone.keys()].find((k) => imGebiet(z.pool, k, la, lo)) ?? null
  return { orte, gipfel, seen, kanton }
}

/** LV95 → WGS84, die Näherung von swisstopo */
function wgs(e: number, n: number): [number, number] {
  const y = (e - 2_600_000) / 1e6, x = (n - 1_200_000) / 1e6
  const la = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x ** 3
  const lo = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
  return [la * 100 / 36, lo * 100 / 36]
}

/* ---------- die Seite ---------- */

/** die Stufe darüber, aus der ein Feld dieser Stufe sein Gelände ergänzt */
const DARUEBER: Record<'region' | 'ort' | 'nah', Stufe> = { region: 'schweiz', ort: 'region', nah: 'ort' }
async function stufeLaden(s: 'region' | 'ort' | 'nah', f: Feld, unter: Bestand | null) {
  if (s === 'region') return regionLaden(f)
  const u = await unterFuer(f, unter)
  return s === 'ort' ? ortLaden(f, u) : nahLaden(f, u)
}
/** welche Knöpfe an den Wänden gehen: Plus bis JE_RICHTUNG und hoechstens(), Minus, solange mehr als ein Stück da ist */
export interface Knoepfe { plus: Record<Seite, boolean>; minus: Record<Seite, boolean> }

/** eigeneSeite: auf 3dland.ch die ganze Seite, ohne den Weg zurück zu den Spielen von Taktland */
export default function Schweiz3D({ eigeneSeite = false }: { eigeneSeite?: boolean }) {
  useEffect(() => szeneLaden(), [])
  const [stufe, setStufe] = useState<Stufe>('schweiz')
  const [gelaende, setGelaende] = useState<Record<Stufe, Bestand | null>>({ schweiz: null, region: null, ort: null, nah: null })
  const [wahl, setWahl] = useState<Feld | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [zusatz, setZusatz] = useState<Zusatz | null>(null)
  // alle Schalter am Anfang aus (Michael, 2026-10-22: «Alles defaultmässig ausgeschaltet»)
  const [scheiben, setScheiben] = useState(false)
  // Gebäude und Bäume je für sich (Michael, 2026-10-22: «Gebäude und Bäume … separate Schalter»)
  const [gebaeudeAn, setGebaeudeAn] = useState(false)
  // die Ortschaften ein und aus (Michael, 2026-10-22: «auch ein- und ausklickbar, defaultmässig ausgeschaltet»)
  const [orteAn, setOrteAn] = useState(false)
  // die Gipfel ebenso (Michael, 2026-10-22: «Gipfel defaultmässig auch nicht einblenden»)
  const [gipfelAn, setGipfelAn] = useState(false)
  const [baeumeAn, setBaeumeAn] = useState(false)
  // Wanderwege am Anfang aus (Michael, 2026-10-21: «defaultmässig ausgeblendet»)
  const [wandern, setWandern] = useState(false)
  // Sonne und Schatten (Michael, 2026-10-21): Datum und Uhrzeit in der Schweiz, am Anfang heute um 12 Uhr
  const [sonnenAn, setSonnenAn] = useState(false)
  // die Windhose (Michael, 2026-10-24: «wie die Windverhältnisse sind. Auch mit Prognose für die nächste Woche»), am Anfang aus wie alles
  const [windAn, setWindAn] = useState(false)
  const [windStation, setWindStation] = useState<Station | null>(null)
  const [windMessung, setWindMessung] = useState<Wetter | null>(null)
  // die in der Tafel gewählte Stunde der Prognose, null die Messung
  const [windZeigt, setWindZeigt] = useState<WindStunde | null>(null)
  // die vier Windhosen (Michael, 2026-10-24: «immer vier davon verteilen»), je Viertel des Modells (src/windhosen.ts)
  const [windPl, setWindPl] = useState<WindPlatz[]>([])
  const [, setWindNeu] = useState(0)
  // die Plätze kommen aus dem Bild (Ansicht): nach jeder Bewegung der Kamera vier Stellen des sichtbaren Geländes
  const windAuftrag = useRef(0)
  const windOrte = (punkte: Array<{ e: number; n: number }>) => {
    const auftrag = ++windAuftrag.current
    void windPlaetze(punkte.map((p, i) => ({ ...p, viertel: `${i + 1}.` })), () => setWindNeu((x) => x + 1))
      .then((p) => { if (auftrag === windAuftrag.current) setWindPl(p) }).catch(() => {})
  }
  // Regen und Schnee zur selben Stunde (Michael, 2026-10-24: «Regen auch einblenden mit der gleichen Prognose wie die Windhose»)
  const niederJetzt = windZeigt ? niederAusStunde(windZeigt)
    : windMessung && (windMessung.art === 'regen' || windMessung.art === 'schnee') ? { art: windMessung.art, staerke: windMessung.staerke } : null
  const [tag, setTag] = useState(() => jetztInDerSchweiz().datum)
  const [minuten, setMinuten] = useState(12 * 60)
  const [umweltHier, setUmweltHier] = useState(false)
  const [umweltGanzDa, setUmweltGanzDa] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  // der zuletzt gesuchte Ort, Gipfel oder See: sein Feld ist in jeder Stufe gewählt, bis man selbst ein anderes wählt
  const [gesucht, setGesucht] = useState<{ e: number; n: number; name: string } | null>(null)
  // der eigene Standort per GPS (Michael, 2026-10-24: «auf der Karte jeweils sehen mit GPS, wo ich durchfahre»): nur auf dem
  // Gerät, nie gesendet; der erste wählt das Feld um ihn wie eine Suche, danach wandert nur der Punkt mit
  const [standort, setStandort] = useState<{ e: number; n: number } | null>(null)
  const [gpsAn, setGpsAn] = useState(false)
  const gpsWache = useRef<number | null>(null)
  const stufeJetzt = useRef(stufe)
  stufeJetzt.current = stufe
  function gpsStoppen() {
    if (gpsWache.current !== null) navigator.geolocation.clearWatch(gpsWache.current)
    gpsWache.current = null
    setGpsAn(false); setStandort(null)
  }
  function gpsUmschalten() {
    if (gpsAn) { gpsStoppen(); return }
    if (!('geolocation' in navigator)) { setMeldung('Dieser Browser kann den Standort nicht bestimmen.'); return }
    setGpsAn(true)
    let erster = true
    gpsWache.current = navigator.geolocation.watchPosition((p) => {
      const [e, n] = lv95(p.coords.latitude, p.coords.longitude)
      setStandort({ e, n })
      if (!erster) return
      erster = false
      const s = stufeJetzt.current
      setGesucht({ e, n, name: 'Dein Standort' })
      if (s !== 'nah') setWahl({ e: Math.round(e / RASTER_M[s]) * RASTER_M[s], n: Math.round(n / RASTER_M[s]) * RASTER_M[s], seite: FELD_M[s] })
    }, (f) => {
      // ohne Freigabe aus; sonst (kein Empfang, zu spät) weiter warten, gemeldet nur, solange es noch keinen Standort gab
      if (f.code === f.PERMISSION_DENIED) {
        setMeldung('Der Standort ist nicht freigegeben. Erlaube ihn in den Einstellungen des Browsers.')
        gpsStoppen()
      } else if (erster) setMeldung('Der Standort liess sich noch nicht bestimmen. Taktland versucht es weiter.')
    }, { enableHighAccuracy: true, maximumAge: 5000 })
  }
  useEffect(() => () => { if (gpsWache.current !== null) navigator.geolocation.clearWatch(gpsWache.current) }, [])
  useEffect(() => {
    uebersichtLaden().then((g) => setGelaende((a) => ({ ...a, schweiz: einzeln({ e: 0, n: 0, seite: 0 }, g) }))).catch((e: Error) => setFehler(e.message))
    Promise.all([sehenswertLaden(), seenLaden(), kartengrundLaden(), schweiz11Laden(),
                 holen<{ orte: Zusatz['ortschaften'] }>('data/schweiz3d/orte.json').catch(() => ({ orte: [] }))])
      .then(([sw, seen, k, pool, o]) => setZusatz({ sw, seen, orte: k.orte as Zusatz['orte'], pool, ortschaften: o.orte })).catch(() => {})
  }, [])
  useEffect(() => {
    if (!meldung) return
    const t = setTimeout(() => setMeldung(null), 7000)
    return () => clearTimeout(t)
  }, [meldung])
  const inhalt = useMemo(() => (wahl ? feldInhalt(wahl, zusatz) : null), [wahl, zusatz])
  const aktuell = gelaende[stufe]
  // der Wind der nächsten Station mit Windmessung zur Mitte des Modells
  useEffect(() => {
    if (!windAn || !aktuell) return
    const r = [...aktuell.teile.values()].map((t) => t.rahmen)
    const e = r.reduce((a, x) => a + x.e0 + x.b / 2, 0) / r.length, n = r.reduce((a, x) => a + x.n1 - x.h / 2, 0) / r.length
    let weg = false
    void stationenBei(e, n).then(async (liste) => {
      for (const st of liste.slice(0, 3)) {
        const m = await messungVon(st)
        if (weg) return
        if (m?.wind) { setWindStation(st); setWindMessung(m); return }
      }
      if (!weg) { setWindStation(liste[0] ?? null); setWindMessung(null) }
    }).catch(() => {})
    return () => { weg = true }
  }, [windAn, aktuell])
  const anker = aktuell?.teile.get('0_0') ?? null
  // der Sonnenstand über der Mitte des Modells
  const stand = useMemo(() => {
    if (!sonnenAn || !aktuell) return null
    const r = [...aktuell.teile.values()].map((t) => t.rahmen)
    const e = (Math.min(...r.map((x) => x.e0)) + Math.max(...r.map((x) => x.e0 + x.b))) / 2
    const n = (Math.min(...r.map((x) => x.n1 - x.h)) + Math.max(...r.map((x) => x.n1))) / 2
    const [la, lo] = wgs(e, n)
    return sonnenstand(schweizerZeit(tag, minuten), la, lo)
  }, [sonnenAn, aktuell, tag, minuten])
  // Licht in den Fenstern der Gebäude, wenn die Sonne unter dem Horizont steht (Annahmen in gebaeudeBild.ts): ganz dunkel ab 6° darunter
  useEffect(() => {
    fensterLicht(stand ? (2 - stand.hoehe) / 8 : 0, lichtAnteil(minuten / 60))
    return () => fensterLicht(0, 0)
  }, [stand, minuten])
  const tagText = useMemo(() => {
    const [j, m, t] = tag.split('-').map(Number)
    return new Date(Date.UTC(j, m - 1, t)).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  }, [tag])
  const standText = stand ? (stand.hoehe > 0
    ? `Sonne ${Math.round(stand.hoehe)}° über dem Horizont, im ${himmelsrichtung(stand.richtung)}`
    : 'Die Sonne steht unter dem Horizont') : null
  const sonnenZeilen = useMemo(() => (stand ? [`${tagText}, ${uhrzeit(minuten)} Uhr`, standText!] : null), [stand, tagText, minuten, standText])
  const zeitSchieben = (art: 'stunde' | 'tag' | 'jetzt', um: number) => {
    if (art === 'jetzt') { const j = jetztInDerSchweiz(); setTag(j.datum); setMinuten(Math.round(j.minuten / 15) * 15 % 1440); return }
    if (art === 'stunde') {
      const neu = minuten + um * 60
      if (neu < 0 || neu >= 1440) {
        const [j, m, t] = tag.split('-').map(Number)
        setTag(new Date(Date.UTC(j, m - 1, t + (neu < 0 ? -1 : 1))).toISOString().slice(0, 10))
      }
      setMinuten(((neu % 1440) + 1440) % 1440)
      return
    }
    // einen Tag vor oder zurück (Michael, 2026-10-24: «−1 Monat und +1 Monat durch Tage ersetzen»)
    const [j, m, t] = tag.split('-').map(Number)
    setTag(new Date(Date.UTC(j, m - 1, t + um)).toISOString().slice(0, 10))
  }
  // Gebäude und Bäume gibt es vorerst nur in zwei Probeausschnitten
  useEffect(() => {
    setUmweltHier(false)
    if (!aktuell || (stufe !== 'ort' && stufe !== 'nah')) return
    const r = [...aktuell.teile.values()].map((t) => t.rahmen)
    let weg = false
    void probeDa(Math.min(...r.map((x) => x.e0)), Math.min(...r.map((x) => x.n1 - x.h)), Math.max(...r.map((x) => x.e0 + x.b)), Math.max(...r.map((x) => x.n1)))
      .then((da) => { if (!weg) setUmweltHier(da) })
    void umweltGanz().then((ganz) => { if (!weg) setUmweltGanzDa(ganz) })
    return () => { weg = true }
  }, [aktuell, stufe])
  const brille = useRef<(() => Promise<void>) | null>(null)
  const xr = useBrilleMoeglich()
  const [brilleHinweis, setBrilleHinweis] = useState<string | null>(null)
  // Vollbild auch ohne Brille (Michael, 2026-10-22: «Vollbildmodus muss man auch einschalten können»)
  const [voll, setVoll] = useState(false)
  useEchtesVollbild(voll, setVoll)
  const inBrille = () => {
    if (!xr) { setBrilleHinweis('Auf diesem Gerät ist keine VR-Brille zu finden. Öffne Taktland im Browser einer VR-Brille wie der Meta Quest 3.'); return }
    setBrilleHinweis(null)
    brille.current?.().catch((e: Error) => setBrilleHinweis(`Die Brille liess sich nicht starten: ${e.message}`))
  }
  // was in der Brille über dem Feld steht, dieselben Angaben wie die Karte auf dem Bildschirm
  const info = useMemo(() => (wahl && inhalt ? [
    inhalt.orte.length ? inhalt.orte.join(', ') : inhalt.gipfel?.name ?? 'Ohne Ort der Landeskarte',
    ...(inhalt.gipfel ? [`▲ ${inhalt.gipfel.name} ${inhalt.gipfel.hoehe_m!.toLocaleString('de-CH')} m`] : []),
    ...(inhalt.seen.length ? [inhalt.seen.join(', ')] : []),
    ...(inhalt.kanton ? [`Mitte im Kanton ${inhalt.kanton}`] : []),
  ] : null), [wahl, inhalt])

  /** das Feld einer Stufe um den gesuchten Ort, in der Stufe 1 km keines mehr (dort wählt man nichts) */
  const feldUmGesucht = (s: Stufe): Feld | null => {
    if (!gesucht || s === 'nah') return null
    const r = RASTER_M[s]
    return { e: Math.round(gesucht.e / r) * r, n: Math.round(gesucht.n / r) * r, seite: FELD_M[s] }
  }
  async function eintauchen() {
    if (!wahl || laedt) return
    setLaedt(true); setFehler(null)
    try {
      if (stufe === 'schweiz') {
        const g = await regionLaden(wahl)
        setGelaende((a) => ({ ...a, region: einzeln(wahl, g), ort: null, nah: null })); setStufe('region')
      } else if (stufe === 'region') {
        const g = await stufeLaden('ort', wahl, gelaende.region)
        setGelaende((a) => ({ ...a, ort: einzeln(wahl, g), nah: null })); setStufe('ort')
      } else if (stufe === 'ort') {
        const g = await stufeLaden('nah', wahl, gelaende.ort)
        setGelaende((a) => ({ ...a, nah: einzeln(wahl, g) })); setStufe('nah')
      }
      // nach einer Suche auch in der nächsten Stufe das Feld um den Ort (Michael, 2026-10-23: «bei allen Eintauchstufen mit dem roten
      // Kasten markiert»), sofern er im gewählten Feld liegt
      const nachher: Stufe = stufe === 'schweiz' ? 'region' : stufe === 'region' ? 'ort' : 'nah'
      const imGewaehlten = gesucht && Math.abs(gesucht.e - wahl.e) <= wahl.seite / 2 && Math.abs(gesucht.n - wahl.n) <= wahl.seite / 2
      setWahl(imGewaehlten ? feldUmGesucht(nachher) : null)
      // nach dem Eintauchen die Orte der neuen Stufe mit ihren Masten (Michael, 2026-10-24: «beim Eintauchen wieder neue Ortschaften»)
      setOrteAn(true)
    } catch (e) { setFehler((e as Error).message) } finally { setLaedt(false) }
  }
  const knoepfe = useMemo<Knoepfe | null>(() => {
    if (stufe === 'schweiz' || !aktuell) return null
    const breit = aktuell.di[1] - aktuell.di[0] + 1, hoch = aktuell.dj[1] - aktuell.dj[0] + 1, max = hoechstens()
    const ow = breit < JE_RICHTUNG && (breit + 1) * hoch <= max, ns = hoch < JE_RICHTUNG && breit * (hoch + 1) <= max
    return { plus: { n: ns, s: ns, o: ow, w: ow }, minus: { n: hoch > 1, s: hoch > 1, o: breit > 1, w: breit > 1 } }
  }, [stufe, aktuell])
  /** an einer Seite eine Reihe Stücke ansetzen oder wegnehmen; die Stufen darunter gelten dann nicht mehr */
  async function erweitern(seite: Seite, plus: boolean) {
    if (stufe === 'schweiz' || !aktuell || !knoepfe || laedt) return
    const b = aktuell
    if (plus && !knoepfe.plus[seite]) {
      const max = hoechstens()
      setMeldung(`Grösser geht es auf diesem Gerät nicht: höchstens ${JE_RICHTUNG} Stücke in eine Richtung und ${max} im Ganzen. `
        + 'Jedes Stück ist ein eigenes Luftbild mit bis zu 16 Millionen Bildpunkten, und alle zusammen muss die Grafik des Geräts halten.')
      return
    }
    if (!plus && !knoepfe.minus[seite]) { setMeldung('Ein Stück bleibt immer: kleiner geht es nicht.'); return }
    const di: [number, number] = [...b.di], dj: [number, number] = [...b.dj]
    const neu: Array<[number, number]> = []
    if (plus) {
      if (seite === 'o' || seite === 'w') {
        const i = seite === 'o' ? ++di[1] : --di[0]
        for (let j = dj[0]; j <= dj[1]; j++) neu.push([i, j])
      } else {
        const j = seite === 'n' ? ++dj[1] : --dj[0]
        for (let i = di[0]; i <= di[1]; i++) neu.push([i, j])
      }
    } else if (seite === 'o') di[1]--; else if (seite === 'w') di[0]++; else if (seite === 'n') dj[1]--; else dj[0]++
    setLaedt(true); setFehler(null); setMeldung(null)
    try {
      const teile = new Map([...b.teile].filter(([k]) => {
        const [i, j] = k.split('_').map(Number)
        return i >= di[0] && i <= di[1] && j >= dj[0] && j <= dj[1]
      }))
      const unter = gelaende[DARUEBER[stufe]]
      const geladen = await Promise.all(neu.map(([i, j]) => stufeLaden(stufe, teilFeld(b, i, j), stufe === 'region' ? null : unter)))
      neu.forEach(([i, j], x) => teile.set(`${i}_${j}`, geladen[x]))
      // der Anker bleibt, auch wenn sein Stück wegfällt: die Lage der anderen bezieht sich auf ihn
      const nb: Bestand = { anker: b.anker, teile, di, dj }
      setGelaende((a) => ({ ...a, [stufe]: nb, ...(stufe === 'region' ? { ort: null, nah: null } : stufe === 'ort' ? { nah: null } : {}) }))
      setWahl(null)
    } catch (e) { setFehler((e as Error).message) } finally { setLaedt(false) }
  }
  function zufall() {
    const g = gelaende.schweiz
    if (!g || !zusatz) return
    setGesucht(null)
    // ein Feld um einen zufälligen Gipfel: dort gibt es etwas zu sehen
    const gipfel = zusatz.sw.gipfel.filter((x) => x.hoehe_m !== null && imGebiet(zusatz.pool, 'CH', x.lage[0], x.lage[1]))
    const x = gipfel[Math.floor(Math.random() * gipfel.length)]
    const [e, n] = lv95(x.lage[0], x.lage[1])
    setWahl({ e: Math.round(e / RASTER_M.schweiz) * RASTER_M.schweiz, n: Math.round(n / RASTER_M.schweiz) * RASTER_M.schweiz, seite: FELD_M.schweiz })
  }
  /** ein gesuchter Ort: zurück in die ganze Schweiz, das Feld um ihn gewählt (Michael, 2026-10-23: «Orte mit einer Suchfunktion orten») */
  function ortWaehlen(e: number, n: number, name: string) {
    const r = RASTER_M.schweiz
    setGesucht({ e, n, name })
    setStufe('schweiz')
    setWahl({ e: Math.round(e / r) * r, n: Math.round(n / r) * r, seite: FELD_M.schweiz })
  }
  // nur in einer Testfassung (VITE_S3D_TEST): ein Feld von aussen wählen
  useEffect(() => {
    if (!import.meta.env.VITE_S3D_TEST) return
    ;(window as unknown as { s3d: unknown }).s3d = { waehle: (e: number, n: number, seite: number) => setWahl({ e, n, seite }), wind: () => setWindAn((x) => !x), orte: () => setOrteAn((x) => !x), hoehen: () => setScheiben((x) => !x), gebaeude: () => setGebaeudeAn((x) => !x), sonne: () => setSonnenAn((x) => !x), zeit: (m: number) => setMinuten(m) }
  }, [])
  const zurueck = (s: Stufe) => { setWahl(feldUmGesucht(s)); setStufe(s) }
  const eineZurueck = () => {
    if (stufe === 'nah') zurueck('ort'); else if (stufe === 'ort') zurueck('region'); else if (stufe === 'region') zurueck('schweiz'); else setWahl(null)
  }
  const titel = (f: Feld | null) => {
    const i = f ? feldInhalt(f, zusatz) : null
    return i?.orte[0] ? `um ${i.orte[0]}` : i?.gipfel ? `am ${i.gipfel.name}` : 'Feld'
  }
  const hinweis = aktuell ? [...aktuell.teile.values()].find((t) => t.hinweis)?.hinweis : undefined
  const groesse = aktuell && stufe !== 'schweiz' && (aktuell.teile.size > 1)
    ? `${((aktuell.di[1] - aktuell.di[0] + 1) * aktuell.anker.seite / 1000).toLocaleString('de-CH')} × ${((aktuell.dj[1] - aktuell.dj[0] + 1) * aktuell.anker.seite / 1000).toLocaleString('de-CH')} km`
    : null

  return (
    <div className="px-4 pb-4">
      {!eigeneSeite && <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />}
      {/* auf 3dland.ch stehen Name und Bildmarke im Bild (Michael, 2026-10-21: «diese Zeilen entfernen») */}
      <h1 className={eigeneSeite ? 'sr-only' : 'mt-4 text-2xl font-bold tracking-tight'}>{eigeneSeite ? '3dland: 3D Schweiz' : '3D Schweiz'}</h1>
      {fehler && <Ladefehler className="mt-3" was="Das Gelände konnte nicht geladen werden." fehler={fehler} />}
      <div className={voll ? 'fixed inset-0 z-[80] overflow-hidden bg-[#cfe3f5] dark:bg-[#0d1b2a]'
        : 'relative mt-2 h-[68vh] min-h-[360px] overflow-hidden rounded-lg bg-[#cfe3f5] dark:bg-[#0d1b2a]'}>
        {aktuell ? (
          <Ansicht b={aktuell} stufe={stufe} wahl={wahl}
                   waehlen={stufe === 'nah' ? undefined : (e, n) => {
                     const r = RASTER_M[stufe], s = FELD_M[stufe]
                     const w = { e: Math.round(e / r) * r, n: Math.round(n / r) * r, seite: s }
                     // nur in einer Testfassung (VITE_S3D_TEST): das gewählte Feld in die Konsole
                     if (import.meta.env.VITE_S3D_TEST) console.log('feld', JSON.stringify(w))
                     setWahl(w); setGesucht(null)
                   }} abwaehlen={() => { setWahl(null); setGesucht(null) }} eintauchen={() => void eintauchen()} zurueck={eineZurueck} info={info} brilleRef={brille} zusatz={zusatz}
                   knoepfe={knoepfe} erweitern={(s, p) => void erweitern(s, p)} scheiben={scheiben}
                   gebaeude={gebaeudeAn && umweltHier} baeume={baeumeAn && umweltHier} umweltHier={umweltHier} meldung={meldung} wandern={wandern}
                   sonnenAn={sonnenAn} orte={orteAn} gipfel={gipfelAn} schalten={(art) => ({ hoehen: setScheiben, orte: setOrteAn, gipfel: setGipfelAn, wandern: setWandern, gebaeude: setGebaeudeAn, baeume: setBaeumeAn,
                     sonne: setSonnenAn, wind: setWindAn })[art]((x) => !x)} sonne={stand} sonnenZeilen={sonnenZeilen} standort={standort}
                   windAn={windAn} windWerte={windPl.map((p) => ({ wind: windZur(p, windZeigt?.zeit ?? null), name: p.station?.name ?? null }))} windOrte={windOrte} nieder={niederJetzt}
                   zeitSchieben={zeitSchieben} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-sbb-metal">Die Schweiz wird geladen …</div>
        )}
        <Ladebalken inKarte />
        <div className="absolute right-2 top-2 flex items-center gap-2">
          <button type="button" onClick={inBrille} className="rounded-lg bg-sbb-red px-2.5 py-1 text-xs font-bold text-white">
            Mit VR-Brille
          </button>
          <VollbildKnopf voll={voll} umschalten={() => setVoll(!voll)} />
        </div>
        {brilleHinweis && (
          <p role="status" className="absolute inset-x-2 top-12 rounded-lg bg-white/95 p-2 text-xs font-medium dark:bg-sbb-midnight/95">{brilleHinweis}</p>
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {stufe === 'schweiz' && (
            <button type="button" onClick={zufall} className="rounded-lg border border-sbb-cloud bg-white/90 px-2.5 py-1 text-xs font-bold dark:border-sbb-iron dark:bg-sbb-midnight/90">
              Überrasch mich
            </button>
          )}
          {/* neben der Suche, damit der Knopf «Eintauchen» darunter nichts verdeckt */}
          {/* im Vollbild ist rechts «Schliessen» breiter: dort das Fadenkreuz unter der Suche */}
          <div className={voll ? 'flex flex-col items-start gap-1' : 'flex items-center gap-1'}>
            {zusatz && zusatz.ortschaften.length > 0 && <OrtSuche zusatz={zusatz} waehlen={ortWaehlen} />}
            <button type="button" onClick={gpsUmschalten} aria-pressed={gpsAn}
                    aria-label={gpsAn ? 'Mein Standort ausschalten' : 'Mein Standort zeigen'}
                    title={gpsAn ? (standort ? 'Mein Standort (aus)' : 'Standort wird gesucht …') : 'Mein Standort'}
                    className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg border ${gpsAn ? 'border-sbb-anthracite bg-sbb-anthracite text-white' : 'border-sbb-cloud bg-white/90 text-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight/90 dark:text-sbb-white'} ${gpsAn && !standort ? 'animate-pulse' : ''}`}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
                <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" />
              </svg>
            </button>
          </div>
        </div>
        {meldung && (
          <button type="button" onClick={() => setMeldung(null)} role="status"
                  className="absolute inset-x-2 top-12 rounded-lg bg-white/95 p-3 text-left text-sm font-medium shadow-lg dark:bg-sbb-charcoal/95 md:left-auto md:w-96">
            {meldung}
          </button>
        )}
        {wahl && stufe !== 'nah' && (
          // oben unter der Suche, unten lag er auf dem Handy oft unter dem Bildschirmrand (Michael, 2026-10-24: «Der Eintauchen
          // Button müsste oben sein sonst sieht man ihn nicht»); nur der Knopf, ohne Orte im Feld und «Andere Wahl» (Michael,
          // 2026-10-24: «Hier braucht es nur den Eintauchen-Button»), ein anderes Feld wählt ein Tipp ins Modell
          <button type="button" onClick={() => void eintauchen()} disabled={laedt}
                  className={`absolute inset-x-2 ${voll ? (stufe === 'schweiz' ? 'top-[7.75rem]' : 'top-[5.5rem]') : stufe === 'schweiz' ? 'top-[5.25rem]' : 'top-14'} min-h-11 rounded-lg bg-sbb-red px-4 font-bold text-white shadow-lg hover:bg-sbb-red125 disabled:opacity-50 md:left-auto md:w-80`}>
            {laedt ? 'Wird geladen …' : 'Eintauchen'}
          </button>
        )}
      </div>
      <nav aria-label="Stufe" className="mt-2 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => zurueck('schweiz')} className={`rounded-lg px-2 py-1 ${stufe === 'schweiz' ? 'font-bold' : 'underline'}`}>Schweiz</button>
        {gelaende.region && (
          <>›<button type="button" onClick={() => zurueck('region')} className={`rounded-lg px-2 py-1 ${stufe === 'region' ? 'font-bold' : 'underline'}`}>
            Region {titel(gelaende.region.anker)}</button></>
        )}
        {(stufe === 'ort' || stufe === 'nah') && gelaende.ort && (
          <>›<button type="button" onClick={() => zurueck('ort')} className={`rounded-lg px-2 py-1 ${stufe === 'ort' ? 'font-bold' : 'underline'}`}>
            {titel(gelaende.ort.anker)}</button></>
        )}
        {stufe === 'nah' && gelaende.nah && <>›<span className="px-2 py-1 font-bold">1 km {titel(gelaende.nah.anker) === 'Feld' ? '' : titel(gelaende.nah.anker)}</span></>}
        {groesse && <span className="px-1 text-sbb-metal dark:text-sbb-storm">({groesse})</span>}
      </nav>
      {windAn && (
        <WindTafel className="mt-2" station={windStation} messung={windMessung} waehlen={setWindZeigt} plaetze={windPl} />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {sonnenAn && (
          <>
            <input type="date" value={tag} onChange={(e) => { if (e.target.value) setTag(e.target.value) }} aria-label="Datum"
                   className="rounded-lg border border-sbb-cloud bg-white px-2 py-1 dark:border-sbb-iron dark:bg-sbb-midnight" />
            <label className="flex min-w-48 flex-1 items-center gap-2">
              <span className="sr-only">Uhrzeit</span>
              <input type="range" min={0} max={1425} step={15} value={minuten} onChange={(e) => setMinuten(Number(e.target.value))}
                     className="flex-1 accent-sbb-red" />
              <span className="w-12 font-bold tabular-nums">{uhrzeit(minuten)}</span>
            </label>
            <button type="button" onClick={() => zeitSchieben('jetzt', 0)}
                    className="rounded-lg border border-sbb-cloud bg-white px-2.5 py-1.5 text-xs font-bold dark:border-sbb-iron dark:bg-sbb-midnight">Jetzt</button>
          </>
        )}
      </div>
      {standText && <p className="mt-1 text-sm">{standText} ({tagText}, {uhrzeit(minuten)} Uhr, Schweizer Zeit).</p>}
      {hinweis && <p className="mt-2 text-sm font-bold">{hinweis}</p>}
      {scheiben && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-sbb-metal dark:text-sbb-storm" aria-label="Höhenlinien">
          {HOEHEN_STUFEN.map(([z, farbe, name]) => (
            <span key={z} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: farbe }} />{z.toLocaleString('de-CH')} m ({name})
            </span>
          ))}
        </p>
      )}
      {wandern && stufe !== 'schweiz' && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-sbb-metal dark:text-sbb-storm" aria-label="Wanderwege">
          {WANDER_NAMEN.map(([a, name]) => (
            <span key={a} className="inline-flex items-center gap-1">
              <span className="inline-block h-1 w-4 rounded-sm outline outline-1 outline-white" style={{ background: WANDER_FARBEN[a] }} />{name}
            </span>
          ))}
        </p>
      )}
      {anker && (
        <details className="klapp mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
          <summary className="flex min-h-9 cursor-pointer items-center underline underline-offset-2">Modell, nicht massstäblich: Quellen</summary>
          <p className="mt-1">Gelände: {anker.quellen[0]}. Luftbild: {anker.quellen[1]}. Orte der Landeskarte 1:1 Million (swisstopo),
            Gipfel (swisstopo), Seen aus swissTLMRegio (swisstopo), Kantone (BFS). Ortschaften auf den Masten: swissTLMRegio (swisstopo),
            die grösseren zuerst nach der Objektart der Quelle, mit Abstand zueinander; Auswahl und Mast gewählt. Ein Feld ist ein Quadrat, keine Region und kein Tal:
            deren Grenzen stehen in keiner unserer Quellen. Wanderwege: swissTLM3D (swisstopo), alle Wege, die dort als Wanderweg,
            Bergwanderweg oder Alpinwanderweg eingetragen sind, ohne die Stücke in Tunneln, auf das Gelände des Modells gelegt; die Farben
            folgen den Wegweisern. Wind: die letzte Messung der nächsten Station von MeteoSchweiz mit Windmessung (SwissMetNet) und ihre
            lokale Prognose (stündlich, bis 8 Tage); immer vier Windhosen in der Mitte der Viertel des Bilds, nach jeder Bewegung neu
            verteilt, jede mit dem Wind der Station, die ihr am nächsten liegt (nicht an der Station; die Tafel nennt sie), die Zahl in km/h, gezeichnet und viel grösser als in Wirklichkeit, ganz gestreckt ab 28 km/h. Sonne und Schatten: der Stand der Sonne über der Mitte des Modells, gerechnet nach den Näherungen
            des Astronomical Almanac auf etwa ein Zehntelgrad, ohne die Brechung der Luft am Horizont; Schatten wirft nur das Gelände im
            Modell, Berge ausserhalb nicht, Wolken und Dunst fehlen. Die Höhenlinien liegen auf 1'000, 2'000, 3'000 und 4'000 m über Meer, wo das
            Gelände so hoch reicht; ihre Farben sind gewählt.{umweltHier && <> Gebäude: swissBUILDINGS3D 3.0 (swisstopo), Dächer in der
            Farbe des Luftbilds, Wände grau (in keiner Quelle); Fenster und ihr Licht in der Nacht gezeichnet, Stockwerke von 3 m, Fenster
            alle 3,2 m und der Anteil, der zu jeder Stunde brennt (abends gut ein Drittel, nachts um 3 Uhr wenige), sind Annahmen. Bäume: swissTLM3D (swisstopo), Einzelbäume wie in der Quelle, Wald mit
            gezeichneten Bäumen gefüllt; Abstand, Höhe und Form in keiner Quelle; bis 800 m über Meer Laubbäume, ab 1'500 m Nadelbäume,
            dazwischen gemischt, eine Annahme nach den Höhenstufen, nicht gemessen; bei sehr vielen Bäumen wird der gezeichnete Wald lichter. {umweltGanzDa ? 'In der ganzen Schweiz (daten.taktland.ch).' : 'Vorerst nur um Köniz und um den Gantrisch.'}</>}</p>
        </details>
      )}
      {/* die Anleitung unter dem Modell, je Thema auf- und zuklappbar wie bei Taktland (Michael, 2026-10-24: «Einleitungstext streichen
          und Karte nach oben direkt zum Auftaktbild schieben. Einleitungstext als Anleitung unter der Karte und jeweils kategorisieren») */}
      <h2 className="mt-6 text-xl font-bold">Anleitung</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed">
        <Abschnitt titel="Wählen und eintauchen">
          <p>Die ganze Schweiz als Modell. Tippe auf ein Feld oder such einen Ort, Gipfel oder See; «Überrasch mich» wählt ein Feld um
            einen Gipfel. Mit «Eintauchen» geht es in eine Region von 20 km, dort in ein Feld von 4 km und zuletzt in ein Stück von 1 km.
            Ein Tipp neben das Modell nimmt die Wahl zurück. Die Zeile unter dem Modell (Schweiz › Region …) führt eine Stufe zurück.</p>
        </Abschnitt>
        <Abschnitt titel="Drehen und zoomen">
          <p>Ziehen dreht, zwei Finger oder das Mausrad zoomen. Die Höhen sind echt, ohne Überhöhung. Der Knopf oben rechts zeigt das
            Modell im Vollbild.</p>
        </Abschnitt>
        <Abschnitt titel="Knöpfe an den Wänden">
          <p>Die Knöpfe an den Wänden des Sockels schalten Höhenlinien, Orte, Gipfel, Wanderwege, Gebäude, Bäume, Wind und Sonne ein und
            aus; leuchtet ein Knopf, ist es an. Am Anfang ist alles aus. Was in einer Stufe nicht geht, bleibt dunkel. + und − in der Mitte
            einer Wand setzen dort ein Stück an oder nehmen eines weg (ab der Region). Die Höhenlinien liegen auf 1'000, 2'000, 3'000 und
            4'000 m, ihre Zahl steht klein an der Wand.</p>
        </Abschnitt>
        <Abschnitt titel="Wind und Niederschlag">
          <p>«Wind» zeigt immer vier Windhosen im Bild, nach jedem Drehen und Zoomen wieder verteilt, je eine in der Mitte jedes Viertels
            des Bilds. Die Zahl über dem Mast ist die Windstärke in km/h der Station, die dem Platz am nächsten liegt (die Windhose steht
            nicht an der Station). Unter dem Modell die Tafel mit der Messung und der Prognose von MeteoSchweiz für 8 Tage: Der Regler
            wählt eine Stunde, Windhosen, Regen und Schnee zeigen dann diese Stunde.</p>
        </Abschnitt>
        <Abschnitt titel="Sonne und Schatten">
          <p>«Sonne» rechnet den Stand der Sonne über der Mitte des Modells zu Datum und Uhrzeit, mit Schatten. An der Wand verschieben
            −1 h und +1 h die Zeit, −1 Tag und +1 Tag das Datum, «Jetzt» setzt beides auf jetzt; unter dem Modell lassen sich Datum und
            Uhrzeit auch direkt wählen. Steht die Sonne unter dem Horizont, brennt Licht in den Fenstern der Gebäude, abends in vielen,
            nach Mitternacht in wenigen. Fenster und Stockwerke stehen in keiner Quelle: Sie sind gezeichnet, und wie viele brennen, ist
            eine Annahme.</p>
        </Abschnitt>
        <Abschnitt titel="Mein Standort">
          <p>Das Fadenkreuz neben der Suche zeigt dich per GPS als roten Punkt im Modell und wählt das Feld um dich. Der Standort bleibt
            auf dem Gerät.</p>
        </Abschnitt>
        <Abschnitt titel="Mit VR-Brille">
          <p>Mit einer Brille wie der Meta Quest steht das Modell auf dem Tisch. Ein kurzer Abzug wählt ein Feld, nochmals taucht ein;
            ein gehaltener Abzug trägt das Modell, beide zusammen drehen und skalieren es. Die Greiftaste geht eine Stufe zurück, der
            Thumbstick dreht und hebt, drücken stellt es zurück. Die Knöpfe an den Wänden gehen mit Strahl und Abzug.</p>
        </Abschnitt>
      </div>
    </div>
  )
}

/* ---------- die Zeichnung ---------- */

/** Der Sockel unter dem Gelände (Michael, 2026-10-19: «auf einem Holzsockel … wie ein Deko-Element»; vorher liefen die Ränder ins
 *  Leere; danach: «kein Holz mehr sondern eine schwarze Wand, die sich aber dennoch schattieren lässt», «etwas höher»): rundum
 *  eine Wand von der Kante des Geländes bis unter seinen tiefsten Punkt, darunter eine breitere Platte, beide fast schwarz und im
 *  Licht schattiert. Masse als Anteil der Breite des Modells, nicht aus einer Quelle. */
const SOCKEL_WAND = 0.06, SOCKEL_PLATTE = 0.025, SOCKEL_UEBERSTAND = 0.012
/** je Seite ein eigener Grauton (Norden, Osten, Süden, Westen), damit man die Seiten gut unterscheidet; das Licht kommt dazu */
const SOCKEL_WAND_FARBEN = ['#363636', '#404040', '#4c4c4c', '#3a3a3a'], SOCKEL_PLATTE_FARBE = '#2c2c2c'

/** in der Brille: das Modell so breit auf Tischhöhe, so weit vor dir (wie die Modellbahn) */
const BRILLE_BREITE_M = 1.2, BRILLE_TISCH_M = 0.8, BRILLE_ABSTAND_M = 0.9
/** Knöpfe an den Wänden: wie weit sie vorstehen, als Anteil der Breite des Modells (aus, an, die flache Anzeige der Zeit), und
 *  in welcher Farbe sie leuchten (Gelände gelb, Gebäude und Bäume grün, Sonne rot); gewählt, nicht aus einer Quelle */
/** so lange blenden sich Höhenlinien und Orte von vorne nach hinten ein und rückwärts aus (Michael, 2026-10-22: «innerhalb von 2
 *  oder 3 Sekunden») */
const VERLAUF_S = 2.5
/** das Geräusch dazu ist kürzer (Michael, 2026-10-22: «noch zu lang») */
const VERLAUF_TON_S = 0.9
const KNOPF_DRAUSSEN = 0.011, KNOPF_DRIN = 0.003, KNOPF_FLACH = 0.0015
const LICHT = { gelaende: '#ffd23c', umwelt: '#4cd964', sonne: '#ff5a3c', wind: '#5ab4ff' }
/** Schattenkarte in der Brille: 2048 statt 4096 Bildpunkte, ein Viertel des Speichers (eine Annahme zur Grafik der Brille, nicht gemessen) */
const BRILLE_SCHATTEN_PX = 2048
/** Schrift in der Brille, Höhe eines Schilds in Metern */
const BRILLE_SCHRIFT_M = 0.022

/** Höhen auf ganzen Tausend Metern (Michael, 2026-10-20: «alle 1000m … 1000m Rot, 2000m Gelb, 3000m Grün, 4000m Blau»), als Linie
 *  auf dem Gelände und in den Wänden, ohne Scheiben (Michael, 2026-10-24); die Farben sind gewählt, nicht aus einer Quelle */
const HOEHEN_STUFEN: Array<[number, string, string]> = [[1000, '#e0242b', 'rot'], [2000, '#f2c200', 'gelb'], [3000, '#2b9e4a', 'grün'], [4000, '#2a6fdb', 'blau']]
/** die Linien der Höhen in Bildpunkten, beim Zoomen gleich breit (Michael, 2026-10-21: «wenn ich hereinzoome werden die Linien
 *  nicht dicker») */
const HOEHEN_LINIE_PX = 1.6
/** die Zahl an der Linie: Grösse auf dem Bildschirm je Bildpunkt ihres Bilds, in der Brille ihre Höhe in Metern (gewählt) */
const HOEHEN_ZAHL_GROESSE = 0.0007, HOEHEN_ZAHL_BRILLE_M = 0.012
/** Wanderwege (Michael, 2026-10-21: «alle Wanderwege der Schweiz»): Farben nach den Wegweisern, gelb, weiss-rot und weiss-blau,
 *  hier als Linie in der Farbe auf einem weissen Rand; Breite in Bildpunkten */
const WANDER_FARBEN: Record<number, string> = { 1: '#e6a800', 2: '#d0102b', 3: '#1f5fd6' }
const WANDER_NAMEN: Array<[number, string]> = [[1, 'Wanderweg'], [2, 'Bergwanderweg'], [3, 'Alpinwanderweg']]
const WANDER_PX = 2.2, WANDER_RAND_PX = 4
/** Ortschaften: Mast als Anteil der Breite des Modells, ab welchem Rang und wie viele je Stück, Farbe wie die Bahnhöfe der
 *  Modellbahn (BAHNHOF_GRAU in Relief.tsx); Auswahl und Masse gewählt, nicht aus einer Quelle */
const ORT_MAST = 0.035, ORT_GRAU = '#2a2a2a'
/** Breite des Masts in Bildpunkten (Michael, 2026-10-21: «leicht dicker»; vorher 1) */
const ORT_MAST_PX = 2
const ORT_AB_RANG: Record<Stufe, number> = { schweiz: 5, region: 1, ort: 0, nah: 0 }
const ORT_ANZAHL: Record<Stufe, number> = { schweiz: 20, region: 20, ort: 15, nah: 10 }, ORT_ABSTAND = 0.09
/** Knöpfe an den Wänden: auf dem Bildschirm als Anteil der Bildhöhe, in der Brille in Metern */
const KNOPF_BILD = 0.06, KNOPF_BRILLE_M = 0.045
/** Höhe und Kronenradius je Art (Einzelbaum, Wald, Wald offen, Gebüschwald, Gehölzfläche), wie im Führerstand (BAUM_FORM in
 *  Relief.tsx): in keiner Quelle */
const BAUM_FORM: Array<[number, number]> = [[12, 3.5], [20, 3.2], [15, 4], [4, 2.2], [9, 3]]

interface Welt {
  setzeWahl: (f: Feld | null) => void
}

/** sRGB → linear, für die Farben der Ecken */
const LINEAR = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })

/** ein runder Knopf mit + oder − als Bild */
function knopfBild(plus: boolean, an: boolean) {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const x = c.getContext('2d')!
  x.fillStyle = an ? 'rgba(255,255,255,0.95)' : 'rgba(200,200,200,0.85)'
  x.strokeStyle = an ? KARMIN : '#8a8a8a'
  x.lineWidth = 7
  x.beginPath(); x.arc(48, 48, 42, 0, Math.PI * 2); x.fill(); x.stroke()
  x.fillStyle = an ? KARMIN : '#8a8a8a'
  x.fillRect(26, 44, 44, 9)
  if (plus) x.fillRect(43.5, 26, 9, 44)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Eine Szene für alle Stufen: Renderer, Kamera und eine laufende Sitzung in der Brille bleiben, nur das Gelände wird neu
 * gebaut. In der Brille (Michael, 2026-10-18: «muss auch immersiv auf der Brille gespielt werden können») steht das Modell
 * auf dem Tisch; ein kurzer Abzug wählt mit dem Strahl ein Feld oder drückt einen Knopf an der Wand, ein zweiter auf das Feld
 * taucht ein; ein gehaltener Abzug trägt das Modell, beide ziehen es grösser oder kleiner und drehen es (wie die Modellbahn);
 * die Greiftaste geht eine Stufe zurück, der Thumbstick dreht und hebt.
 */
function Ansicht({ b, stufe, wahl, waehlen, abwaehlen, eintauchen, zurueck, info, brilleRef, zusatz, knoepfe, erweitern, scheiben, orte, gipfel, gebaeude, baeume, umweltHier, meldung, wandern, sonnenAn, schalten, sonne: stand, sonnenZeilen, zeitSchieben, standort, windAn, windWerte, windOrte, nieder }: {
  b: Bestand; stufe: Stufe; wahl: Feld | null; waehlen?: (e: number, n: number) => void
  /** ein Tipp neben das Modell nimmt die Wahl zurück (Michael, 2026-10-24: «neben das Modell tippen … die Auswahl verschwindet») */
  abwaehlen: () => void
  eintauchen: () => void; zurueck: () => void
  /** was in der Brille über dem gewählten Feld steht */
  info: string[] | null
  brilleRef: React.MutableRefObject<(() => Promise<void>) | null>
  zusatz: Zusatz | null
  knoepfe: Knoepfe | null; erweitern: (s: Seite, plus: boolean) => void
  scheiben: boolean; orte: boolean; gipfel: boolean; gebaeude: boolean; baeume: boolean; meldung: string | null
  /** Sonnenstand zur gewählten Zeit, null: die feste Sonne wie bisher, ohne Schatten */
  sonne: Sonnenstand | null
  /** was der Schalter der Sonne in der Brille zur Zeit sagt, und wie die Brille die Zeit verschiebt */
  sonnenZeilen: string[] | null
  zeitSchieben: (art: 'stunde' | 'tag' | 'jetzt', um: number) => void
  /** Wanderwege zeigen (in den Stufen 20 km, 4 km und 1 km) */
  wandern: boolean
  /** Gebäude und Bäume gibt es hier */
  umweltHier: boolean
  /** die Sonne mit Zeit ist an; ein Schalter um, in der Brille an den Wänden */
  sonnenAn: boolean; schalten: (art: Schalter) => void
  /** die Windhose: an, was sie zeigt, wo die Station steht */
  windAn: boolean; windWerte: Array<{ wind: Wind | null; name: string | null }>; windOrte: (punkte: Array<{ e: number; n: number }>) => void
  /** Regen oder Schnee zur gewählten Stunde, null: nichts fällt */
  nieder: { art: 'regen' | 'schnee'; staerke: number } | null
  /** der eigene Standort per GPS in LV95, null: aus */
  standort: { e: number; n: number } | null
}) {
  const huelle = useRef<HTMLDivElement>(null)
  const [grafikWeg, setGrafikWeg] = useState(false)
  const welt = useRef<Welt | null>(null)
  const kern = useRef<{
    renderer: THREE.WebGLRenderer; szene: THREE.Scene; kamera: THREE.PerspectiveCamera; steuerung: OrbitControls
    wurzel: THREE.Group; inBrille: () => boolean; setzeHimmel: () => void
    jeBild: Array<() => void>; wenn: { tipp: ((p: THREE.Vector3) => void) | null; zurueck: () => void }
    tafel: THREE.Sprite; tafelSetzen: (zeilen: string[] | null, ueber?: THREE.Vector3) => void
    sonne: THREE.DirectionalLight; himmelLicht: THREE.HemisphereLight
    anfangSetzen: () => void
    verlauf: Record<'hoehen' | 'orte' | 'gipfel', { p: number; ziel: number; ebene: THREE.Plane }>
  } | null>(null)
  const cb = useRef({ waehlen, abwaehlen, eintauchen, zurueck, erweitern, zeitSchieben, schalten })
  cb.current = { waehlen, abwaehlen, eintauchen, zurueck, erweitern, zeitSchieben, schalten }

  // einmal: Renderer, Kamera, Steuerung, Brille
  useEffect(() => {
    const el = huelle.current!
    const dunkel = matchMedia('(prefers-color-scheme: dark)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.xr.enabled = true
    el.appendChild(renderer.domElement)
    const szene = new THREE.Scene()
    const himmel = new THREE.Color(dunkel ? '#0d1b2a' : '#cfe3f5')
    let durchsicht = false
    const setzeHimmel = () => { szene.background = renderer.xr.isPresenting && durchsicht ? null : himmel }
    setzeHimmel()
    const kamera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.01, 2000)
    const steuerung = new OrbitControls(kamera, renderer.domElement)
    steuerung.enableDamping = true
    steuerung.maxPolarAngle = Math.PI * 0.47
    const himmelLicht = new THREE.HemisphereLight('#ffffff', '#8a8070', 1.6)
    szene.add(himmelLicht)
    const wurzel = new THREE.Group()
    szene.add(wurzel)
    // die Sonne gehört zum Modell: dreht man es in der Brille, kommt sie weiter aus derselben Himmelsrichtung über dem Gelände;
    // mit Schatten (Michael, 2026-10-21: «Sonnen und Schattenzeiten … Realistisch»), die Lage setzt der Effekt zum Sonnenstand
    renderer.shadowMap.enabled = true
    // Höhenlinien und Orte blenden sich von vorne nach hinten ein (Michael, 2026-10-22): eine Ebene quer zum Blick schneidet ab, was
    // noch nicht da ist, und wandert in VERLAUF_S über das Modell; beim Ausblenden rückwärts, hinten zuerst
    renderer.localClippingEnabled = true
    const verlauf = { hoehen: { p: 0, ziel: 0, ebene: new THREE.Plane() }, orte: { p: 0, ziel: 0, ebene: new THREE.Plane() },
                      gipfel: { p: 0, ziel: 0, ebene: new THREE.Plane() } }
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const sonne = new THREE.DirectionalLight('#ffffff', 1.4)
    const schattenPx = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700 ? 2048 : 4096
    sonne.shadow.mapSize.setScalar(schattenPx)
    // eine neue Grösse gilt erst mit einer neuen Schattenkarte
    const schattenGroesse = (px: number) => {
      if (sonne.shadow.mapSize.x === px) return
      sonne.shadow.mapSize.setScalar(px); sonne.shadow.map?.dispose(); sonne.shadow.map = null
    }
    // verliert die Grafik ihren Zustand (zu wenig Speicher), steht in der Brille das letzte Bild still vor den Augen: dann die
    // Sitzung beenden und es sagen, statt zu schweigen
    renderer.domElement.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault()
      void renderer.xr.getSession()?.end().catch(() => {})
      setGrafikWeg(true)
    })
    sonne.shadow.bias = -0.0004
    sonne.userData.bleibt = true
    sonne.target.userData.bleibt = true
    wurzel.add(sonne, sonne.target)

    // die Tafel in der Brille: Hinweise und was im Feld liegt
    // je Text eine neue Leinwand: eine Textur ändert ihre Grösse nicht mehr, wenn sie einmal auf der Grafikkarte liegt
    let tafelTextur: THREE.CanvasTexture | null = null
    const tafel = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }))
    tafel.renderOrder = 5
    tafel.visible = false
    szene.add(tafel)
    const tafelSetzen = (zeilen: string[] | null, ueber?: THREE.Vector3) => {
      if (!zeilen?.length || !renderer.xr.isPresenting) { tafel.visible = false; return }
      const tafelLeinwand = document.createElement('canvas')
      const x = tafelLeinwand.getContext('2d')!, px = 34
      x.font = `bold ${px}px Helvetica, Arial, sans-serif`
      tafelLeinwand.width = Math.ceil(Math.max(...zeilen.map((z) => x.measureText(z).width))) + 32
      tafelLeinwand.height = zeilen.length * (px + 10) + 22
      x.fillStyle = 'rgba(255,255,255,0.94)'; x.beginPath(); x.roundRect(0, 0, tafelLeinwand.width, tafelLeinwand.height, 14); x.fill()
      zeilen.forEach((z, i) => {
        x.font = `${i === 0 ? 'bold' : 'normal'} ${px}px Helvetica, Arial, sans-serif`
        x.fillStyle = i === 0 ? KARMIN : '#212121'; x.fillText(z, 16, 12 + px + i * (px + 10))
      })
      tafelTextur?.dispose()
      tafelTextur = new THREE.CanvasTexture(tafelLeinwand)
      tafelTextur.colorSpace = THREE.SRGBColorSpace
      tafel.material.map = tafelTextur
      tafel.material.needsUpdate = true
      const h = 0.03 * zeilen.length + 0.015
      tafel.scale.set(h * tafelLeinwand.width / tafelLeinwand.height, h, 1)
      tafel.position.copy(ueber ?? new THREE.Vector3(0, BRILLE_TISCH_M + 0.35, -BRILLE_ABSTAND_M))
      tafel.visible = true
    }

    // Tafel mit den Tasten beim Betreten der Brille, wie in der Modellbahn (Michael, 2026-10-21: «eine Instruktion auf der Brille,
    // welche man manuell schliessen muss»): zwischen Kopf und Modell, sie bleibt, bis man «Schliessen» mit Strahl und Abzug oder
    // A drückt; bis dahin gelten Abzug und Tragen nur für sie
    const anleitung = new THREE.Group()
    anleitung.visible = false
    szene.add(anleitung)
    {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      c.width = 1024; c.height = 700
      x.fillStyle = 'rgba(255,255,255,0.96)'; x.beginPath(); x.roundRect(0, 0, c.width, c.height, 24); x.fill()
      x.fillStyle = '#212121'; x.font = 'bold 48px Helvetica, Arial, sans-serif'
      x.fillText('3D Schweiz: Tasten', 48, 84)
      const zeilen: Array<[string, string]> = [
        ['Abzug kurz', 'Feld wählen, nochmals: eintauchen'], ['Abzug auf + oder −', 'an dieser Wand erweitern'],
        ['Abzug halten', 'Modell tragen'], ['Beide Abzüge', 'grösser, kleiner, drehen'],
        ['Thumbstick', 'drehen, heben, senken'], ['Thumbstick drücken', 'Modell zurück an den Anfang'],
        ['Greiftaste', 'eine Stufe zurück'], ['Abzug auf einen Schalter', 'an den Wänden: ein, aus, Zeit der Sonne'],
      ]
      zeilen.forEach(([taste, was], i) => {
        const y = 160 + i * 58
        x.font = 'bold 36px Helvetica, Arial, sans-serif'; x.fillStyle = KARMIN; x.fillText(taste, 48, y)
        x.font = '36px Helvetica, Arial, sans-serif'; x.fillStyle = '#212121'; x.fillText(was, 440, y)
      })
      x.font = '30px Helvetica, Arial, sans-serif'; x.fillStyle = '#767676'
      x.fillText('Ein Modell zum Anschauen, Höhe wie echt.', 48, 660)
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }))
      sp.scale.set(0.5 * c.width / c.height, 0.5, 1)
      sp.position.set(0, 1.45, -0.75)
      sp.renderOrder = 8
      anleitung.add(sp)
      const kc = document.createElement('canvas'), kx = kc.getContext('2d')!
      kc.width = 360; kc.height = 96
      kx.fillStyle = KARMIN; kx.beginPath(); kx.roundRect(0, 0, kc.width, kc.height, 16); kx.fill()
      kx.fillStyle = '#ffffff'; kx.font = 'bold 48px Helvetica, Arial, sans-serif'; kx.textAlign = 'center'
      kx.fillText('Schliessen', kc.width / 2, 64)
      const kt = new THREE.CanvasTexture(kc); kt.colorSpace = THREE.SRGBColorSpace
      const knopf = new THREE.Sprite(new THREE.SpriteMaterial({ map: kt, depthTest: false }))
      knopf.scale.set(0.06 * kc.width / kc.height, 0.06, 1)
      knopf.position.set(0, 1.45 - 0.25 - 0.045, -0.749)
      knopf.renderOrder = 9
      knopf.userData.aktion = () => { anleitung.visible = false }
      anleitung.add(knopf)
    }

    // ein Strahl trifft zuerst die Tafel mit den Tasten, dann die Knöpfe der Sonne und an den Wänden, dann das Gelände
    const strahl = new THREE.Raycaster()
    strahl.camera = kamera
    const treffen = () => {
      if (anleitung.visible) {
        const z = strahl.intersectObjects(anleitung.children.filter((o) => o.userData.aktion), false)[0]
        if (z) (z.object.userData.aktion as () => void)()
        return
      }
      const k = ['knoepfe', 'schalter'].flatMap((n) => wurzel.getObjectByName(n)?.children.filter((o) => o.visible && o.userData.aktion) ?? [])
      const knopf = strahl.intersectObjects(k, false)[0]
      if (knopf) { (knopf.object.userData.aktion as () => void)(); return }
      const boeden = wurzel.getObjectByName('boeden')
      const t = boeden ? strahl.intersectObjects(boeden.children, false)[0] : undefined
      if (t) wenn.tipp?.(wurzel.worldToLocal(t.point.clone()))
      // neben das Gelände (Himmel, Sockel): die Wahl verschwindet
      else cb.current.abwaehlen()
    }
    // Brille (Michael, 2026-10-21: «mit der Brille muss das Land irgendwie gepackt und gedreht werden können. Gleich oder ähnlich
    // wie in Taktland»): wie in der Modellbahn trägt ein gehaltener Abzug das Modell, beide ziehen es grösser oder kleiner und
    // drehen es; ein kurzer Abzug wählt mit dem Strahl wie bisher; die Greiftaste geht eine Stufe zurück, der Thumbstick dreht
    // und hebt, Thumbstick drücken stellt das Modell zurück an den Anfang
    const wenn: { tipp: ((p: THREE.Vector3) => void) | null; zurueck: () => void } = { tipp: null, zurueck: () => cb.current.zurueck() }
    let drehung = 0, zoom = 1
    /** Lage des Modells, sobald es getragen oder gehoben wurde; null: auf dem Tisch wie am Anfang */
    let lage: THREE.Vector3 | null = null
    const haelt = new Set<THREE.Object3D>()
    const anfang = new Map<THREE.Object3D, { p: THREE.Vector3; t: number; getragen: boolean }>()
    const handLage = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
    const gieren = (o: THREE.Object3D) => {
      const v = new THREE.Vector3(0, 0, -1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()))
      return Math.atan2(-v.x, -v.z)
    }
    // was beim Anfassen galt: Lage der Hand oder der Hände und des Modells
    let griff: { p: THREE.Vector3; gier: number; abstand: number; m: THREE.Vector3; r: number; z: number } | null = null
    const anfassen = () => {
      const h = [...haelt]
      if (!h.length) { griff = null; return }
      lage ??= wurzel.position.clone()
      const [a, b] = h.map(handLage)
      griff = h.length === 1
        ? { p: a, gier: gieren(h[0]), abstand: 0, m: lage.clone(), r: drehung, z: zoom }
        : { p: a.clone().add(b).multiplyScalar(0.5), gier: Math.atan2(b.x - a.x, b.z - a.z), abstand: Math.max(0.02, a.distanceTo(b)),
            m: lage.clone(), r: drehung, z: zoom }
    }
    const controller = [0, 1].map((i) => {
      const c = renderer.xr.getController(i)
      const linie = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: KARMIN }))
      linie.scale.z = 3
      c.add(linie)
      c.addEventListener('selectstart', () => { anfang.set(c, { p: handLage(c), t: performance.now(), getragen: false }) })
      c.addEventListener('selectend', () => {
        const a = anfang.get(c)
        anfang.delete(c)
        if (haelt.delete(c)) { anfassen(); return }
        if (!a || a.getragen) return
        // kurz gedrückt: wählen wie bisher
        const m = new THREE.Matrix4().extractRotation(c.matrixWorld)
        strahl.ray.origin.setFromMatrixPosition(c.matrixWorld)
        strahl.ray.direction.set(0, 0, -1).applyMatrix4(m)
        treffen()
      })
      c.addEventListener('squeeze', () => wenn.zurueck())
      szene.add(c)
      return c
    })
    const anfangSetzen = () => { drehung = 0; zoom = 1; lage = null; haelt.clear(); griff = null }
    // Schilder und Knöpfe: auf dem Bildschirm in fester Grösse, in der Brille in Metern
    const sprites = () => ['schilder', 'knoepfe', 'standort', 'hoehen'].flatMap((n) => (wurzel.getObjectByName(n)?.children ?? [])
      .filter((o): o is THREE.Sprite => o instanceof THREE.Sprite))
    const brilleSetzen = () => {
      const breite = (wurzel.userData.weiteKm as number) || 1
      const s = (BRILLE_BREITE_M / breite) * zoom
      wurzel.scale.setScalar(s)
      wurzel.rotation.y = drehung
      if (lage) wurzel.position.copy(lage)
      else wurzel.position.set(0, BRILLE_TISCH_M - ((wurzel.userData.untenY as (() => number) | undefined)?.() ?? 0) * s, -BRILLE_ABSTAND_M)
      for (const sp of sprites()) {
        sp.material.sizeAttenuation = true
        const v = sp.userData.verhaeltnis as number, m = (sp.userData.brilleM as number | undefined) ?? BRILLE_SCHRIFT_M
        sp.scale.set((m / s) * v, m / s, 1)
      }
    }
    const bildschirmSetzen = () => {
      wurzel.scale.setScalar(1); wurzel.rotation.y = 0; wurzel.position.set(0, 0, 0)
      for (const sp of sprites()) {
        sp.material.sizeAttenuation = false
        sp.scale.set(sp.userData.b, sp.userData.h, 1)
      }
      tafel.visible = false
    }
    renderer.xr.addEventListener('sessionend', () => { inDerBrille = false; schattenGroesse(schattenPx); bildschirmSetzen(); setzeHimmel(); anleitung.visible = false; kamera.near = 0.01; kamera.updateProjectionMatrix() })
    brilleRef.current = async () => {
      const xr = navigator.xr
      if (!xr) throw new Error('Kein WebXR')
      durchsicht = await xr.isSessionSupported('immersive-ar').catch(() => false)
      const sitzung = await xr.requestSession(durchsicht ? 'immersive-ar' : 'immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] })
      renderer.xr.setReferenceSpaceType('local-floor')
      kamera.near = 0.01; kamera.updateProjectionMatrix()
      await renderer.xr.setSession(sitzung)
      inDerBrille = true
      schattenGroesse(BRILLE_SCHATTEN_PX)
      anfangSetzen()
      brilleSetzen(); setzeHimmel()
      tafelSetzen(null)
      anleitung.visible = true
    }
    const OBEN = new THREE.Vector3(0, 1, 0)
    const stickGedrueckt = new Set<string>()
    let verlaufZeit = performance.now()
    const mitte = new THREE.Vector3(), blick = new THREE.Vector3(), auf = new THREE.Vector3()
    const verlaufSetzen = () => {
      const jetzt = performance.now(), dt = Math.min(0.1, (jetzt - verlaufZeit) / 1000)
      verlaufZeit = jetzt
      const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : kamera
      wurzel.getWorldPosition(mitte)
      blick.setFromMatrixPosition(cam.matrixWorld).sub(mitte).setY(0)
      if (blick.lengthSq() < 1e-12) blick.set(0, 0, 1)
      blick.normalize()
      // halbe Diagonale des Modells in der Welt, etwas mehr, damit am Anfang nichts und am Ende alles zu sehen ist
      const R = ((wurzel.userData.weiteKm as number) || 1) * wurzel.scale.x * 0.75
      for (const [name, v] of Object.entries(verlauf)) {
        v.p = v.ziel > v.p ? Math.min(v.ziel, v.p + dt / VERLAUF_S) : Math.max(v.ziel, v.p - dt / VERLAUF_S)
        const e = v.p * v.p * (3 - 2 * v.p), s = -R + 2 * R * e
        v.ebene.set(blick, s - blick.dot(mitte))
        const g = wurzel.getObjectByName(name)
        if (g) g.visible = v.p > 0
        // die Schilder der Orte und Gipfel einzeln, je nachdem, ob die Ebene schon über sie hinweg ist
        for (const sp of wurzel.getObjectByName('schilder')?.children ?? []) {
          if (sp.userData.art === name) sp.visible = v.p > 0 && v.ebene.distanceToPoint(sp.getWorldPosition(auf)) >= 0
        }
      }
      // in der Brille weniger Last (Michael, 2026-10-22: Höhen und Bäume zusammen «etwas zu viel»): Bäume ohne eigenen Schatten
      const brille = renderer.xr.isPresenting
      for (const o of wurzel.getObjectByName('baeume')?.children ?? []) o.castShadow = !brille
    }
    const jeBild: Array<() => void> = [() => {
      if (!renderer.xr.isPresenting) return
      const sitzung = renderer.xr.getSession()
      // ein Abzug gilt als gehalten, sobald die Hand 3 cm weiter ist oder er 0,4 s gedrückt bleibt (Grenzen gewählt)
      for (const [c, a] of anfang) {
        if (a.getragen || anleitung.visible || (handLage(c).distanceTo(a.p) < 0.03 && performance.now() - a.t < 400)) continue
        a.getragen = true
        haelt.add(c); anfassen()
      }
      const h = [...haelt]
      if (griff && lage && h.length === 1) {
        const p = handLage(h[0]), d = gieren(h[0]) - griff.gier
        lage.copy(p).add(griff.m.clone().sub(griff.p).applyAxisAngle(OBEN, d))
        drehung = griff.r + d
      } else if (griff && lage && h.length === 2) {
        const [a, b] = h.map(handLage)
        zoom = Math.min(8, Math.max(0.25, griff.z * (a.distanceTo(b) / griff.abstand)))
        const d = Math.atan2(b.x - a.x, b.z - a.z) - griff.gier
        lage.copy(a).add(b).multiplyScalar(0.5)
          .add(griff.m.clone().sub(griff.p).multiplyScalar(zoom / griff.z).applyAxisAngle(OBEN, d))
        drehung = griff.r + d
      }
      for (const q of sitzung?.inputSources ?? []) {
        const a = q.gamepad?.axes
        // A (rechts, Knopf 4 der Quest) schliesst die Tafel mit den Tasten
        if (anleitung.visible && q.handedness === 'right' && q.gamepad?.buttons[4]?.pressed) anleitung.visible = false
        const knopf = q.gamepad?.buttons[3]?.pressed ?? false
        if (knopf && !stickGedrueckt.has(q.handedness)) anfangSetzen()
        if (knopf) stickGedrueckt.add(q.handedness); else stickGedrueckt.delete(q.handedness)
        if (!a || a.length < 4 || griff) continue
        if (Math.abs(a[2]) > 0.2) drehung -= a[2] * 0.03
        if (Math.abs(a[3]) > 0.2) { lage ??= wurzel.position.clone(); lage.y = Math.max(0.1, Math.min(2.2, lage.y - a[3] * 0.006)) }
      }
      brilleSetzen()
    }]
    jeBild.push(verlaufSetzen)
    kern.current = { renderer, szene, kamera, steuerung, wurzel, inBrille: () => renderer.xr.isPresenting, setzeHimmel, jeBild, wenn, tafel, tafelSetzen,
                     sonne, himmelLicht, anfangSetzen, verlauf }

    const groesse = () => {
      if (renderer.xr.isPresenting) return
      renderer.setSize(el.clientWidth, el.clientHeight)
      kamera.aspect = el.clientWidth / Math.max(1, el.clientHeight); kamera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(groesse)
    ro.observe(el)
    // Tippen wählt, Ziehen dreht
    let unten: { x: number; y: number; t: number } | null = null
    const runter = (ev: PointerEvent) => { unten = { x: ev.clientX, y: ev.clientY, t: performance.now() } }
    const hoch = (ev: PointerEvent) => {
      const u = unten; unten = null
      if (!u || Math.hypot(ev.clientX - u.x, ev.clientY - u.y) > 8 || performance.now() - u.t > 500) return
      const r = renderer.domElement.getBoundingClientRect()
      strahl.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), kamera)
      treffen()
    }
    // nur in einer Testfassung (VITE_S3D_TEST): wo die Knöpfe im Bild liegen
    if (import.meta.env.VITE_S3D_TEST) {
      (window as unknown as { s3dSchalter: unknown }).s3dSchalter = () => (wurzel.getObjectByName('schalter')?.children ?? [])
        .filter((o) => o.visible).map((o) => {
          const p = o.getWorldPosition(new THREE.Vector3()), v = p.clone().project(kamera), r = renderer.domElement.getBoundingClientRect()
          return { text: o.userData.text, p: p.toArray(), x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
        });
      (window as unknown as { s3dInfo: unknown }).s3dInfo = () => ({ programme: renderer.info.programs?.length, ...renderer.info.render, ...renderer.info.memory });
      (window as unknown as { s3dKnoepfe: unknown }).s3dKnoepfe = () => {
        const r = renderer.domElement.getBoundingClientRect()
        return (wurzel.getObjectByName('knoepfe')?.children ?? []).filter((o) => o.visible).map((o) => {
          const v = o.getWorldPosition(new THREE.Vector3()).project(kamera)
          return { seite: o.userData.seite, plus: o.userData.plus, x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
        })
      }
    }
    renderer.domElement.addEventListener('pointerdown', runter)
    renderer.domElement.addEventListener('pointerup', hoch)
    // die Knöpfe nur an den Wänden, die zur Kamera schauen; die hinteren verdeckt das Modell
    const auge = new THREE.Vector3()
    const knoepfeZeigen = () => {
      const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : kamera
      wurzel.worldToLocal(auge.setFromMatrixPosition(cam.matrixWorld))
      for (const o of wurzel.getObjectByName('knoepfe')?.children ?? []) o.visible = auge.clone().sub(o.position).dot(o.userData.nach as THREE.Vector3) > 0
      // die Schalter an den Wänden auch auf dem Bildschirm (Michael, 2026-10-22: «nicht nur auf der Brille … auch in der Standardversion»)
      // ebenso die Zahlen an den Höhenlinien
      for (const o of wurzel.getObjectByName('hoehen')?.children ?? []) {
        if (o instanceof THREE.Sprite) o.visible = auge.clone().sub(o.position).dot(o.userData.nach as THREE.Vector3) > 0
      }
      for (const o of wurzel.getObjectByName('schalter')?.children ?? []) {
        o.visible = auge.clone().sub(o.position).dot(o.userData.nach as THREE.Vector3) > 0
      }
    }
    const aufloesung = new THREE.Vector2()
    renderer.setAnimationLoop(() => {
      for (const f of jeBild) f()
      knoepfeZeigen()
      renderer.getSize(aufloesung)
      for (const name of ['hoehen', 'wanderwege', 'orte']) {
        for (const o of wurzel.getObjectByName(name)?.children ?? []) ((o as LineSegments2).material as LineMaterial).resolution?.copy(aufloesung)
      }
      if (!renderer.xr.isPresenting) steuerung.update()
      renderer.render(szene, kamera)
    })
    return () => {
      renderer.setAnimationLoop(null)
      void renderer.xr.getSession()?.end().catch(() => {})
      ro.disconnect()
      steuerung.dispose()
      renderer.domElement.removeEventListener('pointerdown', runter)
      renderer.domElement.removeEventListener('pointerup', hoch)
      for (const c of controller) szene.remove(c)
      tafelTextur?.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      kern.current = null
      brilleRef.current = null
    }
  }, [brilleRef])

  // je Stufe: das Gelände, der Sockel, die Höhenlinien, die Namen, die Knöpfe und der Kasten des gewählten Felds
  useEffect(() => {
    const k = kern.current
    if (!k) return
    const { renderer, kamera, steuerung, wurzel } = k
    const dunkel = matchMedia('(prefers-color-scheme: dark)').matches
    const teile = [...b.teile].map(([schluessel, g]) => {
      const [di, dj] = schluessel.split('_').map(Number)
      return { di, dj, g }
    })
    // das Rechteck aller Stücke, gemessen an den Mitten der äussersten Felder
    const rand = (g: Gelaende) => {
      const { ost, nord, m, breite, hoehe } = g.raster
      return { e0: ost + m / 2, e1: ost + (breite - 0.5) * m, n0: nord - (hoehe - 0.5) * m, n1: nord - m / 2 }
    }
    const r = teile.map((t) => rand(t.g))
    const E0 = Math.min(...r.map((x) => x.e0)), E1 = Math.max(...r.map((x) => x.e1))
    const N0 = Math.min(...r.map((x) => x.n0)), N1 = Math.max(...r.map((x) => x.n1))
    const weite = Math.max(E1 - E0, N1 - N0)
    const cE = (E0 + E1) / 2, cN = (N0 + N1) / 2
    const X = (e: number) => (e - cE) / 1000, Z = (n: number) => -(n - cN) / 1000
    const Y = (z: number) => z / 1000
    wurzel.userData.weiteKm = weite / 1000
    wurzel.userData.lage = { cE, cN }
    let leer = Infinity, hoechst = -Infinity, mittel = 0, zahl = 0
    for (const { g } of teile) {
      for (let q = 0; q < g.h.length; q++) {
        const z = g.h[q]
        if (z === KEINE_HOEHE) continue
        if (z < leer) leer = z
        if (z > hoechst) hoechst = z
        if (q % 7 === 0) { mittel += z; zahl++ }
      }
    }
    const tief = leer === Infinity ? 0 : leer
    mittel = zahl ? mittel / zahl : tief
    const weiteKm = weite / 1000
    const wand = weiteKm * SOCKEL_WAND, platte = weiteKm * SOCKEL_PLATTE, ueber = weiteKm * SOCKEL_UEBERSTAND
    // in der Brille steht der Sockel auf dem Tisch
    wurzel.userData.untenY = () => Y(tief) - wand - platte
    if (!renderer.xr.isPresenting) {
      kamera.far = weite / 1000 * 6; kamera.updateProjectionMatrix()
      // so weit weg, dass das ganze Modell mit dem Sockel ins Bild passt, auch im Hochformat
      const halbeSicht = Math.atan(Math.tan((kamera.fov * Math.PI) / 360) * Math.min(1, kamera.aspect))
      // schräg von Südwesten, der Blick nach Nordosten (Michael, 2026-10-19): so sieht man zwei Seiten des Sockels (die Diagonale
      // ist 1,41-mal so breit); x zeigt nach Osten, z nach Süden
      const abstand = (weite / 1000) * 0.8 / Math.tan(halbeSicht)
      kamera.position.set(-abstand * 0.55, Y(mittel) + abstand * 0.62, abstand * 0.55)
      steuerung.target.set(0, Y(mittel), 0)
      steuerung.minDistance = weite / 1000 * 0.02
      steuerung.maxDistance = weite / 1000 * 2
      steuerung.update()
    }

    // die Sonne: ihr Ziel in der Mitte des Modells, der Schattenausschnitt über das ganze Modell
    wurzel.userData.sonnenMitte = Y(mittel)
    {
      const cam = k.sonne.shadow.camera, halb = weiteKm * 0.8
      cam.left = -halb; cam.right = halb; cam.top = halb; cam.bottom = -halb
      cam.near = 0.001; cam.far = weiteKm * 8
      cam.updateProjectionMatrix()
      k.sonne.target.position.set(0, Y(mittel), 0)
    }
    // je Stück ein Netz mit seinem Luftbild
    const boeden = new THREE.Group()
    boeden.name = 'boeden'
    wurzel.add(boeden)
    const netze = teile.map(({ di, dj, g }) => {
      const { ost, nord, m, breite, hoehe } = g.raster
      const geo = new THREE.BufferGeometry()
      const pos = new Float32Array(breite * hoehe * 3), uv = new Float32Array(breite * hoehe * 2)
      for (let j = 0; j < hoehe; j++) for (let i = 0; i < breite; i++) { uv[(j * breite + i) * 2] = (i + 0.5) / breite; uv[(j * breite + i) * 2 + 1] = 1 - (j + 0.5) / hoehe }
      const idx = new Uint32Array((breite - 1) * (hoehe - 1) * 6)
      let w = 0
      for (let j = 0; j < hoehe - 1; j++) for (let i = 0; i < breite - 1; i++) {
        const a = j * breite + i
        idx[w++] = a; idx[w++] = a + breite; idx[w++] = a + 1; idx[w++] = a + 1; idx[w++] = a + breite; idx[w++] = a + breite + 1
      }
      geo.setIndex(new THREE.BufferAttribute(idx, 1))
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      const textur = new THREE.CanvasTexture(g.bild)
      textur.colorSpace = THREE.SRGBColorSpace
      textur.anisotropy = renderer.capabilities.getMaxAnisotropy()
      const netz = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: textur }))
      netz.castShadow = netz.receiveShadow = true
      boeden.add(netz)
      const setzen = () => {
        for (let j = 0; j < hoehe; j++) {
          for (let i = 0; i < breite; i++) {
            const q = j * breite + i, z = g.h[q] === KEINE_HOEHE ? tief : g.h[q]
            pos[q * 3] = X(ost + (i + 0.5) * m); pos[q * 3 + 1] = Y(z); pos[q * 3 + 2] = Z(nord - (j + 0.5) * m)
          }
        }
        geo.attributes.position.needsUpdate = true
        geo.computeVertexNormals()
        geo.computeBoundingSphere()
      }
      setzen()
      return { di, dj, g, pos, setzen }
    })

    // der Sockel, neu bei jeder Höhe; nur an den äusseren Kanten der Stücke
    const sockel = new THREE.Group()
    wurzel.add(sockel)
    // matt, damit die Seiten im Licht verschieden hell sind
    const wandMaterialien = SOCKEL_WAND_FARBEN.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }))
    const platteMaterial = new THREE.MeshStandardMaterial({ color: SOCKEL_PLATTE_FARBE, roughness: 0.5, metalness: 0 })
    // die oberen Kanten der Wände, je mit der Richtung nach aussen (für die Linien der Höhen)
    let kantenOben: Array<{ p: Float32Array; nx: number; nz: number }> = []
    const sockelBauen = () => {
      for (const o of sockel.children) (o as THREE.Mesh).geometry.dispose()
      sockel.clear()
      kantenOben = []
      const unten = Y(tief) - wand
      for (const { di, dj, g, pos } of netze) {
        const { breite, hoehe } = g.raster
        // Norden, Osten, Süden, Westen; nur, wo kein Stück daneben liegt
        const kanten: Array<[number[], number, number] | null> = [
          dj === b.dj[1] ? [Array.from({ length: breite }, (_, i) => i), 0, -1] : null,
          di === b.di[1] ? [Array.from({ length: hoehe }, (_, j) => j * breite + breite - 1), 1, 0] : null,
          dj === b.dj[0] ? [Array.from({ length: breite }, (_, i) => (hoehe - 1) * breite + breite - 1 - i), 0, 1] : null,
          di === b.di[0] ? [Array.from({ length: hoehe }, (_, j) => (hoehe - 1 - j) * breite), -1, 0] : null,
        ]
        kanten.forEach((kk, seite) => {
          if (!kk) return
          const [kante, nx, nz] = kk
          const p = new Float32Array(kante.length * 6), oben = new Float32Array(kante.length * 3)
          kante.forEach((q, i) => {
            const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2]
            p.set([x, y, z, x, unten, z], i * 6)
            oben.set([x, y, z], i * 3)
          })
          kantenOben.push({ p: oben, nx, nz })
          const ix: number[] = []
          for (let i = 0; i < kante.length - 1; i++) ix.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3)
          const gw = new THREE.BufferGeometry()
          gw.setAttribute('position', new THREE.BufferAttribute(p, 3))
          gw.setIndex(ix)
          gw.computeVertexNormals()
          sockel.add(new THREE.Mesh(gw, wandMaterialien[seite]))
        })
      }
      // die Platte darunter, etwas breiter
      const bx = X(E1) - X(E0) + 2 * ueber, bz = Z(N0) - Z(N1) + 2 * ueber
      const gp = new THREE.BoxGeometry(bx, platte, bz)
      const pl = new THREE.Mesh(gp, platteMaterial)
      pl.position.set(0, unten - platte / 2, 0)
      sockel.add(pl)
    }
    sockelBauen()

    // die Höhenlinien in den Wänden und auf dem Gelände (die durchsichtigen Scheiben dazwischen gibt es nicht mehr, Michael,
    // 2026-10-24: «Die Schichten weglassen (Höhen). Die Linien allerdings belassen»), nur auf Höhen zwischen dem tiefsten und dem höchsten Punkt
    const hoehen = new THREE.Group()
    hoehen.name = 'hoehen'
    hoehen.visible = false
    wurzel.add(hoehen)
    const ebeneH = [k.verlauf.hoehen.ebene]
    const linienMaterial = HOEHEN_STUFEN.map(([, color]) => new LineMaterial({ color, linewidth: HOEHEN_LINIE_PX, clippingPlanes: ebeneH }))
    const kurvenMaterial = HOEHEN_STUFEN.map(([, color]) => new LineMaterial({ color, linewidth: HOEHEN_LINIE_PX, transparent: true,
      opacity: 0.6, depthWrite: false, clippingPlanes: ebeneH }))
    // eine neue Stufe blendet ein, was eingeschaltet ist, wieder von vorne
    k.verlauf.hoehen.p = 0; k.verlauf.orte.p = 0; k.verlauf.gipfel.p = 0
    const linienSetzen = (g: THREE.BufferAttribute | number[], m: LineMaterial) => {
      const geo = new LineSegmentsGeometry()
      geo.setPositions(g as number[])
      const l = new LineSegments2(geo, m)
      l.renderOrder = 3
      hoehen.add(l)
    }
    // die Zahl jeder Höhe klein über ihrer Linie in den Wänden (Michael, 2026-10-24: «Bei den Linien soll klein 1000, 2000,
    // 3000 und 4000 stehen»), je Wand einmal, in der Farbe der Linie
    const zahlBild = (z: number, farbe: string) => {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      const px = 22, text = `${z.toLocaleString('de-CH')} m`
      x.font = `bold ${px}px Helvetica, Arial, sans-serif`
      c.width = Math.ceil(x.measureText(text).width) + 8; c.height = px + 6
      x.font = `bold ${px}px Helvetica, Arial, sans-serif`
      x.lineWidth = 5; x.lineJoin = 'round'; x.strokeStyle = 'rgba(0,0,0,0.9)'; x.strokeText(text, 4, px)
      x.fillStyle = farbe; x.fillText(text, 4, px)
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      return { t, b: c.width, h: c.height }
    }
    const zahlSetzen = (z: number, farbe: string, x: number, y: number, zz: number, nx: number, nz: number) => {
      const { t, b: bw, h } = zahlBild(z, farbe)
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, sizeAttenuation: false, clippingPlanes: ebeneH, depthWrite: false }))
      sp.userData = { b: bw * HOEHEN_ZAHL_GROESSE, h: h * HOEHEN_ZAHL_GROESSE, verhaeltnis: bw / h, brilleM: HOEHEN_ZAHL_BRILLE_M,
        nach: new THREE.Vector3(nx, 0, nz) }
      sp.scale.set(sp.userData.b, sp.userData.h, 1)
      sp.center.set(0, 0)
      sp.position.set(x, y, zz)
      sp.renderOrder = 4
      hoehen.add(sp)
    }
    const hoehenBauen = () => {
      for (const o of hoehen.children) {
        if (o instanceof THREE.Sprite) { o.material.map?.dispose(); o.material.dispose() } else (o as THREE.Mesh).geometry.dispose()
      }
      hoehen.clear()
      const raus = weiteKm * 0.0015, heben = weiteKm * 0.0006
      HOEHEN_STUFEN.forEach(([z], s) => {
        if (!(z > tief && z < hoechst)) return
        const y = Y(z)
        // die Linie in den Wänden: wo die Wand über die Höhe reicht, ein schmales Band knapp vor der Wand
        const band: number[] = []
        for (const { p, nx, nz } of kantenOben) {
          // die Zahl zweimal je Wand, je gut ein Fünftel vom Ende (in der Mitte sitzen + und −; ein Ende liegt oft ausserhalb des
          // Bilds), beim nächsten Stück von dort zur Mitte, an dem die Wand über die Linie reicht
          const stuecke = p.length / 3 - 1
          const ueber = (i: number) => p[i * 3 + 1] > y + weiteKm * 0.004 && p[i * 3 + 4] > y + weiteKm * 0.004
          for (const [von, bis, schritt] of [[Math.floor(stuecke * 0.2), Math.floor(stuecke * 0.42), 1], [Math.ceil(stuecke * 0.8), Math.ceil(stuecke * 0.58), -1]]) {
            for (let i = von; schritt > 0 ? i < bis : i > bis; i += schritt) {
              if (!ueber(i)) continue
              zahlSetzen(z, HOEHEN_STUFEN[s][1], p[i * 3] + nx * raus * 2, y + heben, p[i * 3 + 2] + nz * raus * 2, nx, nz)
              break
            }
          }
          for (let i = 0; i < p.length / 3 - 1; i++) {
            let ax = p[i * 3], ay = p[i * 3 + 1], az = p[i * 3 + 2], bx = p[i * 3 + 3], by = p[i * 3 + 4], bz = p[i * 3 + 5]
            if (ay < y && by < y) continue
            if (ay < y) { const t = (y - ay) / (by - ay); ax += (bx - ax) * t; az += (bz - az) * t }
            else if (by < y) { const t = (y - ay) / (by - ay); bx = ax + (bx - ax) * t; bz = az + (bz - az) * t }
            const ox = nx * raus, oz = nz * raus
            band.push(ax + ox, y, az + oz, bx + ox, y, bz + oz)
          }
        }
        if (band.length) linienSetzen(band, linienMaterial[s])
        // dieselbe Höhe als Linie auf dem Gelände, etwas durchsichtig (Michael, 2026-10-21: «Linie mit etwas Transparenz den
        // Bergen entlang weiterführen. So sieht man die Grenzen besser»): je Stück die Höhenlinie im Raster (Marching Squares),
        // knapp über dem Gelände
        const kurve: number[] = []
        for (const { g, pos } of netze) {
          const { breite, hoehe } = g.raster
          const hz = (q: number) => (g.h[q] === KEINE_HOEHE ? tief : g.h[q]) - z
          const schnitt = (a: number, b: number): [number, number] => {
            const t = hz(a) / (hz(a) - hz(b))
            return [pos[a * 3] + t * (pos[b * 3] - pos[a * 3]), pos[a * 3 + 2] + t * (pos[b * 3 + 2] - pos[a * 3 + 2])]
          }
          for (let j = 0; j < hoehe - 1; j++) {
            for (let i = 0; i < breite - 1; i++) {
              const a = j * breite + i, b = a + 1, c = a + breite + 1, d = a + breite
              const p: Array<[number, number]> = []
              for (const [u, v] of [[a, b], [b, c], [c, d], [d, a]]) if ((hz(u) >= 0) !== (hz(v) >= 0)) p.push(schnitt(u, v))
              for (let k = 0; k + 1 < p.length; k += 2) {
                kurve.push(p[k][0], y + heben, p[k][1], p[k + 1][0], y + heben, p[k + 1][1])
              }
            }
          }
        }
        if (kurve.length) linienSetzen(kurve, kurvenMaterial[s])
      })
    }
    hoehenBauen()

    // Namen: Gipfel und Orte, auf dem Bildschirm in fester Grösse, in der Brille in Metern
    const schilder = new THREE.Group()
    schilder.name = 'schilder'
    wurzel.add(schilder)
    const schild = (text: string, farbe: string, e: number, n: number, z: number) => {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      const px = 26
      x.font = `bold ${px}px Helvetica, Arial, sans-serif`
      c.width = Math.ceil(x.measureText(text).width) + 16; c.height = px + 12
      x.font = `bold ${px}px Helvetica, Arial, sans-serif`
      x.fillStyle = dunkel ? 'rgba(20,20,20,0.8)' : 'rgba(255,255,255,0.85)'
      x.beginPath(); x.roundRect(0, 0, c.width, c.height, 6); x.fill()
      x.fillStyle = farbe; x.fillText(text, 8, px)
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false }))
      sp.visible = false
      sp.userData = { art: 'gipfel', e, n, z, b: c.width * 0.0009, h: c.height * 0.0009, verhaeltnis: c.width / c.height }
      sp.scale.set(sp.userData.b, sp.userData.h, 1)
      sp.center.set(0.5, 0)
      sp.position.set(X(e), Y(z), Z(n))
      sp.renderOrder = 3
      schilder.add(sp)
    }
    const drin = (e: number, n: number) => [...b.teile.values()].some((t) => imRaster(t.raster, e, n))
    if (zusatz) {
      const gipfel = zusatz.sw.gipfel.filter((x) => x.hoehe_m !== null).map((x) => ({ x, l: lv95(x.lage[0], x.lage[1]) }))
        .filter(({ l }) => drin(l[0], l[1])).sort((a, c) => c.x.hoehe_m! - a.x.hoehe_m!)
      const anzahl = (stufe === 'schweiz' ? 8 : stufe === 'region' ? 25 : stufe === 'ort' ? 10 : 4) * Math.min(3, b.teile.size)
      for (const { x, l } of gipfel.slice(0, anzahl)) schild(`▲ ${x.name} ${x.hoehe_m!.toLocaleString('de-CH')}`, dunkel ? '#e2c9a8' : '#7a4a14', l[0], l[1], x.hoehe_m!)
    }
    // Ortschaften wie die Bahnhöfe der Modellbahn (Michael, 2026-10-21: «mit deiner … dunkelgrauen Linie, die sehr dünn ist, und
    // deiner Fahne oben, wo weiss auf schwarzem Kasten der Ortsname steht»): ein Mast, oben ein eckiges dunkelgraues Schild;
    // welche, nach dem Rang der Objektart in swissTLMRegio, die grösseren zuerst
    const ortGruppe = new THREE.Group()
    ortGruppe.name = 'orte'
    wurzel.add(ortGruppe)
    const mastKm = weiteKm * ORT_MAST
    // in der ganzen Schweiz nur Orte in der Schweiz; überall nur so viele, dass zwei Masten mindestens ORT_ABSTAND der Breite
    // auseinander stehen, die grösseren zuerst (die Liste ist nach dem Rang geordnet)
    const ortListe: Array<{ name: string; e: number; n: number; z: number }> = []
    const abstand = weite * ORT_ABSTAND, hoechstensOrte = ORT_ANZAHL[stufe] * Math.min(3, b.teile.size)
    for (const [name, e, n, rang] of zusatz?.ortschaften ?? []) {
      if (ortListe.length >= hoechstensOrte) break
      if (rang < ORT_AB_RANG[stufe] || !drin(e, n)) continue
      // derselbe Name steht in der Quelle oft zweimal (Ortschaft und Weiler)
      if (ortListe.some((o) => o.name === name || Math.hypot(o.e - e, o.n - n) < abstand)) continue
      if (stufe === 'schweiz' && zusatz && !imGebiet(zusatz.pool, 'CH', ...wgs(e, n))) continue
      ortListe.push({ name, e, n, z: bestandHoehe(b, e, n) })
    }
    for (const o of ortListe) {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      const px = 26, schrift = `normal ${px}px Helvetica, Arial, sans-serif`
      x.font = schrift
      c.width = Math.ceil(x.measureText(o.name).width) + 18; c.height = px + 14
      x.font = schrift
      x.fillStyle = ORT_GRAU; x.fillRect(0, 0, c.width, c.height)
      x.fillStyle = '#ffffff'; x.fillText(o.name, 9, px + 1)
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false }))
      sp.visible = false
      sp.userData = { art: 'orte', e: o.e, n: o.n, z: o.z, ueber: mastKm, b: c.width * 0.00085, h: c.height * 0.00085, verhaeltnis: c.width / c.height }
      sp.scale.set(sp.userData.b, sp.userData.h, 1)
      // die Tafel sitzt mittig auf dem Mast (Michael, 2026-10-21: «eingemittet zur Tafel»)
      sp.center.set(0.5, 0)
      sp.position.set(X(o.e), Y(o.z) + mastKm, Z(o.n))
      sp.renderOrder = 3
      schilder.add(sp)
    }
    const mastMaterial = new LineMaterial({ color: ORT_GRAU, linewidth: ORT_MAST_PX, clippingPlanes: [k.verlauf.orte.ebene] })
    const mastenBauen = () => {
      for (const o of ortGruppe.children) (o as LineSegments2).geometry.dispose()
      ortGruppe.clear()
      if (!ortListe.length) return
      const geo = new LineSegmentsGeometry()
      geo.setPositions(ortListe.flatMap((o) => [X(o.e), Y(o.z), Z(o.n), X(o.e), Y(o.z) + mastKm, Z(o.n)]))
      ortGruppe.add(new LineSegments2(geo, mastMaterial))
    }
    mastenBauen()

    // + und − an den Wänden, in der Mitte jeder Seite im Sockel unter dem tiefsten Punkt
    const knopfGruppe = new THREE.Group()
    knopfGruppe.name = 'knoepfe'
    wurzel.add(knopfGruppe)
    // wo die Wände stehen, für die Schalter (eigener Effekt)
    wurzel.userData.waende = { x0: X(E0), x1: X(E1), z0: Z(N0), z1: Z(N1), y: Y(tief) - wand / 2, wand, W: weiteKm }
    const knoepfeSetzen = () => {
      for (const o of knopfGruppe.children) { const sp = o as THREE.Sprite; sp.material.map?.dispose(); sp.material.dispose() }
      knopfGruppe.clear()
      if (!knoepfe) return
      const y = Y(tief) - wand / 2, raus = weiteKm * 0.01, schritt = weiteKm * 0.13
      const mitten: Record<Seite, [number, number, number, number]> = {
        n: [(X(E0) + X(E1)) / 2, Z(N1) - raus, 1, 0], s: [(X(E0) + X(E1)) / 2, Z(N0) + raus, -1, 0],
        o: [X(E1) + raus, (Z(N0) + Z(N1)) / 2, 0, 1], w: [X(E0) - raus, (Z(N0) + Z(N1)) / 2, 0, -1],
      }
      for (const seite of ['n', 'o', 's', 'w'] as Seite[]) {
        const [x, z, ax, az] = mitten[seite]
        for (const plus of [true, false]) {
          const an = plus ? knoepfe.plus[seite] : knoepfe.minus[seite]
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: knopfBild(plus, an), depthTest: false, sizeAttenuation: false }))
          sp.userData = { b: KNOPF_BILD, h: KNOPF_BILD, verhaeltnis: 1, brilleM: KNOPF_BRILLE_M, aktion: () => cb.current.erweitern(seite, plus), seite, plus,
                          nach: new THREE.Vector3(az === 0 ? 0 : az > 0 ? 1 : -1, 0, ax === 0 ? 0 : ax > 0 ? -1 : 1) }
          sp.scale.set(KNOPF_BILD, KNOPF_BILD, 1)
          const d = (plus ? -1 : 1) * schritt / 2
          sp.position.set(x + ax * d, y, z + az * d)
          sp.renderOrder = 4
          knopfGruppe.add(sp)
        }
      }
    }
    knoepfeSetzen()

    // das gewählte Feld: ein gläserner Kasten in Karmin über dem Gelände
    const kasten = new THREE.Group()
    wurzel.add(kasten)
    const kastenMaterial = new THREE.MeshBasicMaterial({ color: KARMIN, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    const kantenMaterial = new THREE.LineBasicMaterial({ color: KARMIN })
    let feldJetzt: Feld | null = null
    const setzeWahl = (fd: Feld | null) => {
      feldJetzt = fd
      for (const o of kasten.children) (o as THREE.Mesh).geometry.dispose()
      kasten.clear()
      if (!fd) return
      let hoch = 0
      for (let j = 0; j <= 10; j++) for (let i = 0; i <= 10; i++) hoch = Math.max(hoch, bestandHoehe(b, fd.e - fd.seite / 2 + (i * fd.seite) / 10, fd.n - fd.seite / 2 + (j * fd.seite) / 10))
      const bb = fd.seite / 1000, y0 = Y(tief - 50), y1 = Y(hoch) + bb * 0.15
      const box = new THREE.BoxGeometry(bb, y1 - y0, bb)
      const mesh = new THREE.Mesh(box, kastenMaterial)
      const kanten = new THREE.LineSegments(new THREE.EdgesGeometry(box), kantenMaterial)
      for (const o of [mesh, kanten]) { o.position.set(X(fd.e), (y0 + y1) / 2, Z(fd.n)); kasten.add(o) }
    }
    // ein Tipp oder Abzug: ins gewählte Feld nochmals in der Brille taucht ein, sonst ein neues Feld
    k.wenn.tipp = (p) => {
      const e = cE + p.x * 1000, n = cN - p.z * 1000
      const fd = feldJetzt
      if (k.inBrille() && fd && Math.abs(e - fd.e) <= fd.seite / 2 && Math.abs(n - fd.n) <= fd.seite / 2) { cb.current.eintauchen(); return }
      cb.current.waehlen?.(e, n)
    }
    welt.current = {
      setzeWahl,
    }
    // in der Brille gleich die neue Grösse
    if (renderer.xr.isPresenting) k.jeBild[0]()
    return () => {
      k.wenn.tipp = null
      const weg: Array<THREE.Material | undefined> = []
      for (const o of [...wurzel.children]) {
        if (o.userData.bleibt) continue
        o.traverse((x) => {
          const q = x as THREE.Mesh
          q.geometry?.dispose()
          const mats = (Array.isArray(q.material) ? q.material : [q.material]) as Array<(THREE.Material & { map?: THREE.Texture }) | undefined>
          for (const mat of mats) { mat?.map?.dispose(); weg.push(mat) }
        })
        wurzel.remove(o)
      }
      spaeterWeg([...weg, ...wandMaterialien, platteMaterial, ...linienMaterial, ...kurvenMaterial, kastenMaterial, kantenMaterial, mastMaterial])
      welt.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, stufe, zusatz, knoepfe])

  // Gebäude und Bäume, je in einer eigenen Gruppe und mit eigenem Schalter (Michael, 2026-10-22: «separate Schalter»)
  const umweltSetzen = (art: 'gebaeude' | 'baeume') => {
    const k = kern.current
    if (!k || (stufe !== 'ort' && stufe !== 'nah')) return
    const { wurzel } = k
    const { cE, cN } = wurzel.userData.lage as { cE: number; cN: number }
    const r = [...b.teile.values()].map((t) => t.rahmen)
    const e0 = Math.min(...r.map((x) => x.e0)), e1 = Math.max(...r.map((x) => x.e0 + x.b))
    const n0 = Math.min(...r.map((x) => x.n1 - x.h)), n1 = Math.max(...r.map((x) => x.n1))
    const gruppe = new THREE.Group()
    gruppe.name = art
    let weg = false
    void probeLaden(e0, n0, e1, n1).then(async ({ gebaeude: g, baeume: bm }) => {
      if (weg) return
      gruppe.add(...(art === 'gebaeude' ? gebaeudeNetz(g, cE, cN, e0, n0, e1, n1) : baumNetz(bm, b, cE, cN, e0, n0, e1, n1, k.inBrille())))
      if (!gruppe.children.length) return
      // die Programme der Grafik übersetzen, ohne die Seite anzuhalten (wo der Browser es kann), erst dann zeigen
      await k.renderer.compileAsync(gruppe, k.kamera, k.szene).catch(() => {})
      if (!weg) wurzel.add(gruppe)
    })
    return () => {
      weg = true
      const mats: Array<THREE.Material | undefined> = []
      gruppe.traverse((x) => {
        const q = x as THREE.Mesh
        q.geometry?.dispose()
        mats.push(q.material as THREE.Material | undefined)
      })
      spaeterWeg(mats)
      gruppe.removeFromParent()
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => (gebaeude ? umweltSetzen('gebaeude') : undefined), [b, stufe, gebaeude])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => (baeume ? umweltSetzen('baeume') : undefined), [b, stufe, baeume])

  // Schalter an den Wänden, nur in der Brille (Michael, 2026-10-22: «die Steuerelemente an den Wänden der Modelle zu platzieren,
  // so wie Schalter, die man bedienen kann … auf allen vier Seiten»): flach auf jeder Wand im Band unter dem tiefsten Punkt, links
  // der Knöpfe + und − Höhen, Wanderwege, Gebäude und Bäume, rechts die Sonne und, wenn sie an ist, Datum, Uhrzeit und die Knöpfe
  // für die Zeit; sie drehen und wachsen mit dem Modell; als Knöpfe einer Steuerung (Michael, 2026-10-22: «wie richtige … physische
  // Knöpfe … wenn sie an sind … grün leuchten oder gelb, je nach Kategorie, oder rot … eingedrückt … abgeschaltet … mehr aus dem
  // Modell heraus»): aus dunkel und vorstehend, an eingedrückt und leuchtend mit Schein auf der Wand; Grösse und Farben gewählt
  useEffect(() => {
    const k = kern.current
    const w = k?.wurzel.userData.waende as { x0: number; x1: number; z0: number; z1: number; y: number; wand: number; W: number } | undefined
    if (!k || !w) return
    const { W } = w, hoch = w.wand * 0.62, luecke = W * 0.008
    interface Teil { zeilen: string[]; breite: number; an?: boolean; farbe?: string; knopf?: boolean; gesperrt?: boolean; aktion?: () => void }
    const umschalten = (art: Schalter) => () => cb.current.schalten(art)
    // jeder Knopf hat seinen festen Platz (Michael, 2026-10-22: «Die Knöpfe haben eine fixe Position»): was in dieser Stufe nicht
    // geht (Wanderwege in der ganzen Schweiz, Gebäude und Bäume ohne Daten, die Zeit ohne Sonne), bleibt da, aber gesperrt und dunkel
    const umweltDa = (stufe === 'ort' || stufe === 'nah') && umweltHier
    const links: Teil[] = [
      { zeilen: ['Höhen'], breite: 0.085 * W, an: scheiben, farbe: LICHT.gelaende, aktion: umschalten('hoehen') },
      { zeilen: ['Orte'], breite: 0.085 * W, an: orte, farbe: LICHT.gelaende, aktion: umschalten('orte') },
      { zeilen: ['Gipfel'], breite: 0.085 * W, an: gipfel, farbe: LICHT.gelaende, aktion: umschalten('gipfel') },
      { zeilen: ['Wanderwege'], breite: 0.085 * W, an: stufe !== 'schweiz' && wandern, farbe: LICHT.gelaende, gesperrt: stufe === 'schweiz',
        aktion: umschalten('wandern') },
      { zeilen: ['Gebäude'], breite: 0.085 * W, an: umweltDa && gebaeude, farbe: LICHT.umwelt, gesperrt: !umweltDa, aktion: umschalten('gebaeude') },
      { zeilen: ['Bäume'], breite: 0.085 * W, an: umweltDa && baeume, farbe: LICHT.umwelt, gesperrt: !umweltDa, aktion: umschalten('baeume') },
    ]
    const zeitDa = sonnenAn && !!sonnenZeilen
    const [tagZeit] = sonnenZeilen ?? ['–, –'], komma = tagZeit.lastIndexOf(', ')
    const zeit = (art: 'stunde' | 'tag' | 'jetzt', um: number) => () => cb.current.zeitSchieben(art, um)
    const rechts: Teil[] = [
      { zeilen: ['Wind'], breite: 0.065 * W, an: windAn, farbe: LICHT.wind, aktion: umschalten('wind') },
      { zeilen: ['Sonne'], breite: 0.075 * W, an: sonnenAn, farbe: LICHT.sonne, aktion: umschalten('sonne') },
      { zeilen: zeitDa ? [tagZeit.slice(0, komma), tagZeit.slice(komma + 2)] : ['–'], breite: 0.09 * W, gesperrt: !zeitDa },
      { zeilen: ['−1 h'], breite: 0.034 * W, knopf: true, gesperrt: !zeitDa, aktion: zeit('stunde', -1) },
      { zeilen: ['+1 h'], breite: 0.034 * W, knopf: true, gesperrt: !zeitDa, aktion: zeit('stunde', 1) },
      { zeilen: ['−1', 'Tag'], breite: 0.034 * W, knopf: true, gesperrt: !zeitDa, aktion: zeit('tag', -1) },
      { zeilen: ['+1', 'Tag'], breite: 0.034 * W, knopf: true, gesperrt: !zeitDa, aktion: zeit('tag', 1) },
      { zeilen: ['Jetzt'], breite: 0.04 * W, knopf: true, gesperrt: !zeitDa, aktion: zeit('jetzt', 0) },
    ]
    // je Teil ein Bild für die Vorderseite, auf allen vier Wänden dasselbe; an leuchtet es in der Farbe seiner Art, aus ist es dunkel
    const PX = 128
    const bild = (t: Teil, an: boolean) => {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      c.height = PX; c.width = Math.round(PX * t.breite / hoch)
      x.fillStyle = t.gesperrt ? (t.an === undefined && !t.knopf ? '#0c0f12' : '#262626') : t.knopf ? KARMIN : t.an === undefined ? '#10161c' : an ? t.farbe! : '#3a3a3a'
      x.fillRect(0, 0, c.width, c.height)
      if (an && t.an !== undefined) {
        // in der Mitte heller, zum Rand satter: wie ein Licht hinter der Kappe
        const v = x.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, c.width / 2)
        v.addColorStop(0, 'rgba(255,255,255,0.55)'); v.addColorStop(1, 'rgba(255,255,255,0)')
        x.fillStyle = v; x.fillRect(0, 0, c.width, c.height)
      }
      x.fillStyle = t.gesperrt ? '#5c5c5c' : t.knopf ? '#ffffff' : t.an === undefined ? '#d8f5dc' : an ? '#1d1d1d' : '#c8c8c8'
      x.textAlign = 'center'
      const px = t.zeilen.length > 1 ? 34 : 40
      x.font = `bold ${px}px Helvetica, Arial, sans-serif`
      t.zeilen.forEach((z, i) => x.fillText(z, c.width / 2, c.height / 2 - (t.zeilen.length - 1) * px * 0.55 + i * px * 1.1 + px * 0.35, c.width - 16))
      // ein feiner schwarzer Rand um jede Fläche (Michael, 2026-10-22: «eine minime schwarze Umrahmung»)
      x.strokeStyle = '#000000'; x.lineWidth = 5; x.strokeRect(2.5, 2.5, c.width - 5, c.height - 5)
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
      // was leuchtet (eingeschaltet, die Anzeige der Zeit), hängt nicht vom Licht ab; der Rest ist ein Knopf im Licht
      return an || t.an === undefined ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex })
    }
    // ein Schein auf der Wand um einen eingeschalteten Knopf
    const scheinBild = (farbe: string) => {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      c.width = c.height = 128
      const v = x.createRadialGradient(64, 64, 20, 64, 64, 64)
      v.addColorStop(0, farbe); v.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = v; x.fillRect(0, 0, 128, 128)
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
      return new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })
    }
    const seite = new THREE.MeshLambertMaterial({ color: '#2a2a2a' }), fassung = new THREE.MeshLambertMaterial({ color: '#141414' })
    const teile = [...links, ...rechts].map((t) => {
      const an = !!t.an
      // aus steht der Knopf heraus, an ist er eingedrückt; die Anzeige der Zeit liegt flach in der Wand
      const tiefe = t.an === undefined && !t.knopf ? KNOPF_FLACH * W : an ? KNOPF_DRIN * W : KNOPF_DRAUSSEN * W
      const vorne = bild(t, an)
      const seiten = an ? new THREE.MeshBasicMaterial({ color: t.farbe }) : seite
      return {
        t, tiefe, vorne, seiten,
        kappe: new THREE.BoxGeometry(t.breite, hoch, tiefe),
        rahmen: new THREE.PlaneGeometry(t.breite + W * 0.006, hoch + W * 0.006),
        schein: an && t.farbe ? { geo: new THREE.PlaneGeometry(t.breite + W * 0.05, hoch + W * 0.05), stoff: scheinBild(t.farbe) } : null,
      }
    })
    // Lage entlang der Wand: links ab 47 % ihrer Länge nach innen, rechts ab 11 % nach aussen (die Mitte gehört + und −); an
    // einer kürzeren Wand (die ganze Schweiz von Norden nach Süden, angesetzte Stücke) alles so viel kleiner, dass es Platz hat
    const summe = (l: Teil[]) => l.reduce((a, t) => a + t.breite, 0) + luecke * Math.max(0, l.length - 1)
    const lagenAn = (L: number) => {
      const f = Math.min(1, (0.36 * L) / Math.max(summe(links), summe(rechts)))
      const lagen: number[] = []
      let u = -0.47 * L
      for (const t of links) { lagen.push(u + f * t.breite / 2); u += f * (t.breite + luecke) }
      u = 0.11 * L
      for (const t of rechts) { lagen.push(u + f * t.breite / 2); u += f * (t.breite + luecke) }
      return { f, lagen }
    }
    const gruppe = new THREE.Group()
    gruppe.name = 'schalter'
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2
    const waende: Array<[number, number, number, number, number]> = [
      [cx, w.z0, 0, 1, w.x1 - w.x0], [cx, w.z1, 0, -1, w.x1 - w.x0], [w.x1, cz, 1, 0, w.z0 - w.z1], [w.x0, cz, -1, 0, w.z0 - w.z1]]
    for (const [mx, mz, nx, nz, L] of waende) {
      const dreh = Math.atan2(nx, nz), qx = Math.cos(dreh), qz = -Math.sin(dreh), { f, lagen } = lagenAn(L)
      const nach = new THREE.Vector3(nx, 0, nz)
      // ein Teil um so viel vor der Wand (in Einheiten des Modells, schon mit f)
      const setzen = (m: THREE.Mesh, u: number, vor: number) => {
        m.position.set(mx + qx * u + nx * vor, w.y, mz + qz * u + nz * vor)
        m.scale.setScalar(f)
        m.rotation.y = dreh
        m.visible = false
        m.userData.nach = nach
        gruppe.add(m)
      }
      teile.forEach(({ t, tiefe, vorne, seiten, kappe, rahmen, schein }, i) => {
        if (t.an !== undefined || t.knopf) setzen(new THREE.Mesh(rahmen, fassung), lagen[i], W * 0.0006)
        if (schein) setzen(new THREE.Mesh(schein.geo, schein.stoff), lagen[i], W * 0.001)
        const m = new THREE.Mesh(kappe, [seiten, seiten, seiten, seiten, vorne, seiten])
        setzen(m, lagen[i], f * tiefe / 2 + W * 0.0008)
        // jeder Druck klickt: ein Schalter rastet ein oder löst sich, ein Taster für die Zeit federt zurück
        m.userData.aktion = t.aktion && !t.gesperrt && (() => { knopfTon(!!t.knopf || !t.an); t.aktion!() })
        m.userData.text = t.zeilen.join(' ')
      })
    }
    k.wurzel.add(gruppe)
    return () => {
      gruppe.removeFromParent()
      for (const x of teile) {
        x.kappe.dispose(); x.rahmen.dispose(); x.vorne.map?.dispose(); x.vorne.dispose()
        if (x.seiten !== seite) x.seiten.dispose()
        if (x.schein) { x.schein.geo.dispose(); x.schein.stoff.map?.dispose(); x.schein.stoff.dispose() }
      }
      seite.dispose(); fassung.dispose()
    }
  }, [b, stufe, zusatz, knoepfe, scheiben, orte, gipfel, wandern, gebaeude, baeume, umweltHier, sonnenAn, sonnenZeilen, windAn])

  // die Wanderwege: auf das Gelände des Bestands gelegt, zwischen den Punkten so dicht wie sein Raster, damit sie nicht
  // im Hang verschwinden; in einer Gruppe, deren Höhe mit dem Faktor wächst
  useEffect(() => {
    const k = kern.current
    if (!k || !wandern || stufe === 'schweiz') return
    const { wurzel } = k
    const { cE, cN } = wurzel.userData.lage as { cE: number; cN: number }
    const teile = [...b.teile.values()]
    const r = teile.map((t) => t.rahmen)
    const e0 = Math.min(...r.map((x) => x.e0)), e1 = Math.max(...r.map((x) => x.e0 + x.b))
    const n0 = Math.min(...r.map((x) => x.n1 - x.h)), n1 = Math.max(...r.map((x) => x.n1))
    const schritt = Math.min(...teile.map((t) => t.raster.m))
    const weiteKm = (wurzel.userData.weiteKm as number) || 1
    const gruppe = new THREE.Group()
    gruppe.name = 'wanderwege'
    let weg = false
    void wanderwegeLaden(e0, n0, e1, n1).then((d) => {
      if (weg || !d) return
      const je = new Map<number, number[]>()
      const drin = (e: number, n: number) => e >= e0 && e <= e1 && n >= n0 && n <= n1
      const heben = weiteKm * 0.0008
      for (const w of d.wege) {
        const l = je.get(w.art) ?? []
        je.set(w.art, l)
        for (let i = 0; i + 3 < w.p.length; i += 2) {
          const ae = w.p[i], an = w.p[i + 1], be = w.p[i + 2], bn = w.p[i + 3]
          if (!drin(ae, an) || !drin(be, bn)) continue
          const st = Math.max(1, Math.ceil(Math.hypot(be - ae, bn - an) / schritt))
          let pe = ae, pn = an, pz = bestandHoehe(b, ae, an)
          for (let s2 = 1; s2 <= st; s2++) {
            const t = s2 / st, qe = ae + t * (be - ae), qn = an + t * (bn - an), qz = bestandHoehe(b, qe, qn)
            l.push((pe - cE) / 1000, pz / 1000 + heben, -(pn - cN) / 1000, (qe - cE) / 1000, qz / 1000 + heben, -(qn - cN) / 1000)
            pe = qe; pn = qn; pz = qz
          }
        }
      }
      for (const [art, l] of je) {
        if (!l.length) continue
        for (const [farbe, px, folge] of [['#ffffff', WANDER_RAND_PX, 3], [WANDER_FARBEN[art] ?? '#e6a800', WANDER_PX, 4]] as const) {
          const geo = new LineSegmentsGeometry()
          geo.setPositions(l)
          // der Rand schreibt keine Tiefe, sonst verdeckt er die Linie in der Farbe
          const linie = new LineSegments2(geo, new LineMaterial({ color: farbe, linewidth: px, depthWrite: folge === 4 }))
          linie.renderOrder = folge
          gruppe.add(linie)
        }
      }
      if (gruppe.children.length) wurzel.add(gruppe)
    })
    return () => {
      weg = true
      const mats: Array<THREE.Material | undefined> = []
      gruppe.traverse((x) => {
        const q = x as THREE.Mesh
        q.geometry?.dispose()
        mats.push(q.material as THREE.Material | undefined)
      })
      spaeterWeg(mats)
      gruppe.removeFromParent()
    }
  }, [b, stufe, wandern])

  // die Sonne: ohne Zeit die feste wie bisher, mit Zeit ihr gerechneter Stand, darunter der Horizont dunkel
  useEffect(() => {
    const k = kern.current
    if (!k) return
    const { sonne, himmelLicht, wurzel } = k
    const weiteKm = (wurzel.userData.weiteKm as number) || 1, mitteY = (wurzel.userData.sonnenMitte as number) || 0
    const d = new THREE.Vector3(-0.35, 1.3, 0.9).normalize()
    if (!stand) {
      sonne.castShadow = false; sonne.intensity = 1.4; sonne.color.set('#ffffff')
      himmelLicht.intensity = 1.6; himmelLicht.color.set('#ffffff')
    } else {
      // x nach Osten, z nach Süden, y hinauf
      const h = stand.hoehe * Math.PI / 180, a = stand.richtung * Math.PI / 180
      d.set(Math.sin(a) * Math.cos(h), Math.sin(h), -Math.cos(a) * Math.cos(h))
      const tag = Math.max(0, Math.min(1, stand.hoehe / 6))
      sonne.castShadow = stand.hoehe > 0
      sonne.intensity = 2.6 * tag
      // tief am Himmel wärmer; eine Stimmung, kein gemessenes Licht
      sonne.color.set(stand.hoehe < 10 ? '#ffc58a' : '#fff6e8')
      himmelLicht.intensity = 0.35 + 0.55 * Math.min(1, Math.max(0, stand.hoehe + 6) / 36)
      himmelLicht.color.set(stand.hoehe > 0 ? '#ffffff' : '#9fb3d9')
    }
    sonne.position.copy(d.multiplyScalar(weiteKm * 4)).add(new THREE.Vector3(0, mitteY, 0))
    // nur in einer Testfassung: Schatten aus- und einschalten, zum Vergleich
    if (import.meta.env.VITE_S3D_TEST) {
      (window as unknown as { s3dSchatten: unknown }).s3dSchatten = (an: boolean) => {
        sonne.castShadow = an
        k.szene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true })
      }
    }
  }, [stand, b, stufe])

  // Höhenlinien und Orte ein- und ausblenden, mit Geräusch, wenn ein Schalter wechselt (nicht beim ersten Mal)
  const erstesMal = useRef(true)
  useEffect(() => {
    const k = kern.current
    if (!k) return
    const neu = { hoehen: scheiben, orte, gipfel }
    const gewechselt = (Object.keys(neu) as Array<keyof typeof neu>).find((n) => k.verlauf[n].ziel !== +neu[n])
    if (!erstesMal.current && gewechselt) verlaufTon(neu[gewechselt], VERLAUF_TON_S)
    erstesMal.current = false
    for (const n of Object.keys(neu) as Array<keyof typeof neu>) k.verlauf[n].ziel = +neu[n]
  }, [scheiben, orte, gipfel])
  // eine neue Stufe steht in der Brille wieder auf dem Tisch wie am Anfang
  useEffect(() => { kern.current?.anfangSetzen() }, [stufe])
  // immer vier Windhosen im Bild, nach jeder Bewegung neu verteilt, jede mit dem Wind der nächsten Station (Windhose.ts, src/windhosen.ts);
  // in der Brille bleiben sie stehen, 12 % so hoch wie das Modell breit
  const windhosen = useRef<VierWindhosen | null>(null)
  const windOrteRef = useRef(windOrte)
  windOrteRef.current = windOrte
  useEffect(() => {
    const k = kern.current
    const lage = k?.wurzel.userData.lage as { cE: number; cN: number } | undefined
    const W = k?.wurzel.userData.weiteKm as number | undefined
    if (!k || !lage || !W || !windAn) return
    const teile = [...b.teile.values()]
    const drin = (e: number, n: number) => teile.some((t) => imRaster(t.raster, e, n))
    const vier = vierWindhosenBauen(k.wurzel, k.kamera, (x, z) => {
      const e = lage.cE + x * 1000, n = lage.cN - z * 1000
      return drin(e, n) ? bestandHoehe(b, e, n) / 1000 : null
    }, k.inBrille, (stellen) => windOrteRef.current(stellen.map((p) => ({ e: lage.cE + p.x * 1000, n: lage.cN - p.z * 1000 }))), W * 0.12, kastenUm(b, lage))
    windhosen.current = vier
    k.jeBild.push(vier.schritt)
    return () => {
      vier.entsorgen(); windhosen.current = null
      const i = k.jeBild.indexOf(vier.schritt); if (i >= 0) k.jeBild.splice(i, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windAn, b, stufe, zusatz, knoepfe])
  useEffect(() => { windhosen.current?.setzen(windWerte) },
    [windWerte.map((w) => `${w.wind?.kmh}/${w.wind?.richtung}/${w.name}`).join(), windAn, b, stufe, zusatz, knoepfe]) // eslint-disable-line react-hooks/exhaustive-deps
  // Regen und Schnee über dem ganzen Modell, vom tiefsten Punkt bis ein Viertel der Breite über den höchsten (Niederschlag.ts)
  const regen = useRef<Niederschlag | null>(null)
  useEffect(() => {
    const k = kern.current
    const lage = k?.wurzel.userData.lage as { cE: number; cN: number } | undefined
    const W = k?.wurzel.userData.weiteKm as number | undefined
    if (!k || !lage || !W || !windAn) return
    let tief = Infinity, hoch = -Infinity
    for (const t of b.teile.values()) for (const z of t.h) if (z !== KEINE_HOEHE) { if (z < tief) tief = z; if (z > hoch) hoch = z }
    if (tief === Infinity) return
    const rand = [...b.teile.values()].map((t) => t.rahmen)
    const e0 = Math.min(...rand.map((x) => x.e0)), e1 = Math.max(...rand.map((x) => x.e0 + x.b))
    const n0 = Math.min(...rand.map((x) => x.n1 - x.h)), n1 = Math.max(...rand.map((x) => x.n1))
    const unten = tief / 1000, oben = hoch / 1000 + W * 0.25
    const ns = niederschlagBauen()
    ns.gruppe.position.set(((e0 + e1) / 2 - lage.cE) / 1000, (unten + oben) / 2, -((n0 + n1) / 2 - lage.cN) / 1000)
    ns.gruppe.scale.set((e1 - e0) / 1000, oben - unten, (n1 - n0) / 1000)
    ns.gruppe.userData.bleibt = true
    k.wurzel.add(ns.gruppe)
    regen.current = ns
    let alt = performance.now()
    const schritt = () => { const t = performance.now(); ns.schritt(Math.min(0.1, (t - alt) / 1000)); alt = t }
    k.jeBild.push(schritt)
    return () => {
      k.wurzel.remove(ns.gruppe); ns.entsorgen(); regen.current = null
      const i = k.jeBild.indexOf(schritt); if (i >= 0) k.jeBild.splice(i, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windAn, b, stufe, zusatz, knoepfe])
  useEffect(() => { regen.current?.setzen(nieder?.art ?? null, nieder?.staerke ?? 0) }, [nieder?.art, nieder?.staerke, windAn, b, stufe, zusatz, knoepfe])
  // der eigene Standort als karminroter Punkt mit weissem Rand auf dem Gelände, durch Berge hindurch sichtbar; nur wo er im Modell
  // liegt (nach dem Bau des Modells, darum hier und mit dessen Abhängigkeiten)
  useEffect(() => {
    const k = kern.current
    if (!k || !standort) return
    const { e, n } = standort
    if (![...b.teile.values()].some((t) => imRaster(t.raster, e, n))) return
    const z = bestandHoehe(b, e, n)
    const lage = k.wurzel.userData.lage as { cE: number; cN: number } | undefined
    if (!lage || !Number.isFinite(z)) return
    const c = document.createElement('canvas'); c.width = c.height = 64
    const x = c.getContext('2d')!
    x.fillStyle = 'rgba(168,16,46,0.25)'; x.beginPath(); x.arc(32, 32, 31, 0, Math.PI * 2); x.fill()
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(32, 32, 17, 0, Math.PI * 2); x.fill()
    x.fillStyle = '#a8102e'; x.beginPath(); x.arc(32, 32, 12, 0, Math.PI * 2); x.fill()
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false }))
    // in der Brille in Metern wie die Schilder (sprites() in der Szene)
    sp.userData = { b: 0.05, h: 0.05, verhaeltnis: 1, brilleM: 0.02 }
    sp.scale.set(0.05, 0.05, 1)
    sp.position.set((e - lage.cE) / 1000, z / 1000, -(n - lage.cN) / 1000)
    sp.renderOrder = 6
    const gruppe = new THREE.Group()
    gruppe.name = 'standort'
    gruppe.userData.bleibt = true
    gruppe.add(sp)
    k.wurzel.add(gruppe)
    if (k.inBrille()) k.jeBild[0]()
    return () => { k.wurzel.remove(gruppe); t.dispose(); sp.material.dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standort, b, stufe, zusatz, knoepfe])
  useEffect(() => {
    welt.current?.setzeWahl(wahl)
    const k = kern.current
    if (k?.inBrille()) {
      k.tafelSetzen(meldung ? [meldung.split(': ')[0], ...(meldung.split(': ')[1] ? [meldung.split(': ').slice(1).join(': ')] : [])]
        : info && wahl ? [...info, 'Nochmals Abzug: eintauchen'] : stufe === 'nah' ? ['Greiftaste: zurück'] : null)
    }
  }, [wahl, info, stufe, b, meldung])
  return (
    <div ref={huelle} className="absolute inset-0 touch-none">
      {grafikWeg && (
        <p role="status" className="absolute inset-x-2 top-12 z-10 rounded-lg bg-white/95 p-2 text-xs font-medium dark:bg-sbb-midnight/95">
          Die Grafik des Geräts hat aufgegeben, wohl weil ihr der Speicher ausging. Lade die Seite neu und wähle ein kleineres Modell.
        </p>
      )}
    </div>
  )
}

/** die Gebäude im Rechteck als Netze (je Kachel eines), in Kilometern um die Mitte, Höhe ungestreckt; nur die Dreiecke mit ihrer
 *  Mitte im Rechteck: eine Kachel von 500 m reicht oft über den Rand des Modells (Michael, 2026-10-21: «stimmen die
 *  Gebäudeeinblendungen nicht mit den Kacheln überein», sie standen neben dem Sockel in der Luft) */
function gebaeudeNetz(kacheln: GebaeudeKachel[], cE: number, cN: number, e0: number, n0: number, e1: number, n1: number) {
  const material = gebaeudeMaterial()
  return kacheln.filter((g) => g.e0 < e1 && g.e0 + 500 > e0 && g.n0 < n1 && g.n0 + 500 > n0).flatMap((g) => {
    const n = g.ecken.length / 3
    const pos: number[] = [], farbe: number[] = []
    for (let d = 0; d + 2 < n; d += 3) {
      let me = 0, mn = 0
      for (let q = d; q < d + 3; q++) { me += g.ecken[q * 3] / 30; mn += g.ecken[q * 3 + 2] / 30 }
      me += g.e0; mn += g.n0
      if (me < e0 || me > e1 || mn < n0 || mn > n1) continue
      for (let q = d; q < d + 3; q++) {
        pos.push((g.e0 + g.ecken[q * 3] / 10 - cE) / 1000, (g.h0 + g.ecken[q * 3 + 1]) / 10 / 1000, -(g.n0 + g.ecken[q * 3 + 2] / 10 - cN) / 1000)
        farbe.push(LINEAR[g.farben[q * 3]], LINEAR[g.farben[q * 3 + 1]], LINEAR[g.farben[q * 3 + 2]])
      }
    }
    if (!pos.length) return []
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(farbe, 3))
    geo.computeVertexNormals()
    gebaeudeFlaechen(geo, 1000)
    const m = new THREE.Mesh(geo, material)
    m.castShadow = m.receiveShadow = true
    return [m]
  })
}

/** der Kasten um das Gelände eines Bestands im Raum des Modells (km, y oben, Norden nach −z) */
function kastenUm(b: Bestand, lage: { cE: number; cN: number }) {
  let tief = Infinity, hoch = -Infinity
  for (const t of b.teile.values()) for (const z of t.h) if (z !== KEINE_HOEHE) { if (z < tief) tief = z; if (z > hoch) hoch = z }
  const rand = [...b.teile.values()].map((t) => t.rahmen)
  const e0 = Math.min(...rand.map((x) => x.e0)), e1 = Math.max(...rand.map((x) => x.e0 + x.b))
  const n0 = Math.min(...rand.map((x) => x.n1 - x.h)), n1 = Math.max(...rand.map((x) => x.n1))
  if (tief === Infinity) return undefined
  return new THREE.Box3(new THREE.Vector3((e0 - lage.cE) / 1000, tief / 1000 - 0.01, -(n1 - lage.cN) / 1000),
    new THREE.Vector3((e1 - lage.cE) / 1000, hoch / 1000 + 0.01, -(n0 - lage.cN) / 1000))
}

/** die Bäume im Rechteck als ein InstancedMesh, der Fuss auf dem Gelände des Bestands */
/** höchstens so viele gezeichnete Waldbäume in einem Modell, auf dem Handy weniger; eine Annahme zur Grafik, nicht gemessen */
/** in der Brille noch weniger: sie zeichnet jedes Bild zweimal, je Auge, dazu den Schatten, auf der Grafik eines Handys
 *  (Michael, 2026-10-22: nach dem Eintauchen ins Feld von 4 km stand die Brille; 121'193 Bäume am Gantrisch, je 20 Dreiecke);
 *  ebenso eine Annahme, nicht auf der Brille gemessen */
const BAUM_HOECHSTENS = 1_200_000, BAUM_HOECHSTENS_HANDY = 300_000, BAUM_HOECHSTENS_BRILLE = 50_000
const baumHoechstens = (brille: boolean) => (brille ? BAUM_HOECHSTENS_BRILLE : hoechstens() === 4 ? BAUM_HOECHSTENS_HANDY : BAUM_HOECHSTENS)
function baumNetz(kacheln: BaumKachel[], b: Bestand, cE: number, cN: number, e0: number, n0: number, e1: number, n1: number, brille = false) {
  const liste: Array<[number, number, number, number, number, number]> = []
  // zu viele Bäume für die Grafik: der gezeichnete Wald wird lichter, Einzelbäume bleiben alle (BAUM_HOECHSTENS)
  let wald = 0
  for (const k of kacheln) for (let i = 0; i < k.art.length; i++) if (k.art[i] > 0) wald++
  const grenze = baumHoechstens(brille), jeder = Math.max(1, Math.ceil(wald / grenze))
  let w = 0
  for (const k of kacheln) {
    for (let i = 0; i < k.art.length; i++) {
      if (k.art[i] > 0 && w++ % jeder) continue
      const e = k.e0 + k.lage[i * 2] / 10, n = k.n0 + k.lage[i * 2 + 1] / 10
      if (e < e0 || e > e1 || n < n0 || n > n1) continue
      liste.push([e, n, k.art[i], k.farben[i * 3], k.farben[i * 3 + 1], k.farben[i * 3 + 2]])
    }
  }
  if (!liste.length) return []
  // Laubbaum mit runder Krone, Nadelbaum als schlanker Kegel, nach der Höhe über Meer (istNadel in src/baumart.ts, eine Annahme)
  const krone = new THREE.IcosahedronGeometry(0.5, 0)
  krone.scale(1, 0.85, 1); krone.translate(0, 0.5, 0)
  const kegel = new THREE.ConeGeometry(0.5, 1, 7, 1)
  kegel.translate(0, 0.5, 0)
  const stoff = new THREE.MeshLambertMaterial()
  const hoehen = liste.map(([e, n]) => bestandHoehe(b, e, n))
  const nadel = liste.map(([e, n], i) => istNadel(e, n, hoehen[i]))
  const anzahlNadel = nadel.filter(Boolean).length
  const netze = [new THREE.InstancedMesh(krone, stoff, liste.length - anzahlNadel), new THREE.InstancedMesh(kegel, stoff, anzahlNadel)]
  const zahl = [0, 0]
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), c = new THREE.Color()
  const oben = new THREE.Vector3(0, 1, 0)
  liste.forEach(([e, n, art, r, g, bl], i) => {
    const [hoehe, radiusArt] = BAUM_FORM[art] ?? BAUM_FORM[0]
    const j = nadel[i] ? 1 : 0, netz = netze[j], radius = radiusArt * (nadel[i] ? NADEL_BREITE : 1)
    // je Baum bis 25 % grösser oder kleiner, immer gleich
    const z = Math.sin(e * 12.9898 + n * 78.233) * 43758.5453, f = 0.75 + 0.5 * (z - Math.floor(z))
    v.set((e - cE) / 1000, (hoehen[i] - 0.5) / 1000, -(n - cN) / 1000)
    s.set((2 * radius * f) / 1000, (hoehe * f) / 1000, (2 * radius * f) / 1000)
    q.setFromAxisAngle(oben, f * 20)
    netz.setMatrixAt(zahl[j], m.compose(v, q, s))
    netz.setColorAt(zahl[j], c.setRGB(LINEAR[r], LINEAR[g], LINEAR[bl]))
    zahl[j]++
  })
  for (const netz of netze) {
    netz.instanceMatrix.needsUpdate = true
    if (netz.instanceColor) netz.instanceColor.needsUpdate = true
    netz.computeBoundingSphere()
    netz.castShadow = true
  }
  return netze.filter((x) => x.count > 0)
}
