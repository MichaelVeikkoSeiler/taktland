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
async function ohneLeeres(bild: ImageBitmap, saum = 0): Promise<ImageBitmap> {
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
