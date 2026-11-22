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
import puzzleDunkel from './assets/auftakt-puzzle-dunkel.webp'
import puzzleHell from './assets/auftakt-puzzle-hell.webp'
import reisedauerDunkel from './assets/auftakt-reisedauer-dunkel.webp'
import reisedauerHell from './assets/auftakt-reisedauer-hell.webp'
import wobinichBild from './assets/auftakt-wobinich.webp'
import wobinichDunkel from './assets/auftakt-wobinich-dunkel.webp'
import probefahrenBild from './assets/auftakt-probefahren.webp'
import probefahrenDunkel from './assets/auftakt-probefahren-dunkel.webp'
// seit 2026-11-12 ein eigenes Bild in Taktland, 3dland.ch behält seine (Michael: «Dieses Bild für Virtuelle Schweiz anwenden»)
import schweiz3dHell from './assets/auftakt-virtuell-hell.webp'
import schweiz3dDunkel from './assets/auftakt-virtuell-dunkel.webp'
import spieleDunkel from './assets/auftakt-spiele-dunkel.webp'
import spieleHell from './assets/auftakt-spiele-hell.webp'
import bilderpuzzleDunkel from './assets/auftakt-bilderpuzzle-dunkel.webp'
import bilderpuzzleHell from './assets/auftakt-bilderpuzzle-hell.webp'
import modellbahnDunkel from './assets/auftakt-modellbahn-dunkel.webp'
import modellbahnHell from './assets/auftakt-modellbahn-hell.webp'

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
    bild: { hell: schweiz3dHell, dunkel: schweiz3dDunkel, alt: 'Illustration: Jemand mit VR-Brille zielt am Tisch mit dem Strahl eines Controllers auf einen rot-weissen Zug, der im Modell einer Landschaft mit Wald, Tunneln und Bergen über einen Viadukt fährt; über dem Zug ein Schild «IC 0X» mit Pfeil, daneben ein Handy mit demselben Modell, draussen ein See und Berge.' },
    beschreibung: 'Die ganze Schweiz als Modell. Wähle ein Feld oder such einen Ort, eine Adresse, einen Gipfel oder See, und tauche ein, bis auf ein Stück '
      + 'von 1 km. Mit einer Brille steht das Modell vor dir auf dem Tisch.',
  },
  // Michael, 2026-10-08: «neues Spiel 3D/VR», Name «Modellbahn»; die Brille gibt es nur hier, nicht unter Fahren
  {
    // Michael, 2026-11-07: «Spiele sollen heissen: Virtuell und Probefahren»
    id: 'modellbahn', titel: 'Probefahren', status: 'spielbereit', adresse: '#/modellbahn',
    kurz: 'Eine Strecke als Modell im Gelände, im Führerstand selbst fahren, auch in der VR-Brille.',
    // Bild seit 2026-11-20 (Michael: «Hier die neuen Bilder für die Spiele Wo fahre ich (Bild 1) und Probefahren (Bild 2)»)
    bild: { hell: probefahrenBild, dunkel: probefahrenDunkel, alt: 'Illustration: Eine Lokführerin im Führerstand, vor ihr das Pult und die Strecke mit Fahrleitung.' },
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
  // Michael, 2026-10-18: «Wo bin ich passt gut»; seit 2026-11-20 mit eigenem Bild (Michael: «Hier die neuen Bilder …»)
  {
    id: 'wobinich', titel: 'Wo fahre ich?', status: 'spielbereit', adresse: '#/wobinich',
    kurz: 'Im Führerstand irgendwo in der Schweiz, ohne Namen: Wo warst du?',
    bild: { hell: wobinichBild, dunkel: wobinichDunkel, alt: 'Illustration: Ein Tablet mit Strecke, roter Ortsmarke und Fragezeichen auf dem Tisch am Zugfenster.' },
    beschreibung: 'Taktland setzt dich in den Führerstand, irgendwo auf einer Strecke, ohne Ortstafeln und Namen. Fahr ein '
      + 'Stück mit und tippe auf der Karte, wo du warst: je näher, desto mehr Punkte.',
  },
  // Michael, 2026-11-14: «6 und 7 gerne umsetzen» (Fahrplan-Puzzle, Reisedauer); seit 2026-11-15 Michaels Bilder (Michael: «Hier die Bilder für die Spiele Fahrplan Puzzle und Reisedauer»)
  {
    id: 'puzzle', titel: 'Fahrplan-Puzzle', status: 'spielbereit', adresse: '#/puzzle',
    kurz: 'Vier Halte eines Zugs, gemischt: In welcher Reihenfolge fährt er sie an?',
    bild: { hell: puzzleHell, dunkel: puzzleDunkel, alt: 'Illustration: ein Zug am Perron, daneben ein Fahrplan mit vier Halten voller Fragezeichen.' },
    beschreibung: 'Ein Zug fährt von A nach B. Vier seiner Halte dazwischen sind gemischt: Bring sie in die richtige Reihenfolge. '
      + 'Mit dem Fahrplan von opentransportdata.swiss.',
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
  // Michael, 2026-11-22: «Man soll Gleise auf ein Layout legen können. Tunnel und Brücken und Bahnhöfe stehen auch zur Verfügung», «Nimm mal
  // Gleisbau»; das Bild der Kachel vorerst das der Modellbahn
  {
    // seit 2026-11-22 «Im Bau», nicht anklickbar; #/gleisbau geht weiter, zum Weiterentwickeln (Michael: «Ist es möglich, das Spiel noch zu sperren, damit
    // man sieht, es ist in Entwicklung, die Spannung kann steigen, aber wir entwickeln das Spiel zuerst für uns noch weiter und fertig»)
    id: 'gleisbau', titel: 'Gleisbau', status: 'im-bau', adresse: '#/gleisbau',
    kurz: 'Gleise, Bahnhöfe, Tunnel und Brücken auf ein Brett legen und den Zug fahren lassen.',
    bild: { hell: modellbahnHell, dunkel: modellbahnDunkel, alt: 'Illustration: eine Modellbahn mit Zug, Gleisen und Landschaft.' },
    beschreibung: 'Ein Brett mit 8 × 6 Feldern: Leg Gleise, Weichen, Bahnhöfe, Tunnel und Brücken, gestalte die Landschaft und lass den Zug '
      + 'fahren. Er hält an jedem Bahnhof und kehrt am Ende des Gleises um.',
  },
  // Michael, 2026-11-21: «Kannst du dieses Puzzlespiel auf Taktland-App übernehmen und dort alle Bilder, welche wir auf Taktland integriert
  // haben, als Puzzle bereitstellen?»; das Bild der Kachel seit 2026-11-22 Michaels eigenes («Hier die Bilder fürs Bilderpuzzle, hell und dunkel»)
  {
    id: 'bilderpuzzle', titel: 'Bilderpuzzle', status: 'spielbereit', adresse: '#/bilderpuzzle',
    kurz: 'Die Bilder von Taktland oder ein eigenes Foto, in 4 bis 48 Teilen.',
    bild: { hell: bilderpuzzleHell, dunkel: bilderpuzzleDunkel, alt: 'Illustration: Eine Frau legt im Bahnhof ein Puzzle mit einem Zug auf einem Viadukt, daneben ein Kaffeebecher, draussen ein Zug am Perron.' },
    beschreibung: 'Wähle, wie viele Teile es sein sollen, und ein Bild von Taktland oder ein eigenes Foto. Zieh die Teile an ihren Platz: '
      + 'Stimmt er, rastet das Teil ein.',
  },
  // am Schluss der Liste (Michael, 2026-11-15: «Spiel, Reisedauer, am Schluss.»)
  {
    id: 'fahrzeit', titel: 'Reisedauer', status: 'spielbereit', adresse: '#/fahrzeit',
    kurz: 'Wie viele Minuten braucht der Zug laut Fahrplan von A nach B?',
    bild: { hell: reisedauerHell, dunkel: reisedauerDunkel, alt: 'Illustration: ein Tablet mit einer Strecke von A nach B und einer Stoppuhr, dahinter ein Zug auf einem Viadukt.' },
    beschreibung: 'Wie viele Minuten braucht ein Zug laut Fahrplan von der Abfahrt im einen Bahnhof bis zur Ankunft im anderen? '
      + 'Stell den Regler ein: je näher, desto mehr Punkte.',
  },
]

/** Alle Bereiche, die zum Hauptreiter «Spiele» gehören: die Übersicht und jedes spielbereite
 *  Spiel (seine id ist auch sein Bereich in Kopf.tsx und App.tsx) */
export const SPIEL_BEREICHE: string[] = ['spiele', ...SPIELE.filter((s) => s.status === 'spielbereit').map((s) => s.id)]
