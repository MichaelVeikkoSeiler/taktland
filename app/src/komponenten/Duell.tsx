import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  auswahlLesen, auswahlMerken, duellstandLesen, duellstandMerken, type Duellstand,
} from '../fortschritt'
import { vergleichLaden } from '../daten'
import type { Kategorie, Vergleichsdaten } from '../typen'
import { kantonText } from '../kanton'
import { Zurueck } from './Zurueck'

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

/** Ein Kanton braucht genug Bahnhöfe, sonst findet sich kein faires Paar.
 *  Die Grenze ist dieselbe, die versuchen() ohnehin verlangt. */
const MINDESTENS = 8

const KANTONSNAME: Record<string, string> = {
  AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden',
  BE: 'Bern', BL: 'Basel-Landschaft', BS: 'Basel-Stadt', FR: 'Freiburg',
  GE: 'Genf', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern',
  NE: 'Neuenburg', NW: 'Nidwalden', OW: 'Obwalden', SG: 'St. Gallen',
  SH: 'Schaffhausen', SO: 'Solothurn', SZ: 'Schwyz', TG: 'Thurgau',
  TI: 'Tessin', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich',
}

/** Was gegeneinander antritt: ein Bahnhof oder ein Tunnel */
interface Gegenstand {
  schluessel: string
  name: string
  /** unter dem Namen: der Kanton beim Bahnhof, die Linie beim Tunnel */
  unterzeile: string | null
  /** Bemerkung der Quelle, etwa was eine Tunnellänge umfasst */
  bemerkung?: string | null
  werte: Record<string, number>
  /** wohin «Mehr dazu» führt: Bahnhofsseite oder Linie des Tunnels */
  link: string
  linkText: string
}

/** Auswahl «alle Tunnel» im Feld oben, neben Schweiz und Kantonen */
const TUNNEL = 'TUNNEL'

interface Runde {
  kategorie: Kategorie
  eintraege: Gegenstand[]
  richtig: number
}

/** Stand des Duells, solange die Seite offen ist. Wer über «Mehr dazu» auf
 *  eine Bahnhofsseite geht und zurückkommt, soll die Serie nicht verlieren. */
let zwischenstand: { auswahl: string; serie: number; runde: Runde | null;
                     gewaehlt: number | null } | null = null

function zufall<T>(liste: T[]): T {
  return liste[Math.floor(Math.random() * liste.length)]
}

function wertVon(b: Gegenstand, k: Kategorie) {
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
function versuchen(feldAlle: Gegenstand[], kategorie: Kategorie,
                   serie: number, engziehen: boolean): Runde | null {
  const feld = feldAlle.filter((b) => wertVon(b, kategorie) != null)
  if (feld.length < 8) return null

  const anzahl = serie >= 4 && Math.random() < 0.4 ? 4 : 2
  const locker = 1 / (1 + Math.min(serie, 8) * 0.6)
  const enge = engziehen ? Math.max(kategorie.min_anteil * 1.6, locker) : 1

  for (let versuch = 0; versuch < 60; versuch++) {
    const erster = zufall(feld)
    const a = wertVon(erster, kategorie)
    const passend = feld.filter((b) => {
      if (b.schluessel === erster.schluessel) return false
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
    // vorn liegt der höchste Wert, beim Jahr der ersten Inbetriebnahme der tiefste
    const bester = kategorie.richtung === 'tiefster' ? Math.min(...werte) : Math.max(...werte)
    return { kategorie, eintraege: gemischt, richtig: werte.indexOf(bester) }
  }
  return null
}

/**
 * Baut eine Runde. Geht eine Kategorie nicht auf, kommt die nächste dran, und
 * zuletzt wird ohne Verengung gesucht. So bleibt das Spiel nie stehen.
 */
function rundeBauen(kategorien: Kategorie[], feld: Gegenstand[],
                    serie: number): Runde | null {
  const reihenfolge = [...kategorien].sort(() => Math.random() - 0.5)
  for (const eng of [true, false]) {
    for (const kategorie of reihenfolge) {
      const runde = versuchen(feld, kategorie, serie, eng)
      if (runde) return runde
    }
  }
  return null
}

function zahl(n: number, k: Kategorie) {
  const text = k.format === 'jahr'
    ? String(n)
    : n.toLocaleString('de-CH', { maximumFractionDigits: 20 })
  return k.einheit ? `${text} ${k.einheit}` : text
}

/** Setzt den Punkt nur, wenn nicht schon einer dasteht: «m ü. M.» endet selbst
 *  auf einen Punkt, sonst stünden zwei. */
function mitPunkt(text: string) {
  return text.endsWith('.') ? text : `${text}.`
}

export function Duell({ zurueck }: { zurueck: () => void }) {
  const [daten, setDaten] = useState<Vergleichsdaten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [auswahl, setAuswahl] = useState<string>(() => auswahlLesen())
  const gemerkt = zwischenstand?.auswahl === auswahl ? zwischenstand : null
  const [runde, setRunde] = useState<Runde | null>(gemerkt?.runde ?? null)
  const [gewaehlt, setGewaehlt] = useState<number | null>(gemerkt?.gewaehlt ?? null)
  const [serie, setSerie] = useState(gemerkt?.serie ?? 0)
  const [stand, setStand] = useState<Duellstand>(() => duellstandLesen())

  useEffect(() => { zwischenstand = { auswahl, serie, runde, gewaehlt } },
            [auswahl, serie, runde, gewaehlt])
  const tunnelFeld = auswahl === TUNNEL

  /** Die Kantone, die genug Bahnhöfe für faire Paare haben. */
  const kantone = useMemo(() => {
    if (!daten) return []
    const zaehler = new Map<string, number>()
    for (const b of daten.bahnhoefe) {
      if (b.kanton) zaehler.set(b.kanton, (zaehler.get(b.kanton) ?? 0) + 1)
    }
    return [...zaehler.entries()]
      .filter(([, n]) => n >= MINDESTENS)
      .map(([k, n]) => ({ kuerzel: k, name: KANTONSNAME[k] ?? k, anzahl: n }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de-CH'))
  }, [daten])

  const feld = useMemo((): Gegenstand[] => {
    if (!daten) return []
    if (auswahl === TUNNEL) {
      return (daten.tunnel ?? []).map((t) => ({
        schluessel: t.id, name: t.name, unterzeile: `Linie ${t.linie}`,
        bemerkung: t.bemerkung, werte: t.werte,
        link: `#/linie/${t.linie}`, linkText: `${t.name} (Linie ${t.linie})`,
      }))
    }
    return daten.bahnhoefe
      .filter((b) => auswahl === 'CH' || b.kanton === auswahl)
      .map((b) => ({
        schluessel: String(b.uic), name: b.name,
        unterzeile: b.kanton ? kantonText(b.kanton) : null, werte: b.werte,
        link: `#/bahnhof/${b.uic}`, linkText: b.name,
      }))
  }, [daten, auswahl])

  const kategorien = useMemo(
    () => (daten ? (tunnelFeld ? daten.tunnel_kategorien ?? [] : daten.kategorien) : []),
    [daten, tunnelFeld],
  )

  useEffect(() => {
    vergleichLaden().then(setDaten).catch((e: Error) => setFehler(e.message))
  }, [])

  const naechste = useCallback((mitSerie: number) => {
    if (!daten) return
    setGewaehlt(null)
    setRunde(rundeBauen(kategorien, feld, mitSerie))
  }, [daten, feld, kategorien])

  useEffect(() => { if (daten && !runde) naechste(0) }, [daten, runde, naechste])

  function auswahlWechseln(neu: string) {
    setAuswahl(neu)
    auswahlMerken(neu)
    setSerie(0)
    setGewaehlt(null)
    setRunde(null)   // der useEffect oben baut die erste Runde im neuen Feld
  }

  function waehlen(i: number) {
    if (gewaehlt !== null || !runde) return
    setGewaehlt(i)
    const richtig = i === runde.richtig
    const neueSerie = richtig ? serie + 1 : 0
    setSerie(neueSerie)
    setStand(duellstandMerken(auswahl, richtig, richtig ? neueSerie : serie))
  }

  const rekord = stand.rekorde[auswahl] ?? 0

  const quote = useMemo(
    () => (stand.gespielt ? Math.round((stand.richtig / stand.gespielt) * 100) : null),
    [stand],
  )

  if (fehler) return <p className="px-4 py-8">Der Vergleich konnte nicht geladen werden. {fehler}</p>
  if (!daten) return <p className="px-4 py-8 text-sbb-metal">Wird geladen …</p>

  const k = runde?.kategorie
  const aufgeloest = gewaehlt !== null
  const getroffen = runde !== null && gewaehlt === runde.richtig

  return (
    <div className="px-4 pb-16">
      <Zurueck onClick={zurueck} text="Alle Bahnhöfe" />

      <div className="mt-4 flex items-baseline justify-between border-b border-sbb-cloud
                      pb-3 dark:border-sbb-iron">
        <h1 className="text-2xl font-bold tracking-tight">Duell</h1>
        <p className="text-sm text-sbb-metal dark:text-sbb-storm">
          Serie <span className="font-bold tabular-nums text-sbb-black dark:text-sbb-white">{serie}</span>
          {rekord > 0 && <> · Bestwert {rekord}</>}
          {quote !== null && <> · {quote}% richtig</>}
        </p>
      </div>

      {/* Die Auswahl steht ausserhalb des Frageteils: Beim Wechsel wird die
          Runde kurz verworfen, und ein Feld, das dabei verschwindet, lässt
          sich nicht bedienen. */}
      <label className="mt-4 block">
        <span className="sr-only">Auswahl</span>
        <select
          value={auswahl}
          onChange={(e) => auswahlWechseln(e.target.value)}
          className="w-full appearance-none border border-sbb-cloud bg-white px-3 py-2.5
                     text-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight
                     dark:text-sbb-white"
        >
          <option value="CH">Ganze Schweiz ({daten.bahnhoefe.length} Bahnhöfe)</option>
          {daten.tunnel && daten.tunnel.length > 0 && (
            <option value={TUNNEL}>Tunnel ({daten.tunnel.length} Tunnel)</option>
          )}
          {kantone.map((kt) => (
            <option key={kt.kuerzel} value={kt.kuerzel}>
              {kt.name} ({kt.anzahl} Bahnhöfe)
            </option>
          ))}
        </select>
      </label>

      {runde && k ? (
        <>
          <p className="mt-5 text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
            {k.titel}
          </p>
          <p className="mt-1 text-lg font-medium">
            {runde.eintraege.length > 2 ? k.frage_mehrere : k.frage}
          </p>

          <ul className="mt-4 space-y-2">
            {runde.eintraege.map((b, i) => {
              const istRichtig = i === runde.richtig
              const rahmen = !aufgeloest
                ? 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight'
                : istRichtig
                  ? 'border-sbb-green bg-sbb-green-bg dark:bg-sbb-green/15'
                  : i === gewaehlt
                    ? 'border-sbb-red bg-white dark:bg-sbb-midnight'
                    : 'border-sbb-cloud bg-white opacity-60 dark:border-sbb-iron dark:bg-sbb-midnight'
              return (
                <li key={b.schluessel}>
                  <button
                    type="button" onClick={() => waehlen(i)} disabled={aufgeloest}
                    className={`flex w-full items-center justify-between gap-3 border px-4 py-4
                                text-left transition ${rahmen}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{b.name}</span>
                      {b.unterzeile && (
                        <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                          {b.unterzeile}
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
                    Einheiten lassen sich nicht zuverlässig beugen. Der
                    Doppelpunkt umgeht das. */}
                <p className="mt-0.5">
                  {runde.eintraege[runde.richtig].name} liegt vorn:{' '}
                  {mitPunkt(zahl(wertVon(runde.eintraege[runde.richtig], k), k))}
                </p>
                {/* Was eine Tunnellänge umfasst, sagt manchmal nur die Bemerkung
                    («Länge der Oströhre», «4947m gehört Frankreich») */}
                {runde.eintraege.filter((b) => b.bemerkung).map((b) => (
                  <p key={b.schluessel} className="mt-1">
                    Die Quelle vermerkt zu {b.name}: «{b.bemerkung}»
                  </p>
                ))}
                {/* Bei art «erfasst» verlangt generator/validate_vergleich.py
                    einen hinweis, der das sagt. Darum hier keine zweite, fast
                    gleich lautende Zeile. */}
                {k.hinweis && <p className="mt-1">{k.hinweis}</p>}
                <p className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
                  Quelle: {k.quelle}
                </p>
                <p className="mt-2">
                  Mehr dazu:{' '}
                  {runde.eintraege.map((b, i) => (
                    <span key={b.schluessel}>
                      {i > 0 && ' · '}
                      <a href={b.link} className="underline underline-offset-2 hover:text-sbb-red">
                        {b.linkText}
                      </a>
                    </span>
                  ))}
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
        </>
      ) : (
        <div className="mt-6">
          <p>
            {auswahl === 'CH' || tunnelFeld
              ? 'Zu dieser Runde liess sich kein faires Paar finden.'
              : `Im Kanton ${KANTONSNAME[auswahl] ?? auswahl} liessen sich keine `
                + 'Bahnhöfe finden, die weit genug auseinanderliegen.'}
          </p>
          <button
            type="button"
            onClick={() => (auswahl === 'CH' || tunnelFeld ? naechste(0) : auswahlWechseln('CH'))}
            className="mt-4 bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125"
          >{auswahl === 'CH' || tunnelFeld ? 'Nochmals versuchen' : 'Ganze Schweiz spielen'}</button>
        </div>
      )}

      <p className="mt-8 text-xs text-sbb-metal dark:text-sbb-storm">
        {tunnelFeld
          ? `Alle ${feld.length} Tunnel aus den offenen Daten sind dabei.`
          : auswahl === 'CH'
            ? `Alle ${daten.bahnhoefe.length} Bahnhöfe sind dabei.`
            : `${feld.length} Bahnhöfe im Kanton ${KANTONSNAME[auswahl] ?? auswahl}.`}{' '}
        Jeder Wert stammt unverändert aus den offenen Daten. Datenstand:{' '}
        {tunnelFeld ? daten.tunnel_datenstand ?? daten.datenstand : daten.datenstand}.
        {!tunnelFeld && kantone.length < 26
          && ' Kantone mit zu wenigen Bahnhöfen für faire Paare fehlen in der Auswahl.'}
      </p>
    </div>
  )
}
