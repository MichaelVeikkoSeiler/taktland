/**
 * Rechnung für den Fahrtmodus: Wo auf dem Weg ist der Zug, und wann kommt
 * das nächste Objekt? Alles läuft auf dem Gerät; der Standort wird weder
 * gespeichert noch gesendet.
 *
 * Der Weg wird zum Linienzug: auf den Linien der SBB entlang der
 * Kilometrierung (Punkte alle 100 m), auf Abschnitten anderer Bahnen gerade
 * von Ende zu Ende. s ist die Stelle auf diesem Linienzug in Metern. Sie dient
 * nur der Rechnung; eine Länge des Wegs zeigt die App nicht an, weil die
 * Kilometrierung ein Standort ist und keine Länge.
 */
import type { StreckenAbschnitt, StreckenGeometrie, StreckenNetz } from './typen'

/** Meter je Grad in der Schweiz: für kurze Abstände genau genug */
const M_BREITE = 111_200
const M_LAENGE = 73_000

/** Ein Sprung in der Kilometrierung: zwei Punkte, die so weit auseinander liegen */
const SPRUNG_M = 1500

interface Lage { lat: number; lon: number }
export interface Punkt extends Lage { s: number }

interface Linienzug { km: number[]; lat: number[]; lon: number[] }

export interface FahrObjekt {
  kennung: string
  art: 'tunnel' | 'bruecke' | 'bahnhof'
  /** Einfahrt, beim Bahnhof der Betriebspunkt, in Metern entlang des Wegs */
  s: number
  /** Ausfahrt, nur bei Tunneln, deren Richtung die Daten hergeben */
  sAus: number | null
}

export interface Fahrweg {
  punkte: Punkt[]
  objekte: FahrObjekt[]
}

export function abstand(a: Lage, b: Lage) {
  return Math.hypot((b.lat - a.lat) * M_BREITE, (b.lon - a.lon) * M_LAENGE)
}

export function geometrieLesen(g: StreckenGeometrie) {
  const raus = new Map<number, Linienzug>()
  for (const [nr, x] of Object.entries(g.linien)) {
    let [m, la, lo] = x.start
    const z: Linienzug = { km: [m / 1000], lat: [la / 1e5], lon: [lo / 1e5] }
    for (let i = 0; i < x.d.length; i += 3) {
      m += x.d[i]; la += x.d[i + 1]; lo += x.d[i + 2]
      z.km.push(m / 1000); z.lat.push(la / 1e5); z.lon.push(lo / 1e5)
    }
    raus.set(Number(nr), z)
  }
  return raus
}

/** Lage bei km, zwischen den beiden benachbarten Punkten linear */
function aufLinie(z: Linienzug, km: number): Lage {
  const n = z.km.length - 1
  if (km <= z.km[0]) return { lat: z.lat[0], lon: z.lon[0] }
  if (km >= z.km[n]) return { lat: z.lat[n], lon: z.lon[n] }
  let lo = 0, hi = n
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (z.km[m] <= km) lo = m
    else hi = m
  }
  const t = (km - z.km[lo]) / (z.km[hi] - z.km[lo] || 1)
  return { lat: z.lat[lo] + t * (z.lat[hi] - z.lat[lo]), lon: z.lon[lo] + t * (z.lon[hi] - z.lon[lo]) }
}

/**
 * Baut den Linienzug des Wegs und legt jedes Objekt darauf. punkte sind die
 * Betriebspunkte des Wegs in Fahrtrichtung, abschnitte die Abschnitte
 * dazwischen. brueckeKm gibt den Kilometer einer Brücke auf ihrer Linie.
 * istBahnhof sagt, welche Betriebspunkte als Bahnhof gemeldet werden; der
 * Start zählt nicht, er liegt schon hinter dem Zug.
 */
export function fahrwegBauen(netz: StreckenNetz, linien: Map<number, Linienzug>, punkteWeg: string[],
                             abschnitte: StreckenAbschnitt[], brueckeKm: (kennung: string) => number | undefined,
                             tunnelLaenge: (kennung: string) => number | null,
                             istBahnhof: (abk: string) => boolean): Fahrweg {
  const punkte: Punkt[] = []
  // nach Art getrennt: «660:0» ist der erste Tunnel und die erste Brücke der Linie 660
  const objekte = new Map<string, FahrObjekt>()
  let s = 0
  const hinzu = (p: Lage) => {
    const letzter = punkte[punkte.length - 1]
    if (letzter) {
      const d = abstand(letzter, p)
      if (d < 1) return
      s += d
    }
    punkte.push({ ...p, s })
  }

  // am Ende eines Abschnitts steht der Zug an dessen Betriebspunkt
  const bahnhofSetzen = (abk: string) => {
    if (istBahnhof(abk) && !objekte.has(`bahnhof ${abk}`)) {
      objekte.set(`bahnhof ${abk}`, { kennung: abk, art: 'bahnhof', s, sAus: null })
    }
  }

  abschnitte.forEach((e, i) => {
    const vorwaerts = e.von === punkteWeg[i]
    if (!e.teile?.length) {
      for (const abk of [punkteWeg[i], punkteWeg[i + 1]]) {
        const [lat, lon] = netz.lagen[abk]
        hinzu({ lat, lon })
      }
      bahnhofSetzen(punkteWeg[i + 1])
      return
    }
    for (const t of vorwaerts ? e.teile : [...e.teile].reverse()) {
      const z = linien.get(t.linie)
      if (!z) continue
      const [ka, kb] = vorwaerts ? [t.km_von, t.km_bis] : [t.km_bis, t.km_von]
      const steigend = ka <= kb
      const stuetzen: Array<[number, number]> = []
      const setzen = (km: number) => { hinzu(aufLinie(z, km)); stuetzen.push([km, s]) }
      setzen(ka)
      const innen: number[] = []
      for (let j = 0; j < z.km.length; j++) {
        if (z.km[j] > Math.min(ka, kb) && z.km[j] < Math.max(ka, kb)) innen.push(j)
      }
      if (!steigend) innen.reverse()
      for (const j of innen) {
        const p = { lat: z.lat[j], lon: z.lon[j] }
        if (abstand(punkte[punkte.length - 1], p) > SPRUNG_M) continue
        hinzu(p)
        stuetzen.push([z.km[j], s])
      }
      setzen(kb)

      // Stelle auf dem Weg bei km dieses Teils; ausserhalb gilt das nächste Ende
      const sBei = (km: number) => {
        const x = steigend ? km : -km
        const st = stuetzen.map(([k, w]) => [steigend ? k : -k, w] as const)
        if (x <= st[0][0]) return st[0][1]
        for (let j = 1; j < st.length; j++) {
          if (x <= st[j][0]) {
            const f = (x - st[j - 1][0]) / (st[j][0] - st[j - 1][0] || 1)
            return st[j - 1][1] + f * (st[j][1] - st[j - 1][1])
          }
        }
        return st[st.length - 1][1]
      }

      for (const id of t.tunnel) {
        if (objekte.has(`tunnel ${id}`)) continue
        const [v, w] = netz.tunnel_bereiche[id] ?? [NaN, NaN]
        if (Number.isNaN(v)) continue
        const ein = sBei(steigend ? v : w)
        const laenge = tunnelLaenge(id)
        // Die Ausfahrt nur, wenn die Daten die Richtung hergeben (v ≠ w)
        objekte.set(`tunnel ${id}`, { kennung: id, art: 'tunnel', s: ein,
                          sAus: v !== w && laenge ? ein + laenge : null })
      }
      for (const id of t.bruecken) {
        if (objekte.has(`bruecke ${id}`)) continue
        const km = brueckeKm(id)
        if (km !== undefined) objekte.set(`bruecke ${id}`, { kennung: id, art: 'bruecke', s: sBei(km), sAus: null })
      }
    }
    bahnhofSetzen(punkteWeg[i + 1])
  })
  return { punkte, objekte: [...objekte.values()].sort((a, b) => a.s - b.s) }
}

/** Nächste Stelle auf dem Linienzug. Mit Fenster sucht sie nur zwischen
 *  vonS und bisS, damit ein Weg, der sich selbst nahe kommt, nicht springt. */
export function projizieren(fw: Fahrweg, p: Lage, vonS = -Infinity, bisS = Infinity) {
  let best = { s: 0, abstand: Infinity }
  const pts = fw.punkte
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (b.s < vonS || a.s > bisS) continue
    const ax = a.lon * M_LAENGE, ay = a.lat * M_BREITE
    const dx = b.lon * M_LAENGE - ax, dy = b.lat * M_BREITE - ay
    const px = p.lon * M_LAENGE - ax, py = p.lat * M_BREITE - ay
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0
    const d = Math.hypot(px - t * dx, py - t * dy)
    if (d < best.abstand) best = { s: a.s + t * (b.s - a.s), abstand: d }
  }
  return best
}

/** Lage bei s, für die Probefahrt */
export function lageBei(fw: Fahrweg, s: number): Lage {
  const pts = fw.punkte
  if (s <= 0) return pts[0]
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].s >= s) {
      const a = pts[i - 1], b = pts[i]
      const t = (s - a.s) / (b.s - a.s || 1)
      return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) }
    }
  }
  return pts[pts.length - 1]
}

export function wegEnde(fw: Fahrweg) {
  return fw.punkte[fw.punkte.length - 1]?.s ?? 0
}

/**
 * Ein weicher Zweiklang wie ein kleines Glockenspiel, aufsteigend C6–G6 mit
 * leisem Oberton und langem Ausklang (Michael, 2026-09-25: «einen anderen
 * Audioton»; vorher zwei kurze Pieptöne). Bewusst nicht der Gong der SBB.
 * Der Browser erlaubt Töne erst nach einer Berührung, darum wird er beim Start
 * des Fahrtmodus vorbereitet.
 */
export function tonVorbereiten(): () => void {
  const Kontext = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Kontext) return () => undefined
  const ctx = new Kontext()
  void ctx.resume()
  return () => {
    const jetzt = ctx.currentTime
    // [Beginn in s, Grundton in Hz]; dazu die Oktave darüber, leiser
    for (const [beginn, hoehe] of [[0, 1047], [0.16, 1568]] as const) {
      for (const [faktor, staerke] of [[1, 0.32], [2, 0.08]] as const) {
        const osc = ctx.createOscillator()
        const laut = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = hoehe * faktor
        laut.gain.setValueAtTime(0.0001, jetzt + beginn)
        laut.gain.exponentialRampToValueAtTime(staerke, jetzt + beginn + 0.008)
        laut.gain.exponentialRampToValueAtTime(0.0001, jetzt + beginn + 0.9)
        osc.connect(laut).connect(ctx.destination)
        osc.start(jetzt + beginn)
        osc.stop(jetzt + beginn + 0.95)
      }
    }
  }
}

/**
 * Den Ton im Tipp auf der Seite «Fahrtmodus» vorbereiten und bis zum Start
 * auf der Seite «Strecke» liegen lassen: Dort startet der Fahrtmodus ohne
 * eigenen Tipp, und ohne Tipp bliebe der Ton auf manchen Geräten stumm.
 */
let bereitgelegt: (() => void) | null = null

export function tonBereitlegen() {
  bereitgelegt = tonVorbereiten()
}

export function tonAbholen() {
  const ton = bereitgelegt ?? tonVorbereiten()
  bereitgelegt = null
  return ton
}
