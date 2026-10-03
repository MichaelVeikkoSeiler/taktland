/**
 * Die Spiele von Taktland (Michael, 2026-10-02: Hauptreiter «Spiele» statt «Duell»).
 * Eine Liste für die Übersicht unter #/spiele. Ein neues Spiel kommt hierher: erst mit
 * status 'im-bau' ohne Adresse, als Platzhalter; ist es fertig, bekommt es Titel,
 * Beschreibung, Adresse und status 'spielbereit'. Platzhalter sind entfernt (Michael,
 * 2026-10-03: weitere Spiele folgen sporadisch); ein neues kann trotzdem mit «im-bau» erscheinen.
 */
export type SpielStatus = 'spielbereit' | 'im-bau'

export interface Spiel {
  id: string
  titel: string
  beschreibung: string
  status: SpielStatus
  /** nur bei spielbereiten Spielen: wohin «Spielen» führt */
  adresse?: string
}

export const SPIELE: Spiel[] = [
  {
    id: 'duell', titel: 'Duell', status: 'spielbereit', adresse: '#/duell',
    beschreibung: 'Zwei Bahnhöfe, Strecken oder Tunnel treten gegeneinander an. Du wählst, wer bei '
      + 'einer Zahl aus den Daten vorne liegt, und baust Runde um Runde deine Serie auf.',
  },
  {
    id: 'schweiz11', titel: 'Schweiz 1:1', status: 'spielbereit', adresse: '#/schweiz11',
    beschreibung: 'Wo liegt dieser Bahnhof, dieser Tunnel, diese Brücke? Setze deinen Pin auf die Karte: '
      + 'je näher, desto mehr Punkte. Allein oder zu mehreren auf einem Gerät.',
  },
]

/** Alle Bereiche, die zum Hauptreiter «Spiele» gehören: die Übersicht und jedes spielbereite
 *  Spiel (seine id ist auch sein Bereich in Kopf.tsx und App.tsx) */
export const SPIEL_BEREICHE: string[] = ['spiele', ...SPIELE.filter((s) => s.status === 'spielbereit').map((s) => s.id)]
