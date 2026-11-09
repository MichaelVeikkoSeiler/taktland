import { useSyncExternalStore } from 'react'
import { holenBinaer } from './daten'

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
  /** Lautstärke aller Töne in Prozent; 100 ist 20 % lauter als vor dem Regler (Michael, 2026-10-06) */
  lautstaerke: number
  /** Schreibmaschine beim Tippen in Textfeldern (Michael, 2026-10-06); am Anfang aus */
  schreibmaschine: boolean
  /** Rollen und Schlagen der Räder in der 3D-Ansicht beim Fahren (Michael, 2026-10-07); am Anfang aus */
  zuggeraeusch: boolean
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
    schreibmaschine: x.schreibmaschine === true,
    zuggeraeusch: x.zuggeraeusch === true,
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

/** 100 % am Regler ist 20 % lauter als die Töne vor dem Regler (Michael, 2026-10-06: «muss lauter sein») */
const HOECHST = 1.2

/** Das Ohr hört Lautstärke nicht linear; im Quadrat wirkt der Regler gleichmässiger */
const verstaerkung = () => HOECHST * (stand.lautstaerke / 100) ** 2

/** Alle Töne laufen über einen gemeinsamen Regler zum Lautsprecher; ein Begrenzer dahinter
 *  verhindert ein Kratzen, wenn sich laute Töne überlagern */
function ausgang(c: AudioContext): AudioNode {
  if (!ausgangKnoten) {
    ausgangKnoten = c.createGain()
    ausgangKnoten.gain.value = verstaerkung()
    let ziel: AudioNode = c.destination
    try {
      const begrenzer = c.createDynamicsCompressor()
      begrenzer.threshold.value = -3
      begrenzer.knee.value = 0
      begrenzer.ratio.value = 20
      begrenzer.attack.value = 0.002
      begrenzer.release.value = 0.1
      begrenzer.connect(c.destination)
      ziel = begrenzer
    } catch { /* ohne Begrenzer */ }
    ausgangKnoten.connect(ziel)
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

/**
 * Schreibmaschine (Michael, 2026-10-06: «beim Eintragen von Texten»): ein trockener Anschlag je Zeichen,
 * etwas tiefer und dumpfer bei der Leertaste, leiser beim Löschen, die Glocke bei der Eingabetaste.
 * Alles aus Rauschen und Sinustönen gerechnet, ohne Aufnahme; jeder Anschlag klingt leicht anders.
 */
export type Anschlag = 'taste' | 'leer' | 'loeschen' | 'glocke'

export function schreibmaschinenTon(art: Anschlag) {
  if (!stand.an || !stand.schreibmaschine) return
  const c = audioKontext()
  if (!c) return
  try {
    void c.resume()
    const jetzt = c.currentTime
    const ziel = ausgang(c)
    const rauschen = (dauer: number, frequenz: number, q: number, staerke: number, ab = 0) => {
      const puffer = c.createBuffer(1, Math.ceil(c.sampleRate * dauer), c.sampleRate)
      const d = puffer.getChannelData(0)
      // schnell abklingendes Rauschen: der Hammer auf dem Papier
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.18))
      const quelle = c.createBufferSource()
      quelle.buffer = puffer
      const filter = c.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = frequenz * (0.9 + Math.random() * 0.2)
      filter.Q.value = q
      const laut = c.createGain()
      laut.gain.value = staerke
      quelle.connect(filter).connect(laut).connect(ziel)
      quelle.start(jetzt + ab)
    }
    const dumpf = (frequenz: number, dauer: number, staerke: number) => {
      const osc = c.createOscillator()
      osc.frequency.setValueAtTime(frequenz, jetzt)
      osc.frequency.exponentialRampToValueAtTime(frequenz * 0.6, jetzt + dauer)
      const laut = c.createGain()
      laut.gain.setValueAtTime(staerke, jetzt)
      laut.gain.exponentialRampToValueAtTime(0.0001, jetzt + dauer)
      osc.connect(laut).connect(ziel)
      osc.start(jetzt)
      osc.stop(jetzt + dauer + 0.01)
    }
    if (art === 'taste') {
      rauschen(0.035, 3200, 0.9, 0.9)
      dumpf(170, 0.045, 0.25)
    } else if (art === 'leer') {
      rauschen(0.05, 1300, 0.8, 0.8)
      dumpf(110, 0.07, 0.35)
    } else if (art === 'loeschen') {
      rauschen(0.03, 2400, 1.2, 0.45)
    } else {
      // die Glocke am Zeilenende, dazu der Wagenrücklauf als kurzes Rauschen
      rauschen(0.12, 900, 0.6, 0.35)
      for (const [f, s] of [[2093, 0.22], [4186, 0.06], [6280, 0.03]] as const) {
        const osc = c.createOscillator()
        osc.frequency.value = f
        const laut = c.createGain()
        laut.gain.setValueAtTime(0.0001, jetzt + 0.02)
        laut.gain.exponentialRampToValueAtTime(s, jetzt + 0.03)
        laut.gain.exponentialRampToValueAtTime(0.0001, jetzt + 1.2)
        osc.connect(laut).connect(ziel)
        osc.start(jetzt + 0.02)
        osc.stop(jetzt + 1.25)
      }
    }
  } catch { /* ohne Ton geht alles weiter */ }
}

/** Textfelder, in denen getippt wird; Regler, Kästchen und Auswahlfelder nicht */
function istTextfeld(z: EventTarget | null) {
  if (z instanceof HTMLTextAreaElement) return true
  return z instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel', 'number', 'password', ''].includes(z.type)
}

/** Für die ganze App, einmal angemeldet: jede Eingabe in einem Textfeld klingt wie eine Schreibmaschine */
export function schreibmaschineHoeren() {
  document.addEventListener('input', (e) => {
    if (!istTextfeld(e.target)) return
    const ie = e as InputEvent
    if (ie.inputType?.startsWith('delete')) schreibmaschinenTon('loeschen')
    else if (ie.inputType === 'insertLineBreak' || ie.inputType === 'insertParagraph') schreibmaschinenTon('glocke')
    else if (ie.data === ' ') schreibmaschinenTon('leer')
    else schreibmaschinenTon('taste')
  }, true)
  // die Eingabetaste in einzeiligen Feldern löst kein «input» aus
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && istTextfeld(e.target)) schreibmaschinenTon('glocke')
  }, true)
}

/**
 * Zuggeräusch in der 3D-Ansicht (Michael, 2026-10-07: «ein typisches Zuggeräusch optional»): ein tiefes Rollen
 * aus gefiltertem Rauschen, darüber ein leises Zischen, und an jedem Schienenstoss das Schlagen der Räder,
 * zwei Drehgestelle mit je zwei Achsen: «ta-dam … ta-dam». Kein aufgenommener Zug, alles gerechnet; es
 * folgt dem Tempo (KLANG_TEMPO), im Zeitraffer gestaucht, und schweigt, wenn der Zug steht.
 */
/**
 * Wie schnell das Geräusch klingt, je nach Tempo in km/h: im Zeitraffer gestaucht, sonst rattert es nur noch.
 * 2000 klang richtig (Michael, 2026-10-07), langsamer soll es langsamer klingen, 5000 noch etwas schneller,
 * darüber bleibt es dabei. Zwischen den Punkten im Logarithmus des Tempos.
 */
const KLANG_TEMPO: Array<[number, number]> = [[100, 80], [500, 115], [1000, 140], [2000, 160], [5000, 200]]
const GERAEUSCH_HOECHST_MS = 200 / 3.6
/** ab diesem Klangtempo (wie bei 2000 km/h) volle Lautstärke, wie bisher */
const VOLL_MS = 160 / 3.6

function klangTempo(ms: number) {
  const kmh = ms * 3.6
  if (kmh <= KLANG_TEMPO[0][0]) return (kmh * KLANG_TEMPO[0][1]) / KLANG_TEMPO[0][0] / 3.6
  for (let i = 1; i < KLANG_TEMPO.length; i++) {
    const [a, ka] = KLANG_TEMPO[i - 1], [b, kb] = KLANG_TEMPO[i]
    if (kmh <= b) return (ka + ((kb - ka) * Math.log(kmh / a)) / Math.log(b / a)) / 3.6
  }
  return GERAEUSCH_HOECHST_MS
}
/** Abstand der Schienenstösse und wo die Achsen eines Wagens sie treffen, in Metern */
const STOSS_M = 25
const ACHSEN_M = [0, 2.5, 17.5, 20]

/** so lange steigt das Geräusch beim Anfahren an und klingt vor dem Ziel aus (Michael, 2026-10-07) */
const AN_AB_S = 2.5

let geraeusch: {
  rollen: GainNode; zischen: GainNode; huelle: GainNode; quellen: AudioBufferSourceNode[]
  tief: BiquadFilterNode; bauch: BiquadFilterNode; laut: GainNode; hall: GainNode
  naechster: number; uhr: number; tempo: number; faehrtSeit: number | null
} | null = null

function rauschenSchleife(c: AudioContext, braun: boolean) {
  const puffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const d = puffer.getChannelData(0)
  let letzter = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    // braunes Rauschen: aufsummiert, tief und dumpf
    d[i] = braun ? (letzter = (letzter + 0.02 * w) / 1.02) * 3.5 : w
  }
  const q = c.createBufferSource()
  q.buffer = puffer
  q.loop = true
  return q
}

function schlag(c: AudioContext, ziel: AudioNode, wann: number, staerke: number) {
  const dauer = 0.07
  const puffer = c.createBuffer(1, Math.ceil(c.sampleRate * dauer), c.sampleRate)
  const d = puffer.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.15))
  const q = c.createBufferSource()
  q.buffer = puffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 700 + Math.random() * 200
  filter.Q.value = 1.1
  const laut = c.createGain()
  laut.gain.value = staerke
  q.connect(filter).connect(laut).connect(ziel)
  q.start(wann)
  // dazu ein dumpfer Schlag
  const osc = c.createOscillator()
  osc.frequency.setValueAtTime(95, wann)
  osc.frequency.exponentialRampToValueAtTime(55, wann + 0.08)
  const tief = c.createGain()
  tief.gain.setValueAtTime(staerke * 0.6, wann)
  tief.gain.exponentialRampToValueAtTime(0.0001, wann + 0.09)
  osc.connect(tief).connect(ziel)
  osc.start(wann)
  osc.stop(wann + 0.1)
}

/** Wo der Zug fährt: im Tunnel dumpfer und lauter mit Widerhall, auf einer Brücke hohler (Michael, 2026-10-07) */
export type GeraeuschOrt = 'tunnel' | 'bruecke' | null

/** Das Tempo des Zugs in m/s, laufend, und wie viele Sekunden es noch bis zum Ziel sind; null oder 0 lässt das
 *  Geräusch ausklingen. Nur mit «an» und «zuggeraeusch». Beim Anfahren steigt es in AN_AB_S an, so lange vor dem
 *  Ziel klingt es aus. */
export function zuggeraeuschTempo(ms: number | null, bisZielS = Infinity, ort: GeraeuschOrt = null, lautstaerke = 1, ohneSchalter = false) {
  const v = stand.an && (stand.zuggeraeusch || ohneSchalter) && ms ? klangTempo(Math.max(0, ms)) : 0
  const c = audioKontext()
  if (!c) return
  try {
    if (!geraeusch) {
      if (v < 0.5) return
      void c.resume()
      const rollen = c.createGain(), zischen = c.createGain(), huelle = c.createGain()
      rollen.gain.value = 0; zischen.gain.value = 0; huelle.gain.value = 0
      // dahinter: ein Bauch um 200 Hz für Brücken, die Lautstärke je Ort und ein kurzer Widerhall für Tunnel
      const bauch = c.createBiquadFilter()
      bauch.type = 'peaking'; bauch.frequency.value = 200; bauch.Q.value = 1.8; bauch.gain.value = 0
      const laut = c.createGain()
      const hall = c.createGain(), echo = c.createDelay(0.5), rueck = c.createGain()
      hall.gain.value = 0; echo.delayTime.value = 0.07; rueck.gain.value = 0.45
      huelle.connect(bauch).connect(laut).connect(ausgang(c))
      laut.connect(hall).connect(echo).connect(ausgang(c))
      echo.connect(rueck).connect(echo)
      const tief = c.createBiquadFilter()
      tief.type = 'lowpass'; tief.frequency.value = 220
      const braun = rauschenSchleife(c, true), weiss = rauschenSchleife(c, false)
      braun.connect(tief).connect(rollen).connect(huelle)
      const hoch = c.createBiquadFilter()
      hoch.type = 'bandpass'; hoch.frequency.value = 2600; hoch.Q.value = 0.6
      weiss.connect(hoch).connect(zischen).connect(huelle)
      braun.start(); weiss.start()
      geraeusch = { rollen, zischen, huelle, quellen: [braun, weiss], tief, bauch, laut, hall,
                    naechster: c.currentTime + 0.1, uhr: 0, tempo: 0, faehrtSeit: null }
    }
    const g = geraeusch
    g.tempo = v
    const anteil = Math.min(1, v / VOLL_MS)
    g.rollen.gain.setTargetAtTime(0.55 * Math.sqrt(anteil), c.currentTime, 0.4)
    g.zischen.gain.setTargetAtTime(0.035 * anteil * (ort === 'tunnel' ? 0.5 : 1), c.currentTime, 0.4)
    // im Tunnel dumpfer, lauter und mit Widerhall; auf der Brücke hohl, mit mehr Bauch
    const t0 = c.currentTime
    g.tief.frequency.setTargetAtTime(ort === 'tunnel' ? 140 : 220, t0, 0.3)
    g.bauch.gain.setTargetAtTime(ort === 'bruecke' ? 10 : 0, t0, 0.3)
    g.laut.gain.setTargetAtTime((ort === 'tunnel' ? 1.7 : ort === 'bruecke' ? 1.2 : 1) * lautstaerke, t0, 0.3)
    g.hall.gain.setTargetAtTime(ort === 'tunnel' ? 0.5 : 0, t0, 0.3)
    // Hülle: ab dem Anfahren in AN_AB_S auf voll, vor dem Ziel wieder hinunter; steht der Zug, beginnt es neu
    const jetzt = c.currentTime
    if (v < 0.5) g.faehrtSeit = null
    else g.faehrtSeit ??= jetzt
    const an = g.faehrtSeit === null ? 0 : Math.min(1, (jetzt - g.faehrtSeit) / AN_AB_S)
    const ab = Math.max(0, Math.min(1, bisZielS / AN_AB_S))
    g.huelle.gain.cancelScheduledValues(jetzt)
    g.huelle.gain.setValueAtTime(g.huelle.gain.value, jetzt)
    g.huelle.gain.linearRampToValueAtTime(Math.min(an, ab), jetzt + 0.25)
    if (!g.uhr) {
      // Schläge etwas im Voraus planen
      g.uhr = window.setInterval(() => {
        const t = c.currentTime
        if (g.tempo < 0.5) { g.naechster = t + 0.1; return }
        if (g.naechster < t) g.naechster = t + 0.05
        // eine halbe Sekunde im Voraus: stockt die Seite kurz (die Szene baut das Gelände neu), fehlen keine Schläge
        while (g.naechster < t + 0.5) {
          const staerke = 0.25 + 0.35 * Math.min(1, g.tempo / VOLL_MS)
          for (const a of ACHSEN_M) schlag(c, g.huelle, g.naechster + a / g.tempo, staerke)
          g.naechster += STOSS_M / g.tempo
        }
      }, 80)
    }
  } catch { /* ohne Ton geht alles weiter */ }
}

/** Beim Verlassen der 3D-Ansicht */
export function zuggeraeuschAus() {
  if (!geraeusch) return
  const c = audioKontext()
  const g = geraeusch
  geraeusch = null
  window.clearInterval(g.uhr)
  try {
    if (c) g.huelle.gain.setTargetAtTime(0, c.currentTime, 0.15)
    window.setTimeout(() => { for (const q of g.quellen) q.stop(); g.huelle.disconnect(); g.laut.disconnect(); g.hall.disconnect() }, 1000)
  } catch { /* nichts */ }
}

/**
 * Signalhorn im Führerstand (Michael, 2026-10-12): zwei Töne zugleich, die nicht ganz zusammenpassen, wie bei einem
 * Doppelhorn, mit Sägezahn gefiltert, etwa so lang wie man den Knopf drückt (mindestens 0,5 s). Gerechnet, keine
 * Aufnahme eines bestimmten Horns. Gilt mit «Alle Töne».
 */
export function signalhorn(dauer = 0.8) {
  if (!stand.an) return
  const c = audioKontext()
  if (!c) return
  try {
    void c.resume()
    const jetzt = c.currentTime
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1800
    const laut = c.createGain()
    laut.gain.setValueAtTime(0.0001, jetzt)
    laut.gain.exponentialRampToValueAtTime(0.22, jetzt + 0.06)
    laut.gain.setValueAtTime(0.22, jetzt + dauer)
    laut.gain.exponentialRampToValueAtTime(0.0001, jetzt + dauer + 0.25)
    filter.connect(laut).connect(ausgang(c))
    for (const hz of [370, 466.16]) {
      const osc = c.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = hz
      osc.connect(filter)
      osc.start(jetzt)
      osc.stop(jetzt + dauer + 0.3)
    }
  } catch { /* ohne Ton geht alles weiter */ }
}

/**
 * Knöpfe an den Wänden von «3D Schweiz» (Michael, 2026-10-22: «wenn man die Knöpfe drückt … ein Soundeffekt … passend und
 * absolut authentisch»): ein rastender Druckknopf, gerechnet, ohne Aufnahme. Der helle Anschlag der Kappe (Rauschen, Bandpass um
 * 3,5 kHz), der dumpfe Körper (Sinus, der in 50 ms tiefer wird) und, wo er einrastet, ein zweites, leiseres Klicken der Feder; beim
 * Lösen ist der zweite Klick früher und heller. Jeder Druck klingt leicht anders.
 */
export function knopfTon(rastetEin: boolean) {
  if (!stand.an) return
  const c = audioKontext()
  if (!c) return
  try {
    void c.resume()
    const jetzt = c.currentTime, ziel = ausgang(c)
    const klick = (t: number, hz: number, staerke: number, dauer: number) => {
      const puffer = c.createBuffer(1, Math.ceil(c.sampleRate * dauer), c.sampleRate)
      const d = puffer.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * dauer * 0.18))
      const q = c.createBufferSource(); q.buffer = puffer
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hz * (0.93 + Math.random() * 0.14); f.Q.value = 2.5
      const g = c.createGain(); g.gain.value = staerke
      q.connect(f).connect(g).connect(ziel)
      q.start(t); q.stop(t + dauer + 0.01)
    }
    const koerper = (t: number, hz: number, staerke: number) => {
      const o = c.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(hz, t); o.frequency.exponentialRampToValueAtTime(hz * 0.55, t + 0.05)
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(staerke, t + 0.003)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
      o.connect(g).connect(ziel); o.start(t); o.stop(t + 0.07)
    }
    klick(jetzt, 3500, 0.9, 0.012)
    koerper(jetzt, rastetEin ? 190 : 230, 0.35)
    if (rastetEin) klick(jetzt + 0.045, 2600, 0.35, 0.01)
    else klick(jetzt + 0.022, 4200, 0.3, 0.008)
  } catch { /* ohne Ton geht alles weiter */ }
}

/**
 * Wetter zum Hören (Michael, 2026-10-25: «Bei Regen, Regengeräusch. Bei Wind, Windgeräusch»), gerechnet wie das Zuggeräusch:
 * Regen ein helles Rauschen mit einzelnen Tropfen, so dicht wie der Regen stark ist; Wind ein tiefes Rauschen, das langsam auf- und
 * abschwillt, lauter und heller mit der Stärke, voll ab WIND_VOLL_KMH. Schnee bleibt still. Klang und Lautstärke gewählt, kein Messwert.
 */
const WIND_VOLL_KMH = 40
let wetterTon: {
  regen: GainNode; wind: GainNode; windFilter: BiquadFilterNode; quellen: AudioScheduledSourceNode[]
  tropfen: number | null; regenStaerke: number
} | null = null

/** regen: Stärke 0 bis 1 (null oder Schnee: still), windKmh: Mittel in km/h (null: ohne Messung, still) */
export function wetterGeraeusch(regen: number | null, windKmh: number | null) {
  if (!stand.an) { wetterGeraeuschAus(); return }
  const c = audioKontext()
  if (!c) return
  void c.resume()
  if (!wetterTon) {
    const ziel = ausgang(c)
    // Regen: weisses Rauschen, unten und oben beschnitten
    const r = rauschenSchleife(c, false)
    const hoch = c.createBiquadFilter(); hoch.type = 'highpass'; hoch.frequency.value = 900
    const tief = c.createBiquadFilter(); tief.type = 'lowpass'; tief.frequency.value = 7000
    const regenG = c.createGain(); regenG.gain.value = 0
    r.connect(hoch).connect(tief).connect(regenG).connect(ziel)
    // Wind: braunes Rauschen durch ein Band, das langsam wandert; die Lautstärke schwillt mit zwei langsamen Schwingungen
    const w = rauschenSchleife(c, true)
    const band = c.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 350; band.Q.value = 0.8
    const windG = c.createGain(); windG.gain.value = 0
    const boeen = c.createGain(); boeen.gain.value = 1
    const lfo1 = c.createOscillator(); lfo1.frequency.value = 0.13
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.047
    const tiefe1 = c.createGain(); tiefe1.gain.value = 0.35
    const tiefe2 = c.createGain(); tiefe2.gain.value = 0.25
    lfo1.connect(tiefe1).connect(boeen.gain); lfo2.connect(tiefe2).connect(boeen.gain)
    const lfo3 = c.createOscillator(); lfo3.frequency.value = 0.09
    const tiefe3 = c.createGain(); tiefe3.gain.value = 120
    lfo3.connect(tiefe3).connect(band.frequency)
    w.connect(band).connect(boeen).connect(windG).connect(ziel)
    const quellen = [r, w, lfo1, lfo2, lfo3]
    for (const q of quellen) q.start()
    wetterTon = { regen: regenG, wind: windG, windFilter: band, quellen, tropfen: null, regenStaerke: 0 }
  }
  const t = c.currentTime, s = Math.max(0, Math.min(1, regen ?? 0))
  wetterTon.regen.gain.setTargetAtTime(s > 0 ? 0.05 + 0.22 * s : 0, t, 0.6)
  const wf = windKmh === null ? 0 : Math.max(0, Math.min(1, windKmh / WIND_VOLL_KMH))
  // im Quadrat der Stärke: 5 km/h etwa 2 %, 10 km/h 6 %, 20 km/h 25 % von voll (Michael, 2026-10-27: «bei 3, 5 oder 10 km/h … leiser»)
  wetterTon.wind.gain.setTargetAtTime(wf > 0.05 ? 0.58 * wf * wf : 0, t, 1.2)
  wetterTon.windFilter.Q.setTargetAtTime(0.8 - 0.4 * wf, t, 1.2)
  wetterTon.regenStaerke = s
  // einzelne Tropfen: kurze, helle Knackser, so viele je Sekunde wie der Regen stark ist
  if (s > 0 && wetterTon.tropfen === null) {
    const ton = wetterTon
    ton.tropfen = window.setInterval(() => {
      const cc = audioKontext()
      if (!cc || ton.regenStaerke <= 0) return
      const n = Math.round(ton.regenStaerke * 6 * Math.random() * 2)
      for (let i = 0; i < n; i++) {
        const wann = cc.currentTime + Math.random() * 0.25, dauer = 0.012
        const p = cc.createBuffer(1, Math.ceil(cc.sampleRate * dauer), cc.sampleRate), d = p.getChannelData(0)
        for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-k / (cc.sampleRate * 0.002))
        const q = cc.createBufferSource(); q.buffer = p
        const f = cc.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500 + Math.random() * 4000; f.Q.value = 3
        const g = cc.createGain(); g.gain.value = 0.05 + Math.random() * 0.1
        q.connect(f).connect(g).connect(ausgang(cc)); q.start(wann); q.stop(wann + dauer + 0.01)
      }
    }, 250)
  } else if (s <= 0 && wetterTon.tropfen !== null) { window.clearInterval(wetterTon.tropfen); wetterTon.tropfen = null }
}

export function wetterGeraeuschAus() {
  if (!wetterTon) return
  const ton = wetterTon
  wetterTon = null
  if (ton.tropfen !== null) window.clearInterval(ton.tropfen)
  const c = audioKontext()
  const t = c?.currentTime ?? 0
  ton.regen.gain.setTargetAtTime(0, t, 0.3); ton.wind.gain.setTargetAtTime(0, t, 0.3)
  window.setTimeout(() => { for (const q of ton.quellen) { try { q.stop() } catch { /* schon aus */ } } }, 1500)
}

/**
 * Züge laut Fahrplan in «3D Schweiz» (Michael, 2026-10-30: «Zuggeräusch einschalten. Wenn Züge aktiviert sind. Je näher ein Zug ist umso
 * lauter»; dann «Das Geräusch ist nicht gut. Nimm einfach das Geräusch von Taktland»): das Zuggeräusch beim Fahren (zuggeraeuschTempo), mit
 * dem Tempo des nächsten fahrenden Zugs, im Quadrat leiser mit seinem Abstand (VORBEI_NAH_M, VORBEI_STILL_M), aus der Ferne leise (FERN_*); Abstände gewählt.
 */
export interface VorbeiZug { abstandM: number; tempoMs: number }
const VORBEI_NAH_M = 150, VORBEI_STILL_M = 2500
/** leise auch aus der Ferne (Michael, 2026-11-02: «Ja, leise auch aus der Ferne»): nie leiser als FERN_LAUT bis FERN_VOLL_M, bis FERN_STILL_M
 *  auslaufend; Lautstärke und Abstände gewählt */
const FERN_LAUT = 0.06, FERN_VOLL_M = 25_000, FERN_STILL_M = 50_000

/** ohneFerne: ohne das leise Geräusch aus der Ferne, nur je näher, desto lauter, bis still (in der Brille; Michael, 2026-11-09: «wenn ich mich
 *  entferne, soll es auch wieder leiser sein, bis zum Verstummen») */
export function zuegeHoeren(zuege: VorbeiZug[], ohneFerne = false) {
  const z = zuege.filter((x) => x.tempoMs > 1 && x.abstandM < FERN_STILL_M).sort((a, b) => a.abstandM - b.abstandM)[0]
  if (!z) { zuggeraeuschTempo(null, Infinity, null, 1, true); return }
  const nah = Math.max(0, 1 - z.abstandM / VORBEI_STILL_M) / (1 + (z.abstandM / VORBEI_NAH_M) ** 2)
  const fern = ohneFerne ? 0 : FERN_LAUT * Math.min(1, Math.max(0, (FERN_STILL_M - z.abstandM) / (FERN_STILL_M - FERN_VOLL_M)))
  const laut = Math.max(nah, fern)
  zuggeraeuschTempo(z.tempoMs, Infinity, null, laut, true)
}

export function zuegeHoerenAus() {
  zuggeraeuschAus()
}

/**
 * Geräusche der Umgebung in «3D Schweiz» (Michael, 2026-11-09: «Wenn ich in der Stadt bin, möchte ich ein Stadtgeräusch hören. Vielleicht mal ein
 * Hupen eines Autos, vielleicht ein Bus … Wenn ich auf dem Land bin, dürfen saisonale Geräusche erklingen. Zum Beispiel Kühe, ein Traktor, mal ein
 * Flugzeug … Wenn ich einen Fluss vor mir habe, ein Flussgeräusch»; im Programm erzeugt, wie er gewählt hat): ein Rauschen der Stadt und eines Flusses
 * nach ihrem Anteil, dazu ab und zu einzelne Geräusche, nach Ort, Tageszeit und Monat der Szene. Belegt ist nur, wo Siedlung und Flüsse liegen
 * (swissTLMRegio); welche Geräusche, wie oft und wie sie klingen, ist erfunden (alle UMGEBUNG_* gewählt).
 */
export interface Umgebung {
  /** 0 bis 1: Anteil Siedlung um die Stelle, Nähe eines Flusses, und wie nah man ist (aus der Ferne still) */
  stadt: number; fluss: number; nah: number
  /** Stunde (0 bis 24) und Monat (1 bis 12) der Szene */
  stunde: number; monat: number
  /** Höhe des Geländes an der Stelle, m ü. M. */
  hoehe: number
}
/** Lautstärke des Rauschens der Stadt und des Flusses, der einzelnen Geräusche (gewählt) */
const UMGEBUNG_STADT = 0.09, UMGEBUNG_FLUSS = 0.16, UMGEBUNG_EINZEL = 0.5
/** je Sekunde die Aussicht auf ein Geräusch, bei vollem Anteil (gewählt) */
const UMGEBUNG_JE_S = { hupe: 0.025, bus: 0.018, kuh: 0.03, glocke: 0.035, traktor: 0.007, kraehe: 0.02, flugzeug: 0.004 }
/** Verkehr in der Stadt als Aufnahme (Michael, 2026-11-09: «Das ist das Geräusch von freesound.org für die Stadt»): Froey_, «Background traffic noise»,
 *  freesound.org/s/700948, zu einer Schleife von 62 s geschnitten (3 s überblendet, auf −20 dB gebracht), vorne und hinten 0,5 s aus der Schleife als
 *  Rand, damit die Lücke des MP3 am Anfang nicht hörbar ist (STADT_RAND_S); Lautstärke gegen das Erzeugte gewählt */
const STADT_RAND_S = 0.5, STADT_AUFNAHME = 2.5
/** Kuhglocken einer Herde als Aufnahme (Michael, 2026-11-09: «Kühe. Soll man nur auf dem Land oder in kleinen Dörfern hören. Auch Berge bis 2000m»):
 *  «cowbells2» von deleted_user_229898, freesound.org/s/59901, CC0, Schleife von 40 s (2,5 s überblendet), auf −22 dB, Rand wie bei der Stadt; nach dem
 *  Anteil Land, Mai bis Oktober am Tag, bis GLOCKEN_BIS_M über Meer; die Herde schwillt langsam an und ab (GLOCKEN_*, gewählt) */
const GLOCKEN_AUFNAHME = 2.5, GLOCKEN_BIS_M = 2000, UMGEBUNG_GLOCKEN = 0.12
const aufnahmen = new Map<string, Promise<AudioBuffer | null>>()
function aufnahme(c: AudioContext, pfad: string) {
  let p = aufnahmen.get(pfad)
  if (!p) {
    p = holenBinaer(pfad).then((b) => c.decodeAudioData(b)).catch(() => { aufnahmen.delete(pfad); return null })
    aufnahmen.set(pfad, p)
  }
  return p
}
/** eine Aufnahme als Schleife in ziel, an einer zufälligen Stelle begonnen; danach weg() (das Erzeugte leiser) */
function schleifeAus(c: AudioContext, pfad: string, ziel: AudioNode, laut: number, gilt: () => boolean, weg?: () => void) {
  aufnahme(c, pfad).then((puffer) => {
    if (!puffer || !umgebungTon || !gilt()) return
    const q = c.createBufferSource(); q.buffer = puffer; q.loop = true
    q.loopStart = STADT_RAND_S; q.loopEnd = puffer.duration - STADT_RAND_S
    const g = c.createGain(); g.gain.value = laut
    q.connect(g).connect(ziel)
    q.start(c.currentTime, STADT_RAND_S + Math.random() * (puffer.duration - 2 * STADT_RAND_S))
    weg?.()
    umgebungTon.quellen.push(q)
  }).catch(() => {})
}
let umgebungTon: {
  stadt: GainNode; fluss: GainNode; glocken: GainNode; glockenDa: boolean; flussWelle: OscillatorNode; quellen: AudioScheduledSourceNode[]; uhr: number; jetzt: Umgebung | null
  /** bis wann ein Geräusch dieser Art noch klingt (nicht zwei Traktoren übereinander) */
  bis: Record<string, number>
} | null = null

export function umgebungHoeren(u: Umgebung | null) {
  if (!stand.an || !u || u.nah <= 0) { umgebungHoerenAus(); return }
  const c = audioKontext()
  if (!c) return
  try {
    void c.resume()
    if (!umgebungTon) {
      const ziel = ausgang(c)
      // Stadt: tiefes, gleichmässiges Rauschen des Verkehrs
      const sb = rauschenSchleife(c, true), sw = rauschenSchleife(c, false)
      const stadt = c.createGain(); stadt.gain.value = 0
      const st1 = c.createBiquadFilter(); st1.type = 'lowpass'; st1.frequency.value = 380
      const st2 = c.createBiquadFilter(); st2.type = 'bandpass'; st2.frequency.value = 900; st2.Q.value = 0.5
      const st2g = c.createGain(); st2g.gain.value = 0.25
      // erzeugt, bis die Aufnahme geladen ist (oder wenn sie fehlt)
      const erzeugt = c.createGain()
      sb.connect(st1).connect(erzeugt); sw.connect(st2).connect(st2g).connect(erzeugt); erzeugt.connect(stadt); stadt.connect(ziel)
      schleifeAus(c, 'klang/stadt.mp3', stadt, STADT_AUFNAHME, () => umgebungTon?.stadt === stadt, () => erzeugt.gain.setTargetAtTime(0, c.currentTime, 0.5))
      // Kuhglocken: die Aufnahme, langsam an- und abschwellend; bis sie da ist, die erzeugten einzeln (umgebungEinzeln)
      const glocken = c.createGain(); glocken.gain.value = 0
      const herde = c.createGain(); herde.gain.value = 0.7
      const schwell = c.createOscillator(); schwell.frequency.value = 0.045
      const schwellG = c.createGain(); schwellG.gain.value = 0.3
      schwell.connect(schwellG).connect(herde.gain)
      herde.connect(glocken).connect(ziel)
      schleifeAus(c, 'klang/glocken.mp3', herde, GLOCKEN_AUFNAHME, () => umgebungTon?.glocken === glocken, () => { if (umgebungTon) umgebungTon.glockenDa = true })
      // Fluss: helles Rauschen, langsam an- und abschwellend
      const fw = rauschenSchleife(c, false)
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1100; f1.Q.value = 0.35
      const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 3500
      const fluss = c.createGain(); fluss.gain.value = 0
      const welle = c.createOscillator(); welle.frequency.value = 0.17
      const welleG = c.createGain(); welleG.gain.value = 0
      welle.connect(welleG).connect(fluss.gain)
      fw.connect(f1).connect(f2).connect(fluss).connect(ziel)
      for (const q of [sb, sw, fw, welle, schwell]) q.start()
      umgebungTon = { stadt, fluss, glocken, glockenDa: false, flussWelle: welle, quellen: [sb, sw, fw, welle, schwell], uhr: window.setInterval(() => umgebungEinzeln(), 1000), jetzt: null, bis: {} }
      ;(umgebungTon as unknown as { welleG: GainNode }).welleG = welleG
    }
    const t = umgebungTon, jetzt = c.currentTime
    t.jetzt = u
    // nachts weniger Verkehr (gewählt)
    const nacht = u.stunde < 6 || u.stunde >= 22
    t.stadt.gain.setTargetAtTime(UMGEBUNG_STADT * u.stadt * u.nah * (nacht ? 0.4 : 1), jetzt, 0.8)
    const f = UMGEBUNG_FLUSS * u.fluss * u.nah
    t.fluss.gain.setTargetAtTime(f, jetzt, 0.8)
    ;(t as unknown as { welleG: GainNode }).welleG.gain.setTargetAtTime(f * 0.25, jetzt, 0.8)
    t.glocken.gain.setTargetAtTime(weideJetzt(u) ? UMGEBUNG_GLOCKEN * (1 - u.stadt) * u.nah : 0, jetzt, 1.5)
  } catch { /* ohne Ton */ }
}

export function umgebungHoerenAus() {
  if (!umgebungTon) return
  const t = umgebungTon
  umgebungTon = null
  window.clearInterval(t.uhr)
  const c = audioKontext()
  try {
    if (c) for (const g of [t.stadt, t.fluss, t.glocken]) g.gain.setTargetAtTime(0, c.currentTime, 0.3)
    window.setTimeout(() => { for (const q of t.quellen) { try { q.stop() } catch { /* schon aus */ } } }, 1500)
  } catch { /* ohne Ton */ }
}

/** Kühe auf der Weide: Mai bis Oktober, am Tag, bis GLOCKEN_BIS_M über Meer (gewählt) */
function weideJetzt(u: Umgebung) {
  return u.stunde >= 6 && u.stunde < 21 && u.monat >= 5 && u.monat <= 10 && u.hoehe <= GLOCKEN_BIS_M
}

/** einmal je Sekunde: vielleicht ein einzelnes Geräusch */
function umgebungEinzeln() {
  const t = umgebungTon, c = audioKontext()
  if (!t || !c || !t.jetzt || !stand.an) return
  const u = t.jetzt, jetzt = c.currentTime
  const tag = u.stunde >= 6 && u.stunde < 21, weide = weideJetzt(u), feld = u.monat >= 3 && u.monat <= 10
  const land = (1 - u.stadt) * u.nah, stadt = u.stadt * u.nah
  const frei = (art: string) => (t.bis[art] ?? 0) <= jetzt
  const versuch = (art: keyof typeof UMGEBUNG_JE_S, anteil: number) => anteil > 0.05 && frei(art) && Math.random() < UMGEBUNG_JE_S[art] * anteil
  const ziel = ausgang(c)
  // jedes Geräusch an einer zufälligen Seite, verschieden weit weg
  const quelle = (laut: number) => {
    const g = c.createGain(); g.gain.value = UMGEBUNG_EINZEL * laut * (0.4 + 0.6 * Math.random())
    let n: AudioNode = g
    try { const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; g.connect(p); n = p } catch { /* ohne Seite */ }
    n.connect(ziel)
    return g
  }
  try {
    if (versuch('hupe', stadt * (tag ? 1 : 0.3))) t.bis.hupe = hupe(c, quelle(stadt), jetzt)
    if (versuch('bus', stadt * (tag ? 1 : 0.4))) t.bis.bus = bus(c, quelle(stadt), jetzt)
    if (tag && weide && versuch('kuh', land)) t.bis.kuh = kuh(c, quelle(land), jetzt)
    if (weide && !t.glockenDa && versuch('glocke', land)) t.bis.glocke = glocken(c, quelle(land * 0.6), jetzt)
    if (tag && feld && versuch('traktor', land)) t.bis.traktor = traktor(c, quelle(land), jetzt)
    if (tag && versuch('kraehe', land)) t.bis.kraehe = kraehe(c, quelle(land * 0.7), jetzt)
    if (u.stunde >= 6 && u.stunde < 23 && versuch('flugzeug', u.nah)) t.bis.flugzeug = flugzeug(c, quelle(0.7), jetzt)
  } catch { /* ohne Ton */ }
}

/** ein Hupen: zwei Töne zugleich, kurz, manchmal zweimal; gibt zurück, bis wann es klingt */
function hupe(c: AudioContext, ziel: GainNode, t0: number) {
  const mal = Math.random() < 0.35 ? 2 : 1, dauer = 0.25 + Math.random() * 0.35
  const tief = c.createBiquadFilter(); tief.type = 'lowpass'; tief.frequency.value = 2400
  const h = c.createGain(); h.gain.value = 0
  h.connect(tief).connect(ziel)
  const grund = 380 + Math.random() * 80
  for (const hz of [grund, grund * 1.26]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = hz; o.connect(h); o.start(t0); o.stop(t0 + mal * (dauer + 0.15) + 0.2) }
  for (let i = 0; i < mal; i++) {
    const a = t0 + i * (dauer + 0.15)
    h.gain.setValueAtTime(0, a); h.gain.linearRampToValueAtTime(0.18, a + 0.02); h.gain.setValueAtTime(0.18, a + dauer); h.gain.linearRampToValueAtTime(0, a + dauer + 0.05)
  }
  return t0 + mal * (dauer + 0.15) + 0.5
}

/** ein Bus fährt vorbei: Rollen und Motor schwellen an und ab, von einer Seite zur anderen */
function bus(c: AudioContext, ziel: GainNode, t0: number) {
  const dauer = 7 + Math.random() * 3
  const g = c.createGain(); g.gain.value = 0
  const r = rauschenSchleife(c, true), tief = c.createBiquadFilter(); tief.type = 'lowpass'; tief.frequency.value = 500
  const m = c.createOscillator(); m.type = 'sawtooth'; m.frequency.value = 55 + Math.random() * 15
  const mt = c.createBiquadFilter(); mt.type = 'lowpass'; mt.frequency.value = 260
  const mg = c.createGain(); mg.gain.value = 0.25
  r.connect(tief).connect(g); m.connect(mt).connect(mg).connect(g); g.connect(ziel)
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.5, t0 + dauer * 0.45); g.gain.linearRampToValueAtTime(0, t0 + dauer)
  m.frequency.setValueAtTime(m.frequency.value * 1.06, t0); m.frequency.linearRampToValueAtTime(m.frequency.value * 0.94, t0 + dauer)
  r.start(t0); m.start(t0); r.stop(t0 + dauer + 0.1); m.stop(t0 + dauer + 0.1)
  return t0 + dauer + 2
}

/** eine Kuh: ein tiefer Ton durch zwei Formanten, erst steigend, dann fallend */
function kuh(c: AudioContext, ziel: GainNode, t0: number) {
  const dauer = 1.2 + Math.random() * 0.9, f0 = 105 + Math.random() * 30
  const o = c.createOscillator(); o.type = 'sawtooth'
  o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f0 * 1.25, t0 + dauer * 0.35); o.frequency.linearRampToValueAtTime(f0 * 0.85, t0 + dauer)
  const vib = c.createOscillator(); vib.frequency.value = 5; const vg = c.createGain(); vg.gain.value = 2.5; vib.connect(vg).connect(o.frequency)
  const g = c.createGain(); g.gain.value = 0
  for (const [hz, q, s] of [[480, 4, 1], [950, 5, 0.6], [2300, 6, 0.15]] as const) {
    const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = hz; b.Q.value = q
    const bg = c.createGain(); bg.gain.value = s
    o.connect(b).connect(bg).connect(g)
  }
  g.connect(ziel)
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.9, t0 + 0.25); g.gain.setValueAtTime(0.9, t0 + dauer - 0.4); g.gain.linearRampToValueAtTime(0, t0 + dauer)
  o.start(t0); vib.start(t0); o.stop(t0 + dauer + 0.1); vib.stop(t0 + dauer + 0.1)
  return t0 + dauer + 3
}

/** Kuhglocken: einige metallische Schläge in unregelmässigem Abstand */
function glocken(c: AudioContext, ziel: GainNode, t0: number) {
  const zahl = 3 + Math.floor(Math.random() * 6), grund = 520 + Math.random() * 260
  let t = t0
  for (let i = 0; i < zahl; i++) {
    for (const [mal, s] of [[1, 0.5], [2.4, 0.3], [3.9, 0.18], [5.4, 0.1]] as const) {
      const o = c.createOscillator(); o.frequency.value = grund * mal
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(s * 0.35, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5)
      o.connect(g).connect(ziel); o.start(t); o.stop(t + 0.55)
    }
    t += 0.25 + Math.random() * 0.7
  }
  return t + 2
}

/** ein Traktor: tiefes Tuckern, kommt näher und entfernt sich */
function traktor(c: AudioContext, ziel: GainNode, t0: number) {
  const dauer = 14 + Math.random() * 8, takt = 11 + Math.random() * 4
  const o = c.createOscillator(); o.type = 'square'; o.frequency.value = takt * 2.5
  const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = takt * 5
  const tief = c.createBiquadFilter(); tief.type = 'lowpass'; tief.frequency.value = 220
  const klopf = c.createOscillator(); klopf.frequency.value = takt
  const kg = c.createGain(); kg.gain.value = 0.35
  const g = c.createGain(); g.gain.value = 0
  const am = c.createGain(); am.gain.value = 0.65
  klopf.connect(kg).connect(am.gain)
  o.connect(tief); o2.connect(tief); tief.connect(am).connect(g).connect(ziel)
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.45, t0 + dauer * 0.4); g.gain.setValueAtTime(0.45, t0 + dauer * 0.55); g.gain.linearRampToValueAtTime(0, t0 + dauer)
  for (const q of [o, o2, klopf]) { q.start(t0); q.stop(t0 + dauer + 0.1) }
  return t0 + dauer + 20
}

/** ein Flugzeug hoch oben: breites Rauschen, langsam an- und abschwellend und tiefer werdend */
function flugzeug(c: AudioContext, ziel: GainNode, t0: number) {
  const dauer = 22 + Math.random() * 10
  const r = rauschenSchleife(c, true), w = rauschenSchleife(c, false)
  const tief = c.createBiquadFilter(); tief.type = 'lowpass'; tief.frequency.setValueAtTime(900, t0); tief.frequency.linearRampToValueAtTime(380, t0 + dauer)
  const wg = c.createGain(); wg.gain.value = 0.2
  const g = c.createGain(); g.gain.value = 0
  r.connect(tief); w.connect(wg).connect(tief); tief.connect(g).connect(ziel)
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.35, t0 + dauer * 0.45); g.gain.linearRampToValueAtTime(0, t0 + dauer)
  r.start(t0); w.start(t0); r.stop(t0 + dauer + 0.1); w.stop(t0 + dauer + 0.1)
  return t0 + dauer + 60
}

/** eine Krähe, das ganze Jahr: zwei bis vier rauhe «Kraa» */
function kraehe(c: AudioContext, ziel: GainNode, t0: number) {
  const zahl = 2 + Math.floor(Math.random() * 3), f0 = 520 + Math.random() * 120
  let t = t0
  for (let i = 0; i < zahl; i++) {
    const d = 0.28 + Math.random() * 0.12
    const o = c.createOscillator(); o.type = 'sawtooth'
    o.frequency.setValueAtTime(f0 * 1.1, t); o.frequency.linearRampToValueAtTime(f0 * 0.85, t + d)
    // rauh: schnelles Zittern der Tonhöhe
    const z = c.createOscillator(); z.type = 'square'; z.frequency.value = 70; const zg = c.createGain(); zg.gain.value = 40; z.connect(zg).connect(o.frequency)
    const b1 = c.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = 1400; b1.Q.value = 2.5
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7, t + 0.03); g.gain.setValueAtTime(0.7, t + d - 0.08); g.gain.linearRampToValueAtTime(0, t + d)
    o.connect(b1).connect(g).connect(ziel)
    o.start(t); z.start(t); o.stop(t + d + 0.05); z.stop(t + d + 0.05)
    t += d + 0.2 + Math.random() * 0.3
  }
  return t + 4
}
