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
}

export interface Wolken {
  ix: WolkenIndex
  /** je Stunde der Zeitpunkt in ms (UTC) */
  zeiten: number[]
  /** Bewölkung in Prozent bei Stunde, Schicht und Zelle (Zeile 0 im Norden), 255 ohne Angabe */
  werte: Uint8Array
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
      const roh = await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      return { ix, zeiten: ix.stunden.map((s) => Date.parse(s)), werte: new Uint8Array(roh) }
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
