import * as THREE from 'three'

/** Oberfläche der Gebäude (Michael, 2026-10-22: «etwas Körnung und Schattierung (Ambient Occlusion)»): gemalt, nicht aus einer
 *  Quelle. Ein feines Rauschen auf Wänden und Dächern (ein Bild deckt GEBAEUDE_BILD_M im Quadrat) und von Hand gesetzte
 *  Ambient Occlusion: Wände unten am Boden dunkler, oben unter dem Dach etwas dunkler. Die Wände reichen in den Daten
 *  WAND_TIEFER_M unter den Boden (pipeline/build_gebaeude.py), der Boden liegt darum so hoch über ihrem untersten Punkt */
const GEBAEUDE_BILD_M = 4
const WAND_TIEFER_M = 2
/** Ambient Occlusion: so dunkel am Boden, bis so hoch darüber ausgelaufen (m); unter dem Dach so dunkel, so weit hinab */
const AO_BODEN = 0.72, AO_BODEN_M = 8, AO_DACH = 0.8, AO_DACH_M = 0.8

/** Licht in den Fenstern, wenn es dunkel ist (Michael, 2026-10-24: «Ist es dunkel brennen bei den Gebäuden Lichter. Realistische
 *  Verteilung»): swissBUILDINGS3D kennt weder Fenster noch Stockwerke noch die Nutzung, alles hier ist eine Annahme fürs Bild.
 *  Je Wand ein Raster aus Stockwerken von FENSTER_STOCK_M und Achsen von FENSTER_ACHSE_M, in jeder Zelle ein Fenster; welches
 *  brennt, entscheidet ein fester Zufall je Fenster gegen den Anteil zur Uhrzeit (LICHT_ANTEIL), so brennen mit steigendem Anteil
 *  dieselben weiter und neue dazu. Weit weg wird jedes Fenster über seinen Bildpunkt gemittelt und schwächer */
/** wie hell ein brennendes Fenster leuchtet (gewählt; Michael, 2026-10-25: «10% weniger hell», vorher 1,6, dann 1,44; danach
 *  «weitere 10%», 1,3; dann «noch immer etwas zu hell», 1,0; 2026-10-27: «noch leicht abdunkeln. Circa 10%») */
const FENSTER_HELL = 0.9
/** weit weg schwächer (Michael, 2026-10-25: «wenn man in die Ferne schaut, sollen sie dort wesentlich weniger hell scheinen»): ab
 *  FERN_AB_M je Bildpunkt sinkt die Helligkeit mit dem Abstand bis auf FERN_MIN (gewählt; vorher wurden sie weit weg heller) */
const FERN_AB_M = 0.5, FERN_MIN = 0.12
const FENSTER_STOCK_M = 3, FENSTER_ACHSE_M = 3.2, FENSTER_BREITE_M = 1.3, FENSTER_HOEHE_M = 1.5, FENSTER_BRUESTUNG_M = 0.9
/** Anteil der brennenden Fenster je Stunde (Schweizer Zeit) an der Stunde 0, 1, …; gewählt, ungefähr: abends die meisten,
 *  nach Mitternacht wenige, am Morgen wieder mehr; tagsüber zählt es nicht, dann ist es hell */
const LICHT_ANTEIL = [0.12, 0.07, 0.05, 0.04, 0.04, 0.06, 0.14, 0.22, 0.18, 0.12, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.12, 0.2, 0.3, 0.36,
  0.38, 0.34, 0.26, 0.18]
/** so viel der Anteile oben brennt wirklich (Michael, 2026-10-27: «um die Hälfte reduzieren. Sonst ist es unrealistisch») */
const LICHT_MASS = 0.5
/** der Anteil zu einer Uhrzeit in Stunden, zwischen den vollen Stunden gerade verbunden */
export function lichtAnteil(stunde: number) {
  const h = ((stunde % 24) + 24) % 24, i = Math.floor(h), t = h - i
  return (LICHT_ANTEIL[i] * (1 - t) + LICHT_ANTEIL[(i + 1) % 24] * t) * LICHT_MASS
}
const fenster = { nacht: { value: 0 }, anteil: { value: 0 } }
/** wie dunkel es ist (0 hell bis 1 Nacht), dieselbe Grösse für die Innenbeleuchtung und die Stirnlichter der Züge */
export const fensterNacht = fenster.nacht
/** wie dunkel es ist (0 hell bis 1 Nacht) und welcher Anteil der Fenster brennt; gilt für alle Gebäude */
export function fensterLicht(nacht: number, anteil: number) {
  fenster.nacht.value = Math.max(0, Math.min(1, nacht))
  fenster.anteil.value = Math.max(0, Math.min(1, anteil))
}

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
    s.uniforms.uNacht = fenster.nacht
    s.uniforms.uAnteil = fenster.anteil
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aGebaeude;\nvarying vec2 vGebaeude;\nvarying vec2 vWand;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGebaeude = aGebaeude;\nvWand = uv * ${GEBAEUDE_BILD_M.toFixed(1)};`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGebaeude;\nvarying vec2 vWand;\nuniform float uNacht;\nuniform float uAnteil;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (uNacht > 0.0 && vGebaeude.x >= 0.0) {
        // Höhe über dem Boden (die Wand reicht in den Daten unter ihn) und Lage entlang der Wand, in Metern
        float hb = vGebaeude.x - ${WAND_TIEFER_M.toFixed(1)};
        float stock = floor(hb / ${FENSTER_STOCK_M.toFixed(2)}), achse = floor(vWand.x / ${FENSTER_ACHSE_M.toFixed(2)});
        float fy = hb - stock * ${FENSTER_STOCK_M.toFixed(2)}, fx = vWand.x - achse * ${FENSTER_ACHSE_M.toFixed(2)};
        float rx = (${FENSTER_ACHSE_M.toFixed(2)} - ${FENSTER_BREITE_M.toFixed(2)}) * 0.5;
        // das Fenster über den Bildpunkt gemittelt: ein kleines Fenster weit weg wird ein schwacher Punkt statt zu flimmern
        float wx = max(fwidth(vWand.x), 0.001), wy = max(fwidth(hb), 0.001);
        float bx = rx + ${FENSTER_BREITE_M.toFixed(2)}, by = ${(FENSTER_BRUESTUNG_M + FENSTER_HOEHE_M).toFixed(2)};
        float im = (clamp(fx + wx * 0.5, rx, bx) - clamp(fx - wx * 0.5, rx, bx)) / wx
          * (clamp(fy + wy * 0.5, ${FENSTER_BRUESTUNG_M.toFixed(2)}, by) - clamp(fy - wy * 0.5, ${FENSTER_BRUESTUNG_M.toFixed(2)}, by)) / wy;
        // nicht unter dem Boden und nicht im Dach: das Fenster ganz unter der Oberkante der Wand
        float drin = step(0.0, hb) * step(${(FENSTER_BRUESTUNG_M + FENSTER_HOEHE_M).toFixed(2)} - fy + 0.3, vGebaeude.y);
        // fester Zufall je Fenster: Stockwerk, Achse und der Fuss der Wand (unterscheidet die Gebäude)
        float fuss = floor((vWand.y - vGebaeude.x) * 2.0);
        float zufall = fract(sin(dot(vec3(stock, achse, fuss), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float brennt = step(zufall, uAnteil);
        // warm, je Fenster etwas anders
        vec3 farbe = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.86, 0.6), fract(zufall * 7.31));
        // weit weg schwächer: mit der Grösse des Bildpunkts in Metern
        float hell = 1.6 * clamp(${FERN_AB_M.toFixed(2)} / max(wx, wy), ${FERN_MIN.toFixed(2)}, 1.0);
        totalEmissiveRadiance += farbe * min(1.0, im * hell) * brennt * drin * uNacht * ${FENSTER_HELL.toFixed(3)};
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (vGebaeude.x >= 0.0) {
        float boden = 1.0 - clamp((vGebaeude.x - ${WAND_TIEFER_M.toFixed(1)}) / ${AO_BODEN_M.toFixed(1)}, 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, ${AO_BODEN.toFixed(3)}, boden * boden);
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
