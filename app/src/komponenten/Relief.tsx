import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { holen, holenBinaer } from '../daten'
import { Zurueck } from './Zurueck'
import { Ladefehler } from './Ladefehler'

/**
 * 3D-Relief einer Strecke (Michael, 2026-10-06: zuerst die Gotthard-Bergstrecke, im Browser,
 * später auch mit Brille). Gelände aus swissALTIRegio, Linie, Tunnel, Brücken, Bahnhöfe und
 * Gipfel aus data/relief/{name}.json (pipeline/build_relief.py). Gezeichnet mit three.js, das
 * mit der App ausgeliefert und erst hier geladen wird.
 *
 * Ehrlich bleibt: Die Höhe der Gleise steht in keiner Quelle. Die Linie liegt auf dem Gelände,
 * im Tunnel und auf Brücken gerade zwischen den beiden Enden; das steht unter dem Bild. Ist die
 * Höhe überhöht, steht der Faktor sichtbar daneben.
 */

interface Relief {
  titel: string; linie: string; linie_name: string; von_km: number; bis_km: number; datenstand: string
  quellen: string[]
  raster: { ost: number; nord: number; m: number; breite: number; hoehe: number; datei: string }
  /** [Meter der Kilometrierung, Ost, Nord] */
  weg: Array<[number, number, number]>
  bahnhoefe: Array<{ uic: number; name: string; km: number; lage: [number, number] }>
  tunnel: Array<{ name: string; laenge_m: number | null; km: number; von_km?: number; bis_km?: number }>
  bruecken: Array<{ name: string; von_km: number; bis_km: number; laenge_m: number }>
  gipfel: Array<{ name: string; hoehe_m: number; lage: [number, number] }>
}

/** jedes wievielte Feld des Rasters ins Netz kommt; 2 hält das Netz auch auf dem Handy flüssig */
const SCHRITT = 2
/** die Linie liegt so viel über dem Gelände, damit sie nicht darin verschwindet */
const UEBER_M = 25

const FARBEN = {
  linie: '#a8102e', tunnel: '#212121', bruecke: '#b45309', bahnhof: '#1e3a8a', gipfel: '#5b3a1e',
}

export default function ReliefSeite({ name }: { name: string }) {
  const [daten, setDaten] = useState<{ r: Relief; h: Uint16Array } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [faktor, setFaktor] = useState<1 | 2>(1)
  useEffect(() => {
    holen<Relief>(`data/relief/${name}.json`)
      .then(async (r) => setDaten({ r, h: new Uint16Array(await holenBinaer(`data/relief/${r.raster.datei}`)) }))
      .catch((e: Error) => setFehler(e.message))
  }, [name])

  return (
    <div className="px-4 pb-4">
      {/* zurück zur Linie des Reliefs, sonst zu allen Strecken */}
      <Zurueck onClick={() => { window.location.hash = daten ? `#/linie/${daten.r.linie}` : '#/strecken' }}
               text={daten ? `Linie ${daten.r.linie}` : 'Alle Strecken'} />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{daten?.r.titel ?? '3D-Relief'} in 3D</h1>
      {daten && (
        <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
          Linie {daten.r.linie} {daten.r.linie_name}, Kilometer {daten.r.von_km.toLocaleString('de-CH')} bis {daten.r.bis_km.toLocaleString('de-CH')}
        </p>
      )}
      {fehler && <Ladefehler className="mt-6" was="Das Relief konnte nicht geladen werden." fehler={fehler} />}
      {!daten && !fehler && <p className="mt-6 text-sbb-metal">Das Relief wird geladen …</p>}
      {daten && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="segmente grid grid-cols-2" role="radiogroup" aria-label="Höhe">
              {([1, 2] as const).map((f) => (
                <button key={f} type="button" aria-pressed={faktor === f} onClick={() => setFaktor(f)}
                        className="segment px-3 py-1.5 text-sm">{f === 1 ? 'Höhe wie echt' : 'Höhe 2-fach'}</button>
              ))}
            </div>
          </div>
          <Szene r={daten.r} h={daten.h} faktor={faktor} />
          <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
            Drehen mit einem Finger, zoomen mit zwei, verschieben mit zwei Fingern oder der rechten Maustaste.
            {faktor === 2 && <span className="font-medium text-sbb-black dark:text-sbb-white"> Die Höhe ist 2-fach überhöht.</span>}
          </p>
          <Legende />
          <Hinweise r={daten.r} />
        </>
      )}
    </div>
  )
}

function Legende() {
  const strich = (farbe: string, gestrichelt = false) => (
    <span aria-hidden="true" className="inline-block h-1 w-6 rounded"
          style={{ background: gestrichelt ? `repeating-linear-gradient(90deg, ${farbe} 0 5px, transparent 5px 8px)` : farbe }} />
  )
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <li className="flex items-center gap-1.5">{strich(FARBEN.linie)} Linie</li>
      {/* im Dunkeln heller, sonst verschwindet der Strich auf dem schwarzen Grund */}
      <li className="flex items-center gap-1.5">
        {strich(window.matchMedia('(prefers-color-scheme: dark)').matches ? '#b5b5b5' : FARBEN.tunnel, true)} Tunnel
      </li>
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
          Kilometer der SBB: {ohneEnde.map((t) => t.name).join(', ')}.
        </p>
      )}
      <p>Brücken nur, wo Anfang und Ende bekannt sind. Gipfel nur aus Swiss Map Vector 1000.</p>
      <p>Quellen: {r.quellen.join('; ')}. Datenstand der Linie {r.datenstand.split('-').map(Number).reverse().join('.')}.</p>
    </div>
  )
}

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

function Szene({ r, h, faktor }: { r: Relief; h: Uint16Array; faktor: 1 | 2 }) {
  const rahmen = useRef<HTMLDivElement>(null)
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
    el.appendChild(renderer.domElement)

    // Gelände als Netz, jedes SCHRITT-te Feld
    const nx = Math.floor((breite - 1) / SCHRITT) + 1, ny = Math.floor((hoehe - 1) / SCHRITT) + 1
    const pos = new Float32Array(nx * ny * 3), farben = new Float32Array(nx * ny * 3)
    const c = new THREE.Color()
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const gi = i * SCHRITT, gj = j * SCHRITT
        const z = h[gj * breite + gi]
        const k = (j * nx + i) * 3
        pos[k] = X(ost + (gi + 0.5) * m); pos[k + 1] = Y(z); pos[k + 2] = Z(nord - (gj + 0.5) * m)
        hoehenFarbe(z, c)
        farben[k] = c.r; farben[k + 1] = c.g; farben[k + 2] = c.b
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
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    geo.computeVertexNormals()
    const gelaende = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
    szene.add(gelaende)
    szene.add(new THREE.HemisphereLight('#ffffff', '#8a8a7a', 1.6))
    const sonne = new THREE.DirectionalLight('#ffffff', 2.2)
    // Licht von Nordwesten wie auf der Landeskarte
    sonne.position.set(-1, 1.2, -1)
    szene.add(sonne)

    // Linie: auf dem Gelände, in Tunneln und auf Brücken gerade zwischen den Enden
    const imBereich = (km: number, b: Array<{ von_km?: number; bis_km?: number }>) =>
      b.find((x) => x.von_km !== undefined && km >= x.von_km && km <= x.bis_km!)
    const punktBei = (meter: number) => {
      const w = r.weg
      let i = 1
      while (i < w.length - 1 && w[i][0] < meter) i++
      const [m0, e0, n0] = w[i - 1], [m1, e1, n1] = w[i]
      const t = Math.max(0, Math.min(1, (meter - m0) / ((m1 - m0) || 1)))
      return [e0 + t * (e1 - e0), n0 + t * (n1 - n0)] as const
    }
    const hoeheAmWeg = (meter: number) => {
      const [e, n] = punktBei(meter)
      const km = meter / 1000
      const bau = imBereich(km, r.tunnel) ?? imBereich(km, r.bruecken)
      if (!bau) return hoeheBei(r, h, e, n) + UEBER_M
      const [ea, na] = punktBei(bau.von_km! * 1000), [eb, nb] = punktBei(bau.bis_km! * 1000)
      const ha = hoeheBei(r, h, ea, na) + UEBER_M, hb = hoeheBei(r, h, eb, nb) + UEBER_M
      const t = (km - bau.von_km!) / ((bau.bis_km! - bau.von_km!) || 1)
      return ha + t * (hb - ha)
    }
    const strichVon = (von: number, bis: number) => {
      const punkte: THREE.Vector3[] = []
      for (let meter = von; meter <= bis; meter += 50) {
        const [e, n] = punktBei(meter)
        punkte.push(new THREE.Vector3(X(e), Y(hoeheAmWeg(meter)), Z(n)))
      }
      const [e, n] = punktBei(bis)
      punkte.push(new THREE.Vector3(X(e), Y(hoeheAmWeg(bis)), Z(n)))
      return new THREE.BufferGeometry().setFromPoints(punkte)
    }
    const breitLinie = (g: THREE.BufferGeometry, farbe: string, durch = false) => {
      // Röhre statt Linie: Linien sind in WebGL nur 1 Pixel breit
      const p = g.getAttribute('position')
      const kurve = new THREE.CatmullRomCurve3(Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i)))
      const roehre = new THREE.Mesh(new THREE.TubeGeometry(kurve, Math.max(8, p.count * 2), 0.06, 6, false),
        new THREE.MeshBasicMaterial({ color: farbe, depthTest: !durch, transparent: durch, opacity: durch ? 0.75 : 1 }))
      if (durch) roehre.renderOrder = 2
      szene.add(roehre)
    }
    const anfang = r.weg[0][0], ende = r.weg[r.weg.length - 1][0]
    // die Linie in Stücken: offen, im Tunnel (durch den Berg sichtbar), auf der Brücke
    const grenzen = [
      ...r.tunnel.filter((t) => t.von_km !== undefined).map((t) => ({ von: t.von_km! * 1000, bis: t.bis_km! * 1000, art: 'tunnel' as const })),
      ...r.bruecken.map((b) => ({ von: b.von_km * 1000, bis: b.bis_km * 1000, art: 'bruecke' as const })),
    ].filter((g) => g.bis > anfang && g.von < ende).sort((a, b) => a.von - b.von)
    let bei = anfang
    for (const g of grenzen) {
      if (g.von > bei) breitLinie(strichVon(bei, g.von), FARBEN.linie)
      if (g.art === 'tunnel') breitLinie(strichVon(Math.max(g.von, anfang), Math.min(g.bis, ende)), FARBEN.tunnel, true)
      else breitLinie(strichVon(Math.max(g.von, anfang), Math.min(g.bis, ende)), FARBEN.bruecke)
      bei = Math.max(bei, g.bis)
    }
    if (bei < ende) breitLinie(strichVon(bei, ende), FARBEN.linie)

    // Beschriftungen in fester Bildschirmgrösse
    const schild = (text: string, farbe: string, x: number, y: number, z: number) => {
      const lw = document.createElement('canvas')
      const ctx = lw.getContext('2d')!
      const px = 28
      ctx.font = `bold ${px}px Helvetica, Arial, sans-serif`
      lw.width = Math.ceil(ctx.measureText(text).width) + 16; lw.height = px + 14
      ctx.font = `bold ${px}px Helvetica, Arial, sans-serif`
      ctx.lineWidth = 6; ctx.strokeStyle = dunkel ? '#141414' : '#ffffff'; ctx.fillStyle = farbe
      ctx.strokeText(text, 8, px); ctx.fillText(text, 8, px)
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lw), depthTest: false, sizeAttenuation: false }))
      const s = 0.00085
      sp.scale.set(lw.width * s, lw.height * s, 1)
      sp.center.set(0, 0)
      sp.position.set(x, y, z)
      sp.renderOrder = 3
      szene.add(sp)
    }
    const kugel = (farbe: string, x: number, y: number, z: number, groesse = 0.12) => {
      const k = new THREE.Mesh(new THREE.SphereGeometry(groesse, 12, 8), new THREE.MeshBasicMaterial({ color: farbe }))
      k.position.set(x, y, z)
      szene.add(k)
    }
    for (const b of r.bahnhoefe) {
      const y = Y(hoeheAmWeg(b.km * 1000))
      kugel(FARBEN.bahnhof, X(b.lage[0]), y, Z(b.lage[1]))
      schild(b.name, dunkel ? '#9db4ff' : FARBEN.bahnhof, X(b.lage[0]), y + 0.15, Z(b.lage[1]))
    }
    for (const t of r.tunnel.filter((t) => t.von_km === undefined)) {
      const [e, n] = punktBei(t.km * 1000)
      kugel(FARBEN.tunnel, X(e), Y(hoeheAmWeg(t.km * 1000)), Z(n), 0.09)
    }
    for (const g of r.gipfel) {
      const y = Y(Math.max(g.hoehe_m, hoeheBei(r, h, g.lage[0], g.lage[1])))
      const kegel = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), new THREE.MeshBasicMaterial({ color: FARBEN.gipfel }))
      kegel.position.set(X(g.lage[0]), y + 0.12, Z(g.lage[1]))
      szene.add(kegel)
      schild(`${g.name} ${g.hoehe_m.toLocaleString('de-CH')} m`, dunkel ? '#e2c9a8' : FARBEN.gipfel, X(g.lage[0]), y + 0.3, Z(g.lage[1]))
    }

    // Blick von Norden schräg aufs Ganze
    const steuerung = new OrbitControls(kamera, renderer.domElement)
    steuerung.enableDamping = true
    steuerung.maxPolarAngle = Math.PI * 0.49
    steuerung.minDistance = 2
    steuerung.maxDistance = 120
    // ausgerichtet auf die ganze Strecke, nicht auf den ganzen Ausschnitt
    const xs = r.weg.map((w) => X(w[1])), zs = r.weg.map((w) => Z(w[2]))
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2
    const spanne = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
    steuerung.target.set(cx, Y(1500), cz)
    kamera.position.set(cx - spanne * 0.3, spanne * 0.85, cz - spanne * 1.0)
    steuerung.update()

    const groesseSetzen = () => {
      const b = el.clientWidth, hh = Math.round(Math.min(window.innerHeight * 0.7, b * 1.1))
      renderer.setSize(b, hh)
      kamera.aspect = b / hh
      kamera.updateProjectionMatrix()
    }
    groesseSetzen()
    const beobachter = new ResizeObserver(groesseSetzen)
    beobachter.observe(el)
    let laeuft = true
    const zeichnen = () => {
      if (!laeuft) return
      steuerung.update()
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
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [r, h, faktor])
  return <div ref={rahmen} className="mt-3 w-full overflow-hidden rounded-lg touch-none" aria-label={`3D-Relief ${r.titel}`} role="img" />
}
