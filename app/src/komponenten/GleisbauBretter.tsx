/**
 * Die Startseite des Gleisbaus (Michael, 2026-11-23: «Man muss neue Bretter eröffnen können, abspeichern können, bearbeiten können. Wenn man auf
 * Gleisbau kommt, kommt eine Liste, neues Brett, Brett bearbeiten … damit man auf verschiedenen arbeiten kann»): «Neues Brett», die eigenen Bretter
 * als Kacheln (Tipp öffnet zum Bearbeiten, Stift benennt um, Teilen gibt den Link, nach links wischen löscht mit «Rückgängig»), dazu die Aufgaben.
 * Alles nur im Browser dieses Geräts; ein geteilter Link enthält das Brett selbst, kein Server.
 */
import { useEffect, useState } from 'react'
import { brettAusCode, type GespeichertesBrett, spalten, zeilen } from '../gleisbau'
import Wischen from './Wischen'

export const brettLink = (code: string) => `${window.location.origin}${window.location.pathname}#/gleisbau?brett=${code}`

const KNOPF = 'flex size-9 flex-none items-center justify-center rounded-lg border border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white'

const wann = (ms: number) => {
  if (!ms) return ''
  const d = new Date(ms), heute = new Date()
  const gleicherTag = d.toDateString() === heute.toDateString()
  return gleicherTag ? `heute ${d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric', year: 'numeric' })
}

export default function GleisbauBretter({ bretter, setBretter, oeffnen, neu, aufgaben, sterne, sterneMax }: {
  bretter: GespeichertesBrett[]
  setBretter: (f: (l: GespeichertesBrett[]) => GespeichertesBrett[]) => void
  oeffnen: (id: string) => void
  neu: () => void
  aufgaben: () => void
  sterne: number
  sterneMax: number
}) {
  const [weg, setWeg] = useState<{ e: GespeichertesBrett; i: number } | null>(null)
  const [geteilt, setGeteilt] = useState<string | null>(null)
  const [umbenennen, setUmbenennen] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    if (!weg) return
    const t = window.setTimeout(() => setWeg(null), 6000)
    return () => window.clearTimeout(t)
  }, [weg])

  const teilen = async (e: GespeichertesBrett) => {
    const url = brettLink(e.code)
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: `Gleisbau: ${e.name}`, url }); return } catch (x) { if ((x as DOMException).name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url); setGeteilt(e.id); window.setTimeout(() => setGeteilt((g) => (g === e.id ? null : g)), 2500) } catch { window.prompt('Link zum Brett', url) }
  }

  return (
    <div className="mt-4 max-w-3xl">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={neu} className="min-h-12 rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125">Neues Brett</button>
        <button type="button" onClick={aufgaben}
                className="min-h-12 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight">
          Aufgaben <span className="ml-1 text-sm font-medium tabular-nums text-sbb-metal dark:text-sbb-storm">{sterne} / {sterneMax} ★</span>
        </button>
      </div>
      <h2 className="mt-6 text-lg font-bold">Meine Bretter</h2>
      {weg && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-sbb-milk px-3 py-2 text-sm dark:bg-sbb-charcoal">
          <span>«{weg.e.name}» gelöscht.</span>
          <button type="button" onClick={() => { setBretter((l) => [...l.slice(0, weg.i), weg.e, ...l.slice(weg.i)]); setWeg(null) }}
                  className="font-bold text-sbb-red">Rückgängig</button>
        </div>
      )}
      {!bretter.length && <p className="mt-2 text-sbb-metal dark:text-sbb-storm">Noch keine Bretter. «Neues Brett» beginnt eines.</p>}
      {bretter.length > 0 && (
        <ul className="mt-2 space-y-2" aria-label="Meine Bretter">
          {bretter.map((e, i) => {
            const b = brettAusCode(e.code)
            if (umbenennen?.id === e.id) return (
              <li key={e.id} className="kachel">
                <form className="flex items-center gap-2 px-2 py-2" onSubmit={(ev) => {
                  ev.preventDefault()
                  const n = umbenennen.name.trim() || e.name
                  setBretter((l) => l.map((x) => (x.id === e.id ? { ...x, name: n } : x))); setUmbenennen(null)
                }}>
                  <input value={umbenennen.name} onChange={(ev) => setUmbenennen({ id: e.id, name: ev.target.value })} maxLength={60} autoFocus aria-label="Neuer Name"
                         className="min-w-0 flex-1 rounded-lg border border-sbb-cloud bg-white px-2 py-1.5 dark:border-sbb-iron dark:bg-sbb-midnight" />
                  <button type="submit" className="min-h-10 rounded-lg bg-sbb-red px-3 text-sm font-bold text-white">Speichern</button>
                  <button type="button" onClick={() => setUmbenennen(null)} className="underline underline-offset-2">Abbrechen</button>
                </form>
              </li>
            )
            return (
              <li key={e.id} className="kachel overflow-hidden text-base">
                <Wischen frage={`Brett ${e.name} löschen?`} loeschen={() => { setWeg({ e, i }); setBretter((l) => l.filter((x) => x.id !== e.id)) }}>
                  <div className="flex items-center gap-2 pr-2">
                    <button type="button" disabled={!b} onClick={() => oeffnen(e.id)}
                            className="kachel-link flex min-w-0 flex-1 flex-col py-3 pl-3 text-left disabled:opacity-60">
                      <span className="truncate font-medium">{e.name}</span>
                      <span className="text-sm tabular-nums text-sbb-metal dark:text-sbb-storm">
                        {b ? `${spalten(b)} × ${zeilen(b)}` : 'beschädigt'}{e.geaendert ? ` · ${wann(e.geaendert)}` : ''}
                      </span>
                    </button>
                    <button type="button" onClick={() => setUmbenennen({ id: e.id, name: e.name })} aria-label={`Brett ${e.name} umbenennen`} title="Umbenennen" className={KNOPF}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" />
                      </svg>
                    </button>
                    <button type="button" onClick={() => void teilen(e)} aria-label={`Link zum Brett ${e.name} teilen`}
                            title={geteilt === e.id ? 'Link kopiert' : 'Link teilen'} className={KNOPF + (geteilt === e.id ? ' !text-sbb-red' : '')}>
                      {geteilt === e.id
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
        Ein Tipp öffnet ein Brett zum Bearbeiten; es speichert sich beim Bauen von selbst. Nach links wischen löscht es. Der Link enthält das ganze Brett;
        wer ihn öffnet, bekommt es als eigenes Brett.
      </p>
    </div>
  )
}
