// Strassen- und Bahnhofslicht bei Nacht, gemeinsam für «3D Schweiz» (Schweiz3D.tsx) und den Führerstand (Relief.tsx) (Michael, 2026-10-29:
// «Irgendwie fehlt schon noch eine Straßen- und allgemeine Bahnhofbeleuchtung. Kannst du das nicht erfinden und einbauen?»; 2026-10-30: «die
// beiden evtl zu koppeln … dann den Rest auch noch»): je Lampe aus data/strassenlicht (pipeline/build_strassenlicht.py) ein Lichtfleck auf dem
// Boden, ein Mast und ein Kopf, der nachts leuchtet. Die Lampen sind erfunden, belegt ist nur, wo Strassen und Gleise liegen.
import * as THREE from 'three'
import type { Lampen } from '../gelaende'

/** Strassen- und Bahnhofslicht: Radius des Lichtflecks auf dem Boden (m), Farben und Stärke gewählt, in keiner Quelle (die Lampen sind
 *  erfunden, belegt ist nur, wo Strassen und Gleise liegen); höchstens so viele Lampen in einem Modell (eine Annahme zur Grafik) */
/** (Michael, 2026-10-29: «Lichtkegel etwas breiter und etwas weniger hell»; vorher 11 m, 16 m und 0,55) */
export const LICHT_STRASSE_M = 14, LICHT_BAHNHOF_M = 20, LICHT_STRASSE_FARBE = '#ffc98a', LICHT_BAHNHOF_FARBE = '#eef3ff', LICHT_HELL = 0.4
/** am Bahnhof liegen die Lampen über vielen Gleisen nebeneinander und addieren sich: dort schwächer (Bern war ein weisser Fleck; Michael,
 *  2026-10-29, Thun: «Die Lichtkegel bei den Bahnhöfen 15% weniger hell», vorher 0,6) */
export const LICHT_BAHNHOF_STAERKE = 0.51
export const LICHT_HOECHSTENS = 60_000
/** je Lampe ein schlichter Mast am Ort der Lampe (Michael, 2026-10-29: «Kann man bei den Lichtkegel doch noch einen Masten am Strassenrand
 *  einfügen? Nur was ganz simples?»): ein dunkelgrauer Pfosten mit einem Kopf, der nachts leuchtet; Höhe und Dicke gewählt, in keiner
 *  Quelle; die Lage ist die erfundene Lampe auf der Achse der Strasse oder des Gleises, um den halben Abstand zum Rand versetzt
 *  (LICHT_RAND_M, gewählt, die Breite der Strasse kennt die Datei nicht) */
export const LICHT_MAST_M = { strasse: 8, bahnhof: 10 }, LICHT_MAST_DICKE_M = 0.25, LICHT_RAND_M = 3, LICHT_MAST_FARBE = '#3a3a3a'
/** ein Lichtfleck: in der Mitte hell, nach aussen weich */
export function lichtBild() {
  const c = document.createElement('canvas'), x = c.getContext('2d')!
  c.width = c.height = 64
  const v = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.15, 'rgba(255,255,255,0.8)'); v.addColorStop(0.5, 'rgba(255,255,255,0.25)')
  v.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = v; x.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export interface Strassenlampen {
  /** die Lichtflecken (nachts sichtbar), die Masten und die Köpfe */
  licht: THREE.InstancedMesh; masten: THREE.InstancedMesh; koepfe: THREE.InstancedMesh
  /** wie dunkel es ist, 0 Tag bis 1 Nacht */
  nacht: (f: number) => void
  weg: () => void
}
/** die Lampen in die Szene: hoehe gibt das Gelände in m ü. M., X, Y, Z rechnen Landeskoordinaten und Höhe in die Szene (Einheit km) */
export function lampenBauen(l: Lampen, hoehe: (e: number, n: number) => number, X: (e: number) => number, Y: (h: number) => number,
                            Z: (n: number) => number): Strassenlampen {
  const stoff = new THREE.MeshBasicMaterial({ map: lichtBild(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false })
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  // Mast: Pfosten von 1 m Höhe mit dem Fuss im Ursprung, je Lampe skaliert; Kopf ein flaches Kästchen oben, zur Strasse hin
  const mastGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  const mastStoff = new THREE.MeshLambertMaterial({ color: LICHT_MAST_FARBE })
  const kopfGeo = new THREE.BoxGeometry(1, 1, 1)
  const kopfStoff = new THREE.MeshBasicMaterial({ color: LICHT_STRASSE_FARBE, toneMapped: false })
  const kopfDunkel = new THREE.Color(LICHT_MAST_FARBE), kopfHell = new THREE.Color(LICHT_STRASSE_FARBE)
  const anzahl = Math.min(l.e.length, LICHT_HOECHSTENS)
  const n = new THREE.InstancedMesh(geo, stoff, anzahl)
  n.frustumCulled = false; n.renderOrder = 2; n.visible = false
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sk = new THREE.Vector3()
  const warm = new THREE.Color(LICHT_STRASSE_FARBE), kuehl = new THREE.Color(LICHT_BAHNHOF_FARBE).multiplyScalar(LICHT_BAHNHOF_STAERKE)
  // bei sehr vielen Lampen jede soundsovielte
  const schritt = l.e.length / anzahl
  const mn = new THREE.InstancedMesh(mastGeo, mastStoff, anzahl), kn = new THREE.InstancedMesh(kopfGeo, kopfStoff, anzahl)
  mn.castShadow = true; mn.frustumCulled = kn.frustumCulled = false
  const d = LICHT_MAST_DICKE_M / 1000, oben = new THREE.Vector3(), seite = new THREE.Vector3(), achse = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < anzahl; i++) {
    const j = Math.floor(i * schritt), bahnhof = l.art[j] === 2
    const h = hoehe(l.e[j], l.n[j]), r = (bahnhof ? LICHT_BAHNHOF_M : LICHT_STRASSE_M) / 1000
    v.set(X(l.e[j]), Y(Number.isFinite(h) ? h : 0) + 0.0005, Z(l.n[j]))
    sk.set(2 * r, 1, 2 * r)
    m.compose(v, q, sk)
    n.setMatrixAt(i, m)
    n.setColorAt(i, bahnhof ? kuehl : warm)
    // der Mast neben der Lampe, die Richtung je Lampe fest gewürfelt (die Achse der Strasse kennt die Datei nicht)
    const w = ((l.e[j] * 7919 + l.n[j] * 104729) % 360) * Math.PI / 180
    seite.set(Math.cos(w), 0, Math.sin(w)).multiplyScalar(LICHT_RAND_M / 1000)
    const hoch = (bahnhof ? LICHT_MAST_M.bahnhof : LICHT_MAST_M.strasse) / 1000
    oben.copy(v).add(seite).setY(v.y - 0.0005 - 0.001)
    m.compose(oben, q, sk.set(d, hoch + 0.001, d))
    mn.setMatrixAt(i, m)
    // der Kopf oben: ein Kästchen 0,8 × 0,25 × 0,4 m, zur Lampe hin
    oben.copy(v).addScaledVector(seite, 0.85).setY(v.y - 0.0005 + hoch)
    q.setFromAxisAngle(achse, -w)
    m.compose(oben, q, sk.set(0.0008, 0.00025, 0.0004))
    q.identity()
    kn.setMatrixAt(i, m)
  }
  return {
    licht: n, masten: mn, koepfe: kn,
    nacht: (f) => {
      n.visible = f > 0
      stoff.opacity = LICHT_HELL * f
      kopfStoff.color.copy(kopfDunkel).lerp(kopfHell, f)
    },
    weg: () => {
      for (const x of [n, mn, kn]) { x.removeFromParent(); x.dispose() }
      stoff.map?.dispose(); stoff.dispose(); geo.dispose(); mastGeo.dispose(); mastStoff.dispose(); kopfGeo.dispose(); kopfStoff.dispose()
    },
  }
}
