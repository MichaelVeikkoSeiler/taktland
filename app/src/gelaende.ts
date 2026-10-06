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

/** Ein Ausschnitt von seite_m auf seite_m um eine Mitte (Landeskoordinaten), beim Fahren */
export async function fensterLaden(mitteE: number, mitteN: number, seite_m: number) {
  const { raster_m: m } = await gelaendeIndex()
  const breite = Math.round(seite_m / m)
  return ausschnittLaden({
    ost: Math.floor((mitteE - seite_m / 2) / m) * m, nord: Math.ceil((mitteN + seite_m / 2) / m) * m, m, breite, hoehe: breite,
  })
}

/** Ein Ausschnitt im 50-m-Raster der Kacheln, aus ihnen zusammengesetzt (auch die Bergstrecken,
 *  Michael, 2026-10-06: «auf die Kacheln umstellen»); wo keine Kachel liegt, steht KEINE_HOEHE */
export async function ausschnittLaden(raster: Raster) {
  const ix = await gelaendeIndex()
  const { kachel_m: k, raster_m: m, zellen } = ix
  if (raster.m !== m) throw new Error(`Der Ausschnitt hat ${raster.m} m, die Kacheln ${m} m`)
  const vorhanden = new Set(ix.kacheln)
  const { ost, nord, breite, hoehe } = raster
  const h = new Uint16Array(breite * hoehe).fill(KEINE_HOEHE)
  const kacheln: string[] = []
  for (let ex = Math.floor(ost / k); ex <= Math.floor((ost + breite * m - 1) / k); ex++) {
    for (let ny = Math.floor((nord - hoehe * m) / k); ny <= Math.floor((nord - 1) / k); ny++) {
      if (vorhanden.has(`${ex}_${ny}`)) kacheln.push(`${ex}_${ny}`)
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

const bildVorrat = new Map<string, Promise<ImageBitmap | null>>()
function luftbildKachel(name: string) {
  let p = bildVorrat.get(name)
  if (!p) {
    p = holenBinaer(`data/luftbild/${name}.jpg`)
      .then((b) => createImageBitmap(new Blob([b], { type: 'image/jpeg' })))
      .catch(() => { bildVorrat.delete(name); return null })
    bildVorrat.set(name, p)
  }
  return p
}

export interface Luftbild {
  kacheln: Array<{ ex: number; ny: number; bild: ImageBitmap }>
  kachel_m: number
  /** die Aufnahmejahre in diesem Ausschnitt */
  jahre: number[]
}

/** Die Luftbilder, die einen Ausschnitt berühren, oder null, wenn es dort keine gibt */
export async function luftbildLaden(raster: Raster): Promise<Luftbild | null> {
  const ix = await luftbildIndex().catch(() => null)
  if (!ix) return null
  const k = ix.kachel_m
  const namen: Array<[number, number]> = []
  for (let ex = Math.floor(raster.ost / k); ex <= Math.floor((raster.ost + raster.breite * raster.m - 1) / k); ex++) {
    for (let ny = Math.floor((raster.nord - raster.hoehe * raster.m) / k); ny <= Math.floor((raster.nord - 1) / k); ny++) {
      if (ix.kacheln[`${ex}_${ny}`]) namen.push([ex, ny])
    }
  }
  if (!namen.length) return null
  const bilder = await Promise.all(namen.map(([ex, ny]) => luftbildKachel(`${ex}_${ny}`)))
  const kacheln = namen.flatMap(([ex, ny], i) => (bilder[i] ? [{ ex, ny, bild: bilder[i]! }] : []))
  if (!kacheln.length) return null
  const jahre = [...new Set(kacheln.flatMap(({ ex, ny }) => ix.kacheln[`${ex}_${ny}`].jahre))].sort()
  return { kacheln, kachel_m: k, jahre }
}
