/**
 * Wolken aus dem Wettermodell ICON-CH1-EPS von MeteoSchweiz für «3D Schweiz» (Michael, 2026-10-28: «Jetzt die Wolken angehen»).
 * pipeline/build_wolken.py legt sie im Workflow von 3dland.ch alle 3 Stunden neben die Seite (wolken/): je Stunde der Prognose
 * die Bewölkung in drei Schichten (tief, mittel, hoch) in Prozent, auf 2 km gemittelt. Taktland liest dieselben Dateien bei
 * 3dland.ch.
 */
import { holen, holenBinaer } from './daten'

export interface WolkenIndex {
  quelle: string; lauf: string; stunden: string[]
  /** je Stunde der Lauf, aus dem sie stammt (vor dem neuesten Lauf aus früheren) */
  lauf_je_stunde?: string[]
  e0: number; n1: number; schritt_m: number; nx: number; ny: number
  schichten: Array<{ name: string; modell: string; druck: string }>
  hinweis: string
  /** Niederschlag aus demselben Lauf (TOT_PR, SNOWLMT), in älteren Fassungen nicht dabei */
  niederschlag?: { datei: string; felder: Array<{ name: string; modell: string; schritt: number }> }
  /** Wolken in echter Höhe (CLC mit HHL) für die ersten Stunden des neuesten Laufs: Nummern in stunden, Stufen von unten_m an */
  wolken3d?: { datei: string; stunden: number[]; unten_m: number; schritt_m: number; stufen: number }
}

export interface Wolken {
  ix: WolkenIndex
  /** je Stunde der Zeitpunkt in ms (UTC) */
  zeiten: number[]
  /** Bewölkung in Prozent bei Stunde, Schicht und Zelle (Zeile 0 im Norden), 255 ohne Angabe */
  werte: Uint8Array
  /** je Stunde Niederschlag (0,1 mm je Stunde) und Schneefallgrenze (50 m) je Zelle, 255 ohne Angabe; null ohne Datei */
  nieder: Uint8Array | null
  /** je Stunde von wolken3d.stunden, je Stufe von unten, je Zelle die Bewölkung in Prozent, 255 unter dem Boden; null ohne Datei */
  w3d: Uint8Array | null
}

/** auf 3dland.ch neben der Seite, in Taktland bei 3dland.ch (GitHub Pages erlaubt den Abruf von überall) */
const basis = () => /3dland/.test(window.location.hostname) || /3dland\.html$/.test(window.location.pathname)
  ? new URL('wolken/', window.location.href).href : 'https://3dland.ch/wolken/'

let vorrat: Promise<Wolken | null> | null = null
let geholtUm = 0
/** der neueste Lauf; nach einer Stunde wird neu gefragt, die Prognose kommt alle 3 Stunden */
export function wolkenLaden(): Promise<Wolken | null> {
  if (!vorrat || Date.now() - geholtUm > 3_600_000) {
    geholtUm = Date.now()
    vorrat = (async () => {
      const ix = await holen<WolkenIndex>(`${basis()}index.json?${Math.floor(Date.now() / 3_600_000)}`)
      const gepackt = await holenBinaer(`${basis()}wolken.wgz?${encodeURIComponent(ix.lauf)}`)
      const entpacken = async (b: ArrayBuffer) => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
      // der Niederschlag ist eine eigene Datei; fehlt sie, bleiben die Wolken
      const nieder = ix.niederschlag
        ? await holenBinaer(`${basis()}${ix.niederschlag.datei}?${encodeURIComponent(ix.lauf)}`).then(entpacken).catch(() => null) : null
      const w3d = ix.wolken3d
        ? await holenBinaer(`${basis()}${ix.wolken3d.datei}?${encodeURIComponent(ix.lauf)}`).then(entpacken).catch(() => null) : null
      return { ix, zeiten: ix.stunden.map((s) => Date.parse(s)), werte: await entpacken(gepackt), nieder, w3d }
    })().catch(() => null)
  }
  return vorrat
}

/** die Stunde der Prognose am nächsten zu zeit, höchstens eine Stunde daneben, sonst null */
export function wolkenStunde(w: Wolken, zeit: Date): number | null {
  let best = -1, abstand = Infinity
  w.zeiten.forEach((z, i) => { const d = Math.abs(z - zeit.getTime()); if (d < abstand) { abstand = d; best = i } })
  return best >= 0 && abstand <= 3_600_000 ? best : null
}

/** Bewölkung (0 bis 1) an einer Stelle in LV95, zwischen den Mitten der Zellen gemittelt; null ausserhalb oder ohne Angabe */
export function bewoelkung(w: Wolken, stunde: number, schicht: number, e: number, n: number): number | null {
  const { e0, n1, schritt_m: s, nx, ny } = w.ix
  const fx = (e - e0) / s - 0.5, fy = (n1 - n) / s - 0.5
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
  const basisI = (stunde * w.ix.schichten.length + schicht) * nx * ny
  let summe = 0, gewicht = 0
  for (const [dx, dy, g] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
    const x = Math.min(nx - 1, Math.max(0, x0 + dx)), y = Math.min(ny - 1, Math.max(0, y0 + dy))
    const v = w.werte[basisI + y * nx + x]
    if (v === 255 || g <= 0) continue
    summe += v * g; gewicht += g
  }
  if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5 || gewicht === 0) return null
  return summe / gewicht / 100
}

/** Niederschlag in mm je Stunde (zwischen den Mitten der Zellen gemittelt) und die Schneefallgrenze der Zelle in m ü. M. (null ohne Angabe)
 *  an einer Stelle; null ohne Niederschlagsdaten oder ausserhalb */
export function niederschlagBei(w: Wolken, stunde: number, e: number, n: number): { mm: number; schneeAbM: number | null } | null {
  const f = w.ix.niederschlag, d = w.nieder
  if (!f || !d) return null
  const { e0, n1, schritt_m: s, nx, ny } = w.ix
  const fx = (e - e0) / s - 0.5, fy = (n1 - n) / s - 0.5
  if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5) return null
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
  const basisI = stunde * 2 * nx * ny
  let summe = 0, gewicht = 0
  for (const [dx, dy, g] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
    const x = Math.min(nx - 1, Math.max(0, x0 + dx)), y = Math.min(ny - 1, Math.max(0, y0 + dy))
    const v = d[basisI + y * nx + x]
    if (v === 255 || g <= 0) continue
    summe += v * g; gewicht += g
  }
  if (gewicht === 0) return null
  const xm = Math.min(nx - 1, Math.max(0, Math.round(fx))), ym = Math.min(ny - 1, Math.max(0, Math.round(fy)))
  const gr = d[basisI + nx * ny + ym * nx + xm]
  return { mm: (summe / gewicht) * f.felder[0].schritt, schneeAbM: gr === 255 ? null : gr * f.felder[1].schritt }
}

/** für die Stunde (Nummer in stunden) die Nummer in den Wolken in echter Höhe, oder null, wenn es sie für diese Stunde nicht gibt */
export function wolken3dStunde(w: Wolken, stunde: number): number | null {
  if (!w.w3d || !w.ix.wolken3d) return null
  const j = w.ix.wolken3d.stunden.indexOf(stunde)
  return j >= 0 ? j : null
}

/** Bewölkung (0 bis 1) in echter Höhe an einer Stelle, Stufe von unten, zwischen den Mitten der Zellen gemittelt; null ohne Angabe
 *  (unter dem Boden oder ausserhalb) */
export function bewoelkung3d(w: Wolken, j: number, stufe: number, e: number, n: number): number | null {
  const d = w.w3d, z = w.ix.wolken3d
  if (!d || !z) return null
  const { e0, n1, schritt_m: s, nx, ny } = w.ix
  const fx = (e - e0) / s - 0.5, fy = (n1 - n) / s - 0.5
  if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5) return null
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
  const basisI = (j * z.stufen + stufe) * nx * ny
  let summe = 0, gewicht = 0
  for (const [dx, dy, g] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
    const x = Math.min(nx - 1, Math.max(0, x0 + dx)), y = Math.min(ny - 1, Math.max(0, y0 + dy))
    const v = d[basisI + y * nx + x]
    if (v === 255 || g <= 0) continue
    summe += v * g; gewicht += g
  }
  return gewicht === 0 ? null : summe / gewicht / 100
}
