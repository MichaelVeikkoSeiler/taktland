import type { BahnhofIndex } from '../typen'

/** Zahlen über 9999 mit Apostroph, darunter ohne (CLAUDE.md) */
function zahl(n: number) {
  return n > 9999 ? n.toLocaleString('de-CH') : String(n)
}

/**
 * Die Startseite: ein Tipp auf «Taktland» führt hierher (Michael, 2026-09-22).
 * Ein Text in einer Schriftgrösse, ohne Verweise; die Bereiche stehen oben in
 * den Reitern. Die Zahlen stammen aus dem Index, gezählt in
 * pipeline/export_app.py; so stimmen sie auch, wenn Bahnhöfe oder Strecken
 * dazukommen.
 */
export function Start({ index }: { index: BahnhofIndex }) {
  const z = index.zahlen
  const absatz = 'mt-4 text-[15px] leading-relaxed first:mt-0'
  return (
    <main className="px-4 py-6">
      <p className={absatz}>
        Taktland ist ein Lernspiel rund um die Schweizer Bahn. Es stellt{' '}
        {zahl(index.bahnhoefe_gesamt)} Bahnhöfe vor
        {z ? `, dazu ${zahl(z.linien)} Strecken mit ${zahl(z.tunnel)} Tunneln und `
          + `${zahl(z.bruecken)} Brücken, und fragt dich dazu ab.` : ' und fragt dich dazu ab.'}
      </p>
      <p className={absatz}>
        Zu jedem Bahnhof gibt es Kapitel mit Fakten und Fragen, etwa zu den Perrons, den Zügen
        oder wie viele Menschen dort ein- und aussteigen. Im Duell treten zwei Bahnhöfe, Strecken
        oder Tunnel gegeneinander an. Unter «Strecke» siehst du, welche Tunnel und Brücken
        zwischen zwei Bahnhöfen liegen, und im Zug meldet dir der Fahrtmodus den nächsten.
        «Standort» zeigt dir, was in deiner Nähe liegt.
      </p>
      <p className={absatz}>
        Entstanden ist Taktland mit einer Rundum-KI-Lösung und eigener Entwicklungsarbeit. Es ist
        kostenlos, braucht kein Konto, und dein Fortschritt bleibt auf deinem Gerät; Taktland ist
        ein privates Lernprojekt und kein Angebot der SBB.
      </p>
      <p className={`${absatz} text-sbb-metal dark:text-sbb-storm`}>
        Oben wählst du einen Bereich. Das «i» erklärt, wie Taktland funktioniert.
      </p>
    </main>
  )
}
