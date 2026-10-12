import type { ReactNode } from 'react'

/**
 * Zusatzinformationen, Quellenangaben und Hinweise unter Karten, Modellen und Listen: aufklappbar, am Anfang zu
 * (Michael, 2026-10-12: «die ganze Bleiwüste unterhalb der Karte … defaultmässig eingeklappt»). Lücken gehören nicht
 * hierher, sie bleiben sichtbar (CLAUDE.md, Regel 5); die Quellen stehen ausserdem immer in der Fusszeile.
 */
export function Klappe({ titel = 'Quellen und Hinweise', className = '', children }: {
  titel?: ReactNode; className?: string; children: ReactNode
}) {
  return (
    <details className={`klapp ${className}`}>
      <summary className="inline-flex min-h-8 cursor-pointer items-center underline underline-offset-2">{titel}</summary>
      <div className="mt-1 space-y-2">{children}</div>
    </details>
  )
}
