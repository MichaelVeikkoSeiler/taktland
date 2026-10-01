import { useSyncExternalStore } from 'react'

/**
 * Audio-Einstellungen (Michael, 2026-10-01: Reiter «Audio» in der Reisetasche).
 * an: alle Töne von Taktland, auch die Meldungen beim Fahren. reiter: ein kurzer
 * Ton beim Wechsel der Reiter. Beides ist am Anfang an und bleibt auf diesem Gerät.
 */
export interface Audio { an: boolean; reiter: boolean }

const SCHLUESSEL = 'taktland.audio.v1'
const GRUND: Audio = { an: true, reiter: true }

let stand: Audio = lesen()
const hoerer = new Set<() => void>()

function lesen(): Audio {
  try {
    const x = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}')
    return { an: x.an !== false, reiter: x.reiter !== false }
  } catch {
    return GRUND
  }
}

export function audioLesen(): Audio {
  return stand
}

export function audioSetzen(neu: Partial<Audio>) {
  stand = { ...stand, ...neu }
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(stand)) } catch { /* ohne Speicher nur für jetzt */ }
  hoerer.forEach((h) => h())
}

export function useAudio(): Audio {
  return useSyncExternalStore((h) => { hoerer.add(h); return () => hoerer.delete(h) }, () => stand)
}

let ctx: AudioContext | null = null

/**
 * Der Ton der Reiter: ein kurzes, weiches «Tock», zwei Sinustöne im Abstand einer
 * Quinte (E5 und H5), nach 0,12 s verklungen; leise, damit er beim Blättern nicht
 * stört, und deutlich anders als die Meldungen beim Fahren.
 */
export function reiterTon() {
  if (!stand.an || !stand.reiter) return
  try {
    const Kontext = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Kontext) return
    ctx ??= new Kontext()
    void ctx.resume()
    const jetzt = ctx.currentTime
    for (const [hoehe, staerke, beginn] of [[659.26, 0.16, 0], [987.77, 0.07, 0.012]] as const) {
      const osc = ctx.createOscillator()
      const laut = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = hoehe
      laut.gain.setValueAtTime(0.0001, jetzt + beginn)
      laut.gain.exponentialRampToValueAtTime(staerke, jetzt + beginn + 0.004)
      laut.gain.exponentialRampToValueAtTime(0.0001, jetzt + beginn + 0.12)
      osc.connect(laut).connect(ctx.destination)
      osc.start(jetzt + beginn)
      osc.stop(jetzt + beginn + 0.15)
    }
  } catch { /* ohne Ton geht alles weiter */ }
}
