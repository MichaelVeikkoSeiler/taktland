/**
 * Aufgaben im Gleisbau (Michael, 2026-11-22: «Zuerst freies Bauen und dann Aufgaben»; 2026-11-23, Vorschläge «Aufgaben» und «Echte Strecken
 * nachbauen»): je Aufgabe ein vorbereitetes Brett, ein Ziel und eine Prüfung. Sterne nach der Zahl der Gleisstücke: drei bis zur Vorgabe, zwei bis
 * ein Drittel darüber, sonst einer. Die echten Strecken und die Strecken ab einem Bahnhof sind seit 2026-11-26 weg (Michael: «Die echten Strecken können
 * vorerst mal komplett weggelassen werden. Sie haben keinen Maßstab und auch sonst etwas schwierig zu verstehen»). Aufgaben, Bretter und Vorgaben gewählt.
 */
import {
  type Brett, bahnhofGruppen, bahnhofTitel, type Dreh, DXY, grosseKurve, grossGeometrie, type Grund, leer, spalten,
  ueberWasser, wege, zeilen, Zug, gueterGilt, brettCode, brettAusCode,
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
  pruefen: (b: Brett, stand?: Transport) => { ok: boolean; text: string }
  /** Transportaufgaben: so viele Fahrgäste und Ladungen müssen während der Fahrt ans Ziel kommen */
  transport?: Partial<Transport>
  /**
   * was die Aufgabe verlangt, Schritt für Schritt und ob es schon erfüllt ist (Michael, 2026-11-25: «Für die Aufgaben hat man zu wenig Infos die ersichtlich
   * sind. Welche Halte etc sonst sehr schwierig»): bei echten Strecken die Bahnhöfe und je Abschnitt, ob Tunnel oder Brücke nötig sind
   */
  schritte?: (b: Brett, stand?: Transport) => Array<{ art: 'bahnhof' | 'abschnitt'; text: string; ok: boolean }>
  /** im Bahnbetrieb: Sterne nach den Baukosten statt nach den Gleisstücken, und die Baukosten selbst */
  sterne?: (b: Brett) => number
  kosten?: (b: Brett) => number
  /** in der Reihe: was die Aufgabe vorgibt (Bahnhöfe, Schuppen, Landschaft) ohne das Gebaute, für das, was fest bleibt; und ein frischer Anfang */
  vorgabeBrett?: () => Brett
  neu?: () => Brett
  /** in der Reihe: die Stelle, ab 0; offen erst, wenn die davor gelöst ist */
  reihe?: number
  /** im Tutorial: Hinweise der Reihe nach; der erste nicht erledigte steht über dem Brett, sein Werkzeug und seine Felder leuchten */
  fuehrung?: Fuehrung[]
}
/** ein Hinweis im Tutorial: werkzeug ist der Name des Werkzeugs unten, felder leuchten auf dem Brett; ohne fertig gilt er bis zum Lösen */
export interface Fuehrung { text: string; werkzeug?: string; felder?: Array<[number, number]>; fertig?: (x: FuehrungsLage) => boolean }
export interface FuehrungsLage { b: Brett; stand?: Transport; werkzeug: string; faehrt: boolean }
/** was während der Fahrt ans Ziel kam; jeGut im Bahnbetrieb */
export interface Transport { fahrgaeste: number; gueter: number; jeGut?: Partial<Record<string, number>> }

const [DX, DY] = DXY

/** wie viele Gleisstücke liegen (eine grosse Kurve zählt einmal) */
export const stuecke = (b: Brett) => b.flat().filter((f) => f.gleis).length

export function bewerten(a: Aufgabe, b: Brett, stand?: Transport): Ergebnis {
  const r = a.pruefen(b, stand)
  if (!r.ok) return { ...r, sterne: 0 }
  if (a.sterne) return { ok: true, text: r.text, sterne: a.sterne(b) }
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

/** ein Rundkurs: der Zug fährt drei Minuten lang, ohne je am Ende eines Gleises umzukehren, und kommt dabei durch einen Tunnel und über eine Brücke */
function rundkurs(b: Brett) {
  // seit 2026-11-26 sucht die Prüfung den Ring selbst (Michael, Bildschirmfoto eines Rings im gewachsenen Netz: «Die Aufgabe wäre doch somit gelöst»): ein Zug
  // auf jedem Tunnel, in beide Richtungen; bleibt er 2 Minuten im Kreis und fährt dabei über eine Brücke, ist es ein Rundkurs. Vorher fuhr er ab dem ersten
  // Bahnhof los, kam über eine falsch gestellte Weiche an ein Gleisende und kehrte um; ein Bahnhof im Ring ist nicht mehr nötig
  const tunnelFelder: Array<[number, number]> = []
  b.forEach((z, j) => z.forEach((f, i) => { if (f.gleis && bauwerk(b, i, j).tunnel) tunnelFelder.push([i, j]) }))
  if (!b.some((z) => z.some((f) => f.gleis))) return { ok: false, text: 'Es liegt noch kein Gleis.' }
  if (!tunnelFelder.length) return { ok: false, text: 'Der Ring muss durch einen Tunnel: Ein Gleis auf dem Berg wird zum Tunnel.' }
  let ohneBruecke = false
  for (const [i, j] of tunnelFelder) for (const r of [0, 1] as const) {
    const z = Zug.setzenBei(b, i, j, 'person', undefined, r)
    if (!z) continue
    let bruecke = false, umgekehrt = false
    for (let t = 0; t < 2400 && !umgekehrt; t++) {
      z.schritt(b, 0.05)
      const [u, v] = z.spitze()
      bruecke ||= bauwerk(b, u, v).bruecke && !!(b[v]?.[u]?.gleis || b[v]?.[u]?.teil)
      umgekehrt = z.umkehrungen > 0
    }
    if (!umgekehrt && bruecke) return { ok: true, text: 'Geschafft: ein Rundkurs durch einen Tunnel und über eine Brücke.' }
    if (!umgekehrt) ohneBruecke = true
  }
  if (ohneBruecke) return { ok: false, text: 'Der Ring ist geschlossen, aber er führt noch nicht über eine Brücke: Ein Gleis auf dem Wasser wird zur Brücke.' }
  return { ok: false, text: 'Noch fährt kein Zug im Kreis durch den Tunnel: Er kommt an ein Gleisende und kehrt um. Schliess den Ring (rote Punkte zeigen offene Enden) und tippe auf die Weichen im Ring, bis sie geradeaus im Ring weiterführen.' }
}

// ——— Transporte (Michael, 2026-11-25: «Erstelle Aufgaben für Personentransporte und Gütertransporte»; Bretter und Zahlen gewählt) ———

const schuppenFelder = (b: Brett) => b.flatMap((z, j) => z.flatMap((f, i) => (gueterGilt(f) ? [`${i},${j}`] : [])))

/**
 * eine Transportaufgabe: die Bahnhöfe und Güterschuppen verbunden, die nötigen Züge gesetzt (für Ladungen ein Güterzug; ohne gesetzte Züge fahren
 * Personenzüge), dann während der Fahrt so viele Fahrgäste und Ladungen ans Ziel
 */
function transport(ziel: Partial<Transport>) {
  const pruefen = (b: Brett, stand?: Transport) => {
    const bf = [...bahnhofFelder(b)]
    for (let k = 1; k < bf.length; k++) if (!wegGibt(b, bf[0][1], bf[k][1])) return { ok: false, text: `Noch führt kein Gleis von Bahnhof ${bf[0][0]} nach ${bf[k][0]}.` }
    const sf = schuppenFelder(b)
    for (let k = 1; k < sf.length; k++) if (!wegGibt(b, new Set([sf[0]]), new Set([sf[k]]))) return { ok: false, text: 'Noch führt kein Gleis von Güterschuppen zu Güterschuppen.' }
    const starts = b.flat().map((f) => f.zugStart).filter(Boolean)
    if (ziel.gueter && !starts.includes('g')) return { ok: false, text: 'Setze unter «Züge» einen Güterzug aufs Gleis: Nur er hält am Güterschuppen.' }
    if (ziel.fahrgaeste && starts.length && !starts.includes('p')) return { ok: false, text: 'Setze unter «Züge» auch einen Personenzug aufs Gleis: Nur er hält an den Bahnhöfen.' }
    const f = stand?.fahrgaeste ?? 0, g = stand?.gueter ?? 0
    const fehlt = [ziel.fahrgaeste && f < ziel.fahrgaeste && `${f} von ${ziel.fahrgaeste} Fahrgästen`, ziel.gueter && g < ziel.gueter && `${g} von ${ziel.gueter} Ladungen`].filter(Boolean)
    if (fehlt.length) return { ok: false, text: `Alles bereit. Lass fahren (▶): Bisher sind ${fehlt.join(' und ')} am Ziel.` }
    return { ok: true, text: `Geschafft: ${[ziel.fahrgaeste && `${ziel.fahrgaeste} Fahrgäste`, ziel.gueter && `${ziel.gueter} Ladungen`].filter(Boolean).join(' und ')} sind am Ziel.` }
  }
  const schritte = (_b: Brett, stand?: Transport) => [
    ...(ziel.fahrgaeste ? [{ art: 'bahnhof' as const, text: `Fahrgäste ${Math.min(stand?.fahrgaeste ?? 0, ziel.fahrgaeste)} / ${ziel.fahrgaeste}`, ok: (stand?.fahrgaeste ?? 0) >= ziel.fahrgaeste }] : []),
    ...(ziel.gueter ? [{ art: 'bahnhof' as const, text: `Ladungen ${Math.min(stand?.gueter ?? 0, ziel.gueter)} / ${ziel.gueter}`, ok: (stand?.gueter ?? 0) >= ziel.gueter }] : []),
  ]
  return { pruefen, schritte, transport: ziel }
}

// ——— die Reihe (Michael, 2026-11-26: «Mach es jetzt bitte so, dass man eine Aufgabe nach dem anderen lösen kann. Die jeweils folgende Aufgabe baut auf
// der vorderen Aufgabe auf»): ein Brett, das wächst. Jede Aufgabe beginnt mit dem gelösten Brett der vorherigen und bringt Neues dazu (Fluss, Berg,
// Bahnhöfe, Güterschuppen); offen erst, wenn die vorherige gelöst ist. Geprüft nach den Namen der Bahnhöfe, die sich nicht verschieben, wenn ein neuer
// dazukommt. Orte, Bretter und Zahlen gewählt ———

type Platz = [number, number]
/** was eine Stufe der Reihe dazubringt: Boden, Bahnhöfe mit Namen, Güterschuppen mit Anlage */
interface Zusatz { gruende?: Partial<Record<Grund, Platz[]>>; bahnhoefe?: Array<[number, number, Dreh, string]>; schuppen?: Array<[number, number, Dreh, string]> }
function zusetzen(b: Brett, z: Zusatz): Brett {
  const n = b.map((zz) => zz.map((f) => ({ ...f })))
  for (const [g, l] of Object.entries(z.gruende ?? {}) as Array<[Grund, Platz[]]>) for (const [i, j] of l) n[j][i] = { ...n[j][i], grund: g }
  for (const [i, j, dreh, name] of z.bahnhoefe ?? []) n[j][i] = { grund: n[j][i].grund === 'berg' || n[j][i].grund === 'wasser' ? 'wiese' : n[j][i].grund, gleis: { art: 'bahnhof', dreh }, name }
  for (const [i, j, dreh, name] of z.schuppen ?? []) n[j][i] = { grund: 'wiese', gleis: { art: 'gerade', dreh }, bau: 'gueter', anlage: name }
  return n
}
const REIHE_SP = 12, REIHE_ZE = 8
const ZUSAETZE: Zusatz[] = [
  { gruende: { dorf: [[0, 0], [1, 0], [5, 0]], wald: [[0, 7], [1, 7], [2, 7]] }, bahnhoefe: [[1, 1, 1, 'Seewil'], [5, 1, 1, 'Bergau']] },
  { gruende: { wasser: [[7, 0], [7, 1], [7, 2], [7, 3]], wald: [[11, 0]] }, bahnhoefe: [[9, 1, 1, 'Flussau']] },
  { gruende: { berg: [[8, 4], [9, 4], [10, 4], [11, 4], [8, 5]] }, bahnhoefe: [[10, 6, 1, 'Alpwil']] },
  { gruende: { wald: [[0, 4], [0, 5], [1, 4]] }, bahnhoefe: [[2, 5, 1, 'Waldegg']] },
  {},
  { gruende: { dorf: [[4, 3], [5, 3]] } },
  { gruende: { wald: [[11, 6], [11, 7]] }, schuppen: [[10, 7, 1, 'Forst Tannegg'], [4, 7, 1, 'Sägerei Seewil']] },
  {},
]
/** die Vorgabe bis zur Stufe n, ohne Gebautes */
const vorgabeBis = (n: number) => ZUSAETZE.slice(0, n + 1).reduce((b, z) => zusetzen(b, z), leer(REIHE_SP, REIHE_ZE))
/** Bretter der Reihe auf dem Gerät: gelöst je Stufe und das angefangene */
const REIHE_SPEICHER = 'taktland.gleisbau.reihe'
interface ReiheStand { geloest: Record<string, string>; arbeit: Record<string, string> }
function reiheLesen(): ReiheStand {
  try { const x = JSON.parse(localStorage.getItem(REIHE_SPEICHER) ?? 'null'); if (x && x.geloest && x.arbeit) return x } catch { /* neu */ }
  return { geloest: {}, arbeit: {} }
}
function reiheSchreiben(s: ReiheStand) { try { localStorage.setItem(REIHE_SPEICHER, JSON.stringify(s)) } catch { /* nur für jetzt */ } }
/** das Tutorial von vorn: die Bretter der Lektionen weg (Michael, 2026-11-26: «Bitte setze meinen Stand beim Gleisbau-Spiel bei den Tutorials zurück») */
export function reiheZuruecksetzen() { try { localStorage.removeItem(REIHE_SPEICHER) } catch { /* nichts gemerkt */ } }
export function reiheArbeitMerken(id: string, b: Brett) { const s = reiheLesen(); s.arbeit[id] = brettCode(b); reiheSchreiben(s) }
export function reiheGeloestMerken(id: string, b: Brett) { const s = reiheLesen(); s.geloest[id] = brettCode(b); reiheSchreiben(s) }

/** Bahnhöfe nach Namen verbinden */
function nachNamen(b: Brett) {
  const t = bahnhofTitel(b), f = bahnhofFelder(b), m = new Map<string, Set<string>>()
  for (const [buchstabe, name] of t) { const x = f.get(buchstabe); if (x) m.set(name, x) }
  return m
}
/** warum oft keine Verbindung entsteht (Michael, 2026-11-26: Linie von unten an einen waagrechten Bahnhof) */
const SEITE = 'Ein Bahnhof hat nur links und rechts ein Gleis: Die Linie muss von der Seite hinein.'
function verbindenN(a: string, c: string, mitTunnel = false, mitBruecke = false) {
  return (b: Brett) => {
    const f = nachNamen(b)
    if (!f.get(a) || !f.get(c)) return { ok: false, text: `Es braucht die Bahnhöfe ${a} und ${c}.` }
    if (!wegGibt(b, f.get(a)!, f.get(c)!)) return { ok: false, text: `Noch führt kein Gleis von ${a} nach ${c}. ${SEITE}` }
    if (!wegGibt(b, f.get(a)!, f.get(c)!, mitTunnel, mitBruecke)) {
      return { ok: false, text: `${a} und ${c} sind verbunden, aber der Weg führt noch nicht ${[mitTunnel && 'durch einen Tunnel', mitBruecke && 'über eine Brücke'].filter(Boolean).join(' und ')}.` }
    }
    return { ok: true, text: `Geschafft: ${a} und ${c} sind verbunden.` }
  }
}
function alleVerbunden(b: Brett) {
  const f = [...nachNamen(b)]
  for (let k = 1; k < f.length; k++) if (!wegGibt(b, f[0][1], f[k][1])) return { ok: false, text: `Noch führt kein Gleis von ${f[0][0]} nach ${f[k][0]}. ${SEITE}` }
  return { ok: true, text: 'Geschafft: Alle Bahnhöfe sind verbunden.' }
}

// ——— die Hinweise des Tutorials (Michael, 2026-11-26: «ein Bereich Tutorial, der erklärt Schritt für Schritt, interaktiv, wie man was genau anstellen kann»; Texte gewählt) ———
const verbunden = (a: string, c: string, t = false, br = false) => (x: FuehrungsLage) => verbindenN(a, c, t, br)(x.b).ok
const hatZug = (art: 'p' | 'g') => (x: FuehrungsLage) => x.b.some((z) => z.some((f) => f.zugStart === art))
const schuppenVerbunden = (x: FuehrungsLage) => { const sf = schuppenFelder(x.b); return sf.length >= 2 && sf.slice(1).every((k) => wegGibt(x.b, new Set([sf[0]]), new Set([k]))) }
const LINIE: Fuehrung = { text: 'Wähle unten im Reiter «Gleise» das Werkzeug «Linie».', werkzeug: 'Linie' }
const zugWaehlen = (art: 'p' | 'g'): Fuehrung => ({ text: `Tippe unten auf den Reiter «Züge» und wähle «${art === 'p' ? 'Personenzug' : 'Güterzug'}».`, werkzeug: art === 'p' ? 'Personenzug' : 'Güterzug' })
const FAHREN = (text: string): Fuehrung => ({ text: `Tippe rechts unter dem Brett auf den roten Knopf ▶ «Fahren». ${text}`, fertig: (x) => x.faehrt || (x.stand?.fahrgaeste ?? 0) > 0 || (x.stand?.gueter ?? 0) > 0 })
const FUEHRUNG: Fuehrung[][] = [
  [{ ...LINIE, fertig: (x) => x.werkzeug === 'Linie' || verbunden('Seewil', 'Bergau')(x) },
    { text: 'Zieh mit dem Finger von Seewil nach Bergau, Feld für Feld. Gerade Stücke und Kurven legt die Linie von selbst. Ein Bahnhof hat nur links und rechts ein Gleis. Rote Punkte zeigen Gleise, die noch offen enden.', felder: [[1, 1], [5, 1]], fertig: verbunden('Seewil', 'Bergau') }],
  [{ ...LINIE, fertig: (x) => x.werkzeug === 'Linie' || verbunden('Bergau', 'Flussau', false, true)(x) },
    { text: 'Zieh die Linie von Bergau über den Fluss bis Flussau. Ein Gleis auf dem Wasser wird von selbst zur Brücke.', felder: [[5, 1], [9, 1]], fertig: verbunden('Bergau', 'Flussau', false, true) }],
  [{ ...LINIE, fertig: (x) => x.werkzeug === 'Linie' || verbunden('Flussau', 'Alpwil', true)(x) },
    { text: 'Zieh die Linie rechts aus Flussau hinaus, dann nach unten über den Berg und von links oder rechts in Alpwil hinein. Ein Gleis auf dem Berg wird von selbst zum Tunnel.', felder: [[9, 1], [10, 1], [10, 6]], fertig: verbunden('Flussau', 'Alpwil', true) }],
  [{ text: 'Zieh mit «Linie» ein Gleis von deiner Strecke seitlich in Waldegg hinein. Wo es auf ein Gleis trifft, entsteht eine Weiche.', werkzeug: 'Linie', felder: [[2, 5]], fertig: (x) => alleVerbunden(x.b).ok },
    FAHREN('Ein Tipp auf eine Weiche stellt sie um, so fährt der Zug auch nach Waldegg.')],
  [{ text: 'Baue einen geschlossenen Ring, der über den Fluss und durch den Berg führt. Er darf an dein Netz anschliessen.' },
    { text: 'Tippe auf die Weichen im Ring, bis sie im Ring weiterführen. Gelöst ist die Lektion von selbst, sobald ein Zug im Ring im Kreis fahren kann.' }],
  [{ ...zugWaehlen('p'), fertig: (x) => x.werkzeug === 'Personenzug' || hatZug('p')(x) },
    { text: 'Tippe auf ein Gleis, am besten in einem Bahnhof: Dort steht jetzt dein Zug.', fertig: hatZug('p') },
    FAHREN('An den Bahnhöfen warten Fahrgäste mit ihrem Ziel. Jeder Personenwagen hat 4 Plätze.'),
    { text: 'Lass fahren, bis 15 Fahrgäste am Ziel sind. Die Zahl steht unten.' }],
  [{ text: 'Verbinde den Forst Tannegg und die Sägerei Seewil mit deinem Netz. Ein Güterschuppen ist ein Gleis, an dem nur Güterzüge halten.', werkzeug: 'Linie', felder: [[10, 7], [4, 7]], fertig: schuppenVerbunden },
    { ...zugWaehlen('g'), fertig: (x) => x.werkzeug === 'Güterzug' || hatZug('g')(x) },
    { text: 'Tippe auf ein Gleis, um den Güterzug hinzustellen.', fertig: hatZug('g') },
    FAHREN('Am Forst wartet Holz. Jeder Güterwagen trägt 1 Ladung zur Sägerei.'),
    { text: 'Lass fahren, bis 6 Ladungen geliefert sind.' }],
  [{ text: 'Stell unter «Züge» einen Personenzug und einen Güterzug auf die Gleise.', werkzeug: 'Personenzug', fertig: (x) => hatZug('p')(x) && hatZug('g')(x) },
    FAHREN('Beide Züge fahren zugleich: der Personenzug von Bahnhof zu Bahnhof, der Güterzug von Schuppen zu Schuppen.'),
    { text: 'Bring 10 Fahrgäste und 6 Ladungen ans Ziel. Danach weisst du alles für den Bahnbetrieb.' }],
]

const STUFEN_REIHE: Array<Omit<Aufgabe, 'brett' | 'vorgabeBrett' | 'neu' | 'reihe'>> = [
  { id: 'reihe-1', titel: 'Erste Verbindung', ziel: 'Verbinde Seewil mit Bergau.', pruefen: verbindenN('Seewil', 'Bergau') },
  { id: 'reihe-2', titel: 'Über den Fluss', ziel: 'Hinter dem Fluss liegt Flussau. Verlängere die Linie von Bergau nach Flussau: Ein Gleis auf Wasser wird zur Brücke.', pruefen: verbindenN('Bergau', 'Flussau', false, true) },
  { id: 'reihe-3', titel: 'Durch den Berg', ziel: 'Alpwil liegt hinter dem Berg. Verbinde Flussau und Alpwil durch einen Tunnel: Ein Gleis auf einem Berg wird zum Tunnel.', pruefen: verbindenN('Flussau', 'Alpwil', true) },
  { id: 'reihe-4', titel: 'Ein Netz', ziel: 'Waldegg kommt dazu. Verbinde alle Bahnhöfe so, dass man von jedem zu jedem fahren kann. Weichen helfen.', pruefen: alleVerbunden },
  { id: 'reihe-5', titel: 'Rundkurs', ziel: 'Baue im Netz einen geschlossenen Ring, durch einen Tunnel und über eine Brücke. Stell die Weichen so, dass ein Zug im Ring immer im Kreis fährt.', pruefen: rundkurs },
  { id: 'reihe-6', titel: 'Pendler', ziel: 'Jetzt fahren Fahrgäste. Bring 15 Fahrgäste an ihr Ziel. Alle Bahnhöfe müssen verbunden sein.', ...transport({ fahrgaeste: 15 }) },
  { id: 'reihe-7', titel: 'Holz aus dem Wald', ziel: 'Der Forst Tannegg und die Sägerei Seewil kommen dazu. Schliess sie ans Netz an, setz unter «Züge» einen Güterzug und liefere 6 Ladungen.', ...transport({ gueter: 6 }) },
  { id: 'reihe-8', titel: 'Güter und Pendler', ziel: 'Alles zugleich: Setz einen Personenzug und einen Güterzug und bring 10 Fahrgäste und 6 Ladungen ans Ziel.', ...transport({ fahrgaeste: 10, gueter: 6 }) },
]

export const AUFGABEN: Aufgabe[] = STUFEN_REIHE.map((a, n): Aufgabe => {
  // der Anfang: das gelöste Brett der Stufe davor mit dem Neuen dieser Stufe; ohne es die Vorgabe allein
  const neu = () => {
    const vorher = n > 0 ? reiheLesen().geloest[STUFEN_REIHE[n - 1].id] : undefined
    const b = vorher ? brettAusCode(vorher) : null
    return b && spalten(b) === REIHE_SP && zeilen(b) === REIHE_ZE ? zusetzen(b, ZUSAETZE[n]) : vorgabeBis(n)
  }
  return {
    ...a, reihe: n, neu, vorgabeBrett: () => vorgabeBis(n), fuehrung: FUEHRUNG[n],
    brett: () => { const x = reiheLesen().arbeit[a.id]; return (x && brettAusCode(x)) || neu() },
  }
})

// ——— Fortschritt ———

const FORTSCHRITT = 'taktland.gleisbau.aufgaben'
export function fortschrittLesen(): Record<string, number> {
  try { const x = JSON.parse(localStorage.getItem(FORTSCHRITT) ?? '{}'); return x && typeof x === 'object' ? x : {} } catch { return {} }
}
export function fortschrittMerken(f: Record<string, number>) {
  try { localStorage.setItem(FORTSCHRITT, JSON.stringify(f)) } catch { /* nur für jetzt */ }
}

