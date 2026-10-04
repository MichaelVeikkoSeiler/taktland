/**
 * «Bahnhofsuche» (Michael, 2026-10-04, zuerst «Bahnhof erraten»): Spiellogik ohne Darstellung.
 *
 * Taktland wählt einen Bahnhof, sechs Hinweiskarten liegen verdeckt, die Kategorie
 * ist sichtbar. Wer am Zug ist, deckt eine Karte auf oder rät. Ein falscher Tipp
 * deckt die nächste verdeckte Karte auf. Jede aufgedeckte Karte kostet gleich viel.
 *
 * Aufbau für später (Online auf mehreren Geräten): Der ganze Spielstand ist ein
 * schlichtes, serialisierbares Objekt (Partie). Er ändert sich nur über schritt()
 * mit einer Aktion; der Zufall (Bahnhöfe, Auswahlantworten) ist beim Anlegen der
 * Partie schon gezogen. Ein Transport muss also nur die Partie einmal und danach die
 * Aktionen verteilen; jedes Gerät rechnet mit derselben Funktion denselben Stand.
 * Die Darstellung (komponenten/Erraten.tsx) liest nur und schickt Aktionen.
 *
 * Daten: data/erraten.json, gebaut mit pipeline/build_erraten.py aus data/facts;
 * die Felder und die Stufe sind dort beschrieben.
 */

import { holen } from './daten'

export type HinweisId = 'kanton' | 'bezirk' | 'dwv' | 'hoehe' | 'bahn' | 'zuege_von'
export type Stufe = 1 | 2 | 3

export interface ErratenBahnhof {
  id: number
  name: string
  /** Kantonskürzel und Kantonsname laut Quelle */
  kt: string
  kanton: string
  bezirk?: string
  dwv?: number
  /** «weniger als» diesem Wert, wo die SBB nur einen Platzhalter meldet */
  dwv_unter?: number
  hoehe: number
  bahn: string
  zuege_von: string
  s: Stufe
}

export const HINWEISE: Array<{ id: HinweisId; titel: string }> = [
  { id: 'kanton', titel: 'Kanton' },
  { id: 'bezirk', titel: 'Bezirk' },
  { id: 'dwv', titel: 'Ein- und Aussteigende' },
  { id: 'hoehe', titel: 'Höhe' },
  { id: 'bahn', titel: 'Bahn' },
  { id: 'zuege_von', titel: 'Züge von' },
]

/** Punkte: ohne aufgedeckte Karte 70, jede kostet 10, bei sechs bleiben 10 */
export const PUNKTE_JE_HINWEIS = 10
export const PUNKTE_HOECHST = PUNKTE_JE_HINWEIS * (HINWEISE.length + 1)
export const moeglich = (kosten: number) => PUNKTE_HOECHST - PUNKTE_JE_HINWEIS * kosten

export const STUFE_NAME: Record<Stufe, string> = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' }

const zahl = (n: number) => n.toLocaleString('de-CH')

/** Der Inhalt einer Karte, wie er in den Fakten steht */
export function hinweisText(b: ErratenBahnhof, id: HinweisId): string {
  switch (id) {
    case 'kanton': return `${b.kanton} (${b.kt})`
    case 'bezirk': return b.bezirk ?? 'In den Daten nicht angegeben'
    case 'dwv': return b.dwv !== undefined ? `${zahl(b.dwv)} pro Werktag` : `weniger als ${zahl(b.dwv_unter ?? 50)} pro Werktag`
    case 'hoehe': return `${zahl(b.hoehe)} m ü. M.`
    case 'bahn': return b.bahn
    case 'zuege_von': return b.zuege_von
  }
}

/** Karten, die von Anfang an offen liegen und nichts kosten: der Kanton, wenn er durch
 *  die Region schon bekannt ist, und der Bezirk, wo die Daten keinen nennen */
export function vorgegeben(b: ErratenBahnhof, gebiet: string): HinweisId[] {
  return HINWEISE.map((h) => h.id).filter((id) => (id === 'kanton' && gebiet !== 'CH') || (id === 'bezirk' && !b.bezirk))
}

/* ---------- Einstellungen und Pool ---------- */

export type Modus = 'allein' | 'miteinander' | 'gegeneinander'
export type Schwierigkeit = Stufe | 'gemischt'
export interface Einstellungen {
  modus: Modus
  antwort: 'frei' | 'auswahl'
  fragen: 5 | 10
  schwierigkeit: Schwierigkeit
  /** 'CH' oder ein Kantonskürzel */
  gebiet: string
  /** Sekunden je Bahnhof (beim Gegeneinander je Zug), 0 = ohne */
  zeit: 0 | 30 | 60 | 90
}
export const STANDARD: Einstellungen = { modus: 'allein', antwort: 'frei', fragen: 5, schwierigkeit: 'gemischt', gebiet: 'CH', zeit: 0 }

export interface Pool { bahnhoefe: ErratenBahnhof[]; nach: Map<number, ErratenBahnhof>; rang: Map<number, number> }

let pool: Promise<Pool> | null = null
export function erratenLaden(): Promise<Pool> {
  pool ??= holen<{ bahnhoefe: ErratenBahnhof[] }>('data/erraten.json').then((d) => {
    // nur gültige Einträge, falls die Datei einmal unvollständig wäre
    const bahnhoefe = d.bahnhoefe.filter((b) => Number.isInteger(b.id) && b.name?.trim() && b.kt && b.kanton
      && Number.isFinite(b.hoehe) && b.bahn && b.zuege_von && [1, 2, 3].includes(b.s)
      && (b.dwv !== undefined || b.dwv_unter !== undefined))
    const sortiert = [...bahnhoefe].sort((a, b) => (b.dwv ?? 0) - (a.dwv ?? 0) || a.name.localeCompare(b.name, 'de-CH'))
    return { bahnhoefe, nach: new Map(bahnhoefe.map((b) => [b.id, b])), rang: new Map(sortiert.map((b, i) => [b.id, i])) }
  })
  pool.catch(() => { pool = null })
  return pool
}

export function passende(p: Pool, e: Pick<Einstellungen, 'gebiet' | 'schwierigkeit'>) {
  return p.bahnhoefe.filter((b) => (e.gebiet === 'CH' || b.kt === e.gebiet)
    && (e.schwierigkeit === 'gemischt' || b.s === e.schwierigkeit))
}

function mischen<T>(liste: T[], zufall: () => number): T[] {
  const a = [...liste]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Drei falsche Antworten, die glaubwürdig sind: aus demselben Kanton und mit ähnlich
 * vielen Ein- und Aussteigenden (nahe im Rang), sonst aus der ganzen Schweiz nahe im
 * Rang. Aus den acht nächsten werden drei zufällig gezogen, damit es nicht immer
 * dieselben sind. Keine zwei mit gleichem Namen.
 */
export function ablenker(p: Pool, ziel: ErratenBahnhof, zufall: () => number = Math.random): number[] {
  const r = p.rang.get(ziel.id) ?? 0
  const nah = (b: ErratenBahnhof) => Math.abs((p.rang.get(b.id) ?? 0) - r)
  const andere = p.bahnhoefe.filter((b) => b.id !== ziel.id && b.name !== ziel.name)
  const gleicherKanton = andere.filter((b) => b.kt === ziel.kt).sort((a, b) => nah(a) - nah(b))
  const reihe = gleicherKanton.length >= 3 ? gleicherKanton : [...gleicherKanton, ...andere.filter((b) => b.kt !== ziel.kt).sort((a, b) => nah(a) - nah(b))]
  const auswahl: ErratenBahnhof[] = []
  for (const b of mischen(reihe.slice(0, 8), zufall)) {
    if (auswahl.length < 3 && !auswahl.some((x) => x.name === b.name)) auswahl.push(b)
  }
  return auswahl.map((b) => b.id)
}

/* ---------- Partie ---------- */

/** Was ein Spieler (beim Gegeneinander) oder das Team in einer Runde getan hat */
export interface Spur {
  /** aufgedeckte Karten in ihrer Reihenfolge, ohne die vorgegebenen */
  offen: HinweisId[]
  /** falsch geratene Bahnhöfe */
  falsch: number[]
  geloest: boolean
  /** beim Gegeneinander: falsch geraten, als alles offen war, spielt diese Runde nicht mehr mit */
  raus: boolean
}

export interface Runde {
  ziel: number
  /** bei Auswahl: vier Bahnhöfe in fester Reihenfolge */
  optionen: number[] | null
  spuren: Spur[]
  /** wer gelöst hat (beim Allein und Miteinander 0), null: niemand */
  sieger: number | null
  zeitAus: boolean
  fertig: boolean
  punkte: number
}

export type Phase = 'uebergabe' | 'frage' | 'zugEnde' | 'aufloesung' | 'ende'

export interface Partie {
  version: 1
  e: Einstellungen
  spieler: string[]
  runden: Runde[]
  frage: number
  amZug: number
  phase: Phase
  /** Zeitpunkt (ms), zu dem die Zeit abläuft; null ohne Zeitlimit oder ausserhalb der Frage */
  frist: number | null
  /** was der letzte Zug gebracht hat, für die Meldung */
  letzter: { art: 'aufgedeckt' | 'falsch' | 'zeit'; hinweis: HinweisId | null; bahnhof: number | null } | null
}

const neueSpur = (): Spur => ({ offen: [], falsch: [], geloest: false, raus: false })

/** Legt eine Partie an; der ganze Zufall steckt hier. Null, wenn es zu wenige Bahnhöfe gibt. */
export function partieAnlegen(p: Pool, e: Einstellungen, spieler: string[], zufall: () => number = Math.random, jetzt = Date.now()): Partie | null {
  const ziele = mischen(passende(p, e), zufall).slice(0, e.fragen)
  if (ziele.length < e.fragen) return null
  const n = e.modus === 'gegeneinander' ? spieler.length : 1
  const runden: Runde[] = ziele.map((z) => ({
    ziel: z.id,
    optionen: e.antwort === 'auswahl' ? mischen([z.id, ...ablenker(p, z, zufall)], zufall) : null,
    spuren: Array.from({ length: n }, neueSpur), sieger: null, zeitAus: false, fertig: false, punkte: 0,
  }))
  const partie: Partie = { version: 1, e, spieler, runden, frage: 0, amZug: 0, phase: 'frage', frist: null, letzter: null }
  return frageBeginnen(partie, jetzt)
}

const gegeneinander = (x: Partie) => x.e.modus === 'gegeneinander'
const spurVon = (x: Partie, r: Runde) => r.spuren[gegeneinander(x) ? x.amZug : 0]

function frageBeginnen(x: Partie, jetzt: number): Partie {
  // beim Gegeneinander erst die Übergabe, die Zeit läuft ab «Bereit»
  if (gegeneinander(x)) return { ...x, amZug: x.frage % x.spieler.length, phase: 'uebergabe', frist: null, letzter: null }
  return { ...x, amZug: x.frage % x.spieler.length, phase: 'frage', frist: x.e.zeit ? jetzt + x.e.zeit * 1000 : null, letzter: null }
}

/** Verdeckte Karten einer Spur in der Reihenfolge der Anzeige */
export function verdeckt(x: Partie, r: Runde, s: Spur, p: Pool): HinweisId[] {
  const z = p.nach.get(r.ziel)!
  const vor = vorgegeben(z, x.e.gebiet)
  return HINWEISE.map((h) => h.id).filter((id) => !vor.includes(id) && !s.offen.includes(id))
}

export type Aktion =
  | { typ: 'bereit' }
  | { typ: 'aufdecken'; hinweis: HinweisId }
  | { typ: 'raten'; bahnhof: number }
  | { typ: 'zeitAus' }
  | { typ: 'weitergeben' }
  | { typ: 'weiter' }

const kopie = (x: Partie): Partie => ({ ...x, runden: x.runden.map((r) => ({ ...r, spuren: r.spuren.map((s) => ({ ...s, offen: [...s.offen], falsch: [...s.falsch] })) })) })

/** Der nächste Spieler, der in dieser Runde noch mitspielt; null, wenn keiner mehr */
function naechster(x: Partie, r: Runde): number | null {
  const n = x.spieler.length
  for (let i = 1; i <= n; i++) {
    const k = (x.amZug + i) % n
    if (!gegeneinander(x) || !r.spuren[k].raus) return k
  }
  return null
}

function rundeBeenden(x: Partie, r: Runde, sieger: number | null, zeitAus = false): Partie {
  r.fertig = true
  r.sieger = sieger
  r.zeitAus = zeitAus
  r.punkte = sieger === null ? 0 : moeglich(r.spuren[gegeneinander(x) ? sieger : 0].offen.length)
  return { ...x, phase: 'aufloesung', frist: null }
}

/** Nach einem Zug: allein bleibt es beim selben Spieler, miteinander geht es reihum weiter,
 *  gegeneinander zeigt das Gerät erst dem Spieler, was sein Zug gebracht hat */
function zugFertig(x: Partie, r: Runde): Partie {
  if (gegeneinander(x)) return { ...x, phase: 'zugEnde', frist: null }
  // die Zeit gilt beim Allein und Miteinander für den ganzen Bahnhof und läuft weiter
  return { ...x, amZug: naechster(x, r)! }
}

export function schritt(alt: Partie, a: Aktion, p: Pool, jetzt = Date.now()): Partie {
  const x = kopie(alt)
  const r = x.runden[x.frage]
  if (!r) return alt
  switch (a.typ) {
    case 'bereit': {
      if (x.phase !== 'uebergabe') return alt
      return { ...x, phase: 'frage', frist: x.e.zeit ? jetzt + x.e.zeit * 1000 : null, letzter: null }
    }
    case 'aufdecken': {
      if (x.phase !== 'frage' || r.fertig) return alt
      const s = spurVon(x, r)
      if (!verdeckt(x, r, s, p).includes(a.hinweis)) return alt
      s.offen.push(a.hinweis)
      x.letzter = { art: 'aufgedeckt', hinweis: a.hinweis, bahnhof: null }
      return zugFertig(x, r)
    }
    case 'raten': {
      if (x.phase !== 'frage' || r.fertig) return alt
      const s = spurVon(x, r)
      if (s.falsch.includes(a.bahnhof) || !p.nach.has(a.bahnhof)) return alt
      if (a.bahnhof === r.ziel) {
        s.geloest = true
        return rundeBeenden(x, r, gegeneinander(x) ? x.amZug : 0)
      }
      s.falsch.push(a.bahnhof)
      // ein falscher Tipp deckt die nächste verdeckte Karte auf; ist keine mehr verdeckt, ist die Runde
      // für diese Spur vorbei
      const naechsteKarte = verdeckt(x, r, s, p)[0] ?? null
      if (naechsteKarte) {
        s.offen.push(naechsteKarte)
      } else if (gegeneinander(x)) {
        s.raus = true
        if (r.spuren.every((t) => t.raus)) return rundeBeenden(x, r, null)
      } else {
        return rundeBeenden(x, r, null)
      }
      x.letzter = { art: 'falsch', hinweis: naechsteKarte, bahnhof: a.bahnhof }
      return zugFertig(x, r)
    }
    case 'zeitAus': {
      if (x.phase !== 'frage' || r.fertig || x.frist === null) return alt
      // allein und miteinander endet der Bahnhof, gegeneinander nur der Zug
      if (!gegeneinander(x)) return rundeBeenden(x, r, null, true)
      x.letzter = { art: 'zeit', hinweis: null, bahnhof: null }
      return { ...x, phase: 'zugEnde', frist: null }
    }
    case 'weitergeben': {
      if (x.phase !== 'zugEnde') return alt
      const k = naechster(x, r)
      if (k === null) return rundeBeenden(x, r, null)
      return { ...x, amZug: k, phase: 'uebergabe', letzter: null }
    }
    case 'weiter': {
      if (x.phase !== 'aufloesung') return alt
      if (x.frage + 1 >= x.runden.length) return { ...x, phase: 'ende', frist: null }
      return frageBeginnen({ ...x, frage: x.frage + 1 }, jetzt)
    }
  }
}

/** Gesamtstand: beim Allein und Miteinander eine Zahl, beim Gegeneinander je Spieler Punkte und Siege */
export function stand(x: Partie): Array<{ name: string; punkte: number; siege: number }> {
  if (!gegeneinander(x)) {
    const name = x.e.modus === 'miteinander' ? 'Team' : x.spieler[0]
    return [{ name, punkte: x.runden.reduce((a, r) => a + r.punkte, 0), siege: x.runden.filter((r) => r.sieger !== null).length }]
  }
  return x.spieler.map((name, i) => ({
    name,
    punkte: x.runden.reduce((a, r) => a + (r.sieger === i ? r.punkte : 0), 0),
    siege: x.runden.filter((r) => r.sieger === i).length,
  }))
}

/* ---------- Suche für die freie Eingabe ---------- */

/** Für den Vergleich: klein, ohne Akzente, Satzzeichen als Leerschlag («St-Imier» = «st imier») */
export const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim()

/** Bahnhöfe, deren Name alle eingegebenen Wortanfänge enthält; Treffer am Anfang zuerst */
export function suchen(p: Pool, text: string, ohne: number[], hoechstens = 8): ErratenBahnhof[] {
  const q = normal(text)
  if (!q) return []
  const teile = q.split(' ')
  const treffer = p.bahnhoefe.filter((b) => {
    if (ohne.includes(b.id)) return false
    const w = normal(b.name).split(' ')
    return teile.every((t) => w.some((x) => x.startsWith(t)))
  })
  return treffer.sort((a, b) => Number(!normal(b.name).startsWith(q)) - Number(!normal(a.name).startsWith(q)) || a.name.length - b.name.length
    || a.name.localeCompare(b.name, 'de-CH')).slice(0, hoechstens)
}

/* ---------- Gespeichert auf diesem Gerät ---------- */

const PARTIE = 'taktland.erraten.partie.v1'
const SPEICHER = 'taktland.erraten.v1'

/** Die laufende Partie übersteht ein Neuladen und den Blick auf eine Bahnhofseite */
export function partieMerken(x: Partie | null) {
  try {
    if (x) sessionStorage.setItem(PARTIE, JSON.stringify(x))
    else sessionStorage.removeItem(PARTIE)
  } catch { /* ohne Speicher nur für jetzt */ }
}

export function partieLesen(p: Pool): Partie | null {
  try {
    const x = JSON.parse(sessionStorage.getItem(PARTIE) ?? 'null') as Partie | null
    if (!x || x.version !== 1 || !Array.isArray(x.runden) || !x.runden.every((r) => p.nach.has(r.ziel))) return null
    return x
  } catch {
    return null
  }
}

export const einstellungSchluessel = (e: Einstellungen) => `${e.antwort}|${e.fragen}|${e.schwierigkeit}|${e.gebiet}|${e.zeit}`

/** Hält eine Einzelpartie fest; gibt den bisherigen Bestwert zurück (null, wenn es keinen gab) */
export function bestwertFesthalten(e: Einstellungen, total: number): number | null {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as { bestwerte?: Record<string, { punkte: number; tag: string }>; partien?: number }
    const b = s.bestwerte ?? {}
    const k = einstellungSchluessel(e)
    const alt = b[k]?.punkte ?? null
    if (alt === null || total > alt) b[k] = { punkte: total, tag: new Date().toISOString().slice(0, 10) }
    localStorage.setItem(SPEICHER, JSON.stringify({ bestwerte: b, partien: (s.partien ?? 0) + 1 }))
    return alt
  } catch {
    return null
  }
}

export function bestwert(e: Einstellungen): number | null {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as { bestwerte?: Record<string, { punkte: number }> }
    return s.bestwerte?.[einstellungSchluessel(e)]?.punkte ?? null
  } catch {
    return null
  }
}
