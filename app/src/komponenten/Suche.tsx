import { useEffect, useMemo, useRef } from 'react'
import type { BahnhofIndex, IndexEintrag } from '../typen'
import { kantonText } from '../kanton'

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
  seite: number
  sortierung: 'alphabet' | 'frequenz'
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
  const { begriff, sortierung } = stand
  const listeOben = useRef<HTMLDivElement>(null)

  const treffer = useMemo(() => {
    const b = vereinfachen(begriff.trim())
    let liste = index.bahnhoefe
    if (b) liste = liste.filter((e) => vereinfachen(e.name).includes(b) ||
                                       String(e.uic).startsWith(b) ||
                                       vereinfachen(e.kanton ?? '').includes(b))
    // Der Index kommt nach Ein- und Aussteigenden geordnet, grösste zuerst
    if (sortierung === 'alphabet') {
      liste = [...liste].sort((a, b) => a.name.localeCompare(b.name, 'de-CH', { sensitivity: 'base' }))
    }
    return liste
  }, [begriff, sortierung, index.bahnhoefe])

  const seiten = Math.max(1, Math.ceil(treffer.length / PRO_SEITE))
  const seite = Math.min(stand.seite, seiten - 1)
  const von = seite * PRO_SEITE
  const sichtbar = treffer.slice(von, von + PRO_SEITE)

  // Wie die Kopfzeile im Wörterbuch: erster und letzter Bahnhof jeder Seite
  const bereiche = useMemo(() => Array.from({ length: seiten }, (_, i) => {
    const erster = treffer[i * PRO_SEITE]?.name ?? ''
    const letzter = treffer[Math.min((i + 1) * PRO_SEITE, treffer.length) - 1]?.name ?? ''
    return erster === letzter ? erster : `${erster} – ${letzter}`
  }), [treffer, seiten])

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

  const leiste = { seite, seiten, bereiche }

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
        Sortierung
        <select
          value={sortierung}
          onChange={(e) => aendern({ ...stand, sortierung: e.target.value as ListenStand['sortierung'], seite: 0 })}
          className="min-w-0 border border-sbb-cloud bg-white px-2 py-1 text-sbb-black
                     dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white"
        >
          <option value="alphabet">Alphabetisch</option>
          <option value="frequenz">Meiste Ein- und Aussteigende zuerst</option>
        </select>
      </label>

      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        {begriff.trim()
          ? `${treffer.length} von ${index.bahnhoefe_gesamt} Bahnhöfen`
          : index.mit_profil === index.bahnhoefe_gesamt
            ? `${index.bahnhoefe_gesamt} Bahnhöfe`
            : `${index.mit_profil} von ${index.bahnhoefe_gesamt} Bahnhöfen mit Lerninhalten`}
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

      <a
        href="#/linien"
        className="mt-2 flex items-center justify-between gap-3 border border-sbb-cloud
                   bg-white px-4 py-3 transition hover:border-sbb-black dark:border-sbb-iron
                   dark:bg-sbb-midnight dark:hover:border-sbb-white"
      >
        <span className="min-w-0">
          <span className="block font-medium text-sbb-black dark:text-sbb-white">Linien</span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
            Strecken mit ihren Bahnhöfen, Tunneln und Brücken
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
        </p>
      )}
    </div>
  )
}

/** Pfeile in beide Richtungen. Dazwischen erster und letzter Bahnhof der
 *  Seite; ein Tipp darauf öffnet die Seitenwahl mit den Bereichen aller Seiten. */
function Blaettern({ seite, seiten, bereiche, blaettern, name }: {
  seite: number
  seiten: number
  bereiche: string[]
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
      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center border
                      border-sbb-cloud bg-white px-2 py-1 focus-within:border-sbb-black
                      hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight
                      dark:focus-within:border-sbb-white dark:hover:border-sbb-white">
        <span className="block w-full text-center leading-tight font-medium text-balance
                         break-words text-sbb-black dark:text-sbb-white">
          {bereiche[seite]}
        </span>
        <span className="text-xs text-sbb-metal dark:text-sbb-storm">
          Seite {seite + 1} von {seiten}
        </span>
        {/* unsichtbar über dem Feld: ein Tipp öffnet die Auswahl des Geräts */}
        <select
          aria-label="Seite wählen"
          value={seite}
          onChange={(e) => blaettern(Number(e.target.value))}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        >
          {bereiche.map((b, i) => (
            <option key={i} value={i}>Seite {i + 1}: {b}</option>
          ))}
        </select>
      </div>
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
            {e.kanton ? `${kantonText(e.kanton)} · ` : ''}{STUFE_TEXT[e.tier]}
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
