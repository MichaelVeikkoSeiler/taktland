import { useEffect, useMemo, useState } from 'react'
import { linienLaden } from '../daten'
import type { LinienEintrag, LinienVerzeichnis } from '../typen'
import { BahnKuerzel } from './Suche'
import { StreckeKarte } from './StreckeKarte'
import { Ladefehler } from './Ladefehler'

/** Übersicht der Linien mit eigener Seite, nach Nummer geordnet. */
export function Linien() {
  const [daten, setDaten] = useState<LinienVerzeichnis | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [begriff, setBegriff] = useState('')

  useEffect(() => {
    linienLaden().then(setDaten).catch((e: Error) => setFehler(e.message))
  }, [])

  const treffer = useMemo(() => {
    if (!daten) return []
    const b = begriff.trim().toLowerCase()
    return b
      ? daten.linien.filter((l) => String(l.linie).startsWith(b) || l.name.toLowerCase().includes(b))
      : daten.linien
  }, [daten, begriff])

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Linien</h1>
      <p className="mt-2 leading-relaxed">
        Strecken der Infrastruktur mit ihrer Nummer, etwa Linie 600. Das sind keine Zuglinien
        wie eine S-Bahn: Der Fahrplan ist nicht Teil der Daten.
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
              placeholder="Nummer oder Name"
              className="w-full border border-sbb-cloud bg-white px-4 py-3 text-lg text-sbb-black
                         placeholder:text-sbb-metal focus:border-sbb-black focus:outline-none
                         dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white
                         dark:focus:border-sbb-white"
            />
          </label>
          <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
            {begriff ? `${treffer.length} von ${daten.linien.length} Linien` : `${daten.linien.length} Linien`}
          </p>
          <ul className="mt-3 space-y-2">
            {treffer.map((l) => <Eintrag key={l.linie} l={l} />)}
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

function Eintrag({ l }: { l: LinienEintrag }) {
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
         className="flex items-center justify-between gap-3 border border-sbb-cloud bg-white
                    px-4 py-3 hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight
                    dark:hover:border-sbb-white">
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-medium text-sbb-black dark:text-sbb-white">
            Linie {l.linie}
            {l.bahn && <BahnKuerzel isb={l.bahn} />}
          </span>
          <span className="block truncate text-sm text-sbb-black dark:text-sbb-white">{l.name}</span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{teile.join(' · ')}</span>
        </span>
        <span className="shrink-0 text-sbb-metal dark:text-sbb-storm" aria-hidden="true">→</span>
      </a>
    </li>
  )
}
