/**
 * «Fahrplan-Puzzle» und «Reisedauer» (Michael, 2026-11-14: «6 und 7 gerne umsetzen»): zwei Spiele mit dem Fahrplan.
 * Der Vorrat ist data/fahrplan/spiel.json aus pipeline/build_fahrplan.py (spiel_schreiben): je Muster eine Fahrt mit ihren Halten
 * laut Fahrplan, dazu Paare von Halten mit der Fahrzeit, in der Pipeline gerechnet. Hier nur Ziehen und Werten, ohne Darstellung.
 */
import { holen } from './daten'

export interface SpielFahrt {
  n: string; g: string; l: string; z: string
  /** [UIC, Ankunft, Abfahrt] in Minuten ab Mitternacht des Verkehrstags */
  h: Array<[number, number | null, number | null]>
  /** [Halt, Halt, Fahrzeit in Minuten laut Fahrplan] */
  p: Array<[number, number, number]>
}
export interface SpielVorrat { quelle: string; stand: string; tag: string; fahrten: SpielFahrt[] }

export const RUNDEN = 5
/** so viele Halte ordnet man im Puzzle (gewählt) */
export const PUZZLE_HALTE = 4
export const PUZZLE_PUNKTE_JE_HALT = 25
/** der Regler von «Reisedauer» geht von 0 bis hier, wie SPIEL_BIS_MIN in der Pipeline */
export const REGLER_BIS_MIN = 180
/** volle Punkte bis zu dieser Abweichung, halbe bis zur doppelten: 12 % der Fahrzeit, mindestens 3, höchstens 11 Minuten (seit 2026-11-15, vorher 8 % und mindestens 2;
 *  Michael: «Etwas mehr Toleranz beim Spiel Reisedauer»), so wertet
 *  der Regler höchstens 44 Minuten, weniger als ein Viertel seiner Spanne (CLAUDE.md, Regel 9; gewählt) */
export function toleranz(min: number): number {
  return Math.min(11, Math.max(3, Math.round(min * 0.12)))
}

export async function vorratLaden(): Promise<SpielVorrat> {
  return holen<SpielVorrat>('data/fahrplan/spiel.json')
}

export function zugTitel(f: SpielFahrt): string {
  return `${f.g} ${f.n}`.trim()
}

export function uhr(min: number | null): string {
  if (min === null) return '–'
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function zufall<T>(l: T[]): T { return l[Math.floor(Math.random() * l.length)] }
function mischen<T>(l: T[]): T[] {
  const a = [...l]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

export interface PuzzleRunde { f: SpielFahrt; /** die gezogenen Halte in der richtigen Reihenfolge (Index in f.h) */ richtig: number[]; gemischt: number[] }

/** eine Fahrt mit mindestens PUZZLE_HALTE Halten zwischen dem ersten und dem letzten, alle mit Namen; nicht zweimal dieselbe Linie */
export function puzzleZiehen(v: SpielVorrat, hatName: (uic: number) => boolean, schon: Set<string>): PuzzleRunde | null {
  const passend = v.fahrten.filter((f) => f.h.length >= PUZZLE_HALTE + 2 && f.h.every(([u]) => hatName(u)) && !schon.has(`${f.g}|${f.l}`))
  if (!passend.length) return null
  const f = zufall(passend)
  const innen = Array.from({ length: f.h.length - 2 }, (_, i) => i + 1)
  const richtig = mischen(innen).slice(0, PUZZLE_HALTE).sort((a, b) => a - b)
  let gemischt = mischen(richtig)
  while (gemischt.every((x, i) => x === richtig[i])) gemischt = mischen(richtig)
  return { f, richtig, gemischt }
}

export function puzzlePunkte(r: PuzzleRunde, gewaehlt: number[]): number {
  return gewaehlt.reduce((s, x, i) => s + (x === r.richtig[i] ? PUZZLE_PUNKTE_JE_HALT : 0), 0)
}

export interface DauerRunde { f: SpielFahrt; von: number; bis: number; min: number }

export function dauerZiehen(v: SpielVorrat, hatName: (uic: number) => boolean, schon: Set<string>): DauerRunde | null {
  const passend = v.fahrten.filter((f) => f.p.length && !schon.has(`${f.g}|${f.l}`)
    && f.p.some(([a, b]) => hatName(f.h[a][0]) && hatName(f.h[b][0])))
  if (!passend.length) return null
  const f = zufall(passend)
  const [von, bis, min] = zufall(f.p.filter(([a, b]) => hatName(f.h[a][0]) && hatName(f.h[b][0])))
  return { f, von, bis, min }
}

/** Punkte in Schritten von 1: 100 genau getroffen, gleichmässig weniger mit jeder Minute daneben, 0 ab 2 · toleranz() + 1 Minuten
 *  (seit 2026-11-15, vorher 100 bis toleranz(), 50 bis zum Doppelten; Michael: «Viel feinere Punktesbstimmung. Nicht 100 und 50 sondern im 1er schritt»);
 *  Punkte gibt es so höchstens 22 Minuten daneben, 44 Minuten des Reglers (Regel 9) */
/** jeder Hinweis in «Reisedauer» (Karte, Zwischenhalte) nimmt 15 % der Punkte (Michael, 2026-11-18: «Hinweis 1: -15% Hinweis 2 -15%») */
export const DAUER_HINWEIS_ABZUG = 0.15

export function dauerPunkte(min: number, tipp: number): number {
  const d = Math.abs(tipp - min), null_ab = 2 * toleranz(min) + 1
  return Math.max(0, Math.round(100 * (1 - d / null_ab)))
}

const BEST = { puzzle: 'taktland.fahrplanpuzzle.best', dauer: 'taktland.fahrzeit.best' } as const
export function bestwert(art: keyof typeof BEST): number | null {
  try { const x = Number(localStorage.getItem(BEST[art])); return Number.isFinite(x) && x > 0 ? x : null } catch { return null }
}
export function bestwertFesthalten(art: keyof typeof BEST, punkte: number): boolean {
  const alt = bestwert(art)
  if (alt !== null && punkte <= alt) return false
  try { localStorage.setItem(BEST[art], String(punkte)) } catch { /* nur für jetzt */ }
  return true
}
