/**
 * Die Tafel zur Windhose (Michael, 2026-10-24: «wie die Windverhältnisse sind. Auch mit Prognose für die nächste Woche»): die
 * letzte Messung der Station und ihre stündliche Prognose (src/wind.ts) mit einem Regler über die Stunden; die Windhose im Modell
 * zeigt die gewählte Stunde. Darunter der Verlauf der Woche: Stundenmittel als Linie, Böen heller, je Tag ein Strich.
 */
import { useEffect, useMemo, useState } from 'react'
import { type Station, type Wind } from '../wetter'
import { himmelsrichtungKurz, windPrognose, type WindStunde } from '../wind'

const zeitText = (z: Date, mitTag: boolean) => z.toLocaleString('de-CH', {
  timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', ...(mitTag ? { weekday: 'short', day: 'numeric', month: 'numeric' } : {}),
})
const zahl = (x: number) => x.toLocaleString('de-CH', { maximumFractionDigits: 0 })

export function windSatz(w: Wind) {
  if (w.kmh === null) return 'kein Wind gemessen'
  const von = w.richtung !== null && w.kmh >= 1 ? ` aus ${himmelsrichtungKurz(w.richtung)}` : ''
  const boe = w.boe !== null ? `, Böen bis ${zahl(w.boe)} km/h` : ''
  return `${zahl(w.kmh)} km/h${von}${boe}`
}

export function WindTafel({ station, jetzt, jetztZeit, waehlen, className = '' }: {
  station: Station | null
  /** die letzte Messung, null ohne */
  jetzt: Wind | null; jetztZeit: Date | null
  /** was die Windhose zeigen soll */
  waehlen: (w: Wind | null) => void
  className?: string
}) {
  const [prognose, setPrognose] = useState<WindStunde[] | null | 'laedt'>('laedt')
  // 0: die Messung, sonst die Stunde der Prognose (1 = erste)
  const [stelle, setStelle] = useState(0)
  useEffect(() => {
    if (!station) return
    let weg = false
    setPrognose('laedt')
    void windPrognose(station).then((p) => { if (!weg) setPrognose(p) })
    return () => { weg = true }
  }, [station])
  const liste = Array.isArray(prognose) ? prognose : []
  const gewaehlt: (Wind & { zeit: Date | null }) | null = stelle === 0 ? (jetzt ? { ...jetzt, zeit: jetztZeit } : null) : liste[stelle - 1] ?? null
  useEffect(() => { waehlen(gewaehlt) }, [gewaehlt?.kmh, gewaehlt?.richtung, gewaehlt?.boe]) // eslint-disable-line react-hooks/exhaustive-deps

  const kurve = useMemo(() => {
    if (!liste.length) return null
    const B = 300, H = 60
    const hoechst = Math.max(20, ...liste.map((s) => s.boe ?? s.kmh ?? 0))
    const x = (i: number) => (i / Math.max(1, liste.length - 1)) * B
    const y = (v: number) => H - (v / hoechst) * (H - 4)
    const linie = (wert: (s: WindStunde) => number | null) => liste.map((s, i) => [i, wert(s)] as const)
      .filter(([, v]) => v !== null).map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v!).toFixed(1)}`).join('')
    // je Tag ein Strich um Mitternacht (Schweizer Zeit)
    const tage = liste.map((s, i) => [i, s.zeit.toLocaleString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', hourCycle: 'h23' })] as const)
      .filter(([, h]) => h === '00').map(([i]) => i)
    return { B, H, x, hoechst, mittel: linie((s) => s.kmh), boe: linie((s) => s.boe), tage }
  }, [liste])

  if (!station) return null
  return (
    <div className={`rounded-lg bg-white/95 p-3 text-sm shadow-lg dark:bg-sbb-charcoal/95 ${className}`}>
      <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">Wind bei {station.name} (MeteoSchweiz)</p>
      <p className="mt-0.5 font-bold">
        {gewaehlt ? `${stelle === 0 ? 'Gemessen' : 'Prognose'} ${gewaehlt.zeit ? zeitText(gewaehlt.zeit, stelle !== 0) : ''}: ${windSatz(gewaehlt)}`
          : stelle === 0 ? 'Keine Messung erreichbar' : '–'}
      </p>
      {prognose === 'laedt' && <p className="text-xs text-sbb-metal dark:text-sbb-storm">Prognose wird geladen …</p>}
      {prognose === null && <p className="text-xs text-sbb-metal dark:text-sbb-storm">Prognose nicht erreichbar.</p>}
      {liste.length > 0 && kurve && (
        <>
          <input type="range" min={0} max={liste.length} value={stelle} onChange={(e) => setStelle(+e.target.value)}
                 aria-label="Stunde der Prognose" className="mt-2 w-full accent-sbb-red" />
          <svg viewBox={`0 0 ${kurve.B} ${kurve.H}`} className="mt-1 h-16 w-full cursor-pointer" preserveAspectRatio="none"
               onClick={(e) => {
                 const r = e.currentTarget.getBoundingClientRect()
                 setStelle(1 + Math.round(((e.clientX - r.left) / r.width) * (liste.length - 1)))
               }}>
            {kurve.tage.map((i) => <line key={i} x1={kurve.x(i)} x2={kurve.x(i)} y1={0} y2={kurve.H} stroke="currentColor" strokeOpacity={0.2} />)}
            <path d={kurve.boe} fill="none" stroke="#d2232a" strokeOpacity={0.35} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            <path d={kurve.mittel} fill="none" stroke="#d2232a" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
            {stelle > 0 && <line x1={kurve.x(stelle - 1)} x2={kurve.x(stelle - 1)} y1={0} y2={kurve.H} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
          </svg>
          <p className="text-xs text-sbb-metal dark:text-sbb-storm">
            Stundenmittel (Linie) und Böen (hell) bis {zeitText(liste[liste.length - 1].zeit, true)}, oben {zahl(kurve.hoechst)} km/h; Striche
            um Mitternacht. Prognose von MeteoSchweiz für die Station, keine Messung.
          </p>
        </>
      )}
    </div>
  )
}
