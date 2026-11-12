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
import fahrtDunkel from './assets/auftakt-fahrt-dunkel.webp'
import fahrtHell from './assets/auftakt-fahrt-hell.webp'
import modellbahnDunkel from './assets/auftakt-modellbahn-dunkel.webp'
import modellbahnHell from './assets/auftakt-modellbahn-hell.webp'
import schweiz3dDunkel from './assets/auftakt-3dland-dunkel.webp'
import schweiz3dHell from './assets/auftakt-3dland-hell.webp'
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

// Reihenfolge: Virtuelle Schweiz (Michael, 2026-11-07), Modellbahn, Geo, dann die übrigen (Michael, 2026-10-08)
export const SPIELE: Spiel[] = [
  // seit 2026-11-07 an erster Stelle und «Virtuelle Schweiz» (Michael: «3D-Land als erstes Spiel in Spiele und neu heisst es Virtuelle Schweiz»);
  // auf 3dland.ch bleibt der Name 3D-Land
  // an letzter Stelle (Michael, 2026-10-23); Michael, 2026-10-18: «3D Schweiz heisst das Spiel», vorerst mit den Daten, die es schon gibt; das Bild ist das der Modellbahn
  {
    // seit 2026-11-06 «3D-Land» wie 3dland.ch, mit dessen Bildern (Michael: «alles auf Taktland laufen … 3D Schweiz heisst dann 3D Land und hat
    // die genau identischen Funktionen wie bei 3DLand.ch»)
    // seit 2026-11-12 wieder «Virtuelle Schweiz» statt «Virtuell» (Michael: «Spiel «Virtuell» soll wieder «Virtuelle Schweiz» heissen»)
    id: 'schweiz3d', titel: 'Virtuelle Schweiz', status: 'spielbereit', adresse: '#/schweiz3d',
    kurz: 'Die ganze Schweiz als Modell: einen Ort, eine Adresse, einen Gipfel oder See suchen und eintauchen, auch in der VR-Brille.',
    bild: { hell: schweiz3dHell, dunkel: schweiz3dDunkel, alt: 'Illustration: Jemand mit XR-Brille blickt auf ein Modell einer Landschaft mit zwei Seen auf einem dunklen Sockel.' },
    beschreibung: 'Die ganze Schweiz als Modell. Wähle ein Feld oder such einen Ort, eine Adresse, einen Gipfel oder See, und tauche ein, bis auf ein Stück '
      + 'von 1 km. Mit einer Brille steht das Modell vor dir auf dem Tisch.',
  },
  // Michael, 2026-10-08: «neues Spiel 3D/VR», Name «Modellbahn»; die Brille gibt es nur hier, nicht unter Fahren
  {
    // Michael, 2026-11-07: «Spiele sollen heissen: Virtuell und Probefahren»
    id: 'modellbahn', titel: 'Probefahren', status: 'spielbereit', adresse: '#/modellbahn',
    kurz: 'Eine Strecke als Modell im Gelände, im Führerstand selbst fahren, auch in der VR-Brille.',
    bild: { hell: modellbahnHell, dunkel: modellbahnDunkel, alt: 'Illustration: Jemand mit VR-Brille dreht am Tisch das Modell einer Bergstrecke mit Zug auf einem Viadukt.' },
    beschreibung: 'Eine Strecke als Modell im Gelände: drehen, zoomen und einen Zug darüber fahren lassen, mit einer '
      + 'Brille auch auf dem Tisch vor dir. Im Führerstand fährst du selbst, mit dem echten Wetter der nächsten Station. Ein Modell, '
      + 'kein Abbild der Wirklichkeit. Dazu die Probefahrten, die einen Weg wie unterwegs abspielen.',
  },
  {
    id: 'schweiz11', titel: 'Geo', status: 'spielbereit', adresse: '#/schweiz11',
    kurz: 'Wo liegt dieser Bahnhof, Tunnel oder diese Brücke? Setze deinen Pin.',
    bild: { hell: spieleHell, dunkel: spieleDunkel, alt: 'Illustration: Jemand setzt eine Ortsmarke auf eine Karte im Handy.' },
    beschreibung: 'Wo liegt dieser Bahnhof, dieser Tunnel, diese Brücke? Setze deinen Pin auf die Karte: '
      + 'je näher, desto mehr Punkte. Allein oder mehrere auf diesem Gerät.',
  },
  // Michael, 2026-10-18: «Wo bin ich passt gut»; das Bild ist vorerst das des Fahrtmodus
  {
    id: 'wobinich', titel: 'Wo bin ich?', status: 'spielbereit', adresse: '#/wobinich',
    kurz: 'Im Führerstand irgendwo in der Schweiz, ohne Namen: Wo warst du?',
    bild: { hell: fahrtHell, dunkel: fahrtDunkel, alt: 'Illustration: Blick aus dem Zugfenster auf ein Tunnelportal, einen See mit Dorf und Berge.' },
    beschreibung: 'Taktland setzt dich in den Führerstand, irgendwo auf einer Strecke, ohne Ortstafeln und Namen. Fahr ein '
      + 'Stück mit und tippe auf der Karte, wo du warst: je näher, desto mehr Punkte.',
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
