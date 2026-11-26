/**
 * Fahrzeuge für den Bahnbetrieb im Gleisbau (Michael, 2026-11-25: «Diverse fiktive Loks und Wagen stehen bereit. Vor allem beim Gütertransport»):
 * fiktive Loks mit Namen, Tempo, Zugkraft und Antrieb, Wagen je Gut. Keine echten Baureihen, alle Namen, Zahlen und Preise gewählt
 */

/** die Güter: jedes passt nur auf seinen Wagen */
export type Gut = 'holz' | 'kies' | 'oel' | 'milch' | 'container' | 'autos' | 'stueckgut'
export const GUETER: Record<Gut, { name: string; mehrzahl: string; farbe: string }> = {
  holz: { name: 'Holz', mehrzahl: 'Ladungen Holz', farbe: '#a0703f' },
  kies: { name: 'Kies', mehrzahl: 'Ladungen Kies', farbe: '#9a958a' },
  oel: { name: 'Heizöl', mehrzahl: 'Ladungen Heizöl', farbe: '#2b2b2b' },
  milch: { name: 'Milch', mehrzahl: 'Ladungen Milch', farbe: '#f2f2ee' },
  container: { name: 'Container', mehrzahl: 'Container', farbe: '#2f6fb0' },
  autos: { name: 'Autos', mehrzahl: 'Ladungen Autos', farbe: '#c43c2c' },
  stueckgut: { name: 'Stückgut', mehrzahl: 'Ladungen', farbe: '#b8783f' },
}

/** die Wagen: person trägt Fahrgäste, die anderen je ein Gut (gedeckt nimmt jedes, nur im freien Bauen) */
export type WagenTyp = 'person' | 'rungen' | 'schuett' | 'kessel' | 'milch' | 'container' | 'auto' | 'gedeckt'
export interface WagenArt { name: string; preis: number; gut: Gut | null; plaetze: number; text: string }
export const WAGEN_ARTEN: Record<WagenTyp, WagenArt> = {
  person: { name: 'Personenwagen', preis: 300, gut: null, plaetze: 4, text: '4 Plätze für Fahrgäste' },
  rungen: { name: 'Rungenwagen', preis: 250, gut: 'holz', plaetze: 1, text: 'trägt 1 Ladung Holz' },
  schuett: { name: 'Schüttgutwagen', preis: 250, gut: 'kies', plaetze: 1, text: 'trägt 1 Ladung Kies' },
  kessel: { name: 'Kesselwagen', preis: 400, gut: 'oel', plaetze: 1, text: 'trägt 1 Ladung Heizöl' },
  milch: { name: 'Milchwagen', preis: 350, gut: 'milch', plaetze: 1, text: 'trägt 1 Ladung Milch' },
  container: { name: 'Containerwagen', preis: 300, gut: 'container', plaetze: 1, text: 'trägt 1 Container' },
  auto: { name: 'Autotransporter', preis: 450, gut: 'autos', plaetze: 1, text: 'trägt 1 Ladung Autos' },
  gedeckt: { name: 'Güterwagen', preis: 0, gut: null, plaetze: 1, text: 'trägt 1 Ladung, jedes Gut' },
}
/** ob ein Wagen dieses Gut trägt */
export const passt = (w: WagenTyp, g: Gut) => w === 'gedeckt' || WAGEN_ARTEN[w].gut === g

/** die Loks: Tempo in Feldern je Sekunde, Zugkraft in Wagen */
export type LokTyp = 'murmeli' | 'libelle' | 'steinbock' | 'baer' | 'adler'
export interface LokArt { name: string; art: string; diesel: boolean; tempo: number; zugkraft: number; preis: number; farbe: string; text: string }
export const LOKS: Record<LokTyp, LokArt> = {
  murmeli: { name: 'Murmeli', art: 'Rangierlok', diesel: true, tempo: 1.0, zugkraft: 3, preis: 800, farbe: '#e0a21c', text: 'Klein und zäh, fährt auch ohne Fahrleitung' },
  libelle: { name: 'Libelle', art: 'Regionallok', diesel: false, tempo: 1.6, zugkraft: 4, preis: 1200, farbe: '#a8102e', text: 'Flink im Regionalverkehr' },
  steinbock: { name: 'Steinbock', art: 'Güterlok', diesel: false, tempo: 1.3, zugkraft: 8, preis: 2500, farbe: '#2f6b5e', text: 'Stark, für lange Güterzüge' },
  baer: { name: 'Bär', art: 'Güterlok', diesel: true, tempo: 1.1, zugkraft: 7, preis: 2200, farbe: '#8a3b26', text: 'Zieht schwere Züge auch ohne Fahrleitung' },
  adler: { name: 'Adler', art: 'Schnellzuglok', diesel: false, tempo: 2.2, zugkraft: 6, preis: 3500, farbe: '#5a6470', text: 'Die schnellste Lok im Depot' },
}

/** ein Zug: Lok und Wagen von vorne nach hinten */
export interface Zusammenstellung { lok: LokTyp; wagen: WagenTyp[] }
