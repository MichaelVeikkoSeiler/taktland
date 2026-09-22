/**
 * Rechnung für die Seite «Standort»: Was liegt am nächsten? Alles läuft auf
 * dem Gerät; der Standort wird weder gespeichert noch gesendet. Ein Abstand
 * ist Luftlinie vom Standort zum Punkt in den Daten, kein Weg und keine
 * Angabe der Quelle.
 */
import type { Stueck } from './komponenten/Karte'
import { LAENGE_ZU_BREITE } from './komponenten/Karte'
import { listenAdresse } from './listen'
import type { BahnhofIndex, ListenArt, StandortDaten } from './typen'

export interface Lage { lat: number; lon: number }

/** Meter je Grad Breite; je Grad Länge hängt es von der Breite ab */
const M_BREITE = 111_320

function meterJeGradLaenge(lat: number) {
  return M_BREITE * Math.cos((lat * Math.PI) / 180)
}

export function abstandM(von: Lage, lat: number, lon: number) {
  return Math.hypot((lat - von.lat) * M_BREITE, (lon - von.lon) * meterJeGradLaenge(von.lat))
}

export type UmgebungsArt = 'bahnhoefe' | 'linien' | 'tunnel' | 'bruecken' | 'bahnuebergaenge'

export interface Treffer {
  schluessel: string
  name: string
  /** zweite Zeile: Linie oder Name der Linie */
  zusatz: string | null
  m: number
  /** wohin ein Tipp führt; null, wenn es dort keine Seite gibt */
  adresse: string | null
  isb?: string
  /** Breite und Länge aus den Daten, für die Karte */
  lage?: [number, number]
}

const nachAbstand = (a: Treffer, b: Treffer) => a.m - b.m

/** Die Bahnhöfe mit Lage, die nächsten zuerst */
export function bahnhoefeBei(von: Lage, index: BahnhofIndex): Treffer[] {
  return index.bahnhoefe
    .filter((b) => b.lat !== null && b.lon !== null)
    .map((b) => ({
      schluessel: `b${b.uic}`, name: b.name, zusatz: null,
      m: abstandM(von, b.lat as number, b.lon as number),
      adresse: b.sprachen.length ? `#/bahnhof/${b.uic}` : null,
      isb: b.isb,
      lage: [b.lat as number, b.lon as number] as [number, number],
    }))
    .sort(nachAbstand)
}

/** Tunnel, Brücken oder Bahnübergänge mit Lage, die nächsten zuerst */
export function objekteBei(von: Lage, daten: StandortDaten, art: ListenArt): Treffer[] {
  return daten[art]
    .filter(([, , , la, lo]) => la !== null && lo !== null)
    .map(([linie, stelle, name, la, lo]) => ({
      schluessel: `${art}${linie}:${stelle}`,
      name: name ?? 'Ohne Namen in den Daten',
      zusatz: `Linie ${linie}`,
      m: abstandM(von, la as number, lo as number),
      adresse: daten.linien[String(linie)]?.[1] ? listenAdresse(linie, art, null, stelle) : null,
    }))
    .sort(nachAbstand)
}

/** Abstand eines Punkts (in Metern, Ursprung) zur Strecke a–b */
function zurStrecke(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/**
 * Die Linien, die nächsten zuerst: Abstand zur Linienführung der Karte
 * (karte.json, auf 30 m vereinfacht), also auf etwa 30 m genau.
 */
export function linienBei(von: Lage, linien: Map<number, Stueck[]>, daten: StandortDaten): Treffer[] {
  const mx = meterJeGradLaenge(von.lat)
  const raus: Treffer[] = []
  for (const [nr, stuecke] of linien) {
    let m = Infinity
    for (const s of stuecke) {
      let px = (s.x[0] / LAENGE_ZU_BREITE - von.lon) * mx
      let py = (-s.y[0] - von.lat) * M_BREITE
      if (s.x.length === 1) m = Math.min(m, Math.hypot(px, py))
      for (let i = 1; i < s.x.length; i++) {
        const qx = (s.x[i] / LAENGE_ZU_BREITE - von.lon) * mx
        const qy = (-s.y[i] - von.lat) * M_BREITE
        m = Math.min(m, zurStrecke(px, py, qx, qy))
        px = qx; py = qy
      }
    }
    const [name, seite] = daten.linien[String(nr)] ?? [null, false]
    raus.push({
      schluessel: `l${nr}`, name: `Linie ${nr}`, zusatz: name ?? 'Name nicht erfasst', m,
      adresse: seite ? `#/linie/${nr}` : null,
    })
  }
  return raus.sort(nachAbstand)
}

/** «unter 10 m», «350 m», «1.2 km», «23 km» */
export function abstandText(m: number) {
  if (m < 10) return 'unter 10 m'
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  if (m < 9950) return `${(Math.round(m / 100) / 10).toLocaleString('de-CH')} km`
  return `${Math.round(m / 1000).toLocaleString('de-CH')} km`
}

/**
 * Was tun, wenn der Standort gesperrt ist. Auch als installierte App läuft
 * Taktland im Browser, mit dem es installiert wurde; dort liegt die Freigabe.
 * Auf dem Galaxy war das nicht zu erraten («ich habe keinen Browser offen»).
 */
export function freigabeHilfe(folge: string) {
  const ua = navigator.userAgent
  const beginn = `Der Standort ist nicht freigegeben, ${folge}. `
  if (/Android/i.test(ua)) {
    const samsung = /SamsungBrowser/i.test(ua)
    return beginn + 'Auch als installierte App läuft Taktland im Browser '
      + (samsung ? '«Samsung Internet»: dort unter ☰ → Einstellungen → Website-Berechtigungen → '
                 + 'Standort die Seite zulassen. '
                 : '«Chrome»: Symbol von Taktland gedrückt halten → App-Info → Berechtigungen oder '
                 + 'weitere Einstellungen → Standort → zulassen. Oder in Chrome unter ⋮ → '
                 + 'Einstellungen → Website-Einstellungen → Standort die Seite zulassen. ')
      + 'In den Android-Einstellungen unter Apps muss der Browser zudem den genauen Standort '
      + 'nutzen dürfen. Danach Taktland ganz schliessen und neu öffnen.'
  }
  if (/iPhone|iPad/i.test(ua)) {
    return beginn + 'Auf dem iPhone: Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → '
      + 'Safari-Websites → «Beim Verwenden der App» und «Genauer Standort». Danach Taktland ganz '
      + 'schliessen und neu öffnen.'
  }
  return beginn + 'Die Freigabe lässt sich in den Website-Einstellungen des Browsers erteilen.'
}

