/**
 * Ein kleines Propellerflugzeug für «3D Schweiz», zu sehen, solange die Aufnahme des Propellerflugzeugs erklingt (Michael, 2026-11-10: «kannst du ein
 * Flugzeug einblenden (Propellermodell) wenn eines erklingt?»). Erfunden: Gestalt, Farben, Grösse, Höhe, Richtung und Tempo; kein bestimmtes
 * Flugzeug, keine Flugroute aus einer Quelle.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Höhe über dem Gelände der Hörstelle, Tempo, gewählt */
export const FLUGZEUG_HOEHE_M = 150, FLUGZEUG_MS = 50
/** die lauteste Stelle der Aufnahme (klang/propeller.mp3) nach so vielen Sekunden, gemessen; dort fliegt es der Hörstelle am nächsten */
export const FLUGZEUG_SPITZE_S = 13, FLUGZEUG_DAUER_S = 29.7

/** Form in km, die Nase bei +z; Masse gewählt: 8 m lang, 11 m Spannweite */
export function flugzeugForm(): { rumpf: THREE.BufferGeometry; propeller: THREE.BufferGeometry; propellerZ: number } {
  const teile: THREE.BufferGeometry[] = []
  const kasten = (b: number, h: number, l: number, x: number, y: number, z: number, farbe: string) => {
    const g = new THREE.BoxGeometry(b / 1000, h / 1000, l / 1000).toNonIndexed()
    g.deleteAttribute('uv')
    g.translate(x / 1000, y / 1000, z / 1000)
    const c = new THREE.Color(farbe), f = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < f.length; i += 3) { f[i] = c.r; f[i + 1] = c.g; f[i + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3))
    teile.push(g)
  }
  kasten(1.1, 1.2, 6.2, 0, 0, 0.4, '#f2f2f2')            // Rumpf
  kasten(0.9, 0.9, 1.2, 0, 0, 4.1, '#e8e8e8')            // Motorhaube
  kasten(0.6, 0.6, 1.6, 0, 0.15, -3.4, '#f2f2f2')        // Heck
  kasten(1.0, 0.45, 1.6, 0, 0.7, 1.6, '#1c2228')         // Kabinenfenster
  kasten(11, 0.18, 1.5, 0, 0.55, 1.4, '#f2f2f2')         // Flügel oben (Hochdecker)
  kasten(1.4, 0.2, 1.52, 4.8, 0.55, 1.4, '#a8102e')      // Flügelspitzen
  kasten(1.4, 0.2, 1.52, -4.8, 0.55, 1.4, '#a8102e')
  kasten(3.4, 0.12, 0.9, 0, 0.2, -3.9, '#f2f2f2')        // Höhenleitwerk
  kasten(0.12, 1.4, 1.0, 0, 0.9, -3.9, '#a8102e')        // Seitenleitwerk
  kasten(0.12, 0.12, 1.0, 0, -0.4, 0.4, '#f2f2f2')       // Fahrwerk, schlicht
  kasten(0.25, 0.5, 0.25, 0.9, -0.9, 1.2, '#202020')
  kasten(0.25, 0.5, 0.25, -0.9, -0.9, 1.2, '#202020')
  const rumpf = mergeGeometries(teile)!
  teile.forEach((t) => t.dispose())
  const blatt = new THREE.BoxGeometry(0.18 / 1000, 1.9 / 1000, 0.05 / 1000).toNonIndexed()
  blatt.deleteAttribute('uv')
  const f = new Float32Array(blatt.attributes.position.count * 3).fill(0.12)
  blatt.setAttribute('color', new THREE.BufferAttribute(f, 3))
  return { rumpf, propeller: blatt, propellerZ: 4.75 / 1000 }
}

/** ein Helikopter (Michael, 2026-11-10: «Etwas seltener auch mal ein Helikopter. Rotes Modell das durchfliegt»): Höhe über dem Gelände und Tempo
 *  gewählt; am nächsten bei der Hörstelle, wenn die Aufnahme am lautesten ist (HELIKOPTER_SPITZE_S in src/audio.ts) */
export const HELIKOPTER_HOEHE_M = 120, HELIKOPTER_MS = 35

/** Form in km, die Nase bei +z; Masse gewählt: Rumpf rot, 12 m mit Heck, Rotor 10 m */
export function helikopterForm(): { rumpf: THREE.BufferGeometry; propeller: THREE.BufferGeometry; propellerZ: number } {
  const teile: THREE.BufferGeometry[] = []
  const kasten = (b: number, h: number, l: number, x: number, y: number, z: number, farbe: string) => {
    const g = new THREE.BoxGeometry(b / 1000, h / 1000, l / 1000).toNonIndexed()
    g.deleteAttribute('uv')
    g.translate(x / 1000, y / 1000, z / 1000)
    const c = new THREE.Color(farbe), f = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < f.length; i += 3) { f[i] = c.r; f[i + 1] = c.g; f[i + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3))
    teile.push(g)
  }
  kasten(1.8, 1.9, 4.2, 0, 0, 0.8, '#c8102e')           // Kabine
  kasten(1.6, 1.0, 1.0, 0, -0.25, 3.3, '#c8102e')        // Nase
  kasten(1.7, 0.9, 1.4, 0, 0.35, 2.6, '#1c2228')         // Frontscheibe
  kasten(1.85, 0.7, 1.8, 0, 0.3, 1.0, '#1c2228')         // Seitenfenster
  kasten(0.5, 0.55, 5.5, 0, 0.45, -3.9, '#c8102e')       // Heckausleger
  kasten(0.12, 1.6, 0.9, 0, 1.1, -6.4, '#c8102e')        // Seitenflosse
  kasten(2.0, 0.1, 0.6, 0, 0.5, -5.8, '#f2f2f2')         // Höhenflosse
  kasten(0.6, 0.6, 1.6, 0, 1.25, 0.4, '#e6e6e6')         // Triebwerk
  kasten(0.12, 0.12, 3.6, 0.8, -1.25, 0.8, '#303030')    // Kufen
  kasten(0.12, 0.12, 3.6, -0.8, -1.25, 0.8, '#303030')
  kasten(0.1, 0.4, 0.1, 0.8, -1.05, 1.8, '#303030')
  kasten(0.1, 0.4, 0.1, -0.8, -1.05, 1.8, '#303030')
  kasten(0.1, 0.4, 0.1, 0.8, -1.05, -0.2, '#303030')
  kasten(0.1, 0.4, 0.1, -0.8, -1.05, -0.2, '#303030')
  kasten(0.05, 1.4, 0.12, 0.3, 0.8, -6.6, '#202020')     // Heckrotor
  const rumpf = mergeGeometries(teile)!
  teile.forEach((t) => t.dispose())
  const blatt = mergeGeometries([new THREE.BoxGeometry(10 / 1000, 0.06 / 1000, 0.3 / 1000).toNonIndexed(), new THREE.BoxGeometry(0.3 / 1000, 0.06 / 1000, 10 / 1000).toNonIndexed()])!
  blatt.deleteAttribute('uv')
  blatt.setAttribute('color', new THREE.BufferAttribute(new Float32Array(blatt.attributes.position.count * 3).fill(0.12), 3))
  return { rumpf, propeller: blatt, propellerZ: 1.75 / 1000 }
}
