import * as THREE from 'three'
import { holen } from '../daten'

/**
 * Perrons für «3D Schweiz» und den Führerstand (Michael, 2026-11-04: «Bahnhof Bern kann man Perrons und Gleise (Vertiefungen) bauen? So ist
 * alles flach», 2026-11-05: «An beiden Orten bitte, Perrons bauen»). Die Kanten und ihre Höhe über dem Gleis (35 oder 55 cm …) stammen von
 * der SBB, die Höhe des Gleises aus swissTLM3D (pipeline/build_perrons3d.py). Gewählt: die Breite eines Perrons mit nur einer Kante (4 m), die
 * Farben, die Wand bis PERRON_UNTER_M unter das Gleis; Dächer, Treppen und Unterführungen fehlen, sie stehen in keiner Quelle mit ihrer Form.
 */
export interface Perron {
  u: number
  nr: string
  /** je Punkt E, N in m, Höhe des Gleises in m ü. M., Höhe der Kante über dem Gleis in m */
  e: Float64Array; n: Float64Array; z: Float32Array; h: Float32Array
  e0: number; n0: number; e1: number; n1: number
}

/** so weit reicht die Wand unter das Gleis, damit kein Spalt zum Gelände bleibt (gewählt) */
const PERRON_UNTER_M = 0.6
/** Belag und Wand (gewählt, in keiner Quelle) */
const PERRON_OBEN = '#a3a29d', PERRON_WAND = '#7b7a75'

let alle: Promise<Perron[]> | null = null
export function perronsLaden(): Promise<Perron[]> {
  return (alle ??= holen<{ perrons: Array<{ u: number; nr: string; p: number[][] }> }>('data/perrons3d.json').then((d) => d.perrons.map((x) => {
    const z = x.p.length, p: Perron = { u: x.u, nr: x.nr, e: new Float64Array(z), n: new Float64Array(z), z: new Float32Array(z), h: new Float32Array(z),
      e0: Infinity, n0: Infinity, e1: -Infinity, n1: -Infinity }
    x.p.forEach(([e, n, hz, hk], i) => {
      p.e[i] = e / 10; p.n[i] = n / 10; p.z[i] = hz / 10; p.h[i] = hk / 100
      p.e0 = Math.min(p.e0, p.e[i]); p.e1 = Math.max(p.e1, p.e[i]); p.n0 = Math.min(p.n0, p.n[i]); p.n1 = Math.max(p.n1, p.n[i])
    })
    return p
  })).catch(() => { alle = null; return [] }))
}

/** die Perrons, die das Rechteck berühren */
export async function perronsIn(e0: number, n0: number, e1: number, n1: number): Promise<Perron[]> {
  return (await perronsLaden()).filter((p) => p.e1 >= e0 && p.e0 <= e1 && p.n1 >= n0 && p.n0 <= n1)
}

/**
 * Ein Netz für alle Perrons: oben der Belag auf Gleishöhe + Kantenhöhe + ueberJe(perron) (m), rundum eine Wand bis unter das Gleis.
 * ort(e, n, hoehe) gibt den Punkt in der Szene; innen(e, n) sagt, ob ein Punkt im Modell liegt (Perrons am Rand fallen ganz weg).
 */
export function perronNetz(perrons: Perron[], ort: (e: number, n: number, h: number) => THREE.Vector3, ueberJe: (p: Perron) => number = () => 0,
  innen: (e: number, n: number) => boolean = () => true): THREE.Mesh | null {
  const pos: number[] = [], farbe: number[] = [], index: number[] = []
  const oben = new THREE.Color(PERRON_OBEN), wand = new THREE.Color(PERRON_WAND)
  const punkt = (v: THREE.Vector3, c: THREE.Color) => { pos.push(v.x, v.y, v.z); farbe.push(c.r, c.g, c.b); return pos.length / 3 - 1 }
  for (const p of perrons) {
    const z = p.e.length
    if (z < 3) continue
    let drin = true
    for (let i = 0; i < z; i++) if (!innen(p.e[i], p.n[i])) { drin = false; break }
    if (!drin) continue
    const ueber = ueberJe(p)
    if (!Number.isFinite(ueber)) continue
    const umriss = Array.from({ length: z }, (_, i) => new THREE.Vector2(p.e[i] - p.e0, p.n[i] - p.n0))
    if (THREE.ShapeUtils.isClockWise(umriss)) umriss.reverse()
    const umgedreht = THREE.ShapeUtils.isClockWise(Array.from({ length: z }, (_, i) => new THREE.Vector2(p.e[i] - p.e0, p.n[i] - p.n0)))
    const reihe = umgedreht ? Array.from({ length: z }, (_, i) => z - 1 - i) : Array.from({ length: z }, (_, i) => i)
    const flaechen = THREE.ShapeUtils.triangulateShape(umriss, [])
    const basis = pos.length / 3
    for (const i of reihe) punkt(ort(p.e[i], p.n[i], p.z[i] + p.h[i] + ueber), oben)
    // die Ebene der Szene: x Osten, z Süden; gegen den Uhrzeigersinn in E/N ist von oben gesehen richtig herum
    for (const [a, b, c] of flaechen) index.push(basis + a, basis + c, basis + b)
    for (let k = 0; k < z; k++) {
      const i = reihe[k], j = reihe[(k + 1) % z]
      const a = punkt(ort(p.e[i], p.n[i], p.z[i] + p.h[i] + ueber), wand), b = punkt(ort(p.e[j], p.n[j], p.z[j] + p.h[j] + ueber), wand)
      const c = punkt(ort(p.e[j], p.n[j], p.z[j] - PERRON_UNTER_M + ueber), wand), d = punkt(ort(p.e[i], p.n[i], p.z[i] - PERRON_UNTER_M + ueber), wand)
      index.push(a, d, b, b, d, c)
    }
  }
  if (!index.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(farbe, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  const netz = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))
  netz.castShadow = true; netz.receiveShadow = true
  netz.name = 'perrons'
  return netz
}
