import { useEffect, useState } from 'react'

/** Merkt sich über das Neuladen hinweg, dass es der Knopf war */
const MERKER = 'taktland.aktualisiert'

function ebenAktualisiert() {
  try {
    const ja = sessionStorage.getItem(MERKER) !== null
    sessionStorage.removeItem(MERKER)
    return ja
  } catch {
    return false
  }
}

/**
 * Knopf oben rechts im Auftaktbild der Startseite (Michael, 2026-09-24: statt
 * der Leiste mit Stand und Uhrzeit). Er holt den neuesten Stand; auf dem
 * Startbildschirm des iPhones gibt es sonst keinen Weg, die App neu zu laden.
 * Der Lernfortschritt bleibt, er liegt im Browser und nicht in der geladenen
 * Version. Nach dem Neuladen steht kurz «Aktualisiert» daneben.
 */
export function Aktualisieren() {
  const [laeuft, setLaeuft] = useState(false)
  const [eben, setEben] = useState(ebenAktualisiert)

  useEffect(() => {
    if (!eben) return
    const uhr = window.setTimeout(() => setEben(false), 5000)
    return () => window.clearTimeout(uhr)
  }, [eben])

  async function holen() {
    setLaeuft(true)
    try {
      // Gibt es einen neuen Service Worker, übernimmt er die Seite und lädt sie
      // selbst neu (serviceWorker.ts). Sonst genügt das Neuladen unten: Seite
      // und Daten fragt der Service Worker immer beim Server nach.
      const anmeldung = await navigator.serviceWorker?.getRegistration()
      await anmeldung?.update()
    } catch {
      // ohne Service Worker oder ohne Empfang: einfach neu laden
    }
    try {
      sessionStorage.setItem(MERKER, '1')
    } catch {
      // ohne Speicher fehlt nur die Bestätigung
    }
    window.location.reload()
  }

  const text = laeuft ? 'Wird aktualisiert …' : 'Aktualisieren'
  return (
    <div className="absolute right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] flex items-center gap-2">
      {eben && (
        <span role="status" className="bg-black/40 px-2 py-1 text-xs text-white">Aktualisiert</span>
      )}
      <button
        type="button" onClick={holen} disabled={laeuft} aria-label={text} title={text}
        className="flex size-7 items-center justify-center bg-black/30 text-white opacity-60
                   transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
      >
        <svg viewBox="0 0 24 24" className={`size-4 ${laeuft ? 'animate-spin motion-reduce:animate-none' : ''}`}
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 4v7h-7" />
        </svg>
      </button>
    </div>
  )
}
