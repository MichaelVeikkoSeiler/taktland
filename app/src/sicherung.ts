/**
 * Sicherung als Datei (Michael, 2026-09-26). Logbuch, Sammelheft, Favoriten,
 * Probefahrten, Lernfortschritt und Einstellungen liegen im Speicher des
 * Browsers. Safari löscht ihn bei Websites, die sieben Tage nicht besucht
 * wurden. Die Datei bleibt bei der Nutzerin oder dem Nutzer; Taktland sendet
 * sie nirgends hin.
 */

const PRAEFIX = 'taktland.'
/** Nicht in die Sicherung: der Merker für Updates und die gerade laufende Fahrt */
const OHNE = new Set(['taktland.aktualisiert', 'taktland.laufend.v1'])

interface Datei {
  app: 'taktland'
  art: 'sicherung'
  version: 1
  erstellt: string
  daten: Record<string, string>
}

function schluessel(): string[] {
  const raus: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PRAEFIX) && !OHNE.has(k)) raus.push(k)
  }
  return raus.sort()
}

/** Lädt die Sicherung als Datei herunter; gibt die Zahl der Einträge zurück */
export function sicherungHerunterladen(): number {
  const daten: Record<string, string> = {}
  for (const k of schluessel()) daten[k] = localStorage.getItem(k) ?? ''
  const d = new Date()
  const tag = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const datei: Datei = { app: 'taktland', art: 'sicherung', version: 1, erstellt: d.toISOString(), daten }
  const url = URL.createObjectURL(new Blob([JSON.stringify(datei, null, 1)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `taktland-sicherung-${tag}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return Object.keys(daten).length
}

/** Prüft eine Datei; gibt die Daten zurück oder wirft mit einem verständlichen Satz */
export async function sicherungPruefen(f: File): Promise<{ erstellt: string; daten: Record<string, string> }> {
  let x: Datei
  try {
    x = JSON.parse(await f.text())
  } catch {
    throw new Error('Die Datei ist keine Sicherung von Taktland.')
  }
  if (!x || x.app !== 'taktland' || x.art !== 'sicherung' || typeof x.daten !== 'object' || !x.daten) {
    throw new Error('Die Datei ist keine Sicherung von Taktland.')
  }
  if (x.version !== 1) throw new Error('Diese Sicherung stammt aus einer neueren Version von Taktland.')
  const daten: Record<string, string> = {}
  for (const [k, v] of Object.entries(x.daten)) {
    if (!k.startsWith(PRAEFIX) || OHNE.has(k) || typeof v !== 'string') continue
    daten[k] = v
  }
  if (!Object.keys(daten).length) throw new Error('In dieser Sicherung steht nichts.')
  return { erstellt: x.erstellt, daten }
}

/** Ersetzt alles auf diesem Gerät durch die Sicherung */
export function sicherungEinlesen(daten: Record<string, string>) {
  for (const k of schluessel()) localStorage.removeItem(k)
  for (const [k, v] of Object.entries(daten)) localStorage.setItem(k, v)
}
