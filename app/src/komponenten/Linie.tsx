import { useEffect, useState } from 'react'
import { linienProfilLaden } from '../daten'
import { linienAntwortSpeichern, linienAntwortenLesen, linieZuruecksetzen } from '../fortschritt'
import { listenAdresse } from '../listen'
import type { LinienProfil } from '../typen'
import { KapitelBlock, Quellen, Rahmen } from './Bahnhof'
import { Luecken } from './Luecken'

/** Eine Linienseite. Aufbau wie beim Bahnhof: Kapitel, Fragen, Lücken, Quellen. */
export function Linie({ nr, zurueck }: { nr: number; zurueck: () => void }) {
  const [profil, setProfil] = useState<LinienProfil | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [antworten, setAntworten] = useState<Record<string, { richtig: boolean }>>(
    () => linienAntwortenLesen(nr))

  useEffect(() => {
    let abgebrochen = false
    linienProfilLaden(nr)
      .then((p) => { if (!abgebrochen) { setProfil(p); setFehler(null) } })
      .catch((e: Error) => { if (!abgebrochen) setFehler(e.message) })
    return () => { abgebrochen = true }
  }, [nr])

  if (fehler) {
    return (
      <Rahmen zurueck={zurueck} zurueckText="Alle Linien">
        <p className="px-4 text-sbb-black dark:text-sbb-white">
          Diese Linie konnte nicht geladen werden. {fehler}
        </p>
      </Rahmen>
    )
  }
  if (!profil || profil.linie !== nr) {
    return (
      <Rahmen zurueck={zurueck} zurueckText="Alle Linien">
        <p className="px-4 text-sbb-metal">Wird geladen …</p>
      </Rahmen>
    )
  }

  const fragenGesamt = profil.chapters.reduce((n, k) => n + k.questions.length, 0)
  const ids = new Set(profil.chapters.flatMap((k) => k.questions.map((q) => q.id)))
  const aktuelle = Object.entries(antworten).filter(([id]) => ids.has(id))
  const beantwortet = aktuelle.length
  const richtig = aktuelle.filter(([, a]) => a.richtig).length

  function merken(frageId: string, war: boolean) {
    linienAntwortSpeichern(nr, frageId, war)
    setAntworten((a) => ({ ...a, [frageId]: { richtig: war } }))
  }

  return (
    <Rahmen zurueck={zurueck} zurueckText="Alle Linien">
      <header className="px-4">
        <h1 className="text-2xl font-bold text-sbb-black dark:text-sbb-white">Linie {profil.linie}</h1>
        <p className="mt-1 text-sbb-black dark:text-sbb-white">{profil.name}</p>
        <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">{fragenGesamt} Fragen</p>
        {beantwortet > 0 && (
          <p className="mt-2 flex items-center gap-3 text-sm text-sbb-metal dark:text-sbb-storm">
            <span>{richtig} von {beantwortet} richtig</span>
            <button
              type="button"
              onClick={() => { linieZuruecksetzen(nr); setAntworten({}) }}
              className="underline underline-offset-2"
            >
              zurücksetzen
            </button>
          </p>
        )}
      </header>

      <div className="px-4">
        {profil.chapters.map((k) => (
          <KapitelBlock key={k.id} kapitel={k} antworten={antworten} merken={merken}
                        verweis={(f) => (f.liste && profil.listen?.[f.liste]
                          ? listenAdresse(nr, f.liste, f.filter) : undefined)} />
        ))}
        <Luecken luecken={profil.luecken} />
        <Quellen profil={profil} />
      </div>
    </Rahmen>
  )
}
