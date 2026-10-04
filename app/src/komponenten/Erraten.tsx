import { useEffect, useMemo, useState } from 'react'
import type { BahnhofIndex, IndexEintrag } from '../typen'
import {
  type Aktion, bestwert, bestwertFesthalten, type Einstellungen, erratenLaden, type ErratenBahnhof, HINWEISE, type HinweisId,
  hinweisText, moeglich, type Modus, type Partie, partieAnlegen, partieLesen, partieMerken, passende, type Pool,
  KOSTEN, PUNKTE_HOECHST, PUNKTE_JE_HINWEIS, type Runde, schritt, type Schwierigkeit, type Spur, stand, STANDARD, STUFE_NAME,
  suchen, verdeckt, vorgegeben,
} from '../erraten'
import { Auswahl } from './Auswahl'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'
import { genau } from './Objekte'
import { raenge } from '../schweiz11'
import { antwortTon, reiterTon } from '../audio'

const KANTONSNAME: Record<string, string> = {
  AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden',
  BE: 'Bern', BL: 'Basel-Landschaft', BS: 'Basel-Stadt', FR: 'Freiburg',
  GE: 'Genf', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern',
  NE: 'Neuenburg', NW: 'Nidwalden', OW: 'Obwalden', SG: 'St. Gallen',
  SH: 'Schaffhausen', SO: 'Solothurn', SZ: 'Schwyz', TG: 'Thurgau',
  TI: 'Tessin', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich',
}
const EINSTELLUNG = 'taktland.erraten.einstellungen.v1'
const MAX_SPIELER = 8

function einstellungLesen(): { e: Einstellungen; namen: string[] } {
  try {
    const x = JSON.parse(localStorage.getItem(EINSTELLUNG) ?? '{}')
    const namen = Array.isArray(x.namen) && x.namen.length >= 2 ? x.namen.slice(0, MAX_SPIELER).map(String) : ['Spieler 1', 'Spieler 2']
    return { e: { ...STANDARD, ...(x.e ?? {}) }, namen }
  } catch {
    return { e: STANDARD, namen: ['Spieler 1', 'Spieler 2'] }
  }
}

/**
 * «Bahnhofsuche» (Michael, 2026-10-04): Einstellungen, dann die Partie als ganze
 * Fläche über der Seite. Die Regeln stehen in src/erraten.ts; hier wird nur gezeigt und
 * jede Eingabe als Aktion an schritt() gegeben. Die laufende Partie bleibt in dieser
 * Sitzung erhalten, auch nach «Bahnhof ansehen» und nach einem Neuladen.
 */
export function Erraten({ index }: { index: BahnhofIndex | null }) {
  const [pool, setPool] = useState<Pool | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [partie, setPartieRoh] = useState<Partie | null>(null)
  useEffect(() => {
    erratenLaden().then((p) => { setPool(p); setPartieRoh(partieLesen(p)) }).catch((e: Error) => setFehler(e.message))
  }, [])
  const setPartie = (x: Partie | null) => { partieMerken(x); setPartieRoh(x) }
  const gemerkt = useMemo(() => einstellungLesen(), [])
  const [e, setE] = useState<Einstellungen>(gemerkt.e)
  const [namen, setNamen] = useState<string[]>(gemerkt.namen)
  const [zuWenig, setZuWenig] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(EINSTELLUNG, JSON.stringify({ e, namen })) } catch { /* nur jetzt */ }
  }, [e, namen])

  const mehrere = e.modus !== 'allein'
  const anzahl = pool ? passende(pool, e).length : 0
  const kantone = useMemo(() => {
    if (!pool) return []
    const je = new Map<string, number>()
    for (const b of pool.bahnhoefe) je.set(b.kt, (je.get(b.kt) ?? 0) + 1)
    // nur Kantone mit genug Bahnhöfen für die kürzere Partie
    return [...je.entries()].filter(([, n]) => n >= 5).map(([k]) => k)
      .sort((a, b) => (KANTONSNAME[a] ?? a).localeCompare(KANTONSNAME[b] ?? b, 'de-CH'))
  }, [pool])
  const namenOk = !mehrere || namen.every((n) => n.trim())
  const best = !mehrere ? bestwert(e) : null

  function starten() {
    if (!pool) return
    const x = partieAnlegen(pool, e, mehrere ? namen.map((n) => n.trim()) : ['Du'])
    setZuWenig(!x)
    if (x) setPartie(x)
  }

  const wahl = <T extends string | number>(titel: string, wert: T, optionen: Array<[T, string]>, setzen: (w: T) => void,
    spalten = `repeat(${optionen.length}, minmax(0, 1fr))`) => (
    <fieldset className="mt-5">
      <legend className="text-sm text-sbb-metal dark:text-sbb-storm">{titel}</legend>
      <div className="segmente mt-1.5 grid" style={{ gridTemplateColumns: spalten }}>
        {optionen.map(([w, t]) => (
          <button key={String(w)} type="button" aria-pressed={wert === w}
                  onClick={() => { if (wert !== w) reiterTon(); setzen(w) }}
                  className="segment px-1 py-2 text-sm">{t}</button>
        ))}
      </div>
    </fieldset>
  )

  return (
    <div className="px-4 pb-4">
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Bahnhofsuche</h1>
      <p className="mt-2 leading-relaxed">
        Taktland denkt an einen Bahnhof. Sechs Hinweiskarten liegen verdeckt; du siehst nur, worum es geht. Decke auf, was
        dir am meisten hilft, und rate: Je weniger Karten offen sind, desto mehr Punkte.
      </p>
      {fehler && <Ladefehler className="mt-6" was="Das Spiel konnte nicht geladen werden." fehler={fehler} />}
      {!pool && !fehler && <p className="mt-6 text-sbb-metal">Wird geladen …</p>}
      {pool && (
        <div className="md:grid md:grid-cols-2 md:gap-x-8">
          <div>
            {wahl('Wer spielt', mehrere ? 'm' : 'a', [['a', 'Allein'], ['m', 'Mehrere auf diesem Gerät']],
                  (w) => setE({ ...e, modus: w === 'a' ? 'allein' : e.modus === 'allein' ? 'miteinander' : e.modus }),
                  'minmax(0, 2fr) minmax(0, 3fr)')}
            {mehrere && (
              <>
                {wahl('Wie', e.modus, [['miteinander', 'Miteinander'], ['gegeneinander', 'Gegeneinander']] as Array<[Modus, string]>,
                      (w) => setE({ ...e, modus: w }))}
                <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
                  {e.modus === 'miteinander'
                    ? 'Ihr seid ein Team und spielt reihum: Wer am Zug ist, deckt eine Karte auf oder rät für alle.'
                    : 'Alle suchen denselben Bahnhof, jeder mit eigenen Karten. Reihum ein Zug: eine Karte aufdecken oder raten. Wer ihn zuerst erkennt, gewinnt die Runde.'}
                </p>
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
                </div>
              </>
            )}
            {wahl('Antwort', e.antwort, [['auswahl', 'Auswahl aus vier'], ['frei', 'Freie Eingabe']], (w) => setE({ ...e, antwort: w }))}
            {wahl('Bahnhöfe', e.fragen, [[5, '5'], [10, '10']], (w) => setE({ ...e, fragen: w }))}
          </div>
          <div>
            {wahl('Schwierigkeit', e.schwierigkeit, [['gemischt', 'Gemischt'], [1, 'Leicht'], [2, 'Mittel'], [3, 'Schwer']] as Array<[Schwierigkeit, string]>,
                  (w) => setE({ ...e, schwierigkeit: w }))}
            <div className="mt-5">
              <span className="block text-sm text-sbb-metal dark:text-sbb-storm">Region</span>
              <Auswahl titel="Region" wert={kantone.includes(e.gebiet) ? e.gebiet : 'CH'} waehlen={(w) => { if (w !== e.gebiet) reiterTon(); setE({ ...e, gebiet: w }) }}
                       optionen={[{ wert: 'CH', text: 'Ganze Schweiz' }, ...kantone.map((k) => ({ wert: k, text: KANTONSNAME[k] ?? k }))]}
                       className="mt-1.5 w-full rounded-lg border border-sbb-cloud bg-white px-3 py-2.5 text-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white" />
            </div>
            {wahl(e.modus === 'gegeneinander' ? 'Zeit je Zug' : 'Zeit je Bahnhof', e.zeit,
                  [[0, 'Ohne'], [30, '30 s'], [60, '60 s'], [90, '90 s']], (w) => setE({ ...e, zeit: w }))}
          </div>
        </div>
      )}
      {pool && (
        <div className="mt-6">
          {anzahl < e.fragen ? (
            <p className="mb-3 border-l-2 border-sbb-red pl-3 text-sm">
              {anzahl === 0 ? 'Dazu gibt es keine passenden Bahnhöfe.' : `Dazu gibt es nur ${anzahl} ${anzahl === 1 ? 'passenden Bahnhof' : 'passende Bahnhöfe'}.`} Wähle
              eine andere Region, eine andere Schwierigkeit oder 5 Bahnhöfe.
            </p>
          ) : (
            <p className="mb-3 text-sm text-sbb-metal dark:text-sbb-storm">
              {genau(anzahl)} passende Bahnhöfe{best !== null ? ` · Bestwert mit diesen Einstellungen: ${genau(best)} Punkte` : ''}
            </p>
          )}
          {zuWenig && <p className="mb-3 text-sm">Die Partie konnte nicht angelegt werden. Bitte andere Einstellungen wählen.</p>}
          <button type="button" disabled={anzahl < e.fragen || !namenOk} onClick={starten}
                  className="min-h-12 w-full rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40 md:w-auto">
            Spiel starten
          </button>
          <p className="mt-6 text-sm text-sbb-metal dark:text-sbb-storm">
            Spielen auf mehreren Geräten gleichzeitig ist in Vorbereitung.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
            Die Karten zeigen Kanton und Bezirk, Ein- und Aussteigende pro Werktag (SBB), Höhe, die Bahn der Infrastruktur und
            die Unternehmen, deren Züge dort halten, alles aus den Daten der Bahnhofseiten. Leicht, mittel und schwer ergeben
            sich aus dem Rang bei den Ein- und Aussteigenden: die obersten 20 % leicht, bis 50 % mittel, der Rest schwer.
            Jede aufgedeckte Karte kostet {PUNKTE_JE_HINWEIS} Punkte, der Bezirk {KOSTEN.bezirk}; ohne Karte gibt es {PUNKTE_HOECHST}. Ergebnisse bleiben
            auf diesem Gerät.
          </p>
        </div>
      )}
      {partie && pool && (
        <Spiel pool={pool} partie={partie} setPartie={setPartie} index={index?.bahnhoefe ?? []}
               nochmals={() => { setPartie(null); starten() }} schliessen={() => setPartie(null)} />
      )}
    </div>
  )
}

function Spiel({ pool, partie, setPartie, index, nochmals, schliessen }: {
  pool: Pool; partie: Partie; setPartie: (x: Partie | null) => void; index: IndexEintrag[]; nochmals: () => void; schliessen: () => void
}) {
  const x = partie
  const r = x.runden[x.frage]
  const ziel = pool.nach.get(r.ziel)!
  const gegen = x.e.modus === 'gegeneinander'
  const spur = r.spuren[gegen ? x.amZug : 0]
  const [bisher, setBisher] = useState<number | null | undefined>(undefined)
  const tun = (a: Aktion) => {
    const neu = schritt(x, a, pool)
    if (neu === x) return
    if (a.typ === 'raten') antwortTon(neu.runden[x.frage].sieger !== null ? 'richtig' : 'falsch')
    if (neu.phase === 'ende' && x.e.modus === 'allein') setBisher(bestwertFesthalten(x.e, stand(neu)[0].punkte))
    setPartie(neu)
  }

  // Zeit: die Frist steht in der Partie und läuft auch weiter, wenn man kurz woanders ist
  const [jetzt, setJetzt] = useState(() => Date.now())
  useEffect(() => {
    if (x.phase !== 'frage' || x.frist === null) return
    const t = setInterval(() => setJetzt(Date.now()), 250)
    return () => clearInterval(t)
  }, [x.phase, x.frist])
  const rest = x.phase === 'frage' && x.frist !== null ? Math.max(0, (x.frist - jetzt) / 1000) : null
  useEffect(() => {
    if (x.phase === 'frage' && x.frist !== null && Date.now() >= x.frist) {
      const neu = schritt(x, { typ: 'zeitAus' }, pool)
      if (neu !== x) setPartie(neu)
    }
  })

  const amZug = x.spieler[x.amZug]
  const kopf = (
    <div className="flex items-center justify-between gap-3 border-b border-sbb-cloud px-4 py-2 dark:border-sbb-iron">
      <p className="min-w-0 truncate text-sm text-sbb-metal dark:text-sbb-storm">
        <span className="font-bold text-sbb-black dark:text-sbb-white">Bahnhofsuche</span>
        {x.phase !== 'ende' && <> · Bahnhof {x.frage + 1} von {x.runden.length}</>}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {rest !== null && (
          <span className={`min-w-14 rounded-lg px-2 py-1 text-center font-bold tabular-nums ${rest <= 5 ? 'bg-sbb-red text-white' : 'kachel'}`}
                role="timer" aria-label={`Noch ${Math.ceil(rest)} Sekunden`}>
            {Math.ceil(rest)} s
          </span>
        )}
        <button type="button" onClick={() => { if (x.phase === 'ende' || window.confirm('Partie beenden? Der Spielstand geht verloren.')) schliessen() }}
                className="rounded-lg border border-sbb-cloud px-3 py-1.5 text-sm font-medium dark:border-sbb-iron">
          {x.phase === 'ende' ? 'Schliessen' : 'Beenden'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white"
         role="dialog" aria-label="Bahnhofsuche">
      {kopf}
      {x.phase === 'uebergabe' && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-sbb-metal dark:text-sbb-storm">Bahnhof {x.frage + 1} von {x.runden.length}</p>
          <p className="mt-2 text-2xl font-bold">Gerät an {amZug} weitergeben</p>
          <p className="mt-2 max-w-sm text-sbb-metal dark:text-sbb-storm">
            {amZug} tippt auf «Bereit», wenn niemand sonst mehr auf den Bildschirm schaut. Jeder sieht nur seine eigenen Karten.
          </p>
          <button type="button" onClick={() => tun({ typ: 'bereit' })}
                  className="mt-6 min-h-12 rounded-lg bg-sbb-red px-10 font-bold text-white hover:bg-sbb-red125">
            Bereit
          </button>
        </div>
      )}
      {x.phase === 'frage' && (
        <Frage key={`${x.frage}-${x.amZug}`} pool={pool} x={x} r={r} spur={spur} ziel={ziel} amZug={amZug} tun={tun} />
      )}
      {x.phase === 'zugEnde' && (
        <ZugEnde pool={pool} x={x} r={r} spur={spur} ziel={ziel} amZug={amZug} weiter={() => tun({ typ: 'weitergeben' })} />
      )}
      {x.phase === 'aufloesung' && (
        <Aufloesung x={x} r={r} ziel={ziel} index={index} weiter={() => tun({ typ: 'weiter' })} />
      )}
      {x.phase === 'ende' && <Ende pool={pool} x={x} bisher={bisher} nochmals={nochmals} schliessen={schliessen} />}
    </div>
  )
}

/** Eine Hinweiskarte: verdeckt mit Kategorie und Fragezeichen, offen mit dem Wert */
function Karte({ titel, wert, zustand, neu, kosten, onClick }: {
  titel: string; wert: string; zustand: 'verdeckt' | 'offen' | 'vorgegeben'; neu?: boolean; kosten?: number; onClick?: () => void
}) {
  if (zustand === 'verdeckt') {
    return (
      <button type="button" onClick={onClick} disabled={!onClick}
              className="kachel kachel-link flex min-h-24 flex-col justify-between p-3 text-left disabled:cursor-default md:min-h-28">
        <span className="text-xs font-medium uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">{titel}</span>
        <span className="flex items-end justify-between gap-2">
          <span className="text-3xl font-bold leading-none" aria-hidden="true">?</span>
          {kosten !== undefined && <span className="text-xs font-medium text-sbb-red">−{kosten} Punkte</span>}
        </span>
        <span className="sr-only">verdeckt, aufdecken</span>
      </button>
    )
  }
  return (
    <div className={`flex min-h-24 flex-col justify-between rounded-lg border p-3 md:min-h-28 ${neu
      ? 'border-sbb-red bg-white dark:bg-sbb-midnight' : 'border-sbb-cloud bg-white dark:border-sbb-iron dark:bg-sbb-midnight'}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">{titel}</span>
      <span className="mt-1 font-bold leading-snug break-words">{wert}</span>
      {zustand === 'vorgegeben' && <span className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">offen, kostet nichts</span>}
    </div>
  )
}

function Karten({ pool, x, r, spur, ziel, aufdecken }: {
  pool: Pool; x: Partie; r: Runde; spur: Spur; ziel: ErratenBahnhof; aufdecken?: (h: HinweisId) => void
}) {
  const vor = vorgegeben(ziel, x.e.gebiet)
  const zu = verdeckt(x, r, spur, pool)
  const neu = x.letzter?.hinweis ?? null
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      {HINWEISE.map((h) => (
        <Karte key={h.id} titel={h.titel} wert={hinweisText(ziel, h.id)}
               zustand={vor.includes(h.id) ? 'vorgegeben' : zu.includes(h.id) ? 'verdeckt' : 'offen'}
               neu={h.id === neu && x.phase !== 'aufloesung'} kosten={KOSTEN[h.id]}
               onClick={aufdecken ? () => aufdecken(h.id) : undefined} />
      ))}
    </div>
  )
}

function Frage({ pool, x, r, spur, ziel, amZug, tun }: {
  pool: Pool; x: Partie; r: Runde; spur: Spur; ziel: ErratenBahnhof; amZug: string; tun: (a: Aktion) => void
}) {
  const noch = moeglich(spur.offen)
  const [text, setText] = useState('')
  const [gewaehlt, setGewaehlt] = useState<ErratenBahnhof | null>(null)
  const vorschlaege = useMemo(() => (gewaehlt ? [] : suchen(pool, text, spur.falsch)), [pool, text, spur.falsch, gewaehlt])
  const meldung = x.letzter?.art === 'falsch' && x.letzter.bahnhof !== null
    ? `${pool.nach.get(x.letzter.bahnhof)?.name ?? 'Das'} ist es nicht.${x.letzter.hinweis ? ` Aufgedeckt: ${HINWEISE.find((h) => h.id === x.letzter!.hinweis)?.titel}.` : ''}`
    : null
  const raten = (id: number) => { tun({ typ: 'raten', bahnhof: id }); setText(''); setGewaehlt(null) }

  const status = (
    <div>
      {x.e.modus !== 'allein' && (
        <p className="mb-2 rounded-lg bg-sbb-anthracite px-3 py-2 font-bold text-white" role="status">{amZug} ist am Zug</p>
      )}
      <p className="text-sm text-sbb-metal dark:text-sbb-storm">
        Welcher Bahnhof ist es?{x.e.modus === 'miteinander' ? ' Eine Karte aufdecken oder raten, dann ist der Nächste dran.' : ''}
        {x.e.modus === 'gegeneinander' ? ' Ein Zug: eine Karte aufdecken oder raten.' : ''}
      </p>
      <p className="mt-1 text-lg">
        Noch erreichbar: <span className="text-2xl font-bold tabular-nums">{noch}</span> Punkte
      </p>
      <p className="text-xs text-sbb-metal dark:text-sbb-storm">
        {STUFE_NAME[ziel.s]} · jede Karte −{PUNKTE_JE_HINWEIS}, der Bezirk −{KOSTEN.bezirk} · ein falscher Tipp deckt die nächste auf
      </p>
      {meldung && <p className="mt-2 border-l-2 border-sbb-red pl-3 text-sm" role="status">{meldung}</p>}
    </div>
  )

  const antwort = x.e.antwort === 'auswahl' && r.optionen ? (
    <div className="grid grid-cols-2 gap-2">
      {r.optionen.map((id) => {
        const b = pool.nach.get(id)!
        const falsch = spur.falsch.includes(id)
        return (
          <button key={id} type="button" disabled={falsch} onClick={() => raten(id)}
                  className={`min-h-12 rounded-lg border px-3 py-2 text-left font-medium ${falsch
                    ? 'border-sbb-cloud text-sbb-metal line-through dark:border-sbb-iron'
                    : 'border-sbb-cloud bg-white hover:bg-sbb-milk dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:bg-sbb-charcoal'}`}>
            {b.name}
          </button>
        )
      })}
    </div>
  ) : (
    <div>
      <label className="block text-sm text-sbb-metal dark:text-sbb-storm" htmlFor="erraten-suche">Bahnhof suchen</label>
      {gewaehlt ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-sbb-cloud bg-white px-3 py-2.5 dark:border-sbb-iron dark:bg-sbb-midnight">
          <span className="font-bold">{gewaehlt.name}</span>
          <button type="button" onClick={() => setGewaehlt(null)} className="text-sm underline underline-offset-2">Ändern</button>
        </div>
      ) : (
        <input id="erraten-suche" value={text} onChange={(ev) => setText(ev.target.value)} autoComplete="off" spellCheck={false}
               placeholder="Name eingeben …"
               className="mt-1.5 w-full rounded-lg border border-sbb-cloud bg-white px-3 py-2.5 dark:border-sbb-iron dark:bg-sbb-midnight" />
      )}
      {vorschlaege.length > 0 && (
        <ul className="kachelliste mt-2" aria-label="Vorschläge">
          {vorschlaege.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => setGewaehlt(b)} className="block w-full px-3 py-2 text-left">{b.name}</button>
            </li>
          ))}
        </ul>
      )}
      {text && !gewaehlt && vorschlaege.length === 0 && (
        <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">Kein spielbarer Bahnhof mit diesem Namen.</p>
      )}
      <button type="button" disabled={!gewaehlt} onClick={() => gewaehlt && raten(gewaehlt.id)}
              className="mt-3 min-h-12 w-full rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
        {gewaehlt ? `Tipp abgeben: ${gewaehlt.name}` : 'Bahnhof wählen, dann Tipp abgeben'}
      </button>
    </div>
  )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-4 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-6">
        <div className="md:order-2">{status}</div>
        <div className="md:order-1 md:row-span-2">
          <Karten pool={pool} x={x} r={r} spur={spur} ziel={ziel} aufdecken={(h) => tun({ typ: 'aufdecken', hinweis: h })} />
        </div>
        <div className="md:order-3">
          {antwort}
          {spur.falsch.length > 0 && x.e.antwort === 'frei' && (
            <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
              Nicht: {spur.falsch.map((id) => pool.nach.get(id)?.name).join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Gegeneinander: was der Zug gebracht hat, nur für den, der ihn gemacht hat */
function ZugEnde({ pool, x, r, spur, ziel, amZug, weiter }: {
  pool: Pool; x: Partie; r: Runde; spur: Spur; ziel: ErratenBahnhof; amZug: string; weiter: () => void
}) {
  const l = x.letzter
  const titel = (h: HinweisId | null) => HINWEISE.find((k) => k.id === h)?.titel
  const text = !l ? '' : l.art === 'zeit' ? 'Die Zeit für diesen Zug ist abgelaufen.'
    : l.art === 'aufgedeckt' ? `Aufgedeckt: ${titel(l.hinweis)}.`
      : `${pool.nach.get(l.bahnhof!)?.name} ist es nicht. ${l.hinweis ? `Aufgedeckt: ${titel(l.hinweis)}.` : 'Alle Karten sind offen; du bist in dieser Runde draussen.'}`
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <p className="text-sm text-sbb-metal dark:text-sbb-storm">{amZug}, dein Zug ist vorbei</p>
        <p className="mt-1 text-lg font-bold" role="status">{text}</p>
        <div className="mt-4">
          <Karten pool={pool} x={x} r={r} spur={spur} ziel={ziel} />
        </div>
        <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
          Merk dir deine Karten; die anderen sehen sie nicht. Noch erreichbar: {moeglich(spur.offen)} Punkte.
        </p>
        <button type="button" onClick={weiter}
                className="mt-4 min-h-12 w-full rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 md:w-auto md:px-10">
          Verdecken und weitergeben
        </button>
      </div>
    </div>
  )
}

function Aufloesung({ x, r, ziel, index, weiter }: {
  x: Partie; r: Runde; ziel: ErratenBahnhof; index: IndexEintrag[]; weiter: () => void
}) {
  const gegen = x.e.modus === 'gegeneinander'
  const letzte = x.frage + 1 === x.runden.length
  const spur0 = r.spuren[0]
  const ix = index.find((b) => b.uic === ziel.id)
  const hinweise = (s: Spur) => s.offen.length
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">Gesucht war · {STUFE_NAME[ziel.s]}</p>
          <p className="text-3xl font-bold leading-tight">{ziel.name}</p>
          {/* richtig grün, nicht erkannt rot, in den Farben des Duells (Michael, 2026-10-04) */}
          <div className={`mt-3 rounded-lg border-2 p-3 ${r.sieger !== null
            ? 'border-sbb-green bg-sbb-green-bg dark:bg-sbb-green/15' : 'border-sbb-red bg-sbb-red/5 dark:bg-sbb-red/15'}`}>
            {!gegen ? (
              r.sieger !== null ? (
                <>
                  <p className="text-lg font-bold text-sbb-green dark:text-fahrt-sehenswert-hell">{x.e.modus === 'miteinander' ? 'Gemeinsam erkannt!' : 'Richtig!'}</p>
                  <p className="mt-1 tabular-nums">
                    Mit {hinweise(spur0)} {hinweise(spur0) === 1 ? 'Hinweis' : 'Hinweisen'}
                    {spur0.falsch.length ? ` und ${spur0.falsch.length} falschen ${spur0.falsch.length === 1 ? 'Tipp' : 'Tipps'}` : ''} · <span className="font-bold">{r.punkte} Punkte</span>
                  </p>
                </>
              ) : (
                <p className="text-lg font-bold"><span className="text-sbb-red">{r.zeitAus ? 'Zeit abgelaufen' : 'Nicht erkannt'}</span> · 0 Punkte</p>
              )
            ) : (
              <p className="text-lg font-bold">
                {r.sieger !== null
                  ? `${x.spieler[r.sieger]} gewinnt die Runde mit ${hinweise(r.spuren[r.sieger])} ${hinweise(r.spuren[r.sieger]) === 1 ? 'Hinweis' : 'Hinweisen'} · ${r.punkte} Punkte`
                  : 'Niemand hat ihn erkannt · 0 Punkte'}
              </p>
            )}
          </div>
          {gegen && (
            <table className="mt-3 w-full text-left text-sm tabular-nums">
              <thead className="text-sbb-metal dark:text-sbb-storm">
                <tr><th className="py-1 font-medium">Spieler</th><th className="py-1 font-medium">Karten offen</th><th className="py-1 text-right font-medium">Falsche Tipps</th></tr>
              </thead>
              <tbody>
                {x.spieler.map((s, i) => (
                  <tr key={i} className="border-t border-sbb-cloud dark:border-sbb-iron">
                    <td className="py-1.5 pr-2">{s}{r.sieger === i ? ' ✓' : ''}</td>
                    <td className="py-1.5 pr-2">{r.spuren[i].offen.length}</td>
                    <td className="py-1.5 text-right">{r.spuren[i].falsch.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {gegen && (
            <div className="mt-4">
              <p className="text-sm font-bold">Gesamtstand</p>
              <ol className="mt-1 text-sm tabular-nums">
                {raenge(stand(x)).map((s) => (
                  <li key={s.name} className="flex justify-between border-t border-sbb-cloud py-1 dark:border-sbb-iron">
                    <span>{s.rang}. {s.name}</span><span className="font-bold">{s.punkte}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-bold">Steckbrief</p>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            {HINWEISE.map((h) => (
              <div key={h.id} className="contents">
                <dt className="text-sbb-metal dark:text-sbb-storm">{h.titel}</dt>
                <dd>{hinweisText(ziel, h.id)}</dd>
              </div>
            ))}
            {ix?.perron_laengste_m ? (
              <div className="contents">
                <dt className="text-sbb-metal dark:text-sbb-storm">Längstes Perron</dt>
                <dd>{genau(ix.perron_laengste_m)} m (erfasst)</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-2 text-xs text-sbb-metal dark:text-sbb-storm">Ein- und Aussteigende laut SBB; alles aus den Daten der Bahnhofseite.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a href={`#/bahnhof/${ziel.id}`}
               className="flex min-h-12 items-center justify-center rounded-lg border border-sbb-cloud px-4 font-medium dark:border-sbb-iron">
              Bahnhof ansehen
            </a>
            <button type="button" onClick={weiter}
                    className="min-h-12 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125">
              {letzte ? 'Zum Ergebnis' : 'Nächster Bahnhof'}
            </button>
          </div>
          <p className="mt-2 text-xs text-sbb-metal dark:text-sbb-storm">Die Partie wartet hier, bis du zurückkommst.</p>
        </div>
      </div>
    </div>
  )
}

function Ende({ pool, x, bisher, nochmals, schliessen }: {
  pool: Pool; x: Partie; bisher: number | null | undefined; nochmals: () => void; schliessen: () => void
}) {
  const gegen = x.e.modus === 'gegeneinander'
  const st = stand(x)
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-lg">
        <h2 className="text-2xl font-bold tracking-tight">Ergebnis</h2>
        {!gegen ? (
          <div className="kachel mt-4 p-4">
            <p className="text-4xl font-bold tabular-nums">{st[0].punkte} <span className="text-lg font-medium">Punkte</span></p>
            <p className="mt-1 text-sbb-metal dark:text-sbb-storm">
              {st[0].siege} von {x.runden.length} Bahnhöfen erkannt{x.e.modus === 'miteinander' ? ' als Team' : ''} · höchstens {PUNKTE_HOECHST * x.runden.length} möglich
            </p>
            {bisher !== undefined && (
              <p className="mt-2 font-medium">
                {bisher === null ? 'Erste Partie mit diesen Einstellungen.' : st[0].punkte > bisher ? `Neuer Bestwert! Bisher ${bisher} Punkte.` : `Bestwert: ${bisher} Punkte.`}
              </p>
            )}
          </div>
        ) : (
          <ol className="kachelliste mt-4">
            {raenge(st).map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-bold">{s.rang}. {s.name}</span>
                  <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{s.siege} {s.siege === 1 ? 'Runde' : 'Runden'} gewonnen</span>
                </span>
                <span className="shrink-0 text-xl font-bold tabular-nums">{s.punkte}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-6 text-sm font-bold">Rückblick</p>
        <ol className="mt-1 text-sm">
          {x.runden.map((r, i) => {
            const b = pool.nach.get(r.ziel)!
            const s = r.spuren[gegen && r.sieger !== null ? r.sieger : 0]
            return (
              <li key={i} className="flex items-baseline justify-between gap-3 border-t border-sbb-cloud py-1.5 dark:border-sbb-iron">
                <a href={`#/bahnhof/${b.id}`} className="min-w-0 underline-offset-2 hover:underline">{b.name}</a>
                <span className="shrink-0 text-sbb-metal tabular-nums dark:text-sbb-storm">
                  {r.sieger === null ? (r.zeitAus ? 'Zeit abgelaufen' : 'nicht erkannt')
                    : `${gegen ? `${x.spieler[r.sieger]}, ` : ''}${s.offen.length} ${s.offen.length === 1 ? 'Hinweis' : 'Hinweise'} · ${r.punkte}`}
                </span>
              </li>
            )
          })}
        </ol>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={nochmals} className="min-h-12 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125">
            Nochmals
          </button>
          <button type="button" onClick={() => { schliessen(); window.location.hash = '#/spiele' }}
                  className="min-h-12 rounded-lg border border-sbb-cloud px-4 font-medium dark:border-sbb-iron">
            Zurück zu Spiele
          </button>
        </div>
        <button type="button" onClick={schliessen} className="mt-3 text-sm underline underline-offset-2">Einstellungen ändern</button>
      </div>
    </div>
  )
}
