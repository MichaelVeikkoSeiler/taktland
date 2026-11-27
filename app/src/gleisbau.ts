/**
 * «Gleisbau» (Spiele, #/gleisbau; Michael, 2026-11-22: «Man soll Gleise auf ein Layout legen können. Tunnel und Brücken und Bahnhöfe stehen
 * auch zur Verfügung», nach seiner eigenen Gestaltung «VIA» mit Feldern und Kacheln): ein Brett von 8 × 6 Feldern, je Feld ein Grund
 * (Wiese, Wald, Wasser, Berg, Dorf) und darauf höchstens ein Gleisstück. Ein Gleis auf Wasser ist eine Brücke, auf einem Berg ein Tunnel.
 * Hier nur das Brett und der Zug, ohne Darstellung (komponenten/Gleisbau.tsx). Ein Baukasten, keine Wirklichkeit: Masse und Tempo gewählt.
 */

export const SPALTEN = 8
export const ZEILEN = 6
/** wählbare Grössen des Bretts, Spalten × Zeilen (gewählt; Michael, 2026-11-22: «auch Anzahl Kacheln sollen wählbar sein») */
// seit 2026-11-23 frei wählbar statt vorgegebener Grössen (Michael: «bei einem neuen Brett die Felderzahl manuell eingeben können», «Keine Vorgegebenen
// Grössen mehr»): je Seite MIN_SEITE bis MAX_SEITE Felder (gewählt, grösser wird es auf dem Handy zu klein und langsam)
// seit 2026-11-24 bis 192 breit und 108 hoch (Michael: «Brettgrösse auf 192x108 erhöhen»; vorher je 30)
/**
 * höchstens 100 × 70 Felder für neue und vergrösserte Bretter (Michael, 2026-11-25: «Maximale Brettgrösse nur noch 100x70»; vorher 192 × 108); ältere,
 * grössere Bretter lassen sich weiter öffnen und verkleinern (LESBAR_*), damit kein gespeichertes Brett verloren geht
 */
export const MIN_SEITE = 3, MAX_BREITE = 100, MAX_HOEHE = 70
const LESBAR_BREITE = 192, LESBAR_HOEHE = 108
export const groesseOk = (sp: number, ze: number) => Number.isInteger(sp) && Number.isInteger(ze) && sp >= MIN_SEITE && ze >= MIN_SEITE && sp <= MAX_BREITE && ze <= MAX_HOEHE
const groesseLesbar = (sp: number, ze: number) => Number.isInteger(sp) && Number.isInteger(ze) && sp >= MIN_SEITE && ze >= MIN_SEITE && sp <= LESBAR_BREITE && ze <= LESBAR_HOEHE
/** neue Grösse eines bestehenden Bretts: erlaubt oder jedenfalls nicht grösser als vorher */
const groesseNeuOk = (sp: number, ze: number, nsp: number, nze: number) => groesseOk(nsp, nze) || (groesseLesbar(nsp, nze) && nsp <= sp && nze <= ze)
export const spalten = (b: Brett) => b[0]?.length ?? 0
export const zeilen = (b: Brett) => b.length

export type Grund = 'wiese' | 'wald' | 'wasser' | 'berg' | 'dorf' | 'rebberg' | 'schnee' | 'acker'
export type GleisArt = 'gerade' | 'kurve' | 'weiche' | 'kreuzung' | 'prellbock' | 'bahnhof' | 'kurvenbahnhof' | 'dreiweg' | 'bogen2' | 'bogen3' | 'weiche_l' | 'doppelkurve' | 'ueberfuehrung' | 'tweiche'

/** Bahnhof auf einer Geraden oder in einer Kurve (seit 2026-11-22; Michael: «Bahnhof darf auch in einer Kurve sein») */
/** wo eine Ampel stehen kann: an einer Geraden, Kurve oder einem Bahnhof */
export const ampelGilt = (f?: Feld) => !!f?.ampel && !!f.gleis && ['gerade', 'kurve', 'bahnhof', 'kurvenbahnhof'].includes(f.gleis.art)
/** ob das Bauwerk zum Gleis passt: das Depot auf einem Prellbock, die anderen an einer Geraden */
export const bauGilt = (f?: Feld) => !!f?.bau && !!f.gleis && (f.bau === 'depot' ? f.gleis.art === 'prellbock' : f.gleis.art === 'gerade')
/** ob ein Gleis hier über Wasser führt (See, Fluss oder Brücke): dann eine Brücke */
export const ueberWasser = (f?: Feld) => !!f && (f.grund === 'wasser' || !!f.bruecke || !!f.fluss)
/** wo ein Wagen abgestellt werden kann: auf einer Geraden, einem Bahnhof oder vor einem Prellbock */
export const wagenGilt = (f?: Feld) => !!f?.gleis && !f.teil && ['gerade', 'bahnhof', 'prellbock'].includes(f.gleis.art)
export const istBahnhof = (g?: Gleis) => g?.art === 'bahnhof' || g?.art === 'kurvenbahnhof'
export type Dreh = 0 | 1 | 2 | 3

/** Weiche mit zwei oder, als Dreiwegweiche, drei Wegen (seit 2026-11-22; Michael: «Dreier-Weiche auch möglich machen») */
// seit 2026-11-23 auch gespiegelt, der Abzweig nach links (Michael: «Weichen muss man spiegeln können»)
// seit 2026-11-27 die T-Weiche: von unten nach links oder rechts, ohne Gerade (Michael: «Wir benötigen noch eine T Weiche»)
export const istWeiche = (g?: Gleis) => g?.art === 'weiche' || g?.art === 'weiche_l' || g?.art === 'dreiweg' || g?.art === 'tweiche'
/** Kurve über 2 × 2 oder 3 × 3 Felder (seit 2026-11-22; Michael: «Kurvenelemente auch in 2x2 und 3x3 Kacheln»); n, sonst 0 */
export const grosseKurve = (g?: Gleis) => (g?.art === 'bogen2' ? 2 : g?.art === 'bogen3' ? 3 : 0)

export interface Gleis { art: GleisArt; dreh: Dreh; /** nur Weiche: 0 gerade, 1 und 2 abzweigend */ stellung?: 0 | 1 | 2 }
/** teil: das Feld liegt unter einer grossen Kurve, die im Feld [i, j] (ihrem Anfang) steht */
export interface Feld { grund: Grund; gleis?: Gleis; teil?: [number, number]; /** eine Strasse im Feld; kreuzt sie eine Gerade, ist es ein Bahnübergang */ strasse?: true
  /** seit 2026-11-26: wohin die Strasse führt, je Kante ein Bit (1 Nord, 2 Ost, 4 Süd, 8 West), so wie gezogen; fehlt es, verbindet sie sich von selbst */
  strKanten?: number
  /** eine Brücke, auch ohne Wasser darunter (seit 2026-11-24; Michael: «Beim Brückenbau kein See mehr automatisch darunter») */ bruecke?: true
  /** ein Fluss durch das Feld (seit 2026-11-24): fliesst zu Nachbarn mit Fluss oder Wasser; ein Gleis darüber ist eine Brücke */
  fluss?: true
  /** der Bahnhof ist ein Knoten im Taktfahrplan (seit 2026-11-24): dort fahren die Züge zur Taktzeit ab */
  knoten?: true
  /** Gelände (seit 2026-11-24): 0 bis 7 ein Hang, der in diese Richtung ansteigt (0 Nord, 1 Nordost … 7 Nordwest), 8 Hügel, 9 Mulde */
  hang?: number
  /** Gleis ohne Fahrleitung (seit 2026-11-24); sonst ist jedes Gleis elektrifiziert */
  ohneStrom?: true
  /** ein abgestellter Wagen auf dem Gleis (seit 2026-11-24): ein Zug, der hineinfährt, kuppelt ihn an */
  wagen?: true
  /** ein einzelnes Objekt im Feld (seit 2026-11-24, Bilder von Michael): Kirche oder Bauernhof */
  objekt?: 'kirche' | 'bauernhof'
  /** ein Bauwerk über dem Gleis (seit 2026-11-24, Bilder von Michael): Depot auf einem Prellbock, Güterschuppen und Galerie an einer Geraden */
  bau?: 'depot' | 'gueter' | 'galerie'
  /** eine Ampel am Gleis (seit 2026-11-24; Michael: «Weiteres Element: Ampel»): bei Rot hält der Zug vor dem Feld */ ampel?: 'rot' | 'gruen'
  /** Name eines echten Bahnhofs aus Taktland für den Bahnhof, zu dem dieses Feld gehört */ name?: string
  /**
   * Strassen für Busse (seit 2026-11-25; Michael: «Gerne alle» auf die Vorschläge Bus, Haltestelle, Anschluss, Strassenbrücke, Strasse über Wasser und
   * durch den Berg, Wendeplatz, Anzahl Busse): eine Bushaltestelle an einer geraden Strasse, ein Wendeplatz am Ende einer Strasse, eine Strasse als Brücke
   * (über ein Gleis führt sie dann darüber statt als Bahnübergang); gelten nur mit Strasse
   */
  haltestelle?: true
  wende?: true
  strBruecke?: true
  /**
   * hier steht vor der Fahrt ein Zug, p ein Personenzug, g ein Güterzug (seit 2026-11-25; Michael: «Erstelle Aufgaben für Personentransporte und
   * Gütertransporte. Unter den Tools sollten Züge aus beiden Kat gewählt werden können»); gibt es solche Felder, fahren genau diese Züge
   */
  zugStart?: 'p' | 'g'
  /** beim freien Bauen: Lok und Wagen des Zugs auf diesem Feld (seit 2026-11-26; Michael: «beim freien Bauen auf alle Züge ohne Grenzen Zugriff»), Teil «~c» */
  zusammen?: { lok: string; wagen: string[] }
  /** der Name der Anlage an einem Güterschuppen, im Bahnbetrieb (Sägerei, Kieswerk …; fiktiv) */
  anlage?: string }
/** ein Feld, auf dem ein Zug starten kann: ein einfaches Gleis, keine grosse Kurve */
export const zugStartGilt = (f?: Feld) => !!f?.gleis && !f.teil && !grosseKurve(f.gleis)
export type Brett = Feld[][] // [Zeile][Spalte]

/** Kanten eines Felds: 0 Nord, 1 Ost, 2 Süd, 3 West; -1 die Mitte (Ende am Prellbock) */
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]

/** die Wege durch ein Stück ohne Drehung; bei der Weiche zuerst der gerade, dann der abzweigende, beide ab dem Stamm im Süden */
const WEGE: Record<GleisArt, Array<[number, number]>> = {
  gerade: [[0, 2]], bahnhof: [[0, 2]], kurve: [[2, 1]], kurvenbahnhof: [[2, 1]], weiche: [[2, 0], [2, 1]], weiche_l: [[2, 0], [2, 3]], kreuzung: [[0, 2], [1, 3]], prellbock: [[2, -1]],
  // zwei gegenüberliegende Kurven in einem Feld, Süd–Ost und Nord–West, ohne Verbindung zueinander (Michael, 2026-11-24: «auf einer Kachel sollen auch 2 gegenüberliegende Kurven möglich sein»)
  doppelkurve: [[2, 1], [0, 3]],
  // Brücke über Gleis (seit 2026-11-24; Michael: «Es sollte auch ein Element geben Brücke über Gleis»): wie die Kreuzung, das zweite Gleis führt oben darüber
  ueberfuehrung: [[0, 2], [1, 3]],
  // die Dreiwegweiche: gerade, rechts, links; die grossen Kurven haben keine Wege in einem Feld (grossGeometrie)
  dreiweg: [[2, 0], [2, 1], [2, 3]], bogen2: [], bogen3: [],
  tweiche: [[2, 1], [2, 3]],
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

/**
 * Gleis entlang einer Folge benachbarter Felder legen (Michael, 2026-11-23, Vorschlag «Gleis ziehen statt einzeln setzen»): je Feld eine Gerade oder
 * Kurve von der Kante zum vorherigen zur Kante zum nächsten Feld, am Anfang und Ende gerade weiter. Wo schon ein Gleis liegt: hat es die Kante
 * bereits, bleibt es; eine Gerade quer zur neuen wird zur Kreuzung, zweigt die Linie von einer Geraden ab, wird diese zur Weiche; ein Bahnhof oder eine Weiche in Richtung der Linie bleibt; sonst ersetzt die Linie
 * das Stück, ausser einen Bahnhof. Kommt die Linie an ein Feld zurück (ein Ring schliesst sich), zählen alle Kanten dort. Über grosse Kurven führt
 * keine Linie. Gibt das neue Brett oder einen Grund
 */
export function linieLegen(b: Brett, felder: Array<[number, number]>): Brett | string {
  if (felder.length < 2) return b
  // je Feld alle Kanten, die die Linie dort braucht (ein Feld kann mehrmals vorkommen, etwa wenn sich ein Ring schliesst)
  const noetig = new Map<string, Set<number>>()
  for (let k = 0; k < felder.length; k++) {
    const [i, j] = felder[k], key = `${i},${j}`
    if (!noetig.has(key)) noetig.set(key, new Set())
    if (k > 0) noetig.get(key)!.add(richtungZu(i, j, felder[k - 1][0], felder[k - 1][1]))
    if (k < felder.length - 1) noetig.get(key)!.add(richtungZu(i, j, felder[k + 1][0], felder[k + 1][1]))
  }
  const neu = b.map((z) => z.map((f) => ({ ...f })))
  for (const [key, kanten] of noetig) {
    const [i, j] = key.split(',').map(Number), f = neu[j][i]
    if (f.teil || grosseKurve(f.gleis)) {
      // an einem Ende einer grossen Kurve darf die Linie anschliessen, darüber hinweg nicht
      const [hi, hj] = f.teil ?? [i, j], G = grossGeometrie(hi, hj, neu[hj][hi].gleis!)
      const ende = [G.anfang, G.ende].find((e) => e.i === i && e.j === j)
      if (ende && [...kanten].every((x) => x === ende.kante)) continue
      return 'Über eine grosse Kurve lässt sich keine Linie ziehen, nur an ihren Enden anschliessen.'
    }
    const alt = f.gleis
    const k = [...kanten]
    if (alt) {
      const hat = new Set(wege(alt).flat()), fehlt = k.filter((x) => !hat.has(x))
      if (!fehlt.length) continue
      if (alt.art === 'gerade' && fehlt.length === 2 && (fehlt[0] + 2) % 4 === fehlt[1]) { f.gleis = { art: 'kreuzung', dreh: 0 }; continue }
      // eine Kurve und die Linie auf den beiden anderen Kanten: die Doppelkurve
      if (alt.art === 'kurve' && fehlt.length === 2 && fehlt.length === k.length) { f.gleis = { art: 'doppelkurve', dreh: (alt.dreh % 2) as Dreh }; continue }
      if (alt.art === 'gerade' && fehlt.length === 1 && fehlt[0] % 2 !== alt.dreh % 2) { f.gleis = { art: 'weiche', dreh: ((fehlt[0] + 3) % 4) as Dreh }; continue }
      // einen Bahnhof ersetzt die Linie nicht
      if (istBahnhof(alt)) continue
    }
    if (k.length === 1) f.gleis = stueckFuer(k[0], (k[0] + 2) % 4)
    else if (k.length === 2) f.gleis = stueckFuer(k[0], k[1])
    else if (k.length === 3) { const m = k.find((x) => !kanten.has((x + 2) % 4))!; f.gleis = { art: 'weiche', dreh: ((m + 3) % 4) as Dreh } }
    else f.gleis = { art: 'kreuzung', dreh: 0 }
  }
  return neu
}

/**
 * zwei offene Enden verbinden (Michael, 2026-11-26: «wenn man 2 rote Punkte mit der Maus verbinden könnte und sich dann das nächstlogische Gleis dazwischen
 * aufbauen würde»): der kürzeste Weg über freie Felder (ohne Gleis, Bau oder Haus; Berg und Wasser gehen, sie werden Tunnel und Brücke), je Kurve
 * KURVE_KOSTEN mehr, damit es möglichst gerade wird; gibt die Felder für linieLegen, von Gleis zu Gleis, oder einen Grund
 */
const KURVE_KOSTEN = 0.6
export function endenWeg(b: Brett, a: { x: number; y: number; k: number }, c: { x: number; y: number; k: number },
  gesperrt?: (i: number, j: number) => boolean): Array<[number, number]> | string {
  const feldVon = (e: { x: number; y: number; k: number }): [number, number] => [Math.floor(e.x - DX[e.k] * 0.1), Math.floor(e.y - DY[e.k] * 0.1)]
  const A = feldVon(a), C = feldVon(c)
  const NA: [number, number] = [A[0] + DX[a.k], A[1] + DY[a.k]], NC: [number, number] = [C[0] + DX[c.k], C[1] + DY[c.k]]
  const frei = (i: number, j: number) => i >= 0 && j >= 0 && i < spalten(b) && j < zeilen(b) && !b[j][i].gleis && !b[j][i].teil && !b[j][i].bau && !b[j][i].objekt && !gesperrt?.(i, j)
  if (!frei(...NA) || !frei(...NC)) return 'Vor diesem Ende ist kein Platz für ein Gleis.'
  // ein Feld dazwischen: es braucht zwei verschiedene Kanten
  if (NA[0] === NC[0] && NA[1] === NC[1]) return (a.k + 2) % 4 === (c.k + 2) % 4 ? 'Diese beiden Enden lassen sich nicht verbinden.' : [A, NA, C]
  // Dijkstra über Feld und Richtung, in der man es verlässt
  const W = spalten(b), key = (i: number, j: number, d: number) => (j * W + i) * 4 + d
  const kosten = new Map<number, number>(), vor = new Map<number, number>()
  const offen: Array<[number, number, number, number]> = [[0, NA[0], NA[1], a.k]]
  kosten.set(key(NA[0], NA[1], a.k), 0)
  let ziel = -1
  while (offen.length) {
    offen.sort((x, y) => x[0] - y[0])
    const [g, i, j, d] = offen.shift()!
    const kk = key(i, j, d)
    if (g > (kosten.get(kk) ?? Infinity)) continue
    if (i === NC[0] && j === NC[1]) {
      // vom Zielfeld noch zum Gleis: Richtung zurück zum Ende
      ziel = kk; break
    }
    for (let n = 0; n < 4; n++) {
      if (n === (d + 2) % 4) continue
      const u = i + DX[n], v = j + DY[n]
      if (!frei(u, v)) continue
      const gn = g + 1 + (n !== d ? KURVE_KOSTEN : 0), kn = key(u, v, n)
      if (gn < (kosten.get(kn) ?? Infinity)) { kosten.set(kn, gn); vor.set(kn, kk); offen.push([gn, u, v, n]) }
    }
    if (kosten.size > 20000) break
  }
  if (ziel < 0) return 'Zwischen diesen Enden findet sich kein freier Weg.'
  const weg: Array<[number, number]> = []
  for (let k: number | undefined = ziel; k !== undefined; k = vor.get(k)) { const f = Math.floor(k / 4); weg.unshift([f % W, Math.floor(f / W)]) }
  return [A, ...weg, C]
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
  for (let versuch = 0, n = 2 + z(5) + Math.floor((sp * ze) / 24); versuch < 60 + sp * ze && n > 0; versuch++) {
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
  // auf grossen Brettern mehrere Berge, etwa einer je 48 Felder
  for (let berge = Math.max(1, Math.round((sp * ze) / 48)); berge > 0; berge--) {
  const geradeTrocken = gerade().filter(([i, j]) => b[j][i].grund === 'wiese')
  if (geradeTrocken.length) {
    const [bi, bj] = geradeTrocken[z(geradeTrocken.length)]
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) {
      const i = bi + di, j = bj + dj
      if (imBrett(i, j) && b[j][i].grund === 'wiese' && (Math.random() < 0.7 || (di === 0 && dj === 0))) b[j][i].grund = 'berg'
    }
  }
  }
  // Bahnhöfe: zwei oder drei Geraden auf Wiese, möglichst weit auseinander
  // auch in Kurven, etwa jeder vierte Kandidat (gewählt)
  const frei = [...gerade(), ...kurven().filter(() => Math.random() < 0.25)].filter(([i, j]) => b[j][i].grund === 'wiese').sort(() => Math.random() - 0.5)
  const bahnhoefe: Array<[number, number]> = []
  for (const [i, j] of frei) {
    if (bahnhoefe.length >= 2 + z(2) + Math.floor((sp * ze) / 80)) break
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
const GRUENDE: Grund[] = ['wiese', 'wald', 'wasser', 'berg', 'dorf', 'rebberg', 'schnee', 'acker']
const ARTEN: GleisArt[] = ['gerade', 'kurve', 'weiche', 'kreuzung', 'prellbock', 'bahnhof', 'kurvenbahnhof', 'dreiweg', 'bogen2', 'bogen3', 'weiche_l', 'doppelkurve', 'ueberfuehrung', 'tweiche']

/** das gemerkte Brett, nur wenn es heil ist */
export function brettLesen(): Brett | null {
  try {
    const x = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null') as Brett | null
    if (!Array.isArray(x) || !Array.isArray(x[0]) || !groesseLesbar(x[0].length, x.length) || !x.every((z) => Array.isArray(z) && z.length === x[0].length)) return null
    for (const z of x) for (const f of z) {
      if (!GRUENDE.includes(f.grund)) return null
      if (f.gleis && (!ARTEN.includes(f.gleis.art) || ![0, 1, 2, 3].includes(f.gleis.dreh))) return null
    }
    return x
  } catch { return null }
}

/**
 * Ein Brett als kurzer Text für Links und die Liste der Bretter (Michael, 2026-11-23, Vorschlag «Bretter speichern und teilen»): «1~», dann Zeile für
 * Zeile, getrennt mit «-», je Feld der Grund (w f s b d) und das Gleis als Zeichen (Art × 4 + Drehung) oder «.». Weitere Teile kommen nach einem
 * weiteren «~» dazu
 */
const GRUND_Z = 'wfsbdrna', STRASSE_Z = 'WFSBDRNA', GLEIS_Z = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123'
const namenEsc = (n: string) => encodeURIComponent(n).replace(/[.\-_~!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
export function brettCode(b: Brett): string {
  // Namen der Bahnhöfe als weiterer Teil: «n», dann je Feld Spalte.Zeile.Name, getrennt mit «_»
  const namen: string[] = []
  b.forEach((z, j) => z.forEach((f, i) => { if (f.name && istBahnhof(f.gleis)) namen.push(`${i}.${j}.${namenEsc(f.name)}`) }))
  // Brücken ohne Wasser und Ampeln als weitere Teile «b» (Spalte.Zeile) und «a» (Spalte.Zeile.r oder g)
  const bruecken: string[] = [], ampeln: string[] = [], zugStarts: string[] = [], anlagen: string[] = [], halte: string[] = [], wenden: string[] = [], strBruecken: string[] = [], objekte: string[] = [], bauten: string[] = [], fluesse: string[] = [], abgestellt: string[] = [], knoten: string[] = [], haenge: string[] = [], stromlos: string[] = [], strVerb: string[] = [], zusammen: string[] = []
  b.forEach((z, j) => z.forEach((f, i) => {
    if (f.fluss) fluesse.push(`${i}.${j}`)
    if (f.strasse && f.haltestelle) halte.push(`${i}.${j}`)
    if (f.zugStart && zugStartGilt(f)) zugStarts.push(`${i}.${j}.${f.zugStart}`)
    if (f.zugStart && zugStartGilt(f) && f.zusammen) zusammen.push(`${i}.${j}.${f.zusammen.lok}.${f.zusammen.wagen.join('-')}`)
    if (f.anlage && gueterGilt(f)) anlagen.push(`${i}.${j}.${namenEsc(f.anlage)}`)
    if (f.strasse && f.wende) wenden.push(`${i}.${j}`)
    if (f.strasse && f.strBruecke) strBruecken.push(`${i}.${j}`)
    if (f.strasse && f.strKanten !== undefined) strVerb.push(`${i}.${j}.${f.strKanten}`)
    if (f.knoten && istBahnhof(f.gleis)) knoten.push(`${i}.${j}`)
    if (f.hang !== undefined) haenge.push(`${i}.${j}.${f.hang}`)
    if (f.ohneStrom && f.gleis) stromlos.push(`${i}.${j}`)
    if (f.wagen && wagenGilt(f)) abgestellt.push(`${i}.${j}`)
    if (f.objekt) objekte.push(`${i}.${j}.${f.objekt === 'kirche' ? 'k' : 'h'}`)
    if (bauGilt(f)) bauten.push(`${i}.${j}.${f.bau === 'depot' ? 'd' : f.bau === 'gueter' ? 'g' : 'l'}`)
    if (f.bruecke && f.gleis) bruecken.push(`${i}.${j}`)
    if (f.ampel && f.gleis) ampeln.push(`${i}.${j}.${f.ampel === 'rot' ? 'r' : 'g'}`)
  }))
  return '1~' + b.map((z) => z.map((f) => (f.strasse ? STRASSE_Z : GRUND_Z)[GRUENDE.indexOf(f.grund)] + (f.gleis ? GLEIS_Z[ARTEN.indexOf(f.gleis.art) * 4 + f.gleis.dreh] : '.')).join('')).join('-') + (namen.length ? `~n${namen.join('_')}` : '')
    + (bruecken.length ? `~b${bruecken.join('_')}` : '') + (ampeln.length ? `~a${ampeln.join('_')}` : '')
    + (objekte.length ? `~o${objekte.join('_')}` : '') + (bauten.length ? `~u${bauten.join('_')}` : '')
    + (fluesse.length ? `~f${fluesse.join('_')}` : '') + (abgestellt.length ? `~w${abgestellt.join('_')}` : '')
    + (knoten.length ? `~k${knoten.join('_')}` : '') + (haenge.length ? `~h${haenge.join('_')}` : '') + (stromlos.length ? `~s${stromlos.join('_')}` : '')
    + (halte.length ? `~y${halte.join('_')}` : '') + (wenden.length ? `~e${wenden.join('_')}` : '') + (strBruecken.length ? `~r${strBruecken.join('_')}` : '')
    + (zugStarts.length ? `~t${zugStarts.join('_')}` : '') + (anlagen.length ? `~m${anlagen.join('_')}` : '')
    + (strVerb.length ? `~v${strVerb.join('_')}` : '') + (zusammen.length ? `~c${zusammen.join('_')}` : '')
}
export function brettAusCode(c: string): Brett | null {
  const [v, felder, ...weitere] = c.split('~')
  if (v !== '1' || !felder) return null
  const zeilenText = felder.split('-')
  const b: Brett = zeilenText.map((z) => Array.from({ length: z.length / 2 }, (_, k) => {
    const g = GRUND_Z.indexOf(z[2 * k]), gs = STRASSE_Z.indexOf(z[2 * k]), a = GLEIS_Z.indexOf(z[2 * k + 1])
    const f: Feld = { grund: GRUENDE[Math.max(0, g, gs)] }
    if (gs >= 0) f.strasse = true
    if (a >= 0) f.gleis = { art: ARTEN[Math.floor(a / 4)], dreh: (a % 4) as Dreh }
    return f
  }))
  if (!b.length || !groesseLesbar(b[0].length, b.length) || !b.every((z) => z.length === b[0].length)) return null
  for (const teil of weitere) {
    if (teil.startsWith('m')) for (const e of teil.slice(1).split('_')) { const [i, j, n] = e.split('.'); try { if (b[+j]?.[+i] && n) b[+j][+i].anlage = decodeURIComponent(n).slice(0, 40) } catch { /* ungültig */ } }
    if (teil.startsWith('t')) for (const e of teil.slice(1).split('_')) { const [i, j, c] = e.split('.'); if (b[+j]?.[+i] && (c === 'p' || c === 'g')) b[+j][+i].zugStart = c }
    if (teil.startsWith('c')) for (const e of teil.slice(1).split('_')) {
      const [i, j, lok, w] = e.split('.')
      if (b[+j]?.[+i] && /^[a-z]+$/.test(lok ?? '') && /^[a-z]+(-[a-z]+)*$/.test(w ?? '')) b[+j][+i].zusammen = { lok, wagen: w.split('-') }
    }
    if (teil.startsWith('v')) for (const e of teil.slice(1).split('_')) { const [i, j, m] = e.split('.').map(Number); if (b[j]?.[i]?.strasse && m >= 0 && m <= 15) b[j][i].strKanten = m }
    if (teil.startsWith('y')) for (const e of teil.slice(1).split('_')) { const [i, j] = e.split('.').map(Number); if (b[j]?.[i]?.strasse) b[j][i].haltestelle = true }
    if (teil.startsWith('e')) for (const e of teil.slice(1).split('_')) { const [i, j] = e.split('.').map(Number); if (b[j]?.[i]?.strasse) b[j][i].wende = true }
    if (teil.startsWith('r')) for (const e of teil.slice(1).split('_')) { const [i, j] = e.split('.').map(Number); if (b[j]?.[i]?.strasse) b[j][i].strBruecke = true }
    if (teil.startsWith('s')) for (const e of teil.slice(1).split('_')) { const [i, j] = e.split('.').map(Number); if (b[j]?.[i]) b[j][i].ohneStrom = true }
    if (teil.startsWith('h')) for (const e of teil.slice(1).split('_')) { const [i, j, d] = e.split('.').map(Number); if (b[j]?.[i] && Number.isInteger(d) && d >= 0 && d <= 19) b[j][i].hang = d }
    if (teil.startsWith('k')) for (const e of teil.slice(1).split('_')) { const [i, j] = e.split('.').map(Number); if (b[j]?.[i]) b[j][i].knoten = true }
    if (teil.startsWith('f')) for (const e of teil.slice(1).split('_')) { const [i, j] = e.split('.').map(Number); if (b[j]?.[i]) b[j][i].fluss = true }
    if (teil.startsWith('w')) for (const e of teil.slice(1).split('_')) { const [i, j] = e.split('.').map(Number); if (b[j]?.[i]) b[j][i].wagen = true }
    if (teil.startsWith('o')) for (const e of teil.slice(1).split('_')) { const [i, j, c] = e.split('.'); if (b[+j]?.[+i]) b[+j][+i].objekt = c === 'k' ? 'kirche' : 'bauernhof' }
    if (teil.startsWith('u')) for (const e of teil.slice(1).split('_')) { const [i, j, c] = e.split('.'); if (b[+j]?.[+i]) b[+j][+i].bau = c === 'd' ? 'depot' : c === 'g' ? 'gueter' : 'galerie' }
    if (teil.startsWith('b')) for (const e of teil.slice(1).split('_')) { const [i, j] = e.split('.').map(Number); if (b[j]?.[i]) b[j][i].bruecke = true }
    if (teil.startsWith('a')) for (const e of teil.slice(1).split('_')) { const [i, j, c] = e.split('.'); if (b[+j]?.[+i]) b[+j][+i].ampel = c === 'r' ? 'rot' : 'gruen' }
    if (!teil.startsWith('n')) continue
    for (const e of teil.slice(1).split('_')) {
      const [i, j, n] = e.split('.')
      try { if (b[+j]?.[+i] && n) b[+j][+i].name = decodeURIComponent(n).slice(0, 60) } catch { /* ungültig, ohne Namen */ }
    }
  }
  // die Felder unter grossen Kurven; passt eine nicht, fällt sie weg
  for (let j = 0; j < b.length; j++) for (let i = 0; i < b[0].length; i++) {
    const g = b[j][i].gleis
    if (!grosseKurve(g)) continue
    const G = grossGeometrie(i, j, g!)
    if (!G.zellen.every(([u, v]) => b[v]?.[u] && !(u === i && v === j ? false : b[v][u].gleis || b[v][u].teil))) { delete b[j][i].gleis; continue }
    for (const [u, v] of G.zellen) if (u !== i || v !== j) b[v][u].teil = [i, j]
  }
  return b
}

/**
 * die eigenen Bretter mit Namen, die zuletzt geänderten oben (Michael, 2026-11-23: «Man muss neue Bretter eröffnen können, abspeichern können,
 * bearbeiten können»); jedes Brett speichert sich beim Bauen selbst. Gab es noch keine Liste, wird das früher gemerkte eine Brett zum ersten
 */
export interface GespeichertesBrett { id: string; name: string; code: string; geaendert: number }
const BRETTER = 'taktland.gleisbau.bretter'
export const neueId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
export function bretterLesen(): GespeichertesBrett[] {
  try {
    const x = JSON.parse(localStorage.getItem(BRETTER) ?? 'null')
    if (Array.isArray(x)) {
      return x.filter((e) => typeof e?.name === 'string' && typeof e?.code === 'string')
        .map((e, k) => ({ id: typeof e.id === 'string' ? e.id : `${neueId()}${k}`, name: e.name, code: e.code, geaendert: typeof e.geaendert === 'number' ? e.geaendert : 0 }))
    }
    const alt = brettLesen()
    return alt ? [{ id: neueId(), name: 'Mein Brett', code: brettCode(alt), geaendert: Date.now() }] : []
  } catch { return [] }
}
export function bretterMerken(l: GespeichertesBrett[]) {
  try { localStorage.setItem(BRETTER, JSON.stringify(l)) } catch { /* nur für jetzt */ }
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
/**
 * Am Rand eine Reihe oder Spalte dazu (+1) oder weg (-1) (seit 2026-11-24, Michael: «Am dunklen Rand ein Dreieck nach aussen und innen anbringen damit
 * man das Brett erweitern oder reduzieren kann»); seite 0 oben, 1 rechts, 2 unten, 3 links. Grosse Kurven, die über die entfernte Reihe gehen, fallen
 * ganz weg; null, wenn die Grösse nicht erlaubt ist
 */
export function brettRand(b: Brett, seite: number, d: 1 | -1): Brett | null {
  const sp = spalten(b), ze = zeilen(b), quer = seite % 2 === 1
  const nsp = sp + (quer ? d : 0), nze = ze + (quer ? 0 : d)
  if (!groesseNeuOk(sp, ze, nsp, nze)) return null
  let x = b
  if (d < 0) {
    // die Felder der Reihe, die wegfällt
    const reihe: Array<[number, number]> = quer ? Array.from({ length: ze }, (_, j) => [seite === 1 ? sp - 1 : 0, j]) : Array.from({ length: sp }, (_, i) => [i, seite === 2 ? ze - 1 : 0])
    for (const [i, j] of reihe) if (x[j][i].teil || grosseKurve(x[j][i].gleis)) x = grosseEntfernen(x, i, j)
  }
  const vorn = seite === 0 || seite === 3
  const ziehe = (f: Feld): Feld => {
    if (!vorn || !f.teil) return { ...f }
    return { ...f, teil: [f.teil[0] + (quer ? d : 0), f.teil[1] + (quer ? 0 : d)] }
  }
  let neu = x.map((z) => z.map(ziehe))
  const leerFeld = (): Feld => ({ grund: 'wiese' })
  if (quer) {
    neu = neu.map((z) => (d > 0 ? (vorn ? [leerFeld(), ...z] : [...z, leerFeld()]) : (vorn ? z.slice(1) : z.slice(0, -1))))
  } else {
    const zeile = () => Array.from({ length: sp }, leerFeld)
    neu = d > 0 ? (vorn ? [zeile(), ...neu] : [...neu, zeile()]) : (vorn ? neu.slice(1) : neu.slice(0, -1))
  }
  return neu
}

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

/** je Bahnhof (Buchstabe) der gewählte Name aus Taktland, der erste in der Reihenfolge der Felder */
export function bahnhofTitel(b: Brett): Map<string, string> {
  const raus = new Map<string, string>()
  const gruppen = bahnhofGruppen(b)
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    const n = b[j][i].name, g = gruppen.get(`${i},${j}`)
    if (n && g && !raus.has(g)) raus.set(g, n)
  }
  return raus
}

/** die Buchstaben der Bahnhöfe, die Knoten im Taktfahrplan sind (ein Feld des Bahnhofs genügt) */
export function knotenGruppen(b: Brett): Set<string> {
  const g = bahnhofGruppen(b), raus = new Set<string>()
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    const x = g.get(`${i},${j}`)
    if (x && b[j][i].knoten) raus.add(x)
  }
  return raus
}

/** je Bahnhofsfeld der Buchstabe seines Bahnhofs (alle Felder, nicht nur das erste) */
export function bahnhofGruppen(b: Brett): Map<string, string> {
  const namen = bahnhofNamen(b), raus = new Map<string, string>()
  for (const [k, n] of namen) {
    const offen = [k.split(',').map(Number) as [number, number]]
    raus.set(k, n)
    while (offen.length) {
      const [u, v] = offen.pop()!
      for (let r = 0; r < 4; r++) {
        const p = u + DX[r], q = v + DY[r], key = `${p},${q}`
        if (!raus.has(key) && istBahnhof(b[q]?.[p]?.gleis)) { raus.set(key, n); offen.push([p, q]) }
      }
    }
  }
  return raus
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

export const DXY = [DX, DY] as const

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

/** die Felder, durch die ein Stück führt: bei einem kleinen sein Feld, bei einer grossen Kurve alle, über die der Bogen läuft */
/**
 * Auf einer Überführung belegt ein Zug nur seine Ebene: das Feld zählt dort als «i,j:0» (Nord–Süd) oder «i,j:1» (Ost–West), so kreuzen sich zwei
 * Züge, ohne aufeinander zu warten
 */
const ebene = (b: Brett | null, s: Stueck) => (!s.gross && b?.[s.j]?.[s.i]?.gleis?.art === 'ueberfuehrung' ? `${s.i},${s.j}:${(s.ein >= 0 ? s.ein : s.aus) % 2}` : null)
function ebenenFelder(b: Brett | null, keys: Set<string>, stuecke: Stueck[]): Set<string> {
  if (!b) return keys
  const raus = new Set(keys)
  for (const k of keys) { const [i, j] = k.split(',').map(Number); if (b[j]?.[i]?.gleis?.art === 'ueberfuehrung') raus.delete(k) }
  for (const s of stuecke) { const e = ebene(b, s); if (e && keys.has(`${s.i},${s.j}`)) raus.add(e) }
  return raus
}

function stueckFelder(s: Stueck): Set<string> {
  const raus = new Set<string>([`${s.i},${s.j}`])
  if (!s.gross) return raus
  raus.add(`${s.gross.i},${s.gross.j}`)
  const l = stueckLaenge(s)
  for (let k = 1; k < 24; k++) { const p = stueckPunkt(s, (l * k) / 24); raus.add(`${Math.floor(p.x)},${Math.floor(p.y)}`) }
  return raus
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
function erstesStueck(b: Brett, i: number, j: number, richtung?: 0 | 1): Stueck | null {
  const g = b[j][i].gleis
  if (!g) return null
  let s: Stueck | null
  if (grosseKurve(g)) { const G = grossGeometrie(i, j, g); s = grossStueck(b, b[j][i], i, j, G.anfang.kante) } else { const [a, c] = wege(g)[0]; s = { i, j, ein: a, aus: c } }
  if (!s) return null
  // der Zug fährt zuerst dorthin, wo mehr Gleis liegt, nicht in den Prellbock (Michael, 2026-11-26: «wenn ich den Zug auf das Gleis platziere, dann fährt er zuerst
  // Richtung Prellbock und dann erst hinaus»)
  const r = umgekehrt(s)
  if (richtung !== undefined) return richtung ? r : s
  return voraus(b, r) > voraus(b, s) ? r : s
}
/** wie viele Stücke vor diesem noch kommen, bis das Gleis endet, höchstens VORAUS_HOECHSTENS (ein Ring zählt so viel) */
const VORAUS_HOECHSTENS = 60
function voraus(b: Brett, s: Stueck): number {
  let x = naechstes(b, s), n = 0
  while (x && n < VORAUS_HOECHSTENS) { n++; x = naechstes(b, x) }
  return n
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

/**
 * Strassen (Michael, 2026-11-23, Vorschlag «Bahnübergang mit Strasse»): je Feld mit Strasse die Kanten, an denen sie weiterführt, zu einer Strasse oder
 * einem Dorf im Nachbarfeld; ohne Nachbarn quer zum Gleis oder waagrecht. Ein Bahnübergang ist eine Strasse über eine Gerade, die Strasse dann quer dazu
 */
export function strassenKanten(b: Brett, i: number, j: number): number[] {
  const f = b[j]?.[i]
  if (!f?.strasse || f.teil || (f.gleis && f.gleis.art !== 'gerade')) return []
  if (f.gleis?.art === 'gerade') return f.gleis.dreh % 2 === 0 ? [1, 3] : [0, 2]
  const k = strassenNachbarn(b, i, j)
  // ein Wendeplatz endet hier: nur zu den Nachbarn
  if (f.wende) return k.length ? k : [2]
  if (k.length === 1) k.push((k[0] + 2) % 4)
  return k.length ? k : [1, 3]
}
/**
 * die Kanten, an denen die Strasse wirklich an eine andere anschliesst. Seit 2026-11-26 so, wie gezogen (Michael: «Ja, Strassen genau so verbinden, wie ich
 * sie ziehe»): hat ein Feld strKanten, gelten sie, und eine Verbindung braucht beide Seiten, wo beide sie haben; ohne (ältere Bretter, getippte Felder)
 * verbindet sich die Strasse mit den Nachbarn, aber zwei parallele, gerade durchlaufende nicht quer
 */
export function strassenNachbarn(b: Brett, i: number, j: number): number[] {
  const f = b[j]?.[i]
  if (!f?.strasse) return []
  const str = (u: number, v: number) => !!b[v]?.[u]?.strasse
  const durch = (u: number, v: number, quer: number) => str(u + DX[quer], v + DY[quer]) && str(u - DX[quer], v - DY[quer])
  return [0, 1, 2, 3].filter((k) => {
    const u = i + DX[k], v = j + DY[k], n = b[v]?.[u]
    if (!n) return false
    const ich = f.strKanten !== undefined ? !!(f.strKanten & (1 << k)) : null
    if (!n.strasse) return n.grund === 'dorf' && ich !== false
    const zurueck = (k + 2) % 4
    const er = n.gleis?.art === 'gerade' ? (n.gleis.dreh % 2 === 0) === (zurueck % 2 === 1)
      : n.teil || n.gleis ? false : n.strKanten !== undefined ? !!(n.strKanten & (1 << zurueck)) : null
    if (ich === false || er === false) return false
    if (ich || er) return true
    const quer = (k + 1) % 4
    return !(durch(i, j, quer) && durch(u, v, quer))
  })
}
/** eine Strasse von (i, j) in Richtung k mit dem Nachbarn verbinden, auf beiden Seiten; ein Feld ohne strKanten behält dabei seine Verbindungen */
export function strasseVerbinden(b: Brett, i: number, j: number, k: number) {
  const u = i + DX[k], v = j + DY[k], f = b[j]?.[i], n = b[v]?.[u]
  if (!f?.strasse || !n?.strasse) return
  const explizit = (x: Feld, xi: number, xj: number) => { if (x.strKanten === undefined) x.strKanten = strassenNachbarn(b, xi, xj).reduce((m, kk) => m | (1 << kk), 0) }
  explizit(f, i, j); explizit(n, u, v)
  f.strKanten! |= 1 << k; n.strKanten! |= 1 << ((k + 2) % 4)
}
/** die Kanten, an denen ein Fluss das Feld verlässt: zu Nachbarn mit Fluss oder Wasser; allein oder an einem Ende quer durch */
export function flussKanten(b: Brett, i: number, j: number): number[] {
  const f = b[j]?.[i]
  if (!f?.fluss) return []
  const k = [0, 1, 2, 3].filter((k) => { const n = b[j + DY[k]]?.[i + DX[k]]; return !!n && (n.fluss || n.grund === 'wasser') })
  if (k.length === 1) k.push((k[0] + 2) % 4)
  return k.length ? k : [1, 3]
}
/**
 * ob auf dem Feld eine Strasse liegen darf: mit Gleis nur über eine Gerade an Land; über Wasser und Fluss ist sie eine Brücke, im Berg ein Tunnel
 * (seit 2026-11-25, vorher nur über Land)
 */
export function strasseMoeglich(f: Feld): string | null {
  // unter einer Bahnbrücke an Land führt die Strasse durch, als Unterführung (Michael, 2026-11-26: «Warum geht das nicht?», auf einem Viadukt)
  if (f.bruecke) return f.gleis?.art === 'gerade' && f.grund !== 'wasser' && f.grund !== 'berg' && !f.fluss ? null
    : 'Unter einer Bahnbrücke führt eine Strasse nur an Land und unter einer Geraden durch.'
  if (f.teil || (f.gleis && f.gleis.art !== 'gerade')) return 'Ein Bahnübergang geht nur über eine Gerade.'
  if (f.gleis && (f.grund === 'wasser' || f.grund === 'berg' || f.fluss)) return 'Über einem Gleis im Tunnel oder auf einer Brücke hat die Strasse keinen Platz.'
  return null
}
/** das Feld ohne Strasse samt Haltestelle, Wendeplatz und Strassenbrücke */
export function ohneStrasse(f: Feld): Feld {
  const { strasse: _s, haltestelle: _h, wende: _w, strBruecke: _b, strKanten: _k, ...o } = f
  return o
}
/** ob die Strasse des Felds gerade durchgeht (für eine Haltestelle) */
export function strasseGerade(b: Brett, i: number, j: number) {
  const k = strassenKanten(b, i, j)
  return k.length === 2 && Math.abs(k[0] - k[1]) === 2
}
/** eine Strasse unter einer Bahnbrücke durch: Unterführung, ohne Bahnübergang */
export const strasseUnterBruecke = (f?: Feld) => !!f?.strasse && !!f.bruecke && f.gleis?.art === 'gerade'
/** eine Strasse über ein Gleis als Brücke: sie führt darüber, ohne Bahnübergang */
export const strasseUeberGleis = (f?: Feld) => !!f?.strasse && !!f.strBruecke && f.gleis?.art === 'gerade'
/** eine Strasse als Brücke: über Wasser, einen Fluss oder als Strassenbrücke gesetzt */
export const strasseAlsBruecke = (f?: Feld) => !!f?.strasse && (f.grund === 'wasser' || !!f.fluss || !!f.strBruecke)

// ——— der Zug: Lok, zwei Wagen, Steuerwagen wie in der Virtuellen Schweiz ———

export const WAGEN_LAENGE = 0.5
export const WAGEN_LUECKE = 0.06
/** wo die Drehgestelle sitzen, als Anteil der Wagenlänge von jedem Ende (gewählt, bei echten Wagen etwa ein Siebtel) */
const DREHGESTELL = 0.17
/** Fahrzeuge am Zug samt Lok und Steuerwagen, wählbar im Menü (Michael, 2026-11-24: «Den Zug soll man in der Länge wählen können, wie viele Wagen dranhängen») */
export const WAGEN = 4, WAGEN_MIN = 2, WAGEN_MAX = 8
export const zugLaenge = (n: number) => n * WAGEN_LAENGE + (n - 1) * WAGEN_LUECKE
/** Tempo in Feldern je Sekunde, Anfahren und Halt am Bahnhof (gewählt) */
export const TEMPO = 1.5
/**
 * Anfahren und Bremsen (seit 2026-11-26 sanfter, Michael: «Züge sollen bei den Bahnhöfen auch langsam abbremsen und beim Anfahren noch ein bisschen langsamer
 * anfahren. Bei den Ampeln ebenso»): ANFAHREN Sekunden bis zum Höchsttempo (vorher 1,2), vor einem Halt, einer roten Ampel, einem abgestellten Wagen oder dem
 * Gleisende bremst der Zug mit BREMSEN Feldern je s², zuletzt mit KRIECHEN; gesucht wird BREMS_SICHT Felder voraus; alles gewählt
 */
const ANFAHREN = 2.2, BREMSEN = 1.1, KRIECHEN = 0.12, BREMS_SICHT = 3
/**
 * Kurven (Michael, 2026-11-26: «dass die Züge bei den Kurven etwas vorher abbremsen und langsamer durch die Kurve gehen und … gegen Ende der Kurve wieder
 * beschleunigen … Je größer die Kurve, desto weniger muss abgebremst werden»): in einer Kurve mit Radius r höchstens √(KURVE_QUER · r) Felder je s, vorher
 * gebremst wie vor einem Halt, ab KURVE_FREI ihrer Länge darf der Zug wieder beschleunigen; die kleine Kurve (r 0,5) etwa 0,8, die grosse mit r 1,5
 * etwa 1,4, die grösste nicht mehr gebremst (Höchsttempo 1,5); gewählt
 */
const KURVE_QUER = 1.3, KURVE_FREI = 0.55
/** vor einer Kurve bremst der Zug kräftiger und damit später als vor einem Halt (seit 2026-11-26, Michael: «Zug bremst etwas zu früh vor einer Kurve ab»; gewählt) */
const KURVE_BREMSEN = 2.2
const kurvenTempo = (s: Stueck) => {
  const r = s.gross ? s.gross.r : s.ein >= 0 && s.aus >= 0 && (s.ein + 2) % 4 !== s.aus ? 0.5 : Infinity
  return Math.sqrt(KURVE_QUER * r)
}
export const HALT_S = 2.5
/** am Güterschuppen: Schritttempo in Feldern je Sekunde und Halt je Wagen (gewählt) */
export const KRIECH_TEMPO = 0.45, KRIECH_HALT_S = 0.9
/** der Pfiff so lange vor der Abfahrt (gewählt) */
const PFIFF_VOR_S = 0.9
/** so lange steht der Zug beim Ankuppeln, in s (gewählt) */
const KUPPELN_S = 1.2

export interface WagenLage { x: number; y: number; w: number; /** 0 Lok, 1 und 2 Wagen, 3 Steuerwagen */ art: number; vorne: boolean; /** Diesel statt Strom */ diesel?: boolean
  /** ein Güterwagen */ gueter?: boolean
  /** im Bahnbetrieb: welche Lok oder welcher Wagen, und ob er beladen ist (setzt die Darstellung) */ typ?: string; beladen?: boolean }

/** ein Fahrzeug im Zug, von der Spitze an; blick 1: der Kopf schaut zur Spitze des Zugs; typ im Bahnbetrieb die Lok oder der Wagen (gleisbauFahrzeuge.ts) */
interface Fahrzeug { t: 'lok' | 'wagen' | 'steuer'; diesel: boolean; blick: 1 | -1; typ?: string; /** bleibt beim Umkehren gleich, für die Ladung */ id?: number }
const standardZug = (n: number, diesel = false): Fahrzeug[] =>
  Array.from({ length: n }, (_, k): Fahrzeug => ({ t: k === 0 ? 'lok' : k === n - 1 ? 'steuer' : 'wagen', diesel, blick: k === n - 1 ? -1 : 1 }))
/** ein Güterzug: Lok und Güterwagen, ohne Steuerwagen (gewählt) */
const gueterZug = (n: number, diesel = false): Fahrzeug[] => Array.from({ length: n }, (_, k): Fahrzeug => ({ t: k === 0 ? 'lok' : 'wagen', diesel, blick: 1 }))
/** ein Güterschuppen an einer Geraden: dort hält der Güterzug */
export const gueterGilt = (f?: Feld) => f?.bau === 'gueter' && bauGilt(f)
/** ob das Gleis dieses Stücks ohne Fahrleitung ist */
const ohneStromBei = (b: Brett, s: Stueck) => !!b[s.j]?.[s.i]?.ohneStrom
/**
 * so stark bremst ein Stromzug ohne Fahrleitung, Felder je s²: ein Drittel von 1,6 (gewählt), damit der Bremsweg dreimal so lang ist, bei vollem Tempo
 * gut 2 Felder statt 0,7 (Michael, 2026-11-25: «Fährt ein Elektrozug in ein stromloses Trasse muss er einen 3x so langen Bremsweg haben»)
 */
const STROMLOS_BREMSEN = 1.6 / 3

export class Zug {
  /** die befahrenen Stücke, das letzte trägt die Spitze */
  private stuecke: Stueck[] = []
  private kopf = 0
  private tempo = 0
  private halt = 0
  /** am Halt länger stehen bleiben (zum Beladen), nur solange er schon steht; gibt zurück, ob er steht */
  haltVerlaengern(s: number): boolean { if (this.halt <= 0 || !this.amBahnhof) return false; this.halt = Math.max(this.halt, s); return true }
  /**
   * die Fahrzeuge von der Spitze an (seit 2026-11-24, Michael: «Wäre noch spannend wenn standard elektrifizierte Trassen sind und teilweise Abstellgleise ohne.
   * Fährt ein Stromzug da hinein bremst er ab und beibt stehen. Eine Diesellok muss abschleppen»): ein abgeschleppter Zug hängt mit seinen Fahrzeugen dran
   */
  private fz: Fahrzeug[] = standardZug(WAGEN)
  /** ein Stromzug ohne Fahrleitung: er rollt aus und bleibt stehen, bis eine Diesellok ihn holt */
  stromlos = false
  /** ob eine Diesellok im Zug ist (dann fährt er auch ohne Fahrleitung) */
  diesel() { return this.fz.some((v) => v.t === 'lok' && v.diesel) }
  /** wie viele Züge (Loks) zusammenhängen */
  teile() { return this.fz.filter((v) => v.t === 'lok').length }
  /** Personenzug oder Güterzug: der Personenzug hält an Bahnhöfen, der Güterzug am Güterschuppen und fährt an Bahnhöfen durch; ein gemischter Zug hält an beiden */
  art: 'person' | 'gueter' | 'mix' = 'person'
  /** Höchsttempo, im Bahnbetrieb das der Lok */
  vmax = TEMPO
  /** Plätze für Ladungen: die Güterwagen */
  ladeplaetze() { return this.fz.filter((v) => v.t === 'wagen' && v.typ !== 'person').length }
  /** die Güterwagen mit ihrer Stelle im Zug (für das Beladen nach Gut) */
  gueterwagen(): Array<{ k: number; typ: string }> { this.ids(); return this.fz.flatMap((v) => (v.t === 'wagen' && v.typ !== 'person' ? [{ k: v.id!, typ: v.typ ?? 'gedeckt' }] : [])) }
  /**
   * jedem Fahrzeug eine feste Nummer, die beim Umkehren bleibt; die Ladung merkt sich diese statt der Stelle von der Spitze (seit 2026-11-27, sonst lag sie
   * nach dem Umkehren auf dem falschen Wagen)
   */
  private ids() { let m = Math.max(-1, ...this.fz.map((v) => v.id ?? -1)); for (const v of this.fz) if (v.id === undefined) v.id = ++m }
  /** die feste Nummer des Fahrzeugs an Stelle k */
  fzId(k: number): number { this.ids(); return this.fz[k]?.id ?? -1 }
  /**
   * am Güterschuppen Wagen für Wagen (Michael, 2026-11-27: «Güterzüge Wagen für Wagen aufladen und abliefern. Der Zug muss also pro Wagen kurz halten,
   * weiterfahren, halten»): nach dem Halt fährt der Zug je Güterwagen eine Wagenlänge im Schritttempo und hält kurz; ladeSchritte zählt die Halte, die
   * Darstellung lädt dann den Wagen, der dem Schuppen am nächsten ist. Endet das Gleis hinter dem Schuppen, kehrt er zuerst um. Tempo und Halte gewählt
   */
  kriechen: { rest: number; weg: number; wenden: boolean } | null = null
  ladeSchritte = 0
  /** Plätze für Fahrgäste: im Bahnbetrieb je Personenwagen proPersonenwagen, sonst fest */
  plaetze(proPersonenwagen: number) { return this.personenwagen() * proPersonenwagen }
  /**
   * die Personenwagen (seit 2026-11-26 auch im freien Bauen, Michael: «Wieviele Personen passen in einen Personenwagen?»): im Bahnbetrieb die Wagen
   * dieser Art, sonst in einem Personenzug alle Wagen und der Steuerwagen; je Personenwagen 4 Plätze (WAGEN_ARTEN.person)
   */
  personenwagen() { return this.fz.filter((v) => (v.typ ? v.typ === 'person' : this.art !== 'gueter' && v.t !== 'lok')).length }
  /** ob der Halt an einem Bahnhof ist (nicht das Umkehren) */
  private amBahnhof = false
  /** nach dem Halt gleich umkehren: dahinter endet das Gleis ohne weiteren Halt (Endbahnhof) */
  private wendenNachHalt = false
  /** zählt hoch, wenn der Zug PFIFF_VOR_S vor der Abfahrt an einem Bahnhof steht; die Darstellung pfeift dann */
  pfiffe = 0
  /** zählt hoch bei jedem Halt an einem Bahnhof, haltFeld ist dessen Feld (für die Fahrgäste) */
  halte = 0
  haltFeld = ''
  /** wie oft der Zug am Ende eines Gleises umgekehrt hat (für die Aufgabe «Rundkurs») */
  umkehrungen = 0
  /** Fahrzeuge samt Lok und Steuerwagen */
  private get anzahl() { return this.fz.length }
  private get laenge() { return zugLaenge(this.anzahl) }

  /**
   * null, wenn auf dem Brett kein Gleis liegt. meiden: Felder eines anderen Zugs (Michael, 2026-11-23, Vorschlag «Zweiter Zug»); der neue beginnt
   * dann an einem anderen Bahnhof oder möglichst weit weg und belegt keines dieser Felder und keines daneben
   */
  static setzen(b: Brett, meiden?: Set<string>, anzahl = WAGEN): Zug | null {
    const felder: Array<[number, number]> = []
    for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) if (b[j][i].gleis) felder.push([i, j])
    const abstand = ([i, j]: [number, number]) => {
      if (!meiden?.size) return 0
      let d = Infinity
      for (const k of meiden) { const [u, v] = k.split(',').map(Number); d = Math.min(d, Math.abs(u - i) + Math.abs(v - j)) }
      return d
    }
    // zuerst Bahnhöfe, dann die übrigen; mit einem anderen Zug die fernsten zuerst
    // zuerst Depots (der Zug fährt dort ab), dann Bahnhöfe
    const rang = (i: number, j: number) => (b[j][i].bau === 'depot' && bauGilt(b[j][i]) ? 2 : istBahnhof(b[j][i].gleis) ? 1 : 0)
    felder.sort((a, c) => rang(c[0], c[1]) - rang(a[0], a[1]) || abstand(c) - abstand(a))
    for (const [i, j] of felder) {
      const z = Zug.ab(b, i, j, anzahl)
      if (!z) continue
      if (meiden?.size) {
        const nah = [...z.belegt()].some((k) => { const [u, v] = k.split(',').map(Number); return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([du, dv]) => meiden.has(`${u + du},${v + dv}`)) })
        if (nah) continue
      }
      return z
    }
    return null
  }

  /**
   * ein Zug aus dem Bahnbetrieb: Lok und Wagen nach Wahl (Michael, 2026-11-25: «Diverse fiktive Loks und Wagen stehen bereit»); hat er Personen- und
   * Güterwagen, hält er an Bahnhöfen und Güterschuppen
   */
  static zusammengestellt(b: Brett, i: number, j: number, lok: { typ: string; diesel: boolean; tempo: number }, wagen: string[]): Zug | null {
    const mitP = wagen.includes('person'), mitG = wagen.some((w) => w !== 'person')
    const art = mitP && mitG ? 'mix' : mitG ? 'gueter' : 'person'
    const z = Zug.ab(b, i, j, wagen.length + 1, art === 'mix' ? 'person' : art)
    if (!z) return null
    z.art = art
    z.vmax = lok.tempo
    z.fz = [{ t: 'lok', diesel: lok.diesel, blick: 1, typ: lok.typ }, ...wagen.map((w): Fahrzeug => ({ t: 'wagen', diesel: lok.diesel, blick: 1, typ: w }))]
    for (let k = 0; k < 20 && z.hinten() < z.laenge; k++) {
      const davor = naechstes(b, umgekehrt(z.stuecke[0]))
      if (!davor) break
      z.stuecke.unshift(umgekehrt(davor))
    }
    z.kuerzen()
    z.stromlos = !lok.diesel && ohneStromBei(b, z.stuecke[z.stuecke.length - 1])
    return z
  }

  /** ein Zug genau auf diesem Feld, als Personen- oder Güterzug (vom Werkzeug «Personenzug» oder «Güterzug» gesetzt) */
  static setzenBei(b: Brett, i: number, j: number, art: 'person' | 'gueter', anzahl = WAGEN, richtung?: 0 | 1): Zug | null {
    return Zug.ab(b, i, j, anzahl, art, richtung)
  }

  private static ab(b: Brett, i: number, j: number, anzahl: number, art: 'person' | 'gueter' = 'person', richtung?: 0 | 1): Zug | null {
    const start = erstesStueck(b, i, j, richtung)
    if (!start) return null
    const z = new Zug()
    z.art = art
    const n = Math.max(WAGEN_MIN, Math.min(WAGEN_MAX, Math.round(anzahl)))
    z.fz = art === 'gueter' ? gueterZug(n) : standardZug(n)
    z.stuecke = [start]
    z.brett = b
    z.kopf = stueckLaenge(start) / 2
    // nach hinten auffüllen, so weit das Gleis reicht
    let erstes = start
    for (let k = 0; k < 20 && z.hinten() < z.laenge; k++) {
      const davor = naechstes(b, umgekehrt(erstes))
      if (!davor) break
      erstes = umgekehrt(davor)
      z.stuecke.unshift(erstes)
    }
    if (art === 'gueter' ? gueterGilt(b[start.j][start.i]) : istBahnhof(b[start.j][start.i].gleis)) { z.halt = HALT_S; z.amBahnhof = true; z.halte++; z.haltFeld = `${start.i},${start.j}` }
    // im Depot wartet er vor der Abfahrt wie am Bahnhof
    else if (bauGilt(b[start.j][start.i]) && b[start.j][start.i].bau === 'depot') { z.halt = HALT_S; z.amBahnhof = true }
    if (ohneStromBei(b, start)) z.stromlos = true
    return z
  }

  /** wie viel Gleis hinter der Spitze liegt */
  private hinten() {
    let s = this.kopf
    for (let k = 0; k < this.stuecke.length - 1; k++) s += stueckLaenge(this.stuecke[k])
    return s
  }

  private kuerzen() {
    while (this.stuecke.length > 1 && this.hinten() - stueckLaenge(this.stuecke[0]) >= this.laenge + 0.01) this.stuecke.shift()
  }

  /** am Ende des Gleises: der Zug fährt zurück, die Spitze ist dort, wo das Ende des Zugs war */
  private umkehren() {
    const ende = Math.max(0, this.hinten() - this.laenge)
    this.stuecke = this.stuecke.map(umgekehrt).reverse()
    this.kopf = Math.max(0, stueckLaenge(this.stuecke[this.stuecke.length - 1]) - ende)
    // steht die neue Spitze genau am Anfang eines Stücks, ist sie noch nicht darin: sonst gälte ein Feld als belegt, in das der Zug nie fuhr
    while (this.kopf <= 1e-6 && this.stuecke.length > 1) { this.stuecke.pop(); this.kopf = stueckLaenge(this.stuecke[this.stuecke.length - 1]) }
    this.fz = this.fz.slice().reverse().map((v) => ({ ...v, blick: (v.blick * -1) as 1 | -1 }))
    this.umkehrungen++
    this.tempo = 0
    this.halt = 0.8
    this.amBahnhof = false
    this.kuerzen()
  }

  /** Fahrzeuge samt Lok und Steuerwagen */
  fahrzeuge() { return this.anzahl }
  /** wie oft der Zug einen Wagen angekuppelt hat */
  angekuppelt = 0
  /** im Taktfahrplan: wie lange der Zug an diesem Bahnhof steht (Feld «i,j»), mindestens HALT_S */
  taktWarten?: (feld: string) => number
  /** das Feld unter dem hintersten Wagen (dort wird ein Wagen abgestellt) */
  ende(): [number, number] { const p = this.punkt(this.laenge - WAGEN_LAENGE / 2); return [Math.floor(p.x), Math.floor(p.y)] }

  /**
   * Antippen eines Zugs (Michael, 2026-11-24: «wenn man auf einen Zug tippt, man die Anzahl Wagen korrigieren kann oder den Zug entfernen kann oder
   * die Fahrtrichtung ändern kann»): die Länge ändern; länger wächst der Zug nach hinten, so weit das Gleis reicht
   */
  fahrzeugeSetzen(b: Brett, n: number) {
    // hinten Wagen dazu (vor dem Steuerwagen) oder weg, Loks und Steuerwagen bleiben
    n = Math.max(WAGEN_MIN, Math.min(WAGEN_MAX * Math.max(1, this.teile()), Math.round(n)))
    while (this.fz.length < n) {
      const letzt = this.fz[this.fz.length - 1], d = letzt?.diesel ?? false
      if (letzt && letzt.t !== 'wagen') this.fz.splice(this.fz.length - 1, 0, { t: 'wagen', diesel: d, blick: 1 })
      else this.fz.push({ t: 'wagen', diesel: d, blick: 1 })
    }
    while (this.fz.length > n) {
      const k = this.fz.map((v) => v.t).lastIndexOf('wagen')
      if (k < 0) break
      this.fz.splice(k, 1)
    }
    for (let k = 0; k < 20 && this.hinten() < this.laenge; k++) {
      const davor = naechstes(b, umgekehrt(this.stuecke[0]))
      if (!davor) break
      this.stuecke.unshift(umgekehrt(davor))
    }
    this.kuerzen()
  }

  /** Strom oder Diesel (nur ein einzelner Zug); ein Stromzug ohne Fahrleitung steht dann still */
  antriebSetzen(b: Brett, diesel: boolean) {
    if (this.teile() !== 1) return
    this.fz = this.fz.map((v) => ({ ...v, diesel }))
    const kopfStueck = this.stuecke[this.stuecke.length - 1]
    this.stromlos = !diesel && ohneStromBei(b, kopfStueck)
    if (this.stromlos) this.tempo = 0
  }

  private kopie(): Zug {
    const z = new Zug()
    z.stuecke = this.stuecke.slice(); z.kopf = this.kopf; z.fz = this.fz.map((v) => ({ ...v })); z.brett = this.brett
    return z
  }

  /**
   * eine Diesellok holt einen stehenden Zug: n ist das Stück, in das dieser Zug fahren wollte, dort steht das Ende (oder die Spitze) des anderen. Die beiden
   * werden ein Zug, der andere vorne, und fahren gleich zurück. false, wenn es nicht passt
   */
  schleppen(o: Zug, n: Stueck): boolean {
    const gleich = (a: Stueck) => a.i === n.i && a.j === n.j && a.aus === n.aus && (a.ein === n.ein || !!a.gross || !!n.gross)
    let andere = o.kopie(), k = andere.stuecke.findIndex(gleich)
    if (k < 0) { andere = o.kopie(); andere.umkehren(); k = andere.stuecke.findIndex(gleich) }
    if (k < 0) return false
    this.stuecke = [...this.stuecke, ...andere.stuecke.slice(k)]
    this.kopf = andere.kopf
    this.fz = [...andere.fz, ...this.fz]
    this.stromlos = false
    this.kuerzen()
    // gleich zurück, der abgeschleppte Zug hinten dran
    this.umkehren()
    this.halt = KUPPELN_S
    return true
  }

  /** den hintersten angehängten Zug abkuppeln; er bleibt stehen, wo er ist (ein Stromzug ohne Fahrleitung bleibt liegen) */
  abkuppeln(b: Brett): Zug | null {
    if (this.teile() < 2) return null
    // der hinterste Zug beginnt beim zweitletzten Kopf (Lok oder Steuerwagen) von hinten
    let koepfe = 0, s = -1
    for (let k = this.fz.length - 1; k >= 0; k--) if (this.fz[k].t !== 'wagen' && ++koepfe === 2) { s = k; break }
    if (s <= 0) return null
    const t = this.kopie()
    t.art = this.art; t.vmax = this.vmax
    t.fz = this.fz.slice(s)
    // seine Spitze liegt s Fahrzeuge hinter unserer
    let d = s * (WAGEN_LAENGE + WAGEN_LUECKE)
    while (d > t.kopf && t.stuecke.length > 1) { d -= t.kopf; t.stuecke.pop(); t.kopf = stueckLaenge(t.stuecke[t.stuecke.length - 1]) }
    t.kopf = Math.max(0, t.kopf - d)
    t.kuerzen()
    t.halt = KUPPELN_S
    t.stromlos = !t.diesel() && ohneStromBei(b, t.stuecke[t.stuecke.length - 1])
    this.fz = this.fz.slice(0, s)
    this.kuerzen()
    this.halt = KUPPELN_S
    return t
  }

  /** die Fahrtrichtung wechseln: die Spitze ist dort, wo das Ende war; zählt nicht als Umkehren am Gleisende */
  wenden() { const u = this.umkehrungen; this.umkehren(); this.umkehrungen = u; this.wartet = 0 }

  /** wie lange der Zug schon vor einem belegten Feld wartet, in s */
  wartet = 0

  /** die Felder, die der Zug mit seinen Wagen und dem Stück unter der Spitze belegt */
  belegt(): Set<string> {
    const raus = new Set<string>()
    for (let d = -0.1; d <= this.laenge + 0.05; d += 0.2) { const p = this.punkt(Math.max(0, d)); raus.add(`${Math.floor(p.x)},${Math.floor(p.y)}`) }
    for (const k of stueckFelder(this.stuecke[this.stuecke.length - 1])) raus.add(k)
    return ebenenFelder(this.brett, raus, this.stuecke)
  }
  /** das Brett der letzten Fahrt, für die Ebenen der Überführungen */
  private brett: Brett | null = null

  /**
   * frei: ob der Zug in diese Felder einfahren darf (sonst wartet er am Ende des Stücks, wie vor einem roten Signal); umkehren: ob er nach langem
   * Warten umkehren soll (wenn zwei Züge auf einem Gleis gegeneinander warten)
   */
  schritt(b: Brett, dt: number, frei?: (felder: Set<string>) => boolean, umkehren?: () => boolean, ankuppeln?: (i: number, j: number) => void,
    abschleppen?: (n: Stueck) => boolean) {
    this.brett = b
    if (this.halt > 0) {
      if (this.amBahnhof && this.halt > PFIFF_VOR_S && this.halt - dt <= PFIFF_VOR_S) this.pfiffe++
      this.halt -= dt
      // am Endbahnhof kehrt der Zug nach dem Halt um, statt erst in den Prellbock zu fahren (Michael, 2026-11-26: «Auf dem Ziel, wenn er dort umkehrt, fährt er
      // auch zuerst in den Prellbock und dann erst zurück»)
      if (this.halt <= 0 && this.wendenNachHalt) { this.wendenNachHalt = false; this.umkehren(); this.halt = 0 }
      if (this.halt <= 0 && this.kriechen) {
        if (this.kriechen.wenden) { this.kriechen.wenden = false; this.umkehren(); this.halt = 0 }
        this.kriechen.weg = WAGEN_LAENGE + WAGEN_LUECKE
      }
      return
    }
    // Schritt für Schritt am Güterschuppen: eine Wagenlänge im Schritttempo, dann kurz halten
    if (this.kriechen && this.kriechen.weg > 0) {
      const k = this.kriechen, d = Math.min(k.weg, KRIECH_TEMPO * dt)
      this.tempo = KRIECH_TEMPO
      if (!this.vorwaerts(b, d, frei)) { this.kriechen = null; return }
      k.weg -= d
      if (k.weg <= 1e-6) { k.weg = 0; k.rest--; this.ladeSchritte++; this.tempo = 0; this.halt = KRIECH_HALT_S; this.amBahnhof = true; if (k.rest <= 0) this.kriechen = null }
      return
    }
    // ohne Fahrleitung rollt ein Stromzug aus und bleibt stehen
    if (this.stromlos) {
      this.tempo = Math.max(0, this.tempo - STROMLOS_BREMSEN * dt)
      if (this.tempo <= 0) return
    } else this.tempo = Math.min(this.vmax, this.tempo + (this.vmax / ANFAHREN) * dt, Math.max(KRIECHEN, Math.sqrt(2 * BREMSEN * this.bisHalt(b))), this.kurvenGrenze(b))
    let rest = this.tempo * dt
    for (let k = 0; k < 8 && rest > 0; k++) {
      const s = this.stuecke[this.stuecke.length - 1], l = stueckLaenge(s)
      const mitte = l / 2, vorher = this.kopf
      // am Bahnhof in der Mitte des Felds halten
      // in einem Bahnhof aus mehreren Feldern nur einmal, im letzten Feld in Fahrtrichtung
      const weiterImBahnhof = () => { const n = naechstes(b, s); return !!n && !n.gross && istBahnhof(b[n.j][n.i].gleis) }
      // auch am Güterschuppen hält der Zug (laden), ohne Fahrgäste
      // seit 2026-11-25 hält der Personenzug nur an Bahnhöfen, der Güterzug nur am Güterschuppen
      const amBf = istBahnhof(b[s.j][s.i].gleis)
      const haltHier = this.art === 'gueter' ? gueterGilt(b[s.j][s.i]) : this.art === 'mix' ? amBf || gueterGilt(b[s.j][s.i]) : amBf
      if (!s.gross && haltHier && vorher < mitte && vorher + rest >= mitte && (!amBf || !weiterImBahnhof())) {
        this.kopf = mitte; this.halt = Math.max(HALT_S, this.taktWarten?.(`${s.i},${s.j}`) ?? 0); this.amBahnhof = true; this.tempo = 0; this.halte++; this.haltFeld = `${s.i},${s.j}`
        this.wendenNachHalt = this.sackgasse(b, s)
        const n = this.art !== 'person' && gueterGilt(b[s.j][s.i]) ? this.gueterwagen().length : 0
        if (n) { this.kriechen = { rest: n, weg: 0, wenden: this.wendenNachHalt }; this.wendenNachHalt = false; this.halt = KRIECH_HALT_S }
        return
      }
      if (vorher + rest <= l) { this.kopf += rest; rest = 0; break }
      rest -= l - vorher
      const n = naechstes(b, s)
      if (!n) { this.kopf = l; this.umkehren(); return }
      // vor einer roten Ampel warten, ohne als wartend zu gelten (sonst kehrte ein anderer Zug oder dieser um)
      if (!n.gross && ampelGilt(b[n.j]?.[n.i]) && b[n.j][n.i].ampel === 'rot') { this.kopf = l; this.tempo = 0; this.wartet = 0; return }
      // ein abgestellter Wagen: der Zug kuppelt ihn an (er hängt sich hinten an, gewählt) und steht kurz; ist der Zug schon so lang wie erlaubt, kehrt er um
      if (!n.gross && b[n.j]?.[n.i]?.wagen && wagenGilt(b[n.j][n.i])) {
        this.kopf = l; this.tempo = 0
        if (this.anzahl < WAGEN_MAX && ankuppeln) { ankuppeln(n.i, n.j); this.fahrzeugeSetzen(b, this.anzahl + 1); this.halt = KUPPELN_S; this.amBahnhof = false; this.angekuppelt++ }
        else this.umkehren()
        return
      }
      if (frei && !frei(ebenenFelder(b, stueckFelder(n), [n]))) {
        this.kopf = l; this.tempo = 0
        // eine Diesellok holt einen stehenden Stromzug
        if (abschleppen?.(n)) return
        this.wartet += dt
        if (umkehren?.()) { this.wartet = 0; this.umkehren() }
        return
      }
      this.wartet = 0
      this.stuecke.push(n); this.kopf = 0
      this.kuerzen()
      if (!this.diesel() && ohneStromBei(b, n)) this.stromlos = true
      // rollt er bis zu einem Gleis mit Fahrleitung, hat er wieder Strom und fährt an (Michael, 2026-11-26: «Folgt aber dann wieder ein elektrisches Gleis
      // sollte es doch reichen dass er wieder anfährt»)
      else if (this.stromlos) this.stromlos = false
    }
  }

  /** ein Stück vorwärts ohne Halte (Schritt am Güterschuppen); false am Gleisende, vor Rot oder einem anderen Zug */
  private vorwaerts(b: Brett, d: number, frei?: (felder: Set<string>) => boolean): boolean {
    let rest = d
    for (let k = 0; k < 8 && rest > 0; k++) {
      const s = this.stuecke[this.stuecke.length - 1], l = stueckLaenge(s)
      if (this.kopf + rest <= l) { this.kopf += rest; return true }
      rest -= l - this.kopf
      const n = naechstes(b, s)
      if (!n || (!n.gross && ampelGilt(b[n.j]?.[n.i]) && b[n.j][n.i].ampel === 'rot') || (frei && !frei(ebenenFelder(b, stueckFelder(n), [n])))) { this.kopf = l; return false }
      this.stuecke.push(n); this.kopf = 0
      this.kuerzen()
    }
    return true
  }

  /** ob das Gleis hinter diesem Halt endet, ohne dass noch ein Halt für diesen Zug oder ein abgestellter Wagen kommt (so, wie die Weichen jetzt stehen) */
  private sackgasse(b: Brett, s: Stueck): boolean {
    let x = naechstes(b, s)
    for (let n = 0; n < VORAUS_HOECHSTENS; n++) {
      if (!x) return true
      if (!x.gross) {
        const f = b[x.j][x.i], bf = istBahnhof(f.gleis), gs = gueterGilt(f)
        if (this.art === 'gueter' ? gs : this.art === 'mix' ? bf || gs : bf) return false
        if (f.wagen && wagenGilt(f)) return false
      }
      x = naechstes(b, x)
    }
    return false
  }

  /** ob der Zug an diesem Stück hält (wie in schritt): Personenzug am Bahnhof, Güterzug am Güterschuppen, im Bahnhof aus mehreren Feldern im letzten */
  private haltAuf(b: Brett, s: Stueck): boolean {
    if (s.gross) return false
    const f = b[s.j][s.i], bf = istBahnhof(f.gleis)
    if (!(this.art === 'gueter' ? gueterGilt(f) : this.art === 'mix' ? bf || gueterGilt(f) : bf)) return false
    if (bf) { const n = naechstes(b, s); if (n && !n.gross && istBahnhof(b[n.j][n.i].gleis)) return false }
    return true
  }
  /** wie weit bis zur nächsten Stelle, an der der Zug stehen bleibt; Infinity, wenn keine in Sicht */
  private bisHalt(b: Brett): number {
    let s = this.stuecke[this.stuecke.length - 1]
    const l0 = stueckLaenge(s)
    if (this.haltAuf(b, s) && this.kopf < l0 / 2) return l0 / 2 - this.kopf
    let d = l0 - this.kopf
    for (let k = 0; k < 6 && d < BREMS_SICHT; k++) {
      const n = naechstes(b, s)
      if (!n) return d
      if (!n.gross) { const f = b[n.j][n.i]; if ((ampelGilt(f) && f.ampel === 'rot') || (f.wagen && wagenGilt(f))) return d }
      const ln = stueckLaenge(n)
      if (this.haltAuf(b, n)) return d + ln / 2
      d += ln; s = n
    }
    return Infinity
  }

  /** das höchste Tempo wegen Kurven: in der jetzigen bis KURVE_FREI ihrer Länge ihr Tempo, vor den nächsten so, dass der Zug bis dahin bremsen kann */
  private kurvenGrenze(b: Brett): number {
    let s = this.stuecke[this.stuecke.length - 1]
    const l0 = stueckLaenge(s)
    let v = this.kopf < KURVE_FREI * l0 ? kurvenTempo(s) : Infinity
    let d = l0 - this.kopf
    for (let k = 0; k < 6 && d < BREMS_SICHT; k++) {
      const n = naechstes(b, s)
      if (!n) break
      v = Math.min(v, Math.sqrt(kurvenTempo(n) ** 2 + 2 * KURVE_BREMSEN * d))
      d += stueckLaenge(n); s = n
    }
    return v
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
    return this.fz.map((v, k) => {
      // die Lage nach zwei Drehgestellen DREHGESTELL der Länge innerhalb der Enden, nicht nach den Enden selbst: so schneidet der Wagen die Kurve weniger
      // (Michael, 2026-11-26: «Die Zugwagen schneiden die Kurven zu stark. Die Drehgestelle liegen in der Realität auch nicht direkt am Anfang und Ende des Wagens»)
      const vorn = k * (WAGEN_LAENGE + WAGEN_LUECKE), a = this.punkt(vorn + DREHGESTELL * WAGEN_LAENGE), c = this.punkt(vorn + (1 - DREHGESTELL) * WAGEN_LAENGE)
      const art = v.t === 'lok' ? 0 : v.t === 'steuer' ? 3 : 1 + (k % 2)
      return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, w: Math.atan2(a.y - c.y, a.x - c.x), art, vorne: v.t === 'wagen' ? k === 0 : v.blick === 1, diesel: v.diesel,
        gueter: this.art === 'gueter' || (v.typ !== undefined && v.typ !== 'person' && v.t === 'wagen'), typ: v.typ }
    })
  }
}
