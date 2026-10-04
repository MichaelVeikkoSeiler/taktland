import { useEffect, useMemo, useState } from 'react'
import { uebersichtLaden } from '../daten'
import { datum, type ErlebtArt, heftLesen, heftLoeschen, schluesselVon } from '../erlebt'
import { kantonText } from '../kanton'
import type { BahnhofIndex, BrueckenEintrag, TunnelEintrag, Uebersicht, UebergangEintrag } from '../typen'
import { genau } from './Objekte'
import { Pikto } from './Pikto'
import { KurzLang } from './Sehenswert'
import { ohneKuerzel } from '../kuerzel'

type Ansicht = 'erlebt' | 'fehlt'

const ART_TEXT: Record<ErlebtArt, [string, string]> = {
  tunnel: ['Tunnel', 'Tunnel'], bruecke: ['Brücke', 'Brücken'], bahnhof: ['Bahnhof', 'Bahnhöfe'],
  bahnuebergang: ['Bahnübergang', 'Bahnübergänge'],
}
/** Wie die Unterreiter von Bahnland: Bahnhöfe, Brücken, Tunnel (Michael, 2026-09-25),
 *  dahinter die Bahnübergänge (2026-10-01) */
const REIHENFOLGE: ErlebtArt[] = ['bahnhof', 'bruecke', 'tunnel', 'bahnuebergang']
/** auf dem Handy kürzer, sonst passen vier Knöpfe nicht nebeneinander */
const KURZ: Partial<Record<ErlebtArt, string>> = { bahnuebergang: 'Übergänge' }
/** So viele Einträge stehen bei «Fehlt noch» zuerst da */
const ZUERST = 30

interface Eintrag { kennung: string; name: string; zeile: string }

/** Ausgeblendete Bahnen im Sammelheft, nur auf diesem Gerät */
const AUS_SCHLUESSEL = 'taktland.sammelheft.bahnen-aus.v1'
function ausLesen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(AUS_SCHLUESSEL) ?? '[]')) } catch { return new Set() }
}

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
  // alle Bahnen eingeblendet, einzelne lassen sich ausblenden (Michael, 2026-09-30)
  const [aus, setAus] = useState(ausLesen)
  function bahnUmschalten(b: string) {
    const neu = new Set(aus)
    if (neu.has(b)) neu.delete(b)
    else neu.add(b)
    setAus(neu)
    try { localStorage.setItem(AUS_SCHLUESSEL, JSON.stringify([...neu])) } catch { /* ohne Speicher nur jetzt */ }
  }
  const [tunnel, setTunnel] = useState<Uebersicht<TunnelEintrag> | null>(null)
  const [bruecken, setBruecken] = useState<Uebersicht<BrueckenEintrag> | null>(null)
  const [uebergaenge, setUebergaenge] = useState<Uebersicht<UebergangEintrag> | null>(null)

  useEffect(() => {
    let abgebrochen = false
    Promise.all([uebersichtLaden<TunnelEintrag>('tunnel'), uebersichtLaden<BrueckenEintrag>('bruecken')])
      .then(([t, b]) => { if (!abgebrochen) { setTunnel(t); setBruecken(b) } })
      .catch(() => {})
    uebersichtLaden<UebergangEintrag>('bahnuebergaenge')
      .then((u) => { if (!abgebrochen) setUebergaenge(u) })
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
    // nach Linie und Kilometer, wie in den Daten
    bahnuebergang: uebergaenge && mitKennung(uebergaenge)
      .map((e) => ({ kennung: e.kennung, name: e.name ? ohneKuerzel(e.name) : 'Bahnübergang ohne Namen',
                     zeile: `Linie ${e.linie}${e.sicherungsart ? ` · Sicherungsart «${e.sicherungsart}»` : ''}` })),
  }), [tunnel, bruecken, uebergaenge, index])

  // die Bahn eines Eintrags; ältere Einträge ohne Bahn: Bahnhöfe laut Index, sonst SBB
  const isb = useMemo(() => new Map((index?.bahnhoefe ?? []).map((b) => [String(b.uic), b.isb ?? 'SBB'])), [index])
  const bahnVon = (o: { art: ErlebtArt; kennung: string; bahn?: string }) =>
    o.bahn ?? (o.art === 'bahnhof' ? isb.get(o.kennung) ?? 'SBB' : 'SBB')
  const bahnen = [...new Set(['SBB', ...Object.values(heft.objekte).map(bahnVon)])]
    .sort((a, b) => (a === 'SBB' ? -1 : b === 'SBB' ? 1 : a.localeCompare(b, 'de')))
  // die Länge eines erlebten Objekts; ältere Einträge ohne: SBB-Tunnel laut Übersicht
  const tunnelLaenge = useMemo(() => new Map((tunnel ? mitKennung(tunnel) : []).map((e) => [e.kennung, e.laenge_m])), [tunnel])
  const laengeVon = (o: { art: ErlebtArt; kennung: string; laenge?: string; bahn?: string }) => {
    if (o.laenge) return o.laenge
    const m = o.art === 'tunnel' && !o.kennung.startsWith('tlm:') ? tunnelLaenge.get(o.kennung) : null
    return m != null ? `${genau(m)} m` : null
  }
  const erlebt = (a: ErlebtArt) => Object.values(heft.objekte).filter((o) => o.art === a && !aus.has(bahnVon(o)))
    .sort((x, y) => y.zeit - x.zeit)
  // «von …» zählt nur, was in der Liste dahinter steht: Tunnel und Brücken anderer Bahnen
  // (swissTLM3D, Kennung «tlm:») gehören nicht dazu
  const imSatz = (a: ErlebtArt) => erlebt(a).filter((o) => a === 'bahnhof' || !o.kennung.startsWith('tlm:')).length
  // «Fehlt noch»: Bahnhöfe aller Bahnen, Tunnel und Brücken nur die der SBB
  const fehlt = (alle[art] ?? []).filter((e) => !heft.objekte[schluesselVon(art, e.kennung)]
    && !aus.has(art === 'bahnhof' ? isb.get(e.kennung) ?? 'SBB' : 'SBB'))

  function loeschen() {
    if (!window.confirm('Alle erlebten Objekte im Sammelheft löschen? Das Logbuch bleibt. Das lässt sich nicht rückgängig machen.')) return
    heftLoeschen()
    setHeft(heftLesen())
  }

  return (
    <div className="px-4 pb-4">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Sammelheft</h1>
      <p className="mt-2 leading-relaxed">
        Was du beim Fahren durchfahren hast, und was noch fehlt. Es bleibt auf diesem Gerät; die
        Probefahrt zählt nicht. Jede Fahrt mit Datum steht im <a href="#/logbuch" className="underline underline-offset-2">Logbuch</a>.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {REIHENFOLGE.map((a) => (
          <div key={a} className="kachel px-3 py-3">
            <Pikto art={a} className="size-7" />
            <p className="mt-2 text-3xl font-bold tabular-nums">{erlebt(a).length}</p>
            <p className="text-sm text-sbb-metal dark:text-sbb-storm">
              {erlebt(a).length === 1 ? ART_TEXT[a][0] : ART_TEXT[a][1]}
              {alle[a] && (imSatz(a) === erlebt(a).length
                ? <> von {alle[a]!.length}</>
                : <>; {imSatz(a)} von {alle[a]!.length} der SBB</>)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        «von»: alle Bahnhöfe in Taktland und alle Brücken, Tunnel und Bahnübergänge der SBB in Taktland. Tunnel und
        Brücken anderer Bahnen stammen aus swissTLM3D von swisstopo, meist ohne Namen. Ihre Länge ist
        die ihrer Zeichnung, gerundet, ebenso bei vielen SBB-Brücken; SBB-Tunnel mit der Länge laut SBB.
      </p>
      {bahnen.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Bahnen">
          {bahnen.map((b) => (
            <button key={b} type="button" aria-pressed={!aus.has(b)} onClick={() => bahnUmschalten(b)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${aus.has(b)
                      ? 'border-sbb-cloud bg-white text-sbb-metal line-through dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-storm'
                      : 'border-sbb-anthracite bg-sbb-anthracite text-white dark:border-sbb-white dark:bg-sbb-white dark:text-sbb-black'}`}>
              {b}
            </button>
          ))}
        </div>
      )}

      <div className="segmente mt-6 grid grid-cols-2" role="group" aria-label="Ansicht">
        {([['erlebt', 'Erlebt'], ['fehlt', 'Fehlt noch']] as const).map(([a, t]) => (
          <button key={a} type="button" aria-pressed={ansicht === a} onClick={() => { setAnsicht(a); setMehr(false) }} className="segment px-3 py-1.5 text-sm">
            {t}
          </button>
        ))}
      </div>

      {(
        <>
          <div className="segmente mt-4 grid grid-cols-4" role="group" aria-label="Art">
            {REIHENFOLGE.map((a) => (
              <button key={a} type="button" aria-pressed={art === a} onClick={() => { setArt(a); setMehr(false) }}
                      className="segment flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-1.5 text-xs sm:flex-row sm:gap-2 sm:px-2 sm:text-sm">
                <Pikto art={a} className="size-5" />
                <span className="max-w-full truncate"><KurzLang kurz={KURZ[a] ?? ART_TEXT[a][1]} lang={ART_TEXT[a][1]} /></span>
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
                    <span className="flex min-w-0 items-center gap-2">
                      {/* das Pikto als Sticker: erlebt in Farbe (Michael, 2026-09-27) */}
                      <Pikto art={o.art} className="size-6 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{o.name}</span>
                        {/* Bahn und Länge darunter, sonst verdrängen sie auf dem Handy den Namen */}
                        {(bahnVon(o) !== 'SBB' || laengeVon(o)) && (
                          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
                            {[bahnVon(o) !== 'SBB' ? bahnVon(o) : null, laengeVon(o)].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
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
                  ? 'Die mit den meisten Baueinheiten zuerst.' : art === 'bahnuebergang'
                    ? 'Nach Linie und Kilometer, wie in den Daten.' : 'Die mit den meisten Ein- und Aussteigenden zuerst.'}
              </p>
              <ul className="mt-2 kachelliste">
                {fehlt.slice(0, mehr ? fehlt.length : ZUERST).map((e) => (
                  <li key={e.kennung} className="flex items-center gap-2 px-3 py-2">
                    {/* noch nicht erlebt: das Pikto blass */}
                    <Pikto art={art} className="size-6 opacity-25" />
                    <span className="min-w-0">
                      <span className="block font-medium">{e.name}</span>
                      <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{e.zeile}</span>
                    </span>
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
                className="rounded-lg border border-sbb-cloud px-4 py-2 text-sm font-medium hover:border-sbb-red
                           hover:text-sbb-red dark:border-sbb-iron">
          Sammelheft löschen
        </button>
        <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
          Löscht alle erlebten Objekte auf diesem Gerät. Das Logbuch, die Favoriten und die gemerkten
          Fahrten bleiben.
        </p>
      </div>
    </div>
  )
}
