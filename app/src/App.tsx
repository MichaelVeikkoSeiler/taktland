import { useEffect, useState } from 'react'
import { Bahnhof } from './komponenten/Bahnhof'
import { Suche } from './komponenten/Suche'
import { indexLaden } from './daten'
import type { BahnhofIndex } from './typen'

/** Adresse im Format #/bahnhof/8503000, damit Seiten teilbar und zurücknavigierbar sind. */
function uicAusAdresse(): number | null {
  const treffer = /^#\/bahnhof\/(\d+)$/.exec(window.location.hash)
  return treffer ? Number(treffer[1]) : null
}

export default function App() {
  const [index, setIndex] = useState<BahnhofIndex | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [uic, setUic] = useState<number | null>(uicAusAdresse())

  useEffect(() => {
    indexLaden().then(setIndex).catch((e: Error) => setFehler(e.message))
    const beiWechsel = () => setUic(uicAusAdresse())
    window.addEventListener('hashchange', beiWechsel)
    return () => window.removeEventListener('hashchange', beiWechsel)
  }, [])

  useEffect(() => { window.scrollTo(0, 0) }, [uic])

  function oeffnen(neu: number) { window.location.hash = `#/bahnhof/${neu}` }
  function zurueck() { window.location.hash = '' }

  return (
    <div className="min-h-dvh bg-white text-takt-900 dark:bg-takt-900 dark:text-takt-50">
      <div className="mx-auto max-w-2xl">
        {uic === null && (
          <header className="px-4 pb-4 pt-8">
            <h1 className="text-3xl font-bold tracking-tight">Taktland</h1>
            <p className="mt-1 text-takt-700 dark:text-takt-300">Bahnhöfe entdecken</p>
          </header>
        )}

        {fehler && (
          <p className="px-4 py-8">Die Bahnhofsliste konnte nicht geladen werden. {fehler}</p>
        )}

        {!index && !fehler && <p className="px-4 py-8 text-takt-700">Wird geladen …</p>}

        {index && (uic === null
          ? <Suche index={index} oeffnen={oeffnen} />
          : <Bahnhof uic={uic} zurueck={zurueck} />)}

        <footer className="mt-12 border-t border-takt-300 px-4 py-6 text-xs
                           text-takt-700 dark:border-takt-700 dark:text-takt-300">
          <p>
            Datenquelle: SBB Open Data, data.sbb.ch. Taktland ist ein privates Lernprojekt
            und kein Angebot der SBB.
          </p>
          <p className="mt-1">
            Der Lernfortschritt bleibt auf diesem Gerät. Es gibt kein Konto und keine Auswertung.
          </p>
          {index && <p className="mt-1">Datenstand: {index.stand}</p>}
        </footer>
      </div>
    </div>
  )
}
