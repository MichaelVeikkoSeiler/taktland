import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { karteLaden } from '../daten'
import type { KartenDaten } from '../typen'
import { SeenFlaechen, SeenNamen, useSeen } from './Seen'
import { type Auswahl, AuswahlZeile, FlaechenEbene, SehenswertEbene, SehenswertLegende, useSehenswert, useVersteckt } from './Sehenswert'

/** Verhältnis Meter je Grad Länge zu Breite in der Schweiz: x = Länge mal das */
export const LAENGE_ZU_BREITE = 73_000 / 111_200
/** Die Karte ist so viel breiter als hoch */
export const SEITENVERHAELTNIS = 1.6
/** Engster und weitester Ausschnitt beim Zoomen, in Grad Breite */
const ENG = 0.004
const WEIT = 4

export interface Stueck { km: number[]; x: number[]; y: number[] }

/** Ausschnitt der Karte: Mitte und Breite */
export interface Box { cx: number; cy: number; w: number }

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

/** Lage in der Zeichnung: x aus der Länge, y aus der Breite (nach Norden negativ) */
export function lage(lat: number, lon: number): [number, number] {
  return [lon * LAENGE_ZU_BREITE, -lat]
}

/** Ausschnitt um alle Punkte dieser Stücke, mit Rand und im Seitenverhältnis */
export function boxUm(stuecke: Stueck[], mindestens: number): Box {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const s of stuecke) {
    for (let i = 0; i < s.x.length; i++) {
      x0 = Math.min(x0, s.x[i]); x1 = Math.max(x1, s.x[i])
      y0 = Math.min(y0, s.y[i]); y1 = Math.max(y1, s.y[i])
    }
  }
  if (!Number.isFinite(x0)) return { cx: 8 * LAENGE_ZU_BREITE, cy: -46.8, w: WEIT }
  const w = Math.max((x1 - x0) * 1.15, (y1 - y0) * 1.15 * SEITENVERHAELTNIS, mindestens)
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w }
}

/**
 * Karte als Vollbild (Michael, 2026-09-26: «Karte als Vollbild anzeigen lassen
 * können wäre cool»). Kein Vollbild des Browsers, das auf dem iPhone fehlt,
 * sondern eine Fläche über der ganzen Seite. Das Seitenverhältnis folgt dann
 * dem Bildschirm; Escape schliesst.
 */
export function useVollbild(svg: React.RefObject<SVGSVGElement | null>) {
  const [voll, setVoll] = useState(false)
  const [verh, setVerh] = useState(SEITENVERHAELTNIS)
  useEffect(() => {
    if (!voll) { setVerh(SEITENVERHAELTNIS); return }
    const el = svg.current
    const messen = () => {
      const r = el?.getBoundingClientRect()
      if (r && r.width && r.height) setVerh(r.width / r.height)
    }
    messen()
    const beobachter = new ResizeObserver(messen)
    if (el) beobachter.observe(el)
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setVoll(false) }
    document.addEventListener('keydown', taste)
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      beobachter.disconnect()
      document.removeEventListener('keydown', taste)
      document.body.style.overflow = vorher
    }
  }, [voll, svg])
  return { voll, setVoll, verh }
}

/** Klassen für die Figur und die Zeichnung, normal oder als Vollbild */
export const vollbildKlassen = (voll: boolean, normal: string) => voll
  ? { figur: 'fixed inset-0 z-[80] m-0 flex flex-col bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-sbb-midnight',
      svg: 'mt-2 min-h-0 w-full flex-1' }
  : { figur: normal, svg: 'mt-1 aspect-[1.6] w-full' }

export function VollbildKnopf({ voll, umschalten }: { voll: boolean; umschalten: () => void }) {
  return (
    <button type="button" onClick={umschalten} aria-label={voll ? 'Vollbild schliessen' : 'Karte als Vollbild'}
            title={voll ? 'Vollbild schliessen' : 'Vollbild'}
            className="flex size-8 items-center justify-center rounded-lg border border-sbb-cloud bg-white
                       text-sbb-black hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight
                       dark:text-sbb-white dark:hover:border-sbb-white">
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke="currentColor"
           strokeWidth="1.6" strokeLinecap="round">
        {voll
          ? <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
          : <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />}
      </svg>
    </button>
  )
}

/** Lädt das Streckennetz einmal und hält es im Speicher */
export function useKarte() {
  const [daten, setDaten] = useState<KartenDaten | null>(null)
  const [fehler, setFehler] = useState(false)
  const [linien, setLinien] = useState<Map<number, Stueck[]> | null>(null)
  useEffect(() => {
    let abgebrochen = false
    karteLaden()
      .then((k) => { if (!abgebrochen) { setDaten(k); setLinien(lesen(k)) } })
      .catch(() => { if (!abgebrochen) setFehler(true) })
    return () => { abgebrochen = true }
  }, [])
  return { daten, linien, fehler }
}

/** Platzhalter in der Grösse der Karte, solange das Netz lädt */
export function KartenPlatz() {
  return <div className="mt-4 aspect-[1.6] w-full bg-sbb-milk dark:bg-sbb-charcoal" aria-hidden="true" />
}

interface Beschriftung { x: number; y: number; name: string; uic?: number }

/**
 * Der gemeinsame Rahmen aller Karten: grau das Streckennetz, dunkel die
 * hervorgehobenen Linien, dazu Bahnhöfe mit Namen. Zoomen mit zwei Fingern,
 * mit Strg und dem Mausrad oder mit den Knöpfen; Ziehen verschiebt, sobald
 * die Karte näher steht als am Anfang. Was darauf liegt (Tunnel, Brücken,
 * Standort), zeichnet die aufrufende Seite über «zeichnen».
 */
export function Netzkarte({
  daten, linien, start, presets = [], hervor, punkte = [], zeichnen,
  linieOeffnen, seiten, bahnhofOeffnen, beschriftung, titel,
}: {
  daten: KartenDaten
  linien: Map<number, Stueck[]>
  start: Box
  presets?: Array<{ text: string; box: Box }>
  hervor?: Set<number>
  punkte?: Beschriftung[]
  zeichnen?: (px: number, box: Box) => ReactNode
  linieOeffnen?: (nr: number) => void
  /** nur diese Linien lassen sich antippen; ohne Angabe alle */
  seiten?: Set<number>
  bahnhofOeffnen?: (uic: number) => void
  beschriftung: ReactNode
  titel: string
}) {
  const [box, setBox] = useState<Box>(start)
  const seen = useSeen()
  const sehenswert = useSehenswert()
  const versteckt = useVersteckt()
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const svg = useRef<SVGSVGElement | null>(null)
  const zeiger = useRef(new Map<number, { x: number; y: number }>())
  const zieht = useRef<{ art: 'nichts' | 'karte'; x: number; y: number; d: number } | null>(null)
  const { voll, setVoll, verh } = useVollbild(svg)
  // Hat man selbst gezoomt oder verschoben, bleibt der Ausschnitt, auch wenn
  // der Standort sich ein wenig ändert (Michael, 2026-09-26: «springt dauernd
  // auf Default-Ausschnitt zurück»). Ein neuer Ort (andere Linie, anderer
  // Bahnhof, ein grosser Sprung) setzt ihn neu.
  const [eigen, setEigen] = useState(false)
  const letzterStart = useRef(start)
  useEffect(() => {
    const alt = letzterStart.current
    letzterStart.current = start
    const weit = Math.hypot(start.cx - alt.cx, start.cy - alt.cy) > start.w * 0.5 || start.w !== alt.w
    if (eigen && !weit) return
    setBox(start)
    setEigen(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.cx, start.cy, start.w])

  const zoomen = useCallback((faktor: number, mitteX?: number, mitteY?: number) => {
    setEigen(true)
    setBox((alt) => {
      const w = Math.min(WEIT, Math.max(ENG, alt.w / faktor))
      if (mitteX === undefined || mitteY === undefined) return { ...alt, w }
      // der Punkt unter dem Finger bleibt stehen
      const anteil = w / alt.w
      return { cx: mitteX + (alt.cx - mitteX) * anteil, cy: mitteY + (alt.cy - mitteY) * anteil, w }
    })
  }, [])

  /** Bildpunkte der Karte in Einheiten der Zeichnung */
  const proPixel = useCallback(() => {
    const r = svg.current?.getBoundingClientRect()
    return r && r.width ? box.w / r.width : box.w / 350
  }, [box.w])

  const zuKarte = useCallback((klientX: number, klientY: number) => {
    const r = svg.current?.getBoundingClientRect()
    if (!r) return null
    const e = proPixel()
    return { x: box.cx + (klientX - r.left - r.width / 2) * e, y: box.cy + (klientY - r.top - r.height / 2) * e }
  }, [box.cx, box.cy, proPixel])

  // Mausrad nur mit Strg oder Befehlstaste: sonst soll die Seite rollen
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const rad = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const p = zuKarte(e.clientX, e.clientY)
      zoomen(Math.exp(-e.deltaY * 0.002), p?.x, p?.y)
    }
    el.addEventListener('wheel', rad, { passive: false })
    return () => el.removeEventListener('wheel', rad)
  }, [zoomen, zuKarte])

  function runter(e: React.PointerEvent<SVGSVGElement>) {
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zeiger.current.size === 1) zieht.current = { art: 'nichts', x: e.clientX, y: e.clientY, d: 0 }
    if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()]
      zieht.current = { art: 'karte', x: 0, y: 0, d: Math.hypot(a.x - b.x, a.y - b.y) }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  function bewegt(e: React.PointerEvent<SVGSVGElement>) {
    if (!zeiger.current.has(e.pointerId)) return
    const vorher = zeiger.current.get(e.pointerId)!
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const z = zieht.current
    if (!z) return
    if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const mitte = zuKarte((a.x + b.x) / 2, (a.y + b.y) / 2)
      if (z.d) zoomen(d / z.d, mitte?.x, mitte?.y)
      z.d = d
      return
    }
    const dx = e.clientX - vorher.x
    const dy = e.clientY - vorher.y
    if (z.art === 'nichts') {
      // senkrecht wischen soll die Seite rollen, solange die Karte nicht näher steht
      const naeher = box.w < start.w * 0.95
      if (!naeher && Math.abs(e.clientY - z.y) > Math.abs(e.clientX - z.x)) {
        zeiger.current.delete(e.pointerId)
        zieht.current = null
        return
      }
      if (Math.hypot(e.clientX - z.x, e.clientY - z.y) < 6) return
      z.art = 'karte'
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    const einheit = proPixel()
    setEigen(true)
    setBox((alt) => ({ ...alt, cx: alt.cx - dx * einheit, cy: alt.cy - dy * einheit }))
  }

  function hoch(e: React.PointerEvent<SVGSVGElement>) {
    zeiger.current.delete(e.pointerId)
    if (zeiger.current.size === 0) zieht.current = null
  }

  const h = box.w / verh
  const klassen = vollbildKlassen(voll, 'mt-4')
  const ansicht = [box.cx - box.w / 2, box.cy - h / 2, box.w, h]
  const px = box.w / 350
  const drin = (x: number, y: number) =>
    Math.abs(x - box.cx) < box.w * 0.55 && Math.abs(y - box.cy) < h * 0.55

  // Stücke im Bild, damit nicht das ganze Netz gezeichnet wird
  const sichtbar: Array<{ nr: number; s: Stueck; i: number }> = []
  for (const [nr, stuecke] of linien) {
    stuecke.forEach((s, i) => {
      if (s.x.some((x, j) => Math.abs(x - box.cx) < box.w && Math.abs(s.y[j] - box.cy) < h)) {
        sichtbar.push({ nr, s, i })
      }
    })
  }

  // Bahnhöfe: je näher die Karte, desto mehr Namen, und nur ohne Überdeckung
  const hoechstens = box.w > 1 ? 4 : box.w > 0.3 ? 8 : 16
  const beschriftet: Array<Beschriftung & { anker: 'start' | 'end' }> = []
  const belegt: Array<[number, number, number, number]> = []
  // «Orte» aus der Legende blendet auch die Namen der Bahnhöfe aus (Michael, 2026-09-26)
  for (const p of versteckt.has('orte') ? [] : punkte) {
    if (beschriftet.length >= hoechstens) break
    if (!drin(p.x, p.y)) continue
    const breite = p.name.length * 6.2 * px
    const rechts = p.x + 8 * px + breite < box.cx + box.w / 2 - 3 * px
    const x0 = rechts ? p.x + 8 * px : p.x - 8 * px - breite
    if (x0 < box.cx - box.w / 2 + 3 * px) continue
    const feld: [number, number, number, number] = [x0, p.y - 6 * px, x0 + breite, p.y + 6 * px]
    if (belegt.some((f) => f[0] < feld[2] && feld[0] < f[2] && f[1] < feld[3] && feld[1] < f[3])) continue
    belegt.push(feld)
    beschriftet.push({ ...p, anker: rechts ? 'start' : 'end' })
  }

  const orte = versteckt.has('orte') ? [] : daten.orte.map((o) => ({ ...o, x: o.lage[1] * LAENGE_ZU_BREITE, y: -o.lage[0] }))
    .filter((o) => drin(o.x, o.y))
    .filter((o) => !punkte.some((p) => p.name === o.name && drin(p.x, p.y)))

  return (
    <figure className={klassen.figur}>
      <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
        {eigen && (
          <button type="button" onClick={() => { setBox(start); setEigen(false) }}
                  className="text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                             dark:text-sbb-storm dark:hover:text-sbb-white">
            Zurück
          </button>
        )}
        {presets.map((p) => (
          <button key={p.text} type="button" onClick={() => { setBox(p.box); setEigen(true) }}
                  className="text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                             dark:text-sbb-storm dark:hover:text-sbb-white">
            {p.text}
          </button>
        ))}
        <span className="flex gap-1">
          {([['−', 1 / 1.6], ['+', 1.6]] as const).map(([zeichen, f]) => (
            <button key={zeichen} type="button" onClick={() => zoomen(f)}
                    aria-label={zeichen === '+' ? 'Näher heran' : 'Weiter weg'}
                    className="flex size-8 items-center justify-center rounded-lg border border-sbb-cloud
                               bg-white text-base leading-none text-sbb-black hover:border-sbb-black
                               dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white
                               dark:hover:border-sbb-white">
              {zeichen}
            </button>
          ))}
          <VollbildKnopf voll={voll} umschalten={() => setVoll(!voll)} />
        </span>
      </div>
      <svg ref={svg} viewBox={ansicht.join(' ')} role="img" preserveAspectRatio="xMidYMid meet"
           aria-label={titel} onPointerDown={runter} onPointerMove={bewegt} onPointerUp={hoch}
           onPointerCancel={hoch} onDoubleClick={(e) => {
             const p = zuKarte(e.clientX, e.clientY)
             zoomen(1.8, p?.x, p?.y)
           }}
           className={`${klassen.svg} touch-none border border-sbb-cloud bg-white
                      dark:border-sbb-iron dark:bg-sbb-midnight`}>
        <FlaechenEbene flaechen={sehenswert.f} box={box} verh={verh} waehlen={setAuswahl} />
        <SeenFlaechen seen={seen} box={box} verh={verh} />
        {sichtbar.map(({ nr, s, i }) => (
          <path key={`${nr}-${i}`} d={pfad(s.x.map((x, j) => [x, s.y[j]]))} fill="none"
                className={hervor?.has(nr)
                  ? 'stroke-sbb-charcoal dark:stroke-sbb-white' : 'stroke-sbb-cloud dark:stroke-sbb-iron'}
                strokeWidth={hervor?.has(nr) ? 2.5 : 1} vectorEffect="non-scaling-stroke"
                strokeLinejoin="round" />
        ))}
        {linieOeffnen && sichtbar.filter(({ nr }) => !seiten || seiten.has(nr)).map(({ nr, s, i }) => (
          <path key={`k${nr}-${i}`} d={pfad(s.x.map((x, j) => [x, s.y[j]]))} fill="none"
                stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke"
                className="cursor-pointer" onClick={() => linieOeffnen(nr)}>
            <title>Linie {nr}</title>
          </path>
        ))}
        {orte.map((o) => (
          <g key={o.name} className="fill-sbb-metal dark:fill-sbb-storm">
            <circle cx={o.x} cy={o.y} r={2 * px} />
            <text x={o.x + (o.x > box.cx ? -4 : 4) * px} y={o.y + 3.5 * px} fontSize={10 * px}
                  textAnchor={o.x > box.cx ? 'end' : 'start'}>{o.name}</text>
          </g>
        ))}
        <SeenNamen seen={seen} box={box} px={px} belegt={belegt} verh={verh} />
        <SehenswertEbene daten={sehenswert.s} box={box} px={px} verh={verh} belegt={belegt} waehlen={setAuswahl} />
        {zeichnen?.(px, box)}
        {/* Bahnhöfe so gross wie der rote Standortpunkt (Michael, 2026-09-26) */}
        {punkte.filter((p) => drin(p.x, p.y)).map((p) => (
          <circle key={`b${p.name}${p.x}`} cx={p.x} cy={p.y} r={5 * px} strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  className="fill-white stroke-sbb-charcoal dark:fill-sbb-midnight dark:stroke-sbb-white" />
        ))}
        {bahnhofOeffnen && punkte.filter((p) => p.uic !== undefined && drin(p.x, p.y)).map((p) => (
          <circle key={`o${p.uic}`} cx={p.x} cy={p.y} r={9 * px} fill="transparent"
                  className="cursor-pointer" onClick={() => bahnhofOeffnen(p.uic as number)}>
            <title>{p.name}</title>
          </circle>
        ))}
        {beschriftet.map((p) => (
          <text key={`t${p.name}`} x={p.x + (p.anker === 'start' ? 8 : -8) * px} y={p.y + 3.5 * px}
                fontSize={10.5 * px} fontWeight="bold" textAnchor={p.anker}
                className="fill-sbb-black stroke-white dark:fill-sbb-white dark:stroke-sbb-midnight"
                strokeWidth={3} paintOrder="stroke" vectorEffect="non-scaling-stroke">{p.name}</text>
        ))}
      </svg>
      <AuswahlZeile auswahl={auswahl} schliessen={() => setAuswahl(null)} />
      <SehenswertLegende orte />
      {/* im Vollbild nur die Karte; die Hinweise bleiben auf der Seite */}
      {!voll && (
        <figcaption className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
          {beschriftung}{' '}
          {seen && 'Seen: Swiss Map Vector 1000, swisstopo; kleine Seen fehlen in diesem Massstab. '}
          {sehenswert.s && 'Gipfel: swisstopo; Kulturgüter von nationaler Bedeutung: BABS; Seilbahnen: BAV; Gebiete von nationaler Bedeutung (BLN, Pärke, Moorlandschaften): BAFU. Kulturgüter erscheinen erst näher. Ein Tipp auf ein Zeichen zeigt, was es ist; ein Tipp in der Legende blendet eine Kategorie aus oder ein. '}
          Zoomen mit zwei Fingern, mit «+» und «−» oder mit Strg und dem Mausrad; Ziehen verschiebt
          die Karte, sobald sie näher steht.
        </figcaption>
      )}
    </figure>
  )
}
