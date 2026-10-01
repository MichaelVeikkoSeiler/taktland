/**
 * Kacheln für die Flächen der Karten (Michael, 2026-10-01: «Die Seen müssen auf
 * jeden Fall sofort angezeigt werden können»). Ein Wald oder eine Höhenstufe ist
 * oft eine einzige Fläche über viele Kilometer; lag ein Zipfel davon im Bild,
 * wurde sie ganz gezeichnet, in der Nahansicht rund 700'000 Zeichen Umriss, und
 * das bei jedem Bild einer Fahrt. Hier wird jede Fläche auf Kacheln zugeschnitten,
 * erst wenn eine Kachel zum ersten Mal ins Bild kommt, und dann behalten. Linien
 * (Grenzen, Flüsse, Ufer) werden in kurze Stücke geteilt, damit nur gezeichnet
 * wird, was im Bild liegt. Nur zum Zeichnen; an den Daten ändert sich nichts.
 */
import type { Box } from './komponenten/Netzkarte'

type P = readonly [number, number]
interface Ring { pts: P[]; x0: number; x1: number; y0: number; y1: number; einfach?: Map<number, P[]> }

/** Kantenlängen der Kacheln in Kartenmass (Grad), fein für die Nahansicht */
const STUFEN = [0.05, 0.2, 0.8]
/**
 * Je gröber die Kacheln, desto weiter weg die Karte: die Umrisse werden vereinfacht
 * (Toleranz g / TOLERANZ_TEIL) und Flächen kleiner als g / KLEIN_TEIL fallen weg. Im
 * Überblick war der Wald sonst ein einziger Pfad von fast 9 Millionen Zeichen, und
 * der Browser zeichnete statt der Karte eine leere Fläche.
 */
const TOLERANZ_TEIL = 100
const KLEIN_TEIL = 25
/** so viele Kacheln höchstens über die Breite des Ausschnitts */
const JE_BREITE = 6

const z = (v: number) => v.toFixed(5)

function ringAus(pts: P[]): Ring {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  return { pts, x0, x1, y0, y1 }
}

/** Eine Flächenebene: alle Ringe und die schon zugeschnittenen Kacheln */
export interface Schicht { ringe: Ring[]; vorrat: Map<string, string> }

export function schichtBauen(ringe: P[][]): Schicht {
  return { ringe: ringe.filter((r) => r.length >= 3).map(ringAus), vorrat: new Map() }
}

/** Sutherland-Hodgman an einer Kante; innen(p) und schnitt(a, b) für diese Kante */
function kante(pts: P[], innen: (p: P) => boolean, schnitt: (a: P, b: P) => P): P[] {
  const raus: P[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[i]
    const ai = innen(a), bi = innen(b)
    if (bi) { if (!ai) raus.push(schnitt(a, b)); raus.push(b) } else if (ai) raus.push(schnitt(a, b))
  }
  return raus
}

function zuschneiden(pts: P[], x0: number, y0: number, x1: number, y1: number): P[] {
  const beiX = (x: number) => (a: P, b: P): P => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])]
  const beiY = (y: number) => (a: P, b: P): P => [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y]
  let q = kante(pts, (p) => p[0] >= x0, beiX(x0))
  if (q.length) q = kante(q, (p) => p[0] <= x1, beiX(x1))
  if (q.length) q = kante(q, (p) => p[1] >= y0, beiY(y0))
  if (q.length) q = kante(q, (p) => p[1] <= y1, beiY(y1))
  return q
}

/** Douglas-Peucker, ohne Rekursion */
function vereinfachen(pts: P[], tol: number): P[] {
  if (pts.length < 5) return pts
  const behalten = new Uint8Array(pts.length)
  behalten[0] = behalten[pts.length - 1] = 1
  const stapel: Array<[number, number]> = [[0, pts.length - 1]]
  while (stapel.length) {
    const [a, b] = stapel.pop()!
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy)
    let best = -1, weit = tol
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i]
      const d = l ? Math.abs(dy * (x - ax) - dx * (y - ay)) / l : Math.hypot(x - ax, y - ay)
      if (d > weit) { best = i; weit = d }
    }
    if (best > 0) { behalten[best] = 1; stapel.push([a, best], [best, b]) }
  }
  // ein Ring braucht auch die Mitte, sonst fällt er bei gleichem Anfang und Ende in sich zusammen
  if (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) behalten[pts.length >> 1] = 1
  return pts.filter((_, i) => behalten[i])
}

function ringBei(r: Ring, g: number): P[] {
  if (g <= STUFEN[0]) return r.pts
  r.einfach ??= new Map()
  let q = r.einfach.get(g)
  if (!q) { q = vereinfachen(r.pts, g / TOLERANZ_TEIL); r.einfach.set(g, q) }
  return q
}

/** Der Umriss einer Kachel als Pfad (für fillRule evenodd), zugeschnitten und behalten */
export function kachelPfad(s: Schicht, k: Kachel): string {
  const schluessel = `${k.g}:${k.ix}:${k.iy}`
  const da = s.vorrat.get(schluessel)
  if (da !== undefined) return da
  const [x0, y0, x1, y1] = [k.ix * k.g, k.iy * k.g, (k.ix + 1) * k.g, (k.iy + 1) * k.g]
  let d = ''
  const klein = k.g > STUFEN[0] ? k.g / KLEIN_TEIL : 0
  for (const r of s.ringe) {
    if (r.x1 < x0 || r.x0 > x1 || r.y1 < y0 || r.y0 > y1) continue
    if (r.x1 - r.x0 < klein && r.y1 - r.y0 < klein) continue
    const pts = ringBei(r, k.g)
    const q = r.x0 >= x0 && r.x1 <= x1 && r.y0 >= y0 && r.y1 <= y1 ? pts : zuschneiden(pts, x0, y0, x1, y1)
    if (q.length < 3) continue
    d += q.map(([x, y], i) => `${i ? 'L' : 'M'}${z(x)} ${z(y)}`).join('') + 'Z'
  }
  s.vorrat.set(schluessel, d)
  return d
}

export interface Kachel { g: number; ix: number; iy: number; x0: number; y0: number }

/** Die Kacheln, die den Ausschnitt mit etwas Rand decken (das Bild zeigt cx ± w/2, cy ± h/2) */
const RAND = 0.75
export function kachelnImBild(box: Box, h: number): Kachel[] {
  const g = STUFEN.find((s) => box.w / s <= JE_BREITE) ?? STUFEN[STUFEN.length - 1]
  const raus: Kachel[] = []
  for (let ix = Math.floor((box.cx - box.w * RAND) / g); ix <= Math.floor((box.cx + box.w * RAND) / g); ix++) {
    for (let iy = Math.floor((box.cy - h * RAND) / g); iy <= Math.floor((box.cy + h * RAND) / g); iy++) {
      raus.push({ g, ix, iy, x0: ix * g, y0: iy * g })
    }
  }
  return raus
}

/** Ein kurzes Stück einer Linie mit seinem Rahmen */
export interface Stueck { d: string; x0: number; x1: number; y0: number; y1: number }

/**
 * Eine Linie in Stücke von höchstens n Punkten; benachbarte Stücke teilen einen
 * Punkt, damit nichts fehlt. zeichnen macht aus den Punkten den Pfad.
 */
export function stueckeln(pts: P[], zeichnen: (q: P[]) => string, n = 48): Stueck[] {
  const raus: Stueck[] = []
  for (let i = 0; i < pts.length - 1; i += n - 1) {
    const q = pts.slice(i, i + n)
    if (q.length < 2) break
    const r = ringAus(q)
    raus.push({ d: zeichnen(q), x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 })
  }
  return raus
}

export const imBild = (z: { x0: number; x1: number; y0: number; y1: number }, box: Box, h: number) =>
  z.x1 > box.cx - box.w && z.x0 < box.cx + box.w && z.y1 > box.cy - h && z.y0 < box.cy + h
