import { useEffect, useState } from 'react'
import { tonBereitlegen } from '../fahrt'
import {
  gemerktLesen, type GemerkteFahrt, probefahrtEinsetzen, probefahrtUmschalten, probefahrtVerschieben,
} from '../fahrten'
import type { IndexEintrag } from '../typen'
import { BahnhofFeld, fahrtAdresse, streckenAdresse, type StreckenWahl } from './Strecke'
import Wischen from './Wischen'

/** Eine Probefahrt starten: die Seite «Strecke» öffnet gleich den Fahrtmodus; der Ton braucht den Tipp */
export function probeStarten(w: StreckenWahl) {
  tonBereitlegen()
  window.location.hash = fahrtAdresse(w, true)
}

/** Dieselbe Strecke als Modell, nur zum Ansehen (fest=1) */
export const modellAdresse = (w: StreckenWahl) => `${streckenAdresse(w).replace('#/strecke', '#/modellbahn/strecke')}&fest=1`

const unterKnopf = `flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-left
                    hover:bg-sbb-milk dark:bg-sbb-midnight dark:hover:bg-sbb-charcoal`

/** Je Richtung zwei Wege: abspielen wie unterwegs oder als Modell */
export function RichtungKnoepfe({ w, text, vorher }: { w: StreckenWahl; text: string; vorher?: () => void }) {
  return (
    <div className="grid gap-1">
      <span className="px-1 pt-1 text-sm font-medium">{text}</span>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { vorher?.(); probeStarten(w) }} className={unterKnopf}>
          <span className="text-sm font-bold text-sbb-red">Probefahrt</span>
        </button>
        <a href={modellAdresse(w)} className={unterKnopf}>
          <span className="text-sm font-bold text-sbb-red">Als Modell</span>
        </a>
      </div>
    </div>
  )
}

/**
 * Die eigenen Probefahrten (Michael, 2026-10-16: «Probefahren unter den Spielen bei Modellbahn zusammenführen»; vorher
 * ein eigener Reiter unter Fahren): erst die Fahrt wählen, dann Richtung und Art, × oder nach links wischen löscht,
 * «Rückgängig» holt sie zurück, die Reihenfolge lässt sich ändern, neue kommen mit Von, Nach und Über dazu.
 */
export function Probefahrten({ imNetz, name }: { imNetz: IndexEintrag[]; name: (uic: number | null) => string }) {
  const [liste, setListe] = useState(() => gemerktLesen().probefahrten)
  const [entfernt, setEntfernt] = useState<{ f: GemerkteFahrt; stelle: number } | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [ordnen, setOrdnen] = useState(false)
  const [neu, setNeu] = useState<{ von: number | null; nach: number | null; ueber: number | null } | null>(null)
  useEffect(() => {
    if (!entfernt) return
    const uhr = setTimeout(() => setEntfernt(null), 8000)
    return () => clearTimeout(uhr)
  }, [entfernt])
  const text = (f: StreckenWahl) => `${name(f.von)} → ${name(f.nach)}${f.ueber ? ` (über ${name(f.ueber)})` : ''}`
  const titel = (f: StreckenWahl) => `${name(f.von)} – ${name(f.nach)}${f.ueber ? ` (über ${name(f.ueber)})` : ''}`
  const loeschen = (f: GemerkteFahrt, stelle: number) => { setEntfernt({ f, stelle }); setListe(probefahrtUmschalten(f).probefahrten) }
  return (
    <section>
      <h2 className="mt-8 text-xl font-bold tracking-tight">Deine Probefahrten</h2>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Die Probefahrt spielt den Weg wie unterwegs ab, mit Karte, Meldungen und wählbarem Tempo, ohne Zug und ohne
        Standort. Als Modell steht die Strecke zum Drehen da, bis etwa 200 km.
      </p>
      {entfernt && (
        <div role="status" className="kachel mt-4 flex items-center justify-between gap-3 py-1 pl-4 pr-1">
          <span className="min-w-0">{text(entfernt.f)} entfernt.</span>
          <button type="button" onClick={() => { setListe(probefahrtEinsetzen(entfernt.f, entfernt.stelle).probefahrten); setEntfernt(null) }}
                  className="min-h-11 shrink-0 rounded-lg px-3 font-bold text-sbb-red hover:bg-sbb-silver dark:hover:bg-sbb-iron">
            Rückgängig
          </button>
        </div>
      )}
      {liste.length > 1 && (
        <div className="flex justify-end">
          <button type="button" onClick={() => { setOrdnen((o) => !o); setOffen(null) }}
                  className="min-h-11 rounded-lg px-3 text-sm font-medium hover:bg-sbb-silver dark:hover:bg-sbb-iron">
            {ordnen ? 'Fertig' : 'Reihenfolge ändern'}
          </button>
        </div>
      )}
      {liste.length > 0 && ordnen && (
        <ul className="mt-2 kachelliste">
          {liste.map((f, i) => (
            <li key={`${f.von}-${f.nach}-${f.ueber}`} className="flex items-center">
              <span className="min-w-0 flex-1 px-3 py-3 font-medium">{titel(f)}</span>
              {([[-1, '↑', 'nach oben'], [1, '↓', 'nach unten']] as const).map(([r, z, w]) => (
                <button key={r} type="button" aria-label={`${text(f)} ${w}`} title={`Nach ${r < 0 ? 'oben' : 'unten'}`}
                        disabled={i + r < 0 || i + r >= liste.length}
                        onClick={() => setListe(probefahrtVerschieben(i, r).probefahrten)}
                        className="flex min-h-11 w-12 shrink-0 items-center justify-center self-stretch border-l border-sbb-cloud
                                   text-xl hover:bg-sbb-milk disabled:opacity-30 dark:border-sbb-iron dark:hover:bg-sbb-charcoal">
                  {z}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {liste.length > 0 && !ordnen && (
        <ul className="mt-2 kachelliste">
          {liste.map((f, i) => {
            const k = `${f.von}-${f.nach}-${f.ueber}`
            const auf = offen === k
            return (
              <li key={k}>
                <Wischen frage={`Probefahrt ${titel(f)} löschen?`} loeschen={() => loeschen(f, i)}>
                  <div className="flex items-stretch">
                    <button type="button" onClick={() => setOffen(auf ? null : k)} aria-expanded={auf}
                            className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3 text-left
                                       hover:bg-sbb-milk dark:hover:bg-sbb-charcoal">
                      <span className="min-w-0 font-medium">{titel(f)}</span>
                      <span className={`pfeil shrink-0 ${auf ? 'pfeil-oben' : 'pfeil-unten'}`} aria-hidden="true">{auf ? '↑' : '↓'}</span>
                    </button>
                    <button type="button" aria-label={`${text(f)} aus den Probefahrten entfernen`} title="Aus den Probefahrten entfernen"
                            onClick={() => loeschen(f, i)}
                            className="flex min-h-11 w-12 shrink-0 items-center justify-center border-l border-sbb-cloud text-xl
                                       text-sbb-metal hover:bg-sbb-milk hover:text-sbb-black dark:border-sbb-iron dark:text-sbb-storm
                                       dark:hover:bg-sbb-charcoal dark:hover:text-sbb-white">
                      ×
                    </button>
                  </div>
                </Wischen>
                {auf && (
                  <div className="grid gap-3 px-3 pb-3">
                    {[f, { von: f.nach, nach: f.von, ueber: f.ueber }].map((w) => (
                      <RichtungKnoepfe key={`${w.von}-${w.nach}`} w={w} text={text(w)} />
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {neu ? (
        <div className="kachel mt-2 space-y-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Probefahrt hinzufügen</p>
            <button type="button" onClick={() => setNeu(null)}
                    className="min-h-11 rounded-lg px-3 text-sm font-medium hover:bg-sbb-silver dark:hover:bg-sbb-iron">
              Abbrechen
            </button>
          </div>
          <BahnhofFeld bezeichnung="Von" wert={neu.von} bahnhoefe={imNetz} name={name} aendern={(u) => setNeu((w) => w && { ...w, von: u })} />
          <BahnhofFeld bezeichnung="Nach" wert={neu.nach} bahnhoefe={imNetz} name={name} aendern={(u) => setNeu((w) => w && { ...w, nach: u })} />
          {/* «Über» wie beim Fahrtblatt (Michael, 2026-10-06: Erstfeld – Biasca über Göschenen) */}
          <BahnhofFeld bezeichnung="Über (optional)" wert={neu.ueber ?? null} bahnhoefe={imNetz} name={name}
                       aendern={(u) => setNeu((w) => w && { ...w, ueber: u })} />
          <button type="button"
                  disabled={neu.von === null || neu.nach === null || neu.von === neu.nach || neu.ueber === neu.von || neu.ueber === neu.nach}
                  onClick={() => {
                    const f = { von: neu.von!, nach: neu.nach!, ueber: neu.ueber ?? null }
                    if (!liste.some((x) => x.von === f.von && x.nach === f.nach && (x.ueber ?? null) === f.ueber)) {
                      setListe(probefahrtUmschalten(f).probefahrten)
                    }
                    setNeu(null)
                  }}
                  className="w-full rounded-lg bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
            Hinzufügen
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setNeu({ von: null, nach: null, ueber: null })}
                className="kachel kachel-link mt-2 flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left font-medium">
          <span className="text-2xl leading-none text-sbb-red" aria-hidden="true">+</span>
          Probefahrt hinzufügen
        </button>
      )}
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Neue Probefahrten kommen auch auf der Seite «Strecke» mit «Als Probefahrt merken» dazu. Sie bleiben auf diesem Gerät.
      </p>
    </section>
  )
}
