/**
 * Regen und Schnee über einem Modell (Michael, 2026-10-24: «Regen auch einblenden mit der gleichen Prognose wie die Windhose»): Striche
 * oder Flocken in einem Würfel der Kantenlänge 1, der Aufrufer setzt ihn über das Modell und skaliert ihn. Dichte, Grösse und Tempo
 * gewählt, wie in der Modellbahn (Relief.tsx); fürs Bild, keine Menge.
 */
import * as THREE from 'three'

const ANZAHL = 6000, STRICH = 0.03

export interface Niederschlag {
  gruppe: THREE.Group
  /** null: nichts fällt */
  setzen: (art: 'regen' | 'schnee' | null, staerke: number) => void
  schritt: (dt: number) => void
  entsorgen: () => void
}

export function niederschlagBauen(): Niederschlag {
  const gruppe = new THREE.Group()
  const mitte = new Float32Array(ANZAHL * 3).map(() => Math.random() - 0.5)
  const lage = new Float32Array(ANZAHL * 6)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(lage, 3))
  const strichStoff = new THREE.LineBasicMaterial({ color: '#dfe6ee', transparent: true, opacity: 0.6, depthWrite: false })
  const flockenStoff = new THREE.PointsMaterial({ color: '#ffffff', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false })
  const striche = new THREE.LineSegments(geo, strichStoff), flocken = new THREE.Points(geo, flockenStoff)
  for (const o of [striche, flocken]) { o.frustumCulled = false; o.visible = false; gruppe.add(o) }
  let art: 'regen' | 'schnee' | null = null, anzahl = 0
  return {
    gruppe,
    setzen: (a, staerke) => {
      art = a
      anzahl = a ? Math.round(ANZAHL * Math.max(0, Math.min(1, staerke))) : 0
      geo.setDrawRange(0, 2 * anzahl)
      striche.visible = a === 'regen'; flocken.visible = a === 'schnee'
    },
    schritt: (dt) => {
      if (!art) return
      const schnee = art === 'schnee'
      const fall = (schnee ? 0.08 : 0.7) * dt, wind = (schnee ? 0.02 : 0.04) * dt
      for (let i = 0, j = 0; i < anzahl * 3; i += 3, j += 6) {
        mitte[i + 1] -= fall * (0.7 + 0.6 * ((i * 7919) % 100) / 100)
        mitte[i] += wind
        if (mitte[i + 1] < -0.5) mitte[i + 1] += 1
        if (mitte[i] > 0.5) mitte[i] -= 1
        lage[j] = mitte[i]; lage[j + 1] = mitte[i + 1]; lage[j + 2] = mitte[i + 2]
        lage[j + 3] = mitte[i] - (schnee ? 0 : STRICH * 0.1); lage[j + 4] = mitte[i + 1] + (schnee ? 0 : STRICH); lage[j + 5] = mitte[i + 2]
      }
      geo.attributes.position.needsUpdate = true
    },
    entsorgen: () => { geo.dispose(); strichStoff.dispose(); flockenStoff.dispose() },
  }
}
