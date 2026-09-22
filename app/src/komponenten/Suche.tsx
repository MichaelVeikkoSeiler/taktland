import { useMemo } from 'react'
import type { BahnhofIndex, IndexEintrag } from '../typen'
import { kantonText } from '../kanton'
import { Blaettern, useSeiten, vereinfachen } from './Blaettern'

const STUFE_TEXT: Record<string, string> = {
  L: 'Grosser Bahnhof', M: 'Mittlerer Bahnhof', S: 'Kleiner Bahnhof',
}

/** Was die Liste sich merkt, solange die App offen ist. Sie verschwindet,
 *  wenn ein Bahnhof offen ist: Wer zurückkommt, landet auf derselben Seite. */
export interface ListenStand {
  begriff: string
  seite: number
  sortierung: 'alphabet' | 'frequenz'
}

export function Suche({ index, oeffnen, stand, aendern }: {
  index: BahnhofIndex
  oeffnen: (uic: number) => void
  stand: ListenStand
  aendern: (neu: ListenStand) => void
}) {
  const { begriff, sortierung } = stand

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

  const { listeOben, sichtbar, leiste, blaettern } = useSeiten(
    treffer, stand.seite, (seite) => aendern({ ...stand, seite }), (e) => e.name)

  return (
    <div className="px-4 pb-16 pt-5">
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
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-sbb-black dark:text-sbb-white">{e.name}</span>
            {e.isb && <BahnKuerzel isb={e.isb} />}
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

/** Kennzeichen für Bahnhöfe, deren Infrastruktur nicht die SBB betreibt */
export function BahnKuerzel({ isb }: { isb: string }) {
  return (
    <span title={`Infrastruktur: ${isb}`} aria-label={`Infrastruktur ${isb}`}
          className="shrink-0 border border-sbb-metal px-1 text-xs font-medium leading-4
                     text-sbb-metal dark:border-sbb-storm dark:text-sbb-storm">
      {isb}
    </span>
  )
}
