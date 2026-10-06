import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { bodenbedeckungLaden, flaechenLaden, holen, holenBinaer, seenLaden, sehenswertLaden } from '../daten'
import type { BodenbedeckungDaten, FlaechenDaten, KodierterZug, SeenDaten, SehenswertDaten } from '../typen'
import type { FahrObjekt, Fahrweg } from '../fahrt'
import { lv95 } from '../relief'
import { Zurueck } from './Zurueck'
import { Ladefehler } from './Ladefehler'
import { type Kategorie, SehenswertLegende, useVersteckt } from './Sehenswert'

/**
 * 3D-Relief einer Strecke (Michael, 2026-10-06: zuerst die Gotthard-Bergstrecke, im Browser,
 * später auch mit Brille). Gelände aus swissALTIRegio, Linie, Tunnel, Brücken, Bahnhöfe und
 * Gipfel aus data/relief/{name}.json (pipeline/build_relief.py). Gezeichnet mit three.js, das
 * mit der App ausgeliefert und erst hier geladen wird.
 *
 * Zwei Verwendungen: die eigene Seite (#/relief/gotthard) mit der Linie, und beim Fahren als
 * Ansicht «3D» mit dem Weg der Fahrt und dem Zug, dem die Kamera folgt (ReliefFahrt).
 *
 * Ehrlich bleibt: Die Höhe der Gleise steht in keiner Quelle. Die Linie liegt auf dem Gelände,
 * im Tunnel und auf Brücken gerade zwischen den beiden Enden; das steht dabei. Ist die Höhe
 * überhöht, steht der Faktor sichtbar daneben.
 */

interface Relief {
  titel: string; linie: string; linie_name: string; von_km: number; bis_km: number; datenstand: string
  /** mehrere Linien hintereinander; der Weg zählt dann Meter ab dem Anfang, nicht die Kilometrierung */
  teile?: Array<{ linie: string; linie_name: string; von_km: number; bis_km: number }>
  quellen: string[]
  /** bei Linien anderer Bahnen: woher Tunnel und Brücken kommen */
  hinweis?: string
  raster: { ost: number; nord: number; m: number; breite: number; hoehe: number; datei: string }
  /** [Meter der Kilometrierung, Ost, Nord] */
  weg: Array<[number, number, number]>
  bahnhoefe: Array<{ uic: number; name: string; km: number; lage: [number, number] }>
  tunnel: Array<{ name: string | null; laenge_m: number | null; km: number; von_km?: number; bis_km?: number; galerie?: boolean }>
  bruecken: Array<{ name: string | null; von_km: number; bis_km: number; laenge_m: number | null }>
  gipfel: Array<{ name: string; hoehe_m: number; lage: [number, number] }>
}

/** Ein Weg im Relief: Punkte mit ihrer Stelle in Metern, dazu Tunnel und Brücken als Bereiche */
interface Weg {
  punkte: Array<{ m: number; e: number; n: number }>
  bauwerke: Array<{ von: number; bis: number; art: 'tunnel' | 'bruecke' }>
  /** Punkte von Tunneln ohne bekanntes Ende */
  tunnelPunkte: number[]
  /** nur diese Stücke zeichnen (beim Fahren: was im Ausschnitt liegt) */
  stuecke: Array<[number, number]>
}

/** jedes wievielte Feld des Rasters ins Netz kommt; 2 hält das Netz auch auf dem Handy flüssig */
const SCHRITT = 2
/** die Linie liegt so viel über dem Gelände, damit sie nicht darin verschwindet */
const UEBER_M = 25

const FARBEN = {
  linie: '#a8102e', weg: '#212121', tunnel: '#212121', bruecke: '#b45309', bahnhof: '#1e3a8a', gipfel: '#5b3a1e', zug: '#a8102e',
}

function useRelief(name: string | null) {
  const [daten, setDaten] = useState<{ r: Relief; h: Uint16Array } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => {
    if (!name) return
    holen<Relief>(`data/relief/${name}.json`)
      .then(async (r) => setDaten({ r, h: new Uint16Array(await holenBinaer(`data/relief/${r.raster.datei}`)) }))
      .catch((e: Error) => setFehler(e.message))
  }, [name])
  return { daten, fehler }
}

/** Was die Karten sonst zeigen, auch im Relief (Michael, 2026-10-06: «die Elemente wie bei anderen
 *  Probefahrten ein- und ausblenden»): Kulturgüter, Seilbahnen, Gebiete, Wald und Siedlung. Fehlt
 *  eine Datei, bleibt das Relief ohne sie. */
interface Zusatz { s: SehenswertDaten | null; f: FlaechenDaten | null; b: BodenbedeckungDaten | null; seen: SeenDaten | null }

function useZusatz() {
  const [z, setZ] = useState<Zusatz | null>(null)
  useEffect(() => {
    let ab = false
    void Promise.all([sehenswertLaden().catch(() => null), flaechenLaden().catch(() => null), bodenbedeckungLaden().catch(() => null),
      seenLaden().catch(() => null)])
      .then(([s, f, b, seen]) => { if (!ab) setZ({ s, f, b, seen }) })
    return () => { ab = true }
  }, [])
  return z
}

/** Breite und Länge eines kodierten Zugs (Hunderttausendstel, als Differenzen) */
function zugLesen(z: KodierterZug, faktor = 1e5): Array<[number, number]> {
  let [la, lo] = z.start
  const raus: Array<[number, number]> = [lv95(la / faktor, lo / faktor)]
  for (let i = 0; i < z.d.length; i += 2) {
    la += z.d[i]; lo += z.d[i + 1]
    raus.push(lv95(la / faktor, lo / faktor))
  }
  return raus
}

/** Ein Ring, abgeschnitten am Rechteck (Sutherland-Hodgman); eck im Uhrzeigersinn in Ost, Nord */
function zugInRahmen(ring: Array<[number, number]>, eck: Array<[number, number]>) {
  let aus = ring
  for (let k = 0; k < 4 && aus.length; k++) {
    const [ax, ay] = eck[k], [bx, by] = eck[(k + 1) % 4]
    const innen = ([x, y]: [number, number]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax) <= 0
    const schnitt = (p: [number, number], q: [number, number]): [number, number] => {
      const d1 = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax), d2 = (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax)
      const t = d1 / ((d1 - d2) || 1)
      return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]
    }
    const ein = aus
    aus = []
    ein.forEach((p, i) => {
      const q = ein[(i + 1) % ein.length]
      if (innen(p)) { aus.push(p); if (!innen(q)) aus.push(schnitt(p, q)) }
      else if (innen(q)) aus.push(schnitt(p, q))
    })
  }
  return aus
}

/** Flächen im Ausschnitt eines Reliefs in Landeskoordinaten, je Relief einmal gerechnet */
interface Auflage { wald: Array<Array<[number, number]>>; siedlung: Array<Array<[number, number]>>; gebiete: Array<{ art: string; ringe: Array<Array<[number, number]>> }> }
const auflagen = new WeakMap<Relief, Auflage>()
function auflageFuer(r: Relief, z: Zusatz): Auflage {
  const fertig = auflagen.get(r)
  if (fertig) return fertig
  const { ost, nord, m, breite, hoehe } = r.raster
  const ueberlappt = (pts: Array<[number, number]>) => {
    let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity
    for (const [e, n] of pts) { e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, n); n1 = Math.max(n1, n) }
    return e1 >= ost && e0 <= ost + breite * m && n1 >= nord - hoehe * m && n0 <= nord
  }
  const ringe = (zuege: KodierterZug[], faktor?: number) => zuege.map((x) => zugLesen(x, faktor)).filter(ueberlappt)
  const a: Auflage = {
    wald: z.b ? ringe(z.b.wald, z.b.faktor) : [],
    siedlung: z.b ? ringe(z.b.siedlung, z.b.faktor) : [],
    gebiete: (z.f?.flaechen ?? []).map((g) => ({ art: g.art, ringe: ringe(g.ringe) })).filter((g) => g.ringe.length),
  }
  auflagen.set(r, a)
  return a
}

/* ---------- die eigene Seite ---------- */

export default function ReliefSeite({ name, zurueck }: { name: string; zurueck?: { text: string; adresse: string } }) {
  const { daten, fehler } = useRelief(name)
  const [faktor, setFaktor] = useState<1 | 2>(1)
  const weg = useMemo(() => (daten ? wegDerLinie(daten.r) : null), [daten])

  return (
    <div className="px-4 pb-4">
      {/* zurück zur Linie des Reliefs, sonst zu allen Strecken */}
      <Zurueck onClick={() => { window.location.hash = zurueck?.adresse ?? (daten ? `#/linie/${daten.r.linie}` : '#/strecken') }}
               text={zurueck?.text ?? (daten ? `Linie ${daten.r.linie}` : 'Alle Strecken')} />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{daten?.r.titel ?? '3D-Relief'} in 3D</h1>
      {daten && (
        <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
          {(daten.r.teile ?? [daten.r]).map((t) => `Linie ${t.linie} ${t.linie_name}, Kilometer ${t.von_km.toLocaleString('de-CH')} bis ${t.bis_km.toLocaleString('de-CH')}`).join('; dann ')}
        </p>
      )}
      {fehler && <Ladefehler className="mt-6" was="Das Relief konnte nicht geladen werden." fehler={fehler} />}
      {!daten && !fehler && <p className="mt-6 text-sbb-metal">Das Relief wird geladen …</p>}
      {daten && weg && (
        <>
          <div className="mt-4"><FaktorWahl faktor={faktor} setFaktor={setFaktor} /></div>
          <Szene r={daten.r} h={daten.h} faktor={faktor} weg={weg} wegFarbe={FARBEN.linie}
                 className="mt-3 w-full overflow-hidden rounded-lg" />
          <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
            Drehen mit einem Finger, zoomen mit zwei, verschieben mit zwei Fingern oder der rechten Maustaste.
            Namen, die sich überdecken würden, erscheinen beim Heranzoomen.
            {faktor === 2 && <span className="font-medium text-sbb-black dark:text-sbb-white"> Die Höhe ist 2-fach überhöht.</span>}
          </p>
          <Legende wegText="Linie" wegFarbe={FARBEN.linie} />
          <div className="mt-2"><SehenswertLegende gebieteMitBoden kmNetz /></div>
          <Hinweise r={daten.r} />
        </>
      )}
    </div>
  )
}

function FaktorWahl({ faktor, setFaktor, klein = false }: { faktor: 1 | 2; setFaktor: (f: 1 | 2) => void; klein?: boolean }) {
  return (
    <div className="segmente inline-grid grid-cols-2" role="radiogroup" aria-label="Höhe">
      {([1, 2] as const).map((f) => (
        <button key={f} type="button" aria-pressed={faktor === f} onClick={() => setFaktor(f)}
                className={`segment ${klein ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}>{f === 1 ? 'Höhe wie echt' : 'Höhe 2-fach'}</button>
      ))}
    </div>
  )
}

function Legende({ wegText, wegFarbe, zug = false }: { wegText: string; wegFarbe: string; zug?: boolean }) {
  const dunkel = window.matchMedia('(prefers-color-scheme: dark)').matches
  // im Dunkeln heller, sonst verschwindet der Strich auf dem schwarzen Grund
  const hell = (f: string) => (dunkel && f === '#212121' ? '#b5b5b5' : f)
  const strich = (farbe: string, gestrichelt = false) => (
    <span aria-hidden="true" className="inline-block h-1 w-6 rounded"
          style={{ background: gestrichelt ? `repeating-linear-gradient(90deg, ${hell(farbe)} 0 5px, transparent 5px 8px)` : hell(farbe) }} />
  )
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {zug && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-full" style={{ background: FARBEN.zug }} /> Zug</li>}
      <li className="flex items-center gap-1.5">{strich(wegFarbe)} {wegText}</li>
      <li className="flex items-center gap-1.5">{strich(FARBEN.tunnel, true)} Tunnel</li>
      <li className="flex items-center gap-1.5">{strich(FARBEN.bruecke)} Brücke</li>
      <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: FARBEN.bahnhof }} /> Bahnhof</li>
      <li className="flex items-center gap-1.5"><span aria-hidden="true" style={{ color: FARBEN.gipfel }}>▲</span> Gipfel</li>
    </ul>
  )
}

function Hinweise({ r }: { r: Relief }) {
  const ohneEnde = r.tunnel.filter((t) => t.von_km === undefined)
  return (
    <div className="mt-4 space-y-2 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
      <p>
        Die Höhe der Gleise steht in keiner Quelle. Die Linie ist darum auf das Gelände gelegt, etwas darüber;
        in Tunneln und auf Brücken gerade zwischen ihren beiden Enden. Das zeigt den Verlauf, nicht die
        Höhe der Gleise. Das Gelände ist auf {r.raster.m} m gemittelt; Felsen, Einschnitte und Mauern sind
        darin nicht zu sehen.
      </p>
      {ohneEnde.length > 0 && (
        <p>
          Wo ein Tunnel anfängt und endet, geben die Daten nicht bei allen her. Diese stehen als Punkt beim
          Kilometer der SBB: {ohneEnde.map((t) => t.name ?? 'ohne Namen').join(', ')}.
        </p>
      )}
      {r.hinweis && <p>{r.hinweis} Galerien sind wie Tunnel gezeichnet.</p>}
      <p>Brücken nur, wo Anfang und Ende bekannt sind. Gipfel nur aus Swiss Map Vector 1000.</p>
      <p>Seen aus swissTLMRegio (swisstopo) wie auf den Karten, Seen unter 0,1 km² fehlen; flach gezeichnet auf der
        mittleren Höhe ihres Ufers im Gelände, nicht auf einem gemessenen Seespiegel.</p>
      <p>Kulturgüter von nationaler Bedeutung (BABS), Seilbahnen mit Bundeskonzession (BAV), Gebiete (BAFU), Wald und
        Siedlung (swissTLMRegio) wie auf den Karten. Seilbahnen sind gerade von Station zu Station gezogen; wie hoch
        das Seil hängt, steht in keiner Quelle. Das Kilometernetz folgt den Landeskoordinaten (LV95), eine Linie je
        Kilometer, kräftiger alle 10 km.</p>
      <p>Quellen: {r.quellen.join('; ')}. Datenstand der Linie {r.datenstand.split('-').map(Number).reverse().join('.')}.</p>
    </div>
  )
}

/** Die Linie des Reliefs als Weg, Meter der Kilometrierung */
function wegDerLinie(r: Relief): Weg {
  return {
    punkte: r.weg.map(([m, e, n]) => ({ m, e, n })),
    bauwerke: [
      ...r.tunnel.filter((t) => t.von_km !== undefined).map((t) => ({ von: t.von_km! * 1000, bis: t.bis_km! * 1000, art: 'tunnel' as const })),
      ...r.bruecken.map((b) => ({ von: b.von_km * 1000, bis: b.bis_km * 1000, art: 'bruecke' as const })),
    ],
    tunnelPunkte: r.tunnel.filter((t) => t.von_km === undefined).map((t) => t.km * 1000),
    stuecke: [[r.weg[0][0], r.weg[r.weg.length - 1][0]]],
  }
}

/* ---------- beim Fahren ---------- */

/** Der Weg einer Fahrt im Ausschnitt des Reliefs, Meter entlang des Wegs */
function wegDerFahrt(r: Relief, fahrweg: Fahrweg, objekte: FahrObjekt[]): Weg {
  const { ost, nord, m, breite, hoehe } = r.raster
  const drin = (e: number, n: number) => e >= ost && e <= ost + breite * m && n <= nord && n >= nord - hoehe * m
  const punkte = fahrweg.punkte.map((p) => { const [e, n] = lv95(p.lat, p.lon); return { m: p.s, e, n } })
  // zusammenhängende Stücke im Ausschnitt
  const stuecke: Array<[number, number]> = []
  let anfang: number | null = null
  punkte.forEach((p, i) => {
    if (drin(p.e, p.n)) { anfang ??= p.m }
    else if (anfang !== null) { stuecke.push([anfang, punkte[i - 1].m]); anfang = null }
  })
  if (anfang !== null) stuecke.push([anfang, punkte[punkte.length - 1].m])
  return {
    punkte,
    bauwerke: objekte.filter((o) => (o.art === 'tunnel' || o.art === 'bruecke') && o.sAus !== null)
      .map((o) => ({ von: o.s, bis: o.sAus!, art: o.art as 'tunnel' | 'bruecke' })),
    tunnelPunkte: objekte.filter((o) => o.art === 'tunnel' && o.sAus === null).map((o) => o.s),
    stuecke,
  }
}

/**
 * «3D» beim Fahren und in der Probefahrt (Michael, 2026-10-06: «auf eine Probefahrt oder echte
 * Fahrt projizieren»): der Weg der Fahrt im Relief, der Zug als roter Punkt, die Kamera folgt
 * ihm; drehen und zoomen bleibt möglich.
 */
export function ReliefFahrt({ name, fahrweg, objekte, sJetzt, className }: {
  name: string; fahrweg: Fahrweg; objekte: FahrObjekt[]; sJetzt: number | null; className: string
}) {
  const { daten, fehler } = useRelief(name)
  const [faktor, setFaktor] = useState<1 | 2>(1)
  const zug = useRef<number | null>(sJetzt)
  useEffect(() => { zug.current = sJetzt }, [sJetzt])
  const weg = useMemo(() => (daten ? wegDerFahrt(daten.r, fahrweg, objekte) : null), [daten, fahrweg, objekte])
  if (fehler) return <div className={className}><Ladefehler was="Das Relief konnte nicht geladen werden." fehler={fehler} /></div>
  if (!daten || !weg) return <div className={`${className} flex items-center justify-center text-sm text-sbb-metal`}>Das Relief wird geladen …</div>
  return (
    <>
      <div className={`${className} relative`}>
        <Szene r={daten.r} h={daten.h} faktor={faktor} weg={weg} wegFarbe={FARBEN.weg} zug={zug}
               className="absolute inset-0 overflow-hidden" />
        <div className="absolute left-2 top-2"><FaktorWahl faktor={faktor} setFaktor={setFaktor} klein /></div>
      </div>
      <p className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
        {daten.r.titel}: Gelände aus swissALTIRegio (swisstopo). Die Höhe der Gleise steht in keiner Quelle; der Weg ist
        aufs Gelände gelegt, in Tunneln und auf Brücken gerade zwischen den Enden.
        {faktor === 2 && ' Höhe 2-fach überhöht.'}
      </p>
    </>
  )
}

/* ---------- die Zeichnung ---------- */

/** Höhe im Raster bei Ost, Nord, zwischen den Feldern linear */
function hoeheBei(r: Relief, h: Uint16Array, e: number, n: number) {
  const { ost, nord, m, breite, hoehe } = r.raster
  const x = Math.max(0, Math.min(breite - 1.001, (e - ost) / m - 0.5))
  const y = Math.max(0, Math.min(hoehe - 1.001, (nord - n) / m - 0.5))
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  const z = (i: number, j: number) => h[j * breite + i]
  return z(x0, y0) * (1 - fx) * (1 - fy) + z(x0 + 1, y0) * fx * (1 - fy) + z(x0, y0 + 1) * (1 - fx) * fy + z(x0 + 1, y0 + 1) * fx * fy
}

/** Farbe des Geländes nach Höhe, in denselben Stufen wie die Karten (1000, 2000, 3000 m) */
function hoehenFarbe(z: number, c: THREE.Color) {
  const stufen: Array<[number, string]> = [[300, '#cfd8c4'], [1000, '#d8d5c2'], [2000, '#c9c2b4'], [3000, '#e4e2de'], [3600, '#f4f4f4']]
  let i = 0
  while (i < stufen.length - 2 && z > stufen[i + 1][0]) i++
  const [z0, a] = stufen[i], [z1, b] = stufen[i + 1]
  return c.set(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, (z - z0) / (z1 - z0))))
}

function Szene({ r, h, faktor, weg, wegFarbe, zug, className }: {
  r: Relief; h: Uint16Array; faktor: 1 | 2; weg: Weg; wegFarbe: string
  /** beim Fahren: die Stelle des Zugs in Metern entlang des Wegs, laufend nachgeführt */
  zug?: React.RefObject<number | null>
  className: string
}) {
  const rahmen = useRef<HTMLDivElement>(null)
  const zusatz = useZusatz()
  const aus = useVersteckt()
  const ausJetzt = useRef(aus)
  const anwenden = useRef<((a: Set<Kategorie>) => void) | null>(null)
  // ein- und ausblenden, ohne das Relief neu zu bauen
  useEffect(() => { ausJetzt.current = aus; anwenden.current?.(aus) }, [aus])
  useEffect(() => {
    const el = rahmen.current
    if (!el) return
    const dunkel = window.matchMedia('(prefers-color-scheme: dark)').matches
    const { ost, nord, m, breite, hoehe } = r.raster
    // Mitte des Ausschnitts; eine Einheit ist ein Kilometer
    const me = ost + (breite * m) / 2, mn = nord - (hoehe * m) / 2
    const X = (e: number) => (e - me) / 1000
    const Z = (n: number) => -(n - mn) / 1000
    const Y = (hm: number) => (hm * faktor) / 1000

    const szene = new THREE.Scene()
    szene.background = new THREE.Color(dunkel ? '#141414' : '#f6f6f6')
    const kamera = new THREE.PerspectiveCamera(40, 1, 0.1, 500)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.touchAction = 'none'
    el.appendChild(renderer.domElement)

    // Gelände als Netz, jedes SCHRITT-te Feld
    const nx = Math.floor((breite - 1) / SCHRITT) + 1, ny = Math.floor((hoehe - 1) / SCHRITT) + 1
    const pos = new Float32Array(nx * ny * 3), farben = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2)
    const c = new THREE.Color()
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const gi = i * SCHRITT, gj = j * SCHRITT
        const z = h[gj * breite + gi]
        const k = (j * nx + i) * 3
        pos[k] = X(ost + (gi + 0.5) * m); pos[k + 1] = Y(z); pos[k + 2] = Z(nord - (gj + 0.5) * m)
        hoehenFarbe(z, c)
        farben[k] = c.r; farben[k + 1] = c.g; farben[k + 2] = c.b
        uv[(j * nx + i) * 2] = (gi + 0.5) / breite; uv[(j * nx + i) * 2 + 1] = 1 - (gj + 0.5) / hoehe
      }
    }
    const index = new Uint32Array((nx - 1) * (ny - 1) * 6)
    let q = 0
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, d = a + nx, e2 = d + 1
        index[q++] = a; index[q++] = d; index[q++] = b
        index[q++] = b; index[q++] = d; index[q++] = e2
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(farben, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    geo.computeVertexNormals()
    // Auflage auf dem Gelände: Wald, Siedlung, Gebiete und das Kilometernetz, auf eine Leinwand gemalt,
    // die über das Gelände gespannt ist (weiss lässt die Farbe des Geländes, wie sie ist)
    const PX = 2048 / Math.max(breite, hoehe)
    const leinwand = document.createElement('canvas')
    leinwand.width = Math.round(breite * PX); leinwand.height = Math.round(hoehe * PX)
    const lctx = leinwand.getContext('2d')!
    const lx = (e: number) => ((e - ost) / m) * PX, ly = (n: number) => ((nord - n) / m) * PX
    const auflageTextur = new THREE.CanvasTexture(leinwand)
    auflageTextur.colorSpace = THREE.SRGBColorSpace
    auflageTextur.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const auflage = zusatz ? auflageFuer(r, zusatz) : null
    const flaecheMalen = (ringe: Array<Array<[number, number]>>, fuellung: string, rand?: string) => {
      lctx.beginPath()
      for (const ring of ringe) {
        ring.forEach(([e, n], i) => (i ? lctx.lineTo(lx(e), ly(n)) : lctx.moveTo(lx(e), ly(n))))
        lctx.closePath()
      }
      lctx.fillStyle = fuellung; lctx.fill('evenodd')
      if (rand) { lctx.strokeStyle = rand; lctx.lineWidth = 1.5; lctx.stroke() }
    }
    const GEBIET: Record<string, [string, string]> = {
      bln: ['rgba(185, 211, 163, 0.35)', '#9dbf84'], park: ['rgba(127, 174, 102, 0.3)', '#6f9e57'], moor: ['rgba(201, 194, 154, 0.4)', '#b0a77a'],
    }
    const auflageMalen = (a: Set<Kategorie>) => {
      lctx.fillStyle = '#ffffff'
      lctx.fillRect(0, 0, leinwand.width, leinwand.height)
      if (auflage && !a.has('boden')) {
        flaecheMalen(auflage.wald, 'rgba(118, 168, 92, 0.4)')
        flaecheMalen(auflage.siedlung, 'rgba(140, 128, 118, 0.4)')
      }
      if (auflage && !a.has('gebiete')) {
        for (const g of auflage.gebiete) flaecheMalen(g.ringe, ...(GEBIET[g.art] ?? GEBIET.bln))
      }
      if (!a.has('kmnetz')) {
        // Landeskoordinaten: eine Linie je Kilometer, alle 10 km kräftiger
        for (let e = Math.ceil(ost / 1000) * 1000; e <= ost + breite * m; e += 1000) {
          lctx.strokeStyle = e % 10000 === 0 ? 'rgba(60, 60, 60, 0.55)' : 'rgba(60, 60, 60, 0.28)'
          lctx.lineWidth = e % 10000 === 0 ? 2 : 1
          lctx.beginPath(); lctx.moveTo(lx(e), 0); lctx.lineTo(lx(e), leinwand.height); lctx.stroke()
        }
        for (let n = Math.ceil((nord - hoehe * m) / 1000) * 1000; n <= nord; n += 1000) {
          lctx.strokeStyle = n % 10000 === 0 ? 'rgba(60, 60, 60, 0.55)' : 'rgba(60, 60, 60, 0.28)'
          lctx.lineWidth = n % 10000 === 0 ? 2 : 1
          lctx.beginPath(); lctx.moveTo(0, ly(n)); lctx.lineTo(leinwand.width, ly(n)); lctx.stroke()
        }
      }
      auflageTextur.needsUpdate = true
    }
    szene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: auflageTextur })))
    szene.add(new THREE.HemisphereLight('#ffffff', '#8a8a7a', 1.6))
    const sonne = new THREE.DirectionalLight('#ffffff', 2.2)
    // Licht von Nordwesten wie auf der Landeskarte
    sonne.position.set(-1, 1.2, -1)
    szene.add(sonne)

    // der Weg: auf dem Gelände, in Tunneln und auf Brücken gerade zwischen den Enden
    const pk = weg.punkte
    const punktBei = (meter: number) => {
      let lo = 1, hi = pk.length - 1
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pk[mid].m < meter) lo = mid + 1; else hi = mid }
      const a = pk[Math.max(0, lo - 1)], b = pk[lo]
      const t = Math.max(0, Math.min(1, (meter - a.m) / ((b.m - a.m) || 1)))
      return [a.e + t * (b.e - a.e), a.n + t * (b.n - a.n)] as const
    }
    const hoeheAmWeg = (meter: number) => {
      const [e, n] = punktBei(meter)
      const bau = weg.bauwerke.find((x) => meter >= x.von && meter <= x.bis)
      if (!bau) return hoeheBei(r, h, e, n) + UEBER_M
      const [ea, na] = punktBei(bau.von), [eb, nb] = punktBei(bau.bis)
      const ha = hoeheBei(r, h, ea, na) + UEBER_M, hb = hoeheBei(r, h, eb, nb) + UEBER_M
      return ha + ((meter - bau.von) / ((bau.bis - bau.von) || 1)) * (hb - ha)
    }
    const punkt3d = (meter: number) => {
      const [e, n] = punktBei(meter)
      return new THREE.Vector3(X(e), Y(hoeheAmWeg(meter)), Z(n))
    }
    const strichVon = (von: number, bis: number) => {
      const punkte: THREE.Vector3[] = []
      for (let meter = von; meter < bis; meter += 50) punkte.push(punkt3d(meter))
      punkte.push(punkt3d(bis))
      return punkte
    }
    const roehre = (punkte: THREE.Vector3[], farbe: string, durch: boolean) => {
      if (punkte.length < 2) return
      // Röhre statt Linie: Linien sind in WebGL nur 1 Pixel breit
      const kurve = new THREE.CatmullRomCurve3(punkte)
      const netz = new THREE.Mesh(new THREE.TubeGeometry(kurve, Math.max(4, punkte.length * 2), 0.06, 6, false),
        new THREE.MeshBasicMaterial({ color: farbe, depthTest: !durch, transparent: durch, opacity: durch ? 0.75 : 1 }))
      if (durch) netz.renderOrder = 2
      szene.add(netz)
    }
    /** gestrichelt (Tunnel): 400 m sichtbar, 250 m nicht (Punkte alle 50 m) */
    const STRICH = 8, LUECKE = 5
    const linie = (punkte: THREE.Vector3[], farbe: string, tunnel: boolean) => {
      if (!tunnel || punkte.length <= STRICH) { roehre(punkte, farbe, tunnel); return }
      for (let i = 0; i < punkte.length - 1; i += STRICH + LUECKE) roehre(punkte.slice(i, Math.min(punkte.length, i + STRICH + 1)), farbe, true)
    }
    // grau, wo der Weg selbst dunkel ist (beim Fahren), sonst wären Tunnel kaum zu unterscheiden
    const tunnelFarbe = dunkel || wegFarbe === FARBEN.tunnel ? '#8a8a8a' : FARBEN.tunnel
    for (const [anfang, ende] of weg.stuecke) {
      const grenzen = weg.bauwerke.filter((g) => g.bis > anfang && g.von < ende).sort((a, b) => a.von - b.von)
      let bei = anfang
      for (const g of grenzen) {
        if (g.von > bei) linie(strichVon(bei, g.von), wegFarbe, false)
        const von = Math.max(g.von, anfang, bei), bis = Math.min(g.bis, ende)
        if (bis > von) linie(strichVon(von, bis), g.art === 'tunnel' ? tunnelFarbe : FARBEN.bruecke, g.art === 'tunnel')
        bei = Math.max(bei, g.bis)
      }
      if (bei < ende) linie(strichVon(bei, ende), wegFarbe, false)
    }
    const imStueck = (meter: number) => weg.stuecke.some(([a, b]) => meter >= a && meter <= b)

    // Beschriftungen in fester Bildschirmgrösse, auf einem hellen Schild; wo sich zwei
    // überdecken, bleibt die mit dem kleineren Rang stehen (zeichnen() blendet die andere aus)
    const schilder: Array<{ sp: THREE.Sprite; rang: number; folge: number }> = []
    const gruppen = { gipfel: new THREE.Group(), kgs: new THREE.Group(), seilbahn: new THREE.Group() }
    Object.values(gruppen).forEach((g) => szene.add(g))
    const schild = (text: string, farbe: string, x: number, y: number, z: number, rang: number, folge = 0, ort: THREE.Object3D = szene) => {
      const lw = document.createElement('canvas')
      const ctx = lw.getContext('2d')!
      const px = 28, rand = 10
      ctx.font = `bold ${px}px Helvetica, Arial, sans-serif`
      lw.width = Math.ceil(ctx.measureText(text).width) + 2 * rand; lw.height = px + 16
      ctx.font = `bold ${px}px Helvetica, Arial, sans-serif`
      ctx.fillStyle = dunkel ? 'rgba(20,20,20,0.82)' : 'rgba(255,255,255,0.85)'
      ctx.beginPath(); ctx.roundRect(0, 0, lw.width, lw.height, 8); ctx.fill()
      ctx.fillStyle = farbe
      ctx.fillText(text, rand, px + 2)
      const textur = new THREE.CanvasTexture(lw)
      textur.colorSpace = THREE.SRGBColorSpace // sonst wirken die Farben blasser
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textur, depthTest: false, sizeAttenuation: false }))
      const s = 0.00085
      sp.scale.set(lw.width * s, lw.height * s, 1)
      sp.center.set(0, 0)
      sp.position.set(x, y, z)
      sp.renderOrder = 3
      ort.add(sp)
      schilder.push({ sp, rang, folge })
    }
    const kugel = (farbe: string, x: number, y: number, z: number, groesse = 0.12, durch = false) => {
      const k = new THREE.Mesh(new THREE.SphereGeometry(groesse, 16, 10), new THREE.MeshBasicMaterial({ color: farbe, depthTest: !durch }))
      k.position.set(x, y, z)
      if (durch) k.renderOrder = 4
      szene.add(k)
      return k
    }
    // Reihenfolge der Bahnhöfe zwischen den Enden durch Halbieren: zuerst der mittlere, dann die
    // in der Mitte jeder Hälfte usw., damit die Namen in der Übersicht über die Strecke verteilt sind
    const folge = new Map<number, number>()
    const haelften: Array<[number, number]> = [[0, r.bahnhoefe.length - 1]]
    while (haelften.length) {
      const [a, z] = haelften.shift()!
      if (z - a < 2) continue
      const m = Math.floor((a + z) / 2)
      folge.set(m, folge.size)
      haelften.push([a, m], [m, z])
    }
    r.bahnhoefe.forEach((b, i) => {
      const y = Y(hoeheBei(r, h, b.lage[0], b.lage[1]) + UEBER_M)
      kugel(FARBEN.bahnhof, X(b.lage[0]), y, Z(b.lage[1]))
      // Anfang und Ende der Strecke zuerst, dann die übrigen Bahnhöfe, dann die Gipfel
      const ende = i === 0 || i === r.bahnhoefe.length - 1
      schild(b.name, dunkel ? '#9db4ff' : FARBEN.bahnhof, X(b.lage[0]), y + 0.15, Z(b.lage[1]), ende ? 0 : 1, folge.get(i) ?? 0)
    })
    for (const t of weg.tunnelPunkte.filter(imStueck)) {
      const p = punkt3d(t)
      kugel(tunnelFarbe, p.x, p.y, p.z, 0.09)
    }
    for (const g of r.gipfel) {
      const y = Y(Math.max(g.hoehe_m, hoeheBei(r, h, g.lage[0], g.lage[1])))
      const kegel = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), new THREE.MeshBasicMaterial({ color: FARBEN.gipfel }))
      kegel.position.set(X(g.lage[0]), y + 0.12, Z(g.lage[1]))
      gruppen.gipfel.add(kegel)
      schild(`${g.name} ${g.hoehe_m.toLocaleString('de-CH')} m`, dunkel ? '#e2c9a8' : FARBEN.gipfel, X(g.lage[0]), y + 0.3, Z(g.lage[1]), 2, 0, gruppen.gipfel)
    }

    const imAusschnitt = (e: number, n: number) => e >= ost && e <= ost + breite * m && n <= nord && n >= nord - hoehe * m
    // Seen (Michael, 2026-10-06: «Erst Seen dazu»): flach auf Seehöhe, die Höhe ist die mittlere des Ufers im
    // Gelände; was über den Ausschnitt hinausragt, ist abgeschnitten
    const eck: Array<[number, number]> = [[ost, nord], [ost + breite * m, nord], [ost + breite * m, nord - hoehe * m], [ost, nord - hoehe * m]]
    for (const see of zusatz?.seen?.seen ?? []) {
      const ringe = see.ringe.map((x) => zugInRahmen(zugLesen(x), eck)).filter((q) => q.length >= 3)
      if (!ringe.length) continue
      const flaeche = (q: Array<[number, number]>) => Math.abs(q.reduce((a, [e, n], i) => { const [e2, n2] = q[(i + 1) % q.length]; return a + e * n2 - e2 * n }, 0))
      ringe.sort((a, b) => flaeche(b) - flaeche(a))
      const ufer = ringe[0].map(([e, n]) => hoeheBei(r, h, e, n)).sort((a, b) => a - b)
      const pegel = ufer[Math.floor(ufer.length / 2)]
      const form = new THREE.Shape(ringe[0].map(([e, n]) => new THREE.Vector2(X(e), -Z(n))))
      form.holes = ringe.slice(1).map((q) => new THREE.Path(q.map(([e, n]) => new THREE.Vector2(X(e), -Z(n)))))
      const wasser = new THREE.Mesh(new THREE.ShapeGeometry(form), new THREE.MeshLambertMaterial({ color: '#9cc3e6' }))
      wasser.rotation.x = -Math.PI / 2
      wasser.position.y = Y(pegel + 3)
      szene.add(wasser)
      // «N_P» setzt swissTLMRegio, wo kein Name steht: ein Platzhalter, kein Name
      if (see.name && see.name !== 'N_P') {
        const [ne, nn] = see.namenspunkt ? lv95(see.namenspunkt[0], see.namenspunkt[1]) : ringe[0][0]
        // grössere Seen zuerst, vor den Gipfeln gleichen Rangs
        if (imAusschnitt(ne, nn)) schild(see.name, dunkel ? '#8fb3d4' : '#3f6a93', X(ne), Y(pegel + 3) + 0.1, Z(nn), 2, -flaeche(ringe[0]))
      }
    }
    for (const k of zusatz?.s?.kgs ?? []) {
      const [e, n] = lv95(k.lage[0], k.lage[1])
      if (!imAusschnitt(e, n)) continue
      const y = Y(hoeheBei(r, h, e, n))
      const raute = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: dunkel ? '#c39be0' : '#6b3fa0' }))
      raute.position.set(X(e), y + 0.08, Z(n))
      gruppen.kgs.add(raute)
      schild(k.name, dunkel ? '#c39be0' : '#6b3fa0', X(e), y + 0.18, Z(n), 3, 0, gruppen.kgs)
    }
    for (const b of zusatz?.s?.seilbahnen ?? []) {
      const pts = b.verlauf.flatMap((v) => zugLesen(v))
      if (pts.length < 2 || !pts.some(([e, n]) => imAusschnitt(e, n))) continue
      // gerade von Station zu Station: wie hoch das Seil hängt, steht in keiner Quelle
      const [ea, na] = pts[0], [eb, nb] = pts[pts.length - 1]
      const a = new THREE.Vector3(X(ea), Y(hoeheBei(r, h, ea, na)) + 0.03, Z(na))
      const z2 = new THREE.Vector3(X(eb), Y(hoeheBei(r, h, eb, nb)) + 0.03, Z(nb))
      const seil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, z2), 8, 0.025, 5, false),
        new THREE.MeshBasicMaterial({ color: dunkel ? '#7cc0cf' : '#0d5c6e' }))
      gruppen.seilbahn.add(seil)
      for (const p of [a, z2]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: dunkel ? '#7cc0cf' : '#0d5c6e' }))
        st.position.copy(p)
        gruppen.seilbahn.add(st)
      }
    }
    anwenden.current = (a: Set<Kategorie>) => {
      gruppen.gipfel.visible = !a.has('gipfel')
      gruppen.kgs.visible = !a.has('kgs')
      gruppen.seilbahn.visible = !a.has('seilbahn')
      auflageMalen(a)
    }
    anwenden.current(ausJetzt.current)

    // der Zug: ein roter Punkt mit weissem Rand, auch im Tunnel sichtbar
    const zugRand = zug ? kugel('#ffffff', 0, 0, 0, 0.2, true) : null
    const zugKern = zug ? kugel(FARBEN.zug, 0, 0, 0, 0.15, true) : null
    if (zugKern) zugKern.renderOrder = 5

    const steuerung = new OrbitControls(kamera, renderer.domElement)
    steuerung.enableDamping = true
    steuerung.maxPolarAngle = Math.PI * 0.49
    steuerung.minDistance = 1
    steuerung.maxDistance = 120
    // ausgerichtet auf das Gezeichnete, Blick von Norden oder bei breiten Strecken von Westen
    const gezeichnet = pk.filter((p) => imStueck(p.m))
    const xs = gezeichnet.map((p) => X(p.e)), zs = gezeichnet.map((p) => Z(p.n))
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
    const cz = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0
    // die Breite zählt im Hochformat mehr: sonst ragt eine Strecke von Westen nach Osten links und rechts hinaus
    const seitenverhaeltnis = Math.max(0.5, el.clientWidth / Math.max(1, zug ? el.clientHeight : Math.min(window.innerHeight * 0.7, el.clientWidth * 1.1)))
    const breitX = xs.length ? Math.max(...xs) - Math.min(...xs) : 0, tiefZ = zs.length ? Math.max(...zs) - Math.min(...zs) : 0
    // Strecken von West nach Osten von Westen her ansehen: so läuft die Linie im Bild nach oben,
    // die Namen stehen untereinander statt sich nebeneinander zu drängen
    const vonWesten = breitX > tiefZ * 1.3
    const spanne = !xs.length ? 40 : vonWesten ? Math.max(tiefZ * 1.3 / seitenverhaeltnis, breitX * 1.35, 5)
      : Math.max(breitX * 1.3 / seitenverhaeltnis, tiefZ, 5)
    steuerung.target.set(cx, Y(1500), cz)
    if (vonWesten) kamera.position.set(cx - spanne * 1.0, spanne * 0.85, cz + spanne * 0.15)
    else kamera.position.set(cx - spanne * 0.3, spanne * 0.85, cz - spanne * 1.0)
    steuerung.update()

    const groesseSetzen = () => {
      const b = el.clientWidth
      // auf der eigenen Seite bestimmt die Breite die Höhe, beim Fahren der Rahmen
      const hh = zug ? el.clientHeight : Math.round(Math.min(window.innerHeight * 0.7, b * 1.1))
      if (!b || !hh) return
      renderer.setSize(b, hh)
      kamera.aspect = b / hh
      kamera.updateProjectionMatrix()
    }
    groesseSetzen()
    const beobachter = new ResizeObserver(groesseSetzen)
    beobachter.observe(el)

    // Schilder, die ein wichtigeres verdecken würden, ausblenden; bei gleichem Rang gewinnt das nähere
    const projiziert = new THREE.Vector3()
    const schilderOrdnen = () => {
      const b = renderer.domElement.clientWidth, hh = renderer.domElement.clientHeight
      const pm = kamera.projectionMatrix.elements
      const belegt: Array<[number, number, number, number]> = []
      const liste = schilder.map((x) => ({ ...x, abstand: x.sp.position.distanceToSquared(kamera.position) }))
        .sort((a, c) => a.rang - c.rang || a.folge - c.folge || a.abstand - c.abstand)
      for (const { sp } of liste) {
        if (sp.parent && !sp.parent.visible) continue
        projiziert.copy(sp.position).project(kamera)
        if (projiziert.z > 1 || projiziert.z < -1) { sp.visible = false; continue }
        const breite = sp.scale.x * pm[0] * b / 2, hoehe = sp.scale.y * pm[5] * hh / 2
        const px = (projiziert.x + 1) / 2 * b, py = (1 - projiziert.y) / 2 * hh
        // vier Lagen um den Punkt: rechts oben, links oben, rechts unten, links unten;
        // die erste, die frei ist und ganz im Bild liegt, gilt
        sp.visible = false
        for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const x0 = cx ? px - breite : px, x1 = x0 + breite
          const y0 = cy ? py : py - hoehe, y1 = y0 + hoehe
          if (x0 < 2 || x1 > b - 2 || y0 < 2 || y1 > hh - 2) continue
          if (belegt.some(([a0, c0, a1, c1]) => x0 < a1 + 4 && x1 > a0 - 4 && y0 < c1 + 2 && y1 > c0 - 2)) continue
          sp.center.set(cx, cy)
          sp.visible = true
          belegt.push([x0, y0, x1, y1])
          break
        }
      }
    }

    // beim Fahren: die Kamera folgt dem Zug mit demselben Blickwinkel; am Anfang von schräg hinten
    let letzte: THREE.Vector3 | null = null
    let laeuft = true
    const zeichnen = () => {
      if (!laeuft) return
      if (zug && zugRand && zugKern) {
        const s = zug.current
        const sichtbar = s !== null && imStueck(s)
        zugRand.visible = zugKern.visible = sichtbar
        if (sichtbar) {
          const p = punkt3d(s)
          zugRand.position.copy(p); zugKern.position.copy(p)
          if (!letzte) {
            const hinten = punkt3d(Math.max(pk[0].m, s - 3000))
            const richtung = p.clone().sub(hinten).setY(0).normalize()
            steuerung.target.copy(p)
            kamera.position.copy(p).addScaledVector(richtung, -7).add(new THREE.Vector3(0, 4.5, 0))
          } else {
            const d = p.clone().sub(letzte)
            steuerung.target.add(d); kamera.position.add(d)
          }
          letzte = p
        }
      }
      steuerung.update()
      schilderOrdnen()
      renderer.render(szene, kamera)
      requestAnimationFrame(zeichnen)
    }
    zeichnen()
    return () => {
      laeuft = false
      beobachter.disconnect()
      steuerung.dispose()
      szene.traverse((o) => {
        const x = o as THREE.Mesh
        x.geometry?.dispose()
        const mat = x.material as THREE.Material & { map?: THREE.Texture }
        mat?.map?.dispose(); mat?.dispose?.()
      })
      anwenden.current = null
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [r, h, faktor, weg, wegFarbe, zug, zusatz])
  return <div ref={rahmen} className={className} aria-label={`3D-Relief ${r.titel}`} role="img" />
}
