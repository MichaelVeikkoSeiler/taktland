import type { Luecke } from '../typen'

/**
 * Was zu diesem Bahnhof fehlt. Bewusst sichtbar und nicht am Seitenende versteckt:
 * Taktland soll zeigen, was es nicht weiss.
 */
export function Luecken({ luecken }: { luecken: Luecke[] }) {
  if (!luecken.length) return null
  return (
    <section className="mt-8 rounded-xl border border-amber-300 bg-amber-50/70 p-4
                        dark:border-amber-900 dark:bg-amber-950/30">
      <h2 className="text-lg font-semibold text-amber-950 dark:text-amber-100">
        Was diese Daten nicht sagen
      </h2>
      <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-100/80">
        Taktland gibt nur weiter, was in den offenen Daten steht. Diese {luecken.length} Punkte
        fehlen oder sind eingeschränkt.
      </p>
      <ul className="mt-3 space-y-3">
        {luecken.map((l) => (
          <li key={l.thema}>
            <p className="font-medium text-amber-950 dark:text-amber-100">{l.thema}</p>
            <p className="text-sm text-amber-900/90 dark:text-amber-100/80">{l.grund}</p>
            <p className="mt-0.5 text-xs text-amber-900/70 dark:text-amber-100/60">
              Quelle: {l.quelle}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
