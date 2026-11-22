import { useEffect, useRef, useState } from 'react'
import { antwortTon } from '../audio'
import {
  BILDER, Bilderpuzzle as Spielfeld, bildLaden, eigeneLaden, eigenesHinzufuegen, eigenesLoeschen, type Form, type PuzzleBild, TEILE,
} from '../bilderpuzzle'
import { Zurueck } from './Zurueck'

const LEISE = 'text-sm text-sbb-metal dark:text-sbb-storm'
const SPEICHER = 'taktland.bilderpuzzle.v1'

interface Wahl { teile: number; form: Form; vorlage: boolean }

function wahlLesen(): Wahl {
  const grund: Wahl = { teile: 12, form: 'puzzle', vorlage: true }
  try {
    const w = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Partial<Wahl>
    return {
      teile: TEILE.includes(w.teile as (typeof TEILE)[number]) ? w.teile! : grund.teile,
      form: w.form === 'quadrat' ? 'quadrat' : 'puzzle',
      vorlage: w.vorlage !== false,
    }
  } catch { return grund }
}

/**
 * Bilderpuzzle (Spiele, #/bilderpuzzle; Michael, 2026-11-21): Anzahl Teile und Form wählen, dann ein Bild antippen. Die Bilder sind die
 * Illustrationen von Taktland, dazu eigene Fotos, die nur auf dem Gerät bleiben. Gespielt wird im ganzen Fenster (src/bilderpuzzle.ts).
 */
export function Bilderpuzzle() {
  const [wahl, setWahl] = useState<Wahl>(wahlLesen)
  const [eigene, setEigene] = useState<PuzzleBild[]>([])
  const [ohneSpeicher, setOhneSpeicher] = useState(false)
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null)
  const [spiel, setSpiel] = useState<PuzzleBild | null>(null)
  const [scharf, setScharf] = useState<string | null>(null)
  const datei = useRef<HTMLInputElement>(null)

  useEffect(() => { try { localStorage.setItem(SPEICHER, JSON.stringify(wahl)) } catch { /* nur für jetzt */ } }, [wahl])
  useEffect(() => {
    eigeneLaden().then((l) => { if (l) setEigene((jetzt) => [...jetzt, ...l.filter((e) => !jetzt.some((j) => j.id === e.id))]); else setOhneSpeicher(true) })
  }, [])
  useEffect(() => {
    if (!scharf) return
    const t = setTimeout(() => setScharf(null), 3000)
    return () => clearTimeout(t)
  }, [scharf])

  async function hinzufuegen(dateien: File[]) {
    if (!dateien.length) return
    setMeldung({ text: dateien.length > 1 ? `${dateien.length} Bilder werden geladen …` : 'Das Bild wird geladen …' })
    let gut = 0, schlecht = 0
    for (const d of dateien) {
      try {
        const { bild, gemerkt } = await eigenesHinzufuegen(d)
        if (!gemerkt) setOhneSpeicher(true)
        setEigene((l) => [bild, ...l]); gut++
      } catch { schlecht++ }
    }
    setMeldung(schlecht === dateien.length
      ? { text: 'Das Bild liess sich nicht öffnen. Wähle ein Foto im Format JPG oder PNG.', fehler: true }
      : schlecht ? { text: `${gut} Bilder hinzugefügt, ${schlecht} liessen sich nicht öffnen.`, fehler: true }
      : { text: gut === 1 ? 'Das Bild ist hinzugefügt. Tippe darauf, um es zu puzzeln.' : `${gut} Bilder sind hinzugefügt.` })
  }

  function loeschen(b: PuzzleBild) {
    if (scharf !== b.id) { setScharf(b.id); return }
    setScharf(null)
    setEigene((l) => l.filter((e) => e.id !== b.id))
    void eigenesLoeschen(b.id)
  }

  const knopf = (an: boolean) => `min-w-12 rounded-lg border px-3 py-2.5 text-lg font-bold tabular-nums ${an
    ? 'border-sbb-anthracite bg-sbb-anthracite text-white dark:border-sbb-white dark:bg-sbb-white dark:text-sbb-black'
    : 'border-sbb-cloud bg-white hover:border-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight dark:hover:border-sbb-white'}`

  return (
    <div className="px-4 pb-6">
      <Zurueck onClick={() => { window.location.hash = '#/spiele' }} text="Alle Spiele" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Bilderpuzzle</h1>
      <p className="mt-2 max-w-3xl leading-relaxed">
        Wähle, wie viele Teile es sein sollen, und tippe auf ein Bild. Die Teile liegen rund um den Rahmen. Zieh jedes an seinen Platz:
        Stimmt er, rastet es ein. Zum Puzzeln gibt es alle Bilder von Taktland, am Tag und in der Nacht, oder ein eigenes Foto.
      </p>

      <div className="mt-5 grid gap-5">
        <fieldset>
          <legend className={LEISE}>Wie viele Teile?</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {TEILE.map((n) => (
              <button key={n} type="button" aria-pressed={wahl.teile === n} onClick={() => setWahl({ ...wahl, teile: n })}
                      className={knopf(wahl.teile === n)}>{n}</button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-x-8 gap-y-5">
          <fieldset className="min-w-64">
            <legend className={LEISE}>Form der Teile</legend>
            <div className="segmente mt-1.5 grid grid-cols-2">
              {([['puzzle', 'Puzzleteile'], ['quadrat', 'Quadrate']] as const).map(([w, t]) => (
                <button key={w} type="button" aria-pressed={wahl.form === w} onClick={() => setWahl({ ...wahl, form: w })}
                        className="segment px-3 py-2">{t}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="min-w-64">
            <legend className={LEISE}>Bild blass im Rahmen</legend>
            <div className="segmente mt-1.5 grid grid-cols-2">
              {([[true, 'Zeigen'], [false, 'Nicht zeigen']] as const).map(([w, t]) => (
                <button key={t} type="button" aria-pressed={wahl.vorlage === w} onClick={() => setWahl({ ...wahl, vorlage: w })}
                        className="segment px-3 py-2">{t}</button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <h2 className="mt-8 text-xl font-bold tracking-tight">Bild antippen und los</h2>
      {meldung && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${meldung.fehler
          ? 'bg-sbb-red text-white' : 'kachel'}`}>{meldung.text}</p>
      )}
      <input ref={datei} type="file" accept="image/*" multiple hidden aria-label="Eigenes Bild hinzufügen"
             onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ''; void hinzufuegen(l) }} />
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {/* ohne Namen, die eigenen Bilder und «Eigenes Bild oder Foto» am Schluss (Michael, 2026-11-22: «Bildernamen entfernen. Eigenes Bild am Schluss») */}
        {[...BILDER, ...eigene].map((b) => (
          <li key={b.id} className="relative flex">
            <button type="button" onClick={() => setSpiel(b)} aria-label={`${b.titel} puzzeln`}
                    className="kachel kachel-link flex w-full flex-col overflow-hidden text-left">
              <img src={b.url} alt="" loading="lazy" className="aspect-[2/1] w-full object-cover" />
            </button>
            {b.eigenes && (
              <button type="button" onClick={() => loeschen(b)} aria-label="Bild löschen"
                      className={`absolute right-1.5 top-1.5 rounded-lg px-2.5 py-1 text-sm font-bold ${scharf === b.id
                        ? 'bg-sbb-red text-white' : 'bg-white/90 text-sbb-black'}`}>
                {scharf === b.id ? 'Löschen' : '×'}
              </button>
            )}
          </li>
        ))}
        <li className="flex">
          <button type="button" onClick={() => datei.current?.click()}
                  className="flex aspect-[2/1] min-h-full w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed
                             border-sbb-cement px-2 text-center text-sm font-bold leading-tight hover:border-sbb-black dark:border-sbb-granite dark:hover:border-sbb-white">
            <span className="text-2xl leading-none text-sbb-red dark:text-[#d63a55]" aria-hidden="true">+</span>
            Eigenes Bild oder Foto
          </button>
        </li>
      </ul>
      <p className={`mt-4 ${LEISE}`}>
        Eigene Bilder bleiben im Browser dieses Geräts und werden nicht gesendet. Löschen: × und dann «Löschen» antippen.
        {ohneSpeicher && ' Dieser Browser kann sie nicht speichern: Nach dem Schliessen sind sie wieder weg.'}
      </p>

      {spiel && <Spiel key={`${spiel.id}`} bild={spiel} wahl={wahl}
                       vorlageAendern={(v) => setWahl((w) => ({ ...w, vorlage: v }))}
                       schliessen={() => setSpiel(null)} />}
    </div>
  )
}

/** Das Spiel im ganzen Fenster, über allem */
function Spiel({ bild, wahl, vorlageAendern, schliessen }: {
  bild: PuzzleBild; wahl: Wahl; vorlageAendern: (v: boolean) => void; schliessen: () => void
}) {
  const flaeche = useRef<HTMLDivElement>(null)
  const feld = useRef<Spielfeld | null>(null)
  const konfetti = useRef<HTMLCanvasElement>(null)
  const [stand, setStand] = useState<[number, number]>([0, 0])
  const [fertig, setFertig] = useState(false)
  const [runde, setRunde] = useState(0)
  const [fehler, setFehler] = useState(false)
  const [vorlage, setVorlage] = useState(wahl.vorlage)
  // beim Start gilt, was gerade eingestellt ist, ohne dass das Umschalten das Spiel neu beginnt
  const vorlageJetzt = useRef(wahl.vorlage)

  // die Seite darunter steht still
  useEffect(() => {
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = vorher }
  }, [])

  useEffect(() => {
    let aus = false
    bildLaden(bild.url).then((img) => {
      if (aus || !flaeche.current) return
      feld.current = new Spielfeld(flaeche.current, {
        bild: img, teile: wahl.teile, form: wahl.form, vorlage: vorlageJetzt.current,
        beiStand: (g, a) => setStand([g, a]),
        beiEinrasten: () => antwortTon('richtig'),
        beiFertig: () => {
          window.setTimeout(() => { antwortTon('bestwert'); if (konfetti.current) konfettiWerfen(konfetti.current) }, 250)
          window.setTimeout(() => setFertig(true), 1100)
        },
      })
    }).catch(() => { if (!aus) setFehler(true) })
    return () => { aus = true; feld.current?.beenden(); feld.current = null }
  }, [bild.url, wahl.teile, wahl.form, runde])

  function vorlageUm() {
    const neu = !vorlage
    vorlageJetzt.current = neu
    setVorlage(neu)
    feld.current?.vorlageZeigen(neu)
    vorlageAendern(neu)
  }

  const rund = 'rounded-lg border border-sbb-cloud bg-white/90 font-bold shadow-sm dark:border-sbb-iron dark:bg-sbb-midnight/90'
  return (
    <div className="fixed inset-0 z-[60] select-none overflow-hidden overscroll-none bg-sbb-milk text-sbb-black dark:bg-sbb-midnight dark:text-sbb-white"
         role="dialog" aria-label={`Bilderpuzzle: ${bild.titel}`}>
      <div ref={flaeche} className="absolute inset-0 touch-none" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[200000] flex items-start justify-between gap-2 p-2.5"
           style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', paddingLeft: 'calc(env(safe-area-inset-left) + 10px)', paddingRight: 'calc(env(safe-area-inset-right) + 10px)' }}>
        <button type="button" onClick={schliessen} className={`pointer-events-auto px-4 py-2.5 ${rund}`}>
          <span className="pfeil pfeil-links" aria-hidden="true">←</span> Bilder
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={vorlageUm} aria-pressed={vorlage} title="Bild blass im Rahmen"
                  aria-label="Bild blass im Rahmen zeigen" className={`pointer-events-auto px-3 py-2.5 ${rund} ${vorlage ? '' : 'opacity-60'}`}>
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" fill="currentColor" />
              {!vorlage && <path d="M4 4l16 16" />}
            </svg>
          </button>
          <p className={`px-4 py-2.5 tabular-nums ${rund}`} aria-live="polite">{stand[0]} / {stand[1]}</p>
        </div>
      </div>
      {fehler && <p className="absolute inset-x-4 top-24 kachel p-4">Das Bild liess sich nicht laden.</p>}
      <canvas ref={konfetti} className="pointer-events-none absolute inset-0 z-[150000] size-full" />
      {fertig && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[200001] flex justify-center p-4"
             style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          <div className="pointer-events-auto grid gap-3 rounded-lg bg-white p-5 text-center shadow-lg dark:bg-sbb-charcoal">
            <p className="text-3xl font-bold tracking-tight">Geschafft!</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" autoFocus onClick={() => { setFertig(false); setRunde((r) => r + 1) }}
                      className="rounded-lg bg-sbb-red px-5 py-3 font-bold text-white hover:bg-sbb-red125">Nochmal</button>
              <button type="button" onClick={schliessen}
                      className="rounded-lg border border-sbb-cloud px-5 py-3 font-bold hover:border-sbb-black dark:border-sbb-iron dark:hover:border-sbb-white">
                Anderes Bild
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** kurz Konfetti in den Farben von Taktland */
function konfettiWerfen(c: HTMLCanvasElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  c.width = c.clientWidth; c.height = c.clientHeight
  const farben = ['#a8102e', '#d63a55', '#5a5a5a', '#b35900', '#1d3f8a', '#2f7d4f']
  const zufall = (a: number, b: number) => a + Math.random() * (b - a)
  const stuecke = Array.from({ length: 150 }, () => ({
    x: c.width / 2 + zufall(-60, 60), y: c.height * 0.55, vx: zufall(-9, 9), vy: zufall(-19, -7),
    g: zufall(7, 14), w: zufall(0, 6), vw: zufall(-0.3, 0.3), f: farben[Math.floor(Math.random() * farben.length)],
  }))
  const t0 = performance.now()
  const bild = (t: number) => {
    if (!c.isConnected) return
    ctx.clearRect(0, 0, c.width, c.height)
    for (const s of stuecke) {
      s.vy += 0.38; s.vx *= 0.99; s.x += s.vx; s.y += s.vy; s.w += s.vw
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.w); ctx.fillStyle = s.f; ctx.fillRect(-s.g / 2, -s.g / 4, s.g, s.g / 2); ctx.restore()
    }
    if (t - t0 < 4000) requestAnimationFrame(bild); else ctx.clearRect(0, 0, c.width, c.height)
  }
  requestAnimationFrame(bild)
}
