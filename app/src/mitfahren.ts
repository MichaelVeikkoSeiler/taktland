/** Im Führerstand eines Zugs aus «3D Schweiz» mitfahren, nach dessen Fahrplan (Michael, 2026-10-31: «Wenn man von 3D-Land auf einen Zug tippt
 *  und dann in den Führerstand wechseln möchte, soll man in den Live-Zug hineinversetzt werden. Und der Zug soll auch gleich am Fahren sein.
 *  Somit kann man das Tempo … nicht variieren»). Kein Live: Die Zeiten stammen aus dem Fahrplan (GTFS), wie für die Züge in «3D Schweiz»;
 *  zwischen zwei Halten fährt der Zug an, gleichmässig und bremst (fahrtProfil, eine Annahme). */

/** ein Halt in der Adresse: Betriebspunkt, Ankunft und Abfahrt in Sekunden ab der Zeit in der Adresse */
export interface PlanAdresse { t0: number; halte: Array<{ abk: string; an: number; ab: number }> }
/** ein Halt auf dem Weg der Fahrt: Stelle in Metern, Ankunft und Abfahrt in Millisekunden (Date.now) */
export interface PlanHalt { s: number; an: number; ab: number }

/** «t0~ABK,an,ab~ABK,an,ab»: t0 in Sekunden seit 1970, an und ab in Sekunden danach */
export function planText(p: PlanAdresse): string {
  return [Math.round(p.t0), ...p.halte.map((h) => `${h.abk},${Math.round(h.an)},${Math.round(h.ab)}`)].join('~')
}

export function planLesen(text: string | null): PlanAdresse | null {
  if (!text) return null
  const [kopf, ...rest] = text.split('~')
  const t0 = Number(kopf)
  if (!Number.isFinite(t0) || rest.length < 2) return null
  const halte: PlanAdresse['halte'] = []
  for (const r of rest) {
    const [abk, an, ab] = r.split(',')
    if (!/^[A-Z]+$/.test(abk ?? '') || !Number.isFinite(Number(an)) || !Number.isFinite(Number(ab))) return null
    halte.push({ abk, an: Number(an), ab: Number(ab) })
  }
  return { t0, halte }
}

/** die Halte auf dem Weg: der erste am Anfang, der letzte am Ende, die übrigen am Betriebspunkt des Bahnhofs (stelle); wer nicht auf dem
 *  Weg liegt oder nicht vorwärts, fällt weg, die Fahrt dazwischen wird dann zu einer */
export function planAufWeg(p: PlanAdresse, ende: number, stelle: (abk: string) => number | undefined): PlanHalt[] | null {
  const z = p.halte.length - 1, aus: PlanHalt[] = []
  p.halte.forEach((h, i) => {
    const s = i === 0 ? 0 : i === z ? ende : stelle(h.abk)
    if (s === undefined || (aus.length && s <= aus[aus.length - 1].s)) return
    aus.push({ s, an: (p.t0 + h.an) * 1000, ab: (p.t0 + h.ab) * 1000 })
  })
  return aus.length >= 2 && aus[aus.length - 1].s === ende ? aus : null
}

/** so stark fährt der Zug an und bremst er an den Halten, m/s² (gewählt, in keiner Quelle; Michael, 2026-11-07: «dass der Zug bei Haltestellen
 *  langsamer wird, stillhält und dann langsam wieder beschleunigt»); reicht die Zeit laut Fahrplan dafür nicht, stärker */
export const PLAN_BESCHLEUNIGUNG = 0.5

/** Weg und Tempo nach τ Sekunden einer Fahrt über d Meter in T Sekunden von Halt zu Halt: anfahren, gleichmässig, bremsen (Trapez), so dass
 *  der Zug genau zur Ankunft laut Fahrplan steht */
export function fahrtProfil(d: number, T: number, tau: number): { s: number; v: number } {
  if (d <= 0 || T <= 0) return { s: Math.max(0, d), v: 0 }
  // höchstens so stark beschleunigen, dass es reicht: d = v·(T − v/a); ohne Lösung ein Dreieck (a = 4d/T²)
  let a = PLAN_BESCHLEUNIGUNG
  if (a * a * T * T < 4 * a * d) a = (4 * d) / (T * T)
  const v = (a * T - Math.sqrt(Math.max(0, a * a * T * T - 4 * a * d))) / 2, tA = v / a
  const t = Math.max(0, Math.min(T, tau))
  if (t < tA) return { s: (a * t * t) / 2, v: a * t }
  if (t > T - tA) { const r = T - t; return { s: d - (a * r * r) / 2, v: a * r } }
  return { s: (a * tA * tA) / 2 + v * (t - tA), v }
}

/** wo der Zug zur Zeit t laut Fahrplan ist und wie schnell er dort fährt (m/s): an jedem Halt steht er, dazwischen fährt er an und bremst */
export function planStelle(plan: PlanHalt[], t: number): { s: number; v: number } {
  if (t <= plan[0].ab) return { s: plan[0].s, v: 0 }
  for (let i = 0; i < plan.length; i++) {
    const h = plan[i]
    if (t >= h.an && t <= h.ab) return { s: h.s, v: 0 }
    const n = plan[i + 1]
    if (!n) break
    if (t > h.ab && t < n.an) {
      const f = fahrtProfil(n.s - h.s, Math.max(1, n.an - h.ab) / 1000, (t - h.ab) / 1000)
      return { s: h.s + f.s, v: f.v }
    }
  }
  return { s: plan[plan.length - 1].s, v: 0 }
}

/** von 3dland.ch hierher gekommen (von3d=1 in der Adresse): gemerkt, bevor die Seite «Strecke» die Adresse ersetzt */
export let von3dland = false
/** in Taktland aus der Virtuellen Schweiz hierher gekommen (zurueck= in der Adresse, Michael, 2026-11-11): wohin «Zurück» führt */
export let zurueckNach: string | null = null
export function von3dlandMerken(hash: string) {
  const q = new URLSearchParams(hash.split('?')[1] ?? '')
  if (q.get('von3d') === '1') von3dland = true
  const z = q.get('zurueck')
  zurueckNach = z && z.startsWith('#/3dland?') ? z : null
}

/** wie die Virtuelle Schweiz war, als man in den Führerstand wechselte (Michael, 2026-11-11: «alle Knöpfe identisch bleiben», «aus dem selben Winkel
 *  und Entfernung Sicht auf den Zug»): der Zug, wo die Kamera zu ihm stand (im Raum des Modells, km), die Schalter, der Ton und die Stufe; nur im selben
 *  Tab, nach einem Neuladen gilt wieder die Adresse allein; bis: bis wann die Virtuelle Schweiz nach der Rückkehr den Zug sucht (performance.now) */
export interface Rueckkehr {
  fahrt: number
  versatz: [number, number, number]
  schalter: Record<string, boolean>
  stumm: boolean
  stufe: 'region' | 'ort' | 'nah'
  bis?: number
}
export let rueckkehr: Rueckkehr | null = null
export function rueckkehrMerken(r: Rueckkehr | null) { rueckkehr = r }
