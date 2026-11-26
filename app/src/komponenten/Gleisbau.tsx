import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { abfahrtsPfiff, antwortTon, kirchenSchlag, knopfTon, zuggeraeuschAus, zuggeraeuschTempo } from '../audio'
import {
  type Brett, brettAusCode, brettCode, bretterLesen, bretterMerken, type GespeichertesBrett, neueId, type Gleis, bahnhofGruppen, bahnhofNamen, bahnhofTitel, type Dreh, type Feld, type GleisArt, groesseAendern, type Grund, leer,
  anfangZumGriff, grossAnfang, grosseEntfernen, grosseKurve, grosseLegen, grossGeometrie, ampelGilt, istBahnhof, istWeiche, linieLegen, endenWeg, strassenNachbarn, strasseVerbinden, DXY, offeneEnden, strasseMoeglich, spalten, type Stueck, stueckLaenge, stueckPunkt, tunnelWeiter, tunnelWeiterAnKante, verschieben, type WagenLage, WAGEN_LAENGE, wege, wegPunkte, zeilen, Zug, zufallsBeispiel,
  WAGEN, WAGEN_MIN, WAGEN_MAX, bauGilt, gueterGilt, zugStartGilt, ohneStrasse, strasseGerade, ueberWasser, wagenGilt, knotenGruppen, HALT_S, brettRand, MIN_SEITE, MAX_BREITE, MAX_HOEHE,
} from '../gleisbau'
import { Zurueck } from './Zurueck'
import { Klappe } from './Klappe'
import { type Aufgabe, AUFGABEN, bewerten, type Transport, type Ergebnis, fortschrittLesen, fortschrittMerken, reiheArbeitMerken, reiheGeloestMerken } from '../gleisbauAufgaben'
import { indexLaden } from '../daten'
import { type Fahrgaeste, fahrgaesteHalt, fahrgaesteStart, fahrgaesteZeit } from '../gleisbauFahrgaeste'
import GleisbauBretter, { brettLink, GroesseWahl } from './GleisbauBretter'
import { bild, GelaendeBild, GELAENDE_NAMEN, GelaendeVerlaeufe, Landschaft, WiesenMuster, masse, MusterDefs, type Objekt, ObjektBild, objekteBauen, PortalBild, SchrankenBild, StrassenBild, StrassenUeberBild, BusBild } from './GleisbauBilder'
import { Bus, type BusLage, strassenNetz } from '../gleisbauBus'
import { type Gueter, gueterHalt, gueterStart, gueterZeit, type Ladung } from '../gleisbauGueter'
import { GUETER, LOKS, type LokTyp, WAGEN_ARTEN, type Zusammenstellung } from '../gleisbauFahrzeuge'
import { AUFTRAEGE, type Auftrag, auftragAlsAufgabe, type Betrieb, betriebLesen, betriebMerken, WIEDERHOLT_ANTEIL } from '../gleisbauBetrieb'
import BetriebSeite, { ZugWahl } from './GleisbauBetrieb'

const LEISE = 'text-sm text-sbb-metal dark:text-sbb-storm'

/**
 * Farben des Bretts (gewählt): ein dunkles Tablett mit hellen Feldern wie in Michaels Vorlage «VIA», die Häuser des Dorfs in deren
 * Farben, Gleise in Anthrazit, Akzente in Karmin wie in Taktland
 */
// seit 2026-11-22 frischer, nach Michaels Bild eines Bretts mit Bergen, Wald, Dorf und See (Michael: «Wäre das nicht schöner?», dann «Ja, 2D-Brett
// so überarbeiten wie vorgeschlagen»): kräftigeres Grün, tiefblaues Wasser, Berge mit heller und dunkler Flanke und Schnee, Nadel- und Laubbäume,
// rote Dächer, Kacheln mit dunklerer Unterkante; weiterhin flache Flächen ohne Verläufe wie überall in Taktland
const KARMIN = '#a8102e'
const F = {
  tablett: '#3a3a3c', wiese: '#c4e19f', wald: '#aed38c', wasser: '#4d93d6', welle: '#a4cef2',
  berg: '#cfd6c4', deckel: '#aeb6a2', fels: '#8f9398', felsDunkel: '#6f7378', schnee: '#ffffff', schneeDunkel: '#dde3ea',
  laub: ['#6cb54f', '#7cc35a', '#5aa443'], laubSchatten: '#4b8f37', nadel: '#2f7d3c', nadelSchatten: '#24652f', stamm: '#7a5a3c',
  schotter: '#c2bbb0', schwelle: '#8b8074', schiene: '#4a4a4a',
  perron: '#d2d2d2', strasse: '#d8d1c4', dach: '#6a6a6a', bahnhofDach: '#c4452f', bahnhofFirst: '#8f2a1c', bruecke: '#d6d6d6', gelaender: '#7a7a7a', portal: '#2e2e30', karmin: '#a8102e',
  wand: '#f4f1ea', ziegel: ['#d4583e', '#c94a32', '#b8452f'], ziegelSchatten: '#9e3a27',
}
/** die Unterkante jeder Kachel, damit sie leicht erhaben wirkt (gewählt) */
const KANTE = { wiese: '#9fc47a', wald: '#89b56a', wasser: '#336fb0', berg: '#a9b19d', dorf: '#9fc47a', rebberg: '#86ad4c', schnee: '#b7c7e2', acker: '#8a5530' }
const KACHEL_H = 0.915

type Werkzeug =
  | { art: 'linie' } | { art: 'name' } | { art: 'ampel' } | { art: 'gleis'; gleis: GleisArt } | { art: 'tunnel' } | { art: 'bruecke' } | { art: 'grund'; grund: Grund } | { art: 'strasse' } | { art: 'weg' }
  | { art: 'fluss' } | { art: 'wagen' } | { art: 'knoten' } | { art: 'hang' } | { art: 'strom' }
  | { art: 'haltestelle' } | { art: 'wende' } | { art: 'strbruecke' } | { art: 'strtunnel' } | { art: 'zug'; zug: 'p' | 'g' }
  | { art: 'bau'; bau: 'depot' | 'gueter' | 'galerie' } | { art: 'objekt'; objekt: 'kirche' | 'bauernhof' }

const GLEISE: Array<{ w: Werkzeug; text: string }> = [
  { w: { art: 'linie' }, text: 'Linie' },
  { w: { art: 'gleis', gleis: 'gerade' }, text: 'Gerade' },
  { w: { art: 'gleis', gleis: 'kurve' }, text: 'Kurve' },
  // ohne «2 × 2» und «3 × 3», das Bild zeigt die Kacheln (Michael, 2026-11-25: «2x2 und 3x3 muss nicht stehen man sieht ja die Kacheln»)
  { w: { art: 'gleis', gleis: 'bogen2' }, text: 'Kurve' },
  { w: { art: 'gleis', gleis: 'bogen3' }, text: 'Kurve' },
  { w: { art: 'gleis', gleis: 'weiche' }, text: 'Weiche R' },
  { w: { art: 'gleis', gleis: 'weiche_l' }, text: 'Weiche L' },
  { w: { art: 'gleis', gleis: 'dreiweg' }, text: 'Dreiweg' },
  { w: { art: 'gleis', gleis: 'kreuzung' }, text: 'Kreuzung' },
  { w: { art: 'gleis', gleis: 'ueberfuehrung' }, text: 'Überführung' },
  { w: { art: 'gleis', gleis: 'doppelkurve' }, text: 'Doppelkurve' },
  { w: { art: 'gleis', gleis: 'prellbock' }, text: 'Prellbock' },
  { w: { art: 'zug', zug: 'p' }, text: 'Personenzug' },
  { w: { art: 'zug', zug: 'g' }, text: 'Güterzug' },
  { w: { art: 'wagen' }, text: 'Wagen' },
  { w: { art: 'strom' }, text: 'Ohne Strom' },
  { w: { art: 'gleis', gleis: 'bahnhof' }, text: 'Bahnhof' },
  { w: { art: 'name' }, text: 'Name' },
  { w: { art: 'tunnel' }, text: 'Tunnel' },
  { w: { art: 'ampel' }, text: 'Ampel' },
  { w: { art: 'knoten' }, text: 'Knoten' },
  { w: { art: 'bau', bau: 'depot' }, text: 'Depot' },
  { w: { art: 'bau', bau: 'gueter' }, text: 'Güter' },
  { w: { art: 'bau', bau: 'galerie' }, text: 'Galerie' },
  { w: { art: 'bruecke' }, text: 'Brücke' },
]
const LANDSCHAFT: Array<{ w: Werkzeug; text: string }> = [
  { w: { art: 'grund', grund: 'wiese' }, text: 'Wiese' },
  { w: { art: 'grund', grund: 'wald' }, text: 'Wald' },
  { w: { art: 'grund', grund: 'wasser' }, text: 'Wasser' },
  { w: { art: 'fluss' }, text: 'Fluss' },
  { w: { art: 'hang' }, text: 'Gelände' },
  { w: { art: 'grund', grund: 'berg' }, text: 'Berg' },
  { w: { art: 'grund', grund: 'dorf' }, text: 'Dorf' },
  { w: { art: 'grund', grund: 'rebberg' }, text: 'Rebberg' },
  { w: { art: 'grund', grund: 'schnee' }, text: 'Schnee' },
  { w: { art: 'grund', grund: 'acker' }, text: 'Acker' },
  { w: { art: 'objekt', objekt: 'kirche' }, text: 'Kirche' },
  { w: { art: 'objekt', objekt: 'bauernhof' }, text: 'Bauernhof' },
  { w: { art: 'strasse' }, text: 'Strasse' },
  { w: { art: 'weg' }, text: 'Entfernen' },
]
/** die Strassen für Busse in einem eigenen Reiter (seit 2026-11-25; Michael: «Gerne alle») */
const STRASSEN: Array<{ w: Werkzeug; text: string }> = [
  { w: { art: 'strasse' }, text: 'Strasse' },
  { w: { art: 'haltestelle' }, text: 'Haltestelle' },
  { w: { art: 'wende' }, text: 'Wendeplatz' },
  { w: { art: 'strbruecke' }, text: 'Brücke' },
  { w: { art: 'strtunnel' }, text: 'Tunnel' },
  { w: { art: 'weg' }, text: 'Entfernen' },
]

/** die Werkzeuge unten in Reitern; die Züge seit 2026-11-26 in einem eigenen (Michael: «Bitte die Züge in einer separaten Kategorie auswählbar und nicht unter Gleise») */
const GRUPPEN = [
  { titel: 'Gleise', l: GLEISE.filter((x) => x.w.art === 'linie' || x.w.art === 'strom' || (x.w.art === 'gleis' && x.w.gleis !== 'bahnhof')) },
  { titel: 'Züge', l: GLEISE.filter((x) => x.w.art === 'zug' || x.w.art === 'wagen') },
  { titel: 'Bauwerke', l: GLEISE.filter((x) => (x.w.art === 'gleis' && x.w.gleis === 'bahnhof') || ['name', 'tunnel', 'bruecke', 'ampel', 'bau', 'knoten'].includes(x.w.art)) },
  { titel: 'Strasse', l: STRASSEN },
  { titel: 'Landschaft', l: LANDSCHAFT.filter((x) => x.w.art !== 'strasse') },
]

/**
 * Taktfahrplan (Michael, 2026-11-24: «Ich denke an ein Taktsystem nach Vorbild vom Schweizerischen ÖV», «Im gleichen Spiel ergänzen und evtl wenn man den Takt
 * aktiviert erscheinen dazu passende Features»): eine Spielminute dauert eine Sekunde, die Uhr beginnt um 7 Uhr (beides gewählt); an Knoten fahren die Züge zur
 * nächsten Taktzeit ab, frühestens nach dem üblichen Halt
 */
const TAKT_WAHL = [0, 15, 30, 60] as const, UHR_START_MIN = 7 * 60
const uhrText = (sek: number) => { const m = UHR_START_MIN + Math.floor(sek); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

/** Werkzeuge, die man über mehrere Felder ziehen kann */
const MAL_WERKZEUGE: Array<Werkzeug['art']> = ['grund', 'fluss', 'strasse', 'strom']

/** ein Werkzeug auf viele Felder auf einmal: Boden setzen, Fluss oder Strasse legen, wo es geht (ohne Wechsel hin und zurück wie beim Tippen) */
function malenAnwenden(b: Brett, felder: Array<[number, number]>, w: Werkzeug): Brett {
  const neu = b.map((z) => z.map((f) => ({ ...f })))
  let geaendert = false
  // eine Strasse kreuzt ein Gleis nur quer: liegt die Gerade längs zum Weg, bleibt das Feld ohne Strasse
  const laengs = (k: number) => {
    const [i, j] = felder[k], g = neu[j]?.[i]?.gleis
    if (!g || g.art !== 'gerade') return false
    const nachbarn = [felder[k - 1], felder[k + 1]].filter(Boolean)
    return nachbarn.some(([u]) => (u === i) === (g.dreh % 2 === 0))
  }
  for (const [kk, [i, j]] of felder.entries()) {
    const f = neu[j]?.[i]
    if (!f) continue
    if (w.art === 'strasse' && laengs(kk)) continue
    if (w.art === 'grund') {
      if (f.teil || grosseKurve(f.gleis) || f.grund === w.grund) continue
      f.grund = w.grund
      if (w.grund === 'wasser' || w.grund === 'berg') delete f.fluss
      // die Strasse bleibt: über Wasser eine Brücke, im Berg ein Tunnel; mit Gleis geht das nicht
      if (f.strasse && strasseMoeglich(f)) neu[j][i] = ohneStrasse(f)
      geaendert = true
    } else if (w.art === 'fluss') {
      if (f.fluss || f.grund === 'wasser' || f.grund === 'berg' || (f.strasse && f.gleis)) continue
      f.fluss = true; geaendert = true
    } else if (w.art === 'strasse') {
      if (f.strasse || strasseMoeglich(f)) continue
      // neu gezogene Strassen führen nur dorthin, wohin gezogen wird (unten verbunden)
      f.strasse = true; f.strKanten = 0; geaendert = true
    } else if (w.art === 'strom') {
      if (f.ohneStrom || !(f.gleis || f.teil)) continue
      f.ohneStrom = true; geaendert = true
    }
  }
  // Strassen genau so verbinden, wie gezogen (Michael, 2026-11-26): je zwei Felder hintereinander auf dem Weg
  if (w.art === 'strasse') for (let k = 1; k < felder.length; k++) {
    const [ai, aj] = felder[k - 1], [ci, cj] = felder[k]
    const r = [0, 1, 2, 3].find((d) => ai + DXY[0][d] === ci && aj + DXY[1][d] === cj)
    if (r === undefined || !neu[aj]?.[ai]?.strasse || !neu[cj]?.[ci]?.strasse) continue
    const vorher = JSON.stringify([neu[aj][ai].strKanten, neu[cj][ci].strKanten])
    strasseVerbinden(neu, ai, aj, r)
    if (JSON.stringify([neu[aj][ai].strKanten, neu[cj][ci].strKanten]) !== vorher) geaendert = true
  }
  return geaendert ? neu : b
}

const gleich = (a: Werkzeug, b: Werkzeug) => JSON.stringify(a) === JSON.stringify(b)

/** nach so vielen Sekunden gegenseitigen Wartens kehrt ein Zug um; Spitze des zweiten Zugs in Blau statt Karmin (beides gewählt) */
const UMKEHREN_NACH_S = 2.5
/** wie nah an der Mitte eines Wagens ein Tipp den Zug trifft, in Feldern (gewählt) */
const ZUG_TIPP = 0.35
/** Farbe der Spitze je Zug ab dem zweiten (gewählt) */
const ZUG_FARBEN = ['#1f5fa8', '#2e7d32', '#e07b00'], ZUEGE_MAX = 4
/** Güterzug: Lok in Stahlblau, Wagen rotbraun mit Rippen (gewählt) */
const GUETER_LOK = '#3f6382', GUETER_WAGEN = '#8a4b32'
/** Busse (seit 2026-11-25): bis vier, je eine Farbe (gewählt) */
const BUS_FARBEN = ['#f0b323', '#2a9d8f', '#8e5bb5', '#e76f51']

/**
 * Signale an Weichen und Kreuzungen, nur mit mehreren Zügen: rot, solange ein Zug das Feld belegt, sonst grün; ein kleiner Mast in der Ecke oben links
 * (gewählt). Ein Zug fährt nie in ein belegtes Feld ein
 */
function SignalBild({ brett, belegt }: { brett: Brett; belegt: Array<Set<string>> }) {
  const raus = []
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const g = brett[j][i].gleis
    if (!g || !(istWeiche(g) || g.art === 'kreuzung' || g.art === 'doppelkurve')) continue
    const rot = belegt.some((b) => b.has(`${i},${j}`))
    raus.push(
      <g key={`${i},${j}`} pointerEvents="none">
        <rect x={i + 0.1} y={j + 0.08} width={0.1} height={0.17} rx={0.03} fill="#2b2b2e" />
        <circle cx={i + 0.15} cy={j + 0.13} r={0.03} fill={rot ? '#ff3b30' : '#3a3a3c'} />
        <circle cx={i + 0.15} cy={j + 0.2} r={0.03} fill={rot ? '#3a3a3c' : '#34c759'} />
      </g>,
    )
  }
  return <>{raus}</>
}

// ohne Akzente, und ae, oe, ue wie a, o, u (so findet «zueri» Zürich)
const ohneAkzente = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/([aou])e/g, '$1')

/** die Schilder der Bahnhöfe über allem: der Buchstabe, mit einem gewählten Namen daneben (gekürzt, wenn er zu lang ist) */
/** die Namen der Anlagen an den Güterschuppen im Bahnbetrieb, mit einem Punkt in der Farbe des Guts, das dort wartet */
function AnlagenBild({ brett }: { brett: Brett }) {
  const raus = []
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const f = brett[j][i]
    if (!f.anlage || !gueterGilt(f)) continue
    const t = f.anlage.length > 22 ? `${f.anlage.slice(0, 21)}…` : f.anlage, breit = 0.12 + t.length * 0.068
    raus.push(
      <g key={`${i},${j}`} pointerEvents="none">
        <rect x={i + 0.06} y={j + 0.72} width={breit} height={0.2} rx={0.03} fill="#5a3a24" />
        <text x={i + 0.12} y={j + 0.865} fontSize={0.13} fontWeight={600} fill="#ffffff">{t}</text>
      </g>,
    )
  }
  return <>{raus}</>
}

/**
 * das Schild eines Bahnhofs; mass vergrössert es um seine Ecke oben links, wenn die Felder auf dem Bildschirm klein sind (Michael, 2026-11-26, Handy: «Die Ortsnamen
 * kann man so fast gar nicht lesen … einfach das Schild über mehrere Kacheln hinüberziehen»)
 */
function SchildBild({ namen, titel, knoten, takt, mass = 1 }: { namen: Map<string, string>; titel: Map<string, string>; knoten: Set<string>; takt: number; mass?: number }) {
  const raus = []
  for (const [k, n] of namen) {
    const [i, j] = k.split(',').map(Number)
    const t = titel.get(n)
    const kurz = t && t.length > 20 ? `${t.slice(0, 19)}…` : t
    const breit = kurz ? 0.24 + kurz.length * 0.072 : 0.2
    raus.push(
      // vergrössert wächst es nach oben in das Feld darüber, nicht über das Gleis; in der obersten Reihe nach unten
      <g key={k} pointerEvents="none" transform={mass !== 1 ? `translate(${i + 0.06} ${j + (j > 0 ? 0.26 : 0.06)}) scale(${mass}) translate(${-(i + 0.06)} ${-(j + (j > 0 ? 0.26 : 0.06))})` : undefined}>
        <rect x={i + 0.06} y={j + 0.06} width={breit} height={0.2} rx={0.03} fill="#3d3d3d" />
        <text x={i + 0.16} y={j + 0.215} fontSize={0.15} fontWeight={700} textAnchor="middle" fill="#ffffff">{n}</text>
        {kurz && <text x={i + 0.27} y={j + 0.205} fontSize={0.13} fontWeight={500} fill="#ffffff">{kurz}</text>}
        {/* am Knoten nur ein Uhrsymbol rechts neben dem Schild (Michael, 2026-11-25: «Bei den Taktbahnhöfen soll nur eine Uhr stehen»; vorher die Abfahrtszeiten) */}
        {takt > 0 && knoten.has(n) && (
          <g transform={`translate(${i + 0.2 + breit} ${j + 0.16})`}>
            <circle r={0.085} fill="#ffffff" stroke={F.karmin} strokeWidth={0.028} />
            <path d="M0,0 L0,-0.055 M0,0 L0.04,0.015" stroke="#3d3d3d" strokeWidth={0.018} strokeLinecap="round" />
          </g>
        )}
      </g>,
    )
  }
  return <>{raus}</>
}

/**
 * die Uhr des Taktfahrplans auf den vier Feldern oben links (Michael, 2026-11-25: «Die 4 oben links Kacheln sollen für eine einfache analoge Uhr Platz
 * machen, sofern das Brett nach Taktfahrplan funktionieren soll»): helles Zifferblatt mit Strichen, Stunden- und Minutenzeiger, ohne Sekundenzeiger;
 * zeigt die Zeit im Spiel, vor der Fahrt den Anfang. Gestalt gewählt, keiner bestimmten Uhr nachgebildet; darunter wird nicht gebaut
 */
const UHR_FELDER = 2
const uhrFeld = (i: number, j: number) => i < UHR_FELDER && j < UHR_FELDER
/** unter der Uhr ist nichts (Michael, 2026-11-25: «Unter der Uhr soll nichts sein. Ist was dort wird es gelöscht»): die vier Felder werden Wiese,
 *  eine grosse Kurve, die hineinreicht, fällt ganz weg; das Brett bleibt dasselbe, wenn dort schon nichts ist */
function uhrPlatz(b: Brett): Brett {
  let n = b
  for (let j = 0; j < UHR_FELDER; j++) for (let i = 0; i < UHR_FELDER; i++) if (n[j]?.[i] && (n[j][i].teil || grosseKurve(n[j][i].gleis))) n = grosseEntfernen(n, i, j)
  const leer = (f: Feld) => Object.keys(f).length === 1 && f.grund === 'wiese'
  if (n === b && b.slice(0, UHR_FELDER).every((z) => z.slice(0, UHR_FELDER).every(leer))) return b
  return n.map((z, j) => (j < UHR_FELDER ? z.map((f, i) => (i < UHR_FELDER ? { grund: 'wiese' as Grund } : f)) : z))
}
function UhrBild({ minuten }: { minuten: number }) {
  const c = UHR_FELDER / 2, r = c * 0.86
  const std = ((minuten / 60) % 12) * 30, min = (minuten % 60) * 6
  const zeiger = (grad: number, lang: number, breit: number) => {
    const a = ((grad - 90) * Math.PI) / 180
    return <line x1={c - Math.cos(a) * r * 0.12} y1={c - Math.sin(a) * r * 0.12} x2={c + Math.cos(a) * r * lang} y2={c + Math.sin(a) * r * lang} stroke="#2a2a2a" strokeWidth={breit} strokeLinecap="round" />
  }
  return (
    <g pointerEvents="none">
      <rect x={0.03} y={0.03} width={UHR_FELDER - 0.06} height={UHR_FELDER - 0.06} rx={0.1} fill={F.tablett} />
      <circle cx={c + 0.03} cy={c + 0.05} r={r} fill="#000000" opacity={0.25} />
      <circle cx={c} cy={c} r={r} fill="#ffffff" stroke="#9a9a9a" strokeWidth={0.04} />
      {/* nur die zwölf Stunden, ohne Minutenstriche (Michael, 2026-11-25: «Uhr ohne Minuten») */}
      {Array.from({ length: 12 }, (_, k) => {
        const a = (k * 30 * Math.PI) / 180, lang = 0.16
        return <line key={k} x1={c + Math.sin(a) * (r - 0.06)} y1={c - Math.cos(a) * (r - 0.06)} x2={c + Math.sin(a) * (r - 0.06 - lang)} y2={c - Math.cos(a) * (r - 0.06 - lang)} stroke="#2a2a2a" strokeWidth={0.035} />
      })}
      {zeiger(std, 0.5, 0.075)}
      {zeiger(min, 0.78, 0.05)}
      <circle cx={c} cy={c} r={0.04} fill="#2a2a2a" />
    </g>
  )
}

/** in der Reihe offen, wenn die vorherige gelöst ist */
const reiheOffen = (a: Aufgabe, fortschritt: Record<string, number>) =>
  !a.reihe || (fortschritt[AUFGABEN.find((x) => x.reihe === a.reihe! - 1)?.id ?? ''] ?? 0) > 0

/** drei Sterne, die erreichten in Karmin */
function Sterne({ n }: { n: number }) {
  return (
    <span className="whitespace-nowrap text-lg leading-none" aria-label={`${n} von 3 Sternen`}>
      {[0, 1, 2].map((k) => <span key={k} className={k < n ? 'text-sbb-red' : 'text-[#b4b4b4] dark:text-sbb-iron'}>★</span>)}
    </span>
  )
}

/** die Wahl beim Einstieg: Tutorial, Freies Feld, Bahnbetrieb als grosse Kacheln, je mit einem Satz */
function SpielWahl({ sterne, sterneMax, geld, bretter, neuHier }: { sterne: number; sterneMax: number; geld: number; bretter: number; neuHier: boolean }) {
  const kachel = (adresse: string, titel: string, text: string, zusatz: string, empfohlen = false) => (
    <li>
      <a href={adresse} className="kachel kachel-link flex h-full flex-col gap-1 p-4">
        {empfohlen && <span className="self-start rounded-lg bg-sbb-red px-2 py-0.5 text-xs font-bold text-white">Empfohlen für den Anfang</span>}
        <span className="text-lg font-bold">{titel}</span>
        <span className="text-sm leading-snug">{text}</span>
        <span className="mt-auto pt-1 text-sm font-bold tabular-nums text-sbb-metal dark:text-sbb-storm">{zusatz}</span>
      </a>
    </li>
  )
  return (
    <>
      <p className="mt-2 max-w-3xl leading-relaxed">Lege Gleise auf ein Brett und lass Züge fahren. Wie möchtest du spielen?</p>
      <ul className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-3">
        {kachel('#/gleisbau?aufgaben', 'Tutorial', 'Schritt für Schritt lernen, wie man Gleise legt, Bahnhöfe verbindet und Züge mit Fahrgästen und Ladungen fahren lässt.',
          `${sterne} / ${sterneMax} ★`, neuHier)}
        {kachel('#/gleisbau?frei', 'Freies Feld', 'Ein leeres Brett mit allen Werkzeugen und Zügen. Bauen, was dir gefällt, speichern und teilen.',
          bretter ? `${bretter} ${bretter === 1 ? 'Brett' : 'Bretter'}` : 'Noch keine Bretter')}
        {kachel('#/gleisbau?betrieb', 'Bahnbetrieb', 'Aufträge mit fester Landschaft: Gleise bauen, Loks und Wagen kaufen, Fahrgäste und Güter transportieren.',
          `CHF ${geld.toLocaleString('de-CH').replace(/’/g, "'")}`)}
      </ul>
    </>
  )
}

/** die Aufgaben als Kacheln mit den erreichten Sternen, die eigenen zuerst, dann die echten Strecken */
function AufgabenListe({ fortschritt, waehlen }: { fortschritt: Record<string, number>; waehlen: (a: Aufgabe) => void }) {
  const gruppe = (titel: string, l: Aufgabe[], text?: string) => (
    <section className="mt-4">
      <h2 className="text-lg font-bold">{titel}</h2>
      {text && <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-cloud">{text}</p>}
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {l.map((a) => {
          const zu = !reiheOffen(a, fortschritt)
          return (
            <li key={a.id}>
              <button type="button" disabled={zu} onClick={() => waehlen(a)}
                      className="kachel kachel-link flex w-full items-center justify-between gap-3 px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50">
                <span className="font-medium">{a.reihe !== undefined && <span className="mr-2 text-sbb-metal dark:text-sbb-cloud">{a.reihe + 1}.</span>}{a.titel}</span>
                {zu ? <span className="text-sm text-sbb-metal dark:text-sbb-cloud" aria-label="gesperrt">🔒</span> : <Sterne n={fortschritt[a.id] ?? 0} />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
  return (
    <div className="max-w-3xl">
      {gruppe('Schritt für Schritt', AUFGABEN.filter((a) => a.reihe !== undefined),
              'Acht Lektionen auf einem Brett, das wächst: Jede beginnt mit deinem Brett der vorherigen und bringt Neues dazu. Hinweise zeigen dir, was zu tun ist. Die nächste öffnet sich, wenn die vorherige gelöst ist.')}
      <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
        Bei den echten Strecken stammen die Bahnhöfe und die Zahl der Tunnel und Brücken zwischen ihnen aus den Daten der Strecken in Taktland; das
        Brett hat keinen Massstab, ein Tunnel oder eine Brücke genügt. Dein freies Brett bleibt, während du Aufgaben löst.
      </p>
    </div>
  )
}


/** Ampeln am Gleis: ein Mast mit rotem und grünem Licht in der Ecke unten rechts des Felds (Gestalt gewählt) */
function AmpelBild({ brett }: { brett: Brett }) {
  const raus = []
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const f = brett[j][i]
    if (!ampelGilt(f)) continue
    const rot = f.ampel === 'rot', x = i + 0.8, y = j + 0.62
    raus.push(
      <g key={`${i},${j}`} pointerEvents="none">
        <ellipse cx={x + 0.01} cy={y + 0.3} rx={0.06} ry={0.02} fill="rgba(0,0,0,.22)" />
        <rect x={x - 0.012} y={y + 0.12} width={0.024} height={0.18} fill="#4a4a4a" />
        <rect x={x - 0.055} y={y - 0.06} width={0.11} height={0.2} rx={0.03} fill="#2b2b2e" stroke="#ffffff" strokeWidth={0.012} />
        <circle cx={x} cy={y - 0.01} r={0.032} fill={rot ? '#ff3b30' : '#4a1d1d'} />
        <circle cx={x} cy={y + 0.085} r={0.032} fill={rot ? '#1d3a24' : '#34c759'} />
      </g>,
    )
  }
  return <>{raus}</>
}

/** Farbe je Ziel (Buchstabe des Bahnhofs), gewählt */
const ZIEL_FARBE = ['#a8102e', '#1f5fa8', '#2e7d32', '#c77700', '#6a3d9a', '#00838f']
const zielFarbe = (z: string) => ZIEL_FARBE[(z.charCodeAt(0) - 65) % ZIEL_FARBE.length]

/** ein Fahrgast mit Ziel als runde Marke mit Buchstaben */
function Ziel({ z }: { z: string }) {
  return <span className="inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: zielFarbe(z) }}>{z}</span>
}

/** die Wartenden an jedem Bahnhof: Figuren mit dem Buchstaben ihres Ziels neben dem Schild */
function WartendeBild({ namen, warten }: { namen: Map<string, string>; warten: Record<string, string[]> }) {
  const raus = []
  for (const [k, n] of namen) {
    const [i, j] = k.split(',').map(Number)
    const l = warten[n] ?? []
    for (let m = 0; m < l.length; m++) {
      const x = i + 0.14 + m * 0.15, y = j + 0.37
      raus.push(
        <g key={`${k}-${m}`} pointerEvents="none">
          <circle cx={x} cy={y} r={0.065} fill={zielFarbe(l[m])} stroke="#ffffff" strokeWidth={0.015} />
          <text x={x} y={y + 0.035} fontSize={0.09} fontWeight={700} textAnchor="middle" fill="#ffffff">{l[m]}</text>
        </g>,
      )
    }
  }
  return <>{raus}</>
}

/** die wartenden Ladungen am Güterschuppen als Kisten, je Ziel ein Ton (gewählt) */
function LadungenBild({ warten }: { warten: Record<string, Ladung[]> }) {
  const raus = []
  const ziele = [...new Set(Object.values(warten).flat().map((l) => l.nach))].sort()
  for (const [k, l] of Object.entries(warten)) {
    const [i, j] = k.split(',').map(Number)
    for (let m = 0; m < l.length; m++) {
      // im Bahnbetrieb in der Farbe des Guts, sonst je Ziel ein Ton
      const x = i + 0.08 + m * 0.15, y = j + 0.08
      const ton = l[m].gut !== 'stueckgut' ? GUETER[l[m].gut].farbe : ['#b8783f', '#7d8f3a', '#4f7fa3', '#a35a8c'][Math.max(0, ziele.indexOf(l[m].nach)) % 4]
      raus.push(<rect key={`${k}-${m}`} x={x} y={y} width={0.12} height={0.12} rx={0.015} fill={ton} stroke="#3a2a1a" strokeWidth={0.012} pointerEvents="none" />)
    }
  }
  return <>{raus}</>
}

/** so schnell klingt der Zug bei vollem Tempo auf dem Brett, in m/s (etwa 80 km/h; gewählt, das Brett hat keinen Massstab) */
const ZUG_KLANG_MS = 22

const linie = (p: Array<{ x: number; y: number }>) => p.map((q, k) => `${k ? 'L' : 'M'}${q.x.toFixed(3)},${q.y.toFixed(3)}`).join('')
/**
 * Schwellen in regelmässigen Abständen (Michael, 2026-11-24: «ist es möglich dass die Schwellen aufgeben in regelmässigen Abständen? Bei Kurven siehts nicht
 * so schön aus wenn sie auf Gerade treffen»): je Stück so viele Schwellen, dass der Abstand von etwa 0,1 Feldern die Länge genau teilt, an beiden Enden eine
 * halbe; so stossen zwei Stücke mit einer ganzen Schwelle aneinander
 */
const schwellen = (p: Array<{ x: number; y: number }>) => {
  let l = 0
  for (let k = 1; k < p.length; k++) l += Math.hypot(p[k].x - p[k - 1].x, p[k].y - p[k - 1].y)
  const n = Math.max(1, Math.round(l / 0.1)), t = l / n, d = t * 0.35
  return { strokeDasharray: `${d.toFixed(4)} ${(t - d).toFixed(4)}`, strokeDashoffset: (d / 2).toFixed(4) }
}
const versetzt = (p: Array<{ x: number; y: number; w: number }>, d: number) =>
  p.map((q) => ({ x: q.x - Math.sin(q.w) * d, y: q.y + Math.cos(q.w) * d }))

/** wie weit das Portal vom Rand des Felds liegt */
const PORTAL = 0.22
/** Strich, wo das Gleis im Tunnel verläuft (gewählt) */
const TUNNEL_STRICH = '#55585e'

/** ob ein Punkt im Tunnel liegt: in einem Feld im Berg mit Gleis, mehr als PORTAL von jeder Kante mit Portal (an Kanten, wo der Tunnel im
 *  Nachbarfeld weitergeht, gibt es keines) */
/**
 * Bahnhofsfelder nebeneinander als ein Bahnhof auch im Bild (Michael, 2026-11-24: «Mehrere Bahnhöfe nebeneinander sollen ein zusammenhängenden Bahnhof
 * geben»): der Perron läuft über die Fuge zum nächsten geraden Bahnhofsfeld gleicher Lage, und zwei Perrons, die sich über die Fuge gegenüberstehen,
 * werden ein Mittelperron. Lage des Perrons im Bild (Gleis senkrecht): 0,66 bis 0,86 quer, 0,06 bis 0,94 längs (gemessen)
 */
function PerronVerbindungen({ brett }: { brett: Brett }) {
  const raus = []
  const gerade = (i: number, j: number, d: number) => { const g = brett[j]?.[i]?.gleis; return g?.art === 'bahnhof' && g.dreh === d }
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const g = brett[j][i].gleis
    if (g?.art !== 'bahnhof') continue
    const d = g.dreh, rot = `rotate(${d * 90} ${i + 0.5} ${j + 0.5})`
    // «unten» im Bild und «rechts» (zum Perron) nach der Drehung
    const unten = [[0, 1], [-1, 0], [0, -1], [1, 0]][d], rechts = [[1, 0], [0, 1], [-1, 0], [0, -1]][d]
    if (gerade(i + unten[0], j + unten[1], d)) {
      raus.push(<rect key={`l${i},${j}`} x={i + 0.66} y={j + 0.9} width={0.2} height={0.2} fill={F.perron} transform={rot} />)
      raus.push(<rect key={`k${i},${j}`} x={i + 0.66} y={j + 0.9} width={0.012} height={0.2} fill="#ffffff" transform={rot} />)
    }
    if (gerade(i + rechts[0], j + rechts[1], (d + 2) % 4)) {
      raus.push(<rect key={`m${i},${j}`} x={i + 0.84} y={j + 0.06} width={0.32} height={0.88} fill={F.perron} transform={rot} />)
      // läuft der Mittelperron weiter, auch die Ecke über die Fuge
      if (gerade(i + unten[0], j + unten[1], d) && gerade(i + rechts[0] + unten[0], j + rechts[1] + unten[1], (d + 2) % 4))
        raus.push(<rect key={`e${i},${j}`} x={i + 0.84} y={j + 0.9} width={0.32} height={0.2} fill={F.perron} transform={rot} />)
    }
  }
  // ein Dach je Bahnhof: nebeneinander liegende gerade Bahnhofsfelder gleicher Lage bekommen ein durchgehendes rotes Dach statt je eines dunklen (Michael,
  // 2026-11-26: «Werden Bahnhofselemente nebeneinander platziert, soll ein einheitlicher Bahnhof entstehen und nicht mit jeweils einem dunklen Dach. Der Bahnhof soll
  // dann auch ein rotes Dach haben, wie die anderen Gebäude auch»); es deckt das dunkle Dach des Bilds (gemessen 0,72 bis 0,85 quer, 0,29 bis 0,71 längs), Farben gewählt
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const g = brett[j][i].gleis
    if (g?.art !== 'bahnhof') continue
    const d = g.dreh, unten = [[0, 1], [-1, 0], [0, -1], [1, 0]][d]
    if (gerade(i - unten[0], j - unten[1], d)) continue
    let n = 1
    while (gerade(i + unten[0] * n, j + unten[1] * n, d)) n++
    const rot = `rotate(${d * 90} ${i + 0.5} ${j + 0.5})`, y0 = j + 0.26, h = n - 1 + 0.48
    raus.push(
      <g key={`d${i},${j}`} transform={rot}>
        <rect x={i + 0.69} y={y0 + 0.02} width={0.2} height={h} rx={0.03} fill="rgba(0,0,0,.18)" />
        <rect x={i + 0.68} y={y0} width={0.2} height={h} rx={0.03} fill={F.bahnhofDach} stroke={F.bahnhofFirst} strokeWidth={0.012} />
        <rect x={i + 0.68} y={y0} width={0.1} height={h} rx={0.03} fill="rgba(255,255,255,.12)" />
        <line x1={i + 0.78} y1={y0 + 0.02} x2={i + 0.78} y2={y0 + h - 0.02} stroke={F.bahnhofFirst} strokeWidth={0.018} />
      </g>,
    )
  }
  return <g pointerEvents="none">{raus}</g>
}

/** Gleise ohne Fahrleitung: in der Ecke unten links ein kleines Schild mit durchgestrichenem Blitz (Gestalt gewählt) */
function OhneStromBild({ brett }: { brett: Brett }) {
  const raus: ReactElement[] = []
  brett.forEach((z, j) => z.forEach((f, i) => {
    if (!f.ohneStrom || !(f.gleis || f.teil)) return
    const x = i + 0.07, y = j + 0.66
    raus.push(
      <g key={`${i},${j}`} pointerEvents="none">
        <rect x={x} y={y} width={0.2} height={0.2} rx={0.04} fill="#ffffff" stroke="#3a3a3c" strokeWidth={0.012} />
        <path d={`M${x + 0.115},${y + 0.025} L${x + 0.06},${y + 0.11} L${x + 0.1},${y + 0.11} L${x + 0.085},${y + 0.175} L${x + 0.145},${y + 0.085} L${x + 0.105},${y + 0.085} Z`} fill="#f2b705" stroke="#3a3a3c" strokeWidth={0.008} />
        <path d={`M${x + 0.03},${y + 0.17} L${x + 0.17},${y + 0.03}`} stroke={F.karmin} strokeWidth={0.025} strokeLinecap="round" />
      </g>,
    )
  }))
  return <>{raus}</>
}

/**
 * die Fahrleitung (Michael, 2026-11-25: «Elektrifizierte Gleise mit einer Oberleitung und die anderen ohne Oberleitung»): über jedem Gleis mit Strom ein
 * dünner Fahrdraht über der Mitte, im Tunnel und ohne Strom nichts; über den Zügen gezeichnet. Seit 2026-11-25 ohne Masten (Michael: «Die elektrifizierten
 * Trassen brauchen keine Strommasten. Die Mittellinie reicht, damit man erkennt, dass dort Strom fließt»). Masse und Farbe gewählt
 */
const DRAHT = '#2f2f2f'
function OberleitungBild({ brett }: { brett: Brett }) {
  const draht: string[] = []
  const mitStrom = (x: number, y: number) => { const f = brett[Math.floor(y)]?.[Math.floor(x)]; return !!f && !f.ohneStrom && !imTunnel(brett, x, y) }
  const linie = (pts: Array<{ x: number; y: number }>) => {
    let d = ''
    pts.forEach((q, k) => { const an = mitStrom(q.x, q.y); d += an ? `${d && k && mitStrom(pts[k - 1].x, pts[k - 1].y) ? 'L' : 'M'}${q.x.toFixed(3)},${q.y.toFixed(3)} ` : '' })
    if (d) draht.push(d)
  }
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const f = brett[j][i], g = f.gleis
    if (!g || f.teil) continue
    if (grosseKurve(g)) {
      const G = grossGeometrie(i, j, g), n = grosseKurve(g)
      linie(Array.from({ length: 12 * n + 1 }, (_, k) => { const a = G.a0 + (G.da * k) / (12 * n); return { x: G.cx + G.r * Math.cos(a), y: G.cy + G.r * Math.sin(a) } }))
      continue
    }
    for (const [a, c] of wege(g)) linie(wegPunkte({ i, j, ein: a, aus: c } as Stueck, 10))
  }
  if (!draht.length) return null
  return <path d={draht.join(' ')} stroke={DRAHT} strokeWidth={0.012} fill="none" opacity={0.75} pointerEvents="none" />
}

/** ein Wagen auf dem unteren Gleis einer Überführung, nahe der Mitte: blass wie im Tunnel */
function unterBruecke(f: Feld | undefined, i: number, j: number, w: WagenLage) {
  if (f?.gleis?.art !== 'ueberfuehrung') return false
  const untenSenkrecht = f.gleis.dreh % 2 === 0, senkrecht = Math.abs(Math.sin(w.w)) > 0.7
  return untenSenkrecht === senkrecht && Math.hypot(w.x - i - 0.5, w.y - j - 0.5) < 0.35
}

function imTunnel(b: Brett, x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y)
  const f = b[j]?.[i]
  if (!f || f.grund !== 'berg') return false
  if (f.teil || grosseKurve(f.gleis)) {
    const [hi, hj] = f.teil ?? [i, j], g = b[hj]?.[hi]?.gleis
    if (!grosseKurve(g)) return false
    const G = grossGeometrie(hi, hj, g!)
    let t = Math.atan2(y - G.cy, x - G.cx) - G.a0
    t = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    const k = (t / G.da) * 40
    return bogenTunnel(b, G).some((a) => k >= a.k0 && k <= a.k1)
  }
  if (!f.gleis) return false
  const abstand = [y - j, i + 1 - x, j + 1 - y, x - i]
  const kanten = new Set(wege(f.gleis).flat())
  return [0, 1, 2, 3].every((k) => !kanten.has(k) || tunnelWeiter(b, i, j, k) || abstand[k] > PORTAL)
}

/** die Punkte einer grossen Kurve, 41 gleichmässig verteilt */
function bogenPunkte(G: ReturnType<typeof grossGeometrie>) {
  return Array.from({ length: 41 }, (_, k) => {
    const a = G.a0 + (G.da * k) / 40
    return { x: G.cx + G.r * Math.cos(a), y: G.cy + G.r * Math.sin(a), w: a + Math.PI / 2 }
  })
}

/**
 * Wo eine grosse Kurve im Tunnel liegt (Michael, 2026-11-22: «Ja, Tunnel bei grossen Kurven auch einbauen»): die Abschnitte über Bergfeldern,
 * in Teilstücken von 0 bis 40; ein Portal PORTAL nach dem Übergang vom Land in den Berg, an einem Ende der Kurve nur, wenn dort kein Tunnel im
 * Nachbarfeld weiterführt
 */
function bogenTunnel(b: Brett, G: ReturnType<typeof grossGeometrie>) {
  const p = bogenPunkte(G)
  const berg = Array.from({ length: 40 }, (_, k) => b[Math.floor((p[k].y + p[k + 1].y) / 2)]?.[Math.floor((p[k].x + p[k + 1].x) / 2)]?.grund === 'berg')
  const schritt = (G.r * G.da) / 40, ab = PORTAL / schritt
  const raus: Array<{ k0: number; k1: number; portal0: boolean; portal1: boolean }> = []
  for (let k = 0; k < 40;) {
    if (!berg[k]) { k++; continue }
    let e = k
    while (e < 40 && berg[e]) e++
    const portal0 = !(k === 0 && tunnelWeiterAnKante(b, G.anfang)), portal1 = !(e === 40 && tunnelWeiterAnKante(b, G.ende))
    const k0 = k + (portal0 ? ab : 0), k1 = e - (portal1 ? ab : 0)
    if (k1 > k0) raus.push({ k0, k1, portal0, portal1 })
    k = e
  }
  return raus
}

/** die Landschaft eines Felds für sich allein, auf den Knöpfen: Wiese, darauf das Gebiet und ein, zwei Objekte */
function KnopfLandschaft({ f, i, j }: { f: Feld; i: number; j: number }) {
  const o = (name: string, x: number, y: number, b: number): Objekt => ({ name, x: i + x, y: j + y, b, spiegeln: false })
  const objekte: Objekt[] = f.grund === 'wald' ? [o('gb_obj_nadelbaum_02', 0.3, 0.6, 0.3), o('gb_obj_laubbaum_02', 0.65, 0.85, 0.42)]
    : f.grund === 'berg' && !f.gleis ? [o('gb_obj_gipfel_klein_01', 0.5, 0.82, 0.85)]
    : f.grund === 'dorf' ? [o('gb_obj_haus_02', 0.3, 0.5, 0.38), o('gb_obj_haus_05', 0.66, 0.85, 0.4)]
    : f.grund === 'schnee' ? [o('gb_obj_nadelbaum_schnee_01', 0.5, 0.88, 0.45)] : []
  const gebiet = (fill: string, e: number) => <rect x={i + e} y={j + e} width={1 - 2 * e} height={KACHEL_H - 2 * e} rx={0.18} fill={fill} />
  return (
    <g>
      <clipPath id={`gb-knopf-${f.grund}`}><rect x={i + 0.025} y={j + 0.025} width={0.95} height={KACHEL_H} rx={0.05} /></clipPath>
      <g clipPath={`url(#gb-knopf-${f.grund})`}>
        <image href={bild('gb_grund_wiese_01')} x={i} y={j} width={1} height={1} preserveAspectRatio="none" />
        {f.grund === 'wald' && gebiet('url(#gb-wald)', 0.07)}
        {f.grund === 'berg' && gebiet('url(#gb-fels)', 0.07)}
        {f.grund === 'wasser' && <>{gebiet('#d8cf9a', 0.06)}{gebiet('url(#gb-wasser)', 0.12)}</>}
        {f.grund === 'rebberg' && gebiet('url(#gb-reben)', 0.07)}
        {f.grund === 'schnee' && gebiet('url(#gb-schnee)', 0.05)}
        {f.grund === 'acker' && gebiet('url(#gb-acker)', 0.07)}
      </g>
      {objekte.map((x, k) => <ObjektBild key={k} o={x} />)}
    </g>
  )
}

/** ein Feld: die Fläche und, ohne «nurFlaeche», seine Landschaft für sich allein (auf den Knöpfen) */
function GrundBild({ f, i, j, nurFlaeche = false }: { f: Feld; i: number; j: number; nurFlaeche?: boolean }) {
  const grundFarbe = f.grund === 'wald' ? F.wald : f.grund === 'wasser' ? F.wasser : f.grund === 'berg' ? F.berg : f.grund === 'schnee' ? '#e8eff9' : f.grund === 'acker' ? '#b06a3e' : F.wiese
  return (
    <g>
      <rect x={i + 0.025} y={j + 0.025} width={0.95} height={0.95} rx={0.05} fill={KANTE[f.grund]} />
      <rect x={i + 0.025} y={j + 0.025} width={0.95} height={KACHEL_H} rx={0.05} fill={grundFarbe} />
      {!nurFlaeche && <KnopfLandschaft f={f} i={i} j={j} />}
    </g>
  )
}

function GleisBild({ f, i, j, name, weiter = [false, false, false, false], wasser, brett }: {
  f: Feld; i: number; j: number; name?: string; weiter?: boolean[]; wasser?: (u: number, v: number) => boolean; brett?: Brett
}) {
  const g = f.gleis
  if (!g) return null
  if (grosseKurve(g)) return <BogenBild i={i} j={j} g={g} wasser={wasser} brett={brett} />
  const cx = i + 0.5, cy = j + 0.5
  const w = wege(g)
  const stuecke: Array<{ s: Stueck; aktiv: boolean }> = w.map(([a, b], k) => ({
    s: { i, j, ein: a, aus: b }, aktiv: !istWeiche(g) || k === (g.stellung ?? 0),
  }))
  const punkte = stuecke.map(({ s, aktiv }) => ({ p: wegPunkte(s, s.ein >= 0 && s.aus >= 0 && (s.ein + 2) % 4 !== s.aus ? 14 : 2), aktiv, s }))
  // die inaktive Seite der Weiche zuerst und blasser
  punkte.sort((a, b) => Number(a.aktiv) - Number(b.aktiv))
  return (
    <g>
      {ueberWasser(f) && punkte.map(({ p }, k) => (
        <g key={`b${k}`}>
          <path d={linie(p)} transform="translate(0.03 0.05)" fill="none" stroke="rgba(0,0,0,.15)" strokeWidth={0.42} />
          <path d={linie(p)} fill="none" stroke={F.bruecke} strokeWidth={0.42} />
          <path d={linie(versetzt(p, 0.2))} fill="none" stroke={F.gelaender} strokeWidth={0.025} />
          <path d={linie(versetzt(p, -0.2))} fill="none" stroke={F.gelaender} strokeWidth={0.025} />
        </g>
      ))}
      {/* Perrons als Bild, genau von oben, mit dem Gleis gedreht: gerade mit dem Gleis senkrecht durch die Mitte, in der Kurve von Süd nach Ost */}
      {g.art === 'kurvenbahnhof' && <image href={bild('gb_bau_perron_kurve_01')} x={i} y={j} width={1} height={1} preserveAspectRatio="none" transform={`rotate(${g.dreh * 90} ${cx} ${cy})`} />}
      {g.art === 'bahnhof' && <image href={bild('gb_bau_perron_gerade_01')} x={i} y={j} width={1} height={1} preserveAspectRatio="none" transform={`rotate(${g.dreh * 90} ${cx} ${cy})`} />}
      {punkte.map(({ p, aktiv }, k) => (
        <g key={k} opacity={aktiv ? 1 : 0.45}>
          <path d={linie(p)} fill="none" stroke={ueberWasser(f) ? 'none' : F.schotter} strokeWidth={0.3} />
          <path d={linie(p)} fill="none" stroke={F.schwelle} strokeWidth={0.22} {...schwellen(p)} />
          <path d={linie(versetzt(p, 0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
          <path d={linie(versetzt(p, -0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
        </g>
      ))}
      {/* Überführung: das zweite Gleis auf einer Brücke mit Schatten über dem ersten */}
      {g.art === 'ueberfuehrung' && (() => {
        const p = wegPunkte({ i, j, ein: w[1][0], aus: w[1][1] }, 2)
        return (
          <g>
            <path d={linie(p)} transform="translate(0.04 0.06)" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={0.46} />
            <path d={linie(p)} fill="none" stroke={F.bruecke} strokeWidth={0.42} />
            <path d={linie(versetzt(p, 0.2))} fill="none" stroke={F.gelaender} strokeWidth={0.025} />
            <path d={linie(versetzt(p, -0.2))} fill="none" stroke={F.gelaender} strokeWidth={0.025} />
            <path d={linie(p)} fill="none" stroke={F.schwelle} strokeWidth={0.22} {...schwellen(p)} />
            <path d={linie(versetzt(p, 0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
            <path d={linie(versetzt(p, -0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
          </g>
        )
      })()}
      {g.art === 'prellbock' && (() => {
        const ende = punkte[0].p[punkte[0].p.length - 1], q = { x: ende.x, y: ende.y }, wq = ende.w
        return (
          <g transform={`translate(${q.x} ${q.y}) rotate(${(wq * 180) / Math.PI})`}>
            {/* das Bild fährt von links nach rechts in den Prellbock, sein roter Balken am Ende des Gleises; 0,36 Felder hoch */}
            {(() => { const m = masse('gb_bau_prellbock_01'), h = 0.36, w = (h * m.w) / m.h, x0 = -((m.balken ?? m.w * 0.6) / m.w) * w + 0.03
              return <image href={bild('gb_bau_prellbock_01')} x={x0} y={-h / 2} width={w} height={h} preserveAspectRatio="none" /> })()}
          </g>
        )
      })()}
      {f.grund === 'berg' && (
        <>
          {/* der Berg über dem Gleis: vom Portal bis zum anderen Portal oder bis an die Kante, wo der Tunnel im Nachbarfeld weitergeht */}
          {punkte.map(({ s }, k) => {
            const l = stueckLaenge(s), fein = wegPunkte(s, 40)
            const von = s.ein >= 0 && !weiter[s.ein] ? PORTAL / l : 0, bis = s.aus >= 0 && !weiter[s.aus] ? 1 - PORTAL / l : 1
            const teil = fein.filter((_, n) => n / 40 >= von - 1e-6 && n / 40 <= bis + 1e-6)
            // darauf gestrichelt, wo das Gleis im Berg verläuft (sonst sah man nicht, in welche Richtung ein Tunnel liegt; Michael, 2026-11-23)
            return teil.length > 1 ? <g key={`d${k}`}>
              <path d={linie(teil)} fill="none" stroke="url(#gb-fels)" strokeWidth={0.52} />
              <path d={linie(teil)} fill="none" stroke={TUNNEL_STRICH} strokeWidth={0.035} strokeDasharray="0.08 0.06" opacity={0.75} />
            </g> : null
          })}
          {/* je Ende ein Portal; liegen beide Enden eines Stücks in diesem Feld (ein Tunnel aus einem Feld), nur eines in der Mitte */}
          {punkte.map(({ s }, k) => {
            const enden = [s.ein, s.aus].filter((kant) => kant >= 0 && !weiter[kant])
            const l = stueckLaenge(s)
            if (enden.length === 2) { const q = stueckPunkt(s, l / 2); return <PortalBild key={k} x={q.x} y={q.y + 0.12} /> }
            return [0, 1].map((e) => {
              const kant = e === 0 ? s.ein : s.aus
              if (kant < 0 || weiter[kant]) return null
              const q = stueckPunkt(s, e === 0 ? PORTAL : l - PORTAL)
              return <PortalBild key={`${k}${e}`} x={q.x} y={q.y} oben={kant === 0} />
            })
          })}
        </>
      )}
      {bauGilt(f) && <BauBild f={f} i={i} j={j} />}
      {name && (
        <g>
          <rect x={i + 0.06} y={j + 0.06} width={0.2} height={0.2} rx={0.03} fill="#3d3d3d" />
          <text x={i + 0.16} y={j + 0.215} fontSize={0.15} fontWeight={700} textAnchor="middle" fill="#ffffff">{name}</text>
        </g>
      )}
    </g>
  )
}

/**
 * Depot, Güterschuppen und Galerie über dem Gleis, als Bild von Michael (2026-11-24) mit dem Gleis gedreht; das Bild zeigt das Gleis senkrecht, beim Depot
 * die Einfahrt unten wie der Prellbock; der Güterschuppen steht neben dem Gleis, darum um 0,17 Felder nach links verschoben (gewählt)
 */
function BauBild({ f, i, j }: { f: Feld; i: number; j: number }) {
  const name = f.bau === 'depot' ? 'gb_bau_depot_01' : f.bau === 'gueter' ? 'gb_bau_gueterschuppen_01' : 'gb_bau_galerie_01'
  return <image href={bild(name)} x={i} y={j} width={1} height={1} preserveAspectRatio="none" pointerEvents="none"
                transform={`rotate(${f.gleis!.dreh * 90} ${i + 0.5} ${j + 0.5})${f.bau === 'gueter' ? ' translate(-0.17 0)' : ''}`} />
}

/** eine grosse Kurve über 2 × 2 oder 3 × 3 Felder, als ganzes Stück gezeichnet, ohne Brücke und Tunnel */
function BogenBild({ i, j, g, wasser, brett }: { i: number; j: number; g: Gleis; wasser?: (u: number, v: number) => boolean; brett?: Brett }) {
  const G = grossGeometrie(i, j, g)
  const p = bogenPunkte(G)
  const tunnel = brett ? bogenTunnel(brett, G) : []
  const bei = (k: number) => {
    const a = G.a0 + (G.da * k) / 40
    return { x: G.cx + G.r * Math.cos(a), y: G.cy + G.r * Math.sin(a), w: a + Math.PI / 2 }
  }
  // über Wasser eine Brücke wie bei den kleinen Stücken (Michael, 2026-11-22: «Bei den großen Kurven macht es keine Brücke automatisch, wenn sie auf
  // Wasser gesetzt wird»): der Bogen in Stücke über Wasser und über Land geteilt, je Stück ein Punkt Überlappung
  const nass = p.map((_, k) => {
    const m = p[Math.min(k, p.length - 2)], n = p[Math.min(k + 1, p.length - 1)]
    return !!wasser?.(Math.floor((m.x + n.x) / 2), Math.floor((m.y + n.y) / 2))
  })
  const stuecke: Array<{ nass: boolean; p: typeof p }> = []
  for (let k = 0; k < p.length - 1; k++) {
    const letztes = stuecke[stuecke.length - 1]
    if (letztes && letztes.nass === nass[k]) letztes.p.push(p[k + 1])
    else stuecke.push({ nass: nass[k], p: [p[k], p[k + 1]] })
  }
  return (
    <g>
      {stuecke.filter((t) => t.nass).map((t, k) => (
        <g key={`b${k}`}>
          <path d={linie(t.p)} transform="translate(0.03 0.05)" fill="none" stroke="rgba(0,0,0,.15)" strokeWidth={0.42} />
          <path d={linie(t.p)} fill="none" stroke={F.bruecke} strokeWidth={0.42} />
          <path d={linie(versetzt(t.p, 0.2))} fill="none" stroke={F.gelaender} strokeWidth={0.025} />
          <path d={linie(versetzt(t.p, -0.2))} fill="none" stroke={F.gelaender} strokeWidth={0.025} />
        </g>
      ))}
      {stuecke.filter((t) => !t.nass).map((t, k) => <path key={`s${k}`} d={linie(t.p)} fill="none" stroke={F.schotter} strokeWidth={0.3} />)}
      <path d={linie(p)} fill="none" stroke={F.schwelle} strokeWidth={0.22} {...schwellen(p)} />
      <path d={linie(versetzt(p, 0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
      <path d={linie(versetzt(p, -0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
      {/* im Berg deckt der Fels das Gleis, Portale an den Übergängen */}
      {tunnel.map((t, n) => {
        const pts = [bei(t.k0), ...p.filter((_, k) => k > t.k0 && k < t.k1), bei(t.k1)]
        return (
          <g key={`t${n}`}>
            <path d={linie(pts)} fill="none" stroke="url(#gb-fels)" strokeWidth={0.52} />
            <path d={linie(pts)} fill="none" stroke={TUNNEL_STRICH} strokeWidth={0.035} strokeDasharray="0.08 0.06" opacity={0.75} />
            {[t.portal0 && bei(t.k0), t.portal1 && bei(t.k1)].map((q, m) => {
              if (!q) return null
              // offen nach oben, wenn das Gleis vom Portal aus nach Norden aus dem Berg führt
              const aussen = m === 0 ? p[Math.max(0, t.k0 - 1)] : p[Math.min(p.length - 1, t.k1 + 1)], dx = aussen.x - q.x, dy = aussen.y - q.y
              return <PortalBild key={m} x={q.x} y={q.y} oben={dy < 0 && -dy > Math.abs(dx)} />
            })}
          </g>
        )
      })}
      {/* der Griff mit dem Pfeil im Kreis ist seit 2026-11-25 weg (Michael: «Das kleine Pfeilsymbol kann weg»): gedreht wird auf jeder Kachel */}
    </g>
  )
}

/** ein Wagen von oben, die Spitze bei +x; Lok mit karminroter Spitze, Steuerwagen mit weisser, vorne Stirnlicht, hinten rot */
/**
 * ein Güterwagen des Bahnbetriebs von oben, je Typ eine Gestalt, beladen mit seinem Gut (Michael, 2026-11-25: «Diverse fiktive Loks und Wagen stehen
 * bereit. Vor allem beim Gütertransport»); Gestalt und Farben gewählt, keinem echten Wagen nachgebildet
 */
function GueterwagenBild({ typ, beladen, nr }: { typ: string; beladen: boolean; nr: number }) {
  const h = WAGEN_LAENGE / 2, rand = '#2f2f2f'
  const rahmen = <rect x={-h} y={-0.08} width={WAGEN_LAENGE} height={0.16} rx={0.02} fill="#5f6266" stroke={rand} strokeWidth={0.012} />
  if (typ === 'rungen') return (
    <>
      {rahmen}
      {[-0.2, -0.07, 0.07, 0.2].map((x) => [-0.075, 0.075].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={0.012} fill="#2a2a2a" />))}
      {beladen && [-0.045, 0, 0.045].map((y) => (
        <g key={y}><rect x={-h + 0.03} y={y - 0.02} width={WAGEN_LAENGE - 0.06} height={0.04} rx={0.02} fill="#a0703f" stroke="#6b4422" strokeWidth={0.008} />
          <circle cx={h - 0.03} cy={y} r={0.016} fill="#d9b07a" /></g>
      ))}
    </>
  )
  if (typ === 'schuett') return (
    <>
      <rect x={-h} y={-0.09} width={WAGEN_LAENGE} height={0.18} rx={0.02} fill="#7d7f82" stroke={rand} strokeWidth={0.012} />
      <rect x={-h + 0.03} y={-0.06} width={WAGEN_LAENGE - 0.06} height={0.12} rx={0.015} fill={beladen ? '#b5ae9f' : '#4d4f52'} />
      {beladen && [[-0.15, -0.02], [-0.05, 0.03], [0.06, -0.025], [0.16, 0.02], [0.0, -0.01]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={0.012} fill="#8d8678" />)}
    </>
  )
  if (typ === 'kessel' || typ === 'milch') {
    const milch = typ === 'milch'
    return (
      <>
        {rahmen}
        <rect x={-h + 0.015} y={-0.075} width={WAGEN_LAENGE - 0.03} height={0.15} rx={0.075} fill={milch ? '#f4f4f0' : '#262626'} stroke={rand} strokeWidth={0.012} />
        <rect x={-h + 0.06} y={-0.02} width={WAGEN_LAENGE - 0.12} height={0.02} rx={0.01} fill={milch ? '#3c7bc0' : '#5a5a5a'} />
        <circle cx={0} cy={0} r={0.025} fill={milch ? '#d0d0cc' : '#444'} stroke={rand} strokeWidth={0.008} />
      </>
    )
  }
  if (typ === 'container') return (
    <>
      {rahmen}
      {beladen && <>
        <rect x={-h + 0.025} y={-0.075} width={WAGEN_LAENGE - 0.05} height={0.15} rx={0.01} fill={['#2f6fb0', '#c4502c', '#3c8a4a', '#d49a1e'][nr % 4]} stroke={rand} strokeWidth={0.012} />
        {[-0.16, -0.08, 0, 0.08, 0.16].map((x) => <line key={x} x1={x} y1={-0.07} x2={x} y2={0.07} stroke="rgba(0,0,0,.25)" strokeWidth={0.01} />)}
      </>}
    </>
  )
  if (typ === 'auto') return (
    <>
      {rahmen}
      <rect x={-h + 0.01} y={-0.085} width={WAGEN_LAENGE - 0.02} height={0.17} rx={0.015} fill="none" stroke="#9a9a9a" strokeWidth={0.014} />
      {beladen && [-0.12, 0.12].map((x, k) => (
        <rect key={x} x={x - 0.09} y={-0.05} width={0.18} height={0.1} rx={0.035} fill={['#c43c2c', '#e8e8e8', '#2c4f8c', '#3a3a3a'][(nr + k) % 4]} stroke={rand} strokeWidth={0.01} />
      ))}
    </>
  )
  // der Güterwagen des freien Bauens: rotbraun mit Rippen
  return (
    <>
      <rect x={-h} y={-0.09} width={WAGEN_LAENGE} height={0.18} rx={0.02} fill={GUETER_WAGEN} stroke={rand} strokeWidth={0.012} />
      {[-0.15, -0.05, 0.05, 0.15].map((xx) => <line key={xx} x1={xx} y1={-0.08} x2={xx} y2={0.08} stroke="#5e3020" strokeWidth={0.014} />)}
    </>
  )
}

function WagenBild({ w, tunnel, farbe = F.karmin, nr = 0 }: { w: WagenLage; tunnel: boolean; farbe?: string; nr?: number }) {
  const kopf = w.art === 0 || w.art === 3
  const halb = WAGEN_LAENGE / 2
  // eine Lok des Bahnbetriebs in ihrer Farbe
  if (w.art === 0 && w.typ && w.typ in LOKS) farbe = LOKS[w.typ as LokTyp].farbe
  return (
    <g transform={`translate(${w.x} ${w.y}) rotate(${(w.w * 180) / Math.PI})`} opacity={tunnel ? 0.28 : 1}>
      <rect x={-halb + 0.02} y={-0.08} width={WAGEN_LAENGE} height={0.18} rx={0.05} fill="rgba(0,0,0,.18)" />
      <g transform={kopf && !w.vorne ? 'scale(-1 1)' : undefined}>
        {w.gueter && !kopf ? <GueterwagenBild typ={w.typ ?? 'gedeckt'} beladen={!!w.beladen} nr={nr} /> : <>
          <rect x={-halb} y={-0.09} width={WAGEN_LAENGE} height={0.18} rx={kopf ? 0.06 : 0.03} fill={w.gueter ? '#dfe5ea' : '#f4f4f4'} stroke="#2f2f2f" strokeWidth={0.012} />
          <rect x={-halb + 0.04} y={-0.045} width={WAGEN_LAENGE - 0.08} height={0.09} rx={0.02} fill="#d9d9d9" />
        </>}
        {kopf && (
          <>
            <path d={`M${halb - 0.1},-0.09 L${halb - 0.05},-0.09 Q${halb},-0.09 ${halb},-0.04 L${halb},0.04 Q${halb},0.09 ${halb - 0.05},0.09 L${halb - 0.1},0.09 Z`}
                  fill={w.art === 0 ? farbe : '#ffffff'} stroke="#2f2f2f" strokeWidth={0.012} />
            <rect x={halb - 0.13} y={-0.075} width={0.025} height={0.15} rx={0.01} fill="#1f2a36" />
            {/* Einholm-Stromabnehmer von oben wie in der Virtuellen Schweiz (Michael, 2026-11-24: vorher ein Kreuz, «Was bedeuten die Kreuze?», dann «1»):
                Sockel, ein Arm schräg nach hinten, quer die Wippe; Masse gewählt */}
            {w.diesel
              // Diesel: kein Stromabnehmer, auf der Lok zwei Lüfter (gewählt)
              ? w.art === 0 && [-0.16, -0.07].map((xx) => <circle key={xx} cx={xx} cy={0} r={0.032} fill="#4a4a4a" stroke="#2f2f2f" strokeWidth={0.008} />)
              : <>
                <rect x={-0.175} y={-0.03} width={0.045} height={0.06} rx={0.008} fill="#7a7a7a" />
                <path d="M-0.155,0.012 L-0.06,-0.008" stroke="#3a3a3a" strokeWidth={0.013} strokeLinecap="round" />
                <path d="M-0.055,-0.072 L-0.055,0.072" stroke="#3a3a3a" strokeWidth={0.02} strokeLinecap="round" />
              </>}
            {[-0.055, 0.055].map((yy) => (
              <circle key={yy} cx={halb - 0.012} cy={yy} r={0.018} fill={w.vorne ? '#fff3c4' : '#d61f2c'} />
            ))}
          </>
        )}
      </g>
    </g>
  )
}

/** ein Werkzeug als kleines Bild auf dem Knopf */
function WerkzeugBild({ w, dreh }: { w: Werkzeug; dreh: Dreh }) {
  const n = w.art === 'gleis' ? grosseKurve({ art: w.gleis, dreh }) : 0
  if (n) {
    const [ai, aj] = grossAnfang(0, 0, n, dreh)
    return (
      <svg viewBox={`0 0 ${n} ${n}`} className="size-11" aria-hidden="true">
        {Array.from({ length: n * n }, (_, k) => <GrundBild key={k} f={{ grund: 'wiese' }} i={k % n} j={Math.floor(k / n)} />)}
        <BogenBild i={ai} j={aj} g={{ art: (w as { gleis: GleisArt }).gleis, dreh }} />
      </svg>
    )
  }
  if (w.art === 'linie') {
    return (
      <svg viewBox="0 0 2 2" className="size-11" aria-hidden="true">
        {[0, 1, 2, 3].map((k) => <GrundBild key={k} f={{ grund: 'wiese' }} i={k % 2} j={Math.floor(k / 2)} />)}
        <GleisBild f={{ grund: 'wiese', gleis: { art: 'gerade', dreh: 0 } }} i={0} j={1} />
        <GleisBild f={{ grund: 'wiese', gleis: { art: 'kurve', dreh: 1 } }} i={0} j={0} />
        <GleisBild f={{ grund: 'wiese', gleis: { art: 'gerade', dreh: 1 } }} i={1} j={0} />
        <path d="M0.5,1.75 L0.5,0.5 L1.75,0.5" fill="none" stroke={F.karmin} strokeWidth={0.12} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      </svg>
    )
  }
  if (w.art === 'name') {
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={{ grund: 'wiese' }} i={0} j={0} />
        <GleisBild f={{ grund: 'wiese', gleis: { art: 'bahnhof', dreh: 1 } }} i={0} j={0} />
        <rect x={0.08} y={0.1} width={0.84} height={0.3} rx={0.05} fill="#3d3d3d" />
        <text x={0.5} y={0.32} fontSize={0.2} fontWeight={700} textAnchor="middle" fill="#ffffff">Ort</text>
      </svg>
    )
  }
  if (w.art === 'ampel') {
    const b: Brett = [[{ grund: 'wiese', ampel: 'rot', gleis: { art: 'gerade', dreh: 1 } }]]
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={b[0][0]} i={0} j={0} />
        <GleisBild f={b[0][0]} i={0} j={0} />
        <g transform="translate(-0.3 -0.12)"><AmpelBild brett={b} /></g>
      </svg>
    )
  }
  if (w.art === 'objekt') {
    const name = w.objekt === 'kirche' ? 'gb_obj_kirche_01' : 'gb_obj_bauernhof_01'
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={{ grund: 'wiese' }} i={0} j={0} nurFlaeche />
        <image href={bild('gb_grund_wiese_01')} x={0.025} y={0.025} width={0.95} height={0.89} preserveAspectRatio="none" />
        <ObjektBild o={{ name, x: 0.5, y: 0.86, b: w.objekt === 'kirche' ? 0.62 : 0.85, spiegeln: false }} />
      </svg>
    )
  }
  if (w.art === 'bau') {
    const f: Feld = { grund: 'wiese', bau: w.bau, gleis: { art: w.bau === 'depot' ? 'prellbock' : 'gerade', dreh: 0 } }
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={f} i={0} j={0} />
        <GleisBild f={f} i={0} j={0} />
      </svg>
    )
  }
  if (w.art === 'strom') {
    const f: Feld = { grund: 'wiese', gleis: { art: 'gerade', dreh: 0 }, ohneStrom: true }
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={f} i={0} j={0} />
        <GleisBild f={f} i={0} j={0} />
        <g transform="translate(0.62 0.14) scale(1.6) translate(-0.07 -0.66)"><OhneStromBild brett={[[f]]} /></g>
      </svg>
    )
  }
  if (w.art === 'hang') {
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={{ grund: 'wiese' }} i={0} j={0} />
        <rect x={0.025} y={0.025} width={0.95} height={0.89} rx={0.05} fill="url(#gb-hang-1)" />
      </svg>
    )
  }
  if (w.art === 'knoten') {
    const f: Feld = { grund: 'wiese', gleis: { art: 'bahnhof', dreh: 1 } }
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={f} i={0} j={0} />
        <GleisBild f={f} i={0} j={0} />
        <circle cx={0.5} cy={0.3} r={0.2} fill="#ffffff" stroke={F.karmin} strokeWidth={0.05} />
        <path d="M0.5,0.18 L0.5,0.3 L0.59,0.36" fill="none" stroke={F.karmin} strokeWidth={0.045} strokeLinecap="round" />
      </svg>
    )
  }
  if (w.art === 'fluss') {
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={{ grund: 'wiese' }} i={0} j={0} />
        <path d="M0.03,0.62 C0.3,0.62 0.35,0.38 0.55,0.38 S0.85,0.5 0.97,0.5" fill="none" stroke="#d8cf9a" strokeWidth={0.3} />
        <path d="M0.03,0.62 C0.3,0.62 0.35,0.38 0.55,0.38 S0.85,0.5 0.97,0.5" fill="none" stroke="url(#gb-wasser)" strokeWidth={0.2} />
      </svg>
    )
  }
  if (w.art === 'zug') {
    const f: Feld = { grund: 'wiese', gleis: { art: 'gerade', dreh: 1 } }
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={f} i={0} j={0} />
        <GleisBild f={f} i={0} j={0} />
        <WagenBild w={{ x: 0.5, y: 0.5, w: 0, art: 0, vorne: true, gueter: w.zug === 'g' }} tunnel={false} farbe={w.zug === 'g' ? GUETER_LOK : KARMIN} />
      </svg>
    )
  }
  if (w.art === 'wagen') {
    const f: Feld = { grund: 'wiese', gleis: { art: 'gerade', dreh: 1 } }
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={f} i={0} j={0} />
        <GleisBild f={f} i={0} j={0} />
        <WagenBild w={{ x: 0.5, y: 0.5, w: 0, art: 1, vorne: false }} tunnel={false} />
      </svg>
    )
  }
  if (w.art === 'haltestelle' || w.art === 'wende' || w.art === 'strbruecke' || w.art === 'strtunnel') {
    const b: Brett = w.art === 'wende' ? [[{ grund: 'wiese' }, { grund: 'wiese', strasse: true }, { grund: 'wiese', strasse: true, wende: true }]]
      : w.art === 'strtunnel' ? [[{ grund: 'wiese', strasse: true }, { grund: 'berg', strasse: true }, { grund: 'berg', strasse: true }]]
      : w.art === 'strbruecke' ? [[{ grund: 'wiese', strasse: true }, { grund: 'wiese', strasse: true, gleis: { art: 'gerade', dreh: 0 }, strBruecke: true }, { grund: 'wiese', strasse: true }]]
      : [[{ grund: 'wiese', strasse: true }, { grund: 'wiese', strasse: true, haltestelle: true }, { grund: 'wiese', strasse: true }]]
    return (
      <svg viewBox="0.5 -0.5 2 2" className="size-11" aria-hidden="true">
        {b[0].map((f, i) => <GrundBild key={i} f={f} i={i} j={0} />)}
        <StrassenBild brett={b} />
        {w.art === 'strbruecke' && <><GleisBild f={b[0][1]} i={1} j={0} /><StrassenUeberBild brett={b} /></>}
      </svg>
    )
  }
  if (w.art === 'strasse') {
    const b: Brett = [[{ grund: 'wiese', strasse: true }]]
    return (
      <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
        <GrundBild f={b[0][0]} i={0} j={0} />
        <StrassenBild brett={b} />
      </svg>
    )
  }
  const f: Feld = w.art === 'grund' ? { grund: w.grund }
    : w.art === 'tunnel' ? { grund: 'berg', gleis: { art: 'gerade', dreh } }
    : w.art === 'bruecke' ? { grund: 'wiese', bruecke: true, gleis: { art: 'gerade', dreh } }
    : w.art === 'gleis' ? { grund: 'wiese', gleis: { art: w.gleis, dreh } } : { grund: 'wiese' }
  return (
    <svg viewBox="0 0 1 1" className="size-11" aria-hidden="true">
      <GrundBild f={f} i={0} j={0} />
      <GleisBild f={f} i={0} j={0} />
      {w.art === 'weg' && <path d="M0.3,0.3 L0.7,0.7 M0.7,0.3 L0.3,0.7" stroke={F.karmin} strokeWidth={0.08} strokeLinecap="round" />}
    </svg>
  )
}

/**
 * «Gleisbau» (Spiele, #/gleisbau; Michael, 2026-11-22: «Man soll Gleise auf ein Layout legen können. Tunnel und Brücken und Bahnhöfe stehen
 * auch zur Verfügung», «2D bauen, 3D anschauen», «Nimm mal Gleisbau», «Zuerst freies Bauen und dann Aufgaben», «8x6 Felder»):
 * Schritt 1, freies Bauen in 2D, der Zug fährt von oben gesehen; 3D und Aufgaben folgen
 */
export function Gleisbau() {
  const [brett, setBrettRoh] = useState<Brett>(() => leer())
  // Startliste, ein Brett zum Bearbeiten oder die Aufgaben (Michael, 2026-11-23: «Wenn man auf Gleisbau kommt, kommt eine Liste, neues Brett, Brett
  // bearbeiten»); die Adresse sagt, was offen ist: #/gleisbau, #/gleisbau?id=…, #/gleisbau?aufgaben, so führt die Zurück-Taste zur Liste
  const [ansicht, setAnsicht] = useState<'liste' | 'frei' | 'brett' | 'aufgaben' | 'betrieb'>('liste')
  // der Bahnbetrieb (Michael, 2026-11-25): Geld, Depot, Aufträge und je Auftrag Brett und Züge, auf dem Gerät gemerkt
  const [betrieb, setBetriebRoh] = useState<Betrieb>(() => betriebLesen())
  const setBetrieb = (f: Betrieb | ((b: Betrieb) => Betrieb)) => setBetriebRoh((alt) => { const n = typeof f === 'function' ? f(alt) : f; betriebMerken(n); return n })
  const [zugWahlFeld, setZugWahlFeld] = useState<[number, number] | 'neu' | null>(null)
  // im Bahnbetrieb ein zusammengestellter Zug, der auf seinen Platz wartet: der nächste Tipp aufs Gleis stellt ihn hin
  const [zugWartet, setZugWartet] = useState<Zusammenstellung | null>(null)
  const lauf = useRef(0), bezahlt = useRef(new Set<string>())
  const [gutschrift, setGutschrift] = useState<number | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [bretter, setBretterRoh] = useState<GespeichertesBrett[]>(() => bretterLesen())
  const bretterRef = useRef(bretter)
  bretterRef.current = bretter
  const setBretter = (f: (l: GespeichertesBrett[]) => GespeichertesBrett[]) => setBretterRoh((l) => { const n = f(l); bretterMerken(n); return n })
  // beliebig viele Schritte zurück (Michael, 2026-11-22: «Man muss 10 Schritte rückwärts machen können», seit 2026-11-23 «Unendliche Schritte zurück
  // möglich machen»; nur im Speicher, bis die Seite neu lädt); jedes Bauen, Verschieben, Beispiel,
  // Leeren und jede neue Grösse ist ein Schritt, das Stellen der Weichen während der Fahrt nicht
  const [verlauf, setVerlauf] = useState<Brett[]>([])
  const setBrett = (b: Brett, merken = true) => {
    if (merken && b !== brett) setVerlauf((v) => [...v, brett])
    setBrettRoh(b)
  }
  const zurueck = () => {
    const alt = verlauf[verlauf.length - 1]
    if (!alt) return
    setVerlauf((v) => v.slice(0, -1)); setBrettRoh(alt); setMeldung(null); knopfTon(false)
  }
  const [werkzeug, setWerkzeug] = useState<Werkzeug>({ art: 'gleis', gleis: 'gerade' })
  const [dreh, setDreh] = useState<Dreh>(0)
  const [faehrt, setFaehrt] = useState(false)
  const [wagen, setWagen] = useState<WagenLage[][]>([])
  // der angetippte Zug während der Fahrt
  const [zugWahl, setZugWahl] = useState<Zug | null>(null)
  // ein oder zwei Züge (Michael, 2026-11-23, Vorschlag «Zweiter Zug auf demselben Netz»)
  // Anzahl Züge (Michael, 2026-11-24: «Anzahl Züge wählbar»), auf dem Gerät gemerkt
  // Taktfahrplan in Minuten (0 aus), auf dem Gerät gemerkt
  const [taktFrei, setTakt] = useState<number>(() => { try { const n = Number(localStorage.getItem('taktland.gleisbau.takt')); return (TAKT_WAHL as readonly number[]).includes(n) ? n : 0 } catch { return 0 } })
  // mit Taktfahrplan ist unter der Uhr oben links nichts; liegt dort etwas, fragt ein Blatt, ob es gelöscht werden soll (Michael, 2026-11-25, vor dem
  // Aufschalten: bei fremden Brettern nicht ohne Rückfrage löschen); bis dahin keine Uhr und keine Fahrt
  const taktSetzen = (n: number) => { setTakt(n); try { localStorage.setItem('taktland.gleisbau.takt', String(n)) } catch { /* ohne Speicher */ } }
  const spielSek = useRef(0)
  // der angetippte Bus während der Fahrt
  const [busWahl, setBusWahl] = useState<Bus | null>(null)
  const busse = useRef<Bus[]>([])
  const [busLagen, setBusLagen] = useState<BusLage[]>([])
  // fürs Netz der Strassen und den Anschluss: je Brett einmal gerechnet, die Halte der Züge je Bahnhof gezählt
  const busNetz = useRef<{ b: Brett | null; netz: ReturnType<typeof strassenNetz>; gruppen: Map<string, string> } | null>(null)
  const busZugHalte = useRef<number[]>([]), zugHalteJe = useRef(new Map<string, number>())
  const [zugZahl, setZugZahl] = useState(() => { try { const n = Number(localStorage.getItem('taktland.gleisbau.zuege')); return n >= 1 && n <= ZUEGE_MAX ? n : 1 } catch { return 1 } })
  const zugZahlSetzen = (n: number) => { const m = Math.max(1, Math.min(ZUEGE_MAX, n)); setZugZahl(m); try { localStorage.setItem('taktland.gleisbau.zuege', String(m)) } catch { /* ohne Speicher */ } }
  // Fahrzeuge am Zug samt Lok und Steuerwagen, auf dem Gerät gemerkt
  const [wagenZahl, setWagenZahl] = useState(() => { try { const n = Number(localStorage.getItem('taktland.gleisbau.wagen')); return n >= WAGEN_MIN && n <= WAGEN_MAX ? n : WAGEN } catch { return WAGEN } })
  const wagenSetzen = (n: number) => { const m = Math.max(WAGEN_MIN, Math.min(WAGEN_MAX, n)); setWagenZahl(m); try { localStorage.setItem('taktland.gleisbau.wagen', String(m)) } catch { /* ohne Speicher */ } }
  // Fahrgäste mit Ziel an den Bahnhöfen (Michael, 2026-11-23, Vorschlag «Fahrgäste»), am Anfang an
  const [mitFahrgaesten, setMitFahrgaesten] = useState(true)
  const [fahrgaeste, setFahrgaeste] = useState<Fahrgaeste | null>(null)
  // Ladungen der Güterzüge und was in dieser Fahrt ans Ziel kam (für die Transportaufgaben; bleibt nach dem Anhalten stehen)
  const gutRef = useRef<Gueter | null>(null), gutHalte = useRef(new Map<Zug, number>())
  const [ladungen, setLadungen] = useState<Record<string, Ladung[]> | null>(null)
  const [stand, setStand] = useState<Transport>({ fahrgaeste: 0, gueter: 0 })
  const fgRef = useRef<Fahrgaeste | null>(null)
  const halteRef = useRef<number[]>([])
  const [meldung, setMeldung] = useState<string | null>(null)
  // die neue Oberfläche (Michael, 2026-11-23): Menü, Reiter der Werkzeuge, Ziel der Aufgabe auf- und zugeklappt, Karte «Geschafft», Zoom
  const [menu, setMenu] = useState(false)
  const [reiter, setReiter] = useState('Gleise')
  const [zielOffen, setZielOffen] = useState(false)
  const [geloest, setGeloest] = useState(false)
  const [geteilt, setGeteilt] = useState(false)
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 })
  const buehne = useRef<HTMLDivElement>(null)
  const finger = useRef(new Map<number, { x: number; y: number }>())
  const zwei = useRef<{ d: number; mx: number; my: number; z: { s: number; x: number; y: number } } | null>(null)
  const [leerenScharf, setLeerenScharf] = useState(false)
  // langes Drücken auf ein belegtes Feld hebt es an, Ziehen verschiebt es (Michael, 2026-11-22)
  const [ziehen, setZiehen] = useState<{ von: [number, number]; nach: [number, number] } | null>(null)
  const druck = useRef<{ x: number; y: number; zeit: number; feld: [number, number] } | null>(null)
  const nachZiehen = useRef(false)
  // Linie ziehen: die Felder, über die der Finger gefahren ist
  const [linie, setLinie] = useState<Array<[number, number]> | null>(null)
  const linieRef = useRef<Array<[number, number]> | null>(null)
  /**
   * Malen (Michael, 2026-11-24: «Generell soll man bei ausgewählten Elementen ziehen können und es füllt auf der Fläche auf»): mit Boden, Fluss oder
   * Strasse gewählt, füllt Ziehen über die Felder alle; ein einziger Schritt zum Zurücknehmen. Wer still hält, verschiebt wie bisher
   */
  const malRef = useRef<Array<[number, number]> | null>(null)
  const malStart = useRef<{ x: number; y: number; feld: [number, number] } | null>(null)
  const [malen, setMalen] = useState<Array<[number, number]> | null>(null)
  const zuege = useRef<Zug[]>([])
  const pfiffe = useRef<number[]>([]), dorf = useRef(false)
  const brettRef = useRef(brett)
  // nach der Fahrt stehen die abgestellten Wagen wieder, wo sie vorher standen (angekuppelte und unterwegs abgestellte)
  const fahrtStart = useRef<Brett | null>(null)
  const wagenZurueck = () => {
    const s = fahrtStart.current
    fahrtStart.current = null
    if (!s) return
    setBrettRoh((b) => b.map((z, j) => z.map((f, i) => {
      const w = !!s[j]?.[i]?.wagen
      if (!!f.wagen === w) return f
      const { wagen: _, ...o } = f
      return w ? { ...o, wagen: true } : o
    })))
  }
  brettRef.current = brett
  const svg = useRef<SVGSVGElement>(null)
  const namen = useMemo(() => bahnhofNamen(brett), [brett])
  const knotenSet = useMemo(() => knotenGruppen(brett), [brett])
  const titel = useMemo(() => bahnhofTitel(brett), [brett])
  // Name eines Bahnhofs wählen (Michael, 2026-11-23, Vorschlag «Bahnhofsnamen»): das angetippte Feld, die Suche und die Bahnhöfe aus dem Index der App
  const [nameFeld, setNameFeld] = useState<[number, number] | null>(null)
  const [nameSuche, setNameSuche] = useState('')
  const [alleNamen, setAlleNamen] = useState<string[] | null>(null)
  useEffect(() => {
    if (!nameFeld || alleNamen) return
    indexLaden().then((ix) => setAlleNamen([...new Set(ix.bahnhoefe.map((e) => e.name))].sort((a, c) => a.localeCompare(c, 'de')))).catch(() => setAlleNamen([]))
  }, [nameFeld, alleNamen])
  const treffer = useMemo(() => {
    if (!alleNamen || !nameSuche.trim()) return []
    const q = ohneAkzente(nameSuche.trim())
    const anfang = alleNamen.filter((n) => ohneAkzente(n).startsWith(q)), mitte = alleNamen.filter((n) => !ohneAkzente(n).startsWith(q) && ohneAkzente(n).includes(q))
    return [...anfang, ...mitte].slice(0, 8)
  }, [alleNamen, nameSuche])
  const nameSetzen = (n: string | null) => {
    if (!nameFeld) return
    const gruppen = bahnhofGruppen(brett), g = gruppen.get(`${nameFeld[0]},${nameFeld[1]}`)
    // der Name gilt für den ganzen Bahnhof: auf dem angetippten Feld, auf den anderen Feldern desselben Bahnhofs weg
    setBrett(brett.map((z, j) => z.map((f, i) => {
      if (i === nameFeld[0] && j === nameFeld[1]) { const { name: _, ...ohne } = f; return n ? { ...ohne, name: n } : ohne }
      if (g && gruppen.get(`${i},${j}`) === g && f.name) { const { name: _, ...ohne } = f; return ohne }
      return f
    })))
    setNameFeld(null); setNameSuche(''); knopfTon(true)
  }
  const SP = spalten(brett), ZE = zeilen(brett)
  // was sich nur mit dem Brett ändert, einmal gebaut; je Bild der Fahrt kommen nur die Wagen neu dazu. Unter dem Zug Grund, Gebiete und Gleise,
  // darüber die Objekte (Bäume, Gipfel, Häuser), nach ihrem Fusspunkt geordnet
  const unten = useMemo(() => (
    <>
      <WiesenMuster sp={SP} ze={ZE} kante={KANTE.wiese} flaeche={F.wiese} />
      {brett.map((z, j) => z.map((f, i) => (f.grund === 'wiese' ? null : <GrundBild key={`g${i},${j}`} f={f} i={i} j={j} nurFlaeche />)))}
      <Landschaft brett={brett} />
      <GelaendeBild brett={brett} />
      <StrassenBild brett={brett} />
      {brett.map((z, j) => z.map((f, i) => <GleisBild key={`l${i},${j}`} f={f} i={i} j={j}
                                                     weiter={f.grund === 'berg' ? [0, 1, 2, 3].map((k) => tunnelWeiter(brett, i, j, k)) : undefined}
                                                     wasser={(u, v) => ueberWasser(brett[v]?.[u])} brett={brett} />))}
      <PerronVerbindungen brett={brett} />
    </>
  ), [brett, namen])
  const objekte = useMemo(() => objekteBauen(brett, imTunnel), [brett])
  const strassenOben = useMemo(() => <StrassenUeberBild brett={brett} />, [brett])
  const oberleitung = useMemo(() => <OberleitungBild brett={brett} />, [brett])
  // Bäume, Häuser und Büsche nur, wo man sie erkennt: ab 10 Bildpunkten je Feld und nur im sichtbaren Ausschnitt (grosse Bretter bis 192 × 108)
  const [buehneGr, setBuehneGr] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = buehne.current
    if (!el) return
    const ro = new ResizeObserver(() => setBuehneGr({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ansicht, offen])
  const sicht = (() => {
    const { w, h } = buehneGr
    if (!w || !h) return null
    const k = Math.min(w / (SP + 0.3), h / (ZE + 0.3)), ox = (w - (SP + 0.3) * k) / 2, oy = (h - (ZE + 0.3) * k) / 2
    if (k * zoom.s < 10) return { klein: true, i0: 0, i1: 0, j0: 0, j1: 0 }
    const zu = (sx: number, sy: number) => [((sx - zoom.x) / zoom.s - ox) / k - 0.15, ((sy - zoom.y) / zoom.s - oy) / k - 0.15]
    const [a0, b0] = zu(0, 0), [a1, b1] = zu(w, h)
    return { klein: false, i0: Math.floor(a0) - 1, i1: Math.ceil(a1) + 1, j0: Math.floor(b0) - 1, j1: Math.ceil(b1) + 2 }
  })()
  // Schilder so gross, dass die Schrift mindestens SCHILD_PX Bildpunkte hoch ist, höchstens SCHILD_HOECHSTENS-fach (gewählt)
  const SCHILD_PX = 12, SCHILD_HOECHSTENS = 3.5
  const feldPx = buehneGr.w && buehneGr.h ? Math.min(buehneGr.w / (SP + 0.3), buehneGr.h / (ZE + 0.3)) * zoom.s : 0
  const schildMass = feldPx ? Math.max(1, Math.min(SCHILD_HOECHSTENS, SCHILD_PX / (0.13 * feldPx))) : 1
  const sichtSchluessel = sicht ? (sicht.klein ? 'klein' : `${sicht.i0},${sicht.i1},${sicht.j0},${sicht.j1}`) : 'alle'
  const oben = useMemo(() => {
    if (sicht?.klein) return null
    const l = sicht ? objekte.filter((o) => o.x >= sicht.i0 && o.x <= sicht.i1 && o.y >= sicht.j0 && o.y <= sicht.j1) : objekte
    return l.map((o, k) => <ObjektBild key={k} o={o} />)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objekte, sichtSchluessel])
  // offene Gleisenden als roter Punkt, beim Bauen (Michael, 2026-11-23, Vorschlag «Anzeige, wo das Gleis offen endet»)
  const enden = useMemo(() => offeneEnden(brett), [brett])

  // Aufgaben (Michael, 2026-11-23, Vorschlag «Aufgaben»): eine gewählte Aufgabe hat ihr eigenes Brett, das freie bleibt gemerkt und kommt danach zurück
  const [aufgabe, setAufgabe] = useState<Aufgabe | null>(null)
  // in Aufgaben und Aufträgen kein Taktfahrplan: seine Uhr bräuchte die Felder oben links, wo die Aufgabe etwas vorgeben kann (Michael, 2026-11-26: «Bei den
  // Aufgaben im Gleisbau soll nicht nach einem Taktfahrplan gefragt werden. Dies gibt u.U. einen Konflikt mit der Aufgabe Elemente und der Uhr»)
  const takt = aufgabe ? 0 : taktFrei
  const uhrBelegt = useMemo(() => takt > 0 && uhrPlatz(brett) !== brett, [takt, brett])
  /**
   * was eine Aufgabe vorgibt (Bahnhöfe, Güterschuppen, Gleise), bleibt fest: nicht verschieben, ersetzen, drehen oder löschen (Michael, 2026-11-26:
   * «Ich kann die bereits eingebauten Gleise bewegen. Macht nicht Sinn oder?»); Name, Zug, Knoten, Ampel, Wagen und «Ohne Strom» gehen
   */
  const fest = useMemo(() => {
    if (!aufgabe) return null
    const l = new Set<string>()
    ;(aufgabe.vorgabeBrett ?? aufgabe.brett)().forEach((z, j) => z.forEach((f, i) => { if (f.gleis || f.teil || f.bau) l.add(`${i},${j}`) }))
    return l
  }, [aufgabe])
  const FEST_TEXT = 'Dieses Stück gibt die Aufgabe vor, es bleibt, wo es ist.'
  /**
   * je vorgegebenem Stück die hintere Seite, an die ohnehin nichts angebaut wird: dort ein Prellbock, die andere bleibt rot und lädt zum Ansetzen ein
   * (Michael, 2026-11-26: «Nur auf der Seite einen Prellbock wo eh nichts angebaut wird. Eine Seite darf rot sein»). Hinten ist das offene Ende, das
   * am weitesten von den anderen vorgegebenen Stücken weg zeigt (von der Mitte des Bretts, wenn es keine gibt); gewählt
   */
  const hinten = useMemo(() => {
    // im Tutorial kein Prellbock: das Brett wächst, jede Seite eines Bahnhofs kann die nächste Lektion brauchen (Michael, 2026-11-26, Flussau zeigte rechts einen
    // Prellbock, wo die Linie nach Alpwil hinaus muss)
    if (!aufgabe || !fest?.size || aufgabe.reihe !== undefined) return null
    const b0 = (aufgabe.vorgabeBrett ?? aufgabe.brett)(), l = new Set<string>(), alle = [...fest].map((k) => k.split(',').map(Number))
    const je = new Map<string, Array<{ x: number; y: number; k: number }>>()
    for (const e of offeneEnden(b0)) {
      const f = `${Math.floor(e.x - [0, 1, 0, -1][e.k] * 0.1)},${Math.floor(e.y - [-1, 0, 1, 0][e.k] * 0.1)}`
      if (fest.has(f)) je.set(f, [...(je.get(f) ?? []), e])
    }
    for (const [f, ee] of je) {
      const [i, j] = f.split(',').map(Number)
      const andere = alle.filter(([u, v]) => u !== i || v !== j)
      const [mx, my] = andere.length ? [andere.reduce((a, [u]) => a + u, 0) / andere.length, andere.reduce((a, [, v]) => a + v, 0) / andere.length] : [spalten(b0) / 2 - 0.5, zeilen(b0) / 2 - 0.5]
      const weg = (e: { k: number }) => [0, 1, 0, -1][e.k] * (mx - i) + [-1, 0, 1, 0][e.k] * (my - j)
      if (ee.length < 2) continue
      const h = ee.reduce((a, c) => (weg(c) < weg(a) ? c : a))
      l.add(`${f},${h.k}`)
    }
    return l
  }, [aufgabe, fest])
  /**
   * auch die Landschaft der Aufgabe bleibt: Dorf, Wald, Berg, Wasser, Fluss, Gelände und Objekte (Michael, 2026-11-26: «Auch Häuser und Berge sowie Bäume
   * sollen fix sein»); Gleise darüber gehen (Tunnel, Brücke), der Boden selbst ändert sich nicht und wandert beim Verschieben nicht mit
   */
  const festGrund = useMemo(() => {
    if (!aufgabe) return null
    const l = new Map<string, Feld>()
    ;(aufgabe.vorgabeBrett ?? aufgabe.brett)().forEach((z, j) => z.forEach((f, i) => { if (f.grund !== 'wiese' || f.fluss || f.objekt || f.hang !== undefined) l.set(`${i},${j}`, f) }))
    return l
  }, [aufgabe])
  const LANDSCHAFT_FEST = 'Die Landschaft gibt die Aufgabe vor: Häuser, Wald, Berge und Wasser bleiben. Gleise darüber gehen.'
  const landschaftGleich = (a: Feld, b: Feld) => a.grund === b.grund && !!a.fluss === !!b.fluss && a.objekt === b.objekt && a.hang === b.hang
  // ein Auftrag des Bahnbetriebs ist eine Aufgabe mit dem Auftrag dazu
  const auftrag = (aufgabe as { betrieb?: Auftrag } | null)?.betrieb ?? null
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null)
  const [fortschritt, setFortschritt] = useState<Record<string, number>>(() => fortschrittLesen())
  const aufgabeWaehlen = (a: Aufgabe | null, vonVorn = false) => {
    setFaehrt(false); zuege.current = []; setWagen([]); fgRef.current = null; setFahrgaeste(null)
    setAufgabe(a); setErgebnis(null); setGeloest(false); setStand({ fahrgaeste: 0, gueter: 0 }); setVerlauf([]); setMeldung(null); setNameFeld(null); setMenu(false); setZoom({ s: 1, x: 0, y: 0 })
    // ein Auftrag des Bahnbetriebs mit dem gemerkten Brett
    const gemerkt = a && (a as { betrieb?: Auftrag }).betrieb ? betriebLesen().bretter[a.id] : undefined
    const b = gemerkt ? brettAusCode(gemerkt) : null
    if (a) setBrettRoh(b ?? (vonVorn && a.neu ? a.neu() : a.brett()))
    setGutschrift(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // gelöst ist eine Aufgabe, sobald die Prüfung stimmt; die Sterne bleiben auf dem Gerät, die besten zählen
  useEffect(() => {
    if (!aufgabe) return
    const e = bewerten(aufgabe, brett, stand)
    if (e.ok) {
      setErgebnis((alt) => { if (!alt?.ok) setGeloest(true); return e })
      setFortschritt((f) => {
        if ((f[aufgabe.id] ?? 0) >= e.sterne) return f
        const n = { ...f, [aufgabe.id]: e.sterne }; fortschrittMerken(n); return n
      })
      // in der Reihe: das gelöste Brett ist der Anfang der nächsten Aufgabe
      if (aufgabe.reihe !== undefined) reiheGeloestMerken(aufgabe.id, brett)
    } else setErgebnis((alt) => (alt?.ok ? null : alt))
  }, [aufgabe, brett, stand])
  // in der Reihe das angefangene Brett merken
  useEffect(() => {
    if (aufgabe?.reihe !== undefined) reiheArbeitMerken(aufgabe.id, brett)
  }, [aufgabe, brett])
  // das Brett eines Auftrags merken
  useEffect(() => {
    if (!auftrag) return
    const code = brettCode(brett)
    setBetrieb((b) => (b.bretter[auftrag.id] === code ? b : { ...b, bretter: { ...b.bretter, [auftrag.id]: code } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brett, auftrag])
  // erfüllt: der Gewinn kommt aufs Konto, einmal je Fahrt; beim Wiederholen ein Viertel
  useEffect(() => {
    if (!geloest || !auftrag || !ergebnis?.ok) return
    const k = `${auftrag.id}:${lauf.current}`
    if (bezahlt.current.has(k)) return
    bezahlt.current.add(k)
    const kosten = (aufgabe as Aufgabe).kosten?.(brett) ?? 0
    const gewinn = Math.max(0, auftrag.lohn - kosten) * (betrieb.erledigt[auftrag.id] ? WIEDERHOLT_ANTEIL : 1)
    setGutschrift(Math.round(gewinn))
    setBetrieb((b) => ({ ...b, geld: b.geld + Math.round(gewinn), erledigt: { ...b.erledigt, [auftrag.id]: Math.max(b.erledigt[auftrag.id] ?? 0, ergebnis.sterne) } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geloest])
  // ein offenes Brett speichert sich bei jeder Änderung selbst und rückt in der Liste nach oben
  useEffect(() => {
    if (ansicht !== 'brett' || !offen) return
    const code = brettCode(brett)
    setBretter((l) => {
      const e = l.find((x) => x.id === offen)
      if (!e || e.code === code) return l
      return [{ ...e, code, geaendert: Date.now() }, ...l.filter((x) => x.id !== offen)]
    })
  }, [brett, ansicht, offen])
  // die Adresse lesen; ein geteilter Link #/gleisbau?brett=… wird ein neues eigenes Brett
  useEffect(() => {
    const lesen = () => {
      const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
      setFaehrt(false); zuege.current = []; setWagen([]); fgRef.current = null; setFahrgaeste(null); setMeldung(null); setNameFeld(null)
      const code = q.get('brett')
      if (code) {
        const b = brettAusCode(code)
        if (!b) { history.replaceState(history.state, '', '#/gleisbau'); setAnsicht('liste'); setMeldung('Der Link enthält kein gültiges Brett.'); return }
        const id = neueId()
        const e = { id, name: 'Geteiltes Brett', code: brettCode(b), geaendert: Date.now() }
        // gleich auch in der Ref, damit ein zweites Lesen der Adresse (jetzt ?id=…) das Brett schon findet
        bretterRef.current = [e, ...bretterRef.current]
        setBretter((l) => [e, ...l])
        history.replaceState(history.state, '', `#/gleisbau?id=${id}`)
        setOffen(id); setBrettRoh(b); setVerlauf([]); setAufgabe(null); setAnsicht('brett'); setMeldung('Geteiltes Brett als eigenes Brett gespeichert.')
        return
      }
      const id = q.get('id'), e = id ? bretterRef.current.find((x) => x.id === id) : null
      const b = e ? brettAusCode(e.code) : null
      if (e && b) { setOffen(e.id); setBrettRoh(b); setVerlauf([]); setAufgabe(null); setAnsicht('brett'); return }
      setOffen(null)
      const aid = q.get('aufgabe'), a = aid ? AUFGABEN.find((x) => x.id === aid) : null
      if (a && !reiheOffen(a, fortschrittLesen())) { setAufgabe(null); setAnsicht('aufgaben'); return }
      if (a) { setAnsicht('aufgaben'); aufgabeWaehlen(a); return }
      // alte Links auf echte Strecken (seit 2026-11-26 weg) führen zum Tutorial
      if (aid) { setAufgabe(null); setAnsicht('aufgaben'); return }
      if (q.has('aufgaben')) { setAufgabe(null); setAnsicht('aufgaben'); return }
      if (q.has('frei')) { setAufgabe(null); setAnsicht('frei'); return }
      const auid = q.get('auftrag'), au = auid ? AUFTRAEGE.find((x) => x.id === auid) : null
      if (au) { setAnsicht('betrieb'); aufgabeWaehlen(auftragAlsAufgabe(au)); return }
      if (q.has('betrieb')) { setAufgabe(null); setAnsicht('betrieb'); return }
      setAufgabe(null); setAnsicht('liste')
    }
    lesen()
    window.addEventListener('hashchange', lesen)
    return () => window.removeEventListener('hashchange', lesen)
  }, [])
  // eine Meldung verschwindet nach 4 s, das Menü und die Karte schliessen sich mit der Fahrt nicht
  useEffect(() => {
    if (!meldung) return
    const t = window.setTimeout(() => setMeldung(null), 4000)
    return () => window.clearTimeout(t)
  }, [meldung])
  // im Vollbild steht die Seite darunter still
  const imVollbild = ansicht === 'brett' || ((ansicht === 'aufgaben' || ansicht === 'betrieb') && !!aufgabe)
  useEffect(() => {
    if (!imVollbild) return
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = vorher }
  }, [imVollbild])
  useEffect(() => { setZoom({ s: 1, x: 0, y: 0 }) }, [offen])
  const brettTeilen = async () => {
    const url = brettLink(brettCode(brett)), name = bretter.find((x) => x.id === offen)?.name ?? 'Brett'
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: `Gleisbau: ${name}`, url }); return } catch (x) { if ((x as DOMException).name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url); setGeteilt(true); window.setTimeout(() => setGeteilt(false), 2500) } catch { window.prompt('Link zum Brett', url) }
  }
  // zwei Finger zoomen (1- bis 4-fach) und verschieben das Brett; dabei gilt kein Tipp und keine Linie
  // so weit hinein, dass ein Feld etwa 60 Bildpunkte breit wird, mindestens 4-fach (gewählt; grosse Bretter brauchen mehr)
  const zoomMax = Math.max(4, Math.min(40, (60 * Math.max(SP, ZE)) / Math.max(1, Math.min(buehne.current?.clientWidth ?? 400, buehne.current?.clientHeight ?? 400))))
  const zoomSetzen = (s: number, x: number, y: number) => {
    const el = buehne.current
    if (!el || s <= 1.001) { setZoom({ s: 1, x: 0, y: 0 }); return }
    const w = el.clientWidth, h = el.clientHeight
    setZoom({ s, x: Math.min(0, Math.max(w - w * s, x)), y: Math.min(0, Math.max(h - h * s, y)) })
  }
  // Verschieben mit einem Finger und die Lupen (um die Mitte der Bühne)
  const [schiebeModus, setSchiebeModus] = useState(false)
  const schieben = useRef<{ x: number; y: number; z: { s: number; x: number; y: number }; weit: boolean } | null>(null)
  const lupe = (f: number) => {
    const el = buehne.current
    if (!el) return
    const mx = el.clientWidth / 2, my = el.clientHeight / 2, s = Math.max(1, Math.min(zoomMax, zoom.s * f))
    zoomSetzen(s, mx - ((mx - zoom.x) * s) / zoom.s, my - ((my - zoom.y) * s) / zoom.s)
  }
  const buehneDrucken = (e: React.PointerEvent<HTMLDivElement>) => {
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // mit «Verschieben» schiebt ein Finger den Ausschnitt
    if (schiebeModus && finger.current.size === 1) { schieben.current = { x: e.clientX, y: e.clientY, z: zoom, weit: false }; return }
    schieben.current = null
    if (finger.current.size !== 2) return
    druck.current = null; setZiehen(null); linieRef.current = null; setLinie(null); malRef.current = null; malStart.current = null; setMalen(null); nachZiehen.current = true
    const [a, b] = [...finger.current.values()], r = buehne.current!.getBoundingClientRect()
    zwei.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, z: zoom }
  }
  const buehneBewegen = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!finger.current.has(e.pointerId)) return
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const sc = schieben.current
    if (sc) {
      const dx = e.clientX - sc.x, dy = e.clientY - sc.y
      if (!sc.weit && Math.hypot(dx, dy) > 6) sc.weit = true
      if (sc.weit) zoomSetzen(sc.z.s, sc.z.x + dx, sc.z.y + dy)
      return
    }
    const z = zwei.current
    if (!z || finger.current.size !== 2) return
    const [a, b] = [...finger.current.values()], r = buehne.current!.getBoundingClientRect()
    const s = Math.max(1, Math.min(zoomMax, (z.z.s * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, z.d)))
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top
    zoomSetzen(s, mx - ((z.mx - z.z.x) * s) / z.z.s, my - ((z.my - z.z.y) * s) / z.z.s)
  }
  const buehneLos = (e: React.PointerEvent<HTMLDivElement>) => {
    finger.current.delete(e.pointerId)
    if (schieben.current?.weit) { nachZiehen.current = true; window.setTimeout(() => { nachZiehen.current = false }, 300) }
    schieben.current = null
    if (finger.current.size < 2 && zwei.current) { zwei.current = null; window.setTimeout(() => { nachZiehen.current = false }, 300) }
  }
  const buehneRad = (e: React.WheelEvent<HTMLDivElement>) => {
    const r = buehne.current!.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top
    const s = Math.max(1, Math.min(zoomMax, zoom.s * Math.exp(-e.deltaY * 0.002)))
    zoomSetzen(s, mx - ((mx - zoom.x) * s) / zoom.s, my - ((my - zoom.y) * s) / zoom.s)
  }
  const neuesBrett = (sp: number, ze: number) => {
    const id = neueId()
    setBretter((l) => [{ id, name: `Brett ${l.length + 1}`, code: brettCode(leer(sp, ze)), geaendert: Date.now() }, ...l])
    window.location.hash = `#/gleisbau?id=${id}`
  }
  useEffect(() => {
    if (!leerenScharf) return
    const t = setTimeout(() => setLeerenScharf(false), 3000)
    return () => clearTimeout(t)
  }, [leerenScharf])

  /** im Bild: welche Güterwagen beladen sind */
  const beladenZeigen = (z: Zug, l: WagenLage[]) => {
    const drin = gutRef.current?.imZug.get(z)
    if (!drin?.length) return l
    const voll = new Set(drin.map((x) => x.wagen))
    return l.map((w, k) => (voll.has(k) ? { ...w, beladen: true } : w))
  }
  // der Zug je Bild
  // Pause während der Fahrt (Michael, 2026-11-26: «Während des Abspielens muss man Pause drücken können»): alles steht, Weichen und Ampeln lassen sich stellen
  const [pause, setPause] = useState(false)
  const pauseRef = useRef(false)
  pauseRef.current = pause
  useEffect(() => { if (!faehrt) setPause(false) }, [faehrt])
  useEffect(() => { if (pause) zuggeraeuschAus() }, [pause])
  useEffect(() => {
    if (!faehrt) return
    let los = 0, letzt = performance.now()
    const bild = (jetzt: number) => {
      if (pauseRef.current) { letzt = jetzt; los = requestAnimationFrame(bild); return }
      const dt = Math.min(0.05, (jetzt - letzt) / 1000)
      spielSek.current += dt
      letzt = jetzt
      // je Zug ein Schritt; ein Zug fährt nur in Felder ein, die der andere nicht belegt (wie vor einem roten Signal); warten beide aufeinander,
      // kehrt der um, der länger wartet
      const zz = zuege.current
      const weg = new Set<Zug>()
      zz.forEach((z, k) => {
        if (weg.has(z)) return
        const andere = zz.filter((_, m) => m !== k && !weg.has(zz[m]))
        const vorher = z.stromlos
        z.schritt(brettRef.current, dt,
          andere.length ? (felder) => andere.every((o) => { const b = o.belegt(); return [...felder].every((f) => !b.has(f)) }) : undefined,
          () => z.wartet > UMKEHREN_NACH_S && andere.some((o) => o.wartet > 0.5) && andere.every((o) => o.wartet <= z.wartet),
          // ankuppeln: der Wagen verschwindet vom Gleis, bis die Fahrt endet
          (i, j) => {
            const b = brettRef.current.map((zz, jj) => (jj === j ? zz.map((x, ii) => { if (ii !== i) return x; const { wagen: _, ...o } = x; return o }) : zz))
            brettRef.current = b; setBrettRoh(b); knopfTon(true)
          },
          // abschleppen: ein Zug mit Diesellok holt einen stehenden Stromzug, der im Weg steht
          (n) => {
            if (!z.diesel()) return false
            const o = andere.find((x) => x.stromlos && [...x.belegt()].some((f) => f === `${n.i},${n.j}` || f.startsWith(`${n.i},${n.j}:`)))
            if (!o || !z.schleppen(o, n)) return false
            weg.add(o)
            const fg = fgRef.current, oi = zz.indexOf(o)
            if (fg && fg.imZug[oi]) fg.imZug[k].push(...fg.imZug[oi])
            setMeldung(`${zz.length > 1 ? `Zug ${k + 1}` : 'Der Zug'} schleppt Zug ${oi + 1} ab.`); knopfTon(true)
            return true
          })
        if (!vorher && z.stromlos) setMeldung(`${zz.length > 1 ? `Zug ${k + 1}` : 'Der Zug'} hat keinen Strom und bleibt stehen. Eine Diesellok kann ihn abschleppen.`)
      })
      // abgeschleppte Züge sind jetzt Teil eines anderen
      if (weg.size) {
        const fg = fgRef.current
        for (let m = zz.length - 1; m >= 0; m--) if (weg.has(zz[m])) {
          zz.splice(m, 1); halteRef.current.splice(m, 1); pfiffe.current.splice(m, 1)
          if (fg) fg.imZug.splice(m, 1)
        }
        if (fg) setFahrgaeste({ ...fg, warten: { ...fg.warten }, imZug: fg.imZug.map((l) => [...l]) })
      }
      // das Zuggeräusch von Taktland wie beim Fahren (Michael, 2026-11-22: «Kannst du während der Zugfahrt das Zuggeräusch von Taktland nehmen?»):
      // das volle Tempo des Bretts klingt wie ZUG_KLANG_MS (gewählt), im Tunnel dumpfer, auf einer Brücke hohler
      zz.forEach((z, k) => { if (z.pfiffe !== (pfiffe.current[k] ?? 0)) { pfiffe.current[k] = z.pfiffe; abfahrtsPfiff(k ? 0.5 : 0.8) } })
      const z = zz[0]
      if (z) {
        // Pfiff kurz vor der Abfahrt am Bahnhof, eine Glocke, wenn die Spitze an ein Dorf kommt (Michael, 2026-11-23, Vorschlag «Kleine Geräusche»)
        const [di, dj] = z.spitze(), b0 = brettRef.current
        const amDorf = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([u, v]) => b0[dj + v]?.[di + u]?.grund === 'dorf')
        if (amDorf && !dorf.current) kirchenSchlag(1, null, 0.7)
        dorf.current = amDorf
        const [si, sj] = z.spitze(), f = brettRef.current[sj]?.[si]
        const ort = f?.gleis && !grosseKurve(f.gleis) ? (f.grund === 'berg' ? 'tunnel' : ueberWasser(f) ? 'bruecke' : null) : null
        zuggeraeuschTempo(z.anteil() * ZUG_KLANG_MS, Infinity, ort, 1, true)
      }
      // Ladungen: neue an den Güterschuppen, Ab- und Aufladen bei jedem Halt eines Güterzugs
      const gut = gutRef.current
      if (gut) {
        const b0 = brettRef.current
        let neuG = gueterZeit(gut, dt)
        for (const z of zz) {
          if (z.art === 'person' || z.halte === (gutHalte.current.get(z) ?? 0)) continue
          gutHalte.current.set(z, z.halte)
          const [hi, hj] = z.haltFeld.split(',').map(Number)
          if (!gueterGilt(b0[hj]?.[hi])) continue
          const { ab, auf } = gueterHalt(gut, z, z.haltFeld)
          if (ab) antwortTon('richtig')
          if (ab || auf) neuG = true
        }
        if (neuG) { setLadungen({ ...gut.warten }); setStand((s) => (s.gueter === gut.geliefert ? s : { ...s, gueter: gut.geliefert, jeGut: { ...gut.jeGut } })) }
      }
      // Fahrgäste: neue an den Bahnhöfen, Aus- und Einsteigen bei jedem Halt
      const fg = fgRef.current
      if (fg) {
        const gruppen = bahnhofGruppen(brettRef.current), bahnhoefe = [...new Set(gruppen.values())]
        let neu = fahrgaesteZeit(fg, dt, bahnhoefe)
        zz.forEach((z, k) => {
          if (z.halte === (halteRef.current[k] ?? 0)) return
          halteRef.current[k] = z.halte
          const wo = gruppen.get(z.haltFeld)
          if (!wo) return
          const { aus, ein } = fahrgaesteHalt(fg, k, wo, z.plaetze(WAGEN_ARTEN.person.plaetze))
          if (aus) antwortTon('richtig')
          if (aus || ein) neu = true
        })
        if (neu) { setFahrgaeste({ ...fg, warten: { ...fg.warten }, imZug: fg.imZug.map((l) => [...l]) }); setStand((s) => (s.fahrgaeste === fg.gebracht ? s : { ...s, fahrgaeste: fg.gebracht })) }
      }
      // die Busse: nach den Zügen, damit sie die Wagen am Bahnübergang sehen
      const bb = busse.current
      if (bb.length) {
        const b0 = brettRef.current
        if (busNetz.current?.b !== b0) busNetz.current = { b: b0, netz: strassenNetz(b0), gruppen: bahnhofGruppen(b0) }
        const { netz, gruppen } = busNetz.current
        zz.forEach((z, k) => {
          if (z.halte === (busZugHalte.current[k] ?? 0)) return
          busZugHalte.current[k] = z.halte
          const g = gruppen.get(z.haltFeld)
          if (g) zugHalteJe.current.set(g, (zugHalteJe.current.get(g) ?? 0) + 1)
        })
        const ww = zz.flatMap((z) => z.wagen())
        const gruppeBei = (i: number, j: number) => {
          for (let v = j - 1; v <= j + 1; v++) for (let u = i - 1; u <= i + 1; u++) if (istBahnhof(b0[v]?.[u]?.gleis)) { const g = gruppen.get(`${u},${v}`); if (g) return g }
          return null
        }
        const lagen = bb.map((x) => x.lage(b0))
        bb.forEach((x, k) => {
          const m = x.schritt(b0, netz, dt, spielSek.current, ww, lagen.filter((_, n) => n !== k), (g) => zugHalteJe.current.get(g) ?? 0, gruppeBei)
          if (m === 'anschluss') {
            const g = gruppeBei(x.i, x.j)
            setMeldung(`Anschluss${g ? ` in ${bahnhofTitel(b0).get(g) ?? g}` : ''}: ${bb.length > 1 ? `Bus ${x.nr + 1}` : 'Der Bus'} hat auf den Zug gewartet und fährt ab.`); antwortTon('richtig')
          }
          lagen[k] = x.lage(b0)
        })
        setBusLagen(lagen)
      }
      setWagen(zz.map((z) => beladenZeigen(z, z.wagen())))
      los = requestAnimationFrame(bild)
    }
    los = requestAnimationFrame(bild)
    return () => { cancelAnimationFrame(los); zuggeraeuschAus() }
  }, [faehrt])

  /** das Feld unter einem Punkt des Bildschirms; das Bild reicht je 0,15 Felder über das Brett hinaus (der Rand des Tabletts) */
  function feldBei(x: number, y: number): [number, number] | null {
    // das Bild füllt das Element nur in einer Richtung (preserveAspectRatio meet), in der anderen bleibt ein Rand
    const r = svg.current!.getBoundingClientRect(), vw = SP + 0.3, vh = ZE + 0.3, k = Math.min(r.width / vw, r.height / vh)
    const ox = r.left + (r.width - vw * k) / 2, oy = r.top + (r.height - vh * k) / 2
    const i = Math.floor((x - ox) / k - 0.15), j = Math.floor((y - oy) / k - 0.15)
    return i < 0 || j < 0 || i >= SP || j >= ZE ? null : [i, j]
  }

  // langes Drücken: nach 450 ms ohne Bewegung (mehr als 8 Bildpunkte bricht ab, dann darf die Seite rollen), gewählt
  useEffect(() => {
    const el = svg.current
    if (!el) return
    // während des Ziehens darf die Seite nicht rollen
    const halt = (e: TouchEvent) => { if (druck.current?.zeit === -1 || linieRef.current || malRef.current) e.preventDefault() }
    el.addEventListener('touchmove', halt, { passive: false })
    return () => el.removeEventListener('touchmove', halt)
  }, [])

  /**
   * mit der Maus von einem roten Punkt zu einem anderen ziehen: dazwischen entsteht von selbst das passende Gleis (Michael, 2026-11-26: «wenn man 2 rote Punkte
   * mit der Maus verbinden könnte und sich dann das nächstlogische Gleis dazwischen aufbauen würde»; endenWeg in gleisbau.ts); auf Touch zieht man wie bisher
   */
  const verbindeRef = useRef<{ von: { x: number; y: number; k: number }; x: number; y: number } | null>(null)
  const [verbinde, setVerbinde] = useState<{ von: { x: number; y: number; k: number }; x: number; y: number } | null>(null)
  const [ueberEnde, setUeberEnde] = useState(false)
  const brettPunkt = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect(), vw = SP + 0.3, vh = ZE + 0.3, kk = Math.min(r.width / vw, r.height / vh)
    return { x: (cx - r.left - (r.width - vw * kk) / 2) / kk - 0.15, y: (cy - r.top - (r.height - vh * kk) / 2) / kk - 0.15 }
  }
  const ENDE_NAH = 0.22
  const endeBei = (x: number, y: number, ohne?: { x: number; y: number }) => {
    let best: (typeof enden)[number] | null = null, d = ENDE_NAH
    for (const e of enden) { if (ohne && e.x === ohne.x && e.y === ohne.y) continue; const dd = Math.hypot(e.x - x, e.y - y); if (dd < d) { d = dd; best = e } }
    return best
  }
  function verbindenFertig() {
    const v = verbindeRef.current
    verbindeRef.current = null; setVerbinde(null)
    if (!v) return
    nachZiehen.current = true
    window.setTimeout(() => { nachZiehen.current = false }, 250)
    const ziel = endeBei(v.x, v.y, v.von)
    if (!ziel) { if (Math.hypot(v.x - v.von.x, v.y - v.von.y) > ENDE_NAH) setMeldung('Zieh von einem roten Punkt bis zu einem anderen roten Punkt, dann entsteht das Gleis dazwischen.'); return }
    const weg = endenWeg(brett, v.von, ziel, (i, j) => (takt > 0 && uhrFeld(i, j)) || !!fest?.has(`${i},${j}`))
    if (typeof weg === 'string') { setMeldung(weg); return }
    const r = linieLegen(brett, weg)
    if (typeof r === 'string') { setMeldung(r); return }
    if (fest && [...fest].some((k) => { const [i, j] = k.split(',').map(Number); return JSON.stringify([r[j][i].gleis, r[j][i].bau]) !== JSON.stringify([brett[j][i].gleis, brett[j][i].bau]) })) {
      setMeldung('Die Verbindung würde ein Stück ändern, das die Aufgabe vorgibt.'); return
    }
    setBrett(r); knopfTon(true); setMeldung(null)
  }

  function drucken(e: React.PointerEvent<SVGSVGElement>) {
    if (faehrt || !e.isPrimary || schiebeModus) return
    if (e.pointerType === 'mouse') {
      const p = brettPunkt(e.clientX, e.clientY), von = endeBei(p.x, p.y)
      if (von) {
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ohne Fangen geht es trotzdem */ }
        verbindeRef.current = { von, ...p }; setVerbinde(verbindeRef.current)
        return
      }
    }
    const feld = feldBei(e.clientX, e.clientY)
    if (!feld) return
    if (werkzeug.art === 'linie') {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ohne Fangen geht es trotzdem */ }
      linieRef.current = [feld]; setLinie([feld])
      return
    }
    malStart.current = MAL_WERKZEUGE.includes(werkzeug.art) ? { x: e.clientX, y: e.clientY, feld } : null
    const f = brett[feld[1]][feld[0]]
    if (!f.gleis && !f.teil && f.grund === 'wiese') return
    const d = { x: e.clientX, y: e.clientY, zeit: 0, feld }
    druck.current = d
    const id = e.pointerId, el = e.currentTarget
    window.setTimeout(() => {
      if (druck.current !== d) return
      if (fest?.has(`${feld[0]},${feld[1]}`)) { druck.current = null; setMeldung(FEST_TEXT); return }
      d.zeit = -1
      try { el.setPointerCapture(id) } catch { /* ohne Fangen geht es trotzdem */ }
      navigator.vibrate?.(15)
      setZiehen({ von: feld, nach: feld })
    }, 450)
  }
  function bewegen(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === 'mouse' && !faehrt) {
      const p = brettPunkt(e.clientX, e.clientY)
      if (verbindeRef.current) { verbindeRef.current = { ...verbindeRef.current, ...p }; setVerbinde(verbindeRef.current); return }
      const da = !!endeBei(p.x, p.y)
      if (da !== ueberEnde) setUeberEnde(da)
    }
    // Malen beginnt, sobald der Finger vor dem langen Drücken ein anderes Feld erreicht
    const ms = malStart.current
    if (ms && !malRef.current && druck.current?.zeit !== -1) {
      const feld = feldBei(e.clientX, e.clientY)
      if (feld && (feld[0] !== ms.feld[0] || feld[1] !== ms.feld[1])) {
        druck.current = null
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ohne Fangen geht es trotzdem */ }
        malRef.current = [ms.feld]
      }
    }
    const l = malRef.current ?? linieRef.current
    if (l) {
      const feld = feldBei(e.clientX, e.clientY)
      if (!feld) return
      let neu = l
      if (malRef.current) {
        // beim Malen jedes Feld auf dem Weg einmal
        for (let k = 0; k < 30; k++) {
          const [li, lj] = neu[neu.length - 1]
          if (li === feld[0] && lj === feld[1]) break
          const dx = feld[0] - li, dy = feld[1] - lj
          const schritt: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [li + Math.sign(dx), lj] : [li, lj + Math.sign(dy)]
          neu = [...neu, schritt]
        }
        if (neu !== l) { malRef.current = neu; setMalen(neu) }
        return
      }
      // Feld für Feld zum Finger, auch wenn er ein Feld übersprungen hat; zurück zum vorletzten nimmt das letzte weg
      for (let k = 0; k < 30; k++) {
        const [li, lj] = neu[neu.length - 1]
        if (li === feld[0] && lj === feld[1]) break
        const dx = feld[0] - li, dy = feld[1] - lj
        const schritt: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [li + Math.sign(dx), lj] : [li, lj + Math.sign(dy)]
        const v = neu[neu.length - 2]
        if (v && v[0] === schritt[0] && v[1] === schritt[1]) neu = neu.slice(0, -1)
        // ein Feld darf wieder vorkommen (ein Ring schliesst sich, eine Linie kreuzt sich), höchstens 200 Schritte
        else if (neu.length < 200) neu = [...neu, schritt]
        else break
      }
      if (neu !== l) { linieRef.current = neu; setLinie(neu) }
      return
    }
    const d = druck.current
    if (!d) return
    if (d.zeit !== -1) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) druck.current = null; return }
    const feld = feldBei(e.clientX, e.clientY)
    if (feld) setZiehen((z) => (z && (z.nach[0] !== feld[0] || z.nach[1] !== feld[1]) ? { ...z, nach: feld } : z))
  }
  function loslassen() {
    if (verbindeRef.current) { verbindenFertig(); return }
    malStart.current = null
    const m = malRef.current
    if (m) {
      malRef.current = null; setMalen(null)
      nachZiehen.current = true
      window.setTimeout(() => { nachZiehen.current = false }, 250)
      const r = malenAnwenden(brett, m.filter(([i, j]) => !(takt > 0 && uhrFeld(i, j)) && !fest?.has(`${i},${j}`) && !(festGrund?.has(`${i},${j}`) && werkzeug.art !== 'strasse' && werkzeug.art !== 'strom')), werkzeug)
      if (r !== brett) { setBrett(r); knopfTon(true); setMeldung(null) }
      return
    }
    const l = linieRef.current
    if (l) {
      linieRef.current = null; setLinie(null)
      nachZiehen.current = true
      window.setTimeout(() => { nachZiehen.current = false }, 250)
      if (l.length < 2) { setMeldung('Mit «Linie ziehen» den Finger über mehrere Felder ziehen: Geraden und Kurven entstehen von selbst.'); return }
      if (takt > 0 && l.some(([i, j]) => uhrFeld(i, j))) { setMeldung('Oben links steht die Uhr des Taktfahrplans, dort geht keine Linie durch.'); return }
      const r = linieLegen(brett, l)
      if (typeof r === 'string') { setMeldung(r); return }
      // eine Linie darf an vorgegebene Stücke anschliessen, sie aber nicht ändern
      if (fest && [...fest].some((k) => { const [i, j] = k.split(',').map(Number); return JSON.stringify([r[j][i].gleis, r[j][i].bau]) !== JSON.stringify([brett[j][i].gleis, brett[j][i].bau]) })) {
        setMeldung('Die Linie würde ein Stück ändern, das die Aufgabe vorgibt. Zieh sie bis davor, das Stück schliesst an.'); return
      }
      setBrett(r); knopfTon(true); setMeldung(null)
      return
    }
    const d = druck.current
    druck.current = null
    if (!d || d.zeit !== -1 || !ziehen) return
    nachZiehen.current = true
    // falls kein Klick folgt, gilt der nächste Tipp wieder
    window.setTimeout(() => { nachZiehen.current = false }, 250)
    if (fest?.has(`${ziehen.nach[0]},${ziehen.nach[1]}`)) { setZiehen(null); setMeldung(FEST_TEXT); return }
    const r0 = verschieben(brett, ziehen.von, ziehen.nach)
    setZiehen(null)
    if (typeof r0 === 'string') { setMeldung(r0); return }
    // in einer Aufgabe wandert nur, was gebaut ist; der Boden bleibt an beiden Stellen
    const r = aufgabe ? r0.map((z, j) => z.map((f, i) => {
      if (f === brett[j][i]) return f
      const o = brett[j][i]
      const { grund: _g, fluss: _f, objekt: _o, hang: _h, ...rest } = f
      return { ...rest, grund: o.grund, ...(o.fluss ? { fluss: true as const } : {}), ...(o.objekt ? { objekt: o.objekt } : {}), ...(o.hang !== undefined ? { hang: o.hang } : {}) }
    })) : r0
    if (r !== brett) { setBrett(r); knopfTon(true) }
  }

  /**
   * mit der Maus ein Feld auswählen und mit Entf oder Rückschritt seinen obersten Inhalt wegnehmen, Schicht um Schicht bis zur Wiese, wie «Entfernen»
   * (Michael, 2026-11-26: «wenn man mit der Maus auf die Kacheln klicken könnte, diese selektioniert würden und diese mit der Tastatur Backstage oder
   * Delete-Taste gelöscht werden könnten. Also nicht die Kachel löschen, sondern der oberste Inhalt, bis nur noch die Wiese da ist»); Esc hebt die Wahl auf
   */
  const [auswahl, setAuswahl] = useState<[number, number] | null>(null)
  const mausKlick = useRef(false)
  const bauenRef = useRef<(i: number, j: number, w: Werkzeug) => void>(() => {})
  bauenRef.current = (i, j, w) => bauen(i, j, w)
  useEffect(() => {
    if (!auswahl) return
    const taste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null
      if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable)) return
      if (e.key === 'Escape') { setAuswahl(null); return }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      e.preventDefault()
      if (faehrt) { setMeldung('Zum Löschen zuerst anhalten.'); return }
      bauenRef.current(auswahl[0], auswahl[1], { art: 'weg' })
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [auswahl, faehrt])
  // ein anderes Brett, eine Aufgabe oder das Fahren heben die Wahl auf
  useEffect(() => { setAuswahl(null) }, [offen, aufgabe, faehrt])
  // passt das Feld nach einer Grössenänderung nicht mehr, ist die Wahl weg
  const auswahlDa = auswahl && auswahl[0] < SP && auswahl[1] < ZE ? auswahl : null

  function feldAn(e: React.MouseEvent<SVGSVGElement>) {
    // der Klick nach dem Loslassen eines gezogenen Felds legt nichts
    if (nachZiehen.current) { nachZiehen.current = false; return }
    const feld = feldBei(e.clientX, e.clientY)
    if (!feld) return
    const [i, j] = feld
    const f = brett[j][i]
    // während der Fahrt stellen Tipps nur die Weichen
    if (faehrt) {
      // ein Tipp auf einen Zug öffnet dessen Blatt (Wagen, Richtung, Entfernen)
      const r = svg.current!.getBoundingClientRect(), vw = SP + 0.3, vh = ZE + 0.3, kk = Math.min(r.width / vw, r.height / vh)
      const px = (e.clientX - r.left - (r.width - vw * kk) / 2) / kk - 0.15, py = (e.clientY - r.top - (r.height - vh * kk) / 2) / kk - 0.15
      let naechster: Zug | null = null, d = ZUG_TIPP
      zuege.current.forEach((z) => z.wagen().forEach((w) => { const dd = Math.hypot(w.x - px, w.y - py); if (dd < d) { d = dd; naechster = z } }))
      // ein Bus näher als jeder Wagen öffnet dessen Blatt
      let bus: Bus | null = null
      busse.current.forEach((x, k) => { const l = busLagen[k]; if (!l || l.tunnel) return; const dd = Math.hypot(l.x - px, l.y - py); if (dd < d) { d = dd; bus = x } })
      if (bus) { setBusWahl(bus); knopfTon(true); return }
      if (naechster) { setZugWahl(naechster); knopfTon(true); return }
      if (ampelGilt(f)) { neu(i, j, { ...f, ampel: f.ampel === 'rot' ? 'gruen' : 'rot' }, false); knopfTon(true); return }
      if (!istWeiche(f.gleis)) { setMeldung('Während der Fahrt lassen sich nur Weichen, Ampeln und Züge antippen. Zum Bauen anhalten.'); return }
      const wege = f.gleis!.art === 'dreiweg' ? 3 : 2
      neu(i, j, { ...f, gleis: { ...f.gleis!, stellung: (((f.gleis!.stellung ?? 0) + 1) % wege) as 0 | 1 | 2 } }, false)
      knopfTon(true)
      return
    }
    // mit der Maus ist das angeklickte Feld ausgewählt: Entf oder Rückschritt nimmt danach seinen obersten Inhalt weg (Michael, 2026-11-26)
    if (mausKlick.current) setAuswahl([i, j])
    bauen(i, j, werkzeug)
  }

  /** das Werkzeug w auf das Feld (i, j) anwenden, wie ein Tipp */
  function bauen(i: number, j: number, w: Werkzeug) {
    const f = brett[j][i]
    if (w.art === 'linie') return
    if (takt > 0 && uhrFeld(i, j)) { setMeldung('Hier steht die Uhr des Taktfahrplans. Ohne Takt (im Menü) kann man hier wieder bauen.'); return }
    setMeldung(null)
    if (w.art === 'name') {
      if (!istBahnhof(f.gleis)) { setMeldung('Tippe einen Bahnhof an, um ihm einen Namen zu geben.'); setNameFeld(null); return }
      setNameFeld([i, j]); setNameSuche('')
      return
    }
    if (fest?.has(`${i},${j}`) && !['name', 'zug', 'knoten', 'ampel', 'wagen', 'strom'].includes(w.art)) { setMeldung(FEST_TEXT); return }
    const unterGross = !!f.teil || grosseKurve(f.gleis) > 0
    // grosse Kurve: das angetippte Feld ist ihr Griff, das Eckfeld aussen; tippt man den Griff einer gleichen an, dreht sie sich im selben Block,
    // der Griff wandert in die nächste Ecke
    const nGross = w.art === 'gleis' ? grosseKurve({ art: w.gleis, dreh }) : 0
    if (nGross && w.art === 'gleis') {
      const [hi, hj] = f.teil ?? [i, j], alt = brett[hj][hi].gleis
      let b1 = brett, ai: number, aj: number, d = dreh
      if (unterGross) {
        const G = grossGeometrie(hi, hj, alt!)
        // seit 2026-11-25 auf jeder ihrer Kacheln im Uhrzeigersinn, ausser dort liegt etwas darüber (Michael: «Diese grossen Kurven soll man auf allen seiner
        // Kacheln im Uhrzeigersinn drehen können. Ausser auf einer Kachel steht etwas darüber»): Tunnel, Brücke oder ein Feld ohne Strom
        if (alt?.art !== w.gleis) {
          setMeldung('Das ist eine andere Kurve. Wähle unten dieselbe Kurve, um sie zu drehen, oder «Entfernen».'); return
        }
        if (f.grund === 'berg' || f.bruecke || f.ohneStrom) {
          setMeldung('Auf dieser Kachel liegt etwas darüber. Tippe eine andere Kachel der Kurve an, um sie zu drehen.'); return
        }
        const ox = Math.min(...G.zellen.map(([u]) => u)), oy = Math.min(...G.zellen.map(([, v]) => v))
        d = ((alt.dreh + 1) % 4) as Dreh
        b1 = grosseEntfernen(brett, i, j);
        [ai, aj] = grossAnfang(ox, oy, nGross, d)
      } else [ai, aj] = anfangZumGriff(i, j, nGross, d)
      const b2 = grosseLegen(b1, ai, aj, { art: w.gleis, dreh: d })
      if (!b2) { setMeldung(`Die Kurve braucht ${nGross} × ${nGross} Felder, vom angetippten Feld aus in die Richtung des Bilds auf dem Knopf, ohne andere Gleise darin. Ein zweiter Tipp auf das Werkzeug unten dreht sie.`); return }
      setDreh(d); setBrett(b2); knopfTon(true)
      return
    }
    // ein anderes Gleis oder «Entfernen» auf einer grossen Kurve nimmt sie weg; Landschaft, Tunnel und Brücke ändern nur den Grund
    if (unterGross && (w.art === 'gleis' || w.art === 'weg')) {
      const b1 = grosseEntfernen(brett, i, j)
      if (w.art === 'weg') { setBrett(b1); knopfTon(true); return }
      setBrett(b1.map((z, jj) => (jj === j ? z.map((x, ii) => (ii === i ? { grund: x.grund, gleis: { art: w.gleis, dreh } } : x)) : z)))
      knopfTon(true)
      return
    }
    // eine Wiese auf dem Griff löscht die Kurve
    if (unterGross && w.art === 'grund' && w.grund === 'wiese') {
      const [hi, hj] = f.teil ?? [i, j], G = grossGeometrie(hi, hj, brett[hj][hi].gleis!)
      if (G.griff[0] === i && G.griff[1] === j) {
        const b1 = grosseEntfernen(brett, i, j)
        setBrett(b1.map((z, jj) => (jj === j ? z.map((x, ii) => (ii === i ? { grund: 'wiese' as Grund } : x)) : z))); knopfTon(true)
        return
      }
    }
    if (unterGross) {
      if (w.art === 'bruecke') { neu(i, j, { ...f, bruecke: true }); knopfTon(true); return }
      if (w.art === 'strom') { if (f.ohneStrom) { const { ohneStrom: _, ...o } = f; neu(i, j, o) } else neu(i, j, { ...f, ohneStrom: true }); knopfTon(true); return }
      // auf einer grossen Kurve setzt nur Boden und Tunnel etwas, alles andere geht dort nicht (vorher wurde daraus Berg)
      if (w.art !== 'grund' && w.art !== 'tunnel') { setMeldung('Auf einer grossen Kurve geht das nicht.'); return }
      const grund: Grund = w.art === 'grund' ? w.grund : 'berg'
      neu(i, j, { ...f, grund }); knopfTon(true)
      return
    }
    if (w.art === 'ampel') {
      // eine Ampel an einer Geraden, Kurve oder einem Bahnhof; nochmals tippen wechselt Rot und Grün, «Entfernen» nimmt sie weg
      if (!f.gleis || !['gerade', 'kurve', 'bahnhof', 'kurvenbahnhof'].includes(f.gleis.art)) { setMeldung('Eine Ampel steht an einer Geraden, einer Kurve oder einem Bahnhof.'); return }
      if (f.grund === 'berg') { setMeldung('Im Tunnel sieht man keine Ampel. Stell sie davor.'); return }
      neu(i, j, { ...f, ampel: f.ampel === 'rot' ? 'gruen' : 'rot' }); knopfTon(true)
      return
    }
    if (w.art === 'strom') {
      // ein Gleis ohne Fahrleitung; nochmals tippen elektrifiziert es wieder
      if (!f.gleis && !f.teil) { setMeldung('«Ohne Strom» gilt für ein Gleis.'); return }
      if (f.ohneStrom) { const { ohneStrom: _, ...ohne } = f; neu(i, j, ohne); knopfTon(false); return }
      neu(i, j, { ...f, ohneStrom: true }); knopfTon(true)
      return
    }
    if (w.art === 'hang') {
      // Gelände: jeder Tipp eine Stufe weiter, Hang in acht Richtungen, Hügel, Mulde, dann wieder flach (gewählt)
      const neuH = f.hang === undefined ? 0 : f.hang >= 9 ? undefined : f.hang + 1
      const { hang: _, ...ohne } = f
      neu(i, j, neuH === undefined ? ohne : { ...ohne, hang: neuH }); knopfTon(neuH !== undefined)
      setMeldung(neuH === undefined ? 'Wieder flach.' : `${GELAENDE_NAMEN[neuH]}. Nochmals tippen für die nächste Form.`)
      return
    }
    if (w.art === 'knoten') {
      // ein Bahnhof als Knoten im Taktfahrplan; nochmals tippen macht ihn wieder zum gewöhnlichen Bahnhof
      if (!istBahnhof(f.gleis)) { setMeldung('Knoten kann nur ein Bahnhof sein.'); return }
      const g = bahnhofGruppen(brett), mein = g.get(`${i},${j}`)
      if (mein && knotenSet.has(mein)) {
        setBrett(brett.map((z, jj) => z.map((x, ii) => { if (g.get(`${ii},${jj}`) !== mein || !x.knoten) return x; const { knoten: _, ...o } = x; return o })))
        knopfTon(false); return
      }
      neu(i, j, { ...f, knoten: true }); knopfTon(true)
      return
    }
    if (w.art === 'fluss') {
      // ein Fluss durch das Feld, nochmals tippen nimmt ihn weg; ein Gleis darüber wird zur Brücke
      if (f.fluss) { const { fluss: _, ...ohne } = f; neu(i, j, ohne); knopfTon(false); return }
      if (f.grund === 'wasser' || f.grund === 'berg') { setMeldung('Ein Fluss fliesst über Land, nicht durch einen See oder Berg.'); return }
      if (f.strasse && f.gleis) { setMeldung('Auf einem Bahnübergang hat der Fluss keinen Platz.'); return }
      neu(i, j, { ...f, fluss: true }); knopfTon(true)
      return
    }
    if (w.art === 'zug' && auftrag) {
      // im Bahnbetrieb: der eben zusammengestellte Zug kommt hierhin; sonst das Blatt für dieses Feld
      if (!zugStartGilt(f)) { setMeldung('Ein Zug steht auf einem einfachen Gleisstück, nicht auf einer grossen Kurve oder leerem Feld.'); return }
      if (zugWartet && !f.zugStart) {
        const z = zugWartet
        setBetrieb((b) => ({ ...b, zuege: { ...b.zuege, [auftrag.id]: { ...(b.zuege[auftrag.id] ?? {}), [`${i},${j}`]: z } } }))
        neu(i, j, { ...f, zugStart: z.wagen.every((x) => x === 'person') ? 'p' : 'g' }); setZugWartet(null); setMeldung(null); knopfTon(true)
        return
      }
      setZugWahlFeld([i, j]); knopfTon(true)
      return
    }
    // ein gesetzter Zug im Bahnbetrieb: ein Tipp öffnet sein Blatt, mit jedem Werkzeug ausser «Entfernen»
    if (auftrag && f.zugStart && w.art !== 'weg') { setZugWahlFeld([i, j]); knopfTon(true); return }
    if (w.art === 'zug') {
      // ein Personen- oder Güterzug, der hier vor der Fahrt steht; nochmals tippen nimmt ihn weg, der andere ersetzt ihn
      if (f.zugStart === w.zug) { const { zugStart: _, ...ohne } = f; neu(i, j, ohne); knopfTon(false); return }
      if (!zugStartGilt(f)) { setMeldung('Ein Zug steht auf einem einfachen Gleisstück, nicht auf einer grossen Kurve oder leerem Feld.'); return }
      neu(i, j, { ...f, zugStart: w.zug }); knopfTon(true)
      setMeldung(w.zug === 'g' ? 'Der Güterzug hält nur am Güterschuppen (unter Bauwerke «Güter») und fährt an Bahnhöfen durch.' : 'Der Personenzug hält an den Bahnhöfen.')
      return
    }
    if (w.art === 'wagen') {
      // ein abgestellter Wagen; nochmals tippen nimmt ihn weg
      if (f.wagen) { const { wagen: _, ...ohne } = f; neu(i, j, ohne); knopfTon(false); return }
      if (!wagenGilt(f)) { setMeldung('Ein Wagen steht auf einer Geraden, einem Bahnhof oder vor einem Prellbock.'); return }
      neu(i, j, { ...f, wagen: true }); knopfTon(true)
      return
    }
    if (w.art === 'objekt') {
      // Kirche oder Bauernhof allein im Feld; nochmals tippen nimmt es weg
      if (f.gleis) { setMeldung('Auf einem Feld mit Gleis hat das keinen Platz.'); return }
      if (f.objekt === w.objekt) { const { objekt: _, ...ohne } = f; neu(i, j, ohne); knopfTon(false); return }
      neu(i, j, { ...f, objekt: w.objekt }); knopfTon(true)
      return
    }
    if (w.art === 'bau') {
      // Depot auf einem Prellbock, Güterschuppen und Galerie an einer Geraden; nochmals tippen dreht
      const art = w.bau === 'depot' ? 'prellbock' : 'gerade'
      if (f.bau === w.bau && f.gleis?.art === art) {
        const d = ((f.gleis.dreh + 1) % 4) as Dreh
        setDreh(d); neu(i, j, { ...f, gleis: { ...f.gleis, dreh: d } }); knopfTon(true)
        return
      }
      const { ampel: _a, objekt: _o, ...ohne } = ohneStrasse(f)
      neu(i, j, { ...ohne, bau: w.bau, gleis: f.gleis?.art === art ? f.gleis : { art, dreh } }); knopfTon(true)
      return
    }
    if (w.art === 'haltestelle' || w.art === 'wende' || w.art === 'strbruecke' || w.art === 'strtunnel') { strassenWerkzeug(i, j, f, w.art); return }
    if (w.art === 'strasse') {
      if (f.strasse) { neu(i, j, ohneStrasse(f)); knopfTon(false); return }
      const nein = strasseMoeglich(f)
      if (nein) { setMeldung(nein); return }
      // ein getipptes Feld schliesst an Strassenenden daneben an, nicht an durchgehende Strassen (sonst entstünde wieder ein Gitter)
      const b1 = brett.map((z) => z.map((x) => ({ ...x })))
      b1[j][i] = { ...f, strasse: true, strKanten: 0 }
      for (let d = 0; d < 4; d++) {
        const u = i + DXY[0][d], v = j + DXY[1][d], n = b1[v]?.[u]
        if (n?.strasse && !n.gleis && !n.teil && strassenNachbarn(brett, u, v).length <= 1) strasseVerbinden(b1, i, j, d)
      }
      setBrett(b1); knopfTon(true)
      return
    }
    let n: Feld = f
    if (w.art === 'gleis' && w.gleis === 'bahnhof' && (f.gleis?.art === 'kurve' || f.gleis?.art === 'gerade')) {
      // auf eine Kurve gelegt wird der Bahnhof zum Bahnhof in der Kurve, auf eine Gerade zum geraden, die Lage bleibt
      n = { ...f, gleis: { art: f.gleis.art === 'kurve' ? 'kurvenbahnhof' : 'bahnhof', dreh: f.gleis.dreh } }
    } else if (w.art === 'gleis' && w.gleis === 'bahnhof' && istBahnhof(f.gleis)) {
      const d = ((f.gleis!.dreh + 1) % 4) as Dreh
      setDreh(d); n = { ...f, gleis: { ...f.gleis!, dreh: d } }
    } else if (w.art === 'gleis') {
      if (f.gleis?.art === w.gleis) {
        // die Doppelkurve hat nur zwei Lagen
        const d = ((f.gleis.dreh + 1) % (w.gleis === 'doppelkurve' || w.gleis === 'ueberfuehrung' ? 2 : 4)) as Dreh
        setDreh(d); n = { ...f, gleis: { ...f.gleis, dreh: d } }
      } else n = { ...f, gleis: { art: w.gleis, dreh } }
    } else if (w.art === 'bruecke') {
      // eine Brücke ohne Wasser darunter; den See setzt man selbst dazu
      if (f.bruecke && f.gleis) {
        const d = ((f.gleis.dreh + 1) % 4) as Dreh
        setDreh(d); n = { ...f, gleis: { ...f.gleis, dreh: d } }
      } else {
        // eine Strasse darunter bleibt als Unterführung, wenn das geht
        const m: Feld = { ...f, bruecke: true, gleis: f.gleis ?? { art: 'gerade', dreh } }
        n = m.strasse && strasseMoeglich(m) ? ohneStrasse(m) : m
      }
    } else if (w.art === 'tunnel') {
      if (f.grund === 'berg' && f.gleis) {
        const d = ((f.gleis.dreh + 1) % 4) as Dreh
        setDreh(d); n = { ...f, gleis: { ...f.gleis, dreh: d } }
      } else n = { grund: 'berg', gleis: f.gleis ?? { art: 'gerade', dreh } }
    } else if (w.art === 'grund') { n = { ...f, grund: w.grund }; if (w.grund === 'wasser' || w.grund === 'berg') delete n.fluss }
    // Entfernen: zuerst das Gleis (die Strasse bleibt), dann die Strasse, dann der Grund
    // Entfernen: zuerst die Ampel, dann das Gleis (samt Brücke; die Strasse bleibt), dann die Strasse, dann der Grund
    else if (f.ampel) { const { ampel: _, ...ohne } = f; n = ohne }
    else if (f.objekt) { const { objekt: _, ...ohne } = f; n = ohne }
    else if (f.hang !== undefined) { const { hang: _, ...ohne } = f; n = ohne }
    else if (f.bau) { const { bau: _, ...ohne } = f; n = ohne }
    else if (f.zugStart) { const { zugStart: _, ...ohne } = f; n = ohne }
    else if (f.wagen) { const { wagen: _, ...ohne } = f; n = ohne }
    else if (f.strasse && (f.haltestelle || f.wende || f.strBruecke)) { const { haltestelle: _h, wende: _w, strBruecke: _b, ...ohne } = f; n = ohne }
    // das Gleis weg, Strasse und Fluss bleiben; dann die Strasse, dann der Fluss, dann der Grund
    else n = f.gleis ? { grund: f.grund, ...(f.strasse ? { strasse: true as const } : {}), ...(f.fluss ? { fluss: true as const } : {}) }
      : f.strasse ? { grund: f.grund, ...(f.fluss ? { fluss: true as const } : {}) } : f.fluss ? { grund: f.grund } : { grund: 'wiese' }
    // eine Strasse bleibt nur, wo sie noch möglich ist (nicht auf Wasser, Berg oder unter einer Kurve)
    if (n.strasse && strasseMoeglich(n)) n = ohneStrasse(n)
    neu(i, j, n)
    knopfTon(true)
  }

  /** Haltestelle, Wendeplatz, Strassenbrücke und Strassentunnel; wo noch keine Strasse liegt, kommt sie dazu. Nochmals tippen nimmt es weg */
  function strassenWerkzeug(i: number, j: number, f: Feld, art: 'haltestelle' | 'wende' | 'strbruecke' | 'strtunnel') {
    if (art === 'strtunnel') {
      if (f.gleis) { setMeldung('Hier liegt ein Gleis. Der Strassentunnel braucht ein Feld ohne Gleis.'); return }
      if (f.grund === 'berg' && f.strasse) { neu(i, j, { ...ohneStrasse(f), grund: 'wiese' }); knopfTon(false); return }
      const { fluss: _f, objekt: _o, hang: _h, ...o } = f
      neu(i, j, { ...o, grund: 'berg', strasse: true }); knopfTon(true)
      return
    }
    if (art === 'strbruecke') {
      if (f.strasse && f.strBruecke) { const { strBruecke: _, ...o } = f; neu(i, j, o); knopfTon(false); return }
      if (f.grund === 'berg') { setMeldung('Im Berg führt die Strasse durch einen Tunnel, nicht über eine Brücke.'); return }
      const nein = strasseMoeglich(f)
      if (nein) { setMeldung(f.gleis ? 'Eine Strassenbrücke führt über eine Gerade.' : nein); return }
      const { wende: _w, haltestelle: _h, ...o } = f
      neu(i, j, { ...o, strasse: true, strBruecke: true }); knopfTon(true)
      if (f.gleis) setMeldung('Die Strasse führt über das Gleis, ohne Bahnübergang.')
      return
    }
    if (f.gleis) { setMeldung(art === 'haltestelle' ? 'Eine Haltestelle steht an einer Strasse ohne Gleis.' : 'Ein Wendeplatz liegt an einer Strasse ohne Gleis.'); return }
    if (f.grund === 'berg') { setMeldung('Im Tunnel geht das nicht.'); return }
    if (art === 'haltestelle') {
      if (f.strasse && f.haltestelle) { const { haltestelle: _, ...o } = f; neu(i, j, o); knopfTon(false); return }
      const nf: Feld = { ...f, strasse: true, haltestelle: true }
      delete nf.wende
      const b = brett.map((z, jj) => (jj === j ? z.map((x, ii) => (ii === i ? nf : x)) : z))
      if (!strasseGerade(b, i, j)) { setMeldung('Eine Haltestelle steht an einer geraden Strasse, nicht in einer Kurve oder Kreuzung.'); return }
      neu(i, j, nf); knopfTon(true)
      return
    }
    if (f.strasse && f.wende) { const { wende: _, ...o } = f; neu(i, j, o); knopfTon(false); return }
    const nf: Feld = { ...f, strasse: true, wende: true }
    delete nf.haltestelle
    neu(i, j, nf); knopfTon(true)
  }

  function neu(i: number, j: number, f: Feld, merken = true) {
    const vorgabe = festGrund?.get(`${i},${j}`)
    if (vorgabe && !landschaftGleich(vorgabe, f)) { setMeldung(LANDSCHAFT_FEST); return }
    setBrett(brett.map((z, jj) => (jj === j ? z.map((x, ii) => (ii === i ? f : x)) : z)), merken)
  }

  function fahren() {
    if (faehrt) { setFaehrt(false); setWagen([]); zuege.current = []; busse.current = []; setBusLagen([]); fgRef.current = null; setFahrgaeste(null); wagenZurueck(); return }
    if (uhrBelegt) { setMeldung('Zuerst entscheiden: oben links Platz für die Uhr machen oder den Takt ausschalten.'); return }
    // gesetzte Züge (Werkzeuge «Personenzug» und «Güterzug») fahren genau so; sonst wie bisher Personenzüge nach «Anzahl Züge»
    const starts = brett.flatMap((zz, j) => zz.flatMap((f, i) => (f.zugStart && zugStartGilt(f) ? [[i, j, f.zugStart] as const] : [])))
    const zs = auftrag ? betrieb.zuege[auftrag.id] ?? {} : {}
    const gesetzt = starts.map(([i, j, a]) => {
      // im Bahnbetrieb der zusammengestellte Zug aus dem Depot
      const z0 = zs[`${i},${j}`]
      if (auftrag) return z0 ? Zug.zusammengestellt(brett, i, j, { typ: z0.lok, diesel: LOKS[z0.lok].diesel, tempo: LOKS[z0.lok].tempo }, z0.wagen) : null
      return Zug.setzenBei(brett, i, j, a === 'g' ? 'gueter' : 'person', wagenZahl)
    }).filter((x): x is Zug => !!x)
    lauf.current++
    const z = starts.length ? gesetzt[0] ?? null : Zug.setzen(brett, undefined, wagenZahl)
    // Busse fahren auch ohne Zug, wenn es Strassen gibt
    const neueBusse = Bus.setzen(brett)
    if (!z && !neueBusse.length) { setMeldung(brett.some((zz) => zz.some((f) => f.strasse)) ? 'Für den Bus braucht es eine Strasse über mindestens zwei Felder.' : 'Leg zuerst ein Gleis, am besten mit einem Bahnhof.'); return }
    const l = starts.length ? gesetzt : z ? [z] : []
    // in Aufgaben ohne gesetzte Züge immer nur einer (Michael, 2026-11-26: «Warum fahren hier zwei Züge?», dann «Ja gerne so machen»); «Anzahl Züge» gilt beim freien Bauen
    const zahlZuege = aufgabe ? 1 : zugZahl
    while (!starts.length && z && l.length < zahlZuege) {
      const belegt = new Set(l.flatMap((x) => [...x.belegt()]))
      const z2 = Zug.setzen(brett, belegt, wagenZahl)
      if (!z2) break
      l.push(z2)
    }
    if (!starts.length && z && l.length < zahlZuege) setMeldung(`Für ${zugZahl} Züge ist das Netz zu klein, es fahren ${l.length === 1 ? 'einer' : l.length}. Jeder braucht Platz weit weg von den anderen.`)
    else setMeldung(null)
    const bahnhoefe = [...new Set(bahnhofNamen(brett).values())]
    // in einer Aufgabe mit Fahrgästen immer mit Fahrgästen
    const mitFg = mitFahrgaesten || !!aufgabe?.transport?.fahrgaeste
    const fg = mitFg && l.some((x) => x.art !== 'gueter') ? fahrgaesteStart(bahnhoefe, l.length) : null
    if (mitFg && l.some((x) => x.art !== 'gueter') && !fg) setMeldung('Für Fahrgäste braucht es mindestens zwei Bahnhöfe.')
    fgRef.current = fg; setFahrgaeste(fg ? { ...fg } : null); halteRef.current = []
    // Ladungen für die Güterzüge
    const schuppen = brett.flatMap((zz, j) => zz.flatMap((f, i) => (gueterGilt(f) ? [`${i},${j}`] : [])))
    // im Bahnbetrieb nur die Routen des Auftrags, von Anlage zu Anlage
    const anlageFeld = (n: string) => schuppen.find((k) => { const [i, j] = k.split(',').map(Number); return brett[j][i].anlage === n })
    const routen = auftrag ? auftrag.routen.flatMap((r) => { const von = anlageFeld(r.von), nach = anlageFeld(r.nach); return von && nach ? [{ von, nach, gut: r.gut }] : [] }) : null
    const gut = l.some((x) => x.art !== 'person') ? gueterStart(schuppen, routen) : null
    if (l.some((x) => x.art !== 'person') && !gut) setMeldung('Für Ladungen braucht der Güterzug mindestens zwei Güterschuppen (unter Bauwerke «Güter»).')
    gutRef.current = gut; gutHalte.current = new Map(); setLadungen(gut ? { ...gut.warten } : null)
    setStand({ fahrgaeste: 0, gueter: 0 })
    fahrtStart.current = brett
    // im Taktfahrplan: an Knoten bis zur nächsten Taktzeit warten; treffen sich Züge zur selben Abfahrt, ist das ein Anschluss
    spielSek.current = 0
    const abfahrten = new Map<string, number[]>()
    for (const z of l) z.taktWarten = (feld) => {
      if (!takt) return 0
      const b = brettRef.current, g = bahnhofGruppen(b).get(feld)
      if (!g || !knotenGruppen(b).has(g)) return 0
      const jetzt = spielSek.current, ab = Math.ceil((jetzt + HALT_S) / takt) * takt
      const nr = zuege.current.indexOf(z) + 1, name = bahnhofTitel(b).get(g) ?? g, wer = zuege.current.length > 1 ? `Zug ${nr}` : 'Der Zug'
      const schon = abfahrten.get(`${g}@${ab}`) ?? []
      abfahrten.set(`${g}@${ab}`, [...schon, nr])
      if (schon.length) { setMeldung(`Anschluss in ${name} um ${uhrText(ab)}: ${[...schon, nr].map((x) => `Zug ${x}`).join(' und ')}`); antwortTon('richtig') }
      else setMeldung(`${wer} in ${name} an ${uhrText(jetzt)}, ab ${uhrText(ab)}`)
      return ab - jetzt
    }
    busse.current = neueBusse; busZugHalte.current = []; zugHalteJe.current = new Map(); busNetz.current = null; setBusLagen(neueBusse.map((x) => x.lage(brett)))
    zuege.current = l; pfiffe.current = []; dorf.current = false; setWagen(l.map((x) => x.wagen())); setFaehrt(true)
  }

  // ohne Rand (Michael, 2026-11-24: «Die dünne, graue Umrandung bei den einzelnen Elementen braucht es nicht»), eine Zeile Text
  const knopf = (an: boolean) => `flex w-[4.25rem] flex-none flex-col items-center gap-0.5 whitespace-nowrap rounded-lg px-1 py-1 text-[11px] font-medium leading-tight ${an
    ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
    : 'bg-white hover:bg-sbb-milk dark:bg-sbb-midnight dark:hover:bg-sbb-iron'}`
  const rund = 'flex size-11 flex-none items-center justify-center rounded-full border border-sbb-cloud bg-white text-lg font-bold shadow-sm hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white'
  const imBrett = ansicht === 'brett' || ((ansicht === 'aufgaben' || ansicht === 'betrieb') && !!aufgabe)
  const naechste = aufgabe && !(aufgabe as { betrieb?: Auftrag }).betrieb ? AUFGABEN[AUFGABEN.indexOf(aufgabe) + 1] : undefined
  // im Bahnbetrieb nur Gleise und Züge, die Ampel bei den Zügen (Michael, 2026-11-26: «Bei den Aufgaben «Bahnbetrieb» braucht man zur Auswahl eigentlich nur
  // Gleise, Züge und sonst nichts»); Bahnhöfe und Schuppen gibt der Auftrag vor, Tunnel und Brücken entstehen mit «Linie» von selbst
  const gruppen = auftrag ? [{ titel: 'Gleise', l: [...GRUPPEN[0].l, ...GRUPPEN[2].l.filter((x) => x.w.art === 'ampel')] }] : GRUPPEN
  useEffect(() => { if (!gruppen.some((g) => g.titel === reiter)) setReiter(gruppen[0].titel) }, [gruppen, reiter])
  // im Tutorial der jetzige Hinweis: der erste, der noch nicht erledigt ist; sein Werkzeug und seine Felder leuchten
  const werkzeugName = GRUPPEN.flatMap((g) => g.l).find((x) => gleich(x.w, werkzeug))?.text ?? ''
  const fuehrungNr = aufgabe?.fuehrung && !ergebnis?.ok
    ? aufgabe.fuehrung.findIndex((f) => !(f.fertig?.({ b: brett, stand, werkzeug: werkzeugName, faehrt }) ?? false)) : -1
  const hinweis = fuehrungNr >= 0 ? aufgabe!.fuehrung![fuehrungNr] : null
  const hinweisReiter = hinweis?.werkzeug && werkzeugName !== hinweis.werkzeug ? GRUPPEN.find((g) => g.l.some((x) => x.text === hinweis.werkzeug))?.titel : undefined
  const LEUCHTEN = 'ring-2 ring-sbb-red ring-offset-1 animate-pulse'
  const leerenKnopf = (
    <button type="button" disabled={faehrt} onClick={() => {
      if (!leerenScharf) { setLeerenScharf(true); return }
      setLeerenScharf(false); setBrett(leer(SP, ZE)); setMenu(false)
    }} className={`min-h-11 rounded-lg border px-4 font-bold disabled:opacity-40 ${leerenScharf
      ? 'border-sbb-red bg-sbb-red text-white' : 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight'}`}>
      {leerenScharf ? 'Wirklich leeren?' : 'Leeren'}
    </button>
  )
  const schalter = (an: boolean, um: () => void, text: string) => (
    <button type="button" role="switch" aria-checked={an} disabled={faehrt} onClick={um}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-1 text-left font-medium disabled:opacity-40">
      {text}
      <span className={`relative h-7 w-12 flex-none rounded-full transition-colors ${an ? 'bg-sbb-anthracite dark:bg-sbb-white' : 'bg-sbb-cloud dark:bg-sbb-iron'}`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all dark:bg-sbb-midnight ${an ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )

  return (
    <div className="px-4 pb-6">
      <MusterDefs />
      <GelaendeVerlaeufe />
      {!imBrett && (
        <>
          {ansicht === 'liste'
            ? <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
            : <Zurueck onClick={() => { window.location.hash = '#/gleisbau' }} text="Gleisbau" />}
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{ansicht === 'aufgaben' ? 'Gleisbau: Tutorial' : ansicht === 'betrieb' ? 'Gleisbau: Bahnbetrieb' : ansicht === 'frei' ? 'Gleisbau: Freies Feld' : 'Gleisbau'}</h1>
          {/* zuerst die Wahl, wie man spielt (Michael, 2026-11-26: «Als Einstieg soll ausgewählt werden können, wie gespielt werden kann. Freies Feld mit allen
              Werkzeugen und Zügen. Dann der Bahnbetrieb … und ein Bereich Tutorial, der erklärt Schritt für Schritt, interaktiv»; das Tutorial beim ersten Mal zuoberst empfohlen) */}
          {ansicht === 'liste' && (
            <SpielWahl sterne={Object.values(fortschritt).reduce((a, c) => a + c, 0)} sterneMax={AUFGABEN.length * 3} geld={betrieb.geld} bretter={bretter.length}
                       neuHier={!Object.keys(fortschritt).length} />
          )}
          {ansicht === 'frei' && (
            <p className="mt-2 max-w-3xl leading-relaxed">Ein leeres Brett mit allen Werkzeugen und Zügen: baue, was dir gefällt, und lass fahren.</p>
          )}
          {ansicht === 'frei' && <Klappe titel="So geht's" className="mt-2 max-w-3xl"><SoGehts /></Klappe>}
          {ansicht === 'frei' && (
            <GleisbauBretter bretter={bretter} setBretter={setBretter} neu={neuesBrett} oeffnen={(id) => { window.location.hash = `#/gleisbau?id=${id}` }} />
          )}
          {ansicht === 'betrieb' && <BetriebSeite betrieb={betrieb} setBetrieb={setBetrieb} oeffnen={(a) => { window.location.hash = `#/gleisbau?auftrag=${encodeURIComponent(a.id)}` }} />}
          {ansicht === 'aufgaben' && <AufgabenListe fortschritt={fortschritt} waehlen={(a) => { window.location.hash = `#/gleisbau?aufgabe=${encodeURIComponent(a.id)}` }} />}
          <p className={`mt-5 max-w-3xl ${LEISE}`}>
            Ein Baukasten, keine Wirklichkeit: Kacheln, Zug, Tempo und Halte sind gezeichnet und gewählt. Deine Bretter bleiben im Browser dieses
            Geräts und werden nicht gesendet, ausser du teilst einen Link.
          </p>
        </>
      )}
      {/* das Brett im ganzen Fenster wie ein Spiel (Michael, 2026-11-23: «Findest du dieses Design state of the art?», dann «Ja gerne, so umbauen»):
          oben eine schmale Leiste mit Zurück, Rückgängig, Drehen, Menü und Fahren, in der Mitte das Brett (zwei Finger zoomen und verschieben),
          unten die Werkzeuge in drei Reitern; Seltenes im Menü «⋯» */}
      {imBrett && (
        <div className="fixed inset-0 z-[60] flex select-none flex-col overflow-hidden overscroll-none bg-sbb-milk text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white"
             role="dialog" aria-label={aufgabe ? `Gleisbau, Aufgabe ${aufgabe.titel}` : `Gleisbau, ${bretter.find((x) => x.id === offen)?.name ?? 'Brett'}`}>
          {/* oben freier Raum, dann das Brett so hoch, wie es braucht, gleich darunter Aufgabe und Knöpfe */}
          <div className="flex-1" style={{ minHeight: 'calc(env(safe-area-inset-top) + 8px)' }} />
          <div ref={buehne} className="relative min-h-0 w-full shrink touch-none overflow-hidden" style={{ aspectRatio: `${SP + 0.3 + 0.4} / ${ZE + 0.3}` }}
               onPointerDown={buehneDrucken} onPointerMove={buehneBewegen} onPointerUp={buehneLos} onPointerCancel={buehneLos} onWheel={buehneRad}>
            <div className="absolute inset-0 px-2.5" style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`, transformOrigin: '0 0' }}>
        <svg ref={svg} viewBox={`-0.15 -0.15 ${SP + 0.3} ${ZE + 0.3}`} role="img" aria-label={`Spielbrett mit ${SP} × ${ZE} Feldern`}
             onClick={feldAn} onPointerDown={(e) => { mausKlick.current = e.pointerType === 'mouse'; drucken(e) }} onPointerMove={bewegen} onPointerUp={loslassen}
             onPointerCancel={() => { druck.current = null; setZiehen(null); linieRef.current = null; setLinie(null); malRef.current = null; malStart.current = null; setMalen(null) }} onContextMenu={(e) => e.preventDefault()}
             className={`size-full ${ueberEnde || verbinde ? 'cursor-crosshair' : 'cursor-pointer'} select-none [-webkit-touch-callout:none]`}>
          <rect x={-0.15} y={-0.15} width={SP + 0.3} height={ZE + 0.3} rx={0.14} fill={F.tablett} />
          {unten}
          {/* im Tunnel und unter einer Überführung ist ein Wagen unsichtbar (Michael, 2026-11-25: «Züge im Tunnel oder unter Brücken unsichtbar machen»),
              unter dem Dach von Depot und Galerie blass wie bisher */}
          {wagen.flatMap((l, z) => l.slice().reverse().map((w, k) => {
            const fi = Math.floor(w.x), fj = Math.floor(w.y), f = brett[fj]?.[fi]
            // auch unter einer Galerie unsichtbar (Michael, 2026-11-26: «Alles, was in einem Tunnel drin ist, muss unsichtbar sein»)
            // seit 2026-11-26 auch im Depot (Michael: «Im Depot soll der Zug auch unsichtbar sein»)
            if (imTunnel(brett, w.x, w.y) || unterBruecke(f, fi, fj, w) || (bauGilt(f) && (f!.bau === 'galerie' || f!.bau === 'depot'))) return null
            return <WagenBild key={`${z}-${k}`} nr={k + z * 7} w={w} tunnel={bauGilt(f) && f!.bau !== 'gueter'} farbe={zuege.current[z]?.art === 'gueter' ? GUETER_LOK : z ? ZUG_FARBEN[(z - 1) % ZUG_FARBEN.length] : F.karmin} />
          }))}
          {oben}
          {oberleitung}
          {strassenOben}
          {/* die Busse, im Strassentunnel unsichtbar */}
          {faehrt && busLagen.map((l, k) => (l.tunnel ? null : <BusBild key={`bus${k}`} x={l.x} y={l.y} w={l.w} farbe={BUS_FARBEN[(busse.current[k]?.nr ?? k) % BUS_FARBEN.length]} />))}
          <SchrankenBild brett={brett} wagen={wagen.flat()} />
          {/* abgestellte Wagen, längs zum Gleis */}
          {brett.flatMap((z, j) => z.map((f, i) => f.wagen && wagenGilt(f)
            ? <WagenBild key={`a${i},${j}`} w={{ x: i + 0.5, y: j + 0.5, w: f.gleis!.dreh % 2 ? 0 : Math.PI / 2, art: 1, vorne: false }} tunnel={false} /> : null))}
          <AmpelBild brett={brett} />
          <OhneStromBild brett={brett} />
          {/* beim Verbinden zweier roter Punkte: eine gestrichelte Linie zur Maus, der Zielpunkt hervorgehoben */}
          {verbinde && (() => {
            const z = endeBei(verbinde.x, verbinde.y, verbinde.von)
            return (
              <g pointerEvents="none">
                <line x1={verbinde.von.x} y1={verbinde.von.y} x2={z?.x ?? verbinde.x} y2={z?.y ?? verbinde.y} stroke={F.karmin} strokeWidth={0.06} strokeDasharray="0.15 0.1" strokeLinecap="round" />
                <circle cx={verbinde.von.x} cy={verbinde.von.y} r={0.16} fill="none" stroke={F.karmin} strokeWidth={0.05} />
                {z && <circle cx={z.x} cy={z.y} r={0.16} fill="none" stroke={F.karmin} strokeWidth={0.05} />}
              </g>
            )
          })()}
          {/* das mit der Maus gewählte Feld */}
          {auswahlDa && !faehrt && (
            <rect x={auswahlDa[0] + 0.02} y={auswahlDa[1] + 0.02} width={0.96} height={0.96} rx={0.1} fill="none" stroke={F.karmin} strokeWidth={0.05}
                  strokeDasharray="0.12 0.07" pointerEvents="none" />
          )}
          {/* die Felder, auf die der Hinweis des Tutorials zeigt */}
          {hinweis?.felder?.map(([i, j]) => (
            <rect key={`h${i},${j}`} x={i + 0.03} y={j + 0.03} width={0.94} height={0.94} rx={0.12} fill="none" stroke={F.karmin} strokeWidth={0.07}
                  className="animate-pulse" pointerEvents="none" />
          ))}
          <SchildBild namen={namen} titel={titel} knoten={knotenSet} takt={takt} mass={schildMass} />
          <AnlagenBild brett={brett} />
          {takt > 0 && !uhrBelegt && <UhrBild minuten={UHR_START_MIN + (faehrt ? spielSek.current : 0)} />}
          {fahrgaeste && <WartendeBild namen={namen} warten={fahrgaeste.warten} />}
          {faehrt && ladungen && <LadungenBild warten={ladungen} />}
          {/* vor der Fahrt die gesetzten Züge als Lok auf ihrem Feld */}
          {!faehrt && brett.flatMap((zz, j) => zz.map((f, i) => {
            if (!f.zugStart || !zugStartGilt(f)) return null
            const [a, c] = wege(f.gleis!)[0], p = wegPunkte({ i, j, ein: a, aus: c } as Stueck, 10)[5], q = wegPunkte({ i, j, ein: a, aus: c } as Stueck, 10)[6]
            return <WagenBild key={`zs${i},${j}`} w={{ x: p.x, y: p.y, w: Math.atan2(q.y - p.y, q.x - p.x), art: 0, vorne: true, gueter: f.zugStart === 'g' }} tunnel={false} farbe={f.zugStart === 'g' ? GUETER_LOK : F.karmin} />
          }))}
          {faehrt && wagen.length > 1 && <SignalBild brett={brett} belegt={zuege.current.map((z) => z.belegt())} />}
          {/* an der hinteren Seite vorgegebener Stücke statt des roten Punkts ein Prellbock (Michael, 2026-11-26: «Die vorgegebenen Gleise sind auf der
              hinteren Seite unverbunden und rot markiert das wirkt unvollständig», dann «Nur auf der Seite einen Prellbock wo eh nichts angebaut wird») */}
          {!faehrt && enden.map((e, k) => {
            const dx = [0, 1, 0, -1][e.k], dy = [-1, 0, 1, 0][e.k]
            const feld = `${Math.floor(e.x - dx * 0.1)},${Math.floor(e.y - dy * 0.1)}`
            if (hinten?.has(`${feld},${e.k}`)) {
              const cx = e.x - dx * 0.09, cy = e.y - dy * 0.09, quer = e.k % 2 === 0
              return (
                <g key={`e${k}`} pointerEvents="none">
                  <rect x={cx - (quer ? 0.16 : 0.035)} y={cy - (quer ? 0.035 : 0.16)} width={quer ? 0.32 : 0.07} height={quer ? 0.07 : 0.32} rx={0.015} fill="#c8202f" stroke="#3a3a3a" strokeWidth={0.012} />
                  <rect x={cx - (quer ? 0.05 : 0.036)} y={cy - (quer ? 0.036 : 0.05)} width={quer ? 0.1 : 0.072} height={quer ? 0.072 : 0.1} fill="#ffffff" />
                </g>
              )
            }
            return (
              <g key={`e${k}`} pointerEvents="none">
                <circle cx={e.x - dx * 0.06} cy={e.y - dy * 0.06} r={0.065} fill={F.karmin} stroke="#ffffff" strokeWidth={0.02} />
              </g>
            )
          })}
          {linie && (
            <path pointerEvents="none" d={linie.map(([i, j], k) => `${k ? 'L' : 'M'}${i + 0.5},${j + 0.5}`).join('')} fill="none" stroke={F.karmin}
                  strokeWidth={0.14} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
          )}
          {/* beim Malen die Felder, die gefüllt werden */}
          {malen && [...new Set(malen.map(([i, j]) => `${i},${j}`))].map((k) => {
            const [i, j] = k.split(',').map(Number)
            return <rect key={`m${k}`} x={i + 0.04} y={j + 0.04} width={0.92} height={0.9} rx={0.06} fill="rgba(168,16,46,.18)" stroke={F.karmin} strokeWidth={0.04} pointerEvents="none" />
          })}
          {ziehen && (() => {
            const [vi, vj] = ziehen.von, [ni, nj] = ziehen.nach, f = brett[vj][vi]
            const [hi, hj] = f.teil ?? [vi, vj], h = brett[hj][hi]
            const gross = grosseKurve(h.gleis)
            return (
              <g pointerEvents="none">
                <rect x={vi + 0.04} y={vj + 0.04} width={0.92} height={0.92} rx={0.05} fill="none" stroke={F.karmin} strokeWidth={0.04} strokeDasharray="0.08 0.06" />
                <g transform={`translate(${ni - vi} ${nj - vj})`} opacity={0.7}>
                  {gross ? <BogenBild i={hi} j={hj} g={h.gleis!} /> : <><GrundBild f={f} i={vi} j={vj} /><GleisBild f={f} i={vi} j={vj} /></>}
                </g>
                <rect x={ni + 0.02} y={nj + 0.02} width={0.96} height={0.96} rx={0.06} fill="none" stroke={F.karmin} strokeWidth={0.06} />
              </g>
            )
          })()}
          {/* eine feine Vignette innen am linken und rechten Rand des Bretts, 0,8 Felder breit (Michael, 2026-11-24: «An den beiden äussersten Rändern soll
              eine feine abdunkelnde Vignette sein», «Vignette muss innerhalb des Brettes sein»; Breite und Stärke gewählt) */}
          <defs>
            <linearGradient id="gb-vignette-l" x1={0} y1={0} x2={1} y2={0}><stop offset="0" stopColor="#000" stopOpacity={0.22} /><stop offset="1" stopColor="#000" stopOpacity={0} /></linearGradient>
            <linearGradient id="gb-vignette-r" x1={1} y1={0} x2={0} y2={0}><stop offset="0" stopColor="#000" stopOpacity={0.22} /><stop offset="1" stopColor="#000" stopOpacity={0} /></linearGradient>
          </defs>
          <rect x={0} y={0} width={Math.min(0.8, SP / 4)} height={ZE} fill="url(#gb-vignette-l)" pointerEvents="none" />
          <rect x={SP - Math.min(0.8, SP / 4)} y={0} width={Math.min(0.8, SP / 4)} height={ZE} fill="url(#gb-vignette-r)" pointerEvents="none" />
          {/* am dunklen Rand je Seite zwei Dreiecke: nach aussen eine Reihe dazu, nach innen eine weg (Michael, 2026-11-24) */}
          {!faehrt && !aufgabe && (() => {
            const k = buehneGr.w ? Math.min(buehneGr.w / (SP + 0.3), buehneGr.h / (ZE + 0.3)) : 40, u = 13 / (k * zoom.s)
            return [0, 1, 2, 3].map((seite) => {
              const ein = 0
              const cx = seite === 1 ? SP + 0.075 - ein : seite === 3 ? -0.075 + ein : SP / 2, cy = seite === 0 ? -0.075 + ein : seite === 2 ? ZE + 0.075 - ein : ZE / 2
              const aussen = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][seite], quer = seite % 2 ? [0, 1] : [1, 0]
              return [1, -1].map((d) => {
                const x = cx + quer[0] * d * -1.3 * u, y = cy + quer[1] * d * -1.3 * u, a = d > 0 ? aussen : aussen + Math.PI
                const p = (w: number, r: number) => `${x + Math.cos(a + w) * r},${y + Math.sin(a + w) * r}`
                const tun = () => {
                  const r = brettRand(brett, seite, d as 1 | -1)
                  if (!r) { setMeldung(`Breite ${MIN_SEITE} bis ${MAX_BREITE}, Höhe ${MIN_SEITE} bis ${MAX_HOEHE} Felder.`); return }
                  setBrett(r); knopfTon(d > 0); setMeldung(`${spalten(r)} × ${zeilen(r)} Felder`)
                }
                return (
                  <g key={`${seite}${d}`} role="button" aria-label={`${d > 0 ? 'Eine Reihe dazu' : 'Eine Reihe weg'} ${['oben', 'rechts', 'unten', 'links'][seite]}`}
                     className="cursor-pointer" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); tun() }}>
                    {/* nur ein helles Dreieck, beide gleich (Michael, 2026-11-24: «Nur helle gleichfarbige Dreiecke»); die Fläche darunter fängt den Tipp */}
                    <circle cx={x} cy={y} r={u} fill="transparent" />
                    <path d={`M${p(0, u * 0.75)} L${p(2.3, u * 0.75)} L${p(-2.3, u * 0.75)} Z`} fill="#e9e9e9" />
                  </g>
                )
              })
            })
          })()}
        </svg>
            </div>

            {/* grosse Bretter: Lupen und Verschieben unten rechts (Michael, 2026-11-24: «Sind so viele Kacheln dass man einzoomen muss braucht es ein
                Verschiebe Icon und Lupen zum ein und auszoomen»); gezeigt, sobald ein Feld kleiner als 28 Bildpunkte ist oder hineingezoomt ist (gewählt) */}
            {(zoom.s > 1.01 || (buehneGr.w > 0 && Math.min(buehneGr.w / (SP + 0.3), buehneGr.h / (ZE + 0.3)) < 28)) && (
              <div className="absolute bottom-3 right-2.5 flex flex-col gap-2">
                <button type="button" onClick={() => lupe(1.6)} disabled={zoom.s >= zoomMax - 0.01} aria-label="Hineinzoomen" title="Hineinzoomen" className={rund}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M7.5 10.5h6M10.5 7.5v6" /></svg>
                </button>
                <button type="button" onClick={() => lupe(1 / 1.6)} disabled={zoom.s <= 1.01} aria-label="Hinauszoomen" title="Hinauszoomen" className={rund}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M7.5 10.5h6" /></svg>
                </button>
                <button type="button" onClick={() => setSchiebeModus((v) => !v)} aria-pressed={schiebeModus} aria-label="Verschieben" title="Verschieben"
                        className={schiebeModus ? 'flex size-11 flex-none items-center justify-center rounded-full bg-sbb-anthracite text-white shadow-sm dark:bg-sbb-white dark:text-sbb-black' : rund}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>
                </button>
              </div>
            )}
            {zoom.s > 1.01 && (
              <button type="button" onClick={() => setZoom({ s: 1, x: 0, y: 0 })} aria-label="Ganzes Brett zeigen" title="Ganzes Brett zeigen"
                      className={`${rund} absolute right-2.5 top-2`}>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
              </button>
            )}
            {meldung && (
              <p role="status" className="pointer-events-none absolute inset-x-3 bottom-2 mx-auto max-w-md rounded-lg bg-sbb-charcoal/90 px-3 py-2 text-center text-sm font-medium text-white shadow-lg">{meldung}</p>
            )}
          </div>
          <div className="flex-none pt-2">
          {aufgabe && (
            <div className="mx-2.5 mb-2 flex flex-none items-start gap-3 rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-sbb-charcoal">
              <button type="button" onClick={() => setZielOffen((x) => !x)} aria-expanded={zielOffen}
                      className={`min-w-0 flex-1 text-left text-sm leading-snug ${zielOffen ? '' : 'line-clamp-2'}`}>{aufgabe.ziel}</button>
              <div className="flex flex-none flex-col items-end gap-1">
                <Sterne n={fortschritt[aufgabe.id] ?? 0} />
                <button type="button" onClick={() => { const e = bewerten(aufgabe, brett, stand); setErgebnis(e); setMeldung(e.ok ? null : e.text) }}
                        className="rounded-lg bg-sbb-red px-3 py-1 text-sm font-bold text-white hover:bg-sbb-red125">Prüfen</button>
              </div>
            </div>
          )}
          {/* der Hinweis des Tutorials */}
          {hinweis && (
            <div className="mx-2.5 mb-2 flex flex-none items-start gap-2 rounded-lg border-l-4 border-sbb-red bg-white px-3 py-2 text-sm leading-snug shadow-sm dark:bg-sbb-charcoal" role="status">
              <span className="flex-none rounded-lg bg-sbb-red px-1.5 text-xs font-bold leading-5 text-white tabular-nums">{fuehrungNr + 1}/{aufgabe!.fuehrung!.length}</span>
              <span>{hinweis.text}</span>
            </div>
          )}
          {/* die Schritte der Aufgabe sichtbar: Bahnhöfe der Reihe nach, dazwischen, was der Abschnitt braucht; erfüllt mit Haken */}
          {aufgabe?.schritte && (
            <div className="mx-2.5 mb-2 flex flex-none flex-wrap items-center gap-x-1 gap-y-1 text-[13px]" aria-label="Was die Aufgabe verlangt">
              {aufgabe.schritte(brett, stand).map((x, k) => x.art === 'bahnhof' ? (
                <span key={k} className={`rounded-lg px-2 py-0.5 font-bold ${x.ok ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black' : 'bg-white text-sbb-black dark:bg-sbb-charcoal dark:text-sbb-white'}`}>
                  {x.ok ? '✓ ' : ''}{x.text}
                </span>
              ) : (
                <span key={k} className={x.ok ? 'font-bold' : 'text-sbb-metal dark:text-sbb-storm'}>— {x.text}{x.ok ? ' ✓' : ''} —</span>
              ))}
            </div>
          )}
          </div>
          {/* die Knöpfe unter dem Brett und der Aufgabe (Michael, 2026-11-26: «Bitte alle Steuerelemente unterhalb des Brettes anbringen. Die Erklärung der
              Aufgabe oder Hinweistexte direkt unter dem Brett über die volle Breite») */}
          <div className="flex flex-none items-center gap-2 px-2.5 pb-2 pt-1"
               style={{ paddingLeft: 'calc(env(safe-area-inset-left) + 10px)', paddingRight: 'calc(env(safe-area-inset-right) + 10px)' }}>
            <button type="button" onClick={() => { window.location.hash = auftrag ? '#/gleisbau?betrieb' : aufgabe ? '#/gleisbau?aufgaben' : '#/gleisbau?frei' }} aria-label={auftrag ? 'Zurück zum Bahnbetrieb' : aufgabe ? 'Zurück zum Tutorial' : 'Zurück zu meinen Brettern'}
                    className={rund}><span className="pfeil pfeil-links" aria-hidden="true">←</span></button>
            <p className="min-w-0 flex-1 truncate font-bold">{aufgabe ? aufgabe.titel : bretter.find((x) => x.id === offen)?.name ?? 'Brett'}</p>
            {/* die Uhr des Taktfahrplans */}
            {/* die Uhr steht seit 2026-11-25 nur noch analog oben links im Brett (Michael: «Die alte Uhr weg») */}
            <button type="button" disabled={faehrt || !verlauf.length} onClick={zurueck} aria-label={`Rückgängig, noch ${verlauf.length} Schritte`} title="Rückgängig"
                    className={`${rund} relative`}>
              ↶{verlauf.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-sbb-anthracite px-1 text-[11px] font-bold leading-5 text-white tabular-nums dark:bg-sbb-white dark:text-sbb-black">{verlauf.length > 99 ? '99+' : verlauf.length}</span>}
            </button>
            {/* gedreht wird mit einem zweiten Tipp auf das gewählte Werkzeug (Michael, 2026-11-25: «Elemente müssen per tippen in der Elementebox gedreht werden
                können. Dafür braucht es oben den Drehpfeil nicht mehr») */}
            <button type="button" onClick={() => setMenu(true)} aria-label="Menü" title="Menü" className={rund}>⋯</button>
            {faehrt && (
              <button type="button" onClick={() => { setPause((x) => !x); knopfTon(true) }} aria-pressed={pause} aria-label={pause ? 'Weiter' : 'Pause'} title={pause ? 'Weiter' : 'Pause'} className={rund}>
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">{pause ? <path d="M8 5.5v13l11-6.5z" /> : <><rect x="6.5" y="5.5" width="4" height="13" rx="1" /><rect x="13.5" y="5.5" width="4" height="13" rx="1" /></>}</svg>
              </button>
            )}
            <button type="button" onClick={fahren} aria-label={faehrt ? 'Anhalten' : 'Fahren'} title={faehrt ? 'Anhalten' : 'Fahren'}
                    className="flex h-11 flex-none items-center gap-1.5 rounded-full bg-sbb-red px-4 font-bold text-white shadow-sm hover:bg-sbb-red125">
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">{faehrt ? <rect x="6" y="6" width="12" height="12" rx="1.5" /> : <path d="M8 5.5v13l11-6.5z" />}</svg>
              <span className="hidden sm:inline">{faehrt ? 'Anhalten' : 'Fahren'}</span>
            </button>
          </div>
          <div className="flex-none border-t border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-charcoal"
               style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
            {faehrt ? (
              <div className="flex min-h-[7.25rem] flex-col justify-center gap-1 px-3 py-2 text-sm">
                {fahrgaeste || ladungen ? (
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {fahrgaeste && <span className="font-bold">Fahrgäste am Ziel: <span className="tabular-nums">{fahrgaeste.gebracht}</span></span>}
                    {ladungen && <span className="font-bold">Ladungen geliefert: <span className="tabular-nums">{stand.gueter}</span></span>}
                    {zuege.current.map((z, k) => {
                      const name = zuege.current.length > 1 ? `Zug ${k + 1}` : 'Im Zug'
                      // ein Güterzug zeigt seine Ladungen als Kisten, ein Personenzug die Ziele seiner Fahrgäste
                      if (z.art === 'gueter') {
                        const n = gutRef.current?.imZug.get(z)?.length ?? 0
                        // dazu, wie viele Wagen beladen sind: eine Ladung füllt einen Güterwagen (Michael, 2026-11-26: «Was heisst eine Ladung im Güterverkehr?»)
                        return <span key={k} className="flex items-center gap-1">{name}: {n ? Array.from({ length: n }, (_, m) => <span key={m} className="inline-block size-3 rounded-sm border border-[#3a2a1a] bg-[#b8783f]" />) : null}
                          <span className="text-sbb-metal dark:text-sbb-storm">{n} von {z.ladeplaetze()} Güterwagen beladen</span></span>
                      }
                      const l = fahrgaeste?.imZug[k] ?? []
                      return <span key={k} className="flex items-center gap-1">{name}: {l.map((zz, m) => <Ziel key={m} z={zz} />)}
                        <span className="text-sbb-metal dark:text-sbb-storm">{l.length} von {z.plaetze(WAGEN_ARTEN.person.plaetze)} Plätzen</span></span>
                    })}
                  </p>
                ) : <p className="font-bold">{pause ? 'Pause.' : 'Der Zug fährt.'}</p>}
                <p className="text-sbb-metal dark:text-sbb-storm">{pause ? 'Pause: oben ▶ fährt weiter. ' : ''}Ein Tipp auf eine Weiche oder Ampel stellt sie, ein Tipp auf einen Zug zeigt Wagen und Richtung. Zum Bauen anhalten.{takt > 0 && !knotenSet.size ? ' Für den Takt fehlt ein Knoten: unter Bauwerke «Knoten» auf einen Bahnhof.' : ''}</p>
              </div>
            ) : (
              <>
                <div className="flex gap-0.5 overflow-x-auto px-2 pt-1.5 [scrollbar-width:none]" role="tablist" aria-label="Werkzeuge">
                  {/* im Bahnbetrieb ist «Züge» ein Knopf: er öffnet gleich das Zusammenstellen (Michael, 2026-11-26: «Klickt man auf Züge soll nicht das Element «Zug
                      einsetzen» sondern es soll direkt die Auswahl mit den Drag and Drop Ansicht kommen») */}
                  {auftrag && (
                    <button type="button" onClick={() => { setZugWahlFeld('neu'); knopfTon(true) }}
                            className="order-last shrink-0 rounded-lg px-1.5 py-1 text-[13px] font-bold text-sbb-metal sm:px-3 sm:text-sm dark:text-sbb-storm">Züge</button>
                  )}
                  {gruppen.map((g) => (
                    <button key={g.titel} type="button" role="tab" aria-selected={reiter === g.titel} onClick={() => setReiter(g.titel)}
                            className={`${hinweisReiter === g.titel && reiter !== g.titel ? LEUCHTEN : ''} shrink-0 rounded-lg px-1.5 py-1 text-[13px] font-bold sm:px-3 sm:text-sm ${reiter === g.titel ? 'bg-sbb-milk dark:bg-sbb-midnight' : 'text-sbb-metal dark:text-sbb-storm'}`}>{g.titel}</button>
                  ))}
                </div>
                <div className="flex gap-1.5 overflow-x-auto px-2 pb-1 pt-1.5 [scrollbar-width:none]">
                  {(gruppen.find((g) => g.titel === reiter) ?? gruppen[0]).l.filter(({ w }) => (takt > 0 || w.art !== 'knoten') && !(auftrag && ((w.art === 'zug' && w.zug === 'g') || w.art === 'wagen')))
                    .map(({ w, text }) => ({ w, text: auftrag && w.art === 'zug' ? 'Zug einsetzen' : text })).map(({ w, text }) => (
                    <button key={`${text}${JSON.stringify(w)}`} type="button" aria-pressed={gleich(w, werkzeug)} title={gleich(w, werkzeug) ? 'Nochmals tippen dreht' : undefined}
                            onClick={() => { if (gleich(w, werkzeug)) { setDreh(((dreh + 1) % 4) as Dreh); knopfTon(true) } else setWerkzeug(w) }}
                            className={`${knopf(gleich(w, werkzeug))} ${hinweis?.werkzeug === text && !gleich(w, werkzeug) ? LEUCHTEN : ''}`}>
                      <WerkzeugBild w={w} dreh={dreh} />
                      {text.length > 11 ? <span className="whitespace-normal text-center">{text}</span> : text}
                    </button>
                  ))}
                </div>
                {/* unter «Züge» in einem Satz, was ein Zug trägt und wie man ihn setzt (Michael, 2026-11-26: «Das Konzept mit dem Auswählen der richtigen Züge
                    mit Wagen muss klarer sein. Wieviele Personen passen in einen Personenwagen? Was heisst eine Ladung im Güterverkehr?») */}
                {reiter === 'Züge' && (
                  <p className="px-3 pb-1 text-xs leading-snug text-sbb-metal dark:text-sbb-storm">
                    {auftrag
                      ? `Tippe mit «Zug einsetzen» auf ein Gleis und wähle Lok und Wagen aus deinem Depot. Ein Personenwagen hat ${WAGEN_ARTEN.person.plaetze} Plätze, ein Güterwagen trägt 1 Ladung.`
                      : werkzeug.art === 'zug' && werkzeug.zug === 'g'
                        ? `Güterzug: Lok und ${wagenZahl - 1} Güterwagen. Jeder Wagen trägt 1 Ladung, zusammen ${wagenZahl - 1}. Er hält nur am Güterschuppen. Tippe auf ein Gleis.`
                        : werkzeug.art === 'wagen'
                          ? 'Ein einzelner Wagen zum Abstellen. Fährt ein Zug hinein, kuppelt er ihn an.'
                          : `Personenzug: Lok, ${wagenZahl - 1} Personenwagen (mit Steuerwagen) à ${WAGEN_ARTEN.person.plaetze} Plätze, zusammen ${(wagenZahl - 1) * WAGEN_ARTEN.person.plaetze} Fahrgäste. Er hält an Bahnhöfen. Tippe auf ein Gleis.`}
                  </p>
                )}
              </>
            )}
          </div>
          {/* ein angetippter Zug als Blatt von unten: Wagen, Richtung, Entfernen */}
          {zugWahl && faehrt && zuege.current.includes(zugWahl) && (() => {
            const k = zuege.current.indexOf(zugWahl), n = zugWahl.fahrzeuge()
            const zu = () => setZugWahl(null)
            const entfernen = () => {
              zuege.current.splice(k, 1); halteRef.current.splice(k, 1); pfiffe.current.splice(k, 1)
              const fg = fgRef.current
              if (fg) { fg.imZug.splice(k, 1); setFahrgaeste({ ...fg, warten: { ...fg.warten }, imZug: fg.imZug.map((l) => [...l]) }) }
              zu()
              if (!zuege.current.length && !busse.current.length) { setFaehrt(false); setWagen([]); fgRef.current = null; setFahrgaeste(null); wagenZurueck(); return }
              setWagen(zuege.current.map((x) => x.wagen()))
            }
            return (
              <div className="absolute inset-0 z-10 flex items-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) zu() }}>
                <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl dark:bg-sbb-charcoal" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-lg font-bold">
                      <span className="inline-block size-4 rounded-full" style={{ background: k ? ZUG_FARBEN[(k - 1) % ZUG_FARBEN.length] : F.karmin }} aria-hidden="true" />
                      {zuege.current.length > 1 ? `Zug ${k + 1}` : 'Zug'}
                    </p>
                    <button type="button" onClick={zu} aria-label="Schliessen" className={rund}>✕</button>
                  </div>
                  {zugWahl.stromlos && <p className="mt-2 text-sm font-bold text-sbb-red">Ohne Strom: Der Zug steht still. Ein Zug mit Diesellok kann ihn abschleppen.</p>}
                  {zugWahl.teile() === 1 && (
                    <div className="mt-2 flex min-h-12 items-center justify-between gap-3">
                      <span>Antrieb<span className="block text-xs text-sbb-metal">Strom braucht eine Fahrleitung, Diesel fährt überall</span></span>
                      <div className="segmente grid grid-cols-2">
                        {([[false, 'Strom'], [true, 'Diesel']] as const).map(([d, t]) => (
                          <button key={t} type="button" aria-pressed={zugWahl.diesel() === d}
                                  onClick={() => { zugWahl.antriebSetzen(brettRef.current, d); setWagen(zuege.current.map((x) => x.wagen())); knopfTon(true) }}
                                  className="segment px-3 py-2">{t}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {zugWahl.teile() === 1 && <div className="mt-2 flex min-h-12 items-center justify-between gap-3">
                    <span>Wagen<span className="block text-xs text-sbb-metal">zwischen Lok und Steuerwagen</span></span>
                    <span className="flex items-center gap-2">
                      <button type="button" aria-label="Ein Wagen weniger" disabled={n <= WAGEN_MIN} onClick={() => { zugWahl.fahrzeugeSetzen(brettRef.current, n - 1); setWagen(zuege.current.map((x) => x.wagen())); knopfTon(true) }} className={rund}>−</button>
                      <span className="w-6 text-center text-lg font-bold tabular-nums">{n - 2}</span>
                      <button type="button" aria-label="Ein Wagen mehr" disabled={n >= WAGEN_MAX} onClick={() => { zugWahl.fahrzeugeSetzen(brettRef.current, n + 1); setWagen(zuege.current.map((x) => x.wagen())); knopfTon(true) }} className={rund}>+</button>
                    </span>
                  </div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {zugWahl.teile() > 1 && (
                      <button type="button" onClick={() => {
                        // den abgeschleppten Zug hinten abkuppeln; er wird wieder ein eigener Zug
                        const t = zugWahl.abkuppeln(brettRef.current)
                        if (!t) return
                        zuege.current.push(t); halteRef.current.push(t.halte); pfiffe.current.push(t.pfiffe)
                        const fg = fgRef.current
                        if (fg) { fg.imZug.push([]); setFahrgaeste({ ...fg, warten: { ...fg.warten }, imZug: fg.imZug.map((l) => [...l]) }) }
                        setWagen(zuege.current.map((x) => x.wagen())); knopfTon(true); zu()
                        setMeldung(t.stromlos ? 'Abgekuppelt. Ohne Fahrleitung bleibt der Stromzug stehen.' : 'Abgekuppelt.')
                      }} className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight">Abkuppeln</button>
                    )}
                    <button type="button" disabled={zugWahl.stromlos} onClick={() => { zugWahl.wenden(); setWagen(zuege.current.map((x) => x.wagen())); knopfTon(true); zu() }}
                            className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">Fahrtrichtung ändern</button>
                    <button type="button" disabled={n <= WAGEN_MIN} onClick={() => {
                      // den hintersten Wagen dort stehen lassen, wo er ist
                      const [ei, ej] = zugWahl.ende(), f = brettRef.current[ej]?.[ei]
                      if (!wagenGilt(f) || f!.wagen) { setMeldung('Hier kann kein Wagen stehen: nur auf einer Geraden, einem Bahnhof oder vor einem Prellbock.'); zu(); return }
                      const b = brettRef.current.map((zz, jj) => (jj === ej ? zz.map((x, ii) => (ii === ei ? { ...x, wagen: true as const } : x)) : zz))
                      brettRef.current = b; setBrettRoh(b)
                      zugWahl.fahrzeugeSetzen(b, n - 1); setWagen(zuege.current.map((x) => x.wagen())); knopfTon(true); zu()
                    }} className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">Wagen abstellen</button>
                    <button type="button" onClick={entfernen}
                            className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold text-sbb-red hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight">Zug entfernen</button>
                  </div>
                </div>
              </div>
            )
          })()}
          {/* ein angetippter Bus als Blatt von unten: entfernen (Michael, 2026-11-25: «Busse können wie auch die Züge per Tippen entfernt werden») */}
          {busWahl && faehrt && busse.current.includes(busWahl) && (() => {
            const zu = () => setBusWahl(null)
            const entfernen = () => {
              const k = busse.current.indexOf(busWahl)
              busse.current.splice(k, 1); setBusLagen((l) => l.filter((_, m) => m !== k)); knopfTon(true); zu()
              if (!zuege.current.length && !busse.current.length) { setFaehrt(false); setWagen([]); setBusLagen([]); fgRef.current = null; setFahrgaeste(null); wagenZurueck() }
            }
            return (
              <div className="absolute inset-0 z-10 flex items-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) zu() }}>
                <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl dark:bg-sbb-charcoal" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-lg font-bold">
                      <span className="inline-block size-4 rounded-full" style={{ background: BUS_FARBEN[busWahl.nr % BUS_FARBEN.length] }} aria-hidden="true" />
                      {busse.current.length > 1 ? `Bus ${busWahl.nr + 1}` : 'Bus'}
                    </p>
                    <button type="button" onClick={zu} aria-label="Schliessen" className={rund}>✕</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={entfernen}
                            className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold text-sbb-red hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight">Bus entfernen</button>
                  </div>
                </div>
              </div>
            )
          })()}
          {/* einen Zug aus dem Depot zusammenstellen */}
          {zugWahlFeld === 'neu' && auftrag && (() => {
            const alle = betrieb.zuege[auftrag.id] ?? {}
            const andere = Object.entries(alle).filter(([k]) => brett[+k.split(',')[1]]?.[+k.split(',')[0]]?.zugStart).map(([, z]) => z)
            return (
              <ZugWahl betrieb={betrieb} setBetrieb={setBetrieb} auftrag={auftrag} andere={andere} anfang={zugWartet} zu={() => setZugWahlFeld(null)}
                       setzen={(z) => { setZugWartet(z); setWerkzeug({ art: 'zug', zug: 'p' }); setZugWahlFeld(null); setMeldung('Tippe jetzt aufs Gleis, wo dein Zug stehen soll.') }}
                       entfernen={() => { setZugWartet(null); setZugWahlFeld(null) }} />
            )
          })()}
          {Array.isArray(zugWahlFeld) && auftrag && (() => {
            const [zi, zj] = zugWahlFeld, key = `${zi},${zj}`, alle = betrieb.zuege[auftrag.id] ?? {}
            const andere = Object.entries(alle).filter(([k]) => k !== key && brett[+k.split(',')[1]]?.[+k.split(',')[0]]?.zugStart).map(([, z]) => z)
            const zu = () => setZugWahlFeld(null)
            const speichern = (z: Zusammenstellung | null) => setBetrieb((b) => {
              const m = { ...(b.zuege[auftrag.id] ?? {}) }
              if (z) m[key] = z; else delete m[key]
              return { ...b, zuege: { ...b.zuege, [auftrag.id]: m } }
            })
            return (
              <ZugWahl betrieb={betrieb} setBetrieb={setBetrieb} auftrag={auftrag} andere={andere} anfang={brett[zj][zi].zugStart ? alle[key] ?? null : null} zu={zu}
                       setzen={(z) => { speichern(z); neu(zi, zj, { ...brett[zj][zi], zugStart: z.wagen.every((x) => x === 'person') ? 'p' : 'g' }); zu() }}
                       entfernen={() => { speichern(null); const { zugStart: _, ...o } = brett[zj][zi]; neu(zi, zj, o); zu() }} />
            )
          })()}
          {/* Rückfrage, bevor unter der Uhr etwas gelöscht wird */}
          {uhrBelegt && !faehrt && (
            <div className="absolute inset-0 z-10 flex items-end bg-black/30">
              <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl dark:bg-sbb-charcoal" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
                <p className="text-lg font-bold">Platz für die Uhr</p>
                <p className="mt-1 text-sm leading-relaxed">Der Taktfahrplan ist eingeschaltet. Seine Uhr braucht die vier Felder oben links, dort liegt aber etwas. Soll es gelöscht werden?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setBrett(uhrPlatz(brett)); knopfTon(true); setMeldung(null) }}
                          className="min-h-11 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125">Löschen und Uhr zeigen</button>
                  <button type="button" onClick={() => { taktSetzen(0); knopfTon(false) }}
                          className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight">Takt ausschalten</button>
                </div>
              </div>
            </div>
          )}
          {/* Name eines Bahnhofs als Blatt von unten */}
          {nameFeld && (
            <div className="absolute inset-0 z-10 flex items-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) { setNameFeld(null); setNameSuche('') } }}>
              <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl dark:bg-sbb-charcoal" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
                <label className="font-bold" htmlFor="gleisbau-name">Name für Bahnhof {bahnhofGruppen(brett).get(`${nameFeld[0]},${nameFeld[1]}`)}</label>
                <input id="gleisbau-name" value={nameSuche} onChange={(e) => setNameSuche(e.target.value)} autoFocus placeholder="Bahnhof aus Taktland suchen"
                       className="mt-2 w-full rounded-lg border border-sbb-cloud bg-white px-3 py-2 dark:border-sbb-iron dark:bg-sbb-midnight" />
                {!alleNamen && <p className="mt-2 text-sm">Bahnhöfe werden geladen …</p>}
                {treffer.length > 0 && (
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {treffer.map((n) => (
                      <li key={n}><button type="button" onClick={() => nameSetzen(n)} className="kachel-link kachel w-full px-3 py-2 text-left">{n}</button></li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-4">
                  <button type="button" onClick={() => nameSetzen(null)} className="underline underline-offset-2">Ohne Namen</button>
                  <button type="button" onClick={() => { setNameFeld(null); setNameSuche('') }} className="underline underline-offset-2">Abbrechen</button>
                </div>
              </div>
            </div>
          )}
          {/* das Menü: Einstellungen und Seltenes */}
          {menu && (
            <div className="absolute inset-0 z-10 flex items-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) setMenu(false) }}>
              <div className="max-h-[85%] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-sbb-charcoal" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold">Menü</p>
                  <button type="button" onClick={() => setMenu(false)} aria-label="Menü schliessen" className={rund}>✕</button>
                </div>
                <div className="mt-2 divide-y divide-sbb-cloud dark:divide-sbb-iron">
                  {schalter(mitFahrgaesten, () => setMitFahrgaesten((x) => !x), 'Fahrgäste mit Ziel an den Bahnhöfen')}
                  <div className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <span>Anzahl Züge<span className="block text-xs text-sbb-metal">{aufgabe ? 'gilt beim freien Bauen; hier fährt einer, ausser du setzt selbst Züge' : faehrt ? 'gilt ab der nächsten Fahrt' : 'beim freien Bauen, ohne selbst gesetzte Züge'}</span></span>
                    <span className="flex items-center gap-2">
                      <button type="button" aria-label="Ein Zug weniger" disabled={zugZahl <= 1} onClick={() => zugZahlSetzen(zugZahl - 1)} className={rund}>−</button>
                      <span className="w-6 text-center text-lg font-bold tabular-nums">{zugZahl}</span>
                      <button type="button" aria-label="Ein Zug mehr" disabled={zugZahl >= ZUEGE_MAX} onClick={() => zugZahlSetzen(zugZahl + 1)} className={rund}>+</button>
                    </span>
                  </div>
                  {!aufgabe && <div className="py-2">
                    <span>Taktfahrplan<span className="block text-xs text-sbb-metal">An Knoten fahren die Züge zur Taktzeit ab; eine Minute im Spiel dauert eine Sekunde</span></span>
                    <div className="segmente mt-1.5 grid grid-cols-4">
                      {TAKT_WAHL.map((t) => (
                        <button key={t} type="button" aria-pressed={takt === t} disabled={faehrt} onClick={() => { taktSetzen(t); if (t && !takt) setReiter('Bauwerke') }}
                                className="segment px-2 py-2 disabled:opacity-40">{t ? `${t} Min.` : 'Aus'}</button>
                      ))}
                    </div>
                  </div>}
                  <div className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <span>Länge des Zugs<span className="block text-xs text-sbb-metal">Lok, {wagenZahl - 2 === 1 ? '1 Wagen' : `${wagenZahl - 2} Wagen`} und Steuerwagen, {(wagenZahl - 1) * WAGEN_ARTEN.person.plaetze} Plätze{faehrt ? ', gilt ab der nächsten Fahrt' : ''}</span></span>
                    <span className="flex items-center gap-2">
                      <button type="button" aria-label="Ein Wagen weniger" disabled={wagenZahl <= WAGEN_MIN} onClick={() => wagenSetzen(wagenZahl - 1)} className={rund}>−</button>
                      <span className="w-6 text-center text-lg font-bold tabular-nums">{wagenZahl - 2}</span>
                      <button type="button" aria-label="Ein Wagen mehr" disabled={wagenZahl >= WAGEN_MAX} onClick={() => wagenSetzen(wagenZahl + 1)} className={rund}>+</button>
                    </span>
                  </div>
                </div>
                {!aufgabe && <><p className="mt-4 text-sm font-bold">Grösse des Bretts</p>
                  <GroesseWahl key={`${SP}x${ZE}`} sp={SP} ze={ZE} gesperrt={faehrt} text="Grösse ändern"
                               waehlen={(sp, ze) => { setBrett(groesseAendern(brett, sp, ze)); setMeldung(null); setMenu(false); setZoom({ s: 1, x: 0, y: 0 }) }} /></>}
                {aufgabe?.daten && <Klappe titel="Was die Daten sagen" className="mt-4"><p className="text-sm leading-relaxed">{aufgabe.daten}</p></Klappe>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {aufgabe
                    ? <button type="button" disabled={faehrt} onClick={() => { aufgabeWaehlen(aufgabe, true); setMenu(false) }}
                              className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">Neu beginnen</button>
                    : <button type="button" disabled={faehrt} onClick={() => { setBrett(zufallsBeispiel(SP, ZE)); setMeldung(null); setMenu(false) }}
                              className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">Beispiel</button>}
                  {!aufgabe && leerenKnopf}
                  {!aufgabe && (
                    <button type="button" onClick={() => void brettTeilen()}
                            className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight">
                      {geteilt ? 'Link kopiert' : 'Link teilen'}
                    </button>
                  )}
                </div>
                <Klappe titel="So geht's" className="mt-4"><SoGehts /></Klappe>
              </div>
            </div>
          )}
          {/* gelöst: einmal eine Karte mit den Sternen und «Nächste Aufgabe» */}
          {aufgabe && geloest && ergebnis?.ok && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
              <div className="grid w-full max-w-sm gap-3 rounded-2xl bg-white p-5 text-center shadow-xl dark:bg-sbb-charcoal">
                <p className="text-2xl font-bold tracking-tight">Geschafft!</p>
                <p className="text-3xl"><Sterne n={ergebnis.sterne} /></p>
                <p className="text-sm leading-relaxed">{ergebnis.text}</p>
                {gutschrift !== null && <p className="font-bold">Gutgeschrieben: CHF {gutschrift.toLocaleString('de-CH')} · Kasse: CHF {betrieb.geld.toLocaleString('de-CH')}</p>}
                {auftrag && <button type="button" onClick={() => { window.location.hash = '#/gleisbau?betrieb' }} className="rounded-lg bg-sbb-red px-5 py-3 font-bold text-white hover:bg-sbb-red125">Zu den Aufträgen</button>}
                <div className="flex flex-wrap justify-center gap-2">
                  {naechste && <button type="button" autoFocus onClick={() => { window.location.hash = `#/gleisbau?aufgabe=${encodeURIComponent(naechste.id)}` }}
                                       className="rounded-lg bg-sbb-red px-5 py-3 font-bold text-white hover:bg-sbb-red125">Nächste Lektion</button>}
                  {/* nach der letzten Lektion weiter zum Bahnbetrieb */}
                  {!naechste && aufgabe.reihe !== undefined && <button type="button" autoFocus onClick={() => { window.location.hash = '#/gleisbau?betrieb' }}
                                       className="rounded-lg bg-sbb-red px-5 py-3 font-bold text-white hover:bg-sbb-red125">Zum Bahnbetrieb</button>}
                  <button type="button" onClick={() => setGeloest(false)}
                          className="rounded-lg border border-sbb-cloud bg-white px-5 py-3 font-bold hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight">Weiterbauen</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** die Anleitung, auf der Startseite und im Menü */
function SoGehts() {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
      <li>Der Gleisbau wird weiterentwickelt. Deine Bretter bleiben erhalten, wie sie fahren und aussehen, kann sich mit neuen Funktionen ändern.</li>
      <li>Wähle unten ein Stück und tippe ein Feld an, nochmals tippen dreht es. Ein zweiter Tipp auf das Stück unten dreht es schon vor dem Legen. Mit «Linie ziehen» fährst du mit dem Finger über die Felder,
        Geraden, Kurven und Weichen entstehen von selbst.</li>
      <li>Gleis auf Wasser wird zur Brücke, auf einem Berg zum Tunnel; «Brücke» baut eine Brücke auch ohne Wasser, den See setzt du selbst darunter.
        Eine Strasse über eine Gerade wird zum Bahnübergang mit Schranken. Bei einer roten Ampel wartet der Zug, ein Tipp stellt sie auf Grün.</li>
      <li>Im Depot fährt der Zug ab, am Güterschuppen hält er zum Laden, unter der Galerie fährt er gedeckt. Kirche und Bauernhof stehen allein in einem Feld ohne Gleis.</li>
      <li>Ein Fluss fliesst zu Nachbarn mit Fluss oder Wasser, ein Gleis darüber wird zur Brücke. Ein abgestellter Wagen wird angekuppelt, wenn ein Zug hineinfährt; abstellen geht mit einem Tipp auf den Zug. Nach der Fahrt stehen die Wagen wieder am alten Platz.</li>
      <li>Alle Gleise haben Fahrleitung, «Ohne Strom» nimmt sie weg (auch durch Ziehen). Ein Stromzug rollt dort aus und bleibt stehen. Tippe auf einen Zug und wähle «Diesel»: Fährt er auf den stehenden Zug, kuppelt er ihn an und zieht ihn heraus. «Abkuppeln» trennt die beiden wieder.</li>
      <li>Taktfahrplan im Menü (15, 30 oder 60 Minuten): Oben links im Brett steht eine Uhr auf vier Feldern, eine Minute im Spiel dauert eine Sekunde. Liegt dort schon etwas, fragt das Spiel, ob es gelöscht werden soll. Unter Bauwerke macht «Knoten» einen Bahnhof zum Knoten; dort fährt jeder Zug zur nächsten Taktzeit ab. Kommen zwei Züge zur selben Abfahrt, haben sie Anschluss. Baue die Strecke so, dass die Züge kurz vor der Taktzeit ankommen, wie bei Bahn 2000.</li>
      <li>Ein Bahnhof auf einer Kurve wird zum Bahnhof in der Kurve, Bahnhöfe nebeneinander sind ein Bahnhof. Mit «Name» gibst du ihm den Namen
        eines echten Bahnhofs.</li>
      <li>Bahnbetrieb: ein Spiel mit Aufträgen, Geld und Depot. Beim ersten Öffnen wählst du die Schwierigkeit und was du fahren möchtest. Jeder Auftrag bringt Lohn, die Gleise kosten (Tunnel und Brücken mehr). Ein Tipp auf «Züge» öffnet das Zusammenstellen: Lok und Wagen in die leeren Felder ziehen oder antippen, Kosten und Platz stehen darunter; danach aufs Gleis tippen, wo der Zug stehen soll. Ein Tipp auf einen gesetzten Zug ändert ihn. Ein Personenwagen hat 4 Plätze, ein Güterwagen trägt 1 Ladung seines Guts. Mit dem Gewinn kaufst du im Depot weitere Loks und Wagen.</li>
      <li>Mit der Maus zwei rote Punkte verbinden: auf einem roten Punkt drücken und zu einem anderen ziehen, dazwischen entsteht das Gleis mit möglichst wenig Kurven, über Wasser als Brücke, durch Berge als Tunnel.</li>
      <li>Mit der Maus: Ein Klick wählt ein Feld (gestrichelter Rahmen). Entf oder die Rückschritt-Taste nimmt seinen obersten Inhalt weg, Schicht um Schicht bis zur Wiese; Esc hebt die Wahl auf. Rückgängig geht wie immer.</li>
      <li>Personen- und Güterzüge: Unter «Züge» setzt «Personenzug» oder «Güterzug» einen Zug aufs Gleis. Gibt es gesetzte Züge, fahren genau diese, sonst wie bisher Personenzüge nach «Anzahl Züge». Der Personenzug (Lok, Personenwagen und Steuerwagen, je 4 Plätze) hält an Bahnhöfen und bringt Fahrgäste ans Ziel, der Güterzug fährt an Bahnhöfen durch, hält am Güterschuppen (Bauwerke «Güter») und liefert Ladungen zu einem anderen Güterschuppen; eine Ladung füllt einen Güterwagen. Das Tutorial zeigt es Schritt für Schritt.</li>
      <li>Busse: Im Reiter «Strasse» liegen Strasse, Haltestelle, Wendeplatz, Brücke und Tunnel. Eine Strasse über Wasser oder einen Fluss wird zur Brücke,
        im Berg zum Tunnel; «Brücke» über ein Gleis führt die Strasse darüber statt über einen Bahnübergang. Die Busse fahren rechts, biegen nach Zufall ab,
        wenden am Ende der Strasse, halten an Haltestellen und warten vor geschlossenen Schranken. Liegt eine Haltestelle neben einem Bahnhof, wartet der Bus
        dort auf den nächsten Zug. Auf jeder eigenständigen Strasse fahren zwei Busse; ein Tipp auf einen Bus entfernt ihn.</li>
      <li>Mit Boden, Fluss oder Strasse gewählt, über die Felder ziehen: Alle werden gefüllt.</li>
      <li>Lange drücken und ziehen verschiebt ein Feld; liegt am Ziel etwas, tauschen die beiden. Rote Punkte zeigen, wo ein Gleis offen endet.
        Mit zwei Fingern zoomst und verschiebst du das Brett, am Computer mit dem Mausrad.</li>
      <li>▶ Fahren: Der Zug hält an jedem Bahnhof und kehrt am Ende eines Gleises um, ein Tipp stellt die Weichen. Im Menü «⋯»: Fahrgäste mit
        Ziel, bis vier Züge (Signale an den Weichen zeigen, wo ein Zug ist, keiner fährt in ein besetztes Feld), Grösse, Beispiel, Leeren und Teilen.</li>
    </ul>
  )
}
