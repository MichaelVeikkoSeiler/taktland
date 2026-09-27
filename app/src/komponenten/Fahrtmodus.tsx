import { useEffect, useMemo, useRef, useState } from 'react'
import { type FahrObjekt, type Fahrweg, GIPFEL_M, KGS_M, lageBei, projizieren, SEE_M, SEILBAHN_M, type SehenswertSorte, wegEnde } from '../fahrt'
import { spurMerken } from '../ohneziel'
import { freigabeHilfe } from '../umgebung'
import { FahrtKarte, FARBE, Ring, RING_S, Streckenband, TunnelBalken } from './FahrtAnzeige'
import { Auswahl } from './Auswahl'
import { KurzLang, LANGFORM } from './Sehenswert'
import { Pikto } from './Pikto'

/** So viele Sekunden vor einem Objekt kann die Meldung kommen; die erste gilt ohne Wahl */
const VORLAEUFE_S = [20, 10] as const
type Vorlauf = typeof VORLAEUFE_S[number]
/** Wie viel schneller die Probefahrt läuft; wählbar (Michael, 2026-09-26) */
/** 1 = Echtzeit bei PROBE_TEMPO; 1 und 200 dazu (Michael, 2026-09-27) */
const ZEITRAFFER = [1, 5, 10, 20, 50, 100, 200] as const
type Zeitraffer = typeof ZEITRAFFER[number]
/** Was so viele Sekunden vor dem Zug liegt, steht als eigene Karte oben */
const ZUGLEICH_S = 40
/** Tempo der Probefahrt, 100 km/h */
const PROBE_TEMPO = 100 / 3.6
/** Langsamer gilt als Stillstand: keine Zeitangabe */
const STEHT_UNTER = 3
/** Weiter weg vom Weg gilt als «nicht auf dieser Strecke», mindestens */
const ABSEITS_M = 300
/** Ohne neuen Standort seit so vielen Sekunden gilt: kein GPS */
const OHNE_GPS_NACH_S = 8
/** So lange rechnet die Anzeige ohne GPS mit dem letzten Tempo weiter (Tunnel) */
const OHNE_GPS_MAX_S = 20 * 60
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

interface Einstellung { tunnel: boolean; bruecken: BrueckenWahl; bahnhoefe: boolean; sehenswert: SehenswertWahl
                        vorlauf: Vorlauf; ton: boolean; angabe: Angabe }

function einstellungLesen(): Einstellung {
  try {
    const x = JSON.parse(localStorage.getItem(EINSTELLUNG) ?? '{}')
    return { bruecken: ['groessere', 'alle', 'keine'].includes(x.bruecken) ? x.bruecken : 'groessere',
             tunnel: x.tunnel !== false, bahnhoefe: x.bahnhoefe !== false,
             sehenswert: Object.fromEntries(SORTEN.map(([k]) => [k, x.sehenswert?.[k] !== false])) as SehenswertWahl,
             vorlauf: VORLAEUFE_S.includes(x.vorlauf) ? x.vorlauf : VORLAEUFE_S[0], ton: x.ton !== false,
             angabe: ['zeit', 'distanz', 'beides'].includes(x.angabe) ? x.angabe : 'zeit' }
  } catch {
    return { tunnel: true, bruecken: 'groessere', bahnhoefe: true, sehenswert: { gipfel: true, kgs: true, seilbahn: true, flaeche: true }, vorlauf: VORLAEUFE_S[0], ton: true, angabe: 'zeit' }
  }
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
                                                  sehenswert: 'Sehenswert' }
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
export function Fahrtmodus({ fahrweg, text, probefahrt, piepen, titel, beenden, durchfahren, fortsetzen, stelle, ohneZiel }: {
  fahrweg: Fahrweg
  text: (o: FahrObjekt) => ObjektText | undefined
  probefahrt: boolean
  piepen: () => void
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
}) {
  const [einstellung, setEinstellung] = useState(einstellungLesen)
  // Sehenswertes bringt seinen Text selbst mit
  const textVon = (o: FahrObjekt): ObjektText | undefined => o.sehenswert
    ? { name: o.sehenswert.name, zeile: o.sehenswert.zeile, baueinheiten: null } : text(o)
  const [stand, setStand] = useState<Stand | null>(null)
  const [meldung, setMeldung] = useState<Meldung | null>({ art: 'sucht' })
  const [jetzt, setJetzt] = useState(0)
  const [gegenrichtung, setGegenrichtung] = useState(false)
  const standRef = useRef<Stand | null>(null)
  const gemeldet = useRef(new Set<string>())
  const ansage = useRef<HTMLParagraphElement | null>(null)
  // Stelle beim ersten Standort: was davor liegt, ist nicht durchfahren
  const startS = useRef<number | null>(fortsetzen?.startS ?? null)
  // fortgesetzt: was vor dem Schliessen durchfahren war, steht schon im Sammelheft
  const hinter = useRef<FahrObjekt[]>(fortsetzen
    ? fahrweg.objekte.filter((o) => o.art !== 'sehenswert' && o.s > fortsetzen.startS && o.s <= fortsetzen.s)
    : [])
  const gemerktUm = useRef(0)
  const uhrStart = useRef({ echt: Date.now(), spiel: 0 })
  const [raffer, setRaffer] = useState<Zeitraffer>(20)
  const rafferRef = useRef<Zeitraffer>(20)
  // Probefahrt anhalten und weiterfahren (Michael, 2026-09-26: «unterbrechen und wieder starten»)
  const [angehalten, setAngehalten] = useState(false)
  const angehaltenRef = useRef(false)
  /** In der Probefahrt läuft die Zeit schneller; angehalten steht sie */
  const uhr = () => probefahrt
    ? uhrStart.current.spiel + (angehaltenRef.current ? 0 : (Date.now() - uhrStart.current.echt) * rafferRef.current)
    : Date.now()
  function anhaltenUmschalten() {
    uhrStart.current = { echt: Date.now(), spiel: uhr() }
    angehaltenRef.current = !angehaltenRef.current
    setAngehalten(angehaltenRef.current)
  }

  /** Probefahrt: an eine Stelle springen, vorwärts oder zurück (Michael,
   *  2026-09-26: «den Zug als Regler verschieben»). Was hinter der neuen Stelle
   *  liegt, gilt als nicht gemeldet und wird wieder gemeldet. */
  function springen(s: number) {
    const t = (s / PROBE_TEMPO) * 1000
    uhrStart.current = { echt: Date.now(), spiel: t }
    for (const o of fahrweg.objekte) {
      if (o.s > s) gemeldet.current.delete(`${o.art} ${o.kennung}`)
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

  /** Tempo der Probefahrt wechseln, ohne dass der Zug springt */
  function rafferWaehlen(f: Zeitraffer) {
    uhrStart.current = { echt: Date.now(), spiel: uhr() }
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
    uhrStart.current = { echt: Date.now(), spiel: 0 }
    const id = window.setInterval(() => {
      if (angehaltenRef.current) return
      const t = uhr()
      const s = Math.min(wegEnde(fahrweg), PROBE_TEMPO * t / 1000)
      const imTunnel = fahrweg.objekte.some((o) => o.art === 'tunnel' && o.sAus !== null && s > o.s + 50 && s < o.sAus - 50)
      if (imTunnel) return
      const l = lageBei(fahrweg, s)
      standort(t, l.lat, l.lon, 10, PROBE_TEMPO)
    }, 500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probefahrt, fahrweg])

  // Die Anzeige läuft jede halbe Sekunde weiter, auch ohne neuen Standort
  useEffect(() => {
    const id = window.setInterval(() => setJetzt(uhr()), 500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probefahrt])

  // Bildschirm anlassen, solange der Fahrtmodus läuft
  useEffect(() => {
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
  }, [])

  // Geschätzte Stelle jetzt: seit dem letzten Standort mit dem letzten Tempo weiter
  const seit = stand ? Math.max(0, (jetzt - stand.t) / 1000) : 0
  // in der Probefahrt vergehen zwischen zwei Standorten 10 Sekunden Spielzeit
  const ohneGps = stand !== null && seit > OHNE_GPS_NACH_S * (probefahrt ? raffer : 1)
  const sJetzt = stand && stand.abseits === null
    ? Math.min(wegEnde(fahrweg), stand.s + (seit < OHNE_GPS_MAX_S ? stand.v * seit : 0))
    : null
  const faehrt = stand !== null && stand.v >= STEHT_UNTER

  const gewaehlt = useMemo(() => fahrweg.objekte.filter((o) => {
    if (o.art === 'tunnel') return einstellung.tunnel
    if (o.art === 'bahnhof') return einstellung.bahnhoefe
    if (o.art === 'sehenswert') return o.sehenswert ? einstellung.sehenswert[o.sehenswert.sorte] : false
    if (einstellung.bruecken === 'keine') return false
    if (einstellung.bruecken === 'alle') return true
    return (text(o)?.baueinheiten ?? 0) >= 3 || text(o)?.gross === true
  }), [fahrweg, einstellung.tunnel, einstellung.bruecken, einstellung.bahnhoefe, einstellung.sehenswert, text])

  // auch ohne Meldung der Tunnel: Im Tunnel fehlt das GPS, das sagt die Anzeige
  const imTunnel = sJetzt === null ? null
    : fahrweg.objekte.find((o) => o.art === 'tunnel' && o.sAus !== null && sJetzt >= o.s && sJetzt <= o.sAus) ?? null
  // Flächen, durch die der Weg gerade führt (Michael, 2026-09-26: «du fährst durch …»)
  const inFlaechen = sJetzt === null ? []
    : gewaehlt.filter((o) => o.sehenswert?.sorte === 'flaeche' && sJetzt >= o.s && sJetzt <= o.sAus!)
  const kommend = sJetzt === null ? [] : gewaehlt.filter((o) => o.s > sJetzt)
  const eta = (o: FahrObjekt) => (sJetzt !== null && faehrt ? (o.s - sJetzt) / stand!.v : null)
  /** Meter bis zum Objekt entlang des gezeichneten Wegs; gilt auch, wenn der Zug steht */
  const bis = (o: FahrObjekt) => (sJetzt !== null ? Math.max(0, o.s - sJetzt) : null)
  const { angabe } = einstellung
  /** «in etwa 25 s», «in etwa 500 m» oder beides, wie gewählt; ohne Tempo nur die Distanz */
  const abstandText = (sekunden: number | null, meter: number | null) => {
    const z = sekunden !== null && angabe !== 'distanz' ? dauer(sekunden) : null
    const d = meter !== null && (angabe !== 'zeit' || sekunden === null) ? `in etwa ${strecke(meter)}` : null
    return z && d ? `${z} · ${strecke(meter!)}` : z ?? d
  }

  // Die Meldung: etwa 20 oder 10 Sekunden vorher, wie gewählt, jedes Objekt einmal
  useEffect(() => {
    for (const o of kommend.slice(0, 5)) {
      const e = eta(o)
      const schluessel = `${o.art} ${o.kennung}`
      if (e !== null && e <= einstellung.vorlauf && !gemeldet.current.has(schluessel)) {
        gemeldet.current.add(schluessel)
        if (einstellung.ton) piepen()
        // für Bildschirmleser: dieselbe Meldung als Satz, einmal
        const t = textVon(o)
        if (ansage.current && t) {
          const m = bis(o)
          const sek = `In etwa ${Math.max(5, Math.round(e / 5) * 5)} Sekunden`
          ansage.current.textContent = (angabe === 'zeit' || m === null ? sek
            : angabe === 'distanz' ? `In etwa ${streckeGesprochen(m)}` : `${sek}, etwa ${streckeGesprochen(m, false)}`) + ': '
            + (o.sehenswert?.sorte === 'flaeche' ? `Du fährst durch ${t.name}, ${o.sehenswert.art}.`
              : `${artText(o).replace(/^Kultur\b/, 'Kulturgut').replace(' · ', ', ')}: ${t.name}. ${sprechbar(t.zeile)}`)
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

  const naechstes = kommend[0]
  // Was in den nächsten 40 Sekunden kommt, läuft gleichzeitig, als Karten
  // übereinander (Michael, 2026-09-25); das erste immer, höchstens drei
  const zugleich = kommend.filter((o, i) => i === 0 || (eta(o) ?? Infinity) <= ZUGLEICH_S).slice(0, 3)
  const danach = kommend.slice(Math.max(1, zugleich.length))

  // als Funktion, nicht als Komponente: sonst entstünde die Karte bei jeder
  // neuen Zeit neu, und Ring und Farbe liefen nicht mehr weich
  function karte(o: FahrObjekt) {
    const bald = (eta(o) ?? Infinity) <= einstellung.vorlauf
    return (
      <div key={`${o.art} ${o.kennung}`} className={`flex items-center gap-4 rounded-lg border px-4 transition-all ${bald
        ? `${FARBE[o.art].flaeche} ${FARBE[o.art].schrift} py-7`
        : 'border-sbb-cloud bg-white py-4 dark:border-sbb-iron dark:bg-sbb-charcoal'}`}>
        <Ring bald={bald} art={o.art} anteil={eta(o) === null ? null : 1 - eta(o)! / RING_S}>
          {angabe === 'zeit' || (angabe === 'beides' && eta(o) !== null)
            ? <ZeitImRing sekunden={eta(o)} steht={stand !== null} />
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
          {o.sehenswert && o.sehenswert.sorte !== 'flaeche' && (
            <p className={`mt-1 text-sm ${bald ? '' : 'text-sbb-metal dark:text-sbb-storm'}`}>
              {o.sehenswert.seite === 'links' ? 'Links' : 'Rechts'} der Strecke laut Lage in der Quelle. Ob
              es zu sehen ist, sagen die Daten nicht.
            </p>
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
          </div>
          <button
            type="button" onClick={() => beenden([...hinter.current].sort((a, b) => a.s - b.s))}
            className="shrink-0 rounded-lg border border-sbb-cloud px-4 py-2 font-medium hover:border-sbb-black
                       dark:border-sbb-iron dark:hover:border-sbb-white"
          >
            Beenden
          </button>
        </div>

        {/* Karte und Band ganz oben, über Zeitraffer, Tempo und Meldungen: Diese
            wechseln ihre Höhe, Karte und Band sollen nicht springen (Michael,
            2026-09-26: «Karte noch weiter oben. Oberhalb der Geschwindigkeit») */}
        <FahrtKarte fahrweg={fahrweg} objekte={gewaehlt} sJetzt={sJetzt} />
        <Streckenband fahrweg={fahrweg} objekte={gewaehlt} sJetzt={sJetzt}
                      start={titel.split(' → ')[0]} ziel={titel.split(' → ')[1] ?? ''}
                      name={(o) => textVon(o)?.name} springen={probefahrt ? springen : undefined} />

        {probefahrt && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <button type="button" onClick={anhaltenUmschalten} aria-pressed={angehalten}
                    className={`min-h-9 shrink-0 rounded-lg px-3 font-bold ${angehalten
                      ? 'bg-sbb-red text-white hover:bg-sbb-red125'
                      : 'border border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-midnight'}`}>
              {angehalten ? 'Weiter' : 'Anhalten'}
            </button>
            <span className="hidden text-sbb-metal sm:inline dark:text-sbb-storm">Zeitraffer</span>
            <div className="flex flex-1 overflow-hidden rounded-lg border border-sbb-cloud dark:border-sbb-iron"
                 role="group" aria-label="Tempo der Probefahrt">
              {ZEITRAFFER.map((f) => (
                <button key={f} type="button" aria-pressed={raffer === f} onClick={() => rafferWaehlen(f)}
                        aria-label={f === 1 ? 'In Echtzeit, etwa 100 km/h' : `${f}-mal schneller`}
                        className={`min-h-9 flex-1 whitespace-nowrap px-0.5 text-[13px] font-medium tabular-nums sm:px-1 sm:text-sm ${raffer === f
                          ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                          : 'bg-white dark:bg-sbb-midnight'}`}>
                  {f}×
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ohne role="status": GPS-Genauigkeit und Tempo ändern sich laufend, ein
            Bildschirmleser würde sonst ununterbrochen vorlesen */}
        <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
          {probefahrt && angehalten ? 'Probefahrt angehalten' : zustand(meldung, stand, ohneGps, imTunnel !== null, probefahrt)}
          {faehrt && !ohneGps && !angehalten && ` · etwa ${Math.round(stand!.v * 3.6)} km/h`}
        </p>
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
                <li key={`${o.art} ${o.kennung}`} className="flex justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{textVon(o)?.name}</span>
                    <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                      <ArtText o={o} />
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
                ...(Object.values(einstellung.sehenswert).some(Boolean)
                  ? [`${kommend.filter((o) => o.art === 'sehenswert').length} Sehenswertes`] : []),
              ])} auf diesem Weg
            </p>
          </>
        )}

        <div className="mt-8 grid gap-3 border-t border-sbb-cloud pt-4 text-sm dark:border-sbb-iron">
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
              className="border border-sbb-cloud bg-white px-2 py-1 text-sbb-black dark:border-sbb-iron
                         dark:bg-sbb-midnight dark:text-sbb-white"
            />
          </div>
          <label className="flex items-center justify-between gap-3">
            <span>Bahnhöfe melden</span>
            <input type="checkbox" checked={einstellung.bahnhoefe} className="size-5 accent-sbb-red"
                   onChange={(e) => aendern({ bahnhoefe: e.target.checked })} />
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
              className="border border-sbb-cloud bg-white px-2 py-1 text-sbb-black dark:border-sbb-iron
                         dark:bg-sbb-midnight dark:text-sbb-white"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Angabe</span>
            <Auswahl
              titel="Angabe" wert={angabe}
              waehlen={(w) => aendern({ angabe: w })}
              optionen={[{ wert: 'zeit' as Angabe, text: 'Zeit' }, { wert: 'distanz' as Angabe, text: 'Distanz' },
                         { wert: 'beides' as Angabe, text: 'Zeit und Distanz' }]}
              className="border border-sbb-cloud bg-white px-2 py-1 text-sbb-black dark:border-sbb-iron
                         dark:bg-sbb-midnight dark:text-sbb-white"
            />
          </div>
          <label className="flex items-center justify-between gap-3">
            <span>Ton bei der Meldung</span>
            <input type="checkbox" checked={einstellung.ton} className="size-5 accent-sbb-red"
                   onChange={(e) => aendern({ ton: e.target.checked })} />
          </label>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
          Der Standort bleibt auf diesem Gerät und wird weder gespeichert noch gesendet. Die Zeiten
          sind Schätzungen aus Standort und Tempo, die Distanzen gerundet und entlang der gezeichneten
          Strecke gemessen. Gemeldet wird nur, solange diese Seite offen und
          der Bildschirm an ist. Auf Strecken anderer Bahnen folgt der Weg dem Schienennetz des BAV,
          und Tunnel, Galerien und Brücken stammen aus swissTLM3D von swisstopo: ohne Länge, oft ohne
          Namen; als grössere Brücke gilt dort, was auf der Karte mindestens 100 m lang ist. Sie
          kommen nicht ins Sammelheft. Als Bahnhof
          gemeldet werden die Betriebspunkte des Wegs, die in Taktland eine Seite haben, auch wo
          der Zug nicht hält: Einen Fahrplan enthalten die Daten nicht. Sehenswertes: Kulturgüter
          bis {KGS_M} m, Seilbahnen mit einem Ende bis {SEILBAHN_M} m und Gipfel bis {GIPFEL_M / 1000} km
          neben der gezeichneten Strecke, dazu Gebiete von nationaler Bedeutung (BLN, Pärke, Moorlandschaften), durch die sie
          führt. Links und rechts ergeben sich aus der Lage in den Quellen (swisstopo, BABS, BAV, BAFU);
          ob etwas vom Zug aus zu sehen ist, sagen die Daten nicht. Sehenswertes kommt nicht ins
          Sammelheft. Hellblau im Streckenband: ein See der Landeskarte 1:1 Million liegt
          etwa {SEE_M} m links (oben) oder rechts (unten) der gezeichneten Strecke; kleine Seen
          fehlen in diesem Massstab.
        </p>
      </div>
    </div>
  )
}

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
  const [zahl, einheit] = sekunden < 90 ? [Math.max(5, Math.round(sekunden / 5) * 5), 's']
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
function dauer(sekunden: number) {
  if (sekunden < 90) return `in etwa ${Math.max(5, Math.round(sekunden / 5) * 5)} s`
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
