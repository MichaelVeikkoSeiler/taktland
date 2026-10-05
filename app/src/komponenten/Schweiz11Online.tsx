import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import type { BahnhofIndex } from '../typen'
import { aufgabenZiehen, type Einstellungen, nullGrenzeM, type Pool, schweiz11Laden, type SpielObjekt } from '../schweiz11'
import { eigeneId, type Ereignis, raumAdresse, teilnahmeLesen, teilnahmeMerken, useRaum } from '../spielraum'
import { type Antwort, Aufloesung, Ende, FrageFlaeche, Kopf, useFrage } from './Schweiz11'
import { Ladefehler } from './Ladefehler'
import { Zurueck } from './Zurueck'
import { antwortTon } from '../audio'

/**
 * «Geo» auf mehreren Geräten (Michael, 2026-10-05): Der Gastgeber eröffnet einen Raum und zeigt
 * den QR-Code, die anderen scannen ihn und geben ihren Namen ein. Alle bekommen dieselben
 * Aufgaben; jede spielt auf dem eigenen Gerät, die Auflösung kommt, wenn alle getippt haben.
 * Der Stand entsteht auf jedem Gerät aus derselben Liste von Ereignissen (spielraum.ts).
 */

const MAX_SPIELER = 12

interface Mitspieler { id: string; name: string }
interface Start { e: Einstellungen; ids: string[]; d0: number; spieler: Mitspieler[] }
interface Stand {
  gastgeber: string | null
  dabei: Mitspieler[]
  start: Start | null
  /** wie viele Partien schon begonnen haben; jede neue beginnt bei Frage 0 */
  partie: number
  frage: number
  tipps: Array<Record<string, Antwort>>
  aufgeloest: Set<number>
  ende: boolean
  beendet: boolean
}

/** Der Stand aus den Ereignissen; was nicht passt (falsche Frage, nicht vom Gastgeber), zählt nicht */
function standAus(ereignisse: Ereignis[]): Stand {
  const s: Stand = { gastgeber: null, dabei: [], start: null, partie: 0, frage: 0, tipps: [], aufgeloest: new Set(), ende: false, beendet: false }
  for (const x of ereignisse) {
    const d = (x.d ?? {}) as Record<string, unknown>
    if (x.typ === 'beitreten') {
      const name = String(d.name ?? '').trim().slice(0, 20)
      if (!name || s.dabei.some((m) => m.id === x.von) || s.dabei.length >= MAX_SPIELER) continue
      if (s.start && !s.ende) continue
      s.gastgeber ??= x.von
      s.dabei.push({ id: x.von, name })
    } else if (x.typ === 'start' && x.von === s.gastgeber && (!s.start || s.ende)) {
      const st = d as unknown as Start
      if (!Array.isArray(st.ids) || !Array.isArray(st.spieler)) continue
      s.start = st
      s.partie += 1
      s.frage = 0
      s.tipps = []
      s.aufgeloest = new Set()
      s.ende = false
    } else if (x.typ === 'tipp' && s.start && !s.ende) {
      const f = Number(d.frage)
      if (f !== s.frage || !s.start.spieler.some((m) => m.id === x.von) || s.aufgeloest.has(f)) continue
      s.tipps[f] ??= {}
      if (!s.tipps[f][x.von]) s.tipps[f][x.von] = d.antwort as Antwort
    } else if (x.typ === 'aufloesen' && x.von === s.gastgeber && s.start && Number(d.frage) === s.frage) {
      s.aufgeloest.add(s.frage)
    } else if (x.typ === 'weiter' && x.von === s.gastgeber && s.start && Number(d.frage) === s.frage) {
      if (s.frage + 1 < s.start.ids.length) s.frage += 1
      else s.ende = true
    } else if (x.typ === 'beenden' && x.von === s.gastgeber) {
      s.beendet = true
    }
  }
  return s
}

/** Die Seite #/schweiz11/mit/CODE: beitreten, Warteraum, Spiel */
export function Schweiz11Online({ raum, index }: { raum: string; index: BahnhofIndex | null }) {
  const [pool, setPool] = useState<Pool | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  useEffect(() => { schweiz11Laden().then(setPool).catch((e: Error) => setLadefehler(e.message)) }, [])
  const [teilnahme, setTeilnahme] = useState(() => teilnahmeLesen(raum))
  const { ereignisse, fehler, verbunden, bereit, senden } = useRaum(raum)
  const stand = useMemo(() => standAus(ereignisse), [ereignisse])
  const ich = eigeneId()
  const [name, setName] = useState('')
  const [sendefehler, setSendefehler] = useState<string | null>(null)
  const geladen = bereit || fehler !== null

  // wer schon im Raum ist (Neuladen), braucht keinen Namen mehr
  const drin = stand.dabei.some((m) => m.id === ich)
  const istGastgeber = stand.gastgeber === ich

  async function schicken(typ: string, d?: unknown) {
    try { setSendefehler(null); await senden(typ, d) } catch (e) { setSendefehler(e instanceof Error ? e.message : 'Senden ging nicht.') }
  }
  // der Gastgeber tritt gleich nach dem Eröffnen bei
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
    window.location.hash = '#/schweiz11'
  }

  const rahmen = (inhalt: React.ReactNode) => (
    <div className="px-4 pb-4">
      <Zurueck onClick={verlassen} text="Geo" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Geo auf mehreren Geräten</h1>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">Raum {raum}</p>
      {!verbunden && <p className="mt-3 border-l-2 border-sbb-red pl-3 text-sm">Keine Verbindung zur Vermittlung. Taktland versucht es weiter.</p>}
      {sendefehler && <p className="mt-3 border-l-2 border-sbb-red pl-3 text-sm">{sendefehler}</p>}
      {inhalt}
    </div>
  )

  if (ladefehler) return rahmen(<Ladefehler className="mt-6" was="Das Spiel konnte nicht geladen werden." fehler={ladefehler} />)
  if (fehler) return rahmen(<p className="mt-6">{fehler} Frag nach einem neuen QR-Code.</p>)
  if (!pool || !index || !geladen) return rahmen(<p className="mt-6 text-sbb-metal">Wird geladen …</p>)
  if (stand.beendet) return rahmen(<p className="mt-6">Der Gastgeber hat das Spiel beendet.</p>)

  // noch nicht dabei: Namen eingeben
  if (!drin && !teilnahme) {
    if (stand.start && !stand.ende) return rahmen(<p className="mt-6">Das Spiel läuft schon. Warte bis zur nächsten Runde und scanne dann den Code nochmals.</p>)
    if (stand.dabei.length >= MAX_SPIELER) return rahmen(<p className="mt-6">Der Raum ist voll ({MAX_SPIELER} Spieler).</p>)
    return rahmen(
      <form className="mt-6 max-w-sm" onSubmit={(ev) => {
        ev.preventDefault()
        const t = { raum, name: name.trim(), gastgeber: false }
        if (!t.name) return
        teilnahmeMerken(t)
        setTeilnahme(t)
      }}>
        <label className="block text-sm text-sbb-metal dark:text-sbb-storm" htmlFor="geo-name">Dein Name</label>
        <input id="geo-name" value={name} maxLength={20} autoFocus onChange={(ev) => setName(ev.target.value)}
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
  if (!drin) return rahmen(<p className="mt-6 text-sbb-metal">Du trittst bei …</p>)

  if (!stand.start) {
    const e = (teilnahme?.gastgeber ? einstellungenGastgeber() : null)
    return rahmen(
      <Warteraum raum={raum} stand={stand} ich={ich} gastgeber={istGastgeber}
                 starten={istGastgeber && e ? () => void schicken('start', neuerStart(pool, e, stand.dabei)) : undefined} />,
    )
  }
  const spiel = stand.start
  if (!spiel.spieler.some((m) => m.id === ich)) {
    return rahmen(<p className="mt-6">Das Spiel läuft schon ohne dich. Warte bis zur nächsten Runde.</p>)
  }
  const aufgaben = spiel.ids.map((id) => pool.objekte.find((o) => o.id === id))
  if (aufgaben.some((a) => !a)) {
    return rahmen(<p className="mt-6">Auf diesem Gerät fehlen Aufgaben dieses Spiels. Lade Taktland neu, damit alle Geräte dieselbe Version haben.</p>)
  }
  return (
    <OnlineSpiel key={stand.partie} pool={pool} index={index} stand={stand} aufgaben={aufgaben as SpielObjekt[]} ich={ich}
                 gastgeber={istGastgeber} schicken={schicken} verlassen={verlassen} />
  )
}

/** Was der Gastgeber vor dem Eröffnen eingestellt hat (Schweiz11.tsx merkt es sich) */
function einstellungenGastgeber(): Einstellungen | null {
  try {
    const x = JSON.parse(localStorage.getItem('taktland.schweiz11.einstellungen.v1') ?? '{}')
    return x.e ?? null
  } catch { return null }
}

function neuerStart(pool: Pool, e: Einstellungen, dabei: Mitspieler[]): Start {
  return { e, ids: aufgabenZiehen(pool, e).map((o) => o.id), d0: nullGrenzeM(pool, e.gebiet), spieler: dabei }
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

function Warteraum({ raum, stand, ich, gastgeber, starten }: {
  raum: string; stand: Stand; ich: string; gastgeber: boolean; starten?: () => void
}) {
  const adresse = raumAdresse(raum)
  const [kopiert, setKopiert] = useState(false)
  return (
    <div className="mt-6 md:grid md:grid-cols-2 md:gap-8">
      <div>
        {gastgeber ? (
          <>
            <QrCode text={adresse} />
            <p className="mt-3 text-center text-sm text-sbb-metal dark:text-sbb-storm">
              Mit der Kamera scannen. Oder auf taktland.ch unter Geo den Code eingeben:
            </p>
            <p className="mt-1 text-center text-3xl font-bold tracking-[0.3em]">{raum}</p>
            <button type="button" className="mx-auto mt-2 block text-sm underline underline-offset-2"
                    onClick={() => { void navigator.clipboard?.writeText(adresse).then(() => setKopiert(true)) }}>
              {kopiert ? 'Link kopiert' : 'Link kopieren'}
            </button>
          </>
        ) : (
          <p className="kachel p-4">Du bist dabei. Das Spiel beginnt, sobald {stand.dabei[0]?.name ?? 'der Gastgeber'} startet.</p>
        )}
      </div>
      <div className="mt-6 md:mt-0">
        <p className="text-sm font-bold">Dabei ({stand.dabei.length})</p>
        <ul className="kachelliste mt-2">
          {stand.dabei.map((m, i) => (
            <li key={m.id} className="px-4 py-2.5">
              {m.name}{m.id === ich ? ' (du)' : ''}{i === 0 ? <span className="text-sm text-sbb-metal dark:text-sbb-storm"> · Gastgeber</span> : ''}
            </li>
          ))}
        </ul>
        {gastgeber && (
          <>
            <button type="button" disabled={!starten || stand.dabei.length < 2} onClick={starten}
                    className="mt-4 min-h-12 w-full rounded-lg bg-sbb-red px-6 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
              Spiel starten
            </button>
            {stand.dabei.length < 2 && <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">Es braucht mindestens zwei Spieler.</p>}
          </>
        )}
      </div>
    </div>
  )
}

function OnlineSpiel({ pool, index, stand, aufgaben, ich, gastgeber, schicken, verlassen }: {
  pool: Pool; index: BahnhofIndex; stand: Stand; aufgaben: SpielObjekt[]; ich: string; gastgeber: boolean
  schicken: (typ: string, d?: unknown) => Promise<void>; verlassen: () => void
}) {
  const start = stand.start!
  const { e, d0, spieler } = start
  const frage = stand.frage
  const ziel = aufgaben[frage]
  const runde = stand.tipps[frage] ?? {}
  const meinTipp = runde[ich]
  const alle = spieler.every((m) => runde[m.id])
  const phase = stand.ende ? 'ende' : !meinTipp && !stand.aufgeloest.has(frage) ? 'frage'
    : alle || stand.aufgeloest.has(frage) ? 'aufloesung' : 'warten'
  // abgegeben, aber noch nicht zurück von der Vermittlung: nicht nochmals fragen
  const [gesendet, setGesendet] = useState(-1)
  const zeigeFrage = phase === 'frage' && gesendet !== frage

  const f = useFrage({ e, ziel, d0, aktiv: zeigeFrage, schluessel: String(frage), beiAbgabe: (a) => {
    setGesendet(frage)
    antwortTon(a.punkte > 0 ? 'richtig' : 'falsch')
    void schicken('tipp', { frage, antwort: a })
  } })

  const namen = spieler.map((m) => m.name)
  const antworten = useMemo(() => stand.tipps.map((r) => spieler.map((m) => r?.[m.id]
    ?? { pin: null, dM: null, punkte: 0, zeitAus: true })), [stand.tipps, spieler])
  const gastName = spieler[0]?.name ?? 'der Gastgeber'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white"
         role="dialog" aria-label="Geo auf mehreren Geräten">
      <Kopf text={phase !== 'ende' && <> · Frage {frage + 1} von {aufgaben.length} · {spieler.find((m) => m.id === ich)?.name}</>}
            rest={zeigeFrage ? f.rest : null} beendenText={gastgeber ? 'Beenden' : 'Verlassen'}
            beenden={() => {
              if (gastgeber) { if (window.confirm('Spiel für alle beenden?')) { void schicken('beenden'); verlassen() } }
              else if (window.confirm('Spiel verlassen? Die anderen spielen ohne dich weiter.')) verlassen()
            }} />
      {zeigeFrage && <FrageFlaeche pool={pool} e={e} ziel={ziel} index={index.bahnhoefe} f={f} schluessel={String(frage)} />}
      {(phase === 'warten' || (phase === 'frage' && !zeigeFrage)) && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-2xl font-bold">Dein Tipp ist abgegeben</p>
          <p className="mt-2 text-sbb-metal dark:text-sbb-storm">
            Warte auf {spieler.filter((m) => !runde[m.id]).map((m) => m.name).join(', ') || 'die Vermittlung'} …
          </p>
          <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
            {Object.keys(runde).length} von {spieler.length} haben getippt
          </p>
          {gastgeber && (
            <button type="button" onClick={() => void schicken('aufloesen', { frage })}
                    className="mt-6 rounded-lg border border-sbb-cloud px-4 py-2 font-medium dark:border-sbb-iron">
              Nicht länger warten und auflösen
            </button>
          )}
        </div>
      )}
      {phase === 'aufloesung' && (
        <Aufloesung pool={pool} e={e} ziel={ziel} index={index.bahnhoefe} spieler={namen} antworten={antworten}
                    frage={frage} d0={d0} letzte={frage + 1 === aufgaben.length}
                    weiter={gastgeber ? () => void schicken('weiter', { frage }) : undefined}
                    warten={`${gastName} geht weiter, sobald alle die Lösung gesehen haben.`} />
      )}
      {phase === 'ende' && (
        <Ende spieler={namen} antworten={antworten} bisher={undefined}
              nochmals={gastgeber ? () => void schicken('start', neuerStart(pool, e, stand.dabei)) : undefined}
              schliessen={verlassen} schliessenText="Verlassen"
              warten={gastgeber ? undefined : `${gastName} kann eine neue Runde starten.`} />
      )}
    </div>
  )
}
