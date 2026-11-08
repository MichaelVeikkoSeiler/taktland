// Bauart von Brücken in «3D Schweiz» (Michael, 2026-11-08: «kannst du auch recherchieren, wie die Brücke architektonisch ungefähr aussieht,
// damit du diese ungefähr so nachbauen kannst? Torbogen, Stahlbrücke, etc.», dann «Ja gern»). Belegt ist nur die Bauart laut Wikidata
// (data/brueckenart.json, pipeline/build_brueckenart.py): Bogenbrücke oder Fachwerkbrücke und, wo genannt, das Material. Wie der Bogen oder
// das Fachwerk aussieht, wie viele Stützen, wie dick und wie hoch, steht in keiner Quelle: eine vereinfachte, gezeichnete Form.
import * as THREE from 'three'

export type Bauart = 'bogen' | 'fachwerk'
export type Stoff = 'stein' | 'beton' | 'stahl'
export interface BrueckenArtEintrag { id: string; name: string | null; e: number; n: number; arten: string[]; stoffe: string[]; laenge_m: number | null }

/** die Bauart aus den Bezeichnungen von Wikidata, null, wo keine gezeichnet wird (auch zerstörte Brücken) */
export function bauartVon(x: BrueckenArtEintrag): { bauart: Bauart; stoff: Stoff; bahn: boolean | null } | null {
  const alle = [...x.arten, ...x.stoffe].join('|').toLowerCase()
  if (alle.includes('zerstört') || alle.includes('ehemalig') || alle.includes('holz')) return null  // Holzbrücken sind meist gedeckt, das zeichnet es nicht
  const bauart: Bauart | null = /bogen|römerbrücke/.test(alle) && !/fachwerk/.test(alle) ? 'bogen' : /fachwerk/.test(alle) ? 'fachwerk' : null
  if (!bauart) return null
  const stoff: Stoff = /stahl|eisen|metall/.test(alle) && !/stahlbeton/.test(alle) ? 'stahl' : /stein|mauer|römer|kalk|granit/.test(alle) ? 'stein'
    : /beton/.test(alle) ? 'beton' : bauart === 'fachwerk' ? 'stahl' : 'stein'
  const bahn = /eisenbahn/.test(alle) && !/straß|strass|fuß|fuss|steg|kombiniert/.test(alle) ? true
    : /straß|strass|fuß|fuss|steg|weg/.test(alle) && !/eisenbahn|kombiniert/.test(alle) ? false : null
  return { bauart, stoff, bahn }
}

/** Farben je Material, gewählt */
const FARBE: Record<Stoff, number> = { stein: 0xb3a487, beton: 0xb8b6ae, stahl: 0x58625f }
/** Masse in m, alle gewählt: Dicke des Bogens unter der Fahrbahn, Abstand und Querschnitt der Stützen, Breite der Stahlrippen, Höhe des Fachwerks */
const BOGEN_DICKE_M = 1.6, BOGEN_SCHEITEL_UNTER_M = 1.2, STUETZE_ABSTAND_M = 8, STUETZE_M = { stein: 0, beton: 0.9, stahl: 0.5 }
const RIPPE_M = 1.3, FACHWERK_HOCH_M = 7.5, FACHWERK_FELD_M = 8, FACHWERK_STAB_M = 0.5
/** ein Bogen nur, wo unter der Fahrbahn mindestens so viel Luft ist, und über die Strecke, wo die Luft mindestens diesen Anteil der grössten hat */
const BOGEN_LUFT_MIN_M = 4, BOGEN_LUFT_ANTEIL = 0.6
/** ausserhalb des Bogens Pfeiler vom Gelände zur Fahrbahn, wo mehr als PFEILER_AB_M Luft ist, in diesem Abstand und Querschnitt (gewählt) */
const PFEILER_AB_M = 3, PFEILER_ABSTAND_M = 16, PFEILER_M = { stein: 2.2, beton: 1.8, stahl: 0.9 }

export interface Achse { e: number[]; n: number[]; z: number[]; lo: number; hi: number }

/** die Netze der Bauart entlang einer Achse (Fahrbahn auf der Höhe z, Breite lo bis hi quer nach links); boden gibt die Höhe des Geländes */
export function bauartNetze(a: Achse, bauart: Bauart, stoff: Stoff, boden: (e: number, n: number) => number,
  X: (e: number) => number, Y: (z: number) => number, Z: (n: number) => number): THREE.Mesh[] {
  const n = a.e.length
  if (n < 2) return []
  // alle 2 m neu abgetastet
  const s: number[] = [0]
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(a.e[i] - a.e[i - 1], a.n[i] - a.n[i - 1]))
  const lang = s[n - 1]
  if (lang < 10) return []
  const schritte = Math.max(2, Math.ceil(lang / 2))
  const P: Array<{ e: number; n: number; z: number; qe: number; qn: number; g: number }> = []
  let j = 0
  for (let k = 0; k <= schritte; k++) {
    const t = (k / schritte) * lang
    while (j < n - 2 && s[j + 1] < t) j++
    const f = (t - s[j]) / ((s[j + 1] - s[j]) || 1)
    const e = a.e[j] + f * (a.e[j + 1] - a.e[j]), nn = a.n[j] + f * (a.n[j + 1] - a.n[j]), z = a.z[j] + f * (a.z[j + 1] - a.z[j])
    const de = a.e[j + 1] - a.e[j], dn = a.n[j + 1] - a.n[j], l = Math.hypot(de, dn) || 1
    P.push({ e, n: nn, z, qe: -dn / l, qn: de / l, g: boden(e, nn) })
  }
  // ausserhalb des Modells kennt es kein Gelände: dann keine Bauart, sonst stünde sie auf 0 m ü. M.
  if (P.some((p) => !Number.isFinite(p.g) || p.g <= 0 || p.g > p.z + 50)) return []
  const geo = new Geo()
  const breite = a.hi - a.lo
  if (bauart === 'bogen') {
    const luft = P.map((p) => p.z - p.g)
    const groesste = Math.max(...luft)
    if (groesste < BOGEN_LUFT_MIN_M) return []
    let i0 = luft.findIndex((x) => x >= groesste * BOGEN_LUFT_ANTEIL), i1 = luft.length - 1
    while (i1 > i0 && luft[i1] < groesste * BOGEN_LUFT_ANTEIL) i1--
    // der Bogen beginnt und endet auf dem Gelände knapp ausserhalb dieser Strecke
    i0 = Math.max(0, i0 - 1); i1 = Math.min(P.length - 1, i1 + 1)
    if (i1 - i0 < 4) return []
    const gA = P[i0].g, gB = P[i1].g
    const bogen = (k: number) => {
      const t = (k - i0) / (i1 - i0), basis = gA + (gB - gA) * t, oben = P[k].z - BOGEN_SCHEITEL_UNTER_M
      return Math.min(oben, basis + (oben - basis) * (1 - (2 * t - 1) ** 2))
    }
    // Stein: ein voller Körper von der Fahrbahn bis unter den Bogen; Beton: ein Bogen über die ganze Breite mit Stützen;
    // Stahl: zwei Rippen an den Rändern mit dünnen Stützen
    const rippen: Array<[number, number]> = stoff === 'stahl' ? [[a.lo, a.lo + RIPPE_M], [a.hi - RIPPE_M, a.hi]] : [[a.lo, a.hi]]
    for (const [q0, q1] of rippen) {
      const unten: number[] = [], oben: number[] = []
      for (let k = i0; k <= i1; k++) { const b = bogen(k); unten.push(b - BOGEN_DICKE_M); oben.push(stoff === 'stein' ? P[k].z : b) }
      geo.band(P.slice(i0, i1 + 1), q0, q1, unten, oben)
      // Stützen von der Oberseite des Bogens zur Fahrbahn
      const st = STUETZE_M[stoff]
      if (st > 0) {
        let naechste = STUETZE_ABSTAND_M / 2
        for (let k = i0; k <= i1; k++) {
          const t = s0(P, k)
          if (t < s0(P, i0) + naechste) continue
          naechste += STUETZE_ABSTAND_M
          const b = bogen(k)
          if (P[k].z - b < 1) continue
          const quer = stoff === 'stahl' ? [(q0 + q1) / 2] : [a.lo + breite * 0.2, a.hi - breite * 0.2]
          for (const q of quer) geo.saeule(P[k], q, b, P[k].z, st)
        }
      }
    }
    // Pfeiler ausserhalb des Bogens, damit die Fahrbahn nicht in der Luft hängt
    for (const [von, bis, richtung] of [[i0, -1, -1], [i1, P.length, 1]] as const) {
      let letzte = s0(P, von)
      for (let k = von + richtung; k !== bis; k += richtung) {
        const t = s0(P, k)
        if (Math.abs(t - letzte) < PFEILER_ABSTAND_M) continue
        letzte = t
        if (P[k].z - P[k].g < PFEILER_AB_M) continue
        const quer = stoff === 'stahl' ? [a.lo + RIPPE_M / 2, a.hi - RIPPE_M / 2] : [(a.lo + a.hi) / 2]
        const d = stoff === 'stahl' ? PFEILER_M.stahl : Math.min(PFEILER_M[stoff], breite)
        for (const q of quer) {
          if (stoff === 'stahl') geo.saeule(P[k], q, P[k].g - 1, P[k].z, d)
          else geo.pfeiler(P[k], q, breite * 0.8, d, P[k].g - 1, P[k].z)
        }
      }
    }
  } else {
    // Fachwerk: je Rand ein Träger über der Fahrbahn: Ober- und Untergurt, Pfosten und Streben je Feld
    for (const q of [a.lo + FACHWERK_STAB_M, a.hi - FACHWERK_STAB_M]) {
      let vor = 0
      for (let k = 1; k < P.length; k++) {
        const t = s0(P, k)
        if (t - s0(P, vor) < FACHWERK_FELD_M && k < P.length - 1) continue
        const A = P[vor], B = P[k]
        geo.stab(A, q, A.z, B, q, B.z)
        geo.stab(A, q, A.z + FACHWERK_HOCH_M, B, q, B.z + FACHWERK_HOCH_M)
        geo.stab(A, q, A.z, A, q, A.z + FACHWERK_HOCH_M)
        geo.stab(A, q, A.z, B, q, B.z + FACHWERK_HOCH_M)
        if (k === P.length - 1) geo.stab(B, q, B.z, B, q, B.z + FACHWERK_HOCH_M)
        vor = k
      }
    }
  }
  const g = geo.fertig(X, Y, Z)
  if (!g) return []
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: FARBE[stoff], side: THREE.DoubleSide }))
  m.castShadow = m.receiveShadow = true
  return [m]
}

const s0 = (P: Array<{ e: number; n: number }>, k: number) => {
  let t = 0
  for (let i = 1; i <= k; i++) t += Math.hypot(P[i].e - P[i - 1].e, P[i].n - P[i - 1].n)
  return t
}

/** Dreiecke in Landeskoordinaten (e, n, Höhe), am Schluss in die Szene */
class Geo {
  p: number[] = []
  private drei(a: number[], b: number[], c: number[]) { this.p.push(...a, ...b, ...c) }
  private viereck(a: number[], b: number[], c: number[], d: number[]) { this.drei(a, b, c); this.drei(a, c, d) }
  /** ein Band entlang der Punkte zwischen q0 und q1 quer, von unten bis oben, mit Deckeln an den Enden */
  band(P: Array<{ e: number; n: number; qe: number; qn: number }>, q0: number, q1: number, unten: number[], oben: number[]) {
    const ecke = (k: number, q: number, z: number) => [P[k].e + P[k].qe * q, P[k].n + P[k].qn * q, z]
    for (let k = 0; k + 1 < P.length; k++) {
      const l0u = ecke(k, q0, unten[k]), l1u = ecke(k + 1, q0, unten[k + 1]), r0u = ecke(k, q1, unten[k]), r1u = ecke(k + 1, q1, unten[k + 1])
      const l0o = ecke(k, q0, oben[k]), l1o = ecke(k + 1, q0, oben[k + 1]), r0o = ecke(k, q1, oben[k]), r1o = ecke(k + 1, q1, oben[k + 1])
      this.viereck(l0u, l1u, r1u, r0u)
      this.viereck(l0o, r0o, r1o, l1o)
      this.viereck(l0u, l0o, l1o, l1u)
      this.viereck(r0u, r1u, r1o, r0o)
    }
    for (const k of [0, P.length - 1]) this.viereck(ecke(k, q0, unten[k]), ecke(k, q1, unten[k]), ecke(k, q1, oben[k]), ecke(k, q0, oben[k]))
  }
  /** eine Säule mit quadratischem Querschnitt d an der Stelle p, q quer, von z0 bis z1 */
  saeule(p: { e: number; n: number; qe: number; qn: number }, q: number, z0: number, z1: number, d: number) {
    const le = p.qn, ln = -p.qe
    const c = (a: number, b: number, z: number) => [p.e + p.qe * (q + a) + le * b, p.n + p.qn * (q + a) + ln * b, z]
    const h = d / 2, ring = [[-h, -h], [h, -h], [h, h], [-h, h]]
    for (let i = 0; i < 4; i++) {
      const [a0, b0] = ring[i], [a1, b1] = ring[(i + 1) % 4]
      this.viereck(c(a0, b0, z0), c(a1, b1, z0), c(a1, b1, z1), c(a0, b0, z1))
    }
  }
  /** ein Pfeiler quer zur Achse: breit (quer) mal dick (längs), von z0 bis z1 */
  pfeiler(p: { e: number; n: number; qe: number; qn: number }, q: number, breit: number, dick: number, z0: number, z1: number) {
    const le = p.qn, ln = -p.qe
    const c = (a: number, b: number, z: number) => [p.e + p.qe * (q + a) + le * b, p.n + p.qn * (q + a) + ln * b, z]
    const ring = [[-breit / 2, -dick / 2], [breit / 2, -dick / 2], [breit / 2, dick / 2], [-breit / 2, dick / 2]]
    for (let i = 0; i < 4; i++) {
      const [a0, b0] = ring[i], [a1, b1] = ring[(i + 1) % 4]
      this.viereck(c(a0, b0, z0), c(a1, b1, z0), c(a1, b1, z1), c(a0, b0, z1))
    }
  }
  /** ein Stab von (A, qa, za) nach (B, qb, zb), Querschnitt FACHWERK_STAB_M */
  stab(A: { e: number; n: number; qe: number; qn: number }, qa: number, za: number, B: { e: number; n: number; qe: number; qn: number }, qb: number, zb: number) {
    const a = new THREE.Vector3(A.e + A.qe * qa, A.n + A.qn * qa, za), b = new THREE.Vector3(B.e + B.qe * qb, B.n + B.qn * qb, zb)
    const r = new THREE.Vector3().subVectors(b, a)
    if (r.length() < 0.1) return
    r.normalize()
    const u = Math.abs(r.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
    const v1 = new THREE.Vector3().crossVectors(r, u).normalize().multiplyScalar(FACHWERK_STAB_M / 2)
    const v2 = new THREE.Vector3().crossVectors(r, v1).normalize().multiplyScalar(FACHWERK_STAB_M / 2)
    const ecken = [v1.clone().add(v2), v1.clone().sub(v2), v1.clone().negate().sub(v2), v1.clone().negate().add(v2)]
    for (let i = 0; i < 4; i++) {
      const p0 = ecken[i], p1 = ecken[(i + 1) % 4]
      this.viereck([a.x + p0.x, a.y + p0.y, a.z + p0.z], [a.x + p1.x, a.y + p1.y, a.z + p1.z], [b.x + p1.x, b.y + p1.y, b.z + p1.z], [b.x + p0.x, b.y + p0.y, b.z + p0.z])
    }
  }
  fertig(X: (e: number) => number, Y: (z: number) => number, Z: (n: number) => number) {
    if (!this.p.length) return null
    const pos = new Float32Array(this.p.length)
    for (let i = 0; i < this.p.length; i += 3) { pos[i] = X(this.p[i]); pos[i + 1] = Y(this.p[i + 2]); pos[i + 2] = Z(this.p[i + 1]) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }
}

/** ein Stück einer Brücke, wie Schweiz3D.tsx es zeichnet: Achse mit Höhe, Breite quer (links negativ) und ob Bahn */
export interface Kandidat { e: number[]; n: number[]; h: number[]; lo: number; hi: number; bahn: boolean }
const ZUORDNEN_M = 40, ANSCHLUSS_M = 6, ANSCHLUSS_WINKEL = Math.PI / 4

/** die Achsen der Brücken laut Wikidata: je Eintrag das nächste Stück bis ZUORDNEN_M neben seiner Lage (bei Bahn oder Strasse nur dieses), dazu
 *  die Stücke, die an seinen Enden anschliessen, bis die Länge laut Wikidata erreicht ist (ohne Länge höchstens 300 m) */
export function zuordnen(eintraege: BrueckenArtEintrag[], kandidaten: Kandidat[]) {
  const raus: Array<{ achse: Achse; bauart: Bauart; stoff: Stoff; name: string | null }> = []
  const vergeben = new Set<Kandidat>()
  const abstand = (k: Kandidat, e: number, n: number) => {
    let m = Infinity
    for (let i = 0; i + 1 < k.e.length; i++) {
      const de = k.e[i + 1] - k.e[i], dn = k.n[i + 1] - k.n[i], l2 = de * de + dn * dn
      const t = l2 ? Math.max(0, Math.min(1, ((e - k.e[i]) * de + (n - k.n[i]) * dn) / l2)) : 0
      m = Math.min(m, Math.hypot(e - k.e[i] - t * de, n - k.n[i] - t * dn))
    }
    return m
  }
  const laenge = (e: number[], n: number[]) => { let l = 0; for (let i = 1; i < e.length; i++) l += Math.hypot(e[i] - e[i - 1], n[i] - n[i - 1]); return l }
  for (const x of eintraege) {
    const b = bauartVon(x)
    if (!b) continue
    let best: Kandidat | null = null, bd = ZUORDNEN_M
    for (const k of kandidaten) {
      if (vergeben.has(k) || (b.bahn !== null && k.bahn !== b.bahn)) continue
      const d = abstand(k, x.e, x.n)
      if (d < bd) { bd = d; best = k }
    }
    if (!best) continue
    vergeben.add(best)
    const E = [...best.e], N = [...best.n], H = [...best.h]
    const ziel = x.laenge_m ? x.laenge_m * 1.1 : 300
    for (let weiter = true; weiter && laenge(E, N) < ziel;) {
      weiter = false
      for (const k of kandidaten) {
        if (vergeben.has(k) || k.bahn !== best.bahn) continue
        const m = k.e.length - 1, l = E.length - 1
        const nah = (i: number, j: number) => Math.hypot(E[i] - k.e[j], N[i] - k.n[j]) < ANSCHLUSS_M
        const rueck = (a: number[]) => [...a].reverse()
        // nur, wo das Stück die Richtung fortsetzt: sonst ist es die Gegenfahrbahn derselben Brücke und die Kette liefe zurück
        const weiterSo = (ae: number, an: number, be: number, bn: number) => {
          const la = Math.hypot(ae, an), lb = Math.hypot(be, bn)
          return la > 0 && lb > 0 && (ae * be + an * bn) / (la * lb) > Math.cos(ANSCHLUSS_WINKEL)
        }
        const endeE = E[l] - E[l - 1], endeN = N[l] - N[l - 1], anfE = E[1] - E[0], anfN = N[1] - N[0]
        if (nah(l, 0) && weiterSo(endeE, endeN, k.e[1] - k.e[0], k.n[1] - k.n[0])) { E.push(...k.e.slice(1)); N.push(...k.n.slice(1)); H.push(...k.h.slice(1)) }
        else if (nah(l, m) && weiterSo(endeE, endeN, k.e[m - 1] - k.e[m], k.n[m - 1] - k.n[m])) { E.push(...rueck(k.e).slice(1)); N.push(...rueck(k.n).slice(1)); H.push(...rueck(k.h).slice(1)) }
        else if (nah(0, m) && weiterSo(k.e[m] - k.e[m - 1], k.n[m] - k.n[m - 1], anfE, anfN)) { E.unshift(...k.e.slice(0, -1)); N.unshift(...k.n.slice(0, -1)); H.unshift(...k.h.slice(0, -1)) }
        else if (nah(0, 0) && weiterSo(k.e[0] - k.e[1], k.n[0] - k.n[1], anfE, anfN)) { E.unshift(...rueck(k.e).slice(0, -1)); N.unshift(...rueck(k.n).slice(0, -1)); H.unshift(...rueck(k.h).slice(0, -1)) }
        else continue
        vergeben.add(k); weiter = true
        break
      }
    }
    raus.push({ achse: { e: E, n: N, z: H, lo: best.lo, hi: best.hi }, bauart: b.bauart, stoff: b.stoff, name: x.name })
  }
  return raus
}
