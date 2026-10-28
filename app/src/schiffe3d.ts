/**
 * Schiffe laut Fahrplan für 3D-Land (3dland.ch), nicht für Taktland (Michael, 2026-10-28: «Ja gern, tolle Idee»). Die Daten baut
 * pipeline/build_schiffe3d.py im Workflow von 3dland.ch und legt sie neben die Seite (schiffe3d/schiffe.json): die Fahrten mit
 * ihren Ländten und je Paar von Ländten der Weg auf den Kurslinien von swissTLMRegio. Wo ein Schiff zu einer Zeit ist, rechnet
 * zugStelle wie bei den Zügen: zwischen zwei Ländten gleichmässig auf diesem Weg, eine Annahme.
 */
import { holen } from './daten'
import type { ZugFahrt } from './zuege3d'

interface Roh {
  quelle: string; datei: string; stand: string; von: string; bis: string; hinweis: string; tage: string[]
  laendten: Array<[string, number, number]>
  wege: Record<string, number[]>
  fahrten: Array<[string, string, string, string, number, Array<number | null>]>
}

/** ein Weg zwischen zwei Ländten in LV95, mit den Metern ab dem Anfang je Punkt */
export interface SchiffWeg { e: number[]; n: number[]; s: number[]; laenge: number }

export interface Schiffe {
  von: string; stand: string
  laendten: Array<{ name: string; e: number; n: number }>
  /** wie die Züge; abk ist die Nummer der Ländte als Text, gleis immer null */
  fahrten: ZugFahrt[]
  weg: (a: string, b: string) => SchiffWeg | null
}

const adresse = (pfad: string) => new URL(`schiffe3d/${pfad}`, window.location.href).href

let vorrat: Promise<Schiffe | null> | null = null
export function schiffeLaden(): Promise<Schiffe | null> {
  vorrat ??= holen<Roh>(adresse('schiffe.json')).then((r): Schiffe => {
    const tage = r.tage.map((t) => parseInt(t, 16))
    const fahrten: ZugFahrt[] = r.fahrten.map(([nummer, gattung, linie, ziel, t, flach], id) => {
      const halte: ZugFahrt['halte'] = []
      for (let i = 0; i + 2 < flach.length; i += 3) halte.push({ abk: String(flach[i]), an: flach[i + 1], ab: flach[i + 2], gleis: null })
      return { id, nummer, gattung, linie, ziel, tage: tage[t] ?? 0, halte }
    })
    const wege = new Map<string, SchiffWeg | null>()
    const weg = (a: string, b: string) => {
      const k = `${a}>${b}`
      if (!wege.has(k)) {
        const f = r.wege[k]
        let w: SchiffWeg | null = null
        if (f && f.length >= 4) {
          const e = [f[0]], n = [f[1]], s = [0]
          for (let i = 2; i + 1 < f.length; i += 2) {
            e.push(e[e.length - 1] + f[i]); n.push(n[n.length - 1] + f[i + 1])
            s.push(s[s.length - 1] + Math.hypot(f[i], f[i + 1]))
          }
          w = { e, n, s, laenge: s[s.length - 1] }
        }
        wege.set(k, w)
      }
      return wege.get(k)!
    }
    return { von: r.von, stand: r.stand, laendten: r.laendten.map(([name, e, n]) => ({ name, e, n })), fahrten, weg }
  }).catch(() => null)
  return vorrat
}

/** Lage und Richtung (Einheitsvektor) auf einem Weg nach sm Metern, ausserhalb des Wegs an seinem Ende */
export function schiffBei(w: SchiffWeg, sm: number): { e: number; n: number; de: number; dn: number } {
  const m = Math.max(0, Math.min(w.laenge, sm))
  let lo = 0, hi = w.s.length - 1
  while (hi - lo > 1) { const mi = (lo + hi) >> 1; if (w.s[mi] <= m) lo = mi; else hi = mi }
  const d = w.s[hi] - w.s[lo] || 1, t = (m - w.s[lo]) / d
  const de = w.e[hi] - w.e[lo], dn = w.n[hi] - w.n[lo], l = Math.hypot(de, dn) || 1
  return { e: w.e[lo] + de * t, n: w.n[lo] + dn * t, de: de / l, dn: dn / l }
}
