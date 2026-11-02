/** Im Führerstand eines Zugs aus «3D Schweiz» mitfahren, nach dessen Fahrplan (Michael, 2026-10-31: «Wenn man von 3D-Land auf einen Zug tippt
 *  und dann in den Führerstand wechseln möchte, soll man in den Live-Zug hineinversetzt werden. Und der Zug soll auch gleich am Fahren sein.
 *  Somit kann man das Tempo … nicht variieren»). Kein Live: Die Zeiten stammen aus dem Fahrplan (GTFS), wie für die Züge in «3D Schweiz»;
 *  zwischen zwei Halten fährt der Zug gleichmässig, wie dort (eine Annahme). */

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

/** wo der Zug zur Zeit t laut Fahrplan ist und wie schnell er dort fährt (m/s) */
export function planStelle(plan: PlanHalt[], t: number): { s: number; v: number } {
  if (t <= plan[0].ab) return { s: plan[0].s, v: 0 }
  for (let i = 0; i < plan.length; i++) {
    const h = plan[i]
    if (t >= h.an && t <= h.ab) return { s: h.s, v: 0 }
    const n = plan[i + 1]
    if (!n) break
    if (t > h.ab && t < n.an) {
      const dauer = Math.max(1, n.an - h.ab)
      return { s: h.s + ((n.s - h.s) * (t - h.ab)) / dauer, v: ((n.s - h.s) * 1000) / dauer }
    }
  }
  return { s: plan[plan.length - 1].s, v: 0 }
}

/** von 3dland.ch hierher gekommen (von3d=1 in der Adresse): gemerkt, bevor die Seite «Strecke» die Adresse ersetzt */
export let von3dland = false
export function von3dlandMerken(hash: string) {
  if (new URLSearchParams(hash.split('?')[1] ?? '').get('von3d') === '1') von3dland = true
}
