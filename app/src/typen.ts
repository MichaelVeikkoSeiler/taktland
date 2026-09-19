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
  dataYear: number
  generated: string
  sources: string[]
  chapters: Kapitel[]
  luecken: Luecke[]
  /** Gleisdaten für das Schema, aus den Fakten übernommen */
  gleise?: Gleis[]
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
