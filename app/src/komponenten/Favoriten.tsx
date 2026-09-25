import { useEffect, useMemo, useState } from 'react'
import { favoritEinsetzen, favoritEntfernen, useFavoriten } from '../favoriten'
import { kantonText } from '../kanton'
import type { BahnhofIndex, IndexEintrag } from '../typen'
import { vereinfachen } from './Blaettern'
import { Eintrag, Suchfeld } from './Suche'

/** So viele Treffer zeigt die Suche hier */
const TREFFER = 8
/** So lange lässt sich ein Entfernen rückgängig machen */
const RUECKGAENGIG_MS = 8000

/**
 * Favoritenbahnhöfe in der Reisetasche (Michael, 2026-09-25). Dazu kommen sie
 * über dieselbe Suche wie unter «Bahnhöfe»; sie stehen dann in jeder
 * Bahnhofsuche oben. Entfernen geht ohne Rückfrage, dafür mit «Rückgängig».
 */
export function Favoriten({ index, oeffnen }: { index: BahnhofIndex | null; oeffnen: (uic: number) => void }) {
  const favoriten = useFavoriten()
  const [begriff, setBegriff] = useState('')
  const [entfernt, setEntfernt] = useState<{ uic: number; name: string; stelle: number } | null>(null)

  const nachUic = useMemo(() => new Map((index?.bahnhoefe ?? []).map((e) => [e.uic, e])), [index])
  const liste = favoriten.map((u) => nachUic.get(u)).filter((e): e is IndexEintrag => !!e)

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

  function entfernen(e: IndexEintrag) {
    setEntfernt({ uic: e.uic, name: e.name, stelle: favoriten.indexOf(e.uic) })
    favoritEntfernen(e.uic)
  }

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Favoriten</h1>
      <p className="mt-2 leading-relaxed">
        Bahnhöfe, die du oft brauchst. Sie stehen in jeder Bahnhofsuche oben, sobald das Feld
        leer ist: unter Bahnhöfe, bei der Strecke, im Fahrtmodus und im Logbuch. Ein Tipp auf
        den Stern nimmt einen Bahnhof auf oder wieder heraus. Die Favoriten bleiben auf diesem
        Gerät.
      </p>

      <div className="mt-5">
        <Suchfeld begriff={begriff} aendern={setBegriff} />
      </div>
      {begriff.trim() && (
        treffer.length === 0 ? (
          <p className="mt-3 text-sbb-metal dark:text-sbb-storm">Kein Bahnhof gefunden.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {treffer.map((e) => <Eintrag key={e.uic} e={e} oeffnen={oeffnen} favorit={favoriten.includes(e.uic)} />)}
          </ul>
        )
      )}

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
          Noch keine Favoriten. Such oben einen Bahnhof und tipp auf den Stern daneben. Das geht
          auch in der Liste unter Bahnhöfe und in jedem Feld, in das man einen Bahnhof tippt.
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
    </div>
  )
}
