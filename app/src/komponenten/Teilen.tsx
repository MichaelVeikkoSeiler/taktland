import { useEffect, useRef, useState } from 'react'

const ADRESSE = 'https://taktland.ch'
const TEXT = 'Taktland: Bahnhöfe, Strecken, Tunnel und Brücken der Schweiz kennenlernen und im Zug mitfahren.'

/** Symbolknopf in der Fusszeile, wie «Einstellungen» daneben */
export const SYMBOL = 'inline-flex size-10 items-center justify-center rounded-lg border border-sbb-cloud bg-white text-sbb-black ' +
  'hover:bg-sbb-milk dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white dark:hover:bg-sbb-charcoal'

const KNOPF = 'inline-flex min-h-10 items-center rounded-lg border border-sbb-cloud bg-white px-4 text-sm font-medium ' +
  'text-sbb-black hover:bg-sbb-milk dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white dark:hover:bg-sbb-charcoal'

/**
 * «Taktland teilen» in der Fusszeile, als Symbol rechts neben der Bildmarke (Michael, 2026-10-10: «per Mail, WhatsApp etc.»): wo das Gerät teilen kann
 * (Handy), sein eigenes Menü mit allen Apps; sonst E-Mail, WhatsApp und Link kopieren. Geteilt wird nur die Adresse
 * von taktland.ch, nichts vom eigenen Fortschritt.
 */
export default function Teilen() {
  const [auswahl, setAuswahl] = useState(false)
  const [kopiert, setKopiert] = useState(false)
  const rahmen = useRef<HTMLDivElement>(null)
  // ein Tipp daneben schliesst die Auswahl
  useEffect(() => {
    if (!auswahl) return
    const weg = (e: PointerEvent) => { if (!rahmen.current?.contains(e.target as Node)) setAuswahl(false) }
    document.addEventListener('pointerdown', weg)
    return () => document.removeEventListener('pointerdown', weg)
  }, [auswahl])

  const teilen = async () => {
    if ('share' in navigator) {
      try {
        await navigator.share({ title: 'Taktland', text: TEXT, url: ADRESSE })
        return
      } catch (e) {
        // abgebrochen: nichts weiter; sonst unten die Auswahl
        if ((e as DOMException).name === 'AbortError') return
      }
    }
    setAuswahl((a) => !a)
  }
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(ADRESSE)
      setKopiert(true)
      window.setTimeout(() => setKopiert(false), 3000)
    } catch {
      window.prompt('Link zum Kopieren', ADRESSE)
    }
  }

  return (
    <div ref={rahmen} className="relative">
      <button type="button" onClick={() => void teilen()} aria-expanded={'share' in navigator ? undefined : auswahl}
              aria-label="Taktland teilen" title="Taktland teilen" className={SYMBOL}>
        {/* Teilen: drei verbundene Punkte */}
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" />
          <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
        </svg>
      </button>
      {auswahl && (
        <div className="absolute right-0 top-full z-20 mt-2 flex w-max flex-col gap-2 rounded-lg bg-sbb-milk p-2 shadow-sm dark:bg-sbb-charcoal">
          <a className={KNOPF} href={`mailto:?subject=${encodeURIComponent('Taktland')}&body=${encodeURIComponent(`${TEXT}\n${ADRESSE}`)}`}>
            E-Mail
          </a>
          <a className={KNOPF} href={`https://wa.me/?text=${encodeURIComponent(`${TEXT} ${ADRESSE}`)}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <button type="button" className={KNOPF} onClick={() => void kopieren()}>
            {kopiert ? 'Link kopiert' : 'Link kopieren'}
          </button>
        </div>
      )}
    </div>
  )
}
