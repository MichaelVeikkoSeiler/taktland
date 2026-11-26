/**
 * Ladungen im Gleisbau (Michael, 2026-11-25: «Erstelle Aufgaben für Personentransporte und Gütertransporte»): an Güterschuppen warten Ladungen mit
 * einem Ziel, einem anderen Güterschuppen. Hält ein Güterzug am Schuppen, wird zuerst abgeladen, was dorthin soll (je eine geliefert), dann aufgeladen,
 * jede Ladung auf einen freien Wagen, der zu ihrem Gut passt (seit 2026-11-25, Bahnbetrieb: Holz auf den Rungenwagen, Kies auf den Schüttgutwagen …;
 * der Güterwagen des freien Bauens nimmt jedes). Ohne Routen entsteht an jedem Schuppen Stückgut für einen zufälligen anderen, mit Routen (Aufträge
 * im Bahnbetrieb) nur das Gut der Route an ihrem Anfang. Alle NEU_ALLE_S kommt eine Ladung dazu, höchstens WARTEN_HOECHSTENS je Schuppen. Ein Spiel,
 * alle Zahlen gewählt; ein Schuppen heisst nach seinem Feld «i,j»
 */
import type { Zug } from './gleisbau'
import { type Gut, passt, type WagenTyp } from './gleisbauFahrzeuge'

export const NEU_ALLE_S = 5, WARTEN_HOECHSTENS = 3
/**
 * seit 2026-11-26 (Michael: «Warum fährt der Zug mit einem leeren Wagen davon?»): ein Güterzug mit freien passenden Wagen bleibt am Schuppen, der dieses Gut
 * liefert, stehen, bis alle beladen sind, höchstens LADEN_HOECHSTENS_S; solange kommt dort alle LADEN_NEU_S eine Ladung dazu (gewählt)
 */
export const LADEN_HOECHSTENS_S = 15, LADEN_NEU_S = 1.5

export interface Ladung { nach: string; gut: Gut; /** auf welchem Fahrzeug des Zugs (Stelle von der Spitze an) */ wagen?: number }
/** im Bahnbetrieb: von welchem Schuppen welches Gut zu welchem */
export interface Route { von: string; nach: string; gut: Gut }

export interface Gueter {
  /** je Schuppen die wartenden Ladungen */
  warten: Record<string, Ladung[]>
  /** je Güterzug die Ladungen darin */
  imZug: Map<Zug, Ladung[]>
  geliefert: number
  /** je Gut geliefert */
  jeGut: Partial<Record<Gut, number>>
  bisNeu: number
  schuppen: string[]
  routen: Route[] | null
  /** je Güterzug, der am Schuppen auf Ladungen wartet: wie lange schon und bis zur nächsten */
  laden: Map<Zug, { s: number; bisNeu: number }>
}

const zufallAus = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)]

function neueLadung(g: Gueter, wo?: string): boolean {
  if (g.routen) {
    const frei = g.routen.filter((r) => (wo ? r.von === wo : true) && (g.warten[r.von]?.length ?? 0) < WARTEN_HOECHSTENS)
    if (!frei.length) return false
    const r = zufallAus(frei)
    g.warten[r.von] = [...(g.warten[r.von] ?? []), { nach: r.nach, gut: r.gut }]
    return true
  }
  const frei = g.schuppen.filter((s) => (g.warten[s]?.length ?? 0) < WARTEN_HOECHSTENS)
  const ab = wo ?? (frei.length ? zufallAus(frei) : null)
  if (!ab) return false
  g.warten[ab] = [...(g.warten[ab] ?? []), { nach: zufallAus(g.schuppen.filter((s) => s !== ab)), gut: 'stueckgut' }]
  return true
}

/** am Anfang einer Fahrt: an jedem Schuppen, der etwas liefert, eine Ladung; null mit weniger als zwei Schuppen */
export function gueterStart(schuppen: string[], routen: Route[] | null = null): Gueter | null {
  if (schuppen.length < 2) return null
  const g: Gueter = { warten: {}, imZug: new Map(), geliefert: 0, jeGut: {}, bisNeu: NEU_ALLE_S, schuppen, routen: routen?.length ? routen : null, laden: new Map() }
  for (const s of schuppen) { g.warten[s] = []; neueLadung(g, s) }
  return g
}

/** die Zeit läuft: ab und zu eine neue Ladung; gibt zurück, ob sich etwas geändert hat */
export function gueterZeit(g: Gueter, dt: number): boolean {
  g.bisNeu -= dt
  if (g.bisNeu > 0) return false
  g.bisNeu = NEU_ALLE_S
  return neueLadung(g)
}

/** ein Güterzug hält am Schuppen: ab- und aufladen, jede Ladung auf einen freien passenden Wagen */
export function gueterHalt(g: Gueter, zug: Zug, schuppen: string): { ab: number; auf: number } {
  const drin = g.imZug.get(zug) ?? []
  const bleiben = drin.filter((l) => l.nach !== schuppen), weg = drin.filter((l) => l.nach === schuppen)
  for (const l of weg) g.jeGut[l.gut] = (g.jeGut[l.gut] ?? 0) + 1
  g.geliefert += weg.length
  const belegt = new Set(bleiben.map((l) => l.wagen))
  const frei = zug.gueterwagen().filter((w) => !belegt.has(w.k))
  const wartend = g.warten[schuppen] ?? [], uebrig: Ladung[] = []
  let auf = 0
  for (const l of wartend) {
    const w = frei.findIndex((x) => passt(x.typ as WagenTyp, l.gut))
    if (w < 0) { uebrig.push(l); continue }
    bleiben.push({ ...l, wagen: frei[w].k }); frei.splice(w, 1); auf++
  }
  g.imZug.set(zug, bleiben)
  g.warten[schuppen] = uebrig
  return { ab: weg.length, auf }
}

/** ob am Schuppen ein Gut entsteht, das auf einen freien Wagen des Zugs passt */
function ladetHier(g: Gueter, zug: Zug, schuppen: string): boolean {
  const belegt = new Set((g.imZug.get(zug) ?? []).map((l) => l.wagen))
  const frei = zug.gueterwagen().filter((w) => !belegt.has(w.k))
  const gueter: Gut[] = g.routen ? g.routen.filter((r) => r.von === schuppen).map((r) => r.gut) : ['stueckgut']
  return frei.some((w) => gueter.some((x) => passt(w.typ as WagenTyp, x)))
}

/** nach dem Ab- und Aufladen: ob der Zug weiter am Schuppen wartet; je Bild aufrufen, lädt, was dazukommt; gibt die Zahl neu geladener zurück */
export function gueterWarten(g: Gueter, zug: Zug, schuppen: string, dt: number, neu: boolean): number {
  if (neu) g.laden.set(zug, { s: 0, bisNeu: LADEN_NEU_S })
  const w = g.laden.get(zug)
  if (!w) return 0
  w.s += dt
  if (w.s > LADEN_HOECHSTENS_S || !ladetHier(g, zug, schuppen)) { g.laden.delete(zug); return 0 }
  if (!zug.haltVerlaengern(0.4)) { g.laden.delete(zug); return 0 }
  w.bisNeu -= dt
  if (w.bisNeu > 0) return 0
  w.bisNeu = LADEN_NEU_S
  neueLadung(g, schuppen)
  return gueterHalt(g, zug, schuppen).auf
}
