/**
 * Menschen in «3D Schweiz» (Michael, 2026-11-11: «Heisst dass du kannst Taktland tatsächlich bevölkern???», dann «Gerne gemäss deinen Vorschlägen
 * umsetzen»): Wartende auf den Perrons, Fussgänger auf den Trottoirs in Siedlungen und Wanderer auf den Wanderwegen.
 *
 * Belegt ist, wo Perrons, Strassen in Siedlungen und Wanderwege liegen (SBB, swissTLM3D, swissTLMRegio), wie viele an einem Bahnhof ein- und
 * aussteigen (SBB) und wie viele in einer Hektare wohnen (STATPOP, BFS). Erfunden sind die Menschen selbst, ihre Gestalt, Farbe, Lage und ihr
 * Tempo, und wie aus den Zahlen der Quellen eine Menge wird (die Anteile unten, gewählt): keine Quelle zählt Menschen auf Perrons, Trottoirs
 * oder Wanderwegen.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Perron } from './Perrons'

/** Wartende auf den Perrons eines Bahnhofs = Ein- und Aussteigende am Werktag (SBB) durch WARTENDE_TEILER: die Hälfte steigt ein, verteilt auf
 *  18 Betriebsstunden, jede Person wartet im Mittel 5 Minuten (alles gewählt): DWV / 2 / (18 × 60) × 5 = DWV / 432 */
export const WARTENDE_TEILER = 432
/** Wanderer je km Wanderweg am Tag (gewählt) */
export const WANDERER_JE_KM = 0.6
/** Tempo zu Fuss in m/s und die Streuung je Person (gewählt) */
export const GEHEN_MS = 1.3, GEHEN_STREUUNG = 0.2, WANDERN_MS = 1.1
/** so weit neben dem Rand der Fahrbahn gehen die Fussgänger (Trottoir, gewählt) */
export const TROTTOIR_M = 1.4
/** Anteil der Menschen zur Stunde (Schweizer Zeit), gewählt */
export function anteilStunde(art: 'perron' | 'strasse' | 'wandern', stunde: number): number {
  if (art === 'perron') return stunde >= 1 && stunde < 5 ? 0 : stunde >= 22 || stunde < 6 ? 0.35 : 1
  if (art === 'wandern') return stunde >= 8 && stunde < 18 ? 1 : stunde >= 7 && stunde < 20 ? 0.3 : 0
  return stunde >= 7 && stunde < 20 ? 1 : stunde >= 20 && stunde < 23 ? 0.4 : 0.06
}

const KLEID = ['#2b5d34', '#1f3f7a', '#a8102e', '#c9a227', '#f2f2f2', '#3c3c3c', '#8a1a1a', '#5a6b7c', '#d97a2b', '#6b4f8a', '#2a2a2a', '#e0d6c2']
export function kleidFarbe(i: number): THREE.Color { return new THREE.Color(KLEID[Math.floor(zufall(i * 5.13 + 0.7) * KLEID.length)]) }

/** ein fester Zufall 0 bis 1 */
export function zufall(x: number): number {
  const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** Gestalt in km, 1,75 m, die Füsse bei y = 0, Blick nach +z: Oberteil (weiss, die Farbe je Person kommt dazu) und der Rest (Beine, Kopf, Arme) */
export function menschForm(): { oberteil: THREE.BufferGeometry; rest: THREE.BufferGeometry } {
  const teil = (b: number, h: number, t: number, x: number, y: number, farbe: string) => {
    const g = new THREE.BoxGeometry(b / 1000, h / 1000, t / 1000).toNonIndexed()
    g.deleteAttribute('uv')
    g.translate(x / 1000, (y + h / 2) / 1000, 0)
    const c = new THREE.Color(farbe), f = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < f.length; i += 3) { f[i] = c.r; f[i + 1] = c.g; f[i + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3))
    return g
  }
  const rest = [teil(0.15, 0.85, 0.18, -0.1, 0, '#2a2d33'), teil(0.15, 0.85, 0.18, 0.1, 0, '#2a2d33'), teil(0.21, 0.23, 0.22, 0, 1.5, '#d9b08c')]
  const oberteil = [teil(0.44, 0.62, 0.26, 0, 0.85, '#ffffff'), teil(0.1, 0.55, 0.12, -0.28, 0.9, '#ffffff'), teil(0.1, 0.55, 0.12, 0.28, 0.9, '#ffffff')]
  const a = mergeGeometries(oberteil)!, b = mergeGeometries(rest)!
  for (const g of [...oberteil, ...rest]) g.dispose()
  return { oberteil: a, rest: b }
}

/** ein Weg zum Gehen: Punkte und der Abstand vom Anfang */
export interface Gehweg { e: Float64Array; n: Float64Array; s: Float64Array; L: number }
export function gehweg(e: ArrayLike<number>, n: ArrayLike<number>): Gehweg {
  const z = e.length, w: Gehweg = { e: Float64Array.from(e), n: Float64Array.from(n), s: new Float64Array(z), L: 0 }
  for (let i = 1; i < z; i++) w.s[i] = w.s[i - 1] + Math.hypot(w.e[i] - w.e[i - 1], w.n[i] - w.n[i - 1])
  w.L = w.s[z - 1]
  return w
}
export function wegBei(w: Gehweg, s: number): { e: number; n: number; de: number; dn: number } | null {
  const z = w.e.length
  if (z < 2 || s < 0 || s > w.L) return null
  let lo = 0, hi = z - 2
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (w.s[m] <= s) lo = m; else hi = m - 1 }
  const l = w.s[lo + 1] - w.s[lo] || 1, t = (s - w.s[lo]) / l
  const de = (w.e[lo + 1] - w.e[lo]) / l, dn = (w.n[lo + 1] - w.n[lo]) / l
  return { e: w.e[lo] + t * (w.e[lo + 1] - w.e[lo]), n: w.n[lo] + t * (w.n[lo + 1] - w.n[lo]), de, dn }
}

/** jemand unterwegs: auf welchem Weg, quer daneben (m, rechts positiv), Richtung, Tempo, Platz zur Zeit 0, ab welchem Anteil der Stunde, Farbe */
export interface Geher { weg: Gehweg; quer: number; richtung: 1 | -1; ms: number; s0: number; ab: number; farbe: number; art: 'strasse' | 'wandern' }
/** auf einem Weg so viele wie je km verlangt, zufällig verteilt, immer gleich (nr macht den Zufall je Weg) */
export function geherAuf(weg: Gehweg, jeKm: number, nr: number, art: Geher['art'], quer: (i: number) => number): Geher[] {
  const raus: Geher[] = []
  const soll = (weg.L / 1000) * jeKm, zahl = Math.floor(soll) + (zufall(nr * 1.37) < soll - Math.floor(soll) ? 1 : 0)
  for (let i = 0; i < zahl; i++) {
    const z = zufall(nr * 3.1 + i * 7.7)
    const grund = art === 'wandern' ? WANDERN_MS : GEHEN_MS
    raus.push({ weg, quer: quer(i), richtung: zufall(nr + i * 2.3) < 0.5 ? 1 : -1, ms: grund * (1 - GEHEN_STREUUNG + 2 * GEHEN_STREUUNG * z),
      s0: zufall(nr * 0.71 + i * 1.93) * weg.L, ab: zufall(nr * 5.9 + i * 0.37), farbe: Math.floor(zufall(nr * 0.13 + i * 3.3) * 997), art })
  }
  return raus
}

/** Wartende auf den Perrons: je Perron ihr Anteil nach seiner Fläche an allen Perrons des Bahnhofs, an zufälligen Stellen mindestens 0,8 m vom Rand */
export interface Wartend { e: number; n: number; z: number; drehung: number; ab: number; farbe: number }
const flaeche = (p: Perron) => {
  let a = 0
  for (let i = 0, j = p.e.length - 1; i < p.e.length; j = i++) a += (p.e[j] - p.e0) * (p.n[i] - p.n0) - (p.e[i] - p.e0) * (p.n[j] - p.n0)
  return Math.abs(a) / 2
}
const innen = (p: Perron, e: number, n: number) => {
  let drin = false
  for (let i = 0, j = p.e.length - 1; i < p.e.length; j = i++) {
    if ((p.n[i] > n) !== (p.n[j] > n) && e < ((p.e[j] - p.e[i]) * (n - p.n[i])) / (p.n[j] - p.n[i]) + p.e[i]) drin = !drin
  }
  return drin
}
const randAbstand = (p: Perron, e: number, n: number) => {
  let d = Infinity
  for (let i = 0, j = p.e.length - 1; i < p.e.length; j = i++) {
    const ae = p.e[j], an = p.n[j], de = p.e[i] - ae, dn = p.n[i] - an, l2 = de * de + dn * dn
    const t = l2 ? Math.max(0, Math.min(1, ((e - ae) * de + (n - an) * dn) / l2)) : 0
    d = Math.min(d, Math.hypot(e - ae - t * de, n - an - t * dn))
  }
  return d
}
export function wartende(hier: Perron[], alle: Perron[], dwv: (uic: number) => number | null, ueber: number): Wartend[] {
  const jeBahnhof = new Map<number, number>()
  for (const p of alle) jeBahnhof.set(p.u, (jeBahnhof.get(p.u) ?? 0) + flaeche(p))
  const raus: Wartend[] = []
  hier.forEach((p, k) => {
    const d = dwv(p.u), ganz = jeBahnhof.get(p.u) ?? 0
    if (!d || !ganz || p.e.length < 3) return
    const soll = (d / WARTENDE_TEILER) * (flaeche(p) / ganz)
    const zahl = Math.floor(soll) + (zufall(p.u * 0.001 + k * 1.7) < soll - Math.floor(soll) ? 1 : 0)
    let versuche = 0
    for (let i = 0; i < zahl && versuche < zahl * 30; versuche++) {
      const e = p.e0 + zufall(p.u * 0.0013 + k * 3.1 + versuche * 0.917) * (p.e1 - p.e0)
      const n = p.n0 + zufall(p.u * 0.0017 + k * 5.3 + versuche * 1.311) * (p.n1 - p.n0)
      if (!innen(p, e, n) || randAbstand(p, e, n) < 0.8) continue
      // die Höhe des Belags: Gleis und Kante des nächsten Punkts des Umrisses
      let best = 0, bd = Infinity
      for (let j = 0; j < p.e.length; j++) { const dd = Math.hypot(p.e[j] - e, p.n[j] - n); if (dd < bd) { bd = dd; best = j } }
      raus.push({ e, n, z: p.z[best] + p.h[best] + ueber, drehung: zufall(e * 0.37 + n * 0.11) * Math.PI * 2, ab: zufall(e * 0.7 + n * 0.3 + 2),
        farbe: Math.floor(zufall(e + n * 1.3) * 997) })
      i++
    }
  })
  return raus
}
