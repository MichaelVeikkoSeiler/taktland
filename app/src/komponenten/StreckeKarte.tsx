/** Weg zur Seite «Strecke», auf den Übersichten Linien, Tunnel und Brücken */
export function StreckeKarte() {
  return (
    <a
      href="#/strecke"
      className="mt-4 flex items-center justify-between gap-3 border border-l-4 border-sbb-cloud
                 border-l-sbb-red bg-white px-4 py-3 transition hover:border-sbb-black
                 hover:border-l-sbb-red dark:border-sbb-iron dark:border-l-sbb-red
                 dark:bg-sbb-midnight dark:hover:border-sbb-white dark:hover:border-l-sbb-red"
    >
      <span className="min-w-0">
        <span className="block font-medium text-sbb-black dark:text-sbb-white">Strecke</span>
        <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
          Welche Tunnel und Brücken liegen zwischen zwei Bahnhöfen?
        </span>
      </span>
      <span className="shrink-0 text-sm text-sbb-metal dark:text-sbb-storm" aria-hidden="true">→</span>
    </a>
  )
}
