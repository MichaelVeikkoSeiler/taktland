import { useEffect, useMemo, useRef, useState } from 'react'
import { geometrieLaden, streckenLaden } from '../daten'
import { geometrieLesen } from '../fahrt'
import { laufendEnde, laufendHierSetzen, laufendLesen } from '../laufend'
import { leereFahrtenWeg } from '../erlebt'
import {
  type Erkennung, erkennen, type Fix, type Kandidat, linieMerken, linieZuletzt, nachbarnVon, spurLesen, stueckeBauen,
} from '../ohneziel'
import type { BahnhofIndex, StreckenNetz } from '../typen'
import { freigabeHilfe } from '../umgebung'
import { fahrtAdresse } from './Strecke'

/** So viele Standorte der letzten Minuten zählen für die Richtung */
const FIXES_MAX = 40
const FIXES_ALTER_S = 180

type Zustand =
  | { art: 'laedt' } | { art: 'fehler'; text: string } | { art: 'verweigert' } | { art: 'sucht' }
  | { art: 'erkennung'; e: Erkennung; genau: number }

/**
 * «Ohne Ziel» (Michael, 2026-09-26): Taktland erkennt aus einigen Standorten
 * die Linie und die Richtung und startet dann den Fahrtmodus bis zum Ende der
 * Linie. Ist nicht klar, welche Linie, fragt die Seite nach.
 */
export function OhneZiel({ index }: { index: BahnhofIndex | null }) {
  const [daten, setDaten] = useState<{ netz: StreckenNetz; linien: ReturnType<typeof geometrieLesen> } | null>(null)
  const [zustand, setZustand] = useState<Zustand>({ art: 'laedt' })
  // die Standorte vom Fahrtmodus vorher, damit die Richtung schneller klar ist
  const fixes = useRef<Fix[]>(spurLesen().filter((f) => Date.now() - f.t < 60_000))
  const gestartet = useRef(false)
  // eine laufende Fahrt ohne Ziel geht weiter; oben fragt niemand «fortsetzen?»
  const [weiter] = useState(() => laufendLesen()?.ohne === true)
  useEffect(() => {
    laufendHierSetzen(true)
    return () => laufendHierSetzen(false)
  }, [])

  useEffect(() => {
    let ab = false
    Promise.all([streckenLaden(), geometrieLaden()])
      .then(([n, g]) => { if (!ab) { setDaten({ netz: n, linien: geometrieLesen(g) }); setZustand({ art: 'sucht' }) } })
      .catch((e: Error) => { if (!ab) setZustand({ art: 'fehler', text: e.message }) })
    return () => { ab = true }
  }, [])

  const uicVon = useMemo(() => new Map(Object.entries(daten?.netz.bahnhoefe ?? {}).map(([u, a]) => [a, Number(u)])),
                         [daten])
  const bahnhof = useMemo(() => new Map((index?.bahnhoefe ?? []).map((b) => [b.uic, b])), [index])
  const istBahnhof = (abk: string) => bahnhof.has(uicVon.get(abk) ?? 0)
  const stuecke = useMemo(() => (daten ? stueckeBauen(daten.netz, daten.linien) : []), [daten])
  const nachbarn = useMemo(() => (daten ? nachbarnVon(daten.netz) : new Map()), [daten])

  function starten(k: Kandidat) {
    if (gestartet.current) return
    gestartet.current = true
    linieMerken(k.linie)
    // von und nach nur zur Anzeige; der Weg steht in weg
    const uic = (abk: string) => uicVon.get(abk) ?? null
    window.location.hash = fahrtAdresse({ von: uic(k.punkte[0]), nach: uic(k.ende), ueber: null,
                                          weg: k.punkte, ohne: true })
  }

  useEffect(() => {
    if (!daten || !index) return
    if (!('geolocation' in navigator)) {
      setZustand({ art: 'fehler', text: 'Dieser Browser gibt keinen Standort heraus.' })
      return
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const jetzt = Date.now()
        fixes.current = [...fixes.current, { lat: pos.coords.latitude, lon: pos.coords.longitude,
                                             genau: pos.coords.accuracy, t: jetzt }]
          .filter((f) => jetzt - f.t < FIXES_ALTER_S * 1000).slice(-FIXES_MAX)
        const e = erkennen(stuecke, nachbarn, fixes.current, istBahnhof, weiter ? linieZuletzt() : null)
        setZustand({ art: 'erkennung', e, genau: pos.coords.accuracy })
        if (e.art === 'eindeutig') starten(e.kandidat)
      },
      // ein kurzer Aussetzer ändert nichts an dem, was schon erkannt ist
      (err) => setZustand((z) => err.code === err.PERMISSION_DENIED ? { art: 'verweigert' }
        : z.art === 'erkennung' ? z : { art: 'fehler', text: 'Der Standort ist gerade nicht zu bekommen.' }),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daten, index, stuecke])

  const name = (abk: string) => bahnhof.get(uicVon.get(abk) ?? 0)?.name ?? daten?.netz.punkte[abk] ?? abk

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Ohne Ziel</h1>
      <p className="mt-2 leading-relaxed">
        Taktland erkennt aus einigen Standorten, auf welcher Strecke und in welche Richtung der Zug
        fährt, und meldet, was auf derselben Linie vorne liegt. Verzweigt sich die Linie, sucht
        Taktland dort neu. Das braucht einige hundert Meter Fahrt.
      </p>

      <div className="kachel mt-5 px-4 py-4" role="status">
        {zustand.art === 'laedt' && <p>Das Netz wird geladen …</p>}
        {zustand.art === 'fehler' && <p>{zustand.text}</p>}
        {zustand.art === 'verweigert' && <p>{freigabeHilfe('ohne ihn geht «Ohne Ziel» nicht')}</p>}
        {zustand.art === 'sucht' && <p>Standort wird gesucht …</p>}
        {zustand.art === 'erkennung' && zustand.e.art === 'abseits' && (
          <p>Noch auf keiner Strecke im Netz (GPS auf etwa {Math.round(zustand.genau)} m genau). Taktland sucht weiter.</p>
        )}
        {zustand.art === 'erkennung' && zustand.e.art === 'richtung' && (
          <p>Auf einer Strecke. Die Richtung ist noch nicht klar; das braucht etwas Fahrt.</p>
        )}
        {zustand.art === 'erkennung' && zustand.e.art === 'eindeutig' && (
          <p>Erkannt: Richtung {name(zustand.e.kandidat.ende)}. «Fahren» startet …</p>
        )}
        {zustand.art === 'erkennung' && zustand.e.art === 'mehrere' && (
          <>
            <p className="font-bold">Welche Linie fährst du?</p>
            <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
              Hier liegen mehrere Strecken nebeneinander. Taktland rät nicht.
            </p>
            <ul className="mt-3 grid gap-2">
              {zustand.e.kandidaten.map((k) => (
                <li key={k.punkte.join('.')}>
                  <button type="button" onClick={() => starten(k)}
                          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2
                                     text-left hover:bg-sbb-milk dark:bg-sbb-midnight dark:hover:bg-sbb-charcoal">
                    <span className="min-w-0">
                      <span className="block font-medium">Richtung {name(k.ende)}</span>
                      <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                        {k.linie !== null ? `Linie ${k.linie}, ` : ''}als Nächstes {name(k.richtung)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-sbb-red">Starten</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
              Ohne Wahl sucht Taktland weiter, bis nur noch eine Strecke passt.
            </p>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a href="#/fahrt"
           onClick={() => { if (weiter) { laufendEnde(); leereFahrtenWeg() } }}
           className="border border-sbb-cloud bg-white px-4 py-2 font-medium hover:border-sbb-black
                      dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white">
          {weiter ? 'Fahrt beenden' : 'Abbrechen'}
        </a>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
        Der Standort bleibt auf diesem Gerät. Als Strecke gilt jeder Abschnitt mit Personenzügen im
        Netz der Seite «Strecke»; der Weg folgt derselben Linie der Infrastruktur, bis diese sich
        verzweigt. Eine Linie ist eine Strecke, keine Zuglinie: Wohin der Zug fährt, sagen die
        Daten nicht.
      </p>
    </div>
  )
}
