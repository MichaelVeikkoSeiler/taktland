/**
 * Welche Bahnen der Weg nehmen darf (Michael, 2026-09-26: «filtern können, ob
 * man alle Bahnen oder nur einzelne berücksichtigt haben möchte»). Gespeichert
 * sind die ausgeschlossenen, damit eine neue Bahn im Netz von selbst dabei ist.
 * Nur auf diesem Gerät.
 */
import { useEffect, useState } from 'react'
import type { Nachbarn } from './komponenten/Strecke'
import type { StreckenAbschnitt, StreckenNetz } from './typen'

const SCHLUESSEL = 'taktland.bahnen.v1'
const EREIGNIS = 'taktland-bahnen'

export function bahnenAusLesen(): Set<string> {
  try {
    const x = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '[]')
    return new Set(Array.isArray(x) ? x.filter((b) => typeof b === 'string') : [])
  } catch {
    return new Set()
  }
}

export function bahnenAusSetzen(aus: Set<string>) {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify([...aus].sort())) } catch { /* nur jetzt */ }
  window.dispatchEvent(new Event(EREIGNIS))
}

/** Die ausgeschlossenen Bahnen, nachgeführt, auch aus einem anderen Reiter */
export function useBahnenAus(): Set<string> {
  const [aus, setAus] = useState(bahnenAusLesen)
  useEffect(() => {
    const neu = () => setAus(bahnenAusLesen())
    const speicher = (e: StorageEvent) => { if (e.key === SCHLUESSEL) neu() }
    window.addEventListener(EREIGNIS, neu)
    window.addEventListener('storage', speicher)
    return () => { window.removeEventListener(EREIGNIS, neu); window.removeEventListener('storage', speicher) }
  }, [])
  return aus
}

/** Die Bahn eines Abschnitts; ältere Netze ohne «bahn» nach der Infrastruktur */
export const bahnVon = (e: StreckenAbschnitt) => e.bahn ?? e.isb

/** Die Bahnen im Netz, die mit den meisten Abschnitten zuerst */
export function bahnenImNetz(netz: StreckenNetz): string[] {
  const zahl = new Map<string, number>()
  for (const e of netz.abschnitte) zahl.set(bahnVon(e), (zahl.get(bahnVon(e)) ?? 0) + 1)
  return [...zahl.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([b]) => b)
}

/** Nachbarn für die Wegsuche, nur über Abschnitte der erlaubten Bahnen */
export function nachbarnBauen(netz: StreckenNetz | null, aus: Set<string>): Nachbarn {
  const n: Nachbarn = new Map()
  for (const e of netz?.abschnitte ?? []) {
    if (aus.has(bahnVon(e))) continue
    n.set(e.von, [...(n.get(e.von) ?? []), [e.nach, e]])
    n.set(e.nach, [...(n.get(e.nach) ?? []), [e.von, e]])
  }
  return n
}
