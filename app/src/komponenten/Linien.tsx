import { useEffect, useMemo, useState } from 'react'
import { linienLaden } from '../daten'
import type { BahnhofIndex, LinienEintrag, LinienVerzeichnis } from '../typen'
import { vereinfachen } from './Blaettern'
import { BahnKuerzel } from './Suche'
import { StreckeKarte } from './StreckeKarte'
import { Ladefehler } from './Ladefehler'

/** Höchstens so viele Bahnhofsnamen stehen bei einer Linie, dann «und N weitere» */
const NAMEN_JE_LINIE = 3

/**
 * Der Bereich «Strecken»: die Linien mit eigener Seite, nach Nummer geordnet.
 * Die Suche findet Nummer und Name der Linie und, über die Bahnhöfe, jede
 * Linie, auf der ein passender Bahnhof liegt (Müntschemier: Linie 220).
 */
export function Linien({ index }: { index: BahnhofIndex | null }) {
  const [daten, setDaten] = useState<LinienVerzeichnis | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [begriff, setBegriff] = useState('')

  useEffect(() => {
    linienLaden().then(setDaten).catch((e: Error) => setFehler(e.message))
  }, [])

  const treffer = useMemo((): Array<{ l: LinienEintrag; durch: string[] }> => {
    if (!daten) return []
    const b = vereinfachen(begriff.trim())
    if (!b) return daten.linien.map((l) => ({ l, durch: [] }))
    // Bahnhöfe, deren Name passt, und die Linien, auf denen sie liegen
    const durch = new Map<number, string[]>()
    for (const e of index?.bahnhoefe ?? []) {
      if (!vereinfachen(e.name).includes(b)) continue
      for (const nr of daten.nach_bahnhof[String(e.uic)] ?? []) {
        durch.set(nr, [...(durch.get(nr) ?? []), e.name])
      }
    }
    return daten.linien
      .filter((l) => String(l.linie).startsWith(b) || vereinfachen(l.name).includes(b) || durch.has(l.linie))
      .map((l) => ({ l, durch: (durch.get(l.linie) ?? []).sort((x, y) => x.localeCompare(y, 'de-CH')) }))
  }, [daten, begriff, index])

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Strecken</h1>
      <p className="mt-2 leading-relaxed">
        Die Strecken der Infrastruktur, jede unter ihrer Liniennummer, etwa Linie 600. Das sind
        keine Zuglinien wie eine S-Bahn: Der Fahrplan ist nicht Teil der Daten.
      </p>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Aufgenommen sind Linien mit mindestens zwei Bahnhöfen in Taktland oder mit einem
        erfassten Tunnel. Linien anderer Bahnen stammen aus dem Schienennetz des Bundesamts für
        Verkehr (BAV, Stand 2021) und tragen das Kürzel ihrer Bahn, wie es dort steht; Tramlinien
        sind nicht dabei.
        {daten?.nicht_aufgefuehrt && <NichtAufgefuehrt n={daten.nicht_aufgefuehrt} />}
      </p>
      <StreckeKarte />

      {fehler && <Ladefehler className="mt-6" was="Die Linien konnten nicht geladen werden." fehler={fehler} />}
      {!daten && !fehler && <p className="mt-6 text-sbb-metal">Wird geladen …</p>}

      {daten && (
        <>
          <label className="mt-6 block">
            <span className="sr-only">Linie suchen</span>
            <input
              type="search" value={begriff} onChange={(e) => setBegriff(e.target.value)}
              placeholder="Nummer, Name oder Bahnhof"
              className="w-full border border-sbb-cloud bg-white px-4 py-3 text-lg text-sbb-black
                         placeholder:text-sbb-metal focus:border-sbb-black focus:outline-none
                         dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white
                         dark:focus:border-sbb-white"
            />
          </label>
          <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
            {begriff ? `${treffer.length} von ${daten.linien.length} Linien` : `${daten.linien.length} Linien`}
          </p>
          <ul className="mt-3 space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
            {treffer.map(({ l, durch }) => <Eintrag key={l.linie} l={l} durch={durch} />)}
          </ul>
        </>
      )}
    </div>
  )
}

/** Was ohne eigene Seite bleibt, gezählt in pipeline/build_linien.py. Die
 *  Brücken darauf stehen in der Übersicht aller Brücken. */
function NichtAufgefuehrt({ n }: { n: NonNullable<LinienVerzeichnis['nicht_aufgefuehrt']> }) {
  const teile = [
    ...(n.bruecken > 0 ? [`${n.bruecken} ${n.bruecken === 1 ? 'Brücke' : 'Brücken'}`] : []),
    ...(n.bahnuebergaenge > 0
      ? [`${n.bahnuebergaenge} ${n.bahnuebergaenge === 1 ? 'Bahnübergang' : 'Bahnübergängen'}`] : []),
  ]
  if (!teile.length) return null
  return (
    <> Ohne eigene Seite {n.linien === 1 ? 'bleibt 1 weitere Linie' : `bleiben ${n.linien} weitere Linien`}{' '}
      mit {teile.join(' und ')}: {n.linien === 1 ? 'Sie hat' : 'Sie haben'} weniger als zwei
      Bahnhöfe in Taktland und keinen Tunnel.
      {n.bruecken > 0 && <> {n.bruecken === 1 ? 'Die Brücke steht' : 'Die Brücken stehen'} trotzdem
        unter{' '}
        <a href="#/bruecken" className="underline underline-offset-2 hover:text-sbb-black
                                        dark:hover:text-sbb-white">Brücken</a>.</>}</>
  )
}

function Eintrag({ l, durch }: { l: LinienEintrag; durch: string[] }) {
  const teile = [
    l.bahnhoefe === 0 ? 'kein Bahnhof in Taktland'
      : l.bahnhoefe === 1 ? '1 Bahnhof' : `${l.bahnhoefe} Bahnhöfe`,
    ...(l.weitere_bahnhoefe ? [`${l.weitere_bahnhoefe} weitere laut BAV`] : []),
    ...(l.tunnel > 0 ? [`${l.tunnel} Tunnel`] : []),
    ...(l.bruecken > 0 ? [`${l.bruecken} ${l.bruecken === 1 ? 'Brücke' : 'Brücken'}`] : []),
    ...(l.bahnuebergaenge > 0
      ? [`${l.bahnuebergaenge} ${l.bahnuebergaenge === 1 ? 'Bahnübergang' : 'Bahnübergänge'}`] : []),
  ]
  return (
    <li>
      <a href={`#/linie/${l.linie}`}
         className="flex items-center justify-between gap-3 kachel kachel-link px-4 py-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-medium text-sbb-black dark:text-sbb-white">
            Linie {l.linie}
            {l.bahn && <BahnKuerzel isb={l.bahn} />}
          </span>
          <span className="block truncate text-sm text-sbb-black dark:text-sbb-white">{l.name}</span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{teile.join(' · ')}</span>
          {durch.length > 0 && (
            <span className="block text-sm text-sbb-black dark:text-sbb-white">
              durch {durch.slice(0, NAMEN_JE_LINIE).join(', ')}
              {durch.length > NAMEN_JE_LINIE && ` und ${durch.length - NAMEN_JE_LINIE} weitere`}
            </span>
          )}
        </span>
        <span className="pfeil shrink-0" aria-hidden="true">→</span>
      </a>
    </li>
  )
}
