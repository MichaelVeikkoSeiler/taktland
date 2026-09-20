import { useCallback, useEffect, useMemo, useState } from 'react'
import { duellstandLesen, duellstandMerken, type Duellstand } from '../fortschritt'
import { vergleichLaden } from '../daten'
import type { Kategorie, Vergleichsdaten, VergleichsBahnhof } from '../typen'

/**
 * Bahnhöfe gegeneinander. Die Fragen entstehen hier aus den Werten in
 * vergleich.json, es wird nichts geschrieben und nichts geschätzt.
 *
 * Warum das geht, ohne gegen die Belegpflicht zu verstossen: Beide Werte
 * stammen unverändert aus den Faktendateien, und pipeline/build_vergleich.py
 * lässt nur Grössen zu, die für jeden Bahnhof erhoben sind. Wo bloss der
 * Datenbestand verglichen wird - etwa beim längsten erfassten Perron -, sagt
 * die Frage das ausdrücklich.
 */

interface Runde {
  kategorie: Kategorie
  bahnhoefe: VergleichsBahnhof[]
  richtig: number
}

function zufall<T>(liste: T[]): T {
  return liste[Math.floor(Math.random() * liste.length)]
}

function wertVon(b: VergleichsBahnhof, k: Kategorie) {
  return b.werte[k.id]
}

/** Reicht der Abstand, damit die Frage kein Münzwurf ist? */
function weitGenug(a: number, b: number, k: Kategorie) {
  const abstand = Math.abs(a - b)
  const anteil = abstand / Math.max(Math.abs(a), Math.abs(b), 1)
  return abstand >= k.min_abstand && anteil >= k.min_anteil
}

/**
 * Sucht ein Feld für eine Kategorie. Mit wachsender Serie rücken die Werte
 * näher zusammen - aber nie näher als der Mindestabstand der Kategorie.
 *
 * Genau daran ist die erste Fassung gescheitert: Bei Serie 8 verlangte sie
 * Kandidaten, die höchstens 17 Prozent auseinanderliegen, während «Züge pro
 * Tag» mindestens 25 Prozent fordert. Die Bedingung widersprach sich selbst,
 * es gab kein Paar mehr, und das Spiel blieb beim Laden stehen. Wer eine
 * Serie von 8 schaffte, wurde also dafür bestraft.
 */
function versuchen(daten: Vergleichsdaten, kategorie: Kategorie,
                   serie: number, engziehen: boolean): Runde | null {
  const feld = daten.bahnhoefe.filter((b) => wertVon(b, kategorie) != null)
  if (feld.length < 8) return null

  const anzahl = serie >= 4 && Math.random() < 0.4 ? 4 : 2
  const locker = 1 / (1 + Math.min(serie, 8) * 0.6)
  const enge = engziehen ? Math.max(kategorie.min_anteil * 1.6, locker) : 1

  for (let versuch = 0; versuch < 60; versuch++) {
    const erster = zufall(feld)
    const a = wertVon(erster, kategorie)
    const passend = feld.filter((b) => {
      if (b.uic === erster.uic) return false
      const v = wertVon(b, kategorie)
      if (!weitGenug(a, v, kategorie)) return false
      return Math.abs(a - v) <= Math.max(Math.abs(a), Math.abs(v)) * enge
    })
    if (passend.length < anzahl - 1) continue

    const gewaehlt = [erster]
    const rest = [...passend]
    while (gewaehlt.length < anzahl && rest.length) {
      const kandidat = rest.splice(Math.floor(Math.random() * rest.length), 1)[0]
      // auch untereinander müssen die Werte weit genug auseinanderliegen
      if (gewaehlt.every((g) => weitGenug(wertVon(g, kategorie),
                                          wertVon(kandidat, kategorie), kategorie))) {
        gewaehlt.push(kandidat)
      }
    }
    if (gewaehlt.length < anzahl) continue

    const gemischt = [...gewaehlt].sort(() => Math.random() - 0.5)
    const werte = gemischt.map((b) => wertVon(b, kategorie))
    const hoechster = Math.max(...werte)
    return { kategorie, bahnhoefe: gemischt, richtig: werte.indexOf(hoechster) }
  }
  return null
}

/**
 * Baut eine Runde. Geht eine Kategorie nicht auf, kommt die nächste dran, und
 * zuletzt wird ohne Verengung gesucht. So bleibt das Spiel nie stehen.
 */
function rundeBauen(daten: Vergleichsdaten, serie: number): Runde | null {
  const reihenfolge = [...daten.kategorien].sort(() => Math.random() - 0.5)
  for (const eng of [true, false]) {
    for (const kategorie of reihenfolge) {
      const runde = versuchen(daten, kategorie, serie, eng)
      if (runde) return runde
    }
  }
  return null
}

function zahl(n: number, k: Kategorie) {
  return `${n.toLocaleString('de-CH', { maximumFractionDigits: 20 })} ${k.einheit}`
}

/** Setzt den Punkt nur, wenn nicht schon einer dasteht: «m ü. M.» endet selbst
 *  auf einen Punkt, sonst stünden zwei. */
function mitPunkt(text: string) {
  return text.endsWith('.') ? text : `${text}.`
}

export function Duell({ zurueck }: { zurueck: () => void }) {
  const [daten, setDaten] = useState<Vergleichsdaten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [runde, setRunde] = useState<Runde | null>(null)
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  const [serie, setSerie] = useState(0)
  const [stand, setStand] = useState<Duellstand>(() => duellstandLesen())

  useEffect(() => {
    vergleichLaden().then(setDaten).catch((e: Error) => setFehler(e.message))
  }, [])

  const naechste = useCallback((mitSerie: number) => {
    if (!daten) return
    setGewaehlt(null)
    setRunde(rundeBauen(daten, mitSerie))
  }, [daten])

  useEffect(() => { if (daten && !runde) naechste(0) }, [daten, runde, naechste])

  function waehlen(i: number) {
    if (gewaehlt !== null || !runde) return
    setGewaehlt(i)
    const richtig = i === runde.richtig
    const neueSerie = richtig ? serie + 1 : 0
    setSerie(neueSerie)
    setStand(duellstandMerken(richtig, richtig ? neueSerie : serie))
  }

  const quote = useMemo(
    () => (stand.gespielt ? Math.round((stand.richtig / stand.gespielt) * 100) : null),
    [stand],
  )

  if (fehler) return <p className="px-4 py-8">Der Vergleich konnte nicht geladen werden. {fehler}</p>
  if (!daten) return <p className="px-4 py-8 text-sbb-metal">Wird geladen …</p>
  if (!runde) {
    return (
      <div className="px-4 py-8">
        <p>Zu dieser Runde liess sich kein faires Paar finden.</p>
        <button
          type="button" onClick={() => naechste(0)}
          className="mt-4 bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125"
        >Nochmals versuchen</button>
      </div>
    )
  }

  const k = runde.kategorie
  const aufgeloest = gewaehlt !== null
  const getroffen = gewaehlt === runde.richtig

  return (
    <div className="px-4 pb-16">
      <button
        type="button" onClick={zurueck}
        className="mt-6 text-sm text-sbb-metal hover:text-sbb-black dark:text-sbb-storm
                   dark:hover:text-sbb-white"
      >← Alle Bahnhöfe</button>

      <div className="mt-4 flex items-baseline justify-between border-b border-sbb-cloud
                      pb-3 dark:border-sbb-iron">
        <h1 className="text-2xl font-bold tracking-tight">Duell</h1>
        <p className="text-sm text-sbb-metal dark:text-sbb-storm">
          Serie <span className="font-bold tabular-nums text-sbb-black dark:text-sbb-white">{serie}</span>
          {stand.rekord > 0 && <> · Bestwert {stand.rekord}</>}
          {quote !== null && <> · {quote}% richtig</>}
        </p>
      </div>

      <p className="mt-5 text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
        {k.titel}
      </p>
      <p className="mt-1 text-lg font-medium">
        {runde.bahnhoefe.length > 2 ? k.frage_mehrere : k.frage}
      </p>

      <ul className="mt-4 space-y-2">
        {runde.bahnhoefe.map((b, i) => {
          const istRichtig = i === runde.richtig
          const rahmen = !aufgeloest
            ? 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight'
            : istRichtig
              ? 'border-sbb-green bg-sbb-green-bg dark:bg-sbb-green/15'
              : i === gewaehlt
                ? 'border-sbb-red bg-white dark:bg-sbb-midnight'
                : 'border-sbb-cloud bg-white opacity-60 dark:border-sbb-iron dark:bg-sbb-midnight'
          return (
            <li key={b.uic}>
              <button
                type="button" onClick={() => waehlen(i)} disabled={aufgeloest}
                className={`flex w-full items-center justify-between gap-3 border px-4 py-4
                            text-left transition ${rahmen}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{b.name}</span>
                  {b.kanton && (
                    <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                      Kanton {b.kanton}
                    </span>
                  )}
                </span>
                {aufgeloest && (
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block font-bold">{zahl(wertVon(b, k), k)}</span>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {aufgeloest && (
        <>
          <div className={`mt-4 border-l-2 px-3 py-2 text-sm ${
            getroffen
              ? 'border-sbb-green bg-sbb-green-bg text-sbb-black dark:bg-sbb-green/15 dark:text-sbb-white'
              : 'border-sbb-red bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white'
          }`}>
            <p className="font-bold">{getroffen ? 'Richtig' : 'Nicht ganz'}</p>
            {/* «führt mit 304 Züge pro Tag» wäre falsch gebeugt, und die
                Einheiten lassen sich nicht zuverlässig beugen. Der Doppelpunkt
                umgeht das. */}
            <p className="mt-0.5">
              {runde.bahnhoefe[runde.richtig].name} liegt vorn:{' '}
              {mitPunkt(zahl(wertVon(runde.bahnhoefe[runde.richtig], k), k))}
            </p>
            {/* Bei art «erfasst» verlangt generator/validate_vergleich.py einen
                hinweis, der das sagt. Darum hier keine zweite, fast gleich
                lautende Zeile. */}
            {k.hinweis && <p className="mt-1">{k.hinweis}</p>}
            <p className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
              Quelle: {k.quelle}
            </p>
          </div>

          <button
            type="button" onClick={() => naechste(serie)}
            className="mt-4 w-full bg-sbb-red px-4 py-3 font-bold text-white
                       hover:bg-sbb-red125"
          >
            Nächste Frage
          </button>
        </>
      )}

      <p className="mt-8 text-xs text-sbb-metal dark:text-sbb-storm">
        Alle {daten.bahnhoefe.length} Bahnhöfe sind dabei, auch die ohne Lernkapitel.
        Jeder Wert stammt unverändert aus den offenen Daten. Datenstand: {daten.datenstand}.
      </p>
    </div>
  )
}
