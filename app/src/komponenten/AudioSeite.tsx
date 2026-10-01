import { audioSetzen, reiterTon, useAudio } from '../audio'

/**
 * Reiter «Audio» in der Reisetasche (Michael, 2026-10-01): die Töne von Taktland
 * einzeln steuern. Weitere Einstellungen folgen.
 */
export function AudioSeite() {
  const audio = useAudio()
  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Audio</h1>
      <p className="mt-2 leading-relaxed">
        Hier stellst du ein, welche Töne Taktland spielt. Die Einstellung gilt für dieses Gerät.
      </p>
      <div className="kachelliste mt-4">
        <Schalter titel="Töne" text="Alle Töne von Taktland, auch die Meldungen beim Fahren"
                  an={audio.an} umschalten={() => audioSetzen({ an: !audio.an })} />
        <Schalter titel="Töne bei den Reitern" text="Ein kurzer, leiser Ton beim Wechsel der Reiter"
                  an={audio.reiter} gesperrt={!audio.an}
                  umschalten={() => {
                    audioSetzen({ reiter: !audio.reiter })
                    // wer ihn einschaltet, hört gleich, wie er klingt
                    if (!audio.reiter) reiterTon()
                  }} />
      </div>
      {!audio.an && (
        <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
          Alle Töne sind aus. Beim Fahren erscheinen die Meldungen weiter, nur ohne Ton.
        </p>
      )}
    </div>
  )
}

function Schalter({ titel, text, an, umschalten, gesperrt = false }: {
  titel: string; text: string; an: boolean; umschalten: () => void; gesperrt?: boolean
}) {
  const ein = an && !gesperrt
  return (
    <button type="button" role="switch" aria-checked={ein} disabled={gesperrt} onClick={umschalten}
            className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left disabled:opacity-50">
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
