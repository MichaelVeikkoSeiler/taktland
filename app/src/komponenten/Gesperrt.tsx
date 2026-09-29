import { useState } from 'react'
import { sicherungHerunterladen } from '../sicherung'
import type { Sperre } from '../verfuegbar'

/** Was bleibt, wenn Taktland nicht mehr verfügbar ist: ein Hinweis und die eigenen Daten als Datei */
export function Gesperrt({ sperre }: { sperre: Sperre }) {
  const [geladen, setGeladen] = useState(false)
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <img src="./logo.svg" alt="" className="size-16" />
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Taktland ist nicht mehr verfügbar</h1>
      {sperre.meldung && <p className="mt-3 leading-relaxed">{sperre.meldung}</p>}
      <p className="mt-3 leading-relaxed">
        Dein Logbuch, dein Sammelheft und deine Favoriten liegen noch auf diesem Gerät. Du kannst sie
        als Datei herunterladen und aufbewahren.
      </p>
      <button type="button" onClick={() => { sicherungHerunterladen(); setGeladen(true) }}
              className="mt-5 rounded-lg bg-sbb-red px-4 py-3 font-bold text-white hover:bg-sbb-red125">
        Meine Daten herunterladen
      </button>
      {geladen && <p className="mt-2 text-sm" role="status">Heruntergeladen.</p>}
    </main>
  )
}
