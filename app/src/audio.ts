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
export function zuggeraeuschTempo(ms: number | null, bisZielS = Infinity, ort: GeraeuschOrt = null) {
  const v = stand.an && stand.zuggeraeusch && ms ? klangTempo(Math.max(0, ms)) : 0
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
    g.laut.gain.setTargetAtTime(ort === 'tunnel' ? 1.7 : ort === 'bruecke' ? 1.2 : 1, t0, 0.3)
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
