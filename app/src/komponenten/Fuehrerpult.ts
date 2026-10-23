import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { audioKontext, audioLesen, audioSetzen, signalhorn } from '../audio'

/**
 * Das Pult im Führerstand (Michael, 2026-10-12: «Überarbeite den bestehenden 3D-Führerstand anhand des Referenzbildes …
 * neutraler Schweizer Führerstand ohne Markenlogos»): Fensterrahmen mit Wischern, drei Anzeigen (Strecke, Tacho,
 * Vorankündigungen), zwei Hebel (Bremse, Geschwindigkeitswahl), Knöpfe für Signalhorn, Stirnlicht, Pultlicht, Wischer,
 * Zuggeräusch und Schnellbremse. Vereinfacht, kein Abbild eines bestimmten Fahrzeugs. Seit 2026-10-23 nach Michaels Vorlage
 * (Bild eines Führerstands): oben ein Band mit Feldern und den Anzeigen, darunter zwei Konsolen mit den Hebeln und ein Sockel
 * mit dem Knüppel für die Sicht zur Seite, kantig und anthrazit.
 *
 * In Metern, das Auge im Ursprung, Blick nach -Z. Auf dem Bildschirm in einer eigenen Szene über der Landschaft
 * (szene, kamera), in der Brille in Originalgrösse vor dem Kopf (gruppe in die Welt gehängt).
 *
 * Tempo: in der Modellbahn simuliert (Hebel, Beschleunigen und Bremsen hier gerechnet); beim Fahren das Tempo aus dem
 * GPS-Standort (Hebel gesperrt), bei der Probefahrt das der Probefahrt; dort wählt der rechte Hebel deren Stufe, die Bremse
 * hält an (aussen.probe).
 */
export type TempoQuelle = 'simulation' | 'gps' | 'probe'

/** Probefahrt vom Pult aus (Michael, 2026-10-14: «alle Bedienelemente als Knöpfe auf dem Führerpult»): der Hebel rechts wählt
 *  die Stufe des Zeitraffers, die Bremse hält an, gelöst fährt der Zug weiter */
export interface PultSteuerung {
  /** die Stufen in km/h, aufsteigend */
  stufen: number[]
  stufe: () => number
  angehalten: () => boolean
  waehlen: (i: number) => void
  anhalten: (an: boolean) => void
}

export type MeldeArt = 'tunnel' | 'bruecke' | 'bahnhof' | 'bahnuebergang'

/** was ausserhalb des Pults liegt und doch am Pult bedient wird (Michael, 2026-10-14: «alle Knöpfe als reale Knöpfe im
 *  Führerraum»): Probefahrt, Höhe des Geländes, «Hinter den Zug», was gemeldet wird. Fehlt etwas, tut die Taste nichts. */
export interface PultAussen {
  probe?: PultSteuerung
  hoehe?: () => 1 | 2
  hoeheSetzen?: (f: 1 | 2) => void
  hinterZug?: () => void
  meldet?: (art: MeldeArt) => boolean
  meldenSetzen?: (art: MeldeArt, an: boolean) => void
  /** Blick zur Seite: 1 links, −1 rechts */
  seite?: (richtung: 1 | -1) => void
  /** das Vollbild schliessen; fehlt ausserhalb des Vollbilds */
  schliessen?: () => void
  /** Probefahrt: zurück an den Startbahnhof, angehalten */
  zumStart?: () => void
}

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

/** anthrazit ohne Blaustich wie in Michaels Vorlage (2026-10-23; vorher blaugrau #3b4655) */
const FARBE = {
  pult: '#3d4249', pultHell: '#4a4f57', feld: '#2e3237', schwarz: '#1e2125', blende: '#282c31',
  anzeige: '#141a22', schrift: '#e9eef5', blau: '#4f9cff', karmin: '#d63a55', gelb: '#f2c230', grau: '#8b96a6',
}
/** Tempo in km/h: Wahl in Schritten von 10 bis höchstens 220 (Michael, 2026-10-12: 160, 2026-10-13: 220) */
export const PULT_HOECHST_KMH = 220
const SCHRITT_KMH = 10
/** gerechnete Beschleunigung und Bremsung in m/s²: Annahmen für die Simulation, aus keiner Quelle; viel schneller als ein
 *  Zug, damit man nicht minutenlang wartet (Michael, 2026-10-14: «Die Beschleunigung muss … wesentlich schneller laufen»;
 *  vorher 0,5, 0,3, 0,8 und 1,4) */
const ANFAHREN_MS2 = 3, AUSROLLEN_MS2 = 1.5, BREMSEN_MS2 = 3, SCHNELLBREMSE_MS2 = 6
const BREMSE_TEXT = ['0', 'B', 'SB'] as const

type Aktion = 'sollPlus' | 'sollMinus' | 'bremsePlus' | 'bremseMinus' | 'horn' | 'stirnlicht' | 'pultlicht' | 'wischer'
  | 'schnellbremse' | 'zuggeraeusch' | 'daemmerung' | 'hinterZug' | 'hoehe1' | 'hoehe2' | 'tunnel' | 'bruecke' | 'bahnhof'
  | 'bahnuebergang' | 'sichtLinks' | 'sichtRechts' | 'schliessen' | 'zumStart'

/** Was ein Element tut und wie es heisst (als Tooltip und für Bildschirmleser) */
const NAMEN: Record<Aktion, string> = {
  sollPlus: 'Geschwindigkeit wählen: schneller (Pfeil hoch)', sollMinus: 'Geschwindigkeit wählen: langsamer (Pfeil runter)',
  bremsePlus: 'Bremse: stärker (B)', bremseMinus: 'Bremse: lösen (0)', horn: 'Signalhorn (H)', stirnlicht: 'Stirnlicht (L)',
  pultlicht: 'Pultbeleuchtung (P)', wischer: 'Scheibenwischer (W)', schnellbremse: 'Schnellbremse (Leertaste)',
  zuggeraeusch: 'Zuggeräusch ein, aus (T)', daemmerung: 'Dämmerung ein, aus (N)',
  hinterZug: 'Hinter den Zug (Z)', hoehe1: 'Höhe wie echt (1)', hoehe2: 'Höhe 2-fach (2)', tunnel: 'Tunnel melden ein, aus',
  bruecke: 'Brücken melden ein, aus', bahnhof: 'Bahnhöfe melden ein, aus', bahnuebergang: 'Bahnübergänge melden ein, aus',
  sichtLinks: 'Sicht nach links (Pfeil links)', sichtRechts: 'Sicht nach rechts (Pfeil rechts)', schliessen: 'Vollbild schliessen (Esc)',
  zumStart: 'Zum Startbahnhof (S)',
}
/** Fuss der Abdeckung über den Anzeigen, an der Unterkante des Fensters */
const HAUBE_FUSS_M = -0.19
/** gemeldete Arten ohne Fahrtmodus: alle an */
const MELDE_ARTEN: MeldeArt[] = ['tunnel', 'bruecke', 'bahnhof', 'bahnuebergang']

/** Kasten mit gerundeten Kanten; die Flächen bleiben Gruppen wie beim BoxGeometry (Deckel der Tasten mit Zeichen oben) */
function rund(b: number, h: number, t: number) {
  const r = Math.min(0.035, 0.45 * Math.min(b, h, t))
  return new RoundedBoxGeometry(b, h, t, 3, r)
}

/** Unterkante des Fensterrahmens; um sie wird er auf dem Bildschirm gestreckt */
const RAHMEN_FUSS_M = -0.2
/** Ebene für den Rahmen auf dem Bildschirm; 1 und 2 braucht WebXR für die Augen */
export const RAHMEN_EBENE = 3

export class Fuehrerpult {
  readonly gruppe = new THREE.Group()
  /** der Führerraum um das Pult: Boden, Seitenwände mit Fenster, Decke, Rückwand mit Tür, Stuhl; nur in der Brille, auf
   *  dem Bildschirm sähe man ihn nicht und er verdeckte nur die Sicht zur Seite */
  readonly raum = new THREE.Group()
  /** Fensterrahmen (Säulen, Dach): auf dem Bildschirm gestreckt, damit er am Rand des Bilds bleibt, in der Brille wie gebaut */
  readonly rahmen = new THREE.Group()
  /** Abdeckung über den Anzeigen, nur auf dem Bildschirm (Michael, 2026-10-14: «Das Steuerpult darf doch circa doppelt so hoch
   *  sein … die Abdeckung des Displays nach oben»), darauf Sicht links, Schliessen, Sicht rechts als Tasten */
  private haube = new THREE.Group()
  private haubeWand: THREE.Mesh | null = null
  private haubeKante: THREE.Mesh | null = null
  private haubeTasten = new THREE.Group()
  private schliessTaste: THREE.Object3D | null = null
  private sichtTasten: THREE.Object3D[] = []
  /** Höhe gibt es nur, wo sie sich ändern lässt, «Hinter den Zug» nicht in der Brille */
  private hoeheTasten: THREE.Object3D[] = []
  private hinterTaste: THREE.Object3D | null = null
  /** der Knüppel für die Sicht zur Seite und seine beiden Hälften zum Antippen */
  private knueppel = new THREE.Group()
  private knueppelZiele: THREE.Object3D[] = []
  private knueppelNeigung = 0
  /** Leuchtfelder im Band: rot bei Schnellbremse, gelb bei Bremse */
  private leuchtfelder: Array<{ m: THREE.MeshBasicMaterial; an: () => boolean; farbe: string }> = []
  /** in der Brille (setzt Relief.tsx je Bild): dort gibt es «Hinter den Zug» nicht */
  inBrille = false
  /** die Platte über dem Fahrer: auf dem Bildschirm verdeckte sie den Himmel, dort nur das runde Dach; in der Brille ganz */
  private dachPlatte: THREE.Object3D | null = null
  readonly szene = new THREE.Scene()
  readonly kamera = new THREE.PerspectiveCamera(60, 1, 0.05, 20)
  /** auf dem Bildschirm sieht man das Pult hoch von schräg oben (kamera), den Fensterrahmen aber gerade (rahmenKamera): sonst
   *  liefen die Säulen schräg zusammen; der Rahmen liegt dann auf der Ebene RAHMEN_EBENE */
  readonly rahmenKamera = new THREE.PerspectiveCamera(60, 1, 0.05, 20)
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
  /** die Bilder der drei Anzeigen (Strecke, Tacho, Voraus), auch für das Pult als Bild (Fuehrerbild.ts) */
  get anzeigeBilder(): THREE.Texture[] { return this.anzeigen.map((a) => a.tex) }
  /** wird gesetzt, sobald das Tempo nicht von hier kommt (GPS, Probefahrt) */
  quelle: TempoQuelle = 'simulation'
  /** was ausserhalb liegt; in der Probefahrt stellen die Hebel deren Tempo */
  aussen: { current: PultAussen | null } | null = null
  /** setzt den Zug an den Startbahnhof; false, wo das nicht geht (beim Fahren mit Standort) */
  zumStartAktion: (() => boolean) | null = null
  /** gemeldete Arten, wenn niemand ausserhalb sie kennt (Modellbahn) */
  private gemeldet = new Set<MeldeArt>(MELDE_ARTEN)
  /** Leuchten auf den Tasten, die einen Zustand haben: an, wenn der Zustand gilt */
  private zustaende: Array<{ m: THREE.MeshBasicMaterial; an: () => boolean }> = []
  private sollSkala: THREE.MeshBasicMaterial | null = null
  private skalaStufen: string | null = null
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

  /** uebergaenge: eine Taste für Bahnübergänge, nur wo sie gemeldet werden (Fahren) */
  private readonly uebergaenge: boolean

  constructor(uebergaenge = false) {
    this.uebergaenge = uebergaenge
    this.szene.add(this.gruppe)
    this.szene.add(this.himmel, this.sonne)
    for (const l of [this.himmel, this.sonne, this.licht]) l.layers.enable(RAHMEN_EBENE)
    this.rahmenKamera.layers.set(RAHMEN_EBENE)
    this.sonne.position.set(0.3, 1, 0.6)
    this.licht.position.set(0, 0.3, -0.4)
    this.gruppe.add(this.licht)
    this.bauen()
    this.raumBauen()
    this.raum.visible = false
    this.gruppe.add(this.raum)
    this.gruppe.add(this.rahmen)
  }

  /** den Rahmen strecken: sx in der Breite, sy in der Höhe über der Fensterkante (1, 1, false in der Brille) */
  rahmenStrecken(sx: number, sy: number, bildschirm = true) {
    // auf dem Bildschirm (gestreckt) mit eigener Kamera, in der Brille mit dem Rest
    const ebene = bildschirm ? RAHMEN_EBENE : 0
    if (this.rahmen.layers.mask !== 1 << ebene) this.rahmen.traverse((o) => o.layers.set(ebene))
    this.rahmen.scale.set(sx, sy, 1)
    this.rahmen.position.y = RAHMEN_FUSS_M * (1 - sy)
    if (this.dachPlatte) this.dachPlatte.visible = !bildschirm
  }

  /** die Abdeckung über den Anzeigen h Meter hoch, 0 ohne (Brille); die Wischer sitzen dann auf ihr */
  haubeSetzen(h: number) {
    this.haube.visible = h > 0
    if (this.haubeWand) { this.haubeWand.scale.y = Math.max(0.001, h); this.haubeWand.position.y = h / 2 }
    this.haubeKante?.position.setY(h)
    this.haubeTasten.position.y = h - 0.075
    for (const arm of this.wischerArme) {
      arm.position.y = h > 0 ? HAUBE_FUSS_M + h : -0.15
      arm.position.z = h > 0 ? -1.03 : -1.08
    }
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

  /** ein Kasten mit gerundeten Kanten (Michael, 2026-10-13: «es ist alles ziemlich kantig und eckig»), Radius bis 3,5 cm,
   *  bei dünnen Teilen 45 % der kleinsten Seite */
  private ecken: THREE.CanvasTexture | null = null

  private kasten(b: number, h: number, t: number, farbe: string, x: number, y: number, z: number, kippen = 0, ort: THREE.Object3D = this.gruppe) {
    const n = new THREE.Mesh(rund(b, h, t), this.material(farbe))
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
    kippen: number, gross = 0.075, ort: THREE.Object3D = this.gruppe, zustand?: () => boolean) {
    const halter = new THREE.Group()
    halter.position.set(x, y, z)
    halter.rotation.x = kippen
    ort.add(halter)
    this.kasten(gross + 0.014, 0.012, gross + 0.014, FARBE.schwarz, 0, 0, 0, 0, halter)
    const deckel = new THREE.Mesh(rund(gross, 0.018, gross), [
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
    // ein Leuchtstreifen vorne auf dem Rand: grün, solange die Taste eingeschaltet ist
    if (zustand) {
      const m = new THREE.MeshBasicMaterial({ color: '#3a4250', toneMapped: false })
      const led = new THREE.Mesh(new THREE.PlaneGeometry(gross * 0.6, 0.008), m)
      led.rotation.x = -Math.PI / 2
      led.position.set(0, 0.0135, gross / 2 + 0.0045)
      led.raycast = () => {}
      halter.add(led)
      this.zustaende.push({ m, an: zustand })
    }
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
    // nach Michaels Vorlage (2026-10-23, Bild eines Führerstands: «Dieser Führerstand würde mir sehr gefallen», «das Führerpult soll
    // diese dreidimensionale Ansicht übernehmen»): oben ein Band über die ganze Breite mit Feldern und drei Anzeigen, darunter eine
    // Stufe mit zwei Konsolen für die Hebel und einem Sockel mit Knüppel in der Mitte; flach, anthrazit, Masse geschätzt
    // die untere Stufe: Fläche vor dir, nach vorn leicht ansteigend, vorn eine senkrechte Blende
    this.kasten(2.4, 0.06, 0.7, FARBE.pult, 0, -0.56, -0.62, 0.2)
    this.kasten(2.4, 0.3, 0.06, FARBE.pultHell, 0, -0.74, -0.28)
    // das Band mit den Anzeigen, leicht zum Fahrer geneigt
    const konsole = new THREE.Group()
    konsole.position.set(0, -0.33, -0.95)
    konsole.rotation.x = -0.32
    g.add(konsole)
    this.kasten(2.1, 0.3, 0.14, FARBE.pultHell, 0, 0, 0, 0, konsole)
    // eine dunkle Fuge unter dem Band und ein schmaler Blendschutz darüber
    this.kasten(2.12, 0.025, 0.16, FARBE.schwarz, 0, -0.16, 0.0, 0, konsole)
    this.kasten(2.36, 0.03, 0.2, FARBE.pult, 0, 0.165, 0.02, 0, konsole)
    // Felder links und rechts der Anzeigen, etwas vertieft
    for (const x of [-0.86, 0.86]) this.kasten(0.28, 0.25, 0.02, FARBE.feld, x, 0, 0.07, 0, konsole)
    // Fensterrahmen (Michael, 2026-10-23, nach der Vorlage): kantige Säulen, unten am Pult schmaler, oben breiter, die Fläche
    // zum Fahrer gedreht; oben gehen sie ins Dach über
    const auge = new THREE.Vector3(0, 0, 0)
    for (const seite of [-1, 1]) {
      const bogen = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(seite * 1.18, -0.2, -1.14),
        new THREE.Vector3(seite * 1.1, 0.51, -0.88),
        new THREE.Vector3(seite * 1.02, 1.22, -0.62))
      const teile = 24
      // vier Ecken: ein flaches Rechteck im Querschnitt, die Kanten nicht gerundet
      const quer4 = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
      const ecken: number[] = [], index: number[] = []
      const c = new THREE.Vector3(), tan = new THREE.Vector3(), zum = new THREE.Vector3(), quer = new THREE.Vector3()
      for (let i = 0; i <= teile; i++) {
        const t = i / teile
        bogen.getPoint(t, c)
        bogen.getTangent(t, tan)
        zum.subVectors(auge, c).normalize()
        quer.crossVectors(tan, zum).normalize()
        zum.crossVectors(quer, tan).normalize()
        const breit = 0.11 + 0.06 * t, tief = 0.05
        for (const [a, b] of quer4) ecken.push(c.x + a * breit * quer.x + b * tief * zum.x, c.y + a * breit * quer.y + b * tief * zum.y,
          c.z + a * breit * quer.z + b * tief * zum.z)
        if (i < teile) for (let j = 0; j < 4; j++) {
          const k = i * 4 + j, n = i * 4 + (j + 1) % 4
          index.push(k, n, k + 4, n, n + 4, k + 4)
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(ecken, 3))
      geo.setIndex(index)
      const flach = geo.toNonIndexed()
      flach.computeVertexNormals()
      const m = this.material(FARBE.pult)
      m.side = THREE.DoubleSide
      this.rahmen.add(new THREE.Mesh(flach, m))
    }
    // Dach: kantiger Balken über dem Fahrer, wo die Säulen enden, dahinter eine Platte bis zur Scheibe
    this.kasten(2.2, 0.14, 0.12, FARBE.pult, 0, 1.22, -0.62, 0, this.rahmen)
    this.dachPlatte = this.kasten(2.3, 0.04, 0.6, FARBE.pult, 0, 1.26, -0.9, 0, this.rahmen)
    this.kasten(2.6, 0.06, 0.1, FARBE.blende, 0, -0.17, -1.13)

    // die drei Anzeigen in der Mitte des Bands
    const anzeige = (x: number, malen: (g: CanvasRenderingContext2D, l: PultLage) => void) => {
      const lw = document.createElement('canvas')
      lw.width = 640; lw.height = 360
      const tex = new THREE.CanvasTexture(lw)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      this.kasten(0.45, 0.255, 0.04, FARBE.blende, x, 0, 0.062, 0, konsole)
      // der Bildschirm mit runden Ecken wie sein Rahmen
      const flaeche = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.23625), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false,
        alphaMap: this.ecken ??= this.leinwand(640, 360, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.roundRect(0, 0, 640, 360, 26); c.fill() }),
        alphaTest: 0.5 }))
      flaeche.position.set(x, 0, 0.0835)
      konsole.add(flaeche)
      this.anzeigen.push({ lw, tex, malen })
    }
    anzeige(-0.475, (c, l) => this.streckeMalen(c, l))
    anzeige(0, (c, l) => this.tachoMalen(c, l))
    anzeige(0.475, (c, l) => this.voranMalen(c, l))

    const zustand: Partial<Record<Aktion, () => boolean>> = {
      zuggeraeusch: () => audioLesen().zuggeraeusch && audioLesen().an, stirnlicht: () => this.stirnlicht,
      wischer: () => this.wischer, daemmerung: () => this.daemmerung, pultlicht: () => this.pultlicht,
      hoehe1: () => (this.aussen?.current?.hoehe?.() ?? 1) === 1, hoehe2: () => this.aussen?.current?.hoehe?.() === 2,
      tunnel: () => this.meldet('tunnel'), bruecke: () => this.meldet('bruecke'), bahnhof: () => this.meldet('bahnhof'),
      bahnuebergang: () => this.meldet('bahnuebergang'),
    }
    const imBand = (zeichen: (c: CanvasRenderingContext2D) => void, x: number, y: number, aktion: Aktion) =>
      this.taste(zeichen, FARBE.schwarz, x, y, 0.08, aktion, Math.PI / 2, 0.072, konsole, zustand[aktion])
    // links im Band: Zuggeräusch, Signalhorn, Stirnlicht, Pultlicht
    imBand((c) => lautsprecher(c, FARBE.schrift), -0.92, 0.055, 'zuggeraeusch')
    imBand((c) => horn(c, FARBE.schrift), -0.8, 0.055, 'horn')
    imBand((c) => scheinwerfer(c, FARBE.schrift), -0.92, -0.06, 'stirnlicht')
    imBand((c) => pultleuchte(c, FARBE.schrift), -0.8, -0.06, 'pultlicht')
    // rechts im Band: zwei Leuchtfelder (rot Schnellbremse, gelb Bremse) wie in der Vorlage, daneben was gemeldet wird
    for (const [y, an, farbe] of [[0.055, () => this.gebremst() === 2, '#ff3b30'], [-0.06, () => this.gebremst() === 1, '#ffb020']] as const) {
      const m = new THREE.MeshBasicMaterial({ color: '#3a3f46', toneMapped: false })
      const feld = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.085), m)
      feld.position.set(0.755, y, 0.081)
      konsole.add(feld)
      this.leuchtfelder.push({ m, an, farbe })
    }
    const melden: Array<[MeldeArt, number, number]> = [['tunnel', 0.835, 0.055], ['bruecke', 0.945, 0.055], ['bahnhof', 0.835, -0.06]]
    if (this.uebergaenge) melden.push(['bahnuebergang', 0.945, -0.06])
    for (const [art, x, y] of melden) imBand((c) => meldeZeichen(c, art, FARBE.schrift), x, y, art)

    // untere Stufe: links und rechts eine Konsole für den Hebel, in der Mitte ein Sockel mit dem Knüppel
    const kippen = 0.2, yK = -0.49, zK = -0.66, gross = 0.085
    for (const x of [-0.65, 0.65]) {
      this.kasten(0.66, 0.05, 0.36, FARBE.feld, x, yK - 0.03, zK, kippen)
      // ein Schlitz am äusseren Ende, nur zum Ansehen
      this.kasten(0.04, 0.012, 0.16, FARBE.schwarz, x + Math.sign(x) * 0.28, yK, zK, kippen)
    }
    const aufKonsole = (zeichen: (c: CanvasRenderingContext2D) => void, grund: string, x: number, aktion: Aktion) =>
      this.taste(zeichen, grund, x, yK, zK + 0.03, aktion, kippen, gross, this.gruppe, zustand[aktion]).parent!
    aufKonsole((c) => dreieck(c, '#ffffff'), '#b3122f', -0.88, 'schnellbremse')
    aufKonsole((c) => wischerZeichen(c, FARBE.schrift), FARBE.schwarz, -0.53, 'wischer')
    aufKonsole((c) => mond(c, FARBE.schrift), FARBE.schwarz, -0.42, 'daemmerung')
    this.hoeheTasten = [aufKonsole((c) => berg(c, FARBE.schrift, 1), FARBE.schwarz, 0.42, 'hoehe1'),
      aufKonsole((c) => berg(c, FARBE.schrift, 2), FARBE.schwarz, 0.53, 'hoehe2')]
    // der Sockel in der Mitte, oben die Tasten für Zum Start und Hinter den Zug und der Knüppel für die Sicht zur Seite
    this.kasten(0.5, 0.12, 0.42, FARBE.pult, 0, -0.5, -0.64, kippen)
    this.kasten(0.34, 0.012, 0.13, FARBE.schwarz, 0, -0.44, -0.55, kippen)
    const sockelTaste = (zeichen: (c: CanvasRenderingContext2D) => void, x: number, aktion: Aktion) =>
      this.taste(zeichen, FARBE.schwarz, x, -0.445, -0.7, aktion, kippen, 0.075, this.gruppe, zustand[aktion]).parent!
    sockelTaste((c) => zumStartZeichen(c, FARBE.schrift), -0.155, 'zumStart')
    this.hinterTaste = sockelTaste((c) => hinterZugZeichen(c, FARBE.schrift), 0.155, 'hinterZug')
    this.knueppelBauen(0, -0.44, -0.66, kippen)

    // Hebel: links die Bremse (0, B, SB), rechts die Geschwindigkeitswahl (0 bis 220 km/h)
    this.hebel(-0.5, this.bremsHebel, 'bremsePlus', 'bremseMinus', (c) => {
      c.fillStyle = FARBE.schrift; c.font = 'bold 40px Helvetica, Arial, sans-serif'; c.textAlign = 'center'
      BREMSE_TEXT.forEach((t, i) => c.fillText(t, 40, 60 + i * 95))
    })
    this.hebel(0.5, this.sollHebel, 'sollMinus', 'sollPlus', (c) => {
      c.fillStyle = FARBE.schrift; c.font = 'bold 30px Helvetica, Arial, sans-serif'; c.textAlign = 'center'
      for (let i = 0; i <= 4; i++) c.fillText(String(Math.round(PULT_HOECHST_KMH * (1 - i / 4))), 40, 40 + i * 62)
    })

    // Abdeckung über den Anzeigen bis zur Unterkante des Fensters, auf dem Bildschirm so hoch, wie Relief.tsx sie setzt
    this.haube.position.set(0, HAUBE_FUSS_M, -1.1)
    this.haube.visible = false
    g.add(this.haube)
    const haubeMaterial = this.material(FARBE.pult)
    this.haubeWand = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 0.08), haubeMaterial)
    this.haube.add(this.haubeWand)
    // kantig wie der Rahmen (vorher eine runde Kante)
    this.haubeKante = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 0.12), haubeMaterial)
    this.haube.add(this.haubeKante)
    this.haubeTasten.position.z = 0.04
    this.haube.add(this.haubeTasten)
    const haubeTaste = (zeichen: (c: CanvasRenderingContext2D) => void, grund: string, x: number, aktion: Aktion) => {
      this.taste(zeichen, grund, x, 0, 0, aktion, Math.PI / 2, 0.1, this.haubeTasten)
      return this.haubeTasten.children[this.haubeTasten.children.length - 1]
    }
    this.sichtTasten = [haubeTaste((c) => sichtZeichen(c, FARBE.schrift, true), FARBE.schwarz, -0.95, 'sichtLinks'),
      haubeTaste((c) => sichtZeichen(c, FARBE.schrift, false), FARBE.schwarz, 0.95, 'sichtRechts')]
    this.schliessTaste = haubeTaste((c) => schliessZeichen(c, '#ffffff'), '#5a5a5a', 0, 'schliessen')

    // ein Wischer rechts wie in der Vorlage, in Ruhe flach
    for (const x of [0.3]) {
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

  /** der Knüppel auf dem Sockel: links antippen dreht die Sicht nach links, rechts nach rechts; er neigt sich kurz dorthin */
  private knueppelBauen(x: number, y: number, z: number, kippen: number) {
    const fuss = new THREE.Group()
    fuss.position.set(x, y, z)
    fuss.rotation.x = kippen
    this.gruppe.add(fuss)
    this.kasten(0.1, 0.02, 0.1, FARBE.schwarz, 0, 0, 0, 0, fuss)
    this.knueppel.position.y = 0.01
    fuss.add(this.knueppel)
    const stange = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.07, 10), this.material('#1a1e24'))
    stange.position.y = 0.035
    this.knueppel.add(stange)
    const knauf = new THREE.Mesh(rund(0.045, 0.05, 0.035), this.material('#2a2f36'))
    knauf.position.y = 0.08
    this.knueppel.add(knauf)
    for (const [aktion, dx] of [['sichtLinks', -0.035], ['sichtRechts', 0.035]] as const) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.08), new THREE.MeshLambertMaterial({ color: '#2a2f36', transparent: true, opacity: 0 }))
      h.position.set(dx, 0.055, 0)
      fuss.add(h)
      this.ziel(h, aktion)
      this.knueppelZiele.push(h)
    }
  }

  /** ein Hebel in einer Kulisse: die vordere Hälfte der Kulisse schiebt ihn nach vorn, die hintere zurück */
  private hebel(x: number, griff: THREE.Group, vorn: Aktion, hinten: Aktion, skala: (c: CanvasRenderingContext2D) => void) {
    const basis = new THREE.Group()
    // auf den Konsolen links und rechts (Michael, 2026-10-23, nach der Vorlage); tiefer und näher lagen sie auf dem Handy unter dem
    // Bildrand (Michael, 2026-10-14: «auf dem Mobile sieht man die Hebel nicht»)
    basis.position.set(x * 1.44, -0.49, -0.64)
    basis.rotation.x = 0.2
    // grösser als zuerst, damit man sie auf dem Handy trifft
    basis.scale.setScalar(1.15)
    this.gruppe.add(basis)
    this.kasten(0.2, 0.03, 0.3, FARBE.schwarz, 0, 0, 0, 0, basis)
    // Skala neben der Kulisse
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.25),
      new THREE.MeshBasicMaterial({ map: this.leinwand(80, 320, (c) => { c.fillStyle = FARBE.schwarz; c.fillRect(0, 0, 80, 320); skala(c) }), toneMapped: false }))
    s.rotation.x = -Math.PI / 2
    // die Skala rechts neben der Kulisse, bei beiden Hebeln (Michael, 2026-10-13)
    s.position.set(0.075, 0.017, 0)
    basis.add(s)
    if (griff === this.sollHebel) this.sollSkala = s.material
    // die beiden Hälften als Ziele, kaum sichtbar
    for (const [aktion, z] of [[vorn, -0.075], [hinten, 0.075]] as const) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.14), this.material('#2b323c'))
      h.position.set(0, 0.022, z)
      basis.add(h)
      this.ziel(h, aktion)
    }
    griff.position.set(0, 0.02, 0)
    basis.add(griff)
    // kürzer als zuerst, damit der Hebel die Tasten im Band nicht verdeckt (Michael, 2026-10-23, nach der Vorlage; vorher 13 cm)
    const stange = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.08, 10), this.material('#1a1e24'))
    stange.position.y = 0.04
    griff.add(stange)
    const knauf = new THREE.Mesh(rund(0.1, 0.04, 0.06), this.material('#c9ccd1'))
    knauf.position.y = 0.09
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
      // das Seitenfenster gross (Michael, 2026-10-13: «viel grösser»): FU bis FO hoch, FV bis FH lang, offen
      const FU = -0.35, FO = 1.1, FV = -0.85, FH = 1.15
      k(0.05, FU - BODEN, HINTEN - VORN, unten, x, (BODEN + FU) / 2, (HINTEN + VORN) / 2)
      k(0.05, DECKE - FO, HINTEN - VORN, wand, x, (DECKE + FO) / 2, (HINTEN + VORN) / 2)
      k(0.07, 0.06, FH - FV, dunkel, x, FU, (FV + FH) / 2)
      k(0.07, 0.06, FH - FV, dunkel, x, FO, (FV + FH) / 2)
      k(0.07, FO - FU, 0.06, dunkel, x, (FU + FO) / 2, FV)
      k(0.07, FO - FU, 0.06, dunkel, x, (FU + FO) / 2, FH)
      // hinter dem Fenster geschlossen bis zur Rückwand, davor bis zur A-Säule
      k(0.05, FO - FU, HINTEN - FH, wand, x, (FU + FO) / 2, (HINTEN + FH) / 2)
      k(0.05, FO - FU, FV - VORN, wand, x, (FU + FO) / 2, (FV + VORN) / 2)
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

  /** 0 gelöst, 1 Bremse, 2 Schnellbremse; in der Probefahrt angehalten als Bremse */
  private gebremst(): number {
    const st = this.quelle === 'probe' ? this.aussen?.current?.probe : null
    return st ? (st.angehalten() ? 1 : 0) : this.quelle === 'simulation' ? this.bremse : 0
  }

  /* ---------- Bedienung ---------- */

  /** die bedienbaren Teile, für Strahl und Maus */
  get bedienbar(): THREE.Object3D[] {
    // nur, was zu sehen ist: die Tasten auf der Abdeckung gibt es nicht immer
    const sichtbar = (o: THREE.Object3D | null): boolean => !o || (o.visible && sichtbar(o.parent))
    return this.ziele.map((z) => z.netz).filter((n) => sichtbar(n))
  }

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
    const st = this.quelle === 'probe' ? this.aussen?.current?.probe : null
    if (st) {
      const i = st.stufe(), kmh = (k: number) => `${k.toLocaleString('de-CH')} km/h`
      switch (aktion) {
        case 'sollPlus':
          if (st.angehalten()) { st.anhalten(false); return `Weiter, etwa ${kmh(st.stufen[i])}` }
          st.waehlen(Math.min(st.stufen.length - 1, i + 1)); return `Etwa ${kmh(st.stufen[Math.min(st.stufen.length - 1, i + 1)])}`
        case 'sollMinus':
          if (i === 0) { st.anhalten(true); return 'Angehalten' }
          st.waehlen(i - 1); return `Etwa ${kmh(st.stufen[i - 1])}`
        case 'bremsePlus': st.anhalten(true); return 'Angehalten'
        case 'bremseMinus': st.anhalten(false); return `Weiter, etwa ${kmh(st.stufen[i])}`
        case 'schnellbremse':
          if (st.angehalten()) { st.anhalten(false); return `Weiter, etwa ${kmh(st.stufen[i])}` }
          st.anhalten(true); return 'Angehalten – nochmals drücken fährt weiter'
        default:
      }
    }
    const au = this.aussen?.current
    const artName: Record<MeldeArt, string> = { tunnel: 'Tunnel', bruecke: 'Brücken', bahnhof: 'Bahnhöfe', bahnuebergang: 'Bahnübergänge' }
    switch (aktion) {
      case 'hinterZug': au?.hinterZug?.(); return 'Hinter den Zug'
      case 'zumStart':
        // zurück an den Startbahnhof, damit man das Abfahren erlebt (Michael, 2026-10-15)
        if (!this.zumStartAktion?.()) return 'Beim Fahren bestimmt der Standort, wo der Zug ist'
        this.stehen()
        return this.quelle === 'probe' ? 'Am Startbahnhof – Bremse lösen fährt ab' : 'Am Startbahnhof – Geschwindigkeit wählen fährt ab'
      case 'sichtLinks': au?.seite?.(1); this.knueppelNeigung = 0.45; return 'Sicht nach links'
      case 'sichtRechts': au?.seite?.(-1); this.knueppelNeigung = -0.45; return 'Sicht nach rechts'
      case 'schliessen': au?.schliessen?.(); return ''
      case 'hoehe1': case 'hoehe2': {
        if (!au?.hoeheSetzen) return 'Hier nur Höhe wie echt'
        const f = aktion === 'hoehe1' ? 1 : 2
        au.hoeheSetzen(f); return f === 1 ? 'Höhe wie echt' : 'Höhe 2-fach überhöht'
      }
      case 'tunnel': case 'bruecke': case 'bahnhof': case 'bahnuebergang': {
        const an = !this.meldet(aktion)
        if (au?.meldenSetzen) au.meldenSetzen(aktion, an)
        else if (an) this.gemeldet.add(aktion)
        else this.gemeldet.delete(aktion)
        return `${artName[aktion]} ${an ? 'melden' : 'nicht melden'}`
      }
      default:
    }
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

  /** ob diese Art angekündigt wird: im Fahrtmodus nach dessen Einstellung, sonst hier */
  meldet(art: MeldeArt) {
    const au = this.aussen?.current
    return au?.meldet ? au.meldet(art) : this.gemeldet.has(art)
  }

  /** steht still, nichts gewählt, keine Bremse: so wartet der Zug am Startbahnhof */
  stehen() {
    this.v = 0
    this.soll = 0
    this.bremse = 0
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
      KeyN: 'daemmerung', KeyZ: 'hinterZug', KeyS: 'zumStart', Digit1: 'hoehe1', Digit2: 'hoehe2', ArrowLeft: 'sichtLinks', ArrowRight: 'sichtRechts' }
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
    const au = this.aussen?.current
    for (const t of this.sichtTasten) t.visible = Boolean(au?.seite)
    if (this.schliessTaste) this.schliessTaste.visible = Boolean(au?.schliessen)
    // Höhe nur, wo sie sich ändern lässt, «Hinter den Zug» nicht in der Brille, der Knüppel nur, wo man zur Seite blicken kann
    for (const t of this.hoeheTasten) t.visible = Boolean(au?.hoeheSetzen)
    if (this.hinterTaste) this.hinterTaste.visible = !this.inBrille
    for (const z of this.knueppelZiele) z.visible = Boolean(au?.seite)
    this.knueppelNeigung *= Math.max(0, 1 - dt * 5)
    this.knueppel.rotation.z = this.knueppelNeigung
    for (const f of this.leuchtfelder) f.m.color.set(f.an() ? f.farbe : '#3a3f46')
    // Hebel nach Stellung; in der Probefahrt nach deren Stufe, die Skala zeigt dann deren Tempi
    const st = this.quelle === 'probe' ? this.aussen?.current?.probe : null
    this.skalaZeigen(st?.stufen ?? null)
    this.sollHebel.rotation.x = 0.45 - (st ? st.stufe() / Math.max(1, st.stufen.length - 1) : this.soll / PULT_HOECHST_KMH) * 0.9
    this.bremsHebel.rotation.x = -0.4 + (st ? (st.angehalten() ? 1 : 0) : this.bremse) * 0.4
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
    for (const z of this.zustaende) z.m.color.set(z.an() ? '#4cd964' : '#3a4250')
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

  /** die Skala des rechten Hebels: 0 bis PULT_HOECHST_KMH oder die Stufen der Probefahrt, oben die schnellste */
  private skalaZeigen(stufen: number[] | null) {
    const schluessel = stufen?.join(',') ?? ''
    if (schluessel === this.skalaStufen || !this.sollSkala) return
    this.skalaStufen = schluessel
    const lw = document.createElement('canvas')
    lw.width = 80; lw.height = 320
    const c = lw.getContext('2d')!
    c.fillStyle = FARBE.schwarz; c.fillRect(0, 0, 80, 320)
    c.fillStyle = FARBE.schrift; c.textAlign = 'center'
    const texte = stufen ? [...stufen].reverse().map((k) => (k >= 1000 ? `${k / 1000}k` : String(k)))
      : [0, 1, 2, 3, 4].map((i) => String(Math.round(PULT_HOECHST_KMH * (1 - i / 4))))
    const n = texte.length
    c.font = `bold ${n > 5 ? 24 : 30}px Helvetica, Arial, sans-serif`
    texte.forEach((t, i) => c.fillText(t, 40, 30 + (i * 270) / (n - 1)))
    const tex = new THREE.CanvasTexture(lw)
    tex.colorSpace = THREE.SRGBColorSpace
    this.sollSkala.map?.dispose()
    this.sollSkala.map = tex
    this.sollSkala.needsUpdate = true
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
    } else if (l.quelle === 'probe' && this.aussen?.current?.probe) {
      const st = this.aussen.current.probe
      c.fillText(`Zeitraffer ${st.stufen[st.stufe()].toLocaleString('de-CH')} km/h`, 404, 80)
      c.fillStyle = st.angehalten() ? FARBE.karmin : FARBE.grau
      c.fillText(st.angehalten() ? 'angehalten' : 'fährt', 404, 108)
    } else {
      c.fillText(l.quelle === 'gps' ? 'aus dem Standort' : 'Zeitraffer', 404, 80)
      c.fillText('Hebel gesperrt', 404, 108)
    }
    c.fillStyle = '#26364d'; c.fillRect(404, 126, 220, 2)
    // darunter die Vorschau (Michael, 2026-10-13, nach seinem Vorbild): Pfeil, Entfernung und Art des Nächsten voraus
    const naechstes = vorListe(l, (a) => this.meldet(a))[0]
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
    const vor = vorListe(l, (a) => this.meldet(a)).slice(0, 3)
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
function vorListe(l: PultLage, meldet: (art: MeldeArt) => boolean) {
  return l.ankuendigungen.filter((a) => meldet(a.art)).map((a) => ({ ...a, d: (a.s - l.s) * l.richtung })).filter((a) => a.d > 0).sort((a, b) => a.d - b.d)
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
/** Stirnlicht: Scheinwerfer mit schrägen Strahlen wie das Zeichen fürs Abblendlicht im Auto (Michael, 2026-10-14: «etwas in
 *  dieser Art»; vorher eine Sonne) */
function scheinwerfer(c: CanvasRenderingContext2D, farbe: string) {
  c.strokeStyle = farbe; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 8
  c.beginPath(); c.moveTo(66, 30); c.quadraticCurveTo(114, 30, 114, 64); c.quadraticCurveTo(114, 98, 66, 98); c.closePath(); c.stroke()
  c.lineWidth = 7
  for (const y of [38, 55, 72, 89]) { c.beginPath(); c.moveTo(52, y); c.lineTo(16, y + 10); c.stroke() }
}
/** Pultbeleuchtung: eine Leuchte, die aufs Pult scheint (Michael, 2026-10-14: «ein eigenes Zeichen»; vorher die Sonne wie
 *  beim Stirnlicht) */
function pultleuchte(c: CanvasRenderingContext2D, farbe: string) {
  c.fillStyle = farbe; c.strokeStyle = farbe; c.lineCap = 'round'
  c.lineWidth = 6
  c.beginPath(); c.moveTo(64, 14); c.lineTo(64, 32); c.stroke()
  c.beginPath(); c.moveTo(46, 32); c.lineTo(82, 32); c.lineTo(98, 58); c.lineTo(30, 58); c.closePath(); c.fill()
  c.lineWidth = 6
  for (const [x0, x1] of [[44, 34], [64, 64], [84, 94]]) { c.beginPath(); c.moveTo(x0, 70); c.lineTo(x1, 88); c.stroke() }
  c.lineWidth = 7
  c.beginPath(); c.moveTo(20, 104); c.lineTo(108, 104); c.stroke()
}
/** Sicht zur Seite: ein Auge, daneben ein Pfeil */
function sichtZeichen(c: CanvasRenderingContext2D, farbe: string, links: boolean) {
  c.strokeStyle = farbe; c.fillStyle = farbe; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round'
  const x = links ? 78 : 50
  c.beginPath(); c.ellipse(x, 64, 26, 16, 0, 0, Math.PI * 2); c.stroke()
  c.beginPath(); c.arc(x, 64, 7, 0, Math.PI * 2); c.fill()
  const p = links ? 30 : 98, r = links ? 1 : -1
  c.beginPath(); c.moveTo(p + r * 16, 44); c.lineTo(p, 64); c.lineTo(p + r * 16, 84); c.stroke()
}
/** Schliessen: ein Kreuz */
function schliessZeichen(c: CanvasRenderingContext2D, farbe: string) {
  c.strokeStyle = farbe; c.lineWidth = 10; c.lineCap = 'round'
  c.beginPath(); c.moveTo(38, 38); c.lineTo(90, 90); c.moveTo(90, 38); c.lineTo(38, 90); c.stroke()
}
/** Hinter den Zug: ein Zug von der Seite, dahinter ein Auge */
function hinterZugZeichen(c: CanvasRenderingContext2D, farbe: string) {
  c.fillStyle = farbe; c.strokeStyle = farbe; c.lineWidth = 6; c.lineJoin = 'round'
  c.beginPath(); c.moveTo(48, 50); c.lineTo(100, 50); c.quadraticCurveTo(114, 50, 116, 80); c.lineTo(48, 80); c.closePath(); c.fill()
  c.beginPath(); c.moveTo(44, 92); c.lineTo(118, 92); c.stroke()
  c.beginPath(); c.ellipse(22, 64, 14, 9, 0, 0, Math.PI * 2); c.stroke()
  c.beginPath(); c.arc(22, 64, 4, 0, Math.PI * 2); c.fill()
}
/** Zum Startbahnhof: ein Strich, davor zwei Dreiecke nach links wie «an den Anfang» */
function zumStartZeichen(c: CanvasRenderingContext2D, farbe: string) {
  c.fillStyle = farbe
  c.fillRect(18, 34, 10, 60)
  for (const x of [30, 72]) { c.beginPath(); c.moveTo(x, 64); c.lineTo(x + 42, 34); c.lineTo(x + 42, 94); c.closePath(); c.fill() }
}
/** Höhe des Geländes: ein flacher oder ein hoher Berg mit 1× oder 2× */
function berg(c: CanvasRenderingContext2D, farbe: string, f: 1 | 2) {
  c.fillStyle = farbe
  const spitze = f === 1 ? 66 : 26
  c.beginPath(); c.moveTo(14, 100); c.lineTo(58, spitze); c.lineTo(102, 100); c.closePath(); c.fill()
  c.font = 'bold 30px Helvetica, Arial, sans-serif'; c.textAlign = 'right'
  c.fillText(f === 1 ? '1×' : '2×', 122, 36)
}
/** was angekündigt wird: Tunnel, Brücke, Bahnhof, Bahnübergang */
function meldeZeichen(c: CanvasRenderingContext2D, art: MeldeArt, farbe: string) {
  c.strokeStyle = farbe; c.fillStyle = farbe; c.lineWidth = 9; c.lineCap = 'round'
  if (art === 'tunnel') { c.beginPath(); c.moveTo(30, 100); c.lineTo(30, 62); c.arc(64, 62, 34, Math.PI, 0); c.lineTo(98, 100); c.stroke() }
  else if (art === 'bruecke') { c.beginPath(); c.moveTo(14, 46); c.lineTo(114, 46); c.stroke(); c.beginPath(); c.moveTo(28, 100); c.quadraticCurveTo(64, 40, 100, 100); c.stroke() }
  else if (art === 'bahnhof') { c.beginPath(); c.arc(64, 64, 34, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(64, 64, 14, 0, Math.PI * 2); c.fill() }
  else { c.beginPath(); c.moveTo(30, 30); c.lineTo(98, 98); c.moveTo(98, 30); c.lineTo(30, 98); c.stroke() }
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
