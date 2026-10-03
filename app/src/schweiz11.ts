/**
 * «Schweiz 1:1» (Michael, 2026-10-03): ein Objekt wird genannt, man setzt einen Pin
 * dorthin, wo es liegt. Hier stehen Daten, Auswahl und Wertung, ohne Oberfläche,
 * damit dieselbe Logik später auch ein Spiel auf mehreren Geräten tragen kann.
 * Der Pool entsteht in pipeline/build_schweiz11.py (data/schweiz11.json).
 */
import { kartengrundLaden } from './daten'
import { LAENGE_ZU_BREITE } from './komponenten/Netzkarte'
import type { KodierterZug } from './typen'

const BASIS = import.meta.env.BASE_URL

export type ObjektTyp = 'b' | 't' | 'r'
export type Stufe = 1 | 2 | 3

/** Ein spielbares Objekt aus dem Pool */
export interface SpielObjekt {
  t: ObjektTyp
  id: string
  name: string
  /** Ziel: Bahnhof laut Fakten, Tunnel und Brücke in der Mitte */
  la: number
  lo: number
  kt: string
  s: Stufe
  /** Tunnel der SBB: Länge laut SBB, Jahr der ersten Inbetriebnahme */
  m?: number
  jahr?: number | null
  linie?: number
  /** Brücken und Bauwerke aus swissTLM3D: Länge der Zeichnung, gerundet */
  zm?: number
  be?: number | null
  /** swissTLM3D: tunnel, galerie, bruecke, gedeckte_bruecke */
  art?: string
  /** Bauwerk auf einer Linie der SBB: Linie, km von, km bis */
  g?: [number, number, number]
  /** Bauwerk anderer Bahnen: Zeichnung aus swissTLM3D */
  z?: KodierterZug
}

export interface KantonFlaeche {
  kt: string
  flaeche_km2: number
  ringe: KodierterZug[]
}

interface PoolDaten { objekte: SpielObjekt[]; kantone: KantonFlaeche[] }

/** Ein Ring in Breite/Länge und in Kartenmass (x aus der Länge, y = −Breite) */
export interface Ring { ll: Array<[number, number]>; xy: Array<[number, number]> }

export interface Pool {
  objekte: SpielObjekt[]
  kantone: Map<string, { flaeche_km2: number; ringe: Ring[] }>
  /** Fläche der Schweiz: die Summe der Kantone */
  flaecheCH: number
}

function ringLesen(z: KodierterZug): Ring {
  let [la, lo] = z.start
  const ll: Array<[number, number]> = [[la / 1e5, lo / 1e5]]
  for (let i = 0; i < z.d.length; i += 2) {
    la += z.d[i]; lo += z.d[i + 1]
    ll.push([la / 1e5, lo / 1e5])
  }
  return { ll, xy: ll.map(([a, o]) => [o * LAENGE_ZU_BREITE, -a]) }
}

let poolLaden: Promise<Pool> | null = null
export function schweiz11Laden(): Promise<Pool> {
  poolLaden ??= fetch(`${BASIS}data/schweiz11.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`data/schweiz11.json nicht gefunden (${r.status})`)
      return r.json() as Promise<PoolDaten>
    })
    .then((d) => {
      const kantone = new Map(d.kantone.map((k) => [k.kt, { flaeche_km2: k.flaeche_km2, ringe: k.ringe.map(ringLesen) }]))
      // Datenprüfung: nur Objekte mit Name, Typ, gültiger Lage, Kanton und Stufe
      const objekte = d.objekte.filter((o) => o.name?.trim() && ['b', 't', 'r'].includes(o.t)
        && Number.isFinite(o.la) && Number.isFinite(o.lo) && kantone.has(o.kt) && [1, 2, 3].includes(o.s))
      return { objekte, kantone, flaecheCH: [...kantone.values()].reduce((a, k) => a + k.flaeche_km2, 0) }
    })
    .catch((e) => { poolLaden = null; throw e })
  return poolLaden
}

/** Ortsnamen der Landeskarte (kartengrund.json) für die Hilfe «Ortsnamen» */
export async function orteLaden() {
  const k = await kartengrundLaden()
  return k.orte
}

/* ---------- Einstellungen ---------- */

export type Kategorie = 'b' | 't' | 'r' | 'gemischt'
export type Schwierigkeit = Stufe | 'gemischt'
export interface Einstellungen {
  fragen: 5 | 10
  kategorie: Kategorie
  schwierigkeit: Schwierigkeit
  /** 'CH' oder ein Kantonskürzel */
  gebiet: string
  /** Sekunden, 0 = ohne Zeitlimit */
  zeit: 0 | 15 | 30 | 60
}

export const STANDARD: Einstellungen = { fragen: 5, kategorie: 'gemischt', schwierigkeit: 'gemischt', gebiet: 'CH', zeit: 0 }

/** Bei «Gemischt» ungefähr so oft: 70 % Bahnhöfe, 20 % Tunnel, 10 % Brücken */
const GEWICHT: Record<ObjektTyp, number> = { b: 0.7, t: 0.2, r: 0.1 }

/** Alle Objekte, die zu den Einstellungen passen (ohne die Mischung) */
export function passende(pool: Pool, e: Einstellungen) {
  return pool.objekte.filter((o) => (e.kategorie === 'gemischt' || o.t === e.kategorie)
    && (e.schwierigkeit === 'gemischt' || o.s === e.schwierigkeit)
    && (e.gebiet === 'CH' || o.kt === e.gebiet))
}

/**
 * Zieht die Aufgaben einer Partie: ohne Wiederholung innerhalb der Partie, bei
 * «Gemischt» je Frage zuerst die Art nach GEWICHT (Arten ohne Objekte fallen weg),
 * dann ein Objekt dieser Art. Über Partien hinweg darf alles wiederkommen.
 * zufall liefert Zahlen in [0, 1), austauschbar für eine gemeinsame Ziehung.
 */
export function aufgabenZiehen(pool: Pool, e: Einstellungen, zufall: () => number = Math.random): SpielObjekt[] {
  const rest = passende(pool, e)
  const je: Record<ObjektTyp, SpielObjekt[]> = { b: [], t: [], r: [] }
  for (const o of rest) je[o.t].push(o)
  const raus: SpielObjekt[] = []
  while (raus.length < e.fragen) {
    const arten = (Object.keys(je) as ObjektTyp[]).filter((t) => je[t].length > 0)
    if (!arten.length) break
    const summe = arten.reduce((a, t) => a + GEWICHT[t], 0)
    let r = zufall() * summe
    let art = arten[arten.length - 1]
    for (const t of arten) { if ((r -= GEWICHT[t]) < 0) { art = t; break } }
    const liste = je[art]
    raus.push(liste.splice(Math.floor(zufall() * liste.length), 1)[0])
  }
  return raus
}

/* ---------- Gebiet ---------- */

function imRing(la: number, lo: number, ll: Array<[number, number]>) {
  let drin = false
  for (let i = 0, j = ll.length - 1; i < ll.length; j = i++) {
    const [ai, oi] = ll[i], [aj, oj] = ll[j]
    if ((ai > la) !== (aj > la) && lo < (oj - oi) * (la - ai) / (aj - ai) + oi) drin = !drin
  }
  return drin
}

/** Liegt der Punkt im Spielgebiet? Schweiz: in einem Kanton; sonst im gewählten Kanton */
export function imGebiet(pool: Pool, gebiet: string, la: number, lo: number) {
  const kantone = gebiet === 'CH' ? [...pool.kantone.values()] : [pool.kantone.get(gebiet)].filter(Boolean)
  // gerade-ungerade je Kanton: Enklaven und Löcher zählen richtig
  return kantone.some((k) => k!.ringe.reduce((d, r) => (imRing(la, lo, r.ll) ? !d : d), false))
}

export function gebietRinge(pool: Pool, gebiet: string): Ring[] {
  return gebiet === 'CH' ? [...pool.kantone.values()].flatMap((k) => k.ringe) : pool.kantone.get(gebiet)?.ringe ?? []
}

/* ---------- Wertung ---------- */

/** Abstand zweier Punkte in Metern (Haversine, Erdradius 6371 km) */
export function abstandM(a: { la: number; lo: number }, b: { la: number; lo: number }) {
  const r = Math.PI / 180
  const dLa = (b.la - a.la) * r, dLo = (b.lo - a.lo) * r
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.la * r) * Math.cos(b.la * r) * Math.sin(dLo / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Die Hilfen auf der Karte; jede kostet gleich viel */
export type Hilfe = 'kantone' | 'seen' | 'fluesse' | 'orte' | 'bahnnetz'
export const HILFEN: Array<{ id: Hilfe; name: string }> = [
  { id: 'kantone', name: 'Kantonsgrenzen' }, { id: 'seen', name: 'Seen' }, { id: 'fluesse', name: 'Flüsse' },
  { id: 'orte', name: 'Ortsnamen' }, { id: 'bahnnetz', name: 'Bahnnetz' },
]
/** Jede eingeschaltete Hilfe nimmt 15 % der möglichen Punkte: bei allen fünf bleiben 25 % */
export const HILFE_ABZUG = 0.15

/** Grundwert einer Frage und Faktor je Stufe: schwere Objekte sind mehr wert */
export const GRUNDWERT = 100
export const STUFE_FAKTOR: Record<Stufe, number> = { 1: 1, 2: 1.5, 3: 2 }
export const STUFE_NAME: Record<Stufe, string> = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' }

/**
 * Ab dieser Abweichung gibt es keine Distanzpunkte mehr. Sie wächst mit der Grösse
 * des Spielgebiets: die halbe Kantenlänge eines Quadrats derselben Fläche, mindestens
 * 5 km. Schweiz (rund 41'300 km²): etwa 102 km; Zürich (1'729 km²): etwa 21 km;
 * Basel-Stadt (37 km²): 5 km.
 */
export function nullGrenzeM(pool: Pool, gebiet: string) {
  const a = gebiet === 'CH' ? pool.flaecheCH : pool.kantone.get(gebiet)?.flaeche_km2 ?? pool.flaecheCH
  return Math.max(5_000, 0.5 * Math.sqrt(a) * 1000)
}

/**
 * Die Punkte einer Frage:
 *
 *   Punkte = Grundwert × Stufenfaktor × Nähe × (1 − 0,15 × Hilfen)
 *
 *   Nähe = (1 − d / D0)², für d < D0, sonst 0
 *
 * d ist die Abweichung, D0 die Nullgrenze des Spielgebiets (nullGrenzeM). Die Nähe ist
 * stufenlos: ein Volltreffer gibt 1, die Hälfte der Nullgrenze noch 0,25, und sie sinkt
 * nahe am Ziel langsam, weiter weg schneller. Keine Volltrefferzone, kein Zeitbonus:
 * Wann bestätigt wird, zählt nicht. Ohne bestätigten Tipp (Zeit abgelaufen) gibt es 0.
 */
export function punkte(dM: number, d0M: number, stufe: Stufe, hilfen: number) {
  const naehe = dM < d0M ? (1 - dM / d0M) ** 2 : 0
  return Math.round(GRUNDWERT * STUFE_FAKTOR[stufe] * naehe * Math.max(0, 1 - HILFE_ABZUG * hilfen))
}

/** Rückmeldung aus der relativen Abweichung; ändert die Punkte nicht */
export function urteil(dM: number, d0M: number) {
  const r = dM / d0M
  return r < 0.02 ? 'Hervorragend!' : r < 0.06 ? 'Sehr gut!' : r < 0.15 ? 'Gut' : r < 0.35 ? 'Ordentlich'
    : r < 1 ? 'Weit daneben' : 'Zu weit weg'
}

export function distanzText(m: number) {
  return m < 1000 ? `${Math.round(m).toLocaleString('de-CH')} m`
    : `${(m / 1000).toLocaleString('de-CH', { maximumFractionDigits: m < 10_000 ? 2 : 1 })} km`
}

export const TYP_NAME: Record<ObjektTyp, string> = { b: 'Bahnhof', t: 'Tunnel', r: 'Brücke' }
export const KATEGORIE_NAME: Record<Kategorie, string> = { b: 'Bahnhöfe', t: 'Tunnel', r: 'Brücken', gemischt: 'Gemischt' }

/** Die Art, wie sie auf der Karte und in der Auflösung heisst */
export function typText(o: SpielObjekt) {
  return o.art === 'galerie' ? 'Galerie' : o.art === 'gedeckte_bruecke' ? 'Gedeckte Brücke' : TYP_NAME[o.t]
}

/* ---------- Namen auf der Karte ausblenden ---------- */

/** Wörter, die keinen Ort verraten */
const LEER = new Set(['bahnhof', 'tunnel', 'brucke', 'brucken', 'viadukt', 'galerie', 'pont', 'ponte', 'galleria',
  'nord', 'sud', 'ost', 'west', 'est', 'ouest', 'dessus', 'dessous', 'ober', 'unter', 'gare', 'stazione', 'dorf',
  'stadt', 'bruecke', 'strasse', 'route', 'chemin', 'tunnels', 'kehrtunnel', 'basistunnel', 'scheiteltunnel'])

function woerter(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !LEER.has(w))
}

/**
 * Verrät eine Beschriftung die Lösung? Ja, wenn sie ein Wort des gesuchten Namens
 * enthält (ab 4 Buchstaben, ohne Wörter wie «Tunnel» oder «Nord»), auch in einer
 * Zusammensetzung: «Zürich» bei «Zürich HB», «Göschenen» bei «Göschenen», «Paudex»
 * bei «Tunnel de Paudex». So bleiben auch Nachbarn wie «Zürich Oerlikon» verborgen.
 */
export function verraet(beschriftung: string, ziel: string) {
  const z = woerter(ziel)
  if (!z.length) return false
  const b = woerter(beschriftung)
  return b.some((w) => z.some((x) => x === w || (x.length >= 5 && w.includes(x)) || (w.length >= 5 && x.includes(w))))
}

/* ---------- Bestwerte, nur auf diesem Gerät ---------- */

const SCHLUESSEL = 'taktland.schweiz11.v1'
interface Speicher {
  bestwerte: Record<string, { punkte: number; tag: string }>
  partien: number
  /** der kurze Hinweis zur Bedienung ist gesehen */
  hinweis: boolean
}

export function speicherLesen(): Speicher {
  try {
    const x = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}')
    return { bestwerte: x.bestwerte && typeof x.bestwerte === 'object' ? x.bestwerte : {},
             partien: Number(x.partien) || 0, hinweis: x.hinweis === true }
  } catch {
    return { bestwerte: {}, partien: 0, hinweis: false }
  }
}

function speichern(s: Speicher) {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(s)) } catch { /* ohne Speicher nur für jetzt */ }
}

export function hinweisGesehen() {
  speichern({ ...speicherLesen(), hinweis: true })
}

/** Bestwerte gelten je Einstellung: dieselben Fragen, dieselbe Art, dasselbe Gebiet */
export const einstellungSchluessel = (e: Einstellungen) =>
  `${e.fragen}|${e.kategorie}|${e.schwierigkeit}|${e.gebiet}|${e.zeit}`

/** Hält eine Einzelpartie fest; gibt den bisherigen Bestwert zurück (null, wenn es keinen gab) */
export function partieFesthalten(e: Einstellungen, total: number) {
  const s = speicherLesen()
  const k = einstellungSchluessel(e)
  const alt = s.bestwerte[k]?.punkte ?? null
  if (alt === null || total > alt) s.bestwerte[k] = { punkte: total, tag: new Date().toISOString().slice(0, 10) }
  s.partien += 1
  speichern(s)
  return alt
}

/* ---------- Rangliste ---------- */

/** Gleiche Punkte, gleicher Rang, ohne Tiebreaker: 1, 1, 3 */
export function raenge<T extends { punkte: number }>(liste: T[]): Array<T & { rang: number }> {
  const sortiert = [...liste].sort((a, b) => b.punkte - a.punkte)
  return sortiert.map((x) => ({ ...x, rang: sortiert.findIndex((y) => y.punkte === x.punkte) + 1 }))
}
