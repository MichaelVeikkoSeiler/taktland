import { useEffect, useMemo, useRef, useState } from 'react'
import { type FahrObjekt, type Fahrweg, lageBei, projizieren, wegEnde } from '../fahrt'
import { freigabeHilfe } from '../umgebung'
import { FahrtKarte, FARBE, Ring, RING_S, Streckenband, TunnelBalken } from './FahrtAnzeige'
import { Auswahl } from './Auswahl'

/** So viele Sekunden vor einem Objekt kann die Meldung kommen; die erste gilt ohne Wahl */
const VORLAEUFE_S = [20, 10] as const
type Vorlauf = typeof VORLAEUFE_S[number]
/** Die Probefahrt läuft so viel schneller als die Wirklichkeit */
const ZEITRAFFER = 20
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

export type BrueckenWahl = 'groessere' | 'alle' | 'keine'
const EINSTELLUNG = 'taktland.fahrt.v1'

interface Einstellung { tunnel: boolean; bruecken: BrueckenWahl; bahnhoefe: boolean; vorlauf: Vorlauf; ton: boolean }

function einstellungLesen(): Einstellung {
  try {
    const x = JSON.parse(localStorage.getItem(EINSTELLUNG) ?? '{}')
    return { bruecken: ['groessere', 'alle', 'keine'].includes(x.bruecken) ? x.bruecken : 'groessere',
             tunnel: x.tunnel !== false, bahnhoefe: x.bahnhoefe !== false,
             vorlauf: VORLAEUFE_S.includes(x.vorlauf) ? x.vorlauf : VORLAEUFE_S[0], ton: x.ton !== false }
  } catch {
    return { tunnel: true, bruecken: 'groessere', bahnhoefe: true, vorlauf: VORLAEUFE_S[0], ton: true }
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

const ART: Record<FahrObjekt['art'], string> = { tunnel: 'Tunnel', bruecke: 'Brücke', bahnhof: 'Bahnhof' }

type Meldung =
  | { art: 'sucht' } | { art: 'verweigert' } | { art: 'ohneGps' } | { art: 'fehler'; text: string }

/**
 * Der Fahrtmodus über der Seite «Strecke». Er zeigt das nächste Objekt und
 * meldet es mit einem Ton etwa 20 oder 10 Sekunden vorher. Nur solange die Seite
 * offen ist: Ein Browser darf im Hintergrund nicht weiterrechnen.
 */
export function Fahrtmodus({ fahrweg, text, probefahrt, piepen, titel, beenden, durchfahren }: {
  fahrweg: Fahrweg
  text: (o: FahrObjekt) => ObjektText | undefined
  probefahrt: boolean
  piepen: () => void
  titel: string
  /** mit allem, was seit dem ersten Standort durchfahren wurde, in Fahrtrichtung */
  beenden: (durchfahren: FahrObjekt[]) => void
  /** gleich beim Durchfahren, damit nichts verloren geht, wenn die Seite zugeht */
  durchfahren: (o: FahrObjekt) => void
}) {
  const [einstellung, setEinstellung] = useState(einstellungLesen)
  const [stand, setStand] = useState<Stand | null>(null)
  const [meldung, setMeldung] = useState<Meldung | null>({ art: 'sucht' })
  const [jetzt, setJetzt] = useState(0)
  const [gegenrichtung, setGegenrichtung] = useState(false)
  const standRef = useRef<Stand | null>(null)
  const gemeldet = useRef(new Set<string>())
  const ansage = useRef<HTMLParagraphElement | null>(null)
  // Stelle beim ersten Standort: was davor liegt, ist nicht durchfahren
  const startS = useRef<number | null>(null)
  const hinter = useRef<FahrObjekt[]>([])
  const uhrStart = useRef({ echt: Date.now(), spiel: 0 })

  /** In der Probefahrt läuft die Zeit schneller */
  const uhr = () => probefahrt
    ? uhrStart.current.spiel + (Date.now() - uhrStart.current.echt) * ZEITRAFFER
    : Date.now()

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
    let v = alt?.v ?? 0
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
      (pos) => standort(Date.now(), pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy,
                        pos.coords.speed),
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
      const t = uhr()
      const s = Math.min(wegEnde(fahrweg), PROBE_TEMPO * t / 1000)
      const imTunnel = fahrweg.objekte.some((o) => o.sAus !== null && s > o.s + 50 && s < o.sAus - 50)
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
  const ohneGps = stand !== null && seit > OHNE_GPS_NACH_S * (probefahrt ? ZEITRAFFER : 1)
  const sJetzt = stand && stand.abseits === null
    ? Math.min(wegEnde(fahrweg), stand.s + (seit < OHNE_GPS_MAX_S ? stand.v * seit : 0))
    : null
  const faehrt = stand !== null && stand.v >= STEHT_UNTER

  const gewaehlt = useMemo(() => fahrweg.objekte.filter((o) => {
    if (o.art === 'tunnel') return einstellung.tunnel
    if (o.art === 'bahnhof') return einstellung.bahnhoefe
    if (einstellung.bruecken === 'keine') return false
    if (einstellung.bruecken === 'alle') return true
    return (text(o)?.baueinheiten ?? 0) >= 3
  }), [fahrweg, einstellung.tunnel, einstellung.bruecken, einstellung.bahnhoefe, text])

  // auch ohne Meldung der Tunnel: Im Tunnel fehlt das GPS, das sagt die Anzeige
  const imTunnel = sJetzt === null ? null
    : fahrweg.objekte.find((o) => o.sAus !== null && sJetzt >= o.s && sJetzt <= o.sAus) ?? null
  const kommend = sJetzt === null ? [] : gewaehlt.filter((o) => o.s > sJetzt)
  const eta = (o: FahrObjekt) => (sJetzt !== null && faehrt ? (o.s - sJetzt) / stand!.v : null)

  // Die Meldung: etwa 20 oder 10 Sekunden vorher, wie gewählt, jedes Objekt einmal
  useEffect(() => {
    for (const o of kommend.slice(0, 5)) {
      const e = eta(o)
      const schluessel = `${o.art} ${o.kennung}`
      if (e !== null && e <= einstellung.vorlauf && !gemeldet.current.has(schluessel)) {
        gemeldet.current.add(schluessel)
        if (einstellung.ton) piepen()
        // für Bildschirmleser: dieselbe Meldung als Satz, einmal
        const t = text(o)
        if (ansage.current && t) {
          ansage.current.textContent = `In etwa ${Math.max(5, Math.round(e / 5) * 5)} Sekunden: `
            + `${ART[o.art]} ${t.name}. ${sprechbar(t.zeile)}`
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
      if (o.s <= startS.current || o.s > sJetzt) continue
      if (hinter.current.includes(o)) continue
      hinter.current.push(o)
      durchfahren(o)
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
          <ZeitImRing sekunden={eta(o)} steht={stand !== null} />
        </Ring>
        <div className="min-w-0">
          <p className={`text-xs uppercase tracking-wide ${bald ? '' : 'text-sbb-metal dark:text-sbb-storm'}`}>
            {bald ? 'Gleich' : o === naechstes ? 'Als Nächstes' : 'Kurz danach'} · {ART[o.art]}
          </p>
          <p lang="de" className={`mt-1 font-bold leading-tight break-words hyphens-auto ${bald ? 'text-3xl' : 'text-2xl'}`}>
            {text(o)?.name}
          </p>
          <p className={`mt-1 ${bald ? '' : 'text-sbb-metal dark:text-sbb-storm'}`}>
            {text(o)?.zeile}
          </p>
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
                    dark:bg-sbb-midnight dark:text-sbb-white" role="dialog" aria-label="Fahrtmodus">
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-4">
        {/* Die Meldungen für Bildschirmleser (VoiceOver, TalkBack): nur hier
            gesprochen, nicht bei jeder neuen Zeit */}
        <p ref={ansage} className="sr-only" aria-live="assertive" aria-atomic="true" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">{probefahrt ? 'Probefahrt' : 'Fahrtmodus'}</p>
            <p className="truncate text-sm text-sbb-metal dark:text-sbb-storm">
              {titel}{probefahrt ? ` · ${ZEITRAFFER}-mal schneller` : ''}
            </p>
          </div>
          <button
            type="button" onClick={() => beenden([...hinter.current].sort((a, b) => a.s - b.s))}
            className="shrink-0 border border-sbb-cloud px-4 py-2 font-medium hover:border-sbb-black
                       dark:border-sbb-iron dark:hover:border-sbb-white"
          >
            Beenden
          </button>
        </div>

        {/* ohne role="status": GPS-Genauigkeit und Tempo ändern sich laufend, ein
            Bildschirmleser würde sonst ununterbrochen vorlesen */}
        <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
          {zustand(meldung, stand, ohneGps, imTunnel !== null, probefahrt)}
          {faehrt && !ohneGps && ` · etwa ${Math.round(stand!.v * 3.6)} km/h`}
        </p>
        {gegenrichtung && (
          <p className="mt-2 border-l-2 border-sbb-red pl-3 text-sm">
            Der Standort bewegt sich gegen die Richtung dieses Wegs. Vielleicht sind Start und
            Ziel vertauscht.
          </p>
        )}

        {imTunnel && einstellung.tunnel && sJetzt !== null && (
          <div className="mt-5 rounded-lg bg-sbb-charcoal px-4 py-4 text-sbb-white">
            <p className="text-xs uppercase tracking-wide text-sbb-storm">Im Tunnel</p>
            <p className="text-xl font-bold">{text(imTunnel)?.name}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {faehrt ? `Ausfahrt ${dauer((imTunnel.sAus! - sJetzt) / stand!.v)}` : 'Zug steht'}
            </p>
            <TunnelBalken anteil={(sJetzt - imTunnel.s) / (imTunnel.sAus! - imTunnel.s || 1)} />
          </div>
        )}

        {naechstes ? (
          <div className="mt-5 space-y-2">
            {zugleich.map(karte)}
          </div>
        ) : stand && sJetzt !== null ? (
          <p className="mt-5 text-lg">Auf dem Rest dieses Wegs ist nichts mehr zu melden.</p>
        ) : null}

        <Streckenband fahrweg={fahrweg} objekte={gewaehlt} sJetzt={sJetzt}
                      start={titel.split(' → ')[0]} ziel={titel.split(' → ')[1] ?? ''}
                      name={(o) => text(o)?.name} />

        {danach.length > 0 && (
          <>
            <p className="mt-6 text-sm font-medium">Danach</p>
            <ol className="mt-2 kachelliste">
              {danach.slice(0, 3).map((o) => (
                <li key={`${o.art} ${o.kennung}`} className="flex justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{text(o)?.name}</span>
                    <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                      {ART[o.art]}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-sbb-metal dark:text-sbb-storm">
                    {eta(o) !== null ? dauer(eta(o)!) : ''}
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
              ])} auf diesem Weg
            </p>
          </>
        )}

        <FahrtKarte fahrweg={fahrweg} objekte={gewaehlt} sJetzt={sJetzt} />

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
          <label className="flex items-center justify-between gap-3">
            <span>Ton bei der Meldung</span>
            <input type="checkbox" checked={einstellung.ton} className="size-5 accent-sbb-red"
                   onChange={(e) => aendern({ ton: e.target.checked })} />
          </label>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
          Der Standort bleibt auf diesem Gerät und wird weder gespeichert noch gesendet. Die Zeiten
          sind Schätzungen aus Standort und Tempo. Gemeldet wird nur, solange diese Seite offen und
          der Bildschirm an ist. Auf Strecken anderer Bahnen fehlen Tunnel und Brücken. Als Bahnhof
          gemeldet werden die Betriebspunkte des Wegs, die in Taktland eine Seite haben, auch wo
          der Zug nicht hält: Einen Fahrplan enthalten die Daten nicht.
        </p>
      </div>
    </div>
  )
}

function zustand(meldung: Meldung | null, stand: Stand | null, ohneGps: boolean, imTunnel: boolean,
                 probefahrt: boolean) {
  if (meldung?.art === 'verweigert') return freigabeHilfe('ohne ihn geht der Fahrtmodus nicht')
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
