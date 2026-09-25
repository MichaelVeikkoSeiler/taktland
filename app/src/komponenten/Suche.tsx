import { useMemo } from 'react'
import { alphabetisch, useFavoriten } from '../favoriten'
import type { BahnhofIndex, IndexEintrag } from '../typen'
import { kantonText } from '../kanton'
import { Blaettern, useSeiten, vereinfachen } from './Blaettern'
import { Auswahl } from './Auswahl'
import { FavoritKnopf } from './Stern'

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

  const favoriten = useFavoriten()
  const nachUic = useMemo(() => new Map(index.bahnhoefe.map((e) => [e.uic, e])), [index.bahnhoefe])
  // bei leerem Suchfeld stehen die Favoriten oben (Michael, 2026-09-25)
  const favoritenOben = begriff.trim() ? []
    : alphabetisch(favoriten.map((u) => nachUic.get(u)).filter((e): e is IndexEintrag => !!e))

  const { listeOben, sichtbar, leiste, blaettern } = useSeiten(
    treffer, stand.seite, (seite) => aendern({ ...stand, seite }), (e) => e.name)

  return (
    <div className="px-4 pb-16 pt-6">
      {/* Titel wie in jedem Bereich (Michael, 2026-09-22) */}
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Bahnhöfe</h1>
      <Suchfeld begriff={begriff} aendern={(b) => aendern({ ...stand, begriff: b, seite: 0 })} />

      <div className="mt-3 flex items-center gap-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Sortierung
        <Auswahl
          titel="Sortierung" wert={sortierung}
          waehlen={(w) => aendern({ ...stand, sortierung: w, seite: 0 })}
          optionen={[{ wert: 'alphabet' as ListenStand['sortierung'], text: 'Alphabetisch' },
                     { wert: 'frequenz' as ListenStand['sortierung'], text: 'Meiste Ein- und Aussteigende zuerst' }]}
          className="min-w-0 border border-sbb-cloud bg-white px-2 py-1 text-sbb-black
                     dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white"
        />
      </div>

      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        {begriff.trim()
          ? `${treffer.length} von ${index.bahnhoefe_gesamt} Bahnhöfen`
          : index.mit_profil === index.bahnhoefe_gesamt
            ? `${index.bahnhoefe_gesamt} Bahnhöfe`
            : `${index.mit_profil} von ${index.bahnhoefe_gesamt} Bahnhöfen mit Lerninhalten`}
      </p>

      {favoritenOben.length > 0 && (
        <section aria-labelledby="favoriten-titel" className="mt-4">
          <h2 id="favoriten-titel" className="text-sm font-medium">Favoriten</h2>
          <ul className="mt-2 space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
            {favoritenOben.map((e) => <Eintrag key={e.uic} e={e} oeffnen={oeffnen} favorit />)}
          </ul>
          <h2 className="mt-6 text-sm font-medium">Alle Bahnhöfe</h2>
        </section>
      )}

      <div ref={listeOben} className="scroll-mt-2">
        <Blaettern {...leiste} blaettern={(n) => blaettern(n)} name="Seiten" />
      </div>

      <ul className="mt-4 space-y-2 border-t border-sbb-cloud pt-4 md:grid md:grid-cols-2 md:gap-2 md:space-y-0 dark:border-sbb-iron">
        {sichtbar.map((e) => <Eintrag key={e.uic} e={e} oeffnen={oeffnen} favorit={favoriten.includes(e.uic)} />)}
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

/** Das Suchfeld der Bahnhöfe; auch bei den Favoriten */
export function Suchfeld({ begriff, aendern }: { begriff: string; aendern: (b: string) => void }) {
  return (
    <label className="block">
      <span className="sr-only">Bahnhof suchen</span>
      <input
        type="search"
        value={begriff}
        onChange={(e) => aendern(e.target.value)}
        placeholder="Bahnhof suchen"
        autoComplete="off"
        className="w-full border border-sbb-cloud bg-white px-4 py-3 text-lg
                   text-sbb-black placeholder:text-sbb-metal dark:border-sbb-iron
                   dark:bg-sbb-midnight dark:text-sbb-white"
      />
    </label>
  )
}

/** Eine Zeile der Bahnhofsliste: öffnet den Bahnhof, daneben der Stern */
export function Eintrag({ e, oeffnen, favorit }: {
  e: IndexEintrag
  oeffnen: (uic: number) => void
  favorit: boolean
}) {
  const hatProfil = e.sprachen.length > 0
  return (
    <li className={`flex items-stretch ${hatProfil ? 'kachel overflow-hidden'
      : 'rounded-lg border border-dashed border-sbb-cloud dark:border-sbb-iron'}`}>
      <button
        type="button"
        disabled={!hatProfil}
        onClick={() => hatProfil && oeffnen(e.uic)}
        className={`flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pl-4 pr-1
                    text-left transition ${
          hatProfil ? 'kachel-link' : 'cursor-default opacity-70'
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
          {hatProfil ? <span className="pfeil" aria-hidden="true">→</span> : 'noch keine Inhalte'}
        </span>
      </button>
      <FavoritKnopf uic={e.uic} name={e.name} favorit={favorit}
                    className="w-12 hover:bg-sbb-silver dark:hover:bg-sbb-iron" />
    </li>
  )
}

/** Kennzeichen für Bahnhöfe, deren Infrastruktur nicht die SBB betreibt */
export function BahnKuerzel({ isb, titel = `Infrastruktur: ${isb}` }: { isb: string; titel?: string }) {
  return (
    <span title={titel} aria-label={titel}
          className="shrink-0 border border-sbb-metal px-1 text-xs font-medium leading-4
                     text-sbb-metal dark:border-sbb-storm dark:text-sbb-storm">
      {isb}
    </span>
  )
}
