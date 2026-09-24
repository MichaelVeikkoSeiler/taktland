import { useMemo, useState } from 'react'
import { type ErlebtArt, heftLesen, schluesselVon } from '../erlebt'
import { kantonText } from '../kanton'

/** Ein durchfahrenes Objekt mit allem, was die Bilanz und das Quiz zeigen */
export interface BilanzObjekt {
  art: ErlebtArt
  /** wie im Sammelheft: «Linie:Stelle» oder die UIC */
  kennung: string
  name: string
  zeile: string
  laenge_m: number | null
  baueinheiten: number | null
  linie: number | null
  kanton: string | null
}

/** Brücken ab so vielen Baueinheiten stehen offen in der Liste, die übrigen eingeklappt */
const GROSSE_BRUECKE = 3
/** Höchstens so viele Fragen im Quiz */
const FRAGEN = 5
/** Werte, die weniger auseinanderliegen, werden nicht gegeneinander gefragt (CLAUDE.md, Regel 9) */
const MINDESTABSTAND = 0.05

const ART_TEXT: Record<ErlebtArt, [string, string]> = {
  tunnel: ['Tunnel', 'Tunnel'], bruecke: ['Brücke', 'Brücken'], bahnhof: ['Bahnhof', 'Bahnhöfe'],
}

/** Namen, die im Namen eines Bahnhofs seinen Kanton verraten */
const KANTONSNAMEN: Record<string, string[]> = {
  ZH: ['Zürich'], BE: ['Bern'], LU: ['Luzern'], UR: ['Uri'], SZ: ['Schwyz'], OW: ['Obwalden'],
  NW: ['Nidwalden'], GL: ['Glarus'], ZG: ['Zug'], FR: ['Fribourg', 'Freiburg'], SO: ['Solothurn'],
  BS: ['Basel'], BL: ['Basel'], SH: ['Schaffhausen'], AR: ['Appenzell'], AI: ['Appenzell'],
  SG: ['St. Gallen', 'St.Gallen'], GR: ['Graubünden'], AG: ['Aargau'], TG: ['Thurgau'],
  TI: ['Ticino', 'Tessin'], VD: ['Vaud', 'Waadt'], VS: ['Valais', 'Wallis'], NE: ['Neuchâtel'],
  GE: ['Genève', 'Genf'], JU: ['Jura'],
}

interface Frage {
  text: string
  antworten: string[]
  richtig: number
}

function mischen<T>(liste: T[]): T[] {
  const a = [...liste]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function deutlich(a: number, b: number) {
  return Math.abs(a - b) / Math.max(a, b) >= MINDESTABSTAND
}

/**
 * Fragen nur zu dieser Fahrt und nur zu dem, was darüber in der Liste steht:
 * Länge und Linie der Tunnel, Baueinheiten der offenen Brücken, Kanton der
 * Bahnhöfe und die Reihenfolge. Keine Glücksfragen: Längen und Baueinheiten
 * liegen mindestens 5 % auseinander, und keine Frage verrät ihre Antwort.
 */
function fragenBauen(offen: BilanzObjekt[]): Frage[] {
  const kandidaten: Frage[] = []
  const tunnel = offen.filter((o) => o.art === 'tunnel')
  const bruecken = offen.filter((o) => o.art === 'bruecke')
  const bahnhoefe = offen.filter((o) => o.art === 'bahnhof')
  const paar = (text: string, a: BilanzObjekt, b: BilanzObjekt, aRichtig: boolean): Frage => {
    const antworten = mischen([a.name, b.name])
    return { text, antworten, richtig: antworten.indexOf(aRichtig ? a.name : b.name) }
  }

  // Welcher Tunnel ist länger?
  const mitLaenge = mischen(tunnel.filter((t) => t.laenge_m !== null))
  for (let i = 0; i + 1 < mitLaenge.length && i < 4; i += 2) {
    const [a, b] = [mitLaenge[i], mitLaenge[i + 1]]
    if (a.name !== b.name && deutlich(a.laenge_m!, b.laenge_m!)) {
      kandidaten.push(paar('Welcher dieser Tunnel ist länger?', a, b, a.laenge_m! > b.laenge_m!))
    }
  }
  // Welche Brücke hat mehr Baueinheiten?
  const mitEinheiten = mischen(bruecken.filter((x) => x.baueinheiten !== null))
  for (let i = 0; i + 1 < mitEinheiten.length && i < 4; i += 2) {
    const [a, b] = [mitEinheiten[i], mitEinheiten[i + 1]]
    if (a.name !== b.name && deutlich(a.baueinheiten!, b.baueinheiten!)) {
      kandidaten.push(paar('Welche Brücke hat mehr Baueinheiten?', a, b, a.baueinheiten! > b.baueinheiten!))
    }
  }
  // Auf welcher Linie liegt dieser Tunnel?
  const linien = [...new Set(offen.map((o) => o.linie).filter((l): l is number => l !== null))]
  if (linien.length >= 2) {
    for (const t of mischen(tunnel.filter((x) => x.linie !== null)).slice(0, 2)) {
      if (t.name.includes(String(t.linie))) continue
      const andere = mischen(linien.filter((l) => l !== t.linie)).slice(0, 2)
      const antworten = mischen([t.linie!, ...andere]).map((l) => `Linie ${l}`)
      kandidaten.push({ text: `Auf welcher Linie liegt der ${t.name}?`, antworten,
                        richtig: antworten.indexOf(`Linie ${t.linie}`) })
    }
  }
  // In welchem Kanton liegt dieser Bahnhof?
  const kantone = [...new Set(bahnhoefe.map((b) => b.kanton).filter((k): k is string => !!k))]
  if (kantone.length >= 2) {
    for (const b of mischen(bahnhoefe.filter((x) => x.kanton)).slice(0, 2)) {
      // «Wo liegt Zug?» verriete die Antwort
      if ([b.kanton!, ...(KANTONSNAMEN[b.kanton!] ?? [])].some((n) => b.name.includes(n))) continue
      const andere = mischen(kantone.filter((k) => k !== b.kanton)).slice(0, 2)
      const antworten = mischen([b.kanton!, ...andere]).map(kantonText)
      kandidaten.push({ text: `Wo liegt der Bahnhof ${b.name}?`, antworten,
                        richtig: antworten.indexOf(kantonText(b.kanton!)) })
    }
  }
  // Was kam zuerst?
  const reihe = offen.filter((o, i) => offen.findIndex((x) => x.name === o.name) === i)
  if (reihe.length >= 4) {
    const [i, j] = mischen([...reihe.keys()]).slice(0, 2).sort((x, y) => x - y)
    kandidaten.push(paar('Was kam auf dieser Fahrt zuerst?', reihe[i], reihe[j], true))
  }
  // höchstens zwei Fragen derselben Art
  const zaehler = new Map<string, number>()
  return mischen(kandidaten).filter((f) => {
    const n = zaehler.get(f.text.split(' ')[1]) ?? 0
    zaehler.set(f.text.split(' ')[1], n + 1)
    return n < 2
  }).slice(0, FRAGEN)
}

/**
 * Nach dem Fahrtmodus: was auf dieser Fahrt durchfahren wurde, was davon neu
 * im Sammelheft ist, und ein kurzes Quiz dazu.
 */
export function FahrtBilanz({ titel, objekte, beginn, probe, schliessen }: {
  titel: string
  objekte: BilanzObjekt[]
  /** Beginn der Fahrt im Sammelheft; null bei der Probefahrt */
  beginn: number | null
  probe: boolean
  schliessen: () => void
}) {
  const heft = useMemo(() => heftLesen(), [])
  const neu = (o: BilanzObjekt) => beginn !== null
    && (heft.objekte[schluesselVon(o.art, o.kennung)]?.zeit ?? 0) >= beginn
  const offen = objekte.filter((o) => o.art !== 'bruecke' || (o.baueinheiten ?? 0) >= GROSSE_BRUECKE)
  const kleine = objekte.filter((o) => o.art === 'bruecke' && (o.baueinheiten ?? 0) < GROSSE_BRUECKE)
  const [fragen, setFragen] = useState<Frage[] | null>(null)
  const moeglich = useMemo(() => fragenBauen(offen).length >= 2, [objekte]) // eslint-disable-line react-hooks/exhaustive-deps

  const anzahl = (art: ErlebtArt) => objekte.filter((o) => o.art === art).length

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-sbb-white text-sbb-black
                    dark:bg-sbb-midnight dark:text-sbb-white" role="dialog" aria-label="Fahrtbilanz">
      <div className="mx-auto max-w-2xl px-4 pb-12 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">{probe ? 'Bilanz der Probefahrt' : 'Fahrtbilanz'}</p>
            <p className="truncate text-sm text-sbb-metal dark:text-sbb-storm">{titel}</p>
          </div>
          <button type="button" onClick={schliessen}
                  className="shrink-0 border border-sbb-cloud px-4 py-2 font-medium hover:border-sbb-black
                             dark:border-sbb-iron dark:hover:border-sbb-white">
            Schliessen
          </button>
        </div>

        {probe && (
          <p className="mt-3 border-l-2 border-sbb-red pl-3 text-sm">
            Die Probefahrt kommt nicht ins Sammelheft.
          </p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2">
          {(['tunnel', 'bruecke', 'bahnhof'] as const).map((a) => (
            <div key={a} className="border border-sbb-cloud px-3 py-3 dark:border-sbb-iron">
              <p className="text-3xl font-bold tabular-nums">{anzahl(a)}</p>
              <p className="text-sm text-sbb-metal dark:text-sbb-storm">
                {anzahl(a) === 1 ? ART_TEXT[a][0] : ART_TEXT[a][1]}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
          {objekte.length === 0
            ? 'Auf dieser Fahrt wurde nichts durchfahren, oder der Standort lag neben dem Weg.'
            : 'Durchfahren ab dem ersten Standort, gezählt, nicht gemessen.'}
        </p>

        {offen.length > 0 && (
          <ol className="mt-5 divide-y divide-sbb-cloud border border-sbb-cloud dark:divide-sbb-iron dark:border-sbb-iron">
            {offen.map((o) => (
              <li key={`${o.art}${o.kennung}`} className="flex items-start justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium">{o.name}</span>
                  <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                    {ART_TEXT[o.art][0]} · {o.zeile}
                  </span>
                </span>
                {neu(o) && (
                  <span className="shrink-0 bg-sbb-red px-2 py-0.5 text-xs font-bold text-white">neu</span>
                )}
              </li>
            ))}
          </ol>
        )}
        {kleine.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-sbb-metal underline underline-offset-2 dark:text-sbb-storm">
              {kleine.length} {kleine.length === 1 ? 'kleinere Brücke' : 'kleinere Brücken'} (unter{' '}
              {GROSSE_BRUECKE} Baueinheiten oder ohne Angabe)
            </summary>
            <p className="mt-2 leading-relaxed">{kleine.map((o) => o.name).join(' · ')}</p>
          </details>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-bold">Quiz zur Fahrt</h2>
          {!moeglich ? (
            <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
              Für ein Quiz war auf dieser Fahrt zu wenig dabei.
            </p>
          ) : fragen ? (
            <Quiz key={fragen.map((f) => f.text).join()} fragen={fragen} nochmals={() => setFragen(fragenBauen(offen))} />
          ) : (
            <>
              <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
                Fragen nur zu dem, was oben in der Liste steht.
              </p>
              <button type="button" onClick={() => setFragen(fragenBauen(offen))}
                      className="mt-3 bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125">
                Quiz starten
              </button>
            </>
          )}
        </section>

        <a href="#/sammelheft" onClick={schliessen}
           className="mt-8 flex items-center justify-between gap-3 border border-l-4 border-sbb-cloud
                      border-l-sbb-red px-4 py-3 hover:border-sbb-black hover:border-l-sbb-red
                      dark:border-sbb-iron dark:border-l-sbb-red">
          <span>
            <span className="block font-medium">Sammelheft und Protokoll deiner Fahrten</span>
            <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
              Alles, was du im Fahrtmodus durchfahren hast, und was noch fehlt
            </span>
          </span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  )
}

function Quiz({ fragen, nochmals }: { fragen: Frage[]; nochmals: () => void }) {
  const [nr, setNr] = useState(0)
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  const [richtig, setRichtig] = useState(0)

  if (nr >= fragen.length) {
    return (
      <div className="mt-3 border border-sbb-cloud px-4 py-4 dark:border-sbb-iron">
        <p className="text-2xl font-bold">{richtig} von {fragen.length} richtig</p>
        <button type="button" onClick={nochmals}
                className="mt-3 border border-sbb-cloud px-4 py-2 font-medium hover:border-sbb-black
                           dark:border-sbb-iron dark:hover:border-sbb-white">
          Neue Fragen
        </button>
      </div>
    )
  }
  const f = fragen[nr]
  return (
    <div className="mt-3 border border-sbb-cloud px-4 py-4 dark:border-sbb-iron">
      <p className="text-xs text-sbb-metal dark:text-sbb-storm">Frage {nr + 1} von {fragen.length}</p>
      <p className="mt-1 text-lg font-bold">{f.text}</p>
      <div className="mt-3 grid gap-2">
        {f.antworten.map((a, i) => {
          const zeigen = gewaehlt !== null
          const farbe = !zeigen ? 'border-sbb-cloud hover:border-sbb-black dark:border-sbb-iron dark:hover:border-sbb-white'
            : i === f.richtig ? 'border-sbb-green bg-sbb-green text-white'
            : i === gewaehlt ? 'border-sbb-red bg-sbb-red text-white' : 'border-sbb-cloud opacity-60 dark:border-sbb-iron'
          return (
            <button key={a} type="button" disabled={zeigen}
                    onClick={() => { setGewaehlt(i); if (i === f.richtig) setRichtig((r) => r + 1) }}
                    className={`border px-4 py-3 text-left font-medium ${farbe}`}>
              {a}
            </button>
          )
        })}
      </div>
      {gewaehlt !== null && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="font-medium">{gewaehlt === f.richtig ? 'Richtig' : `Richtig wäre: ${f.antworten[f.richtig]}`}</p>
          <button type="button" onClick={() => { setNr(nr + 1); setGewaehlt(null) }}
                  className="shrink-0 bg-sbb-charcoal px-4 py-2 font-medium text-white dark:bg-sbb-white dark:text-sbb-black">
            {nr + 1 < fragen.length ? 'Weiter' : 'Ergebnis'}
          </button>
        </div>
      )}
    </div>
  )
}
