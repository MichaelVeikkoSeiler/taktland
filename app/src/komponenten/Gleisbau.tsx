import { useEffect, useMemo, useRef, useState } from 'react'
import { abfahrtsPfiff, antwortTon, kirchenSchlag, knopfTon, zuggeraeuschAus, zuggeraeuschTempo } from '../audio'
import {
  type Brett, brettAusCode, type Gleis, bahnhofGruppen, bahnhofNamen, bahnhofTitel, beispiel, brettLesen, brettMerken, type Dreh, type Feld, type GleisArt, GROESSEN, groesseAendern, type Grund, leer,
  anfangZumGriff, grossAnfang, grosseEntfernen, grosseKurve, grosseLegen, grossGeometrie, istBahnhof, istWeiche, linieLegen, offeneEnden, strasseMoeglich, spalten, type Stueck, stueckLaenge, stueckPunkt, tunnelWeiter, tunnelWeiterAnKante, verschieben, type WagenLage, WAGEN_LAENGE, wege, wegPunkte, zeilen, Zug, zufallsBeispiel,
} from '../gleisbau'
import { Zurueck } from './Zurueck'
import { indexLaden } from '../daten'
import { type Fahrgaeste, fahrgaesteHalt, fahrgaesteStart, fahrgaesteZeit } from '../gleisbauFahrgaeste'
import GleisbauBretter from './GleisbauBretter'
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
const KANTE = { wiese: '#9fc47a', wald: '#89b56a', wasser: '#336fb0', berg: '#a9b19d', dorf: '#9fc47a' }
const KACHEL_H = 0.915

type Werkzeug =
  | { art: 'linie' } | { art: 'name' } | { art: 'gleis'; gleis: GleisArt } | { art: 'tunnel' } | { art: 'bruecke' } | { art: 'grund'; grund: Grund } | { art: 'strasse' } | { art: 'weg' }

const GLEISE: Array<{ w: Werkzeug; text: string }> = [
  { w: { art: 'linie' }, text: 'Linie ziehen' },
  { w: { art: 'gleis', gleis: 'gerade' }, text: 'Gerade' },
  { w: { art: 'gleis', gleis: 'kurve' }, text: 'Kurve' },
  { w: { art: 'gleis', gleis: 'bogen2' }, text: 'Kurve 2 × 2' },
  { w: { art: 'gleis', gleis: 'bogen3' }, text: 'Kurve 3 × 3' },
  { w: { art: 'gleis', gleis: 'weiche' }, text: 'Weiche' },
  { w: { art: 'gleis', gleis: 'dreiweg' }, text: 'Dreiweg' },
  { w: { art: 'gleis', gleis: 'kreuzung' }, text: 'Kreuzung' },
  { w: { art: 'gleis', gleis: 'prellbock' }, text: 'Prellbock' },
  { w: { art: 'gleis', gleis: 'bahnhof' }, text: 'Bahnhof' },
  { w: { art: 'name' }, text: 'Name' },
  { w: { art: 'tunnel' }, text: 'Tunnel' },
  { w: { art: 'bruecke' }, text: 'Brücke' },
]
const LANDSCHAFT: Array<{ w: Werkzeug; text: string }> = [
  { w: { art: 'grund', grund: 'wiese' }, text: 'Wiese' },
  { w: { art: 'grund', grund: 'wald' }, text: 'Wald' },
  { w: { art: 'grund', grund: 'wasser' }, text: 'Wasser' },
  { w: { art: 'grund', grund: 'berg' }, text: 'Berg' },
  { w: { art: 'grund', grund: 'dorf' }, text: 'Dorf' },
  { w: { art: 'strasse' }, text: 'Strasse' },
  { w: { art: 'weg' }, text: 'Entfernen' },
]

const gleich = (a: Werkzeug, b: Werkzeug) => JSON.stringify(a) === JSON.stringify(b)

/** nach so vielen Sekunden gegenseitigen Wartens kehrt ein Zug um; Spitze des zweiten Zugs in Blau statt Karmin (beides gewählt) */
const UMKEHREN_NACH_S = 2.5, ZWEITER_ZUG = '#1f5fa8'

/**
 * Signale an Weichen und Kreuzungen, nur mit zwei Zügen: rot, solange ein Zug das Feld belegt, sonst grün; ein kleiner Mast in der Ecke oben links
 * (gewählt). Ein Zug fährt nie in ein belegtes Feld ein
 */
function SignalBild({ brett, belegt }: { brett: Brett; belegt: Array<Set<string>> }) {
  const raus = []
  for (let j = 0; j < zeilen(brett); j++) for (let i = 0; i < spalten(brett); i++) {
    const g = brett[j][i].gleis
    if (!g || !(istWeiche(g) || g.art === 'kreuzung')) continue
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
function SchildBild({ namen, titel }: { namen: Map<string, string>; titel: Map<string, string> }) {
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
    : f.grund === 'dorf' ? [o('gb_obj_haus_02', 0.3, 0.5, 0.38), o('gb_obj_haus_05', 0.66, 0.85, 0.4)] : []
  const gebiet = (fill: string, e: number) => <rect x={i + e} y={j + e} width={1 - 2 * e} height={KACHEL_H - 2 * e} rx={0.18} fill={fill} />
  return (
    <g>
      <clipPath id={`gb-knopf-${f.grund}`}><rect x={i + 0.025} y={j + 0.025} width={0.95} height={KACHEL_H} rx={0.05} /></clipPath>
      <g clipPath={`url(#gb-knopf-${f.grund})`}>
        <image href={bild('gb_grund_wiese_01')} x={i} y={j} width={1} height={1} preserveAspectRatio="none" />
        {f.grund === 'wald' && gebiet('url(#gb-wald)', 0.07)}
        {f.grund === 'berg' && gebiet('url(#gb-fels)', 0.07)}
        {f.grund === 'wasser' && <>{gebiet('#d8cf9a', 0.06)}{gebiet('url(#gb-wasser)', 0.12)}</>}
      </g>
      {objekte.map((x, k) => <ObjektBild key={k} o={x} />)}
    </g>
  )
}

/** ein Feld: die Fläche und, ohne «nurFlaeche», seine Landschaft für sich allein (auf den Knöpfen) */
function GrundBild({ f, i, j, nurFlaeche = false }: { f: Feld; i: number; j: number; nurFlaeche?: boolean }) {
  const grundFarbe = f.grund === 'wald' ? F.wald : f.grund === 'wasser' ? F.wasser : f.grund === 'berg' ? F.berg : F.wiese
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
      {f.grund === 'wasser' && punkte.map(({ p }, k) => (
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
          <path d={linie(p)} fill="none" stroke={f.grund === 'wasser' ? 'none' : F.schotter} strokeWidth={0.3} />
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
            return teil.length > 1 ? <path key={`d${k}`} d={linie(teil)} fill="none" stroke="url(#gb-fels)" strokeWidth={0.52} /> : null
          })}
          {/* das Portal zeigt zur Kante hinaus, an der das Gleis den Berg verlässt */}
          {punkte.map(({ s }, k) => [0, 1].map((e) => {
            const kant = e === 0 ? s.ein : s.aus
            if (kant < 0 || weiter[kant]) return null
            const l = stueckLaenge(s), q = stueckPunkt(s, e === 0 ? PORTAL : l - PORTAL)
            return <PortalBild key={`${k}${e}`} x={q.x} y={q.y} fx={[0, 1, 0, -1][kant]} fy={[-1, 0, 1, 0][kant]} />
          }))}
        </>
      )}
      {name && (
        <g>
          <rect x={i + 0.06} y={j + 0.06} width={0.2} height={0.2} rx={0.03} fill="#3d3d3d" />
          <text x={i + 0.16} y={j + 0.215} fontSize={0.15} fontWeight={700} textAnchor="middle" fill="#ffffff">{name}</text>
        </g>
      )}
    </g>
  )
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
            {[t.portal0 && bei(t.k0), t.portal1 && bei(t.k1)].map((q, m) => q ? (
              <PortalBild key={m} x={q.x} y={q.y} fx={(m ? 1 : -1) * Math.cos(q.w)} fy={(m ? 1 : -1) * Math.sin(q.w)} />
            ) : null)}
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
        <text x={0.5} y={0.32} fontSize={0.2} fontWeight={700} textAnchor="middle" fill="#ffffff">Bern</text>
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
    : w.art === 'bruecke' ? { grund: 'wasser', gleis: { art: 'gerade', dreh } }
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
  const [brett, setBrettRoh] = useState<Brett>(() => brettLesen() ?? beispiel())
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
  // ein oder zwei Züge (Michael, 2026-11-23, Vorschlag «Zweiter Zug auf demselben Netz»)
  const [zweiZuege, setZweiZuege] = useState(false)
  // Fahrgäste mit Ziel an den Bahnhöfen (Michael, 2026-11-23, Vorschlag «Fahrgäste»), am Anfang an
  const [mitFahrgaesten, setMitFahrgaesten] = useState(true)
  const [fahrgaeste, setFahrgaeste] = useState<Fahrgaeste | null>(null)
  const fgRef = useRef<Fahrgaeste | null>(null)
  const halteRef = useRef<number[]>([])
  const [meldung, setMeldung] = useState<string | null>(null)
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
  brettRef.current = brett
  const svg = useRef<SVGSVGElement>(null)
  const namen = useMemo(() => bahnhofNamen(brett), [brett])
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
                                                     wasser={(u, v) => brett[v]?.[u]?.grund === 'wasser'} brett={brett} />))}
    </>
  ), [brett, namen])
  const oben = useMemo(() => objekteBauen(brett, imTunnel).map((o, k) => <ObjektBild key={k} o={o} />), [brett])
  // offene Gleisenden als roter Punkt, beim Bauen (Michael, 2026-11-23, Vorschlag «Anzeige, wo das Gleis offen endet»)
  const enden = useMemo(() => offeneEnden(brett), [brett])

  useEffect(() => { brettMerken(brett) }, [brett])
  // ein geteilter Link #/gleisbau?brett=…: das Brett öffnen (ein Schritt zum Zurücknehmen), danach die Adresse ohne Brett
  useEffect(() => {
    const lesen = () => {
      const code = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('brett')
      if (!code) return
      const b = brettAusCode(code)
      history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}#/gleisbau`)
      if (!b) { setMeldung('Der Link enthält kein gültiges Brett.'); return }
      setFaehrt(false); zuege.current = []; setWagen([])
      setVerlauf((v) => [...v, brettRef.current]); setBrettRoh(b); setMeldung('Geteiltes Brett geöffnet. «Zurück» holt dein vorheriges.')
    }
    lesen()
    window.addEventListener('hashchange', lesen)
    return () => window.removeEventListener('hashchange', lesen)
  }, [])
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
      letzt = jetzt
      // je Zug ein Schritt; ein Zug fährt nur in Felder ein, die der andere nicht belegt (wie vor einem roten Signal); warten beide aufeinander,
      // kehrt der um, der länger wartet
      const zz = zuege.current
      zz.forEach((z, k) => {
        const andere = zz.filter((_, m) => m !== k)
        z.schritt(brettRef.current, dt,
          andere.length ? (felder) => andere.every((o) => { const b = o.belegt(); return [...felder].every((f) => !b.has(f)) }) : undefined,
          () => z.wartet > UMKEHREN_NACH_S && andere.some((o) => o.wartet > 0.5) && andere.every((o) => o.wartet <= z.wartet))
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
        const ort = f?.gleis && !grosseKurve(f.gleis) ? (f.grund === 'berg' ? 'tunnel' : f.grund === 'wasser' ? 'bruecke' : null) : null
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
    const r = svg.current!.getBoundingClientRect()
    const i = Math.floor(((x - r.left) / r.width) * (SP + 0.3) - 0.15), j = Math.floor(((y - r.top) / r.height) * (ZE + 0.3) - 0.15)
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
        else if (!neu.some(([a, c]) => a === schritt[0] && c === schritt[1])) neu = [...neu, schritt]
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
      if (!istWeiche(f.gleis)) { setMeldung('Während der Fahrt lassen sich nur Weichen stellen. Zum Bauen «Anhalten».'); return }
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
      const grund: Grund = w.art === 'grund' ? w.grund : w.art === 'tunnel' ? 'berg' : 'wasser'
      neu(i, j, { ...f, grund }); knopfTon(true)
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
        const d = ((f.gleis.dreh + 1) % 4) as Dreh
        setDreh(d); n = { ...f, gleis: { ...f.gleis, dreh: d } }
      } else n = { ...f, gleis: { art: w.gleis, dreh } }
    } else if (w.art === 'tunnel' || w.art === 'bruecke') {
      const grund: Grund = w.art === 'tunnel' ? 'berg' : 'wasser'
      if (f.grund === grund && f.gleis) {
        const d = ((f.gleis.dreh + 1) % 4) as Dreh
        setDreh(d); n = { ...f, gleis: { ...f.gleis, dreh: d } }
      } else n = { grund, gleis: f.gleis ?? { art: 'gerade', dreh } }
    } else if (w.art === 'grund') n = { ...f, grund: w.grund }
    // Entfernen: zuerst das Gleis (die Strasse bleibt), dann die Strasse, dann der Grund
    else n = f.gleis ? (f.strasse ? { grund: f.grund, strasse: true } : { grund: f.grund }) : f.strasse ? { grund: f.grund } : { grund: 'wiese' }
    // eine Strasse bleibt nur, wo sie noch möglich ist (nicht auf Wasser, Berg oder unter einer Kurve)
    if (n.strasse && strasseMoeglich(n)) { const { strasse: _, ...ohne } = n; n = ohne }
    neu(i, j, n)
    knopfTon(true)
  }

  function neu(i: number, j: number, f: Feld, merken = true) {
    setBrett(brett.map((z, jj) => (jj === j ? z.map((x, ii) => (ii === i ? f : x)) : z)), merken)
  }

  function fahren() {
    if (faehrt) { setFaehrt(false); setWagen([]); zuege.current = []; fgRef.current = null; setFahrgaeste(null); return }
    const z = Zug.setzen(brett)
    if (!z) { setMeldung('Leg zuerst ein Gleis, am besten mit einem Bahnhof.'); return }
    const l = [z]
    if (zweiZuege) {
      const z2 = Zug.setzen(brett, z.belegt())
      if (z2) l.push(z2)
      else setMeldung('Für einen zweiten Zug ist das Netz zu klein: Er braucht Platz weit weg vom ersten.')
    }
    if (l.length === 2 || !zweiZuege) setMeldung(null)
    const bahnhoefe = [...new Set(bahnhofNamen(brett).values())]
    const fg = mitFahrgaesten ? fahrgaesteStart(bahnhoefe, l.length) : null
    if (mitFahrgaesten && !fg) setMeldung('Für Fahrgäste braucht es mindestens zwei Bahnhöfe.')
    fgRef.current = fg; setFahrgaeste(fg ? { ...fg } : null); halteRef.current = []
    zuege.current = l; pfiffe.current = []; dorf.current = false; setWagen(l.map((x) => x.wagen())); setFaehrt(true)
  }

  const knopf = (an: boolean) => `flex w-[4.6rem] flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-xs font-medium ${an
    ? 'border-sbb-anthracite bg-sbb-anthracite text-white dark:border-sbb-white dark:bg-sbb-white dark:text-sbb-black'
    : 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white'}`

  const leiste = (titel: string, l: Array<{ w: Werkzeug; text: string }>) => (
    <div className="mt-4">
      <h2 className="text-sm font-bold">{titel}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {l.map(({ w, text }) => (
          <button key={text} type="button" aria-pressed={gleich(w, werkzeug)} disabled={faehrt}
                  onClick={() => setWerkzeug(w)} className={`${knopf(gleich(w, werkzeug))} disabled:opacity-40`}>
            <WerkzeugBild w={w} dreh={dreh} />
            {text}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="px-4 pb-6">
      <MusterDefs />
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Gleisbau</h1>
      <p className="mt-2 max-w-3xl leading-relaxed">
        Wähle unten ein Stück und tippe ein Feld an, oder «Linie ziehen» und fahre mit dem Finger über die Felder. Nochmals tippen dreht es. Gleis auf Wasser wird zur Brücke, auf einem Berg zum Tunnel.
        Ein Bahnhof auf einer Kurve wird zum Bahnhof in der Kurve; mit «Name» gibst du ihm den Namen eines echten Bahnhofs. Lange drücken und ziehen verschiebt ein Feld; liegt am Ziel etwas, tauschen die beiden.
        Bahnhöfe nebeneinander sind ein Bahnhof. Rote Punkte zeigen, wo ein Gleis offen endet. Eine Strasse über eine Gerade wird zum Bahnübergang mit Schranken. Dann «Fahren» (mit «2 Züge» fahren zwei; Signale an den Weichen zeigen, wo ein Zug ist, und keiner fährt in ein besetztes Feld): Mit «Fahrgäste» warten an den Bahnhöfen Figuren mit dem Buchstaben ihres Ziels; der Zug nimmt sie mit und bringt sie hin. Der Zug hält an jedem Bahnhof und kehrt am Ende eines Gleises um. Während der Fahrt stellt ein Tipp die Weichen.
      </p>
      <div className={`mt-4 ${SP > 8 ? 'max-w-5xl' : 'max-w-3xl'}`}>
        <svg ref={svg} viewBox={`-0.15 -0.15 ${SP + 0.3} ${ZE + 0.3}`} role="img" aria-label={`Spielbrett mit ${SP} × ${ZE} Feldern`}
             onClick={feldAn} onPointerDown={drucken} onPointerMove={bewegen} onPointerUp={loslassen}
             onPointerCancel={() => { druck.current = null; setZiehen(null); linieRef.current = null; setLinie(null) }} onContextMenu={(e) => e.preventDefault()}
             className={`w-full cursor-pointer select-none [-webkit-touch-callout:none] ${werkzeug.art === 'linie' && !faehrt ? 'touch-none' : ''}`}>
          <rect x={-0.15} y={-0.15} width={SP + 0.3} height={ZE + 0.3} rx={0.14} fill={F.tablett} />
          {unten}
          {wagen.flatMap((l, z) => l.slice().reverse().map((w, k) => <WagenBild key={`${z}-${k}`} w={w} tunnel={imTunnel(brett, w.x, w.y)} farbe={z ? ZWEITER_ZUG : F.karmin} />))}
          {oben}
          <SchrankenBild brett={brett} wagen={wagen.flat()} />
          <SchildBild namen={namen} titel={titel} />
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
      {nameFeld && (
        <div className="mt-3 max-w-xl rounded-lg bg-sbb-milk p-3 dark:bg-sbb-charcoal">
          <label className="text-sm font-bold" htmlFor="gleisbau-name">Name für Bahnhof {bahnhofGruppen(brett).get(`${nameFeld[0]},${nameFeld[1]}`)}</label>
          <input id="gleisbau-name" value={nameSuche} onChange={(e) => setNameSuche(e.target.value)} autoFocus placeholder="Bahnhof aus Taktland suchen"
                 className="mt-2 w-full rounded-lg border border-sbb-cloud bg-white px-3 py-2 dark:border-sbb-iron dark:bg-sbb-midnight" />
          {!alleNamen && <p className="mt-2 text-sm">Bahnhöfe werden geladen …</p>}
          {treffer.length > 0 && (
            <ul className="mt-2 space-y-1">
              {treffer.map((n) => (
                <li key={n}><button type="button" onClick={() => nameSetzen(n)} className="kachel-link kachel w-full px-3 py-2 text-left">{n}</button></li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-3">
            <button type="button" onClick={() => nameSetzen(null)} className="underline underline-offset-2">Ohne Namen</button>
            <button type="button" onClick={() => { setNameFeld(null); setNameSuche('') }} className="underline underline-offset-2">Abbrechen</button>
          </div>
        </div>
      )}
      {fahrgaeste && (
        <p role="status" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-bold">Gebracht: <span className="tabular-nums">{fahrgaeste.gebracht}</span></span>
          {fahrgaeste.imZug.map((l, k) => (
            <span key={k} className="flex items-center gap-1">
              {fahrgaeste.imZug.length > 1 ? `Zug ${k + 1}` : 'Im Zug'}: {l.length ? l.map((z, m) => <Ziel key={m} z={z} />) : <span className="text-sbb-metal dark:text-sbb-storm">leer</span>}
            </span>
          ))}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={fahren}
                className="min-h-12 rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125">{faehrt ? 'Anhalten' : 'Fahren'}</button>
        <button type="button" disabled={faehrt} aria-pressed={mitFahrgaesten} onClick={() => setMitFahrgaesten((x) => !x)}
                className={`min-h-12 rounded-lg border px-4 font-bold disabled:opacity-40 ${mitFahrgaesten
                  ? 'border-sbb-anthracite bg-sbb-anthracite text-white dark:border-sbb-white dark:bg-sbb-white dark:text-sbb-black'
                  : 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight'}`}>
          Fahrgäste
        </button>
        <button type="button" disabled={faehrt} aria-pressed={zweiZuege} onClick={() => setZweiZuege((x) => !x)}
                className={`min-h-12 rounded-lg border px-4 font-bold disabled:opacity-40 ${zweiZuege
                  ? 'border-sbb-anthracite bg-sbb-anthracite text-white dark:border-sbb-white dark:bg-sbb-white dark:text-sbb-black'
                  : 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight'}`}>
          2 Züge
        </button>
        <button type="button" disabled={faehrt || !verlauf.length} onClick={zurueck} aria-label={`Rückgängig, noch ${verlauf.length} Schritte`}
                className="min-h-12 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">
          ↶ Zurück{verlauf.length ? <span className="ml-1 text-sm font-medium tabular-nums text-sbb-metal dark:text-sbb-storm">{verlauf.length}</span> : null}
        </button>
        <button type="button" disabled={faehrt} onClick={() => setDreh(((dreh + 1) % 4) as Dreh)}
                className="min-h-12 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">
          Drehen ↻
        </button>
        {/* jedes Tippen ein neues Beispiel in der gewählten Grösse (Michael, 2026-11-22: «Bei Beispiel sollen durch weiteres Tippen immer neue Beispiele erscheinen») */}
        <button type="button" disabled={faehrt} onClick={() => { setBrett(zufallsBeispiel(SP, ZE)); setMeldung(null) }}
                className="min-h-12 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">
          Beispiel
        </button>
        <button type="button" disabled={faehrt} onClick={() => {
          if (!leerenScharf) { setLeerenScharf(true); return }
          setLeerenScharf(false); setBrett(leer(SP, ZE))
        }} className={`min-h-12 rounded-lg border px-4 font-bold disabled:opacity-40 ${leerenScharf
          ? 'border-sbb-red bg-sbb-red text-white' : 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight'}`}>
          {leerenScharf ? 'Wirklich leeren?' : 'Leeren'}
        </button>
      </div>
      {/* Grösse des Bretts (Michael, 2026-11-22: «auch Anzahl Kacheln sollen wählbar sein»): was oben links Platz hat, bleibt */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">Brett</span>
        {GROESSEN.map(([sp, ze]) => {
          const an = sp === SP && ze === ZE
          return (
            <button key={`${sp}x${ze}`} type="button" aria-pressed={an} disabled={faehrt}
                    onClick={() => { if (!an) { setBrett(groesseAendern(brett, sp, ze)); setMeldung(null) } }}
                    className={`rounded-lg border px-3 py-2 text-sm font-bold tabular-nums disabled:opacity-40 ${an
                      ? 'border-sbb-anthracite bg-sbb-anthracite text-white dark:border-sbb-white dark:bg-sbb-white dark:text-sbb-black'
                      : 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white'}`}>
              {sp} × {ze}
            </button>
          )
        })}
      </div>
      {meldung && <p role="status" className="mt-3 rounded-lg bg-sbb-milk px-3 py-2 text-sm font-medium dark:bg-sbb-charcoal">{meldung}</p>}
      {leiste('Gleise und Bauwerke', GLEISE)}
      {leiste('Landschaft', LANDSCHAFT)}
      <GleisbauBretter brett={brett} gesperrt={faehrt} oeffnen={(b, name) => { setBrett(b); setMeldung(`«${name}» geöffnet.`); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
      <p className={`mt-5 max-w-3xl ${LEISE}`}>
        Ein Baukasten, keine Wirklichkeit: Kacheln, Zug, Tempo und Halte sind gezeichnet und gewählt. Deine Bretter bleiben im Browser dieses
        Geräts und werden nicht gesendet, ausser du teilst einen Link. Bald: Aufgaben.
      </p>
    </div>
  )
}
