import { holen, holenBinaer } from './daten'

/**
 * Gelände der ganzen Schweiz in Kacheln von 10 km (pipeline/build_gelaende.py), für «3D» auf
 * jeder Fahrt (Michael, 2026-10-06: «dass man alle Strecken optional 3D darstellen könnte»).
 * Geladen wird nur, was rund um den Zug liegt; three.js steckt weiter in komponenten/Relief.tsx.
 */

interface GelaendeIndex {
  quelle: string; geladen: string; kachel_m: number; raster_m: number; zellen: number; kacheln: string[]
}

export const gelaendeIndex = () => holen<GelaendeIndex>('data/gelaende/index.json')

/** Entpacken braucht DecompressionStream (Safari ab 16.4); sonst gibt es kein «3D» */
export const gelaendeMoeglich = () => typeof DecompressionStream !== 'undefined'

/** Eine Höhe 0 heisst: hier gibt es keine Kachel (die Schweiz liegt überall höher) */
export const KEINE_HOEHE = 0

const vorrat = new Map<string, Promise<Uint16Array | null>>()

function kachelLaden(name: string, zellen: number) {
  let p = vorrat.get(name)
  if (!p) {
    p = (async () => {
      const gepackt = await holenBinaer(`data/gelaende/${name}.hgz`)
      const roh = await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      // je Zeile Differenzen zum linken Nachbarn, das erste Feld ist die Höhe
      const d = new Int16Array(roh), h = new Uint16Array(zellen * zellen)
      for (let j = 0; j < zellen; j++) {
        let v = 0
        for (let i = 0; i < zellen; i++) {
          v = i === 0 ? d[j * zellen] : v + d[j * zellen + i]
          h[j * zellen + i] = v
        }
      }
      return h
    })().catch(() => { vorrat.delete(name); return null })
    vorrat.set(name, p)
  }
  return p
}

export interface Raster { ost: number; nord: number; m: number; breite: number; hoehe: number }

async function fensterRaster(mitteE: number, mitteN: number, seite_m: number): Promise<Raster> {
  const { raster_m: m } = await gelaendeIndex()
  const breite = Math.round(seite_m / m)
  return { ost: Math.floor((mitteE - seite_m / 2) / m) * m, nord: Math.ceil((mitteN + seite_m / 2) / m) * m, m, breite, hoehe: breite }
}

/** Ein Ausschnitt von seite_m auf seite_m um eine Mitte (Landeskoordinaten), beim Fahren */
export async function fensterLaden(mitteE: number, mitteN: number, seite_m: number) {
  return ausschnittLaden(await fensterRaster(mitteE, mitteN, seite_m))
}

/** Die Kacheln und Luftbilder des nächsten Fensters schon laden, solange der Zug noch im jetzigen fährt (Michael,
 *  2026-10-08: bei hohem Tempo «nicht schnell genug nachgebaut»); sie bleiben im Vorrat, das Fenster selbst ist
 *  dann gleich da */
export async function fensterVorladen(mitteE: number, mitteN: number, seite_m: number) {
  const raster = await fensterRaster(mitteE, mitteN, seite_m)
  const ix = await gelaendeIndex()
  const { kachel_m: k, zellen } = ix
  const vorhanden = new Set(ix.kacheln)
  const laden: Array<Promise<unknown>> = [luftbildLaden(raster)]
  for (let ex = Math.floor(raster.ost / k); ex <= Math.floor((raster.ost + raster.breite * raster.m - 1) / k); ex++) {
    for (let ny = Math.floor((raster.nord - raster.hoehe * raster.m) / k); ny <= Math.floor((raster.nord - 1) / k); ny++) {
      if (vorhanden.has(`${ex}_${ny}`)) laden.push(kachelLaden(`${ex}_${ny}`, zellen))
    }
  }
  await Promise.all(laden)
}

/** Ein Ausschnitt im 50-m-Raster der Kacheln, aus ihnen zusammengesetzt (auch die Bergstrecken,
 *  Michael, 2026-10-06: «auf die Kacheln umstellen»); wo keine Kachel liegt, steht KEINE_HOEHE */
export async function ausschnittLaden(raster: Raster, nurKacheln?: Set<string>) {
  const ix = await gelaendeIndex()
  const { kachel_m: k, raster_m: m, zellen } = ix
  if (raster.m !== m) throw new Error(`Der Ausschnitt hat ${raster.m} m, die Kacheln ${m} m`)
  const vorhanden = new Set(ix.kacheln)
  const { ost, nord, breite, hoehe } = raster
  const h = new Uint16Array(breite * hoehe).fill(KEINE_HOEHE)
  const kacheln: string[] = []
  for (let ex = Math.floor(ost / k); ex <= Math.floor((ost + breite * m - 1) / k); ex++) {
    for (let ny = Math.floor((nord - hoehe * m) / k); ny <= Math.floor((nord - 1) / k); ny++) {
      // nurKacheln: nur die entlang einer Strecke (ganze Strecke in der Brille)
      if (vorhanden.has(`${ex}_${ny}`) && (!nurKacheln || nurKacheln.has(`${ex}_${ny}`))) kacheln.push(`${ex}_${ny}`)
    }
  }
  const geladen = await Promise.all(kacheln.map((n) => kachelLaden(n, zellen)))
  kacheln.forEach((n, x) => {
    const kh = geladen[x]
    if (!kh) return
    const [ex, ny] = n.split('_').map(Number)
    // Feld des Ausschnitts, in dem die Kachel beginnt (links oben), und die Überlappung
    const i0 = (ex * k - ost) / m, j0 = (nord - (ny + 1) * k) / m
    for (let j = Math.max(0, j0); j < Math.min(hoehe, j0 + zellen); j++) {
      for (let i = Math.max(0, i0); i < Math.min(breite, i0 + zellen); i++) {
        h[j * breite + i] = kh[(j - j0) * zellen + (i - i0)]
      }
    }
  })
  return { raster: { ost, nord, m, breite, hoehe }, h, quelle: ix.quelle }
}

/**
 * Luftbild auf dem Gelände (Michael, 2026-10-06: «die Landschaft ist leer»): SWISSIMAGE von swisstopo,
 * auf 10 m gemittelt, in denselben 10-km-Kacheln (pipeline/build_luftbild.py). Fehlt eine Kachel,
 * bleibt das Gelände dort in seinen Farben.
 */
interface LuftbildIndex {
  quelle: string; kachel_m: number; pixel: number; kacheln: Record<string, { jahre: number[] }>
}
export const luftbildIndex = () => holen<LuftbildIndex>('data/luftbild/index.json')

/** so viele Bilder bleiben geladen (je etwa 4 MB): auf einer langen Fahrt füllten sie sonst den
 *  Speicher des Telefons, und neue Bilder liessen sich nicht mehr entpacken */
const BILDER_HOECHSTENS = 25
const bildVorrat = new Map<string, Promise<ImageBitmap | null>>()
function luftbildKachel(name: string, px: number, voll: number) {
  const schluessel = `${name}@${px}`
  let p = bildVorrat.get(schluessel)
  if (p) {
    // zuletzt gebraucht ans Ende
    bildVorrat.delete(schluessel); bildVorrat.set(schluessel, p)
  } else {
    while (bildVorrat.size >= BILDER_HOECHSTENS) bildVorrat.delete(bildVorrat.keys().next().value!)
    p = holenBinaer(`data/luftbild/${name}.jpg`)
      .then((b) => createImageBitmap(new Blob([b], { type: 'image/jpeg' }),
        px < voll ? { resizeWidth: px, resizeHeight: px, resizeQuality: 'medium' } : undefined))
      .then(ohneLeeres)
      .catch(() => { bildVorrat.delete(schluessel); return null })
    bildVorrat.set(schluessel, p)
  }
  return p
}

/** Wo swisstopo keine Aufnahme hat (jenseits der Grenze), ist die Kachel reinweiss (Michael, 2026-10-08: «bei der
 *  Furkastrecke nicht alle Kacheln dargestellt»; bei Binn fast die Hälfte). Dort durchsichtig, damit das Gelände in
 *  seinen Farben erscheint wie bei einer fehlenden Kachel; Schnee und Gletscher erreichen nicht in allen drei Farben 250. */
export async function ohneLeeres(bild: ImageBitmap, saum = 0): Promise<ImageBitmap> {
  if (typeof OffscreenCanvas === 'undefined') return bild
  const c = new OffscreenCanvas(bild.width, bild.height)
  // im Speicher statt auf der Grafikkarte, sonst ist das Auslesen sehr langsam
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return bild
  g.drawImage(bild, 0, 0)
  const daten = g.getImageData(0, 0, c.width, c.height), d = daten.data
  let leer = false
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] >= 250 && d[i + 1] >= 250 && d[i + 2] >= 250) { d[i + 3] = 0; leer = true }
  }
  if (!leer) return bild
  // den Rand um saum Bildpunkte nach innen schieben, je einmal waagrecht und senkrecht
  const w = c.width, h = c.height
  for (let schritt = 0; schritt < saum; schritt++) {
    const weg = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] === 0) continue
        const leerBei = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < w && yy < h && d[(yy * w + xx) * 4 + 3] === 0
        if (leerBei(x - 1, y) || leerBei(x + 1, y) || leerBei(x, y - 1) || leerBei(x, y + 1)) weg[y * w + x] = 1
      }
    }
    for (let k = 0; k < w * h; k++) if (weg[k]) d[k * 4 + 3] = 0
  }
  g.putImageData(daten, 0, 0)
  bild.close()
  return createImageBitmap(c)
}

export interface Luftbild {
  kacheln: Array<{ ex: number; ny: number; bild: ImageBitmap }>
  kachel_m: number
  /** die Aufnahmejahre in diesem Ausschnitt */
  jahre: number[]
}

/** Die Luftbilder, die einen Ausschnitt berühren, oder null, wenn es dort keine gibt. So fein, wie die Leinwand
 *  der Szene sie zeigt (4096 Bildpunkte über die längere Seite): für eine ganze Strecke in der Brille kleiner, sonst
 *  füllen Hunderte Bilder den Speicher */
export async function luftbildLaden(raster: Raster, nurKacheln?: Set<string>): Promise<Luftbild | null> {
  const ix = await luftbildIndex().catch(() => null)
  if (!ix) return null
  const k = ix.kachel_m
  const px = Math.max(64, Math.min(ix.pixel, Math.round((4096 * k) / (Math.max(raster.breite, raster.hoehe) * raster.m))))
  const namen: Array<[number, number]> = []
  for (let ex = Math.floor(raster.ost / k); ex <= Math.floor((raster.ost + raster.breite * raster.m - 1) / k); ex++) {
    for (let ny = Math.floor((raster.nord - raster.hoehe * raster.m) / k); ny <= Math.floor((raster.nord - 1) / k); ny++) {
      if (ix.kacheln[`${ex}_${ny}`] && (!nurKacheln || nurKacheln.has(`${ex}_${ny}`))) namen.push([ex, ny])
    }
  }
  if (!namen.length) return null
  const bilder = await Promise.all(namen.map(([ex, ny]) => luftbildKachel(`${ex}_${ny}`, px, ix.pixel)))
  const kacheln = namen.flatMap(([ex, ny], i) => (bilder[i] ? [{ ex, ny, bild: bilder[i]! }] : []))
  if (!kacheln.length) return null
  const jahre = [...new Set(kacheln.flatMap(({ ex, ny }) => ix.kacheln[`${ex}_${ny}`].jahre))].sort()
  return { kacheln, kachel_m: k, jahre }
}

/**
 * Nahbild (Michael, 2026-10-10: «die Landschaft ist sehr verschwommen»): dasselbe Luftbild auf 2,5 m, nur bis 500 m
 * neben den Bahnlinien, je Kilometer ein Bild (pipeline/build_luftbild_nah.py); weiter weg weiss, hier durchsichtig.
 * Die Szene legt es nur in ein paar Kilometern um den Blickpunkt über das Luftbild.
 */
interface NahbildIndex { je_km: number; nah_m: number; km: Record<string, number> }
export const nahbildIndex = () => holen<NahbildIndex>('data/luftbild_nah/index.json')
/** am Rand des Streifens verschmiert das JPEG Weiss ins Bild: so viele Bildpunkte (je 2,5 m) daneben auch durchsichtig */
const NAH_SAUM = 4
/** so viele Kilometerbilder bleiben geladen (je 400 × 400 Bildpunkte) */
const NAH_HOECHSTENS = 120
const nahVorrat = new Map<string, Promise<ImageBitmap | null>>()
function nahKachel(name: string) {
  let p = nahVorrat.get(name)
  if (p) { nahVorrat.delete(name); nahVorrat.set(name, p); return p }
  while (nahVorrat.size >= NAH_HOECHSTENS) nahVorrat.delete(nahVorrat.keys().next().value!)
  p = holenBinaer(`data/luftbild_nah/${name}.jpg`)
    .then((b) => createImageBitmap(new Blob([b], { type: 'image/jpeg' })))
    .then((b) => ohneLeeres(b, NAH_SAUM))
    .catch(() => { nahVorrat.delete(name); return null })
  nahVorrat.set(name, p)
  return p
}

export interface Nahbild { kacheln: Array<{ ke: number; kn: number; bild: ImageBitmap }>; jahre: number[] }

/** die Kilometerbilder im Rechteck (Landeskoordinaten), oder null, wenn es dort keine gibt */
export async function nahbildLaden(e0: number, n0: number, e1: number, n1: number): Promise<Nahbild | null> {
  const ix = await nahbildIndex().catch(() => null)
  if (!ix) return null
  const namen: Array<[number, number]> = []
  for (let ke = Math.floor(e0 / 1000); ke <= Math.floor((e1 - 1) / 1000); ke++) {
    for (let kn = Math.floor(n0 / 1000); kn <= Math.floor((n1 - 1) / 1000); kn++) if (ix.km[`${ke}_${kn}`]) namen.push([ke, kn])
  }
  if (!namen.length) return null
  const bilder = await Promise.all(namen.map(([ke, kn]) => nahKachel(`${ke}_${kn}`)))
  const kacheln = namen.flatMap(([ke, kn], i) => (bilder[i] ? [{ ke, kn, bild: bilder[i]! }] : []))
  if (!kacheln.length) return null
  return { kacheln, jahre: [...new Set(kacheln.map(({ ke, kn }) => ix.km[`${ke}_${kn}`]))].sort() }
}

/* ---------- feines Gelände für den Führerstand ---------- */

interface FeinIndex { km: Record<string, number>; je_km: number; quelle: string }
/** swissALTI3D auf 10 m, nur Kilometer bis 500 m neben einer Bahnlinie (pipeline/build_gelaende_nah.py) */
export const feinIndex = () => holen<FeinIndex>('data/gelaende_nah/index.json')
export const FEIN_JE_KM = 100
const FEIN_HOECHSTENS = 200
const feinVorrat = new Map<string, Promise<Float32Array | null>>()

function feinKachel(name: string) {
  let p = feinVorrat.get(name)
  if (p) return p
  while (feinVorrat.size >= FEIN_HOECHSTENS) feinVorrat.delete(feinVorrat.keys().next().value!)
  p = (async () => {
    const gepackt = await holenBinaer(`data/gelaende_nah/${name}.hgz`)
    const roh = await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    // vorne die tiefste Höhe in Dezimetern, dann je Zeile Differenzen zum linken Nachbarn
    const tief = new DataView(roh).getInt32(0, true), d = new Int16Array(roh, 4)
    const n = FEIN_JE_KM, h = new Float32Array(n * n)
    for (let j = 0; j < n; j++) {
      let v = 0
      for (let i = 0; i < n; i++) { v += d[j * n + i]; h[j * n + i] = (tief + v) / 10 }
    }
    return h
  })().catch(() => { feinVorrat.delete(name); return null })
  feinVorrat.set(name, p)
  return p
}

/** Höhen je Kilometer im Rechteck, Schlüssel «Ost-km_Nord-km», Zeilen von Norden, Feldmitte bei 5 m */
export interface Fein { km: Map<string, Float32Array>; jahre: number[] }

export async function feinLaden(e0: number, n0: number, e1: number, n1: number): Promise<Fein | null> {
  if (!gelaendeMoeglich()) return null
  const ix = await feinIndex().catch(() => null)
  if (!ix) return null
  const namen: string[] = []
  for (let ke = Math.floor(e0 / 1000); ke <= Math.floor((e1 - 1) / 1000); ke++) {
    for (let kn = Math.floor(n0 / 1000); kn <= Math.floor((n1 - 1) / 1000); kn++) if (ix.km[`${ke}_${kn}`]) namen.push(`${ke}_${kn}`)
  }
  const hoehen = await Promise.all(namen.map(feinKachel))
  const km = new Map<string, Float32Array>()
  namen.forEach((name, i) => { if (hoehen[i]) km.set(name, hoehen[i]!) })
  if (!km.size) return null
  return { km, jahre: [...new Set([...km.keys()].map((k) => ix.km[k]))].sort() }
}

/** Höhe des Feldes mit der Mitte bei Ost I*10+5, Nord J*10+5 (Meter), oder null ohne feine Kachel */
export function feinFeld(f: Fein, I: number, J: number): number | null {
  const ke = Math.floor(I / FEIN_JE_KM), kn = Math.floor(J / FEIN_JE_KM)
  const a = f.km.get(`${ke}_${kn}`)
  if (!a) return null
  return a[(FEIN_JE_KM - 1 - (J - kn * FEIN_JE_KM)) * FEIN_JE_KM + I - ke * FEIN_JE_KM]
}

/** Höhe bei Ost, Nord zwischen den Feldern linear, oder null, wo eine Kachel fehlt */
export function feinHoehe(f: Fein, e: number, n: number): number | null {
  const x = (e - 5) / 10, y = (n - 5) / 10, I = Math.floor(x), J = Math.floor(y), fx = x - I, fy = y - J
  const a = feinFeld(f, I, J), b = feinFeld(f, I + 1, J), c = feinFeld(f, I, J + 1), d = feinFeld(f, I + 1, J + 1)
  if (a === null || b === null || c === null || d === null) return null
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

/* ---------- scharfe Umgebung, ein Versuch auf einer kurzen Strecke ---------- */

/** Luftbild auf 25 cm und Gelände auf 2 m, nur 200 m neben den Bahnlinien zwischen Müntschemier und Rosshäusern
 *  (Michael, 2026-10-11; pipeline/build_scharf.py), in Kacheln von 250 m */
interface ScharfIndex { kachel_m: number; px: number; punkte: number; band_m: number; kacheln: Record<string, [number, number]> }
/** Weitere Kacheln liegen auf daten.taktland.ch (cyon, Michael, 2026-10-12: «so viel Details wie möglich»), nicht in der
 *  App: die 1 GB von GitHub Pages reichen dafür nicht. Fehlt der Index dort, gelten nur die Kacheln der App. */
const DATEN_URL = import.meta.env.VITE_DATEN_URL ?? 'https://daten.taktland.ch/'
/** je Kachel ihr Pfad ohne Endung und die Jahre von Bild und Höhe */
interface ScharfVerzeichnis { kacheln: Map<string, { pfad: string; jahre: [number, number] }> }
let scharfVerz: Promise<ScharfVerzeichnis> | null = null
/** Fehlt ein Verzeichnis auf daten.taktland.ch (noch nicht hochgeladen, kein Empfang), fragt die App nach so vielen ms wieder nach,
 *  statt es bis zum Neustart zu vergessen (Michael, 2026-10-17: auf der Brille fehlten die Gebäude ab Wankdorf noch, als sie auf
 *  dem Server längst lagen) */
const NOCHMALS_MS = 60_000
const spaeterNochmals = (vergessen: () => void) => { setTimeout(vergessen, NOCHMALS_MS) }
export function scharfIndex() {
  scharfVerz ??= Promise.all([
    holen<ScharfIndex>('data/scharf/index.json').catch(() => null),
    holen<ScharfIndex>(`${DATEN_URL}scharf/index.json`).catch(() => null),
  ]).then(([hier, dort]) => {
    if (!dort) spaeterNochmals(() => { scharfVerz = null })
    const kacheln = new Map<string, { pfad: string; jahre: [number, number] }>()
    for (const [name, jahre] of Object.entries(dort?.kacheln ?? {})) kacheln.set(name, { pfad: `${DATEN_URL}scharf/${name}`, jahre })
    // die Kacheln der App gehen vor: sie sind da, auch ohne daten.taktland.ch
    for (const [name, jahre] of Object.entries(hier?.kacheln ?? {})) kacheln.set(name, { pfad: `data/scharf/${name}`, jahre })
    return { kacheln }
  })
  return scharfVerz
}
const scharfPfad = async (name: string) => (await scharfIndex()).kacheln.get(name)?.pfad ?? `data/scharf/${name}`
export const SCHARF_KACHEL_M = 250, SCHARF_PUNKTE = 126
const SCHARF_LEER = 65535
const scharfVorrat = new Map<string, Promise<Float32Array | null>>()

function scharfKachel(name: string) {
  let p = scharfVorrat.get(name)
  if (p) return p
  while (scharfVorrat.size >= 400) scharfVorrat.delete(scharfVorrat.keys().next().value!)
  p = (async () => {
    const gepackt = await holenBinaer(`${await scharfPfad(name)}.hgz`)
    const roh = await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    // vorne die tiefste Höhe in Dezimetern, dann je Punkt die Höhe darüber; LEER ausserhalb des Bands
    const tief = new DataView(roh).getInt32(0, true), d = new Uint16Array(roh.slice(4))
    const h = new Float32Array(d.length)
    for (let k = 0; k < d.length; k++) h[k] = d[k] === SCHARF_LEER ? NaN : (tief + d[k]) / 10
    return h
  })().catch(() => { scharfVorrat.delete(name); return null })
  scharfVorrat.set(name, p)
  return p
}

/** Höhen je Kachel im Rechteck, Schlüssel «Ost_Nord» in Kacheln, Punkte von Norden, die Ecken auf den Rändern */
export interface Scharf { kacheln: Map<string, Float32Array>; jahre: number[] }

export async function scharfLaden(e0: number, n0: number, e1: number, n1: number): Promise<Scharf | null> {
  if (!gelaendeMoeglich()) return null
  const ix = await scharfIndex()
  if (!ix.kacheln.size) return null
  const k = SCHARF_KACHEL_M, namen: string[] = []
  for (let qe = Math.floor(e0 / k); qe <= Math.floor((e1 - 1) / k); qe++) {
    for (let qn = Math.floor(n0 / k); qn <= Math.floor((n1 - 1) / k); qn++) if (ix.kacheln.has(`${qe}_${qn}`)) namen.push(`${qe}_${qn}`)
  }
  if (!namen.length) return null
  const hoehen = await Promise.all(namen.map(scharfKachel))
  const kacheln = new Map<string, Float32Array>()
  namen.forEach((name, i) => { if (hoehen[i]) kacheln.set(name, hoehen[i]!) })
  if (!kacheln.size) return null
  return { kacheln, jahre: [...new Set([...kacheln.keys()].flatMap((n) => ix.kacheln.get(n)!.jahre))].sort() }
}

/** Höhe bei Ost, Nord zwischen den Punkten linear, oder null ausserhalb des Bands */
export function scharfHoehe(s: Scharf, e: number, n: number): number | null {
  const k = SCHARF_KACHEL_M, qe = Math.floor(e / k), qn = Math.floor(n / k)
  const a = s.kacheln.get(`${qe}_${qn}`)
  if (!a) return null
  const schritt = k / (SCHARF_PUNKTE - 1)
  const x = (e - qe * k) / schritt, y = ((qn + 1) * k - n) / schritt
  const i = Math.min(SCHARF_PUNKTE - 2, Math.floor(x)), j = Math.min(SCHARF_PUNKTE - 2, Math.floor(y)), fx = x - i, fy = y - j
  const p = (ii: number, jj: number) => a[jj * SCHARF_PUNKTE + ii]
  const z = p(i, j) * (1 - fx) * (1 - fy) + p(i + 1, j) * fx * (1 - fy) + p(i, j + 1) * (1 - fx) * fy + p(i + 1, j + 1) * fx * fy
  return Number.isNaN(z) ? null : z
}

/** das Luftbild einer Kachel (1000 × 1000 Bildpunkte, 25 cm) */
export const scharfBild = (name: string) =>
  scharfPfad(name).then((p) => holenBinaer(`${p}.jpg`)).then((b) => createImageBitmap(new Blob([b], { type: 'image/jpeg' })))

/* ---------- Gebäude, ein Versuch auf Gümmenen–Bern ---------- */

/** Gebäude aus swissBUILDINGS3D (swisstopo) bis band_m neben den Bahnlinien (Michael, 2026-10-13; pipeline/build_gebaeude.py),
 *  in Kacheln von kachel_m: je Ecke Ost, Höhe, Nord in Dezimetern ab der Ecke der Kachel und Farbe, je drei Ecken ein Dreieck */
/** Kacheln der App und von daten.taktland.ch (je Kanton gebaut, Michael, 2026-10-13); die von dort gehen vor */
interface Umgebung { kachel_m: number; pfad: Map<string, string> }
function umgebungIndex(ordner: string): Promise<Umgebung | null> {
  return Promise.all([
    holen<{ kachel_m: number; kacheln: Record<string, unknown> | string[] }>(`data/${ordner}/index.json`).catch(() => null),
    holen<{ kachel_m: number; kacheln: Record<string, unknown> }>(`${DATEN_URL}${ordner}/index.json`).catch(() => null),
  ]).then(([hier, dort]) => {
    if (!dort) spaeterNochmals(() => { if (ordner === 'gebaeude') gebaeudeVerz = null; else baumVerz = null })
    if (!hier && !dort) return null
    // die von daten.taktland.ch gehen vor: je Kanton mit allen Bahnlinien gebaut; die der App stammen aus dem ersten Versuch
    // und haben nur die Gebäude neben den Strecken der scharfen Umgebung (Michael, 2026-10-14: in Biel fehlte im Nordosten
    // etwa die Hälfte, an der Linie aus dem Jura)
    const pfad = new Map<string, string>()
    const eigene = Array.isArray(hier?.kacheln) ? hier.kacheln : Object.keys(hier?.kacheln ?? {})
    for (const name of eigene) pfad.set(name, `data/${ordner}/${name}`)
    for (const name of Object.keys(dort?.kacheln ?? {})) pfad.set(name, `${DATEN_URL}${ordner}/${name}`)
    return { kachel_m: (hier ?? dort)!.kachel_m, pfad }
  })
}
function umgebungNamen(ix: Umgebung, e0: number, n0: number, e1: number, n1: number) {
  const k = ix.kachel_m, raus: string[] = []
  for (let qe = Math.floor(e0 / k); qe <= Math.floor((e1 - 1) / k); qe++) {
    for (let qn = Math.floor(n0 / k); qn <= Math.floor((n1 - 1) / k); qn++) if (ix.pfad.has(`${qe}_${qn}`)) raus.push(`${qe}_${qn}`)
  }
  return raus
}
export interface GebaeudeKachel { e0: number; n0: number; h0: number; ecken: Int16Array; farben: Uint8Array }
let gebaeudeVerz: Promise<Umgebung | null> | null = null
export const gebaeudeIndex = () => (gebaeudeVerz ??= umgebungIndex('gebaeude'))
const gebaeudeVorrat = new Map<string, Promise<GebaeudeKachel | null>>()

const entpacken = (gepackt: ArrayBuffer) =>
  new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()

/** eine entpackte .bgz lesen (pipeline/build_gebaeude.py) */
export function gebaeudeLesen(roh: ArrayBuffer): GebaeudeKachel {
  const v = new DataView(roh), n = v.getUint32(12, true)
  const ecken = new Int16Array(n * 3), farben = new Uint8Array(n * 3)
  for (let k = 0; k < n; k++) {
    const o = 16 + k * 10
    ecken[k * 3] = v.getInt16(o, true); ecken[k * 3 + 1] = v.getInt16(o + 2, true); ecken[k * 3 + 2] = v.getInt16(o + 4, true)
    farben[k * 3] = v.getUint8(o + 6); farben[k * 3 + 1] = v.getUint8(o + 7); farben[k * 3 + 2] = v.getUint8(o + 8)
  }
  return { e0: v.getInt32(0, true), n0: v.getInt32(4, true), h0: v.getInt32(8, true), ecken, farben }
}

export function gebaeudeKachel(name: string) {
  let p = gebaeudeVorrat.get(name)
  if (p) return p
  while (gebaeudeVorrat.size >= 120) gebaeudeVorrat.delete(gebaeudeVorrat.keys().next().value!)
  p = (async () => {
    const pfad = (await gebaeudeIndex())?.pfad.get(name) ?? `data/gebaeude/${name}`
    return gebaeudeLesen(await entpacken(await holenBinaer(`${pfad}.bgz`)))
  })().catch(() => { gebaeudeVorrat.delete(name); return null })
  gebaeudeVorrat.set(name, p)
  return p
}

/** die Namen der Kacheln mit Gebäuden im Rechteck */
export async function gebaeudeNamen(e0: number, n0: number, e1: number, n1: number): Promise<string[]> {
  if (!gelaendeMoeglich()) return []
  const ix = await gebaeudeIndex()
  return ix ? umgebungNamen(ix, e0, n0, e1, n1) : []
}

/* ---------- Bäume und Wald, ein Versuch auf den Strecken der Gebäude ---------- */

/** Bäume aus swissTLM3D (swisstopo) bis band_m neben den Bahnlinien (Michael, 2026-10-13; pipeline/build_baeume.py): je Baum
 *  Ost und Nord in Dezimetern ab der Ecke der Kachel, die Art (0 Einzelbaum, 1 Wald, 2 Wald offen, 3 Gebüschwald,
 *  4 Gehölzfläche) und die Farbe; in Flächen sind die einzelnen Bäume gezeichnet, die Höhe steht in keiner Quelle */
export interface BaumKachel { e0: number; n0: number; lage: Uint16Array; art: Uint8Array; farben: Uint8Array }
let baumVerz: Promise<Umgebung | null> | null = null
const baumIndex = () => (baumVerz ??= umgebungIndex('baeume'))
const baumVorrat = new Map<string, Promise<BaumKachel | null>>()

/** eine entpackte .bmd lesen (pipeline/build_baeume.py) */
export function baumLesen(roh: ArrayBuffer): BaumKachel {
  const v = new DataView(roh), n = v.getUint32(8, true)
  const lage = new Uint16Array(n * 2), art = new Uint8Array(n), farben = new Uint8Array(n * 3)
  for (let k = 0; k < n; k++) {
    const o = 12 + k * 8
    lage[k * 2] = v.getUint16(o, true); lage[k * 2 + 1] = v.getUint16(o + 2, true); art[k] = v.getUint8(o + 4)
    farben[k * 3] = v.getUint8(o + 5); farben[k * 3 + 1] = v.getUint8(o + 6); farben[k * 3 + 2] = v.getUint8(o + 7)
  }
  return { e0: v.getInt32(0, true), n0: v.getInt32(4, true), lage, art, farben }
}

export function baumKachel(name: string) {
  let p = baumVorrat.get(name)
  if (p) return p
  while (baumVorrat.size >= 120) baumVorrat.delete(baumVorrat.keys().next().value!)
  p = (async () => {
    const pfad = (await baumIndex())?.pfad.get(name) ?? `data/baeume/${name}`
    return baumLesen(await entpacken(await holenBinaer(`${pfad}.bmd`)))
  })().catch(() => { baumVorrat.delete(name); return null })
  baumVorrat.set(name, p)
  return p
}

/** die Namen der Kacheln mit Bäumen im Rechteck */
export async function baumNamen(e0: number, n0: number, e1: number, n1: number): Promise<string[]> {
  if (!gelaendeMoeglich()) return []
  const ix = await baumIndex()
  return ix ? umgebungNamen(ix, e0, n0, e1, n1) : []
}

/** Gebäude und Bäume der Probeausschnitte von «3D Schweiz» (pipeline/build_schweiz3d_probe.py) im Rechteck */
interface ProbeIndex { kachel_m: number; quelle: string; gebiete: Record<string, [number, number, number, number]>; kacheln: Record<string, unknown> }
const probeVerz: Record<string, Promise<ProbeIndex | null>> = {}
export const probeIndex = (art: 'gebaeude' | 'baeume') =>
  (probeVerz[art] ??= holen<ProbeIndex>(`data/schweiz3d_probe/${art}/index.json`).catch(() => null))
/** dieselben für die ganze Schweiz auf daten.taktland.ch (pipeline/build_schweiz3d_umwelt.py; Michael, 2026-10-21: «Bäume und
 *  Gebäude für 3DLand»); fehlt das Verzeichnis dort, wird nach einer Minute wieder gefragt */
interface UmweltIndex { kachel_m: number; quelle: string; kacheln: Record<string, unknown> }
const umweltVerz: Record<string, Promise<UmweltIndex | null>> = {}
const umweltIndex = (art: 'gebaeude' | 'baeume') =>
  (umweltVerz[art] ??= holen<UmweltIndex>(`${DATEN_URL}schweiz3dumwelt/${art}/index.json`).catch(() => {
    spaeterNochmals(() => { delete umweltVerz[art] })
    return null
  }))
const kachelnIn = (ix: { kachel_m: number; kacheln: Record<string, unknown> } | null, e0: number, n0: number, e1: number, n1: number) => {
  if (!ix) return []
  const k = ix.kachel_m, raus: string[] = []
  for (let qe = Math.floor(e0 / k); qe <= Math.floor((e1 - 1) / k); qe++) {
    for (let qn = Math.floor(n0 / k); qn <= Math.floor((n1 - 1) / k); qn++) if (`${qe}_${qn}` in ix.kacheln) raus.push(`${qe}_${qn}`)
  }
  return raus
}
export async function probeLaden(e0: number, n0: number, e1: number, n1: number) {
  const [ig, ib, ug, ub] = await Promise.all([probeIndex('gebaeude'), probeIndex('baeume'), umweltIndex('gebaeude'), umweltIndex('baeume')])
  // die Kacheln der ganzen Schweiz gehen vor, die der Probeausschnitte nur, wo es dort keine gibt
  const pfade = (art: 'gebaeude' | 'baeume', endung: string, probe: ProbeIndex | null, weit: UmweltIndex | null) => {
    const dort = kachelnIn(weit, e0, n0, e1, n1)
    const da = new Set(dort)
    return [...dort.map((n) => `${DATEN_URL}schweiz3dumwelt/${art}/${n}.${endung}`),
            ...kachelnIn(probe, e0, n0, e1, n1).filter((n) => !da.has(n)).map((n) => `data/schweiz3d_probe/${art}/${n}.${endung}`)]
  }
  const [gebaeude, baeume] = await Promise.all([
    Promise.all(pfade('gebaeude', 'bgz', ig, ug).map((p) => holenBinaer(p).then(entpacken).then(gebaeudeLesen).catch(() => null))),
    Promise.all(pfade('baeume', 'bmd', ib, ub).map((p) => holenBinaer(p).then(entpacken).then(baumLesen).catch(() => null))),
  ])
  return { gebaeude: gebaeude.filter((x): x is GebaeudeKachel => !!x), baeume: baeume.filter((x): x is BaumKachel => !!x),
           quellen: [(ug ?? ig)?.quelle, (ub ?? ib)?.quelle].filter((q): q is string => !!q) }
}
/** Wanderwege aus swissTLM3D (pipeline/build_wanderwege.py) im Rechteck: je Stück die Art (1 Wanderweg, 2 Bergwanderweg,
 *  3 Alpinwanderweg) und die Punkte als Ost, Nord in Metern; die Stücke sind der Kachel ihrer Mitte zugeteilt, darum auch die
 *  Kacheln rundum */
export interface Wanderweg { art: number; p: Float64Array }
interface WanderIndex { kachel_m: number; quelle: string; kacheln: string[] }
let wanderVerz: Promise<WanderIndex | null> | null = null
const wanderVorrat = new Map<string, Promise<Wanderweg[]>>()
export async function wanderwegeLaden(e0: number, n0: number, e1: number, n1: number) {
  const ix = await (wanderVerz ??= holen<WanderIndex>('data/wanderwege/index.json').catch(() => null))
  if (!ix) return null
  const k = ix.kachel_m, da = new Set(ix.kacheln), namen: string[] = []
  for (let ex = Math.floor(e0 / k) - 1; ex <= Math.floor(e1 / k) + 1; ex++) {
    for (let ny = Math.floor(n0 / k) - 1; ny <= Math.floor(n1 / k) + 1; ny++) if (da.has(`${ex}_${ny}`)) namen.push(`${ex}_${ny}`)
  }
  const teile = await Promise.all(namen.map((name) => {
    let p = wanderVorrat.get(name)
    if (!p) {
      p = holenBinaer(`data/wanderwege/${name}.wwg`).then(entpacken).then((roh) => {
        const [ex, ny] = name.split('_').map(Number), v = new DataView(roh), raus: Wanderweg[] = []
        let o = 4
        for (let i = 0, n = v.getUint32(0, true); i < n; i++) {
          const art = v.getUint8(o), z = v.getUint16(o + 1, true)
          o += 3
          const pt = new Float64Array(z * 2)
          for (let j = 0; j < z; j++, o += 4) { pt[j * 2] = ex * k + v.getInt16(o, true); pt[j * 2 + 1] = ny * k + v.getInt16(o + 2, true) }
          raus.push({ art, p: pt })
        }
        return raus
      }).catch(() => { wanderVorrat.delete(name); return [] })
      while (wanderVorrat.size >= 60) wanderVorrat.delete(wanderVorrat.keys().next().value!)
      wanderVorrat.set(name, p)
    }
    return p
  }))
  return { wege: teile.flat(), quelle: ix.quelle }
}

/** Strassen- und Bahnhofslampen (pipeline/build_strassenlicht.py) im Rechteck: Ost, Nord und Art (1 Strasse, 2 Bahnhof); die Lampen sind
 *  erfunden, nur die Lage der Strassen und Gleise ist belegt */
export interface Lampen { e: Float64Array; n: Float64Array; art: Uint8Array }
interface LichtIndex { kachel_m: number; quelle: string; kacheln: string[] }
let lichtVerz: Promise<LichtIndex | null> | null = null
const lichtVorrat = new Map<string, Promise<Lampen | null>>()
export async function strassenlichtLaden(e0: number, n0: number, e1: number, n1: number): Promise<Lampen | null> {
  const ix = await (lichtVerz ??= holen<LichtIndex>('data/strassenlicht/index.json').catch(() => null))
  if (!ix) return null
  const k = ix.kachel_m, da = new Set(ix.kacheln), namen: string[] = []
  for (let ex = Math.floor(e0 / k); ex <= Math.floor(e1 / k); ex++) {
    for (let ny = Math.floor(n0 / k); ny <= Math.floor(n1 / k); ny++) if (da.has(`${ex}_${ny}`)) namen.push(`${ex}_${ny}`)
  }
  const teile = await Promise.all(namen.map((name) => {
    let p = lichtVorrat.get(name)
    if (!p) {
      p = holenBinaer(`data/strassenlicht/${name}.lgz`).then(entpacken).then((roh) => {
        const [ex, ny] = name.split('_').map(Number), v = new DataView(roh), n = v.getUint32(0, true)
        const l: Lampen = { e: new Float64Array(n), n: new Float64Array(n), art: new Uint8Array(n) }
        for (let i = 0, o = 4; i < n; i++, o += 5) { l.e[i] = ex * k + v.getUint16(o, true); l.n[i] = ny * k + v.getUint16(o + 2, true); l.art[i] = v.getUint8(o + 4) }
        return l
      }).catch(() => { lichtVorrat.delete(name); return null })
      while (lichtVorrat.size >= 60) lichtVorrat.delete(lichtVorrat.keys().next().value!)
      lichtVorrat.set(name, p)
    }
    return p
  }))
  const e: number[] = [], n: number[] = [], art: number[] = []
  for (const t of teile) {
    if (!t) continue
    for (let i = 0; i < t.e.length; i++) if (t.e[i] >= e0 && t.e[i] <= e1 && t.n[i] >= n0 && t.n[i] <= n1) { e.push(t.e[i]); n.push(t.n[i]); art.push(t.art[i]) }
  }
  return { e: Float64Array.from(e), n: Float64Array.from(n), art: Uint8Array.from(art) }
}

/** Masten der Fahrleitung (pipeline/build_fahrleitung.py) im Rechteck: Ost, Nord und die Richtung vom Mast zum Gleis (Radiant, gegen den
 *  Uhrzeigersinn ab Osten); die Masten sind erfunden, belegt ist nur, dass die Strecke elektrifiziert ist */
export interface Masten { e: Float64Array; n: Float64Array; winkel: Float32Array }
interface MastIndex { kachel_m: number; kacheln: string[] }
let mastVerz: Promise<MastIndex | null> | null = null
const mastVorrat = new Map<string, Promise<Masten | null>>()
export async function mastenLaden(e0: number, n0: number, e1: number, n1: number): Promise<Masten | null> {
  const ix = await (mastVerz ??= holen<MastIndex>('data/fahrleitung/index.json').catch(() => null))
  if (!ix) return null
  const k = ix.kachel_m, da = new Set(ix.kacheln), namen: string[] = []
  for (let ex = Math.floor(e0 / k); ex <= Math.floor(e1 / k); ex++) {
    for (let ny = Math.floor(n0 / k); ny <= Math.floor(n1 / k); ny++) if (da.has(`${ex}_${ny}`)) namen.push(`${ex}_${ny}`)
  }
  const teile = await Promise.all(namen.map((name) => {
    let p = mastVorrat.get(name)
    if (!p) {
      p = holenBinaer(`data/fahrleitung/${name}.mgz`).then(entpacken).then((roh) => {
        const [ex, ny] = name.split('_').map(Number), v = new DataView(roh), n = v.getUint32(0, true)
        const m: Masten = { e: new Float64Array(n), n: new Float64Array(n), winkel: new Float32Array(n) }
        for (let i = 0, o = 4; i < n; i++, o += 5) {
          m.e[i] = ex * k + v.getUint16(o, true); m.n[i] = ny * k + v.getUint16(o + 2, true); m.winkel[i] = (v.getUint8(o + 4) / 256) * Math.PI * 2
        }
        return m
      }).catch(() => { mastVorrat.delete(name); return null })
      while (mastVorrat.size >= 60) mastVorrat.delete(mastVorrat.keys().next().value!)
      mastVorrat.set(name, p)
    }
    return p
  }))
  const e: number[] = [], n: number[] = [], w: number[] = []
  for (const t of teile) {
    if (!t) continue
    for (let i = 0; i < t.e.length; i++) if (t.e[i] >= e0 && t.e[i] <= e1 && t.n[i] >= n0 && t.n[i] <= n1) { e.push(t.e[i]); n.push(t.n[i]); w.push(t.winkel[i]) }
  }
  return { e: Float64Array.from(e), n: Float64Array.from(n), winkel: Float32Array.from(w) }
}

/** ob ein Rechteck Gebäude oder Bäume hat: ganze Schweiz oder ein Probeausschnitt */
export async function probeDa(e0: number, n0: number, e1: number, n1: number) {
  const [ix, ug, ub] = await Promise.all([probeIndex('gebaeude'), umweltIndex('gebaeude'), umweltIndex('baeume')])
  if (kachelnIn(ug, e0, n0, e1, n1).length || kachelnIn(ub, e0, n0, e1, n1).length) return true
  return !!ix && Object.values(ix.gebiete).some(([a, b, c, d]) => a < e1 && c > e0 && b < n1 && d > n0)
}
/** ob es Gebäude und Bäume der ganzen Schweiz auf daten.taktland.ch gibt */
export const umweltGanz = async () => !!(await umweltIndex('gebaeude')) || !!(await umweltIndex('baeume'))

/* ---------- Höhe der Gleise aus swissTLM3D ---------- */

/** Gleisachsen mit Höhe in Kacheln von kachel_m (pipeline/build_gleishoehe.py; Michael, 2026-10-15, Albula: «wie auf einer
 *  Achterbahn»); je Stück die Punkte in Landeskoordinaten und Metern über Meer */
interface GleisIndex { kachel_m: number; kacheln: string[] }
/** tunnel: das Stück liegt laut swissTLM3D (KUNSTBAUTE) in einem Tunnel */
export interface GleisStueck { e: Float64Array; n: Float64Array; z: Float32Array; tunnel: boolean }
const gleisIndex = () => holen<GleisIndex>('data/gleishoehe/index.json')
const gleisVorrat = new Map<string, Promise<GleisStueck[] | null>>()
function gleisKachel(name: string, kachel_m: number) {
  let p = gleisVorrat.get(name)
  if (p) return p
  p = (async () => {
    const gepackt = await holenBinaer(`data/gleishoehe/${name}.hgz`)
    const roh = await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    const [ke, kn] = name.split('_').map(Number), e0 = ke * kachel_m, n0 = kn * kachel_m
    const z0 = new DataView(roh).getInt32(0, true), d = new Int16Array(roh, 4)
    const raus: GleisStueck[] = []
    for (let i = 0; i < d.length;) {
      const roh2 = d[i++], k = Math.abs(roh2)
      const s = { e: new Float64Array(k), n: new Float64Array(k), z: new Float32Array(k), tunnel: roh2 < 0 }
      for (let j = 0; j < k; j++, i += 3) { s.e[j] = e0 + d[i] / 2; s.n[j] = n0 + d[i + 1] / 2; s.z[j] = (z0 + d[i + 2]) / 10 }
      raus.push(s)
    }
    return raus
  })().catch(() => { gleisVorrat.delete(name); return null })
  gleisVorrat.set(name, p)
  return p
}

/** die Gleisachsen in den Kacheln, die die Punkte berühren (Landeskoordinaten) */
export async function gleisLaden(punkte: Array<[number, number]>): Promise<GleisStueck[]> {
  if (!gelaendeMoeglich()) return []
  const ix = await gleisIndex().catch(() => null)
  if (!ix) return []
  const da = new Set(ix.kacheln), namen = new Set<string>()
  for (const [e, n] of punkte) {
    for (const de of [-50, 50]) for (const dn of [-50, 50]) {
      const k = `${Math.floor((e + de) / ix.kachel_m)}_${Math.floor((n + dn) / ix.kachel_m)}`
      if (da.has(k)) namen.add(k)
    }
  }
  const alle = await Promise.all([...namen].map((k) => gleisKachel(k, ix.kachel_m)))
  return alle.flatMap((x) => x ?? [])
}

/* ---------- Details für «3D Schweiz» auf daten.taktland.ch ---------- */

/** Je Kilometer der Schweiz Luftbild auf 2,5 m und Gelände auf 10 m (Michael, 2026-10-19: «Lade noch mehr Detailkarten für
 *  Schweiz 3D»; pipeline/build_schweiz3d_details.py), nur auf daten.taktland.ch: für die App zu gross. Fehlt der Index dort,
 *  gibt es nur die feinen Daten entlang der Bahnlinien. */
interface Schweiz3dIndex { quelle_bild: string; quelle_hoehe: string; hoehe_je_km?: number; kacheln: Record<string, [number | null, number | null]> }
/** schweiz3d: Bild 2,5 m, Gelände 10 m; schweiz3dfein: Bild 50 cm, Gelände 5 m (Michael, 2026-10-19: «nimm mal 50cm») */
export type Schweiz3dArt = 'schweiz3d' | 'schweiz3dfein'
const schweiz3dVerz = new Map<Schweiz3dArt, Promise<Schweiz3dIndex | null>>()
const schweiz3dIndex = (art: Schweiz3dArt) => {
  let p = schweiz3dVerz.get(art)
  if (!p) {
    p = holen<Schweiz3dIndex>(`${DATEN_URL}${art}/index.json`).catch(() => {
      spaeterNochmals(() => { schweiz3dVerz.delete(art) })
      return null
    })
    schweiz3dVerz.set(art, p)
  }
  return p
}

async function hoeheKmLesen(url: string) {
  const gepackt = await holenBinaer(url)
  const roh = await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  const tief = new DataView(roh).getInt32(0, true), d = new Int16Array(roh, 4)
  // quadratisch: 100 × 100 (10 m) oder 200 × 200 (5 m)
  const n = Math.round(Math.sqrt(d.length)), h = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    let v = 0
    for (let i = 0; i < n; i++) { v += d[j * n + i]; h[j * n + i] = (tief + v) / 10 }
  }
  return h
}

export interface Schweiz3dDetails {
  /** Höhen wie Fein, Schlüssel «Ost-km_Nord-km»; je_km Höhen je Kilometer und Seite */
  fein: Fein
  je_km: number
  bilder: Array<{ ke: number; kn: number; bild: ImageBitmap }>
  quelle_bild: string; quelle_hoehe: string
  bildJahre: number[]
}

/** Die Details im Rechteck (Landeskoordinaten); px: Bildpunkte je Kilometer, auf die die Bilder verkleinert werden;
 *  ohneHoehen: nur die Bilder (für die Region) */
export async function schweiz3dLaden(e0: number, n0: number, e1: number, n1: number, px = 400, ohneHoehen = false,
                                     art: Schweiz3dArt = 'schweiz3d'): Promise<Schweiz3dDetails | null> {
  if (!gelaendeMoeglich()) return null
  const ix = await schweiz3dIndex(art)
  if (!ix) return null
  const namen: string[] = []
  for (let ke = Math.floor(e0 / 1000); ke <= Math.floor((e1 - 1) / 1000); ke++) {
    for (let kn = Math.floor(n0 / 1000); kn <= Math.floor((n1 - 1) / 1000); kn++) if (ix.kacheln[`${ke}_${kn}`]) namen.push(`${ke}_${kn}`)
  }
  if (!namen.length) return null
  const [bilder, hoehen] = await Promise.all([
    Promise.all(namen.map((n) => (ix.kacheln[n][0] === null ? null
      : holenBinaer(`${DATEN_URL}${art}/${n}.jpg`)
        .then((b) => createImageBitmap(new Blob([b], { type: 'image/jpeg' }), px > 0 ? { resizeWidth: px, resizeHeight: px, resizeQuality: 'medium' } : undefined))
        // jenseits der Grenze weiss: durchsichtig, damit überall derselbe Grundton darunter durchscheint
        .then((b) => ohneLeeres(b, 1))
        .catch(() => null)))),
    ohneHoehen ? Promise.resolve([] as Array<Float32Array | null>)
      : Promise.all(namen.map((n) => (ix.kacheln[n][1] === null ? null : hoeheKmLesen(`${DATEN_URL}${art}/${n}.hgz`).catch(() => null)))),
  ])
  const km = new Map<string, Float32Array>()
  namen.forEach((n, i) => { if (hoehen[i]) km.set(n, hoehen[i]!) })
  const raus = namen.flatMap((n, i) => {
    const b = bilder[i]
    if (!b) return []
    const [ke, kn] = n.split('_').map(Number)
    return [{ ke, kn, bild: b }]
  })
  if (!raus.length && !km.size) return null
  return {
    fein: { km, jahre: [...new Set([...km.keys()].map((k) => ix.kacheln[k][1]!))].sort() }, je_km: ix.hoehe_je_km ?? FEIN_JE_KM,
    bilder: raus, quelle_bild: ix.quelle_bild, quelle_hoehe: ix.quelle_hoehe,
    bildJahre: [...new Set(raus.map(({ ke, kn }) => ix.kacheln[`${ke}_${kn}`][0]!))].sort(),
  }
}

/**
 * Seegrund (Michael, 2026-10-25: «Seetiefe»): swissBATHY3D (swisstopo) für 22 Seen, auf 25 m gemittelt, in den 10-km-Kacheln des
 * Geländes (pipeline/build_seegrund.py), dazu je See sein Spiegel aus dem Gelände. Wo es keinen gemessenen Grund gibt, bleibt das
 * Gelände, wie es ist.
 */
interface SeegrundIndex {
  quelle: string; kachel_m: number; raster_m: number; zellen: number; kacheln: string[]
  seen: Array<{ name: string; titel: string; spiegel_m: number | null }>
}
export const seegrundIndex = () => holen<SeegrundIndex>('data/seegrund/index.json')
const seegrundVorrat = new Map<string, Promise<{ grund: Float32Array; see: Uint8Array } | null>>()
function seegrundKachel(name: string, zellen: number) {
  let p = seegrundVorrat.get(name)
  if (!p) {
    p = (async () => {
      const gepackt = await holenBinaer(`data/seegrund/${name}.sgz`)
      const roh = await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      const unten = new DataView(roh).getInt32(0, true), n = zellen * zellen
      const u = new Uint16Array(roh.slice(4, 4 + 2 * n)), see = new Uint8Array(roh, 4 + 2 * n, n)
      const grund = new Float32Array(n)
      for (let i = 0; i < n; i++) grund[i] = u[i] === 65535 ? NaN : (unten + u[i]) / 10
      return { grund, see }
    })().catch(() => { seegrundVorrat.delete(name); return null })
    seegrundVorrat.set(name, p)
  }
  return p
}
export interface Seegrund {
  quelle: string
  /** die Seen mit Grund in diesem Ausschnitt */
  seen: string[]
  /** Grund und Spiegel in m ü. M. an einer Stelle, oder null (kein gemessener Grund); der Grund zwischen den Feldern linear */
  bei: (e: number, n: number) => { grund: number; spiegel: number; see: number } | null
}
export async function seegrundLaden(e0: number, n0: number, e1: number, n1: number): Promise<Seegrund | null> {
  const ix = await seegrundIndex().catch(() => null)
  if (!ix) return null
  const { kachel_m: k, raster_m: m, zellen } = ix
  const da = new Set(ix.kacheln), namen: string[] = []
  for (let ex = Math.floor(e0 / k); ex <= Math.floor(e1 / k); ex++) {
    for (let ny = Math.floor(n0 / k); ny <= Math.floor(n1 / k); ny++) if (da.has(`${ex}_${ny}`)) namen.push(`${ex}_${ny}`)
  }
  if (!namen.length) return null
  const geladen = new Map<string, { grund: Float32Array; see: Uint8Array }>()
  await Promise.all(namen.map(async (n) => { const t = await seegrundKachel(n, zellen); if (t) geladen.set(n, t) }))
  const feld = (I: number, J: number) => {
    const ex = Math.floor(I * m / k), ny = Math.floor(J * m / k), t = geladen.get(`${ex}_${ny}`)
    if (!t) return null
    const q = ((ny + 1) * zellen - 1 - J) * zellen + (I - ex * zellen)
    const g = t.grund[q]
    return Number.isNaN(g) ? null : { g, see: t.see[q] }
  }
  const seen = new Set<string>()
  const bei = (e: number, n: number) => {
    const x = e / m - 0.5, y = n / m - 0.5, I = Math.floor(x), J = Math.floor(y), fx = x - I, fy = y - J
    const mitte = feld(Math.floor(e / m), Math.floor(n / m))
    if (!mitte) return null
    const spiegel = ix.seen[mitte.see]?.spiegel_m
    if (spiegel === null || spiegel === undefined) return null
    seen.add(ix.seen[mitte.see].titel)
    const a = feld(I, J), b = feld(I + 1, J), c = feld(I, J + 1), d = feld(I + 1, J + 1)
    const grund = a && b && c && d ? a.g * (1 - fx) * (1 - fy) + b.g * fx * (1 - fy) + c.g * (1 - fx) * fy + d.g * fx * fy : mitte.g
    return { grund: Math.min(grund, spiegel), spiegel, see: mitte.see }
  }
  return { quelle: ix.quelle, get seen() { return [...seen] }, bei }
}

/**
 * Felsoberfläche (Michael, 2026-10-25: «geologischer Untergrund … damit auch die Wände entsprechend realistisch sind»): swissBEDROCK
 * (swisstopo), die Höhe des Felses unter dem Lockergestein, auf 50 m gemittelt in den 10-km-Kacheln des Geländes
 * (pipeline/build_fels.py). Wo die Quelle nichts angibt, null.
 */
interface FelsIndex { quelle: string; kachel_m: number; raster_m: number; zellen: number; kacheln: string[] }
export const felsIndex = () => holen<FelsIndex>('data/fels/index.json')
const felsVorrat = new Map<string, Promise<Int16Array | null>>()
function felsKachel(name: string) {
  let p = felsVorrat.get(name)
  if (!p) {
    p = (async () => {
      const gepackt = await holenBinaer(`data/fels/${name}.fgz`)
      return new Int16Array(await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
    })().catch(() => { felsVorrat.delete(name); return null })
    felsVorrat.set(name, p)
  }
  return p
}
export async function felsLaden(e0: number, n0: number, e1: number, n1: number) {
  const ix = await felsIndex().catch(() => null)
  if (!ix) return null
  const { kachel_m: k, raster_m: m, zellen } = ix
  const da = new Set(ix.kacheln), geladen = new Map<string, Int16Array>()
  const namen: string[] = []
  for (let ex = Math.floor(e0 / k); ex <= Math.floor(e1 / k); ex++) {
    for (let ny = Math.floor(n0 / k); ny <= Math.floor(n1 / k); ny++) if (da.has(`${ex}_${ny}`)) namen.push(`${ex}_${ny}`)
  }
  if (!namen.length) return null
  await Promise.all(namen.map(async (n) => { const t = await felsKachel(n); if (t) geladen.set(n, t) }))
  const feld = (I: number, J: number) => {
    const ex = Math.floor(I * m / k), ny = Math.floor(J * m / k), t = geladen.get(`${ex}_${ny}`)
    if (!t) return null
    const v = t[((ny + 1) * zellen - 1 - J) * zellen + (I - ex * zellen)]
    return v === -32768 ? null : v
  }
  /** Höhe des Felses in m ü. M., zwischen den Feldern linear, oder null */
  const bei = (e: number, n: number) => {
    const x = e / m - 0.5, y = n / m - 0.5, I = Math.floor(x), J = Math.floor(y), fx = x - I, fy = y - J
    const a = feld(I, J), b = feld(I + 1, J), c = feld(I, J + 1), d = feld(I + 1, J + 1)
    if (a === null || b === null || c === null || d === null) return feld(Math.floor(e / m), Math.floor(n / m))
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
  }
  return { quelle: ix.quelle, bei }
}
