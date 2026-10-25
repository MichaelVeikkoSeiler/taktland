import { useEffect, useState } from 'react'
import { holen } from './daten'

/**
 * Was die App über die 3D-Reliefs wissen muss, ohne three.js zu laden (das steckt in
 * komponenten/Relief.tsx und lädt erst, wenn ein Relief gezeigt wird).
 */

/** Näherungsformel von swisstopo, wie in pipeline/build_relief.py */
/** LV95 → WGS84 (Breite, Länge in Grad), die Näherung von swisstopo */
export function wgs(e: number, n: number): [number, number] {
  const y = (e - 2_600_000) / 1e6, x = (n - 1_200_000) / 1e6
  const la = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x ** 3
  const lo = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
  return [la * 100 / 36, lo * 100 / 36]
}

export function lv95(lat: number, lon: number): [number, number] {
  const p = (lat * 3600 - 169028.66) / 10000
  const l = (lon * 3600 - 26782.5) / 10000
  return [
    2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
    1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3,
  ]
}

interface ReliefUebersicht {
  reliefs: Array<{
    name: string; titel: string; linie: string; rahmen: [number, number, number, number]
    /** alle Linien, wenn ein Relief mehrere hintereinander zeigt (Solothurn–Yverdon: 410 und 210) */
    linien?: string[]
    /** die Probefahrt unter «Probefahren», Bergstrecken; Über hält sie auf der Bergstrecke */
    probefahrt: { von: number; nach: number; ueber: number | null }
    /** false: keine Bergstrecke (Lausanne–Solothurn), nicht in der Liste, die Seite bleibt über die Linien */
    bergstrecke?: boolean
  }>
}

/** aus den Bergstrecken gestartet: die Karte im Fahrtmodus gleich in 3D zeigen (die Seite «Strecke»
 *  schreibt die Adresse beim Start um, darum hier vorgemerkt und von der ersten Karte verbraucht) */
let dreiDVorgemerkt = false
export function dreiDVormerken() { dreiDVorgemerkt = true }
export const dreiDGemerkt = () => dreiDVorgemerkt
export function dreiDVerbrauchen() { dreiDVorgemerkt = false }

/** Die Modellbahn baut eigene Strecken nur bis so lang (Michael, 2026-10-08, Romanshorn – Genève-Aéroport: «Die
 *  Kacheln wurden nicht schnell genug nachgebaut»; 200 km seit 2026-10-09); die längste Bergstrecke, Lausanne – Solothurn, hat gut 160 km */
export const MODELL_HOECHSTENS_M = 200_000

/** ob der Browser eine Brille (WebXR) meldet; nur dann gibt es in der Modellbahn Knöpfe für die Brille (Michael, 2026-10-08) */
export function useBrilleMoeglich() {
  const [ja, setJa] = useState(false)
  useEffect(() => {
    const xr = navigator.xr
    if (!xr) return
    void Promise.all([xr.isSessionSupported('immersive-ar').catch(() => false), xr.isSessionSupported('immersive-vr').catch(() => false)])
      .then(([ar, vr]) => setJa(ar || vr))
  }, [])
  return ja
}

/** Die Reliefs, in der Reihenfolge der Pipeline; ohne «alle» nur die Bergstrecken */
export async function reliefListe(alle = false) {
  const u = await holen<ReliefUebersicht>('data/relief/index.json')
  return u.reliefs.filter((r) => alle || r.bergstrecke !== false)
}

