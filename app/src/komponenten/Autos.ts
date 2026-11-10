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

export function autoForm(): THREE.BufferGeometry {
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
  kasten(AUTO_LANG_M, AUTO_BREIT_M, 0.25, 0.15, 0, '#202020')
  kasten(AUTO_LANG_M, AUTO_BREIT_M, 0.55, 0.4, 0, '#ffffff')
  kasten(2.3, AUTO_BREIT_M * 0.9, 0.42, 0.95, -0.3, '#1c2228')
  kasten(2.1, AUTO_BREIT_M * 0.86, 0.08, 1.37, -0.3, '#ffffff')
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

export function lackFarbe(i: number): THREE.Color {
  return new THREE.Color(LACK[Math.floor(zufall(i * 7.31 + 1.7) * LACK.length)])
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
  quer: number }
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
      // Abstände zufällig um das Mittel, mindestens eine Lastwagenlänge und etwas
      let s = zufall(id * 3.1 + sp.spur * 1.3 + sp.richtung) * mittel
      while (s < k.L) {
        const z = zufall(id * 17.7 + nr * 0.731)
        // auf der rechten Spur alle gleich schnell, sonst führen Wagen durch die Lastwagen
        const ms = (sp.kmh / 3.6) * (sp.spur === 0 ? 1 : 0.96 + 0.08 * zufall(nr * 3.7 + id))
        k.autos.push({ richtung: sp.richtung, spur: sp.spur, ms, s0: s, ab: z, farbe: Math.floor(zufall(id + nr * 1.91) * 997),
          lkw: sp.spur === 0 ? zufall(id * 2.9 + nr * 0.377 + 5) : 2 })
        nr++
        s += Math.max(LKW_LANG_M + 6, mittel * (0.35 + 1.3 * zufall(id * 5.3 + nr * 1.17)))
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
