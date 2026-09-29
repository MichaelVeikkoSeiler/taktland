/**
 * Ob Taktland verfügbar ist, entscheidet Michael (2026-09-30: «nach meinem
 * eigenen Entscheid nicht mehr verfügbar»). Die App fragt beim Öffnen und
 * beim Zurückholen die Datei status.json neben sich ab:
 *
 * - «verfuegbar»: false → Taktland zeigt nur noch einen Hinweis und die
 *   Sicherung, und der Speicher der App auf dem Gerät wird geleert.
 * - Die Datei fehlt (404), etwa weil die Seite abgeschaltet ist → ebenso.
 * - Kein Empfang → die App läuft weiter, aber höchstens OHNE_ANTWORT_TAGE
 *   seit der letzten Antwort. So endet Taktland auch auf Geräten, die nie
 *   mehr online gehen.
 *
 * Nichts davon wird gesendet; die Abfrage ist ein gewöhnlicher Dateiabruf.
 */
import { useEffect, useState } from 'react'

export const OHNE_ANTWORT_TAGE = 30
const ZULETZT = 'taktland.status.zuletzt.v1'
const GESPERRT = 'taktland.status.gesperrt.v1'

export interface Sperre { meldung: string }

function lesen(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}
function schreiben(k: string, v: string | null) {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* ohne Speicher */ }
}

/** Speicher der App leeren (Programm, Daten), die eigenen Daten im localStorage bleiben */
async function speicherLeeren() {
  try {
    const reg = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((reg ?? []).map((r) => r.unregister()))
    const namen = await caches.keys()
    await Promise.all(namen.map((n) => caches.delete(n)))
  } catch { /* nicht überall erlaubt */ }
}

export async function statusPruefen(): Promise<Sperre | null> {
  if (import.meta.env.DEV) return null
  try {
    const antwort = await fetch(`${import.meta.env.BASE_URL}status.json`, { cache: 'no-store' })
    if (antwort.status === 404) return sperren('')
    if (!antwort.ok) return ohneAntwort()
    const s = await antwort.json() as { verfuegbar?: boolean; meldung?: string }
    if (s.verfuegbar === false) return sperren(s.meldung ?? '')
    schreiben(ZULETZT, String(Date.now()))
    schreiben(GESPERRT, null)
    return null
  } catch {
    return ohneAntwort()
  }
}

function sperren(meldung: string): Sperre {
  schreiben(GESPERRT, meldung || ' ')
  void speicherLeeren()
  return { meldung }
}

/** Kein Empfang: gesperrt bleibt gesperrt; sonst nur nach zu langer Zeit ohne Antwort */
function ohneAntwort(): Sperre | null {
  const g = lesen(GESPERRT)
  if (g !== null) return { meldung: g.trim() }
  const z = Number(lesen(ZULETZT))
  if (!z) { schreiben(ZULETZT, String(Date.now())); return null }
  return Date.now() - z > OHNE_ANTWORT_TAGE * 86_400_000 ? { meldung: '' } : null
}

/** Beim Start und beim Zurückholen prüfen; bis zur ersten Antwort gilt der letzte Stand */
export function useSperre(): Sperre | null {
  const [sperre, setSperre] = useState<Sperre | null>(() => {
    const g = lesen(GESPERRT)
    return g !== null ? { meldung: g.trim() } : null
  })
  useEffect(() => {
    const pruefen = () => { if (document.visibilityState === 'visible') void statusPruefen().then(setSperre) }
    pruefen()
    document.addEventListener('visibilitychange', pruefen)
    return () => document.removeEventListener('visibilitychange', pruefen)
  }, [])
  return sperre
}
