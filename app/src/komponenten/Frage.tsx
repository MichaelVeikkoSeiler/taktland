import { useState } from 'react'
import type { Frage as FrageTyp } from '../typen'

interface Props {
  frage: FrageTyp
  id: string
  beantwortet?: boolean
  onAntwort: (richtig: boolean) => void
}

/** Eine Frage mit sofortiger Rückmeldung. Die Erklärung erscheint erst danach. */
export function Frage({ frage, id, beantwortet, onAntwort }: Props) {
  const [gewaehlt, setGewaehlt] = useState<number | boolean | null>(null)
  const [schieber, setSchieber] = useState<number>(
    frage.type === 'slider' ? Math.round(((frage.min ?? 0) + (frage.max ?? 100)) / 2) : 0,
  )
  const [gezeigt, setGezeigt] = useState(false)

  function pruefen(wert: number | boolean) {
    if (gezeigt) return
    setGewaehlt(wert)
    setGezeigt(true)
    onAntwort(istRichtig(wert))
  }

  function istRichtig(wert: number | boolean) {
    if (frage.type === 'true_false') return wert === frage.correct
    if (frage.type === 'slider') {
      const ziel = Number(frage.correct)
      const spanne = (frage.max ?? 100) - (frage.min ?? 0)
      return Math.abs(Number(wert) - ziel) <= Math.max(frage.step ?? 1, spanne * 0.05)
    }
    return wert === frage.correct
  }

  const richtig = gezeigt && gewaehlt !== null && istRichtig(gewaehlt)

  return (
    <div className="mt-4 rounded-xl border border-takt-300 bg-takt-50 p-4
                    dark:border-takt-700 dark:bg-takt-900/60">
      <p className="font-medium text-takt-900 dark:text-takt-50">
        {frage.prompt}
        {beantwortet && !gezeigt && (
          <span className="ml-2 align-middle text-xs font-normal text-takt-600 dark:text-takt-300">
            schon einmal beantwortet
          </span>
        )}
      </p>

      {(frage.type === 'single_choice' || frage.type === 'multiple_choice') && (
        <ul className="mt-3 space-y-2">
          {frage.options?.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                onClick={() => pruefen(i)}
                disabled={gezeigt}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                  auswahlStil(gezeigt, i === gewaehlt, i === frage.correct)}`}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}

      {frage.type === 'true_false' && (
        <div className="mt-3 flex gap-2">
          {[true, false].map((w) => (
            <button
              key={String(w)}
              type="button"
              onClick={() => pruefen(w)}
              disabled={gezeigt}
              className={`flex-1 rounded-lg border px-3 py-2.5 transition ${
                auswahlStil(gezeigt, w === gewaehlt, w === frage.correct)}`}
            >
              {w ? 'Stimmt' : 'Stimmt nicht'}
            </button>
          ))}
        </div>
      )}

      {frage.type === 'slider' && (
        <div className="mt-3">
          <input
            type="range"
            min={frage.min ?? 0}
            max={frage.max ?? 100}
            step={frage.step ?? 1}
            value={schieber}
            disabled={gezeigt}
            onChange={(e) => setSchieber(Number(e.target.value))}
            className="w-full accent-takt-600"
          />
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-takt-900 tabular-nums dark:text-takt-50">
              {schieber.toLocaleString('de-CH')}
              {frage.unit ? ` ${frage.unit}` : ''}
            </span>
            {!gezeigt && (
              <button
                type="button"
                onClick={() => pruefen(schieber)}
                className="rounded-lg bg-takt-600 px-4 py-2 font-medium text-white"
              >
                Prüfen
              </button>
            )}
          </div>
          {gezeigt && (
            <p className="mt-1 text-sm text-takt-700 dark:text-takt-300">
              Richtig wäre: {Number(frage.correct).toLocaleString('de-CH')}
              {frage.unit ? ` ${frage.unit}` : ''}
            </p>
          )}
        </div>
      )}

      {gezeigt && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${
          richtig
            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100'
            : 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100'
        }`}>
          <p className="font-medium">{richtig ? 'Richtig' : 'Nicht ganz'}</p>
          {frage.explanation && <p className="mt-0.5">{frage.explanation}</p>}
          <p className="mt-1 text-xs opacity-80">Beleg: {frage.factRef}</p>
        </div>
      )}
    </div>
  )
}

function auswahlStil(gezeigt: boolean, istGewaehlt: boolean, istLoesung: boolean) {
  if (!gezeigt) {
    return 'border-takt-300 bg-white hover:border-takt-600 dark:border-takt-700 dark:bg-takt-900'
  }
  if (istLoesung) return 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60'
  if (istGewaehlt) return 'border-amber-600 bg-amber-50 dark:bg-amber-950/60'
  return 'border-takt-300/60 opacity-60 dark:border-takt-700/60'
}
