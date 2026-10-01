import type { MouseEvent } from 'react'

/**
 * Ein Tipp auf den Inhalt einer offenen Kachel klappt sie zu (Michael, 2026-10-01),
 * aber nicht, wenn er etwas Eigenes trifft: einen Knopf, einen Verweis, ein Feld,
 * eine Karte oder eine weitere Klappe, und nicht beim Markieren von Text.
 */
export function tippSchliesst(e: MouseEvent): boolean {
  const ziel = e.target instanceof Element ? e.target : null
  if (!ziel) return false
  if (ziel.closest('a, button, input, textarea, select, label, summary, svg, figure, [role="switch"], [role="radio"]')) return false
  return !window.getSelection()?.toString()
}
