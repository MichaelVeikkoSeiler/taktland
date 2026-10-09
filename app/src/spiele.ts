/**
 * Die Spiele von Taktland (Michael, 2026-10-02: Hauptreiter «Spiele» statt «Duell»).
 * Eine Liste für die Übersicht unter #/spiele. Ein neues Spiel kommt hierher: erst mit
 * status 'im-bau' ohne Adresse, als Platzhalter; ist es fertig, bekommt es Titel,
 * Beschreibung, Adresse und status 'spielbereit'. Platzhalter sind entfernt (Michael,
 * 2026-10-03: weitere Spiele folgen sporadisch); ein neues kann trotzdem mit «im-bau» erscheinen.
 */
import duellDunkel from './assets/auftakt-duell-dunkel.webp'
import duellHell from './assets/auftakt-duell-hell.webp'
import erratenDunkel from './assets/auftakt-erraten-dunkel.webp'
import erratenHell from './assets/auftakt-erraten-hell.webp'
import modellbahnHell from './assets/auftakt-modellbahn-hell.webp'
import spieleDunkel from './assets/auftakt-spiele-dunkel.webp'
import spieleHell from './assets/auftakt-spiele-hell.webp'

export type SpielStatus = 'spielbereit' | 'im-bau'

export interface Spiel {
  id: string
  titel: string
  beschreibung: string
  status: SpielStatus
  /** nur bei spielbereiten Spielen: wohin «Spielen» führt */
  adresse?: string
  /** kurz für die Kachel in der Übersicht, die Beschreibung steht beim Spiel */
  kurz?: string
  /** kleines Bild auf der Kachel, hell und dunkel */
  bild?: { hell: string; dunkel: string; alt: string }
}

// Reihenfolge: Modellbahn, Geo, dann die übrigen (Michael, 2026-10-08)
export const SPIELE: Spiel[] = [
  // Michael, 2026-10-08: «neues Spiel 3D/VR», Name «Modellbahn»; die Brille gibt es nur hier, nicht unter Fahren
  {
    id: 'modellbahn', titel: 'Modellbahn', status: 'spielbereit', adresse: '#/modellbahn',
    kurz: 'Eine Strecke als Modell im Gelände, auch in der VR-Brille.',
    bild: { hell: modellbahnHell, dunkel: modellbahnHell, alt: 'Illustration: Jemand mit VR-Brille dreht am Tisch das Modell einer Bergstrecke mit Zug auf einem Viadukt.' },
    beschreibung: 'Eine Strecke als Modell im Gelände: drehen, zoomen und einen Zug darüber fahren lassen, mit einer '
      + 'Brille auch auf dem Tisch vor dir. Ein Modell, kein Abbild der Wirklichkeit.',
  },
  {
    id: 'schweiz11', titel: 'Geo', status: 'spielbereit', adresse: '#/schweiz11',
    kurz: 'Wo liegt dieser Bahnhof, Tunnel oder diese Brücke? Setze deinen Pin.',
    bild: { hell: spieleHell, dunkel: spieleDunkel, alt: 'Illustration: Jemand setzt eine Ortsmarke auf eine Karte im Handy.' },
    beschreibung: 'Wo liegt dieser Bahnhof, dieser Tunnel, diese Brücke? Setze deinen Pin auf die Karte: '
      + 'je näher, desto mehr Punkte. Allein oder mehrere auf diesem Gerät.',
  },
  {
    id: 'duell', titel: 'Duell', status: 'spielbereit', adresse: '#/duell',
    kurz: 'Zwei Bahnhöfe, Strecken oder Tunnel: Wer liegt bei einer Zahl vorne?',
    bild: { hell: duellHell, dunkel: duellDunkel, alt: 'Illustration: ein grosser und ein kleiner Bahnhof nebeneinander.' },
    beschreibung: 'Zwei Bahnhöfe, Strecken oder Tunnel treten gegeneinander an. Du wählst, wer bei '
      + 'einer Zahl aus den Daten vorne liegt, und baust Runde um Runde deine Serie auf.',
  },
  {
    id: 'erraten', titel: 'Bahnhofsuche', status: 'spielbereit', adresse: '#/erraten',
    kurz: 'Sechs verdeckte Hinweise, ein Bahnhof: Wie wenige brauchst du?',
    bild: { hell: erratenHell, dunkel: erratenDunkel, alt: 'Illustration: Jemand spielt «Bahnhofsuche» auf dem Tablet.' },
    beschreibung: 'Taktland denkt an einen Bahnhof. Decke Hinweise wie Kanton, Höhe oder Ein- und Aussteigende auf und rate: '
      + 'je weniger Hinweise, desto mehr Punkte. Allein oder mit mehreren auf diesem Gerät, miteinander oder gegeneinander.',
  },
]

/** Alle Bereiche, die zum Hauptreiter «Spiele» gehören: die Übersicht und jedes spielbereite
 *  Spiel (seine id ist auch sein Bereich in Kopf.tsx und App.tsx) */
export const SPIEL_BEREICHE: string[] = ['spiele', ...SPIELE.filter((s) => s.status === 'spielbereit').map((s) => s.id)]
