import { useSyncExternalStore } from 'react'

/**
 * Audio-Einstellungen (Michael, 2026-10-01: Reiter «Audio» in der Reisetasche, seit 2026-10-06
 * ein Teil der Einstellungen).
 * an: alle Töne von Taktland, auch die Meldungen beim Fahren. reiter: ein kurzer
 * Ton beim Wechsel der Reiter. arten: der Ton beim Fahren je Art. zweimal: der Ton
 * etwa 20 und 10 Sekunden vor dem Objekt statt einmal mit der Meldung. antworten:
 * ein Ton nach jeder Antwort bei den Fragen und im Duell. Am Anfang ist alles an,
 * ausser «zweimal»; alles bleibt auf diesem Gerät.
 */
export type TonArt = 'tunnel' | 'bruecke' | 'bahnhof' | 'sehenswert' | 'bahnuebergang' | 'ankunft'
export interface Audio {
  an: boolean
  reiter: boolean
  arten: Record<TonArt, boolean>
  zweimal: boolean
  antworten: boolean
  /** ein gläsernes Klicken beim Auf- und Zuklappen (Michael, 2026-10-01) */
  aufklappen: boolean
  /** Lautstärke aller Töne in Prozent, 100 ist die bisherige Stärke (Michael, 2026-10-06) */
  lautstaerke: number
}

const SCHLUESSEL = 'taktland.audio.v1'
const ARTEN: TonArt[] = ['tunnel', 'bruecke', 'bahnhof', 'sehenswert', 'bahnuebergang', 'ankunft']

let stand: Audio = lesen()
const hoerer = new Set<() => void>()

function lesen(): Audio {
  let x: Record<string, unknown> = {}
  try { x = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}') } catch { /* Standard */ }
  const a = (x.arten ?? {}) as Partial<Record<TonArt, boolean>>
  return {
    an: x.an !== false,
    reiter: x.reiter !== false,
    arten: Object.fromEntries(ARTEN.map((k) => [k, a[k] !== false])) as Record<TonArt, boolean>,
    zweimal: x.zweimal === true,
    antworten: x.antworten !== false,
    aufklappen: x.aufklappen !== false,
    lautstaerke: typeof x.lautstaerke === 'number' && x.lautstaerke >= 0 && x.lautstaerke <= 100 ? Math.round(x.lautstaerke) : 100,
  }
}

export function audioLesen(): Audio {
  return stand
}

export function audioSetzen(neu: Partial<Audio>) {
  stand = { ...stand, ...neu }
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(stand)) } catch { /* ohne Speicher nur für jetzt */ }
  if (ausgangKnoten) ausgangKnoten.gain.value = verstaerkung()
  hoerer.forEach((h) => h())
}

export function useAudio(): Audio {
  return useSyncExternalStore((h) => { hoerer.add(h); return () => hoerer.delete(h) }, () => stand)
}

let ctx: AudioContext | null = null
let ausgangKnoten: GainNode | null = null

/** Das Ohr hört Lautstärke nicht linear; im Quadrat wirkt der Regler gleichmässiger */
const verstaerkung = () => (stand.lautstaerke / 100) ** 2

/** Alle Töne laufen über einen gemeinsamen Regler zum Lautsprecher */
function ausgang(c: AudioContext): AudioNode {
  if (!ausgangKnoten) {
    ausgangKnoten = c.createGain()
    ausgangKnoten.gain.value = verstaerkung()
    ausgangKnoten.connect(c.destination)
  }
  return ausgangKnoten
}

/** Ein gemeinsamer Audio-Kontext für alle Töne; erst nach einer Berührung hörbar */
export function audioKontext(): AudioContext | null {
  if (ctx) return ctx
  try {
    const Kontext = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    ctx = Kontext ? new Kontext() : null
  } catch { ctx = null }
  return ctx
}

/** [Beginn in s, Tonhöhe in Hz, Ausklang in s, Stärke] */
type Muster = ReadonlyArray<readonly [number, number, number, number?]>

/**
 * Die Töne beim Fahren, je Art ein eigenes Muster, erkennbar auch ohne Blick aufs
 * Handy (Michael, 2026-09-27: «Brücken anders als Tunnel, Tunnel anders als Bahnhöfe»):
 * - Tunnel: zwei Töne abwärts, tief, lang, D4–G3
 * - Brücke: ein Bogen hoch, höher, hoch, A5–Cis6–A5, wie über etwas hinüber
 *   (Michael, 2026-10-02; vorher zweimal A5)
 * - Bahnhof: der weiche Zweiklang aufwärts, G4–D5
 * - Sehenswertes: ein einzelner Ton, E5
 * - Bahnübergang: viermal schnell derselbe Ton, G5, wie das Läuten an der Schranke
 *   (2026-10-02; vorher E5–C5–E5, zu nah am Bogen der Brücke)
 * - Ankunft am Ziel: drei Töne aufwärts, G4–H4–D5, der letzte lang (2026-09-29)
 * Weiche Sinustöne mit leisem Oberton, der kleinen Handylautsprechern hilft;
 * bewusst nicht der Gong der SBB.
 */
export const TOENE: Record<TonArt, Muster> = {
  tunnel: [[0, 293.66, 1.1], [0.18, 196, 1.3]],
  bruecke: [[0, 880, 0.3], [0.13, 1108.73, 0.3], [0.26, 880, 0.45]],
  bahnhof: [[0, 392, 0.9], [0.16, 587.33, 0.9]],
  sehenswert: [[0, 659.26, 1.2]],
  bahnuebergang: [[0, 783.99, 0.16], [0.15, 783.99, 0.16], [0.3, 783.99, 0.16], [0.45, 783.99, 0.22]],
  ankunft: [[0, 392, 0.7], [0.2, 493.88, 0.7], [0.4, 587.33, 1.6]],
}

/**
 * Kurze Töne ausserhalb der Fahrt, leiser als die Meldungen (Michael, 2026-10-01):
 * - reiter: ein «Tock», E5 und H5, nach 0,12 s verklungen
 * - richtig: zwei helle Töne aufwärts, C5–G5, kurz
 * - falsch: ein weicher, tiefer Ton abwärts, E4–C4, ohne Schärfe
 * - bestwert: drei schnelle Töne aufwärts, C5–E5–G5
 * - aufklappen: ein gläsernes Klicken, C7 mit einem unharmonischen Teilton darüber
 *   (wie bei angeschlagenem Glas), nach 0,09 s verklungen
 * - zuklappen: dasselbe Glas eine Quarte tiefer (G6) und leiser, als Gegenstück
 */
const KURZ: Record<'reiter' | 'richtig' | 'falsch' | 'bestwert' | 'aufklappen' | 'zuklappen', Muster> = {
  reiter: [[0, 659.26, 0.12, 0.16], [0.012, 987.77, 0.12, 0.07]],
  richtig: [[0, 523.25, 0.22, 0.2], [0.09, 783.99, 0.35, 0.2]],
  falsch: [[0, 329.63, 0.25, 0.18], [0.12, 261.63, 0.4, 0.16]],
  bestwert: [[0, 523.25, 0.2, 0.2], [0.08, 659.26, 0.2, 0.2], [0.16, 783.99, 0.55, 0.22]],
  aufklappen: [[0, 2093, 0.09, 0.07], [0, 5651, 0.05, 0.025]],
  zuklappen: [[0, 1567.98, 0.08, 0.05], [0, 4234, 0.04, 0.018]],
}

function spielen(muster: Muster, oberton = true) {
  const c = audioKontext()
  if (!c) return
  try {
    void c.resume()
    const jetzt = c.currentTime
    for (const [beginn, hoehe, ausklang, staerke = 0.34] of muster) {
      // Grundton und, für die Fahrtöne, die Oktave darüber, leiser
      for (const [faktor, anteil] of (oberton ? [[1, 1], [2, 0.35]] : [[1, 1]]) as Array<[number, number]>) {
        const osc = c.createOscillator()
        const laut = c.createGain()
        osc.type = 'sine'
        osc.frequency.value = hoehe * faktor
        laut.gain.setValueAtTime(0.0001, jetzt + beginn)
        laut.gain.exponentialRampToValueAtTime(staerke * anteil, jetzt + beginn + 0.006)
        laut.gain.exponentialRampToValueAtTime(0.0001, jetzt + beginn + ausklang)
        osc.connect(laut).connect(ausgang(c))
        osc.start(jetzt + beginn)
        osc.stop(jetzt + beginn + ausklang + 0.05)
      }
    }
  } catch { /* ohne Ton geht alles weiter */ }
}

/** Ein Fahrton, ohne die Schalter zu prüfen (das tun Fahrtmodus und Probehören) */
export function tonSpielen(art: TonArt) {
  spielen(TOENE[art])
}

export function reiterTon() {
  if (stand.an && stand.reiter) spielen(KURZ.reiter, false)
}

/** Nach einer Antwort; ein neuer Bestwert im Duell klingt anders als ein einfaches «Richtig» */
export function antwortTon(art: 'richtig' | 'falsch' | 'bestwert') {
  if (stand.an && stand.antworten) spielen(KURZ[art], false)
}

/**
 * Ein kurzes Wischen beim Tipp auf einen Pfeil der Reiterzeile (Michael, 2026-10-02):
 * Rauschen durch einen Filter, der in Pfeilrichtung gleitet, nach rechts aufwärts,
 * nach links abwärts; rund 0,16 s. Gilt mit den Reitertönen. Der Filter lässt nur
 * etwa ein Fünftel des Rauschens durch, darum ist es stärker angesetzt; so klingt es
 * etwa so laut wie der Reiterton (erst 0,14, nicht zu hören, Michael, 2026-10-02).
 */
const WISCH_STAERKE = 0.75

export function wischTon(richtung: 'links' | 'rechts') {
  if (!stand.an || !stand.reiter) return
  const c = audioKontext()
  if (!c) return
  try {
    void c.resume()
    const jetzt = c.currentTime
    const dauer = 0.16
    const puffer = c.createBuffer(1, Math.ceil(c.sampleRate * dauer), c.sampleRate)
    const daten = puffer.getChannelData(0)
    for (let i = 0; i < daten.length; i++) daten[i] = Math.random() * 2 - 1
    const quelle = c.createBufferSource()
    quelle.buffer = puffer
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.4
    const [von, bis] = richtung === 'rechts' ? [900, 3200] : [3200, 900]
    filter.frequency.setValueAtTime(von, jetzt)
    filter.frequency.exponentialRampToValueAtTime(bis, jetzt + dauer)
    const laut = c.createGain()
    laut.gain.setValueAtTime(0.0001, jetzt)
    laut.gain.exponentialRampToValueAtTime(WISCH_STAERKE, jetzt + 0.04)
    laut.gain.exponentialRampToValueAtTime(0.0001, jetzt + dauer)
    quelle.connect(filter).connect(laut).connect(ausgang(c))
    quelle.start(jetzt)
    quelle.stop(jetzt + dauer + 0.02)
  } catch { /* ohne Ton geht alles weiter */ }
}

export function aufklappTon() {
  if (stand.an && stand.aufklappen) spielen(KURZ.aufklappen, false)
}

export function zuklappTon() {
  if (stand.an && stand.aufklappen) spielen(KURZ.zuklappen, false)
}

/**
 * Für die ganze App, einmal angemeldet: Klappt etwas auf, eine Kachel mit Pfeil
 * (details) oder ein Knopf, der etwas öffnet (aria-expanded), klickt es gläsern,
 * beim Zuklappen etwas tiefer und leiser.
 */
export function aufklappenHoeren() {
  document.addEventListener('click', (e) => {
    const ziel = e.target instanceof Element ? e.target : null
    if (!ziel) return
    const knopf = ziel.closest('[aria-expanded]')
    if (knopf) { (knopf.getAttribute('aria-expanded') === 'true' ? zuklappTon : aufklappTon)(); return }
    const summary = ziel.closest('summary')
    if (summary) (summary.parentElement?.hasAttribute('open') ? zuklappTon : aufklappTon)()
  }, true)
}
