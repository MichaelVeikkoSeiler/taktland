import { useEffect, useMemo, useState } from 'react'
import { antwortTon } from '../audio'
import {
  bestwert, bestwertFesthalten, dauerPunkte, type DauerRunde, dauerZiehen, PUZZLE_HALTE, PUZZLE_PUNKTE_JE_HALT, puzzlePunkte,
  type PuzzleRunde, puzzleZiehen, REGLER_BIS_MIN, RUNDEN, type SpielFahrt, type SpielVorrat, toleranz, uhr, vorratLaden, zugTitel,
} from '../fahrplanspiele'
import type { BahnhofIndex } from '../typen'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'

const ROT = 'min-h-12 rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40'
const LEISE = 'text-sm text-sbb-metal dark:text-sbb-storm'

function useVorrat(index: BahnhofIndex | null) {
  const [vorrat, setVorrat] = useState<SpielVorrat | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => { vorratLaden().then(setVorrat).catch((e: Error) => setFehler(e.message)) }, [])
  const namen = useMemo(() => new Map((index?.bahnhoefe ?? []).map((b) => [b.uic, b.name])), [index])
  return { vorrat, fehler, namen }
}

/** alle Halte der Fahrt laut Fahrplan, die Halte der Runde hervorgehoben */
function HalteListe({ f, namen, hervor }: { f: SpielFahrt; namen: Map<number, string>; hervor: Set<number> }) {
  return (
    <ol className="mt-3 space-y-0.5 text-sm">
      {f.h.map(([u, an, ab], i) => (
        <li key={i} className={hervor.has(i) ? 'font-bold' : 'text-sbb-metal dark:text-sbb-storm'}>
          <span className="inline-block w-20 tabular-nums">{an !== null && i > 0 ? `an ${uhr(an)}` : ''}</span>
          <span className="inline-block w-20 tabular-nums">{ab !== null && i < f.h.length - 1 ? `ab ${uhr(ab)}` : ''}</span>
          {namen.get(u) ?? u}
        </li>
      ))}
    </ol>
  )
}

function Kopf({ titel, text, best }: { titel: string; text: string; best: number | null }) {
  return (
    <>
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{titel}</h1>
      <p className="mt-2 leading-relaxed">{text}</p>
      {best !== null && <p className={`mt-1 ${LEISE}`}>Dein Bestwert: {best} Punkte</p>}
    </>
  )
}

function Quelle({ v }: { v: SpielVorrat }) {
  return (
    <p className={`mt-6 ${LEISE}`}>
      Fahrplan als GTFS von opentransportdata.swiss, Stand {v.stand}: die erste Fahrt des Tages je Linie und Ziel, nur Halte an Bahnhöfen von Taktland. Zeiten in
      ganzen Minuten, ohne Verspätungen.
    </p>
  )
}

function Ende({ summe, hoechst, neu, nochmals }: { summe: number; hoechst: number; neu: boolean; nochmals: () => void }) {
  return (
    <div className="mt-6 text-center">
      <p className={LEISE}>{RUNDEN} Runden gespielt</p>
      <p className="mt-2 text-4xl font-bold">{summe} Punkte</p>
      <p className={LEISE}>von höchstens {hoechst}{neu ? ' · neuer Bestwert' : ''}</p>
      <button type="button" onClick={nochmals} className={`mt-6 ${ROT}`}>Nochmals</button>
    </div>
  )
}

/**
 * «Fahrplan-Puzzle» (Michael, 2026-11-14): ein Zug von A nach B, vier seiner Halte dazwischen gemischt; man tippt sie in der
 * Reihenfolge, in der der Zug sie anfährt. Je richtigem Platz 25 Punkte.
 */
export function FahrplanPuzzle({ index }: { index: BahnhofIndex | null }) {
  const { vorrat, fehler, namen } = useVorrat(index)
  const [nr, setNr] = useState(-1)
  const [runde, setRunde] = useState<PuzzleRunde | null>(null)
  const [gewaehlt, setGewaehlt] = useState<number[]>([])
  const [punkte, setPunkte] = useState<number[]>([])
  const [linien, setLinien] = useState<Set<string>>(new Set())
  const [neu, setNeu] = useState(false)
  const name = (u: number) => namen.get(u) ?? String(u)
  const ziehen = (schon: Set<string>) => {
    if (!vorrat) return
    const r = puzzleZiehen(vorrat, (u) => namen.has(u), schon)
    setRunde(r); setGewaehlt([])
    if (r) setLinien(new Set([...schon, `${r.f.g}|${r.f.l}`]))
  }
  const fertig = runde !== null && gewaehlt.length === PUZZLE_HALTE
  const gewertet = punkte.length > nr && nr >= 0
  const summe = punkte.reduce((a, b) => a + b, 0)

  return (
    <div className="px-4 pb-6">
      <Kopf titel="Fahrplan-Puzzle" best={bestwert('puzzle')}
            text={`Ein Zug fährt von A nach B. Vier seiner Halte dazwischen sind gemischt: Tippe sie in der Reihenfolge, in der er sie anfährt. Fünf Runden, je richtigem Platz ${PUZZLE_PUNKTE_JE_HALT} Punkte.`} />
      {fehler && <div className="mt-4"><Ladefehler was="Der Fahrplan für das Spiel konnte nicht geladen werden." fehler={fehler} /></div>}
      {!fehler && !vorrat && <p className={`mt-4 ${LEISE}`}>Wird geladen …</p>}
      {vorrat && nr < 0 && (
        <button type="button" disabled={!index} className={`mt-5 ${ROT}`}
                onClick={() => { setNr(0); setPunkte([]); setNeu(false); ziehen(new Set()) }}>Spielen</button>
      )}
      {vorrat && nr >= 0 && nr < RUNDEN && !runde && <p className="mt-4">Es liess sich keine passende Fahrt finden.</p>}
      {vorrat && nr >= 0 && nr < RUNDEN && runde && (
        <div className="mt-5">
          <p className={LEISE}>Runde {nr + 1} von {RUNDEN} · {summe} Punkte</p>
          <p className="mt-1 text-xl font-bold leading-snug">{zugTitel(runde.f)} von {name(runde.f.h[0][0])} nach {name(runde.f.h[runde.f.h.length - 1][0])}</p>
          <p className={LEISE}>In welcher Reihenfolge hält er hier?</p>
          <div className="mt-3 grid gap-2">
            {runde.gemischt.map((i) => {
              const platz = gewaehlt.indexOf(i)
              const richtig = gewertet && platz >= 0 && runde.richtig[platz] === i
              return (
                <button key={i} type="button" disabled={gewertet}
                        onClick={() => setGewaehlt((g) => platz >= 0 ? g.slice(0, platz) : [...g, i])}
                        className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-left font-medium ${platz >= 0
                          ? (gewertet ? (richtig ? 'bg-[#2e7d32] text-white' : 'bg-sbb-red text-white') : 'bg-sbb-anthracite text-white')
                          : 'bg-[#ebebeb] dark:bg-sbb-iron'}`}>
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-current text-sm font-bold">
                    {platz >= 0 ? platz + 1 : ''}
                  </span>
                  {name(runde.f.h[i][0])}
                </button>
              )
            })}
          </div>
          {!gewertet && <p className={`mt-2 ${LEISE}`}>Nochmals tippen nimmt den Halt und alle danach zurück.</p>}
          {!gewertet && (
            <button type="button" disabled={!fertig} className={`mt-4 w-full md:w-auto ${ROT}`} onClick={() => {
              const p = puzzlePunkte(runde, gewaehlt)
              antwortTon(p === PUZZLE_HALTE * PUZZLE_PUNKTE_JE_HALT ? 'richtig' : 'falsch')
              setPunkte([...punkte, p])
            }}>Prüfen</button>
          )}
          {gewertet && (
            <>
              <p className="mt-4 font-bold">{punkte[nr]} Punkte · richtig ist: {runde.richtig.map((i) => name(runde.f.h[i][0])).join(', ')}</p>
              <p className={`mt-2 ${LEISE}`}>Alle Halte dieser Fahrt laut Fahrplan:</p>
              <HalteListe f={runde.f} namen={namen} hervor={new Set(runde.richtig)} />
              <button type="button" className={`mt-4 w-full md:w-auto ${ROT}`} onClick={() => {
                if (nr + 1 >= RUNDEN) { setNeu(bestwertFesthalten('puzzle', summe)); setNr(RUNDEN); return }
                setNr(nr + 1); ziehen(linien)
              }}>{nr + 1 >= RUNDEN ? 'Ergebnis' : 'Nächste Runde'}</button>
            </>
          )}
        </div>
      )}
      {vorrat && nr >= RUNDEN && (
        <Ende summe={summe} hoechst={RUNDEN * PUZZLE_HALTE * PUZZLE_PUNKTE_JE_HALT} neu={neu}
              nochmals={() => { setNr(0); setPunkte([]); setNeu(false); ziehen(new Set()) }} />
      )}
      {vorrat && <Quelle v={vorrat} />}
    </div>
  )
}

/**
 * «Wie lange dauert's?» (Michael, 2026-11-14): wie viele Minuten braucht ein Zug laut Fahrplan von der Abfahrt in A bis zur
 * Ankunft in B? Der Regler geht von 0 bis 180 Minuten; volle Punkte bis toleranz(), halbe bis zum Doppelten.
 */
export function Fahrzeit({ index }: { index: BahnhofIndex | null }) {
  const { vorrat, fehler, namen } = useVorrat(index)
  const [nr, setNr] = useState(-1)
  const [runde, setRunde] = useState<DauerRunde | null>(null)
  const [tipp, setTipp] = useState(REGLER_BIS_MIN / 2)
  const [punkte, setPunkte] = useState<number[]>([])
  const [linien, setLinien] = useState<Set<string>>(new Set())
  const [neu, setNeu] = useState(false)
  const name = (u: number) => namen.get(u) ?? String(u)
  const ziehen = (schon: Set<string>) => {
    if (!vorrat) return
    const r = dauerZiehen(vorrat, (u) => namen.has(u), schon)
    setRunde(r); setTipp(REGLER_BIS_MIN / 2)
    if (r) setLinien(new Set([...schon, `${r.f.g}|${r.f.l}`]))
  }
  const gewertet = punkte.length > nr && nr >= 0
  const summe = punkte.reduce((a, b) => a + b, 0)

  return (
    <div className="px-4 pb-6">
      <Kopf titel="Wie lange dauert's?" best={bestwert('dauer')}
            text="Wie viele Minuten braucht der Zug laut Fahrplan von der Abfahrt im einen Bahnhof bis zur Ankunft im anderen? Stell den Regler ein. Fünf Runden, je bis 100 Punkte." />
      {fehler && <div className="mt-4"><Ladefehler was="Der Fahrplan für das Spiel konnte nicht geladen werden." fehler={fehler} /></div>}
      {!fehler && !vorrat && <p className={`mt-4 ${LEISE}`}>Wird geladen …</p>}
      {vorrat && nr < 0 && (
        <button type="button" disabled={!index} className={`mt-5 ${ROT}`}
                onClick={() => { setNr(0); setPunkte([]); setNeu(false); ziehen(new Set()) }}>Spielen</button>
      )}
      {vorrat && nr >= 0 && nr < RUNDEN && !runde && <p className="mt-4">Es liess sich keine passende Fahrt finden.</p>}
      {vorrat && nr >= 0 && nr < RUNDEN && runde && (
        <div className="mt-5">
          <p className={LEISE}>Runde {nr + 1} von {RUNDEN} · {summe} Punkte</p>
          <p className="mt-1 text-xl font-bold leading-snug">{zugTitel(runde.f)} nach {runde.f.z}</p>
          <p className="mt-1 text-lg">von <b>{name(runde.f.h[runde.von][0])}</b> bis <b>{name(runde.f.h[runde.bis][0])}</b></p>
          <p className="mt-4 text-center text-4xl font-bold tabular-nums">{tipp} Min.</p>
          <input type="range" min={0} max={REGLER_BIS_MIN} step={1} value={tipp} disabled={gewertet} aria-label="Minuten"
                 onChange={(e) => setTipp(Number(e.target.value))} className="mt-2 w-full accent-sbb-red" />
          <div className={`flex justify-between ${LEISE}`}><span>0</span><span>{REGLER_BIS_MIN} Min.</span></div>
          {!gewertet && (
            <button type="button" className={`mt-4 w-full md:w-auto ${ROT}`} onClick={() => {
              const p = dauerPunkte(runde.min, tipp)
              antwortTon(p === 100 ? 'richtig' : 'falsch')
              setPunkte([...punkte, p])
            }}>Prüfen</button>
          )}
          {gewertet && (
            <>
              <p className="mt-4 font-bold">
                {punkte[nr]} Punkte · laut Fahrplan {runde.min} Minuten: ab {name(runde.f.h[runde.von][0])} {uhr(runde.f.h[runde.von][2])},
                an {name(runde.f.h[runde.bis][0])} {uhr(runde.f.h[runde.bis][1])}
              </p>
              <p className={LEISE}>Volle Punkte bis {toleranz(runde.min)} Minuten daneben, halbe bis {2 * toleranz(runde.min)}.</p>
              <p className={`mt-2 ${LEISE}`}>Alle Halte dieser Fahrt laut Fahrplan:</p>
              <HalteListe f={runde.f} namen={namen} hervor={new Set([runde.von, runde.bis])} />
              <button type="button" className={`mt-4 w-full md:w-auto ${ROT}`} onClick={() => {
                if (nr + 1 >= RUNDEN) { setNeu(bestwertFesthalten('dauer', summe)); setNr(RUNDEN); return }
                setNr(nr + 1); ziehen(linien)
              }}>{nr + 1 >= RUNDEN ? 'Ergebnis' : 'Nächste Runde'}</button>
            </>
          )}
        </div>
      )}
      {vorrat && nr >= RUNDEN && (
        <Ende summe={summe} hoechst={RUNDEN * 100} neu={neu} nochmals={() => { setNr(0); setPunkte([]); setNeu(false); ziehen(new Set()) }} />
      )}
      {vorrat && <Quelle v={vorrat} />}
    </div>
  )
}
