/**
 * Fahrgäste im Gleisbau (Michael, 2026-11-23, Vorschlag «Fahrgäste»): an den Bahnhöfen warten Figuren mit einem Ziel, ein anderer Bahnhof des Bretts.
 * Hält ein Zug, steigen zuerst die aus, deren Ziel dieser Bahnhof ist (je einer ein Punkt), dann die Wartenden ein, so viele Plätze frei sind. Alle
 * NEU_ALLE_S kommt an einem zufälligen Bahnhof ein neuer dazu, höchstens WARTEN_HOECHSTENS je Bahnhof. Ein Spiel, alle Zahlen gewählt.
 */
export const NEU_ALLE_S = 4, WARTEN_HOECHSTENS = 4, PLAETZE = 6

export interface Fahrgaeste {
  /** je Bahnhof (Buchstabe) die Ziele der Wartenden */
  warten: Record<string, string[]>
  /** je Zug die Ziele der Fahrgäste darin */
  imZug: string[][]
  gebracht: number
  bisNeu: number
}

const zufallAus = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)]

function neuerFahrgast(f: Fahrgaeste, bahnhoefe: string[], wo?: string): boolean {
  const frei = bahnhoefe.filter((b) => (f.warten[b]?.length ?? 0) < WARTEN_HOECHSTENS)
  const ab = wo ?? (frei.length ? zufallAus(frei) : null)
  if (!ab) return false
  const ziel = zufallAus(bahnhoefe.filter((b) => b !== ab))
  f.warten[ab] = [...(f.warten[ab] ?? []), ziel]
  return true
}

/** am Anfang einer Fahrt: an jedem Bahnhof einer; null, wenn es weniger als zwei Bahnhöfe gibt */
export function fahrgaesteStart(bahnhoefe: string[], zuege: number): Fahrgaeste | null {
  if (bahnhoefe.length < 2) return null
  const f: Fahrgaeste = { warten: {}, imZug: Array.from({ length: zuege }, () => []), gebracht: 0, bisNeu: NEU_ALLE_S }
  for (const b of bahnhoefe) neuerFahrgast(f, bahnhoefe, b)
  return f
}

/** die Zeit läuft: ab und zu ein neuer Fahrgast; gibt zurück, ob sich etwas geändert hat */
export function fahrgaesteZeit(f: Fahrgaeste, dt: number, bahnhoefe: string[]): boolean {
  f.bisNeu -= dt
  if (f.bisNeu > 0) return false
  f.bisNeu = NEU_ALLE_S
  return neuerFahrgast(f, bahnhoefe)
}

/** ein Zug hält am Bahnhof: aus- und einsteigen; gibt zurück, wie viele aus- und eingestiegen sind */
export function fahrgaesteHalt(f: Fahrgaeste, zug: number, bahnhof: string, plaetze = PLAETZE): { aus: number; ein: number } {
  const drin = f.imZug[zug] ?? []
  const bleiben = drin.filter((z) => z !== bahnhof), aus = drin.length - bleiben.length
  const wartend = f.warten[bahnhof] ?? []
  const ein = Math.max(0, Math.min(plaetze - bleiben.length, wartend.length))
  f.imZug[zug] = [...bleiben, ...wartend.slice(0, ein)]
  f.warten[bahnhof] = wartend.slice(ein)
  f.gebracht += aus
  return { aus, ein }
}
