import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flaechenLaden, geometrieLaden, seenLaden, sehenswertLaden, streckenLaden, uebersichtLaden } from '../daten'
import {
  type FahrObjekt, type Fahrweg, fahrwegBauen, geometrieLesen, lageBei, seeUferAufWeg, sehenswertAufWeg, wegEnde,
} from '../fahrt'
import { ohneKuerzel } from '../kuerzel'
import { bahnenAusLesen, nachbarnBauen } from '../bahnen'
import type {
  BahnhofIndex, BrueckenEintrag, SeenDaten, StreckenAbschnitt, StreckenNetz, TunnelEintrag, Uebersicht,
} from '../typen'
import { nachKennung, type Nachbarn, type StreckenWahl, wegSuchen } from './Strecke'
import { Ladefehler } from './Ladefehler'
import { Pikto } from './Pikto'

/** So viele Einträge je Art passen auf ein Blatt A4 */
const TUNNEL_MAX = 5
/** so viele Tunnel anderer Bahnen mit Namen (swissTLM3D, ohne Länge) vor denen mit Länge */
const TLM_TUNNEL_ZUERST = 2
const BRUECKEN_MAX = 3
const BAHNHOEFE_MAX = 5
const GIPFEL_MAX = 3
const SEILBAHN_MAX = 1
const SEEN_MAX = 3
/** Brücken ab so vielen Baueinheiten, wie in «Fahren» als grössere Brücke */
const BRUECKE_AB_BE = 3
/** Farben wie im Streckenband von «Fahren» (Michael, 2026-09-26: «gleiche Farben wie
 *  in der App»), fest und hell, damit der Druck im Dunkelmodus gleich aussieht */
const FARBE: Record<Eintrag['art'], string> = {
  tunnel: '#000000', bruecke: '#f27e00', bahnhof: '#1d3f8a', gipfel: '#2f7d4f', seilbahn: '#2f7d4f',
}
const SEE = '#c9def1'
const WEG = '#767676'

/** Breite des Blatts auf dem Bildschirm, entspricht 190 mm Druckbreite bei 96 dpi */
const BLATT_PX = 718
/** Höhe des Blatts: A4 ohne Rand (277 mm) bei 96 dpi, etwas Luft fürs Runden.
 *  Die obere Hälfte gehört der Karte, die untere dem Ausfüllen (Michael, 2026-09-26) */
const BLATT_HOCH_PX = 1036
/** Näher als so viele Pixel überdecken sich zwei Nummern auf der Karte */
const ENG_PX = 18
/** So weit um die dichteste Stelle herum zeigt der Ausschnitt alles */
const AUSSCHNITT_PX = 30
/** Stärker vergrössert der Ausschnitt nicht, sonst fehlt jeder Zusammenhang */
const AUSSCHNITT_MAX_ZOOM = 12

interface Eintrag {
  nr: number
  o: FahrObjekt
  art: 'tunnel' | 'bruecke' | 'bahnhof' | 'gipfel' | 'seilbahn'
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
      // nur auf den gewählten Bahnen, wie auf der Seite «Strecke»
      const nachbarn: Nachbarn = nachbarnBauen(netz, bahnenAusLesen())
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

  // passt das Blatt nicht auf eine Seite, fallen von unten Einträge weg (siehe auswaehlen)
  const [weniger, setWeniger] = useState(0)
  useEffect(() => setWeniger(0), [daten])
  const eintraege = useMemo(() => (daten ? auswaehlen(daten, bahnhof, weniger) : []), [daten, bahnhof, weniger])

  return (
    <div className="px-4 pb-16 print:p-0">
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
                  className="rounded-lg border border-sbb-cloud bg-white px-4 py-3 font-medium hover:border-sbb-black
                             dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white">
            Zurück
          </button>
        </div>
      </div>
      {fehler && <Ladefehler className="mt-6" was="Das Fahrtblatt konnte nicht erstellt werden." fehler={fehler} />}
      {!daten && !fehler && <p className="mt-6 text-sbb-metal print:hidden">Das Fahrtblatt wird erstellt …</p>}
      {daten && <Blatt daten={daten} eintraege={eintraege} zuViel={() => setWeniger((w) => Math.min(w + 1, 40))} />}
    </div>
  )
}

/** Was aufs Blatt kommt, in Fahrtrichtung nummeriert */
function auswaehlen(d: Daten, bahnhof: Map<number, { name: string; tier: string }>, weniger = 0): Eintrag[] {
  const tunnelNach = nachKennung(d.tunnel)
  const brueckenNach = nachKennung(d.bruecken)
  const uicVon = new Map(Object.entries(d.netz.bahnhoefe).map(([k, v]) => [v, Number(k)]))
  const roh: Array<Omit<Eintrag, 'nr'>> = []
  const ob = d.fahrweg.objekte

  // Tunnel anderer Bahnen aus swissTLM3D haben keine Länge und selten einen Namen
  // (Michael, 2026-09-26: RhB, MGB, MOB auf dem Blatt). Gleichnamige Teile
  // (Lötschberg-Basistunnel in vier Stücken) gelten als ein Tunnel.
  const tlmJe = new Map<string, FahrObjekt>()
  for (const o of ob.filter((x) => x.art === 'tunnel' && x.tlm && x.sAus !== null)) {
    const k = o.tlm!.name ?? o.kennung
    const alt = tlmJe.get(k)
    tlmJe.set(k, alt ? { ...alt, s: Math.min(alt.s, o.s), sAus: Math.max(alt.sAus!, o.sAus!) } : o)
  }
  // nach der Länge ihrer Zeichnung auf dem Weg: nur für die Auswahl, sie steht nirgends
  const gezeichnet = (x: FahrObjekt) => x.sAus! - x.s
  const tlmMitNamen = [...tlmJe.values()].filter((o) => o.tlm!.name).sort((a, b) => gezeichnet(b) - gezeichnet(a))
  const tlmOhneNamen = [...tlmJe.values()].filter((o) => !o.tlm!.name).sort((a, b) => gezeichnet(b) - gezeichnet(a))
  // zuerst bis zwei mit Namen (Lötschberg-Basistunnel), dann die längsten mit bekannter
  // Länge, dann weitere mit Namen, zuletzt die ohne
  const erste = tlmMitNamen.slice(0, TLM_TUNNEL_ZUERST)
  const tunnel = ob.filter((o) => o.art === 'tunnel' && !o.tlm && tunnelNach.get(o.kennung)?.laenge_m != null)
    .sort((a, b) => tunnelNach.get(b.kennung)!.laenge_m! - tunnelNach.get(a.kennung)!.laenge_m!)
    .slice(0, TUNNEL_MAX - erste.length)
  const tlmTunnel = [...erste, ...tlmMitNamen.slice(TLM_TUNNEL_ZUERST), ...tlmOhneNamen]
    .slice(0, TUNNEL_MAX - tunnel.length)
  for (const o of tunnel) {
    const t = tunnelNach.get(o.kennung)!
    roh.push({ o, art: 'tunnel', name: ohneKuerzel(t.name), zeile: `${zahl(t.laenge_m!)} m` })
  }
  for (const o of tlmTunnel) {
    const galerie = o.tlm!.art === 'galerie'
    roh.push({ o, art: 'tunnel', name: o.tlm!.name ?? (galerie ? 'Galerie' : 'Tunnel'),
               zeile: o.tlm!.name ? 'Länge nicht erfasst' : 'Name und Länge nicht erfasst' })
  }
  // Brücken mit den meisten Baueinheiten, ab 3
  const bruecken = ob.filter((o) => o.art === 'bruecke' && !o.tlm && (brueckenNach.get(o.kennung)?.baueinheiten ?? 0) >= BRUECKE_AB_BE)
    .sort((a, b) => brueckenNach.get(b.kennung)!.baueinheiten! - brueckenNach.get(a.kennung)!.baueinheiten!)
    .slice(0, BRUECKEN_MAX)
  for (const o of bruecken) {
    const b = brueckenNach.get(o.kennung)!
    roh.push({ o, art: 'bruecke', name: ohneKuerzel(b.name), zeile: `${b.baueinheiten} Baueinheiten` })
  }
  // dazu Brücken anderer Bahnen aus swissTLM3D, nur die mit Namen (Landwasserviadukt)
  const tlmBruecken = ob.filter((o) => o.art === 'bruecke' && o.tlm?.name).slice(0, BRUECKEN_MAX - bruecken.length)
  for (const o of tlmBruecken) roh.push({ o, art: 'bruecke', name: o.tlm!.name!, zeile: '' })
  // Bahnhöfe: alle, und sind es zu viele, zuerst die grossen, dann die mittleren
  const stufe = { L: 0, M: 1, S: 2 } as Record<string, number>
  const bhf = ob.filter((o) => o.art === 'bahnhof').map((o) => ({ o, b: bahnhof.get(uicVon.get(o.kennung) ?? 0) }))
    .filter((x) => x.b)
  const gewaehlt = bhf.length <= BAHNHOEFE_MAX ? bhf
    : [...bhf].sort((x, y) => (stufe[x.b!.tier] ?? 3) - (stufe[y.b!.tier] ?? 3)).slice(0, BAHNHOEFE_MAX)
  for (const { o, b } of gewaehlt) roh.push({ o, art: 'bahnhof', name: b!.name, zeile: '' })
  // Sehenswertes: die höchsten Gipfel, dazu Seilbahnen in Fahrtrichtung; keine
  // Kulturgüter, das sind meist Gebäude (Michael, 2026-09-26)
  const sw = ob.filter((o) => o.sehenswert && o.sehenswert.seite)
  const hoehe = (o: FahrObjekt) => Number((o.sehenswert!.zeile.match(/^([\d'’]+) m/)?.[1] ?? '0').replace(/['’]/g, ''))
  const gipfel = sw.filter((o) => o.sehenswert!.sorte === 'gipfel').sort((a, b) => hoehe(b) - hoehe(a)).slice(0, GIPFEL_MAX)
  const seilbahn = sw.filter((o) => o.sehenswert!.sorte === 'seilbahn').slice(0, SEILBAHN_MAX)
  for (const o of [...gipfel, ...seilbahn]) {
    const s = o.sehenswert!
    roh.push({ o, art: s.sorte as Eintrag['art'], name: s.name, seite: s.seite!,
               zeile: s.sorte === 'gipfel' ? s.zeile : 'Seilbahn' })
  }
  // zu viel für eine Seite: zuerst die kleinen Bahnhöfe weg, dann Seilbahnen, Gipfel,
  // Brücken und Tunnel, je die zuletzt gewählten
  const stufeVon = (e: Omit<Eintrag, 'nr'>) => stufe[bahnhof.get(uicVon.get(e.o.kennung) ?? 0)?.tier ?? ''] ?? 3
  const reihe = [
    ...roh.filter((e) => e.art === 'bahnhof').sort((a, b) => stufeVon(b) - stufeVon(a)),
    ...(['seilbahn', 'gipfel', 'bruecke', 'tunnel'] as const).flatMap((a) => roh.filter((e) => e.art === a).reverse()),
  ]
  const weg = new Set(reihe.slice(0, weniger))
  return roh.filter((e) => !weg.has(e)).sort((a, b) => a.o.s - b.o.s).map((e, i) => ({ ...e, nr: i + 1 }))
}

/**
 * Seen entlang des Wegs, jeder See einmal (Michael, 2026-09-26: der Schiffenensee
 * stand links und rechts doppelt da). Sind es zu viele, die, an denen der Weg am
 * längsten entlangführt, laut den Uferstücken; gezeigt in Fahrtrichtung.
 */
function seenAmWeg(fw: Fahrweg) {
  const je = new Map<string, { name: string; seiten: Set<'links' | 'rechts'>; s: number; meter: number }>()
  for (const u of fw.seeUfer ?? []) {
    if (!u.name) continue
    const x = je.get(u.name) ?? { name: u.name, seiten: new Set(), s: u.s0, meter: 0 }
    x.seiten.add(u.seite)
    x.s = Math.min(x.s, u.s0)
    x.meter += u.s1 - u.s0
    je.set(u.name, x)
  }
  return [...je.values()].sort((a, b) => b.meter - a.meter).slice(0, SEEN_MAX).sort((a, b) => a.s - b.s)
    .map((x) => ({ name: x.name, seite: x.seiten.size > 1 ? 'links und rechts' : [...x.seiten][0] }))
}

function Blatt({ daten, eintraege, zuViel }: { daten: Daten; eintraege: Eintrag[]; zuViel: () => void }) {
  const unten = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = unten.current
    if (el && el.scrollHeight > el.clientHeight + 1) zuViel()
  })
  // auf dem Handy verkleinert zeigen, gedruckt in voller Grösse
  const rahmen = useRef<HTMLDivElement | null>(null)
  const blatt = useRef<HTMLDivElement | null>(null)
  const flaeche = useRef<HTMLDivElement | null>(null)
  const [massstab, setMassstab] = useState(1)
  const [hoehe, setHoehe] = useState(0)
  const [karte, setKarte] = useState<[number, number]>([0, 0])
  useLayoutEffect(() => {
    const el = rahmen.current
    if (!el) return
    const neu = () => {
      setMassstab(Math.min(1, el.clientWidth / BLATT_PX))
      setHoehe(blatt.current?.offsetHeight ?? 0)
      const f = flaeche.current
      if (f) setKarte([f.clientWidth, f.clientHeight])
    }
    neu()
    const ro = new ResizeObserver(neu)
    ro.observe(el)
    if (flaeche.current) ro.observe(flaeche.current)
    return () => ro.disconnect()
  }, [])
  const seen = seenAmWeg(daten.fahrweg)
  const gruppe = (arten: Eintrag['art'][]) => eintraege.filter((e) => arten.includes(e.art))
  const tunnel = gruppe(['tunnel'])
  const bahnhoefe = gruppe(['bahnhof', 'bruecke'])
  const sehen = gruppe(['gipfel', 'seilbahn'])

  return (
    <div ref={rahmen} className="fahrtblatt-rahmen mt-6 print:mt-0" style={{ height: hoehe * massstab || undefined }}>
      <div ref={blatt} id="fahrtblatt" className="fahrtblatt origin-top-left bg-white p-4 text-black shadow print:p-0 print:shadow-none"
           style={{ width: BLATT_PX, transform: `scale(${massstab})` }}>
        <div className="flex flex-col" style={{ height: BLATT_HOCH_PX }}>
          {/* obere Hälfte: die Karte */}
          <div className="flex flex-col" style={{ height: BLATT_HOCH_PX / 2 }}>
            <div className="flex items-end justify-between gap-4 border-b-2 border-black pb-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide">Taktland · Fahrtblatt</p>
                <p className="truncate text-2xl font-bold leading-tight">{daten.titel[0]} → {daten.titel[1]}</p>
              </div>
              <div className="shrink-0 text-sm leading-7">
                <p>Datum: ____________</p>
                <p>Name: _____________</p>
              </div>
            </div>
            <div ref={flaeche} className="mt-2 min-h-0 flex-1">
              {karte[1] > 0 && <Karten daten={daten} eintraege={eintraege} B={karte[0]} H={karte[1]} />}
            </div>
            <Legende eintraege={eintraege} seen={seen.length > 0} />
          </div>

          {/* untere Hälfte: zum Ausfüllen */}
          <div ref={unten} className="flex min-h-0 flex-1 flex-col pt-3">
            <p className="text-[12px] leading-snug">
              Hake ab, was du unterwegs entdeckst. Bei jedem Tunnel: Schätze vorher, wie viele Sekunden es
              dunkel bleibt, und zähle dann mit. Die Zahlen in den Listen gehören zu den Zahlen auf der Karte.
            </p>
            {tunnel.length > 0 && (
              <Liste titel="Tunnel">
                {tunnel.map((e) => (
                  <li key={e.nr} className="flex items-center gap-2 border-b border-dotted border-neutral-400 py-px">
                    <Kaestchen />
                    <Nummer e={e} />
                    <Pikto art="tunnel" className="size-5" />
                    <span className="min-w-0 flex-1 truncate">{e.name} · {e.zeile}</span>
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
                    {seen.map((s) => (
                      <li key={s.name + s.seite} className="flex items-center gap-2 border-b border-dotted border-neutral-400 py-px">
                        <Kaestchen />
                        <span className="min-w-0 truncate">{s.name} · {s.seite}</span>
                      </li>
                    ))}
                  </Liste>
                )}
              </div>
            </div>
            <div className="mt-3 min-h-10 flex-1 border-2 border-black p-2 text-[13px]">
              Das habe ich aus dem Fenster gesehen:
            </div>
            <p className="mt-2 text-[9.5px] leading-snug">
              Auswahl nach Zahlen aus den Daten: die {TUNNEL_MAX} längsten Tunnel mit bekannter Länge, Brücken ab
              {' '}{BRUECKE_AB_BE} Baueinheiten, bei vielen Bahnhöfen die grossen, die {GIPFEL_MAX} höchsten Gipfel bis 8 km neben
              der Strecke, die {SEEN_MAX} Seen, an denen der Weg am längsten entlangführt. Links und rechts in Fahrtrichtung
              laut Daten; ob man es vom Zug aus sieht, sagen sie nicht.
              {daten.ohneLaenge > 0 && ` Tunnel anderer Bahnen (swissTLM3D) haben in den Daten keine Länge und meist keinen`
                + ` Namen: Zuerst stehen bis ${TLM_TUNNEL_ZUERST} mit Namen, fehlen Tunnel mit Länge, die längsten laut`
                + ' Zeichnung; Brücken anderer Bahnen nur mit Namen.'}
              {' '}Quellen: SBB Open Data (data.sbb.ch), Bundesamt für Verkehr BAV, swisstopo. Taktland ist ein
              privates Lernprojekt und kein Angebot einer Bundes- oder Privatbahn.
            </p>
          </div>
        </div>
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
    <li className="flex items-center gap-2 border-b border-dotted border-neutral-400 py-px">
      <Kaestchen />
      <Nummer e={e} />
      {(e.art === 'bahnhof' || e.art === 'bruecke') && <Pikto art={e.art} className="size-5" />}
      {/* ist der Name lang, wird er gekürzt; Art und Seite bleiben sichtbar */}
      <span className="min-w-0 truncate">{e.name}</span>
      <span className="shrink-0">
        {e.zeile && <> · {e.zeile}</>}
        {e.seite && <> · {e.seite}</>}
        {e.art === 'bruecke' && ' · Brücke'}
      </span>
    </li>
  )
}

/** in der Farbe der Art, wie auf der Karte */
function Nummer({ e }: { e: Eintrag }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: FARBE[e.art], printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
      {e.nr}
    </span>
  )
}

/** Was die Farben auf der Karte bedeuten, nur was auf diesem Blatt vorkommt */
function Legende({ eintraege, seen }: { eintraege: Eintrag[]; seen: boolean }) {
  const hat = (a: Eintrag['art']) => eintraege.some((e) => e.art === a)
  const sehen = [hat('gipfel') && 'Gipfel', hat('seilbahn') && 'Seilbahn'].filter(Boolean)
  const punkt = (farbe: string) => (
    <span className="inline-block size-3 shrink-0 rounded-full" style={{ backgroundColor: farbe, printColorAdjust: 'exact' }} />
  )
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]" aria-label="Legende">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-[3px] w-5" style={{ backgroundColor: WEG, printColorAdjust: 'exact' }} />Strecke
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block size-3 border-2 border-black bg-white" />Start und Ziel
      </li>
      {hat('tunnel') && (
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-[7px] w-5" style={{ backgroundColor: FARBE.tunnel, printColorAdjust: 'exact' }} />Tunnel
        </li>
      )}
      {hat('bruecke') && <li className="flex items-center gap-1.5">{punkt(FARBE.bruecke)}Brücke</li>}
      {hat('bahnhof') && <li className="flex items-center gap-1.5">{punkt(FARBE.bahnhof)}Bahnhof</li>}
      {sehen.length > 0 && <li className="flex items-center gap-1.5">{punkt(FARBE.gipfel)}{sehen.join(', ')}</li>}
      {seen && (
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5" style={{ backgroundColor: SEE, printColorAdjust: 'exact' }} />See
        </li>
      )}
    </ul>
  )
}

/** Ausschnitt der Karte in projizierten Grad (Länge × cos φ, −Breite) */
interface Box { x0: number; x1: number; y0: number; y1: number }

function projektion(kx: number, box: Box, B: number, H: number, rand: number) {
  const m = Math.min((B - 2 * rand) / (box.x1 - box.x0 || 1e-6), (H - 2 * rand) / (box.y1 - box.y0 || 1e-6))
  const ox = (B - (box.x1 - box.x0) * m) / 2, oy = (H - (box.y1 - box.y0) * m) / 2
  return {
    m,
    pt: (lat: number, lon: number) => [ox + (lon * kx - box.x0) * m, oy + (-lat - box.y0) * m] as const,
    zurueck: (x: number, y: number) => [box.x0 + (x - ox) / m, box.y0 + (y - oy) / m] as const,
    /** projizierte Grad auf das Blatt */
    hin: (x: number, y: number) => [ox + (x - box.x0) * m, oy + (y - box.y0) * m] as const,
  }
}
type Projektion = ReturnType<typeof projektion>

/** Wo die Nummer steht: auf der Strecke, Sehenswertes etwas zur Seite in Fahrtrichtung */
function marke(fw: Fahrweg, p: Projektion, e: Eintrag) {
  const [x, y, nx, ny] = ortUndNormale(fw, p, e)
  if (!e.seite) return [x, y] as const
  const k = e.seite === 'links' ? 1 : -1
  return [x + k * nx * 16, y + k * ny * 16] as const
}

/** Ort auf der Strecke und die Richtung nach links in Fahrtrichtung, als Einheitsvektor */
function ortUndNormale(fw: Fahrweg, p: Projektion, e: Eintrag) {
  const l = lageBei(fw, e.o.s)
  const [x, y] = p.pt(l.lat, l.lon)
  // Richtung aus 200 m davor und danach, am Ende des Wegs gibt es kein Danach
  const [a, z] = [lageBei(fw, Math.max(0, e.o.s - 200)), lageBei(fw, Math.min(wegEnde(fw), e.o.s + 200))]
  const [ax, ay] = p.pt(a.lat, a.lon), [zx, zy] = p.pt(z.lat, z.lon)
  const dx = zx - ax, dy = zy - ay, d = Math.hypot(dx, dy) || 1
  // links in Fahrtrichtung ist auf dem Blatt (y nach unten) die Normale (dy, -dx)
  return [x, y, dy / d, -dx / d] as const
}

/**
 * Nummern, die sich ganz decken würden, weiter zur Seite schieben: Sehenswertes
 * weiter hinaus auf seiner Seite, Punkte auf der Strecke abwechselnd links und
 * rechts. Ein feiner Strich führt dann zum Ort.
 */
function platzieren(fw: Fahrweg, p: Projektion, eintraege: Eintrag[], B: number, H: number) {
  const gesetzt: Array<{ e: Eintrag; x: number; y: number; ox: number; oy: number }> = []
  const frei = (x: number, y: number) => x > 10 && x < B - 10 && y > 10 && y < H - 10
    && gesetzt.every((g) => Math.hypot(g.x - x, g.y - y) >= ENG_PX)
  for (const e of eintraege) {
    const [ox, oy, nx, ny] = ortUndNormale(fw, p, e)
    const [x0, y0] = marke(fw, p, e)
    // Sehenswertes zuerst weiter hinaus auf seiner Seite, dann auf der anderen
    const k = e.seite === 'rechts' ? -1 : 1
    const weiten = e.seite ? [16 + ENG_PX, 16 + 2 * ENG_PX, 16 + 3 * ENG_PX, -ENG_PX, -2 * ENG_PX]
      : [ENG_PX, -ENG_PX, 2 * ENG_PX, -2 * ENG_PX, 3 * ENG_PX, -3 * ENG_PX]
    const wahl = frei(x0, y0) ? [x0, y0]
      : weiten.map((w) => [ox + k * nx * w, oy + k * ny * w]).find(([x, y]) => frei(x, y)) ?? [x0, y0]
    gesetzt.push({ e, x: wahl[0], y: wahl[1], ox, oy })
  }
  return gesetzt
}

/**
 * Die Stellen, an denen sich Nummern überdecken, als Ausschnitte in projizierten
 * Grad, die dichteste zuerst, höchstens zwei (Michael, 2026-09-26).
 */
function dichteStellen(fw: Fahrweg, p: Projektion, eintraege: Eintrag[]): Box[] {
  const pos = eintraege.map((e) => marke(fw, p, e))
  const abstand = (i: number, j: number) => Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1])
  // je enger, desto schlimmer: eine ganz verdeckte Nummer zählt am meisten
  const enge = (i: number, frei: Set<number>) =>
    [...frei].reduce((sum, j) => (j !== i && abstand(i, j) < ENG_PX ? sum + ENG_PX - abstand(i, j) : sum), 0)
  const frei = new Set(pos.map((_, i) => i))
  const raus: Box[] = []
  while (raus.length < 2) {
    let best = -1, bestWert = 0
    for (const i of frei) { const w = enge(i, frei); if (w > bestWert) { best = i; bestWert = w } }
    if (best < 0) break
    const mit = [...frei].filter((j) => abstand(best, j) < AUSSCHNITT_PX)
    for (const j of mit) frei.delete(j)
    const [ax, ay] = p.zurueck(Math.min(...mit.map((j) => pos[j][0])), Math.min(...mit.map((j) => pos[j][1])))
    const [bx, by] = p.zurueck(Math.max(...mit.map((j) => pos[j][0])), Math.max(...mit.map((j) => pos[j][1])))
    raus.push({ x0: ax, x1: bx, y0: ay, y1: by })
  }
  return raus
}

/** Eine Karte des ganzen Wegs und, wo sich Nummern drängen, ein vergrösserter Ausschnitt */
function Karten({ daten, eintraege, B, H }: { daten: Daten; eintraege: Eintrag[]; B: number; H: number }) {
  const fw = daten.fahrweg
  const RAND = 30, LUECKE = 8
  const lat0 = fw.punkte.reduce((s, q) => s + q.lat, 0) / fw.punkte.length
  const kx = Math.cos((lat0 * Math.PI) / 180)
  const xs = fw.punkte.map((q) => q.lon * kx), ys = fw.punkte.map((q) => -q.lat)
  const ganz: Box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }

  type Teil = { x: number; y: number; w: number; h: number; box: Box; ausschnitte?: Box[]; istAusschnitt?: boolean }
  let teile: Teil[] = [{ x: 0, y: 0, w: B, h: H, box: ganz }]
  if (dichteStellen(fw, projektion(kx, ganz, B, H, RAND), eintraege).length) {
    // breiter Weg: Ausschnitte darunter, hoher Weg: daneben
    const breit = (ganz.x1 - ganz.x0) / (ganz.y1 - ganz.y0 || 1e-6) > B / H
    const haupt = breit ? { x: 0, y: 0, w: B, h: Math.round(H * 0.6) } : { x: 0, y: 0, w: Math.round(B * 0.6), h: H }
    const p = projektion(kx, ganz, haupt.w, haupt.h, RAND)
    const stellen = dichteStellen(fw, p, eintraege)
    if (stellen.length) {
      // zwei Ausschnitte teilen sich den Platz: nebeneinander unter einem breiten Weg, übereinander neben einem hohen
      const n = stellen.length
      const platz = (i: number) => breit
        ? { x: i * ((B + LUECKE) / n), y: haupt.h + LUECKE, w: (B - (n - 1) * LUECKE) / n, h: H - haupt.h - LUECKE }
        : { x: haupt.w + LUECKE, y: i * ((H + LUECKE) / n), w: B - haupt.w - LUECKE, h: (H - (n - 1) * LUECKE) / n }
      const neben = stellen.map((stelle, i) => {
        const pl = platz(i)
        // nicht stärker vergrössern als AUSSCHNITT_MAX_ZOOM, sonst fehlt der Zusammenhang
        const mMax = p.m * AUSSCHNITT_MAX_ZOOM
        const cx = (stelle.x0 + stelle.x1) / 2, cy = (stelle.y0 + stelle.y1) / 2
        // doppelt so gross wie die dichte Stelle, damit die Nachbarn mit drauf sind
        const w = Math.max((pl.w - 2 * RAND) / mMax, 2 * (stelle.x1 - stelle.x0))
        const h = Math.max((pl.h - 2 * RAND) / mMax, 2 * (stelle.y1 - stelle.y0))
        return { ...pl, box: { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 }, istAusschnitt: true }
      })
      // was jeder Ausschnitt tatsächlich zeigt, für die Rahmen auf der grossen Karte
      const gezeigt = neben.map((t) => {
        const q = projektion(kx, t.box, t.w, t.h, RAND)
        const [ax, ay] = q.zurueck(0, 0), [bx, by] = q.zurueck(t.w, t.h)
        return { x0: ax, y0: ay, x1: bx, y1: by }
      })
      teile = [{ ...haupt, box: ganz, ausschnitte: gezeigt }, ...neben]
    }
  }

  return (
    <svg viewBox={`0 0 ${B} ${H}`} className="block h-full w-full" role="img"
         aria-label={`Karte des Wegs ${daten.titel[0]} bis ${daten.titel[1]}`}>
      {teile.map((t, i) => (
        <svg key={i} x={t.x} y={t.y} width={t.w} height={t.h} viewBox={`0 0 ${t.w} ${t.h}`} overflow="hidden">
          <Karte daten={daten} eintraege={eintraege} B={t.w} H={t.h} p={projektion(kx, t.box, t.w, t.h, RAND)}
                 ausschnitte={t.ausschnitte?.map((a, j) => [a, 'AB'[j]] as const)}
                 ausschnittName={t.istAusschnitt ? `${'AB'[i - 1]} · Ausschnitt vergrössert` : undefined} />
        </svg>
      ))}
    </svg>
  )
}

/** Eine Karte, schwarz-weiss druckbar, mit Seen und nummerierten Punkten */
function Karte({ daten, eintraege, B, H, p, ausschnitte, ausschnittName }: {
  daten: Daten; eintraege: Eintrag[]; B: number; H: number; p: Projektion
  ausschnitte?: ReadonlyArray<readonly [Box, string]>; ausschnittName?: string
}) {
  const fw = daten.fahrweg
  const { pt } = p
  const drin = (x: number, y: number, r = 0) => x > -r && x < B + r && y > -r && y < H + r
  // etwa alle 3 Pixel ein Punkt, auch im vergrösserten Ausschnitt fein
  const schritt = Math.max(20, (3 * 111_000) / p.m)
  const linie = (von: number, bis: number) => {
    const raus: string[] = []
    for (let s = von; s < bis; s += schritt) {
      const l = lageBei(fw, s); const [x, y] = pt(l.lat, l.lon); raus.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
    const l = lageBei(fw, bis); const [x, y] = pt(l.lat, l.lon); raus.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    return raus.join(' ')
  }
  // Seen im Ausschnitt
  const seen = (daten.seen?.seen ?? []).flatMap((s) => s.ringe.map((r) => {
    let [la, lo] = r.start
    const q = [pt(la / 1e5, lo / 1e5)]
    for (let i = 0; i < r.d.length; i += 2) { la += r.d[i]; lo += r.d[i + 1]; q.push(pt(la / 1e5, lo / 1e5)) }
    return q
  })).filter((q) => q.some(([x, y]) => drin(x, y, 50)))
  const gesetzt = platzieren(fw, p, eintraege, B, H)
  const ende = wegEnde(fw)
  const enden = [[lageBei(fw, 0), daten.titel[0]], [lageBei(fw, ende), daten.titel[1]]] as const
  const rahmen = (ausschnitte ?? []).map(([a, name]) => {
    const [ax, ay] = p.hin(a.x0, a.y0), [bx, by] = p.hin(a.x1, a.y1)
    return { x: ax, y: ay, w: bx - ax, h: by - ay, name }
  })

  return (
    <>
      <rect x={0} y={0} width={B} height={H} fill="#fff" />
      {seen.map((q, i) => (
        <polygon key={i} points={q.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill={SEE} />
      ))}
      <polyline points={linie(0, ende)} fill="none" stroke={WEG} strokeWidth={3} strokeLinejoin="round" />
      {eintraege.filter((e) => e.art === 'tunnel' && e.o.sAus !== null).map((e) => (
        <polyline key={`t${e.nr}`} points={linie(e.o.s, e.o.sAus!)} fill="none" stroke={FARBE.tunnel} strokeWidth={7}
                  strokeLinecap="butt" />
      ))}
      {rahmen.map((r) => (
        <g key={r.name}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#000"
                strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={r.x + r.w + 3} y={r.y + 11} fontSize={12} fontWeight={700}
                stroke="#fff" strokeWidth={3} paintOrder="stroke">{r.name}</text>
        </g>
      ))}
      {enden.map(([l, n], i) => {
        const [x, y] = pt(l.lat, l.lon)
        if (!drin(x, y, 6)) return null
        const lage = namensLage(x, y, n, B, gesetzt)
        return (
          <g key={i}>
            <rect x={x - 6} y={y - 6} width={12} height={12} fill="#fff" stroke="#000" strokeWidth={2.5} />
            <text x={lage.x} y={lage.y} fontSize={15} textAnchor={lage.anker}
                  stroke="#fff" strokeWidth={4} paintOrder="stroke">{n}</text>
          </g>
        )
      })}
      {gesetzt.map(({ e, x, y, ox, oy }) => {
        if (!drin(x, y, 10)) return null
        // weggeschoben: ein Strich zum Ort, Sehenswertes erst ab seinem gewohnten Abstand
        const weg = Math.hypot(x - ox, y - oy) > (e.seite ? 20 : 4)
        return (
          <g key={e.nr}>
            {weg && <line x1={ox} y1={oy} x2={x} y2={y} stroke="#000" strokeWidth={0.8} />}
            <circle cx={x} cy={y} r={8} fill={FARBE[e.art]} stroke="#fff" strokeWidth={1.5} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{e.nr}</text>
          </g>
        )
      })}
      {ausschnittName && (
        <text x={8} y={17} fontSize={12} stroke="#fff" strokeWidth={4} paintOrder="stroke">{ausschnittName}</text>
      )}
      <Nordpfeil x={B - 20} y={8} />
      <rect x={1} y={1} width={B - 2} height={H - 2} fill="none" stroke="#000" strokeWidth={2} />
    </>
  )
}

/**
 * Wohin der Name von Start oder Ziel kommt: oben, unten, rechts oder links vom
 * Viereck, dorthin, wo keine Nummer steht. Die Breite ist geschätzt (15 px Schrift).
 */
function namensLage(x: number, y: number, n: string, B: number, nummern: Array<{ x: number; y: number }>) {
  const w = n.length * 8.2, h = 15
  const oben = { x, y: y - 12, anker: x < B * 0.2 ? 'start' : x > B * 0.8 ? 'end' : 'middle' } as const
  const moeglich = [
    oben,
    { ...oben, y: y + 23 },
    { x: x + 11, y: y + 5, anker: 'start' },
    { x: x - 11, y: y + 5, anker: 'end' },
  ] as const
  const kasten = (l: (typeof moeglich)[number]) => {
    const x0 = l.anker === 'start' ? l.x : l.anker === 'end' ? l.x - w : l.x - w / 2
    return { x0, x1: x0 + w, y0: l.y - h + 3, y1: l.y + 3 }
  }
  // wie viele Nummern der Name verdecken würde; ausserhalb der Karte zählt wie viele
  const verdeckt = (l: (typeof moeglich)[number]) => {
    const k = kasten(l)
    if (k.x0 < 0 || k.x1 > B || k.y0 < 0) return 99
    return nummern.filter((m) => !(m.x < k.x0 - 6 || m.x > k.x1 + 6 || m.y < k.y0 - 6 || m.y > k.y1 + 6)).length
  }
  return moeglich.reduce((best, l) => (verdeckt(l) < verdeckt(best) ? l : best), oben)
}

/** Die Karten sind genordet: oben ist Norden */
function Nordpfeil({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-label="Norden">
      <rect x={-12} y={-2} width={24} height={40} fill="#fff" opacity={0.85} />
      <text x={0} y={11} textAnchor="middle" fontSize={12} fontWeight={700}>N</text>
      <polygon points="0,14 7,34 0,29 -7,34" fill="#000" />
    </g>
  )
}
