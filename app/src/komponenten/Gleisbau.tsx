import { useEffect, useMemo, useRef, useState } from 'react'
import { knopfTon, zuggeraeuschAus, zuggeraeuschTempo } from '../audio'
import {
  type Brett, type Gleis, bahnhofNamen, beispiel, brettLesen, brettMerken, type Dreh, type Feld, type GleisArt, GROESSEN, groesseAendern, type Grund, leer,
  anfangZumGriff, grossAnfang, grosseEntfernen, grosseKurve, grosseLegen, grossGeometrie, istBahnhof, istWeiche, spalten, type Stueck, stueckLaenge, tunnelWeiter, verschieben, type WagenLage, WAGEN_LAENGE, wege, wegPunkte, zeilen, Zug, zufallsBeispiel,
} from '../gleisbau'
import { Zurueck } from './Zurueck'

const LEISE = 'text-sm text-sbb-metal dark:text-sbb-storm'

/**
 * Farben des Bretts (gewählt): ein dunkles Tablett mit hellen Feldern wie in Michaels Vorlage «VIA», die Häuser des Dorfs in deren
 * Farben, Gleise in Anthrazit, Akzente in Karmin wie in Taktland
 */
const F = {
  tablett: '#3a3a3c', wiese: '#e3e9d6', wald: '#cfdcbe', baum: ['#8fb07a', '#7aa067', '#a2bf8c'], wasser: '#bcd5ea', welle: '#dbe9f5',
  berg: '#ddd3c4', fels: '#c3b49f', schnee: '#f7f5f0', schotter: '#c2bbb0', schwelle: '#8b8074', schiene: '#4a4a4a',
  perron: '#d2d2d2', strasse: '#d8d1c4', dach: '#6a6a6a', bruecke: '#d6d6d6', gelaender: '#7a7a7a', portal: '#2e2e30', karmin: '#a8102e',
  haeuser: ['#c8433b', '#e7b53c', '#c9bba0', '#3f78c4', '#e8712d', '#8fb3a0'],
}

type Werkzeug =
  | { art: 'gleis'; gleis: GleisArt } | { art: 'tunnel' } | { art: 'bruecke' } | { art: 'grund'; grund: Grund } | { art: 'weg' }

const GLEISE: Array<{ w: Werkzeug; text: string }> = [
  { w: { art: 'gleis', gleis: 'gerade' }, text: 'Gerade' },
  { w: { art: 'gleis', gleis: 'kurve' }, text: 'Kurve' },
  { w: { art: 'gleis', gleis: 'bogen2' }, text: 'Kurve 2 × 2' },
  { w: { art: 'gleis', gleis: 'bogen3' }, text: 'Kurve 3 × 3' },
  { w: { art: 'gleis', gleis: 'weiche' }, text: 'Weiche' },
  { w: { art: 'gleis', gleis: 'dreiweg' }, text: 'Dreiweg' },
  { w: { art: 'gleis', gleis: 'kreuzung' }, text: 'Kreuzung' },
  { w: { art: 'gleis', gleis: 'prellbock' }, text: 'Prellbock' },
  { w: { art: 'gleis', gleis: 'bahnhof' }, text: 'Bahnhof' },
  { w: { art: 'tunnel' }, text: 'Tunnel' },
  { w: { art: 'bruecke' }, text: 'Brücke' },
]
const LANDSCHAFT: Array<{ w: Werkzeug; text: string }> = [
  { w: { art: 'grund', grund: 'wiese' }, text: 'Wiese' },
  { w: { art: 'grund', grund: 'wald' }, text: 'Wald' },
  { w: { art: 'grund', grund: 'wasser' }, text: 'Wasser' },
  { w: { art: 'grund', grund: 'berg' }, text: 'Berg' },
  { w: { art: 'grund', grund: 'dorf' }, text: 'Dorf' },
  { w: { art: 'weg' }, text: 'Entfernen' },
]

const gleich = (a: Werkzeug, b: Werkzeug) => JSON.stringify(a) === JSON.stringify(b)

/** so viele Schritte lassen sich rückgängig machen */
const RUECKGAENGIG = 10

/** so schnell klingt der Zug bei vollem Tempo auf dem Brett, in m/s (etwa 80 km/h; gewählt, das Brett hat keinen Massstab) */
const ZUG_KLANG_MS = 22

/** fester Zufall je Feld, damit Bäume und Häuser beim Neuzeichnen bleiben */
function zufall(i: number, j: number, k: number) {
  const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}

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
  if (!f || f.grund !== 'berg' || !f.gleis || grosseKurve(f.gleis)) return false
  const abstand = [y - j, i + 1 - x, j + 1 - y, x - i]
  const kanten = new Set(wege(f.gleis).flat())
  return [0, 1, 2, 3].every((k) => !kanten.has(k) || tunnelWeiter(b, i, j, k) || abstand[k] > PORTAL)
}

/** ein Feld: die Fläche und, ohne «nurFlaeche», seine Landschaft für sich allein (auf den Knöpfen) */
function GrundBild({ f, i, j, nurFlaeche = false }: { f: Feld; i: number; j: number; nurFlaeche?: boolean }) {
  const grundFarbe = f.grund === 'wald' ? F.wald : f.grund === 'wasser' ? F.wasser : f.grund === 'berg' ? F.berg : F.wiese
  return (
    <g>
      <rect x={i + 0.025} y={j + 0.025} width={0.95} height={0.95} rx={0.05} fill={grundFarbe} />
      {!nurFlaeche && <Merkmale f={f} i={i} j={j} gleich={() => false} />}
    </g>
  )
}

/** eine Welle von x0 bis x1 auf der Höhe y, ihre Phase nach der Lage auf dem Brett, damit sie im Nachbarfeld nahtlos weiterläuft */
function welle(x0: number, x1: number, y: number) {
  const p: string[] = []
  for (let x = x0; x <= x1 + 1e-6; x += 0.025) p.push(`${p.length ? 'L' : 'M'}${x.toFixed(3)},${(y + 0.028 * Math.sin((x * 2 * Math.PI) / 0.4)).toFixed(3)}`)
  return p.join('')
}

/** ein Berg mit Schnee: Fuss von x0 bis x1 auf der Höhe y, Gipfel bei (gx, gy) */
function gipfel(key: string, x0: number, x1: number, y: number, gx: number, gy: number) {
  const s = 0.25 // Anteil des Schnees an der Höhe
  return (
    <g key={key}>
      <path d={`M${x0},${y} L${gx},${gy} L${x1},${y} Z`} fill={F.fels} />
      <path d={`M${gx - (gx - x0) * s},${gy + (y - gy) * s} L${gx},${gy} L${gx + (x1 - gx) * s},${gy + (y - gy) * s} Z`} fill={F.schnee} />
    </g>
  )
}

/**
 * Die Landschaft eines Felds; wo das Nachbarfeld (Kante k: 0 Nord, 1 Ost, 2 Süd, 3 West) denselben Grund hat, läuft sie hinüber: Wellen bis
 * an den Rand, über der Grenze nach Osten und Süden ein Berg, Bäume und eine Dorfstrasse (Michael, 2026-11-22: «Elemente wie Berg, Wasser, Wald,
 * Dorf sollen sich miteinander verbinden, wenn man sie auf benachbarte Kacheln setzt. Die schwarzen Stege sollen zwar bleiben, aber die Berge
 * sollen wie über die Grenze hinauslaufen und Wasserwellen auch»). Auf dem Brett auf die Kacheln zugeschnitten, so bleiben die Stege
 */
function Merkmale({ f, i, j, gleich }: { f: Feld; i: number; j: number; gleich: (k: number) => boolean }) {
  const x = i, y = j
  if (f.grund === 'wasser') {
    return <>{[0.3, 0.55, 0.8].map((h, k) => (
      <path key={k} d={welle(gleich(3) ? x - 0.05 : x + 0.12, gleich(1) ? x + 1.05 : x + 0.88, y + h)} fill="none" stroke={F.welle} strokeWidth={0.03} strokeLinecap="round" />
    ))}</>
  }
  if (f.grund === 'berg') {
    return (
      <>
        {gleich(1) && gipfel('o', x + 0.6, x + 1.4, y + 0.88, x + 1 + (zufall(i, j, 31) - 0.5) * 0.1, y + 0.32 + zufall(i, j, 32) * 0.12)}
        {gleich(2) && gipfel('s', x + 0.15, x + 0.85, y + 1.28, x + 0.5 + (zufall(i, j, 33) - 0.5) * 0.12, y + 0.78 + zufall(i, j, 34) * 0.08)}
        {gipfel('m', x + 0.1, x + 0.74, y + 0.85, x + 0.42, y + 0.2)}
        {gipfel('n', x + 0.5, x + 0.92, y + 0.85, x + 0.72, y + 0.4)}
      </>
    )
  }
  if (f.grund === 'wald') {
    const baeume: Array<[number, number, number]> = Array.from({ length: 6 }, (_, k) => [x + 0.17 + zufall(i, j, k) * 0.66, y + 0.17 + zufall(i, j, k + 9) * 0.66, 0.09 + zufall(i, j, k + 20) * 0.06])
    // auf der Grenze zum Wald im Osten und Süden je drei Bäume, ihre Kronen reichen über den Steg
    if (gleich(1)) for (let k = 0; k < 3; k++) baeume.push([x + 1 + (zufall(i, j, 40 + k) - 0.5) * 0.12, y + 0.2 + k * 0.3 + (zufall(i, j, 43 + k) - 0.5) * 0.1, 0.1 + zufall(i, j, 46 + k) * 0.05])
    if (gleich(2)) for (let k = 0; k < 3; k++) baeume.push([x + 0.2 + k * 0.3 + (zufall(i, j, 50 + k) - 0.5) * 0.1, y + 1 + (zufall(i, j, 53 + k) - 0.5) * 0.12, 0.1 + zufall(i, j, 56 + k) * 0.05])
    return <>{baeume.map(([bx, by, r], k) => <circle key={k} cx={bx} cy={by} r={r} fill={F.baum[k % 3]} />)}</>
  }
  if (f.grund === 'dorf') {
    // Strassen zu den Nachbardörfern, von der Mitte über den Steg
    const cx = x + 0.5, cy = y + 0.5
    return (
      <>
        {[0, 1, 2, 3].filter(gleich).map((k) => (
          <line key={`s${k}`} x1={cx} y1={cy} x2={cx + [0, 0.55, 0, -0.55][k]} y2={cy + [-0.55, 0, 0.55, 0][k]} stroke={F.strasse} strokeWidth={0.08} strokeLinecap="round" />
        ))}
        {[0, 1, 2].map((k) => {
          const hx = x + 0.12 + k * 0.27 + zufall(i, j, k) * 0.05, hy = y + 0.14 + zufall(i, j, k + 5) * 0.5
          return (
            <g key={k}>
              <rect x={hx + 0.02} y={hy + 0.03} width={0.2} height={0.2} rx={0.02} fill="rgba(0,0,0,.15)" />
              <rect x={hx} y={hy} width={0.2} height={0.2} rx={0.02} fill={F.haeuser[Math.floor(zufall(i, j, k + 11) * 6)]} />
              <line x1={hx} y1={hy + 0.1} x2={hx + 0.2} y2={hy + 0.1} stroke="rgba(0,0,0,.25)" strokeWidth={0.015} />
            </g>
          )
        })}
      </>
    )
  }
  return null
}

/** die Landschaft des ganzen Bretts, über die Felder hinweg verbunden, auf die Kacheln zugeschnitten */
function Landschaft({ brett }: { brett: Brett }) {
  const sp = spalten(brett), ze = zeilen(brett)
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]
  return (
    <>
      <defs>
        <clipPath id="gleisbau-kacheln">
          {brett.flatMap((z, j) => z.map((_, i) => <rect key={`${i},${j}`} x={i + 0.025} y={j + 0.025} width={0.95} height={0.95} rx={0.05} />))}
        </clipPath>
      </defs>
      <g clipPath="url(#gleisbau-kacheln)">
        {brett.map((z, j) => z.map((f, i) => (
          <Merkmale key={`${i},${j}`} f={f} i={i} j={j}
                    gleich={(k) => { const u = i + DX[k], v = j + DY[k]; return u >= 0 && v >= 0 && u < sp && v < ze && brett[v][u].grund === f.grund }} />
        )))}
      </g>
    </>
  )
}

function GleisBild({ f, i, j, name, weiter = [false, false, false, false] }: { f: Feld; i: number; j: number; name?: string; weiter?: boolean[] }) {
  const g = f.gleis
  if (!g) return null
  if (grosseKurve(g)) return <BogenBild i={i} j={j} g={g} />
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
      {g.art === 'kurvenbahnhof' && (() => {
        // der Perron aussen am Bogen, die Kante 0,17 neben dem Gleis wie beim geraden Bahnhof
        const s0 = stuecke[0].s, mitte = wegPunkte(s0, 14)
        const aussen = mitte.map((q) => ({ x: q.x, y: q.y, w: q.w }))
        // aussen ist die Seite weg von der Ecke, um die der Bogen läuft
        const ecke = { x: cx + ([0, 0.5, 0, -0.5][s0.ein] + [0, 0.5, 0, -0.5][s0.aus]), y: cy + ([-0.5, 0, 0.5, 0][s0.ein] + [-0.5, 0, 0.5, 0][s0.aus]) }
        const q0 = aussen[7], links = { x: -Math.sin(q0.w), y: Math.cos(q0.w) }
        const vz = (q0.x - ecke.x) * links.x + (q0.y - ecke.y) * links.y > 0 ? 1 : -1
        return (
          <g>
            <path d={linie(versetzt(aussen, vz * 0.26))} fill="none" stroke={F.perron} strokeWidth={0.2} />
            <path d={linie(versetzt(aussen, vz * 0.165))} fill="none" stroke="#ffffff" strokeWidth={0.02} />
            <path d={linie(versetzt(aussen.slice(4, 11), vz * 0.27))} fill="none" stroke={F.dach} strokeWidth={0.12} strokeLinecap="round" />
          </g>
        )
      })()}
      {g.art === 'bahnhof' && (
        <g transform={`rotate(${g.dreh * 90} ${cx} ${cy})`}>
          <rect x={cx + 0.16} y={cy - 0.44} width={0.2} height={0.88} rx={0.02} fill={F.perron} />
          <line x1={cx + 0.165} y1={cy - 0.44} x2={cx + 0.165} y2={cy + 0.44} stroke="#ffffff" strokeWidth={0.02} />
          <rect x={cx + 0.21} y={cy - 0.2} width={0.12} height={0.4} rx={0.02} fill={F.dach} />
        </g>
      )}
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
            <rect x={-0.02} y={-0.17} width={0.08} height={0.34} fill={F.karmin} />
            <rect x={-0.02} y={-0.06} width={0.08} height={0.12} fill="#ffffff" />
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
            return teil.length > 1 ? <path key={`d${k}`} d={linie(teil)} fill="none" stroke={F.fels} strokeWidth={0.52} /> : null
          })}
          <path d={`M${cx - 0.17},${cy + 0.12} L${cx - 0.02},${cy - 0.17} L${cx + 0.07},${cy} L${cx + 0.12},${cy - 0.07} L${cx + 0.21},${cy + 0.12} Z`} fill={F.berg} />
          {punkte.map(({ p, s }, k) => [0, 1].map((e) => {
            const kant = e === 0 ? s.ein : s.aus
            if (kant < 0 || weiter[kant]) return null
            const l = stueckLaenge(s), t = e === 0 ? PORTAL / l : 1 - PORTAL / l
            const q = p[Math.round(t * (p.length - 1))] ?? p[0]
            return <g key={`${k}${e}`} transform={`translate(${q.x} ${q.y}) rotate(${(q.w * 180) / Math.PI})`}>
              <rect x={-0.03} y={-0.2} width={0.06} height={0.4} rx={0.03} fill={F.portal} />
            </g>
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
function BogenBild({ i, j, g }: { i: number; j: number; g: Gleis }) {
  const G = grossGeometrie(i, j, g)
  const p = Array.from({ length: 41 }, (_, k) => {
    const a = G.a0 + (G.da * k) / 40
    return { x: G.cx + G.r * Math.cos(a), y: G.cy + G.r * Math.sin(a), w: a + Math.PI / 2 }
  })
  return (
    <g>
      <path d={linie(p)} fill="none" stroke={F.schotter} strokeWidth={0.3} />
      <path d={linie(p)} fill="none" stroke={F.schwelle} strokeWidth={0.22} strokeDasharray="0.035 0.065" />
      <path d={linie(versetzt(p, 0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
      <path d={linie(versetzt(p, -0.065))} fill="none" stroke={F.schiene} strokeWidth={0.028} />
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
function WagenBild({ w, tunnel }: { w: WagenLage; tunnel: boolean }) {
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
                  fill={w.art === 0 ? F.karmin : '#ffffff'} stroke="#2f2f2f" strokeWidth={0.012} />
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
  // bis zu RUECKGAENGIG Schritte zurück (Michael, 2026-11-22: «Man muss 10 Schritte rückwärts machen können»); jedes Bauen, Verschieben, Beispiel,
  // Leeren und jede neue Grösse ist ein Schritt, das Stellen der Weichen während der Fahrt nicht
  const [verlauf, setVerlauf] = useState<Brett[]>([])
  const setBrett = (b: Brett, merken = true) => {
    if (merken && b !== brett) setVerlauf((v) => [...v.slice(-(RUECKGAENGIG - 1)), brett])
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
  const [wagen, setWagen] = useState<WagenLage[]>([])
  const [meldung, setMeldung] = useState<string | null>(null)
  const [leerenScharf, setLeerenScharf] = useState(false)
  // langes Drücken auf ein belegtes Feld hebt es an, Ziehen verschiebt es (Michael, 2026-11-22)
  const [ziehen, setZiehen] = useState<{ von: [number, number]; nach: [number, number] } | null>(null)
  const druck = useRef<{ x: number; y: number; zeit: number; feld: [number, number] } | null>(null)
  const nachZiehen = useRef(false)
  const zug = useRef<Zug | null>(null)
  const brettRef = useRef(brett)
  brettRef.current = brett
  const svg = useRef<SVGSVGElement>(null)
  const namen = useMemo(() => bahnhofNamen(brett), [brett])
  const SP = spalten(brett), ZE = zeilen(brett)

  useEffect(() => { brettMerken(brett) }, [brett])
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
      zug.current?.schritt(brettRef.current, dt)
      // das Zuggeräusch von Taktland wie beim Fahren (Michael, 2026-11-22: «Kannst du während der Zugfahrt das Zuggeräusch von Taktland nehmen?»):
      // das volle Tempo des Bretts klingt wie ZUG_KLANG_MS (gewählt), im Tunnel dumpfer, auf einer Brücke hohler
      const z = zug.current
      if (z) {
        const [si, sj] = z.spitze(), f = brettRef.current[sj]?.[si]
        const ort = f?.gleis && !grosseKurve(f.gleis) ? (f.grund === 'berg' ? 'tunnel' : f.grund === 'wasser' ? 'bruecke' : null) : null
        zuggeraeuschTempo(z.anteil() * ZUG_KLANG_MS, Infinity, ort, 1, true)
      }
      setWagen(zug.current?.wagen() ?? [])
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
    const halt = (e: TouchEvent) => { if (druck.current?.zeit === -1) e.preventDefault() }
    el.addEventListener('touchmove', halt, { passive: false })
    return () => el.removeEventListener('touchmove', halt)
  }, [])

  function drucken(e: React.PointerEvent<SVGSVGElement>) {
    if (faehrt || !e.isPrimary) return
    const feld = feldBei(e.clientX, e.clientY)
    if (!feld) return
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
    const d = druck.current
    if (!d) return
    if (d.zeit !== -1) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) druck.current = null; return }
    const feld = feldBei(e.clientX, e.clientY)
    if (feld) setZiehen((z) => (z && (z.nach[0] !== feld[0] || z.nach[1] !== feld[1]) ? { ...z, nach: feld } : z))
  }
  function loslassen() {
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
    setMeldung(null)
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
    else n = f.gleis ? { grund: f.grund } : { grund: 'wiese' }
    neu(i, j, n)
    knopfTon(true)
  }

  function neu(i: number, j: number, f: Feld, merken = true) {
    setBrett(brett.map((z, jj) => (jj === j ? z.map((x, ii) => (ii === i ? f : x)) : z)), merken)
  }

  function fahren() {
    if (faehrt) { setFaehrt(false); setWagen([]); zug.current = null; return }
    const z = Zug.setzen(brett)
    if (!z) { setMeldung('Leg zuerst ein Gleis, am besten mit einem Bahnhof.'); return }
    zug.current = z; setWagen(z.wagen()); setMeldung(null); setFaehrt(true)
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
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Gleisbau</h1>
      <p className="mt-2 max-w-3xl leading-relaxed">
        Wähle unten ein Stück und tippe ein Feld an. Nochmals tippen dreht es. Gleis auf Wasser wird zur Brücke, auf einem Berg zum Tunnel.
        Ein Bahnhof auf einer Kurve wird zum Bahnhof in der Kurve. Lange drücken und ziehen verschiebt ein Feld; liegt am Ziel etwas, tauschen die beiden.
        Dann «Fahren»: Der Zug hält an jedem Bahnhof und kehrt am Ende eines Gleises um. Während der Fahrt stellt ein Tipp die Weichen.
      </p>
      <div className={`mt-4 ${SP > 8 ? 'max-w-5xl' : 'max-w-3xl'}`}>
        <svg ref={svg} viewBox={`-0.15 -0.15 ${SP + 0.3} ${ZE + 0.3}`} role="img" aria-label={`Spielbrett mit ${SP} × ${ZE} Feldern`}
             onClick={feldAn} onPointerDown={drucken} onPointerMove={bewegen} onPointerUp={loslassen}
             onPointerCancel={() => { druck.current = null; setZiehen(null) }} onContextMenu={(e) => e.preventDefault()}
             className="w-full cursor-pointer select-none [-webkit-touch-callout:none]">
          <rect x={-0.15} y={-0.15} width={SP + 0.3} height={ZE + 0.3} rx={0.14} fill={F.tablett} />
          {brett.map((z, j) => z.map((f, i) => <GrundBild key={`g${i},${j}`} f={f} i={i} j={j} nurFlaeche />))}
          <Landschaft brett={brett} />
          {brett.map((z, j) => z.map((f, i) => <GleisBild key={`l${i},${j}`} f={f} i={i} j={j} name={namen.get(`${i},${j}`)}
                                                         weiter={f.grund === 'berg' ? [0, 1, 2, 3].map((k) => tunnelWeiter(brett, i, j, k)) : undefined} />))}
          {wagen.slice().reverse().map((w, k) => <WagenBild key={k} w={w} tunnel={imTunnel(brett, w.x, w.y)} />)}
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
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={fahren}
                className="min-h-12 rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125">{faehrt ? 'Anhalten' : 'Fahren'}</button>
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
      <p className={`mt-5 max-w-3xl ${LEISE}`}>
        Ein Baukasten, keine Wirklichkeit: Kacheln, Zug, Tempo und Halte sind gezeichnet und gewählt. Dein Brett bleibt im Browser dieses
        Geräts und wird nicht gesendet. Bald: dasselbe Brett als Modell in 3D und Aufgaben.
      </p>
    </div>
  )
}
