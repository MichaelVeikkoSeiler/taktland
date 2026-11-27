/**
 * Das Blatt «Als Auftrag teilen» für ein eigenes Brett (seit 2026-11-27; Michael: «wenn sie selber Aufträge konzipieren könnten und diese Bekannten als
 * Aufgabe weitergeben könnten»): Titel, Text, Ziel und Budget, dann ausprobieren oder den Link teilen
 */
import { useState } from 'react'
import { brettCode, type Brett, bauGilt, istBahnhof } from '../gleisbau'
import { EIGEN_BUDGET_MAX, EIGEN_TEXT_MAX, EIGEN_TITEL_MAX, EIGEN_ZIEL_MAX, eigenAdresse, eigenLink, type EigenerAuftrag } from '../gleisbauEigen'

const KNOPF_ROT = 'min-h-11 rounded-lg bg-sbb-red px-4 font-bold text-white hover:bg-sbb-red125 disabled:opacity-40'
const KNOPF_WEISS = 'min-h-11 rounded-lg border border-sbb-cloud bg-white px-4 font-bold hover:border-sbb-black disabled:opacity-40 dark:border-sbb-iron dark:bg-sbb-midnight'
const FELD = 'mt-1 w-full rounded-lg border border-sbb-cloud bg-white px-3 py-2 dark:border-sbb-iron dark:bg-sbb-midnight'

export function EigenerAuftragBlatt({ brett, name, zu }: { brett: Brett; name: string; zu: () => void }) {
  const [titel, setTitel] = useState(name === 'Brett' ? '' : name.slice(0, EIGEN_TITEL_MAX))
  const [text, setText] = useState('')
  const [fahrgaeste, setFahrgaeste] = useState(10)
  const [gueter, setGueter] = useState(0)
  const [budget, setBudget] = useState(0)
  const [geteilt, setGeteilt] = useState(false)
  const bahnhoefe = brett.flat().filter((f) => istBahnhof(f.gleis)).length
  const schuppen = brett.flat().filter((f) => f.bau === 'gueter' && bauGilt(f)).length
  const zahl = (s: string, max: number) => Math.max(0, Math.min(max, Math.floor(Number(s) || 0)))
  const e: EigenerAuftrag = { code: brettCode(brett), titel: titel.trim(), text: text.trim(), fahrgaeste, gueter, budget }
  // was fehlt, damit der Auftrag lösbar ist
  const fehlt = [
    !fahrgaeste && !gueter && 'Gib ein Ziel an: Fahrgäste oder Ladungen.',
    fahrgaeste > 0 && bahnhoefe < 2 && 'Für Fahrgäste braucht das Brett mindestens zwei Bahnhöfe.',
    gueter > 0 && schuppen < 2 && 'Für Ladungen braucht das Brett mindestens zwei Güterschuppen.',
  ].filter(Boolean) as string[]
  const teilen = async () => {
    const url = eigenLink(e)
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: `Gleisbau-Auftrag: ${e.titel || 'Eigener Auftrag'}`, url }); return } catch (x) { if ((x as DOMException).name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url); setGeteilt(true); window.setTimeout(() => setGeteilt(false), 2500) } catch { window.prompt('Link zum Auftrag', url) }
  }
  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/30" onClick={(x) => { if (x.target === x.currentTarget) zu() }}>
      <div className="max-h-[90%] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-sbb-charcoal" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        <p className="text-lg font-bold">Als Auftrag teilen</p>
        <p className="mt-1 text-sm leading-snug">
          Dieses Brett ist die Ausgangslage: Alles, was darauf liegt (Bahnhöfe, Schuppen, Gleise, Landschaft), bleibt für den Spieler fest. Er baut den Rest
          dazu und muss das Ziel erreichen. Der Link enthält alles, es braucht kein Konto.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-bold">Titel
            <input className={FELD} value={titel} maxLength={EIGEN_TITEL_MAX} placeholder="Eigener Auftrag" onChange={(x) => setTitel(x.target.value)} />
          </label>
          <label className="block text-sm font-bold">Budget für die Baukosten (CHF, 0 = ohne)
            <input className={FELD} type="number" min={0} max={EIGEN_BUDGET_MAX} step={10} value={budget} onChange={(x) => setBudget(zahl(x.target.value, EIGEN_BUDGET_MAX))} />
          </label>
          <label className="block text-sm font-bold sm:col-span-2">Text für den Spieler
            <textarea className={`${FELD} min-h-20`} value={text} maxLength={EIGEN_TEXT_MAX} placeholder="Zum Beispiel: Die Leute aus Seewil wollen ins Kino nach Bergau."
                      onChange={(x) => setText(x.target.value)} />
          </label>
          <label className="block text-sm font-bold">Fahrgäste ans Ziel
            <input className={FELD} type="number" min={0} max={EIGEN_ZIEL_MAX} value={fahrgaeste} onChange={(x) => setFahrgaeste(zahl(x.target.value, EIGEN_ZIEL_MAX))} />
          </label>
          <label className="block text-sm font-bold">Ladungen ans Ziel
            <input className={FELD} type="number" min={0} max={EIGEN_ZIEL_MAX} value={gueter} onChange={(x) => setGueter(zahl(x.target.value, EIGEN_ZIEL_MAX))} />
          </label>
        </div>
        {fehlt.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm font-bold text-sbb-red">{fehlt.map((x) => <li key={x}>{x}</li>)}</ul>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={fehlt.length > 0} onClick={() => void teilen()} className={KNOPF_ROT}>{geteilt ? 'Link kopiert' : 'Link teilen'}</button>
          <button type="button" disabled={fehlt.length > 0} onClick={() => { window.location.hash = `#/gleisbau?${eigenAdresse(e)}` }} className={KNOPF_WEISS}>Selbst ausprobieren</button>
          <button type="button" onClick={zu} className={KNOPF_WEISS}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}
