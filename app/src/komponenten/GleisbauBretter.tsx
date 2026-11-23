/**
 * Eigene Bretter im Gleisbau (Michael, 2026-11-23, Vorschlag «Bretter speichern und teilen»): das jetzige Brett mit Namen speichern, die Liste wie die
 * Favoriten der Virtuellen Schweiz (Kacheln, nach links wischen löscht mit «Rückgängig»), je Brett ein Link zum Teilen (#/gleisbau?brett=…). Alles nur
 * im Browser dieses Geräts, der Link enthält das Brett selbst, kein Server.
 */
import { useEffect, useState } from 'react'
import { type Brett, brettAusCode, brettCode, bretterLesen, bretterMerken, type GespeichertesBrett, spalten, zeilen } from '../gleisbau'
import Wischen from './Wischen'

export const brettLink = (code: string) => `${window.location.origin}${window.location.pathname}#/gleisbau?brett=${code}`

const KNOPF = 'flex size-9 flex-none items-center justify-center rounded-lg border border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white'

export default function GleisbauBretter({ brett, oeffnen, gesperrt }: { brett: Brett; oeffnen: (b: Brett, name: string) => void; gesperrt: boolean }) {
  const [liste, setListe] = useState<GespeichertesBrett[]>(() => bretterLesen())
  const [name, setName] = useState<string | null>(null)
  const [weg, setWeg] = useState<{ e: GespeichertesBrett; i: number } | null>(null)
  const [geteilt, setGeteilt] = useState<number | null>(null)
  const [umbenennen, setUmbenennen] = useState<{ i: number; name: string } | null>(null)
  useEffect(() => { bretterMerken(liste) }, [liste])
  useEffect(() => {
    if (!weg) return
    const t = window.setTimeout(() => setWeg(null), 6000)
    return () => window.clearTimeout(t)
  }, [weg])

  const teilen = async (e: GespeichertesBrett, i: number) => {
    const url = brettLink(e.code)
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: `Gleisbau: ${e.name}`, url }); return } catch (x) { if ((x as DOMException).name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url); setGeteilt(i); window.setTimeout(() => setGeteilt((g) => (g === i ? null : g)), 2500) } catch { window.prompt('Link zum Brett', url) }
  }

  return (
    <section className="mt-6 max-w-3xl">
      <h2 className="text-lg font-bold">Meine Bretter</h2>
      {name === null ? (
        <button type="button" disabled={gesperrt} onClick={() => setName(`Brett ${liste.length + 1}`)}
                className="mt-2 min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight">
          Dieses Brett speichern
        </button>
      ) : (
        <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(ev) => {
          ev.preventDefault()
          setListe((l) => [{ name: name.trim() || `Brett ${l.length + 1}`, code: brettCode(brett) }, ...l])
          setName(null)
        }}>
          <input value={name} onChange={(ev) => setName(ev.target.value)} maxLength={60} autoFocus aria-label="Name des Bretts"
                 className="min-w-0 flex-1 rounded-lg border border-sbb-cloud bg-white px-3 py-2 dark:border-sbb-iron dark:bg-sbb-midnight" />
          <button type="submit" className="min-h-11 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125">Speichern</button>
          <button type="button" onClick={() => setName(null)} className="underline underline-offset-2">Abbrechen</button>
        </form>
      )}
      {weg && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-sbb-milk px-3 py-2 text-sm dark:bg-sbb-charcoal">
          <span>«{weg.e.name}» gelöscht.</span>
          <button type="button" onClick={() => { setListe((l) => [...l.slice(0, weg.i), weg.e, ...l.slice(weg.i)]); setWeg(null) }}
                  className="font-bold text-sbb-red">Rückgängig</button>
        </div>
      )}
      {liste.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Meine Bretter">
          {liste.map((e, i) => {
            const b = brettAusCode(e.code)
            if (umbenennen?.i === i) return (
              <li key={`${i}-${e.name}`} className="kachel">
                <form className="flex items-center gap-2 px-2 py-2" onSubmit={(ev) => {
                  ev.preventDefault()
                  const n = umbenennen.name.trim() || e.name
                  setListe((l) => l.map((x, j) => (j === i ? { ...x, name: n } : x))); setUmbenennen(null)
                }}>
                  <input value={umbenennen.name} onChange={(ev) => setUmbenennen({ i, name: ev.target.value })} maxLength={60} autoFocus aria-label="Neuer Name"
                         className="min-w-0 flex-1 rounded-lg border border-sbb-cloud bg-white px-2 py-1.5 dark:border-sbb-iron dark:bg-sbb-midnight" />
                  <button type="submit" className="min-h-10 rounded-lg bg-sbb-red px-3 text-sm font-bold text-white">Speichern</button>
                  <button type="button" onClick={() => setUmbenennen(null)} className="underline underline-offset-2">Abbrechen</button>
                </form>
              </li>
            )
            return (
              <li key={`${i}-${e.name}`} className="kachel overflow-hidden text-base">
                <Wischen frage={`Brett ${e.name} löschen?`} loeschen={() => { setWeg({ e, i }); setListe((l) => l.filter((_, j) => j !== i)) }}>
                  <div className="flex items-center gap-2 pr-2">
                    <button type="button" disabled={gesperrt || !b} onClick={() => b && oeffnen(b, e.name)}
                            className="kachel-link flex min-w-0 flex-1 items-baseline gap-2 py-3 pl-3 text-left disabled:opacity-60">
                      <span className="truncate font-medium">{e.name}</span>
                      {b && <span className="shrink-0 text-sm tabular-nums text-sbb-metal dark:text-sbb-storm">{spalten(b)} × {zeilen(b)}</span>}
                    </button>
                    <button type="button" onClick={() => setUmbenennen({ i, name: e.name })} aria-label={`Brett ${e.name} umbenennen`} title="Umbenennen" className={KNOPF}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" />
                      </svg>
                    </button>
                    <button type="button" onClick={() => void teilen(e, i)} aria-label={`Link zum Brett ${e.name} teilen`}
                            title={geteilt === i ? 'Link kopiert' : 'Link teilen'} className={KNOPF + (geteilt === i ? ' !text-sbb-red' : '')}>
                      {geteilt === i
                        ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                        : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" />
                            <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
                          </svg>}
                    </button>
                  </div>
                </Wischen>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Ein Tipp öffnet ein Brett, nach links wischen löscht es. Der Link enthält das ganze Brett; wer ihn öffnet, sieht es im Gleisbau.
      </p>
    </section>
  )
}
