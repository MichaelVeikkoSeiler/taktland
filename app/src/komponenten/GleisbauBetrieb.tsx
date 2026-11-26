/**
 * Bahnbetrieb im Gleisbau: beim ersten Öffnen zwei Fragen (Schwierigkeit und Sparte), dann die Aufträge nach Stufe und Sparte, Geld und Depot; dazu
 * das Blatt, auf dem man einen Zug aus Lok und Wagen zusammenstellt (gleisbauBetrieb.ts, gleisbauFahrzeuge.ts). Alles gewählt
 */
import { useState } from 'react'
import { AUFTRAEGE, type Auftrag, type Betrieb, brauchtWagen, frei, SPARTEN, type Sparte, STUFEN, type Stufe, stufeOffen, WIEDERHOLT_ANTEIL } from '../gleisbauBetrieb'
import { GUETER, type LokTyp, LOKS, type WagenTyp, WAGEN_ARTEN, type Zusammenstellung } from '../gleisbauFahrzeuge'

const chf = (n: number) => `CHF ${Math.round(n).toLocaleString('de-CH')}`
const KNOPF_ROT = 'min-h-11 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40'
const KNOPF_WEISS = 'min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight'
/** der kleine Knopf mit dem Preis (Michael, 2026-11-26: «Die Buttons mit den Preisen können kleiner sein») */
const KNOPF_PREIS = 'min-h-9 shrink-0 rounded-lg border border-sbb-cloud bg-white px-2 text-xs font-bold tabular-nums hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight'
/** Art und Antrieb einer Lok, immer gleich gebaut: «Güterlok, Diesel» (Michael, 2026-11-26: «Bitte nicht Diesel, Güterlok, sondern nur Güterlok und dann Diesel») */
const lokArt = (l: LokTyp) => `${LOKS[l].art}, ${LOKS[l].diesel ? 'Diesel' : 'Strom'}`
const SEGMENT = (an: boolean) => `min-h-10 rounded-lg px-3 text-sm font-bold ${an ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black' : 'bg-white dark:bg-sbb-charcoal'}`

function Sterne({ n }: { n: number }) {
  return <span className="whitespace-nowrap" aria-label={`${n} von 3 Sternen`}>{[0, 1, 2].map((k) => <span key={k} className={k < n ? 'text-sbb-red' : 'text-[#b4b4b4] dark:text-sbb-iron'}>★</span>)}</span>
}

/** eine Lok oder ein Wagen als kleines Bild von der Seite (gewählt) */
export function FahrzeugBild({ lok, wagen }: { lok?: LokTyp; wagen?: WagenTyp }) {
  if (lok) {
    const f = LOKS[lok].farbe
    return (
      <svg viewBox="0 0 60 24" className="h-6 w-14 flex-none" aria-hidden="true">
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
    <svg viewBox="0 0 60 24" className="h-6 w-14 flex-none" aria-hidden="true">
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

/** das Depot: Loks und Wagen kaufen */
function Depot({ betrieb, setBetrieb }: { betrieb: Betrieb; setBetrieb: (b: Betrieb) => void }) {
  const kaufen = (preis: number, lok?: LokTyp, wagen?: WagenTyp) => {
    if (betrieb.geld < preis) return
    setBetrieb({ ...betrieb, geld: betrieb.geld - preis, loks: lok ? [...betrieb.loks, lok] : betrieb.loks, wagen: wagen ? { ...betrieb.wagen, [wagen]: (betrieb.wagen[wagen] ?? 0) + 1 } : betrieb.wagen })
  }
  // je Fahrzeug: Bild, Name und Anzahl im Depot, was es kann, darunter rechts der Knopf zum Kaufen (auf dem Handy sonst zu eng)
  const zeile = (key: string, bild: React.ReactNode, titel: string, text: string, besitz: number, preis: number, kauf: () => void) => (
    <li key={key} className="kachel flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
      {bild}
      <div className="min-w-[10rem] flex-1">
        <p className="font-bold">{titel}</p>
        <p className="text-sm text-sbb-metal dark:text-sbb-storm">{text}</p>
        <p className="text-sm font-bold">{besitz ? `${besitz} im Depot` : 'keiner im Depot'}</p>
      </div>
      <button type="button" disabled={betrieb.geld < preis} aria-label={`${titel} kaufen für ${chf(preis)}`} onClick={kauf} className={`${KNOPF_PREIS} ml-auto`}>{chf(preis)}</button>
    </li>
  )
  return (
    <div className="mt-3 grid gap-4">
      {/* was ein Zug ist, in drei Sätzen (Michael, 2026-11-26: «Das Kaufen von Wagen muss verständlicher sein») */}
      <div className="kachel p-3 text-sm leading-relaxed">
        <p><span className="font-bold">So entsteht ein Zug:</span> eine Lok zieht Wagen, jede Lok nur so viele, wie bei ihr steht.</p>
        <p className="mt-1"><span className="font-bold">Personenwagen:</span> 4 Plätze für Fahrgäste. <span className="font-bold">Güterwagen:</span> trägt 1 Ladung, und nur das Gut, für das er gebaut ist.</p>
        <p className="mt-1">Gekauft steht alles hier im Depot. Im Auftrag tippst du mit «Zug einsetzen» auf ein Gleis und hängst Lok und Wagen an. Fehlt ein Wagen oder eine Lok, kaufst du sie auch dort mit einem Tipp auf den Preis.</p>
      </div>
      <section>
        <h3 className="font-bold">Loks</h3>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {(Object.keys(LOKS) as LokTyp[]).map((l) => zeile(l, <FahrzeugBild lok={l} />, `${LOKS[l].name}`,
            `${lokArt(l)}, zieht ${LOKS[l].zugkraft} Wagen, Tempo ${LOKS[l].tempo.toLocaleString('de-CH')}. ${LOKS[l].text}`,
            betrieb.loks.filter((x) => x === l).length, LOKS[l].preis, () => kaufen(LOKS[l].preis, l)))}
        </ul>
      </section>
      <section>
        <h3 className="font-bold">Wagen</h3>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {(Object.keys(WAGEN_ARTEN) as WagenTyp[]).filter((w) => w !== 'gedeckt').map((w) => zeile(w, <FahrzeugBild wagen={w} />, WAGEN_ARTEN[w].name,
            WAGEN_ARTEN[w].text, betrieb.wagen[w] ?? 0, WAGEN_ARTEN[w].preis, () => kaufen(WAGEN_ARTEN[w].preis, undefined, w)))}
        </ul>
      </section>
    </div>
  )
}

/** die Seite des Bahnbetriebs: Fragen beim ersten Mal, sonst Aufträge und Depot */
export default function BetriebSeite({ betrieb, setBetrieb, oeffnen }: { betrieb: Betrieb; setBetrieb: (b: Betrieb) => void; oeffnen: (a: Auftrag) => void }) {
  const [depot, setDepot] = useState(false)
  const [stufe, setStufe] = useState<Stufe>(betrieb.stufe ?? 'leicht')
  const [sparte, setSparte] = useState<Sparte | 'alle'>(betrieb.sparte ?? 'alle')
  if (!betrieb.stufe || !betrieb.sparte) return <Start betrieb={betrieb} setBetrieb={(b) => { setBetrieb(b); setStufe(b.stufe ?? 'leicht'); setSparte(b.sparte ?? 'alle') }} />
  const liste = AUFTRAEGE.filter((a) => a.stufe === stufe && (sparte === 'alle' || a.sparte === sparte))
  const offen = stufeOffen(betrieb, stufe)
  return (
    <div className="mt-4 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-sbb-anthracite px-3 py-2 font-bold tabular-nums text-white dark:bg-sbb-white dark:text-sbb-black">{chf(betrieb.geld)}</span>
        <button type="button" onClick={() => setDepot((x) => !x)} aria-expanded={depot} className={KNOPF_WEISS}>{depot ? 'Zu den Aufträgen' : 'Depot'}</button>
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
 * das Blatt zum Zusammenstellen eines Zugs: eine freie Lok und Wagen, so viele sie zieht. Seit 2026-11-26 klarer (Michael: «Das Konzept mit dem Auswählen der
 * richtigen Züge mit Wagen muss klarer sein … Das Kaufen von Wagen muss verständlicher sein und auch das Einsetzen deren im Spielfeld»): in zwei Schritten,
 * was der Auftrag braucht, je Wagen, was er trägt, fehlende Wagen gleich hier kaufen, darunter, was der ganze Zug trägt
 */
export function ZugWahl({ betrieb, setBetrieb, auftrag, andere, anfang, setzen, entfernen, zu }: {
  betrieb: Betrieb; setBetrieb: (f: (b: Betrieb) => Betrieb) => void; auftrag: Auftrag; andere: Zusammenstellung[]; anfang: Zusammenstellung | null
  setzen: (z: Zusammenstellung) => void; entfernen: () => void; zu: () => void
}) {
  const f = frei(betrieb, andere)
  const [lok, setLok] = useState<LokTyp | null>(anfang?.lok ?? f.loks[0] ?? null)
  const [wagen, setWagen] = useState<WagenTyp[]>(anfang?.wagen ?? [])
  const zugkraft = lok ? LOKS[lok].zugkraft : 0
  const n = (w: WagenTyp) => wagen.filter((x) => x === w).length
  // alle Loks: freie zum Wählen, die übrigen blass mit «Kaufen» (Michael, 2026-11-26: «Ja, bitte setzt das so mal um», auf: alle fünf im Blatt, die nicht gekauften blass)
  const loks = Object.keys(LOKS) as LokTyp[]
  const lokFrei = (l: LokTyp) => f.loks.filter((x) => x === l).length
  const lokKaufen = (l: LokTyp) => {
    if (betrieb.geld < LOKS[l].preis) return
    setBetrieb((b) => (b.geld < LOKS[l].preis ? b : { ...b, geld: b.geld - LOKS[l].preis, loks: [...b.loks, l] }))
    setLok(l); setWagen((w) => w.slice(0, LOKS[l].zugkraft))
  }
  const braucht = brauchtWagen(auftrag)
  // was der Auftrag braucht zuerst, dann was im Depot steht
  const arten = (Object.keys(WAGEN_ARTEN) as WagenTyp[]).filter((w) => w !== 'gedeckt' && (braucht.includes(w) || (f.wagen[w] ?? 0) > 0 || n(w) > 0))
    .sort((a, b) => Number(braucht.includes(b)) - Number(braucht.includes(a)))
  const kaufen = (w: WagenTyp) => setBetrieb((b) => (b.geld < WAGEN_ARTEN[w].preis ? b
    : { ...b, geld: b.geld - WAGEN_ARTEN[w].preis, wagen: { ...b.wagen, [w]: (b.wagen[w] ?? 0) + 1 } }))
  const plaetze = n('person') * WAGEN_ARTEN.person.plaetze
  const traegt = [plaetze ? `${plaetze} Fahrgäste` : '', ...arten.filter((w) => w !== 'person' && n(w)).map((w) => `${n(w)} ${n(w) === 1 ? 'Ladung' : 'Ladungen'} ${GUETER[WAGEN_ARTEN[w].gut!].name}`)].filter(Boolean)
  const fehlt = braucht.filter((w) => !n(w))
  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) zu() }}>
      <div className="max-h-[85%] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-sbb-charcoal" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-lg font-bold">Zug zusammenstellen</p>
          <span className="rounded-lg bg-sbb-milk px-2 py-0.5 text-sm font-bold tabular-nums dark:bg-sbb-midnight">{chf(betrieb.geld)}</span>
        </div>
        <p className="mt-1 text-sm leading-snug">
          Für diesen Auftrag brauchst du: {braucht.map((w) => <span key={w} className="font-bold">{WAGEN_ARTEN[w].name} ({w === 'person' ? `${WAGEN_ARTEN.person.plaetze} Plätze` : `1 Ladung ${GUETER[WAGEN_ARTEN[w].gut!].name}`})</span>)
            .flatMap((x, k) => (k ? [', ', x] : [x]))}.
        </p>
        <p className="mt-3 font-bold">1. Lok wählen</p>
        <ul className="mt-1.5 grid gap-1.5">
          {loks.map((l) => {
            const da = lokFrei(l) > 0, besitzt = betrieb.loks.includes(l)
            const text = `${lokArt(l)}, zieht ${LOKS[l].zugkraft} Wagen`
            return (
              <li key={l}>
                {da ? (
                  <button type="button" aria-pressed={lok === l} onClick={() => { setLok(l); setWagen((w) => w.slice(0, LOKS[l].zugkraft)) }}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${lok === l ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black' : 'bg-sbb-milk dark:bg-sbb-midnight'}`}>
                    <FahrzeugBild lok={l} />
                    <span className="min-w-0 flex-1 leading-tight"><span className="font-bold">{LOKS[l].name}</span><span className="block opacity-80">{text}</span></span>
                    {lok === l && <span aria-hidden="true" className="font-bold">✓</span>}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-2 py-1 text-sm">
                    <span className="opacity-45"><FahrzeugBild lok={l} /></span>
                    <span className="min-w-0 flex-1 leading-tight text-sbb-metal dark:text-sbb-storm"><span className="font-bold">{LOKS[l].name}</span>
                      <span className="block">{text}{besitzt ? ' · fährt schon' : ''}</span></span>
                    <button type="button" disabled={betrieb.geld < LOKS[l].preis} aria-label={`${LOKS[l].name} kaufen für ${chf(LOKS[l].preis)}`} onClick={() => lokKaufen(l)} className={KNOPF_PREIS}>{chf(LOKS[l].preis)}</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-3 font-bold">2. Wagen anhängen <span className="font-medium text-sbb-metal dark:text-sbb-storm">({wagen.length} von {zugkraft})</span></p>
        <ul className="mt-1.5 grid gap-2">
          {arten.map((w) => {
            const frei = (f.wagen[w] ?? 0) - n(w)
            return (
              <li key={w} className="flex items-center gap-2">
                <FahrzeugBild wagen={w} />
                <span className="min-w-0 flex-1 text-sm leading-tight">
                  <span className="font-bold">{WAGEN_ARTEN[w].name}</span>
                  <span className="block text-sbb-metal dark:text-sbb-storm">{WAGEN_ARTEN[w].text} · {n(w) ? (frei > 0 ? `${n(w)} angehängt, ${frei} weitere im Depot` : `${n(w)} angehängt`) : frei > 0 ? `${frei} im Depot` : 'keiner im Depot'}</span>
                </span>
                {frei <= 0 && !n(w) ? (
                  <button type="button" disabled={betrieb.geld < WAGEN_ARTEN[w].preis} aria-label={`${WAGEN_ARTEN[w].name} kaufen für ${chf(WAGEN_ARTEN[w].preis)}`} onClick={() => kaufen(w)} className={KNOPF_PREIS}>{chf(WAGEN_ARTEN[w].preis)}</button>
                ) : (
                  <>
                    <button type="button" aria-label={`${WAGEN_ARTEN[w].name} weniger`} disabled={!n(w)} onClick={() => { const k = wagen.lastIndexOf(w); setWagen((l) => l.filter((_, m) => m !== k)) }} className={`${KNOPF_WEISS} w-11 px-0`}>−</button>
                    <span className="w-5 text-center font-bold tabular-nums">{n(w)}</span>
                    <button type="button" aria-label={`${WAGEN_ARTEN[w].name} mehr`} disabled={wagen.length >= zugkraft || frei <= 0}
                            onClick={() => setWagen((l) => [...l, w])} className={`${KNOPF_WEISS} w-11 px-0`}>+</button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
        {/* was der ganze Zug trägt */}
        <p className="mt-3 rounded-lg bg-sbb-milk px-3 py-2 text-sm leading-snug dark:bg-sbb-midnight">
          {lok ? <><span className="font-bold">Dein Zug:</span> {LOKS[lok].name}{wagen.length ? ` und ${wagen.length} Wagen` : ', noch ohne Wagen'}.
            {traegt.length ? ` Er trägt ${traegt.join(' und ')} auf einmal.` : ''}
            {fehlt.length ? <span className="block font-bold text-sbb-red">Es fehlt noch: {fehlt.map((w) => WAGEN_ARTEN[w].name).join(', ')}.</span> : null}</> : 'Wähle zuerst eine Lok.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={!lok || !wagen.length} onClick={() => lok && setzen({ lok, wagen })} className={KNOPF_ROT}>Zug aufs Gleis stellen</button>
          {anfang && <button type="button" onClick={entfernen} className={`${KNOPF_WEISS} text-sbb-red`}>Zug entfernen</button>}
          <button type="button" onClick={zu} className={KNOPF_WEISS}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}
