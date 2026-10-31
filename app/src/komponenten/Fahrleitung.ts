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
export const FAHRDRAHT_FARBE = '#2b2b2b'
const UEBER_GLEIS_M = 3, FAHRDRAHT_M = 5.5, TRAGSEIL_M = 6.9, DURCHHANG_M = 0.9, HAENGER = 4, SPANN_MIN_M = 25, SPANN_MAX_M = 75
/** die Drähte als Liniensegmente, je Punkt Ost, Nord und Höhe in m ü. M.: e, n, winkel wie die Masten (winkel: Richtung des Auslegers,
 *  gegen den Uhrzeigersinn ab Osten), fuss die Höhe des Mastfusses oder null, wenn der Mast nicht steht */
export function fahrleitungsDraehte(e: ArrayLike<number>, n: ArrayLike<number>, winkel: ArrayLike<number>, fuss: (i: number) => number | null): number[] {
  const Z = SPANN_MAX_M, zellen = new Map<string, number[]>(), ae: number[] = [], an: number[] = [], ah: Array<number | null> = []
  for (let i = 0; i < e.length; i++) {
    const h = fuss(i)
    ae.push(e[i] + Math.cos(winkel[i]) * UEBER_GLEIS_M); an.push(n[i] + Math.sin(winkel[i]) * UEBER_GLEIS_M); ah.push(h)
    if (h === null) continue
    const k = `${Math.floor(ae[i] / Z)}_${Math.floor(an[i] / Z)}`, l = zellen.get(k)
    if (l) l.push(i); else zellen.set(k, [i])
  }
  const raus: number[] = [], gesehen = new Set<string>()
  for (let i = 0; i < e.length; i++) {
    const hi = ah[i]
    if (hi === null) continue
    // entlang des Gleises: quer zum Ausleger
    const te = -Math.sin(winkel[i]), tn = Math.cos(winkel[i])
    for (const richtung of [1, -1]) {
      let best = -1, bestL = Infinity
      for (let qe = Math.floor(ae[i] / Z) - 1; qe <= Math.floor(ae[i] / Z) + 1; qe++) for (let qn = Math.floor(an[i] / Z) - 1; qn <= Math.floor(an[i] / Z) + 1; qn++) {
        for (const j of zellen.get(`${qe}_${qn}`) ?? []) {
          if (j === i) continue
          const de = ae[j] - ae[i], dn = an[j] - an[i], lang = (de * te + dn * tn) * richtung, quer = Math.abs(de * tn - dn * te)
          // in Kurven liegt der nächste Mast etwas seitlich; der Ausleger zeigt etwa gleich (nicht vom anderen Gleis her)
          if (lang < SPANN_MIN_M || lang > SPANN_MAX_M || quer > 1.5 + 0.12 * lang || Math.cos(winkel[j] - winkel[i]) < 0.9) continue
          if (lang < bestL) { bestL = lang; best = j }
        }
      }
      if (best < 0) continue
      const schl = i < best ? `${i}_${best}` : `${best}_${i}`
      if (gesehen.has(schl)) continue
      gesehen.add(schl)
      const j = best, hj = ah[j]!
      raus.push(ae[i], an[i], hi + FAHRDRAHT_M, ae[j], an[j], hj + FAHRDRAHT_M)
      // das Tragseil in Stücken, mit Durchhang; die Hänger senkrecht zum Fahrdraht
      const stuecke = HAENGER + 1
      const seil = (t: number) => [ae[i] + (ae[j] - ae[i]) * t, an[i] + (an[j] - an[i]) * t, hi + (hj - hi) * t + TRAGSEIL_M - DURCHHANG_M * 4 * t * (1 - t)]
      for (let s = 0; s < stuecke; s++) raus.push(...seil(s / stuecke), ...seil((s + 1) / stuecke))
      for (let s = 1; s < stuecke; s++) {
        const t = s / stuecke, [pe, pn, pz] = seil(t)
        raus.push(pe, pn, pz, pe, pn, hi + (hj - hi) * t + FAHRDRAHT_M)
      }
    }
  }
  return raus
}
