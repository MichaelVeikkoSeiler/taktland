import { favoritUmschalten } from '../favoriten'

/** Stern für Favoriten: voll und rot gesetzt, sonst als Umriss */
export function Stern({ voll }: { voll: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
      <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
            strokeWidth="1.6" strokeLinejoin="round"
            className={voll ? 'fill-sbb-red stroke-sbb-red' : 'fill-none stroke-current'} />
    </svg>
  )
}

/** Stern zum Merken eines Bahnhofs, mindestens 44 Pixel gross zum Tippen */
export function FavoritKnopf({ uic, name, favorit, className = '' }: {
  uic: number
  name: string
  favorit: boolean
  className?: string
}) {
  return (
    <button type="button" onClick={() => favoritUmschalten(uic)} aria-pressed={favorit}
            aria-label={favorit ? `${name} aus den Favoriten entfernen` : `${name} zu den Favoriten`}
            title={favorit ? 'Aus den Favoriten entfernen' : 'Zu den Favoriten'}
            className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center
                        text-sbb-metal hover:text-sbb-black dark:text-sbb-storm
                        dark:hover:text-sbb-white ${className}`}>
      <Stern voll={favorit} />
    </button>
  )
}
