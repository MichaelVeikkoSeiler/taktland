// Wolken aus dem Wettermodell ICON-CH1-EPS als Bilder von Ebenen über einem Rechteck, gemeinsam für «3D Schweiz» (Schweiz3D.tsx) und den
// Führerstand (Relief.tsx) (Michael, 2026-10-28: «Jetzt die Wolken angehen»; 2026-10-30: «die beiden evtl zu koppeln … dann den Rest auch
// noch»). Belegt ist die Bewölkung je Zelle von 2 km (src/wolken.ts); Form, Muster und, ohne Wolken in echter Höhe, die Höhe der Schichten
// sind gewählt.
import { bewoelkung, bewoelkung3d, type Wolken } from '../wolken'

/** auf diesen Höhen über Meer liegen die drei Schichten tief, mittel und hoch; die Quelle nennt nur ihre Druckbereiche (800 hPa bis Boden,
 *  400 bis 800, unter 400), die Höhen sind gewählt, etwa nach der Standardatmosphäre (800 hPa gut 1'900 m, 600 hPa gut 4'200 m, 300 hPa gut 9'000 m) */
export const WOLKEN_HOEHE_M = [1500, 4200, 9000]
/** so gross sind die gezeichneten Wolken je Schicht etwa, in km (gewählt, nicht aus der Quelle) */
const WOLKEN_KORN_KM = [3, 6, 12]

/** fester Zufall je Gitterpunkt, für das gezeichnete Muster der Wolken */
function wolkenZufall(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
/** Rauschen aus mehreren Lagen, 0 bis 1, an einer Stelle in km; überall dasselbe, damit die Wolken beim Eintauchen gleich bleiben */
function wolkenMuster(xKm: number, yKm: number, kornKm: number, s: number) {
  let summe = 0, gewicht = 0, f = 1 / kornKm, g = 1
  for (let o = 0; o < 4; o++) {
    const x = xKm * f, y = yKm * f, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
    const a = wolkenZufall(x0, y0, s + o), bb = wolkenZufall(x0 + 1, y0, s + o), c = wolkenZufall(x0, y0 + 1, s + o), d = wolkenZufall(x0 + 1, y0 + 1, s + o)
    summe += g * ((a * (1 - sx) + bb * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy)
    gewicht += g; g *= 0.5; f *= 2
  }
  return summe / gewicht
}
/** das Muster gleichmässig verteilt (0 bis 1 nach seinem Rang unter 4'000 Proben), damit «deckend über 1 − Anteil» wirklich etwa
 *  diesen Anteil der Fläche deckt; je Schicht einmal gerechnet */
const musterRang: Array<Float32Array | null> = [null, null, null]
function gleichmaessig(m: number, schicht: number) {
  let r = musterRang[schicht]
  if (!r) {
    r = new Float32Array(4000)
    for (let i = 0; i < r.length; i++) r[i] = wolkenMuster(wolkenZufall(i, 1, 99) * 997, wolkenZufall(i, 2, 99) * 997, WOLKEN_KORN_KM[schicht], schicht * 7)
    r.sort(); musterRang[schicht] = r
  }
  let lo = 0, hi = r.length
  while (lo < hi) { const mi = (lo + hi) >> 1; if (r[mi] < m) lo = mi + 1; else hi = mi }
  return lo / r.length
}
/** das Bild einer Schicht über dem Rechteck: so viel Fläche deckend, wie die Prognose Bewölkung nennt; das Muster ist gezeichnet */
export function wolkenBild(w: Wolken, stunde: number, schicht: number, e0: number, n0: number, e1: number, n1: number) {
  const breit = Math.min(1024, Math.max(128, Math.round(((e1 - e0) / w.ix.schritt_m) * 12)))
  const hoch = Math.max(16, Math.round((breit * (n1 - n0)) / (e1 - e0)))
  const c = document.createElement('canvas'); c.width = breit; c.height = hoch
  const x = c.getContext('2d')!, bild = x.createImageData(breit, hoch)
  let etwas = false
  for (let py = 0; py < hoch; py++) {
    const n = n1 - ((py + 0.5) / hoch) * (n1 - n0)
    for (let px = 0; px < breit; px++) {
      const e = e0 + ((px + 0.5) / breit) * (e1 - e0)
      const anteil = bewoelkung(w, stunde, schicht, e, n)
      if (anteil === null || anteil <= 0.02) continue
      // deckend, wo das Muster über 1 − Anteil liegt: so deckt die Schicht etwa den Anteil der Fläche, den die Prognose nennt
      const m = gleichmaessig(wolkenMuster(e / 1000, n / 1000, WOLKEN_KORN_KM[schicht], schicht * 7), schicht)
      const a = Math.max(0, Math.min(1, (m - (1 - anteil)) / 0.08 + 0.5))
      if (a <= 0) continue
      const i = (py * breit + px) * 4
      bild.data[i] = 250; bild.data[i + 1] = 251; bild.data[i + 2] = 253; bild.data[i + 3] = Math.round(a * 235)
      etwas = true
    }
  }
  if (!etwas) return null
  x.putImageData(bild, 0, 0)
  return c
}
/** Wolken in echter Höhe: so viele Ebenen höchstens (bei mehr Stufen mit Wolken je zwei oder mehr zusammen), Bildpunkte höchstens,
 *  Deckkraft einer Ebene (sie liegen übereinander); gewählt */
const WOLKEN3D_EBENEN = 24, WOLKEN3D_PX = 512, WOLKEN3D_DECKT = 200
/** das Muster in echter Höhe: zwei Rauschfelder (Körnung in km, gewählt), je Stufe anders gemischt, damit eine Wolke nach oben ihre Form
 *  ändert, aber zusammenhängt */
const WOLKEN3D_KORN_KM = [4, 2.5]
/** die Bilder der Ebenen mit Wolken über dem Rechteck aus den Wolken in echter Höhe (Stunde j); Höhe der Ebene über Meer in m */
export function wolkenEbenen3d(w: Wolken, j: number, e0: number, n0: number, e1: number, n1: number) {
  const z = w.ix.wolken3d!
  const breit = Math.min(WOLKEN3D_PX, Math.max(128, Math.round(((e1 - e0) / w.ix.schritt_m) * 12)))
  const hoch = Math.max(16, Math.round((breit * (n1 - n0)) / (e1 - e0)))
  // je Stufe, ob und wie viel Wolke über dem Rechteck liegt (grob abgetastet)
  const mit: number[] = []
  for (let k = 0; k < z.stufen; k++) {
    let max = 0
    for (let a = 0; a <= 12 && max < 0.03; a++) for (let c = 0; c <= 12; c++) {
      const v = bewoelkung3d(w, j, k, e0 + (a / 12) * (e1 - e0), n0 + (c / 12) * (n1 - n0)) ?? 0
      if (v > max) max = v
    }
    if (max >= 0.03) mit.push(k)
  }
  if (!mit.length) return []
  // die beiden Rauschfelder, gleichmässig verteilt
  const U1 = new Float32Array(breit * hoch), U2 = new Float32Array(breit * hoch)
  for (let py = 0; py < hoch; py++) {
    const n = n1 - ((py + 0.5) / hoch) * (n1 - n0)
    for (let px = 0; px < breit; px++) {
      const e = e0 + ((px + 0.5) / breit) * (e1 - e0), q = py * breit + px
      U1[q] = gleichmaessig(wolkenMuster(e / 1000, n / 1000, WOLKEN3D_KORN_KM[0], 101), 0)
      U2[q] = gleichmaessig(wolkenMuster(e / 1000, n / 1000, WOLKEN3D_KORN_KM[1], 202), 1)
    }
  }
  const schritt = Math.ceil(mit.length / WOLKEN3D_EBENEN)
  const raus: Array<{ hoeheM: number; bild: HTMLCanvasElement }> = []
  for (let g = 0; g < mit.length; g += schritt) {
    const gruppe = mit.slice(g, g + schritt)
    const t = 0.5 + 0.5 * Math.sin(gruppe[0] * 0.45)
    // die Mischung wieder gleichmässig verteilen, nach dem Rang unter 2'000 Proben
    const probe = new Float32Array(2000)
    for (let i = 0; i < probe.length; i++) { const q = Math.floor((i / probe.length) * U1.length); probe[i] = U1[q] * (1 - t) + U2[q] * t }
    probe.sort()
    const rang = (m: number) => { let lo = 0, hi = probe.length; while (lo < hi) { const mi = (lo + hi) >> 1; if (probe[mi] < m) lo = mi + 1; else hi = mi } return lo / probe.length }
    const c = document.createElement('canvas'); c.width = breit; c.height = hoch
    const x = c.getContext('2d')!, bild = x.createImageData(breit, hoch)
    let etwas = false
    for (let py = 0; py < hoch; py++) {
      const n = n1 - ((py + 0.5) / hoch) * (n1 - n0)
      for (let px = 0; px < breit; px++) {
        const e = e0 + ((px + 0.5) / breit) * (e1 - e0)
        let anteil = 0
        for (const k of gruppe) anteil = Math.max(anteil, bewoelkung3d(w, j, k, e, n) ?? 0)
        if (anteil <= 0.02) continue
        const q = py * breit + px, m = rang(U1[q] * (1 - t) + U2[q] * t)
        const a = Math.max(0, Math.min(1, (m - (1 - anteil)) / 0.08 + 0.5))
        if (a <= 0) continue
        const i = q * 4
        bild.data[i] = 250; bild.data[i + 1] = 251; bild.data[i + 2] = 253; bild.data[i + 3] = Math.round(a * WOLKEN3D_DECKT)
        etwas = true
      }
    }
    if (!etwas) continue
    x.putImageData(bild, 0, 0)
    const mitteK = (gruppe[0] + gruppe[gruppe.length - 1]) / 2
    raus.push({ hoeheM: z.unten_m + (mitteK + 0.5) * z.schritt_m, bild: c })
  }
  return raus
}
