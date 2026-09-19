import { useMemo, useState } from 'react'
import type { BahnhofIndex, IndexEintrag } from '../typen'

const STUFE_TEXT: Record<string, string> = {
  L: 'Grosser Bahnhof', M: 'Mittlerer Bahnhof', S: 'Kleiner Bahnhof',
}

/** Umlaute und Akzente ignorieren, damit «Zurich» auch «Zürich» findet. */
function vereinfachen(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function Suche({ index, oeffnen }: { index: BahnhofIndex; oeffnen: (uic: number) => void }) {
  const [begriff, setBegriff] = useState('')
  const [nurMitProfil, setNurMitProfil] = useState(true)

  const treffer = useMemo(() => {
    const b = vereinfachen(begriff.trim())
    let liste = index.bahnhoefe
    if (nurMitProfil) liste = liste.filter((e) => e.sprachen.length > 0)
    if (b) liste = liste.filter((e) => vereinfachen(e.name).includes(b) ||
                                       String(e.uic).startsWith(b) ||
                                       vereinfachen(e.kanton ?? '').includes(b))
    return liste.slice(0, 60)
  }, [begriff, nurMitProfil, index.bahnhoefe])

  return (
    <div className="px-4 pb-16">
      <label className="block">
        <span className="sr-only">Bahnhof suchen</span>
        <input
          type="search"
          value={begriff}
          onChange={(e) => setBegriff(e.target.value)}
          placeholder="Bahnhof suchen"
          autoComplete="off"
          className="w-full rounded-xl border border-takt-300 bg-white px-4 py-3 text-lg
                     text-takt-900 placeholder:text-takt-600/60 dark:border-takt-700
                     dark:bg-takt-900 dark:text-takt-50"
        />
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm text-takt-700 dark:text-takt-300">
        <input
          type="checkbox"
          checked={nurMitProfil}
          onChange={(e) => setNurMitProfil(e.target.checked)}
          className="size-4 accent-takt-600"
        />
        Nur Bahnhöfe mit Lerninhalten
      </label>

      <p className="mt-2 text-sm text-takt-700 dark:text-takt-300">
        {index.mit_profil} von {index.bahnhoefe_gesamt} Bahnhöfen haben bisher Lerninhalte.
        Die übrigen sind aufgeführt, damit sichtbar ist, was noch fehlt.
      </p>

      <ul className="mt-4 space-y-2">
        {treffer.map((e) => <Eintrag key={e.uic} e={e} oeffnen={oeffnen} />)}
      </ul>

      {treffer.length === 0 && (
        <p className="mt-8 text-center text-takt-700 dark:text-takt-300">
          Kein Bahnhof gefunden.
          {nurMitProfil && ' Versuche es ohne den Filter für Lerninhalte.'}
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
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3
                    text-left transition ${
          hatProfil
            ? 'border-takt-300 bg-white hover:border-takt-600 dark:border-takt-700 dark:bg-takt-900'
            : 'cursor-default border-dashed border-takt-300/60 bg-transparent opacity-70 dark:border-takt-700/60'
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-takt-900 dark:text-takt-50">
            {e.name}
          </span>
          <span className="block text-sm text-takt-700 dark:text-takt-300">
            {e.kanton ? `Kanton ${e.kanton} · ` : ''}{STUFE_TEXT[e.tier]}
            {e.dwv != null && ` · ${e.dwv.toLocaleString('de-CH')} pro Werktag`}
          </span>
        </span>
        <span className="shrink-0 text-sm text-takt-600 dark:text-takt-300">
          {hatProfil ? '→' : 'noch keine Inhalte'}
        </span>
      </button>
    </li>
  )
}
