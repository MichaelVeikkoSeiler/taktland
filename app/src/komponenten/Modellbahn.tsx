import { useEffect, useState } from 'react'
import { reliefListe } from '../relief'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'

/**
 * Das Spiel «Modellbahn» (Michael, 2026-10-08: «neues Spiel 3D/VR … dort kann man alle Strecken abbilden»): jede
 * Strecke als Modell zum Drehen auf dem Bildschirm und, wo der Browser eine Brille meldet, in der Brille. Hier ist
 * nicht alles wie in der Wirklichkeit; darum steht es unter Spiele und nicht unter Fahren, wo es keine Brille gibt.
 */
export function Modellbahn() {
  const [liste, setListe] = useState<Awaited<ReturnType<typeof reliefListe>> | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => { reliefListe(true).then(setListe).catch((e: Error) => setFehler(e.message)) }, [])
  return (
    <div className="px-4 pb-4">
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Modellbahn</h1>
      <p className="mt-2 leading-relaxed">
        Eine Strecke als Modell im Gelände: drehen, zoomen und einen Zug darüber fahren lassen. Mit einer Brille wie der
        Meta Quest steht das Modell vor dir auf dem Tisch.
      </p>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Ein Modell, kein Abbild der Wirklichkeit: Zug, Gleise und Masten sind nicht massstäblich, die Fahrt ist ein
        Zeitraffer. Beim Fahren unter «Fahren» bleibt alles bei den Daten.
      </p>

      <a href="#/modellbahn/strecke" className="kachel kachel-link mt-5 flex min-h-11 items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0">
          <span className="block font-medium">Eigene Strecke</span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">Von, nach und über wählen, bis etwa 170 km</span>
        </span>
        <span className="pfeil shrink-0" aria-hidden="true">→</span>
      </a>

      <h2 className="mt-8 text-xl font-bold tracking-tight">Bergstrecken und weitere</h2>
      {fehler && <Ladefehler className="mt-4" was="Die Liste konnte nicht geladen werden." fehler={fehler} />}
      {!liste && !fehler && <p className="mt-4 text-sbb-metal">Wird geladen …</p>}
      {liste && (
        <ul className="kachelliste mt-4">
          {liste.map((r) => (
            <li key={r.name}>
              <a href={`#/modellbahn/${r.name}`}
                 className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-sbb-milk dark:hover:bg-sbb-charcoal">
                <span className="min-w-0">
                  <span className="block font-medium">{r.titel}</span>
                  <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                    {(r.linien ?? [r.linie]).length > 1 ? 'Linien' : 'Linie'} {(r.linien ?? [r.linie]).join(' und ')}
                  </span>
                </span>
                <span className="pfeil shrink-0" aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
        Gelände aus swissALTIRegio, Luftbild SWISSIMAGE (beide swisstopo). Weitere Zugmodelle folgen.
      </p>
    </div>
  )
}
