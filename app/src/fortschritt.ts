/** Fortschritt liegt nur auf dem Gerät. Kein Login, kein Server, kein Tracking. */

// v2: Antworten unter der festen Kennung der Frage. v1 speicherte nach der
// Stelle («steckbrief:0») und wird beim ersten Laden verworfen.
const SCHLUESSEL = 'taktland.fortschritt.v2'
try {
  localStorage.removeItem('taktland.fortschritt.v1')
} catch {
  // gesperrter Speicher: nichts zu verwerfen
}
const DUELL_SCHLUESSEL = 'taktland.duell.v1'
/** Linien getrennt von den Bahnhöfen: sonst zählte «Antworten bei N
 *  Bahnhöfen» beim Zurücksetzen die Linien mit. */
const LINIEN_SCHLUESSEL = 'taktland.linien.v1'

export interface Antwort {
  richtig: boolean
  zeitpunkt: number
}

/** { "8503000": { "steckbrief:0": { richtig: true, zeitpunkt: … } } } */
type Speicher = Record<string, Record<string, Antwort>>

function lesen(schluessel = SCHLUESSEL): Speicher {
  try {
    return JSON.parse(localStorage.getItem(schluessel) ?? '{}') as Speicher
  } catch {
    return {}
  }
}

function schreiben(s: Speicher, schluessel = SCHLUESSEL) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(s))
  } catch {
    // Privater Modus oder voller Speicher: Fortschritt geht verloren, die App läuft weiter
  }
}

export function antwortSpeichern(uic: number, frageId: string, richtig: boolean,
                                 schluessel = SCHLUESSEL) {
  const s = lesen(schluessel)
  s[uic] = { ...(s[uic] ?? {}), [frageId]: { richtig, zeitpunkt: Date.now() } }
  schreiben(s, schluessel)
}

export function antwortenLesen(uic: number, schluessel = SCHLUESSEL): Record<string, Antwort> {
  return lesen(schluessel)[uic] ?? {}
}

export function bahnhofZuruecksetzen(uic: number, schluessel = SCHLUESSEL) {
  const s = lesen(schluessel)
  delete s[uic]
  schreiben(s, schluessel)
}

/* ---------- Linien: dieselben Funktionen, eigener Speicher ---------- */

export const linienAntwortSpeichern = (nr: number, frageId: string, richtig: boolean) =>
  antwortSpeichern(nr, frageId, richtig, LINIEN_SCHLUESSEL)
export const linienAntwortenLesen = (nr: number) => antwortenLesen(nr, LINIEN_SCHLUESSEL)
export const linieZuruecksetzen = (nr: number) => bahnhofZuruecksetzen(nr, LINIEN_SCHLUESSEL)
export const bearbeiteteLinien = () => Object.keys(lesen(LINIEN_SCHLUESSEL)).map(Number)

/**
 * Löscht alles, was der Nutzer erarbeitet hat: beantwortete Fragen bei allen
 * Bahnhöfen und Linien und die Bestwerte im Duell. Die Kantonsauswahl bleibt - das ist
 * eine Einstellung und kein Ergebnis.
 *
 * Die Schlüssel stehen hier ausgeschrieben, damit ein neuer Speicherort nicht
 * stillschweigend vom Zurücksetzen ausgenommen bleibt.
 */
export function allesZuruecksetzen() {
  for (const schluessel of [SCHLUESSEL, DUELL_SCHLUESSEL, LINIEN_SCHLUESSEL]) {
    try {
      localStorage.removeItem(schluessel)
    } catch {
      // Privater Modus oder gesperrter Speicher: es gab ohnehin nichts zu löschen
    }
  }
}

export function bearbeiteBahnhoefe(): number[] {
  return Object.keys(lesen()).map(Number)
}

/* ---------- Bestleistung im Duell ---------- */

export interface Duellstand {
  /** Bestwert je Auswahl: bei den Bahnhöfen 'CH' für die ganze Schweiz, sonst
   *  das Kantonskürzel; 'TUNNEL' und 'TUNNEL:UR' bei den Tunneln, 'LINIEN'.
   *  Getrennt, weil ein Duell innerhalb eines kleinen Kantons nicht dieselbe
   *  Aufgabe ist wie eines über alle 771 Bahnhöfe. */
  rekorde: Record<string, number>
  gespielt: number
  richtig: number
}

const LEER: Duellstand = { rekorde: {}, gespielt: 0, richtig: 0 }

export function duellstandLesen(): Duellstand {
  try {
    const roh = JSON.parse(localStorage.getItem(DUELL_SCHLUESSEL) ?? '{}')
    return { ...LEER, ...roh, rekorde: { ...(roh.rekorde ?? {}) } }
  } catch {
    return { ...LEER, rekorde: {} }
  }
}

export function duellstandMerken(auswahl: string, richtig: boolean, serie: number) {
  const s = duellstandLesen()
  const neu: Duellstand = {
    rekorde: { ...s.rekorde, [auswahl]: Math.max(s.rekorde[auswahl] ?? 0, serie) },
    gespielt: s.gespielt + 1,
    richtig: s.richtig + (richtig ? 1 : 0),
  }
  try {
    localStorage.setItem(DUELL_SCHLUESSEL, JSON.stringify(neu))
  } catch {
    // Privater Modus: die Bestleistung geht verloren, das Spiel läuft weiter
  }
  return neu
}

const AUSWAHL_SCHLUESSEL = 'taktland.duell.auswahl'

export function auswahlLesen(): string {
  try {
    return localStorage.getItem(AUSWAHL_SCHLUESSEL) ?? 'CH'
  } catch {
    return 'CH'
  }
}

export function auswahlMerken(auswahl: string) {
  try {
    localStorage.setItem(AUSWAHL_SCHLUESSEL, auswahl)
  } catch {
    // ohne Speicher beginnt das Duell eben wieder bei der ganzen Schweiz
  }
}
