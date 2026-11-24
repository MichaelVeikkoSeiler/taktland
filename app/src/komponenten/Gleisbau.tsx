import { useEffect, useMemo, useRef, useState } from 'react'
import { abfahrtsPfiff, antwortTon, kirchenSchlag, knopfTon, zuggeraeuschAus, zuggeraeuschTempo } from '../audio'
import {
  type Brett, brettAusCode, brettCode, bretterLesen, bretterMerken, type GespeichertesBrett, neueId, type Gleis, bahnhofGruppen, bahnhofNamen, bahnhofTitel, type Dreh, type Feld, type GleisArt, groesseAendern, type Grund, leer,
  anfangZumGriff, grossAnfang, grosseEntfernen, grosseKurve, grosseLegen, grossGeometrie, ampelGilt, istBahnhof, istWeiche, linieLegen, offeneEnden, strasseMoeglich, spalten, type Stueck, stueckLaenge, stueckPunkt, tunnelWeiter, tunnelWeiterAnKante, verschieben, type WagenLage, WAGEN_LAENGE, wege, wegPunkte, zeilen, Zug, zufallsBeispiel,
  WAGEN, WAGEN_MIN, WAGEN_MAX, bauGilt, ueberWasser, wagenGilt, knotenGruppen, HALT_S,
} from '../gleisbau'
import { Zurueck } from './Zurueck'
import { Klappe } from './Klappe'
import { type Aufgabe, AUFGABEN, bewerten, type Ergebnis, fortschrittLesen, fortschrittMerken } from '../gleisbauAufgaben'
import { indexLaden } from '../daten'
import { type Fahrgaeste, fahrgaesteHalt, fahrgaesteStart, fahrgaesteZeit } from '../gleisbauFahrgaeste'
import GleisbauBretter, { brettLink, GroesseWahl } from './GleisbauBretter'
import { bild, Landschaft, masse, MusterDefs, type Objekt, ObjektBild, objekteBauen, PortalBild, SchrankenBild, StrassenBild } from './GleisbauBilder'

const LEISE = 'text-sm text-sbb-metal dark:text-sbb-storm'

/**
 * Farben des Bretts (gewählt): ein dunkles Tablett mit hellen Feldern wie in Michaels Vorlage «VIA», die Häuser des Dorfs in deren
 * Farben, Gleise in Anthrazit, Akzente in Karmin wie in Taktland
 */
// seit 2026-11-22 frischer, nach Michaels Bild eines Bretts mit Bergen, Wald, Dorf und See (Michael: «Wäre das nicht schöner?», dann «Ja, 2D-Brett
// so überarbeiten wie vorgeschlagen»): kräftigeres Grün, tiefblaues Wasser, Berge mit heller und dunkler Flanke und Schnee, Nadel- und Laubbäume,
// rote Dächer, Kacheln mit dunklerer Unterkante; weiterhin flache Flächen ohne Verläufe wie überall in Taktland
const F = {
  tablett: '#3a3a3c', wiese: '#c4e19f', wald: '#aed38c', wasser: '#4d93d6', welle: '#a4cef2',
  berg: '#cfd6c4', deckel: '#aeb6a2', fels: '#8f9398', felsDunkel: '#6f7378', schnee: '#ffffff', schneeDunkel: '#dde3ea',
  laub: ['#6cb54f', '#7cc35a', '#5aa443'], laubSchatten: '#4b8f37', nadel: '#2f7d3c', nadelSchatten: '#24652f', stamm: '#7a5a3c',
  schotter: '#c2bbb0', schwelle: '#8b8074', schiene: '#4a4a4a',
  perron: '#d2d2d2', strasse: '#d8d1c4', dach: '#6a6a6a', bruecke: '#d6d6d6', gelaender: '#7a7a7a', portal: '#2e2e30', karmin: '#a8102e',
  wand: '#f4f1ea', ziegel: ['#d4583e', '#c94a32', '#b8452f'], ziegelSchatten: '#9e3a27',
}
/** die Unterkante jeder Kachel, damit sie leicht erhaben wirkt (gewählt) */
const KANTE = { wiese: '#9fc47a', wald: '#89b56a', wasser: '#336fb0', berg: '#a9b19d', dorf: '#9fc47a', rebberg: '#86ad4c', schnee: '#b7c7e2', acker: '#8a5530' }
const KACHEL_H = 0.915

type Werkzeug =
  | { art: 'linie' } | { art: 'name' } | { art: 'ampel' } | { art: 'gleis'; gleis: GleisArt } | { art: 'tunnel' } | { art: 'bruecke' } | { art: 'grund'; grund: Grund } | { art: 'strasse' } | { art: 'weg' }
  | { art: 'fluss' } | { art: 'wagen' } | { art: 'knoten' }
  | { art: 'bau'; bau: 'depot' | 'gueter' | 'galerie' } | { art: 'objekt'; objekt: 'kirche' | 'bauernhof' }

const GLEISE: Array<{ w: Werkzeug; text: string }> = [
  { w: { art: 'linie' }, text: 'Linie' },
  { w: { art: 'gleis', gleis: 'gerade' }, text: 'Gerade' },
  { w: { art: 'gleis', gleis: 'kurve' }, text: 'Kurve' },
  { w: { art: 'gleis', gleis: 'bogen2' }, text: 'Kurve 2 × 2' },
  { w: { art: 'gleis', gleis: 'bogen3' }, text: 'Kurve 3 × 3' },
  { w: { art: 'gleis', gleis: 'weiche' }, text: 'Weiche R' },
  { w: { art: 'gleis', gleis: 'weiche_l' }, text: 'Weiche L' },
  { w: { art: 'gleis', gleis: 'dreiweg' }, text: 'Dreiweg' },
  { w: { art: 'gleis', gleis: 'kreuzung' }, text: 'Kreuzung' },
  { w: { art: 'gleis', gleis: 'doppelkurve' }, text: 'Doppelkurve' },
  { w: { art: 'gleis', gleis: 'prellbock' }, text: 'Prellbock' },
  { w: { art: 'wagen' }, text: 'Wagen' },
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

/** die Werkzeuge unten in drei Reitern */
const GRUPPEN = [
  { titel: 'Gleise', l: GLEISE.filter((x) => x.w.art === 'linie' || x.w.art === 'wagen' || (x.w.art === 'gleis' && x.w.gleis !== 'bahnhof')) },
  { titel: 'Bauwerke', l: [...GLEISE.filter((x) => (x.w.art === 'gleis' && x.w.gleis === 'bahnhof') || ['name', 'tunnel', 'bruecke', 'ampel', 'bau', 'knoten'].includes(x.w.art)),
    ...LANDSCHAFT.filter((x) => x.w.art === 'strasse')] },
  { titel: 'Landschaft', l: LANDSCHAFT.filter((x) => x.w.art !== 'strasse') },
]

/**
 * Taktfahrplan (Michael, 2026-11-24: «Ich denke an ein Taktsystem nach Vorbild vom Schweizerischen ÖV», «Im gleichen Spiel ergänzen und evtl wenn man den Takt
 * aktiviert erscheinen dazu passende Features»): eine Spielminute dauert eine Sekunde, die Uhr beginnt um 7 Uhr (beides gewählt); an Knoten fahren die Züge zur
 * nächsten Taktzeit ab, frühestens nach dem üblichen Halt
 */
const TAKT_WAHL = [0, 15, 30, 60] as const, UHR_START_MIN = 7 * 60
const uhrText = (sek: number) => { const m = UHR_START_MIN + Math.floor(sek); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
const taktZeiten = (takt: number) => Array.from({ length: 60 / takt }, (_, k) => `:${String(k * takt).padStart(2, '0')}`).join(' ')

const gleich = (a: Werkzeug, b: Werkzeug) => JSON.stringify(a) === JSON.stringify(b)

/** nach so vielen Sekunden gegenseitigen Wartens kehrt ein Zug um; Spitze des zweiten Zugs in Blau statt Karmin (beides gewählt) */
const UMKEHREN_NACH_S = 2.5
/** wie nah an der Mitte eines Wagens ein Tipp den Zug trifft, in Feldern (gewählt) */
const ZUG_TIPP = 0.35
/** Farbe der Spitze je Zug ab dem zweiten (gewählt) */
const ZUG_FARBEN = ['#1f5fa8', '#2e7d32', '#e07b00'], ZUEGE_MAX = 4

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
function SchildBild({ namen, titel, knoten, takt }: { namen: Map<string, string>; titel: Map<string, string>; knoten: Set<string>; takt: number }) {
  const raus = []
  for (const [k, n] of namen) {
    const [i, j] = k.split(',').map(Number)
    const t = titel.get(n)
    const kurz = t && t.length > 20 ? `${t.slice(0, 19)}…` : t
    const breit = kurz ? 0.24 + kurz.length * 0.072 : 0.2
    raus.push(
      <g key={k} pointerEvents="none">
        <rect x={i + 0.06} y={j + 0.06} width={breit} height={0.2} rx={0.03} fill="#3d3d3d" />
        <text x={i + 0.16} y={j + 0.215} fontSize={0.15} fontWeight={700} textAnchor="middle" fill="#ffffff">{n}</text>
        {kurz && <text x={i + 0.27} y={j + 0.205} fontSize={0.13} fontWeight={500} fill="#ffffff">{kurz}</text>}
        {/* am Knoten die Abfahrten im Takt darunter */}
        {takt > 0 && knoten.has(n) && <>
          {/* rechts neben dem Schild, darunter warten die Fahrgäste */}
          <rect x={i + 0.1 + breit} y={j + 0.075} width={0.1 + (taktZeiten(takt).length + 3) * 0.068} height={0.17} rx={0.03} fill={F.karmin} />
          <text x={i + 0.14 + breit} y={j + 0.2} fontSize={0.12} fontWeight={700} fill="#ffffff">ab {taktZeiten(takt)}</text>
        </>}
      </g>,
    )
  }
  return <>{raus}</>
}

/** drei Sterne, die erreichten in Karmin */
function Sterne({ n }: { n: number }) {
  return (
    <span className="whitespace-nowrap text-lg leading-none" aria-label={`${n} von 3 Sternen`}>
      {[0, 1, 2].map((k) => <span key={k} className={k < n ? 'text-sbb-red' : 'text-[#b4b4b4] dark:text-sbb-iron'}>★</span>)}
    </span>
  )
}

/** die Aufgaben als Kacheln mit den erreichten Sternen, die eigenen zuerst, dann die echten Strecken */
function AufgabenListe({ fortschritt, waehlen }: { fortschritt: Record<string, number>; waehlen: (a: Aufgabe) => void }) {
  const gruppe = (titel: string, l: Aufgabe[]) => (
    <section className="mt-4">
      <h2 className="text-lg font-bold">{titel}</h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {l.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => waehlen(a)} className="kachel kachel-link flex w-full items-center justify-between gap-3 px-3 py-3 text-left">
              <span className="font-medium">{a.titel}</span>
              <Sterne n={fortschritt[a.id] ?? 0} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
  return (
    <div className="max-w-3xl">
      {gruppe('Aufgaben', AUFGABEN.filter((a) => !a.id.startsWith('strecke-')))}
      {gruppe('Echte Strecken nachbauen', AUFGABEN.filter((a) => a.id.startsWith('strecke-')))}
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

/** so schnell klingt der Zug bei vollem Tempo auf dem Brett, in m/s (etwa 80 km/h; gewählt, das Brett hat keinen Massstab) */
const ZUG_KLANG_MS = 22

const linie = (p: Array<{ x: number; y: number }>) => p.map((q, k) => `${k ? 'L' : 'M'}${q.x.toFixed(3)},${q.y.toFixed(3)}`).join('')
const versetzt = (p: Array<{ x: number; y: number; w: number }>, d: number) =>
  p.map((q) => ({ x: q.x - Math.sin(q.w) * d, y: q.y + Math.cos(q.w) * d }))

/** wie weit das Portal vom Rand des Felds liegt */
const PORTAL = 0.22
/** Strich, wo das Gleis im Tunnel verläuft (gewählt) */
const TUNNEL_STRICH = '#55585e'

/** ob ein Punkt im Tunnel liegt: in einem Feld im Berg mit Gleis, mehr als PORTAL von jeder Kante mit Portal (an Kanten, wo der Tunnel im
 *  Nachbarfeld weitergeht, gibt es keines) */
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
          <path d={linie(p)} fill="none" stroke={F.schwelle} strokeWidth={0.22} strokeDasharray="0.035 0.065" />
          <path d={linie(versetzt(p, 0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
          <path d={linie(versetzt(p, -0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
        </g>
      ))}
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
      <path d={linie(p)} fill="none" stroke={F.schwelle} strokeWidth={0.22} strokeDasharray="0.035 0.065" />
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
      {/* der Griff: ein Pfeil im Kreis, hier dreht man die Kurve */}
      <g transform={`translate(${G.griff[0] + 0.5} ${G.griff[1] + 0.5})`} opacity={0.75}>
        <circle r={0.2} fill="#ffffff" stroke={F.karmin} strokeWidth={0.03} />
        <path d="M-0.1,0.02 A0.1,0.1 0 1 1 0.02,0.1" fill="none" stroke={F.karmin} strokeWidth={0.035} strokeLinecap="round" />
        <path d="M0.06,0.13 L0.0,0.1 L0.05,0.04" fill="none" stroke={F.karmin} strokeWidth={0.03} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  )
}

/** ein Wagen von oben, die Spitze bei +x; Lok mit karminroter Spitze, Steuerwagen mit weisser, vorne Stirnlicht, hinten rot */
function WagenBild({ w, tunnel, farbe = F.karmin }: { w: WagenLage; tunnel: boolean; farbe?: string }) {
  const kopf = w.art === 0 || w.art === 3
  const halb = WAGEN_LAENGE / 2
  return (
    <g transform={`translate(${w.x} ${w.y}) rotate(${(w.w * 180) / Math.PI})`} opacity={tunnel ? 0.28 : 1}>
      <rect x={-halb + 0.02} y={-0.08} width={WAGEN_LAENGE} height={0.18} rx={0.05} fill="rgba(0,0,0,.18)" />
      <g transform={kopf && !w.vorne ? 'scale(-1 1)' : undefined}>
        <rect x={-halb} y={-0.09} width={WAGEN_LAENGE} height={0.18} rx={kopf ? 0.06 : 0.03} fill="#f4f4f4" stroke="#2f2f2f" strokeWidth={0.012} />
        <rect x={-halb + 0.04} y={-0.045} width={WAGEN_LAENGE - 0.08} height={0.09} rx={0.02} fill="#d9d9d9" />
        {kopf && (
          <>
            <path d={`M${halb - 0.1},-0.09 L${halb - 0.05},-0.09 Q${halb},-0.09 ${halb},-0.04 L${halb},0.04 Q${halb},0.09 ${halb - 0.05},0.09 L${halb - 0.1},0.09 Z`}
                  fill={w.art === 0 ? farbe : '#ffffff'} stroke="#2f2f2f" strokeWidth={0.012} />
            <rect x={halb - 0.13} y={-0.075} width={0.025} height={0.15} rx={0.01} fill="#1f2a36" />
            <path d={`M-0.12,-0.05 L-0.04,0.05 M-0.12,0.05 L-0.04,-0.05`} stroke="#444" strokeWidth={0.014} />
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
  const [ansicht, setAnsicht] = useState<'liste' | 'brett' | 'aufgaben'>('liste')
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
  const [takt, setTakt] = useState<number>(() => { try { const n = Number(localStorage.getItem('taktland.gleisbau.takt')); return (TAKT_WAHL as readonly number[]).includes(n) ? n : 0 } catch { return 0 } })
  const taktSetzen = (n: number) => { setTakt(n); try { localStorage.setItem('taktland.gleisbau.takt', String(n)) } catch { /* ohne Speicher */ } }
  const spielSek = useRef(0)
  const [zugZahl, setZugZahl] = useState(() => { try { const n = Number(localStorage.getItem('taktland.gleisbau.zuege')); return n >= 1 && n <= ZUEGE_MAX ? n : 1 } catch { return 1 } })
  const zugZahlSetzen = (n: number) => { const m = Math.max(1, Math.min(ZUEGE_MAX, n)); setZugZahl(m); try { localStorage.setItem('taktland.gleisbau.zuege', String(m)) } catch { /* ohne Speicher */ } }
  // Fahrzeuge am Zug samt Lok und Steuerwagen, auf dem Gerät gemerkt
  const [wagenZahl, setWagenZahl] = useState(() => { try { const n = Number(localStorage.getItem('taktland.gleisbau.wagen')); return n >= WAGEN_MIN && n <= WAGEN_MAX ? n : WAGEN } catch { return WAGEN } })
  const wagenSetzen = (n: number) => { const m = Math.max(WAGEN_MIN, Math.min(WAGEN_MAX, n)); setWagenZahl(m); try { localStorage.setItem('taktland.gleisbau.wagen', String(m)) } catch { /* ohne Speicher */ } }
  // Fahrgäste mit Ziel an den Bahnhöfen (Michael, 2026-11-23, Vorschlag «Fahrgäste»), am Anfang an
  const [mitFahrgaesten, setMitFahrgaesten] = useState(true)
  const [fahrgaeste, setFahrgaeste] = useState<Fahrgaeste | null>(null)
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
      {brett.map((z, j) => z.map((f, i) => <GrundBild key={`g${i},${j}`} f={f} i={i} j={j} nurFlaeche />))}
      <Landschaft brett={brett} />
      <StrassenBild brett={brett} />
      {brett.map((z, j) => z.map((f, i) => <GleisBild key={`l${i},${j}`} f={f} i={i} j={j}
                                                     weiter={f.grund === 'berg' ? [0, 1, 2, 3].map((k) => tunnelWeiter(brett, i, j, k)) : undefined}
                                                     wasser={(u, v) => ueberWasser(brett[v]?.[u])} brett={brett} />))}
    </>
  ), [brett, namen])
  const oben = useMemo(() => objekteBauen(brett, imTunnel).map((o, k) => <ObjektBild key={k} o={o} />), [brett])
  // offene Gleisenden als roter Punkt, beim Bauen (Michael, 2026-11-23, Vorschlag «Anzeige, wo das Gleis offen endet»)
  const enden = useMemo(() => offeneEnden(brett), [brett])

  // Aufgaben (Michael, 2026-11-23, Vorschlag «Aufgaben»): eine gewählte Aufgabe hat ihr eigenes Brett, das freie bleibt gemerkt und kommt danach zurück
  const [aufgabe, setAufgabe] = useState<Aufgabe | null>(null)
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null)
  const [fortschritt, setFortschritt] = useState<Record<string, number>>(() => fortschrittLesen())
  const aufgabeWaehlen = (a: Aufgabe | null) => {
    setFaehrt(false); zuege.current = []; setWagen([]); fgRef.current = null; setFahrgaeste(null)
    setAufgabe(a); setErgebnis(null); setGeloest(false); setVerlauf([]); setMeldung(null); setNameFeld(null); setMenu(false); setZoom({ s: 1, x: 0, y: 0 })
    if (a) setBrettRoh(a.brett())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // gelöst ist eine Aufgabe, sobald die Prüfung stimmt; die Sterne bleiben auf dem Gerät, die besten zählen
  useEffect(() => {
    if (!aufgabe) return
    const e = bewerten(aufgabe, brett)
    if (e.ok) {
      setErgebnis((alt) => { if (!alt?.ok) setGeloest(true); return e })
      setFortschritt((f) => {
        if ((f[aufgabe.id] ?? 0) >= e.sterne) return f
        const n = { ...f, [aufgabe.id]: e.sterne }; fortschrittMerken(n); return n
      })
    } else setErgebnis((alt) => (alt?.ok ? null : alt))
  }, [aufgabe, brett])
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
      if (a) { setAnsicht('aufgaben'); aufgabeWaehlen(a); return }
      if (q.has('aufgaben')) { setAufgabe(null); setAnsicht('aufgaben'); return }
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
  const imVollbild = ansicht === 'brett' || (ansicht === 'aufgaben' && !!aufgabe)
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
  const zoomSetzen = (s: number, x: number, y: number) => {
    const el = buehne.current
    if (!el || s <= 1.001) { setZoom({ s: 1, x: 0, y: 0 }); return }
    const w = el.clientWidth, h = el.clientHeight
    setZoom({ s, x: Math.min(0, Math.max(w - w * s, x)), y: Math.min(0, Math.max(h - h * s, y)) })
  }
  const buehneDrucken = (e: React.PointerEvent<HTMLDivElement>) => {
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (finger.current.size !== 2) return
    druck.current = null; setZiehen(null); linieRef.current = null; setLinie(null); nachZiehen.current = true
    const [a, b] = [...finger.current.values()], r = buehne.current!.getBoundingClientRect()
    zwei.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, z: zoom }
  }
  const buehneBewegen = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!finger.current.has(e.pointerId)) return
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const z = zwei.current
    if (!z || finger.current.size !== 2) return
    const [a, b] = [...finger.current.values()], r = buehne.current!.getBoundingClientRect()
    const s = Math.max(1, Math.min(4, (z.z.s * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, z.d)))
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top
    zoomSetzen(s, mx - ((z.mx - z.z.x) * s) / z.z.s, my - ((z.my - z.z.y) * s) / z.z.s)
  }
  const buehneLos = (e: React.PointerEvent<HTMLDivElement>) => {
    finger.current.delete(e.pointerId)
    if (finger.current.size < 2 && zwei.current) { zwei.current = null; window.setTimeout(() => { nachZiehen.current = false }, 300) }
  }
  const buehneRad = (e: React.WheelEvent<HTMLDivElement>) => {
    const r = buehne.current!.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top
    const s = Math.max(1, Math.min(4, zoom.s * Math.exp(-e.deltaY * 0.002)))
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

  // der Zug je Bild
  useEffect(() => {
    if (!faehrt) return
    let los = 0, letzt = performance.now()
    const bild = (jetzt: number) => {
      const dt = Math.min(0.05, (jetzt - letzt) / 1000)
      spielSek.current += dt
      letzt = jetzt
      // je Zug ein Schritt; ein Zug fährt nur in Felder ein, die der andere nicht belegt (wie vor einem roten Signal); warten beide aufeinander,
      // kehrt der um, der länger wartet
      const zz = zuege.current
      zz.forEach((z, k) => {
        const andere = zz.filter((_, m) => m !== k)
        z.schritt(brettRef.current, dt,
          andere.length ? (felder) => andere.every((o) => { const b = o.belegt(); return [...felder].every((f) => !b.has(f)) }) : undefined,
          () => z.wartet > UMKEHREN_NACH_S && andere.some((o) => o.wartet > 0.5) && andere.every((o) => o.wartet <= z.wartet),
          // ankuppeln: der Wagen verschwindet vom Gleis, bis die Fahrt endet
          (i, j) => {
            const b = brettRef.current.map((zz, jj) => (jj === j ? zz.map((x, ii) => { if (ii !== i) return x; const { wagen: _, ...o } = x; return o }) : zz))
            brettRef.current = b; setBrettRoh(b); knopfTon(true)
          })
      })
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
          const { aus, ein } = fahrgaesteHalt(fg, k, wo)
          if (aus) antwortTon('richtig')
          if (aus || ein) neu = true
        })
        if (neu) setFahrgaeste({ ...fg, warten: { ...fg.warten }, imZug: fg.imZug.map((l) => [...l]) })
      }
      setWagen(zz.map((z) => z.wagen()))
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
    const halt = (e: TouchEvent) => { if (druck.current?.zeit === -1 || linieRef.current) e.preventDefault() }
    el.addEventListener('touchmove', halt, { passive: false })
    return () => el.removeEventListener('touchmove', halt)
  }, [])

  function drucken(e: React.PointerEvent<SVGSVGElement>) {
    if (faehrt || !e.isPrimary) return
    const feld = feldBei(e.clientX, e.clientY)
    if (!feld) return
    if (werkzeug.art === 'linie') {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ohne Fangen geht es trotzdem */ }
      linieRef.current = [feld]; setLinie([feld])
      return
    }
    const f = brett[feld[1]][feld[0]]
    if (!f.gleis && !f.teil && f.grund === 'wiese') return
    const d = { x: e.clientX, y: e.clientY, zeit: 0, feld }
    druck.current = d
    const id = e.pointerId, el = e.currentTarget
    window.setTimeout(() => {
      if (druck.current !== d) return
      d.zeit = -1
      try { el.setPointerCapture(id) } catch { /* ohne Fangen geht es trotzdem */ }
      navigator.vibrate?.(15)
      setZiehen({ von: feld, nach: feld })
    }, 450)
  }
  function bewegen(e: React.PointerEvent<SVGSVGElement>) {
    const l = linieRef.current
    if (l) {
      const feld = feldBei(e.clientX, e.clientY)
      if (!feld) return
      let neu = l
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
    const l = linieRef.current
    if (l) {
      linieRef.current = null; setLinie(null)
      nachZiehen.current = true
      window.setTimeout(() => { nachZiehen.current = false }, 250)
      if (l.length < 2) { setMeldung('Mit «Linie ziehen» den Finger über mehrere Felder ziehen: Geraden und Kurven entstehen von selbst.'); return }
      const r = linieLegen(brett, l)
      if (typeof r === 'string') { setMeldung(r); return }
      setBrett(r); knopfTon(true); setMeldung(null)
      return
    }
    const d = druck.current
    druck.current = null
    if (!d || d.zeit !== -1 || !ziehen) return
    nachZiehen.current = true
    // falls kein Klick folgt, gilt der nächste Tipp wieder
    window.setTimeout(() => { nachZiehen.current = false }, 250)
    const r = verschieben(brett, ziehen.von, ziehen.nach)
    setZiehen(null)
    if (typeof r === 'string') { setMeldung(r); return }
    if (r !== brett) { setBrett(r); knopfTon(true) }
  }

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
      if (naechster) { setZugWahl(naechster); knopfTon(true); return }
      if (ampelGilt(f)) { neu(i, j, { ...f, ampel: f.ampel === 'rot' ? 'gruen' : 'rot' }, false); knopfTon(true); return }
      if (!istWeiche(f.gleis)) { setMeldung('Während der Fahrt lassen sich nur Weichen, Ampeln und Züge antippen. Zum Bauen anhalten.'); return }
      const wege = f.gleis!.art === 'dreiweg' ? 3 : 2
      neu(i, j, { ...f, gleis: { ...f.gleis!, stellung: (((f.gleis!.stellung ?? 0) + 1) % wege) as 0 | 1 | 2 } }, false)
      knopfTon(true)
      return
    }
    if (werkzeug.art === 'linie') return
    setMeldung(null)
    if (werkzeug.art === 'name') {
      if (!istBahnhof(f.gleis)) { setMeldung('Tippe einen Bahnhof an, um ihm einen Namen zu geben.'); setNameFeld(null); return }
      setNameFeld([i, j]); setNameSuche('')
      return
    }
    const w = werkzeug
    const unterGross = !!f.teil || grosseKurve(f.gleis) > 0
    // grosse Kurve: das angetippte Feld ist ihr Griff, das Eckfeld aussen; tippt man den Griff einer gleichen an, dreht sie sich im selben Block,
    // der Griff wandert in die nächste Ecke
    const nGross = w.art === 'gleis' ? grosseKurve({ art: w.gleis, dreh }) : 0
    if (nGross && w.art === 'gleis') {
      const [hi, hj] = f.teil ?? [i, j], alt = brett[hj][hi].gleis
      let b1 = brett, ai: number, aj: number, d = dreh
      if (unterGross) {
        const G = grossGeometrie(hi, hj, alt!)
        if (alt?.art !== w.gleis || G.griff[0] !== i || G.griff[1] !== j) {
          setMeldung('Gedreht wird eine Kurve an ihrer Ecke mit dem Pfeil ↻. Eine Wiese dort löscht sie.'); return
        }
        const ox = Math.min(...G.zellen.map(([u]) => u)), oy = Math.min(...G.zellen.map(([, v]) => v))
        d = ((alt.dreh + 1) % 4) as Dreh
        b1 = grosseEntfernen(brett, i, j);
        [ai, aj] = grossAnfang(ox, oy, nGross, d)
      } else [ai, aj] = anfangZumGriff(i, j, nGross, d)
      const b2 = grosseLegen(b1, ai, aj, { art: w.gleis, dreh: d })
      if (!b2) { setMeldung(`Die Kurve braucht ${nGross} × ${nGross} Felder, vom angetippten Feld aus in die Richtung des Bilds auf dem Knopf, ohne andere Gleise darin. Drehen ↻ ändert die Richtung.`); return }
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
      if (w.art === 'ampel' || w.art === 'strasse' || w.art === 'bau' || w.art === 'objekt' || w.art === 'fluss' || w.art === 'wagen') { setMeldung('Auf einer grossen Kurve geht das nicht.'); return }
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
      if (f.strasse) { setMeldung('Auf einer Strasse hat der Fluss keinen Platz.'); return }
      neu(i, j, { ...f, fluss: true }); knopfTon(true)
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
      const { strasse: _s, ampel: _a, objekt: _o, ...ohne } = f
      neu(i, j, { ...ohne, bau: w.bau, gleis: f.gleis?.art === art ? f.gleis : { art, dreh } }); knopfTon(true)
      return
    }
    if (w.art === 'strasse') {
      if (f.strasse) { const { strasse: _, ...ohne } = f; neu(i, j, ohne); knopfTon(false); return }
      const nein = strasseMoeglich(f)
      if (nein) { setMeldung(nein); return }
      neu(i, j, { ...f, strasse: true }); knopfTon(true)
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
        const d = ((f.gleis.dreh + 1) % (w.gleis === 'doppelkurve' ? 2 : 4)) as Dreh
        setDreh(d); n = { ...f, gleis: { ...f.gleis, dreh: d } }
      } else n = { ...f, gleis: { art: w.gleis, dreh } }
    } else if (w.art === 'bruecke') {
      // eine Brücke ohne Wasser darunter; den See setzt man selbst dazu
      if (f.bruecke && f.gleis) {
        const d = ((f.gleis.dreh + 1) % 4) as Dreh
        setDreh(d); n = { ...f, gleis: { ...f.gleis, dreh: d } }
      } else { const { strasse: _, ...ohne } = f; n = { ...ohne, bruecke: true, gleis: f.gleis ?? { art: 'gerade', dreh } } }
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
    else if (f.bau) { const { bau: _, ...ohne } = f; n = ohne }
    else if (f.wagen) { const { wagen: _, ...ohne } = f; n = ohne }
    // das Gleis weg, Strasse und Fluss bleiben; dann die Strasse, dann der Fluss, dann der Grund
    else n = f.gleis ? { grund: f.grund, ...(f.strasse ? { strasse: true as const } : {}), ...(f.fluss ? { fluss: true as const } : {}) }
      : f.strasse ? { grund: f.grund, ...(f.fluss ? { fluss: true as const } : {}) } : f.fluss ? { grund: f.grund } : { grund: 'wiese' }
    // eine Strasse bleibt nur, wo sie noch möglich ist (nicht auf Wasser, Berg oder unter einer Kurve)
    if (n.strasse && strasseMoeglich(n)) { const { strasse: _, ...ohne } = n; n = ohne }
    neu(i, j, n)
    knopfTon(true)
  }

  function neu(i: number, j: number, f: Feld, merken = true) {
    setBrett(brett.map((z, jj) => (jj === j ? z.map((x, ii) => (ii === i ? f : x)) : z)), merken)
  }

  function fahren() {
    if (faehrt) { setFaehrt(false); setWagen([]); zuege.current = []; fgRef.current = null; setFahrgaeste(null); wagenZurueck(); return }
    const z = Zug.setzen(brett, undefined, wagenZahl)
    if (!z) { setMeldung('Leg zuerst ein Gleis, am besten mit einem Bahnhof.'); return }
    const l = [z]
    while (l.length < zugZahl) {
      const belegt = new Set(l.flatMap((x) => [...x.belegt()]))
      const z2 = Zug.setzen(brett, belegt, wagenZahl)
      if (!z2) break
      l.push(z2)
    }
    if (l.length < zugZahl) setMeldung(`Für ${zugZahl} Züge ist das Netz zu klein, es fahren ${l.length === 1 ? 'einer' : l.length}. Jeder braucht Platz weit weg von den anderen.`)
    else setMeldung(null)
    const bahnhoefe = [...new Set(bahnhofNamen(brett).values())]
    const fg = mitFahrgaesten ? fahrgaesteStart(bahnhoefe, l.length) : null
    if (mitFahrgaesten && !fg) setMeldung('Für Fahrgäste braucht es mindestens zwei Bahnhöfe.')
    fgRef.current = fg; setFahrgaeste(fg ? { ...fg } : null); halteRef.current = []
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
    zuege.current = l; pfiffe.current = []; dorf.current = false; setWagen(l.map((x) => x.wagen())); setFaehrt(true)
  }

  // ohne Rand (Michael, 2026-11-24: «Die dünne, graue Umrandung bei den einzelnen Elementen braucht es nicht»), eine Zeile Text
  const knopf = (an: boolean) => `flex w-[4.25rem] flex-none flex-col items-center gap-0.5 whitespace-nowrap rounded-lg px-1 py-1 text-[11px] font-medium leading-tight ${an
    ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
    : 'bg-white hover:bg-sbb-milk dark:bg-sbb-midnight dark:hover:bg-sbb-iron'}`
  const rund = 'flex size-11 flex-none items-center justify-center rounded-full border border-sbb-cloud bg-white text-lg font-bold shadow-sm hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white'
  const imBrett = ansicht === 'brett' || (ansicht === 'aufgaben' && !!aufgabe)
  const naechste = aufgabe ? AUFGABEN[AUFGABEN.indexOf(aufgabe) + 1] : undefined
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
      {!imBrett && (
        <>
          {ansicht === 'liste'
            ? <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
            : <Zurueck onClick={() => { window.location.hash = '#/gleisbau' }} text="Gleisbau" />}
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{ansicht === 'aufgaben' ? 'Gleisbau: Aufgaben' : 'Gleisbau'}</h1>
          {ansicht === 'liste' && (
            <p className="mt-2 max-w-3xl leading-relaxed">
              Lege Gleise auf ein Brett und lass den Zug fahren: auf eigenen Brettern oder mit Aufgaben, bis zu echten Strecken der Schweiz.
            </p>
          )}
          {ansicht === 'liste' && <Klappe titel="So geht's" className="mt-2 max-w-3xl"><SoGehts /></Klappe>}
          {ansicht === 'liste' && (
            <GleisbauBretter bretter={bretter} setBretter={setBretter} neu={neuesBrett} oeffnen={(id) => { window.location.hash = `#/gleisbau?id=${id}` }}
                             aufgaben={() => { window.location.hash = '#/gleisbau?aufgaben' }}
                             sterne={Object.values(fortschritt).reduce((a, c) => a + c, 0)} sterneMax={AUFGABEN.length * 3} />
          )}
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
          <div className="flex flex-none items-center gap-2 px-2.5 pb-2"
               style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', paddingLeft: 'calc(env(safe-area-inset-left) + 10px)', paddingRight: 'calc(env(safe-area-inset-right) + 10px)' }}>
            <button type="button" onClick={() => { window.location.hash = aufgabe ? '#/gleisbau?aufgaben' : '#/gleisbau' }} aria-label={aufgabe ? 'Zurück zu den Aufgaben' : 'Zurück zur Liste der Bretter'}
                    className={rund}><span className="pfeil pfeil-links" aria-hidden="true">←</span></button>
            <p className="min-w-0 flex-1 truncate font-bold">{aufgabe ? aufgabe.titel : bretter.find((x) => x.id === offen)?.name ?? 'Brett'}</p>
            {/* die Uhr des Taktfahrplans */}
            {takt > 0 && faehrt && <span className="flex-none rounded-lg bg-sbb-anthracite px-2 py-1 font-bold tabular-nums text-white dark:bg-sbb-white dark:text-sbb-black" aria-label={`Uhrzeit im Spiel ${uhrText(spielSek.current)}`}>{uhrText(spielSek.current)}</span>}
            <button type="button" disabled={faehrt || !verlauf.length} onClick={zurueck} aria-label={`Rückgängig, noch ${verlauf.length} Schritte`} title="Rückgängig"
                    className={`${rund} relative`}>
              ↶{verlauf.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-sbb-anthracite px-1 text-[11px] font-bold leading-5 text-white tabular-nums dark:bg-sbb-white dark:text-sbb-black">{verlauf.length > 99 ? '99+' : verlauf.length}</span>}
            </button>
            <button type="button" disabled={faehrt} onClick={() => setDreh(((dreh + 1) % 4) as Dreh)} aria-label="Stück drehen" title="Drehen" className={rund}>↻</button>
            <button type="button" onClick={() => setMenu(true)} aria-label="Menü" title="Menü" className={rund}>⋯</button>
            <button type="button" onClick={fahren} aria-label={faehrt ? 'Anhalten' : 'Fahren'} title={faehrt ? 'Anhalten' : 'Fahren'}
                    className="flex h-11 flex-none items-center gap-1.5 rounded-full bg-sbb-red px-4 font-bold text-white shadow-sm hover:bg-sbb-red125">
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">{faehrt ? <rect x="6" y="6" width="12" height="12" rx="1.5" /> : <path d="M8 5.5v13l11-6.5z" />}</svg>
              <span className="hidden sm:inline">{faehrt ? 'Anhalten' : 'Fahren'}</span>
            </button>
          </div>
          {aufgabe && (
            <div className="mx-2.5 mb-2 flex flex-none items-start gap-3 rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-sbb-charcoal">
              <button type="button" onClick={() => setZielOffen((x) => !x)} aria-expanded={zielOffen}
                      className={`min-w-0 flex-1 text-left text-sm leading-snug ${zielOffen ? '' : 'line-clamp-2'}`}>{aufgabe.ziel}</button>
              <div className="flex flex-none flex-col items-end gap-1">
                <Sterne n={fortschritt[aufgabe.id] ?? 0} />
                <button type="button" onClick={() => { const e = bewerten(aufgabe, brett); setErgebnis(e); setMeldung(e.ok ? null : e.text) }}
                        className="rounded-lg bg-sbb-red px-3 py-1 text-sm font-bold text-white hover:bg-sbb-red125">Prüfen</button>
              </div>
            </div>
          )}
          <div ref={buehne} className="relative min-h-0 flex-1 touch-none overflow-hidden"
               onPointerDown={buehneDrucken} onPointerMove={buehneBewegen} onPointerUp={buehneLos} onPointerCancel={buehneLos} onWheel={buehneRad}>
            <div className="absolute inset-0 px-2.5" style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`, transformOrigin: '0 0' }}>
        <svg ref={svg} viewBox={`-0.15 -0.15 ${SP + 0.3} ${ZE + 0.3}`} role="img" aria-label={`Spielbrett mit ${SP} × ${ZE} Feldern`}
             onClick={feldAn} onPointerDown={drucken} onPointerMove={bewegen} onPointerUp={loslassen}
             onPointerCancel={() => { druck.current = null; setZiehen(null); linieRef.current = null; setLinie(null) }} onContextMenu={(e) => e.preventDefault()}
             className="size-full cursor-pointer select-none [-webkit-touch-callout:none]">
          <rect x={-0.15} y={-0.15} width={SP + 0.3} height={ZE + 0.3} rx={0.14} fill={F.tablett} />
          {unten}
          {wagen.flatMap((l, z) => l.slice().reverse().map((w, k) => <WagenBild key={`${z}-${k}`} w={w} tunnel={imTunnel(brett, w.x, w.y) || (() => { const f = brett[Math.floor(w.y)]?.[Math.floor(w.x)]; return bauGilt(f) && f!.bau !== 'gueter' })()} farbe={z ? ZUG_FARBEN[(z - 1) % ZUG_FARBEN.length] : F.karmin} />))}
          {oben}
          <SchrankenBild brett={brett} wagen={wagen.flat()} />
          {/* abgestellte Wagen, längs zum Gleis */}
          {brett.flatMap((z, j) => z.map((f, i) => f.wagen && wagenGilt(f)
            ? <WagenBild key={`a${i},${j}`} w={{ x: i + 0.5, y: j + 0.5, w: f.gleis!.dreh % 2 ? 0 : Math.PI / 2, art: 1, vorne: false }} tunnel={false} /> : null))}
          <AmpelBild brett={brett} />
          <SchildBild namen={namen} titel={titel} knoten={knotenSet} takt={takt} />
          {fahrgaeste && <WartendeBild namen={namen} warten={fahrgaeste.warten} />}
          {faehrt && wagen.length > 1 && <SignalBild brett={brett} belegt={zuege.current.map((z) => z.belegt())} />}
          {!faehrt && enden.map((e, k) => (
            <g key={`e${k}`} pointerEvents="none">
              <circle cx={e.x - [0, 1, 0, -1][e.k] * 0.06} cy={e.y - [-1, 0, 1, 0][e.k] * 0.06} r={0.065} fill={F.karmin} stroke="#ffffff" strokeWidth={0.02} />
            </g>
          ))}
          {linie && (
            <path pointerEvents="none" d={linie.map(([i, j], k) => `${k ? 'L' : 'M'}${i + 0.5},${j + 0.5}`).join('')} fill="none" stroke={F.karmin}
                  strokeWidth={0.14} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
          )}
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
        </svg>
            </div>
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
          <div className="flex-none border-t border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-charcoal"
               style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
            {faehrt ? (
              <div className="flex min-h-[7.25rem] flex-col justify-center gap-1 px-3 py-2 text-sm">
                {fahrgaeste ? (
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-bold">Gebracht: <span className="tabular-nums">{fahrgaeste.gebracht}</span></span>
                    {fahrgaeste.imZug.map((l, k) => (
                      <span key={k} className="flex items-center gap-1">
                        {fahrgaeste.imZug.length > 1 ? `Zug ${k + 1}` : 'Im Zug'}: {l.length ? l.map((z, m) => <Ziel key={m} z={z} />) : <span className="text-sbb-metal dark:text-sbb-storm">leer</span>}
                      </span>
                    ))}
                  </p>
                ) : <p className="font-bold">Der Zug fährt.</p>}
                <p className="text-sbb-metal dark:text-sbb-storm">Ein Tipp auf eine Weiche oder Ampel stellt sie, ein Tipp auf einen Zug zeigt Wagen und Richtung. Zum Bauen anhalten.{takt > 0 && !knotenSet.size ? ' Für den Takt fehlt ein Knoten: unter Bauwerke «Knoten» auf einen Bahnhof.' : ''}</p>
              </div>
            ) : (
              <>
                <div className="flex gap-1 px-2 pt-1.5" role="tablist" aria-label="Werkzeuge">
                  {GRUPPEN.map((g) => (
                    <button key={g.titel} type="button" role="tab" aria-selected={reiter === g.titel} onClick={() => setReiter(g.titel)}
                            className={`rounded-lg px-3 py-1 text-sm font-bold ${reiter === g.titel ? 'bg-sbb-milk dark:bg-sbb-midnight' : 'text-sbb-metal dark:text-sbb-storm'}`}>{g.titel}</button>
                  ))}
                </div>
                <div className="flex gap-1.5 overflow-x-auto px-2 pb-1 pt-1.5 [scrollbar-width:none]">
                  {GRUPPEN.find((g) => g.titel === reiter)!.l.filter(({ w }) => takt > 0 || w.art !== 'knoten').map(({ w, text }) => (
                    <button key={text} type="button" aria-pressed={gleich(w, werkzeug)} onClick={() => setWerkzeug(w)} className={knopf(gleich(w, werkzeug))}>
                      <WerkzeugBild w={w} dreh={dreh} />
                      {text}
                    </button>
                  ))}
                </div>
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
              if (!zuege.current.length) { setFaehrt(false); setWagen([]); fgRef.current = null; setFahrgaeste(null); wagenZurueck(); return }
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
                  <div className="mt-2 flex min-h-12 items-center justify-between gap-3">
                    <span>Wagen<span className="block text-xs text-sbb-metal">zwischen Lok und Steuerwagen</span></span>
                    <span className="flex items-center gap-2">
                      <button type="button" aria-label="Ein Wagen weniger" disabled={n <= WAGEN_MIN} onClick={() => { zugWahl.fahrzeugeSetzen(brettRef.current, n - 1); setWagen(zuege.current.map((x) => x.wagen())); knopfTon(true) }} className={rund}>−</button>
                      <span className="w-6 text-center text-lg font-bold tabular-nums">{n - 2}</span>
                      <button type="button" aria-label="Ein Wagen mehr" disabled={n >= WAGEN_MAX} onClick={() => { zugWahl.fahrzeugeSetzen(brettRef.current, n + 1); setWagen(zuege.current.map((x) => x.wagen())); knopfTon(true) }} className={rund}>+</button>
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => { zugWahl.wenden(); setWagen(zuege.current.map((x) => x.wagen())); knopfTon(true); zu() }}
                            className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight">Fahrtrichtung ändern</button>
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
                    <span>Anzahl Züge{faehrt && <span className="block text-xs text-sbb-metal">gilt ab der nächsten Fahrt</span>}</span>
                    <span className="flex items-center gap-2">
                      <button type="button" aria-label="Ein Zug weniger" disabled={zugZahl <= 1} onClick={() => zugZahlSetzen(zugZahl - 1)} className={rund}>−</button>
                      <span className="w-6 text-center text-lg font-bold tabular-nums">{zugZahl}</span>
                      <button type="button" aria-label="Ein Zug mehr" disabled={zugZahl >= ZUEGE_MAX} onClick={() => zugZahlSetzen(zugZahl + 1)} className={rund}>+</button>
                    </span>
                  </div>
                  <div className="py-2">
                    <span>Taktfahrplan<span className="block text-xs text-sbb-metal">An Knoten fahren die Züge zur Taktzeit ab; eine Minute im Spiel dauert eine Sekunde</span></span>
                    <div className="segmente mt-1.5 grid grid-cols-4">
                      {TAKT_WAHL.map((t) => (
                        <button key={t} type="button" aria-pressed={takt === t} disabled={faehrt} onClick={() => { taktSetzen(t); if (t && !takt) setReiter('Bauwerke') }}
                                className="segment px-2 py-2 disabled:opacity-40">{t ? `${t} Min.` : 'Aus'}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <span>Länge des Zugs<span className="block text-xs text-sbb-metal">Lok, {wagenZahl - 2 === 1 ? '1 Wagen' : `${wagenZahl - 2} Wagen`} und Steuerwagen{faehrt ? ', gilt ab der nächsten Fahrt' : ''}</span></span>
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
                    ? <button type="button" disabled={faehrt} onClick={() => { aufgabeWaehlen(aufgabe); setMenu(false) }}
                              className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">Neu beginnen</button>
                    : <button type="button" disabled={faehrt} onClick={() => { setBrett(zufallsBeispiel(SP, ZE)); setMeldung(null); setMenu(false) }}
                              className="min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">Beispiel</button>}
                  {leerenKnopf}
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
                <div className="flex flex-wrap justify-center gap-2">
                  {naechste && <button type="button" autoFocus onClick={() => { window.location.hash = `#/gleisbau?aufgabe=${encodeURIComponent(naechste.id)}` }}
                                       className="rounded-lg bg-sbb-red px-5 py-3 font-bold text-white hover:bg-sbb-red125">Nächste Aufgabe</button>}
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
      <li>Wähle unten ein Stück und tippe ein Feld an, nochmals tippen dreht es. Mit «Linie ziehen» fährst du mit dem Finger über die Felder,
        Geraden, Kurven und Weichen entstehen von selbst.</li>
      <li>Gleis auf Wasser wird zur Brücke, auf einem Berg zum Tunnel; «Brücke» baut eine Brücke auch ohne Wasser, den See setzt du selbst darunter.
        Eine Strasse über eine Gerade wird zum Bahnübergang mit Schranken. Bei einer roten Ampel wartet der Zug, ein Tipp stellt sie auf Grün.</li>
      <li>Im Depot fährt der Zug ab, am Güterschuppen hält er zum Laden, unter der Galerie fährt er gedeckt. Kirche und Bauernhof stehen allein in einem Feld ohne Gleis.</li>
      <li>Ein Fluss fliesst zu Nachbarn mit Fluss oder Wasser, ein Gleis darüber wird zur Brücke. Ein abgestellter Wagen wird angekuppelt, wenn ein Zug hineinfährt; abstellen geht mit einem Tipp auf den Zug. Nach der Fahrt stehen die Wagen wieder am alten Platz.</li>
      <li>Taktfahrplan im Menü (15, 30 oder 60 Minuten): Oben läuft eine Uhr, eine Minute im Spiel dauert eine Sekunde. Unter Bauwerke macht «Knoten» einen Bahnhof zum Knoten; dort fährt jeder Zug zur nächsten Taktzeit ab. Kommen zwei Züge zur selben Abfahrt, haben sie Anschluss. Baue die Strecke so, dass die Züge kurz vor der Taktzeit ankommen, wie bei Bahn 2000.</li>
      <li>Ein Bahnhof auf einer Kurve wird zum Bahnhof in der Kurve, Bahnhöfe nebeneinander sind ein Bahnhof. Mit «Name» gibst du ihm den Namen
        eines echten Bahnhofs.</li>
      <li>Lange drücken und ziehen verschiebt ein Feld; liegt am Ziel etwas, tauschen die beiden. Rote Punkte zeigen, wo ein Gleis offen endet.
        Mit zwei Fingern zoomst und verschiebst du das Brett, am Computer mit dem Mausrad.</li>
      <li>▶ Fahren: Der Zug hält an jedem Bahnhof und kehrt am Ende eines Gleises um, ein Tipp stellt die Weichen. Im Menü «⋯»: Fahrgäste mit
        Ziel, bis vier Züge (Signale an den Weichen zeigen, wo ein Zug ist, keiner fährt in ein besetztes Feld), Grösse, Beispiel, Leeren und Teilen.</li>
    </ul>
  )
}
