import { useState } from 'react'

const ADRESSE = 'https://taktland.ch'
const TEXT = 'Taktland: Bahnhöfe, Strecken, Tunnel und Brücken der Schweiz kennenlernen und im Zug mitfahren.'

const KNOPF = 'inline-flex min-h-10 items-center rounded-lg border border-sbb-cloud bg-white px-4 text-sm font-medium ' +
  'text-sbb-black hover:bg-sbb-milk dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white dark:hover:bg-sbb-charcoal'

/**
 * «Taktland teilen» in der Fusszeile (Michael, 2026-10-10: «per Mail, WhatsApp etc.»): wo das Gerät teilen kann
 * (Handy), sein eigenes Menü mit allen Apps; sonst E-Mail, WhatsApp und Link kopieren. Geteilt wird nur die Adresse
 * von taktland.ch, nichts vom eigenen Fortschritt.
 */
export default function Teilen() {
  const [auswahl, setAuswahl] = useState(false)
  const [kopiert, setKopiert] = useState(false)

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
    <div className="mb-3">
      <button type="button" onClick={() => void teilen()} aria-expanded={'share' in navigator ? undefined : auswahl} className={KNOPF}>
        Taktland teilen
      </button>
      {auswahl && (
        <div className="mt-2 flex flex-wrap gap-2">
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
