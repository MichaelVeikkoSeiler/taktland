import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  datum, type ErlebtArt, type ErlebteFahrt, fahrtEintragen, fahrtLoeschen, heftLesen, logbuchLoeschen,
  notizSetzen,
} from '../erlebt'
import { standortLaden } from '../daten'
import type { BahnhofIndex, StandortDaten } from '../typen'
import { type Box, KartenPlatz, lage, Netzkarte, useKarte } from './Netzkarte'
import { BahnhofFeld } from './Strecke'

const ART_TEXT: Record<ErlebtArt, [string, string]> = {
  tunnel: ['Tunnel', 'Tunnel'], bruecke: ['Brücke', 'Brücken'], bahnhof: ['Bahnhof', 'Bahnhöfe'],
}

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
        Jede Fahrt im Fahrtmodus steht automatisch hier, mit Datum, Weg und allem, was du
        durchfahren hast. Du kannst eine Notiz dazuschreiben und Fahrten ohne Fahrtmodus von Hand
        eintragen. Es bleibt auf diesem Gerät; die Probefahrt kommt nicht hinein.
      </p>

      {neu ? (
        <NeueFahrt index={index} fertig={() => { setNeu(false); neuLesen() }} />
      ) : (
        <button type="button" onClick={() => setNeu(true)}
                className="mt-5 border border-sbb-cloud bg-white px-4 py-3 font-medium hover:border-sbb-black
                           dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white">
          + Fahrt von Hand eintragen
        </button>
      )}

      {fahrten.length === 0 ? (
        <p className="mt-6 text-sbb-metal dark:text-sbb-storm">
          Noch keine Fahrt im Logbuch. Starte den Fahrtmodus mit dem roten Knopf oben.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {fahrten.map((f) => <Eintrag key={f.beginn} f={f} index={index} geaendert={neuLesen} />)}
        </ul>
      )}

      {fahrten.length > 0 && (
        <div className="mt-10 border-t border-sbb-cloud pt-4 dark:border-sbb-iron">
          <button type="button" onClick={allesLoeschen}
                  className="border border-sbb-cloud px-4 py-2 text-sm font-medium hover:border-sbb-red
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

/** «2 Tunnel · 12 Brücken · 2 Bahnhöfe» */
function zaehlung(f: ErlebteFahrt) {
  return (['tunnel', 'bruecke', 'bahnhof'] as const).map((a) => {
    const n = f.objekte.filter((o) => o.art === a).length
    return `${n} ${n === 1 ? ART_TEXT[a][0] : ART_TEXT[a][1]}`
  }).join(' · ')
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
          <p className="text-sm">
            {f.manuell ? 'Von Hand eingetragen, ohne Fahrtmodus: keine Objekte erfasst' : zaehlung(f)}
          </p>

          {bearbeiten ? (
            <div className="mt-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus
                        placeholder="Deine Notiz zu dieser Fahrt"
                        className="w-full border border-sbb-cloud bg-white px-3 py-2 text-sbb-black
                                   dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white" />
              <div className="mt-1 flex gap-3">
                <button type="button" onClick={speichern}
                        className="bg-sbb-charcoal px-3 py-1.5 text-sm font-medium text-white dark:bg-sbb-white dark:text-sbb-black">
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
              <FahrtKarte f={f} index={index} />
              <details className="mt-3 text-sm">
                <summary className={`cursor-pointer ${knopf}`}>Liste zeigen</summary>
                <ol className="mt-2 space-y-0.5">
                  {f.objekte.map((o) => (
                    <li key={`${o.art}${o.kennung}`}>
                      {o.name} <span className="text-sbb-metal dark:text-sbb-storm">· {ART_TEXT[o.art][0]}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}

          <button type="button" onClick={loeschen}
                  className="mt-4 border border-sbb-cloud px-3 py-1.5 text-sm font-medium hover:border-sbb-red
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
 * ihrer Quelle. Den Weg selbst speichert das Logbuch nicht; die Karte zeigt,
 * was durchfahren wurde.
 */
function FahrtKarte({ f, index }: { f: ErlebteFahrt; index: BahnhofIndex | null }) {
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
    const punkte = f.objekte.flatMap((o): Punkt[] => {
      if (o.art === 'bahnhof') {
        const b = bahnhof.get(o.kennung)
        if (!b || b.lat === null || b.lon === null) return []
        const [x, y] = lage(b.lat, b.lon)
        return [{ o, x, y, uic: b.uic }]
      }
      const xy = lagen.get(`${o.art} ${o.kennung}`)
      return xy ? [{ o, x: xy[0], y: xy[1], uic: undefined }] : []
    })
    if (!punkte.length) return null
    const xs = punkte.map((p) => p.x), ys = punkte.map((p) => p.y)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const box: Box = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
                       w: Math.max((x1 - x0) * 1.3, (y1 - y0) * 1.3 * 1.6, 0.03) }
    const hervor = new Set(f.objekte.filter((o) => o.art !== 'bahnhof').map((o) => Number(o.kennung.split(':')[0])))
    return { punkte, box, hervor }
  }, [standort, index, f])

  if (!karte || !linien || !inhalt) return <KartenPlatz />
  return (
    <Netzkarte
      daten={karte} linien={linien} start={inhalt.box} hervor={inhalt.hervor}
      punkte={inhalt.punkte.filter((p) => p.o.art === 'bahnhof').map((p) => ({ name: p.o.name, x: p.x, y: p.y, uic: p.uic }))}
      bahnhofOeffnen={(uic) => { window.location.hash = `#/bahnhof/${uic}` }}
      zeichnen={(px) => inhalt.punkte.filter((p) => p.o.art !== 'bahnhof').map((p) => (
        <circle key={`${p.o.art}${p.o.kennung}`} cx={p.x} cy={p.y}
                r={(p.o.art === 'tunnel' ? 3.5 : 1.8) * px} className="fill-sbb-red" />
      ))}
      titel={`Karte der Fahrt ${f.von} nach ${f.nach}`}
      beschriftung={(
        <>
          Rot: durchfahrene Tunnel (grosse Punkte) und Brücken (kleine), Ringe: Bahnhöfe, jeweils
          dort, wo ihre Quelle die Lage angibt. Dunkel die Linien, auf denen sie liegen.
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
