import type { Gleis } from '../typen'

/**
 * Schematische Ansicht der Gleise eines Bahnhofs.
 *
 * Gezeichnet wird ausschliesslich, was in den Fakten steht: Gleisnummer,
 * Perrontyp und Länge der Perronkante. Die Anordnung untereinander ist eine
 * Darstellungsentscheidung und bildet die Lage vor Ort nicht ab. Deshalb steht
 * unter dem Schema ein Hinweis darauf.
 */
export function Gleisschema({ gleise, auswaehlbar, gewaehlt, loesung, onWahl }: {
  gleise: Gleis[]
  auswaehlbar?: boolean
  gewaehlt?: string | null
  loesung?: string | null
  onWahl?: (nr: string) => void
}) {
  if (!gleise.length) return null
  const maxKante = Math.max(...gleise.map((g) => g.perronkante_m ?? 0), 1)
  const zeile = 34
  const hoehe = gleise.length * zeile + 12
  const breite = 320
  const beschriftung = 42
  const platz = breite - beschriftung - 46

  return (
    <div>
      <svg
        viewBox={`0 0 ${breite} ${hoehe}`}
        className="w-full"
        role="img"
        aria-label={`Schema der ${gleise.length} erfassten Gleise`}
      >
        {gleise.map((g, i) => {
          const y = i * zeile + 18
          const laenge = Math.max(((g.perronkante_m ?? 0) / maxKante) * platz, 12)
          const istLoesung = loesung != null && g.nr === loesung
          const istGewaehlt = gewaehlt === g.nr
          const farbe = loesung != null
            ? (istLoesung ? '#00873d' : istGewaehlt ? '#eb0000' : '#bdbdbd')
            : (istGewaehlt ? '#eb0000' : '#767676')
          return (
            <g
              key={g.nr}
              onClick={() => auswaehlbar && onWahl?.(g.nr)}
              className={auswaehlbar ? 'cursor-pointer' : undefined}
              role={auswaehlbar ? 'button' : undefined}
              aria-label={auswaehlbar ? `Gleis ${g.nr}` : undefined}
            >
              {/* grosse unsichtbare Fläche, damit das Antippen auf dem Handy trifft */}
              <rect x="0" y={y - 15} width={breite} height={zeile - 2} fill="transparent" />
              <text
                x="0" y={y + 4}
                className="fill-sbb-black text-[12px] font-bold dark:fill-sbb-white"
              >
                Gleis {g.nr}
              </text>
              <line
                x1={beschriftung} y1={y} x2={beschriftung + laenge} y2={y}
                stroke={farbe} strokeWidth={istGewaehlt || istLoesung ? 7 : 5}
                strokeLinecap="butt"
              />
              <text
                x={beschriftung + laenge + 6} y={y + 4}
                className="fill-sbb-metal text-[11px] tabular-nums"
              >
                {g.perronkante_m ? `${g.perronkante_m} m` : ''}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-1 text-xs text-sbb-metal">
        Schema. Die Balken zeigen die Länge der Perronkante im Verhältnis zueinander.
        Die Anordnung entspricht nicht der Lage vor Ort, und es sind nur Gleise
        abgebildet, zu denen Daten vorliegen.
      </p>
    </div>
  )
}
