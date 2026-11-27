import type { BahnhofIndex } from '../typen'
import { Klappe } from './Klappe'
import virtuellHell from '../assets/auftakt-virtuell-hell.webp'
import virtuellDunkel from '../assets/auftakt-virtuell-dunkel.webp'
import spieleHell from '../assets/auftakt-spiele-hell.webp'
import spieleDunkel from '../assets/auftakt-spiele-dunkel.webp'
import fahrtHell from '../assets/auftakt-fahrt-hell.webp'
import fahrtDunkel from '../assets/auftakt-fahrt-dunkel.webp'
import bahnhoefeHell from '../assets/auftakt-bahnhoefe-hell.webp'
import bahnhoefeDunkel from '../assets/auftakt-bahnhoefe-dunkel.webp'
import standortHell from '../assets/auftakt-standort-hell.webp'
import standortDunkel from '../assets/auftakt-standort-dunkel.webp'
import logbuchHell from '../assets/auftakt-logbuch-hell.webp'
import logbuchDunkel from '../assets/auftakt-logbuch-dunkel.webp'
import { SPIELE } from '../spiele'

/** die drei grossen Kacheln oben (Virtuelle Schweiz mit dem Bild der VR-Brille, Michael, 2026-11-27) */
const GROSS = [
  { titel: 'Virtuelle Schweiz', adresse: '#/schweiz3d', hell: virtuellHell, dunkel: virtuellDunkel,
    text: 'Das ganze Land in 3D, mit Zügen laut Fahrplan und Echtzeit, Wetter und Sonne, auch mit VR-Brille' },
  // seit 2026-11-27 «Fahren» an zweiter Stelle und ohne «Im Zug:», «Spielen» an dritter (Michael: «Bitte Spiele als dritte Kachel und das zweite soll nur Fahren heissen»)
  { titel: 'Fahren', adresse: '#/fahrt', hell: fahrtHell, dunkel: fahrtDunkel,
    text: 'Im Zug per GPS sehen, was als Nächstes kommt: Tunnel, Brücken, Bahnhöfe' },
  { titel: 'Spielen', adresse: '#/spiele', hell: spieleHell, dunkel: spieleDunkel,
    text: `${SPIELE.filter((x) => x.status === 'spielbereit' && !x.nichtInUebersicht).length} Spiele: Bahnhöfe raten, Strecken erkennen, Probefahren, Gleise bauen` },
]
/** darunter, was hinter den anderen Reitern steckt */
const KLEIN = [
  { titel: 'Bahnhöfe und Strecken', adresse: '#/bahnhoefe', hell: bahnhoefeHell, dunkel: bahnhoefeDunkel,
    text: (i: BahnhofIndex) => `${zahl(i.bahnhoefe_gesamt)} Bahnhöfe nachschlagen` },
  { titel: 'In deiner Nähe', adresse: '#/standort', hell: standortHell, dunkel: standortDunkel, text: () => 'Was um dich herum liegt' },
  { titel: 'Reisetasche', adresse: '#/logbuch', hell: logbuchHell, dunkel: logbuchDunkel, text: () => 'Logbuch, Sammelheft, Fahrblatt' },
]

/** Zahlen über 9999 mit Apostroph, darunter ohne: auf der Startseite bewusst ohne Apostroph ab 1000
 *  (Michael, 2026-10-05: «bei den Zahlen kein Apostroph») */
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
          2026-10-02 ganzer Text neu von Michael, mit «Kein Fahrplan»;
          2026-10-05 «Reisebegleiter», die Spiele unter «Lernen», Bahnübergänge im Sammelheft;
          2026-11-20 «Kein Reiseplaner» statt «Kein Fahrplan» (Michael: «Genau kein Reiseplaner! Das ist mir wichtig. Aber er kennt dennoch mehr als hier steht»);
          2026-11-26 «Gleisbau» als bald öffentlich (Michael: «Erwähne auch das neue Unterhaltungsspiel «Gleisbau» welches bald öffentlich zugänglich wird»);
          2026-11-20 alle Spiele unter «Lernen», «Probefahren» und die Virtuelle Schweiz unter «Mitfahren» (Michael: «Ja gern») */}
      <h2 className="text-2xl font-bold tracking-tight">Willkommen im Taktland</h2>
      {/*
        seit 2026-11-27 oben drei grosse Kacheln statt des langen Texts, der Text in einer Klappe «Mehr über Taktland» (Michael, nach der Rückmeldung zur
        Oberfläche: «Ja gerne so einbauen, mit dem VR-Bild»): Neue sehen sofort, wo sie tippen können
      */}
      <p className="mt-2 max-w-3xl text-[17px] leading-snug">
        Die Bahn der Schweiz zum Erkunden, Spielen und Mitfahren. Aus offenen Daten von Bahn und Bund, kostenlos und ohne Konto.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {GROSS.map((k) => (
          <li key={k.adresse} className="flex">
            <a href={k.adresse} className="kachel kachel-link flex w-full flex-col overflow-hidden">
              <picture>
                <source srcSet={k.dunkel} media="(prefers-color-scheme: dark)" />
                <img src={k.hell} alt="" className="aspect-[16/9] w-full object-cover" />
              </picture>
              <span className="block px-3.5 pb-3.5 pt-2.5">
                <span className="block text-xl font-bold leading-tight tracking-tight">{k.titel} <span className="text-sbb-red" aria-hidden="true">›</span></span>
                <span className="mt-1 block text-[15px] leading-snug text-sbb-metal dark:text-sbb-storm">{k.text}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <h3 className="mt-6 text-lg font-bold">Ausserdem</h3>
      <ul className="mt-2 grid gap-2 md:grid-cols-3">
        {KLEIN.map((k) => (
          <li key={k.adresse} className="flex">
            <a href={k.adresse} className="kachel kachel-link flex w-full items-center gap-3 p-2">
              <picture className="flex-none">
                <source srcSet={k.dunkel} media="(prefers-color-scheme: dark)" />
                <img src={k.hell} alt="" loading="lazy" className="h-12 w-16 rounded-md object-cover" />
              </picture>
              <span className="min-w-0 leading-tight"><span className="block font-bold">{k.titel}</span>
                <span className="block text-sm text-sbb-metal dark:text-sbb-storm">{k.text(index)}</span></span>
            </a>
          </li>
        ))}
      </ul>
      <Klappe titel="Mehr über Taktland" className="mt-6 border-t border-sbb-cloud pt-3 font-bold dark:border-sbb-iron">
      <div className="font-normal">
      {/* ab 1024 Bildpunkten zwei Spalten, die zweite beginnt mit «Kein Reiseplaner» (Michael, 2026-11-25: «Bitte diese Texte ab einer gewissen Fensterbreite
          zweispaltig machen. Anfang der zweiten Spalte bildet: «Kein Reiseplaner»») */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-12">
      <div>
      {/* «In der Schweiz fahren Züge im Taktfahrplan. Davon hat Taktland seinen Namen.» seit 2026-11-26 weg (Michael: «Entfernen») */}
      <p className="mt-3 text-[15px] leading-relaxed">
        {/* seit 2026-11-26 (Michael: «Taktland ist Lernspiel und Reisebegleiter (Auchtung: nicht Reiseplaner) zugleich. Und auch ein bisschen ein
            Nachschlagewerk. Und davon das meiste zusammengetragen aus öffen...») */}
        Taktland ist Lernspiel und Reisebegleiter zugleich. Und auch ein bisschen ein Nachschlagewerk. Das meiste davon ist zusammengetragen
        aus öffentlichen Datenbanken der Bahn, des Bundes und von swisstopo: Taktland stellt{' '}
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
        kannst, was hängen geblieben ist. Dazu kommen die Spiele: Im «Duell» treten zwei Bahnhöfe,
        Strecken oder Tunnel gegeneinander an, bei «Geo» setzt du den Pin auf die Karte, bei der
        «Bahnhofsuche» errätst du einen Bahnhof aus Hinweiskarten, bei «Wo fahre ich?» erkennst du eine
        Strecke aus dem Führerstand, beim «Fahrplan-Puzzle» ordnest du die Halte eines Zugs, und bei der
        «Reisedauer» schätzt du seine Fahrzeit. Manche allein, zu mehreren auf einem Gerät oder auf
        mehreren Geräten. Im «Bilderpuzzle» setzt du Bilder von Taktland zusammen, und im «Gleisbau» legst du Gleise, Bahnhöfe, Tunnel und Brücken
        auf ein Brett und lässt Züge fahren. Und unter Standort siehst du, was in deiner Nähe liegt.
      </p>
      <p className={absatz}>
        <span className={fett}>Mitfahren.</span> Im Zug verfolgt «Fahren» per GPS, wo du bist, und
        meldet einige Sekunden im Voraus, was als Nächstes kommt. Jede Art hat ihren eigenen Ton.
        Dazu kommt Sehenswertes links und rechts der Strecke, etwa Gipfel, Kulturgüter und
        Seilbahnen. Ohne selber im Zug zu sitzen, kannst du deine Wunschstrecken unter Spiele bei
        «Probefahren» abfahren, in 3D und im Führerstand. Und in der «Virtuellen Schweiz» erkundest du das
        ganze Land in 3D, mit Zügen laut Fahrplan, auf Wunsch auch mit einer VR-Brille.
      </p>
      </div>
      <div>
      <p className={`${absatz} lg:mt-3`}>
        <span className={fett}>Kein Reiseplaner.</span> Taktland sucht keine Verbindungen, plant keine Reise
        und ersetzt den offiziellen Fahrplan nicht. Den Fahrplan kennt es trotzdem: In der Virtuellen Schweiz
        fahren Züge und Schiffe laut Fahrplan, bei den Zügen mit Verspätungen und Ausfällen in Echtzeit, wo sie
        gemeldet sind. Beim Start von «Fahren» fragt Taktland «In welchem Zug sitzt du?» und zeigt die Züge,
        die laut Fahrplan gerade vom Start zum Ziel fahren. Und in zwei Spielen geht es um Halte und Fahrzeiten. Für deine Reise gilt der offizielle
        Fahrplan – Taktland zeigt dir, was es unterwegs zu entdecken gibt.
      </p>
      <p className={absatz}>
        <span className={fett}>Ausdrucken.</span> Das Fahrtblatt ist ein Druckbogen für unterwegs:
        oben die Karte des Wegs, unten Tunnel, Brücken, Bahnhöfe, Gipfel und Seen zum Abhaken. Zum
        Beispiel zur Unterhaltung mit Kindern. Es steht in der Reisetasche.
      </p>
      <p className={absatz}>
        <span className={fett}>Festhalten.</span> Was du durchfährst, sammelt Taktland in der
        Reisetasche: im Logbuch jede Fahrt, im Sammelheft jeden Bahnhof, Tunnel, jede Brücke und jeden Bahnübergang.
      </p>
      <p className={absatz}>
        <span className={fett}>Ehrlich.</span> Wo die Daten schweigen, sagt Taktland das, statt zu
        raten. Taktland ist kostenlos, braucht kein Konto, und dein Fortschritt bleibt auf deinem
        Gerät.
      </p>
      </div>
      </div>
      </div>
      </Klappe>
    </main>
  )
}
