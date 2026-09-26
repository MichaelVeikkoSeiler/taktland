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
import type { FlaechenDaten, KodierterZug, SeenDaten, SehenswertDaten, StreckenAbschnitt, StreckenGeometrie, StreckenNetz,
  TlmBauwerk } from './typen'

/** Meter je Grad in der Schweiz: für kurze Abstände genau genug */
const M_BREITE = 111_200
const M_LAENGE = 73_000

/** Ein Sprung in der Kilometrierung: zwei Punkte, die so weit auseinander liegen */
const SPRUNG_M = 1500

interface Lage { lat: number; lon: number }
export interface Punkt extends Lage { s: number }

interface Linienzug { km: number[]; lat: number[]; lon: number[] }

export type SehenswertSorte = 'gipfel' | 'kgs' | 'seilbahn' | 'flaeche'

export interface FahrObjekt {
  kennung: string
  art: 'tunnel' | 'bruecke' | 'bahnhof' | 'sehenswert'
  /** Einfahrt, beim Bahnhof der Betriebspunkt, in Metern entlang des Wegs */
  s: number
  /** Ausfahrt: bei Tunneln, deren Richtung die Daten hergeben, und bei Flächen */
  sAus: number | null
  /** nur bei Tunneln und Brücken aus swissTLM3D (Strecken anderer Bahnen) */
  tlm?: TlmBauwerk
  /** nur bei Sehenswertem: was die Quelle dazu sagt und auf welcher Seite es liegt */
  sehenswert?: {
    sorte: SehenswertSorte
    /** Gipfel, Kulturgut, Seilbahn oder die Art der Fläche */
    art: string
    name: string
    zeile: string
    /** in Fahrtrichtung; null bei Flächen, durch die der Weg führt */
    seite: 'links' | 'rechts' | null
  }
}

export interface Fahrweg {
  punkte: Punkt[]
  objekte: FahrObjekt[]
  /** Stücke, auf denen ein See neben der Strecke liegt, mit der Seite */
  seeUfer?: SeeUfer[]
}

export interface SeeUfer { s0: number; s1: number; seite: 'links' | 'rechts'; name: string | null }

export function abstand(a: Lage, b: Lage) {
  return Math.hypot((b.lat - a.lat) * M_BREITE, (b.lon - a.lon) * M_LAENGE)
}

export function geometrieLesen(g: StreckenGeometrie) {
  const raus: Map<number, Linienzug> & { abschnitte?: StreckenGeometrie['abschnitte']
                                         bauwerke?: StreckenGeometrie['bauwerke'] } = new Map<number, Linienzug>()
  raus.abschnitte = g.abschnitte
  raus.bauwerke = g.bauwerke
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
export function fahrwegBauen(netz: StreckenNetz,
                             linien: Map<number, Linienzug> & { abschnitte?: StreckenGeometrie['abschnitte']
                                                                bauwerke?: StreckenGeometrie['bauwerke'] },
                             punkteWeg: string[],
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
      // Strecken anderer Bahnen: dem Verlauf laut Schienennetz des BAV entlang,
      // sonst gerade von Ende zu Ende
      const verlauf = linien.abschnitte?.[`${e.von}|${e.nach}`]
      const ab = Math.max(0, punkte.length - 1)
      if (verlauf) {
        const pts = entpacken(verlauf)
        for (const p of vorwaerts ? pts : pts.reverse()) hinzu(p)
      } else {
        for (const abk of [punkteWeg[i], punkteWeg[i + 1]]) {
          const [lat, lon] = netz.lagen[abk]
          hinzu({ lat, lon })
        }
      }
      // Tunnel und Brücken aus swissTLM3D: Anfang und Ende auf den eben gelegten Weg
      for (const id of verlauf ? e.tlm ?? [] : []) {
        const b = linien.bauwerke?.[id]
        if (!b || objekte.has(`tlm ${id}`)) continue
        const l = entpacken(b)
        const stueck = { punkte: punkte.slice(ab), objekte: [] }
        const [s1, s2] = [l[0], l[l.length - 1]].map((q) => projizieren(stueck, q).s).sort((x, y) => x - y)
        const tunnelartig = b.art === 'tunnel' || b.art === 'galerie'
        objekte.set(`tlm ${id}`, { kennung: `tlm:${id}`, art: tunnelartig ? 'tunnel' : 'bruecke', s: s1,
                                   sAus: tunnelartig && s2 > s1 ? s2 : null, tlm: b })
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
 * Ein weicher Zweiklang wie ein kleines Glockenspiel, aufsteigend G4–D5 mit
 * leisem Oberton und langem Ausklang (Michael, 2026-09-25: «einen anderen
 * Audioton», dann «wesentlich tiefer»; vorher zwei kurze Pieptöne). Bewusst
 * nicht der Gong der SBB. Der Oberton hilft kleinen Handylautsprechern.
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
    for (const [beginn, hoehe] of [[0, 392], [0.16, 587]] as const) {
      for (const [faktor, staerke] of [[1, 0.34], [2, 0.12]] as const) {
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


/**
 * Sehenswertes am Weg für den Fahrtmodus (Michael, 2026-09-26: «links» oder
 * «rechts» und «du fährst durch …»). Gemeldet wird, was nahe an der
 * gezeichneten Strecke liegt: Kulturgüter bis KGS_M, Seilbahnen mit einem Ende
 * bis SEILBAHN_M, Gipfel bis GIPFEL_M. Die Seite ergibt sich aus der Lage in der
 * Quelle gegenüber der Strecke in Fahrtrichtung; ob man es vom Zug aus sieht,
 * sagen die Daten nicht. Flächen (BLN, Pärke, Moorlandschaften) werden
 * gemeldet, wo der Weg in sie hineinführt, mit der Stelle, wo er sie verlässt.
 */
export const KGS_M = 200
export const SEILBAHN_M = 300
export const GIPFEL_M = 8000
/** Abstand der Stichproben, mit denen der Weg auf Flächen geprüft wird */
const FLAECHE_SCHRITT_M = 100
/** Kürzere Lücken zwischen zwei Stücken in derselben Fläche gelten als drin */
const FLAECHE_LUECKE_M = 500
/** Kürzer als das zählt nicht als Durchfahrt (Rand der vereinfachten Fläche) */
const FLAECHE_MIN_M = 300

const xy = (p: Lage) => [p.lon * M_LAENGE, p.lat * M_BREITE] as const

/** Nächste Stelle auf dem Weg samt Seite in Fahrtrichtung. Liegt sie an
 *  Anfang oder Ende des Wegs, gibt es keine Seite: Das Objekt liegt davor oder dahinter. */
export function seitlich(fw: Fahrweg, p: Lage) {
  const pts = fw.punkte
  const [px, py] = xy(p)
  let best = { s: 0, abstand: Infinity, kreuz: 0, t: 0, i: 0 }
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = xy(pts[i - 1])
    const [bx, by] = xy(pts[i])
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy)
    if (d < best.abstand) {
      best = { s: pts[i - 1].s + t * (pts[i].s - pts[i - 1].s), abstand: d,
               kreuz: dx * (py - ay) - dy * (px - ax), t, i }
    }
  }
  const amEnde = (best.i === 1 && best.t === 0) || (best.i === pts.length - 1 && best.t === 1)
  // Osten ist x, Norden ist y: positives Kreuzprodukt heisst links der Fahrtrichtung
  const seite: 'links' | 'rechts' | null = amEnde || best.kreuz === 0 ? null
    : best.kreuz > 0 ? 'links' : 'rechts'
  return { s: best.s, abstand: best.abstand, seite }
}

function entpacken(z: KodierterZug): Lage[] {
  let [la, lo] = z.start
  const raus = [{ lat: la / 1e5, lon: lo / 1e5 }]
  for (let i = 0; i < z.d.length; i += 2) {
    la += z.d[i]; lo += z.d[i + 1]
    raus.push({ lat: la / 1e5, lon: lo / 1e5 })
  }
  return raus
}

function innen(p: Lage, ring: Lage[]) {
  let drin = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.lat > p.lat) !== (b.lat > p.lat)
        && p.lon < (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon) drin = !drin
  }
  return drin
}

const zahl = (n: number) => n.toLocaleString('de-CH')

export function sehenswertAufWeg(fw: Fahrweg, daten: SehenswertDaten, flaechen: FlaechenDaten): FahrObjekt[] {
  if (fw.punkte.length < 2) return []
  const ende = wegEnde(fw)
  // Rahmen des Wegs, damit nicht jedes Objekt der Schweiz gerechnet wird
  const rand = GIPFEL_M / M_LAENGE
  const la = fw.punkte.map((p) => p.lat), lo = fw.punkte.map((p) => p.lon)
  const [la0, la1, lo0, lo1] = [Math.min(...la) - rand, Math.max(...la) + rand, Math.min(...lo) - rand, Math.max(...lo) + rand]
  const imRahmen = (p: Lage) => p.lat > la0 && p.lat < la1 && p.lon > lo0 && p.lon < lo1
  const raus: FahrObjekt[] = []
  // Im Tunnel sieht man nichts: dort wird nichts Sehenswertes gemeldet
  const tunnel = fw.objekte.filter((o) => o.art === 'tunnel' && o.sAus !== null).map((o) => [o.s, o.sAus!] as const)
  const tunnelBei = (s: number) => tunnel.find(([a, b]) => s >= a && s <= b)
  const dazu = (kennung: string, p: Lage, grenze: number, x: Omit<NonNullable<FahrObjekt['sehenswert']>, 'seite'>) => {
    if (!imRahmen(p)) return
    const n = seitlich(fw, p)
    if (n.abstand > grenze || n.seite === null || n.s <= 0 || n.s >= ende || tunnelBei(n.s)) return
    raus.push({ kennung, art: 'sehenswert', s: n.s, sAus: null, sehenswert: { ...x, seite: n.seite } })
  }
  for (const k of daten.kgs) {
    dazu(`kgs ${k.nr}`, { lat: k.lage[0], lon: k.lage[1] }, KGS_M, {
      sorte: 'kgs', art: 'Kulturgut', name: k.name,
      zeile: [k.art ?? k.gruppe, `${k.gemeinde}${k.kanton ? ` ${k.kanton}` : ''}`].join(' · ') })
  }
  daten.gipfel.forEach((g, i) => {
    dazu(`gipfel ${i}`, { lat: g.lage[0], lon: g.lage[1] }, GIPFEL_M, {
      sorte: 'gipfel', art: 'Gipfel', name: g.name,
      zeile: g.hoehe_m != null ? `${zahl(g.hoehe_m)} m ü. M.` : 'Höhe: keine Angabe' })
  })
  for (const b of daten.seilbahnen) {
    // das Ende näher an der Strecke, meist die Talstation
    const enden = b.verlauf.flatMap((z) => { const l = entpacken(z); return [l[0], l[l.length - 1]] })
    const nah = enden.filter(imRahmen).map((p) => ({ p, n: seitlich(fw, p) }))
      .sort((a, c) => a.n.abstand - c.n.abstand)[0]
    if (!nah) continue
    dazu(`seilbahn ${b.nr}`, nah.p, SEILBAHN_M, {
      sorte: 'seilbahn', art: 'Seilbahn', name: b.name,
      zeile: [b.bahntyp, b.laenge_schief_m != null ? `Länge schief ${zahl(b.laenge_schief_m)} m` : null,
              b.hoehendifferenz_m != null ? `Höhendifferenz ${zahl(b.hoehendifferenz_m)} m` : null]
        .filter(Boolean).join(' · ') || 'Seilbahn' })
  }

  // Flächen: der Weg in Schritten, je Schritt drin oder nicht
  const proben: Array<Lage & { s: number }> = []
  for (let i = 1; i < fw.punkte.length; i++) {
    const a = fw.punkte[i - 1], b = fw.punkte[i]
    const n = Math.max(1, Math.ceil((b.s - a.s) / FLAECHE_SCHRITT_M))
    for (let k = 0; k < n; k++) {
      const t = k / n
      proben.push({ lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon), s: a.s + t * (b.s - a.s) })
    }
  }
  proben.push(fw.punkte[fw.punkte.length - 1])
  flaechen.flaechen.forEach((f, nr) => {
    const ringe = f.ringe.map(entpacken)
    const alle = ringe.flat()
    const [fla0, fla1] = [Math.min(...alle.map((p) => p.lat)), Math.max(...alle.map((p) => p.lat))]
    const [flo0, flo1] = [Math.min(...alle.map((p) => p.lon)), Math.max(...alle.map((p) => p.lon))]
    const stuecke: Array<[number, number]> = []
    for (const p of proben) {
      if (p.lat < fla0 || p.lat > fla1 || p.lon < flo0 || p.lon > flo1) continue
      // gerade-ungerade über alle Ringe: Inseln und Löcher zählen nicht als drin
      if (ringe.filter((r) => innen(p, r)).length % 2 === 0) continue
      const letztes = stuecke[stuecke.length - 1]
      if (letztes && p.s - letztes[1] <= FLAECHE_LUECKE_M) letztes[1] = p.s
      else stuecke.push([p.s, p.s])
    }
    // beginnt die Durchfahrt im Tunnel, gilt sie ab dessen Ausfahrt
    for (const st of stuecke) {
      let t = tunnelBei(st[0])
      while (t && st[0] < st[1]) { st[0] = t[1]; t = tunnelBei(st[0] + 1) }
    }
    stuecke.filter(([a, b]) => b - a >= FLAECHE_MIN_M).forEach(([a, b], k) => {
      const art = f.art === 'BLN' ? 'BLN-Gebiet' : f.art
      raus.push({ kennung: `flaeche ${nr}:${k}`, art: 'sehenswert', s: a, sAus: b,
                  sehenswert: { sorte: 'flaeche', art, name: f.name, seite: null,
                                zeile: f.art === 'BLN' ? 'Landschaft oder Naturdenkmal von nationaler Bedeutung' : f.art } })
    })
  })
  return raus
}


/**
 * Wo ein See neben der Strecke liegt (Michael, 2026-09-26: «Seetangierungen als
 * hellblaue Linie … an der richtigen Seite»). Alle SEE_SCHRITT_M wird ein Punkt
 * SEE_M links und rechts der Strecke geprüft: Liegt er in einem See der
 * Landeskarte 1:1 Million, liegt der See auf dieser Seite. Kleine Seen fehlen in
 * diesem Massstab; in Tunneln zählt nichts.
 */
export const SEE_M = 350  // Michael, 2026-09-26: 350 statt 250 m
const SEE_SCHRITT_M = 100
const SEE_LUECKE_M = 1000
const SEE_MIN_M = 300

export function seeUferAufWeg(fw: Fahrweg, daten: SeenDaten): SeeUfer[] {
  const seen = daten.seen.map((x) => {
    const ringe = x.ringe.map(entpacken)
    const alle = ringe[0] ?? []
    return { ringe, name: x.name ?? null,
             la0: Math.min(...alle.map((p) => p.lat)), la1: Math.max(...alle.map((p) => p.lat)),
             lo0: Math.min(...alle.map((p) => p.lon)), lo1: Math.max(...alle.map((p) => p.lon)) }
  })
  const imSee = (p: Lage) => seen.find((x) => p.lat >= x.la0 && p.lat <= x.la1 && p.lon >= x.lo0 && p.lon <= x.lo1
    && x.ringe.filter((r) => innen(p, r)).length % 2 === 1)
  const tunnel = fw.objekte.filter((o) => o.art === 'tunnel' && o.sAus !== null).map((o) => [o.s, o.sAus!] as const)
  const offen: Partial<Record<'links' | 'rechts', SeeUfer>> = {}
  const raus: SeeUfer[] = []
  const schliessen = (seite: 'links' | 'rechts') => {
    const u = offen[seite]
    if (u && u.s1 - u.s0 >= SEE_MIN_M) raus.push(u)
    delete offen[seite]
  }
  for (let i = 1; i < fw.punkte.length; i++) {
    const a = fw.punkte[i - 1], b = fw.punkte[i]
    const [ax, ay] = xy(a), [bx, by] = xy(b)
    const l = Math.hypot(bx - ax, by - ay)
    if (!l) continue
    // senkrecht nach links, in Grad
    const nLat = ((bx - ax) / l) * SEE_M / M_BREITE, nLon = (-(by - ay) / l) * SEE_M / M_LAENGE
    const n = Math.max(1, Math.ceil((b.s - a.s) / SEE_SCHRITT_M))
    for (let k = 0; k < n; k++) {
      const t = k / n
      const p = { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) }
      const s = a.s + t * (b.s - a.s)
      const drinnen = tunnel.some(([v, w]) => s >= v && s <= w)
      for (const [seite, f] of [['links', 1], ['rechts', -1]] as const) {
        const see = drinnen ? undefined : imSee({ lat: p.lat + f * nLat, lon: p.lon + f * nLon })
        const u = offen[seite]
        if (see && u && s - u.s1 <= SEE_LUECKE_M) { u.s1 = s; u.name ??= see.name }
        else if (see) { schliessen(seite); offen[seite] = { s0: s, s1: s, seite, name: see.name } }
        else if (u && s - u.s1 > SEE_LUECKE_M) schliessen(seite)
      }
    }
  }
  schliessen('links'); schliessen('rechts')
  return raus.sort((x, y) => x.s0 - y.s0)
}
