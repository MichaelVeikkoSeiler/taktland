/**
 * Gleisbau mit den Bildern von ChatGPT (Michael, 2026-11-22/23: abgestimmt mit ChatGPT, «Ich würde gerne mal testen»): Grund, Texturen und Objekte
 * als Bilder, Gleise, Ufer, Waldrand, Felsgebiet und Schatten im Programm. Die Bilder liegen in src/assets/gleisbau (aus Michaels PNG zugeschnitten,
 * gesäubert und verkleinert), ihre Masse in src/assets/gleisbau-masse.json. Lage, Auswahl und Grösse der Objekte nach festem Zufall je Feld.
 * Ein Baukasten, keine Wirklichkeit: alle Masse und Regeln gewählt.
 */
import { type Brett, type Feld, flussKanten, grosseKurve, grossGeometrie, istBahnhof, spalten, strassenKanten, type Stueck, tunnelWeiter, wege, wegPunkte, zeilen } from '../gleisbau'
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
  const sp = spalten(b), ze = zeilen(b)
  const gleich = (i: number, j: number) => i >= 0 && j >= 0 && i < sp && j < ze && b[j][i].grund === grund
  const teile: string[] = []
  for (let j = 0; j < ze; j++) for (let i = 0; i < sp; i++) {
    if (b[j][i].grund !== grund) continue
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const cx = i + (sx < 0 ? 1 : 0), cy = j + (sy < 0 ? 1 : 0)
      const ex = gleich(i - sx, j) ? 0 : e, ey = gleich(i, j - sy) ? 0 : e
      const P = (u: number, v: number) => `${(cx + sx * u).toFixed(3)},${(cy + sy * v).toFixed(3)}`
      let d: string
      if (ex > 0 && ey > 0) {
        const r = Math.min(RUND, 0.5 - ex, 0.5 - ey)
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
          // je Stück von der Mitte zur Kante, gerade Enden am Rand des Felds, in der Mitte ein Kreis für die Biegung
          for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
            const k = flussKanten(brett, i, j)
            for (const e of k) {
              // in einen See läuft der Fluss über das Ufer hinein (Michael, 2026-11-24: «Wäre schön wenn sich Fluss mit See verbinden liesse»), gewählt
              const see = brett[j + [-1, 0, 1, 0][e]]?.[i + [0, 1, 0, -1][e]]?.grund === 'wasser'
              const zu = (l: number) => `M${i + 0.5},${j + 0.5} L${i + 0.5 + [0, l, 0, -l][e]},${j + 0.5 + [-l, 0, l, 0][e]}`
              d.push(zu(see ? 0.62 : 0.5)); dw.push(zu(see ? 0.7 : 0.5))
            }
            if (k.length) m.push(`M${i + 0.5},${j + 0.5} l0,0`)
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

/** die Strassen aller Felder: von der Mitte zu jeder Kante, an der sie weiterführt, mit hellem Rand und gestrichelter Mitte */
export function StrassenBild({ brett }: { brett: Brett }) {
  const teile: string[] = []
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const k = strassenKanten(brett, i, j)
    if (!k.length) continue
    const cx = i + 0.5, cy = j + 0.5
    // in ein Dorf hinein reicht die Strasse ein Stück über die Kante
    for (const r of k) {
      const l = brett[j + [-1, 0, 1, 0][r]]?.[i + [0, 1, 0, -1][r]]?.grund === 'dorf' && !brett[j + [-1, 0, 1, 0][r]][i + [0, 1, 0, -1][r]].strasse ? 0.72 : 0.5
      teile.push(`M${cx},${cy} L${cx + [0, l, 0, -l][r]},${cy + [-l, 0, l, 0][r]}`)
    }
  }
  const d = teile.join(' ')
  if (!d) return null
  return (
    <g pointerEvents="none">
      <path d={d} stroke={RAND} strokeWidth={STRASSE_B + 0.04} strokeLinecap="round" fill="none" />
      <path d={d} stroke={BELAG} strokeWidth={STRASSE_B} strokeLinecap="round" fill="none" />
      <path d={d} stroke="#ffffff" strokeWidth={0.018} strokeDasharray="0.06 0.06" fill="none" opacity={0.8} />
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
    if (!f.strasse || f.gleis?.art !== 'gerade') continue
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
