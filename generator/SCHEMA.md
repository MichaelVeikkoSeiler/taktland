# Profil-Schema und Regeln für den Storyboard-Agenten

Ein Profil ist die lernbare Fassung eines Bahnhofs: `data/profiles/{uic}.{lang}.json`.
Grundlage ist ausschliesslich `data/facts/{uic}.json`.

## Die eine Regel

**Jede Zahl und jede sachliche Aussage im Profil muss auf einen Wert in der Faktendatei
zeigen.** Der Agent formuliert, er ergänzt nicht. Was nicht in den Fakten steht, existiert
für das Profil nicht — auch wenn es allgemein bekannt ist.

Kein Weltwissen: nicht «Olten ist ein wichtiger Eisenbahnknoten», nicht «hier halten
ICE-Züge», nicht «der Bahnhof wurde 1856 eröffnet». Auch dann nicht, wenn es stimmt.

## Die zweite Regel: Lücken werden genannt

Fehlt etwas, wird das **ausdrücklich angegeben** und nicht stillschweigend weggelassen.
Die Faktendatei führt dazu den Block `luecken`. Das Profil übernimmt diese Liste
**unverändert** in sein Feld `luecken`, und die App zeigt sie am Bahnhof an.
Der Agent formuliert die Lücken nicht selbst — `validate.py --fix` trägt sie ein.
So können sie weder vergessen noch umgedeutet werden.

Der Unterschied, um den es geht:

| Falsch | Richtig |
|---|---|
| «Der Bahnhof hat kein WLAN» | «Dieser Bahnhof steht nicht in der Liste der WLAN-Standorte» |
| «Es gibt keinen Billettautomaten» | «Es ist kein Billettautomat erfasst» |
| Kapitel Bahnhofplan fehlt einfach | «Für diesen Bahnhof ist kein Bahnhofplan veröffentlicht» |

Eine 0 in den Daten heisst «nicht erfasst», nicht «nicht vorhanden». Deshalb enden
die betreffenden Felder auf `_erfasst`.

## Häufigster Fehler: der factRef zeigt auf die falsche Grösse

Bei einer Frage nach einem **Wert** muss der `factRef` auf diesen Wert zeigen,
nicht auf seine Häufigkeit oder Anzahl.

| Frage (Antwort) | Falsch | Richtig |
|---|---|---|
| Welche Perronhöhe kommt am häufigsten vor? (35 cm) | `...segmente_pro_perronhoehe_cm.35` → 61 | `gleise.perronhoehen_cm[1]` → 35 |
| Welches Gleis hat die längste Kante? (Gleis 12) | `gleise.items[9].perronkante_m` → 269 | `gleise.items[9].nr` → «12» |

Faustregel: Antwort und aufgelöster Wert müssen dasselbe bezeichnen. Zählt die
Frage etwas, zeigt der Verweis auf die Zahl; nennt sie einen Wert, auf den Wert.
Dieser Fehler ist beim Schreiben der ersten vierzehn Profile viermal aufgetreten.

## factRef

Jeder Fakt und jede Frage trägt einen `factRef`: einen Pfad in die Faktendatei.

```
steckbrief.dwv
gleise.items[0].perronhoehen_cm[0]
zuege.staerkster_personenverkehr.zuege_pro_tag
services.billettautomaten
```

`validate.py` löst den Pfad auf und vergleicht ihn mit `value`. Stimmt beides nicht
überein, fällt der Fakt aus dem Profil. Ein Fakt ohne auflösbaren `factRef` ist ungültig.

## Verbotene Verallgemeinerungen

Die offenen Daten sind lückenhaft. Diese Formulierungen sind deshalb gesperrt:

| Gesperrt | Erlaubt |
|---|---|
| «Der Bahnhof hat 16 Gleise» | «Zu 16 Gleisen liegen offene Daten vor» |
| «Alle Perrons sind 55 cm hoch» | «Die erfassten Perronkanten sind 55 cm hoch» |
| «Hier verkehren täglich 56 Züge» | «Auf dem Abschnitt nach Mattstetten verkehren täglich rund 56 Züge» |
| «Der einzige Billettautomat» | «Erfasst ist 1 Billettautomat» |

Gesperrte Wörter in Verbindung mit Zählwerten: *alle, sämtliche, insgesamt, einzige,
gesamt, jeder, keine weiteren*. `validate.py` prüft das.

## Zugzahlen

`zugzahlen` zählt Züge auf einem **Streckenabschnitt**, nicht Halte am Bahnhof.
Jede Aussage dazu muss den Abschnitt nennen. «Züge, die hier halten» ist immer falsch.

## Bauplan und Baubefehl

Profile werden gebaut, nicht geschrieben:

```
data/facts/{uic}.json  +  data/bauplan.json  →  generator/bauen.py  →  data/profiles/{uic}.de.json
```

`bauen.py` führt alle Schritte in fester Reihenfolge aus: Kapitel aus dem
Baukasten, Kürzen auf den Umfang, den die Daten tragen, Kapitel Ausstattung,
Distraktoren richten, Gleisschema für die Gleisfrage, Quellenliste. Bei gleichen
Fakten und gleichem Bauplan entsteht immer dasselbe Profil. Das Datum
`generated` ändert sich nur, wenn sich der Inhalt ändert.

Der Bauplan hält nur fest, was von Hand entschieden ist: die zweite
Stammdaten-Frage mit ihren falschen Antworten, zusätzliche Sätze und Fragen im
Steckbrief, ausgelassene Kapitel. Vorher lagen diese Entscheide in einer
Zwischendatei ausserhalb des Projekts und gingen verloren. Darum musste jede
neue Regel mit einem eigenen Skript in die alten Profile nachgetragen werden.

Zwei Fehler, die der Baubefehl beseitigt hat: Bei 49 Bahnhöfen fehlte das
Gleisschema, die Gleisfrage war in der App nicht zu beantworten. Und das
Kapitel Ausstattung nutzte zwei Datensätze, die in `sources` fehlten, obwohl die
Lizenz die Quellenangabe verlangt. Beides prüft jetzt der Validator.

**Auch die Pipeline tippt keine Zahlen ein.** In den Lücken-Texten stand «Pläne
liegen für 60 der 769 SBB-Bahnhöfe vor», es waren längst 771, und «nur für 26
grosse Bahnhöfe erhoben», wobei «grosse» eine Deutung war. Jetzt zählt
`Data.zaehlung` in `build_facts.py` diese Zahlen aus den Quellen. Der
`datenstand` einer Faktendatei ist das Abrufdatum der Daten
(`data/raw/_abruf.json`, geschrieben von `fetch.py`), nicht das Baudatum: Ein
Neubau ohne neue Daten ändert nichts. Der Validator vergleicht die Lücken eines
Profils im Wortlaut mit den Fakten.

## Aufbau eines Profils

```json
{
  "uic": 8508001,
  "name": "Schönbühl SBB",
  "tier": "S",
  "lang": "de",
  "dataYear": 2025,
  "generated": "2026-09-19",
  "sources": ["passagierfrequenz", "perron", "21197_behig-haltekantesegment"],
  "chapters": [
    {
      "id": "steckbrief",
      "title": "Steckbrief",
      "body": "Zwei bis vier Sätze. Sachlich, ohne Werbung, ohne Superlative.",
      "facts": [
        {
          "label": "Ein- und Aussteigende pro Werktag",
          "value": 810,
          "unit": "Personen",
          "source": "passagierfrequenz",
          "factRef": "steckbrief.dwv"
        }
      ],
      "questions": [
        {
          "type": "single_choice",
          "prompt": "Wie viele Personen steigen an einem Werktag in Schönbühl SBB ein und aus?",
          "options": ["410", "810", "1600", "3200"],
          "correct": 1,
          "explanation": "810 Personen pro Werktag, Stand 2025.",
          "factRef": "steckbrief.dwv",
          "difficulty": 1
        }
      ]
    }
  ]
}
```

### Kapitel-IDs

Erlaubt sind nur Kapitel, die in `verfuegbare_kapitel` der Faktendatei stehen:
`steckbrief`, `stammdaten`, `tagesrhythmus`, `perrons`, `gleise`, `hindernisfreiheit`,
`zuege`, `linien`, `services`, `ausstattung`, `bahnhofplan`.

### Umfang nach Stufe

| Stufe | Kapitel | Fragen gesamt |
|---|---|---|
| S | 4–6 | 5–8 |
| M | 6–8 | 10–14 |
| L | 8–10 | 18–24 |

## Fragen

Typen: `single_choice`, `multiple_choice`, `true_false`, `cloze`, `match`, `sort`,
`hotspot`, `slider`.

- Die **richtige Antwort** muss über `factRef` belegt sein.
- **Falsche Antworten** dürfen erfunden sein — sie müssen aber klar falsch sein und
  dürfen keinem anderen Wert aus derselben Faktendatei entsprechen.
- Distraktoren zu Mengen: plausibler Abstand, nicht Faktor 100.
- Stammen die Optionen von Natur aus aus einer bekannten Menge — Jahre, Gleisnummern,
  Wochentage, Nachbarabschnitte —, dann sind auch die falschen Optionen echte Werte.
  Solche Fragen setzen `optionen_aus_fakten: true`. Ohne dieses Feld warnt der Validator,
  weil eine falsche Antwort, die anderswo stimmt, sonst unfair ist.
- `explanation` erklärt in einem Satz, warum die Antwort stimmt, und nennt das Jahr,
  wenn der Wert ein Jahr trägt.
- `difficulty`: 1 = ablesbar, 2 = verknüpfen, 3 = überlegen.

## Die Fragetypen im Einzelnen

Bei jedem Typ muss die Lösung aus den Fakten stammen. Wie das geprüft wird, steht dabei.

### single_choice, multiple_choice

`options` als Liste, `correct` als Index oder Liste von Indizes. Die richtige Antwort
muss dem Wert unter `factRef` entsprechen.

### true_false

`correct` ist `true` oder `false`. `factRef` zeigt auf den Wert, um den es geht.

### slider

`min`, `max`, `step`, `unit`, `correct` als Zahl. Gilt als richtig, wenn die Eingabe
höchstens eine Schrittweite oder 5 Prozent der Spanne daneben liegt.

**Die Antwort darf nicht am Rand der Spanne liegen.** Der Regler startet unten,
eine Spanne von 0 bis 5 mit der Antwort 5 wäre also nur ein Zug nach rechts.
Ebenso wenig taugt eine Spanne, die mittig um die Antwort liegt - dann stünde
der Regler beim Öffnen schon fast richtig. Lege die Spanne unsymmetrisch an.

Für «wie viele von N», wo die Antwort 0 oder N ist, nimm einen anderen Fragetyp.

**Höchstens ein Viertel der Spanne darf als richtig zählen.** Wegen der
Toleranz von einer Schrittweite zählten bei «Kilometer 2.354» auf einem
Regler von 1 bis 4 in Einerschritten die Stellungen 2 und 3 als richtig, also
die Hälfte. Der Validator rechnet die Toleranz wie die App und meldet einen
Fehler, wenn mehr als 25 % der Spanne richtig wären. Für kleine Dezimalwerte
nimmt der Baukasten Zehntelschritte. Kleine Zählwerte (3 Entwerter, 2 von 5
Gleisen) werden besser als Auswahlfrage gestellt.

### cloze (Lückentext)

`prompt` enthält `___` an der Stelle der Lücke. Sonst wie single_choice.

```json
{ "type": "cloze", "prompt": "Das längste Perron misst ___ Meter.",
  "options": ["418", "433", "460"], "correct": 1, "factRef": "perrons.laengste_m" }
```

### sort (Sortieren)

`items` stehen **in der richtigen Reihenfolge**, die App mischt sie beim Anzeigen.
Jedes Element trägt den Wert, nach dem sortiert wird, und seinen `factRef`.
Der Validator prüft beides: dass jeder Wert stimmt und dass die Reihenfolge
tatsächlich sortiert ist. Damit kann keine falsche Reihenfolge entstehen.

Zwei weitere Regeln prüft der Validator als Fehler:

- **Mindestabstand 5 %** zwischen benachbarten Werten (`MINDESTABSTAND` in
  `taktland.py`). Liegen zwei Werte näher beieinander, fällt einer weg,
  `klar_getrennt()` erledigt das. Bleiben weniger als drei, gibt es keine
  Sortierfrage. Die Erklärung sagt dann: «… bleiben weg.»
- **Nicht nach der Beschriftung sortieren.** Jahreszahlen nach Jahr zu ordnen
  ist keine Frage, die Lösung steht auf den Karten. Sortiert wird nach dem
  Wert, der zum Jahr gehört.

```json
{ "type": "sort", "prompt": "Ordne die Gleise nach Perronkante, längste zuerst.",
  "richtung": "absteigend",
  "items": [
    { "label": "Gleis 12", "value": 269, "factRef": "gleise.items[9].perronkante_m" },
    { "label": "Gleis 8",  "value": 263, "factRef": "gleise.items[5].perronkante_m" }
  ],
  "factRef": "gleise.items" }
```

### match (Zuordnen)

`pairs` mit `links`, `rechts` und `factRef` je Paar. Der Wert rechts muss dem Fakt
entsprechen. Die App mischt die rechte Spalte.

**Jeder Wert rechts darf nur einmal vorkommen.** Haben zwei Perrons dieselbe
Länge, taugen sie nicht für eine Zuordnung: Es gäbe zwei richtige Lösungen, und
die App könnte nur eine als richtig werten. Nimm dann andere Paare oder eine
andere Frageform. Die Prüfung weist solche Fragen zurück.

```json
{ "type": "match", "prompt": "Welche Perronkante gehört zu welchem Gleis?",
  "pairs": [ { "links": "Gleis 12", "rechts": "269 m",
               "factRef": "gleise.items[9].perronkante_m" } ],
  "factRef": "gleise.items" }
```

### hotspot

Zeigt ein Schema, das aus den Fakten gezeichnet wird, keine Fotografie und keinen
massstäblichen Plan. `bereiche` nennt die anklickbaren Teile, `correct` den richtigen.

```json
{ "type": "hotspot", "prompt": "Welches Gleis hat die längste Perronkante?",
  "schema": "gleise", "correct": "12", "factRef": "gleise.items[9].nr" }
```

Das Schema darf nur zeigen, was in den Fakten steht: Gleisnummern, Perrontyp,
Länge der Kante, Sektoren. Die Lage zueinander ist erfunden und deshalb als
Schema gekennzeichnet.

## Was die Felder bedeuten

Diese drei Werte werden am häufigsten verwechselt:

| Feld | Bedeutung | So schreibt man es |
|---|---|---|
| `dwv` | Durchschnittlicher **Werktags**verkehr | «an einem Werktag» |
| `dtv` | Durchschnittlicher **Tages**verkehr, Mittel über alle Tage | «im Tagesmittel über das ganze Jahr» |
| `dnwv` | Durchschnittlicher **Nicht-Werktags**verkehr | «an einem freien Tag» |

`dnwv` ist **nicht** «Werktagsverkehr an Nichtwerktagen» und **nicht** «am
Wochenende»: Der Wert umfasst Wochenenden und Feiertage zusammen.

Weitere Felder, die oft missverstanden werden:

- `isb` ist die Infrastrukturbetreiberin, also wem die Anlage gehört.
  `evu` sind die Bahnunternehmen, deren Züge dort fahren. Das ist nicht dasselbe.
- `segmente` sind Perronabschnitte aus der BehiG-Erhebung, keine Gleise.
- `bahnhofbenutzer` zählt auch Personen ohne Zugfahrt und stammt aus einer
  anderen Erhebung als `dwv`. Die beiden Zahlen sind nicht vergleichbar.
- `km_am_bahnhof` ist die Kilometrierung des Bahnhofs auf der Linie, also sein
  Standort. Es ist **nicht** die Länge der Linie. Beweis: Auf der Linie 100
  steht Lausanne bei 0.0 km und Brig bei 145.5 km.

### Das Kapitel `ausstattung`

Zwei Quellen: Mobiliar am Bahnhof und Perronbelag.

- `sitzbaenke`, `infopunkte`, `schliessfaecher` sind **erfasste Stückzahlen**.
  Sie stehen nur da, wo etwas erhoben wurde. Fehlt ein Feld, heisst das nicht
  null, sondern: dazu liegt nichts vor. Schreibe darum «erfasst», nie
  «vorhanden».
- Was die Quelle unter einem **Infopunkt** versteht, sagt sie nicht. Deute es
  nicht als Schalter, Kundendienst oder Anlaufstelle. Nenne nur die Zahl.
- `perronbelag.items` nennt je Perron den Belag und die erfasste Fläche. Ein
  Perron kann mehrere Beläge tragen, dann stehen mehrere Einträge da.
### Zugang zum Perron: drei Fälle

`niveaufreier_zugang` kennt drei Werte, und sie bedeuten Verschiedenes:

| Wert | Bedeutung | Feld in `hindernisfreiheit` |
|---|---|---|
| `ja` | niveaufrei erreichbar | `perrons_niveaufrei` |
| `nein` | ausdrücklich **nicht** niveaufrei | `perrons_nicht_niveaufrei` |
| fehlt | keine Angabe in den Daten | `perrons_ohne_zugangsangabe` |

Schreibe bei `nein` nicht «die Angabe fehlt» und bei einer fehlenden Angabe
nicht «nicht niveaufrei». Und keines von beiden heisst, dass man die Gleise
queren muss.

- Die Quelle führt **keine** Lifte, Toiletten, Defibrillatoren, Sammelplätze
  oder Läden, die bei den meisten Bahnhöfen brauchbar wären. Erfinde sie nicht
  und schreibe auch nicht, es gebe sie nicht.

**Feldnamen gehören nicht in den Text.** «Der dwv-Wert beträgt 51'800» ist
Datenbanksprache. Richtig: «An einem Werktag steigen hier 51'800 Personen ein
und aus.»

## Was gefragt wird, steht im Kapitel

Die App zeigt zu jedem Kapitel den Text und die Faktenliste, direkt darunter
die Fragen. Eine Frage darf nur verlangen, was dort zu lesen ist. Beim Lesen
von Reconvilier fiel auf: «Ordne die Perrons nach erfasster Belagsfläche»
fragte nach 347, 202 und 152 Quadratmetern, die nirgends standen. Die
Prüfung über alle Profile fand 1025 solche Fragen: Werktagszahlen früherer
Jahre, Nettoflächen, Zugzahlen je Abschnitt, Belagsflächen, Perronkanten,
Perronlängen jenseits der vier längsten. Wer das Kapitel gelesen hatte,
konnte nur raten.

- **Sortieren und Zuordnen:** Jeder Wert steht zusammen mit dem, wozu er
  gehört. Entweder in einer Faktenzeile, deren Beschriftung ihn nennt
  («Nettofläche Perron 2»), oder im Text im selben Satzteil («Perron 2 misst
  181 Meter»). Eine Zeile «Längste erfasste Perronkante» ohne Gleisnummer
  genügt nicht.
- **Übrige Fragen:** Die Antwort kommt im Text oder in der Faktenliste vor.

`generator/sichtbar.py` setzt fehlende Werte beim Bauen als Zeilen in die
Faktenliste, geordnet nach Beschriftung, nicht nach Lösung. Eine neue Art
von Sortier- oder Zuordnungsfrage braucht dort einen Eintrag in `ZEILEN`,
sonst bricht der Bau ab. Der Validator prüft die Regel mit `unsichtbar()` in
`taktland.py`.

## Kein Kapitel ohne Frage

Der Baukasten führte die Regel, der Validator prüfte sie nicht. Zürich HB
(Kilometer 0), Sargans (0.1684) und Immensee (0.25695) liegen am Anfang
ihrer einzigen Linie: Für einen Schieberegler taugt das nicht, und ohne
zweite Linie gibt es nichts zuzuordnen. Das Kapitel Linien blieb ohne
Frage. Jetzt fragt es in diesem Fall nach der Liniennummer. Die falschen
Antworten sind echte Linien der nächstgelegenen Bahnhöfe
(`linien_in_der_naehe` im Baukasten). Der Validator meldet jedes Kapitel
ohne Frage als Fehler.

## Drei Regeln, an denen Profile am häufigsten scheitern

**1. Jede Frage braucht eine Erklärung.** `explanation` ist Pflicht, nicht Kür.
Wer falsch antwortet, muss erfahren warum — sonst ist es kein Lernen, sondern Raten.
Die Erklärung nennt den Wert und, wo vorhanden, das Jahr.

**2. Keine Leerformeln.** Sätze, die formal stimmen und nichts sagen, werden
abgelehnt:

| Abgelehnt | Stattdessen |
|---|---|
| «Der Wert hat sich seit 2018 verändert» | «2018 waren es 2000, 2025 sind es 2400» |
| «Die Perronkanten unterscheiden sich leicht» | «Die Perronkanten messen 244 und 246 Meter» |
| «Die Zahl variiert» | die Zahlen nennen |

Wenn ein Wert in den Fakten steht, gehört er in den Text. Ihn zu umschreiben,
statt ihn zu nennen, ist der häufigste Weg, ein Profil wertlos zu machen.

**3. Nicht mehr Fragen, als die Daten tragen.** Der Umfang steht im Auftrag.
Wer darüber hinausgeht, fragt dieselben Werte mehrfach ab. Lieber sechs gute
Fragen als zwanzig, die sich wiederholen.

## Was beim Schreiben von Hand aufgefallen ist

Jeder dieser Punkte ist ein Fehler, der tatsächlich in Profilen stand. Die
meisten fängt der Prüfer inzwischen, aber nicht alle.

**Eine fehlende Angabe ist keine Tatsache.** Das ist mit Abstand die
häufigste Fehlerklasse, und sie tarnt sich immer neu:

| Falsch | Was die Daten sagen | Richtig |
|---|---|---|
| «Die Linie 100 ist 145 km lang» | Brig liegt bei Kilometer 145 | «Brig ist bei Kilometer 145 eingetragen» |
| «In Liestal ist eine Gleisquerung nötig» | zu einem Perron fehlt die Zugangsangabe | «Zu einem Perron steht keine Angabe zum Zugang» |
| «Zu 8 Perrons fehlt die Angabe» | die Angabe lautet «nein» | «8 Perrons sind ausdrücklich nicht niveaufrei» |
| «An keinem Gleis liegt die Kante auf 55 cm» | es wurde gar keine Höhe gemessen | «Zu den Gleisen ist keine Perronhöhe vermerkt» |
| «Zu Gleis 1 und 2 liegen keine Daten vor» | die Gleise 1 und 2 kommen nicht vor | den Satz weglassen |
| «Kein Hilfstritt vorhanden» | 0 Segmente mit Hilfstritt erfasst | «Kein Hilfstritt verzeichnet» |

Die Frage ist jedes Mal: Steht das so in den Daten, oder schliesse ich es
aus dem, was dort steht oder fehlt?

**Keine gerechneten Grössen, auch nicht in Worten.** Eine Summe wie 244
fällt dem Prüfer auf. «Die Hälfte», «zwei Drittel», «doppelt so viele»
sind genauso gerechnet und fallen erst seit einer eigenen Regel auf. Nenne
beide Werte, den Vergleich zieht der Leser selbst.

**Kein Bezugsrahmen ausserhalb des Bahnhofs.** «Einer der meistbefahrenen
Abschnitte», «höher als die meisten Bahnhöfe», «schweizweit» - der
Vergleichswert steht nicht in dieser Faktendatei. Auch wenn es stimmt.

**Keine Frage, die ein Münzwurf ist.** 562 gegen 564 Meter oder zwei
Abschnitte mit je 292 Zügen taugen nicht für «welches ist grösser». Das gilt
auch beim Sortieren: 55'122 gegen 54'972 Züge im Jahr kann niemand wissen,
auch wer das Kapitel gelesen hat. Beim ersten Durchgang durch alle Profile
waren 140 Sortierfragen betroffen, 37 davon fielen ganz weg
(`generator/sortieren_richten.py`). Schwelle: 5 % Abstand.

**Gleichstand ist kein Vorsprung.** «Am stärksten befahren ist A mit 226
Zügen pro Tag. Auf B sind es 226.» Der Vorsprung steckt nur in der
Jahreszahl, der Leser sieht einen Widerspruch. Bei Gleichstand pro Tag nennt
der Text beide Werte («ebenfalls 226»), ohne einen Abschnitt vorzuziehen.

**Sonderfälle nicht an einen Normwert binden.** Der Baukasten kannte «an
allen Gleisen dieselbe Höhe» nur für 55 cm. Münsingen hat an allen drei
Gleisen 30 cm und bekam einen Satz, der nicht sagte, wo. Eine Regel, die für
den häufigsten Wert geschrieben ist, gilt meist auch für die anderen, und
«alle» nur dann, wenn wirklich jedes Gleis eine Höhe trägt.

**Ein Lückentext muss zur Antwort passen.** «An Gleis 1 sind ___ Sektoren
erfasst» mit der Antwort 1 ergibt «1 Sektoren». Das stand in zwei Profilen,
und das Ausstattungskapitel fragte elfmal «sind ___ Infopunkte erfasst» mit
der Antwort 1. Bei 1 fragt der Baukasten «Wie viele … sind erfasst?», und der
Validator meldet eine Mehrzahl nach der Lücke, wenn die Antwort 1 ist
(`MEHRZAHL_NACH_LUECKE` in `taktland.py`).

**Eine 0 wird genannt, nicht weggelassen.** Der Services-Text zählte auf, was
erfasst ist, und nannte fehlende Automaten und Wartehallen. Die Entwerter
hatte die Regel vergessen: Bei Emmenbrücke Gersag stand nichts darüber, dass
keine verzeichnet sind, bei Zürich HB nichts über Wartehallen. Fünf ältere
Profile waren betroffen. Der Validator prüft jetzt für alle drei Bestände,
dass eine 0 im Text vorkommt.

Dasselbe gilt für Perrons ohne Länge: «Zu 2 Perrons liegen Daten vor.
Perron 3/4 misst 221 Meter.» liess das zweite Perron einfach weg (Zwingen,
dazu Renens VD und Aarau). Jetzt steht «Zu Perron 1 ist keine Länge
erfasst», und der Validator prüft es.

**Namen aus den Daten können mit einem Punkt enden.** «Biel/Bienne
Aebistr.» plus Satzpunkt ergab «Aebistr..». Der Baukasten schliesst Sätze
mit `punkt()`, der Validator meldet doppelte Punkte.

**Gleiche Nummern in den Daten.** Muri AG führt zwei Perrons mit der Nummer 1
(180 und 83 Meter). Zwei Karten «Perron 1» kann niemand ordnen oder zuordnen.
Doppelte Nummern bleiben aus Sortier- und Zuordnungsfragen, der Text nennt
die Doppelung («Die Nummer 1 kommt in den Daten zweimal vor»), und der
Validator lehnt gleich beschriftete Karten ab.

**Kein Superlativ ohne Vergleich.** «Am stärksten befahren» bei nur einem
erfassten Abschnitt (Hinwil) sagt nichts. Dann nennt der Text den Wert.

**Der Grenzfall eins.** Sätze, die für mehrere Gleise, Perrons oder Geräte
geschrieben sind, kippen bei genau einem: «Von den 1 erfassten Perrons»,
«Perronhöhen sind zu diesen Gleisen nicht vermerkt» bei einem Gleis,
«Erfasst sind 1 Infopunkt» (15-mal im Ausstattungskapitel). Aufgefallen ist
es bei Pont-Céard mit einem Gleis, einem Perron und einem Entwerter. Jeder
Satz mit einer Zahl davor braucht eine Form für 1. Der Validator kennt die
häufigsten Muster (`EINZAHL` in `taktland.py`).

**Aufzählungen über `aufzaehlung()`.** «SBB und SOB und Thurbo» und «der
Typen BATS und S-POS und ePOS» entstanden an zwei Stellen, die ihre Listen
selbst zusammensetzten. Jetzt gibt es eine Funktion dafür. Eine Liste in einer
Liste steht in Klammern: «3 Billettautomaten (Typen BATS, S-POS und ePOS)
und 2 Billettentwerter».

**Eine Bemerkung wiedergeben, nicht auslegen.** Aus «Ohne AB.» folgt nicht,
dass die Zahl «nicht den gesamten Verkehr am Bahnhof» abdeckt. Das ist ein
Schluss. Die Quelle sagt auch nicht, wofür die Abkürzung steht, also steht
genau das in der Erklärung.

**Stammdaten wörtlich übernehmen.** Der Kanton heisst in den Daten manchmal
«Valais», «Vaud» oder «Ticino». Dann steht das so auf der Faktenkarte, mit
dem Hinweis «laut Stammdaten». Die Gemeinde ist nicht immer der Name des
Bahnhofs: Ziegelbrücke liegt in Schänis, Locarno in Muralto.

**Bemerkungen der Quelle gehören ins Profil.** «Ohne TMR», «Ohne asm» oder
der nur teilweise erfasste Grenzverkehr in Chiasso grenzen die wichtigste
Zahl des Steckbriefs ein. Sie verdienen eine eigene Frage. Der Baukasten
setzt jede Bemerkung wörtlich in den Steckbrief-Text («Die Quelle vermerkt zu
diesen Zahlen: «…»») und baut für «Ohne X.» die Frage selbst. Längere
Bemerkungen bekommen ihre Frage von Hand über `extra_fragen`. Die Bemerkung
zum Auslandverkehr an Grenzbahnhöfen (Buchs SG, St. Margrethen) kehrt wörtlich
wieder, dafür baut der Baukasten die Frage selbst.

**Der stärkste Abschnitt kann ein Güterabschnitt sein.** In Sins verkehren
auf Sins – Oberrüti 99 Güterzüge pro Tag, im Personenverkehr 84. Der Baukasten
nahm `staerkster_abschnitt` und schrieb «Im Personenverkehr verkehren dort 99
Züge». Wer vom Personenverkehr spricht, nimmt `staerkster_personenverkehr`.
Der Validator prüft jetzt, ob «Personenverkehr» oder «Güterverkehr» in
Beschriftung und Frage zur Art des Abschnitts passt, auf den der factRef zeigt.

**Güterzüge nach dem Jahr zählen, nicht nach dem Tag.** Seuzach hat 119
Güterzüge im Jahr, pro Tag gerundet 0. Da stand «Güterverkehr ist auf diesen
Abschnitten keiner erfasst», bei 18 älteren Profilen ebenso. Ist pro Tag
keiner, aber im Jahr einige, heisst der Satz «Im Güterverkehr zählt die
Erhebung bis zu 119 Züge im Jahr auf einem Abschnitt». Der Validator meldet
«keiner», sobald ein Güterabschnitt Züge im Jahr hat.

**Ein einziges Perron, ein einziger Abschnitt.** «0 sind als niveaufrei
vermerkt, 1 ausdrücklich als nicht niveaufrei» (Beinwil am See) und «auf
diesen Abschnitten» bei einem Abschnitt (Niederweningen) sind jetzt Einzahl.
Fehlt beim einzigen Perron die Zugangsangabe ganz, entfällt die Frage «ist
niveaufrei erreichbar»: «falsch» wäre dort eine erfundene Tatsache. Auch die
Belagsfrage spricht dann vom «erfassten Perron», nicht von «den Perrons» (Knonau).

**«Niveaufrei» heisst nicht «kein Gleis queren».** Cortébert und Pfäffikon SZ
schrieben «niveaufrei erreichbar, man muss also kein Gleis überqueren», und
Cortébert fragte danach. Ob der Weg über ein Gleis führt, steht nirgends. Der
Validator kennt die Wendung jetzt als Fehldeutung.

**Auch mit Ausstattung nicht mehr Fragen, als die Daten tragen.** Steinmaur
hat ein Perron, ein Gleis und eine Linie. Der Baukasten baute 15 Fragen, das
Kapitel Ausstattung brachte 2 dazu, erlaubt sind 16 (Richtzahl 14 plus 15 %
Toleranz, dieselbe Grenze wie im Validator). `kuerzen()` zählt
die Ausstattung schon beim Bauen mit und streicht nach `VERZICHTBAR`, zuerst
was einen schon gefragten Wert wiederholt: Züge pro Jahr neben Zügen pro Tag
auf demselben Abschnitt, den Jahresverlauf neben dem Werktagswert, die Frage
nach einer Perronhöhe, wenn keine vermerkt ist. Mols hat weder Zugzahlen noch
Gleise, keine dieser Regeln griff, und der Bau brach mit 11 statt 10 Fragen
ab. Zuletzt entfällt darum die Frage, ob der Bahnhof in der WLAN-Liste steht,
wenn er es nicht tut: Sie prüft ein Fehlen, keinen Wert.

**Jahreszahlen kommen aus den Fakten, nie aus dem Baukasten.** Die Erklärung
zur Werktagsfrage endete fest eingetippt mit «Stand 2025». Die Fahrgastzahlen
von Mols und Matran stammen aber aus 2018, von Bôle und Noiraigue aus 2022,
von drei weiteren Bahnhöfen aus 2024. Der Validator merkte es nur bei Mols,
weil bei den anderen die Zahl 2025 zufällig anderswo in den Fakten stand. Jetzt
nimmt der Baukasten das Jahr aus `steckbrief.jahr` und `zuege.jahr`, und der
Validator vergleicht jedes «Stand JJJJ» in diesen Kapiteln mit dem Jahr der
Quelle. Weicht es vom Datenjahr ab, das die App oben anzeigt, sagt der
Steckbrief «Der Datenstand dieser Zahlen ist 2018.»

**49 ist ein Platzhalter, keine Zählung.** Die Quelle der Fahrgastzahlen
schreibt 49 für «weniger als 50 Ein- und Aussteigende» (ihre eigene Bemerkung,
Courchavon 2023). Die App zeigte bei 30 Bahnhöfen «49 Personen», und 40, 30
oder 20 kamen in den Daten nie vor. Jetzt setzt `build_facts.py` das Feld auf
leer und schreibt die Grenze in `dwv_unter`, `dtv_unter`, `dnwv_unter` (auch im
Verlauf), dazu die Lücke «Genaue Fahrgastzahl». Der Baukasten schreibt
«weniger als 50», fragt dazu keine Zahl ab und lässt die Jahre ohne genaue
Zahl aus der Sortierfrage. Nach einer Änderung an den Fakten auch
`pipeline/build_vergleich.py` laufen lassen, sonst meldet
`validate_vergleich.py` veraltete Werte.

**Keine Gerätedaten ist nicht null Geräte.** Für Köniz und Müntschemier
ordnet die Quelle keine Billettautomaten und Entwerter zu, das Feld
`billettautomaten_erfasst` fehlt ganz. Da stand «Billettentwerter sind keine
verzeichnet», eine erfundene 0. Richtig: «Zu Billettautomaten und
Billettentwertern liegen für diesen Bahnhof keine Daten vor.» Der Validator
meldet «keine verzeichnet», wenn das Feld fehlt.

**Bahnhöfe ohne Stammdaten.** Jestetten und Lottstetten liegen in Deutschland
und fehlen im Haltestellenverzeichnis. Höhe, Gemeinde, Bezirk und Abkürzung
gibt es für sie nicht. `build_facts.py` führt das als Lücke «Stammdaten».
Den Kanton gibt die Passagierfrequenz als «Ausland» an; die App schreibt
dann «Ausland», nicht «Kanton Ausland».

**Das Kürzel hat zwei Quellen.** Automaten, Entwerter und Zugzahlen hängen am
Betriebspunkt-Kürzel. Es kam nur aus `linie-mit-betriebspunkten`, dort fehlen
Jestetten (JE), Lottstetten (LOT), Köniz (KOE) und Müntschemier (MM). Die
Passagierfrequenz führt es für jeden Bahnhof mit, und wo beide Quellen eines
nennen, stimmen sie bei allen 767 Bahnhöfen überein. Sie ist jetzt die zweite
Quelle. In den Zugzahlen ist bei Jestetten und Lottstetten die UIC-Nummer
leer, die Zeilen werden über das Kürzel zugeordnet. Im Perronbelag fehlt bei
beiden `bpuic`; dort hilft `dst_id`, die DiDok-Nummer: In allen 2211 Zeilen
mit beidem gilt `bpuic = 8500000 + dst_id`.

**Fehlende Kapitel sind Lücken.** Ohne Linien (Jestetten, Lottstetten, Köniz,
Müntschemier) oder ohne Zugzahlen (Mols, Bure-Casernes, Grandgourt) fehlte
das Kapitel still. Beides steht jetzt in `luecken`. Mols hat Zugzahlen bis
2024, geladen wird nur das neueste Jahr; die Lücke nennt es darum mit Jahr.

**Keine geschenkten Fragen.** «In welchem Bezirk liegt Meilen?» mit der Antwort
Meilen prüft nichts. Steckt die Antwort im Namen des Bahnhofs, muss auch eine
falsche Antwort aus dem Namen stammen (Wildegg: Gemeinde Möriken-Wildegg,
daneben «Wildegg»), sonst meldet der Validator die Frage.

**Keine Null als Satzgegenstand.** «0 sind als niveaufrei vermerkt, 2
ausdrücklich als nicht niveaufrei» (Rorschach Hafen) heisst jetzt «Beide
erfassten Perrons sind ausdrücklich als nicht niveaufrei vermerkt». Dieselbe
Null stand im Kapitel Hindernisfreiheit nachgestellt und blieb dort stehen:
«Von den 2 erfassten Perrons sind 0 als niveaufrei erreichbar vermerkt»
(Rorschach Hafen, Meggen). Jetzt «Keines der 2 erfassten Perrons ist …». Der
Validator meldet beide Wortstellungen.

**Nettofläche und Belagsfläche sind zwei Grössen.** Die Nettofläche stammt aus
`perron`, die Belagsfläche aus `perronoberflache`. Basel SBB, Perron 5/6: 4'033
und 5'597 Quadratmeter. Die Sortierfrage im Kapitel Ausstattung sagt darum
«Belagsfläche».

**Keine Mengen in Worten, auch nicht allgemein.** «Pläne gibt es nur für einen
kleinen Teil der Bahnhöfe» stand in jeder Bahnhofplan-Frage. Die Zahl nennt die
Lücke bei Bahnhöfen ohne Plan, gezählt von der Pipeline.

**Tagesrhythmus aus dem Baukasten.** Die alten Profile fragten «Welcher
Wochentag ist der stärkste?» bei Freitag 15.4 gegen Donnerstag 15.2 Prozent.
Der Baustein fragt nur gegen klar kleinere Werte und nennt Gleichstand als
«je 12.8 Prozent», nie als Einzelsieger.

**Feste Kennungen für Fragen.** Jede Frage trägt `id`, gebildet aus Kapitel,
Art, factRef und Wortlaut. Die App speichert Antworten darunter. Vorher galt
die Stelle («steckbrief:0»), und fiel eine Frage weg, hing die alte Antwort an
der nächsten.

**Ziffern in Namen sind keine Zahlen.** «Root D4» fiel mit 21 Fehlern durch,
weil der Validator die 4 für einen unbelegten Wert hielt. Wörter aus Buchstaben
und Ziffern, die in einem Namen der Fakten stehen, gelten jetzt als Bezeichnung.

**Einzahl auch in der Ausstattung.** «In den offenen Daten sind für Vernier 1
Sitzbank erfasst» heisst jetzt «ist». Bei «12 Sitzbänke sowie 1 Infopunkt»
bleibt «sind» richtig, die Prüfregel unterscheidet das.

**«Andere» ist kein Automatentyp.** Die Quelle führt Sammelangaben in drei
Sprachen: «Andere», «Autre», «Altri». Bei Le Day und Genève stand «Typen Autre
und ePOS». Steht eine Sammelangabe unter den Typen, nennt der Text keine Typen.
Der Validator meldet sie, wenn sie trotzdem im Text steht. Dasselbe beim
Perronbelag: «erfasst sind Andere, Bituminöses Mischgut sowie Stahl»
(Wiesendangen, auch Zürich HB, Payerne, Puidoux) heisst jetzt «erfasst sind
Bituminöses Mischgut sowie Stahl. Dazu führt die Quelle Belag unter der
Sammelangabe «Andere»». Die Liste der Sammelangaben steht einmal, in
`taktland.SAMMELANGABEN`.

**Segmente ohne Perronhöhe werden genannt.** Blumenau hat 2 Segmente ohne
jede Höhenangabe, daraus wurde «erfasst: .». Chur hat 72 Segmente, nur 58 mit
Höhe, und der Text verschwieg die übrigen 14. Jetzt heisst es «zu 14 ist keine
Perronhöhe vermerkt» oder «Eine Perronhöhe ist zu keinem davon vermerkt». Der
Validator meldet beides: eine leere Aufzählung nach dem Doppelpunkt und
Segmente ohne Höhe, die der Text übergeht.

## Sprache

Deutsch, Schweizer Rechtschreibung: **ss statt ß**. Zahlen über 9999 mit Apostroph:
480'900. «Perron», nicht «Bahnsteig». «Billett», nicht «Fahrkarte». Sie-Form vermeiden,
neutral formulieren.

**Artikel nach dem Wort aus den Daten.** Die Perrontypen der Quelle sind
männlich (Hausperron, Mittelperron), bis auf die Hilfskante. «Perron 1 ist
ein Hilfskante» stand bei Egnach. Wo ein Wort aus den Daten in einen Satz
mit Artikel kommt, richtet sich der Artikel nach dem Wort, nicht nach dem
häufigsten Fall. Der Validator meldet «ein …kante».

## Linienseiten

Gebaut aus `data/linien/{nr}.json` mit `generator/linien_baukasten.py`, geprüft mit
`generator/linien.py --validieren`. Die Kapitelprüfung ist dieselbe wie bei den
Bahnhöfen (`pruefe_kapitel` in `taktland.py`), dazu gilt:

**Welche Linien.** Mindestens zwei Bahnhöfe in Taktland oder mindestens ein Tunnel.
Mit nur der ersten Regel fehlten Gotthard- und Ceneri-Basistunnel, Grauholz-,
Zimmerberg-, Adler- und Weinbergtunnel: Sie liegen auf eigenen Linien ohne Bahnhof
(594 «GBT West», 580, 400, 722, 501, 748). Das Kapitel Bahnhöfe gibt es ab zwei
Bahnhöfen; ein einzelner steht im Kapitel Strecke.

**Kilometrierung ist keine Länge.** Das Kapitel Strecke darf weder «Länge» noch
«lang» noch «misst» sagen. Die Erläuterung erklärt die Kilometrierung allgemein.

**Negative Kilometer.** Linie 220 beginnt bei km -0.4. Die Zahlprüfung las das Minus
nicht mit und meldete 0.4 als unbelegt. Jetzt gehört ein Minus direkt vor der Zahl,
davor ein Leerschlag, zur Zahl («St-Aubin 2», «1-Röhre» bleiben unberührt).

**Gleichstand bei den Tunneln.** Auf Linie 600 gingen acht Tunnel 1874 erstmals in
Betrieb. Keiner ist «der älteste». Bis drei nennt der Text alle, darüber die Zahl
(`anzahl_aelteste` aus der Pipeline, nicht gezählt im Text).

**Tunnelnamen ohne Artikel.** «der Galleria Crocetto» wäre falsch, das Geschlecht
steht nicht in den Daten. Fragen stellen den Namen voran: «Gotthardtunnel: In welchem
Jahr ging dieser Tunnel erstmals in Betrieb?»

**Bemerkungen im Wortlaut.** Wird ein Tunnel genannt, steht seine Bemerkung aus der
Quelle dabei («Länge der Oströhre, da länger als Weströhre»). Sie sagt, was die Zahl
umfasst.

**Die Antwort steckt im Namen.** Linie 748 heisst «ZH Altstetten - ZH Oerlikon, DML»,
gefragt war das Ende «Zurich Oerlikon». `geschenkt()` übersah es wegen Komma und
Umlaut, bei «Wil - Weinfelden» wegen des kurzen «Wil». `verraet()` vergleicht ohne
Umlaute und auch die Abschnitte des Namens.

**Die Form verrät die Antwort.** Stand nur die richtige Antwort mit Klammer da
(«Pozzo Negro (dira)» neben Bahnhofsnamen), war sie ohne Wissen zu erkennen. Die
falschen Antworten haben jetzt dieselbe Form.

**Brücken.** Die Quelle nennt Name, Kilometer, Kanton und die Zahl der Baueinheiten,
keine Länge und kein Baujahr. Die Namen stehen wie in der Quelle; Abkürzungen wie
«PI» oder «WU» werden nicht gedeutet, die Lücke «Namen der Brücken» sagt das. Die
Erläuterung gibt die Beschreibung der Quelle wieder («Durchlass» bis zwei Meter).
Zählungen je Kanton macht die Pipeline (`nach_kanton`), nicht der Text. Bei den
meisten Baueinheiten gilt der Gleichstand wie bei den Tunneln, und die Faktenliste
schneidet eine Gruppe mit gleich vielen nie an.

**Einzahl am Satzende.** «Als Kanton eingetragen sind «Bern» bei 80, … und «Aargau /
Bern» bei 1 Brücken» (Linie 450): Das Wort am Ende galt für alle Zahlen, auch die 1.
Es steht jetzt beim ersten Wert. Bei einer einzigen Brücke heisst es nicht «bei jeder
erfassten Brücke» (Linie 580).

**Abkürzungspunkt am Satzende.** «U Winterthurerstr..» – Namen mit Punkt am Ende laufen
durch `punkt()`.

**Bahnübergänge.** Verwendet sind nur Felder, deren Bedeutung aus den Werten klar ist:
Sicherungsart und Zahl der gekreuzten Gleise. Die Quelle beschreibt den Namen als
«Bezeichnung der Treppe/Rampe» und ein anderes Feld mit einem Text über Ankunftszeiten;
das sind kopierte Beschreibungen, keine Angaben. Sicherungsarten stehen im Wortlaut,
auch gekürzt («Bedarfsschrankenanl», «VRA»); die Erläuterung gibt die Beschreibung der
Quelle wieder, die Verkehrsregelungsanlagen nennt. 0 gekreuzte Gleise heisst nicht
erfasst. Fehlt die Sicherungsart, sagt der Text wie oft («Bei 1 der erfassten
Bahnübergänge ist keine Sicherungsart eingetragen»), und «bei jedem» steht nur, wenn
keiner fehlt. Linie 650 hat alle sechs Sicherungsarten: Dann gibt es keine weitere
falsche Antwort zu ergänzen (der Baukasten stürzte dabei ab).

## Tunnel im Duell

`pipeline/build_vergleich.py` nimmt die Tunnel aus `data/linien/{nr}.json` (alle 289),
`generator/validate_vergleich.py` prüft jeden Wert, Namen und Bemerkung gegen diese
Datei. Zwei Kategorien: Länge (vorn der grössere Wert) und Jahr der ersten
Inbetriebnahme (`richtung: tiefster`, vorn das frühere Jahr; `format: jahr`, damit
1882 nicht als 1'882 erscheint). Nach der Antwort steht die Bemerkung der Quelle im
Wortlaut, weil sie sagt, was eine Länge umfasst («Länge der Oströhre», «4947m gehört
Frankreich»). Das Tunnel-Duell zeigt den Datenstand der Tunnel, nicht den der Bahnhöfe.

**Listen hinter den Kacheln.** Linienprofile tragen unter `listen` alle Tunnel,
Brücken und Bahnübergänge der Linie, unverändert aus den Fakten. Kacheln mit `liste`
(und optional `filter`, etwa Kanton «Ticino» oder Sicherungsart ohne Eintrag = null)
führen in der App zu diesen Listen. Die Prüfung verlangt: Die Liste ist gleich den
Fakten, und die Zahl auf der Kachel ist die Zahl der Einträge nach dem Filter.
Fehlende Werte zeigt die Liste als «keine Angabe».
