/**
 * «Gleisbau» (Spiele, #/gleisbau; Michael, 2026-11-22: «Man soll Gleise auf ein Layout legen können. Tunnel und Brücken und Bahnhöfe stehen
 * auch zur Verfügung», nach seiner eigenen Gestaltung «VIA» mit Feldern und Kacheln): ein Brett von 8 × 6 Feldern, je Feld ein Grund
 * (Wiese, Wald, Wasser, Berg, Dorf) und darauf höchstens ein Gleisstück. Ein Gleis auf Wasser ist eine Brücke, auf einem Berg ein Tunnel.
 * Hier nur das Brett und der Zug, ohne Darstellung (komponenten/Gleisbau.tsx). Ein Baukasten, keine Wirklichkeit: Masse und Tempo gewählt.
 */

export const SPALTEN = 8
export const ZEILEN = 6

export type Grund = 'wiese' | 'wald' | 'wasser' | 'berg' | 'dorf'
export type GleisArt = 'gerade' | 'kurve' | 'weiche' | 'kreuzung' | 'prellbock' | 'bahnhof'
export type Dreh = 0 | 1 | 2 | 3

export interface Gleis { art: GleisArt; dreh: Dreh; /** nur Weiche: 0 gerade, 1 abzweigend */ stellung?: 0 | 1 }
export interface Feld { grund: Grund; gleis?: Gleis }
export type Brett = Feld[][] // [Zeile][Spalte]

/** Kanten eines Felds: 0 Nord, 1 Ost, 2 Süd, 3 West; -1 die Mitte (Ende am Prellbock) */
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]

/** die Wege durch ein Stück ohne Drehung; bei der Weiche zuerst der gerade, dann der abzweigende, beide ab dem Stamm im Süden */
const WEGE: Record<GleisArt, Array<[number, number]>> = {
  gerade: [[0, 2]], bahnhof: [[0, 2]], kurve: [[2, 1]], weiche: [[2, 0], [2, 1]], kreuzung: [[0, 2], [1, 3]], prellbock: [[2, -1]],
}

const drehen = (k: number, d: number) => (k < 0 ? -1 : (k + d) % 4)

/** die Wege durch ein Gleisstück mit seiner Drehung */
export function wege(g: Gleis): Array<[number, number]> {
  return WEGE[g.art].map(([a, b]) => [drehen(a, g.dreh), drehen(b, g.dreh)])
}

/** wo ein Zug, der an der Kante «ein» in das Stück fährt, es verlässt: eine Kante, -1 (Prellbock) oder null (kein Weg) */
export function ausgang(g: Gleis | undefined, ein: number): number | null {
  if (!g) return null
  const w = wege(g)
  if (g.art === 'weiche') {
    const stamm = w[0][0]
    if (ein === stamm) return w[g.stellung ?? 0][1]
    return w.some(([, b]) => b === ein) ? stamm : null
  }
  for (const [a, b] of w) { if (a === ein) return b; if (b === ein) return a }
  return null
}

export function leer(): Brett {
  return Array.from({ length: ZEILEN }, () => Array.from({ length: SPALTEN }, (): Feld => ({ grund: 'wiese' })))
}

/** Ein Beispiel zum Anfang: ein Ring mit zwei Bahnhöfen, Brücke über den Fluss, Tunnel durch den Berg und ein Abstellgleis */
export function beispiel(): Brett {
  const b = leer()
  const g = (i: number, j: number, art: GleisArt, dreh: Dreh) => { b[j][i].gleis = { art, dreh } }
  const grund = (art: Grund, ...felder: Array<[number, number]>) => { for (const [i, j] of felder) b[j][i].grund = art }
  grund('wasser', [0, 2], [1, 2], [2, 2], [2, 3], [3, 3])
  grund('berg', [6, 2], [6, 3], [7, 1], [7, 2], [7, 3])
  grund('wald', [0, 0], [1, 0], [0, 5], [6, 5], [7, 5], [7, 4])
  grund('dorf', [3, 0], [4, 0], [2, 5], [3, 5])
  g(1, 1, 'kurve', 0); g(6, 1, 'kurve', 1); g(6, 4, 'kurve', 2); g(1, 4, 'kurve', 3)
  g(2, 1, 'gerade', 1); g(3, 1, 'bahnhof', 1); g(4, 1, 'gerade', 1); g(5, 1, 'weiche', 1)
  g(2, 4, 'gerade', 1); g(3, 4, 'bahnhof', 1); g(4, 4, 'gerade', 1); g(5, 4, 'gerade', 1)
  g(1, 2, 'gerade', 0); g(1, 3, 'gerade', 0); g(6, 2, 'gerade', 0); g(6, 3, 'gerade', 0)
  g(5, 2, 'gerade', 0); g(5, 3, 'prellbock', 2)
  return b
}

const SPEICHER = 'taktland.gleisbau.v1'
const GRUENDE: Grund[] = ['wiese', 'wald', 'wasser', 'berg', 'dorf']
const ARTEN: GleisArt[] = ['gerade', 'kurve', 'weiche', 'kreuzung', 'prellbock', 'bahnhof']

/** das gemerkte Brett, nur wenn es heil ist */
export function brettLesen(): Brett | null {
  try {
    const x = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null') as Brett | null
    if (!Array.isArray(x) || x.length !== ZEILEN || x.some((z) => !Array.isArray(z) || z.length !== SPALTEN)) return null
    for (const z of x) for (const f of z) {
      if (!GRUENDE.includes(f.grund)) return null
      if (f.gleis && (!ARTEN.includes(f.gleis.art) || ![0, 1, 2, 3].includes(f.gleis.dreh))) return null
    }
    return x
  } catch { return null }
}

export function brettMerken(b: Brett) {
  try { localStorage.setItem(SPEICHER, JSON.stringify(b)) } catch { /* nur für jetzt */ }
}

/** die Bahnhöfe der Reihe nach (Zeile, dann Spalte) mit Buchstaben A, B, C … */
export function bahnhofNamen(b: Brett): Map<string, string> {
  const n = new Map<string, string>()
  for (let j = 0; j < ZEILEN; j++) for (let i = 0; i < SPALTEN; i++) {
    if (b[j][i].gleis?.art === 'bahnhof') n.set(`${i},${j}`, String.fromCharCode(65 + (n.size % 26)))
  }
  return n
}

// ——— Geometrie: ein Feld ist eine Einheit gross, die Mitte von Feld (i, j) liegt bei (i + 0,5, j + 0,5) ———

const kante = (k: number): [number, number] => (k < 0 ? [0, 0] : [DX[k] * 0.5, DY[k] * 0.5])

/** ein befahrenes Stück: in Feld (i, j) von Kante «ein» zu Kante «aus» (-1 die Mitte) */
export interface Stueck { i: number; j: number; ein: number; aus: number }

const bogen = (s: Stueck) => s.ein >= 0 && s.aus >= 0 && (s.ein + 2) % 4 !== s.aus

export function stueckLaenge(s: Stueck) {
  if (s.ein < 0 || s.aus < 0) return 0.5
  return bogen(s) ? Math.PI / 4 : 1
}

/** Punkt und Richtung (Bogenmass) nach d Einheiten auf dem Stück */
export function stueckPunkt(s: Stueck, d: number): { x: number; y: number; w: number } {
  const cx = s.i + 0.5, cy = s.j + 0.5
  const [ax, ay] = kante(s.ein), [bx, by] = kante(s.aus)
  if (!bogen(s)) {
    const t = Math.max(0, Math.min(1, d / stueckLaenge(s)))
    return { x: cx + ax + (bx - ax) * t, y: cy + ay + (by - ay) * t, w: Math.atan2(by - ay, bx - ax) }
  }
  // Viertelkreis mit Radius 0,5 um die Ecke zwischen beiden Kanten
  const ex = ax + bx, ey = ay + by
  const a0 = Math.atan2(ay - ey, ax - ex), a1 = Math.atan2(by - ey, bx - ex)
  let da = a1 - a0
  if (da > Math.PI) da -= 2 * Math.PI
  if (da < -Math.PI) da += 2 * Math.PI
  const a = a0 + da * Math.max(0, Math.min(1, d / stueckLaenge(s)))
  return { x: cx + ex + 0.5 * Math.cos(a), y: cy + ey + 0.5 * Math.sin(a), w: a + Math.sign(da) * Math.PI / 2 }
}

/** Punkte entlang eines Wegs durch ein Feld, zum Zeichnen */
export function wegPunkte(s: Stueck, n = 10): Array<{ x: number; y: number; w: number }> {
  const l = stueckLaenge(s)
  return Array.from({ length: n + 1 }, (_, k) => stueckPunkt(s, (l * k) / n))
}

const umgekehrt = (s: Stueck): Stueck => ({ i: s.i, j: s.j, ein: s.aus, aus: s.ein })

/** das Stück, das an das Ende von s anschliesst, oder null */
function naechstes(b: Brett, s: Stueck): Stueck | null {
  if (s.aus < 0) return null
  const i = s.i + DX[s.aus], j = s.j + DY[s.aus]
  if (i < 0 || j < 0 || i >= SPALTEN || j >= ZEILEN) return null
  const ein = (s.aus + 2) % 4
  const aus = ausgang(b[j][i].gleis, ein)
  return aus === null ? null : { i, j, ein, aus }
}

// ——— der Zug: Lok, zwei Wagen, Steuerwagen wie in der Virtuellen Schweiz ———

export const WAGEN_LAENGE = 0.5
export const WAGEN_LUECKE = 0.06
export const WAGEN = 4
export const ZUG_LAENGE = WAGEN * WAGEN_LAENGE + (WAGEN - 1) * WAGEN_LUECKE
/** Tempo in Feldern je Sekunde, Anfahren und Halt am Bahnhof (gewählt) */
export const TEMPO = 1.5
const ANFAHREN = 1.2
const HALT_S = 2.5

export interface WagenLage { x: number; y: number; w: number; /** 0 Lok, 1 und 2 Wagen, 3 Steuerwagen */ art: number; vorne: boolean }

export class Zug {
  /** die befahrenen Stücke, das letzte trägt die Spitze */
  private stuecke: Stueck[] = []
  private kopf = 0
  private tempo = 0
  private halt = 0
  /** true, wenn der Steuerwagen vorne fährt */
  private rueckwaerts = false

  /** null, wenn auf dem Brett kein Gleis liegt */
  static setzen(b: Brett): Zug | null {
    let start: Stueck | null = null
    for (let j = 0; j < ZEILEN && !start; j++) for (let i = 0; i < SPALTEN && !start; i++) {
      if (b[j][i].gleis?.art === 'bahnhof') { const [a, c] = wege(b[j][i].gleis!)[0]; start = { i, j, ein: a, aus: c } }
    }
    for (let j = 0; j < ZEILEN && !start; j++) for (let i = 0; i < SPALTEN && !start; i++) {
      const g = b[j][i].gleis
      if (g) { const [a, c] = wege(g)[0]; start = { i, j, ein: a, aus: c } }
    }
    if (!start) return null
    const z = new Zug()
    z.stuecke = [start]
    z.kopf = stueckLaenge(start) / 2
    // nach hinten auffüllen, so weit das Gleis reicht
    let erstes = start
    for (let k = 0; k < 20 && z.hinten() < ZUG_LAENGE; k++) {
      const davor = naechstes(b, umgekehrt(erstes))
      if (!davor) break
      erstes = umgekehrt(davor)
      z.stuecke.unshift(erstes)
    }
    if (b[start.j][start.i].gleis?.art === 'bahnhof') z.halt = HALT_S
    return z
  }

  /** wie viel Gleis hinter der Spitze liegt */
  private hinten() {
    let s = this.kopf
    for (let k = 0; k < this.stuecke.length - 1; k++) s += stueckLaenge(this.stuecke[k])
    return s
  }

  private kuerzen() {
    while (this.stuecke.length > 1 && this.hinten() - stueckLaenge(this.stuecke[0]) >= ZUG_LAENGE + 0.01) this.stuecke.shift()
  }

  /** am Ende des Gleises: der Zug fährt zurück, die Spitze ist dort, wo das Ende des Zugs war */
  private umkehren() {
    const ende = Math.max(0, this.hinten() - ZUG_LAENGE)
    this.stuecke = this.stuecke.map(umgekehrt).reverse()
    this.kopf = Math.max(0, stueckLaenge(this.stuecke[this.stuecke.length - 1]) - ende)
    this.rueckwaerts = !this.rueckwaerts
    this.tempo = 0
    this.halt = 0.8
    this.kuerzen()
  }

  schritt(b: Brett, dt: number) {
    if (this.halt > 0) { this.halt -= dt; return }
    this.tempo = Math.min(TEMPO, this.tempo + (TEMPO / ANFAHREN) * dt)
    let rest = this.tempo * dt
    for (let k = 0; k < 8 && rest > 0; k++) {
      const s = this.stuecke[this.stuecke.length - 1], l = stueckLaenge(s)
      const mitte = l / 2, vorher = this.kopf
      // am Bahnhof in der Mitte des Felds halten
      if (b[s.j][s.i].gleis?.art === 'bahnhof' && vorher < mitte && vorher + rest >= mitte) {
        this.kopf = mitte; this.halt = HALT_S; this.tempo = 0; return
      }
      if (vorher + rest <= l) { this.kopf += rest; rest = 0; break }
      rest -= l - vorher
      const n = naechstes(b, s)
      if (!n) { this.kopf = l; this.umkehren(); return }
      this.stuecke.push(n); this.kopf = 0
      this.kuerzen()
    }
  }

  /** Punkt d Einheiten hinter der Spitze */
  private punkt(d: number) {
    let k = this.stuecke.length - 1, rest = d
    if (rest <= this.kopf) return stueckPunkt(this.stuecke[k], this.kopf - rest)
    rest -= this.kopf
    for (k--; k >= 0; k--) {
      const l = stueckLaenge(this.stuecke[k])
      if (rest <= l) return stueckPunkt(this.stuecke[k], l - rest)
      rest -= l
    }
    return stueckPunkt(this.stuecke[0], 0)
  }

  /** die Wagen, von der Spitze an: Mitte und Richtung (zur Spitze hin) */
  wagen(): WagenLage[] {
    return Array.from({ length: WAGEN }, (_, k) => {
      const vorn = k * (WAGEN_LAENGE + WAGEN_LUECKE), a = this.punkt(vorn), c = this.punkt(vorn + WAGEN_LAENGE)
      const art = this.rueckwaerts ? WAGEN - 1 - k : k
      return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, w: Math.atan2(a.y - c.y, a.x - c.x), art, vorne: k === 0 }
    })
  }
}
