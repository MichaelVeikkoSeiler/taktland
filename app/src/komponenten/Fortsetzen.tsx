import { useEffect, useState } from 'react'
import { leereFahrtenWeg } from '../erlebt'
import { tonBereitlegen } from '../fahrt'
import { laufendBeobachten, laufendEnde, laufendHier, laufendLesen } from '../laufend'
import { fahrtAdresse } from './Strecke'

const uhrzeit = (ms: number) => new Date(ms).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })

/**
 * Hat das Handy die Seite während einer Fahrt geschlossen, fragt Taktland beim
 * nächsten Öffnen, ob sie weitergehen soll (Michael, 2026-09-26). Was zwischen
 * der letzten gemerkten Stelle und dem neuen Standort liegt, zählt dann als
 * durchfahren, wie nach einer Pause im Hintergrund.
 */
export function Fortsetzen() {
  const lesen = () => (laufendHier() ? null : laufendLesen())
  const [laufend, setLaufend] = useState(lesen)
  useEffect(() => laufendBeobachten(() => setLaufend(lesen())), [])
  if (!laufend) return null

  return (
    <div className="print:hidden mx-4 mt-4 rounded-lg bg-sbb-milk px-4 py-3 dark:bg-sbb-charcoal" role="region"
         aria-label="Laufende Fahrt">
      <p className="font-bold">Fahrt {laufend.ohne ? `ohne Ziel ab ${laufend.titel.split(' → ')[0]}` : laufend.titel} fortsetzen?</p>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
        Begonnen um {uhrzeit(laufend.beginn)}, zuletzt gemerkt um {uhrzeit(laufend.zeit)}
        {laufend.zug ? `, im ${laufend.zug.text}` : ''}. Was seither am Weg lag, zählt als durchfahren.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            // der Ton braucht den Tipp; die Seite «Strecke» holt ihn beim Start ab
            tonBereitlegen()
            window.location.hash = laufend.ohne ? '#/ohneziel'
              : fahrtAdresse({ von: laufend.von, nach: laufend.nach, ueber: laufend.ueber }, 'weiter')
          }}
          className="rounded-lg bg-sbb-red px-4 py-2 font-bold text-white hover:bg-sbb-red125"
        >
          Fortsetzen
        </button>
        <button
          type="button" onClick={() => { laufendEnde(); leereFahrtenWeg() }}
          className="rounded-lg border border-sbb-cloud bg-white px-4 py-2 font-medium hover:border-sbb-black
                     dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white"
        >
          Fahrt beenden
        </button>
      </div>
    </div>
  )
}
