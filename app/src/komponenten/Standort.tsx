import { useEffect, useMemo, useState } from 'react'
import { karteLaden, standortLaden } from '../daten'
import type { BahnhofIndex, KartenDaten, StandortDaten } from '../typen'
import {
  abstandText, bahnhoefeBei, freigabeHilfe, type Lage, linienBei, objekteBei, type Treffer,
  type UmgebungsArt,
} from '../umgebung'
import { LAENGE_ZU_BREITE, lesen, pfad, type Stueck, zwischen } from './Karte'
import { Ladefehler } from './Ladefehler'
import { BahnKuerzel } from './Suche'

interface Standpunkt extends Lage {
  /** Genauigkeit laut Gerät, in Metern */
  genau: number | null
}

type Meldung = { art: 'verweigert' } | { art: 'fehler'; text: string }

/**
 * Bleibt stehen, solange die App offen ist: Zurück von einem Bahnhof zeigt
 * die Seite den letzten Standort und sucht weiter, ohne erneut zu fragen.
 * Nur im Speicher, nie auf dem Gerät abgelegt.
 */
const merker: { aktiv: boolean; stand: Standpunkt | null } = { aktiv: false, stand: null }

const ABSCHNITTE: Array<{ art: UmgebungsArt; titel: string }> = [
  { art: 'bahnhoefe', titel: 'Bahnhöfe' },
  { art: 'linien', titel: 'Strecken' },
  { art: 'bruecken', titel: 'Brücken' },
  { art: 'tunnel', titel: 'Tunnel' },
  { art: 'bahnuebergaenge', titel: 'Bahnübergänge' },
]

/** So viele je Abschnitt, mit «Mehr zeigen» so viele */
const WENIGE = 5
const MEHR = 15

/**
 * Was liegt in der Nähe? Die nächsten Bahnhöfe, Linien, Tunnel, Brücken und
 * Bahnübergänge rund um den Standort, mit Luftlinie und kleiner Karte. Die
 * Lage jedes Objekts stammt aus seiner Quelle (data/standort.json, die
 * Bahnhöfe aus ihren Fakten); gerechnet wird nur der Abstand, auf dem Gerät.
 */
export function Standort({ index }: { index: BahnhofIndex | null }) {
  const [daten, setDaten] = useState<StandortDaten | null>(null)
  const [karte, setKarte] = useState<KartenDaten | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [aktiv, setAktiv] = useState(merker.aktiv)
  const [stand, setStand] = useState<Standpunkt | null>(merker.stand)
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const [offen, setOffen] = useState<Set<UmgebungsArt>>(new Set())

  useEffect(() => {
    let abgebrochen = false
    Promise.all([standortLaden(), karteLaden()])
      .then(([s, k]) => { if (!abgebrochen) { setDaten(s); setKarte(k) } })
      .catch((e: Error) => { if (!abgebrochen) setLadefehler(e.message) })
    return () => { abgebrochen = true }
  }, [])

  function starten(an: boolean) {
    merker.aktiv = an
    setAktiv(an)
    if (an) setMeldung(null)
  }

  useEffect(() => {
    if (!aktiv) return
    if (!('geolocation' in navigator)) {
      setMeldung({ art: 'fehler', text: 'Dieser Browser gibt keinen Standort heraus.' })
      return
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const neu = { lat: pos.coords.latitude, lon: pos.coords.longitude, genau: pos.coords.accuracy ?? null }
        merker.stand = neu
        setStand(neu)
        setMeldung(null)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          merker.aktiv = false
          setAktiv(false)
          setMeldung({ art: 'verweigert' })
        } else {
          setMeldung({ art: 'fehler', text: 'Der Standort ist gerade nicht zu bekommen. Taktland versucht es weiter.' })
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [aktiv])

  const linien = useMemo(() => (karte ? lesen(karte) : null), [karte])

  const treffer = useMemo(() => {
    if (!stand || !daten || !linien || !index) return null
    return {
      bahnhoefe: bahnhoefeBei(stand, index),
      linien: linienBei(stand, linien, daten),
      tunnel: objekteBei(stand, daten, 'tunnel'),
      bruecken: objekteBei(stand, daten, 'bruecken'),
      bahnuebergaenge: objekteBei(stand, daten, 'bahnuebergaenge'),
    } satisfies Record<UmgebungsArt, Treffer[]>
  }, [stand, daten, linien, index])

  const ohneLage = index ? index.bahnhoefe.filter((b) => b.lat === null || b.lon === null).length : 0

  return (
    <main className="px-4 py-6">
      <h2 className="text-2xl font-bold tracking-tight">Standort</h2>
      <p className="mt-2 text-sbb-metal dark:text-sbb-storm">
        Welche Bahnhöfe, Strecken, Brücken, Tunnel und Bahnübergänge liegen in deiner Nähe? Der
        Standort bleibt auf diesem Gerät; Taktland schickt ihn nirgends hin.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!aktiv ? (
          <button type="button" onClick={() => starten(true)}
                  className="bg-sbb-red px-4 py-2 font-bold text-white hover:bg-sbb-red125">
            {stand ? 'Standort weiter verfolgen' : 'Standort bestimmen'}
          </button>
        ) : (
          <button type="button" onClick={() => starten(false)}
                  className="border border-sbb-cloud px-4 py-2 font-medium hover:border-sbb-black
                             dark:border-sbb-iron dark:hover:border-sbb-white">
            Anhalten
          </button>
        )}
        <p className="text-sm text-sbb-metal dark:text-sbb-storm" aria-live="polite">
          {zustand(aktiv, stand, meldung)}
        </p>
      </div>

      {meldung?.art === 'verweigert' && (
        <p className="mt-3 border-l-2 border-sbb-red pl-3 text-sm">
          {freigabeHilfe('ohne ihn bleibt diese Seite leer')}
        </p>
      )}

      {ladefehler && (
        <Ladefehler className="mt-6" was="Die Daten zur Umgebung konnten nicht geladen werden."
                    fehler={ladefehler} />
      )}

      {stand && treffer && linien && karte && daten && (
        <>
          <UmgebungsKarte stand={stand} linien={linien} karte={karte} daten={daten}
                          naechsteLinie={treffer.linien[0]?.m ?? null}
                          bahnhoefe={treffer.bahnhoefe} />
          {ABSCHNITTE.map(({ art, titel }) => {
            const alle = treffer[art]
            const zeigen = alle.slice(0, offen.has(art) ? MEHR : WENIGE)
            return (
              <section key={art} className="mt-8">
                <h3 className="text-lg font-bold">{titel}</h3>
                <ul className="mt-2 space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
                  {zeigen.map((t) => <Eintrag key={t.schluessel} t={t} />)}
                </ul>
                {!offen.has(art) && alle.length > WENIGE && (
                  <button type="button" onClick={() => setOffen((o) => new Set(o).add(art))}
                          className="mt-2 text-sm text-sbb-metal underline underline-offset-2
                                     hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white">
                    Mehr zeigen
                  </button>
                )}
              </section>
            )
          })}
          <p className="mt-8 text-xs text-sbb-metal dark:text-sbb-storm">
            Abstände: Luftlinie von deinem Standort, auf dem Gerät gerechnet, kein Weg. Tunnel,
            Brücken und Bahnübergänge stehen an dem Punkt, den ihre Quelle als Lage nennt; ein
            Tunnel ist dabei ein einzelner Punkt, nicht die ganze Röhre. Bei den Linien zählt der
            nächste Punkt der vereinfachten Linienführung, auf etwa 30 m genau. Bahnhöfe: ihre
            Lage aus den Fakten{ohneLage > 0 && `; ${ohneLage} ohne Lage in den Daten fehlen`}.
            Tunnel, Brücken, Bahnübergänge und Linien stammen aus Datensätzen der SBB; was dort
            nicht erfasst ist, fehlt auch hier. Datenstand: tunnel {daten.datenstand.tunnel},
            brucken {daten.datenstand.brucken}, bahnubergang {daten.datenstand.bahnubergang},
            linie {daten.datenstand.linie}.
          </p>
        </>
      )}
      {stand && !treffer && !ladefehler && (
        <p className="mt-6 text-sbb-metal dark:text-sbb-storm">Wird geladen …</p>
      )}
    </main>
  )
}

function zustand(aktiv: boolean, stand: Standpunkt | null, meldung: Meldung | null) {
  if (meldung?.art === 'fehler') return meldung.text
  if (meldung?.art === 'verweigert') return null
  if (!aktiv) return stand ? 'Angehalten: Die Liste zeigt den letzten Standort.' : null
  if (!stand) return 'Standort wird gesucht …'
  return stand.genau !== null
    ? `Auf etwa ${abstandText(stand.genau).replace('unter ', '')} genau (laut Gerät), wird laufend nachgeführt.`
    : 'Wird laufend nachgeführt.'
}

function Eintrag({ t }: { t: Treffer }) {
  const innen = (
    <>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-sbb-black dark:text-sbb-white">{t.name}</span>
          {t.isb && <BahnKuerzel isb={t.isb} />}
        </span>
        {t.zusatz && (
          <span className="block truncate text-sm text-sbb-metal dark:text-sbb-storm">{t.zusatz}</span>
        )}
      </span>
      <span className="shrink-0 text-sm text-sbb-metal dark:text-sbb-storm">
        {abstandText(t.m)}{t.adresse && <span className="pfeil" aria-hidden="true"> →</span>}
      </span>
    </>
  )
  const stil = 'flex w-full items-center justify-between gap-3 border px-4 py-3 text-left'
  return (
    <li>
      {t.adresse ? (
        <a href={t.adresse}
           className={`${stil} border-sbb-cloud bg-white transition hover:border-sbb-black
                       dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white`}>
          {innen}
        </a>
      ) : (
        <div className={`${stil} border-dashed border-sbb-cloud dark:border-sbb-iron`}>{innen}</div>
      )}
    </li>
  )
}

/** Breite des Ausschnitts in km */
const AUSSCHNITTE = [2, 6, 20, 60]
/** Meter je Einheit der Zeichnung: y ist Breite in Grad, x Länge mal LAENGE_ZU_BREITE */
const M_JE_EINHEIT = 111_200
const SEITENVERHAELTNIS = 1.6

/**
 * Kleine Karte rund um den Standort, gezeichnet aus den Daten wie die Karten
 * bei Tunneln und Brücken: grau die Linien, Ringe die Bahnhöfe, rot Tunnel
 * und Brücken, Quadrate die Bahnübergänge, ein gefüllter Punkt der Standort.
 */
function UmgebungsKarte({ stand, linien, karte, daten, bahnhoefe, naechsteLinie }: {
  stand: Standpunkt
  linien: Map<number, Stueck[]>
  karte: KartenDaten
  daten: StandortDaten
  bahnhoefe: Treffer[]
  naechsteLinie: number | null
}) {
  // von selbst 6 km breit, weiter, wenn sonst keine Linie im Bild wäre
  const vorschlag = AUSSCHNITTE.find((km) => km >= 6 && naechsteLinie !== null
    && naechsteLinie * 2.2 < km * 1000 / SEITENVERHAELTNIS) ?? AUSSCHNITTE[AUSSCHNITTE.length - 1]
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  const breiteKm = gewaehlt ?? vorschlag

  const cx = stand.lon * LAENGE_ZU_BREITE
  const cy = -stand.lat
  const w = (breiteKm * 1000) / M_JE_EINHEIT
  const h = w / SEITENVERHAELTNIS
  const box = [cx - w / 2, cy - h / 2, w, h]
  const px = w / 350
  const drin = (x: number, y: number) => Math.abs(x - cx) < w * 0.55 && Math.abs(y - cy) < h * 0.55
  const lage = (la: number, lo: number): [number, number] => [lo * LAENGE_ZU_BREITE, -la]

  const stuecke = useMemo(() => {
    const raus: Array<{ nr: number; s: Stueck; i: number }> = []
    for (const [nr, ss] of linien) {
      ss.forEach((s, i) => {
        if (s.x.some((x, j) => Math.abs(x - cx) < w && Math.abs(s.y[j] - cy) < h)) raus.push({ nr, s, i })
      })
    }
    return raus
  }, [linien, cx, cy, w, h])

  const punkte = (art: 'tunnel' | 'bruecken' | 'bahnuebergaenge') => daten[art].flatMap(([linie, stelle, name, la, lo]) => {
    if (la === null || lo === null) return []
    const [x, y] = lage(la, lo)
    return drin(x, y) ? [{ kennung: `${linie}:${stelle}`, linie, name, x, y }] : []
  })
  const tunnel = punkte('tunnel')
  const bruecken = punkte('bruecken')
  const uebergaenge = punkte('bahnuebergaenge')
  const stationen = bahnhoefe.flatMap((b) => {
    if (b.m > w * M_JE_EINHEIT || !b.lage) return []
    const [x, y] = lage(b.lage[0], b.lage[1])
    return drin(x, y) ? [{ ...b, x, y }] : []
  })
  // beschriftet die nächsten, solange sich die Namen nicht überdecken; die
  // Breite eines Namens ist geschätzt, der Name bleibt ganz im Bild
  const beschriftet: Array<{ schluessel: string; name: string; x: number; y: number; anker: 'start' | 'end' }> = []
  const belegt: Array<[number, number, number, number]> = []
  for (const b of stationen.slice(0, 8)) {
    if (beschriftet.length === 4) break
    const breite = b.name.length * 6.2 * px
    const rechts = b.x + 6 * px + breite < box[0] + w - 3 * px
    const x0 = rechts ? b.x + 6 * px : b.x - 6 * px - breite
    if (x0 < box[0] + 3 * px) continue
    const feld: [number, number, number, number] = [x0, b.y - 6 * px, x0 + breite, b.y + 6 * px]
    if (belegt.some((f) => f[0] < feld[2] && feld[0] < f[2] && f[1] < feld[3] && feld[1] < f[3])) continue
    belegt.push(feld)
    beschriftet.push({ schluessel: b.schluessel, name: b.name, y: b.y,
                       x: rechts ? b.x + 6 * px : b.x - 6 * px, anker: rechts ? 'start' : 'end' })
  }
  const genauR = stand.genau !== null ? stand.genau / M_JE_EINHEIT : 0

  return (
    <figure className="mt-6">
      <div className="flex items-center justify-end gap-3 text-xs">
        <span className="text-sbb-metal dark:text-sbb-storm">Breite</span>
        {AUSSCHNITTE.map((km) => (
          <button key={km} type="button" onClick={() => setGewaehlt(km)} aria-pressed={km === breiteKm}
                  className={`underline-offset-2 ${km === breiteKm
                    ? 'font-bold text-sbb-black dark:text-sbb-white'
                    : 'text-sbb-metal underline hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white'}`}>
            {km} km
          </button>
        ))}
      </div>
      <svg viewBox={box.join(' ')} role="img" preserveAspectRatio="xMidYMid meet"
           aria-label={`Karte rund um deinen Standort, ${breiteKm} km breit`}
           className="mt-1 aspect-[1.6] w-full border border-sbb-cloud bg-white dark:border-sbb-iron
                      dark:bg-sbb-midnight">
        {stuecke.map(({ nr, s, i }) => (
          <path key={`${nr}-${i}`} d={pfad(s.x.map((x, j) => [x, s.y[j]]))} fill="none"
                className="stroke-sbb-metal dark:stroke-sbb-storm" strokeWidth={1.5}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
        {tunnel.map((t) => {
          const bereich = karte.tunnel[t.kennung]
          const eigene = linien.get(t.linie) ?? []
          if (bereich && bereich[0] !== bereich[1] && eigene.length) {
            return <path key={`t${t.kennung}`} d={pfad(zwischen(eigene, bereich[0], bereich[1]))}
                         fill="none" className="stroke-sbb-red" strokeWidth={5}
                         vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          }
          return <circle key={`t${t.kennung}`} cx={t.x} cy={t.y} r={3.5 * px} className="fill-sbb-red" />
        })}
        {bruecken.map((b) => (
          <circle key={`b${b.kennung}`} cx={b.x} cy={b.y} r={1.8 * px} className="fill-sbb-red" />
        ))}
        {uebergaenge.map((u) => (
          <rect key={`u${u.kennung}`} x={u.x - 2.2 * px} y={u.y - 2.2 * px} width={4.4 * px}
                height={4.4 * px} className="fill-sbb-charcoal dark:fill-sbb-white" />
        ))}
        {stationen.map((b) => (
          <circle key={b.schluessel} cx={b.x} cy={b.y} r={3.5 * px} strokeWidth={1.3}
                  vectorEffect="non-scaling-stroke"
                  className="fill-white stroke-sbb-charcoal dark:fill-sbb-midnight dark:stroke-sbb-white" />
        ))}
        {beschriftet.map((b) => (
          <text key={`n${b.schluessel}`} x={b.x} y={b.y + 3.5 * px}
                fontSize={10.5 * px} fontWeight="bold" textAnchor={b.anker}
                className="fill-sbb-black stroke-white dark:fill-sbb-white dark:stroke-sbb-midnight"
                strokeWidth={3} paintOrder="stroke" vectorEffect="non-scaling-stroke">{b.name}</text>
        ))}
        {genauR > 0 && (
          <circle cx={cx} cy={cy} r={genauR} className="fill-sbb-charcoal/10 dark:fill-sbb-white/15" />
        )}
        <circle cx={cx} cy={cy} r={5 * px} strokeWidth={2} vectorEffect="non-scaling-stroke"
                className="fill-sbb-black stroke-white dark:fill-sbb-white dark:stroke-sbb-black" />
      </svg>
      <figcaption className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
        Gezeichnet aus den Daten der SBB, ohne Strassen und ohne Kartenbilder eines fremden
        Dienstes. Der grosse gefüllte Punkt ist dein Standort, der Kreis darum seine
        Genauigkeit laut Gerät. Ringe: Bahnhöfe, beschriftet die nächsten, soweit Platz ist.
        Rot: Tunnel (als Strecke, wo die Daten die Richtung der Länge hergeben, sonst als
        Punkt) und Brücken (kleine Punkte). Quadrate: Bahnübergänge. Graue Linien: das
        Streckennetz. Punkte stehen dort, wo ihre Quelle die Lage angibt, nicht immer genau
        auf der gezeichneten Linie.
      </figcaption>
    </figure>
  )
}
