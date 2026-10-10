import { useEffect, useState } from 'react'
import { laden, ladenBeobachten } from '../daten'

/** erst nach so vielen Millisekunden zeigen: was schneller lädt, soll nicht aufblitzen */
const NACH_MS = 250
/** voll stehen lassen, bevor er verschwindet */
const VOLL_MS = 300

/**
 * Ladebalken oben am Bildschirm, über allen Seiten (Michael, 2026-10-10: «Egal wo, wenn irgendwo etwas am Laden ist,
 * soll eine Progressbar erscheinen»). Er füllt sich mit dem Anteil der Dateien, die seit dem letzten Stillstand fertig
 * geladen sind (laden in daten.ts); wie gross eine Datei ist, weiss er nicht.
 */
export function Ladebalken() {
  const [stand, setStand] = useState({ ...laden })
  const [sichtbar, setSichtbar] = useState(false)
  useEffect(() => ladenBeobachten(() => setStand({ ...laden })), [])
  const aktiv = stand.begonnen > stand.fertig
  useEffect(() => {
    const uhr = window.setTimeout(() => setSichtbar(aktiv), aktiv ? NACH_MS : VOLL_MS)
    return () => window.clearTimeout(uhr)
  }, [aktiv])
  if (!sichtbar) return null
  const anteil = aktiv ? Math.max(0.08, stand.fertig / stand.begonnen) : 1
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1" role="progressbar" aria-label="Wird geladen"
         aria-valuemin={0} aria-valuemax={stand.begonnen} aria-valuenow={stand.fertig}>
      <div className="h-full bg-sbb-red transition-[width] duration-200 ease-out" style={{ width: `${anteil * 100}%` }} />
    </div>
  )
}
