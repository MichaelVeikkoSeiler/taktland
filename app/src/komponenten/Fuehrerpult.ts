import * as THREE from 'three'
import { audioKontext, audioLesen, audioSetzen, signalhorn } from '../audio'

/**
 * Das Pult im Führerstand (Michael, 2026-10-12: «Überarbeite den bestehenden 3D-Führerstand anhand des Referenzbildes …
 * neutraler Schweizer Führerstand ohne Markenlogos»): Fensterrahmen mit Wischern, drei Anzeigen (Strecke, Tacho,
 * Vorankündigungen), zwei Hebel (Bremse, Geschwindigkeitswahl), Knöpfe für Signalhorn, Stirnlicht, Pultlicht, Wischer,
 * Zuggeräusch und Schnellbremse. Vereinfacht, kein Abbild eines bestimmten Fahrzeugs.
 *
 * In Metern, das Auge im Ursprung, Blick nach -Z. Auf dem Bildschirm in einer eigenen Szene über der Landschaft
 * (szene, kamera), in der Brille in Originalgrösse vor dem Kopf (gruppe in die Welt gehängt).
 *
 * Tempo: in der Modellbahn simuliert (Hebel, Beschleunigen und Bremsen hier gerechnet); beim Fahren das Tempo aus dem
 * GPS-Standort, bei der Probefahrt das der Probefahrt; dann sind die Hebel gesperrt.
 */
export type TempoQuelle = 'simulation' | 'gps' | 'probe'

export interface Ankuendigung { s: number; art: 'tunnel' | 'bruecke' | 'bahnhof'; name: string }

/** was die Anzeigen zeigen; Meter entlang des Wegs */
export interface PultLage {
  /** Spitze des Zugs */
  s: number
  richtung: number
  anfang: number
  ende: number
  /** m/s */
  v: number
  quelle: TempoQuelle
  ankuendigungen: Ankuendigung[]
  von: string
  nach: string
}

const FARBE = {
  pult: '#3b4655', pultHell: '#4a5668', schwarz: '#1d2229', blende: '#262d36',
  anzeige: '#132033', schrift: '#e9eef5', blau: '#4f9cff', karmin: '#d63a55', gelb: '#f2c230', grau: '#8b96a6',
}
/** Tempo in km/h: Wahl in Schritten von 10 bis höchstens 160 (Michael, 2026-10-12) */
export const PULT_HOECHST_KMH = 160
const SCHRITT_KMH = 10
/** gerechnete Beschleunigung und Bremsung in m/s²: Annahmen für die Simulation, aus keiner Quelle */
const ANFAHREN_MS2 = 0.5, AUSROLLEN_MS2 = 0.3, BREMSEN_MS2 = 0.8, SCHNELLBREMSE_MS2 = 1.4
const BREMSE_TEXT = ['0', 'B', 'SB'] as const

type Aktion = 'sollPlus' | 'sollMinus' | 'bremsePlus' | 'bremseMinus' | 'horn' | 'stirnlicht' | 'pultlicht' | 'wischer'
  | 'schnellbremse' | 'zuggeraeusch'

/** Was ein Element tut und wie es heisst (als Tooltip und für Bildschirmleser) */
const NAMEN: Record<Aktion, string> = {
  sollPlus: 'Geschwindigkeit wählen: schneller (Pfeil hoch)', sollMinus: 'Geschwindigkeit wählen: langsamer (Pfeil runter)',
  bremsePlus: 'Bremse: stärker (B)', bremseMinus: 'Bremse: lösen (0)', horn: 'Signalhorn (H)', stirnlicht: 'Stirnlicht (L)',
  pultlicht: 'Pultbeleuchtung (P)', wischer: 'Scheibenwischer (W)', schnellbremse: 'Schnellbremse (Leertaste)',
  zuggeraeusch: 'Zuggeräusch ein, aus (T)',
}

export class Fuehrerpult {
  readonly gruppe = new THREE.Group()
  readonly szene = new THREE.Scene()
  readonly kamera = new THREE.PerspectiveCamera(60, 1, 0.05, 20)
  /** gewählte Geschwindigkeit km/h, Bremse 0 gelöst, 1 bremsen, 2 Schnellbremse; v simuliert in m/s */
  soll = 80
  bremse = 0
  v = 0
  stirnlicht = false
  pultlicht = true
  wischer = false
  /** wird gesetzt, sobald das Tempo nicht von hier kommt (GPS, Probefahrt) */
  quelle: TempoQuelle = 'simulation'
  private ziele: Array<{ netz: THREE.Mesh; aktion: Aktion; grund: THREE.Color }> = []
  private ueber: THREE.Mesh | null = null
  private sollHebel = new THREE.Group()
  private bremsHebel = new THREE.Group()
  private wischerArme: THREE.Group[] = []
  private wischerZeit = 0
  private licht = new THREE.PointLight('#fff4e0', 0, 3, 1)
  private anzeigen: Array<{ lw: HTMLCanvasElement; tex: THREE.CanvasTexture; malen: (g: CanvasRenderingContext2D, l: PultLage) => void }> = []
  private gemalt = -Infinity
  private zeigerWinkel = 0
  private zuggeraeuschAn = audioLesen().zuggeraeusch

  constructor() {
    this.szene.add(this.gruppe)
    this.szene.add(new THREE.HemisphereLight('#ffffff', '#5c6370', 1.4))
    const sonne = new THREE.DirectionalLight('#ffffff', 1.2)
    sonne.position.set(0.3, 1, 0.6)
    this.szene.add(sonne)
    this.licht.position.set(0, 0.3, -0.4)
    this.gruppe.add(this.licht)
    this.bauen()
  }

  /* ---------- Bau ---------- */

  private material(farbe: string) {
    return new THREE.MeshLambertMaterial({ color: farbe })
  }

  private kasten(b: number, h: number, t: number, farbe: string, x: number, y: number, z: number, kippen = 0, ort: THREE.Object3D = this.gruppe) {
    const n = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), this.material(farbe))
    n.position.set(x, y, z)
    n.rotation.x = kippen
    ort.add(n)
    return n
  }

  /** ein bedienbares Teil: eigenes Material, damit das Hover-Feedback nur dieses trifft */
  private ziel(n: THREE.Mesh, aktion: Aktion) {
    const m = (n.material as THREE.MeshLambertMaterial)
    n.userData.aktion = aktion
    n.name = NAMEN[aktion]
    this.ziele.push({ netz: n, aktion, grund: m.emissive.clone() })
    return n
  }

  private leinwand(b: number, h: number, malen: (g: CanvasRenderingContext2D) => void) {
    const lw = document.createElement('canvas')
    lw.width = b; lw.height = h
    malen(lw.getContext('2d')!)
    const tex = new THREE.CanvasTexture(lw)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }

  /** eine Taste mit Zeichen auf dem Deckel */
  private taste(zeichen: (g: CanvasRenderingContext2D) => void, grund: string, x: number, y: number, z: number, aktion: Aktion,
    kippen: number, gross = 0.075) {
    const halter = new THREE.Group()
    halter.position.set(x, y, z)
    halter.rotation.x = kippen
    this.gruppe.add(halter)
    this.kasten(gross + 0.014, 0.012, gross + 0.014, FARBE.schwarz, 0, 0, 0, 0, halter)
    const deckel = new THREE.Mesh(new THREE.BoxGeometry(gross, 0.018, gross), [
      this.material(grund), this.material(grund),
      new THREE.MeshLambertMaterial({ color: '#ffffff', map: this.leinwand(128, 128, (g) => {
        g.fillStyle = grund; g.fillRect(0, 0, 128, 128); zeichen(g)
      }) }),
      this.material(grund), this.material(grund), this.material(grund),
    ])
    deckel.position.y = 0.012
    halter.add(deckel)
    // Hover gilt für den Deckel: ein gemeinsames emissive über alle Seiten
    const mats = deckel.material as THREE.MeshLambertMaterial[]
    deckel.userData.aktion = aktion
    deckel.name = NAMEN[aktion]
    this.ziele.push({ netz: deckel, aktion, grund: mats[0].emissive.clone() })
    deckel.userData.mats = mats
    return deckel
  }

  private bauen() {
    const g = this.gruppe
    // Pult: die Fläche vor dir, nach vorn leicht ansteigend, darüber die Konsole mit den drei Anzeigen
    this.kasten(2.4, 0.06, 0.7, FARBE.pult, 0, -0.56, -0.62, 0.2)
    this.kasten(2.4, 0.3, 0.06, FARBE.pultHell, 0, -0.74, -0.28)
    const konsole = new THREE.Group()
    konsole.position.set(0, -0.33, -0.95)
    konsole.rotation.x = -0.32
    g.add(konsole)
    this.kasten(2.0, 0.3, 0.14, FARBE.pultHell, 0, 0, 0, 0, konsole)
    // Blendschutz über den Anzeigen
    this.kasten(2.1, 0.035, 0.22, FARBE.pult, 0, 0.17, 0.02, 0, konsole)
    // Seitenteile links und rechts mit je zwei grossen Tasten
    this.kasten(0.24, 0.42, 0.5, FARBE.pult, -1.08, -0.38, -0.78)
    this.kasten(0.24, 0.42, 0.5, FARBE.pult, 1.08, -0.38, -0.78)
    // Fensterrahmen dunkelgrau wie das Pult (Michael, 2026-10-13: «aerodynamischer»): Säulen schlank, oben schmaler,
    // im Querschnitt flach gerundet, nach aussen gewölbt, oben nach innen und zum Fahrer geneigt wie eine schräge Frontscheibe
    for (const seite of [-1, 1]) {
      const bogen = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(seite * 1.18, -0.2, -1.14),
        new THREE.Vector3(seite * 1.22, 0.65, -1.02),
        new THREE.Vector3(seite * 0.98, 1.36, -0.88))
      const teile = 24, rund = 12
      const geo = new THREE.TubeGeometry(bogen, teile, 0.085, rund, false)
      const pos = geo.attributes.position
      const v = new THREE.Vector3(), mitte = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        const t = Math.floor(i / (rund + 1)) / teile
        bogen.getPoint(t, mitte)
        v.fromBufferAttribute(pos, i).sub(mitte).multiplyScalar(1 - 0.6 * t)
        v.z *= 0.6
        pos.setXYZ(i, mitte.x + v.x, mitte.y + v.y, mitte.z + v.z)
      }
      geo.computeVertexNormals()
      g.add(new THREE.Mesh(geo, this.material(FARBE.pult)))
    }
    // Dachkante: ein flacher, runder Balken über die ganze Breite
    const dach = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 20), this.material(FARBE.pult))
    dach.geometry.scale(1, 1, 0.45)
    dach.rotation.z = Math.PI / 2
    dach.position.set(0, 1.36, -0.88)
    g.add(dach)
    this.kasten(2.6, 0.06, 0.1, FARBE.blende, 0, -0.17, -1.13)

    // die drei Anzeigen
    const anzeige = (x: number, malen: (g: CanvasRenderingContext2D, l: PultLage) => void) => {
      const lw = document.createElement('canvas')
      lw.width = 640; lw.height = 360
      const tex = new THREE.CanvasTexture(lw)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      this.kasten(0.58, 0.29, 0.02, FARBE.blende, x, 0, 0.072, 0, konsole)
      const flaeche = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.2925), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
      flaeche.position.set(x, 0, 0.0835)
      konsole.add(flaeche)
      this.anzeigen.push({ lw, tex, malen })
    }
    anzeige(-0.63, (c, l) => this.streckeMalen(c, l))
    anzeige(0, (c, l) => this.tachoMalen(c, l))
    anzeige(0.63, (c, l) => this.voranMalen(c, l))

    // Tasten in der Mitte, vor den Anzeigen
    const kippen = 0.2, y = -0.5, z = -0.86
    this.taste((c) => dreieck(c, '#ffffff'), '#b3122f', -0.24, y, z, 'schnellbremse', kippen)
    this.taste((c) => lautsprecher(c, FARBE.schrift), FARBE.schwarz, -0.12, y, z, 'zuggeraeusch', kippen)
    this.taste((c) => horn(c, FARBE.schrift), FARBE.schwarz, 0, y, z, 'horn', kippen)
    this.taste((c) => sonne(c, FARBE.schrift), FARBE.schwarz, 0.12, y, z, 'stirnlicht', kippen)
    this.taste((c) => wischerZeichen(c, FARBE.schrift), FARBE.schwarz, 0.24, y, z, 'wischer', kippen)
    // Seitenteile: links Pultlicht und Signalhorn (gelb), rechts Wischer und Stirnlicht
    this.taste((c) => sonne(c, FARBE.schrift), FARBE.schwarz, -1.06, -0.165, -0.68, 'pultlicht', 0.1, 0.1)
    this.taste((c) => horn(c, '#1d2229'), FARBE.gelb, -1.06, -0.165, -0.86, 'horn', 0.1, 0.1)
    this.taste((c) => wischerZeichen(c, FARBE.schrift), FARBE.schwarz, 1.06, -0.165, -0.68, 'wischer', 0.1, 0.1)
    this.taste((c) => sonne(c, FARBE.schrift), FARBE.schwarz, 1.06, -0.165, -0.86, 'stirnlicht', 0.1, 0.1)

    // Hebel: links die Bremse (0, B, SB), rechts die Geschwindigkeitswahl (0 bis 160 km/h)
    this.hebel(-0.5, this.bremsHebel, 'bremsePlus', 'bremseMinus', (c) => {
      c.fillStyle = FARBE.schrift; c.font = 'bold 40px Helvetica, Arial, sans-serif'; c.textAlign = 'center'
      BREMSE_TEXT.forEach((t, i) => c.fillText(t, 40, 60 + i * 95))
    })
    this.hebel(0.5, this.sollHebel, 'sollMinus', 'sollPlus', (c) => {
      c.fillStyle = FARBE.schrift; c.font = 'bold 30px Helvetica, Arial, sans-serif'; c.textAlign = 'center'
      for (let i = 0; i <= 4; i++) c.fillText(String(160 - i * 40), 40, 40 + i * 62)
    })

    // Wischer: zwei Arme unten am Fenster, in Ruhe flach
    for (const x of [-0.42, 0.38]) {
      const arm = new THREE.Group()
      arm.position.set(x, -0.15, -1.08)
      const stange = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.82, 0.01), this.material(FARBE.schwarz))
      stange.position.y = 0.41
      arm.add(stange)
      const blatt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.012), this.material('#111418'))
      blatt.position.set(0.02, 0.45, 0.004)
      arm.add(blatt)
      arm.rotation.z = -Math.PI / 2 + 0.08
      g.add(arm)
      this.wischerArme.push(arm)
    }
  }

  /** ein Hebel in einer Kulisse: die vordere Hälfte der Kulisse schiebt ihn nach vorn, die hintere zurück */
  private hebel(x: number, griff: THREE.Group, vorn: Aktion, hinten: Aktion, skala: (c: CanvasRenderingContext2D) => void) {
    const basis = new THREE.Group()
    basis.position.set(x, -0.52, -0.6)
    basis.rotation.x = 0.2
    this.gruppe.add(basis)
    this.kasten(0.2, 0.03, 0.3, FARBE.schwarz, 0, 0, 0, 0, basis)
    // Skala neben der Kulisse
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.25),
      new THREE.MeshBasicMaterial({ map: this.leinwand(80, 320, (c) => { c.fillStyle = FARBE.schwarz; c.fillRect(0, 0, 80, 320); skala(c) }), toneMapped: false }))
    s.rotation.x = -Math.PI / 2
    s.position.set(x < 0 ? -0.075 : 0.075, 0.017, 0)
    basis.add(s)
    // die beiden Hälften als Ziele, kaum sichtbar
    for (const [aktion, z] of [[vorn, -0.075], [hinten, 0.075]] as const) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.14), this.material('#2b323c'))
      h.position.set(0, 0.022, z)
      basis.add(h)
      this.ziel(h, aktion)
    }
    griff.position.set(0, 0.02, 0)
    basis.add(griff)
    const stange = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 10), this.material('#1a1e24'))
    stange.position.y = 0.065
    griff.add(stange)
    const knauf = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.06), this.material('#22272e'))
    knauf.position.y = 0.14
    griff.add(knauf)
    // auch der Knauf ist bedienbar: er schiebt nach vorn
    this.ziel(knauf, vorn)
  }

  /* ---------- Bedienung ---------- */

  /** die bedienbaren Teile, für Strahl und Maus */
  get bedienbar(): THREE.Object3D[] { return this.ziele.map((z) => z.netz) }

  /** das Teil unter Maus oder Strahl, oder keines; gibt seinen Namen zurück */
  hover(netz: THREE.Object3D | null): string | null {
    const neu = (netz as THREE.Mesh | null) ?? null
    if (neu === this.ueber) return neu?.name ?? null
    const setzen = (n: THREE.Mesh, an: boolean) => {
      const mats = (n.userData.mats as THREE.MeshLambertMaterial[] | undefined) ?? [n.material as THREE.MeshLambertMaterial]
      for (const m of mats) m.emissive.set(an ? '#3d4c63' : '#000000')
    }
    if (this.ueber) setzen(this.ueber, false)
    this.ueber = neu
    if (neu) setzen(neu, true)
    return neu?.name ?? null
  }

  /** löst das Teil aus; gibt eine kurze Rückmeldung für die Anzeige zurück */
  ausloesen(netz: THREE.Object3D): string | null {
    const aktion = netz.userData.aktion as Aktion | undefined
    return aktion ? this.tun(aktion) : null
  }

  /** auch von der Tastatur */
  tun(aktion: Aktion): string {
    const sim = this.quelle === 'simulation'
    const gesperrt = this.quelle === 'probe' ? 'In der Probefahrt bestimmt der Zeitraffer das Tempo'
      : 'Beim Fahren bestimmt der Standort das Tempo'
    switch (aktion) {
      case 'sollPlus': if (!sim) return gesperrt
        this.soll = Math.min(PULT_HOECHST_KMH, this.soll + SCHRITT_KMH); if (this.bremse === 2) this.bremse = 0; return `${this.soll} km/h gewählt`
      case 'sollMinus': if (!sim) return gesperrt
        this.soll = Math.max(0, this.soll - SCHRITT_KMH); return `${this.soll} km/h gewählt`
      case 'bremsePlus': if (!sim) return gesperrt
        this.bremse = Math.min(2, this.bremse + 1); return this.bremse === 2 ? 'Schnellbremse' : 'Bremse'
      case 'bremseMinus': if (!sim) return gesperrt
        this.bremse = Math.max(0, this.bremse - 1); return this.bremse ? 'Bremse' : 'Bremse gelöst'
      case 'schnellbremse': if (!sim) return gesperrt
        this.bremse = 2; this.soll = 0; return 'Schnellbremse'
      case 'horn': void audioKontext()?.resume(); signalhorn(); return 'Signalhorn'
      case 'stirnlicht': this.stirnlicht = !this.stirnlicht; return this.stirnlicht ? 'Stirnlicht an' : 'Stirnlicht aus'
      case 'pultlicht': this.pultlicht = !this.pultlicht; return this.pultlicht ? 'Pultbeleuchtung an' : 'Pultbeleuchtung aus'
      case 'wischer': this.wischer = !this.wischer; return this.wischer ? 'Scheibenwischer an' : 'Scheibenwischer aus'
      case 'zuggeraeusch': {
        void audioKontext()?.resume()
        this.zuggeraeuschAn = !audioLesen().zuggeraeusch
        audioSetzen({ zuggeraeusch: this.zuggeraeuschAn })
        return !audioLesen().an ? 'Töne sind in den Einstellungen aus' : this.zuggeraeuschAn ? 'Zuggeräusch an' : 'Zuggeräusch aus'
      }
    }
  }

  /** Tastatur auf dem Bildschirm; true, wenn die Taste etwas tat */
  taste_(code: string): string | null {
    const zu: Record<string, Aktion> = { ArrowUp: 'sollPlus', ArrowDown: 'sollMinus', KeyB: 'bremsePlus', Digit0: 'bremseMinus',
      Space: 'schnellbremse', KeyH: 'horn', KeyL: 'stirnlicht', KeyP: 'pultlicht', KeyW: 'wischer', KeyT: 'zuggeraeusch' }
    return zu[code] ? this.tun(zu[code]) : null
  }

  /* ---------- Simulation ---------- */

  /**
   * Ein Schritt der Simulation: zur gewählten Geschwindigkeit hin beschleunigen oder ausrollen, mit der Bremse bremsen;
   * vor dem Ende des Wegs so bremsen, dass der Zug dort steht (rest in Metern). Gibt das Tempo in m/s zurück.
   */
  schritt(dt: number, rest: number) {
    const ziel = this.soll / 3.6
    let a: number
    if (this.bremse === 2) a = -SCHNELLBREMSE_MS2
    else if (this.bremse === 1) a = -BREMSEN_MS2
    else if (this.v < ziel - 0.05) a = ANFAHREN_MS2 * Math.min(1, (ziel - this.v) / 2 + 0.3)
    else if (this.v > ziel + 0.05) a = -AUSROLLEN_MS2
    else a = 0
    this.v = Math.max(0, this.v + a * dt)
    if (this.v < ziel + 0.05 && this.v > ziel - 0.05 && !this.bremse) this.v = ziel
    // vor dem Ende anhalten
    this.v = Math.min(this.v, Math.sqrt(2 * BREMSEN_MS2 * Math.max(0, rest - 2)))
    return this.v
  }

  /* ---------- je Bild ---------- */

  aktualisieren(dt: number, lage: PultLage) {
    this.quelle = lage.quelle
    // Hebel nach Stellung
    this.sollHebel.rotation.x = 0.45 - (this.soll / PULT_HOECHST_KMH) * 0.9
    this.bremsHebel.rotation.x = -0.4 + this.bremse * 0.4
    // Wischer: hin und her, etwa einmal in 1,6 s, in Ruhe flach
    if (this.wischer || this.wischerZeit % 1.6 > 0.02) this.wischerZeit += dt
    if (!this.wischer && this.wischerZeit % 1.6 < 0.05) this.wischerZeit = 0
    const t = (this.wischerZeit % 1.6) / 1.6
    const ausschlag = (1 - Math.cos(t * Math.PI * 2)) / 2 * 1.75
    this.wischerArme.forEach((arm, i) => { arm.rotation.z = (i === 0 ? -1 : -1) * (Math.PI / 2 - 0.08) + ausschlag })
    this.licht.intensity = this.pultlicht ? 1.2 : 0
    // der Zeiger folgt sanft
    const winkel = Math.min(lage.v * 3.6, PULT_HOECHST_KMH + 5)
    this.zeigerWinkel += (winkel - this.zeigerWinkel) * Math.min(1, dt * 6)
    // Anzeigen etwa achtmal pro Sekunde neu
    const jetzt = performance.now()
    if (jetzt - this.gemalt > 120) {
      this.gemalt = jetzt
      for (const a of this.anzeigen) {
        const c = a.lw.getContext('2d')!
        c.save()
        c.fillStyle = FARBE.anzeige; c.fillRect(0, 0, a.lw.width, a.lw.height)
        c.globalAlpha = this.pultlicht ? 1 : 0.75
        a.malen(c, lage)
        c.restore()
        a.tex.needsUpdate = true
      }
    }
  }

  /* ---------- Anzeigen ---------- */

  private streckeMalen(c: CanvasRenderingContext2D, l: PultLage) {
    const gefahren = Math.abs(l.s - (l.richtung > 0 ? l.anfang : l.ende))
    const rest = Math.max(0, l.richtung > 0 ? l.ende - l.s : l.s - l.anfang)
    kopf(c, 'Strecke')
    c.font = 'bold 34px Helvetica, Arial, sans-serif'; c.fillStyle = FARBE.schrift
    c.fillText(kuerzen(c, l.richtung > 0 ? l.von : l.nach, 560), 32, 118)
    c.fillStyle = FARBE.grau; c.font = '28px Helvetica, Arial, sans-serif'; c.fillText('nach', 32, 158)
    c.font = 'bold 34px Helvetica, Arial, sans-serif'; c.fillStyle = FARBE.schrift
    c.fillText(kuerzen(c, l.richtung > 0 ? l.nach : l.von, 560), 32, 198)
    // Fortschritt
    const anteil = gefahren / Math.max(1, gefahren + rest)
    c.fillStyle = '#26364d'; c.fillRect(32, 236, 576, 14)
    c.fillStyle = FARBE.blau; c.fillRect(32, 236, 576 * anteil, 14)
    c.font = '28px Helvetica, Arial, sans-serif'; c.fillStyle = FARBE.schrift
    c.fillText(`gefahren ${km(gefahren)}`, 32, 296)
    c.textAlign = 'right'; c.fillText(`noch ${km(rest)}`, 608, 296); c.textAlign = 'left'
    c.fillStyle = FARBE.grau; c.font = '24px Helvetica, Arial, sans-serif'
    c.fillText(`${new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })} · gemessen entlang der gezeichneten Strecke`, 32, 340)
  }

  private tachoMalen(c: CanvasRenderingContext2D, l: PultLage) {
    const mx = 210, my = 200, r = 150
    const winkel = (kmh: number) => Math.PI * 0.75 + (kmh / PULT_HOECHST_KMH) * Math.PI * 1.5
    c.lineWidth = 14; c.strokeStyle = '#26364d'
    c.beginPath(); c.arc(mx, my, r, winkel(0), winkel(PULT_HOECHST_KMH)); c.stroke()
    c.strokeStyle = FARBE.blau
    c.beginPath(); c.arc(mx, my, r, winkel(0), winkel(Math.max(0.01, this.zeigerWinkel))); c.stroke()
    // Teilung
    c.fillStyle = FARBE.schrift; c.font = 'bold 26px Helvetica, Arial, sans-serif'; c.textAlign = 'center'
    for (let k = 0; k <= PULT_HOECHST_KMH; k += 20) {
      const w = winkel(k)
      c.strokeStyle = FARBE.schrift; c.lineWidth = k % 40 ? 2 : 4
      c.beginPath(); c.moveTo(mx + Math.cos(w) * (r - 22), my + Math.sin(w) * (r - 22)); c.lineTo(mx + Math.cos(w) * (r - 8), my + Math.sin(w) * (r - 8)); c.stroke()
      if (k % 40 === 0) c.fillText(String(k), mx + Math.cos(w) * (r - 48), my + Math.sin(w) * (r - 48) + 9)
    }
    // gewählte Geschwindigkeit als Marke
    if (l.quelle === 'simulation') {
      const w = winkel(this.soll)
      c.fillStyle = FARBE.gelb
      c.beginPath(); c.arc(mx + Math.cos(w) * (r + 4), my + Math.sin(w) * (r + 4), 9, 0, Math.PI * 2); c.fill()
    }
    // Zeiger
    const w = winkel(this.zeigerWinkel)
    c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.lineCap = 'round'
    c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + Math.cos(w) * (r - 30), my + Math.sin(w) * (r - 30)); c.stroke()
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(mx, my, 10, 0, Math.PI * 2); c.fill()
    const zahl = Math.round(l.v * 3.6)
    c.font = `bold ${zahl >= 1000 ? 44 : 64}px Helvetica, Arial, sans-serif`; c.fillText(zahl.toLocaleString('de-CH'), mx, my + 100)
    c.font = '24px Helvetica, Arial, sans-serif'; c.fillStyle = FARBE.grau; c.fillText('km/h', mx, my + 130)
    // rechts: Herkunft des Tempos, Wahl und Bremse
    c.textAlign = 'left'
    const quelle = { simulation: 'SIMULATION', gps: 'GPS', probe: 'PROBEFAHRT' }[l.quelle]
    c.fillStyle = l.quelle === 'gps' ? '#7fd38a' : FARBE.gelb; c.font = 'bold 26px Helvetica, Arial, sans-serif'
    c.fillText(quelle, 410, 60)
    c.fillStyle = FARBE.grau; c.font = '24px Helvetica, Arial, sans-serif'
    if (l.quelle === 'simulation') {
      c.fillText('gewählt', 410, 120)
      c.fillStyle = FARBE.schrift; c.font = 'bold 40px Helvetica, Arial, sans-serif'; c.fillText(`${this.soll} km/h`, 410, 162)
      c.fillStyle = FARBE.grau; c.font = '24px Helvetica, Arial, sans-serif'; c.fillText('Bremse', 410, 222)
      c.fillStyle = this.bremse ? FARBE.karmin : FARBE.schrift; c.font = 'bold 34px Helvetica, Arial, sans-serif'
      c.fillText(kuerzen(c, ['gelöst', 'bremst', 'Schnellbremse'][this.bremse], 220), 410, 264)
    } else {
      c.fillText(l.quelle === 'gps' ? 'aus dem Standort,' : 'im Zeitraffer', 410, 120)
      c.fillText(l.quelle === 'gps' ? 'entlang der Strecke' : 'der Probefahrt', 410, 150)
      c.fillText('Hebel gesperrt', 410, 222)
    }
  }

  private voranMalen(c: CanvasRenderingContext2D, l: PultLage) {
    kopf(c, 'Voraus')
    const vor = l.ankuendigungen
      .map((a) => ({ ...a, d: (a.s - l.s) * l.richtung }))
      .filter((a) => a.d > 0)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
    if (!vor.length) {
      c.fillStyle = FARBE.grau; c.font = '28px Helvetica, Arial, sans-serif'; c.fillText('Nichts mehr bis zum Ende des Wegs', 32, 130)
      return
    }
    vor.forEach((a, i) => {
      const y = 110 + i * 84
      c.strokeStyle = FARBE.blau; c.fillStyle = FARBE.blau; c.lineWidth = 4
      if (a.art === 'tunnel') { c.beginPath(); c.arc(56, y + 6, 20, Math.PI, 0); c.lineTo(76, y + 26); c.moveTo(36, y + 6); c.lineTo(36, y + 26); c.stroke() }
      else if (a.art === 'bruecke') { c.beginPath(); c.moveTo(30, y - 8); c.lineTo(82, y - 8); c.moveTo(38, y + 26); c.quadraticCurveTo(56, y - 8, 74, y + 26); c.stroke() }
      else { c.beginPath(); c.arc(56, y + 8, 16, 0, Math.PI * 2); c.stroke() }
      c.fillStyle = FARBE.schrift; c.font = 'bold 34px Helvetica, Arial, sans-serif'; c.fillText(km(a.d), 110, y + 4)
      c.fillStyle = FARBE.grau; c.font = '26px Helvetica, Arial, sans-serif'; c.fillText(kuerzen(c, a.name, 490), 110, y + 36)
    })
  }

  entsorgen() {
    this.szene.traverse((o) => {
      const n = o as THREE.Mesh
      n.geometry?.dispose()
      const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : []
      for (const m of mats as Array<THREE.Material & { map?: THREE.Texture }>) { m.map?.dispose(); m.dispose() }
    })
    for (const a of this.anzeigen) a.tex.dispose()
  }
}

/* ---------- kleine Zeichnungen ---------- */

function kopf(c: CanvasRenderingContext2D, text: string) {
  c.fillStyle = FARBE.grau; c.font = 'bold 24px Helvetica, Arial, sans-serif'; c.textAlign = 'left'
  c.fillText(text.toUpperCase(), 32, 50)
  c.fillStyle = '#26364d'; c.fillRect(32, 64, 576, 2)
}

/** «850 m», «2,4 km» */
function km(m: number) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0).replace('.', ',')} km`
}

function kuerzen(c: CanvasRenderingContext2D, text: string, breite: number) {
  if (c.measureText(text).width <= breite) return text
  let t = text
  while (t.length > 1 && c.measureText(`${t}…`).width > breite) t = t.slice(0, -1)
  return `${t}…`
}

function dreieck(c: CanvasRenderingContext2D, farbe: string) {
  c.strokeStyle = farbe; c.lineWidth = 9; c.lineJoin = 'round'
  c.beginPath(); c.moveTo(64, 26); c.lineTo(104, 98); c.lineTo(24, 98); c.closePath(); c.stroke()
  c.fillStyle = farbe; c.fillRect(60, 50, 8, 28); c.fillRect(60, 84, 8, 8)
}
function lautsprecher(c: CanvasRenderingContext2D, farbe: string) {
  c.fillStyle = farbe; c.beginPath(); c.moveTo(28, 52); c.lineTo(46, 52); c.lineTo(68, 32); c.lineTo(68, 96); c.lineTo(46, 76); c.lineTo(28, 76); c.closePath(); c.fill()
  c.strokeStyle = farbe; c.lineWidth = 6
  c.beginPath(); c.arc(70, 64, 18, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(70, 64, 32, -0.9, 0.9); c.stroke()
}
function horn(c: CanvasRenderingContext2D, farbe: string) {
  c.fillStyle = farbe
  c.beginPath(); c.moveTo(22, 54); c.lineTo(58, 54); c.lineTo(100, 32); c.lineTo(100, 96); c.lineTo(58, 74); c.lineTo(22, 74); c.closePath(); c.fill()
}
function sonne(c: CanvasRenderingContext2D, farbe: string) {
  c.strokeStyle = farbe; c.lineWidth = 7
  c.beginPath(); c.arc(64, 64, 18, 0, Math.PI * 2); c.stroke()
  for (let i = 0; i < 8; i++) {
    const w = (i / 8) * Math.PI * 2
    c.beginPath(); c.moveTo(64 + Math.cos(w) * 30, 64 + Math.sin(w) * 30); c.lineTo(64 + Math.cos(w) * 44, 64 + Math.sin(w) * 44); c.stroke()
  }
}
function wischerZeichen(c: CanvasRenderingContext2D, farbe: string) {
  c.strokeStyle = farbe; c.lineWidth = 7; c.lineCap = 'round'
  c.beginPath(); c.arc(64, 100, 56, Math.PI * 1.15, Math.PI * 1.85); c.stroke()
  c.beginPath(); c.moveTo(64, 100); c.lineTo(36, 42); c.stroke()
}
