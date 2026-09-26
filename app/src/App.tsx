import { useEffect, useState } from 'react'
import { allesZuruecksetzen, bearbeiteBahnhoefe, bearbeiteteLinien } from './fortschritt'
import { Anleitung } from './komponenten/Anleitung'
import { Bahnhof } from './komponenten/Bahnhof'
import { Duell } from './komponenten/Duell'
import { Fahrt } from './komponenten/Fahrt'
import { Sammelheft } from './komponenten/Sammelheft'
import { Favoriten } from './komponenten/Favoriten'
import { Logbuch } from './komponenten/Logbuch'
import { type Bereich, Kopf } from './komponenten/Kopf'
import { Linie } from './komponenten/Linie'
import { Linien } from './komponenten/Linien'
import { Objekte } from './komponenten/Objekte'
import { eintragAusAdresse, type Filter, filterAusAdresse } from './listen'
import type { ListenArt } from './typen'
import { Standort } from './komponenten/Standort'
import { Start } from './komponenten/Start'
import { Strecke, type StreckenWahl, wahlAusAdresse } from './komponenten/Strecke'
import { Suche, type ListenStand } from './komponenten/Suche'
import {
  ersteSortierung, Uebersicht, type UebersichtArt, type UebersichtStand,
} from './komponenten/Uebersicht'
import { indexLaden } from './daten'
import { HERAUSGEBER, KONTAKT } from './kontakt'
import type { BahnhofIndex } from './typen'
import { Demo } from './komponenten/Demo'
import { Ladefehler } from './komponenten/Ladefehler'

/** Die Seite steht in der Adresse (#/bahnhof/8503000, #/linie/600), damit
 *  Seiten teilbar und mit «Zurück» erreichbar sind. */
type Seite =
  | { art: 'start' } | { art: 'liste' } | { art: 'duell' } | { art: 'anleitung' } | { art: 'linien' }
  | { art: 'standort' } | { art: 'fahrt' } | { art: 'sammelheft' } | { art: 'logbuch' } | { art: 'favoriten' } | { art: 'demo' }
  | { art: 'uebersicht'; liste: UebersichtArt }
  | { art: 'strecke'; wahl: StreckenWahl }
  | { art: 'bahnhof'; uic: number } | { art: 'linie'; nr: number }
  | { art: 'objekte'; nr: number; liste: ListenArt; filter: Filter | null; eintrag: number | null }

function seiteAusAdresse(): Seite {
  const h = window.location.hash
  const bahnhof = /^#\/bahnhof\/(\d+)$/.exec(h)
  if (bahnhof) return { art: 'bahnhof', uic: Number(bahnhof[1]) }
  // #/linie/600/bruecken?kanton=Ticino: die Liste hinter einer Kachel
  const objekte = /^#\/linie\/(\d+)\/(tunnel|bruecken|bahnuebergaenge|netz)(?:\?(.*))?$/.exec(h)
  if (objekte) {
    return { art: 'objekte', nr: Number(objekte[1]), liste: objekte[2] as ListenArt,
             filter: filterAusAdresse(objekte[3]), eintrag: eintragAusAdresse(objekte[3]) }
  }
  const linie = /^#\/linie\/(\d+)$/.exec(h)
  if (linie) return { art: 'linie', nr: Number(linie[1]) }
  if (h === '#/duell') return { art: 'duell' }
  if (h === '#/standort') return { art: 'standort' }
  if (h === '#/fahrt') return { art: 'fahrt' }
  if (h === '#/sammelheft') return { art: 'sammelheft' }
  if (h === '#/logbuch') return { art: 'logbuch' }
  if (h === '#/favoriten') return { art: 'favoriten' }
  if (h === '#/demo') return { art: 'demo' }
  if (h === '#/anleitung') return { art: 'anleitung' }
  // #/linien: die frühere Adresse, damit alte Lesezeichen weiter gehen
  if (h === '#/strecken' || h === '#/linien') return { art: 'linien' }
  const strecke = /^#\/strecke(?:\?(.*))?$/.exec(h)
  if (strecke) return { art: 'strecke', wahl: wahlAusAdresse(strecke[1]) }
  if (h === '#/tunnel') return { art: 'uebersicht', liste: 'tunnel' }
  if (h === '#/bruecken') return { art: 'uebersicht', liste: 'bruecken' }
  if (h === '#/bahnhoefe') return { art: 'liste' }
  // #/ und alles Unbekannte: die Startseite mit der Einleitung
  return { art: 'start' }
}

/** Von welcher Übersicht aus eine Linie geöffnet wurde. Dorthin führt ihr
 *  Zurück-Link, und dieser Reiter bleibt markiert. */
type Herkunft = 'linien' | UebersichtArt

const ZURUECK_ZU: Record<Herkunft, { text: string; adresse: string }> = {
  linien: { text: 'Alle Strecken', adresse: '#/strecken' },
  tunnel: { text: 'Alle Tunnel', adresse: '#/tunnel' },
  bruecken: { text: 'Alle Brücken', adresse: '#/bruecken' },
}

function bereichVon(seite: Seite, herkunft: Herkunft): Bereich | null {
  switch (seite.art) {
    case 'liste': case 'bahnhof': return 'bahnhoefe'
    case 'start': return null
    case 'linien': case 'strecke': return 'linien'
    case 'linie': case 'objekte': return herkunft
    case 'uebersicht': return seite.liste
    case 'duell': return 'duell'
    case 'standort': return 'standort'
    case 'logbuch': return 'logbuch'
    case 'favoriten': return 'favoriten'
    case 'demo': return 'demo'
    case 'sammelheft': return 'sammelheft'
    case 'anleitung': case 'fahrt': return null
  }
}

function neuerStand(art: UebersichtArt): UebersichtStand {
  return { begriff: '', seite: 0, sortierung: ersteSortierung(art) }
}

export default function App() {
  const [index, setIndex] = useState<BahnhofIndex | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [seite, setSeite] = useState<Seite>(seiteAusAdresse())
  // bleibt stehen, während ein Bahnhof offen ist: zurück auf derselben Seite
  const [liste, setListe] = useState<ListenStand>({
    begriff: '', seite: 0, sortierung: 'alphabet',
  })
  const [uebersichten, setUebersichten] = useState<Record<UebersichtArt, UebersichtStand>>({
    tunnel: neuerStand('tunnel'), bruecken: neuerStand('bruecken'),
  })
  const [herkunft, setHerkunft] = useState<Herkunft>('linien')
  if (seite.art === 'linien' && herkunft !== 'linien') setHerkunft('linien')
  if (seite.art === 'uebersicht' && herkunft !== seite.liste) setHerkunft(seite.liste)

  useEffect(() => {
    indexLaden().then(setIndex).catch((e: Error) => setFehler(e.message))
    const beiWechsel = () => setSeite(seiteAusAdresse())
    window.addEventListener('hashchange', beiWechsel)
    return () => window.removeEventListener('hashchange', beiWechsel)
  }, [])

  // nach der Adresse, nicht nach dem Objekt: sonst sprang die Seite bei
  // jedem Neuzeichnen nach oben
  const adresse = seite.art === 'bahnhof' ? `b${seite.uic}` : seite.art === 'linie' ? `l${seite.nr}`
    : seite.art === 'objekte' ? window.location.hash
    : seite.art === 'uebersicht' ? seite.liste : seite.art
  useEffect(() => { window.scrollTo(0, 0) }, [adresse])

  function oeffnen(neu: number) { window.location.hash = `#/bahnhof/${neu}` }
  function zurueck() { window.location.hash = '#/bahnhoefe' }
  const zurueckZu = ZURUECK_ZU[herkunft]
  const bereich = bereichVon(seite, herkunft)

  return (
    <div className="min-h-dvh bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white">
      {/* auf dem Tablet breiter: 672 Pixel wirkten dort verloren (Michael, 2026-09-22) */}
      <div className="mx-auto max-w-2xl md:max-w-3xl">
        <Kopf aktiv={bereich} startseite={seite.art === 'start'} anleitung={seite.art === 'anleitung'}
              fahrt={seite.art === 'fahrt'} />

        {fehler && (
          <Ladefehler className="px-4 py-8" was="Die Bahnhofsliste konnte nicht geladen werden." fehler={fehler} />
        )}

        {!index && !fehler && <p className="px-4 py-8 text-sbb-metal">Wird geladen …</p>}

        {seite.art === 'start' && index && <Start index={index} />}
        {seite.art === 'anleitung' && <Anleitung index={index} />}
        {seite.art === 'duell' && <Duell index={index} />}
        {seite.art === 'standort' && <Standort index={index} />}
        {seite.art === 'fahrt' && <Fahrt index={index} />}
        {seite.art === 'sammelheft' && <Sammelheft index={index} />}
        {seite.art === 'logbuch' && <Logbuch index={index} />}
        {seite.art === 'favoriten' && <Favoriten index={index} oeffnen={oeffnen} />}
        {seite.art === 'demo' && <Demo />}
        {seite.art === 'linien' && <Linien index={index} />}
        {seite.art === 'uebersicht' && (
          <Uebersicht key={seite.liste} art={seite.liste} stand={uebersichten[seite.liste]}
                      aendern={(neu) => setUebersichten((u) => ({ ...u, [seite.liste]: neu }))} />
        )}
        {seite.art === 'strecke' && <Strecke index={index} wahl={seite.wahl} />}
        {seite.art === 'linie' && (
          <Linie key={seite.nr} nr={seite.nr} zurueckText={zurueckZu.text}
                 zurueck={() => { window.location.hash = zurueckZu.adresse }} />
        )}
        {seite.art === 'objekte' && (
          <Objekte nr={seite.nr} art={seite.liste} filter={seite.filter} markiert={seite.eintrag}
                   zurueck={() => { window.location.hash = `#/linie/${seite.nr}` }} />
        )}
        {seite.art === 'liste' && index
          && <Suche index={index} oeffnen={oeffnen} stand={liste} aendern={setListe} />}
        {seite.art === 'bahnhof' && index && (
          <Bahnhof uic={seite.uic} zurueck={zurueck}
                   eintrag={index.bahnhoefe.find((b) => b.uic === seite.uic)} />
        )}

        <footer className="mt-12 border-t border-sbb-cloud px-4 py-6 text-xs
                           text-sbb-metal dark:border-sbb-iron dark:text-sbb-storm">
          <p>
            Datenquelle: SBB Open Data, data.sbb.ch; Wartehallen: opentransportdata.swiss;
            Linien anderer Bahnen und Netz: Bundesamt für Verkehr BAV, Schienennetz;
            Seen, Gipfel und im Fahrtmodus Tunnel und Brücken anderer Bahnen (swissTLM3D):
            Bundesamt für Landestopografie swisstopo. Kulturgüter: Bundesamt für
            Bevölkerungsschutz BABS. Seilbahnen: Bundesamt für Verkehr BAV. BLN, Pärke und
            Moorlandschaften: Bundesamt für Umwelt BAFU.
            Taktland ist ein privates Lernprojekt von {HERAUSGEBER} und kein Angebot der SBB.
            Hinweise und Fehler gern an{' '}
            <a href={`mailto:${KONTAKT}`}
               className="hover:text-sbb-black dark:hover:text-sbb-white">
              {KONTAKT}
            </a>. Entstanden mit Unterstützung von KI (Claude Code; Auftaktbilder: ChatGPT).
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
          className="rounded-lg bg-sbb-red px-3 py-2 font-bold text-white hover:bg-sbb-red125"
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
