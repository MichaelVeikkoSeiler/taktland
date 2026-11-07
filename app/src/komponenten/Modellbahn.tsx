import { useEffect, useMemo, useState } from 'react'
import { fahrtZiele, namenFuerFahrt } from '../daten'
import type { BahnhofIndex } from '../typen'
import { reliefListe } from '../relief'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'
import type { StreckenWahl } from './Strecke'
import { Probefahrten, RichtungKnoepfe } from './Probefahrten'
import { ModellHinweis } from './ModellHinweis'
import { Klappe } from './Klappe'

/**
 * Das Spiel «Modellbahn» (Michael, 2026-10-08: «neues Spiel 3D/VR … dort kann man alle Strecken abbilden»): jede
 * Strecke als Modell zum Drehen auf dem Bildschirm und, wo der Browser eine Brille meldet, in der Brille. Hier ist
 * nicht alles wie in der Wirklichkeit; darum steht es unter Spiele und nicht unter Fahren, wo es keine Brille gibt. Seit
 * 2026-10-16 auch die Probefahrten (Michael: «Probefahren unter den Spielen bei Modellbahn zusammenführen»).
 */
export function Modellbahn({ index }: { index: BahnhofIndex | null }) {
  const [liste, setListe] = useState<Awaited<ReturnType<typeof reliefListe>> | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => { reliefListe(true).then(setListe).catch((e: Error) => setFehler(e.message)) }, [])
  const [offen, setOffen] = useState<string | null>(null)
  const imNetz = useMemo(() => fahrtZiele(index), [index])
  const namen = useMemo(() => {
    const m = new Map((index?.bahnhoefe ?? []).map((b) => [b.uic, b.name]))
    for (const [u, n] of namenFuerFahrt(index)) if (!m.has(u)) m.set(u, n)
    return m
  }, [index])
  const name = (u: number | null) => (u === null ? '' : namen.get(u) ?? String(u))
  const text = (f: StreckenWahl) => `${name(f.von)} → ${name(f.nach)}${f.ueber ? ` (über ${name(f.ueber)})` : ''}`
  return (
    <div className="px-4 pb-4">
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Modellbahn</h1>
      <p className="mt-2 leading-relaxed">
        Eine Strecke in 3D im Gelände: «Probefahren» fährt den Zug von A nach B, bis etwa 200 km mit der ganzen Strecke als Modell zum
        Drehen und Zoomen. Mit einer Brille wie der Meta Quest steht das Modell vor dir auf dem Tisch.
      </p>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        «Führerstand» setzt dich vorne in den Zug, die Leuchtknöpfe am Pult schalten Zuggeräusch, Stirnlicht, Signalhorn, Dämmerung und was
        gemeldet wird. Zu sehen ist das echte Wetter der nächsten Station von MeteoSchweiz; leuchtet der Sonnenschalter, ist Schönwetter.
      </p>

      <a href="#/modellbahn/strecke" className="kachel kachel-link mt-5 flex min-h-11 items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0">
          <span className="block font-medium">Eigene Strecke</span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">Von, nach und über wählen</span>
        </span>
        <span className="pfeil shrink-0" aria-hidden="true">→</span>
      </a>

      {index && <Probefahrten imNetz={imNetz} name={name} />}

      <h2 className="mt-8 text-xl font-bold tracking-tight">Bergstrecken und weitere</h2>
      {fehler && <Ladefehler className="mt-4" was="Die Liste konnte nicht geladen werden." fehler={fehler} />}
      {!liste && !fehler && <p className="mt-4 text-sbb-metal">Wird geladen …</p>}
      {liste && (
        <ul className="kachelliste mt-4">
          {liste.map((r) => {
            const auf = offen === r.name
            const p = r.probefahrt
            return (
              <li key={r.name}>
                <button type="button" onClick={() => setOffen(auf ? null : r.name)} aria-expanded={auf}
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left
                                   hover:bg-sbb-milk dark:hover:bg-sbb-charcoal">
                  <span className="min-w-0">
                    <span className="block font-medium">{r.titel}</span>
                    <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                      {(r.linien ?? [r.linie]).length > 1 ? 'Linien' : 'Linie'} {(r.linien ?? [r.linie]).join(' und ')}
                    </span>
                  </span>
                  <span className={`pfeil shrink-0 ${auf ? 'pfeil-oben' : 'pfeil-unten'}`} aria-hidden="true">{auf ? '↑' : '↓'}</span>
                </button>
                {auf && (
                  <div className="grid gap-3 px-3 pb-3">
                    {/* als Probefahrt beginnt sie gleich in 3D (früher unter «Probefahren», Bergstrecken) */}
                    {p && [p, { von: p.nach, nach: p.von, ueber: p.ueber }].map((w) => (
                      <RichtungKnoepfe key={`${w.von}-${w.nach}`} w={w} text={text(w)} />
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {/* unten nach den Strecken, man liest ihn nicht jedes Mal (Michael, 2026-10-09) */}
      <Klappe className="mt-8" titel="Was am Modell nicht stimmt"><ModellHinweis /></Klappe>
      <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
        Gelände aus swissALTIRegio, im Führerstand nah am Zug aus swissALTI3D, Luftbild SWISSIMAGE (alle swisstopo). Weitere Zugmodelle folgen.
      </p>
    </div>
  )
}
