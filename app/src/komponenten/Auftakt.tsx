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

/** Ein Auftaktbild, am Tag und wenn vorhanden in der Nacht */
export interface AuftaktBild {
  hell: string
  dunkel?: string
  breite: number
  hoehe: number
  alt: string
}

/**
 * Auftaktbild eines Bereichs, am Tag und in der Nacht. Welches erscheint, folgt
 * der Geräteeinstellung. Ein kleiner Knopf zeigt für fünf Sekunden das andere
 * Bild, dann blendet es zurück. Das andere Bild wird erst geladen, wenn jemand
 * den Knopf berührt: Wer ihn nie nutzt, lädt es nicht. Ohne Nachtbild gibt es
 * nur das eine Bild und keinen Knopf.
 */
export function Auftakt({ bild }: { bild: AuftaktBild }) {
  const dunkel = useDunkel() && bild.dunkel !== undefined
  const [angefragt, setAngefragt] = useState(false)
  const [geladen, setGeladen] = useState(false)
  const [zeigen, setZeigen] = useState(false)
  const sichtbar = zeigen && geladen

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
      <picture>
        {bild.dunkel && <source srcSet={bild.dunkel} media={DUNKEL} />}
        <img
          src={bild.hell} width={bild.breite} height={bild.hoehe} alt={bild.alt}
          className="block h-auto w-full"
        />
      </picture>

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
        onClick={() => { setAngefragt(true); setZeigen((z) => !z) }}
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
