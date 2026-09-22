import { useEffect, useState, useSyncExternalStore } from 'react'

/** So lange bleibt das andere Bild stehen, bevor es zurückblendet */
const ANZEIGEDAUER_MS = 5000

const DUNKEL = '(prefers-color-scheme: dark)'

/** Folgt der Geräteeinstellung, auch wenn sie sich ändert, während die Seite offen ist */
function useDunkel() {
  return useSyncExternalStore(
    (melden) => {
      const m = window.matchMedia(DUNKEL)
      m.addEventListener('change', melden)
      return () => m.removeEventListener('change', melden)
    },
    () => window.matchMedia(DUNKEL).matches,
    () => false,
  )
}

/** Von 7 bis 21 Uhr Schweizer Zeit (MEZ, im Sommer MESZ) steht immer das
 *  Tagbild (Michael, 2026-09-22). Handys schalten die dunkle Darstellung oft
 *  schon bei Sonnenuntergang ein, im Winter gegen 17 Uhr. */
const TAG_VON = 7
const TAG_BIS = 21

/** Die Stunde in der Schweiz, 0 bis 23. Nur der Teil «hour»: format() gibt
 *  auf Deutsch «07 Uhr» zurück, und das ist keine Zahl. */
export function schweizerStunde(jetzt = new Date()) {
  const teil = new Intl.DateTimeFormat('de-CH', {
    hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Zurich',
  }).formatToParts(jetzt).find((t) => t.type === 'hour')
  return Number(teil?.value ?? 12)
}

/** Tag zwischen TAG_VON und TAG_BIS, jede Minute neu geprüft */
function useTag() {
  const [stunde, setStunde] = useState(schweizerStunde)
  useEffect(() => {
    const uhr = window.setInterval(() => setStunde(schweizerStunde()), 60_000)
    return () => window.clearInterval(uhr)
  }, [])
  return stunde >= TAG_VON && stunde < TAG_BIS
}

/** Ein Auftaktbild, am Tag und wenn vorhanden in der Nacht */
export interface AuftaktBild {
  hell: string
  dunkel?: string
  breite: number
  hoehe: number
  alt: string
}

/**
 * Auftaktbild eines Bereichs, am Tag und in der Nacht. Von 7 bis 21 Uhr
 * Schweizer Zeit erscheint das Tagbild, sonst folgt es der Geräteeinstellung.
 * Ein kleiner Knopf zeigt für fünf Sekunden das andere Bild, dann blendet es
 * zurück. Die Vorschau bleibt beim Wechsel des Bereichs bestehen: Wer weiter
 * klickt, sieht auch dort das andere Bild, und erst fünf Sekunden nach dem
 * letzten Wechsel kommt das übliche zurück (Michael, 2026-09-22). Das andere
 * Bild wird erst geladen, wenn jemand den Knopf berührt: Wer ihn nie nutzt,
 * lädt es nicht. Ohne Nachtbild gibt es nur das eine Bild und keinen Knopf.
 */

/** Die Vorschau überlebt den Wechsel des Bereichs, weil sie ausserhalb der
 *  Komponente steht; sie endet mit dem Zeitablauf oder mit dem Knopf. */
let vorschau = false
export function Auftakt({ bild }: { bild: AuftaktBild }) {
  // beide Hooks immer aufrufen, auch am Tag (Reihenfolge der Hooks)
  const tag = useTag()
  const geraetDunkel = useDunkel()
  const dunkel = !tag && geraetDunkel && bild.dunkel !== undefined
  const [angefragt, setAngefragt] = useState(vorschau)
  const [geladen, setGeladen] = useState(false)
  const [zeigen, setZeigenRoh] = useState(vorschau)
  const sichtbar = zeigen && geladen

  function setZeigen(an: boolean) {
    vorschau = an
    setZeigenRoh(an)
  }

  // die fünf Sekunden zählen ab dem Moment, in dem das Bild wirklich dasteht
  useEffect(() => {
    if (!sichtbar) return
    const uhr = window.setTimeout(() => setZeigen(false), ANZEIGEDAUER_MS)
    return () => window.clearTimeout(uhr)
  }, [sichtbar])

  const anderes = dunkel ? bild.hell : bild.dunkel
  const beschriftung = dunkel ? 'Kurz das Tagbild zeigen' : 'Kurz das Nachtbild zeigen'

  return (
    <div className="relative -mx-4 -mt-8 mb-6">
      <img
        src={dunkel ? bild.dunkel : bild.hell} width={bild.breite} height={bild.hoehe} alt={bild.alt}
        className="block h-auto w-full"
      />

      {anderes && angefragt && (
        <img
          src={anderes} width={bild.breite} height={bild.hoehe} alt="" aria-hidden="true"
          onLoad={() => setGeladen(true)}
          className={`pointer-events-none absolute inset-0 size-full transition-opacity
                      ease-in-out motion-reduce:transition-none ${
            sichtbar ? 'opacity-100 duration-700' : 'opacity-0 duration-1000'}`}
        />
      )}

      {anderes && <button
        type="button"
        onPointerEnter={() => setAngefragt(true)}
        onFocus={() => setAngefragt(true)}
        onClick={() => { setAngefragt(true); setZeigen(!zeigen) }}
        aria-label={beschriftung} title={beschriftung} aria-pressed={zeigen}
        className="absolute bottom-2 right-2 flex size-7 items-center justify-center
                   bg-black/30 text-white opacity-60 transition-opacity hover:opacity-100
                   focus-visible:opacity-100"
      >
        {dunkel ? <Sonne /> : <Mond />}
      </button>}
    </div>
  )
}

function Mond() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  )
}

function Sonne() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
