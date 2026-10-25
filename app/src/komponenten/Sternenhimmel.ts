/**
 * Der Sternenhimmel als Punkte um das Auge (Michael, 2026-10-24: «Himmel nachts dunkler und mit Sternen machen», 2026-10-25: «auch
 * in der Modellbahn»), für «3D Schweiz» und die Modellbahn: die Sterne aus src/sterne.ts zu einer Zeit über einem Ort, gedreht wie
 * das Modell (die Himmelsrichtungen gehören zu ihm, wie die Sonne). Gezeichnet vor allem anderen, alles danach liegt darüber.
 * Grösse und Helligkeit der Punkte sind gewählt.
 */
import * as THREE from 'three'
import { sterneLaden, sternenhimmel } from '../sterne'

/** die hellsten Sterne so gross in Bildpunkten (gewählt) */
const STERN_PX = 4.6

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
    },
    entsorgen: () => { auftrag++; punkte.geometry.dispose(); punkte.material.dispose() },
  }
}
