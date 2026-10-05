import { useEffect, useMemo, useState } from 'react'
import type { BahnhofIndex } from '../typen'
import {
  type Aktion, type Einstellungen, erratenLaden, type Partie, partieAusRunden, type Pool, PUNKTE_HOECHST, rundenZiehen,
  schritt, STUFE_NAME,
} from '../erraten'
import { einstellungLesen, Frage, Steckbrief } from './Erraten'
import { Kopf } from './Schweiz11'
import { type Mitspieler, type RaumSpiel, type RaumStand, useRaumSeite, Warten } from './Raum'
import { genau } from './Objekte'
import { raenge } from '../schweiz11'
import { antwortTon } from '../audio'

/**
 * «Bahnhofsuche» auf mehreren Geräten (Michael, 2026-10-05, nach dem Muster von Geo): Der
 * Gastgeber zieht die Bahnhöfe und bei Auswahl die vier Antworten und schickt sie allen. Alle
 * suchen gleichzeitig denselben Bahnhof, jeder mit eigenen Karten auf dem eigenen Gerät, nach
 * denselben Regeln wie allein (erraten.ts). Gemeldet wird nur das Ergebnis je Bahnhof; die
 * Auflösung kommt, wenn alle fertig sind.
 */

interface Start { e: Einstellungen; runden: Array<{ ziel: number; optionen: number[] | null }>; spieler: Mitspieler[] }
/** was ein Gerät nach einem Bahnhof meldet */
interface Ergebnis { geloest: boolean; punkte: number; offen: number; falsch: number; zeitAus: boolean }
type Stand = RaumStand<Start, Ergebnis>

const SPIEL: RaumSpiel<Start> = {
  start: (d) => {
    const st = d as Start | null
    return st && st.e && Array.isArray(st.runden) && st.runden.length > 0 && Array.isArray(st.spieler) ? st : null
  },
  spieler: (s) => s.spieler,
  fragen: (s) => s.runden.length,
  max: 12,
}

/** Die eigene Partie übersteht ein Neuladen, solange es dieselbe Runde im selben Raum ist */
const EIGENE = 'taktland.erraten.online.v1'
function eigeneLesen(raum: string, partie: number, frage: number): Partie | null {
  try {
    const x = JSON.parse(sessionStorage.getItem(EIGENE) ?? 'null') as { raum: string; partie: number; x: Partie } | null
    return x && x.raum === raum && x.partie === partie && x.x?.frage === frage ? x.x : null
  } catch { return null }
}
function eigeneMerken(raum: string, partie: number, x: Partie) {
  try { sessionStorage.setItem(EIGENE, JSON.stringify({ raum, partie, x })) } catch { /* nur jetzt */ }
}

/** Die Seite #/erraten/mit/CODE: beitreten, Warteraum, Spiel */
export function ErratenOnline({ raum, index }: { raum: string; index: BahnhofIndex | null }) {
  const [pool, setPool] = useState<Pool | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  useEffect(() => { erratenLaden().then(setPool).catch((e: Error) => setLadefehler(e.message)) }, [])
  const r = useRaumSeite<Start, Ergebnis>({
    raum, spiel: SPIEL, titel: 'Bahnhofsuche auf mehreren Geräten', zurueck: { hash: '#/erraten', text: 'Bahnhofsuche' },
    spielName: 'Bahnhofsuche', adresseSpiel: 'erraten', laden: { fehler: ladefehler, fertig: !!pool && !!index },
    neuerStart: (dabei) => (pool ? neuerStart(pool, dabei) : null),
  })
  if (r.vorspiel) return r.vorspiel
  const start = r.stand.start!
  if (start.runden.some((x) => !pool!.nach.has(x.ziel) || x.optionen?.some((o) => !pool!.nach.has(o)))) {
    return r.rahmen(<p className="mt-6">Auf diesem Gerät fehlen Bahnhöfe dieses Spiels. Lade Taktland neu, damit alle Geräte dieselbe Version haben.</p>)
  }
  return (
    <OnlineSpiel key={r.stand.partie} raum={raum} pool={pool!} index={index!} stand={r.stand} ich={r.ich}
                 gastgeber={r.gastgeber} schicken={r.schicken} verlassen={r.verlassen} />
  )
}

/** Gastgeber: die Einstellungen der Bahnhofsuche, jeder spielt für sich */
function neuerStart(pool: Pool, dabei: Mitspieler[]): Start | null {
  const e: Einstellungen = { ...einstellungLesen().e, modus: 'allein' }
  const runden = rundenZiehen(pool, e)
  return runden ? { e, runden, spieler: dabei } : null
}

function OnlineSpiel({ raum, pool, index, stand, ich, gastgeber, schicken, verlassen }: {
  raum: string; pool: Pool; index: BahnhofIndex; stand: Stand; ich: string; gastgeber: boolean
  schicken: (typ: string, d?: unknown) => Promise<void>; verlassen: () => void
}) {
  const start = stand.start!
  const { e, spieler } = start
  const frage = stand.frage
  const meinName = spieler.find((m) => m.id === ich)?.name ?? 'Du'

  // die eigene Partie: dieselben Bahnhöfe wie alle, gespielt wie allein, je Bahnhof neu begonnen
  const [x, setXRoh] = useState<Partie>(() => eigeneLesen(raum, stand.partie, frage) ?? partieAusRunden(e, [meinName], start.runden, frage))
  const setX = (neu: Partie) => { eigeneMerken(raum, stand.partie, neu); setXRoh(neu) }
  useEffect(() => {
    if (x.frage !== frage) setX(eigeneLesen(raum, stand.partie, frage) ?? partieAusRunden(e, [meinName], start.runden, frage))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frage])
  const aktuell = x.frage === frage ? x : null
  const r = aktuell?.runden[frage]
  const tun = (a: Aktion) => {
    if (!aktuell) return
    const neu = schritt(aktuell, a, pool)
    if (neu === aktuell) return
    if (a.typ === 'raten') antwortTon(neu.runden[frage].sieger !== null ? 'richtig' : 'falsch')
    setX(neu)
  }

  const runde = stand.tipps[frage] ?? {}
  const aufgeloest = stand.aufgeloest.has(frage)
  const alle = spieler.every((m) => runde[m.id])
  // fertig: das Ergebnis melden, einmal je Bahnhof
  const [gemeldet, setGemeldet] = useState(-1)
  useEffect(() => {
    if (!r?.fertig || runde[ich] || gemeldet === frage || aufgeloest) return
    setGemeldet(frage)
    const s = r.spuren[0]
    const ergebnis: Ergebnis = { geloest: r.sieger !== null, punkte: r.punkte, offen: s.offen.length, falsch: s.falsch.length, zeitAus: r.zeitAus }
    void schicken('tipp', { frage, antwort: ergebnis })
  })

  // Zeit: die Frist steht in der eigenen Partie
  const [jetzt, setJetzt] = useState(() => Date.now())
  const laeuft = !!aktuell && aktuell.phase === 'frage' && !aufgeloest
  useEffect(() => {
    if (!laeuft || aktuell!.frist === null) return
    const t = setInterval(() => setJetzt(Date.now()), 250)
    return () => clearInterval(t)
  }, [laeuft, aktuell?.frist])
  const rest = laeuft && aktuell!.frist !== null ? Math.max(0, (aktuell!.frist - jetzt) / 1000) : null
  useEffect(() => {
    if (laeuft && aktuell!.frist !== null && Date.now() >= aktuell!.frist) tun({ typ: 'zeitAus' })
  })

  const phase = stand.ende ? 'ende' : alle || aufgeloest ? 'aufloesung' : laeuft ? 'frage' : 'warten'
  const ergebnisse = useMemo(() => stand.tipps.map((t) => spieler.map((m) => t?.[m.id] ?? null)), [stand.tipps, spieler])
  const gesamt = spieler.map((m, i) => ({
    name: m.name, ich: m.id === ich,
    punkte: ergebnisse.reduce((a, t) => a + (t[i]?.punkte ?? 0), 0),
    erkannt: ergebnisse.filter((t) => t[i]?.geloest).length,
  }))
  const gastName = spieler[0]?.name ?? 'der Gastgeber'
  const ziel = pool.nach.get(start.runden[frage].ziel)!

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white"
         role="dialog" aria-label="Bahnhofsuche auf mehreren Geräten">
      <Kopf titel="Bahnhofsuche" text={phase !== 'ende' && <> · Bahnhof {frage + 1} von {start.runden.length} · {meinName}</>}
            rest={phase === 'frage' ? rest : null} beendenText={gastgeber ? 'Beenden' : 'Verlassen'}
            beenden={() => {
              if (gastgeber) { if (window.confirm('Spiel für alle beenden?')) { void schicken('beenden'); verlassen() } }
              else if (window.confirm('Spiel verlassen? Die anderen spielen ohne dich weiter.')) verlassen()
            }} />
      {phase === 'frage' && aktuell && r && (
        <Frage key={frage} pool={pool} x={aktuell} r={r} spur={r.spuren[0]} ziel={ziel} amZug={meinName} tun={tun} />
      )}
      {phase === 'warten' && (
        <Warten titel="Fertig mit diesem Bahnhof" wartenAuf={spieler.filter((m) => !runde[m.id]).map((m) => m.name)}
                getippt={Object.keys(runde).length} von={spieler.length} gastgeber={gastgeber}
                aufloesen={() => void schicken('aufloesen', { frage })}>
          {r?.fertig && (
            <p className="mt-2 text-lg">
              {r.sieger !== null ? <>Erkannt · <span className="font-bold">{r.punkte} Punkte</span></>
                : <span className="text-sbb-red">{r.zeitAus ? 'Zeit abgelaufen' : 'Nicht erkannt'} · 0 Punkte</span>}
            </p>
          )}
          <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">Welcher Bahnhof es war, zeigt die Auflösung.</p>
        </Warten>
      )}
      {phase === 'aufloesung' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-5xl gap-6 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">Gesucht war · {STUFE_NAME[ziel.s]}</p>
              <p className="text-3xl font-bold leading-tight">{ziel.name}</p>
              <table className="mt-3 w-full text-left text-sm tabular-nums">
                <thead className="text-sbb-metal dark:text-sbb-storm">
                  <tr>
                    <th className="py-1 font-medium">Spieler</th><th className="py-1 font-medium">Karten</th>
                    <th className="py-1 font-medium">Falsch</th><th className="py-1 text-right font-medium">Punkte</th>
                  </tr>
                </thead>
                <tbody>
                  {spieler.map((m, i) => {
                    const t = ergebnisse[frage]?.[i] ?? null
                    return (
                      <tr key={m.id} className="border-t border-sbb-cloud dark:border-sbb-iron">
                        <td className="py-1.5 pr-2">{m.name}{m.id === ich ? ' (du)' : ''}{t?.geloest ? ' ✓' : ''}</td>
                        <td className="py-1.5 pr-2">{t ? t.offen : '–'}</td>
                        <td className="py-1.5 pr-2">{t ? t.falsch : '–'}</td>
                        <td className="py-1.5 text-right">
                          {!t ? <span className="text-sbb-metal dark:text-sbb-storm">nicht fertig</span>
                            : t.geloest ? <span className="font-bold">{t.punkte}</span>
                              : <span className="text-sbb-red">{t.zeitAus ? 'Zeit' : 'nicht erkannt'}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="mt-4">
                <p className="text-sm font-bold">Gesamtstand</p>
                <ol className="mt-1 text-sm tabular-nums">
                  {raenge(gesamt).map((s) => (
                    <li key={s.name + s.rang} className="flex justify-between border-t border-sbb-cloud py-1 dark:border-sbb-iron">
                      <span>{s.rang}. {s.name}{s.ich ? ' (du)' : ''}</span><span className="font-bold">{s.punkte}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div>
              <Steckbrief ziel={ziel} index={index.bahnhoefe} />
              {gastgeber ? (
                <button type="button" onClick={() => void schicken('weiter', { frage })}
                        className="mt-4 min-h-12 w-full rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125">
                  {frage + 1 === start.runden.length ? 'Zum Ergebnis' : 'Nächster Bahnhof'}
                </button>
              ) : (
                <p className="mt-4 text-sm text-sbb-metal dark:text-sbb-storm">{gastName} geht weiter, sobald alle die Lösung gesehen haben.</p>
              )}
            </div>
          </div>
        </div>
      )}
      {phase === 'ende' && (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-lg">
            <h2 className="text-2xl font-bold tracking-tight">Ergebnis</h2>
            <ol className="kachelliste mt-4">
              {raenge(gesamt).map((s) => (
                <li key={s.name + s.rang} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-bold">{s.rang}. {s.name}{s.ich ? ' (du)' : ''}</span>
                    <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                      {s.erkannt} von {start.runden.length} {start.runden.length === 1 ? 'Bahnhof' : 'Bahnhöfen'} erkannt
                    </span>
                  </span>
                  <span className="shrink-0 text-xl font-bold tabular-nums">{s.punkte}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">Höchstens {genau(PUNKTE_HOECHST * start.runden.length)} Punkte möglich.</p>
            <p className="mt-6 text-sm font-bold">Rückblick</p>
            <ol className="mt-1 text-sm">
              {start.runden.map((g, i) => {
                const b = pool.nach.get(g.ziel)!
                const wer = spieler.filter((_, k) => ergebnisse[i]?.[k]?.geloest).map((m) => m.name)
                return (
                  <li key={i} className="flex items-baseline justify-between gap-3 border-t border-sbb-cloud py-1.5 dark:border-sbb-iron">
                    <span className="min-w-0">{b.name}</span>
                    <span className="shrink-0 text-right text-sbb-metal dark:text-sbb-storm">{wer.length ? `erkannt: ${wer.join(', ')}` : 'von niemandem erkannt'}</span>
                  </li>
                )
              })}
            </ol>
            <div className="mt-6 grid grid-cols-2 gap-2">
              {gastgeber ? (
                <button type="button" onClick={() => { const st = neuerStart(pool, stand.dabei); if (st) void schicken('start', st) }}
                        className="min-h-12 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125">
                  Nochmals
                </button>
              ) : (
                <p className="text-sm text-sbb-metal dark:text-sbb-storm">{gastName} kann eine neue Runde starten.</p>
              )}
              <button type="button" onClick={verlassen}
                      className="min-h-12 rounded-lg border border-sbb-cloud px-4 font-medium dark:border-sbb-iron">
                Verlassen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
