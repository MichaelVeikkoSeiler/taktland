/**
 * Regen und Schnee über einem Modell (Michael, 2026-10-24: «Regen auch einblenden mit der gleichen Prognose wie die Windhose»; 2026-10-28:
 * «Regen soll aus den Wolken kommen und nicht von viel weiter oben»): Tropfen in Säulen, jede Säule ein Feld mit ihrer Stärke, von ihrer
 * Oberkante (der Wolke) bis zum Boden; über der Schneefallgrenze einer Säule fällt Schnee, darunter Regen. Dichte, Grösse und Tempo
 * gewählt, wie in der Modellbahn (Relief.tsx); fürs Bild, keine Menge.
 */
import * as THREE from 'three'

const ANZAHL = 6000
/** aus der Ferne weniger und blassere Tropfen (Michael, 2026-10-25: «aus der Ferne etwas zu überproportional viel»): ab so viel
 *  Abstand der Kamera, gemessen an der Breite des Modells, wird es weniger, höchstens bis auf FERN_MIN (gewählt) */
const FERN_AB = 1.2, FERN_MIN = 0.15
/** und kürzere Striche, kleinere Flocken (Michael, 2026-10-25: «Regentropfen kleiner machen, wenn man wegzoomt»), bis auf KLEIN_MIN (gewählt) */
const KLEIN_MIN = 0.3
/** so viel ihrer Säule fällt ein Tropfen je Sekunde, eine Flocke (gewählt, nicht die wirkliche Fallgeschwindigkeit) */
const REGEN_JE_S = 0.7, SCHNEE_JE_S = 0.12

/** ein Feld, über dem es regnet oder schneit, in Einheiten des Modells (km), y nach oben */
export interface Saeule {
  x0: number; x1: number; z0: number; z1: number
  /** Oberkante: wo der Niederschlag beginnt */
  oben: number
  /** 0 bis 1 */
  staerke: number
  /** darüber Schnee, darunter Regen; Infinity: nur Regen, -Infinity: nur Schnee */
  schneeAb: number
}

export interface Niederschlag {
  gruppe: THREE.Group
  /** die Säulen (leer: nichts fällt), der Boden unter jeder Stelle, die Fläche des ganzen Modells (für die Dichte), die Länge eines Strichs */
  setzen: (saeulen: Saeule[], boden: (x: number, z: number) => number, flaeche: number, strich: number) => void
  /** ferne: Abstand der Kamera zur Mitte geteilt durch die Breite des Modells */
  schritt: (dt: number, ferne?: number) => void
  entsorgen: () => void
}

export function niederschlagBauen(): Niederschlag {
  const gruppe = new THREE.Group()
  const regenLage = new Float32Array(ANZAHL * 6), schneeLage = new Float32Array(ANZAHL * 3)
  const regenGeo = new THREE.BufferGeometry(), schneeGeo = new THREE.BufferGeometry()
  regenGeo.setAttribute('position', new THREE.BufferAttribute(regenLage, 3))
  schneeGeo.setAttribute('position', new THREE.BufferAttribute(schneeLage, 3))
  const strichStoff = new THREE.LineBasicMaterial({ color: '#dfe6ee', transparent: true, opacity: 0.6, depthWrite: false })
  const flockenStoff = new THREE.PointsMaterial({ color: '#ffffff', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false })
  const striche = new THREE.LineSegments(regenGeo, strichStoff), flocken = new THREE.Points(schneeGeo, flockenStoff)
  for (const o of [striche, flocken]) { o.frustumCulled = false; gruppe.add(o) }
  // je Tropfen: Stelle, Boden, Oberkante, Schneefallgrenze, wie weit gefallen (0 oben, 1 am Boden), eigenes Tempo
  const x = new Float32Array(ANZAHL), z = new Float32Array(ANZAHL), unten = new Float32Array(ANZAHL), oben = new Float32Array(ANZAHL)
  const grenze = new Float32Array(ANZAHL), weg = new Float32Array(ANZAHL), tempo = new Float32Array(ANZAHL)
  let saeulen: Saeule[] = [], summen: number[] = [], boden = (_x: number, _z: number) => 0
  let voll = 0, anzahl = 0, strich = 0.03, laenge = 0.03
  const neu = (i: number) => {
    // eine Säule nach ihrer Stärke mal Fläche, darin eine zufällige Stelle
    const r = Math.random() * summen[summen.length - 1]
    let lo = 0, hi = summen.length - 1
    while (lo < hi) { const mi = (lo + hi) >> 1; if (summen[mi] < r) lo = mi + 1; else hi = mi }
    const s = saeulen[lo]
    x[i] = s.x0 + Math.random() * (s.x1 - s.x0); z[i] = s.z0 + Math.random() * (s.z1 - s.z0)
    unten[i] = boden(x[i], z[i]); oben[i] = Math.max(unten[i], s.oben); grenze[i] = s.schneeAb
    tempo[i] = 0.7 + 0.6 * Math.random()
  }
  return {
    gruppe,
    setzen: (liste, b, flaeche, s) => {
      saeulen = liste.filter((q) => q.staerke > 0 && q.x1 > q.x0 && q.z1 > q.z0)
      boden = b; strich = s
      let summe = 0
      summen = saeulen.map((q) => (summe += q.staerke * (q.x1 - q.x0) * (q.z1 - q.z0)))
      voll = saeulen.length ? Math.min(ANZAHL, Math.round((ANZAHL * summe) / Math.max(1e-9, flaeche))) : 0
      anzahl = voll
      for (let i = 0; i < voll; i++) { neu(i); weg[i] = Math.random() }
      striche.visible = flocken.visible = voll > 0
    },
    schritt: (dt, ferne) => {
      if (!voll) return
      let klein = 1
      if (ferne !== undefined) {
        const f = Math.max(FERN_MIN, Math.min(1, FERN_AB / Math.max(1e-6, ferne)))
        anzahl = Math.round(voll * f)
        strichStoff.opacity = 0.6 * (0.5 + 0.5 * f); flockenStoff.opacity = 0.9 * (0.5 + 0.5 * f)
        klein = Math.max(KLEIN_MIN, Math.min(1, FERN_AB / Math.max(1e-6, ferne)))
        flockenStoff.size = Math.max(1, 3 * klein)
      }
      laenge = strich * klein
      let r = 0, f = 0
      for (let i = 0; i < anzahl; i++) {
        const h = oben[i] - unten[i]
        let y = oben[i] - weg[i] * h
        const schnee = y > grenze[i]
        weg[i] += (schnee ? SCHNEE_JE_S : REGEN_JE_S) * tempo[i] * dt
        if (weg[i] >= 1) { neu(i); weg[i] = 0 }
        y = oben[i] - weg[i] * (oben[i] - unten[i])
        if (y > grenze[i]) {
          schneeLage[f * 3] = x[i]; schneeLage[f * 3 + 1] = y; schneeLage[f * 3 + 2] = z[i]; f++
        } else {
          // der Strich nie länger als ein Viertel seiner Säule (in der ganzen Schweiz ist die Säule unter einer tiefen Wolke kurz)
          const l = Math.min(laenge, 0.25 * (oben[i] - unten[i]))
          const j = r * 6
          regenLage[j] = x[i]; regenLage[j + 1] = y; regenLage[j + 2] = z[i]
          regenLage[j + 3] = x[i]; regenLage[j + 4] = Math.min(oben[i], y + l); regenLage[j + 5] = z[i]; r++
        }
      }
      regenGeo.setDrawRange(0, 2 * r); schneeGeo.setDrawRange(0, f)
      regenGeo.attributes.position.needsUpdate = true; schneeGeo.attributes.position.needsUpdate = true
    },
    entsorgen: () => { regenGeo.dispose(); schneeGeo.dispose(); strichStoff.dispose(); flockenStoff.dispose() },
  }
}
