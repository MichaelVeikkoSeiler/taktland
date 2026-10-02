import anleitungDunkel from '../assets/auftakt-anleitung-dunkel.webp'
import anleitungHell from '../assets/auftakt-anleitung-hell.webp'
import bahnhoefeDunkel from '../assets/auftakt-bahnhoefe-dunkel.webp'
import bahnhoefeHell from '../assets/auftakt-bahnhoefe-hell.webp'
import brueckenDunkel from '../assets/auftakt-bruecken-dunkel.webp'
import brueckenHell from '../assets/auftakt-bruecken-hell.webp'
import duellDunkel from '../assets/auftakt-duell-dunkel.webp'
import duellHell from '../assets/auftakt-duell-hell.webp'
import logbuchDunkel from '../assets/auftakt-logbuch-dunkel.webp'
import logbuchHell from '../assets/auftakt-logbuch-hell.webp'
import fahrtDunkel from '../assets/auftakt-fahrt-dunkel.webp'
import fahrtHell from '../assets/auftakt-fahrt-hell.webp'
import linienDunkel from '../assets/auftakt-linien-dunkel.webp'
import linienHell from '../assets/auftakt-linien-hell.webp'
import standortDunkel from '../assets/auftakt-standort-dunkel.webp'
import standortHell from '../assets/auftakt-standort-hell.webp'
import startDunkel from '../assets/auftakt-start-dunkel.webp'
import startHell from '../assets/auftakt-start-hell.webp'
import tunnelDunkel from '../assets/auftakt-tunnel-dunkel.webp'
import tunnelHell from '../assets/auftakt-tunnel-hell.webp'
import { useEffect, useRef, useState } from 'react'
import { Auftakt, type AuftaktBild } from './Auftakt'
import { reiterTon } from '../audio'
import { useEinstellungen } from '../einstellungen'

export type Bereich = 'bahnhoefe' | 'linien' | 'tunnel' | 'bruecken' | 'bahnuebergaenge' | 'duell' | 'standort' | 'logbuch' | 'sammelheft' | 'favoriten' | 'audio' | 'einstellungen'

/** Die Unterreiter von «Bahnland», in dieser Reihenfolge */
const OBJEKTE: Array<{ bereich: Bereich; text: string; adresse: string }> = [
  // die Startseite (#/) ist die Einleitung; die Bahnhöfe sind ein Bereich wie die anderen
  { bereich: 'bahnhoefe', text: 'Bahnhöfe', adresse: '#/bahnhoefe' },
  // Michael, 2026-09-22: «Bereich Linien soll neu Strecken heissen», Brücken vor Tunnel
  { bereich: 'linien', text: 'Strecken', adresse: '#/strecken' },
  { bereich: 'bruecken', text: 'Brücken', adresse: '#/bruecken' },
  { bereich: 'tunnel', text: 'Tunnel', adresse: '#/tunnel' },
  // Michael, 2026-10-01: «Eigener Reiter Bahnübergänge unter Bahnland»
  { bereich: 'bahnuebergaenge', text: 'Bahnübergänge', adresse: '#/bahnuebergaenge' },
]

/** Die Unterreiter der «Reisetasche»: Logbuch, Sammelheft und Favoriten
 *  (Michael, 2026-09-25: «Umbau in Taktland: Reisetasche mit Favoriten») */
const REISETASCHE: Array<{ bereich: Bereich; text: string; adresse: string }> = [
  { bereich: 'logbuch', text: 'Logbuch', adresse: '#/logbuch' },
  { bereich: 'sammelheft', text: 'Sammelheft', adresse: '#/sammelheft' },
  { bereich: 'favoriten', text: 'Favoriten', adresse: '#/favoriten' },
  // Michael, 2026-10-01: «neuen Reiter Audio»
  { bereich: 'audio', text: 'Audio', adresse: '#/audio' },
  { bereich: 'einstellungen', text: 'Einstellungen', adresse: '#/einstellungen' },
]

/** Die Unterreiter von «Fahren» (Michael, 2026-09-29: «Fahren muss auch drei
 *  Unterseiten haben mit Neue Fahrt, Probefahren, Fahrtblatt») */
export type FahrtTeil = 'neu' | 'probe' | 'blatt'
const FAHREN: Array<{ bereich: FahrtTeil; text: string; adresse: string }> = [
  { bereich: 'neu', text: 'Neue Fahrt', adresse: '#/fahrt' },
  { bereich: 'probe', text: 'Probefahren', adresse: '#/fahrt/probe' },
  { bereich: 'blatt', text: 'Fahrtblatt', adresse: '#/fahrt/blatt' },
]

/** Die Hauptreiter. Bahnhöfe, Strecken, Brücken und Tunnel sind unter «Bahnland»
 *  zusammengefasst (Michael, 2026-09-25: «ziemlich eng, alle diese Reiter
 *  nebeneinander»); ihre Unterreiter erscheinen, sobald man dort ist. */
const HAUPT: Array<{ schluessel: string; text: string; bereiche: Bereich[]; adresse?: string }> = [
  { schluessel: 'objekte', text: 'Bahnland', bereiche: OBJEKTE.map((o) => o.bereich) },  // Name: Michael, 2026-09-25
  { schluessel: 'duell', text: 'Duell', bereiche: ['duell'], adresse: '#/duell' },
  { schluessel: 'standort', text: 'Standort', bereiche: ['standort'], adresse: '#/standort' },
  // erst «Logbuch», seit 2026-09-25 «Reisetasche» (Michael)
  { schluessel: 'reisetasche', text: 'Reisetasche', bereiche: REISETASCHE.map((r) => r.bereich), adresse: '#/logbuch' },
  // die Anleitung, bisher das «i» neben dem Namen (Michael, 2026-09-25)
  { schluessel: 'info', text: 'Info', bereiche: [], adresse: '#/anleitung' },
]

/** «Bahnland» führt dorthin zurück, wo man zuletzt war, am Anfang zu den Bahnhöfen */
let letzteObjekte = OBJEKTE[0]

/** Auftaktbilder je Bereich, dazu eines für die Anleitung. Ein Bereich ohne
 *  Eintrag erscheint ohne Bild. */
const BILDER: Partial<Record<Bereich | 'anleitung' | 'start' | 'fahrt', AuftaktBild>> = {
  start: {
    hell: startHell, dunkel: startDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Ein Mann wartet am Perron, davor ein Bahnübergang und ein Tunnel, dahinter ein Zug auf einem Viadukt über einem See.',
  },
  // Michael, 2026-09-25: «Bilder für den Reiter Info»
  anleitung: {
    hell: anleitungHell, dunkel: anleitungDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Ein Mann sitzt am Bahnhof an einem Tisch und liest auf dem Handy eine Seite mit einem Info-Zeichen, links ein Zug am Perron, rechts ein See mit Dorf und Bergen.',
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
  // Michael, 2026-09-25: «Bilder für den Fahrtmodus»
  fahrt: {
    hell: fahrtHell, dunkel: fahrtDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Blick aus dem Zugfenster auf ein Tunnelportal, einen See mit Dorf und Berge, auf dem Tisch ein Handy mit Taktland, das einen Tunnel meldet.',
  },
  // Michael, 2026-09-25: «Bilder fürs Logbuch hell und dunkel»
  logbuch: {
    hell: logbuchHell, dunkel: logbuchDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Blick aus dem Zugfenster auf einen See mit Uferort, Kirchturm und Viadukt, auf dem Tisch ein offenes rotes Notizbuch mit einer Strecke aus Punkten, ein Handy und ein Becher.',
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
export function Kopf({ aktiv, startseite, anleitung = false, fahrt = null }: {
  aktiv: Bereich | null
  startseite: boolean
  anleitung?: boolean
  /** unter «Fahren»: welche Unterseite */
  fahrt?: FahrtTeil | null
}) {
  const schluessel = anleitung ? 'anleitung' : startseite ? 'start' : aktiv ?? 'bahnhoefe'
  // die ganze Reisetasche mit dem Bild des Logbuchs
  const bild = fahrt ? BILDER.fahrt
    : aktiv === 'sammelheft' || aktiv === 'favoriten' || aktiv === 'audio' || aktiv === 'einstellungen' ? BILDER.logbuch
    // die Bahnübergänge mit dem Bild der Startseite, darauf ist einer zu sehen
    : aktiv === 'bahnuebergaenge' ? BILDER.start : BILDER[schluessel]
  const titel = 'text-3xl font-bold tracking-tight'
  const objekteAktiv = OBJEKTE.find((o) => o.bereich === aktiv)
  useEffect(() => { if (objekteAktiv) letzteObjekte = objekteAktiv }, [objekteAktiv])
  // unter «Bahnland», «Reisetasche» und «Fahren» eine zweite Zeile mit den Unterreitern
  const unter: { name: string; liste: Array<{ bereich: string; text: string; adresse: string }>; raster: string } | null =
    fahrt ? { name: 'Fahren', liste: FAHREN, raster: 'flex' }
    : objekteAktiv ? { name: 'Bahnland', liste: OBJEKTE, raster: 'flex' }
    : REISETASCHE.some((l) => l.bereich === aktiv) ? { name: 'Reisetasche', liste: REISETASCHE, raster: 'flex' } : null
  const unterAktiv: string | null = fahrt ?? aktiv
  const unterLeiste = useRef<HTMLElement>(null)
  const schrift = useEinstellungen()
  useEffect(() => {
    const leiste = unterLeiste.current
    const hier = leiste?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!leiste || !hier) return
    // ganz ins Bild, mit dem Rand von 16 px; auch wenn eine andere Schrift die Zeile verbreitert
    const rechts = hier.offsetLeft + hier.offsetWidth + 16 - leiste.clientWidth
    if (rechts > leiste.scrollLeft) leiste.scrollLeft = rechts
    else if (hier.offsetLeft - 16 < leiste.scrollLeft) leiste.scrollLeft = hier.offsetLeft - 16
  }, [unterAktiv, schrift.groesse, schrift.schrift])
  return (
    <header className="print:hidden border-b border-sbb-cloud px-4 pt-8 dark:border-sbb-iron">
      {/* ohne Knopf «Aktualisieren»: neue Versionen lädt die App von selbst (serviceWorker.ts;
          Michael, 2026-10-01: «benötigen wir nicht mehr») */}
      {bild && <Auftakt key={schluessel} bild={bild} />}
      <div className="flex items-center justify-between gap-4">
        {/* die Bildmarke vor dem Namen, statt des roten Strichs (Michael, 2026-09-27) */}
        {startseite
          ? <h1 className={`${titel} flex items-center gap-3`}><Bildmarke />Taktland</h1>
          : <a href="#/" className={`${titel} flex items-center gap-3`}><Bildmarke />Taktland</a>}
        {/* ganz rechts; das «i» ist zum Reiter «Info» geworden (Michael, 2026-09-25) */}
        <FahrtKnopf hier={fahrt !== null} />
      </div>
      {/* Fünf Hauptreiter; unter «Bahnland» eine zweite Zeile mit den Unterreitern */}
      <Schiebeleiste name="Bereiche" aussen="-mb-px mt-4" grund="bg-white dark:bg-sbb-midnight"
           className="flex justify-between gap-x-2 text-base
                      max-[359px]:gap-x-1.5 max-[359px]:text-[14px] sm:justify-start sm:gap-x-6">
        {HAUPT.map((h) => {
          const hier = (h.schluessel === 'info' && anleitung) || (aktiv !== null && h.bereiche.includes(aktiv))
          return (
            <a key={h.schluessel} href={h.adresse ?? letzteObjekte.adresse} aria-current={hier ? 'page' : undefined}
               onClick={reiterTon}
               className={`shrink-0 border-b-2 pb-2 pt-1 font-medium transition-colors ${hier
                 ? 'border-sbb-black text-sbb-black dark:border-sbb-white dark:text-sbb-white'
                 : 'border-transparent text-sbb-metal hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white'}`}>
              {h.text}
            </a>
          )
        })}
      </Schiebeleiste>
      {unter && (
        // passt die Zeile nicht (fünf Reiter, grosse Schrift), lässt sie sich seitlich schieben;
        // der gewählte Reiter rückt ins Bild, ohne die Seite zu bewegen
        <Schiebeleiste name={unter.name} leiste={unterLeiste}
             aussen="-mx-4 border-t border-sbb-cloud bg-sbb-milk dark:border-sbb-iron dark:bg-sbb-charcoal"
             grund="bg-sbb-milk dark:bg-sbb-charcoal"
             className={`${unter.raster} gap-x-1 px-4 py-2 text-sm max-[359px]:text-[13px] sm:gap-x-2`}>
          {unter.liste.map((o) => {
            const hier = o.bereich === unterAktiv
            return (
              <a key={o.bereich} href={o.adresse} aria-current={hier ? 'page' : undefined} onClick={reiterTon}
                 className={`shrink-0 whitespace-nowrap rounded-lg py-1.5 text-center font-medium ${unter.raster === 'flex' ? 'px-3' : 'px-1'} transition-colors sm:px-3 ${hier
                   ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                   : 'text-sbb-metal hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white'}`}>
                {o.text}
              </a>
            )
          })}
        </Schiebeleiste>
      )}
    </header>
  )
}

/**
 * Eine Reiterzeile, die sich seitlich schieben lässt, wenn sie nicht ins Bild passt.
 * Liegt links oder rechts noch etwas verborgen, steht dort ein einfacher Pfeil ohne
 * Stamm; ein Tipp darauf schiebt die Zeile weiter (Michael, 2026-10-02).
 */
function Schiebeleiste({ name, aussen, grund, className, leiste, children }: {
  name: string
  /** Rand und Hintergrund um die Zeile */
  aussen: string
  /** Hintergrund unter den Pfeilen, wie die Zeile */
  grund: string
  className: string
  leiste?: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}) {
  const eigene = useRef<HTMLElement | null>(null)
  const nav = leiste ?? eigene
  const [mehr, setMehr] = useState({ links: false, rechts: false })
  useEffect(() => {
    const el = nav.current
    if (!el) return
    const pruefen = () => {
      const links = el.scrollLeft > 2
      const rechts = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
      setMehr((alt) => (alt.links === links && alt.rechts === rechts ? alt : { links, rechts }))
    }
    pruefen()
    el.addEventListener('scroll', pruefen, { passive: true })
    const ro = new ResizeObserver(pruefen)
    ro.observe(el)
    for (const k of el.children) ro.observe(k)
    return () => { el.removeEventListener('scroll', pruefen); ro.disconnect() }
  })
  const schieben = (richtung: 1 | -1) => {
    const el = nav.current
    if (el) el.scrollBy({ left: richtung * el.clientWidth * 0.6, behavior: 'smooth' })
  }
  const pfeil = (seite: 'links' | 'rechts') => mehr[seite] && (
    <button type="button" tabIndex={-1} onClick={() => schieben(seite === 'links' ? -1 : 1)}
            aria-label={`${name}: weitere Reiter ${seite}`}
            className={`absolute inset-y-0 ${seite === 'links' ? 'left-0' : 'right-0'} z-10 flex w-7 items-center
                        justify-center text-sbb-black dark:text-sbb-white ${grund}`}>
      <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
        <path d={seite === 'links' ? 'M7.5 2 3.5 6l4 4' : 'M4.5 2l4 4-4 4'} fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
  return (
    <div className={`relative ${aussen}`}>
      <nav aria-label={name} ref={(el) => { nav.current = el }}
           className={`overflow-x-auto [scrollbar-width:none] ${className}`}>
        {children}
      </nav>
      {pfeil('links')}
      {pfeil('rechts')}
    </div>
  )
}

/**
 * Der Spezialknopf zum Fahrtmodus, auf jeder Seite neben dem Namen (Michael,
 * 2026-09-24: «Eigener Spezial-Button Fahrtmodus»). Rot, weil er der
 * wichtigste Weg der App ist; offen ist er dunkler. Schrift so gross wie die
 * Reiter, ohne Zug-Zeichen (Michael, 2026-09-25).
 */
function FahrtKnopf({ hier }: { hier: boolean }) {
  return (
    <a href="#/fahrt" aria-current={hier ? 'page' : undefined}
       className={`shrink-0 rounded-lg px-3 py-1.5 text-base font-bold text-white max-[359px]:text-[14px] ${hier
         ? 'bg-sbb-red125' : 'bg-sbb-red hover:bg-sbb-red125'}`}>
      Fahren
    </a>
  )
}

/** Die Bildmarke von Taktland (app/public/logo.svg); der Name steht daneben als Text */
function Bildmarke() {
  return <img src="./logo.svg" alt="" className="size-9 shrink-0" />
}
