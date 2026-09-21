import { useEffect, useMemo, useRef } from 'react'
import type { BahnhofIndex, IndexEintrag } from '../typen'

const STUFE_TEXT: Record<string, string> = {
  L: 'Grosser Bahnhof', M: 'Mittlerer Bahnhof', S: 'Kleiner Bahnhof',
}

/** So viele Bahnhöfe stehen auf einer Seite. Vorher wuchs die Liste mit
 *  «Weitere anzeigen» um je 60 Einträge, bis alle untereinander standen. */
const PRO_SEITE = 20

/** Was die Liste sich merkt, solange die App offen ist. Sie verschwindet,
 *  wenn ein Bahnhof offen ist: Wer zurückkommt, landet auf derselben Seite. */
export interface ListenStand {
  begriff: string
  nurMitProfil: boolean
  seite: number
}

/** Umlaute und Akzente ignorieren, damit «Zurich» auch «Zürich» findet. */
function vereinfachen(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function Suche({ index, oeffnen, stand, aendern }: {
  index: BahnhofIndex
  oeffnen: (uic: number) => void
  stand: ListenStand
  aendern: (neu: ListenStand) => void
}) {
  const { begriff, nurMitProfil } = stand
  const listeOben = useRef<HTMLDivElement>(null)

  const treffer = useMemo(() => {
    const b = vereinfachen(begriff.trim())
    let liste = index.bahnhoefe
    if (nurMitProfil) liste = liste.filter((e) => e.sprachen.length > 0)
    if (b) liste = liste.filter((e) => vereinfachen(e.name).includes(b) ||
                                       String(e.uic).startsWith(b) ||
                                       vereinfachen(e.kanton ?? '').includes(b))
    return liste
  }, [begriff, nurMitProfil, index.bahnhoefe])

  const seiten = Math.max(1, Math.ceil(treffer.length / PRO_SEITE))
  const seite = Math.min(stand.seite, seiten - 1)
  const von = seite * PRO_SEITE
  const sichtbar = treffer.slice(von, von + PRO_SEITE)

  function blaettern(neu: number, nachOben = false) {
    const ziel = Math.max(0, Math.min(seiten - 1, neu))
    if (ziel === seite) return
    aendern({ ...stand, seite: ziel })
    if (nachOben) listeOben.current?.scrollIntoView({ block: 'start' })
  }

  // Pfeiltasten blättern, ausser beim Tippen im Suchfeld oder in der Seitenwahl
  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
      if (e.key === 'ArrowLeft') blaettern(seite - 1)
      if (e.key === 'ArrowRight') blaettern(seite + 1)
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  })

  const leiste = { seite, seiten, von, bis: von + sichtbar.length, gesamt: treffer.length }

  return (
    <div className="px-4 pb-16">
      <label className="block">
        <span className="sr-only">Bahnhof suchen</span>
        <input
          type="search"
          value={begriff}
          onChange={(e) => aendern({ ...stand, begriff: e.target.value, seite: 0 })}
          placeholder="Bahnhof suchen"
          autoComplete="off"
          className="w-full border border-sbb-cloud bg-white px-4 py-3 text-lg
                     text-sbb-black placeholder:text-sbb-metal dark:border-sbb-iron
                     dark:bg-sbb-midnight dark:text-sbb-white"
        />
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm text-sbb-metal dark:text-sbb-storm">
        <input
          type="checkbox"
          checked={nurMitProfil}
          onChange={(e) => aendern({ ...stand, nurMitProfil: e.target.checked, seite: 0 })}
          className="size-4 accent-sbb-red"
        />
        Nur Bahnhöfe mit Lerninhalten
      </label>

      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        {index.mit_profil} von {index.bahnhoefe_gesamt} Bahnhöfen mit Lerninhalten
      </p>

      <a
        href="#/duell"
        className="mt-4 flex items-center justify-between gap-3 border border-l-4
                   border-sbb-cloud border-l-sbb-red bg-white px-4 py-3 transition
                   hover:border-sbb-black hover:border-l-sbb-red dark:border-sbb-iron
                   dark:border-l-sbb-red dark:bg-sbb-midnight dark:hover:border-sbb-white
                   dark:hover:border-l-sbb-red"
      >
        <span className="min-w-0">
          <span className="block font-medium text-sbb-black dark:text-sbb-white">Duell</span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
            Zwei Bahnhöfe gegeneinander, über alle {index.bahnhoefe_gesamt}
          </span>
        </span>
        <span className="shrink-0 text-sm text-sbb-metal dark:text-sbb-storm">→</span>
      </a>

      <div ref={listeOben} className="scroll-mt-2">
        <Blaettern {...leiste} blaettern={(n) => blaettern(n)} name="Seiten" />
      </div>

      <ul className="mt-4 space-y-2 border-t border-sbb-cloud pt-4 dark:border-sbb-iron">
        {sichtbar.map((e) => <Eintrag key={e.uic} e={e} oeffnen={oeffnen} />)}
      </ul>

      {/* unten zurück an den Anfang der Liste, sonst stünde man mitten in der neuen Seite */}
      <Blaettern {...leiste} blaettern={(n) => blaettern(n, true)} name="Seiten, unten" />

      {treffer.length === 0 && (
        <p className="mt-8 text-center text-sbb-metal dark:text-sbb-storm">
          Kein Bahnhof gefunden.
          {nurMitProfil && ' Versuche es ohne den Filter für Lerninhalte.'}
        </p>
      )}
    </div>
  )
}

/** Pfeile in beide Richtungen, dazwischen die Seitenwahl zum direkten Springen. */
function Blaettern({ seite, seiten, von, bis, gesamt, blaettern, name }: {
  seite: number
  seiten: number
  von: number
  bis: number
  gesamt: number
  blaettern: (neu: number) => void
  name: string
}) {
  if (seiten <= 1) return null
  const pfeil = `flex w-14 shrink-0 items-center justify-center border border-sbb-cloud
                 bg-white text-2xl text-sbb-black transition hover:border-sbb-black
                 disabled:cursor-default disabled:opacity-30 disabled:hover:border-sbb-cloud
                 dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white
                 dark:hover:border-sbb-white dark:disabled:hover:border-sbb-iron`
  return (
    <nav aria-label={name} className="mt-4 flex min-h-14 items-stretch gap-2">
      <button
        type="button" className={pfeil} disabled={seite === 0}
        onClick={() => blaettern(seite - 1)} aria-label="Vorherige Seite"
      >
        ←
      </button>
      <label className="flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center
                        border border-sbb-cloud bg-white px-2 py-1 hover:border-sbb-black
                        dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white">
        <span className="sr-only">Seite wählen</span>
        <select
          value={seite}
          onChange={(e) => blaettern(Number(e.target.value))}
          className="cursor-pointer appearance-none bg-transparent text-center font-medium
                     text-sbb-black dark:text-sbb-white"
        >
          {Array.from({ length: seiten }, (_, i) => (
            <option key={i} value={i}>Seite {i + 1} von {seiten}</option>
          ))}
        </select>
        <span className="text-xs text-sbb-metal dark:text-sbb-storm">
          {von + 1}–{bis} von {gesamt}
        </span>
      </label>
      <button
        type="button" className={pfeil} disabled={seite === seiten - 1}
        onClick={() => blaettern(seite + 1)} aria-label="Nächste Seite"
      >
        →
      </button>
    </nav>
  )
}

function Eintrag({ e, oeffnen }: { e: IndexEintrag; oeffnen: (uic: number) => void }) {
  const hatProfil = e.sprachen.length > 0
  return (
    <li>
      <button
        type="button"
        disabled={!hatProfil}
        onClick={() => hatProfil && oeffnen(e.uic)}
        className={`flex w-full items-center justify-between gap-3 border px-4 py-3
                    text-left transition ${
          hatProfil
            ? 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight'
            : 'cursor-default border-dashed border-sbb-cloud bg-transparent opacity-70 dark:border-sbb-iron'
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-sbb-black dark:text-sbb-white">
            {e.name}
          </span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
            {e.kanton ? `Kanton ${e.kanton} · ` : ''}{STUFE_TEXT[e.tier]}
            {e.dwv != null && ` · ${e.dwv.toLocaleString('de-CH')} pro Werktag`}
          </span>
        </span>
        <span className="shrink-0 text-sm text-sbb-metal dark:text-sbb-storm">
          {hatProfil ? '→' : 'noch keine Inhalte'}
        </span>
      </button>
    </li>
  )
}
