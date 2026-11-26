/**
 * Bahnbetrieb im Gleisbau (Michael, 2026-11-25: «Es soll ein Spiel geben welches süchtig machen soll … Anfänger und absolute Bahnfreaks beschäftigen
 * soll. Evtl braucht es beim Spieleröffnen die nötigen Fragen bis alles bereit ist. Coole spannende nach Kategorien angeordnete Aufgaben
 * (leicht/mittel/schwer, Personentransport, Gütertransport, Mix soll gewählt werden können … Diverse fiktive Loks und Wagen stehen bereit», dann
 * gewählt: mit Geld, im Gleisbau, ohne Zeit, Jahreszeiten später): Aufträge auf vorbereiteten Brettern mit fiktiven Orten und Anlagen, ein Lohn je
 * Auftrag, davon gehen die Baukosten ab; mit dem Geld kauft man im Depot Loks und Wagen. Orte, Anlagen, Zahlen und Preise gewählt, keine Wirklichkeit
 */
import { type Brett, type Dreh, grosseKurve, type Grund, istBahnhof, leer, ueberWasser } from './gleisbau'
import { type Gut, GUETER, type LokTyp, LOKS, type WagenTyp, WAGEN_ARTEN, type Zusammenstellung } from './gleisbauFahrzeuge'
import type { Aufgabe, Transport } from './gleisbauAufgaben'

export type Stufe = 'leicht' | 'mittel' | 'schwer'
export type Sparte = 'personen' | 'gueter' | 'mix'
export const STUFEN: Record<Stufe, string> = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' }
export const SPARTEN: Record<Sparte, string> = { personen: 'Personen', gueter: 'Güter', mix: 'Mix' }

export interface Auftrag {
  id: string; titel: string; stufe: Stufe; sparte: Sparte
  /** worum es geht, in einem oder zwei Sätzen */
  text: string
  brett: () => Brett
  /** so viele Fahrgäste ans Ziel */
  fahrgaeste?: number
  /** von Anlage zu Anlage: Gut und Menge */
  routen: Array<{ von: string; nach: string; gut: Gut; anzahl: number }>
  lohn: number
  /** Baukosten für drei Sterne */
  vorgabe: number
}

// ——— Baukosten (gewählt) ———

const PREIS: Record<string, number> = {
  gerade: 10, kurve: 10, bahnhof: 40, kurvenbahnhof: 40, weiche: 25, weiche_l: 25, kreuzung: 25, doppelkurve: 25, dreiweg: 35, ueberfuehrung: 50,
  prellbock: 5, bogen2: 30, bogen3: 45,
}
export const TUNNEL_PREIS = 50, BRUECKE_PREIS = 30
/** was die Gleise auf dem Brett kosten: je Stück, ein Tunnel und eine Brücke kosten dazu */
export function baukosten(b: Brett): number {
  let k = 0
  for (const z of b) for (const f of z) {
    if (!f.gleis) continue
    k += PREIS[f.gleis.art] ?? 10
    if (grosseKurve(f.gleis)) continue
    if (f.grund === 'berg') k += TUNNEL_PREIS
    else if (ueberWasser(f)) k += BRUECKE_PREIS
  }
  return k
}

// ——— der Spielstand auf dem Gerät ———

export interface Betrieb {
  geld: number
  loks: LokTyp[]
  wagen: Partial<Record<WagenTyp, number>>
  /** die Wahl beim Start; fehlt sie, fragt das Spiel */
  stufe: Stufe | null
  sparte: Sparte | null
  /** je Auftrag die Sterne und ob der volle Lohn schon bezahlt ist */
  erledigt: Record<string, number>
  /** je Auftrag das Brett (Code) und die gesetzten Züge */
  bretter: Record<string, string>
  zuege: Record<string, Record<string, Zusammenstellung>>
}
export const START_GELD = 500
const SPEICHER = 'taktland.gleisbau.betrieb'
export const betriebNeu = (): Betrieb => ({
  geld: START_GELD, loks: ['murmeli', 'libelle'], wagen: { person: 3, rungen: 2, schuett: 2 }, stufe: null, sparte: null, erledigt: {}, bretter: {}, zuege: {},
})
export function betriebLesen(): Betrieb {
  try {
    const x = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null')
    if (x && typeof x.geld === 'number' && Array.isArray(x.loks)) return { ...betriebNeu(), ...x }
  } catch { /* neu */ }
  return betriebNeu()
}
export function betriebMerken(b: Betrieb) {
  try { localStorage.setItem(SPEICHER, JSON.stringify(b)) } catch { /* nur für jetzt */ }
}
/** beim Wiederholen eines erledigten Auftrags gibt es diesen Anteil des Gewinns (gewählt) */
export const WIEDERHOLT_ANTEIL = 0.25

/** was im Depot noch frei ist, wenn diese Züge schon gesetzt sind */
export function frei(b: Betrieb, gesetzt: Zusammenstellung[]) {
  const loks = [...b.loks]
  for (const z of gesetzt) { const k = loks.indexOf(z.lok); if (k >= 0) loks.splice(k, 1) }
  const wagen: Partial<Record<WagenTyp, number>> = { ...b.wagen }
  for (const z of gesetzt) for (const w of z.wagen) wagen[w] = (wagen[w] ?? 0) - 1
  return { loks, wagen }
}

/** ob die Stufe offen ist: mittel nach zwei leichten Aufträgen, schwer nach zwei mittleren (gewählt) */
export function stufeOffen(b: Betrieb, s: Stufe) {
  if (s === 'leicht') return true
  const vorher: Stufe = s === 'mittel' ? 'leicht' : 'mittel'
  return AUFTRAEGE.filter((a) => a.stufe === vorher && b.erledigt[a.id]).length >= 2
}

// ——— die Bretter der Aufträge ———

type Platz = [number, number]
function karte(sp: number, ze: number, gruende: Partial<Record<Grund, Platz[]>>, bahnhoefe: Array<[number, number, Dreh, string]>, anlagen: Array<[number, number, Dreh, string]>, fluss: Platz[] = []): Brett {
  const b = leer(sp, ze)
  for (const [g, l] of Object.entries(gruende) as Array<[Grund, Platz[]]>) for (const [i, j] of l) b[j][i].grund = g
  for (const [i, j] of fluss) b[j][i].fluss = true
  for (const [i, j, dreh, name] of bahnhoefe) b[j][i] = { ...b[j][i], grund: 'wiese', gleis: { art: 'bahnhof', dreh }, name }
  for (const [i, j, dreh, name] of anlagen) b[j][i] = { ...b[j][i], grund: 'wiese', gleis: { art: 'gerade', dreh }, bau: 'gueter', anlage: name }
  return b
}
const block = (i0: number, j0: number, i1: number, j1: number): Platz[] => {
  const l: Platz[] = []
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) l.push([i, j])
  return l
}

export const AUFTRAEGE: Auftrag[] = [
  // ——— leicht ———
  {
    id: 'b-pendler', titel: 'Erster Pendlerzug', stufe: 'leicht', sparte: 'personen', fahrgaeste: 10, routen: [], lohn: 900, vorgabe: 120,
    text: 'Die Leute aus Seewil arbeiten in Bergau. Bau eine Linie und setz einen Zug mit Personenwagen ein.',
    brett: () => karte(9, 5, { dorf: [[0, 0], [1, 0], [8, 4], [7, 4]], wald: [[4, 0], [4, 4], [5, 4]] }, [[1, 1, 1, 'Seewil'], [7, 3, 1, 'Bergau']], []),
  },
  {
    id: 'b-holz', titel: 'Holz für die Sägerei', stufe: 'leicht', sparte: 'gueter', routen: [{ von: 'Forst Tannegg', nach: 'Sägerei Bachmatt', gut: 'holz', anzahl: 6 }], lohn: 1000, vorgabe: 120,
    text: 'Im Forst Tannegg liegen Stämme bereit. Holz fährt auf Rungenwagen, die Rangierlok Murmeli zieht sie.',
    brett: () => karte(9, 5, { wald: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 2], [2, 2]], dorf: [[8, 4], [7, 4]] }, [], [[1, 1, 1, 'Forst Tannegg'], [7, 3, 1, 'Sägerei Bachmatt']]),
  },
  {
    id: 'b-schulweg', titel: 'Schulweg', stufe: 'leicht', sparte: 'personen', fahrgaeste: 12, routen: [], lohn: 1200, vorgabe: 220,
    text: 'Aus Dorfmatt und Feldegg fahren die Kinder nach Schulhausen und wieder zurück. Über den Bach braucht es eine Brücke.',
    brett: () => karte(10, 6, { dorf: [[0, 0], [9, 0], [4, 5]], wald: [[8, 5], [9, 5], [0, 5]] }, [[1, 1, 1, 'Dorfmatt'], [8, 1, 1, 'Schulhausen'], [4, 4, 1, 'Feldegg']], [], [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5]]),
  },
  {
    id: 'b-kies', titel: 'Kies für die Baustelle', stufe: 'leicht', sparte: 'gueter', routen: [{ von: 'Kieswerk Flussau', nach: 'Baustelle Neuhof', gut: 'kies', anzahl: 6 }], lohn: 1100, vorgabe: 160,
    text: 'Neuhof baut ein Schulhaus. Bring Kies aus dem Kieswerk am Fluss, auf Schüttgutwagen.',
    brett: () => karte(10, 5, { dorf: [[9, 0], [8, 0]], wald: [[0, 0], [1, 0]] }, [], [[1, 3, 1, 'Kieswerk Flussau'], [8, 1, 1, 'Baustelle Neuhof']], [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4]]),
  },
  {
    id: 'b-morgen', titel: 'Morgen im Tal', stufe: 'leicht', sparte: 'mix', fahrgaeste: 8, routen: [{ von: 'Forst Ried', nach: 'Sägerei Talwil', gut: 'holz', anzahl: 4 }], lohn: 1600, vorgabe: 260,
    text: 'Pendler zwischen Talwil und Obermatt, dazu Holz aus dem Forst Ried. Zwei Züge oder einer mit beidem?',
    brett: () => karte(10, 6, { wald: [[9, 0], [9, 1], [8, 0]], dorf: [[0, 0], [9, 5]] }, [[1, 1, 1, 'Talwil'], [8, 4, 1, 'Obermatt']], [[8, 1, 1, 'Forst Ried'], [1, 4, 1, 'Sägerei Talwil']]),
  },
  // ——— mittel ———
  {
    id: 'b-berg', titel: 'Über den Berg', stufe: 'mittel', sparte: 'personen', fahrgaeste: 20, routen: [], lohn: 2200, vorgabe: 420,
    text: 'Zwischen Westdorf und Ostheim liegt ein Berg, Alpwil am Fuss. Tunnel sind teuer, Umwege lang: du entscheidest.',
    brett: () => karte(12, 7, { berg: block(4, 1, 7, 3), wald: [[0, 6], [11, 6]], dorf: [[0, 0], [11, 0]] }, [[1, 1, 1, 'Westdorf'], [6, 5, 1, 'Alpwil'], [10, 1, 1, 'Ostheim']], []),
  },
  {
    id: 'b-milch', titel: 'Milch aus den Alpen', stufe: 'mittel', sparte: 'gueter', routen: [{ von: 'Alp Sonnegg', nach: 'Molkerei Talgrund', gut: 'milch', anzahl: 4 }, { von: 'Alp Schattwil', nach: 'Molkerei Talgrund', gut: 'milch', anzahl: 4 }], lohn: 2600, vorgabe: 380,
    text: 'Zwei Alpen liefern Milch an die Molkerei im Tal. Dafür braucht es Milchwagen aus dem Depot.',
    brett: () => karte(12, 7, { berg: [[0, 0], [1, 0], [10, 0], [11, 0], [5, 2], [6, 2]], wald: [[0, 3], [11, 3]], dorf: [[5, 6], [6, 6]] }, [], [[2, 1, 1, 'Alp Sonnegg'], [9, 1, 1, 'Alp Schattwil'], [5, 5, 1, 'Molkerei Talgrund']]),
  },
  {
    id: 'b-hafen', titel: 'Container vom Hafen', stufe: 'mittel', sparte: 'gueter', routen: [{ von: 'Hafen Seeburg', nach: 'Lager Industrie', gut: 'container', anzahl: 10 }], lohn: 2800, vorgabe: 320,
    text: 'Am Hafen von Seeburg kommen Container an. Das Lager im Industriegebiet wartet. Containerwagen gibt es im Depot.',
    brett: () => karte(12, 7, { wasser: [...block(0, 5, 3, 6), [0, 4]], dorf: [[11, 0], [10, 0]] }, [], [[2, 3, 1, 'Hafen Seeburg'], [10, 2, 1, 'Lager Industrie']]),
  },
  {
    id: 'b-kleinstadt', titel: 'Kleinstadt', stufe: 'mittel', sparte: 'mix', fahrgaeste: 15, routen: [{ von: 'Kieswerk Au', nach: 'Baustelle Zentrum', gut: 'kies', anzahl: 6 }], lohn: 3000, vorgabe: 480,
    text: 'Drei Quartiere wollen verbunden sein, und mitten in der Stadt wird gebaut.',
    brett: () => karte(12, 7, { dorf: [[5, 3], [6, 3], [0, 0], [11, 6]], wasser: [[8, 0], [8, 1]] }, [[1, 1, 1, 'Nordquartier'], [10, 1, 1, 'Ostquartier'], [2, 5, 1, 'Südquartier']], [[10, 5, 1, 'Kieswerk Au'], [6, 2, 1, 'Baustelle Zentrum']]),
  },
  // ——— schwer ———
  {
    id: 'b-knoten', titel: 'Der grosse Knoten', stufe: 'schwer', sparte: 'personen', fahrgaeste: 30, routen: [], lohn: 4500, vorgabe: 700,
    text: 'Vier Orte rund um den See. Wer will, fährt im Taktfahrplan mit Knoten.',
    brett: () => karte(14, 9, { wasser: block(5, 3, 8, 5), wald: [[0, 8], [13, 0]], dorf: [[0, 0], [13, 8]] }, [[6, 1, 1, 'Nordwil'], [6, 7, 1, 'Südhalden'], [1, 4, 0, 'Westmatt'], [12, 4, 0, 'Ostbach']], []),
  },
  {
    id: 'b-oel', titel: 'Heizöl über den Pass', stufe: 'schwer', sparte: 'gueter', routen: [{ von: 'Tanklager Rheinau', nach: 'Heizwerk Bergdorf', gut: 'oel', anzahl: 12 }], lohn: 5000, vorgabe: 650,
    text: 'Der Winter kommt, Bergdorf braucht Heizöl. Zwischen Tanklager und Heizwerk liegen Berge und ein Fluss.',
    brett: () => karte(14, 9, { berg: [...block(4, 0, 6, 4), ...block(8, 4, 10, 8)], wald: [[0, 0], [13, 8]] }, [], [[1, 7, 1, 'Tanklager Rheinau'], [12, 1, 1, 'Heizwerk Bergdorf']], [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], [7, 8]]),
  },
  {
    id: 'b-tal', titel: 'Das ganze Tal', stufe: 'schwer', sparte: 'mix', fahrgaeste: 25,
    routen: [{ von: 'Forst Hochwald', nach: 'Sägerei Talwil', gut: 'holz', anzahl: 6 }, { von: 'Autowerk Grund', nach: 'Hafen Seewil', gut: 'autos', anzahl: 6 }], lohn: 7000, vorgabe: 900,
    text: 'Drei Orte, ein Forst, ein Autowerk und ein Hafen. Plane ein Netz, auf dem alles gleichzeitig fährt.',
    brett: () => karte(14, 9, { wald: [...block(10, 0, 13, 2)], wasser: block(0, 6, 2, 8), berg: [[6, 4], [7, 4], [6, 5]] }, [[1, 1, 1, 'Talwil'], [12, 6, 1, 'Bergau'], [6, 8, 1, 'Seewil']], [[11, 3, 1, 'Forst Hochwald'], [4, 1, 1, 'Sägerei Talwil'], [9, 7, 1, 'Autowerk Grund'], [3, 5, 1, 'Hafen Seewil']]),
  },
]

/** wie viel von jedem Gut ein Auftrag verlangt */
export function jeGut(a: Auftrag): Partial<Record<Gut, number>> {
  const r: Partial<Record<Gut, number>> = {}
  for (const x of a.routen) r[x.gut] = (r[x.gut] ?? 0) + x.anzahl
  return r
}
/** welche Wagen ein Auftrag braucht */
export function brauchtWagen(a: Auftrag): WagenTyp[] {
  const l: WagenTyp[] = []
  if (a.fahrgaeste) l.push('person')
  for (const g of Object.keys(jeGut(a)) as Gut[]) {
    const w = (Object.keys(WAGEN_ARTEN) as WagenTyp[]).find((t) => t !== 'gedeckt' && WAGEN_ARTEN[t].gut === g)
    if (w) l.push(w)
  }
  return l
}

/**
 * ein Auftrag als Aufgabe des Gleisbaus: geprüft wird, was während der Fahrt ans Ziel kam; die Sterne nach den Baukosten (drei bis zur Vorgabe, zwei
 * bis anderthalbmal, sonst einer)
 */
export function auftragAlsAufgabe(a: Auftrag): Aufgabe & { betrieb: Auftrag } {
  const ziel = jeGut(a)
  const start = baukosten(a.brett())
  const kosten = (b: Brett) => Math.max(0, baukosten(b) - start)
  return {
    id: a.id, titel: a.titel, betrieb: a,
    ziel: `${a.text} Ziel: ${[a.fahrgaeste && `${a.fahrgaeste} Fahrgäste`, ...a.routen.map((r) => `${r.anzahl} ${GUETER[r.gut].mehrzahl} von ${r.von} nach ${r.nach}`)].filter(Boolean).join(', ')}. Lohn CHF ${a.lohn.toLocaleString('de-CH')}, davon gehen die Baukosten ab.`,
    brett: a.brett,
    transport: { fahrgaeste: a.fahrgaeste },
    pruefen: (b: Brett, stand?: Transport) => {
      if (!b.some((z) => z.some((f) => f.zugStart))) return { ok: false, text: 'Setz unter «Züge» mit «Zug» einen Zug aufs Gleis und stell ihn aus dem Depot zusammen.' }
      const fehlt: string[] = []
      if (a.fahrgaeste && (stand?.fahrgaeste ?? 0) < a.fahrgaeste) fehlt.push(`${stand?.fahrgaeste ?? 0} von ${a.fahrgaeste} Fahrgästen`)
      for (const [g, n] of Object.entries(ziel) as Array<[Gut, number]>) if ((stand?.jeGut?.[g] ?? 0) < n) fehlt.push(`${stand?.jeGut?.[g] ?? 0} von ${n} ${GUETER[g].mehrzahl}`)
      if (fehlt.length) return { ok: false, text: `Lass fahren (▶). Bisher am Ziel: ${fehlt.join(', ')}.` }
      const k = kosten(b)
      return { ok: true, text: `Auftrag erfüllt. Lohn CHF ${a.lohn.toLocaleString('de-CH')}, Baukosten CHF ${k.toLocaleString('de-CH')}, Gewinn CHF ${Math.max(0, a.lohn - k).toLocaleString('de-CH')}.` }
    },
    schritte: (b: Brett, stand?: Transport) => [
      ...(a.fahrgaeste ? [{ art: 'bahnhof' as const, text: `Fahrgäste ${Math.min(stand?.fahrgaeste ?? 0, a.fahrgaeste)} / ${a.fahrgaeste}`, ok: (stand?.fahrgaeste ?? 0) >= a.fahrgaeste }] : []),
      ...(Object.entries(ziel) as Array<[Gut, number]>).map(([g, n]) => ({ art: 'bahnhof' as const, text: `${GUETER[g].name} ${Math.min(stand?.jeGut?.[g] ?? 0, n)} / ${n}`, ok: (stand?.jeGut?.[g] ?? 0) >= n })),
      { art: 'bahnhof' as const, text: `Baukosten CHF ${kosten(b).toLocaleString('de-CH')} (★★★ bis ${a.vorgabe})`, ok: kosten(b) <= a.vorgabe },
    ],
    sterne: (b: Brett) => { const k = kosten(b); return k <= a.vorgabe ? 3 : k <= a.vorgabe * 1.5 ? 2 : 1 },
    kosten,
  }
}

/** ob auf dem Brett Bahnhöfe liegen (für Fahrgäste) */
export const hatBahnhof = (b: Brett) => b.some((z) => z.some((f) => istBahnhof(f.gleis)))
export { LOKS, WAGEN_ARTEN }
