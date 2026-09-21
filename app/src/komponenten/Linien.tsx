import { useEffect, useMemo, useState } from 'react'
import { linienLaden } from '../daten'
import type { LinienEintrag, LinienVerzeichnis } from '../typen'

/** Übersicht der Linien mit eigener Seite, nach Nummer geordnet. */
export function Linien({ zurueck }: { zurueck: () => void }) {
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
      <button
        type="button" onClick={zurueck}
        className="mt-6 text-sm text-sbb-metal hover:text-sbb-black dark:text-sbb-storm
                   dark:hover:text-sbb-white"
      >← Alle Bahnhöfe</button>

      <h1 className="mt-4 text-2xl font-bold tracking-tight">Linien</h1>
      <p className="mt-2 leading-relaxed">
        Strecken der Infrastruktur mit ihrer Nummer, etwa Linie 600. Das sind keine Zuglinien
        wie eine S-Bahn: Der Fahrplan ist nicht Teil der Daten.
      </p>
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Aufgenommen sind Linien mit mindestens zwei Bahnhöfen in Taktland oder mit einem
        erfassten Tunnel.
      </p>

      {fehler && <p className="mt-6">Die Linien konnten nicht geladen werden. {fehler}</p>}
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

function Eintrag({ l }: { l: LinienEintrag }) {
  const teile = [
    l.bahnhoefe === 0 ? 'kein Bahnhof in Taktland'
      : l.bahnhoefe === 1 ? '1 Bahnhof' : `${l.bahnhoefe} Bahnhöfe`,
    ...(l.tunnel > 0 ? [`${l.tunnel} Tunnel`] : []),
    ...(l.bruecken > 0 ? [`${l.bruecken} ${l.bruecken === 1 ? 'Brücke' : 'Brücken'}`] : []),
  ]
  return (
    <li>
      <a href={`#/linie/${l.linie}`}
         className="flex items-center justify-between gap-3 border border-sbb-cloud bg-white
                    px-4 py-3 hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight
                    dark:hover:border-sbb-white">
        <span className="min-w-0">
          <span className="block font-medium text-sbb-black dark:text-sbb-white">
            Linie {l.linie}
          </span>
          <span className="block truncate text-sm text-sbb-black dark:text-sbb-white">{l.name}</span>
          <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{teile.join(' · ')}</span>
        </span>
        <span className="shrink-0 text-sbb-metal dark:text-sbb-storm" aria-hidden="true">→</span>
      </a>
    </li>
  )
}
