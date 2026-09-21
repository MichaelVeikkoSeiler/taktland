import { useEffect, useState } from 'react'
import { allesZuruecksetzen, bearbeiteBahnhoefe } from './fortschritt'
import { Bahnhof } from './komponenten/Bahnhof'
import { Duell } from './komponenten/Duell'
import { Suche, type ListenStand } from './komponenten/Suche'
import { indexLaden } from './daten'
import type { BahnhofIndex } from './typen'

/** Adresse im Format #/bahnhof/8503000, damit Seiten teilbar und zurücknavigierbar sind. */
function uicAusAdresse(): number | null {
  const treffer = /^#\/bahnhof\/(\d+)$/.exec(window.location.hash)
  return treffer ? Number(treffer[1]) : null
}

function istDuell() {
  return window.location.hash === '#/duell'
}

export default function App() {
  const [index, setIndex] = useState<BahnhofIndex | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [uic, setUic] = useState<number | null>(uicAusAdresse())
  const [duell, setDuell] = useState(istDuell())
  // bleibt stehen, während ein Bahnhof offen ist: zurück auf derselben Seite
  const [liste, setListe] = useState<ListenStand>({ begriff: '', nurMitProfil: true, seite: 0 })

  useEffect(() => {
    indexLaden().then(setIndex).catch((e: Error) => setFehler(e.message))
    const beiWechsel = () => { setUic(uicAusAdresse()); setDuell(istDuell()) }
    window.addEventListener('hashchange', beiWechsel)
    return () => window.removeEventListener('hashchange', beiWechsel)
  }, [])

  useEffect(() => { window.scrollTo(0, 0) }, [uic, duell])

  function oeffnen(neu: number) { window.location.hash = `#/bahnhof/${neu}` }
  function zurueck() { window.location.hash = '' }

  return (
    <div className="min-h-dvh bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white">
      <div className="mx-auto max-w-2xl">
        {uic === null && !duell && (
          <header className="border-b border-sbb-cloud px-4 pb-5 pt-8 dark:border-sbb-iron">
            <div className="h-1 w-10 bg-sbb-red" aria-hidden="true" />
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Taktland</h1>
            <p className="mt-1 text-sbb-metal dark:text-sbb-storm">Bahnhöfe entdecken</p>
          </header>
        )}

        {fehler && (
          <p className="px-4 py-8">Die Bahnhofsliste konnte nicht geladen werden. {fehler}</p>
        )}

        {!index && !fehler && <p className="px-4 py-8 text-sbb-metal">Wird geladen …</p>}

        {duell
          ? <Duell zurueck={zurueck} />
          : index && (uic === null
            ? <Suche index={index} oeffnen={oeffnen} stand={liste} aendern={setListe} />
            : <Bahnhof uic={uic} zurueck={zurueck} />)}

        <footer className="mt-12 border-t border-sbb-cloud px-4 py-6 text-xs
                           text-sbb-metal dark:border-sbb-iron dark:text-sbb-storm">
          <p>
            Datenquelle: SBB Open Data, data.sbb.ch. Taktland ist ein privates Lernprojekt
            und kein Angebot der SBB.
          </p>
          <p className="mt-1">
            Der Lernfortschritt bleibt auf diesem Gerät. Es gibt kein Konto und keine Auswertung.
          </p>
          <Zuruecksetzen />
          {index && <p className="mt-1">Datenstand: {index.stand}</p>}
        </footer>
      </div>
    </div>
  )
}

/**
 * Löscht den ganzen Fortschritt auf diesem Gerät. Zwei Schritte, weil sich das
 * nicht rückgängig machen lässt und ein Fehlgriff Wochen an Arbeit kostet.
 */
function Zuruecksetzen() {
  const [fragt, setFragt] = useState(false)
  const [fertig, setFertig] = useState(false)
  const anzahl = fragt ? bearbeiteBahnhoefe().length : 0

  // Die Bestätigung soll nicht für immer stehen bleiben
  useEffect(() => {
    if (!fertig) return
    const uhr = setTimeout(() => { setFertig(false); setFragt(false) }, 4000)
    return () => clearTimeout(uhr)
  }, [fertig])

  if (fertig) {
    return <p className="mt-2 text-sbb-black dark:text-sbb-white">Alles gelöscht.</p>
  }

  if (!fragt) {
    return (
      <button
        type="button" onClick={() => setFragt(true)}
        className="mt-2 underline underline-offset-2 hover:text-sbb-black
                   dark:hover:text-sbb-white"
      >
        Fortschritt auf diesem Gerät löschen
      </button>
    )
  }

  return (
    <div className="mt-2 border-l-2 border-sbb-red pl-3">
      <p className="text-sbb-black dark:text-sbb-white">
        {anzahl > 0
          ? `Damit werden die Antworten bei ${anzahl} ${anzahl === 1 ? 'Bahnhof' : 'Bahnhöfen'} `
            + 'und alle Bestwerte im Duell gelöscht. Das lässt sich nicht rückgängig machen.'
          : 'Damit werden alle Antworten und alle Bestwerte im Duell gelöscht. '
            + 'Das lässt sich nicht rückgängig machen.'}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => { allesZuruecksetzen(); setFertig(true) }}
          className="bg-sbb-red px-3 py-2 font-bold text-white hover:bg-sbb-red125"
        >
          Ja, alles löschen
        </button>
        <button
          type="button" onClick={() => setFragt(false)}
          className="border border-sbb-cloud px-3 py-2 dark:border-sbb-iron"
        >
          Abbrechen
        </button>
      </div>
    </div>
  )
}
