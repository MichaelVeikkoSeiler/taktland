import * as THREE from 'three'
import { holen } from '../daten'

/**
 * Decken über Gleisen für «3D Schweiz» (Michael, 2026-11-05, Bern: «bei den Perrons unter der Decke sieht man Autos. Das ist wohl die
 * Textur des Parkings. Bitte setze diese Textur auf die Decke oberhalb … Unterhalb, dort wo die Perrons sind, verwendest du einfach eine
 * anthrazitfarbene Textur, am liebsten etwas gekörnt»). Die Dächer stammen aus swissBUILDINGS3D, die Gleise aus swissTLM3D
 * (pipeline/build_decken.py); das Luftbild unter der Decke zeigt deren Dach, es wandert hier auf die Decke, darunter wird es
 * anthrazit (Farbe und Körnung gewählt).
 */
export interface Decke {
  /** je Ecke E, N in m, Höhe in m ü. M., je drei ein Dreieck */
  e: Float64Array; n: Float64Array; z: Float32Array
  e0: number; n0: number; e1: number; n1: number
}

/** Anthrazit unter der Decke (#3b3b3d) und die Körnung darauf (gewählt) */
const KORN_HELL = 0.09
/** so hoch über dem Dach liegt das Luftbild, damit es nicht mit dem Dach flimmert (m, gewählt) */
const UEBER_DACH_M = 0.2

let alle: Promise<Decke[]> | null = null
export function deckenLaden(): Promise<Decke[]> {
  return (alle ??= holen<{ decken: Array<{ t: number[][] }> }>('data/decken.json').then((d) => d.decken.map((x) => {
    const z = x.t.length, k: Decke = { e: new Float64Array(z), n: new Float64Array(z), z: new Float32Array(z), e0: Infinity, n0: Infinity, e1: -Infinity, n1: -Infinity }
    x.t.forEach(([e, n, h], i) => {
      k.e[i] = e / 10; k.n[i] = n / 10; k.z[i] = h / 10
      k.e0 = Math.min(k.e0, k.e[i]); k.e1 = Math.max(k.e1, k.e[i]); k.n0 = Math.min(k.n0, k.n[i]); k.n1 = Math.max(k.n1, k.n[i])
    })
    return k
  })).catch(() => { alle = null; return [] }))
}

export async function deckenIn(e0: number, n0: number, e1: number, n1: number): Promise<Decke[]> {
  return (await deckenLaden()).filter((d) => d.e1 >= e0 && d.e0 <= e1 && d.n1 >= n0 && d.n0 <= n1)
}

/** liegt der Punkt unter einer Decke? */
export function unterDecke(decken: Decke[], e: number, n: number) {
  for (const d of decken) {
    if (e < d.e0 || e > d.e1 || n < d.n0 || n > d.n1) continue
    for (let i = 0; i + 2 < d.e.length; i += 3) {
      const ax = d.e[i], ay = d.n[i], bx = d.e[i + 1], by = d.n[i + 1], cx = d.e[i + 2], cy = d.n[i + 2]
      const d1 = (e - bx) * (ay - by) - (ax - bx) * (n - by), d2 = (e - cx) * (by - cy) - (bx - cx) * (n - cy), d3 = (e - ax) * (cy - ay) - (cx - ax) * (n - ay)
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true
    }
  }
  return false
}

/**
 * Für ein Stück Gelände mit seinem Bild: das Luftbild unter den Decken auf ein eigenes Netz über den Dächern, im Bild darunter
 * Anthrazit mit Körnung. Gibt das Netz (oder null) und eine Funktion, die das Bild wiederherstellt.
 */
export function deckeAufBild(decken: Decke[], bild: HTMLCanvasElement, rahmen: { e0: number; n1: number; b: number; h: number },
  ort: (e: number, n: number, h: number) => THREE.Vector3): { netz: THREE.Mesh | null; zurueck: () => void } {
  const sx = bild.width / rahmen.b, sy = bild.height / rahmen.h
  const px = (e: number) => (e - rahmen.e0) * sx, py = (n: number) => (rahmen.n1 - n) * sy
  // die Dreiecke, deren Mitte in diesem Stück liegt
  const tris: number[][] = []
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const d of decken) {
    for (let i = 0; i + 2 < d.e.length; i += 3) {
      const me = (d.e[i] + d.e[i + 1] + d.e[i + 2]) / 3, mn = (d.n[i] + d.n[i + 1] + d.n[i + 2]) / 3
      if (me < rahmen.e0 || me >= rahmen.e0 + rahmen.b || mn > rahmen.n1 || mn <= rahmen.n1 - rahmen.h) continue
      const t: number[] = []
      for (let q = i; q < i + 3; q++) {
        t.push(d.e[q], d.n[q], d.z[q])
        x0 = Math.min(x0, px(d.e[q])); x1 = Math.max(x1, px(d.e[q])); y0 = Math.min(y0, py(d.n[q])); y1 = Math.max(y1, py(d.n[q]))
      }
      tris.push(t)
    }
  }
  if (!tris.length) return { netz: null, zurueck: () => {} }
  x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1)
  x1 = Math.min(bild.width, Math.ceil(x1) + 1); y1 = Math.min(bild.height, Math.ceil(y1) + 1)
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0)
  // das Luftbild der Decke für sich, bevor es im Bild übermalt wird
  const kopie = document.createElement('canvas')
  kopie.width = w; kopie.height = h
  kopie.getContext('2d')!.drawImage(bild, x0, y0, w, h, 0, 0, w, h)
  const g = bild.getContext('2d')!
  const vorher = g.getImageData(x0, y0, w, h)
  // darunter Anthrazit, etwas gekörnt: eine Maske der Dreiecke, darin je Bildpunkt die Farbe mit Zufall
  const maske = document.createElement('canvas')
  maske.width = w; maske.height = h
  const mg = maske.getContext('2d')!
  mg.fillStyle = '#fff'
  mg.beginPath()
  for (const t of tris) { mg.moveTo(px(t[0]) - x0, py(t[1]) - y0); mg.lineTo(px(t[3]) - x0, py(t[4]) - y0); mg.lineTo(px(t[6]) - x0, py(t[7]) - y0); mg.closePath() }
  mg.fill()
  const m = mg.getImageData(0, 0, w, h).data, ziel = new Uint8ClampedArray(vorher.data)
  const [ar, ag, ab] = [0x3b, 0x3b, 0x3d]
  let s = 12345
  for (let i = 0; i < m.length; i += 4) {
    if (m[i + 3] < 128) continue
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const f = 1 + KORN_HELL * ((s / 0x7fffffff) * 2 - 1)
    ziel[i] = ar * f; ziel[i + 1] = ag * f; ziel[i + 2] = ab * f
  }
  g.putImageData(new ImageData(ziel, w, h), x0, y0)

  const pos: number[] = [], uv: number[] = []
  for (const t of tris) {
    for (let q = 0; q < 9; q += 3) {
      const v = ort(t[q], t[q + 1], t[q + 2] + UEBER_DACH_M)
      pos.push(v.x, v.y, v.z)
      uv.push((px(t[q]) - x0) / w, 1 - (py(t[q + 1]) - y0) / h)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  const tex = new THREE.CanvasTexture(kopie)
  tex.colorSpace = THREE.SRGBColorSpace
  const netz = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
  netz.receiveShadow = true
  netz.name = 'decke'
  return { netz, zurueck: () => { g.putImageData(vorher, x0, y0); tex.dispose() } }
}
