/**
 * 3dland.ch (Michael, 2026-10-21: «setzen wir jetzt 3dland.ch um»): «3D Schweiz» als eigene Seite, aus demselben Code wie
 * Taktland, mit eigener Bildmarke und eigenem Auftaktbild (Michael, 2026-10-21: «als Platzhalter»; seit 2026-10-25 mit XR-Brille, Windhosen und Regen, dunkel bei Nacht), sonst den Farben von Taktland. Die Daten kommen von taktland.ch und daten.taktland.ch
 * (vite.3dland.config.ts). Ohne Zähler, ohne Konto; Einstellungen wie Datum und Uhrzeit bleiben nur, solange die Seite offen ist.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import auftaktDunkel from './assets/auftakt-3dland-dunkel.webp'
import auftaktHell from './assets/auftakt-3dland-hell.webp'
import { Auftakt } from './komponenten/Auftakt'
import { aufklappenHoeren } from './audio'
import Schweiz3D from './komponenten/Schweiz3D'
import Teilen from './komponenten/Teilen'

const LINK = 'underline underline-offset-2 hover:text-sbb-black dark:hover:text-sbb-white'

function DreiDLand() {
  return (
    <div className="min-h-screen bg-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white">
      <div className="mx-auto max-w-2xl md:max-w-3xl xl:max-w-6xl">
        {/* Auftakt rückt mit -mx-4 -mt-8 an den Rand der Seite von Taktland; hier dieser Rand */}
        {/* -mb-6 hebt den Abstand unter dem Auftaktbild auf, das Modell schliesst gleich an (Michael, 2026-10-25: «Weissen Rahmen um die
            Karte weglassen») */}
        <div className="-mb-6 px-4 pt-8">
          <Auftakt bild={{ hell: auftaktHell, dunkel: auftaktDunkel, breite: 1536, hoehe: 1024, alt: 'Illustration: Jemand mit XR-Brille und zwei Controllern blickt auf ein quadratisches Modell einer Landschaft mit zwei Seen, Dörfern und Wald auf einem dunklen Sockel; darauf zwei rot-weisse Windhosen, im Hintergrund Regen über Seen und Hügeln.'}}
                   oben={<img src="./logo.png" alt="3dland" className="absolute right-3 top-3 size-14 rounded-xl shadow-md sm:right-5 sm:top-5 sm:size-20" />} />
        </div>
        <main>
          <Schweiz3D eigeneSeite />
        </main>
        <footer className="mt-6 border-t border-sbb-cloud px-4 pt-4 pb-6 text-xs text-sbb-metal dark:border-sbb-iron dark:text-sbb-storm">
          {/* rechts neben der Bildmarke «3dland teilen» wie in Taktland (Michael, 2026-10-27: «Teilen Button … so wie bei Taktland») */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold text-sbb-black dark:text-sbb-white">
              <img src="./logo.png" alt="" className="size-6 rounded" />3dland
            </p>
            <Teilen name="3dland" adresse="https://3dland.ch" text="3dland: die Schweiz als 3D-Modell zum Eintauchen, auch mit XR-Brille." />
          </div>
          <p>
            Daten: Bundesamt für Landestopografie swisstopo, Bundesamt für Statistik BFS, MeteoSchweiz, Fahrplan opentransportdata.swiss. 3dland ist ein privates Projekt
            von <a href="https://taktland.ch" className={LINK}>Taktland</a> und kein Angebot einer Behörde.
          </p>
          <details className="klapp mt-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-sbb-black underline underline-offset-2 dark:text-sbb-white">
              Alle Datenquellen und Lizenzen
            </summary>
            <p className="mt-1">
              Gelände (swissALTIRegio, swissALTI3D), Luftbild (SWISSIMAGE), Seen, Ortschaften und die Gipfel der Suche (swissTLMRegio), Wanderwege, Bäume und
              Wald (swissTLM3D), Gebäude (swissBUILDINGS3D 3.0), Gipfel und Ortsnamen der Landeskarte 1:1 Million (Swiss Map Vector 1000):
              Bundesamt für Landestopografie swisstopo. Kantone: Bundesamt für Statistik BFS. Wind und Windprognose: MeteoSchweiz
              (SwissMetNet und lokale Prognose, Open Government Data). Wolken: Wettermodell ICON-CH1-EPS, MeteoSchweiz (Open Government Data, CC-BY). Seegrund von 22 Seen: swissBATHY3D; Felsoberfläche: swissBEDROCK; beide swisstopo. Züge und Schiffe: Fahrplan als GTFS, opentransportdata.swiss; Kurslinien der Schiffe: swissTLMRegio, swisstopo. Sterne: Hipparcos-Katalog der ESA, aufbereitet von d3-celestial
              (Olaf Frohn, BSD-Lizenz). Was je Modell wofür ist, steht darunter
              unter «Modell, nicht massstäblich: Quellen». Lizenzen der mitgelieferten Bibliotheken:{' '}
              <a href="./lizenzen/drittsoftware.txt" className={LINK}>drittsoftware.txt</a>.
              Entstanden mit Unterstützung von KI (Claude Code; Bildmarke und Auftaktbild: ChatGPT). 3dland kann Fehler enthalten: Die Rohdaten
              können unvollständig oder veraltet sein, und auch beim Aufbereiten können Fehler passieren. Nicht zum Navigieren gedacht.
            </p>
          </details>
          <p className="mt-2">
            Kontakt: <a href="mailto:hallo@taktland.ch" className={LINK}>hallo@taktland.ch</a>
          </p>
          <p className="mt-1">
            Kein Konto, kein Zähler. «3dland teilen» gibt nur die Adresse 3dland.ch und einen Satz an das Teilen-Menü des Geräts, an E-Mail oder WhatsApp weiter. Die Seite lädt Gelände, Luftbilder und Wege von taktland.ch und daten.taktland.ch; dabei sieht
            der Server wie bei jeder Webseite die Adresse des Geräts. «Mein Standort» fragt den Standort erst nach deiner Freigabe
            ab; er bleibt auf dem Gerät und wird weder gesendet noch gespeichert. Ist «Wetter» an, holt die Seite Messung und Prognose der
            nächsten Wetterstation bei data.geo.admin.ch (Bund); der Dienst erfährt so, in welcher Gegend das Modell liegt.
          </p>
        </footer>
      </div>
    </div>
  )
}

// Klick beim Auf- und Zuklappen wie in Taktland (Michael, 2026-10-25: «Klickgeräusche beim Öffnen und schliessen der Klappen»)
aufklappenHoeren()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DreiDLand />
  </StrictMode>,
)
