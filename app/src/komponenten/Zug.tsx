import { standText, uhr, type Zug, type Zugsuche, zugName } from '../fahrplan'

/** «IC 2 nach Lugano (Zug 875)»: so im Logbuch und beim Fortsetzen */
export const zugText = (z: Zug) => `${zugName(z.fahrt)} nach ${z.fahrt.z} (Zug ${z.fahrt.n})`

/**
 * «In welchem Zug sitzt du?» beim Start (Merkliste «Welcher Zug?», Stufe 1):
 * die Züge, die laut Fahrplan um jetzt vom Start zum Ziel fahren, dazu
 * «Keiner davon». Ohne Wahl läuft alles wie bisher.
 */
export function ZugFrage({ suche, waehlen, schliessen }: {
  suche: Zugsuche
  waehlen: (z: Zug) => void
  schliessen: () => void
}) {
  const leer = suche.art === 'ohneFahrplan' || suche.zuege.length === 0
  return (
    <div className="mt-5 rounded-lg bg-sbb-milk px-4 py-4 dark:bg-sbb-charcoal">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold">In welchem Zug sitzt du?</p>
        <button type="button" onClick={schliessen} aria-label="Frage schliessen"
                className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center text-xl text-sbb-metal
                           hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white">
          ×
        </button>
      </div>
      {suche.art === 'ohneFahrplan' ? (
        <p className="mt-1 text-sm">
          {suche.bis ? `Der Fahrplan in Taktland reicht nur bis ${suche.bis.split('-').reverse().join('.')}.`
            : 'Der Fahrplan konnte nicht geladen werden.'}
        </p>
      ) : leer ? (
        <p className="mt-1 text-sm">
          Laut Fahrplan fährt zwischen 20 Minuten vorher und einer Stunde nachher kein Zug mit Halt am Start
          und am Ziel.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {suche.zuege.map((z) => (
            <li key={`${z.id}-${z.tag}`}>
              <button type="button" onClick={() => waehlen(z)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2
                                 text-left hover:bg-sbb-cloud dark:bg-sbb-midnight dark:hover:bg-sbb-iron">
                <span className="min-w-0">
                  <span className="block font-bold">{zugName(z.fahrt)} nach {z.fahrt.z}</span>
                  <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                    ab {uhr(z.ab)}, an {uhr(z.an)} · Zug {z.fahrt.n}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={schliessen}
                    className="min-h-11 w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-sbb-cloud
                               dark:hover:bg-sbb-iron">
              Keiner davon
            </button>
          </li>
        </ul>
      )}
      <p className="mt-2 text-xs text-sbb-metal dark:text-sbb-storm">
        Zeiten laut Fahrplan{suche.art === 'zuege' ? ` (Stand ${standText(suche.stand)})` : ''}, nur Züge mit Halt
        am Start und am Ziel. Verspätungen, Ausfälle, Extrazüge und Ersatzbusse kennt Taktland nicht.
      </p>
    </div>
  )
}

/** Der gewählte Zug oben und sein nächster Halt laut Fahrplan */
export function ZugAnzeige({ zug, halt, aendern }: {
  zug: Zug
  /** nächster Halt: Name und Ankunft (sonst Abfahrt) laut Fahrplan, Millisekunden */
  halt: { name: string; zeit: number | null } | null
  aendern: () => void
}) {
  return (
    <div className="mt-4 rounded-lg bg-sbb-milk px-4 py-3 dark:bg-sbb-charcoal">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0">
          <span className="block font-bold">{zugName(zug.fahrt)} nach {zug.fahrt.z}</span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">Zug {zug.fahrt.n}</span>
        </p>
        <button type="button" onClick={aendern}
                className="shrink-0 text-sm underline underline-offset-2">
          Anderer Zug
        </button>
      </div>
      {halt && (
        <p className="mt-2">
          <span className="block text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
            Nächster Halt laut Fahrplan
          </span>
          <span className="text-lg font-bold">{halt.name}</span>
          {halt.zeit !== null && <span className="tabular-nums"> · an {uhr(halt.zeit)}</span>}
        </p>
      )}
      <p className="mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
        Laut Fahrplan, ohne Verspätungen.
      </p>
    </div>
  )
}
