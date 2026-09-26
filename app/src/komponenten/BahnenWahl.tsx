import { useEffect, useState } from 'react'
import { bahnenAusSetzen, bahnenImNetz, useBahnenAus } from '../bahnen'
import { streckenLaden } from '../daten'
import type { StreckenNetz } from '../typen'

/**
 * Die Auswahl «Bahnen»: auf welchen Bahnen der Weg liegen darf (Michael,
 * 2026-09-26). Zu Beginn alle; die Wahl bleibt auf diesem Gerät und gilt für
 * «Strecke», «Fahren» und das Fahrtblatt. Die Abkürzungen stehen so in den Quellen.
 */
export function BahnenWahl({ netz: gegeben = null }: { netz?: StreckenNetz | null }) {
  const aus = useBahnenAus()
  const [netz, setNetz] = useState<StreckenNetz | null>(gegeben)
  useEffect(() => {
    if (gegeben) { setNetz(gegeben); return }
    let ab = false
    streckenLaden().then((n) => { if (!ab) setNetz(n) }).catch(() => { /* ohne Netz keine Auswahl */ })
    return () => { ab = true }
  }, [gegeben])
  if (!netz) return null
  const bahnen = bahnenImNetz(netz)
  const erlaubt = bahnen.filter((b) => !aus.has(b))
  const text = erlaubt.length === bahnen.length ? 'alle'
    : erlaubt.length <= 3 ? `nur ${erlaubt.join(', ') || 'keine'}` : `ohne ${bahnen.filter((b) => aus.has(b)).join(', ')}`

  function umschalten(b: string) {
    const neu = new Set(aus)
    if (neu.has(b)) neu.delete(b); else neu.add(b)
    bahnenAusSetzen(neu)
  }

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                          dark:text-sbb-storm dark:hover:text-sbb-white">
        Bahnen: {text}
      </summary>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Der Weg nimmt nur Strecken der gewählten Bahnen. Die Abkürzungen stehen so in den Quellen
        (Zugzahlen der SBB, Schienennetz des BAV).
      </p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Bahnen für den Weg">
        {bahnen.map((b) => {
          const an = !aus.has(b)
          return (
            <button key={b} type="button" aria-pressed={an} onClick={() => umschalten(b)}
                    className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium ${an
                      ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                      : 'border border-sbb-cloud bg-white text-sbb-metal line-through dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-storm'}`}>
              {b}
            </button>
          )
        })}
      </div>
      {aus.size > 0 && (
        <button type="button" onClick={() => bahnenAusSetzen(new Set())}
                className="mt-2 text-sm text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                           dark:text-sbb-storm dark:hover:text-sbb-white">
          Alle Bahnen wieder zulassen
        </button>
      )}
    </details>
  )
}
