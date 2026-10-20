/**
 * Sonnenstand für «3D Schweiz» (Michael, 2026-10-21: «Sonnen und Schattenzeiten einbauen. Realistisch»): Höhe über dem Horizont
 * und Richtung der Sonne an einem Ort zu einer Zeit, nach den Näherungsformeln des Astronomical Almanac (wie die NOAA sie
 * verwendet), auf etwa ein Zehntelgrad genau; ohne die Brechung der Luft nahe am Horizont. Gerechnet, nicht aus einer Quelle.
 */

/** Höhe in Grad über dem Horizont (negativ: darunter) und Richtung in Grad von Norden über Osten */
export interface Sonnenstand { hoehe: number; richtung: number }

const RAD = Math.PI / 180

export function sonnenstand(zeit: Date, la: number, lo: number): Sonnenstand {
  const n = zeit.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545.0
  const L = (280.46 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const eps = (23.439 - 0.0000004 * n) * RAD
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const dek = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24
  const ha = (gmst * 15 + lo) * RAD - ra
  const phi = la * RAD
  const hoehe = Math.asin(Math.sin(phi) * Math.sin(dek) + Math.cos(phi) * Math.cos(dek) * Math.cos(ha))
  const richtung = Math.atan2(-Math.sin(ha), Math.tan(dek) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha))
  return { hoehe: hoehe / RAD, richtung: ((richtung / RAD) % 360 + 360) % 360 }
}

/** Abstand der Zeit in Zürich zur Weltzeit an einem Tag, in Minuten (Sommerzeit 120, sonst 60) */
function zuerichVersatz(utc: number) {
  const teil = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Zurich', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(utc)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1'
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(teil)
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : 60
}

/** Datum (JJJJ-MM-TT) und Minuten nach Mitternacht als Schweizer Zeit → Zeitpunkt */
export function schweizerZeit(datum: string, minuten: number): Date {
  const [j, mo, t] = datum.split('-').map(Number)
  const ohne = Date.UTC(j, mo - 1, t, 0, minuten)
  return new Date(ohne - zuerichVersatz(ohne - 60 * 60_000) * 60_000)
}

/** heute und jetzt als Schweizer Datum und Minuten */
export function jetztInDerSchweiz(): { datum: string; minuten: number } {
  const teile = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]))
  return { datum: `${teile.year}-${teile.month}-${teile.day}`, minuten: Number(teile.hour) * 60 + Number(teile.minute) }
}

const HIMMEL = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten']
export const himmelsrichtung = (grad: number) => HIMMEL[Math.round(grad / 45) % 8]
export const uhrzeit = (minuten: number) => `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${String(minuten % 60).padStart(2, '0')}`
