import auftaktDunkel from '../assets/auftakt-dunkel.webp'
import auftaktHell from '../assets/auftakt-hell.webp'
import linienDunkel from '../assets/auftakt-linien-dunkel.webp'
import linienHell from '../assets/auftakt-linien-hell.webp'
import tunnelDunkel from '../assets/auftakt-tunnel-dunkel.webp'
import tunnelHell from '../assets/auftakt-tunnel-hell.webp'
import { Auftakt, type AuftaktBild } from './Auftakt'

export type Bereich = 'bahnhoefe' | 'linien' | 'tunnel' | 'bruecken' | 'duell'

/** Die Reiter oben auf jeder Seite, in dieser Reihenfolge */
const REITER: Array<{ bereich: Bereich; text: string; adresse: string }> = [
  { bereich: 'bahnhoefe', text: 'Bahnhöfe', adresse: '#/' },
  { bereich: 'linien', text: 'Linien', adresse: '#/linien' },
  { bereich: 'tunnel', text: 'Tunnel', adresse: '#/tunnel' },
  { bereich: 'bruecken', text: 'Brücken', adresse: '#/bruecken' },
  { bereich: 'duell', text: 'Duell', adresse: '#/duell' },
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
}

/**
 * Kopf jeder Seite: Name, Anleitung und die Reiter der Bereiche. Auf der
 * Übersicht eines Bereichs steht darüber sein Auftaktbild; Bahnhofs- und
 * Linienseiten kommen ohne Bild aus, dort zählt der Inhalt.
 */
export function Kopf({ aktiv, mitBild, startseite }: {
  aktiv: Bereich | null
  mitBild: boolean
  startseite: boolean
}) {
  const bild = mitBild && aktiv ? BILDER[aktiv] : undefined
  const titel = 'text-3xl font-bold tracking-tight'
  return (
    <header className="border-b border-sbb-cloud px-4 pt-8 dark:border-sbb-iron">
      {bild && <Auftakt key={aktiv} bild={bild} />}
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
      {/* Unter 360 Pixeln Breite (ältere kleine Handys) wird die Schrift kleiner,
          sonst passt «Duell» nicht mehr in die Zeile */}
      <nav aria-label="Bereiche"
           className="-mb-px mt-4 flex gap-x-4 overflow-x-auto [scrollbar-width:none]
                      max-[359px]:gap-x-3 max-[359px]:text-sm sm:gap-x-6">
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
