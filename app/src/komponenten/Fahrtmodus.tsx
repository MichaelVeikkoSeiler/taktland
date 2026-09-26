import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { neuLadenSperren } from '../serviceWorker'
import { useAudio } from '../audio'
import { useEinstellungen } from '../einstellungen'
import { abstand, type FahrObjekt, type Fahrweg, GIPFEL_M, KGS_M, lageBei, projizieren, SEE_M, SEE_QUER_M, SEILBAHN_M, type SehenswertSorte, type Ton, wegEnde } from '../fahrt'
import { spurMerken } from '../ohneziel'
import { type Zug, zuegeSuchen, zugLaden, zugName, type Zugsuche, zeitVon } from '../fahrplan'
import type { GemerkterZug } from '../laufend'
import { ZugAnzeige, ZugFrage } from './Zug'
import { freigabeHilfe } from '../umgebung'
import { FahrtKarte, FARBE, Ring, RING_S, Streckenband, TunnelBalken } from './FahrtAnzeige'
import { Auswahl } from './Auswahl'
import { kategorieUmschalten, KurzLang, LANGFORM, useVersteckt } from './Sehenswert'
import { Pikto } from './Pikto'
import { Bahnhof } from './Bahnhof'
import type { IndexEintrag } from '../typen'

/** So viele Sekunden vor einem Objekt kann die Meldung kommen; die erste gilt ohne Wahl */
const VORLAEUFE_S = [20, 10] as const
type Vorlauf = typeof VORLAEUFE_S[number]
/** Wie viel schneller die Probefahrt läuft; wählbar (Michael, 2026-09-26) */
/** 1 = Echtzeit bei PROBE_TEMPO; 1 und 200 dazu (Michael, 2026-09-27); 2, 4 und 8 statt 5, 10 und 100 (Michael, 2026-10-10:
 *  «doppelte, vierfache, achtfache Geschwindigkeit») */
const ZEITRAFFER = [1, 2, 4, 8, 20, 50, 200] as const
type Zeitraffer = typeof ZEITRAFFER[number]
/** Was so viele Sekunden vor dem Zug liegt, steht als eigene Karte oben */
const ZUGLEICH_S = 40
/** Tempo der Probefahrt, 100 km/h */
const PROBE_TEMPO = 100 / 3.6
/** Probefahrt: so lange fährt der Zug an und bremst vor dem Ziel, in Millisekunden echter Zeit */
const ANFAHREN_MS = 2000
/** so oft zeichnet die Probefahrt die Anzeige neu, Millisekunden */
const ANZEIGE_PROBE_MS = 33
/** Brücken ab dieser Länge zeigen beim Überfahren «Überfahrt» mit Balken */
const UEBERFAHRT_AB_M = 50
/** «Angekommen in …» so viele Sekunden vor dem Anhalten */
const ANKUNFT_VOR_S = 2
/** Langsamer gilt als Stillstand: keine Zeitangabe */
const STEHT_UNTER = 3
/** So nah am Punkt eines Bahnhofs gilt ein stehender Zug als «am Bahnhof», Meter; grosse
 *  Bahnhöfe sind lang, der Punkt liegt nicht, wo der Zug hält (Michael, 2026-09-29: Bern) */
const AM_BAHNHOF_M = 1000
/** so weit hinter dem Ende des Perrons gilt ein Bahnhof noch als gehalten, für GPS-Ungenauigkeit */
const HALT_NACH_M = 50
/** Weiter weg vom Weg gilt als «nicht auf dieser Strecke», mindestens */
const ABSEITS_M = 300
/** Ohne neuen Standort seit so vielen Sekunden gilt: kein GPS */
const OHNE_GPS_NACH_S = 8
/** So lange rechnet die Anzeige ohne GPS mit dem letzten Tempo weiter (Tunnel) */
const OHNE_GPS_MAX_S = 20 * 60
/** Im Tunnel und so weit vor dem Portal gelten nur genaue Standorte; ungenaue (Mobilfunk, WLAN)
 *  übergeht Taktland und zieht das Tempo von vor der Einfahrt weiter (Michael, 2026-10-06: «die vor
 *  der Tunneleinfahrt gemessene Geschwindigkeit … bei Empfangsverlust weiterziehen») */
const TUNNEL_VOR_M = 150, TUNNEL_NACH_M = 100, GENAU_IM_TUNNEL_M = 50
/** Tunnel ohne bekanntes Ende: so weit nach seinem Punkt gilt er als «drin» */
const TUNNEL_OHNE_ENDE_M = 500
/** «Ohne Ziel»: so nah am Ende des Wegs oder so lange daneben wird neu gesucht */
const AM_ENDE_M = 150
const NEU_SUCHEN_S = 20

export type BrueckenWahl = 'groessere' | 'alle' | 'keine'
/** Was die Meldung nennt: Zeit, Distanz oder beides (Michael, 2026-09-26: für
 *  sehbehinderte Menschen vielleicht besser Distanzen). Wann gemeldet wird, bleibt
 *  nach Zeit, damit in jedem Tempo gleich viel Zeit zum Reagieren bleibt. */
export type Angabe = 'zeit' | 'distanz' | 'beides'
/** Sehenswertes: jede Kategorie für sich ein- und ausschaltbar (Michael, 2026-09-26) */
type SehenswertWahl = Record<SehenswertSorte, boolean>
const SORTEN: Array<[SehenswertSorte, string, string]> = [
  ['gipfel', 'Gipfel melden', 'Gipfel melden'], ['kgs', 'Kultur melden', 'Kulturgüter melden'],
  ['seilbahn', 'Seilbahnen melden', 'Seilbahnen melden'],
  ['flaeche', 'Gebiete melden (BLN, Pärke, Moorlandschaften)', 'Gebiete melden (BLN, Pärke, Moorlandschaften)'],
]
const EINSTELLUNG = 'taktland.fahrt.v1'

/** bahnuebergaenge: am Anfang aus, es sind viele (Michael, 2026-10-01) */
interface Einstellung { tunnel: boolean; bruecken: BrueckenWahl; bahnhoefe: boolean; sehenswert: SehenswertWahl
                        bahnuebergaenge: boolean; vorlauf: Vorlauf; ton: boolean; angabe: Angabe }

function einstellungLesen(): Einstellung {
  try {
    const x = JSON.parse(localStorage.getItem(EINSTELLUNG) ?? '{}')
    return { bruecken: ['groessere', 'alle', 'keine'].includes(x.bruecken) ? x.bruecken : 'groessere',
             tunnel: x.tunnel !== false, bahnhoefe: x.bahnhoefe !== false, bahnuebergaenge: x.bahnuebergaenge === true,
             sehenswert: Object.fromEntries(SORTEN.map(([k]) => [k, x.sehenswert?.[k] !== false])) as SehenswertWahl,
             vorlauf: VORLAEUFE_S.includes(x.vorlauf) ? x.vorlauf : VORLAEUFE_S[0], ton: x.ton !== false,
             angabe: ['zeit', 'distanz', 'beides'].includes(x.angabe) ? x.angabe : 'zeit' }
  } catch {
    return { tunnel: true, bruecken: 'groessere', bahnhoefe: true, bahnuebergaenge: false, sehenswert: { gipfel: true, kgs: true, seilbahn: true, flaeche: true }, vorlauf: VORLAEUFE_S[0], ton: true, angabe: 'zeit' }
  }
}

/** Sehenswertes, das nicht mehr gemeldet wird (Michael, 2026-09-29: in Bern als Pendler
 *  «immer die gleichen kulturellen und sehenswerten Sachen»): Schlüssel → Name */
const STUMM = 'taktland.fahrt.stumm.v1'
function stummLesen(): Record<string, string> {
  try {
    const x = JSON.parse(localStorage.getItem(STUMM) ?? '{}')
    return x && typeof x === 'object' && !Array.isArray(x) ? x : {}
  } catch { return {} }
}
/** Nach Sorte, Name und Lage, nicht nach der Kennung: die zählt bei Gipfeln nur durch */
function stummSchluessel(o: FahrObjekt): string | null {
  const x = o.sehenswert
  if (!x) return null
  return [x.sorte, x.name, x.lage ? `${x.lage.lat.toFixed(4)},${x.lage.lon.toFixed(4)}` : ''].join('|')
}

function einstellungMerken(e: Einstellung) {
  try { localStorage.setItem(EINSTELLUNG, JSON.stringify(e)) } catch { /* ohne Speicher gilt es bis zum Schluss */ }
}

/** Was die App zu einem Objekt anzeigt, aus den Übersichten */
export interface ObjektText {
  name: string
  zeile: string
  baueinheiten: number | null
  /** Brücken aus swissTLM3D: auf der Karte mindestens 100 m lang gezeichnet */
  gross?: boolean
  /** Brücken: «etwa 380 m laut Zeichnung von swisstopo», wo swissTLM3D Anfang und Ende hergibt */
  laenge?: string | null
}

interface Stand {
  /** Stelle auf dem Weg beim letzten Standort, Meter */
  s: number
  /** Tempo, Meter pro Sekunde */
  v: number
  /** Zeit des letzten Standorts, Millisekunden (in der Probefahrt die Spielzeit) */
  t: number
  genau: number | null
  abseits: number | null
}

const ART: Record<FahrObjekt['art'], string> = { tunnel: 'Tunnel', bruecke: 'Brücke', bahnhof: 'Bahnhof',
                                                  sehenswert: 'Sehenswert', bahnuebergang: 'Bahnübergang' }
/** «Kulturgut · links», «Landschaft (BLN)», «Tunnel» */
/** In der Anzeige: auf dem Handy kurz, ab Tablet ausgeschrieben */
function ArtText({ o }: { o: FahrObjekt }) {
  if (!o.sehenswert) return <>{artText(o)}</>
  const a = o.sehenswert.art
  return <><KurzLang kurz={a} lang={LANGFORM[a] ?? a} />{o.sehenswert.seite ? ` · ${o.sehenswert.seite}` : ''}</>
}
const artText = (o: FahrObjekt) => o.sehenswert
  ? `${o.sehenswert.art}${o.sehenswert.seite ? ` · ${o.sehenswert.seite}` : ''}`
  : o.tlm?.art === 'galerie' ? 'Galerie' : ART[o.art]

type Meldung =
  | { art: 'sucht' } | { art: 'verweigert' } | { art: 'ohneGps' } | { art: 'fehler'; text: string }

/**
 * Der Fahrtmodus über der Seite «Strecke». Er zeigt das nächste Objekt und
 * meldet es mit einem Ton etwa 20 oder 10 Sekunden vorher. Nur solange die Seite
 * offen ist: Ein Browser darf im Hintergrund nicht weiterrechnen.
 */
export function Fahrtmodus({ fahrweg, text, probefahrt, piepen, titel, beenden, durchfahren, fortsetzen, stelle, ohneZiel,
                            zugStrecke, zugAnfang, zugGewaehlt, halt, bahnhofSeite, startKennung, retour }: {
  fahrweg: Fahrweg
  text: (o: FahrObjekt) => ObjektText | undefined
  probefahrt: boolean
  piepen: Ton
  titel: string
  /** mit allem, was seit dem ersten Standort durchfahren wurde, in Fahrtrichtung */
  beenden: (durchfahren: FahrObjekt[]) => void
  /** gleich beim Durchfahren, damit nichts verloren geht, wenn die Seite zugeht */
  durchfahren: (o: FahrObjekt) => void
  /** Fortgesetzte Fahrt: Stelle beim ersten und beim letzten Standort vor dem Schliessen */
  fortsetzen?: { startS: number; s: number } | null
  /** die Stelle, damit die Fahrt nach dem Schliessen weitergehen kann */
  stelle?: (startS: number, s: number) => void
  /** «Ohne Ziel»: am Ende des Wegs oder lange daneben neu suchen */
  ohneZiel?: () => void
  /** Start und Ziel als UIC: Dann fragt der Fahrtmodus «In welchem Zug sitzt du?» */
  zugStrecke?: { von: number; nach: number } | null
  /** beim Fortsetzen: der vorher gewählte Zug */
  zugAnfang?: GemerkterZug | null
  zugGewaehlt?: (z: Zug | null) => void
  /** Bahnhof im Fahrplan (UIC) → Kürzel auf dem Weg und Name */
  halt?: (uic: number) => { abk: string | undefined; name: string }
  /** Bahnhof auf dem Weg → seine Seite in Taktland, falls es eine gibt */
  bahnhofSeite?: (o: FahrObjekt) => { uic: number; eintrag: IndexEintrag | undefined } | null
  /** Kürzel des Startbahnhofs: Er steht nicht unter den Objekten, der Zug steht aber oft dort */
  startKennung?: string
  /** nur in der Probefahrt: dieselbe Strecke in Gegenrichtung */
  retour?: () => void
}) {
  const [einstellung, setEinstellung] = useState(einstellungLesen)
  const [stumm, setStumm] = useState(stummLesen)
  const stummSetzen = (neu: Record<string, string>) => {
    setStumm(neu)
    try { localStorage.setItem(STUMM, JSON.stringify(neu)) } catch { /* ohne Speicher gilt es bis zum Schluss */ }
  }
  // «Welcher Zug?»: nur im Zug, nie in der Probefahrt; Taktland nimmt nie selbst einen Zug an
  const [zugsuche, setZugsuche] = useState<Zugsuche | null>(null)
  const [zug, setZug] = useState<Zug | null>(null)
  const [frageOffen, setFrageOffen] = useState(!zugAnfang)
  useEffect(() => {
    if (probefahrt || !zugStrecke) return
    let ab = false
    if (zugAnfang) void zugLaden(zugAnfang).then((z) => { if (!ab) setZug(z) })
    void zuegeSuchen(zugStrecke.von, zugStrecke.nach).then((s) => { if (!ab) setZugsuche(s) })
    return () => { ab = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function zugWaehlen(z: Zug | null) {
    setZug(z)
    setFrageOffen(false)
    zugGewaehlt?.(z)
  }
  // Sehenswertes bringt seinen Text selbst mit
  const textVon = (o: FahrObjekt): ObjektText | undefined => o.sehenswert
    ? { name: o.sehenswert.name, zeile: o.sehenswert.zeile, baueinheiten: null } : text(o)
  const [stand, setStand] = useState<Stand | null>(null)
  const [meldung, setMeldung] = useState<Meldung | null>({ art: 'sucht' })
  const [jetzt, setJetzt] = useState(0)
  const [gegenrichtung, setGegenrichtung] = useState(false)
  const standRef = useRef<Stand | null>(null)
  const gemeldet = useRef(new Set<string>())
  // welche Töne schon klangen: «art kennung@20» (Einstellungen → Audio, zweimal 20 und 10 s)
  const getoent = useRef(new Set<string>())
  const audio = useAudio()
  const ansage = useRef<HTMLParagraphElement | null>(null)
  // Stelle beim ersten Standort: was davor liegt, ist nicht durchfahren
  const startS = useRef<number | null>(fortsetzen?.startS ?? null)
  // fortgesetzt: was vor dem Schliessen durchfahren war, steht schon im Sammelheft
  const hinter = useRef<FahrObjekt[]>(fortsetzen
    ? fahrweg.objekte.filter((o) => o.art !== 'sehenswert' && o.s > fortsetzen.startS && o.s <= fortsetzen.s)
    : [])
  const gemerktUm = useRef(0)
  const uhrStart = useRef({ echt: Date.now(), spiel: 0, anfahren: false })
  const [raffer, setRaffer] = useState<Zeitraffer>(20)
  const rafferRef = useRef<Zeitraffer>(20)
  // Probefahrt anhalten und weiterfahren (Michael, 2026-09-26: «unterbrechen und wieder starten»)
  // eine Probefahrt wartet auf «Start» (Michael, 2026-10-08: «nicht automatisch starten»)
  const [angehalten, setAngehalten] = useState(probefahrt)
  const angehaltenRef = useRef(probefahrt)
  const [gestartet, setGestartet] = useState(!probefahrt)
  /** In der Probefahrt läuft die Zeit schneller; angehalten steht sie. Nach «Start» und «Weiter» fährt der Zug in
   *  ANFAHREN_MS an, vor dem Ziel bremst er ebenso lang (Michael, 2026-10-09: «langsam anfährt und in 2 sec die normale
   *  Geschwindigkeit erreicht. Am Schluss ebenso abbremsen»): die Spielzeit läuft dann langsamer */
  const uhr = () => {
    if (!probefahrt) return Date.now()
    const u = uhrStart.current, f = rafferRef.current
    if (angehaltenRef.current) return u.spiel
    const e = Date.now() - u.echt
    // anfahren: in ANFAHREN_MS gleichmässig von 0 auf volle Fahrt
    const t = u.spiel + f * (u.anfahren && e < ANFAHREN_MS ? (e * e) / (2 * ANFAHREN_MS) : e - (u.anfahren ? ANFAHREN_MS / 2 : 0))
    // bremsen: so, dass der Zug nach ANFAHREN_MS am Ende des Wegs steht
    const ziel = (wegEnde(fahrweg) / PROBE_TEMPO) * 1000, ab = ziel - (f * ANFAHREN_MS) / 2
    if (t <= ab || u.spiel >= ab) return Math.min(t, ziel)
    const tau = (t - ab) / f
    return tau >= ANFAHREN_MS ? ziel : ab + f * (tau - (tau * tau) / (2 * ANFAHREN_MS))
  }
  /** Anteil der vollen Probefahrt-Geschwindigkeit jetzt, für die Schätzung des Tempos */
  const fahrtAnteil = () => {
    if (!probefahrt || angehaltenRef.current) return 0
    const d = 50, a = uhr()
    const u = uhrStart.current
    uhrStart.current = { ...u, echt: u.echt - d }
    const b = uhr()
    uhrStart.current = u
    return Math.max(0, Math.min(1, (b - a) / (d * rafferRef.current)))
  }
  function anhaltenUmschalten() {
    uhrStart.current = { echt: Date.now(), spiel: uhr(), anfahren: angehaltenRef.current }
    angehaltenRef.current = !angehaltenRef.current
    setAngehalten(angehaltenRef.current)
    if (!angehaltenRef.current) setGestartet(true)
  }

  /** Probefahrt: an eine Stelle springen, vorwärts oder zurück (Michael,
   *  2026-09-26: «den Zug als Regler verschieben»). Was hinter der neuen Stelle
   *  liegt, gilt als nicht gemeldet und wird wieder gemeldet. */
  function springen(s: number) {
    const t = (s / PROBE_TEMPO) * 1000
    uhrStart.current = { echt: Date.now(), spiel: t, anfahren: false }
    for (const o of fahrweg.objekte) {
      if (o.s > s) {
        gemeldet.current.delete(`${o.art} ${o.kennung}`)
        for (const m of [20, 10, ...VORLAEUFE_S]) getoent.current.delete(`${o.art} ${o.kennung}@${m}`)
      }
    }
    hinter.current = hinter.current.filter((o) => o.s <= s)
    if (startS.current !== null && s < startS.current) startS.current = s
    // wie ein erster Standort: keine Gegenrichtung, Tempo der Probefahrt
    standRef.current = null
    setGegenrichtung(false)
    const l = lageBei(fahrweg, s)
    standort(t, l.lat, l.lon, 10, PROBE_TEMPO)
    setJetzt(t)
  }

  /** Probefahrt von vorn (Michael, 2026-09-30: «Eine Probefahrt soll man wiederholen können») */
  function vonVorn() {
    springen(0)
    setAnkunft(null)
    if (angehaltenRef.current) anhaltenUmschalten()
  }

  /** Tempo der Probefahrt wechseln, ohne dass der Zug springt */
  function rafferWaehlen(f: Zeitraffer) {
    uhrStart.current = { echt: Date.now(), spiel: uhr(), anfahren: false }
    rafferRef.current = f
    setRaffer(f)
  }

  function aendern(neu: Partial<Einstellung>) {
    const e = { ...einstellung, ...neu }
    setEinstellung(e)
    einstellungMerken(e)
  }

  // Ein Standort kommt an: auf den Weg legen, Tempo nachführen
  function standort(t: number, lat: number, lon: number, genau: number | null, tempo: number | null) {
    const alt = standRef.current
    // im Tunnel: einen ungenauen Standort übergehen, die Schätzung mit dem Tempo von vorher läuft weiter
    if (alt && alt.abseits === null && (genau === null || genau > GENAU_IM_TUNNEL_M)) {
      const geschaetzt = alt.s + alt.v * Math.max(0, (t - alt.t) / 1000)
      const imTunnel = fahrweg.objekte.some((o) => o.art === 'tunnel'
        && geschaetzt >= o.s - TUNNEL_VOR_M && geschaetzt <= (o.sAus ?? o.s + TUNNEL_OHNE_ENDE_M) + TUNNEL_NACH_M)
      if (imTunnel) return
    }
    const fenster = alt && alt.abseits === null ? [alt.s - 3000, alt.s + 30_000] : [-Infinity, Infinity]
    let p = projizieren(fahrweg, { lat, lon }, fenster[0], fenster[1])
    if (p.abstand > Math.max(ABSEITS_M, 2 * (genau ?? 0)) && alt) p = projizieren(fahrweg, { lat, lon })
    const abseits = p.abstand > Math.max(ABSEITS_M, 2 * (genau ?? 0)) ? p.abstand : null
    // schon beim ersten Standort das Tempo des Geräts, sonst «steht» bis zum nächsten
    // (Göschenen – Airolo: gleich nach dem Start im Tunnel, dort kommt keiner mehr)
    let v = alt?.v ?? (tempo !== null && tempo >= 0 ? tempo : 0)
    if (alt && abseits === null && t > alt.t) {
      const gemessen = (p.s - alt.s) / ((t - alt.t) / 1000)
      const neu = tempo !== null && tempo >= 0 ? tempo : Math.max(0, gemessen)
      v = alt.v ? 0.6 * alt.v + 0.4 * neu : neu
      if (p.s < alt.s - 300) setGegenrichtung(true)
      else if (p.s > alt.s + 300) setGegenrichtung(false)
    }
    const s: Stand = { s: abseits === null ? p.s : alt?.s ?? p.s, v, t, genau, abseits }
    standRef.current = s
    setStand(s)
    setMeldung(null)
  }

  // Echter Standort
  // während der Fahrt lädt die App nicht von selbst neu, auch bei einer neuen Version
  useEffect(() => neuLadenSperren(), [])

  useEffect(() => {
    if (probefahrt) return
    if (!('geolocation' in navigator)) {
      setMeldung({ art: 'fehler', text: 'Dieser Browser gibt keinen Standort heraus.' })
      return
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        standort(Date.now(), pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.coords.speed)
        if (ohneZiel) spurMerken({ lat: pos.coords.latitude, lon: pos.coords.longitude, genau: pos.coords.accuracy,
                                   t: Date.now() })
      },
      (err) => setMeldung(err.code === err.PERMISSION_DENIED ? { art: 'verweigert' }
        : { art: 'fehler', text: 'Der Standort ist gerade nicht zu bekommen.' }),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probefahrt, fahrweg])

  // Probefahrt: ein Standort pro halber Sekunde, im Tunnel keiner, wie im Zug
  useEffect(() => {
    if (!probefahrt) return
    uhrStart.current = { echt: Date.now(), spiel: 0, anfahren: false }
    const id = window.setInterval(() => {
      if (angehaltenRef.current) return
      const t = uhr()
      const s = Math.min(wegEnde(fahrweg), PROBE_TEMPO * t / 1000)
      const imTunnel = fahrweg.objekte.some((o) => o.art === 'tunnel' && o.sAus !== null && s > o.s + 50 && s < o.sAus - 50)
      if (imTunnel) return
      const l = lageBei(fahrweg, s)
      standort(t, l.lat, l.lon, 10, PROBE_TEMPO * fahrtAnteil())
    }, 500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probefahrt, fahrweg])

  // Die Anzeige läuft weiter, auch ohne neuen Standort: im Zug jede halbe Sekunde,
  // in der Probefahrt etwa 30-mal pro Sekunde, damit der Punkt bei hohem Tempo
  // gleitet statt springt (Michael, 2026-09-27: «springt immer von Stelle zu Stelle»)
  useEffect(() => {
    if (!probefahrt) {
      const id = window.setInterval(() => setJetzt(uhr()), 500)
      return () => window.clearInterval(id)
    }
    let bild = 0, zuletzt = 0
    const weiter = (zeit: number) => {
      if (zeit - zuletzt >= ANZEIGE_PROBE_MS) { zuletzt = zeit; setJetzt(uhr()) }
      bild = requestAnimationFrame(weiter)
    }
    bild = requestAnimationFrame(weiter)
    return () => cancelAnimationFrame(bild)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probefahrt])

  // Bildschirm anlassen, solange der Fahrtmodus läuft, ausser unter Einstellungen
  // abgeschaltet (Michael, 2026-10-01)
  const { wach } = useEinstellungen()
  useEffect(() => {
    if (!wach) return
    let sperre: WakeLockSentinel | null = null
    const holen = () => {
      if (document.visibilityState === 'visible' && 'wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then((x) => { sperre = x }).catch(() => undefined)
      }
    }
    holen()
    document.addEventListener('visibilitychange', holen)
    return () => {
      document.removeEventListener('visibilitychange', holen)
      void sperre?.release()
    }
  }, [wach])

  // Geschätzte Stelle jetzt: seit dem letzten Standort mit dem letzten Tempo weiter
  const seit = stand ? Math.max(0, (jetzt - stand.t) / 1000) : 0
  // in der Probefahrt vergehen zwischen zwei Standorten 10 Sekunden Spielzeit
  const ohneGps = stand !== null && seit > OHNE_GPS_NACH_S * (probefahrt ? raffer : 1)
  const sJetzt = stand && stand.abseits === null
    ? Math.min(wegEnde(fahrweg), stand.s + (seit < OHNE_GPS_MAX_S ? stand.v * seit : 0))
    : null
  const faehrt = stand !== null && stand.v >= STEHT_UNTER
  // die letzten Standorte, um die Bremsung vor dem Ziel zu schätzen
  const letzteStaende = useRef<Array<{ v: number; t: number }>>([])
  useEffect(() => {
    if (stand) letzteStaende.current = [...letzteStaende.current.slice(-3), { v: stand.v, t: stand.t }]
  }, [stand])

  const gewaehlt = useMemo(() => fahrweg.objekte.filter((o) => {
    if (o.art === 'tunnel') return einstellung.tunnel
    if (o.art === 'bahnhof') return einstellung.bahnhoefe
    if (o.art === 'bahnuebergang') return einstellung.bahnuebergaenge
    if (o.art === 'sehenswert') {
      return o.sehenswert ? einstellung.sehenswert[o.sehenswert.sorte] && !(stummSchluessel(o)! in stumm) : false
    }
    if (einstellung.bruecken === 'keine') return false
    if (einstellung.bruecken === 'alle') return true
    return (text(o)?.baueinheiten ?? 0) >= 3 || text(o)?.gross === true
  }), [fahrweg, einstellung.tunnel, einstellung.bruecken, einstellung.bahnhoefe, einstellung.bahnuebergaenge,
        einstellung.sehenswert, stumm, text])

  // auch ohne Meldung der Tunnel: Im Tunnel fehlt das GPS, das sagt die Anzeige
  const imTunnel = sJetzt === null ? null
    : fahrweg.objekte.find((o) => o.art === 'tunnel' && o.sAus !== null && sJetzt >= o.s && sJetzt <= o.sAus) ?? null
  // Überfahrt einer Brücke mit bekannter Länge, wie «Im Tunnel» (Michael, 2026-09-30:
  // «analog bei einer Durchfahrt eines Tunnels … Also Überfahrt»); kurze Brücken nicht,
  // die wären nach einer Sekunde vorbei
  const aufBruecke = sJetzt === null || imTunnel ? null
    : gewaehlt.find((o) => o.art === 'bruecke' && o.sAus !== null && o.sAus - o.s >= UEBERFAHRT_AB_M
                           && sJetzt >= o.s && sJetzt <= o.sAus) ?? null
  // Flächen, durch die der Weg gerade führt (Michael, 2026-09-26: «du fährst durch …»)
  const inFlaechen = sJetzt === null ? []
    : gewaehlt.filter((o) => o.sehenswert?.sorte === 'flaeche' && sJetzt >= o.s && sJetzt <= o.sAus!)
  const kommend = sJetzt === null ? [] : gewaehlt.filter((o) => o.s > sJetzt)
  // Steht der Zug an einem Bahnhof, lässt sich dessen Seite öffnen (Michael,
  // 2026-09-29: «während dem Stillstand … die hinterlegten Infos nachschauen»)
  const [offenerBahnhof, setOffenerBahnhof] = useState<{ uic: number; eintrag: IndexEintrag | undefined } | null>(null)
  const bahnhofSchliessen = useCallback(() => setOffenerBahnhof(null), [])
  const amBahnhof = (() => {
    if (sJetzt === null || !bahnhofSeite || (probefahrt ? !angehalten : faehrt)) return null
    let best: FahrObjekt | null = null
    const start: FahrObjekt[] = startKennung ? [{ art: 'bahnhof', kennung: startKennung, s: 0, sAus: null }] : []
    for (const o of [...start, ...fahrweg.objekte]) {
      if (o.art !== 'bahnhof' || Math.abs(o.s - sJetzt) > AM_BAHNHOF_M) continue
      if (!best || Math.abs(o.s - sJetzt) < Math.abs(best.s - sJetzt)) best = o
    }
    const seite = best ? bahnhofSeite(best) : null
    return best && seite ? { o: best, seite } : null
  })()
  // Ankunft am Ziel (Michael, 2026-09-29): in der Perronzone des Ziels, und der Zug
  // steht; einmal, mit eigenem Ton und grosser Karte
  const zielName = titel.split(' → ')[1] ?? ''
  const amZiel = !ohneZiel && sJetzt !== null && sJetzt >= wegEnde(fahrweg) - (fahrweg.ziel_m ?? AM_ENDE_M)
  // etwa 2 s vor dem Anhalten (Michael, 2026-09-30); das GPS meldet den Stillstand erst
  // hinterher. Im Zug aus Tempo und Bremsung der letzten Standorte, sonst der Stillstand;
  // in der Probefahrt an derselben Stelle wie im Zug, 2 s gespielter Zeit vor dem Ende; im
  // Zeitraffer entsprechend kürzer auf dem Bildschirm (Michael, 2026-09-30: «ca 0.3 Sek»)
  const bremsung = (() => {
    const l = letzteStaende.current
    if (l.length < 2) return null
    const dt = (l[l.length - 1].t - l[0].t) / 1000
    const a = dt > 0 ? (l[0].v - l[l.length - 1].v) / dt : 0
    return a > 0.05 ? a : null
  })()
  const haeltGleich = stand !== null && bremsung !== null && stand.v / bremsung <= ANKUNFT_VOR_S
  const angekommen = amZiel && (probefahrt
    ? angehalten || (stand !== null && stand.v > 0
        ? (wegEnde(fahrweg) - sJetzt!) / stand.v <= ANKUNFT_VOR_S : sJetzt! >= wegEnde(fahrweg) - 1)
    : !faehrt || haeltGleich)
  const [ankunft, setAnkunft] = useState<'offen' | 'weg' | null>(null)
  useEffect(() => {
    if (!angekommen || ankunft !== null) return
    setAnkunft('offen')
    if (einstellung.ton) piepen('ankunft')
    if (ansage.current) ansage.current.textContent = `Angekommen in ${zielName}.`
  })
  const fahrtBeenden = () => beenden([...hinter.current].sort((a, b) => a.s - b.s))
  const ankunftKarte = ankunft === 'offen' && (
    <div className="mt-3 rounded-lg bg-fahrt-bahnhof px-4 py-5 text-white" role="status">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide">
        <Pikto art="bahnhof" className="size-7" nurZeichen /> Am Ziel
      </p>
      <p className="mt-1 text-3xl font-bold leading-tight">Angekommen in {zielName}</p>
      {/* ein Knopf (Michael, 2026-10-02: «reicht es, wenn steht "Zur Bilanz"»);
          vorher Beenden, Weiterfahren oder Nochmals und Retour */}
      {/* in der Probefahrt «Zur Bilanz» über die ganze Breite, darunter Wiederholen und Retour */}
      <div className={`mt-4 grid gap-2 ${probefahrt && retour ? 'grid-cols-2' : ''}`}>
        <button type="button" onClick={fahrtBeenden}
                className={`rounded-lg bg-white px-2 py-2.5 font-bold text-sbb-black ${probefahrt && retour ? 'col-span-2' : ''}`}>
          Zur Bilanz
        </button>
        {/* Wiederholen und Retour nur in der Probefahrt (Michael, 2026-10-02) */}
        {probefahrt && (
          <button type="button" onClick={vonVorn}
                  className="rounded-lg border border-white/70 px-2 py-2.5 font-medium">
            Wiederholen
          </button>
        )}
        {retour && (
          <button type="button" onClick={retour}
                  className="rounded-lg border border-white/70 px-2 py-2.5 font-medium">
            Retour
          </button>
        )}
      </div>
    </div>
  )
  const bahnhofKnopf = amBahnhof && (
    <button type="button" onClick={() => setOffenerBahnhof(amBahnhof.seite)}
            className="kachel kachel-link mt-3 flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
      <span className="flex min-w-0 items-center gap-3">
        <Pikto art="bahnhof" className="size-8 shrink-0" />
        <span className="min-w-0">
          <span className="block text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">Zug steht bei</span>
          <span className="block truncate text-lg font-bold leading-tight">{textVon(amBahnhof.o)?.name}</span>
        </span>
      </span>
      <span className="shrink-0 font-medium">Infos <span aria-hidden="true">→</span></span>
    </button>
  )
  const eta = (o: FahrObjekt) => (sJetzt !== null && faehrt ? Math.max(0, o.s - sJetzt) / stand!.v : null)
  /** Meter bis zum Objekt entlang des gezeichneten Wegs; gilt auch, wenn der Zug steht */
  const bis = (o: FahrObjekt) => (sJetzt !== null ? Math.max(0, o.s - sJetzt) : null)
  const { angabe } = einstellung
  /** Sehenswertes: Luftlinie vom geschätzten Standort zum Objekt laut Quelle (Michael,
   *  2026-09-27), bei Seilbahnen zum Ende näher an der Strecke */
  const hierLage = sJetzt !== null ? lageBei(fahrweg, sJetzt) : null
  const luftlinie = (o: FahrObjekt) => {
    const l = o.sehenswert?.lage
    if (!l || !hierLage) return null
    return `Luftlinie ${o.sehenswert!.sorte === 'seilbahn' ? 'zum näheren Ende ' : ''}etwa ${strecke(abstand(hierLage, l))}`
  }
  /** Probefahrt: die Uhr läuft im Zeitraffer; angezeigt wird die Zeit, die wirklich vergeht,
   *  passend zum Tempo in km/h (Michael, 2026-09-27). Wann gemeldet wird, bleibt gleich. */
  const echt = (sekunden: number) => (probefahrt ? sekunden / raffer : sekunden)
  /** Tempo, wie es sich anfühlt: in der Probefahrt mal Zeitraffer */
  const kmhJetzt = () => {
    const k = Math.round(stand!.v * 3.6 * (probefahrt ? raffer : 1))
    return k > 9999 ? k.toLocaleString('de-CH') : String(k)
  }
  /** «in etwa 25 s», «in etwa 500 m» oder beides, wie gewählt; ohne Tempo nur die Distanz */
  const abstandText = (sekunden: number | null, meter: number | null) => {
    const z = sekunden !== null && angabe !== 'distanz' ? dauer(echt(sekunden)) : null
    const d = meter !== null && (angabe !== 'zeit' || sekunden === null) ? `in etwa ${strecke(meter)}` : null
    return z && d ? `${z} · ${strecke(meter!)}` : z ?? d
  }

  // Ein gemeldeter Bahnhof bleibt stehen, bis der Zug dort hält («Zug steht bei») oder das Ende
  // des Perrons hinter sich hat; solange wird nichts gemeldet, was danach kommt (Michael,
  // 2026-10-06). Der Zielbahnhof bleibt, bis «Am Ziel» erscheint. Gemeldet wird ein Bahnhof vor
  // der Mitte des Perrons (bahnhoefeVorziehen), das Ende liegt gleich weit dahinter.
  const rollt = probefahrt ? !angehalten : faehrt
  // wo der Zug schon gehalten hat: beim Weiterfahren aus dem Perron nicht nochmals «Gleich»
  const gehaltenBei = useRef(new Set<string>())
  const haltBahnhof = (() => {
    if (sJetzt === null) return null
    for (const o of gewaehlt) {
      if (o.art !== 'bahnhof' || sJetzt < o.s) continue
      const ort = o.sOrt ?? o.s
      const istZiel = !ohneZiel && ort >= wegEnde(fahrweg) - 1
      if (istZiel) { if (ankunft === null) return o; continue }
      if (sJetzt > ort + (ort - o.s) + HALT_NACH_M || gehaltenBei.current.has(o.kennung)) continue
      if (!rollt) { gehaltenBei.current.add(o.kennung); continue }
      return o
    }
    return null
  })()

  // Die Meldung: etwa 20 oder 10 Sekunden vorher, wie gewählt, jedes Objekt einmal
  useEffect(() => {
    for (const o of (haltBahnhof ? [] : kommend).slice(0, 5)) {
      const e = eta(o)
      const schluessel = `${o.art} ${o.kennung}`
      // der Ton: mit der Meldung oder, unter Audio gewählt, etwa 20 und 10 s vorher
      // (Michael, 2026-10-01); springt die Zeit über beide, klingt er nur einmal
      if (e !== null) {
        const faellig = (audio.zweimal ? [20, 10] : [einstellung.vorlauf])
          .filter((m) => e <= m && !getoent.current.has(`${schluessel}@${m}`))
        faellig.forEach((m) => getoent.current.add(`${schluessel}@${m}`))
        if (faellig.length && einstellung.ton) piepen(o.art)
      }
      if (e !== null && e <= einstellung.vorlauf && !gemeldet.current.has(schluessel)) {
        gemeldet.current.add(schluessel)
        // für Bildschirmleser: dieselbe Meldung als Satz, einmal
        const t = textVon(o)
        if (ansage.current && t) {
          const m = bis(o)
          const sek = `In etwa ${sekundenGerundet(echt(e))} ${sekundenGerundet(echt(e)) === 1 ? 'Sekunde' : 'Sekunden'}`
          ansage.current.textContent = (angabe === 'zeit' || m === null ? sek
            : angabe === 'distanz' ? `In etwa ${streckeGesprochen(m)}` : `${sek}, etwa ${streckeGesprochen(m, false)}`) + ': '
            + (o.sehenswert?.sorte === 'flaeche' ? `Du fährst durch ${t.name}, ${o.sehenswert.art}.`
              : `${artText(o).replace(/^Kultur\b/, 'Kulturgut').replace(' · ', ', ')}: ${t.name}. ${sprechbar(t.zeile)}`
                + (luftlinie(o) ? `. ${luftlinie(o)!.replace(/ km$/, ' Kilometer').replace(/ m$/, ' Meter')}.` : ''))
        }
      }
    }
  })

  // Durchfahren ist, was zwischen dem ersten Standort und jetzt liegt; alle
  // Objekte, auch solche, die nicht gemeldet werden
  useEffect(() => {
    if (sJetzt === null) return
    if (startS.current === null) startS.current = sJetzt
    for (const o of fahrweg.objekte) {
      // Sehenswertes kommt nicht ins Sammelheft: gesehen hat man es damit nicht
      if (o.art === 'sehenswert') continue
      if (o.s <= startS.current || o.s > sJetzt) continue
      if (hinter.current.includes(o)) continue
      hinter.current.push(o)
      durchfahren(o)
    }
    // höchstens alle 5 Sekunden, und nur vorwärts
    if (stelle && Date.now() - gemerktUm.current > 5000) {
      gemerktUm.current = Date.now()
      stelle(startS.current, Math.max(sJetzt, fortsetzen?.s ?? 0))
    }
  })

  // «Ohne Ziel»: am Ende der erkannten Linie oder nach NEU_SUCHEN_S daneben
  // (anderer Zweig an einer Verzweigung) die Linie neu suchen
  const abseitsSeit = useRef<number | null>(null)
  const neuGesucht = useRef(false)
  useEffect(() => {
    if (!ohneZiel || neuGesucht.current || !stand) return
    if (stand.abseits === null) abseitsSeit.current = null
    else abseitsSeit.current ??= Date.now()
    const amEnde = sJetzt !== null && sJetzt >= wegEnde(fahrweg) - AM_ENDE_M
    const daneben = abseitsSeit.current !== null && Date.now() - abseitsSeit.current > NEU_SUCHEN_S * 1000
    if (amEnde || daneben) {
      neuGesucht.current = true
      ohneZiel()
    }
  })

  // der nächste Halt des gewählten Zugs: der erste Halt nach dem Start, der
  // als Bahnhof vor dem Zug auf dem Weg liegt
  const naechsterHalt = (() => {
    if (!zug || !halt || !zugStrecke) return null
    const h = zug.fahrt.h
    const start = Math.max(0, h.findIndex((x) => x[0] === zugStrecke.von))
    for (let i = start + 1; i < h.length; i++) {
      const { abk, name } = halt(h[i][0])
      const o = fahrweg.objekte.find((x) => x.art === 'bahnhof' && x.kennung === abk)
      if (!o) continue
      if (sJetzt !== null && o.s <= sJetzt + 50) continue
      const min = h[i][1] ?? h[i][2]
      return { name, zeit: min === null ? null : zeitVon(zug, min) }
    }
    return null
  })()

  // während ein Bahnhof gehalten wird (oben), nur er: weder «nichts mehr zu melden» noch, was danach kommt
  const anzeige = haltBahnhof ? [haltBahnhof] : kommend
  const naechstes = anzeige[0]
  // Was in den nächsten 40 Sekunden kommt, läuft gleichzeitig, als Karten
  // übereinander (Michael, 2026-09-25); das erste immer, höchstens drei
  const zugleich = anzeige.filter((o, i) => i === 0 || (eta(o) ?? Infinity) <= ZUGLEICH_S).slice(0, 3)
  const danach = anzeige.slice(Math.max(1, zugleich.length))

  // als Funktion, nicht als Komponente: sonst entstünde die Karte bei jeder
  // neuen Zeit neu, und Ring und Farbe liefen nicht mehr weich
  function karte(o: FahrObjekt) {
    const bald = (eta(o) ?? Infinity) <= einstellung.vorlauf
    return (
      <div key={`${o.art} ${o.kennung}`} className={`flex items-center gap-4 rounded-lg border px-4 transition-all ${bald
        ? `${FARBE[o.art].flaeche} ${FARBE[o.art].schrift} py-7`
        : 'border-sbb-cloud bg-white py-4 dark:border-sbb-iron dark:bg-sbb-charcoal'}`}>
        <Ring bald={bald} art={o.art} anteil={eta(o) === null ? null : 1 - eta(o)! / RING_S}>
          {/* Steht der Zug, gibt es keine Zeit: dann die Distanz statt «steht», das neben
              einem Tunnel wie «der Tunnel steht» klang (Michael, 2026-09-30) */}
          {angabe !== 'distanz' && (eta(o) !== null || stand === null)
            ? <ZeitImRing sekunden={eta(o) === null ? null : echt(eta(o)!)} steht={false} />
            : <DistanzImRing meter={bis(o)} />}
        </Ring>
        <div className="min-w-0">
          <p className={`flex items-center gap-2 text-xs uppercase tracking-wide ${bald ? '' : 'text-sbb-metal dark:text-sbb-storm'}`}>
            {/* Pikto der Art (Michael, 2026-09-26); auf der farbigen Fläche nur das Zeichen */}
            {o.art !== 'sehenswert' && <Pikto art={o.art} className={bald ? 'size-8' : 'size-7'} nurZeichen={bald} />}
            <span>
              {bald ? 'Gleich' : o === naechstes ? 'Als Nächstes' : 'Kurz danach'} · <ArtText o={o} />
              {angabe === 'beides' && eta(o) !== null && bis(o) !== null && ` · etwa ${strecke(bis(o)!)}`}
            </span>
          </p>
          {o.sehenswert?.sorte === 'flaeche' && (
            <p className={`mt-1 ${bald ? '' : 'text-sbb-metal dark:text-sbb-storm'}`}>Du fährst durch</p>
          )}
          <p lang="de" className={`mt-1 font-bold leading-tight break-words hyphens-auto ${bald ? 'text-3xl' : 'text-2xl'}`}>
            {textVon(o)?.name}
          </p>
          <p className={`mt-1 ${bald ? '' : 'text-sbb-metal dark:text-sbb-storm'}`}>
            {textVon(o)?.zeile}
          </p>
          {luftlinie(o) && <p className="mt-1 font-medium tabular-nums">{luftlinie(o)}</p>}
          {o.sehenswert && o.sehenswert.sorte !== 'flaeche' && (
            <p className={`mt-1 text-sm ${bald ? '' : 'text-sbb-metal dark:text-sbb-storm'}`}>
              {o.sehenswert.seite === 'links' ? 'Links' : 'Rechts'} der Strecke laut Lage in der Quelle. Ob
              es zu sehen ist, sagen die Daten nicht.
            </p>
          )}
          {o.art === 'sehenswert' && (
            <button type="button"
                    onClick={() => stummSetzen({ ...stumm, [stummSchluessel(o)!]: textVon(o)?.name ?? '' })}
                    className={`mt-3 min-h-9 rounded-lg border px-3 text-sm font-medium ${bald
                      ? 'border-current' : 'border-sbb-cloud text-sbb-black dark:border-sbb-iron dark:text-sbb-white'}`}>
              Nicht mehr melden
            </button>
          )}
          {o.art === 'tunnel' && o.sAus === null && (
            <p className={`mt-1 text-sm ${bald ? '' : 'text-sbb-metal dark:text-sbb-storm'}`}>
              Wo er endet, geben die Daten nicht her.
            </p>
          )}
        </div>
      </div>
    )
  }

  // Im Vollbild der Karte das Nötigste (Michael, 2026-09-27: «die Grundfunktionen
  // anwählen», Tempo in km/h, Ein- und Ausblenden, «eine einfache Vorankündigung»)
  const kmh = (f: number) => (100 * f > 9999 ? (100 * f).toLocaleString('de-CH') : String(100 * f))
  const chip = (an: boolean) => `min-h-9 rounded-lg px-2.5 text-xs font-medium ${an
    ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
    : 'text-sbb-metal line-through bg-sbb-kachel dark:bg-sbb-charcoal dark:text-sbb-storm'}`
  const naechsteZeile = naechstes && (() => {
    const o = naechstes
    const bald = (eta(o) ?? Infinity) <= einstellung.vorlauf
    return (
      <div className={`flex items-center gap-3 rounded-lg px-3 py-2 ${bald
        ? `${FARBE[o.art].flaeche} ${FARBE[o.art].schrift}` : 'kachel'}`}>
        {o.art !== 'sehenswert' ? <Pikto art={o.art} className="size-8" nurZeichen={bald} />
          : <span className="size-8 shrink-0" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-xs uppercase tracking-wide ${bald ? '' : 'text-sbb-metal dark:text-sbb-storm'}`}>
            {bald ? 'Gleich' : 'Als Nächstes'} · <ArtText o={o} />
          </p>
          <p className="truncate text-lg font-bold leading-tight">{textVon(o)?.name}</p>
          {luftlinie(o) && <p className="truncate text-xs tabular-nums">{luftlinie(o)}</p>}
        </div>
        <span className="shrink-0 text-lg font-bold tabular-nums">
          {abstandText(eta(o), angabe === 'zeit' ? null : bis(o)) ?? ''}
        </span>
      </div>
    )
  })()
  const versteckt = useVersteckt()
  const sorteZeigen = (k: SehenswertSorte, an: boolean) => {
    aendern({ sehenswert: { ...einstellung.sehenswert, [k]: an } })
    // auch auf der Karte, dort heissen die Gebiete «gebiete»
    const kat = k === 'flaeche' ? 'gebiete' : k
    if (versteckt.has(kat) === an) kategorieUmschalten(kat)
  }
  const vollbildLeiste = (
    <div className="mt-2 space-y-2">
      {ankunftKarte}
      {bahnhofKnopf}
      {imTunnel && einstellung.tunnel && sJetzt !== null ? (
        <div className="flex items-center gap-3 rounded-lg bg-sbb-charcoal px-3 py-2 text-sbb-white">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-sbb-storm">Im Tunnel</p>
            <p className="truncate text-lg font-bold leading-tight">{textVon(imTunnel)?.name}</p>
          </div>
          <span className="shrink-0 font-bold tabular-nums">
            {faehrt || angabe !== 'zeit'
              ? `Ausfahrt ${abstandText(faehrt ? (imTunnel.sAus! - sJetzt) / stand!.v : null, imTunnel.sAus! - sJetzt)}`
              : 'Zug steht'}
          </span>
        </div>
      ) : aufBruecke && sJetzt !== null ? (
        <div className="flex items-center gap-3 rounded-lg bg-fahrt-bruecke px-3 py-2 text-sbb-black">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide">Überfahrt</p>
            <p className="truncate text-lg font-bold leading-tight">{textVon(aufBruecke)?.name}</p>
          </div>
          <span className="shrink-0 font-bold tabular-nums">
            {faehrt || angabe !== 'zeit'
              ? `Ende ${abstandText(faehrt ? (aufBruecke.sAus! - sJetzt) / stand!.v : null, aufBruecke.sAus! - sJetzt)}`
              : 'Zug steht'}
          </span>
        </div>
      ) : naechsteZeile ?? (
        <p className="kachel px-3 py-2 text-sm">Auf dem Rest dieses Wegs ist nichts mehr zu melden.</p>
      )}
      <div className="flex items-center gap-2 text-sm">
        {probefahrt ? (
          <>
            <button type="button" onClick={anhaltenUmschalten} aria-pressed={angehalten}
                    className={`min-h-9 shrink-0 rounded-lg px-3 font-bold ${angehalten
                      ? 'bg-sbb-red text-white hover:bg-sbb-red125'
                      : 'border border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-midnight'}`}>
              {angehalten ? (gestartet ? 'Weiter' : 'Start') : 'Anhalten'}
            </button>
            <div className="segmente flex-1 gap-0.5"
                 role="group" aria-label="Tempo der Probefahrt in km/h">
              {ZEITRAFFER.map((f) => (
                <button key={f} type="button" aria-pressed={raffer === f} onClick={() => rafferWaehlen(f)}
                        aria-label={`etwa ${kmh(f)} km/h`}
                        className="segment min-h-8 flex-1 px-0.5 text-xs tabular-nums">
                  {kmh(f)}
                </button>
              ))}
            </div>
            <span className="shrink-0 text-xs text-sbb-metal dark:text-sbb-storm">km/h</span>
          </>
        ) : (
          <p className="text-sbb-metal dark:text-sbb-storm">
            {faehrt && !ohneGps ? `Etwa ${kmhJetzt()} km/h` : zustand(meldung, stand, ohneGps, imTunnel !== null, false)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Zeigen und melden">
        <button type="button" aria-pressed={einstellung.tunnel} className={chip(einstellung.tunnel)}
                onClick={() => aendern({ tunnel: !einstellung.tunnel })}>Tunnel</button>
        <button type="button" aria-pressed={einstellung.bruecken !== 'keine'} className={chip(einstellung.bruecken !== 'keine')}
                onClick={() => aendern({ bruecken: einstellung.bruecken === 'keine' ? 'groessere' : 'keine' })}>Brücken</button>
        <button type="button" aria-pressed={einstellung.bahnhoefe} className={chip(einstellung.bahnhoefe)}
                onClick={() => aendern({ bahnhoefe: !einstellung.bahnhoefe })}>Bahnhöfe</button>
        <button type="button" aria-pressed={einstellung.bahnuebergaenge} className={chip(einstellung.bahnuebergaenge)}
                onClick={() => aendern({ bahnuebergaenge: !einstellung.bahnuebergaenge })}>Bahnübergänge</button>
        {([['gipfel', 'Gipfel'], ['kgs', 'Kultur'], ['seilbahn', 'Seilbahnen'], ['flaeche', 'Gebiete']] as const).map(([k, t]) => (
          <button key={k} type="button" aria-pressed={einstellung.sehenswert[k]} className={chip(einstellung.sehenswert[k])}
                  onClick={() => sorteZeigen(k, !einstellung.sehenswert[k])}>{t}</button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-sbb-white text-sbb-black
                    dark:bg-sbb-midnight dark:text-sbb-white" role="dialog" aria-label="Fahren">
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-4">
        {/* Die Meldungen für Bildschirmleser (VoiceOver, TalkBack): nur hier
            gesprochen, nicht bei jeder neuen Zeit */}
        <p ref={ansage} className="sr-only" aria-live="assertive" aria-atomic="true" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">{probefahrt ? 'Probefahrt' : 'Fahren'}</p>
            <p className="truncate text-sm text-sbb-metal dark:text-sbb-storm">
              {titel}
            </p>
            {zug && <p className="truncate text-sm font-medium">{zugName(zug.fahrt)} nach {zug.fahrt.z}</p>}
            {/* wie weit noch bis zum Ziel, entlang des gesuchten Wegs (Michael, 2026-09-27:
                «Kilometerangaben bis zum Zielort»); ohne Ziel keine */}
            {!ohneZiel && sJetzt !== null && (
              <p className="text-sm font-medium tabular-nums">
                {bisZiel(wegEnde(fahrweg) - (fahrweg.ziel_m ?? 0) - sJetzt) === null ? 'Am Ziel'
                  : `Noch etwa ${bisZiel(wegEnde(fahrweg) - (fahrweg.ziel_m ?? 0) - sJetzt)} auf diesem Weg`}
              </p>
            )}
          </div>
          <button
            type="button" onClick={fahrtBeenden}
            className="shrink-0 rounded-lg border border-sbb-cloud px-4 py-2 font-medium hover:border-sbb-black
                       dark:border-sbb-iron dark:hover:border-sbb-white"
          >
            Beenden
          </button>
        </div>

        {/* Karte und Band ganz oben, über Zeitraffer, Tempo und Meldungen: Diese
            wechseln ihre Höhe, Karte und Band sollen nicht springen (Michael,
            2026-09-26: «Karte noch weiter oben. Oberhalb der Geschwindigkeit») */}
        <FahrtKarte fahrweg={fahrweg} objekte={gewaehlt} sJetzt={sJetzt} vollbild={vollbildLeiste}
                    tempo={stand ? stand.v * (probefahrt ? raffer : 1) : null}
                    start={titel.split(' → ')[0]} ziel={ohneZiel ? undefined : titel.split(' → ')[1]} />
        <Streckenband fahrweg={fahrweg} objekte={gewaehlt} sJetzt={sJetzt} fliessend={probefahrt}
                      start={titel.split(' → ')[0]} ziel={titel.split(' → ')[1] ?? ''}
                      name={(o) => textVon(o)?.name} springen={probefahrt ? springen : undefined} />
        {ankunftKarte}
        {bahnhofKnopf}

        {probefahrt && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <button type="button" onClick={anhaltenUmschalten} aria-pressed={angehalten}
                    className={`min-h-9 shrink-0 rounded-lg px-3 font-bold ${angehalten
                      ? 'bg-sbb-red text-white hover:bg-sbb-red125'
                      : 'border border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-midnight'}`}>
              {angehalten ? (gestartet ? 'Weiter' : 'Start') : 'Anhalten'}
            </button>
            <span className="hidden text-sbb-metal sm:inline dark:text-sbb-storm">Zeitraffer</span>
            <div className="segmente flex-1 gap-0.5"
                 role="group" aria-label="Tempo der Probefahrt">
              {ZEITRAFFER.map((f) => (
                <button key={f} type="button" aria-pressed={raffer === f} onClick={() => rafferWaehlen(f)}
                        aria-label={f === 1 ? 'In Echtzeit, etwa 100 km/h' : `${f}-mal schneller`}
                        className="segment min-h-8 flex-1 px-0.5 text-[13px] tabular-nums sm:px-1 sm:text-sm">
                  {f}×
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ohne role="status": GPS-Genauigkeit und Tempo ändern sich laufend, ein
            Bildschirmleser würde sonst ununterbrochen vorlesen */}
        <div className="mt-3 flex items-baseline justify-between gap-3 text-sm text-sbb-metal dark:text-sbb-storm">
          <p>
            {probefahrt && angehalten ? (gestartet ? 'Probefahrt angehalten' : 'Bereit, mit «Start» geht es los') : zustand(meldung, stand, ohneGps, imTunnel !== null, probefahrt)}
            {faehrt && !ohneGps && !angehalten && ` · etwa ${kmhJetzt()} km/h`}
          </p>
          {/* die Probefahrt wiederholen (Michael, 2026-09-30) */}
          {probefahrt && (
            <button type="button" onClick={vonVorn}
                    className="shrink-0 underline underline-offset-2 hover:text-sbb-black dark:hover:text-sbb-white">
              Von vorn
            </button>
          )}
        </div>
        {zug && !frageOffen && (
          <ZugAnzeige zug={zug} halt={naechsterHalt} aendern={() => setFrageOffen(true)} />
        )}
        {frageOffen && zugsuche && (
          <ZugFrage suche={zugsuche} waehlen={zugWaehlen}
                    schliessen={() => { setFrageOffen(false); if (!zug) zugWaehlen(null) }} />
        )}
        {ohneZiel && (
          <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
            Ohne Ziel: Taktland folgt der Linie bis {titel.split(' → ')[1]} und sucht dann neu, ebenso,
            wenn der Zug die Strecke verlässt.
          </p>
        )}
        {gegenrichtung && (
          <p className="mt-2 border-l-2 border-sbb-red pl-3 text-sm">
            Der Standort bewegt sich gegen die Richtung dieses Wegs. Vielleicht sind Start und
            Ziel vertauscht.
          </p>
        )}


        {imTunnel && einstellung.tunnel && sJetzt !== null && (
          <div className="mt-5 rounded-lg bg-sbb-charcoal px-4 py-4 text-sbb-white">
            <p className="text-xs uppercase tracking-wide text-sbb-storm">Im Tunnel</p>
            <p className="text-xl font-bold">{textVon(imTunnel)?.name}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {faehrt || angabe !== 'zeit'
                ? `Ausfahrt ${abstandText(faehrt ? (imTunnel.sAus! - sJetzt) / stand!.v : null, imTunnel.sAus! - sJetzt)}`
                : 'Zug steht'}
            </p>
            <TunnelBalken anteil={(sJetzt - imTunnel.s) / (imTunnel.sAus! - imTunnel.s || 1)} />
          </div>
        )}

        {aufBruecke && sJetzt !== null && (
          <div className="mt-5 rounded-lg bg-fahrt-bruecke px-4 py-4 text-sbb-black">
            <p className="text-xs uppercase tracking-wide">Überfahrt</p>
            <p className="text-xl font-bold">{textVon(aufBruecke)?.name}</p>
            {textVon(aufBruecke)?.laenge && <p className="text-sm">{textVon(aufBruecke)!.laenge}</p>}
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {faehrt || angabe !== 'zeit'
                ? `Ende ${abstandText(faehrt ? (aufBruecke.sAus! - sJetzt) / stand!.v : null, aufBruecke.sAus! - sJetzt)}`
                : 'Zug steht'}
            </p>
            <TunnelBalken hell anteil={(sJetzt - aufBruecke.s) / (aufBruecke.sAus! - aufBruecke.s || 1)} />
          </div>
        )}

        {inFlaechen.length > 0 && (
          <div className="mt-5 rounded-lg bg-fahrt-sehenswert px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-wide text-white/80">Du fährst durch</p>
            {inFlaechen.map((o) => (
              <p key={o.kennung} className="mt-1">
                <span className="text-lg font-bold">{o.sehenswert!.name}</span>
                <span className="text-sm text-white/80"> · {o.sehenswert!.art}</span>
              </p>
            ))}
            <p className="mt-1 text-xs text-white/80">Grenze laut BAFU, für die Karte vereinfacht</p>
          </div>
        )}

        {naechstes ? (
          <div className="mt-5 space-y-2">
            {zugleich.map(karte)}
          </div>
        ) : stand && sJetzt !== null ? (
          <p className="mt-5 text-lg">Auf dem Rest dieses Wegs ist nichts mehr zu melden.</p>
        ) : null}

        {danach.length > 0 && (
          <>
            <p className="mt-6 text-sm font-medium">Danach</p>
            <ol className="mt-2 kachelliste">
              {danach.slice(0, 3).map((o) => (
                <li key={`${o.art} ${o.kennung}`} className="flex items-center gap-3 px-3 py-2">
                  {/* Pikto der Art; Sehenswertes hat keins, der Platz bleibt, damit die Namen fluchten */}
                  {o.art !== 'sehenswert' ? <Pikto art={o.art} className="size-6" /> : <span className="size-6 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{textVon(o)?.name}</span>
                    <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                      <ArtText o={o} />{luftlinie(o) && ` · ${luftlinie(o)}`}{textVon(o)?.laenge && ` · ${textVon(o)!.laenge}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-sbb-metal dark:text-sbb-storm">
                    {abstandText(eta(o), angabe === 'zeit' ? null : bis(o)) ?? ''}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
              Noch {aufzaehlen([
                ...(einstellung.tunnel
                  ? [anzahl(kommend.filter((o) => o.art === 'tunnel').length, 'Tunnel', 'Tunnel')] : []),
                ...(einstellung.bruecken !== 'keine'
                  ? [anzahl(kommend.filter((o) => o.art === 'bruecke').length, 'Brücke', 'Brücken')] : []),
                ...(einstellung.bahnhoefe
                  ? [anzahl(kommend.filter((o) => o.art === 'bahnhof').length, 'Bahnhof', 'Bahnhöfe')] : []),
                ...(einstellung.bahnuebergaenge
                  ? [anzahl(kommend.filter((o) => o.art === 'bahnuebergang').length, 'Bahnübergang', 'Bahnübergänge')] : []),
                ...(Object.values(einstellung.sehenswert).some(Boolean)
                  ? [`${kommend.filter((o) => o.art === 'sehenswert').length} Sehenswertes`] : []),
              ])} auf diesem Weg
            </p>
          </>
        )}

        <div className="mt-8 grid gap-3 border-t border-sbb-cloud pt-4 text-sm dark:border-sbb-iron">
          <MeldeEinstellungen einstellung={einstellung} aendern={aendern} />
          {Object.keys(stumm).length > 0 && (
            <details className="klapp">
              <summary className="cursor-pointer">
                Nicht mehr gemeldet: {anzahl(Object.keys(stumm).length, 'Sehenswertes', 'Sehenswertes')}
              </summary>
              <ul className="mt-2 kachelliste">
                {Object.entries(stumm).sort((a, b) => a[1].localeCompare(b[1], 'de')).map(([k, name]) => (
                  <li key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 break-words">{name || 'ohne Namen'}</span>
                    <button type="button" className="shrink-0 min-h-9 rounded-lg px-2 font-medium underline"
                            onClick={() => { const { [k]: _, ...rest } = stumm; stummSetzen(rest) }}>
                      Wieder melden
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => stummSetzen({})}
                      className="mt-2 min-h-9 rounded-lg border border-sbb-cloud px-3 font-medium dark:border-sbb-iron">
                Alle wieder melden
              </button>
            </details>
          )}
          <label className="flex items-center justify-between gap-3">
            <span>Ton bei der Meldung</span>
            <input type="checkbox" checked={einstellung.ton} className="size-5 accent-sbb-red"
                   onChange={(e) => aendern({ ton: e.target.checked })} />
          </label>
          <p className="text-sm text-sbb-metal dark:text-sbb-storm">
            Lautstärke, Töne je Art, zweimal statt einmal und zum Anhören: unter Einstellungen → Audio, unten auf jeder Seite.
          </p>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
          Der Standort bleibt auf diesem Gerät und wird nie gesendet; für das Logbuch hält Taktland
          den gefahrenen Weg als Punkte auf der Strecke fest, nur in diesem Browser. Die Zeiten
          sind Schätzungen aus Standort und Tempo, die Distanzen gerundet und entlang der gezeichneten
          Strecke gemessen. Gemeldet wird nur, solange diese Seite offen und
          der Bildschirm an ist. Züge und Halte laut Fahrplan: opentransportdata.swiss, ohne Verspätungen,
          Ausfälle, Extrazüge und Ersatzbusse. Auf Strecken anderer Bahnen folgt der Weg dem Schienennetz des BAV,
          und Tunnel, Galerien und Brücken stammen aus swissTLM3D von swisstopo, oft ohne Namen,
          mit der Länge ihrer Zeichnung, gerundet; als grössere Brücke gilt, was auf der Karte
          mindestens 100 m lang ist. Im
          Sammelheft stehen sie mit ihrer Bahn. Als Bahnhof
          gemeldet werden die Betriebspunkte des Wegs, die in Taktland eine Seite haben, auch wo
          der Zug nicht hält: Einen Fahrplan enthalten die Daten nicht. Sehenswertes: Kulturgüter
          bis {KGS_M} m, Seilbahnen mit einem Ende bis {SEILBAHN_M} m und Gipfel bis {GIPFEL_M / 1000} km
          neben der gezeichneten Strecke, dazu Gebiete von nationaler Bedeutung (BLN, Pärke, Moorlandschaften), durch die sie
          führt. Links und rechts ergeben sich aus der Lage in den Quellen (swisstopo, BABS, BAV, BAFU);
          ob etwas vom Zug aus zu sehen ist, sagen die Daten nicht. Sehenswertes kommt nicht ins
          Sammelheft. Hellblau im Streckenband: ein See aus swissTLMRegio liegt
          bis etwa {SEE_M} m (geprüft alle {SEE_QUER_M} m quer zur Strecke) links (oben) oder rechts (unten) der gezeichneten Strecke; Seen unter 0,1 km²
          fehlen. Bahnübergänge stammen aus den offenen Daten der SBB, gemeldet am
          Kilometer der Quelle; auf Strecken anderer Bahnen fehlen sie. Die Meldungen zu
          Bahnübergängen sind keine Sicherheitsinformation: Die Daten können unvollständig oder
          veraltet sein, es gelten allein die Signale vor Ort.
        </p>
      </div>
      {offenerBahnhof && (
        <BahnhofFenster uic={offenerBahnhof.uic} eintrag={offenerBahnhof.eintrag}
                        schliessen={bahnhofSchliessen} />
      )}
    </div>
  )
}

/**
 * Die Seite eines Bahnhofs über der Fahrt; die Fahrt läuft darunter weiter,
 * mit Tönen. Verweise auf andere Seiten gehen hier nicht: Sie würden die Fahrt
 * verlassen.
 */
// memo: Die Fahrt zeichnet sich oft neu, die Bahnhofseite soll das nicht mitmachen
const BahnhofFenster = memo(function BahnhofFenster({ uic, eintrag, schliessen }: {
  uic: number; eintrag: IndexEintrag | undefined; schliessen: () => void
}) {
  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen() }
    document.addEventListener('keydown', taste)
    return () => document.removeEventListener('keydown', taste)
  }, [schliessen])
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white"
         role="dialog" aria-modal="true" aria-label="Bahnhof"
         onClickCapture={(e) => {
           const a = (e.target as HTMLElement).closest('a')
           if (a && a.getAttribute('href')?.startsWith('#')) e.preventDefault()
         }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-sbb-cloud bg-sbb-white
                      px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] dark:border-sbb-iron dark:bg-sbb-midnight">
        <span className="text-sm text-sbb-metal dark:text-sbb-storm">Die Fahrt läuft weiter</span>
        <button type="button" onClick={schliessen}
                className="rounded-lg bg-sbb-red px-4 py-2 font-bold text-white hover:bg-sbb-red125">
          Zurück zur Fahrt
        </button>
      </div>
      <div className="mx-auto max-w-2xl pt-4">
        <Bahnhof uic={uic} eintrag={eintrag} zurueck={schliessen} zurueckText="Zurück zur Fahrt" />
      </div>
    </div>
  )
})

function zustand(meldung: Meldung | null, stand: Stand | null, ohneGps: boolean, imTunnel: boolean,
                 probefahrt: boolean) {
  if (meldung?.art === 'verweigert') return freigabeHilfe('ohne ihn geht «Fahren» nicht')
  if (meldung?.art === 'fehler') return meldung.text
  if (!stand) return probefahrt ? 'Probefahrt beginnt …' : 'Standort wird gesucht …'
  if (stand.abseits !== null) {
    return `Nicht auf dieser Strecke: etwa ${stand.abseits >= 1000
      ? `${Math.round(stand.abseits / 1000)} km` : `${Math.round(stand.abseits / 10) * 10} m`} daneben.`
  }
  if (ohneGps) return imTunnel ? 'Im Tunnel ohne GPS, geschätzt mit dem letzten Tempo' : 'Kein GPS, geschätzt mit dem letzten Tempo'
  return probefahrt ? 'Gespielter Standort' : `GPS auf etwa ${Math.round(stand.genau ?? 0)} m genau`
}

/** Eine Zeile zum Vorlesen: «9385 m · Linie 711» wird «9385 Meter, Linie 711» */
function sprechbar(zeile: string) {
  return zeile.replace(/(\d) m\b/g, '$1 Meter').replace(/ · /g, ', ')
}

/** Die Zeit im Ring: gross die Zahl, klein die Einheit */
function ZeitImRing({ sekunden, steht }: { sekunden: number | null; steht: boolean }) {
  if (sekunden === null) return <span className="text-sm font-bold">{steht ? 'steht' : '…'}</span>
  const [zahl, einheit] = sekunden < 90 ? [sekundenGerundet(sekunden), 's']
    : sekunden < 3600 ? [Math.round(sekunden / 60), 'min'] : [Math.floor(sekunden / 3600), 'h']
  return (
    <>
      <span className="text-[10px]">etwa</span>
      <span className="text-2xl font-bold tabular-nums">{zahl}</span>
      <span className="text-xs">{einheit}</span>
    </>
  )
}

/** «500 m», «1,2 km», «15 km»: entlang der gezeichneten Strecke, darum gerundet */
function strecke(meter: number) {
  if (meter < 1000) return `${Math.max(50, Math.round(meter / 50) * 50)} m`
  if (meter < 10_000) return `${(Math.round(meter / 100) / 10).toLocaleString('de-CH')} km`
  return `${Math.round(meter / 1000)} km`
}

/** bis zum Ziel (Michael, 2026-09-27): ab 5 km ganze Kilometer, ab 1 km mit einer
 *  Kommastelle, darunter in 50-m-Schritten bis 50 m, dann in 10-m-Schritten bis 0;
 *  null heisst am Ziel */
function bisZiel(meter: number): string | null {
  if (meter >= 5000) return `${Math.round(meter / 1000)} km`
  const km = (x: number) => `${(Math.round(x / 100) / 10).toLocaleString('de-CH', { minimumFractionDigits: 1 })} km`
  if (meter >= 1000) return km(meter)
  const m = meter >= 50 ? Math.round(meter / 50) * 50 : Math.round(meter / 10) * 10
  if (m >= 1000) return km(1000)
  return m > 0 ? `${m} m` : null
}

/** zum Vorlesen: «in etwa 500 Metern» (Dativ) oder «etwa 500 Meter» */
function streckeGesprochen(meter: number, dativ = true) {
  return strecke(meter).replace(/ m$/, dativ ? ' Metern' : ' Meter').replace(/ km$/, dativ ? ' Kilometern' : ' Kilometer')
}

/** Die Distanz im Ring: gross die Zahl, klein die Einheit */
function DistanzImRing({ meter }: { meter: number | null }) {
  if (meter === null) return <span className="text-sm font-bold">…</span>
  const [zahl, einheit] = strecke(meter).split(' ')
  return (
    <>
      <span className="text-[10px]">etwa</span>
      <span className="text-2xl font-bold tabular-nums">{zahl}</span>
      <span className="text-xs">{einheit}</span>
    </>
  )
}

/** «in etwa 25 s», «in etwa 3 min» */
/** auf 5 s gerundet; darunter ganze Sekunden, im Zeitraffer der Probefahrt kommt das vor */
function sekundenGerundet(sekunden: number) {
  return sekunden < 5 ? Math.max(1, Math.round(sekunden)) : Math.round(sekunden / 5) * 5
}

function dauer(sekunden: number) {
  if (sekunden < 90) return `in etwa ${sekundenGerundet(sekunden)} s`
  if (sekunden < 3600) return `in etwa ${Math.round(sekunden / 60)} min`
  return `in etwa ${Math.floor(sekunden / 3600)} h ${Math.round((sekunden % 3600) / 60)} min`
}

function anzahl(n: number, einzahl: string, mehrzahl: string) {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`
}

/** «a und b», «a, b und c» */
function aufzaehlen(teile: string[]) {
  return teile.length > 1 ? `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}` : teile.join('')
}

/**
 * Was beim Fahren gemeldet wird und wie: im Fahrtmodus unten und als Standardwerte
 * unter Einstellungen (Michael, 2026-10-01). Beides ist dieselbe
 * Einstellung: Was man hier ändert, gilt für diese und jede neue Fahrt.
 */
export function MeldeEinstellungen({ einstellung, aendern }: {
  einstellung: Einstellung; aendern: (neu: Partial<Einstellung>) => void
}) {
  return (
    <>
          <label className="flex items-center justify-between gap-3">
            <span>Tunnel melden</span>
            <input type="checkbox" checked={einstellung.tunnel} className="size-5 accent-sbb-red"
                   onChange={(e) => aendern({ tunnel: e.target.checked })} />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span>Brücken melden</span>
            <Auswahl
              titel="Brücken melden" wert={einstellung.bruecken}
              waehlen={(w) => aendern({ bruecken: w })}
              optionen={[{ wert: 'groessere' as BrueckenWahl, text: 'ab 3 Baueinheiten' },
                         { wert: 'alle' as BrueckenWahl, text: 'alle' },
                         { wert: 'keine' as BrueckenWahl, text: 'keine' }]}
              className="rounded-lg border border-sbb-cloud bg-white px-2 py-1 text-sbb-black dark:border-sbb-iron
                         dark:bg-sbb-midnight dark:text-sbb-white"
            />
          </div>
          <label className="flex items-center justify-between gap-3">
            <span>Bahnhöfe melden</span>
            <input type="checkbox" checked={einstellung.bahnhoefe} className="size-5 accent-sbb-red"
                   onChange={(e) => aendern({ bahnhoefe: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Bahnübergänge melden</span>
            <input type="checkbox" checked={einstellung.bahnuebergaenge} className="size-5 accent-sbb-red"
                   onChange={(e) => aendern({ bahnuebergaenge: e.target.checked })} />
          </label>
          {SORTEN.map(([k, t, lang]) => (
            <label key={k} className="flex items-center justify-between gap-3">
              <span><KurzLang kurz={t} lang={lang} /></span>
              <input type="checkbox" checked={einstellung.sehenswert[k]} className="size-5 accent-sbb-red"
                     onChange={(e) => aendern({ sehenswert: { ...einstellung.sehenswert, [k]: e.target.checked } })} />
            </label>
          ))}
          <div className="flex items-center justify-between gap-3">
            <span>Melden etwa</span>
            <Auswahl
              titel="Melden etwa" wert={einstellung.vorlauf}
              waehlen={(w) => aendern({ vorlauf: w })}
              optionen={VORLAEUFE_S.map((x) => ({ wert: x as Vorlauf, text: `${x} Sekunden vorher` }))}
              className="rounded-lg border border-sbb-cloud bg-white px-2 py-1 text-sbb-black dark:border-sbb-iron
                         dark:bg-sbb-midnight dark:text-sbb-white"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Angabe</span>
            <Auswahl
              titel="Angabe" wert={einstellung.angabe}
              waehlen={(w) => aendern({ angabe: w })}
              optionen={[{ wert: 'zeit' as Angabe, text: 'Zeit' }, { wert: 'distanz' as Angabe, text: 'Distanz' },
                         { wert: 'beides' as Angabe, text: 'Zeit und Distanz' }]}
              className="rounded-lg border border-sbb-cloud bg-white px-2 py-1 text-sbb-black dark:border-sbb-iron
                         dark:bg-sbb-midnight dark:text-sbb-white"
            />
          </div>
    </>
  )
}

/** Die gemerkten Melde-Einstellungen, auch ausserhalb einer Fahrt */
export function useMeldeEinstellung() {
  const [einstellung, setEinstellung] = useState(einstellungLesen)
  const aendern = (neu: Partial<Einstellung>) => {
    const e = { ...einstellung, ...neu }
    setEinstellung(e)
    einstellungMerken(e)
  }
  return [einstellung, aendern] as const
}
