import * as THREE from 'three'

/** Mast der Fahrleitung, für «3D Schweiz» und den Führerstand (Michael, 2026-10-30: «Kann man auf den Bahnstrecken auch Masten für die
 *  Fahrleitungen setzen?»): ein Pfosten mit einem Ausleger über das Gleis, in Metern, der Fuss im Ursprung, der Ausleger entlang +x (zum
 *  Gleis, pipeline/build_fahrleitung.py stellt den Mast 3 m daneben). Masse, Gestalt und Farbe gewählt: keine unserer Quellen kennt sie */
export const FAHRLEITUNG_FARBE = '#6b6b66'
const MAST_HOEHE_M = 7.5, MAST_DICKE_M = 0.3, AUSLEGER_LANG_M = 3.6, AUSLEGER_HOEHE_M = 6.6, AUSLEGER_DICKE_M = 0.14
/** der Fuss reicht so weit in den Boden, damit er auf schrägem Gelände nicht schwebt */
const IN_BODEN_M = 1

export function fahrleitungsMast() {
  const pfosten = new THREE.BoxGeometry(MAST_DICKE_M, MAST_HOEHE_M + IN_BODEN_M, MAST_DICKE_M).translate(0, (MAST_HOEHE_M - IN_BODEN_M) / 2, 0)
  const ausleger = new THREE.BoxGeometry(AUSLEGER_LANG_M, AUSLEGER_DICKE_M, AUSLEGER_DICKE_M).translate(AUSLEGER_LANG_M / 2, AUSLEGER_HOEHE_M, 0)
  // die Strebe vom Pfosten schräg zum Ausleger
  const strebe = new THREE.BoxGeometry(Math.hypot(1.6, 1.2), AUSLEGER_DICKE_M * 0.8, AUSLEGER_DICKE_M * 0.8)
    .rotateZ(Math.atan2(1.2, 1.6)).translate(0.8, AUSLEGER_HOEHE_M - 0.6, 0)
  const teile = [pfosten, ausleger, strebe].map((g) => g.toNonIndexed())
  const zahl = teile.reduce((s, g) => s + g.getAttribute('position').count, 0)
  const pos = new Float32Array(zahl * 3), nor = new Float32Array(zahl * 3)
  let o = 0
  for (const g of teile) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3)
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3)
    o += g.getAttribute('position').count
    g.dispose()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return geo
}

/** Fahrdraht und Tragseil zwischen den Masten (Michael, 2026-10-31: «Bitte mach einen Fahrdraht bei den Fahrleitungen. Ich glaube, in der
 *  Realität sind es zwei. Einer oben und einer unten»): über dem Gleis, wo der Ausleger endet (der Mast steht laut build_fahrleitung.py 3 m
 *  daneben), unten der gerade Fahrdraht, oben das Tragseil, das zwischen zwei Masten durchhängt, dazwischen Hänger. Höhen, Durchhang und Zahl
 *  der Hänger gewählt; welche Masten am selben Draht hängen, steht in keiner Quelle: verbunden wird je Mast der nächste in Richtung des Gleises
 *  (quer zum Ausleger) in SPANN_MIN_M bis SPANN_MAX_M, der etwa gleich steht */
/** schwarz und halb durchsichtig (Michael, 2026-11-01: «Bitte die Fahrleitungen schwarz machen und noch etwas dünner»; vorher #2b2b2b mit 0,8:
 *  eine Linie leuchtet nicht mit, nachts stand das Dunkelgrau hell vor dem dunklen Gelände; dünner als einen Bildpunkt zeichnet WebGL keine
 *  Linie, darum wirkt sie mit weniger Deckkraft feiner), gewählt */
export const FAHRDRAHT_FARBE = '#000000'
const FAHRDRAHT_DECKKRAFT = 0.5
/** die Drähte sind Linien von einem Bildpunkt, aus der Ferne viel dicker als ein Draht von gut 1 cm (Michael, 2026-10-31: «Wenn man weiter
 *  weg ist sind sie zu dick»): bis DRAHT_VOLL_KM vom Auge ganz, bis DRAHT_WEG_KM ausgeblendet, gemessen in den Einheiten der Szene (km); gewählt */
const DRAHT_VOLL_KM = 0.12, DRAHT_WEG_KM = 0.45
/** Stoff und Linien der Drähte: blendet je Punkt nach dem Abstand zum Auge aus (in den Koordinaten der Linien, also unabhängig vom Massstab
 *  einer Gruppe darüber) */
export function drahtStoff() {
  const stoff = new THREE.LineBasicMaterial({ color: FAHRDRAHT_FARBE, transparent: true, opacity: FAHRDRAHT_DECKKRAFT, depthWrite: false })
  const kamera = { value: new THREE.Vector3() }
  stoff.onBeforeCompile = (sh) => {
    sh.uniforms.uDrahtAuge = kamera
    sh.vertexShader = 'uniform vec3 uDrahtAuge;\nvarying float vDrahtFern;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvDrahtFern = distance(position, uDrahtAuge);')
    sh.fragmentShader = 'varying float vDrahtFern;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      `diffuseColor.a *= 1.0 - smoothstep(${DRAHT_VOLL_KM.toFixed(3)}, ${DRAHT_WEG_KM.toFixed(3)}, vDrahtFern);\nif (diffuseColor.a < 0.01) discard;\n#include <opaque_fragment>`)
  }
  const linien = (geo: THREE.BufferGeometry) => {
    const l = new THREE.LineSegments(geo, stoff)
    l.frustumCulled = false
    l.onBeforeRender = (_r, _s, cam) => { kamera.value.setFromMatrixPosition(cam.matrixWorld); l.worldToLocal(kamera.value) }
    return l
  }
  return { stoff, linien }
}
const FAHRDRAHT_M = 5.5, TRAGSEIL_M = 6.9, DURCHHANG_M = 0.9, HAENGER_M = 10, SPANN_M = 50, SPANN_LUECKE_M = 70
/** ein Mast gehört zu der Gleisachse, die bis so weit neben ihm liegt (build_fahrleitung.py stellt ihn 3 m daneben) */
const MAST_AN_ACHSE_M = 4.5
/** eine Gleisachse bekommt Drähte, wo bis so weit ein Mast steht: auch die inneren Gleise eines Gleisfelds, an denen keine Masten stehen
 *  (zwischen zwei Gleisen setzt build_fahrleitung.py keine); eine Annahme, gewählt: ob ein Gleis selbst elektrifiziert ist, steht in
 *  keiner unserer Quellen, das BAV nennt es je Netzsegment */
const ACHSE_UNTER_DRAHT_M = 30

/** Fahrdraht und Tragseil über den Gleisachsen aus swissTLM3D (Michael, 2026-10-31: «Bitte mach einen Fahrdraht bei den Fahrleitungen …
 *  Einer oben und einer unten»; 2026-11-01, Thun: «Kannst du die Fahrleitungen bei Thun optimieren?»: von Mast zu Mast verbunden liefen
 *  die Drähte im Gleisfeld schräg über die Gleise, und über den inneren Gleisen fehlten sie): je Achse ausserhalb von Tunneln, wo bis
 *  ACHSE_UNTER_DRAHT_M ein Mast steht, der Fahrdraht FAHRDRAHT_M über der Achse, das Tragseil darüber mit Durchhang zwischen den Stellen
 *  der Masten an dieser Achse (ohne Mast alle SPANN_M), Hänger alle HAENGER_M; Höhen und Abstände gewählt. Liniensegmente, je Punkt Ost,
 *  Nord und Höhe in m ü. M.; drin: nur dort zeichnen (der Rand des Modells) */
export function fahrleitungsDraehte(achsen: Array<{ e: ArrayLike<number>; n: ArrayLike<number>; z: ArrayLike<number>; tunnel: boolean }>,
  mastE: ArrayLike<number>, mastN: ArrayLike<number>, drin: (e: number, n: number) => boolean = () => true): number[] {
  const Z = ACHSE_UNTER_DRAHT_M, zellen = new Map<string, number[]>()
  for (let i = 0; i < mastE.length; i++) {
    const k = `${Math.floor(mastE[i] / Z)}_${Math.floor(mastN[i] / Z)}`, l = zellen.get(k)
    if (l) l.push(i); else zellen.set(k, [i])
  }
  const naechster = (e: number, n: number) => {
    let d = Infinity
    for (let qe = Math.floor(e / Z) - 1; qe <= Math.floor(e / Z) + 1; qe++) for (let qn = Math.floor(n / Z) - 1; qn <= Math.floor(n / Z) + 1; qn++)
      for (const j of zellen.get(`${qe}_${qn}`) ?? []) d = Math.min(d, Math.hypot(mastE[j] - e, mastN[j] - n))
    return d
  }
  const raus: number[] = []
  for (const a of achsen) {
    if (a.tunnel || a.e.length < 2) continue
    // Meter entlang der Achse je Punkt
    const s: number[] = [0]
    for (let i = 1; i < a.e.length; i++) s.push(s[i - 1] + Math.hypot(a.e[i] - a.e[i - 1], a.n[i] - a.n[i - 1]))
    const bei = (m: number): [number, number, number] => {
      let i = 1
      while (i < s.length - 1 && s[i] < m) i++
      const t = s[i] > s[i - 1] ? Math.max(0, Math.min(1, (m - s[i - 1]) / (s[i] - s[i - 1]))) : 0
      return [a.e[i - 1] + (a.e[i] - a.e[i - 1]) * t, a.n[i - 1] + (a.n[i] - a.n[i - 1]) * t, a.z[i - 1] + (a.z[i] - a.z[i - 1]) * t]
    }
    // die Stücke unter Draht: Punkte, bei denen ein Mast nah genug steht
    const unter = Array.from({ length: a.e.length }, (_, i) => naechster(a.e[i], a.n[i]) <= ACHSE_UNTER_DRAHT_M)
    // die Stellen der Masten an dieser Achse, in Metern entlang
    const stellen: number[] = [], nahe = new Set<number>()
    for (let i = 0; i < a.e.length; i++) {
      const ce = Math.floor(a.e[i] / Z), cn = Math.floor(a.n[i] / Z)
      for (let qe = ce - 1; qe <= ce + 1; qe++) for (let qn = cn - 1; qn <= cn + 1; qn++) for (const j of zellen.get(`${qe}_${qn}`) ?? []) nahe.add(j)
    }
    for (const j of nahe) {
      let best = MAST_AN_ACHSE_M, an = -1
      for (let i = 1; i < a.e.length; i++) {
        const de = a.e[i] - a.e[i - 1], dn = a.n[i] - a.n[i - 1], l2 = de * de + dn * dn || 1
        const t = Math.max(0, Math.min(1, ((mastE[j] - a.e[i - 1]) * de + (mastN[j] - a.n[i - 1]) * dn) / l2))
        const d = Math.hypot(a.e[i - 1] + de * t - mastE[j], a.n[i - 1] + dn * t - mastN[j])
        if (d < best) { best = d; an = s[i - 1] + (s[i] - s[i - 1]) * t }
      }
      if (an >= 0) stellen.push(an)
    }
    stellen.sort((x, y) => x - y)
    for (let i0 = 0; i0 < a.e.length;) {
      if (!unter[i0]) { i0++; continue }
      let i1 = i0
      while (i1 + 1 < a.e.length && unter[i1 + 1]) i1++
      const m0 = s[i0], m1 = s[i1]
      i0 = i1 + 1
      if (m1 - m0 < HAENGER_M) continue
      // Stützpunkte: die Masten, dazu Lücken über SPANN_LUECKE_M gleichmässig geteilt
      const roh = [m0, ...stellen.filter((m) => m > m0 + 5 && m < m1 - 5), m1], stuetzen = [roh[0]]
      for (let k = 1; k < roh.length; k++) {
        const luecke = roh[k] - roh[k - 1], teile = luecke > SPANN_LUECKE_M ? Math.round(luecke / SPANN_M) : 1
        for (let t = 1; t <= teile; t++) stuetzen.push(roh[k - 1] + (luecke * t) / teile)
      }
      for (let k = 1; k < stuetzen.length; k++) {
        const a0 = stuetzen[k - 1], a1 = stuetzen[k], stuecke = Math.max(1, Math.round((a1 - a0) / HAENGER_M))
        let vorher: [number, number, number] | null = null, vorherSeil: number | null = null
        for (let t = 0; t <= stuecke; t++) {
          const m = a0 + ((a1 - a0) * t) / stuecke, p = bei(m), f = t / stuecke
          const seil = p[2] + TRAGSEIL_M - DURCHHANG_M * 4 * f * (1 - f)
          if (vorher && vorherSeil !== null && drin(p[0], p[1]) && drin(vorher[0], vorher[1])) {
            raus.push(vorher[0], vorher[1], vorher[2] + FAHRDRAHT_M, p[0], p[1], p[2] + FAHRDRAHT_M)
            raus.push(vorher[0], vorher[1], vorherSeil, p[0], p[1], seil)
          }
          if (t > 0 && t < stuecke && drin(p[0], p[1])) raus.push(p[0], p[1], seil, p[0], p[1], p[2] + FAHRDRAHT_M)
          vorher = p; vorherSeil = seil
        }
      }
    }
  }
  return raus
}
