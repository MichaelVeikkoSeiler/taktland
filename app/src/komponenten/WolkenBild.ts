// Wolken aus dem Wettermodell ICON-CH1-EPS als Ballen über einem Rechteck, gemeinsam für «3D Schweiz» (Schweiz3D.tsx) und den
// Führerstand (Relief.tsx) (Michael, 2026-10-28: «Jetzt die Wolken angehen»; 2026-10-30: «die beiden evtl zu koppeln … dann den Rest auch
// noch»). Belegt ist die Bewölkung je Zelle von 2 km (src/wolken.ts); Form, Muster und, ohne Wolken in echter Höhe, die Höhe der Schichten
// sind gewählt.
import * as THREE from 'three'
import { bewoelkung, bewoelkung3d, wolken3dStunde, type Wolken } from '../wolken'

/** auf diesen Höhen über Meer liegen die drei Schichten tief, mittel und hoch; die Quelle nennt nur ihre Druckbereiche (800 hPa bis Boden,
 *  400 bis 800, unter 400), die Höhen sind gewählt, etwa nach der Standardatmosphäre (800 hPa gut 1'900 m, 600 hPa gut 4'200 m, 300 hPa gut 9'000 m) */
export const WOLKEN_HOEHE_M = [1500, 4200, 9000]
/** so gross sind die gezeichneten Wolken je Schicht etwa, in km (gewählt, nicht aus der Quelle) */
const WOLKEN_KORN_KM = [3, 6, 12]

/** fester Zufall je Gitterpunkt, für das gezeichnete Muster der Wolken */
function wolkenZufall(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
/** Rauschen aus mehreren Lagen, 0 bis 1, an einer Stelle in km; überall dasselbe, damit die Wolken beim Eintauchen gleich bleiben */
function wolkenMuster(xKm: number, yKm: number, kornKm: number, s: number) {
  let summe = 0, gewicht = 0, f = 1 / kornKm, g = 1
  for (let o = 0; o < 4; o++) {
    const x = xKm * f, y = yKm * f, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
    const a = wolkenZufall(x0, y0, s + o), bb = wolkenZufall(x0 + 1, y0, s + o), c = wolkenZufall(x0, y0 + 1, s + o), d = wolkenZufall(x0 + 1, y0 + 1, s + o)
    summe += g * ((a * (1 - sx) + bb * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy)
    gewicht += g; g *= 0.5; f *= 2
  }
  return summe / gewicht
}
/** das Muster gleichmässig verteilt (0 bis 1 nach seinem Rang unter 4'000 Proben), damit «deckend über 1 − Anteil» wirklich etwa
 *  diesen Anteil der Fläche deckt; je Schicht einmal gerechnet */
const musterRang: Array<Float32Array | null> = [null, null, null]
function gleichmaessig(m: number, schicht: number) {
  let r = musterRang[schicht]
  if (!r) {
    r = new Float32Array(4000)
    for (let i = 0; i < r.length; i++) r[i] = wolkenMuster(wolkenZufall(i, 1, 99) * 997, wolkenZufall(i, 2, 99) * 997, WOLKEN_KORN_KM[schicht], schicht * 7)
    r.sort(); musterRang[schicht] = r
  }
  let lo = 0, hi = r.length
  while (lo < hi) { const mi = (lo + hi) >> 1; if (r[mi] < m) lo = mi + 1; else hi = mi }
  return lo / r.length
}
/** das Muster in echter Höhe: zwei Rauschfelder (Körnung in km, gewählt), je Stufe anders gemischt, damit eine Wolke nach oben ihre Form
 *  ändert, aber zusammenhängt */
const WOLKEN3D_KORN_KM = [4, 2.5]
// ---------------------------------------------------------------------------------------------------------------------------------------
// Wolkenballen (Michael, 2026-11-07: «Diese dünnen Wolkenschichten sehen visuell nicht schön aus», zu Variante 1: «Hört sich genial an - ja
// bitte»): statt flacher Ebenen viele weiche, runde Ballen, die immer zur Kamera schauen, dort, wo das Wettermodell Bewölkung nennt, in der
// Höhe und Dicke der Wolke (in echter Höhe aus den Stufen von 250 m, sonst in den drei Schichten mit gewählter Dicke). Belegt ist nur die
// Bewölkung je Zelle von 2 km und Höhe; Form, Grösse, Abstand und Farbe der Ballen sind gezeichnet und gewählt.

/** Dicke der drei Schichten ohne Wolken in echter Höhe, in m (gewählt, die Quelle nennt nur Druckbereiche) */
const BALLEN_DICKE_M = [800, 1400, 900]
/** kleinster Abstand der Ballen in m; in grossen Modellen wird er grösser, bis die Zahl passt (gewählt) */
const BALLEN_ABSTAND_MIN_M = 350
/** Durchmesser eines Ballens im Verhältnis zum Abstand, innen in der Wolke bis zum Doppelten (gewählt) */
const BALLEN_GROESSE = 1.5
/** so viele Ballen höchstens: Bildschirm, Handy, Brille (eine Annahme zur Grafik, nicht gemessen) */
export const BALLEN_HOECHSTENS = 9000, BALLEN_HOECHSTENS_HANDY = 3500, BALLEN_HOECHSTENS_BRILLE = 2500
/** Unterseite der Ballen dunkler als die Oberseite, und Ballen am Fuss einer Wolke nochmals (gewählt) */
const BALLEN_UNTEN_HELL = 0.72, BALLEN_FUSS_HELL = 0.88
/** weiche Ränder (Michael, 2026-11-08: «diese scharfen Kanten entfernen? Dann würde man richtig langsam zb während einer Zugfahrt in den Nebel
 *  eintauchen»): ein Ballen wird über dem höchsten Gelände unter ihm nach unten durchsichtig, über so viele Durchmesser, damit er nie mit einer
 *  harten Kante im Boden steckt, und je näher die Kamera kommt, desto durchsichtiger, ganz weg ab NAH_WEG Durchmessern (gewählt) */
const BALLEN_BODEN_WEICH = 0.4, BALLEN_NAH_WEG = 0.15, BALLEN_NAH_VOLL = 1.4

let ballenBildVorrat: THREE.CanvasTexture | null = null
/** das Bild eines Ballens: einige weiche, runde Flecken übereinander, aussen durchsichtig (gezeichnet) */
function ballenBild() {
  if (ballenBildVorrat) return ballenBildVorrat
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n
  const x = c.getContext('2d')!
  const fleck = (mx: number, my: number, r: number, a: number) => {
    const g = x.createRadialGradient(mx, my, 0, mx, my, r)
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.55, `rgba(255,255,255,${a * 0.75})`); g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g; x.beginPath(); x.arc(mx, my, r, 0, Math.PI * 2); x.fill()
  }
  fleck(64, 66, 54, 0.75)
  for (let i = 0; i < 9; i++) {
    const w = (i / 9) * Math.PI * 2 + wolkenZufall(i, 3, 5) * 0.6, d = 18 + wolkenZufall(i, 4, 5) * 14
    fleck(64 + Math.cos(w) * d, 64 + Math.sin(w) * d * 0.85, 22 + wolkenZufall(i, 5, 5) * 12, 0.5)
  }
  ballenBildVorrat = new THREE.CanvasTexture(c)
  ballenBildVorrat.colorSpace = THREE.SRGBColorSpace
  return ballenBildVorrat
}

/** der Ballen schaut immer zur Kamera: die Ecken in der Sicht neben die Mitte gelegt, so gross wie die Instanz skaliert ist */
function zurKamera(shader: { vertexShader: string }) {
  shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
    mat4 ballenMv = modelViewMatrix * instanceMatrix;
    vec4 mvPosition = ballenMv * vec4(0.0, 0.0, 0.0, 1.0);
    mvPosition.xy += position.xy * length(ballenMv[0].xyz);
    gl_Position = projectionMatrix * mvPosition;`)
}

/** wie zurKamera, dazu die weichen Ränder: die Höhe jeder Ecke im Raum des Netzes, der Boden des Ballens und sein Abstand zur Kamera */
function zurKameraWeich(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
    attribute float ballenBoden;
    varying float vBallenY; varying float vBallenBoden; varying float vBallenGr; varying float vBallenNah;`)
    .replace('#include <project_vertex>', `
    mat4 ballenMv = modelViewMatrix * instanceMatrix;
    vec4 mvPosition = ballenMv * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 ballenOff = position.xy * length(ballenMv[0].xyz);
    vBallenNah = length(mvPosition.xyz) / length(ballenMv[0].xyz);
    vec3 ballenHoch = modelViewMatrix[1].xyz;
    vBallenY = instanceMatrix[3].y + dot(vec3(ballenOff, 0.0), ballenHoch) / dot(ballenHoch, ballenHoch);
    vBallenGr = length(instanceMatrix[0].xyz);
    vBallenBoden = ballenBoden;
    mvPosition.xy += ballenOff;
    gl_Position = projectionMatrix * mvPosition;`)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
    varying float vBallenY; varying float vBallenBoden; varying float vBallenGr; varying float vBallenNah;`)
    .replace('#include <alphatest_fragment>', `diffuseColor.a *= smoothstep(vBallenBoden, vBallenBoden + ${BALLEN_BODEN_WEICH.toFixed(3)} * vBallenGr, vBallenY)
      * smoothstep(${BALLEN_NAH_WEG.toFixed(3)}, ${BALLEN_NAH_VOLL.toFixed(3)}, vBallenNah);
    #include <alphatest_fragment>`)
}

export interface Ballen {
  netz: THREE.InstancedMesh
  /** wie viele es sind */
  zahl: number
  weg: () => void
}

/** Wolkenballen über dem Rechteck (LV95) zur Stunde st; zu: von LV95 und Höhe über Meer in die Szene, jeM: Einheiten der Szene je m;
 *  hoechstens: so viele Ballen höchstens, brille: so viele in der Brille. null, wenn keine Wolke darüber liegt */
export function wolkenBallen(w: Wolken, st: number, e0: number, n0: number, e1: number, n1: number,
  zu: (e: number, n: number, hM: number) => [number, number, number], jeM: number, hoechstens: number, brille = BALLEN_HOECHSTENS_BRILLE,
  boden?: (e: number, n: number) => number): Ballen | null {
  // die Säulen: je Lage von unten nach oben Höhenbereiche, je mit der Bewölkung an einer Stelle
  const j3 = wolken3dStunde(w, st)
  type Lage = { unten: number; oben: number; anteil: (e: number, n: number) => number }
  const lagenBei = (abstand: number): Lage[] => {
    if (j3 !== null) {
      const z = w.ix.wolken3d!
      const mit: number[] = []
      for (let k = 0; k < z.stufen; k++) {
        let max = 0
        for (let a = 0; a <= 12 && max < 0.03; a++) for (let c = 0; c <= 12; c++) max = Math.max(max, bewoelkung3d(w, j3, k, e0 + (a / 12) * (e1 - e0), n0 + (c / 12) * (n1 - n0)) ?? 0)
        if (max >= 0.03) mit.push(k)
      }
      // so viele Stufen von 250 m zusammen, dass eine Lage etwa 0,7 Abstände hoch ist
      const je = Math.max(1, Math.round((abstand * 0.7) / z.schritt_m))
      const lagen: Lage[] = []
      for (let i = 0; i < mit.length;) {
        const gruppe = [mit[i]]
        while (++i < mit.length && mit[i] - gruppe[0] < je && mit[i] === gruppe[gruppe.length - 1] + 1) gruppe.push(mit[i])
        lagen.push({ unten: z.unten_m + gruppe[0] * z.schritt_m, oben: z.unten_m + (gruppe[gruppe.length - 1] + 1) * z.schritt_m,
          anteil: (e, n) => { let a = 0; for (const k of gruppe) a = Math.max(a, bewoelkung3d(w, j3, k, e, n) ?? 0); return a } })
      }
      return lagen
    }
    const lagen: Lage[] = []
    WOLKEN_HOEHE_M.forEach((h, s) => {
      const dick = BALLEN_DICKE_M[s], zahl = Math.max(1, Math.round(dick / (abstand * 0.7)))
      for (let i = 0; i < zahl; i++) lagen.push({ unten: h - dick / 2 + (i / zahl) * dick, oben: h - dick / 2 + ((i + 1) / zahl) * dick, anteil: (e, n) => bewoelkung(w, st, s, e, n) ?? 0 })
    })
    return lagen
  }
  // der Abstand: so klein wie möglich, so gross wie nötig, damit die Zahl passt (geschätzt an 40 × 40 Stellen)
  const flaeche = (e1 - e0) * (n1 - n0)
  let abstand = BALLEN_ABSTAND_MIN_M, lagen = lagenBei(abstand)
  for (let versuch = 0; versuch < 30; versuch++) {
    let summe = 0
    for (let a = 0; a < 40; a++) for (let c = 0; c < 40; c++) {
      const e = e0 + ((a + 0.5) / 40) * (e1 - e0), n = n0 + ((c + 0.5) / 40) * (n1 - n0)
      for (const l of lagen) summe += l.anteil(e, n)
    }
    const geschaetzt = (summe / 1600) * (flaeche / (abstand * abstand))
    if (geschaetzt <= hoechstens) break
    abstand *= Math.max(1.1, Math.sqrt(geschaetzt / hoechstens))
    lagen = lagenBei(abstand)
  }
  if (!lagen.length) return null
  // die Ballen: je Feld des Rasters (fest in LV95, damit sie beim Eintauchen am selben Ort bleiben) und Lage einer, wo das gezeichnete
  // Muster über 1 − Bewölkung liegt; so deckt die Wolke etwa den Anteil, den die Prognose nennt
  const lage: number[] = [], groesse: number[] = [], hell: number[] = [], unten: number[] = []
  // das höchste Gelände unter einem Ballen (Mitte und zwei Ringe), in m
  const hoechstesUnter = (e: number, n: number, rM: number) => {
    if (!boden) return -1e6
    let m = -1e6
    const c = boden(e, n)
    if (Number.isFinite(c)) m = c
    for (const f of [0.6, 1]) for (let w = 0; w < 8; w++) {
      const v = boden(e + Math.cos(w * Math.PI / 4) * rM * f, n + Math.sin(w * Math.PI / 4) * rM * f)
      if (Number.isFinite(v)) m = Math.max(m, v)
    }
    return m
  }
  const i0 = Math.floor(e0 / abstand), i1 = Math.ceil(e1 / abstand), k0 = Math.floor(n0 / abstand), k1 = Math.ceil(n1 / abstand)
  const s = Math.round(abstand)
  for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
    const e = (i + 0.1 + 0.8 * wolkenZufall(i, k, s + 1)) * abstand, n = (k + 0.1 + 0.8 * wolkenZufall(i, k, s + 2)) * abstand
    if (e < e0 || e > e1 || n < n0 || n > n1) continue
    const rand = Math.min(e - e0, e1 - e, n - n0, n1 - n)
    // das Muster hängt über die Höhe zusammen (Säulen), mit etwas Wechsel je Lage
    const u1 = gleichmaessig(wolkenMuster(e / 1000, n / 1000, WOLKEN3D_KORN_KM[0], 101), 0)
    const u2 = gleichmaessig(wolkenMuster(e / 1000, n / 1000, WOLKEN3D_KORN_KM[1], 202), 1)
    let darunter = false
    lagen.forEach((l, li) => {
      const a = l.anteil(e, n)
      if (a <= 0.02) { darunter = false; return }
      const t = 0.5 + 0.5 * Math.sin(li * 0.9)
      const m = u1 * 0.8 + 0.2 * (u1 * (1 - t) + u2 * t)
      const ueber = m - (1 - a)
      if (ueber <= 0) { darunter = false; return }
      const h = l.unten + (0.2 + 0.6 * wolkenZufall(i * 31 + li, k, s + 3)) * (l.oben - l.unten)
      // am Rand des Rechtecks kleiner, damit kein Ballen über die Kante (in «3D Schweiz» vor die Wände) ragt
      const durch = Math.min(abstand * BALLEN_GROESSE * (0.75 + Math.min(1, ueber / 0.25) * 0.75) * (0.85 + 0.3 * wolkenZufall(i, k * 7 + li, s + 4)), 2 * rand)
      if (durch < abstand * 0.3) return
      const [x, y, z] = zu(e, n, h)
      lage.push(x, y, z)
      groesse.push(durch * jeM)
      unten.push(zu(e, n, hoechstesUnter(e, n, durch / 2))[1])
      hell.push((darunter ? 1 : BALLEN_FUSS_HELL) * (0.94 + 0.06 * wolkenZufall(i, k, s + 5 + li)))
      darunter = true
    })
  }
  const zahl = groesse.length
  if (!zahl) return null
  // Bild, Form und Stoff: Lambert, die Normale nach oben, damit die Ballen im selben Licht stehen wie die Ebenen vorher
  const geo = new THREE.PlaneGeometry(1, 1)
  const farbe = new Float32Array(12)
  for (let v = 0; v < 4; v++) { const y = geo.attributes.position.getY(v), f = y > 0 ? 1 : BALLEN_UNTEN_HELL; farbe.set([f, f, f], v * 3) }
  geo.setAttribute('color', new THREE.BufferAttribute(farbe, 3))
  for (let v = 0; v < 4; v++) geo.attributes.normal.setXYZ(v, 0, 1, 0)
  const bild = ballenBild()
  const stoff = new THREE.MeshLambertMaterial({ map: bild, transparent: true, depthWrite: false, vertexColors: true })
  stoff.onBeforeCompile = zurKameraWeich
  stoff.customProgramCacheKey = () => 'wolkenballen-weich'
  const bodenAttr = new THREE.InstancedBufferAttribute(new Float32Array(zahl), 1)
  geo.setAttribute('ballenBoden', bodenAttr)
  const tiefe = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: bild, alphaTest: 0.35 })
  tiefe.onBeforeCompile = zurKamera
  tiefe.customProgramCacheKey = () => 'wolkenballen-tiefe'
  const netz = new THREE.InstancedMesh(geo, stoff, zahl)
  netz.customDepthMaterial = tiefe
  netz.frustumCulled = false
  netz.castShadow = true
  netz.renderOrder = 3
  netz.name = 'wolkenballen'
  // eine feste Reihenfolge des Weglassens für die Brille
  const rang = new Float32Array(zahl)
  for (let q = 0; q < zahl; q++) rang[q] = wolkenZufall(q, 9, 77)
  const grenze = zahl > brille ? [...rang].sort((a, b) => a - b)[brille - 1] : 1
  // von hinten nach vorne zeichnen (die Ballen sind halb durchsichtig), neu geordnet, wenn sich die Kamera bewegt hat
  const ordnung = new Uint32Array(zahl), abst = new Float32Array(zahl)
  const m = netz.instanceMatrix.array as Float32Array, f = new THREE.Color()
  const auge = new THREE.Vector3(), zuletzt = new THREE.Vector3(Infinity, 0, 0)
  let zuletztBrille = false
  const ordnen = (inBrille: boolean) => {
    let n = 0
    for (let q = 0; q < zahl; q++) {
      if (inBrille && rang[q] > grenze) continue
      ordnung[n++] = q
      abst[q] = (lage[q * 3] - auge.x) ** 2 + (lage[q * 3 + 1] - auge.y) ** 2 + (lage[q * 3 + 2] - auge.z) ** 2
    }
    const teil = ordnung.subarray(0, n).sort((a, b) => abst[b] - abst[a])
    for (let r = 0; r < n; r++) {
      const q = teil[r], g = groesse[q], o = r * 16
      m.fill(0, o, o + 16)
      m[o] = g; m[o + 5] = g; m[o + 10] = g; m[o + 15] = 1
      m[o + 12] = lage[q * 3]; m[o + 13] = lage[q * 3 + 1]; m[o + 14] = lage[q * 3 + 2]
      netz.setColorAt(r, f.setScalar(hell[q]))
      bodenAttr.array[r] = unten[q]
    }
    netz.count = n
    netz.instanceMatrix.needsUpdate = true
    bodenAttr.needsUpdate = true
    if (netz.instanceColor) netz.instanceColor.needsUpdate = true
  }
  const schwelle = (abstand * jeM * 0.25) ** 2
  netz.onBeforeRender = (renderer, _szene, kamera) => {
    const inBrille = renderer.xr.isPresenting
    auge.setFromMatrixPosition(kamera.matrixWorld)
    netz.worldToLocal(auge)
    if (inBrille === zuletztBrille && auge.distanceToSquared(zuletzt) < schwelle) return
    zuletzt.copy(auge); zuletztBrille = inBrille
    ordnen(inBrille)
  }
  auge.set(0, 1e9, 0); ordnen(false)
  return { netz, zahl, weg: () => { geo.dispose(); stoff.dispose(); tiefe.dispose() } }
}
