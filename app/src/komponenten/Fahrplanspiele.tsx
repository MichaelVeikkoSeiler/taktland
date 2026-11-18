import { useCallback, useEffect, useMemo, useState } from 'react'
import { antwortTon } from '../audio'
import {
  bestwert, bestwertFesthalten, DAUER_HINWEIS_ABZUG, dauerPunkte, type DauerRunde, dauerZiehen, PUZZLE_HALTE, PUZZLE_PUNKTE_JE_HALT, puzzlePunkte,
  type PuzzleRunde, puzzleZiehen, REGLER_BIS_MIN, RUNDEN, type SpielFahrt, type SpielVorrat, toleranz, uhr, vorratLaden, zugTitel,
} from '../fahrplanspiele'
import type { BahnhofIndex } from '../typen'
import { Ladefehler } from './Ladefehler'
import { type Box, KartenPlatz, lage, Netzkarte, useKarte } from './Netzkarte'
import { type Mitspieler, type RaumSpiel, useRaumSeite } from './Raum'
import { raumEroeffnen, teilnahmeMerken } from '../spielraum'
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

/** Namen der Zuggattungen im Vorrat (SPIEL_GATTUNGEN in pipeline/build_fahrplan.py); allgemeines Wissen, nicht aus dem Fahrplan */
const GATTUNG_NAME: Record<string, string> = {
  IC: 'InterCity', ICN: 'InterCity-Neigezug', IR: 'InterRegio', RE: 'RegioExpress', EC: 'EuroCity', ICE: 'Intercity-Express',
  TGV: 'Train à Grande Vitesse', RJX: 'railjet xpress', NJ: 'Nightjet', EN: 'EuroNight', PE: 'Panorama Express',
}

/**
 * was die Bezeichnung des Zugs heisst (Michael, 2026-11-18: «eine kurze Erklärung zur Bezeichnung: was heisst RE mit zwei Zahlen
 * etc. Vielleicht gibt das eine Hilfestellung und lernt einem zugleich»): die Teile laut Fahrplan, darunter die Erläuterung
 */
function Bezeichnung({ f, titel, ziel }: { f: SpielFahrt; titel: string; ziel?: string }) {
  const linie = f.l && f.l !== f.g ? f.l : null
  return (
    <details className="klapp mt-1">
      <summary className="cursor-pointer text-xl font-bold leading-snug" title={`Was heisst «${zugTitel(f)}»?`}>{titel}</summary>
      <div className={`mt-1 mb-2 space-y-2 ${LEISE}`}>
      <ul className="space-y-0.5">
        <li><b>{f.g}</b>: die Zuggattung{GATTUNG_NAME[f.g] ? `, ${GATTUNG_NAME[f.g]}` : ''}</li>
        {f.n && <li><b>{f.n}</b>: die Zugnummer dieser Fahrt</li>}
        {linie && <li><b>{linie}</b>: die Linie</li>}
        {ziel && <li><b>{ziel}</b>: das Ziel des Zugs</li>}
      </ul>
      <p>Diese Angaben stehen so im Fahrplan.</p>
      <p><i>Erläuterung:</i> Die Zuggattung sagt, welche Art Zug es ist. Eine Linie fasst Fahrten zusammen, die regelmässig
        dieselbe Strecke fahren. Die Zugnummer bezeichnet die einzelne Fahrt.</p>
      </div>
    </details>
  )
}

/** die Halte zum Ordnen: antippen in der Reihenfolge, nochmals antippen nimmt den Halt und alle danach zurück; nach dem Prüfen grün und rot */
function PuzzleWahl({ runde, name, gewaehlt, setGewaehlt, gewertet }: {
  runde: PuzzleRunde; name: (u: number) => string; gewaehlt: number[]; setGewaehlt: (g: number[]) => void; gewertet: boolean
}) {
  return (
    <>
      <Bezeichnung f={runde.f} titel={`${zugTitel(runde.f)} von ${name(runde.f.h[0][0])} nach ${name(runde.f.h[runde.f.h.length - 1][0])}`} />
      <p className={LEISE}>In welcher Reihenfolge hält er hier?</p>
      <div className="mt-3 grid gap-2">
        {runde.gemischt.map((i) => {
          const platz = gewaehlt.indexOf(i)
          const richtig = gewertet && platz >= 0 && runde.richtig[platz] === i
          return (
            <button key={i} type="button" disabled={gewertet}
                    onClick={() => setGewaehlt(platz >= 0 ? gewaehlt.slice(0, platz) : [...gewaehlt, i])}
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
    </>
  )
}

/** nach einer Runde: die richtige Reihenfolge, die Punkte je Spieler und alle Halte der Fahrt */
function PuzzleLoesung({ runde, namen, name, spieler, punkte }: {
  runde: PuzzleRunde; namen: Map<number, string>; name: (u: number) => string; spieler?: Array<{ name: string; punkte: number }>; punkte?: number
}) {
  return (
    <>
      <p className="mt-4 font-bold">{punkte !== undefined ? `${punkte} Punkte · ` : ''}richtig ist: {runde.richtig.map((i) => name(runde.f.h[i][0])).join(', ')}</p>
      {spieler && (
        <ul className="mt-2 text-sm">
          {spieler.map((s, k) => <li key={k}><b>{s.name}</b>: {s.punkte} Punkte</li>)}
        </ul>
      )}
      <p className={`mt-2 ${LEISE}`}>Alle Halte dieser Fahrt laut Fahrplan:</p>
      <HalteListe f={runde.f} namen={namen} hervor={new Set(runde.richtig)} />
    </>
  )
}

const PUZZLE_EINSTELLUNG = 'taktland.fahrplanpuzzle.einstellungen.v1'
const MAX_SPIELER = 8

/**
 * «Fahrplan-Puzzle» (Michael, 2026-11-14): ein Zug von A nach B, vier seiner Halte dazwischen gemischt; man tippt sie in der
 * Reihenfolge, in der der Zug sie anfährt. Je richtigem Platz 25 Punkte. Seit 2026-11-15 auch für mehrere (Michael: «Fahrplan Puzzle
 * auch für Mehrspieler bauen»): reihum auf diesem Gerät oder auf mehreren Geräten über einen Raum wie bei «Geo».
 */
export function FahrplanPuzzle({ index }: { index: BahnhofIndex | null }) {
  const { vorrat, fehler, namen } = useVorrat(index)
  const gemerkt = useMemo(() => {
    try { const x = JSON.parse(localStorage.getItem(PUZZLE_EINSTELLUNG) ?? '{}'); return x as { art?: string; namen?: string[]; meinName?: string } } catch { return {} }
  }, [])
  const [art, setArt] = useState<'a' | 'g' | 'o'>(gemerkt.art === 'g' || gemerkt.art === 'o' ? gemerkt.art : 'a')
  const [spielerNamen, setSpielerNamen] = useState<string[]>(Array.isArray(gemerkt.namen) && gemerkt.namen.length >= 2 ? gemerkt.namen.slice(0, MAX_SPIELER) : ['Spieler 1', 'Spieler 2'])
  const [meinName, setMeinName] = useState(gemerkt.meinName ?? '')
  const [code, setCode] = useState('')
  const [eroeffnet, setEroeffnet] = useState<'nein' | 'laeuft' | string>('nein')
  useEffect(() => { try { localStorage.setItem(PUZZLE_EINSTELLUNG, JSON.stringify({ art, namen: spielerNamen, meinName })) } catch { /* nur jetzt */ } }, [art, spielerNamen, meinName])

  // eine Partie: die Runden im Voraus gezogen, keine Linie zweimal; je Runde und Spieler die Wahl
  const [runden, setRunden] = useState<PuzzleRunde[] | null>(null)
  const [nr, setNr] = useState(0)
  const [wer, setWer] = useState(0)
  const [gewaehlt, setGewaehlt] = useState<number[]>([])
  const [antworten, setAntworten] = useState<number[][][]>([])
  const [neu, setNeu] = useState(false)
  const name = (u: number) => namen.get(u) ?? String(u)
  const spieler = art === 'g' ? spielerNamen.map((n) => n.trim()) : ['Du']

  function starten() {
    if (!vorrat) return
    setRunden(rundenZiehen(vorrat, namen))
    setNr(0); setWer(0); setGewaehlt([]); setAntworten([]); setNeu(false)
  }
  async function eroeffnen() {
    setEroeffnet('laeuft')
    try {
      const raum = await raumEroeffnen()
      teilnahmeMerken({ raum, name: meinName.trim(), gastgeber: true })
      window.location.hash = `#/puzzle/mit/${raum}`
    } catch (x) { setEroeffnet(x instanceof Error ? x.message : 'Der Raum konnte nicht eröffnet werden.') }
  }

  const runde = runden?.[nr] ?? null
  const rundeFertig = (antworten[nr]?.length ?? 0) >= spieler.length
  const summen = spieler.map((_, k) => antworten.reduce((s, a, r) => s + (a[k] && runden?.[r] ? puzzlePunkte(runden[r], a[k]) : 0), 0))

  return (
    <div className="px-4 pb-6">
      <Kopf titel="Fahrplan-Puzzle" best={bestwert('puzzle')}
            text={`Ein Zug fährt von A nach B. Vier seiner Halte dazwischen sind gemischt: Tippe sie in der Reihenfolge, in der er sie anfährt. Fünf Runden, je richtigem Platz ${PUZZLE_PUNKTE_JE_HALT} Punkte.`} />
      {fehler && <div className="mt-4"><Ladefehler was="Der Fahrplan für das Spiel konnte nicht geladen werden." fehler={fehler} /></div>}
      {!fehler && !vorrat && <p className={`mt-4 ${LEISE}`}>Wird geladen …</p>}
      {vorrat && !runden && (
        <div className="max-w-md">
          <fieldset className="mt-5">
            <legend className={LEISE}>Wer spielt</legend>
            <div className="segmente mt-1.5 grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr) minmax(0, 3fr)' }}>
              {([['a', 'Allein'], ['g', 'Mehrere auf diesem Gerät'], ['o', 'Auf mehreren Geräten']] as const).map(([w, t]) => (
                <button key={w} type="button" aria-pressed={art === w} onClick={() => setArt(w)}
                        className="segment whitespace-normal px-1 py-2 text-sm leading-tight">{t}</button>
              ))}
            </div>
          </fieldset>
          {art === 'g' && (
            <div className="mt-4 grid gap-2">
              {spielerNamen.map((n, k) => (
                <div key={k} className="flex gap-2">
                  <input value={n} maxLength={20} aria-label={`Name von Spieler ${k + 1}`}
                         onChange={(ev) => setSpielerNamen(spielerNamen.map((x, j) => j === k ? ev.target.value : x))}
                         className="min-w-0 flex-1 rounded-lg border border-sbb-cloud bg-white px-3 py-2 dark:border-sbb-iron dark:bg-sbb-midnight" />
                  {spielerNamen.length > 2 && (
                    <button type="button" aria-label="Entfernen" onClick={() => setSpielerNamen(spielerNamen.filter((_, j) => j !== k))}
                            className="rounded-lg border border-sbb-cloud px-3 dark:border-sbb-iron">×</button>
                  )}
                </div>
              ))}
              {spielerNamen.length < MAX_SPIELER && (
                <button type="button" onClick={() => setSpielerNamen([...spielerNamen, `Spieler ${spielerNamen.length + 1}`])}
                        className="justify-self-start rounded-lg border border-sbb-cloud px-4 py-2 text-sm font-medium dark:border-sbb-iron">Spieler hinzufügen</button>
              )}
              <p className={LEISE}>Reihum: Alle ordnen dieselbe Fahrt, die anderen schauen weg. Die Lösung kommt, wenn alle fertig sind.</p>
            </div>
          )}
          {art === 'o' && (
            <div className="mt-4">
              <label className={`block ${LEISE}`} htmlFor="puzzle-mein-name">Dein Name</label>
              <input id="puzzle-mein-name" value={meinName} maxLength={20} onChange={(ev) => setMeinName(ev.target.value)}
                     className="mt-1.5 w-full rounded-lg border border-sbb-cloud bg-white px-3 py-2 dark:border-sbb-iron dark:bg-sbb-midnight" />
              <p className={`mt-2 ${LEISE}`}>
                Du eröffnest einen Raum und zeigst den QR-Code; die anderen scannen ihn mit ihrem Gerät. Alle ordnen dieselben Fahrten. Braucht Empfang.
              </p>
              <button type="button" disabled={!meinName.trim() || eroeffnet === 'laeuft'} onClick={() => void eroeffnen()} className={`mt-3 w-full ${ROT}`}>
                {eroeffnet === 'laeuft' ? 'Raum wird eröffnet …' : 'Raum eröffnen'}
              </button>
              {eroeffnet !== 'nein' && eroeffnet !== 'laeuft' && <p className="mt-2 border-l-2 border-sbb-red pl-3 text-sm">{eroeffnet}</p>}
              <form className="mt-4 flex gap-2" onSubmit={(ev) => {
                ev.preventDefault()
                if (/^[A-Za-z]{4}$/.test(code.trim())) window.location.hash = `#/puzzle/mit/${code.trim().toUpperCase()}`
              }}>
                <input value={code} maxLength={4} aria-label="Code eines Raums" placeholder="Code" onChange={(ev) => setCode(ev.target.value)}
                       autoCapitalize="characters"
                       className="w-28 rounded-lg border border-sbb-cloud bg-white px-3 py-2 uppercase tracking-widest dark:border-sbb-iron dark:bg-sbb-midnight" />
                <button type="submit" disabled={!/^[A-Za-z]{4}$/.test(code.trim())}
                        className="rounded-lg border border-sbb-cloud px-4 font-medium disabled:opacity-40 dark:border-sbb-iron">Beitreten</button>
              </form>
            </div>
          )}
          {art !== 'o' && (
            <button type="button" disabled={!index || (art === 'g' && spielerNamen.some((n) => !n.trim()))} className={`mt-5 ${ROT}`}
                    onClick={starten}>Spielen</button>
          )}
        </div>
      )}
      {runden && !runden.length && <p className="mt-4">Es liess sich keine passende Fahrt finden.</p>}
      {runden && runde && nr < runden.length && (
        <div className="mt-5">
          <p className={LEISE}>Runde {nr + 1} von {runden.length}{spieler.length > 1 ? '' : ` · ${summen[0]} Punkte`}</p>
          {spieler.length > 1 && !rundeFertig && <p className="mt-1 text-lg font-bold">{spieler[wer]} ist dran</p>}
          {!rundeFertig && (
            <>
              <PuzzleWahl key={`${nr}-${wer}`} runde={runde} name={name} gewaehlt={gewaehlt} setGewaehlt={setGewaehlt} gewertet={false} />
              <button type="button" disabled={gewaehlt.length !== PUZZLE_HALTE} className={`mt-4 w-full md:w-auto ${ROT}`} onClick={() => {
                const a = [...antworten]; a[nr] = [...(a[nr] ?? []), gewaehlt]; setAntworten(a)
                setGewaehlt([])
                if (spieler.length === 1) antwortTon(puzzlePunkte(runde, gewaehlt) === PUZZLE_HALTE * PUZZLE_PUNKTE_JE_HALT ? 'richtig' : 'falsch')
                else setWer(wer + 1)
              }}>{spieler.length > 1 && wer + 1 < spieler.length ? `Fertig, weiter an ${spieler[wer + 1]}` : 'Prüfen'}</button>
            </>
          )}
          {rundeFertig && (
            <>
              {spieler.length === 1 && <PuzzleWahl runde={runde} name={name} gewaehlt={antworten[nr][0]} setGewaehlt={() => {}} gewertet />}
              <PuzzleLoesung runde={runde} namen={namen} name={name} punkte={spieler.length === 1 ? puzzlePunkte(runde, antworten[nr][0]) : undefined}
                             spieler={spieler.length > 1 ? spieler.map((n, k) => ({ name: n, punkte: puzzlePunkte(runde, antworten[nr][k]) })) : undefined} />
              <button type="button" className={`mt-4 w-full md:w-auto ${ROT}`} onClick={() => {
                if (nr + 1 >= runden.length) { if (spieler.length === 1) setNeu(bestwertFesthalten('puzzle', summen[0])); setNr(runden.length); return }
                setNr(nr + 1); setWer(0)
              }}>{nr + 1 >= runden.length ? 'Ergebnis' : 'Nächste Runde'}</button>
            </>
          )}
        </div>
      )}
      {runden && runden.length > 0 && nr >= runden.length && (
        spieler.length === 1
          ? <Ende summe={summen[0]} hoechst={runden.length * PUZZLE_HALTE * PUZZLE_PUNKTE_JE_HALT} neu={neu} nochmals={starten} />
          : <Rangliste spieler={spieler.map((n, k) => ({ name: n, punkte: summen[k] }))} hoechst={runden.length * PUZZLE_HALTE * PUZZLE_PUNKTE_JE_HALT}
                       nochmals={starten} schliessen={() => setRunden(null)} />
      )}
      {vorrat && <Quelle v={vorrat} />}
    </div>
  )
}

/** die Runden einer Partie, keine Linie zweimal */
function rundenZiehen(v: SpielVorrat, namen: Map<number, string>): PuzzleRunde[] {
  const r: PuzzleRunde[] = [], schon = new Set<string>()
  for (let k = 0; k < RUNDEN; k++) {
    const x = puzzleZiehen(v, (u) => namen.has(u), schon)
    if (!x) break
    r.push(x); schon.add(`${x.f.g}|${x.f.l}`)
  }
  return r
}

function Rangliste({ spieler, hoechst, nochmals, schliessen, warten }: {
  spieler: Array<{ name: string; punkte: number }>; hoechst: number; nochmals?: () => void; schliessen: () => void; warten?: string
}) {
  const sortiert = [...spieler].sort((a, b) => b.punkte - a.punkte)
  return (
    <div className="mt-6">
      <p className={LEISE}>{RUNDEN} Runden gespielt, höchstens {hoechst} Punkte</p>
      <ol className="mt-3 space-y-1">
        {sortiert.map((s, k) => (
          <li key={k} className="flex justify-between rounded-lg bg-[#ebebeb] px-3 py-2 dark:bg-sbb-iron">
            {/* gleich viele Punkte, gleicher Platz */}
            <span><b>{sortiert.findIndex((x) => x.punkte === s.punkte) + 1}.</b> {s.name}</span><span className="font-bold tabular-nums">{s.punkte}</span>
          </li>
        ))}
      </ol>
      {warten && <p className={`mt-3 ${LEISE}`}>{warten}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        {nochmals && <button type="button" onClick={nochmals} className={ROT}>Nochmals</button>}
        <button type="button" onClick={schliessen} className="min-h-12 rounded-lg border border-sbb-cloud px-6 font-bold dark:border-sbb-iron">Schliessen</button>
      </div>
    </div>
  )
}

/** ein Start auf mehreren Geräten: die Runden als Nummer der Fahrt im Vorrat und die Reihenfolgen, dazu der Stand des Vorrats */
interface PuzzleStart { stand: string; runden: Array<{ i: number; richtig: number[]; gemischt: number[] }>; spieler: Mitspieler[] }
const PUZZLE_RAUM: RaumSpiel<PuzzleStart> = {
  start: (d) => {
    const st = d as PuzzleStart | null
    return st && typeof st.stand === 'string' && Array.isArray(st.runden) && Array.isArray(st.spieler) ? st : null
  },
  spieler: (s) => s.spieler,
  fragen: (s) => s.runden.length,
  max: MAX_SPIELER,
}

/** #/puzzle/mit/CODE: beitreten, Warteraum, Spiel; der Stand entsteht auf jedem Gerät aus denselben Ereignissen (spielraum.ts, Raum.tsx) */
export function FahrplanPuzzleOnline({ raum, index }: { raum: string; index: BahnhofIndex | null }) {
  const { vorrat, fehler, namen } = useVorrat(index)
  const r = useRaumSeite<PuzzleStart, number[]>({
    raum, spiel: PUZZLE_RAUM, titel: 'Fahrplan-Puzzle auf mehreren Geräten', zurueck: { hash: '#/puzzle', text: 'Fahrplan-Puzzle' },
    spielName: 'Fahrplan-Puzzle', adresseSpiel: 'puzzle', laden: { fehler, fertig: !!vorrat && !!index },
    neuerStart: (dabei) => vorrat ? puzzleStart(vorrat, namen, dabei) : null,
  })
  if (r.vorspiel) return r.vorspiel
  const st = r.stand.start!
  if (!vorrat || st.stand !== vorrat.stand || st.runden.some((x) => !vorrat.fahrten[x.i])) {
    return r.rahmen(<p className="mt-6">Auf diesem Gerät ist ein anderer Fahrplan geladen als beim Gastgeber. Lade Taktland neu, damit alle Geräte dieselbe Fassung haben.</p>)
  }
  const runden: PuzzleRunde[] = st.runden.map((x) => ({ f: vorrat.fahrten[x.i], richtig: x.richtig, gemischt: x.gemischt }))
  return <PuzzleOnlineSpiel key={r.stand.partie} r={r} runden={runden} namen={namen} vorrat={vorrat} />
}

function puzzleStart(v: SpielVorrat, namen: Map<number, string>, dabei: Mitspieler[]): PuzzleStart {
  return { stand: v.stand, spieler: dabei, runden: rundenZiehen(v, namen).map((x) => ({ i: v.fahrten.indexOf(x.f), richtig: x.richtig, gemischt: x.gemischt })) }
}

function PuzzleOnlineSpiel({ r, runden, namen, vorrat }: {
  r: ReturnType<typeof useRaumSeite<PuzzleStart, number[]>>; runden: PuzzleRunde[]; namen: Map<number, string>; vorrat: SpielVorrat
}) {
  const { stand, ich, gastgeber, schicken, verlassen } = r
  const spieler = stand.start!.spieler
  const frage = stand.frage
  const runde = runden[frage]
  const tipps = stand.tipps[frage] ?? {}
  const meiner = tipps[ich]
  const alle = spieler.every((m) => tipps[m.id])
  const phase = stand.ende ? 'ende' : !meiner && !stand.aufgeloest.has(frage) ? 'frage' : alle || stand.aufgeloest.has(frage) ? 'loesung' : 'warten'
  const [gewaehlt, setGewaehlt] = useState<number[]>([])
  const [gesendet, setGesendet] = useState(-1)
  useEffect(() => { setGewaehlt([]) }, [frage])
  const name = (u: number) => namen.get(u) ?? String(u)
  const punkteVon = (id: string, k: number) => (stand.tipps[k]?.[id] ? puzzlePunkte(runden[k], stand.tipps[k][id]) : 0)
  const summe = (id: string) => runden.reduce((s, _, k) => s + punkteVon(id, k), 0)
  const gastName = spieler[0]?.name ?? 'der Gastgeber'

  return r.rahmen(
    <div className="mt-4">
      {phase !== 'ende' && <p className={LEISE}>Runde {frage + 1} von {runden.length} · {spieler.find((m) => m.id === ich)?.name}</p>}
      {phase === 'frage' && gesendet !== frage && (
        <>
          <PuzzleWahl runde={runde} name={name} gewaehlt={gewaehlt} setGewaehlt={setGewaehlt} gewertet={false} />
          <button type="button" disabled={gewaehlt.length !== PUZZLE_HALTE} className={`mt-4 w-full md:w-auto ${ROT}`} onClick={() => {
            setGesendet(frage)
            antwortTon(puzzlePunkte(runde, gewaehlt) === PUZZLE_HALTE * PUZZLE_PUNKTE_JE_HALT ? 'richtig' : 'falsch')
            void schicken('tipp', { frage, antwort: gewaehlt })
          }}>Abgeben</button>
        </>
      )}
      {(phase === 'warten' || (phase === 'frage' && gesendet === frage)) && (
        <div className="mt-4">
          <p className="text-xl font-bold">Deine Reihenfolge ist abgegeben</p>
          <p className={`mt-1 ${LEISE}`}>Warte auf {spieler.filter((m) => !tipps[m.id]).map((m) => m.name).join(', ') || 'die Vermittlung'} …</p>
          {gastgeber && (
            <button type="button" onClick={() => void schicken('aufloesen', { frage })}
                    className="mt-4 rounded-lg border border-sbb-cloud px-4 py-2 font-medium dark:border-sbb-iron">Nicht länger warten und auflösen</button>
          )}
        </div>
      )}
      {phase === 'loesung' && (
        <>
          {meiner && <PuzzleWahl runde={runde} name={name} gewaehlt={meiner} setGewaehlt={() => {}} gewertet />}
          <PuzzleLoesung runde={runde} namen={namen} name={name} spieler={spieler.map((m) => ({ name: m.name, punkte: punkteVon(m.id, frage) }))} />
          {gastgeber
            ? <button type="button" className={`mt-4 w-full md:w-auto ${ROT}`} onClick={() => void schicken('weiter', { frage })}>
                {frage + 1 >= runden.length ? 'Ergebnis' : 'Nächste Runde'}</button>
            : <p className={`mt-4 ${LEISE}`}>{gastName} geht weiter, sobald alle die Lösung gesehen haben.</p>}
        </>
      )}
      {phase === 'ende' && (
        <Rangliste spieler={spieler.map((m) => ({ name: m.name, punkte: summe(m.id) }))} hoechst={runden.length * PUZZLE_HALTE * PUZZLE_PUNKTE_JE_HALT}
                   nochmals={gastgeber ? () => void schicken('start', puzzleStart(vorrat, namen, stand.dabei)) : undefined}
                   schliessen={verlassen} warten={gastgeber ? undefined : `${gastName} kann eine neue Runde starten.`} />
      )}
      <Quelle v={vorrat} />
    </div>,
  )
}

/**
 * Hinweise in «Reisedauer» (Michael, 2026-11-18: «Ein Hinweis ist eine einfache Karte und zweiter Hinweis sind alle Zwischenhalte in der Karte»):
 * 1 die Karte mit dem Netz und den beiden Bahnhöfen, 2 dazu die Halte dazwischen laut Fahrplan; Lage der Bahnhöfe aus dem Index der App
 */
function DauerKarte({ runde, hinweise, lageVon, name }: {
  runde: DauerRunde; hinweise: number; lageVon: (u: number) => [number, number] | null; name: (u: number) => string
}) {
  const { daten, linien, fehler } = useKarte()
  const inhalt = useMemo(() => {
    const idx = hinweise >= 2 ? Array.from({ length: runde.bis - runde.von + 1 }, (_, i) => runde.von + i) : [runde.von, runde.bis]
    const pkt = idx.flatMap((i) => {
      const u = runde.f.h[i][0], xy = lageVon(u)
      return xy ? [{ x: xy[0], y: xy[1], name: name(u), uic: u, ende: i === runde.von || i === runde.bis }] : []
    })
    if (!pkt.length) return null
    const xs = pkt.map((p) => p.x), ys = pkt.map((p) => p.y)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const box: Box = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max((x1 - x0) * 1.4, (y1 - y0) * 1.4 * 1.6, 0.15) }
    return { pkt, box }
  }, [runde, hinweise, lageVon, name])
  if (fehler) return <p className={`mt-3 ${LEISE}`}>Die Karte konnte nicht geladen werden.</p>
  if (!daten || !linien || !inhalt) return <KartenPlatz />
  return (
    <div className="mt-3">
      <Netzkarte daten={daten} linien={linien} start={inhalt.box} punkte={inhalt.pkt} titel="Karte zum Hinweis"
        zeichnen={(px) => inhalt.pkt.filter((p) => p.ende).map((p) => (
          <circle key={p.uic} cx={p.x} cy={p.y} r={8.5 * px} className="fill-sbb-red" />
        ))}
        beschriftung={<>Rot umrandet: die beiden Bahnhöfe der Frage{hinweise >= 2 ? ', Ringe: die Halte dazwischen laut Fahrplan (nur Bahnhöfe, die Taktland kennt)' : ''}, jeweils dort,
          wo der Index der App ihre Lage angibt. Grau das Streckennetz.</>} />
    </div>
  )
}

/**
 * «Reisedauer» (Michael, 2026-11-14): wie viele Minuten braucht ein Zug laut Fahrplan von der Abfahrt in A bis zur
 * Ankunft in B? Der Regler geht von 0 bis 180 Minuten; 100 Punkte genau getroffen, je Minute daneben weniger, keine ab 2 · toleranz() + 1 Minuten.
 */
export function Fahrzeit({ index }: { index: BahnhofIndex | null }) {
  const { vorrat, fehler, namen } = useVorrat(index)
  const [nr, setNr] = useState(-1)
  const [runde, setRunde] = useState<DauerRunde | null>(null)
  const [tipp, setTipp] = useState(REGLER_BIS_MIN / 2)
  const [punkte, setPunkte] = useState<number[]>([])
  const [linien, setLinien] = useState<Set<string>>(new Set())
  const [neu, setNeu] = useState(false)
  const [hinweise, setHinweise] = useState(0)
  const name = useCallback((u: number) => namen.get(u) ?? String(u), [namen])
  const lagen = useMemo(() => new Map((index?.bahnhoefe ?? []).filter((b) => b.lat !== null && b.lon !== null)
    .map((b) => [b.uic, lage(b.lat!, b.lon!)] as const)), [index])
  const lageVon = useCallback((u: number) => lagen.get(u) ?? null, [lagen])
  const ziehen = (schon: Set<string>) => {
    if (!vorrat) return
    const r = dauerZiehen(vorrat, (u) => namen.has(u), schon)
    setRunde(r); setTipp(REGLER_BIS_MIN / 2); setHinweise(0)
    if (r) setLinien(new Set([...schon, `${r.f.g}|${r.f.l}`]))
  }
  const gewertet = punkte.length > nr && nr >= 0
  const summe = punkte.reduce((a, b) => a + b, 0)

  return (
    <div className="px-4 pb-6">
      <Kopf titel="Reisedauer" best={bestwert('dauer')}
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
          <Bezeichnung f={runde.f} titel={`${zugTitel(runde.f)} von ${name(runde.f.h[runde.von][0])} nach ${name(runde.f.h[runde.bis][0])}`}
                       ziel={runde.f.z !== name(runde.f.h[runde.bis][0]) ? runde.f.z : undefined} />
          <p className={`mt-3 ${LEISE}`}>Hinweise · jeder kostet {Math.round(DAUER_HINWEIS_ABZUG * 100)} % der Punkte dieser Runde</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { n: 1, text: 'Karte', geht: hinweise === 0 },
              { n: 2, text: runde.bis - runde.von > 1 ? 'Zwischenhalte' : 'Keine Zwischenhalte', geht: hinweise === 1 && runde.bis - runde.von > 1 },
            ].map((h) => {
              const an = hinweise >= h.n
              return (
                <button key={h.n} type="button" aria-pressed={an} disabled={an || !h.geht || gewertet} onClick={() => setHinweise(h.n)}
                        className={`rounded-lg px-2.5 py-1.5 text-sm font-medium disabled:cursor-default ${an
                          ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                          : `kachel kachel-link ${h.geht && !gewertet ? '' : 'opacity-40'}`}`}>
                  {h.text} {an ? '✓' : h.geht || hinweise < h.n - 1 ? <span className="text-sbb-red">−{Math.round(DAUER_HINWEIS_ABZUG * 100)} %</span> : null}
                </button>
              )
            })}
          </div>
          {hinweise > 0 && <DauerKarte runde={runde} hinweise={hinweise} lageVon={lageVon} name={name} />}
          <p className="mt-4 text-center text-4xl font-bold tabular-nums">{tipp} Min.</p>
          <input type="range" min={0} max={REGLER_BIS_MIN} step={1} value={tipp} disabled={gewertet} aria-label="Minuten"
                 onChange={(e) => setTipp(Number(e.target.value))} className="mt-2 w-full accent-sbb-red" />
          <div className={`flex justify-between ${LEISE}`}><span>0</span><span>{REGLER_BIS_MIN} Min.</span></div>
          {!gewertet && (
            <button type="button" className={`mt-4 w-full md:w-auto ${ROT}`} onClick={() => {
              const p = Math.round(dauerPunkte(runde.min, tipp) * (1 - DAUER_HINWEIS_ABZUG * hinweise))
              antwortTon(p >= 50 ? 'richtig' : 'falsch')
              setPunkte([...punkte, p])
            }}>Prüfen</button>
          )}
          {gewertet && (
            <>
              <p className="mt-4 font-bold">
                {punkte[nr]} Punkte · laut Fahrplan {runde.min} Minuten: ab {name(runde.f.h[runde.von][0])} {uhr(runde.f.h[runde.von][2])},
                an {name(runde.f.h[runde.bis][0])} {uhr(runde.f.h[runde.bis][1])}
              </p>
              <p className={LEISE}>100 Punkte genau getroffen, je Minute daneben weniger, keine mehr ab {2 * toleranz(runde.min) + 1} Minuten daneben{hinweise
                ? `; ${hinweise} ${hinweise === 1 ? 'Hinweis' : 'Hinweise'}, −${Math.round(DAUER_HINWEIS_ABZUG * 100 * hinweise)} %` : ''}.</p>
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
