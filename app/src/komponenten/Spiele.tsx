import { SPIELE, type Spiel } from '../spiele'

/**
 * Übersicht unter «Spiele» (Michael, 2026-10-02): jedes Spiel als Kachel, spielbereite
 * mit «Spielen», die übrigen als stille Platzhalter ohne Knopf. Die Liste steht in
 * src/spiele.ts.
 */
export function Spiele() {
  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Spiele</h1>
      <p className="mt-2 leading-relaxed">
        Entdecke Taktland spielerisch. Hier findest du das Duell und bald weitere Spiele rund um
        die Bahn in der Schweiz.
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {SPIELE.filter((s) => s.status === 'spielbereit').map((s) => <Karte key={s.id} spiel={s} />)}
      </ul>
      {/* Platzhalter schmal, damit das Spielbare die Hauptsache bleibt (Michael, 2026-10-03) */}
      {SPIELE.some((s) => s.status === 'im-bau') && (
        <>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {SPIELE.filter((s) => s.status === 'im-bau').map((s) => <Karte key={s.id} spiel={s} />)}
          </ul>
          <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
            Weitere Spiele für Taktland sind in Vorbereitung.
          </p>
        </>
      )}
    </div>
  )
}

function Karte({ spiel }: { spiel: Spiel }) {
  if (spiel.status === 'spielbereit' && spiel.adresse) {
    return (
      <li className="kachel flex flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">{spiel.titel}</h2>
          <span className="shrink-0 rounded-lg bg-white px-2 py-0.5 text-xs font-medium text-sbb-black
                           dark:bg-sbb-midnight dark:text-sbb-white">
            Spielbereit
          </span>
        </div>
        <p className="mt-2 flex-1 leading-relaxed">{spiel.beschreibung}</p>
        <a href={spiel.adresse}
           className="mt-4 inline-flex min-h-11 items-center justify-center self-start rounded-lg bg-sbb-red px-6
                      font-bold text-white hover:bg-sbb-red125">
          Spielen
        </a>
      </li>
    )
  }
  // im Bau: nicht anklickbar, gedämpft, eine schmale Zeile mit einem Gleis, das am Prellbock endet
  return (
    <li className="kachel flex items-center gap-3 px-4 py-3 text-sbb-metal dark:text-sbb-storm"
        aria-label={`${spiel.titel}, im Bau`}>
      <Prellbock />
      <span className="min-w-0 flex-1 truncate font-medium">{spiel.titel}</span>
      <span className="shrink-0 rounded-lg border border-current px-2 py-0.5 text-xs font-medium">Im Bau</span>
    </li>
  )
}

/** Ein Gleisstück, das an einem Prellbock endet: hier geht es noch nicht weiter */
function Prellbock() {
  return (
    <svg viewBox="0 0 120 24" className="h-5 w-16 shrink-0" aria-hidden="true" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 9h92M2 17h92" />
      {[8, 22, 36, 50, 64, 78].map((x) => <path key={x} d={`M${x} 5v16`} strokeWidth="2.4" />)}
      <path d="M96 4v18M96 8l10 5-10 5" />
    </svg>
  )
}
