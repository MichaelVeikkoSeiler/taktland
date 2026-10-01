import type { ReactNode } from 'react'
import type { BahnhofIndex } from '../typen'
import { zuklappTon } from '../audio'
import { tippSchliesst } from '../zuklappen'

/**
 * So funktioniert Taktland, und woher die Daten stammen.
 *
 * Auch hier gilt: nichts behaupten, was die App nicht tut. Die Grenze für
 * «Mittlerer Bahnhof» ist TIER_M_DWV in pipeline/build_facts.py; ein Test
 * prüft, dass hier dieselbe Zahl steht.
 */
/** Kein Weg zurück nötig: «Taktland» im Kopf führt zur Startseite */
export function Anleitung({ index }: { index: BahnhofIndex | null }) {
  const stand = index ? datum(index.stand) : null
  return (
    <div className="px-4 pb-16">
      {/* die Bildmarke gross als Einstieg (Michael, 2026-09-27) */}
      <img src="./logo.svg" alt="" className="mt-6 size-16" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">So funktioniert Taktland</h1>
      <p className="mt-2 leading-relaxed">
        Die Reiter oben führen zu Bahnland (Bahnhöfe, Strecken, Brücken, Tunnel), Duell,
        Standort, Reisetasche und Info. Der rote Knopf «Fahren» ist für unterwegs im Zug.
        Ein Tipp auf ein Thema klappt es auf.
      </p>

      {/* aufklappbar und gestrafft (Michael, 2026-10-01: «sehr, sehr viel Text») */}
      <div className="mt-6 grid gap-2">
      <Abschnitt titel="Bahnhöfe lernen">
        <Punkte>
          <li>
            Aufgenommen sind alle Bahnhöfe mit Infrastruktur der SBB, dazu Bahnhöfe anderer
            Bahnen wie BLS, RhB, SOB oder Matterhorn Gotthard Bahn, sofern die offenen Daten
            für mindestens drei Kapitel reichen. Sie tragen das Kürzel ihrer Bahn und haben
            weniger Kapitel.
          </li>
          <li>
            Jede Bahnhofsseite hat Kapitel, etwa Steckbrief, Perrons oder Züge: zuerst ein
            kurzer Text, dann die Zahlen mit ihrem Datensatz, dann die Fragen.
          </li>
          <li>
            Nach jeder Antwort stehen «Richtig» oder «Nicht ganz», eine Erklärung und der
            Beleg aus den Daten. Jede Frage lässt sich nochmals beantworten, es zählt die
            letzte Antwort. «zurücksetzen» löscht den Stand des Bahnhofs.
          </li>
          <li>
            Fragearten: Auswahl, Lückentext, Richtig oder falsch, Mehrfachauswahl,
            Schieberegler (knapp daneben zählt auch), Sortieren, Zuordnen und Gleis antippen.
          </li>
          <li>
            Gross heisst: Für den Bahnhof ist ein Bahnhofplan veröffentlicht. Mittel: kein
            Plan, aber mindestens 5'000 Ein- und Aussteigende an einem Werktag. Klein: alle
            übrigen. Das ist eine Sortierhilfe von Taktland, keine Einstufung der SBB.
          </li>
          <li>
            Kästen «Zum Verständnis» erklären Fachbegriffe allgemein, ohne Bezug auf den
            Bahnhof. Unter «Was diese Daten nicht sagen» steht, was fehlt. Eine 0 heisst
            «nichts erfasst», nicht «nichts vorhanden».
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Duell">
        <Punkte>
          <li>
            Zwei Bahnhöfe, Linien oder Tunnel, eine Frage, etwa: Wo steigen mehr Personen ein
            und aus? Welcher Tunnel ist länger? Danach stehen die Werte da, bei Tunneln auch
            die Bemerkung der Quelle.
          </li>
          <li>
            Jede richtige Antwort verlängert die Serie, eine falsche setzt sie auf 0. Je
            länger die Serie, desto knapper die Werte; ab 4 stehen manchmal vier zur Wahl.
          </li>
          <li>
            Gespielt wird in der ganzen Schweiz oder in einem Kanton mit genug Einträgen.
            Linien und Tunnel ohne Kanton in den Daten spielen nur schweizweit mit. Brücken
            fehlen: Erfasst ist nur die Zahl ihrer Baueinheiten, meist genau eine.
          </li>
          <li>
            «Zwei Bahnhöfe selbst wählen» vergleicht zwei bestimmte Bahnhöfe, ohne Serie.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Strecken, Brücken und Tunnel">
        <Punkte>
          <li>
            «Strecken» sind die Linien der Infrastruktur, etwa Linie 600, keine Zuglinien.
            Die Suche findet sie über Nummer, Namen oder einen Bahnhof. Eine Linienseite zeigt
            die Bahnhöfe nach Kilometer, die erfassten Tunnel, Brücken und Bahnübergänge und
            eine kleine Karte.
          </li>
          <li>
            Das Kapitel «Netz» nennt je Abschnitt Gleise, Spurweite, Strom und Betreiberin,
            aus dem Schienennetz des BAV (Stand 2021). Linien anderer Bahnen tragen das
            Kürzel aus dem Schienennetz und haben keine Tunnel, Brücken und Bahnübergänge:
            Diese führt nur die SBB. Tramlinien fehlen.
          </li>
          <li>
            Die Kilometrierung ist ein Standort, keine Länge. Länge und Baujahr einer Linie
            und einer Brücke stehen nicht in den offenen Daten.
          </li>
          <li>
            «Tunnel» und «Brücken» listen alle erfassten Einträge mit ihrer Linie. Ein Tipp
            öffnet die Liste der Linie mit dem Eintrag oben. Kacheln mit Pfeil führen zur
            Liste dahinter.
          </li>
          <li>
            Die Karten sind selbst gezeichnet, ohne Kartendienst. Sie zeigen auch Seen,
            Flüsse, Gipfel, Kultur, Seilbahnen und Gebiete; die Knöpfe darunter blenden sie
            ein und aus, ein Tipp auf ein Zeichen zeigt Name und Quelle.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Strecke: ein Weg durchs Netz">
        <Punkte>
          <li>
            Start und Ziel wählen, wahlweise einen Bahnhof «Über». Taktland sucht einen Weg
            über Abschnitte, auf denen laut den Zugzahlen der SBB Personenzüge fahren, und
            zeigt Tunnel und Brücken in Wegrichtung. Der Weg ist berechnet; ob ein Zug ihn
            fährt, sagen die Daten nicht.
          </li>
          <li>
            Auf Strecken anderer Bahnen, etwa dem Lötschberg der BLS, stammen Tunnel und
            Brücken aus swissTLM3D von swisstopo: oft ohne Namen, mit der gerundeten Länge
            ihrer Zeichnung.
          </li>
          <li>«Losfahren» startet die Fahrt auf diesem Weg, «Probefahrt» spielt ihn ab.</li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Fahren">
        <Punkte>
          <li>
            «Neue Fahrt»: «Nur Ziel» (Start ist der nächste Bahnhof per GPS), «Start und
            Ziel» oder «Ohne Ziel». «Ohne Ziel» erkennt nach einigen hundert Metern Strecke
            und Richtung und fragt, wenn Strecken nebeneinander liegen.
          </li>
          <li>
            Etwa 20 oder 10 Sekunden vorher meldet Taktland Tunnel, Brücken, Bahnhöfe (auch
            ohne Halt) und Sehenswertes links oder rechts, jede Art mit eigenem Ton. Ob
            Sehenswertes vom Zug aus zu sehen ist, sagen die Daten nicht. Was gemeldet wird,
            lässt sich unten wählen; «Nicht mehr melden» schweigt ein einzelnes Objekt.
          </li>
          <li>
            Am Ziel erklingen drei Töne aufwärts und «Angekommen in …» erscheint. Ein Bahnhof
            gilt als erreicht, wenn der Zug die halbe Länge seines längsten Perrons vor
            seinem Punkt ist (ohne Perrondaten 150 m): Taktland nimmt an, dass der Punkt etwa
            in der Mitte liegt.
          </li>
          <li>
            Die Zeiten sind Schätzungen aus Standort und Tempo, im Tunnel mit dem letzten
            Tempo. Gemeldet wird nur bei offener Seite und eingeschaltetem Bildschirm.
            Hellblau neben dem Band: Links oder rechts liegt ein See.
          </li>
          <li>
            «Probefahren» spielt einen Weg ohne Zug ab, in Echtzeit oder 5- bis 200-mal
            schneller. Das «Fahrtblatt» ist ein Druckbogen mit Karte und Liste zum Abhaken,
            auf einer oder zwei Seiten.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Standort">
        <Punkte>
          <li>
            «Standort bestimmen» zeigt die nächsten Bahnhöfe, Strecken, Brücken, Tunnel und
            Bahnübergänge mit der Luftlinie dorthin und eine Karte. Die Liste folgt dir bis
            «Anhalten».
          </li>
          <li>
            Die Lage ist der Punkt, den die SBB nennt; ein Tunnel ist ein einzelner Punkt,
            nicht die ganze Röhre.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Reisetasche und Fortschritt">
        <Punkte>
          <li>
            Das Logbuch hält jede Fahrt fest, mit Notizen und von Hand eingetragenen Fahrten.
            Das Sammelheft zeigt, welche Tunnel, Brücken und Bahnhöfe du schon durchfahren
            hast; «Fehlt noch» kennt nur die der SBB. Favoriten sind Bahnhöfe mit Stern.
            Unter «Audio» lassen sich die Töne einzeln ein- und ausschalten und anhören: beim Fahren
            je Art, einmal oder zweimal (etwa 20 und 10 Sekunden vorher), bei den Reitern und nach
            jeder Antwort.
            Unter «Einstellungen» stehen Schriftgrösse und Schriftart, ob der Bildschirm beim Fahren
            wach bleibt, und die Standardwerte dafür, was beim Fahren gemeldet wird.
          </li>
          <li>
            Alles bleibt im Browser dieses Geräts, ohne Konto. Handy und Computer zählen
            getrennt; wer die Browserdaten löscht, löscht auch den Fortschritt. Unten im
            Logbuch lässt sich alles als Datei sichern und wieder einlesen.
          </li>
          <li>
            Auf den Startbildschirm legen lohnt sich: auf dem iPhone in Safari über «Teilen»
            und «Zum Home-Bildschirm», auf Android über das Menü von Chrome. Safari löscht
            sonst den Speicher von Websites, die sieben Tage nicht geöffnet wurden.
          </li>
          <li>
            Neue Versionen lädt Taktland von selbst beim Öffnen, nicht während einer Fahrt.
            Wer Taktland vor dem 29. September 2026 unter der alten Adresse bei GitHub
            nutzte: dort die Sicherung herunterladen und hier im Logbuch einlesen.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Woher die Daten stammen" offen>
        <Punkte>
          <li>
            Alles stammt aus offenen Daten. Taktland erfindet nichts dazu; wo etwas fehlt,
            steht es als Lücke da. Werte stehen so da, wie sie in den Daten stehen, zum Teil
            gezählt oder umgerechnet, ohne Vermutungen und ohne Vergleiche.
          </li>
          <li>
            Bahnhöfe, Linien, Tunnel und Brücken: offene Daten der SBB auf{' '}
            <Verweis href="https://data.sbb.ch">data.sbb.ch</Verweis>; die Wartehallen unter
            den Nutzungsbedingungen von{' '}
            <Verweis href="https://opentransportdata.swiss">opentransportdata.swiss</Verweis>.
          </li>
          <li>
            Linien anderer Bahnen und das Kapitel «Netz»: Schienennetz des Bundesamts für
            Verkehr BAV auf{' '}
            <Verweis href="https://data.geo.admin.ch/browser/#/collections/ch.bav.schienennetz">
              data.geo.admin.ch</Verweis>, Stand 6. Juli 2021.
          </li>
          <li>
            Karten: Seen, Gipfel, Tunnel und Brücken anderer Bahnen und viele Brückenlängen
            von swisstopo (Swiss Map Vector 1000, swissTLM3D), Höhenstufen aus swissALTIRegio,
            Flüsse, Wald und Siedlung aus swissTLMRegio; Grenzen vom BFS, Kulturgüter vom
            BABS, Seilbahnen vom BAV, BLN, Pärke und Moorlandschaften vom BAFU. Alle frei
            nutzbar mit Quellenangabe.
          </li>
          <li>
            Unter jeder Zahl steht ihr Datensatz. Vor jeder Veröffentlichung gleicht ein
            Prüfprogramm Texte und Fragen mit den Daten ab; es findet viele Fehler, aber nicht
            jeden.{stand && ` Die Daten wurden am ${stand} geladen.`}
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Fehler sind möglich">
        <Punkte>
          <li>
            Die Rohdaten können Fehler enthalten, unvollständig oder veraltet sein; laut ihren{' '}
            <Verweis href="https://data.sbb.ch/page/licence/">Nutzungsbedingungen</Verweis>{' '}
            übernimmt die SBB keine Gewähr dafür. Auch beim Zählen, Umrechnen und Formulieren
            können Fehler passieren.
          </li>
          <li>
            Taktland ist ein Lernspiel, nicht für die Reiseplanung gedacht, ein privates
            Lernprojekt und kein Angebot einer Bundes- oder Privatbahn.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Datenschutz">
        <Punkte>
          <li>
            Kein Konto, keine Werbung, keine Profile. Der Fortschritt bleibt im Browser; die
            App lädt keine Schriften oder Programme von fremden Diensten.
          </li>
          <li>
            Den Standort fragt Taktland nur beim Fahren und unter «Standort» ab, nach deiner
            Freigabe. Er wird auf dem Gerät verrechnet, weder gespeichert noch gesendet;
            gemerkt wird nur die Stelle auf dem Weg, damit eine Fahrt weitergehen kann.
          </li>
          <li>
            Ausgeliefert wird die Seite von GitHub Pages; GitHub speichert laut eigenen
            Angaben die IP-Adressen aus Sicherheitsgründen. Die Adresse taktland.ch ist bei
            cyon registriert. Beim Öffnen fragt Taktland dort ab, ob es verfügbar ist und ob
            es eine neue Version gibt, ohne etwas über dich mitzuschicken.
          </li>
          <li>
            Gezählt wird nur, wie oft Taktland geöffnet wird: höchstens einmal am Tag
            «geöffnet» an zaehler.taktland.ch, beim ersten Mal auf einem Gerät «neu». Dort
            steht je Tag nur die Zahl, ohne IP-Adresse, Kennung und Uhrzeit. Der Zähler liegt
            bei cyon in der Schweiz; wie jeder Webserver führt er ein Zugriffsprotokoll, das
            cyon verwaltet.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Über Taktland">
        <Punkte>
          <li>Der Name spielt auf den Taktfahrplan der Schweiz an. Taktland ist kostenlos und ohne Werbung.</li>
          <li>
            Entstanden mit Unterstützung von KI: Programm, Textbausteine und Prüfregeln mit
            Claude Code, die Auftaktbilder mit ChatGPT. Die Texte zu Bahnhöfen und Linien
            setzt ein Programm aus den offenen Daten zusammen.
          </li>
          <li>Idee, Konzept und Gestaltung: Michael Veikko Seiler.</li>
        </Punkte>
      </Abschnitt>
      </div>
    </div>
  )
}

/** «2026-09-20» wird zu «20.9.2026». */
function datum(iso: string) {
  const [j, m, t] = iso.split('-').map(Number)
  return j && m && t ? `${t}.${m}.${j}` : iso
}

/** ein Thema als aufklappbare Kachel; der Titel bleibt eine Überschrift */
function Abschnitt({ titel, children, offen = false }: { titel: string; children: ReactNode; offen?: boolean }) {
  return (
    <details className="kachel group" open={offen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3
                          [&::-webkit-details-marker]:hidden">
        <h2 className="text-lg font-semibold text-sbb-black dark:text-sbb-white">{titel}</h2>
        <span className="pfeil shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">↓</span>
      </summary>
      {/* ein Tipp auf den offenen Text schliesst das Thema wieder, ausser auf einen Verweis
          oder beim Markieren von Text (Michael, 2026-10-01) */}
      <div className="cursor-pointer px-4 pb-4" onClick={(e) => {
        if (!tippSchliesst(e)) return
        zuklappTon()
        e.currentTarget.closest('details')?.removeAttribute('open')
      }}>{children}</div>
    </details>
  )
}

function Punkte({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-2 list-disc space-y-2 pl-5 leading-relaxed marker:text-sbb-red">
      {children}
    </ul>
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
