# Projekt: Taktland – Bahnhof-Lernwelten

## Name
**Taktland**: Anspielung auf den Schweizer Taktfahrplan. Die Schweiz als Land,
in dem alles im Takt läuft, und die Bahnhöfe als Knoten dieses Takts.
Untertitel pro Sprache:
- DE: «Bahnhöfe entdecken»
- FR: «Découvrir les gares»
- IT: «Scoprire le stazioni»

Vor der Veröffentlichung Marken-, App-Store- und Domain-Verfügbarkeit prüfen.

## Vision
Eine mobile Web-App (PWA), mit der man jeden Schweizer SBB-Bahnhof spontan
auswählen, erkunden und mit Self-Check-Fragen kennenlernen kann.
Die Inhalte erzeugt eine Agenten-Pipeline automatisch aus offenen Daten, für
jeden Bahnhof, standardisiert und je nach Bahnhofsgrösse unterschiedlich umfangreich.

**Was neu ist:** Individuelle Lerninhalte für rund 700 Bahnhöfe in 3 Sprachen
waren von Hand nie finanzierbar. Mit der Pipeline entstehen sie automatisch
und bleiben bei jedem Datenupdate aktuell.

## Zielgruppen
- Personal, das an fremden Bahnhöfen eingesetzt wird (Aushilfe, Stellvertretung, Events)
- Kundenbegleitung, Lernende, Neueinsteigende
- Öffentlich: Reisende, Bahninteressierte, Schulklassen

## Grundsätze
1. **Keine erfundenen Fakten.** Jede Zahl und jede Aussage stammt aus dem geprüften
   Bahnhof-Profil. Die KI formuliert nur Texte und Fragen *um* diese Fakten herum.
2. **Nur offene Daten** in Version 1. Keine internen SBB-Informationen.
3. **Kein Nachweis, kein Tracking, kein Login.** Der Fortschritt wird nur lokal auf dem Gerät gespeichert.
4. **Quellen sichtbar.** Die Datenquellen werden in der App genannt (Lizenz data.sbb.ch: Quellenangabe Pflicht).
5. **Kein offizieller Auftritt.** Kein SBB-Logo und kein Name, der ein offizielles
   SBB-Produkt suggeriert, solange keine Freigabe vorliegt.

## Datenquellen
Die Dataset-IDs sind aus der Recherche übernommen. Beim ersten Abruf jeweils verifizieren.

### data.sbb.ch (Opendatasoft-API, ohne Key)
`https://data.sbb.ch/api/explore/v2.1/catalog/datasets/{id}/exports/csv`

| Inhalt | Dataset-ID |
|---|---|
| Ein-/Aussteigende pro Werktag (DWV) | `passagierfrequenz` |
| Bahnhofbenutzer | `anzahl-sbb-bahnhofbenutzer` |
| Bahnhofbenutzer Tagesverlauf (stündlich) | `anzahl-sbb-bahnhofbenutzer-tagesverlauf` |
| Züge pro Streckenabschnitt | `zugzahlen` |
| Perrons (Länge, Sektoren) | `perron` |
| Haltekanten | `haltestelle-haltekante` |
| Ausstattung hindernisfreies Reisen | `equipement` |
| Bahnhofpläne (60+ Stationen) | `haltestelle-karte-trafimage` |
| WLAN an Bahnhöfen | `wifistation` |
| Streckennetz/Linien | `linie` |
| Abfahrtsplakate | ID noch ermitteln |

### opentransportdata.swiss
- GTFS Static (Fahrplan aktuelles Jahr): Linien und Verbindungen pro Bahnhof
- DiDok/atlas: Stammdaten Haltestellen (UIC, Koordinaten)
- PRM-Daten: Hindernisfreiheit pro Perron

## Architektur
```
[1 Daten-Pipeline]  →  [2 Profil-Generator]  →  [3 PWA]
 Python/Pandas          Claude-Agenten          React + Vite + Tailwind
 lädt & verknüpft       schreibt Texte/Fragen   zeigt Profile an
 → facts/{uic}.json     → profiles/{uic}.{lang}.json
```

### Stufe 1: Daten-Pipeline
- Lädt alle Quellen, verknüpft sie pro Bahnhof über den UIC-Code.
- Schreibt pro Bahnhof `facts/{uic}.json` (nur Fakten, keine Texte).
- Bestimmt die Grössenstufe (S/M/L) automatisch.
- Das bestehende Skript `fetch_data.py` (Opendatasoft-Abruf) dient als Ausgangspunkt.

### Stufe 2: Profil-Generator (Agenten)
- **Storyboard-Agent:** Er erzeugt aus `facts` die Kapiteltexte und Self-Check-Fragen, zuerst auf DE.
- **QA-Agent:** Er prüft jede Zahl und Aussage gegen `facts`. Nicht belegte Inhalte werden entfernt.
- **Übersetzungs-Agent:** Er erstellt FR und IT (ab Phase 3).
- Output: `profiles/{uic}.de.json`

### Stufe 3: PWA
- Bahnhofsuche und Karte (keine Geolocation)
- Kapitel-Ansicht mit einheitlichem Layout
- Self-Check pro Kapitel mit sofortigem Feedback
- Offline-fähig (Service Worker), installierbar auf dem Homescreen
- Statisches Hosting (z. B. GitHub Pages, Netlify, Cloudflare Pages)

## Grössenstufen
Die Grenzwerte werden anhand der echten Frequenzdaten festgelegt, zum Beispiel über Quantile.

| Stufe | Kriterium (vorläufig) | Kapitel | Fragen |
|---|---|---|---|
| S | geringe Frequenz | Steckbrief, Perrons, Hindernisfreiheit | 3–5 |
| M | mittlere Frequenz | + Tagesrhythmus, Verbindungen | ~10 |
| L | hohe Frequenz und Bahnhofplan vorhanden | + Plan mit Hotspots, Services, Sektoren, Lernpfade | 20+ |

## Kapitel-Baukasten

| Kapitel | Datenbasis | Fragetyp-Beispiel |
|---|---|---|
| Steckbrief | Frequenz, Zugzahlen | Slider: Ein-/Aussteigende pro Tag |
| Tagesrhythmus | Tagesverlauf | Single Choice: Wann ist Peak? |
| Perrons & Sektoren | Perron, Haltekante | Sortieren: Gleise nach Länge |
| Hindernisfreiheit | Ausstattung, PRM | Hotspot: Wo ist der Lift? |
| Verbindungen | GTFS | Zuordnen: Linie ↔ Ziel |
| Services | Bahnhofplan, WLAN | Wahr/Falsch |

Quiz-Typen: Single Choice, Multiple Choice, Wahr/Falsch, Lückentext, Zuordnen,
Sortieren, Hotspot, Slider. Alle touch-optimiert mit Pointer Events.

## Profil-Schema (Entwurf)
```json
{
  "uic": "8503000",
  "name": "Zürich HB",
  "tier": "L",
  "lang": "de",
  "sources": ["passagierfrequenz", "perron", "..."],
  "dataYear": 2025,
  "chapters": [
    {
      "id": "steckbrief",
      "title": "Steckbrief",
      "body": "…",
      "facts": [{ "label": "Ein-/Aussteigende pro Werktag", "value": 0, "source": "passagierfrequenz" }],
      "questions": [
        {
          "type": "single_choice",
          "prompt": "…",
          "options": ["…"],
          "correct": 0,
          "explanation": "…",
          "factRef": "steckbrief.facts[0]"
        }
      ]
    }
  ]
}
```
Jede Frage verweist über `factRef` auf den Fakt, auf dem sie beruht. So kann der QA-Agent sie prüfen.

## MVP (Phase 1)
Drei Bahnhöfe, einer pro Stufe. Die UIC-Codes beim Abruf verifizieren:
- **L:** Zürich HB (8503000)
- **M:** Olten (8500218)
- **S:** ein kleiner SBB-Bahnhof ohne Bahnhofplan, z. B. Schönbühl SBB (8508001)

Nur Deutsch. Ziel: zeigen, dass die Pipeline mit unterschiedlicher Datenlage umgehen kann.

## Arbeitsschritte für Claude Code
1. Repo-Struktur anlegen: `pipeline/`, `generator/`, `app/`, `data/`
2. Pipeline: Datasets abrufen, Schema pro Dataset ausgeben, UIC-Verknüpfung prüfen
3. `facts/{uic}.json` für die 3 MVP-Bahnhöfe erzeugen und manuell sichten
4. Grössenstufen-Logik implementieren
5. Storyboard-Agent + QA-Agent als Subagents/Skills definieren; Profile für 3 Bahnhöfe erzeugen
6. PWA-Grundgerüst: Suche, Kapitel-Ansicht, Self-Check
7. Offline-Modus + Homescreen-Installation
8. Test auf dem Smartphone, danach mit 2–3 Personen aus der Zielgruppe

## Später (nicht im MVP)
- Alle ~700 Bahnhöfe, FR/IT
- Automatische Updates bei Datenänderungen und Fahrplanwechsel
- MCP-Server «SBB Open Data» als gemeinsame Datenschicht
- Geschützte interne Erweiterung (Abläufe, Kontakte) mit Login und IT-Freigabe
- Illustrationen pro Bahnhof über den Szenen-Generator-Skill

## Offene Fragen
- Deckt `anzahl-sbb-bahnhofbenutzer-tagesverlauf` alle Bahnhöfe ab oder nur grosse?
- Wie viele Bahnhöfe haben Perron- und Ausstattungsdaten?
- Dataset-ID der Abfahrtsplakate
- Auftritt (inoffiziell vs. Freigabe durch die SBB)
- Verfügbarkeit Name «Taktland» (Marke, App-Store, Domain)
