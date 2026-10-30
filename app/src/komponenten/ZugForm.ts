/**
 * Die Form des Zugs der Modellbahn (Michael, 2026-10-07: «den Zug in diesem Design»; 2026-10-08: Lok, vier Wagen und ein
 * Steuerwagen), für Relief.tsx und die Züge laut Fahrplan in «3D Schweiz» (Michael, 2026-10-26: «das Design der Züge von
 * Taktland übernehmen»). Kein bestimmter Zugtyp; Masse in km, etwa fünfmal so lang wie ein echter Zug, in keiner Quelle.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Lok, vier Wagen und am Schluss ein Steuerwagen mit derselben schrägen Form, ohne Rot (Michael, 2026-10-08) */
export const ZUG_LOK_M = 140, ZUG_WAGEN_M = 140, ZUG_WAGEN = 5, ZUG_LUECKE_M = 8
/** nach dieser Breite (der der Form bis 2026-10-30) rechnen Abstände der Spuren und der Massstab in der Brille, damit sie bleiben */
export const ZUG_MASS_BREITE = 0.045
/** die Form 15 % schmaler (Michael, 2026-10-30: «Die Züge sind etwas zu breit. Bitte um 15% schmaler machen») */
export const ZUG_BREITE = ZUG_MASS_BREITE * 0.85, ZUG_HOEHE = 0.05
/** Wagen hell, Fensterband, Fahrwerk und Übergänge dunkel, der Kopf karminrot */
export const ZUG_HELL = '#dcdcdc', ZUG_DUNKEL = '#2e2e2e', ZUG_ROT = '#a8102e'

/** ein Wagen (0 die Lok, ZUG_WAGEN der Steuerwagen), entlang z, die Spitze der Lok bei +z */
export function wagenBauen(i: number, laenge: number): { g: THREE.Group; materialien: THREE.Material[] } {
  const g = new THREE.Group()
  // hell mit dunklem Fensterband, dunklen Übergängen und karminrotem, gerundetem Kopf
  // (Michael, 2026-10-07: «den Zug in diesem Design»); kein bestimmter Zugtyp
  const W = ZUG_BREITE, H = ZUG_HOEHE, L = laenge / 1000, h = H / 2
  const hell = new THREE.MeshLambertMaterial({ color: ZUG_HELL })
  const schwarz = new THREE.MeshLambertMaterial({ color: ZUG_DUNKEL })
  const materialien = [hell, schwarz]
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => { const n = new THREE.Mesh(geo, mat); g.add(n); return n }
  // Kasten: Querschnitt mit gerundetem Dach, über dem Fahrwerk
  const unten = -h + H * 0.14, r = W * 0.32
  const quer = new THREE.Shape()
  quer.moveTo(-W / 2, unten); quer.lineTo(W / 2, unten); quer.lineTo(W / 2, h - r)
  quer.quadraticCurveTo(W / 2, h, W / 2 - r, h); quer.lineTo(-W / 2 + r, h)
  quer.quadraticCurveTo(-W / 2, h, -W / 2, h - r); quer.closePath()
  // vorne bei der Lok ein Stück frei für den Kopf
  // der Steuerwagen am Schluss hat den Kopf hinten
  const hinten = i === ZUG_WAGEN
  const kopf = i === 0 || hinten ? H * 1.6 : 0
  const kasten = new THREE.ExtrudeGeometry(quer, { depth: L - kopf, bevelEnabled: false, curveSegments: 4 })
  kasten.translate(0, 0, hinten ? -L / 2 + kopf : -L / 2)
  mesh(kasten, hell)
  // Fahrwerk dunkel und etwas schmaler
  mesh(new THREE.BoxGeometry(W * 0.86, unten + h, L * 0.96), schwarz).position.y = (-h + unten) / 2
  // Fensterband auf beiden Seiten, knapp vor der Wand
  const band = new THREE.BoxGeometry(W * 1.03, H * 0.22, (L - kopf) * 0.92)
  const fenster = mesh(band, schwarz)
  fenster.position.set(0, h - r - H * 0.08, hinten ? kopf / 2 : -kopf / 2)
  // das Fensterband leuchtet nachts von innen (zugFormen: Attribut leuchte)
  fenster.userData.fenster = true
  // Übergang zum nächsten Wagen
  if (i < ZUG_WAGEN) {
    const luecke = ZUG_LUECKE_M / 1000
    mesh(new THREE.BoxGeometry(W * 0.8, H * 0.78, luecke + 0.002), schwarz).position.set(0, unten / 2 + h / 2 - H * 0.02, -L / 2 - luecke / 2)
  }
  if (i === 0 || hinten) {
    // Kopf: derselbe Querschnitt wie der Kasten, der nach vorne in einer Rundung niedriger wird, so geht er
    // ohne Stufe aus dem Kasten hervor (Michael, 2026-10-07: «Siehst du die Stufe?»); rot nur die Spitze
    const z0 = L / 2 - kopf, z1 = L / 2, c = kopf * 0.75, p0y = unten + H * 0.25
    // die Rundung von der Seite: z = z1 - c·t², oben von p0y (t = 0, vorne) bis zum Dach (t = 1)
    const zBei = (t: number) => z1 - c * t * t
    const obenBei = (z: number) => {
      if (z <= z1 - c) return h
      const t = Math.sqrt((z1 - z) / c)
      return (1 - t) * (1 - t) * p0y + (1 - (1 - t) * (1 - t)) * h
    }
    let schnitt = quer.getPoints(6)
    if (schnitt[0].equals(schnitt[schnitt.length - 1])) schnitt = schnitt.slice(0, -1)
    /** Ringe des Querschnitts an den Stellen zs, je nach oben gestaucht; offen = nur ein Stück des Rings */
    const loft = (zs: number[], punkte: THREE.Vector2[], geschlossen: boolean, weiter = 1, deckel = false) => {
      const pos: number[] = [], idx: number[] = []
      const n = punkte.length
      for (const z of zs) {
        const f = (obenBei(z) - unten) / (h - unten)
        for (const q of punkte) pos.push(q.x * weiter, unten + (q.y - unten) * f * weiter, z)
      }
      for (let j = 0; j < zs.length - 1; j++) {
        for (let k = 0; k < (geschlossen ? n : n - 1); k++) {
          const a0 = j * n + k, a1 = j * n + ((k + 1) % n), b0 = a0 + n, b1 = a1 + n
          idx.push(a0, a1, b1, a0, b1, b0)
        }
      }
      if (deckel) {
        // vorne zu: ein Fächer um die Mitte des letzten Rings
        const m = pos.length / 3, j = zs.length - 1
        pos.push(0, unten + (obenBei(zs[j]) - unten) / 2, zs[j])
        for (let k = 0; k < n; k++) idx.push(j * n + k, j * n + ((k + 1) % n), m)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setIndex(idx)
      geo.computeVertexNormals()
      return geo
    }
    const T = 0.62, stufen = 14
    const tReihe = (von: number, bis: number, k: number) => Array.from({ length: k + 1 }, (_, i) => von + (bis - von) * (i / k))
    hell.side = THREE.DoubleSide
    // beim Steuerwagen ist die Spitze hell, und alles ist um die Senkrechte gedreht, nach hinten gerichtet
    // jede Spitze mit eigener Farbe: rot ist immer die in Fahrtrichtung (Michael, 2026-10-08: «Rot muss immer
    // vorne … sein»), siehe spitzenFaerben
    const spitze = new THREE.MeshLambertMaterial({ color: hinten ? ZUG_HELL : ZUG_ROT, side: THREE.DoubleSide })
    materialien.push(spitze)
    const kopfteil = (geo: THREE.BufferGeometry, mat: THREE.Material) => { if (hinten) geo.rotateY(Math.PI); return mesh(geo, mat) }
    kopfteil(loft([z0, ...tReihe(1, T, 6).map(zBei)], schnitt, true), hell)
    kopfteil(loft(tReihe(T, 0, stufen).map(zBei), schnitt, true, 1, true), spitze).userData.spitze = hinten ? 'hinten' : 'vorn'
    // Frontscheibe: der obere Teil des Querschnitts, eng auf der Rundung
    const scheibeSchnitt = schnitt.filter((q) => q.y >= unten + 0.55 * (h - unten))
    const scheibe = new THREE.MeshLambertMaterial({ color: ZUG_DUNKEL, side: THREE.DoubleSide })
    materialien.push(scheibe)
    kopfteil(loft(tReihe(0.55, 0.12, 8).map(zBei), scheibeSchnitt, false, 1.015), scheibe)
  }
  return { g, materialien }
}

/** Lok, Wagen und Steuerwagen je als eine Geometrie mit Farben je Ecke, für InstancedMesh; die Spitze der Lok rot; leuchte 1 auf
 *  dem Fensterband, sonst 0 (für die Innenbeleuchtung bei Nacht) */
export function zugFormen(): { lok: THREE.BufferGeometry; wagen: THREE.BufferGeometry; steuer: THREE.BufferGeometry } {
  const eins = (i: number) => {
    const { g, materialien } = wagenBauen(i, i === 0 ? ZUG_LOK_M : ZUG_WAGEN_M)
    const teile: THREE.BufferGeometry[] = []
    g.updateMatrixWorld(true)
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      let geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld)
      if (geo.index) geo = geo.toNonIndexed()
      for (const n of Object.keys(geo.attributes)) if (n !== 'position' && n !== 'normal') geo.deleteAttribute(n)
      if (!geo.attributes.normal) geo.computeVertexNormals()
      const c = (o.material as THREE.MeshLambertMaterial).color
      const farbe = new Float32Array(geo.attributes.position.count * 3)
      for (let k = 0; k < farbe.length; k += 3) { farbe[k] = c.r; farbe[k + 1] = c.g; farbe[k + 2] = c.b }
      geo.setAttribute('color', new THREE.BufferAttribute(farbe, 3))
      geo.setAttribute('leuchte', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(o.userData.fenster ? 1 : 0), 1))
      teile.push(geo)
    })
    const ganz = mergeGeometries(teile)!
    teile.forEach((t) => t.dispose())
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
    materialien.forEach((m) => m.dispose())
    return ganz
  }
  return { lok: eins(0), wagen: eins(1), steuer: eins(ZUG_WAGEN) }
}
