import { SPIELE, type Spiel } from '../spiele'

/**
 * Übersicht unter «Spiele» (Michael, 2026-10-02): jedes Spiel als Bild-Knopf mit Titel, zwei Spalten
 * (Michael, 2026-10-10: «kein beschreibender Text mehr und auch nicht Spielen mit dem roten Pfeil»), die übrigen als
 * stille Platzhalter ohne Knopf. Die Liste steht in src/spiele.ts.
 */
export function Spiele() {
  return (
    <div className="px-4 pb-4">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Spiele</h1>
      <p className="mt-2 leading-relaxed">
        Entdecke Taktland spielerisch. Hier findest du die Modellbahn, Geo, das Duell und die Bahnhofsuche; weitere Spiele
        rund um die Bahn in der Schweiz folgen.
      </p>
      {/* zwei Spalten, zwei Zeilen: jedes Spiel ein Bild mit Titel, das Bild ist der Knopf (Michael, 2026-10-10) */}
      <ul className="mt-5 grid grid-cols-2 gap-3">
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

function Karte({ spiel, klasse = '' }: { spiel: Spiel; klasse?: string }) {
  if (spiel.status === 'spielbereit' && spiel.adresse) {
    // die ganze Kachel führt zum Spiel: oben das Bild, darunter nur der Titel; die Beschreibung steht beim Spiel
    return (
      <li className={`flex ${klasse}`}>
        <a href={spiel.adresse} className="kachel kachel-link flex w-full flex-col overflow-hidden">
          {spiel.bild && (
            <picture>
              <source srcSet={spiel.bild.dunkel} media="(prefers-color-scheme: dark)" />
              {/* der Titel steht darunter, das Bild ist nur Schmuck */}
              <img src={spiel.bild.hell} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
            </picture>
          )}
          <h2 className="px-3 py-2.5 text-lg font-bold leading-tight tracking-tight">{spiel.titel}</h2>
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
