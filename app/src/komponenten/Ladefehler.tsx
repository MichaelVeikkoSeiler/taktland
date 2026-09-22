/**
 * Wenn Daten nicht geladen werden konnten: was fehlt, warum, und ein Knopf zum
 * Neuladen. Vorher stand nur «Failed to fetch» da, ohne Ausweg (Brücken,
 * während GitHub eine neue Version einspielte).
 */
export function Ladefehler({ was, fehler, className = '' }: {
  /** «Die Liste konnte nicht geladen werden.» */
  was: string
  fehler: string
  className?: string
}) {
  return (
    <div className={className}>
      <p>{was} {fehler}</p>
      <button
        type="button" onClick={() => window.location.reload()}
        className="mt-3 border border-sbb-cloud bg-white px-4 py-2 font-medium hover:border-sbb-black
                   dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white"
      >
        Nochmals versuchen
      </button>
    </div>
  )
}
