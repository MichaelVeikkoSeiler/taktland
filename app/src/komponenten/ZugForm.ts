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
/** die Form 15 % schmaler (Michael, 2026-10-30: «Die Züge sind etwas zu breit. Bitte um 15% schmaler machen»), dann noch 10 % («Züge noch 10%
 *  schmaler») */
export const ZUG_BREITE = ZUG_MASS_BREITE * 0.85 * 0.9 * 0.85, ZUG_HOEHE = 0.05
/** und nochmals 15 % (Michael, 2026-11-10: «Bitte die Züge grundsätzlich 15% schmaler machen») */
/** Stromabnehmer auf Lok und Steuerwagen (Michael, 2026-11-10: «Der Triebwagen und der letzte Wagen sollen einen Pantograf auf dem Dach haben»):
 *  ein Einholmstromabnehmer, seit 2026-11-10 schmaler (vorher 0,8 der Breite; Michael: «die Stromabnehmer weniger breit»), Masse in Teilen der Höhe und Breite, Lage hinter dem Kopf; Gestalt und Masse gewählt, in keiner Quelle */
const PANTO_HOCH = 0.42, PANTO_BREIT = 0.5, PANTO_ZURUECK = 2.6
/** Dicke der Arme in Teilen der Höhe (seit 2026-11-10 dünner, vorher 0,035, dann 0,02; Michael: «wieder etwas fetter, aber nicht so wie vorher») */
const PANTO_DICK = 0.027
/** wie weit das Fahrwerk am Kopf zurückweicht, in Teilen seiner Höhe; gewählt */
const FAHRWERK_SCHRAEG = 1.6
/** Frontscheibe: halbe Breite in Teilen der Zugbreite, oben und unten auf der Rundung des Kopfs (0 vorne unten, 0,62 am Dach); gewählt */
const SCHEIBE_BREIT = 0.4, SCHEIBE_OBEN_T = 0.5, SCHEIBE_UNTEN_T = 0.1
/** Kasten des oberen Lichts auf dem Dach, Lage in Teilen der Höhe vom vorderen Ende, Breite in Teilen der Zugbreite; gewählt */
/** Puffer: Abstand von der Mitte in Teilen der Breite, Höhe der Mitte, Radius der Stange und des Tellers und Länge in Teilen der Höhe; gewählt */
/** wie weit das Fensterband in den Kopf reicht, in Teilen seiner Länge (bis das Dach sinkt); gewählt */
const FENSTER_IM_KOPF = 0.55
/** Türen: an oder aus (für die Vorschau), Breite in Teilen der Höhe, Abstand der Mitte vom Wagenende in Teilen der Länge, Farbe des Felds; gewählt */
export const zugTueren = { an: true }
const TUER_BREIT = 0.34, TUER_VOM_ENDE = 0.13, TUER_FARBE = '#9a9a9a', TUER_LINIE = 0.014
/** Höhe des Fensterbands und wie weit seine Mitte unter dem Beginn der Dachrundung liegt, in Teilen der Höhe (Michael, 2026-11-10: «Seitenstreifen etwas
 *  höher und etwas weiter unten», dann «noch etwas weiter unten und noch etwas höher»; vorher 0,22 und 0,08, dann 0,28 und 0,14); seit 2026-11-11 0,27 statt 0,34 hoch, die Mitte
 *  bleibt (Michael: «Seitenfenster etwas weniger hoch bitte») */
const FENSTER_HOCH = 0.27, FENSTER_TIEFER = 0.21
/** die Türen behalten ihre Höhe vom Fensterband bis 2026-11-11 */
const TUER_BAND = 0.34
// feiner seit 2026-11-10 (Michael: «Ja, setz alle vier um», darunter: Puffer zu gross; vorher 0,045, 0,085, 0,2)
const PUFFER_SEITE = 0.3, PUFFER_HOEHE = -0.3, PUFFER_R = 0.032, PUFFER_TELLER = 0.058, PUFFER_LANG = 0.12
export const LICHTKASTEN_HINTEN = 1.05, LICHTKASTEN_VORN = 0.42, LICHTKASTEN_UNTEN = 0.4, LICHTKASTEN_OBEN = 0.56, LICHTKASTEN_BREIT = 0.32
/** Wagen hell, Fensterband, Fahrwerk und Übergänge dunkel, der Kopf karminrot */
export const ZUG_HELL = '#dcdcdc', ZUG_DUNKEL = '#2e2e2e', ZUG_ROT = '#a8102e'

/** die Türen eines Wagens in seinen Massen (wie wagenBauen): Mitten entlang z, Breite, Unter- und Oberkante, Abstand der Seite von der Mitte;
 *  für die Schiebetüren am Halt in «3D Schweiz» */
export function tuerStellen(i: number, laenge: number): { stellen: number[]; b: number; unterkante: number; oberkante: number; seite: number } {
  const W = ZUG_BREITE, H = ZUG_HOEHE, L = laenge / 1000, h = H / 2
  const unten = -h + H * 0.14, r = W * 0.32
  const hinten = i === ZUG_WAGEN
  const kopf = i === 0 || hinten ? H * 1.6 : 0
  const unterkante = unten + H * 0.002, oberkante = h - r - H * FENSTER_TIEFER + H * TUER_BAND / 2 + H * 0.09
  const b = H * TUER_BREIT
  // an Lok und Steuerwagen hinter dem Kopf, eine Türbreite hinter dem Ende des Fensterbands im Kopf (Michael, 2026-11-10: «Etwas eine Türbreite weiter
  // hinten. Obere Kante noch etwas weiter oben»)
  const amKopf = L / 2 - kopf * (1 - FENSTER_IM_KOPF) - b * 1.6
  const stellen = i === 0 ? [amKopf] : hinten ? [-amKopf] : [L / 2 - L * TUER_VOM_ENDE, -(L / 2 - L * TUER_VOM_ENDE)]
  return { stellen, b, unterkante, oberkante, seite: W * 0.522 }
}

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
  // so fein wie der Querschnitt des Kopfs (getPoints(6)), sonst stand das Dach am Übergang vor (Michael, 2026-11-10: «hier ist eine unschöne Kante»)
  const kasten = new THREE.ExtrudeGeometry(quer, { depth: L - kopf, bevelEnabled: false, curveSegments: 6 })
  kasten.translate(0, 0, hinten ? -L / 2 + kopf : -L / 2)
  mesh(kasten, hell)
  // Fahrwerk dunkel und etwas schmaler
  // an Lok und Steuerwagen am Kopf von oben nach unten zurück abgeschrägt (Michael, 2026-11-10: «dort wo die Räder sind also der dunkelgraue kasten etwas
  // von vorne gegen hinten abschrägen»; Schräge gewählt)
  if (i === 0 || i === ZUG_WAGEN) {
    const vz = i === 0 ? 1 : -1, ende = L * 0.48, schraeg = (unten + h) * FAHRWERK_SCHRAEG
    const seite = new THREE.Shape()
    // gerundet statt einer schrägen Kante (Michael, 2026-11-10: «nicht wie jetzt eine Kante sondern abgerundet»)
    seite.moveTo(-ende, -h); seite.lineTo(ende - schraeg, -h); seite.quadraticCurveTo(ende, -h, ende, unten); seite.lineTo(-ende, unten); seite.closePath()
    const fw = new THREE.ExtrudeGeometry(seite, { depth: W * 0.86, bevelEnabled: false, curveSegments: 8 })
    // der Riss liegt in x (längs) und y, ausgezogen in z: so drehen, dass längs z ist und quer x
    fw.rotateY(-Math.PI / 2); fw.translate(W * 0.43, 0, 0)
    if (vz < 0) fw.rotateY(Math.PI)
    mesh(fw, schwarz)
  } else mesh(new THREE.BoxGeometry(W * 0.86, unten + h, L * 0.96), schwarz).position.y = (-h + unten) / 2
  // Fensterband auf beiden Seiten, knapp vor der Wand
  const band = new THREE.BoxGeometry(W * 1.03, H * FENSTER_HOCH, (L - kopf) * 0.92)
  const fenster = mesh(band, schwarz)
  fenster.position.set(0, h - r - H * FENSTER_TIEFER, hinten ? kopf / 2 : -kopf / 2)
  // das Fensterband leuchtet nachts von innen (zugFormen: Attribut leuchte)
  fenster.userData.fenster = true
  // Türen, nur gemalt (Michael, 2026-11-10: «Braucht es bei den Wagen noch Türen, also nicht richtige, aber damit es den Anschein macht?»): je Seite zwei nahe
  // den Enden, an Lok und Steuerwagen eine hinter dem Kopf; Zahl, Lage und Masse gewählt
  if (zugTueren.an) {
    const { stellen, b, unterkante, oberkante } = tuerStellen(i, laenge)
    const d = H * TUER_LINIE, rr = b * 0.22
    const umriss = new THREE.Shape()
    umriss.moveTo(-b / 2, unterkante); umriss.lineTo(-b / 2, oberkante - rr); umriss.quadraticCurveTo(-b / 2, oberkante, -b / 2 + rr, oberkante)
    umriss.lineTo(b / 2 - rr, oberkante); umriss.quadraticCurveTo(b / 2, oberkante, b / 2, oberkante - rr); umriss.lineTo(b / 2, unterkante)
    umriss.lineTo(b / 2 - d, unterkante); umriss.lineTo(b / 2 - d, oberkante - rr); umriss.quadraticCurveTo(b / 2 - d, oberkante - d, b / 2 - rr, oberkante - d)
    umriss.lineTo(-b / 2 + rr, oberkante - d); umriss.quadraticCurveTo(-b / 2 + d, oberkante - d, -b / 2 + d, oberkante - rr); umriss.lineTo(-b / 2 + d, unterkante)
    umriss.closePath()
    const tuerLinie = new THREE.MeshLambertMaterial({ color: TUER_FARBE, side: THREE.DoubleSide })
    materialien.push(tuerLinie)
    for (const z of stellen) {
      for (const sx of [-1, 1]) {
        const g2 = new THREE.ShapeGeometry(umriss, 6)
        g2.rotateY(sx * Math.PI / 2)
        g2.translate(sx * W * 0.522, 0, z)
        mesh(g2, tuerLinie)
      }
    }
  }
  // Übergang zum nächsten Wagen
  if (i < ZUG_WAGEN) {
    const luecke = ZUG_LUECKE_M / 1000
    mesh(new THREE.BoxGeometry(W * 0.8, H * 0.78, luecke + 0.002), schwarz).position.set(0, unten / 2 + h / 2 - H * 0.02, -L / 2 - luecke / 2)
  }
  if (i === 0 || hinten) {
    // Stromabnehmer: Sockel, unterer Arm schräg nach hinten, oberer Arm schräg nach vorne, oben die Schleifleiste quer
    const vorn = hinten ? -1 : 1, z0p = vorn * (L / 2 - PANTO_ZURUECK * H)
    const dick = H * PANTO_DICK, hoch = PANTO_HOCH * H, arm = hoch / 2
    mesh(new THREE.BoxGeometry(W * 0.32, H * 0.04, H * 0.5), schwarz).position.set(0, h + H * 0.02, z0p)
    // unterer Arm vom Sockel nach hinten oben, oberer von dort nach vorne oben bis über den Sockel
    const knieZ = z0p - vorn * H * 0.45, knieY = h + arm
    const stab = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const lang = Math.hypot(bx - ax, by - ay, bz - az)
      const st = mesh(new THREE.BoxGeometry(dick, dick, lang), schwarz)
      st.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
      st.lookAt(st.position.clone().add(new THREE.Vector3(bx - ax, by - ay, bz - az)))
    }
    stab(0, h + H * 0.04, z0p, 0, knieY, knieZ)
    stab(0, knieY, knieZ, 0, h + hoch, z0p + vorn * H * 0.05)
    mesh(new THREE.BoxGeometry(W * PANTO_BREIT, dick * 1.4, dick * 2), schwarz).position.set(0, h + hoch, z0p + vorn * H * 0.05)
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
    // offen unten: ohne den Boden im Ring bekommen die Seiten unten keine Normalen nach unten, sonst wurde die Seite des Kopfs nach unten dunkel und
    // stiess mit einer Kante an den Kasten (Michael, 2026-11-10: «hier ist eine unschöne Kante»); der Boden liegt ohnehin über dem Fahrwerk
    const offen = [...schnitt.slice(1), schnitt[0]]
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
    kopfteil(loft([z0, ...tReihe(1, T, 6).map(zBei)], offen, false), hell)
    kopfteil(loft(tReihe(T, 0, stufen).map(zBei), offen, false, 1, true), spitze).userData.spitze = hinten ? 'hinten' : 'vorn'
    // Frontscheibe: der obere Teil des Querschnitts, eng auf der Rundung; seit 2026-11-10 schmaler und nicht bis zum Dach, so bleibt ringsum ein roter
    // Rahmen wie beim Referenzbild (Michael: «kannst du das Fenster der Triebzüge noch etwas abändern? So im Stil dieses Referenzbildes?»; Masse gewählt)
    const scheibeSchnitt = schnitt.filter((q) => q.y >= unten + 0.5 * (h - unten) && Math.abs(q.x) <= W * SCHEIBE_BREIT)
    const scheibe = new THREE.MeshLambertMaterial({ color: ZUG_DUNKEL, side: THREE.DoubleSide })
    materialien.push(scheibe)
    kopfteil(loft(tReihe(SCHEIBE_OBEN_T, SCHEIBE_UNTEN_T, 8).map(zBei), scheibeSchnitt, false, 1.015), scheibe)
    // auf dem Dach vor dem Stromabnehmer ein kleiner, vorne abgerundeter weisser Kasten für das obere Licht (Michael, 2026-11-10: «Das obere Licht darfst du gerne
    // in einen kleinen aerodynamisch anmutenden kleinen weissen Kasten auf dem Dach einfügen»; Gestalt gewählt): Seitenriss in z und y, quer ausgezogen
    const kz0 = L / 2 - LICHTKASTEN_HINTEN * H, kz1 = L / 2 - LICHTKASTEN_VORN * H, ky0 = LICHTKASTEN_UNTEN * H, ky1 = LICHTKASTEN_OBEN * H
    const riss = new THREE.Shape()
    // hinten flach auslaufend statt mit gerader Kante (seit 2026-11-10)
    riss.moveTo(kz0, ky0); riss.quadraticCurveTo(kz0 + (ky1 - ky0) * 1.2, ky1, kz0 + (ky1 - ky0) * 2.6, ky1); riss.lineTo(kz1 - (ky1 - ky0) * 0.8, ky1)
    riss.quadraticCurveTo(kz1, ky1, kz1, ky0 + (ky1 - ky0) * 0.25); riss.lineTo(kz1 - (ky1 - ky0) * 0.3, ky0); riss.closePath()
    const kb = W * LICHTKASTEN_BREIT
    const kasten2 = new THREE.ExtrudeGeometry(riss, { depth: kb, bevelEnabled: false, curveSegments: 6 })
    kasten2.rotateY(-Math.PI / 2); kasten2.translate(kb / 2, 0, 0)
    kopfteil(kasten2, hell)
    // das Fensterband weiter nach vorne in den Kopf, bis dort, wo sein Dach sinkt (Michael, 2026-11-10: «die Seitenfenster können weiter nach vorne kommen»)
    // es schliesst ans Band des Kastens an, das 4 % vor dessen Ende aufhört
    const bandVon = L / 2 - kopf - (L - kopf) * 0.04, bandLang = L / 2 - kopf * (1 - FENSTER_IM_KOPF) - bandVon
    const bandKopf = kopfteil(new THREE.BoxGeometry(W * 1.03, H * FENSTER_HOCH, bandLang).translate(0, h - r - H * FENSTER_TIEFER, bandVon + bandLang / 2), schwarz)
    bandKopf.userData.fenster = true
    // vorne zwei Puffer (Michael, 2026-11-10: «Und vorne noch die Puffer?»): Stange und Teller, dunkel; Lage und Masse gewählt
    for (const seite of [-1, 1]) {
      const x = seite * W * PUFFER_SEITE, y = PUFFER_HOEHE * H
      const stange = new THREE.CylinderGeometry(PUFFER_R * H, PUFFER_R * H, PUFFER_LANG * H, 10).rotateX(Math.PI / 2)
      stange.translate(x, y, L / 2 + PUFFER_LANG * H / 2 - PUFFER_R * H)
      kopfteil(stange, schwarz)
      const teller = new THREE.CylinderGeometry(PUFFER_TELLER * H, PUFFER_TELLER * H, PUFFER_R * H * 0.5, 14).rotateX(Math.PI / 2)
      teller.translate(x, y, L / 2 + PUFFER_LANG * H - PUFFER_R * H)
      kopfteil(teller, schwarz)
    }
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
