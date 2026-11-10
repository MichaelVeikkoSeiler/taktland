/**
 * Zu zweit (oder mehr) im selben Modell der Virtuellen Schweiz (Michael, 2026-11-10: Vorschlag 13, «Dann bauen wenn ich schlafe»): über die Vermittlung
 * auf spiel.taktland.ch (server/spiel/raum.php, Aktionen lage und lagen) schickt jedes Gerät einmal je Sekunde seine Lage (wo es im Modell ist, wohin es
 * schaut und zeigt), wer den Raum eröffnet hat dazu Feld, Schalter und Zeit; die anderen folgen. Nur diese Angaben, ohne Namen; der Raum verfällt nach
 * sechs Stunden ohne Lage.
 */
import { useEffect, useRef, useState } from 'react'
import { eigeneId } from './spielraum'

const ADRESSE = import.meta.env.VITE_SPIEL_URL ?? 'https://spiel.taktland.ch/raum.php'
/** so oft wird gesendet und abgeholt (die Vermittlung ist ein einfaches Webhosting; gewählt) */
const TAKT_MS = 1000

/** ein Punkt in LV95 und Meter über Meer */
export type Punkt = [number, number, number]
/** was der Führende dazu schickt: die Felder je Stufe (Mitte und Seite in Metern), die Stufe, die Wahl, die Schalter, die Zeit */
export interface Stand {
  stufe: string
  felder: Record<string, { e: number; n: number; seite: number }>
  wahl: { e: number; n: number; seite: number } | null
  schalter: Record<string, boolean>
  /** null: jetzt; sonst die Zeit der Szene in ms */
  zeit: number | null
}
export interface Lage { kopf: Punkt; blick: Punkt; zeigt: Punkt | null; brille: boolean; fuehrt: boolean; stand?: Stand
  /** seit wann dieses Gerät führt (ms); führen zwei, gilt das spätere */
  seit?: number }
export interface Andere extends Lage { id: string; alter: number }

async function anfrage(a: string, raum: string, koerper?: unknown) {
  const r = await fetch(`${ADRESSE}?a=${a}&raum=${raum}`, koerper === undefined ? { cache: 'no-store' }
    : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(koerper) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(r.status === 404 ? 'Diesen Raum gibt es nicht (mehr).' : r.status === 409 ? 'Der Raum ist voll.' : `Die Vermittlung antwortet nicht wie erwartet (${r.status}).`)
  return j
}

/** Rundet die Zahlen, damit die Lage klein bleibt */
const rund = (p: Punkt | null) => (p ? p.map((v) => Math.round(v * 10) / 10) as Punkt : null)

/**
 * Im Raum sein: jede Sekunde die eigene Lage senden (lage() liefert sie, null: noch keine) und die der anderen holen.
 */
export function useZuZweit(raum: string | null, lage: () => Lage | null) {
  const [andere, setAndere] = useState<Andere[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [verbunden, setVerbunden] = useState(true)
  const lageRef = useRef(lage)
  lageRef.current = lage
  useEffect(() => {
    if (!raum) { setAndere([]); setFehler(null); return }
    let weg = false, laeuft = false
    const ich = eigeneId()
    const takt = async () => {
      if (laeuft) return
      laeuft = true
      try {
        const l = lageRef.current()
        if (l) await anfrage('lage', raum, { von: ich, d: { ...l, kopf: rund(l.kopf), blick: rund(l.blick), zeigt: rund(l.zeigt) } })
        const j = await anfrage('lagen', raum)
        if (weg) return
        const liste = (Array.isArray(j.lagen) ? j.lagen : []) as Array<{ von: string; d: Lage; alter: number }>
        setAndere(liste.filter((x) => x.von !== ich && x.d && Array.isArray(x.d.kopf)).map((x) => ({ ...x.d, id: x.von, alter: x.alter })))
        setVerbunden(true); setFehler(null)
      } catch (e) {
        if (weg) return
        if (e instanceof Error && /Raum/.test(e.message)) setFehler(e.message)
        else setVerbunden(false)
      } finally { laeuft = false }
    }
    void takt()
    const t = setInterval(() => void takt(), TAKT_MS)
    return () => { weg = true; clearInterval(t) }
  }, [raum])
  return { andere, fehler, verbunden }
}
