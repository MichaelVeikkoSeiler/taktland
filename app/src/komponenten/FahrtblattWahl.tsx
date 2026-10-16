import { useCallback, useMemo, useState } from 'react'
import { fahrtZiele, namenFuerFahrt } from '../daten'
import type { BahnhofIndex } from '../typen'
import { BahnenWahl } from './BahnenWahl'
import { BahnhofFeld, type StreckenWahl } from './Strecke'

/** Das Fahrtblatt zum Ausdrucken wählen (Michael, 2026-09-26; seit 2026-10-16 der vierte Reiter der Reisetasche, vorher
 *  unter Fahren) */
export function FahrtblattWahl({ index }: { index: BahnhofIndex | null }) {
  const [blatt, setBlatt] = useState<StreckenWahl>({ von: null, nach: null, ueber: null })
  const bereit = blatt.von !== null && blatt.nach !== null && blatt.von !== blatt.nach
  const bahnhof = useMemo(() => new Map((index?.bahnhoefe ?? []).map((b) => [b.uic, b])), [index])
  const zielNamen = useMemo(() => namenFuerFahrt(index), [index])
  const name = useCallback((uic: number | null) => (uic ? bahnhof.get(uic)?.name ?? zielNamen.get(uic) ?? String(uic) : ''),
                           [bahnhof, zielNamen])
  const imNetz = useMemo(() => fahrtZiele(index), [index])
  return (
    <section className="px-4 pb-4">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Fahrtblatt</h1>
      <p className="mt-2 leading-relaxed">
        Ein Blatt A4 zum Ausdrucken für die Fahrt mit Kindern: oben die Karte des Wegs, unten die
        ausgewählte Tunnel, Brücken, Bahnhöfe, Gipfel und Seen zum Abhaken.
      </p>
      {index && (
        <div className="mt-4 space-y-3">
          <BahnhofFeld bezeichnung="Von" wert={blatt.von} bahnhoefe={imNetz} name={name}
                       aendern={(u) => setBlatt((w) => ({ ...w, von: u }))} />
          <BahnhofFeld bezeichnung="Nach" wert={blatt.nach} bahnhoefe={imNetz} name={name}
                       aendern={(u) => setBlatt((w) => ({ ...w, nach: u }))} />
          <BahnhofFeld bezeichnung="Über (optional)" wert={blatt.ueber} bahnhoefe={imNetz} name={name}
                       aendern={(u) => setBlatt((w) => ({ ...w, ueber: u }))} />
          <BahnenWahl />
          <button type="button" disabled={!bereit}
                  onClick={() => {
                    window.location.hash = `#/fahrtblatt?von=${blatt.von}&nach=${blatt.nach}${blatt.ueber ? `&ueber=${blatt.ueber}` : ''}`
                  }}
                  className="w-full rounded-lg bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40">
            Fahrtblatt erstellen
          </button>
          {blatt.von !== null && blatt.von === blatt.nach && (
            <p className="text-sm">Start und Ziel sind derselbe Bahnhof.</p>
          )}
        </div>
      )}
    </section>
  )
}
