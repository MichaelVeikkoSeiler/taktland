/**
 * Bausteine der Anzeige im Fahrtmodus: Ring bis zum nächsten Objekt,
 * Streckenband, Balken im Tunnel und die kleine Karte mit dem Standort.
 * Sie zeigen Lagen auf dem Weg, aber keine Längen: Die Kilometrierung ist ein
 * Standort und keine Länge, darum stehen hier keine Kilometer.
 */
import { useMemo, useState } from 'react'
import { type FahrObjekt, type Fahrweg, lageBei, wegEnde } from '../fahrt'
import { lage, pfad, SEITENVERHAELTNIS, type Stueck, useKarte } from './Netzkarte'

/** So viele Sekunden vor dem Objekt beginnt der Ring sich zu füllen */
export const RING_S = 60

/** Ring um die Zeit bis zum nächsten Objekt; voll beim Objekt */
export function Ring({ anteil, bald, children }: { anteil: number | null; bald: boolean; children: React.ReactNode }) {
  const r = 26
  const umfang = 2 * Math.PI * r
  const voll = Math.max(0, Math.min(1, anteil ?? 0))
  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 64 64" className="size-20 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6"
                className={bald ? 'stroke-white/30' : 'stroke-sbb-cloud dark:stroke-sbb-iron'} />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeDasharray={umfang}
                strokeDashoffset={umfang * (1 - voll)}
                className={`transition-[stroke-dashoffset] duration-500 ease-linear ${bald
                  ? 'stroke-white' : 'stroke-sbb-red'}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {children}
      </div>
    </div>
  )
}

/** Balken im Tunnel: wie weit bis zur Ausfahrt, dazu die Sekunden */
export function TunnelBalken({ anteil }: { anteil: number }) {
  return (
    <div className="mt-2 h-3 w-full bg-white/15" aria-hidden="true">
      <div className="h-3 bg-white transition-[width] duration-500 ease-linear"
           style={{ width: `${Math.max(0, Math.min(1, anteil)) * 100}%` }} />
    </div>
  )
}

/** Wie weit das Band nach vorne und nach hinten reicht, in Metern auf dem Weg */
const VORNE_M = 6000
const HINTEN_M = 600

/**
 * Das Streckenband: oben der ganze Weg vom Start zum Ziel mit dem Zug darauf,
 * darunter das Stück direkt vor dem Zug. Die Objekte fahren von rechts auf
 * den Zug zu. Beides im Massstab des Wegs, ohne Zahlen.
 */
export function Streckenband({ fahrweg, objekte, sJetzt, start, ziel, name }: {
  fahrweg: Fahrweg
  objekte: FahrObjekt[]
  sJetzt: number | null
  start: string
  ziel: string
  name: (o: FahrObjekt) => string | undefined
}) {
  const ende = wegEnde(fahrweg) || 1
  const s = sJetzt ?? 0
  const B = 350
  const zugX = 34
  const xBei = (w: number) => zugX + ((w - s) / VORNE_M) * (B - zugX - 8)
  const sichtbar = objekte.filter((o) => (o.sAus ?? o.s) >= s - HINTEN_M && o.s <= s + VORNE_M)
  // Namen für die nächsten drei vor dem Zug, oben oder unten, ohne Überdeckung
  const beschriftet: Array<{ o: FahrObjekt; x: number; oben: boolean; kurz: string; rechts: boolean }> = []
  const frei = { oben: -Infinity, unten: -Infinity }
  for (const o of sichtbar.filter((o) => o.s > s)) {
    if (beschriftet.length >= 3) break
    const x = Math.max(zugX + 6, xBei(o.s))
    const text = name(o) ?? ''
    const kurz = text.length > 22 ? `${text.slice(0, 21)}…` : text
    const breite = kurz.length * 6.3
    const rechts = x + breite > B
    const [von, bis] = rechts ? [x - breite, x] : [x, x + breite]
    const zeile = von > frei.oben + 6 ? 'oben' : von > frei.unten + 6 ? 'unten' : null
    if (!zeile) continue
    frei[zeile] = bis
    beschriftet.push({ o, x, oben: zeile === 'oben', kurz, rechts })
  }

  return (
    <div className="mt-5">
      <div className="flex justify-between gap-3 text-xs text-sbb-metal dark:text-sbb-storm">
        <span className="truncate">{start}</span>
        <span className="truncate text-right">{ziel}</span>
      </div>
      <div className="relative mt-1 h-2 bg-sbb-cloud dark:bg-sbb-iron" aria-hidden="true">
        <div className="h-2 bg-sbb-charcoal transition-[width] duration-500 ease-linear dark:bg-sbb-white"
             style={{ width: `${Math.min(100, (s / ende) * 100)}%` }} />
        <div className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 border-2 border-white
                        bg-sbb-red transition-[left] duration-500 ease-linear dark:border-sbb-midnight"
             style={{ left: `${Math.min(100, (s / ende) * 100)}%` }} />
      </div>

      <svg viewBox={`0 0 ${B} 92`} className="mt-4 w-full" role="img"
           aria-label="Streckenband: die nächsten Objekte vor dem Zug">
        <line x1="0" x2={B} y1="46" y2="46" strokeWidth="3"
              className="stroke-sbb-cloud dark:stroke-sbb-iron" />
        <line x1="0" x2={zugX} y1="46" y2="46" strokeWidth="3"
              className="stroke-sbb-charcoal dark:stroke-sbb-white" />
        {sichtbar.map((o) => {
          const x = Math.max(0, xBei(o.s))
          if (o.art === 'tunnel') {
            const x2 = o.sAus !== null ? Math.min(B, xBei(o.sAus)) : Math.min(B, x + 10)
            return (
              <g key={`t${o.kennung}`}>
                <rect x={x} y="38" width={Math.max(4, x2 - x)} height="16" rx="2"
                      className="fill-sbb-charcoal dark:fill-sbb-storm" />
                {o.sAus === null && (
                  <rect x={x} y="38" width="10" height="16" rx="2" className="fill-sbb-charcoal/40" />
                )}
              </g>
            )
          }
          if (o.art === 'bruecke') {
            return (
              <path key={`b${o.kennung}`} d={`M${x - 7} 52 Q${x} 38 ${x + 7} 52`} fill="none" strokeWidth="3"
                    strokeLinecap="round" className="stroke-sbb-blue" />
            )
          }
          return (
            <circle key={`h${o.kennung}`} cx={x} cy="46" r="6" strokeWidth="2.5"
                    className="fill-white stroke-sbb-charcoal dark:fill-sbb-midnight dark:stroke-sbb-white" />
          )
        })}
        {beschriftet.map(({ o, x, oben, kurz, rechts }) => {
          return (
            <g key={`n${o.art}${o.kennung}`}>
              <line x1={x} x2={x} y1={oben ? 22 : 56} y2={oben ? 36 : 70} strokeWidth="1"
                    className="stroke-sbb-metal dark:stroke-sbb-storm" />
              <text x={x} y={oben ? 17 : 84} fontSize="11" textAnchor={rechts ? 'end' : 'start'}
                    className="fill-sbb-black dark:fill-sbb-white">{kurz}</text>
            </g>
          )
        })}
        {/* der Zug */}
        <g transform={`translate(${zugX - 13} 36)`}>
          <rect width="26" height="20" rx="5" className="fill-sbb-red" />
          <rect x="15" y="4" width="8" height="7" rx="1.5" className="fill-white" />
        </g>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sbb-metal dark:text-sbb-storm" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-sbb-charcoal dark:bg-sbb-storm" />Tunnel</span>
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 10" className="h-2.5 w-4"><path d="M1 9 Q8 0 15 9" fill="none" strokeWidth="2.5" className="stroke-sbb-blue" /></svg>
          Brücke
        </span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full border-2 border-sbb-charcoal dark:border-sbb-white" />Bahnhof</span>
      </div>
    </div>
  )
}

/** Breite des nahen Ausschnitts, in Grad Breite (etwa 9 km) */
const NAH = 0.08

/**
 * Die kleine Karte zur Fahrt: grau das Streckennetz, dunkel der Weg vor dem
 * Zug, rot der Standort. «Nah» folgt dem Zug, «Ganzer Weg» zeigt alles.
 */
export function FahrtKarte({ fahrweg, objekte, sJetzt }: {
  fahrweg: Fahrweg
  objekte: FahrObjekt[]
  sJetzt: number | null
}) {
  const { linien } = useKarte()
  const [nah, setNah] = useState(true)

  const weg = useMemo(() => fahrweg.punkte.map((p) => ({ xy: lage(p.lat, p.lon), s: p.s })), [fahrweg])
  const ganz = useMemo(() => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const { xy: [x, y] } of weg) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    const w = Math.max((x1 - x0) * 1.15, (y1 - y0) * 1.15 * SEITENVERHAELTNIS, NAH)
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w }
  }, [weg])

  const hier = sJetzt !== null ? lageBei(fahrweg, sJetzt) : fahrweg.punkte[0]
  const [hx, hy] = hier ? lage(hier.lat, hier.lon) : [ganz.cx, ganz.cy]
  const box = nah ? { cx: hx, cy: hy, w: NAH } : ganz
  const h = box.w / SEITENVERHAELTNIS
  const px = box.w / 350
  const s = sJetzt ?? 0

  const netz: Stueck[] = []
  if (linien) {
    for (const stuecke of linien.values()) {
      for (const st of stuecke) {
        if (st.x.some((x, j) => Math.abs(x - box.cx) < box.w && Math.abs(st.y[j] - box.cy) < h)) netz.push(st)
      }
    }
  }
  const hinter = weg.filter((p) => p.s <= s).map((p) => p.xy)
  const vor = weg.filter((p) => p.s >= s).map((p) => p.xy)
  if (hier && sJetzt !== null) { hinter.push([hx, hy]); vor.unshift([hx, hy]) }
  const zeichen = objekte.filter((o) => o.s > s).slice(0, 12)

  return (
    <figure className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Karte</p>
        <div className="flex border border-sbb-cloud text-xs dark:border-sbb-iron" role="group" aria-label="Ausschnitt">
          {([[true, 'Nah'], [false, 'Ganzer Weg']] as const).map(([n, t]) => (
            <button key={t} type="button" aria-pressed={nah === n} onClick={() => setNah(n)}
                    className={`px-3 py-1.5 font-medium ${nah === n
                      ? 'bg-sbb-charcoal text-white dark:bg-sbb-white dark:text-sbb-black'
                      : 'bg-white dark:bg-sbb-midnight'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={[box.cx - box.w / 2, box.cy - h / 2, box.w, h].join(' ')} role="img"
           aria-label="Karte mit dem Weg und dem Standort" preserveAspectRatio="xMidYMid meet"
           className="mt-2 aspect-[1.6] w-full border border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-midnight">
        {netz.map((st, i) => (
          <path key={i} d={pfad(st.x.map((x, j) => [x, st.y[j]]))} fill="none" strokeWidth={1}
                vectorEffect="non-scaling-stroke" className="stroke-sbb-cloud dark:stroke-sbb-iron" />
        ))}
        <path d={pfad(hinter)} fill="none" strokeWidth={3} vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" className="stroke-sbb-storm dark:stroke-sbb-metal" />
        <path d={pfad(vor)} fill="none" strokeWidth={3.5} vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" className="stroke-sbb-charcoal dark:stroke-sbb-white" />
        {zeichen.map((o) => {
          const l = lageBei(fahrweg, o.s)
          const [x, y] = lage(l.lat, l.lon)
          return (
            <circle key={`${o.art}${o.kennung}`} cx={x} cy={y} r={(o.art === 'bahnhof' ? 3.5 : 3) * px}
                    strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                    className={o.art === 'tunnel' ? 'fill-sbb-charcoal stroke-white dark:fill-sbb-storm dark:stroke-sbb-midnight'
                      : o.art === 'bruecke' ? 'fill-sbb-blue stroke-white dark:stroke-sbb-midnight'
                      : 'fill-white stroke-sbb-charcoal dark:fill-sbb-midnight dark:stroke-sbb-white'} />
          )
        })}
        {hier && sJetzt !== null && (
          <>
            <circle cx={hx} cy={hy} r={9 * px} className="fill-sbb-red/20" />
            <circle cx={hx} cy={hy} r={5 * px} strokeWidth={2} vectorEffect="non-scaling-stroke"
                    className="fill-sbb-red stroke-white dark:stroke-sbb-midnight" />
          </>
        )}
      </svg>
      <figcaption className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
        Gezeichnet aus dem Streckennetz der SBB (linienkilometrierung), Linien anderer Bahnen aus
        dem Schienennetz des BAV. Auf Strecken anderer Bahnen ist der Weg gerade von Bahnhof zu
        Bahnhof gezogen. Rot der geschätzte Standort.
        {!linien && ' Das Netz wird geladen …'}
      </figcaption>
    </figure>
  )
}
