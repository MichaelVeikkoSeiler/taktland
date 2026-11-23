/**
 * «Gleisbau» (Spiele, #/gleisbau; Michael, 2026-11-22: «Man soll Gleise auf ein Layout legen können. Tunnel und Brücken und Bahnhöfe stehen
 * auch zur Verfügung», nach seiner eigenen Gestaltung «VIA» mit Feldern und Kacheln): ein Brett von 8 × 6 Feldern, je Feld ein Grund
 * (Wiese, Wald, Wasser, Berg, Dorf) und darauf höchstens ein Gleisstück. Ein Gleis auf Wasser ist eine Brücke, auf einem Berg ein Tunnel.
 * Hier nur das Brett und der Zug, ohne Darstellung (komponenten/Gleisbau.tsx). Ein Baukasten, keine Wirklichkeit: Masse und Tempo gewählt.
 */

export const SPALTEN = 8
export const ZEILEN = 6
/** wählbare Grössen des Bretts, Spalten × Zeilen (gewählt; Michael, 2026-11-22: «auch Anzahl Kacheln sollen wählbar sein») */
export const GROESSEN: Array<[number, number]> = [[6, 4], [8, 6], [10, 7], [12, 8]]
export const spalten = (b: Brett) => b[0]?.length ?? 0
export const zeilen = (b: Brett) => b.length

export type Grund = 'wiese' | 'wald' | 'wasser' | 'berg' | 'dorf'
export type GleisArt = 'gerade' | 'kurve' | 'weiche' | 'kreuzung' | 'prellbock' | 'bahnhof' | 'kurvenbahnhof' | 'dreiweg' | 'bogen2' | 'bogen3'

/** Bahnhof auf einer Geraden oder in einer Kurve (seit 2026-11-22; Michael: «Bahnhof darf auch in einer Kurve sein») */
export const istBahnhof = (g?: Gleis) => g?.art === 'bahnhof' || g?.art === 'kurvenbahnhof'
export type Dreh = 0 | 1 | 2 | 3

/** Weiche mit zwei oder, als Dreiwegweiche, drei Wegen (seit 2026-11-22; Michael: «Dreier-Weiche auch möglich machen») */
export const istWeiche = (g?: Gleis) => g?.art === 'weiche' || g?.art === 'dreiweg'
/** Kurve über 2 × 2 oder 3 × 3 Felder (seit 2026-11-22; Michael: «Kurvenelemente auch in 2x2 und 3x3 Kacheln»); n, sonst 0 */
export const grosseKurve = (g?: Gleis) => (g?.art === 'bogen2' ? 2 : g?.art === 'bogen3' ? 3 : 0)

export interface Gleis { art: GleisArt; dreh: Dreh; /** nur Weiche: 0 gerade, 1 und 2 abzweigend */ stellung?: 0 | 1 | 2 }
/** teil: das Feld liegt unter einer grossen Kurve, die im Feld [i, j] (ihrem Anfang) steht */
export interface Feld { grund: Grund; gleis?: Gleis; teil?: [number, number] }
export type Brett = Feld[][] // [Zeile][Spalte]

/** Kanten eines Felds: 0 Nord, 1 Ost, 2 Süd, 3 West; -1 die Mitte (Ende am Prellbock) */
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]

/** die Wege durch ein Stück ohne Drehung; bei der Weiche zuerst der gerade, dann der abzweigende, beide ab dem Stamm im Süden */
const WEGE: Record<GleisArt, Array<[number, number]>> = {
  gerade: [[0, 2]], bahnhof: [[0, 2]], kurve: [[2, 1]], kurvenbahnhof: [[2, 1]], weiche: [[2, 0], [2, 1]], kreuzung: [[0, 2], [1, 3]], prellbock: [[2, -1]],
  // die Dreiwegweiche: gerade, rechts, links; die grossen Kurven haben keine Wege in einem Feld (grossGeometrie)
  dreiweg: [[2, 0], [2, 1], [2, 3]], bogen2: [], bogen3: [],
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
  if (istWeiche(g)) {
    const stamm = w[0][0]
    if (ein === stamm) return w[Math.min(g.stellung ?? 0, w.length - 1)][1]
    return w.some(([, b]) => b === ein) ? stamm : null
  }
  for (const [a, b] of w) { if (a === ein) return b; if (b === ein) return a }
  return null
}

export function leer(sp = SPALTEN, ze = ZEILEN): Brett {
  return Array.from({ length: ze }, () => Array.from({ length: sp }, (): Feld => ({ grund: 'wiese' })))
}

/** dasselbe Brett in einer anderen Grösse: oben links bleibt, was Platz hat, der Rest wird Wiese oder fällt weg */
export function groesseAendern(b: Brett, sp: number, ze: number): Brett {
  const neu = Array.from({ length: ze }, (_, j) => Array.from({ length: sp }, (_, i): Feld => ({ ...(b[j]?.[i] ?? { grund: 'wiese' }) })))
  // grosse Kurven, die nicht mehr ganz aufs Brett passen, fallen weg
  for (let j = 0; j < ze; j++) for (let i = 0; i < sp; i++) {
    const f = neu[j][i]
    if (f.teil && !grosseKurve(neu[f.teil[1]]?.[f.teil[0]]?.gleis)) delete f.teil
    if (!grosseKurve(f.gleis)) continue
    const G = grossGeometrie(i, j, f.gleis!)
    if ([...G.zellen, [G.ende.i, G.ende.j]].every(([u, v]) => u < sp && v < ze)) continue
    delete f.gleis
    for (const [u, v] of G.zellen) if (neu[v]?.[u]) delete neu[v][u].teil
  }
  return neu
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

/** Kanten zwischen zwei Richtungen als Gleisstück: gegenüber eine Gerade, sonst eine Kurve */
function stueckFuer(a: number, b: number): Gleis {
  if ((a + 2) % 4 === b) return { art: 'gerade', dreh: (a % 2) as Dreh }
  // Kurve ohne Drehung verbindet Süd (2) und Ost (1)
  for (let r = 0; r < 4; r++) {
    const x = (2 + r) % 4, y = (1 + r) % 4
    if ((x === a && y === b) || (x === b && y === a)) return { art: 'kurve', dreh: r as Dreh }
  }
  return { art: 'gerade', dreh: 0 }
}

const richtungZu = (i: number, j: number, k: number, l: number) => (l < j ? 0 : k > i ? 1 : l > j ? 2 : 3)

/**
 * Ein neues, zufälliges Beispiel für jede Grösse (Michael, 2026-11-22: «Bei Beispiel sollen durch weiteres Tippen immer neue Beispiele
 * erscheinen»): ein Rechteck als Ring, mit zufälligen Ausbuchtungen nach aussen (ein Stück des Rings rückt um ein Feld hinaus, so bleibt er
 * ein einfacher Ring), oft ein Abstellgleis mit Weiche und Prellbock, ein Fluss quer übers Brett (Brücken), ein Berg (Tunnel), Wald, Dörfer
 * neben den Bahnhöfen; alles gewählt
 */
export function zufallsBeispiel(sp = SPALTEN, ze = ZEILEN): Brett {
  const z = (n: number) => Math.floor(Math.random() * n)
  const b = leer(sp, ze)
  // Ring als Folge von Feldern: zuerst ein Rechteck mit mindestens einem Feld Rand
  const x0 = 1 + z(Math.max(1, Math.floor(sp / 4))), y0 = 1 + z(Math.max(1, Math.floor(ze / 4)))
  const x1 = sp - 2 - z(Math.max(1, Math.floor(sp / 4))), y1 = ze - 2 - z(Math.max(1, Math.floor(ze / 4)))
  let ring: Array<[number, number]> = []
  for (let i = x0; i < x1; i++) ring.push([i, y0])
  for (let j = y0; j < y1; j++) ring.push([x1, j])
  for (let i = x1; i > x0; i--) ring.push([i, y1])
  for (let j = y1; j > y0; j--) ring.push([x0, j])
  const belegt = (i: number, j: number) => ring.some(([a, c]) => a === i && c === j)
  const imBrett = (i: number, j: number) => i >= 0 && j >= 0 && i < sp && j < ze
  // Ausbuchtungen: zwei Nachbarn im Ring, beide um dieselbe Richtung nach aussen verschoben
  for (let versuch = 0, n = 2 + z(5); versuch < 60 && n > 0; versuch++) {
    const k = z(ring.length), [ai, aj] = ring[k], [bi, bj] = ring[(k + 1) % ring.length]
    const ri = bj - aj, rj = ai - bi // nach links der Laufrichtung, beim Rechteck oben herum ist das aussen
    const ni = ai + ri, nj = aj + rj, mi = bi + ri, mj = bj + rj
    if (!imBrett(ni, nj) || !imBrett(mi, mj) || belegt(ni, nj) || belegt(mi, mj)) continue
    // die neuen Felder dürfen den Ring sonst nirgends berühren, sonst entstünden Abkürzungen
    const nachbar = (i: number, j: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => {
      const p = i + di, q = j + dj
      return belegt(p, q) && !(p === ai && q === aj) && !(p === bi && q === bj) && !(p === ni && q === nj) && !(p === mi && q === mj)
    })
    if (nachbar(ni, nj) || nachbar(mi, mj)) continue
    ring = [...ring.slice(0, k + 1), [ni, nj], [mi, mj], ...ring.slice(k + 1)]
    n--
  }
  const L = ring.length
  ring.forEach(([i, j], k) => {
    const [pi, pj] = ring[(k + L - 1) % L], [qi, qj] = ring[(k + 1) % L]
    b[j][i].gleis = stueckFuer(richtungZu(i, j, pi, pj), richtungZu(i, j, qi, qj))
  })
  const gerade = () => ring.filter(([i, j]) => b[j][i].gleis?.art === 'gerade')
  const kurven = () => ring.filter(([i, j]) => b[j][i].gleis?.art === 'kurve')
  // Abstellgleis: an einer Geraden eine Weiche, daneben ein bis zwei Felder frei, am Ende ein Prellbock
  if (Math.random() < 0.7) {
    for (const [i, j] of gerade().sort(() => Math.random() - 0.5)) {
      const g = b[j][i].gleis!, quer = [(g.dreh + 1) % 4, (g.dreh + 3) % 4]
      const c = quer[z(2)], lang = 1 + z(2)
      const felder = Array.from({ length: lang + 1 }, (_, k) => [i + [0, 1, 0, -1][c] * (k + 1), j + [-1, 0, 1, 0][c] * (k + 1)] as [number, number])
      if (!felder.every(([p, q]) => imBrett(p, q) && !b[q][p].gleis)) continue
      // die Felder des Abstellgleises dürfen den Ring nicht berühren
      if (felder.some(([p, q]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => {
        const u = p + di, v = q + dj
        return imBrett(u, v) && !!b[v][u].gleis && !(u === i && v === j) && !felder.some(([f, h]) => f === u && h === v)
      }))) continue
      b[j][i].gleis = { art: 'weiche', dreh: ((c + 3) % 4) as Dreh }
      felder.forEach(([p, q], k) => {
        b[q][p].gleis = k === lang ? { art: 'prellbock', dreh: c as Dreh } : { art: 'gerade', dreh: (c % 2) as Dreh }
      })
      break
    }
  }
  // Fluss quer übers Brett, Berg an einer Stelle des Rings, Seen und Wald dort, wo kein Gleis liegt
  // der Fluss kreuzt das Gleis nur quer über eine Gerade (sonst wäre die Strecke der Länge nach eine Brücke); bis 20 Versuche, sonst keiner
  if (Math.random() < 0.8) {
    for (let versuch = 0; versuch < 20; versuch++) {
      const senkrecht = Math.random() < 0.5
      let p = senkrecht ? z(sp) : z(ze)
      const fluss: Array<[number, number]> = []
      for (let k = 0; k < (senkrecht ? ze : sp); k++) {
        fluss.push(senkrecht ? [p, k] : [k, p])
        // ab und zu eine Biegung zum Nachbarfeld
        if (Math.random() < 0.25) {
          const neu = p + (Math.random() < 0.5 ? -1 : 1)
          if (neu >= 0 && neu < (senkrecht ? sp : ze)) { p = neu; fluss.push(senkrecht ? [p, k] : [k, p]) }
        }
      }
      const quer = (dreh: number) => (senkrecht ? dreh === 1 : dreh === 0)
      if (!fluss.every(([i, j]) => !b[j][i].gleis || (b[j][i].gleis!.art === 'gerade' && quer(b[j][i].gleis!.dreh)))) continue
      if (!fluss.some(([i, j]) => b[j][i].gleis)) continue
      for (const [i, j] of fluss) b[j][i].grund = 'wasser'
      break
    }
  }
  const geradeTrocken = gerade().filter(([i, j]) => b[j][i].grund === 'wiese')
  if (geradeTrocken.length) {
    const [bi, bj] = geradeTrocken[z(geradeTrocken.length)]
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) {
      const i = bi + di, j = bj + dj
      if (imBrett(i, j) && b[j][i].grund === 'wiese' && (Math.random() < 0.7 || (di === 0 && dj === 0))) b[j][i].grund = 'berg'
    }
  }
  // Bahnhöfe: zwei oder drei Geraden auf Wiese, möglichst weit auseinander
  // auch in Kurven, etwa jeder vierte Kandidat (gewählt)
  const frei = [...gerade(), ...kurven().filter(() => Math.random() < 0.25)].filter(([i, j]) => b[j][i].grund === 'wiese').sort(() => Math.random() - 0.5)
  const bahnhoefe: Array<[number, number]> = []
  for (const [i, j] of frei) {
    if (bahnhoefe.length >= 2 + z(2)) break
    if (bahnhoefe.every(([p, q]) => Math.abs(p - i) + Math.abs(q - j) >= 3)) {
      bahnhoefe.push([i, j]); b[j][i].gleis = { ...b[j][i].gleis!, art: b[j][i].gleis!.art === 'kurve' ? 'kurvenbahnhof' : 'bahnhof' }
    }
  }
  // Dörfer neben den Bahnhöfen, Wald verstreut
  for (const [i, j] of bahnhoefe) {
    for (const [di, dj] of [[0, -1], [0, 1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5).slice(0, 2)) {
      const u = i + di, v = j + dj
      if (imBrett(u, v) && !b[v][u].gleis && b[v][u].grund === 'wiese') b[v][u].grund = 'dorf'
    }
  }
  for (let k = 0, n = Math.round(sp * ze * 0.12); k < n; k++) {
    const i = z(sp), j = z(ze)
    if (!b[j][i].gleis && b[j][i].grund === 'wiese') b[j][i].grund = 'wald'
  }
  return b
}

const SPEICHER = 'taktland.gleisbau.v1'
const GRUENDE: Grund[] = ['wiese', 'wald', 'wasser', 'berg', 'dorf']
const ARTEN: GleisArt[] = ['gerade', 'kurve', 'weiche', 'kreuzung', 'prellbock', 'bahnhof', 'kurvenbahnhof', 'dreiweg', 'bogen2', 'bogen3']

/** das gemerkte Brett, nur wenn es heil ist */
export function brettLesen(): Brett | null {
  try {
    const x = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null') as Brett | null
    if (!Array.isArray(x) || !GROESSEN.some(([sp, ze]) => x.length === ze && x.every((z) => Array.isArray(z) && z.length === sp))) return null
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

/**
 * Ob die Kante k von Feld (i, j) in einen Tunnel weiterführt: der Nachbar liegt auch im Berg und sein Gleis reicht an dieselbe Kante.
 * Dort hat der Tunnel kein Portal, mehrere Tunnelfelder nacheinander sind ein Tunnel (Michael, 2026-11-22: «Mehrere Tunnelelemente nacheinander
 * werden zu einem Tunnel»)
 */
export function tunnelWeiter(b: Brett, i: number, j: number, k: number) {
  const u = i + DX[k], v = j + DY[k], n = b[v]?.[u]
  if (!n || n.grund !== 'berg') return false
  const gegen = (k + 2) % 4
  // eine grosse Kurve im Berg, die an dieser Kante endet, führt den Tunnel ebenso weiter
  if (n.teil || grosseKurve(n.gleis)) {
    const [hi, hj] = n.teil ?? [u, v], g = b[hj]?.[hi]?.gleis
    if (!grosseKurve(g)) return false
    const G = grossGeometrie(hi, hj, g!)
    return [G.anfang, G.ende].some((e) => e.i === u && e.j === v && e.kante === gegen)
  }
  if (!n.gleis) return false
  return wege(n.gleis).some(([a, c]) => a === gegen || c === gegen)
}

/** ob von Feld (i, j) über die Kante k ein Tunnel weiterführt; für die Enden grosser Kurven */
export const tunnelWeiterAnKante = (b: Brett, e: { i: number; j: number; kante: number }) => tunnelWeiter(b, e.i, e.j, e.kante)

/** das Feld des Anfangs einer grossen Kurve mit n Feldern und Drehung d, deren Block oben links bei (ox, oy) liegt */
export function grossAnfang(ox: number, oy: number, n: number, d: number): [number, number] {
  let x = 0, y = n - 1
  for (let k = 0; k < d; k++) [x, y] = [n - 1 - y, x]
  return [ox + x, oy + y]
}

/** das Brett ohne die grosse Kurve, die im Feld (i, j) steht oder darüber läuft */
export function grosseEntfernen(b: Brett, i: number, j: number): Brett {
  const [hi, hj] = b[j][i].teil ?? [i, j]
  const g = b[hj]?.[hi]?.gleis
  if (!grosseKurve(g)) return b
  const G = grossGeometrie(hi, hj, g!)
  const neu = b.map((z) => z.map((f) => ({ ...f })))
  delete neu[hj][hi].gleis
  for (const [u, v] of G.zellen) if (neu[v]?.[u]) delete neu[v][u].teil
  return neu
}

/** eine grosse Kurve mit Anfang im Feld (i, j) legen; null, wenn sie nicht aufs Brett passt oder ein Feld schon belegt ist */
export function grosseLegen(b: Brett, i: number, j: number, g: Gleis): Brett | null {
  const G = grossGeometrie(i, j, g)
  const imBrett = ([u, v]: [number, number]) => u >= 0 && v >= 0 && u < spalten(b) && v < zeilen(b)
  if (!G.zellen.every(imBrett) || !imBrett([G.ende.i, G.ende.j])) return null
  if (G.zellen.some(([u, v]) => b[v][u].gleis || b[v][u].teil)) return null
  const neu = b.map((z) => z.map((f) => ({ ...f })))
  neu[j][i] = { ...neu[j][i], gleis: g }
  for (const [u, v] of G.zellen) if (u !== i || v !== j) neu[v][u] = { ...neu[v][u], teil: [i, j] }
  return neu
}

/**
 * Ein Feld verschieben (Michael, 2026-11-22: «wenn man länger auf eine belegte Kachel drückt, dieses Feld verschieben kann»): Grund und Gleis
 * wandern vom Feld «von» nach «nach», was dort lag, kommt nach «von» (tauschen). Eine grosse Kurve wandert als Ganzes um denselben Abstand, der
 * Grund darunter bleibt. Gibt das neue Brett oder einen Grund, warum es nicht geht
 */
export function verschieben(b: Brett, von: [number, number], nach: [number, number]): Brett | string {
  const [vi, vj] = von, [ni, nj] = nach
  if (vi === ni && vj === nj) return b
  const quelle = b[vj][vi], ziel = b[nj]?.[ni]
  if (!ziel) return 'Ausserhalb des Bretts.'
  if (quelle.teil || grosseKurve(quelle.gleis)) {
    const [hi, hj] = quelle.teil ?? [vi, vj], g = b[hj][hi].gleis!
    const neu = grosseLegen(grosseEntfernen(b, vi, vj), hi + ni - vi, hj + nj - vj, g)
    return neu ?? 'Dort hat die Kurve keinen Platz: Sie bräuchte Felder, die schon belegt sind oder ausserhalb liegen.'
  }
  if (ziel.teil || grosseKurve(ziel.gleis)) return 'Dort liegt eine grosse Kurve. Verschiebe zuerst sie.'
  const neu = b.map((z) => z.slice())
  neu[nj][ni] = quelle
  neu[vj][vi] = ziel
  return neu
}

/** die Bahnhöfe der Reihe nach (Zeile, dann Spalte) mit Buchstaben A, B, C … */
export function bahnhofNamen(b: Brett): Map<string, string> {
  // Bahnhofsfelder, die einander an einer Kante berühren, sind ein Bahnhof mit einem Namen, das Schild auf dem ersten Feld (Michael, 2026-11-23:
  // «Wenn mehrere Bahnhöfe einander angrenzen soll es einer sein»)
  const n = new Map<string, string>(), gesehen = new Set<string>()
  let nr = 0
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    if (!istBahnhof(b[j][i].gleis) || gesehen.has(`${i},${j}`)) continue
    n.set(`${i},${j}`, String.fromCharCode(65 + (nr++ % 26)))
    const offen: Array<[number, number]> = [[i, j]]
    gesehen.add(`${i},${j}`)
    while (offen.length) {
      const [u, v] = offen.pop()!
      for (let k = 0; k < 4; k++) {
        const p = u + DX[k], q = v + DY[k], key = `${p},${q}`
        if (!gesehen.has(key) && istBahnhof(b[q]?.[p]?.gleis)) { gesehen.add(key); offen.push([p, q]) }
      }
    }
  }
  return n
}

// ——— Geometrie: ein Feld ist eine Einheit gross, die Mitte von Feld (i, j) liegt bei (i + 0,5, j + 0,5) ———

const kante = (k: number): [number, number] => (k < 0 ? [0, 0] : [DX[k] * 0.5, DY[k] * 0.5])

/**
 * Ein befahrenes Stück: in Feld (i, j) von Kante «ein» zu Kante «aus» (-1 die Mitte). Bei einer grossen Kurve ist (i, j) das Feld, in dem sie
 * endet, «aus» die Kante dort, und gross nennt das Feld, in dem sie beginnt, und den Kreisbogen
 */
export interface Stueck {
  i: number; j: number; ein: number; aus: number
  gross?: { i: number; j: number; kante: number; cx: number; cy: number; r: number; a0: number; da: number }
}

/** Ende einer grossen Kurve: Feld und Kante */
export interface KurvenEnde { i: number; j: number; kante: number }

/**
 * Die grosse Kurve, die im Feld (i, j) beginnt: ein Viertelkreis mit Radius n − 0,5 von der Mitte der Südkante des Felds unten links im Block
 * von n × n Feldern zur Mitte der Ostkante des Felds oben rechts, um die Ecke unten rechts; gedreht im Uhrzeigersinn um die Mitte des Blocks.
 * zellen: die Felder, durch die sie läuft (das Feld unten rechts bleibt frei)
 */
export function grossGeometrie(i: number, j: number, g: Gleis) {
  const n = grosseKurve(g), d = g.dreh
  const dreh = (x: number, y: number): [number, number] => { for (let k = 0; k < d; k++) [x, y] = [n - y, x]; return [x, y] }
  const zelle = (x: number, y: number): [number, number] => { for (let k = 0; k < d; k++) [x, y] = [n - 1 - y, x]; return [x, y] }
  // der Block: so verschoben, dass das Feld des Anfangs (unten links ohne Drehung) bei (i, j) liegt
  const [ax, ay] = zelle(0, n - 1), ox = i - ax, oy = j - ay
  const [cx, cy] = dreh(n, n)
  const a0 = Math.PI + (d * Math.PI) / 2, da = Math.PI / 2
  const [bx, by] = zelle(n - 1, 0)
  const anfang: KurvenEnde = { i, j, kante: (2 + d) % 4 }
  const ende: KurvenEnde = { i: ox + bx, j: oy + by, kante: (1 + d) % 4 }
  const zellen: Array<[number, number]> = []
  for (let k = 1; k < 60; k++) {
    const a = a0 + (da * k) / 60, x = ox + cx + (n - 0.5) * Math.cos(a), y = oy + cy + (n - 0.5) * Math.sin(a)
    const z: [number, number] = [Math.floor(x), Math.floor(y)]
    if (!zellen.some(([u, v]) => u === z[0] && v === z[1])) zellen.push(z)
  }
  // der Griff: das Eckfeld aussen, gegenüber der Mitte des Kreises; dort wird die Kurve gelegt, gedreht und mit einer Wiese gelöscht (Michael,
  // 2026-11-22: «der Drehpunkt immer im leeren Feld außerhalb der Kurve … außerhalb des Außenradiuses. Dort dreht man auch immer die Kurve …
  // dort kann man auch … eine Wiese setzen, und so ist die Kurve dann gelöscht»); er gehört zur Kurve, auch wo der Bogen ihn nicht berührt
  const [gx, gy] = zelle(0, 0), griff: [number, number] = [ox + gx, oy + gy]
  if (!zellen.some(([u, v]) => u === griff[0] && v === griff[1])) zellen.push(griff)
  return { n, anfang, ende, cx: ox + cx, cy: oy + cy, r: n - 0.5, a0, da, zellen, griff }
}

/** das Feld des Anfangs einer grossen Kurve mit n Feldern und Drehung d, deren Griff im Feld (i, j) liegt */
export function anfangZumGriff(i: number, j: number, n: number, d: number): [number, number] {
  let gx = 0, gy = 0
  for (let k = 0; k < d; k++) [gx, gy] = [n - 1 - gy, gx]
  return grossAnfang(i - gx, j - gy, n, d)
}

/** das Stück einer grossen Kurve vom Ende «von» aus, das an der Kante in sie hineinführt, oder null */
function grossStueck(b: Brett, f: Feld, i: number, j: number, ein: number): Stueck | null {
  const [hi, hj] = f.teil ?? [i, j]
  const halter = b[hj]?.[hi]?.gleis
  if (!grosseKurve(halter)) return null
  const G = grossGeometrie(hi, hj, halter!)
  const passt = (e: KurvenEnde) => e.i === i && e.j === j && e.kante === ein
  if (passt(G.anfang)) {
    return { i: G.ende.i, j: G.ende.j, ein: -2, aus: G.ende.kante, gross: { i, j, kante: ein, cx: G.cx, cy: G.cy, r: G.r, a0: G.a0, da: G.da } }
  }
  if (passt(G.ende)) {
    return { i: G.anfang.i, j: G.anfang.j, ein: -2, aus: G.anfang.kante, gross: { i, j, kante: ein, cx: G.cx, cy: G.cy, r: G.r, a0: G.a0 + G.da, da: -G.da } }
  }
  return null
}

const bogen = (s: Stueck) => s.ein >= 0 && s.aus >= 0 && (s.ein + 2) % 4 !== s.aus

export function stueckLaenge(s: Stueck) {
  if (s.gross) return s.gross.r * Math.abs(s.gross.da)
  if (s.ein < 0 || s.aus < 0) return 0.5
  return bogen(s) ? Math.PI / 4 : 1
}

/** Punkt und Richtung (Bogenmass) nach d Einheiten auf dem Stück */
export function stueckPunkt(s: Stueck, d: number): { x: number; y: number; w: number } {
  if (s.gross) {
    const G = s.gross, a = G.a0 + G.da * Math.max(0, Math.min(1, d / stueckLaenge(s)))
    return { x: G.cx + G.r * Math.cos(a), y: G.cy + G.r * Math.sin(a), w: a + Math.sign(G.da) * Math.PI / 2 }
  }
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

const umgekehrt = (s: Stueck): Stueck => (s.gross
  ? { i: s.gross.i, j: s.gross.j, ein: -2, aus: s.gross.kante,
      gross: { i: s.i, j: s.j, kante: s.aus, cx: s.gross.cx, cy: s.gross.cy, r: s.gross.r, a0: s.gross.a0 + s.gross.da, da: -s.gross.da } }
  : { i: s.i, j: s.j, ein: s.aus, aus: s.ein })

/** das Stück, das an das Ende von s anschliesst, oder null */
export function naechstes(b: Brett, s: Stueck): Stueck | null {
  if (s.aus < 0) return null
  const i = s.i + DX[s.aus], j = s.j + DY[s.aus]
  if (i < 0 || j < 0 || i >= spalten(b) || j >= zeilen(b)) return null
  const ein = (s.aus + 2) % 4
  const f = b[j][i]
  if (f.teil || grosseKurve(f.gleis)) return grossStueck(b, f, i, j, ein)
  const aus = ausgang(f.gleis, ein)
  return aus === null ? null : { i, j, ein, aus }
}

/** ein Stück zum Anfangen in einem Feld mit Gleis */
function erstesStueck(b: Brett, i: number, j: number): Stueck | null {
  const g = b[j][i].gleis
  if (!g) return null
  if (grosseKurve(g)) { const G = grossGeometrie(i, j, g); return grossStueck(b, b[j][i], i, j, G.anfang.kante) }
  const [a, c] = wege(g)[0]
  return { i, j, ein: a, aus: c }
}

/**
 * Wo ein Gleis offen endet (Michael, 2026-11-23, Vorschlag «Anzeige, wo das Gleis offen endet»): jede Kante eines Gleisstücks, an der im Nachbarfeld
 * kein Gleis anschliesst; Punkt auf der Kante und die Richtung hinaus. Prellböcke sind kein offenes Ende
 */
export function offeneEnden(b: Brett): Array<{ x: number; y: number; k: number }> {
  const raus: Array<{ x: number; y: number; k: number }> = []
  const verbunden = (i: number, j: number, k: number) => {
    const u = i + DX[k], v = j + DY[k]
    if (u < 0 || v < 0 || u >= spalten(b) || v >= zeilen(b)) return false
    const ein = (k + 2) % 4, n = b[v][u]
    if (n.teil || grosseKurve(n.gleis)) return grossStueck(b, n, u, v, ein) !== null
    return ausgang(n.gleis, ein) !== null
  }
  const dazu = (i: number, j: number, k: number) => { if (!verbunden(i, j, k)) raus.push({ x: i + 0.5 + DX[k] * 0.5, y: j + 0.5 + DY[k] * 0.5, k }) }
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    const g = b[j][i].gleis
    if (!g) continue
    if (grosseKurve(g)) { const G = grossGeometrie(i, j, g); dazu(G.anfang.i, G.anfang.j, G.anfang.kante); dazu(G.ende.i, G.ende.j, G.ende.kante); continue }
    for (const k of new Set(wege(g).flat())) if (k >= 0) dazu(i, j, k)
  }
  return raus
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
/** der Pfiff so lange vor der Abfahrt (gewählt) */
const PFIFF_VOR_S = 0.9

export interface WagenLage { x: number; y: number; w: number; /** 0 Lok, 1 und 2 Wagen, 3 Steuerwagen */ art: number; vorne: boolean }

export class Zug {
  /** die befahrenen Stücke, das letzte trägt die Spitze */
  private stuecke: Stueck[] = []
  private kopf = 0
  private tempo = 0
  private halt = 0
  /** true, wenn der Steuerwagen vorne fährt */
  private rueckwaerts = false
  /** ob der Halt an einem Bahnhof ist (nicht das Umkehren) */
  private amBahnhof = false
  /** zählt hoch, wenn der Zug PFIFF_VOR_S vor der Abfahrt an einem Bahnhof steht; die Darstellung pfeift dann */
  pfiffe = 0

  /** null, wenn auf dem Brett kein Gleis liegt */
  static setzen(b: Brett): Zug | null {
    let start: Stueck | null = null
    for (let j = 0; j < zeilen(b) && !start; j++) for (let i = 0; i < spalten(b) && !start; i++) {
      if (istBahnhof(b[j][i].gleis)) start = erstesStueck(b, i, j)
    }
    for (let j = 0; j < zeilen(b) && !start; j++) for (let i = 0; i < spalten(b) && !start; i++) start = erstesStueck(b, i, j)
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
    if (istBahnhof(b[start.j][start.i].gleis)) { z.halt = HALT_S; z.amBahnhof = true }
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
    this.amBahnhof = false
    this.kuerzen()
  }

  schritt(b: Brett, dt: number) {
    if (this.halt > 0) {
      if (this.amBahnhof && this.halt > PFIFF_VOR_S && this.halt - dt <= PFIFF_VOR_S) this.pfiffe++
      this.halt -= dt
      return
    }
    this.tempo = Math.min(TEMPO, this.tempo + (TEMPO / ANFAHREN) * dt)
    let rest = this.tempo * dt
    for (let k = 0; k < 8 && rest > 0; k++) {
      const s = this.stuecke[this.stuecke.length - 1], l = stueckLaenge(s)
      const mitte = l / 2, vorher = this.kopf
      // am Bahnhof in der Mitte des Felds halten
      // in einem Bahnhof aus mehreren Feldern nur einmal, im letzten Feld in Fahrtrichtung
      const weiterImBahnhof = () => { const n = naechstes(b, s); return !!n && !n.gross && istBahnhof(b[n.j][n.i].gleis) }
      if (!s.gross && istBahnhof(b[s.j][s.i].gleis) && vorher < mitte && vorher + rest >= mitte && !weiterImBahnhof()) {
        this.kopf = mitte; this.halt = HALT_S; this.amBahnhof = true; this.tempo = 0; return
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
  /** wie schnell, 0 bis 1 vom Höchsttempo; 0 im Halt */
  anteil() { return this.halt > 0 ? 0 : this.tempo / TEMPO }

  /** Feld unter der Spitze */
  spitze(): [number, number] { const p = this.punkt(0); return [Math.floor(p.x), Math.floor(p.y)] }

  wagen(): WagenLage[] {
    return Array.from({ length: WAGEN }, (_, k) => {
      const vorn = k * (WAGEN_LAENGE + WAGEN_LUECKE), a = this.punkt(vorn), c = this.punkt(vorn + WAGEN_LAENGE)
      const art = this.rueckwaerts ? WAGEN - 1 - k : k
      return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, w: Math.atan2(a.y - c.y, a.x - c.x), art, vorne: k === 0 }
    })
  }
}
