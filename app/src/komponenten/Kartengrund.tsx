import { useEffect, useState } from 'react'
import { bodenbedeckungLaden, kartengrundLaden } from '../daten'
import { useVersteckt } from './Sehenswert'
import type { BodenbedeckungDaten, KartengrundDaten, KodierterZug } from '../typen'
import { LAENGE_ZU_BREITE, pfad, type Box } from './Netzkarte'

/**
 * Der Grund der Karten (Michael, 2026-09-27: «den weissen Hintergrund
 * langweilig»): (1) das Ausland leicht grau, die Kantone fein umrandet,
 * (2) die breiteren Flüsse, (3) Höhenstufen ab 1000, 2000 und 3000 m als flache
 * Töne. Michael, 2026-09-27: «alle drei, Gebiete heller».
 */

interface Zug { d: string; x0: number; x1: number; y0: number; y1: number }
interface Grund {
  land: string
  kantone: Zug[]
  fluesse: Array<Zug & { b: number }>
  hoehen: Array<{ ab: number; flaechen: Zug[] }>
}

let vorrat: Grund | null = null
let laden: Promise<Grund> | null = null

function zug(z: KodierterZug, zu: boolean, faktor = 1e5): Zug {
  let [la, lo] = z.start
  const pts: Array<[number, number]> = [[lo / faktor * LAENGE_ZU_BREITE, -la / faktor]]
  for (let i = 0; i < z.d.length; i += 2) {
    la += z.d[i]; lo += z.d[i + 1]
    pts.push([lo / faktor * LAENGE_ZU_BREITE, -la / faktor])
  }
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  return { d: pfad(pts) + (zu ? 'Z' : ''), x0, x1, y0, y1 }
}

function lesen(d: KartengrundDaten): Grund {
  return {
    land: d.land.map((r) => zug(r, true).d).join(''),
    kantone: d.kanton.map((r) => zug(r, true)),
    fluesse: d.fluesse.map((f) => ({ ...zug(f, false), b: f.b })),
    hoehen: d.hoehen.map((s) => ({ ab: s.ab_m, flaechen: s.ringe.map((r) => zug(r, true)) })),
  }
}

export function useKartengrund(): Grund | null {
  const [g, setG] = useState<Grund | null>(vorrat)
  useEffect(() => {
    if (vorrat) return
    let ab = false
    laden ??= kartengrundLaden().then((d) => (vorrat = lesen(d)))
    laden.then((x) => { if (!ab) setG(x) }).catch(() => { laden = null })
    return () => { ab = true }
  }, [])
  return g
}

/** Wald und Siedlung (Michael, 2026-09-27), einmal geladen für alle Karten */
interface Boden { wald: Zug[]; siedlung: Zug[] }
let bodenVorrat: Boden | null = null
let bodenLaden: Promise<Boden> | null = null

function bodenLesen(d: BodenbedeckungDaten): Boden {
  const f = d.faktor
  return { wald: d.wald.map((r) => zug(r, true, f)), siedlung: d.siedlung.map((r) => zug(r, true, f)) }
}

function useBoden(): Boden | null {
  const [b, setB] = useState<Boden | null>(bodenVorrat)
  useEffect(() => {
    if (bodenVorrat) return
    let ab = false
    bodenLaden ??= bodenbedeckungLaden().then((d) => (bodenVorrat = bodenLesen(d)))
    bodenLaden.then((x) => { if (!ab) setB(x) }).catch(() => { bodenLaden = null })
    return () => { ab = true }
  }, [])
  return b
}

const im = (z: Zug, box: Box, h: number) =>
  z.x1 > box.cx - box.w && z.x0 < box.cx + box.w && z.y1 > box.cy - h && z.y0 < box.cy + h

/** Unter allen anderen Ebenen zeichnen */
export function KartengrundEbene({ grund, box, verh = 1.6 }: { grund: Grund | null; box: Box; verh?: number }) {
  const boden = useBoden()
  const aus = useVersteckt()
  if (!grund) return null
  const h = box.w / verh
  // ein Rahmen weit um den Ausschnitt; mit der Schweiz als Loch wird er zum Ausland
  const r = [box.cx - box.w * 2, box.cy - h * 2, box.cx + box.w * 2, box.cy + h * 2]
  const rahmen = `M${r[0]} ${r[1]}H${r[2]}V${r[3]}H${r[0]}Z`
  return (
    <g aria-hidden="true">
      {grund.hoehen.map((s, i) => (
        <path key={`h${s.ab}`} d={s.flaechen.filter((z) => im(z, box, h)).map((z) => z.d).join('')}
              fillRule="evenodd" className={['fill-hoehe-1', 'fill-hoehe-2', 'fill-hoehe-3'][i]} />
      ))}
      {/* Siedlung und Wald über den Höhenstufen, leicht durchscheinend */}
      {boden && !aus.has('boden') && ([['siedlung', 'fill-siedlung'], ['wald', 'fill-wald']] as const).map(([k, klasse]) => (
        <path key={k} d={boden[k].filter((z) => im(z, box, h)).map((z) => z.d).join('')}
              fillRule="evenodd" className={klasse} />
      ))}
      {(
        <>
          <path d={rahmen + grund.land} fillRule="evenodd" className="fill-ausland" />
          {grund.kantone.filter((z) => im(z, box, h)).map((z, i) => (
            <path key={`k${i}`} d={z.d} fill="none" strokeWidth={0.75} vectorEffect="non-scaling-stroke"
                  className="stroke-kantonsgrenze" />
          ))}
          <path d={grund.land} fill="none" strokeWidth={1.2} vectorEffect="non-scaling-stroke"
                className="stroke-landesgrenze" />
        </>
      )}
      {grund.fluesse.filter((z) => im(z, box, h)).map((z, i) => (
        <path key={`f${i}`} d={z.d} fill="none" strokeWidth={z.b >= 0.3 ? 2 : 1.3}
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
              className="stroke-fluss" />
      ))}
    </g>
  )
}
