import { useEffect, useState, useSyncExternalStore } from 'react'
import { flaechenLaden, sehenswertLaden } from '../daten'
import type { FlaechenDaten, KodierterZug, SehenswertDaten } from '../typen'
import { LAENGE_ZU_BREITE, pfad, type Box } from './Netzkarte'

/**
 * Sehenswertes auf den Karten (Michael, 2026-09-26: «Gipfel mit Höhe, KGS
 * Objekte, Seilbahnen und Flächen übernehmen»): Gipfel aus Swiss Map Vector
 * 1000 (swisstopo), Kulturgüter von nationaler Bedeutung (BABS), Seilbahnen
 * mit Bundeskonzession (BAV), BLN, Pärke und Moorlandschaften (BAFU). Gezeigt
 * wird nur, was die Quelle führt; ein Tipp zeigt es unter der Karte an.
 * Je näher die Karte, desto mehr erscheint, damit sie lesbar bleibt.
 */

export interface Auswahl { titel: string; zeilen: string[]; quelle: string }

interface Punkt { x: number; y: number; name: string; info: Auswahl }
interface Zug { d: string; x0: number; x1: number; y0: number; y1: number; info: Auswahl }
interface Flaeche extends Zug { art: 'bln' | 'park' | 'moor' }

interface Sehenswert { gipfel: Punkt[]; kgs: Punkt[]; seilbahnen: Zug[] }

const xy = (la: number, lo: number): [number, number] => [lo * LAENGE_ZU_BREITE, -la]
const zahl = (n: number) => n.toLocaleString('de-CH')

function entpacken(z: KodierterZug) {
  let [la, lo] = z.start
  const pts: Array<[number, number]> = [xy(la / 1e5, lo / 1e5)]
  for (let i = 0; i < z.d.length; i += 2) {
    la += z.d[i]; lo += z.d[i + 1]
    pts.push(xy(la / 1e5, lo / 1e5))
  }
  return pts
}

function zug(zuege: KodierterZug[], schliessen: boolean) {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
  const d = zuege.map((z) => {
    const pts = entpacken(z)
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    return pfad(pts) + (schliessen ? 'Z' : '')
  }).join('')
  return { d, x0, x1, y0, y1 }
}

function lesen(s: SehenswertDaten): Sehenswert {
  return {
    gipfel: s.gipfel.map((g) => {
      const [x, y] = xy(g.lage[0], g.lage[1])
      const name = g.hoehe_m != null ? `${g.name} ${zahl(g.hoehe_m)} m` : g.name
      return { x, y, name, info: { titel: g.name, zeilen: [
        'Gipfel', g.hoehe_m != null ? `${zahl(g.hoehe_m)} m ü. M.` : 'Höhe: keine Angabe'],
      quelle: s.quellen.gipfel } }
    }),
    kgs: s.kgs.map((k) => {
      const [x, y] = xy(k.lage[0], k.lage[1])
      return { x, y, name: k.name, info: { titel: k.name, zeilen: [
        'Kulturgut von nationaler Bedeutung',
        k.art ? `${k.gruppe} · ${k.art}` : k.gruppe,
        `${k.gemeinde}${k.kanton ? ` ${k.kanton}` : ''}`],
      quelle: s.quellen.kgs } }
    }),
    seilbahnen: s.seilbahnen.map((b) => ({
      ...zug(b.verlauf, false),
      info: { titel: b.name, zeilen: [
        [b.bahntyp, b.fahrzeugtyp].filter(Boolean).join(' · ') || 'Seilbahn',
        [b.laenge_schief_m != null ? `Länge schief ${zahl(b.laenge_schief_m)} m` : null,
         b.hoehendifferenz_m != null ? `Höhendifferenz ${zahl(b.hoehendifferenz_m)} m` : null]
          .filter(Boolean).join(' · '),
        b.betreiber ? `Betrieb: ${b.betreiber}` : ''].filter(Boolean),
      quelle: s.quellen.seilbahnen },
    })),
  }
}

function flaechenLesen(f: FlaechenDaten): Flaeche[] {
  return f.flaechen.map((a) => ({
    ...zug(a.ringe, true),
    art: a.art === 'BLN' ? 'bln' : a.art === 'Moorlandschaft' ? 'moor' : 'park',
    info: { titel: a.name, zeilen: [a.art === 'BLN' ? 'Landschaft oder Naturdenkmal von nationaler Bedeutung (BLN)'
      : a.art === 'Moorlandschaft' ? 'Moorlandschaft von nationaler Bedeutung' : a.art], quelle: f.quelle },
  }))
}

let vorrat: Sehenswert | null = null
let vorratFlaechen: Flaeche[] | null = null
let laeuft: Promise<void> | null = null

/** Lädt alles einmal für alle Karten; ohne Daten bleibt die Karte, wie sie war */
export function useSehenswert() {
  const [daten, setDaten] = useState({ s: vorrat, f: vorratFlaechen })
  useEffect(() => {
    if (vorrat && vorratFlaechen) return
    let ab = false
    laeuft ??= Promise.all([sehenswertLaden(), flaechenLaden()]).then(([s, f]) => {
      vorrat = lesen(s)
      vorratFlaechen = flaechenLesen(f)
    })
    laeuft.then(() => { if (!ab) setDaten({ s: vorrat, f: vorratFlaechen }) }).catch(() => { laeuft = null })
    return () => { ab = true }
  }, [])
  return daten
}

const imBild = (z: { x0: number; x1: number; y0: number; y1: number }, box: Box, h: number) =>
  z.x1 > box.cx - box.w && z.x0 < box.cx + box.w && z.y1 > box.cy - h && z.y0 < box.cy + h

/**
 * Welche Kategorien die Karten zeigen: jede lässt sich in der Legende aus- und
 * einblenden (Michael, 2026-09-26), gemerkt auf diesem Gerät, für alle Karten.
 */
export type Kategorie = 'gipfel' | 'kgs' | 'seilbahn' | 'bln' | 'park' | 'moor'
const KATEGORIEN_SPEICHER = 'taktland.karte.v1'
let versteckt: Set<Kategorie> = (() => {
  try { return new Set(JSON.parse(localStorage.getItem(KATEGORIEN_SPEICHER) ?? '{}').versteckt ?? []) } catch { return new Set() }
})()
const hoerer = new Set<() => void>()

export function kategorieUmschalten(k: Kategorie) {
  versteckt = new Set(versteckt)
  if (versteckt.has(k)) versteckt.delete(k)
  else versteckt.add(k)
  try { localStorage.setItem(KATEGORIEN_SPEICHER, JSON.stringify({ versteckt: [...versteckt] })) } catch { /* nur für jetzt */ }
  hoerer.forEach((h) => h())
}

export function useVersteckt() {
  return useSyncExternalStore((h) => { hoerer.add(h); return () => { hoerer.delete(h) } }, () => versteckt)
}

/** Flächen, ganz unten, noch unter den Seen */
export function FlaechenEbene({ flaechen, box, verh = 1.6, waehlen }: {
  flaechen: Flaeche[] | null
  box: Box
  verh?: number
  waehlen?: (a: Auswahl) => void
}) {
  const aus = useVersteckt()
  if (!flaechen) return null
  const h = box.w / verh
  return (
    <g>
      {flaechen.filter((f) => !aus.has(f.art) && imBild(f, box, h)).map((f, i) => (
        <path key={i} d={f.d} fillRule="evenodd" strokeWidth={1} vectorEffect="non-scaling-stroke"
              className={`${f.art === 'bln' ? 'fill-flaeche-bln stroke-flaeche-bln-rand'
                : f.art === 'moor' ? 'fill-flaeche-moor stroke-flaeche-moor-rand'
                  : 'fill-flaeche-park stroke-flaeche-park-rand'} ${waehlen ? 'cursor-pointer' : ''}`}
              onClick={waehlen ? () => waehlen(f.info) : undefined} />
      ))}
    </g>
  )
}

type Feld = [number, number, number, number]
const ueberdeckt = (felder: Feld[], f: Feld) =>
  felder.some((g) => g[0] < f[2] && f[0] < g[2] && g[1] < f[3] && f[1] < g[3])

/**
 * Seilbahnen, Kulturgüter und Gipfel über dem Streckennetz. «belegt» sind
 * Felder schon beschrifteter Namen (Bahnhöfe); neue kommen dazu.
 */
export function SehenswertEbene({ daten, box, px, verh = 1.6, belegt = [], waehlen }: {
  daten: Sehenswert | null
  box: Box
  px: number
  verh?: number
  belegt?: Feld[]
  waehlen?: (a: Auswahl) => void
}) {
  const aus = useVersteckt()
  if (!daten) return null
  const h = box.w / verh
  const drin = (x: number, y: number) => Math.abs(x - box.cx) < box.w * 0.52 && Math.abs(y - box.cy) < h * 0.52
  const felder = [...belegt]
  const namen: Array<{ x: number; y: number; name: string; art: 'gipfel' | 'kgs'; rechts: boolean }> = []
  const beschriften = (p: Punkt, art: 'gipfel' | 'kgs', schrift: number) => {
    const text = p.name.length > 34 ? `${p.name.slice(0, 33)}…` : p.name
    const breite = text.length * schrift * 0.5 * px
    // rechts vom Zeichen, sonst links davon, wenn rechts der Rand kommt
    const rechts = p.x + 5 * px + breite < box.cx + box.w / 2
    const x0 = rechts ? p.x + 5 * px : p.x - 5 * px - breite
    const f: Feld = [x0, p.y - schrift * 0.6 * px, x0 + breite, p.y + schrift * 0.6 * px]
    if (x0 < box.cx - box.w / 2 || ueberdeckt(felder, f)) return
    felder.push(f)
    namen.push({ x: p.x, y: p.y, name: text, art, rechts })
  }
  const seilbahnen = box.w < 1.5 && !aus.has('seilbahn') ? daten.seilbahnen.filter((z) => imBild(z, box, h)) : []
  const kgs = box.w < 0.35 && !aus.has('kgs') ? daten.kgs.filter((p) => drin(p.x, p.y)) : []
  const gipfel = aus.has('gipfel') ? [] : daten.gipfel.filter((p) => drin(p.x, p.y))
  // Namen: Gipfel zuerst, Kulturgüter erst nah
  for (const p of gipfel) if (box.w < 1.5) beschriften(p, 'gipfel', 9)
  if (box.w < 0.08) for (const p of kgs) beschriften(p, 'kgs', 8.5)
  const tipp = (a: Auswahl) => (waehlen ? () => waehlen(a) : undefined)
  const s = 3.2 * px
  return (
    <g>
      {seilbahnen.map((z, i) => (
        <g key={`s${i}`} className={waehlen ? 'cursor-pointer' : ''} onClick={tipp(z.info)}>
          <path d={z.d} fill="none" strokeWidth={1.5} strokeDasharray="3 2" vectorEffect="non-scaling-stroke"
                className="stroke-seilbahn" />
          {waehlen && <path d={z.d} fill="none" strokeWidth={12} stroke="transparent" vectorEffect="non-scaling-stroke" />}
        </g>
      ))}
      {kgs.map((p, i) => (
        <g key={`k${i}`} className={waehlen ? 'cursor-pointer' : ''} onClick={tipp(p.info)}>
          <rect x={p.x - s * 0.7} y={p.y - s * 0.7} width={s * 1.4} height={s * 1.4}
                transform={`rotate(45 ${p.x} ${p.y})`} strokeWidth={0.8} vectorEffect="non-scaling-stroke"
                className="fill-kgs stroke-white dark:stroke-sbb-midnight" />
          {waehlen && <circle cx={p.x} cy={p.y} r={8 * px} fill="transparent" />}
        </g>
      ))}
      {gipfel.map((p, i) => (
        <g key={`g${i}`} className={waehlen ? 'cursor-pointer' : ''} onClick={tipp(p.info)}>
          <path d={`M${p.x} ${p.y - s * 1.2}L${p.x + s} ${p.y + s * 0.6}L${p.x - s} ${p.y + s * 0.6}Z`}
                strokeWidth={0.8} vectorEffect="non-scaling-stroke"
                className="fill-gipfel stroke-white dark:stroke-sbb-midnight" />
          {waehlen && <circle cx={p.x} cy={p.y} r={8 * px} fill="transparent" />}
        </g>
      ))}
      {namen.map((n, i) => (
        <text key={`n${i}`} x={n.x + (n.rechts ? 5 : -5) * px} y={n.y + 3 * px} fontSize={(n.art === 'gipfel' ? 9 : 8.5) * px}
              textAnchor={n.rechts ? 'start' : 'end'}
              pointerEvents="none"
              className={`${n.art === 'gipfel' ? 'fill-gipfel' : 'fill-kgs'} stroke-white dark:stroke-sbb-midnight`}
              strokeWidth={2.5} paintOrder="stroke" vectorEffect="non-scaling-stroke">{n.name}</text>
      ))}
    </g>
  )
}

/** Was angetippt wurde, unter der Karte */
export function AuswahlZeile({ auswahl, schliessen }: { auswahl: Auswahl | null; schliessen: () => void }) {
  if (!auswahl) return null
  return (
    <div className="kachel mt-2 flex items-start justify-between gap-3 px-3 py-2 text-sm" role="status">
      <div className="min-w-0">
        <p className="font-medium">{auswahl.titel}</p>
        {auswahl.zeilen.map((z) => <p key={z} className="text-sbb-metal dark:text-sbb-storm">{z}</p>)}
        <p className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">Quelle: {auswahl.quelle}</p>
      </div>
      <button type="button" onClick={schliessen} aria-label="Schliessen"
              className="flex min-h-9 min-w-9 shrink-0 items-center justify-center text-lg text-sbb-metal
                         hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white">×</button>
    </div>
  )
}

const LEGENDE: Array<[Kategorie, string, React.ReactNode]> = [
  ['gipfel', 'Gipfel', <svg viewBox="0 0 10 10" className="size-2.5"><path d="M5 1L9 9H1Z" className="fill-gipfel" /></svg>],
  ['kgs', 'Kulturgut', <svg viewBox="0 0 10 10" className="size-2.5"><rect x="2" y="2" width="6" height="6" transform="rotate(45 5 5)" className="fill-kgs" /></svg>],
  ['seilbahn', 'Seilbahn', <svg viewBox="0 0 16 10" className="h-2.5 w-4"><path d="M1 5H15" strokeWidth="1.5" strokeDasharray="3 2" className="stroke-seilbahn" /></svg>],
  ['bln', 'BLN', <span className="inline-block size-2.5 rounded-sm border border-flaeche-bln-rand bg-flaeche-bln" />],
  ['park', 'Park', <span className="inline-block size-2.5 rounded-sm border border-flaeche-park-rand bg-flaeche-park" />],
  ['moor', 'Moorlandschaft', <span className="inline-block size-2.5 rounded-sm border border-flaeche-moor-rand bg-flaeche-moor" />],
]

/** Legende der Zeichen; ein Tipp blendet die Kategorie aus oder wieder ein */
export function SehenswertLegende() {
  const aus = useVersteckt()
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Auf der Karte zeigen">
      {LEGENDE.map(([k, text, zeichen]) => (
        <button key={k} type="button" aria-pressed={!aus.has(k)} onClick={() => kategorieUmschalten(k)}
                className={`flex min-h-8 items-center gap-1.5 rounded-lg px-2 ${aus.has(k)
                  ? 'text-sbb-metal line-through opacity-60 dark:text-sbb-storm'
                  : 'bg-sbb-kachel dark:bg-sbb-charcoal'}`}>
          <span aria-hidden="true" className="flex">{zeichen}</span>{text}
        </button>
      ))}
    </div>
  )
}
