import { antwortTon, audioKontext, aufklappTon, audioSetzen, reiterTon, type TonArt, tonSpielen, useAudio } from '../audio'

/**
 * Reiter «Audio» in der Reisetasche (Michael, 2026-10-01): die Töne von Taktland
 * einzeln steuern und probehören.
 */
const ARTEN: Array<{ art: TonArt; name: string; klang: string }> = [
  { art: 'tunnel', name: 'Tunnel', klang: 'zwei tiefe Töne abwärts' },
  { art: 'bruecke', name: 'Brücke', klang: 'drei helle Töne im Bogen: hoch, höher, hoch' },
  { art: 'bahnhof', name: 'Bahnhof', klang: 'zwei Töne aufwärts' },
  { art: 'sehenswert', name: 'Sehenswertes', klang: 'ein einzelner Ton' },
  { art: 'bahnuebergang', name: 'Bahnübergang', klang: 'viermal schnell derselbe Ton, wie an der Schranke' },
  { art: 'ankunft', name: 'Ankunft am Ziel', klang: 'drei Töne aufwärts' },
]

export function AudioSeite() {
  const audio = useAudio()
  const aus = !audio.an
  return (
    <div className="px-4 pb-4">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Audio</h1>
      <p className="mt-2 leading-relaxed">
        Hier stellst du ein, welche Töne Taktland spielt. Die Einstellung gilt für dieses Gerät.
      </p>
      <div className="kachelliste mt-4">
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
      </div>
      {aus && (
        <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
          Alle Töne sind aus. Beim Fahren erscheinen die Meldungen weiter, nur ohne Ton.
        </p>
      )}

      <h2 className="mt-8 text-lg font-semibold">Beim Fahren</h2>
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

      <h2 className="mt-8 text-lg font-semibold">Wann der Ton kommt</h2>
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
    </div>
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
