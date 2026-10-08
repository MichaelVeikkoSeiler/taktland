import { SPIELE, type Spiel } from '../spiele'
import { Schiebeleiste } from './Kopf'

/**
 * Übersicht unter «Spiele» (Michael, 2026-10-02): jedes Spiel als Kachel mit kleinem Bild,
 * zwei je Zeile (Michael, 2026-10-03), auf dem Handy nebeneinander zum Wischen (2026-10-04), die übrigen als stille Platzhalter ohne Knopf. Die Liste steht in
 * src/spiele.ts.
 */
export function Spiele() {
  return (
    <div className="px-4 pb-4">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Spiele</h1>
      <p className="mt-2 leading-relaxed">
        Entdecke Taktland spielerisch. Hier findest du das Duell, Geo, die Bahnhofsuche und die Modellbahn; weitere Spiele
        rund um die Bahn in der Schweiz folgen.
      </p>
      {/* auf dem Handy nebeneinander zum Wischen, wie die Reiter mit Pfeilen und Wischton; die nächste
          Kachel schaut am Rand hervor, damit man sieht, dass es weitergeht (Michael, 2026-10-04) */}
      <Schiebeleiste name="Spiele" was="Spiele" aussen="-mx-4 mt-5 md:hidden" grund="bg-sbb-white/90 dark:bg-sbb-midnight/90"
                     className="snap-x snap-mandatory scroll-px-4 px-4">
        <ul className="flex w-max gap-3 pb-1">
          {SPIELE.filter((s) => s.status === 'spielbereit').map((s) => (
            <Karte key={s.id} spiel={s} klasse="w-[40vw] max-w-64 shrink-0 snap-start" />
          ))}
        </ul>
      </Schiebeleiste>
      {/* ab Tablet drei je Zeile */}
      <ul className="mt-5 hidden gap-3 md:grid md:grid-cols-3">
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
    // die ganze Kachel führt zum Spiel; oben ein kleines Bild, darunter Titel und ein Satz
    return (
      <li className={`flex ${klasse}`}>
        <a href={spiel.adresse} className="kachel kachel-link flex w-full flex-col overflow-hidden">
          {spiel.bild && (
            <picture>
              <source srcSet={spiel.bild.dunkel} media="(prefers-color-scheme: dark)" />
              <img src={spiel.bild.hell} alt={spiel.bild.alt} loading="lazy"
                   className="aspect-[4/3] w-full object-cover" />
            </picture>
          )}
          <div className="flex flex-1 flex-col p-3">
            <h2 className="text-lg font-bold leading-tight tracking-tight">{spiel.titel}</h2>
            <p className="mt-1 flex-1 text-sm leading-snug">{spiel.kurz ?? spiel.beschreibung}</p>
            <span className="mt-3 font-bold text-sbb-red">Spielen →</span>
          </div>
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
