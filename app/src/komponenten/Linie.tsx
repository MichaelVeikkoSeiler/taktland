import { useEffect, useState } from 'react'
import { linienLaden, linienProfilLaden } from '../daten'
import { linienAntwortSpeichern, linienAntwortenLesen, linieZuruecksetzen } from '../fortschritt'
import { listenAdresse } from '../listen'
import type { LinienEintrag, LinienProfil } from '../typen'
import { KapitelBlock, Quellen, Rahmen } from './Bahnhof'
import { ObjektKarte } from './Karte'
import { Luecken } from './Luecken'
import { Ladefehler } from './Ladefehler'
import { BahnKuerzel } from './Suche'

/** Eine Linienseite. Aufbau wie beim Bahnhof: Kapitel, Fragen, Lücken, Quellen. */
export function Linie({ nr, zurueck, zurueckText }: {
  nr: number
  zurueck: () => void
  /** «Alle Linien», oder «Alle Tunnel», wenn die Linie von dort geöffnet wurde */
  zurueckText: string
}) {
  const [profil, setProfil] = useState<LinienProfil | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [antworten, setAntworten] = useState<Record<string, { richtig: boolean }>>(
    () => linienAntwortenLesen(nr))
  // Bahn und Herkunft aus dem Verzeichnis; fehlt es, fehlt nur das Kürzel
  const [eintrag, setEintrag] = useState<LinienEintrag | null>(null)

  useEffect(() => {
    let abgebrochen = false
    linienLaden()
      .then((v) => { if (!abgebrochen) setEintrag(v.linien.find((l) => l.linie === nr) ?? null) })
      .catch(() => {})
    return () => { abgebrochen = true }
  }, [nr])

  useEffect(() => {
    let abgebrochen = false
    linienProfilLaden(nr)
      .then((p) => { if (!abgebrochen) { setProfil(p); setFehler(null) } })
      .catch((e: Error) => { if (!abgebrochen) setFehler(e.message) })
    return () => { abgebrochen = true }
  }, [nr])

  if (fehler) {
    return (
      <Rahmen zurueck={zurueck} zurueckText={zurueckText}>
        <Ladefehler className="px-4 text-sbb-black dark:text-sbb-white"
                    was="Diese Linie konnte nicht geladen werden." fehler={fehler} />
      </Rahmen>
    )
  }
  if (!profil || profil.linie !== nr) {
    return (
      <Rahmen zurueck={zurueck} zurueckText={zurueckText}>
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
    <Rahmen zurueck={zurueck} zurueckText={zurueckText}>
      <header className="px-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-sbb-black dark:text-sbb-white">
          Linie {profil.linie}
          {eintrag?.bahn && <BahnKuerzel isb={eintrag.bahn} titel={`Datenherr laut BAV: ${eintrag.bahn}`} />}
        </h1>
        <p className="mt-1 text-sbb-black dark:text-sbb-white">{profil.name}</p>
        {eintrag?.quelle === 'schienennetz' && (
          <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
            Linie einer anderen Bahn, aus dem Schienennetz des BAV (Stand 2021). Tunnel, Brücken
            und Bahnübergänge sind dafür nicht erfasst.
          </p>
        )}
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

      {/* die Linie im Netz, mit ihren Bahnhöfen und Tunneln */}
      <div className="px-4">
        <ObjektKarte art="tunnel" linie={nr} markiert={null}
                     objekte={(profil.listen?.tunnel ?? []).map((t, i) => ({
                       kennung: `${nr}:${i}`, name: t.name, km: t.km }))}
                     bahnhoefe={profil.chapters.flatMap((k) => k.facts ?? [])
                       .filter((f) => f.uic && typeof f.value === 'number')
                       .map((f) => ({ name: f.label, km: f.value as number, uic: f.uic }))}
                     waehlen={(kennung) => {
                       window.location.hash = listenAdresse(nr, 'tunnel', null, Number(kennung.split(':')[1]))
                     }}
                     bahnhofOeffnen={(uic) => { window.location.hash = `#/bahnhof/${uic}` }} />
      </div>

      <div className="px-4">
        {profil.chapters.map((k) => (
          <KapitelBlock key={k.id} kapitel={k} antworten={antworten} merken={merken}
                        verweis={(f) => (f.liste && profil.listen?.[f.liste]
                          ? listenAdresse(nr, f.liste, f.filter, f.eintrag) : undefined)} />
        ))}
        <Luecken luecken={profil.luecken} />
        <Quellen profil={profil} />
      </div>
    </Rahmen>
  )
}
