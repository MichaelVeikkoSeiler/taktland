/**
 * Ladungen im Gleisbau (Michael, 2026-11-25: «Erstelle Aufgaben für Personentransporte und Gütertransporte»): an jedem Güterschuppen warten Ladungen
 * mit einem Ziel, einem anderen Güterschuppen des Bretts. Hält ein Güterzug am Schuppen, werden zuerst die Ladungen für diesen Schuppen abgeladen
 * (je eine geliefert), dann die wartenden aufgeladen, so viele Güterwagen frei sind. Alle NEU_ALLE_S kommt an einem zufälligen Schuppen eine dazu,
 * höchstens WARTEN_HOECHSTENS je Schuppen. Ein Spiel, alle Zahlen gewählt; ein Schuppen heisst nach seinem Feld «i,j»
 */
import type { Zug } from './gleisbau'

export const NEU_ALLE_S = 5, WARTEN_HOECHSTENS = 3

export interface Gueter {
  /** je Schuppen die Ziele der wartenden Ladungen */
  warten: Record<string, string[]>
  /** je Güterzug die Ziele der Ladungen darin */
  imZug: Map<Zug, string[]>
  geliefert: number
  bisNeu: number
}

const zufallAus = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)]

function neueLadung(g: Gueter, schuppen: string[], wo?: string): boolean {
  const frei = schuppen.filter((s) => (g.warten[s]?.length ?? 0) < WARTEN_HOECHSTENS)
  const ab = wo ?? (frei.length ? zufallAus(frei) : null)
  if (!ab) return false
  g.warten[ab] = [...(g.warten[ab] ?? []), zufallAus(schuppen.filter((s) => s !== ab))]
  return true
}

/** am Anfang einer Fahrt: an jedem Schuppen eine Ladung; null mit weniger als zwei Schuppen */
export function gueterStart(schuppen: string[]): Gueter | null {
  if (schuppen.length < 2) return null
  const g: Gueter = { warten: {}, imZug: new Map(), geliefert: 0, bisNeu: NEU_ALLE_S }
  for (const s of schuppen) neueLadung(g, schuppen, s)
  return g
}

/** die Zeit läuft: ab und zu eine neue Ladung; gibt zurück, ob sich etwas geändert hat */
export function gueterZeit(g: Gueter, dt: number, schuppen: string[]): boolean {
  g.bisNeu -= dt
  if (g.bisNeu > 0) return false
  g.bisNeu = NEU_ALLE_S
  return neueLadung(g, schuppen)
}

/** ein Güterzug hält am Schuppen: ab- und aufladen */
export function gueterHalt(g: Gueter, zug: Zug, schuppen: string): { ab: number; auf: number } {
  const drin = g.imZug.get(zug) ?? []
  const bleiben = drin.filter((z) => z !== schuppen), ab = drin.length - bleiben.length
  const wartend = g.warten[schuppen] ?? []
  const auf = Math.min(zug.ladeplaetze() - bleiben.length, wartend.length)
  g.imZug.set(zug, [...bleiben, ...wartend.slice(0, Math.max(0, auf))])
  g.warten[schuppen] = wartend.slice(Math.max(0, auf))
  g.geliefert += ab
  return { ab, auf: Math.max(0, auf) }
}
