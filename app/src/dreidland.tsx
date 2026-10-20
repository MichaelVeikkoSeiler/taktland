/**
 * 3dland.ch (Michael, 2026-10-21: «setzen wir jetzt 3dland.ch um»): «3D Schweiz» als eigene Seite, aus demselben Code wie
 * Taktland, vorerst mit Bildmarke und Farben von Taktland. Die Daten kommen von taktland.ch und daten.taktland.ch
 * (vite.3dland.config.ts). Ohne Zähler, ohne Konto; Einstellungen wie Datum und Uhrzeit bleiben nur, solange die Seite offen ist.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import schweiz3dDunkel from './assets/auftakt-schweiz3d-dunkel.webp'
import schweiz3dHell from './assets/auftakt-schweiz3d-hell.webp'
import { Auftakt } from './komponenten/Auftakt'
import Schweiz3D from './komponenten/Schweiz3D'

const LINK = 'underline underline-offset-2 hover:text-sbb-black dark:hover:text-sbb-white'

function DreiDLand() {
  return (
    <div className="min-h-screen bg-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white">
      <div className="mx-auto max-w-2xl md:max-w-3xl xl:max-w-6xl">
        <Auftakt bild={{ hell: schweiz3dHell, dunkel: schweiz3dDunkel, breite: 1344, hoehe: 664, alt: 'Illustration: Jemand hält auf einem Aussichtspunkt ein Tablet vor einen Berg; auf dem Tablet derselbe Berg als Modell mit farbigen Höhenstufen, dahinter ein See mit Dorf, Wald und Alpen.' }} />
        <header className="flex items-center gap-3 px-4 pt-4">
          <img src="./logo.svg" alt="" className="size-9" />
          <span className="text-3xl font-bold tracking-tight">3dland</span>
        </header>
        <main>
          <Schweiz3D eigeneSeite />
        </main>
        <footer className="mt-6 border-t border-sbb-cloud px-4 pt-4 pb-6 text-xs text-sbb-metal dark:border-sbb-iron dark:text-sbb-storm">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-sbb-black dark:text-sbb-white">
            <img src="./logo.svg" alt="" className="size-6" />3dland
          </p>
          <p>
            Daten: Bundesamt für Landestopografie swisstopo, Bundesamt für Statistik BFS. 3dland ist ein privates Projekt
            von <a href="https://taktland.ch" className={LINK}>Taktland</a> und kein Angebot einer Behörde.
          </p>
          <details className="klapp mt-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-sbb-black underline underline-offset-2 dark:text-sbb-white">
              Alle Datenquellen und Lizenzen
            </summary>
            <p className="mt-1">
              Gelände (swissALTIRegio, swissALTI3D), Luftbild (SWISSIMAGE), Seen und Ortschaften (swissTLMRegio), Wanderwege, Bäume und
              Wald (swissTLM3D), Gebäude (swissBUILDINGS3D 3.0), Gipfel und Ortsnamen der Landeskarte 1:1 Million (Swiss Map Vector 1000):
              Bundesamt für Landestopografie swisstopo. Kantone: Bundesamt für Statistik BFS. Was je Modell wofür ist, steht darunter
              unter «Modell, nicht massstäblich: Quellen». Lizenzen der mitgelieferten Bibliotheken:{' '}
              <a href="./lizenzen/drittsoftware.txt" className={LINK}>drittsoftware.txt</a>.
              Entstanden mit Unterstützung von KI (Claude Code; Auftaktbild: ChatGPT). 3dland kann Fehler enthalten: Die Rohdaten
              können unvollständig oder veraltet sein, und auch beim Aufbereiten können Fehler passieren. Nicht zum Navigieren gedacht.
            </p>
          </details>
          <p className="mt-2">
            Kontakt: <a href="mailto:hallo@taktland.ch" className={LINK}>hallo@taktland.ch</a>
          </p>
          <p className="mt-1">
            Kein Konto, kein Zähler. Die Seite lädt Gelände, Luftbilder und Wege von taktland.ch und daten.taktland.ch; dabei sieht
            der Server wie bei jeder Webseite die Adresse des Geräts.
          </p>
        </footer>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DreiDLand />
  </StrictMode>,
)
