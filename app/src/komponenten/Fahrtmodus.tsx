import { useEffect, useMemo, useRef, useState } from 'react'
import { type FahrObjekt, type Fahrweg, lageBei, projizieren, wegEnde } from '../fahrt'

/** So viele Sekunden vor einem Objekt kommt die Meldung */
const VORLAUF_S = 30
/** Die Probefahrt läuft so viel schneller als die Wirklichkeit */
const ZEITRAFFER = 20
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

interface Einstellung { bruecken: BrueckenWahl; ton: boolean }

function einstellungLesen(): Einstellung {
  try {
    const x = JSON.parse(localStorage.getItem(EINSTELLUNG) ?? '{}')
    return { bruecken: ['groessere', 'alle', 'keine'].includes(x.bruecken) ? x.bruecken : 'groessere',
             ton: x.ton !== false }
  } catch {
    return { bruecken: 'groessere', ton: true }
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

type Meldung =
  | { art: 'sucht' } | { art: 'verweigert' } | { art: 'ohneGps' } | { art: 'fehler'; text: string }

/**
 * Der Fahrtmodus über der Seite «Strecke». Er zeigt das nächste Objekt und
 * meldet es mit einem Ton etwa 30 Sekunden vorher. Nur solange die Seite
 * offen ist: Ein Browser darf im Hintergrund nicht weiterrechnen.
 */
export function Fahrtmodus({ fahrweg, text, probefahrt, piepen, titel, beenden }: {
  fahrweg: Fahrweg
  text: (o: FahrObjekt) => ObjektText | undefined
  probefahrt: boolean
  piepen: () => void
  titel: string
  beenden: () => void
}) {
  const [einstellung, setEinstellung] = useState(einstellungLesen)
  const [stand, setStand] = useState<Stand | null>(null)
  const [meldung, setMeldung] = useState<Meldung | null>({ art: 'sucht' })
  const [jetzt, setJetzt] = useState(0)
  const [gegenrichtung, setGegenrichtung] = useState(false)
  const standRef = useRef<Stand | null>(null)
  const gemeldet = useRef(new Set<string>())
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
    if (o.art === 'tunnel') return true
    if (einstellung.bruecken === 'keine') return false
    if (einstellung.bruecken === 'alle') return true
    return (text(o)?.baueinheiten ?? 0) >= 3
  }), [fahrweg, einstellung.bruecken, text])

  const imTunnel = sJetzt === null ? null
    : gewaehlt.find((o) => o.sAus !== null && sJetzt >= o.s && sJetzt <= o.sAus) ?? null
  const kommend = sJetzt === null ? [] : gewaehlt.filter((o) => o.s > sJetzt)
  const eta = (o: FahrObjekt) => (sJetzt !== null && faehrt ? (o.s - sJetzt) / stand!.v : null)

  // Die Meldung: etwa 30 Sekunden vorher, jedes Objekt einmal
  useEffect(() => {
    for (const o of kommend.slice(0, 5)) {
      const e = eta(o)
      const schluessel = `${o.art} ${o.kennung}`
      if (e !== null && e <= VORLAUF_S && !gemeldet.current.has(schluessel)) {
        gemeldet.current.add(schluessel)
        if (einstellung.ton) piepen()
      }
    }
  })

  const naechstes = kommend[0]
  const bald = naechstes && (eta(naechstes) ?? Infinity) <= VORLAUF_S

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-sbb-white text-sbb-black
                    dark:bg-sbb-midnight dark:text-sbb-white" role="dialog" aria-label="Fahrtmodus">
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">{probefahrt ? 'Probefahrt' : 'Fahrtmodus'}</p>
            <p className="truncate text-sm text-sbb-metal dark:text-sbb-storm">
              {titel}{probefahrt ? ` · ${ZEITRAFFER}-mal schneller` : ''}
            </p>
          </div>
          <button
            type="button" onClick={beenden}
            className="shrink-0 border border-sbb-cloud px-4 py-2 font-medium hover:border-sbb-black
                       dark:border-sbb-iron dark:hover:border-sbb-white"
          >
            Beenden
          </button>
        </div>

        <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm" role="status">
          {zustand(meldung, stand, ohneGps, imTunnel !== null, probefahrt)}
          {faehrt && !ohneGps && ` · etwa ${Math.round(stand!.v * 3.6)} km/h`}
        </p>
        {gegenrichtung && (
          <p className="mt-2 border-l-2 border-sbb-red pl-3 text-sm">
            Der Standort bewegt sich gegen die Richtung dieses Wegs. Vielleicht sind Start und
            Ziel vertauscht.
          </p>
        )}

        {imTunnel && (
          <div className="mt-5 bg-sbb-charcoal px-4 py-3 text-sbb-white">
            <p className="text-xs uppercase tracking-wide text-sbb-storm">Im Tunnel</p>
            <p className="text-lg font-bold">{text(imTunnel)?.name}</p>
            {faehrt && sJetzt !== null && (
              <p className="text-sm text-sbb-storm">
                Ausfahrt {dauer((imTunnel.sAus! - sJetzt) / stand!.v)}
              </p>
            )}
          </div>
        )}

        {naechstes ? (
          <div className={`mt-5 border px-4 py-4 ${bald
            ? 'border-l-8 border-sbb-red bg-white dark:bg-sbb-charcoal'
            : 'border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-charcoal'}`}>
            <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
              {bald ? 'Gleich' : 'Als Nächstes'} · {naechstes.art === 'tunnel' ? 'Tunnel' : 'Brücke'}
            </p>
            <p className="mt-1 text-2xl font-bold leading-tight">{text(naechstes)?.name}</p>
            <p className="mt-1 text-sbb-metal dark:text-sbb-storm">{text(naechstes)?.zeile}</p>
            <p className="mt-3 text-3xl font-bold tabular-nums">
              {eta(naechstes) !== null ? dauer(eta(naechstes)!) : stand ? 'Zug steht' : '…'}
            </p>
          </div>
        ) : stand && sJetzt !== null ? (
          <p className="mt-5 text-lg">Auf dem Rest dieses Wegs ist nichts mehr zu melden.</p>
        ) : null}

        {kommend.length > 1 && (
          <>
            <p className="mt-6 text-sm font-medium">Danach</p>
            <ol className="mt-2 divide-y divide-sbb-cloud border border-sbb-cloud dark:divide-sbb-iron
                           dark:border-sbb-iron">
              {kommend.slice(1, 4).map((o) => (
                <li key={`${o.art} ${o.kennung}`} className="flex justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{text(o)?.name}</span>
                    <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                      {o.art === 'tunnel' ? 'Tunnel' : 'Brücke'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-sbb-metal dark:text-sbb-storm">
                    {eta(o) !== null ? dauer(eta(o)!) : ''}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
              Noch {anzahl(kommend.filter((o) => o.art === 'tunnel').length, 'Tunnel', 'Tunnel')} und{' '}
              {anzahl(kommend.filter((o) => o.art === 'bruecke').length, 'Brücke', 'Brücken')} auf diesem Weg
            </p>
          </>
        )}

        <div className="mt-8 grid gap-3 border-t border-sbb-cloud pt-4 text-sm dark:border-sbb-iron">
          <label className="flex items-center justify-between gap-3">
            <span>Brücken melden</span>
            <select
              value={einstellung.bruecken}
              onChange={(e) => aendern({ bruecken: e.target.value as BrueckenWahl })}
              className="border border-sbb-cloud bg-white px-2 py-1 text-sbb-black dark:border-sbb-iron
                         dark:bg-sbb-midnight dark:text-sbb-white"
            >
              <option value="groessere">ab 3 Baueinheiten</option>
              <option value="alle">alle</option>
              <option value="keine">keine</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Ton etwa {VORLAUF_S} Sekunden vorher</span>
            <input type="checkbox" checked={einstellung.ton} className="size-5 accent-sbb-red"
                   onChange={(e) => aendern({ ton: e.target.checked })} />
          </label>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
          Der Standort bleibt auf diesem Gerät und wird weder gespeichert noch gesendet. Die Zeiten
          sind Schätzungen aus Standort und Tempo. Gemeldet wird nur, solange diese Seite offen und
          der Bildschirm an ist. Auf Strecken anderer Bahnen fehlen Tunnel und Brücken.
        </p>
      </div>
    </div>
  )
}

function zustand(meldung: Meldung | null, stand: Stand | null, ohneGps: boolean, imTunnel: boolean,
                 probefahrt: boolean) {
  if (meldung?.art === 'verweigert') return freigabeHilfe()
  if (meldung?.art === 'fehler') return meldung.text
  if (!stand) return probefahrt ? 'Probefahrt beginnt …' : 'Standort wird gesucht …'
  if (stand.abseits !== null) {
    return `Nicht auf dieser Strecke: etwa ${stand.abseits >= 1000
      ? `${Math.round(stand.abseits / 1000)} km` : `${Math.round(stand.abseits / 10) * 10} m`} daneben.`
  }
  if (ohneGps) return imTunnel ? 'Im Tunnel ohne GPS, geschätzt mit dem letzten Tempo' : 'Kein GPS, geschätzt mit dem letzten Tempo'
  return probefahrt ? 'Gespielter Standort' : `GPS auf etwa ${Math.round(stand.genau ?? 0)} m genau`
}

/**
 * Was tun, wenn der Standort gesperrt ist. Auch als installierte App läuft
 * Taktland im Browser, mit dem es installiert wurde; dort liegt die Freigabe.
 * Auf dem Galaxy war das nicht zu erraten («ich habe keinen Browser offen»).
 */
function freigabeHilfe() {
  const ua = navigator.userAgent
  const beginn = 'Der Standort ist nicht freigegeben, ohne ihn geht der Fahrtmodus nicht. '
  if (/Android/i.test(ua)) {
    const samsung = /SamsungBrowser/i.test(ua)
    return beginn + 'Auch als installierte App läuft Taktland im Browser '
      + (samsung ? '«Samsung Internet»: dort unter ☰ → Einstellungen → Website-Berechtigungen → '
                 + 'Standort die Seite zulassen. '
                 : '«Chrome»: Symbol von Taktland gedrückt halten → App-Info → Berechtigungen oder '
                 + 'weitere Einstellungen → Standort → zulassen. Oder in Chrome unter ⋮ → '
                 + 'Einstellungen → Website-Einstellungen → Standort die Seite zulassen. ')
      + 'In den Android-Einstellungen unter Apps muss der Browser zudem den genauen Standort '
      + 'nutzen dürfen. Danach Taktland ganz schliessen und neu öffnen.'
  }
  if (/iPhone|iPad/i.test(ua)) {
    return beginn + 'Auf dem iPhone: Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → '
      + 'Safari-Websites → «Beim Verwenden der App» und «Genauer Standort». Danach Taktland ganz '
      + 'schliessen und neu öffnen.'
  }
  return beginn + 'Die Freigabe lässt sich in den Website-Einstellungen des Browsers erteilen.'
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
