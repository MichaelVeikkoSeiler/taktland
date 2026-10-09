import { useEffect, useMemo, useState } from 'react'
import { gemerktLesen, type GemerkteFahrt, probefahrtEinsetzen, probefahrtUmschalten } from '../fahrten'
import { namenFuerFahrt } from '../daten'
import type { BahnhofIndex } from '../typen'
import { reliefListe } from '../relief'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'
import { streckenAdresse } from './Strecke'
import Wischen from './Wischen'
import { ModellHinweis } from './ModellHinweis'

/**
 * Das Spiel «Modellbahn» (Michael, 2026-10-08: «neues Spiel 3D/VR … dort kann man alle Strecken abbilden»): jede
 * Strecke als Modell zum Drehen auf dem Bildschirm und, wo der Browser eine Brille meldet, in der Brille. Hier ist
 * nicht alles wie in der Wirklichkeit; darum steht es unter Spiele und nicht unter Fahren, wo es keine Brille gibt.
 */
export function Modellbahn({ index }: { index: BahnhofIndex | null }) {
  const [liste, setListe] = useState<Awaited<ReturnType<typeof reliefListe>> | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => { reliefListe(true).then(setListe).catch((e: Error) => setFehler(e.message)) }, [])
  // die eigenen Probefahrten aus «Fahren» gleich als Modell (Michael, 2026-10-08)
  // wie unter Probefahren (Michael, 2026-10-08: «Funktionen … mit löschen»): aufklappen und Richtung wählen,
  // × oder nach links wischen löscht, «Rückgängig» holt sie zurück
  const [probefahrten, setProbefahrten] = useState(() => gemerktLesen().probefahrten)
  const [offen, setOffen] = useState<string | null>(null)
  const [entfernt, setEntfernt] = useState<{ f: GemerkteFahrt; stelle: number } | null>(null)
  useEffect(() => {
    if (!entfernt) return
    const uhr = setTimeout(() => setEntfernt(null), 8000)
    return () => clearTimeout(uhr)
  }, [entfernt])
  const loeschen = (f: GemerkteFahrt, stelle: number) => {
    setEntfernt({ f, stelle }); setProbefahrten(probefahrtUmschalten(f).probefahrten)
  }
  const namen = useMemo(() => {
    const m = new Map((index?.bahnhoefe ?? []).map((b) => [b.uic, b.name]))
    for (const [u, n] of namenFuerFahrt(index)) if (!m.has(u)) m.set(u, n)
    return m
  }, [index])
  const name = (u: number | null) => (u === null ? '' : namen.get(u) ?? String(u))
  const text = (f: GemerkteFahrt) => `${name(f.von)} – ${name(f.nach)}${f.ueber ? ` (über ${name(f.ueber)})` : ''}`
  return (
    <div className="px-4 pb-4">
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Modellbahn</h1>
      <p className="mt-2 leading-relaxed">
        Eine Strecke als Modell im Gelände: drehen, zoomen und einen Zug darüber fahren lassen. Mit einer Brille wie der
        Meta Quest steht das Modell vor dir auf dem Tisch.
      </p>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        «Zug fahren» schickt den Zug in 2,5 Minuten über das ganze Modell. Eine Fahrt wie unterwegs, mit Karte, Meldungen und
        wählbarem Tempo, ist <a href="#/fahrt/probe" className="underline underline-offset-2">Probefahren</a> unter Fahren.
      </p>

      <a href="#/modellbahn/strecke" className="kachel kachel-link mt-5 flex min-h-11 items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0">
          <span className="block font-medium">Eigene Strecke</span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">Von, nach und über wählen, bis etwa 200 km</span>
        </span>
        <span className="pfeil shrink-0" aria-hidden="true">→</span>
      </a>

      {(probefahrten.length > 0 || entfernt) && index && (
        <>
          <h2 className="mt-8 text-xl font-bold tracking-tight">Deine Probefahrten</h2>
          {entfernt && (
            <div role="status" className="kachel mt-4 flex items-center justify-between gap-3 py-1 pl-4 pr-1">
              <span className="min-w-0">{text(entfernt.f)} entfernt.</span>
              <button type="button"
                      onClick={() => { setProbefahrten(probefahrtEinsetzen(entfernt.f, entfernt.stelle).probefahrten); setEntfernt(null) }}
                      className="min-h-11 shrink-0 rounded-lg px-3 font-bold text-sbb-red hover:bg-sbb-silver dark:hover:bg-sbb-iron">
                Rückgängig
              </button>
            </div>
          )}
          <ul className="kachelliste mt-4">
            {probefahrten.map((f, i) => {
              const k = `${f.von}-${f.nach}-${f.ueber ?? ''}`
              const auf = offen === k
              return (
                <li key={k}>
                  <Wischen frage={`Probefahrt ${text(f)} löschen?`} loeschen={() => loeschen(f, i)}>
                    <div className="flex items-stretch">
                      <button type="button" onClick={() => setOffen(auf ? null : k)} aria-expanded={auf}
                              className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left
                                         hover:bg-sbb-milk dark:hover:bg-sbb-charcoal">
                        <span className="min-w-0 font-medium">{text(f)}</span>
                        <span className={`pfeil shrink-0 ${auf ? 'pfeil-oben' : 'pfeil-unten'}`} aria-hidden="true">
                          {auf ? '↑' : '↓'}
                        </span>
                      </button>
                      <button type="button" aria-label={`${text(f)} aus den Probefahrten entfernen`}
                              title="Aus den Probefahrten entfernen" onClick={() => loeschen(f, i)}
                              className="flex min-h-11 w-12 shrink-0 items-center justify-center border-l border-sbb-cloud text-xl
                                         text-sbb-metal hover:bg-sbb-milk hover:text-sbb-black dark:border-sbb-iron dark:text-sbb-storm
                                         dark:hover:bg-sbb-charcoal dark:hover:text-sbb-white">
                        ×
                      </button>
                    </div>
                  </Wischen>
                  {auf && (
                    <div className="grid gap-2 px-3 pb-3">
                      {[f, { von: f.nach, nach: f.von, ueber: f.ueber }].map((w) => (
                        <a key={`${w.von}-${w.nach}`} href={`${streckenAdresse(w).replace('#/strecke', '#/modellbahn/strecke')}&fest=1`}
                           className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2
                                      hover:bg-sbb-milk dark:bg-sbb-midnight dark:hover:bg-sbb-charcoal">
                          <span className="min-w-0 font-medium">{name(w.von)} → {name(w.nach)}{w.ueber ? ` (über ${name(w.ueber)})` : ''}</span>
                          <span className="shrink-0 text-sm font-bold text-sbb-red">Als Modell</span>
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
            Dieselbe Liste wie unter Probefahren; was du hier löschst, fehlt auch dort. Als Modell bis etwa 200 km.
          </p>
        </>
      )}

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
      {/* unten nach den Strecken, man liest ihn nicht jedes Mal (Michael, 2026-10-09) */}
      <div className="mt-8"><ModellHinweis /></div>
      <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
        Gelände aus swissALTIRegio, im Führerstand nah am Zug aus swissALTI3D, Luftbild SWISSIMAGE (alle swisstopo). Weitere Zugmodelle folgen.
      </p>
    </div>
  )
}
