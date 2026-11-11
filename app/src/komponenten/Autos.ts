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
/** Länge und Breite je Art (0 Auto, 1 SUV, 2 Pick-up) in m, gewählt */
export const AUTO_ART_LANG_M = [AUTO_LANG_M, 4.7, 5.3], AUTO_ART_BREIT_M = [AUTO_BREIT_M, 1.9, 1.9]
export function autoArt(id: number): 0 | 1 | 2 {
  const r = zufall(id * 5.13 + 2.9)
  return r < PICKUP_ANTEIL ? 2 : r < PICKUP_ANTEIL + SUV_ANTEIL ? 1 : 0
}

export function autoForm(art: 0 | 1 | 2 = 0): THREE.BufferGeometry {
  const teile: THREE.BufferGeometry[] = []
  const faerben = (g: THREE.BufferGeometry, x: number, y: number, h: number, z: number, farbe: string) => {
    g.deleteAttribute('uv')
    g.translate(x / 1000, (y + h / 2) / 1000, z / 1000)
    const c = new THREE.Color(farbe), f = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < f.length; i += 3) { f[i] = c.r; f[i + 1] = c.g; f[i + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3))
    teile.push(g)
  }
  const kasten = (l: number, b: number, h: number, y: number, z: number, farbe: string, x = 0) =>
    faerben(new THREE.BoxGeometry(b / 1000, h / 1000, l / 1000).toNonIndexed(), x, y, h, z, farbe)
  // leicht gerundet (Michael, 2026-11-11: «Bitte Autos leicht anrunden wenns geht»): Karosserie und Kabine mit abgerundeten Kanten, Radius gewählt,
  // je eine Stufe, damit es bei vielen Autos leicht bleibt
  const rund = (l: number, b: number, h: number, r: number, y: number, z: number, farbe: string, x = 0) =>
    faerben(new RoundedBoxGeometry(b / 1000, h / 1000, l / 1000, 1, r / 1000).toNonIndexed(), x, y, h, z, farbe)
  const L = AUTO_ART_LANG_M[art], B = AUTO_ART_BREIT_M[art]
  if (art === 0) {
    kasten(L * 0.94, B * 0.96, 0.25, 0.15, 0, '#202020')
    rund(L, B, 0.6, 0.2, 0.37, 0, '#ffffff')
    rund(2.3, B * 0.88, 0.5, 0.16, 0.9, -0.3, '#1c2228')
    rund(2.0, B * 0.84, 0.1, 0.05, 1.33, -0.3, '#ffffff')
  } else if (art === 1) {
    // SUV: höher, die Kabine länger und bis weit nach hinten, etwa 1,8 m hoch
    kasten(L * 0.94, B * 0.96, 0.3, 0.18, 0, '#202020')
    rund(L, B, 0.75, 0.22, 0.42, 0, '#ffffff')
    rund(3.0, B * 0.9, 0.52, 0.16, 1.12, -0.35, '#1c2228')
    rund(2.85, B * 0.86, 0.12, 0.05, 1.62, -0.35, '#ffffff')
  } else {
    // Pick-up: Kabine vorne, dahinter eine offene Ladefläche mit Bordwänden
    kasten(L * 0.94, B * 0.96, 0.3, 0.18, 0, '#202020')
    rund(L, B, 0.7, 0.2, 0.42, 0, '#ffffff')
    rund(1.9, B * 0.9, 0.55, 0.16, 1.1, 0.35, '#1c2228')
    rund(1.8, B * 0.86, 0.1, 0.05, 1.63, 0.35, '#ffffff')
    const ladeL = 2.05, ladeZ = -L / 2 + ladeL / 2 + 0.05
    kasten(ladeL, B * 0.9, 0.02, 1.12, ladeZ, '#2a2a2a')
    for (const x of [-(B / 2 - 0.05), B / 2 - 0.05]) rund(ladeL, 0.1, 0.38, 0.03, 1.1, ladeZ, '#ffffff', x)
    rund(0.1, B, 0.38, 0.03, 1.1, -L / 2 + 0.1, '#ffffff')
  }
  const ganz = mergeGeometries(teile)!
  teile.forEach((t) => t.dispose())
  return ganz
}

/** Scheinwerfer vorne weiss, Rücklichter hinten rot, nachts (fensterNacht) als eigenes Netz ohne Licht der Szene gezeichnet; Lage gewählt */
export function autoLichter(lang = AUTO_LANG_M, breit = AUTO_BREIT_M): THREE.BufferGeometry {
  const teile: THREE.BufferGeometry[] = []
  const lampe = (x: number, z: number, farbe: string) => {
    const g = new THREE.BoxGeometry(0.45 / 1000, 0.2 / 1000, 0.08 / 1000).toNonIndexed()
    g.deleteAttribute('uv')
    g.translate(x / 1000, 0.75 / 1000, z / 1000)
    const c = new THREE.Color(farbe), f = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < f.length; i += 3) { f[i] = c.r; f[i + 1] = c.g; f[i + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3))
    teile.push(g)
  }
  const x0 = breit / 3
  for (const x of [-x0, x0]) { lampe(x, lang / 2 + 0.03, '#ffffff'); lampe(x, -lang / 2 - 0.03, '#ff3020') }
  const ganz = mergeGeometries(teile)!
  teile.forEach((t) => t.dispose())
  return ganz
}

/** nachts vor jedem Auto ein Lichtkegel auf der Fahrbahn wie bei den Zügen: so lang und vorne so breit, Stärke, gewählt */
export const AUTO_KEGEL_LANG_M = 28, AUTO_KEGEL_BREIT_M = 7, AUTO_KEGEL_HELL = 0.55

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
  lkw: number }

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
      k = { L: st.L, art: st.art, tag: v[0], nacht: v[1], stuecke: [], autos: [], lkwTag: anteil(v[2]), lkwNacht: anteil(v[3]), quer }
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
  return ketten
}

/** wo in der Kette an der Stelle s (m vom Anfang): Ost, Nord, Höhe laut swissTLM3D, Richtung, auf einer Brücke; null, wo kein Stück gezeichnet ist
 *  (Tunnel, ausserhalb der Kacheln) */
export function autoBei(k: AutoKette, s: number): { e: number; n: number; h: number; de: number; dn: number; bruecke: boolean } | null {
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
  return { e: a.e[j] + t * (a.e[j + 1] - a.e[j]), n: a.n[j] + t * (a.n[j + 1] - a.n[j]), h: a.h[j] + t * (a.h[j + 1] - a.h[j]), de, dn, bruecke: a.bruecke }
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
