import { useEffect, useMemo, useState } from 'react'
import { uebersichtLaden } from '../daten'
import type { BrueckenEintrag, TunnelEintrag, Uebersicht as Daten } from '../typen'
import { Blaettern, useSeiten, vereinfachen } from './Blaettern'
import { genau } from './Objekte'
import { StreckeKarte } from './StreckeKarte'

export type UebersichtArt = 'tunnel' | 'bruecken'

/** Was die Übersicht sich merkt, solange die App offen ist: Wer von einer
 *  Linie zurückkommt, landet auf derselben Seite. */
export interface UebersichtStand {
  begriff: string
  seite: number
  sortierung: string
}

type Tunnel = TunnelEintrag & { linie: number }
type Bruecke = BrueckenEintrag & { linie: number }
type Eintrag = Tunnel | Bruecke

interface Sortierung {
  wert: string
  text: string
  /** kleiner als 0: a kommt vor b */
  vergleich: (a: Eintrag, b: Eintrag) => number
  /** Beschriftung in der Blätterleiste */
  marke: (e: Eintrag) => string
}

const nachName = (a: Eintrag, b: Eintrag) =>
  a.name.localeCompare(b.name, 'de-CH', { sensitivity: 'base' })

/** Einträge ohne Angabe stehen am Schluss, nicht als 0 */
function nachZahl(wert: (e: Eintrag) => number | null, absteigend: boolean) {
  return (a: Eintrag, b: Eintrag) => {
    const x = wert(a)
    const y = wert(b)
    if (x === null || y === null) return x === y ? nachName(a, b) : x === null ? 1 : -1
    return (absteigend ? y - x : x - y) || nachName(a, b)
  }
}

const nachLinie: Sortierung = {
  wert: 'linie', text: 'Nach Linie und Kilometer',
  vergleich: (a, b) => a.linie - b.linie || nachZahl((e) => e.km, false)(a, b),
  marke: (e) => `Linie ${e.linie}`,
}
const alphabetisch: Sortierung = {
  wert: 'alphabet', text: 'Alphabetisch', vergleich: nachName, marke: (e) => e.name,
}

const TEXTE = {
  tunnel: {
    titel: 'Tunnel',
    mehrzahl: 'Tunnel',
    suche: 'Tunnel, Kanton oder Liniennummer',
    sortierungen: [
      { wert: 'laenge', text: 'Längste zuerst',
        vergleich: nachZahl((e) => (e as Tunnel).laenge_m, true),
        marke: (e) => laenge((e as Tunnel).laenge_m) },
      { wert: 'jahr', text: 'Früheste Inbetriebnahme zuerst',
        vergleich: nachZahl((e) => (e as Tunnel).inbetriebnahme_jahr, false),
        marke: (e) => String((e as Tunnel).inbetriebnahme_jahr ?? 'keine Angabe') },
      alphabetisch,
      nachLinie,
    ] as Sortierung[],
  },
  bruecken: {
    titel: 'Brücken',
    mehrzahl: 'Brücken',
    suche: 'Brücke, Kanton oder Liniennummer',
    sortierungen: [
      { wert: 'baueinheiten', text: 'Meiste Baueinheiten zuerst',
        vergleich: nachZahl((e) => (e as Bruecke).baueinheiten, true),
        marke: (e) => baueinheiten((e as Bruecke).baueinheiten) },
      alphabetisch,
      nachLinie,
    ] as Sortierung[],
  },
}

/** Die erste Sortierung ist die, mit der die Übersicht öffnet */
export function ersteSortierung(art: UebersichtArt) {
  return TEXTE[art].sortierungen[0].wert
}

function laenge(m: number | null) {
  return m === null ? 'Länge: keine Angabe' : `${genau(m)} m`
}

function baueinheiten(n: number | null) {
  return n === null ? 'Baueinheiten: keine Angabe' : `${n} ${n === 1 ? 'Baueinheit' : 'Baueinheiten'}`
}

/**
 * Alle erfassten Tunnel oder Brücken, jeder mit seiner Linie. Die Einträge
 * stehen wie in den Fakten der Linie; die Brücken auf Linien ohne eigene Seite
 * sind dabei, nur ohne Verweis.
 */
export function Uebersicht({ art, stand, aendern }: {
  art: UebersichtArt
  stand: UebersichtStand
  aendern: (neu: UebersichtStand) => void
}) {
  const [daten, setDaten] = useState<Daten<TunnelEintrag | BrueckenEintrag> | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const t = TEXTE[art]
  const sortierung = t.sortierungen.find((s) => s.wert === stand.sortierung) ?? t.sortierungen[0]

  useEffect(() => {
    let abgebrochen = false
    uebersichtLaden<TunnelEintrag | BrueckenEintrag>(art)
      .then((d) => { if (!abgebrochen) { setDaten(d); setFehler(null) } })
      .catch((e: Error) => { if (!abgebrochen) setFehler(e.message) })
    return () => { abgebrochen = true }
  }, [art])

  const alle = useMemo(() => (daten?.eintraege ?? []) as Eintrag[], [daten])
  const treffer = useMemo(() => {
    const b = vereinfachen(stand.begriff.trim())
    const liste = b
      ? alle.filter((e) => vereinfachen(e.name).includes(b) || String(e.linie).startsWith(b)
                          || vereinfachen(e.kanton ?? '').includes(b))
      : alle
    return [...liste].sort(sortierung.vergleich)
  }, [alle, stand.begriff, sortierung])

  const { listeOben, sichtbar, leiste, blaettern } = useSeiten(
    treffer, stand.seite, (seite) => aendern({ ...stand, seite }), sortierung.marke)

  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">{t.titel}</h1>
      {art === 'tunnel' ? (
        <p className="mt-2 leading-relaxed">
          Die erfassten Tunnel aus den offenen Daten der SBB, jeder mit der Linie, auf der er
          erfasst ist. Länge und Jahr der ersten Inbetriebnahme stehen wie in der Quelle.
        </p>
      ) : (
        <p className="mt-2 leading-relaxed">
          Die erfassten Brücken aus den offenen Daten der SBB, jede mit der Linie, auf der sie
          erfasst ist. Länge und Baujahr einer Brücke stehen nicht in den Daten.
        </p>
      )}
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Ein Tipp auf einen Eintrag führt zu seiner Linie.
        {daten?.ohne_seite ? <> {daten.ohne_seite} Brücken liegen auf Linien ohne eigene
          Seite in Taktland: Sie haben weniger als zwei Bahnhöfe in Taktland und keinen
          Tunnel. Diese Brücken stehen trotzdem hier, nur ohne Verweis.</> : null}
      </p>
      <StreckeKarte />

      {fehler && <p className="mt-6">Die Liste konnte nicht geladen werden. {fehler}</p>}
      {!daten && !fehler && <p className="mt-6 text-sbb-metal">Wird geladen …</p>}

      {daten && (
        <>
          <label className="mt-6 block">
            <span className="sr-only">{t.mehrzahl} suchen</span>
            <input
              type="search" value={stand.begriff} autoComplete="off"
              onChange={(e) => aendern({ ...stand, begriff: e.target.value, seite: 0 })}
              placeholder={t.suche}
              className="w-full border border-sbb-cloud bg-white px-4 py-3 text-lg text-sbb-black
                         placeholder:text-sbb-metal dark:border-sbb-iron dark:bg-sbb-midnight
                         dark:text-sbb-white"
            />
          </label>

          <label className="mt-3 flex items-center gap-2 text-sm text-sbb-metal dark:text-sbb-storm">
            Sortierung
            <select
              value={sortierung.wert}
              onChange={(e) => aendern({ ...stand, sortierung: e.target.value, seite: 0 })}
              className="min-w-0 border border-sbb-cloud bg-white px-2 py-1 text-sbb-black
                         dark:border-sbb-iron dark:bg-sbb-midnight dark:text-sbb-white"
            >
              {t.sortierungen.map((s) => <option key={s.wert} value={s.wert}>{s.text}</option>)}
            </select>
          </label>

          <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
            {stand.begriff.trim()
              ? `${zahl(treffer.length)} von ${zahl(alle.length)} ${t.mehrzahl}`
              : `${zahl(alle.length)} erfasste ${t.mehrzahl}`}
          </p>

          <div ref={listeOben} className="scroll-mt-2">
            <Blaettern {...leiste} blaettern={(n) => blaettern(n)} name="Seiten" />
          </div>

          <ul className="mt-4 space-y-2 border-t border-sbb-cloud pt-4 dark:border-sbb-iron">
            {sichtbar.map((e, i) => (
              <Zeile key={`${e.linie}-${e.km}-${e.name}-${i}`} e={e}
                     linie={daten.linien[String(e.linie)]} art={art} />
            ))}
          </ul>

          <Blaettern {...leiste} blaettern={(n) => blaettern(n, true)} name="Seiten, unten" />

          {treffer.length === 0 && (
            <p className="mt-8 text-center text-sbb-metal dark:text-sbb-storm">
              Nichts gefunden.
            </p>
          )}

          <p className="mt-6 text-xs text-sbb-metal dark:text-sbb-storm">
            Quelle: {daten.quelle}. Die Einträge stehen wie in den offenen Daten, auch Namen mit
            Abkürzungen. «keine Angabe» heisst: In den Daten steht nichts.
          </p>
        </>
      )}
    </div>
  )
}

function zahl(n: number) {
  return n.toLocaleString('de-CH')
}

function Zeile({ e, linie, art }: {
  e: Eintrag
  linie: { name: string | null; seite: boolean } | undefined
  art: UebersichtArt
}) {
  const t = e as Tunnel
  const b = e as Bruecke
  const teile = art === 'tunnel'
    ? [laenge(t.laenge_m),
       t.inbetriebnahme_jahr === null ? 'Jahr: keine Angabe' : `erstmals in Betrieb ${t.inbetriebnahme_jahr}`,
       t.tunnelsystem ? `Tunnelsystem «${t.tunnelsystem}»` : 'Tunnelsystem: keine Angabe',
       t.kanton ? `Kanton «${t.kanton}»` : 'Kanton: keine Angabe']
    : [b.kanton ? `Kanton «${b.kanton}»` : 'Kanton: keine Angabe', baueinheiten(b.baueinheiten)]
  const wo = [
    `Linie ${e.linie}`,
    linie?.name ?? 'Name der Linie: keine Angabe',
    e.km === null ? 'km: keine Angabe' : `km ${genau(e.km)}`,
  ].join(' · ')

  const inhalt = (
    <span className="min-w-0">
      <span className="block font-medium text-sbb-black dark:text-sbb-white">{e.name}</span>
      <span className="block text-sm text-sbb-black dark:text-sbb-white">{teile.join(' · ')}</span>
      {art === 'tunnel' && t.bemerkung && (
        <span className="block text-sm text-sbb-black dark:text-sbb-white">
          Bemerkung der Quelle: «{t.bemerkung}»
        </span>
      )}
      <span className="block text-sm text-sbb-metal dark:text-sbb-storm">
        {wo}{linie?.seite ? '' : ' · ohne eigene Seite in Taktland'}
      </span>
    </span>
  )

  const rahmen = `flex items-center justify-between gap-3 border border-sbb-cloud bg-white px-4
                  py-3 dark:border-sbb-iron dark:bg-sbb-midnight`
  return (
    <li>
      {linie?.seite ? (
        <a href={`#/linie/${e.linie}`}
           className={`${rahmen} hover:border-sbb-black dark:hover:border-sbb-white`}>
          {inhalt}
          <span className="shrink-0 text-sbb-metal dark:text-sbb-storm" aria-hidden="true">→</span>
        </a>
      ) : (
        <div className={rahmen}>{inhalt}</div>
      )}
    </li>
  )
}
