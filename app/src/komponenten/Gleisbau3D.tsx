/**
 * Gleisbau in 3D (Michael, 2026-11-22: «2D bauen, 3D anschauen», nach seinem Bild eines Bretts mit Bergen, Wald, Dorf und See: «Wäre das nicht
 * schöner?», dann «Ja gerne, so anfangen»): dasselbe Brett als Modell, jede Kachel ein Block auf dem dunklen Tablett, Wasser tiefer, Berge als
 * Erhebung mit Schnee, durch die der Tunnel führt, Wald mit Laub- und Nadelbäumen, Dörfer mit Häusern, Gleise mit Schotter, Schwellen und
 * Schienen, Brücken über Wasser, Bahnhöfe mit Perron und Dach; der Zug in der Form der Virtuellen Schweiz (ZugForm.ts). Drehen und Zoomen mit
 * den Fingern oder der Maus. Ein Baukasten, keine Wirklichkeit: alle Formen, Masse und Farben gewählt.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  type Brett, type Feld, grosseKurve, grossGeometrie, istWeiche, spalten, type Stueck, WAGEN_LAENGE, wege, wegPunkte,
  zeilen, type Zug,
} from '../gleisbau'
import { wagenBauen, ZUG_HOEHE, ZUG_WAGEN, ZUG_WAGEN_M } from './ZugForm'

/** Farben wie im 2D-Brett (Gleisbau.tsx), gewählt */
const F = {
  tablett: '#3a3a3c', wiese: '#c4e19f', wald: '#aed38c', wasser: '#4d93d6', wasserGrund: '#336fb0',
  fels: '#9a9ea3', felsDunkel: '#7c8086', deckel: '#aeb6a2', schnee: '#ffffff',
  laub: ['#6cb54f', '#7cc35a', '#5aa443'], nadel: '#2f7d3c', stamm: '#7a5a3c',
  schotter: '#b9b1a5', schwelle: '#7d7266', schiene: '#55585c', perron: '#d2d2d2', kante: '#ffffff', dach: '#5f6062',
  bruecke: '#cfcfcf', pfeiler: '#b5b5b5', portal: '#26262a', wand: '#f4f1ea', ziegel: ['#d4583e', '#c94a32', '#b8452f'], karmin: '#a8102e',
}

/** Höhen in Feldern: Oberkante einer Kachel, des Wassers, des Schotters und der Schienen (gewählt) */
const OBEN = 0.12, WASSER = 0.055, SCHOTTER = 0.02, SCHWELLE = 0.035, SCHIENE = 0.052
/** Spurweite und Breite des Schotters, wie im 2D-Brett */
const SPUR = 0.065, SCHOTTER_B = 0.15
/** wie weit das Portal vom Rand des Felds liegt, wie im 2D-Brett, und wie hoch der Fels über dem Gleis ist */
const PORTAL = 0.22, FELS_HOCH = 0.22
/** der Zug: so gross, dass ein Wagen WAGEN_LAENGE Felder lang ist */
const ZUG_MASS = WAGEN_LAENGE / (ZUG_WAGEN_M / 1000)
/** quer und in der Höhe dicker als massstäblich, wie ein Spielzeugzug auf dem Brett (gewählt) */
const ZUG_DICK = 1.8

function zufall(i: number, j: number, k: number) {
  const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}

type P = { x: number; y: number; w: number }

/** alle Wege eines Felds als Punktfolgen, bei einer grossen Kurve im Feld ihres Anfangs der ganze Bogen */
function feldWege(f: Feld, i: number, j: number): Array<{ p: P[]; s?: Stueck; aktiv: boolean }> {
  const g = f.gleis
  if (!g) return []
  if (grosseKurve(g)) {
    const G = grossGeometrie(i, j, g)
    const n = 24 * G.n
    return [{ p: Array.from({ length: n + 1 }, (_, k) => {
      const a = G.a0 + (G.da * k) / n
      return { x: G.cx + G.r * Math.cos(a), y: G.cy + G.r * Math.sin(a), w: a + Math.PI / 2 }
    }), aktiv: true }]
  }
  return wege(g).map(([a, b], k) => {
    const s: Stueck = { i, j, ein: a, aus: b }
    const bogen = a >= 0 && b >= 0 && (a + 2) % 4 !== b
    // gerade Stücke ebenfalls in kurzen Schritten, damit Brücke und Schotter sich am Rand des Felds teilen lassen
    return { p: wegPunkte(s, bogen ? 16 : 8), s, aktiv: !istWeiche(g) || k === (g.stellung ?? 0) }
  })
}

/** quer zur Richtung w, d nach rechts (wie «versetzt» im 2D-Brett) */
const quer = (q: P, d: number): [number, number] => [q.x - Math.sin(q.w) * d, q.y + Math.cos(q.w) * d]

/**
 * Ein Band entlang der Punkte, von d0 bis d1 quer, von y0 bis y1 hoch, als Fläche oben und zwei Seiten. Die Ecken in Weltkoordinaten: x wie auf
 * dem Brett, y die Höhe, z die Zeile
 */
function band(p: P[], d0: number, d1: number, y0: number, y1: number): THREE.BufferGeometry {
  const pos: number[] = []
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3()
  const drei = (A: number[], B: number[], C: number[], soll: [number, number, number]) => {
    a.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]); b.set(C[0] - A[0], C[1] - A[1], C[2] - A[2]); n.crossVectors(a, b)
    if (n.x * soll[0] + n.y * soll[1] + n.z * soll[2] < 0) pos.push(...A, ...C, ...B)
    else pos.push(...A, ...B, ...C)
  }
  for (let k = 0; k + 1 < p.length; k++) {
    const q0 = p[k], q1 = p[k + 1]
    const [l0x, l0z] = quer(q0, d0), [r0x, r0z] = quer(q0, d1), [l1x, l1z] = quer(q1, d0), [r1x, r1z] = quer(q1, d1)
    // oben
    drei([l0x, y1, l0z], [r0x, y1, r0z], [r1x, y1, r1z], [0, 1, 0])
    drei([l0x, y1, l0z], [r1x, y1, r1z], [l1x, y1, l1z], [0, 1, 0])
    // die Seiten, nach aussen
    const so: [number, number, number] = [-Math.sin(q0.w), 0, Math.cos(q0.w)]
    const si: [number, number, number] = [Math.sin(q0.w), 0, -Math.cos(q0.w)]
    drei([r0x, y0, r0z], [r1x, y0, r1z], [r1x, y1, r1z], so); drei([r0x, y0, r0z], [r1x, y1, r1z], [r0x, y1, r0z], so)
    drei([l0x, y0, l0z], [l1x, y0, l1z], [l1x, y1, l1z], si); drei([l0x, y0, l0z], [l1x, y1, l1z], [l0x, y1, l0z], si)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** die Teile einer Punktfolge über Wasser und über Land, je nach dem Feld unter der Mitte jedes Schritts */
function teilen(b: Brett, p: P[]): Array<{ p: P[]; wasser: boolean }> {
  const raus: Array<{ p: P[]; wasser: boolean }> = []
  for (let k = 0; k + 1 < p.length; k++) {
    const mx = (p[k].x + p[k + 1].x) / 2, my = (p[k].y + p[k + 1].y) / 2
    const wasser = b[Math.floor(my)]?.[Math.floor(mx)]?.grund === 'wasser'
    const letzt = raus[raus.length - 1]
    if (letzt && letzt.wasser === wasser) letzt.p.push(p[k + 1])
    else raus.push({ p: [p[k], p[k + 1]], wasser })
  }
  return raus
}

/** wo ein Weg die Kanten eines Felds kreuzt: Kante, Punkt und Richtung ins Feld hinein */
function durchgaenge(b: Brett): Map<string, Array<{ kante: number; q: P }>> {
  const m = new Map<string, Array<{ kante: number; q: P }>>()
  const dazu = (i: number, j: number, kante: number, q: P) => {
    const key = `${i},${j}`
    if (!m.has(key)) m.set(key, [])
    if (!m.get(key)!.some((x) => x.kante === kante)) m.get(key)!.push({ kante, q })
  }
  for (let j = 0; j < zeilen(b); j++) for (let i = 0; i < spalten(b); i++) {
    for (const { p } of feldWege(b[j][i], i, j)) {
      for (let k = 0; k + 1 < p.length; k++) {
        const a = p[k], c = p[k + 1]
        const ia = Math.floor(a.x), ja = Math.floor(a.y), ic = Math.floor(c.x), jc = Math.floor(c.y)
        if (ia === ic && ja === jc) continue
        // von a nach c ins Feld c hinein und aus dem Feld a hinaus
        const kc = jc < ja ? 2 : ic > ia ? 3 : jc > ja ? 0 : 1, ka = (kc + 2) % 4
        dazu(ic, jc, kc, c); dazu(ia, ja, ka, { ...a, w: a.w + Math.PI })
      }
      // Enden genau auf einer Kante (kleine Stücke beginnen und enden dort)
      for (const [q, rein] of [[p[0], true], [p[p.length - 1], false]] as Array<[P, boolean]>) {
        const fx = q.x - i, fy = q.y - j
        const kante = Math.abs(fy) < 1e-6 ? 0 : Math.abs(fx - 1) < 1e-6 ? 1 : Math.abs(fy - 1) < 1e-6 ? 2 : Math.abs(fx) < 1e-6 ? 3 : -1
        if (kante >= 0 && !grosseKurve(b[j][i].gleis)) dazu(i, j, kante, rein ? q : { ...q, w: q.w + Math.PI })
      }
    }
  }
  return m
}

/** Material je Farbe, damit gleiche Farben dasselbe Material teilen */
function stoffe() {
  const m = new Map<string, THREE.MeshLambertMaterial>()
  return (farbe: string, flach = false) => {
    const key = farbe + (flach ? 'f' : '')
    if (!m.has(key)) m.set(key, new THREE.MeshLambertMaterial({ color: farbe, flatShading: flach }))
    return m.get(key)!
  }
}

/** das ganze Brett ohne Zug als eine Gruppe; Geometrien je Farbe zusammengelegt */
function brettBauen(b: Brett, namen: Map<string, string>): THREE.Group {
  const SP = spalten(b), ZE = zeilen(b)
  const gruppe = new THREE.Group()
  const stoff = stoffe()
  const teile = new Map<string, THREE.BufferGeometry[]>()
  const dazu = (farbe: string, g: THREE.BufferGeometry, flach = false) => {
    const key = farbe + (flach ? '|f' : '')
    if (!teile.has(key)) teile.set(key, [])
    let geo = g.index ? g.toNonIndexed() : g
    for (const n of Object.keys(geo.attributes)) if (n !== 'position' && n !== 'normal') geo.deleteAttribute(n)
    if (flach) { geo.deleteAttribute('normal'); geo.computeVertexNormals() }
    teile.get(key)!.push(geo)
    if (geo !== g) g.dispose()
  }
  const kiste = (farbe: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, dreh = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz)
    if (dreh) g.rotateY(dreh)
    g.translate(x, y, z)
    dazu(farbe, g)
  }

  // das Tablett
  const tablett = new RoundedBoxGeometry(SP + 0.3, 0.12, ZE + 0.3, 2, 0.06)
  tablett.translate(SP / 2, -0.06, ZE / 2)
  dazu(F.tablett, tablett)

  const gleisFelder = new Set<string>()
  for (let j = 0; j < ZE; j++) for (let i = 0; i < SP; i++) {
    const f = b[j][i]
    if (f.gleis || f.teil) gleisFelder.add(`${i},${j}`)
  }
  const wegeAlle: Array<{ p: P[]; aktiv: boolean; f: Feld; i: number; j: number }> = []
  for (let j = 0; j < ZE; j++) for (let i = 0; i < SP; i++) for (const w of feldWege(b[j][i], i, j)) wegeAlle.push({ ...w, f: b[j][i], i, j })
  /** ob ein Punkt nahe an einem Gleis liegt (dort keine Bäume und Häuser) */
  const amGleis = (x: number, y: number, d: number) => wegeAlle.some(({ p }) => p.some((q) => Math.hypot(q.x - x, q.y - y) < d))
  const kreuz = durchgaenge(b)

  // die Kacheln
  for (let j = 0; j < ZE; j++) for (let i = 0; i < SP; i++) {
    const f = b[j][i], cx = i + 0.5, cz = j + 0.5
    if (f.grund === 'wasser') {
      const g = new RoundedBoxGeometry(0.95, WASSER, 0.95, 2, 0.03)
      g.translate(cx, WASSER / 2, cz)
      dazu(F.wasser, g)
      continue
    }
    const farbe = f.grund === 'wald' ? F.wald : F.wiese
    const g = new RoundedBoxGeometry(0.95, OBEN, 0.95, 2, 0.035)
    g.translate(cx, OBEN / 2, cz)
    dazu(f.grund === 'berg' ? F.deckel : farbe, g)

    if (f.grund === 'wald') {
      const baeume: Array<[number, number, number]> = []
      for (let k = 0; k < 7; k++) {
        const x = i + 0.14 + zufall(i, j, k) * 0.72, y = j + 0.14 + zufall(i, j, k + 20) * 0.72
        if (gleisFelder.has(`${i},${j}`) && amGleis(x, y, 0.22)) continue
        baeume.push([x, y, 0.75 + zufall(i, j, k + 40) * 0.5])
      }
      for (const [x, y, s] of baeume) baum(dazu, x, y, s, zufall(Math.round(x * 7), Math.round(y * 7), 3) < 0.35, Math.floor(zufall(i, j, x) * 3))
    }
    if (f.grund === 'dorf') {
      for (let k = 0; k < 3; k++) {
        const x = i + 0.2 + k * 0.27 + zufall(i, j, k) * 0.05, y = j + 0.22 + zufall(i, j, k + 5) * 0.5
        if (gleisFelder.has(`${i},${j}`) && amGleis(x, y, 0.26)) continue
        haus(dazu, kiste, x, y, zufall(i, j, k + 11) < 0.5 ? 0 : Math.PI / 2, Math.floor(zufall(i, j, k + 11) * 3))
      }
    }
    if (f.grund === 'berg') {
      const mitGleis = gleisFelder.has(`${i},${j}`)
      if (!mitGleis) {
        gipfel(dazu, cx - 0.08, cz + 0.05, OBEN, 0.4, 0.78, zufall(i, j, 1))
        gipfel(dazu, cx + 0.22, cz - 0.16, OBEN, 0.25, 0.48, zufall(i, j, 2))
        for (let k = 0; k < 2; k++) baum(dazu, i + 0.2 + k * 0.6, j + 0.85, 0.7, true, 0)
        continue
      }
      // über einem Gleis: ein Felsblock, an Kanten mit Portal um PORTAL eingerückt, wo der Tunnel im Nachbarfeld weitergeht bis über die Fuge
      const ds = kreuz.get(`${i},${j}`) ?? []
      const einzug = [0, 1, 2, 3].map((k) => {
        const d = ds.find((x) => x.kante === k)
        if (!d) return 0.025
        const nb = b[j + [-1, 0, 1, 0][k]]?.[i + [0, 1, 0, -1][k]]
        return nb?.grund === 'berg' && (nb.gleis || nb.teil) ? -0.025 : PORTAL
      })
      const x0 = i + einzug[3], x1 = i + 1 - einzug[1], z0 = j + einzug[0], z1 = j + 1 - einzug[2]
      const block = new RoundedBoxGeometry(x1 - x0, FELS_HOCH, z1 - z0, 2, 0.02)
      block.translate((x0 + x1) / 2, OBEN + FELS_HOCH / 2, (z0 + z1) / 2)
      dazu(F.fels, block, true)
      gipfel(dazu, (x0 + x1) / 2 - 0.06, (z0 + z1) / 2 + 0.03, OBEN + FELS_HOCH, Math.min(x1 - x0, z1 - z0) * 0.5, 0.55, zufall(i, j, 1))
      // die Portale: dunkle Öffnung in einem Rahmen, quer zum Gleis
      for (const d of ds) {
        if (einzug[d.kante] !== PORTAL) continue
        const q = { x: d.q.x + Math.cos(d.q.w) * PORTAL, y: d.q.y + Math.sin(d.q.w) * PORTAL, w: d.q.w }
        const rot = -q.w + Math.PI / 2
        const aus = { x: q.x - Math.cos(q.w) * 0.012, y: q.y - Math.sin(q.w) * 0.012 }
        kiste(F.felsDunkel, 0.36, 0.2, 0.03, aus.x, OBEN + 0.1, aus.y, rot)
        kiste(F.portal, 0.24, 0.15, 0.035, aus.x - Math.cos(q.w) * 0.004, OBEN + 0.075, aus.y - Math.sin(q.w) * 0.004, rot)
      }
    }
  }

  // die Gleise
  const schwellen: THREE.Matrix4[] = []
  for (const { p, aktiv, f, i, j } of wegeAlle) {
    const hoch = aktiv ? 0 : -0.006 // die inaktive Seite der Weiche knapp darunter, damit sich die Schienen nicht flimmernd überlagern
    for (const t of teilen(b, p)) {
      if (t.wasser) {
        // Brücke: Fahrbahn, Brüstungen und ein Pfeiler je Feld
        dazu(F.bruecke, band(t.p, -0.21, 0.21, OBEN - 0.05, OBEN + SCHOTTER + hoch))
        dazu(F.pfeiler, band(t.p, -0.2, -0.185, OBEN, OBEN + 0.07))
        dazu(F.pfeiler, band(t.p, 0.185, 0.2, OBEN, OBEN + 0.07))
        const m = t.p[Math.floor(t.p.length / 2)]
        if (t.p.length > 4) kiste(F.pfeiler, 0.1, OBEN - 0.05, 0.3, m.x, (OBEN - 0.05) / 2, m.y, -m.w + Math.PI / 2)
      } else {
        dazu(F.schotter, band(t.p, -SCHOTTER_B, SCHOTTER_B, OBEN - 0.01, OBEN + SCHOTTER + hoch))
      }
      // Schwellen alle 0,1 Felder
      let rest = 0
      for (let k = 0; k + 1 < t.p.length; k++) {
        const a = t.p[k], c = t.p[k + 1], l = Math.hypot(c.x - a.x, c.y - a.y)
        for (let d = rest; d < l; d += 0.1) {
          const u = d / l, x = a.x + (c.x - a.x) * u, y = a.y + (c.y - a.y) * u, w = Math.atan2(c.y - a.y, c.x - a.x)
          const m = new THREE.Matrix4().makeRotationY(-w + Math.PI / 2)
          m.setPosition(x, OBEN + (SCHOTTER + SCHWELLE) / 2 + hoch, y)
          schwellen.push(m)
          rest = d + 0.1 - l
        }
        if (rest < 0) rest = 0
      }
      for (const s of [-SPUR, SPUR]) dazu(F.schiene, band(t.p, s - 0.011, s + 0.011, OBEN + SCHWELLE + hoch, OBEN + SCHIENE + hoch))
    }
    const g = f.gleis!
    if (g.art === 'prellbock') {
      const q = p[p.length - 1]
      kiste(F.karmin, 0.04, 0.1, 0.3, q.x, OBEN + 0.07, q.y, -q.w)
      kiste('#ffffff', 0.042, 0.04, 0.1, q.x, OBEN + 0.1, q.y, -q.w)
    }
    if (g.art === 'bahnhof') {
      const cx = i + 0.5, cz = j + 0.5, th = (g.dreh * Math.PI) / 2
      const ox = Math.cos(th) * 0.26, oz = Math.sin(th) * 0.26
      const sx = g.dreh % 2 ? 0.88 : 0.2, sz = g.dreh % 2 ? 0.2 : 0.88
      kiste(F.perron, sx, 0.07, sz, cx + ox, OBEN + 0.035, cz + oz)
      // Dach auf zwei Stützen
      const lx = g.dreh % 2 ? 0.4 : 0.14, lz = g.dreh % 2 ? 0.14 : 0.4
      kiste(F.dach, lx, 0.02, lz, cx + ox * 1.05, OBEN + 0.25, cz + oz * 1.05)
      for (const e of [-0.13, 0.13]) kiste(F.dach, 0.02, 0.18, 0.02, cx + ox * 1.1 + (g.dreh % 2 ? e : 0), OBEN + 0.16, cz + oz * 1.1 + (g.dreh % 2 ? 0 : e))
    }
    if (g.art === 'kurvenbahnhof') {
      // der Perron aussen am Bogen wie im 2D-Brett
      const s = { i, j, ein: wege(g)[0][0], aus: wege(g)[0][1] }
      const mitte = wegPunkte(s, 14), cx = i + 0.5, cz = j + 0.5
      const ecke = { x: cx + ([0, 0.5, 0, -0.5][s.ein] + [0, 0.5, 0, -0.5][s.aus]), y: cz + ([-0.5, 0, 0.5, 0][s.ein] + [-0.5, 0, 0.5, 0][s.aus]) }
      const q0 = mitte[7], [lx, lz] = quer(q0, 1)
      const vz = (lx - q0.x) * (q0.x - ecke.x) + (lz - q0.y) * (q0.y - ecke.y) > 0 ? 1 : -1
      dazu(F.perron, band(mitte, vz * 0.16, vz * 0.36, OBEN - 0.01, OBEN + 0.07))
      dazu(F.dach, band(mitte.slice(4, 11), vz * 0.2, vz * 0.34, OBEN + 0.24, OBEN + 0.26))
      for (const n of [5, 9]) { const [px, pz] = quer(mitte[n], vz * 0.28); kiste(F.dach, 0.02, 0.18, 0.02, px, OBEN + 0.15, pz) }
    }
  }

  // alles einer Farbe in ein Netz
  for (const [key, l] of teile) {
    const [farbe, art] = key.split('|')
    const geo = mergeGeometries(l)!
    l.forEach((g) => g.dispose())
    const netz = new THREE.Mesh(geo, stoff(farbe, art === 'f'))
    netz.castShadow = farbe !== F.tablett && farbe !== F.wiese && farbe !== F.wald && farbe !== F.wasser && farbe !== F.deckel
    netz.receiveShadow = true
    gruppe.add(netz)
  }
  if (schwellen.length) {
    const s = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, SCHWELLE - SCHOTTER + 0.004, 0.22), stoff(F.schwelle), schwellen.length)
    schwellen.forEach((m, k) => s.setMatrixAt(k, m))
    s.receiveShadow = true
    gruppe.add(s)
  }

  // die Namen der Bahnhöfe als Schild über dem Feld
  for (const [key, name] of namen) {
    const [i, j] = key.split(',').map(Number)
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const x = c.getContext('2d')!
    x.fillStyle = '#3d3d3d'; x.beginPath(); x.roundRect(4, 4, 56, 56, 10); x.fill()
    x.fillStyle = '#ffffff'; x.font = 'bold 40px Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 32, 35)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
    sp.position.set(i + 0.16, OBEN + 0.42, j + 0.16)
    sp.scale.set(0.2, 0.2, 1)
    sp.renderOrder = 5
    gruppe.add(sp)
  }
  return gruppe
}

type Dazu = (farbe: string, g: THREE.BufferGeometry, flach?: boolean) => void
type Kiste = (farbe: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, dreh?: number) => void

/** ein Berg aus Flächen mit Schneekappe; x, z die Mitte des Fusses, y seine Höhe */
function gipfel(dazu: Dazu, x: number, z: number, y: number, r: number, h: number, zf: number) {
  const g = new THREE.ConeGeometry(r, h, 5, 1)
  g.rotateY(zf * Math.PI)
  g.translate(x, y + h / 2, z)
  dazu(F.fels, g, true)
  const s = 0.32
  const k = new THREE.ConeGeometry(r * s * 1.04, h * s, 5, 1)
  k.rotateY(zf * Math.PI)
  k.translate(x, y + h - (h * s) / 2 + 0.002, z)
  dazu(F.schnee, k, true)
}

/** ein Baum: Nadelbaum als Kegel, Laubbaum als Krone aus Flächen; s die Grösse */
function baum(dazu: Dazu, x: number, z: number, s: number, nadel: boolean, farbe: number) {
  const st = new THREE.CylinderGeometry(0.012 * s, 0.014 * s, 0.08 * s, 5)
  st.translate(x, OBEN + 0.04 * s, z)
  dazu(F.stamm, st)
  if (nadel) {
    const k = new THREE.ConeGeometry(0.065 * s, 0.24 * s, 6)
    k.translate(x, OBEN + 0.05 * s + 0.12 * s, z)
    dazu(F.nadel, k, true)
  } else {
    const k = new THREE.IcosahedronGeometry(0.075 * s, 0)
    k.translate(x, OBEN + 0.13 * s, z)
    dazu(F.laub[farbe % 3], k, true)
  }
}

/** ein Haus: helle Mauern, rotes Satteldach; dreh 0 oder π/2 */
function haus(dazu: Dazu, kiste: Kiste, x: number, z: number, dreh: number, farbe: number) {
  const b = 0.2, t = 0.16, h = 0.13
  kiste(F.wand, b, h, t, x, OBEN + h / 2, z, dreh)
  const form = new THREE.Shape()
  form.moveTo(-t / 2 - 0.015, 0); form.lineTo(t / 2 + 0.015, 0); form.lineTo(0, 0.09); form.closePath()
  const dach = new THREE.ExtrudeGeometry(form, { depth: b + 0.02, bevelEnabled: false })
  dach.translate(0, 0, -(b + 0.02) / 2)
  dach.rotateY(Math.PI / 2 + dreh)
  dach.translate(x, OBEN + h, z)
  dazu(F.ziegel[farbe % 3], dach, true)
}

/** die vier Wagen: Lok, zwei Wagen, Steuerwagen aus ZugForm.ts, auf das Brett verkleinert */
function zugBauen(): { gruppe: THREE.Group; wagen: THREE.Group[]; weg: () => void } {
  const gruppe = new THREE.Group(), stoffeAlle: THREE.Material[] = []
  const wagen = [0, 1, 2, ZUG_WAGEN].map((n) => {
    const { g, materialien } = wagenBauen(n, ZUG_WAGEN_M)
    stoffeAlle.push(...materialien)
    g.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; stoffeAlle.push(...([] as THREE.Material[]).concat(o.material)) } })
    const huelle = new THREE.Group()
    g.scale.set(ZUG_MASS * ZUG_DICK, ZUG_MASS * ZUG_DICK, ZUG_MASS)
    huelle.add(g)
    gruppe.add(huelle)
    return huelle
  })
  return {
    gruppe, wagen,
    weg: () => { gruppe.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose() }); new Set(stoffeAlle).forEach((m) => m.dispose()) },
  }
}

export default function Gleisbau3D({ brett, namen, zug, imTunnel }: {
  brett: Brett; namen: Map<string, string>; zug: React.MutableRefObject<Zug | null>; imTunnel: (b: Brett, x: number, y: number) => boolean
}) {
  const halter = useRef<HTMLDivElement>(null)
  const szene = useRef<{ scene: THREE.Scene; brett: THREE.Group | null; kamera: THREE.PerspectiveCamera; steuerung: OrbitControls; sonne: THREE.DirectionalLight } | null>(null)
  const brettRef = useRef(brett)
  brettRef.current = brett
  const kameraSetzen = useRef<(() => void) | null>(null)
  const SP = spalten(brett), ZE = zeilen(brett)

  // Szene, Licht, Kamera und Zug einmal
  useEffect(() => {
    const el = halter.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    const scene = new THREE.Scene()
    const dunkel = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    scene.background = new THREE.Color(dunkel ? '#1d2228' : '#e9eef2')
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f80', 1.6))
    const sonne = new THREE.DirectionalLight('#fff6e8', 2.2)
    sonne.castShadow = true
    sonne.shadow.mapSize.set(2048, 2048)
    sonne.shadow.bias = -0.0008
    scene.add(sonne, sonne.target)
    const kamera = new THREE.PerspectiveCamera(40, 1, 0.05, 200)
    const steuerung = new OrbitControls(kamera, renderer.domElement)
    steuerung.enableDamping = true
    steuerung.maxPolarAngle = Math.PI * 0.46
    steuerung.minDistance = 1.2
    steuerung.screenSpacePanning = false
    szene.current = { scene, brett: null, kamera, steuerung, sonne }

    const z = zugBauen()
    scene.add(z.gruppe)

    const groesse = () => {
      // auf schmalen Bildschirmen fast quadratisch, sonst breiter (gewählt)
      const w = el.clientWidth, h = Math.min(Math.round(w * (w < 600 ? 1.05 : 0.72)), Math.round(window.innerHeight * 0.75))
      renderer.setSize(w, h)
      kamera.aspect = w / h
      kamera.updateProjectionMatrix()
      kameraSetzen.current?.()
    }
    groesse()
    const ro = new ResizeObserver(groesse)
    ro.observe(el)

    let los = 0
    const bild = () => {
      const lagen = zug.current?.wagen() ?? []
      const rueck = lagen.length > 0 && lagen[0].art !== 0
      z.wagen.forEach((h, k) => {
        const l = lagen.find((x) => x.art === k)
        if (!l || imTunnel(brettRef.current, l.x, l.y)) { h.visible = false; return }
        h.visible = true
        h.position.set(l.x, OBEN + SCHIENE + (ZUG_HOEHE / 2) * ZUG_MASS * ZUG_DICK, l.y)
        h.rotation.y = Math.atan2(Math.cos(l.w), Math.sin(l.w)) + (rueck ? Math.PI : 0)
      })
      steuerung.update()
      renderer.render(scene, kamera)
      los = requestAnimationFrame(bild)
    }
    los = requestAnimationFrame(bild)
    return () => {
      cancelAnimationFrame(los); ro.disconnect(); steuerung.dispose(); z.weg()
      const b = szene.current?.brett
      if (b) b.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) { o.geometry.dispose(); ([] as THREE.Material[]).concat(o.material).forEach((m) => { (m as THREE.SpriteMaterial).map?.dispose(); m.dispose() }) } })
      renderer.dispose(); renderer.domElement.remove(); szene.current = null
    }
  }, [zug, imTunnel])

  // das Brett neu, wenn es sich ändert
  useEffect(() => {
    const s = szene.current
    if (!s) return
    if (s.brett) {
      s.scene.remove(s.brett)
      s.brett.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) { o.geometry.dispose(); ([] as THREE.Material[]).concat(o.material).forEach((m) => { (m as THREE.SpriteMaterial).map?.dispose(); m.dispose() }) } })
    }
    s.brett = brettBauen(brett, namen)
    s.scene.add(s.brett)
  }, [brett, namen])

  // Kamera und Sonne nach der Grösse des Bretts: schräg von Süden, das ganze Brett im Bild (gewählt)
  useEffect(() => {
    const s = szene.current
    if (!s) return
    const m = new THREE.Vector3(SP / 2, 0, ZE / 2), r = Math.max(SP, ZE)
    // so weit weg, dass Breite und Tiefe des Bretts ins Bild passen, auch auf dem schmalen Handy
    kameraSetzen.current = () => {
      const k = s.kamera, vf = (k.fov * Math.PI) / 360, hf = Math.atan(Math.tan(vf) * k.aspect)
      const d = Math.max((SP / 2 + 0.3) / Math.tan(hf), ((ZE / 2 + 0.3) * 0.8) / Math.tan(vf)) * 1.12
      const richtung = new THREE.Vector3(-0.12, 0.78, 0.82).normalize()
      s.steuerung.target.copy(m)
      k.position.copy(m).addScaledVector(richtung, d)
      s.steuerung.maxDistance = Math.max(r * 3, d * 1.5)
      s.steuerung.update()
    }
    kameraSetzen.current()
    s.sonne.position.set(SP / 2 - r * 0.6, r * 1.4, ZE / 2 - r * 0.2)
    s.sonne.target.position.copy(m)
    const c = s.sonne.shadow.camera
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.1; c.far = r * 4
    c.updateProjectionMatrix()
  }, [SP, ZE])

  return <div ref={halter} className="w-full overflow-hidden rounded-lg" aria-label={`Spielbrett in 3D mit ${SP} × ${ZE} Feldern`} role="img" />
}
