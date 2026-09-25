import { useEffect, useMemo, useState } from 'react'
import { alphabetisch, favoritEinsetzen, favoritEntfernen, favoritHinzufuegen, useFavoriten } from '../favoriten'
import { kantonText } from '../kanton'
import type { BahnhofIndex, IndexEintrag } from '../typen'
import { vereinfachen } from './Blaettern'
import { Stern } from './Stern'
import { Suchfeld } from './Suche'

/** So viele Treffer zeigt die Suche hier */
const TREFFER = 8
/** So lange lässt sich ein Entfernen rückgängig machen */
const RUECKGAENGIG_MS = 8000

/**
 * Favoritenbahnhöfe in der Reisetasche (Michael, 2026-09-25). Dazu kommen sie
 * über die Kachel «+ Bahnhof hinzufügen» unter der Liste, die dasselbe Suchfeld
 * wie unter «Bahnhöfe» öffnet; sie stehen dann in jeder Bahnhofsuche oben.
 * Entfernen geht ohne Rückfrage, dafür mit «Rückgängig».
 */
export function Favoriten({ index, oeffnen }: { index: BahnhofIndex | null; oeffnen: (uic: number) => void }) {
  const favoriten = useFavoriten()
  const [begriff, setBegriff] = useState('')
  const [suchen, setSuchen] = useState(false)
  const [entfernt, setEntfernt] = useState<{ uic: number; name: string; stelle: number } | null>(null)

  const nachUic = useMemo(() => new Map((index?.bahnhoefe ?? []).map((e) => [e.uic, e])), [index])
  const liste = alphabetisch(favoriten.map((u) => nachUic.get(u)).filter((e): e is IndexEintrag => !!e))

  const treffer = useMemo(() => {
    const b = vereinfachen(begriff.trim())
    if (!b || !index) return []
    return index.bahnhoefe
      .filter((e) => vereinfachen(e.name).includes(b))
      .sort((x, y) => Number(!vereinfachen(x.name).startsWith(b)) - Number(!vereinfachen(y.name).startsWith(b))
        || (y.dwv ?? 0) - (x.dwv ?? 0))
      .slice(0, TREFFER)
  }, [begriff, index])

  useEffect(() => {
    if (!entfernt) return
    const uhr = setTimeout(() => setEntfernt(null), RUECKGAENGIG_MS)
    return () => clearTimeout(uhr)
  }, [entfernt])

  function nehmen(e: IndexEintrag) {
    favoritHinzufuegen(e.uic)
    setBegriff('')
    setSuchen(false)
  }

  function entfernen(e: IndexEintrag) {
    setEntfernt({ uic: e.uic, name: e.name, stelle: favoriten.indexOf(e.uic) })
    favoritEntfernen(e.uic)
  }

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Favoriten</h1>
      <p className="mt-2 leading-relaxed">
        Bahnhöfe, die du oft brauchst. Sie stehen in jeder Bahnhofsuche oben, sobald das Feld
        leer ist: unter Bahnhöfe, bei der Strecke, im Fahrtmodus und im Logbuch. Neue kommen
        unten mit «+» dazu, in jeder Bahnhofsuche auch mit dem Stern. Die Favoriten bleiben auf
        diesem Gerät.
      </p>

      <h2 className="mt-8 text-lg font-bold">
        {liste.length === 0 ? 'Deine Favoriten' : `Deine Favoriten (${liste.length})`}
      </h2>

      {entfernt && (
        <div role="status" className="kachel mt-3 flex items-center justify-between gap-3 py-1 pl-4 pr-1">
          <span className="min-w-0">{entfernt.name} entfernt.</span>
          <button type="button"
                  onClick={() => { favoritEinsetzen(entfernt.uic, entfernt.stelle); setEntfernt(null) }}
                  className="min-h-11 shrink-0 rounded-lg px-3 font-bold text-sbb-red hover:bg-sbb-silver
                             dark:hover:bg-sbb-iron">
            Rückgängig
          </button>
        </div>
      )}

      {liste.length === 0 ? (
        <p className="mt-3 leading-relaxed text-sbb-metal dark:text-sbb-storm">
          Noch keine Favoriten. Tipp unten auf «+ Bahnhof hinzufügen» und wähl einen Bahnhof.
          Das geht auch mit dem Stern in der Liste unter Bahnhöfe und in jedem Feld, in das man
          einen Bahnhof tippt.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {liste.map((e) => (
            <li key={e.uic} className="kachel flex items-stretch overflow-hidden">
              <button type="button" disabled={e.sprachen.length === 0} onClick={() => oeffnen(e.uic)}
                      className="kachel-link flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3
                                 py-3 pl-4 pr-1 text-left disabled:cursor-default">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.name}</span>
                  {e.kanton && (
                    <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{kantonText(e.kanton)}</span>
                  )}
                </span>
                {e.sprachen.length > 0 && <span className="pfeil shrink-0" aria-hidden="true">→</span>}
              </button>
              <button type="button" onClick={() => entfernen(e)} aria-label={`${e.name} aus den Favoriten entfernen`}
                      title="Aus den Favoriten entfernen"
                      className="flex min-h-11 w-12 shrink-0 items-center justify-center text-xl text-sbb-metal
                                 hover:bg-sbb-silver hover:text-sbb-black dark:text-sbb-storm
                                 dark:hover:bg-sbb-iron dark:hover:text-sbb-white">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* unter der Liste: neuen Favoriten wählen (Michael, 2026-09-25) */}
      {suchen ? (
        <div className="kachel mt-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Bahnhof hinzufügen</p>
            <button type="button" onClick={() => { setSuchen(false); setBegriff('') }}
                    className="min-h-11 rounded-lg px-3 text-sm font-medium hover:bg-sbb-silver dark:hover:bg-sbb-iron">
              Abbrechen
            </button>
          </div>
          <div className="mt-2">
            <Suchfeld begriff={begriff} aendern={setBegriff} fokus />
          </div>
          {begriff.trim() && (
            treffer.length === 0 ? (
              <p className="mt-3 text-sbb-metal dark:text-sbb-storm">Kein Bahnhof gefunden.</p>
            ) : (
              <ul className="mt-2">
                {treffer.map((e) => {
                  const schon = favoriten.includes(e.uic)
                  return (
                    <li key={e.uic}>
                      <button type="button" disabled={schon} onClick={() => nehmen(e)}
                              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2
                                         text-left hover:bg-sbb-silver disabled:cursor-default
                                         disabled:hover:bg-transparent dark:hover:bg-sbb-iron">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{e.name}</span>
                          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                            {schon ? 'schon ein Favorit' : e.kanton ? kantonText(e.kanton) : ''}
                          </span>
                        </span>
                        <Stern voll={schon} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setSuchen(true)}
                className="kachel kachel-link mt-2 flex min-h-11 w-full items-center gap-3 px-4 py-4 text-left font-medium">
          <span className="text-2xl leading-none text-sbb-red" aria-hidden="true">+</span>
          Bahnhof hinzufügen
        </button>
      )}
    </div>
  )
}
