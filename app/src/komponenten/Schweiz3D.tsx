import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { holen, holenBinaer, kartengrundLaden, seenLaden, sehenswertLaden, szeneLaden } from '../daten'
import { ausschnittLaden, type BaumKachel, feinHoehe, feinLaden, type GebaeudeKachel, gelaendeIndex, KEINE_HOEHE, luftbildLaden, nahbildLaden, type Raster, ohneLeeres, probeDa, probeLaden, SCHARF_KACHEL_M, scharfBild, scharfHoehe, scharfLaden, schweiz3dLaden } from '../gelaende'
import { lv95, useBrilleMoeglich } from '../relief'
import { imGebiet, type Pool, schweiz11Laden } from '../schweiz11'
import type { SeenDaten, SehenswertDaten } from '../typen'
import { Ladebalken } from './Ladebalken'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'

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
/** in der Übersicht ist die Höhe überhöht, sonst wären die Alpen auf 350 km kaum zu sehen */
const UEBERHOEHT = 3
const KARMIN = '#a8102e'

interface Uebersicht { ost: number; nord: number; m: number; breite: number; hoehe: number; quelle_gelaende: string; quelle_luftbild: string }
/** rahmen: welches Rechteck das Bild zeigt (Ost und Nord der Ecke links oben, Breite und Höhe in Metern) */
interface Gelaende { raster: Raster; h: Float32Array; bild: HTMLCanvasElement; rahmen: { e0: number; n1: number; b: number; h: number }; quellen: string[]; hinweis?: string }
interface Feld { e: number; n: number; seite: number }
type Seite = 'n' | 'o' | 's' | 'w'
/** Ein Feld und was an seinen Seiten angesetzt ist (Michael, 2026-10-20: «An den Wänden ein Plus und oder ein Minus … zum
 *  Erweitern resp. reduzieren der Kacheln»): je Stück ein Gelände, Schlüssel «di_dj» in Feldern Ost und Nord vom Anker */
interface Bestand { anker: Feld; teile: Map<string, Gelaende>; di: [number, number]; dj: [number, number] }
/** so viele Stücke je Richtung und im Ganzen; jedes hat sein eigenes Bild von bis zu 4096 × 4096 Bildpunkten, das die
 *  Grafik des Geräts halten muss (etwa 85 MB). Die Grenze ist eine Annahme, nicht gemessen: auf dem Handy 4, sonst 9 */
const JE_RICHTUNG = 3
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
interface Zusatz { sw: SehenswertDaten; seen: SeenDaten; orte: Array<{ name: string; klasse: number; lage: [number, number] }>; pool: Pool }

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
  // das Bild: das Luftbild der Region darunter, das Nahbild darüber
  const c = document.createElement('canvas')
  c.width = c.height = 4096
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
  const c = document.createElement('canvas')
  c.width = c.height = 4096
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

export default function Schweiz3D() {
  useEffect(() => szeneLaden(), [])
  const [stufe, setStufe] = useState<Stufe>('schweiz')
  const [gelaende, setGelaende] = useState<Record<Stufe, Bestand | null>>({ schweiz: null, region: null, ort: null, nah: null })
  const [wahl, setWahl] = useState<Feld | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [zusatz, setZusatz] = useState<Zusatz | null>(null)
  const [faktor, setFaktor] = useState<1 | 2>(1)
  const [scheiben, setScheiben] = useState(true)
  const [umwelt, setUmwelt] = useState(true)
  const [umweltHier, setUmweltHier] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  useEffect(() => {
    uebersichtLaden().then((g) => setGelaende((a) => ({ ...a, schweiz: einzeln({ e: 0, n: 0, seite: 0 }, g) }))).catch((e: Error) => setFehler(e.message))
    Promise.all([sehenswertLaden(), seenLaden(), kartengrundLaden(), schweiz11Laden()])
      .then(([sw, seen, k, pool]) => setZusatz({ sw, seen, orte: k.orte as Zusatz['orte'], pool })).catch(() => {})
  }, [])
  useEffect(() => {
    if (!meldung) return
    const t = setTimeout(() => setMeldung(null), 7000)
    return () => clearTimeout(t)
  }, [meldung])
  const inhalt = useMemo(() => (wahl ? feldInhalt(wahl, zusatz) : null), [wahl, zusatz])
  const aktuell = gelaende[stufe]
  const anker = aktuell?.teile.get('0_0') ?? null
  // Gebäude und Bäume gibt es vorerst nur in zwei Probeausschnitten
  useEffect(() => {
    setUmweltHier(false)
    if (!aktuell || (stufe !== 'ort' && stufe !== 'nah')) return
    const r = [...aktuell.teile.values()].map((t) => t.rahmen)
    let weg = false
    void probeDa(Math.min(...r.map((x) => x.e0)), Math.min(...r.map((x) => x.n1 - x.h)), Math.max(...r.map((x) => x.e0 + x.b)), Math.max(...r.map((x) => x.n1)))
      .then((da) => { if (!weg) setUmweltHier(da) })
    return () => { weg = true }
  }, [aktuell, stufe])
  const brille = useRef<(() => Promise<void>) | null>(null)
  const xr = useBrilleMoeglich()
  const [brilleHinweis, setBrilleHinweis] = useState<string | null>(null)
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
      setWahl(null)
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
    // ein Feld um einen zufälligen Gipfel: dort gibt es etwas zu sehen
    const gipfel = zusatz.sw.gipfel.filter((x) => x.hoehe_m !== null && imGebiet(zusatz.pool, 'CH', x.lage[0], x.lage[1]))
    const x = gipfel[Math.floor(Math.random() * gipfel.length)]
    const [e, n] = lv95(x.lage[0], x.lage[1])
    setWahl({ e: Math.round(e / RASTER_M.schweiz) * RASTER_M.schweiz, n: Math.round(n / RASTER_M.schweiz) * RASTER_M.schweiz, seite: FELD_M.schweiz })
  }
  // nur in einer Testfassung (VITE_S3D_TEST): ein Feld von aussen wählen
  useEffect(() => {
    if (!import.meta.env.VITE_S3D_TEST) return
    ;(window as unknown as { s3d: unknown }).s3d = { waehle: (e: number, n: number, seite: number) => setWahl({ e, n, seite }) }
  }, [])
  const zurueck = (s: Stufe) => { setWahl(null); setStufe(s) }
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
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">3D Schweiz</h1>
      <p className="mt-2 leading-relaxed">
        Die ganze Schweiz als Modell. Tippe auf ein Feld, schau, was darin liegt, und tauche ein: erst in eine Region von 20 km,
        dort in ein Feld von 4 km und zuletzt in ein Stück von 1 km. Mit + und − an den Wänden setzt du an einer Seite ein Stück
        an oder nimmst eines weg.
      </p>
      <nav aria-label="Stufe" className="mt-3 flex flex-wrap items-center gap-1 text-sm">
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
      {fehler && <Ladefehler className="mt-3" was="Das Gelände konnte nicht geladen werden." fehler={fehler} />}
      <div className="relative mt-2 h-[68vh] min-h-[360px] overflow-hidden rounded-lg bg-[#cfe3f5] dark:bg-[#0d1b2a]">
        {aktuell ? (
          <Ansicht b={aktuell} stufe={stufe} faktor={stufe === 'schweiz' ? UEBERHOEHT : faktor} wahl={wahl}
                   waehlen={stufe === 'nah' ? undefined : (e, n) => {
                     const r = RASTER_M[stufe], s = FELD_M[stufe]
                     const w = { e: Math.round(e / r) * r, n: Math.round(n / r) * r, seite: s }
                     // nur in einer Testfassung (VITE_S3D_TEST): das gewählte Feld in die Konsole
                     if (import.meta.env.VITE_S3D_TEST) console.log('feld', JSON.stringify(w))
                     setWahl(w)
                   }} eintauchen={() => void eintauchen()} zurueck={eineZurueck} info={info} brilleRef={brille} zusatz={zusatz}
                   knoepfe={knoepfe} erweitern={(s, p) => void erweitern(s, p)} scheiben={scheiben}
                   umwelt={umwelt && umweltHier} meldung={meldung} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-sbb-metal">Die Schweiz wird geladen …</div>
        )}
        <Ladebalken inKarte />
        <button type="button" onClick={inBrille}
                className="absolute right-2 top-2 rounded-lg bg-sbb-red px-2.5 py-1 text-xs font-bold text-white">
          Mit VR-Brille
        </button>
        {brilleHinweis && (
          <p role="status" className="absolute inset-x-2 top-12 rounded-lg bg-white/95 p-2 text-xs font-medium dark:bg-sbb-midnight/95">{brilleHinweis}</p>
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {stufe !== 'schweiz' && (
            <div className="flex overflow-hidden rounded-lg border border-sbb-cloud bg-white/90 text-xs font-bold dark:border-sbb-iron dark:bg-sbb-midnight/90">
              {([1, 2] as const).map((f) => (
                <button key={f} type="button" aria-pressed={faktor === f} onClick={() => setFaktor(f)}
                        className={`px-2.5 py-1 ${faktor === f ? 'bg-sbb-anthracite text-white' : ''}`}>{f === 1 ? 'Höhe wie echt' : 'Höhe 2-fach'}</button>
              ))}
            </div>
          )}
          {stufe === 'schweiz' && (
            <button type="button" onClick={zufall} className="rounded-lg border border-sbb-cloud bg-white/90 px-2.5 py-1 text-xs font-bold dark:border-sbb-iron dark:bg-sbb-midnight/90">
              Überrasch mich
            </button>
          )}
          <button type="button" aria-pressed={scheiben} onClick={() => setScheiben((x) => !x)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${scheiben ? 'border-sbb-anthracite bg-sbb-anthracite text-white' : 'border-sbb-cloud bg-white/90 dark:border-sbb-iron dark:bg-sbb-midnight/90'}`}>
            Höhen 1'000 m
          </button>
          {umweltHier && (
            <button type="button" aria-pressed={umwelt} onClick={() => setUmwelt((x) => !x)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${umwelt ? 'border-sbb-anthracite bg-sbb-anthracite text-white' : 'border-sbb-cloud bg-white/90 dark:border-sbb-iron dark:bg-sbb-midnight/90'}`}>
              Gebäude und Bäume
            </button>
          )}
        </div>
        {meldung && (
          <button type="button" onClick={() => setMeldung(null)} role="status"
                  className="absolute inset-x-2 top-12 rounded-lg bg-white/95 p-3 text-left text-sm font-medium shadow-lg dark:bg-sbb-charcoal/95 md:left-auto md:w-96">
            {meldung}
          </button>
        )}
        {wahl && stufe !== 'nah' && (
          <div className="absolute inset-x-2 bottom-2 rounded-lg bg-white/95 p-3 shadow-lg dark:bg-sbb-charcoal/95 md:left-auto md:w-80">
            <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
              Feld {(wahl.seite / 1000).toLocaleString('de-CH')} × {(wahl.seite / 1000).toLocaleString('de-CH')} km{inhalt?.kanton ? ` · Mitte im Kanton ${inhalt.kanton}` : ''}
            </p>
            {inhalt?.orte.length ? <p className="mt-0.5 text-lg font-bold leading-tight">{inhalt.orte.join(', ')}</p>
              : <p className="mt-0.5 text-lg font-bold leading-tight">{inhalt?.gipfel?.name ?? 'Ohne Ort der Landeskarte'}</p>}
            {inhalt?.gipfel && <p className="text-sm">▲ {inhalt.gipfel.name} {inhalt.gipfel.hoehe_m!.toLocaleString('de-CH')} m</p>}
            {inhalt?.seen.length ? <p className="text-sm">≈ {inhalt.seen.join(', ')}</p> : null}
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void eintauchen()} disabled={laedt}
                      className="min-h-11 flex-1 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 disabled:opacity-50">
                {laedt ? 'Wird geladen …' : 'Eintauchen'}
              </button>
              <button type="button" onClick={() => setWahl(null)} className="min-h-11 rounded-lg border border-sbb-cloud px-3 text-sm font-medium dark:border-sbb-iron">
                Andere Wahl
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        {stufe === 'schweiz' ? `Höhe ${UEBERHOEHT}-fach überhöht. ` : faktor === 2 ? 'Höhe 2-fach überhöht. ' : ''}
        Ziehen dreht, zwei Finger oder das Mausrad zoomen.{stufe !== 'nah' && ' Ein Tipp wählt ein Feld.'}
        {stufe !== 'schweiz' && ' + und − an einer Wand setzen dort ein Stück an oder nehmen eines weg.'}
        {hinweis && <> <strong>{hinweis}</strong></>}
      </p>
      {scheiben && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-sbb-metal dark:text-sbb-storm" aria-label="Höhenscheiben">
          {HOEHEN_STUFEN.map(([z, farbe, name]) => (
            <span key={z} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: farbe }} />{z.toLocaleString('de-CH')} m ({name})
            </span>
          ))}
        </p>
      )}
      {anker && (
        <details className="klapp mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
          <summary className="flex min-h-9 cursor-pointer items-center underline underline-offset-2">Modell, nicht massstäblich: Quellen</summary>
          <p className="mt-1">Gelände: {anker.quellen[0]}. Luftbild: {anker.quellen[1]}. Orte der Landeskarte 1:1 Million (swisstopo),
            Gipfel (swisstopo), Seen aus swissTLMRegio (swisstopo), Kantone (BFS). Ein Feld ist ein Quadrat, keine Region und kein Tal:
            deren Grenzen stehen in keiner unserer Quellen. Die Scheiben liegen auf 1'000, 2'000, 3'000 und 4'000 m über Meer, wo das
            Gelände so hoch reicht; ihre Farben sind gewählt.{umweltHier && <> Gebäude: swissBUILDINGS3D 3.0 (swisstopo), Dächer in der
            Farbe des Luftbilds, Wände grau (in keiner Quelle). Bäume: swissTLM3D (swisstopo), Einzelbäume wie in der Quelle, Wald mit
            gezeichneten Bäumen gefüllt; Abstand, Höhe und Form in keiner Quelle. Vorerst nur um Köniz und um den Gantrisch.</>}</p>
        </details>
      )}
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
/** Schrift in der Brille, Höhe eines Schilds in Metern */
const BRILLE_SCHRIFT_M = 0.022

/** Scheiben auf ganzen Tausend Metern (Michael, 2026-10-20: «recht transparenten Scheiben alle 1000m … 1000m Rot, 2000m Gelb,
 *  3000m Grün, 4000m Blau»), auch als Linie in den Wänden; die Farben sind gewählt, nicht aus einer Quelle */
const HOEHEN_STUFEN: Array<[number, string, string]> = [[1000, '#e0242b', 'rot'], [2000, '#f2c200', 'gelb'], [3000, '#2b9e4a', 'grün'], [4000, '#2a6fdb', 'blau']]
const SCHEIBE_DECKKRAFT = 0.24
/** die Linien der Höhen in Bildpunkten, beim Zoomen gleich breit (Michael, 2026-10-21: «wenn ich hereinzoome werden die Linien
 *  nicht dicker») */
const HOEHEN_LINIE_PX = 1.6
/** Knöpfe an den Wänden: auf dem Bildschirm als Anteil der Bildhöhe, in der Brille in Metern */
const KNOPF_BILD = 0.06, KNOPF_BRILLE_M = 0.045
/** Höhe und Kronenradius je Art (Einzelbaum, Wald, Wald offen, Gebüschwald, Gehölzfläche), wie im Führerstand (BAUM_FORM in
 *  Relief.tsx): in keiner Quelle */
const BAUM_FORM: Array<[number, number]> = [[12, 3.5], [20, 3.2], [15, 4], [4, 2.2], [9, 3]]

interface Welt {
  setzeWahl: (f: Feld | null) => void
  faktor: (f: number) => void
  scheiben: (an: boolean) => void
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
 * auf dem Tisch; der Abzug wählt mit dem Strahl ein Feld oder drückt einen Knopf an der Wand, ein zweiter Abzug auf das Feld
 * taucht ein, die Greiftaste geht eine Stufe zurück, der Thumbstick dreht und vergrössert.
 */
function Ansicht({ b, stufe, faktor, wahl, waehlen, eintauchen, zurueck, info, brilleRef, zusatz, knoepfe, erweitern, scheiben, umwelt, meldung }: {
  b: Bestand; stufe: Stufe; faktor: number; wahl: Feld | null; waehlen?: (e: number, n: number) => void
  eintauchen: () => void; zurueck: () => void
  /** was in der Brille über dem gewählten Feld steht */
  info: string[] | null
  brilleRef: React.MutableRefObject<(() => Promise<void>) | null>
  zusatz: Zusatz | null
  knoepfe: Knoepfe | null; erweitern: (s: Seite, plus: boolean) => void
  scheiben: boolean; umwelt: boolean; meldung: string | null
}) {
  const huelle = useRef<HTMLDivElement>(null)
  const welt = useRef<Welt | null>(null)
  const kern = useRef<{
    renderer: THREE.WebGLRenderer; szene: THREE.Scene; kamera: THREE.PerspectiveCamera; steuerung: OrbitControls
    wurzel: THREE.Group; inBrille: () => boolean; setzeHimmel: () => void
    jeBild: Array<() => void>; wenn: { tipp: ((p: THREE.Vector3) => void) | null; zurueck: () => void }
    tafel: THREE.Sprite; tafelSetzen: (zeilen: string[] | null, ueber?: THREE.Vector3) => void
  } | null>(null)
  const cb = useRef({ waehlen, eintauchen, zurueck, erweitern })
  cb.current = { waehlen, eintauchen, zurueck, erweitern }
  const faktorJetzt = useRef(faktor)
  faktorJetzt.current = faktor
  const scheibenJetzt = useRef(scheiben)
  scheibenJetzt.current = scheiben

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
    szene.add(new THREE.HemisphereLight('#ffffff', '#8a8070', 1.6))
    const sonne = new THREE.DirectionalLight('#ffffff', 1.4)
    // die Sonne steht hoch im Süden, leicht nach Westen (Michael, 2026-10-19: «von Süden her ganz leicht mehr beleuchten … ungefähr
    // der realen Sonneneinstrahlung»); x zeigt nach Osten, z nach Süden; ein Sonnenstand, keine Uhrzeit
    sonne.position.set(-0.35, 1.3, 0.9)
    szene.add(sonne)
    const wurzel = new THREE.Group()
    szene.add(wurzel)

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

    // ein Strahl trifft zuerst die Knöpfe an den Wänden, dann das Gelände
    const strahl = new THREE.Raycaster()
    strahl.camera = kamera
    const treffen = () => {
      const k = wurzel.getObjectByName('knoepfe')
      const knopf = k ? strahl.intersectObjects(k.children.filter((o) => o.visible), false)[0] : undefined
      if (knopf) { (knopf.object.userData.aktion as () => void)(); return }
      const boeden = wurzel.getObjectByName('boeden')
      const t = boeden ? strahl.intersectObjects(boeden.children, false)[0] : undefined
      if (t) wenn.tipp?.(wurzel.worldToLocal(t.point.clone()))
    }
    // Brille: Strahlen der Controller, Abzug wählt, Greiftaste zurück, Thumbstick dreht und vergrössert
    const wenn: { tipp: ((p: THREE.Vector3) => void) | null; zurueck: () => void } = { tipp: null, zurueck: () => cb.current.zurueck() }
    const controller = [0, 1].map((i) => {
      const c = renderer.xr.getController(i)
      const linie = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: KARMIN }))
      linie.scale.z = 3
      c.add(linie)
      c.addEventListener('select', () => {
        const m = new THREE.Matrix4().extractRotation(c.matrixWorld)
        strahl.ray.origin.setFromMatrixPosition(c.matrixWorld)
        strahl.ray.direction.set(0, 0, -1).applyMatrix4(m)
        treffen()
      })
      c.addEventListener('squeeze', () => wenn.zurueck())
      szene.add(c)
      return c
    })
    let drehung = 0, zoom = 1
    // Schilder und Knöpfe: auf dem Bildschirm in fester Grösse, in der Brille in Metern
    const sprites = () => ['schilder', 'knoepfe'].flatMap((n) => (wurzel.getObjectByName(n)?.children ?? []) as THREE.Sprite[])
    const brilleSetzen = () => {
      const breite = (wurzel.userData.weiteKm as number) || 1
      const s = (BRILLE_BREITE_M / breite) * zoom
      wurzel.scale.setScalar(s)
      wurzel.rotation.y = drehung
      wurzel.position.set(0, BRILLE_TISCH_M - ((wurzel.userData.untenY as (() => number) | undefined)?.() ?? 0) * s, -BRILLE_ABSTAND_M)
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
    renderer.xr.addEventListener('sessionend', () => { bildschirmSetzen(); setzeHimmel(); kamera.near = 0.01; kamera.updateProjectionMatrix() })
    brilleRef.current = async () => {
      const xr = navigator.xr
      if (!xr) throw new Error('Kein WebXR')
      durchsicht = await xr.isSessionSupported('immersive-ar').catch(() => false)
      const sitzung = await xr.requestSession(durchsicht ? 'immersive-ar' : 'immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] })
      renderer.xr.setReferenceSpaceType('local-floor')
      kamera.near = 0.01; kamera.updateProjectionMatrix()
      await renderer.xr.setSession(sitzung)
      drehung = 0; zoom = 1
      brilleSetzen(); setzeHimmel()
      tafelSetzen(['3D Schweiz', 'Abzug: Feld wählen, nochmals: eintauchen', 'Abzug auf + oder − an einer Wand: erweitern',
                   'Greiftaste: eine Stufe zurück', 'Thumbstick: drehen und vergrössern'])
    }
    const jeBild: Array<() => void> = [() => {
      if (!renderer.xr.isPresenting) return
      const sitzung = renderer.xr.getSession()
      for (const q of sitzung?.inputSources ?? []) {
        const a = q.gamepad?.axes
        if (!a || a.length < 4) continue
        if (Math.abs(a[2]) > 0.2) drehung -= a[2] * 0.03
        if (Math.abs(a[3]) > 0.2) zoom = Math.max(0.5, Math.min(6, zoom * (1 - a[3] * 0.02)))
      }
      brilleSetzen()
    }]
    kern.current = { renderer, szene, kamera, steuerung, wurzel, inBrille: () => renderer.xr.isPresenting, setzeHimmel, jeBild, wenn, tafel, tafelSetzen }

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
      const kn = wurzel.getObjectByName('knoepfe')
      if (!kn) return
      const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : kamera
      wurzel.worldToLocal(auge.setFromMatrixPosition(cam.matrixWorld))
      for (const o of kn.children) o.visible = auge.clone().sub(o.position).dot(o.userData.nach as THREE.Vector3) > 0
    }
    const aufloesung = new THREE.Vector2()
    renderer.setAnimationLoop(() => {
      for (const f of jeBild) f()
      knoepfeZeigen()
      renderer.getSize(aufloesung)
      for (const o of wurzel.getObjectByName('hoehen')?.children ?? []) ((o as LineSegments2).material as LineMaterial).resolution?.copy(aufloesung)
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

  // je Stufe: das Gelände, der Sockel, die Höhenscheiben, die Namen, die Knöpfe und der Kasten des gewählten Felds
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
    let f = faktorJetzt.current
    const Y = (z: number) => (z / 1000) * f
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
      boeden.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: textur })))
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

    // die Höhenscheiben und ihre Linien in den Wänden, nur auf Höhen zwischen dem tiefsten und dem höchsten Punkt
    const hoehen = new THREE.Group()
    hoehen.name = 'hoehen'
    hoehen.visible = scheibenJetzt.current
    wurzel.add(hoehen)
    const scheibenMaterial = HOEHEN_STUFEN.map(([, color]) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: SCHEIBE_DECKKRAFT,
      side: THREE.DoubleSide, depthWrite: false }))
    const linienMaterial = HOEHEN_STUFEN.map(([, color]) => new LineMaterial({ color, linewidth: HOEHEN_LINIE_PX }))
    const kurvenMaterial = HOEHEN_STUFEN.map(([, color]) => new LineMaterial({ color, linewidth: HOEHEN_LINIE_PX, transparent: true,
      opacity: 0.6, depthWrite: false }))
    const linienSetzen = (g: THREE.BufferAttribute | number[], m: LineMaterial) => {
      const geo = new LineSegmentsGeometry()
      geo.setPositions(g as number[])
      const l = new LineSegments2(geo, m)
      l.renderOrder = 3
      hoehen.add(l)
    }
    const hoehenBauen = () => {
      for (const o of hoehen.children) (o as THREE.Mesh).geometry.dispose()
      hoehen.clear()
      const raus = weiteKm * 0.0015, heben = weiteKm * 0.0006
      HOEHEN_STUFEN.forEach(([z], s) => {
        if (!(z > tief && z < hoechst)) return
        const y = Y(z)
        const sch = new THREE.Mesh(new THREE.PlaneGeometry(X(E1) - X(E0), Z(N0) - Z(N1)), scheibenMaterial[s])
        sch.rotation.x = -Math.PI / 2
        sch.position.set((X(E0) + X(E1)) / 2, y, (Z(N0) + Z(N1)) / 2)
        sch.renderOrder = 2
        hoehen.add(sch)
        // die Linie in den Wänden: wo die Wand über die Höhe reicht, ein schmales Band knapp vor der Wand
        const band: number[] = []
        for (const { p, nx, nz } of kantenOben) {
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
      sp.userData = { e, n, z, b: c.width * 0.0009, h: c.height * 0.0009, verhaeltnis: c.width / c.height }
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
      const orte = zusatz.orte.map((o) => ({ o, l: lv95(o.lage[0], o.lage[1]) })).filter(({ o, l }) => drin(l[0], l[1]) && (stufe !== 'schweiz' || o.klasse >= 4))
      for (const { o, l } of orte) schild(o.name, dunkel ? '#ffffff' : '#212121', l[0], l[1], bestandHoehe(b, l[0], l[1]) + 30)
    }

    // + und − an den Wänden, in der Mitte jeder Seite im Sockel unter dem tiefsten Punkt
    const knopfGruppe = new THREE.Group()
    knopfGruppe.name = 'knoepfe'
    wurzel.add(knopfGruppe)
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
      faktor: (nf) => {
        f = nf
        for (const n of netze) n.setzen()
        sockelBauen(); hoehenBauen(); knoepfeSetzen()
        for (const sp of schilder.children) sp.position.y = Y(sp.userData.z)
        const u = wurzel.getObjectByName('umwelt')
        if (u) u.scale.y = f
        setzeWahl(feldJetzt)
        if (renderer.xr.isPresenting) k.jeBild[0]()
      },
      scheiben: (an) => { hoehen.visible = an },
    }
    // in der Brille gleich die neue Grösse
    if (renderer.xr.isPresenting) k.jeBild[0]()
    return () => {
      k.wenn.tipp = null
      for (const o of [...wurzel.children]) {
        o.traverse((x) => {
          const q = x as THREE.Mesh
          q.geometry?.dispose()
          const mats = (Array.isArray(q.material) ? q.material : [q.material]) as Array<(THREE.Material & { map?: THREE.Texture }) | undefined>
          for (const mat of mats) { mat?.map?.dispose(); mat?.dispose?.() }
        })
        wurzel.remove(o)
      }
      for (const m of [...wandMaterialien, platteMaterial, ...scheibenMaterial, ...linienMaterial, ...kurvenMaterial, kastenMaterial, kantenMaterial]) m.dispose()
      welt.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, stufe, zusatz, knoepfe])

  // Gebäude und Bäume (vorerst in zwei Probeausschnitten), in einer Gruppe, deren Höhe mit dem Faktor wächst
  useEffect(() => {
    const k = kern.current
    if (!k || !umwelt || (stufe !== 'ort' && stufe !== 'nah')) return
    const { wurzel } = k
    const { cE, cN } = wurzel.userData.lage as { cE: number; cN: number }
    const r = [...b.teile.values()].map((t) => t.rahmen)
    const e0 = Math.min(...r.map((x) => x.e0)), e1 = Math.max(...r.map((x) => x.e0 + x.b))
    const n0 = Math.min(...r.map((x) => x.n1 - x.h)), n1 = Math.max(...r.map((x) => x.n1))
    const gruppe = new THREE.Group()
    gruppe.name = 'umwelt'
    gruppe.scale.y = faktorJetzt.current
    let weg = false
    void probeLaden(e0, n0, e1, n1).then(({ gebaeude, baeume }) => {
      if (weg) return
      gruppe.add(...gebaeudeNetz(gebaeude, cE, cN, e0, n0, e1, n1), ...baumNetz(baeume, b, cE, cN, e0, n0, e1, n1))
      if (gruppe.children.length) wurzel.add(gruppe)
    })
    return () => {
      weg = true
      gruppe.traverse((x) => {
        const q = x as THREE.Mesh
        q.geometry?.dispose()
        ;(q.material as THREE.Material | undefined)?.dispose?.()
      })
      gruppe.removeFromParent()
    }
  }, [b, stufe, umwelt])

  useEffect(() => { welt.current?.faktor(faktor) }, [faktor])
  useEffect(() => { welt.current?.scheiben(scheiben) }, [scheiben])
  useEffect(() => {
    welt.current?.setzeWahl(wahl)
    const k = kern.current
    if (k?.inBrille()) {
      k.tafelSetzen(meldung ? [meldung.split(': ')[0], ...(meldung.split(': ')[1] ? [meldung.split(': ').slice(1).join(': ')] : [])]
        : info && wahl ? [...info, 'Nochmals Abzug: eintauchen'] : stufe === 'nah' ? ['Greiftaste: zurück'] : null)
    }
  }, [wahl, info, stufe, b, meldung])
  return <div ref={huelle} className="absolute inset-0 touch-none" />
}

/** die Gebäude im Rechteck als Netze (je Kachel eines), in Kilometern um die Mitte, Höhe ungestreckt; nur die Dreiecke mit ihrer
 *  Mitte im Rechteck: eine Kachel von 500 m reicht oft über den Rand des Modells (Michael, 2026-10-21: «stimmen die
 *  Gebäudeeinblendungen nicht mit den Kacheln überein», sie standen neben dem Sockel in der Luft) */
function gebaeudeNetz(kacheln: GebaeudeKachel[], cE: number, cN: number, e0: number, n0: number, e1: number, n1: number) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
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
    return [new THREE.Mesh(geo, material)]
  })
}

/** die Bäume im Rechteck als ein InstancedMesh, der Fuss auf dem Gelände des Bestands */
function baumNetz(kacheln: BaumKachel[], b: Bestand, cE: number, cN: number, e0: number, n0: number, e1: number, n1: number) {
  const liste: Array<[number, number, number, number, number, number]> = []
  for (const k of kacheln) {
    for (let i = 0; i < k.art.length; i++) {
      const e = k.e0 + k.lage[i * 2] / 10, n = k.n0 + k.lage[i * 2 + 1] / 10
      if (e < e0 || e > e1 || n < n0 || n > n1) continue
      liste.push([e, n, k.art[i], k.farben[i * 3], k.farben[i * 3 + 1], k.farben[i * 3 + 2]])
    }
  }
  if (!liste.length) return []
  const krone = new THREE.IcosahedronGeometry(0.5, 0)
  krone.scale(1, 0.85, 1); krone.translate(0, 0.5, 0)
  const netz = new THREE.InstancedMesh(krone, new THREE.MeshLambertMaterial(), liste.length)
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), c = new THREE.Color()
  const oben = new THREE.Vector3(0, 1, 0)
  liste.forEach(([e, n, art, r, g, bl], i) => {
    const [hoehe, radius] = BAUM_FORM[art] ?? BAUM_FORM[0]
    // je Baum bis 25 % grösser oder kleiner, immer gleich
    const z = Math.sin(e * 12.9898 + n * 78.233) * 43758.5453, f = 0.75 + 0.5 * (z - Math.floor(z))
    v.set((e - cE) / 1000, (bestandHoehe(b, e, n) - 0.5) / 1000, -(n - cN) / 1000)
    s.set((2 * radius * f) / 1000, (hoehe * f) / 1000, (2 * radius * f) / 1000)
    q.setFromAxisAngle(oben, f * 20)
    netz.setMatrixAt(i, m.compose(v, q, s))
    netz.setColorAt(i, c.setRGB(LINEAR[r], LINEAR[g], LINEAR[bl]))
  })
  netz.instanceMatrix.needsUpdate = true
  if (netz.instanceColor) netz.instanceColor.needsUpdate = true
  netz.computeBoundingSphere()
  return [netz]
}
