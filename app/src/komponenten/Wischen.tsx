import { useRef, useState, type ReactNode } from 'react'

/**
 * Ein eigener Eintrag (Probefahrt, gemerkte Fahrt, Favorit, Fahrt im Logbuch) lässt sich nach links wischen; darunter
 * erscheint rot «Löschen», und wer weit genug wischt, wird gefragt, ob der Eintrag weg soll (Michael, 2026-10-08).
 * Senkrecht bleibt die Seite scrollbar; ein Tipp ohne Wischen wirkt wie immer.
 */
export default function Wischen({ children, frage, loeschen, className = '' }: {
  children: ReactNode
  /** die Rückfrage, etwa «Probefahrt Bern – Biel löschen?» */
  frage: string
  loeschen: () => void
  className?: string
}) {
  const [dx, setDx] = useState(0)
  const [zieht, setZieht] = useState(false)
  const start = useRef<{ x: number; y: number; aktiv: boolean; breite: number } | null>(null)
  // nach einem Wischen den Klick darauf schlucken, sonst öffnet sich der Eintrag
  const gewischt = useRef(false)

  const loslassen = () => {
    const s = start.current
    start.current = null
    setZieht(false)
    if (!s?.aktiv) return
    gewischt.current = true
    window.setTimeout(() => { gewischt.current = false }, 300)
    // weit genug: ein gutes Drittel der Breite, höchstens 120 Bildpunkte
    if (dx <= -Math.min(120, s.breite * 0.35)) {
      setDx(-Math.min(120, s.breite * 0.35))
      // erst zeichnen lassen, dann fragen
      window.setTimeout(() => {
        if (window.confirm(frage)) loeschen()
        setDx(0)
      }, 30)
    } else setDx(0)
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div aria-hidden="true"
           className="absolute inset-0 flex items-center justify-end bg-sbb-red pr-4 font-bold text-white">
        Löschen
      </div>
      <div
        className="relative bg-sbb-kachel dark:bg-sbb-charcoal"
        style={{ transform: `translateX(${dx}px)`, transition: zieht ? 'none' : 'transform 200ms', touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          start.current = { x: e.clientX, y: e.clientY, aktiv: false, breite: e.currentTarget.offsetWidth }
        }}
        onPointerMove={(e) => {
          const s = start.current
          if (!s) return
          const ddx = e.clientX - s.x, ddy = e.clientY - s.y
          if (!s.aktiv) {
            // erst wenn klar waagrecht nach links gewischt wird; senkrecht ist Scrollen
            if (Math.abs(ddy) > 10 && Math.abs(ddy) > Math.abs(ddx)) { start.current = null; return }
            if (ddx < -10 && Math.abs(ddx) > Math.abs(ddy) * 1.5) {
              s.aktiv = true
              setZieht(true)
              e.currentTarget.setPointerCapture(e.pointerId)
            } else return
          }
          setDx(Math.max(-s.breite * 0.6, Math.min(0, ddx)))
        }}
        onPointerUp={loslassen}
        onPointerCancel={() => { start.current = null; setZieht(false); setDx(0) }}
        onClickCapture={(e) => { if (gewischt.current) { e.stopPropagation(); e.preventDefault() } }}
      >
        {children}
      </div>
    </div>
  )
}
