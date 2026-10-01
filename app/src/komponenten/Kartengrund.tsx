import { useEffect, useId, useState } from 'react'
import { bodenbedeckungLaden, kartengrundLaden } from '../daten'
import { useVersteckt } from './Sehenswert'
import type { BodenbedeckungDaten, KartengrundDaten, KodierterZug } from '../typen'
import { kurve, LAENGE_ZU_BREITE, pfad, type Box } from './Netzkarte'
import { imBild, type Kachel, kachelnImBild, kachelPfad, type Schicht, schichtBauen, type Stueck, stueckeln } from '../kacheln'

/**
 * Der Grund der Karten (Michael, 2026-09-27: «den weissen Hintergrund
 * langweilig»): (1) das Ausland leicht grau, die Kantone fein umrandet,
 * (2) die breiteren Flüsse, (3) Höhenstufen ab 1000, 2000 und 3000 m als flache
 * Töne. Michael, 2026-09-27: «alle drei, Gebiete heller».
 */

interface Zug { d: string; x0: number; x1: number; y0: number; y1: number }
interface Fluss extends Zug { k: number; name?: string; pts: Array<[number, number]>; stuecke: Stueck[] }
interface Grund {
  /** die Schweiz als Fläche, für das Ausland je Kachel */
  land: Schicht
  /** Landes- und Kantonsgrenzen in kurzen Stücken */
  grenze: Stueck[]
  kantone: Stueck[]
  fluesse: Fluss[]
  hoehen: Array<{ ab: number; schicht: Schicht }>
}

let vorrat: Grund | null = null
let laden: Promise<Grund> | null = null

function punkteLesen(z: KodierterZug, faktor = 1e5) {
  let [la, lo] = z.start
  const pts: Array<[number, number]> = [[lo / faktor * LAENGE_ZU_BREITE, -la / faktor]]
  for (let i = 0; i < z.d.length; i += 2) {
    la += z.d[i]; lo += z.d[i + 1]
    pts.push([lo / faktor * LAENGE_ZU_BREITE, -la / faktor])
  }
  return pts
}

function zugAus(pts: Array<[number, number]>, zu: boolean, rund = false): Zug {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  return { d: rund ? kurve(pts) : pfad(pts) + (zu ? 'Z' : ''), x0, x1, y0, y1 }
}

/** ein Ring als offene Linie, die zum Anfang zurückführt, in Stücken */
const ringStuecke = (pts: Array<[number, number]>) => stueckeln([...pts, pts[0]], (q) => pfad(q as Array<[number, number]>))

function lesen(d: KartengrundDaten): Grund {
  const land = d.land.map((r) => punkteLesen(r))
  return {
    land: schichtBauen(land),
    grenze: land.flatMap(ringStuecke),
    kantone: d.kanton.flatMap((r) => ringStuecke(punkteLesen(r))),
    fluesse: d.fluesse.map((f) => {
      const pts = punkteLesen(f)
      return { ...zugAus(pts, false, true), k: f.k, name: f.name, pts, stuecke: stueckeln(pts, (q) => kurve(q)) }
    }),
    hoehen: d.hoehen.map((s) => ({ ab: s.ab_m, schicht: schichtBauen(s.ringe.map((r) => punkteLesen(r))) })),
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
interface Boden { wald: Schicht; siedlung: Schicht }
let bodenVorrat: Boden | null = null
let bodenLaden: Promise<Boden> | null = null

function bodenLesen(d: BodenbedeckungDaten): Boden {
  const f = d.faktor
  return { wald: schichtBauen(d.wald.map((r) => punkteLesen(r, f))),
           siedlung: schichtBauen(d.siedlung.map((r) => punkteLesen(r, f))) }
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

/** alle Kacheln einer Schicht als ein Pfad: so gibt es an den Kachelrändern keine feinen Fugen */
const kachelnPfad = (s: Schicht, kacheln: Kachel[]) => kacheln.map((k) => kachelPfad(s, k)).join('')

/** Unter allen anderen Ebenen zeichnen */
export function KartengrundEbene({ grund, box, verh = 1.6 }: { grund: Grund | null; box: Box; verh?: number }) {
  const boden = useBoden()
  const aus = useVersteckt()
  if (!grund) return null
  const h = box.w / verh
  const kacheln = kachelnImBild(box, h)
  // je Kachel ihr Rechteck mit der Schweiz als Loch: das Ausland
  const ausland = kacheln.map((k) => `M${k.x0} ${k.y0}h${k.g}v${k.g}h${-k.g}Z${kachelPfad(grund.land, k)}`).join('')
  return (
    <g aria-hidden="true">
      {grund.hoehen.map((s, i) => (
        <path key={`h${s.ab}`} d={kachelnPfad(s.schicht, kacheln)}
              fillRule="evenodd" className={['fill-hoehe-1', 'fill-hoehe-2', 'fill-hoehe-3'][i]} />
      ))}
      {/* Siedlung und Wald über den Höhenstufen, leicht durchscheinend */}
      {boden && !aus.has('boden') && ([['siedlung', 'fill-siedlung'], ['wald', 'fill-wald']] as const).map(([k, klasse]) => (
        <path key={k} d={kachelnPfad(boden[k], kacheln)} fillRule="evenodd" className={klasse} />
      ))}
      <path d={ausland} fillRule="evenodd" className="fill-ausland" />
      <path d={grund.kantone.filter((z) => imBild(z, box, h)).map((z) => z.d).join('')} fill="none" strokeWidth={0.75}
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="stroke-kantonsgrenze" />
      <path d={grund.grenze.filter((z) => imBild(z, box, h)).map((z) => z.d).join('')} fill="none" strokeWidth={1.2}
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="stroke-landesgrenze" />
      {([[4, 2], [5, 1.3], [6, 1]] as const).map(([k, breite]) => (
        <path key={`f${k}`} d={grund.fluesse.filter((f) => (k === 4 ? f.k <= 4 : f.k === k) && imBild(f, box, h))
                                 .flatMap((f) => f.stuecke.filter((z) => imBild(z, box, h)).map((z) => z.d)).join('')}
              fill="none" strokeWidth={breite} strokeLinejoin="round" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" className="stroke-fluss" />
      ))}
    </g>
  )
}

export type Feld = [number, number, number, number]
const FLUSS_SCHRIFT = 10

/**
 * Flussnamen entlang des Flusses (Michael, 2026-10-01: «Flüsse beschriften»), der
 * Name wie in swissTLMRegio. Je Name höchstens einmal im Bild, an der längsten
 * sichtbaren Strecke, nur wo der Fluss dort etwa so gerade ist wie der Name lang.
 */
export function FlussNamen({ grund, box, px, belegt = [], verh = 1.6 }: {
  grund: Grund | null; box: Box; px: number; belegt?: Feld[]; verh?: number
}) {
  const id = useId()
  if (!grund) return null
  const h = box.w / verh
  const [vx0, vx1] = [box.cx - box.w * 0.46, box.cx + box.w * 0.46]
  const [vy0, vy1] = [box.cy - h * 0.44, box.cy + h * 0.44]
  const namen = flussNamenSetzen(
    grund.fluesse.filter((f) => f.x1 > vx0 && f.x0 < vx1 && f.y1 > vy0 && f.y0 < vy1),
    ([x, y]) => x > vx0 && x < vx1 && y > vy0 && y < vy1, FLUSS_SCHRIFT * px, [...belegt])
  return (
    <g aria-hidden="true">
      {namen.map((n, i) => (
        <g key={n.name}>
          <path id={`${id}f${i}`} d={kurve(n.pts)} fill="none" />
          {/* erst die Kontur aller Buchstaben, dann die Schrift: auf einer Kurve malt der
              Browser sonst Buchstabe für Buchstabe, und die Kontur deckt den vorigen an
              (Michael, 2026-10-01) */}
          {[true, false].map((kontur) => (
            <text key={String(kontur)} fontSize={FLUSS_SCHRIFT * px} fontStyle="italic" dy={-0.35 * FLUSS_SCHRIFT * px}
                  className={kontur ? 'fill-see-halo stroke-see-halo' : 'fill-see-name'}
                  // in Kartenmass: auf einem Schriftbogen gilt non-scaling-stroke nicht, 2 hiess
                  // dort 2 Grad, ein weisser Fleck über der halben Karte (Michael, 2026-10-01)
                  strokeWidth={kontur ? 2 * px : undefined} strokeLinejoin="round">
              <textPath href={`#${id}f${i}`} startOffset="50%" textAnchor="middle">{n.name}</textPath>
            </text>
          ))}
        </g>
      ))}
    </g>
  )
}

/**
 * Wo die Flussnamen stehen: je Name höchstens einmal, die grossen Flüsse zuerst, an
 * der längsten sichtbaren Strecke, nur wo der Fluss dort etwa so gerade ist wie der
 * Name lang und nichts in felder verdeckt. lesen: die Richtung, in der die Schrift
 * von links nach rechts läuft (auf dem gedrehten Fahrtblatt mitgedreht).
 */
export function flussNamenSetzen(
  fluesse: ReadonlyArray<{ name?: string; k: number; pts: ReadonlyArray<readonly [number, number]> }>,
  drin: (p: readonly [number, number]) => boolean, schrift: number, felder: Feld[],
  lesen: readonly [number, number] = [1, 0],
) {
  type P = readonly [number, number]
  const gesetzt = new Set<string>()
  const raus: Array<{ name: string; pts: P[] }> = []
  const zaehle = (q: P[]) => q.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - q[i][0], p[1] - q[i][1]), 0)
  for (const f of [...fluesse].filter((f) => f.name).sort((a, b) => a.k - b.k)) {
    if (gesetzt.has(f.name!)) continue
    const laenge = schriftBreite(f.name!) * schrift * 1.1
    // die längste sichtbare Strecke
    let best: P[] = [], lauf: P[] = []
    for (const p of [...f.pts, null]) {
      if (p && drin(p)) { lauf.push(p); continue }
      if (zaehle(lauf) > zaehle(best)) best = lauf
      lauf = []
    }
    const ganz = zaehle(best)
    if (ganz < laenge * 1.3) continue
    // das Stück um die Mitte, so lang wie der Name und etwas mehr
    const stueck = teilstueck(best, ganz / 2 - laenge * 0.6, ganz / 2 + laenge * 0.6)
    const [a, b] = [stueck[0], stueck[stueck.length - 1]]
    // ist der Bogen kürzer als der Name, fallen am Ende Buchstaben weg
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < laenge * 0.95) continue
    const xs = stueck.map((p) => p[0]), ys = stueck.map((p) => p[1])
    const r = schrift * 0.7
    const feld: Feld = [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r]
    if (felder.some((g) => g[0] < feld[2] && feld[0] < g[2] && g[1] < feld[3] && feld[1] < g[3])) continue
    felder.push(feld)
    gesetzt.add(f.name!)
    // die Schrift auf einem sanften Bogen durch Anfang, Mitte und Ende: folgt sie jeder
    // Windung, drängen sich die Buchstaben und verdecken einander
    const mitte = teilstueck(stueck, laenge * 0.6, laenge * 0.6)[0] ?? a
    const bogen = [a, mitte, b]
    const vorwaerts = (b[0] - a[0]) * lesen[0] + (b[1] - a[1]) * lesen[1] >= 0
    raus.push({ name: f.name!, pts: vorwaerts ? bogen : [...bogen].reverse() })
  }
  return raus
}

/** Breite eines Namens in Schriftgrössen, je Buchstabe geschätzt (kursive Helvetica) */
function schriftBreite(name: string) {
  let b = 0
  for (const z of name) {
    b += /[mwMW]/.test(z) ? 0.85 : /[iljftrI.' ]/.test(z) ? 0.3 : /[A-ZÄÖÜ]/.test(z) ? 0.68 : 0.55
  }
  return b
}

/** Der Teil einer Linie zwischen zwei Abständen vom Anfang */
function teilstueck(q: ReadonlyArray<readonly [number, number]>, von: number, bis: number) {
  const raus: Array<readonly [number, number]> = []
  let s = 0
  for (let i = 1; i < q.length; i++) {
    const [a, b] = [q[i - 1], q[i]]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    const bei = (t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    if (!raus.length && s + l >= von) raus.push(bei(l ? (von - s) / l : 0))
    if (raus.length && s + l >= bis) { raus.push(bei(l ? (bis - s) / l : 0)); break }
    if (raus.length && s + l < bis) raus.push(b)
    s += l
  }
  return raus
}
