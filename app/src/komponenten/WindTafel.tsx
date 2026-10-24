/**
 * Die Tafel zur Windhose (Michael, 2026-10-24: «wie die Windverhältnisse sind. Auch mit Prognose für die nächste Woche»; «Regen auch
 * einblenden mit der gleichen Prognose»): die letzte Messung der Station und ihre stündliche Prognose (src/wind.ts) mit einem Regler
 * über die Stunden; Windhose, Regen und Schnee im Modell zeigen die gewählte Stunde. Darunter der Verlauf der Woche: Stundenmittel des
 * Winds als Linie, Böen heller, Niederschlag je Stunde als Balken, je Tag ein Strich.
 */
import { useEffect, useMemo, useState } from 'react'
import { type Station, type Wetter, type Wind } from '../wetter'
import { himmelsrichtungKurz, niederAusStunde, windPrognose, type WindStunde } from '../wind'

const zeitText = (z: Date, mitTag: boolean) => z.toLocaleString('de-CH', {
  timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', ...(mitTag ? { weekday: 'short', day: 'numeric', month: 'numeric' } : {}),
})
const zahl = (x: number, stellen = 0) => x.toLocaleString('de-CH', { maximumFractionDigits: stellen })
const BLAU = '#2f7fd6'

export function windSatz(w: Wind) {
  if (w.kmh === null) return 'kein Wind gemessen'
  const von = w.richtung !== null && w.kmh >= 1 ? ` aus ${himmelsrichtungKurz(w.richtung)}` : ''
  const boe = w.boe !== null ? `, Böen bis ${zahl(w.boe)} km/h` : ''
  return `Wind ${zahl(w.kmh)} km/h${von}${boe}`
}

/** Niederschlag einer Stunde der Prognose in Worten */
export function niederSatz(s: WindStunde) {
  if (s.mm === null) return 'Niederschlag ohne Angabe'
  const n = niederAusStunde(s)
  return n ? `${n.art === 'schnee' ? 'Schnee' : 'Regen'} ${zahl(s.mm, 1)} mm` : 'kein Niederschlag'
}

export function WindTafel({ station, messung, waehlen, className = '' }: {
  station: Station | null
  /** die letzte Messung der Station, null ohne */
  messung: Wetter | null
  /** was das Modell zeigen soll: eine Stunde der Prognose, null die Messung */
  waehlen: (s: WindStunde | null) => void
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
  const stunde = stelle === 0 ? null : liste[stelle - 1] ?? null
  useEffect(() => { waehlen(stunde) }, [stunde]) // eslint-disable-line react-hooks/exhaustive-deps

  const kurve = useMemo(() => {
    if (!liste.length) return null
    const B = 300, H = 70
    const hoechst = Math.max(20, ...liste.map((s) => s.boe ?? s.kmh ?? 0))
    const mmHoechst = Math.max(2, ...liste.map((s) => s.mm ?? 0))
    const x = (i: number) => (i / Math.max(1, liste.length - 1)) * B
    const y = (v: number) => H - (v / hoechst) * (H - 4)
    const linie = (wert: (s: WindStunde) => number | null) => liste.map((s, i) => [i, wert(s)] as const)
      .filter(([, v]) => v !== null).map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v!).toFixed(1)}`).join('')
    const balken = liste.map((s, i) => [i, s.mm ?? 0] as const).filter(([, mm]) => mm >= 0.1)
      .map(([i, mm]) => ({ x: x(i), h: (mm / mmHoechst) * (H * 0.5) }))
    // je Tag ein Strich um Mitternacht (Schweizer Zeit)
    const tage = liste.map((s, i) => [i, s.zeit.toLocaleString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', hourCycle: 'h23' })] as const)
      .filter(([, h]) => h === '00').map(([i]) => i)
    return { B, H, x, hoechst, mmHoechst, mittel: linie((s) => s.kmh), boe: linie((s) => s.boe), balken, tage, breite: B / liste.length }
  }, [liste])

  if (!station) return null
  const messText = () => {
    if (!messung) return 'Keine Messung erreichbar'
    const z = messung.windZeit ?? messung.zeit
    const teile = [messung.wind ? windSatz(messung.wind) : 'Wind nicht gemessen']
    if (messung.niederschlag !== null) {
      teile.push(messung.art === 'regen' || messung.art === 'schnee'
        ? `${messung.art === 'schnee' ? 'Schnee' : 'Regen'} ${zahl(messung.niederschlag, 1)} mm in 30 Min.` : 'kein Niederschlag')
    }
    return `Gemessen ${zeitText(z, false)}: ${teile.join(', ')}`
  }
  return (
    <div className={`rounded-lg bg-white/95 p-3 text-sm shadow-lg dark:bg-sbb-charcoal/95 ${className}`}>
      <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">Wind und Niederschlag bei {station.name} (MeteoSchweiz)</p>
      <p className="mt-0.5 font-bold">
        {stunde ? `Prognose ${zeitText(stunde.zeit, true)}: ${windSatz(stunde)}, ${niederSatz(stunde)}` : messText()}
      </p>
      {prognose === 'laedt' && <p className="text-xs text-sbb-metal dark:text-sbb-storm">Prognose wird geladen …</p>}
      {prognose === null && <p className="text-xs text-sbb-metal dark:text-sbb-storm">Prognose nicht erreichbar.</p>}
      {liste.length > 0 && kurve && (
        <>
          <input type="range" min={0} max={liste.length} value={stelle} onChange={(e) => setStelle(+e.target.value)}
                 aria-label="Stunde der Prognose" className="mt-2 w-full accent-sbb-red" />
          <svg viewBox={`0 0 ${kurve.B} ${kurve.H}`} className="mt-1 h-20 w-full cursor-pointer" preserveAspectRatio="none"
               onClick={(e) => {
                 const r = e.currentTarget.getBoundingClientRect()
                 setStelle(1 + Math.round(((e.clientX - r.left) / r.width) * (liste.length - 1)))
               }}>
            {kurve.tage.map((i) => <line key={i} x1={kurve.x(i)} x2={kurve.x(i)} y1={0} y2={kurve.H} stroke="currentColor" strokeOpacity={0.2} />)}
            {kurve.balken.map((b, i) => (
              <rect key={i} x={b.x - kurve.breite / 2} y={kurve.H - b.h} width={Math.max(0.8, kurve.breite)} height={b.h} fill={BLAU} fillOpacity={0.55} />
            ))}
            <path d={kurve.boe} fill="none" stroke="#d2232a" strokeOpacity={0.35} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            <path d={kurve.mittel} fill="none" stroke="#d2232a" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
            {stelle > 0 && <line x1={kurve.x(stelle - 1)} x2={kurve.x(stelle - 1)} y1={0} y2={kurve.H} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
          </svg>
          <p className="text-xs text-sbb-metal dark:text-sbb-storm">
            Wind als Stundenmittel (rote Linie, oben {zahl(kurve.hoechst)} km/h) und Böen (hell), Niederschlag je Stunde (blaue Balken, halb so
            hoch wie die Grafik sind {zahl(kurve.mmHoechst, 1)} mm), bis {zeitText(liste[liste.length - 1].zeit, true)}; Striche um Mitternacht. Prognose von
            MeteoSchweiz für die Station, keine Messung; Regen oder Schnee im Modell ab 0,1 mm, Schnee bis 1 °C.
          </p>
        </>
      )}
    </div>
  )
}
