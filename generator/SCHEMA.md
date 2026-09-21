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
Bemerkungen wie in Buchs SG bekommen ihre Frage von Hand über `extra_fragen`.

## Sprache

Deutsch, Schweizer Rechtschreibung: **ss statt ß**. Zahlen über 9999 mit Apostroph:
480'900. «Perron», nicht «Bahnsteig». «Billett», nicht «Fahrkarte». Sie-Form vermeiden,
neutral formulieren.
