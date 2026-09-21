/** Der Zurück-Link oben links, auf jeder Seite gleich. Vorher gab es zwei
 *  Fassungen: 16 Pixel unterstrichen auf Bahnhof- und Linienseiten, 14 Pixel
 *  ohne Strich und tiefer auf Duell, Anleitung und Linienübersicht. */
export function Zurueck({ onClick, text }: { onClick: () => void; text: string }) {
  return (
    <div className="mt-6">
      <button
        type="button" onClick={onClick}
        className="text-sm text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                   dark:text-sbb-storm dark:hover:text-sbb-white"
      >
        ← {text}
      </button>
    </div>
  )
}
