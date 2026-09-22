import { useEffect, useMemo, useState } from 'react'
import { karteLaden } from '../daten'
import type { KartenDaten } from '../typen'

/** Verhältnis Meter je Grad Länge zu Breite in der Schweiz: x = Länge mal das */
export const LAENGE_ZU_BREITE = 73_000 / 111_200
/** Die Karte ist so viel breiter als hoch */
const SEITENVERHAELTNIS = 1.6
/** Ein Linienausschnitt zeigt mindestens so viele Grad Breite (etwa 10 km) */
const MIN_SPANNE = 0.09

export interface Stueck { km: number[]; x: number[]; y: number[] }

export function lesen(k: KartenDaten) {
  const linien = new Map<number, Stueck[]>()
  for (const [nr, stuecke] of Object.entries(k.linien)) {
    linien.set(Number(nr), stuecke.map(({ start, d }) => {
      let [m, la, lo] = start
      const s: Stueck = { km: [m / 1000], x: [lo / 1e5 * LAENGE_ZU_BREITE], y: [-la / 1e5] }
      for (let i = 0; i < d.length; i += 3) {
        m += d[i]; la += d[i + 1]; lo += d[i + 2]
        s.km.push(m / 1000); s.x.push(lo / 1e5 * LAENGE_ZU_BREITE); s.y.push(-la / 1e5)
      }
      return s
    }))
  }
  return linien
}

/** Punkt bei km auf der Linie; ausserhalb ihrer Stücke der nächste Endpunkt */
export function punktBei(stuecke: Stueck[], km: number): [number, number] | null {
  let bester: [number, number] | null = null
  let abstand = Infinity
  for (const s of stuecke) {
    for (let i = 1; i < s.km.length; i++) {
      const [a, b] = [s.km[i - 1], s.km[i]]
      if (km >= Math.min(a, b) && km <= Math.max(a, b)) {
        const t = (km - a) / (b - a || 1)
        return [s.x[i - 1] + t * (s.x[i] - s.x[i - 1]), s.y[i - 1] + t * (s.y[i] - s.y[i - 1])]
      }
    }
    for (const i of [0, s.km.length - 1]) {
      if (Math.abs(s.km[i] - km) < abstand) { abstand = Math.abs(s.km[i] - km); bester = [s.x[i], s.y[i]] }
    }
  }
  return bester
}

/** Die Punkte der Linie zwischen zwei Kilometern */
export function zwischen(stuecke: Stueck[], von: number, bis: number) {
  const raus: Array<[number, number]> = []
  const anfang = punktBei(stuecke, von)
  if (anfang) raus.push(anfang)
  for (const s of stuecke) {
    s.km.forEach((k, i) => { if (k > von && k < bis) raus.push([s.x[i], s.y[i]]) })
  }
  const ende = punktBei(stuecke, bis)
  if (ende) raus.push(ende)
  return raus
}

export const pfad = (pts: Array<[number, number]>) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(5)} ${y.toFixed(5)}`).join('')

export interface KartenObjekt {
  /** «Linie:Stelle» */
  kennung: string
  name: string
  /** Kilometer auf der Linie, wie in der Quelle */
  km: number | null
}

/**
 * Kleine Karte zu den Tunneln oder Brücken einer Linie: grau das Streckennetz
 * der SBB, dunkel die Linie, rot ihre Tunnel oder Brücken, der gewählte
 * grösser und beschriftet. Gezeichnet aus den Daten, ohne Kartenbilder eines
 * fremden Dienstes. Ein Tunnel liegt über seinem Bereich (karte.json), wo die
 * Richtung der Länge erfasst ist; eine Brücke hat keine Länge und ist ein Punkt.
 */
export function ObjektKarte({ art, linie, objekte, markiert, bahnhoefe = [] }: {
  art: 'tunnel' | 'bruecken'
  linie: number
  objekte: KartenObjekt[]
  markiert: string | null
  /** Auf der Linienseite: die Bahnhöfe aus Taktland mit ihrem Kilometer */
  bahnhoefe?: Array<{ name: string; km: number }>
}) {
  const [daten, setDaten] = useState<KartenDaten | null>(null)
  const [fehler, setFehler] = useState(false)
  const [ganz, setGanz] = useState(false)

  useEffect(() => {
    let abgebrochen = false
    karteLaden().then((k) => { if (!abgebrochen) setDaten(k) }).catch(() => { if (!abgebrochen) setFehler(true) })
    return () => { abgebrochen = true }
  }, [])

  const linien = useMemo(() => (daten ? lesen(daten) : null), [daten])

  if (fehler) return null
  if (!daten || !linien) {
    return <div className="mt-4 aspect-[1.6] w-full bg-sbb-milk dark:bg-sbb-charcoal" aria-hidden="true" />
  }
  const eigene = linien.get(linie) ?? []

  // Ausschnitt: die Linie mit Rand oder alle Linien, im Seitenverhältnis der Karte
  const quelle = ganz || !eigene.length ? [...linien.values()].flat() : eigene
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const s of quelle) {
    for (let i = 0; i < s.x.length; i++) {
      x0 = Math.min(x0, s.x[i]); x1 = Math.max(x1, s.x[i]); y0 = Math.min(y0, s.y[i]); y1 = Math.max(y1, s.y[i])
    }
  }
  let w = Math.max(x1 - x0, MIN_SPANNE) * 1.15
  let h = Math.max(y1 - y0, MIN_SPANNE / SEITENVERHAELTNIS) * 1.15
  if (w / h < SEITENVERHAELTNIS) w = h * SEITENVERHAELTNIS
  else h = w / SEITENVERHAELTNIS
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const box = [cx - w / 2, cy - h / 2, w, h]
  // Masse in Bildpunkten der Karte, bei rund 350 Punkten Breite
  const px = w / 350

  const bereiche = objekte
    .map((o) => ({ ...o, bereich: art === 'tunnel' ? daten.tunnel[o.kennung]
      : o.km === null ? undefined : [o.km, o.km] as [number, number] }))
    .filter((o): o is typeof o & { bereich: [number, number] } => o.bereich !== undefined)
  const gewaehlt = bereiche.find((t) => t.kennung === markiert)
  const gewaehltPunkt = gewaehlt ? punktBei(eigene, gewaehlt.bereich[0]) : null
  const halbeBreite = gewaehlt ? gewaehlt.name.length * 3.4 * px : 0
  // Bahnhöfe der Linie an ihrem Kilometer; die Orte zur Orientierung nur, wo
  // nicht schon ein Bahnhof der Linie mit demselben Namen steht
  const stationen = [...bahnhoefe].sort((a, b) => a.km - b.km).flatMap((b) => {
    const p = punktBei(eigene, b.km)
    return p ? [{ ...b, x: p[0], y: p[1] }] : []
  })
  const beschriftet = stationen.length > 1 ? [stationen[0], stationen[stationen.length - 1]] : stationen
  const orte = daten.orte.map((o) => ({ ...o, x: o.lage[1] * LAENGE_ZU_BREITE, y: -o.lage[0] }))
    .filter((o) => o.x > box[0] && o.x < box[0] + w && o.y > box[1] && o.y < box[1] + h)
    .filter((o) => !beschriftet.some((b) => b.name === o.name))

  return (
    <figure className="mt-4">
      <div className="flex justify-end gap-3 text-xs">
        {(['linie', 'schweiz'] as const).map((a) => (
          <button key={a} type="button" onClick={() => setGanz(a === 'schweiz')}
                  aria-pressed={ganz === (a === 'schweiz')}
                  className={`underline-offset-2 ${ganz === (a === 'schweiz')
                    ? 'font-bold text-sbb-black dark:text-sbb-white'
                    : 'text-sbb-metal underline hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white'}`}>
            {a === 'linie' ? `Linie ${linie}` : 'Ganze Schweiz'}
          </button>
        ))}
      </div>
      <svg viewBox={box.join(' ')} role="img" preserveAspectRatio="xMidYMid meet"
           aria-label={`Karte: Linie ${linie} im Streckennetz${gewaehlt ? `, markiert ${gewaehlt.name}` : ''}`}
           className="mt-1 aspect-[1.6] w-full border border-sbb-cloud bg-white dark:border-sbb-iron
                      dark:bg-sbb-midnight">
        {[...linien.entries()].map(([nr, stuecke]) => nr !== linie && stuecke.map((s, i) => (
          <path key={`${nr}-${i}`} d={pfad(s.x.map((x, j) => [x, s.y[j]]))} fill="none"
                className="stroke-sbb-cloud dark:stroke-sbb-iron" strokeWidth={1}
                vectorEffect="non-scaling-stroke" />
        )))}
        {eigene.map((s, i) => (
          <path key={`e${i}`} d={pfad(s.x.map((x, j) => [x, s.y[j]]))} fill="none"
                className="stroke-sbb-charcoal dark:stroke-sbb-white" strokeWidth={2.5}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
        {orte.map((o) => (
          <g key={o.name} className="fill-sbb-metal dark:fill-sbb-storm">
            <circle cx={o.x} cy={o.y} r={2 * px} />
            <text x={o.x + (o.x > cx ? -4 : 4) * px} y={o.y + 3.5 * px} fontSize={10 * px}
                  textAnchor={o.x > cx ? 'end' : 'start'}>{o.name}</text>
          </g>
        ))}
        {bereiche.map((t) => {
          const [v, b] = t.bereich
          if (v !== b) {
            return <path key={t.kennung} d={pfad(zwischen(eigene, v, b))} fill="none"
                         className="stroke-sbb-red" strokeWidth={t.kennung === markiert ? 6 : 4}
                         vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          }
          const p = punktBei(eigene, v)
          // viele Brücken: kleinere Punkte, damit die Linie noch zu sehen ist
          const r = t.kennung === markiert ? 4 : art === 'bruecken' ? 1.8 : 2.5
          return p && <circle key={t.kennung} cx={p[0]} cy={p[1]} r={r * px} className="fill-sbb-red" />
        })}
        {stationen.map((b) => (
          <circle key={`b${b.name}${b.km}`} cx={b.x} cy={b.y} r={2.4 * px} strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                  className="fill-white stroke-sbb-charcoal dark:fill-sbb-midnight dark:stroke-sbb-white" />
        ))}
        {beschriftet.map((b) => (
          <text key={`t${b.name}`} x={b.x + (b.x > cx ? -5 : 5) * px} y={b.y + (b.y < cy ? 13 : -6) * px}
                fontSize={10.5 * px} fontWeight="bold" textAnchor={b.x > cx ? 'end' : 'start'}
                className="fill-sbb-black dark:fill-sbb-white">{b.name}</text>
        ))}
        {gewaehlt && gewaehltPunkt && (
          <g>
            <circle cx={gewaehltPunkt[0]} cy={gewaehltPunkt[1]} r={7 * px} fill="none"
                    className="stroke-sbb-red" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {/* mittig über dem Punkt, am Rand nach innen geschoben (geschätzte
                Textbreite), in der oberen Hälfte darunter */}
            <text x={Math.min(Math.max(gewaehltPunkt[0], box[0] + halbeBreite + 4 * px),
                              box[0] + w - halbeBreite - 4 * px)}
                  y={gewaehltPunkt[1] + (gewaehltPunkt[1] - box[1] < 24 * px ? 22 : -12) * px}
                  fontSize={12 * px} textAnchor="middle" fontWeight="bold"
                  className="fill-sbb-black dark:fill-sbb-white">{gewaehlt.name}</text>
          </g>
        )}
      </svg>
      <figcaption className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
        Gezeichnet aus dem Streckennetz der SBB (linienkilometrierung), Linien anderer Bahnen aus
        dem Schienennetz des BAV, ohne Strassen, Orte und Grenzen.{' '}
        {stationen.length > 0 && 'Ringe: die Bahnhöfe dieser Linie in Taktland an ihrem '
          + 'Kilometer, beschriftet der erste und der letzte. '}
        {art === 'tunnel' && objekte.length > 0
          && 'Rot die Tunnel dieser Linie: als Strecke, wo die Daten die Richtung der Länge '
            + 'hergeben, sonst als Punkt beim erfassten Kilometer, dem Portal.'}
        {art === 'bruecken'
          && 'Rot die Brücken dieser Linie, je als Punkt bei ihrem Kilometer; eine Länge ist '
            + 'nicht erfasst.'}
      </figcaption>
    </figure>
  )
}
