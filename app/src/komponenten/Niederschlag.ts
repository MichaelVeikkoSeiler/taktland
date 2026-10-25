/**
 * Regen und Schnee über einem Modell (Michael, 2026-10-24: «Regen auch einblenden mit der gleichen Prognose wie die Windhose»): Striche
 * oder Flocken in einem Würfel der Kantenlänge 1, der Aufrufer setzt ihn über das Modell und skaliert ihn. Dichte, Grösse und Tempo
 * gewählt, wie in der Modellbahn (Relief.tsx); fürs Bild, keine Menge.
 */
import * as THREE from 'three'

const ANZAHL = 6000, STRICH = 0.03
/** aus der Ferne weniger und blassere Tropfen (Michael, 2026-10-25: «aus der Ferne etwas zu überproportional viel»): ab so viel
 *  Abstand der Kamera, gemessen an der Breite des Modells, wird es weniger, höchstens bis auf FERN_MIN (gewählt) */
const FERN_AB = 1.2, FERN_MIN = 0.15
/** und kürzere Striche, kleinere Flocken (Michael, 2026-10-25: «Regentropfen kleiner machen, wenn man wegzoomt»), bis auf KLEIN_MIN (gewählt) */
const KLEIN_MIN = 0.3

export interface Niederschlag {
  gruppe: THREE.Group
  /** null: nichts fällt */
  setzen: (art: 'regen' | 'schnee' | null, staerke: number) => void
  /** ferne: Abstand der Kamera zur Mitte geteilt durch die Breite des Modells */
  schritt: (dt: number, ferne?: number) => void
  entsorgen: () => void
}

/** strich: Länge eines Regenstrichs als Anteil der Höhe des Würfels (der Aufrufer rechnet ihn auf die Breite des Modells um) */
export function niederschlagBauen(strich = STRICH): Niederschlag {
  const gruppe = new THREE.Group()
  const mitte = new Float32Array(ANZAHL * 3).map(() => Math.random() - 0.5)
  const lage = new Float32Array(ANZAHL * 6)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(lage, 3))
  const strichStoff = new THREE.LineBasicMaterial({ color: '#dfe6ee', transparent: true, opacity: 0.6, depthWrite: false })
  const flockenStoff = new THREE.PointsMaterial({ color: '#ffffff', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false })
  const striche = new THREE.LineSegments(geo, strichStoff), flocken = new THREE.Points(geo, flockenStoff)
  for (const o of [striche, flocken]) { o.frustumCulled = false; o.visible = false; gruppe.add(o) }
  let art: 'regen' | 'schnee' | null = null, voll = 0, anzahl = 0, laenge = strich
  return {
    gruppe,
    setzen: (a, staerke) => {
      art = a
      voll = a ? Math.round(ANZAHL * Math.max(0, Math.min(1, staerke))) : 0
      anzahl = voll
      geo.setDrawRange(0, 2 * anzahl)
      striche.visible = a === 'regen'; flocken.visible = a === 'schnee'
    },
    schritt: (dt, ferne) => {
      if (!art) return
      if (ferne !== undefined) {
        const f = Math.max(FERN_MIN, Math.min(1, FERN_AB / Math.max(1e-6, ferne)))
        anzahl = Math.round(voll * f)
        geo.setDrawRange(0, 2 * anzahl)
        strichStoff.opacity = 0.6 * (0.5 + 0.5 * f); flockenStoff.opacity = 0.9 * (0.5 + 0.5 * f)
        const klein = Math.max(KLEIN_MIN, Math.min(1, FERN_AB / Math.max(1e-6, ferne)))
        laenge = strich * klein; flockenStoff.size = Math.max(1, 3 * klein)
      }
      const schnee = art === 'schnee'
      const fall = (schnee ? 0.08 : 0.7) * dt, wind = (schnee ? 0.02 : 0.04) * dt
      for (let i = 0, j = 0; i < anzahl * 3; i += 3, j += 6) {
        mitte[i + 1] -= fall * (0.7 + 0.6 * ((i * 7919) % 100) / 100)
        mitte[i] += wind
        if (mitte[i + 1] < -0.5) mitte[i + 1] += 1
        if (mitte[i] > 0.5) mitte[i] -= 1
        lage[j] = mitte[i]; lage[j + 1] = mitte[i + 1]; lage[j + 2] = mitte[i + 2]
        lage[j + 3] = mitte[i] - (schnee ? 0 : laenge * 0.1); lage[j + 4] = mitte[i + 1] + (schnee ? 0 : laenge); lage[j + 5] = mitte[i + 2]
      }
      geo.attributes.position.needsUpdate = true
    },
    entsorgen: () => { geo.dispose(); strichStoff.dispose(); flockenStoff.dispose() },
  }
}
