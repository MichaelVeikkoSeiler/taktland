/**
 * Gleiswahl und Verlauf im Führerstand, ohne three.js und ohne Bildschirm: dieselben Schritte für die 3D-Szene
 * (komponenten/Relief.tsx) und die Prüfung über das ganze Netz (scripts/netzpruefung.ts; Michael, 2026-10-16: «korrigierst
 * du solche Unschönheiten gleich auf allen restlichen Strecken»).
 */
import { gleisLaden } from './gelaende'

/** Ein Weg im Relief: Punkte mit ihrer Stelle in Metern, dazu Tunnel und Brücken als Bereiche */
export interface Weg {
  punkte: Array<{ m: number; e: number; n: number }>
  bauwerke: Array<{ von: number; bis: number; art: 'tunnel' | 'bruecke' }>
  /** Punkte von Tunneln ohne bekanntes Ende */
  tunnelPunkte: number[]
  /** nur diese Stücke zeichnen (beim Fahren: was im Ausschnitt liegt) */
  stuecke: Array<[number, number]>
}

/** Höhe der Gleise entlang des Wegs aus swissTLM3D (Michael, 2026-10-15, Albula: «wie auf einer Achterbahn»; pipeline/
 *  build_gleishoehe.py): alle GLEIS_SCHRITT_M die Achse höchstens GLEIS_NEBEN_M daneben, die dem Weg folgt (höchstens 45°
 *  schräg); liegen mehrere übereinander (Kehrtunnel), die mit der Höhe, die an den Schritt davor passt. Lücken bis
 *  GLEIS_LUECKE_M gerade überbrückt, sonst NaN: dort bleibt die Höhe aus dem Gelände */
/** so steil darf ein Gleis zwischen zwei Schritten werden, ohne dass es teuer wird (in keiner Quelle; Adhäsion bis etwa 7 %, Zahnrad steiler kostet nur) */
const GLEIS_STEIL = 0.08
const GLEIS_SCHRITT_M = 10, GLEIS_NEBEN_M = 25, GLEIS_LUECKE_M = 1500, GLEIS_EINLAUF_M = 200
/** z: Höhe, d: Abstand der Achse quer zum Weg (positiv nach links, q = (-tn, te)), je GLEIS_SCHRITT_M ab m0, NaN ohne Achse;
 *  tunnel: 1, wo die Achse laut swissTLM3D in einem Tunnel liegt */
export interface GleisHoehen { m0: number; z: Float32Array; d: Float32Array; tunnel: Uint8Array }
export async function gleisHoehenLaden(weg: Weg): Promise<GleisHoehen | null> {
  const pk = weg.punkte
  if (pk.length < 2) return null
  const lage = (meter: number) => {
    let lo = 1, hi = pk.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pk[mid].m < meter) lo = mid + 1; else hi = mid }
    const a = pk[Math.max(0, lo - 1)], b = pk[lo]
    const t = Math.max(0, Math.min(1, (meter - a.m) / ((b.m - a.m) || 1)))
    return [a.e + t * (b.e - a.e), a.n + t * (b.n - a.n)] as const
  }
  const anfang = pk[0].m, ende = pk[pk.length - 1].m
  const von = weg.stuecke.length ? Math.max(anfang, Math.min(...weg.stuecke.map((x) => x[0])) - 2000) : anfang
  const bis = weg.stuecke.length ? Math.min(ende, Math.max(...weg.stuecke.map((x) => x[1])) + 2000) : ende
  const n = Math.max(2, Math.floor((bis - von) / GLEIS_SCHRITT_M) + 1)
  const grob: Array<[number, number]> = []
  for (let mm = von; mm <= bis + 200; mm += 200) grob.push(lage(Math.min(bis, mm)) as [number, number])
  const stuecke = await gleisLaden(grob)
  if (!stuecke.length) return null
  // die Abschnitte der Achsen in Zellen von 50 m
  const Z = 50, zellen = new Map<string, number[]>(), ab: number[] = [], abTunnel: boolean[] = []
  for (const st of stuecke) {
    for (let j = 0; j + 1 < st.e.length; j++) {
      const k = ab.length / 6
      ab.push(st.e[j], st.n[j], st.z[j], st.e[j + 1], st.n[j + 1], st.z[j + 1])
      abTunnel.push(st.tunnel)
      const e0 = Math.min(st.e[j], st.e[j + 1]), e1 = Math.max(st.e[j], st.e[j + 1]), n0 = Math.min(st.n[j], st.n[j + 1]), n1 = Math.max(st.n[j], st.n[j + 1])
      for (let qe = Math.floor(e0 / Z); qe <= Math.floor(e1 / Z); qe++) {
        for (let qn = Math.floor(n0 / Z); qn <= Math.floor(n1 / Z); qn++) {
          const key = `${qe}_${qn}`, l = zellen.get(key)
          if (l) l.push(k); else zellen.set(key, [k])
        }
      }
    }
  }
  const z = new Float32Array(n).fill(NaN), quer = new Float32Array(n).fill(NaN), tunnel = new Uint8Array(n)
  // je Schritt die Gleise daneben: [Abstand zum Weg, Höhe, Abstand quer, im Tunnel]
  const alle: Array<Array<[number, number, number, number]>> = []
  for (let i = 0; i < n; i++) {
    const mm = von + i * GLEIS_SCHRITT_M
    const [e, nn] = lage(mm), [ve, vn] = lage(mm - 10), [he, hn] = lage(mm + 10)
    const tl = Math.hypot(he - ve, hn - vn) || 1, te = (he - ve) / tl, tn = (hn - vn) / tl
    const kandidaten: Array<[number, number, number, number]> = []
    const gesehen = new Set<number>()
    for (let qe = Math.floor((e - GLEIS_NEBEN_M) / Z); qe <= Math.floor((e + GLEIS_NEBEN_M) / Z); qe++) {
      for (let qn = Math.floor((nn - GLEIS_NEBEN_M) / Z); qn <= Math.floor((nn + GLEIS_NEBEN_M) / Z); qn++) {
        for (const k of zellen.get(`${qe}_${qn}`) ?? []) {
          if (gesehen.has(k)) continue
          gesehen.add(k)
          const o = k * 6, ae = ab[o], an = ab[o + 1], de = ab[o + 3] - ae, dn = ab[o + 4] - an, l2 = de * de + dn * dn
          if (l2 < 1e-6) continue
          if (Math.abs((de * te + dn * tn) / Math.sqrt(l2)) < Math.SQRT1_2) continue
          const t = Math.max(0, Math.min(1, ((e - ae) * de + (nn - an) * dn) / l2))
          const d = Math.hypot(ae + t * de - e, an + t * dn - nn)
          if (d <= GLEIS_NEBEN_M) kandidaten.push([d, ab[o + 2] + t * (ab[o + 5] - ab[o + 2]), (ae + t * de - e) * -tn + (an + t * dn - nn) * te, abTunnel[k] ? 1 : 0])
        }
      }
    }
    // gleich hohe Gleise am selben Ort zählen einmal
    kandidaten.sort((x, y) => x[0] - y[0])
    alle.push(kandidaten.filter((c, j) => !kandidaten.slice(0, j).some((b) => Math.abs(b[1] - c[1]) < 0.3 && Math.abs(b[2] - c[2]) < 1)).slice(0, 12))
  }
  // die Folge von Gleisen über den ganzen Weg (Michael, 2026-10-15: bei St. Gallen «eine kleine Achterbahn»: das flache
  // Bündel neben der fallenden Hauptlinie war seitlich näher, an seinem Ende sprang die Höhe 8 m): Kosten sind der Abstand
  // zum Weg, Sprünge quer und vor allem ein Gefälle steiler als GLEIS_STEIL; über Lücken bis 300 m hinweg, sonst neu
  let ketteAb = -1
  const kette = (bis: number) => {
    if (ketteAb < 0) return
    const schritte: number[] = []
    for (let i = ketteAb; i < bis; i++) if (alle[i].length) schritte.push(i)
    if (!schritte.length) return
    const kosten: number[][] = [], vor: number[][] = []
    schritte.forEach((i, s2) => {
      const c = alle[i]
      kosten.push(c.map((x) => x[0]))
      vor.push(c.map(() => -1))
      if (!s2) return
      const iv = schritte[s2 - 1], cv = alle[iv], dm = (i - iv) * GLEIS_SCHRITT_M
      c.forEach((x, k) => {
        let best = Infinity, bk = -1
        cv.forEach((y, kv) => {
          const steil = Math.max(0, Math.abs(x[1] - y[1]) - GLEIS_STEIL * dm - 0.3)
          const w = kosten[s2 - 1][kv] + 0.3 * Math.abs(x[2] - y[2]) + 200 * steil
          if (w < best) { best = w; bk = kv }
        })
        kosten[s2][k] += best; vor[s2][k] = bk
      })
    })
    let k = kosten[kosten.length - 1].indexOf(Math.min(...kosten[kosten.length - 1]))
    for (let s2 = schritte.length - 1; s2 >= 0; s2--) {
      const x = alle[schritte[s2]][k], i = schritte[s2]
      z[i] = x[1]; quer[i] = x[2]; tunnel[i] = x[3]
      k = vor[s2][k]
    }
  }
  let zuletzt = -Infinity
  for (let i = 0; i < n; i++) {
    if (!alle[i].length) continue
    if ((i - zuletzt) * GLEIS_SCHRITT_M > 300) { kette(i); ketteAb = i }
    zuletzt = i
  }
  kette(n)
  // Lücken gerade überbrücken, dann über 30 m mitteln (die Achsen haben Ecken)
  let letzte = -1
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(z[i])) continue
    if (letzte >= 0 && i - letzte > 1 && (i - letzte) * GLEIS_SCHRITT_M <= GLEIS_LUECKE_M) {
      for (let k = letzte + 1; k < i; k++) z[k] = z[letzte] + ((k - letzte) / (i - letzte)) * (z[i] - z[letzte])
    }
    letzte = i
  }
  const glatt = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(z[i])) { glatt[i] = NaN; continue }
    let t = 0, k2 = 0
    for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) if (!Number.isNaN(z[k])) { t += z[k]; k2++ }
    glatt[i] = t / k2
  }
  // der Abstand quer: über 50 m gemittelt, Lücken nicht überbrückt (dort gilt der Weg der Quelle)
  const d = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(quer[i])) { d[i] = NaN; continue }
    let t = 0, k2 = 0
    for (let k = Math.max(0, i - 5); k <= Math.min(n - 1, i + 5); k++) if (!Number.isNaN(quer[k])) { t += quer[k]; k2++ }
    d[i] = t / k2
  }
  return { m0: von, z: glatt, d, tunnel }
}
/** Tunnel laut swissTLM3D, die der Weg nicht kennt (Michael, 2026-10-15: vor Spiez fuhr der Zug durch den Hondrichtunnel und sah
 *  die Erde von unten): jedes Stück ab GLEIS_TUNNEL_KUERZESTE_M, wo die gewählte Achse in einem Tunnel liegt und kein Tunnel
 *  des Wegs, als Tunnel des Wegs dazu; nur fürs Bild (Röhre, Licht), gemeldet wird er nicht */
const GLEIS_TUNNEL_KUERZESTE_M = 50
export function mitGleisTunneln(weg: Weg, g: GleisHoehen | null): Weg {
  if (!g) return weg
  const dazu: Weg['bauwerke'] = []
  let ab = -1
  for (let i = 0; i <= g.tunnel.length; i++) {
    const drin = i < g.tunnel.length && g.tunnel[i] === 1
    if (drin && ab < 0) ab = i
    if (!drin && ab >= 0) {
      const von = g.m0 + ab * GLEIS_SCHRITT_M, bis = g.m0 + (i - 1) * GLEIS_SCHRITT_M
      if (bis - von >= GLEIS_TUNNEL_KUERZESTE_M && !weg.bauwerke.some((x) => x.art === 'tunnel' && x.von < bis && x.bis > von)) {
        dazu.push({ von, bis, art: 'tunnel' })
      }
      ab = -1
    }
  }
  if (!dazu.length) return weg
  return { ...weg, bauwerke: [...weg.bauwerke.filter((x) => !dazu.some((t) => x.art === 'bruecke' && x.von < t.bis && x.bis > t.von)), ...dazu].sort((a, b) => a.von - b.von) }
}
/** Höhe aus gleisHoehenLaden an der Stelle meter, oder null */
export function gleisBei(g: GleisHoehen | null, meter: number): number | null {
  if (!g) return null
  const x = (meter - g.m0) / GLEIS_SCHRITT_M
  if (x < 0 || x > g.z.length - 1) return null
  const i = Math.min(g.z.length - 2, Math.floor(x)), t = x - i, a = g.z[i], b = g.z[i + 1]
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return a + t * (b - a)
}

/** Führerstand: alle so viele Meter ein geglätteter Punkt, eine Kurve rückt höchstens so weit nach innen (glatt) */
const GLATT_SCHRITT_M = 5, GLATT_FEHLER_M = 0.5

/** Der Verlauf im Führerstand: seitlich auf das Gleis aus swissTLM3D gerückt und geglättet; glattBei gibt Ost und Nord an
 *  einer Stelle des Wegs (Meter) */
export function fuehrerstandVerlauf(pk: Weg['punkte'], gleis: GleisHoehen | null) {
  const punktBei = (meter: number) => {
    let lo = 1, hi = pk.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pk[mid].m < meter) lo = mid + 1; else hi = mid }
    const a = pk[Math.max(0, lo - 1)], b = pk[lo]
    const t = Math.max(0, Math.min(1, (meter - a.m) / ((b.m - a.m) || 1)))
    return [a.e + t * (b.e - a.e), a.n + t * (b.n - a.n)] as const
  }
  /** Lage im Führerstand: der Verlauf ist ein Zug aus Geraden mit Ecken alle 100 bis 350 m. Früher über 80 m davor
   *  und danach gemittelt (Michael, 2026-10-11: «die Kurven noch runder»), das zog die Linie in jeder Kurve um 5 bis 10 m
   *  nach innen (Michael, 2026-10-14: «dass die Strecke die Kurven zu stark schneidet»); dann eine Kurve durch jeden Punkt
   *  (Catmull-Rom), vereinfacht nach Douglas-Peucker (Michael, 2026-10-15: «schön gerade»), das gab Ecken; jetzt geglättet
   *  nach dem Radius (glatt) */
  // seitlich auf das Gleis aus swissTLM3D (Michael, 2026-10-15, BTI: «die Linie ist manchmal weit neben der Realität»; das
  // Schienennetz des BAV und die Kilometrierung liegen dort bis über 10 m daneben): alle 10 m um den Abstand der Achse
  // (gleisHoehenLaden) verschoben, an den Rändern einer Lücke über GLEIS_EINLAUF_M auslaufend; dann geglättet wie unten
  const pkGleis = (() => {
    if (!gleis) return pk
    const { m0: g0, d } = gleis, gEnde = g0 + (d.length - 1) * GLEIS_SCHRITT_M
    const ab = (mm: number) => {
      const i = Math.round((mm - g0) / GLEIS_SCHRITT_M)
      return i >= 0 && i < d.length && !Number.isNaN(d[i]) ? d[i] : null
    }
    // je Stelle der Abstand, gegen Lücken hin auf 0 auslaufend
    const versatz = (mm: number) => {
      const hier = ab(mm)
      if (hier === null) return 0
      let rand = GLEIS_EINLAUF_M
      for (let k = GLEIS_SCHRITT_M; k < GLEIS_EINLAUF_M; k += GLEIS_SCHRITT_M) {
        if (ab(mm - k) === null || ab(mm + k) === null) { rand = k; break }
      }
      return hier * Math.min(1, rand / GLEIS_EINLAUF_M)
    }
    const raus: Array<{ m: number; e: number; n: number }> = []
    for (const p of pk) {
      if (p.m >= g0 && p.m <= gEnde) continue
      raus.push(p)
    }
    for (let mm = Math.max(g0, pk[0].m); mm <= Math.min(gEnde, pk[pk.length - 1].m); mm += GLEIS_SCHRITT_M) {
      const [e, n] = punktBei(mm), [ve, vn] = punktBei(mm - 10), [he, hn] = punktBei(mm + 10)
      const l = Math.hypot(he - ve, hn - vn) || 1, v = versatz(mm)
      raus.push({ m: mm, e: e - ((hn - vn) / l) * v, n: n + ((he - ve) / l) * v })
    }
    return raus.sort((a, b) => a.m - b.m)
  })()
  // geglättet mit einer Glockenkurve, so breit, wie die Kurve es erlaubt (Michael, 2026-10-16, Bern–Zürich: «Kurvenelemente
  // drin, die es sicher nicht braucht … nicht schön rund, sondern eckig»): die Punkte der Quelle und die Achsen von swissTLM3D
  // haben Ecken und streuen um einen Meter; vereinfacht und durch jeden Punkt gelegt (Douglas-Peucker, Catmull-Rom) gab das
  // zwischen Bern und Zollikofen 71 Stellen mit Radien unter 150 m. Jetzt alle GLATT_SCHRITT_M ein Punkt, gemittelt über
  // so viel, dass eine Kurve höchstens GLATT_FEHLER_M nach innen rückt (Breite σ = √(2·R·Fehler), 6 bis 35 m; R aus dem
  // Verlauf über 40 m, die engste Stelle in 60 m Umgebung)
  const glatt = (() => {
    const p = pkGleis, m0 = p[0].m, m1 = p[p.length - 1].m
    const n = Math.max(2, Math.floor((m1 - m0) / GLATT_SCHRITT_M) + 1)
    const E = new Float64Array(n), N = new Float64Array(n)
    let j = 0
    for (let i = 0; i < n; i++) {
      const mm = Math.min(m1, m0 + i * GLATT_SCHRITT_M)
      while (j < p.length - 2 && p[j + 1].m < mm) j++
      const a = p[j], b = p[j + 1] ?? a, t = Math.max(0, Math.min(1, (mm - a.m) / ((b.m - a.m) || 1)))
      E[i] = a.e + t * (b.e - a.e); N[i] = a.n + t * (b.n - a.n)
    }
    const mitteln = (sigma: (i: number) => number) => {
      const e2 = new Float64Array(n), n2 = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        const s = sigma(i), r = Math.ceil((3 * s) / GLATT_SCHRITT_M)
        let se = 0, sn = 0, sg = 0
        // an den Enden am Endpunkt gespiegelt: abgeschnitten zog das Mittel den Anfang bis 25 m nach innen
        for (let k = i - r; k <= i + r; k++) {
          const x = (k - i) * GLATT_SCHRITT_M, g = Math.exp((-x * x) / (2 * s * s))
          const j = k < 0 ? Math.min(n - 1, -k) : k > n - 1 ? Math.max(0, 2 * (n - 1) - k) : k
          const ek = k < 0 ? 2 * E[0] - E[j] : k > n - 1 ? 2 * E[n - 1] - E[j] : E[k]
          const nk = k < 0 ? 2 * N[0] - N[j] : k > n - 1 ? 2 * N[n - 1] - N[j] : N[k]
          se += g * ek; sn += g * nk; sg += g
        }
        e2[i] = se / sg; n2[i] = sn / sg
      }
      return [e2, n2] as const
    }
    const [ge, gn] = mitteln(() => 40)
    const krumm = new Float64Array(n)
    for (let i = 1; i < n - 1; i++) {
      const h1 = Math.atan2(gn[i] - gn[i - 1], ge[i] - ge[i - 1]), h2 = Math.atan2(gn[i + 1] - gn[i], ge[i + 1] - ge[i])
      krumm[i] = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) / GLATT_SCHRITT_M
    }
    const um = Math.round(60 / GLATT_SCHRITT_M), sig = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      let k = 1e-5
      for (let q = Math.max(0, i - um); q <= Math.min(n - 1, i + um); q++) k = Math.max(k, krumm[q])
      sig[i] = Math.max(6, Math.min(35, Math.sqrt((2 * GLATT_FEHLER_M) / k)))
    }
    const [fe, fn] = mitteln((i) => sig[i])
    return { m0, e: fe, n: fn }
  })()
  /** Lage im Führerstand: zwischen den geglätteten Punkten eine Kurve (Catmull-Rom, gleichmässig) */
  const glattBei = (meter: number): readonly [number, number] => {
    const { m0, e, n } = glatt, z = e.length
    const x = Math.max(0, Math.min(z - 1, (meter - m0) / GLATT_SCHRITT_M))
    const i = Math.min(z - 2, Math.floor(x)), t = x - i
    const w = (a: Float64Array) => {
      const p0 = a[Math.max(0, i - 1)], p1 = a[i], p2 = a[i + 1], p3 = a[Math.min(z - 1, i + 2)]
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)
    }
    return [w(e), w(n)]
  }
  return { pkGleis, glatt, glattBei }
}
