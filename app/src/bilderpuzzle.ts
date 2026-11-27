/**
 * Bilderpuzzle (Michael, 2026-11-21: «Kannst du dieses Puzzlespiel auf Taktland-App übernehmen und dort alle Bilder, welche wir auf
 * Taktland integriert haben, als Puzzle bereitstellen?»): ein Bild in 4 bis 48 Teile geschnitten, die Teile liegen rund um den Rahmen
 * und rasten am richtigen Platz ein. Die Bilder sind die Illustrationen der App (src/assets), dazu eigene Fotos, die nur auf dem Gerät
 * bleiben (IndexedDB). Darstellung: komponenten/Bilderpuzzle.tsx.
 */

export const TEILE = [4, 6, 9, 12, 16, 20, 25, 30, 36, 48, 64, 96] as const
export type Form = 'quadrat' | 'puzzle'

/** ein Bild zur Wahl */
export interface PuzzleBild { id: string; titel: string; url: string; eigenes?: boolean }

// Die Illustrationen der App, alle Auftaktbilder hell und dunkel; ein neues Auftaktbild in src/assets kommt von selbst dazu. Ohne den
// Führerstand: er ist eine Überlagerung mit durchsichtigem Fenster, als Puzzle fast nur leere Fläche
const DATEIEN = import.meta.glob<string>('./assets/auftakt-*.webp', { eager: true, import: 'default' })

/** Namen der Bilder nach dem Bereich, zu dem sie in der App gehören */
const NAMEN: Record<string, string> = {
  start: 'Startseite', anleitung: 'Info', bahnhoefe: 'Bahnhöfe', linien: 'Strecken', bruecken: 'Brücken', tunnel: 'Tunnel',
  standort: 'Standort', fahrt: 'Fahren', logbuch: 'Logbuch', spiele: 'Geo', erraten: 'Bahnhofsuche', duell: 'Duell',
  modellbahn: 'Modellbahn', probefahren: 'Probefahren', wobinich: 'Wo fahre ich?', puzzle: 'Fahrplan-Puzzle',
  reisedauer: 'Reisedauer', bilderpuzzle: 'Bilderpuzzle', virtuell: 'Virtuelle Schweiz', schweiz3d: '3D Schweiz', '3dland': '3D-Land',
}
const REIHE = Object.keys(NAMEN)

export const BILDER: PuzzleBild[] = Object.entries(DATEIEN)
  .map(([pfad, url]) => {
    const name = pfad.replace(/^.*\//, '').replace(/\.webp$/, '').replace(/^auftakt-/, '')
    const nacht = name.endsWith('-dunkel')
    const bereich = name.replace(/-(hell|dunkel|quer)$/, '')
    return { id: name, url, bereich, nacht, titel: `${NAMEN[bereich] ?? bereich}${nacht ? ', Nacht' : ''}` }
  })
  .sort((a, b) => ((REIHE.indexOf(a.bereich) + 1 || 99) - (REIHE.indexOf(b.bereich) + 1 || 99)) || Number(a.nacht) - Number(b.nacht))
  .map(({ id, url, titel }) => ({ id, url, titel }))

/* ---------------- Eigene Bilder: nur auf diesem Gerät ---------------- */

const mitFrist = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, nein) => setTimeout(() => nein(new Error('Zeit abgelaufen')), ms))])

let db: Promise<IDBDatabase | null> | null = null
function datenbank(): Promise<IDBDatabase | null> {
  db ??= mitFrist(new Promise<IDBDatabase | null>((ja) => {
    try {
      const r = indexedDB.open('taktland-bilderpuzzle', 1)
      r.onupgradeneeded = () => { r.result.createObjectStore('bilder', { keyPath: 'id', autoIncrement: true }) }
      r.onsuccess = () => ja(r.result)
      r.onerror = r.onblocked = () => ja(null)
    } catch { ja(null) }
  }), 3000).catch(() => null)
  return db
}
function vorgang<T>(d: IDBDatabase, art: IDBTransactionMode, tun: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return mitFrist(new Promise<T>((ja, nein) => {
    const t = d.transaction('bilder', art)
    const r = tun(t.objectStore('bilder'))
    t.oncomplete = () => ja(r.result)
    t.onerror = () => nein(t.error)
  }), 4000)
}

/** eigene Bilder, das neueste zuerst; null, wenn der Browser nichts speichern kann */
export async function eigeneLaden(): Promise<PuzzleBild[] | null> {
  const d = await datenbank()
  if (!d) return null
  try {
    const alle = await vorgang(d, 'readonly', (s) => s.getAll() as IDBRequest<Array<{ id: number; url: string }>>)
    return alle.sort((a, b) => b.id - a.id).map((e) => ({ id: `eigen-${e.id}`, titel: 'Eigenes Bild', url: e.url, eigenes: true }))
  } catch { return null }
}

/** verkleinert ein Foto auf höchstens 2000 Bildpunkte und merkt es sich; gibt es zurück, auch wenn Merken nicht geht */
export async function eigenesHinzufuegen(datei: File): Promise<{ bild: PuzzleBild; gemerkt: boolean }> {
  const url = await verkleinern(datei)
  const d = await datenbank()
  if (d) {
    try {
      const id = await vorgang(d, 'readwrite', (s) => s.add({ url, erstellt: Date.now() }) as IDBRequest<number>)
      return { bild: { id: `eigen-${id}`, titel: 'Eigenes Bild', url, eigenes: true }, gemerkt: true }
    } catch { /* nur für diese Sitzung */ }
  }
  return { bild: { id: `eigen-t${Date.now()}${Math.random()}`, titel: 'Eigenes Bild', url, eigenes: true }, gemerkt: false }
}

export async function eigenesLoeschen(id: string) {
  const nr = Number(id.replace('eigen-', ''))
  const d = await datenbank()
  if (d && Number.isFinite(nr)) { try { await vorgang(d, 'readwrite', (s) => s.delete(nr)) } catch { /* bleibt */ } }
}

function alsDatenUrl(b: Blob): Promise<string> {
  return new Promise((ja, nein) => { const r = new FileReader(); r.onload = () => ja(r.result as string); r.onerror = () => nein(r.error); r.readAsDataURL(b) })
}

export function bildLaden(url: string): Promise<HTMLImageElement> {
  return new Promise((ja, nein) => { const i = new Image(); i.onload = () => ja(i); i.onerror = nein; i.src = url })
}

async function verkleinern(datei: File): Promise<string> {
  // ohne blob:-Adresse: zuerst createImageBitmap, sonst über eine data:-Adresse
  let quelle: CanvasImageSource & { close?: () => void }
  let b: number, h: number
  try {
    const bm = await createImageBitmap(datei); quelle = bm; b = bm.width; h = bm.height
  } catch {
    const img = await bildLaden(await alsDatenUrl(datei)); quelle = img; b = img.naturalWidth; h = img.naturalHeight
  }
  if (!b || !h) throw new Error('Bild leer')
  const k = Math.min(1, 2000 / Math.max(b, h))
  const c = document.createElement('canvas')
  c.width = Math.round(b * k); c.height = Math.round(h * k)
  c.getContext('2d')!.drawImage(quelle, 0, 0, c.width, c.height)
  quelle.close?.()
  return c.toDataURL('image/jpeg', 0.88)
}

/* ---------------- Das Spiel ---------------- */

/** Seitenverhältnis eines Teils höchstens so weit von quadratisch; mehr wird vom Bild abgeschnitten */
const TEIL_FORMAT = [0.8, 1.25] as const
/** Teile so nahe am richtigen Platz rasten ein (Anteil der kürzeren Seite) */
// seit 2026-11-22 die halbe kürzere Seite statt ein Drittel (Michael: «Etwas grösser machen, die Hälfte»)
const EINRASTEN = 0.5
/** Platz oben für die Knöpfe */
const OBEN = 68

/** Spalten und Zeilen für n Teile, möglichst nahe an quadratischen Teilen */
export function raster(n: number, seitenverhaeltnis: number) {
  let best = { spalten: n, zeilen: 1, abweichung: Infinity }
  for (let s = 1; s <= n; s++) {
    if (n % s) continue
    const z = n / s, abweichung = Math.abs(Math.log(seitenverhaeltnis * z / s))
    if (abweichung < best.abweichung) best = { spalten: s, zeilen: z, abweichung }
  }
  return best
}

interface Kanten { oben: number; rechts: number; unten: number; links: number }
interface Teil { s: number; z: number; kanten: Kanten; el: HTMLCanvasElement; x: number; y: number; gelegt: boolean }

/** Umriss eines Teils (Breite b, Höhe h); die Nasen richten sich nach der kürzeren Seite */
function umriss(ctx: CanvasRenderingContext2D, b: number, h: number, k: Kanten) {
  const m = Math.min(b, h)
  const kante = (ax: number, ay: number, bx: number, by: number, richtung: number) => {
    if (!richtung) { ctx.lineTo(bx, by); return }
    const l = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / l, uy = (by - ay) / l
    const nx = uy * richtung, ny = -ux * richtung
    const p = (t: number, q: number): [number, number] => {
      const a = l / 2 + (t - 0.5) * m
      return [ax + ux * a + nx * q * m, ay + uy * a + ny * q * m]
    }
    ctx.lineTo(...p(0.35, 0))
    ctx.bezierCurveTo(...p(0.45, 0.02), ...p(0.29, 0.24), ...p(0.5, 0.24))
    ctx.bezierCurveTo(...p(0.71, 0.24), ...p(0.55, 0.02), ...p(0.65, 0))
    ctx.lineTo(bx, by)
  }
  ctx.moveTo(0, 0)
  kante(0, 0, b, 0, k.oben); kante(b, 0, b, h, k.rechts); kante(b, h, 0, h, k.unten); kante(0, h, 0, 0, k.links)
  ctx.closePath()
}

/**
 * Stand eines Puzzles zum Weitermachen (Michael, 2026-11-24: «dass das Bilderputzle immer auf dem letzten Stand ist, pro Gerät»): die Nasen
 * der Kanten und je Teil die Lage in Teilen vom Rahmen aus und ob es liegt
 */
export interface PuzzleStand { waagrecht: number[][]; senkrecht: number[][]; lagen: Array<[number, number, 0 | 1]> }

export interface PuzzleStart {
  bild: HTMLImageElement
  teile: number
  form: Form
  vorlage: boolean
  /** wie viele Teile liegen */
  beiStand: (gelegt: number, alle: number) => void
  beiEinrasten: () => void
  beiFertig: () => void
  /** ein gemerkter Stand, wenn er zu Bild, Teilen und Form passt */
  stand?: PuzzleStand | null
  /** nach jeder Änderung der neue Stand */
  beiAenderung?: (s: PuzzleStand) => void
}

/**
 * Das Spielfeld in einem Behälter, der den ganzen Bildschirm füllt: der Rahmen in der Mitte, die Teile rundherum.
 * Lagen der Teile in Teilbreiten und -höhen vom Rahmen aus, damit sie beim Drehen des Geräts mitwandern.
 */
export class Bilderpuzzle {
  private teile: Teil[] = []
  private waagrecht: number[][] = []; private senkrecht: number[][] = []
  private spalten: number; private zeilen: number
  private format: number // Breite durch Höhe eines Teils
  private zuschnitt: HTMLCanvasElement
  private nasen: boolean
  private rahmen: HTMLDivElement; private rahmenBild: HTMLCanvasElement; private ganzesBild: HTMLCanvasElement
  private tb = 0; private th = 0; private rand = 0; private rx = 0; private ry = 0; private breite = 0; private hoehe = 0
  private plaetze: Array<{ x: number; y: number }> = []
  private oben = 10
  private gelegt = 0
  private fertig = false
  private vorlage: boolean
  private ziehen = new Map<HTMLCanvasElement, number>()
  private beobachter: ResizeObserver
  private flaeche: HTMLElement
  private o: PuzzleStart

  constructor(flaeche: HTMLElement, o: PuzzleStart) {
    this.flaeche = flaeche; this.o = o
    const { bild, teile } = o
    const b = bild.naturalWidth, h = bild.naturalHeight
    const r = raster(teile, b / h)
    this.spalten = r.spalten; this.zeilen = r.zeilen
    this.format = Math.min(TEIL_FORMAT[1], Math.max(TEIL_FORMAT[0], (b / h) * this.zeilen / this.spalten))
    // Bild mittig zuschneiden, nur so weit, dass die Teile nicht zu schmal oder zu flach werden
    const ziel = this.format * this.spalten / this.zeilen
    let sb = b, sh = h
    if (b / h > ziel) sb = h * ziel; else sh = b / ziel
    this.zuschnitt = document.createElement('canvas')
    this.zuschnitt.width = Math.round(Math.min(sb, 2400)); this.zuschnitt.height = Math.round(this.zuschnitt.width / ziel)
    this.zuschnitt.getContext('2d')!.drawImage(bild, (b - sb) / 2, (h - sh) / 2, sb, sh, 0, 0, this.zuschnitt.width, this.zuschnitt.height)
    this.nasen = o.form === 'puzzle'
    this.vorlage = o.vorlage

    this.rahmen = document.createElement('div')
    this.rahmen.className = 'absolute rounded-sm bg-sbb-cloud shadow-[inset_0_0_0_2px_var(--color-sbb-silver)] dark:bg-sbb-charcoal dark:shadow-[inset_0_0_0_2px_var(--color-sbb-iron)]'
    this.rahmenBild = document.createElement('canvas')
    this.ganzesBild = document.createElement('canvas')
    for (const c of [this.rahmenBild, this.ganzesBild]) c.className = 'absolute inset-0 size-full'
    this.ganzesBild.style.cssText = 'opacity:0;transition:opacity .8s;pointer-events:none'
    this.rahmen.append(this.rahmenBild, this.ganzesBild)
    flaeche.append(this.rahmen)

    const zufall = () => (Math.random() < 0.5 ? 1 : -1)
    const st = o.stand && o.stand.lagen.length === this.spalten * this.zeilen && o.stand.waagrecht.length === this.zeilen - 1
      && o.stand.senkrecht.length === this.zeilen ? o.stand : null
    const waagrecht = st?.waagrecht ?? Array.from({ length: this.zeilen - 1 }, () => Array.from({ length: this.spalten }, zufall))
    const senkrecht = st?.senkrecht ?? Array.from({ length: this.zeilen }, () => Array.from({ length: this.spalten - 1 }, zufall))
    this.waagrecht = waagrecht; this.senkrecht = senkrecht
    this.anordnen()
    // fein genug für den Bildschirm, nicht feiner als das Bild
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    const pb = Math.max(40, Math.round(Math.min(this.tb * dpr * 1.25, this.zuschnitt.width / this.spalten)))
    for (let z = 0; z < this.zeilen; z++) for (let s = 0; s < this.spalten; s++) {
      const kanten: Kanten = this.nasen ? {
        oben: z === 0 ? 0 : -waagrecht[z - 1][s], unten: z === this.zeilen - 1 ? 0 : waagrecht[z][s],
        links: s === 0 ? 0 : -senkrecht[z][s - 1], rechts: s === this.spalten - 1 ? 0 : senkrecht[z][s],
      } : { oben: 0, rechts: 0, unten: 0, links: 0 }
      const el = this.teilZeichnen(s, z, pb, kanten)
      const t: Teil = { s, z, kanten, el, x: 0, y: 0, gelegt: false }
      el.addEventListener('pointerdown', (e) => this.anfassen(e, el))
      ;(el as HTMLCanvasElement & { teil?: Teil }).teil = t
      this.teile.push(t)
      flaeche.append(el)
    }
    if (st) {
      // weiter, wo man war: lose Teile an ihre Lage, gelegte in den Rahmen
      this.teile.forEach((t, i) => {
        const [x, y, g] = st.lagen[i]
        t.x = x; t.y = y
        if (g) { t.gelegt = true; t.x = t.s; t.y = t.z; t.el.style.filter = 'none'; t.el.style.pointerEvents = 'none'; t.el.style.zIndex = '2'; this.gelegt++ }
        else t.el.style.zIndex = String(++this.oben)
        this.setzen(t)
      })
    } else this.verteilen()
    this.rahmenZeichnen()
    o.beiStand(this.gelegt, this.teile.length)
    this.melden()
    if (st) window.setTimeout(() => this.heranzoomen(), 50)
    let warte = 0
    this.beobachter = new ResizeObserver(() => { clearTimeout(warte); warte = window.setTimeout(() => this.neuGroesse(), 100) })
    this.beobachter.observe(flaeche)
  }

  beenden() { this.beobachter.disconnect(); this.flaeche.replaceChildren() }

  /** den Stand melden, Lagen auf drei Stellen */
  private melden() {
    const r = (v: number) => Math.round(v * 1000) / 1000
    this.o.beiAenderung?.({ waagrecht: this.waagrecht, senkrecht: this.senkrecht, lagen: this.teile.map((t) => [r(t.x), r(t.y), t.gelegt ? 1 : 0]) })
  }

  vorlageZeigen(an: boolean) { this.vorlage = an; this.rahmenZeichnen() }

  private teilZeichnen(s: number, z: number, pb: number, kanten: Kanten) {
    const ph = Math.round(pb / this.format), rand = this.nasen ? Math.round(0.25 * Math.min(pb, ph)) : 0
    const el = document.createElement('canvas')
    el.width = pb + 2 * rand; el.height = ph + 2 * rand
    el.className = 'absolute left-0 top-0 cursor-grab touch-none'
    el.style.filter = 'drop-shadow(0 2px 3px rgb(0 0 0 / .35))'
    el.style.willChange = 'transform'
    const ctx = el.getContext('2d', { willReadFrequently: true })!
    ctx.translate(rand, rand)
    ctx.beginPath(); umriss(ctx, pb, ph, kanten)
    ctx.save(); ctx.clip()
    ctx.drawImage(this.zuschnitt, -s * pb, -z * ph, this.spalten * pb, this.zeilen * ph)
    ctx.restore()
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(1.5, pb * 0.018); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke()
    ctx.lineWidth = Math.max(1, pb * 0.006); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke()
    return el
  }

  /** Grösse der Teile und Lage des Rahmens; so klein, dass alle Teile neben dem Rahmen Platz haben */
  private anordnen() {
    const B = this.flaeche.clientWidth, H = this.flaeche.clientHeight
    const m = Math.max(10, Math.min(B, H) * 0.02)
    let th = Math.min((B - 2 * m) * 0.9 / (this.spalten * this.format), (H - OBEN - m) * 0.92 / this.zeilen)
    for (let i = 0; i < 80; i++) {
      this.th = th; this.tb = th * this.format
      this.rand = this.nasen ? 0.25 * Math.min(this.tb, this.th) : 0
      this.rx = (B - this.spalten * this.tb) / 2
      this.ry = OBEN + (H - OBEN - m - this.zeilen * this.th) / 2
      this.plaetze = this.freiePlaetze(B, H, m)
      if (this.plaetze.length >= this.spalten * this.zeilen) break
      th *= 0.95
    }
    this.breite = B; this.hoehe = H
    Object.assign(this.rahmen.style, {
      left: `${this.rx}px`, top: `${this.ry}px`, width: `${this.spalten * this.tb}px`, height: `${this.zeilen * this.th}px`,
    })
  }

  private freiePlaetze(B: number, H: number, m: number) {
    const luecke = Math.min(this.tb, this.th) * 0.12
    const sx = this.tb + 2 * this.rand + luecke, sy = this.th + 2 * this.rand + luecke
    const abstand = Math.min(this.tb, this.th) * (this.nasen ? 0.3 : 0.15)
    const r = { l: this.rx - abstand, o: this.ry - abstand, r: this.rx + this.spalten * this.tb + abstand, u: this.ry + this.zeilen * this.th + abstand }
    const nx = Math.floor((B - 2 * m) / sx), ny = Math.floor((H - OBEN - m) / sy)
    const ox = (B - nx * sx) / 2, oy = OBEN + (H - OBEN - m - ny * sy) / 2
    const frei: Array<{ x: number; y: number }> = []
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const l = ox + i * sx, o = oy + j * sy
      if (l + sx <= r.l || l >= r.r || o + sy <= r.o || o >= r.u) frei.push({ x: l + sx / 2, y: o + sy / 2 })
    }
    return frei
  }

  /** die Teile zufällig auf die freien Plätze neben dem Rahmen; ohne Angabe alle */
  private verteilen(welche: Teil[] = this.teile) {
    const plaetze = [...this.plaetze]
    for (let i = plaetze.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [plaetze[i], plaetze[j]] = [plaetze[j], plaetze[i]] }
    const zittern = Math.min(this.tb, this.th) * 0.06
    ;[...welche].sort(() => Math.random() - 0.5).forEach((t, i) => {
      const p = plaetze[i] ?? { x: this.tb + Math.random() * (this.breite - 2 * this.tb), y: OBEN + this.th / 2 + Math.random() * (this.hoehe - OBEN - 1.5 * this.th) }
      t.x = (p.x + (Math.random() * 2 - 1) * zittern - this.tb / 2 - this.rx) / this.tb
      t.y = (p.y + (Math.random() * 2 - 1) * zittern - this.th / 2 - this.ry) / this.th
      t.el.style.zIndex = String(++this.oben)
      this.setzen(t)
    })
  }

  private setzen(t: Teil) {
    t.el.style.width = `${this.tb + 2 * this.rand}px`
    t.el.style.height = `${this.th + 2 * this.rand}px`
    t.el.style.transform = `translate(${this.rx + t.x * this.tb - this.rand}px, ${this.ry + t.y * this.th - this.rand}px)`
  }

  private rahmenZeichnen() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const b = this.spalten * this.tb, h = this.zeilen * this.th
    const c = this.rahmenBild
    c.width = Math.round(b * dpr); c.height = Math.round(h * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    if (this.vorlage) { ctx.globalAlpha = 0.28; ctx.drawImage(this.zuschnitt, 0, 0, b, h); ctx.globalAlpha = 1 }
    const dunkel = matchMedia('(prefers-color-scheme: dark)').matches
    ctx.strokeStyle = dunkel ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.2)'
    ctx.lineWidth = 1.5; ctx.setLineDash([5, 5])
    for (const t of this.teile) {
      ctx.save(); ctx.translate(t.s * this.tb, t.z * this.th); ctx.beginPath(); umriss(ctx, this.tb, this.th, t.kanten); ctx.stroke(); ctx.restore()
    }
    this.ganzesBild.width = c.width; this.ganzesBild.height = c.height
    this.ganzesBild.getContext('2d')!.drawImage(this.zuschnitt, 0, 0, c.width, c.height)
  }

  /**
   * Das Spiel so gross, wie es der Platz zulässt: Rahmen und lose Teile zusammen füllen die Fläche, in der Mitte, der Rahmen höchstens bis an
   * ihren Rand. Liegen die losen Teile näher am Rahmen, wird alles grösser (Michael, 2026-11-22: «Schiebt man die umliegenden Teile
   * näher zum Puzzle so soll sich das Spiel entsprechend vergrössern»); nicht, solange ein Teil gezogen wird
   */
  private heranzoomen() {
    if (this.ziehen.size || this.fertig) return
    const B = this.breite, H = this.hoehe
    const m = Math.max(10, Math.min(B, H) * 0.02)
    const r = this.nasen ? 0.25 * Math.min(1, 1 / this.format) : 0
    // Ausdehnung in Teilen: der Rahmen und alle losen Teile samt ihren Nasen
    let x0 = 0, y0 = 0, x1 = this.spalten, y1 = this.zeilen
    for (const t of this.teile) {
      if (t.gelegt) continue
      x0 = Math.min(x0, t.x - r * this.format); x1 = Math.max(x1, t.x + 1 + r * this.format)
      y0 = Math.min(y0, t.y - r); y1 = Math.max(y1, t.y + 1 + r)
    }
    // höchstens bis an den Rand der Fläche (gewählt)
    const hoechst = Math.min((B - 2 * m) / (this.spalten * this.format), (H - OBEN - 2 * m) / this.zeilen)
    let th = Math.min(hoechst, (B - 2 * m) / ((x1 - x0) * this.format), (H - OBEN - 2 * m) / (y1 - y0))
    // die Grösse erst ab 3 % Unterschied, die Lage erst ab 4 % der Fläche, damit nichts bei jedem Loslassen ein wenig zuckt (gewählt)
    if (Math.abs(th - this.th) < this.th * 0.03) th = this.th
    const tb = th * this.format
    const rx = (B - (x1 - x0) * tb) / 2 - x0 * tb, ry = OBEN + (H - OBEN - m - (y1 - y0) * th) / 2 - y0 * th
    if (th === this.th && Math.abs(rx - this.rx) < B * 0.04 && Math.abs(ry - this.ry) < H * 0.04) return
    this.th = th; this.tb = tb; this.rx = rx; this.ry = ry
    this.rand = this.nasen ? 0.25 * Math.min(this.tb, this.th) : 0
    const sanft = !matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const t of this.teile) {
      if (sanft) t.el.style.transition = 'transform .35s ease-out, width .35s ease-out, height .35s ease-out'
      this.setzen(t)
    }
    if (sanft) this.rahmen.style.transition = 'left .35s ease-out, top .35s ease-out, width .35s ease-out, height .35s ease-out'
    Object.assign(this.rahmen.style, {
      left: `${this.rx}px`, top: `${this.ry}px`, width: `${this.spalten * this.tb}px`, height: `${this.zeilen * this.th}px`,
    })
    window.setTimeout(() => {
      for (const t of this.teile) if (!this.ziehen.has(t.el)) t.el.style.transition = ''
      this.rahmen.style.transition = ''
      this.rahmenZeichnen()
    }, 400)
  }

  private neuGroesse() {
    if (!this.flaeche.isConnected) return
    const quer = this.breite > this.hoehe
    this.anordnen()
    // nach dem Drehen von hoch auf quer und zurück die losen Teile neu um den Rahmen verteilen, sonst liegen sie, wo vorher Platz war
    // (Michael, 2026-11-22: «Im Querformat also beim drehen des Devices sollen die herumliegenden Puzzleteile neu und sinnvoll verteilt werden»);
    // was gerade gezogen wird, bleibt in der Hand
    if (quer !== this.breite > this.hoehe) {
      const gezogen = new Set([...this.ziehen.keys()])
      const lose = this.teile.filter((t) => !t.gelegt && !gezogen.has(t.el))
      if (lose.length) {
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) for (const t of lose) t.el.style.transition = 'transform .35s ease-out'
        this.verteilen(lose); this.melden()
        window.setTimeout(() => { for (const t of lose) if (!t.gelegt) t.el.style.transition = '' }, 400)
      }
    }
    for (const t of this.teile) {
      if (!t.gelegt) {
        const x = Math.max(0, Math.min(this.breite - this.tb, this.rx + t.x * this.tb))
        const y = Math.max(0, Math.min(this.hoehe - this.th, this.ry + t.y * this.th))
        t.x = (x - this.rx) / this.tb; t.y = (y - this.ry) / this.th
      }
      this.setzen(t)
    }
    this.rahmenZeichnen()
  }

  /** nur, wo das Teil Bild hat: in durchsichtigen Ecken greift man das Teil darunter */
  private deckend(el: HTMLCanvasElement, cx: number, cy: number) {
    const r = el.getBoundingClientRect()
    const x = Math.floor((cx - r.left) / r.width * el.width), y = Math.floor((cy - r.top) / r.height * el.height)
    if (x < 0 || y < 0 || x >= el.width || y >= el.height) return false
    try { return el.getContext('2d')!.getImageData(x, y, 1, 1).data[3] > 20 } catch { return true }
  }

  private anfassen(e: PointerEvent, angetippt: HTMLCanvasElement) {
    if (this.fertig) return
    let el: HTMLCanvasElement | undefined = angetippt
    if (!this.deckend(el, e.clientX, e.clientY)) {
      el = document.elementsFromPoint(e.clientX, e.clientY).find((x): x is HTMLCanvasElement => {
        const t = (x as HTMLCanvasElement & { teil?: Teil }).teil
        return !!t && !t.gelegt && !this.ziehen.has(x as HTMLCanvasElement) && this.deckend(x as HTMLCanvasElement, e.clientX, e.clientY)
      })
      if (!el) return
    }
    if (this.ziehen.has(el)) return
    e.preventDefault()
    const t = (el as HTMLCanvasElement & { teil?: Teil }).teil!
    const fl = this.flaeche.getBoundingClientRect()
    el.setPointerCapture(e.pointerId)
    el.style.zIndex = String(++this.oben)
    el.style.transition = ''
    el.style.filter = 'drop-shadow(0 10px 12px rgb(0 0 0 / .35))'
    el.style.cursor = 'grabbing'
    this.ziehen.set(el, e.pointerId)
    const dx = e.clientX - fl.left - (this.rx + t.x * this.tb), dy = e.clientY - fl.top - (this.ry + t.y * this.th)
    const ziel = el
    const bewegen = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      const x = Math.max(-this.tb * 0.4, Math.min(this.breite - this.tb * 0.6, ev.clientX - fl.left - dx))
      const y = Math.max(-this.th * 0.4, Math.min(this.hoehe - this.th * 0.6, ev.clientY - fl.top - dy))
      t.x = (x - this.rx) / this.tb; t.y = (y - this.ry) / this.th
      this.setzen(t)
    }
    const loslassen = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      ziel.removeEventListener('pointermove', bewegen); ziel.removeEventListener('pointerup', loslassen); ziel.removeEventListener('pointercancel', loslassen)
      this.ziehen.delete(ziel)
      ziel.style.filter = 'drop-shadow(0 2px 3px rgb(0 0 0 / .35))'; ziel.style.cursor = 'grab'
      if (Math.hypot((t.x - t.s) * this.tb, (t.y - t.z) * this.th) < EINRASTEN * Math.min(this.tb, this.th)) this.einrasten(t)
      this.heranzoomen()
      this.melden()
    }
    ziel.addEventListener('pointermove', bewegen)
    ziel.addEventListener('pointerup', loslassen)
    ziel.addEventListener('pointercancel', loslassen)
  }

  private einrasten(t: Teil) {
    t.gelegt = true; t.x = t.s; t.y = t.z
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) t.el.style.transition = 'transform .18s ease-out'
    t.el.style.filter = 'none'; t.el.style.pointerEvents = 'none'; t.el.style.zIndex = '2'
    this.setzen(t)
    this.gelegt++
    this.o.beiStand(this.gelegt, this.teile.length)
    this.o.beiEinrasten()
    if (this.gelegt === this.teile.length) {
      this.fertig = true
      window.setTimeout(() => { this.rahmen.style.zIndex = '100000'; this.ganzesBild.style.opacity = '1' }, 250)
      this.o.beiFertig()
    }
  }
}
