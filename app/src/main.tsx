import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { serviceWorkerAnmelden } from './serviceWorker'
import { Gesperrt } from './komponenten/Gesperrt'
import { useSperre } from './verfuegbar'

/** Taktland, solange es verfügbar ist (src/verfuegbar.ts) */
function Taktland() {
  const sperre = useSperre()
  return sperre ? <Gesperrt sperre={sperre} /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Taktland />
  </StrictMode>,
)

serviceWorkerAnmelden()
