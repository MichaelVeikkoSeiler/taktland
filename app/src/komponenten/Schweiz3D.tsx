import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { holen, holenBinaer, indexLaden, kartengrundLaden, seenLaden, sehenswertLaden, szeneLaden } from '../daten'
import { strassenlichtLaden, ausschnittLaden, type BaumKachel, feinHoehe, feinLaden, type GebaeudeKachel, gelaendeIndex, KEINE_HOEHE, luftbildLaden, nahbildLaden, type Raster, ohneLeeres, probeDa, probeLaden, SCHARF_KACHEL_M, umweltGanz, wanderwegeLaden, scharfBild, scharfHoehe, scharfLaden, schweiz3dLaden, seegrundLaden, felsLaden } from '../gelaende'
import { lv95, useBrilleMoeglich, wgs } from '../relief'
import { himmelsrichtung, jetztInDerSchweiz, schweizerZeit, type Sonnenstand, sonnenstand, uhrzeit } from '../sonne'
import { imGebiet, type Pool, schweiz11Laden } from '../schweiz11'
import type { SeenDaten, SehenswertDaten } from '../typen'
import { Ladebalken } from './Ladebalken'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'
import { useEchtesVollbild, VollbildKnopf } from './Netzkarte'
import { fensterLicht, fensterNacht, gebaeudeFlaechen, gebaeudeMaterial, lichtAnteil } from '../gebaeudeBild'
import { knopfTon, wetterGeraeusch, wetterGeraeuschAus } from '../audio'
import { istNadel, NADEL_BREITE, NADEL_HOEHE } from '../baumart'
import { messungVon, NASS_AB_MM, type Station, staerkeAus, stationenBei, type Wetter, type Wind } from '../wetter'
import { niederAusStunde, type WindStunde } from '../wind'
import { type WindPlatz, windPlaetze, windZur } from '../windhosen'
import { jetztImFahrplan, zugTest, type ZugFahrt, type ZugIndex, zugIndexLaden, type ZugNetz, zugNetzLaden, type ZugStelle, zugStelle, zuegeLaden } from '../zuege3d'
import { type Fahrweg, lageBei, wegEnde } from '../fahrt'
import { ZUG_BREITE, ZUG_HOEHE, ZUG_LOK_M, ZUG_LUECKE_M, ZUG_WAGEN, ZUG_WAGEN_M, zugFormen } from './ZugForm'
import { SCHIFF_M, schiffForm } from './SchiffForm'
import { type Schiffe, schiffBei, schiffeLaden } from '../schiffe3d'
import { bewoelkung, bewoelkung3d, niederschlagBei, type Wolken, wolken3dStunde, wolkenLaden, wolkenStunde } from '../wolken'
import { type Niederschlag, niederschlagBauen, type Saeule } from './Niederschlag'
import { type VierWindhosen, vierWindhosenBauen } from './Windhose'
import { WindTafel } from './WindTafel'
import { Abschnitt } from './Anleitung'
import { type Sternenhimmel, sternenhimmelBauen } from './Sternenhimmel'
import { himmelNacht, sternSicht } from '../sterne'

/**
 * «3D Schweiz» (Michael, 2026-10-18: «die Berge und Täler der Schweiz besser erkunden … von der ganzen Schweiz bis ins
 * Quartier eines Bergdorfes»): drei Stufen. Die ganze Schweiz aus der Übersicht (data/schweiz3d, Gelände auf 500 m, Luftbild
 * auf 100 m), darin ein Feld von 20 km wählen und eintauchen (Gelände auf 50 m, Luftbild auf 10 m), darin ein Feld von 4 km
 * (feines Gelände auf 10 m und Nahbild auf 2,5 m, wo es sie gibt: bis 500 m neben den Bahnlinien; sonst bleibt es bei 50 m).
 *
 * Gewählt wird ein Quadrat, keine Region und kein Tal: wo ein Tal oder eine Region beginnt und endet, steht in keiner
 * unserer Quellen. Was die Karte zum Feld nennt, steht in den Daten: Orte der Landeskarte, Gipfel, Seen, der Kanton der Mitte.
 */

type Stufe = 'schweiz' | 'gross' | 'region' | 'ort' | 'nah'
/** die Stufen von aussen nach innen; «gross» ist das Gebiet von 80 km zwischen der Schweiz und der Region (Michael, 2026-10-29:
 *  «noch eine Zoom-Stufe mit Seitenlänge 80 km») */
const STUFEN: Stufe[] = ['schweiz', 'gross', 'region', 'ort', 'nah']
/** in der Schweiz und im Gebiet von 80 km gibt es keine Wanderwege, Züge und Schiffe (wie bisher erst ab 20 km) und keine
 *  angesetzten Stücke */
const grob = (s: Stufe) => s === 'schweiz' || s === 'gross'
/** Grösse des Felds, das man in einer Stufe wählt, und das Raster, auf das es rückt; in der Stufe «nah» wählt man nichts mehr
 *  (Michael, 2026-10-19: «noch eine Ausschnittsgrösse mehr im Detail») */
const FELD_M: Record<Exclude<Stufe, 'nah'>, number> = { schweiz: 80_000, gross: 20_000, region: 4_000, ort: 1_000 }
const RASTER_M: Record<Exclude<Stufe, 'nah'>, number> = { schweiz: 10_000, gross: 5_000, region: 1_000, ort: 250 }
const KARMIN = '#a8102e'

interface Uebersicht { ost: number; nord: number; m: number; breite: number; hoehe: number; quelle_gelaende: string; quelle_luftbild: string }
/** rahmen: welches Rechteck das Bild zeigt (Ost und Nord der Ecke links oben, Breite und Höhe in Metern) */
interface Gelaende {
  raster: Raster; h: Float32Array; bild: HTMLCanvasElement; rahmen: { e0: number; n1: number; b: number; h: number }; quellen: string[]; hinweis?: string
  /** über gemessenem Seegrund die Höhe der Seeoberfläche laut Geländemodell (sonst NaN); h bleibt dort die Oberfläche (seegrundSetzen) */
  wasser?: Float32Array
  /** der Grund des Sees je Feld, wo wasser gilt (swissBATHY3D), nur für den Schnitt in den Wänden */
  seegrund?: Float32Array
  /** die Seen mit gemessenem Grund in diesem Stück */
  seen?: string[]
  /** die Höhe des Felses unter dem Lockergestein je Feld (swissBEDROCK), NaN ohne Angabe (untergrundSetzen) */
  fels?: Float32Array
}
interface Feld { e: number; n: number; seite: number }
type Seite = 'n' | 'o' | 's' | 'w'
/** was die Schalter ein- und ausschalten */
type Schalter = 'hoehen' | 'orte' | 'gipfel' | 'wandern' | 'gebaeude' | 'baeume' | 'sonne' | 'wind' | 'zuege' | 'schiffe' | 'wolken'
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
/** ein Tablet: Touch und die kürzere Seite des Bildschirms ab 700 Bildpunkten (wie bei hoechstens und den Schatten) */
const istTablet = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) >= 700
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
  const r = { e: Math.round(f.e / RASTER_M.gross) * RASTER_M.gross, n: Math.round(f.n / RASTER_M.gross) * RASTER_M.gross, seite: FELD_M.gross }
  return einzeln(r, await regionLaden(r))
}
interface Zusatz {
  sw: SehenswertDaten; seen: SeenDaten; orte: Array<{ name: string; klasse: number; lage: [number, number]; einwohner_gemeinde?: number }>; pool: Pool
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
  // auch in der ganzen Schweiz der Seegrund (Michael, 2026-10-25: «Seegrund auch in der ganzen Schweiz einbauen»), ohne Fels: die Wände
  // liegen dort fast überall im Ausland, wo swissBEDROCK nichts angibt
  return seegrundSetzen({ raster: { ost: ix.ost, nord: ix.nord, m: ix.m, breite: ix.breite, hoehe: ix.hoehe }, h: Float32Array.from(u), bild: c,
           rahmen: { e0: ix.ost, n1: ix.nord, b: ix.breite * ix.m, h: ix.hoehe * ix.m }, quellen: [ix.quelle_gelaende, ix.quelle_luftbild] })
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
  return untergrundSetzen({ raster: a.raster, h: Float32Array.from(a.h), bild: c, rahmen: { e0: ost, n1: nord, b: breite * m, h: hoehe * m },
           quellen: [a.quelle, d?.bilder.length ? `${d.quelle_bild}, hier auf etwa ${Math.round(1 / sx)} m, Aufnahmen ${d.bildJahre.join(', ')}`
             : lb ? `SWISSIMAGE (swisstopo), auf 10 m gemittelt, Aufnahmen ${lb.jahre.join(', ')}` : 'ohne Luftbild'] })
}

/** Gebiet: 80 km (Michael, 2026-10-29: «eine Zoom-Stufe mit Seitenlänge 80 km»), das Gelände der Kacheln (50 m) auf jeden zweiten
 *  Punkt ausgedünnt, also 100 m, und das Luftbild auf 4096 Bildpunkte, etwa 20 m (auf dem Handy 2048, etwa 40 m); ohne die Details von
 *  daten.taktland.ch, die wären hier je 10 km einige MB. Raster und Bildgrösse gewählt, damit die Grafik es hält */
async function grossLaden(f: Feld): Promise<Gelaende> {
  const { raster_m: rm } = await gelaendeIndex()
  const a = await ausschnittLaden({ ost: f.e - f.seite / 2, nord: f.n + f.seite / 2, m: rm, breite: f.seite / rm + 1, hoehe: f.seite / rm + 1 })
  const schritt = 2, m = rm * schritt, breite = f.seite / m + 1
  const h = new Float32Array(breite * breite)
  for (let j = 0; j < breite; j++) for (let i = 0; i < breite; i++) h[j * breite + i] = a.h[j * schritt * a.raster.breite + i * schritt]
  const raster = { ost: a.raster.ost, nord: a.raster.nord, m, breite, hoehe: breite }
  const lb = await luftbildLaden(raster)
  const c = document.createElement('canvas')
  c.width = c.height = hoechstens() === 4 ? 2048 : 4096
  const g = c.getContext('2d')!
  g.fillStyle = '#d8d5c2'; g.fillRect(0, 0, c.width, c.height)
  const sx = c.width / (breite * m), sy = c.height / (breite * m)
  for (const k of lb?.kacheln ?? []) {
    g.drawImage(k.bild, (k.ex * lb!.kachel_m - raster.ost) * sx, (raster.nord - (k.ny + 1) * lb!.kachel_m) * sy, lb!.kachel_m * sx, lb!.kachel_m * sy)
  }
  return untergrundSetzen({ raster, h, bild: c, rahmen: { e0: raster.ost, n1: raster.nord, b: breite * m, h: breite * m },
           quellen: [`${a.quelle}, hier jeder zweite Punkt, also 100 m`,
             lb ? `SWISSIMAGE (swisstopo), hier auf etwa ${Math.round(1 / sx)} m, Aufnahmen ${lb.jahre.join(', ')}` : 'ohne Luftbild'] })
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
  return untergrundSetzen({
    raster: { ost: e0, nord: n1, m, breite, hoehe: breite }, h, bild: c, rahmen: { e0, n1, b: f.seite, h: f.seite },
    quellen: [ganz ? `${details!.quelle_hoehe}, Aufnahmen ${details!.fein.jahre.join(', ')}`
                : anteil > 0 ? 'swissALTI3D (swisstopo), auf 10 m gemittelt, nur bis 500 m neben den Bahnlinien' : rq[0],
              details?.bilder.length ? `${details.quelle_bild}, Aufnahmen ${details.bildJahre.join(', ')}`
                : nah ? 'SWISSIMAGE (swisstopo), auf 2,5 m, nur bis 500 m neben den Bahnlinien, sonst auf 10 m' : rq[1]],
    hinweis: anteil < 0.98 ? (anteil === 0 ? 'Hier gibt es noch keine feineren Daten: Gelände auf 50 m, Luftbild auf 10 m wie in der Region.'
      : ganz ? 'Am Rand fehlen feinere Daten, dort wie in der Region.' : 'Feiner nur bis 500 m neben den Bahnlinien, weiter weg wie in der Region.') : undefined,
  })
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
  return untergrundSetzen({
    raster: { ost: e0, nord: n1, m, breite, hoehe: breite }, h, bild: c, rahmen: { e0, n1, b: f.seite, h: f.seite },
    quellen: [[anteil > 0 && 'swissALTI3D (swisstopo), 2 m, bis 200 m neben den Bahnlinien', feine > 0 && fein!.quelle_hoehe,
               anteilFein < 1 && oq[0]].filter(Boolean).join('; sonst '),
              [bilder.some(Boolean) && 'SWISSIMAGE (swisstopo) auf 25 cm, bis 200 m neben den Bahnlinien',
               feinBild && `${fein!.quelle_bild}, Aufnahmen ${fein!.bildJahre.join(', ')}`, !feinBild && oq[1]].filter(Boolean).join('; sonst ')],
    hinweis: anteilFein === 0 && !feinBild
      ? 'Schärfer als im Feld darüber gibt es hier noch nichts: Gelände auf 10 m, Luftbild auf 2,5 m. Schärfere Daten gibt es bisher nur nahe an den Bahnlinien.'
      : anteilFein < 0.98 ? 'Am Rand fehlen schärfere Daten, dort wie im Feld darüber.' : undefined,
  })
}

function hoeheIm(gl: Gelaende, e: number, n: number) {
  const { ost, nord, m, breite, hoehe } = gl.raster
  const x = Math.max(0, Math.min(breite - 1.001, (e - ost) / m - 0.5)), y = Math.max(0, Math.min(hoehe - 1.001, (nord - n) / m - 0.5))
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
  const z = (a: number, b: number) => gl.h[b * breite + a]
  const boden = z(i, j) * (1 - fx) * (1 - fy) + z(i + 1, j) * fx * (1 - fy) + z(i, j + 1) * (1 - fx) * fy + z(i + 1, j + 1) * fx * fy
  // über einem See zählt seine Oberfläche (Masten, Windhosen, Wanderwege stehen auf dem Wasser, nicht auf dem Grund)
  const w = gl.wasser?.[Math.round(y) * breite + Math.round(x)]
  return w !== undefined && !Number.isNaN(w) ? Math.max(boden, w) : boden
}

/** Seegrund und Fels zu einem Gelände */
async function untergrundSetzen(g: Gelaende): Promise<Gelaende> {
  const mitSee = await seegrundSetzen(g)
  const { ost, nord, m, breite, hoehe } = mitSee.raster
  const f = await felsLaden(ost, nord - hoehe * m, ost + breite * m, nord).catch(() => null)
  if (!f) return mitSee
  const fels = new Float32Array(breite * hoehe).fill(NaN)
  // nur die Ränder: dort liegen die Wände
  for (let j = 0; j < hoehe; j++) {
    for (let i = 0; i < breite; i++) {
      if (j !== 0 && j !== hoehe - 1 && i !== 0 && i !== breite - 1) continue
      const z = f.bei(ost + (i + 0.5) * m, nord - (j + 0.5) * m)
      if (z !== null) fels[j * breite + i] = z
    }
  }
  return { ...mitSee, fels }
}

/** Seegrund (swissBATHY3D, src/gelaende.ts) auf ein Gelände: wo es den Spiegel eines Sees zeigt (höchstens 1,5 m darüber) und der
 *  Grund gemessen ist, sinkt es auf den Grund, und darüber steht das Wasser (Michael, 2026-10-25: «die Seetiefe») */
const SEEGRUND_M = 25
/** so viel darf ein Feld über der Wasserfläche liegen und noch als See gelten (Rauschen im Geländemodell; gewählt) */
const SEE_FLACH_M = 0.1
async function seegrundSetzen(g: Gelaende): Promise<Gelaende> {
  const { ost, nord, m, breite, hoehe } = g.raster
  const sg = await seegrundLaden(ost, nord - hoehe * m, ost + breite * m, nord).catch(() => null)
  if (!sg) return g
  const wasser = new Float32Array(breite * hoehe).fill(NaN), seegrund = new Float32Array(breite * hoehe).fill(NaN)
  let da = false
  // erst die Felder, die See sein könnten, je See (nach seiner Nummer in der Quelle; Bieler-, Neuenburger- und Murtensee haben denselben Spiegel)
  const kandidaten = new Map<number, Array<{ q: number; z: number; grund: number }>>()
  for (let j = 0; j < hoehe; j++) {
    for (let i = 0; i < breite; i++) {
      const q = j * breite + i, z = g.h[q]
      if (z === KEINE_HOEHE) continue
      const e = ost + (i + 0.5) * m, n = nord - (j + 0.5) * m
      const s = sg.bei(e, n)
      if (!s || z > s.spiegel + 1.5) continue
      let grund = s.grund
      // ein grobes Feld (Schweiz, 500 m) bekommt das Mittel des Grunds darin, wenn mindestens die Hälfte gemessen ist
      if (m > SEEGRUND_M * 2) {
        const k = Math.min(20, Math.round(m / SEEGRUND_M))
        let summe = 0, zahl = 0
        for (let b = 0; b < k; b++) {
          for (let a = 0; a < k; a++) {
            const t = sg.bei(e - m / 2 + (a + 0.5) * m / k, n - m / 2 + (b + 0.5) * m / k)
            if (t && t.see === s.see) { summe += t.grund; zahl++ }
          }
        }
        if (zahl < k * k / 2) continue
        grund = summe / zahl
      }
      const liste = kandidaten.get(s.see) ?? []
      liste.push({ q, z, grund }); kandidaten.set(s.see, liste)
    }
  }
  // je See gilt als Wasser nur, was nicht höher liegt als der Median des Geländemodells über ihm (das Modell zeigt Seen flach), alles
  // darüber bleibt Land (Michael, 2026-10-25, Erlach: vorher galt Land bis 1,5 m über dem Spiegel als See und überschwemmte flache Ufer);
  // so für jeden See mit gemessenem Grund (Michael, 2026-10-25: «gilt für alle Seen, die du identifizieren kannst»)
  for (const liste of kandidaten.values()) {
    const zs = liste.map((k) => k.z).sort((a, b) => a - b)
    const flaeche = zs[Math.floor(zs.length / 2)]
    for (const { q, z, grund } of liste) {
      if (z > flaeche + SEE_FLACH_M) continue
      // die Oberfläche bleibt das Gelände mit dem Luftbild, wie vor dem Seegrund (Michael, 2026-10-25: «Es ist keine generische
      // Farbfläche, sondern das Bild der Landkarten, das ich haben möchte»); der Grund zeigt sich nur im Schnitt der Wände
      wasser[q] = z; seegrund[q] = Math.min(z, grund); da = true
    }
  }
  if (da) uferAnlegen(seegrund, wasser, breite, hoehe, m)
  return da ? { ...g, wasser, seegrund, seen: sg.seen } : g
}

/** Der Grund liegt auf 25 m gemittelt vor; am Ufer fiele er sonst senkrecht auf die Tiefe des ersten Felds (Michael, 2026-10-25: «Was gar
 *  nicht gut wäre, ist, wenn es beim Ufer einfach senkrecht hinuntergeht»). Darum steigt er zum Ufer hin an: bis UFER_M vom nächsten Feld
 *  ohne Wasser von der Tiefe laut Quelle gleichmässig bis auf den Spiegel. Eine Annäherung, die Form des Ufers dazwischen steht nicht in
 *  unseren Daten (swissBATHY3D hätte sie auf 1 m) */
const UFER_M = 40
function uferAnlegen(h: Float32Array, wasser: Float32Array, breite: number, hoehe: number, m: number) {
  const R = Math.max(UFER_M, 1.5 * m)
  // Abstand zum nächsten Feld ohne Wasser (Fasen-Abstand in zwei Durchgängen), in Metern
  const d = new Float32Array(breite * hoehe)
  for (let q = 0; q < d.length; q++) d[q] = Number.isNaN(wasser[q]) ? 0 : Infinity
  const diag = m * Math.SQRT2
  const nimm = (q: number, r: number, w: number) => { if (d[r] + w < d[q]) d[q] = d[r] + w }
  for (let j = 0; j < hoehe; j++) {
    for (let i = 0; i < breite; i++) {
      const q = j * breite + i
      if (!d[q]) continue
      if (i > 0) nimm(q, q - 1, m)
      if (j > 0) { nimm(q, q - breite, m); if (i > 0) nimm(q, q - breite - 1, diag); if (i < breite - 1) nimm(q, q - breite + 1, diag) }
    }
  }
  for (let j = hoehe - 1; j >= 0; j--) {
    for (let i = breite - 1; i >= 0; i--) {
      const q = j * breite + i
      if (!d[q]) continue
      if (i < breite - 1) nimm(q, q + 1, m)
      if (j < hoehe - 1) { nimm(q, q + breite, m); if (i < breite - 1) nimm(q, q + breite + 1, diag); if (i > 0) nimm(q, q + breite - 1, diag) }
    }
  }
  for (let q = 0; q < d.length; q++) {
    // am Rand des Modells ohne Ufer in der Nähe bleibt die Tiefe (d ist dort Infinity oder gross)
    if (Number.isNaN(wasser[q]) || d[q] >= R) continue
    const t = d[q] / R
    h[q] = wasser[q] - (wasser[q] - h[q]) * t
  }
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
        <ul className="absolute bottom-full right-0 z-10 mb-1 w-max min-w-full max-w-[80vw] max-h-72 overflow-auto rounded-lg bg-white/95 text-sm shadow-lg dark:bg-sbb-charcoal/95">
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

/** die unterste Grenze der Einwohnerklassen der Landeskarte 1:1 Million (1 = 2'000 bis 9'999 … 5 = über 1 Million) */
const KLASSE_AB = [0, 2_000, 10_000, 50_000, 100_000, 1_000_000]
const ortGroesse = (o: Zusatz['orte'][number]) => o.einwohner_gemeinde ?? KLASSE_AB[o.klasse] ?? 0
function feldInhalt(f: Feld, z: Zusatz | null) {
  if (!z) return null
  // der grösste nach der Einwohnerzahl seiner Gemeinde (swissBOUNDARIES3D; Michael, 2026-10-29: «bei der Region immer die am grössten
  // von der Einwohnerzahl Stadt in diesem Ausschnitt»), wo es sie nicht gibt (Ausland, Ort in einer Gemeinde anderen Namens), nach
  // der untersten Grenze seiner Einwohnerklasse auf der Landeskarte
  const orte = z.orte.filter((o) => imFeld(f, o.lage[0], o.lage[1]))
    .sort((a, b) => ortGroesse(b) - ortGroesse(a) || b.klasse - a.klasse).slice(0, 3).map((o) => o.name)
  const gipfel = z.sw.gipfel.filter((g) => g.hoehe_m !== null && imFeld(f, g.lage[0], g.lage[1]))
    .sort((a, b) => b.hoehe_m! - a.hoehe_m!)[0] ?? null
  const seen = z.seen.seen.filter((s) => s.name && s.namenspunkt && imFeld(f, s.namenspunkt[0], s.namenspunkt[1])).map((s) => s.name!).slice(0, 3)
  const [la, lo] = wgs(f.e, f.n)
  const kanton = [...z.pool.kantone.keys()].find((k) => imGebiet(z.pool, k, la, lo)) ?? null
  return { orte, gipfel, seen, kanton }
}


/* ---------- die Seite ---------- */

/** die Stufe darüber, aus der ein Feld dieser Stufe sein Gelände ergänzt */
const DARUEBER: Record<Exclude<Stufe, 'schweiz'>, Stufe> = { gross: 'schweiz', region: 'gross', ort: 'region', nah: 'ort' }
/** die Stufe darunter, in die man aus einer Stufe eintaucht */
const DARUNTER: Record<Exclude<Stufe, 'nah'>, Exclude<Stufe, 'schweiz'>> = { schweiz: 'gross', gross: 'region', region: 'ort', ort: 'nah' }
/** die Stufen nach s, die nicht mehr gelten, wenn s neu geladen ist */
const danach = (s: Stufe) => Object.fromEntries(STUFEN.slice(STUFEN.indexOf(s) + 1).map((x) => [x, null]))
async function stufeLaden(s: Exclude<Stufe, 'schweiz'>, f: Feld, unter: Bestand | null) {
  if (s === 'gross') return grossLaden(f)
  if (s === 'region') return regionLaden(f)
  const u = await unterFuer(f, unter)
  return s === 'ort' ? ortLaden(f, u) : nahLaden(f, u)
}
/** welche Knöpfe an den Wänden gehen: Plus immer (Michael, 2026-10-24: «Plus soll es immer geben. Es löst dann einfach
 *  entsprechend auf der anderen Seite Kacheln wieder auf»), wachsen: ob das Modell dort grösser werden darf (bis JE_RICHTUNG und
 *  hoechstens()), sonst fällt die Reihe gegenüber weg; Minus, solange mehr als ein Stück da ist */
export interface Knoepfe { plus: Record<Seite, boolean>; wachsen: Record<Seite, boolean>; minus: Record<Seite, boolean> }

/** eigeneSeite: auf 3dland.ch die ganze Seite, ohne den Weg zurück zu den Spielen von Taktland */
export default function Schweiz3D({ eigeneSeite = false }: { eigeneSeite?: boolean }) {
  useEffect(() => szeneLaden(), [])
  const [stufe, setStufe] = useState<Stufe>('schweiz')
  const [gelaende, setGelaende] = useState<Record<Stufe, Bestand | null>>({ schweiz: null, gross: null, region: null, ort: null, nah: null })
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
  // Züge laut Fahrplan, zuerst nur auf 3dland.ch (Michael, 2026-10-26), seit 2026-10-28 auch in Taktland (Michael, 2026-10-28: «Bitte diese Sachen auch für Taktland»)
  const [zuegeAn, setZuegeAn] = useState(false)
  const [schiffeAn, setSchiffeAn] = useState(false)
  // die Wolken mit eigenem Knopf, nicht mehr mit «Wetter» (Michael, 2026-10-29: «Wolken ein separater Knopf machen (weiss)»)
  const [wolkenAn, setWolkenAn] = useState(false)
  // Sonne und Schatten (Michael, 2026-10-21): Datum und Uhrzeit in der Schweiz, am Anfang jetzt (Michael, 2026-10-29: «Beim ersten Laden soll immer Jetzt sein»)
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
  // laut Wettermodell über dem Modell (Niederschlag.ts), sonst die Station
  const [niederBild, setNiederBild] = useState<{ art: 'regen' | 'schnee'; staerke: number } | null | undefined>(undefined)
  const hoerNieder = niederBild !== undefined ? niederBild : niederJetzt
  // Regen und Wind zum Hören, solange «Wetter» an ist (Michael, 2026-10-25: «Bei Regen, Regengeräusch. Bei Wind, Windgeräusch»):
  // der Wind der vier Windhosen gemittelt, nur für die Lautstärke, nirgends als Zahl gezeigt
  const windHoeren = (() => {
    const v = windPl.map((p) => windZur(p, windZeigt?.zeit ?? null)?.kmh).filter((x): x is number => typeof x === 'number')
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null
  })()
  useEffect(() => {
    if (!windAn) { wetterGeraeuschAus(); return }
    wetterGeraeusch(hoerNieder?.art === 'regen' ? hoerNieder.staerke : null, windHoeren)
  }, [windAn, hoerNieder?.art, hoerNieder?.staerke, windHoeren])
  useEffect(() => () => wetterGeraeuschAus(), [])
  const [tag, setTag] = useState(() => jetztInDerSchweiz().datum)
  const [minuten, setMinuten] = useState(() => Math.round(jetztInDerSchweiz().minuten / 15) * 15 % 1440)
  // «Jetzt» ist gedrückt, solange die Zeit die jetzige ist; erst eine Verschiebung von Hand löst ihn (Michael, 2026-10-29: «Darum dieser
  // Knopf aktiv gedrückt. Erst eine manuelle Zeitverschiebung deaktiviert ihn»); gedrückt folgt die Zeit der Uhr, je 15 Minuten
  const [jetztAn, setJetztAn] = useState(true)
  const [tablet] = useState(istTablet)
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
  // die Seen mit gemessenem Grund in den Stücken der jetzigen Stufe
  const seenHier = [...new Set([...(aktuell?.teile.values() ?? [])].flatMap((t) => t.seen ?? []))]
  // der Sonnenstand über der Mitte des Modells
  const stand = useMemo(() => {
    if (!sonnenAn || !aktuell) return null
    const r = [...aktuell.teile.values()].map((t) => t.rahmen)
    const e = (Math.min(...r.map((x) => x.e0)) + Math.max(...r.map((x) => x.e0 + x.b))) / 2
    const n = (Math.min(...r.map((x) => x.n1 - x.h)) + Math.max(...r.map((x) => x.n1))) / 2
    const [la, lo] = wgs(e, n)
    const zeit = schweizerZeit(tag, minuten)
    return { ...sonnenstand(zeit, la, lo), zeit, la, lo }
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
  useEffect(() => {
    if (!jetztAn) return
    const nachstellen = () => { const j = jetztInDerSchweiz(); setTag(j.datum); setMinuten(Math.round(j.minuten / 15) * 15 % 1440) }
    nachstellen()
    const t = window.setInterval(nachstellen, 60_000)
    return () => window.clearInterval(t)
  }, [jetztAn])
  const zeitSchieben = (art: 'stunde' | 'tag' | 'jetzt', um: number) => {
    if (art === 'jetzt') { const j = jetztInDerSchweiz(); setTag(j.datum); setMinuten(Math.round(j.minuten / 15) * 15 % 1440); setJetztAn(true); return }
    setJetztAn(false)
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
      if (stufe === 'nah') return
      const nachher = DARUNTER[stufe]
      const g = await stufeLaden(nachher, wahl, gelaende[stufe])
      setGelaende((a) => ({ ...a, ...danach(nachher), [nachher]: einzeln(wahl, g) })); setStufe(nachher)
      // nach einer Suche auch in der nächsten Stufe das Feld um den Ort (Michael, 2026-10-23: «bei allen Eintauchstufen mit dem roten
      // Kasten markiert»), sofern er im gewählten Feld liegt
      const imGewaehlten = gesucht && Math.abs(gesucht.e - wahl.e) <= wahl.seite / 2 && Math.abs(gesucht.n - wahl.n) <= wahl.seite / 2
      setWahl(imGewaehlten ? feldUmGesucht(nachher) : null)
      // nach dem Eintauchen die Orte der neuen Stufe mit ihren Masten (Michael, 2026-10-24: «beim Eintauchen wieder neue Ortschaften»)
      setOrteAn(true)
    } catch (e) { setFehler((e as Error).message) } finally { setLaedt(false) }
  }
  const knoepfe = useMemo<Knoepfe | null>(() => {
    if (grob(stufe) || !aktuell) return null
    const breit = aktuell.di[1] - aktuell.di[0] + 1, hoch = aktuell.dj[1] - aktuell.dj[0] + 1, max = hoechstens()
    const ow = breit < JE_RICHTUNG && (breit + 1) * hoch <= max, ns = hoch < JE_RICHTUNG && breit * (hoch + 1) <= max
    return { plus: { n: true, s: true, o: true, w: true }, wachsen: { n: ns, s: ns, o: ow, w: ow }, minus: { n: hoch > 1, s: hoch > 1, o: breit > 1, w: breit > 1 } }
  }, [stufe, aktuell])
  /** an einer Seite eine Reihe Stücke ansetzen oder wegnehmen; die Stufen darunter gelten dann nicht mehr */
  async function erweitern(seite: Seite, plus: boolean) {
    if (grob(stufe) || !aktuell || !knoepfe || laedt) return
    const b = aktuell
    if (!plus && !knoepfe.minus[seite]) { setMeldung('Ein Stück bleibt immer: kleiner geht es nicht.'); return }
    const di: [number, number] = [...b.di], dj: [number, number] = [...b.dj]
    const neu: Array<[number, number]> = []
    // grösser geht es nicht (höchstens JE_RICHTUNG Stücke in eine Richtung und hoechstens() im Ganzen, so viel muss die Grafik
    // halten): dann fällt gegenüber eine Reihe weg, das Modell rückt um ein Stück
    if (plus && !knoepfe.wachsen[seite]) {
      if (seite === 'o') di[0]++; else if (seite === 'w') di[1]--; else if (seite === 'n') dj[0]++; else dj[1]--
    }
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
      setGelaende((a) => ({ ...a, ...danach(stufe), [stufe]: nb }))
      setWahl(null)
    } catch (e) { setFehler((e as Error).message) } finally { setLaedt(false) }
  }

  /** ein gesuchter Ort: zurück in die ganze Schweiz, das Feld um ihn gewählt (Michael, 2026-10-23: «Orte mit einer Suchfunktion orten») */
  function ortWaehlen(e: number, n: number, name: string) {
    const r = RASTER_M.schweiz
    setGesucht({ e, n, name })
    setStufe('schweiz')
    setWahl({ e: Math.round(e / r) * r, n: Math.round(n / r) * r, seite: FELD_M.schweiz })
  }
  // nur in einer Testfassung (VITE_S3D_TEST): ein Feld von aussen wählen
  const erweiternTest = useRef(erweitern)
  erweiternTest.current = erweitern
  useEffect(() => {
    if (!import.meta.env.VITE_S3D_TEST) return
    ;(window as unknown as { s3d: unknown }).s3d = { waehle: (e: number, n: number, seite: number) => setWahl({ e, n, seite }), wind: () => setWindAn((x) => !x), orte: () => setOrteAn((x) => !x), zuege: () => setZuegeAn((x) => !x), schiffe: () => setSchiffeAn((x) => !x), wolken: () => setWolkenAn((x) => !x), zugZeit: (min: number) => { zugTest.versatzMin = min }, gipfel: () => setGipfelAn((x) => !x), hoehen: () => setScheiben((x) => !x), gebaeude: () => setGebaeudeAn((x) => !x), sonne: () => setSonnenAn((x) => !x), zeit: (m: number) => { setJetztAn(false); setMinuten(m) }, plus: (seite: Seite) => void erweiternTest.current(seite, true) }
  }, [])
  const zurueck = (s: Stufe) => { setWahl(feldUmGesucht(s)); setStufe(s) }
  const eineZurueck = () => {
    if (stufe === 'schweiz') setWahl(null); else zurueck(DARUEBER[stufe])
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
        // 25 breit, 28 hoch (Michael, 2026-10-25: «im Format 5 Einheiten breit, 7 Einheiten hoch», dann «20% weniger hoch»), auf breiten
        // Bildschirmen so schmal, dass es in 85 % der Höhe passt; bis an den Rand der Seite, ohne Rand und runde Ecken (Michael, 2026-10-25: «Weissen Rahmen um
        // die Karte weglassen. Kartenbild bis an den Rand»), auf 3dland.ch gleich unter dem Auftaktbild
        : `relative -mx-4 ${eigeneSeite ? '' : 'mt-2'} aspect-[25/28] w-[calc(100%+2rem)] overflow-hidden bg-[#cfe3f5] dark:bg-[#0d1b2a] sm:mx-auto sm:w-full sm:max-w-[calc(85vh*25/28)]`}>
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
                     sonne: setSonnenAn, wind: setWindAn, zuege: setZuegeAn, schiffe: setSchiffeAn, wolken: setWolkenAn })[art]((x) => !x)} zuegeDa zuege={zuegeAn} schiffe={schiffeAn} wolken={wolkenAn} sonne={stand} sonnenZeilen={sonnenZeilen} jetztAn={jetztAn} standort={standort}
                   windAn={windAn} windWerte={windPl.map((p) => ({ wind: windZur(p, windZeigt?.zeit ?? null), name: p.station?.name ?? null }))} windOrte={windOrte} nieder={niederJetzt} niederModell={setNiederBild}
                   zeitSchieben={zeitSchieben} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-sbb-metal">Die Schweiz wird geladen …</div>
        )}
        <Ladebalken inKarte />
        {/* unten rechts die Suche, XR, Mein Standort und Vollbild, gleich gross nebeneinander (Michael, 2026-10-25: «Mein GPS-Standort soll
            neben dem … Vollbild-Icon sein. Gleiche Grösse nebeneinander»; «Button Mit VR-Brille neu benennen: XR … gleiche Größe und neben
            den anderen Icons»; «Suchmaske und Icons unten rechts im Kartenbild») */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {zusatz && zusatz.ortschaften.length > 0 && <OrtSuche zusatz={zusatz} waehlen={ortWaehlen} />}
          <button type="button" onClick={inBrille} aria-label="Mit VR-Brille (XR)" title="Mit VR-Brille"
                  // wie die Knöpfe daneben, nicht mehr rot (Michael, 2026-10-26: «nicht mehr Rot sondern harmonisch wie die anderen Icons»)
                  className="flex size-8 flex-none items-center justify-center rounded-lg border border-sbb-cloud bg-white/90 text-xs font-bold text-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight/90 dark:text-sbb-white">
            XR
          </button>
          <button type="button" onClick={gpsUmschalten} aria-pressed={gpsAn}
                  aria-label={gpsAn ? 'Mein Standort ausschalten' : 'Mein Standort zeigen'}
                  title={gpsAn ? (standort ? 'Mein Standort (aus)' : 'Standort wird gesucht …') : 'Mein Standort'}
                  className={`flex size-8 flex-none items-center justify-center rounded-lg border ${gpsAn ? 'border-sbb-anthracite bg-sbb-anthracite text-white' : 'border-sbb-cloud bg-white/90 text-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight/90 dark:text-sbb-white'} ${gpsAn && !standort ? 'animate-pulse' : ''}`}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
              <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" />
            </svg>
          </button>
          <VollbildKnopf voll={voll} umschalten={() => setVoll(!voll)} />
        </div>
        {brilleHinweis && (
          <p role="status" className="absolute inset-x-2 top-12 rounded-lg bg-white/95 p-2 text-xs font-medium dark:bg-sbb-midnight/95">{brilleHinweis}</p>
        )}
        {meldung && (
          <button type="button" onClick={() => setMeldung(null)} role="status"
                  className="absolute inset-x-2 top-12 rounded-lg bg-white/95 p-3 text-left text-sm font-medium shadow-lg dark:bg-sbb-charcoal/95 md:left-auto md:w-96">
            {meldung}
          </button>
        )}
        {wahl && stufe !== 'nah' && (
          // oben links, unten lag er auf dem Handy oft unter dem Bildschirmrand (Michael, 2026-10-24: «Der Eintauchen
          // Button müsste oben sein sonst sieht man ihn nicht»); nur der Knopf, ohne Orte im Feld und «Andere Wahl» (Michael,
          // 2026-10-24: «Hier braucht es nur den Eintauchen-Button»), ein anderes Feld wählt ein Tipp ins Modell; auf dem Tablet unten
          // links und 1,5-mal so gross (Michael, 2026-10-29: «auf dem Tablet … unten links sein. Und noch 150% größer»)
          <button type="button" onClick={() => void eintauchen()} disabled={laedt}
                  // so gross wie «Fahren» im Kopf (Michael, 2026-10-25: «gleiche Grösse wie der Button Fahren»)
                  className={'absolute left-2 rounded-lg bg-sbb-red font-bold text-white shadow-lg hover:bg-sbb-red125 disabled:opacity-50 ' + (tablet
                    ? 'bottom-2 px-[18px] py-[9px] text-2xl' : 'top-2 px-3 py-1.5 text-base max-[359px]:text-[14px]')}>
            {laedt ? 'Wird geladen …' : 'Eintauchen'}
          </button>
        )}
      </div>
      <nav aria-label="Stufe" className="mt-2 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => zurueck('schweiz')} className={`rounded-lg px-2 py-1 ${stufe === 'schweiz' ? 'font-bold' : 'underline'}`}>Schweiz</button>
        {gelaende.gross && (
          <>›<button type="button" onClick={() => zurueck('gross')} className={`rounded-lg px-2 py-1 ${stufe === 'gross' ? 'font-bold' : 'underline'}`}>
            80 km {titel(gelaende.gross.anker) === 'Feld' ? '' : titel(gelaende.gross.anker)}</button></>
        )}
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
            <input type="date" value={tag} onChange={(e) => { if (e.target.value) { setJetztAn(false); setTag(e.target.value) } }} aria-label="Datum"
                   className="rounded-lg border border-sbb-cloud bg-white px-2 py-1 dark:border-sbb-iron dark:bg-sbb-midnight" />
            <label className="flex min-w-48 flex-1 items-center gap-2">
              <span className="sr-only">Uhrzeit</span>
              <input type="range" min={0} max={1425} step={15} value={minuten} onChange={(e) => { setJetztAn(false); setMinuten(Number(e.target.value)) }}
                     className="flex-1 accent-sbb-red" />
              <span className="w-12 font-bold tabular-nums">{uhrzeit(minuten)}</span>
            </label>
            <button type="button" onClick={() => zeitSchieben('jetzt', 0)} aria-pressed={jetztAn}
                    className={'rounded-lg border px-2.5 py-1.5 text-xs font-bold ' + (jetztAn ? 'border-sbb-anthracite bg-sbb-anthracite text-white'
                      : 'border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-midnight')}>Jetzt</button>
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
      {wandern && !grob(stufe) && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-sbb-metal dark:text-sbb-storm" aria-label="Wanderwege">
          {WANDER_NAMEN.map(([a, name]) => (
            <span key={a} className="inline-flex items-center gap-1">
              <span className="inline-block h-1 w-4 rounded-sm" style={{ background: WANDER_FARBEN[a] }} />{name}
            </span>
          ))}
        </p>
      )}
      {anker && (
        <details className="klapp mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
          <summary className="flex min-h-9 cursor-pointer items-center underline underline-offset-2">Modell, nicht massstäblich: Quellen</summary>
          <p className="mt-1">Gelände: {anker.quellen[0]}. Luftbild: {anker.quellen[1]}. {seenHier.length
            ? `Seegrund: swissBATHY3D (swisstopo), auf 25 m gemittelt, hier ${seenHier.join(', ')}, nur im Schnitt der Wände; die Oberfläche ist das Gelände mit dem Luftbild. `
            : 'Seegrund: in diesem Ausschnitt keiner gemessen (swissBATHY3D kennt 22 Seen), Seen zeigen hier nur ihre Oberfläche. '}{stufe !== 'schweiz'
            ? 'Lockergestein in den Wänden bis auf den Fels: swissBEDROCK (swisstopo), Felsoberfläche auf 50 m gemittelt. ' : ''}Orte der Landeskarte 1:1 Million (swisstopo), ein Feld benannt nach dem grössten nach der Einwohnerzahl seiner Gemeinde (swissBOUNDARIES3D, swisstopo),
            Gipfel (swisstopo), Seen aus swissTLMRegio (swisstopo), Kantone (BFS). Ortschaften auf den Masten: swissTLMRegio (swisstopo),
            die grösseren zuerst nach der Objektart der Quelle, mit Abstand zueinander; Auswahl und Mast gewählt. Ein Feld ist ein Quadrat, keine Region und kein Tal:
            deren Grenzen stehen in keiner unserer Quellen. Wanderwege: swissTLM3D (swisstopo), alle Wege, die dort als Wanderweg,
            Bergwanderweg oder Alpinwanderweg eingetragen sind, ohne die Stücke in Tunneln, auf das Gelände des Modells gelegt; die Farben
            folgen den Wegweisern. Wind: die letzte Messung der nächsten Station von MeteoSchweiz mit Windmessung (SwissMetNet) und ihre
            lokale Prognose (stündlich, bis 8 Tage); immer vier Windhosen in der Mitte der Viertel des Bilds, nach jeder Bewegung neu
            verteilt, jede mit dem Wind der Station, die ihr am nächsten liegt (nicht an der Station; die Tafel nennt sie), die Zahl in km/h, gezeichnet und viel grösser als in Wirklichkeit, ganz gestreckt ab 28 km/h. Sonne und Schatten: der Stand der Sonne über der Mitte des Modells, gerechnet nach den Näherungen
            des Astronomical Almanac auf etwa ein Zehntelgrad, ohne die Brechung der Luft am Horizont; Schatten wirft nur das Gelände im
            Modell, Berge ausserhalb nicht, Wolken und Dunst fehlen. Sterne: alle bis zur Helligkeit 6 aus dem Hipparcos-Katalog der ESA,
            aufbereitet von d3-celestial (Olaf Frohn, BSD-Lizenz), ihr Ort am Himmel gerechnet, ohne die Bewegung der Erdachse seit 2000
            (etwa ein Drittel Grad), ohne Mond und Planeten; Farbe nach dem Farbindex, Grösse und Helligkeit der Punkte und die Farben
            des Himmels in der Dämmerung gewählt. Die Höhenlinien liegen auf 1'000, 2'000, 3'000 und 4'000 m über Meer, wo das
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
          <p>Die ganze Schweiz als Modell. Tippe auf ein Feld oder such einen Ort, Gipfel oder See. Mit «Eintauchen» geht es in ein Gebiet von 80 km, dort in eine Region von 20 km, dann in ein Feld von 4 km und zuletzt in ein Stück von 1 km.
            Ein Tipp neben das Modell nimmt die Wahl zurück. Die Zeile unter dem Modell (Schweiz › Region …) führt eine Stufe zurück.</p>
        </Abschnitt>
        <Abschnitt titel="Drehen und zoomen">
          <p>Ziehen dreht, zwei Finger oder das Mausrad zoomen. Die Höhen sind echt, ohne Überhöhung. Der Knopf oben rechts zeigt das
            Modell im Vollbild.</p>
        </Abschnitt>
        <Abschnitt titel="Knöpfe an den Wänden">
          <p>Die Knöpfe an den Wänden des Sockels schalten Höhenlinien, Orte, Gipfel, Wanderwege, Gebäude, Bäume, Wetter und Sonne ein und
            aus; leuchtet ein Knopf, ist es an. Am Anfang ist alles aus. Was in einer Stufe nicht geht, bleibt dunkel. + und − in der Mitte
            einer Wand, unter dem Sockel, setzen dort ein Stück an oder nehmen eines weg (ab der Region). Plus geht immer: Ist das Modell so
            gross, wie das Gerät es halten kann, fällt gegenüber eine Reihe weg, und das Modell rückt weiter. Die Höhenlinien liegen auf 1'000, 2'000, 3'000 und
            4'000 m, ihre Zahl steht klein an der Wand.</p>
        </Abschnitt>
        <Abschnitt titel="Züge">
          <p>«Züge» zeigt ab der Stufe 20 km jeden Zug dort, wo er jetzt laut Fahrplan ist: wie der Zug der Modellbahn von Taktland
            (Lok, vier Wagen, Steuerwagen, die Spitze karminrot) auf dem Gelände, in Fahrtrichtung. Am Halt steht er zwischen Ankunft und Abfahrt still, am
            Start- und Endbahnhof je 5 Minuten vor der Abfahrt und nach der Ankunft, eine Annahme: wie lange er dort wirklich steht,
            steht nicht im Fahrplan. Es ist der Fahrplan von opentransportdata.swiss, nicht
            die wirkliche Lage: Verspätungen, Ausfälle, Extrazüge und Baustellen nach dem Stand der Datei fehlen. Zwischen zwei Halten
            fährt der Zug gleichmässig auf dem kürzesten Weg im Netz; wie schnell er anfährt und bremst und welchen Weg er bei mehreren
            wirklich nimmt, steht in keiner Quelle. Ein Tipp auf einen Zug (in der Brille Strahl und Abzug) zeigt über ihm ein Schild: Linie oder Gattung,
            Zugnummer und Ziel, dazu der Halt, an dem er steht, oder der nächste, mit den Zeiten und dem Gleis laut Fahrplan (die
            Buchstaben sind die Sektoren, wie sie der Fahrplan nennt); oben im Bild ein Link zur Seite dieses Bahnhofs auf taktland.ch
            mit Perrons und Gleisen, wo Taktland eine hat. Ein Tipp daneben blendet es aus. Gezeigt sind nur Halte an Bahnhöfen im Netz von Taktland. Ein Zug ist 200 m lang
            gezeichnet, kein bestimmter Zugtyp, aus der Ferne grösser, damit man ihn sieht; Länge und Gestalt stehen nicht im Fahrplan.</p>
        </Abschnitt>
        <Abschnitt titel="Schiffe">
          <p>«Schiffe» zeigt ab der Stufe 20 km jedes Kursschiff und jede Fähre dort, wo sie jetzt laut Fahrplan sind, auf dem Wasser in
            Fahrtrichtung. Zwischen zwei Ländten fährt ein Schiff gleichmässig auf den Kurslinien, wie sie swisstopo für die Landeskarte
            führt (swissTLMRegio), auf dem kürzesten Weg darauf; wie nah diese Linien dem wirklichen Kurs folgen, steht in keiner
            Quelle. Findet sich auf den Linien kein Weg zwischen zwei Ländten, fehlt das Schiff auf diesem Stück, statt quer übers Land zu
            fahren. An der Ländte steht es zwischen Ankunft und Abfahrt, am Anfang und am Ende je 5 Minuten, eine Annahme wie bei den
            Zügen. Es ist der Fahrplan von opentransportdata.swiss, nicht die wirkliche Lage: Verspätungen, Ausfälle und Extrafahrten
            fehlen. Ein Tipp auf ein Schiff zeigt Kursnummer, Ziel und die Ländte, an der es liegt, oder die nächste, mit den Zeiten
            laut Fahrplan. Ein Schiff ist gezeichnet, kein bestimmtes Schiff, aus der Ferne grösser, damit man es sieht.</p>
        </Abschnitt>
        <Abschnitt titel="Wetter: Wind und Niederschlag">
          <p>«Wetter» zeigt immer vier Windhosen im Bild, nach jedem Drehen und Zoomen wieder verteilt, je eine in der Mitte jedes Viertels
            des Bilds. Die Zahl über dem Mast ist die Windstärke in km/h der Station, die dem Platz am nächsten liegt (die Windhose steht
            nicht an der Station). Unter dem Modell die Tafel mit der Messung und der Prognose von MeteoSchweiz für 8 Tage: Der Regler
            wählt eine Stunde, Windhosen, Regen und Schnee zeigen dann diese Stunde. Regen und Wind sind auch zu hören, gerechnete Geräusche,
            lauter mit der Stärke; Schnee bleibt still.</p>
          <p>In jeder Stufe zeigt der weisse Knopf «Wolken» die Wolken laut dem Wettermodell ICON-CH1 von MeteoSchweiz,
            zur Zeit der Sonne oder, wenn die Sonne aus ist, jetzt. Das Modell nennt je Stelle von etwa 1 km, wie viel des Himmels in drei
            Schichten bewölkt ist: tief (vom Boden bis 800 hPa), mittel (800 bis 400 hPa) und hoch (über 400 hPa); hier auf 2 km gemittelt,
            alle 3 Stunden neu, bis gut einen Tag voraus. Gezeichnet ist jede Schicht als Fläche auf einer gewählten Höhe (1'500, 4'200 und
            9'000 m ü. M., etwa die Mitte ihres Druckbereichs), so viel davon deckend, wie die Prognose Bewölkung nennt. Für die nächsten
            24 Stunden des neuesten Laufs gibt es mehr: die Bewölkung in jeder der 80 Schichten des Modells mit deren Höhe über Meer. Dann
            liegen die Wolken in der Höhe, die das Modell rechnet, als Ebenen alle 250 m übereinander, so dick, wie sie dort sind; die Zeile
            sagt dann «in der Höhe des Modells». Die Form der Wolken ist gezeichnet, nicht aus der Quelle.</p>
          <p>Regen und Schnee kommen aus demselben Wettermodell: je Stelle von 2 km, wie stark es zu dieser Stunde fällt, und die
            Schneefallgrenze. Sie fallen von der untersten gezeichneten Wolke darüber bis auf den Boden, über der Schneefallgrenze als
            Schnee, darunter als Regen; in jeder Stufe dasselbe Wetter. Unter einer dichten Wolke sieht man den Regen von oben nicht. Fehlen die
            Daten des Modells, fällt wie früher der Niederschlag der Station gleichmässig über das ganze Modell.</p>
        </Abschnitt>
        <Abschnitt titel="Sonne und Schatten">
          <p>«Sonne» rechnet den Stand der Sonne über der Mitte des Modells zu Datum und Uhrzeit, mit Schatten. An der Wand verschieben
            −1 h und +1 h die Zeit, −1 Tag und +1 Tag das Datum, «Jetzt» setzt beides auf jetzt. Am Anfang gilt die jetzige Zeit, «Jetzt» leuchtet dann und die Zeit läuft mit der Uhr mit,
            bis man sie selbst verschiebt; unter dem Modell lassen sich Datum und
            Uhrzeit auch direkt wählen. Steht die Sonne unter dem Horizont, brennt Licht in den Fenstern der Gebäude, abends in vielen,
            nach Mitternacht in wenigen. Fenster und Stockwerke stehen in keiner Quelle: Sie sind gezeichnet, und wie viele brennen, ist
            eine Annahme. Nachts wird der Himmel dunkel, und es stehen die Sterne bis zur Helligkeit 6 dort, wo sie zu dieser Zeit über
            der Mitte des Modells stehen.</p>
        </Abschnitt>
        <Abschnitt titel="Seen und Seetiefe">
          <p>Bei 22 Seen ist der Grund gemessen: swissBATHY3D von swisstopo, ein Höhenmodell des Seegrunds. Die Oberfläche der Seen bleibt
            das Gelände mit dem Luftbild, wie man sie von oben kennt; den See sieht man in den Wänden im Schnitt, von seiner Oberfläche bis
            zum Grund, nach unten dunkler. Die Tiefen sind gemessen. Der Sockel richtet sich nach der Oberfläche: Reicht ein See tiefer als
            der Sockel, ist sein Grund am Boden des Sockels abgeschnitten. Es sind: Ägerisee, Baldeggersee, Bielersee, Bodensee,
            Brienzersee, Genfersee, Hallwilersee, Lac de Joux, Lago Maggiore, Lungerersee, Murtensee, Neuenburgersee, Rotsee, Sarnersee,
            Sempachersee, Silsersee, Silvaplanersee, Thunersee, Vierwaldstättersee, Walensee, Zürichsee und Zugersee. Alle anderen Seen
            zeigen nur ihre Oberfläche; wie tief sie sind, steht in unseren Quellen nicht. Der Grund ist auf 25 m gemittelt, in der ganzen
            Schweiz auf 500 m, dort nur, wo mindestens die Hälfte eines Felds gemessen ist. Weil er gemittelt ist, steigt er die letzten 40 m
            zum Ufer gleichmässig an, damit es dort nicht senkrecht hinuntergeht; wie das Ufer dazwischen wirklich verläuft, zeigt das Modell
            nicht. Farben des Schnitts sind gewählt.</p>
        </Abschnitt>
        <Abschnitt titel="Untergrund in den Wänden">
          <p>Die Wände des Sockels zeigen, was unter der Oberfläche liegt, so weit es gemessen oder kartiert ist: Das helle, ockerfarbene Band
            ist das Lockergestein über dem Fels, also alles, was nicht fester Fels ist, etwa Kies, Sand, Moräne oder Ablagerungen in Seen.
            Darunter beginnt der Fels, dort bleibt die Wand dunkel. Wie tief der Fels liegt, stammt aus swissBEDROCK von swisstopo, einem
            Modell der Felsoberfläche für die ganze Schweiz; die Quelle gibt dazu an, wie unsicher es ist (hier nicht gezeigt). Hier ist es
            auf 50 m gemittelt. Wo die Wand ganz dunkel ist, liegt der Fels an der Oberfläche oder
            swissBEDROCK gibt dort nichts an. Welches Gestein der Fels ist und wie die Schichten darin liegen, zeigt das Modell nicht. Das
            Band gibt es ab dem Gebiet von 80 km, nicht in der ganzen Schweiz von oben.</p>
        </Abschnitt>
        <Abschnitt titel="Mein Standort">
          <p>Das Fadenkreuz oben rechts neben dem Vollbild zeigt dich per GPS als roten Punkt im Modell und wählt das Feld um dich. Der Standort bleibt
            auf dem Gerät.</p>
        </Abschnitt>
        <Abschnitt titel="Mit VR-Brille">
          <p>Der Knopf «XR» oben rechts im Bild startet die Brille. Mit einer Brille wie der Meta Quest steht das Modell auf dem Tisch. Ein kurzer Abzug wählt ein Feld, nochmals taucht ein;
            ein gehaltener Abzug trägt das Modell, beide zusammen drehen und skalieren es. Die Greiftaste geht eine Stufe zurück, der
            Thumbstick dreht und hebt, drücken stellt es zurück. Die Knöpfe an den Wänden gehen mit Strahl und Abzug. Auf dem Handy, wo der Browser es kann, beendet der Knopf «Schliessen» oben rechts die Ansicht.</p>
        </Abschnitt>
        <Abschnitt titel="Woher die Daten stammen">
          <ul className="list-disc space-y-1 pl-5">
            <li>Gelände: swissALTIRegio und swissALTI3D, Bundesamt für Landestopografie swisstopo; je tiefer man eintaucht, desto feiner (50 m, 10 m, 5 m, entlang
              der Bahnlinien 2 m).</li>
            <li>Luftbild: SWISSIMAGE (swisstopo), je Kilometer die neueste Aufnahme; was darauf zu sehen ist, zeigt den Stand der Aufnahme, nicht heute.</li>
            <li>Seegrund: swissBATHY3D (swisstopo) für 22 Seen, siehe «Seen und Seetiefe».</li>
            <li>Felsoberfläche unter dem Lockergestein: swissBEDROCK (swisstopo), siehe «Untergrund in den Wänden».</li>
            <li>Ortschaften, Gipfel und Seen der Suche: swissTLMRegio (swisstopo); Orte und Gipfel der Landeskarte 1:1 Million; Kantone: Bundesamt für Statistik BFS.</li>
            <li>Wanderwege: swissTLM3D (swisstopo), alle Wege, die dort als Wanderweg, Bergwanderweg oder Alpinwanderweg eingetragen sind.</li>
            <li>Gebäude: swissBUILDINGS3D 3.0 (swisstopo). Bäume und Wald: swissTLM3D (swisstopo).</li>
            <li>Züge: Fahrplan als GTFS von opentransportdata.swiss, {eigeneSeite ? 'täglich' : 'montags und donnerstags'} neu geladen; Weg zwischen den Halten aus dem
              Netz von Taktland (Linien und Kilometrierung der SBB, Schienennetz des BAV).</li>
            <li>Schiffe: Fahrplan als GTFS von opentransportdata.swiss, {eigeneSeite ? 'täglich' : 'montags und donnerstags'} neu geladen; Kurslinien zwischen den
              Ländten: swissTLMRegio (swisstopo).</li>
            <li>Wind, Regen und Schnee: Messungen von MeteoSchweiz (SwissMetNet, alle 10 Minuten) und deren lokale Prognose, stündlich bis 8 Tage.</li>
            <li>Wolken: Wettermodell ICON-CH1-EPS von MeteoSchweiz (Open Government Data, CC-BY), Kontrolllauf, Bewölkung tief, mittel und hoch, für die nächsten 24 Stunden die Bewölkung in allen 80 Schichten (CLC) mit deren Höhe (HHL), dazu Niederschlagsrate (TOT_PR) und Schneefallgrenze (SNOWLMT), alle 3 Stunden neu.</li>
            <li>Sterne: Hipparcos-Katalog der ESA, aufbereitet von d3-celestial (Olaf Frohn, BSD-Lizenz).</li>
            <li>Sonnenstand und Sternenhimmel: gerechnet nach den Näherungen des Astronomical Almanac.</li>
          </ul>
        </Abschnitt>
        <Abschnitt titel="Was gezeichnet oder angenommen ist">
          <p>Das Modell ist ein Modell, kein Abbild der Wirklichkeit. Was nicht aus einer Quelle stammt, sondern gezeichnet oder angenommen ist:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Sockel, Knöpfe, Masten, Schilder, Windhosen und ihre Grössen; die Windhosen stehen nicht an den Stationen.</li>
            <li>Wolken: ihre Form; ausserhalb der nächsten 24 Stunden auch ihre Dicke und die Höhe jeder Schicht (gewählt nach der Mitte ihres
              Druckbereichs); in der Höhe des Modells sind die Stufen von 250 m und die Deckkraft jeder Ebene gewählt.</li>
            <li>Züge und Schiffe: Länge, Gestalt und Farbe, das gleichmässige Tempo zwischen zwei Halten und der Weg dazwischen, 5 Minuten Stehen am Start- und Endbahnhof, und dass jeder Zug links neben dem Weg fährt,
              damit Züge in Gegenrichtung aneinander vorbeifahren (welches Gleis er nimmt, steht nicht in den Daten).</li>
            <li>Ein Feld ist ein Quadrat, keine Region und kein Tal: Deren Grenzen stehen in keiner Quelle.</li>
            <li>Wände der Gebäude grau, Fenster, Stockwerke und wie viele Fenster nachts brennen.</li>
            <li>Strassen- und Bahnhofslicht mit den Gebäuden: die Lampen und ihre Masten sind erfunden, keine Quelle kennt sie. Belegt ist nur, wo Strassen, Gleise,
              Siedlungen und Bahnhöfe liegen (swissTLM3D, swissTLMRegio); Abstand, Farbe, Helligkeit, Höhe und Stellung der Masten sind gewählt. Ebenso die
              Innenbeleuchtung der Züge, ihre zwei Stirnlampen und deren Lichtkegel.</li>
            <li>Höhe und Form der Bäume, ihr Abstand im Wald, und ob Laub- oder Nadelbaum: nach der Höhe über Meer, nicht gemessen.</li>
            <li>Bewölkung, Regen und Schnee aus Sonnenschein, Niederschlag und Temperatur der Station, wo das Wettermodell fehlt; Dichte, Tempo und Grösse
              der Tropfen und Flocken; dass sie an der untersten gezeichneten Wolke beginnen; Regen- und Windgeräusch gerechnet.</li>
            <li>Farben der Höhenlinien, der Wanderwege, des Wassers im Schnitt, des Lockergesteins in den Wänden und des Himmels in Dämmerung und Nacht.</li>
            <li>Die Tiefe des Sockels: Er reicht bis etwas unter den tiefsten Punkt der Oberfläche, bei Seen unter ihren Spiegel; die Knöpfe sitzen in diesem Band, auch dort, wo ein See im Schnitt liegt; was unter dem Fels liegt, steht in keiner unserer Quellen.</li>
            <li>Schatten wirft nur, was im Modell liegt; Berge ausserhalb, Wolken und Dunst fehlen.</li>
          </ul>
        </Abschnitt>
        {/* wie 3D-Land entstanden ist, für Leute ohne Erfahrung mit Programmieren per Gespräch (Michael, 2026-10-25: «damit sich
            jemand, der nichts mit Vibe-Coding macht, vorstellen kann, wie 3D-Land sich Schritt für Schritt aufgebaut und entwickelt hat») */}
        <Abschnitt titel={eigeneSeite ? 'Über 3D-Land' : 'Über 3D Schweiz'}>
          {/* in der Ich-Form, unterschrieben (Michael, 2026-10-29: «wie die Produktion und Entwicklung und die Idee gewesen ist», «Erwähne aber
              auch, dass Diverses eben doch erfunden ist»), derselbe Text für LinkedIn */}
          <p>Eigentlich wollte ich nur die Schweiz in 3D sehen. Daraus ist 3D-Land geworden. Angefangen hat es am 18. Oktober 2026 als Spiel
            «3D Schweiz» in Taktland, seit dem 21. Oktober gibt es dafür eine eigene Seite: 3dland.ch.</p>
          <p className="mt-2">Ich kann nicht programmieren, keine einzige Zeile. 3D-Land ist im Gespräch entstanden. Ich habe beschrieben, was ich
            sehen möchte, und Claude, eine künstliche Intelligenz von Anthropic, hat den Code geschrieben. Claude hat auch die offenen Daten von
            swisstopo, MeteoSchweiz und dem öffentlichen Verkehr gesucht und aufbereitet. Schritt für Schritt kam dazu: Stufe um Stufe bis
            hinunter auf einen Kilometer, Sonne und Schatten, Gebäude und Bäume, Wanderwege, Wetter mit Windhosen, Regen und Wolken aus dem
            Wettermodell, der Sternenhimmel, die Tiefe der Seen, Züge und Schiffe nach Fahrplan und die VR-Brille.</p>
          <p className="mt-2">Meine Rolle: Ideen haben, ausprobieren, Fehler finden und entscheiden. Fehler gab es reichlich. Der Seegrund fiel am
            Ufer senkrecht bis auf den Sockel ab, in Bern ragten die Züge über die Dächer, und in der Brille drehte sich die ganze Landschaft mit
            meinem Kopf. Den Himmel habe ich mehr als einmal heller, dunkler und wieder heller bestellt. So ist 3D-Land in vielen kleinen Runden
            gewachsen: ein Wunsch, ein Versuch, ein Blick darauf, eine Korrektur.</p>
          <p className="mt-2">Wichtig war mir, dass die Daten echt sind. Gelände, Luftbild, Gebäude, Seetiefen, Wetter und Fahrplan stammen aus
            genannten Quellen. Erfunden ist dagegen vieles am Aussehen: die Farben des Himmels, die Form der Züge und Schiffe, wie viele Fenster
            abends brennen und wie hell, die Lichtkegel der Züge, Form und Dicke der Wolken, ob ein Baum ein Laub- oder ein Nadelbaum ist. Das
            habe ich gewählt, damit es stimmig aussieht, und auf der Seite steht es unter «Was gezeichnet oder angenommen ist».</p>
          <p className="mt-2">Ohne künstliche Intelligenz gäbe es 3D-Land nicht, jedenfalls nicht von mir. Die Bildmarke und das Auftaktbild habe
            ich mit ChatGPT gestaltet.</p>
          <p className="mt-3 font-medium">Michael Veikko Seiler</p>
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
/** so stark leuchtet die Schrift eines ausgeschalteten Knopfs von selbst (gewählt) */
const SCHRIFT_LEUCHTET = 0.85
/** der Himmel ganz in der Nacht und die Grösse der hellsten Sterne in Bildpunkten (gewählt) */
const HIMMEL_NACHT = new THREE.Color('#070d1a'), HIMMEL_NACHT_OBEN = new THREE.Color('#02050b')
/** der Himmel am Tag unten und oben, hell und im Dunkelmodus des Geräts; mit «Sonne» an gilt am Tag immer der helle, wie draussen
 *  (Michael, 2026-10-29: «Warum so dunkler Himmel?» um 10:15 Uhr im Dunkelmodus) */
const HIMMEL_HELL = ['#f2f8fd', '#74a9dd'], HIMMEL_DUNKEL = ['#0d1b2a', '#050c16']
/** ob das Gerät gerade im Dunkelmodus ist; folgt dem Wechsel (er geschah vorher nur beim Öffnen, danach blieb der Himmel wie er war) */
function useGeraetDunkel() {
  const [dunkel, setDunkel] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)'), f = () => setDunkel(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return dunkel
}
const KNOPF_DRAUSSEN = 0.011, KNOPF_DRIN = 0.003, KNOPF_FLACH = 0.0015
// Sonne orange (Michael, 2026-10-25: «Der Knopf Sonne soll orangefarben sein»; vorher rot)
// Gebäude gräulich statt grün wie die Bäume (Michael, 2026-10-28: «Den Knopf Gebäude gräulich machen»), Farbe gewählt
/** Breite der Knöpfe rechts an der Wand, je Anteil der Breite des Modells (gewählt) */
const KNOPF_B = 0.075
const LICHT = { gelaende: '#ffd23c', umwelt: '#4cd964', gebaeude: '#c4c8cc', sonne: '#ff9a1f', wind: '#5ab4ff', zuege: '#ff4d6d', schiffe: '#2ee6d6', wolken: '#ffffff' }
/** Schattenkarte in der Brille: 2048 statt 4096 Bildpunkte, ein Viertel des Speichers (eine Annahme zur Grafik der Brille, nicht gemessen) */
const BRILLE_SCHATTEN_PX = 2048
/** ein Zug so lang, eine Annahme fürs Bild (die Länge eines Zugs steht nicht im Fahrplan); höchstens so viele zugleich */
const ZUG_LAENGE_KM = 0.2, ZUEGE_HOECHSTENS = 600
/** so viele Schiffe höchstens im Modell, und aus der Ferne mindestens so lang wie dieser Anteil des Abstands der Kamera (gewählt) */
const SCHIFFE_HOECHSTENS = 200, SCHIFF_FERN = 0.02
/** auf diesen Höhen über Meer liegen die drei Schichten tief, mittel und hoch; die Quelle nennt nur ihre Druckbereiche (800 hPa bis Boden,
 *  400 bis 800, unter 400), die Höhen sind gewählt, etwa nach der Standardatmosphäre (800 hPa gut 1'900 m, 600 hPa gut 4'200 m, 300 hPa gut 9'000 m) */
const WOLKEN_HOEHE_M = [1500, 4200, 9000]
/** so gross sind die gezeichneten Wolken je Schicht etwa, in km (gewählt, nicht aus der Quelle) */
const WOLKEN_KORN_KM = [3, 6, 12]

/** fester Zufall je Gitterpunkt, für das gezeichnete Muster der Wolken */
function wolkenZufall(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
/** Rauschen aus mehreren Lagen, 0 bis 1, an einer Stelle in km; überall dasselbe, damit die Wolken beim Eintauchen gleich bleiben */
function wolkenMuster(xKm: number, yKm: number, kornKm: number, s: number) {
  let summe = 0, gewicht = 0, f = 1 / kornKm, g = 1
  for (let o = 0; o < 4; o++) {
    const x = xKm * f, y = yKm * f, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
    const a = wolkenZufall(x0, y0, s + o), bb = wolkenZufall(x0 + 1, y0, s + o), c = wolkenZufall(x0, y0 + 1, s + o), d = wolkenZufall(x0 + 1, y0 + 1, s + o)
    summe += g * ((a * (1 - sx) + bb * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy)
    gewicht += g; g *= 0.5; f *= 2
  }
  return summe / gewicht
}
/** das Muster gleichmässig verteilt (0 bis 1 nach seinem Rang unter 4'000 Proben), damit «deckend über 1 − Anteil» wirklich etwa
 *  diesen Anteil der Fläche deckt; je Schicht einmal gerechnet */
const musterRang: Array<Float32Array | null> = [null, null, null]
function gleichmaessig(m: number, schicht: number) {
  let r = musterRang[schicht]
  if (!r) {
    r = new Float32Array(4000)
    for (let i = 0; i < r.length; i++) r[i] = wolkenMuster(wolkenZufall(i, 1, 99) * 997, wolkenZufall(i, 2, 99) * 997, WOLKEN_KORN_KM[schicht], schicht * 7)
    r.sort(); musterRang[schicht] = r
  }
  let lo = 0, hi = r.length
  while (lo < hi) { const mi = (lo + hi) >> 1; if (r[mi] < m) lo = mi + 1; else hi = mi }
  return lo / r.length
}
/** das Bild einer Schicht über dem Rechteck: so viel Fläche deckend, wie die Prognose Bewölkung nennt; das Muster ist gezeichnet */
function wolkenBild(w: Wolken, stunde: number, schicht: number, e0: number, n0: number, e1: number, n1: number) {
  const breit = Math.min(1024, Math.max(128, Math.round(((e1 - e0) / w.ix.schritt_m) * 12)))
  const hoch = Math.max(16, Math.round((breit * (n1 - n0)) / (e1 - e0)))
  const c = document.createElement('canvas'); c.width = breit; c.height = hoch
  const x = c.getContext('2d')!, bild = x.createImageData(breit, hoch)
  let etwas = false
  for (let py = 0; py < hoch; py++) {
    const n = n1 - ((py + 0.5) / hoch) * (n1 - n0)
    for (let px = 0; px < breit; px++) {
      const e = e0 + ((px + 0.5) / breit) * (e1 - e0)
      const anteil = bewoelkung(w, stunde, schicht, e, n)
      if (anteil === null || anteil <= 0.02) continue
      // deckend, wo das Muster über 1 − Anteil liegt: so deckt die Schicht etwa den Anteil der Fläche, den die Prognose nennt
      const m = gleichmaessig(wolkenMuster(e / 1000, n / 1000, WOLKEN_KORN_KM[schicht], schicht * 7), schicht)
      const a = Math.max(0, Math.min(1, (m - (1 - anteil)) / 0.08 + 0.5))
      if (a <= 0) continue
      const i = (py * breit + px) * 4
      bild.data[i] = 250; bild.data[i + 1] = 251; bild.data[i + 2] = 253; bild.data[i + 3] = Math.round(a * 235)
      etwas = true
    }
  }
  if (!etwas) return null
  x.putImageData(bild, 0, 0)
  return c
}
/** Wolken in echter Höhe: so viele Ebenen höchstens (bei mehr Stufen mit Wolken je zwei oder mehr zusammen), Bildpunkte höchstens,
 *  Deckkraft einer Ebene (sie liegen übereinander); gewählt */
const WOLKEN3D_EBENEN = 24, WOLKEN3D_PX = 512, WOLKEN3D_DECKT = 200
/** das Muster in echter Höhe: zwei Rauschfelder (Körnung in km, gewählt), je Stufe anders gemischt, damit eine Wolke nach oben ihre Form
 *  ändert, aber zusammenhängt */
const WOLKEN3D_KORN_KM = [4, 2.5]
/** die Bilder der Ebenen mit Wolken über dem Rechteck aus den Wolken in echter Höhe (Stunde j); Höhe der Ebene über Meer in m */
function wolkenEbenen3d(w: Wolken, j: number, e0: number, n0: number, e1: number, n1: number) {
  const z = w.ix.wolken3d!
  const breit = Math.min(WOLKEN3D_PX, Math.max(128, Math.round(((e1 - e0) / w.ix.schritt_m) * 12)))
  const hoch = Math.max(16, Math.round((breit * (n1 - n0)) / (e1 - e0)))
  // je Stufe, ob und wie viel Wolke über dem Rechteck liegt (grob abgetastet)
  const mit: number[] = []
  for (let k = 0; k < z.stufen; k++) {
    let max = 0
    for (let a = 0; a <= 12 && max < 0.03; a++) for (let c = 0; c <= 12; c++) {
      const v = bewoelkung3d(w, j, k, e0 + (a / 12) * (e1 - e0), n0 + (c / 12) * (n1 - n0)) ?? 0
      if (v > max) max = v
    }
    if (max >= 0.03) mit.push(k)
  }
  if (!mit.length) return []
  // die beiden Rauschfelder, gleichmässig verteilt
  const U1 = new Float32Array(breit * hoch), U2 = new Float32Array(breit * hoch)
  for (let py = 0; py < hoch; py++) {
    const n = n1 - ((py + 0.5) / hoch) * (n1 - n0)
    for (let px = 0; px < breit; px++) {
      const e = e0 + ((px + 0.5) / breit) * (e1 - e0), q = py * breit + px
      U1[q] = gleichmaessig(wolkenMuster(e / 1000, n / 1000, WOLKEN3D_KORN_KM[0], 101), 0)
      U2[q] = gleichmaessig(wolkenMuster(e / 1000, n / 1000, WOLKEN3D_KORN_KM[1], 202), 1)
    }
  }
  const schritt = Math.ceil(mit.length / WOLKEN3D_EBENEN)
  const raus: Array<{ hoeheM: number; bild: HTMLCanvasElement }> = []
  for (let g = 0; g < mit.length; g += schritt) {
    const gruppe = mit.slice(g, g + schritt)
    const t = 0.5 + 0.5 * Math.sin(gruppe[0] * 0.45)
    // die Mischung wieder gleichmässig verteilen, nach dem Rang unter 2'000 Proben
    const probe = new Float32Array(2000)
    for (let i = 0; i < probe.length; i++) { const q = Math.floor((i / probe.length) * U1.length); probe[i] = U1[q] * (1 - t) + U2[q] * t }
    probe.sort()
    const rang = (m: number) => { let lo = 0, hi = probe.length; while (lo < hi) { const mi = (lo + hi) >> 1; if (probe[mi] < m) lo = mi + 1; else hi = mi } return lo / probe.length }
    const c = document.createElement('canvas'); c.width = breit; c.height = hoch
    const x = c.getContext('2d')!, bild = x.createImageData(breit, hoch)
    let etwas = false
    for (let py = 0; py < hoch; py++) {
      const n = n1 - ((py + 0.5) / hoch) * (n1 - n0)
      for (let px = 0; px < breit; px++) {
        const e = e0 + ((px + 0.5) / breit) * (e1 - e0)
        let anteil = 0
        for (const k of gruppe) anteil = Math.max(anteil, bewoelkung3d(w, j, k, e, n) ?? 0)
        if (anteil <= 0.02) continue
        const q = py * breit + px, m = rang(U1[q] * (1 - t) + U2[q] * t)
        const a = Math.max(0, Math.min(1, (m - (1 - anteil)) / 0.08 + 0.5))
        if (a <= 0) continue
        const i = q * 4
        bild.data[i] = 250; bild.data[i + 1] = 251; bild.data[i + 2] = 253; bild.data[i + 3] = Math.round(a * WOLKEN3D_DECKT)
        etwas = true
      }
    }
    if (!etwas) continue
    x.putImageData(bild, 0, 0)
    const mitteK = (gruppe[0] + gruppe[gruppe.length - 1]) / 2
    raus.push({ hoeheM: z.unten_m + (mitteK + 0.5) * z.schritt_m, bild: c })
  }
  return raus
}
/** aus der Ferne ist ein Zug mindestens so lang wie dieser Anteil des Abstands der Kamera (vorher 1,2 %, Michael, 2026-10-26: «Züge aus der Ferne etwas grösser»), gewählt */
const ZUG_FERN = 0.018
/** so viel der Grösse haben die Züge in den Feldern von 4 km und 1 km (Michael, 2026-10-28: «ungefähr 60%»), gewählt */
const ZUG_NAH_MASS = 0.6
/** über so viele Meter des Zugs (in seiner Grösse im Modell) wird die Höhe unter ihm gemittelt, gewählt */
const ZUG_GLATT_M = 300
/** so viele Zugbreiten liegt die Mitte eines Zugs links neben dem Weg: zwei Züge in Gegenrichtung fahren nebeneinander, wie bei Linksverkehr
 *  auf zwei Gleisen (Michael, 2026-10-26: «aneinander vorbeifahren und nicht … durcheinander»); welches Gleis, steht in keiner unserer Quellen, gewählt */
const ZUG_LINKS = 0.7
/** die App von Taktland, auf deren Bahnhofseiten das Zugschild verweist */
const TAKTLAND_APP = 'https://taktland.ch/app/'
/** auf 3dland.ch (auch in dessen Testfassung) führt der Link des Zugs zu taktland.ch, in Taktland selbst auf die Seite des Bahnhofs */
const AUF_3DLAND = /3dland/.test(window.location.hostname) || /3dland\.html$/.test(window.location.pathname)
/** so weit neben einem Wagen (Winkel vom Auge) trifft ein Tipp den Zug noch, 2,5°, gewählt */
const ZUG_TIPP_WINKEL = (2.5 * Math.PI) / 180
/** in der Brille, wo der Strahl mit der Hand zittert, 4°, gewählt */
const ZUG_TIPP_WINKEL_BRILLE = (4 * Math.PI) / 180
/** so leuchtet ein Zug unter dem Strahl, gelblich wie die eingeschalteten Knöpfe (Faktor je Farbe, über 1 hellt auf), gewählt */
const ZUG_ZIEL_HELL: [number, number, number] = [1.5, 1.25, 0.45]
/** so stark neigt sich ein Wagen höchstens, 6° (wie in der Modellbahn ZUG_NEIGUNG_MAX, dort 4°), gewählt */
const ZUG_NEIGUNG = (6 * Math.PI) / 180
/** nachts, wenn in den Gebäuden Licht brennt (fensterNacht), leuchten die Züge (Michael, 2026-10-29: «sollen auch die fahrenden Züge eine
 *  Innenbeleuchtung aufweisen, sowie die Stirnlichter sollen auf die Strecke leuchten. Nur dezent, aber sichtbar»): das Fensterband warm von
 *  innen und vor der Lok ein Lichtkegel auf dem Boden, dreimal so lang wie die Lok und vorne viermal so breit wie der Zug; Farben und Stärke
 *  gewählt, in keiner Quelle */
const ZUG_INNEN_FARBE = '#ffd49a', ZUG_INNEN_HELL = 0.75
const ZUG_STIRN_FARBE = '#fff1d6', ZUG_STIRN_HELL = 0.6, ZUG_STIRN_LAENGE = 3, ZUG_STIRN_BREITE = 4
/** Strassen- und Bahnhofslicht: Radius des Lichtflecks auf dem Boden (m), Farben und Stärke gewählt, in keiner Quelle (die Lampen sind
 *  erfunden, belegt ist nur, wo Strassen und Gleise liegen); höchstens so viele Lampen in einem Modell (eine Annahme zur Grafik) */
/** (Michael, 2026-10-29: «Lichtkegel etwas breiter und etwas weniger hell»; vorher 11 m, 16 m und 0,55) */
const LICHT_STRASSE_M = 14, LICHT_BAHNHOF_M = 20, LICHT_STRASSE_FARBE = '#ffc98a', LICHT_BAHNHOF_FARBE = '#eef3ff', LICHT_HELL = 0.4
/** am Bahnhof liegen die Lampen über vielen Gleisen nebeneinander und addieren sich: dort schwächer (Bern war ein weisser Fleck; Michael,
 *  2026-10-29, Thun: «Die Lichtkegel bei den Bahnhöfen 15% weniger hell», vorher 0,6) */
const LICHT_BAHNHOF_STAERKE = 0.51
const LICHT_HOECHSTENS = 60_000
/** je Lampe ein schlichter Mast am Ort der Lampe (Michael, 2026-10-29: «Kann man bei den Lichtkegel doch noch einen Masten am Strassenrand
 *  einfügen? Nur was ganz simples?»): ein dunkelgrauer Pfosten mit einem Kopf, der nachts leuchtet; Höhe und Dicke gewählt, in keiner
 *  Quelle; die Lage ist die erfundene Lampe auf der Achse der Strasse oder des Gleises, um den halben Abstand zum Rand versetzt
 *  (LICHT_RAND_M, gewählt, die Breite der Strasse kennt die Datei nicht) */
const LICHT_MAST_M = { strasse: 8, bahnhof: 10 }, LICHT_MAST_DICKE_M = 0.25, LICHT_RAND_M = 3, LICHT_MAST_FARBE = '#3a3a3a'
/** ein Lichtfleck: in der Mitte hell, nach aussen weich */
function lichtBild() {
  const c = document.createElement('canvas'), x = c.getContext('2d')!
  c.width = c.height = 64
  const v = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.15, 'rgba(255,255,255,0.8)'); v.addColorStop(0.5, 'rgba(255,255,255,0.25)')
  v.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = v; x.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
/** zwei Stirnlampen vorne unten an der Lok, links und rechts, immer an wie bei echten Zügen und dem Vorbild (Michael, 2026-10-29:
 *  «Bitte zwei Lichter machen ähnlich wie bei diesem Modell», sein Bild eines Zugs mit zwei Lampen unten an der Front): je Lampe ein
 *  heller Punkt und nachts ein eigener Lichtkegel; Lage und Grösse als Anteil von Breite und Höhe des Zugs, gewählt */
const ZUG_LAMPE_SEITE = 0.28, ZUG_LAMPE_HOEHE = -0.21, ZUG_LAMPE_R = 0.07, ZUG_LAMPE_FARBE = '#fffaf0'
/** der Lichtkegel als Bild: hell an der Lok, nach vorne breiter und schwächer */
function stirnBild() {
  const c = document.createElement('canvas'), x = c.getContext('2d')!
  c.width = 64; c.height = 128
  const d = x.createImageData(c.width, c.height)
  for (let j = 0; j < c.height; j++) {
    const t = j / (c.height - 1), breit = 0.18 + 0.82 * t
    for (let i = 0; i < c.width; i++) {
      const u = (i / (c.width - 1)) * 2 - 1, a = Math.pow(1 - t, 1.4) * Math.exp(-((u / breit) ** 2) * 3)
      const o = (j * c.width + i) * 4
      d.data[o] = d.data[o + 1] = d.data[o + 2] = 255; d.data[o + 3] = Math.round(255 * Math.min(1, a * 1.3))
    }
  }
  x.putImageData(d, 0, 0)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
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
 *  hier als Linie in der Farbe, ohne weissen Rand (Michael, 2026-10-24: «Wanderwege brauchen keine weisse Umrahmungen mehr»);
 *  Breite in Bildpunkten */
const WANDER_FARBEN: Record<number, string> = { 1: '#e6a800', 2: '#d0102b', 3: '#1f5fd6' }
const WANDER_NAMEN: Array<[number, string]> = [[1, 'Wanderweg'], [2, 'Bergwanderweg'], [3, 'Alpinwanderweg']]
const WANDER_PX = 1.4
/** Ortschaften: Mast als Anteil der Breite des Modells, ab welchem Rang und wie viele je Stück, Farbe wie die Bahnhöfe der
 *  Modellbahn (BAHNHOF_GRAU in Relief.tsx); Auswahl und Masse gewählt, nicht aus einer Quelle */
const ORT_MAST = 0.035, ORT_GRAU = '#2a2a2a'
/** alle Schilder mit leicht abgerundeten Ecken, in Bildpunkten des Schildbilds (Michael, 2026-10-25: «Alle Schilder leicht abgerundete Ecken») */
const SCHILD_RUND_PX = 6
/** Breite des Masts in Bildpunkten (Michael, 2026-10-21: «leicht dicker»; vorher 1) */
const ORT_MAST_PX = 2
/** der Mast so dunkelgrau wie das Schild, ohne Rand (Michael, 2026-10-29: «Die Masten sind zu dick und sollen gleichfarbig wie die Tafel
 *  sein»; vorher kurz mit einem hellen Rand von 4 Bildpunkten, damit man sie vor dunklem Hintergrund sieht) */
function mastMitRand(geo: LineSegmentsGeometry, kern: LineMaterial) {
  const mast = new LineSegments2(geo, kern)
  mast.renderOrder = 2
  return mast
}
/** welche Orte bereitstehen (ab Rang, höchstens so viele, Abstand als Anteil der Breite); gezeigt werden davon nur die im Bild,
 *  mindestens ORT_MIN und höchstens ORT_MAX (Michael, 2026-10-25: «Immer mindestens 3, wenn vorhanden, und maximal 5. Wenn man
 *  einzoomt und wegzoomt, muss diese Zahl 3 bis 5 … berücksichtigt werden») */
const ORT_AB_RANG: Record<Stufe, number> = { schweiz: 4, gross: 2, region: 1, ort: 0, nah: 0 }
const ORT_ANZAHL: Record<Stufe, number> = { schweiz: 200, gross: 250, region: 300, ort: 200, nah: 60 }, ORT_ABSTAND = 0.012
const ORT_MIN = 3, ORT_MAX = 5
// das Wasser im Schnitt der Wände: immer etwas dunkler als die Fläche, damit man die Kante klar sieht, nach unten zum Grund hin dunkler,
// am dunkelsten ab WASSER_DUNKEL_M Tiefe (Michael, 2026-10-25: «Die Wasseroberfläche muss immer mindestens so hell sein wie die
// Schnittkante … gegen unten zum Grund her leicht dunkler»); im selben Licht wie die Fläche (Normale nach oben), Farben gewählt, nicht gemessen
const WASSER_SCHNITT_OBEN = '#3478a6', WASSER_SCHNITT_MITTE = '#285f86', WASSER_SCHNITT_UNTEN = '#1a4464', WASSER_DUNKEL_M = 120
// Anteile der Tiefe für die Punkte einer Säule im Schnitt, oben dichter
const WASSER_SCHNITT_STUFEN = [0, 0.04, 0.1, 0.2, 0.35, 0.55, 0.8, 1]
/** das Lockergestein über dem Fels im Schnitt der Wände (swissBEDROCK): Farbe gewählt, der Fels bleibt die dunkle Wand */
const LOCKER_FARBE = '#8a6e48'
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
function Ansicht({ b, stufe, wahl, waehlen, abwaehlen, eintauchen, zurueck, info, brilleRef, zusatz, knoepfe, erweitern, scheiben, orte, gipfel, gebaeude, baeume, umweltHier, meldung, wandern, zuege, zuegeDa, schiffe, wolken, sonnenAn, schalten, sonne: stand, sonnenZeilen, jetztAn, zeitSchieben, standort, windAn, windWerte, windOrte, nieder, niederModell }: {
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
  /** Sonnenstand zur gewählten Zeit über dem Ort (für die Sterne), null: die feste Sonne wie bisher, ohne Schatten */
  sonne: (Sonnenstand & { zeit: Date; la: number; lo: number }) | null
  /** was der Schalter der Sonne in der Brille zur Zeit sagt, und wie die Brille die Zeit verschiebt */
  sonnenZeilen: string[] | null
  /** «Jetzt» gedrückt: die Zeit ist die jetzige */
  jetztAn: boolean
  zeitSchieben: (art: 'stunde' | 'tag' | 'jetzt', um: number) => void
  /** Wanderwege zeigen (in den Stufen 20 km, 4 km und 1 km) */
  wandern: boolean
  /** Züge laut Fahrplan zeigen (ab der Stufe 20 km), zuegeDa: der Knopf dazu */
  zuege: boolean; zuegeDa: boolean
  /** Schiffe laut Fahrplan zeigen (ab der Stufe 20 km) */
  schiffe: boolean
  /** die Wolken laut Wettermodell, ein eigener Knopf */
  wolken: boolean
  /** Gebäude und Bäume gibt es hier */
  umweltHier: boolean
  /** die Sonne mit Zeit ist an; ein Schalter um, in der Brille an den Wänden */
  sonnenAn: boolean; schalten: (art: Schalter) => void
  /** die Windhose: an, was sie zeigt, wo die Station steht */
  windAn: boolean; windWerte: Array<{ wind: Wind | null; name: string | null }>; windOrte: (punkte: Array<{ e: number; n: number }>) => void
  /** Regen oder Schnee zur gewählten Stunde, null: nichts fällt */
  nieder: { art: 'regen' | 'schnee'; staerke: number } | null
  /** was laut Wettermodell über dem Modell fällt (fürs Geräusch), undefined ohne dessen Daten */
  niederModell: (x: { art: 'regen' | 'schnee'; staerke: number } | null | undefined) => void
  /** der eigene Standort per GPS in LV95, null: aus */
  standort: { e: number; n: number } | null
}) {
  const huelle = useRef<HTMLDivElement>(null)
  const [grafikWeg, setGrafikWeg] = useState(false)
  const welt = useRef<Welt | null>(null)
  const kern = useRef<{
    renderer: THREE.WebGLRenderer; szene: THREE.Scene; kamera: THREE.PerspectiveCamera; steuerung: OrbitControls
    wurzel: THREE.Group; inBrille: () => boolean; setzeHimmel: () => void; himmel: THREE.Color; himmelTag: THREE.Color; himmelOben: THREE.Color; himmelObenTag: THREE.Color
    himmelMalen: () => void
    sterne: Sternenhimmel
    jeBild: Array<() => void>; wenn: { tipp: ((p: THREE.Vector3) => void) | null; zurueck: () => void }
    tafel: THREE.Sprite; tafelSetzen: (zeilen: string[] | null, ueber?: THREE.Vector3) => void
    sonne: THREE.DirectionalLight; himmelLicht: THREE.HemisphereLight
    anfangSetzen: () => void
    verlauf: Record<'hoehen' | 'orte' | 'gipfel', { p: number; ziel: number; ebene: THREE.Plane }>
  } | null>(null)
  const [tablet] = useState(istTablet)
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
    // der Himmel; mit der Sonne unter dem Horizont dunkler, dazu die Sterne (Effekt zum Sonnenstand)
    const himmelTag = new THREE.Color(dunkel ? '#0d1b2a' : '#f2f8fd'), himmel = himmelTag.clone()
    // gegen oben dunkler (Michael, 2026-10-25: «Himmel gegen oben dunkler», dann «unten noch heller und oben kräftigeres Blau», dann «heller oben und unten»): ein Verlauf über das Bild vom Ton unten bis zu diesem
    // oben, als Bild hinter dem Modell, nicht nach der Blickrichtung; Farben gewählt
    const himmelObenTag = new THREE.Color(dunkel ? '#050c16' : '#74a9dd'), himmelOben = himmelObenTag.clone()
    const himmelBild = document.createElement('canvas')
    himmelBild.width = 2; himmelBild.height = 256
    const himmelTextur = new THREE.CanvasTexture(himmelBild)
    himmelTextur.colorSpace = THREE.SRGBColorSpace
    const himmelMalen = () => {
      const x = himmelBild.getContext('2d')!, v = x.createLinearGradient(0, 0, 0, himmelBild.height)
      v.addColorStop(0, `#${himmelOben.getHexString(THREE.SRGBColorSpace)}`)
      v.addColorStop(1, `#${himmel.getHexString(THREE.SRGBColorSpace)}`)
      x.fillStyle = v; x.fillRect(0, 0, himmelBild.width, himmelBild.height)
      himmelTextur.needsUpdate = true
    }
    himmelMalen()
    let durchsicht = false
    const sterne = sternenhimmelBauen()
    szene.add(sterne.punkte)
    const setzeHimmel = () => {
      szene.background = renderer.xr.isPresenting && durchsicht ? null : himmelTextur
    }
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
      // ein Zug: sein Schild (nur 3dland.ch); sonst verschwindet ein offenes Schild. Ein Zug vor einem Knopf geht vor (in der Brille
      // fährt er oft am Rand, vor der Wand mit den Knöpfen; Michael, 2026-10-26: «dass man den Zug ganz einfach anstrahlen kann»)
      // Schiffe wie Züge (Michael, 2026-10-28); der nähere Treffer gilt, die andere Art verliert ihr Schild
      const fahrzeuge = ['zuege', 'schiffe'].map((n) => wurzel.getObjectByName(n)).filter((g): g is THREE.Object3D => !!g?.visible)
      if (fahrzeuge.length) {
        const abwahl = (ausser?: THREE.Object3D) => { for (const g of fahrzeuge) if (g !== ausser) (g.userData.abwahl as (() => void) | undefined)?.() }
        let best: { g: THREE.Object3D; z: THREE.Intersection } | null = null
        for (const g of fahrzeuge) {
          const netze = g.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh)
          // sie fahren: die Kugel um alle Instanzen jedes Mal neu, sonst trifft der Strahl die alte
          for (const n of netze) n.computeBoundingSphere()
          const z = strahl.intersectObjects(netze, false)[0]
          if (z && z.instanceId !== undefined && (!best || z.distance < best.z.distance)) best = { g, z }
        }
        const wahl = best?.g.userData.wahl as ((netz: THREE.Object3D, i: number) => boolean) | undefined
        if (best && (!knopf || best.z.distance < knopf.distance) && wahl?.(best.z.object, best.z.instanceId!)) { abwahl(best.g); return }
        if (!knopf) {
          // knapp daneben gilt auch: der Zug, dessen Wagen dem Strahl am nächsten liegt, bis ZUG_TIPP_WINKEL, in der Brille weiter
          // (die Hand zittert; Michael, 2026-10-26: «Man kann den Zug schwierig antippen ohne dass es einen neuen roten Kasten … gibt»)
          for (const g of fahrzeuge) {
            const nahe = g.userData.nahe as ((r: THREE.Ray, winkel: number) => boolean) | undefined
            if (nahe?.(strahl.ray, renderer.xr.isPresenting ? ZUG_TIPP_WINKEL_BRILLE : ZUG_TIPP_WINKEL)) { abwahl(g); return }
          }
          abwahl()
        }
      }
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
    const sprites = () => ['schilder', 'knoepfe', 'standort', 'hoehen', 'zuege', 'schiffe'].flatMap((n) => (wurzel.getObjectByName(n)?.children ?? [])
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
      // auf dem Handy gibt es keine Tasten der Brille: ein Knopf «Schliessen» über dem Bild (Michael, 2026-10-25: «Wenn ich XR auf dem
      // Mobile Device anschaue, habe ich keinen Button, um zurückzukehren»), wo der Browser dom-overlay kann
      const ueber = document.createElement('div')
      ueber.style.cssText = 'position:fixed;inset:0;pointer-events:none'
      const zu = document.createElement('button')
      zu.type = 'button'; zu.textContent = '✕ Schliessen'
      zu.style.cssText = 'position:absolute;top:max(12px,env(safe-area-inset-top));right:12px;pointer-events:auto;padding:10px 16px;' +
        'border:0;border-radius:8px;background:#5a5a5a;color:#fff;font:700 16px Helvetica,Arial,sans-serif'
      ueber.appendChild(zu)
      document.body.appendChild(ueber)
      let sitzung: XRSession
      try {
        sitzung = await xr.requestSession(durchsicht ? 'immersive-ar' : 'immersive-vr',
          { optionalFeatures: ['local-floor', 'hand-tracking', 'dom-overlay'], domOverlay: { root: ueber } } as XRSessionInit)
      } catch (e) { ueber.remove(); throw e }
      zu.addEventListener('click', () => { void sitzung.end() })
      // ein Tipp auf den Knopf gilt nicht zugleich als Tipp ins Modell
      ueber.addEventListener('beforexrselect', (ev) => ev.preventDefault())
      sitzung.addEventListener('end', () => ueber.remove())
      // ohne dom-overlay (Brille) bleibt der Knopf weg
      if (!(sitzung as XRSession & { domOverlayState?: unknown }).domOverlayState) ueber.style.display = 'none'
      renderer.xr.setReferenceSpaceType('local-floor')
      kamera.near = 0.01; kamera.updateProjectionMatrix()
      await renderer.xr.setSession(sitzung)
      inDerBrille = true
      schattenGroesse(BRILLE_SCHATTEN_PX)
      anfangSetzen()
      brilleSetzen(); setzeHimmel()
      tafelSetzen(null)
      // die Tafel mit den Tasten der Brille nur mit Brille; auf dem Handy (Bildschirm als Eingabe) gibt es diese Tasten nicht
      anleitung.visible = sitzung.interactionMode !== 'screen-space'
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
          if (sp.userData.art === name) sp.visible = v.p > 0 && sp.userData.gezeigt !== false && v.ebene.distanceToPoint(sp.getWorldPosition(auf)) >= 0
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
    // die Sterne um das Auge, gedreht wie das Modell (die Himmelsrichtungen gehören zu ihm, wie die Sonne)
    jeBild.push(() => sterne.schritt(renderer.xr.isPresenting ? renderer.xr.getCamera() : kamera, wurzel, !!szene.background))
    kern.current = { renderer, szene, kamera, steuerung, wurzel, inBrille: () => renderer.xr.isPresenting, setzeHimmel, himmel, himmelTag, himmelOben, himmelObenTag, himmelMalen, sterne, jeBild, wenn, tafel, tafelSetzen,
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
      for (const name of ['hoehen', 'wanderwege', 'orte', 'gipfel']) {
        for (const o of wurzel.getObjectByName(name)?.children ?? []) {
          ((o as LineSegments2).material as LineMaterial).resolution?.copy(aufloesung)
          // der helle Rand der Masten hängt am Mast
          for (const c of o.children) ((c as LineSegments2).material as LineMaterial).resolution?.copy(aufloesung)
        }
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
    // die Höhe des Sockels nach der Oberfläche, über Seen nach dem Spiegel, nicht nach dem Grund (Michael, 2026-10-25: «Die Tiefe
    // des Modells soll durch die Seen nicht höher als vorher sein»)
    for (const { g } of teile) {
      for (let q = 0; q < g.h.length; q++) {
        const w = g.wasser?.[q]
        const z = w !== undefined && !Number.isNaN(w) ? Math.max(g.h[q], w) : g.h[q]
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
    const boden = tief - wand * 1000 * 0.98
    // in der Brille steht der Sockel auf dem Tisch
    wurzel.userData.untenY = () => Y(tief) - wand - platte
    if (!renderer.xr.isPresenting) {
      // auch über kleinen Feldern bis zu den hohen Wolken (bis 12 km über Meer)
      kamera.far = Math.max(weite / 1000 * 6, 16); kamera.updateProjectionMatrix()
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
            // ein Seegrund unter dem Boden des Sockels wird dort abgeschnitten
            const q = j * breite + i, z = g.h[q] === KEINE_HOEHE ? tief : Math.max(g.h[q], boden)
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
    // über den Seen keine eigene Wasserfläche: das Gelände mit dem Luftbild ist die Oberfläche wie vor dem Seegrund (Michael, 2026-10-25:
    // die Seeoberflächen «flimmern», «das Bild der Landkarten, das ich haben möchte»); der See zeigt sich im Schnitt der Wände

    // der Sockel, neu bei jeder Höhe; nur an den äusseren Kanten der Stücke
    const sockel = new THREE.Group()
    wurzel.add(sockel)
    // matt, damit die Seiten im Licht verschieden hell sind
    const wandMaterialien = SOCKEL_WAND_FARBEN.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }))
    const platteMaterial = new THREE.MeshStandardMaterial({ color: SOCKEL_PLATTE_FARBE, roughness: 0.5, metalness: 0 })
    // die oberen Kanten der Wände, je mit der Richtung nach aussen (für die Linien der Höhen)
    let kantenOben: Array<{ p: Float32Array; nx: number; nz: number }> = []
    const wandWasserMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.92 })
    const schnittOben = new THREE.Color(WASSER_SCHNITT_OBEN), schnittMitte = new THREE.Color(WASSER_SCHNITT_MITTE), schnittUnten = new THREE.Color(WASSER_SCHNITT_UNTEN)
    const schnittFarbe = new THREE.Color()
    const lockerMaterial = new THREE.MeshLambertMaterial({ color: LOCKER_FARBE, side: THREE.DoubleSide })
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
          // im Schnitt der Wand das Lockergestein: von der Oberfläche (oder dem Seegrund) bis auf den Fels laut swissBEDROCK
          const fe = g.fels
          if (fe) {
            const vor = weiteKm * 0.0005, lp: number[] = [], li: number[] = []
            // über einem See beginnt das Lockergestein am Grund
            const oberkante = (q: number) => { const sg = g.seegrund?.[q]; return sg !== undefined && !Number.isNaN(sg) ? Math.max(unten, Y(sg)) : pos[q * 3 + 1] }
            const hat = (q: number) => !Number.isNaN(fe[q]) && Y(fe[q]) < oberkante(q)
            kante.forEach((q, i) => {
              const x = pos[q * 3] + nx * vor, y = oberkante(q), z = pos[q * 3 + 2] + nz * vor
              lp.push(x, y, z, x, Number.isNaN(fe[q]) ? y : Math.max(unten, Math.min(y, Y(fe[q]))), z)
              if (i && (hat(q) || hat(kante[i - 1])) && !Number.isNaN(fe[q]) && !Number.isNaN(fe[kante[i - 1]])) li.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, i * 2, i * 2 + 1, (i - 1) * 2 + 1)
            })
            if (li.length) {
              const gl = new THREE.BufferGeometry()
              gl.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
              gl.setIndex(li)
              gl.computeVertexNormals()
              sockel.add(new THREE.Mesh(gl, lockerMaterial))
            }
          }
          // im Schnitt der Wand das Wasser eines Sees zwischen Grund und Spiegel, knapp vor der Wand
          const w = g.wasser
          if (w) {
            // je Säule mehrere Punkte vom Spiegel zum Grund, damit es schon in den oberen Metern dunkel wird, nicht erst unten
            const vor = weiteKm * 0.0008, bp: number[] = [], bi: number[] = [], bf: number[] = []
            const n = WASSER_SCHNITT_STUFEN.length
            kante.forEach((q, i) => {
              const x = pos[q * 3] + nx * vor, z = pos[q * 3 + 2] + nz * vor
              // von der Oberfläche bis zum Grund, am Boden des Sockels abgeschnitten
              const sg = g.seegrund?.[q], oben = pos[q * 3 + 1] * 1000
              const spiegel = oben
              const tiefe = sg === undefined || Number.isNaN(sg) ? 0 : Math.max(0, spiegel - Math.max(unten * 1000, sg))
              for (const f of WASSER_SCHNITT_STUFEN) {
                const d = f * tiefe
                bp.push(x, Y(spiegel - d), z)
                const t = Math.min(1, d / WASSER_DUNKEL_M)
                schnittFarbe.copy(schnittOben).lerp(schnittMitte, Math.min(1, t * 4)).lerp(schnittUnten, Math.max(0, (t - 0.25) / 0.75))
                bf.push(schnittFarbe.r, schnittFarbe.g, schnittFarbe.b)
              }
              if (i && !Number.isNaN(w[q]) && !Number.isNaN(w[kante[i - 1]])) {
                for (let r = 0; r < n - 1; r++) {
                  const a0 = (i - 1) * n + r, a1 = a0 + 1, b0 = i * n + r, b1 = b0 + 1
                  // beide Seiten mit der Normalen nach oben (DoubleSide drehte sie von hinten nach unten, der Schnitt wurde schwarz)
                  bi.push(a0, a1, b0, b0, a1, b1, a0, b0, a1, b0, b1, a1)
                }
              }
            })
            if (bi.length) {
              const gb = new THREE.BufferGeometry()
              gb.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3))
              gb.setAttribute('color', new THREE.Float32BufferAttribute(bf, 3))
              // beleuchtet wie die Wasserfläche, so bleibt der Schnitt bei jedem Sonnenstand dunkler als sie
              gb.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(bp.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3))
              gb.setIndex(bi)
              sockel.add(new THREE.Mesh(gb, wandWasserMaterial))
            }
          }
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
    const gipfelMastKm = weiteKm * ORT_MAST
    const gipfelGruppe = new THREE.Group()
    gipfelGruppe.name = 'gipfel'
    wurzel.add(gipfelGruppe)
    const gipfelMast = new LineMaterial({ color: ORT_GRAU, linewidth: ORT_MAST_PX, clippingPlanes: [k.verlauf.gipfel.ebene] })
    // Gipfel mit demselben eckigen Schild wie die Orte, nur umgekehrt: weiss mit dunkelgrauer Schrift (Michael, 2026-10-25: «Gipfel
    // sollen gleiche Schilder haben wie Orte nur invertiert»)
    const schild = (text: string, e: number, n: number, z: number) => {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      const px = 26, schrift = `normal ${px}px Helvetica, Arial, sans-serif`
      x.font = schrift
      c.width = Math.ceil(x.measureText(text).width) + 18; c.height = px + 14
      x.font = schrift
      x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(0, 0, c.width, c.height, SCHILD_RUND_PX); x.fill()
      x.fillStyle = ORT_GRAU; x.fillText(text, 9, px + 1)
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false }))
      sp.visible = false
      sp.userData = { art: 'gipfel', e, n, z, b: c.width * 0.00085, h: c.height * 0.00085, verhaeltnis: c.width / c.height }
      sp.scale.set(sp.userData.b, sp.userData.h, 1)
      sp.center.set(0.5, 0)
      sp.position.set(X(e), Y(z), Z(n))
      // auf einem Mast wie die Orte (Michael, 2026-10-25: «Auch Mast»)
      sp.position.y += gipfelMastKm
      sp.renderOrder = 3
      schilder.add(sp)
      const geo = new LineSegmentsGeometry()
      geo.setPositions([X(e), Y(z), Z(n), X(e), Y(z) + gipfelMastKm, Z(n)])
      gipfelGruppe.add(mastMitRand(geo, gipfelMast))
    }
    const drin = (e: number, n: number) => [...b.teile.values()].some((t) => imRaster(t.raster, e, n))
    if (zusatz) {
      const gipfel = zusatz.sw.gipfel.filter((x) => x.hoehe_m !== null).map((x) => ({ x, l: lv95(x.lage[0], x.lage[1]) }))
        .filter(({ l }) => drin(l[0], l[1])).sort((a, c) => c.x.hoehe_m! - a.x.hoehe_m!)
      const anzahl = (stufe === 'schweiz' ? 8 : stufe === 'gross' ? 15 : stufe === 'region' ? 25 : stufe === 'ort' ? 10 : 4) * Math.min(3, b.teile.size)
      for (const { x, l } of gipfel.slice(0, anzahl)) schild(`▲ ${x.name} ${x.hoehe_m!.toLocaleString('de-CH')}`, l[0], l[1], x.hoehe_m!)
    }
    // Ortschaften wie die Bahnhöfe der Modellbahn (Michael, 2026-10-21: «mit deiner … dunkelgrauen Linie, die sehr dünn ist, und
    // deiner Fahne oben, wo weiss auf schwarzem Kasten der Ortsname steht»): ein Mast, oben ein eckiges dunkelgraues Schild;
    // welche, nach dem Rang der Objektart in swissTLMRegio, die grösseren zuerst
    const ortSchilder: Array<{ sp: THREE.Sprite; rang: number; mast: LineSegments2 | null }> = []
    const ortPunkt = new THREE.Vector3(), ortVorne = new THREE.Vector3(), bildGroesse = new THREE.Vector2()
    const ortGruppe = new THREE.Group()
    ortGruppe.name = 'orte'
    wurzel.add(ortGruppe)
    const mastKm = weiteKm * ORT_MAST
    // in der ganzen Schweiz nur Orte in der Schweiz; überall nur so viele, dass zwei Masten mindestens ORT_ABSTAND der Breite
    // auseinander stehen, die grösseren zuerst (die Liste ist nach dem Rang geordnet); welche davon zu sehen sind, wählt ortAuswahl
    const ortListe: Array<{ name: string; e: number; n: number; z: number; rang: number }> = []
    const abstand = weite * ORT_ABSTAND, hoechstensOrte = ORT_ANZAHL[stufe] * Math.min(3, b.teile.size)
    for (const [name, e, n, rang] of zusatz?.ortschaften ?? []) {
      if (ortListe.length >= hoechstensOrte) break
      if (rang < ORT_AB_RANG[stufe] || !drin(e, n)) continue
      // derselbe Name steht in der Quelle oft zweimal (Ortschaft und Weiler)
      if (ortListe.some((o) => o.name === name || Math.hypot(o.e - e, o.n - n) < abstand)) continue
      if (stufe === 'schweiz' && zusatz && !imGebiet(zusatz.pool, 'CH', ...wgs(e, n))) continue
      ortListe.push({ name, e, n, z: bestandHoehe(b, e, n), rang })
    }
    for (const o of ortListe) {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      const px = 26, schrift = `normal ${px}px Helvetica, Arial, sans-serif`
      x.font = schrift
      c.width = Math.ceil(x.measureText(o.name).width) + 18; c.height = px + 14
      x.font = schrift
      x.fillStyle = ORT_GRAU; x.beginPath(); x.roundRect(0, 0, c.width, c.height, SCHILD_RUND_PX); x.fill()
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
      sp.userData.gezeigt = false
      schilder.add(sp)
      ortSchilder.push({ sp, rang: o.rang, mast: null })
    }
    const mastMaterial = new LineMaterial({ color: ORT_GRAU, linewidth: ORT_MAST_PX, clippingPlanes: [k.verlauf.orte.ebene] })
    const mastenBauen = () => {
      for (const o of ortGruppe.children) (o as LineSegments2).geometry.dispose()
      ortGruppe.clear()
      // je Ort ein eigener Mast, damit er mit seinem Schild kommt und geht
      ortListe.forEach((o, i) => {
        const geo = new LineSegmentsGeometry()
        geo.setPositions([X(o.e), Y(o.z), Z(o.n), X(o.e), Y(o.z) + mastKm, Z(o.n)])
        const mast = mastMitRand(geo, mastMaterial)
        mast.visible = !!ortSchilder[i].sp.userData.gezeigt
        ortSchilder[i].mast = mast
        ortGruppe.add(mast)
      })
    }
    mastenBauen()
    // welche Orte zu sehen sind: von denen im Bild die grössten (Rang der Objektart), bei gleichem Rang die näher an der Mitte des
    // Bilds, ohne dass sich ihre Schilder überdecken, höchstens ORT_MAX; sind es so weniger als ORT_MIN, kommen weitere dazu, auch
    // wenn sie sich überdecken. Neu gewählt, wenn die Kamera 0,25 s ruht, in der Brille alle 0,5 s
    const ortAuswahl = () => {
      const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : k.kamera
      k.renderer.getSize(bildGroesse)
      const H = bildGroesse.y, W = bildGroesse.x, f = H / (2 * Math.tan((k.kamera.fov * Math.PI) / 360))
      const imBild: Array<{ o: typeof ortSchilder[number]; x: number; y: number; w: number; h: number; mitte: number }> = []
      for (const o of ortSchilder) {
        o.sp.getWorldPosition(ortPunkt)
        // hinter der Kamera nicht (die Tiefe nach project liegt bei weiter Sicht knapp an 1 und taugt dafür nicht)
        if (ortVorne.copy(ortPunkt).applyMatrix4(cam.matrixWorldInverse).z >= 0) continue
        const p = ortPunkt.project(cam)
        if (Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.95) continue
        imBild.push({ o, x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, w: o.sp.userData.b * f, h: o.sp.userData.h * f, mitte: Math.hypot(p.x, p.y) })
      }
      imBild.sort((a, c) => c.o.rang - a.o.rang || a.mitte - c.mitte)
      const gewaehlt: typeof imBild = []
      const deckt = (a: typeof imBild[number], c: typeof imBild[number]) =>
        Math.abs(a.x - c.x) < (a.w + c.w) / 2 + 6 && a.y - a.h - 4 < c.y && c.y - c.h - 4 < a.y
      for (const q of imBild) {
        if (gewaehlt.length >= ORT_MAX) break
        if (!gewaehlt.some((g) => deckt(g, q))) gewaehlt.push(q)
      }
      for (const q of imBild) { if (gewaehlt.length >= ORT_MIN) break; if (!gewaehlt.includes(q)) gewaehlt.push(q) }
      const an = new Set(gewaehlt.map((g) => g.o))
      for (const o of ortSchilder) {
        o.sp.userData.gezeigt = an.has(o)
        if (o.mast) o.mast.visible = an.has(o)
      }
    }
    let ortZeit = 0, ortRuhe = 0
    const ortLage = new THREE.Vector3(Infinity, 0, 0), ortDreh = new THREE.Quaternion()
    const ortSchritt = () => {
      if (!ortSchilder.length) return
      const jetzt = performance.now()
      if (renderer.xr.isPresenting) { if (jetzt - ortZeit > 500) { ortZeit = jetzt; ortAuswahl() } return }
      const kam = k.kamera
      // ruhig heisst: je Bild weniger als ein Hunderttausendstel der Weite verschoben und kaum gedreht; die gedämpfte Steuerung läuft nach einer Geste
      // noch lange um winzige Beträge nach, mit genauem Vergleich ruhte die Kamera nie und es erschien kein Ort (Michael, 2026-10-25:
      // «keine Orte angezeigt obwohl der Schalter ON ist»)
      if (kam.position.distanceTo(ortLage) > weiteKm * 1e-5 || kam.quaternion.angleTo(ortDreh) > 1e-5) { ortLage.copy(kam.position); ortDreh.copy(kam.quaternion); ortRuhe = jetzt; return }
      if (ortRuhe && jetzt - ortRuhe > 250) { ortRuhe = 0; ortAuswahl() }
    }
    k.jeBild.push(ortSchritt)

    // + und − in der Mitte jeder Seite unter der Platte des Sockels, hängend, damit sie keine Schalter an den Wänden verdecken
    // (Michael, 2026-10-24: «Sie sollen etwas weiter unten stehen und keine Tasten also Knöpfe verdecken»)
    const knopfGruppe = new THREE.Group()
    knopfGruppe.name = 'knoepfe'
    wurzel.add(knopfGruppe)
    // wo die Wände stehen, für die Schalter (eigener Effekt)
    wurzel.userData.waende = { x0: X(E0), x1: X(E1), z0: Z(N0), z1: Z(N1), y: Y(tief) - wand / 2, wand, W: weiteKm }
    const knoepfeSetzen = () => {
      for (const o of knopfGruppe.children) { const sp = o as THREE.Sprite; sp.material.map?.dispose(); sp.material.dispose() }
      knopfGruppe.clear()
      if (!knoepfe) return
      const y = Y(tief) - wand - platte, raus = ueber + weiteKm * 0.004, schritt = weiteKm * 0.13
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
          sp.center.set(0.5, 1.08)
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
      const i = k.jeBild.indexOf(ortSchritt); if (i >= 0) k.jeBild.splice(i, 1)
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
      spaeterWeg([...weg, ...wandMaterialien, platteMaterial, wandWasserMaterial, lockerMaterial, ...linienMaterial, ...kurvenMaterial, kastenMaterial, kantenMaterial, mastMaterial, gipfelMast])
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
      { zeilen: ['Wanderwege'], breite: 0.085 * W, an: !grob(stufe) && wandern, farbe: LICHT.gelaende, gesperrt: grob(stufe),
        aktion: umschalten('wandern') },
      { zeilen: ['Gebäude'], breite: 0.085 * W, an: umweltDa && gebaeude, farbe: LICHT.gebaeude, gesperrt: !umweltDa, aktion: umschalten('gebaeude') },
      { zeilen: ['Bäume'], breite: 0.085 * W, an: umweltDa && baeume, farbe: LICHT.umwelt, gesperrt: !umweltDa, aktion: umschalten('baeume') },
      // wie die Wanderwege erst ab der Stufe 20 km
      ...(zuegeDa ? [{ zeilen: ['Züge'], breite: 0.085 * W, an: !grob(stufe) && zuege, farbe: LICHT.zuege, gesperrt: grob(stufe),
        aktion: umschalten('zuege') },
        // Schiffe laut Fahrplan auf den Kurslinien von swissTLMRegio (Michael, 2026-10-28)
        { zeilen: ['Schiffe'], breite: 0.085 * W, an: !grob(stufe) && schiffe, farbe: LICHT.schiffe, gesperrt: grob(stufe),
          aktion: umschalten('schiffe') }] : []),
    ]
    const zeitDa = sonnenAn && !!sonnenZeilen
    const [tagZeit] = sonnenZeilen ?? ['–, –'], komma = tagZeit.lastIndexOf(', ')
    const zeit = (art: 'stunde' | 'tag' | 'jetzt', um: number) => () => cb.current.zeitSchieben(art, um)
    const rechts: Teil[] = [
      // alle Knöpfe rechts gleich breit, «Jetzt» gleich rechts neben Datum und Uhrzeit und gedrückt, solange die Zeit die jetzige ist
      // (Michael, 2026-10-29: «Stunden und Tage Knöpfe gleich breit wie andere, Jetzt auch», «KNOPF jetzt rechts neben das Datum und Uhrzeit»)
      { zeilen: ['Wetter'], breite: KNOPF_B * W, an: windAn, farbe: LICHT.wind, aktion: umschalten('wind') },
      // in jeder Stufe (Michael, 2026-10-29: «Wolken auch in den Feldern 4 km und 1 km zeigen»)
      { zeilen: ['Wolken'], breite: KNOPF_B * W, an: wolken, farbe: LICHT.wolken, aktion: umschalten('wolken') },
      { zeilen: ['Sonne'], breite: KNOPF_B * W, an: sonnenAn, farbe: LICHT.sonne, aktion: umschalten('sonne') },
      { zeilen: zeitDa ? [tagZeit.slice(0, komma), tagZeit.slice(komma + 2)] : ['–'], breite: 0.09 * W, gesperrt: !zeitDa },
      { zeilen: ['Jetzt'], breite: KNOPF_B * W, an: zeitDa && jetztAn, farbe: LICHT.sonne, gesperrt: !zeitDa, aktion: zeit('jetzt', 0) },
      { zeilen: ['−1 h'], breite: KNOPF_B * W, knopf: true, gesperrt: !zeitDa, aktion: zeit('stunde', -1) },
      { zeilen: ['+1 h'], breite: KNOPF_B * W, knopf: true, gesperrt: !zeitDa, aktion: zeit('stunde', 1) },
      { zeilen: ['−1 Tag'], breite: KNOPF_B * W, knopf: true, gesperrt: !zeitDa, aktion: zeit('tag', -1) },
      { zeilen: ['+1 Tag'], breite: KNOPF_B * W, knopf: true, gesperrt: !zeitDa, aktion: zeit('tag', 1) },
    ]
    // je Teil ein Bild für die Vorderseite, auf allen vier Wänden dasselbe; an leuchtet es in der Farbe seiner Art, aus ist es dunkel
    const PX = 128
    // nurSchrift: die Schrift allein auf Schwarz, als eigenes Licht der Beschriftung
    const zeichnen = (t: Teil, an: boolean, nurSchrift = false) => {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      c.height = PX; c.width = Math.round(PX * t.breite / hoch)
      x.fillStyle = nurSchrift ? '#000000' : t.gesperrt ? (t.an === undefined && !t.knopf ? '#0c0f12' : '#262626') : t.knopf ? KARMIN : t.an === undefined ? '#10161c' : an ? t.farbe! : '#3a3a3a'
      x.fillRect(0, 0, c.width, c.height)
      if (an && t.an !== undefined && !nurSchrift) {
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
      return tex
    }
    const bild = (t: Teil, an: boolean) => {
      const tex = zeichnen(t, an)
      // was leuchtet (eingeschaltet, die Anzeige der Zeit), hängt nicht vom Licht ab; der Rest ist ein Knopf im Licht, seine
      // Schrift leuchtet aber schwach von selbst, damit man sie auch im Dunkeln und in der Nacht lesen kann (Michael, 2026-10-24:
      // «Nicht aktive Tasten sollen aber so leuchten, dass man es trotzdem lesen kann»)
      if (an || t.an === undefined) return new THREE.MeshBasicMaterial({ map: tex })
      return new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: zeichnen(t, an, true), emissiveIntensity: SCHRIFT_LEUCHTET })
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
        x.kappe.dispose(); x.rahmen.dispose(); x.vorne.map?.dispose()
        if (x.vorne instanceof THREE.MeshLambertMaterial) x.vorne.emissiveMap?.dispose()
        x.vorne.dispose()
        if (x.seiten !== seite) x.seiten.dispose()
        if (x.schein) { x.schein.geo.dispose(); x.schein.stoff.map?.dispose(); x.schein.stoff.dispose() }
      }
      seite.dispose(); fassung.dispose()
    }
  }, [b, stufe, zusatz, knoepfe, scheiben, orte, gipfel, wandern, gebaeude, baeume, umweltHier, sonnenAn, sonnenZeilen, jetztAn, windAn, zuege, zuegeDa, schiffe, wolken])

  // die Wanderwege: auf das Gelände des Bestands gelegt, zwischen den Punkten so dicht wie sein Raster, damit sie nicht
  // im Hang verschwinden; in einer Gruppe, deren Höhe mit dem Faktor wächst
  useEffect(() => {
    const k = kern.current
    if (!k || !wandern || grob(stufe)) return
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
        const geo = new LineSegmentsGeometry()
        geo.setPositions(l)
        const linie = new LineSegments2(geo, new LineMaterial({ color: WANDER_FARBEN[art] ?? '#e6a800', linewidth: WANDER_PX }))
        linie.renderOrder = 4
        gruppe.add(linie)
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
  const geraetDunkel = useGeraetDunkel()
  useEffect(() => {
    const k = kern.current
    if (!k) return
    const { sonne, himmelLicht, wurzel, himmel, himmelTag, himmelOben, himmelObenTag, himmelMalen, sterne } = k
    const weiteKm = (wurzel.userData.weiteKm as number) || 1, mitteY = (wurzel.userData.sonnenMitte as number) || 0
    const d = new THREE.Vector3(-0.35, 1.3, 0.9).normalize()
    // nachts der Himmel dunkel mit Sternen (Michael, 2026-10-24): von 3° über dem Horizont bis 12° darunter (nautische Dämmerung)
    // wird er dunkel, die Sterne erscheinen ab 4° darunter und sind ab 12° ganz da; Farben gewählt
    const nacht = stand ? himmelNacht(stand.hoehe) : 0
    const [unten, oben] = stand || !geraetDunkel ? HIMMEL_HELL : HIMMEL_DUNKEL
    himmelTag.set(unten); himmelObenTag.set(oben)
    himmel.copy(himmelTag).lerp(HIMMEL_NACHT, nacht)
    himmelOben.copy(himmelObenTag).lerp(HIMMEL_NACHT_OBEN, nacht)
    himmelMalen()
    const sicht = stand ? sternSicht(stand.hoehe) : 0
    sterne.sicht(sicht)
    if (stand && sicht > 0) sterne.setzen(stand.zeit, stand.la, stand.lo)
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
  }, [stand, b, stufe, geraetDunkel])

  // Höhenlinien und Orte ein- und ausblenden; zu hören ist nur der Klick des Knopfs wie bei Wanderwegen und Gebäuden (Michael,
  // 2026-10-25: «nicht mehr so lange Geräusche. Neu die gleichen wie bei Wanderwege, Gebäude»; vorher ein Rauschen, verlaufTon)
  useEffect(() => {
    const k = kern.current
    if (!k) return
    const neu = { hoehen: scheiben, orte, gipfel }
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
    }, k.inBrille, (stellen) => windOrteRef.current(stellen.map((p) => ({ e: lage.cE + p.x * 1000, n: lage.cN - p.z * 1000 }))), W * 0.12, kastenUm(b, lage),
    // fest auf den Mitten der vier Viertel des Modells, beim Drehen und Zoomen bleiben sie stehen (Michael, 2026-10-25: «Die Windhosen
    // sollen nicht mitwandern … verteilt auf die vier Viertel jeweils zentriert»)
    (() => {
      const rand = teile.map((t) => t.rahmen)
      const e0 = Math.min(...rand.map((x) => x.e0)), e1 = Math.max(...rand.map((x) => x.e0 + x.b))
      const n0 = Math.min(...rand.map((x) => x.n1 - x.h)), n1 = Math.max(...rand.map((x) => x.n1))
      // links oben, rechts oben, links unten, rechts unten wie die Viertel des Bilds vorher
      return [[0.25, 0.75], [0.75, 0.75], [0.25, 0.25], [0.75, 0.25]].map(([fx, fy]) => {
        const e = e0 + fx * (e1 - e0), n = n0 + fy * (n1 - n0)
        return new THREE.Vector3((e - lage.cE) / 1000, bestandHoehe(b, e, n) / 1000, -(n - lage.cN) / 1000)
      })
    })())
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
  // Strassen- und Bahnhofslicht bei Nacht (pipeline/build_strassenlicht.py; Michael, 2026-10-29: «Irgendwie fehlt schon noch eine
  // Straßen- und allgemeine Bahnhofbeleuchtung. Kannst du das nicht erfinden und einbauen?»): je Lampe ein Lichtfleck auf dem Boden, warm auf
  // Strassen, kühler und grösser an Bahnhöfen; nur mit «Gebäude» (Michael, 2026-10-29: «Strassen und Bahnhofbeleuchtung nur aktivieren wenn
  // Gebäude eingeschaltet sind»), dazu je Lampe ein Mast, auch am Tag
  useEffect(() => {
    const k = kern.current
    const lage = k?.wurzel.userData.lage as { cE: number; cN: number } | undefined
    if (!k || !lage || !gebaeude || grob(stufe)) return
    let weg = false
    const gruppe = new THREE.Group()
    gruppe.name = 'strassenlicht'
    k.wurzel.add(gruppe)
    const stoff = new THREE.MeshBasicMaterial({ map: lichtBild(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false })
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    let netz: THREE.InstancedMesh | null = null, masten: THREE.InstancedMesh | null = null, koepfe: THREE.InstancedMesh | null = null
    // Mast: Pfosten von 1 m Höhe mit dem Fuss im Ursprung, je Lampe skaliert; Kopf ein flaches Kästchen oben, zur Strasse hin
    const mastGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
    const mastStoff = new THREE.MeshLambertMaterial({ color: LICHT_MAST_FARBE })
    const kopfGeo = new THREE.BoxGeometry(1, 1, 1)
    const kopfStoff = new THREE.MeshBasicMaterial({ color: LICHT_STRASSE_FARBE, toneMapped: false })
    const kopfDunkel = new THREE.Color(LICHT_MAST_FARBE), kopfHell = new THREE.Color(LICHT_STRASSE_FARBE)
    const teile = [...b.teile.values()]
    const rand = teile.map((t) => t.rahmen)
    const e0 = Math.min(...rand.map((x) => x.e0)), e1 = Math.max(...rand.map((x) => x.e0 + x.b))
    const n0 = Math.min(...rand.map((x) => x.n1 - x.h)), n1 = Math.max(...rand.map((x) => x.n1))
    const laden = async () => {
      const l = await strassenlichtLaden(e0, n0, e1, n1).catch(() => null)
      if (weg || !l || !l.e.length) return
      const anzahl = Math.min(l.e.length, LICHT_HOECHSTENS)
      const n = new THREE.InstancedMesh(geo, stoff, anzahl)
      n.frustumCulled = false; n.renderOrder = 2
      const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sk = new THREE.Vector3()
      const warm = new THREE.Color(LICHT_STRASSE_FARBE), kuehl = new THREE.Color(LICHT_BAHNHOF_FARBE).multiplyScalar(LICHT_BAHNHOF_STAERKE)
      // bei sehr vielen Lampen jede soundsovielte
      const schritt = l.e.length / anzahl
      const mn = new THREE.InstancedMesh(mastGeo, mastStoff, anzahl), kn = new THREE.InstancedMesh(kopfGeo, kopfStoff, anzahl)
      mn.castShadow = true; mn.frustumCulled = kn.frustumCulled = false
      const d = LICHT_MAST_DICKE_M / 1000, oben = new THREE.Vector3(), seite = new THREE.Vector3()
      for (let i = 0; i < anzahl; i++) {
        const j = Math.floor(i * schritt), bahnhof = l.art[j] === 2
        const h = bestandHoehe(b, l.e[j], l.n[j]), r = (bahnhof ? LICHT_BAHNHOF_M : LICHT_STRASSE_M) / 1000
        v.set((l.e[j] - lage.cE) / 1000, (Number.isFinite(h) ? h : 0) / 1000 + 0.0005, -(l.n[j] - lage.cN) / 1000)
        sk.set(2 * r, 1, 2 * r)
        m.compose(v, q, sk)
        n.setMatrixAt(i, m)
        n.setColorAt(i, bahnhof ? kuehl : warm)
        // der Mast neben der Lampe, die Richtung je Lampe fest gewürfelt (die Achse der Strasse kennt die Datei nicht)
        const w = ((l.e[j] * 7919 + l.n[j] * 104729) % 360) * Math.PI / 180
        seite.set(Math.cos(w), 0, Math.sin(w)).multiplyScalar(LICHT_RAND_M / 1000)
        const hoch = (bahnhof ? LICHT_MAST_M.bahnhof : LICHT_MAST_M.strasse) / 1000
        oben.copy(v).add(seite).setY(v.y - 0.0005 - 0.001)
        m.compose(oben, q, sk.set(d, hoch + 0.001, d))
        mn.setMatrixAt(i, m)
        // der Kopf oben: ein Kästchen 0,8 × 0,25 × 0,4 m, zur Lampe hin
        oben.copy(v).addScaledVector(seite, 0.85).setY(v.y - 0.0005 + hoch)
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -w)
        m.compose(oben, q, sk.set(0.0008, 0.00025, 0.0004))
        q.identity()
        kn.setMatrixAt(i, m)
      }
      netz = n; masten = mn; koepfe = kn
      gruppe.add(n)
      k.wurzel.add(mn, kn)
    }
    void laden()
    const schritt = () => {
      const nacht = fensterNacht.value
      gruppe.visible = nacht > 0
      stoff.opacity = LICHT_HELL * nacht
      kopfStoff.color.copy(kopfDunkel).lerp(kopfHell, nacht)
    }
    k.jeBild.push(schritt)
    return () => {
      weg = true
      const i = k.jeBild.indexOf(schritt); if (i >= 0) k.jeBild.splice(i, 1)
      k.wurzel.remove(gruppe); stoff.map?.dispose(); stoff.dispose(); geo.dispose(); netz?.dispose()
      if (masten) k.wurzel.remove(masten)
      if (koepfe) k.wurzel.remove(koepfe)
      masten?.dispose(); koepfe?.dispose(); mastGeo.dispose(); mastStoff.dispose(); kopfGeo.dispose(); kopfStoff.dispose()
    }
  }, [b, stufe, gebaeude, knoepfe])
  // Züge laut Fahrplan (src/zuege3d.ts), ab der Stufe 20 km: jede Fahrt dort, wo sie jetzt laut Fahrplan ist,
  // wie der Zug der Modellbahn auf dem Gelände in Fahrtrichtung
  const [zugZeile, setZugZeile] = useState<string | null>(null)
  /** zum gewählten Zug der Bahnhof, an dem er steht oder als Nächstes hält, mit seiner Seite auf taktland.ch (Perrons, Gleise, Sektoren;
   *  Michael, 2026-10-26: «Gleis mit Link»), nur wenn Taktland eine Seite für ihn hat */
  const [zugLink, setZugLink] = useState<{ name: string; url: string } | null>(null)
  useEffect(() => {
    const k = kern.current
    const lage = k?.wurzel.userData.lage as { cE: number; cN: number } | undefined
    const W = k?.wurzel.userData.weiteKm as number | undefined
    if (!k || !lage || !W || !zuege || grob(stufe)) { setZugZeile(null); setZugLink(null); return }
    let weg = false
    const gruppe = new THREE.Group()
    gruppe.name = 'zuege'
    gruppe.userData.bleibt = true
    k.wurzel.add(gruppe)
    // ein Zug ZUG_LAENGE_KM lang, in der Region etwas länger, damit man ihn sieht; die Form wie in der Modellbahn von Taktland
    // (ZugForm.ts; Michael, 2026-10-26: «das Design der Züge von Taktland übernehmen»): Lok, vier Wagen, Steuerwagen, in ihren
    // Verhältnissen verkleinert (Masse in keiner Quelle)
    const laenge = Math.max(ZUG_LAENGE_KM, W * 0.015)
    const ganzM = ZUG_LOK_M + ZUG_WAGEN * (ZUG_WAGEN_M + ZUG_LUECKE_M), mass = laenge / (ganzM / 1000), hoehe = ZUG_HOEHE * mass
    const formen = zugFormen()
    const stoff = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    // die Innenbeleuchtung: das Fensterband (Attribut leuchte) leuchtet mit der Nacht der Gebäude
    stoff.onBeforeCompile = (sh) => {
      sh.uniforms.zugNacht = fensterNacht
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float leuchte;\nvarying float vLeuchte;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeuchte = leuchte;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float zugNacht;\nvarying float vLeuchte;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vLeuchte * zugNacht * ${ZUG_INNEN_HELL.toFixed(3)} * vec3(${new THREE.Color(ZUG_INNEN_FARBE).toArray().map((x) => x.toFixed(3)).join(', ')});`)
    }
    // die Stirnlichter: je Zug ein Lichtkegel vor der Lok auf dem Boden
    const stirnStoff = new THREE.MeshBasicMaterial({ map: stirnBild(), color: ZUG_STIRN_FARBE, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
    const stirnGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5)
    const stirn = new THREE.InstancedMesh(stirnGeo, stirnStoff, 2 * ZUEGE_HOECHSTENS)
    stirn.count = 0; stirn.frustumCulled = false; stirn.renderOrder = 2
    gruppe.add(stirn)
    const stirnQ = new THREE.Quaternion(), stirnV = new THREE.Vector3(), stirnS = new THREE.Vector3()
    // die Lampen selbst: kleine helle Kugeln vorne an der Lok, im Raum der Lok gesetzt
    const lampenGeo = new THREE.SphereGeometry(1, 10, 8), lampenStoff = new THREE.MeshBasicMaterial({ color: ZUG_LAMPE_FARBE, toneMapped: false })
    const lampen = new THREE.InstancedMesh(lampenGeo, lampenStoff, 2 * ZUEGE_HOECHSTENS)
    lampen.count = 0; lampen.frustumCulled = false
    gruppe.add(lampen)
    const lampeM = new THREE.Matrix4(), lampeT = new THREE.Matrix4()
    const netzVon = (geo: THREE.BufferGeometry, je: number) => {
      const n = new THREE.InstancedMesh(geo, stoff, ZUEGE_HOECHSTENS * je)
      n.count = 0; n.castShadow = true; n.frustumCulled = false
      gruppe.add(n)
      return n
    }
    const netze = { lok: netzVon(formen.lok, 1), wagen: netzVon(formen.wagen, ZUG_WAGEN - 1), steuer: netzVon(formen.steuer, 1) }
    // der Zug unter dem Strahl leuchtet schon beim Zielen auf, in der Brille unter dem Strahl jedes Controllers, auf dem Bildschirm unter der
    // Maus (Michael, 2026-10-26: «Zug unter dem Strahl beim Zielen aufleuchten lassen»); Farbe je Instanz, sonst weiss
    const hell = new THREE.Color(...ZUG_ZIEL_HELL), normal = new THREE.Color(1, 1, 1)
    for (const n of Object.values(netze)) { for (let i = 0; i < n.instanceMatrix.count; i++) n.setColorAt(i, normal) }
    let maus: THREE.Vector2 | null = null
    const mausZiel = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse') return
      const r = k.renderer.domElement.getBoundingClientRect()
      maus = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
    }
    const mausWeg = () => { maus = null }
    k.renderer.domElement.addEventListener('pointermove', mausZiel)
    k.renderer.domElement.addEventListener('pointerleave', mausWeg)
    const zielStrahl = new THREE.Raycaster(), handDreh = new THREE.Matrix4()
    let geleuchtet = new Set<number>()
    const zielen = () => {
      const ziele = new Set<number>()
      if (k.renderer.xr.isPresenting) {
        for (const i of [0, 1]) {
          const c = k.renderer.xr.getController(i)
          if (!c.visible) continue
          zielStrahl.ray.origin.setFromMatrixPosition(c.matrixWorld)
          zielStrahl.ray.direction.set(0, 0, -1).applyMatrix4(handDreh.extractRotation(c.matrixWorld))
          const z = finden(zielStrahl.ray, ZUG_TIPP_WINKEL_BRILLE)
          if (z >= 0) ziele.add(gezeichnet[z].id)
        }
      } else if (maus) {
        zielStrahl.setFromCamera(maus, k.kamera)
        const z = finden(zielStrahl.ray, ZUG_TIPP_WINKEL)
        if (z >= 0) ziele.add(gezeichnet[z].id)
      }
      return ziele
    }
    // welcher Zug welcher ist (Michael, 2026-10-26: «welcher Zug welcher ist … nur bei 3DLand»): ein Tipp auf einen Zug zeigt über
    // ihm ein Schild mit Zug, Ziel und dem Halt laut Fahrplan; nur was im Fahrplan steht
    let gezeichnet: ZugFahrt[] = [], gewaehlt: number | null = null, schildText = ''
    const schild = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, sizeAttenuation: false }))
    schild.center.set(0.5, 0); schild.renderOrder = 6; schild.visible = false
    gruppe.add(schild)
    const schildMalen = (zeilen: string[]) => {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      const px = 26, klein = 21, fett = `bold ${px}px Helvetica, Arial, sans-serif`, normal = `normal ${klein}px Helvetica, Arial, sans-serif`
      x.font = fett; let breit = x.measureText(zeilen[0]).width
      x.font = normal; for (const z of zeilen.slice(1)) breit = Math.max(breit, x.measureText(z).width)
      c.width = Math.ceil(breit) + 20; c.height = px + 16 + (zeilen.length - 1) * (klein + 6)
      x.fillStyle = ORT_GRAU; x.beginPath(); x.roundRect(0, 0, c.width, c.height, SCHILD_RUND_PX); x.fill()
      x.fillStyle = '#ffffff'; x.font = fett; x.fillText(zeilen[0], 10, px + 4)
      x.font = normal; zeilen.slice(1).forEach((z, i) => x.fillText(z, 10, px + 8 + (i + 1) * (klein + 6)))
      schild.material.map?.dispose()
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      schild.material.map = t; schild.material.needsUpdate = true
      schild.userData = { b: c.width * 0.00085, h: c.height * 0.00085, verhaeltnis: c.width / c.height, brilleM: 0.03 }
      if (!k.renderer.xr.isPresenting) schild.scale.set(schild.userData.b, schild.userData.h, 1)
    }
    const uhr = (min: number | null) => {
      if (min === null) return ''
      const m = ((Math.round(min) % 1440) + 1440) % 1440
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    }
    // Betriebspunkt → Bahnhofsnummer, und welche Bahnhöfe eine Seite in Taktland haben
    let uicVon: Map<string, number> | null = null, mitSeite: Set<number> | null = null, linkAbk: string | null = null
    void indexLaden().then((ix) => { mitSeite = new Set(ix.bahnhoefe.filter((b) => b.sprachen.length && !b.ohne_bahnhofseite).map((b) => b.uic)) }).catch(() => undefined)
    const linkSetzen = (abk: string | null) => {
      if (abk === linkAbk) return
      linkAbk = abk
      if (abk && zn && !uicVon) uicVon = new Map(Object.entries(zn.netz.bahnhoefe).map(([u, a]) => [a, Number(u)]))
      const uic = abk ? uicVon?.get(abk) : undefined
      setZugLink(abk && uic && mitSeite?.has(uic) ? { name: zn?.netz.punkte[abk] ?? abk, url: `${AUF_3DLAND ? TAKTLAND_APP : ''}#/bahnhof/${uic}` } : null)
    }
    const zeilenVon = (f: ZugFahrt, st: ZugStelle): string[] => {
      const name = (abk: string) => zn?.netz.punkte[abk] ?? abk
      const titel = `${f.linie && f.linie !== f.gattung ? f.linie : f.gattung} ${f.nummer}`.trim()
      const h = f.halte
      const halt = st.art === 'halt' ? h[st.i] : h[st.i + 1]
      const gleis = halt.gleis ? `, Gleis ${halt.gleis}` : ''
      const zweite = st.art === 'halt'
        ? (st.i === h.length - 1 ? `in ${name(halt.abk)}${gleis}, an ${uhr(halt.an)}` : st.i === 0 ? `in ${name(halt.abk)}${gleis}, ab ${uhr(halt.ab)}`
          : `in ${name(halt.abk)}${gleis}, an ${uhr(halt.an)}, ab ${uhr(halt.ab)}`)
        : `nächster Halt ${name(halt.abk)}${gleis}, an ${uhr(halt.an ?? halt.ab)}`
      return [`${titel} nach ${f.ziel}`, zweite, 'laut Fahrplan']
    }
    gruppe.userData.wahl = (o: THREE.Object3D, i: number) => {
      const zug = o === netze.wagen ? Math.floor(i / (ZUG_WAGEN - 1)) : o === netze.lok || o === netze.steuer ? i : -1
      const f = gezeichnet[zug]
      if (!f) return false
      gewaehlt = gewaehlt === f.id ? null : f.id
      knopfTon(gewaehlt !== null)
      return true
    }
    gruppe.userData.abwahl = () => { gewaehlt = null }
    // die Mitten der Wagen jedes gezeichneten Zugs im Raum des Modells, für den Tipp knapp daneben
    const mitten: THREE.Vector3[][] = []
    /** welcher gezeichnete Zug dem Strahl am nächsten liegt, bis grenze (Winkel vom Ursprung des Strahls), sonst -1 */
    const finden = (r: THREE.Ray, grenze: number) => {
      let best = -1, bestWinkel = grenze
      const w = new THREE.Vector3(), zu = new THREE.Vector3()
      mitten.forEach((liste, i) => {
        if (i >= gezeichnet.length) return
        for (const p of liste) {
          w.copy(p); k.wurzel.localToWorld(w)
          zu.copy(w).sub(r.origin)
          const lang = zu.length()
          if (lang < 1e-9 || zu.dot(r.direction) <= 0) continue
          const winkel = zu.angleTo(r.direction)
          if (winkel < bestWinkel) { bestWinkel = winkel; best = i }
        }
      })
      return best
    }
    gruppe.userData.nahe = (r: THREE.Ray, grenze: number) => {
      const f = gezeichnet[finden(r, grenze)]
      if (!f) return false
      gewaehlt = gewaehlt === f.id ? null : f.id
      knopfTon(gewaehlt !== null)
      return true
    }
    const teile = [...b.teile.values()]
    const drin = (e: number, n: number) => teile.some((t) => imRaster(t.raster, e, n))
    const rand = teile.map((t) => t.rahmen)
    const e0 = Math.min(...rand.map((x) => x.e0)), e1 = Math.max(...rand.map((x) => x.e0 + x.b))
    const n0 = Math.min(...rand.map((x) => x.n1 - x.h)), n1 = Math.max(...rand.map((x) => x.n1))
    let fahrten: ZugFahrt[] = [], ix: ZugIndex | null = null, zn: ZugNetz | null = null
    let unterwegs: Array<{ f: ZugFahrt; st: ZugStelle }> = [], neuUm = 0
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), gross = new THREE.Vector3(1, 1, 1), skala = new THREE.Vector3(), neigung = new THREE.Quaternion(), querAchse = new THREE.Vector3(1, 0, 0), oben = new THREE.Vector3(0, 1, 0)
    const mitte = new THREE.Vector3(), auge = new THREE.Vector3()
    void (async () => {
      ix = await zugIndexLaden()
      if (weg) return
      if (!ix) { setZugZeile('Züge: der Fahrplan ist hier nicht geladen.'); return }
      const [liste, netzDa] = await Promise.all([zuegeLaden(ix, e0, n0, e1, n1).catch(() => []), zugNetzLaden().catch(() => null)])
      if (weg) return
      fahrten = liste; zn = netzDa
      const st = /^\d{8}$/.test(ix.stand) ? `${Number(ix.stand.slice(6))}.${Number(ix.stand.slice(4, 6))}.${ix.stand.slice(0, 4)}` : ix.stand
      setZugZeile(zn ? `Züge laut Fahrplan vom ${st}, nicht live` : 'Züge: das Netz konnte nicht geladen werden.')
    })()
    const schritt = () => {
      if (!ix || !zn) return
      const jetzt = jetztImFahrplan(ix)
      // wer unterwegs ist, alle 2 s neu; wo genau, in jedem Bild
      if (performance.now() > neuUm) {
        neuUm = performance.now() + 2000
        unterwegs = []
        for (const f of fahrten) { const st = zugStelle(f, jetzt.tag, jetzt.minuten); if (st) unterwegs.push({ f, st: st }) }
        for (const u of unterwegs) { const st = zugStelle(u.f, jetzt.tag, jetzt.minuten); if (st) u.st = st }
      }
      let zahl = 0, neueWege = 0, zeigt = false
      // aus der Ferne grösser, damit man die Züge in der ganzen Region sieht: mindestens ZUG_FERN des Abstands der Kamera lang
      k.wurzel.getWorldPosition(mitte)
      const cam = k.renderer.xr.isPresenting ? k.renderer.xr.getCamera() : k.kamera
      const abstand = cam.getWorldPosition(auge).distanceTo(mitte) / Math.max(1e-9, k.wurzel.scale.x)
      // in den Feldern von 4 km und 1 km kleiner, sonst ragen die Züge über die Dächer (Michael, 2026-10-28, Bern: «ungefähr 60% von dieser
      // jetzigen Größe»)
      gross.setScalar(Math.max(1, (abstand * ZUG_FERN) / laenge) * (stufe === 'ort' || stufe === 'nah' ? ZUG_NAH_MASS : 1))
      skala.copy(gross).multiplyScalar(mass)
      for (const u of unterwegs) {
        if (zahl >= ZUEGE_HOECHSTENS) break
        const st = zugStelle(u.f, jetzt.tag, jetzt.minuten)
        if (!st) continue
        const h = u.f.halte
        // am Halt: am Anfang des Wegs zum nächsten Halt, am Ende am Schluss des Wegs vom letzten; j ist der Halt am Anfang des Wegs
        const [j, anteil] = st.art === 'fahrt' ? [st.i, st.anteil] : st.i + 1 < h.length ? [st.i, 0] : [st.i - 1, 1]
        // neue Wege nur einige je Bild, sonst stockt das Bild beim Einschalten
        const wegVon = (i: number) => {
          const schluessel = `${h[i].abk}>${h[i + 1].abk}`
          if (!gerechnet.has(schluessel)) { if (neueWege++ > 6) return undefined; gerechnet.add(schluessel) }
          return zn!.weg(h[i].abk, h[i + 1].abk)
        }
        const fw = wegVon(j)
        if (!fw) continue
        const ende = wegEnde(fw), sM = anteil * ende
        // die Wagen hinter der Spitze: vor dem Anfang des Wegs auf dem Weg davor, ohne ihn gerade nach hinten
        const vorher = j > 0 ? wegVon(j - 1) : null
        const geradeZurueck = (w: Fahrweg, sm: number): [number, number] => {
          const a0 = lageBei(w, 0), a1 = lageBei(w, Math.min(wegEnde(w), 60)), [e0, n0] = lv95(a0.lat, a0.lon), [e1, n1] = lv95(a1.lat, a1.lon)
          const d = Math.hypot(e1 - e0, n1 - n0) || 1
          return [e0 + ((e1 - e0) / d) * sm, n0 + ((n1 - n0) / d) * sm]
        }
        const stelle = (sm: number): [number, number] => {
          if (sm >= 0) { const p = lageBei(fw, Math.min(sm, ende)); return lv95(p.lat, p.lon) }
          if (!vorher) return geradeZurueck(fw, sm)
          const sv = wegEnde(vorher) + sm
          if (sv < 0) return geradeZurueck(vorher, sv)
          const p = lageBei(vorher, sv)
          return lv95(p.lat, p.lon)
        }
        const [es, ns] = stelle(sM)
        if (!drin(es, ns)) continue
        const mJeM = mass * gross.x
        // Anfang und Ende jedes Wagens; die Höhe dort geglättet über ZUG_GLATT_M entlang des Zugs, jeder Wagen von seinem
        // Ende zum Anfang geneigt: so liegen die Wagen aneinander statt in Stufen (Michael, 2026-10-26: «nicht so holpern»)
        const enden: Array<{ s: number; e: number; n: number; h: number }> = []
        let ab = 0
        for (let w = 0; w <= ZUG_WAGEN; w++) {
          const lM = (w === 0 ? ZUG_LOK_M : ZUG_WAGEN_M) * mJeM
          for (const sm of [sM - ab, sM - ab - lM]) { const [e, n] = stelle(sm); enden.push({ s: sm, e, n, h: bestandHoehe(b, e, n) }) }
          ab += lM + ZUG_LUECKE_M * mJeM
        }
        const fenster = ZUG_GLATT_M * mJeM
        let lokE = 0, lokN = 0
        const glatt = enden.map((x) => {
          let summe = 0, zahlH = 0
          for (const y of enden) if (Math.abs(y.s - x.s) <= fenster && Number.isFinite(y.h)) { summe += y.h; zahlH++ }
          return zahlH ? summe / zahlH : x.h
        })
        for (let w = 0; w <= ZUG_WAGEN; w++) {
          const vo = enden[2 * w], hi = enden[2 * w + 1], hv = glatt[2 * w], hh = glatt[2 * w + 1]
          // nach links versetzt, damit Züge in Gegenrichtung aneinander vorbeifahren statt durcheinander
          const lang = Math.hypot(vo.e - hi.e, vo.n - hi.n) || 1, versatz = ZUG_BREITE * mass * gross.x * 1000 * ZUG_LINKS
          const e = (vo.e + hi.e) / 2 - ((vo.n - hi.n) / lang) * versatz, n = (vo.n + hi.n) / 2 + ((vo.e - hi.e) / lang) * versatz
          if (w === 0) { lokE = e; lokN = n }
          v.set((e - lage.cE) / 1000, (hv + hh) / 2000 + (hoehe / 2) * gross.y, -(n - lage.cN) / 1000)
          q.setFromAxisAngle(oben, Math.atan2(vo.e - hi.e, -(vo.n - hi.n)))
          const quer = Math.hypot(vo.e - hi.e, vo.n - hi.n)
          neigung.setFromAxisAngle(querAchse, quer > 1 ? -Math.max(-ZUG_NEIGUNG, Math.min(ZUG_NEIGUNG, Math.atan2(hv - hh, quer))) : 0)
          q.multiply(neigung)
          m.compose(v, q, skala)
          ;(mitten[zahl] ??= [])[w] = (mitten[zahl][w] ?? new THREE.Vector3()).copy(v)
          if (w === 0) {
            for (const seite of [-1, 1]) {
              const r0 = ZUG_LAMPE_R * ZUG_BREITE
              lampeT.makeTranslation(seite * ZUG_LAMPE_SEITE * ZUG_BREITE, ZUG_LAMPE_HOEHE * ZUG_HOEHE, ZUG_LOK_M / 2000)
              lampeM.copy(m).multiply(lampeT).multiply(new THREE.Matrix4().makeScale(r0, r0, r0 * 0.5))
              lampen.setMatrixAt(2 * zahl + (seite + 1) / 2, lampeM)
            }
          }
          if (w === 0 && fensterNacht.value > 0 && st.art === 'halt') {
            // am Halt kein Kegel: in grossen Bahnhöfen stehen viele Züge nebeneinander, ihre Kegel addierten sich zu einem weissen Fleck
            m.makeScale(0, 0, 0)
            for (const seite of [0, 1]) stirn.setMatrixAt(2 * zahl + seite, m)
            m.compose(v, q, skala)
          } else if (w === 0 && fensterNacht.value > 0) {
            // je Lampe ein Kegel vor der Spitze der Lok, drei Loks lang, um denselben Versatz nach links, geneigt vom Boden an der Spitze
            // zum Boden vorne
            const lM = ZUG_LOK_M * mJeM, lang0 = ZUG_STIRN_LAENGE * lM
            const [ev, nv] = stelle(sM + lang0)
            const ex = -((vo.n - hi.n) / lang) * versatz, nx = ((vo.e - hi.e) / lang) * versatz
            const hA = bestandHoehe(b, vo.e, vo.n), hB = bestandHoehe(b, ev, nv)
            const hA2 = Number.isFinite(hA) ? hA : hv, hB2 = Number.isFinite(hB) ? hB : hA2
            const dE = ev - vo.e, dN = nv - vo.n, flach = Math.hypot(dE, dN) || lang0
            stirnQ.setFromAxisAngle(oben, Math.atan2(dE, -dN))
            neigung.setFromAxisAngle(querAchse, -Math.atan2(hB2 - hA2, flach))
            stirnQ.multiply(neigung)
            const zugB = ZUG_BREITE * mass * gross.x
            stirnS.set(0.6 * ZUG_STIRN_BREITE * zugB, 1, Math.hypot(flach, hB2 - hA2) / 1000)
            for (const seite of [-1, 1]) {
              // die Lampe sitzt seite · ZUG_LAMPE_SEITE Zugbreiten neben der Mitte, quer zur Fahrt (rechts von (dE, dN) ist (dN, −dE))
              const quer = (seite * ZUG_LAMPE_SEITE * zugB * 1000) / flach
              stirnV.set((vo.e + ex + dN * quer - lage.cE) / 1000, hA2 / 1000 + hoehe * gross.y * 0.05, -(vo.n + nx - dE * quer - lage.cN) / 1000)
              m.compose(stirnV, stirnQ, stirnS)
              stirn.setMatrixAt(2 * zahl + (seite + 1) / 2, m)
            }
            m.compose(v, q, skala)
          }
          if (w === 0) netze.lok.setMatrixAt(zahl, m)
          else if (w === ZUG_WAGEN) netze.steuer.setMatrixAt(zahl, m)
          else netze.wagen.setMatrixAt(zahl * (ZUG_WAGEN - 1) + w - 1, m)
        }
        gezeichnet[zahl] = u.f
        if (u.f.id === gewaehlt) {
          zeigt = true
          schild.position.set((lokE - lage.cE) / 1000, (glatt[0] + glatt[1]) / 2000 + hoehe * gross.y * 1.6, -(lokN - lage.cN) / 1000)
          const zeilen = zeilenVon(u.f, st), text = zeilen.join('|')
          if (text !== schildText) { schildText = text; schildMalen(zeilen) }
          linkSetzen((st.art === 'halt' ? u.f.halte[st.i] : u.f.halte[st.i + 1]).abk)
        }
        zahl++
      }
      gezeichnet.length = zahl
      schild.visible = zeigt
      if (!zeigt) linkSetzen(null)
      netze.lok.count = zahl; netze.steuer.count = zahl; netze.wagen.count = zahl * (ZUG_WAGEN - 1)
      stirn.visible = fensterNacht.value > 0; stirn.count = stirn.visible ? 2 * zahl : 0; stirn.instanceMatrix.needsUpdate = true
      lampen.count = 2 * zahl; lampen.instanceMatrix.needsUpdate = true
      stirnStoff.opacity = ZUG_STIRN_HELL * fensterNacht.value
      for (const n of Object.values(netze)) n.instanceMatrix.needsUpdate = true
      // aufleuchten: nur neu färben, wenn sich etwas ändert oder ein Zug leuchtet (die Reihenfolge der Züge wechselt alle 2 s)
      const ziele = zielen()
      if (ziele.size || geleuchtet.size) {
        for (let z = 0; z < zahl; z++) {
          const farbe = ziele.has(gezeichnet[z].id) ? hell : normal
          netze.lok.setColorAt(z, farbe); netze.steuer.setColorAt(z, farbe)
          for (let w = 0; w < ZUG_WAGEN - 1; w++) netze.wagen.setColorAt(z * (ZUG_WAGEN - 1) + w, farbe)
        }
        for (const n of Object.values(netze)) if (n.instanceColor) n.instanceColor.needsUpdate = true
      }
      geleuchtet = ziele
    }
    const gerechnet = new Set<string>()
    k.jeBild.push(schritt)
    return () => {
      weg = true
      const i = k.jeBild.indexOf(schritt); if (i >= 0) k.jeBild.splice(i, 1)
      k.wurzel.remove(gruppe); stoff.dispose(); schild.material.map?.dispose(); schild.material.dispose()
      stirnStoff.map?.dispose(); stirnStoff.dispose(); stirnGeo.dispose(); stirn.dispose(); lampenGeo.dispose(); lampenStoff.dispose(); lampen.dispose()
      k.renderer.domElement.removeEventListener('pointermove', mausZiel); k.renderer.domElement.removeEventListener('pointerleave', mausWeg)
      for (const n of Object.values(netze)) { n.geometry.dispose(); n.dispose() }
    }
  }, [zuege, b, stufe, knoepfe])
  // Schiffe laut Fahrplan (Michael, 2026-10-28: «Ja gern, tolle Idee»), auf 3dland.ch und in Taktland: auf den Kurslinien von swissTLMRegio
  // zwischen den Ländten, wo sie laut Fahrplan jetzt sind (zugStelle wie bei den Zügen); ein Tipp zeigt ein Schild
  const [schiffZeile, setSchiffZeile] = useState<string | null>(null)
  useEffect(() => {
    const k = kern.current
    const lage = k?.wurzel.userData.lage as { cE: number; cN: number } | undefined
    const W = k?.wurzel.userData.weiteKm as number | undefined
    if (!k || !lage || !W || !schiffe || grob(stufe)) { setSchiffZeile(null); return }
    let weg = false
    const gruppe = new THREE.Group()
    gruppe.name = 'schiffe'
    gruppe.userData.bleibt = true
    k.wurzel.add(gruppe)
    // ein Schiff SCHIFF_M lang, in der Region etwas länger, damit man es sieht; die Form gewählt (SchiffForm.ts)
    const laenge = Math.max(SCHIFF_M / 1000, W * 0.01), mass = laenge / (SCHIFF_M / 1000)
    const stoff = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    const netz = new THREE.InstancedMesh(schiffForm(), stoff, SCHIFFE_HOECHSTENS)
    netz.count = 0; netz.castShadow = true; netz.frustumCulled = false
    const normal = new THREE.Color(1, 1, 1), hell = new THREE.Color(...ZUG_ZIEL_HELL)
    for (let i = 0; i < SCHIFFE_HOECHSTENS; i++) netz.setColorAt(i, normal)
    gruppe.add(netz)
    const schild = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, sizeAttenuation: false }))
    schild.center.set(0.5, 0); schild.renderOrder = 6; schild.visible = false
    gruppe.add(schild)
    const schildMalen = (zeilen: string[]) => {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      const px = 26, klein = 21, fett = `bold ${px}px Helvetica, Arial, sans-serif`, duenn = `normal ${klein}px Helvetica, Arial, sans-serif`
      x.font = fett; let breit = x.measureText(zeilen[0]).width
      x.font = duenn; for (const z of zeilen.slice(1)) breit = Math.max(breit, x.measureText(z).width)
      c.width = Math.ceil(breit) + 20; c.height = px + 16 + (zeilen.length - 1) * (klein + 6)
      x.fillStyle = ORT_GRAU; x.beginPath(); x.roundRect(0, 0, c.width, c.height, SCHILD_RUND_PX); x.fill()
      x.fillStyle = '#ffffff'; x.font = fett; x.fillText(zeilen[0], 10, px + 4)
      x.font = duenn; zeilen.slice(1).forEach((z, i) => x.fillText(z, 10, px + 8 + (i + 1) * (klein + 6)))
      schild.material.map?.dispose()
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      schild.material.map = t; schild.material.needsUpdate = true
      schild.userData = { b: c.width * 0.00085, h: c.height * 0.00085, verhaeltnis: c.width / c.height, brilleM: 0.03 }
      if (!k.renderer.xr.isPresenting) schild.scale.set(schild.userData.b, schild.userData.h, 1)
    }
    const uhr = (min: number | null) => {
      if (min === null) return ''
      const m = ((Math.round(min) % 1440) + 1440) % 1440
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    }
    let daten: Schiffe | null = null, unterwegs: Array<{ f: ZugFahrt; st: ZugStelle }> = [], neuUm = 0
    let gezeichnet: ZugFahrt[] = [], gewaehlt: number | null = null, schildText = ''
    const mitten: THREE.Vector3[] = []
    const zeilenVon = (f: ZugFahrt, st: ZugStelle): string[] => {
      const name = (i: string) => daten?.laendten[Number(i)]?.name ?? i
      const h = f.halte, halt = st.art === 'halt' ? h[st.i] : h[st.i + 1]
      const titel = `${f.gattung === 'FAE' ? 'Fähre' : 'Schiff'} ${f.nummer}`.trim()
      const zweite = st.art === 'halt'
        ? (st.i === h.length - 1 ? `in ${name(halt.abk)}, an ${uhr(halt.an)}` : st.i === 0 ? `in ${name(halt.abk)}, ab ${uhr(halt.ab)}`
          : `in ${name(halt.abk)}, an ${uhr(halt.an)}, ab ${uhr(halt.ab)}`)
        : `nächster Halt ${name(halt.abk)}, an ${uhr(halt.an ?? halt.ab)}`
      return [`${titel} nach ${f.ziel}`, zweite, 'laut Fahrplan']
    }
    const finden = (r: THREE.Ray, grenze: number) => {
      let best = -1, bestWinkel = grenze
      const w = new THREE.Vector3(), zu = new THREE.Vector3()
      mitten.forEach((p, i) => {
        if (i >= gezeichnet.length) return
        w.copy(p); k.wurzel.localToWorld(w)
        zu.copy(w).sub(r.origin)
        if (zu.lengthSq() < 1e-18 || zu.dot(r.direction) <= 0) return
        const winkel = zu.angleTo(r.direction)
        if (winkel < bestWinkel) { bestWinkel = winkel; best = i }
      })
      return best
    }
    const waehlen = (f: ZugFahrt | undefined) => {
      if (!f) return false
      gewaehlt = gewaehlt === f.id ? null : f.id
      knopfTon(gewaehlt !== null)
      return true
    }
    gruppe.userData.wahl = (o: THREE.Object3D, i: number) => o === netz && waehlen(gezeichnet[i])
    gruppe.userData.nahe = (r: THREE.Ray, grenze: number) => waehlen(gezeichnet[finden(r, grenze)])
    gruppe.userData.abwahl = () => { gewaehlt = null }
    let maus: THREE.Vector2 | null = null
    const mausZiel = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse') return
      const r = k.renderer.domElement.getBoundingClientRect()
      maus = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
    }
    const mausWeg = () => { maus = null }
    k.renderer.domElement.addEventListener('pointermove', mausZiel)
    k.renderer.domElement.addEventListener('pointerleave', mausWeg)
    const zielStrahl = new THREE.Raycaster(), handDreh = new THREE.Matrix4()
    let geleuchtet = new Set<number>()
    const zielen = () => {
      const ziele = new Set<number>()
      if (k.renderer.xr.isPresenting) {
        for (const i of [0, 1]) {
          const c = k.renderer.xr.getController(i)
          if (!c.visible) continue
          zielStrahl.ray.origin.setFromMatrixPosition(c.matrixWorld)
          zielStrahl.ray.direction.set(0, 0, -1).applyMatrix4(handDreh.extractRotation(c.matrixWorld))
          const z = finden(zielStrahl.ray, ZUG_TIPP_WINKEL_BRILLE)
          if (z >= 0) ziele.add(gezeichnet[z].id)
        }
      } else if (maus) {
        zielStrahl.setFromCamera(maus, k.kamera)
        const z = finden(zielStrahl.ray, ZUG_TIPP_WINKEL)
        if (z >= 0) ziele.add(gezeichnet[z].id)
      }
      return ziele
    }
    const teile = [...b.teile.values()]
    const drin = (e: number, n: number) => teile.some((t) => imRaster(t.raster, e, n))
    void schiffeLaden().then((d) => {
      if (weg) return
      daten = d
      if (!d) { setSchiffZeile('Schiffe: der Fahrplan ist hier nicht geladen.'); return }
      const st = /^\d{8}$/.test(d.stand) ? `${Number(d.stand.slice(6))}.${Number(d.stand.slice(4, 6))}.${d.stand.slice(0, 4)}` : d.stand
      setSchiffZeile(`Schiffe laut Fahrplan vom ${st}, nicht live`)
    })
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), skala = new THREE.Vector3(), oben = new THREE.Vector3(0, 1, 0)
    const mitte = new THREE.Vector3(), auge = new THREE.Vector3()
    const schritt = () => {
      if (!daten) return
      const jetzt = jetztImFahrplan(daten)
      if (performance.now() > neuUm) {
        neuUm = performance.now() + 2000
        unterwegs = []
        for (const f of daten.fahrten) { const st = zugStelle(f, jetzt.tag, jetzt.minuten); if (st) unterwegs.push({ f, st }) }
      }
      // aus der Ferne grösser, wie die Züge: mindestens SCHIFF_FERN des Abstands der Kamera lang
      k.wurzel.getWorldPosition(mitte)
      const cam = k.renderer.xr.isPresenting ? k.renderer.xr.getCamera() : k.kamera
      const abstand = cam.getWorldPosition(auge).distanceTo(mitte) / Math.max(1e-9, k.wurzel.scale.x)
      const gross = Math.max(1, (abstand * SCHIFF_FERN) / laenge)
      skala.setScalar(mass * gross)
      let zahl = 0, zeigt = false
      for (const u of unterwegs) {
        if (zahl >= SCHIFFE_HOECHSTENS) break
        const st = zugStelle(u.f, jetzt.tag, jetzt.minuten)
        if (!st) continue
        const h = u.f.halte
        const [j, anteil] = st.art === 'fahrt' ? [st.i, st.anteil] : st.i + 1 < h.length ? [st.i, 0] : [st.i - 1, 1]
        const w = daten.weg(h[j].abk, h[j + 1].abk)
        if (!w) continue
        const p = schiffBei(w, anteil * w.laenge)
        if (!drin(p.e, p.n)) continue
        const z = bestandHoehe(b, p.e, p.n)
        if (!Number.isFinite(z)) continue
        v.set((p.e - lage.cE) / 1000, z / 1000, -(p.n - lage.cN) / 1000)
        q.setFromAxisAngle(oben, Math.atan2(p.de, -p.dn))
        m.compose(v, q, skala)
        netz.setMatrixAt(zahl, m)
        ;(mitten[zahl] ??= new THREE.Vector3()).copy(v)
        gezeichnet[zahl] = u.f
        if (u.f.id === gewaehlt) {
          zeigt = true
          schild.position.set(v.x, v.y + 0.012 * mass * gross, v.z)
          const zeilen = zeilenVon(u.f, st), text = zeilen.join('|')
          if (text !== schildText) { schildText = text; schildMalen(zeilen) }
        }
        zahl++
      }
      gezeichnet.length = zahl
      schild.visible = zeigt
      netz.count = zahl
      netz.instanceMatrix.needsUpdate = true
      const ziele = zielen()
      if (ziele.size || geleuchtet.size) {
        for (let i = 0; i < zahl; i++) netz.setColorAt(i, ziele.has(gezeichnet[i].id) ? hell : normal)
        if (netz.instanceColor) netz.instanceColor.needsUpdate = true
      }
      geleuchtet = ziele
    }
    k.jeBild.push(schritt)
    // nur in einer Testfassung (VITE_S3D_TEST): wo die Schiffe auf dem Bild sind, in Bildpunkten
    if (import.meta.env.VITE_S3D_TEST) {
      ;(window as unknown as { s3dSchiffe: unknown }).s3dSchiffe = () => {
        const r = k.renderer.domElement.getBoundingClientRect()
        return mitten.slice(0, gezeichnet.length).map((p) => {
          const w = k.wurzel.localToWorld(p.clone()).project(k.kamera)
          return [r.left + ((w.x + 1) / 2) * r.width, r.top + ((1 - w.y) / 2) * r.height]
        })
      }
    }
    return () => {
      weg = true
      const i = k.jeBild.indexOf(schritt); if (i >= 0) k.jeBild.splice(i, 1)
      k.wurzel.remove(gruppe); stoff.dispose(); netz.geometry.dispose(); netz.dispose(); schild.material.map?.dispose(); schild.material.dispose()
      k.renderer.domElement.removeEventListener('pointermove', mausZiel); k.renderer.domElement.removeEventListener('pointerleave', mausWeg)
    }
  }, [schiffe, b, stufe, knoepfe])
  // Wolken aus dem Wettermodell ICON-CH1-EPS von MeteoSchweiz (src/wolken.ts; Michael, 2026-10-28: «Jetzt die Wolken angehen»), mit dem Knopf
  // «Wetter», in der ganzen Schweiz und in der Region; zur gewählten Zeit der Sonne, sonst jetzt
  const [wolkenZeile, setWolkenZeile] = useState<string | null>(null)
  const wolkenViertel = stand ? Math.round(stand.zeit.getTime() / 900_000) : -1
  const [jetztTakt, setJetztTakt] = useState(() => Math.floor(Date.now() / 600_000))
  useEffect(() => {
    if (stand) return
    const t = window.setInterval(() => setJetztTakt(Math.floor(Date.now() / 600_000)), 60_000)
    return () => window.clearInterval(t)
  }, [stand])
  useEffect(() => {
    const k = kern.current
    const lage = k?.wurzel.userData.lage as { cE: number; cN: number } | undefined
    if (!k || !lage || !wolken) { setWolkenZeile(null); return }
    let weg = false
    const gruppe = new THREE.Group()
    gruppe.name = 'wolken'
    gruppe.userData.bleibt = true
    k.wurzel.add(gruppe)
    const rand = [...b.teile.values()].map((t) => t.rahmen)
    const e0 = Math.min(...rand.map((x) => x.e0)), e1 = Math.max(...rand.map((x) => x.e0 + x.b))
    const n0 = Math.min(...rand.map((x) => x.n1 - x.h)), n1 = Math.max(...rand.map((x) => x.n1))
    const weg3: Array<{ dispose: () => void }> = []
    const zeit = stand?.zeit ?? new Date()
    void wolkenLaden().then((w) => {
      if (weg) return
      if (!w) { setWolkenZeile('Wolken: die Prognose von MeteoSchweiz ist hier nicht geladen.'); return }
      const uhr = (ms: number) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms)
      const st = wolkenStunde(w, zeit)
      if (st === null) { setWolkenZeile(`Wolken: für ${uhr(zeit.getTime())} gibt es keine Prognose, nur für ${uhr(w.zeiten[0])} bis ${uhr(w.zeiten[w.zeiten.length - 1])}.`); return }
      // in echter Höhe, wo es sie für diese Stunde gibt (Michael, 2026-10-29), sonst die drei Schichten auf gewählten Höhen
      const j3 = wolken3dStunde(w, st)
      const ebenen = j3 !== null ? wolkenEbenen3d(w, j3, e0, n0, e1, n1)
        : WOLKEN_HOEHE_M.map((hoeheM, j) => ({ hoeheM, bild: wolkenBild(w, st, j, e0, n0, e1, n1) }))
      ebenen.forEach(({ hoeheM, bild }) => {
        if (!bild) return
        const tex = new THREE.CanvasTexture(bild); tex.colorSpace = THREE.SRGBColorSpace
        const geo = new THREE.PlaneGeometry((e1 - e0) / 1000, (n1 - n0) / 1000); geo.rotateX(-Math.PI / 2)
        const stoff = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
        const tiefe = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 })
        const netz = new THREE.Mesh(geo, stoff)
        netz.position.set(((e0 + e1) / 2 - lage.cE) / 1000, hoeheM / 1000, -((n0 + n1) / 2 - lage.cN) / 1000)
        netz.castShadow = true; netz.customDepthMaterial = tiefe; netz.renderOrder = 3
        gruppe.add(netz)
        weg3.push(tex, geo, stoff, tiefe)
      })
      setWolkenZeile(`Wolken laut Prognose von MeteoSchweiz für ${uhr(w.zeiten[st])}${j3 !== null ? ', in der Höhe des Modells' : ''}`)
    })
    return () => {
      weg = true
      k.wurzel.remove(gruppe)
      for (const x of weg3) x.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wolken, b, stufe, zusatz, knoepfe, wolkenViertel, jetztTakt])
  // Regen und Schnee (Niederschlag.ts; Michael, 2026-10-28: «Regen soll aus den Wolken kommen und nicht von viel weiter oben»): laut
  // Wettermodell ICON-CH1 (src/wolken.ts) je Zelle von 2 km, wo und wie stark es fällt, von der untersten gezeichneten Wolke darüber bis
  // zum Boden, über der Schneefallgrenze als Schnee; in jeder Stufe dasselbe Wetter; ohne diese Daten wie bisher die Station über dem ganzen Modell
  const regen = useRef<Niederschlag | null>(null)
  const [niederZeile, setNiederZeile] = useState<string | null>(null)
  useEffect(() => {
    const k = kern.current
    const lage = k?.wurzel.userData.lage as { cE: number; cN: number } | undefined
    const W = k?.wurzel.userData.weiteKm as number | undefined
    if (!k || !lage || !W || !windAn) { niederModell(undefined); setNiederZeile(null); return }
    let tief = Infinity, hoch = -Infinity
    for (const t of b.teile.values()) t.h.forEach((h, q) => { if (h === KEINE_HOEHE) return; const w = t.wasser?.[q], z = w !== undefined && !Number.isNaN(w) ? Math.max(h, w) : h; if (z < tief) tief = z; if (z > hoch) hoch = z })
    if (tief === Infinity) return
    const rand = [...b.teile.values()].map((t) => t.rahmen)
    const e0 = Math.min(...rand.map((x) => x.e0)), e1 = Math.max(...rand.map((x) => x.e0 + x.b))
    const n0 = Math.min(...rand.map((x) => x.n1 - x.h)), n1 = Math.max(...rand.map((x) => x.n1))
    const ns = niederschlagBauen()
    ns.gruppe.userData.bleibt = true
    k.wurzel.add(ns.gruppe)
    regen.current = ns
    const zuX = (e: number) => (e - lage.cE) / 1000, zuZ = (n: number) => -(n - lage.cN) / 1000
    const boden = (x: number, z: number) => bestandHoehe(b, lage.cE + x * 1000, lage.cN - z * 1000) / 1000
    const flaeche = ((e1 - e0) / 1000) * ((n1 - n0) / 1000)
    // ein Regenstrich etwa 1,2 % der Breite des Modells lang
    const strich = W * 0.012
    // seit die Wolken in jeder Stufe stehen (2026-10-29), beginnt der Regen auch in den Feldern an der Wolke
    const deckel = Infinity
    let weg = false
    const zeit = stand?.zeit ?? new Date()
    const station = () => {
      // die Station: gleichmässig über dem ganzen Modell, von der tiefen Wolkenschicht oder 300 m über dem höchsten Punkt
      const oben = Math.min(deckel, Math.max(WOLKEN_HOEHE_M[0], hoch + 300) / 1000)
      ns.setzen(nieder ? [{ x0: zuX(e0), x1: zuX(e1), z0: zuZ(n1), z1: zuZ(n0), oben, staerke: nieder.staerke,
        schneeAb: nieder.art === 'schnee' ? -Infinity : Infinity }] : [], boden, flaeche, strich)
      niederModell(undefined); setNiederZeile(null)
    }
    void wolkenLaden().then((w) => {
      if (weg) return
      const st = w ? wolkenStunde(w, zeit) : null
      if (!w || st === null || !w.nieder) { station(); return }
      const s = w.ix.schritt_m, saeulen: Saeule[] = []
      let regenSumme = 0, schneeSumme = 0
      for (let ze = Math.floor(e0 / s) * s; ze < e1; ze += s) {
        for (let zn = Math.floor(n0 / s) * s; zn < n1; zn += s) {
          const a0 = Math.max(e0, ze), a1 = Math.min(e1, ze + s), b0 = Math.max(n0, zn), b1 = Math.min(n1, zn + s)
          if (a1 <= a0 || b1 <= b0) continue
          const me = (a0 + a1) / 2, mn = (b0 + b1) / 2
          const nd = niederschlagBei(w, st, me, mn)
          if (!nd || nd.mm < NASS_AB_MM) continue
          // die Stärke wie bei der Prognose der Station (voll ab 4 mm in der Stunde)
          const staerke = staerkeAus(nd.mm / 2)
          // die unterste gezeichnete Wolke über dem Boden dieser Zelle, sonst die unterste Schicht über dem Boden
          const grund = bestandHoehe(b, me, mn)
          let obenM: number | undefined
          const j3 = wolken3dStunde(w, st), z3 = w.ix.wolken3d
          if (j3 !== null && z3) {
            // die Unterkante der untersten Wolke in echter Höhe über dem Boden
            for (let k = 0; k < z3.stufen && obenM === undefined; k++) {
              const unterkante = z3.unten_m + k * z3.schritt_m
              if (unterkante + z3.schritt_m <= grund) continue
              if ((bewoelkung3d(w, j3, k, me, mn) ?? 0) >= 0.1) obenM = Math.max(grund + 50, unterkante)
            }
          }
          if (obenM === undefined) {
            const ueber = WOLKEN_HOEHE_M.filter((hm) => hm > grund + 50)
            const mitWolke = ueber.find((hm) => (bewoelkung(w, st, WOLKEN_HOEHE_M.indexOf(hm), me, mn) ?? 0) >= 0.1)
            obenM = mitWolke ?? ueber[0] ?? grund + 300
          }
          const schneeAb = nd.schneeAbM === null ? Infinity : nd.schneeAbM / 1000
          saeulen.push({ x0: zuX(a0), x1: zuX(a1), z0: zuZ(b1), z1: zuZ(b0), oben: Math.min(deckel, obenM / 1000), staerke, schneeAb })
          const anteil = ((a1 - a0) * (b1 - b0)) / 1e6 / flaeche
          if (nd.schneeAbM !== null && grund >= nd.schneeAbM) schneeSumme += staerke * anteil; else regenSumme += staerke * anteil
        }
      }
      ns.setzen(saeulen, boden, flaeche, strich)
      // fürs Geräusch der Mittel über das Modell, Regen vor Schnee
      niederModell(regenSumme > 0.002 ? { art: 'regen', staerke: Math.min(1, regenSumme) } : schneeSumme > 0.002 ? { art: 'schnee', staerke: Math.min(1, schneeSumme) } : null)
      const uhr = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(w.zeiten[st])
      setNiederZeile(saeulen.length ? `Regen und Schnee laut Prognose von MeteoSchweiz für ${uhr}` : null)
    })
    let alt = performance.now()
    const mitte = new THREE.Vector3(), auge = new THREE.Vector3()
    const schritt = () => {
      const t = performance.now()
      const cam = k.renderer.xr.isPresenting ? k.renderer.xr.getCamera() : k.kamera
      mitte.set(((e0 + e1) / 2 - lage.cE) / 1000, (tief + hoch) / 2000, -((n0 + n1) / 2 - lage.cN) / 1000).applyMatrix4(k.wurzel.matrixWorld)
      auge.setFromMatrixPosition(cam.matrixWorld)
      ns.schritt(Math.min(0.1, (t - alt) / 1000), mitte.distanceTo(auge) / (W * k.wurzel.scale.x))
      alt = t
    }
    k.jeBild.push(schritt)
    return () => {
      weg = true
      k.wurzel.remove(ns.gruppe); ns.entsorgen(); regen.current = null
      const i = k.jeBild.indexOf(schritt); if (i >= 0) k.jeBild.splice(i, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windAn, b, stufe, zusatz, knoepfe, wolkenViertel, jetztTakt, nieder?.art, nieder?.staerke])
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
      {/* Züge und Schiffe sind laut Fahrplan, nicht live: das steht beim Bild, solange sie zu sehen sind; oben rechts, eng untereinander, damit
          sie nicht ins Bild ragen und «Eintauchen» oben links frei bleibt (Michael, 2026-10-28: «Die Hinweise oben links sollen weiter oben stehen») */}
      {(zugZeile || schiffZeile) && (
        <div className="pointer-events-none absolute right-2 top-2 flex max-w-[60%] flex-col items-end gap-0.5 text-right">
          {zugZeile && (
            <p className="rounded bg-white/85 px-1.5 py-0.5 text-[11px] leading-tight text-sbb-black dark:bg-sbb-midnight/85 dark:text-sbb-white">{zugZeile}</p>
          )}
          {zugZeile && zugLink && (
            <a href={zugLink.url} {...(AUF_3DLAND ? { target: '_blank', rel: 'noopener' } : {})}
              className="pointer-events-auto rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium leading-tight text-sbb-red underline dark:bg-sbb-midnight/90">
              Bahnhof {zugLink.name}: Perrons und Gleise{AUF_3DLAND ? ' auf taktland.ch ↗' : ''}
            </a>
          )}
          {schiffZeile && (
            <p className="rounded bg-white/85 px-1.5 py-0.5 text-[11px] leading-tight text-sbb-black dark:bg-sbb-midnight/85 dark:text-sbb-white">{schiffZeile}</p>
          )}
        </div>
      )}
      {(wolkenZeile || niederZeile) && (
        <p className={'pointer-events-none absolute left-2 max-w-[70%] ' + (tablet ? 'bottom-20' : 'bottom-16') + ' rounded bg-white/85 px-1.5 py-0.5 text-[11px] leading-tight text-sbb-black dark:bg-sbb-midnight/85 dark:text-sbb-white'}>
          {wolkenZeile}{wolkenZeile && niederZeile && <br />}{niederZeile}
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
  for (const t of b.teile.values()) t.h.forEach((h, q) => { if (h === KEINE_HOEHE) return; const w = t.wasser?.[q], z = w !== undefined && !Number.isNaN(w) ? Math.max(h, w) : h; if (z < tief) tief = z; if (z > hoch) hoch = z })
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
    const [hoeheArt, radiusArt] = BAUM_FORM[art] ?? BAUM_FORM[0]
    const j = nadel[i] ? 1 : 0, netz = netze[j], radius = radiusArt * (nadel[i] ? NADEL_BREITE : 1), hoehe = hoeheArt * (nadel[i] ? NADEL_HOEHE : 1)
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
