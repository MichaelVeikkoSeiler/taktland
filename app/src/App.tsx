import { useEffect, useState } from 'react'
import { allesZuruecksetzen, bearbeiteBahnhoefe, bearbeiteteLinien } from './fortschritt'
import { Anleitung } from './komponenten/Anleitung'
import { Auftakt } from './komponenten/Auftakt'
import { Bahnhof } from './komponenten/Bahnhof'
import { Duell } from './komponenten/Duell'
import { Linie } from './komponenten/Linie'
import { Linien } from './komponenten/Linien'
import { Objekte } from './komponenten/Objekte'
import { type Filter, filterAusAdresse } from './listen'
import type { ListenArt } from './typen'
import { Suche, type ListenStand } from './komponenten/Suche'
import { indexLaden } from './daten'
import { HERAUSGEBER, KONTAKT } from './kontakt'
import type { BahnhofIndex } from './typen'

/** Die Seite steht in der Adresse (#/bahnhof/8503000, #/linie/600), damit
 *  Seiten teilbar und mit «Zurück» erreichbar sind. */
type Seite =
  | { art: 'liste' } | { art: 'duell' } | { art: 'anleitung' } | { art: 'linien' }
  | { art: 'bahnhof'; uic: number } | { art: 'linie'; nr: number }
  | { art: 'objekte'; nr: number; liste: ListenArt; filter: Filter | null }

function seiteAusAdresse(): Seite {
  const h = window.location.hash
  const bahnhof = /^#\/bahnhof\/(\d+)$/.exec(h)
  if (bahnhof) return { art: 'bahnhof', uic: Number(bahnhof[1]) }
  // #/linie/600/bruecken?kanton=Ticino: die Liste hinter einer Kachel
  const objekte = /^#\/linie\/(\d+)\/(tunnel|bruecken|bahnuebergaenge)(?:\?(.*))?$/.exec(h)
  if (objekte) {
    return { art: 'objekte', nr: Number(objekte[1]), liste: objekte[2] as ListenArt,
             filter: filterAusAdresse(objekte[3]) }
  }
  const linie = /^#\/linie\/(\d+)$/.exec(h)
  if (linie) return { art: 'linie', nr: Number(linie[1]) }
  if (h === '#/duell') return { art: 'duell' }
  if (h === '#/anleitung') return { art: 'anleitung' }
  if (h === '#/linien') return { art: 'linien' }
  return { art: 'liste' }
}

export default function App() {
  const [index, setIndex] = useState<BahnhofIndex | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [seite, setSeite] = useState<Seite>(seiteAusAdresse())
  // bleibt stehen, während ein Bahnhof offen ist: zurück auf derselben Seite
  const [liste, setListe] = useState<ListenStand>({
    begriff: '', seite: 0, sortierung: 'alphabet',
  })

  useEffect(() => {
    indexLaden().then(setIndex).catch((e: Error) => setFehler(e.message))
    const beiWechsel = () => setSeite(seiteAusAdresse())
    window.addEventListener('hashchange', beiWechsel)
    return () => window.removeEventListener('hashchange', beiWechsel)
  }, [])

  // nach der Adresse, nicht nach dem Objekt: sonst sprang die Seite bei
  // jedem Neuzeichnen nach oben
  const adresse = seite.art === 'bahnhof' ? `b${seite.uic}` : seite.art === 'linie' ? `l${seite.nr}`
    : seite.art === 'objekte' ? window.location.hash : seite.art
  useEffect(() => { window.scrollTo(0, 0) }, [adresse])

  function oeffnen(neu: number) { window.location.hash = `#/bahnhof/${neu}` }
  function zurueck() { window.location.hash = '' }
  function zuDenLinien() { window.location.hash = '#/linien' }

  return (
    <div className="min-h-dvh bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white">
      <div className="mx-auto max-w-2xl">
        {seite.art === 'liste' && (
          <header className="border-b border-sbb-cloud px-4 pb-5 pt-8 dark:border-sbb-iron">
            <Auftakt />
            <div className="h-1 w-10 bg-sbb-red" aria-hidden="true" />
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <h1 className="text-3xl font-bold tracking-tight">Taktland</h1>
              <a href="#/anleitung"
                 className="shrink-0 text-sm text-sbb-metal underline underline-offset-2
                            hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white">
                So funktioniert’s
              </a>
            </div>
          </header>
        )}

        {fehler && (
          <p className="px-4 py-8">Die Bahnhofsliste konnte nicht geladen werden. {fehler}</p>
        )}

        {!index && !fehler && <p className="px-4 py-8 text-sbb-metal">Wird geladen …</p>}

        {seite.art === 'anleitung' && <Anleitung index={index} zurueck={zurueck} />}
        {seite.art === 'duell' && <Duell zurueck={zurueck} />}
        {seite.art === 'linien' && <Linien zurueck={zurueck} />}
        {seite.art === 'linie' && <Linie key={seite.nr} nr={seite.nr} zurueck={zuDenLinien} />}
        {seite.art === 'objekte' && (
          <Objekte nr={seite.nr} art={seite.liste} filter={seite.filter}
                   zurueck={() => { window.location.hash = `#/linie/${seite.nr}` }} />
        )}
        {seite.art === 'liste' && index
          && <Suche index={index} oeffnen={oeffnen} stand={liste} aendern={setListe} />}
        {seite.art === 'bahnhof' && index && (
          <Bahnhof uic={seite.uic} zurueck={zurueck}
                   kanton={index.bahnhoefe.find((b) => b.uic === seite.uic)?.kanton ?? null} />
        )}

        <footer className="mt-12 border-t border-sbb-cloud px-4 py-6 text-xs
                           text-sbb-metal dark:border-sbb-iron dark:text-sbb-storm">
          <p>
            Datenquelle: SBB Open Data, data.sbb.ch; Wartehallen: opentransportdata.swiss.
            Taktland ist ein privates Lernprojekt von {HERAUSGEBER} und kein Angebot der SBB.
            Hinweise und Fehler gern an{' '}
            <a href={`mailto:${KONTAKT}`} className="underline underline-offset-2
                                                  hover:text-sbb-black dark:hover:text-sbb-white">
              {KONTAKT}
            </a>. Entstanden mit Unterstützung von KI (Claude Code; Auftaktbild: ChatGPT).
          </p>
          <p className="mt-2 font-medium text-sbb-black dark:text-sbb-white">
            Taktland kann Fehler enthalten. Die Rohdaten können unvollständig oder veraltet
            sein, und auch beim Aufbereiten können Fehler passieren. Taktland ist ein Lernspiel
            und nicht für die Reiseplanung gedacht.
          </p>
          <p className="mt-2">
            <a href="#/anleitung" className="underline underline-offset-2 hover:text-sbb-black
                                             dark:hover:text-sbb-white">
              Anleitung, Datenquellen und Datenschutz
            </a>
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
  const linien = fragt ? bearbeiteteLinien().length : 0
  const teile = [
    ...(anzahl ? [`bei ${anzahl} ${anzahl === 1 ? 'Bahnhof' : 'Bahnhöfen'}`] : []),
    ...(linien ? [`bei ${linien} ${linien === 1 ? 'Linie' : 'Linien'}`] : []),
  ]

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
        {teile.length > 0
          ? `Damit werden die Antworten ${teile.join(' und ')} `
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
