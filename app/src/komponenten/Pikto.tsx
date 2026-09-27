/**
 * Piktos für Tunnel, Brücke und Bahnhof, gezeichnet von Michael (2026-09-26,
 * Vorlagen in entwuerfe/piktos/). Ein Quadrat in der Farbe der Art mit weissem
 * Zeichen; auf einer Fläche in derselben Farbe nur das Zeichen, sonst
 * verschwände das Quadrat. Alle drei liegen in der Vorlage auf derselben
 * Zeichenfläche an verschiedenen Stellen: x ist die linke Kante des Quadrats.
 */
export type PiktoArt = 'tunnel' | 'bruecke' | 'bahnhof'

const SEITE = 140.33
const OBEN = 26.55
const PIKTO: Record<PiktoArt, { x: number; farbe: string; zeichen: string }> = {
  tunnel: {
    x: 335.94, farbe: '#2b2b2b',
    zeichen: 'M449.39,52.01h-86.57c-1.75,0-3.18,1.42-3.18,3.18v83.05c0,1.75,1.42,3.18,3.18,3.18h11.85c1.75,0,3.18-1.42,3.18-3.18v-30.2c0-15.61,12.65-28.26,28.26-28.26h0c15.61,0,28.26,12.65,28.26,28.26v7.5s0,22.7,0,22.7c0,1.75,1.42,3.18,3.18,3.18h11.85c1.75,0,3.18-1.42,3.18-3.18V55.19c0-1.75-1.42-3.18-3.18-3.18Z',
  },
  bruecke: {
    x: 21.58, farbe: '#b35900',
    zeichen: 'M36.64,71.67v50.08c0,1.47,1.2,2.67,2.67,2.67h9.73c1.41,0,2.57-1.1,2.66-2.51,1.3-20.99,18.73-37.62,40.05-37.62s38.75,16.62,40.05,37.62c.09,1.41,1.25,2.51,2.66,2.51h9.73c1.47,0,2.67-1.2,2.67-2.67v-50.08c0-1.47-1.2-2.67-2.67-2.67H39.31c-1.47,0-2.67,1.2-2.67,2.67Z',
  },
  bahnhof: {
    x: 181.64, farbe: '#1d3f8a',
    zeichen: 'M289.94,121.1v-38.36c0-1-.51-1.93-1.35-2.46l-35.21-22.41c-.96-.61-2.18-.61-3.13,0l-35.21,22.41c-.84.54-1.35,1.46-1.35,2.46v38.36c0,1.61-1.31,2.92-2.92,2.92h-9.46c-1.61,0-2.92,1.31-2.92,2.92v6.71c0,1.61,1.31,2.92,2.92,2.92h101.02c1.61,0,2.92-1.31,2.92-2.92v-6.71c0-1.61-1.31-2.92-2.92-2.92h-9.46c-1.61,0-2.92-1.31-2.92-2.92Z',
  },
}

export function Pikto({ art, className = 'size-6', nurZeichen = false }: {
  art: PiktoArt
  className?: string
  /** auf einer Fläche in der Farbe der Art: nur das weisse Zeichen */
  nurZeichen?: boolean
}) {
  const p = PIKTO[art]
  return (
    <svg viewBox={`${p.x} ${OBEN} ${SEITE} ${SEITE}`} className={`shrink-0 ${className}`} aria-hidden="true"
         style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
      {!nurZeichen && <rect x={p.x} y={OBEN} width={SEITE} height={SEITE} rx={8.62} fill={p.farbe} />}
      <path d={p.zeichen} fill="#fff" />
    </svg>
  )
}
