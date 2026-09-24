/** Weg zur Seite «Strecke», auf den Übersichten Linien, Tunnel und Brücken */
export function StreckeKarte() {
  return (
    <a
      href="#/strecke"
      className="mt-4 flex items-center justify-between gap-3 kachel kachel-link px-4 py-3"
    >
      <span className="min-w-0">
        <span className="block font-medium text-sbb-black dark:text-sbb-white">Strecke</span>
        <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
          Welche Tunnel und Brücken liegen zwischen zwei Bahnhöfen?
        </span>
      </span>
      <span className="pfeil shrink-0 text-sm" aria-hidden="true">→</span>
    </a>
  )
}
