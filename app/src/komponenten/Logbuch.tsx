import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  datum, type ErlebtArt, type ErlebteFahrt, fahrtEintragen, fahrtLoeschen, heftLesen, logbuchLoeschen,
  notizSetzen, wegPunkte,
} from '../erlebt'
import { standortLaden } from '../daten'
import { sicherungEinlesen, sicherungHerunterladen, sicherungPruefen } from '../sicherung'
import type { BahnhofIndex, StandortDaten } from '../typen'
import { type Box, KartenPlatz, lage, Netzkarte, pfad, useKarte } from './Netzkarte'
import { BahnhofFeld } from './Strecke'
import { Pikto } from './Pikto'

const ART_TEXT: Record<ErlebtArt, [string, string]> = {
  tunnel: ['Tunnel', 'Tunnel'], bruecke: ['Brücke', 'Brücken'], bahnhof: ['Bahnhof', 'Bahnhöfe'],
}

/** «etwa 42 km», unter 10 km mit einer Stelle; gemessen auf der gezeichneten Strecke, darum «etwa» */
const km = (m: number) => `etwa ${(m / 1000).toLocaleString('de-CH', { maximumFractionDigits: m < 10_000 ? 1 : 0 })} km`

const uhrzeit = (ms: number) => new Date(ms).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })

/** Heute als «2026-09-25» für das Datumsfeld, in Ortszeit */
function heute() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Das Logbuch: jede Fahrt im Fahrtmodus kommt beim Start automatisch hinein,
 * mit Datum, Weg und den durchfahrenen Objekten. Dazu eigene Notizen und
 * Fahrten ohne Fahrtmodus, von Hand eingetragen (Michael, 2026-09-25, nach der
 * Fahrt Melide–Lugano). Alles bleibt auf diesem Gerät.
 */
export function Logbuch({ index }: { index: BahnhofIndex | null }) {
  const [fahrten, setFahrten] = useState(() => heftLesen().fahrten)
  const [neu, setNeu] = useState(false)
  const neuLesen = () => setFahrten(heftLesen().fahrten)

  function allesLoeschen() {
    if (!window.confirm('Das ganze Logbuch auf diesem Gerät löschen? Das Sammelheft bleibt. Das lässt sich nicht rückgängig machen.')) return
    logbuchLoeschen()
    neuLesen()
  }

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Logbuch</h1>
      <p className="mt-2 leading-relaxed">
        Jede Fahrt mit «Fahren» steht automatisch hier, mit Datum, Weg, Kilometern und allem,
        was du durchfahren hast. Du kannst eine Notiz dazuschreiben und Fahrten ohne «Fahren» von Hand
        eintragen. Es bleibt auf diesem Gerät; die Probefahrt kommt nicht hinein.
      </p>

      {neu ? (
        <NeueFahrt index={index} fertig={() => { setNeu(false); neuLesen() }} />
      ) : (
        <button type="button" onClick={() => setNeu(true)}
                className="rounded-lg mt-5 border border-sbb-cloud bg-white px-4 py-3 font-medium hover:border-sbb-black
                           dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white">
          + Fahrt von Hand eintragen
        </button>
      )}

      {fahrten.length > 0 && <Uebersicht fahrten={fahrten} index={index} />}

      {fahrten.length === 0 ? (
        <p className="mt-6 text-sbb-metal dark:text-sbb-storm">
          Noch keine Fahrt im Logbuch. Starte «Fahren» mit dem roten Knopf oben.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {fahrten.map((f) => <Eintrag key={f.beginn} f={f} index={index} geaendert={neuLesen} />)}
        </ul>
      )}

      <Sicherung />

      {fahrten.length > 0 && (
        <div className="mt-10 border-t border-sbb-cloud pt-4 dark:border-sbb-iron">
          <button type="button" onClick={allesLoeschen}
                  className="rounded-lg border border-sbb-cloud px-4 py-2 text-sm font-medium hover:border-sbb-red
                             hover:text-sbb-red dark:border-sbb-iron">
            Logbuch löschen
          </button>
          <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
            Löscht alle Fahrten und Notizen auf diesem Gerät. Das Sammelheft bleibt.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Gesamtübersicht über alle Fahrten im Logbuch (Michael, 2026-09-28): wie viele
 * Fahrten seit wann, was dabei durchfahren wurde, jedes Objekt nur einmal, die
 * Strecken, die mehrmals vorkommen, und eine Karte aller Fahrten zusammen.
 * Gezählt wird nur, was im Logbuch steht; Kilometer erst seit 2026-09-28.
 */
function Uebersicht({ fahrten, index }: { fahrten: ErlebteFahrt[]; index: BahnhofIndex | null }) {
  const [karte, setKarte] = useState(false)
  const { alle, strecken, erste, letzte, vonHand, weg, ohneWeg } = useMemo(() => {
    const gesehen = new Set<string>()
    const alle: ErlebteFahrt['objekte'] = []
    // älteste Fahrt zuerst, damit die Reihenfolge der Fahrten erhalten bleibt
    const zeitlich = [...fahrten].sort((a, b) => a.beginn - b.beginn)
    for (const f of zeitlich) {
      for (const o of f.objekte) {
        const k = `${o.art} ${o.kennung}`
        if (!gesehen.has(k)) { gesehen.add(k); alle.push(o) }
      }
    }
    const zaehler = new Map<string, number>()
    for (const f of fahrten) zaehler.set(`${f.von} → ${f.nach}`, (zaehler.get(`${f.von} → ${f.nach}`) ?? 0) + 1)
    const strecken = [...zaehler].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    return { alle, strecken, erste: zeitlich[0].beginn, letzte: zeitlich[zeitlich.length - 1].beginn,
             vonHand: fahrten.filter((f) => f.manuell).length,
             weg: fahrten.reduce((a, f) => a + (f.weg_m ?? 0), 0),
             ohneWeg: fahrten.filter((f) => f.weg_m === undefined).length }
  }, [fahrten])
  const n = fahrten.length
  const knopf = 'text-sm text-sbb-metal underline underline-offset-2 dark:text-sbb-storm'

  return (
    <section className="kachel mt-6 px-4 py-4" aria-labelledby="uebersicht">
      <h2 id="uebersicht" className="text-lg font-bold">Übersicht</h2>
      <p className="mt-1">
        {n} {n === 1 ? 'Fahrt' : 'Fahrten'}
        {n === 1 ? ` am ${datum(erste)}` : `, die erste am ${datum(erste)}, die letzte am ${datum(letzte)}`}
        {vonHand > 0 && `; ${vonHand} davon von Hand eingetragen, ohne erfasste Objekte`}
      </p>
      {ohneWeg < n && (
        <p className="mt-1">
          Mit «Fahren» zusammen {km(weg)}, gemessen auf der gezeichneten Strecke
          {ohneWeg > 0 && `; ${ohneWeg} ${ohneWeg === 1 ? 'Fahrt' : 'Fahrten'} ohne Kilometer (von Hand eingetragen oder vor dem 28.9.2026)`}
        </p>
      )}
      <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">Durchfahren, jedes nur einmal gezählt</p>
      <div className="mt-1 text-sm"><Zaehlung objekte={alle} /></div>
      {strecken.length > 0 && (
        <>
          <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">Mehrmals gefahren</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {strecken.map(([s, k]) => <li key={s}>{s} <span className="text-sbb-metal dark:text-sbb-storm">· {k}×</span></li>)}
          </ul>
        </>
      )}
      {alle.length > 0 && (karte
        ? <FahrtKarte objekte={alle} wege={fahrten.flatMap((f) => f.wege ?? [])} index={index} titel="Karte aller Fahrten im Logbuch" />
        : (
          <button type="button" onClick={() => setKarte(true)} className={`mt-3 ${knopf}`}>
            Karte aller Fahrten zeigen
          </button>
        ))}
    </section>
  )
}

/** «2 Tunnel · 12 Brücken · 2 Bahnhöfe», je mit Pikto (Michael, 2026-09-27) */
function Zaehlung({ objekte }: { objekte: ErlebteFahrt['objekte'] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {(['tunnel', 'bruecke', 'bahnhof'] as const).map((a) => {
        const n = objekte.filter((o) => o.art === a).length
        return (
          <span key={a} className="flex items-center gap-1.5">
            <Pikto art={a} className="size-5" />
            {n} {n === 1 ? ART_TEXT[a][0] : ART_TEXT[a][1]}
          </span>
        )
      })}
    </span>
  )
}

/**
 * Eine Fahrt als kompakte Zeile; ein Tipp klappt die Details auf: Notiz,
 * Liste, Karte und Löschen (Michael, 2026-09-25: «Liste kompakter gestalten»).
 */
function Eintrag({ f, index, geaendert }: { f: ErlebteFahrt; index: BahnhofIndex | null; geaendert: () => void }) {
  const [offen, setOffen] = useState(false)
  const [bearbeiten, setBearbeiten] = useState(false)
  const [text, setText] = useState(f.notiz ?? '')

  function speichern() {
    notizSetzen(f.beginn, text)
    setBearbeiten(false)
    geaendert()
  }

  function loeschen() {
    if (!window.confirm(`Die Fahrt ${f.von} → ${f.nach} vom ${datum(f.beginn)} aus dem Logbuch löschen?`)) return
    fahrtLoeschen(f.beginn)
    geaendert()
  }

  const knopf = 'text-sm text-sbb-metal underline underline-offset-2 dark:text-sbb-storm'
  return (
    <li className="kachel overflow-hidden">
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left
                         hover:bg-sbb-silver dark:hover:bg-sbb-iron/60">
        <span className="min-w-0">
          <span className="block truncate font-bold">{f.von} → {f.nach}</span>
          <span className="block truncate text-sm text-sbb-metal dark:text-sbb-storm">
            {datum(f.beginn)}{f.manuell ? ' · von Hand eingetragen' : `, ${uhrzeit(f.beginn)}`}
            {f.weg_m !== undefined ? ` · ${km(f.weg_m)}` : ''}
            {f.notiz ? ' · mit Notiz' : ''}
          </span>
        </span>
        <svg viewBox="0 0 12 12" className={`size-3 shrink-0 transition-transform ${offen ? 'rotate-180' : ''}`}
             aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>

      {offen && (
        <div className="border-t border-sbb-cloud px-4 pb-4 pt-3 dark:border-sbb-iron">
          <div className="text-sm">
            {f.manuell ? 'Von Hand eingetragen, ohne «Fahren»: keine Objekte erfasst' : <Zaehlung objekte={f.objekte} />}
          </div>

          {bearbeiten ? (
            <div className="mt-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus
                        placeholder="Deine Notiz zu dieser Fahrt"
                        className="w-full border border-sbb-cloud bg-white px-3 py-2 text-sbb-black
                                   dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white" />
              <div className="mt-1 flex gap-3">
                <button type="button" onClick={speichern}
                        className="rounded-lg bg-sbb-anthracite px-3 py-1.5 text-sm font-medium text-white dark:bg-sbb-white dark:text-sbb-black">
                  Speichern
                </button>
                <button type="button" onClick={() => { setText(f.notiz ?? ''); setBearbeiten(false) }}
                        className="text-sm underline underline-offset-2">
                  Abbrechen
                </button>
              </div>
            </div>
          ) : f.notiz ? (
            <p className="mt-2 whitespace-pre-line border-l-2 border-sbb-red pl-3">
              {f.notiz}{' '}
              <button type="button" onClick={() => setBearbeiten(true)} className={knopf}>ändern</button>
            </p>
          ) : (
            <button type="button" onClick={() => setBearbeiten(true)} className={`mt-2 ${knopf}`}>
              Notiz dazuschreiben
            </button>
          )}

          {f.objekte.length > 0 && (
            <>
              <FahrtKarte objekte={f.objekte} wege={f.wege ?? []} index={index} titel={`Karte der Fahrt ${f.von} nach ${f.nach}`} />
              <details className="mt-3 text-sm">
                <summary className={`cursor-pointer ${knopf}`}>Liste zeigen</summary>
                <ol className="mt-2 space-y-1">
                  {f.objekte.map((o) => (
                    <li key={`${o.art}${o.kennung}`} className="flex items-center gap-2">
                      <Pikto art={o.art} className="size-4" />
                      <span>{o.name} <span className="text-sbb-metal dark:text-sbb-storm">· {ART_TEXT[o.art][0]}{o.laenge && ` · ${o.laenge}`}</span></span>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}

          <button type="button" onClick={loeschen}
                  className="rounded-lg mt-4 border border-sbb-cloud px-3 py-1.5 text-sm font-medium hover:border-sbb-red
                             hover:text-sbb-red dark:border-sbb-iron">
            Fahrt löschen
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * Karte einer Fahrt: dunkel die Linien der durchfahrenen Tunnel und Brücken,
 * rot die Tunnel und Brücken, Ringe die Bahnhöfe, jeweils an der Lage aus
 * ihrer Quelle. Schwarz der gefahrene Weg, seit 2026-09-30 gespeichert; ältere
 * Fahrten zeigen nur, was durchfahren wurde.
 */
function FahrtKarte({ objekte, wege, index, titel }: {
  objekte: ErlebteFahrt['objekte']; wege: NonNullable<ErlebteFahrt['wege']>; index: BahnhofIndex | null; titel: string
}) {
  const { daten: karte, linien } = useKarte()
  const [standort, setStandort] = useState<StandortDaten | null>(null)
  useEffect(() => {
    let ab = false
    standortLaden().then((d) => { if (!ab) setStandort(d) }).catch(() => {})
    return () => { ab = true }
  }, [])

  const inhalt = useMemo(() => {
    if (!standort || !index) return null
    const lagen = new Map<string, [number, number]>()
    for (const [art, liste] of [['tunnel', standort.tunnel], ['bruecke', standort.bruecken]] as const) {
      for (const [linie, stelle, , la, lo] of liste) {
        if (la !== null && lo !== null) lagen.set(`${art} ${linie}:${stelle}`, lage(la, lo))
      }
    }
    const bahnhof = new Map(index.bahnhoefe.map((b) => [String(b.uic), b]))
    type Punkt = { o: ErlebteFahrt['objekte'][number]; x: number; y: number; uic: number | undefined }
    const punkte = objekte.flatMap((o): Punkt[] => {
      if (o.art === 'bahnhof') {
        const b = bahnhof.get(o.kennung)
        if (!b || b.lat === null || b.lon === null) return []
        const [x, y] = lage(b.lat, b.lon)
        return [{ o, x, y, uic: b.uic }]
      }
      const xy = lagen.get(`${o.art} ${o.kennung}`)
      return xy ? [{ o, x: xy[0], y: xy[1], uic: undefined }] : []
    })
    const linienzuege = wege.map((w) => wegPunkte(w).map((p) => lage(p.lat, p.lon)))
    const alleXy = [...punkte.map((p) => [p.x, p.y] as [number, number]), ...linienzuege.flat()]
    if (!alleXy.length) return null
    const xs = alleXy.map((p) => p[0]), ys = alleXy.map((p) => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const box: Box = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
                       w: Math.max((x1 - x0) * 1.3, (y1 - y0) * 1.3 * 1.6, 0.03) }
    const hervor = new Set(objekte.filter((o) => o.art !== 'bahnhof').map((o) => Number(o.kennung.split(':')[0])))
    return { punkte, box, hervor, linienzuege }
  }, [standort, index, objekte, wege])

  if (!karte || !linien || !inhalt) return <KartenPlatz />
  return (
    <Netzkarte
      daten={karte} linien={linien} start={inhalt.box} hervor={inhalt.hervor}
      punkte={inhalt.punkte.filter((p) => p.o.art === 'bahnhof').map((p) => ({ name: p.o.name, x: p.x, y: p.y, uic: p.uic }))}
      bahnhofOeffnen={(uic) => { window.location.hash = `#/bahnhof/${uic}` }}
      zeichnen={(px) => (
        <>
          {inhalt.linienzuege.map((z, i) => (
            <path key={`w${i}`} d={pfad(z)} fill="none" strokeWidth={3.5} vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round" strokeLinecap="round" className="stroke-sbb-charcoal dark:stroke-sbb-white" />
          ))}
          {inhalt.punkte.filter((p) => p.o.art !== 'bahnhof').map((p) => (
            <circle key={`${p.o.art}${p.o.kennung}`} cx={p.x} cy={p.y}
                    r={(p.o.art === 'tunnel' ? 3.5 : 1.8) * px} className="fill-sbb-red" />
          ))}
        </>
      )}
      titel={titel}
      beschriftung={(
        <>
          Rot: durchfahrene Tunnel (grosse Punkte) und Brücken (kleine), Ringe: Bahnhöfe, jeweils
          dort, wo ihre Quelle die Lage angibt. Dunkel die Linien, auf denen sie liegen; schwarz der
          gefahrene Weg, gespeichert seit dem 30.9.2026.
        </>
      )}
    />
  )
}

function NeueFahrt({ index, fertig }: { index: BahnhofIndex | null; fertig: () => void }) {
  const [von, setVon] = useState<number | null>(null)
  const [nach, setNach] = useState<number | null>(null)
  const [tag, setTag] = useState(heute)
  const [notiz, setNotiz] = useState('')
  const bahnhof = useMemo(() => new Map((index?.bahnhoefe ?? []).map((b) => [b.uic, b])), [index])
  const name = useCallback((uic: number | null) => (uic ? bahnhof.get(uic)?.name ?? String(uic) : ''), [bahnhof])
  const bereit = von !== null && nach !== null && von !== nach && tag !== ''

  function speichern() {
    if (!bereit) return
    // Mittag des gewählten Tags: von Hand eingetragen gibt es keine Uhrzeit
    const [j, m, t] = tag.split('-').map(Number)
    fahrtEintragen(new Date(j, m - 1, t, 12).getTime(), name(von), name(nach), notiz)
    fertig()
  }

  return (
    <div className="mt-5 space-y-3 border border-sbb-cloud px-4 py-4 dark:border-sbb-iron">
      <p className="font-bold">Fahrt von Hand eintragen</p>
      <BahnhofFeld bezeichnung="Von" wert={von} bahnhoefe={index?.bahnhoefe ?? []} name={name} aendern={setVon} />
      <BahnhofFeld bezeichnung="Nach" wert={nach} bahnhoefe={index?.bahnhoefe ?? []} name={name} aendern={setNach} />
      <label className="block">
        <span className="block text-xs text-sbb-metal dark:text-sbb-storm">Datum</span>
        <input type="date" value={tag} max={heute()} onChange={(e) => setTag(e.target.value)}
               className="mt-1 w-full border border-sbb-cloud bg-white px-4 py-3 text-sbb-black
                          dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white" />
      </label>
      <label className="block">
        <span className="block text-xs text-sbb-metal dark:text-sbb-storm">Notiz (freiwillig)</span>
        <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={3}
                  className="mt-1 w-full border border-sbb-cloud bg-white px-3 py-2 text-sbb-black
                             dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white" />
      </label>
      <div className="flex gap-3">
        <button type="button" disabled={!bereit} onClick={speichern}
                className="rounded-lg bg-sbb-red px-4 py-2 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
          Eintragen
        </button>
        <button type="button" onClick={fertig} className="underline underline-offset-2">Abbrechen</button>
      </div>
    </div>
  )
}

/**
 * Sicherung als Datei: alles, was Taktland auf diesem Gerät weiss (Michael,
 * 2026-09-26). Einlesen ersetzt den Stand auf dem Gerät, darum mit Rückfrage.
 */
function Sicherung() {
  const [meldung, setMeldung] = useState<string | null>(null)
  const [fund, setFund] = useState<{ erstellt: string; daten: Record<string, string> } | null>(null)
  const knopf = `rounded-lg border border-sbb-cloud bg-white px-4 py-2 text-sm font-medium hover:border-sbb-black
                 dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white`

  async function gewaehlt(f: File | undefined) {
    setMeldung(null)
    setFund(null)
    if (!f) return
    try { setFund(await sicherungPruefen(f)) } catch (e) { setMeldung((e as Error).message) }
  }

  return (
    <section className="mt-10 border-t border-sbb-cloud pt-4 dark:border-sbb-iron" aria-labelledby="sicherung">
      <h2 id="sicherung" className="text-lg font-bold">Sicherung</h2>
      <p className="mt-1 text-sm leading-relaxed">
        Logbuch, Sammelheft, Favoriten, Probefahrten, Lernfortschritt und Einstellungen liegen nur im
        Speicher dieses Browsers. Safari löscht ihn bei Websites, die sieben Tage nicht geöffnet
        wurden; als App auf dem Home-Bildschirm nicht. Mit einer Sicherung als Datei geht nichts
        verloren, und du kannst alles auf ein anderes Gerät bringen. Die Datei bleibt bei dir.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={knopf}
                onClick={() => {
                  const n = sicherungHerunterladen()
                  setFund(null)
                  setMeldung(`Sicherung mit ${n} ${n === 1 ? 'Eintrag' : 'Einträgen'} heruntergeladen.`)
                }}>
          Sicherung herunterladen
        </button>
        <label className={`${knopf} cursor-pointer`}>
          Sicherung einlesen …
          <input type="file" accept="application/json,.json" className="sr-only"
                 onChange={(e) => { void gewaehlt(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {meldung && <p className="mt-2 text-sm" role="status">{meldung}</p>}
      {fund && (
        <div className="mt-3 border-l-2 border-sbb-red pl-3 text-sm">
          <p>
            Sicherung vom {datum(Date.parse(fund.erstellt))}, {uhrzeit(Date.parse(fund.erstellt))} Uhr. Sie ersetzt
            alles, was Taktland jetzt auf diesem Gerät weiss. Das lässt sich nicht rückgängig machen.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button"
                    onClick={() => { sicherungEinlesen(fund.daten); window.location.reload() }}
                    className="rounded-lg bg-sbb-red px-3 py-2 font-bold text-white hover:bg-sbb-red125">
              Ja, einlesen
            </button>
            <button type="button" onClick={() => setFund(null)}
                    className="border border-sbb-cloud px-3 py-2 dark:border-sbb-iron">
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
