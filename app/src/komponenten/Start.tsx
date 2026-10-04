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
          Text: Michael, 2026-09-30 («Lernspiel», «Nachschlagewerk», Namensherkunft); 2026-10-01 «Reisebegleiter»;
          2026-10-02 «fahren Züge im Taktfahrplan», nicht «die Züge»: ob alle so fahren, ist nicht belegt;
          2026-10-02 ganzer Text neu von Michael, mit «Kein Fahrplan» */}
      <h2 className="text-2xl font-bold tracking-tight">Willkommen im Taktland</h2>
      <p className="mt-3 text-[15px] leading-relaxed">
        In der Schweiz fahren Züge im Taktfahrplan. Davon hat Taktland seinen Namen.
      </p>
      <p className={absatz}>
        Taktland ist Lernspiel, Nachschlagewerk und Reiseunterhalter zugleich. Zusammengetragen aus öffentlichen
        Datenbanken der Bahn, des Bundes und von swisstopo, stellt es{' '}
        {zahl(index.bahnhoefe_gesamt)} Bahnhöfe vor
        {z ? `, dazu ${zahl(z.linien)} Strecken mit ${zahl(z.tunnel)} Tunneln und ${zahl(z.bruecken)} Brücken.` : '.'}
      </p>
      <p className={absatz}>
        <span className={fett}>Nachschlagen.</span> Jeder Bahnhof hat eine eigene Seite, mit
        Kapiteln etwa zu den Perrons und dazu, wie viele Menschen dort ein- und aussteigen, soweit
        die Daten das hergeben. Zu jeder Strecke gibt es ihre
        Tunnel, Brücken und Bahnübergänge zu erkunden.
      </p>
      <p className={absatz}>
        <span className={fett}>Lernen.</span> Zu jedem Bahnhof gibt es Fragen, mit denen du prüfen
        kannst, was hängen geblieben ist. Im «Duell» treten zwei Bahnhöfe, Strecken oder Tunnel
        gegeneinander an. Und unter Standort siehst du, was in deiner Nähe liegt.
      </p>
      <p className={absatz}>
        <span className={fett}>Mitfahren.</span> Im Zug verfolgt «Fahren» per GPS, wo du bist, und
        meldet einige Sekunden im Voraus, was als Nächstes kommt. Jede Art hat ihren eigenen Ton.
        Dazu kommt Sehenswertes links und rechts der Strecke, etwa Gipfel, Kulturgüter und
        Seilbahnen. Ohne selber im Zug zu sitzen, kannst du deine Wunschstrecken als Probefahrt
        abfahren.
      </p>
      <p className={absatz}>
        <span className={fett}>Kein Fahrplan.</span> Taktland ist kein Reiseplaner und nicht mit
        einem aktuellen Fahrplan verbunden. Es kennt deshalb keine Abfahrtszeiten, Verspätungen oder
        aktuellen Verbindungen. Taktland zeigt dir nicht, wann genau dein Zug fährt – sondern was es
        entlang deiner Reise zu entdecken gibt.
      </p>
      <p className={absatz}>
        <span className={fett}>Ausdrucken.</span> Das Fahrtblatt ist ein Druckbogen für unterwegs:
        oben die Karte des Wegs, unten Tunnel, Brücken, Bahnhöfe, Gipfel und Seen zum Abhaken. Zum
        Beispiel zur Unterhaltung mit Kindern.
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
    </main>
  )
}
