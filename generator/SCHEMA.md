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
`zuege`, `linien`, `services`, `bahnhofplan`.

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

## Sprache

Deutsch, Schweizer Rechtschreibung: **ss statt ß**. Zahlen über 9999 mit Apostroph:
480'900. «Perron», nicht «Bahnsteig». «Billett», nicht «Fahrkarte». Sie-Form vermeiden,
neutral formulieren.
