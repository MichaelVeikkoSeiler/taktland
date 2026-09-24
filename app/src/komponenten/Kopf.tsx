import anleitungDunkel from '../assets/auftakt-anleitung-dunkel.webp'
import anleitungHell from '../assets/auftakt-anleitung-hell.webp'
import bahnhoefeDunkel from '../assets/auftakt-bahnhoefe-dunkel.webp'
import bahnhoefeHell from '../assets/auftakt-bahnhoefe-hell.webp'
import brueckenDunkel from '../assets/auftakt-bruecken-dunkel.webp'
import brueckenHell from '../assets/auftakt-bruecken-hell.webp'
import duellDunkel from '../assets/auftakt-duell-dunkel.webp'
import duellHell from '../assets/auftakt-duell-hell.webp'
import linienDunkel from '../assets/auftakt-linien-dunkel.webp'
import linienHell from '../assets/auftakt-linien-hell.webp'
import standortDunkel from '../assets/auftakt-standort-dunkel.webp'
import standortHell from '../assets/auftakt-standort-hell.webp'
import startDunkel from '../assets/auftakt-start-dunkel.webp'
import startHell from '../assets/auftakt-start-hell.webp'
import tunnelDunkel from '../assets/auftakt-tunnel-dunkel.webp'
import tunnelHell from '../assets/auftakt-tunnel-hell.webp'
import { useEffect } from 'react'
import { Aktualisieren } from './Aktualisieren'
import { Auftakt, type AuftaktBild } from './Auftakt'

export type Bereich = 'bahnhoefe' | 'linien' | 'tunnel' | 'bruecken' | 'duell' | 'standort' | 'logbuch'

/** Die Unterreiter von «Bahnland», in dieser Reihenfolge */
const OBJEKTE: Array<{ bereich: Bereich; text: string; adresse: string }> = [
  // die Startseite (#/) ist die Einleitung; die Bahnhöfe sind ein Bereich wie die anderen
  { bereich: 'bahnhoefe', text: 'Bahnhöfe', adresse: '#/bahnhoefe' },
  // Michael, 2026-09-22: «Bereich Linien soll neu Strecken heissen», Brücken vor Tunnel
  { bereich: 'linien', text: 'Strecken', adresse: '#/strecken' },
  { bereich: 'bruecken', text: 'Brücken', adresse: '#/bruecken' },
  { bereich: 'tunnel', text: 'Tunnel', adresse: '#/tunnel' },
]

/** Die Hauptreiter. Bahnhöfe, Strecken, Brücken und Tunnel sind unter «Bahnland»
 *  zusammengefasst (Michael, 2026-09-25: «ziemlich eng, alle diese Reiter
 *  nebeneinander»); ihre Unterreiter erscheinen, sobald man dort ist. */
const HAUPT: Array<{ schluessel: string; text: string; bereiche: Bereich[]; adresse?: string }> = [
  { schluessel: 'objekte', text: 'Bahnland', bereiche: OBJEKTE.map((o) => o.bereich) },  // Name: Michael, 2026-09-25
  { schluessel: 'duell', text: 'Duell', bereiche: ['duell'], adresse: '#/duell' },
  { schluessel: 'standort', text: 'Standort', bereiche: ['standort'], adresse: '#/standort' },
  // Michael, 2026-09-25: «Bitte ein neuer Reiter Logbuch»
  { schluessel: 'logbuch', text: 'Logbuch', bereiche: ['logbuch'], adresse: '#/logbuch' },
]

/** «Bahnland» führt dorthin zurück, wo man zuletzt war, am Anfang zu den Bahnhöfen */
let letzteObjekte = OBJEKTE[0]

/** Auftaktbilder je Bereich, dazu eines für die Anleitung. Ein Bereich ohne
 *  Eintrag erscheint ohne Bild. */
const BILDER: Partial<Record<Bereich | 'anleitung' | 'start', AuftaktBild>> = {
  start: {
    hell: startHell, dunkel: startDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Ein Mann wartet am Perron, davor ein Bahnübergang und ein Tunnel, dahinter ein Zug auf einem Viadukt über einem See.',
  },
  anleitung: {
    hell: anleitungHell, dunkel: anleitungDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Ein Mann mit Rucksack schaut am Perron auf sein Handy, dahinter wartende und gehende Menschen.',
  },
  bahnhoefe: {
    hell: bahnhoefeHell, dunkel: bahnhoefeDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Schräg von vorne an einem Perron: Menschen steigen aus einem Zug, andere warten in einer Reihe.',
  },
  linien: {
    hell: linienHell, dunkel: linienDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Zwei Gleise mit Fahrleitung auf einem Damm, dahinter Bäume, eine Stadt, eine Brücke über einen Fluss und Berge.',
  },
  tunnel: {
    hell: tunnelHell, dunkel: tunnelDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Ein Gleis führt in ein Tunnelportal im Fels, links Wasser mit einer Brücke, eine Stadt und Berge.',
  },
  bruecken: {
    hell: brueckenHell, dunkel: brueckenDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Eine Bahnbrücke mit Fahrleitung führt über einen Fluss, dahinter eine Stadt und Berge.',
  },
  standort: {
    hell: standortHell, dunkel: standortDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Ein Mann schaut neben dem Gleis auf eine Karte in seinem Handy, vor ihm ein Tunnelportal mit einer roten Ortsmarke, links ein See.',
  },
  duell: {
    hell: duellHell, dunkel: duellDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration in zwei Hälften: links ein moderner Bahnhof mit Passerelle, Glaslift und Zug, rechts ein kleiner Bahnhof mit Holzdach vor einem Tunnel.',
  },
}

/**
 * Kopf jeder Seite: Name, Anleitung und die Reiter der Bereiche, darüber das
 * Auftaktbild des Bereichs. Es steht auch auf den Seiten darunter, etwa auf
 * einer Bahnhofs- oder Linienseite (Michael, 2026-09-22: «Ich finde es
 * schöner, wenn die Auftaktbilder bleiben»). Die Anleitung gehört zu keinem
 * Bereich und hat ein eigenes Bild.
 */
export function Kopf({ aktiv, startseite, anleitung = false, fahrt = false }: {
  aktiv: Bereich | null
  startseite: boolean
  anleitung?: boolean
  fahrt?: boolean
}) {
  const schluessel = anleitung ? 'anleitung' : startseite ? 'start' : aktiv ?? 'bahnhoefe'
  // Fahrtmodus und Logbuch vorerst mit dem Bild der Strecken (Michael, 2026-09-24)
  const bild = fahrt || aktiv === 'logbuch' ? BILDER.linien : BILDER[schluessel]
  const titel = 'text-3xl font-bold tracking-tight'
  const objekteAktiv = OBJEKTE.find((o) => o.bereich === aktiv)
  useEffect(() => { if (objekteAktiv) letzteObjekte = objekteAktiv }, [objekteAktiv])
  return (
    <header className="border-b border-sbb-cloud px-4 pt-8 dark:border-sbb-iron">
      {/* Aktualisieren nur im Bild der Startseite (Michael, 2026-09-24) */}
      {bild && <Auftakt key={schluessel} bild={bild} oben={startseite ? <Aktualisieren /> : undefined} />}
      <div className="h-1 w-10 bg-sbb-red" aria-hidden="true" />
      <div className="mt-3 flex items-center justify-between gap-4">
        {startseite
          ? <h1 className={titel}>Taktland</h1>
          : <a href="#/" className={titel}>Taktland</a>}
        <div className="flex items-center gap-3">
          <FahrtKnopf hier={fahrt} />
          {/* auf dem Handy neben dem Namen, ab 640 Pixeln am Ende der Reiter */}
          <InfoKnopf hier={anleitung} className="flex sm:hidden" groesse="size-7" />
        </div>
      </div>
      {/* Vier Hauptreiter; unter «Bahnland» eine zweite Zeile mit den Unterreitern */}
      <nav aria-label="Bereiche"
           className="-mb-px mt-4 flex gap-x-6 overflow-x-auto text-base [scrollbar-width:none]
                      max-[359px]:gap-x-4">
        {HAUPT.map((h) => {
          const hier = aktiv !== null && h.bereiche.includes(aktiv)
          return (
            <a key={h.schluessel} href={h.adresse ?? letzteObjekte.adresse} aria-current={hier ? 'page' : undefined}
               className={`shrink-0 border-b-2 pb-2 pt-1 font-medium transition-colors ${hier
                 ? 'border-sbb-black text-sbb-black dark:border-sbb-white dark:text-sbb-white'
                 : 'border-transparent text-sbb-metal hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white'}`}>
              {h.text}
            </a>
          )
        })}
        <InfoKnopf hier={anleitung} groesse="size-6"
                   className={`ml-auto hidden border-b-2 pb-2 pt-1 sm:flex ${anleitung
                     ? 'border-sbb-black dark:border-sbb-white' : 'border-transparent'}`} />
      </nav>
      {objekteAktiv && (
        <nav aria-label="Bahnland"
             className="-mx-4 grid grid-cols-4 gap-x-1 border-t border-sbb-cloud bg-sbb-milk px-4 py-2
                        text-sm max-[359px]:text-[13px] sm:flex sm:gap-x-2 dark:border-sbb-iron dark:bg-sbb-charcoal">
          {OBJEKTE.map((o) => {
            const hier = o.bereich === aktiv
            return (
              <a key={o.bereich} href={o.adresse} aria-current={hier ? 'page' : undefined}
                 className={`px-1 py-1.5 text-center font-medium transition-colors sm:px-3 ${hier
                   ? 'bg-sbb-charcoal text-white dark:bg-sbb-white dark:text-sbb-black'
                   : 'text-sbb-metal hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white'}`}>
                {o.text}
              </a>
            )
          })}
        </nav>
      )}
    </header>
  )
}

/**
 * Der Spezialknopf zum Fahrtmodus, auf jeder Seite neben dem Namen (Michael,
 * 2026-09-24: «Eigener Spezial-Button Fahrtmodus»). Rot, weil er der
 * wichtigste Weg der App ist; offen ist er dunkler.
 */
function FahrtKnopf({ hier }: { hier: boolean }) {
  return (
    <a href="#/fahrt" aria-current={hier ? 'page' : undefined}
       className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white ${hier
         ? 'bg-sbb-red125' : 'bg-sbb-red hover:bg-sbb-red125'}`}>
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
        <path d="M5 21l2-3M19 21l-2-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <rect x="5" y="3" width="14" height="15" rx="3" fill="currentColor" />
        <rect x="7.5" y="6" width="9" height="5" rx="1" className="fill-sbb-red" />
        <circle cx="9" cy="14.5" r="1.2" className="fill-sbb-red" />
        <circle cx="15" cy="14.5" r="1.2" className="fill-sbb-red" />
      </svg>
      Fahrtmodus
    </a>
  )
}

/**
 * Der Weg zur Anleitung «So funktioniert’s»: ein «i» im Kreis statt eines
 * Textlinks (Michael, 2026-09-22). Geöffnet ist die Fläche SBB-Blau, sonst
 * hellgrau; das «i» ist immer weiss.
 */
function InfoKnopf({ hier, className, groesse }: { hier: boolean; className: string; groesse: string }) {
  return (
    <a href="#/anleitung" aria-label="So funktioniert’s" title="So funktioniert’s"
       aria-current={hier ? 'page' : undefined}
       className={`${className} group shrink-0 items-center justify-center`}>
      <svg viewBox="0 0 24 24" className={groesse} aria-hidden="true">
        <circle cx="12" cy="12" r="11" className={`transition-colors ${hier
          ? 'fill-sbb-blue' : 'fill-sbb-smoke group-hover:fill-sbb-metal'}`} />
        <g className="fill-white">
          <circle cx="12" cy="7.2" r="1.45" />
          <rect x="10.85" y="10" width="2.3" height="7.8" rx="1.15" />
        </g>
      </svg>
    </a>
  )
}
