import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { fahrtZiele, flaechenLaden, geometrieLaden, linienLaden, namenFuerFahrt, seenLaden, sehenswertLaden, streckenLaden, uebersichtLaden } from '../daten'
import { bahnhoefeVorziehen, gerundetM, zugLaengeM, type FahrObjekt, type Fahrweg, fahrwegBauen, geometrieLesen, lageBei, seeUferAufWeg, sehenswertAufWeg, type Ton, tonAbholen, tonWeitergeben, wegEnde } from '../fahrt'
import { favoritUmschalten, istFavorit, istProbefahrt, letzteMerken, probefahrtUmschalten } from '../fahrten'
import { durchfahren, fahrtBeginnen, heftLesen, leereFahrtenWeg, wegLinieSetzen, wegSetzen } from '../erlebt'
import { laufendBeginnen, laufendEnde, laufendHierSetzen, laufendLesen, laufendStelle } from '../laufend'
import { alphabetisch, useFavoriten } from '../favoriten'
import { nachbarnBauen, useBahnenAus } from '../bahnen'
import { type BilanzObjekt, FahrtBilanz } from './FahrtBilanz'
import { kantoneText } from '../kanton'
import { ohneKuerzel } from '../kuerzel'
import type {
  BahnhofIndex, BrueckenEintrag, IndexEintrag, LinienVerzeichnis, Luecke, StreckenAbschnitt,
  StreckenNetz, TunnelEintrag, Uebersicht, UebergangEintrag,
} from '../typen'
import { vereinfachen } from './Blaettern'
import { Fahrtmodus, type ObjektText } from './Fahrtmodus'
import { Luecken } from './Luecken'
import { FavoritKnopf, Stern } from './Stern'
import { STUFE_TEXT } from './Suche'
import { genau } from './Objekte'
import { Ladefehler } from './Ladefehler'
import { BahnenWahl } from './BahnenWahl'
import { Zurueck } from './Zurueck'
import { MODELL_HOECHSTENS_M } from '../relief'

// das Modell der Strecke für die Modellbahn, mit three.js, erst dort geladen
const ModellStrecke = lazy(() => import('./Relief').then((m) => ({ default: m.ModellStrecke })))

/** Start, Ziel und wahlweise ein Bahnhof dazwischen, als UIC */
export interface StreckenWahl {
  von: number | null
  nach: number | null
  ueber: number | null
  /** «Ohne Ziel»: der Weg als Betriebspunkte, statt gesucht (Michael, 2026-09-26) */
  weg?: string[] | null
  ohne?: boolean
}

/** #/strecke?von=8503000&nach=8505300&ueber=8505000: teilbar und mit «Zurück» erreichbar */
export function streckenAdresse(w: StreckenWahl) {
  const teile = (['von', 'nach', 'ueber'] as const).filter((k) => w[k]).map((k) => `${k}=${w[k]}`)
  if (w.weg?.length) teile.push(`weg=${w.weg.join('.')}`)
  if (w.ohne) teile.push('ohne=1')
  return teile.length ? `#/strecke?${teile.join('&')}` : '#/strecke'
}

/** Wie streckenAdresse, dazu startet die Seite den Fahrtmodus gleich selbst;
 *  «weiter» setzt die laufende Fahrt fort */
export function fahrtAdresse(w: StreckenWahl, art: boolean | 'weiter' = false) {
  return `${streckenAdresse(w)}&fahrt=${art === 'weiter' ? 'weiter' : art ? 'probe' : 'ja'}`
}

/** fahrt=ja, fahrt=probe oder fahrt=weiter in der Adresse: mit dem Fahrtmodus öffnen */
function fahrtAusAdresse(): 'ja' | 'probe' | 'weiter' | null {
  const f = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('fahrt')
  return f === 'ja' || f === 'probe' || f === 'weiter' ? f : null
}

export function wahlAusAdresse(abfrage: string | undefined): StreckenWahl {
  const p = new URLSearchParams(abfrage ?? '')
  const zahl = (k: string) => {
    const v = Number(p.get(k))
    // negativ: ein Ziel ohne Bahnhofsnummer (Iselle, siehe fahrtZiele)
    return Number.isInteger(v) && v !== 0 ? v : null
  }
  const weg = (p.get('weg') ?? '').split('.').filter((x) => /^[A-Z]+$/.test(x))
  return { von: zahl('von'), nach: zahl('nach'), ueber: zahl('ueber'), weg: weg.length >= 2 ? weg : null,
           ohne: p.get('ohne') === '1' }
}

export interface Weg {
  punkte: string[]
  abschnitte: StreckenAbschnitt[]
}

export type Nachbarn = Map<string, Array<[string, StreckenAbschnitt]>>

/**
 * Kürzester Weg nach dem Gewicht der Abschnitte (Dijkstra). Das Gewicht ist
 * die Luftlinie, bei wenig befahrenen Abschnitten erhöht; es dient nur der
 * Suche und wird nirgends angezeigt. generator/strecken.py sucht gleich.
 */
export function wegSuchen(nachbarn: Nachbarn, start: string, ziel: string): Weg | null {
  if (start === ziel) return { punkte: [start], abschnitte: [] }
  const dist = new Map<string, number>([[start, 0]])
  const vor = new Map<string, [string, StreckenAbschnitt]>()
  const haufen: Array<[number, string]> = [[0, start]]
  const tauschen = (i: number, j: number) => { [haufen[i], haufen[j]] = [haufen[j], haufen[i]] }
  const hinein = (x: [number, string]) => {
    haufen.push(x)
    let i = haufen.length - 1
    while (i > 0 && haufen[(i - 1) >> 1][0] > haufen[i][0]) { tauschen(i, (i - 1) >> 1); i = (i - 1) >> 1 }
  }
  const heraus = () => {
    const oben = haufen[0]
    const letzter = haufen.pop()!
    if (haufen.length) {
      haufen[0] = letzter
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let k = i
        if (l < haufen.length && haufen[l][0] < haufen[k][0]) k = l
        if (r < haufen.length && haufen[r][0] < haufen[k][0]) k = r
        if (k === i) break
        tauschen(i, k)
        i = k
      }
    }
    return oben
  }
  while (haufen.length) {
    const [d, u] = heraus()
    if (u === ziel) break
    if (d > (dist.get(u) ?? Infinity)) continue
    for (const [v, e] of nachbarn.get(u) ?? []) {
      const neu = d + e.gewicht
      if (neu < (dist.get(v) ?? Infinity)) {
        dist.set(v, neu)
        vor.set(v, [u, e])
        hinein([neu, v])
      }
    }
  }
  if (!dist.has(ziel)) return null
  const punkte = [ziel]
  const abschnitte: StreckenAbschnitt[] = []
  let u = ziel
  while (u !== start) {
    const [p, e] = vor.get(u)!
    abschnitte.push(e)
    punkte.push(p)
    u = p
  }
  return { punkte: punkte.reverse(), abschnitte: abschnitte.reverse() }
}

/** Tunnel und Brücken entlang des Wegs, jede nur einmal, in Wegrichtung */
function entlang(weg: Weg) {
  const tunnel: string[] = []
  const bruecken: string[] = []
  for (const e of weg.abschnitte) {
    for (const t of e.teile ?? []) {
      for (const i of t.tunnel) if (!tunnel.includes(i)) tunnel.push(i)
      for (const i of t.bruecken) if (!bruecken.includes(i)) bruecken.push(i)
    }
  }
  return { tunnel, bruecken }
}

/** Ein Betriebspunkt, oder ein Wechsel der Linie irgendwo zwischen zweien */
type Ort = { punkt: string } | { zwischen: [string, string] }

/** Ein Stück des Wegs auf derselben Linie; linie null: Abschnitte ohne Linie;
 *  bav: die Linie stammt aus dem Schienennetz des BAV, nicht aus den Daten der SBB */
interface Lauf { linie: number | null; isb: string; bav: boolean; von: Ort; bis: Ort }

/**
 * Die Linien des Wegs in Wegrichtung, aufeinanderfolgende Abschnitte derselben
 * Linie zusammengefasst. Liegt ein Abschnitt auf zwei Linien (Rothrist –
 * Olten: 450, dann 500), nennen die Daten den Punkt des Wechsels nicht; er
 * steht dann als «Wechsel zwischen» den beiden Betriebspunkten.
 */
function laeufe(weg: Weg): Lauf[] {
  const raus: Lauf[] = []
  weg.abschnitte.forEach((e, i) => {
    const [a, b] = [weg.punkte[i], weg.punkte[i + 1]]
    const linien = (e.teile ?? []).map((t) => t.linie)
    const bav = !linien.length && e.linie_bav !== undefined
    const folge = linien.length ? (e.von === a ? linien : [...linien].reverse())
      : [e.linie_bav ?? null]
    folge.forEach((nr, k) => {
      const von: Ort = k === 0 ? { punkt: a } : { zwischen: [a, b] }
      const bis: Ort = k === folge.length - 1 ? { punkt: b } : { zwischen: [a, b] }
      const letzter = raus[raus.length - 1]
      if (letzter && letzter.linie === nr && letzter.bav === bav
          && (nr !== null || letzter.isb === e.isb)) letzter.bis = bis
      else raus.push({ linie: nr, isb: e.isb, bav, von, bis })
    })
  })
  return raus
}

/** «Linie:Stelle» → Eintrag. Die Übersicht führt die Einträge je Linie in der
 *  Reihenfolge der Linienfakten, also zählt die Stelle innerhalb der Linie. */
export function nachKennung<T>(u: Uebersicht<T>) {
  const raus = new Map<string, T & { linie: number }>()
  const zaehler = new Map<number, number>()
  for (const e of u.eintraege) {
    const i = zaehler.get(e.linie) ?? 0
    zaehler.set(e.linie, i + 1)
    raus.set(`${e.linie}:${i}`, e)
  }
  return raus
}

const BEISPIELE: Array<[string, string]> = [
  ['Zürich HB', 'Lugano'], ['Basel SBB', 'Chiasso'], ['Lausanne', 'Brig'], ['Genève', 'St. Gallen'],
]

/** So viele Brücken stehen zuerst da, der Rest auf Knopfdruck */
const BRUECKEN_ZUERST = 100

/** «etwa 120 m laut Zeichnung von swisstopo»: gemessen an der Zeichnung von swissTLM3D, darum gerundet */
function laengeText(m: number) {
  return `etwa ${genau(gerundetM(m))} m laut Zeichnung von swisstopo`
}

/** modell: die Seite «Eigene Strecke» der Modellbahn (Michael, 2026-10-08): dieselbe Wahl, dann das Modell statt der Fahrt */
/** fest: eine gemerkte Probefahrt in der Modellbahn; Start, Ziel und Über stehen da, lassen sich aber nicht ändern,
 *  und das Modell steht gleich oben (Michael, 2026-10-08: «ohne Editierbarkeit … Karte weiter oben») */
export function Strecke({ index, wahl, modell = false, fest = false }: { index: BahnhofIndex | null; wahl: StreckenWahl; modell?: boolean; fest?: boolean }) {
  const adresse = (w: StreckenWahl) => (modell ? streckenAdresse(w).replace('#/strecke', '#/modellbahn/strecke') : streckenAdresse(w))
  const [netz, setNetz] = useState<StreckenNetz | null>(null)
  const [tunnel, setTunnel] = useState<Uebersicht<TunnelEintrag> | null>(null)
  const [bruecken, setBruecken] = useState<Uebersicht<BrueckenEintrag> | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [alleBruecken, setAlleBruecken] = useState(false)
  // Linien mit Seite und die Namen aller Linien; ohne sie fehlen nur die Links
  const [verzeichnis, setVerzeichnis] = useState<LinienVerzeichnis | null>(null)

  useEffect(() => {
    let abgebrochen = false
    linienLaden().then((v) => { if (!abgebrochen) setVerzeichnis(v) }).catch(() => {})
    return () => { abgebrochen = true }
  }, [])

  useEffect(() => {
    let abgebrochen = false
    Promise.all([streckenLaden(), uebersichtLaden<TunnelEintrag>('tunnel'),
                 uebersichtLaden<BrueckenEintrag>('bruecken')])
      .then(([n, t, b]) => { if (!abgebrochen) { setNetz(n); setTunnel(t); setBruecken(b) } })
      .catch((e: Error) => { if (!abgebrochen) setFehler(e.message) })
    return () => { abgebrochen = true }
  }, [])

  useEffect(() => { setAlleBruecken(false) }, [wahl.von, wahl.nach, wahl.ueber])

  const bahnhof = useMemo(() => new Map((index?.bahnhoefe ?? []).map((b) => [b.uic, b])), [index])
  // stabil, sonst setzte das Eingabefeld bei jedem Tastendruck den Text zurück
  const zielNamen = useMemo(() => namenFuerFahrt(index), [index])
  const name = useCallback((uic: number | null) => (uic ? bahnhof.get(uic)?.name ?? zielNamen.get(uic) ?? String(uic) : ''),
                           [bahnhof, zielNamen])

  // ein gegebener Weg («Ohne Ziel») gilt, wie er ist; gesucht wird nur auf den gewählten Bahnen
  const bahnenAus = useBahnenAus()
  const alleNachbarn = useMemo(() => nachbarnBauen(netz, new Set()), [netz])
  const nachbarn = useMemo(() => nachbarnBauen(netz, bahnenAus), [netz, bahnenAus])

  const ergebnis = useMemo(() => {
    if (!netz) return null
    if (wahl.weg) {
      // der Weg ist gegeben («Ohne Ziel»): je zwei Betriebspunkte ihr Abschnitt
      const abschnitte = wahl.weg.slice(1).map((b, i) =>
        alleNachbarn.get(wahl.weg![i])?.find(([x]) => x === b)?.[1])
      if (!abschnitte.every((e) => e)) return { art: 'keinWeg' as const }
      const weg = { punkte: wahl.weg, abschnitte: abschnitte as StreckenAbschnitt[] }
      return { art: 'weg' as const, weg, ...entlang(weg) }
    }
    if (!wahl.von || !wahl.nach) return null
    const nichtImNetz = [wahl.von, wahl.nach, wahl.ueber].filter(
      (u): u is number => u !== null && !netz.bahnhoefe[String(u)])
    if (nichtImNetz.length) return { art: 'fehlt' as const, bahnhoefe: nichtImNetz }
    const start = netz.bahnhoefe[String(wahl.von)]
    const ziel = netz.bahnhoefe[String(wahl.nach)]
    let weg: Weg | null
    if (wahl.ueber) {
      const ueber = netz.bahnhoefe[String(wahl.ueber)]
      const a = wegSuchen(nachbarn, start, ueber)
      const b = wegSuchen(nachbarn, ueber, ziel)
      weg = a && b ? { punkte: [...a.punkte, ...b.punkte.slice(1)],
                       abschnitte: [...a.abschnitte, ...b.abschnitte] } : null
    } else {
      weg = wegSuchen(nachbarn, start, ziel)
    }
    if (!weg) return { art: 'keinWeg' as const }
    return { art: 'weg' as const, weg, ...entlang(weg) }
  }, [netz, nachbarn, alleNachbarn, wahl.von, wahl.nach, wahl.ueber, wahl.weg?.join('.')])

  function waehlen(neu: Partial<StreckenWahl>) {
    window.location.hash = adresse({ ...wahl, ...neu })
  }

  // dazu die Ziele ohne Bahnhofsnummer (Iselle)
  const alle = useMemo(() => [...(index?.bahnhoefe ?? []), ...fahrtZiele(index).filter((b) => b.ohne_bahnhofseite)], [index])

  return (
    <div className="px-4 pb-4">
      {modell && fest ? (
        <>
          <Zurueck onClick={() => { window.location.hash = '#/modellbahn' }} text="Modellbahn" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Probefahrt als Modell</h1>
        </>
      ) : modell ? (
        <>
          <Zurueck onClick={() => { window.location.hash = '#/modellbahn' }} text="Modellbahn" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Eigene Strecke als Modell</h1>
          <p className="mt-2 leading-relaxed">
            Start und Ziel wählen: Taktland sucht einen Weg durch das Netz und baut ihn als Modell im Gelände, bis
            etwa {MODELL_HOECHSTENS_M / 1000} km.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Strecke</h1>
          <p className="mt-2 leading-relaxed">
            Start und Ziel wählen: Taktland sucht einen Weg durch das Netz und zeigt die erfassten
            Tunnel und Brücken entlang dieses Wegs.
          </p>
        </>
      )}

      {fest && (
        // nur zum Lesen: dieselben Angaben, aber keine Felder zum Ändern (Michael, 2026-10-08)
        <div className="mt-4 space-y-3">
          {([['Von', wahl.von], ['Nach', wahl.nach], ['Über', wahl.ueber]] as const).filter(([, u]) => u).map(([t, u]) => (
            <div key={t}>
              <span className="block text-xs text-sbb-metal dark:text-sbb-storm">{t}</span>
              <p className="mt-1 rounded-lg bg-sbb-milk px-4 py-3 text-lg dark:bg-sbb-charcoal">{name(u)}</p>
              <div className="mt-2"><BahnhofLinien b={u ? bahnhof.get(u) : undefined} verzeichnis={verzeichnis} /></div>
            </div>
          ))}
        </div>
      )}
      {!fest && <div className="mt-6 space-y-3">
        <BahnhofFeld bezeichnung="Von" wert={wahl.von} bahnhoefe={alle} name={name}
                     aendern={(u) => waehlen({ von: u })} />
        <BahnhofLinien b={wahl.von ? bahnhof.get(wahl.von) : undefined} verzeichnis={verzeichnis} />
        <BahnhofFeld bezeichnung="Nach" wert={wahl.nach} bahnhoefe={alle} name={name}
                     aendern={(u) => waehlen({ nach: u })} />
        <BahnhofLinien b={wahl.nach ? bahnhof.get(wahl.nach) : undefined} verzeichnis={verzeichnis} />
        <BahnhofFeld bezeichnung="Über (optional)" wert={wahl.ueber} bahnhoefe={alle} name={name}
                     aendern={(u) => waehlen({ ueber: u })} />
        <BahnhofLinien b={wahl.ueber ? bahnhof.get(wahl.ueber) : undefined} verzeichnis={verzeichnis} />
        {(wahl.von || wahl.nach) && (
          <button
            type="button" onClick={() => waehlen({ von: wahl.nach, nach: wahl.von })}
            className="text-sm text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                       dark:text-sbb-storm dark:hover:text-sbb-white"
          >
            Start und Ziel tauschen
          </button>
        )}
        {netz && <BahnenWahl netz={netz} />}
      </div>}

      {fehler && <Ladefehler className="mt-6" was="Das Netz konnte nicht geladen werden." fehler={fehler} />}
      {!netz && !fehler && <p className="mt-6 text-sbb-metal">Wird geladen …</p>}

      {netz && !ergebnis && !wahl.von && !wahl.nach && (
        <div className="mt-6 text-sm text-sbb-metal dark:text-sbb-storm">
          <p>Zum Beispiel:</p>
          <ul className="mt-1 space-y-1">
            {BEISPIELE.map(([a, b]) => {
              const va = alle.find((x) => x.name === a)
              const vb = alle.find((x) => x.name === b)
              if (!va || !vb) return null
              return (
                <li key={a + b}>
                  <a href={adresse({ von: va.uic, nach: vb.uic, ueber: null })}
                     className="underline underline-offset-2 hover:text-sbb-black dark:hover:text-sbb-white">
                    {a} → {b}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {netz && ergebnis?.art === 'fehlt' && (
        <p className="mt-6 leading-relaxed">
          {ergebnis.bahnhoefe.map(name).join(' und ')}{' '}
          {ergebnis.bahnhoefe.length > 1 ? 'liegen' : 'liegt'} nicht im Netz: Weder die Zugzahlen
          noch die aufgenommenen Strecken aus dem Schienennetz des BAV führen dort einen Abschnitt.
        </p>
      )}

      {netz && ergebnis?.art === 'keinWeg' && (
        <p className="mt-6">
          Zwischen diesen Bahnhöfen findet sich im Netz kein Weg
          {bahnenAus.size > 0 ? ' auf den gewählten Bahnen. Unter «Bahnen» lassen sich weitere zulassen.' : '.'}
        </p>
      )}

      {netz && tunnel && bruecken && ergebnis?.art === 'weg' && (
        <Ergebnis key={`${wahl.von}-${wahl.nach}-${wahl.ueber}-${wahl.weg?.join('.')}`} netz={netz} weg={ergebnis.weg} tunnelIds={ergebnis.tunnel}
                  brueckenIds={ergebnis.bruecken} tunnel={tunnel} bruecken={bruecken}
                  bahnhof={bahnhof} alleBruecken={alleBruecken} verzeichnis={verzeichnis}
                  zeigeAlle={() => setAlleBruecken(true)} wahl={wahl} modell={modell} />
      )}
    </div>
  )
}

function Ergebnis({
  netz, weg, tunnelIds, brueckenIds, tunnel, bruecken, bahnhof, alleBruecken, verzeichnis, zeigeAlle, wahl, modell,
}: {
  wahl: StreckenWahl
  modell: boolean
  netz: StreckenNetz
  weg: Weg
  tunnelIds: string[]
  brueckenIds: string[]
  tunnel: Uebersicht<TunnelEintrag>
  bruecken: Uebersicht<BrueckenEintrag>
  bahnhof: Map<number, IndexEintrag>
  alleBruecken: boolean
  verzeichnis: LinienVerzeichnis | null
  zeigeAlle: () => void
}) {
  const tunnelNach = useMemo(() => nachKennung(tunnel), [tunnel])
  const brueckenNach = useMemo(() => nachKennung(bruecken), [bruecken])
  // Bahnübergänge (Michael, 2026-10-01): erst für den Fahrtmodus gebraucht; fehlen sie, fährt er ohne
  const [uebergaenge, setUebergaenge] = useState<Uebersicht<UebergangEintrag> | null>(null)
  useEffect(() => {
    let abgebrochen = false
    uebersichtLaden<UebergangEintrag>('bahnuebergaenge').then((u) => { if (!abgebrochen) setUebergaenge(u) }).catch(() => {})
    return () => { abgebrochen = true }
  }, [])
  const uebergaengeNach = useMemo(() => (uebergaenge ? nachKennung(uebergaenge) : new Map<string, UebergangEintrag & { linie: number }>()),
                                  [uebergaenge])
  const [fahrt, setFahrt] = useState<{ fahrweg: Fahrweg; probe: boolean; piepen: Ton
                                        beginn: number | null
                                        fortsetzen: { startS: number; s: number } | null
                                        /** «Ohne Ziel»: Meter der früheren Linien derselben Fahrt */
                                        wegVorher: number
                                        /** «Ohne Ziel»: das wievielte Wegstück dieser Fahrt im Logbuch */
                                        wegTeil: number } | null>(null)
  const [bilanz, setBilanz] = useState<{ objekte: BilanzObjekt[]; probe: boolean; beginn: number | null } | null>(null)
  const [laedt, setLaedt] = useState(false)
  // Modellbahn: der fertige Weg fürs Modell
  const [modellWeg, setModellWeg] = useState<Fahrweg | null>(null)
  // während der Fahrtmodus hier läuft, fragt oben niemand «fortsetzen?»
  useEffect(() => {
    if (!fahrt || fahrt.beginn === null) return
    laufendHierSetzen(true)
    return () => laufendHierSetzen(false)
  }, [fahrt])
  const [fahrtFehler, setFahrtFehler] = useState<string | null>(null)

  // Kürzel des Betriebspunkts → UIC des Bahnhofs
  const uicVon = useMemo(() => new Map(Object.entries(netz.bahnhoefe).map(([u, abk]) => [abk, Number(u)])),
                         [netz])

  /** «etwa 120 m laut swisstopo»: Die SBB nennt keine Länge, swissTLM3D zeichnet die
   *  Brücke (Michael, 2026-09-29); gerundet, weil aus der Zeichnung gemessen */
  const brueckeLaenge = useCallback((kennung: string) => {
    const m = netz.bruecken_bereiche?.[kennung]?.[2]
    return m === undefined ? null : laengeText(m)
  }, [netz])
  const objektText = useCallback(({ kennung, art, tlm }: FahrObjekt): ObjektText | undefined => {
    // Strecken anderer Bahnen: Tunnel und Brücken aus swissTLM3D. Eine Länge nennt die
    // Quelle nicht; es gilt die Länge der Zeichnung, wie bei den SBB-Brücken (Michael,
    // 2026-09-30: Brücken, dann «Ich will» auch für Tunnel)
    if (tlm) {
      const wort = { tunnel: 'Tunnel', galerie: 'Galerie', bruecke: 'Brücke', gedeckte_bruecke: 'Gedeckte Brücke' }[tlm.art]
      const m = zugLaengeM(tlm)
      const laenge = m >= 5 ? laengeText(m) : null
      return { name: tlm.name ?? `${wort} ohne Namen`, baueinheiten: null, laenge,
               gross: tlm.gezeichnet_ab_100m ?? false,
               zeile: `${tlm.name ? `${wort} · ` : ''}${laenge ? `${laenge} · ` : ''}swissTLM3D (swisstopo)${laenge ? '' : ', ohne Länge'}` }
    }
    // Name ohne das unerklärte Kürzel der Quelle, der volle Name klein dazu
    const quelle = (n: string) => (ohneKuerzel(n) !== n ? ` · Name laut Quelle: ${n}` : '')
    const x = art === 'tunnel' ? tunnelNach.get(kennung) : undefined
    if (x) {
      return { name: ohneKuerzel(x.name), baueinheiten: null,
               zeile: `${x.laenge_m === null ? 'Länge: keine Angabe' : `${genau(x.laenge_m)} m`} · Linie ${x.linie}`
                 + quelle(x.name) }
    }
    if (art === 'bahnhof') {
      const b = bahnhof.get(uicVon.get(kennung) ?? 0)
      return b && { name: b.name, baueinheiten: null, zeile: kantoneText(b) ?? 'Bahnhof' }
    }
    if (art === 'bahnuebergang') {
      const u = uebergaengeNach.get(kennung)
      if (!u) return undefined
      return { name: u.name ? ohneKuerzel(u.name) : 'Bahnübergang ohne Namen', baueinheiten: null,
               zeile: [u.sicherungsart ? `Sicherungsart «${u.sicherungsart}»` : 'Sicherungsart: keine Angabe',
                       `Linie ${u.linie}`].join(' · ') + (u.name ? quelle(u.name) : '') }
    }
    const y = art === 'bruecke' ? brueckenNach.get(kennung) : undefined
    if (!y) return undefined
    return { name: ohneKuerzel(y.name), baueinheiten: y.baueinheiten, laenge: brueckeLaenge(kennung),
             zeile: `${brueckeLaenge(kennung) ? `${brueckeLaenge(kennung)} · ` : ''}Linie ${y.linie}${y.baueinheiten === null ? ''
               : ` · ${y.baueinheiten} ${y.baueinheiten === 1 ? 'Baueinheit' : 'Baueinheiten'}`}${quelle(y.name)}` }
  }, [tunnelNach, brueckenNach, uebergaengeNach, bahnhof, uicVon, brueckeLaenge])

  async function fahrtStarten(probe: boolean, weiter = false, alsModell = false) {
    // der Ton muss im Tipp selbst vorbereitet werden, sonst bleibt er stumm;
    // kommt der Start von der Seite «Fahrtmodus», liegt er dort schon bereit
    const piepen = tonAbholen()
    if (!probe && !weiter && !wahl.ohne && wahl.von && wahl.nach) letzteMerken({ von: wahl.von, nach: wahl.nach, ueber: wahl.ueber })
    setLaedt(true)
    setFahrtFehler(null)
    try {
      const linien = geometrieLesen(await geometrieLaden())
      // kommt die Fahrt gleich mit der Seite, sind die Bahnübergänge vielleicht noch nicht geladen
      let ue = uebergaengeNach
      if (!uebergaenge) {
        const u = await uebersichtLaden<UebergangEintrag>('bahnuebergaenge').catch(() => null)
        if (u) { setUebergaenge(u); ue = nachKennung(u) }
      }
      const fahrweg = fahrwegBauen(netz, linien, weg.punkte, weg.abschnitte,
                                   (id) => brueckenNach.get(id)?.km ?? undefined,
                                   (abk) => bahnhof.has(uicVon.get(abk) ?? 0),
                                   (id) => ue.get(id)?.km ?? undefined)
      bahnhoefeVorziehen(fahrweg, (abk) => bahnhof.get(uicVon.get(abk) ?? 0)?.perron_laengste_m)
      // Sehenswertes am Weg; fehlen die Daten, fährt der Fahrtmodus ohne
      try {
        const [s, f] = await Promise.all([sehenswertLaden(), flaechenLaden()])
        fahrweg.objekte = [...fahrweg.objekte, ...sehenswertAufWeg(fahrweg, s, f)].sort((a, b) => a.s - b.s)
      } catch { /* ohne Sehenswertes */ }
      try { fahrweg.seeUfer = seeUferAufWeg(fahrweg, await seenLaden()) } catch { /* ohne Seen */ }
      // Modellbahn: nur der Weg fürs Modell, keine Fahrt, nichts ins Logbuch
      if (alsModell) { setModellWeg(fahrweg); return }
      const titel = titelText.split(' → ')
      // fortsetzen, wenn es dieselbe Fahrt ist und der Weg gleich herauskommt
      // «Ohne Ziel»: jede neu erkannte Linie gehört zur selben Fahrt im Logbuch
      const alt = weiter || wahl.ohne ? laufendLesen() : null
      const gleich = alt !== null && (wahl.ohne ? alt.ohne === true
        : alt.von === wahl.von && alt.nach === wahl.nach && alt.ueber === wahl.ueber)
      const fortsetzen = !wahl.ohne && gleich && alt.startS !== null && alt.s !== null
        && Math.abs(alt.laenge - wegEnde(fahrweg)) < 1 ? { startS: alt.startS, s: alt.s } : null
      // die Probefahrt kommt nicht ins Sammelheft
      const beginn = probe ? null : gleich ? alt.beginn : fahrtBeginnen(titel[0], wahl.ohne ? 'ohne Ziel' : titel[1])
      if (beginn !== null && (!gleich || wahl.ohne) && ((wahl.von && wahl.nach) || wahl.ohne)) {
        laufendBeginnen({ von: wahl.von ?? 0, nach: wahl.nach ?? 0, ueber: wahl.ueber, titel: titel.join(' → '), beginn,
                          laenge: wegEnde(fahrweg), ...(wahl.ohne ? { ohne: true } : {}) })
      }
      // «Ohne Ziel» mit neu erkannter Linie: die Meter der bisherigen Linien bleiben
      const wegVorher = beginn !== null && wahl.ohne && gleich
        ? heftLesen().fahrten.find((f) => f.beginn === beginn)?.weg_m ?? 0 : 0
      const wegTeil = beginn !== null && wahl.ohne && gleich
        ? heftLesen().fahrten.find((f) => f.beginn === beginn)?.wege?.length ?? 0 : 0
      setFahrt({ fahrweg, probe, piepen, beginn, fortsetzen, wegVorher, wegTeil })
    } catch (e) {
      setFahrtFehler((e as Error).message)
    } finally {
      setLaedt(false)
    }
  }
  // Was die Bilanz, das Quiz und das Sammelheft zu einem Objekt wissen
  function bilanzObjekt(o: FahrObjekt): BilanzObjekt {
    const t = objektText(o)
    const leer = { laenge_m: null, baueinheiten: null, linie: null, kanton: null }
    // Angaben zum Aufklappen in der Bilanz (Michael, 2026-09-25); fehlt ein
    // Wert, steht er nicht da, statt geschätzt
    const angaben: Array<[string, string]> = []
    const dazu = (k: string, v: string | number | null | undefined) => {
      if (v !== null && v !== undefined && v !== '') angaben.push([k, String(v)])
    }
    if (o.art === 'bahnhof') {
      const b = bahnhof.get(uicVon.get(o.kennung) ?? 0)
      dazu('Kanton', b && (b.kanton_auch?.length ? [b.kanton, ...b.kanton_auch].join(' / ') : b.kanton))
      dazu('Grösse', b && b.frequenz_erfasst !== false ? STUFE_TEXT[b.tier] : null)
      dazu('Ein- und Aussteigende pro Werktag', b?.dwv != null ? b.dwv.toLocaleString('de-CH') : null)
      dazu('Infrastruktur', b?.isb)
      return { ...leer, art: 'bahnhof', kennung: String(b?.uic ?? o.kennung), name: t?.name ?? o.kennung,
               zeile: t?.zeile ?? '', angaben,
               // ohne Kanton, wo die Quellen verschiedene nennen (Moutier): sonst fragte die Bilanz danach
               kanton: b?.kanton_auch?.length ? null : b?.kanton ?? null }
    }
    if (o.art === 'tunnel') {
      const x = tunnelNach.get(o.kennung)
      dazu('Länge', x ? (x.laenge_m === null ? 'keine Angabe' : `${genau(x.laenge_m)} m`) : null)
      dazu('In Betrieb seit', x?.inbetriebnahme_jahr)
      dazu('Röhren und Spuren', x?.tunnelsystem)
      dazu('Linie', x?.linie)
      dazu('Kanton laut Quelle', x?.kanton)
      dazu('Bemerkung der Quelle', x?.bemerkung)
    } else {
      const y = brueckenNach.get(o.kennung)
      dazu('Baueinheiten', y ? (y.baueinheiten === null ? 'keine Angabe' : y.baueinheiten) : null)
      dazu('Länge laut Zeichnung von swisstopo', brueckeLaenge(o.kennung)?.replace(' laut Zeichnung von swisstopo', ''))
      dazu('Linie', y?.linie)
      dazu('Kanton laut Quelle', y?.kanton)
    }
    const x = o.art === 'tunnel' ? tunnelNach.get(o.kennung) : brueckenNach.get(o.kennung)
    // Sammelheft und Bilanz behalten den Namen laut Quelle, mit Kürzel
    return { ...leer, art: o.art === 'tunnel' ? 'tunnel' : 'bruecke', kennung: o.kennung,
             name: x?.name ?? t?.name ?? o.kennung, zeile: (t?.zeile ?? '').replace(/ · Name laut Quelle: .*$/, ''),
             linie: x?.linie ?? null, baueinheiten: t?.baueinheiten ?? null,
             laenge_m: o.art === 'tunnel' ? tunnelNach.get(o.kennung)?.laenge_m ?? null : null, angaben }
  }

  // Von der Seite «Fahrtmodus» her: gleich starten, einmal. Danach fällt
  // fahrt= aus der Adresse, sonst startete ein Neuladen die Fahrt wieder.
  // Auch wenn die Seite schon offen ist: «Fortsetzen» nach dem Neuladen
  // ändert nur die Adresse, die Seite bleibt dieselbe.
  const [startWunsch, setStartWunsch] = useState(fahrtAusAdresse)
  useEffect(() => {
    const beiWechsel = () => { const art = fahrtAusAdresse(); if (art) setStartWunsch(art) }
    window.addEventListener('hashchange', beiWechsel)
    return () => window.removeEventListener('hashchange', beiWechsel)
  }, [])
  useEffect(() => {
    const art = startWunsch
    if (!art) return
    setStartWunsch(null)
    window.history.replaceState(null, '', streckenAdresse(wahl))
    void fahrtStarten(art === 'probe', art === 'weiter')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWunsch])

  const gemerkt = wahl.von && wahl.nach ? { von: wahl.von, nach: wahl.nach, ueber: wahl.ueber } : null
  const [favorit, setFavorit] = useState(() => (gemerkt ? istFavorit(gemerkt) : false))
  const [probe, setProbe] = useState(() => (gemerkt ? istProbefahrt(gemerkt) : false))

  // mit Kennung, damit jede Zeile zu ihrem Eintrag in der Liste der Linie führt
  const t = tunnelIds.flatMap((i) => { const x = tunnelNach.get(i); return x ? [{ ...x, id: i }] : [] })
  const b = brueckenIds.flatMap((i) => { const x = brueckenNach.get(i); return x ? [{ ...x, id: i }] : [] })

  // Betriebspunkte des Wegs, die Bahnhöfe in Taktland sind
  const bahnhoefe = weg.punkte.map((p) => bahnhof.get(uicVon.get(p) ?? 0)).filter((x) => x !== undefined)
  // Anfang und Ende des Wegs; ohne Bahnhof dort («Ohne Ziel») der Name des Betriebspunkts
  const endName = (abk: string) => bahnhof.get(uicVon.get(abk) ?? 0)?.name ?? netz.punkte[abk] ?? abk
  const titelText = `${endName(weg.punkte[0])} → ${endName(weg.punkte[weg.punkte.length - 1])}`
  // ein Ende ohne Bahnhof in Taktland (Iselle) steht als Name, ohne Verweis
  const endeLink = (abk: string) => {
    const x = bahnhof.get(uicVon.get(abk) ?? 0)
    return x ? <BahnhofLink b={x} /> : endName(abk)
  }
  const grosse = bahnhoefe.slice(1, -1).filter((x) => x.tier === 'L')

  // Strecken anderer Bahnen: Tunnel und Brücken aus swissTLM3D (Michael, 2026-09-26:
  // «mitzählen», getrennt ausgewiesen), in Wegrichtung, jedes einmal
  const tlmListe: Array<{ id: string; art: string; name?: string; wo: string }> = []
  weg.abschnitte.forEach((e, i) => {
    const ids = e.von === weg.punkte[i] ? e.tlm ?? [] : [...(e.tlm ?? [])].reverse()
    for (const id of ids) {
      const x = netz.tlm_bauwerke?.[id]
      if (x && !tlmListe.some((y) => y.id === id)) {
        tlmListe.push({ id, ...x, wo: `${netz.punkte[weg.punkte[i]]} – ${netz.punkte[weg.punkte[i + 1]]}` })
      }
    }
  })
  const tlmT = tlmListe.filter((x) => x.art === 'tunnel' || x.art === 'galerie')
  const tlmB = tlmListe.filter((x) => x.art === 'bruecke' || x.art === 'gedeckte_bruecke')

  const ohneDaten = weg.abschnitte.filter((e) => !e.teile?.length)
  const andere = ohneDaten.filter((e) => e.isb !== 'SBB')
  const ohneLinie = ohneDaten.filter((e) => e.isb === 'SBB')
  const bahnen = [...new Set(andere.map((e) => e.isb))]
  const abschnitt = (e: StreckenAbschnitt) => `${netz.punkte[e.von]} – ${netz.punkte[e.nach]}`
  // die drei grössten zuerst, nach dem Suchgewicht: Lötschberg statt Thun Schadau
  const beispiele = (liste: StreckenAbschnitt[]) =>
    [...liste].sort((x, y) => y.gewicht - x.gewicht).slice(0, 3).map(abschnitt).join(', ')
      + (liste.length > 3 ? ' und weitere' : '')

  const luecken: Luecke[] = [
    ...(andere.length ? [{
      thema: 'Strecken anderer Bahnen',
      grund: `${andere.length} von ${weg.abschnitte.length} Abschnitten dieses Wegs gehören zur `
        + `Infrastruktur der ${bahnen.join(' und ')}, etwa ${beispiele(andere)}. Die Daten der SBB `
        + 'erfassen Tunnel und Brücken nur auf ihrer Infrastruktur. '
        + (andere.every((e) => e.verlauf_bav)
          ? 'Auf diesen Abschnitten stammen sie aus swissTLM3D von swisstopo; eine Länge nennt die Quelle nicht, oft auch keinen Namen.'
          : andere.some((e) => e.verlauf_bav)
            ? `Auf ${andere.filter((e) => e.verlauf_bav).length} davon stammen sie aus swissTLM3D von `
              + 'swisstopo, ohne Länge in der Quelle und oft ohne Namen; auf den übrigen fehlen sie in der Zählung, '
              + 'weil ihr Verlauf nicht im Schienennetz des BAV steht.'
            : 'Dort fehlen sie in der Zählung, weil ihr Verlauf nicht im Schienennetz des BAV steht.'),
      quelle: 'zugzahlen, schienennetz, swissTLM3D',
    }] : []),
    ...(ohneLinie.length ? [{
      thema: 'Abschnitte ohne Linie',
      grund: `${ohneLinie.length === 1 ? 'Einem Abschnitt' : `${ohneLinie.length} Abschnitten`} liess `
        + `sich keine Linie zuordnen (${beispiele(ohneLinie)}). Tunnel und Brücken darauf fehlen in `
        + 'der Zählung.',
      quelle: 'linienkilometrierung',
    }] : []),
    {
      thema: 'Fahrplan',
      grund: 'Einen Fahrplan enthalten die Daten nicht. Ob ein Zug diesen Weg fährt, sagen sie nicht. '
        + 'Mit «Über» lässt sich ein Bahnhof festlegen, über den der Weg führen soll.',
      quelle: 'zugzahlen',
    },
    {
      thema: 'Länge des Wegs',
      grund: 'Die Kilometrierung ist ein Standort auf der Linie, keine Länge. Wie lang der Weg ist, '
        + 'nennen die Daten nicht. Beim Fahren misst Taktland die gezeichnete Strecke, gerundet.',
      quelle: 'linienkilometrierung',
    },
  ]

  if (modell) {
    return (
      <ModellAusWeg titel={titelText} laedt={laedt} fehler={fahrtFehler} fahrweg={modellWeg}
                    bauen={() => void fahrtStarten(true, false, true)} />
    )
  }

  return (
    <>
      <section className="mt-8">
        <h2 className="text-xl font-bold tracking-tight">
          {wahl.weg ? titelText
            : <>{endeLink(weg.punkte[0])} → {endeLink(weg.punkte[weg.punkte.length - 1])}</>}
        </h2>
        {grosse.length > 0 && (
          <p className="mt-1 leading-relaxed">
            über {grosse.map((x, i) => (
              <span key={x.uic}>{i > 0 && ', '}<BahnhofLink b={x} /></span>
            ))}
          </p>
        )}
        <details className="klapp mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
          <summary className="cursor-pointer underline underline-offset-2">
            Alle {weg.punkte.length} Betriebspunkte des Wegs
          </summary>
          {/* Betriebspunkte, die ein Bahnhof in Taktland sind, führen zu ihrer
              Seite; die übrigen haben keine und bleiben Text */}
          <p className="mt-2 leading-relaxed text-sbb-black dark:text-sbb-white">
            {weg.punkte.map((p, i) => {
              const b = bahnhof.get(uicVon.get(p) ?? 0)
              return (
                <span key={`${p}-${i}`}>
                  {i > 0 && ' · '}
                  {b ? <BahnhofLink b={b} /> : (netz.punkte[p] ?? p)}
                </span>
              )
            })}
          </p>
        </details>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Kachel zahl={t.length + tlmT.length} text="Tunnel" ziel="weg-tunnel"
                  zusatz={tlmT.length ? `davon ${tlmT.length} aus swissTLM3D` : undefined} />
          <Kachel zahl={b.length + tlmB.length} text={b.length + tlmB.length === 1 ? 'Brücke' : 'Brücken'}
                  ziel="weg-bruecken"
                  zusatz={tlmB.length ? `davon ${tlmB.length} aus swissTLM3D` : undefined} />
        </div>
        <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
          Erfasst entlang dieses Wegs, jede nur einmal gezählt.
          {andere.length > 0 && (andere.some((e) => e.verlauf_bav)
            ? ' Auf Strecken anderer Bahnen aus swissTLM3D von swisstopo, siehe unten.'
            : ' Auf Strecken anderer Bahnen fehlen sie, siehe unten.')}
        </p>

        {weg.abschnitte.length > 0 && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button" disabled={laedt} onClick={() => void fahrtStarten(false)}
                className="rounded-lg bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125
                           disabled:opacity-60"
              >
                Losfahren
              </button>
              <button
                type="button" disabled={laedt} onClick={() => void fahrtStarten(true)}
                className="rounded-lg border border-sbb-cloud bg-white px-4 py-3 font-medium hover:border-sbb-black
                           disabled:opacity-60 dark:border-sbb-iron dark:bg-sbb-midnight
                           dark:hover:border-sbb-white"
              >
                Probefahrt
              </button>
            </div>
            <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
              Im Zug zeigt «Fahren» den nächsten Tunnel, die nächste grössere Brücke und den
              nächsten Bahnhof und meldet sie etwa 20 oder 10 Sekunden vorher mit einem Ton. Was
              gemeldet wird, lässt sich wählen. Dafür braucht Taktland den Standort; dieser
              bleibt auf dem Gerät. Die Probefahrt spielt den Weg zum Ausprobieren ab.
            </p>
            {/* derselbe Weg als Modell in der Modellbahn (Michael, 2026-10-08) */}
            {!wahl.weg && wahl.von && wahl.nach && (
              <a href={`${streckenAdresse(wahl).replace('#/strecke', '#/modellbahn/strecke')}&fest=1`}
                 className="mt-3 flex items-center gap-2 text-sm font-medium underline underline-offset-2">
                Als Modell ansehen (Spiele, Modellbahn, bis {MODELL_HOECHSTENS_M / 1000} km)
                <span className="pfeil" aria-hidden="true">→</span>
              </a>
            )}
            {gemerkt && (
              <button
                type="button" aria-pressed={favorit}
                onClick={() => setFavorit(favoritUmschalten(gemerkt).favoriten.some(
                  (x) => x.von === gemerkt.von && x.nach === gemerkt.nach && x.ueber === gemerkt.ueber))}
                className="mt-3 flex items-center gap-2 text-sm font-medium"
              >
                <Stern voll={favorit} />
                {favorit ? 'Bei «Fahren» gemerkt' : 'Fahrt bei «Fahren» merken'}
              </button>
            )}
            {gemerkt && (
              <button
                type="button" aria-pressed={probe}
                onClick={() => { probefahrtUmschalten(gemerkt); setProbe(istProbefahrt(gemerkt)) }}
                className="mt-2 flex items-center gap-2 text-sm font-medium"
              >
                <Stern voll={probe} />
                {probe ? 'Unter den Probefahrten' : 'Als Probefahrt merken'}
              </button>
            )}
            {laedt && <p className="mt-2 text-sm">Die Lage der Linien wird geladen …</p>}
            {fahrtFehler && <p className="mt-2 text-sm">«Fahren» konnte nicht starten. {fahrtFehler}</p>}
          </>
        )}
      </section>

      {fahrt && (
        <Fahrtmodus fahrweg={fahrt.fahrweg} text={objektText} probefahrt={fahrt.probe}
                    piepen={fahrt.piepen} fortsetzen={fahrt.fortsetzen}
                    bahnhofSeite={(o) => {
                      const uic = uicVon.get(o.kennung)
                      const b = uic === undefined ? undefined : bahnhof.get(uic)
                      return b ? { uic: b.uic, eintrag: b } : null
                    }}
                    startKennung={weg.punkte[0]}
                    retour={!fahrt.probe || wahl.ohne || !wahl.von || !wahl.nach ? undefined : () => {
                      // die Probefahrt in Gegenrichtung (Michael, 2026-10-02: «nur bei der Probefahrt»)
                      leereFahrtenWeg()
                      tonWeitergeben(fahrt.piepen)
                      setFahrt(null)
                      window.location.hash = fahrtAdresse({ von: wahl.nach, nach: wahl.von, ueber: wahl.ueber }, true)
                    }}
                    ohneZiel={wahl.ohne && !fahrt.probe ? () => {
                      // der Ton bleibt freigegeben, auch ohne neuen Tipp
                      tonWeitergeben(fahrt.piepen)
                      window.location.hash = '#/ohneziel'
                    } : undefined}
                    stelle={fahrt.beginn === null ? undefined
                      : (startS, s) => {
                        laufendStelle(fahrt.beginn!, startS, s)
                        wegSetzen(fahrt.beginn!, fahrt.wegVorher + Math.max(0, s - startS))
                        // der gefahrene Weg für die Karte im Logbuch, etwa alle 150 m ein Punkt
                        const fw = fahrt.fahrweg
                        const pts = [lageBei(fw, startS)]
                        let letzte = startS
                        for (const p of fw.punkte) {
                          if (p.s <= startS || p.s >= s) continue
                          if (p.s - letzte >= 150) { pts.push(p); letzte = p.s }
                        }
                        pts.push(lageBei(fw, s))
                        wegLinieSetzen(fahrt.beginn!, fahrt.wegTeil, pts)
                      }}
                    durchfahren={(o) => {
                      if (fahrt.beginn === null) return
                      // Tunnel und Brücken anderer Bahnen aus swissTLM3D kommen mit ihrer Bahn
                      // ins Sammelheft (Michael, 2026-09-30: «alle Bahnen defaultmässig»)
                      if (o.tlm) {
                        if (o.art !== 'tunnel' && o.art !== 'bruecke') return
                        const laenge = objektText(o)?.laenge
                        durchfahren(fahrt.beginn, { art: o.art, kennung: o.kennung, name: objektText(o)?.name ?? o.kennung,
                                                    ...(o.bahn ? { bahn: o.bahn } : {}), ...(laenge ? { laenge } : {}) })
                        return
                      }
                      if (o.art === 'bahnuebergang') {
                        const u = uebergaengeNach.get(o.kennung)
                        durchfahren(fahrt.beginn, { art: 'bahnuebergang', kennung: o.kennung, bahn: 'SBB',
                                                    name: u?.name ?? objektText(o)?.name ?? o.kennung })
                        return
                      }
                      const b = bilanzObjekt(o)
                      const bahn = b.art === 'bahnhof' ? bahnhof.get(Number(b.kennung))?.isb ?? 'SBB' : 'SBB'
                      // die Länge mit ins Sammelheft und Logbuch: Tunnel laut SBB, Brücken laut Zeichnung
                      const laenge = b.art === 'tunnel' && b.laenge_m !== null ? `${genau(b.laenge_m)} m`
                        : b.art === 'bruecke' ? brueckeLaenge(b.kennung) : null
                      durchfahren(fahrt.beginn, { art: b.art, kennung: b.kennung, name: b.name, bahn,
                                                  ...(laenge ? { laenge } : {}) })
                    }}
                    beenden={(liste) => {
                      if (fahrt.beginn !== null) laufendEnde()
                      leereFahrtenWeg()
                      setBilanz({ objekte: liste.filter((o) => !o.tlm && o.art !== 'bahnuebergang').map(bilanzObjekt), probe: fahrt.probe,
                                  beginn: fahrt.beginn })
                      setFahrt(null)
                    }}
                    titel={titelText} />
      )}
      {bilanz && (
        <FahrtBilanz objekte={bilanz.objekte} probe={bilanz.probe} beginn={bilanz.beginn}
                     titel={titelText}
                     schliessen={() => setBilanz(null)} />
      )}

      <aside className="mt-6 border-l-4 border-sbb-red bg-sbb-milk px-4 py-3 dark:bg-sbb-charcoal">
        <p className="text-xs font-semibold uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
          Zum Verständnis
        </p>
        <p className="mt-1 text-sm text-sbb-black dark:text-sbb-white">
          Taktland sucht den kürzesten Weg über die Abschnitte, auf denen laut den Zugzahlen
          {' '}{netz.zugzahlen_jahr} Personenzüge fahren. Abschnitte mit wenigen Zügen zählen dabei
          als länger, und jeder Betriebspunkt unterwegs kostet etwas, damit der Weg den stark
          befahrenen, durchgehenden Strecken folgt. Dazu kommen Strecken aus dem Schienennetz des
          BAV, die die Zugzahlen nicht führen: die BTI (Linie 261, Biel – Täuffelen – Ins) und die
          Strecken weiterer Bahnen wie RhB, MGB, MOB und Zentralbahn, wo Bahnhöfe sonst fehlten. Für
          sie gibt es keine Zugzahlen; sie zählen darum wie mässig befahrene Strecken, die BTI so,
          dass Ins – Biel über Täuffelen führt. Welche Bahnen der Weg nehmen darf, lässt sich unter
          «Bahnen» wählen. Als Brücke gilt jedes
          Bauwerk im Brückenverzeichnis, auch ein kleines: Eine Brücke bis zwei Meter heisst
          Durchlass. Ein Tunnel zählt, sobald der Weg ihn berührt, auch einer, in dem der
          Start- oder Zielbahnhof liegt (in Zürich HB etwa der Tunnel Bahnhof Museumstrasse).
        </p>
      </aside>

      <WegLinien laeufe={laeufe(weg)} netz={netz} verzeichnis={verzeichnis} />

      {t.length + tlmT.length > 0 && (
        <section id="weg-tunnel" className="mt-8 scroll-mt-4">
          <h2 className="text-lg font-bold">Tunnel in Wegrichtung</h2>
          <ol className="mt-3 kachelliste">
            {t.map((x) => (
              <Zeile key={x.id} name={x.name} linie={x.linie} liste="tunnel" stelle={x.id}
                     seite={tunnel.linien[String(x.linie)]?.seite ?? false} teile={[
                       x.laenge_m === null ? 'Länge: keine Angabe' : `${genau(x.laenge_m)} m`,
                       x.inbetriebnahme_jahr === null ? 'Jahr: keine Angabe'
                         : `erstmals in Betrieb ${x.inbetriebnahme_jahr}`,
                     ]} />
            ))}
          </ol>
          <TlmListe liste={tlmT} />
        </section>
      )}

      {b.length + tlmB.length > 0 && (
        <section id="weg-bruecken" className="mt-8 scroll-mt-4">
          <h2 className="text-lg font-bold">Brücken in Wegrichtung</h2>
          <ol className="mt-3 kachelliste">
            {(alleBruecken ? b : b.slice(0, BRUECKEN_ZUERST)).map((x) => (
              <Zeile key={x.id} name={x.name} linie={x.linie} liste="bruecken" stelle={x.id}
                     seite={bruecken.linien[String(x.linie)]?.seite ?? false} teile={[
                       x.kanton ? `Kanton «${x.kanton}»` : 'Kanton: keine Angabe',
                       x.baueinheiten === null ? 'Baueinheiten: keine Angabe'
                         : `${x.baueinheiten} ${x.baueinheiten === 1 ? 'Baueinheit' : 'Baueinheiten'}`,
                     ]} />
            ))}
          </ol>
          {!alleBruecken && b.length > BRUECKEN_ZUERST && (
            <button
              type="button" onClick={zeigeAlle}
              className="rounded-lg mt-3 w-full border border-sbb-cloud bg-white px-4 py-3 font-medium
                         hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight
                         dark:hover:border-sbb-white"
            >
              Alle {b.length.toLocaleString('de-CH')} Brücken anzeigen
            </button>
          )}
          <TlmListe liste={tlmB} />
        </section>
      )}

      <Luecken luecken={luecken} />

      <p className="mt-6 text-xs text-sbb-metal dark:text-sbb-storm">
        Quellen: {netz.quellen.join(', ')}. Datenstand: {netz.datenstand}. Namen und Werte stehen
        wie in den offenen Daten, auch mit Abkürzungen.
      </p>
    </>
  )
}

/** Die Linien des Wegs, verlinkt, wo die Linie in Taktland eine Seite hat */
/** Die eigene Strecke der Modellbahn: gleich nach der Wahl bauen; bis etwa 170 km, länger lädt das Gelände zu langsam */
function ModellAusWeg({ titel, laedt, fehler, fahrweg, bauen }: {
  /** null: der Titel steht schon oben (gemerkte Probefahrt) */
  titel: string | null; laedt: boolean; fehler: string | null; fahrweg: Fahrweg | null; bauen: () => void
}) {
  // einmal je Weg (die Seite gibt Ergebnis je Wahl einen eigenen Schlüssel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { bauen() }, [])
  const laenge = fahrweg ? wegEnde(fahrweg) : null
  return (
    <section className={titel ? 'mt-8' : 'mt-2'}>
      {titel && <h2 className="text-xl font-bold tracking-tight">{titel}</h2>}
      {(laedt || (!fahrweg && !fehler)) && <p className="mt-2 text-sm text-sbb-metal">Der Weg wird gebaut …</p>}
      {fehler && <p className="mt-2 text-sm">Das Modell konnte nicht gebaut werden. {fehler}</p>}
      {fahrweg && laenge !== null && laenge > MODELL_HOECHSTENS_M && (
        <p className="mt-2 leading-relaxed">
          Dieser Weg ist gezeichnet etwa {Math.round(laenge / 1000).toLocaleString('de-CH')} km lang. Das Modell
          reicht bis {MODELL_HOECHSTENS_M / 1000} km, sonst lädt das Gelände zu langsam. Ein näheres Ziel oder «Über» ergibt
          einen kürzeren Abschnitt.
        </p>
      )}
      {fahrweg && laenge !== null && laenge <= MODELL_HOECHSTENS_M && (
        <Suspense fallback={<p className="mt-2 text-sm text-sbb-metal">Das Modell wird geladen …</p>}>
          <ModellStrecke fahrweg={fahrweg} objekte={fahrweg.objekte} />
        </Suspense>
      )}
    </section>
  )
}

function WegLinien({ laeufe, netz, verzeichnis }: {
  laeufe: Lauf[]
  netz: StreckenNetz
  verzeichnis: LinienVerzeichnis | null
}) {
  const seiten = new Set(verzeichnis?.linien.map((l) => l.linie) ?? [])
  const punkt = (p: string) => netz.punkte[p] ?? p
  const ort = (o: Ort) => ('punkt' in o ? punkt(o.punkt)
    : `Wechsel zwischen ${punkt(o.zwischen[0])} und ${punkt(o.zwischen[1])}`)
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">Linien in Wegrichtung</h2>
      <ol className="mt-3 kachelliste">
        {laeufe.map((l, i) => {
          const strecke = `${ort(l.von)} → ${ort(l.bis)}`
          if (l.linie === null) {
            return (
              <li key={i} className="px-3 py-2">
                <p className="font-medium text-sbb-metal dark:text-sbb-storm">Ohne Linie in den Daten</p>
                <p className="text-sm text-sbb-metal dark:text-sbb-storm">
                  {strecke}{l.isb !== 'SBB' && ` · Infrastruktur: ${l.isb}`}
                </p>
              </li>
            )
          }
          const name = verzeichnis?.namen?.[String(l.linie)]
          const titel = <>Linie {l.linie}{name && <span className="font-normal"> · {name}</span>}</>
          return (
            <li key={i} className="px-3 py-2">
              <p className="font-medium text-sbb-black dark:text-sbb-white">
                {seiten.has(l.linie)
                  ? (
                    <a href={`#/linie/${l.linie}`} className="underline-offset-2 hover:underline">
                      {titel} <span className="pfeil" aria-hidden="true">→</span>
                    </a>
                  )
                  : titel}
              </p>
              <p className="text-sm text-sbb-metal dark:text-sbb-storm">
                {strecke}
                {l.bav && ` · laut Schienennetz des BAV${l.isb !== 'SBB' ? `, Infrastruktur: ${l.isb}` : ''}`}
                {!seiten.has(l.linie) && ' · ohne eigene Seite in Taktland'}
              </p>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Eine Linie ist eine Strecke der Infrastruktur, keine Zuglinie. Die Linien stammen aus den
        Daten der SBB. Auf Abschnitten anderer Bahnen steht die Linie aus dem Schienennetz des BAV
        (Stand 2021), wenn dort genau eine Linie beide Enden des Abschnitts führt; sonst «Ohne Linie
        in den Daten».
      </p>
    </section>
  )
}

/**
 * Unter dem Eingabefeld: alle Linien, auf denen der gewählte Bahnhof erfasst
 * ist, verlinkt die mit eigener Seite. Führen ihn die Daten zu den Linien
 * nicht, steht das da, nicht «keine Linie».
 */
function BahnhofLinien({ b, verzeichnis }: {
  b: IndexEintrag | undefined
  verzeichnis: LinienVerzeichnis | null
}) {
  if (!b || !verzeichnis) return null
  const klein = 'text-sm text-sbb-metal dark:text-sbb-storm'
  // die Linien aus den Fakten des Bahnhofs (Daten der SBB) und die Linien mit
  // Seite, auf denen er steht, auch laut Schienennetz des BAV (Ins: Linie 220)
  const nummern = [...new Set([...(b.linien ?? []), ...(verzeichnis.nach_bahnhof[String(b.uic)] ?? [])])]
    .sort((x, y) => x - y)
  if (!nummern.length) {
    return (
      <p className={`-mt-2 ${klein}`}>
        {b.name} ist in den Daten zu den Linien nicht erfasst{b.isb && ` (Infrastruktur: ${b.isb})`}.
      </p>
    )
  }
  const seiten = new Set(verzeichnis.linien.map((l) => l.linie))
  const ohneSeite = nummern.some((nr) => !seiten.has(nr))
  return (
    <div className="-mt-2">
      <p className={klein}>{nummern.length === 1 ? 'Linie' : 'Linien'} durch {b.name}:</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {nummern.map((nr) => {
          const name = verzeichnis.namen?.[String(nr)] ?? undefined
          return (
            <li key={nr}>
              {seiten.has(nr) ? (
                <a href={`#/linie/${nr}`} title={name}
                   className="block rounded-lg border border-sbb-cloud bg-white px-2 py-0.5 text-sm font-medium
                              text-sbb-black hover:border-sbb-black dark:border-sbb-iron
                              dark:bg-sbb-midnight dark:text-sbb-white dark:hover:border-sbb-white">
                  Linie {nr} <span className="pfeil" aria-hidden="true">→</span>
                </a>
              ) : (
                <span title={name}
                      className="block border border-dashed border-sbb-cloud px-2 py-0.5 text-sm
                                 text-sbb-metal dark:border-sbb-iron dark:text-sbb-storm">
                  Linie {nr}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {ohneSeite && <p className={`mt-1 ${klein}`}>Gestrichelt: ohne eigene Seite in Taktland.</p>}
    </div>
  )
}

/**
 * Zahl der Tunnel oder Brücken des Wegs. Mit ziel führt ein Tipp zur Liste
 * weiter unten auf der Seite; die Seite rollt nur auf diesen Tipp hin.
 */
/** Ein Bahnhof aus Taktland, verlinkt auf seine Seite */
function BahnhofLink({ b }: { b: IndexEintrag | undefined }) {
  if (!b) return null
  return (
    <a href={`#/bahnhof/${b.uic}`} className="underline-offset-2 hover:underline">{b.name}</a>
  )
}

/** Tunnel und Brücken aus swissTLM3D auf Strecken anderer Bahnen, unter der Liste der SBB */
function TlmListe({ liste }: { liste: Array<{ id: string; art: string; name?: string; wo: string }> }) {
  if (!liste.length) return null
  const wort: Record<string, string> = { tunnel: 'Tunnel', galerie: 'Galerie', bruecke: 'Brücke',
                                         gedeckte_bruecke: 'Gedeckte Brücke' }
  return (
    <>
      <p className="mt-4 text-sm font-medium">Auf Strecken anderer Bahnen, aus swissTLM3D (swisstopo)</p>
      <ol className="mt-2 kachelliste">
        {liste.map((x) => (
          <li key={x.id} className="px-3 py-2">
            <p className="font-medium text-sbb-black dark:text-sbb-white">
              {x.name ?? `${wort[x.art]} ohne Namen`}
            </p>
            <p className="text-sm text-sbb-metal dark:text-sbb-storm">
              {x.name ? `${wort[x.art]} · ` : ''}{x.wo} · Länge: nicht in der Quelle
            </p>
          </li>
        ))}
      </ol>
    </>
  )
}

function Kachel({ zahl, text, ziel, zusatz }: { zahl: number; text: string; ziel?: string; zusatz?: string }) {
  const inhalt = (
    <>
      <p className="text-3xl font-bold tabular-nums text-sbb-black dark:text-sbb-white">
        {zahl.toLocaleString('de-CH')}
      </p>
      <p className="text-sm text-sbb-metal dark:text-sbb-storm">
        {text}{ziel && zahl > 0 && <span className="pfeil pfeil-unten" aria-hidden="true"> ↓</span>}
      </p>
      {zusatz && <p className="text-xs text-sbb-metal dark:text-sbb-storm">{zusatz}</p>}
    </>
  )
  const stil = 'kachel px-4 py-3'
  if (!ziel || zahl === 0) return <div className={stil}>{inhalt}</div>
  return (
    <button
      type="button" aria-label={`${zahl} ${text}: zur Liste`}
      onClick={() => document.getElementById(ziel)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className={`${stil} kachel-link text-left`}
    >
      {inhalt}
    </button>
  )
}

function Zeile({ name, linie, seite, teile, liste, stelle }: {
  name: string
  linie: number
  seite: boolean
  teile: string[]
  liste: 'tunnel' | 'bruecken'
  /** «Linie:Stelle» */
  stelle: string
}) {
  return (
    <li className="px-3 py-2">
      <p className="font-medium text-sbb-black dark:text-sbb-white">
        {seite
          ? <a href={`#/linie/${linie}/${liste}?eintrag=${stelle.split(':')[1]}`}
               className="underline-offset-2 hover:underline">{ohneKuerzel(name)}</a>
          : ohneKuerzel(name)}
      </p>
      <p className="text-sm text-sbb-metal dark:text-sbb-storm">
        {seite
          ? <a href={`#/linie/${linie}`} className="underline underline-offset-2 hover:text-sbb-black
                                                   dark:hover:text-sbb-white">Linie {linie}</a>
          : `Linie ${linie}`}
        {' · '}{teile.join(' · ')}{ohneKuerzel(name) !== name && ` · Name laut Quelle: ${name}`}
      </p>
    </li>
  )
}

/**
 * Ein Feld, in das man einen Bahnhof tippt. Darunter stehen passende Bahnhöfe
 * zur Wahl, die mit dem Namensanfang zuerst. Enter nimmt den ersten.
 */
export function BahnhofFeld({ bezeichnung, wert, bahnhoefe, name, aendern }: {
  bezeichnung: string
  wert: number | null
  bahnhoefe: IndexEintrag[]
  name: (uic: number | null) => string
  aendern: (uic: number | null) => void
}) {
  const [text, setText] = useState(name(wert))
  const [offen, setOffen] = useState(false)
  useEffect(() => { setText(name(wert)) }, [wert, name])
  const favoriten = useFavoriten()
  // bei leerem Feld stehen die Favoriten zur Wahl (Michael, 2026-09-25)
  const favoritenZurWahl = useMemo(() => {
    if (text.trim()) return []
    const hier = new Map(bahnhoefe.map((e) => [e.uic, e]))
    return alphabetisch(favoriten.map((u) => hier.get(u)).filter((e): e is IndexEintrag => !!e))
  }, [text, favoriten, bahnhoefe])

  const vorschlaege = useMemo(() => {
    const b = vereinfachen(text.trim())
    if (!b || text === name(wert)) return []
    return bahnhoefe
      .filter((e) => vereinfachen(e.name).includes(b))
      .sort((x, y) => Number(!vereinfachen(x.name).startsWith(b)) - Number(!vereinfachen(y.name).startsWith(b))
        || (y.dwv ?? 0) - (x.dwv ?? 0))
      .slice(0, 8)
  }, [text, bahnhoefe, wert, name])

  function nehmen(e: IndexEintrag) {
    setText(e.name)
    setOffen(false)
    aendern(e.uic)
  }

  return (
    <div className="relative">
      <label className="block">
        <span className="block text-xs text-sbb-metal dark:text-sbb-storm">{bezeichnung}</span>
        <span className="mt-1 flex">
          <input
            type="text" enterKeyHint="go" value={text} autoComplete="off" placeholder="Bahnhof"
            onChange={(e) => { setText(e.target.value); setOffen(true) }}
            onFocus={() => setOffen(true)}
            onBlur={() => window.setTimeout(() => setOffen(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && vorschlaege[0]) nehmen(vorschlaege[0]) }}
            className={`w-full border border-sbb-cloud bg-white px-4 py-3 text-lg text-sbb-black
                       placeholder:text-sbb-metal dark:border-sbb-iron dark:bg-sbb-midnight
                       dark:text-sbb-white ${wert ? 'rounded-l-lg' : 'rounded-lg'}`}
          />
          {wert && (
            <button type="button" onClick={() => { setText(''); aendern(null) }}
                    aria-label={`${bezeichnung} leeren`}
                    className="shrink-0 rounded-r-lg border border-l-0 border-sbb-cloud px-3 text-sbb-metal
                               hover:text-sbb-black dark:border-sbb-iron dark:hover:text-sbb-white">
              ×
            </button>
          )}
        </span>
      </label>
      {offen && (vorschlaege.length > 0 || favoritenZurWahl.length > 0) && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-sbb-cloud bg-white shadow-md
                        dark:border-sbb-iron dark:bg-sbb-midnight"
             // der Fokus bleibt im Feld, auch beim Tipp auf einen Stern
             onMouseDown={(ev) => ev.preventDefault()}>
          {favoritenZurWahl.length > 0 && (
            <p className="px-4 pt-2 text-xs font-medium uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
              Favoriten
            </p>
          )}
          <ul>
            {(vorschlaege.length > 0 ? vorschlaege : favoritenZurWahl).map((e) => (
              <li key={e.uic} className="flex items-stretch">
                <button
                  type="button" onClick={() => nehmen(e)}
                  className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 py-2 pl-4 pr-1
                             text-left hover:bg-sbb-milk dark:hover:bg-sbb-charcoal"
                >
                  <span className="text-sbb-black dark:text-sbb-white">{e.name}</span>
                  <span className="text-sm text-sbb-metal dark:text-sbb-storm">
                    {e.ohne_bahnhofseite ? 'ohne Bahnhofseite' : kantoneText(e) ?? ''}
                  </span>
                </button>
                {/* ohne Bahnhofseite auch kein Favorit: die Favoriten führen zu Bahnhofseiten */}
                {e.ohne_bahnhofseite ? <span className="w-12 shrink-0" aria-hidden="true" />
                  : <FavoritKnopf uic={e.uic} name={e.name} favorit={favoriten.includes(e.uic)}
                                  className="w-12 hover:bg-sbb-milk dark:hover:bg-sbb-charcoal" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
