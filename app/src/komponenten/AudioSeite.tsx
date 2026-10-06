import { antwortTon, audioKontext, aufklappTon, audioSetzen, reiterTon, schreibmaschinenTon, type TonArt, tonSpielen, useAudio } from '../audio'

/**
 * «Audio» in den Einstellungen (Michael, 2026-10-01 als Reiter der Reisetasche, seit 2026-10-06
 * ein Teil der Einstellungen, mit Lautstärkeregler): die Töne von Taktland einzeln steuern und probehören.
 */
const ARTEN: Array<{ art: TonArt; name: string; klang: string }> = [
  { art: 'tunnel', name: 'Tunnel', klang: 'zwei tiefe Töne abwärts' },
  { art: 'bruecke', name: 'Brücke', klang: 'drei helle Töne im Bogen: hoch, höher, hoch' },
  { art: 'bahnhof', name: 'Bahnhof', klang: 'zwei Töne aufwärts' },
  { art: 'sehenswert', name: 'Sehenswertes', klang: 'ein einzelner Ton' },
  { art: 'bahnuebergang', name: 'Bahnübergang', klang: 'viermal schnell derselbe Ton, wie an der Schranke' },
  { art: 'ankunft', name: 'Ankunft am Ziel', klang: 'drei Töne aufwärts' },
]

export function AudioEinstellungen() {
  const audio = useAudio()
  const aus = !audio.an
  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">Audio</h2>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">Welche Töne Taktland spielt und wie laut.</p>
      <div className={`kachel mt-3 px-4 py-3 ${aus ? 'opacity-50' : ''}`}>
        <label htmlFor="lautstaerke" className="flex items-baseline justify-between gap-3">
          <span className="font-medium">Lautstärke</span>
          <span className="text-sm tabular-nums text-sbb-metal dark:text-sbb-storm">{audio.lautstaerke} %</span>
        </label>
        <input id="lautstaerke" type="range" min={0} max={100} step={5} value={audio.lautstaerke} disabled={aus}
               onChange={(e) => audioSetzen({ lautstaerke: Number(e.target.value) })}
               // beim Loslassen einmal der Ton eines Bahnhofs, damit man hört, wie laut es ist
               onPointerUp={() => { void audioKontext()?.resume(); tonSpielen('bahnhof') }}
               onKeyUp={() => { void audioKontext()?.resume(); tonSpielen('bahnhof') }}
               className="mt-2 w-full accent-sbb-red" />
        <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
          Für alle Töne von Taktland. Wie laut es am Ende klingt, bestimmt auch die Lautstärke des Geräts.
        </p>
      </div>
      <div className="kachelliste mt-3">
        <Schalter titel="Töne" text="Alle Töne von Taktland, auch die Meldungen beim Fahren"
                  an={audio.an} umschalten={() => audioSetzen({ an: !audio.an })} />
        <Schalter titel="Töne bei den Reitern" text="Ein kurzer, leiser Ton beim Wechsel der Reiter, ein Wischen bei den Pfeilen der Reiterzeile"
                  an={audio.reiter} gesperrt={aus}
                  umschalten={() => {
                    audioSetzen({ reiter: !audio.reiter })
                    // wer ihn einschaltet, hört gleich, wie er klingt
                    if (!audio.reiter) reiterTon()
                  }} />
        <Schalter titel="Töne bei Antworten"
                  text="Nach jeder Frage und im Duell: hell bei «Richtig», tiefer bei «Nicht ganz», eigener Ton für einen neuen Bestwert"
                  an={audio.antworten} gesperrt={aus}
                  umschalten={() => {
                    audioSetzen({ antworten: !audio.antworten })
                    if (!audio.antworten) antwortTon('richtig')
                  }} />
        <Schalter titel="Töne beim Auf- und Zuklappen" text="Ein gläsernes Klicken beim Aufklappen, etwas tiefer beim Zuklappen"
                  an={audio.aufklappen} gesperrt={aus}
                  umschalten={() => {
                    audioSetzen({ aufklappen: !audio.aufklappen })
                    if (!audio.aufklappen) aufklappTon()
                  }} />
        <Schalter titel="Schreibmaschine beim Tippen"
                  text="Ein Anschlag je Zeichen, dumpfer bei der Leertaste, die Glocke bei der Eingabetaste"
                  an={audio.schreibmaschine} gesperrt={aus}
                  umschalten={() => {
                    audioSetzen({ schreibmaschine: !audio.schreibmaschine })
                    // wer sie einschaltet, hört gleich drei Anschläge und die Glocke
                    if (!audio.schreibmaschine) [0, 110, 230].forEach((t, i) => setTimeout(() => schreibmaschinenTon(i === 2 ? 'leer' : 'taste'), t))
                    if (!audio.schreibmaschine) setTimeout(() => schreibmaschinenTon('glocke'), 420)
                  }} />
      </div>
      {aus && (
        <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
          Alle Töne sind aus. Beim Fahren erscheinen die Meldungen weiter, nur ohne Ton.
        </p>
      )}

      <h3 className="mt-6 font-semibold">Töne beim Fahren</h3>
      <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
        Jede Art hat ihren eigenen Ton. Ausgeschaltet erscheint die Meldung weiter, nur ohne Ton.
        «▶» spielt ihn einmal ab.
      </p>
      <div className="kachelliste mt-3">
        {ARTEN.map(({ art, name, klang }) => (
          <div key={art} className={`flex items-stretch ${aus ? 'opacity-50' : ''}`}>
            <button type="button" aria-label={`${name} anhören`} title="Anhören" disabled={aus}
                    onClick={() => { void audioKontext()?.resume(); tonSpielen(art) }}
                    className="flex w-12 shrink-0 items-center justify-center border-r border-sbb-cloud text-sbb-red
                               hover:bg-sbb-milk dark:border-sbb-iron dark:hover:bg-sbb-charcoal">
              ▶
            </button>
            <div className="min-w-0 flex-1">
              <Schalter titel={name} text={klang} an={audio.arten[art]} gesperrt={aus} ohneKachel
                        umschalten={() => audioSetzen({ arten: { ...audio.arten, [art]: !audio.arten[art] } })} />
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-6 font-semibold">Wann der Ton kommt</h3>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Wann der Ton kommt">
        {([[false, 'Einmal, mit der Meldung', 'Wie unter «Melden etwa» beim Fahren gewählt: etwa 20 oder 10 Sekunden vorher'],
           [true, 'Zweimal', 'Etwa 20 und nochmals etwa 10 Sekunden vor jedem gemeldeten Objekt']] as const)
          .map(([wert, titel, text]) => (
            <button key={titel} type="button" role="radio" aria-checked={audio.zweimal === wert} disabled={aus}
                    onClick={() => audioSetzen({ zweimal: wert })}
                    className={`kachel flex items-start gap-3 px-4 py-3 text-left disabled:opacity-50`}>
              <span aria-hidden="true"
                    className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${audio.zweimal === wert
                      ? 'border-sbb-red' : 'border-[#b5b5b5] dark:border-sbb-iron'}`}>
                {audio.zweimal === wert && <span className="size-2.5 rounded-full bg-sbb-red" />}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{titel}</span>
                <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{text}</span>
              </span>
            </button>
          ))}
      </div>
    </>
  )
}

export function Schalter({ titel, text, an, umschalten, gesperrt = false, ohneKachel = false }: {
  titel: string; text: string; an: boolean; umschalten: () => void; gesperrt?: boolean; ohneKachel?: boolean
}) {
  const ein = an && !gesperrt
  return (
    <button type="button" role="switch" aria-checked={ein} disabled={gesperrt} onClick={umschalten}
            className={`flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left ${ohneKachel ? '' : 'disabled:opacity-50'}`}>
      <span className="min-w-0">
        <span className="block font-medium">{titel}</span>
        <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{text}</span>
      </span>
      <span aria-hidden="true"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${ein ? 'bg-sbb-red' : 'bg-[#b5b5b5] dark:bg-sbb-iron'}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] ${ein ? 'left-[1.375rem]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
