import { useCallback, useEffect, useMemo, useState } from 'react'
import { geometrieLaden, linienLaden, streckenLaden, uebersichtLaden } from '../daten'
import { type FahrObjekt, type Fahrweg, fahrwegBauen, geometrieLesen, tonVorbereiten } from '../fahrt'
import { kantonText } from '../kanton'
import type {
  BahnhofIndex, BrueckenEintrag, IndexEintrag, LinienVerzeichnis, Luecke, StreckenAbschnitt,
  StreckenNetz, TunnelEintrag, Uebersicht,
} from '../typen'
import { vereinfachen } from './Blaettern'
import { Fahrtmodus, type ObjektText } from './Fahrtmodus'
import { Luecken } from './Luecken'
import { genau } from './Objekte'
import { Ladefehler } from './Ladefehler'

/** Start, Ziel und wahlweise ein Bahnhof dazwischen, als UIC */
export interface StreckenWahl {
  von: number | null
  nach: number | null
  ueber: number | null
}

/** #/strecke?von=8503000&nach=8505300&ueber=8505000: teilbar und mit «Zurück» erreichbar */
export function streckenAdresse(w: StreckenWahl) {
  const teile = (['von', 'nach', 'ueber'] as const).filter((k) => w[k]).map((k) => `${k}=${w[k]}`)
  return teile.length ? `#/strecke?${teile.join('&')}` : '#/strecke'
}

export function wahlAusAdresse(abfrage: string | undefined): StreckenWahl {
  const p = new URLSearchParams(abfrage ?? '')
  const zahl = (k: string) => {
    const v = Number(p.get(k))
    return Number.isInteger(v) && v > 0 ? v : null
  }
  return { von: zahl('von'), nach: zahl('nach'), ueber: zahl('ueber') }
}

interface Weg {
  punkte: string[]
  abschnitte: StreckenAbschnitt[]
}

type Nachbarn = Map<string, Array<[string, StreckenAbschnitt]>>

/**
 * Kürzester Weg nach dem Gewicht der Abschnitte (Dijkstra). Das Gewicht ist
 * die Luftlinie, bei wenig befahrenen Abschnitten erhöht; es dient nur der
 * Suche und wird nirgends angezeigt. generator/strecken.py sucht gleich.
 */
function wegSuchen(nachbarn: Nachbarn, start: string, ziel: string): Weg | null {
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
function nachKennung<T>(u: Uebersicht<T>) {
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

export function Strecke({ index, wahl }: { index: BahnhofIndex | null; wahl: StreckenWahl }) {
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
  const name = useCallback((uic: number | null) => (uic ? bahnhof.get(uic)?.name ?? String(uic) : ''),
                           [bahnhof])

  const nachbarn = useMemo(() => {
    const n: Nachbarn = new Map()
    for (const e of netz?.abschnitte ?? []) {
      n.set(e.von, [...(n.get(e.von) ?? []), [e.nach, e]])
      n.set(e.nach, [...(n.get(e.nach) ?? []), [e.von, e]])
    }
    return n
  }, [netz])

  const ergebnis = useMemo(() => {
    if (!netz || !wahl.von || !wahl.nach) return null
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
  }, [netz, nachbarn, wahl])

  function waehlen(neu: Partial<StreckenWahl>) {
    window.location.hash = streckenAdresse({ ...wahl, ...neu })
  }

  const alle = index?.bahnhoefe ?? []

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Strecke</h1>
      <p className="mt-2 leading-relaxed">
        Start und Ziel wählen: Taktland sucht einen Weg durch das Netz und zeigt die erfassten
        Tunnel und Brücken entlang dieses Wegs.
      </p>

      <div className="mt-6 space-y-3">
        <BahnhofFeld bezeichnung="Von" wert={wahl.von} bahnhoefe={alle} name={name}
                     aendern={(u) => waehlen({ von: u })} />
        <BahnhofLinien b={wahl.von ? bahnhof.get(wahl.von) : undefined} verzeichnis={verzeichnis} />
        <BahnhofFeld bezeichnung="Nach" wert={wahl.nach} bahnhoefe={alle} name={name}
                     aendern={(u) => waehlen({ nach: u })} />
        <BahnhofLinien b={wahl.nach ? bahnhof.get(wahl.nach) : undefined} verzeichnis={verzeichnis} />
        <BahnhofFeld bezeichnung="Über (freiwillig)" wert={wahl.ueber} bahnhoefe={alle} name={name}
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
      </div>

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
                  <a href={streckenAdresse({ von: va.uic, nach: vb.uic, ueber: null })}
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
          {ergebnis.bahnhoefe.length > 1 ? 'liegen' : 'liegt'} nicht im Netz: Die Zugzahlen
          führen dort keinen Abschnitt mit Personenzügen.
        </p>
      )}

      {netz && ergebnis?.art === 'keinWeg' && (
        <p className="mt-6">Zwischen diesen Bahnhöfen findet sich im Netz kein Weg.</p>
      )}

      {netz && tunnel && bruecken && ergebnis?.art === 'weg' && (
        <Ergebnis netz={netz} weg={ergebnis.weg} tunnelIds={ergebnis.tunnel}
                  brueckenIds={ergebnis.bruecken} tunnel={tunnel} bruecken={bruecken}
                  bahnhof={bahnhof} alleBruecken={alleBruecken} verzeichnis={verzeichnis}
                  zeigeAlle={() => setAlleBruecken(true)} />
      )}
    </div>
  )
}

function Ergebnis({
  netz, weg, tunnelIds, brueckenIds, tunnel, bruecken, bahnhof, alleBruecken, verzeichnis, zeigeAlle,
}: {
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
  const [fahrt, setFahrt] = useState<{ fahrweg: Fahrweg; probe: boolean; piepen: () => void } | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [fahrtFehler, setFahrtFehler] = useState<string | null>(null)

  const objektText = useCallback(({ kennung, art }: FahrObjekt): ObjektText | undefined => {
    const x = art === 'tunnel' ? tunnelNach.get(kennung) : undefined
    if (x) {
      return { name: x.name, baueinheiten: null,
               zeile: `${x.laenge_m === null ? 'Länge: keine Angabe' : `${genau(x.laenge_m)} m`} · Linie ${x.linie}` }
    }
    const y = art === 'bruecke' ? brueckenNach.get(kennung) : undefined
    if (!y) return undefined
    return { name: y.name, baueinheiten: y.baueinheiten,
             zeile: `Linie ${y.linie}${y.baueinheiten === null ? ''
               : ` · ${y.baueinheiten} ${y.baueinheiten === 1 ? 'Baueinheit' : 'Baueinheiten'}`}` }
  }, [tunnelNach, brueckenNach])

  async function fahrtStarten(probe: boolean) {
    // der Ton muss im Tipp selbst vorbereitet werden, sonst bleibt er stumm
    const piepen = tonVorbereiten()
    setLaedt(true)
    setFahrtFehler(null)
    try {
      const linien = geometrieLesen(await geometrieLaden())
      const fahrweg = fahrwegBauen(netz, linien, weg.punkte, weg.abschnitte,
                                   (id) => brueckenNach.get(id)?.km ?? undefined,
                                   (id) => tunnelNach.get(id)?.laenge_m ?? null)
      setFahrt({ fahrweg, probe, piepen })
    } catch (e) {
      setFahrtFehler((e as Error).message)
    } finally {
      setLaedt(false)
    }
  }
  // mit Kennung, damit jede Zeile zu ihrem Eintrag in der Liste der Linie führt
  const t = tunnelIds.flatMap((i) => { const x = tunnelNach.get(i); return x ? [{ ...x, id: i }] : [] })
  const b = brueckenIds.flatMap((i) => { const x = brueckenNach.get(i); return x ? [{ ...x, id: i }] : [] })

  // Betriebspunkte des Wegs, die Bahnhöfe in Taktland sind
  const uicVon = useMemo(() => new Map(Object.entries(netz.bahnhoefe).map(([u, abk]) => [abk, Number(u)])),
                         [netz])
  const bahnhoefe = weg.punkte.map((p) => bahnhof.get(uicVon.get(p) ?? 0)).filter((x) => x !== undefined)
  const grosse = bahnhoefe.slice(1, -1).filter((x) => x.tier === 'L')

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
        + `Infrastruktur der ${bahnen.join(' und ')}, etwa ${beispiele(andere)}. Tunnel und Brücken `
        + 'sind nur für die SBB erfasst, dort fehlen sie in der Zählung.',
      quelle: 'zugzahlen',
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
        + 'nennt Taktland darum nicht.',
      quelle: 'linienkilometrierung',
    },
  ]

  return (
    <>
      <section className="mt-8">
        <h2 className="text-xl font-bold tracking-tight">
          {bahnhoefe[0]?.name} → {bahnhoefe[bahnhoefe.length - 1]?.name}
        </h2>
        {grosse.length > 0 && (
          <p className="mt-1 leading-relaxed">über {grosse.map((x) => x.name).join(', ')}</p>
        )}
        <details className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
          <summary className="cursor-pointer underline underline-offset-2">
            Alle {weg.punkte.length} Betriebspunkte des Wegs
          </summary>
          <p className="mt-2 leading-relaxed text-sbb-black dark:text-sbb-white">
            {weg.punkte.map((p) => netz.punkte[p] ?? p).join(' · ')}
          </p>
        </details>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Kachel zahl={t.length} text="Tunnel" />
          <Kachel zahl={b.length} text={b.length === 1 ? 'Brücke' : 'Brücken'} />
        </div>
        <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
          Erfasst entlang dieses Wegs, jede nur einmal gezählt.
          {andere.length > 0 && ' Auf Strecken anderer Bahnen fehlen sie, siehe unten.'}
        </p>

        {weg.abschnitte.length > 0 && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button" disabled={laedt} onClick={() => void fahrtStarten(false)}
                className="bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125
                           disabled:opacity-60"
              >
                Fahrtmodus starten
              </button>
              <button
                type="button" disabled={laedt} onClick={() => void fahrtStarten(true)}
                className="border border-sbb-cloud bg-white px-4 py-3 font-medium hover:border-sbb-black
                           disabled:opacity-60 dark:border-sbb-iron dark:bg-sbb-midnight
                           dark:hover:border-sbb-white"
              >
                Probefahrt
              </button>
            </div>
            <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
              Im Zug zeigt der Fahrtmodus den nächsten Tunnel und die nächste grössere Brücke und
              meldet sie etwa 30 Sekunden vorher mit einem Ton. Er braucht den Standort; dieser
              bleibt auf dem Gerät. Die Probefahrt spielt den Weg zum Ausprobieren ab.
            </p>
            {laedt && <p className="mt-2 text-sm">Die Lage der Linien wird geladen …</p>}
            {fahrtFehler && <p className="mt-2 text-sm">Der Fahrtmodus konnte nicht starten. {fahrtFehler}</p>}
          </>
        )}
      </section>

      {fahrt && (
        <Fahrtmodus fahrweg={fahrt.fahrweg} text={objektText} probefahrt={fahrt.probe}
                    piepen={fahrt.piepen} beenden={() => setFahrt(null)}
                    titel={`${bahnhoefe[0]?.name} → ${bahnhoefe[bahnhoefe.length - 1]?.name}`} />
      )}

      <aside className="mt-6 border-l-4 border-sbb-red bg-sbb-milk px-4 py-3 dark:bg-sbb-charcoal">
        <p className="text-xs font-semibold uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">
          Zum Verständnis
        </p>
        <p className="mt-1 text-sm text-sbb-black dark:text-sbb-white">
          Taktland sucht den kürzesten Weg über die Abschnitte, auf denen laut den Zugzahlen
          {' '}{netz.zugzahlen_jahr} Personenzüge fahren. Abschnitte mit wenigen Zügen zählen dabei
          als länger, und jeder Betriebspunkt unterwegs kostet etwas, damit der Weg den stark
          befahrenen, durchgehenden Strecken folgt. Als Brücke gilt jedes
          Bauwerk im Brückenverzeichnis, auch ein kleines: Eine Brücke bis zwei Meter heisst
          Durchlass. Ein Tunnel zählt, sobald der Weg ihn berührt, auch einer, in dem der
          Start- oder Zielbahnhof liegt (in Zürich HB etwa der Tunnel Bahnhof Museumstrasse).
        </p>
      </aside>

      <WegLinien laeufe={laeufe(weg)} netz={netz} verzeichnis={verzeichnis} />

      {t.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Tunnel in Wegrichtung</h2>
          <ol className="mt-3 divide-y divide-sbb-cloud border border-sbb-cloud bg-white
                         dark:divide-sbb-iron dark:border-sbb-iron dark:bg-sbb-midnight">
            {t.map((x) => (
              <Zeile key={x.id} name={x.name} linie={x.linie} liste="tunnel" stelle={x.id}
                     seite={tunnel.linien[String(x.linie)]?.seite ?? false} teile={[
                       x.laenge_m === null ? 'Länge: keine Angabe' : `${genau(x.laenge_m)} m`,
                       x.inbetriebnahme_jahr === null ? 'Jahr: keine Angabe'
                         : `erstmals in Betrieb ${x.inbetriebnahme_jahr}`,
                     ]} />
            ))}
          </ol>
        </section>
      )}

      {b.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Brücken in Wegrichtung</h2>
          <ol className="mt-3 divide-y divide-sbb-cloud border border-sbb-cloud bg-white
                         dark:divide-sbb-iron dark:border-sbb-iron dark:bg-sbb-midnight">
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
              className="mt-3 w-full border border-sbb-cloud bg-white px-4 py-3 font-medium
                         hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight
                         dark:hover:border-sbb-white"
            >
              Alle {b.length.toLocaleString('de-CH')} Brücken anzeigen
            </button>
          )}
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
      <ol className="mt-3 divide-y divide-sbb-cloud border border-sbb-cloud bg-white
                     dark:divide-sbb-iron dark:border-sbb-iron dark:bg-sbb-midnight">
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
                  ? <a href={`#/linie/${l.linie}`} className="underline-offset-2 hover:underline">{titel} →</a>
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
                   className="block border border-sbb-cloud bg-white px-2 py-0.5 text-sm font-medium
                              text-sbb-black hover:border-sbb-black dark:border-sbb-iron
                              dark:bg-sbb-midnight dark:text-sbb-white dark:hover:border-sbb-white">
                  Linie {nr} →
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

function Kachel({ zahl, text }: { zahl: number; text: string }) {
  return (
    <div className="border border-sbb-cloud bg-white px-4 py-3 dark:border-sbb-iron dark:bg-sbb-midnight">
      <p className="text-3xl font-bold tabular-nums text-sbb-black dark:text-sbb-white">
        {zahl.toLocaleString('de-CH')}
      </p>
      <p className="text-sm text-sbb-metal dark:text-sbb-storm">{text}</p>
    </div>
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
               className="underline-offset-2 hover:underline">{name}</a>
          : name}
      </p>
      <p className="text-sm text-sbb-metal dark:text-sbb-storm">
        {seite
          ? <a href={`#/linie/${linie}`} className="underline underline-offset-2 hover:text-sbb-black
                                                   dark:hover:text-sbb-white">Linie {linie}</a>
          : `Linie ${linie}`}
        {' · '}{teile.join(' · ')}
      </p>
    </li>
  )
}

/**
 * Ein Feld, in das man einen Bahnhof tippt. Darunter stehen passende Bahnhöfe
 * zur Wahl, die mit dem Namensanfang zuerst. Enter nimmt den ersten.
 */
function BahnhofFeld({ bezeichnung, wert, bahnhoefe, name, aendern }: {
  bezeichnung: string
  wert: number | null
  bahnhoefe: IndexEintrag[]
  name: (uic: number | null) => string
  aendern: (uic: number | null) => void
}) {
  const [text, setText] = useState(name(wert))
  const [offen, setOffen] = useState(false)
  useEffect(() => { setText(name(wert)) }, [wert, name])

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
            className="w-full border border-sbb-cloud bg-white px-4 py-3 text-lg text-sbb-black
                       placeholder:text-sbb-metal dark:border-sbb-iron dark:bg-sbb-midnight
                       dark:text-sbb-white"
          />
          {wert && (
            <button type="button" onClick={() => { setText(''); aendern(null) }}
                    aria-label={`${bezeichnung} leeren`}
                    className="shrink-0 border border-l-0 border-sbb-cloud px-3 text-sbb-metal
                               hover:text-sbb-black dark:border-sbb-iron dark:hover:text-sbb-white">
              ×
            </button>
          )}
        </span>
      </label>
      {offen && vorschlaege.length > 0 && (
        <ul className="absolute z-10 mt-px w-full border border-sbb-cloud bg-white shadow-sm
                       dark:border-sbb-iron dark:bg-sbb-midnight">
          {vorschlaege.map((e) => (
            <li key={e.uic}>
              <button
                type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => nehmen(e)}
                className="flex w-full justify-between gap-3 px-4 py-2 text-left hover:bg-sbb-milk
                           dark:hover:bg-sbb-charcoal"
              >
                <span className="text-sbb-black dark:text-sbb-white">{e.name}</span>
                <span className="text-sm text-sbb-metal dark:text-sbb-storm">
                  {e.kanton ? kantonText(e.kanton) : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
