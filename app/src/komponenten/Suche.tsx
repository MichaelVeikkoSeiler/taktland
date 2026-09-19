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
          className="w-full border border-sbb-cloud bg-white px-4 py-3 text-lg
                     text-sbb-black placeholder:text-sbb-metal dark:border-sbb-iron
                     dark:bg-sbb-midnight dark:text-sbb-white"
        />
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm text-sbb-metal dark:text-sbb-storm">
        <input
          type="checkbox"
          checked={nurMitProfil}
          onChange={(e) => setNurMitProfil(e.target.checked)}
          className="size-4 accent-sbb-red"
        />
        Nur Bahnhöfe mit Lerninhalten
      </label>

      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        {index.mit_profil} von {index.bahnhoefe_gesamt} Bahnhöfen haben bisher Lerninhalte.
        Die übrigen sind aufgeführt, damit sichtbar ist, was noch fehlt.
      </p>

      <ul className="mt-4 space-y-2">
        {treffer.map((e) => <Eintrag key={e.uic} e={e} oeffnen={oeffnen} />)}
      </ul>

      {treffer.length === 0 && (
        <p className="mt-8 text-center text-sbb-metal dark:text-sbb-storm">
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
