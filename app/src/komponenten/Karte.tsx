import { useEffect, useMemo, useState } from 'react'
import { linienLaden } from '../daten'
import type { IndexEintrag } from '../typen'
import {
  type Box, boxUm, KartenPlatz, lage, Netzkarte, pfad, punktBei, useKarte, zwischen,
} from './Netzkarte'

export {
  type Box, type Stueck, boxUm, lage, LAENGE_ZU_BREITE, lesen, Netzkarte, pfad, punktBei,
  useKarte, zwischen,
} from './Netzkarte'

/** Ein Linienausschnitt zeigt mindestens so viele Grad Breite (etwa 10 km) */
const MIN_SPANNE = 0.09
/** Ein Bahnhof zeigt so viel Umgebung (etwa 6 km breit) */
const UM_BAHNHOF = 0.054

export interface KartenObjekt {
  /** «Linie:Stelle» */
  kennung: string
  name: string
  /** Kilometer auf der Linie, wie in der Quelle */
  km: number | null
  /** zweiter Kilometer: Der Eintrag reicht von km bis bis, etwa ein Abschnitt */
  bis?: number | null
}

/** Die Linien mit eigener Seite: nur sie lassen sich auf der Karte antippen */
function useSeiten() {
  const [seiten, setSeiten] = useState<Set<number> | undefined>(undefined)
  useEffect(() => {
    let abgebrochen = false
    linienLaden()
      .then((v) => { if (!abgebrochen) setSeiten(new Set(v.linien.map((l) => l.linie))) })
      .catch(() => {})
    return () => { abgebrochen = true }
  }, [])
  return seiten
}

/**
 * Kleine Karte zu den Tunneln, Brücken oder Abschnitten einer Linie: grau das
 * Streckennetz der SBB, dunkel die Linie, rot ihre Einträge, der gewählte
 * grösser und beschriftet. Gezeichnet aus den Daten, ohne Kartenbilder eines
 * fremden Dienstes. Ein Tunnel liegt über seinem Bereich (karte.json), wo die
 * Richtung der Länge erfasst ist; eine Brücke hat keine Länge und ist ein Punkt.
 */
export function ObjektKarte({ art, linie, objekte, markiert, bahnhoefe = [], waehlen, bahnhofOeffnen }: {
  art: 'tunnel' | 'bruecken' | 'netz'
  linie: number
  objekte: KartenObjekt[]
  markiert: string | null
  /** Auf der Linienseite: die Bahnhöfe aus Taktland mit ihrem Kilometer */
  bahnhoefe?: Array<{ name: string; km: number; uic?: number }>
  /** Ein Tipp auf einen Tunnel, eine Brücke oder einen Abschnitt wählt ihn aus */
  waehlen?: (kennung: string) => void
  /** Ein Tipp auf einen Bahnhof öffnet seine Seite */
  bahnhofOeffnen?: (uic: number) => void
}) {
  const { daten, linien, fehler } = useKarte()
  const seiten = useSeiten()
  const eigene = useMemo(() => linien?.get(linie) ?? [], [linien, linie])
  const alle = useMemo(() => [...(linien?.values() ?? [])].flat(), [linien])
  const start = useMemo(() => boxUm(eigene.length ? eigene : alle, MIN_SPANNE), [eigene, alle])
  const schweiz = useMemo(() => boxUm(alle, MIN_SPANNE), [alle])

  if (fehler) return null
  if (!daten || !linien) return <KartenPlatz />

  const bereiche = objekte
    .map((o) => ({ ...o, bereich: art === 'tunnel' ? daten.tunnel[o.kennung]
      : o.km === null ? undefined : [o.km, o.bis ?? o.km] as [number, number] }))
    .filter((o): o is typeof o & { bereich: [number, number] } => o.bereich !== undefined)
  const gewaehlt = bereiche.find((t) => t.kennung === markiert)
  const stationen = [...bahnhoefe].sort((a, b) => a.km - b.km).flatMap((b) => {
    const p = punktBei(eigene, b.km)
    return p ? [{ name: b.name, uic: b.uic, x: p[0], y: p[1] }] : []
  })

  function zeichnen(px: number, box: Box) {
    const gewaehltPunkt = gewaehlt ? punktBei(eigene, gewaehlt.bereich[0]) : null
    const halbeBreite = gewaehlt ? gewaehlt.name.length * 3.4 * px : 0
    return (
      <>
        {bereiche.map((t) => {
          const [v, b] = t.bereich
          if (v !== b) {
            return <path key={t.kennung} d={pfad(zwischen(eigene, v, b))} fill="none"
                         className={`stroke-sbb-red ${waehlen ? 'cursor-pointer' : ''}`}
                         strokeWidth={t.kennung === markiert ? 6 : 4} vectorEffect="non-scaling-stroke"
                         strokeLinecap="round" onClick={waehlen ? () => waehlen(t.kennung) : undefined} />
          }
          const p = punktBei(eigene, v)
          // viele Brücken: kleinere Punkte, damit die Linie noch zu sehen ist
          const r = t.kennung === markiert ? 4 : art === 'bruecken' ? 1.8 : 2.5
          return p && <circle key={t.kennung} cx={p[0]} cy={p[1]} r={r * px} className="fill-sbb-red" />
        })}
        {waehlen && bereiche.map((t) => {
          const p = punktBei(eigene, t.bereich[0])
          return p && (
            <circle key={`w${t.kennung}`} cx={p[0]} cy={p[1]} r={8 * px} fill="transparent"
                    className="cursor-pointer" onClick={() => waehlen(t.kennung)}>
              <title>{t.name}</title>
            </circle>
          )
        })}
        {gewaehlt && gewaehltPunkt && (
          <g>
            <circle cx={gewaehltPunkt[0]} cy={gewaehltPunkt[1]} r={7 * px} fill="none"
                    className="stroke-sbb-red" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {/* mittig über dem Punkt, am Rand nach innen geschoben (geschätzte
                Textbreite), in der oberen Hälfte darunter */}
            <text x={Math.min(Math.max(gewaehltPunkt[0], box.cx - box.w / 2 + halbeBreite + 4 * px),
                              box.cx + box.w / 2 - halbeBreite - 4 * px)}
                  y={gewaehltPunkt[1] + (gewaehltPunkt[1] - (box.cy - box.w / 3.2) < 24 * px ? 22 : -12) * px}
                  fontSize={12 * px} textAnchor="middle" fontWeight="bold"
                  className="fill-sbb-black dark:fill-sbb-white">{gewaehlt.name}</text>
          </g>
        )}
      </>
    )
  }

  return (
    <Netzkarte
      daten={daten} linien={linien} start={start} hervor={new Set([linie])}
      presets={[{ text: `Linie ${linie}`, box: start }, { text: 'Ganze Schweiz', box: schweiz }]}
      punkte={stationen} zeichnen={zeichnen}
      seiten={seiten} linieOeffnen={(nr) => { window.location.hash = `#/linie/${nr}` }}
      bahnhofOeffnen={bahnhofOeffnen}
      titel={`Karte: Linie ${linie} im Streckennetz${gewaehlt ? `, markiert ${gewaehlt.name}` : ''}`}
      beschriftung={(
        <>
          Gezeichnet aus dem Streckennetz der SBB (linienkilometrierung), Linien anderer Bahnen aus
          dem Schienennetz des BAV, ohne Strassen, Orte und Grenzen.{' '}
          {stationen.length > 0 && 'Ringe: die Bahnhöfe dieser Linie in Taktland an ihrem Kilometer. '}
          {art === 'tunnel' && objekte.length > 0
            && 'Rot die Tunnel dieser Linie: als Strecke, wo die Daten die Richtung der Länge '
              + 'hergeben, sonst als Punkt beim erfassten Kilometer, dem Portal. '}
          {art === 'bruecken'
            && 'Rot die Brücken dieser Linie, je als Punkt bei ihrem Kilometer; eine Länge ist '
              + 'nicht erfasst. '}
          {art === 'netz'
            && 'Rot die Abschnitte dieser Liste, je von ihrem ersten bis zu ihrem letzten '
              + 'Kilometer laut Schienennetz des BAV. '}
          Ein Tipp auf einen Punkt oder eine Linie führt dorthin.
        </>
      )}
    />
  )
}

/**
 * Die Karte auf einer Bahnhofsseite: wo der Bahnhof im Netz liegt, mit den
 * Linien, auf denen er erfasst ist. Die Lage stammt aus seinen Fakten.
 */
export function BahnhofKarte({ eintrag, nachbarn = [] }: {
  eintrag: IndexEintrag
  /** weitere Bahnhöfe zur Orientierung, etwa die nächsten im Netz */
  nachbarn?: IndexEintrag[]
}) {
  const { daten, linien, fehler } = useKarte()
  const seiten = useSeiten()
  const [x, y] = eintrag.lat !== null && eintrag.lon !== null
    ? lage(eintrag.lat, eintrag.lon) : [0, 0]
  const start = useMemo<Box>(() => ({ cx: x, cy: y, w: UM_BAHNHOF }), [x, y])
  const weit = useMemo<Box>(() => ({ cx: x, cy: y, w: UM_BAHNHOF * 8 }), [x, y])

  if (fehler || eintrag.lat === null || eintrag.lon === null) return null
  if (!daten || !linien) return <KartenPlatz />

  const punkte = [
    { name: eintrag.name, x, y },
    ...nachbarn.flatMap((b) => (b.lat !== null && b.lon !== null
      ? [{ name: b.name, uic: b.uic, ...lageAls(b.lat, b.lon) }] : [])),
  ]

  return (
    <Netzkarte
      daten={daten} linien={linien} start={start} hervor={new Set(eintrag.linien ?? [])}
      presets={[{ text: 'Näher', box: start }, { text: 'Weiter', box: weit }]}
      punkte={punkte}
      zeichnen={(px) => (
        <circle cx={x} cy={y} r={5 * px} strokeWidth={2} vectorEffect="non-scaling-stroke"
                className="fill-sbb-red stroke-white dark:stroke-sbb-midnight" />
      )}
      seiten={seiten} linieOeffnen={(nr) => { window.location.hash = `#/linie/${nr}` }}
      bahnhofOeffnen={(uic) => { window.location.hash = `#/bahnhof/${uic}` }}
      titel={`Karte: ${eintrag.name} im Streckennetz`}
      beschriftung={(
        <>
          Gezeichnet aus dem Streckennetz der SBB (linienkilometrierung), Linien anderer Bahnen aus
          dem Schienennetz des BAV, ohne Strassen, Orte und Grenzen. Der rote Punkt ist{' '}
          {eintrag.name}, seine Lage stammt aus den Fakten
          {(eintrag.linien?.length ?? 0) > 0 && '; dunkel die Linien, auf denen er erfasst ist'}.
          Ein Tipp auf eine Linie öffnet ihre Seite.
        </>
      )}
    />
  )
}

function lageAls(lat: number, lon: number) {
  const [x, y] = lage(lat, lon)
  return { x, y }
}
