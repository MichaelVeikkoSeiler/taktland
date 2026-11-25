/**
 * Busse im Gleisbau (Michael, 2026-11-25: «Strassen sollen ähnliche Elemente wie die Bahn haben damit wir Busse fahren lassen können», dann «Gerne alle»):
 * ein Bus fährt rechts auf der Strasse, biegt an Kreuzungen nach Zufall ab, wendet am Ende einer Strasse (auf dem Wendeplatz oder in der Mitte des letzten
 * Felds), hält an Haltestellen, wartet vor einem geschlossenen Bahnübergang und an einer Haltestelle neben einem Bahnhof auf den nächsten Zug (Anschluss).
 * Tempo, Halt, Abstände und Wartezeiten gewählt
 */
import { type Brett, type Feld, spalten, strassenKanten, zeilen } from './gleisbau'

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]
/** Mitte der rechten Spur neben der Mitte der Strasse (die Strasse ist 0,24 Felder breit) */
export const SPUR = 0.06
export const BUS_TEMPO = 0.9, BUS_ANFAHREN = 1.2, BUS_HALT_S = 2.5
/** an einer Haltestelle neben einem Bahnhof höchstens so lange auf den Zug warten, danach noch kurz für das Umsteigen */
export const ANSCHLUSS_MAX_S = 25, UMSTEIGEN_S = 1.5
/** der Bus wartet vor einem Bahnübergang, solange ein Wagen näher ist (wie die Schranke, die bei 1,3 schliesst und bei 1,9 öffnet) */
const SCHRANKE_M = 2
/** Abstand zum Bus davor in derselben Richtung; wartet einer länger als so, fährt er trotzdem (sonst blockieren sich zwei an einer Kreuzung) */
const ABSTAND = 0.42, GEDULD_S = 3

export interface BusLage { x: number; y: number; w: number; tunnel: boolean }
type P = { x: number; y: number }

/** die Strassen, die wirklich verbunden sind: je Feld die Kanten, deren Nachbar zurück verbindet */
export function strassenNetz(b: Brett) {
  const k = new Map<string, number[]>()
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    const l = strassenKanten(b, i, j)
    if (l.length) k.set(`${i},${j}`, l)
  }
  const verbunden = (i: number, j: number, r: number) => !!k.get(`${i + DX[r]},${j + DY[r]}`)?.includes((r + 2) % 4)
  return { k, verbunden }
}
type Netz = ReturnType<typeof strassenNetz>

/** Punkte entlang der Mitte von einer Kante zur anderen: gerade oder als Viertelkreis wie die Strasse */
function mitte(i: number, j: number, ein: number, aus: number): P[] {
  const e = (r: number) => ({ x: i + 0.5 + DX[r] * 0.5, y: j + 0.5 + DY[r] * 0.5 })
  const a = e(ein), z = e(aus), p: P[] = []
  if ((ein + aus) % 2 === 0) {
    for (let t = 0; t <= 8; t++) p.push({ x: a.x + ((z.x - a.x) * t) / 8, y: a.y + ((z.y - a.y) * t) / 8 })
    return p
  }
  const c = { x: a.x + z.x - i - 0.5, y: a.y + z.y - j - 0.5 }
  const a0 = Math.atan2(a.y - c.y, a.x - c.x)
  let da = Math.atan2(z.y - c.y, z.x - c.x) - a0
  while (da > Math.PI) da -= 2 * Math.PI
  while (da < -Math.PI) da += 2 * Math.PI
  for (let t = 0; t <= 12; t++) p.push({ x: c.x + 0.5 * Math.cos(a0 + (da * t) / 12), y: c.y + 0.5 * Math.sin(a0 + (da * t) / 12) })
  return p
}
/** die Punkte um die halbe Spur nach rechts der Fahrtrichtung versetzt */
function rechts(p: P[]): P[] {
  return p.map((q, k) => {
    const a = p[Math.max(0, k - 1)], z = p[Math.min(p.length - 1, k + 1)]
    const l = Math.hypot(z.x - a.x, z.y - a.y) || 1
    return { x: q.x - ((z.y - a.y) / l) * SPUR, y: q.y + ((z.x - a.x) / l) * SPUR }
  })
}
/** der Weg im Feld mit den Längen; halt ist die Stelle der Haltestelle oder der Wende in der Mitte des Felds */
interface Weg { p: P[]; s: number[]; laenge: number; halt: number; aus: number }
function wegAus(p: P[], aus: number, halt?: number): Weg {
  const s = [0]
  for (let k = 1; k < p.length; k++) s.push(s[k - 1] + Math.hypot(p[k].x - p[k - 1].x, p[k].y - p[k - 1].y))
  const laenge = s[s.length - 1]
  return { p, s, laenge, halt: halt ?? laenge / 2, aus }
}
function fahrweg(i: number, j: number, ein: number, aus: number) { return wegAus(rechts(mitte(i, j, ein, aus)), aus) }
/** wenden: auf der rechten Spur zur Mitte, im Halbkreis über die Strasse und auf der anderen Spur zurück */
function wendeweg(i: number, j: number, ein: number): Weg {
  const d = { x: -DX[ein], y: -DY[ein] }, n = { x: -d.y, y: d.x }, e = { x: i + 0.5 + DX[ein] * 0.5, y: j + 0.5 + DY[ein] * 0.5 }
  const m = { x: i + 0.5, y: j + 0.5 }, p: P[] = []
  for (let t = 0; t <= 6; t++) p.push({ x: e.x + ((m.x - e.x) * t) / 6 + n.x * SPUR, y: e.y + ((m.y - e.y) * t) / 6 + n.y * SPUR })
  const a0 = Math.atan2(n.y, n.x)
  // über die Fahrtrichtung nach links herum: von rechts über vorne nach links
  const vorne = Math.atan2(d.y, d.x)
  let da = vorne - a0
  while (da > Math.PI) da -= 2 * Math.PI
  while (da < -Math.PI) da += 2 * Math.PI
  for (let t = 1; t <= 10; t++) { const a = a0 + (2 * da * t) / 10; p.push({ x: m.x + Math.cos(a) * SPUR, y: m.y + Math.sin(a) * SPUR }) }
  for (let t = 1; t <= 6; t++) p.push({ x: m.x + ((e.x - m.x) * t) / 6 - n.x * SPUR, y: m.y + ((e.y - m.y) * t) / 6 - n.y * SPUR })
  const w = wegAus(p, ein)
  return { ...w, halt: w.s[6] }
}

/** ein Bahnübergang: Strasse über eine Gerade, ohne Strassenbrücke */
const uebergang = (f?: Feld) => !!f?.strasse && f.gleis?.art === 'gerade' && !f.strBruecke

export class Bus {
  i: number; j: number; weg: Weg; s: number; tempo = 0; halt = 0; wartet = 0
  /** fürs Bild: die Farbe bleibt, auch wenn andere Busse entfernt werden */
  nr = 0
  /** an dieser Haltestelle schon gehalten */
  private gehalten = false
  /** Anschluss: die Gruppe des Bahnhofs und wie viele Halte dort schon waren, als der Bus ankam */
  anschluss: { gruppe: string; halte: number; seit: number; zugDa: number } | null = null
  constructor(i: number, j: number, weg: Weg, s: number) { this.i = i; this.j = j; this.weg = weg; this.s = s }

  /**
   * je eigenständigen Strassenabschnitt (was über Strassen zusammenhängt) zwei Busse (Michael, 2026-11-25: «Pro eigenständigen Strassenabschnitt ein Bus», dann «2 Busse»),
   * an einer Haltestelle, wenn es eine gibt, sonst an einer Stelle nach festem Zufall
   */
  static setzen(b: Brett): Bus[] {
    const netz = strassenNetz(b), l: Array<[number, number, number]> = []
    for (const [key, k] of netz.k) {
      const [i, j] = key.split(',').map(Number)
      if (b[j][i].grund === 'berg') continue
      const r = k.find((r) => netz.verbunden(i, j, r))
      if (r !== undefined) l.push([i, j, r])
    }
    const zuerst = (x: [number, number, number]) => (b[x[1]][x[0]].haltestelle ? 0 : 1)
    l.sort((a, c) => zuerst(a) - zuerst(c) || zufallsZahl(a) - zufallsZahl(c))
    // die Abschnitte: je Feld die Nummer seines Abschnitts, über verbundene Kanten gefüllt
    const abschnitt = new Map<string, number>()
    let nr = 0
    for (const key of netz.k.keys()) {
      if (abschnitt.has(key)) continue
      const offen = [key]
      abschnitt.set(key, nr)
      while (offen.length) {
        const [i, j] = offen.pop()!.split(',').map(Number)
        for (const r of netz.k.get(`${i},${j}`) ?? []) {
          if (!netz.verbunden(i, j, r)) continue
          const n = `${i + DX[r]},${j + DY[r]}`
          if (!abschnitt.has(n)) { abschnitt.set(n, nr); offen.push(n) }
        }
      }
      nr++
    }
    // je Abschnitt zwei Busse (Michael, 2026-11-25: «Pro Autostrassensystem 2 Busse»): der erste wie bisher, der zweite im Feld am weitesten
    // weg davon; ein Abschnitt aus weniger als drei Feldern hat nur einen
    const busse: Bus[] = [], erster = new Map<number, [number, number]>(), groesse = new Map<number, number>()
    for (const a of abschnitt.values()) groesse.set(a, (groesse.get(a) ?? 0) + 1)
    const setzen = (i: number, j: number, r: number) => {
      const bus = new Bus(i, j, fahrweg(i, j, r, r), 0)
      bus.einfahren(netz, i, j, r)
      bus.s = bus.weg.halt
      bus.nr = busse.length
      busse.push(bus)
    }
    for (const [i, j, r] of l) {
      const a = abschnitt.get(`${i},${j}`)!
      if (erster.has(a)) continue
      erster.set(a, [i, j]); setzen(i, j, r)
    }
    for (const [a, [fi, fj]] of erster) {
      if ((groesse.get(a) ?? 0) < 3) continue
      let best: [number, number, number] | null = null, weit = 0
      for (const x of l) {
        if (abschnitt.get(`${x[0]},${x[1]}`) !== a) continue
        const d = Math.abs(x[0] - fi) + Math.abs(x[1] - fj)
        if (d > weit) { weit = d; best = x }
      }
      if (best) setzen(...best)
    }
    return busse
  }

  /** in ein Feld über die Kante ein: den Weg wählen, bei einer Kreuzung nach Zufall, ohne Weiterfahrt wenden */
  private einfahren(netz: Netz, i: number, j: number, ein: number) {
    this.i = i; this.j = j; this.gehalten = false
    const k = netz.k.get(`${i},${j}`) ?? []
    const weiter = k.filter((r) => r !== ein && netz.verbunden(i, j, r))
    if (!weiter.length) { this.weg = wendeweg(i, j, ein); return }
    // geradeaus etwas häufiger als abbiegen (gewählt)
    const gerade = weiter.find((r) => r === (ein + 2) % 4)
    const aus = gerade !== undefined && Math.random() < 0.5 ? gerade : weiter[Math.floor(Math.random() * weiter.length)]
    this.weg = fahrweg(i, j, ein, aus)
  }

  lage(b: Brett): BusLage {
    const { p, s } = this.weg
    let k = 1
    while (k < p.length - 1 && s[k] < this.s) k++
    const a = p[k - 1], z = p[k], t = Math.max(0, Math.min(1, (this.s - s[k - 1]) / Math.max(1e-6, s[k] - s[k - 1])))
    const x = a.x + (z.x - a.x) * t, y = a.y + (z.y - a.y) * t
    return { x, y, w: Math.atan2(z.y - a.y, z.x - a.x), tunnel: b[Math.floor(y)]?.[Math.floor(x)]?.grund === 'berg' }
  }

  /**
   * ein Schritt: wagen sind die Wagen der Züge, andere die Lagen der anderen Busse; zugHalte(gruppe) zählt die Halte der Züge an einem Bahnhof,
   * gruppeBei(i, j) nennt den Bahnhof neben einer Haltestelle
   */
  schritt(b: Brett, netz: Netz, dt: number, zeit: number, wagen: Array<{ x: number; y: number }>, andere: BusLage[],
          zugHalte: (g: string) => number, gruppeBei: (i: number, j: number) => string | null): 'anschluss' | null {
    if (!netz.k.has(`${this.i},${this.j}`)) return null
    let meldung: 'anschluss' | null = null
    if (this.halt > 0) {
      const a = this.anschluss
      if (a) {
        if (!a.zugDa && zugHalte(a.gruppe) > a.halte) a.zugDa = zeit
        const fertig = a.zugDa ? zeit - a.zugDa >= UMSTEIGEN_S : zeit - a.seit >= ANSCHLUSS_MAX_S
        if (fertig) { if (a.zugDa) meldung = 'anschluss'; this.anschluss = null; this.halt = 0 }
        return meldung
      }
      this.halt -= dt
      return null
    }
    // wie weit er darf: bis zur Haltestelle, vor einen Bahnübergang mit Zug, hinter den Bus davor
    let bis = Infinity
    const f = b[this.j][this.i]
    if (f.haltestelle && !this.gehalten) bis = Math.min(bis, this.weg.halt)
    const ni = this.i + DX[this.weg.aus], nj = this.j + DY[this.weg.aus]
    if (uebergang(b[nj]?.[ni]) && wagen.some((w) => Math.hypot(w.x - ni - 0.5, w.y - nj - 0.5) < SCHRANKE_M)) bis = Math.min(bis, this.weg.laenge - 0.02)
    const ich = this.lage(b)
    const vorne = andere.some((o) => {
      const dx = o.x - ich.x, dy = o.y - ich.y, d = Math.hypot(dx, dy)
      if (d > ABSTAND || d < 1e-6) return false
      const c = Math.cos(ich.w), s = Math.sin(ich.w)
      return dx * c + dy * s > 0.05 && Math.abs(-dx * s + dy * c) < 0.09 && Math.cos(o.w - ich.w) > 0
    })
    if (vorne && this.wartet < GEDULD_S) { this.tempo = 0; this.wartet += dt; return null }
    if (bis <= this.s + 1e-4) { this.tempo = 0; this.wartet += dt }
    else this.wartet = 0
    this.tempo = Math.min(BUS_TEMPO, this.tempo + BUS_ANFAHREN * dt)
    let neu = this.s + this.tempo * dt
    if (neu >= bis) {
      neu = Math.max(this.s, bis); this.tempo = 0
      if (bis === this.weg.halt && f.haltestelle && !this.gehalten) {
        this.gehalten = true; this.halt = BUS_HALT_S
        const g = gruppeBei(this.i, this.j)
        if (g) this.anschluss = { gruppe: g, halte: zugHalte(g), seit: zeit, zugDa: 0 }
      }
    }
    this.s = neu
    // ins nächste Feld
    if (this.s >= this.weg.laenge) {
      const rest = this.s - this.weg.laenge, aus = this.weg.aus
      if (!netz.verbunden(this.i, this.j, aus)) { this.weg = wendeweg(this.i, this.j, aus); this.s = 0; return null }
      this.einfahren(netz, this.i + DX[aus], this.j + DY[aus], (aus + 2) % 4)
      this.s = Math.min(rest, this.weg.laenge)
    }
    return null
  }
}

/** fester Zufall je Feld, damit die Busse bei jedem Start ähnlich verteilt sind */
function zufallsZahl([i, j]: [number, number, number]) {
  const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return x - Math.floor(x)
}
