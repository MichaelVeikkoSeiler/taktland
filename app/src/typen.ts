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
  filter?: { feld: string; wert: string | null }
}

export type ListenArt = 'tunnel' | 'bruecken' | 'bahnuebergaenge'

export interface TunnelEintrag {
  name: string
  laenge_m: number | null
  inbetriebnahme_jahr: number | null
  tunnelsystem: string | null
  km: number | null
  bemerkung: string | null
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
}

export interface LinienVerzeichnis {
  stand: string | null
  linien: LinienEintrag[]
  /** UIC des Bahnhofs → Nummern der Linien mit Seite */
  nach_bahnhof: Record<string, number[]>
  /** Brücken auf Linien ohne eigene Seite, gezählt in pipeline/build_linien.py */
  nicht_aufgefuehrt?: { bruecken: number; bahnuebergaenge: number; linien: number }
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
}

export interface BahnhofIndex {
  stand: string
  bahnhoefe_gesamt: number
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
