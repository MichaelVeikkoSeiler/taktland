import { einstellungenSetzen, GROESSEN, type Groesse, type Schrift, SCHRIFTEN, useEinstellungen } from '../einstellungen'
import { AudioEinstellungen, Schalter } from './AudioSeite'
import { MeldeEinstellungen, useMeldeEinstellung } from './Fahrtmodus'

/**
 * «Einstellungen» (Michael, 2026-10-01: «Bildschirm wach halten, Standardwerte und Schriftgrösse
 * bauen. Zudem 3 verschiedene Schriftarten»). Seit 2026-10-06 kein Reiter der Reisetasche mehr,
 * sondern über die Fusszeile erreichbar, mit «Audio» als eigenem Teil.
 */
export function EinstellungenSeite() {
  const e = useEinstellungen()
  const [melde, meldeAendern] = useMeldeEinstellung()
  const wachMoeglich = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  return (
    <div className="px-4 pb-4">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Einstellungen</h1>
      <p className="mt-2 leading-relaxed">Die Einstellungen gelten für dieses Gerät.</p>

      {/* Audio ganz oben (Michael, 2026-10-06) */}
      <AudioEinstellungen />

      <h2 className="mt-8 text-lg font-semibold">Schriftgrösse</h2>
      <Wahl name="Schriftgrösse" wert={e.groesse} waehlen={(g: Groesse) => einstellungenSetzen({ groesse: g })}
            optionen={(Object.keys(GROESSEN) as Groesse[]).map((g) => ({
              wert: g, titel: GROESSEN[g].text, stil: { fontSize: `${GROESSEN[g].prozent / 100}rem` } }))} />

      <h2 className="mt-8 text-lg font-semibold">Schriftart</h2>
      <Wahl name="Schriftart" wert={e.schrift} waehlen={(s: Schrift) => einstellungenSetzen({ schrift: s })}
            optionen={(Object.keys(SCHRIFTEN) as Schrift[]).map((s) => ({
              wert: s, titel: SCHRIFTEN[s].text, text: 'Taktland: Bahnhöfe, Tunnel und Brücken',
              stil: { fontFamily: SCHRIFTEN[s].familie } }))} />
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Space Grotesk ist in Taktland mitgeliefert (SIL Open Font License) und lädt erst, wenn du sie
        wählst. Die anderen sind schon auf dem Gerät; wie sie genau aussehen, hängt vom Handy ab.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Beim Fahren</h2>
      <div className="kachelliste mt-3">
        <Schalter titel="Bildschirm wach halten"
                  text={wachMoeglich ? 'Während einer Fahrt geht der Bildschirm nicht aus. Das braucht mehr Akku.'
                    : 'Dieser Browser kann den Bildschirm nicht wach halten.'}
                  an={e.wach} gesperrt={!wachMoeglich} umschalten={() => einstellungenSetzen({ wach: !e.wach })} />
      </div>

      <h3 className="mt-6 font-semibold">Standardwerte für jede Fahrt</h3>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
        Was gemeldet wird und wie. Was du während einer Fahrt unten änderst, gilt auch hier.
      </p>
      <div className="kachel mt-3 grid gap-3 p-4 text-sm">
        <MeldeEinstellungen einstellung={melde} aendern={meldeAendern} />
      </div>
    </div>
  )
}

function Wahl<T extends string>({ name, wert, waehlen, optionen }: {
  name: string; wert: T; waehlen: (w: T) => void
  optionen: Array<{ wert: T; titel: string; text?: string; stil?: React.CSSProperties }>
}) {
  return (
    <div className="mt-3 grid gap-2" role="radiogroup" aria-label={name}>
      {optionen.map((o) => (
        <button key={o.wert} type="button" role="radio" aria-checked={wert === o.wert} onClick={() => waehlen(o.wert)}
                className="kachel flex items-center gap-3 px-4 py-3 text-left">
          <span aria-hidden="true"
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${wert === o.wert
                  ? 'border-sbb-red' : 'border-[#b5b5b5] dark:border-sbb-iron'}`}>
            {wert === o.wert && <span className="size-2.5 rounded-full bg-sbb-red" />}
          </span>
          <span className="min-w-0" style={o.stil}>
            <span className="block font-medium">{o.titel}</span>
            {o.text && <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{o.text}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}
