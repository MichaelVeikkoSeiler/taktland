import { lazy, Suspense, useEffect, useState } from 'react'
import { allesZuruecksetzen, bearbeiteBahnhoefe, bearbeiteteLinien } from './fortschritt'
import { Anleitung } from './komponenten/Anleitung'
import { Bahnhof } from './komponenten/Bahnhof'
import { Duell } from './komponenten/Duell'
import { Spiele } from './komponenten/Spiele'
import { Schweiz11 } from './komponenten/Schweiz11'
import { Schweiz11Online } from './komponenten/Schweiz11Online'
import { Erraten } from './komponenten/Erraten'
import { ErratenOnline } from './komponenten/ErratenOnline'
// three.js nur für das 3D-Relief, erst dort geladen
const ReliefSeite = lazy(() => import('./komponenten/Relief'))
import { Zurueck } from './komponenten/Zurueck'
import { Fahrt } from './komponenten/Fahrt'
import { Fortsetzen } from './komponenten/Fortsetzen'
import { OhneZiel } from './komponenten/OhneZiel'
import { Fahrtblatt } from './komponenten/Fahrtblatt'
import { Sammelheft } from './komponenten/Sammelheft'
import { Favoriten } from './komponenten/Favoriten'
import { Logbuch } from './komponenten/Logbuch'
import { type Bereich, type FahrtTeil, Kopf } from './komponenten/Kopf'
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
import type { BahnhofIndex } from './typen'
import { Ladefehler } from './komponenten/Ladefehler'
import { EinstellungenSeite } from './komponenten/EinstellungenSeite'

/** Die Seite steht in der Adresse (#/bahnhof/8503000, #/linie/600), damit
 *  Seiten teilbar und mit «Zurück» erreichbar sind. */
type Seite =
  | { art: 'start' } | { art: 'liste' } | { art: 'duell' } | { art: 'spiele' } | { art: 'schweiz11' } | { art: 'schweiz11mit'; raum: string } | { art: 'erraten' } | { art: 'erratenmit'; raum: string } | { art: 'relief'; name: string; ausFahren: boolean } | { art: 'anleitung' } | { art: 'linien' }
  | { art: 'standort' } | { art: 'fahrt'; teil: FahrtTeil } | { art: 'sammelheft' } | { art: 'logbuch' } | { art: 'favoriten' } | { art: 'einstellungen' } | { art: 'ohneziel' }
  | { art: 'fahrtblatt'; wahl: StreckenWahl }
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
  if (h === '#/spiele') return { art: 'spiele' }
  if (h === '#/schweiz11') return { art: 'schweiz11' }
  const geoRaum = /^#\/schweiz11\/mit\/([A-Za-z]{4})$/.exec(h)
  if (geoRaum) return { art: 'schweiz11mit', raum: geoRaum[1].toUpperCase() }
  if (h === '#/erraten') return { art: 'erraten' }
  const relief = /^#\/relief\/([a-z]+)$/.exec(h)
  if (relief) return { art: 'relief', name: relief[1], ausFahren: false }
  // dasselbe Relief aus dem Reiter «3D-Strecken» unter Fahren
  const relief3d = /^#\/fahrt\/3d\/([a-z]+)$/.exec(h)
  if (relief3d) return { art: 'relief', name: relief3d[1], ausFahren: true }
  const suchRaum = /^#\/erraten\/mit\/([A-Za-z]{4})$/.exec(h)
  if (suchRaum) return { art: 'erratenmit', raum: suchRaum[1].toUpperCase() }
  if (h === '#/standort') return { art: 'standort' }
  // Fahren mit drei Unterseiten (Michael, 2026-09-29)
  if (h === '#/fahrt') return { art: 'fahrt', teil: 'neu' }
  if (h === '#/fahrt/probe') return { art: 'fahrt', teil: 'probe' }
  if (h === '#/fahrt/3d') return { art: 'fahrt', teil: '3d' }
  if (h === '#/fahrt/blatt') return { art: 'fahrt', teil: 'blatt' }
  if (h === '#/ohneziel') return { art: 'ohneziel' }
  if (h === '#/sammelheft') return { art: 'sammelheft' }
  if (h === '#/logbuch') return { art: 'logbuch' }
  if (h === '#/favoriten') return { art: 'favoriten' }
  // #/audio: früher ein eigener Reiter, heute ein Teil der Einstellungen
  if (h === '#/einstellungen' || h === '#/audio') return { art: 'einstellungen' }
  if (h === '#/anleitung') return { art: 'anleitung' }
  // #/linien: die frühere Adresse, damit alte Lesezeichen weiter gehen
  if (h === '#/strecken' || h === '#/linien') return { art: 'linien' }
  const blatt = /^#\/fahrtblatt(?:\?(.*))?$/.exec(h)
  if (blatt) return { art: 'fahrtblatt', wahl: wahlAusAdresse(blatt[1]) }
  const strecke = /^#\/strecke(?:\?(.*))?$/.exec(h)
  if (strecke) return { art: 'strecke', wahl: wahlAusAdresse(strecke[1]) }
  if (h === '#/tunnel') return { art: 'uebersicht', liste: 'tunnel' }
  if (h === '#/bruecken') return { art: 'uebersicht', liste: 'bruecken' }
  if (h === '#/bahnuebergaenge') return { art: 'uebersicht', liste: 'bahnuebergaenge' }
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
  bahnuebergaenge: { text: 'Alle Bahnübergänge', adresse: '#/bahnuebergaenge' },
}

function bereichVon(seite: Seite, herkunft: Herkunft): Bereich | null {
  switch (seite.art) {
    case 'liste': case 'bahnhof': return 'bahnhoefe'
    case 'start': return null
    case 'linien': case 'strecke': return 'linien'
    case 'linie': case 'objekte': return herkunft
    case 'relief': return seite.ausFahren ? null : 'linien'
    case 'uebersicht': return seite.liste
    case 'duell': return 'duell'
    case 'spiele': return 'spiele'
    case 'schweiz11': case 'schweiz11mit': return 'schweiz11'
    case 'erraten': case 'erratenmit': return 'erraten'
    case 'standort': return 'standort'
    case 'logbuch': return 'logbuch'
    case 'favoriten': return 'favoriten'
    case 'einstellungen': return 'einstellungen'
    case 'sammelheft': return 'sammelheft'
    case 'anleitung': case 'fahrt': case 'ohneziel': case 'fahrtblatt': return null
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
    tunnel: neuerStand('tunnel'), bruecken: neuerStand('bruecken'), bahnuebergaenge: neuerStand('bahnuebergaenge'),
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
    : seite.art === 'uebersicht' ? seite.liste : seite.art === 'fahrtblatt' ? window.location.hash
    : seite.art === 'fahrt' ? `fahrt ${seite.teil}` : seite.art
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
              fahrt={seite.art === 'fahrt' ? seite.teil : seite.art === 'ohneziel' ? 'neu'
                : seite.art === 'fahrtblatt' ? 'blatt' : seite.art === 'relief' && seite.ausFahren ? '3d' : null} />
        <Fortsetzen />

        {fehler && (
          <Ladefehler className="px-4 py-8" was="Die Bahnhofsliste konnte nicht geladen werden." fehler={fehler} />
        )}

        {!index && !fehler && <p className="px-4 py-8 text-sbb-metal">Wird geladen …</p>}

        {seite.art === 'start' && index && <Start index={index} />}
        {seite.art === 'anleitung' && <Anleitung index={index} />}
        {seite.art === 'spiele' && <Spiele />}
        {seite.art === 'schweiz11' && <Schweiz11 index={index} />}
        {seite.art === 'schweiz11mit' && <Schweiz11Online key={seite.raum} raum={seite.raum} index={index} />}
        {seite.art === 'erraten' && <Erraten index={index} />}
        {seite.art === 'erratenmit' && <ErratenOnline key={seite.raum} raum={seite.raum} index={index} />}
        {/* das Duell gehört zu «Spiele» (Michael, 2026-10-02); seine Adresse #/duell bleibt */}
        {seite.art === 'duell' && (
          <>
            <div className="px-4">
              <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
            </div>
            <Duell index={index} />
          </>
        )}
        {seite.art === 'standort' && <Standort index={index} />}
        {seite.art === 'fahrt' && <Fahrt key={seite.teil} index={index} teil={seite.teil} />}
        {seite.art === 'ohneziel' && <OhneZiel index={index} />}
        {seite.art === 'fahrtblatt' && <Fahrtblatt index={index} wahl={seite.wahl} />}
        {seite.art === 'sammelheft' && <Sammelheft index={index} />}
        {seite.art === 'logbuch' && <Logbuch index={index} />}
        {seite.art === 'favoriten' && <Favoriten index={index} oeffnen={oeffnen} />}
        {seite.art === 'einstellungen' && <EinstellungenSeite />}
        {seite.art === 'linien' && <Linien index={index} />}
        {seite.art === 'uebersicht' && (
          <Uebersicht key={seite.liste} art={seite.liste} stand={uebersichten[seite.liste]}
                      aendern={(neu) => setUebersichten((u) => ({ ...u, [seite.liste]: neu }))} />
        )}
        {seite.art === 'strecke' && <Strecke index={index} wahl={seite.wahl} />}
        {seite.art === 'relief' && (
          <Suspense fallback={<p className="px-4 py-8 text-sbb-metal">Das Relief wird geladen …</p>}>
            <ReliefSeite key={seite.name} name={seite.name}
                         zurueck={seite.ausFahren ? { text: 'Alle Bergstrecken', adresse: '#/fahrt/3d' } : undefined} />
          </Suspense>
        )}
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

        <footer className="print:hidden mt-6 border-t border-sbb-cloud px-4 pt-4 pb-6 text-xs
                           text-sbb-metal dark:border-sbb-iron dark:text-sbb-storm">
          {/* die Bildmarke klein über den Angaben (Michael, 2026-09-27) */}
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-sbb-black dark:text-sbb-white">
            <img src="./logo.svg" alt="" className="size-6" />Taktland
          </p>
          {/* die Einstellungen links über den Quellenangaben, statt als Reiter der Reisetasche (Michael, 2026-10-06) */}
          <a href="#/einstellungen"
             className="mb-3 inline-flex min-h-10 items-center rounded-lg border border-sbb-cloud bg-white px-4 text-sm
                        font-medium text-sbb-black hover:bg-sbb-milk dark:border-sbb-iron dark:bg-sbb-midnight
                        dark:text-sbb-white dark:hover:bg-sbb-charcoal">
            Einstellungen
          </a>
          <p>
            Datenquelle: SBB Open Data, data.sbb.ch; Wartehallen: opentransportdata.swiss;
            Linien anderer Bahnen und Netz: Bundesamt für Verkehr BAV, Schienennetz;
            Seen, Flüsse, Wald, Siedlung, Lage der Orte und in Geo Bahnlinien und Kantonsgrenzen (swissTLMRegio), Höhenstufen und das Gelände in 3D (swissALTIRegio, mit Höhenmodellen aus Italien, Österreich, Deutschland und Frankreich, Quellen unter Info),
            Gipfel und Ortsnamen (Swiss Map Vector 1000), Brückenlängen und beim Fahren Tunnel und Brücken
            anderer Bahnen, auch in 3D (swissTLM3D): Bundesamt für Landestopografie swisstopo. Landes- und Kantonsgrenzen:
            Bundesamt für Statistik BFS. Kulturgüter: Bundesamt für
            Bevölkerungsschutz BABS. Seilbahnen: Bundesamt für Verkehr BAV. BLN, Pärke und
            Moorlandschaften: Bundesamt für Umwelt BAFU.
            Taktland ist ein privates Lernprojekt und kein Angebot einer Bahnunternehmung.
            Entstanden mit Unterstützung von KI (Claude Code; Auftaktbilder: ChatGPT).
            Taktland kann Fehler enthalten. Die Rohdaten können unvollständig oder veraltet
            sein, und auch beim Aufbereiten können Fehler passieren. Taktland ist zum Lernen,
            Nachschlagen und Mitfahren gedacht, nicht für die Reiseplanung.
          </p>
          <p className="mt-2">
            <a href="#/anleitung" className="underline underline-offset-2 hover:text-sbb-black
                                             dark:hover:text-sbb-white">
              Anleitung, Datenquellen und Datenschutz
            </a>
          </p>
          <p className="mt-1">
            Kontakt:{' '}
            <a href="mailto:hallo@taktland.ch" className="underline underline-offset-2 hover:text-sbb-black
                                                       dark:hover:text-sbb-white">
              hallo@taktland.ch
            </a>
          </p>
          <p className="mt-1">
            Der Lernfortschritt bleibt auf diesem Gerät. Es gibt kein Konto; gezählt wird nur, wie oft
            Taktland geöffnet wird, nur als Zahlen je Tag.
          </p>
          <Zuruecksetzen />
          {index && <p className="mt-1">Daten geladen am {index.stand.split('-').map(Number).reverse().join('.')}</p>}
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
