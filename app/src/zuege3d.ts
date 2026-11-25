/**
 * Züge laut Fahrplan für «3D Schweiz», seit 2026-10-28 auch in Taktland (Michael, 2026-10-28: «Bitte diese Sachen auch für Taktland»), zuerst nur für 3dland.ch (Michael, 2026-10-26: «gehen wir mal die Züge an. Aber NUR für
 * 3DLand»). Die Daten baut pipeline/build_zuege3d.py in den Workflows von 3dland.ch und Taktland (pages.yml) und legt sie neben die Seite (zuege3d/); je
 * 10-km-Kachel die Fahrten, deren Weg sie berührt. Hier steht, wo ein Zug zu einer Zeit laut Fahrplan ist: an einem Halt
 * zwischen Ankunft und Abfahrt, sonst zwischen zwei Halten. Zwischen zwei Halten fährt er gleichmässig auf dem kürzesten
 * Weg im Netz, eine Annahme: Anfahren, Bremsen und der wirkliche Weg stehen in keiner unserer Quellen.
 */
import { geometrieLaden, holen, streckenLaden } from './daten'
import { type Fahrweg, fahrwegBauen, geometrieLesen, lageBei, type Punkt, wegEnde } from './fahrt'
import type { Echtzeit } from './echtzeit'
import { fahrtProfil } from './mitfahren'
import type { StreckenNetz } from './typen'
import { type Nachbarn, wegSuchen } from './wegsuche'

export interface ZugIndex {
  quelle: string; datei: string; stand: string; von: string; bis: string; kachel_m: number; hinweis: string
  tage: string[]; kacheln: string[]
  /** Werte je Halt: 3 (Betriebspunkt, Ankunft, Abfahrt), seit 2026-10-26 4 mit dem Gleis */
  je_halt?: number
}

export interface ZugFahrt {
  id: number; nummer: string; gattung: string; linie: string; ziel: string
  /** Verkehrstage, Bit 0 = index.von */
  tage: number
  /** die Halte: Betriebspunkt, Ankunft und Abfahrt in Minuten ab Mitternacht des Verkehrstags (null am Anfang und Ende) */
  halte: Array<{ abk: string; an: number | null; ab: number | null; gleis: string | null }>
  /** Echtzeit je Verkehrstag (Tag ab index.von), wo gemeldet (echtzeit.ts) */
  echt?: Map<number, Echtzeit>
  /** wie lange der Zug vor der ersten Abfahrt und nach der letzten Ankunft steht, wenn nicht ZUG_STEHT_MIN (fluegelFinden) */
  vorMin?: number; nachMin?: number
}

/** die Daten liegen auf 3dland.ch neben der Seite, nicht bei taktland.ch */
const adresse = (pfad: string) => new URL(`zuege3d/${pfad}`, window.location.href).href

let indexVorrat: Promise<ZugIndex | null> | null = null
export function zugIndexLaden(): Promise<ZugIndex | null> {
  indexVorrat ??= holen<ZugIndex>(adresse('index.json')).catch(() => null)
  return indexVorrat
}

type Roh = [number, string, string, string, string, number, Array<string | number | null>]

/** die Fahrten der Kacheln um ein Rechteck in LV95, je Fahrt einmal */
export async function zuegeLaden(ix: ZugIndex, e0: number, n0: number, e1: number, n1: number): Promise<ZugFahrt[]> {
  const k = ix.kachel_m, da = new Set(ix.kacheln), namen: string[] = []
  for (let ex = Math.floor(e0 / k); ex <= Math.floor(e1 / k); ex++) {
    for (let ny = Math.floor(n0 / k); ny <= Math.floor(n1 / k); ny++) if (da.has(`${ex}_${ny}`)) namen.push(`${ex}_${ny}`)
  }
  const tage = ix.tage.map((t) => parseInt(t, 16))
  const alle = new Map<number, ZugFahrt>()
  for (const liste of await Promise.all(namen.map((n) => holen<Roh[]>(adresse(`${n}.json`)).catch(() => [] as Roh[])))) {
    for (const [id, nummer, gattung, linie, ziel, t, flach] of liste) {
      if (alle.has(id)) continue
      const halte: ZugFahrt['halte'] = []
      const je = ix.je_halt ?? 3
      for (let i = 0; i + 2 < flach.length; i += je) {
        halte.push({ abk: flach[i] as string, an: flach[i + 1] as number | null, ab: flach[i + 2] as number | null,
          gleis: je >= 4 ? (flach[i + 3] as string | null) : null })
      }
      alle.set(id, { id, nummer, gattung, linie, ziel, tage: tage[t] ?? 0, halte })
    }
  }
  return [...alle.values()]
}

/** jetzt in der Schweiz: Tag ab index.von und Minuten ab Mitternacht mit Bruchteil */
/** nur in der Testfassung (VITE_S3D_TEST): so viele Minuten später als jetzt */
export const zugTest = { versatzMin: 0 }
/** die Zeit der Szene in «3D-Land» als Abstand zu jetzt (Michael, 2026-11-07: «die Züge sollen entsprechend der gewählten Zeit angezeigt werden»);
 *  0 ist jetzt, beim Verlassen von 3D-Land wieder 0 */
export const szenenZeit = { versatzMs: 0 }
export function jetztImFahrplan(ix: Pick<ZugIndex, 'von'>, zeit = new Date(Date.now() + szenenZeit.versatzMs + zugTest.versatzMin * 60_000)): { tag: number; minuten: number } {
  const teile = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(zeit).map((p) => [p.type, p.value]))
  const heute = Date.UTC(Number(teile.year), Number(teile.month) - 1, Number(teile.day))
  const [j, m, t] = ix.von.split('-').map(Number)
  const tag = Math.round((heute - Date.UTC(j, m - 1, t)) / 86_400_000)
  // mit den Millisekunden (Michael, 2026-11-10: «Leider höre ich den Zug nicht, wenn er an mir vorbeifährt»: auf ganze Sekunden sprang jeder Zug einmal je
  // Sekunde, dazwischen galt er fürs Ohr als stehend und das Zuggeräusch setzte nie ein)
  return { tag, minuten: Number(teile.hour) * 60 + Number(teile.minute) + (Number(teile.second) + zeit.getMilliseconds() / 1000) / 60 }
}

/** so lange steht ein Zug vor der ersten Abfahrt und nach der letzten Ankunft am Bahnhof (Michael, 2026-10-26: «Wenn sie halten
 *  verschwinden sie»); eine Annahme, gewählt: wie lange er dort steht, steht nicht im Fahrplan (block_id fehlt bei fast allen Zügen) */
export const ZUG_STEHT_MIN = 5
/** nennt der Fahrplan für einen Halt Ankunft und Abfahrt in derselben Minute, kommt der Zug so viele Minuten vorher an und fährt so viele
 *  danach ab (Michael, 2026-10-30: «Sonst fahren sie bei den Halten ja nur durch», dann «Realistisch wäre in solchen Fällen, wenn er 10 Sek vor
 *  Ankunft und 20 Sek nach Abfahrt abfährt»; der Fahrplan nennt nur ganze Minuten, wie lange der Zug wirklich steht, steht in keiner unserer
 *  Quellen; die Zeit geht der Fahrt davor und danach ab) */
export const ZUG_KURZHALT_VOR_MIN = 10 / 60, ZUG_KURZHALT_NACH_MIN = 20 / 60

export type ZugStelle =
  | { art: 'halt'; i: number; tag: number }
  | { art: 'fahrt'; i: number; anteil: number; tag: number; dauerS: number }

/** die Halte einer Fahrt ab dem Halt i mit Ankunft und Abfahrt in Minuten ab jetzt, so wie zugStelle sie rechnet (mit den Minuten
 *  vor der ersten Abfahrt und nach der letzten Ankunft und den kurzen Halten); null: heute nicht unterwegs */
export function zugPlan(f: ZugFahrt, tag: number, minuten: number, i0: number): Array<{ abk: string; an: number; ab: number }> | null {
  for (const [d, m] of [[tag, minuten], [tag - 1, minuten + 1440]] as const) {
    if (d < 0 || !((f.tage >> d) & 1)) continue
    const h = f.halte, z = h.length - 1
    if (f.echt?.get(d)?.ausfall) continue
    if ((h[0].ab ?? h[0].an) === null || (h[z].an ?? h[z].ab) === null) continue
    if (m < haltZeiten(f, 0, d)[0] || m > haltZeiten(f, z, d)[1]) continue
    return h.slice(i0).map((x, j) => {
      const [an, ab] = haltZeiten(f, i0 + j, d)
      return { abk: x.abk, an: an - m, ab: ab - m }
    })
  }
  return null
}

/** Ankunft und Abfahrt am Halt i in Minuten ab Mitternacht des Verkehrstags, wie die Züge sie fahren; mit dem Tag auch mit der Echtzeit, wo
 *  gemeldet (echtzeit.ts: die Verspätung je Halt, die Abfahrt nie vor der Ankunft) */
export function haltZeiten(f: ZugFahrt, i: number, tag?: number): [number, number] {
  const h = f.halte, z = h.length - 1
  const erst = h[0].ab ?? h[0].an!, letzt = h[z].an ?? h[z].ab!
  let an = h[i].an ?? h[i].ab!, ab = h[i].ab ?? h[i].an!
  if (i === 0) an = Math.min(an, erst - (f.vorMin ?? ZUG_STEHT_MIN))
  if (i === z) ab = Math.max(ab, letzt + (f.nachMin ?? ZUG_STEHT_MIN))
  if (i > 0 && i < z && an === ab) { an -= ZUG_KURZHALT_VOR_MIN; ab += ZUG_KURZHALT_NACH_MIN }
  const e = tag === undefined ? undefined : f.echt?.get(tag)
  if (e) { an += e.an[i] ?? 0; ab = Math.max(an, ab + (e.ab[i] ?? 0)) }
  return [an, ab]
}

/** die Verspätung am Halt i in Minuten laut Echtzeit, null ohne Meldung */
export function haltVerspaetung(f: ZugFahrt, i: number, tag: number, ab = false): number | null {
  const e = f.echt?.get(tag)
  if (!e || !e.gemeldet[i]) return null
  return ab ? e.ab[i] : e.an[i]
}

/** wo eine Fahrt am Tag und zur Minute laut Fahrplan ist, null: heute nicht unterwegs; auch Fahrten des Vortags nach Mitternacht */
export function zugStelle(f: ZugFahrt, tag: number, minuten: number): ZugStelle | null {
  for (const [d, m] of [[tag, minuten], [tag - 1, minuten + 1440]] as const) {
    if (d < 0 || !((f.tage >> d) & 1)) continue
    const h = f.halte, z = h.length - 1
    // fällt die Fahrt laut Echtzeit aus, fährt sie nicht
    if (f.echt?.get(d)?.ausfall) continue
    if ((h[0].ab ?? h[0].an) === null || (h[z].an ?? h[z].ab) === null) continue
    const zeiten = (i: number) => haltZeiten(f, i, d)
    if (m < zeiten(0)[0] || m > zeiten(z)[1]) continue
    for (let i = 0; i <= z; i++) {
      const [an, ab] = zeiten(i)
      if (m >= an && m <= ab) return { art: 'halt', i, tag: d }
      const weiter = h[i + 1]
      if (!weiter) break
      const dort = zeiten(i + 1)[0]
      if (m > ab && m < dort) return { art: 'fahrt', i, anteil: (m - ab) / Math.max(0.01, dort - ab), tag: d, dauerS: (dort - ab) * 60 }
    }
  }
  return null
}

/** wie weit der Zug auf einem Weg von ende Metern ist: er fährt am Halt an und bremst zum nächsten wie beim Mitfahren (fahrtProfil, 0,5 m/s²,
 *  gewählt), statt gleichmässig (Michael, 2026-11-14: «Züge fahren hart an statt zu beschleunigen») */
export function wegStelle(st: Extract<ZugStelle, { art: 'fahrt' }>, ende: number): number {
  return fahrtProfil(ende, st.dauerS, st.anteil * st.dauerS).s
}

/** Netz, Linien und Wege zwischen zwei Halten, einmal geladen und gerechnet */
/** Der Weg eines Zugs: geglättet, mit den Tunneln, deren Anfang und Ende die Daten kennen, in Metern entlang des Wegs */
export type ZugWeg = Fahrweg & { tunnel: Array<readonly [number, number]> }
export interface ZugNetz {
  netz: StreckenNetz; weg: (a: string, b: string) => ZugWeg | null
  /** die Betriebspunkte des kürzesten Wegs von a nach b im Netz, für «Mitfahren» (die Seite «Strecke» nimmt sie als weg=) */
  punkte: (a: string, b: string) => string[] | null
}

/** Glättung des Wegs für die Züge (Michael, 2026-10-29, Zürich HB: «sehr enge Kurve beim Gleiswechsel»): wo der Weg von einer Linie auf
 *  die nächste wechselt, stossen ihre Zeichnungen oft in einem Knick aneinander; alle GLATT_SCHRITT_M ein Punkt, gemittelt mit einer
 *  Glockenkurve der Breite GLATT_SIGMA_M (gewählt: ein Knick wird eine Kurve, eine gewöhnliche Kurve rückt nur wenig nach innen) */
const GLATT_SCHRITT_M = 10, GLATT_SIGMA_M = 40
function geglaettet(fw: Fahrweg): Fahrweg {
  const ende = wegEnde(fw), n = Math.max(2, Math.ceil(ende / GLATT_SCHRITT_M) + 1)
  const roh = Array.from({ length: n }, (_, i) => { const s = (i / (n - 1)) * ende; return { s, ...lageBei(fw, s) } })
  const k = Math.ceil((3 * GLATT_SIGMA_M) / GLATT_SCHRITT_M)
  const w = Array.from({ length: 2 * k + 1 }, (_, j) => Math.exp(-(((j - k) * GLATT_SCHRITT_M) ** 2) / (2 * GLATT_SIGMA_M ** 2)))
  const punkte: Punkt[] = roh.map((p, i) => {
    // die Enden bleiben, wo sie sind: das Fenster schrumpft dort auf beiden Seiten gleich
    const kk = Math.min(k, i, n - 1 - i)
    let la = 0, lo = 0, sw = 0
    for (let j = -kk; j <= kk; j++) { const q = roh[i + j], g = w[j + k]; la += q.lat * g; lo += q.lon * g; sw += g }
    return { s: p.s, lat: la / sw, lon: lo / sw }
  })
  return { ...fw, punkte }
}
let netzVorrat: Promise<ZugNetz> | null = null
export function zugNetzLaden(): Promise<ZugNetz> {
  netzVorrat ??= (async () => {
    const [netz, geo] = await Promise.all([streckenLaden(), geometrieLaden()])
    const linien = geometrieLesen(geo)
    const nachbarn: Nachbarn = new Map()
    for (const e of netz.abschnitte) {
      nachbarn.set(e.von, [...(nachbarn.get(e.von) ?? []), [e.nach, e]])
      nachbarn.set(e.nach, [...(nachbarn.get(e.nach) ?? []), [e.von, e]])
    }
    const wege = new Map<string, ZugWeg | null>()
    const weg = (a: string, b: string) => {
      const s = `${a}>${b}`
      if (!wege.has(s)) {
        const w = wegSuchen(nachbarn, a, b)
        let fw: ZugWeg | null = null
        if (w && w.abschnitte.length) {
          try {
            const roh = fahrwegBauen(netz, linien, w.punkte, w.abschnitte, () => undefined, () => false)
            // im Tunnel ist der Zug nicht zu sehen (Michael, 2026-10-29, Zürich HB: die Züge «fahren … durch ein Gebäude»: der Weg ging durch
            // den Tunnel zum Bahnhof Museumstrasse); nur Tunnel mit bekanntem Ende
            const tunnel = roh.objekte.filter((o) => o.art === 'tunnel' && o.sAus !== null)
              .map((o) => [Math.min(o.s, o.sAus!), Math.max(o.s, o.sAus!)] as const)
            fw = { ...geglaettet(roh), tunnel }
          } catch { fw = null }
        }
        wege.set(s, fw)
      }
      return wege.get(s)!
    }
    const punkte = (a: string, b: string) => wegSuchen(nachbarn, a, b)?.punkte ?? null
    return { netz, weg, punkte }
  })()
  return netzVorrat
}

/** gekoppelte Züge (Michael, 2026-11-18: «Kann es sein dass ich den Fahrplan Zug und den Live verspäteten Zug beide sehe?»): der Fahrplan führt manche
 *  Züge unter zwei Nummern mit denselben Zeiten (RJX 168 und 31168, S1 und S31 auf einem gemeinsamen Stück); meldet die Echtzeit die Verspätung nur
 *  für eine, fuhren sie auseinander. Je Fahrt und Partner die Halte, an denen beide mit derselben Ankunft und Abfahrt stehen (an Tagen, an denen beide
 *  fahren), als Paare von Indizes */
export type Kopplung = Map<number, Array<{ mit: number; halte: Map<number, number> }>>
export function kopplungFinden(fahrten: ZugFahrt[]): Kopplung {
  const je = new Map<string, Array<[ZugFahrt, number]>>()
  for (const f of fahrten) f.halte.forEach((h, i) => { if (h.ab !== null) { const s = `${h.abk}|${h.an}|${h.ab}`; (je.get(s) ?? je.set(s, []).get(s)!).push([f, i]) } })
  const paare = new Map<string, Map<number, number>>()
  for (const liste of je.values()) {
    if (liste.length < 2 || liste.length > 8) continue
    for (const [a, i] of liste) for (const [b, j] of liste) {
      if (a.id === b.id || !(a.tage & b.tage)) continue
      const s = `${a.id}|${b.id}`
      ;(paare.get(s) ?? paare.set(s, new Map()).get(s)!).set(i, j)
    }
  }
  const k: Kopplung = new Map()
  for (const [s, halte] of paare) {
    // erst ab zwei gemeinsamen Halten nacheinander: eine gleiche Abfahrt allein ist Zufall
    if (![...halte].some(([i, j]) => halte.get(i + 1) === j + 1)) continue
    const [a, b] = s.split('|').map(Number)
    ;(k.get(a) ?? k.set(a, []).get(a)!).push({ mit: b, halte })
  }
  return k
}

/**
 * geteilte und zusammengehängte Züge (Michael, 2026-11-25, Kerzers: «Ich bemerke, dass in Kerzers doppelte Züge stehen … Dabei geht es um diegleichen
 * Züge»): der Fahrplan führt einen Zug, der in einem Bahnhof geteilt oder zusammengehängt wird, als Fahrten, die dort enden, und Fahrten, die dort
 * beginnen (S5 15564 aus Bern endet in Kerzers um 17:30, 15764 nach Neuchâtel fährt um 17:31 ab Gleis 6B, 15864 nach Avenches um 17:35 ab 6A); mit
 * je ZUG_STEHT_MIN Minuten Stehen standen dort drei Züge für einen. Eine Fahrt, die an einem Bahnhof endet, und eine, die dort auf demselben Gleis
 * (die Nummer ohne Sektor) mit derselben Linie an einem gemeinsamen Tag 0 bis FLUEGEL_MIN Minuten danach beginnt, gehören zusammen: beginnt dort
 * nur aus einer Fahrt etwas (Teilen oder einfach weiter), verschwindet die ankommende bei der Ankunft und die weiterfahrenden stehen ab dann;
 * fahren mehrere zusammen weiter (Zusammenhängen), stehen die ankommenden bis zur Abfahrt und die weiterfahrende erscheint erst dann. Gewählt
 */
const FLUEGEL_MIN = 10
const gleisNr = (g: string | null) => g?.match(/\d+/)?.[0] ?? null
export function fluegelFinden(fahrten: ZugFahrt[]) {
  const enden = new Map<string, ZugFahrt[]>()
  for (const f of fahrten) {
    const h = f.halte[f.halte.length - 1], g = gleisNr(h.gleis)
    if (h.an === null || g === null || !f.linie) continue
    const k = `${h.abk}|${g}|${f.linie}`
    ;(enden.get(k) ?? enden.set(k, []).get(k)!).push(f)
  }
  const vorher = new Map<ZugFahrt, ZugFahrt[]>(), nachher = new Map<ZugFahrt, ZugFahrt[]>()
  for (const c of fahrten) {
    const h = c.halte[0], g = gleisNr(h.gleis)
    if (h.ab === null || g === null || !c.linie) continue
    for (const e of enden.get(`${h.abk}|${g}|${c.linie}`) ?? []) {
      if (e === c || !(e.tage & c.tage)) continue
      const d = h.ab - e.halte[e.halte.length - 1].an!
      if (d < 0 || d > FLUEGEL_MIN) continue
      ;(vorher.get(c) ?? vorher.set(c, []).get(c)!).push(e)
      ;(nachher.get(e) ?? nachher.set(e, []).get(e)!).push(c)
    }
  }
  for (const [c, ee] of vorher) {
    const ab = c.halte[0].ab!
    if (ee.length === 1) {
      // teilen oder weiter: die weiterfahrende steht ab der Ankunft, die ankommende verschwindet
      const e = ee[0]
      c.vorMin = ab - e.halte[e.halte.length - 1].an!
      e.nachMin = 0
    } else {
      // zusammenhängen: die ankommenden stehen bis zur Abfahrt, die weiterfahrende erscheint erst dann
      c.vorMin = 0
      for (const e of ee) if ((nachher.get(e)?.length ?? 0) === 1) e.nachMin = ab - e.halte[e.halte.length - 1].an!
    }
  }
}

/** liegt die Stelle im Stück, das mit dem Partner gekoppelt ist: am gemeinsamen Halt oder zwischen zwei gemeinsamen Halten nacheinander */
export function gekoppeltBei(halte: Map<number, number>, st: ZugStelle): boolean {
  if (st.art === 'halt') return halte.has(st.i)
  const j = halte.get(st.i)
  return j !== undefined && halte.get(st.i + 1) === j + 1
}

/** welche der unterwegs gekoppelten Fahrten wegbleiben: von zwei, die beide im gemeinsamen Stück sind, bleibt die mit Echtzeit an diesem Tag,
 *  sonst die mit der kleineren Nummer der Fahrt */
export function gekoppeltWeg(kopplung: Kopplung, unterwegs: Array<{ f: ZugFahrt; st: ZugStelle }>): Set<number> {
  const weg = new Set<number>()
  if (!kopplung.size) return weg
  const da = new Map(unterwegs.map((u) => [u.f.id, u]))
  const echt = (u: { f: ZugFahrt; st: ZugStelle }) => (u.f.echt?.get(u.st.tag)?.gemeldet.some(Boolean) ? 1 : 0)
  for (const u of unterwegs) {
    for (const p of kopplung.get(u.f.id) ?? []) {
      const v = da.get(p.mit)
      if (!v || weg.has(v.f.id) || !gekoppeltBei(p.halte, u.st)) continue
      const zurueck = kopplung.get(v.f.id)?.find((x) => x.mit === u.f.id)
      if (!zurueck || !gekoppeltBei(zurueck.halte, v.st)) continue
      // u bleibt weg, wenn v vorgeht
      if (echt(v) > echt(u) || (echt(v) === echt(u) && v.f.id < u.f.id)) { weg.add(u.f.id); break }
    }
  }
  return weg
}
