import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { eigeneId, type Ereignis, raumAdresse, type Teilnahme, teilnahmeLesen, teilnahmeMerken, useRaum } from '../spielraum'
import { Zurueck } from './Zurueck'

/**
 * Was alle Spiele auf mehreren Geräten teilen (Michael, 2026-10-05, zuerst «Geo», dann
 * «Bahnhofsuche»): den Stand aus den Ereignissen, das Beitreten, den Warteraum mit QR-Code.
 * Was ein Start enthält und was ein Tipp ist, bestimmt das Spiel.
 */

export interface Mitspieler { id: string; name: string }

export interface RaumStand<S, A> {
  gastgeber: string | null
  dabei: Mitspieler[]
  start: S | null
  /** wie viele Partien schon begonnen haben; jede neue beginnt bei Frage 0 */
  partie: number
  frage: number
  tipps: Array<Record<string, A>>
  aufgeloest: Set<number>
  ende: boolean
  beendet: boolean
}

export interface RaumSpiel<S> {
  /** der Start, wenn er brauchbar ist */
  start: (d: unknown) => S | null
  spieler: (s: S) => Mitspieler[]
  fragen: (s: S) => number
  max: number
}

/** Der Stand aus den Ereignissen; was nicht passt (falsche Frage, nicht vom Gastgeber), zählt nicht */
export function raumStandAus<S, A>(ereignisse: Ereignis[], spiel: RaumSpiel<S>): RaumStand<S, A> {
  const s: RaumStand<S, A> = { gastgeber: null, dabei: [], start: null, partie: 0, frage: 0, tipps: [], aufgeloest: new Set(), ende: false, beendet: false }
  for (const x of ereignisse) {
    const d = (x.d ?? {}) as Record<string, unknown>
    if (x.typ === 'beitreten') {
      const name = String(d.name ?? '').trim().slice(0, 20)
      if (!name || s.dabei.some((m) => m.id === x.von) || s.dabei.length >= spiel.max) continue
      if (s.start && !s.ende) continue
      s.gastgeber ??= x.von
      s.dabei.push({ id: x.von, name })
    } else if (x.typ === 'start' && x.von === s.gastgeber && (!s.start || s.ende)) {
      const st = spiel.start(x.d)
      if (!st) continue
      s.start = st
      s.partie += 1
      s.frage = 0
      s.tipps = []
      s.aufgeloest = new Set()
      s.ende = false
    } else if (x.typ === 'tipp' && s.start && !s.ende) {
      const f = Number(d.frage)
      if (f !== s.frage || !spiel.spieler(s.start).some((m) => m.id === x.von) || s.aufgeloest.has(f)) continue
      s.tipps[f] ??= {}
      if (!s.tipps[f][x.von]) s.tipps[f][x.von] = d.antwort as A
    } else if (x.typ === 'aufloesen' && x.von === s.gastgeber && s.start && Number(d.frage) === s.frage) {
      s.aufgeloest.add(s.frage)
    } else if (x.typ === 'weiter' && x.von === s.gastgeber && s.start && Number(d.frage) === s.frage) {
      if (s.frage + 1 < spiel.fragen(s.start)) s.frage += 1
      else s.ende = true
    } else if (x.typ === 'beenden' && x.von === s.gastgeber) {
      s.beendet = true
    }
  }
  return s
}

/**
 * Ein Raum aus Sicht dieses Geräts: Stand, Beitreten, Senden. `vorspiel` ist, was vor dem
 * Spiel zu zeigen ist (Laden, Name, Warteraum); null heisst: das Spiel läuft und man ist dabei.
 */
export function useRaumSeite<S, A>({ raum, spiel, titel, zurueck, spielName, adresseSpiel, laden, neuerStart }: {
  raum: string
  spiel: RaumSpiel<S>
  /** Überschrift, etwa «Geo auf mehreren Geräten» */
  titel: string
  /** wohin «zurück» und «Verlassen» führen, etwa #/schweiz11 */
  zurueck: { hash: string; text: string }
  /** Name des Spiels im Warteraum, etwa «Geo» */
  spielName: string
  /** Pfad des Spiels in der Adresse des QR-Codes, etwa schweiz11 */
  adresseSpiel: string
  /** Ladefehler des Spiels oder ob es noch lädt */
  laden: { fehler: string | null; fertig: boolean }
  /** Gastgeber: was «Spiel starten» schickt; null, wenn es nicht geht */
  neuerStart: (dabei: Mitspieler[]) => S | null
}) {
  const [teilnahme, setTeilnahme] = useState<Teilnahme | null>(() => teilnahmeLesen(raum))
  const { ereignisse, fehler, verbunden, bereit, senden } = useRaum(raum)
  const stand = useMemo(() => raumStandAus<S, A>(ereignisse, spiel), [ereignisse, spiel])
  const ich = eigeneId()
  const [name, setName] = useState('')
  const [sendefehler, setSendefehler] = useState<string | null>(null)
  const geladen = bereit || fehler !== null
  // wer schon im Raum ist (Neuladen), braucht keinen Namen mehr
  const drin = stand.dabei.some((m) => m.id === ich)
  const gastgeber = stand.gastgeber === ich

  async function schicken(typ: string, d?: unknown) {
    try { setSendefehler(null); await senden(typ, d) } catch (e) { setSendefehler(e instanceof Error ? e.message : 'Senden ging nicht.') }
  }
  // der Gastgeber tritt gleich nach dem Eröffnen bei, die anderen nach der Eingabe des Namens
  const beigetreten = useRef(false)
  useEffect(() => {
    if (!teilnahme || drin || beigetreten.current || !geladen || fehler) return
    if (stand.start && !stand.ende) return
    beigetreten.current = true
    void schicken('beitreten', { name: teilnahme.name })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teilnahme, drin, geladen, fehler, stand.start, stand.ende])

  function verlassen() {
    teilnahmeMerken(null)
    window.location.hash = zurueck.hash
  }

  const rahmen = (inhalt: React.ReactNode) => (
    <div className="px-4 pb-4">
      <Zurueck onClick={verlassen} text={zurueck.text} />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{titel}</h1>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">Raum {raum}</p>
      {!verbunden && <p className="mt-3 border-l-2 border-sbb-red pl-3 text-sm">Keine Verbindung zur Vermittlung. Taktland versucht es weiter.</p>}
      {sendefehler && <p className="mt-3 border-l-2 border-sbb-red pl-3 text-sm">{sendefehler}</p>}
      {inhalt}
    </div>
  )

  let vorspiel: React.ReactNode = null
  if (laden.fehler) vorspiel = rahmen(<p className="mt-6">Das Spiel konnte nicht geladen werden. {laden.fehler}</p>)
  else if (fehler) vorspiel = rahmen(<p className="mt-6">{fehler} Frag nach einem neuen QR-Code.</p>)
  else if (!laden.fertig || !geladen) vorspiel = rahmen(<p className="mt-6 text-sbb-metal">Wird geladen …</p>)
  else if (stand.beendet) vorspiel = rahmen(<p className="mt-6">Der Gastgeber hat das Spiel beendet.</p>)
  else if (!drin && !teilnahme) {
    if (stand.start && !stand.ende) vorspiel = rahmen(<p className="mt-6">Das Spiel läuft schon. Warte bis zur nächsten Runde und scanne dann den Code nochmals.</p>)
    else if (stand.dabei.length >= spiel.max) vorspiel = rahmen(<p className="mt-6">Der Raum ist voll ({spiel.max} Spieler).</p>)
    else {
      vorspiel = rahmen(
        <form className="mt-6 max-w-sm" onSubmit={(ev) => {
          ev.preventDefault()
          const t = { raum, name: name.trim(), gastgeber: false }
          if (!t.name) return
          teilnahmeMerken(t)
          setTeilnahme(t)
        }}>
          <label className="block text-sm text-sbb-metal dark:text-sbb-storm" htmlFor="raum-name">Dein Name</label>
          <input id="raum-name" value={name} maxLength={20} autoFocus onChange={(ev) => setName(ev.target.value)}
                 className="mt-1.5 w-full rounded-lg border border-sbb-cloud bg-white px-3 py-2.5 dark:border-sbb-iron dark:bg-sbb-midnight" />
          <button type="submit" disabled={!name.trim()}
                  className="mt-4 min-h-12 w-full rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
            Beitreten
          </button>
          {stand.dabei.length > 0 && (
            <p className="mt-4 text-sm text-sbb-metal dark:text-sbb-storm">Schon dabei: {stand.dabei.map((m) => m.name).join(', ')}</p>
          )}
        </form>,
      )
    }
  } else if (!drin) vorspiel = rahmen(<p className="mt-6 text-sbb-metal">Du trittst bei …</p>)
  else if (!stand.start) {
    const st = teilnahme?.gastgeber && gastgeber ? neuerStart(stand.dabei) : null
    vorspiel = rahmen(
      <Warteraum raum={raum} adresse={raumAdresse(raum, adresseSpiel)} spielName={spielName} dabei={stand.dabei} ich={ich}
                 gastgeber={gastgeber} starten={st ? () => void schicken('start', st) : undefined} />,
    )
  } else if (!spiel.spieler(stand.start).some((m) => m.id === ich)) {
    vorspiel = rahmen(<p className="mt-6">Das Spiel läuft schon ohne dich. Warte bis zur nächsten Runde.</p>)
  }

  return { stand, ich, gastgeber, schicken, verlassen, vorspiel, rahmen }
}

/** QR-Code als Bild, ohne fremden Dienst gerechnet */
function QrCode({ text }: { text: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(text)
    q.make()
    return q.createSvgTag({ cellSize: 6, margin: 4, scalable: true })
  }, [text])
  return <div className="mx-auto w-full max-w-64 bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" role="img"
              aria-label={`QR-Code für ${text}`} dangerouslySetInnerHTML={{ __html: svg }} />
}

function Warteraum({ raum, adresse, spielName, dabei, ich, gastgeber, starten }: {
  raum: string; adresse: string; spielName: string; dabei: Mitspieler[]; ich: string; gastgeber: boolean; starten?: () => void
}) {
  const [kopiert, setKopiert] = useState(false)
  return (
    <div className="mt-6 md:grid md:grid-cols-2 md:gap-8">
      <div>
        {gastgeber ? (
          <>
            <QrCode text={adresse} />
            <p className="mt-3 text-center text-sm text-sbb-metal dark:text-sbb-storm">
              Mit der Kamera scannen. Oder auf taktland.ch unter {spielName} den Code eingeben:
            </p>
            <p className="mt-1 text-center text-3xl font-bold tracking-[0.3em]">{raum}</p>
            <button type="button" className="mx-auto mt-2 block text-sm underline underline-offset-2"
                    onClick={() => { void navigator.clipboard?.writeText(adresse).then(() => setKopiert(true)) }}>
              {kopiert ? 'Link kopiert' : 'Link kopieren'}
            </button>
          </>
        ) : (
          <p className="kachel p-4">Du bist dabei. Das Spiel beginnt, sobald {dabei[0]?.name ?? 'der Gastgeber'} startet.</p>
        )}
      </div>
      <div className="mt-6 md:mt-0">
        <p className="text-sm font-bold">Dabei ({dabei.length})</p>
        <ul className="kachelliste mt-2">
          {dabei.map((m, i) => (
            <li key={m.id} className="px-4 py-2.5">
              {m.name}{m.id === ich ? ' (du)' : ''}{i === 0 ? <span className="text-sm text-sbb-metal dark:text-sbb-storm"> · Gastgeber</span> : ''}
            </li>
          ))}
        </ul>
        {gastgeber && (
          <>
            <button type="button" disabled={!starten || dabei.length < 2} onClick={starten}
                    className="mt-4 min-h-12 w-full rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
              Spiel starten
            </button>
            {dabei.length < 2 && <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">Es braucht mindestens zwei Spieler.</p>}
          </>
        )}
      </div>
    </div>
  )
}

/** Gastgeber: Hinweis, solange noch nicht alle getippt haben, mit «auflösen» */
export function Warten({ wartenAuf, getippt, von, gastgeber, aufloesen, titel = 'Dein Tipp ist abgegeben', children }: {
  wartenAuf: string[]; getippt: number; von: number; gastgeber: boolean; aufloesen: () => void; titel?: string; children?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-6 text-center">
      <p className="text-2xl font-bold">{titel}</p>
      {children}
      <p className="mt-2 text-sbb-metal dark:text-sbb-storm">Warte auf {wartenAuf.join(', ') || 'die Vermittlung'} …</p>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">{getippt} von {von} sind fertig</p>
      {gastgeber && (
        <button type="button" onClick={aufloesen}
                className="mt-6 rounded-lg border border-sbb-cloud px-4 py-2 font-medium dark:border-sbb-iron">
          Nicht länger warten und auflösen
        </button>
      )}
    </div>
  )
}
