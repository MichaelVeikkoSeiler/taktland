/**
 * Prüfung über das ganze Netz (Michael, 2026-10-16: «korrigierst du solche Unschönheiten gleich auf allen restlichen
 * Strecken auch oder muss ich tatsächlich alles abfahren»): je Abschnitt der Weg wie beim Fahren (fahrwegBauen), die Gleise
 * aus swissTLM3D (gleisHoehenLaden) und der Verlauf im Führerstand (fuehrerstandVerlauf), mit denselben Funktionen wie die
 * App, ohne Browser. Gemessen wird, was im Bild stört:
 *   neben  – Stücke, wo die Linie mehr als NEBEN_M neben jeder Gleisachse liegt (die Gleise liegen anderswo)
 *   ohne   – Stücke ohne Gleisachse bis 25 m daneben (dort gilt der Weg der Quelle, Höhe aus dem Gelände)
 *   wackler – Gegenkrümmungen enger als 800 m innert 100 m, wo die Gleisachse selbst gerade ist
 *   steil  – Höhe der Linie: mehr als STEIL über 50 m (Achterbahn)
 *   tunnel – Tunnel im Gleisnetz, die der Weg nicht kennt (mitGleisTunneln ergänzt sie fürs Bild)
 *
 *   cd app && npx vite build --ssr scripts/netzpruefung.ts --outDir ../data/raw/netzpruefung && node ../data/raw/netzpruefung/netzpruefung.js
 */
import './netzpruefung_umgebung'
import { readFileSync, writeFileSync } from 'node:fs'
import { fahrwegBauen, geometrieLesen } from '../src/fahrt'
import { geometrieLaden, streckenLaden, uebersichtLaden } from '../src/daten'
import { fuehrerstandVerlauf, gleisHoehenLaden, mitGleisTunneln, type Weg } from '../src/gleisweg'
import { gleisLaden } from '../src/gelaende'
import { lv95 } from '../src/relief'

const NEBEN_M = 6, OHNE_M = 25, STEIL = 0.1, SCHRITT = 5

interface Befund { art: string; von: number; bis: number; wert: number; lage: [number, number] }

function nachKennung<T extends { linie: number }>(eintraege: T[]) {
  const raus = new Map<string, T>(), zaehler = new Map<number, number>()
  for (const e of eintraege) {
    const i = zaehler.get(e.linie) ?? 0
    zaehler.set(e.linie, i + 1)
    raus.set(`${e.linie}:${i}`, e)
  }
  return raus
}

async function main() {
  const nur = process.argv[2] ? new Set(process.argv[2].split(',')) : null
  const netz = await streckenLaden()
  const linien = geometrieLesen(await geometrieLaden())
  const bruecken = nachKennung((await uebersichtLaden<{ linie: number; km: number | null }>('bruecken')).eintraege)
  const ergebnis: Array<{ von: string; nach: string; bahn: string; laenge: number; befunde: Befund[]; mitGleis: number; lagen: number[][]; d50: number | null; d95: number | null }> = []
  let nr = 0
  // mit NETZPRUEFUNG_RELIEFS die Linien der Modellbahn (data/relief), wie wegDerLinie in Relief.tsx sie liest, Meter ab ihrem Anfang
  type Eintrag = { a: { von: string; nach: string; bahn?: string; isb?: string }; weg0: Weg }
  const eintraege = async function* (): AsyncGenerator<Eintrag> {
    if (process.env.NETZPRUEFUNG_RELIEFS) {
      const ix = JSON.parse(readFileSync('public/data/relief/index.json', 'utf8')) as { reliefs: Array<{ name: string }> }
      for (const { name } of ix.reliefs) {
        const r = JSON.parse(readFileSync(`public/data/relief/${name}.json`, 'utf8')) as {
          weg: Array<[number, number, number]>; tunnel: Array<{ von_km?: number; bis_km?: number }>; bruecken: Array<{ von_km: number; bis_km: number }> }
        const m0 = r.weg[0][0]
        const punkte = r.weg.map(([m, e, n]) => ({ m: m - m0, e, n }))
        yield { a: { von: name, nach: name, bahn: 'Modellbahn' }, weg0: { punkte, tunnelPunkte: [], stuecke: [[0, punkte[punkte.length - 1].m]],
          bauwerke: [...r.tunnel.filter((t) => t.von_km !== undefined).map((t) => ({ von: t.von_km! * 1000 - m0, bis: t.bis_km! * 1000 - m0, art: 'tunnel' as const })),
            ...r.bruecken.map((x) => ({ von: x.von_km * 1000 - m0, bis: x.bis_km * 1000 - m0, art: 'bruecke' as const }))].sort((x, y) => x.von - y.von) } }
      }
      return
    }
    for (const a of netz.abschnitte) {
      if (nur && !nur.has(`${a.von}-${a.nach}`)) continue
      const fw = fahrwegBauen(netz, linien, [a.von, a.nach], [a], (id) => bruecken.get(id)?.km ?? undefined, () => false)
      if (fw.punkte.length < 2) continue
      const punkte = fw.punkte.map((p) => { const [e, n] = lv95(p.lat, p.lon); return { m: p.s, e, n } })
      yield { a, weg0: { punkte, tunnelPunkte: [], stuecke: [[0, punkte[punkte.length - 1].m]],
        bauwerke: fw.objekte.filter((o) => (o.art === 'tunnel' || o.art === 'bruecke') && o.sAus !== null)
          .map((o) => ({ von: o.s, bis: o.sAus!, art: o.art as 'tunnel' | 'bruecke' })).sort((x, y) => x.von - y.von) } }
    }
  }
  for await (const { a, weg0 } of eintraege()) {
    nr++
    const punkte = weg0.punkte
    const ende = punkte[punkte.length - 1].m
    const gleis = await gleisHoehenLaden(weg0)
    const weg = mitGleisTunneln(weg0, gleis)
    const { glattBei, pkGleis } = fuehrerstandVerlauf(punkte, gleis)
    const zeigen = process.env.NETZPRUEFUNG_ZEIGEN?.split(':')
    if (zeigen && zeigen[0] === `${a.von}-${a.nach}`) {
      const [m0, m1] = [Number(zeigen[1]), Number(zeigen[2])]
      console.log(JSON.stringify({ quelle: punkte.filter((p) => p.m >= m0 - 100 && p.m <= m1 + 100), gleis: pkGleis.filter((p) => p.m >= m0 && p.m <= m1),
        glatt: Array.from({ length: Math.round((m1 - m0) / 5) }, (_, i) => [m0 + i * 5, ...glattBei(m0 + i * 5)]),
        d: gleis ? Array.from(gleis.d).slice(Math.max(0, Math.round((m0 - gleis.m0) / 10)), Math.round((m1 - gleis.m0) / 10)) : null }))
    }
    // die Gleisachsen in Zellen von 50 m, wie gleisHoehenLaden sie sucht
    const grob: Array<[number, number]> = []
    for (let mm = 0; mm <= ende + 200; mm += 200) grob.push(glattBei(Math.min(ende, mm)) as [number, number])
    const stuecke = await gleisLaden(grob)
    const Z = 50, zellen = new Map<string, number[]>(), ab: number[] = []
    for (const st of stuecke) for (let j = 0; j + 1 < st.e.length; j++) {
      const k = ab.length / 4
      ab.push(st.e[j], st.n[j], st.e[j + 1], st.n[j + 1])
      for (let qe = Math.floor(Math.min(st.e[j], st.e[j + 1]) / Z); qe <= Math.floor(Math.max(st.e[j], st.e[j + 1]) / Z); qe++)
        for (let qn = Math.floor(Math.min(st.n[j], st.n[j + 1]) / Z); qn <= Math.floor(Math.max(st.n[j], st.n[j + 1]) / Z); qn++) {
          const key = `${qe}_${qn}`, l = zellen.get(key); if (l) l.push(k); else zellen.set(key, [k])
        }
    }
    /** Abstand zur nächsten Achse und deren Richtung */
    const naechste = (e: number, n: number): [number, number] => {
      let best = Infinity, richtung = NaN
      for (let qe = Math.floor((e - 60) / Z); qe <= Math.floor((e + 60) / Z); qe++)
        for (let qn = Math.floor((n - 60) / Z); qn <= Math.floor((n + 60) / Z); qn++)
          for (const k of zellen.get(`${qe}_${qn}`) ?? []) {
            const o = k * 4, ae = ab[o], an = ab[o + 1], de = ab[o + 2] - ae, dn = ab[o + 3] - an, l2 = de * de + dn * dn || 1e-9
            const t = Math.max(0, Math.min(1, ((e - ae) * de + (n - an) * dn) / l2))
            const d = Math.hypot(ae + t * de - e, an + t * dn - n)
            if (d < best) { best = d; richtung = Math.atan2(dn, de) }
          }
      return [best, richtung]
    }
    const n = Math.floor(ende / SCHRITT) + 1
    const P: Array<readonly [number, number]> = [], D: number[] = [], R: number[] = []
    for (let i = 0; i < n; i++) { const p = glattBei(i * SCHRITT); P.push(p); const [d, r] = naechste(p[0], p[1]); D.push(d); R.push(r) }
    const befunde: Befund[] = []
    const stueckweise = (art: string, trifft: (i: number) => boolean, wert: (i: number) => number, mindestM: number) => {
      let a0 = -1, w = 0
      for (let i = 0; i <= n; i++) {
        if (i < n && trifft(i)) { if (a0 < 0) { a0 = i; w = 0 } w = Math.max(w, wert(i)) }
        else if (a0 >= 0) {
          if ((i - a0) * SCHRITT >= mindestM) befunde.push({ art, von: a0 * SCHRITT, bis: (i - 1) * SCHRITT, wert: Math.round(w * 10) / 10, lage: [Math.round(P[a0][0]), Math.round(P[a0][1])] })
          a0 = -1
        }
      }
    }
    stueckweise('neben', (i) => D[i] > NEBEN_M && D[i] <= OHNE_M, (i) => D[i], 50)
    stueckweise('ohne', (i) => !(D[i] <= OHNE_M), () => 0, 200)
    // Krümmung der Linie und der Achse daneben, je über 20 m
    const kr = (h: (i: number) => number) => {
      const k = new Array<number>(n).fill(0)
      for (let i = 2; i < n - 2; i++) { const d = h(i + 2) - h(i - 2); k[i] = Math.atan2(Math.sin(d), Math.cos(d)) / (4 * SCHRITT) }
      return k
    }
    const kLinie = kr((i) => Math.atan2(P[Math.min(n - 1, i + 1)][1] - P[i][1], P[Math.min(n - 1, i + 1)][0] - P[i][0]))
    let wackler = 0
    for (let i = 0; i + 20 < n; i++) {
      const fenster = kLinie.slice(i, i + 20)
      if (Math.max(...fenster) > 1 / 800 && Math.min(...fenster) < -1 / 800) {
        // gerade Achse daneben: ihre Richtung ändert sich im Fenster kaum (gegen die Fahrtrichtung gezählt beidseitig)
        const r = R.slice(i, i + 20).filter((x) => !Number.isNaN(x))
        const r0 = r[0] ?? 0, streu = Math.max(...r.map((x) => Math.abs(Math.sin(x - r0))))
        if (r.length > 15 && streu < 0.02) {
          wackler++
          befunde.push({ art: 'wackler', von: i * SCHRITT, bis: (i + 20) * SCHRITT, wert: Math.round(Math.max(...fenster.map(Math.abs)) * 1e5) / 100, lage: [Math.round(P[i][0]), Math.round(P[i][1])] })
          i += 20
        }
      }
    }
    // Höhe der Gleise (dieselbe, die die Linie trägt): Gefälle über 50 m
    if (gleis) {
      const z = gleis.z, s = 5 // Schritte zu 10 m
      stueckweise('steil', (i) => {
        const j = Math.round((i * SCHRITT - gleis.m0) / 10)
        if (j < 0 || j + s >= z.length || Number.isNaN(z[j]) || Number.isNaN(z[j + s])) return false
        return Math.abs(z[j + s] - z[j]) / 50 > STEIL
      }, (i) => { const j = Math.round((i * SCHRITT - gleis.m0) / 10); return Math.abs(z[j + s] - z[j]) / 50 * 100 }, 20)
    }
    for (const t of weg.bauwerke.filter((x) => x.art === 'tunnel' && !weg0.bauwerke.some((y) => y.art === 'tunnel' && y.von < x.bis && y.bis > x.von))) {
      const p = glattBei(t.von)
      befunde.push({ art: 'tunnel', von: Math.round(t.von), bis: Math.round(t.bis), wert: Math.round(t.bis - t.von), lage: [Math.round(p[0]), Math.round(p[1])] })
    }
    const mitGleis = D.filter((d) => d <= OHNE_M).length / n
    const Ds = D.filter((d) => d <= OHNE_M).sort((x, y) => x - y)
    const q = (f: number) => Ds.length ? Math.round(Ds[Math.min(Ds.length - 1, Math.floor(f * Ds.length))] * 10) / 10 : null
    const lagen = P.filter((_, i) => i % 50 === 0).map(([e, n]) => [Math.round(e), Math.round(n)])
    ergebnis.push({ von: a.von, nach: a.nach, bahn: a.bahn ?? a.isb ?? '', laenge: Math.round(ende), befunde, mitGleis: Math.round(mitGleis * 1000) / 1000, lagen, d50: q(0.5), d95: q(0.95) })
    if (nr % 50 === 0) console.error(`${nr} von ${netz.abschnitte.length}`)
  }
  const ziel = process.env.NETZPRUEFUNG_ZIEL ?? '../data/raw/netzpruefung/ergebnis.json'
  writeFileSync(ziel, JSON.stringify({ geprueft: new Date().toISOString(), abschnitte: ergebnis, namen: netz.punkte }))
  console.error(`fertig: ${ergebnis.length} Abschnitte, ${ziel}`)
}

void main()
