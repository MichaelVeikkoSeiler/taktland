import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Frage as FrageTyp, Gleis, MatchPaar, SortItem } from '../typen'
import { Gleisschema } from './Gleisschema'

interface Props {
  frage: FrageTyp
  beantwortet?: boolean
  /** Gleisdaten des Bahnhofs, für Fragen mit Schema */
  gleise?: Gleis[]
  onAntwort: (richtig: boolean) => void
}

/** Reihenfolge einmal festlegen, damit sie beim Tippen nicht springt. */
function mischen<T>(liste: T[]): T[] {
  const kopie = [...liste]
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[kopie[i], kopie[j]] = [kopie[j], kopie[i]]
  }
  return kopie
}

export function Frage({ frage, beantwortet, gleise, onAntwort }: Props) {
  const [gezeigt, setGezeigt] = useState(false)
  const [richtig, setRichtig] = useState(false)

  function abschliessen(war: boolean) {
    setRichtig(war)
    setGezeigt(true)
    onAntwort(war)
  }

  return (
    <div className="mt-4 border-l-2 border-sbb-red bg-sbb-milk px-4 py-4 dark:bg-sbb-charcoal">
      <p className="font-bold text-sbb-black dark:text-sbb-white">
        {frage.type === 'cloze'
          ? frage.prompt.replace('___', '＿＿＿')
          : frage.prompt}
        {beantwortet && !gezeigt && (
          <span className="ml-2 align-middle text-xs font-normal text-sbb-metal">
            schon beantwortet
          </span>
        )}
      </p>

      {(frage.type === 'single_choice' || frage.type === 'cloze') && (
        <Auswahl frage={frage} gezeigt={gezeigt} abschliessen={abschliessen} />
      )}
      {frage.type === 'multiple_choice' && (
        <Mehrfachauswahl frage={frage} gezeigt={gezeigt} abschliessen={abschliessen} />
      )}
      {frage.type === 'true_false' && (
        <WahrFalsch frage={frage} gezeigt={gezeigt} abschliessen={abschliessen} />
      )}
      {frage.type === 'slider' && (
        <Schieberegler frage={frage} gezeigt={gezeigt} abschliessen={abschliessen} />
      )}
      {frage.type === 'sort' && (
        <Sortieren items={frage.items ?? []} gezeigt={gezeigt} abschliessen={abschliessen} />
      )}
      {frage.type === 'hotspot' && (
        <Hotspot frage={frage} gleise={gleise ?? []} gezeigt={gezeigt}
                 abschliessen={abschliessen} />
      )}
      {frage.type === 'match' && (
        <Zuordnen pairs={frage.pairs ?? []} gezeigt={gezeigt} abschliessen={abschliessen} />
      )}

      {gezeigt && (
        <div className={`mt-4 border-l-2 px-3 py-2 text-sm ${
          richtig
            ? 'border-sbb-green bg-sbb-green-bg text-sbb-black dark:bg-sbb-green/15 dark:text-sbb-white'
            : 'border-sbb-red bg-sbb-white text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white'
        }`}>
          <p className="font-bold">{richtig ? 'Richtig' : 'Nicht ganz'}</p>
          {frage.explanation && <p className="mt-0.5">{frage.explanation}</p>}
          <p className="mt-1 text-xs text-sbb-metal">Beleg: {frage.factRef}</p>
        </div>
      )}
    </div>
  )
}

/* ---------- Einfachauswahl und Lückentext ---------- */

function Auswahl({ frage, gezeigt, abschliessen }: {
  frage: FrageTyp; gezeigt: boolean; abschliessen: (r: boolean) => void
}) {
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  return (
    <ul className="mt-3 space-y-2">
      {frage.options?.map((o, i) => (
        <li key={o}>
          <button
            type="button"
            disabled={gezeigt}
            onClick={() => { setGewaehlt(i); abschliessen(i === frage.correct) }}
            className={knopf(gezeigt, i === gewaehlt, i === frage.correct)}
          >
            {o}
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ---------- Mehrfachauswahl ---------- */

function Mehrfachauswahl({ frage, gezeigt, abschliessen }: {
  frage: FrageTyp; gezeigt: boolean; abschliessen: (r: boolean) => void
}) {
  const [gewaehlt, setGewaehlt] = useState<number[]>([])
  const loesung = (Array.isArray(frage.correct) ? frage.correct : []) as number[]

  function umschalten(i: number) {
    setGewaehlt((g) => (g.includes(i) ? g.filter((x) => x !== i) : [...g, i]))
  }

  return (
    <>
      <p className="mt-1 text-sm text-sbb-metal">Mehrere Antworten möglich.</p>
      <ul className="mt-2 space-y-2">
        {frage.options?.map((o, i) => (
          <li key={o}>
            <button
              type="button"
              disabled={gezeigt}
              onClick={() => umschalten(i)}
              className={knopf(gezeigt, gewaehlt.includes(i), loesung.includes(i))}
            >
              <span className="mr-2 inline-block w-4 font-bold">
                {gewaehlt.includes(i) ? '×' : ''}
              </span>
              {o}
            </button>
          </li>
        ))}
      </ul>
      {!gezeigt && (
        <button
          type="button"
          disabled={gewaehlt.length === 0}
          onClick={() => abschliessen(
            gewaehlt.length === loesung.length && gewaehlt.every((i) => loesung.includes(i)),
          )}
          className={pruefKnopf(gewaehlt.length === 0)}
        >
          Antwort prüfen
        </button>
      )}
    </>
  )
}

/* ---------- Wahr oder falsch ---------- */

function WahrFalsch({ frage, gezeigt, abschliessen }: {
  frage: FrageTyp; gezeigt: boolean; abschliessen: (r: boolean) => void
}) {
  const [gewaehlt, setGewaehlt] = useState<boolean | null>(null)
  return (
    <div className="mt-3 flex gap-2">
      {[true, false].map((w) => (
        <button
          key={String(w)}
          type="button"
          disabled={gezeigt}
          onClick={() => { setGewaehlt(w); abschliessen(w === frage.correct) }}
          className={`flex-1 ${knopf(gezeigt, w === gewaehlt, w === frage.correct)}`}
        >
          {w ? 'Stimmt' : 'Stimmt nicht'}
        </button>
      ))}
    </div>
  )
}

/* ---------- Schieberegler ---------- */

function Schieberegler({ frage, gezeigt, abschliessen }: {
  frage: FrageTyp; gezeigt: boolean; abschliessen: (r: boolean) => void
}) {
  const min = frage.min ?? 0
  const max = frage.max ?? 100
  // Nicht in der Mitte starten: Wer die Spanne um die Antwort herum legt - und
  // das tut man beim Schreiben ganz natuerlich -, verraet sie damit. Bei 86 von
  // 133 Schiebereglern stand der Startwert auf der richtigen Antwort.
  const [wert, setWert] = useState(min)

  function pruefen() {
    const ziel = Number(frage.correct)
    const toleranz = Math.max(frage.step ?? 1, (max - min) * 0.05)
    abschliessen(Math.abs(wert - ziel) <= toleranz)
  }

  return (
    <div className="mt-3">
      <input
        type="range"
        min={min} max={max} step={frage.step ?? 1}
        value={wert}
        disabled={gezeigt}
        onChange={(e) => setWert(Number(e.target.value))}
        className="w-full accent-sbb-red"
      />
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-2xl font-bold tabular-nums text-sbb-black dark:text-sbb-white">
          {wert.toLocaleString('de-CH')}{frage.unit ? ` ${frage.unit}` : ''}
        </span>
        {!gezeigt && (
          <button type="button" onClick={pruefen} className={pruefKnopf(false)}>
            Antwort prüfen
          </button>
        )}
      </div>
      {gezeigt && (
        <p className="mt-1 text-sm text-sbb-metal">
          Richtig wäre: {Number(frage.correct).toLocaleString('de-CH')}
          {frage.unit ? ` ${frage.unit}` : ''}
        </p>
      )}
    </div>
  )
}

/* ---------- Sortieren ---------- */

function Sortieren({ items, gezeigt, abschliessen }: {
  items: SortItem[]; gezeigt: boolean; abschliessen: (r: boolean) => void
}) {
  // items stehen in der richtigen Reihenfolge, deshalb wird zum Anzeigen gemischt
  const [reihe, setReihe] = useState<SortItem[]>(() => {
    const gemischt = mischen(items)
    const gleich = gemischt.every((x, i) => x.value === items[i].value)
    return gleich && items.length > 1 ? [...gemischt].reverse() : gemischt
  })

  // Für die Bewegung: wo die Kästen vor dem Tausch standen. Danach setzt
  // useLayoutEffect sie dorthin zurück und lässt sie an ihren neuen Platz
  // gleiten (Michael, 2026-09-22). Bei «Bewegung reduzieren» springen sie.
  const kaesten = useRef(new Map<string, HTMLLIElement>())
  const vorher = useRef(new Map<string, number>())

  function schieben(von: number, nach: number) {
    if (nach < 0 || nach >= reihe.length || gezeigt) return
    vorher.current = new Map([...kaesten.current]
      .map(([k, el]) => [k, el.getBoundingClientRect().top]))
    const neu = [...reihe]
    ;[neu[von], neu[nach]] = [neu[nach], neu[von]]
    setReihe(neu)
  }

  useLayoutEffect(() => {
    const alte = vorher.current
    vorher.current = new Map()
    if (!alte.size || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const [schluessel, el] of kaesten.current) {
      const alt = alte.get(schluessel)
      if (alt === undefined) continue
      const weg = alt - el.getBoundingClientRect().top
      if (!weg) continue
      el.style.transition = 'none'
      el.style.transform = `translateY(${weg}px)`
      requestAnimationFrame(() => {
        el.style.transition = 'transform 220ms ease-out'
        el.style.transform = ''
      })
    }
  }, [reihe])

  return (
    <>
      <p className="mt-1 text-sm text-sbb-metal">Mit den Pfeilen in die richtige Reihenfolge bringen.</p>
      <ol className="mt-2 space-y-2">
        {reihe.map((it, i) => {
          // nach Wert vergleichen, nicht nach Beschriftung: bei gleich langen
          // Perronkanten sind mehrere Reihenfolgen richtig
          const amRichtigenPlatz = gezeigt && items[i]?.value === it.value
          return (
            <li
              key={it.label}
              ref={(el) => {
                if (el) kaesten.current.set(it.label, el)
                else kaesten.current.delete(it.label)
              }}
              className={`flex items-center justify-between gap-2 border px-3 py-2.5 ${
                !gezeigt
                  ? 'border-sbb-cloud bg-sbb-white dark:border-sbb-iron dark:bg-sbb-midnight'
                  : amRichtigenPlatz
                    ? 'border-sbb-green bg-sbb-green-bg dark:bg-sbb-green/15'
                    : 'border-sbb-red bg-sbb-white dark:bg-sbb-midnight'
              }`}
            >
              <span className="min-w-0 truncate text-sbb-black dark:text-sbb-white">
                <span className="mr-2 text-sbb-metal tabular-nums">{i + 1}.</span>
                {it.label}
                {gezeigt && (
                  <span className="ml-2 text-sm text-sbb-metal">
                    {typeof it.value === 'number' ? it.value.toLocaleString('de-CH') : it.value}
                  </span>
                )}
              </span>
              {!gezeigt && (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button" aria-label="nach oben"
                    onClick={() => schieben(i, i - 1)} disabled={i === 0}
                    className="size-9 border border-sbb-cloud text-lg disabled:opacity-30
                               dark:border-sbb-iron dark:text-sbb-white"
                  >
                    <span className={i === 0 ? undefined : 'pfeil pfeil-gleich pfeil-oben'}
                          aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button" aria-label="nach unten"
                    onClick={() => schieben(i, i + 1)} disabled={i === reihe.length - 1}
                    className="size-9 border border-sbb-cloud text-lg disabled:opacity-30
                               dark:border-sbb-iron dark:text-sbb-white"
                  >
                    <span className={i === reihe.length - 1 ? undefined : 'pfeil pfeil-gleich pfeil-unten'}
                          aria-hidden="true">↓</span>
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {!gezeigt && (
        <button
          type="button"
          onClick={() => abschliessen(reihe.every((x, i) => x.value === items[i].value))}
          className={pruefKnopf(false)}
        >
          Reihenfolge prüfen
        </button>
      )}
    </>
  )
}

/* ---------- Zuordnen ---------- */

function Zuordnen({ pairs, gezeigt, abschliessen }: {
  pairs: MatchPaar[]; gezeigt: boolean; abschliessen: (r: boolean) => void
}) {
  const rechteSeite = useMemo(() => mischen(pairs.map((p) => p.rechts)), [pairs])
  const [zuordnung, setZuordnung] = useState<Record<string, string>>({})
  const [aktiv, setAktiv] = useState<string | null>(null)

  function waehlen(rechts: string) {
    if (gezeigt || !aktiv) return
    setZuordnung((z) => {
      const neu = { ...z }
      // eine rechte Karte gehört immer nur zu einer linken
      for (const [k, v] of Object.entries(neu)) if (v === rechts) delete neu[k]
      neu[aktiv] = rechts
      return neu
    })
    setAktiv(null)
  }

  const vollstaendig = Object.keys(zuordnung).length === pairs.length

  return (
    <>
      <p className="mt-1 text-sm text-sbb-metal">
        Links antippen, dann den passenden Wert rechts wählen.
      </p>
      <div className="mt-2 grid grid-cols-[1.7fr_1fr] gap-2">
        <ul className="space-y-2">
          {pairs.map((p) => {
            const stimmt = gezeigt && zuordnung[p.links] === p.rechts
            return (
              <li key={p.links}>
                <button
                  type="button"
                  disabled={gezeigt}
                  onClick={() => setAktiv(aktiv === p.links ? null : p.links)}
                  className={`w-full border px-3 py-2.5 text-left ${
                    gezeigt
                      ? stimmt
                        ? 'border-sbb-green bg-sbb-green-bg dark:bg-sbb-green/15'
                        : 'border-sbb-red bg-sbb-white dark:bg-sbb-midnight'
                      : aktiv === p.links
                        ? 'border-sbb-red bg-sbb-white dark:bg-sbb-midnight'
                        : 'border-sbb-cloud bg-sbb-white dark:border-sbb-iron dark:bg-sbb-midnight'
                  } text-sbb-black dark:text-sbb-white`}
                >
                  <span className="block hyphens-auto break-words">{p.links}</span>
                  <span className="mt-0.5 block text-sm font-bold text-sbb-red">
                    {zuordnung[p.links] ?? '—'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <ul className="space-y-2">
          {rechteSeite.map((r) => {
            const vergeben = Object.values(zuordnung).includes(r)
            return (
              <li key={r}>
                <button
                  type="button"
                  disabled={gezeigt || (vergeben && !aktiv)}
                  onClick={() => waehlen(r)}
                  className={`w-full border px-3 py-2.5 text-left text-sbb-black
                              dark:text-sbb-white ${
                    vergeben
                      ? 'border-sbb-cloud bg-sbb-milk opacity-50 dark:border-sbb-iron dark:bg-sbb-charcoal'
                      : 'border-sbb-cloud bg-sbb-white dark:border-sbb-iron dark:bg-sbb-midnight'
                  }`}
                >
                  <span className="block break-words tabular-nums">{r}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {!gezeigt && (
        <button
          type="button"
          disabled={!vollstaendig}
          onClick={() => abschliessen(pairs.every((p) => zuordnung[p.links] === p.rechts))}
          className={pruefKnopf(!vollstaendig)}
        >
          Zuordnung prüfen
        </button>
      )}
    </>
  )
}

/* ---------- Hotspot auf dem Gleisschema ---------- */

function Hotspot({ frage, gleise, gezeigt, abschliessen }: {
  frage: FrageTyp; gleise: Gleis[]; gezeigt: boolean; abschliessen: (r: boolean) => void
}) {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  if (!gleise.length) {
    return <p className="mt-2 text-sm text-sbb-metal">Zu diesem Bahnhof liegt kein Schema vor.</p>
  }
  return (
    <div className="mt-3">
      <Gleisschema
        gleise={gleise}
        auswaehlbar={!gezeigt}
        gewaehlt={gewaehlt}
        loesung={gezeigt ? String(frage.correct) : null}
        onWahl={(nr) => { setGewaehlt(nr); abschliessen(nr === String(frage.correct)) }}
      />
      {!gezeigt && (
        <p className="mt-1 text-sm text-sbb-metal">Das passende Gleis im Schema antippen.</p>
      )}
    </div>
  )
}

/* ---------- gemeinsame Stile ---------- */

function knopf(gezeigt: boolean, istGewaehlt: boolean, istLoesung: boolean) {
  const grund = 'w-full border px-3 py-2.5 text-left text-sbb-black dark:text-sbb-white'
  if (!gezeigt) {
    return `${grund} border-sbb-cloud bg-sbb-white hover:border-sbb-black
            dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white ${
              istGewaehlt ? 'border-sbb-black dark:border-sbb-white' : ''}`
  }
  if (istLoesung) return `${grund} border-sbb-green bg-sbb-green-bg dark:bg-sbb-green/15`
  if (istGewaehlt) return `${grund} border-sbb-red bg-sbb-white dark:bg-sbb-midnight`
  return `${grund} border-sbb-cloud opacity-50 dark:border-sbb-iron`
}

function pruefKnopf(deaktiviert: boolean) {
  return `mt-3 w-full bg-sbb-red px-4 py-2.5 font-bold text-sbb-white
          ${deaktiviert ? 'opacity-40' : 'hover:bg-sbb-red125'}`
}
