import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { holen, holenBinaer, kartengrundLaden, seenLaden, sehenswertLaden, szeneLaden } from '../daten'
import { fensterLaden, feinHoehe, feinLaden, KEINE_HOEHE, luftbildLaden, nahbildLaden, type Raster, schweiz3dLaden } from '../gelaende'
import { lv95, useBrilleMoeglich } from '../relief'
import { imGebiet, type Pool, schweiz11Laden } from '../schweiz11'
import type { SeenDaten, SehenswertDaten } from '../typen'
import { Ladebalken } from './Ladebalken'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'

/**
 * «3D Schweiz» (Michael, 2026-10-18: «die Berge und Täler der Schweiz besser erkunden … von der ganzen Schweiz bis ins
 * Quartier eines Bergdorfes»): drei Stufen. Die ganze Schweiz aus der Übersicht (data/schweiz3d, Gelände auf 500 m, Luftbild
 * auf 100 m), darin ein Feld von 20 km wählen und eintauchen (Gelände auf 50 m, Luftbild auf 10 m), darin ein Feld von 4 km
 * (feines Gelände auf 10 m und Nahbild auf 2,5 m, wo es sie gibt: bis 500 m neben den Bahnlinien; sonst bleibt es bei 50 m).
 *
 * Gewählt wird ein Quadrat, keine Region und kein Tal: wo ein Tal oder eine Region beginnt und endet, steht in keiner
 * unserer Quellen. Was die Karte zum Feld nennt, steht in den Daten: Orte der Landeskarte, Gipfel, Seen, der Kanton der Mitte.
 */

type Stufe = 'schweiz' | 'region' | 'ort'
const FELD_M: Record<Exclude<Stufe, 'ort'>, number> = { schweiz: 20_000, region: 4_000 }
const RASTER_M: Record<Exclude<Stufe, 'ort'>, number> = { schweiz: 5_000, region: 1_000 }
/** in der Übersicht ist die Höhe überhöht, sonst wären die Alpen auf 350 km kaum zu sehen */
const UEBERHOEHT = 3
const KARMIN = '#a8102e'

interface Uebersicht { ost: number; nord: number; m: number; breite: number; hoehe: number; quelle_gelaende: string; quelle_luftbild: string }
interface Gelaende { raster: Raster; h: Float32Array; bild: HTMLCanvasElement; quellen: string[]; hinweis?: string }
interface Feld { e: number; n: number; seite: number }
interface Zusatz { sw: SehenswertDaten; seen: SeenDaten; orte: Array<{ name: string; klasse: number; lage: [number, number] }>; pool: Pool }

/* ---------- Daten ---------- */

async function uebersichtLaden(): Promise<Gelaende> {
  const ix = await holen<Uebersicht>('data/schweiz3d/index.json')
  const gepackt = await holenBinaer('data/schweiz3d/hoehen.hgz')
  const roh = await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  const u = new Uint16Array(roh)
  const bild = await createImageBitmap(new Blob([await holenBinaer('data/schweiz3d/luftbild.jpg')], { type: 'image/jpeg' }))
  const c = document.createElement('canvas')
  c.width = Math.min(4096, bild.width); c.height = Math.round(c.width * bild.height / bild.width)
  c.getContext('2d')!.drawImage(bild, 0, 0, c.width, c.height)
  return { raster: { ost: ix.ost, nord: ix.nord, m: ix.m, breite: ix.breite, hoehe: ix.hoehe }, h: Float32Array.from(u), bild: c,
           quellen: [ix.quelle_gelaende, ix.quelle_luftbild] }
}

async function regionLaden(f: Feld): Promise<Gelaende> {
  const a = await fensterLaden(f.e, f.n, f.seite)
  const lb = await luftbildLaden(a.raster)
  const { ost, nord, m, breite, hoehe } = a.raster
  const c = document.createElement('canvas')
  c.width = c.height = 2048
  const g = c.getContext('2d')!
  g.fillStyle = '#d8d5c2'; g.fillRect(0, 0, c.width, c.height)
  const sx = c.width / (breite * m), sy = c.height / (hoehe * m)
  for (const k of lb?.kacheln ?? []) {
    g.drawImage(k.bild, (k.ex * lb!.kachel_m - ost) * sx, (nord - (k.ny + 1) * lb!.kachel_m) * sy, lb!.kachel_m * sx, lb!.kachel_m * sy)
  }
  // schärfer, wo daten.taktland.ch die Details hat: je Kilometer so viele Bildpunkte, wie die Leinwand fasst
  const d = await schweiz3dLaden(ost, nord - hoehe * m, ost + breite * m, nord, Math.ceil(sx * 1000), true).catch(() => null)
  for (const k of d?.bilder ?? []) g.drawImage(k.bild, (k.ke * 1000 - ost) * sx, (nord - (k.kn + 1) * 1000) * sy, 1000 * sx, 1000 * sy)
  return { raster: a.raster, h: Float32Array.from(a.h), bild: c,
           quellen: [a.quelle, d?.bilder.length ? `${d.quelle_bild}, hier auf etwa ${Math.round(1 / sx)} m, Aufnahmen ${d.bildJahre.join(', ')}`
             : lb ? `SWISSIMAGE (swisstopo), auf 10 m gemittelt, Aufnahmen ${lb.jahre.join(', ')}` : 'ohne Luftbild'] }
}

/** Ort: 4 km im 10-m-Raster; feines Gelände und Nahbild, wo es sie gibt, sonst das Gelände der Region */
async function ortLaden(f: Feld, region: Gelaende): Promise<Gelaende> {
  const e0 = f.e - f.seite / 2, n1 = f.n + f.seite / 2
  const m = 10, breite = f.seite / m + 1
  const [fein, nah, details] = await Promise.all([feinLaden(e0, f.n - f.seite / 2, e0 + f.seite, n1).catch(() => null),
                                                  nahbildLaden(e0, f.n - f.seite / 2, e0 + f.seite, n1).catch(() => null),
                                                  schweiz3dLaden(e0, f.n - f.seite / 2, e0 + f.seite, n1).catch(() => null)])
  const h = new Float32Array(breite * breite)
  let feine = 0
  for (let j = 0; j < breite; j++) {
    for (let i = 0; i < breite; i++) {
      const e = e0 + i * m, n = n1 - j * m
      // zuerst die Details der ganzen Schweiz, dann das feine Gelände entlang der Bahnlinien
      const z = (details?.fein.km.size ? feinHoehe(details.fein, e, n) : null) ?? (fein ? feinHoehe(fein, e, n) : null)
      if (z !== null) feine++
      h[j * breite + i] = z ?? hoeheIm(region, e, n)
    }
  }
  // das Bild: das Luftbild der Region darunter, das Nahbild darüber
  const c = document.createElement('canvas')
  c.width = c.height = 4096
  const g = c.getContext('2d')!
  const r = region.raster
  const fx = region.bild.width / (r.breite * r.m)
  g.drawImage(region.bild, (e0 - r.ost) * fx, (r.nord - n1) * fx, f.seite * fx, f.seite * fx, 0, 0, c.width, c.height)
  const s = c.width / f.seite
  for (const k of nah?.kacheln ?? []) g.drawImage(k.bild, (k.ke * 1000 - e0) * s, (n1 - (k.kn + 1) * 1000) * s, 1000 * s, 1000 * s)
  for (const k of details?.bilder ?? []) g.drawImage(k.bild, (k.ke * 1000 - e0) * s, (n1 - (k.kn + 1) * 1000) * s, 1000 * s, 1000 * s)
  const anteil = feine / h.length
  const ganz = !!details?.fein.km.size
  return {
    raster: { ost: e0, nord: n1, m, breite, hoehe: breite }, h, bild: c,
    quellen: [ganz ? `${details!.quelle_hoehe}, Aufnahmen ${details!.fein.jahre.join(', ')}`
                : anteil > 0 ? 'swissALTI3D (swisstopo), auf 10 m gemittelt, nur bis 500 m neben den Bahnlinien' : region.quellen[0],
              details?.bilder.length ? `${details.quelle_bild}, Aufnahmen ${details.bildJahre.join(', ')}`
                : nah ? 'SWISSIMAGE (swisstopo), auf 2,5 m, nur bis 500 m neben den Bahnlinien, sonst auf 10 m' : region.quellen[1]],
    hinweis: anteil < 0.98 ? (anteil === 0 ? 'Hier gibt es noch keine feineren Daten: Gelände auf 50 m, Luftbild auf 10 m wie in der Region.'
      : ganz ? 'Am Rand fehlen feinere Daten, dort wie in der Region.' : 'Feiner nur bis 500 m neben den Bahnlinien, weiter weg wie in der Region.') : undefined,
  }
}

function hoeheIm(gl: Gelaende, e: number, n: number) {
  const { ost, nord, m, breite, hoehe } = gl.raster
  const x = Math.max(0, Math.min(breite - 1.001, (e - ost) / m - 0.5)), y = Math.max(0, Math.min(hoehe - 1.001, (nord - n) / m - 0.5))
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
  const z = (a: number, b: number) => gl.h[b * breite + a]
  return z(i, j) * (1 - fx) * (1 - fy) + z(i + 1, j) * fx * (1 - fy) + z(i, j + 1) * (1 - fx) * fy + z(i + 1, j + 1) * fx * fy
}

/* ---------- was im Feld liegt ---------- */

function imFeld(f: Feld, la: number, lo: number) {
  const [e, n] = lv95(la, lo)
  return Math.abs(e - f.e) <= f.seite / 2 && Math.abs(n - f.n) <= f.seite / 2
}

function feldInhalt(f: Feld, z: Zusatz | null) {
  if (!z) return null
  const orte = z.orte.filter((o) => imFeld(f, o.lage[0], o.lage[1])).sort((a, b) => b.klasse - a.klasse).slice(0, 3).map((o) => o.name)
  const gipfel = z.sw.gipfel.filter((g) => g.hoehe_m !== null && imFeld(f, g.lage[0], g.lage[1]))
    .sort((a, b) => b.hoehe_m! - a.hoehe_m!)[0] ?? null
  const seen = z.seen.seen.filter((s) => s.name && s.namenspunkt && imFeld(f, s.namenspunkt[0], s.namenspunkt[1])).map((s) => s.name!).slice(0, 3)
  const [la, lo] = wgs(f.e, f.n)
  const kanton = [...z.pool.kantone.keys()].find((k) => imGebiet(z.pool, k, la, lo)) ?? null
  return { orte, gipfel, seen, kanton }
}

/** LV95 → WGS84, die Näherung von swisstopo */
function wgs(e: number, n: number): [number, number] {
  const y = (e - 2_600_000) / 1e6, x = (n - 1_200_000) / 1e6
  const la = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x ** 3
  const lo = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
  return [la * 100 / 36, lo * 100 / 36]
}

/* ---------- die Seite ---------- */

export default function Schweiz3D() {
  useEffect(() => szeneLaden(), [])
  const [stufe, setStufe] = useState<Stufe>('schweiz')
  const [gelaende, setGelaende] = useState<Record<Stufe, Gelaende | null>>({ schweiz: null, region: null, ort: null })
  const [felder, setFelder] = useState<{ region: Feld | null; ort: Feld | null }>({ region: null, ort: null })
  const [wahl, setWahl] = useState<Feld | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [zusatz, setZusatz] = useState<Zusatz | null>(null)
  const [faktor, setFaktor] = useState<1 | 2>(1)
  useEffect(() => {
    uebersichtLaden().then((g) => setGelaende((a) => ({ ...a, schweiz: g }))).catch((e: Error) => setFehler(e.message))
    Promise.all([sehenswertLaden(), seenLaden(), kartengrundLaden(), schweiz11Laden()])
      .then(([sw, seen, k, pool]) => setZusatz({ sw, seen, orte: k.orte as Zusatz['orte'], pool })).catch(() => {})
  }, [])
  const inhalt = useMemo(() => (wahl ? feldInhalt(wahl, zusatz) : null), [wahl, zusatz])
  const aktuell = gelaende[stufe]
  const brille = useRef<(() => Promise<void>) | null>(null)
  const xr = useBrilleMoeglich()
  const [brilleHinweis, setBrilleHinweis] = useState<string | null>(null)
  const inBrille = () => {
    if (!xr) { setBrilleHinweis('Auf diesem Gerät ist keine VR-Brille zu finden. Öffne Taktland im Browser einer VR-Brille wie der Meta Quest 3.'); return }
    setBrilleHinweis(null)
    brille.current?.().catch((e: Error) => setBrilleHinweis(`Die Brille liess sich nicht starten: ${e.message}`))
  }
  // was in der Brille über dem Feld steht, dieselben Angaben wie die Karte auf dem Bildschirm
  const info = useMemo(() => (wahl && inhalt ? [
    inhalt.orte.length ? inhalt.orte.join(', ') : inhalt.gipfel?.name ?? 'Ohne Ort der Landeskarte',
    ...(inhalt.gipfel ? [`▲ ${inhalt.gipfel.name} ${inhalt.gipfel.hoehe_m!.toLocaleString('de-CH')} m`] : []),
    ...(inhalt.seen.length ? [inhalt.seen.join(', ')] : []),
    ...(inhalt.kanton ? [`Mitte im Kanton ${inhalt.kanton}`] : []),
  ] : null), [wahl, inhalt])

  async function eintauchen() {
    if (!wahl || laedt) return
    setLaedt(true); setFehler(null)
    try {
      if (stufe === 'schweiz') {
        const g = await regionLaden(wahl)
        setGelaende((a) => ({ ...a, region: g, ort: null })); setFelder({ region: wahl, ort: null }); setStufe('region')
      } else if (stufe === 'region') {
        const g = await ortLaden(wahl, gelaende.region!)
        setGelaende((a) => ({ ...a, ort: g })); setFelder((f) => ({ ...f, ort: wahl })); setStufe('ort')
      }
      setWahl(null)
    } catch (e) { setFehler((e as Error).message) } finally { setLaedt(false) }
  }
  function zufall() {
    const g = gelaende.schweiz
    if (!g || !zusatz) return
    // ein Feld um einen zufälligen Gipfel: dort gibt es etwas zu sehen
    const gipfel = zusatz.sw.gipfel.filter((x) => x.hoehe_m !== null && imGebiet(zusatz.pool, 'CH', x.lage[0], x.lage[1]))
    const x = gipfel[Math.floor(Math.random() * gipfel.length)]
    const [e, n] = lv95(x.lage[0], x.lage[1])
    setWahl({ e: Math.round(e / RASTER_M.schweiz) * RASTER_M.schweiz, n: Math.round(n / RASTER_M.schweiz) * RASTER_M.schweiz, seite: FELD_M.schweiz })
  }
  const zurueck = (s: Stufe) => { setWahl(null); setStufe(s) }
  const eineZurueck = () => { if (stufe === 'ort') zurueck('region'); else if (stufe === 'region') zurueck('schweiz'); else setWahl(null) }
  const titel = (f: Feld | null) => {
    const i = f ? feldInhalt(f, zusatz) : null
    return i?.orte[0] ? `um ${i.orte[0]}` : i?.gipfel ? `am ${i.gipfel.name}` : 'Feld'
  }

  return (
    <div className="px-4 pb-4">
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">3D Schweiz</h1>
      <p className="mt-2 leading-relaxed">
        Die ganze Schweiz als Modell. Tippe auf ein Feld, schau, was darin liegt, und tauche ein: erst in eine Region von 20 km,
        dort in ein Stück von 4 km.
      </p>
      <nav aria-label="Stufe" className="mt-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => zurueck('schweiz')} className={`rounded-lg px-2 py-1 ${stufe === 'schweiz' ? 'font-bold' : 'underline'}`}>Schweiz</button>
        {felder.region && gelaende.region && (
          <>›<button type="button" onClick={() => zurueck('region')} className={`rounded-lg px-2 py-1 ${stufe === 'region' ? 'font-bold' : 'underline'}`}>
            Region {titel(felder.region)}</button></>
        )}
        {stufe === 'ort' && felder.ort && <>›<span className="px-2 py-1 font-bold">{titel(felder.ort)}</span></>}
      </nav>
      {fehler && <Ladefehler className="mt-3" was="Das Gelände konnte nicht geladen werden." fehler={fehler} />}
      <div className="relative mt-2 h-[68vh] min-h-[360px] overflow-hidden rounded-lg bg-[#cfe3f5] dark:bg-[#0d1b2a]">
        {aktuell ? (
          <Ansicht g={aktuell} stufe={stufe} faktor={stufe === 'schweiz' ? UEBERHOEHT : faktor} wahl={wahl}
                   waehlen={stufe === 'ort' ? undefined : (e, n) => {
                     const r = RASTER_M[stufe], s = FELD_M[stufe]
                     setWahl({ e: Math.round(e / r) * r, n: Math.round(n / r) * r, seite: s })
                   }} eintauchen={() => void eintauchen()} zurueck={eineZurueck} info={info} brilleRef={brille} zusatz={zusatz} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-sbb-metal">Die Schweiz wird geladen …</div>
        )}
        <Ladebalken inKarte />
        <button type="button" onClick={inBrille}
                className="absolute right-2 top-2 rounded-lg bg-sbb-red px-2.5 py-1 text-xs font-bold text-white">
          Mit VR-Brille
        </button>
        {brilleHinweis && (
          <p role="status" className="absolute inset-x-2 top-12 rounded-lg bg-white/95 p-2 text-xs font-medium dark:bg-sbb-midnight/95">{brilleHinweis}</p>
        )}
        {stufe !== 'schweiz' && (
          <div className="absolute left-2 top-2 flex overflow-hidden rounded-lg border border-sbb-cloud bg-white/90 text-xs font-bold dark:border-sbb-iron dark:bg-sbb-midnight/90">
            {([1, 2] as const).map((f) => (
              <button key={f} type="button" aria-pressed={faktor === f} onClick={() => setFaktor(f)}
                      className={`px-2.5 py-1 ${faktor === f ? 'bg-sbb-anthracite text-white' : ''}`}>{f === 1 ? 'Höhe wie echt' : 'Höhe 2-fach'}</button>
            ))}
          </div>
        )}
        {stufe === 'schweiz' && (
          <button type="button" onClick={zufall} className="absolute left-2 top-2 rounded-lg border border-sbb-cloud bg-white/90 px-2.5 py-1 text-xs font-bold dark:border-sbb-iron dark:bg-sbb-midnight/90">
            Überrasch mich
          </button>
        )}
        {wahl && stufe !== 'ort' && (
          <div className="absolute inset-x-2 bottom-2 rounded-lg bg-white/95 p-3 shadow-lg dark:bg-sbb-charcoal/95 md:left-auto md:w-80">
            <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
              Feld {(wahl.seite / 1000).toLocaleString('de-CH')} × {(wahl.seite / 1000).toLocaleString('de-CH')} km{inhalt?.kanton ? ` · Mitte im Kanton ${inhalt.kanton}` : ''}
            </p>
            {inhalt?.orte.length ? <p className="mt-0.5 text-lg font-bold leading-tight">{inhalt.orte.join(', ')}</p>
              : <p className="mt-0.5 text-lg font-bold leading-tight">{inhalt?.gipfel?.name ?? 'Ohne Ort der Landeskarte'}</p>}
            {inhalt?.gipfel && <p className="text-sm">▲ {inhalt.gipfel.name} {inhalt.gipfel.hoehe_m!.toLocaleString('de-CH')} m</p>}
            {inhalt?.seen.length ? <p className="text-sm">≈ {inhalt.seen.join(', ')}</p> : null}
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void eintauchen()} disabled={laedt}
                      className="min-h-11 flex-1 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 disabled:opacity-50">
                {laedt ? 'Wird geladen …' : 'Eintauchen'}
              </button>
              <button type="button" onClick={() => setWahl(null)} className="min-h-11 rounded-lg border border-sbb-cloud px-3 text-sm font-medium dark:border-sbb-iron">
                Andere Wahl
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        {stufe === 'schweiz' ? `Höhe ${UEBERHOEHT}-fach überhöht. ` : faktor === 2 ? 'Höhe 2-fach überhöht. ' : ''}
        Ziehen dreht, zwei Finger oder das Mausrad zoomen.{stufe !== 'ort' && ' Ein Tipp wählt ein Feld.'}
        {aktuell?.hinweis && <> <strong>{aktuell.hinweis}</strong></>}
      </p>
      {aktuell && (
        <details className="klapp mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
          <summary className="flex min-h-9 cursor-pointer items-center underline underline-offset-2">Modell, nicht massstäblich: Quellen</summary>
          <p className="mt-1">Gelände: {aktuell.quellen[0]}. Luftbild: {aktuell.quellen[1]}. Orte der Landeskarte 1:1 Million (swisstopo),
            Gipfel (swisstopo), Seen aus swissTLMRegio (swisstopo), Kantone (BFS). Ein Feld ist ein Quadrat, keine Region und kein Tal:
            deren Grenzen stehen in keiner unserer Quellen.</p>
        </details>
      )}
    </div>
  )
}

/* ---------- die Zeichnung ---------- */

/** Der Sockel unter dem Gelände (Michael, 2026-10-19: «auf einem Holzsockel … wie ein Deko-Element»; vorher liefen die Ränder ins
 *  Leere; danach: «kein Holz mehr sondern eine schwarze Wand, die sich aber dennoch schattieren lässt», «etwas höher»): rundum
 *  eine Wand von der Kante des Geländes bis unter seinen tiefsten Punkt, darunter eine breitere Platte, beide fast schwarz und im
 *  Licht schattiert. Masse als Anteil der Breite des Modells, nicht aus einer Quelle. */
const SOCKEL_WAND = 0.06, SOCKEL_PLATTE = 0.025, SOCKEL_UEBERSTAND = 0.012
const SOCKEL_WAND_FARBE = '#1c1c1c', SOCKEL_PLATTE_FARBE = '#111111'

/** in der Brille: das Modell so breit auf Tischhöhe, so weit vor dir (wie die Modellbahn) */
const BRILLE_BREITE_M = 1.2, BRILLE_TISCH_M = 0.8, BRILLE_ABSTAND_M = 0.9
/** Schrift in der Brille, Höhe eines Schilds in Metern */
const BRILLE_SCHRIFT_M = 0.022

interface Welt {
  setzeWahl: (f: Feld | null) => void
  faktor: (f: number) => void
  brille: () => Promise<void>
}

/**
 * Eine Szene für alle Stufen: Renderer, Kamera und eine laufende Sitzung in der Brille bleiben, nur das Gelände wird neu
 * gebaut. In der Brille (Michael, 2026-10-18: «muss auch immersiv auf der Brille gespielt werden können») steht das Modell
 * auf dem Tisch; der Abzug wählt mit dem Strahl ein Feld, ein zweiter Abzug darauf taucht ein, die Greiftaste geht eine Stufe
 * zurück, der Thumbstick dreht und vergrössert.
 */
function Ansicht({ g, stufe, faktor, wahl, waehlen, eintauchen, zurueck, info, brilleRef, zusatz }: {
  g: Gelaende; stufe: Stufe; faktor: number; wahl: Feld | null; waehlen?: (e: number, n: number) => void
  eintauchen: () => void; zurueck: () => void
  /** was in der Brille über dem gewählten Feld steht */
  info: string[] | null
  brilleRef: React.MutableRefObject<(() => Promise<void>) | null>
  zusatz: Zusatz | null
}) {
  const huelle = useRef<HTMLDivElement>(null)
  const welt = useRef<Welt | null>(null)
  const kern = useRef<{
    renderer: THREE.WebGLRenderer; szene: THREE.Scene; kamera: THREE.PerspectiveCamera; steuerung: OrbitControls
    wurzel: THREE.Group; inBrille: () => boolean; setzeHimmel: () => void
    jeBild: Array<() => void>; wenn: { tipp: ((p: THREE.Vector3) => void) | null; zurueck: () => void }
    tafel: THREE.Sprite; tafelSetzen: (zeilen: string[] | null, ueber?: THREE.Vector3) => void
  } | null>(null)
  const cb = useRef({ waehlen, eintauchen, zurueck })
  cb.current = { waehlen, eintauchen, zurueck }

  // einmal: Renderer, Kamera, Steuerung, Brille
  useEffect(() => {
    const el = huelle.current!
    const dunkel = matchMedia('(prefers-color-scheme: dark)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.xr.enabled = true
    el.appendChild(renderer.domElement)
    const szene = new THREE.Scene()
    const himmel = new THREE.Color(dunkel ? '#0d1b2a' : '#cfe3f5')
    let durchsicht = false
    const setzeHimmel = () => { szene.background = renderer.xr.isPresenting && durchsicht ? null : himmel }
    setzeHimmel()
    const kamera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.01, 2000)
    const steuerung = new OrbitControls(kamera, renderer.domElement)
    steuerung.enableDamping = true
    steuerung.maxPolarAngle = Math.PI * 0.47
    szene.add(new THREE.HemisphereLight('#ffffff', '#8a8070', 1.6))
    const sonne = new THREE.DirectionalLight('#ffffff', 1.4)
    sonne.position.set(-1, 1.2, 0.6)
    szene.add(sonne)
    const wurzel = new THREE.Group()
    szene.add(wurzel)

    // die Tafel in der Brille: Hinweise und was im Feld liegt
    // je Text eine neue Leinwand: eine Textur ändert ihre Grösse nicht mehr, wenn sie einmal auf der Grafikkarte liegt
    let tafelTextur: THREE.CanvasTexture | null = null
    const tafel = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }))
    tafel.renderOrder = 5
    tafel.visible = false
    szene.add(tafel)
    const tafelSetzen = (zeilen: string[] | null, ueber?: THREE.Vector3) => {
      if (!zeilen?.length || !renderer.xr.isPresenting) { tafel.visible = false; return }
      const tafelLeinwand = document.createElement('canvas')
      const x = tafelLeinwand.getContext('2d')!, px = 34
      x.font = `bold ${px}px Helvetica, Arial, sans-serif`
      tafelLeinwand.width = Math.ceil(Math.max(...zeilen.map((z) => x.measureText(z).width))) + 32
      tafelLeinwand.height = zeilen.length * (px + 10) + 22
      x.fillStyle = 'rgba(255,255,255,0.94)'; x.beginPath(); x.roundRect(0, 0, tafelLeinwand.width, tafelLeinwand.height, 14); x.fill()
      zeilen.forEach((z, i) => {
        x.font = `${i === 0 ? 'bold' : 'normal'} ${px}px Helvetica, Arial, sans-serif`
        x.fillStyle = i === 0 ? KARMIN : '#212121'; x.fillText(z, 16, 12 + px + i * (px + 10))
      })
      tafelTextur?.dispose()
      tafelTextur = new THREE.CanvasTexture(tafelLeinwand)
      tafelTextur.colorSpace = THREE.SRGBColorSpace
      tafel.material.map = tafelTextur
      tafel.material.needsUpdate = true
      const h = 0.03 * zeilen.length + 0.015
      tafel.scale.set(h * tafelLeinwand.width / tafelLeinwand.height, h, 1)
      tafel.position.copy(ueber ?? new THREE.Vector3(0, BRILLE_TISCH_M + 0.35, -BRILLE_ABSTAND_M))
      tafel.visible = true
    }

    // Brille: Strahlen der Controller, Abzug wählt, Greiftaste zurück, Thumbstick dreht und vergrössert
    const strahl = new THREE.Raycaster()
    const wenn: { tipp: ((p: THREE.Vector3) => void) | null; zurueck: () => void } = { tipp: null, zurueck: () => cb.current.zurueck() }
    const controller = [0, 1].map((i) => {
      const c = renderer.xr.getController(i)
      const linie = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: KARMIN }))
      linie.scale.z = 3
      c.add(linie)
      c.addEventListener('select', () => {
        const m = new THREE.Matrix4().extractRotation(c.matrixWorld)
        strahl.ray.origin.setFromMatrixPosition(c.matrixWorld)
        strahl.ray.direction.set(0, 0, -1).applyMatrix4(m)
        const boden = wurzel.getObjectByName('boden')
        const t = boden ? strahl.intersectObject(boden, false)[0] : undefined
        if (t) wenn.tipp?.(wurzel.worldToLocal(t.point.clone()))
      })
      c.addEventListener('squeeze', () => wenn.zurueck())
      szene.add(c)
      return c
    })
    let drehung = 0, zoom = 1
    const brilleSetzen = () => {
      const breite = (wurzel.userData.weiteKm as number) || 1
      const s = (BRILLE_BREITE_M / breite) * zoom
      wurzel.scale.setScalar(s)
      wurzel.rotation.y = drehung
      wurzel.position.set(0, BRILLE_TISCH_M - ((wurzel.userData.untenY as (() => number) | undefined)?.() ?? 0) * s, -BRILLE_ABSTAND_M)
      for (const sp of (wurzel.getObjectByName('schilder')?.children ?? []) as THREE.Sprite[]) {
        sp.material.sizeAttenuation = true
        const v = sp.userData.verhaeltnis as number
        sp.scale.set((BRILLE_SCHRIFT_M / s) * v, BRILLE_SCHRIFT_M / s, 1)
      }
    }
    const bildschirmSetzen = () => {
      wurzel.scale.setScalar(1); wurzel.rotation.y = 0; wurzel.position.set(0, 0, 0)
      for (const sp of (wurzel.getObjectByName('schilder')?.children ?? []) as THREE.Sprite[]) {
        sp.material.sizeAttenuation = false
        sp.scale.set(sp.userData.b, sp.userData.h, 1)
      }
      tafel.visible = false
    }
    renderer.xr.addEventListener('sessionend', () => { bildschirmSetzen(); setzeHimmel(); kamera.near = 0.01; kamera.updateProjectionMatrix() })
    brilleRef.current = async () => {
      const xr = navigator.xr
      if (!xr) throw new Error('Kein WebXR')
      durchsicht = await xr.isSessionSupported('immersive-ar').catch(() => false)
      const sitzung = await xr.requestSession(durchsicht ? 'immersive-ar' : 'immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] })
      renderer.xr.setReferenceSpaceType('local-floor')
      kamera.near = 0.01; kamera.updateProjectionMatrix()
      await renderer.xr.setSession(sitzung)
      drehung = 0; zoom = 1
      brilleSetzen(); setzeHimmel()
      tafelSetzen(['3D Schweiz', 'Abzug: Feld wählen, nochmals: eintauchen', 'Greiftaste: eine Stufe zurück', 'Thumbstick: drehen und vergrössern'])
    }
    const jeBild: Array<() => void> = [() => {
      if (!renderer.xr.isPresenting) return
      const sitzung = renderer.xr.getSession()
      for (const q of sitzung?.inputSources ?? []) {
        const a = q.gamepad?.axes
        if (!a || a.length < 4) continue
        if (Math.abs(a[2]) > 0.2) drehung -= a[2] * 0.03
        if (Math.abs(a[3]) > 0.2) zoom = Math.max(0.5, Math.min(6, zoom * (1 - a[3] * 0.02)))
      }
      brilleSetzen()
    }]
    kern.current = { renderer, szene, kamera, steuerung, wurzel, inBrille: () => renderer.xr.isPresenting, setzeHimmel, jeBild, wenn, tafel, tafelSetzen }

    const groesse = () => {
      if (renderer.xr.isPresenting) return
      renderer.setSize(el.clientWidth, el.clientHeight)
      kamera.aspect = el.clientWidth / Math.max(1, el.clientHeight); kamera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(groesse)
    ro.observe(el)
    // Tippen wählt, Ziehen dreht
    let unten: { x: number; y: number; t: number } | null = null
    const runter = (ev: PointerEvent) => { unten = { x: ev.clientX, y: ev.clientY, t: performance.now() } }
    const hoch = (ev: PointerEvent) => {
      const u = unten; unten = null
      if (!u || Math.hypot(ev.clientX - u.x, ev.clientY - u.y) > 8 || performance.now() - u.t > 500) return
      const r = renderer.domElement.getBoundingClientRect()
      strahl.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), kamera)
      const boden = wurzel.getObjectByName('boden')
      const t = boden ? strahl.intersectObject(boden, false)[0] : undefined
      if (t) wenn.tipp?.(wurzel.worldToLocal(t.point.clone()))
    }
    renderer.domElement.addEventListener('pointerdown', runter)
    renderer.domElement.addEventListener('pointerup', hoch)
    renderer.setAnimationLoop(() => {
      for (const f of jeBild) f()
      if (!renderer.xr.isPresenting) steuerung.update()
      renderer.render(szene, kamera)
    })
    return () => {
      renderer.setAnimationLoop(null)
      void renderer.xr.getSession()?.end().catch(() => {})
      ro.disconnect()
      steuerung.dispose()
      renderer.domElement.removeEventListener('pointerdown', runter)
      renderer.domElement.removeEventListener('pointerup', hoch)
      for (const c of controller) szene.remove(c)
      tafelTextur?.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      kern.current = null
      brilleRef.current = null
    }
  }, [brilleRef])

  // je Stufe: das Gelände, die Namen und der Kasten des gewählten Felds
  useEffect(() => {
    const k = kern.current
    if (!k) return
    const { renderer, kamera, steuerung, wurzel } = k
    const dunkel = matchMedia('(prefers-color-scheme: dark)').matches
    const { ost, nord, m, breite, hoehe } = g.raster
    const weite = Math.max(breite, hoehe) * m
    const cE = ost + (breite * m) / 2, cN = nord - (hoehe * m) / 2
    const X = (e: number) => (e - cE) / 1000, Z = (n: number) => -(n - cN) / 1000
    let f = faktor
    const Y = (z: number) => (z / 1000) * f
    wurzel.userData.weiteKm = weite / 1000
    const leer = g.h.reduce((a, z) => (z !== KEINE_HOEHE && z < a ? z : a), Infinity)
    const tief = leer === Infinity ? 0 : leer
    let mittel = 0, zahl = 0
    for (let q = 0; q < g.h.length; q += 7) if (g.h[q] !== KEINE_HOEHE) { mittel += g.h[q]; zahl++ }
    mittel = zahl ? mittel / zahl : tief
    const weiteKm = weite / 1000
    const wand = weiteKm * SOCKEL_WAND, platte = weiteKm * SOCKEL_PLATTE, ueber = weiteKm * SOCKEL_UEBERSTAND
    // in der Brille steht der Sockel auf dem Tisch
    wurzel.userData.untenY = () => Y(tief) - wand - platte
    if (!renderer.xr.isPresenting) {
      kamera.far = weite / 1000 * 6; kamera.updateProjectionMatrix()
      // so weit weg, dass das ganze Modell mit dem Sockel ins Bild passt, auch im Hochformat
      const halbeSicht = Math.atan(Math.tan((kamera.fov * Math.PI) / 360) * Math.min(1, kamera.aspect))
      // schräg von Südwesten, der Blick nach Nordosten (Michael, 2026-10-19): so sieht man zwei Seiten des Sockels (die Diagonale
      // ist 1,41-mal so breit); x zeigt nach Osten, z nach Süden
      const abstand = (weite / 1000) * 0.8 / Math.tan(halbeSicht)
      kamera.position.set(-abstand * 0.55, Y(mittel) + abstand * 0.62, abstand * 0.55)
      steuerung.target.set(0, Y(mittel), 0)
      steuerung.minDistance = weite / 1000 * 0.02
      steuerung.maxDistance = weite / 1000 * 2
      steuerung.update()
    }

    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(breite * hoehe * 3), uv = new Float32Array(breite * hoehe * 2)
    const hoeheSetzen = () => {
      for (let j = 0; j < hoehe; j++) {
        for (let i = 0; i < breite; i++) {
          const q = j * breite + i, z = g.h[q] === KEINE_HOEHE ? leer : g.h[q]
          pos[q * 3] = X(ost + (i + 0.5) * m); pos[q * 3 + 1] = Y(z); pos[q * 3 + 2] = Z(nord - (j + 0.5) * m)
        }
      }
      if (geo.attributes.position) geo.attributes.position.needsUpdate = true
      geo.computeVertexNormals()
    }
    for (let j = 0; j < hoehe; j++) for (let i = 0; i < breite; i++) { uv[(j * breite + i) * 2] = (i + 0.5) / breite; uv[(j * breite + i) * 2 + 1] = 1 - (j + 0.5) / hoehe }
    const idx = new Uint32Array((breite - 1) * (hoehe - 1) * 6)
    let w = 0
    for (let j = 0; j < hoehe - 1; j++) for (let i = 0; i < breite - 1; i++) {
      const a = j * breite + i
      idx[w++] = a; idx[w++] = a + breite; idx[w++] = a + 1; idx[w++] = a + 1; idx[w++] = a + breite; idx[w++] = a + breite + 1
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1))
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    hoeheSetzen()
    const textur = new THREE.CanvasTexture(g.bild)
    textur.colorSpace = THREE.SRGBColorSpace
    textur.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const boden = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: textur }))
    boden.name = 'boden'
    wurzel.add(boden)

    // der Sockel, neu bei jeder Höhe
    const sockel = new THREE.Group()
    wurzel.add(sockel)
    // matt, damit die Seiten im Licht verschieden hell sind
    const wandMaterial = new THREE.MeshStandardMaterial({ color: SOCKEL_WAND_FARBE, roughness: 0.55, metalness: 0, side: THREE.DoubleSide })
    const platteMaterial = new THREE.MeshStandardMaterial({ color: SOCKEL_PLATTE_FARBE, roughness: 0.5, metalness: 0 })
    const sockelBauen = () => {
      for (const o of sockel.children) (o as THREE.Mesh).geometry.dispose()
      sockel.clear()
      const unten = Y(tief) - wand
      // die vier Kanten des Geländes als Punktfolgen (Index der Felder)
      const kanten: number[][] = [
        Array.from({ length: breite }, (_, i) => i),
        Array.from({ length: hoehe }, (_, j) => j * breite + breite - 1),
        Array.from({ length: breite }, (_, i) => (hoehe - 1) * breite + breite - 1 - i),
        Array.from({ length: hoehe }, (_, j) => (hoehe - 1 - j) * breite),
      ]
      for (const kante of kanten) {
        const p = new Float32Array(kante.length * 6)
        kante.forEach((q, i) => {
          const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2]
          p.set([x, y, z, x, unten, z], i * 6)
        })
        const ix: number[] = []
        for (let i = 0; i < kante.length - 1; i++) ix.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3)
        const gw = new THREE.BufferGeometry()
        gw.setAttribute('position', new THREE.BufferAttribute(p, 3))
        gw.setIndex(ix)
        gw.computeVertexNormals()
        sockel.add(new THREE.Mesh(gw, wandMaterial))
      }
      // die Platte darunter, etwas breiter
      const bx = (breite - 1) * m / 1000 + 2 * ueber, bz = (hoehe - 1) * m / 1000 + 2 * ueber
      const gp = new THREE.BoxGeometry(bx, platte, bz)
      const pl = new THREE.Mesh(gp, platteMaterial)
      pl.position.set(0, unten - platte / 2, 0)
      sockel.add(pl)
    }
    sockelBauen()

    // Namen: Gipfel und Orte, auf dem Bildschirm in fester Grösse, in der Brille in Metern
    const schilder = new THREE.Group()
    schilder.name = 'schilder'
    wurzel.add(schilder)
    const schild = (text: string, farbe: string, e: number, n: number, z: number) => {
      const c = document.createElement('canvas'), x = c.getContext('2d')!
      const px = 26
      x.font = `bold ${px}px Helvetica, Arial, sans-serif`
      c.width = Math.ceil(x.measureText(text).width) + 16; c.height = px + 12
      x.font = `bold ${px}px Helvetica, Arial, sans-serif`
      x.fillStyle = dunkel ? 'rgba(20,20,20,0.8)' : 'rgba(255,255,255,0.85)'
      x.beginPath(); x.roundRect(0, 0, c.width, c.height, 6); x.fill()
      x.fillStyle = farbe; x.fillText(text, 8, px)
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false }))
      sp.userData = { e, n, z, b: c.width * 0.0009, h: c.height * 0.0009, verhaeltnis: c.width / c.height }
      sp.scale.set(sp.userData.b, sp.userData.h, 1)
      sp.center.set(0.5, 0)
      sp.position.set(X(e), Y(z), Z(n))
      sp.renderOrder = 3
      schilder.add(sp)
    }
    const drin = (e: number, n: number) => e > ost && e < ost + breite * m && n < nord && n > nord - hoehe * m
    if (zusatz) {
      const gipfel = zusatz.sw.gipfel.filter((x) => x.hoehe_m !== null).map((x) => ({ x, l: lv95(x.lage[0], x.lage[1]) }))
        .filter(({ l }) => drin(l[0], l[1])).sort((a, b) => b.x.hoehe_m! - a.x.hoehe_m!)
      const anzahl = stufe === 'schweiz' ? 8 : stufe === 'region' ? 25 : 10
      for (const { x, l } of gipfel.slice(0, anzahl)) schild(`▲ ${x.name} ${x.hoehe_m!.toLocaleString('de-CH')}`, dunkel ? '#e2c9a8' : '#7a4a14', l[0], l[1], x.hoehe_m!)
      const orte = zusatz.orte.map((o) => ({ o, l: lv95(o.lage[0], o.lage[1]) })).filter(({ o, l }) => drin(l[0], l[1]) && (stufe !== 'schweiz' || o.klasse >= 4))
      for (const { o, l } of orte) schild(o.name, dunkel ? '#ffffff' : '#212121', l[0], l[1], hoeheIm(g, l[0], l[1]) + 30)
    }

    // das gewählte Feld: ein gläserner Kasten in Karmin über dem Gelände
    const kasten = new THREE.Group()
    wurzel.add(kasten)
    const kastenMaterial = new THREE.MeshBasicMaterial({ color: KARMIN, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    const kantenMaterial = new THREE.LineBasicMaterial({ color: KARMIN })
    let feldJetzt: Feld | null = null
    const setzeWahl = (fd: Feld | null) => {
      feldJetzt = fd
      for (const o of kasten.children) (o as THREE.Mesh).geometry.dispose()
      kasten.clear()
      if (!fd) return
      let hoch = 0
      for (let j = 0; j <= 10; j++) for (let i = 0; i <= 10; i++) hoch = Math.max(hoch, hoeheIm(g, fd.e - fd.seite / 2 + (i * fd.seite) / 10, fd.n - fd.seite / 2 + (j * fd.seite) / 10))
      const b = fd.seite / 1000, y0 = Y((leer === Infinity ? 0 : leer) - 50), y1 = Y(hoch) + b * 0.15
      const box = new THREE.BoxGeometry(b, y1 - y0, b)
      const mesh = new THREE.Mesh(box, kastenMaterial)
      const kanten = new THREE.LineSegments(new THREE.EdgesGeometry(box), kantenMaterial)
      for (const o of [mesh, kanten]) { o.position.set(X(fd.e), (y0 + y1) / 2, Z(fd.n)); kasten.add(o) }
    }
    // ein Tipp oder Abzug: ins gewählte Feld nochmals in der Brille taucht ein, sonst ein neues Feld
    k.wenn.tipp = (p) => {
      const e = cE + p.x * 1000, n = cN - p.z * 1000
      const fd = feldJetzt
      if (k.inBrille() && fd && Math.abs(e - fd.e) <= fd.seite / 2 && Math.abs(n - fd.n) <= fd.seite / 2) { cb.current.eintauchen(); return }
      cb.current.waehlen?.(e, n)
    }
    welt.current = {
      setzeWahl,
      faktor: (nf) => {
        f = nf; hoeheSetzen(); sockelBauen()
        for (const sp of schilder.children) sp.position.y = Y(sp.userData.z)
        setzeWahl(feldJetzt)
      },
      brille: async () => { await brilleRef.current?.() },
    }
    // in der Brille gleich die neue Grösse
    if (renderer.xr.isPresenting) k.jeBild[0]()
    return () => {
      k.wenn.tipp = null
      for (const o of [...wurzel.children]) {
        o.traverse((x) => {
          const q = x as THREE.Mesh
          q.geometry?.dispose()
          const mat = q.material as (THREE.Material & { map?: THREE.Texture }) | undefined
          mat?.map?.dispose(); mat?.dispose?.()
        })
        wurzel.remove(o)
      }
      textur.dispose()
      welt.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, stufe, zusatz])
  useEffect(() => { welt.current?.faktor(faktor) }, [faktor])
  useEffect(() => {
    welt.current?.setzeWahl(wahl)
    const k = kern.current
    if (k?.inBrille()) {
      k.tafelSetzen(info && wahl ? [...info, 'Nochmals Abzug: eintauchen'] : stufe === 'ort' ? ['Greiftaste: zurück'] : null)
    }
  }, [wahl, info, stufe, g])
  return <div ref={huelle} className="absolute inset-0 touch-none" />
}
