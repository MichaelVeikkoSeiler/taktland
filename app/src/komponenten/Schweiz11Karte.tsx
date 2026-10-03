import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { kartenlinienLaden } from '../daten'
import type { IndexEintrag } from '../typen'
import { abstandM, distanzText, gebietRinge, type Hilfe, imGebiet, orteLaden, type Pool, type SpielObjekt, verraet } from '../schweiz11'
import { type Box, LAENGE_ZU_BREITE, lage, pfad, useKarte, zwischen } from './Netzkarte'
import { punkteLesen, useBoden, useKartengrund } from './Kartengrund'
import { SeenFlaechen, useSeen } from './Seen'
import { imBild, kachelnImBild, kachelPfad, type Stueck, stueckeln } from '../kacheln'

/** Schmaler darf der Ausschnitt nicht werden: etwa 200 m */
const ENGSTE = 0.003
/** Breite der Auflösung mindestens, in Kartenmass: etwa 45 km (1 = 1 Breitengrad, 111 km) */
const AUFLOESUNG_MIN_BREITE = 0.4
/** Mehr bewegt gilt als Verschieben, nicht als Tipp */
const TIPP_PX = 8

/** Grund der Geo-Karte, immer hell wie die Karte selbst: Höhenstufen, Siedlung, Wald */
const GRUND = { hoehen: ['#ecebe0', '#e2e0d3', '#d6d3c5'], siedlung: 'rgb(140 128 118 / 0.3)', wald: 'rgb(110 160 85 / 0.24)' }

/** feinere Kantonsgrenzen und Bahnlinien (data/kartenlinien.json), einmal geladen */
let linienVorrat: { kantone: Stueck[]; bahn: Stueck[] } | null = null
let linienLaden: Promise<void> | null = null
function useKartenlinien() {
  const [l, setL] = useState(linienVorrat)
  useEffect(() => {
    if (linienVorrat) return
    let ab = false
    linienLaden ??= kartenlinienLaden().then((d) => {
      const stuecke = (z: typeof d.bahnlinien) => z.flatMap((r) => stueckeln(punkteLesen(r), (q) => pfad(q as Array<[number, number]>)))
      linienVorrat = { kantone: stuecke(d.kantonsgrenzen), bahn: stuecke(d.bahnlinien) }
    })
    linienLaden.then(() => { if (!ab) setL(linienVorrat) }).catch(() => { linienLaden = null })
    return () => { ab = true }
  }, [])
  return l
}

/**
 * Körnung über der ganzen Karte (Michael, 2026-10-03: «eine grundsätzliche Körnung», dann «noch stärker»):
 * ein kleines Rauschen, einmal gerechnet und gekachelt, fest im Bild, nicht auf der Karte
 */
let koernungUrl: string | null = null
function koernung(): string | null {
  if (koernungUrl !== null) return koernungUrl
  try {
    const n = 160, c = document.createElement('canvas')
    c.width = c.height = n
    const ctx = c.getContext('2d')
    if (!ctx) return (koernungUrl = '')
    const bild = ctx.createImageData(n, n)
    let z = 20261003
    for (let i = 0; i < n * n; i++) {
      z = (z * 1103515245 + 12345) & 0x7fffffff
      const v = 70 + (z >> 16) % 150
      bild.data.set([v, v, v, 64], i * 4)
    }
    ctx.putImageData(bild, 0, 0)
    koernungUrl = c.toDataURL('image/png')
  } catch { koernungUrl = '' }
  return koernungUrl
}

export interface KartenPin { la: number; lo: number; name?: string; eigen?: boolean }

/**
 * Die Karte für «Geo»: frei zoombar und verschiebbar, ein Tipp setzt den Pin,
 * Ziehen am Pin verschiebt ihn. Im Grund nur das Spielgebiet hell und alles andere
 * grau; die Hilfen kommen dazu, wenn sie eingeschaltet sind. Beschriftungen, die das
 * Ziel verraten, fehlen (verraet in schweiz11.ts). In der Auflösung (aufloesung) sind
 * Pins fest, dazu das Ziel, seine Linie und die Verbindung zum eigenen Pin.
 */
export function Schweiz11Karte({ pool, gebiet, hilfen, ziel, index, pin, setzen, ausserhalb, aufloesung, pins = [],
  klasse = '' }: {
  pool: Pool
  gebiet: string
  hilfen: Set<Hilfe>
  ziel: SpielObjekt
  index: IndexEintrag[]
  pin: KartenPin | null
  setzen?: (p: KartenPin) => void
  ausserhalb?: () => void
  aufloesung?: boolean
  /** in der Auflösung: die Pins aller Spieler */
  pins?: KartenPin[]
  klasse?: string
}) {
  const ringe = useMemo(() => gebietRinge(pool, gebiet), [pool, gebiet])
  const start = useMemo<Box>(() => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const r of ringe) for (const [x, y] of r.xy) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: (x1 - x0) * 1.08 }
  }, [ringe])
  const [box, setBox] = useState<Box>(start)
  const huelle = useRef<HTMLDivElement | null>(null)
  const svg = useRef<SVGSVGElement | null>(null)
  const [mass, setMass] = useState({ b: 360, h: 360 })
  useEffect(() => {
    const el = huelle.current
    if (!el) return
    const ro = new ResizeObserver(() => setMass({ b: el.clientWidth || 360, h: el.clientHeight || 360 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // der ganze Spielbereich passt ins Bild, auch auf hohen, schmalen Bildschirmen
  const verh = mass.b / mass.h
  const breiteStart = useMemo(() => {
    let [y0, y1] = [Infinity, -Infinity]
    for (const r of ringe) for (const [, y] of r.xy) { y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    return Math.max(start.w, (y1 - y0) * 1.08 * verh)
  }, [ringe, start.w, verh])
  // neues Gebiet oder neue Grösse der Karte: wieder das ganze Spielgebiet
  // in der Auflösung: Ziel und alle Pins im Bild, mit Rand; mindestens etwa 45 km breit (im Kanton
  // höchstens das ganze Gebiet), sonst sieht man nur eine Fläche (Michael, 2026-10-03)
  const fokus = useMemo<Box | null>(() => {
    if (!aufloesung) return null
    const pts = [lage(ziel.la, ziel.lo), ...pins.map((q) => lage(q.la, q.lo))]
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const w = Math.min(breiteStart, Math.max(AUFLOESUNG_MIN_BREITE, (x1 - x0) * 1.5, (y1 - y0) * 1.5 * verh))
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w }
  }, [aufloesung, ziel, pins, breiteStart, verh])
  useEffect(() => setBox(fokus ?? { ...start, w: breiteStart }), [start, breiteStart, fokus])

  const h = box.w / verh
  const px = box.w / mass.b
  // auf Tablet und Computer Schrift, Linien und Marken grösser: sonst wirkt die breite Karte
  // leer und fein (Michael, 2026-10-03: «eher schlechte Kartenqualität auf dem Tablet»)
  const g = Math.min(mass.b, mass.h * 1.6) >= 640 ? 1.4 : 1
  const pg = px * g
  // Striche in Kartenmass, ohne vector-effect: damit liess Chrome auf dem Tablet beim Neuzeichnen
  // Rechtecke stehen, Ziel und Pin waren abgeschnitten (Michael, 2026-10-03)
  const ansicht = [box.cx - box.w / 2, box.cy - h / 2, box.w, h]

  const grund = useKartengrund()
  const boden = useBoden()
  const linien = useKartenlinien()
  const clipId = useId()
  const seen = useSeen()
  const { linien: netz } = useKarte()
  const [orte, setOrte] = useState<Array<{ name: string; klasse?: number; lage: [number, number] }> | null>(null)
  useEffect(() => { if (hilfen.has('orte') && !orte) orteLaden().then((o) => setOrte(o ?? [])).catch(() => {}) }, [hilfen, orte])

  // Zeiger: ein Finger verschiebt oder tippt, zwei zoomen, am Pin zieht man den Pin
  const zeiger = useRef(new Map<number, { x: number; y: number }>())
  const zug = useRef<{ art: 'tipp' | 'karte' | 'pin' | 'zwei'; x: number; y: number; d: number; box: Box } | null>(null)
  const zuKarte = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: box.cx + (cx - r.left - r.width / 2) * (box.w / r.width), y: box.cy + (cy - r.top - r.height / 2) * (box.w / r.width) }
  }
  const ausKarte = (x: number, y: number): KartenPin => ({ la: -y, lo: x / LAENGE_ZU_BREITE })
  const pinSetzen = (cx: number, cy: number) => {
    if (!setzen) return
    const p = zuKarte(cx, cy)
    const neu = ausKarte(p.x, p.y)
    if (imGebiet(pool, gebiet, neu.la, neu.lo)) setzen(neu)
    else ausserhalb?.()
  }
  function zoomen(f: number, um?: { x: number; y: number }) {
    setBox((b) => {
      const w = Math.min(breiteStart * 1.5, Math.max(ENGSTE, b.w / f))
      if (!um) return { ...b, w }
      const a = w / b.w
      return { cx: um.x + (b.cx - um.x) * a, cy: um.y + (b.cy - um.y) * a, w }
    })
  }
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const rad = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const e2 = box.w / r.width
      zoomen(Math.exp(-e.deltaY * 0.002), { x: box.cx + (e.clientX - r.left - r.width / 2) * e2, y: box.cy + (e.clientY - r.top - r.height / 2) * e2 })
    }
    el.addEventListener('wheel', rad, { passive: false })
    return () => el.removeEventListener('wheel', rad)
  })

  function runter(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zeiger.current.size === 1) {
      const amPin = !!setzen && !!pin && (e.target as Element).closest('[data-pin]') !== null
      zug.current = { art: amPin ? 'pin' : 'tipp', x: e.clientX, y: e.clientY, d: 0, box }
    } else if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()]
      zug.current = { art: 'zwei', x: 0, y: 0, d: Math.hypot(a.x - b.x, a.y - b.y), box }
    }
  }
  function bewegt(e: React.PointerEvent<SVGSVGElement>) {
    if (!zeiger.current.has(e.pointerId) || !zug.current) return
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const z = zug.current
    if (z.art === 'zwei' && zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const f = d / (z.d || 1)
      const mitte = zuKarte((a.x + b.x) / 2, (a.y + b.y) / 2)
      z.d = d
      zoomen(f, mitte)
      return
    }
    if (z.art === 'pin') { pinSetzen(e.clientX, e.clientY); return }
    const dx = e.clientX - z.x, dy = e.clientY - z.y
    if (z.art === 'tipp' && Math.hypot(dx, dy) > TIPP_PX) z.art = 'karte'
    if (z.art === 'karte') {
      const r = svg.current!.getBoundingClientRect()
      const e2 = z.box.w / r.width
      setBox({ ...z.box, cx: z.box.cx - dx * e2, cy: z.box.cy - dy * e2 })
    }
  }
  function hoch(e: React.PointerEvent<SVGSVGElement>) {
    zeiger.current.delete(e.pointerId)
    const z = zug.current
    if (z?.art === 'tipp' && zeiger.current.size === 0) pinSetzen(e.clientX, e.clientY)
    if (zeiger.current.size === 0) zug.current = null
    else if (z?.art === 'zwei') zug.current = { art: 'karte', x: [...zeiger.current.values()][0].x, y: [...zeiger.current.values()][0].y, d: 0, box }
  }

  const gebietPfad = useMemo(() => ringe.map((r) => pfad(r.xy) + 'Z').join(''), [ringe])
  const kantonPfad = useMemo(() => [...pool.kantone.values()].flatMap((k) => k.ringe).map((r) => pfad(r.xy) + 'Z').join(''), [pool])
  const drin = (x: number, y: number, rand = 0) =>
    Math.abs(x - box.cx) < box.w / 2 + rand && Math.abs(y - box.cy) < h / 2 + rand

  // Beschriftungen ohne Überdeckung: ein grobes Raster je Bild
  const belegt: Array<[number, number, number, number]> = []
  const frei = (x: number, y: number, b: number) => {
    const f: [number, number, number, number] = [x - 2 * pg, y - 8 * pg, x + b, y + 3 * pg]
    if (belegt.some((g) => f[0] < g[2] && f[2] > g[0] && f[1] < g[3] && f[3] > g[1])) return false
    belegt.push(f)
    return true
  }
  const beschriftung = (key: string, x: number, y: number, text: string, fett = false): ReactNode => {
    const b = text.length * 6.2 * pg
    if (!drin(x, y) || !frei(x + 5 * pg, y, b)) return null
    return (
      <text key={key} x={x + 5 * pg} y={y + 3.5 * pg} fontSize={10.5 * pg} fontWeight={fett ? 'bold' : undefined}
            className="fill-sbb-black stroke-white dark:fill-sbb-white dark:stroke-sbb-midnight"
            strokeWidth={3 * pg} paintOrder="stroke">{text}</text>
    )
  }

  // im Spiel: Bahnhöfe, deren Name nichts verrät; das Ziel selbst nie
  const bahnhoefe = useMemo(() => index.filter((b) => b.lat !== null && b.lon !== null
    && !(ziel.t === 'b' && String(b.uic) === ziel.id) && (aufloesung || !verraet(b.name, ziel.name))), [index, ziel, aufloesung])
  // ein Ort, dessen Bahnhof gleich heisst und nah liegt, steht schon als Bahnhof da («Ins», «Belp»)
  const ortAmBahnhof = (o: { name: string; lage: [number, number] }) => {
    const n = o.name.replace('\n', ' ')
    return bahnhoefe.some((b) => (b.name === n || b.name.startsWith(n + ' ')) && stufeSichtbar(b.tier)
      && Math.abs(b.lat! - o.lage[0]) < 0.02 && Math.abs(b.lon! - o.lage[1]) < 0.03)
  }
  const stufeSichtbar = (tier: string) => tier === 'L' || (tier === 'M' && box.w < 1.2) || box.w < 0.35
  const [zx, zy] = lage(ziel.la, ziel.lo)

  // die Linie des Bauwerks in der Auflösung: auf der Linie der SBB oder laut swissTLM3D
  const bauwerk = useMemo(() => {
    if (ziel.g && netz) {
      const s = netz.get(ziel.g[0])
      return s ? zwischen(s, ziel.g[1], ziel.g[2]) : null
    }
    if (ziel.z) {
      let [la, lo] = ziel.z.start
      const pts: Array<[number, number]> = [lage(la / 1e5, lo / 1e5)]
      for (let i = 0; i < ziel.z.d.length; i += 2) { la += ziel.z.d[i]; lo += ziel.z.d[i + 1]; pts.push(lage(la / 1e5, lo / 1e5)) }
      return pts
    }
    return null
  }, [ziel, netz])

  const kacheln = kachelnImBild(box, h)
  const korn = koernung()

  // in der Auflösung klar beschriftet: das Ziel «Richtig» in Grün, der eigene Pin «Dein Tipp», die Pins der
  // anderen mit Namen, auf jeder Linie die Entfernung (Michael, 2026-10-03). Zuerst in «belegt»,
  // damit Bahnhöfe und Orte ausweichen.
  const marke = (key: string, x: number, y: number, text: string, farbe: string, rechts: boolean, gross = 12.5) => {
    const b = text.length * gross * 0.6 * pg
    const x0 = rechts ? x : x - b
    belegt.push([x0 - 3 * pg, y - gross * pg, x0 + b + 3 * pg, y + 4 * pg])
    return (
      <text key={key} x={x} y={y} fontSize={gross * pg} fontWeight="bold" textAnchor={rechts ? 'start' : 'end'}
            className={`${farbe} stroke-white dark:stroke-sbb-midnight`}
            strokeWidth={4 * pg} paintOrder="stroke" strokeLinejoin="round">{text}</text>
    )
  }
  const rechtsFrei = (x: number) => x < box.cx + box.w / 2 - 90 * pg
  const marken: ReactNode[] = []
  if (aufloesung) {
    for (const [i, p] of pins.entries()) {
      const [x, y] = lage(p.la, p.lo)
      const l = Math.hypot(x - zx, y - zy)
      // die Entfernung in der Mitte der Linie, wenn sie lang genug ist
      if (l > 80 * pg) {
        marken.push(marke(`km${i}`, (x + zx) / 2 + 6 * pg, (y + zy) / 2 + 4 * pg, distanzText(abstandM(p, ziel)),
                          'fill-sbb-red', true, 11.5))
      }
      const text = p.eigen ? 'Dein Tipp' : p.name
      // der eigene Pin hat die Nadel, sein Name steht neben dem Kopf
      if (text) marken.push(marke(`pn${i}`, x + (rechtsFrei(x) ? 1 : -1) * (p.eigen ? 11 : 7) * pg,
                                  y + (p.eigen ? -17 : 4) * pg, text, 'fill-sbb-red', rechtsFrei(x)))
    }
    marken.push(marke('ziel', zx + (rechtsFrei(zx) ? 1 : -1) * 11 * pg, zy + 4.5 * pg, 'Richtig',
                      'fill-sbb-green dark:fill-fahrt-sehenswert-hell', rechtsFrei(zx)))
  }

  // oben: Aufhellung, Bauwerk, Linien, Ziel und Pins; im Spiel nur der eigene Pin
  const oben = (
    <>
      {/* in der Auflösung die ganze Karte samt Beschriftungen 30 % heller, damit Bauwerk, Linien,
          Ziel und Pins hervorstechen (Michael, 2026-10-03) */}
      {aufloesung && <rect x={ansicht[0] - box.w} y={ansicht[1] - h} width={box.w * 3} height={h * 3} className="fill-white" opacity={0.3} />}
      {/* Ziel und Bauwerk erst in der Auflösung */}
      {aufloesung && bauwerk && bauwerk.length > 1 && (
        <path d={pfad(bauwerk)} fill="none" strokeWidth={6 * pg} strokeLinecap="round"
              className={ziel.t === 't' ? 'stroke-fahrt-tunnel dark:stroke-sbb-storm' : 'stroke-fahrt-bruecke'} />
      )}
      {aufloesung && pins.map((p, i) => {
        const [x, y] = lage(p.la, p.lo)
        return <line key={`v${i}`} x1={x} y1={y} x2={zx} y2={zy} strokeWidth={(p.eigen ? 2 : 1.4) * pg} strokeDasharray={`${5 * pg} ${4 * pg}`} className="stroke-sbb-red" />
      })}
      {aufloesung && (
        <g>
          <circle cx={zx} cy={zy} r={7 * pg} strokeWidth={2.5 * pg}
                  className="fill-white stroke-sbb-green dark:fill-sbb-midnight dark:stroke-fahrt-sehenswert-hell" />
          <circle cx={zx} cy={zy} r={2.5 * pg} className="fill-sbb-green dark:fill-fahrt-sehenswert-hell" />
        </g>
      )}
      {aufloesung && pins.filter((p) => !p.eigen && p.name).map((p, i) => {
        const [x, y] = lage(p.la, p.lo)
        return (
          <g key={`n${i}`}>
            <circle cx={x} cy={y} r={4.5 * pg} strokeWidth={1.5 * pg}
                    className="fill-sbb-red stroke-white dark:stroke-sbb-midnight" />
          </g>
        )
      })}
      {(aufloesung ? pins.find((p) => p.eigen) ?? null : pin) && (() => {
        const p = aufloesung ? pins.find((q) => q.eigen)! : pin!
        const [x, y] = lage(p.la, p.lo)
        // Nadel: Spitze am Punkt, Kopf darüber; ein grösserer, unsichtbarer Griff zum Ziehen
        return (
          <g data-pin className={setzen ? 'cursor-grab' : ''}>
            <path d={`M${x} ${y}L${x - 7 * pg} ${y - 15 * pg}A${9 * pg} ${9 * pg} 0 1 1 ${x + 7 * pg} ${y - 15 * pg}Z`}
                  strokeWidth={1.5 * pg} className="fill-sbb-red stroke-white dark:stroke-sbb-midnight" />
            <circle cx={x} cy={y - 21 * pg} r={3.2 * pg} className="fill-white" />
            {setzen && <circle cx={x} cy={y - 14 * pg} r={22 * pg} fill="transparent" />}
          </g>
        )
      })()}
      {marken}
    </>
  )

  return (
    <div ref={huelle} className={`${klasse || 'relative'} overflow-hidden bg-ausland`}>
      <svg ref={svg} viewBox={ansicht.join(' ')} className="absolute inset-0 size-full touch-none select-none"
           role="img" aria-label="Karte des Spielgebiets"
           onPointerDown={runter} onPointerMove={bewegt} onPointerUp={hoch} onPointerCancel={hoch}
           onDoubleClick={(e) => zoomen(2, zuKarte(e.clientX, e.clientY))}>
        {/* Grund: das Spielgebiet hell, alles andere grau */}
        <path d={gebietPfad} fillRule="evenodd" className="fill-karte" />
        {/* Höhenstufen, Siedlung und Wald nur im Spielgebiet; sie zeigen nichts, was gefragt ist */}
        <clipPath id={clipId}><path d={gebietPfad} fillRule="evenodd" /></clipPath>
        <g clipPath={`url(#${clipId})`}>
          {grund?.hoehen.map((st, i) => (
            <path key={`h${st.ab}`} d={kacheln.map((k) => kachelPfad(st.schicht, k)).join('')} fillRule="evenodd" fill={GRUND.hoehen[i]} />
          ))}
          {boden && (['siedlung', 'wald'] as const).map((k) => (
            <path key={k} d={kacheln.map((kk) => kachelPfad(boden[k], kk)).join('')} fillRule="evenodd" fill={GRUND[k]} />
          ))}
        </g>
        {gebiet !== 'CH' && (
          <path d={gebietPfad} fill="none" strokeWidth={1.5 * pg}
                className="stroke-sbb-metal dark:stroke-sbb-storm" />
        )}
        {hilfen.has('seen') && <SeenFlaechen seen={seen} box={box} verh={verh} px={px} />}
        {hilfen.has('fluesse') && grund && (
          <path d={grund.fluesse.filter((f) => f.k <= (box.w < 0.6 ? 6 : 5) && imBild(f, box, h)).flatMap((f) => f.stuecke.filter((z) => imBild(z, box, h)).map((z) => z.d)).join('')}
                fill="none" strokeWidth={1.6 * pg} strokeLinecap="round" className="stroke-fluss" />
        )}
        {hilfen.has('kantone') && (
          <path d={linien ? linien.kantone.filter((z) => imBild(z, box, h)).map((z) => z.d).join('') : kantonPfad} fill="none" strokeWidth={1 * pg} strokeDasharray={`${5 * pg} ${3 * pg}`} strokeLinejoin="round"
                className="stroke-sbb-metal/60 dark:stroke-sbb-storm/60" />
        )}
        {/* die Landesgrenze gehört zum Grund */}
        {grund && (
          <path d={grund.grenze.filter((z) => imBild(z, box, h)).map((z) => z.d).join('')} fill="none" strokeWidth={1.4 * pg} className="stroke-landesgrenze" />
        )}
        {hilfen.has('bahnnetz') && netz && (
          <>
            <path d={linien ? linien.bahn.filter((z) => imBild(z, box, h)).map((z) => z.d).join('')
                       : [...netz.values()].flat().filter((s) => s.x.some((x, i) => drin(x, s.y[i], box.w * 0.1)))
                       .map((s) => pfad(s.x.map((x, i) => [x, s.y[i]]))).join('')}
                  fill="none" strokeWidth={1.6 * pg} strokeLinejoin="round"
                  className="stroke-sbb-charcoal/75" />
            {bahnhoefe.filter((b) => drin(...lage(b.lat!, b.lon!)) && stufeSichtbar(b.tier)).map((b) => {
              const [x, y] = lage(b.lat!, b.lon!)
              return <circle key={`b${b.uic}`} cx={x} cy={y} r={2.6 * pg} strokeWidth={1.2 * pg}
                             className="fill-white stroke-sbb-charcoal dark:fill-sbb-midnight dark:stroke-sbb-white" />
            })}
          </>
        )}
        {/* Beschriftungen: Bahnhöfe vor Orten */}
        {hilfen.has('bahnnetz') && bahnhoefe.filter((b) => stufeSichtbar(b.tier)).sort((a, b) => a.tier.localeCompare(b.tier))
          .map((b) => { const [x, y] = lage(b.lat!, b.lon!); return beschriftung(`bn${b.uic}`, x, y, b.name, b.tier === 'L') })}
        {hilfen.has('orte') && orte?.filter((o) => (aufloesung || !verraet(o.name, ziel.name))
            && !(hilfen.has('bahnnetz') && ortAmBahnhof(o))
            && ((o.klasse ?? 1) >= 3 || box.w < (o.klasse === 2 ? 1.6 : 0.6)))
          .sort((a, b) => (b.klasse ?? 0) - (a.klasse ?? 0))
          .map((o) => { const [x, y] = lage(o.lage[0], o.lage[1]); return beschriftung(`o${o.name}`, x, y, o.name.replace('\n', ' ')) })}
        {!aufloesung && oben}
      </svg>
      {korn && <div aria-hidden="true" className="pointer-events-none absolute inset-0 mix-blend-multiply"
                    style={{ backgroundImage: `url(${korn})`, backgroundSize: '160px 160px' }} />}
      {/* die Lösung über Körnung und Aufhellung, damit sie klar bleibt */}
      {aufloesung && (
        <svg viewBox={ansicht.join(' ')} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {oben}
        </svg>
      )}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1.5">
        {([['+', 2], ['−', 0.5]] as const).map(([t, f]) => (
          <button key={t} type="button" onClick={() => zoomen(f)} aria-label={f > 1 ? 'Näher' : 'Weiter weg'}
                  className="size-10 rounded-lg border border-sbb-cloud bg-white text-xl font-medium dark:border-sbb-iron dark:bg-sbb-midnight">
            {t}
          </button>
        ))}
        <button type="button" onClick={() => setBox({ ...start, w: breiteStart })} aria-label="Ganzes Spielgebiet"
                className="flex size-10 items-center justify-center rounded-lg border border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-midnight">
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
          </svg>
        </button>
      </div>
    </div>
  )
}
