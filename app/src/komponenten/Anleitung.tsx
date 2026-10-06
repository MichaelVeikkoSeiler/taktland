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
    <div className="px-4 pb-4">
      {/* die Bildmarke gross als Einstieg (Michael, 2026-09-27) */}
      <img src="./logo.svg" alt="" className="mt-6 size-16" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">So funktioniert Taktland</h1>
      <p className="mt-2 leading-relaxed">
        Die Reiter oben führen zu Bahnland (Bahnhöfe, Strecken, Brücken, Tunnel,
        Bahnübergänge), Spiele (Duell, Geo, Bahnhofsuche), Standort, Reisetasche und Info. Der rote Knopf «Fahren» ist für unterwegs im Zug.
        Ein Tipp auf ein Thema klappt es auf.
      </p>

      {/* aufklappbar und gestrafft (Michael, 2026-10-01: «sehr, sehr viel Text») */}
      <div className="mt-6 grid gap-2">
      <Abschnitt titel="Bahnhöfe lernen">
        <Punkte>
          <li>
            Aufgenommen sind alle Bahnhöfe mit Infrastruktur der SBB oder der BLS, dazu
            Bahnhöfe anderer Bahnen wie RhB, SOB oder Matterhorn Gotthard Bahn, sofern die
            offenen Daten für mindestens drei Kapitel reichen. Bahnhöfe anderer Bahnen tragen
            das Kürzel ihrer Bahn und haben weniger Kapitel. Dazu kommen Haltestellen der BTI,
            für die keine Fahrgastzahlen erfasst sind: Von ihnen zeigt Taktland nur die
            Stammdaten.
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

      <Abschnitt titel="Spiele">
        <Spiel titel="Duell">
          <li>
            Zwei Bahnhöfe, Linien oder Tunnel, eine Frage, etwa: Welcher Tunnel ist länger? Danach
            stehen die Werte da.
          </li>
          <li>
            Jede richtige Antwort verlängert die Serie, eine falsche setzt sie auf 0. Je länger die
            Serie, desto knapper die Werte. Brücken fehlen, weil ihre Länge nicht in den Daten der SBB steht.
          </li>
          <li>«Zwei Bahnhöfe selbst wählen» vergleicht zwei bestimmte Bahnhöfe, ohne Serie.</li>
        </Spiel>
        <Spiel titel="Geo">
          <li>
            Ein Bahnhof, Tunnel oder eine Brücke wird genannt. Setze den Pin auf der Karte: Je näher,
            desto mehr Punkte. Jede Hilfe auf der Karte kostet 15 % der möglichen Punkte.
          </li>
        </Spiel>
        <Spiel titel="Bahnhofsuche">
          <li>
            Gesucht ist ein Bahnhof, sechs Hinweiskarten liegen verdeckt. Ohne Karte gibt es 80 Punkte,
            jede aufgedeckte kostet 10, der Bezirk 20. Ein falscher Tipp deckt die nächste Karte auf.
          </li>
        </Spiel>
        <Spiel titel="Zu mehreren">
          <li>Auf einem Gerät: Ihr spielt reihum und gebt das Gerät weiter.</li>
          <li>
            Auf mehreren Geräten (Geo, Bahnhofsuche): Wer eröffnet, zeigt einen QR-Code, die anderen
            scannen ihn. Alle spielen dieselben Aufgaben gleichzeitig. Braucht Empfang.
          </li>
        </Spiel>
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
            stehen nicht in den offenen Daten, die Länge einer Brücke nennt die SBB nicht.
            Wo eine Brücke mit «etwa … m» steht, ist das die Länge ihrer Zeichnung in
            swissTLM3D von swisstopo, von Taktland daraus gerechnet.
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
            über Abschnitte, auf denen laut den Zugzahlen der SBB Personenzüge fahren, und über
            Strecken anderer Bahnen aus dem Schienennetz des BAV. Er zeigt Tunnel und Brücken in Wegrichtung. Der Weg ist berechnet; ob ein Zug ihn
            fährt, sagen die Daten nicht.
          </li>
          <li>
            Auf Strecken anderer Bahnen, etwa dem Lötschberg der BLS, stammen Tunnel und
            Brücken aus swissTLM3D von swisstopo: oft ohne Namen, mit der gerundeten Länge
            ihrer Zeichnung, von Taktland gerechnet.
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
            Etwa 20 oder 10 Sekunden vorher meldet Taktland Tunnel, Brücken, Bahnübergänge,
            Bahnhöfe (auch ohne Halt) und Sehenswertes links oder rechts, jede Art mit eigenem Ton. Ob
            Sehenswertes vom Zug aus zu sehen ist, sagen die Daten nicht. Was gemeldet wird,
            lässt sich unten wählen; bei Sehenswertem schweigt «Nicht mehr melden» ein
            einzelnes Objekt.
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
            Die Meldungen zu Bahnübergängen sind keine Sicherheitsinformation. Die Daten
            können unvollständig oder veraltet sein; es gelten allein die Signale vor Ort.
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
            Die «Einstellungen» öffnest du unten auf jeder Seite, über den Quellenangaben. Dort
            stehen Schriftgrösse und Schriftart, ob der Bildschirm beim Fahren wach bleibt, die
            Standardwerte dafür, was beim Fahren gemeldet wird, und unter «Audio» die Lautstärke und
            die Töne einzeln zum Ein- und Ausschalten und Anhören: beim Fahren je Art, einmal oder
            zweimal (etwa 20 und 10 Sekunden vorher), bei den Reitern und nach jeder Antwort.
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

      <Abschnitt titel="Woher die Daten stammen">
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
            Karten: Ortsnamen, Gipfel, Tunnel und Brücken anderer Bahnen und viele Brückenlängen
            von swisstopo (Swiss Map Vector 1000, swissTLM3D), Höhenstufen und die 3D-Reliefs aus swissALTIRegio,
            Seen, Flüsse, Lage der Orte, Wald und Siedlung, in Geo auch Bahnlinien und Kantonsgrenzen aus swissTLMRegio; Grenzen vom BFS, Kulturgüter vom
            BABS, Seilbahnen vom BAV, BLN, Pärke und Moorlandschaften vom BAFU. Alle frei
            nutzbar mit Quellenangabe.
          </li>
          <li>
            Höhenstufen und 3D-Relief aus swissALTIRegio, mit der von swisstopo verlangten Quellenangabe:
            Bundesamt für Landestopografie swisstopo; Tarquini S., I. Isola, M. Favalli,
            A. Battistini, G. Dotta (2023). TINITALY, a digital elevation model of Italy with a
            10 meters cell size (Version 1.1). Istituto Nazionale di Geofisica e Vulcanologia
            (INGV). <Verweis href="https://doi.org/10.13127/tinitaly/1.1">https://doi.org/10.13127/tinitaly/1.1</Verweis>;
            DGM Österreich, geoland.at; DGM1, Bayerische Vermessungsverwaltung –
            www.geodaten.bayern.de; DGM 1 Baden-Württemberg: LGL, www.lgl-bw.de, dl-de/by-2-0;
            RGEAlti, Institut National de l'information géographique et forestière, données
            originales téléchargées sur https://geoservices.ign.fr/rgealti#telechargement5m,
            mise à jour du juillet 2023.
          </li>
          <li>
            Schrift Space Grotesk: Florian Karsten und The Space Grotesk Project Authors, unter der{' '}
            <Verweis href="./lizenzen/space-grotesk-OFL.txt">SIL Open Font License</Verweis>, in
            Taktland mitgeliefert.
          </li>
          <li>
            Unter jeder Zahl steht ihr Datensatz. Vor jeder Veröffentlichung gleicht ein
            Prüfprogramm Texte und Fragen mit den Daten ab; es findet viele Fehler, aber nicht
            jeden.{stand && ` Die Daten wurden am ${stand} geladen.`}
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Fehler und Verfügbarkeit">
        <Punkte>
          <li>
            Die Rohdaten können Fehler enthalten, unvollständig oder veraltet sein; laut ihren{' '}
            <Verweis href="https://data.sbb.ch/page/licence/">Nutzungsbedingungen</Verweis>{' '}
            übernimmt die SBB keine Gewähr dafür. Auch beim Zählen, Umrechnen und Formulieren
            können Fehler passieren.
          </li>
          <li>
            Taktland ist zum Lernen, Nachschlagen und Mitfahren gedacht, nicht für die
            Reiseplanung. Es ist ein privates Lernprojekt und kein Angebot einer Bahnunternehmung.
          </li>
          <li>
            Taktland ist ein freiwilliges, kostenloses Angebot. Es besteht kein Anspruch darauf, dass
            es jederzeit verfügbar ist, fehlerfrei läuft oder weiter betrieben wird; es kann ohne
            Ankündigung geändert, eingeschränkt oder eingestellt werden.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Datenschutz">
        <Punkte>
          <li>
            Verantwortlich ist Michael Veikko Seiler, erreichbar unter{' '}
            <Verweis href="mailto:hallo@taktland.ch">hallo@taktland.ch</Verweis>, auch für Fragen zu deinen Daten.
          </li>
          <li>
            Taktland ist kostenlos. Kein Konto, keine Werbung, keine Profile. Der Fortschritt bleibt im Browser; die
            App lädt keine Schriften oder Programme von fremden Diensten.
          </li>
          <li>
            Den Standort fragt Taktland nur beim Fahren und unter «Standort» ab, nach deiner
            Freigabe. Er wird nie gesendet. Unter «Standort» wird er nur auf dem Gerät
            verrechnet und nicht gespeichert. Beim Fahren merkt sich Taktland die Stelle auf dem
            Weg, damit eine Fahrt weitergehen kann, und hält für das Logbuch den gefahrenen Weg
            mit Datum fest, als Punkte auf der Strecke. Beides bleibt im Browser dieses Geräts
            und kommt nur in die Sicherungsdatei, wenn du sie herunterlädst; löschen lässt es
            sich mit der Fahrt im Logbuch.
          </li>
          <li>
            Ausgeliefert wird die Seite von GitHub Pages, einem Dienst von GitHub (USA); die
            Daten können dabei in die USA gelangen. GitHub speichert laut eigenen Angaben die
            IP-Adressen aus Sicherheitsgründen. Die Adresse taktland.ch ist bei cyon
            registriert. Mails an hallo@taktland.ch nimmt cyon an und leitet sie an ein Postfach
            bei GMX weiter. Beim Öffnen und beim Zurückholen fragt Taktland bei GitHub Pages ab,
            ob es verfügbar ist und ob es eine neue Version gibt, ohne etwas über dich
            mitzuschicken.
          </li>
          <li>
            Wer Geo oder die Bahnhofsuche auf mehreren Geräten spielt, schickt über spiel.taktland.ch
            (cyon, Schweiz) den Namen, der im Raum erscheint, und die Tipps oder Ergebnisse an die
            anderen im selben Raum. Dort liegen nur
            diese Angaben, ohne IP-Adresse und ohne Konto; nach sechs Stunden wird der Raum gelöscht.
            Wie jeder Webserver führt auch dieser ein Zugriffsprotokoll, das cyon verwaltet.
          </li>
          <li>
            Gezählt wird nur, wie oft Taktland geöffnet wird: höchstens einmal am Tag
            «geöffnet» an zaehler.taktland.ch, beim ersten Mal auf einem Gerät «neu». Dort
            stehen je Tag nur Zahlen, ohne IP-Adresse, Kennung und Uhrzeit. Der Zähler liegt
            bei cyon in der Schweiz; wie jeder Webserver führt er ein Zugriffsprotokoll, das
            cyon verwaltet.
          </li>
        </Punkte>
      </Abschnitt>

      <Abschnitt titel="Über Taktland">
        {/* persönlich statt Aufzählung (Michael, 2026-10-01: «etwas auflockern», Variante B); Text von Michael, 2026-10-05 */}
        <blockquote className="mt-2 border-l-2 border-sbb-red pl-4 text-lg leading-relaxed">
          «Ich bin gerne mit dem Zug unterwegs und wollte mehr über das wissen, woran ich
          vorbeifahre. Wie heisst der Bahnhof, an dem ich gerade vorbeifahre? Wie heisst die Brücke
          oder der Tunnel, den wir soeben passieren? Wann folgt der nächste Tunnel? Aus solchen
          Fragen ist Taktland entstanden: aus offenen Daten, die mit Hilfe von KI miteinander
          verknüpft sind. Taktland soll ein Reisebegleiter sein und auch ausserhalb des Zuges
          unterhalten. Eines der Ziele: weg vom Auto und rein in den Zug.»
        </blockquote>
        <p className="mt-3 font-medium">Michael Veikko Seiler</p>
        <p className="text-sm text-sbb-metal dark:text-sbb-storm">Idee, Konzept und Gestaltung</p>
        <p className="mt-4 text-sm leading-relaxed text-sbb-metal dark:text-sbb-storm">
          Der Name spielt auf den Taktfahrplan der Schweiz an. Umgesetzt mit Claude Code, die
          Auftaktbilder mit ChatGPT. Die Texte zu Bahnhöfen und Linien setzt ein Programm aus den
          offenen Daten zusammen.
        </p>
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
/** Alle Themen zu, auch beim Zurückkommen auf Info (Michael, 2026-10-02: «alle schliessen,
 *  wenn man Info verlässt»); die Quellen stehen ohnehin in der Fusszeile */
function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <details className="kachel group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3
                          [&::-webkit-details-marker]:hidden">
        <h2 className="text-lg font-semibold text-sbb-black dark:text-sbb-white">{titel}</h2>
        <span className="pfeil pfeil-unten shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">↓</span>
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

/** ein Spiel als Unterbereich von «Spiele», auf- und zuklappbar, am Anfang zu (Michael, 2026-10-06);
 *  ein Tipp auf den offenen Text schliesst nur dieses Spiel, nicht den ganzen Bereich */
function Spiel({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    // ein eigener, heller Kasten, links bündig mit dem Titel «Spiele», dem die Spiele untergeordnet sind (Michael, 2026-10-06)
    <details className="group/spiel mt-2 rounded-lg bg-white px-4 first:mt-1 dark:bg-sbb-midnight">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2
                          [&::-webkit-details-marker]:hidden">
        <h3 className="font-semibold text-sbb-black dark:text-sbb-white">{titel}</h3>
        <span className="pfeil pfeil-unten shrink-0 text-sm transition-transform group-open/spiel:rotate-180" aria-hidden="true">↓</span>
      </summary>
      <div className="cursor-pointer pb-3" onClick={(e) => {
        if (!tippSchliesst(e)) return
        e.stopPropagation()
        zuklappTon()
        e.currentTarget.closest('details')?.removeAttribute('open')
      }}>
        <Punkte>{children}</Punkte>
      </div>
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
