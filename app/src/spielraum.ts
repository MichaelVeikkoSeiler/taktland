/**
 * Spielräume für Spiele auf mehreren Geräten (Michael, 2026-10-05, zuerst für «Geo»). Die
 * Vermittlung auf spiel.taktland.ch (server/spiel/raum.php) reicht nur Ereignisse weiter:
 * Beitritt, Start, Tipp, Weiter. Gerechnet wird auf jedem Gerät aus derselben Liste, darum
 * sehen alle denselben Stand, und wer neu lädt, holt die Liste einfach nochmals.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** Zum Ausprobieren auf dem eigenen Rechner: VITE_SPIEL_URL=http://127.0.0.1:8090/raum.php */
const ADRESSE = import.meta.env.VITE_SPIEL_URL ?? 'https://spiel.taktland.ch/raum.php'
/** so oft fragt ein Gerät nach Neuem, solange die Seite zu sehen ist */
const TAKT_MS = 1000

export interface Ereignis { von: string; typ: string; d: unknown }

async function anfrage(a: string, raum?: string, ab?: number, koerper?: unknown) {
  const url = `${ADRESSE}?a=${a}${raum ? `&raum=${raum}` : ''}${ab !== undefined ? `&ab=${ab}` : ''}`
  // text/plain: eine einfache Anfrage ohne Vorabprüfung des Browsers
  const r = await fetch(url, koerper === undefined && a !== 'neu' ? { cache: 'no-store' }
    : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(koerper ?? {}) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(r.status === 404 ? 'Diesen Spielraum gibt es nicht (mehr).' : `Die Vermittlung antwortet nicht wie erwartet (${r.status}).`)
  return j
}

export async function raumEroeffnen(): Promise<string> {
  const j = await anfrage('neu')
  if (typeof j.raum !== 'string') throw new Error('Kein Spielraum erhalten.')
  return j.raum
}

/** Die Kennung dieses Geräts in einem Spielraum; je Tab, damit man zum Ausprobieren zwei Tabs nehmen kann */
export function eigeneId(): string {
  const S = 'taktland.spielraum.id'
  try {
    const da = sessionStorage.getItem(S)
    if (da) return da
    const neu = Math.random().toString(36).slice(2, 10)
    sessionStorage.setItem(S, neu)
    return neu
  } catch { return Math.random().toString(36).slice(2, 10) }
}

/** Wer in welchem Raum mitspielt, damit Neuladen die Partie nicht verliert */
export interface Teilnahme { raum: string; name: string; gastgeber: boolean }
const TEILNAHME = 'taktland.spielraum.teilnahme'
export function teilnahmeLesen(raum: string): Teilnahme | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TEILNAHME) ?? 'null') as Teilnahme | null
    return t && t.raum === raum ? t : null
  } catch { return null }
}
export function teilnahmeMerken(t: Teilnahme | null) {
  try { if (t) sessionStorage.setItem(TEILNAHME, JSON.stringify(t)); else sessionStorage.removeItem(TEILNAHME) } catch { /* nur jetzt */ }
}

/** Die Adresse, die der QR-Code zeigt */
export const raumAdresse = (raum: string, spiel = 'schweiz11') =>
  `${window.location.origin}${window.location.pathname}#/${spiel}/mit/${raum}`

/**
 * Die Ereignisse eines Raums, laufend nachgeführt, und senden. Gesendet wird der Reihe nach;
 * ein Ereignis erscheint erst, wenn es von der Vermittlung zurückkommt, für alle gleich.
 */
export function useRaum(raum: string | null) {
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [verbunden, setVerbunden] = useState(true)
  /** einmal abgeholt: ein frischer Raum hat noch keine Ereignisse */
  const [bereit, setBereit] = useState(false)
  const n = useRef(0)
  const laeuft = useRef(false)

  const holen = useCallback(async () => {
    if (!raum || laeuft.current) return
    laeuft.current = true
    try {
      const j = await anfrage('holen', raum, n.current)
      const neu = Array.isArray(j.ereignisse) ? j.ereignisse as Ereignis[] : []
      if (neu.length) {
        n.current += neu.length
        setEreignisse((alt) => [...alt, ...neu])
      }
      setVerbunden(true)
      setFehler(null)
      setBereit(true)
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Diesen Spielraum')) setFehler(e.message)
      else setVerbunden(false)
    } finally { laeuft.current = false }
  }, [raum])

  useEffect(() => {
    if (!raum) return
    n.current = 0
    setEreignisse([])
    setBereit(false)
    void holen()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void holen() }, TAKT_MS)
    const sichtbar = () => { if (document.visibilityState === 'visible') void holen() }
    document.addEventListener('visibilitychange', sichtbar)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', sichtbar) }
  }, [raum, holen])

  const senden = useCallback(async (typ: string, d?: unknown) => {
    if (!raum) return
    try {
      await anfrage('senden', raum, undefined, { von: eigeneId(), typ, d: d ?? null })
      setVerbunden(true)
    } catch (e) {
      setVerbunden(false)
      throw e
    }
    void holen()
  }, [raum, holen])

  return { ereignisse, fehler, verbunden, bereit, senden }
}
