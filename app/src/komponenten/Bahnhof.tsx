import { useEffect, useState } from 'react'
import { profilLaden } from '../daten'
import { antwortSpeichern, antwortenLesen, bahnhofZuruecksetzen } from '../fortschritt'
import type { Fakt, Gleis, Kapitel, Profil } from '../typen'
import { Frage } from './Frage'
import { Luecken } from './Luecken'

const STUFE_TEXT: Record<string, string> = {
  L: 'Grosser Bahnhof', M: 'Mittlerer Bahnhof', S: 'Kleiner Bahnhof',
}

export function Bahnhof({ uic, zurueck }: { uic: number; zurueck: () => void }) {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [antworten, setAntworten] = useState<Record<string, { richtig: boolean }>>({})

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
        <p className="px-4 text-sbb-black dark:text-sbb-white">
          Dieses Profil konnte nicht geladen werden. {fehler}
        </p>
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
          {STUFE_TEXT[profil.tier]} · Daten von {profil.dataYear} · {fragenGesamt} Fragen
        </p>
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
                        gleise={profil.gleise} />
        ))}
        <Luecken luecken={profil.luecken} />
        <Quellen profil={profil} />
      </div>
    </Rahmen>
  )
}

function KapitelBlock({ kapitel, antworten, merken, gleise }: {
  kapitel: Kapitel
  antworten: Record<string, { richtig: boolean }>
  merken: (id: string, richtig: boolean) => void
  gleise?: Gleis[]
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-sbb-black dark:text-sbb-white">{kapitel.title}</h2>
      <p className="mt-2 leading-relaxed text-sbb-black dark:text-sbb-white">{kapitel.body}</p>

      {kapitel.facts.length > 0 && (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {kapitel.facts.map((f) => <FaktZeile key={f.factRef + f.label} fakt={f} />)}
        </dl>
      )}

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

function FaktZeile({ fakt }: { fakt: Fakt }) {
  const wert = typeof fakt.value === 'number'
    ? fakt.value.toLocaleString('de-CH')
    : typeof fakt.value === 'boolean'
      ? (fakt.value ? 'ja' : 'nein')
      : String(fakt.value ?? '—')
  const lang = wert.length > 40
  return (
    <div className="border border-sbb-cloud bg-white px-3 py-2
                    dark:border-sbb-iron dark:bg-sbb-midnight">
      <dt className="text-xs text-sbb-metal dark:text-sbb-storm">{fakt.label}</dt>
      <dd className={`font-semibold text-sbb-black dark:text-sbb-white ${
        lang ? 'truncate text-sm font-normal' : 'text-lg tabular-nums'}`}>
        {wert}{fakt.unit ? ` ${fakt.unit}` : ''}
      </dd>
      <dd className="mt-0.5 text-xs text-sbb-metal dark:text-sbb-storm">Quelle: {fakt.source}</dd>
    </div>
  )
}

function Quellen({ profil }: { profil: Profil }) {
  return (
    <section className="mt-8 border-t border-sbb-cloud pt-4 dark:border-sbb-iron">
      <h2 className="text-sm font-semibold text-sbb-black dark:text-sbb-white">
        Woher diese Angaben stammen
      </h2>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
        Alle Angaben stammen aus offenen Daten der SBB (data.sbb.ch), verwendete Datensätze:
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {profil.sources.map((s) => (
          <li key={s} className="bg-sbb-cloud px-2 py-0.5 text-xs text-sbb-metal
                                 dark:bg-sbb-midnight dark:text-sbb-storm">
            {s}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-sbb-metal dark:text-sbb-storm">
        Stand der Aufbereitung: {profil.generated}
      </p>
    </section>
  )
}

function Rahmen({ children, zurueck }: { children: React.ReactNode; zurueck: () => void }) {
  return (
    <div className="pb-16">
      <button
        type="button"
        onClick={zurueck}
        className="mx-4 mb-4 mt-2 text-sbb-metal underline underline-offset-2 dark:text-sbb-storm"
      >
        ← Alle Bahnhöfe
      </button>
      {children}
    </div>
  )
}
