/**
 * Bahnbetrieb im Gleisbau: beim ersten Öffnen zwei Fragen (Schwierigkeit und Sparte), dann die Aufträge nach Stufe und Sparte, Geld und Depot; dazu
 * das Blatt, auf dem man einen Zug aus Lok und Wagen zusammenstellt (gleisbauBetrieb.ts, gleisbauFahrzeuge.ts). Alles gewählt
 */
import { useEffect, useRef, useState } from 'react'
import { AUFTRAEGE, type Auftrag, auftragErzeugt, type Betrieb, brauchtWagen, frei, SPARTEN, type Sparte, STUFEN, type Stufe, stufeOffen, WIEDERHOLT_ANTEIL } from '../gleisbauBetrieb'
import { GUETER, type LokTyp, LOKS, type WagenTyp, WAGEN_ARTEN, type Zusammenstellung, MEHR_LOKS, zugkraftVon } from '../gleisbauFahrzeuge'

const chf = (n: number) => `CHF ${Math.round(n).toLocaleString('de-CH')}`
const KNOPF_ROT = 'min-h-11 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40'
const KNOPF_WEISS = 'min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight'
/** der kleine Knopf mit dem Preis (Michael, 2026-11-26: «Die Buttons mit den Preisen können kleiner sein») */
const KNOPF_PREIS = 'min-h-9 shrink-0 rounded-lg border border-sbb-cloud bg-white px-2 text-xs font-bold tabular-nums hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight'
/**
 * die Werte einer Lok als Zeichen (Michael, 2026-11-26: «ob wir die Antriebsart … als Icon hinterlegen, sowie auch die Kraftgeschwindigkeit», «Ja, baue das doch bitte
 * mal so»): Blitz für Strom, Tropfen für Diesel, ein Wagen mit der Zahl, die sie zieht, und fünf Balken fürs Tempo (1,0 ein Balken, je 0,3 mehr einer dazu, gewählt)
 */
export const tempoBalken = (l: LokTyp) => Math.max(1, Math.min(5, 1 + Math.round((LOKS[l].tempo - 1) / 0.3)))
const ZEICHEN = 'size-4 shrink-0'
function Blitz() { return <svg viewBox="0 0 16 16" className={ZEICHEN} aria-hidden="true"><path d="M9.5 1 3.5 9h4l-1 6 6-8h-4z" fill="currentColor" /></svg> }
function Tropfen() { return <svg viewBox="0 0 16 16" className={ZEICHEN} aria-hidden="true"><path d="M8 1.5C6 5 3.8 7.4 3.8 10a4.2 4.2 0 0 0 8.4 0C12.2 7.4 10 5 8 1.5z" fill="currentColor" /></svg> }
function WagenZeichen() {
  return <svg viewBox="0 0 16 16" className={ZEICHEN} aria-hidden="true"><rect x="1.5" y="4" width="13" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="5" cy="12.8" r="1.3" fill="currentColor" /><circle cx="11" cy="12.8" r="1.3" fill="currentColor" /></svg>
}
function Balken({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 22 16" className="h-4 w-[1.375rem] shrink-0" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((k) => <rect key={k} x={k * 4.4 + 0.5} y={12 - k * 2.4} width="3.2" height={3 + k * 2.4} rx="0.6" fill="currentColor" opacity={k < n ? 1 : 0.22} />)}
    </svg>
  )
}
export function LokWerte({ l }: { l: LokTyp }) {
  const d = LOKS[l].diesel, n = tempoBalken(l)
  return (
    <span className="inline-flex items-center gap-2.5 align-middle" aria-label={`${d ? 'Diesel' : 'Strom'}, zieht ${LOKS[l].zugkraft} Wagen, Tempo ${n} von 5`}>
      <span title={d ? 'Diesel: fährt auch ohne Fahrleitung' : 'Strom: braucht Fahrleitung'}>{d ? <Tropfen /> : <Blitz />}</span>
      <span className="inline-flex items-center gap-0.5 font-bold tabular-nums" title={`zieht höchstens ${LOKS[l].zugkraft} Wagen`}><WagenZeichen />{LOKS[l].zugkraft}</span>
      <span title={`Tempo ${n} von 5`}><Balken n={n} /></span>
    </span>
  )
}
/** einmal erklärt, was die Zeichen heissen */
export function LokLegende() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sbb-metal dark:text-sbb-storm">
      <span className="inline-flex items-center gap-1"><Blitz />Strom</span>
      <span className="inline-flex items-center gap-1"><Tropfen />Diesel, auch ohne Fahrleitung</span>
      <span className="inline-flex items-center gap-1"><WagenZeichen />zieht so viele Wagen</span>
      <span className="inline-flex items-center gap-1"><Balken n={3} />Tempo</span>
    </span>
  )
}
const SEGMENT = (an: boolean) => `min-h-10 rounded-lg px-3 text-sm font-bold ${an ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black' : 'bg-white dark:bg-sbb-charcoal'}`

function Sterne({ n }: { n: number }) {
  return <span className="whitespace-nowrap" aria-label={`${n} von 3 Sternen`}>{[0, 1, 2].map((k) => <span key={k} className={k < n ? 'text-sbb-red' : 'text-[#b4b4b4] dark:text-sbb-iron'}>★</span>)}</span>
}

/** eine Lok oder ein Wagen als kleines Bild von der Seite (gewählt) */
export function FahrzeugBild({ lok, wagen, klasse = 'h-6 w-14' }: { lok?: LokTyp; wagen?: WagenTyp; klasse?: string }) {
  if (lok) {
    const f = LOKS[lok].farbe
    return (
      <svg viewBox="0 0 60 24" className={`${klasse} flex-none`} aria-hidden="true">
        <rect x={4} y={6} width={50} height={13} rx={3} fill={f} stroke="#2f2f2f" strokeWidth={1} />
        <rect x={44} y={8} width={8} height={5} rx={1} fill="#1f2a36" />
        {!LOKS[lok].diesel && <path d="M22,6 L30,1 L38,1" stroke="#3a3a3a" strokeWidth={1.4} fill="none" />}
        {LOKS[lok].diesel && <rect x={14} y={3} width={8} height={3} fill="#4a4a4a" />}
        {[12, 22, 38, 48].map((x) => <circle key={x} cx={x} cy={20} r={2.5} fill="#2f2f2f" />)}
      </svg>
    )
  }
  const t = wagen ?? 'person'
  const farbe: Record<WagenTyp, string> = { person: '#f4f4f4', rungen: '#5f6266', schuett: '#7d7f82', kessel: '#262626', milch: '#f4f4f0', container: '#2f6fb0', auto: '#9a9a9a', gedeckt: '#8a4b32' }
  return (
    <svg viewBox="0 0 60 24" className={`${klasse} flex-none`} aria-hidden="true">
      {t === 'kessel' || t === 'milch'
        ? <rect x={4} y={6} width={52} height={12} rx={6} fill={farbe[t]} stroke="#2f2f2f" strokeWidth={1} />
        : <rect x={4} y={t === 'rungen' || t === 'auto' ? 13 : 6} width={52} height={t === 'rungen' || t === 'auto' ? 5 : 12} rx={2} fill={farbe[t]} stroke="#2f2f2f" strokeWidth={1} />}
      {t === 'person' && [10, 20, 30, 40].map((x) => <rect key={x} x={x} y={8} width={7} height={4} rx={1} fill="#2e3a44" />)}
      {t === 'rungen' && [0, 1, 2].map((k) => <rect key={k} x={6} y={10 - k * 2.2} width={48} height={2.5} rx={1.2} fill="#a0703f" />)}
      {t === 'auto' && [12, 36].map((x) => <rect key={x} x={x} y={8} width={14} height={5} rx={2} fill="#c43c2c" />)}
      {t === 'milch' && <rect x={6} y={11} width={48} height={2} fill="#3c7bc0" />}
      {[12, 22, 38, 48].map((x) => <circle key={x} cx={x} cy={20} r={2.5} fill="#2f2f2f" />)}
    </svg>
  )
}

/** die Fragen beim ersten Öffnen: Schwierigkeit, dann Sparte */
function Start({ betrieb, setBetrieb }: { betrieb: Betrieb; setBetrieb: (b: Betrieb) => void }) {
  const [schritt, setSchritt] = useState(0)
  const [stufe, setStufe] = useState<Stufe>('leicht')
  const karte = (an: boolean) => `grid gap-1 rounded-lg p-4 text-left ${an ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black' : 'kachel'}`
  return (
    <div className="mt-4 max-w-xl">
      {schritt === 0 && (
        <div className="kachel grid gap-3 p-5">
          <p className="text-xl font-bold">Willkommen im Bahnbetrieb</p>
          <p className="leading-relaxed">Du führst eine kleine Bahn. Jeder Auftrag bringt Lohn, deine Gleise kosten. Mit dem Gewinn kaufst du im Depot neue Loks und Wagen.
            Ein Personenwagen hat 4 Plätze für Fahrgäste. Eine Ladung ist ein voller Güterwagen: Holz auf dem Rungenwagen, Milch im Milchwagen, jedes Gut braucht seinen Wagen.</p>
          <p className="text-sm text-sbb-metal dark:text-sbb-storm">Zum Start: {chf(betrieb.geld)}, die Rangierlok Murmeli, die Regionallok Libelle, drei Personenwagen, zwei Rungenwagen und zwei Schüttgutwagen.</p>
          <button type="button" onClick={() => setSchritt(1)} className={KNOPF_ROT}>Los geht's</button>
        </div>
      )}
      {schritt === 1 && (
        <div className="grid gap-2">
          <p className="text-lg font-bold">Wie schwierig soll es sein?</p>
          {(['leicht', 'mittel', 'schwer'] as Stufe[]).map((s) => (
            <button key={s} type="button" onClick={() => { setStufe(s); setSchritt(2) }} className={karte(false)}>
              <span className="font-bold">{STUFEN[s]}</span>
              <span className="text-sm">{s === 'leicht' ? 'Kleine Bretter, zwei oder drei Orte. Zum Einsteigen.' : s === 'mittel' ? 'Berge, Seen und Wagen, die man zuerst kaufen muss.' : 'Grosse Netze, viel Verkehr, knappe Kasse. Für Bahnfreaks.'}</span>
              {!stufeOffen(betrieb, s) && <span className="text-xs">Noch zu: zuerst zwei Aufträge der Stufe davor. Du kannst sie trotzdem wählen und später hinein.</span>}
            </button>
          ))}
        </div>
      )}
      {schritt === 2 && (
        <div className="grid gap-2">
          <p className="text-lg font-bold">Was möchtest du fahren?</p>
          {(['personen', 'gueter', 'mix'] as Sparte[]).map((s) => (
            <button key={s} type="button" onClick={() => setBetrieb({ ...betrieb, stufe, sparte: s })} className={karte(false)}>
              <span className="font-bold">{s === 'personen' ? 'Personen' : s === 'gueter' ? 'Güter' : 'Mix'}</span>
              <span className="text-sm">{s === 'personen' ? 'Pendler, Schulkinder, ganze Städte: Fahrgäste ans Ziel bringen.' : s === 'gueter' ? 'Holz, Kies, Milch, Container, Heizöl und Autos von Anlage zu Anlage.' : 'Beides zugleich auf einem Netz.'}</span>
            </button>
          ))}
          <button type="button" onClick={() => setSchritt(1)} className={`${KNOPF_WEISS} justify-self-start`}>Zurück</button>
        </div>
      )}
    </div>
  )
}

/**
 * was ein Fahrzeug beim Verkauf bringt: drei Viertel des Preises, auf 100 gerundet, mindestens 100 (Michael, 2026-11-26: «Gekaufte Artikel können auch wieder
 * verkauft werden. Einnahmen zwischen ca. 70 und 80% der Ausgaben. Gerundet auf den nächsten 100er»)
 */
export const verkaufswert = (preis: number) => Math.max(100, Math.round((preis * 0.75) / 100) * 100)
/** wie viele eines Fahrzeugs in einem gesetzten Zug stecken (der grösste Bedarf über alle Aufträge; die Züge der Aufträge teilen sich das Depot) */
function imEinsatz(b: Betrieb, typ: string, lok: boolean): number {
  let m = 0
  for (const zz of Object.values(b.zuege)) {
    let n = 0
    for (const z of Object.values(zz)) n += lok ? [z.lok, ...(z.mehr ?? [])].filter((x) => x === typ).length : z.wagen.filter((w) => w === typ).length
    m = Math.max(m, n)
  }
  return m
}

/** das Depot: oben ein Kasten mit allem, was man hat, zum Verkaufen; darunter alles zum Kaufen */
function Depot({ betrieb, setBetrieb }: { betrieb: Betrieb; setBetrieb: (b: Betrieb) => void }) {
  const kaufen = (preis: number, lok?: LokTyp, wagen?: WagenTyp) => {
    if (betrieb.geld < preis) return
    setBetrieb({ ...betrieb, geld: betrieb.geld - preis, loks: lok ? [...betrieb.loks, lok] : betrieb.loks, wagen: wagen ? { ...betrieb.wagen, [wagen]: (betrieb.wagen[wagen] ?? 0) + 1 } : betrieb.wagen })
  }
  const verkaufen = (lok?: LokTyp, wagen?: WagenTyp) => {
    if (lok) { const k = betrieb.loks.indexOf(lok); if (k < 0) return; setBetrieb({ ...betrieb, geld: betrieb.geld + verkaufswert(LOKS[lok].preis), loks: betrieb.loks.filter((_, m) => m !== k) }) }
    if (wagen && (betrieb.wagen[wagen] ?? 0) > 0) setBetrieb({ ...betrieb, geld: betrieb.geld + verkaufswert(WAGEN_ARTEN[wagen].preis), wagen: { ...betrieb.wagen, [wagen]: (betrieb.wagen[wagen] ?? 0) - 1 } })
  }
  const lokTypen = Object.keys(LOKS) as LokTyp[], wagenTypen = (Object.keys(WAGEN_ARTEN) as WagenTyp[]).filter((w) => w !== 'gedeckt')
  const besitz = [
    ...lokTypen.map((l) => ({ key: l, lok: l as LokTyp, wagen: undefined as WagenTyp | undefined, name: LOKS[l].name, n: betrieb.loks.filter((x) => x === l).length, preis: LOKS[l].preis, einsatz: imEinsatz(betrieb, l, true) })),
    ...wagenTypen.map((w) => ({ key: w, lok: undefined as LokTyp | undefined, wagen: w as WagenTyp | undefined, name: WAGEN_ARTEN[w].name, n: betrieb.wagen[w] ?? 0, preis: WAGEN_ARTEN[w].preis, einsatz: imEinsatz(betrieb, w, false) })),
  ].filter((x) => x.n > 0)
  // je Fahrzeug: Bild, Name und Anzahl im Depot, was es kann, darunter rechts der Knopf zum Kaufen (auf dem Handy sonst zu eng)
  const zeile = (key: string, bild: React.ReactNode, titel: string, text: React.ReactNode, besitz: number, preis: number, kauf: () => void) => (
    <li key={key} className="kachel flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
      {bild}
      <div className="min-w-[10rem] flex-1">
        <p className="font-bold">{titel}</p>
        <p className="text-sm text-sbb-metal dark:text-sbb-storm">{text}</p>
        {besitz > 0 && <p className="text-sm font-bold">{besitz} im Depot</p>}
      </div>
      <button type="button" disabled={betrieb.geld < preis} aria-label={`${titel} kaufen für ${chf(preis)}`} onClick={kauf} className={`${KNOPF_PREIS} ml-auto`}>{chf(preis)}</button>
    </li>
  )
  return (
    <div className="mt-3 grid gap-4">
      {/* der Kasten mit allem Gekauften (Michael, 2026-11-26: «Was man gekauft hat muss ersichtlich sein indem man ein Kasten mit Depot sieht») */}
      <section className="rounded-lg border-2 border-sbb-anthracite p-3 dark:border-sbb-white">
        <h3 className="font-bold">Dein Depot</h3>
        {!besitz.length && <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">Noch leer. Unten kaufst du Loks und Wagen.</p>}
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {besitz.map((x) => {
            const frei = x.n - x.einsatz
            return (
              <li key={x.key} className="flex items-center gap-2 rounded-lg bg-sbb-milk px-2 py-1.5 text-sm dark:bg-sbb-midnight">
                {x.lok ? <FahrzeugBild lok={x.lok} /> : <FahrzeugBild wagen={x.wagen} />}
                <span className="min-w-0 flex-1 leading-tight"><span className="font-bold">{x.n} × {x.name}</span>
                  {x.einsatz > 0 && <span className="block text-xs text-sbb-metal dark:text-sbb-storm">{x.einsatz} in einem Zug eingesetzt</span>}</span>
                <button type="button" disabled={frei <= 0} title={frei <= 0 ? 'Steckt in einem Zug: zuerst dort entfernen' : undefined}
                        aria-label={`${x.name} verkaufen für ${chf(verkaufswert(x.preis))}`} onClick={() => verkaufen(x.lok, x.wagen)} className={KNOPF_PREIS}>
                  Verkaufen {chf(verkaufswert(x.preis))}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-sbb-metal dark:text-sbb-storm">Beim Verkauf gibt es etwa drei Viertel des Preises zurück, auf 100 gerundet.</p>
      </section>
      {/* was ein Zug ist, in drei Sätzen (Michael, 2026-11-26: «Das Kaufen von Wagen muss verständlicher sein») */}
      <div className="kachel p-3 text-sm leading-relaxed">
        <p><span className="font-bold">So entsteht ein Zug:</span> eine Lok zieht Wagen, jede Lok nur so viele, wie bei ihr steht.</p>
        <p className="mt-1"><span className="font-bold">Personenwagen:</span> 4 Plätze für Fahrgäste. <span className="font-bold">Güterwagen:</span> trägt 1 Ladung, und nur das Gut, für das er gebaut ist.</p>
        <p className="mt-1">Im Auftrag tippst du unten auf «Züge» und ziehst Lok und Wagen in den Zug; was fehlt, wird dabei gekauft. Danach tippst du aufs Gleis, wo der Zug stehen soll.</p>
      </div>
      <h3 className="-mb-2 text-lg font-bold">Kaufen</h3>
      <section>
        <h4 className="font-bold">Loks</h4>
        <div className="mt-1"><LokLegende /></div>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {lokTypen.map((l) => zeile(l, <FahrzeugBild lok={l} />, `${LOKS[l].name}`,
            <><span className="flex flex-wrap items-center gap-x-2">{LOKS[l].art} <LokWerte l={l} /></span>{LOKS[l].text}</>,
            betrieb.loks.filter((x) => x === l).length, LOKS[l].preis, () => kaufen(LOKS[l].preis, l)))}
        </ul>
      </section>
      <section>
        <h4 className="font-bold">Wagen</h4>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {wagenTypen.map((w) => zeile(w, <FahrzeugBild wagen={w} />, WAGEN_ARTEN[w].name,
            WAGEN_ARTEN[w].text, betrieb.wagen[w] ?? 0, WAGEN_ARTEN[w].preis, () => kaufen(WAGEN_ARTEN[w].preis, undefined, w)))}
        </ul>
      </section>
    </div>
  )
}

/** die Seite des Bahnbetriebs: Fragen beim ersten Mal, sonst Aufträge und Depot */
export default function BetriebSeite({ betrieb, setBetrieb, oeffnen, depot, setDepot }: {
  betrieb: Betrieb; setBetrieb: (b: Betrieb) => void; oeffnen: (a: Auftrag) => void; depot: boolean; setDepot: (d: boolean) => void
}) {
  const [stufe, setStufe] = useState<Stufe>(betrieb.stufe ?? 'leicht')
  const [sparte, setSparte] = useState<Sparte | 'alle'>(betrieb.sparte ?? 'alle')
  if (!betrieb.stufe || !betrieb.sparte) return <Start betrieb={betrieb} setBetrieb={(b) => { setBetrieb(b); setStufe(b.stufe ?? 'leicht'); setSparte(b.sparte ?? 'alle') }} />
  const liste = AUFTRAEGE.filter((a) => a.stufe === stufe && (sparte === 'alle' || a.sparte === sparte))
  const offen = stufeOffen(betrieb, stufe)
  return (
    <div className="mt-4 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        {/* Aufträge oder Depot, oben sichtbar, wo man ist (Michael, 2026-11-26: «Ist man im Depot oder in den Aufträgen muss dies oben auch so stehen») */}
        <div className="segmente grid grid-cols-2" role="group" aria-label="Aufträge oder Depot">
          <button type="button" aria-pressed={!depot} onClick={() => setDepot(false)} className="segment px-4 py-2">Aufträge</button>
          <button type="button" aria-pressed={depot} onClick={() => setDepot(true)} className="segment px-4 py-2">Depot</button>
        </div>
        <span className="rounded-lg bg-sbb-anthracite px-3 py-2 font-bold tabular-nums text-white dark:bg-sbb-white dark:text-sbb-black">{chf(betrieb.geld)}</span>
        <span className="text-sm text-sbb-metal dark:text-sbb-storm">{betrieb.loks.length} Loks, {Object.values(betrieb.wagen).reduce((a, c) => a + (c ?? 0), 0)} Wagen</span>
      </div>
      {depot ? <Depot betrieb={betrieb} setBetrieb={setBetrieb} /> : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Schwierigkeit">
            {(['leicht', 'mittel', 'schwer'] as Stufe[]).map((s) => <button key={s} type="button" onClick={() => setStufe(s)} className={SEGMENT(stufe === s)}>{STUFEN[s]}{stufeOffen(betrieb, s) ? '' : ' 🔒'}</button>)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Sparte">
            {(['alle', 'personen', 'gueter', 'mix'] as Array<Sparte | 'alle'>).map((s) => <button key={s} type="button" onClick={() => setSparte(s)} className={SEGMENT(sparte === s)}>{s === 'alle' ? 'Alle' : SPARTEN[s]}</button>)}
          </div>
          {!offen && <p className="mt-3 text-sm">Diese Stufe öffnet sich nach zwei erfüllten Aufträgen der Stufe davor.</p>}
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {liste.map((a) => {
              const fehlt = brauchtWagen(a).filter((w) => !(frei(betrieb, []).wagen[w] ?? 0))
              const erledigt = betrieb.erledigt[a.id] ?? 0
              return (
                <li key={a.id}>
                  <button type="button" disabled={!offen} onClick={() => oeffnen(a)} className="kachel grid w-full gap-1 p-3 text-left disabled:opacity-50">
                    <span className="flex items-start justify-between gap-2"><span className="font-bold">{a.titel}</span><Sterne n={erledigt} /></span>
                    <span className="text-sm leading-snug">{a.text}</span>
                    <span className="text-sm font-bold">{SPARTEN[a.sparte]} · Lohn {chf(erledigt ? a.lohn * WIEDERHOLT_ANTEIL : a.lohn)}{erledigt ? ' (wiederholt, ein Viertel)' : ''}</span>
                    {fehlt.length > 0 && <span className="text-sm font-bold text-sbb-red">Braucht {fehlt.map((w) => WAGEN_ARTEN[w].name).join(', ')}: im Depot oder beim Einsetzen des Zugs kaufen</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {/* weitere Aufträge, erzeugt, sobald alle vorbereiteten erfüllt sind (Michael, 2026-11-27: «Wenn alle Aufträge im Bahnbetrieb gelöst sind, soll man
              weitere generieren können») */}
          {(() => {
            const n = betrieb.erzeugt ?? 0, erzeugte = Array.from({ length: n }, (_, k) => auftragErzeugt(k + 1))
            const alleFertig = AUFTRAEGE.every((a) => betrieb.erledigt[a.id]) && erzeugte.every((a) => betrieb.erledigt[a.id])
            if (!n && !alleFertig) return null
            return (
              <section className="mt-5">
                <p className="font-bold">Weitere Aufträge</p>
                <ul className="mt-2 grid gap-2 md:grid-cols-2">
                  {erzeugte.slice().reverse().map((a) => {
                    const erledigt = !!betrieb.erledigt[a.id]
                    return (
                      <li key={a.id}>
                        <button type="button" onClick={() => oeffnen(a)} className="kachel grid w-full gap-1 p-3 text-left">
                          <span className="flex items-start justify-between gap-2"><span className="font-bold">{a.titel}</span>{erledigt && <span className="font-bold">✓</span>}</span>
                          <span className="text-sm leading-snug">{a.text}</span>
                          <span className="text-sm font-bold">{STUFEN[a.stufe]} · {SPARTEN[a.sparte]} · Lohn {chf(erledigt ? a.lohn * WIEDERHOLT_ANTEIL : a.lohn)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {alleFertig
                  ? <button type="button" onClick={() => setBetrieb({ ...betrieb, erzeugt: n + 1 })} className={`mt-3 ${KNOPF_ROT}`}>Neuer Auftrag</button>
                  : <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">Erfülle zuerst den letzten, dann gibt es einen neuen.</p>}
              </section>
            )
          })()}
          <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
            Stufe und Sparte: <button type="button" className="underline" onClick={() => setBetrieb({ ...betrieb, stufe: null, sparte: null })}>neu wählen</button>.
            Orte, Anlagen, Loks und Preise sind erfunden.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * das Blatt zum Zusammenstellen eines Zugs. Seit 2026-11-26 mit Ziehen und Ablegen (Michael: «Diese Auswahl muss interaktiv mit Drag & Drop aufgebaut werden. Ich
 * stelle mir jedenfalls für den Desktop vor, dass man oben leere Felder hat und die verschiedenen Modelle darauf zieht und immer gleich den Preis und die Kapazitäten
 * im Total sieht»): oben der Zug als Reihe von Plätzen (Lok, dann so viele Wagen, wie sie zieht), darunter alle Loks und Wagen; ziehen oder antippen legt ein
 * Fahrzeug in den Zug, aus dem Zug hinausziehen oder antippen nimmt es weg; was nicht im Depot steht, wird beim Bestätigen gekauft; daneben immer die Summe:
 * Kosten, Fahrgäste, Ladungen, Geld danach. Mit Zeiger-Ereignissen, so geht es mit Maus, Finger und Stift
 */
type Ziehen = { art: 'lok' | 'wagen'; typ: string; x: number; y: number; vonPlatz?: number; vonMehr?: number; bewegt: boolean; x0: number; y0: number }
export function ZugWahl({ betrieb, setBetrieb, auftrag, andere, anfang, setzen, entfernen, zu }: {
  /** ohne Auftrag (beim freien Bauen): alle Loks und Wagen, ohne Geld und Depot (seit 2026-11-26; Michael: «beim freien Bauen auf alle Züge ohne Grenzen Zugriff») */
  betrieb?: Betrieb; setBetrieb?: (f: (b: Betrieb) => Betrieb) => void; auftrag?: Auftrag; andere: Zusammenstellung[]; anfang: Zusammenstellung | null
  setzen: (z: Zusammenstellung) => void; entfernen: () => void; zu: () => void
}) {
  const offen = !auftrag || !betrieb
  const f = offen ? { loks: [] as LokTyp[], wagen: {} as Partial<Record<WagenTyp, number>> } : frei(betrieb, andere)
  const [lok, setLok] = useState<LokTyp | null>(anfang?.lok ?? null)
  const [wagen, setWagen] = useState<WagenTyp[]>(anfang?.wagen ?? [])
  // weitere Loks hinter der ersten, abgelegt auf dem Feld «+» zwischen Lok und erstem Wagen (Michael, 2026-11-27: «Bei den Dropfeldern soll zwischen dem Feld
  // «Lok» und dem ersten «Wagen»-Feld ein + sein, dort kann man eine weitere Lok platzieren»)
  const [mehr, setMehr] = useState<LokTyp[]>(anfang?.mehr ?? [])
  const [zieh, setZieh] = useState<Ziehen | null>(null)
  const ziehRef = useRef<Ziehen | null>(null)
  const zugkraft = lok ? zugkraftVon([lok, ...mehr]) : 0
  const n = (w: WagenTyp) => wagen.filter((x) => x === w).length
  const braucht = auftrag ? brauchtWagen(auftrag) : []
  const loks = Object.keys(LOKS) as LokTyp[]
  const wagenArten = (Object.keys(WAGEN_ARTEN) as WagenTyp[]).filter((w) => w !== 'gedeckt')
    .sort((a, b) => Number(braucht.includes(b)) - Number(braucht.includes(a)))
  // was gekauft werden muss: die Lok, wenn keine freie da ist, und Wagen über die freien hinaus
  const lokKaufListe = (() => {
    if (offen || !lok) return [] as LokTyp[]
    const da = [...f.loks], raus: LokTyp[] = []
    for (const l of [lok, ...mehr]) { const k = da.indexOf(l); if (k >= 0) da.splice(k, 1); else raus.push(l) }
    return raus
  })()
  const lokKauf = lokKaufListe.reduce((a, l) => a + LOKS[l].preis, 0)
  const wagenKauf = offen ? 0 : wagenArten.reduce((a, w) => a + Math.max(0, n(w) - (f.wagen[w] ?? 0)) * WAGEN_ARTEN[w].preis, 0)
  const kosten = lokKauf + wagenKauf, danach = offen ? 0 : betrieb.geld - kosten
  const plaetze = n('person') * WAGEN_ARTEN.person.plaetze
  const ladungen = wagenArten.filter((w) => w !== 'person' && n(w)).map((w) => `${n(w)} ${GUETER[WAGEN_ARTEN[w].gut!].name}`)
  const fehlt = braucht.filter((w) => !n(w))
  const lokWahl = (l: LokTyp) => { setLok(l); setWagen((w) => w.slice(0, zugkraftVon([l, ...mehr]))) }
  const mehrDazu = (l: LokTyp) => { if (!lok || mehr.length >= MEHR_LOKS) return; setMehr((m) => [...m, l]) }
  const mehrWeg = (k: number) => { const neu = mehr.filter((_, n) => n !== k); setMehr(neu); if (lok) setWagen((w) => w.slice(0, zugkraftVon([lok, ...neu]))) }
  const wagenDazu = (w: WagenTyp, an?: number) => setWagen((l) => {
    if (!lok || l.length >= zugkraft && an === undefined) return l
    const neu = [...l]
    if (an !== undefined && an < neu.length) neu[an] = w
    else if (neu.length < zugkraft) neu.push(w)
    return neu
  })
  const ablegen = (z: Ziehen, ziel: string | null) => {
    // ein Fahrzeug aus dem Zug: daneben abgelegt nimmt es weg, auf einem anderen Wagenplatz tauscht es
    if (z.vonMehr !== undefined) { if (ziel !== 'mehr') mehrWeg(z.vonMehr); return }
    if (z.art === 'lok' && ziel === 'mehr') { mehrDazu(z.typ as LokTyp); return }
    if (z.vonPlatz !== undefined) {
      if (ziel === null || ziel === 'lok' || ziel === 'mehr') { setWagen((l) => l.filter((_, k) => k !== z.vonPlatz)); return }
      const nach = Number(ziel)
      setWagen((l) => { const neu = [...l]; const [x] = neu.splice(z.vonPlatz!, 1); neu.splice(Math.min(nach, neu.length), 0, x); return neu })
      return
    }
    if (z.art === 'lok') { if (ziel !== null) lokWahl(z.typ as LokTyp); return }
    if (ziel !== null && ziel !== 'lok' && ziel !== 'mehr') wagenDazu(z.typ as WagenTyp, Number(ziel))
  }
  // Ziehen über das ganze Fenster verfolgen
  useEffect(() => {
    if (!zieh) return
    const bewegen = (e: PointerEvent) => {
      const z = ziehRef.current
      if (!z) return
      const neu = { ...z, x: e.clientX, y: e.clientY, bewegt: z.bewegt || Math.hypot(e.clientX - z.x0, e.clientY - z.y0) > 6 }
      ziehRef.current = neu; setZieh(neu)
    }
    const los = (e: PointerEvent) => {
      const z = ziehRef.current
      ziehRef.current = null; setZieh(null)
      if (!z) return
      if (!z.bewegt) {
        // ein Tipp: aus der Auswahl in den Zug, aus dem Zug hinaus
        if (z.vonMehr !== undefined) mehrWeg(z.vonMehr)
        else if (z.vonPlatz !== undefined) setWagen((l) => l.filter((_, k) => k !== z.vonPlatz))
        else if (z.art === 'lok') lokWahl(z.typ as LokTyp)
        else wagenDazu(z.typ as WagenTyp)
        return
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-platz]') as HTMLElement | null
      ablegen(z, el?.dataset.platz ?? null)
    }
    window.addEventListener('pointermove', bewegen)
    window.addEventListener('pointerup', los)
    window.addEventListener('pointercancel', los)
    return () => { window.removeEventListener('pointermove', bewegen); window.removeEventListener('pointerup', los); window.removeEventListener('pointercancel', los) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!zieh, lok, zugkraft, mehr])
  const greifen = (e: React.PointerEvent, art: 'lok' | 'wagen', typ: string, vonPlatz?: number, vonMehr?: number) => {
    e.preventDefault()
    const z: Ziehen = { art, typ, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, vonPlatz, vonMehr, bewegt: false }
    ziehRef.current = z; setZieh(z)
  }
  const bestaetigen = () => {
    if (!lok || !wagen.length || danach < 0) return
    // was fehlt, jetzt kaufen
    if (kosten > 0 && setBetrieb) setBetrieb((b) => {
      const fb = frei(b, andere), w2 = { ...b.wagen }
      for (const w of wagenArten) { const mehr = Math.max(0, n(w) - (fb.wagen[w] ?? 0)); if (mehr) w2[w] = (w2[w] ?? 0) + mehr }
      return { ...b, geld: b.geld - kosten, loks: [...b.loks, ...lokKaufListe], wagen: w2 }
    })
    setzen({ lok, wagen, ...(mehr.length ? { mehr } : {}) })
  }
  const platzKlasse = (aktiv: boolean) => `flex h-16 w-24 flex-none flex-col items-center justify-center rounded-lg border-2 border-dashed text-xs ${aktiv
    ? 'border-sbb-red bg-sbb-red/5' : 'border-sbb-cloud dark:border-sbb-iron'}`
  const karte = 'flex touch-none select-none items-center gap-2 rounded-lg bg-sbb-milk px-2 py-1.5 text-left text-sm cursor-grab active:cursor-grabbing dark:bg-sbb-midnight'
  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) zu() }}>
      <div className="max-h-[90%] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-sbb-charcoal" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-lg font-bold">Zug zusammenstellen</p>
          {!offen && <span className="rounded-lg bg-sbb-milk px-2 py-0.5 text-sm font-bold tabular-nums dark:bg-sbb-midnight">{chf(betrieb.geld)}</span>}
        </div>
        {offen ? <p className="mt-1 text-sm leading-snug">Alle Loks und Wagen, ohne Kosten. Zieh Lok und Wagen in die leeren Felder oder tippe sie an.</p> : <p className="mt-1 text-sm leading-snug">
          Für diesen Auftrag brauchst du: {braucht.map((w) => <span key={w} className="font-bold">{WAGEN_ARTEN[w].name} ({w === 'person' ? `${WAGEN_ARTEN.person.plaetze} Plätze` : `1 Ladung ${GUETER[WAGEN_ARTEN[w].gut!].name}`})</span>)
            .flatMap((x, k) => (k ? [', ', x] : [x]))}. Zieh Lok und Wagen in die leeren Felder oder tippe sie an.
        </p>}
        {/* der Zug: eine Reihe von Plätzen auf einem Gleis */}
        <div className="mt-3 flex gap-4 lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              <div data-platz="lok" className={platzKlasse(!!zieh?.bewegt && zieh.art === 'lok')}>
                {lok ? (
                  <button type="button" onPointerDown={(e) => greifen(e, 'lok', lok)} className="flex touch-none flex-col items-center" title="Andere Lok: eine andere hierher ziehen">
                    <FahrzeugBild lok={lok} klasse="h-9 w-20" /><span className="font-bold">{LOKS[lok].name}</span>
                  </button>
                ) : <span className="text-sbb-metal dark:text-sbb-storm">Lok</span>}
              </div>
              {lok && mehr.map((l, k) => (
                <div key={`m${k}`} className={platzKlasse(false)}>
                  <button type="button" onPointerDown={(e) => greifen(e, 'lok', l, undefined, k)} className="flex touch-none flex-col items-center" title="Antippen oder hinausziehen nimmt sie weg">
                    <FahrzeugBild lok={l} klasse="h-9 w-20" /><span className="font-bold">{LOKS[l].name}</span>
                  </button>
                </div>
              ))}
              {lok && mehr.length < MEHR_LOKS && (
                <div data-platz="mehr" title="Eine weitere Lok hierher ziehen" aria-label="Weitere Lok"
                     className={`flex h-16 w-10 flex-none items-center justify-center rounded-lg border-2 border-dashed text-2xl font-bold ${zieh?.bewegt && zieh.art === 'lok' ? 'border-sbb-red bg-sbb-red/5 text-sbb-red' : 'border-sbb-cloud text-sbb-metal dark:border-sbb-iron dark:text-sbb-storm'}`}>+</div>
              )}
              {Array.from({ length: lok ? zugkraft : 3 }, (_, k) => {
                const w = wagen[k]
                return (
                  <div key={k} data-platz={String(k)} className={`${platzKlasse(!!zieh?.bewegt && zieh.art === 'wagen' && !!lok)} ${lok ? '' : 'opacity-40'}`}>
                    {w ? (
                      <button type="button" onPointerDown={(e) => greifen(e, 'wagen', w, k)} className="flex touch-none flex-col items-center" title="Antippen oder hinausziehen nimmt ihn weg">
                        <FahrzeugBild wagen={w} klasse="h-9 w-20" /><span className="max-w-[5.5rem] truncate">{WAGEN_ARTEN[w].name}</span>
                      </button>
                    ) : <span className="text-sbb-metal dark:text-sbb-storm">{lok ? `Wagen ${k + 1}` : '—'}</span>}
                  </div>
                )
              })}
            </div>
            {!lok && <p className="text-sm text-sbb-metal dark:text-sbb-storm">Zuerst eine Lok: Sie bestimmt, wie viele Wagen Platz haben.</p>}
            {lok && mehr.length < MEHR_LOKS && <p className="text-sm text-sbb-metal dark:text-sbb-storm">Auf das + eine weitere Lok ziehen: mehr Zugkraft für mehr Wagen, das Tempo der langsameren.</p>}
          </div>
        </div>
        {/* die Summe, immer sichtbar */}
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-sbb-milk px-3 py-2 text-sm sm:grid-cols-4 dark:bg-sbb-midnight">
          {!offen && <span><span className="block text-xs text-sbb-metal dark:text-sbb-storm">Kosten</span><span className="font-bold tabular-nums">{kosten ? chf(kosten) : 'alles im Depot'}</span></span>}
          <span><span className="block text-xs text-sbb-metal dark:text-sbb-storm">Fahrgäste</span><span className="font-bold tabular-nums">{plaetze}</span></span>
          <span><span className="block text-xs text-sbb-metal dark:text-sbb-storm">Ladungen</span><span className="font-bold">{ladungen.length ? ladungen.join(', ') : '0'}</span></span>
          {!offen && <span><span className="block text-xs text-sbb-metal dark:text-sbb-storm">Geld danach</span><span className={`font-bold tabular-nums ${danach < 0 ? 'text-sbb-red' : ''}`}>{chf(danach)}</span></span>}
          {fehlt.length > 0 && <span className="col-span-full font-bold text-sbb-red">Es fehlt noch: {fehlt.map((w) => WAGEN_ARTEN[w].name).join(', ')}.</span>}
          {danach < 0 && <span className="col-span-full font-bold text-sbb-red">Dafür reicht das Geld nicht.</span>}
        </div>
        {/* zum Ziehen: alle Loks und Wagen */}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section>
            <p className="font-bold">Loks</p>
            <div className="mt-0.5"><LokLegende /></div>
            <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {loks.map((l) => {
                const da = f.loks.filter((x) => x === l).length - [lok, ...mehr].filter((x) => x === l).length
                return (
                  <li key={l}>
                    <button type="button" onPointerDown={(e) => greifen(e, 'lok', l)} className={`${karte} w-full ${lok === l ? 'ring-2 ring-sbb-anthracite dark:ring-sbb-white' : ''}`}>
                      <FahrzeugBild lok={l} />
                      <span className="min-w-0 flex-1 leading-tight"><span className="font-bold">{LOKS[l].name}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-sbb-metal dark:text-sbb-storm">{LOKS[l].art} <LokWerte l={l} /></span></span>
                      <span className="flex-none text-right text-xs tabular-nums">{lok === l || mehr.includes(l) ? (lokKaufListe.includes(l) ? `${chf(LOKS[l].preis)}, im Zug` : 'im Zug') : offen ? '' : da > 0 ? `${da} im Depot` : chf(LOKS[l].preis)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
          <section>
            <p className="font-bold">Wagen</p>
            <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {wagenArten.map((w) => {
                const da = (f.wagen[w] ?? 0) - n(w)
                return (
                  <li key={w}>
                    <button type="button" disabled={!lok} onPointerDown={(e) => lok && greifen(e, 'wagen', w)} className={`${karte} w-full disabled:cursor-not-allowed disabled:opacity-50 ${braucht.includes(w) ? 'ring-1 ring-sbb-red' : ''}`}>
                      <FahrzeugBild wagen={w} />
                      <span className="min-w-0 flex-1 leading-tight"><span className="font-bold">{WAGEN_ARTEN[w].name}</span>
                        <span className="block text-sbb-metal dark:text-sbb-storm">{WAGEN_ARTEN[w].text}</span></span>
                      <span className="flex-none text-right text-xs tabular-nums">{offen ? '' : da > 0 ? `${da} im Depot` : chf(WAGEN_ARTEN[w].preis)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={!lok || !wagen.length || danach < 0} onClick={bestaetigen} className={KNOPF_ROT}>{kosten ? `Kaufen und aufs Gleis stellen` : 'Zug aufs Gleis stellen'}</button>
          {anfang && <button type="button" onClick={entfernen} className={`${KNOPF_WEISS} text-sbb-red`}>Zug entfernen</button>}
          <button type="button" onClick={zu} className={KNOPF_WEISS}>Abbrechen</button>
        </div>
      </div>
      {/* das gezogene Fahrzeug folgt dem Zeiger */}
      {zieh?.bewegt && (
        <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/90 p-1 shadow-lg dark:bg-sbb-charcoal/90" style={{ left: zieh.x, top: zieh.y }}>
          {zieh.art === 'lok' ? <FahrzeugBild lok={zieh.typ as LokTyp} klasse="h-9 w-20" /> : <FahrzeugBild wagen={zieh.typ as WagenTyp} klasse="h-9 w-20" />}
        </div>
      )}
    </div>
  )
}
