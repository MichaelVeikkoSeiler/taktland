import { useEffect, useState } from 'react'
import { balkenInKarte, laden, ladenBeobachten, SZENE_MS, szeneFertig } from '../daten'

/** erst nach so vielen Millisekunden zeigen: was schneller lädt, soll nicht aufblitzen */
const NACH_MS = 250
/** voll stehen lassen, bevor er verschwindet */
const VOLL_MS = 300

/**
 * Ladebalken, seit 2026-11-17 ein drehender Ring in der Mitte (Michael, 2026-10-10: «Egal wo, wenn irgendwo etwas am Laden ist, soll eine Progressbar erscheinen»).
 * Oben in der App füllt er sich mit dem Anteil der Dateien, die seit dem letzten Stillstand fertig geladen sind (laden in
 * daten.ts); wie gross eine Datei ist, weiss er nicht. Eine 3D-Szene zeigt er in ihrer Karte ganz oben (inKarte), nur wo
 * keine Karte einen hat, oben in der App: mindestens SZENE_MS von 0 bis 100 % in unregelmässigen Schritten, ein Spiel,
 * keine Messung; lädt danach noch etwas, kriecht er weiter, bis alles da ist.
 */
export function Ladebalken({ inKarte = false }: { inKarte?: boolean }) {
  const [stand, setStand] = useState({ ...laden })
  const [sichtbar, setSichtbar] = useState(false)
  const [jetzt, setJetzt] = useState(0)
  useEffect(() => ladenBeobachten(() => setStand({ ...laden })), [])
  useEffect(() => {
    if (!inKarte) return
    balkenInKarte(1)
    return () => balkenInKarte(-1)
  }, [inKarte])
  // die Szene gehört dem Balken in der Karte, wo es einen gibt
  const meineSzene = inKarte || stand.inKarte === 0
  const szeneAb = meineSzene ? stand.szeneAb : null
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
      const uhr = window.setTimeout(() => { szeneFertig() }, VOLL_MS)
      return () => window.clearTimeout(uhr)
    }
  }, [szeneAb, szeneLaeuft])
  // oben in der App ruht er, solange eine Karte die Szene zeigt; in der Karte zeigt er nur die Szene
  const fremdeSzene = !meineSzene && stand.szeneAb !== null
  const aktiv = szeneAb !== null || (!inKarte && !fremdeSzene && offen)
  useEffect(() => {
    const uhr = window.setTimeout(() => setSichtbar(aktiv), aktiv ? (szeneAb !== null ? 0 : NACH_MS) : VOLL_MS)
    return () => window.clearTimeout(uhr)
  }, [aktiv, szeneAb])
  if (!sichtbar && szeneAb === null) return null
  if (fremdeSzene) return null
  // statt eines Balkens ein Ring in der Mitte, der sich dreht, ohne Ende (Michael, 2026-11-17: «Eine Progressbar suggeriert dass es fertig gerechnet hat
  // wenn es rechts ankommt. Ein kreisendes Objekt in der Mitte lässt das Ende offen»); wann er erscheint und verschwindet, bleibt wie beim Balken
  const gross = inKarte || szeneAb !== null
  return (
    <div className={`pointer-events-none ${inKarte ? 'absolute z-10' : 'fixed z-50'} inset-0 flex items-center justify-center`} role="status"
         aria-label={szeneAb !== null ? 'Das Modell wird geladen' : 'Wird geladen'}>
      <svg viewBox="0 0 48 48" className={`${gross ? 'h-12 w-12' : 'h-9 w-9'} animate-spin drop-shadow-[0_0_3px_rgba(0,0,0,0.35)]`}
           style={{ animationDuration: '0.9s' }} aria-hidden="true">
        <circle cx="24" cy="24" r="19" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="5" />
        <circle cx="24" cy="24" r="19" fill="none" className="stroke-sbb-red" strokeWidth="5" strokeLinecap="round" strokeDasharray="36 120" />
      </svg>
    </div>
  )
}
