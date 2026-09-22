import type { ReactNode } from 'react'
import type { BahnhofIndex } from '../typen'

/** Zahlen über 9999 mit Apostroph, darunter ohne (CLAUDE.md) */
function zahl(n: number) {
  return n > 9999 ? n.toLocaleString('de-CH') : String(n)
}

function Verweis({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="underline underline-offset-2 hover:text-sbb-red">{children}</a>
  )
}

/**
 * Die Startseite: ein Tipp auf «Taktland» führt hierher (Michael, 2026-09-22).
 * Die Zahlen stammen aus dem Index, gezählt in pipeline/export_app.py; so
 * stimmen sie auch, wenn Bahnhöfe oder Strecken dazukommen.
 */
export function Start({ index }: { index: BahnhofIndex }) {
  const z = index.zahlen
  return (
    <main className="px-4 py-6">
      <p className="text-lg leading-relaxed">
        Taktland ist ein Lernspiel rund um die Schweizer Bahn. Es stellt{' '}
        <Verweis href="#/bahnhoefe">{zahl(index.bahnhoefe_gesamt)} Bahnhöfe</Verweis> vor
        {z ? (
          <>
            , dazu <Verweis href="#/strecken">{zahl(z.linien)} Strecken</Verweis> mit{' '}
            <Verweis href="#/tunnel">{zahl(z.tunnel)} Tunneln</Verweis> und{' '}
            <Verweis href="#/bruecken">{zahl(z.bruecken)} Brücken</Verweis>, und fragt dich dazu ab.
          </>
        ) : ' und fragt dich dazu ab.'}{' '}
        Alles, was du hier liest, stammt aus offenen Daten der SBB und des Bundesamts für
        Verkehr. Taktland erfindet nichts dazu, und wo etwas fehlt, steht es als Lücke da.
      </p>
      <p className="mt-4 leading-relaxed">
        Zu jedem Bahnhof gibt es Kapitel mit Fakten und Fragen, etwa zu den Perrons, den Zügen
        oder wie viele Menschen dort ein- und aussteigen. Im <Verweis href="#/duell">Duell</Verweis>{' '}
        treten zwei Bahnhöfe, Strecken oder Tunnel gegeneinander an. Unter{' '}
        <Verweis href="#/strecke">«Strecke»</Verweis> siehst du, welche Tunnel und Brücken
        zwischen zwei Bahnhöfen liegen, und im Zug meldet dir der Fahrtmodus den nächsten.{' '}
        <Verweis href="#/standort">«Standort»</Verweis> zeigt dir, was in deiner Nähe liegt.
      </p>
      <p className="mt-4 leading-relaxed">
        Taktland ist kostenlos, braucht kein Konto, und dein Fortschritt bleibt auf deinem
        Gerät; es ist ein privates Lernprojekt und kein Angebot der SBB.
      </p>
      <p className="mt-6 text-sm text-sbb-metal dark:text-sbb-storm">
        Oben wählst du einen Bereich. Das «i» erklärt, wie Taktland funktioniert.
      </p>
    </main>
  )
}
