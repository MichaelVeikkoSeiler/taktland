/**
 * Der Sternenhimmel für «3D Schweiz» (Michael, 2026-10-24: «Himmel nachts dunkler und mit Sternen machen»): die Sterne bis zur
 * Helligkeit 6 aus data/sterne.json (Hipparcos, pipeline/build_sterne.py), ihre Richtung am Himmel zu einer Zeit über einem Ort
 * gerechnet wie die Sonne in src/sonne.ts. Gerechnet, nicht aus einer Quelle: ohne die Bewegung der Erdachse seit 2000 (etwa
 * ein Drittel Grad), ohne die Brechung der Luft am Horizont, ohne Mond und Planeten.
 */
import { holen } from './daten'

const RAD = Math.PI / 180

interface Katalog { sterne: Array<[number, number, number, number | null]> }
let katalog: Promise<Katalog> | null = null
export const sterneLaden = () => (katalog ??= holen<Katalog>('data/sterne.json'))

/** Farbe eines Sterns nach seinem Farbindex B−V, ungefähr (blauweiss bis orange); ohne Angabe weiss */
function farbe(bv: number | null): [number, number, number] {
  if (bv === null) return [1, 1, 1]
  const stufen: Array<[number, [number, number, number]]> = [[-0.3, [0.66, 0.75, 1]], [0, [0.85, 0.9, 1]], [0.4, [1, 1, 0.97]],
    [0.8, [1, 0.93, 0.8]], [1.4, [1, 0.8, 0.56]], [2, [1, 0.7, 0.45]]]
  if (bv <= stufen[0][0]) return stufen[0][1]
  for (let i = 1; i < stufen.length; i++) {
    const [b1, f1] = stufen[i], [b0, f0] = stufen[i - 1]
    if (bv <= b1) { const t = (bv - b0) / (b1 - b0); return [0, 1, 2].map((k) => f0[k] + (f1[k] - f0[k]) * t) as [number, number, number] }
  }
  return stufen[stufen.length - 1][1]
}

/** die Sterne über dem Horizont: Richtung als Einheitsvektor (x Osten, y hinauf, z Süden), Farbe und Helligkeit */
export function sternenhimmel(k: Katalog, zeit: Date, la: number, lo: number) {
  const n = zeit.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545.0
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24
  const lst = (gmst * 15 + lo) * RAD, phi = la * RAD
  const lage: number[] = [], farben: number[] = [], mag: number[] = []
  for (const [ra100, dek100, mag10, bv100] of k.sterne) {
    const ra = (ra100 / 100) * RAD, dek = (dek100 / 100) * RAD, ha = lst - ra
    const sh = Math.sin(phi) * Math.sin(dek) + Math.cos(phi) * Math.cos(dek) * Math.cos(ha)
    if (sh <= 0) continue
    const h = Math.asin(sh)
    const az = Math.atan2(-Math.sin(ha), Math.tan(dek) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha))
    lage.push(Math.sin(az) * Math.cos(h), Math.sin(h), -Math.cos(az) * Math.cos(h))
    farben.push(...farbe(bv100 === null ? null : bv100 / 100))
    mag.push(mag10 / 10)
  }
  return { lage: new Float32Array(lage), farben: new Float32Array(farben), mag: new Float32Array(mag) }
}
