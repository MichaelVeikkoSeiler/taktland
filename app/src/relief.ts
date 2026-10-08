import { useEffect, useState } from 'react'
import { holen } from './daten'

/**
 * Was die App über die 3D-Reliefs wissen muss, ohne three.js zu laden (das steckt in
 * komponenten/Relief.tsx und lädt erst, wenn ein Relief gezeigt wird).
 */

/** Näherungsformel von swisstopo, wie in pipeline/build_relief.py */
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

/** «In der Brille» bei einer Probefahrt (Michael, 2026-10-08: «direkter … intuitiver»): gleich in 3D und dort gleich
 *  das Modell der ganzen Strecke für die Brille, ohne Umweg über «3D» und «Strecke in der Brille» */
let brilleVorgemerkt = false
export function brilleVormerken() { brilleVorgemerkt = true; dreiDVorgemerkt = true }
export const brilleGemerkt = () => brilleVorgemerkt
export function brilleVerbrauchen() { brilleVorgemerkt = false }

/** ob der Browser eine Brille (WebXR) meldet; nur dann gibt es Knöpfe für die Brille (Michael, 2026-10-08) */
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

/** Alle Reliefs, in der Reihenfolge der Pipeline */
export async function reliefListe() {
  const u = await holen<ReliefUebersicht>('data/relief/index.json')
  return u.reliefs.filter((r) => r.bergstrecke !== false)
}

