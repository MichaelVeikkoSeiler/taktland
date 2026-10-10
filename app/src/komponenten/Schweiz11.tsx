import { useEffect, useMemo, useRef, useState } from 'react'
import type { BahnhofIndex, IndexEintrag } from '../typen'
import {
  abstandM, anzeigeName, aufgabenZiehen, distanzText, einstellungSchluessel, type Einstellungen, GRUNDWERT, type Hilfe, HILFE_ABZUG,
  HILFEN, hinweisGesehen, KATEGORIE_NAME, type Kategorie, nullGrenzeM, partieFesthalten, passende, type Pool, punkte, raenge,
  schweiz11Laden, type Schwierigkeit, speicherLesen, type SpielObjekt, STANDARD, STUFE_FAKTOR, STUFE_NAME, typText, urteil,
} from '../schweiz11'
import { type KartenPin, Schweiz11Karte } from './Schweiz11Karte'
import { Auswahl } from './Auswahl'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'
import { kantoneText } from '../kanton'
import { genau } from './Objekte'
import { gerundetM } from '../fahrt'
import { antwortTon, reiterTon } from '../audio'
import { raumEroeffnen, teilnahmeMerken } from '../spielraum'

const KANTONSNAME: Record<string, string> = {
  AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden',
  BE: 'Bern', BL: 'Basel-Landschaft', BS: 'Basel-Stadt', FR: 'Freiburg',
  GE: 'Genf', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern',
  NE: 'Neuenburg', NW: 'Nidwalden', OW: 'Obwalden', SG: 'St. Gallen',
  SH: 'Schaffhausen', SO: 'Solothurn', SZ: 'Schwyz', TG: 'Thurgau',
  TI: 'Tessin', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich',
}
const EINSTELLUNG = 'taktland.schweiz11.einstellungen.v1'

const MAX_SPIELER = 8

function einstellungLesen(): { e: Einstellungen; namen: string[]; gruppe: boolean; online: boolean; meinName: string } {
  try {
    const x = JSON.parse(localStorage.getItem(EINSTELLUNG) ?? '{}')
    const e = { ...STANDARD, ...(x.e ?? {}) } as Einstellungen
    const namen = Array.isArray(x.namen) && x.namen.length >= 2 ? x.namen.slice(0, MAX_SPIELER).map(String) : ['Spieler 1', 'Spieler 2']
    return { e, namen, gruppe: x.gruppe === true, online: x.online === true, meinName: typeof x.meinName === 'string' ? x.meinName : '' }
  } catch {
    return { e: STANDARD, namen: ['Spieler 1', 'Spieler 2'], gruppe: false, online: false, meinName: '' }
  }
}

/** hilfen: wie viele Hilfen eingeschaltet waren; fehlt bei Geräten mit älterer Version und bei
 *  Spielern, die nicht getippt haben (Michael, 2026-10-06: «Anzahl Hilfen anzeigen») */
export interface Antwort { pin: KartenPin | null; dM: number | null; punkte: number; zeitAus: boolean; hilfen?: number }
interface Partie { e: Einstellungen; aufgaben: SpielObjekt[]; spieler: string[]; d0: number }

/**
 * «Geo» (Michael, 2026-10-03): Einstellungen, dann die Partie als ganze
 * Fläche über der Seite, damit die Karte möglichst viel Platz hat. Allein oder zu
 * mehreren auf einem Gerät; alle bekommen dieselben Aufgaben.
 */
export function Schweiz11({ index }: { index: BahnhofIndex | null }) {
  const [pool, setPool] = useState<Pool | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => { schweiz11Laden().then(setPool).catch((e: Error) => setFehler(e.message)) }, [])
  const gemerkt = useMemo(() => einstellungLesen(), [])
  const [e, setE] = useState<Einstellungen>(gemerkt.e)
  const [gruppe, setGruppe] = useState(gemerkt.gruppe)
  const [namen, setNamen] = useState<string[]>(gemerkt.namen)
  // auf mehreren Geräten (Michael, 2026-10-05): eigener Name, Raum eröffnen oder mit Code beitreten
  const [online, setOnline] = useState(gemerkt.online)
  const [meinName, setMeinName] = useState(gemerkt.meinName)
  const [code, setCode] = useState('')
  const [eroeffnet, setEroeffnet] = useState<'nein' | 'laeuft' | string>('nein')
  const [partie, setPartie] = useState<Partie | null>(null)
  useEffect(() => {
    try { localStorage.setItem(EINSTELLUNG, JSON.stringify({ e, namen, gruppe, online, meinName })) } catch { /* nur jetzt */ }
  }, [e, namen, gruppe, online, meinName])

  async function eroeffnen() {
    setEroeffnet('laeuft')
    try {
      const raum = await raumEroeffnen()
      teilnahmeMerken({ raum, name: meinName.trim(), gastgeber: true })
      window.location.hash = `#/schweiz11/mit/${raum}`
    } catch (x) {
      setEroeffnet(x instanceof Error ? x.message : 'Der Raum konnte nicht eröffnet werden.')
    }
  }

  const anzahl = pool ? passende(pool, e).length : 0
  const kantone = useMemo(() => pool ? [...pool.kantone.keys()].sort((a, b) => (KANTONSNAME[a] ?? a).localeCompare(KANTONSNAME[b] ?? b, 'de-CH')) : [], [pool])
  const best = speicherLesen().bestwerte[einstellungSchluessel(e)]
  const namenOk = !gruppe || namen.every((n) => n.trim())

  function starten() {
    if (!pool) return
    setPartie({ e, aufgaben: aufgabenZiehen(pool, e), spieler: gruppe ? namen.map((n) => n.trim()) : ['Du'], d0: nullGrenzeM(pool, e.gebiet) })
  }

  const wahl = <T extends string | number>(titel: string, wert: T, optionen: Array<[T, string]>, setzen: (w: T) => void,
    spalten = `repeat(${optionen.length}, minmax(0, 1fr))`) => (
    <fieldset className="mt-5">
      <legend className="text-sm text-sbb-metal dark:text-sbb-storm">{titel}</legend>
      <div className="segmente mt-1.5 grid" style={{ gridTemplateColumns: spalten }}>
        {optionen.map(([w, t]) => (
          <button key={String(w)} type="button" aria-pressed={wert === w}
                  onClick={() => { if (wert !== w) reiterTon(); setzen(w) }}
                  className="segment whitespace-normal px-1 py-2 text-sm leading-tight">{t}</button>
        ))}
      </div>
    </fieldset>
  )

  return (
    <div className="px-4 pb-4">
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Geo</h1>
      <p className="mt-2 leading-relaxed">
        Ein Bahnhof, ein Tunnel oder eine Brücke wird genannt. Setze den Pin dorthin, wo er liegt: Je näher,
        desto mehr Punkte. Hilfen auf der Karte zeigen mehr, kosten aber Punkte.
      </p>
      {fehler && <Ladefehler className="mt-6" was="Das Spiel konnte nicht geladen werden." fehler={fehler} />}
      {!pool && !fehler && <p className="mt-6 text-sbb-metal">Wird geladen …</p>}
      {pool && (
        <div className="md:grid md:grid-cols-2 md:gap-x-8">
          <div>
            {wahl('Wer spielt', online ? 'o' : gruppe ? 'g' : 'a',
                  [['a', 'Allein'], ['g', 'Mehrere auf diesem Gerät'], ['o', 'Auf mehreren Geräten']],
                  (w) => { setGruppe(w === 'g'); setOnline(w === 'o') },
                  // die längeren Namen brauchen mehr Platz, sonst brechen sie auf schmalen Geräten um
                  'minmax(0, 2fr) minmax(0, 3fr) minmax(0, 3fr)')}
            {online && (
              <div className="mt-3">
                <label className="block text-sm text-sbb-metal dark:text-sbb-storm" htmlFor="geo-mein-name">Dein Name</label>
                <input id="geo-mein-name" value={meinName} maxLength={20} onChange={(ev) => setMeinName(ev.target.value)}
                       className="mt-1.5 w-full rounded-lg border border-sbb-cloud bg-white px-3 py-2 dark:border-sbb-iron dark:bg-sbb-midnight" />
                <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
                  Du eröffnest einen Raum und zeigst den QR-Code; die anderen scannen ihn mit ihrem Gerät. Alle bekommen
                  dieselben Aufgaben, die Einstellungen hier gelten für alle. Braucht Empfang.
                </p>
                <form className="mt-3 flex gap-2" onSubmit={(ev) => {
                  ev.preventDefault()
                  if (/^[A-Za-z]{4}$/.test(code.trim())) window.location.hash = `#/schweiz11/mit/${code.trim().toUpperCase()}`
                }}>
                  <input value={code} maxLength={4} aria-label="Code eines Raums" placeholder="Code"
                         onChange={(ev) => setCode(ev.target.value)} autoCapitalize="characters"
                         className="w-28 rounded-lg border border-sbb-cloud bg-white px-3 py-2 uppercase tracking-widest dark:border-sbb-iron dark:bg-sbb-midnight" />
                  <button type="submit" disabled={!/^[A-Za-z]{4}$/.test(code.trim())}
                          className="rounded-lg border border-sbb-cloud px-4 font-medium disabled:opacity-40 dark:border-sbb-iron">
                    Mit Code beitreten
                  </button>
                </form>
              </div>
            )}
            {gruppe && (
              <div className="mt-3 space-y-2">
                {namen.map((n, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={n} maxLength={20} aria-label={`Name von Spieler ${i + 1}`}
                           onChange={(ev) => setNamen(namen.map((x, j) => (j === i ? ev.target.value : x)))}
                           className="min-w-0 flex-1 rounded-lg border border-sbb-cloud bg-white px-3 py-2 dark:border-sbb-iron dark:bg-sbb-midnight" />
                    {namen.length > 2 && (
                      <button type="button" onClick={() => setNamen(namen.filter((_, j) => j !== i))} aria-label={`${n} entfernen`}
                              className="rounded-lg border border-sbb-cloud px-3 text-sbb-metal dark:border-sbb-iron">×</button>
                    )}
                  </div>
                ))}
                {namen.length < MAX_SPIELER && (
                  <button type="button" onClick={() => setNamen([...namen, `Spieler ${namen.length + 1}`])}
                          className="text-sm underline underline-offset-2">+ Spieler hinzufügen</button>
                )}
                <p className="text-sm text-sbb-metal dark:text-sbb-storm">
                  Alle bekommen dieselben Aufgaben. Das Gerät geht nach jedem Tipp weiter; die Lösung kommt, wenn alle getippt haben.
                </p>
              </div>
            )}
            {wahl('Fragen', e.fragen, [[5, '5'], [10, '10']], (w) => setE({ ...e, fragen: w }))}
            {wahl('Was', e.kategorie, (['gemischt', 'b', 't', 'r'] as Kategorie[]).map((k) => [k, KATEGORIE_NAME[k]]),
                  (w) => setE({ ...e, kategorie: w }))}
          </div>
          <div>
            {wahl('Schwierigkeit', e.schwierigkeit, [['gemischt', 'Gemischt'], [1, 'Leicht'], [2, 'Mittel'], [3, 'Schwer']] as Array<[Schwierigkeit, string]>,
                  (w) => setE({ ...e, schwierigkeit: w }))}
            <div className="mt-5">
              <span className="block text-sm text-sbb-metal dark:text-sbb-storm">Gebiet</span>
              <Auswahl titel="Gebiet" wert={e.gebiet} waehlen={(w) => { if (w !== e.gebiet) reiterTon(); setE({ ...e, gebiet: w }) }}
                       optionen={[{ wert: 'CH', text: 'Ganze Schweiz' }, ...kantone.map((k) => ({ wert: k, text: KANTONSNAME[k] ?? k }))]}
                       className="mt-1.5 w-full rounded-lg border border-sbb-cloud bg-white px-3 py-2.5 text-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white" />
            </div>
            {wahl('Zeit je Frage', e.zeit, [[0, 'Ohne'], [15, '15 s'], [30, '30 s'], [60, '60 s']], (w) => setE({ ...e, zeit: w }))}
          </div>
        </div>
      )}
      {pool && (
        <div className="mt-6">
          {anzahl < e.fragen ? (
            <p className="mb-3 border-l-2 border-sbb-red pl-3 text-sm">
              {anzahl === 0 ? 'Dazu gibt es keine passenden Objekte.' : `Dazu gibt es nur ${anzahl} ${anzahl === 1 ? 'passendes Objekt' : 'passende Objekte'}.`} Wähle ein
              grösseres Gebiet, eine andere Art oder eine andere Schwierigkeit.
            </p>
          ) : (
            <p className="mb-3 text-sm text-sbb-metal dark:text-sbb-storm">
              {genau(anzahl)} passende Objekte{!gruppe && !online && best ? ` · Bestwert mit diesen Einstellungen: ${genau(best.punkte)} Punkte` : ''}
            </p>
          )}
          {online ? (
            <>
              <button type="button" disabled={anzahl < e.fragen || !meinName.trim() || eroeffnet === 'laeuft'} onClick={() => void eroeffnen()}
                      className="min-h-12 w-full rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40 md:w-auto">
                {eroeffnet === 'laeuft' ? 'Raum wird eröffnet …' : 'Raum eröffnen'}
              </button>
              {eroeffnet !== 'nein' && eroeffnet !== 'laeuft' && (
                <p className="mt-2 border-l-2 border-sbb-red pl-3 text-sm">{eroeffnet}</p>
              )}
            </>
          ) : (
            <button type="button" disabled={anzahl < e.fragen || !namenOk} onClick={starten}
                    className="min-h-12 w-full rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40 md:w-auto">
              Spiel starten
            </button>
          )}
          <p className="mt-4 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
            Ziel ist bei Bahnhöfen ihre Lage laut Daten der SBB, bei Tunneln und Brücken die Mitte zwischen Anfang
            und Ende (SBB, swisstopo swissTLM3D), bei Tunneln ohne bekannte Richtung der Punkt laut Quelle. Leicht,
            mittel und schwer ergeben sich aus den Daten: Bahnhöfe nach Ein- und Aussteigenden, Tunnel und Brücken
            nach Länge. Kantonsflächen: BFS. Ergebnisse bleiben auf diesem Gerät.
          </p>
        </div>
      )}
      {partie && pool && index && (
        <Spiel key={partie.aufgaben.map((a) => a.id).join()} pool={pool} partie={partie} index={index.bahnhoefe}
               nochmals={starten} schliessen={() => setPartie(null)} />
      )}
    </div>
  )
}

type Phase = 'uebergabe' | 'frage' | 'aufloesung' | 'ende'

/**
 * Eine Frage für einen Spieler: Pin, Hilfen, Zeitlimit und Abgabe. Gebraucht beim Spiel auf einem
 * Gerät und auf mehreren Geräten (Schweiz11Online.tsx). aktiv: die Frage ist gerade zu sehen;
 * schluessel wechselt mit jeder neuen Frage oder jedem neuen Spieler.
 */
export function useFrage({ e, ziel, d0, aktiv, schluessel, beiAbgabe }: {
  e: Einstellungen; ziel: SpielObjekt; d0: number; aktiv: boolean; schluessel: string; beiAbgabe: (a: Antwort) => void
}) {
  const [pin, setPin] = useState<KartenPin | null>(null)
  const [hilfen, setHilfen] = useState<Set<Hilfe>>(new Set())
  const [meldung, setMeldung] = useState<string | null>(null)
  // Zeitlimit: läuft ab der ersten Anzeige der Frage für diesen Spieler
  const beginn = useRef(0)
  const [start, setStart] = useState(0)
  const [jetzt, setJetzt] = useState(0)
  useEffect(() => {
    if (!aktiv) return
    beginn.current = Date.now()
    setStart(beginn.current)
    setJetzt(beginn.current)
    if (!e.zeit) return
    const t = setInterval(() => setJetzt(Date.now()), 200)
    return () => clearInterval(t)
  }, [aktiv, schluessel, e.zeit])
  const rest = e.zeit ? Math.max(0, e.zeit - (jetzt - start) / 1000) : null
  const abgegeben = useRef(false)
  useEffect(() => { abgegeben.current = false }, [schluessel])

  function abgeben(zeitAus: boolean) {
    if (abgegeben.current) return
    abgegeben.current = true
    // ein gesetzter, aber nicht bestätigter Pin zählt nicht
    const p = zeitAus ? null : pin
    const dM = p ? abstandM(p, ziel) : null
    const a: Antwort = { pin: p, dM, zeitAus, punkte: dM === null ? 0 : punkte(dM, d0, ziel.s, hilfen.size), hilfen: hilfen.size }
    setPin(null)
    setHilfen(new Set())
    beiAbgabe(a)
  }
  // abgelaufen: mit der frischen Startzeit dieser Frage geprüft, nicht mit dem Wert der letzten Anzeige
  useEffect(() => { if (aktiv && e.zeit && (Date.now() - beginn.current) / 1000 >= e.zeit) abgeben(true) })

  useEffect(() => {
    if (!meldung) return
    const t = setTimeout(() => setMeldung(null), 1800)
    return () => clearTimeout(t)
  }, [meldung])
  return { pin, setPin, hilfen, setHilfen, meldung, setMeldung, rest, abgeben }
}
export type Frage = ReturnType<typeof useFrage>

/** Die Leiste oben: Spiel, Frage, Zeit und Beenden */
export function Kopf({ text, rest, beenden, beendenText = 'Beenden', titel = 'Geo' }: {
  text: React.ReactNode; rest: number | null; beenden: () => void; beendenText?: string; titel?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sbb-cloud px-4 py-2 dark:border-sbb-iron">
      <p className="min-w-0 truncate text-sm text-sbb-metal dark:text-sbb-storm">
        <span className="font-bold text-sbb-black dark:text-sbb-white">{titel}</span>{text}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {rest !== null && (
          <span className={`min-w-14 rounded-lg px-2 py-1 text-center font-bold tabular-nums ${rest <= 5 ? 'bg-sbb-red text-white' : 'kachel'}`}
                role="timer" aria-label={`Noch ${Math.ceil(rest)} Sekunden`}>
            {Math.ceil(rest)} s
          </span>
        )}
        <button type="button" onClick={beenden}
                className="rounded-lg border border-sbb-cloud px-3 py-1.5 text-sm font-medium dark:border-sbb-iron">
          {beendenText}
        </button>
      </div>
    </div>
  )
}

/** Karte, Aufgabe, Hilfen und «Tipp bestätigen» einer Frage */
export function FrageFlaeche({ pool, e, ziel, index, f, schluessel }: {
  pool: Pool; e: Einstellungen; ziel: SpielObjekt; index: IndexEintrag[]; f: Frage; schluessel: string
}) {
  const [hinweis, setHinweis] = useState(() => !speicherLesen().hinweis)
  const { pin, setPin, hilfen, setHilfen, meldung, setMeldung } = f
  const moeglich = Math.round(GRUNDWERT * STUFE_FAKTOR[ziel.s] * Math.max(0, 1 - HILFE_ABZUG * hilfen.size))
  const zielName = anzeigeName(ziel)

  const aufgabe = (
    <div>
      <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
        Wo liegt {ziel.t === 'r' && ziel.art !== 'gedeckte_bruecke' ? 'die' : ziel.art === 'galerie' ? 'die' : 'der'} {typText(ziel)}?
      </p>
      <p lang="de" className="mt-0.5 text-2xl font-bold leading-tight hyphens-auto break-words">{zielName}</p>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
        {STUFE_NAME[ziel.s]} · bis <span className="font-bold text-sbb-black dark:text-sbb-white">{moeglich}</span> Punkte
      </p>
    </div>
  )

  const steuerung = (
    <div>
      <p className="text-sm text-sbb-metal dark:text-sbb-storm">
        Hilfen · jede kostet {Math.round(HILFE_ABZUG * 100)} % der möglichen Punkte und bleibt für diese Frage an
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {HILFEN.map((h) => {
          const an = hilfen.has(h.id)
          return (
            <button key={h.id} type="button" aria-pressed={an} disabled={an}
                    onClick={() => setHilfen(new Set([...hilfen, h.id]))}
                    className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ${an
                      ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
                      : 'kachel kachel-link'}`}>
              {h.name} {an ? '✓' : <span className="text-sbb-red">−{Math.round(HILFE_ABZUG * 100)} %</span>}
            </button>
          )
        })}
      </div>
      <button type="button" disabled={!pin} onClick={() => f.abgeben(false)}
              className="mt-3 min-h-12 w-full rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40
                         quer:sticky quer:bottom-0 quer:shadow-[0_-8px_0_0_var(--color-white)] dark:quer:shadow-[0_-8px_0_0_var(--color-sbb-midnight)]">
        {pin ? 'Tipp bestätigen' : 'Tippe auf die Karte für deinen Pin'}
      </button>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row quer:flex-row">
      <div className="px-4 py-3 md:hidden quer:hidden">{aufgabe}</div>
      <div className="relative min-h-0 flex-1">
        <Schweiz11Karte key={schluessel} pool={pool} gebiet={e.gebiet} hilfen={hilfen} ziel={ziel} index={index}
                        pin={pin} setzen={setPin} ausserhalb={() => setMeldung('Ausserhalb des Spielgebiets')}
                        klasse="absolute inset-0" />
        {meldung && (
          <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-max rounded-lg bg-sbb-anthracite px-3 py-1.5 text-sm text-white" role="status">
            {meldung}
          </p>
        )}
        {hinweis && (
          <div className="absolute inset-x-3 top-3 rounded-lg bg-white p-3 text-sm shadow-lg dark:bg-sbb-charcoal md:inset-x-auto md:left-3 md:max-w-sm">
            <p>Tippe auf die Karte, um deinen Pin zu setzen; ziehe ihn, um ihn zu verschieben. Zoomen mit zwei Fingern
              oder mit + und −. Erst «Tipp bestätigen» zählt.</p>
            <p className="mt-1">Jede Hilfe kostet {Math.round(HILFE_ABZUG * 100)} % der möglichen Punkte.</p>
            <button type="button" onClick={() => { setHinweis(false); hinweisGesehen() }}
                    className="mt-2 rounded-lg border border-sbb-cloud px-3 py-1 font-medium dark:border-sbb-iron">Verstanden</button>
          </div>
        )}
      </div>
      <div className="border-t border-sbb-cloud px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-sbb-iron md:w-80 md:shrink-0 md:overflow-y-auto md:border-l md:border-t-0 lg:w-96 quer:w-72 quer:shrink-0 quer:overflow-y-auto quer:border-l quer:border-t-0">
        <div className="hidden md:mb-5 md:block quer:mb-3 quer:block">{aufgabe}</div>
        {steuerung}
      </div>
    </div>
  )
}

function Spiel({ pool, partie, index, nochmals, schliessen }: {
  pool: Pool; partie: Partie; index: IndexEintrag[]; nochmals: () => void; schliessen: () => void
}) {
  const { e, aufgaben, spieler, d0 } = partie
  const gruppe = spieler.length > 1
  const [frage, setFrage] = useState(0)
  const [wer, setWer] = useState(0)
  const [phase, setPhase] = useState<Phase>(gruppe ? 'uebergabe' : 'frage')
  const [antworten, setAntworten] = useState<Antwort[][]>([])
  const [bisher, setBisher] = useState<number | null | undefined>(undefined)
  const ziel = aufgaben[frage]

  const f = useFrage({ e, ziel, d0, aktiv: phase === 'frage', schluessel: `${frage}-${wer}`, beiAbgabe: (a) => {
    setAntworten((alt) => {
      const neu = alt.map((x) => [...x])
      neu[frage] = [...(neu[frage] ?? [])]
      neu[frage][wer] = a
      return neu
    })
    if (!gruppe) antwortTon(a.punkte > 0 ? 'richtig' : 'falsch')
    if (wer + 1 < spieler.length) { setWer(wer + 1); setPhase('uebergabe') } else setPhase('aufloesung')
  } })

  function weiter() {
    if (frage + 1 < aufgaben.length) {
      setFrage(frage + 1); setWer(0); setPhase(gruppe ? 'uebergabe' : 'frage')
    } else {
      if (!gruppe) setBisher(partieFesthalten(e, summe(0)))
      setPhase('ende')
    }
  }
  const summe = (i: number) => antworten.reduce((a, r) => a + (r[i]?.punkte ?? 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white"
         role="dialog" aria-label="Geo">
      <Kopf text={phase !== 'ende' && <> · Frage {frage + 1} von {aufgaben.length}{gruppe && phase === 'frage' ? ` · ${spieler[wer]}` : ''}</>}
            rest={phase === 'frage' ? f.rest : null} beendenText={phase === 'ende' ? 'Schliessen' : 'Beenden'}
            beenden={() => { if (phase === 'ende' || window.confirm('Partie beenden? Der Spielstand geht verloren.')) schliessen() }} />
      {phase === 'uebergabe' && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-sbb-metal dark:text-sbb-storm">Frage {frage + 1} von {aufgaben.length}</p>
          <p className="mt-2 text-2xl font-bold">Gerät an {spieler[wer]} weitergeben</p>
          <p className="mt-2 max-w-sm text-sbb-metal dark:text-sbb-storm">
            {spieler[wer]} tippt auf «Bereit», wenn niemand sonst mehr auf den Bildschirm schaut.
          </p>
          <button type="button" onClick={() => setPhase('frage')}
                  className="mt-6 min-h-12 rounded-lg bg-sbb-red px-10 font-bold text-white hover:bg-sbb-red125">
            Bereit
          </button>
        </div>
      )}
      {phase === 'frage' && <FrageFlaeche pool={pool} e={e} ziel={ziel} index={index} f={f} schluessel={`${frage}-${wer}`} />}
      {phase === 'aufloesung' && (
        <Aufloesung pool={pool} e={e} ziel={ziel} index={index} spieler={spieler} antworten={antworten} frage={frage} d0={d0}
                    letzte={frage + 1 === aufgaben.length} weiter={weiter} />
      )}
      {phase === 'ende' && (
        <Ende spieler={spieler} antworten={antworten} bisher={gruppe ? undefined : bisher} nochmals={nochmals} schliessen={schliessen} />
      )}
    </div>
  )
}

/** Was die Daten zum Objekt sagen, höchstens zwei Angaben */
function fakten(o: SpielObjekt, index: IndexEintrag[]): string[] {
  if (o.t === 'b') {
    const b = index.find((x) => String(x.uic) === o.id)
    return [
      b?.dwv ? `${genau(b.dwv)} Ein- und Aussteigende pro Werktag (SBB)` : null,
      b?.perron_laengste_m ? `Längstes erfasstes Perron: ${genau(b.perron_laengste_m)} m` : null,
      b ? kantoneText(b) : null,
    ].filter((x): x is string => !!x).slice(0, 2)
  }
  if (o.id.startsWith('tlm:')) {
    return [o.zm ? `Länge der Zeichnung in swissTLM3D: etwa ${genau(gerundetM(o.zm))} m` : null,
            'Strecke einer anderen Bahn als der SBB'].filter((x): x is string => !!x)
  }
  if (o.t === 't') {
    return [o.m ? `Länge laut SBB: ${genau(o.m)} m` : null,
            o.jahr ? `Erstmals in Betrieb: ${o.jahr}` : o.linie ? `Linie ${o.linie}` : null].filter((x): x is string => !!x)
  }
  return [o.zm ? `Etwa ${genau(gerundetM(o.zm))} m laut Zeichnung von swisstopo` : null,
          o.be ? `${o.be} ${o.be === 1 ? 'Baueinheit' : 'Baueinheiten'} laut SBB` : o.linie ? `Linie ${o.linie}` : null]
    .filter((x): x is string => !!x)
}

export function Aufloesung({ pool, e, ziel, index, spieler, antworten, frage, d0, letzte, weiter, warten }: {
  pool: Pool; e: Einstellungen; ziel: SpielObjekt; index: IndexEintrag[]; spieler: string[]; antworten: Antwort[][]
  frage: number; d0: number; letzte: boolean
  /** ohne: auf mehreren Geräten geht nur der Gastgeber weiter, hier steht dann warten */
  weiter?: () => void; warten?: string
}) {
  const gruppe = spieler.length > 1
  const runde = antworten[frage] ?? []
  // fest je Runde, sonst setzte die Karte den Ausschnitt bei jedem Bild neu
  const pins = useMemo<KartenPin[]>(() => runde.flatMap((a, i) => (a.pin ? [{ ...a.pin, name: spieler[i], eigen: !gruppe }] : [])),
                                    [runde, spieler, gruppe])
  const eigene = runde[0]
  const name = anzeigeName(ziel)
  const stand = spieler.map((s, i) => ({ name: s, punkte: antworten.reduce((a, r) => a + (r[i]?.punkte ?? 0), 0) }))
  // in der Auflösung alle Hilfen, damit man sich orientieren kann (Michael, 2026-10-03)
  const alleHilfen = useMemo(() => new Set<Hilfe>(['kantone', 'seen', 'fluesse', 'orte', 'bahnnetz']), [])

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row quer:flex-row">
      <div className="relative h-[45vh] shrink-0 md:h-auto md:flex-1 quer:h-auto quer:flex-1">
        <Schweiz11Karte pool={pool} gebiet={e.gebiet} hilfen={alleHilfen} ziel={ziel} index={index} pin={null}
                        aufloesung pins={pins} klasse="absolute inset-0" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:w-80 md:flex-none md:border-l md:border-sbb-cloud lg:w-96 md:dark:border-sbb-iron quer:w-72 quer:flex-none quer:border-l quer:border-sbb-cloud quer:dark:border-sbb-iron">
        <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">{typText(ziel)} · {STUFE_NAME[ziel.s]}</p>
        <p className="text-2xl font-bold leading-tight">{name}</p>
        {name !== ziel.name && <p className="text-sm text-sbb-metal dark:text-sbb-storm">Name laut Quelle: {ziel.name}</p>}
        {!gruppe && eigene && (
          <div className="kachel mt-3 p-3">
            {eigene.zeitAus ? (
              <p className="font-bold">Nicht rechtzeitig bestätigt · 0 Punkte</p>
            ) : (
              <>
                <p className="text-lg font-bold">{urteil(eigene.dM!, d0)}</p>
                <p className="mt-1 tabular-nums">{distanzText(eigene.dM!)} daneben · <span className="font-bold">{eigene.punkte} Punkte</span></p>
              </>
            )}
          </div>
        )}
        {gruppe && (
          <table className="mt-3 w-full text-left text-sm tabular-nums">
            <thead className="text-sbb-metal dark:text-sbb-storm">
              <tr><th className="py-1 font-medium">Spieler</th><th className="py-1 font-medium">Abweichung</th><th className="py-1 text-right font-medium">Punkte</th></tr>
            </thead>
            <tbody>
              {spieler.map((s, i) => {
                const a = runde[i]
                return (
                  <tr key={i} className="border-t border-sbb-cloud dark:border-sbb-iron">
                    <td className="py-1.5 pr-2">{s}</td>
                    <td className="py-1.5 pr-2">{a && a.dM !== null && !a.zeitAus ? distanzText(a.dM) : 'Nicht rechtzeitig bestätigt'}</td>
                    <td className="py-1.5 text-right font-bold">{a?.punkte ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {fakten(ziel, index).map((f) => <li key={f}>{f}</li>)}
        </ul>
        {gruppe && (
          <div className="mt-4">
            <p className="text-sm font-bold">Gesamtstand</p>
            <ol className="mt-1 text-sm tabular-nums">
              {raenge(stand).map((s) => (
                <li key={s.name} className="flex justify-between border-t border-sbb-cloud py-1 dark:border-sbb-iron">
                  <span>{s.rang}. {s.name}</span><span className="font-bold">{s.punkte}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {weiter ? (
          <button type="button" onClick={weiter}
                  className="mt-4 min-h-12 w-full rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125">
            {letzte ? 'Zum Ergebnis' : 'Weiter'}
          </button>
        ) : <p className="mt-4 text-sm text-sbb-metal dark:text-sbb-storm">{warten}</p>}
      </div>
    </div>
  )
}

/** «keine Hilfe», «1 Hilfe», «3 Hilfen»; wo sie nicht bei jeder Frage bekannt ist (kein Tipp, ältere
 *  Version), mit «bei 4 von 5 Fragen» */
function hilfenText(n: number, bekannt: number, fragen: number) {
  const t = n === 0 ? 'keine Hilfe' : n === 1 ? '1 Hilfe' : `${n} Hilfen`
  return bekannt < fragen ? `${t} bei ${bekannt} von ${fragen} Fragen` : t
}

export function Ende({ spieler, antworten, bisher, nochmals, schliessen, schliessenText = 'Einstellungen', warten }: {
  spieler: string[]; antworten: Antwort[][]; bisher: number | null | undefined; nochmals?: () => void; schliessen: () => void
  schliessenText?: string; warten?: string
}) {
  const zeilen = spieler.map((name, i) => {
    const d = antworten.map((r) => r[i]?.dM).filter((x): x is number => x !== null && x !== undefined)
    const h = antworten.map((r) => r[i]?.hilfen)
    const bekannt = h.filter((x): x is number => typeof x === 'number')
    return { name, punkte: antworten.reduce((a, r) => a + (r[i]?.punkte ?? 0), 0),
             schnitt: d.length ? d.reduce((a, b) => a + b, 0) / d.length : null, ohne: antworten.length - d.length,
             hilfen: bekannt.length ? hilfenText(bekannt.reduce((a, b) => a + b, 0), bekannt.length, h.length) : null }
  })
  const allein = spieler.length === 1
  const z = zeilen[0]
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-lg">
        <h2 className="text-2xl font-bold tracking-tight">Ergebnis</h2>
        {allein ? (
          <div className="kachel mt-4 p-4">
            <p className="text-4xl font-bold tabular-nums">{z.punkte} <span className="text-lg font-medium">Punkte</span></p>
            <p className="mt-1 text-sbb-metal dark:text-sbb-storm">
              {z.schnitt === null ? 'Kein Tipp bestätigt' : `Durchschnittlich ${distanzText(z.schnitt)} daneben`}
              {z.ohne > 0 && z.schnitt !== null ? ` · ${z.ohne} ohne bestätigten Tipp` : ''}
              {z.hilfen ? ` · ${z.hilfen}` : ''}
            </p>
            {bisher !== undefined && (
              <p className="mt-2 font-medium">
                {bisher === null ? 'Erste Partie mit diesen Einstellungen.' : z.punkte > bisher ? `Neuer Bestwert! Bisher ${bisher} Punkte.` : `Bestwert: ${bisher} Punkte.`}
              </p>
            )}
          </div>
        ) : (
          <ol className="kachelliste mt-4">
            {raenge(zeilen).map((x) => (
              <li key={x.name} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-bold">{x.rang}. {x.name}</span>
                  <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                    {x.schnitt === null ? 'Kein Tipp bestätigt' : `Durchschnittlich ${distanzText(x.schnitt)} daneben`}
                    {x.hilfen ? ` · ${x.hilfen}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xl font-bold tabular-nums">{x.punkte}</span>
              </li>
            ))}
          </ol>
        )}
        {warten && <p className="mt-4 text-sm text-sbb-metal dark:text-sbb-storm">{warten}</p>}
        <div className={`mt-6 grid gap-2 ${nochmals ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {nochmals && (
            <button type="button" onClick={nochmals} className="min-h-12 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125">
              Nochmals
            </button>
          )}
          <button type="button" onClick={schliessen}
                  className="min-h-12 rounded-lg border border-sbb-cloud px-4 font-medium dark:border-sbb-iron">
            {schliessenText}
          </button>
        </div>
      </div>
    </div>
  )
}
