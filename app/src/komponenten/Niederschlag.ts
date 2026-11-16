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
/** und aus der Nähe ebenso kürzer (Michael, 2026-11-16, Bildschirmfoto im Feld von 1 km nahe am Boden: die Striche standen wie weisse Pfosten im Gelände):
 *  liegt die Kamera näher als NAH_AB Breiten an dem Punkt, den sie anschaut (blick), wird der Strich im selben Verhältnis kürzer, höchstens bis NAH_MIN (gewählt) */
const NAH_AB = 0.8, NAH_MIN = 0.12
/** wie deckend ein Strich ist (vorher 0,6, gewählt) */
const STRICH_DECKT = 0.45
/** in der Brille (Michael, 2026-11-09: «Regentropfen, die weiter weg sind, kleiner … Die in meiner Nähe sind dafür sehr groß. Kannst du alles ein
 *  bisschen kleiner machen und je weiter weg noch kleiner?»): jeder Strich BRILLE_KLEINER so lang wie auf dem Bildschirm, und mit dem Abstand zum
 *  Auge kürzer, bei BRILLE_HALB_ANTEIL der Breite des Modells halb so lang (gewählt) */
const BRILLE_KLEINER = 0.45, BRILLE_HALB_ANTEIL = 0.25
/** so viel ihrer Säule fällt ein Tropfen je Sekunde, eine Flocke (gewählt, nicht die wirkliche Fallgeschwindigkeit) */
const REGEN_JE_S = 0.7, SCHNEE_JE_S = 0.12
/** schräg im Wind (Michael, 2026-11-16: «je stärker der Wind ist, desto schräger fallen die Regen- oder auch Schneeflocken herab»): bei vollem Wind
 *  (staerke 1) so viel waagrecht je Meter Fall, Schnee mehr als Regen, weil er langsamer fällt (gewählt, nicht gerechnet) */
export const REGEN_SCHRAEG = 0.9, SCHNEE_SCHRAEG = 1.6

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
  /** ferne: Abstand der Kamera zur Mitte geteilt durch die Breite des Modells; auge: in der Brille die Stelle des Auges in der Gruppe, breite
   *  des Modells in denselben Einheiten */
  schritt: (dt: number, ferne?: number, auge?: { x: number; y: number; z: number; breite: number }, blick?: number) => void
  /** der Wind: Richtung, wohin er weht, in der Ebene der Gruppe (x, z), und Stärke 0 bis 1 */
  windSetzen: (x: number, z: number, staerke: number) => void
  entsorgen: () => void
}

export function niederschlagBauen(): Niederschlag {
  const gruppe = new THREE.Group()
  const regenLage = new Float32Array(ANZAHL * 6), schneeLage = new Float32Array(ANZAHL * 3)
  const regenGeo = new THREE.BufferGeometry(), schneeGeo = new THREE.BufferGeometry()
  regenGeo.setAttribute('position', new THREE.BufferAttribute(regenLage, 3))
  schneeGeo.setAttribute('position', new THREE.BufferAttribute(schneeLage, 3))
  const strichStoff = new THREE.LineBasicMaterial({ color: '#dfe6ee', transparent: true, opacity: STRICH_DECKT, depthWrite: false })
  const flockenStoff = new THREE.PointsMaterial({ color: '#ffffff', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false })
  const striche = new THREE.LineSegments(regenGeo, strichStoff), flocken = new THREE.Points(schneeGeo, flockenStoff)
  for (const o of [striche, flocken]) { o.frustumCulled = false; gruppe.add(o) }
  // je Tropfen: Stelle, Boden, Oberkante, Schneefallgrenze, wie weit gefallen (0 oben, 1 am Boden), eigenes Tempo
  const x = new Float32Array(ANZAHL), z = new Float32Array(ANZAHL), unten = new Float32Array(ANZAHL), oben = new Float32Array(ANZAHL)
  const grenze = new Float32Array(ANZAHL), weg = new Float32Array(ANZAHL), tempo = new Float32Array(ANZAHL), saeule = new Int32Array(ANZAHL)
  let windX = 0, windZ = 0, windStark = 0
  let saeulen: Saeule[] = [], summen: number[] = [], boden = (_x: number, _z: number) => 0
  let voll = 0, anzahl = 0, strich = 0.03, laenge = 0.03
  const neu = (i: number) => {
    // eine Säule nach ihrer Stärke mal Fläche, darin eine zufällige Stelle
    const r = Math.random() * summen[summen.length - 1]
    let lo = 0, hi = summen.length - 1
    while (lo < hi) { const mi = (lo + hi) >> 1; if (summen[mi] < r) lo = mi + 1; else hi = mi }
    const s = saeulen[lo]
    saeule[i] = lo
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
    schritt: (dt, ferne, auge, blick) => {
      if (!voll) return
      let klein = 1
      if (ferne !== undefined) {
        const f = Math.max(FERN_MIN, Math.min(1, FERN_AB / Math.max(1e-6, ferne)))
        anzahl = Math.round(voll * f)
        strichStoff.opacity = STRICH_DECKT * (0.5 + 0.5 * f); flockenStoff.opacity = 0.9 * (0.5 + 0.5 * f)
        klein = Math.max(KLEIN_MIN, Math.min(1, FERN_AB / Math.max(1e-6, ferne))) * Math.max(NAH_MIN, Math.min(1, (blick ?? ferne) / NAH_AB))
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
        // im Wind fällt der Tropfen schräg: weiter oben liegt er gegen den Wind versetzt, am Boden an seiner Stelle; ausserhalb seiner Säule
        // (über dem Rand des Modells) wird er nicht gezeichnet
        const schraeg = windStark * (y > grenze[i] ? SCHNEE_SCHRAEG : REGEN_SCHRAEG), ueber = (y - unten[i]) * schraeg
        const px = x[i] - windX * ueber, pz = z[i] - windZ * ueber, sq = saeulen[saeule[i]]
        if (schraeg > 0 && sq && (px < sq.x0 || px > sq.x1 || pz < sq.z0 || pz > sq.z1)) continue
        if (y > grenze[i]) {
          schneeLage[f * 3] = px; schneeLage[f * 3 + 1] = y; schneeLage[f * 3 + 2] = pz; f++
        } else {
          // der Strich nie länger als ein Viertel seiner Säule (in der ganzen Schweiz ist die Säule unter einer tiefen Wolke kurz)
          let l = Math.min(laenge, 0.25 * (oben[i] - unten[i]))
          if (auge) {
            const d = Math.hypot(x[i] - auge.x, y - auge.y, z[i] - auge.z)
            l *= BRILLE_KLEINER / (1 + d / (BRILLE_HALB_ANTEIL * auge.breite))
          }
          const j = r * 6
          const lo = Math.min(oben[i], y + l) - y
          regenLage[j] = px; regenLage[j + 1] = y; regenLage[j + 2] = pz
          regenLage[j + 3] = px - windX * lo * schraeg; regenLage[j + 4] = y + lo; regenLage[j + 5] = pz - windZ * lo * schraeg; r++
        }
      }
      regenGeo.setDrawRange(0, 2 * r); schneeGeo.setDrawRange(0, f)
      regenGeo.attributes.position.needsUpdate = true; schneeGeo.attributes.position.needsUpdate = true
    },
    windSetzen: (wx, wz, st) => {
      const l = Math.hypot(wx, wz)
      windStark = l > 1e-9 ? Math.max(0, Math.min(1, st)) : 0
      windX = l > 1e-9 ? wx / l : 0; windZ = l > 1e-9 ? wz / l : 0
    },
    entsorgen: () => { regenGeo.dispose(); schneeGeo.dispose(); strichStoff.dispose(); flockenStoff.dispose() },
  }
}
