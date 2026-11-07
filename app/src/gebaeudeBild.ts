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
 *  Je Wand ein Raster aus Stockwerken und Achsen je Gebäude (FENSTER_ARTEN), in jeder Zelle ein Fenster; welches
 *  brennt, entscheidet ein fester Zufall je Fenster gegen den Anteil zur Uhrzeit (LICHT_ANTEIL), so brennen mit steigendem Anteil
 *  dieselben weiter und neue dazu. Weit weg wird jedes Fenster über seinen Bildpunkt gemittelt und schwächer */
/** wie hell ein brennendes Fenster leuchtet (gewählt; Michael, 2026-10-25: «10% weniger hell», vorher 1,6, dann 1,44; danach
 *  «weitere 10%», 1,3; dann «noch immer etwas zu hell», 1,0; 2026-10-27: «noch leicht abdunkeln. Circa 10%») */
const FENSTER_HELL = 0.9
/** weit weg schwächer (Michael, 2026-10-25: «wenn man in die Ferne schaut, sollen sie dort wesentlich weniger hell scheinen»): ab
 *  FERN_AB_M je Bildpunkt sinkt die Helligkeit mit dem Abstand bis auf FERN_MIN (gewählt; vorher wurden sie weit weg heller) */
const FERN_AB_M = 0.5, FERN_MIN = 0.12
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

/** die Fenster je Gebäude verschieden (Michael, 2026-11-07: «Die Fenster auf den Gebäuden wirken sehr generisch … alle Fassaden sehen so ganz
 *  genau gleich aus. Kannst du hier eine gewisse Diversität einbauen?»): je Gebäude eine Art aus FENSTER_ARTEN, darin Stockwerk, Achse, Breite,
 *  Höhe und Brüstung je Gebäude etwas anders, das Raster entlang der Wand verschoben, im Erdgeschoss bei manchen grosse Schaufenster, das Glas
 *  etwas anders getönt. Alles gewählt, swissBUILDINGS3D kennt keine Fenster. Der feste Zufall je Gebäude kommt aus seiner Wandfarbe (gebaeudeFarben:
 *  je Gebäude ein Ton und eine eigene Helligkeit), so bleibt ein Gebäude immer gleich, ohne eigenes Attribut.
 *  Arten [Anteil, Stockwerk von–bis, Achse von–bis, Breite als Anteil der Achse von–bis, Höhe von–bis, Brüstung] in m:
 *  Lochfassade, Wohnblock mit breiten Fenstern, Bandfenster, Altbau mit hohen Fenstern */
const FENSTER_ARTEN: Array<[number, number, number, number, number, number, number, number, number, number]> = [
  [0.4, 2.9, 3.3, 2.6, 3.4, 0.36, 0.45, 1.35, 1.65, 0.9],
  [0.25, 2.8, 3.0, 2.3, 3.0, 0.55, 0.7, 1.25, 1.5, 0.95],
  [0.2, 3.4, 3.9, 1.5, 1.9, 0.88, 0.92, 1.6, 2.1, 0.9],
  [0.15, 3.3, 3.8, 2.8, 3.6, 0.32, 0.4, 1.9, 2.3, 0.75],
]
/** so viele Gebäude haben im Erdgeschoss grosse Schaufenster (gewählt) */
const FENSTER_LADEN = 0.3
/** Glas am Tag: Tönungen (dunkel, bläulich, grau, grünlich, bräunlich) und wie stark sie die Wand abdunkeln, von–bis (gewählt) */
const FENSTER_TOENE = [[0.13, 0.16, 0.2], [0.17, 0.17, 0.18], [0.12, 0.16, 0.15], [0.18, 0.15, 0.13]]
const FENSTER_TAG_VON = 0.6, FENSTER_TAG_BIS = 0.85
const g = (x: number) => x.toFixed(3)
const FENSTER_GLSL = `
struct FensterStil { float stock; float achse; float breite; float hoehe; float bruestung; float versatz; float laden; vec3 glas; float tag; };
float fensterZufall(float s, float i) { return fract(sin(s * 91.7 + i * 17.13) * 43758.5453); }
FensterStil fensterStil(vec3 c) {
  vec3 q = floor(c * 1023.0 + 0.5);
  float s = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float art = fensterZufall(s, 0.0);
  FensterStil f;
  ${(() => {
    let summe = 0
    return FENSTER_ARTEN.map(([anteil, s0, s1, a0, a1, b0, b1, h0, h1, br], k) => {
      summe += anteil
      const bed = k === FENSTER_ARTEN.length - 1 ? '' : `if (art < ${g(summe)}) `
      return `${k ? 'else ' : ''}${bed}{ f.stock = mix(${g(s0)}, ${g(s1)}, fensterZufall(s, 1.0)); f.achse = mix(${g(a0)}, ${g(a1)}, fensterZufall(s, 2.0));
    f.breite = f.achse * mix(${g(b0)}, ${g(b1)}, fensterZufall(s, 3.0)); f.hoehe = mix(${g(h0)}, ${g(h1)}, fensterZufall(s, 4.0)); f.bruestung = ${g(br)}; }`
    }).join('\n  ')
  })()}
  f.hoehe = min(f.hoehe, f.stock - f.bruestung - 0.3);
  f.versatz = fensterZufall(s, 5.0) * f.achse;
  f.laden = step(fensterZufall(s, 6.0), ${g(FENSTER_LADEN)});
  float t = fensterZufall(s, 7.0) * ${FENSTER_TOENE.length}.0;
  ${FENSTER_TOENE.map((c, k) => `${k ? 'else ' : ''}${k === FENSTER_TOENE.length - 1 ? '' : `if (t < ${k + 1}.0) `}f.glas = vec3(${c.map(g).join(', ')});`).join('\n  ')}
  f.tag = mix(${g(FENSTER_TAG_VON)}, ${g(FENSTER_TAG_BIS)}, fensterZufall(s, 8.0));
  return f;
}
// x: wie viel des Bildpunkts Fenster ist, y: ob das Fenster in der Wand liegt, z, w: Stockwerk und Achse; weit weg über den Bildpunkt gemittelt
vec4 fensterBei(FensterStil f, float x, float hb, float wx, float wy, float oben) {
  float stock = floor(hb / f.stock), xs = x + f.versatz, achse = floor(xs / f.achse);
  float fy = hb - stock * f.stock, fx = xs - achse * f.achse;
  float ho = f.hoehe, bru = f.bruestung, br = f.breite;
  // grosse Schaufenster im Erdgeschoss
  if (stock < 0.5 && f.laden > 0.5) { bru = 0.35; ho = f.stock - 0.95; br = f.achse * 0.85; }
  float rx = (f.achse - br) * 0.5, bx = rx + br, by = bru + ho;
  float im = (clamp(fx + wx * 0.5, rx, bx) - clamp(fx - wx * 0.5, rx, bx)) / wx
    * (clamp(fy + wy * 0.5, bru, by) - clamp(fy - wy * 0.5, bru, by)) / wy;
  im = mix(im, (f.breite * f.hoehe) / (f.achse * f.stock), smoothstep(0.3, 0.8, max(wx / f.achse, wy / f.stock)));
  // nicht unter dem Boden und nicht im Dach: das Fenster ganz unter der Oberkante der Wand
  float drin = step(0.0, hb) * step(by - fy + 0.3, oben);
  return vec4(im, drin, stock, achse);
}
`

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
      .replace('#include <common>', '#include <common>\nvarying vec2 vGebaeude;\nvarying vec2 vWand;\nuniform float uNacht;\nuniform float uAnteil;\n' + FENSTER_GLSL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (uNacht > 0.0 && vGebaeude.x >= 0.0) {
        // Höhe über dem Boden (die Wand reicht in den Daten unter ihn) und Lage entlang der Wand, in Metern
        FensterStil fs = fensterStil(vColor.rgb);
        float hb = vGebaeude.x - ${WAND_TIEFER_M.toFixed(1)};
        float wx = max(fwidth(vWand.x), 0.001), wy = max(fwidth(hb), 0.001);
        vec4 f = fensterBei(fs, vWand.x, hb, wx, wy, vGebaeude.y);
        // fester Zufall je Fenster: Stockwerk, Achse und der Fuss der Wand (unterscheidet die Gebäude)
        float fuss = floor((vWand.y - vGebaeude.x) * 2.0);
        float zufall = fract(sin(dot(vec3(f.z, f.w, fuss), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float brennt = step(zufall, uAnteil);
        // deckt ein Bildpunkt mehr als ein halbes Fenster samt Wand, gilt statt des einzelnen Fensters der Anteil: sonst springt die
        // Mitte des Bildpunkts beim Bewegen von einem brennenden zu einem dunklen Fenster, und die Lichter flackern
        float gemittelt = smoothstep(0.3, 0.8, max(wx / fs.achse, wy / fs.stock));
        brennt = mix(brennt, uAnteil, gemittelt);
        // warm, je Fenster etwas anders
        vec3 farbe = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.86, 0.6), fract(zufall * 7.31));
        // weit weg schwächer: mit der Grösse des Bildpunkts in Metern
        float hell = 1.6 * clamp(${FERN_AB_M.toFixed(2)} / max(wx, wy), ${FERN_MIN.toFixed(2)}, 1.0);
        totalEmissiveRadiance += farbe * min(1.0, f.x * hell) * brennt * f.y * uNacht * ${FENSTER_HELL.toFixed(3)};
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (vGebaeude.x >= 0.0) {
        float boden = 1.0 - clamp((vGebaeude.x - ${WAND_TIEFER_M.toFixed(1)}) / ${AO_BODEN_M.toFixed(1)}, 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, ${AO_BODEN.toFixed(3)}, boden * boden);
        diffuseColor.rgb *= mix(${AO_DACH.toFixed(3)}, 1.0, smoothstep(0.0, ${AO_DACH_M.toFixed(2)}, vGebaeude.y));
        // die Fenster auch am Tag als dunkle Scheiben, im selben Raster wie das Licht nachts (Michael, 2026-11-07: «Bitte die fiktiven Fenster der
        // Gebäude leicht stärker hervorheben»); je Gebäude eine eigene Art (Michael, 2026-11-07: «alle Fassaden sehen so ganz genau gleich aus»)
        FensterStil fsT = fensterStil(vColor.rgb);
        float hbT = vGebaeude.x - ${WAND_TIEFER_M.toFixed(1)};
        vec4 fT = fensterBei(fsT, vWand.x, hbT, max(fwidth(vWand.x), 0.001), max(fwidth(hbT), 0.001), vGebaeude.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, fsT.glas, fT.x * fT.y * fsT.tag);
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

/** die Wandfarbe der Daten (pipeline/build_gebaeude.py, WAND): ein Grau, das in keiner Quelle steht; Dächer haben die Farbe des Luftbilds */
const WAND_DATEN = [196, 192, 184]
/** helle Putztöne, je Gebäude einer (Michael, 2026-11-06: «Bitte mal 1 und 3 machen», 3: Wandfarben leicht variieren); gewählt,
 *  die echte Fassadenfarbe steht in keiner Quelle; seit 2026-11-07 etwas dunkler, nahe beim früheren Grau: zu hell gingen die Wände neben den
 *  Dächern mit dem Luftbild unter (Michael, Genf Flughafen: «haben Gebäude keine Wände») */
const PUTZ: Array<[number, number, number]> = [
  [198, 194, 184], [206, 198, 180], [190, 182, 166], [182, 182, 178], [200, 186, 166], [196, 186, 180], [184, 188, 182], [210, 206, 198],
]
/** je Gebäude die Helligkeit dazu etwas anders, ± so viel (gewählt) */
const PUTZ_STREUUNG = 0.04
const putzVorrat = new WeakMap<object, Uint8Array>()

/** ist die Ecke eine Wand (Farbe der Daten für Wände)? */
export const istWandFarbe = (farben: Uint8Array, i: number) =>
  farben[i * 3] === WAND_DATEN[0] && farben[i * 3 + 1] === WAND_DATEN[1] && farben[i * 3 + 2] === WAND_DATEN[2]

/** die Farben einer Kachel mit einem Putzton je Gebäude statt des einen Graus. Ein Gebäude ist, was über gemeinsame Ecken
 *  zusammenhängt (die Datei kennt keine Gebäude); der Ton hängt nur von seiner Lage ab, ist also in jeder Stufe und auf jedem
 *  Gerät derselbe. Zusammengebaute Häuser mit gemeinsamen Ecken bekommen denselben Ton */
export function gebaeudeFarben(k: { e0: number; n0: number; ecken: Int16Array; farben: Uint8Array }) {
  const da = putzVorrat.get(k)
  if (da) return da
  const n = k.ecken.length / 3, eltern = new Int32Array(n).map((_, i) => i)
  const wurzel = (i: number): number => { while (eltern[i] !== i) { eltern[i] = eltern[eltern[i]]; i = eltern[i] } return i }
  const erste = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const s = `${k.ecken[i * 3]},${k.ecken[i * 3 + 1]},${k.ecken[i * 3 + 2]}`
    const j = erste.get(s)
    if (j === undefined) erste.set(s, i); else eltern[wurzel(i)] = wurzel(j)
    // die drei Ecken eines Dreiecks gehören zusammen
    if (i % 3) eltern[wurzel(i)] = wurzel(i - (i % 3))
  }
  // je Gebäude die Ecke am weitesten südwestlich, in Dezimetern der Landeskoordinaten
  const anker = new Map<number, [number, number]>()
  for (let i = 0; i < n; i++) {
    const r = wurzel(i), e = k.e0 * 10 + k.ecken[i * 3], nn = k.n0 * 10 + k.ecken[i * 3 + 2], a = anker.get(r)
    if (!a || e + nn < a[0] + a[1]) anker.set(r, [e, nn])
  }
  const aus = new Uint8Array(k.farben)
  for (let i = 0; i < n; i++) {
    if (!istWandFarbe(k.farben, i)) continue
    const [e, nn] = anker.get(wurzel(i))!
    const z = Math.abs(Math.sin(e * 12.9898 + nn * 78.233) * 43758.5453) % 1, z2 = Math.abs(Math.sin(e * 39.346 + nn * 11.135) * 24634.6345) % 1
    const ton = PUTZ[Math.floor(z * PUTZ.length) % PUTZ.length], f = 1 + PUTZ_STREUUNG * (z2 * 2 - 1)
    for (let c = 0; c < 3; c++) aus[i * 3 + c] = Math.max(0, Math.min(255, Math.round(ton[c] * f)))
  }
  putzVorrat.set(k, aus)
  return aus
}
