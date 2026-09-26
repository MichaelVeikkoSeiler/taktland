/**
 * Bausteine der Anzeige im Fahrtmodus: Ring bis zum nächsten Objekt,
 * Streckenband, Balken im Tunnel und die kleine Karte mit dem Standort.
 * Sie zeigen Lagen auf dem Weg, aber keine Längen: Die Kilometrierung ist ein
 * Standort und keine Länge, darum stehen hier keine Kilometer.
 */
import { useMemo, useRef, useState } from 'react'
import { type FahrObjekt, type Fahrweg, lageBei, wegEnde } from '../fahrt'
import { lage, pfad, SEITENVERHAELTNIS, type Stueck, useKarte, useVollbild, vollbildKlassen, VollbildKnopf } from './Netzkarte'
import { SeenFlaechen, SeenNamen, useSeen } from './Seen'
import { type Auswahl, AuswahlZeile, FlaechenEbene, SehenswertEbene, useSehenswert } from './Sehenswert'

/** So viele Sekunden vor dem Objekt beginnt der Ring sich zu füllen */
export const RING_S = 60

/**
 * Farben je Art im Fahrtmodus: Tunnel schwarz, Brücken orange, Bahnhöfe blau
 * (Michael, 2026-09-25), auch für den Ring und die grosse Fläche kurz vor dem
 * Objekt. Auf Orange steht die Schrift schwarz, sonst weiss. Im Dunkeln bekommt
 * die schwarze Fläche einen hellen Rand, sonst verschwände sie.
 */
export const FARBE: Record<FahrObjekt['art'], { flaeche: string; ring: string; ringBald: string; grundBald: string; schrift: string }> = {
  tunnel: {
    flaeche: 'border-fahrt-tunnel bg-fahrt-tunnel dark:border-sbb-storm', schrift: 'text-white',
    ring: 'stroke-fahrt-tunnel dark:stroke-sbb-storm', ringBald: 'stroke-white', grundBald: 'stroke-white/30',
  },
  bruecke: {
    flaeche: 'border-fahrt-bruecke bg-fahrt-bruecke', schrift: 'text-sbb-black',
    ring: 'stroke-fahrt-bruecke', ringBald: 'stroke-sbb-black', grundBald: 'stroke-black/15',
  },
  bahnhof: {
    flaeche: 'border-fahrt-bahnhof bg-fahrt-bahnhof', schrift: 'text-white',
    ring: 'stroke-fahrt-bahnhof dark:stroke-fahrt-bahnhof-hell', ringBald: 'stroke-white', grundBald: 'stroke-white/30',
  },
}

/** Ring um die Zeit bis zum nächsten Objekt; voll beim Objekt */
export function Ring({ anteil, bald, art, children }: {
  anteil: number | null
  bald: boolean
  art: FahrObjekt['art']
  children: React.ReactNode
}) {
  const r = 26
  const umfang = 2 * Math.PI * r
  const voll = Math.max(0, Math.min(1, anteil ?? 0))
  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 64 64" className="size-20 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6"
                className={bald ? FARBE[art].grundBald : 'stroke-sbb-cloud dark:stroke-sbb-iron'} />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeDasharray={umfang}
                strokeDashoffset={umfang * (1 - voll)}
                className={`transition-[stroke-dashoffset] duration-500 ease-linear ${bald
                  ? FARBE[art].ringBald : FARBE[art].ring}`} />
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

/**
 * Das Streckenband: der ganze Weg vom Start zum Ziel als Linie, darauf alle
 * Tunnel, Brücken und Bahnhöfe und der Zug an seiner Stelle. Was durchfahren
 * ist, bleibt stehen, in voller Farbe (Michael, 2026-09-25: erst «Was vorbei
 * ist, ist vorbei» nicht erwünscht, dann «soll nicht heller werden»). Im
 * Massstab des Wegs, ohne Zahlen.
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
  const RAND = 14
  const xBei = (w: number) => RAND + (Math.max(0, Math.min(ende, w)) / ende) * (B - 2 * RAND)
  const zugX = xBei(s)
  // Namen für die nächsten drei vor dem Zug, oben oder unten, ohne Überdeckung
  const beschriftet: Array<{ o: FahrObjekt; x: number; oben: boolean; kurz: string; rechts: boolean }> = []
  const frei = { oben: -Infinity, unten: -Infinity }
  for (const o of objekte.filter((o) => o.s > s)) {
    if (beschriftet.length >= 3) break
    const x = xBei(o.s)
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
      <svg viewBox={`0 0 ${B} 92`} className="mt-1 w-full" role="img"
           aria-label={`Streckenband: der ganze Weg von ${start} nach ${ziel} mit dem Zug`}>
        <line x1={RAND} x2={B - RAND} y1="46" y2="46" strokeWidth="3"
              className="stroke-sbb-cloud dark:stroke-sbb-iron" />
        <line x1={RAND} x2={zugX} y1="46" y2="46" strokeWidth="3"
              className="stroke-sbb-charcoal transition-all duration-500 ease-linear dark:stroke-sbb-white" />
        {/* Start und Ziel */}
        {[RAND, B - RAND].map((x) => (
          <line key={x} x1={x} x2={x} y1="40" y2="52" strokeWidth="2.5"
                className="stroke-sbb-charcoal dark:stroke-sbb-white" />
        ))}
        {objekte.map((o) => {
          const x = xBei(o.s)
          if (o.art === 'tunnel') {
            const x2 = o.sAus !== null ? xBei(o.sAus) : x + 3
            return (
              <rect key={`t${o.kennung}`} x={x} y="41" width={Math.max(2.5, x2 - x)} height="10" rx="1.5"
                    className="fill-fahrt-tunnel dark:fill-sbb-storm" />
            )
          }
          if (o.art === 'bruecke') {
            return (
              <path key={`b${o.kennung}`} d={`M${x - 3} 49 Q${x} 41.5 ${x + 3} 49`} fill="none" strokeWidth="2"
                    strokeLinecap="round" className="stroke-fahrt-bruecke" />
            )
          }
          // Bahnhöfe als Punkte statt Kreise (Michael, 2026-09-25: «übersichtlicher»)
          return (
            <circle key={`h${o.kennung}`} cx={x} cy="46" r="3" strokeWidth="1"
                    className="fill-fahrt-bahnhof stroke-white dark:fill-fahrt-bahnhof-hell dark:stroke-sbb-midnight" />
          )
        })}
        {beschriftet.map(({ o, x, oben, kurz, rechts }) => (
          <g key={`n${o.art}${o.kennung}`}>
            <line x1={x} x2={x} y1={oben ? 22 : 56} y2={oben ? 37 : 70} strokeWidth="1"
                  className="stroke-sbb-metal dark:stroke-sbb-storm" />
            <text x={x} y={oben ? 17 : 84} fontSize="11" textAnchor={rechts ? 'end' : 'start'}
                  className="fill-sbb-black dark:fill-sbb-white">{kurz}</text>
          </g>
        ))}
        {/* der Zug */}
        <g transform={`translate(${zugX - 9} 39)`} className="transition-transform duration-500 ease-linear">
          <rect width="18" height="14" rx="3.5" strokeWidth="1.5"
                className="fill-sbb-red stroke-white dark:stroke-sbb-midnight" />
          <rect x="10" y="3" width="5" height="4.5" rx="1" className="fill-white" />
        </g>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sbb-metal dark:text-sbb-storm" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-sm bg-fahrt-tunnel dark:bg-sbb-storm" />Tunnel</span>
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 10" className="h-2.5 w-4">
            <path d="M3 9 Q8 1 13 9" fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-fahrt-bruecke" />
          </svg>
          Brücke
        </span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-fahrt-bahnhof dark:bg-fahrt-bahnhof-hell" />Bahnhof</span>
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
  const seen = useSeen()
  const sehenswert = useSehenswert()
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [nah, setNahRoh] = useState(true)
  // eigener Zoom und Verschiebung, die das Nachführen alle halbe Sekunde
  // nicht zurücksetzt (Michael, 2026-09-26: «springt immer wieder auf den
  // Default-Ausschnitt»); «Nah» folgt dem Zug trotzdem
  const [zoom, setZoom] = useState(1)
  const [versatz, setVersatz] = useState<[number, number]>([0, 0])
  const zeiger = useRef(new Map<number, { x: number; y: number }>())
  const abstand = useRef(0)
  const flaeche = useRef<SVGSVGElement | null>(null)
  const { voll, setVoll, verh } = useVollbild(flaeche)
  const setNah = (n: boolean) => { setNahRoh(n); setZoom(1); setVersatz([0, 0]) }
  const zoomen = (f: number) => setZoom((z) => Math.min(40, Math.max(0.25, z * f)))

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
  const grund = nah ? { cx: hx, cy: hy, w: NAH } : ganz
  const box = { cx: grund.cx + versatz[0], cy: grund.cy + versatz[1], w: grund.w / zoom }
  const veraendert = zoom !== 1 || versatz[0] !== 0 || versatz[1] !== 0

  function runter(e: React.PointerEvent<SVGSVGElement>) {
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()]
      abstand.current = Math.hypot(a.x - b.x, a.y - b.y)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }
  function bewegt(e: React.PointerEvent<SVGSVGElement>) {
    const vorher = zeiger.current.get(e.pointerId)
    if (!vorher) return
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (abstand.current) zoomen(d / abstand.current)
      abstand.current = d
      return
    }
    // mit einem Finger verschieben, sobald die Karte näher steht
    if (zoom <= 1) return
    const breite = flaeche.current?.getBoundingClientRect().width || 350
    const e2 = box.w / breite
    setVersatz(([vx, vy]) => [vx - (e.clientX - vorher.x) * e2, vy - (e.clientY - vorher.y) * e2])
  }
  function hoch(e: React.PointerEvent<SVGSVGElement>) {
    zeiger.current.delete(e.pointerId)
    if (zeiger.current.size < 2) abstand.current = 0
  }
  const h = box.w / verh
  const px = box.w / 350
  const klassen = vollbildKlassen(voll, 'mt-3')
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
  // alle Objekte des Wegs; durchfahrene bleiben stehen, in voller Farbe
  const zeichen = objekte

  return (
    <figure className={klassen.figur}>
      {/* eine Zeile für alle Knöpfe, damit die Karte kompakt oben bleibt */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex overflow-hidden rounded-lg border border-sbb-cloud dark:border-sbb-iron" role="group" aria-label="Ausschnitt">
          {([[true, 'Nah'], [false, 'Ganzer Weg']] as const).map(([n, t]) => (
            <button key={t} type="button" aria-pressed={nah === n} onClick={() => setNah(n)}
                    className={`px-3 py-1.5 font-medium ${nah === n
                      ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                      : 'bg-white dark:bg-sbb-midnight'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {veraendert && (
            <button type="button" onClick={() => { setZoom(1); setVersatz([0, 0]) }}
                    className="text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                               dark:text-sbb-storm dark:hover:text-sbb-white">
              {nah ? 'Zum Zug' : 'Alles'}
            </button>
          )}
          {([['−', 1 / 1.6], ['+', 1.6]] as const).map(([zeichen, f]) => (
            <button key={zeichen} type="button" onClick={() => zoomen(f)}
                    aria-label={zeichen === '+' ? 'Näher heran' : 'Weiter weg'}
                    className="flex size-8 items-center justify-center rounded-lg border border-sbb-cloud
                               bg-white text-base leading-none hover:border-sbb-black
                               dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white">
              {zeichen}
            </button>
          ))}
          <VollbildKnopf voll={voll} umschalten={() => setVoll(!voll)} />
        </div>
      </div>
      <svg ref={flaeche} viewBox={[box.cx - box.w / 2, box.cy - h / 2, box.w, h].join(' ')} role="img"
           aria-label="Karte mit dem Weg und dem Standort" preserveAspectRatio="xMidYMid meet"
           onPointerDown={runter} onPointerMove={bewegt} onPointerUp={hoch} onPointerCancel={hoch}
           style={{ touchAction: zoom > 1 ? 'none' : 'pan-y' }}
           className={`${klassen.svg} border border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-midnight`}>
        <FlaechenEbene flaechen={sehenswert.f} box={box} verh={verh} waehlen={setAuswahl} />
        <SeenFlaechen seen={seen} box={box} verh={verh} />
        <SeenNamen seen={seen} box={box} px={px} verh={verh} />
        <SehenswertEbene daten={sehenswert.s} box={box} px={px} verh={verh} waehlen={setAuswahl} />
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
            <circle key={`${o.art}${o.kennung}`} cx={x} cy={y} r={(o.art === 'bahnhof' ? 3 : 2.5) * px}
                    strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                    className={o.art === 'tunnel' ? 'fill-fahrt-tunnel stroke-white dark:fill-sbb-storm dark:stroke-sbb-midnight'
                      : o.art === 'bruecke' ? 'fill-fahrt-bruecke stroke-white dark:stroke-sbb-midnight'
                      : 'fill-fahrt-bahnhof stroke-white dark:fill-fahrt-bahnhof-hell dark:stroke-sbb-midnight'} />
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
      {!voll && <AuswahlZeile auswahl={auswahl} schliessen={() => setAuswahl(null)} />}
      <figcaption className={`mt-1 text-xs text-sbb-metal dark:text-sbb-storm ${voll ? 'hidden' : ''}`}>
        {!linien && 'Das Netz wird geladen … '}
        <details>
          <summary className="cursor-pointer underline underline-offset-2">Zur Karte</summary>
          <p className="mt-1">
        Gezeichnet aus dem Streckennetz der SBB (linienkilometrierung), Linien anderer Bahnen aus
        dem Schienennetz des BAV. Auf Strecken anderer Bahnen ist der Weg gerade von Bahnhof zu
        Bahnhof gezogen. Rot der geschätzte Standort.
        {seen && ' Seen: Swiss Map Vector 1000, swisstopo; kleine Seen fehlen in diesem Massstab.'}
        {sehenswert.s && ' Gipfel: swisstopo; Kulturgüter von nationaler Bedeutung: BABS; Seilbahnen: BAV; BLN, Pärke, Moorlandschaften: BAFU. Kulturgüter erscheinen erst näher; ein Tipp auf ein Zeichen zeigt, was es ist.'}
        {' Zoomen mit zwei Fingern oder mit «+» und «−»; näher gezoomt lässt sich die Karte verschieben.'}
          </p>
        </details>
      </figcaption>
    </figure>
  )
}
