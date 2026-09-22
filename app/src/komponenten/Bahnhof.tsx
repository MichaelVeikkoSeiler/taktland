import { useEffect, useState, type ReactNode } from 'react'
import { linienLaden, profilLaden } from '../daten'
import { antwortSpeichern, antwortenLesen, bahnhofZuruecksetzen } from '../fortschritt'
import type { Fakt, Gleis, IndexEintrag, Kapitel, LinienEintrag, Profil } from '../typen'
import { Frage } from './Frage'
import { Luecken } from './Luecken'
import { streckenAdresse } from './Strecke'
import { BahnKuerzel } from './Suche'
import { Zurueck } from './Zurueck'
import { kantonText } from '../kanton'
import { Ladefehler } from './Ladefehler'

const STUFE_TEXT: Record<string, string> = {
  L: 'Grosser Bahnhof', M: 'Mittlerer Bahnhof', S: 'Kleiner Bahnhof',
}

/** kanton aus dem Index, wie in der Liste: «Kanton TG», bei Jestetten «Ausland» */
export function Bahnhof({ uic, zurueck, eintrag }: {
  uic: number
  zurueck: () => void
  /** der Eintrag im Index: Kanton, Bahn der Infrastruktur, im Streckennetz */
  eintrag: IndexEintrag | undefined
}) {
  const kanton = eintrag?.kanton ?? null
  const [profil, setProfil] = useState<Profil | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [antworten, setAntworten] = useState<Record<string, { richtig: boolean }>>({})
  // die Linien mit eigener Seite, auf denen dieser Bahnhof erfasst ist
  const [linien, setLinien] = useState<LinienEintrag[]>([])

  useEffect(() => {
    let abgebrochen = false
    linienLaden()
      .then((v) => {
        if (abgebrochen) return
        const nummern = v.nach_bahnhof[String(uic)] ?? []
        setLinien(v.linien.filter((l) => nummern.includes(l.linie)))
      })
      .catch(() => { if (!abgebrochen) setLinien([]) })
    return () => { abgebrochen = true }
  }, [uic])

  useEffect(() => {
    let abgebrochen = false
    setProfil(null)
    setFehler(null)
    profilLaden(uic)
      .then((p) => { if (!abgebrochen) { setProfil(p); setAntworten(antwortenLesen(uic)) } })
      .catch((e: Error) => { if (!abgebrochen) setFehler(e.message) })
    return () => { abgebrochen = true }
  }, [uic])

  if (fehler) {
    return (
      <Rahmen zurueck={zurueck}>
        <Ladefehler className="px-4 text-sbb-black dark:text-sbb-white"
                    was="Dieses Profil konnte nicht geladen werden." fehler={fehler} />
      </Rahmen>
    )
  }
  if (!profil) {
    return <Rahmen zurueck={zurueck}><p className="px-4 text-sbb-metal">Wird geladen …</p></Rahmen>
  }

  const fragenGesamt = profil.chapters.reduce((n, k) => n + k.questions.length, 0)
  // nur Antworten auf Fragen, die es im Profil noch gibt
  const ids = new Set(profil.chapters.flatMap((k) => k.questions.map((q) => q.id)))
  const aktuelle = Object.entries(antworten).filter(([id]) => ids.has(id))
  const beantwortet = aktuelle.length
  const richtig = aktuelle.filter(([, a]) => a.richtig).length

  function merken(frageId: string, war: boolean) {
    antwortSpeichern(uic, frageId, war)
    setAntworten((a) => ({ ...a, [frageId]: { richtig: war } }))
  }

  return (
    <Rahmen zurueck={zurueck}>
      <header className="px-4">
        <h1 className="text-2xl font-bold text-sbb-black dark:text-sbb-white">{profil.name}</h1>
        <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
          {kanton ? `${kantonText(kanton)} · ` : ''}{STUFE_TEXT[profil.tier]} · Fahrgastzahlen{' '}
          {profil.dataYear} · {fragenGesamt} Fragen
        </p>
        {eintrag?.isb && (
          <p className="mt-2 flex items-start gap-2 text-sm text-sbb-black dark:text-sbb-white">
            <BahnKuerzel isb={eintrag.isb} />
            <span>
              Die Infrastruktur dieses Bahnhofs betreibt die {eintrag.isb}, nicht die SBB. Die
              offenen Daten der SBB enthalten dazu weniger, etwa keine Perrons; darum hat diese
              Seite weniger Kapitel.
            </span>
          </p>
        )}
        {eintrag?.im_netz && (
          <p className="mt-2 text-sm">
            <a href={streckenAdresse({ von: uic, nach: null, ueber: null })}
               className="text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                          dark:text-sbb-storm dark:hover:text-sbb-white">
              Strecke ab hier: Tunnel und Brücken bis zu einem anderen Bahnhof
            </a>
          </p>
        )}
        {beantwortet > 0 && (
          <p className="mt-2 flex items-center gap-3 text-sm text-sbb-metal dark:text-sbb-storm">
            <span>{richtig} von {beantwortet} richtig</span>
            <button
              type="button"
              onClick={() => { bahnhofZuruecksetzen(uic); setAntworten({}) }}
              className="underline underline-offset-2"
            >
              zurücksetzen
            </button>
          </p>
        )}
      </header>

      <div className="px-4">
        {profil.chapters.map((k) => (
          <KapitelBlock key={k.id} kapitel={k} antworten={antworten} merken={merken}
                        gleise={profil.gleise}
                        anhang={k.id === 'linien' && linien.length > 0
                          ? <LinienLinks linien={linien} /> : undefined} />
        ))}
        {linien.length > 0 && !profil.chapters.some((k) => k.id === 'linien') && !eintrag?.linien?.length && (
          <section className="mt-10">
            <h2 className="text-xl font-bold tracking-tight">Linien</h2>
            <p className="mt-2 leading-relaxed">
              In den Daten der SBB zu den Linien ist {profil.name} nicht erfasst. Das Schienennetz
              des BAV führt den Bahnhof auf {linien.length === 1 ? 'dieser Linie' : 'diesen Linien'}:
            </p>
            <LinienLinks linien={linien} />
          </section>
        )}
        <Luecken luecken={profil.luecken} />
        <Quellen profil={profil} />
      </div>
    </Rahmen>
  )
}

/** Von der Bahnhofsseite zu den Linien, auf denen der Bahnhof erfasst ist */
function LinienLinks({ linien }: { linien: LinienEintrag[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {linien.map((l) => (
        <li key={l.linie}>
          <a href={`#/linie/${l.linie}`}
             className="flex items-center justify-between gap-3 border border-sbb-cloud bg-white
                        px-3 py-2 hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight
                        dark:hover:border-sbb-white">
            <span className="min-w-0">
              <span className="font-medium text-sbb-black dark:text-sbb-white">Linie {l.linie}</span>
              {l.bahn && <span className="ml-2"><BahnKuerzel isb={l.bahn} titel={`Datenherr laut BAV: ${l.bahn}`} /></span>}
              <span className="ml-2 text-sm text-sbb-metal dark:text-sbb-storm">{l.name}</span>
            </span>
            <span className="shrink-0 text-sbb-metal dark:text-sbb-storm" aria-hidden="true">→</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export function KapitelBlock({ kapitel, antworten, merken, gleise, anhang, verweis }: {
  kapitel: Kapitel
  antworten: Record<string, { richtig: boolean }>
  merken: (id: string, richtig: boolean) => void
  gleise?: Gleis[]
  /** zusätzlicher Inhalt nach den Fakten, etwa Links zu den Linienseiten */
  anhang?: ReactNode
  /** Linienseite: wohin eine Kachel führt, etwa zu allen Brücken im Kanton Ticino */
  verweis?: (f: Fakt) => string | undefined
}) {
  // Zeilen mit Bahnhof werden zur Liste mit Links (Linienseite, Kapitel Bahnhöfe)
  const kaesten = kapitel.facts.filter((f) => f.uic === undefined)
  const bahnhoefe = kapitel.facts.filter((f) => f.uic !== undefined)
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-sbb-black dark:text-sbb-white">{kapitel.title}</h2>
      <p className="mt-2 leading-relaxed text-sbb-black dark:text-sbb-white">{kapitel.body}</p>

      {kaesten.length > 0 && (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {kaesten.map((f) => {
            // Liste (Linienseite) oder Bahnhof am Anfang oder Ende einer Linie
            const liste = verweis?.(f)
            const href = liste ?? (f.bahnhof ? `#/bahnhof/${f.bahnhof}` : undefined)
            return <FaktZeile key={f.factRef + f.label} fakt={f} href={href}
                              zielText={f.eintrag !== undefined ? 'In der Liste zeigen'
                                : liste ? 'Alle anzeigen' : 'Zur Bahnhofsseite'} />
          })}
        </dl>
      )}

      {bahnhoefe.length > 0 && <BahnhofListe fakten={bahnhoefe} />}

      {anhang}

      {kapitel.erlaeuterung && (
        <aside className="mt-4 border-l-4 border-sbb-red bg-sbb-milk px-4 py-3
                          dark:bg-sbb-charcoal">
          <p className="text-xs font-semibold uppercase tracking-wide text-sbb-metal
                        dark:text-sbb-storm">
            Zum Verständnis
          </p>
          <p className="mt-1 text-sm text-sbb-black dark:text-sbb-white">{kapitel.erlaeuterung}</p>
          <p className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
            Allgemeine Erklärung, keine Angabe zu diesem Bahnhof.
          </p>
        </aside>
      )}

      {kapitel.questions.map((f) => {
        const id = f.id
        return (
          <Frage
            key={id}
            frage={f}
            gleise={gleise}
            beantwortet={id in antworten}
            onAntwort={(richtig) => merken(id, richtig)}
          />
        )
      })}
    </section>
  )
}

/** Bahnhöfe einer Linie, jeder mit Link zu seiner Seite */
function BahnhofListe({ fakten }: { fakten: Fakt[] }) {
  return (
    <div className="mt-4">
      <ol className="divide-y divide-sbb-cloud border border-sbb-cloud bg-white
                     dark:divide-sbb-iron dark:border-sbb-iron dark:bg-sbb-midnight">
        {fakten.map((f) => (
          <li key={f.factRef}>
            <a href={`#/bahnhof/${f.uic}`}
               className="flex items-baseline justify-between gap-3 px-3 py-2
                          hover:bg-sbb-milk dark:hover:bg-sbb-charcoal">
              <span className="min-w-0 font-medium text-sbb-black dark:text-sbb-white">
                {f.label}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-sbb-metal dark:text-sbb-storm">
                km {genau(f.value)}
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">Quelle: {fakten[0].source}</p>
    </div>
  )
}

/** Zahlen so, wie sie in den Daten stehen. toLocaleString rundet sonst auf
 *  drei Nachkommastellen: aus km 54.85391 wurde 54.854. */
function genau(wert: Fakt['value']) {
  return typeof wert === 'number'
    ? wert.toLocaleString('de-CH', { maximumFractionDigits: 20 })
    : String(wert ?? '—')
}

function FaktZeile({ fakt, href, zielText = 'Alle anzeigen' }: {
  fakt: Fakt
  href?: string
  zielText?: string
}) {
  const wert = typeof fakt.value === 'number'
    ? genau(fakt.value)
    : typeof fakt.value === 'boolean'
      ? (fakt.value ? 'ja' : 'nein')
      : String(fakt.value ?? '—')
  const lang = wert.length > 40
  // Mit Verweis wird die ganze Kachel zum Link: ein Link über der Fläche, damit
  // dt und dd direkt im dl bleiben
  return (
    <div className={`relative border border-sbb-cloud bg-white px-3 py-2
                     dark:border-sbb-iron dark:bg-sbb-midnight ${
      href ? 'hover:border-sbb-black dark:hover:border-sbb-white' : ''}`}>
      {href && (
        <>
          <a href={href} className="absolute inset-0"
             aria-label={`${zielText}: ${fakt.label}, ${wert}${fakt.unit ? ` ${fakt.unit}` : ''}`} />
          <span aria-hidden="true"
                className="absolute right-3 top-2 text-sbb-metal dark:text-sbb-storm">→</span>
        </>
      )}
      <dt className="text-xs text-sbb-metal dark:text-sbb-storm">{fakt.label}</dt>
      <dd className={`font-semibold text-sbb-black dark:text-sbb-white ${
        lang ? 'truncate text-sm font-normal' : 'text-lg tabular-nums'}`}>
        {wert}{fakt.unit ? ` ${fakt.unit}` : ''}
      </dd>
      <dd className="mt-0.5 text-xs text-sbb-metal dark:text-sbb-storm">Quelle: {fakt.source}</dd>
    </div>
  )
}

export function Quellen({ profil }: { profil: { sources: string[]; generated: string } }) {
  return (
    <section className="mt-8 border-t border-sbb-cloud pt-4 dark:border-sbb-iron">
      <h2 className="text-sm font-semibold text-sbb-black dark:text-sbb-white">
        Woher diese Angaben stammen
      </h2>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
        {herkunft(profil.sources)}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {profil.sources.map((s) => (
          <li key={s} className="bg-sbb-cloud px-2 py-0.5 text-xs text-sbb-metal
                                 dark:bg-sbb-midnight dark:text-sbb-storm">
            {s}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-sbb-black dark:text-sbb-white">
        Trotz Prüfung können Fehler enthalten sein, in den Rohdaten wie in der Aufbereitung.
      </p>
      <p className="mt-2 text-xs text-sbb-metal dark:text-sbb-storm">
        Stand der Aufbereitung: {profil.generated}
      </p>
    </section>
  )
}

/** Die Herkunft der Angaben: offene Daten der SBB, das Schienennetz des BAV oder beide */
function herkunft(quellen: string[]) {
  const bav = quellen.includes('schienennetz')
  const sbb = quellen.some((q) => q !== 'schienennetz')
  const netz = 'dem Schienennetz des Bundesamts für Verkehr BAV (data.geo.admin.ch, Stand 2021)'
  if (bav && !sbb) return `Alle Angaben stammen aus ${netz}:`
  if (bav) return `Die Angaben stammen aus offenen Daten der SBB (data.sbb.ch) und aus ${netz}, verwendete Datensätze:`
  return 'Alle Angaben stammen aus offenen Daten der SBB (data.sbb.ch), verwendete Datensätze:'
}

export function Rahmen({ children, zurueck, zurueckText = 'Alle Bahnhöfe' }: {
  children: ReactNode
  zurueck: () => void
  zurueckText?: string
}) {
  return (
    <div className="pb-16">
      <div className="px-4">
        <Zurueck onClick={zurueck} text={zurueckText} />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}
