/**
 * Bausteine der Anzeige im Fahrtmodus: Ring bis zum nächsten Objekt,
 * Streckenband, Balken im Tunnel und die kleine Karte mit dem Standort.
 * Sie zeigen Lagen auf dem Weg, aber keine Längen: Die Kilometrierung ist ein
 * Standort und keine Länge, darum stehen hier keine Kilometer.
 */
import { useMemo, useRef, useState } from 'react'
import { type FahrObjekt, type Fahrweg, lageBei, wegEnde } from '../fahrt'
import { lage, pfad, type Stueck, useBreite, useKarte, useVollbild, vollbildKlassen, VollbildKnopf } from './Netzkarte'
import { SeenFlaechen, SeenNamen, useSeen } from './Seen'
import { type Auswahl, AuswahlZeile, FlaechenEbene, SehenswertEbene, SehenswertLegende, useSehenswert } from './Sehenswert'
import { FlussNamen, KartengrundEbene, useKartengrund } from './Kartengrund'

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
  sehenswert: {
    flaeche: 'border-fahrt-sehenswert bg-fahrt-sehenswert', schrift: 'text-white',
    ring: 'stroke-fahrt-sehenswert dark:stroke-fahrt-sehenswert-hell', ringBald: 'stroke-white', grundBald: 'stroke-white/30',
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
export function TunnelBalken({ anteil, hell = false }: { anteil: number; hell?: boolean }) {
  // hell: auf der Fläche der Brücke dunkel statt weiss
  return (
    <div className={`mt-2 h-3 w-full ${hell ? 'bg-black/15' : 'bg-white/15'}`} aria-hidden="true">
      <div className={`h-3 ${hell ? 'bg-sbb-black' : 'bg-white'} transition-[width] duration-500 ease-linear`}
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
export function Streckenband({ fahrweg, objekte, sJetzt, start, ziel, name, springen, fliessend = false }: {
  fahrweg: Fahrweg
  objekte: FahrObjekt[]
  sJetzt: number | null
  start: string
  ziel: string
  name: (o: FahrObjekt) => string | undefined
  /** nur in der Probefahrt: den Zug an eine Stelle ziehen (Michael, 2026-09-26:
   *  «den Zug als Regler verschieben») */
  springen?: (s: number) => void
  /** die Anzeige wird oft nachgeführt (Probefahrt): ohne Überblendung, sonst hinkt der Zug nach */
  fliessend?: boolean
}) {
  const ende = wegEnde(fahrweg) || 1
  const B = 350
  const RAND = 14
  const band = useRef<SVGSVGElement | null>(null)
  // während des Ziehens folgt der Zug dem Finger, ohne Übergang
  const [gezogen, setGezogen] = useState<number | null>(null)
  const s = gezogen ?? sJetzt ?? 0
  const xBei = (w: number) => RAND + (Math.max(0, Math.min(ende, w)) / ende) * (B - 2 * RAND)
  const zugX = xBei(s)
  const weich = gezogen === null && !fliessend ? 'transition-all duration-500 ease-linear' : ''

  function sBei(clientX: number) {
    const r = band.current?.getBoundingClientRect()
    if (!r || !r.width) return 0
    const x = ((clientX - r.left) / r.width) * B
    return Math.max(0, Math.min(ende, ((x - RAND) / (B - 2 * RAND)) * ende))
  }
  const ziehen = springen ? {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      setGezogen(sBei(e.clientX))
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      if (gezogen !== null) setGezogen(sBei(e.clientX))
    },
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
      if (gezogen === null) return
      springen(sBei(e.clientX))
      setGezogen(null)
    },
    onPointerCancel: () => setGezogen(null),
    onKeyDown: (e: React.KeyboardEvent<SVGSVGElement>) => {
      const schritt = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (!schritt) return
      e.preventDefault()
      springen(Math.max(0, Math.min(ende, (sJetzt ?? 0) + schritt * ende / 50)))
    },
  } : {}
  // Höchstens vier Namen vor dem Zug, oben oder unten, ohne Überdeckung. Zuerst die
  // Bahnhöfe, dann Tunnel und Brücken, wo Platz bleibt, zuletzt Sehenswertes, je das
  // Nächste zuerst (Michael, 2026-09-30: «nur Bahnhöfe beschriften … ausser es hat Platz»)
  const beschriftet: Array<{ o: FahrObjekt; x: number; oben: boolean; kurz: string; rechts: boolean }> = []
  const belegt: Record<'oben' | 'unten', Array<[number, number]>> = { oben: [], unten: [] }
  const frei = (z: 'oben' | 'unten', von: number, bis: number) =>
    belegt[z].every(([a, b]) => bis + 6 < a || von > b + 6)
  const rang = (o: FahrObjekt) => (o.art === 'bahnhof' ? 0 : o.art === 'sehenswert' ? 2 : 1)
  const vorne = objekte.filter((o) => o.s > s).sort((a, b) => rang(a) - rang(b) || a.s - b.s)
  for (const o of vorne) {
    if (beschriftet.length >= 4) break
    const x = xBei(o.s)
    const text = name(o) ?? ''
    const kurz = text.length > 22 ? `${text.slice(0, 21)}…` : text
    const breite = kurz.length * 6.3
    const rechts = x + breite > B
    const [von, bis] = rechts ? [x - breite, x] : [x, x + breite]
    const zeile = frei('oben', von, bis) ? 'oben' : frei('unten', von, bis) ? 'unten' : null
    if (!zeile) continue
    belegt[zeile].push([von, bis])
    beschriftet.push({ o, x, oben: zeile === 'oben', kurz, rechts })
  }

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 text-xs text-sbb-metal dark:text-sbb-storm">
        <span className="min-w-0 shrink truncate">{start}</span>
        {/* ein dünner Pfeil in Fahrtrichtung (Michael, 2026-09-30) */}
        <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" className="h-2 min-w-6 flex-1">
          <path d="M0 4H99" strokeWidth="1" vectorEffect="non-scaling-stroke" className="stroke-current" />
        </svg>
        <svg viewBox="0 0 6 8" aria-hidden="true" className="-ml-2 h-2 w-1.5 shrink-0">
          <path d="M0 0L6 4L0 8" fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" className="stroke-current" />
        </svg>
        <span className="min-w-0 shrink truncate text-right">{ziel}</span>
      </div>
      <svg ref={band} viewBox={`0 0 ${B} 92`} {...ziehen}
           className={`mt-1 w-full ${springen ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
           {...(springen
             ? { role: 'slider', tabIndex: 0, 'aria-valuemin': 0, 'aria-valuemax': 100,
                 'aria-valuenow': Math.round((s / ende) * 100),
                 'aria-label': `Probefahrt: Zug auf dem Weg von ${start} nach ${ziel} verschieben` }
             : { role: 'img', 'aria-label': `Streckenband: der ganze Weg von ${start} nach ${ziel} mit dem Zug` })}>
        <line x1={RAND} x2={B - RAND} y1="46" y2="46" strokeWidth="3"
              className="stroke-sbb-cloud dark:stroke-sbb-iron" />
        <line x1={RAND} x2={zugX} y1="46" y2="46" strokeWidth="3"
              className={`stroke-sbb-charcoal dark:stroke-sbb-white ${weich}`} />
        {/* Start und Ziel */}
        {[RAND, B - RAND].map((x) => (
          <line key={x} x1={x} x2={x} y1="40" y2="52" strokeWidth="2.5"
                className="stroke-sbb-charcoal dark:stroke-sbb-white" />
        ))}
        {/* Seen neben der Strecke: links der Fahrtrichtung über dem Band, rechts darunter */}
        {(fahrweg.seeUfer ?? []).map((u) => (
          <rect key={`see${u.seite}${u.s0}`} x={xBei(u.s0)} y={u.seite === 'links' ? 37 : 52}
                width={Math.max(2, xBei(u.s1) - xBei(u.s0))} height="3" rx="1.5" className="fill-see-band" />
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
          if (o.art === 'sehenswert') {
            // Flächen als Band unter der Strecke, der Rest als kleine Raute
            if (o.sAus !== null) {
              return (
                <rect key={`s${o.kennung}`} x={x} y="58" width={Math.max(2, xBei(o.sAus) - x)} height="3"
                      className="fill-fahrt-sehenswert/60 dark:fill-fahrt-sehenswert-hell/60" />
              )
            }
            return (
              <rect key={`s${o.kennung}`} x={x - 2} y="44" width="4" height="4" transform={`rotate(45 ${x} 46)`}
                    className="fill-fahrt-sehenswert dark:fill-fahrt-sehenswert-hell" />
            )
          }
          if (o.art === 'bruecke' && o.sAus !== null) {
            // Brücken mit Anfang und Ende laut swisstopo als Balken wie Tunnel, in ihrer Farbe
            return (
              <rect key={`b${o.kennung}`} x={x} y="41" width={Math.max(2.5, xBei(o.sAus) - x)} height="10" rx="1.5"
                    className="fill-fahrt-bruecke" />
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
        <g transform={`translate(${zugX - 9} 39)`} className={weich}>
          <rect width="18" height="14" rx="3.5" strokeWidth="1.5"
                className="fill-sbb-red stroke-white dark:stroke-sbb-midnight" />
          <rect x="10" y="3" width="5" height="4.5" rx="1" className="fill-white" />
        </g>
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-sbb-metal dark:text-sbb-storm" aria-hidden="true">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-fahrt-tunnel dark:bg-sbb-storm" />Tunnel</span>
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 16 10" className="h-2.5 w-4">
            <path d="M3 9 Q8 1 13 9" fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-fahrt-bruecke" />
          </svg>
          Brücke
        </span>
        <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-fahrt-bahnhof dark:bg-fahrt-bahnhof-hell" />Bahnhof</span>
        {/* Sehenswertes vor den Seen: Tunnel bis Sehenswertes passen auf eine Zeile (Michael, 2026-09-26) */}
        {objekte.some((o) => o.art === 'sehenswert') && (
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rotate-45 bg-fahrt-sehenswert dark:bg-fahrt-sehenswert-hell" />
            Sehenswertes
          </span>
        )}
        {(fahrweg.seeUfer?.length ?? 0) > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-1 w-4 rounded-full bg-see-band" />
            See links (oben) oder rechts (unten)
          </span>
        )}
      </div>
    </div>
  )
}

/** Der Grund reicht so weit (in Breiten des Ausschnitts, von der Mitte aus) über das Bild
 *  hinaus; der Zug springt neu, bevor er ein Fünftel aus der Mitte ist */
const GRUND_RAND = 0.75
/** Breite des nahen Ausschnitts ohne Tempo, in Grad Breite (etwa 9 km) */
const NAH = 0.08
/** Meter in Grad Breite */
const M_GRAD = 1 / 111_195
/** «Nah» nach Tempo (Michael, 2026-09-30): etwa die Strecke der nächsten Minute, in
 *  Stufen, damit das Bild nicht bei jedem Tempowechsel springt; stehend 250 m */
const NAH_STUFEN_M = [250, 500, 1000, 2000, 4000, 8000]
const NAH_SEKUNDEN = 72
function nahStufe(tempo: number, alt: number | null): number {
  const ziel = tempo * NAH_SEKUNDEN
  // erst wechseln, wenn das Tempo deutlich neben der jetzigen Stufe liegt
  if (alt !== null && ziel < alt * 1.6 && ziel > alt / 1.6) return alt
  return NAH_STUFEN_M.reduce((a, b) => (Math.abs(Math.log(b / ziel)) < Math.abs(Math.log(a / ziel)) ? b : a))
}

/**
 * Die kleine Karte zur Fahrt: grau das Streckennetz, dunkel der Weg vor dem
 * Zug, rot der Standort. «Nah» folgt dem Zug, «Ganzer Weg» zeigt alles.
 */
export function FahrtKarte({ fahrweg, objekte, sJetzt, vollbild, start, ziel, tempo = null }: {
  fahrweg: Fahrweg
  /** Tempo in Metern pro Sekunde, wie es sich anfühlt (Probefahrt mal Zeitraffer); null ohne Standort */
  tempo?: number | null
  /** Namen von Start und Ziel, beschriftet wie auf dem Fahrtblatt (Michael, 2026-09-29) */
  start?: string
  ziel?: string
  objekte: FahrObjekt[]
  sJetzt: number | null
  /** was im Vollbild unter der Karte steht: das Nötigste zum Fahren (Michael, 2026-09-27) */
  vollbild?: React.ReactNode
}) {
  const { linien } = useKarte()
  const seen = useSeen()
  const kartengrund = useKartengrund()
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
  // «Zur Karte» unten links in der Karte (Michael, 2026-09-30: «spart vertikalen Platz»)
  const [zurKarte, setZurKarte] = useState(false)
  const breite = useBreite(flaeche)
  // «Nah»: die Karte folgt dem Zug in Sprüngen, nicht jede halbe Sekunde. So
  // bleibt das Bild ruhig, und die Ebenen müssen nicht ständig neu gezeichnet werden.
  const mitte = useRef<[number, number] | null>(null)
  const setNah = (n: boolean) => { setNahRoh(n); setZoom(1); setVersatz([0, 0]); mitte.current = null }
  const zoomen = (f: number) => setZoom((z) => Math.min(40, Math.max(0.25, z * f)))

  const weg = useMemo(() => fahrweg.punkte.map((p) => ({ xy: lage(p.lat, p.lon), s: p.s })), [fahrweg])
  const ganz = useMemo(() => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const { xy: [x, y] } of weg) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    // so gross wie möglich (Michael, 2026-09-29: «möglichst gross»): wenig Rand für die
    // Beschriftung von Start und Ziel, auch bei kurzen Wegen nur ein kleines Mindestmass
    const w = Math.max((x1 - x0) * 1.2, (y1 - y0) * 1.3 * verh, NAH / 8)
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w }
  }, [weg, verh])

  // «Nah» nach Tempo, nie weiter als «Ganzer Weg» (Michael, 2026-09-30: auf dem kurzen Weg
  // Bern Wankdorf – Bern war «Nah» weiter weg als der ganze Weg)
  const stufe = useRef<number | null>(null)
  if (tempo !== null) stufe.current = nahStufe(tempo, stufe.current)
  const nahW = Math.min(stufe.current !== null ? stufe.current * M_GRAD : NAH, ganz.w)

  const hier = sJetzt !== null ? lageBei(fahrweg, sJetzt) : fahrweg.punkte[0]
  const [hx, hy] = hier ? lage(hier.lat, hier.lon) : [ganz.cx, ganz.cy]
  if (nah) {
    const m = mitte.current
    const w = nahW / zoom
    // neu ausrichten, sobald der Zug das innere Viertel verlässt; so bleibt der
    // rote Punkt immer ganz im Bild
    if (!m || Math.abs(hx - m[0]) > w * 0.2 || Math.abs(hy - m[1]) > (w / verh) * 0.2) mitte.current = [hx, hy]
  }
  const [mx, my] = nah && mitte.current ? mitte.current : [ganz.cx, ganz.cy]
  const grund = nah ? { cx: mx, cy: my, w: nahW } : ganz
  const bx = grund.cx + versatz[0], by = grund.cy + versatz[1], bw = grund.w / zoom
  // gleich bleibend, solange sich der Ausschnitt nicht ändert: die Ebenen zeichnen dann nicht neu
  const box = useMemo(() => ({ cx: bx, cy: by, w: bw }), [bx, by, bw])
  // «Nah»: Das Bild folgt dem Zug stufenlos, nur das Blickfenster verschiebt sich; die
  // Ebenen reichen um box eine ganze Breite weiter und bleiben, bis der Zug das innere
  // Fünftel verlässt (Michael, 2026-09-27: «ruckelt das ganze Kartenbild»)
  const blick = nah && hier ? { cx: hx + versatz[0], cy: hy + versatz[1], w: bw } : box
  const veraendert = zoom !== 1 || versatz[0] !== 0 || versatz[1] !== 0

  function runter(e: React.PointerEvent<HTMLDivElement>) {
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()]
      abstand.current = Math.hypot(a.x - b.x, a.y - b.y)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }
  function bewegt(e: React.PointerEvent<HTMLDivElement>) {
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
  function hoch(e: React.PointerEvent<HTMLDivElement>) {
    zeiger.current.delete(e.pointerId)
    if (zeiger.current.size < 2) abstand.current = 0
  }
  const h = box.w / verh
  const px = box.w / breite
  // Lage der Namen von Start und Ziel: nur neu, wenn sich der Ausschnitt ändert
  const endNamen = useMemo(() => ([[weg[0], start], [weg[weg.length - 1], ziel]] as const)
    .filter((x): x is [typeof weg[number], string] => Boolean(x[0] && x[1]))
    .map(([p, name]) => ({ p, name, l: namensLage(p.xy, name, px, weg, box, h) })), [weg, start, ziel, px, box, h])
  const klassen = vollbildKlassen(voll, 'mt-3')
  const s = sJetzt ?? 0

  const netz = useMemo(() => {
    const raus: Stueck[] = []
    for (const stuecke of linien?.values() ?? []) {
      for (const st of stuecke) {
        if (st.x.some((x, j) => Math.abs(x - box.cx) < box.w && Math.abs(st.y[j] - box.cy) < h)) raus.push(st)
      }
    }
    return raus
  }, [linien, box, h])
  // was sich nur mit dem Ausschnitt ändert, nicht mit jedem Standort
  const ebenen = useMemo(() => (
    <>
      <KartengrundEbene grund={kartengrund} box={box} verh={verh} />
      <FlaechenEbene flaechen={sehenswert.f} box={box} verh={verh} waehlen={setAuswahl} />
      <SeenFlaechen seen={seen} box={box} verh={verh} />
      <SeenNamen seen={seen} box={box} px={px} verh={verh} />
      <FlussNamen grund={kartengrund} box={box} px={px} verh={verh} />
      <SehenswertEbene daten={sehenswert.s} box={box} px={px} verh={verh} waehlen={setAuswahl} />
      {netz.map((st, i) => (
        <path key={i} d={pfad(st.x.map((x, j) => [x, st.y[j]]))} fill="none" strokeWidth={1}
              vectorEffect="non-scaling-stroke" className="stroke-sbb-cloud dark:stroke-sbb-iron" />
      ))}
    </>
  ), [kartengrund, sehenswert.f, sehenswert.s, seen, box, px, verh, netz])
  // der Weg geteilt beim Zug; weg ist nach s geordnet, darum binäre Suche statt Filter
  let lo = 0, hi = weg.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (weg[m].s <= s) lo = m + 1; else hi = m }
  const hinter = weg.slice(0, lo).map((p) => p.xy)
  const vor = weg.slice(lo).map((p) => p.xy)
  if (hier && sJetzt !== null) { hinter.push([hx, hy]); vor.unshift([hx, hy]) }
  // alle Objekte des Wegs; durchfahrene bleiben stehen, in voller Farbe
  const zeichen = objekte
  // hängt nicht vom Standort ab: einmal rechnen, nicht bei jedem Bild
  const zeichenEbene = useMemo(() => (
    <>
      {/* Tunnel und Brücken, deren Ende die Daten hergeben, als dicker Strich (Michael,
          2026-09-26; Brücken 2026-09-29, in ihrer Farbe) */}
      {zeichen.filter((o) => (o.art === 'tunnel' || o.art === 'bruecke') && o.sAus !== null).map((o) => {
        const stueck = weg.filter((p) => p.s > o.s && p.s < o.sAus!).map((p) => p.xy)
        const [a, b] = [lageBei(fahrweg, o.s), lageBei(fahrweg, o.sAus!)]
        const d = pfad([lage(a.lat, a.lon), ...stueck, lage(b.lat, b.lon)])
        return (
          <path key={`tz${o.kennung}`} d={d} fill="none" strokeWidth={8} strokeLinecap="round"
                strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                className={o.art === 'bruecke' ? 'stroke-fahrt-bruecke' : 'stroke-fahrt-tunnel dark:stroke-sbb-storm'} />
        )
      })}
      {zeichen.map((o) => {
        // Bahnhöfe am Betriebspunkt, nicht am Anfang ihrer Perrons; Start und Ziel zeichnet die Karte grösser
        if (o.art === 'bahnhof' && ((o.sOrt ?? o.s) < 1 || (o.sOrt ?? o.s) > wegEnde(fahrweg) - 1)) return null
        const l = lageBei(fahrweg, o.art === 'bahnhof' ? o.sOrt ?? o.s : o.s)
        const [x, y] = lage(l.lat, l.lon)
        return (
          <circle key={`${o.art}${o.kennung}`} cx={x} cy={y} r={(o.art === 'bahnhof' ? 5 : 2.5) * px}
                  strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                  className={o.art === 'tunnel' ? 'fill-fahrt-tunnel stroke-white dark:fill-sbb-storm dark:stroke-sbb-midnight'
                    : o.art === 'bruecke' ? 'fill-fahrt-bruecke stroke-white dark:stroke-sbb-midnight'
                    : o.art === 'sehenswert' ? 'fill-fahrt-sehenswert stroke-white dark:fill-fahrt-sehenswert-hell dark:stroke-sbb-midnight'
                    : 'fill-fahrt-bahnhof stroke-white dark:fill-fahrt-bahnhof-hell dark:stroke-sbb-midnight'} />
        )
      })}
    </>
  ), [zeichen, weg, fahrweg, px])

  return (
    <figure className={klassen.figur}>
      {/* eine Zeile für alle Knöpfe, damit die Karte kompakt oben bleibt */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex overflow-hidden rounded-lg border border-sbb-cloud dark:border-sbb-iron" role="group" aria-label="Ausschnitt">
          {([[true, 'Nah'], [false, 'Ganzer Weg']] as const).map(([n, t]) => (
            <button key={t} type="button" aria-pressed={nah === n} onClick={() => setNah(n)}
                    className={`whitespace-nowrap px-2.5 py-1.5 font-medium ${nah === n
                      ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                      : 'bg-white dark:bg-sbb-midnight'}`}>
              {t}
            </button>
          ))}
          {/* im selben Stil daneben (Michael, 2026-09-29) */}
          {veraendert && (
            <button type="button" onClick={() => { setZoom(1); setVersatz([0, 0]); mitte.current = null }}
                    className="whitespace-nowrap border-l border-sbb-cloud bg-white px-2.5 py-1.5 font-medium
                               dark:border-sbb-iron dark:bg-sbb-midnight">
              {nah ? 'Zum Zug' : 'Alles'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
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
      {/* Zwei Ebenen (Michael, 2026-09-27: auf dem Tablet «ruckelt es», Teile des Bildes
          verschoben, der rote Punkt halb, Flächen und Kultur blinken): Der Grund mit Höhen,
          Seen, Flächen und Netz wird nur neu gezeichnet, wenn der Ausschnitt springt, und
          dazwischen als Ganzes verschoben, was die Grafik des Geräts ohne neues Zeichnen
          kann. Darüber, durchsichtig und leicht, der Weg, die Zeichen und der Zug. */}
      <div onPointerDown={runter} onPointerMove={bewegt} onPointerUp={hoch} onPointerCancel={hoch}
           style={{ touchAction: zoom > 1 ? 'none' : 'pan-y' }}
           className={`${klassen.svg} relative overflow-hidden border border-sbb-cloud bg-karte
                       dark:border-sbb-iron dark:bg-sbb-midnight`}>
        <svg viewBox={[box.cx - box.w * GRUND_RAND, box.cy - h * GRUND_RAND, box.w * 2 * GRUND_RAND, h * 2 * GRUND_RAND].join(' ')}
             preserveAspectRatio="xMidYMid meet" aria-hidden="true"
             className="absolute max-w-none"
             style={{
               left: `${(0.5 - GRUND_RAND) * 100}%`, top: `${(0.5 - GRUND_RAND) * 100}%`,
               width: `${GRUND_RAND * 200}%`, height: `${GRUND_RAND * 200}%`,
               transform: `translate3d(${((box.cx - blick.cx) / px).toFixed(2)}px, ${((box.cy - blick.cy) / px).toFixed(2)}px, 0)`,
               willChange: 'transform',
             }}>
          {ebenen}
        </svg>
        <svg ref={flaeche} viewBox={[blick.cx - blick.w / 2, blick.cy - h / 2, blick.w, h].join(' ')} role="img"
             aria-label="Karte mit dem Weg und dem Standort" preserveAspectRatio="xMidYMid meet"
             className="pointer-events-none absolute inset-0 size-full">
          <path d={pfad(hinter)} fill="none" strokeWidth={3} vectorEffect="non-scaling-stroke"
                strokeLinejoin="round" className="stroke-sbb-storm dark:stroke-sbb-metal" />
          <path d={pfad(vor)} fill="none" strokeWidth={3.5} vectorEffect="non-scaling-stroke"
                strokeLinejoin="round" className="stroke-sbb-charcoal dark:stroke-sbb-white" />
          {zeichenEbene}
          {/* Start und Ziel: grössere Bahnhofspunkte, der Name fett daneben, darüber oder
              darunter, wo er die Strecke nicht verdeckt und im Bild bleibt (Michael, 2026-09-30) */}
          {endNamen.map(({ p, name, l }, i) => {
            return (
              <g key={i}>
                <circle cx={p.xy[0]} cy={p.xy[1]} r={7 * px} strokeWidth={2} vectorEffect="non-scaling-stroke"
                        className="fill-fahrt-bahnhof stroke-white dark:fill-fahrt-bahnhof-hell dark:stroke-sbb-midnight" />
                <text x={l.x} y={l.y} textAnchor={l.anker} fontSize={14 * px} fontWeight={700}
                      strokeWidth={3.5 * px} paintOrder="stroke" strokeLinejoin="round"
                      className="fill-sbb-black stroke-white dark:fill-sbb-white dark:stroke-sbb-midnight">
                  {name}
                </text>
              </g>
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
        {!voll && (
          <button type="button" aria-expanded={zurKarte} onClick={() => setZurKarte(!zurKarte)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute bottom-1 left-1 rounded-md bg-white/85 px-1.5 py-0.5 text-[11px] text-sbb-metal
                             underline underline-offset-2 dark:bg-sbb-midnight/85 dark:text-sbb-storm">
            Zur Karte
          </button>
        )}
      </div>
      {voll && vollbild && <div className="shrink-0">{vollbild}</div>}
      {!voll && <AuswahlZeile auswahl={auswahl} schliessen={() => setAuswahl(null)} />}
      {!voll && sehenswert.s && <SehenswertLegende gebieteMitBoden />}
      <figcaption className={`mt-1 text-xs text-sbb-metal dark:text-sbb-storm ${voll ? 'hidden' : ''}`}>
        {!linien && 'Das Netz wird geladen … '}
        {zurKarte && (
          <p className="mt-1">
        Gezeichnet aus dem Streckennetz der SBB (linienkilometrierung), Linien anderer Bahnen aus
        dem Schienennetz des BAV. Auf Strecken anderer Bahnen ist der Weg gerade von Bahnhof zu
        Bahnhof gezogen. Rot der geschätzte Standort.
        {seen && ' Seen: Swiss Map Vector 1000, swisstopo; kleine Seen fehlen in diesem Massstab. Flüsse: swissTLMRegio, swisstopo.'}
        {kartengrund && ' Höhenstufen ab 1000, 2000 und 3000 m: swissALTIRegio, swisstopo, vereinfacht; Wald und Siedlung: swissTLMRegio, swisstopo, vereinfacht, kleine Flächen fehlen; Landes- und Kantonsgrenzen: BFS.'}
        {sehenswert.s && ' Gipfel: swisstopo; Kulturgüter von nationaler Bedeutung: BABS; Seilbahnen: BAV; Gebiete von nationaler Bedeutung (BLN, Pärke, Moorlandschaften): BAFU. Kulturgüter erscheinen erst näher; ein Tipp auf ein Zeichen zeigt, was es ist, ein Tipp in der Legende blendet eine Kategorie aus oder ein.'}
        {' Zoomen mit zwei Fingern oder mit «+» und «−»; näher gezoomt lässt sich die Karte verschieben.'}
          </p>
        )}
      </figcaption>
    </figure>
  )
}

/** Schneidet die Strecke von a nach b das Rechteck? (Liang-Barsky) */
function schneidet(a: [number, number], b: [number, number], r: { x0: number; y0: number; x1: number; y1: number }) {
  let t0 = 0, t1 = 1
  const dx = b[0] - a[0], dy = b[1] - a[1]
  for (const [p, q] of [[-dx, a[0] - r.x0], [dx, r.x1 - a[0]], [-dy, a[1] - r.y0], [dy, r.y1 - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue }
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
  }
  return true
}

/**
 * Wo der Name von Start oder Ziel steht: rechts, links, darüber, darunter oder
 * schräg daneben, als Erstes, wo er die Strecke nicht schneidet und ganz im
 * Bild bleibt; sonst dort, wo er am wenigsten von ihr verdeckt.
 */
function namensLage([x, y]: [number, number], name: string, px: number,
                    weg: Array<{ xy: [number, number] }>, blick: { cx: number; cy: number; w: number }, h: number) {
  const fs = 14 * px, b = name.length * fs * 0.6, abst = 11 * px
  const kandidaten: Array<{ x: number; y: number; anker: 'start' | 'end' | 'middle'; box: { x0: number; y0: number; x1: number; y1: number } }> = []
  const setzen = (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
    const ax = x + dx * abst, ay = y + dy * abst
    const anker = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle'
    const x0 = anker === 'start' ? ax : anker === 'end' ? ax - b : ax - b / 2
    // Grundlinie: darunter eine Zeile tiefer, daneben mittig
    const yb = dy > 0 ? ay + fs * 0.8 : dy < 0 ? ay : ay + fs * 0.35
    kandidaten.push({ x: ax, y: yb, anker, box: { x0, x1: x0 + b, y0: yb - fs * 0.8, y1: yb + fs * 0.2 } })
  }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]] as const) setzen(dx, dy)
  const [vx0, vx1, vy0, vy1] = [blick.cx - blick.w / 2, blick.cx + blick.w / 2, blick.cy - h / 2, blick.cy + h / 2]
  const weit = b * 2 + abst
  const fern = (q: [number, number]) => Math.abs(q[0] - x) > weit || Math.abs(q[1] - y) > weit
  let beste = kandidaten[0], wenigste = Infinity
  for (const k of kandidaten) {
    const drin = k.box.x0 >= vx0 && k.box.x1 <= vx1 && k.box.y0 >= vy0 && k.box.y1 <= vy1
    let treffer = 0
    for (let i = 1; i < weg.length; i++) {
      if (fern(weg[i - 1].xy) && fern(weg[i].xy)) continue
      if (schneidet(weg[i - 1].xy, weg[i].xy, k.box)) treffer++
    }
    const kosten = treffer + (drin ? 0 : 1000)
    if (kosten === 0) return k
    if (kosten < wenigste) { wenigste = kosten; beste = k }
  }
  return beste
}
