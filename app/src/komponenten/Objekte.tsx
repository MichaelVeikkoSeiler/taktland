import { useEffect, useState } from 'react'
import { linienProfilLaden } from '../daten'
import type {
  BrueckenEintrag, ListenArt, LinienProfil, TunnelEintrag, UebergangEintrag,
} from '../typen'
import { type Filter, listenAdresse } from '../listen'
import { Zurueck } from './Zurueck'

/** einzahl mit Adjektiv: «1 erfasster Tunnel», «1 erfasste Brücke» */
const TITEL: Record<ListenArt, { mehrzahl: string; einzahl: string; quelle: string }> = {
  tunnel: { mehrzahl: 'Tunnel', einzahl: 'erfasster Tunnel', quelle: 'tunnel' },
  bruecken: { mehrzahl: 'Brücken', einzahl: 'erfasste Brücke', quelle: 'brucken' },
  bahnuebergaenge: { mehrzahl: 'Bahnübergänge', einzahl: 'erfasster Bahnübergang', quelle: 'bahnubergang' },
}

const FELDNAME: Record<string, string> = { kanton: 'Kanton', sicherungsart: 'Sicherungsart' }

/** So, wie die Zahl in den Daten steht, ohne Rundung */
export function genau(n: number) {
  return n.toLocaleString('de-CH', { maximumFractionDigits: 20 })
}

/**
 * Alle Tunnel, Brücken oder Bahnübergänge einer Linie, nach Kilometer
 * geordnet. Die Einträge stehen wie in den Fakten; was fehlt, heisst
 * «keine Angabe» und nicht 0.
 */
export function Objekte({ nr, art, filter, zurueck }: {
  nr: number
  art: ListenArt
  filter: Filter | null
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
  const eintraege = filter ? alle.filter((e) => (e[filter.feld] ?? null) === filter.wert) : alle

  return (
    <div className="px-4 pb-16">
      <Zurueck onClick={zurueck} text={`Linie ${nr}`} />

      <h1 className="mt-4 text-2xl font-bold tracking-tight">{t.mehrzahl} der Linie {nr}</h1>
      {profil && <p className="mt-1 text-sbb-black dark:text-sbb-white">{profil.name}</p>}

      {fehler && <p className="mt-6">Die Liste konnte nicht geladen werden. {fehler}</p>}
      {!profil && !fehler && <p className="mt-6 text-sbb-metal">Wird geladen …</p>}

      {profil && (
        <>
          <p className="mt-4 leading-relaxed">
            {eintraege.length} {eintraege.length === 1 ? t.einzahl : `erfasste ${t.mehrzahl}`}
            {filter && (filter.wert === null
              ? ` ohne eingetragene ${FELDNAME[filter.feld] ?? filter.feld}`
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

          <ol className="mt-4 divide-y divide-sbb-cloud border border-sbb-cloud bg-white
                         dark:divide-sbb-iron dark:border-sbb-iron dark:bg-sbb-midnight">
            {eintraege.map((e, i) => (
              <li key={i} className="px-3 py-2">
                {art === 'tunnel' && <Tunnel t={e as unknown as TunnelEintrag} />}
                {art === 'bruecken' && <Bruecke b={e as unknown as BrueckenEintrag} />}
                {art === 'bahnuebergaenge' && <Uebergang u={e as unknown as UebergangEintrag} />}
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
      <p className="font-medium text-sbb-black dark:text-sbb-white">{name ?? 'ohne Namen'}</p>
      <p className="text-sm text-sbb-metal dark:text-sbb-storm">{teile.join(' · ')}</p>
      {bemerkung && (
        <p className="mt-0.5 text-sm text-sbb-black dark:text-sbb-white">
          Bemerkung der Quelle: «{bemerkung}»
        </p>
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
