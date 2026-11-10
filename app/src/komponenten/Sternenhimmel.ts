/**
 * Der Sternenhimmel als Punkte um das Auge (Michael, 2026-10-24: «Himmel nachts dunkler und mit Sternen machen», 2026-10-25: «auch
 * in der Modellbahn»), für «3D Schweiz» und die Modellbahn: die Sterne aus src/sterne.ts zu einer Zeit über einem Ort, gedreht wie
 * das Modell (die Himmelsrichtungen gehören zu ihm, wie die Sonne). Gezeichnet vor allem anderen, alles danach liegt darüber.
 * Grösse und Helligkeit der Punkte sind gewählt.
 */
import * as THREE from 'three'
import { mondstand, sterneLaden, sternenhimmel } from '../sterne'

/** die hellsten Sterne so gross in Bildpunkten (gewählt) */
const STERN_PX = 4.6
/** der Mond so gross wie MOND_GRAD am Himmel (wirklich etwa 0,5°, grösser, damit man die Phase sieht; gewählt) */
const MOND_GRAD = 1.6

/** dunklere, weiche Flecken auf der Scheibe (Lage, Grösse, Tiefe), gezeichnet, nicht nach einer Karte des Monds */
const MOND_FLECKEN: Array<[number, number, number, number]> = [[-0.25, -0.3, 0.32, 0.22], [0.2, -0.35, 0.28, 0.18], [0.35, 0.05, 0.22, 0.15],
  [-0.4, 0.2, 0.3, 0.2], [0.05, 0.4, 0.18, 0.12], [-0.05, -0.05, 0.15, 0.1]]

/** die Scheibe des Monds mit der beleuchteten Seite nach rechts (+x); hell ist, was rechts der Grenze von Licht und Schatten liegt */
function mondBild(elongation: number) {
  const n = 128, c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!, bild = g.createImageData(n, n), ce = Math.cos(elongation * Math.PI / 180)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / (n / 2) - 1, y = (j + 0.5) / (n / 2) - 1, r = Math.hypot(x, y)
    if (r > 1) continue
    const rand = Math.min(1, (1 - r) * n / 3), w = Math.sqrt(Math.max(0, 1 - y * y))
    // die Grenze weich über ein paar Bildpunkte; leicht fleckig (Meere des Monds, gezeichnet, nicht nach einer Karte)
    const hell = Math.max(0, Math.min(1, (x - ce * w) * n / 6 + 0.5))
    let fleck = 1
    for (const [fx, fy, fr, ft] of MOND_FLECKEN) fleck -= ft * Math.exp(-((x - fx) ** 2 + (y - fy) ** 2) / (fr * fr))
    const k = (i + j * n) * 4, v = 0.06 + 0.94 * hell * fleck
    bild.data[k] = 255 * v; bild.data[k + 1] = 250 * v; bild.data[k + 2] = 232 * v; bild.data[k + 3] = 255 * rand * (0.25 + 0.75 * hell)
  }
  g.putImageData(bild, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface Sternenhimmel {
  punkte: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  /** wie deutlich, 0 bis 1 (0: keine) */
  sicht: (v: number) => void
  /** die Sterne zu dieser Zeit über diesem Ort (lädt den Katalog beim ersten Mal) */
  setzen: (zeit: Date, la: number, lo: number) => void
  /** je Bild: um das Auge, gedreht wie das Modell; ohne Himmel (Durchblick der Brille) keine */
  schritt: (kamera: THREE.Camera, modell: THREE.Object3D, mitHimmel: boolean) => void
  entsorgen: () => void
}

export function sternenhimmelBauen(): Sternenhimmel {
  const punkte = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    uniforms: { uSicht: { value: 0 }, uPunkt: { value: Math.min(2, devicePixelRatio) } },
    vertexShader: `attribute float mag; attribute vec3 farbe; uniform float uPunkt; uniform float uSicht; varying vec3 vFarbe; varying float vHell;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // hellere Sterne grösser und deutlicher
        gl_PointSize = clamp(${STERN_PX.toFixed(2)} - 0.42 * mag, 0.9, 4.2) * uPunkt;
        vHell = clamp(1.25 - 0.17 * mag, 0.18, 1.0) * uSicht; vFarbe = farbe;
      }`,
    fragmentShader: `varying vec3 vFarbe; varying float vHell;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(vFarbe, vHell * smoothstep(1.0, 0.25, r));
      }`,
    // nicht «transparent»: so zeichnet three.js die Sterne vor allem anderen (renderOrder), alles danach liegt darüber
    transparent: false, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  punkte.frustumCulled = false; punkte.renderOrder = -10; punkte.visible = false
  // der Mond am selben Himmel, auch hinter allem anderen; die beleuchtete Seite dreht zur Sonne im Bild
  const mond = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: false, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }))
  // nicht «transparent»: wie die Sterne vor allem anderen gezeichnet, darum hinzugefügt statt überdeckt (auf dem dunklen Himmel gleich)
  mond.renderOrder = -9; mond.frustumCulled = false; mond.visible = false
  mond.scale.setScalar(2 * Math.tan((MOND_GRAD / 2) * Math.PI / 180))
  punkte.add(mond)
  let mondElong = -1
  const mondSonne = new THREE.Vector3(), mondBild1 = new THREE.Vector3(), mondBild2 = new THREE.Vector3()
  let auftrag = 0, zuletzt = ''
  const auge = new THREE.Vector3()
  return {
    punkte,
    sicht: (v) => { punkte.material.uniforms.uSicht.value = Math.max(0, Math.min(1, v)) },
    setzen: (zeit, la, lo) => {
      // nur neu rechnen, wenn sich die Minute oder der Ort ändert
      const schluessel = `${Math.floor(zeit.getTime() / 60_000)}/${la.toFixed(2)}/${lo.toFixed(2)}`
      if (schluessel === zuletzt) return
      zuletzt = schluessel
      const a = ++auftrag
      const m = mondstand(zeit, la, lo)
      mond.position.set(...m.richtung)
      mondSonne.set(...m.sonne)
      mond.visible = m.richtung[1] > -0.02
      // das Bild der Phase nur neu, wenn sie sich um mehr als ein Grad ändert
      if (Math.abs(m.elongation - mondElong) > 1) {
        mondElong = m.elongation
        mond.material.map?.dispose(); mond.material.map = mondBild(m.elongation); mond.material.needsUpdate = true
      }
      void sterneLaden().then((kat) => {
        if (a !== auftrag) return
        const { lage, farben, mag } = sternenhimmel(kat, zeit, la, lo)
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(lage, 3))
        g.setAttribute('farbe', new THREE.BufferAttribute(farben, 3))
        g.setAttribute('mag', new THREE.BufferAttribute(mag, 1))
        punkte.geometry.dispose(); punkte.geometry = g
      }).catch(() => { zuletzt = '' })
    },
    schritt: (kamera, modell, mitHimmel) => {
      punkte.visible = punkte.material.uniforms.uSicht.value > 0 && mitHimmel
      if (!punkte.visible) return
      const cam = kamera as THREE.PerspectiveCamera
      punkte.position.copy(auge.setFromMatrixPosition(cam.matrixWorld))
      modell.getWorldQuaternion(punkte.quaternion)
      punkte.scale.setScalar(Math.max(1e-3, (cam.near ?? 0.01) * 50))
      // die helle Seite des Monds zur Sonne: beide Richtungen ins Bild, der Winkel dazwischen dreht die Scheibe
      if (mond.visible) {
        punkte.updateMatrixWorld()
        mondBild1.copy(mond.position).applyMatrix4(punkte.matrixWorld).project(cam)
        mondBild2.copy(mond.position).addScaledVector(mondSonne, 0.05).applyMatrix4(punkte.matrixWorld).project(cam)
        const asp = (cam as THREE.PerspectiveCamera).aspect ?? 1
        mond.material.rotation = Math.atan2(mondBild2.y - mondBild1.y, (mondBild2.x - mondBild1.x) * asp)
        mond.material.opacity = punkte.material.uniforms.uSicht.value
      }
    },
    entsorgen: () => { auftrag++; punkte.geometry.dispose(); punkte.material.dispose(); mond.material.map?.dispose(); mond.material.dispose() },
  }
}
