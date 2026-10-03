import { useEffect, useState } from 'react'
import { seenLaden } from '../daten'
import type { SeenDaten } from '../typen'
import { LAENGE_ZU_BREITE, pfad, type Box } from './Netzkarte'
import { imBild, kachelnImBild, kachelPfad, type Schicht, schichtBauen, type Stueck, stueckeln } from '../kacheln'

/**
 * Seen auf den Karten (Michael, 2026-09-25: «Alle Seen», «helles Blau selber
 * durch dich definiert», «Seenamen immer einblenden wenn vertretbar»). Aus
 * swissTLMRegio von swisstopo wie die Flüsse, damit beide zusammenpassen (Michael,
 * 2026-10-03: «Flüsse ragen gar nicht bis zu den Seen»); Seen unter 0,1 km² fehlen.
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

/** Wasser je Kachel und die Ufer in Stücken (Michael, 2026-10-01: die Seen sofort zeigen) */
let wasser: Schicht | null = null
let ufer: Stueck[] = []

function lesen(daten: SeenDaten): See[] {
  const ringe: Array<Array<[number, number]>> = []
  const seen = daten.seen.map((s) => {
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
      ringe.push(pts)
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
  wasser = schichtBauen(ringe, true)
  ufer = ringe.flatMap((r) => stueckeln([...r, r[0]], (q) => pfad(q as Array<[number, number]>)))
  return seen
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
/** px: Kartenmass je Bildpunkt; damit wird das Ufer ohne vector-effect gezeichnet (siehe Schweiz11Karte) */
export function SeenFlaechen({ seen, box, verh = 1.6, px }: { seen: See[] | null; box: Box; verh?: number; px?: number }) {
  if (!seen || !wasser) return null
  const h = box.w / verh
  const w = wasser
  // das Wasser je Kachel, das Ufer nur, wo es im Bild liegt: nicht mehr ganze Seen bei jedem Bild
  return (
    <g aria-hidden="true">
      <path d={kachelnImBild(box, h).map((k) => kachelPfad(w, k)).join('')} fillRule="evenodd" className="fill-see" />
      <path d={ufer.filter((u) => imBild(u, box, h)).map((u) => u.d).join('')} fill="none" strokeWidth={px ? 0.8 * px : 0.8}
            vectorEffect={px ? undefined : 'non-scaling-stroke'} strokeLinejoin="round" className="stroke-see-rand" />
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
