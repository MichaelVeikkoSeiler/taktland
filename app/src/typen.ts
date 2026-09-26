/** Datentypen der Profile. Sie entsprechen generator/SCHEMA.md. */

export type Stufe = 'S' | 'M' | 'L'

export type Fragetyp =
  | 'single_choice' | 'multiple_choice' | 'true_false' | 'cloze'
  | 'match' | 'sort' | 'hotspot' | 'slider'

export interface Fakt {
  label: string
  value: string | number | boolean | null
  unit?: string | null
  /** Dataset-ID bei data.sbb.ch, wird in der App angezeigt */
  source: string
  factRef: string
  /** Linienseite: der Bahnhof zu dieser Zeile, die App verlinkt ihn */
  uic?: number
  /** Linienseite: Anfang oder Ende ist dieser Bahnhof, die Kachel führt zu ihm */
  bahnhof?: number
  /** Linienseite: Die Kachel führt zur ganzen Liste, auf Wunsch gefiltert */
  liste?: ListenArt
  filter?: { feld: string; wert: string | number | null }
  /** Stelle des Eintrags in der Liste, bei einer Kachel zu einem einzelnen Objekt */
  eintrag?: number
}

export type ListenArt = 'tunnel' | 'bruecken' | 'bahnuebergaenge' | 'netz'

/** Ein Abschnitt zwischen zwei Betriebspunkten, aus dem Schienennetz des BAV */
export interface NetzEintrag {
  von: string
  bis: string
  km_von: number | null
  km_bis: number | null
  isb: string
  gleise: number
  spurweite: string
  strom: string
}

export interface TunnelEintrag {
  name: string
  laenge_m: number | null
  inbetriebnahme_jahr: number | null
  tunnelsystem: string | null
  km: number | null
  bemerkung: string | null
  /** wie in der Quelle, auch wenn es kein Kanton ist («St.AuslandGallen») */
  kanton: string | null
}

export interface BrueckenEintrag {
  name: string
  km: number | null
  baueinheiten: number | null
  kanton: string | null
}

export interface UebergangEintrag {
  name: string | null
  km: number | null
  sicherungsart: string | null
  gleise: number | null
}

export interface SortItem {
  label: string
  value: string | number
  factRef: string
}

export interface MatchPaar {
  links: string
  rechts: string
  factRef: string
}

export interface Frage {
  /** feste Kennung, unter der die App die Antwort speichert */
  id: string
  type: Fragetyp
  prompt: string
  options?: string[]
  /** sort: in der richtigen Reihenfolge, die App mischt beim Anzeigen */
  items?: SortItem[]
  /** match: Paare, die rechte Spalte wird gemischt */
  pairs?: MatchPaar[]
  /** sort: aufsteigend oder absteigend */
  richtung?: 'aufsteigend' | 'absteigend'
  correct: number | number[] | boolean | string | null
  explanation?: string
  factRef: string
  difficulty?: number
  optionen_aus_fakten?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface Kapitel {
  id: string
  title: string
  body: string
  /** Allgemeines Fachwissen ohne Bezug auf diesen Bahnhof */
  erlaeuterung?: string
  facts: Fakt[]
  questions: Frage[]
}

export interface Gleis {
  nr: string
  perronhoehen_cm: number[]
  hilfstritt: boolean
  perrontyp: string | null
  perronkante_m: number | null
  sektoren: string[]
}

export interface Luecke {
  thema: string
  grund: string
  quelle: string
}

export interface Profil {
  uic: number
  name: string
  tier: Stufe
  lang: string
  /** Jahr der Fahrgastzahlen dieses Bahnhofs */
  dataYear: number
  generated: string
  sources: string[]
  chapters: Kapitel[]
  luecken: Luecke[]
  /** Gleisdaten für das Schema, aus den Fakten übernommen */
  gleise?: Gleis[]
}

/** Linienseite: gleich aufgebaut wie ein Bahnhofsprofil, ohne Stufe */
export interface LinienProfil {
  linie: number
  name: string
  lang: string
  generated: string
  sources: string[]
  chapters: Kapitel[]
  luecken: Luecke[]
  /** alle Objekte der Linie, unverändert aus den Fakten */
  listen?: {
    tunnel?: TunnelEintrag[]
    bruecken?: BrueckenEintrag[]
    bahnuebergaenge?: UebergangEintrag[]
    netz?: NetzEintrag[]
  }
}

export interface LinienEintrag {
  linie: number
  name: string
  /** Bahnhöfe in Taktland auf dieser Linie */
  bahnhoefe: number
  /** erfasste Tunnel */
  tunnel: number
  /** erfasste Brücken */
  bruecken: number
  /** erfasste Bahnübergänge */
  bahnuebergaenge: number
  /** Datenherr laut Schienennetz des BAV, wenn nicht die SBB («BLSN», «RhB FR VR») */
  bahn?: string
  /** «schienennetz»: die Linie fehlt in den Daten der SBB */
  quelle?: 'schienennetz'
  /** Bahnhöfe, die nur das Schienennetz auf dieser Linie führt */
  weitere_bahnhoefe?: number
}

export interface LinienVerzeichnis {
  stand: string | null
  linien: LinienEintrag[]
  /** UIC des Bahnhofs → Nummern der Linien mit Seite */
  nach_bahnhof: Record<string, number[]>
  /** Brücken auf Linien ohne eigene Seite, gezählt in pipeline/build_linien.py */
  nicht_aufgefuehrt?: { bruecken: number; bahnuebergaenge: number; linien: number }
  /** Nummer → Name aus «linie», auch für Linien ohne eigene Seite */
  namen?: Record<string, string | null>
}

export interface IndexEintrag {
  uic: number
  name: string
  kanton: string | null
  tier: Stufe
  dwv: number | null
  lat: number | null
  lon: number | null
  sprachen: string[]
  /** Bahn, die die Infrastruktur betreibt, wenn nicht die SBB (BLS, SOB, BOB) */
  isb?: string
  /** Die Seite «Strecke» kennt Wege ab diesem Bahnhof */
  im_netz: boolean
  /** Alle Linien, auf denen der Bahnhof erfasst ist; fehlt, wenn die Daten zu
   *  den Linien ihn nicht führen */
  linien?: number[]
}

export interface BahnhofIndex {
  stand: string
  bahnhoefe_gesamt: number
  /** gezählt in pipeline/export_app.py, für die Startseite */
  zahlen?: { linien: number; tunnel: number; bruecken: number }
  mit_profil: number
  quelle: string
  bahnhoefe: IndexEintrag[]
}

/* ---------- Vergleich zweier Bahnhöfe ---------- */

/** «messwert»: die Grösse ist erhoben, der Vergleich gilt der Wirklichkeit.
 *  «erfasst»: verglichen wird der Datenbestand, nicht die Wirklichkeit. */
export type Vergleichsart = 'messwert' | 'erfasst'

export interface Kategorie {
  id: string
  titel: string
  frage: string
  frage_mehrere: string
  einheit: string
  /** bei einem Wert von 1: «1 Brücke», nicht «1 Brücken» */
  einheit_einzahl?: string
  art: Vergleichsart
  quelle: string
  hinweis?: string
  min_abstand: number
  min_anteil: number
  /** «tiefster»: vorn liegt der kleinere Wert, etwa das frühere Jahr */
  richtung?: 'hoechster' | 'tiefster'
  /** «jahr»: ohne Tausenderzeichen anzeigen (1882, nicht 1'882) */
  format?: 'jahr'
}

export interface VergleichsBahnhof {
  uic: number
  name: string
  kanton: string | null
  werte: Record<string, number>
}

export interface VergleichsTunnel {
  /** «Linie:Stelle» in data/linien/{nr}.json */
  id: string
  name: string
  linie: number
  bemerkung?: string | null
  /** Kantonskürzel laut Quelle; leer, wenn der Eintrag kein Kanton ist */
  kantone?: string[]
  werte: Record<string, number>
}

/** Eine Linie mit eigener Seite und ihren erfassten Beständen */
export interface VergleichsLinie {
  linie: number
  name: string
  werte: Record<string, number>
}

export interface Vergleichsdaten {
  datenstand: string
  hinweis: string
  kategorien: Kategorie[]
  bahnhoefe: VergleichsBahnhof[]
  tunnel_kategorien?: Kategorie[]
  tunnel?: VergleichsTunnel[]
  tunnel_datenstand?: string | null
  linien_datenstand?: string | null
  linien_kategorien?: Kategorie[]
  linien?: VergleichsLinie[]
}

/** Die Übersichten «Tunnel» und «Brücken» (pipeline/export_app.py): jeder
 *  Eintrag wie in den Fakten seiner Linie, dazu die Nummer der Linie. */
export interface Uebersicht<T> {
  stand: string
  quelle: string
  eintraege: Array<T & { linie: number }>
  /** Nummer → Name der Linie (null, wenn die Quelle keinen führt) und ob sie
   *  in Taktland eine eigene Seite hat */
  linien: Record<string, { name: string | null; seite: boolean }>
  /** nur bei den Brücken: so viele liegen auf Linien ohne eigene Seite */
  ohne_seite?: number
}

/** Ein Stück eines Abschnitts auf einer Linie der SBB, mit den Tunneln und
 *  Brücken zwischen seinen Kilometern («Linie:Stelle» in den Linienfakten) */
export interface StreckenTeil {
  linie: number
  km_von: number
  km_bis: number
  tunnel: string[]
  bruecken: string[]
}

/** Ein Abschnitt mit Personenzügen laut zugzahlen. Ohne teile: keine
 *  Tunnel- und Brückendaten (andere Bahn oder keine Linie zugeordnet). */
export interface StreckenAbschnitt {
  von: string
  nach: string
  /** nur für die Wegsuche, keine Angabe */
  gewicht: number
  isb: string
  teile?: StreckenTeil[]
  /** ohne teile: die Linie laut Schienennetz des BAV, wenn genau eine beide Enden führt */
  linie_bav?: number
}

/** Das Netz für die Seite «Strecke» (pipeline/build_strecken.py) */
export interface StreckenNetz {
  datenstand: string
  zugzahlen_jahr: number
  quellen: string[]
  /** Kürzel des Betriebspunkts → Name */
  punkte: Record<string, string>
  /** UIC des Bahnhofs → Kürzel des Betriebspunkts */
  bahnhoefe: Record<string, string>
  nicht_im_netz: number[]
  abschnitte: StreckenAbschnitt[]
  /** Kürzel → [Breite, Länge] */
  lagen: Record<string, [number, number]>
  /** Tunnel «Linie:Stelle» → [km von, km bis]; gleich, wenn die Richtung
   *  der Länge unbekannt ist */
  tunnel_bereiche: Record<string, [number, number]>
}

/** Lage der Linien für den Fahrtmodus: je Linie der erste Punkt [Meter,
 *  Breite, Länge] als ganze Zahlen (Grad mal 100000), dann Differenzen */
export interface StreckenGeometrie {
  datenstand: string
  quelle: string
  linien: Record<string, { start: [number, number, number]; d: number[] }>
}

/** Die kleine Karte zu den Tunneln (pipeline/build_karte.py): das Streckennetz,
 *  je Linie in Stücken, kodiert wie StreckenGeometrie */
/** Die Seen für die Karten (data/seen.json), aus Swiss Map Vector 1000 von
 *  swisstopo. Ringe als [Breite, Länge] mal 100000 mit Differenzen; der erste
 *  Ring ist das Ufer, weitere sind Inseln. */
export interface SeenDaten {
  quelle: string
  lizenz: string
  geladen: string
  hinweis: string
  seen: Array<{
    ringe: Array<{ start: [number, number]; d: number[] }>
    name?: string
    namenspunkt?: [number, number]
  }>
}

export interface KartenDaten {
  datenstand: string
  quellen: string[]
  linien: Record<string, Array<{ start: [number, number, number]; d: number[] }>>
  /** Tunnel «Linie:Stelle» → [km von, km bis]; gleich bei unbekannter Richtung */
  tunnel: Record<string, [number, number]>
  orte: Array<{ name: string; lage: [number, number] }>
}

/** Lage aus den Quellen für die Seite «Standort» (data/standort.json):
 *  Linie, Stelle in der Liste der Linie, Name, Breite, Länge */
export type StandortZeile = [number, number, string | null, number | null, number | null]

export interface StandortDaten {
  /** Tag des Abrufs je Quelle */
  datenstand: Record<string, string>
  hinweis: string
  /** Nummer → [Name aus «linie» oder null, hat eine eigene Seite] */
  linien: Record<string, [string | null, boolean]>
  tunnel: StandortZeile[]
  bruecken: StandortZeile[]
  bahnuebergaenge: StandortZeile[]
}
