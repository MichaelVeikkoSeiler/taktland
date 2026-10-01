import type { BahnhofIndex } from '../typen'

/** Zahlen über 9999 mit Apostroph, darunter ohne (CLAUDE.md) */
function zahl(n: number) {
  return n > 9999 ? n.toLocaleString('de-CH') : String(n)
}

/**
 * Die Startseite: ein Tipp auf «Taktland» führt hierher (Michael, 2026-09-22).
 * Ein Text in einer Schriftgrösse, ohne Verweise, jeder Absatz mit einem fetten
 * Stichwort; die Bereiche stehen oben in den Reitern. Die Zahlen stammen aus dem Index, gezählt in
 * pipeline/export_app.py; so stimmen sie auch, wenn Bahnhöfe oder Strecken
 * dazukommen.
 */
export function Start({ index }: { index: BahnhofIndex }) {
  const z = index.zahlen
  const absatz = 'mt-4 text-[15px] leading-relaxed'
  const fett = 'font-bold'
  return (
    <main className="px-4 py-6">
      {/* h2, nicht h1: «Taktland» im Kopf ist die erste Überschrift der Seite.
          Text: Michael, 2026-09-30 («Lernspiel», «Nachschlagewerk», Namensherkunft); 2026-10-01 «Reisebegleiter» */}
      <h2 className="text-2xl font-bold tracking-tight">Willkommen im Taktland</h2>
      <p className="mt-3 text-[15px] leading-relaxed">
        In der Schweiz fahren die Züge nach dem Taktfahrplan: zur gleichen Minute, Stunde für
        Stunde. Davon hat Taktland seinen Namen. Es ist das Land, das im Takt fährt.
      </p>
      <p className={absatz}>
        Taktland ist Lernspiel, Nachschlagewerk und Reisebegleiter zugleich. Zusammengetragen aus öffentlichen
        Datenbanken der Bahn, des Bundes und von swisstopo, stellt es{' '}
        {zahl(index.bahnhoefe_gesamt)} Bahnhöfe vor
        {z ? `, dazu ${zahl(z.linien)} Strecken mit ${zahl(z.tunnel)} Tunneln und ${zahl(z.bruecken)} Brücken.` : '.'}
      </p>
      <p className={absatz}>
        <span className={fett}>Nachschlagen.</span> Jeder Bahnhof hat einen Steckbrief, etwa zu den
        Perrons und dazu, wie viele Menschen dort ein- und aussteigen. Zu jeder Strecke gibt es ihre
        Tunnel, Brücken und Bahnübergänge. Die Quelle steht jeweils dabei.
      </p>
      <p className={absatz}>
        <span className={fett}>Lernen.</span> Zu jedem Bahnhof gibt es Fragen, mit denen du prüfst,
        was hängen geblieben ist. Im «Duell» treten zwei Bahnhöfe, Strecken oder Tunnel
        gegeneinander an. «Standort» zeigt dir, was in deiner Nähe liegt.
      </p>
      <p className={absatz}>
        <span className={fett}>Mitfahren.</span> Im Zug verfolgt «Fahren» per GPS, wo du bist, und
        meldet einige Sekunden im Voraus, was als Nächstes kommt. Jede Art hat ihren eigenen Ton:
        tief für einen Tunnel, hell für eine Brücke, zwei Töne aufwärts für einen Bahnhof. Dazu
        kommt Sehenswertes links und rechts der Strecke, etwa Gipfel, Kulturgüter und Seilbahnen.
        Ohne Zug spielst du jede Strecke als Probefahrt ab.
      </p>
      <p className={absatz}>
        <span className={fett}>Ausdrucken.</span> Das Fahrtblatt ist ein Druckbogen für unterwegs:
        oben die Karte des Wegs, unten die Tunnel, Bahnhöfe und Sehenswürdigkeiten zum Abhaken.
      </p>
      <p className={absatz}>
        <span className={fett}>Festhalten.</span> Was du durchfährst, sammelt Taktland in der
        Reisetasche: im Logbuch jede Fahrt, im Sammelheft jeden Tunnel und jede Brücke.
      </p>
      <p className={absatz}>
        <span className={fett}>Ehrlich.</span> Wo die Daten schweigen, sagt Taktland das, statt zu
        raten. Taktland ist kostenlos, braucht kein Konto, und dein Fortschritt bleibt auf deinem
        Gerät.
      </p>
      <p className={`${absatz} text-sbb-metal dark:text-sbb-storm`}>
        Oben wählst du einen Bereich. «Info» erklärt, wie Taktland funktioniert.
      </p>
    </main>
  )
}
