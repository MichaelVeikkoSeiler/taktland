import { useEffect, useState } from 'react'

/** Merkt sich über das Neuladen hinweg, dass es der Knopf war */
const MERKER = 'taktland.aktualisiert'

/** Zeitpunkt des Baus (vite.config.ts), in Schweizer Zeit */
const GEBAUT = new Date(import.meta.env.VITE_GEBAUT as string).toLocaleString('de-CH', {
  timeZone: 'Europe/Zurich', day: 'numeric', month: 'numeric', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

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
 * Während der Entwicklung ganz oben: von wann die geladene Version ist, und
 * ein Knopf, der den neuesten Stand holt. Auf dem Startbildschirm des iPhones
 * gibt es sonst keinen Weg, die App neu zu laden. Der Lernfortschritt bleibt,
 * er liegt im Browser und nicht in der geladenen Version.
 *
 * Später, wenn Taktland fertig ist, kann die Leiste wieder weg (App.tsx).
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

  return (
    <div className="flex items-center justify-between gap-3 bg-sbb-milk px-4 py-1.5 text-xs
                    text-sbb-metal dark:bg-sbb-charcoal dark:text-sbb-storm" role="status">
      <span>{eben ? 'Aktualisiert. ' : ''}Version vom {GEBAUT}</span>
      <button
        type="button" onClick={holen} disabled={laeuft}
        className="shrink-0 underline underline-offset-2 hover:text-sbb-black disabled:no-underline
                   dark:hover:text-sbb-white"
      >
        {laeuft ? 'Wird aktualisiert …' : 'Aktualisieren'}
      </button>
    </div>
  )
}
