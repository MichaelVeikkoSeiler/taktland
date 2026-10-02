/**
 * Die Spiele von Taktland (Michael, 2026-10-02: Hauptreiter «Spiele» statt «Duell»).
 * Eine Liste für die Übersicht unter #/spiele. Ein neues Spiel kommt hierher: erst mit
 * status 'im-bau' ohne Adresse, als Platzhalter; ist es fertig, bekommt es Titel,
 * Beschreibung, Adresse und status 'spielbereit'. Welche Spiele dazukommen, ist offen.
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
    beschreibung: 'Zwei Bahnhöfe, Linien oder Tunnel treten gegeneinander an. Du wählst, wer bei '
      + 'einer Zahl aus den Daten vorne liegt, und baust Runde um Runde deine Serie auf.',
  },
  // Platzhalter, noch ohne Namen und Inhalt
  { id: 'neu-1', titel: 'Neues Spiel', status: 'im-bau', beschreibung: 'Weitere Spiele für Taktland sind in Vorbereitung.' },
  { id: 'neu-2', titel: 'Neues Spiel', status: 'im-bau', beschreibung: 'Weitere Spiele für Taktland sind in Vorbereitung.' },
  { id: 'neu-3', titel: 'Neues Spiel', status: 'im-bau', beschreibung: 'Weitere Spiele für Taktland sind in Vorbereitung.' },
]

/** Alle Bereiche, die zum Hauptreiter «Spiele» gehören: die Übersicht und jedes spielbereite
 *  Spiel (seine id ist auch sein Bereich in Kopf.tsx und App.tsx) */
export const SPIEL_BEREICHE: string[] = ['spiele', ...SPIELE.filter((s) => s.status === 'spielbereit').map((s) => s.id)]
