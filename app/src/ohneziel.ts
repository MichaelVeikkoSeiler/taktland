/**
 * «Ohne Ziel» (Michael, 2026-09-26): Aus einigen Standorten erkennt Taktland
 * den Abschnitt und die Richtung, dann folgt der Weg derselben Linie bis zur
 * nächsten Verzweigung, an der die Linie nicht eindeutig weitergeht. Liegen
 * mehrere Linien nebeneinander, fragt Taktland nach, statt zu raten.
 * Alles läuft auf dem Gerät; der Standort wird weder gespeichert noch gesendet.
 */
import { fahrwegBauen, type Fahrweg, geometrieLesen, projizieren } from './fahrt'
import type { StreckenAbschnitt, StreckenNetz } from './typen'

type Linien = ReturnType<typeof geometrieLesen>

export interface Fix { lat: number; lon: number; genau: number; t: number }

/** So nah muss ein Standort an der gezeichneten Strecke liegen, mindestens */
const NAH_M = 60
/** So weit muss der Zug auf demselben Abschnitt gefahren sein, damit die Richtung gilt */
const RICHTUNG_M = 150
/** Liegt eine Strecke im Mittel so viel näher (und halb so weit weg), gilt sie allein */
const KLAR_M = 25
/** Nicht weiter als so viele Abschnitte folgen, zurück bis zum letzten Bahnhof höchstens so viele */
const VOR_MAX = 400
const ZURUECK_MAX = 15

interface Stueck { e: StreckenAbschnitt; weg: Fahrweg; box: [number, number, number, number] }

export interface Kandidat {
  /** Betriebspunkte des Wegs, vom letzten Bahnhof hinter dem Zug bis zum Ende der Linie */
  punkte: string[]
  /** die Linie beim Zug, laut SBB oder Schienennetz des BAV; null: keine zugeordnet */
  linie: number | null
  /** Betriebspunkt, auf den der Zug zufährt */
  richtung: string
  /** letzter Betriebspunkt des Wegs: der letzte Bahnhof vorne, sonst das Ende */
  ende: string
  /** mittlerer Abstand der Standorte zur gezeichneten Strecke, Meter */
  abstand: number
}

export type Erkennung =
  | { art: 'abseits' }
  | { art: 'richtung' }
  | { art: 'eindeutig'; kandidat: Kandidat }
  | { art: 'mehrere'; kandidaten: Kandidat[] }

/** Die gezeichneten Abschnitte, einmal gebaut */
export function stueckeBauen(netz: StreckenNetz, linien: Linien): Stueck[] {
  return netz.abschnitte.map((e) => {
    const weg = fahrwegBauen(netz, linien, [e.von, e.nach], [e], () => undefined, () => false)
    let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const p of weg.punkte) {
      a = Math.min(a, p.lat); b = Math.min(b, p.lon); c = Math.max(c, p.lat); d = Math.max(d, p.lon)
    }
    return { e, weg, box: [a, b, c, d] }
  })
}

/** Die Linie am Anfang oder Ende eines Abschnitts, in Fahrtrichtung */
function linieAm(e: StreckenAbschnitt, vonHier: string, ende: 'anfang' | 'ende'): number | null {
  const t = e.teile ?? []
  if (!t.length) return e.linie_bav ?? null
  const folge = e.von === vonHier ? t : [...t].reverse()
  return (ende === 'anfang' ? folge[0] : folge[folge.length - 1]).linie
}

/**
 * Der Weg ab dem Abschnitt a → b weiter: an jedem Betriebspunkt der Abschnitt
 * derselben Linie; gibt es keinen, aber genau einen anderen, dieser. Sonst ist
 * der Weg hier zu Ende.
 */
function folgen(nachbarn: Map<string, StreckenAbschnitt[]>, a: string, b: string, e: StreckenAbschnitt,
                max: number): string[] {
  const punkte = [a, b]
  const gesehen = new Set([a, b])
  let [hier, kam] = [b, e]
  let linie = linieAm(e, a, 'ende')
  for (let i = 0; i < max; i++) {
    const weiter = (nachbarn.get(hier) ?? []).filter((x) => x !== kam)
    const gleich = weiter.filter((x) => linie !== null && linieAm(x, hier, 'anfang') === linie)
    const naechster = gleich.length === 1 ? gleich[0] : gleich.length === 0 && weiter.length === 1 ? weiter[0] : null
    if (!naechster) break
    const dort = naechster.von === hier ? naechster.nach : naechster.von
    if (gesehen.has(dort)) break
    gesehen.add(dort)
    punkte.push(dort)
    linie = linieAm(naechster, hier, 'ende')
    ;[hier, kam] = [dort, naechster]
  }
  return punkte
}

export function nachbarnVon(netz: StreckenNetz) {
  const n = new Map<string, StreckenAbschnitt[]>()
  for (const e of netz.abschnitte) {
    n.set(e.von, [...(n.get(e.von) ?? []), e])
    n.set(e.nach, [...(n.get(e.nach) ?? []), e])
  }
  return n
}

/** Aus dem Abschnitt und der Richtung den ganzen Weg: zurück bis zum letzten
 *  Bahnhof, vorwärts bis zum Ende der Linie, dort bis zum letzten Bahnhof */
function kandidatBauen(nachbarn: Map<string, StreckenAbschnitt[]>, e: StreckenAbschnitt, vorwaerts: boolean,
                       istBahnhof: (abk: string) => boolean): Kandidat {
  const [a, b] = vorwaerts ? [e.von, e.nach] : [e.nach, e.von]
  const vor = folgen(nachbarn, a, b, e, VOR_MAX)
  const zurueck = folgen(nachbarn, b, a, e, ZURUECK_MAX)
  // zurück bis zum ersten Bahnhof hinter dem Zug
  let bis = zurueck.findIndex((p, i) => i >= 1 && istBahnhof(p))
  if (bis < 0) bis = zurueck.length - 1
  const hinten = zurueck.slice(2, bis + 1).reverse()
  // vorn bis zum letzten Bahnhof, aber nicht vor den Abschnitt beim Zug zurück
  let ende = vor.length - 1
  while (ende > 1 && !istBahnhof(vor[ende])) ende--
  return { punkte: [...hinten, ...vor.slice(0, ende + 1)], linie: linieAm(e, a, 'anfang'), richtung: b,
           ende: vor[ende], abstand: 0 }
}

/** Die letzten Standorte aus dem Fahrtmodus: Die nächste Suche muss nicht bei null anfangen */
let spur: Fix[] = []
export const spurLesen = () => spur
export function spurMerken(f: Fix) { spur = [...spur, f].slice(-40) }

/** Die zuletzt gefahrene Linie, für die nächste Suche auf derselben Fahrt */
let zuletzt: number | null = null
export const linieZuletzt = () => zuletzt
export function linieMerken(nr: number | null) { zuletzt = nr }

/**
 * Erkennt Abschnitt und Richtung aus den letzten Standorten. Gleich lange
 * Wege mit denselben Betriebspunkten gelten als einer.
 */
export function erkennen(stuecke: Stueck[], nachbarn: Map<string, StreckenAbschnitt[]>, fixes: Fix[],
                         istBahnhof: (abk: string) => boolean, bisher: number | null = null): Erkennung {
  const letzter = fixes[fixes.length - 1]
  if (!letzter) return { art: 'abseits' }
  const nah = (f: Fix) => Math.max(NAH_M, 1.5 * f.genau)
  const grad = 0.01 // etwa 1 km Rand um die Box
  const nahe = stuecke.flatMap((st) => {
    const [a, b, c, d] = st.box
    if (letzter.lat < a - grad || letzter.lat > c + grad || letzter.lon < b - grad || letzter.lon > d + grad) return []
    const p = projizieren(st.weg, letzter)
    return p.abstand <= nah(letzter) ? [{ st, s: p.s }] : []
  })
  if (!nahe.length) return { art: 'abseits' }

  const kandidaten: Kandidat[] = []
  let ohneRichtung = false
  for (const { st, s } of nahe) {
    // ältere Standorte auf demselben Abschnitt: der älteste gibt die Richtung
    let alt: number | null = null
    const abstaende = [projizieren(st.weg, letzter).abstand]
    for (let i = fixes.length - 2; i >= 0; i--) {
      const f = fixes[i]
      const p = projizieren(st.weg, f)
      if (p.abstand > nah(f)) break
      alt = p.s
      abstaende.push(p.abstand)
    }
    if (alt === null || Math.abs(s - alt) < RICHTUNG_M) { ohneRichtung = true; continue }
    kandidaten.push({ ...kandidatBauen(nachbarn, st.e, s > alt, istBahnhof),
                      abstand: abstaende.reduce((x, y) => x + y, 0) / abstaende.length })
  }
  // liegt eine Strecke klar näher, fallen die weiter entfernten weg
  const best = Math.min(...kandidaten.map((k) => k.abstand))
  const klar = kandidaten.filter((k) => k.abstand <= Math.max(2 * best, best + KLAR_M))
  // derselbe Weg über zwei Abschnitte (beim Betriebspunkt) zählt einmal
  const eigene = klar.filter((k, i) => klar.findIndex((x) => x.punkte.join() === k.punkte.join()) === i)
  // am Betriebspunkt: der Weg, der weiterführt, schliesst den ein, der hinter dem Zug endet
  const uebrig = eigene.filter((k) => !eigene.some((x) => x !== k && enthaelt(x.punkte, k.punkte)))
  if (!uebrig.length) return ohneRichtung ? { art: 'richtung' } : { art: 'abseits' }
  if (uebrig.length === 1) return { art: 'eindeutig', kandidat: uebrig[0] }
  // schon einmal gewählt oder erkannt: dieselbe Linie wieder, wenn nur eine passt
  const gleiche = uebrig.filter((k) => bisher !== null && k.linie === bisher)
  if (gleiche.length === 1) return { art: 'eindeutig', kandidat: gleiche[0] }
  return { art: 'mehrere', kandidaten: uebrig }
}

/** Liegt b als zusammenhängendes Stück in a? */
function enthaelt(a: string[], b: string[]) {
  const s = a.join('\u0001'), t = b.join('\u0001')
  return s.includes(t)
}
