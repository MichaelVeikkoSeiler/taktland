import type { Luecke } from '../typen'

/**
 * Was zu diesem Bahnhof fehlt. Bewusst sichtbar und nicht am Seitenende versteckt:
 * Taktland soll zeigen, was es nicht weiss.
 */
export function Luecken({ luecken }: { luecken: Luecke[] }) {
  if (!luecken.length) return null
  return (
    <section className="mt-10 border-t-2 border-sbb-red bg-sbb-milk px-4 py-5
                        dark:bg-sbb-charcoal">
      <h2 className="text-lg font-bold text-sbb-black dark:text-sbb-white">
        Was diese Daten nicht sagen
      </h2>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
        Taktland gibt nur weiter, was in den offenen Daten steht. Diese {luecken.length} Punkte
        fehlen oder sind eingeschränkt.
      </p>
      <ul className="mt-3 space-y-3">
        {luecken.map((l) => (
          <li key={l.thema}>
            <p className="font-bold text-sbb-black dark:text-sbb-white">{l.thema}</p>
            <p className="text-sm text-sbb-iron dark:text-sbb-storm">{l.grund}</p>
            <p className="mt-0.5 text-xs text-sbb-metal">Quelle: {l.quelle}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
