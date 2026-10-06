import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
// Space Grotesk, mitgeliefert; geladen wird sie erst, wenn man sie unter Einstellungen wählt
import '@fontsource-variable/space-grotesk/index.css'
import { serviceWorkerAnmelden } from './serviceWorker'
import { Gesperrt } from './komponenten/Gesperrt'
import { useSperre } from './verfuegbar'
import { oeffnenZaehlen } from './zaehlen'
import { aufklappenHoeren, schreibmaschineHoeren } from './audio'
import { anwenden as einstellungenAnwenden } from './einstellungen'

/** Taktland, solange es verfügbar ist (src/verfuegbar.ts) */
function Taktland() {
  const sperre = useSperre()
  // gezählt wird nur, solange Taktland verfügbar ist
  useEffect(() => {
    if (sperre !== null) return
    // auch wenn die App über Nacht offen blieb: beim Zurückholen am neuen Tag
    const zaehlen = () => { if (document.visibilityState === 'visible') oeffnenZaehlen() }
    zaehlen()
    document.addEventListener('visibilitychange', zaehlen)
    return () => document.removeEventListener('visibilitychange', zaehlen)
  }, [sperre])
  return sperre ? <Gesperrt sperre={sperre} /> : <App />
}

// Schriftgrösse und Schriftart vor dem ersten Bild, damit nichts springt
einstellungenAnwenden()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Taktland />
  </StrictMode>,
)

serviceWorkerAnmelden()
aufklappenHoeren()
schreibmaschineHoeren()
