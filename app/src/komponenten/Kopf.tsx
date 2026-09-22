import auftaktDunkel from '../assets/auftakt-dunkel.webp'
import auftaktHell from '../assets/auftakt-hell.webp'
import brueckenDunkel from '../assets/auftakt-bruecken-dunkel.webp'
import brueckenHell from '../assets/auftakt-bruecken-hell.webp'
import duellDunkel from '../assets/auftakt-duell-dunkel.webp'
import duellHell from '../assets/auftakt-duell-hell.webp'
import linienDunkel from '../assets/auftakt-linien-dunkel.webp'
import linienHell from '../assets/auftakt-linien-hell.webp'
import tunnelDunkel from '../assets/auftakt-tunnel-dunkel.webp'
import tunnelHell from '../assets/auftakt-tunnel-hell.webp'
import { Auftakt, type AuftaktBild } from './Auftakt'

export type Bereich = 'bahnhoefe' | 'linien' | 'tunnel' | 'bruecken' | 'duell' | 'standort'

/** Die Reiter oben auf jeder Seite, in dieser Reihenfolge */
const REITER: Array<{ bereich: Bereich; text: string; adresse: string }> = [
  { bereich: 'bahnhoefe', text: 'Bahnhöfe', adresse: '#/' },
  { bereich: 'linien', text: 'Linien', adresse: '#/linien' },
  { bereich: 'tunnel', text: 'Tunnel', adresse: '#/tunnel' },
  { bereich: 'bruecken', text: 'Brücken', adresse: '#/bruecken' },
  { bereich: 'duell', text: 'Duell', adresse: '#/duell' },
  { bereich: 'standort', text: 'Standort', adresse: '#/standort' },
]

/** Auftaktbilder je Bereich. Ein Bereich ohne Eintrag erscheint ohne Bild. */
const BILDER: Partial<Record<Bereich, AuftaktBild>> = {
  bahnhoefe: {
    hell: auftaktHell, dunkel: auftaktDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Am Perron steigen Menschen aus einem Zug aus, andere warten aufs Einsteigen.',
  },
  linien: {
    hell: linienHell, dunkel: linienDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Ein Gleis mit Fahrleitung, dahinter eine Stadt, eine Brücke über einen Fluss und Berge.',
  },
  tunnel: {
    hell: tunnelHell, dunkel: tunnelDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Ein Gleis führt in ein Tunnelportal im Fels, links Wasser mit einer Brücke, eine Stadt und Berge.',
  },
  bruecken: {
    hell: brueckenHell, dunkel: brueckenDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration: Eine Bahnbrücke mit Fahrleitung führt über einen Fluss, dahinter eine Stadt und Berge.',
  },
  duell: {
    hell: duellHell, dunkel: duellDunkel, breite: 1344, hoehe: 664,
    alt: 'Illustration in zwei Hälften: links ein moderner Bahnhof aus Glas und Beton, rechts ein alter Bahnhof mit Holzdach und Bahnhofsuhr.',
  },
}

/**
 * Kopf jeder Seite: Name, Anleitung und die Reiter der Bereiche, darüber das
 * Auftaktbild des Bereichs. Es steht auch auf den Seiten darunter, etwa auf
 * einer Bahnhofs- oder Linienseite (Michael, 2026-09-22: «Ich finde es
 * schöner, wenn die Auftaktbilder bleiben»). Die Anleitung gehört zu keinem
 * Bereich und zeigt das Bahnhofbild.
 */
export function Kopf({ aktiv, startseite }: {
  aktiv: Bereich | null
  startseite: boolean
}) {
  const bild = BILDER[aktiv ?? 'bahnhoefe']
  const titel = 'text-3xl font-bold tracking-tight'
  return (
    <header className="border-b border-sbb-cloud px-4 pt-8 dark:border-sbb-iron">
      {bild && <Auftakt key={aktiv ?? 'bahnhoefe'} bild={bild} />}
      <div className="h-1 w-10 bg-sbb-red" aria-hidden="true" />
      <div className="mt-3 flex items-baseline justify-between gap-4">
        {startseite
          ? <h1 className={titel}>Taktland</h1>
          : <a href="#/" className={titel}>Taktland</a>}
        <a href="#/anleitung"
           className="shrink-0 text-sm text-sbb-metal underline underline-offset-2
                      hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white">
          So funktioniert’s
        </a>
      </div>
      {/* Sechs Reiter in einer Zeile: auf dem Handy über die ganze Breite verteilt
          und etwas kleiner geschrieben, je schmaler das Gerät, desto kleiner;
          sonst fiel «Standort» aus der Zeile */}
      <nav aria-label="Bereiche"
           className="-mb-px mt-4 flex justify-between gap-x-2 overflow-x-auto text-[15px]
                      [scrollbar-width:none] max-[379px]:text-sm max-[359px]:gap-x-1 max-[359px]:text-[13px]
                      sm:justify-start sm:gap-x-6 sm:text-base">
        {REITER.map((r) => {
          const hier = r.bereich === aktiv
          return (
            <a key={r.bereich} href={r.adresse} aria-current={hier ? 'page' : undefined}
               className={`shrink-0 border-b-2 pb-2 pt-1 font-medium transition-colors ${hier
                 ? 'border-sbb-black text-sbb-black dark:border-sbb-white dark:text-sbb-white'
                 : 'border-transparent text-sbb-metal hover:text-sbb-black dark:text-sbb-storm dark:hover:text-sbb-white'}`}>
              {r.text}
            </a>
          )
        })}
      </nav>
    </header>
  )
}
