import { useEffect, useState } from 'react'
import { linienProfilLaden } from '../daten'
import type {
  BrueckenEintrag, ListenArt, LinienProfil, NetzEintrag, TunnelEintrag, UebergangEintrag,
} from '../typen'
import { type Filter, listenAdresse } from '../listen'
import { ObjektKarte } from './Karte'
import { Zurueck } from './Zurueck'
import { Ladefehler } from './Ladefehler'

/** einzahl mit Adjektiv: «1 erfasster Tunnel», «1 erfasste Brücke» */
const TITEL: Record<ListenArt, { mehrzahl: string; einzahl: string; quelle: string }> = {
  tunnel: { mehrzahl: 'Tunnel', einzahl: 'erfasster Tunnel', quelle: 'tunnel' },
  bruecken: { mehrzahl: 'Brücken', einzahl: 'erfasste Brücke', quelle: 'brucken' },
  bahnuebergaenge: { mehrzahl: 'Bahnübergänge', einzahl: 'erfasster Bahnübergang', quelle: 'bahnubergang' },
  netz: { mehrzahl: 'Abschnitte', einzahl: 'erfasster Abschnitt', quelle: 'schienennetz' },
}

const FELDNAME: Record<string, string> = {
  kanton: 'Kanton', sicherungsart: 'Sicherungsart', gleise: 'Streckengleisen',
  spurweite: 'Spurweite', strom: 'Strom', isb: 'Infrastruktur',
}

/** So, wie die Zahl in den Daten steht, ohne Rundung */
export function genau(n: number) {
  return n.toLocaleString('de-CH', { maximumFractionDigits: 20 })
}

/**
 * Alle Tunnel, Brücken oder Bahnübergänge einer Linie, nach Kilometer
 * geordnet. Die Einträge stehen wie in den Fakten; was fehlt, heisst
 * «keine Angabe» und nicht 0.
 */
export function Objekte({ nr, art, filter, markiert, zurueck }: {
  nr: number
  art: ListenArt
  filter: Filter | null
  /** Stelle eines Eintrags, der hervorgehoben wird: von einer Einzelkachel aus */
  markiert: number | null
  zurueck: () => void
}) {
  const [profil, setProfil] = useState<LinienProfil | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    linienProfilLaden(nr)
      .then((p) => { if (!abgebrochen) setProfil(p) })
      .catch((e: Error) => { if (!abgebrochen) setFehler(e.message) })
    return () => { abgebrochen = true }
  }, [nr])

  const t = TITEL[art]
  const alle = (profil?.listen?.[art] ?? []) as unknown as Array<Record<string, unknown>>
  // mit ihrer Stelle in der ganzen Liste, auch wenn ein Filter gilt
  const eintraege = alle.map((e, stelle) => ({ e, stelle }))
    // als Text vergleichen: In der Adresse steht «?gleise=1», in den Daten die Zahl 1
    .filter(({ e }) => !filter
      || (e[filter.feld] === null || e[filter.feld] === undefined
        ? filter.wert === null : String(e[filter.feld]) === filter.wert))

  /** Ein Tipp wählt den Eintrag: oben im Kasten und auf der Karte markiert.
   *  replace: Die Auswahl füllt den Verlauf nicht, «Zurück» führt zur Linie. */
  function waehlen(stelle: number) {
    window.location.replace(listenAdresse(nr, art, null, stelle))
  }

  // Der gewählte Eintrag steht oben in einem eigenen Kasten. Vorher rollte die
  // Seite zu ihm in die Liste, und Bild und Titel waren weg (Simplontunnel:
  // 1000 Pixel nach unten); das wirkte wie ein Sprung.
  const gewaehlt = markiert !== null && !filter ? alle[markiert] : undefined
  // Auf der Karte: Tunnel und Brücken immer alle, damit man sie im Netz sieht.
  // Abschnitte nur die der gezeigten Liste, sonst wäre die ganze Linie rot.
  const karteObjekte = (art === 'netz'
    ? (filter ? eintraege : markiert !== null && gewaehlt
        ? [{ e: gewaehlt, stelle: markiert }] : [])
    : alle.map((e, stelle) => ({ e, stelle })))
    .map(({ e, stelle }) => ({
      kennung: `${nr}:${stelle}`,
      name: art === 'netz' ? `${e.von as string} – ${e.bis as string}` : String(e.name),
      km: typeof e.km === 'number' ? e.km : typeof e.km_von === 'number' ? e.km_von : null,
      bis: typeof e.km_bis === 'number' ? e.km_bis : null,
    }))

  const zeile = (e: Record<string, unknown>) => (
    <>
      {art === 'tunnel' && <Tunnel t={e as unknown as TunnelEintrag} />}
      {art === 'bruecken' && <Bruecke b={e as unknown as BrueckenEintrag} />}
      {art === 'bahnuebergaenge' && <Uebergang u={e as unknown as UebergangEintrag} />}
      {art === 'netz' && <Abschnitt a={e as unknown as NetzEintrag} />}
    </>
  )

  return (
    <div className="px-4 pb-16">
      <Zurueck onClick={zurueck} text={`Linie ${nr}`} />

      <h1 className="mt-4 text-2xl font-bold tracking-tight">{t.mehrzahl} der Linie {nr}</h1>
      {profil && <p className="mt-1 text-sbb-black dark:text-sbb-white">{profil.name}</p>}

      {fehler && <Ladefehler className="mt-6" was="Die Liste konnte nicht geladen werden." fehler={fehler} />}
      {!profil && !fehler && <p className="mt-6 text-sbb-metal">Wird geladen …</p>}

      {profil && gewaehlt && (
        <div className="mt-4 border border-l-4 border-sbb-cloud border-l-sbb-red bg-sbb-milk px-3 py-2
                        dark:border-sbb-iron dark:border-l-sbb-red dark:bg-sbb-charcoal">
          <p className="text-xs uppercase tracking-wide text-sbb-metal dark:text-sbb-storm">Ausgewählt</p>
          {zeile(gewaehlt)}
          <button
            type="button"
            onClick={() => document.getElementById(`eintrag-${markiert}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="mt-1 text-sm text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                       dark:text-sbb-storm dark:hover:text-sbb-white"
          >
            In der Liste zeigen
          </button>
        </div>
      )}

      {profil && art !== 'bahnuebergaenge' && (
        <ObjektKarte art={art} linie={nr} markiert={gewaehlt ? `${nr}:${markiert}` : null}
                     objekte={karteObjekte}
                     waehlen={(kennung) => waehlen(Number(kennung.split(':')[1]))} />
      )}

      {profil && (
        <>
          <p className="mt-4 leading-relaxed">
            {eintraege.length} {eintraege.length === 1 ? t.einzahl : `erfasste ${t.mehrzahl}`}
            {filter && (filter.wert === null
              ? ` ohne eingetragene ${FELDNAME[filter.feld] ?? filter.feld}`
              : filter.feld === 'gleise'
                ? ` mit ${filter.wert} ${filter.wert === '1' ? 'Streckengleis' : 'Streckengleisen'}`
                : ` mit ${FELDNAME[filter.feld] ?? filter.feld} «${filter.wert}»`)}
            {eintraege.length > 1 ? ', nach ihrem Kilometer auf der Linie geordnet.' : '.'}
          </p>
          {filter && (
            <p className="mt-1 text-sm">
              <a href={listenAdresse(nr, art)}
                 className="text-sbb-metal underline underline-offset-2 hover:text-sbb-black
                            dark:text-sbb-storm dark:hover:text-sbb-white">
                Alle {alle.length} {t.mehrzahl} der Linie anzeigen
              </a>
            </p>
          )}

          <ol className="mt-4 kachelliste">
            {eintraege.map(({ e, stelle }) => (
              <li key={stelle} id={filter ? undefined : `eintrag-${stelle}`}
                  aria-current={!filter && stelle === markiert ? 'true' : undefined}>
                <button
                  type="button" onClick={() => waehlen(stelle)}
                  className={`block w-full px-3 py-2 text-left transition-colors ${!filter && stelle === markiert
                    ? 'border-l-4 border-l-sbb-red bg-sbb-milk dark:bg-sbb-charcoal'
                    : 'hover:bg-sbb-milk dark:hover:bg-sbb-charcoal'}`}
                >
                  {zeile(e)}
                </button>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-xs text-sbb-metal dark:text-sbb-storm">
            Quelle: {t.quelle}. Die Einträge stehen wie in den offenen Daten, auch Namen mit
            Abkürzungen. «keine Angabe» heisst: In den Daten steht nichts.
          </p>
        </>
      )}
    </div>
  )
}

function Zeile({ name, teile, bemerkung }: {
  name: string | null
  teile: string[]
  bemerkung?: string | null
}) {
  return (
    <>
      {/* span statt p: die Zeile steht auch in einer Schaltfläche */}
      <span className="block font-medium text-sbb-black dark:text-sbb-white">{name ?? 'ohne Namen'}</span>
      <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{teile.join(' · ')}</span>
      {bemerkung && (
        <span className="mt-0.5 block text-sm text-sbb-black dark:text-sbb-white">
          Bemerkung der Quelle: «{bemerkung}»
        </span>
      )}
    </>
  )
}

function km(n: number | null) {
  return n === null ? 'km: keine Angabe' : `km ${genau(n)}`
}

function Tunnel({ t }: { t: TunnelEintrag }) {
  return (
    <Zeile name={t.name} bemerkung={t.bemerkung} teile={[
      km(t.km),
      t.laenge_m === null ? 'Länge: keine Angabe' : `${genau(t.laenge_m)} m`,
      t.inbetriebnahme_jahr === null
        ? 'Jahr: keine Angabe' : `erstmals in Betrieb ${t.inbetriebnahme_jahr}`,
      t.tunnelsystem ? `Tunnelsystem «${t.tunnelsystem}»` : 'Tunnelsystem: keine Angabe',
      t.kanton ? `Kanton «${t.kanton}»` : 'Kanton: keine Angabe',
    ]} />
  )
}

function Bruecke({ b }: { b: BrueckenEintrag }) {
  return (
    <Zeile name={b.name} teile={[
      km(b.km),
      b.kanton ? `Kanton «${b.kanton}»` : 'Kanton: keine Angabe',
      b.baueinheiten === null ? 'Baueinheiten: keine Angabe'
        : `${b.baueinheiten} ${b.baueinheiten === 1 ? 'Baueinheit' : 'Baueinheiten'}`,
    ]} />
  )
}

/** Ein Abschnitt zwischen zwei Betriebspunkten, aus dem Schienennetz des BAV */
function Abschnitt({ a }: { a: NetzEintrag }) {
  return (
    <Zeile
      name={`${a.von} – ${a.bis}`}
      teile={[
        a.km_von === null || a.km_bis === null
          ? 'km: keine Angabe' : `km ${genau(a.km_von)} bis ${genau(a.km_bis)}`,
        `${a.gleise} ${a.gleise === 1 ? 'Streckengleis' : 'Streckengleise'}`,
        `Spurweite ${a.spurweite}`,
        a.strom,
        `Infrastruktur «${a.isb}»`,
      ]}
    />
  )
}

function Uebergang({ u }: { u: UebergangEintrag }) {
  return (
    <Zeile name={u.name} teile={[
      km(u.km),
      u.sicherungsart ? `Sicherungsart «${u.sicherungsart}»` : 'Sicherungsart: keine Angabe',
      u.gleise === null ? 'gekreuzte Gleise: keine Angabe'
        : `${u.gleise} ${u.gleise === 1 ? 'gekreuztes Gleis' : 'gekreuzte Gleise'}`,
    ]} />
  )
}
