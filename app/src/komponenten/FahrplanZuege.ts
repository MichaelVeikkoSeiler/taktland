/**
 * Züge laut Fahrplan im Führerstand (Michael, 2026-10-30: «die beiden evtl zu koppeln … wenn hier was vorhanden ist kann das andere vielleicht
 * profitieren», dann «mit den Brücken anfangen und dann den Rest auch noch»): dieselben Fahrten wie in «3D Schweiz» (src/zuege3d.ts), im feinen
 * Gelände um den eigenen Zug, in echter Grösse. Wo ein Zug ist, sagt der Fahrplan (zugStelle, eine Annahme zwischen den Halten); welches Gleis,
 * steht in keiner unserer Quellen: gewählt die nächste Gleisachse aus swissTLM3D links des Wegs (in der Schweiz fahren die Züge links), bis
 * GLEIS_SUCHE_M daneben, auf ihrer Höhe; im Tunnel nicht zu sehen. Die Form wie in der Modellbahn (ZugForm.ts), auf etwa 3 m Breite, 4 m Höhe und
 * Wagen von WAGEN_M gebracht (gewählt). Der eigene Zug fährt nach der Probefahrt, nicht nach dem Fahrplan: ein Zug laut Fahrplan kann ihn kreuzen.
 */
import * as THREE from 'three'
import { gleisLaden } from '../gelaende'
import { lageBei, wegEnde } from '../fahrt'
import { lv95 } from '../relief'
import { jetztImFahrplan, zuegeLaden, zugTest, zugIndexLaden, type ZugFahrt, type ZugIndex, type ZugNetz, zugNetzLaden, type ZugWeg, zugStelle } from '../zuege3d'
import { ZUG_BREITE, ZUG_HOEHE, ZUG_LOK_M, ZUG_WAGEN, ZUG_WAGEN_M, zugFormen } from './ZugForm'

/** Masse in echter Grösse, gewählt (kein bestimmter Zug): Breite, Höhe, Länge eines Wagens und die Lücke dazwischen in m */
const BREITE_M = 3, HOEHE_M = 4, WAGEN_M = 26, LUECKE_M = 1
/** so weit links des Wegs wird das Gleis gesucht, so weit darf es daneben liegen, so schräg zum Weg (gewählt) */
const LINKS_M = 2.25, GLEIS_SUCHE_M = 10, GLEIS_WINKEL = Math.cos((25 * Math.PI) / 180)
/** höchstens so viele Züge, neu gerechnet so oft je Sekunde (gewählt) */
const ZUEGE_HOECHSTENS = 40, JE_SEKUNDE = 10
const ZELLE = 50

type Achse = [number, number, number, number, number, number, boolean]

export interface FahrplanZuege {
  /** die Fahrten und Gleise im Rechteck (LV95) laden */
  setzen: (e0: number, n0: number, e1: number, n1: number) => void
  /** die Züge an ihre Stelle von jetzt setzen; sichtbar: nur im Führerstand */
  schritt: (sichtbar: boolean) => void
  weg: () => void
}

export function fahrplanZuegeBauen(szene: THREE.Scene, X: (e: number) => number, Y: (z: number) => number, Z: (n: number) => number): FahrplanZuege {
  // nur in einer Testfassung: die Zeit verschieben und zählen
  if (import.meta.env.VITE_S3D_TEST) (window as unknown as { fzTest: unknown }).fzTest = { zeit: zugTest, zahl: () => netze.map((m) => m.count), orte: () => testOrte, gross: 1, netz: () => netze.map((m) => ({ sichtbar: m.visible, eltern: m.parent?.type, welt: m.parent?.parent?.type, zahl: m.count, mat: Array.from(m.instanceMatrix.array.slice(0, 16)).map((x) => Math.round(x * 1000) / 1000) })) }
  const formen = zugFormen()
  const stoff = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  const netze = [formen.lok, formen.wagen, formen.steuer].map((g) => {
    const m = new THREE.InstancedMesh(g, stoff, ZUEGE_HOECHSTENS * (g === formen.wagen ? ZUG_WAGEN - 1 : 1))
    m.count = 0; m.frustumCulled = false; m.castShadow = true; m.visible = false
    szene.add(m)
    return m
  })
  let ix: ZugIndex | null = null, netz: ZugNetz | null = null, fahrten: ZugFahrt[] = [], zellen = new Map<string, Achse[]>()
  let rahmen: [number, number, number, number] | null = null, auftrag = 0, zuletzt = 0, aus = false

  const setzen = (e0: number, n0: number, e1: number, n1: number) => {
    const a = ++auftrag
    rahmen = [e0, n0, e1, n1]
    void (async () => {
      ix ??= await zugIndexLaden()
      if (!ix || aus || a !== auftrag) return
      const punkte: Array<[number, number]> = []
      for (let e = e0; e <= e1; e += 1000) for (let n = n0; n <= n1; n += 1000) punkte.push([e, n])
      const [liste, zn, gleise] = await Promise.all([zuegeLaden(ix, e0, n0, e1, n1).catch(() => []), zugNetzLaden().catch(() => null),
        gleisLaden(punkte).catch(() => [])])
      if (aus || a !== auftrag) return
      const z = new Map<string, Achse[]>()
      for (const g of gleise) {
        for (let i = 0; i + 1 < g.e.length; i++) {
          const s: Achse = [g.e[i], g.n[i], g.z[i], g.e[i + 1], g.n[i + 1], g.z[i + 1], g.tunnel]
          if (Math.max(s[0], s[3]) < e0 - 100 || Math.min(s[0], s[3]) > e1 + 100 || Math.max(s[1], s[4]) < n0 - 100 || Math.min(s[1], s[4]) > n1 + 100) continue
          for (let qe = Math.floor(Math.min(s[0], s[3]) / ZELLE); qe <= Math.floor(Math.max(s[0], s[3]) / ZELLE); qe++)
            for (let qn = Math.floor(Math.min(s[1], s[4]) / ZELLE); qn <= Math.floor(Math.max(s[1], s[4]) / ZELLE); qn++) {
              const k = `${qe}_${qn}`, l = z.get(k)
              if (l) l.push(s); else z.set(k, [s])
            }
        }
      }
      fahrten = liste; netz = zn; zellen = z
    })()
  }

  /** die nächste Gleisachse zur Stelle e, n quer zur Richtung de, dn: Lage und Höhe, null ohne; im Tunnel tunnel = true */
  const gleis = (e: number, n: number, de: number, dn: number): { e: number; n: number; z: number; tunnel: boolean } | null => {
    let best = GLEIS_SUCHE_M * GLEIS_SUCHE_M, raus: { e: number; n: number; z: number; tunnel: boolean } | null = null
    const ce = Math.floor(e / ZELLE), cn = Math.floor(n / ZELLE)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const a of zellen.get(`${ce + i}_${cn + j}`) ?? []) {
      const se = a[3] - a[0], sn = a[4] - a[1], l2 = se * se + sn * sn
      if (!l2 || Math.abs(se * de + sn * dn) < GLEIS_WINKEL * Math.sqrt(l2)) continue
      const qe = -dn, qn = de, nenner = se * qn - sn * qe
      const t = ((e - a[0]) * qn - (n - a[1]) * qe) / nenner
      if (t < 0 || t > 1) continue
      const pe = a[0] + t * se, pn = a[1] + t * sn, d = (pe - e) ** 2 + (pn - n) ** 2
      if (d < best) { best = d; raus = { e: pe, n: pn, z: a[2] + t * (a[5] - a[2]), tunnel: a[6] } }
    }
    return raus
  }

  const testOrte: Array<[string, number, number, number]> = []
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sk = new THREE.Vector3(), eul = new THREE.Euler(0, 0, 0, 'YXZ')
  const sx = BREITE_M / (ZUG_BREITE * 1000), sy = HOEHE_M / (ZUG_HOEHE * 1000)
  const schritt = (sichtbar: boolean) => {
    for (const m of netze) m.visible = sichtbar
    if (!sichtbar || !ix || !netz || !rahmen) return
    const jetzt = performance.now()
    if (jetzt - zuletzt < 1000 / JE_SEKUNDE) return
    zuletzt = jetzt
    const { tag, minuten } = jetztImFahrplan(ix)
    const [e0, n0, e1, n1] = rahmen
    const zahl = [0, 0, 0]
    const laengen = Array.from({ length: ZUG_WAGEN + 1 }, () => WAGEN_M)
    const ganz = laengen.reduce((a, b) => a + b, 0) + ZUG_WAGEN * LUECKE_M
    let zuege = 0
    for (const f of fahrten) {
      if (zuege >= ZUEGE_HOECHSTENS) break
      const st = zugStelle(f, tag, minuten)
      if (!st) continue
      const h = f.halte
      // der Weg, auf dem die Spitze steht, und die Stelle darauf; am Halt das Ende des Wegs dorthin (am ersten Halt der Anfang des Wegs danach)
      let w: ZugWeg | null = null, s = 0
      if (st.art === 'fahrt') { w = netz.weg(h[st.i].abk, h[st.i + 1].abk); if (w) s = st.anteil * wegEnde(w) }
      else if (st.i > 0) { w = netz.weg(h[st.i - 1].abk, h[st.i].abk); if (w) s = wegEnde(w) }
      else if (h.length > 1) { w = netz.weg(h[0].abk, h[1].abk); if (w) s = Math.min(wegEnde(w), ganz) }
      if (!w) continue
      // grob: liegt die Spitze im Rechteck?
      const [ke, kn] = lv95(lageBei(w, s).lat, lageBei(w, s).lon)
      if (ke < e0 - ganz || ke > e1 + ganz || kn < n0 - ganz || kn > n1 + ganz) continue
      const punkt = (ss: number) => { const l = lageBei(w!, Math.max(0, ss)); return lv95(l.lat, l.lon) }
      let ab = 0, ok = true
      const wagen: Array<{ art: number; a: { e: number; n: number; z: number }; b: { e: number; n: number; z: number } }> = []
      for (let k = 0; k <= ZUG_WAGEN && ok; k++) {
        const vorne = s - ab, hinten = vorne - laengen[k]
        ab += laengen[k] + LUECKE_M
        const [ve, vn] = punkt(vorne), [he, hn] = punkt(hinten)
        const l = Math.hypot(ve - he, vn - hn) || 1, de = (ve - he) / l, dn = (vn - hn) / l
        const links = (pe: number, pn: number) => gleis(pe - dn * LINKS_M, pn + de * LINKS_M, de, dn)
        const a = links(ve, vn), b = links(he, hn)
        if (!a || !b || a.tunnel || b.tunnel) { ok = false; break }
        wagen.push({ art: k === 0 ? 0 : k === ZUG_WAGEN ? 2 : 1, a, b })
      }
      if (!ok) continue
      zuege++
      if (import.meta.env.VITE_S3D_TEST) { if (zuege === 1) testOrte.length = 0; testOrte.push([f.nummer, Math.round(wagen[0].a.e), Math.round(wagen[0].a.n), Math.round(wagen[0].a.z)]) }
      for (const { art, a, b } of wagen) {
        const m = netze[art]
        const me = (a.e + b.e) / 2, mn = (a.n + b.n) / 2, mz = (a.z + b.z) / 2
        const dx = X(a.e) - X(b.e), dz = Z(a.n) - Z(b.n), dy = Y(a.z) - Y(b.z), lh = Math.hypot(dx, dz) || 1e-9
        eul.set(-Math.atan2(dy, lh), Math.atan2(dx, dz), 0)
        q.setFromEuler(eul)
        v.set(X(me), Y(mz) + (HOEHE_M / 2) / 1000, Z(mn))
        const L = art === 0 ? ZUG_LOK_M : ZUG_WAGEN_M
        sk.set(sx, sy, WAGEN_M / L)
        if (import.meta.env.VITE_S3D_TEST) sk.multiplyScalar((window as unknown as { fzTest: { gross: number } }).fzTest.gross)
        m.setMatrixAt(zahl[art]++, m4.compose(v, q, sk))
      }
    }
    netze.forEach((m, i) => { m.count = zahl[i]; m.instanceMatrix.needsUpdate = true })
  }

  const weg = () => {
    aus = true
    for (const m of netze) { m.removeFromParent(); m.dispose() }
    formen.lok.dispose(); formen.wagen.dispose(); formen.steuer.dispose(); stoff.dispose()
  }
  return { setzen, schritt, weg }
}
