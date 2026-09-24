import { type ReactNode, useEffect, useRef, useState } from 'react'

export interface Option<T> {
  wert: T
  text: string
  /** kürzer im geschlossenen Feld, etwa ohne die Zahl in Klammern */
  kurz?: string
}

/**
 * Eigene Auswahlliste statt <select>. Die Liste von <select> zeichnet das
 * Gerät selbst, auf Android mit grosser Schrift, und sie lässt sich nicht
 * gestalten (Michael, 2026-09-25: «Schrift etwas kleiner, damit man mehr
 * sieht»). Hier öffnet ein Tipp eine kompakte Liste unten am Bildschirm; die
 * gewählte Zeile ist markiert, Escape oder ein Tipp daneben schliesst sie.
 * Ohne children zeigt der Knopf den gewählten Text mit einem Pfeil.
 */
export function Auswahl<T extends string | number>({
  wert, optionen, waehlen, titel, className = '', disabled = false, children,
}: {
  wert: T
  optionen: Array<Option<T>>
  waehlen: (w: T) => void
  /** Überschrift der Liste und Name für Bildschirmleser */
  titel: string
  className?: string
  disabled?: boolean
  children?: ReactNode
}) {
  const [offen, setOffen] = useState(false)
  const liste = useRef<HTMLDivElement | null>(null)
  const knopf = useRef<HTMLButtonElement | null>(null)
  const gewaehlt = optionen.find((o) => o.wert === wert)

  useEffect(() => {
    if (!offen) return
    // die gewählte Zeile sichtbar und im Fokus
    const zeile = liste.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?? liste.current?.querySelector<HTMLButtonElement>('button')
    zeile?.scrollIntoView({ block: 'center' })
    zeile?.focus()
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen() }
    document.addEventListener('keydown', taste)
    return () => document.removeEventListener('keydown', taste)
  }, [offen])

  function schliessen() {
    setOffen(false)
    knopf.current?.focus()
  }

  return (
    <>
      <button ref={knopf} type="button" disabled={disabled} onClick={() => setOffen(true)}
              aria-haspopup="listbox" aria-expanded={offen} aria-label={children ? titel : undefined}
              className={className}>
        {children ?? (
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-left">{gewaehlt?.kurz ?? gewaehlt?.text ?? ''}</span>
            <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden="true">
              <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
        )}
      </button>
      {offen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center"
             onClick={schliessen}>
          <div role="dialog" aria-label={titel} onClick={(e) => e.stopPropagation()}
               className="w-full max-w-md bg-white text-sbb-black shadow-lg dark:bg-sbb-midnight dark:text-sbb-white">
            <p className="border-b border-sbb-cloud px-4 py-2.5 text-xs font-medium uppercase tracking-wide
                          text-sbb-metal dark:border-sbb-iron dark:text-sbb-storm">
              {titel}
            </p>
            <div ref={liste} role="listbox" aria-label={titel}
                 className="max-h-[65vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              {optionen.map((o) => {
                const hier = o.wert === wert
                return (
                  <button key={String(o.wert)} type="button" role="option" aria-selected={hier}
                          onClick={() => { waehlen(o.wert); schliessen() }}
                          className={`flex w-full items-center justify-between gap-3 border-b border-sbb-cloud
                                      px-4 py-2.5 text-left text-base last:border-b-0 hover:bg-sbb-milk
                                      focus-visible:bg-sbb-milk dark:border-sbb-iron dark:hover:bg-sbb-charcoal
                                      dark:focus-visible:bg-sbb-charcoal ${hier ? 'font-bold' : ''}`}>
                    <span className="min-w-0">{o.text}</span>
                    {hier && (
                      <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-sbb-red" aria-hidden="true">
                        <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
