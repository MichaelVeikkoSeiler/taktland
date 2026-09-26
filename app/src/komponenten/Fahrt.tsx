import { useCallback, useEffect, useMemo, useState } from 'react'
import { tonBereitlegen } from '../fahrt'
import {
  favoritUmschalten, gemerktLesen, type GemerkteFahrt, probefahrtEinsetzen, probefahrtUmschalten,
} from '../fahrten'
import { alphabetisch, useFavoriten } from '../favoriten'
import type { BahnhofIndex, IndexEintrag } from '../typen'
import { abstandM, abstandText, freigabeHilfe } from '../umgebung'
import { BahnhofFeld, fahrtAdresse, type StreckenWahl } from './Strecke'
import { Stern } from './Stern'

type Art = 'ziel' | 'beide'
const ART_MERKEN = 'taktland.fahrtwahl.v1'

function artLesen(): Art {
  try { return localStorage.getItem(ART_MERKEN) === 'beide' ? 'beide' : 'ziel' } catch { return 'ziel' }
}

/** Ab so vielen Metern bis zum nächsten Bahnhof fragt die Seite nach */
const WEIT_M = 3000

type Suche =
  | { art: 'aus' } | { art: 'sucht' } | { art: 'verweigert' } | { art: 'fehler'; text: string }
  | { art: 'gefunden'; uic: number; m: number; genau: number }

/**
 * Der Weg in den Fahrtmodus über den Spezialknopf: nur das Ziel eingeben
 * (Start ist der nächste Bahnhof im Netz, per GPS) oder Start und Ziel wie auf
 * der Seite «Strecke», dazu die gemerkten Fahrten. Gestartet wird
 * auf der Seite «Strecke», die den Weg sucht.
 */
export function Fahrt({ index }: { index: BahnhofIndex | null }) {
  const [art, setArt] = useState<Art>(artLesen)
  const [wahl, setWahl] = useState<StreckenWahl>({ von: null, nach: null, ueber: null })
  const [suche, setSuche] = useState<Suche>({ art: 'aus' })
  const [gemerkt, setGemerkt] = useState(gemerktLesen)
  const [entfernt, setEntfernt] = useState<{ f: GemerkteFahrt; stelle: number } | null>(null)
  useEffect(() => {
    if (!entfernt) return
    const uhr = setTimeout(() => setEntfernt(null), 8000)
    return () => clearTimeout(uhr)
  }, [entfernt])

  const bahnhof = useMemo(() => new Map((index?.bahnhoefe ?? []).map((b) => [b.uic, b])), [index])
  const name = useCallback((uic: number | null) => (uic ? bahnhof.get(uic)?.name ?? String(uic) : ''),
                           [bahnhof])
  // nur Bahnhöfe, zu denen die Seite «Strecke» Wege kennt
  const imNetz = useMemo(() => (index?.bahnhoefe ?? []).filter((b) => b.im_netz), [index])
  // Favoritenbahnhöfe als Ziel mit einem Tipp (Michael, 2026-09-26)
  const favoritenUic = useFavoriten()
  const favoriten = useMemo(() => alphabetisch(favoritenUic.map((u) => bahnhof.get(u))
    .filter((b): b is IndexEintrag => !!b && b.im_netz)), [favoritenUic, bahnhof])

  function artWaehlen(a: Art) {
    setArt(a)
    try { localStorage.setItem(ART_MERKEN, a) } catch { /* dann gilt es nur jetzt */ }
  }

  function standortSuchen() {
    if (!('geolocation' in navigator)) {
      setSuche({ art: 'fehler', text: 'Dieser Browser gibt keinen Standort heraus.' })
      return
    }
    setSuche({ art: 'sucht' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        let best: { b: IndexEintrag; m: number } | null = null
        for (const b of imNetz) {
          if (b.lat === null || b.lon === null) continue
          const m = abstandM(p, b.lat, b.lon)
          if (!best || m < best.m) best = { b, m }
        }
        if (!best) {
          setSuche({ art: 'fehler', text: 'Kein Bahnhof im Netz gefunden.' })
          return
        }
        setSuche({ art: 'gefunden', uic: best.b.uic, m: best.m, genau: pos.coords.accuracy })
      },
      (err) => setSuche(err.code === err.PERMISSION_DENIED ? { art: 'verweigert' }
        : { art: 'fehler', text: 'Der Standort ist gerade nicht zu bekommen.' }),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )
  }

  // «Nur Ziel»: den Start gleich suchen, sobald die Bahnhöfe da sind
  useEffect(() => {
    if (art === 'ziel' && index && suche.art === 'aus') standortSuchen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, index])

  const von = art === 'ziel' ? (suche.art === 'gefunden' ? suche.uic : null) : wahl.von
  const fahrt: StreckenWahl = { von, nach: wahl.nach, ueber: art === 'ziel' ? null : wahl.ueber }
  const bereit = fahrt.von !== null && fahrt.nach !== null && fahrt.von !== fahrt.nach

  function starten(w: StreckenWahl, probe = false) {
    // der Ton braucht den Tipp; die Seite «Strecke» holt ihn beim Start ab
    tonBereitlegen()
    window.location.hash = fahrtAdresse(w, probe)
  }

  const fahrtText = (f: GemerkteFahrt) =>
    `${name(f.von)} → ${name(f.nach)}${f.ueber ? ` (über ${name(f.ueber)})` : ''}`

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Fahrtmodus</h1>
      <p className="mt-2 leading-relaxed">
        Im Zug meldet Taktland Tunnel, Brücken und Bahnhöfe auf deinem Weg, etwa 20 oder 10
        Sekunden vorher. Er braucht den Standort; dieser bleibt auf dem Gerät.
      </p>

      {/* Letzte Fahrten, Sammelheft und Logbuch stehen in der Reisetasche
          (Michael, 2026-09-25: «Es ist ja bereits alles in der Reisetasche») */}
      {gemerkt.favoriten.length > 0 && index && (
        <div className="mt-6">
          <FahrtListe titel="Gemerkte Fahrten" fahrten={gemerkt.favoriten} text={fahrtText}
                      favorit={() => true} starten={(f) => starten(f)}
                      umschalten={(f) => setGemerkt(favoritUmschalten(f))} />
        </div>
      )}

      {/* Probefahrten zum Anwählen, Starten und Löschen (Michael, 2026-09-26) */}
      {index && (gemerkt.probefahrten.length > 0 || entfernt) && (
        <section className="mt-6">
          <h2 className="text-lg font-bold">Probefahrten</h2>
          {entfernt && (
            <div role="status" className="kachel mt-2 flex items-center justify-between gap-3 py-1 pl-4 pr-1">
              <span className="min-w-0">{fahrtText(entfernt.f)} entfernt.</span>
              <button type="button"
                      onClick={() => { setGemerkt(probefahrtEinsetzen(entfernt.f, entfernt.stelle)); setEntfernt(null) }}
                      className="min-h-11 shrink-0 rounded-lg px-3 font-bold text-sbb-red hover:bg-sbb-silver
                                 dark:hover:bg-sbb-iron">
                Rückgängig
              </button>
            </div>
          )}
          <ul className="mt-2 kachelliste">
            {gemerkt.probefahrten.map((f, i) => (
              <li key={`${f.von}-${f.nach}-${f.ueber}`} className="flex items-stretch">
                <button type="button" onClick={() => starten(f, true)}
                        className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3
                                   text-left hover:bg-sbb-milk dark:hover:bg-sbb-charcoal">
                  <span className="min-w-0 font-medium">{fahrtText(f)}</span>
                  <span className="shrink-0 text-sm font-bold text-sbb-red">Abspielen</span>
                </button>
                <button type="button" aria-label={`${fahrtText(f)} aus den Probefahrten entfernen`}
                        title="Aus den Probefahrten entfernen"
                        onClick={() => { setEntfernt({ f, stelle: i }); setGemerkt(probefahrtUmschalten(f)) }}
                        className="flex min-h-11 w-12 shrink-0 items-center justify-center border-l border-sbb-cloud
                                   text-xl text-sbb-metal hover:bg-sbb-milk hover:text-sbb-black
                                   dark:border-sbb-iron dark:text-sbb-storm dark:hover:bg-sbb-charcoal
                                   dark:hover:text-sbb-white">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
            Spielt den Weg im Zeitraffer ab, ohne Standort. Neue Probefahrten kommen auf der Seite
            «Strecke» mit «Als Probefahrt merken» dazu.
          </p>
        </section>
      )}

      <h2 className="mt-8 text-lg font-bold">Neue Fahrt</h2>
      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-sbb-cloud dark:border-sbb-iron" role="group"
           aria-label="Wie wählen">
        {([['ziel', 'Nur Ziel'], ['beide', 'Start und Ziel']] as const).map(([a, t]) => (
          <button key={a} type="button" aria-pressed={art === a} onClick={() => artWaehlen(a)}
                  className={`px-3 py-2 font-medium ${art === a
                    ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                    : 'bg-white text-sbb-black hover:bg-sbb-milk dark:bg-sbb-midnight dark:text-sbb-white'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {art === 'ziel' ? (
          <StartPerGps suche={suche} name={name} neu={standortSuchen}
                       selbst={() => {
                         if (suche.art === 'gefunden') setWahl((w) => ({ ...w, von: suche.uic }))
                         artWaehlen('beide')
                       }} />
        ) : (
          <BahnhofFeld bezeichnung="Von" wert={wahl.von} bahnhoefe={imNetz} name={name}
                       aendern={(u) => setWahl((w) => ({ ...w, von: u }))} />
        )}
        <BahnhofFeld bezeichnung="Nach" wert={wahl.nach} bahnhoefe={imNetz} name={name}
                     aendern={(u) => setWahl((w) => ({ ...w, nach: u }))} />
        {favoriten.length > 0 && (
          <div>
            <span className="block text-xs text-sbb-metal dark:text-sbb-storm">Ziel aus den Favoriten</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {favoriten.map((b) => {
                const hier = wahl.nach === b.uic
                return (
                  <button key={b.uic} type="button" aria-pressed={hier}
                          onClick={() => setWahl((w) => ({ ...w, nach: b.uic }))}
                          className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium ${hier
                            ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                            : 'kachel kachel-link'}`}>
                    {b.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {art === 'beide' && (
          <BahnhofFeld bezeichnung="Über (freiwillig)" wert={wahl.ueber} bahnhoefe={imNetz} name={name}
                       aendern={(u) => setWahl((w) => ({ ...w, ueber: u }))} />
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" disabled={!bereit} onClick={() => starten(fahrt)}
                className="rounded-lg bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
          Fahrtmodus starten
        </button>
        <button type="button" disabled={!bereit} onClick={() => starten(fahrt, true)}
                className="border border-sbb-cloud bg-white px-4 py-3 font-medium hover:border-sbb-black
                           disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight
                           dark:hover:border-sbb-white">
          Probefahrt
        </button>
      </div>
      {fahrt.von !== null && fahrt.von === fahrt.nach && (
        <p className="mt-2 text-sm">Start und Ziel sind derselbe Bahnhof.</p>
      )}
      <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
        Zur Auswahl stehen die Bahnhöfe, zu denen Taktland Wege kennt. Gemerkte
        Fahrten bleiben auf diesem Gerät.
      </p>
    </div>
  )
}

function StartPerGps({ suche, name, neu, selbst }: {
  suche: Suche
  name: (uic: number | null) => string
  neu: () => void
  selbst: () => void
}) {
  const knopf = 'text-sm text-sbb-metal underline underline-offset-2 hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white'
  return (
    <div>
      <span className="block text-xs text-sbb-metal dark:text-sbb-storm">Von (nächster Bahnhof per GPS)</span>
      <div className="mt-1 kachel px-4 py-3">
        {suche.art === 'gefunden' ? (
          <>
            <p className="text-lg">{name(suche.uic)}</p>
            <p className="text-sm text-sbb-metal dark:text-sbb-storm">
              {abstandText(suche.m)} entfernt · GPS auf etwa {Math.round(suche.genau)} m genau
            </p>
            {suche.m > WEIT_M && (
              <p className="mt-1 text-sm">Das ist recht weit weg. Stimmt der Start?</p>
            )}
          </>
        ) : suche.art === 'sucht' ? (
          <p className="text-lg text-sbb-metal dark:text-sbb-storm">Standort wird gesucht …</p>
        ) : suche.art === 'verweigert' ? (
          <p>{freigabeHilfe('ohne ihn geht «Nur Ziel» nicht')}</p>
        ) : suche.art === 'fehler' ? (
          <p>{suche.text}</p>
        ) : (
          <p className="text-lg text-sbb-metal dark:text-sbb-storm">…</p>
        )}
      </div>
      <div className="mt-1 flex gap-4">
        {suche.art !== 'sucht' && <button type="button" onClick={neu} className={knopf}>Neu suchen</button>}
        <button type="button" onClick={selbst} className={knopf}>Start selbst wählen</button>
      </div>
    </div>
  )
}

function FahrtListe({ titel, fahrten, text, favorit, starten, umschalten }: {
  titel: string
  fahrten: GemerkteFahrt[]
  text: (f: GemerkteFahrt) => string
  favorit: (f: GemerkteFahrt) => boolean
  starten: (f: GemerkteFahrt) => void
  umschalten: (f: GemerkteFahrt) => void
}) {
  return (
    <section>
      <h2 className="text-lg font-bold">{titel}</h2>
      <ul className="mt-2 kachelliste">
        {fahrten.map((f) => (
          <li key={`${f.von}-${f.nach}-${f.ueber}`} className="flex items-stretch">
            <button type="button" onClick={() => starten(f)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3 text-left
                               hover:bg-sbb-milk dark:hover:bg-sbb-charcoal">
              <span className="min-w-0 truncate font-medium">{text(f)}</span>
              <span className="shrink-0 text-sm font-bold text-sbb-red">Starten</span>
            </button>
            <button type="button" onClick={() => umschalten(f)} aria-pressed={favorit(f)}
                    aria-label={favorit(f) ? 'Nicht mehr merken' : 'Fahrt merken'}
                    className="flex shrink-0 items-center border-l border-sbb-cloud px-3 hover:bg-sbb-milk
                               dark:border-sbb-iron dark:hover:bg-sbb-charcoal">
              <Stern voll={favorit(f)} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}


