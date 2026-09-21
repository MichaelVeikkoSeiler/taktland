import type { ReactNode } from 'react'
import type { BahnhofIndex } from '../typen'

/**
 * So funktioniert Taktland, und woher die Daten stammen.
 *
 * Auch hier gilt: nichts behaupten, was die App nicht tut. Die Grenze für
 * «Mittlerer Bahnhof» ist TIER_M_DWV in pipeline/build_facts.py; ein Test
 * prüft, dass hier dieselbe Zahl steht.
 */
export function Anleitung({ index, zurueck }: { index: BahnhofIndex | null; zurueck: () => void }) {
  const stand = index ? datum(index.stand) : null
  return (
    <div className="px-4 pb-16">
      <button
        type="button" onClick={zurueck}
        className="mt-6 text-sm text-sbb-metal hover:text-sbb-black dark:text-sbb-storm
                   dark:hover:text-sbb-white"
      >← Alle Bahnhöfe</button>

      <h1 className="mt-4 text-2xl font-bold tracking-tight">So funktioniert Taktland</h1>
      <p className="mt-2 leading-relaxed">
        Taktland ist ein Lernspiel zu den
        {index ? ` ${index.bahnhoefe_gesamt} ` : ' '}
        Bahnhöfen der SBB. Alles, was hier über einen Bahnhof steht, stammt aus den offenen
        Daten der SBB.
      </p>

      <Abschnitt titel="Einen Bahnhof lernen">
        <Punkte>
          <li>
            Einen Bahnhof in der Liste suchen oder durchblättern. Zwischen den Pfeilen stehen
            der erste und der letzte Bahnhof der Seite. Ein Tipp darauf zeigt alle Seiten.
          </li>
          <li>
            Jede Bahnhofsseite hat Kapitel, etwa Steckbrief, Perrons oder Züge. Zuerst kommt
            ein kurzer Text, darunter die Zahlen mit ihrem Datensatz, dann die Fragen.
          </li>
          <li>
            Nach jeder Antwort steht «Richtig» oder «Nicht ganz», dazu eine Erklärung und der
            Beleg: die Stelle in den Daten, aus der die Antwort stammt.
          </li>
          <li>
            Jede Frage lässt sich nochmals beantworten, es zählt die letzte Antwort. Oben auf
            der Bahnhofsseite steht, wie viele richtig sind. «zurücksetzen» löscht den Stand
            dieses Bahnhofs.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Die Fragen">
        <dl className="mt-3 grid gap-2">
          <Art name="Auswahl">Eine Antwort antippen.</Art>
          <Art name="Lückentext">Das fehlende Wort oder die fehlende Zahl wählen.</Art>
          <Art name="Richtig oder falsch">Entscheiden, ob die Aussage stimmt.</Art>
          <Art name="Mehrfachauswahl">
            Alle passenden Antworten wählen, dann «Antwort prüfen».
          </Art>
          <Art name="Schieberegler">
            Den Wert einstellen, dann «Antwort prüfen». Knapp daneben zählt auch, danach steht
            der genaue Wert da.
          </Art>
          <Art name="Sortieren">
            Mit den Pfeilen in die richtige Reihenfolge bringen, dann «Reihenfolge prüfen».
          </Art>
          <Art name="Zuordnen">Links antippen, dann den passenden Wert rechts wählen.</Art>
          <Art name="Gleis antippen">Im Gleisschema das gesuchte Gleis antippen.</Art>
        </dl>
      </Abschnitt>

      <Abschnitt titel="Was die Daten nicht sagen">
        <Punkte>
          <li>
            Kästen «Zum Verständnis» erklären Fachbegriffe allgemein. Sie sind keine Angabe
            zum Bahnhof.
          </li>
          <li>
            Am Ende jeder Bahnhofsseite steht unter «Was diese Daten nicht sagen», was fehlt
            oder nur eingeschränkt erfasst ist.
          </li>
          <li>
            Eine 0 heisst: nichts erfasst. Das bedeutet nicht, dass es vor Ort nichts gibt.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Duell">
        <Punkte>
          <li>
            Zwei Bahnhöfe, eine Frage, zum Beispiel: Wo steigen mehr Personen ein und aus,
            welcher liegt höher? Nach der Antwort stehen die Werte da.
          </li>
          <li>
            Jede richtige Antwort verlängert die Serie, eine falsche setzt sie auf 0. Der
            Bestwert bleibt gespeichert.
          </li>
          <li>
            Je länger die Serie, desto näher liegen die Werte beieinander. Ab einer Serie von
            4 stehen manchmal vier Bahnhöfe zur Wahl.
          </li>
          <li>
            Gespielt wird über die ganze Schweiz oder innerhalb eines Kantons, sofern er genug
            Bahnhöfe für faire Paare hat.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Linien">
        <Punkte>
          <li>
            Unter «Linien» stehen Strecken der Infrastruktur mit ihrer Nummer, etwa Linie 600.
            Das sind keine Zuglinien wie eine S-Bahn.
          </li>
          <li>
            Eine Linienseite zeigt Anfang und Ende, die Bahnhöfe nach ihrem Kilometer geordnet,
            die erfassten Tunnel mit Länge, Jahr der ersten Inbetriebnahme und Tunnelsystem
            und die erfassten Brücken mit Kanton und Zahl der Baueinheiten. Jeder Bahnhof in
            der Liste führt zu seiner Seite, und die Bahnhofsseite führt zu seinen Linien.
          </li>
          <li>
            Die Kilometrierung ist ein Standort auf der Linie, keine Länge. Länge, Baujahr und
            Anzahl Gleise einer Linie stehen nicht in den offenen Daten, ebenso wenig Länge und
            Baujahr der Brücken.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Grosser, mittlerer, kleiner Bahnhof">
        <Punkte>
          <li>Grosser Bahnhof: Für ihn ist ein Bahnhofplan veröffentlicht.</li>
          <li>
            Mittlerer Bahnhof: kein Bahnhofplan, aber mindestens 5'000 Ein- und Aussteigende
            an einem Werktag.
          </li>
          <li>Kleiner Bahnhof: alle übrigen.</li>
        </Punkte>
        <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
          Die Einteilung ist eine Sortierhilfe von Taktland, keine Einstufung der SBB.
        </p>
      </Abschnitt>

      <Abschnitt titel="Fortschritt">
        <Punkte>
          <li>
            Der Fortschritt bleibt auf diesem Gerät, im Browser. Es gibt kein Konto, und der
            Fortschritt wird nirgendwohin geschickt.
          </li>
          <li>
            Handy und Computer zählen getrennt, ebenso zwei Browser auf demselben Gerät. Wer
            die Browserdaten löscht, löscht auch den Fortschritt.
          </li>
          <li>
            Unten auf der Startseite lässt sich der ganze Fortschritt löschen.
          </li>
          <li>
            Taktland lässt sich auf den Startbildschirm legen: auf dem iPhone in Safari über
            «Teilen» und «Zum Home-Bildschirm», auf Android über das Menü von Chrome.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Woher die Daten stammen">
        <Punkte>
          <li>
            Die Angaben stammen aus offenen Daten der SBB auf{' '}
            <Verweis href="https://data.sbb.ch">data.sbb.ch</Verweis>. Der Datensatz zu den
            Wartehallen steht unter den Nutzungsbedingungen von{' '}
            <Verweis href="https://opentransportdata.swiss">opentransportdata.swiss</Verweis>.
          </li>
          <li>
            Taktland gibt die Werte so weiter, wie sie in den Daten stehen, zum Teil gezählt
            oder umgerechnet, etwa Züge pro Jahr in Züge pro Tag. Dazu schreibt es nichts:
            keine Vermutungen, keine Vergleiche mit anderen Bahnhöfen. Was fehlt, steht als
            Lücke da.
          </li>
          <li>
            Vor jeder Veröffentlichung gleicht ein Prüfprogramm Texte und Fragen mit den Daten
            ab. Es findet viele Fehler, aber nicht jeden.
          </li>
          <li>
            Unter jeder Zahl in den Kästchen steht ihr Datensatz. Die Liste aller Datensätze
            eines Bahnhofs steht unten auf seiner Seite.
          </li>
          {stand && <li>Die Daten wurden am {stand} geladen.</li>}
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Fehler sind möglich">
        <Punkte>
          <li>
            Die Rohdaten können Fehler enthalten, unvollständig oder veraltet sein. Laut ihren{' '}
            <Verweis href="https://data.sbb.ch/page/licence/">Nutzungsbedingungen</Verweis>{' '}
            übernimmt die SBB keine Gewähr für Aktualität, Richtigkeit und Vollständigkeit der
            Rohdaten.
          </li>
          <li>
            Auch beim Aufbereiten, also beim Zählen, Umrechnen und Formulieren, können Fehler
            passieren.
          </li>
          <li>
            Taktland ist ein Lernspiel und nicht für die Reiseplanung gedacht. Es ist ein
            privates Lernprojekt und kein Angebot der SBB.
          </li>
        </Punkte>
      </Abschnitt>
    </div>
  )
}

/** «2026-09-20» wird zu «20.9.2026». */
function datum(iso: string) {
  const [j, m, t] = iso.split('-').map(Number)
  return j && m && t ? `${t}.${m}.${j}` : iso
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-sbb-black dark:text-sbb-white">{titel}</h2>
      {children}
    </section>
  )
}

function Punkte({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-2 list-disc space-y-2 pl-5 leading-relaxed marker:text-sbb-red">
      {children}
    </ul>
  )
}

function Art({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="border-l-2 border-sbb-red bg-sbb-milk px-3 py-2 dark:bg-sbb-charcoal">
      <dt className="font-semibold text-sbb-black dark:text-sbb-white">{name}</dt>
      <dd className="text-sm text-sbb-black dark:text-sbb-white">{children}</dd>
    </div>
  )
}

function Verweis({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="underline underline-offset-2 hover:text-sbb-red">
      {children}
    </a>
  )
}
