/**
 * Ein Kursschiff für die Schiffe laut Fahrplan in «3D Schweiz» auf 3dland.ch (Michael, 2026-10-28): Rumpf weiss mit dunkler
 * Wasserlinie und karminrotem Band wie die Spitze der Züge, darauf zwei Decks mit Fensterband. Kein bestimmtes Schiff; Masse
 * und Farben gewählt, in keiner Quelle. In km, die Spitze bei +z, der Wasserspiegel bei y = 0.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ZUG_DUNKEL, ZUG_HELL, ZUG_ROT } from './ZugForm'

export const SCHIFF_M = 60, SCHIFF_BREITE_M = 11

/** eine Geometrie mit Farben je Ecke, für InstancedMesh */
export function schiffForm(): THREE.BufferGeometry {
  const L = SCHIFF_M / 1000, B = SCHIFF_BREITE_M / 1000
  const teile: THREE.BufferGeometry[] = []
  const faerben = (geo: THREE.BufferGeometry, farbe: string) => {
    let g = geo.index ? geo.toNonIndexed() : geo
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n)
    if (!g.attributes.normal) g.computeVertexNormals()
    const c = new THREE.Color(farbe), f = new Float32Array(g.attributes.position.count * 3)
    for (let k = 0; k < f.length; k += 3) { f[k] = c.r; f[k + 1] = c.g; f[k + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3))
    if (g !== geo) geo.dispose()
    teile.push(g)
  }
  // Grundriss: hinten gerundet, vorne spitz; als Fläche in x und -z, senkrecht von y0 bis y1 hochgezogen
  const grundriss = (l: number, b: number, spitz: number) => {
    const s = new THREE.Shape(), h = b / 2, hinten = l / 2, vorne = l / 2 - spitz
    s.moveTo(-h, hinten * 0.8); s.quadraticCurveTo(-h, hinten, 0, hinten); s.quadraticCurveTo(h, hinten, h, hinten * 0.8)
    s.lineTo(h, -vorne); s.quadraticCurveTo(h * 0.9, -l / 2 + spitz * 0.2, 0, -l / 2)
    s.quadraticCurveTo(-h * 0.9, -l / 2 + spitz * 0.2, -h, -vorne); s.closePath()
    return s
  }
  const stueck = (s: THREE.Shape, y0: number, y1: number, farbe: string, z = 0, mass = 1) => {
    const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 6 })
    g.rotateX(-Math.PI / 2); g.scale(mass, 1, mass); g.translate(0, y0, z)
    faerben(g, farbe)
  }
  const rumpf = grundriss(L, B, L * 0.3)
  stueck(rumpf, -0.0006, 0.0006, ZUG_DUNKEL)
  stueck(rumpf, 0.0006, 0.0016, ZUG_HELL)
  stueck(rumpf, 0.0016, 0.0021, ZUG_ROT, 0, 1.005)
  stueck(rumpf, 0.0021, 0.0027, '#f4f4f4')
  // zwei Decks, das untere mit Fensterband, das obere kürzer
  const deck = (l: number, b: number, y0: number, y1: number, z: number) => {
    const s = grundriss(l, b, l * 0.15)
    stueck(s, y0, y1, '#f4f4f4', z)
    stueck(s, y0 + (y1 - y0) * 0.35, y0 + (y1 - y0) * 0.75, ZUG_DUNKEL, z, 1.02)
  }
  deck(L * 0.62, B * 0.78, 0.0027, 0.0055, -L * 0.06)
  deck(L * 0.34, B * 0.62, 0.0055, 0.0078, -L * 0.1)
  const ganz = mergeGeometries(teile)!
  teile.forEach((t) => t.dispose())
  return ganz
}
