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
  | 'schnellbremse' | 'zuggeraeusch' | 'daemmerung'

/** Was ein Element tut und wie es heisst (als Tooltip und für Bildschirmleser) */
const NAMEN: Record<Aktion, string> = {
  sollPlus: 'Geschwindigkeit wählen: schneller (Pfeil hoch)', sollMinus: 'Geschwindigkeit wählen: langsamer (Pfeil runter)',
  bremsePlus: 'Bremse: stärker (B)', bremseMinus: 'Bremse: lösen (0)', horn: 'Signalhorn (H)', stirnlicht: 'Stirnlicht (L)',
  pultlicht: 'Pultbeleuchtung (P)', wischer: 'Scheibenwischer (W)', schnellbremse: 'Schnellbremse (Leertaste)',
  zuggeraeusch: 'Zuggeräusch ein, aus (T)', daemmerung: 'Dämmerung ein, aus (N)',
}

export class Fuehrerpult {
  readonly gruppe = new THREE.Group()
  /** der Führerraum um das Pult: Boden, Seitenwände mit Fenster, Decke, Rückwand mit Tür, Stuhl; nur in der Brille, auf
   *  dem Bildschirm sähe man ihn nicht und er verdeckte nur die Sicht zur Seite */
  readonly raum = new THREE.Group()
  readonly szene = new THREE.Scene()
  readonly kamera = new THREE.PerspectiveCamera(60, 1, 0.05, 20)
  /** gewählte Geschwindigkeit km/h, Bremse 0 gelöst, 1 bremsen, 2 Schnellbremse; v simuliert in m/s */
  soll = 80
  bremse = 0
  /** die Wahl vor der Schnellbremse, damit Lösen wieder dorthin fährt */
  private vorBremse = 80
  v = 0
  stirnlicht = false
  pultlicht = true
  wischer = false
  /** Dämmerungsstimmung (Michael, 2026-10-13): Relief.tsx dunkelt die Landschaft ab */
  daemmerung = false
  /** 0 hell, 1 dunkel (Tunnel oder Dämmerung): dann leuchten die Tasten, das Pultlicht ist heller */
  nacht = 0
  private leuchten: THREE.MeshBasicMaterial[] = []
  /** wird gesetzt, sobald das Tempo nicht von hier kommt (GPS, Probefahrt) */
  quelle: TempoQuelle = 'simulation'
  private ziele: Array<{ netz: THREE.Mesh; aktion: Aktion; grund: THREE.Color }> = []
  private ueber: THREE.Mesh | null = null
  private sollHebel = new THREE.Group()
  private bremsHebel = new THREE.Group()
  private wischerArme: THREE.Group[] = []
  private wischerZeit = 0
  private licht = new THREE.PointLight('#fff4e0', 0, 3, 1)
  private himmel = new THREE.HemisphereLight('#ffffff', '#5c6370', 1.4)
  private sonne = new THREE.DirectionalLight('#ffffff', 1.2)
  private anzeigen: Array<{ lw: HTMLCanvasElement; tex: THREE.CanvasTexture; malen: (g: CanvasRenderingContext2D, l: PultLage) => void }> = []
  private gemalt = -Infinity
  private zeigerWinkel = 0
  private zuggeraeuschAn = audioLesen().zuggeraeusch

  constructor() {
    this.szene.add(this.gruppe)
    this.szene.add(this.himmel, this.sonne)
    this.sonne.position.set(0.3, 1, 0.6)
    this.licht.position.set(0, 0.3, -0.4)
    this.gruppe.add(this.licht)
    this.bauen()
    this.raumBauen()
    this.raum.visible = false
    this.gruppe.add(this.raum)
  }

  /** Tageslicht im Führerstand, 1 draussen, kleiner im Tunnel: dort leuchten die Anzeigen, das Pultlicht hilft */
  umgebung(f: number) {
    this.himmel.intensity = 1.4 * f
    this.sonne.intensity = 1.2 * f
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
    kippen: number, gross = 0.075, ort: THREE.Object3D = this.gruppe) {
    const halter = new THREE.Group()
    halter.position.set(x, y, z)
    halter.rotation.x = kippen
    ort.add(halter)
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
    // hinterleuchtetes Zeichen, nur im Dunkeln sichtbar; fängt keinen Klick ab
    const leuchte = new THREE.MeshBasicMaterial({ color: '#ffd9a0', map: this.leinwand(128, 128, (g) => { g.shadowColor = '#ffb347'; g.shadowBlur = 16; zeichen(g); zeichen(g) }), transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const glas = new THREE.Mesh(new THREE.PlaneGeometry(gross, gross), leuchte)
    glas.rotation.x = -Math.PI / 2
    glas.position.y = 0.0215
    glas.raycast = () => {}
    halter.add(glas)
    this.leuchten.push(leuchte)
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
    this.kasten(2.26, 0.3, 0.14, FARBE.pultHell, 0, 0, 0, 0, konsole)
    // Blendschutz über den Anzeigen
    this.kasten(2.36, 0.035, 0.22, FARBE.pult, 0, 0.17, 0.02, 0, konsole)
    // Seitenteile links und rechts, niedrig, damit die Tasten an der Konsole frei bleiben
    this.kasten(0.24, 0.2, 0.5, FARBE.pult, -1.08, -0.56, -0.7)
    this.kasten(0.24, 0.2, 0.5, FARBE.pult, 1.08, -0.56, -0.7)
    // Fensterrahmen dunkelgrau wie das Pult (Michael, 2026-10-13: «aerodynamischer», «etwas dicker und … zur Kamera hin
    // gegen oben abdrehen»): jede Säule ein flaches Band mit gerundetem Rand, unten am Pult schmal, oben breit, die Fläche
    // immer zum Fahrer gedreht; oben biegt sie nach vorn zum Fahrer hin ins Dach
    const auge = new THREE.Vector3(0, 0, 0)
    for (const seite of [-1, 1]) {
      const bogen = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(seite * 1.18, -0.2, -1.14),
        new THREE.Vector3(seite * 1.24, 0.8, -1.14),
        new THREE.Vector3(seite * 0.98, 1.22, -0.6))
      const teile = 32, rund = 16
      const ecken: number[] = [], index: number[] = []
      const c = new THREE.Vector3(), tan = new THREE.Vector3(), zum = new THREE.Vector3(), quer = new THREE.Vector3()
      for (let i = 0; i <= teile; i++) {
        const t = i / teile
        bogen.getPoint(t, c)
        bogen.getTangent(t, tan)
        zum.subVectors(auge, c).normalize()
        quer.crossVectors(tan, zum).normalize()
        zum.crossVectors(quer, tan).normalize()
        const breit = 0.09 + 0.09 * t, tief = 0.04
        for (let j = 0; j < rund; j++) {
          const w = (j / rund) * Math.PI * 2
          ecken.push(
            c.x + Math.cos(w) * breit * quer.x + Math.sin(w) * tief * zum.x,
            c.y + Math.cos(w) * breit * quer.y + Math.sin(w) * tief * zum.y,
            c.z + Math.cos(w) * breit * quer.z + Math.sin(w) * tief * zum.z)
          if (i < teile) {
            const k = i * rund + j, n = i * rund + (j + 1) % rund
            index.push(k, n, k + rund, n, n + rund, k + rund)
          }
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(ecken, 3))
      geo.setIndex(index)
      geo.computeVertexNormals()
      const m = this.material(FARBE.pult)
      m.side = THREE.DoubleSide
      g.add(new THREE.Mesh(geo, m))
    }
    // Dach: runde Kante über dem Fahrer, wo die Säulen enden, dahinter eine Platte bis zur Scheibe
    const dach = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.15, 20), this.material(FARBE.pult))
    dach.geometry.scale(1, 1, 0.5)
    dach.rotation.z = Math.PI / 2
    dach.position.set(0, 1.22, -0.6)
    g.add(dach)
    this.kasten(2.3, 0.04, 0.6, FARBE.pult, 0, 1.26, -0.88)
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

    // Tasten in der Mitte, vor den Anzeigen, gross und nah (Michael, 2026-10-13: «die Knöpfe sind klein und weit weg»), auf
    // einer dunklen Leiste wie in seinem Vorbild
    const kippen = 0.2, y = -0.49, z = -0.83, gross = 0.105, abstand = 0.13
    const leiste = this.kasten(6 * abstand + 0.03, 0.012, gross + 0.04, FARBE.blende, 0, y - 0.008, z, kippen)
    leiste.renderOrder = -1
    const reihe: Array<[(c: CanvasRenderingContext2D) => void, string, Aktion]> = [
      [(c) => dreieck(c, '#ffffff'), '#b3122f', 'schnellbremse'], [(c) => lautsprecher(c, FARBE.schrift), FARBE.schwarz, 'zuggeraeusch'],
      [(c) => horn(c, FARBE.schrift), FARBE.schwarz, 'horn'], [(c) => sonne(c, FARBE.schrift), FARBE.schwarz, 'stirnlicht'],
      [(c) => wischerZeichen(c, FARBE.schrift), FARBE.schwarz, 'wischer'], [(c) => mond(c, FARBE.schrift), FARBE.schwarz, 'daemmerung']]
    reihe.forEach(([zeichen, grund, aktion], i) => this.taste(zeichen, grund, (i - 2.5) * abstand, y, z, aktion, kippen, gross))
    // neben den Anzeigen je drei Tasten übereinander: links Pultlicht, Signalhorn (gelb), Dämmerung; rechts Wischer,
    // Stirnlicht, Zuggeräusch
    const seitlich: Array<[number, (c: CanvasRenderingContext2D) => void, string, Aktion]> = [
      [-1, (c) => sonne(c, FARBE.schrift), FARBE.schwarz, 'pultlicht'], [-1, (c) => horn(c, '#1d2229'), FARBE.gelb, 'horn'],
      [-1, (c) => mond(c, FARBE.schrift), FARBE.schwarz, 'daemmerung'], [1, (c) => wischerZeichen(c, FARBE.schrift), FARBE.schwarz, 'wischer'],
      [1, (c) => sonne(c, FARBE.schrift), FARBE.schwarz, 'stirnlicht'], [1, (c) => lautsprecher(c, FARBE.schrift), FARBE.schwarz, 'zuggeraeusch']]
    seitlich.forEach(([seite, zeichen, grund, aktion], i) =>
      this.taste(zeichen, grund, seite * 1.02, 0.095 - (i % 3) * 0.095, 0.07, aktion, Math.PI / 2, 0.082, konsole))

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
    basis.position.set(x * 1.25, -0.56, -0.56)
    basis.rotation.x = 0.2
    // grösser als zuerst, damit man sie auf dem Handy trifft
    basis.scale.setScalar(1.15)
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

  /**
   * Der Führerraum (Michael, 2026-10-13: «Im Rücken ist der Führerraum geschlossen. Es hat dort eine Tür, die nicht
   * interaktiv bedienbar sein soll. Links und rechts … Seitenwände, oben eine Decke … Mit einem Stuhl»). Masse geschätzt,
   * kein bestimmtes Fahrzeug; das Auge sitzt etwa 1,25 m über dem Boden.
   */
  private raumBauen() {
    const r = this.raum
    const BODEN = -1.25, DECKE = 1.28, SEITE = 1.32, HINTEN = 1.7, VORN = -1.2
    const wand = '#c9ccd1', unten = FARBE.pultHell, dunkel = '#2b323c'
    const k = (b: number, h: number, t: number, f: string, x: number, y: number, z: number) => this.kasten(b, h, t, f, x, y, z, 0, r)
    // Boden mit dunklem Belag
    k(2 * SEITE, 0.04, HINTEN - VORN, '#3a3f46', 0, BODEN - 0.02, (HINTEN + VORN) / 2)
    // Decke, vorn bis zur Dachkante des Fensters
    k(2 * SEITE, 0.04, HINTEN + 0.75, wand, 0, DECKE, (HINTEN - 0.75) / 2)
    // Seitenwände: unten geschlossen, darüber ein Fenster, hinten ganz geschlossen
    for (const x of [-SEITE, SEITE]) {
      k(0.05, 1.2, HINTEN - VORN, unten, x, BODEN + 0.6, (HINTEN + VORN) / 2)
      k(0.05, DECKE - 0.85, HINTEN - VORN, wand, x, (DECKE + 0.85) / 2, (HINTEN + VORN) / 2)
      // Fensterrahmen der Seitenfenster, das Fenster selbst offen
      k(0.07, 0.06, 1.1, dunkel, x, -0.05, 0.05)
      k(0.07, 0.06, 1.1, dunkel, x, 0.85, 0.05)
      k(0.07, 0.96, 0.06, dunkel, x, 0.4, -0.5)
      k(0.07, 0.96, 0.06, dunkel, x, 0.4, 0.6)
      // hinter dem Fenster geschlossen bis zur Rückwand
      k(0.05, 0.9, HINTEN - 0.63, wand, x, 0.4, (HINTEN + 0.63) / 2)
      // vor dem Fenster bis zur A-Säule
      k(0.05, 0.9, 0.7, wand, x, 0.4, -0.88)
    }
    // Rückwand mit Tür (nicht zu öffnen)
    k(2 * SEITE, DECKE - BODEN, 0.05, wand, 0, (DECKE + BODEN) / 2, HINTEN)
    const tuer = new THREE.Group()
    tuer.position.set(0.25, BODEN, HINTEN - 0.035)
    r.add(tuer)
    this.kasten(0.86, 2.0, 0.03, '#8a929c', 0, 1.0, 0, 0, tuer)
    this.kasten(0.92, 2.04, 0.02, dunkel, 0, 1.01, 0.012, 0, tuer)
    this.kasten(0.4, 0.5, 0.035, '#1e252e', 0, 1.55, 0, 0, tuer)
    const griff = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 10), this.material('#d5d5d0'))
    griff.rotation.z = Math.PI / 2
    griff.position.set(-0.32, 1.02, -0.035)
    tuer.add(griff)
    // Stuhl: Fuss, Sitz, Lehne mit Kopfstütze, Armlehnen
    const stuhl = new THREE.Group()
    stuhl.position.set(0, BODEN, 0.35)
    r.add(stuhl)
    const fuss = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.22, 0.45, 16), this.material(dunkel))
    fuss.position.y = 0.225
    stuhl.add(fuss)
    this.kasten(0.52, 0.1, 0.5, '#30363f', 0, 0.5, 0, 0, stuhl)
    const lehne = this.kasten(0.5, 0.7, 0.1, '#30363f', 0, 0.9, 0.27, 0, stuhl)
    lehne.rotation.x = 0.12
    this.kasten(0.3, 0.18, 0.08, '#30363f', 0, 1.38, 0.33, 0, stuhl)
    for (const x of [-0.29, 0.29]) this.kasten(0.06, 0.05, 0.38, dunkel, x, 0.72, 0.02, 0, stuhl)
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
        // ein zweites Mal löst sie wieder (Michael, 2026-10-13: «Man soll aber auch wieder fahren können»)
        if (this.bremse === 2) { this.losfahren(); return `Schnellbremse gelöst, ${this.soll} km/h` }
        if (this.soll) this.vorBremse = this.soll
        this.bremse = 2; this.soll = 0; return 'Schnellbremse – nochmals drücken löst sie'
      case 'horn': void audioKontext()?.resume(); signalhorn(); return 'Signalhorn'
      case 'stirnlicht': this.stirnlicht = !this.stirnlicht; return this.stirnlicht ? 'Stirnlicht an' : 'Stirnlicht aus'
      case 'pultlicht': this.pultlicht = !this.pultlicht; return this.pultlicht ? 'Pultbeleuchtung an' : 'Pultbeleuchtung aus'
      case 'wischer': this.wischer = !this.wischer; return this.wischer ? 'Scheibenwischer an' : 'Scheibenwischer aus'
      case 'daemmerung': this.daemmerung = !this.daemmerung; return this.daemmerung ? 'Dämmerung' : 'Tag'
      case 'zuggeraeusch': {
        void audioKontext()?.resume()
        this.zuggeraeuschAn = !audioLesen().zuggeraeusch
        audioSetzen({ zuggeraeusch: this.zuggeraeuschAn })
        return !audioLesen().an ? 'Töne sind in den Einstellungen aus' : this.zuggeraeuschAn ? 'Zuggeräusch an' : 'Zuggeräusch aus'
      }
    }
  }

  /** «Zug fahren»: Bremse lösen und wieder auf die Wahl von vorher, wenn keine gewählt ist */
  losfahren() {
    this.bremse = 0
    if (!this.soll) this.soll = this.vorBremse || 80
  }

  /** «Anhalten»: auf 0 km/h und bremsen */
  anhalten() {
    if (this.soll) this.vorBremse = this.soll
    this.soll = 0
    this.bremse = 1
  }

  /** Tastatur auf dem Bildschirm; true, wenn die Taste etwas tat */
  taste_(code: string): string | null {
    const zu: Record<string, Aktion> = { ArrowUp: 'sollPlus', ArrowDown: 'sollMinus', KeyB: 'bremsePlus', Digit0: 'bremseMinus',
      Space: 'schnellbremse', KeyH: 'horn', KeyL: 'stirnlicht', KeyP: 'pultlicht', KeyW: 'wischer', KeyT: 'zuggeraeusch',
      KeyN: 'daemmerung' }
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
    // im Dunkeln leuchten die Zeichen der Tasten, das Pultlicht ist heller
    // im Dunkeln nur noch ein schwaches Pultlicht, damit die leuchtenden Zeichen und Anzeigen hervorstechen (Michael, 2026-10-13)
    this.licht.intensity = this.pultlicht ? 1.2 * (1 - 0.92 * this.nacht) : 0
    for (const m of this.leuchten) m.opacity = this.pultlicht ? this.nacht : 0
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
    // rechts oben: Herkunft des Tempos, Wahl und Bremse, klein
    c.textAlign = 'left'
    const quelle = { simulation: 'SIMULATION', gps: 'GPS', probe: 'PROBEFAHRT' }[l.quelle]
    c.fillStyle = l.quelle === 'gps' ? '#7fd38a' : FARBE.gelb; c.font = 'bold 24px Helvetica, Arial, sans-serif'
    c.fillText(quelle, 404, 48)
    c.fillStyle = FARBE.grau; c.font = '22px Helvetica, Arial, sans-serif'
    if (l.quelle === 'simulation') {
      c.fillText(`gewählt ${this.soll} km/h`, 404, 80)
      c.fillStyle = this.bremse ? FARBE.karmin : FARBE.grau
      c.fillText(kuerzen(c, this.bremse === 2 ? 'Schnellbremse' : `Bremse ${['gelöst', 'bremst'][this.bremse]}`, 226), 404, 108)
    } else {
      c.fillText(l.quelle === 'gps' ? 'aus dem Standort' : 'Zeitraffer', 404, 80)
      c.fillText('Hebel gesperrt', 404, 108)
    }
    c.fillStyle = '#26364d'; c.fillRect(404, 126, 220, 2)
    // darunter die Vorschau (Michael, 2026-10-13, nach seinem Vorbild): Pfeil, Entfernung und Art des Nächsten voraus
    const naechstes = vorListe(l)[0]
    if (!naechstes) {
      c.fillStyle = FARBE.grau; c.font = '24px Helvetica, Arial, sans-serif'
      c.fillText('Nichts mehr', 404, 180); c.fillText('voraus', 404, 210)
      return
    }
    c.fillStyle = FARBE.blau
    c.beginPath(); c.moveTo(426, 148); c.lineTo(446, 172); c.lineTo(434, 172); c.lineTo(434, 196); c.lineTo(418, 196); c.lineTo(418, 172)
    c.lineTo(406, 172); c.closePath(); c.fill()
    c.fillStyle = FARBE.schrift; c.font = 'bold 40px Helvetica, Arial, sans-serif'; c.fillText(km(naechstes.d), 460, 190)
    zeichen(c, naechstes.art, 426, 238)
    c.fillStyle = FARBE.schrift; c.font = '24px Helvetica, Arial, sans-serif'
    const [z1, z2] = zweiZeilen(c, naechstes.name, 220)
    c.fillText(z1, 404, 296)
    if (z2) c.fillText(z2, 404, 326)
  }

  private voranMalen(c: CanvasRenderingContext2D, l: PultLage) {
    kopf(c, 'Voraus')
    const vor = vorListe(l).slice(0, 3)
    if (!vor.length) {
      c.fillStyle = FARBE.grau; c.font = '28px Helvetica, Arial, sans-serif'; c.fillText('Nichts mehr bis zum Ende des Wegs', 32, 130)
      return
    }
    // eine Linie durch die Zeichen, wie die Strecke voraus (Michael, 2026-10-13, nach seinem Vorbild)
    c.strokeStyle = FARBE.blau; c.globalAlpha *= 0.55; c.lineWidth = 4
    c.beginPath(); c.moveTo(56, 84); c.lineTo(56, vor.length > 1 ? 118 + (vor.length - 1) * 84 : 150); c.stroke()
    c.globalAlpha /= 0.55
    vor.forEach((a, i) => {
      const y = 110 + i * 84
      zeichen(c, a.art, 56, y + 8)
      c.fillStyle = FARBE.schrift; c.font = 'bold 34px Helvetica, Arial, sans-serif'; c.fillText(km(a.d), 110, y + 4)
      c.fillStyle = FARBE.grau; c.font = '26px Helvetica, Arial, sans-serif'; c.fillText(kuerzen(c, a.name, 490), 110, y + 36)
      if (i < vor.length - 1) { c.fillStyle = '#26364d'; c.fillRect(110, y + 56, 498, 2) }
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

/** was voraus kommt, das Nächste zuerst, mit Entfernung d in Metern */
function vorListe(l: PultLage) {
  return l.ankuendigungen.map((a) => ({ ...a, d: (a.s - l.s) * l.richtung })).filter((a) => a.d > 0).sort((a, b) => a.d - b.d)
}

/** das Zeichen für Tunnel, Brücke oder Bahnhof um (x, y), auf dem Grund der Anzeige, damit die Linie darunter verschwindet */
function zeichen(c: CanvasRenderingContext2D, art: Ankuendigung['art'], x: number, y: number) {
  c.fillStyle = FARBE.anzeige
  c.beginPath(); c.arc(x, y, 26, 0, Math.PI * 2); c.fill()
  c.strokeStyle = FARBE.blau; c.fillStyle = FARBE.blau; c.lineWidth = 4
  if (art === 'tunnel') { c.beginPath(); c.arc(x, y - 2, 20, Math.PI, 0); c.lineTo(x + 20, y + 18); c.moveTo(x - 20, y - 2); c.lineTo(x - 20, y + 18); c.stroke() }
  else if (art === 'bruecke') { c.beginPath(); c.moveTo(x - 26, y - 16); c.lineTo(x + 26, y - 16); c.moveTo(x - 18, y + 18); c.quadraticCurveTo(x, y - 16, x + 18, y + 18); c.stroke() }
  else { c.beginPath(); c.arc(x, y, 16, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill() }
}

/** ein Name auf höchstens zwei Zeilen, an Leerzeichen oder Bindestrich getrennt */
function zweiZeilen(c: CanvasRenderingContext2D, text: string, breite: number): [string, string] {
  if (c.measureText(text).width <= breite) return [text, '']
  const teile = text.split(/(?<=[\s-])/)
  let erste = ''
  while (teile.length && c.measureText(erste + teile[0]).width <= breite) erste += teile.shift()
  if (!erste) return [kuerzen(c, text, breite), '']
  return [erste.trim(), kuerzen(c, teile.join('').trim(), breite)]
}

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
function mond(c: CanvasRenderingContext2D, farbe: string) {
  c.fillStyle = farbe
  c.beginPath(); c.arc(64, 64, 30, 0, Math.PI * 2); c.fill()
  c.globalCompositeOperation = 'destination-out'
  c.beginPath(); c.arc(80, 52, 26, 0, Math.PI * 2); c.fill()
  c.globalCompositeOperation = 'source-over'
}

function wischerZeichen(c: CanvasRenderingContext2D, farbe: string) {
  c.strokeStyle = farbe; c.lineWidth = 7; c.lineCap = 'round'
  c.beginPath(); c.arc(64, 100, 56, Math.PI * 1.15, Math.PI * 1.85); c.stroke()
  c.beginPath(); c.moveTo(64, 100); c.lineTo(36, 42); c.stroke()
}
