/**
 * Aufgaben im Gleisbau (Michael, 2026-11-22: «Zuerst freies Bauen und dann Aufgaben»; 2026-11-23, Vorschläge «Aufgaben» und «Echte Strecken
 * nachbauen»): je Aufgabe ein vorbereitetes Brett, ein Ziel und eine Prüfung. Sterne nach der Zahl der Gleisstücke: drei bis zur Vorgabe, zwei bis
 * ein Drittel darüber, sonst einer. Die echten Strecken aus src/assets/gleisbau-strecken.json (pipeline/build_gleisbau_strecken.py): die Bahnhöfe der
 * Reihe nach, und wo laut Daten zwischen zwei Bahnhöfen Tunnel oder Brücken liegen, braucht es auf dem Brett mindestens einen Tunnel oder eine Brücke;
 * das Brett kennt keinen Massstab. Aufgaben, Bretter und Vorgaben gewählt.
 */
import STRECKEN from './assets/gleisbau-strecken.json'
import {
  type Brett, bahnhofGruppen, bahnhofTitel, type Dreh, DXY, type GleisArt, grosseKurve, grossGeometrie, type Grund, istBahnhof, leer, spalten,
  ueberWasser, wege, zeilen, Zug,
} from './gleisbau'

export interface Ergebnis { ok: boolean; text: string; sterne: number }
export interface Aufgabe {
  id: string
  titel: string
  ziel: string
  /** Hinweis zur Herkunft, bei echten Strecken die Zahlen aus den Daten */
  daten?: string
  brett: () => Brett
  /** Vorgabe an Gleisstücken für drei Sterne; ohne Vorgabe gibt das Lösen drei Sterne */
  vorgabe?: number
  pruefen: (b: Brett) => { ok: boolean; text: string }
  /**
   * was die Aufgabe verlangt, Schritt für Schritt und ob es schon erfüllt ist (Michael, 2026-11-25: «Für die Aufgaben hat man zu wenig Infos die ersichtlich
   * sind. Welche Halte etc sonst sehr schwierig»): bei echten Strecken die Bahnhöfe und je Abschnitt, ob Tunnel oder Brücke nötig sind
   */
  schritte?: (b: Brett) => Array<{ art: 'bahnhof' | 'abschnitt'; text: string; ok: boolean }>
}

const [DX, DY] = DXY

/** wie viele Gleisstücke liegen (eine grosse Kurve zählt einmal) */
export const stuecke = (b: Brett) => b.flat().filter((f) => f.gleis).length

export function bewerten(a: Aufgabe, b: Brett): Ergebnis {
  const r = a.pruefen(b)
  if (!r.ok) return { ...r, sterne: 0 }
  const n = stuecke(b)
  const sterne = !a.vorgabe || n <= a.vorgabe ? 3 : n <= Math.ceil(a.vorgabe * 4 / 3) ? 2 : 1
  return { ok: true, text: a.vorgabe ? `${r.text} Mit ${n} Gleisstücken (Vorgabe für drei Sterne: ${a.vorgabe}).` : r.text, sterne }
}

// ——— das Netz als Knoten (Feld und Kante) ———

const key = (i: number, j: number, k: number) => `${i},${j},${k}`

/** Nachbarn je Knoten: im Stück zur anderen Kante eines Wegs, über die Kante ins Nachbarfeld; Weichen in jede Richtung (man stellt sie) */
function netz(b: Brett): Map<string, string[]> {
  const n = new Map<string, string[]>()
  const dazu = (a: string, c: string) => { n.set(a, [...(n.get(a) ?? []), c]); n.set(c, [...(n.get(c) ?? []), a]) }
  const hat = new Set<string>()
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    const g = b[j][i].gleis
    if (!g) continue
    if (grosseKurve(g)) {
      const G = grossGeometrie(i, j, g)
      const a = key(G.anfang.i, G.anfang.j, G.anfang.kante), e = key(G.ende.i, G.ende.j, G.ende.kante)
      hat.add(a); hat.add(e); dazu(a, e)
      continue
    }
    for (const [a, c] of wege(g)) {
      if (a >= 0) hat.add(key(i, j, a))
      if (c >= 0) hat.add(key(i, j, c))
      if (a >= 0 && c >= 0) dazu(key(i, j, a), key(i, j, c))
    }
  }
  for (const k of hat) {
    const [i, j, r] = k.split(',').map(Number)
    const g = key(i + DX[r], j + DY[r], (r + 2) % 4)
    if (hat.has(g) && k < g) dazu(k, g)
  }
  for (const k of hat) if (!n.has(k)) n.set(k, [])
  return n
}

/** Tunnel oder Brücke: auf welchem Grund das Stück liegt, zu dem der Knoten gehört (bei grossen Kurven alle ihre Felder) */
function bauwerk(b: Brett, i: number, j: number): { tunnel: boolean; bruecke: boolean } {
  const f = b[j]?.[i]
  if (!f) return { tunnel: false, bruecke: false }
  const halter = f.teil ? b[f.teil[1]][f.teil[0]] : f
  if (grosseKurve(halter.gleis)) {
    const [hi, hj] = f.teil ?? [i, j]
    const gr = grossGeometrie(hi, hj, halter.gleis!).zellen.map(([u, v]) => b[v]?.[u]?.grund)
    return { tunnel: gr.includes('berg'), bruecke: grossGeometrie(hi, hj, halter.gleis!).zellen.some(([u, v]) => ueberWasser(b[v]?.[u])) }
  }
  return { tunnel: f.grund === 'berg', bruecke: ueberWasser(f) }
}

/** ob es einen Weg von einem Feld der Menge «von» zu einem der Menge «nach» gibt, auf Wunsch durch einen Tunnel und über eine Brücke */
function wegGibt(b: Brett, von: Set<string>, nach: Set<string>, mitTunnel = false, mitBruecke = false): boolean {
  const n = netz(b)
  const start = [...n.keys()].filter((k) => von.has(k.split(',').slice(0, 2).join(',')))
  const gesehen = new Set<string>(), offen: Array<[string, boolean, boolean]> = []
  for (const s of start) {
    const [i, j] = s.split(',').map(Number), w = bauwerk(b, i, j)
    offen.push([s, w.tunnel, w.bruecke])
  }
  while (offen.length) {
    const [k, t, br] = offen.pop()!
    const z = `${k}|${t}|${br}`
    if (gesehen.has(z)) continue
    gesehen.add(z)
    const [i, j] = k.split(',').map(Number)
    if (nach.has(`${i},${j}`) && (!mitTunnel || t) && (!mitBruecke || br)) return true
    for (const m of n.get(k) ?? []) {
      const [u, v] = m.split(',').map(Number), w = bauwerk(b, u, v)
      offen.push([m, t || w.tunnel, br || w.bruecke])
    }
  }
  return false
}

/** die Felder je Bahnhof (Buchstabe) */
function bahnhofFelder(b: Brett): Map<string, Set<string>> {
  const raus = new Map<string, Set<string>>()
  for (const [f, g] of bahnhofGruppen(b)) raus.set(g, new Set([...(raus.get(g) ?? []), f]))
  return raus
}

// ——— vorbereitete Bretter ———

function brett(sp: number, ze: number, gruende: Partial<Record<Grund, Array<[number, number]>>>, gleise: Array<[number, number, GleisArt, Dreh]> = []): Brett {
  const b = leer(sp, ze)
  for (const [g, l] of Object.entries(gruende) as Array<[Grund, Array<[number, number]>]>) for (const [i, j] of l) b[j][i].grund = g
  for (const [i, j, art, dreh] of gleise) b[j][i] = { ...b[j][i], gleis: { art, dreh } }
  return b
}
const spalte = (i: number, j0: number, j1: number): Array<[number, number]> => Array.from({ length: j1 - j0 + 1 }, (_, k) => [i, j0 + k])

/** zwei Bahnhöfe verbinden, auf Wunsch durch einen Tunnel und über eine Brücke */
function verbinden(a: string, c: string, mitTunnel = false, mitBruecke = false) {
  return (b: Brett) => {
    const f = bahnhofFelder(b)
    if (!f.get(a) || !f.get(c)) return { ok: false, text: `Es braucht die Bahnhöfe ${a} und ${c}.` }
    if (!wegGibt(b, f.get(a)!, f.get(c)!)) return { ok: false, text: `Noch führt kein Gleis von ${a} nach ${c}.` }
    if (!wegGibt(b, f.get(a)!, f.get(c)!, mitTunnel, mitBruecke)) {
      return { ok: false, text: `${a} und ${c} sind verbunden, aber der Weg führt noch nicht ${[mitTunnel && 'durch einen Tunnel', mitBruecke && 'über eine Brücke'].filter(Boolean).join(' und ')}.` }
    }
    return { ok: true, text: `Geschafft: ${a} und ${c} sind verbunden.` }
  }
}

/** ein Rundkurs: der Zug fährt drei Minuten lang, ohne je am Ende eines Gleises umzukehren, und kommt dabei durch einen Tunnel und über eine Brücke */
function rundkurs(b: Brett) {
  const z = Zug.setzen(b)
  if (!z) return { ok: false, text: 'Es liegt noch kein Gleis.' }
  let tunnel = false, bruecke = false
  for (let t = 0; t < 3600; t++) {
    z.schritt(b, 0.05)
    const [i, j] = z.spitze(), w = bauwerk(b, i, j)
    tunnel ||= w.tunnel && !!(b[j]?.[i]?.gleis || b[j]?.[i]?.teil)
    bruecke ||= w.bruecke && !!(b[j]?.[i]?.gleis || b[j]?.[i]?.teil)
    if (z.umkehrungen > 0) return { ok: false, text: 'Der Zug kommt an ein Gleisende und kehrt um. Ein Rundkurs braucht einen geschlossenen Ring (rote Punkte zeigen offene Enden).' }
  }
  if (!tunnel || !bruecke) return { ok: false, text: `Der Ring ist geschlossen, aber der Zug fährt noch nicht ${[!tunnel && 'durch einen Tunnel', !bruecke && 'über eine Brücke'].filter(Boolean).join(' und ')}.` }
  if (!b.flat().some((f) => istBahnhof(f.gleis))) return { ok: false, text: 'Der Ring braucht noch einen Bahnhof.' }
  return { ok: true, text: 'Geschafft: ein Rundkurs mit Bahnhof, Tunnel und Brücke.' }
}

export const AUFGABEN: Aufgabe[] = [
  {
    id: 'erste', titel: 'Erste Verbindung', ziel: 'Verbinde Bahnhof A mit Bahnhof B.', vorgabe: 7,
    brett: () => brett(6, 4, { wald: [[0, 3], [5, 0]], dorf: [[0, 0], [5, 3]] }, [[0, 1, 'bahnhof', 1], [5, 2, 'bahnhof', 1]]),
    pruefen: verbinden('A', 'B'),
  },
  {
    id: 'fluss', titel: 'Über den Fluss', ziel: 'Verbinde A und B. Dazwischen fliesst ein Fluss: Ein Gleis auf Wasser wird zur Brücke.', vorgabe: 9,
    brett: () => brett(8, 6, { wasser: spalte(4, 0, 5), wald: [[1, 4], [6, 0], [7, 0]], dorf: [[0, 0], [7, 5]] }, [[1, 1, 'bahnhof', 1], [6, 4, 'bahnhof', 1]]),
    pruefen: verbinden('A', 'B', false, true),
  },
  {
    id: 'berg', titel: 'Durch den Berg', ziel: 'Verbinde A und B durch einen Tunnel: Ein Gleis auf einem Berg wird zum Tunnel.', vorgabe: 9,
    brett: () => brett(8, 6, { berg: [...spalte(3, 0, 5), ...spalte(4, 0, 5), [5, 2], [2, 3]], wald: [[0, 5], [7, 0]] }, [[1, 2, 'bahnhof', 0], [6, 3, 'bahnhof', 0]]),
    pruefen: verbinden('A', 'B', true),
  },
  {
    id: 'drei', titel: 'Drei Bahnhöfe', ziel: 'Verbinde die Bahnhöfe A, B und C so, dass man von jedem zu jedem fahren kann. Weichen helfen.', vorgabe: 9,
    brett: () => brett(8, 6, { wasser: [[3, 3], [4, 3], [4, 4]], dorf: [[0, 0], [7, 0], [3, 5]], wald: [[6, 5], [7, 5]] }, [[1, 1, 'bahnhof', 1], [6, 1, 'bahnhof', 1], [3, 4, 'bahnhof', 0]]),
    pruefen: (b) => {
      const ab = verbinden('A', 'B')(b)
      if (!ab.ok) return ab
      const ac = verbinden('A', 'C')(b)
      if (!ac.ok) return ac
      return { ok: true, text: 'Geschafft: alle drei Bahnhöfe sind verbunden.' }
    },
  },
  {
    id: 'ring', titel: 'Rundkurs', ziel: 'Baue einen geschlossenen Ring mit mindestens einem Bahnhof, der durch einen Tunnel und über eine Brücke führt. Der Zug darf nie umkehren müssen.', vorgabe: 14,
    brett: () => brett(8, 6, { wasser: [[2, 0], [2, 1], [3, 1], [4, 1]], berg: [[5, 4], [6, 4], [6, 5], [7, 4]], wald: [[0, 5], [1, 5], [7, 0]], dorf: [[3, 3], [4, 3]] }),
    pruefen: rundkurs,
  },
  {
    id: 'sparsam', titel: 'Sparsam bauen', ziel: 'Verbinde A und B mit möglichst wenigen Gleisstücken. Die grossen Kurven zählen je als ein Stück.', vorgabe: 7,
    brett: () => brett(8, 6, { wald: [[2, 2], [3, 2], [2, 3], [3, 3], [5, 0], [6, 0]], wasser: [[5, 4], [5, 5]] }, [[0, 1, 'bahnhof', 1], [7, 4, 'bahnhof', 1]]),
    pruefen: verbinden('A', 'B'),
  },
]

// ——— echte Strecken ———

interface StreckeDaten { titel: string; bahnhoefe: string[]; teile: Array<{ tunnel: number; bruecken: number; ohne_daten: number }> }
const S = STRECKEN as { datenstand: string; strecken: StreckeDaten[] }

/** «1 Tunnel», «20 Tunnel», «1 Brücke», «79 Brücken» */
const anzahl = (n: number, eins: string, viele: string) => `${n.toLocaleString('de-CH').replace(/’/g, '\'')} ${n === 1 ? eins : viele}`

/** eine echte Strecke als Aufgabe: die Bahnhöfe der Reihe nach, je Paar Tunnel und Brücken laut Daten */
export function streckeAufgabe(id: string, titel: string, bahnhoefe: string[], teile: StreckeDaten['teile'], datenstand: string, gross = 12): Aufgabe {
  const liste = bahnhoefe.join(', ')
  const daten = teile.map((t, k) => `${bahnhoefe[k]} – ${bahnhoefe[k + 1]}: ${anzahl(t.tunnel, 'Tunnel', 'Tunnel')}, ${anzahl(t.bruecken, 'Brücke', 'Brücken')}${t.ohne_daten ? ' (Daten lückenhaft)' : ''}`)
  return {
    id, titel,
    ziel: `Baue die Strecke nach: die Bahnhöfe ${liste} in dieser Reihenfolge, jeder mit «Name» benannt. Wo laut Daten zwischen zwei Bahnhöfen Tunnel oder Brücken liegen, braucht es mindestens einen Tunnel oder eine Brücke; das Brett hat keinen Massstab.`,
    daten: `Laut Daten der Strecken in Taktland (Stand ${datenstand}) auf dem Weg im Netz: ${daten.join('; ')}.`,
    brett: () => leer(gross, 8),
    pruefen: (b) => {
      const titel = bahnhofTitel(b), felder = bahnhofFelder(b)
      const buchstabe = (name: string) => [...titel].find(([, n]) => n === name)?.[0]
      for (const n of bahnhoefe) if (!buchstabe(n)) return { ok: false, text: `Es fehlt ein Bahnhof mit dem Namen «${n}» (Werkzeug «Name»).` }
      for (let k = 0; k + 1 < bahnhoefe.length; k++) {
        const a = bahnhoefe[k], c = bahnhoefe[k + 1], t = teile[k]
        const fa = felder.get(buchstabe(a)!)!, fc = felder.get(buchstabe(c)!)!
        if (!wegGibt(b, fa, fc)) return { ok: false, text: `Noch führt kein Gleis von ${a} nach ${c}.` }
        if (!wegGibt(b, fa, fc, t.tunnel > 0, t.bruecken > 0)) {
          const ohneT = t.tunnel > 0 && !wegGibt(b, fa, fc, true, false), ohneB = t.bruecken > 0 && !wegGibt(b, fa, fc, false, true)
          const fehlt = [ohneT && 'einen Tunnel', ohneB && 'eine Brücke'].filter(Boolean).join(' und ')
          return { ok: false, text: fehlt ? `Zwischen ${a} und ${c} braucht es noch ${fehlt}.` : `Zwischen ${a} und ${c} müssen Tunnel und Brücke auf demselben Weg liegen.` }
        }
      }
      return { ok: true, text: `Geschafft: ${titel} von ${bahnhoefe[0]} bis ${bahnhoefe[bahnhoefe.length - 1]}.` }
    },
    schritte: (b) => {
      const titel = bahnhofTitel(b), felder = bahnhofFelder(b)
      const buchstabe = (name: string) => [...titel].find(([, n]) => n === name)?.[0]
      const l: Array<{ art: 'bahnhof' | 'abschnitt'; text: string; ok: boolean }> = []
      bahnhoefe.forEach((n, k) => {
        l.push({ art: 'bahnhof', text: n, ok: !!buchstabe(n) })
        const t = teile[k]
        if (!t) return
        const fa = buchstabe(n) ? felder.get(buchstabe(n)!) : undefined, fc = buchstabe(bahnhoefe[k + 1]) ? felder.get(buchstabe(bahnhoefe[k + 1])!) : undefined
        const braucht = [t.tunnel > 0 && 'Tunnel', t.bruecken > 0 && 'Brücke'].filter(Boolean).join(' + ')
        l.push({ art: 'abschnitt', text: braucht || 'Gleis', ok: !!fa && !!fc && wegGibt(b, fa, fc, t.tunnel > 0, t.bruecken > 0) })
      })
      return l
    },
  }
}

for (const s of S.strecken) AUFGABEN.push(streckeAufgabe(`strecke-${s.titel}`, s.titel, s.bahnhoefe, s.teile, S.datenstand))

/**
 * Varianten aus einem Bahnhof (Michael, 2026-11-24: «Man kann auch Bahnhöfe eingeben dann gibt es echte Varianten in unterschiedliche Richtungen»):
 * aus pipeline/build_gleisbau_strecken.py, je Bahnhof in jede Richtung die nächsten Bahnhöfe, erst geladen, wenn man sucht
 */
export interface Varianten { datenstand: string; varianten: Record<string, Array<[string[], number[]]>> }
let variantenCache: Promise<Varianten> | null = null
export function variantenLaden(): Promise<Varianten> {
  variantenCache ??= import('./assets/gleisbau-varianten.json').then((m) => (m.default ?? m) as unknown as Varianten)
  return variantenCache
}
export function varianteAufgabe(v: Varianten, folge: string[], zahlen: number[]): Aufgabe {
  const teile = folge.slice(1).map((_, k) => ({ tunnel: zahlen[3 * k], bruecken: zahlen[3 * k + 1], ohne_daten: zahlen[3 * k + 2] }))
  return streckeAufgabe(`v:${folge.join('|')}`, `${folge[0]} – ${folge[folge.length - 1]}`, folge, teile, v.datenstand, Math.max(10, 4 * folge.length))
}
/** eine Variante nach ihrer Kennung «v:A|B|C» */
export async function varianteAusId(id: string): Promise<Aufgabe | null> {
  if (!id.startsWith('v:')) return null
  const folge = id.slice(2).split('|'), v = await variantenLaden()
  const treffer = v.varianten[folge[0]]?.find(([f]) => f.join('|') === folge.join('|'))
  return treffer ? varianteAufgabe(v, treffer[0], treffer[1]) : null
}

// ——— Fortschritt ———

const FORTSCHRITT = 'taktland.gleisbau.aufgaben'
export function fortschrittLesen(): Record<string, number> {
  try { const x = JSON.parse(localStorage.getItem(FORTSCHRITT) ?? '{}'); return x && typeof x === 'object' ? x : {} } catch { return {} }
}
export function fortschrittMerken(f: Record<string, number>) {
  try { localStorage.setItem(FORTSCHRITT, JSON.stringify(f)) } catch { /* nur für jetzt */ }
}

