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
/** Gruppen: Anteil bis 1, 2, 3 Personen (summiert), gewählt; auf den Perrons Gruppen von 1 bis 5 im Umkreis von GRUPPE_RADIUS_M */
const GRUPPE_GROESSE = [0.55, 0.85, 1], GRUPPE_PERRON = [0.35, 0.6, 0.78, 0.9, 1], GRUPPE_RADIUS_M = 1.3
/** an den Enden eines Perrons so viel wie in der Mitte, dazwischen nach einem Sinus (Michael, 2026-11-11: «Bei den Enden der Perrons weniger
 *  Leute, da die Züge meistens in der Mitte der Perrons fahren. Aber bitte nicht zu extrem»), gewählt */
export const PERRON_ENDE_ANTEIL = 0.55
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

/** Farben der Oberteile, gewählt; seit 2026-11-11 weniger Rot und mehr Grau (Michael: «Etwas weniger Menschen mit roten Oberteilen, mehr graue
 *  Kleider»): ein Rot von 20, sieben Grautöne */
const KLEID = ['#2b5d34', '#1f3f7a', '#8a1a1a', '#c9a227', '#f2f2f2', '#3c3c3c', '#5a6b7c', '#d97a2b', '#6b4f8a', '#2a2a2a', '#e0d6c2',
  '#6e6e6e', '#8c8c8c', '#a6a6a6', '#4a4a4a', '#bdbdbd', '#575a5e', '#7d7f82', '#1c2a44', '#4b5a3a']
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
  // in Gruppen (Michael, 2026-11-11: «mehr Gruppierungen von Menschen, nicht so perfekt verteilt»): 1 bis 3 gehen zusammen, gleich schnell, in
  // dieselbe Richtung, je 0,8 m hintereinander und 0,6 m versetzt (GRUPPE_*, gewählt)
  for (let i = 0; i < zahl;) {
    const z = zufall(nr * 3.1 + i * 7.7), w = zufall(nr * 8.3 + i * 0.91)
    const n = Math.min(zahl - i, GRUPPE_GROESSE.findIndex((g) => w < g) + 1 || 1)
    const grund = art === 'wandern' ? WANDERN_MS : GEHEN_MS, ms = grund * (1 - GEHEN_STREUUNG + 2 * GEHEN_STREUUNG * z)
    const richtung = zufall(nr + i * 2.3) < 0.5 ? 1 : -1, s0 = zufall(nr * 0.71 + i * 1.93) * weg.L, q = quer(i), ab = zufall(nr * 5.9 + i * 0.37)
    for (let j = 0; j < n; j++, i++) {
      raus.push({ weg, quer: q + (j % 2 ? 0.6 : 0) * Math.sign(q || 1), richtung, ms, s0: (s0 + j * 0.8) % weg.L, ab: ab + j * 0.02,
        farbe: Math.floor(zufall(nr * 0.13 + i * 3.3) * 997), art })
    }
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
    // die Längsachse des Perrons: die weiteste Strecke zwischen zwei Punkten des Umrisses; Lage darauf 0 bis 1
    let ae = p.e[0], an = p.n[0], be = p.e[0], bn = p.n[0], weit = 0
    for (let a = 0; a < p.e.length; a++) for (let c = a + 1; c < p.e.length; c++) {
      const d = Math.hypot(p.e[c] - p.e[a], p.n[c] - p.n[a])
      if (d > weit) { weit = d; ae = p.e[a]; an = p.n[a]; be = p.e[c]; bn = p.n[c] }
    }
    const laengs = (e: number, n: number) => (weit ? Math.max(0, Math.min(1, ((e - ae) * (be - ae) + (n - an) * (bn - an)) / (weit * weit))) : 0.5)
    let versuche = 0
    const setzen = (e: number, n: number, drehung: number, ab: number) => {
      // die Höhe des Belags: Gleis und Kante des nächsten Punkts des Umrisses
      let best = 0, bd = Infinity
      for (let j = 0; j < p.e.length; j++) { const dd = Math.hypot(p.e[j] - e, p.n[j] - n); if (dd < bd) { bd = dd; best = j } }
      raus.push({ e, n, z: p.z[best] + p.h[best] + ueber, drehung, ab, farbe: Math.floor(zufall(e + n * 1.3) * 997) })
    }
    for (let i = 0; i < zahl && versuche < zahl * 30; versuche++) {
      const e = p.e0 + zufall(p.u * 0.0013 + k * 3.1 + versuche * 0.917) * (p.e1 - p.e0)
      const n = p.n0 + zufall(p.u * 0.0017 + k * 5.3 + versuche * 1.311) * (p.n1 - p.n0)
      if (!innen(p, e, n) || randAbstand(p, e, n) < 0.8) continue
      // gegen die Enden weniger: angenommen mit PERRON_ENDE_ANTEIL bis 1
      const t = laengs(e, n)
      if (zufall(e * 1.7 + n * 0.3 + 5) > PERRON_ENDE_ANTEIL + (1 - PERRON_ENDE_ANTEIL) * Math.sin(Math.PI * t)) continue
      // eine Gruppe um diese Stelle, die Leute schauen grob zueinander
      const w = zufall(e * 0.9 + n * 2.1), gross = Math.min(zahl - i, GRUPPE_PERRON.findIndex((g) => w < g) + 1 || 1)
      const ab = zufall(e * 0.7 + n * 0.3 + 2)
      for (let j = 0; j < gross; j++, i++) {
        const r = j ? GRUPPE_RADIUS_M * (0.5 + 0.5 * zufall(e + j * 3.7)) : 0, a = zufall(n + j * 1.9) * Math.PI * 2
        let ge = e + Math.cos(a) * r, gn = n + Math.sin(a) * r
        if (!innen(p, ge, gn) || randAbstand(p, ge, gn) < 0.6) { ge = e + (j ? Math.cos(a) * 0.6 : 0); gn = n + (j ? Math.sin(a) * 0.6 : 0) }
        // zur Mitte der Gruppe gedreht, etwas gestreut; die Figur schaut nach +z, in der Szene ist +z Süden
        const zuMitte = j ? Math.atan2(e - ge, -(n - gn)) : zufall(e * 0.37 + n * 0.11) * Math.PI * 2
        setzen(ge, gn, zuMitte + (zufall(ge * 0.3 + gn) - 0.5) * 0.8, ab + j * 0.03)
      }
    }
  })
  return raus
}
