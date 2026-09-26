import { useEffect, useState } from 'react'
import { seenLaden } from '../daten'
import type { SeenDaten } from '../typen'
import { LAENGE_ZU_BREITE, pfad, type Box } from './Netzkarte'

/**
 * Seen auf den Karten (Michael, 2026-09-25: «Alle Seen», «helles Blau selber
 * durch dich definiert», «Seenamen immer einblenden wenn vertretbar»). Aus
 * Swiss Map Vector 1000 von swisstopo; in diesem Massstab fehlen kleine Seen.
 * Gezeichnet unter dem Streckennetz. Ein Name steht nur, wenn der See im Bild
 * breit genug dafür ist und er keinen anderen Namen überdeckt.
 */

export interface See {
  d: string
  x0: number; x1: number; y0: number; y1: number
  name?: string
  nx?: number; ny?: number
}

let vorrat: See[] | null = null
let laden: Promise<See[]> | null = null

function lesen(daten: SeenDaten): See[] {
  return daten.seen.map((s) => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
    const d = s.ringe.map(({ start, d }) => {
      let [la, lo] = start
      const pts: Array<[number, number]> = [[lo / 1e5 * LAENGE_ZU_BREITE, -la / 1e5]]
      for (let i = 0; i < d.length; i += 2) {
        la += d[i]; lo += d[i + 1]
        pts.push([lo / 1e5 * LAENGE_ZU_BREITE, -la / 1e5])
      }
      for (const [x, y] of pts) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      }
      return `${pfad(pts)}Z`
    }).join('')
    const see: See = { d, x0, x1, y0, y1 }
    if (s.name && s.namenspunkt) {
      see.name = s.name
      see.nx = s.namenspunkt[1] * LAENGE_ZU_BREITE
      see.ny = -s.namenspunkt[0]
    }
    return see
  })
}

/** Lädt die Seen einmal für alle Karten; ohne Seen bleibt die Karte, wie sie war */
export function useSeen(): See[] | null {
  const [seen, setSeen] = useState<See[] | null>(vorrat)
  useEffect(() => {
    if (vorrat) return
    let abgebrochen = false
    laden ??= seenLaden().then((d) => (vorrat = lesen(d)))
    laden.then((s) => { if (!abgebrochen) setSeen(s) }).catch(() => { laden = null })
    return () => { abgebrochen = true }
  }, [])
  return seen
}

type Feld = [number, number, number, number]

/** Die Flächen im Bild; unter dem Streckennetz zeichnen */
export function SeenFlaechen({ seen, box, verh = 1.6 }: { seen: See[] | null; box: Box; verh?: number }) {
  if (!seen) return null
  const h = box.w / verh
  const im = seen.filter((s) => s.x1 > box.cx - box.w && s.x0 < box.cx + box.w
    && s.y1 > box.cy - h && s.y0 < box.cy + h)
  return (
    <g aria-hidden="true">
      {im.map((s, i) => <path key={i} d={s.d} fillRule="evenodd" className="fill-see" />)}
    </g>
  )
}

/**
 * Die Namen der Seen im Bild, die Platz haben. «belegt» sind Felder, die
 * schon beschriftet sind (etwa Bahnhöfe); sie gehen vor.
 */
export function SeenNamen({ seen, box, px, belegt = [], verh = 1.6 }: {
  seen: See[] | null
  box: Box
  px: number
  belegt?: Feld[]
  verh?: number
}) {
  if (!seen) return null
  const h = box.w / verh
  const schrift = 9.5
  const felder = [...belegt]
  const namen: Array<{ s: See; feld: Feld }> = []
  const gesehen = new Set<string>()
  // grosse Seen zuerst, damit sie ihren Namen bekommen
  const reihe = seen.filter((s) => s.name && s.nx !== undefined)
    .sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))
  for (const s of reihe) {
    if (gesehen.has(s.name!)) continue
    const nx = s.nx!, ny = s.ny!
    if (Math.abs(nx - box.cx) > box.w * 0.46 || Math.abs(ny - box.cy) > h * 0.44) continue
    const breite = s.name!.length * schrift * 0.52 * px
    // nur wenn der See im Bild ungefähr so breit ist wie sein Name
    if ((s.x1 - s.x0) < breite * 0.8 && (s.y1 - s.y0) < breite * 0.8) continue
    const feld: Feld = [nx - breite / 2, ny - schrift * 0.6 * px, nx + breite / 2, ny + schrift * 0.6 * px]
    if (feld[0] < box.cx - box.w / 2 || feld[2] > box.cx + box.w / 2) continue
    if (felder.some((f) => f[0] < feld[2] && feld[0] < f[2] && f[1] < feld[3] && feld[1] < f[3])) continue
    felder.push(feld)
    gesehen.add(s.name!)
    namen.push({ s, feld })
  }
  return (
    <g aria-hidden="true">
      {namen.map(({ s }) => (
        <text key={s.name} x={s.nx} y={s.ny! + schrift * 0.35 * px} fontSize={schrift * px} fontStyle="italic"
              textAnchor="middle" className="fill-see-name stroke-see-halo" strokeWidth={2.5}
              paintOrder="stroke" vectorEffect="non-scaling-stroke">{s.name}</text>
      ))}
    </g>
  )
}
