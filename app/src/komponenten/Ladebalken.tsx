import { useEffect, useState } from 'react'
import { laden, ladenBeobachten, SZENE_MS, szeneFertig } from '../daten'

/** erst nach so vielen Millisekunden zeigen: was schneller lädt, soll nicht aufblitzen */
const NACH_MS = 250
/** voll stehen lassen, bevor er verschwindet */
const VOLL_MS = 300

/** Verlauf für eine 3D-Szene: Zeitanteil und Füllung, in unregelmässigen Schritten mit kurzen Halten, damit er nicht
 *  wie eine Uhr läuft (Michael, 2026-10-10: «nicht linear … damit es realistisch wirkt»); jedes Mal etwas anders */
function szeneVerlauf(): Array<[number, number]> {
  const punkte: Array<[number, number]> = [[0, 0]]
  let t = 0, f = 0
  while (t < 0.9) {
    t = Math.min(0.9, t + 0.06 + Math.random() * 0.14)
    // ab und zu ein Halt, sonst ein Sprung unterschiedlicher Grösse
    f = Math.min(0.9, f + (Math.random() < 0.25 ? 0.01 : 0.05 + Math.random() * 0.17))
    punkte.push([t, f])
  }
  punkte.push([1, 0.93])
  return punkte
}

function beiZeit(punkte: Array<[number, number]>, t: number) {
  for (let i = 1; i < punkte.length; i++) {
    const [t0, f0] = punkte[i - 1], [t1, f1] = punkte[i]
    if (t <= t1) {
      const a = (t - t0) / ((t1 - t0) || 1)
      // innerhalb eines Schritts erst schnell, dann langsamer
      return f0 + (f1 - f0) * (1 - (1 - a) * (1 - a))
    }
  }
  return punkte[punkte.length - 1][1]
}

/**
 * Ladebalken oben am Bildschirm, über allen Seiten (Michael, 2026-10-10: «Egal wo, wenn irgendwo etwas am Laden ist,
 * soll eine Progressbar erscheinen»). Sonst füllt er sich mit dem Anteil der Dateien, die seit dem letzten Stillstand
 * fertig geladen sind (laden in daten.ts); wie gross eine Datei ist, weiss er nicht. Beim Laden einer 3D-Szene läuft er
 * mindestens SZENE_MS von 0 bis 100 % in unregelmässigen Schritten, ein Spiel, keine Messung; lädt danach noch etwas,
 * kriecht er weiter, bis alles da ist.
 */
export function Ladebalken() {
  const [stand, setStand] = useState({ ...laden })
  const [sichtbar, setSichtbar] = useState(false)
  const [verlauf, setVerlauf] = useState<Array<[number, number]> | null>(null)
  const [jetzt, setJetzt] = useState(0)
  useEffect(() => ladenBeobachten(() => setStand({ ...laden })), [])
  const szeneAb = stand.szeneAb
  useEffect(() => { if (szeneAb !== null) setVerlauf(szeneVerlauf()) }, [szeneAb])
  // für die Szene jedes Bild neu; gezählt wird die Zeit, in der er sichtbar läuft: baut der Browser die Szene und
  // steht still, springt der Balken danach nicht, sondern läuft weiter, wo er war (höchstens 150 ms je Bild)
  useEffect(() => {
    if (szeneAb === null) return
    let nr = 0, vorher = performance.now(), gelaufen = 0
    setJetzt(0)
    const schritt = (z: number) => {
      gelaufen += Math.min(150, Math.max(0, z - vorher))
      vorher = z
      setJetzt(gelaufen)
      nr = requestAnimationFrame(schritt)
    }
    nr = requestAnimationFrame(schritt)
    return () => cancelAnimationFrame(nr)
  }, [szeneAb])
  const offen = stand.begonnen > stand.fertig
  // jetzt: so lange läuft der Balken für diese Szene schon sichtbar, Millisekunden
  const t = jetzt / SZENE_MS
  const szeneLaeuft = szeneAb !== null && (t < 1 || offen)
  useEffect(() => {
    if (szeneAb !== null && !szeneLaeuft) {
      // fertig: voll stehen lassen, dann weg
      const uhr = window.setTimeout(() => { szeneFertig(); setStand({ ...laden }) }, VOLL_MS)
      return () => window.clearTimeout(uhr)
    }
  }, [szeneAb, szeneLaeuft])
  const aktiv = offen || szeneAb !== null
  useEffect(() => {
    const uhr = window.setTimeout(() => setSichtbar(aktiv), aktiv ? (szeneAb !== null ? 0 : NACH_MS) : VOLL_MS)
    return () => window.clearTimeout(uhr)
  }, [aktiv, szeneAb])
  if (!sichtbar && szeneAb === null) return null
  let anteil: number
  if (szeneAb !== null && verlauf) {
    anteil = !szeneLaeuft ? 1 : t < 1 ? beiZeit(verlauf, Math.max(0, t)) : 0.93 + 0.05 * (1 - Math.exp(-(t - 1)))
  } else anteil = offen ? Math.max(0.08, stand.fertig / stand.begonnen) : 1
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1.5" role="progressbar" aria-label="Wird geladen"
         aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(anteil * 100)}>
      <div className="h-full bg-sbb-red" style={{ width: `${anteil * 100}%`, transition: szeneAb !== null ? 'none' : 'width 200ms ease-out' }} />
    </div>
  )
}
