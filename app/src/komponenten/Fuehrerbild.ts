import * as THREE from 'three'
import bildHoch from '../assets/fuehrerstand-hoch.webp'
import bildQuer from '../assets/fuehrerstand-quer.webp'
import type { Fuehrerpult } from './Fuehrerpult'

/**
 * Der Führerstand auf dem Bildschirm als Bild (Michael, 2026-10-23: «Ich möchte, dass das Cockpit des Zuges ziemlich genau so
 * aussieht … Alles, was aussen liegt, Tunnel, Felsen, Strecken, muss natürlich weg»): seine Vorlage, quer und hoch, das Fenster
 * ausgeschnitten, dahinter die Landschaft. Auf den gemalten Bildschirmen die Anzeigen des Pults (Fuehrerpult.anzeigeBilder),
 * die beiden Hebel und die rote Taste bedienbar wie am Pult in 3D; die übrigen Knöpfe sind vorerst nur gemalt.
 *
 * Das Bild füllt die Breite. Der Teil unter dem Fenster (das Pult) behält seine Form, der Teil darüber (Säulen und Fenster)
 * wird in der Höhe gestreckt, bis er oben anstösst. In der Brille bleibt das Pult in 3D (Fuehrerpult).
 */
interface Vorlage {
  url: string
  /** Grösse in Bildpunkten und die Zeile, wo das Pult beginnt (Unterkante des Fensters) */
  b: number; h: number; pult: number
  /** die gemalten Bildschirme: Strecke, Tacho, Voraus, je [x0, y0, x1, y1] in Bildpunkten */
  anzeigen: Array<[number, number, number, number]>
  /** bedienbare Stellen: Hebel oben und unten (vorn, hinten wie am Pult), die rote Taste */
  ziele: Array<{ r: [number, number, number, number]; aktion: string; name: string }>
}
const hebel = (r: [number, number, number, number], vorn: string, hinten: string, name: string) => {
  const mitte = (r[1] + r[3]) / 2
  return [{ r: [r[0], r[1], r[2], mitte] as [number, number, number, number], aktion: vorn, name: `${name}: nach vorn` },
    { r: [r[0], mitte, r[2], r[3]] as [number, number, number, number], aktion: hinten, name: `${name}: zurück` }]
}
/** ausgemessen in Michaels Vorlagen (2026-10-23), quer 1846 × 852 und hoch 1086 × 1448 */
const VORLAGEN: Record<'quer' | 'hoch', Vorlage> = {
  quer: {
    url: bildQuer, b: 1846, h: 852, pult: 502,
    anzeigen: [[537, 541, 741, 650], [808, 538, 1030, 668], [1091, 538, 1250, 650]],
    ziele: [...hebel([450, 640, 590, 780], 'bremsePlus', 'bremseMinus', 'Bremse (B, 0)'),
      ...hebel([1240, 640, 1390, 780], 'sollPlus', 'sollMinus', 'Geschwindigkeit wählen (Pfeil hoch, runter)'),
      { r: [395, 700, 455, 745], aktion: 'schnellbremse', name: 'Schnellbremse (Leertaste)' }],
  },
  hoch: {
    url: bildHoch, b: 1086, h: 1448, pult: 1047,
    anzeigen: [[233, 1094, 391, 1192], [453, 1093, 639, 1197], [691, 1094, 837, 1192]],
    ziele: [...hebel([120, 1210, 235, 1345], 'bremsePlus', 'bremseMinus', 'Bremse (B, 0)'),
      ...hebel([835, 1210, 950, 1345], 'sollPlus', 'sollMinus', 'Geschwindigkeit wählen (Pfeil hoch, runter)'),
      { r: [70, 1278, 125, 1318], aktion: 'schnellbremse', name: 'Schnellbremse (Leertaste)' }],
  },
}
/** Seitenverhältnis der Anzeigen des Pults (640 × 360) */
const ANZEIGE_SV = 640 / 360

export class Fuehrerbild {
  readonly szene = new THREE.Scene()
  /** Einheiten: die Breite des Bildschirms ist 1, y nach oben, unten 0 */
  readonly kamera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
  private texturen = new Map<string, THREE.Texture>()
  private art: 'quer' | 'hoch' | null = null
  private aspekt = 0
  private teile = new THREE.Group()
  private treffer: THREE.Mesh[] = []
  private schliessen: THREE.Mesh | null = null
  /** Anteil der Höhe des Bildschirms, den das Pult unten einnimmt */
  anteil = 0.4

  private pult: Fuehrerpult

  constructor(pult: Fuehrerpult) {
    this.pult = pult
    this.szene.add(this.teile)
    const lader = new THREE.TextureLoader()
    for (const [art, v] of Object.entries(VORLAGEN)) {
      const t = lader.load(v.url, () => { this.aspekt = 0 })
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      this.texturen.set(art, t)
    }
  }

  /** für einen Bildschirm mit diesem Seitenverhältnis (Breite durch Höhe) legen; gibt den Anteil des Pults an der Höhe zurück */
  legen(aspekt: number, schliessbar: boolean) {
    const art = aspekt < 1 ? 'hoch' : 'quer'
    if (this.schliessen) this.schliessen.visible = schliessbar
    if (art === this.art && Math.abs(aspekt - this.aspekt) < 1e-4) return this.anteil
    this.art = art; this.aspekt = aspekt
    for (const o of [...this.teile.children]) {
      this.teile.remove(o)
      const n = o as THREE.Mesh
      n.geometry.dispose()
      ;(n.material as THREE.Material).dispose()
    }
    this.treffer = []
    const v = VORLAGEN[art], tex = this.texturen.get(art)!
    const hoehe = 1 / aspekt, s = 1 / v.b
    // unten das Pult in seiner Form, darüber das Fenster gestreckt
    const pultH = (v.h - v.pult) * s
    const obenH = Math.max(hoehe - pultH, (v.pult * s) * 0.5)
    this.anteil = Math.min(1, pultH / hoehe)
    const stueck = (y0: number, y1: number, unten: number, h: number) => {
      const g = new THREE.PlaneGeometry(1, h)
      const uv = g.getAttribute('uv') as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? 1 - y0 / v.h : 1 - y1 / v.h)
      const n = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }))
      n.position.set(0.5, unten + h / 2, 0)
      n.renderOrder = 0
      this.teile.add(n)
    }
    stueck(v.pult, v.h, 0, pultH)
    stueck(0, v.pult, pultH, obenH)
    // was im Bild bei y Bildpunkten liegt (nur im Pult)
    const lage = (r: [number, number, number, number]) => ({ x0: r[0] * s, x1: r[2] * s, y0: (v.h - r[3]) * s, y1: (v.h - r[1]) * s })
    v.anzeigen.forEach((r, i) => {
      const tex = this.pult.anzeigeBilder[i]
      if (!tex) return
      const l = lage(r)
      // die Anzeige so gross, wie sie in den gemalten Bildschirm passt, ohne sie zu verziehen
      let b = l.x1 - l.x0, h = l.y1 - l.y0
      if (b / h > ANZEIGE_SV) b = h * ANZEIGE_SV; else h = b / ANZEIGE_SV
      const n = new THREE.Mesh(new THREE.PlaneGeometry(b, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }))
      n.position.set((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2, 0)
      n.renderOrder = 1
      this.teile.add(n)
    })
    for (const z of v.ziele) {
      const l = lage(z.r)
      const n = new THREE.Mesh(new THREE.PlaneGeometry(l.x1 - l.x0, l.y1 - l.y0),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false }))
      n.position.set((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2, 0)
      n.renderOrder = 2
      n.userData.aktion = z.aktion
      n.name = z.name
      this.teile.add(n)
      this.treffer.push(n)
    }
    // im Vollbild oben rechts ein Kreuz zum Schliessen: im Bild gibt es keine Taste dafür
    const k = 0.045
    const lw = document.createElement('canvas')
    lw.width = lw.height = 128
    const c = lw.getContext('2d')!
    c.fillStyle = 'rgba(30,33,37,0.85)'; c.beginPath(); c.roundRect(4, 4, 120, 120, 22); c.fill()
    c.strokeStyle = '#ffffff'; c.lineWidth = 12; c.lineCap = 'round'
    c.beginPath(); c.moveTo(40, 40); c.lineTo(88, 88); c.moveTo(88, 40); c.lineTo(40, 88); c.stroke()
    const kt = new THREE.CanvasTexture(lw)
    kt.colorSpace = THREE.SRGBColorSpace
    this.schliessen = new THREE.Mesh(new THREE.PlaneGeometry(k, k), new THREE.MeshBasicMaterial({ map: kt, transparent: true, depthTest: false }))
    this.schliessen.position.set(1 - k * 0.8, hoehe - k * 0.8, 0)
    this.schliessen.renderOrder = 3
    this.schliessen.userData.aktion = 'schliessen'
    this.schliessen.name = 'Vollbild schliessen (Esc)'
    this.schliessen.visible = schliessbar
    this.teile.add(this.schliessen)
    this.treffer.push(this.schliessen)
    this.kamera.left = 0; this.kamera.right = 1; this.kamera.top = hoehe; this.kamera.bottom = 0
    this.kamera.updateProjectionMatrix()
    return this.anteil
  }

  /** die Stelle unter Maus oder Finger (ndc wie beim Raycaster) */
  treffen(ndc: THREE.Vector2, strahl: THREE.Raycaster) {
    strahl.setFromCamera(ndc, this.kamera)
    return strahl.intersectObjects(this.treffer.filter((t) => t.visible), false)[0]?.object ?? null
  }

  /** hervorheben, was unter der Maus ist */
  hover(t: THREE.Object3D | null) {
    for (const n of this.treffer) if (n !== this.schliessen) (n.material as THREE.MeshBasicMaterial).opacity = n === t ? 0.12 : 0
    return t?.name ?? null
  }

  entsorgen() {
    this.szene.traverse((o) => {
      const n = o as THREE.Mesh
      n.geometry?.dispose()
      ;(n.material as THREE.Material | undefined)?.dispose()
    })
    for (const t of this.texturen.values()) t.dispose()
  }
}
