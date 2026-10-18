/**
 * «Wo bin ich?» (Michael, 2026-10-18): Taktland setzt dich in den Führerstand an eine zufällige Stelle einer Strecke, ohne
 * Namen. Du fährst ein Stück mit und tippst dann auf der Karte, wo du warst. Hier stehen Auswahl und Wertung, ohne
 * Oberfläche; die Wertung ist dieselbe wie bei «Geo» (schweiz11.ts).
 */
import { fahrwegBauen, type Fahrweg, geometrieLesen, lageBei, wegEnde } from './fahrt'
import type { StreckenAbschnitt, StreckenNetz } from './typen'

type Linien = ReturnType<typeof geometrieLesen>

/** So lange fährt der Zug, bevor die Karte kommt (eine Annahme fürs Spiel, nicht aus einer Quelle) */
export const FAHRT_S = 45
/** Tempo am Anfang und die Stufen am Pult, km/h */
export const TEMPO_STUFEN = [40, 60, 80, 100, 120]
export const TEMPO_ANFANG = 2
/** so lang soll der Weg einer Runde mindestens sein, und so viel Platz bleibt vor seinem Ende */
const WEG_MIN_M = 5000, WEG_MAX_M = 15000, ENDE_FREI_M = 2200
/** höchstens dieser Anteil der Fahrt im Tunnel: im Dunkeln gibt es nichts zu erkennen (keine Glücksfrage, Regel 9) */
const TUNNEL_HOECHSTENS = 0.25

export interface Runde {
  fahrweg: Fahrweg
  /** dort beginnt die Fahrt, Meter entlang des Wegs */
  abS: number
  /** Linie oder Bahn, für die Auflösung */
  linie: string | null
}

/** Die Linie am Anfang eines Abschnitts in Fahrtrichtung, als Text */
function linieVon(e: StreckenAbschnitt, vonHier: string): string | null {
  const t = e.teile ?? []
  if (!t.length) return e.linie_bav != null ? String(e.linie_bav) : null
  return String((e.von === vonHier ? t[0] : t[t.length - 1]).linie)
}

/** Grob die Länge eines Abschnitts aus der Lage seiner Enden; nur um den Weg einer Runde abzumessen */
function luftlinieM(netz: StreckenNetz, a: string, b: string) {
  const p = netz.lagen[a], q = netz.lagen[b]
  if (!p || !q) return 0
  const dLa = (q[0] - p[0]) * 111_195, dLo = (q[1] - p[1]) * 111_195 * Math.cos((p[0] * Math.PI) / 180)
  return Math.hypot(dLa, dLo)
}

/** Anteil von [von, bis] in Tunneln des Wegs */
function tunnelAnteil(fw: Fahrweg, von: number, bis: number) {
  let drin = 0
  for (const o of fw.objekte) {
    if (o.art !== 'tunnel' || o.sAus === null) continue
    drin += Math.max(0, Math.min(bis, o.sAus) - Math.max(von, o.s))
  }
  return drin / Math.max(1, bis - von)
}

/**
 * Eine Runde ziehen: ein zufälliger Abschnitt, weiter auf derselben Linie, bis der Weg WEG_MIN_M lang ist; die Fahrt
 * beginnt irgendwo darauf, mit Platz bis zum Ende. Abgelehnt wird, was ausserhalb des Spielgebiets liegt oder zu viel
 * im Tunnel fährt; dann wird neu gezogen.
 */
export function rundeZiehen(netz: StreckenNetz, linien: Linien, imGebiet: (la: number, lo: number) => boolean,
                            brueckeKm: (kennung: string) => number | undefined, zufall: () => number = Math.random): Runde | null {
  const nachbarn = new Map<string, StreckenAbschnitt[]>()
  for (const e of netz.abschnitte) {
    for (const p of [e.von, e.nach]) nachbarn.set(p, [...(nachbarn.get(p) ?? []), e])
  }
  const bahnhoefe = new Set(Object.values(netz.bahnhoefe))
  for (let versuch = 0; versuch < 60; versuch++) {
    const e0 = netz.abschnitte[Math.floor(zufall() * netz.abschnitte.length)]
    const vorwaerts = zufall() < 0.5
    const punkte = vorwaerts ? [e0.von, e0.nach] : [e0.nach, e0.von]
    const abschnitte = [e0]
    const linie = linieVon(e0, punkte[0])
    let laenge = luftlinieM(netz, punkte[0], punkte[1])
    while (laenge < WEG_MIN_M * 1.2 && abschnitte.length < 40) {
      const hier = punkte[punkte.length - 1], kam = abschnitte[abschnitte.length - 1]
      const weiter = (nachbarn.get(hier) ?? []).filter((x) => x !== kam && !punkte.includes(x.von === hier ? x.nach : x.von))
      const gleich = weiter.filter((x) => linie !== null && linieVon(x, hier) === linie)
      const naechster = gleich[0] ?? (weiter.length === 1 ? weiter[0] : null)
      if (!naechster) break
      const dort = naechster.von === hier ? naechster.nach : naechster.von
      punkte.push(dort); abschnitte.push(naechster)
      laenge += luftlinieM(netz, hier, dort)
    }
    let fw: Fahrweg
    try {
      fw = fahrwegBauen(netz, linien, punkte, abschnitte, brueckeKm, (abk) => bahnhoefe.has(abk))
    } catch { continue }
    const ende = wegEnde(fw)
    if (ende < WEG_MIN_M || ende > WEG_MAX_M * 3) continue
    const abS = 300 + zufall() * Math.max(0, ende - ENDE_FREI_M - 300)
    if (tunnelAnteil(fw, abS, abS + ENDE_FREI_M) > TUNNEL_HOECHSTENS) continue
    const [a, b] = [lageBei(fw, abS), lageBei(fw, Math.min(ende, abS + ENDE_FREI_M))]
    if (!imGebiet(a.lat, a.lon) || !imGebiet(b.lat, b.lon)) continue
    return { fahrweg: fw, abS, linie }
  }
  return null
}

/** Runden einer Partie */
export const RUNDEN = 5
