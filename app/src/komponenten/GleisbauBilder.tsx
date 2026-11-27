/**
 * Gleisbau mit den Bildern von ChatGPT (Michael, 2026-11-22/23: abgestimmt mit ChatGPT, «Ich würde gerne mal testen»): Grund, Texturen und Objekte
 * als Bilder, Gleise, Ufer, Waldrand, Felsgebiet und Schatten im Programm. Die Bilder liegen in src/assets/gleisbau (aus Michaels PNG zugeschnitten,
 * gesäubert und verkleinert), ihre Masse in src/assets/gleisbau-masse.json. Lage, Auswahl und Grösse der Objekte nach festem Zufall je Feld.
 * Ein Baukasten, keine Wirklichkeit: alle Masse und Regeln gewählt.
 */
import { type Brett, type Feld, flussKanten, strasseAlsBruecke, strasseGerade, strasseUeberGleis, grosseKurve, grossGeometrie, istBahnhof, spalten, strassenKanten, type Stueck, tunnelWeiter, wege, wegPunkte, zeilen } from '../gleisbau'
import type { ReactElement } from 'react'
import MASSE from '../assets/gleisbau-masse.json'

const URLS = import.meta.glob('../assets/gleisbau/*.webp', { eager: true, import: 'default' }) as Record<string, string>
type Masse = { w: number; h: number; oeffnung?: number[]; balken?: number }
const M = MASSE as Record<string, Masse>
export const bild = (name: string) => URLS[`../assets/gleisbau/${name}.webp`]
export const masse = (name: string) => M[name]

/** fester Zufall je Feld, damit die Landschaft beim Neuzeichnen bleibt */
export function zufall(i: number, j: number, k: number) {
  const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}

/** Höhe der Kachel ohne ihre dunklere Unterkante (wie in Gleisbau.tsx) */
const KACHEL_H = 0.915

/** die Texturen als Muster über das ganze Brett, je Bild zwei Felder breit; ausserhalb von display:none, sonst zeichnet Chrome sie nicht */
export function MusterDefs() {
  const muster = (id: string, name: string) => (
    <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={2} height={2}>
      <image href={bild(name)} width={2} height={2} preserveAspectRatio="none" />
    </pattern>
  )
  return (
    <svg width={0} height={0} aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        {muster('gb-wald', 'gb_textur_waldboden_01')}
        {muster('gb-fels', 'gb_textur_fels_01')}
        {muster('gb-wasser', 'gb_textur_wasser_01')}
        {muster('gb-reben', 'gb_textur_rebberg_01')}
        {muster('gb-schnee', 'gb_textur_schnee_01')}
        {muster('gb-acker', 'gb_textur_acker_01')}
      </defs>
    </svg>
  )
}

/**
 * Gelände (Michael, 2026-11-24: «Elemente für die Landschaft …, die eine gewisse Topologie darstellen? Irgendwie mit einem Verlauf pro Element; teilweise
 * auch diagonal»). Seit 2026-11-26 multipliziert auf den Grund statt darübergelegt, mit einer steilen Böschung in der Mitte des Felds statt eines Verlaufs von
 * Kante zu Kante, dazu Aussen- und Innenecken, damit man Hochebenen und Täler legen kann (Michael: «Der Verlauf über der Wiese soll nicht ein darüberliegender
 * Lauf sein, sondern multipliziert auf der Wiese. Zudem soll der Verlauf nicht linear von der einen Kante zur anderen Kante sein, sondern ein schärferer Verlauf
 * innerhalb der Kante. So soll es auch Kurven geben, damit man wie eine Plattform, die höher zu liegen scheint, produzieren kann. Eine Hochebene quasi oder ein
 * Tal»). Die hohe Seite bleibt, wie sie ist, die Böschung ist dunkel, am Fuss am dunkelsten, die tiefe Seite leicht dunkler. Nummern: 0 bis 7 Kante, hoch
 * in Richtung N, NO, O, SO, S, SW, W, NW; 8 Hügel, 9 Mulde (wie bisher); 10 bis 13 Aussenecke, hoch in der Ecke NO, SO, SW, NW (Ecke einer Hochebene);
 * 14 bis 17 Innenecke, tief in der Ecke NO, SO, SW, NW (Ecke eines Tals). Stärken und Lage der Böschung gewählt
 */
export const GELAENDE_NAMEN = ['Kante, oben im Norden', 'Kante, oben im Nordosten', 'Kante, oben im Osten', 'Kante, oben im Südosten', 'Kante, oben im Süden',
  'Kante, oben im Südwesten', 'Kante, oben im Westen', 'Kante, oben im Nordwesten', 'Hügel', 'Mulde',
  'Aussenecke, oben im Nordosten', 'Aussenecke, oben im Südosten', 'Aussenecke, oben im Südwesten', 'Aussenecke, oben im Nordwesten',
  'Innenecke, unten im Nordosten', 'Innenecke, unten im Südosten', 'Innenecke, unten im Südwesten', 'Innenecke, unten im Nordwesten', 'Hochebene', 'Tal']
/** in welcher Reihenfolge ein Tipp die Formen durchgeht: zuerst die geraden Kanten, dann die Ecken, die schrägen, Hügel und Mulde */
/**
 * seit 2026-11-26 nur noch Hochebene (18) und Tal (19), die Böschung rechnet sich aus den Nachbarn wie bei Wald und Wasser (Michael: «irgendwie passt das noch
 * nicht so gut mit dem Gelände … durch mehrfaches Klicken das Element zu wechseln, aber es ist noch nicht nahtlos umsetzbar»); 0 bis 17 bleiben für alte Bretter
 */
export const GELAENDE_FOLGE = [18, 19]
const SCHATTEN = '#3c5a28'
/** Stufen von tief (t 0) nach hoch (t 1): tiefe Seite leicht, Fuss der Böschung am dunkelsten, oben nichts */
const STUFEN: Array<[number, number]> = [[0, 0.16], [0.34, 0.16], [0.38, 0.5], [0.66, 0.06], [0.7, 0], [1, 0]]
const stops = (umgekehrt: boolean) => (umgekehrt ? [...STUFEN].reverse().map(([t, a]) => [1 - t, a] as [number, number]) : STUFEN)
  .map(([o, a], k) => <stop key={k} offset={o} stopColor={SCHATTEN} stopOpacity={a} />)
export function GelaendeVerlaeufe() {
  // Ecken: NO, SO, SW, NW
  const ecke = [[1, 0], [1, 1], [0, 1], [0, 0]]
  return (
    <svg width={0} height={0} aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        {Array.from({ length: 8 }, (_, d) => {
          const a = (d * Math.PI) / 4, sx = Math.round(Math.sin(a)), sy = Math.round(Math.cos(a))
          // von der tiefen Seite (t 0) zur hohen (t 1), über Eck von Ecke zu Ecke
          return <linearGradient key={d} id={`gb-hang-${d}`} x1={0.5 - 0.5 * sx} y1={0.5 + 0.5 * sy} x2={0.5 + 0.5 * sx} y2={0.5 - 0.5 * sy}>{stops(false)}</linearGradient>
        })}
        <radialGradient id="gb-hang-8" cx={0.5} cy={0.5} r={0.62}>{stops(true)}</radialGradient>
        <radialGradient id="gb-hang-9" cx={0.5} cy={0.5} r={0.62}>{stops(false)}</radialGradient>
        {ecke.map(([x, y], q) => <radialGradient key={`a${q}`} id={`gb-hang-${10 + q}`} cx={x} cy={y} r={1}>{stops(true)}</radialGradient>)}
        {ecke.map(([x, y], q) => <radialGradient key={`i${q}`} id={`gb-hang-${14 + q}`} cx={x} cy={y} r={1}>{stops(false)}</radialGradient>)}
      </defs>
    </svg>
  )
}
/** Breite und Weichheit der Böschung und ihre Stärke (gewählt) */
/**
 * Breite, Weichheit und Stärke der Böschung (gewählt); seit 2026-11-26 Licht von oben links (Michael: «Ja, Licht von oben links einbauen … Die Kante ist noch
 * etwas zu scharf»): die Böschung ist um BOESCHUNG_LICHT nach unten rechts verschoben dunkel und nach oben links verschoben hell, so liegt bei der Hochebene
 * die helle Böschung oben links und die dunkle unten rechts, beim Tal umgekehrt; die Kante selbst um KANTE_WEICH weich
 */
const BOESCHUNG_BREIT = 0.16, BOESCHUNG_WEICH = 0.09, BOESCHUNG_LICHT = 0.12, BOESCHUNG_STAERKE = 0.75, LICHT_STAERKE = 0.22, KANTE_WEICH = 0
const EBENE_EINZUG = 0.2, EBENE_RUND = 0.3, RAMPE_BREIT = 0.38
export function GelaendeBild({ brett }: { brett: Brett }) {
  const raus: ReactElement[] = []
  // Hochebene und Tal als Gebiet: die Hochebene wirft ausserhalb ihres Rands eine Böschung, im Tal liegt sie innerhalb
  // seit 2026-11-26 die Kante im Feld eingerückt und stärker gerundet, nicht auf den Fugen (Michael: «bitte mehr abgerundet und nicht so strikt den Fugen entlang»)
  const hoch = gebietPfadWenn(brett, (f) => f.hang === 18, EBENE_EINZUG, EBENE_RUND), tal = gebietPfadWenn(brett, (f) => f.hang === 19, EBENE_EINZUG, EBENE_RUND)
  if (hoch || tal) {
    const sp = spalten(brett), ze = zeilen(brett), nah: Array<[number, number]> = []
    brett.forEach((z, j) => z.forEach((_, i) => {
      for (let v = j - 1; v <= j + 1; v++) for (let u = i - 1; u <= i + 1; u++) { const h = brett[v]?.[u]?.hang; if (h === 18 || h === 19) { nah.push([i, j]); return } }
    }))
    const flt = { filterUnits: 'userSpaceOnUse' as const, primitiveUnits: 'userSpaceOnUse' as const, x: -1, y: -1, width: sp + 2, height: ze + 2 }
    const rahmen = { maskUnits: 'userSpaceOnUse' as const, x: -1, y: -1, width: sp + 2, height: ze + 2 }
    const L = BOESCHUNG_LICHT
    /**
     * Rampen (Michael, 2026-11-26: «hast du einen Vorschlag für eine Rampe?», dann «Ja gern»): wo ein Gleis oder eine Strasse über die Böschung führt, ist sie
     * unterbrochen, so liegen sie auf einem flachen Damm; nur fürs Auge, der Zug fährt gleich schnell (Breite gewählt)
     */
    const rampen: string[] = []
    const linie = (pt: Array<{ x: number; y: number }>) => rampen.push(pt.map((q, k) => `${k ? 'L' : 'M'}${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(' '))
    const nahSet = new Set(nah.map(([i, j]) => `${i},${j}`))
    brett.forEach((z, j) => z.forEach((f, i) => {
      if (f.gleis && !f.teil) {
        const n = grosseKurve(f.gleis)
        if (n) {
          const G = grossGeometrie(i, j, f.gleis)
          if (G.zellen.some(([u, v]) => nahSet.has(`${u},${v}`))) linie(Array.from({ length: 31 }, (_, k) => { const a = G.a0 + (G.da * k) / 30; return { x: G.cx + G.r * Math.cos(a), y: G.cy + G.r * Math.sin(a) } }))
        } else if (nahSet.has(`${i},${j}`)) for (const [a, c] of wege(f.gleis)) linie(wegPunkte({ i, j, ein: a, aus: c } as Stueck, 10))
      }
      if (f.strasse && nahSet.has(`${i},${j}`)) for (const k of strassenKanten(brett, i, j)) linie([{ x: i + 0.5, y: j + 0.5 }, { x: i + 0.5 + [0, 0.5, 0, -0.5][k], y: j + 0.5 + [-0.5, 0, 0.5, 0][k] }])
    }))
    const rampe = rampen.length ? <path d={rampen.join(' ')} fill="none" stroke="#000" strokeWidth={RAMPE_BREIT} strokeLinecap="round" filter="url(#gb-ebene-kante)" /> : null
    // je Richtung ein Filter: die Fläche gewachsen (aus) oder geschrumpft (ein), verschoben und weich
    const filter = (id: string, op: 'dilate' | 'erode', dx: number) => (
      <filter id={id} {...flt}><feMorphology operator={op} radius={BOESCHUNG_BREIT} /><feOffset dx={dx} dy={dx} /><feGaussianBlur stdDeviation={BOESCHUNG_WEICH} /></filter>
    )
    const maske = (id: string, d: string, aussen: boolean, f: string) => (
      <mask id={id} {...rahmen}>
        {aussen
          ? <><path d={d} fill="#fff" filter={`url(#${f})`} /><path d={d} fill="#000" filter="url(#gb-ebene-kante)" /></>
          : <><path d={d} fill="#fff" filter="url(#gb-ebene-kante)" /><path d={d} fill="#000" filter={`url(#${f})`} /></>}
        {rampe}
      </mask>
    )
    const flaeche = (m: string, farbe: string) => <rect x={-1} y={-1} width={sp + 2} height={ze + 2} fill={farbe} mask={`url(#${m})`} />
    raus.push(
      <g key="ebenen" pointerEvents="none">
        <defs>
          <clipPath id="gb-ebene-kacheln">{nah.map(([i, j]) => <rect key={`${i},${j}`} x={i + 0.025} y={j + 0.025} width={0.95} height={KACHEL_H} rx={0.05} />)}</clipPath>
          <filter id="gb-ebene-kante" {...flt}><feGaussianBlur stdDeviation={KANTE_WEICH} /></filter>
          {filter('gb-ebene-aus-dunkel', 'dilate', L)}{filter('gb-ebene-aus-hell', 'dilate', -L)}
          {filter('gb-ebene-ein-dunkel', 'erode', L)}{filter('gb-ebene-ein-hell', 'erode', -L)}
          {hoch && <>{maske('gb-hoch-dunkel', hoch, true, 'gb-ebene-aus-dunkel')}{maske('gb-hoch-hell', hoch, true, 'gb-ebene-aus-hell')}</>}
          {tal && <>{maske('gb-tal-dunkel', tal, false, 'gb-ebene-ein-dunkel')}{maske('gb-tal-hell', tal, false, 'gb-ebene-ein-hell')}</>}
        </defs>
        <g clipPath="url(#gb-ebene-kacheln)">
          <g opacity={BOESCHUNG_STAERKE} style={{ mixBlendMode: 'multiply' }}>
            {hoch && flaeche('gb-hoch-dunkel', SCHATTEN)}{tal && flaeche('gb-tal-dunkel', SCHATTEN)}
          </g>
          <g opacity={LICHT_STAERKE}>
            {hoch && flaeche('gb-hoch-hell', '#eaf7a8')}{tal && flaeche('gb-tal-hell', '#eaf7a8')}
          </g>
        </g>
      </g>,
    )
  }
  brett.forEach((z, j) => z.forEach((f, i) => {
    if (f.hang === undefined || f.hang >= 18) return
    raus.push(<rect key={`${i},${j}`} x={i + 0.025} y={j + 0.025} width={0.95} height={KACHEL_H} rx={0.05} fill={`url(#gb-hang-${f.hang})`} pointerEvents="none"
                    style={{ mixBlendMode: 'multiply' }} />)
  }))
  return <>{raus}</>
}

/** Einzug der Gebiete vom Rand der Felder, an denen kein gleicher Grund anschliesst, und Rundung der Ecken (gewählt) */
const EINZUG: Record<string, number> = { wald: 0.07, berg: 0.07, ufer: 0.06, wasser: 0.13, rebberg: 0.07, schnee: 0.05, acker: 0.07 }
const RUND = 0.2
const FUELLUNG: Record<string, string> = { wald: 'url(#gb-wald)', berg: 'url(#gb-fels)', ufer: '#d8cf9a', wasser: 'url(#gb-wasser)', rebberg: 'url(#gb-reben)', schnee: 'url(#gb-schnee)', acker: 'url(#gb-acker)' }

/**
 * Ein Gebiet (Wald, Fels, Ufer, Wasser) als Fläche aus Vierteln: je Viertel eines Felds schaut das Programm auf die beiden Nachbarn an seinen Kanten
 * und den über Eck; wo kein gleicher Grund anschliesst, rückt die Fläche um den Einzug ein, aussen gerundet, innen mit einer Kehle. So verschmelzen
 * gleiche Felder zu einem Gebiet, die Fugen bleiben (auf die Kacheln zugeschnitten)
 */
function gebietPfad(b: Brett, grund: Feld['grund'], e: number) {
  return gebietPfadWenn(b, (f) => f.grund === grund, e)
}
function gebietPfadWenn(b: Brett, gilt: (f: Feld) => boolean, e: number, rund = RUND) {
  const sp = spalten(b), ze = zeilen(b)
  // ausserhalb des Bretts geht das Gebiet weiter: am Rand kein Einzug, See, Wald und Gelände laufen bis an die Kante (Michael, 2026-11-27: «Wenn See oder
  // Geländeelemente an den Rand kommen, dann sollen sie dort auch bis zum Rand gezeichnet werden»)
  const gleich = (i: number, j: number) => (i < 0 || j < 0 || i >= sp || j >= ze ? true : gilt(b[j][i]))
  const teile: string[] = []
  for (let j = 0; j < ze; j++) for (let i = 0; i < sp; i++) {
    if (!gilt(b[j][i])) continue
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const cx = i + (sx < 0 ? 1 : 0), cy = j + (sy < 0 ? 1 : 0)
      const ex = gleich(i - sx, j) ? 0 : e, ey = gleich(i, j - sy) ? 0 : e
      const P = (u: number, v: number) => `${(cx + sx * u).toFixed(3)},${(cy + sy * v).toFixed(3)}`
      let d: string
      if (ex > 0 && ey > 0) {
        const r = Math.min(rund, 0.5 - ex, 0.5 - ey)
        d = `M${P(ex + r, ey)} L${P(0.5, ey)} L${P(0.5, 0.5)} L${P(ex, 0.5)} L${P(ex, ey + r)} Q${P(ex, ey)} ${P(ex + r, ey)} Z`
      } else if (ex > 0 || ey > 0) {
        d = `M${P(ex, ey)} L${P(0.5, ey)} L${P(0.5, 0.5)} L${P(ex, 0.5)} Z`
      } else if (gleich(i - sx, j - sy)) {
        d = `M${P(0, 0)} L${P(0.5, 0)} L${P(0.5, 0.5)} L${P(0, 0.5)} Z`
      } else {
        d = `M${P(e, 0)} L${P(0.5, 0)} L${P(0.5, 0.5)} L${P(0, 0.5)} L${P(0, e)} Q${P(e, e)} ${P(e, 0)} Z`
      }
      teile.push(d)
    }
  }
  return teile.join(' ')
}

/** Grund und Gebiete des ganzen Bretts, auf die Kacheln zugeschnitten (clipPath gleisbau-kacheln) */
/**
 * Die Wiese aller Felder als ein Muster von 6 × 3 Feldern (Kante, Fläche, Bild je Feld gespiegelt wie früher einzeln), über das ganze Brett: bis 192 × 108
 * Felder wären sonst zehntausende Bilder (seit 2026-11-24, Michael: «Brettgrösse auf 192x108 erhöhen»)
 */
export function WiesenMuster({ sp, ze, kante, flaeche }: { sp: number; ze: number; kante: string; flaeche: string }) {
  const wiese = bild('gb_grund_wiese_01')
  const zellen: ReactElement[] = []
  for (let v = 0; v < 3; v++) for (let u = 0; u < 6; u++) {
    const fx = u % 2 === 1, fy = (2 * u + v) % 3 === 0
    zellen.push(
      <g key={`${u},${v}`}>
        <rect x={u + 0.025} y={v + 0.025} width={0.95} height={0.95} rx={0.05} fill={kante} />
        <rect x={u + 0.025} y={v + 0.025} width={0.95} height={KACHEL_H} rx={0.05} fill={flaeche} />
        <g clipPath={`url(#gb-zelle-${u}-${v})`}>
          <image href={wiese} x={0} y={0} width={1} height={1} preserveAspectRatio="none"
                 transform={`translate(${fx ? u + 1 : u} ${fy ? v + 1 : v}) scale(${fx ? -1 : 1} ${fy ? -1 : 1})`} />
        </g>
      </g>,
    )
  }
  return (
    <>
      <defs>
        {Array.from({ length: 18 }, (_, k) => (
          <clipPath key={k} id={`gb-zelle-${k % 6}-${Math.floor(k / 6)}`}>
            <rect x={(k % 6) + 0.025} y={Math.floor(k / 6) + 0.025} width={0.95} height={KACHEL_H} rx={0.05} />
          </clipPath>
        ))}
        <pattern id="gb-wiesen" patternUnits="userSpaceOnUse" width={6} height={3}>{zellen}</pattern>
      </defs>
      <rect x={0} y={0} width={sp} height={ze} fill="url(#gb-wiesen)" />
    </>
  )
}

export function Landschaft({ brett }: { brett: Brett }) {
  const wiese = bild('gb_grund_wiese_01')
  // nur die Felder mit anderem Grund oder einem Fluss; die Wiese kommt aus WiesenMuster
  const besondere: Array<[number, number]> = []
  brett.forEach((z, j) => z.forEach((f, i) => { if (f.grund !== 'wiese' || f.fluss) besondere.push([i, j]) }))
  return (
    <>
      <defs>
        <clipPath id="gleisbau-kacheln">
          {besondere.map(([i, j]) => <rect key={`${i},${j}`} x={i + 0.025} y={j + 0.025} width={0.95} height={KACHEL_H} rx={0.05} />)}
        </clipPath>
      </defs>
      <g clipPath="url(#gleisbau-kacheln)">
        {/* die Wiese je Feld nur gespiegelt, nicht gedreht: ihre Flächen sind waagrecht gestreckt */}
        {besondere.map(([i, j]) => {
          const fx = (i + 2 * j) % 2 === 1, fy = (2 * i + j) % 3 === 0
          return <image key={`w${i},${j}`} href={wiese} x={0} y={0} width={1} height={1} preserveAspectRatio="none"
                        transform={`translate(${fx ? i + 1 : i} ${fy ? j + 1 : j}) scale(${fx ? -1 : 1} ${fy ? -1 : 1})`} />
        })}
        <path d={gebietPfad(brett, 'wald', EINZUG.wald)} fill={FUELLUNG.wald} />
        <path d={gebietPfad(brett, 'rebberg', EINZUG.rebberg)} fill={FUELLUNG.rebberg} />
        <path d={gebietPfad(brett, 'schnee', EINZUG.schnee)} fill={FUELLUNG.schnee} />
        <path d={gebietPfad(brett, 'acker', EINZUG.acker)} fill={FUELLUNG.acker} />
        <path d={gebietPfad(brett, 'berg', EINZUG.berg)} fill={FUELLUNG.berg} />
        <path d={gebietPfad(brett, 'wasser', EINZUG.ufer)} fill={FUELLUNG.ufer} />
        <path d={gebietPfad(brett, 'wasser', EINZUG.wasser)} fill={FUELLUNG.wasser} />
        {/* Flüsse: von der Mitte zu jeder Kante, an der Fluss oder Wasser anschliesst, mit Ufer (Breiten gewählt) */}
        {(() => {
          const d: string[] = [], dw: string[] = [], m: string[] = []
          // seit 2026-11-26 (Michael: «Bitte Flusskurven so schön rund wie die Gleise und Strassen»): zwei Kanten über Eck als Viertelkreis um die Ecke des Felds,
          // zwei gegenüber gerade, sonst je Stück von der Mitte zur Kante mit einem Kreis in der Mitte
          const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], K = 0.5 * 0.5523
          for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
            const k = flussKanten(brett, i, j)
            const cx = i + 0.5, cy = j + 0.5
            const rand = (e: number) => [cx + 0.5 * DX[e], cy + 0.5 * DY[e]]
            if (k.length === 2 && (k[0] + k[1]) % 2 === 1) {
              const [a, c] = k, [ax, ay] = rand(a), [bx, by] = rand(c)
              const bogen = `M${ax},${ay} C${ax - K * DX[a]},${ay - K * DY[a]} ${bx - K * DX[c]},${by - K * DY[c]} ${bx},${by}`
              d.push(bogen); dw.push(bogen)
            } else if (k.length === 2) {
              const [ax, ay] = rand(k[0]), [bx, by] = rand(k[1])
              d.push(`M${ax},${ay} L${bx},${by}`); dw.push(`M${ax},${ay} L${bx},${by}`)
            } else {
              for (const e of k) { const [ex, ey] = rand(e); d.push(`M${cx},${cy} L${ex},${ey}`); dw.push(`M${cx},${cy} L${ex},${ey}`) }
              if (k.length) m.push(`M${cx},${cy} l0,0`)
            }
            for (const e of k) {
              // in einen See läuft der Fluss über das Ufer hinein (Michael, 2026-11-24: «Wäre schön wenn sich Fluss mit See verbinden liesse»), gewählt
              const see = brett[j + DY[e]]?.[i + DX[e]]?.grund === 'wasser'
              if (!see) continue
              const [ex, ey] = rand(e), weg = (l: number) => `M${ex},${ey} L${ex + l * DX[e]},${ey + l * DY[e]}`
              d.push(weg(0.12)); dw.push(weg(0.2))
            }
          }
          return d.length ? <>
            <path d={d.join(' ')} fill="none" stroke={FUELLUNG.ufer} strokeWidth={0.46} />
            <path d={m.join(' ')} fill="none" stroke={FUELLUNG.ufer} strokeWidth={0.46} strokeLinecap="round" />
            <path d={dw.join(' ')} fill="none" stroke={FUELLUNG.wasser} strokeWidth={0.34} />
            <path d={m.join(' ')} fill="none" stroke={FUELLUNG.wasser} strokeWidth={0.34} strokeLinecap="round" />
          </> : null
        })()}
      </g>
    </>
  )
}

/** ein Objekt: Name des Bilds, Fusspunkt (x, y), Breite in Feldern, gespiegelt */
export interface Objekt { name: string; x: number; y: number; b: number; spiegeln: boolean }

/** Breite je Objekt in Feldern (gewählt, nach der Spezifikation mit ChatGPT) */
const BREITE: Record<string, number> = {
  gb_obj_laubbaum_01: 0.25, gb_obj_laubbaum_02: 0.25, gb_obj_laubbaum_03: 0.15, gb_obj_laubbaum_04: 0.3,
  gb_obj_nadelbaum_01: 0.17, gb_obj_nadelbaum_02: 0.17, gb_obj_nadelbaum_03: 0.17, gb_obj_nadelbaum_04: 0.17,
  gb_obj_busch_01: 0.13, gb_obj_busch_02: 0.12, gb_obj_fels_01: 0.14, gb_obj_fels_02: 0.16,
  gb_obj_haus_01: 0.24, gb_obj_haus_02: 0.24, gb_obj_haus_03: 0.26, gb_obj_haus_04: 0.26, gb_obj_haus_05: 0.25, gb_obj_haus_06: 0.22,
  gb_obj_gipfel_gross_01: 0.95, gb_obj_gipfel_gross_02: 1.1, gb_obj_gipfel_gross_03: 1.2,
  gb_obj_kirche_01: 0.55, gb_obj_bauernhof_01: 0.72, gb_obj_nadelbaum_schnee_01: 0.2,
  gb_obj_gipfel_klein_01: 0.75, gb_obj_gipfel_klein_02: 0.75, gb_obj_gipfel_klein_03: 0.7,
}
const LAUB = ['gb_obj_laubbaum_01', 'gb_obj_laubbaum_02', 'gb_obj_laubbaum_03', 'gb_obj_laubbaum_04']
const NADEL = ['gb_obj_nadelbaum_01', 'gb_obj_nadelbaum_02', 'gb_obj_nadelbaum_03', 'gb_obj_nadelbaum_04']
const BUSCH = ['gb_obj_busch_01', 'gb_obj_busch_02']
const FELS = ['gb_obj_fels_01', 'gb_obj_fels_02']
const GROSS = ['gb_obj_gipfel_gross_01', 'gb_obj_gipfel_gross_02', 'gb_obj_gipfel_gross_03']
const KLEIN = ['gb_obj_gipfel_klein_01', 'gb_obj_gipfel_klein_02', 'gb_obj_gipfel_klein_03']
const HAEUSER = ['gb_obj_haus_01', 'gb_obj_haus_02', 'gb_obj_haus_03', 'gb_obj_haus_05']
const waehle = (l: string[], z: number) => l[Math.min(l.length - 1, Math.floor(z * l.length))]
const hoehe = (name: string, b: number) => { const m = masse(name); return m ? (b * m.h) / m.w : b }

/** die Punkte aller Gleise ausserhalb von Tunneln, dazu die Perrons der Bahnhöfe: dort steht kein Objekt */
function gleisPunkte(b: Brett, imTunnel: (b: Brett, x: number, y: number) => boolean) {
  const p: Array<[number, number]> = []
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    const g = b[j][i].gleis
    if (!g) continue
    const pts: Array<{ x: number; y: number; w: number }> = []
    if (grosseKurve(g)) {
      const G = grossGeometrie(i, j, g)
      for (let k = 0; k <= 40; k++) { const a = G.a0 + (G.da * k) / 40; pts.push({ x: G.cx + G.r * Math.cos(a), y: G.cy + G.r * Math.sin(a), w: 0 }) }
    } else {
      for (const [a, c] of wege(g)) pts.push(...wegPunkte({ i, j, ein: a, aus: c } as Stueck, 10))
    }
    for (const q of pts) if (!imTunnel(b, q.x, q.y)) p.push([q.x, q.y])
    if (istBahnhof(g)) for (let k = 0; k <= 8; k++) for (let m = 0; m <= 8; m++) p.push([i + k / 8, j + m / 8])
  }
  // auch auf Flüssen steht nichts
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    for (const k of flussKanten(b, i, j)) for (let t = 0; t <= 5; t++) for (const q of [-0.2, 0, 0.2]) {
      p.push([i + 0.5 + [0, 1, 0, -1][k] * t * 0.1 + [1, 0, 1, 0][k] * q, j + 0.5 + [-1, 0, 1, 0][k] * t * 0.1 + [0, 1, 0, 1][k] * q])
    }
  }
  // auch auf Strassen steht nichts
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    // durch den Berg ein Tunnel, darüber dürfen Gipfel stehen
    if (b[j][i].grund === 'berg') continue
    for (const k of strassenKanten(b, i, j)) for (let t = 0; t <= 5; t++) for (const q of [-0.13, 0, 0.13]) {
      p.push([i + 0.5 + [0, 1, 0, -1][k] * t * 0.1 + [1, 0, 1, 0][k] * q, j + 0.5 + [-1, 0, 1, 0][k] * t * 0.1 + [0, 1, 0, 1][k] * q])
    }
  }
  return p
}

/**
 * Die Objekte des Bretts (Bäume, Büsche, Felsen, Gipfel, Häuser) nach festem Zufall je Feld. Kein Objekt verdeckt ein offenes Gleis: der Kasten,
 * den sein Bild über dem Fusspunkt einnimmt, bleibt frei von Gleispunkten. Im Wald dicht, am Rand lockerer, auf der Fuge zwischen zwei Waldfeldern
 * weitere Bäume; über zusammenhängenden Bergen grosse und kleine Gipfel, über einem Tunnel ein kleiner; je Dorf höchstens eine Kapelle, die
 * Scheune eher am Rand (alles gewählt)
 */
export function objekteBauen(b: Brett, imTunnel: (b: Brett, x: number, y: number) => boolean): Objekt[] {
  const sp = spalten(b), ze = zeilen(b)
  const gp = gleisPunkte(b, imTunnel)
  const grund = (i: number, j: number) => (i >= 0 && j >= 0 && i < sp && j < ze ? b[j][i].grund : null)
  const raus: Objekt[] = []
  const wieseDicht = Math.min(1, 900 / (sp * ze))
  // die Gleispunkte je Feld, damit grosse Bretter (bis 192 × 108) schnell bleiben
  const raster = new Map<string, Array<[number, number]>>()
  for (const q of gp) { const k = `${Math.floor(q[0])},${Math.floor(q[1])}`; const l = raster.get(k); if (l) l.push(q); else raster.set(k, [q]) }
  const frei = (x: number, y: number, bb: number, h: number) => {
    const x0 = x - bb / 2 - 0.05, x1 = x + bb / 2 + 0.05, y0 = y - h - 0.03, y1 = y + 0.1
    for (let u = Math.floor(x0); u <= Math.floor(x1); u++) for (let v = Math.floor(y0); v <= Math.floor(y1); v++) {
      for (const [px, py] of raster.get(`${u},${v}`) ?? []) if (px > x0 && px < x1 && py > y0 && py < y1) return false
    }
    return true
  }
  const setze = (name: string, x: number, y: number, s: number, z: number, pruefen = true) => {
    const bb = (BREITE[name] ?? 0.2) * s
    x = Math.max(bb / 2 + 0.03, Math.min(sp - bb / 2 - 0.03, x)) // nicht über den Rand des Bretts
    if (pruefen && !frei(x, y, bb, hoehe(name, bb))) return
    raus.push({ name, x, y, b: bb, spiegeln: z < 0.5 })
  }
  // je Dorf (zusammenhängende Dorffelder) das Feld mit der Kapelle
  const kapelle = new Set<string>()
  const gesehen = new Set<string>()
  for (let j = 0; j < ze; j++) for (let i = 0; i < sp; i++) {
    if (grund(i, j) !== 'dorf' || gesehen.has(`${i},${j}`)) continue
    const dorf: Array<[number, number]> = [], offen: Array<[number, number]> = [[i, j]]
    gesehen.add(`${i},${j}`)
    while (offen.length) {
      const [u, v] = offen.pop()!
      dorf.push([u, v])
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${u + du},${v + dv}`
        if (grund(u + du, v + dv) === 'dorf' && !gesehen.has(k)) { gesehen.add(k); offen.push([u + du, v + dv]) }
      }
    }
    dorf.sort((a, c) => zufall(a[0], a[1], 90) - zufall(c[0], c[1], 90))
    kapelle.add(`${dorf[0][0]},${dorf[0][1]}`)
  }
  for (let j = 0; j < ze; j++) for (let i = 0; i < sp; i++) {
    const f = b[j][i], z = (k: number) => zufall(i, j, k)
    const rand = [grund(i, j - 1), grund(i + 1, j), grund(i, j + 1), grund(i - 1, j)].filter((g) => g !== f.grund).length
    // Kirche und Bauernhof, von Hand gesetzt, allein im Feld
    if (f.objekt && !f.gleis) { setze(f.objekt === 'kirche' ? 'gb_obj_kirche_01' : 'gb_obj_bauernhof_01', i + 0.5, j + 0.86, 1, z(1), false); continue }
    if (f.grund === 'schnee') {
      // im Schnee ein paar verschneite Tannen (gewählt)
      for (let k = 0; k < 3; k++) if (z(k) < 0.4) setze('gb_obj_nadelbaum_schnee_01', i + 0.18 + k * 0.32 + (z(k + 5) - 0.5) * 0.1, j + 0.35 + z(k + 10) * 0.55, 0.85 + z(k + 15) * 0.3, z(k + 20))
      continue
    }
    if (f.grund === 'wald') {
      for (let k = 0; k < 9; k++) {
        const x = i + 0.12 + z(k) * 0.76, y = j + 0.22 + z(k + 20) * 0.74
        const amRand = x - i < 0.25 && grund(i - 1, j) !== 'wald' || i + 1 - x < 0.25 && grund(i + 1, j) !== 'wald'
          || y - j < 0.3 && grund(i, j - 1) !== 'wald' || j + 1 - y < 0.2 && grund(i, j + 1) !== 'wald'
        if (amRand && z(k + 40) < 0.45) continue
        const art = z(k + 60), name = art < 0.15 ? waehle(BUSCH, z(k + 80)) : art < 0.5 ? waehle(NADEL, z(k + 80)) : waehle(LAUB, z(k + 80))
        setze(name, x, y, (amRand ? 0.8 : 0.85) + z(k + 100) * 0.3, z(k + 120))
      }
      // auf der Fuge zum Waldfeld im Osten und Süden
      if (grund(i + 1, j) === 'wald') for (let k = 0; k < 2; k++) setze(waehle([...LAUB, ...NADEL], z(140 + k)), i + 1 + (z(142 + k) - 0.5) * 0.12, j + 0.35 + k * 0.4, 0.9 + z(144 + k) * 0.2, z(146 + k))
      if (grund(i, j + 1) === 'wald') for (let k = 0; k < 2; k++) setze(waehle([...LAUB, ...NADEL], z(150 + k)), i + 0.3 + k * 0.4, j + 1 + (z(152 + k) - 0.5) * 0.1, 0.9 + z(154 + k) * 0.2, z(156 + k))
    } else if (f.grund === 'berg') {
      if (f.gleis || f.teil) {
        // über dem Tunnel ein kleiner Gipfel, nur wo im Feld kein Portal steht (sonst verdeckt er es); der Fels deckt das Gleis
        const kanten = f.gleis && !grosseKurve(f.gleis) ? [...new Set(wege(f.gleis).flat())].filter((k) => k >= 0) : []
        if (!f.teil && !grosseKurve(f.gleis) && kanten.every((k) => tunnelWeiter(b, i, j, k))) setze(waehle(KLEIN, z(1)), i + 0.5 + (z(2) - 0.5) * 0.1, j + 0.52, 0.85, z(3))
      } else {
        setze(z(1) < 0.65 ? waehle(GROSS, z(2)) : waehle(KLEIN, z(2)), i + 0.5 + (z(3) - 0.5) * 0.16, j + 0.8, 0.9 + z(4) * 0.15, z(5))
        if (grund(i + 1, j) === 'berg' && !b[j][i + 1].gleis && z(6) < 0.6) setze(waehle(KLEIN, z(7)), i + 1, j + 0.45, 0.8, z(8))
      }
      if (z(9) < 0.5) setze(waehle(FELS, z(10)), i + 0.15 + z(11) * 0.7, j + 0.9, 0.9 + z(12) * 0.3, z(13))
      if (rand && z(14) < 0.5) setze(waehle(NADEL, z(15)), i + 0.12 + z(16) * 0.76, j + 0.93, 0.9, z(17))
    } else if (f.grund === 'dorf') {
      const mitKapelle = kapelle.has(`${i},${j}`)
      for (let k = 0; k < 3; k++) {
        const x = i + 0.22 + k * 0.28 + (z(k) - 0.5) * 0.06, y = j + 0.38 + z(k + 5) * 0.5
        const name = mitKapelle && k === 1 ? 'gb_obj_haus_06' : rand && z(k + 30) < 0.25 ? 'gb_obj_haus_04' : waehle(HAEUSER, z(k + 11))
        setze(name, x, y, 0.95 + z(k + 20) * 0.1, z(k + 40))
      }
      if (z(60) < 0.5) setze(waehle(LAUB, z(61)), i + 0.12 + z(62) * 0.76, j + 0.93, 0.85, z(63))
    } else if (f.grund === 'wiese') {
      // auf grossen Brettern weniger Schmuck auf der Wiese, sonst wird das Bild zu langsam (bis 900 Felder wie bisher, gewählt)
      if (z(18) > wieseDicht) continue
      if (z(1) < 0.25) setze(waehle(BUSCH, z(2)), i + 0.15 + z(3) * 0.7, j + 0.25 + z(4) * 0.65, 0.9 + z(5) * 0.3, z(6))
      if (z(7) < 0.12) setze(waehle(LAUB, z(8)), i + 0.15 + z(9) * 0.7, j + 0.35 + z(10) * 0.55, 0.9 + z(11) * 0.2, z(12))
      if (z(13) < 0.06) setze(waehle(FELS, z(14)), i + 0.15 + z(15) * 0.7, j + 0.3 + z(16) * 0.6, 0.9, z(17))
    }
  }
  return raus.sort((a, c) => a.y - c.y)
}

/** ein Objekt mit Schatten, der Fusspunkt unten in der Mitte */
export function ObjektBild({ o }: { o: Objekt }) {
  const h = hoehe(o.name, o.b)
  return (
    <g>
      <ellipse cx={o.x + 0.015} cy={o.y + 0.01} rx={o.b * 0.42} ry={o.b * 0.11} fill="rgba(0,0,0,.18)" />
      <image href={bild(o.name)} x={-o.b / 2} y={-h} width={o.b} height={h} preserveAspectRatio="none"
             transform={`translate(${o.x} ${o.y})${o.spiegeln ? ' scale(-1 1)' : ''}`} />
    </g>
  )
}

/**
 * Ein Tunnelportal am Punkt (x, y). Süd, West und Ost als Bild, so gross, dass die Öffnung 0,36
 * Felder misst; Nord fehlt noch (das Bild hatte das Schachbrett mitgemalt), dort vorerst ein schlichtes Portal
 */
export function PortalBild({ x, y, oben }: { x: number; y: number; oben?: boolean }) {
  // in jeder Richtung dasselbe Portal von vorne (Michael, 2026-11-23: «Eigentlich reicht es, wenn wir nur immer das gleiche Tunnelportal verwenden»):
  // die Unterkante der Öffnung am Punkt, die Öffnung 0,3 Felder weit, das Portal höchstens 0,62 breit (gewählt)
  const name = 'gb_bau_tunnelportal_s', m = masse(name)
  if (!m?.oeffnung) return null
  const [ox0, , ox1, oy1] = m.oeffnung
  const s = Math.min(0.3 / (ox1 - ox0), 0.62 / m.w)
  // führt das Gleis nach Norden aus dem Berg, steht das Portal auf dem Kopf, offen nach oben (Michael, 2026-11-24: «Das Portal muss gegen oben offen sein»)
  return <image href={bild(name)} x={x - ((ox0 + ox1) / 2) * s} y={y - oy1 * s + 0.06} width={m.w * s} height={m.h * s} preserveAspectRatio="none"
                transform={oben ? `rotate(180 ${x} ${y})` : undefined} />
}

/** Farben und Breite der Strassen (gewählt) */
const STRASSE_B = 0.24, BELAG = '#8f9096', RAND = '#e9e6dc'

/** der Weg der Strasse in einem Feld: von der Mitte zu jeder Kante, eine Kurve über Eck als Viertelkreis wie die Gleise */
function strassenWeg(brett: Brett, i: number, j: number, k: number[]): string {
  const cx = i + 0.5, cy = j + 0.5
  // in ein Dorf hinein reicht die Strasse ein Stück über die Kante
  const lang = (r: number) => brett[j + [-1, 0, 1, 0][r]]?.[i + [0, 1, 0, -1][r]]?.grund === 'dorf' && !brett[j + [-1, 0, 1, 0][r]][i + [0, 1, 0, -1][r]].strasse ? 0.72 : 0.5
  const kante = (r: number, l: number) => ({ x: cx + [0, l, 0, -l][r], y: cy + [-l, 0, l, 0][r] })
  if (k.length === 2 && (k[0] + k[1]) % 2 === 1 && !brett[j][i].wende) {
    // eine Kurve als Viertelkreis um die Ecke des Felds wie die Gleise (Michael, 2026-11-25: «wenn die Kurven so schön viertelrund sind wie die Gleise»)
    const a = kante(k[0], 0.5), e = kante(k[1], 0.5), m = { x: a.x + e.x - cx, y: a.y + e.y - cy }
    const sweep = (a.x - m.x) * (e.y - m.y) - (a.y - m.y) * (e.x - m.x) > 0 ? 1 : 0
    const a2 = kante(k[0], lang(k[0])), e2 = kante(k[1], lang(k[1]))
    return `M${a2.x},${a2.y} L${a.x},${a.y} A0.5,0.5 0 0 ${sweep} ${e.x},${e.y} L${e2.x},${e2.y}`
  }
  return k.map((r) => { const p = kante(r, lang(r)); return `M${cx},${cy} L${p.x},${p.y}` }).join(' ')
}
const STRASSE_DECK = '#d6d6d6', STRASSE_GELAENDER = '#7a7a7a', TUNNEL_DUNKEL = '#2e2e30', HALT_GELB = '#f2c230'

/**
 * die Strassen aller Felder mit hellem Rand und gestrichelter Mitte; seit 2026-11-25 (Michael: «Gerne alle»): über Wasser, Fluss oder als Strassenbrücke
 * auf einer Brücke mit Geländer, im Berg ein Tunnel (nur angedeutet, mit Portalen), ein Wendeplatz als runder Platz, eine Haltestelle mit Wartehäuschen
 * und gelber Markierung; über ein Gleis führt die Strassenbrücke darüber (StrassenUeberBild). Alles gewählt
 */
export function StrassenBild({ brett }: { brett: Brett }) {
  const teile: string[] = [], deck: string[] = [], tunnel: string[] = []
  const extra: ReactElement[] = []
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const k = strassenKanten(brett, i, j)
    if (!k.length) continue
    const f = brett[j][i], d = strassenWeg(brett, i, j, k)
    if (strasseUeberGleis(f)) continue
    if (f.grund === 'berg') {
      tunnel.push(d)
      // ein Portal, wo die Strasse aus dem Berg kommt
      for (const r of k) {
        const n = brett[j + [-1, 0, 1, 0][r]]?.[i + [0, 1, 0, -1][r]]
        if (!n || n.grund === 'berg') continue
        const x = i + 0.5 + [0, 0.44, 0, -0.44][r], y = j + 0.5 + [-0.44, 0, 0.44, 0][r], quer = r % 2 === 0
        const bw = STRASSE_B + 0.12, bt = 0.1
        extra.push(<rect key={`p${i},${j},${r}`} x={x - (quer ? bw : bt) / 2} y={y - (quer ? bt : bw) / 2} width={quer ? bw : bt} height={quer ? bt : bw} rx={0.03}
                         fill={TUNNEL_DUNKEL} stroke="#8f9398" strokeWidth={0.025} />)
      }
      continue
    }
    teile.push(d)
    if (strasseAlsBruecke(f)) deck.push(d)
    if (f.wende) extra.push(<circle key={`w${i},${j}`} cx={i + 0.5} cy={j + 0.5} r={0.27} fill={BELAG} stroke={RAND} strokeWidth={0.04} />)
    if (f.haltestelle && strasseGerade(brett, i, j)) {
      // Wartehäuschen auf der rechten Seite, gelbe Markierung auf der Spur davor (Seite gewählt)
      const waag = k.includes(1)
      const hx = waag ? i + 0.5 : i + 0.5 + STRASSE_B / 2 + 0.1, hy = waag ? j + 0.5 + STRASSE_B / 2 + 0.1 : j + 0.5
      extra.push(
        <g key={`h${i},${j}`}>
          <rect x={waag ? i + 0.32 : i + 0.5 + 0.005} y={waag ? j + 0.5 + 0.005 : j + 0.32} width={waag ? 0.36 : STRASSE_B / 2 - 0.02} height={waag ? STRASSE_B / 2 - 0.02 : 0.36}
                fill="none" stroke={HALT_GELB} strokeWidth={0.025} />
          <rect x={hx - (waag ? 0.14 : 0.05)} y={hy - (waag ? 0.05 : 0.14)} width={waag ? 0.28 : 0.1} height={waag ? 0.1 : 0.28} rx={0.02} fill="#6a6a6a" />
          <rect x={hx - (waag ? 0.12 : 0.03)} y={hy - (waag ? 0.03 : 0.12)} width={waag ? 0.24 : 0.06} height={waag ? 0.06 : 0.24} rx={0.015} fill="#9aa3a8" />
          <circle cx={waag ? i + 0.2 : hx} cy={waag ? hy : j + 0.2} r={0.045} fill={HALT_GELB} stroke="#5a5a5a" strokeWidth={0.015} />
        </g>,
      )
    }
  }
  if (!teile.length && !tunnel.length) return null
  const d = teile.join(' '), dd = deck.join(' ')
  return (
    <g pointerEvents="none">
      {dd && <path d={dd} stroke={STRASSE_GELAENDER} strokeWidth={STRASSE_B + 0.14} fill="none" />}
      {dd && <path d={dd} stroke={STRASSE_DECK} strokeWidth={STRASSE_B + 0.1} fill="none" />}
      {tunnel.length > 0 && <path d={tunnel.join(' ')} stroke={TUNNEL_DUNKEL} strokeWidth={STRASSE_B * 0.55} strokeDasharray="0.08 0.06" fill="none" opacity={0.35} />}
      {d && <path d={d} stroke={RAND} strokeWidth={STRASSE_B + 0.04} strokeLinecap="round" fill="none" />}
      {d && <path d={d} stroke={BELAG} strokeWidth={STRASSE_B} strokeLinecap="round" fill="none" />}
      {extra}
      {d && <path d={d} stroke="#ffffff" strokeWidth={0.018} strokeDasharray="0.06 0.06" fill="none" opacity={0.8} />}
    </g>
  )
}

/** die Strassenbrücken über einem Gleis, über den Zügen gezeichnet: Schatten, Brücke mit Geländer, darauf die Strasse */
export function StrassenUeberBild({ brett }: { brett: Brett }) {
  const l: string[] = []
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const f = brett[j][i]
    if (!strasseUeberGleis(f)) continue
    l.push(f.gleis!.dreh % 2 === 0 ? `M${i},${j + 0.5} L${i + 1},${j + 0.5}` : `M${i + 0.5},${j} L${i + 0.5},${j + 1}`)
  }
  if (!l.length) return null
  const d = l.join(' ')
  return (
    <g pointerEvents="none">
      <path d={d} stroke="#000000" strokeOpacity={0.22} strokeWidth={STRASSE_B + 0.14} fill="none" transform="translate(0.04 0.05)" />
      <path d={d} stroke={STRASSE_GELAENDER} strokeWidth={STRASSE_B + 0.14} fill="none" />
      <path d={d} stroke={STRASSE_DECK} strokeWidth={STRASSE_B + 0.1} fill="none" />
      <path d={d} stroke={BELAG} strokeWidth={STRASSE_B} fill="none" />
      <path d={d} stroke="#ffffff" strokeWidth={0.018} strokeDasharray="0.06 0.06" fill="none" opacity={0.8} />
    </g>
  )
}

/** ein Bus von oben: Kasten in seiner Farbe, helles Dach, Fensterband und Frontscheibe (gewählt) */
export function BusBild({ x, y, w, farbe }: { x: number; y: number; w: number; farbe: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${(w * 180) / Math.PI})`} pointerEvents="none">
      <rect x={-0.165} y={-0.062} width={0.33} height={0.124} rx={0.03} fill="#000000" opacity={0.2} transform="translate(0.015 0.02)" />
      <rect x={-0.165} y={-0.062} width={0.33} height={0.124} rx={0.03} fill={farbe} stroke="#3a3a3a" strokeWidth={0.012} />
      <rect x={-0.14} y={-0.064} width={0.24} height={0.022} rx={0.008} fill="#2e3a44" />
      <rect x={-0.14} y={0.042} width={0.24} height={0.022} rx={0.008} fill="#2e3a44" />
      <rect x={-0.12} y={-0.035} width={0.21} height={0.07} rx={0.015} fill="#ffffff" opacity={0.35} />
      <rect x={0.118} y={-0.05} width={0.034} height={0.1} rx={0.012} fill="#2e3a44" />
    </g>
  )
}

/**
 * Schranken an den Bahnübergängen: je Seite des Gleises ein Mast am Rand der Strasse und ein rot-weisser Baum, der sich schliesst, wenn ein Wagen
 * näher als SCHRANKE_ZU Felder ist, und erst wieder öffnet, wenn alle weiter weg sind; dazwischen gleitend. Von oben gesehen wird ein offener Baum
 * kurz (er steht senkrecht). Alles gewählt
 */
const SCHRANKE_ZU = 1.3, SCHRANKE_AUF = 1.9
export function SchrankenBild({ brett, wagen }: { brett: Brett; wagen: Array<{ x: number; y: number }> }) {
  const raus: ReactElement[] = []
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const f = brett[j][i]
    if (!f.strasse || f.gleis?.art !== 'gerade' || f.strBruecke || f.bruecke) continue
    const cx = i + 0.5, cy = j + 0.5
    const d = Math.min(9, ...wagen.map((w) => Math.hypot(w.x - cx, w.y - cy)))
    const zu = Math.max(0, Math.min(1, (SCHRANKE_AUF - d) / (SCHRANKE_AUF - SCHRANKE_ZU)))
    // die Strasse quer zum Gleis; die Bäume liegen parallel zum Gleis, auf der Strasse
    const gleisSenkrecht = f.gleis.dreh % 2 === 0
    for (const seite of [-1, 1]) {
      // Mast am Rand der Strasse, Baum über die halbe Strasse
      const along = seite * 0.3 // Abstand vom Gleis entlang der Strasse
      const mast = gleisSenkrecht ? { x: cx + along, y: cy - seite * (STRASSE_B / 2 + 0.03) } : { x: cx - seite * (STRASSE_B / 2 + 0.03), y: cy + along }
      const lang = 0.03 + zu * (STRASSE_B + 0.01)
      const richtung = gleisSenkrecht ? { x: 0, y: seite } : { x: seite, y: 0 }
      const ende = { x: mast.x + richtung.x * lang, y: mast.y + richtung.y * lang }
      raus.push(
        <g key={`${i},${j},${seite}`}>
          <line x1={mast.x} y1={mast.y} x2={ende.x} y2={ende.y} stroke="#ffffff" strokeWidth={0.045} strokeLinecap="round" />
          <line x1={mast.x} y1={mast.y} x2={ende.x} y2={ende.y} stroke="#c8102e" strokeWidth={0.045} strokeDasharray="0.04 0.04" />
          <circle cx={mast.x} cy={mast.y} r={0.035} fill="#3a3a3c" />
          {zu > 0.05 && <circle cx={mast.x} cy={mast.y} r={0.02} fill="#ff3b30" />}
        </g>,
      )
    }
  }
  return <g pointerEvents="none">{raus}</g>
}
