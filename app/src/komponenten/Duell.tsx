import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  auswahlLesen, auswahlMerken, duellstandLesen, duellstandMerken, type Duellstand,
} from '../fortschritt'
import { vergleichLaden } from '../daten'
import type { BahnhofIndex, IndexEintrag, Kategorie, Vergleichsdaten } from '../typen'
import { kantonText } from '../kanton'
import { Ladefehler } from './Ladefehler'
import { Auswahl } from './Auswahl'
import { BahnhofFeld } from './Strecke'

/**
 * Bahnhöfe, Linien oder Tunnel gegeneinander. Die Fragen entstehen hier aus
 * den Werten in vergleich.json, es wird nichts geschrieben und nichts geschätzt.
 *
 * Warum das geht, ohne gegen die Belegpflicht zu verstossen: Beide Werte
 * stammen unverändert aus den Faktendateien, und pipeline/build_vergleich.py
 * lässt nur Grössen zu, die für jeden Bahnhof erhoben sind. Wo bloss der
 * Datenbestand verglichen wird - etwa beim längsten erfassten Perron -, sagt
 * die Frage das ausdrücklich.
 */

/** Ein Kanton braucht genug Einträge, sonst findet sich kein faires Paar.
 *  Die Grenze ist dieselbe, die versuchen() ohnehin verlangt. */
const MINDESTENS = 8

/** Was gegeneinander antritt. Brücken nicht: Von ihnen ist nur die Zahl der
 *  Baueinheiten erfasst, und drei von vier haben genau eine. */
type Bereich = 'bahnhoefe' | 'linien' | 'tunnel'

const BEREICHE: Record<Bereich, { name: string; mehrzahlDativ: string }> = {
  bahnhoefe: { name: 'Bahnhöfe', mehrzahlDativ: 'Bahnhöfen' },
  linien: { name: 'Linien', mehrzahlDativ: 'Linien' },
  tunnel: { name: 'Tunnel', mehrzahlDativ: 'Tunneln' },
}

/**
 * Die Auswahl steht als ein Wort im Speicher, auch der Bestwert hängt daran:
 * «CH» und «ZH» für die Bahnhöfe (so hiess es schon vor den Bereichen, damit
 * bleiben alte Bestwerte gültig), «TUNNEL» und «TUNNEL:UR», «LINIEN».
 */
function zerlegen(auswahl: string): { bereich: Bereich; gebiet: string } {
  if (auswahl === 'LINIEN') return { bereich: 'linien', gebiet: 'CH' }
  if (auswahl === 'TUNNEL') return { bereich: 'tunnel', gebiet: 'CH' }
  if (auswahl.startsWith('TUNNEL:')) return { bereich: 'tunnel', gebiet: auswahl.slice(7) }
  return { bereich: 'bahnhoefe', gebiet: /^[A-Z]{2}$/.test(auswahl) ? auswahl : 'CH' }
}

function zusammensetzen(bereich: Bereich, gebiet: string) {
  if (bereich === 'linien') return 'LINIEN'
  if (bereich === 'tunnel') return gebiet === 'CH' ? 'TUNNEL' : `TUNNEL:${gebiet}`
  return gebiet
}

const KANTONSNAME: Record<string, string> = {
  AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden',
  BE: 'Bern', BL: 'Basel-Landschaft', BS: 'Basel-Stadt', FR: 'Freiburg',
  GE: 'Genf', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern',
  NE: 'Neuenburg', NW: 'Nidwalden', OW: 'Obwalden', SG: 'St. Gallen',
  SH: 'Schaffhausen', SO: 'Solothurn', SZ: 'Schwyz', TG: 'Thurgau',
  TI: 'Tessin', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich',
}

/** Was gegeneinander antritt: ein Bahnhof, eine Linie oder ein Tunnel */
interface Gegenstand {
  schluessel: string
  name: string
  /** unter dem Namen: der Kanton beim Bahnhof, die Linie beim Tunnel, der
   *  Name bei der Linie */
  unterzeile: string | null
  /** Kantonskürzel für die Auswahl nach Kanton; leer bei den Linien */
  kantone: string[]
  /** Bemerkung der Quelle, etwa was eine Tunnellänge umfasst */
  bemerkung?: string | null
  werte: Record<string, number>
  /** wohin «Mehr dazu» führt: Bahnhofsseite oder Linie des Tunnels */
  link: string
  linkText: string
}

interface Runde {
  kategorie: Kategorie
  eintraege: Gegenstand[]
  richtig: number
}

/** Stand des Duells, solange die Seite offen ist. Wer über «Mehr dazu» auf
 *  eine Bahnhofsseite geht und zurückkommt, soll die Serie nicht verlieren. */
let zwischenstand: { auswahl: string; serie: number; runde: Runde | null;
                     gewaehlt: number | null } | null = null

/**
 * Zwei Bahnhöfe selbst gewählt (Michael, 2026-09-26: «optional 2 Bahnhöfe
 * wählen»). Gefragt wird jede Kategorie, in der beide einen Wert haben und die
 * Werte weit genug auseinanderliegen, jede einmal, in zufälliger Reihenfolge.
 * Serie und Bestwert zählen dabei nicht: Das Paar ist ja nicht zufällig.
 */
interface Paar { a: number | null; b: number | null; reihe: Kategorie[]; nr: number; richtig: number
                 gewaehlt: number | null; eintraege: Gegenstand[] }
let paarGemerkt: Paar | null = null

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

/** Gibt es in diesem Feld überhaupt ein faires Paar? Wenn der kleinste und
 *  der grösste Wert einer Kategorie nicht weit genug auseinanderliegen, dann
 *  keine zwei Werte dazwischen. */
function hatFairesPaar(feld: Gegenstand[], kategorien: Kategorie[]) {
  return kategorien.some((k) => {
    const werte = feld.map((g) => wertVon(g, k)).filter((v) => v != null)
    return werte.length >= MINDESTENS
      && weitGenug(Math.min(...werte), Math.max(...werte), k)
  })
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
                   serie: number, engziehen: boolean, anzahl: number): Runde | null {
  const feld = feldAlle.filter((b) => wertVon(b, kategorie) != null)
  if (feld.length < MINDESTENS) return null

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
 * Baut eine Runde. Ab einer Serie von 4 stehen manchmal vier zur Wahl. Geht
 * eine Kategorie nicht auf, kommt die nächste dran, dann wird ohne Verengung
 * gesucht und zuletzt mit zweien statt vieren. So bleibt das Spiel nie stehen.
 */
function rundeBauen(kategorien: Kategorie[], feld: Gegenstand[],
                    serie: number): Runde | null {
  const reihenfolge = [...kategorien].sort(() => Math.random() - 0.5)
  const anzahlen = serie >= 4 && Math.random() < 0.4 ? [4, 2] : [2]
  for (const anzahl of anzahlen) {
    for (const eng of [true, false]) {
      for (const kategorie of reihenfolge) {
        const runde = versuchen(feld, kategorie, serie, eng, anzahl)
        if (runde) return runde
      }
    }
  }
  return null
}

function zahl(n: number, k: Kategorie) {
  const text = k.format === 'jahr'
    ? String(n)
    : n.toLocaleString('de-CH', { maximumFractionDigits: 20 })
  const einheit = n === 1 && k.einheit_einzahl ? k.einheit_einzahl : k.einheit
  return einheit ? `${text} ${einheit}` : text
}

/** Setzt den Punkt nur, wenn nicht schon einer dasteht: «m ü. M.» endet selbst
 *  auf einen Punkt, sonst stünden zwei. */
function mitPunkt(text: string) {
  return text.endsWith('.') ? text : `${text}.`
}

export function Duell({ index }: { index: BahnhofIndex | null }) {
  const [daten, setDaten] = useState<Vergleichsdaten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [auswahl, setAuswahl] = useState<string>(() => auswahlLesen())
  const gemerkt = zwischenstand?.auswahl === auswahl ? zwischenstand : null
  const [runde, setRunde] = useState<Runde | null>(gemerkt?.runde ?? null)
  const [gewaehlt, setGewaehlt] = useState<number | null>(gemerkt?.gewaehlt ?? null)
  const [serie, setSerie] = useState(gemerkt?.serie ?? 0)
  const [stand, setStand] = useState<Duellstand>(() => duellstandLesen())
  const [paar, setPaar] = useState<Paar | null>(paarGemerkt)
  useEffect(() => { paarGemerkt = paar }, [paar])

  useEffect(() => { zwischenstand = { auswahl, serie, runde, gewaehlt } },
            [auswahl, serie, runde, gewaehlt])
  const { bereich, gebiet } = zerlegen(auswahl)

  const kategorien = useMemo((): Kategorie[] => {
    if (!daten) return []
    if (bereich === 'tunnel') return daten.tunnel_kategorien ?? []
    if (bereich === 'linien') return daten.linien_kategorien ?? []
    return daten.kategorien
  }, [daten, bereich])

  /** Alle Einträge des Bereichs, noch ohne Auswahl nach Kanton */
  const alle = useMemo((): Gegenstand[] => {
    if (!daten) return []
    if (bereich === 'tunnel') {
      return (daten.tunnel ?? []).map((t) => ({
        schluessel: t.id, name: t.name, unterzeile: `Linie ${t.linie}`,
        kantone: t.kantone ?? [], bemerkung: t.bemerkung, werte: t.werte,
        // id «Linie:Stelle»: der Tunnel in der Liste seiner Linie, hervorgehoben
        link: `#/linie/${t.linie}/tunnel?eintrag=${t.id.split(':')[1]}`,
        linkText: `${t.name} (Linie ${t.linie})`,
      }))
    }
    if (bereich === 'linien') {
      return (daten.linien ?? []).map((l) => ({
        schluessel: `L${l.linie}`, name: `Linie ${l.linie}`, unterzeile: l.name,
        kantone: [], werte: l.werte, link: `#/linie/${l.linie}`, linkText: `Linie ${l.linie}`,
      }))
    }
    return daten.bahnhoefe.map((b) => ({
      schluessel: String(b.uic), name: b.name,
      unterzeile: b.kanton ? kantonText(b.kanton) : null,
      kantone: b.kanton ? [b.kanton] : [], werte: b.werte,
      link: `#/bahnhof/${b.uic}`, linkText: b.name,
    }))
  }, [daten, bereich])

  /** Die Kantone, in denen der Bereich genug Einträge für faire Paare hat.
   *  Eine Linie hat in den Daten keinen Kanton. */
  const kantone = useMemo(() => {
    if (bereich === 'linien') return []
    const je = new Map<string, Gegenstand[]>()
    for (const g of alle) {
      for (const k of g.kantone) {
        const liste = je.get(k) ?? []
        liste.push(g)
        je.set(k, liste)
      }
    }
    return [...je.entries()]
      .filter(([, liste]) => hatFairesPaar(liste, kategorien))
      .map(([k, liste]) => ({ kuerzel: k, name: KANTONSNAME[k] ?? k, anzahl: liste.length }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de-CH'))
  }, [alle, bereich, kategorien])

  const feld = useMemo(
    () => (gebiet === 'CH' ? alle : alle.filter((g) => g.kantone.includes(gebiet))),
    [alle, gebiet],
  )

  // Eine gemerkte Kantonsauswahl, die es nicht mehr gibt, wird zur ganzen Schweiz
  useEffect(() => {
    if (daten && gebiet !== 'CH' && !kantone.some((k) => k.kuerzel === gebiet)) {
      auswahlWechseln(zusammensetzen(bereich, 'CH'))
    }
  }, [daten, bereich, gebiet, kantone])

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

  // Für das selbst gewählte Paar: nur Bahnhöfe mit Werten im Vergleich
  const imVergleich = useMemo(() => new Set(daten?.bahnhoefe.map((b) => b.uic) ?? []), [daten])
  const waehlbar = useMemo(() => (index?.bahnhoefe ?? []).filter((e) => imVergleich.has(e.uic)),
                           [index, imVergleich])
  const nameVon = useCallback((uic: number | null) => (uic === null ? ''
    : daten?.bahnhoefe.find((b) => b.uic === uic)?.name ?? ''), [daten])

  function paarSetzen(a: number | null, b: number | null) {
    const ga = alle.find((g) => g.schluessel === String(a))
    const gb = alle.find((g) => g.schluessel === String(b))
    const reihe = ga && gb && a !== b
      ? kategorien.filter((k) => wertVon(ga, k) != null && wertVon(gb, k) != null
          && weitGenug(wertVon(ga, k), wertVon(gb, k), k)).sort(() => Math.random() - 0.5)
      : []
    setPaar({ a, b, reihe, nr: 0, richtig: 0, gewaehlt: null,
              eintraege: ga && gb ? [ga, gb].sort(() => Math.random() - 0.5) : [] })
  }

  const quote = useMemo(
    () => (stand.gespielt ? Math.round((stand.richtig / stand.gespielt) * 100) : null),
    [stand],
  )

  if (fehler) return <Ladefehler className="px-4 py-8" was="Der Vergleich konnte nicht geladen werden." fehler={fehler} />
  if (!daten) return <p className="px-4 py-8 text-sbb-metal">Wird geladen …</p>

  const k = runde?.kategorie
  const aufgeloest = gewaehlt !== null
  const getroffen = runde !== null && gewaehlt === runde.richtig

  return (
    <div className="px-4 pb-16">
      <div className="mt-6 flex items-baseline justify-between border-b border-sbb-cloud
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
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div>
          <span className="block text-xs text-sbb-metal dark:text-sbb-storm">Bereich</span>
          <Auswahl
            titel="Bereich" wert={bereich}
            waehlen={(w) => auswahlWechseln(zusammensetzen(w, 'CH'))}
            optionen={[
              { wert: 'bahnhoefe' as Bereich, text: `Bahnhöfe (${daten.bahnhoefe.length})`, kurz: 'Bahnhöfe' },
              ...((daten.linien?.length ?? 0) > 0
                ? [{ wert: 'linien' as Bereich, text: `Strecken (${daten.linien?.length})`, kurz: 'Strecken' }] : []),
              ...((daten.tunnel?.length ?? 0) > 0
                ? [{ wert: 'tunnel' as Bereich, text: `Tunnel (${daten.tunnel?.length})`, kurz: 'Tunnel' }] : []),
            ]}
            className="mt-1 w-full border border-sbb-cloud bg-white px-3 py-2.5 text-sbb-black
                       disabled:opacity-60 dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white"
          />
        </div>
        <div>
          <span className="block text-xs text-sbb-metal dark:text-sbb-storm">Gebiet</span>
          <Auswahl
            titel="Gebiet" wert={gebiet} disabled={bereich === 'linien'}
            waehlen={(w) => auswahlWechseln(zusammensetzen(bereich, w))}
            optionen={[{ wert: 'CH', text: 'Ganze Schweiz' },
                       ...kantone.map((kt) => ({ wert: kt.kuerzel, text: `${kt.name} (${kt.anzahl})`, kurz: kt.name }))]}
            className="mt-1 w-full border border-sbb-cloud bg-white px-3 py-2.5 text-sbb-black
                       disabled:opacity-60 dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white"
          />
        </div>
      </div>

      {bereich === 'bahnhoefe' && (paar ? (
        <PaarDuell paar={paar} setPaar={setPaar} waehlbar={waehlbar} nameVon={nameVon}
                   setzen={paarSetzen} beenden={() => setPaar(null)} />
      ) : (
        <button type="button" onClick={() => setPaar({ a: null, b: null, reihe: [], nr: 0, richtig: 0,
                                                        gewaehlt: null, eintraege: [] })}
                className="kachel kachel-link mt-3 flex min-h-11 w-full items-center justify-between gap-3
                           px-4 py-3 text-left font-medium">
          Zwei Bahnhöfe selbst wählen
          <span className="pfeil" aria-hidden="true">→</span>
        </button>
      ))}

      {paar && bereich === 'bahnhoefe' ? null : runde && k ? (
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
                ? 'border-transparent bg-sbb-kachel dark:bg-sbb-charcoal hover:bg-sbb-silver dark:hover:bg-sbb-iron'
                : istRichtig
                  ? 'border-sbb-green bg-sbb-green-bg dark:bg-sbb-green/15'
                  : i === gewaehlt
                    ? 'border-sbb-red bg-white dark:bg-sbb-midnight'
                    : 'border-transparent bg-sbb-kachel dark:bg-sbb-charcoal opacity-60'
              return (
                <li key={b.schluessel}>
                  <button
                    type="button" onClick={() => waehlen(i)} disabled={aufgeloest}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-4
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
                className="mt-4 w-full rounded-lg bg-sbb-red px-4 py-3 font-bold text-white
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
            {gebiet === 'CH'
              ? 'Zu dieser Runde liess sich kein faires Paar finden.'
              : `Im Kanton ${KANTONSNAME[gebiet] ?? gebiet} liessen sich keine `
                + `${BEREICHE[bereich].name} finden, die weit genug auseinanderliegen.`}
          </p>
          <button
            type="button"
            onClick={() => (gebiet === 'CH'
              ? naechste(0) : auswahlWechseln(zusammensetzen(bereich, 'CH')))}
            className="mt-4 rounded-lg bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125"
          >{gebiet === 'CH' ? 'Nochmals versuchen' : 'Ganze Schweiz spielen'}</button>
        </div>
      )}

      <p className="mt-8 text-xs text-sbb-metal dark:text-sbb-storm">
        {fussnote(bereich, gebiet, feld.length)}{' '}
        Datenstand: {bereich === 'bahnhoefe' ? daten.datenstand
          : bereich === 'tunnel' ? daten.tunnel_datenstand ?? daten.datenstand
          : daten.linien_datenstand ?? daten.tunnel_datenstand ?? daten.datenstand}.
        {bereich !== 'linien' && kantone.length < 26
          && ` Kantone mit zu wenigen ${BEREICHE[bereich].mehrzahlDativ} für faire Paare fehlen `
             + 'in der Auswahl.'}
      </p>
    </div>
  )
}

/** Wer mitspielt und woher die Werte stammen, unter dem Duell */
function fussnote(bereich: Bereich, gebiet: string, anzahl: number) {
  const kanton = KANTONSNAME[gebiet] ?? gebiet
  if (bereich === 'linien') {
    return `Alle ${anzahl} Linien mit eigener Seite in Taktland sind dabei. Die Werte sind in `
      + 'den offenen Daten gezählt. Eine Linie hat in den Daten keinen Kanton, darum gibt es '
      + 'sie nur für die ganze Schweiz.'
  }
  const wer = bereich === 'tunnel'
    ? (gebiet === 'CH' ? `Alle ${anzahl} Tunnel aus den offenen Daten sind dabei.`
      : `${anzahl} Tunnel im Kanton ${kanton}, nach der Kantonsangabe der Quelle.`)
    : (gebiet === 'CH' ? `Alle ${anzahl} Bahnhöfe sind dabei.`
      : `${anzahl} Bahnhöfe im Kanton ${kanton}.`)
  return `${wer} Jeder Wert stammt unverändert aus den offenen Daten.`
}

/** Das Duell mit zwei selbst gewählten Bahnhöfen */
function PaarDuell({ paar, setPaar, waehlbar, nameVon, setzen, beenden }: {
  paar: Paar
  setPaar: (p: Paar) => void
  waehlbar: IndexEintrag[]
  nameVon: (uic: number | null) => string
  setzen: (a: number | null, b: number | null) => void
  beenden: () => void
}) {
  const k = paar.reihe[paar.nr]
  const fertig = paar.eintraege.length === 2 && paar.reihe.length > 0 && paar.nr >= paar.reihe.length
  const werte = k ? paar.eintraege.map((g) => wertVon(g, k)) : []
  const vorn = k ? werte.indexOf(k.richtung === 'tiefster' ? Math.min(...werte) : Math.max(...werte)) : -1
  const aufgeloest = paar.gewaehlt !== null

  return (
    <div className="kachel mt-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">Zwei Bahnhöfe selbst wählen</p>
        <button type="button" onClick={beenden}
                className="min-h-11 rounded-lg px-3 text-sm font-medium hover:bg-sbb-silver dark:hover:bg-sbb-iron">
          Zufällig spielen
        </button>
      </div>
      <div className="mt-2 grid gap-2">
        <BahnhofFeld bezeichnung="Erster Bahnhof" wert={paar.a} bahnhoefe={waehlbar} name={nameVon}
                     aendern={(u) => setzen(u, paar.b)} />
        <BahnhofFeld bezeichnung="Zweiter Bahnhof" wert={paar.b} bahnhoefe={waehlbar} name={nameVon}
                     aendern={(u) => setzen(paar.a, u)} />
      </div>

      {paar.a !== null && paar.b !== null && paar.a === paar.b && (
        <p className="mt-3">Wähl zwei verschiedene Bahnhöfe.</p>
      )}
      {paar.eintraege.length === 2 && paar.reihe.length === 0 && (
        <p className="mt-3">
          In keiner Kategorie liegen diese beiden weit genug auseinander, dass man es wissen kann.
          Wähl ein anderes Paar.
        </p>
      )}

      {k && !fertig && (
        <>
          <p className="mt-4 text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
            Frage {paar.nr + 1} von {paar.reihe.length} · {k.titel}
          </p>
          <p className="mt-1 text-lg font-medium">{k.frage}</p>
          <ul className="mt-3 space-y-2">
            {paar.eintraege.map((g, i) => {
              const rahmen = !aufgeloest
                ? 'border-transparent bg-white dark:bg-sbb-midnight hover:bg-sbb-silver dark:hover:bg-sbb-iron'
                : i === vorn ? 'border-sbb-green bg-sbb-green-bg dark:bg-sbb-green/15'
                  : i === paar.gewaehlt ? 'border-sbb-red bg-white dark:bg-sbb-midnight'
                    : 'border-transparent bg-white opacity-60 dark:bg-sbb-midnight'
              return (
                <li key={g.schluessel}>
                  <button type="button" disabled={aufgeloest}
                          onClick={() => setPaar({ ...paar, gewaehlt: i, richtig: paar.richtig + (i === vorn ? 1 : 0) })}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-4
                                      text-left transition ${rahmen}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{g.name}</span>
                      {g.unterzeile && <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{g.unterzeile}</span>}
                    </span>
                    {aufgeloest && <span className="shrink-0 font-bold tabular-nums">{zahl(wertVon(g, k), k)}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {aufgeloest && (
            <>
              <div className={`mt-3 border-l-2 px-3 py-2 text-sm ${paar.gewaehlt === vorn
                ? 'border-sbb-green bg-sbb-green-bg dark:bg-sbb-green/15' : 'border-sbb-red bg-white dark:bg-sbb-midnight'}`}>
                <p className="font-bold">{paar.gewaehlt === vorn ? 'Richtig' : 'Nicht ganz'}</p>
                <p className="mt-0.5">{paar.eintraege[vorn].name} liegt vorn: {mitPunkt(zahl(werte[vorn], k))}</p>
                {k.hinweis && <p className="mt-1">{k.hinweis}</p>}
                <p className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">Quelle: {k.quelle}</p>
              </div>
              <button type="button" onClick={() => setPaar({ ...paar, nr: paar.nr + 1, gewaehlt: null })}
                      className="mt-3 w-full rounded-lg bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125">
                {paar.nr + 1 < paar.reihe.length ? 'Nächste Frage' : 'Auswertung'}
              </button>
            </>
          )}
        </>
      )}

      {fertig && (
        <>
          <p className="mt-4 text-lg font-medium">
            {paar.richtig} von {paar.reihe.length} richtig.
          </p>
          <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
            Mehr dazu:{' '}
            {paar.eintraege.map((g, i) => (
              <span key={g.schluessel}>
                {i > 0 && ' · '}
                <a href={g.link} className="underline underline-offset-2 hover:text-sbb-red">{g.linkText}</a>
              </span>
            ))}
          </p>
          <button type="button" onClick={() => setzen(paar.a, paar.b)}
                  className="mt-3 w-full rounded-lg bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125">
            Nochmals, neu gemischt
          </button>
        </>
      )}

      <p className="mt-3 text-xs text-sbb-metal dark:text-sbb-storm">
        Gefragt wird nur, wo beide Bahnhöfe einen Wert haben und die Werte weit genug auseinanderliegen.
        Serie und Bestwert zählen hier nicht.
      </p>
    </div>
  )
}
