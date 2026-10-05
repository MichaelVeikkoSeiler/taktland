import { useEffect, useMemo, useState } from 'react'
import type { BahnhofIndex } from '../typen'
import { aufgabenZiehen, type Einstellungen, nullGrenzeM, type Pool, schweiz11Laden, type SpielObjekt } from '../schweiz11'
import { type Antwort, Aufloesung, Ende, FrageFlaeche, Kopf, useFrage } from './Schweiz11'
import { type Mitspieler, type RaumSpiel, type RaumStand, useRaumSeite, Warten } from './Raum'
import { antwortTon } from '../audio'

/**
 * «Geo» auf mehreren Geräten (Michael, 2026-10-05): Der Gastgeber eröffnet einen Raum und zeigt
 * den QR-Code, die anderen scannen ihn und geben ihren Namen ein. Alle bekommen dieselben
 * Aufgaben; jede spielt auf dem eigenen Gerät, die Auflösung kommt, wenn alle getippt haben.
 * Der Stand entsteht auf jedem Gerät aus derselben Liste von Ereignissen (spielraum.ts, Raum.tsx).
 */

interface Start { e: Einstellungen; ids: string[]; d0: number; spieler: Mitspieler[] }
type Stand = RaumStand<Start, Antwort>

const SPIEL: RaumSpiel<Start> = {
  start: (d) => {
    const st = d as Start | null
    return st && Array.isArray(st.ids) && Array.isArray(st.spieler) ? st : null
  },
  spieler: (s) => s.spieler,
  fragen: (s) => s.ids.length,
  max: 12,
}

/** Die Seite #/schweiz11/mit/CODE: beitreten, Warteraum, Spiel */
export function Schweiz11Online({ raum, index }: { raum: string; index: BahnhofIndex | null }) {
  const [pool, setPool] = useState<Pool | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  useEffect(() => { schweiz11Laden().then(setPool).catch((e: Error) => setLadefehler(e.message)) }, [])
  const r = useRaumSeite<Start, Antwort>({
    raum, spiel: SPIEL, titel: 'Geo auf mehreren Geräten', zurueck: { hash: '#/schweiz11', text: 'Geo' },
    spielName: 'Geo', adresseSpiel: 'schweiz11', laden: { fehler: ladefehler, fertig: !!pool && !!index },
    neuerStart: (dabei) => {
      const e = einstellungenGastgeber()
      return pool && e ? neuerStart(pool, e, dabei) : null
    },
  })
  if (r.vorspiel) return r.vorspiel
  const spiel = r.stand.start!
  const aufgaben = spiel.ids.map((id) => pool!.objekte.find((o) => o.id === id))
  if (aufgaben.some((a) => !a)) {
    return r.rahmen(<p className="mt-6">Auf diesem Gerät fehlen Aufgaben dieses Spiels. Lade Taktland neu, damit alle Geräte dieselbe Version haben.</p>)
  }
  return (
    <OnlineSpiel key={r.stand.partie} pool={pool!} index={index!} stand={r.stand} aufgaben={aufgaben as SpielObjekt[]} ich={r.ich}
                 gastgeber={r.gastgeber} schicken={r.schicken} verlassen={r.verlassen} />
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
        <Warten wartenAuf={spieler.filter((m) => !runde[m.id]).map((m) => m.name)} getippt={Object.keys(runde).length}
                von={spieler.length} gastgeber={gastgeber} aufloesen={() => void schicken('aufloesen', { frage })} />
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
