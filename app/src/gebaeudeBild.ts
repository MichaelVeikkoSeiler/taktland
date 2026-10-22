import * as THREE from 'three'

/** Oberfläche der Gebäude (Michael, 2026-10-22: «etwas Körnung und Schattierung (Ambient Occlusion)»): gemalt, nicht aus einer
 *  Quelle. Ein feines Rauschen auf Wänden und Dächern (ein Bild deckt GEBAEUDE_BILD_M im Quadrat) und von Hand gesetzte
 *  Ambient Occlusion: Wände unten am Boden dunkler, oben unter dem Dach etwas dunkler. Die Wände reichen in den Daten
 *  WAND_TIEFER_M unter den Boden (pipeline/build_gebaeude.py), der Boden liegt darum so hoch über ihrem untersten Punkt */
const GEBAEUDE_BILD_M = 4
const WAND_TIEFER_M = 2
/** Ambient Occlusion: so dunkel am Boden, bis so hoch darüber ausgelaufen (m); unter dem Dach so dunkel, so weit hinab */
const AO_BODEN = 0.55, AO_BODEN_M = 3, AO_DACH = 0.8, AO_DACH_M = 0.8

let bild: THREE.CanvasTexture | null = null
function koernung() {
  if (bild) return bild
  const N = 256, c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!, daten = g.createImageData(N, N)
  // kachelbares Rauschen: Zufallsgitter mit q Feldern je Seite, weich dazwischen (wie brueckenBild in Relief.tsx)
  const rauschen = (q: number) => {
    const gitter = Array.from({ length: q * q }, () => Math.random() * 2 - 1)
    return (x: number, y: number) => {
      const fx = (x / N) * q, fy = (y / N) * q, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j
      const w = (a: number, b: number) => gitter[((b % q + q) % q) * q + ((a % q + q) % q)]
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v)
      return (w(i, j) * (1 - su) + w(i + 1, j) * su) * (1 - sv) + (w(i, j + 1) * (1 - su) + w(i + 1, j + 1) * su) * sv
    }
  }
  const grob = rauschen(4), mittel = rauschen(16), fein = rauschen(64)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = grob(x, y) * 16 + mittel(x, y) * 13 + fein(x, y) * 10 + (Math.random() - 0.5) * 40
      const k = (y * N + x) * 4
      daten.data[k] = daten.data[k + 1] = daten.data[k + 2] = Math.max(0, Math.min(255, 222 + d))
      daten.data[k + 3] = 255
    }
  }
  g.putImageData(daten, 0, 0)
  bild = new THREE.CanvasTexture(c)
  bild.wrapS = bild.wrapT = THREE.RepeatWrapping
  bild.anisotropy = 4
  return bild
}

/** das Material der Gebäude: Farben der Ecken mal Körnung mal Ambient Occlusion (Attribut aGebaeude aus gebaeudeFlaechen) */
export function gebaeudeMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: koernung() })
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aGebaeude;\nvarying vec2 vGebaeude;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGebaeude = aGebaeude;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGebaeude;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (vGebaeude.x >= 0.0) {
        diffuseColor.rgb *= mix(${AO_BODEN.toFixed(3)}, 1.0, smoothstep(${WAND_TIEFER_M.toFixed(1)}, ${(WAND_TIEFER_M + AO_BODEN_M).toFixed(1)}, vGebaeude.x));
        diffuseColor.rgb *= mix(${AO_DACH.toFixed(3)}, 1.0, smoothstep(0.0, ${AO_DACH_M.toFixed(2)}, vGebaeude.y));
      }`)
  }
  return m
}

/** UV und Ambient Occlusion für Dreiecke ohne Index (je drei Ecken eines), Lage in Einheiten zu je `meter` m, y oben.
 *  (in der Höhe `hoeheMeter`, bei Überhöhung weniger). Wände (fast senkrecht): Bild entlang der Wand und in der Höhe, dazu Höhe über ihrem Fuss und Abstand zu ihrer Oberkante.
 *  Der Fuss ist der tiefste Wandpunkt am selben Ort (Raster 0,5 m), so zählt auch das Dreieck unter dem First eines Giebels
 *  vom Boden aus. Dächer: Bild von oben, ohne Ambient Occlusion (-1) */
export function gebaeudeFlaechen(geo: THREE.BufferGeometry, meter = 1, hoeheMeter = meter) {
  const p = geo.getAttribute('position').array as ArrayLike<number>
  const n = p.length / 3, uv = new Float32Array(n * 2), ao = new Float32Array(n * 2)
  const zelle = (i: number) => `${Math.round((p[i * 3] * meter) / 0.5)},${Math.round((p[i * 3 + 2] * meter) / 0.5)}`
  const wand = new Uint8Array(n / 3)
  const tief = new Map<string, number>(), hoch = new Map<string, number>()
  for (let d = 0; d < n / 3; d++) {
    const a = d * 9
    const ux = p[a + 3] - p[a], uy = (p[a + 4] - p[a + 1]) * hoeheMeter / meter, uz = p[a + 5] - p[a + 2]
    const vx = p[a + 6] - p[a], vy = (p[a + 7] - p[a + 1]) * hoeheMeter / meter, vz = p[a + 8] - p[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    if (Math.abs(ny / l) > 0.3) continue
    wand[d] = 1
    for (let q = d * 3; q < d * 3 + 3; q++) {
      const k = zelle(q), y = p[q * 3 + 1] * hoeheMeter
      tief.set(k, Math.min(tief.get(k) ?? Infinity, y))
      hoch.set(k, Math.max(hoch.get(k) ?? -Infinity, y))
    }
  }
  for (let d = 0; d < n / 3; d++) {
    const a = d * 9
    if (!wand[d]) {
      for (let q = d * 3; q < d * 3 + 3; q++) {
        uv[q * 2] = (p[q * 3] * meter) / GEBAEUDE_BILD_M; uv[q * 2 + 1] = (p[q * 3 + 2] * meter) / GEBAEUDE_BILD_M
        ao[q * 2] = ao[q * 2 + 1] = -1
      }
      continue
    }
    // Richtung entlang der Wand, waagrecht
    let tx = p[a + 3] - p[a], tz = p[a + 5] - p[a + 2]
    if (Math.hypot(tx, tz) < 1e-9) { tx = p[a + 6] - p[a]; tz = p[a + 8] - p[a + 2] }
    const tl = Math.hypot(tx, tz) || 1
    tx /= tl; tz /= tl
    let fuss = Infinity, oben = -Infinity
    for (let q = d * 3; q < d * 3 + 3; q++) {
      const k = zelle(q)
      fuss = Math.min(fuss, tief.get(k)!); oben = Math.max(oben, hoch.get(k)!)
    }
    for (let q = d * 3; q < d * 3 + 3; q++) {
      const x = p[q * 3] * meter, y = p[q * 3 + 1] * hoeheMeter, z = p[q * 3 + 2] * meter
      uv[q * 2] = (x * tx + z * tz) / GEBAEUDE_BILD_M; uv[q * 2 + 1] = y / GEBAEUDE_BILD_M
      ao[q * 2] = y - fuss; ao[q * 2 + 1] = oben - y
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setAttribute('aGebaeude', new THREE.BufferAttribute(ao, 2))
}
