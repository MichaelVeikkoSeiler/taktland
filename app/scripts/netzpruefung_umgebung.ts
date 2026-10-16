/** Für die Prüfung ohne Browser: fetch liest relative Pfade aus app/public, window gibt es nicht */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch }
g.window ??= globalThis
const OEFFENTLICH = resolve(process.env.NETZPRUEFUNG_PUBLIC ?? 'public')
const echt = g.fetch
g.fetch = (async (url: string | URL | Request) => {
  const u = String(url)
  if (/^https?:/.test(u)) return echt(url)
  try {
    return new Response(await readFile(resolve(OEFFENTLICH, u.replace(/^\.?\//, ''))))
  } catch {
    return new Response(null, { status: 404 })
  }
}) as typeof fetch
