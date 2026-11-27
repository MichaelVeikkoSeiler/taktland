/**
 * Eigene Aufträge (Michael, 2026-11-27: «Eigentlich wäre doch für die User spannend, wenn sie selber Aufträge konzipieren könnten und diese Bekannten als
 * Aufgabe weitergeben könnten», dann «bitte alles bauen»): ein eigenes Brett ist die Ausgangslage, alles darauf bleibt für den Spieler fest wie in den
 * Aufgaben; dazu Titel, Text, Ziel (Fahrgäste, Ladungen) und auf Wunsch ein Budget für die Baukosten. Alles steckt im Link, ohne Server und ohne Konto
 */
import { brettAusCode, type Brett } from './gleisbau'
import type { Aufgabe, Transport } from './gleisbauAufgaben'
import { baukosten } from './gleisbauBetrieb'

export interface EigenerAuftrag { code: string; titel: string; text: string; fahrgaeste: number; gueter: number; budget: number }

export const EIGEN_TITEL_MAX = 40, EIGEN_TEXT_MAX = 240, EIGEN_ZIEL_MAX = 200, EIGEN_BUDGET_MAX = 100000

/** der Teil der Adresse nach «#/gleisbau?» */
export function eigenAdresse(e: EigenerAuftrag): string {
  const q = new URLSearchParams()
  q.set('eigen', e.code)
  q.set('z', `${e.fahrgaeste}.${e.gueter}.${e.budget}`)
  if (e.titel) q.set('t', e.titel)
  if (e.text) q.set('x', e.text)
  return q.toString()
}
export const eigenLink = (e: EigenerAuftrag) => `${window.location.origin}${window.location.pathname}#/gleisbau?${eigenAdresse(e)}`

/** aus der Adresse; null, wenn sie nicht stimmt */
export function eigenLesen(q: URLSearchParams): EigenerAuftrag | null {
  const code = q.get('eigen')
  if (!code || !brettAusCode(code)) return null
  const [f, g, b] = (q.get('z') ?? '').split('.').map((x) => Math.floor(Number(x)))
  const zahl = (x: number, max: number) => (Number.isFinite(x) && x > 0 ? Math.min(max, x) : 0)
  const e = { code, titel: (q.get('t') ?? '').slice(0, EIGEN_TITEL_MAX), text: (q.get('x') ?? '').slice(0, EIGEN_TEXT_MAX),
    fahrgaeste: zahl(f, EIGEN_ZIEL_MAX), gueter: zahl(g, EIGEN_ZIEL_MAX), budget: zahl(b, EIGEN_BUDGET_MAX) }
  return e.fahrgaeste || e.gueter ? e : null
}

/** ein fester Name je Auftrag, damit die Sterne auf dem Gerät beim richtigen bleiben */
function kennung(s: string) {
  let h = 2166136261
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

/** was im Auftrag zu tun ist, in einem Satz */
export function eigenZiel(e: EigenerAuftrag) {
  const was = [e.fahrgaeste && `${e.fahrgaeste} Fahrgäste`, e.gueter && `${e.gueter} Ladungen`].filter(Boolean).join(' und ')
  return `Ziel: ${was} ans Ziel bringen${e.budget ? `, mit höchstens CHF ${e.budget.toLocaleString('de-CH')} Baukosten` : ''}.`
}

/** der eigene Auftrag als Aufgabe; transport ist die Prüfung der Transportaufgaben */
export function eigenAlsAufgabe(e: EigenerAuftrag, transport: (z: Partial<Transport>) => Pick<Aufgabe, 'pruefen' | 'schritte' | 'transport'>): Aufgabe {
  const b0 = brettAusCode(e.code)!, k0 = baukosten(b0)
  const kosten = (b: Brett) => Math.max(0, baukosten(b) - k0)
  const t = transport({ ...(e.fahrgaeste ? { fahrgaeste: e.fahrgaeste } : {}), ...(e.gueter ? { gueter: e.gueter } : {}) })
  return {
    id: `eigen-${kennung(eigenAdresse(e))}`,
    titel: e.titel || 'Eigener Auftrag',
    ziel: `${e.text ? `${e.text} ` : ''}${eigenZiel(e)}`,
    brett: () => brettAusCode(e.code)!,
    pruefen: (b, s) => {
      if (e.budget && kosten(b) > e.budget) return { ok: false, text: `Zu teuer: Die Baukosten sind CHF ${kosten(b).toLocaleString('de-CH')}, erlaubt sind CHF ${e.budget.toLocaleString('de-CH')}.` }
      return t.pruefen(b, s)
    },
    schritte: (b, s) => [...(t.schritte?.(b, s) ?? []),
      ...(e.budget ? [{ art: 'bahnhof' as const, text: `Baukosten CHF ${kosten(b).toLocaleString('de-CH')} von ${e.budget.toLocaleString('de-CH')}`, ok: kosten(b) <= e.budget }] : [])],
    transport: t.transport,
  }
}
