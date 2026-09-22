import { useEffect, useRef } from 'react'

/** So viele Einträge stehen auf einer Seite. Vorher wuchs die Bahnhofliste mit
 *  «Weitere anzeigen» um je 60 Einträge, bis alle untereinander standen. */
export const PRO_SEITE = 20

/** Umlaute und Akzente ignorieren, damit «Zurich» auch «Zürich» findet. */
export function vereinfachen(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** «10 Baueinheiten – 7 Baueinheiten» wird «10 – 7 Baueinheiten». Nur bei
 *  Zahlen: Bei «Basel SBB – Zürich SBB» gehört das SBB zu beiden Namen. */
function spanne(a: string, b: string) {
  const zahl = /^[\d'’.]+ /
  const ea = a.replace(zahl, '')
  if (zahl.test(a) && zahl.test(b) && ea === b.replace(zahl, '')) {
    return `${a.slice(0, a.length - ea.length - 1)} – ${b}`
  }
  return `${a} – ${b}`
}

/**
 * Seiten einer Liste. Die Leiste zeigt wie die Kopfzeile im Wörterbuch den
 * ersten und den letzten Eintrag jeder Seite, beschriftet mit `beschriftung`.
 * Die Pfeiltasten blättern, ausser beim Tippen im Suchfeld oder in der Seitenwahl.
 */
export function useSeiten<T>(treffer: T[], gewuenscht: number, setzen: (seite: number) => void,
                             beschriftung: (e: T) => string) {
  const listeOben = useRef<HTMLDivElement>(null)
  const seiten = Math.max(1, Math.ceil(treffer.length / PRO_SEITE))
  const seite = Math.min(gewuenscht, seiten - 1)
  const von = seite * PRO_SEITE
  const sichtbar = treffer.slice(von, von + PRO_SEITE)

  const bereiche = Array.from({ length: seiten }, (_, i) => {
    const erster = treffer[i * PRO_SEITE]
    const letzter = treffer[Math.min((i + 1) * PRO_SEITE, treffer.length) - 1]
    const a = erster === undefined ? '' : beschriftung(erster)
    const b = letzter === undefined ? '' : beschriftung(letzter)
    return a === b ? a : spanne(a, b)
  })

  function blaettern(neu: number, nachOben = false) {
    const ziel = Math.max(0, Math.min(seiten - 1, neu))
    if (ziel === seite) return
    setzen(ziel)
    if (nachOben) listeOben.current?.scrollIntoView({ block: 'start' })
  }

  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
      if (e.key === 'ArrowLeft') blaettern(seite - 1)
      if (e.key === 'ArrowRight') blaettern(seite + 1)
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  })

  return { listeOben, sichtbar, leiste: { seite, seiten, bereiche }, blaettern }
}

/** Pfeile in beide Richtungen. Dazwischen erster und letzter Bahnhof der
 *  Seite; ein Tipp darauf öffnet die Seitenwahl mit den Bereichen aller Seiten. */
export function Blaettern({ seite, seiten, bereiche, blaettern, name }: {
  seite: number
  seiten: number
  bereiche: string[]
  blaettern: (neu: number) => void
  name: string
}) {
  if (seiten <= 1) return null
  const pfeil = `flex w-14 shrink-0 items-center justify-center border border-sbb-cloud
                 bg-white text-2xl text-sbb-black transition hover:border-sbb-black
                 disabled:cursor-default disabled:opacity-30 disabled:hover:border-sbb-cloud
                 dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white
                 dark:hover:border-sbb-white dark:disabled:hover:border-sbb-iron`
  return (
    <nav aria-label={name} className="mt-4 flex min-h-14 items-stretch gap-2">
      <button
        type="button" className={pfeil} disabled={seite === 0}
        onClick={() => blaettern(seite - 1)} aria-label="Vorherige Seite"
      >
        ←
      </button>
      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center border
                      border-sbb-cloud bg-white px-2 py-1 focus-within:border-sbb-black
                      hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight
                      dark:focus-within:border-sbb-white dark:hover:border-sbb-white">
        <span className="block w-full text-center leading-tight font-medium text-balance
                         break-words text-sbb-black dark:text-sbb-white">
          {bereiche[seite]}
        </span>
        <span className="text-xs text-sbb-metal dark:text-sbb-storm">
          Seite {seite + 1} von {seiten}
        </span>
        {/* unsichtbar über dem Feld: ein Tipp öffnet die Auswahl des Geräts */}
        <select
          aria-label="Seite wählen"
          value={seite}
          onChange={(e) => blaettern(Number(e.target.value))}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        >
          {bereiche.map((b, i) => (
            <option key={i} value={i}>Seite {i + 1}: {b}</option>
          ))}
        </select>
      </div>
      <button
        type="button" className={pfeil} disabled={seite === seiten - 1}
        onClick={() => blaettern(seite + 1)} aria-label="Nächste Seite"
      >
        →
      </button>
    </nav>
  )
}
