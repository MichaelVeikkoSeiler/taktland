import { useEffect, useRef, useState, type ReactNode } from 'react'

/** so breit liegt die rote Fläche «Löschen» frei, wenn ein Eintrag aufgeschoben ist */
const OFFEN_PX = 96

/**
 * Ein eigener Eintrag (Probefahrt, gemerkte Fahrt, Favorit, Fahrt im Logbuch) lässt sich nach links wischen
 * (Michael, 2026-10-08); er bleibt dann aufgeschoben, und erst ein Tipp auf die rote Fläche «Löschen» darunter löscht ihn,
 * ohne weitere Rückfrage (Michael, 2026-10-09). Ein Tipp daneben, auf den Eintrag oder ein Wischen nach rechts schiebt
 * ihn zurück. Senkrecht bleibt die Seite scrollbar; ein Tipp ohne Wischen wirkt wie immer.
 */
export default function Wischen({ children, frage, loeschen, className = '' }: {
  children: ReactNode
  /** was gelöscht wird, für Vorleser, etwa «Probefahrt Bern – Biel löschen?» */
  frage: string
  loeschen: () => void
  className?: string
}) {
  const [dx, setDx] = useState(0)
  const [zieht, setZieht] = useState(false)
  const offen = dx === -OFFEN_PX && !zieht
  const rahmen = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; aktiv: boolean; breite: number; von: number } | null>(null)
  // nach einem Wischen oder beim Zuschieben den Klick darauf schlucken, sonst öffnet sich der Eintrag
  const gewischt = useRef(false)
  const schlucken = () => {
    gewischt.current = true
    window.setTimeout(() => { gewischt.current = false }, 300)
  }

  // ein Tipp irgendwo anders schiebt den Eintrag zurück
  useEffect(() => {
    if (!offen) return
    const weg = (e: PointerEvent) => {
      if (!rahmen.current?.contains(e.target as Node)) setDx(0)
    }
    document.addEventListener('pointerdown', weg)
    return () => document.removeEventListener('pointerdown', weg)
  }, [offen])

  const loslassen = () => {
    const s = start.current
    start.current = null
    setZieht(false)
    if (!s) return
    if (!s.aktiv) {
      // ein Tipp auf den aufgeschobenen Eintrag schiebt ihn zurück, statt ihn zu öffnen
      if (s.von !== 0) { schlucken(); setDx(0) }
      return
    }
    schlucken()
    setDx(dx <= -OFFEN_PX / 2 ? -OFFEN_PX : 0)
  }

  return (
    <div ref={rahmen} className={`relative overflow-hidden ${className}`}>
      <button type="button" tabIndex={offen ? 0 : -1} aria-hidden={!offen} aria-label={frage.replace(/\?$/, '')}
              onClick={() => { setDx(0); loeschen() }}
              className="absolute inset-y-0 right-0 flex items-center justify-center bg-sbb-red font-bold text-white"
              style={{ width: Math.max(OFFEN_PX, -dx) }}>
        Löschen
      </button>
      <div
        className="relative bg-sbb-kachel dark:bg-sbb-charcoal"
        style={{ transform: `translateX(${dx}px)`, transition: zieht ? 'none' : 'transform 200ms', touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          start.current = { x: e.clientX, y: e.clientY, aktiv: false, breite: e.currentTarget.offsetWidth, von: dx }
        }}
        onPointerMove={(e) => {
          const s = start.current
          if (!s) return
          const ddx = e.clientX - s.x, ddy = e.clientY - s.y
          if (!s.aktiv) {
            // erst wenn klar waagrecht gewischt wird (zu, nach links; aufgeschoben auch nach rechts); senkrecht ist Scrollen
            if (Math.abs(ddy) > 10 && Math.abs(ddy) > Math.abs(ddx)) { start.current = null; return }
            const waagrecht = Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy) * 1.5
            if (waagrecht && (ddx < 0 || s.von !== 0)) {
              s.aktiv = true
              setZieht(true)
              e.currentTarget.setPointerCapture(e.pointerId)
            } else return
          }
          setDx(Math.max(-s.breite * 0.6, Math.min(0, s.von + ddx)))
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
