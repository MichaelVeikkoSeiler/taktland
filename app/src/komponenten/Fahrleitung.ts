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
