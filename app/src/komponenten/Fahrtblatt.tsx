import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flaechenLaden, geometrieLaden, seenLaden, sehenswertLaden, streckenLaden, uebersichtLaden } from '../daten'
import {
  type FahrObjekt, type Fahrweg, fahrwegBauen, geometrieLesen, lageBei, seeUferAufWeg, sehenswertAufWeg, wegEnde,
} from '../fahrt'
import { ohneKuerzel } from '../kuerzel'
import type {
  BahnhofIndex, BrueckenEintrag, SeenDaten, StreckenAbschnitt, StreckenNetz, TunnelEintrag, Uebersicht,
} from '../typen'
import { nachKennung, type Nachbarn, type StreckenWahl, wegSuchen } from './Strecke'
import { Ladefehler } from './Ladefehler'

/** So viele Einträge je Art passen auf ein Blatt A4 */
const TUNNEL_MAX = 6
const BRUECKEN_MAX = 3
const BAHNHOEFE_MAX = 7
const GIPFEL_MAX = 3
const KULTUR_MAX = 2
const SEILBAHN_MAX = 2
const SEEN_MAX = 4
/** Brücken ab so vielen Baueinheiten, wie in «Fahren» als grössere Brücke */
const BRUECKE_AB_BE = 3
/** Breite des Blatts auf dem Bildschirm, entspricht 190 mm Druckbreite bei 96 dpi */
const BLATT_PX = 718

interface Eintrag {
  nr: number
  o: FahrObjekt
  art: 'tunnel' | 'bruecke' | 'bahnhof' | 'gipfel' | 'kgs' | 'seilbahn'
  name: string
  zeile: string
  seite?: 'links' | 'rechts'
}

interface Daten {
  netz: StreckenNetz
  tunnel: Uebersicht<TunnelEintrag>
  bruecken: Uebersicht<BrueckenEintrag>
  fahrweg: Fahrweg
  seen: SeenDaten | null
  titel: [string, string]
  /** Tunnel anderer Bahnen aus swissTLM3D: ohne Länge, darum nicht auf dem Blatt */
  ohneLaenge: number
}

const zahl = (n: number) => (n > 9999 ? n.toLocaleString('de-CH') : String(n))

/**
 * Das Fahrtblatt für Familien (Michael, 2026-09-26): vor der Fahrt ausdrucken,
 * im Zug mit den Kindern ausfüllen. Eine Karte des Wegs und die wichtigsten
 * Tunnel, Bahnhöfe und Sehenswürdigkeiten zum Abhaken. Ausgewählt wird nur nach
 * Zahlen aus den Daten (Länge, Baueinheiten, Höhe, Grösse des Bahnhofs), nicht
 * nach «schön» oder «berühmt». Gedruckt oder als PDF gesichert wird mit der
 * Druckfunktion des Browsers; Taktland sendet dafür nichts.
 */
export function Fahrtblatt({ index, wahl }: { index: BahnhofIndex | null; wahl: StreckenWahl }) {
  const [daten, setDaten] = useState<Daten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const bahnhof = useMemo(() => new Map((index?.bahnhoefe ?? []).map((b) => [b.uic, b])), [index])

  useEffect(() => {
    if (!index || !wahl.von || !wahl.nach) return
    let ab = false
    ;(async () => {
      const [netz, tunnel, bruecken, g] = await Promise.all([
        streckenLaden(), uebersichtLaden<TunnelEintrag>('tunnel'), uebersichtLaden<BrueckenEintrag>('bruecken'),
        geometrieLaden()])
      const nachbarn: Nachbarn = new Map()
      for (const e of netz.abschnitte) {
        nachbarn.set(e.von, [...(nachbarn.get(e.von) ?? []), [e.nach, e]])
        nachbarn.set(e.nach, [...(nachbarn.get(e.nach) ?? []), [e.von, e]])
      }
      const abk = (u: number | null) => (u ? netz.bahnhoefe[String(u)] : undefined)
      const [a, z, u] = [abk(wahl.von), abk(wahl.nach), abk(wahl.ueber)]
      if (!a || !z) throw new Error('Start oder Ziel liegt nicht im Netz.')
      let weg = u ? (() => {
        const x = wegSuchen(nachbarn, a, u), y = wegSuchen(nachbarn, u, z)
        return x && y ? { punkte: [...x.punkte, ...y.punkte.slice(1)], abschnitte: [...x.abschnitte, ...y.abschnitte] } : null
      })() : wegSuchen(nachbarn, a, z)
      if (!weg) throw new Error('Zwischen diesen Bahnhöfen findet sich im Netz kein Weg.')
      weg = weg as { punkte: string[]; abschnitte: StreckenAbschnitt[] }
      const uicVon = new Map(Object.entries(netz.bahnhoefe).map(([k, v]) => [v, Number(k)]))
      const brueckenNach = nachKennung(bruecken)
      const fahrweg = fahrwegBauen(netz, geometrieLesen(g), weg.punkte, weg.abschnitte,
                                   (id) => brueckenNach.get(id)?.km ?? undefined,
                                   (x) => bahnhof.has(uicVon.get(x) ?? 0))
      let seen: SeenDaten | null = null
      try {
        const [s, f] = await Promise.all([sehenswertLaden(), flaechenLaden()])
        fahrweg.objekte = [...fahrweg.objekte, ...sehenswertAufWeg(fahrweg, s, f)].sort((p, q) => p.s - q.s)
      } catch { /* ohne Sehenswertes */ }
      try { seen = await seenLaden(); fahrweg.seeUfer = seeUferAufWeg(fahrweg, seen) } catch { /* ohne Seen */ }
      const name = (x: string) => bahnhof.get(uicVon.get(x) ?? 0)?.name ?? netz.punkte[x] ?? x
      if (!ab) {
        setDaten({ netz, tunnel, bruecken, fahrweg, seen, titel: [name(weg.punkte[0]), name(weg.punkte[weg.punkte.length - 1])],
                   ohneLaenge: fahrweg.objekte.filter((o) => o.tlm && o.art === 'tunnel').length })
      }
    })().catch((e: Error) => { if (!ab) setFehler(e.message) })
    return () => { ab = true }
  }, [index, wahl.von, wahl.nach, wahl.ueber, bahnhof])

  const eintraege = useMemo(() => (daten ? auswaehlen(daten, bahnhof) : []), [daten, bahnhof])

  return (
    <div className="px-4 pb-16">
      <div className="print:hidden">
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Fahrtblatt</h1>
        <p className="mt-2 leading-relaxed">
          Ein Blatt zum Ausdrucken für die Fahrt mit Kindern: die Karte des Wegs und die wichtigsten
          Tunnel, Bahnhöfe und Sehenswürdigkeiten zum Abhaken. Drucken oder als PDF sichern geht über
          die Druckfunktion deines Geräts.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={!daten} onClick={() => window.print()}
                  className="rounded-lg bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
            Drucken oder als PDF sichern
          </button>
          <button type="button" onClick={() => window.history.back()}
                  className="border border-sbb-cloud bg-white px-4 py-3 font-medium hover:border-sbb-black
                             dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white">
            Zurück
          </button>
        </div>
      </div>
      {fehler && <Ladefehler className="mt-6" was="Das Fahrtblatt konnte nicht erstellt werden." fehler={fehler} />}
      {!daten && !fehler && <p className="mt-6 text-sbb-metal print:hidden">Das Fahrtblatt wird erstellt …</p>}
      {daten && <Blatt daten={daten} eintraege={eintraege} />}
    </div>
  )
}

/** Was aufs Blatt kommt, in Fahrtrichtung nummeriert */
function auswaehlen(d: Daten, bahnhof: Map<number, { name: string; tier: string }>): Eintrag[] {
  const tunnelNach = nachKennung(d.tunnel)
  const brueckenNach = nachKennung(d.bruecken)
  const uicVon = new Map(Object.entries(d.netz.bahnhoefe).map(([k, v]) => [v, Number(k)]))
  const roh: Array<Omit<Eintrag, 'nr'>> = []
  const ob = d.fahrweg.objekte

  // die längsten Tunnel mit bekannter Länge
  const tunnel = ob.filter((o) => o.art === 'tunnel' && !o.tlm && tunnelNach.get(o.kennung)?.laenge_m != null)
    .sort((a, b) => tunnelNach.get(b.kennung)!.laenge_m! - tunnelNach.get(a.kennung)!.laenge_m!).slice(0, TUNNEL_MAX)
  for (const o of tunnel) {
    const t = tunnelNach.get(o.kennung)!
    roh.push({ o, art: 'tunnel', name: ohneKuerzel(t.name), zeile: `${zahl(t.laenge_m!)} m` })
  }
  // Brücken mit den meisten Baueinheiten, ab 3
  const bruecken = ob.filter((o) => o.art === 'bruecke' && !o.tlm && (brueckenNach.get(o.kennung)?.baueinheiten ?? 0) >= BRUECKE_AB_BE)
    .sort((a, b) => brueckenNach.get(b.kennung)!.baueinheiten! - brueckenNach.get(a.kennung)!.baueinheiten!)
    .slice(0, BRUECKEN_MAX)
  for (const o of bruecken) {
    const b = brueckenNach.get(o.kennung)!
    roh.push({ o, art: 'bruecke', name: ohneKuerzel(b.name), zeile: `${b.baueinheiten} Baueinheiten` })
  }
  // Bahnhöfe: alle, und sind es zu viele, zuerst die grossen, dann die mittleren
  const stufe = { L: 0, M: 1, S: 2 } as Record<string, number>
  const bhf = ob.filter((o) => o.art === 'bahnhof').map((o) => ({ o, b: bahnhof.get(uicVon.get(o.kennung) ?? 0) }))
    .filter((x) => x.b)
  const gewaehlt = bhf.length <= BAHNHOEFE_MAX ? bhf
    : [...bhf].sort((x, y) => (stufe[x.b!.tier] ?? 3) - (stufe[y.b!.tier] ?? 3)).slice(0, BAHNHOEFE_MAX)
  for (const { o, b } of gewaehlt) roh.push({ o, art: 'bahnhof', name: b!.name, zeile: '' })
  // Sehenswertes: die höchsten Gipfel, dazu Kultur und Seilbahnen in Fahrtrichtung
  const sw = ob.filter((o) => o.sehenswert && o.sehenswert.seite)
  const hoehe = (o: FahrObjekt) => Number((o.sehenswert!.zeile.match(/^([\d'’]+) m/)?.[1] ?? '0').replace(/['’]/g, ''))
  const gipfel = sw.filter((o) => o.sehenswert!.sorte === 'gipfel').sort((a, b) => hoehe(b) - hoehe(a)).slice(0, GIPFEL_MAX)
  const kultur = sw.filter((o) => o.sehenswert!.sorte === 'kgs').slice(0, KULTUR_MAX)
  const seilbahn = sw.filter((o) => o.sehenswert!.sorte === 'seilbahn').slice(0, SEILBAHN_MAX)
  for (const o of [...gipfel, ...kultur, ...seilbahn]) {
    const s = o.sehenswert!
    roh.push({ o, art: s.sorte as Eintrag['art'], name: s.name, seite: s.seite!,
               zeile: s.sorte === 'gipfel' ? s.zeile : s.sorte === 'kgs' ? 'Kulturgut' : 'Seilbahn' })
  }
  return roh.sort((a, b) => a.o.s - b.o.s).map((e, i) => ({ ...e, nr: i + 1 }))
}

/** Seen entlang des Wegs, zusammengefasst nach Name und Seite */
function seenAmWeg(fw: Fahrweg) {
  const raus: Array<{ name: string; seite: 'links' | 'rechts' }> = []
  for (const u of fw.seeUfer ?? []) {
    if (!u.name) continue
    if (!raus.some((x) => x.name === u.name && x.seite === u.seite)) raus.push({ name: u.name, seite: u.seite })
  }
  return raus
}

function Blatt({ daten, eintraege }: { daten: Daten; eintraege: Eintrag[] }) {
  // auf dem Handy verkleinert zeigen, gedruckt in voller Grösse
  const rahmen = useRef<HTMLDivElement | null>(null)
  const blatt = useRef<HTMLDivElement | null>(null)
  const [massstab, setMassstab] = useState(1)
  const [hoehe, setHoehe] = useState(0)
  useLayoutEffect(() => {
    const el = rahmen.current
    if (!el) return
    const neu = () => {
      setMassstab(Math.min(1, el.clientWidth / BLATT_PX))
      setHoehe(blatt.current?.offsetHeight ?? 0)
    }
    neu()
    const ro = new ResizeObserver(neu)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const seen = seenAmWeg(daten.fahrweg)
  const gruppe = (arten: Eintrag['art'][]) => eintraege.filter((e) => arten.includes(e.art))
  const tunnel = gruppe(['tunnel'])
  const bahnhoefe = gruppe(['bahnhof', 'bruecke'])
  const sehen = gruppe(['gipfel', 'kgs', 'seilbahn'])

  return (
    <div ref={rahmen} className="fahrtblatt-rahmen mt-6 print:mt-0" style={{ height: hoehe * massstab || undefined }}>
      <div ref={blatt} id="fahrtblatt" className="fahrtblatt origin-top-left bg-white p-4 text-black shadow print:p-0 print:shadow-none"
           style={{ width: BLATT_PX, transform: `scale(${massstab})` }}>
        <div className="flex items-end justify-between gap-4 border-b-2 border-black pb-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide">Taktland · Fahrtblatt</p>
            <p className="text-2xl font-bold leading-tight">{daten.titel[0]} → {daten.titel[1]}</p>
          </div>
          <div className="shrink-0 text-sm leading-7">
            <p>Datum: ____________</p>
            <p>Name: _____________</p>
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-snug">
          Hake ab, was du unterwegs entdeckst. Bei jedem Tunnel: Schätze vorher, wie viele Sekunden es
          dunkel bleibt, und zähle dann mit. Die Zahlen auf der Karte gehören zu den Zahlen in den Listen.
        </p>

        <Karte daten={daten} eintraege={eintraege} hoch={eintraege.length + Math.min(seen.length, SEEN_MAX) > 17 ? 220 : 270} />

        {tunnel.length > 0 && (
          <Liste titel="Tunnel">
            {tunnel.map((e) => (
              <li key={e.nr} className="flex items-center gap-2 border-b border-dotted border-neutral-400 py-[3px]">
                <Kaestchen />
                <Nummer e={e} />
                <span className="min-w-0 flex-1 truncate"><b>{e.name}</b> · {e.zeile}</span>
                <span className="shrink-0 text-[12px]">geschätzt ____ s</span>
                <span className="shrink-0 text-[12px]">gezählt ____ s</span>
              </li>
            ))}
          </Liste>
        )}

        <div className="grid grid-cols-2 gap-x-6">
          <div>
            {bahnhoefe.length > 0 && (
              <Liste titel="Bahnhöfe und Brücken">
                {bahnhoefe.map((e) => <Zeile key={e.nr} e={e} />)}
              </Liste>
            )}
          </div>
          <div>
            {sehen.length > 0 && (
              <Liste titel="Aus dem Fenster">
                {sehen.map((e) => <Zeile key={e.nr} e={e} />)}
              </Liste>
            )}
            {seen.length > 0 && (
              <Liste titel="Seen">
                {seen.slice(0, SEEN_MAX).map((s) => (
                  <li key={s.name + s.seite} className="flex items-center gap-2 border-b border-dotted border-neutral-400 py-[3px]">
                    <Kaestchen />
                    <span className="min-w-0 truncate"><b>{s.name}</b> · {s.seite}</span>
                  </li>
                ))}
              </Liste>
            )}
          </div>
        </div>

        <div className={`mt-3 ${eintraege.length + Math.min(seen.length, SEEN_MAX) > 17 ? 'h-16' : 'h-28'}
                         border-2 border-black p-2 text-[13px]`}>
          Das habe ich aus dem Fenster gesehen:
        </div>

        <p className="mt-2 text-[9.5px] leading-snug">
          Auswahl nach Zahlen aus den Daten: die {TUNNEL_MAX} längsten Tunnel mit bekannter Länge, Brücken ab
          {' '}{BRUECKE_AB_BE} Baueinheiten, bei vielen Bahnhöfen zuerst die grossen, die {GIPFEL_MAX} höchsten Gipfel bis 8 km
          neben der Strecke. Links und rechts in Fahrtrichtung laut Lage in den Daten; ob man es vom Zug aus
          sieht, sagen die Daten nicht.
          {daten.ohneLaenge > 0 && ' Tunnel anderer Bahnen haben in den Daten keine Länge und stehen nicht auf dem Blatt.'}
          {' '}Quellen: SBB Open Data (data.sbb.ch), Bundesamt für Verkehr BAV, swisstopo, BABS. Taktland ist ein
          privates Lernprojekt und kein Angebot der SBB.
        </p>
      </div>
    </div>
  )
}

function Liste({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="mt-2 break-inside-avoid text-[13px]">
      <h2 className="border-b border-black text-[14px] font-bold">{titel}</h2>
      <ul>{children}</ul>
    </section>
  )
}

function Kaestchen() {
  return <span className="mt-0.5 inline-block size-4 shrink-0 border-[1.5px] border-black" aria-hidden="true" />
}

function Zeile({ e }: { e: Eintrag }) {
  return (
    <li className="flex items-center gap-2 border-b border-dotted border-neutral-400 py-[3px]">
      <Kaestchen />
      <Nummer e={e} />
      {/* ist der Name lang, wird er gekürzt; Art und Seite bleiben sichtbar */}
      <b className="min-w-0 truncate">{e.name}</b>
      <span className="shrink-0">
        {e.zeile && <> · {e.zeile}</>}
        {e.seite && <> · {e.seite}</>}
        {e.art === 'bruecke' && ' · Brücke'}
      </span>
    </li>
  )
}

/** wie auf der Karte: Bahnhöfe weiss, alles andere schwarz */
function Nummer({ e }: { e: Eintrag }) {
  return (
    <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-black
                      text-[11px] font-bold ${e.art === 'bahnhof' ? 'bg-white text-black' : 'bg-black text-white'}`}>
      {e.nr}
    </span>
  )
}

/** Die Karte des Wegs, schwarz-weiss druckbar, mit Seen und nummerierten Punkten */
function Karte({ daten, eintraege, hoch }: { daten: Daten; eintraege: Eintrag[]; hoch: number }) {
  const B = BLATT_PX, H = hoch, RAND = 30
  const fw = daten.fahrweg
  const lat0 = fw.punkte.reduce((s, p) => s + p.lat, 0) / fw.punkte.length
  const kx = Math.cos((lat0 * Math.PI) / 180)
  const xs = fw.punkte.map((p) => p.lon * kx), ys = fw.punkte.map((p) => -p.lat)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const m = Math.min((B - 2 * RAND) / (x1 - x0 || 1e-6), (H - 2 * RAND) / (y1 - y0 || 1e-6))
  const ox = (B - (x1 - x0) * m) / 2, oy = (H - (y1 - y0) * m) / 2
  const pt = (lat: number, lon: number) => [ox + (lon * kx - x0) * m, oy + (-lat - y0) * m] as const
  const linie = (von: number, bis: number) => {
    const raus: string[] = []
    for (let s = von; s <= bis; s += Math.max(20, (bis - von) / 40)) {
      const l = lageBei(fw, s); const [x, y] = pt(l.lat, l.lon); raus.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
    const l = lageBei(fw, bis); const [x, y] = pt(l.lat, l.lon); raus.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    return raus.join(' ')
  }
  // Seen im Ausschnitt
  const seen = (daten.seen?.seen ?? []).flatMap((s) => s.ringe.map((r) => {
    let [la, lo] = r.start
    const p = [pt(la / 1e5, lo / 1e5)]
    for (let i = 0; i < r.d.length; i += 2) { la += r.d[i]; lo += r.d[i + 1]; p.push(pt(la / 1e5, lo / 1e5)) }
    return p
  })).filter((p) => p.some(([x, y]) => x > -50 && x < B + 50 && y > -50 && y < H + 50))
  const ende = wegEnde(fw)
  const [a, z] = [lageBei(fw, 0), lageBei(fw, ende)]
  const [ax, ay] = pt(a.lat, a.lon), [zx, zy] = pt(z.lat, z.lon)
  // Nummern: auf der Strecke, Sehenswertes etwas zur Seite, in Fahrtrichtung
  const marke = (e: Eintrag) => {
    const l = lageBei(fw, e.o.s)
    const [x, y] = pt(l.lat, l.lon)
    if (!e.seite) return [x, y] as const
    const n = lageBei(fw, Math.min(ende, e.o.s + 200))
    const [nx, ny] = pt(n.lat, n.lon)
    const dx = nx - x, dy = ny - y, d = Math.hypot(dx, dy) || 1
    // links in Fahrtrichtung ist auf dem Blatt (y nach unten) die Normale (dy, -dx)
    const k = e.seite === 'links' ? 1 : -1
    return [x + (k * dy / d) * 16, y + (k * -dx / d) * 16] as const
  }

  return (
    <svg viewBox={`0 0 ${B} ${H}`} className="mt-3 block w-full border-2 border-black" role="img"
         aria-label={`Karte des Wegs ${daten.titel[0]} bis ${daten.titel[1]}`}>
      {seen.map((p, i) => (
        <polygon key={i} points={p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="#d6e7f5" />
      ))}
      <polyline points={linie(0, ende)} fill="none" stroke="#000" strokeWidth={2.5} strokeLinejoin="round" />
      {eintraege.filter((e) => e.art === 'tunnel' && e.o.sAus !== null).map((e) => (
        <polyline key={`t${e.nr}`} points={linie(e.o.s, e.o.sAus!)} fill="none" stroke="#000" strokeWidth={7}
                  strokeLinecap="butt" />
      ))}
      {[[ax, ay, daten.titel[0]], [zx, zy, daten.titel[1]]].map(([x, y, n], i) => (
        <g key={i}>
          <rect x={(x as number) - 6} y={(y as number) - 6} width={12} height={12} fill="#fff" stroke="#000" strokeWidth={2.5} />
          <text x={x as number} y={(y as number) - 12} fontSize={15} fontWeight={700}
                textAnchor={(x as number) < B * 0.2 ? 'start' : (x as number) > B * 0.8 ? 'end' : 'middle'}
                stroke="#fff" strokeWidth={4} paintOrder="stroke">{n}</text>
        </g>
      ))}
      {eintraege.map((e) => {
        const [x, y] = marke(e)
        return (
          <g key={e.nr}>
            <circle cx={x} cy={y} r={8} fill={e.art === 'bahnhof' ? '#fff' : '#000'} stroke="#000" strokeWidth={1.5} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700}
                  fill={e.art === 'bahnhof' ? '#000' : '#fff'}>{e.nr}</text>
          </g>
        )
      })}
    </svg>
  )
}
