/**
 * Autos auf Autobahnen und Autostrassen in «3D Schweiz» (Michael, 2026-11-10: «Möglich Autos aus den Autobahnen wegzuretuschieren und durch
 * fahrende Modelle zu ersetzen?»; gewählt: nur Autobahnen und Autostrassen, nur in der Virtuellen Schweiz, Dichte laut ASTRA, eigener Knopf).
 *
 * Belegt: die Lage der Fahrbahnen (swissTLM3D) und der Verkehr je Stunde an den Zählstellen des ASTRA, am Tag (6 bis 22 Uhr) und in der Nacht
 * (pipeline/build_autos.py); auf den übrigen Strassen (Michael, 2026-11-10: «Jetzt mehr Verkehr auf anderen Strassen») der Tagesverkehr laut
 * Verkehrsmodell des ARE (NPVM 2023 und AMG des UVEK), ein Modell, keine Zählung. Erfunden: die Autos, ihre Farben, Lage, Spur und ihr Tempo, die Zahl der Spuren, die Breite der Fahrbahn und was
 * die Retusche ins Luftbild malt.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { AutoStueck } from '../gelaende'
import type { Retusche, Streifen } from './Bruecken'

/** ein Auto, Masse gewählt: 4,4 m lang, 1,8 m breit, 1,5 m hoch */
export const AUTO_LANG_M = 4.4, AUTO_BREIT_M = 1.8
/** Fahrbahn einer Richtung: zwei Spuren je 3,75 m (gewählt, die Zahl der Spuren steht nur an den Zählstellen); beide Richtungen auf einer
 *  Achse: je eine Spur, 1,9 m rechts der Achse */
export const AUTO_SPUR_M = 3.75, AUTO_SPUREN = 2, AUTO_GEGEN_M = 1.9
/** Tempo je Spur in km/h, gewählt: rechts 85 (dort fahren auch die Lastwagen; bis 2026-11-10 95), links 115, auf Autostrassen ohne Trennung 80 */
export const AUTO_KMH = [85, 115], AUTO_KMH_GEGEN = 80
/** ein Lastwagen (Michael, 2026-11-10: «Bitte auch LKWs einfügen»): Sattelzug, Masse gewählt, 16,5 m lang, 2,55 m breit, 4 m hoch; wie viele, laut dem
 *  Anteil Schwerverkehr an der Zählstelle des ASTRA am Tag und in der Nacht, ohne Zählstelle AUTO_LKW_OHNE_ZAEHLUNG (gewählt); nur auf der rechten Spur */
export const LKW_LANG_M = 16.5, LKW_BREIT_M = 2.55, AUTO_LKW_OHNE_ZAEHLUNG = 6
/** Farben der Planen und Kasten, gewählt */
const LKW_FARBEN = ['#f4f4f4', '#e6e6e6', '#d0d0d0', '#9aa0a6', '#f4f4f4', '#1f3f7a', '#8a1a1a', '#2b5d34', '#c9a227', '#f4f4f4']
/** ohne Zählstelle bis 40 km über das Netz: mittlerer Verkehr je Stunde am Tag und in der Nacht, beide Richtungen, gewählt */
export const AUTO_OHNE_ZAEHLUNG: [number, number] = [1200, 200]
/** Retusche: so breit wie die Fahrbahn und etwas mehr, je Seite der Achse in m, gewählt */
export const AUTO_RETUSCHE_EINWEG_M = 9, AUTO_RETUSCHE_BEIDE_M = 6
/** die Retusche nimmt je Bildpunkt den Median entlang der Fahrbahn über so viele Meter davor und danach */
export const AUTO_RETUSCHE_LAENGS_M = 16
/** Farben der Lackierung, gewählt; die meisten hell, grau oder schwarz wie auf den Strassen, ab und zu farbig */
const LACK = ['#f2f2f2', '#e9e9e9', '#c8c8c8', '#9a9a9a', '#6e6e6e', '#3c3c3c', '#202020', '#1a1a1a', '#e9e9e9', '#2b2b2b',
  '#8a1a1a', '#1f3f7a', '#2f5a8a', '#24442a', '#c9b48a', '#a8102e']

/** Form in km, die Spitze bei +z, der Boden bei y = 0; Karosserie weiss (die Farbe je Auto kommt dazu), Fenster dunkel */
export function lkwForm(): THREE.BufferGeometry {
  const teile: THREE.BufferGeometry[] = []
  const kasten = (l: number, b: number, h: number, y: number, z: number, farbe: string) => {
    const g = new THREE.BoxGeometry(b / 1000, h / 1000, l / 1000).toNonIndexed()
    g.deleteAttribute('uv')
    g.translate(0, (y + h / 2) / 1000, z / 1000)
    const c = new THREE.Color(farbe), f = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < f.length; i += 3) { f[i] = c.r; f[i + 1] = c.g; f[i + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3))
    teile.push(g)
  }
  const L = LKW_LANG_M, vorn = L / 2
  // Fahrgestell und Räder dunkel, Führerhaus vorne (seine Farbe kommt mit dem Lastwagen), Scheibe dunkel, Auflieger mit Plane dahinter
  kasten(L - 0.3, LKW_BREIT_M * 0.9, 0.7, 0.3, -0.15, '#1e1e1e')
  kasten(2.3, LKW_BREIT_M, 2.6, 0.9, vorn - 1.15, '#ffffff')
  kasten(0.06, LKW_BREIT_M * 0.85, 0.9, 2.3, vorn + 0.01, '#1c2228')
  kasten(13.6, LKW_BREIT_M, 2.95, 1.05, vorn - 2.6 - 6.8, '#ffffff')
  const ganz = mergeGeometries(teile)!
  teile.forEach((x) => x.dispose())
  return ganz
}
export function lkwFarbe(i: number): THREE.Color {
  return new THREE.Color(LKW_FARBEN[Math.floor(zufall(i * 3.17 + 0.4) * LKW_FARBEN.length)])
}

/** SUV und Pick-up (Michael, 2026-11-11: «Kannst du aus jedem 5. Auto einen SUV machen und aus jedem 15. einen Pick-Up»): je Auto ein fester Zufall,
 *  ein Fünftel SUV, ein Fünfzehntel Pick-up, der Rest wie bisher; Masse und Gestalt gewählt, kein bestimmtes Modell */
export const SUV_ANTEIL = 1 / 5, PICKUP_ANTEIL = 1 / 15
/** dazu (Michael, 2026-11-14: «Autos: noch Kleinwagen und Minibusse ergänzen. Kombis ebenso. Und jedes 20. Auto ein Sportwagen. Von Mai bis Sept auch
 *  Cabriolets»): Kleinwagen, Minibus, Kombi und Sportwagen je ein fester Anteil, von Mai bis September ein Teil der übrigen Autos offen; Anteile gewählt
 *  ausser dem Sportwagen, Masse und Gestalt gewählt, kein bestimmtes Modell */
export const KLEINWAGEN_ANTEIL = 1 / 6, MINIBUS_ANTEIL = 1 / 25, KOMBI_ANTEIL = 1 / 6, SPORTWAGEN_ANTEIL = 1 / 20, CABRIO_ANTEIL = 1 / 6
/** die Arten: 0 Auto, 1 SUV, 2 Pick-up, 3 Kleinwagen, 4 Minibus, 5 Kombi, 6 Sportwagen, 7 Cabriolet */
export type AutoArt = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export const AUTO_ARTEN: AutoArt[] = [1, 2, 3, 4, 5, 6, 7], AUTO_CABRIO: AutoArt = 7
/** Länge und Breite je Art in m, gewählt */
export const AUTO_ART_LANG_M = [AUTO_LANG_M, 4.7, 5.3, 3.7, 5.2, 4.8, 4.4, 4.4], AUTO_ART_BREIT_M = [AUTO_BREIT_M, 1.9, 1.9, 1.7, 2.0, 1.85, 1.9, AUTO_BREIT_M]
export function autoArt(id: number): AutoArt {
  let r = zufall(id * 5.13 + 2.9)
  for (const [art, anteil] of [[2, PICKUP_ANTEIL], [1, SUV_ANTEIL], [3, KLEINWAGEN_ANTEIL], [4, MINIBUS_ANTEIL], [5, KOMBI_ANTEIL], [6, SPORTWAGEN_ANTEIL]] as Array<[AutoArt, number]>) {
    if (r < anteil) return art
    r -= anteil
  }
  return 0
}
/** von Mai bis September ist dieses Auto (Art 0) offen */
export function autoCabrio(id: number): boolean {
  return zufall(id * 2.71 + 6.3) < CABRIO_ANTEIL
}

/**
 * die Form eines Autos (Michael, 2026-11-16: «Die Autos sind auch ein bisschen eckig … wenn du hier noch ein bisschen mehr Realität hineinbringen
 * könntest»): statt gestapelter Kästen je Art ein Umriss von der Seite (Unterbau mit Motorhaube und Heck, darüber die Kabine mit schrägen Front- und
 * Heckscheiben), seitlich ausgezogen und an den Kanten gerundet (ExtrudeGeometry mit Fase), dazu vier Räder. Masse und Gestalt gewählt, kein bestimmtes
 * Modell; die weissen Teile tragen die Farbe des Lacks, dunkle bleiben dunkel
 */
interface AutoProfil {
  /** Höhe der Fensterunterkante, des Dachs, des Hecks und der Front (m) */
  gurt: number; dach: number; heck: number; front: number
  /** Unterkante der Frontscheibe, Dach vorne und hinten, Unterkante der Heckscheibe, je als Abstand vom Heck (m) */
  scheibeVorn: number; dachVorn: number; dachHinten: number; scheibeHinten: number
  /** Radius der Räder (m) */
  rad: number
}
const AUTO_PROFILE: Record<number, AutoProfil> = {
  0: { gurt: 0.9, dach: 1.45, heck: 0.82, front: 0.74, scheibeVorn: 3.15, dachVorn: 2.45, dachHinten: 1.35, scheibeHinten: 0.55, rad: 0.31 },
  1: { gurt: 1.05, dach: 1.75, heck: 1.0, front: 0.95, scheibeVorn: 3.55, dachVorn: 2.95, dachHinten: 0.4, scheibeHinten: 0.18, rad: 0.36 },
  2: { gurt: 1.05, dach: 1.8, heck: 1.0, front: 0.95, scheibeVorn: 4.25, dachVorn: 3.7, dachHinten: 2.85, scheibeHinten: 2.75, rad: 0.36 },
  3: { gurt: 0.92, dach: 1.5, heck: 0.88, front: 0.76, scheibeVorn: 2.85, dachVorn: 2.2, dachHinten: 0.35, scheibeHinten: 0.12, rad: 0.29 },
  4: { gurt: 1.0, dach: 2.05, heck: 0.95, front: 0.95, scheibeVorn: 4.8, dachVorn: 4.4, dachHinten: 0.12, scheibeHinten: 0.05, rad: 0.33 },
  5: { gurt: 0.9, dach: 1.48, heck: 0.85, front: 0.74, scheibeVorn: 3.6, dachVorn: 2.9, dachHinten: 0.3, scheibeHinten: 0.15, rad: 0.32 },
  6: { gurt: 0.72, dach: 1.15, heck: 0.7, front: 0.55, scheibeVorn: 2.95, dachVorn: 2.15, dachHinten: 1.4, scheibeHinten: 0.45, rad: 0.33 },
  7: { gurt: 0.9, dach: 1.45, heck: 0.82, front: 0.74, scheibeVorn: 3.15, dachVorn: 2.45, dachHinten: 1.35, scheibeHinten: 0.55, rad: 0.31 },
}
const AUTO_BODEN_M = 0.22, AUTO_FASE_M = 0.07

export function autoForm(art: AutoArt = 0): THREE.BufferGeometry {
  const teile: THREE.BufferGeometry[] = []
  const faerben = (g: THREE.BufferGeometry, farbe: string) => {
    if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n }
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    const c = new THREE.Color(farbe), f = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < f.length; i += 3) { f[i] = c.r; f[i + 1] = c.g; f[i + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3))
    g.scale(1 / 1000, 1 / 1000, 1 / 1000)
    teile.push(g)
  }
  const L = AUTO_ART_LANG_M[art], B = AUTO_ART_BREIT_M[art], P = AUTO_PROFILE[art] ?? AUTO_PROFILE[0]
  // ein Umriss (z vom Heck nach vorne, y nach oben, in m, z = 0 ist das Heck) so breit ausgezogen und gerundet; vorne ist +z wie bisher
  const umriss = (pkt: Array<[number, number]>, breite: number, fase: number, farbe: string) => {
    const form = new THREE.Shape(pkt.map(([z, y]) => new THREE.Vector2(z - L / 2, y)))
    const g = new THREE.ExtrudeGeometry(form, { depth: Math.max(0.01, breite - 2 * fase), bevelEnabled: fase > 0, bevelThickness: fase,
      bevelSize: fase, bevelSegments: 2, curveSegments: 1 })
    g.rotateY(-Math.PI / 2)
    g.translate((breite - 2 * fase) / 2, 0, 0)
    g.computeVertexNormals()
    faerben(g, farbe)
  }
  const f = AUTO_FASE_M, unten = AUTO_BODEN_M
  // Unterbau: Heck, Kofferraum bis zur Heckscheibe, Gurtlinie, Motorhaube zur Front
  umriss([[0.05, unten], [L - 0.08, unten], [L - 0.02, P.front * 0.55], [L - 0.04, P.front], [P.scheibeVorn, P.gurt],
    [Math.max(P.scheibeHinten, 0.12), P.gurt], [0.02, P.heck]], B - 0.02, f, '#ffffff')
  // Räder: dunkle Zylinder vorne und hinten, etwas aussen
  for (const z of [0.85, L - 0.85]) {
    for (const x of [-(B / 2 - 0.09), B / 2 - 0.09]) {
      const r = new THREE.CylinderGeometry(P.rad, P.rad, 0.24, 10, 1)
      r.rotateZ(Math.PI / 2); r.translate(x, P.rad, z - L / 2)
      faerben(r, '#151515')
    }
  }
  if (art === AUTO_CABRIO) {
    // offen: nur die Frontscheibe und zwei Sitze
    umriss([[P.scheibeVorn, P.gurt - 0.05], [P.scheibeVorn + 0.06, P.gurt - 0.05], [P.dachVorn + 0.35, P.gurt + 0.42], [P.dachVorn + 0.29, P.gurt + 0.42]],
      B * 0.84, 0.01, '#1c2228')
    for (const x of [-0.4, 0.4]) {
      const sitz = new THREE.BoxGeometry(0.5, 0.42, 0.15); sitz.translate(x, P.gurt + 0.21, P.dachHinten + 0.3 - L / 2)
      faerben(sitz, '#1c2228')
    }
  } else {
    // Kabine in der Farbe des Lacks, schmaler als der Unterbau, mit schrägen Scheiben; darüber die Scheiben dunkel, etwas breiter, bis knapp unters Dach
    const kabine: Array<[number, number]> = [[P.scheibeHinten, P.gurt - 0.05], [P.scheibeVorn, P.gurt - 0.05], [P.dachVorn, P.dach], [P.dachHinten, P.dach]]
    umriss(kabine, B * 0.84, 0.06, '#ffffff')
    const bei = (a: [number, number], b: [number, number], y: number): number => a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1] || 1)
    const oben = P.dach - 0.09, aus = 0.035
    umriss([[P.scheibeHinten - aus, P.gurt - 0.02], [P.scheibeVorn + aus, P.gurt - 0.02], [bei(kabine[1], kabine[2], oben) + aus, oben],
      [bei(kabine[0], kabine[3], oben) - aus, oben]], B * 0.86, 0.04, '#1c2228')
  }
  if (art === 2) {
    // Pick-up: hinter der Kabine eine offene Ladefläche mit Bordwänden
    const ladeL = P.scheibeHinten - 0.2, ladeZ = 0.1 + ladeL / 2 - L / 2
    const boden = new THREE.BoxGeometry(B * 0.88, 0.02, ladeL); boden.translate(0, P.gurt - 0.04, ladeZ); faerben(boden, '#2a2a2a')
    for (const x of [-(B / 2 - 0.06), B / 2 - 0.06]) {
      const w = new RoundedBoxGeometry(0.1, 0.3, ladeL, 1, 0.03); w.translate(x, P.gurt + 0.12, ladeZ); faerben(w, '#ffffff')
    }
  }
  const ganz = mergeGeometries(teile)!
  teile.forEach((t) => t.dispose())
  return ganz
}

/** Scheinwerfer vorne weiss, Rücklichter hinten rot, nachts (fensterNacht) als eigenes Netz ohne Licht der Szene gezeichnet; Lage gewählt */
export function autoLichter(lang = AUTO_LANG_M, breit = AUTO_BREIT_M, rund = false, doppel = false): THREE.BufferGeometry {
  const teile: THREE.BufferGeometry[] = []
  const lampe = (x: number, z: number, farbe: string, kreis = false, r = RUND_SCHEINWERFER_R_M) => {
    const g = (kreis
      ? new THREE.CylinderGeometry(r / 1000, r / 1000, 0.08 / 1000, 16).rotateX(Math.PI / 2)
      : new THREE.BoxGeometry(0.45 / 1000, 0.2 / 1000, 0.08 / 1000)).toNonIndexed()
    g.deleteAttribute('uv')
    g.translate(x / 1000, 0.75 / 1000, z / 1000)
    const c = new THREE.Color(farbe), f = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < f.length; i += 3) { f[i] = c.r; f[i + 1] = c.g; f[i + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3))
    teile.push(g)
  }
  const x0 = breit / 3
  for (const x of [-x0, x0]) {
    if (doppel) for (const d of [-1, 1]) lampe(x + Math.sign(x) * d * DOPPEL_ABSTAND_M / 2, lang / 2 + 0.03, '#ffffff', true, DOPPEL_R_M)
    else lampe(x, lang / 2 + 0.03, '#ffffff', rund)
    lampe(x, -lang / 2 - 0.03, '#ff3020')
  }
  const ganz = mergeGeometries(teile)!
  teile.forEach((t) => t.dispose())
  return ganz
}

/** runde Scheinwerfer bei jedem 4. Auto (Michael, 2026-11-17: «Kannst du bei jedem 4. Auto runde Scheinwerfer machen?»): je Auto ein fester Zufall,
 *  ein Viertel; Durchmesser 22 cm gewählt; die Rücklichter bleiben eckig, Lastwagen nicht */
export const RUND_SCHEINWERFER_ANTEIL = 0.25, RUND_SCHEINWERFER_R_M = 0.11
export function autoRundeLichter(id: number): boolean {
  return zufall(id * 4.37 + 3.3) < RUND_SCHEINWERFER_ANTEIL
}
/** Kleinwagen mit je zwei runden Scheinwerfern links und rechts (Michael, 2026-11-17: «Bei den Kleinwagen darf es auch bei den Frontlichtern mal auf
 *  beiden Seiten je 2 Lichter haben, und zwar wenn, dann runde. Das betrifft aber nur jedes 15. bis 20. Auto»): etwa jedes 17. Auto, also gut ein Drittel der
 *  Kleinwagen, je Auto ein fester Zufall; Durchmesser 17 cm, Mitten 26 cm auseinander, gewählt */
export const DOPPEL_ANTEIL = 1 / 17, DOPPEL_R_M = 0.085, DOPPEL_ABSTAND_M = 0.26
export function autoDoppelLichter(id: number): boolean {
  return autoArt(id) === 3 && zufall(id * 6.07 + 1.3) < DOPPEL_ANTEIL / KLEINWAGEN_ANTEIL
}

/** nachts vor jedem Scheinwerfer ein Lichtkegel auf der Fahrbahn wie bei den Zügen: so lang und vorne so breit, Stärke, die Lampe so weit
 *  innen vom Rand des Wagens; seit 2026-11-17 zwei je Auto, links und rechts, schwächer (Michael: «die Lichtkegel nicht ganz so hell und …
 *  beide Kegel einblenden, das heißt von beiden Scheinwerfern links und rechts»; vorher einer, 7 m breit, 0,55); alles gewählt */
export const AUTO_KEGEL_LANG_M = 26, AUTO_KEGEL_BREIT_M = 4.5, AUTO_KEGEL_HELL = 0.3, AUTO_KEGEL_INNEN_M = 0.35
/** je Auto ein anderer Kegel (Michael, 2026-11-17: «Mal sind die Lichtkegel etwas länger, mal etwas dunkler … Auch das Licht … darf auch mal etwas
 *  wärmeres Licht ausstrahlen und etwas kühleres»): je Auto ein fester Zufall für die Länge (0,8- bis 1,2-fach), die Helligkeit (0,7- bis 1,15-fach) und
 *  den Farbton von warm über neutral bis kühl; Spannen und Farben gewählt */
export const KEGEL_LANG_SPANNE: [number, number] = [0.8, 1.2], KEGEL_HELL_SPANNE: [number, number] = [0.7, 1.15]
const KEGEL_WARM = new THREE.Color('#ffd49a'), KEGEL_NEUTRAL = new THREE.Color('#fff1d6'), KEGEL_KUEHL = new THREE.Color('#e4ecff')
export function kegelArt(id: number): { lang: number; farbe: THREE.Color } {
  const lang = KEGEL_LANG_SPANNE[0] + zufall(id * 3.17 + 0.7) * (KEGEL_LANG_SPANNE[1] - KEGEL_LANG_SPANNE[0])
  const hell = KEGEL_HELL_SPANNE[0] + zufall(id * 5.93 + 2.1) * (KEGEL_HELL_SPANNE[1] - KEGEL_HELL_SPANNE[0])
  const t = zufall(id * 7.41 + 4.4)
  const farbe = t < 0.5 ? KEGEL_WARM.clone().lerp(KEGEL_NEUTRAL, t * 2) : KEGEL_NEUTRAL.clone().lerp(KEGEL_KUEHL, (t - 0.5) * 2)
  return { lang, farbe: farbe.multiplyScalar(hell) }
}

/** 30 % der roten Autos grau (Michael, 2026-11-11: «30% der roten autos durch graue ersetzen»), Grau gewählt */
const ROT = new Set(['#8a1a1a', '#a8102e']), ROT_GRAU_ANTEIL = 0.3, ROT_GRAU = '#8c8c8c'
export function lackFarbe(i: number): THREE.Color {
  const f = LACK[Math.floor(zufall(i * 7.31 + 1.7) * LACK.length)]
  return new THREE.Color(ROT.has(f) && zufall(i * 3.77 + 9.1) < ROT_GRAU_ANTEIL ? ROT_GRAU : f)
}

/** ein fester Zufall 0 bis 1 */
export function zufall(x: number): number {
  const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** je Kette ihre Stücke nach dem Abstand vom Anfang und die Autos darauf */
export interface AutoKette { L: number; art: number; tag: number; nacht: number; stuecke: AutoStueck[]; autos: AutoPlatz[]
  /** ein Kreisel laut swissTLM3D (wer darin fährt, hat Vortritt) */
  kreisel?: boolean
  /** Anfang und Ende der ganzen Kette (Ost, Nord) und die Richtung dort (wohin die Kette läuft), für das Weiterfahren */
  enden?: [number, number, number, number]; richtungen?: [number, number, number, number]
  /** Anteil Lastwagen auf der rechten Spur (0 bis 1) am Tag und in der Nacht */
  lkwTag: number; lkwNacht: number
  /** übrige Strassen: so weit rechts der Achse fährt man (m) */
  quer: number
  /** übrige Strassen mit Gegenverkehr: die Fahrbahn im Luftbild gemessen (fahrbahnMessen), je Stelle s die Mitte rechts der Zeichnung und die halbe
   *  Breite in m; fehlt, wo nichts Brauchbares gemessen ist */
  mess?: { s: Float64Array; mitte: Float32Array; halb: Float32Array } }
/** ein Auto: Richtung (1 mit den Punkten, -1 dagegen), Spur, Tempo in m/s, Platz in der Kette zur Zeit 0, ab welchem Anteil der grössten
 *  Dichte es fährt */
export interface AutoPlatz { richtung: 1 | -1; spur: number; ms: number; s0: number; ab: number; farbe: number
  /** ein fester Zufall 0 bis 1: ein Lastwagen, solange er unter dem Anteil Lastwagen der Stunde liegt */
  lkw: number
  /** wo das Auto gerade fährt (weiterfahren): Kette, Meter in Fahrtrichtung, wie oft es schon abgebogen ist; dazu sein Platz am Anfang */
  kk?: AutoKette; lauf?: number; abgebogen?: number
  /** wohin es an der nächsten Kreuzung fährt (schon KURVE_HALB_M davor gewählt; null: nirgends), woher es kommt (bis KURVE_HALB_M danach) und die halbe
   *  Länge seines Bogens; das Tempo, auf das es zufährt; wie lange es schon vor einer Kreuzung wartet */
  nach?: { kk: AutoKette; richtung: 1 | -1 } | null; von?: { kk: AutoKette; richtung: 1 | -1; spur: number }; kurveH?: number
  msZiel?: number; wartet?: number
  /** wo es im letzten Bild gezeichnet war (Kollision), wie lange es schon vor einem anderen steht, ob es deshalb hindurch darf (dann versteckt, wo es überlappt) */
  bild?: AutoBild; steckt?: number; durch?: boolean
  /** von Hand entfernt (antippen, «Entfernen»; Michael, 2026-11-17), bis das Feld neu geladen wird */
  entfernt?: boolean
  /** das Auto, vor dem es zuletzt bremsen musste (Stau oder gegenseitige Blockade) */
  vor?: AutoPlatz
  heim?: { kk: AutoKette; richtung: 1 | -1; spur: number; ms: number } }

/** übrige Strassen ohne Trennung: je Richtung eine Spur, so weit rechts der Achse wie ein Viertel der Breite laut Klasse, mindestens und
 *  höchstens (gewählt) */
export const STRASSE_QUER_M: [number, number] = [1.1, 2.6]
/** übrige Strassen: Retusche nur ab dieser Breite laut Klasse (schmalere tragen kaum Verkehr; parkierte Autos bleiben), je Seite die halbe
 *  Breite und so viel dazu, gewählt */
export const STRASSE_RETUSCHE_AB_M = 6, STRASSE_RETUSCHE_PLUS_M = 1.5

/** Kolonnen: Anteil bis 1, 2, 3, 4 Autos (summiert; 35 % einzeln, 30 % zu zweit, 20 % zu dritt, 15 % zu viert) und der Abstand darin in Sekunden
 *  Fahrt, gewählt */
const KOLONNE_GROESSE = [0.35, 0.65, 0.85, 1], KOLONNE_ZEITLUECKE_S = 1.4

/** je Kette eine feste Menge Autos, so viele, wie bei der grössten Dichte (am Tag oder in der Nacht) auf ihr fahren; welche fahren, entscheidet
 *  der Anteil der Stunde (ab) */
export function kettenBauen(stuecke: AutoStueck[], verkehr: (kette: number) => [number, number, number | null, number | null] | null): Map<number, AutoKette> {
  const ketten = new Map<number, AutoKette>()
  for (const st of stuecke) {
    let k = ketten.get(st.kette)
    if (!k) {
      const v: [number, number, number | null, number | null] = st.strasse
        ? [st.strasse.tag, st.strasse.nacht, st.strasse.lkw, st.strasse.lkw]
        : verkehr(st.kette) ?? [...AUTO_OHNE_ZAEHLUNG, null, null]
      // auf getrennten Fahrbahnen alle Lastwagen rechts: dort doppelt so viele wie im Mittel (die Spuren tragen gleich viel), höchstens alle
      const rechts = st.art === 0 ? AUTO_SPUREN : 1
      const anteil = (p: number | null) => Math.min(1, ((p ?? AUTO_LKW_OHNE_ZAEHLUNG) / 100) * rechts)
      const quer = st.art === 2 ? Math.min(STRASSE_QUER_M[1], Math.max(STRASSE_QUER_M[0], (st.strasse?.breite ?? 6) / 4))
        : st.art === 3 ? 0 : AUTO_GEGEN_M
      k = { L: st.L, art: st.art, tag: v[0], nacht: v[1], stuecke: [], autos: [], lkwTag: anteil(v[2]), lkwNacht: anteil(v[3]), quer, kreisel: st.kreisel }
      ketten.set(st.kette, k)
    }
    k.stuecke.push(st)
  }
  for (const [id, k] of ketten) {
    k.stuecke.sort((a, c) => a.s0 - c.s0)
    const kmh = k.stuecke[0].strasse?.kmh ?? AUTO_KMH_GEGEN
    const spuren: Array<{ richtung: 1 | -1; spur: number; kmh: number }> = k.art === 0
      ? AUTO_KMH.map((kmh, spur) => ({ richtung: 1 as const, spur, kmh }))
      : k.art === 3 ? [{ richtung: 1, spur: 0, kmh }]
        : [{ richtung: 1, spur: 0, kmh }, { richtung: -1, spur: 0, kmh }]
    // je Richtung die Hälfte des Verkehrs beider Richtungen, auf die Spuren gleich verteilt (gewählt); Dichte = Verkehr je Stunde / Tempo;
    // auf Strassen einer Richtung (art 3) gilt der Verkehr dieser Richtung ganz
    const groesst = Math.max(k.tag, k.nacht) / (k.art === 3 ? 1 : 2) / (k.art === 0 ? AUTO_SPUREN : 1)
    let nr = 0
    for (const sp of spuren) {
      const jeKm = groesst / sp.kmh
      if (jeKm <= 0) continue
      const mittel = 1000 / jeKm
      // in Kolonnen (Michael, 2026-11-11: «nicht so perfekt verteilt, sondern mehr auch eine Anordnung von ein paar Autos hintereinander»): je
      // Kolonne 1 bis 4 Autos (KOLONNE_GROESSE) mit KOLONNE_ZEITLUECKE_S Abstand, mindestens eine Lastwagenlänge und etwas; die Lücke zur nächsten
      // so, dass im Mittel dieselbe Dichte bleibt, um ±40 % gestreut; ist der Verkehr so dicht, dass keine Lücke bleibt, wie bisher zufällig um das Mittel
      const eng = Math.max(LKW_LANG_M + 6, (sp.kmh / 3.6) * KOLONNE_ZEITLUECKE_S)
      let s = zufall(id * 3.1 + sp.spur * 1.3 + sp.richtung) * mittel, rest = 0, groesse = 1
      while (s < k.L) {
        const z = zufall(id * 17.7 + nr * 0.731)
        // auf der rechten Spur alle gleich schnell, sonst führen Wagen durch die Lastwagen
        const ms = (sp.kmh / 3.6) * (sp.spur === 0 ? 1 : 0.96 + 0.08 * zufall(nr * 3.7 + id))
        k.autos.push({ richtung: sp.richtung, spur: sp.spur, ms, s0: s, ab: z, farbe: Math.floor(zufall(id + nr * 1.91) * 997),
          lkw: sp.spur === 0 ? zufall(id * 2.9 + nr * 0.377 + 5) : 2 })
        nr++
        if (rest <= 0) {
          const w = zufall(id * 9.1 + nr * 0.53)
          groesse = KOLONNE_GROESSE.findIndex((g) => w < g) + 1 || 1
          rest = groesse
        }
        rest--
        const luecke = groesse * mittel - (groesse - 1) * eng
        s += luecke < 2 * eng ? Math.max(LKW_LANG_M + 6, mittel * (0.35 + 1.3 * zufall(id * 5.3 + nr * 1.17)))
          : rest > 0 ? eng * (1 + 0.3 * zufall(id * 2.3 + nr * 0.71)) : luecke * (0.6 + 0.8 * zufall(id * 5.3 + nr * 1.17))
      }
    }
  }
  spurenRechts(ketten)
  return ketten
}

/**
 * Spuren rechts des Mittelstreifens (Michael, 2026-11-17, Wankdorf: «Auf der Autobahn beim Wankdorf fahren die Meisten Autos auf der falschen Spur»):
 * swissTLM3D zeichnet die getrennten Fahrbahnen fast überall nahe am Mittelstreifen, die Gegenfahrbahn liegt meist nur 1 bis 5 m daneben (über das
 * ganze Netz nachgemessen: auf rund 2'700 von 3'000 km mit Gegenfahrbahn bis 30 m). Liegen die Spuren je zur Hälfte links und rechts der Achse, fährt
 * die linke im Mittelstreifen und die rechte auf der Überholspur. Darum liegen beide Spuren rechts der Achse, die linke MITTEL_RAND_M (gewählt) neben
 * ihr, wo die gegenläufige Fahrbahn bis MITTEL_NAH_M links liegt; ab MITTEL_WEIT_M wie bisher um die Achse, dazwischen gleitend. Wie viele Spuren eine
 * Fahrbahn hat und wo ihr rechter Rand ist, steht in keiner unserer Quellen: auf breiten Autobahnen bleibt die rechte Spur der Wirklichkeit leer.
 */
export const MITTEL_RAND_M = 0.6, MITTEL_NAH_M = 8, MITTEL_WEIT_M = 14
const MITTEL_SUCHE_M = 20, MITTEL_ZELLE_M = 40
function spurenRechts(ketten: Map<number, AutoKette>) {
  type Seg = { kk: AutoKette; e0: number; n0: number; e1: number; n1: number }
  const gitter = new Map<number, Seg[]>()
  for (const kk of ketten.values()) {
    if (kk.art !== 0) continue
    for (const st of kk.stuecke) for (let i = 0; i + 1 < st.e.length; i++) {
      const g: Seg = { kk, e0: st.e[i], n0: st.n[i], e1: st.e[i + 1], n1: st.n[i + 1] }
      const ex0 = Math.floor(Math.min(g.e0, g.e1) / MITTEL_ZELLE_M), ex1 = Math.floor(Math.max(g.e0, g.e1) / MITTEL_ZELLE_M)
      const ny0 = Math.floor(Math.min(g.n0, g.n1) / MITTEL_ZELLE_M), ny1 = Math.floor(Math.max(g.n0, g.n1) / MITTEL_ZELLE_M)
      for (let x = ex0; x <= ex1; x++) for (let y = ny0; y <= ny1; y++) {
        const z = x * 100_003 + y
        let l = gitter.get(z)
        if (!l) gitter.set(z, (l = []))
        l.push(g)
      }
    }
  }
  const voll = AUTO_SPUR_M * (AUTO_SPUREN / 2) + MITTEL_RAND_M
  for (const kk of ketten.values()) {
    if (kk.art !== 0) continue
    for (const st of kk.stuecke) {
      const z = st.e.length, r = new Float32Array(z)
      for (let i = 0; i < z; i++) {
        const a = Math.max(0, i - 1), b = Math.min(z - 1, i + 1)
        let de = st.e[b] - st.e[a], dn = st.n[b] - st.n[a]
        const l = Math.hypot(de, dn)
        if (l < 1e-6) continue
        de /= l; dn /= l
        const e = st.e[i], n = st.n[i]
        let links = Infinity
        const cx = Math.floor(e / MITTEL_ZELLE_M), cy = Math.floor(n / MITTEL_ZELLE_M)
        for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
          for (const g of gitter.get(x * 100_003 + y) ?? []) {
            if (g.kk === kk) continue
            const fe = g.e1 - g.e0, fn = g.n1 - g.n0, l2 = fe * fe + fn * fn
            if (l2 < 1e-6 || (fe * de + fn * dn) / Math.sqrt(l2) > -0.9) continue
            const t = Math.max(0, Math.min(1, ((e - g.e0) * fe + (n - g.n0) * fn) / l2))
            const qe = g.e0 + t * fe - e, qn = g.n0 + t * fn - n
            const d = Math.hypot(qe, qn)
            // links der Fahrtrichtung (de, dn) ist (-dn, de)
            if (d <= MITTEL_SUCHE_M && qe * -dn + qn * de > 0 && d < links) links = d
          }
        }
        r[i] = links <= MITTEL_NAH_M ? voll : links >= MITTEL_WEIT_M ? 0 : voll * (MITTEL_WEIT_M - links) / (MITTEL_WEIT_M - MITTEL_NAH_M)
      }
      st.rechts = r
    }
  }
}

/** wo in der Kette an der Stelle s (m vom Anfang): Ost, Nord, Höhe laut swissTLM3D, Richtung, auf einer Brücke; null, wo kein Stück gezeichnet ist
 *  (Tunnel, ausserhalb der Kacheln) */
export function autoBei(k: AutoKette, s: number): { e: number; n: number; h: number; de: number; dn: number; bruecke: boolean; rechts: number } | null {
  const p = rohBei(k, s)
  if (!p) return p
  // durch Kurven fliessend statt von Ecke zu Ecke (Michael, 2026-11-13: «Die Autos auf den Straßen fahren nicht schöne Bogen … ziemlich eckig um eine
  // Kurve»): die Lage gemittelt über KURVE_GLATT_M davor und danach, gewichtet wie ein Dreieck, die Richtung aus der Lage davor und danach; wo dort
  // nichts gezeichnet ist (Tunnel, Rand), gilt die Stelle selbst. Die Kurve rückt dabei etwas nach innen, gewählt
  const W = k.art === 0 ? KURVE_GLATT_M[0] : KURVE_GLATT_M[1]
  let se = 0, sn = 0, sw = 0, ve = 0, vn = 0
  for (let i = -3; i <= 3; i++) {
    const q = i === 0 ? p : rohBei(k, s + (i * W) / 3) ?? p, w = 4 - Math.abs(i)
    se += q.e * w; sn += q.n * w; sw += w
    if (i !== 0) { ve += Math.sign(i) * q.e; vn += Math.sign(i) * q.n }
  }
  const l = Math.hypot(ve, vn)
  return { ...p, e: se / sw, n: sn / sw, de: l > 1e-6 ? ve / l : p.de, dn: l > 1e-6 ? vn / l : p.dn }
}

/** so weit davor und danach mittelt autoBei die Lage, auf Autobahnen und übrigen Strassen (m, gewählt) */
const KURVE_GLATT_M: [number, number] = [15, 7]

function rohBei(k: AutoKette, s: number): { e: number; n: number; h: number; de: number; dn: number; bruecke: boolean; rechts: number } | null {
  const st = k.stuecke
  let lo = 0, hi = st.length - 1, i = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (st[m].s0 <= s) { i = m; lo = m + 1 } else hi = m - 1
  }
  if (i < 0) return null
  const a = st[i], z = a.s.length
  if (s > a.s[z - 1]) return null
  let j = 0, j1 = z - 2
  while (j < j1) {
    const m = (j + j1 + 1) >> 1
    if (a.s[m] <= s) j = m; else j1 = m - 1
  }
  const l = a.s[j + 1] - a.s[j] || 1, t = (s - a.s[j]) / l
  const de = (a.e[j + 1] - a.e[j]) / l, dn = (a.n[j + 1] - a.n[j]) / l
  const r = a.rechts ? a.rechts[j] + t * (a.rechts[j + 1] - a.rechts[j]) : 0
  return { e: a.e[j] + t * (a.e[j + 1] - a.e[j]), n: a.n[j] + t * (a.n[j + 1] - a.n[j]), h: a.h[j] + t * (a.h[j + 1] - a.h[j]), de, dn, bruecke: a.bruecke, rechts: r }
}

/** die stehenden Autos im Luftbild weg: je Bildpunkt auf der Fahrbahn der Median der Farben entlang der Fahrbahn, AUTO_RETUSCHE_LAENGS_M davor
 *  und danach. Ein Auto ist kürzer als die Hälfte davon und verschwindet; Randlinien bleiben, unterbrochene Linien werden blasser; im Stau
 *  bleiben Autos stehen. Keine künstliche Intelligenz, nicht aus einer Quelle */
export function fahrbahnRetusche(ctx: CanvasRenderingContext2D, w: number, h: number, e0: number, n1: number, pxJeM: number, streifen: Streifen[]): Retusche[] {
  const raus: Retusche[] = []
  const pxM = 1 / pxJeM, schritt = Math.max(1, pxM), proben = Math.max(5, Math.round((2 * AUTO_RETUSCHE_LAENGS_M) / schritt) | 1)
  const rr = new Uint8Array(proben), gg = new Uint8Array(proben), bb = new Uint8Array(proben)
  const median = (a: Uint8Array, z: number) => { const s = a.subarray(0, z).sort(); return s[z >> 1] }
  for (const s of streifen) {
    const breit = Math.max(...s.hi, ...s.lo.map((x) => -x)) + AUTO_RETUSCHE_LAENGS_M + 2
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [e, n] of s.p) {
      x0 = Math.min(x0, (e - breit - e0) * pxJeM); x1 = Math.max(x1, (e + breit - e0) * pxJeM)
      y0 = Math.min(y0, (n1 - n - breit) * pxJeM); y1 = Math.max(y1, (n1 - n + breit) * pxJeM)
    }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1))
    if (x1 - x0 < 2 || y1 - y0 < 2) continue
    const bw = x1 - x0, bh = y1 - y0
    const bild = ctx.getImageData(x0, y0, bw, bh), q = bild.data, z = new Uint8ClampedArray(q)
    const fertig = new Uint8Array(bw * bh)
    let geaendert = false
    for (let i = 0; i + 1 < s.p.length; i++) {
      const [ae, an] = s.p[i], [be, bn] = s.p[i + 1], l = Math.hypot(be - ae, bn - an)
      if (l < 0.01) continue
      const ue = (be - ae) / l, un = (bn - an) / l, qe = -un, qn = ue
      const r = Math.max(-s.lo[i], s.hi[i])
      const xa = Math.max(x0, Math.floor((Math.min(ae, be) - r - e0) * pxJeM)), xb = Math.min(x1, Math.ceil((Math.max(ae, be) + r - e0) * pxJeM))
      const ya = Math.max(y0, Math.floor((n1 - Math.max(an, bn) - r) * pxJeM)), yb = Math.min(y1, Math.ceil((n1 - Math.min(an, bn) + r) * pxJeM))
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const o1 = (y - y0) * bw + (x - x0)
          if (fertig[o1]) continue
          const e = e0 + (x + 0.5) * pxM, n = n1 - (y + 0.5) * pxM
          const t = (e - ae) * ue + (n - an) * un
          if (t < 0 || t > l) continue
          const d = (e - ae) * qe + (n - an) * qn
          if (d < s.lo[i] || d > s.hi[i]) continue
          let zahl = 0
          for (let k = 0; k < proben; k++) {
            const o = (k - (proben - 1) / 2) * schritt
            const px = Math.floor((e + ue * o - e0) * pxJeM) - x0, py = Math.floor((n1 - (n + un * o)) * pxJeM) - y0
            if (px < 0 || py < 0 || px >= bw || py >= bh) continue
            const p4 = (py * bw + px) * 4
            rr[zahl] = z[p4]; gg[zahl] = z[p4 + 1]; bb[zahl] = z[p4 + 2]; zahl++
          }
          if (zahl < 3) continue
          const o4 = o1 * 4
          q[o4] = median(rr, zahl); q[o4 + 1] = median(gg, zahl); q[o4 + 2] = median(bb, zahl)
          fertig[o1] = 1
          geaendert = true
        }
      }
    }
    if (!geaendert) continue
    const vor = new ImageData(z, bw, bh)
    ctx.putImageData(bild, x0, y0)
    raus.push({ x: x0, y: y0, vor, nach: bild })
  }
  return raus
}

/** die Retusche zurück, nur wo seither nichts anderes ins Bild gemalt hat */
export function retuscheZurueck(ctx: CanvasRenderingContext2D, liste: Retusche[]) {
  for (const r of [...liste].reverse()) {
    const jetzt = ctx.getImageData(r.x, r.y, r.vor.width, r.vor.height), j = jetzt.data, v = r.vor.data, nach = r.nach.data
    for (let i = 0; i < j.length; i += 4) {
      if (j[i] === nach[i] && j[i + 1] === nach[i + 1] && j[i + 2] === nach[i + 2]) { j[i] = v[i]; j[i + 1] = v[i + 1]; j[i + 2] = v[i + 2] }
    }
    ctx.putImageData(jetzt, r.x, r.y)
  }
}

/**
 * Halten für Fussgänger (Michael, 2026-11-10: «Genau ein Auto darf auch mal halten (bei Fussgänger hie und da) und auch mal hupen»): ab und zu hält
 * innerorts ein Auto vor einer Stelle, an der ein gezeichneter Fussgänger die Strasse quert; die Autos dahinter stauen sich und fahren danach
 * wieder an. Erfunden: wo, wann und wie oft, die Fussgänger, das Bremsen und Anfahren; Fussgängerstreifen stehen in keiner unserer Quellen.
 */
/** Bremsen und Anfahren in m/s², Lücke zum Vordermann im Stau, Aufholen danach (Anteil des Tempos), gewählt */
export const HALT_BREMSEN = 3, HALT_ANFAHREN = 2, HALT_LUECKE_M = 2, HALT_AUFHOLEN = 1.3
/** so oft je Sekunde beginnt ein Halt, wenn innerorts Autos in der Nähe der Hörstelle fahren, höchstens so viele zugleich, so nah, gewählt */
export const HALT_JE_S = 0.07, HALT_HOECHSTENS = 2, HALT_NAH_M = 450
/** der Fussgänger quert so schnell, so weit vor der Haltelinie; so oft hupt einer dahinter, gewählt */
export const FUSS_MS = 1.3, FUSS_VOR_M = 2.5, HALT_HUPE = 0.3

export interface Halt { kk: AutoKette; richtung: 1 | -1; S: number; bis: number; fussAb: number; fussBis: number
  e: number; n: number; de: number; dn: number; halb: number; hupenUm: number | null; fuss: THREE.Object3D | null }
/** je Auto im Stau: wie viele Meter hinter seinem Platz laut der Kette (lauf) und sein Tempo jetzt in m/s */
export interface Verzug { v: number; sp: number }

/** die Plätze einer gestauten Kette neu: jedes Auto bremst vor der Haltelinie oder seinem Vordermann (höchstens HALT_BREMSEN), fährt danach mit
 *  HALT_ANFAHREN an und holt mit HALT_AUFHOLEN seines Tempos auf, bis es wieder an seinem Platz ist; gibt zurück, ob noch etwas gestaut ist */
export function stauRechnen(liste: Array<{ a: AutoPlatz; lauf: number; lang: number }>, halte: Halt[], verzug: Map<AutoPlatz, Verzug>, jetzt: number, dt: number): boolean {
  let noch = halte.some((h) => jetzt < h.bis)
  for (const r of [1, -1] as const) {
    const halt = halte.find((h) => h.richtung === r && jetzt < h.bis) ?? null
    const reihe = liste.filter((x) => x.a.richtung === r).map((x) => {
      const z = verzug.get(x.a) ?? { v: 0, sp: x.a.ms }
      return { ...x, z, pos: x.lauf - z.v }
    })
    reihe.sort((u, w) => w.pos - u.pos)
    let vor = halt ? halt.S : Infinity, vorHalb = 0, linie = !!halt
    for (const x of reihe) {
      const grenze = linie ? vor - x.lang / 2 - 1 : vor - vorHalb - x.lang / 2 - HALT_LUECKE_M
      // schon über der Linie und frei: fährt weiter, ist kein Vordermann der anderen
      if (linie && x.z.v === 0 && x.pos > grenze) continue
      linie = false
      const ziel = x.a.ms * (x.z.v > 0.01 ? HALT_AUFHOLEN : 1)
      const erlaubt = Math.sqrt(2 * HALT_BREMSEN * Math.max(0, grenze - x.pos))
      x.z.sp = Math.max(0, Math.min(x.z.sp + HALT_ANFAHREN * dt, ziel, erlaubt))
      x.z.v = Math.max(0, x.z.v + (x.a.ms - x.z.sp) * dt)
      x.pos = x.lauf - x.z.v
      if (x.pos > grenze) { x.pos = grenze; x.z.v = Math.max(0, x.lauf - grenze); x.z.sp = 0 }
      vor = x.pos; vorHalb = x.lang / 2
      if (x.z.v > 0.01 || x.z.sp < x.a.ms - 0.01) { verzug.set(x.a, x.z); noch = true } else verzug.delete(x.a)
    }
  }
  return noch
}

/** ein Fussgänger, gezeichnet: Beine, Körper, Kopf, 1,75 m; Farbe des Oberteils gewählt */
const FUSS_FARBEN = ['#2b5d34', '#1f3f7a', '#a8102e', '#c9a227', '#f2f2f2', '#3c3c3c', '#8a1a1a']
export function fussgaenger(nr: number): THREE.Group {
  const g = new THREE.Group()
  const teil = (b: number, h: number, t: number, y: number, farbe: string, x = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b / 1000, h / 1000, t / 1000), new THREE.MeshLambertMaterial({ color: farbe }))
    m.position.set(x / 1000, y / 1000, 0); m.castShadow = true
    g.add(m)
    return m
  }
  teil(0.16, 0.85, 0.18, 0.425, '#2a2d33', -0.11).name = 'bein'
  teil(0.16, 0.85, 0.18, 0.425, '#2a2d33', 0.11).name = 'bein'
  teil(0.46, 0.62, 0.26, 1.16, FUSS_FARBEN[Math.floor(zufall(nr * 1.7) * FUSS_FARBEN.length)])
  teil(0.22, 0.24, 0.22, 1.6, '#d9b08c')
  return g
}
export function fussWeg(g: THREE.Object3D) {
  g.removeFromParent()
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose() } })
}


/** Spuren nach dem Luftbild (Michael, 2026-11-11: «Kannst du auf der Karte sehen wo sie Strasse genau ist und die Links und Rechts Spuren? Die Autos
 *  sollten auf ihrer Spur fahren. Rechtsverkehr»): auf Strassen mit Gegenverkehr alle MESS_SCHRITT_M quer zur Achse die Farben des Luftbilds vor der
 *  Retusche; als Fahrbahn gilt, was höchstens MESS_FARBE vom Belag an der Achse (Median über die ganze Kette) abweicht, Lücken bis MESS_LUECKE_M (Linien,
 *  Autos) überbrückt; die Fahrbahn ist das zusammenhängende Stück nächst der Achse, so breit wie 0,7- bis 1,5-mal die Klasse, die Mitte höchstens
 *  MESS_MITTE_M neben der Achse; je Stelle der Median über MESS_GLATT Stellen davor und danach; gilt für die Kette, wenn mindestens MESS_ANTEIL der
 *  Stellen etwas ergeben. Die Autos fahren dann um die gemessene Mitte, je Richtung in der Mitte ihrer Hälfte. Alles gewählt, nicht aus einer Quelle */
export const MESS_SCHRITT_M = 6, MESS_FARBE = 38, MESS_LUECKE_M = 0.9, MESS_MITTE_M = 4, MESS_GLATT = 3, MESS_ANTEIL = 0.4
const MESS_BREIT: [number, number] = [0.7, 1.5]
export function fahrbahnMessen(k: AutoKette, farbe: (e: number, n: number) => number, pxM: number) {
  if (k.art !== 2 || !k.stuecke.length) return
  const klasse = k.stuecke[0].strasse?.breite ?? 6
  const weit = klasse * MESS_BREIT[1] / 2 + 2, schritt = Math.max(0.25, pxM * 0.75), z = Math.ceil(weit / schritt)
  const a0 = k.stuecke[0].s0, a1 = k.stuecke[k.stuecke.length - 1].s[k.stuecke[k.stuecke.length - 1].s.length - 1]
  const stellen: Array<{ s: number; t: Int32Array }> = []
  const nah: number[][] = [[], [], []]
  for (let s = a0 + MESS_SCHRITT_M / 2; s < a1; s += MESS_SCHRITT_M) {
    const p = autoBei(k, s)
    if (!p || p.bruecke) continue
    const t = new Int32Array(2 * z + 1)
    for (let i = -z; i <= z; i++) {
      const c = farbe(p.e + p.dn * i * schritt, p.n - p.de * i * schritt)
      t[i + z] = c
      if (c >= 0 && Math.abs(i * schritt) <= 1.5) { nah[0].push(c >> 16); nah[1].push((c >> 8) & 255); nah[2].push(c & 255) }
    }
    stellen.push({ s, t })
  }
  if (stellen.length < 3 || nah[0].length < 10) return
  const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1]
  const ref = nah.map(med)
  const luecke = Math.round(MESS_LUECKE_M / schritt)
  const mitte = new Float32Array(stellen.length).fill(NaN), halb = new Float32Array(stellen.length).fill(NaN)
  stellen.forEach(({ t }, j) => {
    const ist = (i: number) => { const c = t[i]; return c >= 0 && Math.hypot((c >> 16) - ref[0], ((c >> 8) & 255) - ref[1], (c & 255) - ref[2]) <= MESS_FARBE }
    // zusammenhängende Stücke mit überbrückten Lücken, das nächst der Achse
    let best: [number, number] | null = null, bestAbst = Infinity
    let i = 0
    while (i < t.length) {
      if (!ist(i)) { i++; continue }
      let ende = i, fehl = 0
      for (let x = i + 1; x < t.length; x++) {
        if (ist(x)) { ende = x; fehl = 0 } else if (++fehl > luecke) break
      }
      const lo = (i - z) * schritt, hi = (ende - z) * schritt, abst = lo <= 0 && hi >= 0 ? 0 : Math.min(Math.abs(lo), Math.abs(hi))
      if (abst < bestAbst) { bestAbst = abst; best = [lo, hi] }
      i = ende + 1
    }
    if (!best) return
    const breite = best[1] - best[0] + schritt, m = (best[0] + best[1]) / 2
    // am Rand des Fensters abgeschnitten heisst: zu breit
    if (best[0] <= -z * schritt || best[1] >= z * schritt) return
    if (breite < klasse * MESS_BREIT[0] || breite > klasse * MESS_BREIT[1] || Math.abs(m) > MESS_MITTE_M) return
    mitte[j] = m; halb[j] = breite / 2
  })
  const gut = mitte.filter((x) => !Number.isNaN(x)).length
  if (gut < stellen.length * MESS_ANTEIL) return
  const glatt = (a: Float32Array) => Float32Array.from(a, (_, j) => {
    const w: number[] = []
    for (let x = Math.max(0, j - MESS_GLATT); x <= Math.min(a.length - 1, j + MESS_GLATT); x++) if (!Number.isNaN(a[x])) w.push(a[x])
    return w.length ? med(w) : NaN
  })
  const gm = glatt(mitte), gh = glatt(halb)
  // Stellen ohne Wert vom nächsten mit Wert
  for (const a of [gm, gh]) {
    let letzt = NaN
    for (let j = 0; j < a.length; j++) { if (Number.isNaN(a[j])) a[j] = letzt; else letzt = a[j] }
    letzt = NaN
    for (let j = a.length - 1; j >= 0; j--) { if (Number.isNaN(a[j])) a[j] = letzt; else letzt = a[j] }
  }
  if (gm.some((x) => Number.isNaN(x))) return
  k.mess = { s: Float64Array.from(stellen, (x) => x.s), mitte: gm, halb: gh }
}

/** gemessene Mitte (rechts der Zeichnung) und Abstand der Spur von ihr an der Stelle s, null ohne Messung */
export function spurBei(k: AutoKette, s: number): [number, number] | null {
  const m = k.mess
  if (!m) return null
  const a = m.s
  let lo = 0, hi = a.length - 1
  if (s <= a[0]) return [m.mitte[0], Math.min(STRASSE_QUER_M[1], Math.max(STRASSE_QUER_M[0], m.halb[0] / 2))]
  if (s >= a[hi]) return [m.mitte[hi], Math.min(STRASSE_QUER_M[1], Math.max(STRASSE_QUER_M[0], m.halb[hi] / 2))]
  while (hi - lo > 1) { const x = (lo + hi) >> 1; if (a[x] <= s) lo = x; else hi = x }
  const t = (s - a[lo]) / (a[hi] - a[lo] || 1)
  const mi = m.mitte[lo] + t * (m.mitte[hi] - m.mitte[lo]), h = m.halb[lo] + t * (m.halb[hi] - m.halb[lo])
  return [mi, Math.min(STRASSE_QUER_M[1], Math.max(STRASSE_QUER_M[0], h / 2))]
}

/**
 * Weiterfahren über Kreuzungen und Kreisel (Michael, 2026-11-16: «bei den Kreiseln und Kreuzungen, dass sie einfach verschwinden»): am Ende seiner Kette
 * fährt ein Auto auf eine Kette weiter, die dort anschliesst (Anfang oder Ende bis ANSCHLUSS_M daneben, laut pipeline/build_autos.py), in einer Richtung, die
 * sie erlaubt (Einbahn und Kreisel nur vorwärts), nicht zurück (Wende über WENDE_GRAD) und nicht auf dieselbe; welche, entscheidet ein fester Zufall des
 * Autos, gewichtet nach dem Verkehr der Kette laut ASTRA oder ARE und GEWICHT_DAZU. Schliesst nichts an (Sackgasse, ausserhalb der geladenen Kacheln),
 * fährt es wie bisher wieder vom Anfang seiner eigenen Kette. Erfunden: welche Autos wohin abbiegen; Abbiegespuren, Vortritt und Ampeln gibt es nicht.
 */
export const ANSCHLUSS_M = 3, WENDE_GRAD = 150, GEWICHT_DAZU = 150
/** Strassen ohne eigene Autos (zu wenig Verkehr laut Modell oder ohne Wert, etwa Quartierstrassen) zählen so viel, damit selten jemand hineinfährt (gewählt) */
const GEWICHT_OHNE = 12
const NETZ_ZELLE_M = 4
export type AutoNetz = Map<string, Array<{ kk: AutoKette; ende: 0 | 1 }>>
const netzSchl = (e: number, n: number) => `${Math.round(e / NETZ_ZELLE_M)}_${Math.round(n / NETZ_ZELLE_M)}`

/** die Richtung der Kette am Anfang (aus den ersten Metern) und am Ende, wo gezeichnet; sonst 0 */
function endRichtung(k: AutoKette, s: number, r: number): [number, number] {
  const a = rohBei(k, s), b = rohBei(k, s + r)
  if (!a || !b) return [0, 0]
  const l = Math.hypot(b.e - a.e, b.n - a.n)
  return l > 1e-6 ? [(b.e - a.e) / l * Math.sign(r), (b.n - a.n) / l * Math.sign(r)] : [0, 0]
}

export function netzBauen(ketten: Iterable<AutoKette>): AutoNetz {
  const netz: AutoNetz = new Map()
  const dazu = (e: number, n: number, kk: AutoKette, ende: 0 | 1) => {
    const schl = netzSchl(e, n)
    let l = netz.get(schl)
    if (!l) netz.set(schl, (l = []))
    l.push({ kk, ende })
  }
  for (const kk of ketten) {
    const en = kk.stuecke.find((x) => x.enden)?.enden
    if (!en) continue
    kk.enden = en
    const a = endRichtung(kk, 0.5, 6), b = endRichtung(kk, kk.L - 6.5, 6)
    kk.richtungen = [a[0], a[1], b[0], b[1]]
    dazu(en[0], en[1], kk, 0); dazu(en[2], en[3], kk, 1)
  }
  return netz
}

/** das Tempo auf einer Kette und Spur in km/h, wie in kettenBauen */
export function kmhAuf(kk: AutoKette, spur: number): number {
  return kk.art === 0 ? AUTO_KMH[Math.min(spur, AUTO_KMH.length - 1)] : kk.stuecke[0].strasse?.kmh ?? AUTO_KMH_GEGEN
}

/** wohin ein Auto am Ende seiner Kette weiterfährt, oder null */
export function weiterNach(netz: AutoNetz, a: AutoPlatz, kk: AutoKette, richtung: 1 | -1): { kk: AutoKette; richtung: 1 | -1 } | null {
  const en = kk.enden, ri = kk.richtungen
  if (!en || !ri) return null
  const e = richtung === 1 ? en[2] : en[0], n = richtung === 1 ? en[3] : en[1]
  // Richtung beim Ankommen: am Ende vorwärts die Richtung der Kette, am Anfang rückwärts ihr Gegenteil
  const ie = richtung === 1 ? ri[2] : -ri[0], in_ = richtung === 1 ? ri[3] : -ri[1]
  const kand: Array<{ kk: AutoKette; richtung: 1 | -1; w: number }> = []
  const cx = Math.round(e / NETZ_ZELLE_M), cy = Math.round(n / NETZ_ZELLE_M)
  const cosWende = Math.cos((WENDE_GRAD * Math.PI) / 180)
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const c of netz.get(`${cx + dx}_${cy + dy}`) ?? []) {
      if (c.kk === kk || !c.kk.enden || !c.kk.richtungen) continue
      const ce = c.ende === 0 ? c.kk.enden[0] : c.kk.enden[2], cn = c.ende === 0 ? c.kk.enden[1] : c.kk.enden[3]
      if (Math.hypot(ce - e, cn - n) > ANSCHLUSS_M) continue
      // vom Anfang vorwärts, immer; vom Ende rückwärts nur auf Strassen mit beiden Richtungen
      const r: 1 | -1 = c.ende === 0 ? 1 : -1
      if (r === -1 && c.kk.art !== 1 && c.kk.art !== 2) continue
      const oe = r === 1 ? c.kk.richtungen[0] : -c.kk.richtungen[2], on = r === 1 ? c.kk.richtungen[1] : -c.kk.richtungen[3]
      if ((ie || in_) && (oe || on) && ie * oe + in_ * on < cosWende) continue
      if (kand.some((x) => x.kk === c.kk)) continue
      const verkehr = Math.max(c.kk.tag, c.kk.nacht) / (c.kk.art === 3 || c.kk.art === 0 ? 1 : 2)
      kand.push({ kk: c.kk, richtung: r, w: verkehr + (verkehr > 0 ? GEWICHT_DAZU : GEWICHT_OHNE) })
    }
  }
  if (!kand.length) return null
  const summe = kand.reduce((x, c) => x + c.w, 0)
  let z = zufall(a.farbe * 7.31 + (a.abgebogen ?? 0) * 1.937 + e * 0.013) * summe
  for (const c of kand) { z -= c.w; if (z <= 0) return { kk: c.kk, richtung: c.richtung } }
  return kand[kand.length - 1]
}

/**
 * Abbiegen im Bogen (Michael, 2026-11-16: «Beim Abbiegen spicken die Autos herum in die nächste Strasse. Geht das auch mit einer schönen runden Kurve»):
 * KURVE_HALB_M vor dem Ende seiner Kette wählt ein Auto, wohin es weiterfährt, und fährt dann auf einem Bogen (quadratische Bézierkurve) von seiner Spur
 * vor der Kreuzung auf die Spur der neuen Kette KURVE_HALB_M danach, die Spitze des Bogens dort, wo sich die Richtungen beider Spuren kreuzen; Tempo
 * gleitet mit AUTO_ANFAHREN zum Tempo der neuen Kette und bremst mit AUTO_BREMSEN. Alles gewählt.
 *
 * Rechtsvortritt (Michael, 2026-11-16: «In der Schweiz gilt übrigens Rechtsvortritt»): auf übrigen Strassen wartet ein Auto, das weniger als VORTRITT_M
 * vor einer Kreuzung ist, wenn dort zugleich eines von rechts kommt (bis VORTRITT_M davor), mit HALT_VOR_KREUZUNG_M Abstand; wer im Kreisel fährt, hat
 * Vortritt, wer hineinfährt, wartet; Autos dahinter halten Abstand. Nach VORTRITT_HOECHSTENS_S Warten fährt es trotzdem (sonst blockieren sich vier
 * Autos an einer Kreuzung gegenseitig). Signale, Ampeln, Stoppstrassen und Vortritt durch Markierung stehen in keiner unserer Quellen und fehlen.
 */
export const KURVE_HALB_M = 8, AUTO_ANFAHREN = 2, AUTO_BREMSEN = 3.5
export const VORTRITT_M = 14, HALT_VOR_KREUZUNG_M = 3, VORTRITT_HOECHSTENS_S = 4, FOLGE_ABSTAND_M = 7

/** Lage auf einer Kette in Fahrtrichtung mit dem Versatz der Spur; null, wo nichts gezeichnet ist */
export type SpurLage = { e: number; n: number; h: number; de: number; dn: number; bruecke: boolean }
export function spurLage(kk: AutoKette, richtung: 1 | -1, spur: number, lauf: number): SpurLage | null {
  const s = richtung === 1 ? lauf : kk.L - lauf
  const p = autoBei(kk, s)
  if (!p) return null
  const de = p.de * richtung, dn = p.dn * richtung
  const sp = kk.art === 2 ? spurBei(kk, s) : null
  const quer = kk.art === 0 ? ((AUTO_SPUREN - 1) / 2 - spur) * AUTO_SPUR_M + p.rechts : sp ? sp[1] : kk.quer
  return { e: p.e + dn * quer + (sp ? p.dn * sp[0] : 0), n: p.n - de * quer - (sp ? p.de * sp[0] : 0), h: p.h, de, dn, bruecke: p.bruecke }
}

/** die Stelle auf dem Bogen zwischen zwei Spurlagen (t 0 bis 1) */
export function bogen(a: SpurLage, b: SpurLage, t: number, H: number): SpurLage {
  // Spitze: wo sich die Geraden durch a in Richtung a und durch b gegen Richtung b kreuzen; parallel oder zu weit: die Mitte
  const det = a.de * -b.dn - a.dn * -b.de
  let ce = (a.e + b.e) / 2, cn = (a.n + b.n) / 2
  if (Math.abs(det) > 0.05) {
    const u = ((b.e - a.e) * -b.dn - (b.n - a.n) * -b.de) / det
    if (u > 0 && u < 3 * H) { ce = a.e + a.de * u; cn = a.n + a.dn * u }
  }
  const s = 1 - t
  const e = s * s * a.e + 2 * s * t * ce + t * t * b.e, n = s * s * a.n + 2 * s * t * cn + t * t * b.n
  let de = 2 * s * (ce - a.e) + 2 * t * (b.e - ce), dn = 2 * s * (cn - a.n) + 2 * t * (b.n - cn)
  const l = Math.hypot(de, dn)
  if (l > 1e-6) { de /= l; dn /= l } else { de = a.de; dn = a.dn }
  return { e, n, h: a.h + (b.h - a.h) * t, de, dn, bruecke: a.bruecke && b.bruecke }
}

/**
 * Nie ineinander (Michael, 2026-11-16: «Ist es möglich es so zu konfigurieren dass Autos nie kollidieren?»): jedes Auto schaut nach den Lagen des
 * letzten Bilds bis KORRIDOR_VORAUS_M voraus in einem Streifen so breit wie es selbst und das andere (ohne Gegenverkehr und ohne die andere Spur derselben Autobahn) und bremst so, dass
 * KORRIDOR_LUECKE_M bleiben, auf allen Strassen, auch über Kreuzungen, Einmündungen und Kreisel hinweg. Sehen sich zwei gegenseitig (etwa quer in
 * einer Kreuzung), wartet, wer das andere rechts hat (Rechtsvortritt), sonst nach einem festen Zufall. Stau darf sein (Michael, 2026-11-16: «Es darf
 * auch mal einen Stau geben. Ist realistisch. Wenn der Verkehr zum Erliegen kommt kannst du eines nach dem anderen ja löschen damits wieder vorwärts
 * geht»): wer hinter einem anderen steht, wartet, so lange es dauert. Nur wenn Autos im Kreis aufeinander warten (jedes steht länger als
 * KORRIDOR_STECKT_S vor dem nächsten, das letzte vor dem ersten), verschwindet eines davon, das am längsten steht, eines nach dem anderen; es fährt
 * unsichtbar weiter und erscheint erst wieder, wenn es keines mehr überlappt. Steht eines länger als KORRIDOR_HOECHSTENS_S, gilt es ebenso als
 * blockiert. Ebenso nach einem Sprung der Zeit. Was sich überlappt, prüft das Bild zuletzt noch einmal (Rechtecke, quer auf KORRIDOR_BREITE_ANTEIL, damit sich Gegenverkehr auf schmalen
 * Strassen kreuzen kann). Alles gewählt.
 */
export const KORRIDOR_VORAUS_M = 45, KORRIDOR_LUECKE_M = 2, KORRIDOR_RAND_M = 0.3, KORRIDOR_STECKT_S = 8, KORRIDOR_HOECHSTENS_S = 120, KORRIDOR_BREITE_ANTEIL = 0.8
export interface AutoBild { a: AutoPlatz; e: number; n: number; de: number; dn: number; lang: number; breit: number }
const ZELLE_M = KORRIDOR_VORAUS_M
const zelle = (e: number, n: number) => Math.floor(e / ZELLE_M) * 100_003 + Math.floor(n / ZELLE_M)
export class AutoRaster {
  zellen = new Map<number, AutoBild[]>()
  leeren() { this.zellen.clear() }
  dazu(x: AutoBild) { const z = zelle(x.e, x.n); let l = this.zellen.get(z); if (!l) this.zellen.set(z, (l = [])); l.push(x) }
  *nahe(e: number, n: number) {
    const ze = Math.floor(e / ZELLE_M), zn = Math.floor(n / ZELLE_M)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = this.zellen.get((ze + i) * 100_003 + zn + j); if (l) yield* l }
  }
}

/** wie viel Platz x vor sich hat bis y (Infinity: y nicht im Weg) */
function imWeg(x: AutoBild, y: AutoBild): number {
  const gleich = x.de * y.de + x.dn * y.dn
  if (gleich < -0.7) return Infinity
  // Autobahn: andere Spur derselben Fahrbahn ist nie im Weg (in langen Kurven läge sie sonst voraus im Streifen)
  if (x.a.kk && x.a.kk === y.a.kk && x.a.kk.art === 0 && x.a.spur !== y.a.spur) return Infinity
  const halbQuer = (x.breit + y.breit) / 2 * KORRIDOR_BREITE_ANTEIL + KORRIDOR_RAND_M, quer = y.breit / 2 * (1 - Math.abs(gleich))
  let platz = Infinity
  for (const t of [-0.5, 0, 0.5]) {
    const pe = y.e + y.de * y.lang * t - x.e, pn = y.n + y.dn * y.lang * t - x.n
    const laengs = pe * x.de + pn * x.dn, seit = Math.abs(pe * x.dn - pn * x.de)
    if (laengs <= 0 || laengs > KORRIDOR_VORAUS_M || seit > halbQuer) continue
    platz = Math.min(platz, laengs - x.lang / 2 - quer - (t === 0 ? y.lang / 2 * Math.abs(gleich) : 0))
  }
  return platz
}

/** ob x gegenüber y Vortritt hat, wenn sie sich gegenseitig im Weg sind: y kommt nicht von rechts; geradeaus gegenüber nach dem festen Zufall */
function vortritt(x: AutoBild, y: AutoBild) {
  const rechts = (y.e - x.e) * x.dn - (y.n - x.n) * x.de
  return Math.abs(rechts) > 0.5 ? rechts < 0 : x.a.s0 > y.a.s0
}

/** Platz bis zum nächsten Auto im Weg (nach dem Raster des letzten Bilds) minus die Lücke */
export function korridorPlatz(x: AutoBild, raster: AutoRaster): number {
  let platz = Infinity
  x.a.vor = undefined
  for (const y of raster.nahe(x.e, x.n)) {
    if (y.a === x.a) continue
    const p = imWeg(x, y)
    if (p >= platz) continue
    if (imWeg(y, x) < Infinity && vortritt(x, y)) continue
    platz = p; x.a.vor = y.a
  }
  return platz - KORRIDOR_LUECKE_M
}

/** ob x ein schon gezeichnetes Auto überlappt (Rechtecke, quer verkleinert) */
export function ueberlappt(x: AutoBild, raster: AutoRaster): boolean {
  const ecken = (a: AutoBild, ux: number, uy: number) => {
    const l = a.lang / 2, b = a.breit / 2 * KORRIDOR_BREITE_ANTEIL, m = a.e * ux + a.n * uy
    const r = Math.abs(l * (a.de * ux + a.dn * uy)) + Math.abs(b * (a.dn * ux - a.de * uy))
    return [m - r, m + r]
  }
  for (const y of raster.nahe(x.e, x.n)) {
    if (y.a === x.a || Math.abs(y.e - x.e) > 20 || Math.abs(y.n - x.n) > 20) continue
    let getrennt = false
    for (const [ux, uy] of [[x.de, x.dn], [x.dn, -x.de], [y.de, y.dn], [y.dn, -y.de]]) {
      const [a0, a1] = ecken(x, ux, uy), [b0, b1] = ecken(y, ux, uy)
      if (a1 < b0 || b1 < a0) { getrennt = true; break }
    }
    if (!getrennt) return true
  }
  return false
}

/** Autos, die im Kreis aufeinander warten: je Kreis das eine, das am längsten steht (eines nach dem anderen, je Bild höchstens eines je Kreis) */
export function blockadeLoesen(autos: Iterable<AutoPlatz>) {
  const fertig = new Set<AutoPlatz>()
  for (const a of autos) {
    if (fertig.has(a) || a.durch || (a.steckt ?? 0) <= KORRIDOR_STECKT_S) continue
    if ((a.steckt ?? 0) > KORRIDOR_HOECHSTENS_S) { a.durch = true; continue }
    const weg: AutoPlatz[] = []
    let b: AutoPlatz | undefined = a
    while (b && !fertig.has(b) && !weg.includes(b) && weg.length < 60 && !b.durch && (b.steckt ?? 0) > KORRIDOR_STECKT_S) { weg.push(b); b = b.vor }
    for (const c of weg) fertig.add(c)
    const i = b ? weg.indexOf(b) : -1
    if (i < 0) continue
    let wer = weg[i]
    for (const c of weg.slice(i)) if ((c.steckt ?? 0) > (wer.steckt ?? 0)) wer = c
    wer.durch = true
  }
}
