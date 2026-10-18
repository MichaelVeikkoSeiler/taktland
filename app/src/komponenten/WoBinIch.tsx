import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { geometrieLaden, ladenVerfolgen, streckenLaden, uebersichtLaden } from '../daten'
import { type Fahrweg, geometrieLesen, lageBei, wegEnde } from '../fahrt'
import {
  abstandM, distanzText, HILFE_ABZUG, HILFEN, type Hilfe, imGebiet, nullGrenzeM, type Pool, punkte, schweiz11Laden,
  type SpielObjekt, urteil,
} from '../schweiz11'
import type { BahnhofIndex, BrueckenEintrag, StreckenNetz } from '../typen'
import { FAHRT_S, type Runde, RUNDEN, rundeZiehen, TEMPO_ANFANG, TEMPO_STUFEN } from '../wobinich'
import type { PultAussen } from './Fuehrerpult'
import { Ladefehler } from './Ladefehler'
import { type KartenPin, Schweiz11Karte } from './Schweiz11Karte'
import { nachKennung } from './Strecke'
import { Zurueck } from './Zurueck'

const GelaendeFahrt = lazy(() => ladenVerfolgen(import('./Relief')).then((m) => ({ default: m.GelaendeFahrt })))

type Phase = 'fahrt' | 'tipp' | 'aufloesung' | 'ende'
interface Ergebnis { dM: number; punkte: number; hilfen: number }

/** der gefahrene Weg als Zeichnung für die Auflösung auf der Karte */
function zeichnung(fw: Fahrweg, von: number, bis: number): SpielObjekt['z'] {
  const pts = [von, ...fw.punkte.filter((p) => p.s > von && p.s < bis).map((p) => p.s), bis].map((s) => lageBei(fw, s))
  const q = pts.map((p) => [Math.round(p.lat * 1e5), Math.round(p.lon * 1e5)])
  const d: number[] = []
  for (let i = 1; i < q.length; i++) d.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1])
  return { start: [q[0][0], q[0][1]], d }
}

/**
 * «Wo bin ich?» (Michael, 2026-10-18: «Wo bin ich passt gut»): fünf Runden, je eine Fahrt im Führerstand an einer
 * zufälligen Stelle, ohne Namen; danach ein Pin auf der Karte, gewertet wie bei «Geo».
 */
export function WoBinIch({ index }: { index: BahnhofIndex | null }) {
  const [daten, setDaten] = useState<{ netz: StreckenNetz; linien: ReturnType<typeof geometrieLesen>; pool: Pool
                                       brueckeKm: (k: string) => number | undefined } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [hilfenStart, setHilfenStart] = useState<Set<Hilfe>>(new Set(['kantone', 'seen']))
  useEffect(() => {
    if (!laeuft || daten) return
    Promise.all([streckenLaden(), geometrieLaden(), schweiz11Laden(), uebersichtLaden<BrueckenEintrag>('bruecken').catch(() => null)])
      .then(([netz, g, pool, br]) => {
        const nach = br ? nachKennung(br) : null
        setDaten({ netz, linien: geometrieLesen(g), pool, brueckeKm: (k) => nach?.get(k)?.km ?? undefined })
      })
      .catch((e: Error) => setFehler(e.message))
  }, [laeuft, daten])

  if (laeuft && fehler) return <div className="px-4 py-4"><Ladefehler was="Das Spiel konnte nicht geladen werden." fehler={fehler} /></div>
  if (laeuft && daten && index) {
    return <Partie {...daten} index={index} hilfenStart={hilfenStart} schliessen={() => setLaeuft(false)} />
  }
  return (
    <div className="px-4 pb-4">
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Wo bin ich?</h1>
      <p className="mt-2 leading-relaxed">
        Du sitzt im Führerstand, irgendwo auf einer Strecke in der Schweiz, ohne Ortstafeln und ohne Namen. Fahr ein Stück
        mit, schau dich um und tippe dann auf der Karte, wo du warst: je näher, desto mehr Punkte.
      </p>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        {RUNDEN} Runden, je {FAHRT_S} Sekunden Fahrt. Am Pult wählst du das Tempo und hältst an. Mit einer VR-Brille geht es auch
        dort.
      </p>
      <h2 className="mt-6 text-lg font-bold">Hilfen auf der Karte</h2>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
        Jede kostet {Math.round(HILFE_ABZUG * 100)} % der möglichen Punkte. Die Wahl gilt für die ganze Partie.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {HILFEN.map((h) => {
          const an = hilfenStart.has(h.id)
          return (
            <button key={h.id} type="button" aria-pressed={an}
                    onClick={() => { const s = new Set(hilfenStart); if (an) s.delete(h.id); else s.add(h.id); setHilfenStart(s) }}
                    className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ${an
                      ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black' : 'kachel kachel-link'}`}>
              {h.name} {an && '✓'}
            </button>
          )
        })}
      </div>
      <button type="button" disabled={!index} onClick={() => { setFehler(null); setLaeuft(true) }}
              className="mt-6 min-h-12 w-full rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40 md:w-auto md:px-10">
        {laeuft ? 'Wird geladen …' : 'Spielen'}
      </button>
      <p className="mt-6 text-sm text-sbb-metal dark:text-sbb-storm">
        Gewählt werden Stücke des Netzes der Seite «Strecke», höchstens zu einem Viertel im Tunnel. Gelände, Luftbild, Gebäude und
        Bäume wie im Führerstand der Modellbahn (swisstopo); ein Modell, kein Abbild der Wirklichkeit. Fahrzeit und Tempo sind
        fürs Spiel gewählt, kein Fahrplan.
      </p>
    </div>
  )
}

function Partie({ netz, linien, pool, brueckeKm, index, hilfenStart, schliessen }: {
  netz: StreckenNetz; linien: ReturnType<typeof geometrieLesen>; pool: Pool; brueckeKm: (k: string) => number | undefined
  index: BahnhofIndex; hilfenStart: Set<Hilfe>; schliessen: () => void
}) {
  const ziehen = () => rundeZiehen(netz, linien, (la, lo) => imGebiet(pool, 'CH', la, lo), brueckeKm)
  const [runde, setRunde] = useState<Runde | null>(() => ziehen())
  const [nr, setNr] = useState(0)
  const [phase, setPhase] = useState<Phase>('fahrt')
  const [stelle, setStelle] = useState(0)
  const [pin, setPin] = useState<KartenPin | null>(null)
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([])
  const d0 = useMemo(() => nullGrenzeM(pool, 'CH'), [pool])
  const ziel = useMemo<SpielObjekt | null>(() => {
    if (!runde || phase === 'fahrt') return null
    const l = lageBei(runde.fahrweg, stelle)
    return { t: 'b', id: 'wobinich', name: 'Hier warst du', la: l.lat, lo: l.lon, kt: '', s: 1,
             z: zeichnung(runde.fahrweg, runde.abS, Math.max(runde.abS + 1, stelle)) }
  }, [runde, phase, stelle])

  const naechsteRunde = () => {
    if (nr + 1 >= RUNDEN) { setPhase('ende'); return }
    setNr(nr + 1); setRunde(ziehen()); setPin(null); setPhase('fahrt')
  }
  const summe = ergebnisse.reduce((a, e) => a + e.punkte, 0)
  const moeglich = Math.round(100 * Math.max(0, 1 - HILFE_ABZUG * hilfenStart.size))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white"
         role="dialog" aria-label="Wo bin ich?">
      <div className="flex items-center justify-between gap-3 border-b border-sbb-cloud px-4 py-2 dark:border-sbb-iron">
        <p className="min-w-0 truncate font-bold">
          Wo bin ich?{phase !== 'ende' && <span className="font-normal"> · Runde {nr + 1} von {RUNDEN}</span>}
          <span className="font-normal text-sbb-metal dark:text-sbb-storm"> · {summe} Punkte</span>
        </p>
        <button type="button" onClick={() => { if (phase === 'ende' || window.confirm('Partie beenden? Der Spielstand geht verloren.')) schliessen() }}
                className="rounded-lg border border-sbb-cloud px-3 py-1.5 text-sm font-medium dark:border-sbb-iron">
          {phase === 'ende' ? 'Schliessen' : 'Beenden'}
        </button>
      </div>
      {!runde && <p className="p-4">Es liess sich kein Stück Strecke finden. Bitte nochmals versuchen.</p>}
      {runde && phase === 'fahrt' && (
        <Fahrt key={nr} runde={runde} fertig={(s) => { setStelle(s); setPhase('tipp') }} />
      )}
      {runde && ziel && phase === 'tipp' && (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row quer:flex-row">
          <div className="relative min-h-0 flex-1">
            <Schweiz11Karte key={`tipp-${nr}`} pool={pool} gebiet="CH" hilfen={hilfenStart} ziel={ziel} index={index.bahnhoefe}
                            pin={pin} setzen={setPin} klasse="absolute inset-0" />
          </div>
          <div className="border-t border-sbb-cloud px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-sbb-iron md:w-80 md:border-l md:border-t-0 quer:w-72 quer:border-l quer:border-t-0">
            <p className="text-2xl font-bold leading-tight">Wo warst du?</p>
            <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
              Tippe auf die Stelle, an der der Zug zuletzt stand. Bis {moeglich} Punkte.
            </p>
            <button type="button" disabled={!pin} onClick={() => {
              const dM = abstandM(pin!, ziel)
              setErgebnisse([...ergebnisse, { dM, punkte: punkte(dM, d0, 1, hilfenStart.size), hilfen: hilfenStart.size }])
              setPhase('aufloesung')
            }} className="mt-3 min-h-12 w-full rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
              {pin ? 'Tipp bestätigen' : 'Tippe auf die Karte für deinen Pin'}
            </button>
          </div>
        </div>
      )}
      {runde && ziel && phase === 'aufloesung' && (
        <Aufloesung runde={runde} stelle={stelle} netz={netz} ziel={ziel} pin={pin} ergebnis={ergebnisse[ergebnisse.length - 1]}
                    pool={pool} index={index} hilfen={hilfenStart} d0={d0} letzte={nr + 1 >= RUNDEN} weiter={naechsteRunde} nr={nr} />
      )}
      {phase === 'ende' && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-sbb-metal dark:text-sbb-storm">{RUNDEN} Runden gespielt</p>
          <p className="mt-2 text-4xl font-bold">{summe} Punkte</p>
          <p className="mt-1 text-sbb-metal dark:text-sbb-storm">von höchstens {moeglich * RUNDEN}</p>
          <ul className="mt-4 text-sm">
            {ergebnisse.map((e, i) => <li key={i}>Runde {i + 1}: {distanzText(e.dM)} daneben, {e.punkte} Punkte</li>)}
          </ul>
          <button type="button" onClick={() => { setErgebnisse([]); setNr(0); setRunde(ziehen()); setPin(null); setPhase('fahrt') }}
                  className="mt-6 min-h-12 rounded-lg bg-sbb-red px-10 font-bold text-white hover:bg-sbb-red125">
            Nochmals
          </button>
        </div>
      )}
    </div>
  )
}

/** Die Fahrt einer Runde: der Zug steht, bis «Losfahren» oder das Pult ihn startet, und fährt FAHRT_S Sekunden */
function Fahrt({ runde, fertig }: { runde: Runde; fertig: (s: number) => void }) {
  const { fahrweg, abS } = runde
  const ende = useMemo(() => wegEnde(fahrweg) - 100, [fahrweg])
  const [s, setS] = useState(abS)
  const [stufe, setStufe] = useState(TEMPO_ANFANG)
  const [angehalten, setAngehalten] = useState(true)
  const [gefahren, setGefahren] = useState(0)
  const zustand = useRef({ s: abS, stufe: TEMPO_ANFANG, angehalten: true, gefahren: 0 })
  zustand.current = { s, stufe, angehalten, gefahren }
  useEffect(() => {
    let bild = 0, vorher = performance.now()
    const schritt = (t: number) => {
      const dt = Math.min(0.2, (t - vorher) / 1000)
      vorher = t
      const z = zustand.current
      if (!z.angehalten && z.gefahren < FAHRT_S) {
        const v = TEMPO_STUFEN[z.stufe] / 3.6
        setS(Math.min(ende, z.s + v * dt))
        setGefahren(z.gefahren + dt)
      }
      bild = requestAnimationFrame(schritt)
    }
    bild = requestAnimationFrame(schritt)
    return () => cancelAnimationFrame(bild)
  }, [ende])
  const vorbei = gefahren >= FAHRT_S || s >= ende
  useEffect(() => { if (vorbei) setAngehalten(true) }, [vorbei])
  const aussen = useRef<PultAussen | null>(null)
  aussen.current = {
    probe: {
      stufen: TEMPO_STUFEN, stufe: () => zustand.current.stufe, angehalten: () => zustand.current.angehalten,
      waehlen: (i) => setStufe(Math.max(0, Math.min(TEMPO_STUFEN.length - 1, i))),
      anhalten: (an) => { if (!vorbei) setAngehalten(an) },
    },
  }
  const tempo = angehalten ? 0 : TEMPO_STUFEN[stufe] / 3.6
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<p className="p-4 text-sbb-metal">Wird geladen …</p>}>
        <GelaendeFahrt fahrweg={fahrweg} objekte={[]} sJetzt={s} className="min-h-0 flex-1" tempo={tempo} tempoQuelle="probe"
                       aussen={aussen} verdeckt vorneAnfang />
      </Suspense>
      <div className="flex items-center gap-3 border-t border-sbb-cloud px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-sbb-iron">
        <p className="min-w-0 flex-1 text-sm tabular-nums">
          {vorbei ? 'Fahrt zu Ende.' : angehalten ? `${FAHRT_S - Math.floor(gefahren)} s Fahrt übrig` : `noch ${Math.ceil(FAHRT_S - gefahren)} s`}
        </p>
        {!vorbei && (
          <button type="button" onClick={() => setAngehalten(!angehalten)}
                  className="min-h-11 rounded-lg border border-sbb-cloud px-4 text-sm font-bold dark:border-sbb-iron">
            {angehalten ? 'Losfahren' : 'Anhalten'}
          </button>
        )}
        <button type="button" onClick={() => fertig(s)}
                className={`min-h-11 rounded-lg px-4 text-sm font-bold ${vorbei ? 'bg-sbb-red text-white' : 'border border-sbb-cloud dark:border-sbb-iron'}`}>
          Zur Karte
        </button>
      </div>
    </div>
  )
}

function Aufloesung({ runde, stelle, netz, ziel, pin, ergebnis, pool, index, hilfen, d0, letzte, weiter, nr }: {
  runde: Runde; stelle: number; netz: StreckenNetz; ziel: SpielObjekt; pin: KartenPin | null; ergebnis: Ergebnis; pool: Pool
  index: BahnhofIndex; hilfen: Set<Hilfe>; d0: number; letzte: boolean; weiter: () => void; nr: number
}) {
  // die Bahnhöfe des Wegs vor und nach der Stelle, wo es sie gibt
  const bahnhoefe = runde.fahrweg.objekte.filter((o) => o.art === 'bahnhof')
  const vor = [...bahnhoefe].reverse().find((o) => (o.sOrt ?? o.s) <= stelle)
  const nach = bahnhoefe.find((o) => (o.sOrt ?? o.s) > stelle)
  const name = (k: string) => netz.punkte[k] ?? k
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row quer:flex-row">
      <div className="relative h-[45vh] shrink-0 md:h-auto md:flex-1 quer:h-auto quer:flex-1">
        <Schweiz11Karte key={`auf-${nr}`} pool={pool} gebiet="CH" hilfen={new Set([...hilfen, 'bahnnetz'])} ziel={ziel} index={index.bahnhoefe}
                        pin={null} aufloesung pins={pin ? [{ ...pin, eigen: true }] : []} klasse="absolute inset-0" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:w-80 md:flex-none md:border-l md:border-sbb-cloud dark:md:border-sbb-iron quer:w-72 quer:flex-none">
        <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">Hier warst du</p>
        <p className="text-2xl font-bold leading-tight">
          {vor && nach ? `Zwischen ${name(vor.kennung)} und ${name(nach.kennung)}` : vor ? `Nach ${name(vor.kennung)}` : nach ? `Vor ${name(nach.kennung)}` : 'Auf der Strecke'}
        </p>
        {runde.linie && <p className="text-sm text-sbb-metal dark:text-sbb-storm">Linie {runde.linie}</p>}
        <p className="mt-4 text-lg font-bold">{urteil(ergebnis.dM, d0)}</p>
        <p>{distanzText(ergebnis.dM)} daneben · {ergebnis.punkte} Punkte</p>
        <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">Grün auf der Karte die Stelle, an der der Zug stand.</p>
        <button type="button" onClick={weiter}
                className="mt-5 min-h-12 w-full rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125">
          {letzte ? 'Zum Ergebnis' : 'Nächste Runde'}
        </button>
      </div>
    </div>
  )
}
