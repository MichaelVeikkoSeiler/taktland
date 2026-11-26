import { useEffect, useState } from 'react'
import { bahnenAusSetzen, bahnenImNetz, useBahnenAus } from '../bahnen'
import { streckenLaden } from '../daten'
import type { StreckenNetz } from '../typen'

/**
 * Die Auswahl «Bahnen»: auf welchen Bahnen der Weg liegen darf (Michael,
 * 2026-09-26). Zu Beginn alle; die Wahl bleibt auf diesem Gerät und gilt für
 * «Strecke», «Fahren» und das Fahrtblatt. Die Abkürzungen stehen so in den Quellen.
 */
export function BahnenWahl({ netz: gegeben = null, offen = false }: { netz?: StreckenNetz | null; offen?: boolean }) {
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

  // offen statt eingeklappt, kleiner und nebeneinander, mit «Alle» und «Keine» (Michael, 2026-11-26, Fahrtblatt: «Die Bahnen nicht eingeklappt sondern offen
  // nebeneinander und etwas kleiner. Man soll alle zusammen anwählen oder abwählen oder auch einzeln auswählen oder abwählen können. Default alle aktiv»)
  if (offen) {
    const klein = 'min-h-8 rounded-lg px-2 py-1 text-xs font-medium'
    return (
      <div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Bahnen für den Weg">
          <span className="mr-1 text-sm font-bold">Bahnen</span>
          <button type="button" disabled={aus.size === 0} onClick={() => bahnenAusSetzen(new Set())}
                  className={`${klein} border border-sbb-cloud bg-white font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight`}>Alle</button>
          <button type="button" disabled={erlaubt.length === 0} onClick={() => bahnenAusSetzen(new Set(bahnen))}
                  className={`${klein} mr-1 border border-sbb-cloud bg-white font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight`}>Keine</button>
          {bahnen.map((b) => {
            const an = !aus.has(b)
            return (
              <button key={b} type="button" aria-pressed={an} onClick={() => umschalten(b)}
                      className={`${klein} ${an
                        ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                        : 'border border-sbb-cloud bg-white text-sbb-metal line-through dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-storm'}`}>
                {b}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-xs text-sbb-metal dark:text-sbb-storm">
          {erlaubt.length === 0 ? 'Keine Bahn gewählt: Wähle mindestens eine, sonst gibt es keinen Weg. '
            : ''}Der Weg nimmt nur Strecken der gewählten Bahnen. Die Abkürzungen stehen so in den Quellen (Zugzahlen der SBB, Schienennetz des BAV).
        </p>
      </div>
    )
  }

  return (
    <details className="klapp group">
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
