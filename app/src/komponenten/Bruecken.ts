// Brücken, gemeinsam für den Führerstand (Relief.tsx) und «3D Schweiz» (Schweiz3D.tsx) (Michael, 2026-10-30: «die beiden evtl zu koppeln
// … wenn hier was vorhanden ist kann das andere vielleicht profitieren. ZB die Brücken»): Querschnitte, gemalte Oberflächen und das Netz
// aus Querschnitten entlang einer Achse, dazu die Breite von Strassenbrücken und das Zusammenfassen paralleler Gleise einer Bahnbrücke.
// Lage und Höhe der Achsen stammen aus swissTLM3D, Breite (wo die Klasse keine nennt), Querschnitt und Aussehen stehen in keiner Quelle.
import * as THREE from 'three'

/** Breite von Strassenbrücken in m, wo die Klasse in swissTLM3D keine nennt: Annahmen, in keiner Quelle (je Fahrbahn) */
export const STRASSE_BREITE_ANNAHME: Record<string, number> = { Autobahn: 12, Autostrasse: 9, Einfahrt: 6, Ausfahrt: 6, Zufahrt: 4, Dienstzufahrt: 4 }
/** Wege und Stege, wo die Klasse keine Breite nennt (Fussweg, Markierte Spur …), in keiner Quelle */
const WEG_BREITE_ANNAHME = 1.5
/** halbe Breite einer gezeichneten Strassenbrücke mit Brüstung: die Breite aus dem Namen der Klasse («4m Strasse»), sonst die Annahme */
export const strassenHalbe = (breite: number | null, klasse: string | null, weg = false) =>
  (breite ?? (klasse ? STRASSE_BREITE_ANNAHME[klasse] : undefined) ?? (weg ? WEG_BREITE_ANNAHME : 6)) / 2 + 0.5
/** die Platte einer Bahnbrücke reicht so weit über die äussersten Gleise hinaus; trägt eine Achse laut Quelle zwei Gleise, liegen sie
 *  so weit auseinander; beides in keiner Quelle */
export const BRUECKE_RAND_M = 3.5, GLEISABSTAND_M = 4.5

/** Oberflächen gezeichneter Brücken (Michael, 2026-10-15: «ein bisschen Körnung, ein bisschen Ambient Occlusion, eine
 *  Struktur, die repräsentativ ist für eine allgemeine Brücke»): gemalt, nicht aus einer Quelle; ein Bild deckt BRUECKE_BILD_M
 *  im Quadrat. Beton mit Körnung, Flecken und Schalungsfugen, Schotter für Bahnbrücken, Belag für Strassenbrücken */
export const BRUECKE_BILD_M = 4
export type BrueckenArt = 'beton' | 'schotter' | 'belag'
const brueckenBilder = new Map<BrueckenArt, THREE.CanvasTexture>()
export function brueckenBild(art: BrueckenArt) {
  let t = brueckenBilder.get(art)
  if (t) return t
  const N = 256, c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!, bild = g.createImageData(N, N)
  // kachelbares Rauschen: Zufallsgitter mit q Feldern je Seite, weich dazwischen
  const rauschen = (q: number) => {
    const gitter = Array.from({ length: q * q }, () => Math.random() * 2 - 1)
    return (x: number, y: number) => {
      const fx = (x / N) * q, fy = (y / N) * q, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j
      const w = (a: number, b: number) => gitter[((b % q + q) % q) * q + ((a % q + q) % q)]
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v)
      return (w(i, j) * (1 - su) + w(i + 1, j) * su) * (1 - sv) + (w(i, j + 1) * (1 - su) + w(i + 1, j + 1) * su) * sv
    }
  }
  const grob = rauschen(4), mittel = rauschen(16), fein = rauschen(64)
  const grund = art === 'beton' ? [176, 173, 165] : art === 'schotter' ? [128, 121, 112] : [84, 84, 86]
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let d = 0
      if (art === 'beton') {
        d = grob(x, y) * 10 + mittel(x, y) * 6 + (Math.random() - 0.5) * 14
        // Schalungsfugen: Bretter quer, je 1 m eine Fuge, dazu Ankerlöcher
        if (y % (N / 4) < 2) d -= 22
        if (y % (N / 4) === 32 && x % 64 === 20) d -= 40
      } else if (art === 'schotter') {
        d = fein(x, y) * 26 + mittel(x, y) * 8 + (Math.random() - 0.5) * 40
      } else {
        d = grob(x, y) * 6 + (Math.random() - 0.5) * 18 + (Math.random() < 0.02 ? 30 : 0)
      }
      const k = (y * N + x) * 4
      for (let c2 = 0; c2 < 3; c2++) bild.data[k + c2] = grund[c2] + d + (art === 'beton' ? grob(y, x) * 4 * (c2 - 1) : 0)
      bild.data[k + 3] = 255
    }
  }
  g.putImageData(bild, 0, 0)
  t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  brueckenBilder.set(art, t)
  return t
}
/** eine Fläche im Querschnitt einer Brücke: von a0, h0 nach a1, h1 (Abstand quer zur Achse, Höhe über ihr, in m), ihr
 *  Bild und ihre Helligkeit an beiden Kanten (Ambient Occlusion von Hand: dunkel in Ecken und unten, in keiner Quelle) */
export interface QuerFlaeche { a0: number; h0: number; a1: number; h1: number; art: BrueckenArt; hell0: number; hell1: number }
/** Querschnitt einer Bahnbrücke zwischen lo und hi: Schotter zwischen zwei Randbalken, darunter die Platte */
export function bahnQuerschnitt(lo: number, hi: number, oben: number, dick: number): QuerFlaeche[] {
  const rb = 0.5, rh = 0.4, ao = 0.9, unten = oben - dick
  return [
    { a0: lo, h0: unten, a1: lo, h1: oben + rh, art: 'beton', hell0: 0.62, hell1: 0.95 },
    { a0: lo, h0: oben + rh, a1: lo + rb, h1: oben + rh, art: 'beton', hell0: 1, hell1: 1 },
    { a0: lo + rb, h0: oben + rh, a1: lo + rb, h1: oben, art: 'beton', hell0: 0.9, hell1: 0.6 },
    { a0: lo + rb, h0: oben, a1: lo + rb + ao, h1: oben, art: 'schotter', hell0: 0.55, hell1: 1 },
    { a0: lo + rb + ao, h0: oben, a1: hi - rb - ao, h1: oben, art: 'schotter', hell0: 1, hell1: 1 },
    { a0: hi - rb - ao, h0: oben, a1: hi - rb, h1: oben, art: 'schotter', hell0: 1, hell1: 0.55 },
    { a0: hi - rb, h0: oben, a1: hi - rb, h1: oben + rh, art: 'beton', hell0: 0.6, hell1: 0.9 },
    { a0: hi - rb, h0: oben + rh, a1: hi, h1: oben + rh, art: 'beton', hell0: 1, hell1: 1 },
    { a0: hi, h0: oben + rh, a1: hi, h1: unten, art: 'beton', hell0: 0.95, hell1: 0.62 },
    { a0: hi, h0: unten, a1: lo, h1: unten, art: 'beton', hell0: 0.45, hell1: 0.45 },
  ]
}
/** Querschnitt einer Strassenbrücke mit halber Breite w: Trog aus Platte (1 m) und Brüstungen (0,3 m dick, 1 m hoch) */
export function strassenQuerschnitt(w: number): QuerFlaeche[] {
  const b = 0.3, ao = 0.6
  return [
    { a0: -w, h0: -1, a1: -w, h1: 1, art: 'beton', hell0: 0.62, hell1: 0.95 },
    { a0: -w, h0: 1, a1: -w + b, h1: 1, art: 'beton', hell0: 1, hell1: 1 },
    { a0: -w + b, h0: 1, a1: -w + b, h1: 0, art: 'beton', hell0: 0.92, hell1: 0.6 },
    { a0: -w + b, h0: 0, a1: -w + b + ao, h1: 0, art: 'belag', hell0: 0.6, hell1: 1 },
    { a0: -w + b + ao, h0: 0, a1: w - b - ao, h1: 0, art: 'belag', hell0: 1, hell1: 1 },
    { a0: w - b - ao, h0: 0, a1: w - b, h1: 0, art: 'belag', hell0: 1, hell1: 0.6 },
    { a0: w - b, h0: 0, a1: w - b, h1: 1, art: 'beton', hell0: 0.6, hell1: 0.92 },
    { a0: w - b, h0: 1, a1: w, h1: 1, art: 'beton', hell0: 1, hell1: 1 },
    { a0: w, h0: 1, a1: w, h1: -1, art: 'beton', hell0: 0.95, hell1: 0.62 },
    { a0: w, h0: -1, a1: -w, h1: -1, art: 'beton', hell0: 0.45, hell1: 0.45 },
  ]
}

/** eine Stelle entlang einer Achse: Lage (e, n), Richtung quer (qe, qn, Einheit), Höhe der Achse (m), Meter entlang ihr und der
 *  Querschnitt dort */
export interface QuerStelle { e: number; n: number; qe: number; qn: number; z: number; s: number; quer: QuerFlaeche[]
  /** Faktor je Farbe für den Belag, damit er die Farbe der Strasse daneben im Luftbild bekommt (belagFaktor) */
  belag?: [number, number, number] }
/** der Faktor auf das Bild des Belags (Grundton 84 von 255), damit der Belag im Mittel die Farbe rgb (0 bis 255, sRGB) hat */
export function belagFaktor(rgb: [number, number, number]): [number, number, number] {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const grund = lin(84 / 255)
  return rgb.map((c) => lin(c / 255) / grund) as [number, number, number]
}
/** Brücken nahtlos an die Strasse (Michael, 2026-11-10: «diese nahtlos machen sonst springen die Autos»): an beiden Enden liegt die Achse auf
 *  dem gezeichneten Gelände, dazwischen verschiebt sich die Höhe laut swissTLM3D gleichmässig um den Unterschied an den Enden. Gibt boden an
 *  einem Ende NaN (dort geht die Brücke als anderes Stück weiter, oder es ist der Rand des Modells), bleibt dort die Höhe laut swissTLM3D. h wird
 *  ersetzt */
export function brueckeAnschliessen(e: ArrayLike<number>, n: ArrayLike<number>, h: number[] | Float32Array, boden: (e: number, n: number) => number) {
  const z = h.length
  if (z < 2) return
  let a = boden(e[0], n[0]) - h[0], b = boden(e[z - 1], n[z - 1]) - h[z - 1]
  if (!Number.isFinite(a)) a = 0
  if (!Number.isFinite(b)) b = 0
  let lang = 0
  const s = [0]
  for (let i = 1; i < z; i++) { lang += Math.hypot(e[i] - e[i - 1], n[i] - n[i - 1]); s.push(lang) }
  for (let i = 0; i < z; i++) h[i] += a + (b - a) * (lang ? s[i] / lang : 0)
}
/** je Bild ein Material, die Helligkeit des Querschnitts als Farbe der Ecken */
export function brueckenMaterialien() {
  const m = new Map<BrueckenArt, THREE.MeshLambertMaterial>()
  for (const art of ['beton', 'schotter', 'belag'] as const) m.set(art, new THREE.MeshLambertMaterial({ map: brueckenBild(art), vertexColors: true, side: THREE.DoubleSide }))
  return m
}
/** die Querschnitte entlang einer Achse als Netze, je Bild eines, Bilder in Metern (BRUECKE_BILD_M); X, Y, Z rechnen Landeskoordinaten
 *  und Höhe in die Szene */
export function querschnittNetzeBauen(stellen: QuerStelle[], X: (e: number) => number, Y: (z: number) => number, Z: (n: number) => number,
                                      material: Map<BrueckenArt, THREE.Material>) {
  const teile = new Map<BrueckenArt, { pos: number[]; uv: number[]; farbe: number[] }>()
  for (let i = 0; i + 1 < stellen.length; i++) {
    const A = stellen[i], B = stellen[i + 1]
    A.quer.forEach((fa, k) => {
      const fb = B.quer[k]
      let t = teile.get(fa.art)
      if (!t) { t = { pos: [], uv: [], farbe: [] }; teile.set(fa.art, t) }
      const flach = Math.abs(fa.h1 - fa.h0) < Math.abs(fa.a1 - fa.a0)
      const ecke = (S: QuerStelle, a: number, h: number, hell: number) => {
        t!.pos.push(X(S.e + S.qe * a), Y(S.z + h), Z(S.n + S.qn * a))
        t!.uv.push(S.s / BRUECKE_BILD_M, (flach ? a : h) / BRUECKE_BILD_M)
        const f = fa.art === 'belag' && S.belag ? S.belag : null
        if (f) t!.farbe.push(hell * f[0], hell * f[1], hell * f[2]); else t!.farbe.push(hell, hell, hell)
      }
      const e1 = () => ecke(A, fa.a0, fa.h0, fa.hell0), e2 = () => ecke(A, fa.a1, fa.h1, fa.hell1)
      const e3 = () => ecke(B, fb.a1, fb.h1, fb.hell1), e4 = () => ecke(B, fb.a0, fb.h0, fb.hell0)
      e1(); e2(); e3(); e1(); e3(); e4()
    })
  }
  return [...teile].map(([art, t]) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(t.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(t.farbe, 3))
    g.computeVertexNormals()
    return new THREE.Mesh(g, material.get(art)!)
  })
}

/** ein Stück einer Achse auf einer Brücke (aus data/bruecken3d), Punkte in LV95 und m ü. M. */
export interface BrueckenStueck { e: number[]; n: number[]; h: number[]; spuren?: number | null }
/** eine Bahnbrücke als Platte: die Achse, auf der sie gezeichnet wird, und links und rechts davon die Breite (m, quer zur Achse, links
 *  negativ wie bei bahnQuerschnitt) */
export interface GleisPlatte { stueck: BrueckenStueck; lo: number; hi: number }
/** die Gleise einer Bahnbrücke laut swissTLM3D liegen je als eigene Achse vor; zusammen gezeichnet wird eine Platte unter allen, so breit
 *  wie ihre Gleise (wie im Führerstand, Michael, 2026-10-15: «gemäß der Anzahl Gleise»). Je Stück alle 10 m quer die anderen Gleisstücke
 *  bis SUCHE_M, höchstens 30° schräg; gezeichnet nur das Stück, links von dem an den meisten Stellen kein anderes liegt, mit der mittleren
 *  Breite (Median) über alle */
export function gleisPlatten(stuecke: BrueckenStueck[]): GleisPlatte[] {
  const SUCHE_M = 20, ZELLE = 50
  type Seg = { id: number; ae: number; an: number; be: number; bn: number }
  const zellen = new Map<string, Seg[]>()
  stuecke.forEach((st, id) => {
    for (let i = 0; i + 1 < st.e.length; i++) {
      const s: Seg = { id, ae: st.e[i], an: st.n[i], be: st.e[i + 1], bn: st.n[i + 1] }
      for (let qe = Math.floor(Math.min(s.ae, s.be) / ZELLE); qe <= Math.floor(Math.max(s.ae, s.be) / ZELLE); qe++)
        for (let qn = Math.floor(Math.min(s.an, s.bn) / ZELLE); qn <= Math.floor(Math.max(s.an, s.bn) / ZELLE); qn++) {
          const k = `${qe}_${qn}`, l = zellen.get(k)
          if (l) l.push(s); else zellen.set(k, [s])
        }
    }
  })
  const median = (a: number[]) => { const t = [...a].sort((u, v) => u - v); return t[Math.floor(t.length / 2)] }
  const raus: GleisPlatte[] = []
  stuecke.forEach((st, id) => {
    const lo: number[] = [], hi: number[] = []
    let links = 0, stellen = 0
    for (let i = 0; i + 1 < st.e.length; i++) {
      const de = st.e[i + 1] - st.e[i], dn = st.n[i + 1] - st.n[i], l = Math.hypot(de, dn)
      if (l < 0.1) continue
      const te = de / l, tn = dn / l, qe = -tn, qn = te
      for (let m = 0; m < l; m += 10) {
        const e = st.e[i] + te * m, n = st.n[i] + tn * m
        const lage = new Map<number, number>()
        for (let ze = Math.floor((e - SUCHE_M) / ZELLE); ze <= Math.floor((e + SUCHE_M) / ZELLE); ze++)
          for (let zn = Math.floor((n - SUCHE_M) / ZELLE); zn <= Math.floor((n + SUCHE_M) / ZELLE); zn++)
            for (const s of zellen.get(`${ze}_${zn}`) ?? []) {
              if (s.id === id) continue
              const se = s.be - s.ae, sn = s.bn - s.an, ls = Math.hypot(se, sn)
              if (ls < 0.1 || Math.abs((se * te + sn * tn) / ls) < Math.cos(Math.PI / 6)) continue
              const nenner = se * qn - sn * qe
              if (Math.abs(nenner) < 1e-9) continue
              const t = ((e - s.ae) * qn - (n - s.an) * qe) / nenner
              if (t < -0.01 || t > 1.01) continue
              const d = (s.ae + t * se - e) * qe + (s.an + t * sn - n) * qn
              if (Math.abs(d) > SUCHE_M) continue
              const alt = lage.get(s.id)
              if (alt === undefined || Math.abs(d) < Math.abs(alt)) lage.set(s.id, d)
            }
        let a = 0, b = 0
        for (const d of lage.values()) { a = Math.min(a, d); b = Math.max(b, d) }
        stellen++
        if (a < -1) links++
        lo.push(a); hi.push(b)
      }
    }
    // liegt an den meisten Stellen ein anderes Gleis links, zeichnet jenes die Platte
    if (!stellen || links > stellen / 2) return
    let a = median(lo), b = median(hi)
    if (a === 0 && b === 0 && st.spuren === 2) { a = -GLEISABSTAND_M / 2; b = GLEISABSTAND_M / 2 }
    raus.push({ stueck: st, lo: a - BRUECKE_RAND_M, hi: b + BRUECKE_RAND_M })
  })
  // zwei Platten über denselben Gleisen (wo Gleise sich kreuzen oder eine Achse zwei Gleise trägt, ist «links» nicht eindeutig): die breitere
  // bleibt, eine schmalere fällt weg, wenn die meisten ihrer Punkte auf der breiteren liegen
  raus.sort((u, v) => (v.hi - v.lo) - (u.hi - u.lo))
  const bleibt: GleisPlatte[] = []
  const auf = (p: GleisPlatte, e: number, n: number) => {
    const st = p.stueck
    let best = Infinity, quer = 0
    for (let i = 0; i + 1 < st.e.length; i++) {
      const de = st.e[i + 1] - st.e[i], dn = st.n[i + 1] - st.n[i], l2 = de * de + dn * dn
      if (!l2) continue
      const t = Math.max(0, Math.min(1, ((e - st.e[i]) * de + (n - st.n[i]) * dn) / l2)), l = Math.sqrt(l2)
      const fe = st.e[i] + t * de, fn = st.n[i] + t * dn, d = Math.hypot(e - fe, n - fn)
      if (d < best) { best = d; quer = ((e - fe) * -dn + (n - fn) * de) / l }
    }
    return best < Infinity && quer >= p.lo - 1 && quer <= p.hi + 1 && best <= Math.max(-p.lo, p.hi) + 1
  }
  for (const p of raus) {
    const st = p.stueck
    const drauf = bleibt.some((q) => st.e.filter((e, i) => auf(q, e, st.n[i])).length * 2 > st.e.length)
    if (!drauf) bleibt.push(p)
  }
  return bleibt
}

/** Retusche, im Führerstand und seit 2026-11-08 auch in «3D Schweiz» (Michael, 2026-10-15: «wegzuretuschieren, damit die Straße auf der Brücke und nicht unterhalb … verläuft»):
 *  das Luftbild ist auf das Gelände gelegt, eine Brücke darin liegt unten im Tal oder auf dem Gleis darunter. Unter jeder
 *  gezeichneten Brücke wird es quer zur Brücke zwischen den beiden Rändern aufgefüllt, RETUSCHE_RAND_M breiter als die Brücke
 *  (die Brücke liegt im Luftbild je nach Höhe etwas daneben); keine künstliche Intelligenz, nicht aus einer Quelle */
export const RETUSCHE_RAND_M = 2.5, RETUSCHE_MITTEL_M = 8, RETUSCHE_BLOCK_M = 2, RETUSCHE_KLON_MAX = 40
/** ein Streifen unter einer Brücke: Achse in Landeskoordinaten und je Punkt der Abstand links und rechts wie brueckeQuer */
export interface Streifen { p: Array<[number, number]>; lo: number[]; hi: number[] }
/** ein retuschiertes Rechteck des Bilds: vorher und nachher, damit Dächer über einer Brücke (gedeckte Brücken wie die Kapellbrücke) wieder ihr
 *  Luftbild bekommen (Michael, 2026-11-08: «Kannst du das Dach der Kapellbrücke realistisch umsetzen?») */
export interface Retusche { x: number; y: number; vor: ImageData; nach: ImageData }

export function retuschieren(ctx: CanvasRenderingContext2D, w: number, h: number, e0: number, n1: number, pxJeM: number, streifen: Streifen[]): Retusche[] {
  const raus: Retusche[] = []
  for (const s of streifen) {
    // Rechteck des Streifens in Bildpunkten
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    s.p.forEach(([e, n], i) => {
      const r = 3 * Math.max(-s.lo[i], s.hi[i]) + 3 * RETUSCHE_RAND_M + RETUSCHE_BLOCK_M + 2 * RETUSCHE_MITTEL_M + 12
      x0 = Math.min(x0, (e - r - e0) * pxJeM); x1 = Math.max(x1, (e + r - e0) * pxJeM)
      y0 = Math.min(y0, (n1 - n - r) * pxJeM); y1 = Math.max(y1, (n1 - n + r) * pxJeM)
    })
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1))
    if (x1 - x0 < 1 || y1 - y0 < 1) continue
    const bw = x1 - x0, bh = y1 - y0
    const bild = ctx.getImageData(x0, y0, bw, bh), q = bild.data, z = new Uint8ClampedArray(q)
    const stelle = (e: number, n: number) => {
      const x = Math.max(0, Math.min(bw - 1, Math.floor((e - e0) * pxJeM) - x0)), y = Math.max(0, Math.min(bh - 1, Math.floor((n1 - n) * pxJeM) - y0))
      return y * bw + x
    }
    const pxM = 1 / pxJeM
    for (let i = 0; i + 1 < s.p.length; i++) {
      const [ae, an] = s.p[i], [be, bn] = s.p[i + 1], l = Math.hypot(be - ae, bn - an)
      if (l < 0.01) continue
      const ue = (be - ae) / l, un = (bn - an) / l, qe = -un, qn = ue
      const r = Math.max(-s.lo[i], s.hi[i], -s.lo[i + 1], s.hi[i + 1]) + RETUSCHE_RAND_M
      const xa = Math.max(x0, Math.floor((Math.min(ae, be) - r - e0) * pxJeM)), xb = Math.min(x1, Math.ceil((Math.max(ae, be) + r - e0) * pxJeM))
      const ya = Math.max(y0, Math.floor((n1 - Math.max(an, bn) - r) * pxJeM)), yb = Math.min(y1, Math.ceil((n1 - Math.min(an, bn) + r) * pxJeM))
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const e = e0 + (x + 0.5) * pxM, n = n1 - (y + 0.5) * pxM
          const t = (e - ae) * ue + (n - an) * un
          if (t < 0 || t > l) continue
          const d = (e - ae) * qe + (n - an) * qn, f = t / l
          const lo = s.lo[i] + f * (s.lo[i + 1] - s.lo[i]) - RETUSCHE_RAND_M, hi = s.hi[i] + f * (s.hi[i + 1] - s.hi[i]) + RETUSCHE_RAND_M
          if (d < lo || d > hi) continue
          // zwischen den beiden Rändern verlaufend; jeder Rand gemittelt über RETUSCHE_MITTEL_M längs und 2 m nach aussen,
          // sonst zieht jeder Bildpunkt am Rand einen Streifen. Gespiegelt wäre die Zeichnung schärfer, erfand aber Häuser
          const me = ae + ue * t, mn = an + un * t, g = (d - lo) / ((hi - lo) || 1)
          const o = ((y - y0) * bw + (x - x0)) * 4
          const breite = hi - lo + RETUSCHE_BLOCK_M
          // je Rand die mittlere Farbe (Index 0 bis 2) und die mittlere Farbe dort, woher das Bild für diesen Rand geholt wird (3 bis 5)
          const L = [0, 0, 0, 0, 0, 0], R = [0, 0, 0, 0, 0, 0]
          let k2 = 0
          for (const sl of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
            for (const aus of [0.5, 2]) {
              const ve = me + ue * sl * RETUSCHE_MITTEL_M, vn = mn + un * sl * RETUSCHE_MITTEL_M
              const kl = stelle(ve + qe * (lo - aus), vn + qn * (lo - aus)) * 4, kr = stelle(ve + qe * (hi + aus), vn + qn * (hi + aus)) * 4
              const kL = stelle(ve + qe * (lo - aus - breite), vn + qn * (lo - aus - breite)) * 4
              const kR = stelle(ve + qe * (hi + aus + breite), vn + qn * (hi + aus + breite)) * 4
              for (let c = 0; c < 3; c++) { L[c] += q[kl + c]; R[c] += q[kr + c]; L[c + 3] += q[kL + c]; R[c + 3] += q[kR + c] }
              k2++
            }
          }
          // das Bild gleich neben der Brücke, um die Breite des Streifens verschoben (nicht gespiegelt), von beiden Seiten zur Mitte
          // überblendet, je Seite um den Unterschied am Rand angeglichen, damit keine Naht bleibt (wie ein Reparaturpinsel); so laufen Wellen,
          // Uferlinien und Bewuchs mit ihren Farben durch (seit 2026-11-08, Michael: «Gibt es noch eine realistischer aussehende Füllmethode?»;
          // vorher die Farbe zwischen den Rändern verlaufend und darauf je Block von 2 m die Helligkeit eines zufällig versetzten Stücks, das
          // wirkte verschmiert und fleckig); höchstens RETUSCHE_KLON_MAX vom Verlauf zwischen den Rändern weg, damit keine Häuser oder Strassen
          // hineinkommen (Michael, 2026-10-15: «inhaltsbasiertes Auffüllen»)
          const sL = stelle(me + qe * (d - breite), mn + qn * (d - breite)) * 4, sR = stelle(me + qe * (d + breite), mn + qn * (d + breite)) * 4
          const gw = g * g * (3 - 2 * g)
          for (let c = 0; c < 3; c++) {
            const verlauf = (L[c] * (1 - g) + R[c] * g) / k2
            const klon = (q[sL + c] + (L[c] - L[c + 3]) / k2) * (1 - gw) + (q[sR + c] + (R[c] - R[c + 3]) / k2) * gw
            z[o + c] = verlauf + Math.max(-RETUSCHE_KLON_MAX, Math.min(RETUSCHE_KLON_MAX, klon - verlauf))
          }
        }
      }
    }
    const vor = new ImageData(new Uint8ClampedArray(q), bw, bh)
    bild.data.set(z)
    ctx.putImageData(bild, x0, y0)
    raus.push({ x: x0, y: y0, vor, nach: bild })
  }
  return raus
}

/** die Höhe der gezeichneten Fahrbahn auf Strassenbrücken an einer Stelle (Michael, 2026-11-10: «Autos fahren nicht sauber auf den Brücken.
 *  Teilweise darunter in der Luft»): die Autos nehmen statt einer eigenen Rechnung die Achse der gezeichneten Brücke, nach brueckeAnschliessen;
 *  gesucht wird die nächste Achse bis zur halben Breite und 1 m mehr, deren Höhe höchstens DECK_HOEHE_M von der Höhe laut swissTLM3D abweicht
 *  (sonst eine Brücke darüber oder darunter) */
export const DECK_HOEHE_M = 8
export function deckSuche(stuecke: Array<{ e: number[]; n: number[]; h: number[]; halb: number }>): (e: number, n: number, h: number) => number | null {
  const ZELLE = 25, gitter = new Map<string, Array<[number, number]>>()
  stuecke.forEach((s, k) => {
    for (let i = 0; i + 1 < s.e.length; i++) {
      const r = s.halb + 1
      for (let gx = Math.floor((Math.min(s.e[i], s.e[i + 1]) - r) / ZELLE); gx <= Math.floor((Math.max(s.e[i], s.e[i + 1]) + r) / ZELLE); gx++) {
        for (let gy = Math.floor((Math.min(s.n[i], s.n[i + 1]) - r) / ZELLE); gy <= Math.floor((Math.max(s.n[i], s.n[i + 1]) + r) / ZELLE); gy++) {
          const schl = `${gx}_${gy}`, l = gitter.get(schl)
          if (l) l.push([k, i]); else gitter.set(schl, [[k, i]])
        }
      }
    }
  })
  return (e, n, h) => {
    const l = gitter.get(`${Math.floor(e / ZELLE)}_${Math.floor(n / ZELLE)}`)
    if (!l) return null
    let best = Infinity, raus: number | null = null
    for (const [k, i] of l) {
      const s = stuecke[k], ae = s.e[i], an = s.n[i], de = s.e[i + 1] - ae, dn = s.n[i + 1] - an, l2 = de * de + dn * dn
      const t = l2 ? Math.max(0, Math.min(1, ((e - ae) * de + (n - an) * dn) / l2)) : 0
      const d = Math.hypot(e - ae - t * de, n - an - t * dn)
      if (d > s.halb + 1) continue
      const z = s.h[i] + t * (s.h[i + 1] - s.h[i])
      if (Math.abs(z - h) > DECK_HOEHE_M) continue
      const wert = d + Math.abs(z - h) * 0.5
      if (wert < best) { best = wert; raus = z }
    }
    return raus
  }
}
