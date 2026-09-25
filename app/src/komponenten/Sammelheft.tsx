import { useEffect, useMemo, useState } from 'react'
import { uebersichtLaden } from '../daten'
import { datum, type ErlebtArt, heftLesen, heftLoeschen, schluesselVon } from '../erlebt'
import { kantonText } from '../kanton'
import type { BahnhofIndex, BrueckenEintrag, TunnelEintrag, Uebersicht } from '../typen'
import { genau } from './Objekte'

type Ansicht = 'erlebt' | 'fehlt'

const ART_TEXT: Record<ErlebtArt, [string, string]> = {
  tunnel: ['Tunnel', 'Tunnel'], bruecke: ['Brücke', 'Brücken'], bahnhof: ['Bahnhof', 'Bahnhöfe'],
}
/** Wie die Unterreiter von Bahnland: Bahnhöfe, Brücken, Tunnel (Michael, 2026-09-25) */
const REIHENFOLGE: ErlebtArt[] = ['bahnhof', 'bruecke', 'tunnel']
/** So viele Einträge stehen bei «Fehlt noch» zuerst da */
const ZUERST = 30

interface Eintrag { kennung: string; name: string; zeile: string }

/** Die Einträge einer Übersicht mit ihrer Kennung «Linie:Stelle», wie im Fahrtmodus */
function mitKennung<T>(u: Uebersicht<T>) {
  const zaehler = new Map<number, number>()
  return u.eintraege.map((e) => {
    const i = zaehler.get(e.linie) ?? 0
    zaehler.set(e.linie, i + 1)
    return { ...e, kennung: `${e.linie}:${i}` }
  })
}

/**
 * Das Sammelheft: was im Fahrtmodus durchfahren wurde, die Fahrten dazu und
 * was noch fehlt. Alles bleibt auf diesem Gerät und lässt sich löschen.
 */
export function Sammelheft({ index }: { index: BahnhofIndex | null }) {
  const [heft, setHeft] = useState(heftLesen)
  const [ansicht, setAnsicht] = useState<Ansicht>('erlebt')
  const [art, setArt] = useState<ErlebtArt>('bahnhof')
  const [mehr, setMehr] = useState(false)
  const [tunnel, setTunnel] = useState<Uebersicht<TunnelEintrag> | null>(null)
  const [bruecken, setBruecken] = useState<Uebersicht<BrueckenEintrag> | null>(null)

  useEffect(() => {
    let abgebrochen = false
    Promise.all([uebersichtLaden<TunnelEintrag>('tunnel'), uebersichtLaden<BrueckenEintrag>('bruecken')])
      .then(([t, b]) => { if (!abgebrochen) { setTunnel(t); setBruecken(b) } })
      .catch(() => {})
    return () => { abgebrochen = true }
  }, [])

  // Alle Objekte jeder Art, geordnet für «Fehlt noch»: die längsten Tunnel,
  // die Brücken mit den meisten Baueinheiten, die Bahnhöfe mit den meisten
  // Ein- und Aussteigenden zuerst
  const alle = useMemo((): Record<ErlebtArt, Eintrag[] | null> => ({
    tunnel: tunnel && mitKennung(tunnel)
      .sort((a, b) => (b.laenge_m ?? -1) - (a.laenge_m ?? -1))
      .map((e) => ({ kennung: e.kennung, name: e.name,
                     zeile: `${e.laenge_m === null ? 'Länge: keine Angabe' : `${genau(e.laenge_m)} m`} · Linie ${e.linie}` })),
    bruecke: bruecken && mitKennung(bruecken)
      .sort((a, b) => (b.baueinheiten ?? -1) - (a.baueinheiten ?? -1))
      .map((e) => ({ kennung: e.kennung, name: e.name,
                     zeile: `Linie ${e.linie}${e.baueinheiten === null ? ''
                       : ` · ${e.baueinheiten} ${e.baueinheiten === 1 ? 'Baueinheit' : 'Baueinheiten'}`}` })),
    bahnhof: index && [...index.bahnhoefe]
      .sort((a, b) => (b.dwv ?? -1) - (a.dwv ?? -1))
      .map((b) => ({ kennung: String(b.uic), name: b.name, zeile: b.kanton ? kantonText(b.kanton) : '' })),
  }), [tunnel, bruecken, index])

  const erlebt = (a: ErlebtArt) => Object.values(heft.objekte).filter((o) => o.art === a)
    .sort((x, y) => y.zeit - x.zeit)
  const fehlt = (alle[art] ?? []).filter((e) => !heft.objekte[schluesselVon(art, e.kennung)])

  function loeschen() {
    if (!window.confirm('Alle erlebten Objekte im Sammelheft löschen? Das Logbuch bleibt. Das lässt sich nicht rückgängig machen.')) return
    heftLoeschen()
    setHeft(heftLesen())
  }

  const knopf = (aktiv: boolean) => `px-3 py-2 text-sm font-medium ${aktiv
    ? 'bg-sbb-anthracite text-white dark:bg-sbb-white dark:text-sbb-black'
    : 'bg-white text-sbb-black hover:bg-sbb-milk dark:bg-sbb-midnight dark:text-sbb-white'}`

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Sammelheft</h1>
      <p className="mt-2 leading-relaxed">
        Was du im Fahrtmodus durchfahren hast, und was noch fehlt. Es bleibt auf diesem Gerät; die
        Probefahrt zählt nicht. Jede Fahrt mit Datum steht im <a href="#/logbuch" className="underline underline-offset-2">Logbuch</a>.
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {REIHENFOLGE.map((a) => (
          <div key={a} className="kachel px-3 py-3">
            <p className="text-3xl font-bold tabular-nums">{erlebt(a).length}</p>
            <p className="text-sm text-sbb-metal dark:text-sbb-storm">
              {erlebt(a).length === 1 ? ART_TEXT[a][0] : ART_TEXT[a][1]}
              {alle[a] && <> von {alle[a]!.length}</>}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Gezählt von allen Bahnhöfen in Taktland und allen Brücken und Tunneln der SBB in Taktland.
      </p>

      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-lg border border-sbb-cloud dark:border-sbb-iron" role="group" aria-label="Ansicht">
        {([['erlebt', 'Erlebt'], ['fehlt', 'Fehlt noch']] as const).map(([a, t]) => (
          <button key={a} type="button" aria-pressed={ansicht === a} onClick={() => { setAnsicht(a); setMehr(false) }} className={knopf(ansicht === a)}>
            {t}
          </button>
        ))}
      </div>

      {(
        <>
          <div className="mt-4 flex gap-2">
            {REIHENFOLGE.map((a) => (
              <button key={a} type="button" aria-pressed={art === a} onClick={() => { setArt(a); setMehr(false) }}
                      className={`rounded-lg border border-sbb-cloud dark:border-sbb-iron ${knopf(art === a)}`}>
                {ART_TEXT[a][1]}
              </button>
            ))}
          </div>
          {ansicht === 'erlebt' ? (
            erlebt(art).length === 0 ? (
              <p className="mt-4 text-sbb-metal dark:text-sbb-storm">Noch keine {ART_TEXT[art][1]} erlebt.</p>
            ) : (
              <ul className="mt-4 kachelliste">
                {erlebt(art).map((o) => (
                  <li key={o.kennung} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate font-medium">
                      <span className="mr-2 text-sbb-green" aria-hidden="true">✓</span>{o.name}
                    </span>
                    <span className="shrink-0 text-sm text-sbb-metal dark:text-sbb-storm">{datum(o.zeit)}</span>
                  </li>
                ))}
              </ul>
            )
          ) : !alle[art] ? (
            <p className="mt-4 text-sbb-metal">Wird geladen …</p>
          ) : (
            <>
              <p className="mt-4 text-sm text-sbb-metal dark:text-sbb-storm">
                {art === 'tunnel' ? 'Die längsten zuerst.' : art === 'bruecke'
                  ? 'Die mit den meisten Baueinheiten zuerst.' : 'Die mit den meisten Ein- und Aussteigenden zuerst.'}
              </p>
              <ul className="mt-2 kachelliste">
                {fehlt.slice(0, mehr ? fehlt.length : ZUERST).map((e) => (
                  <li key={e.kennung} className="px-3 py-2">
                    <span className="block font-medium">{e.name}</span>
                    <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{e.zeile}</span>
                  </li>
                ))}
              </ul>
              {!mehr && fehlt.length > ZUERST && (
                <button type="button" onClick={() => setMehr(true)}
                        className="mt-2 text-sm underline underline-offset-2">
                  Alle {fehlt.length} zeigen
                </button>
              )}
            </>
          )}
        </>
      )}

      <div className="mt-10 border-t border-sbb-cloud pt-4 dark:border-sbb-iron">
        <button type="button" onClick={loeschen}
                className="border border-sbb-cloud px-4 py-2 text-sm font-medium hover:border-sbb-red
                           hover:text-sbb-red dark:border-sbb-iron">
          Sammelheft löschen
        </button>
        <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
          Löscht alle erlebten Objekte auf diesem Gerät. Das Logbuch, die Favoriten, die gemerkten und die
          letzten Fahrten bleiben.
        </p>
      </div>
    </div>
  )
}
