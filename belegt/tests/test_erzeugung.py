#!/usr/bin/env python3
"""Prüft die Erzeugungsschleife ohne die API zu rufen.

Ein gestelltes Modell antwortet in der ersten Runde mit einem Profil, das eine
erfundene Zahl enthält, und in der zweiten mit dem berichtigten. So lässt sich
nachsehen, ob die Prüfung greift, ob die Fehlerliste zurückgeht und ob am Ende
nur Geprüftes übrig bleibt.

    python belegt/tests/test_erzeugung.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "generator"))

from belegt.erzeugung import Auftrag, Erzeuger  # noqa: E402
from taktland import fakten_laden, pruefe  # noqa: E402


# ---------- ein gestelltes Modell ----------

class Block:
    def __init__(self, text):
        self.type, self.text = "text", text


class Verbrauch:
    def __init__(self, ein, aus):
        self.input_tokens, self.output_tokens = ein, aus


class Nachricht:
    def __init__(self, text):
        self.content = [Block(text)]
        self.usage = Verbrauch(len(text) // 4, len(text) // 4)


class Strom:
    def __init__(self, text):
        self._text = text

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get_final_message(self):
        return Nachricht(self._text)


class GestelltesModell:
    """Gibt der Reihe nach vorbereitete Antworten zurück und merkt sich,
    was es gefragt wurde."""

    def __init__(self, antworten):
        self.antworten = list(antworten)
        self.anfragen = []
        self.messages = self

    def stream(self, **kw):
        self.anfragen.append(kw)
        return Strom(self.antworten.pop(0))


# ---------- die beiden Antworten ----------

def profil_bauen(uic, dwv_im_text):
    """Ein knappes, sonst gültiges Profil. `dwv_im_text` wird in den Text
    geschrieben - stimmt der Wert nicht, muss die Prüfung anschlagen."""
    f = fakten_laden(uic)
    return {
        "uic": uic, "name": f["name"], "tier": f["tier"], "lang": "de",
        "dataYear": f["steckbrief"]["jahr"], "generated": "2026-09-20",
        "sources": ["passagierfrequenz", "haltestelle-haltekante", "zugzahlen"],
        "chapters": [
            {"id": "steckbrief", "title": "Steckbrief",
             "body": f"An einem Werktag steigen hier {dwv_im_text} Personen ein und aus.",
             "facts": [{"label": "Ein- und Aussteigende pro Werktag",
                        "value": f["steckbrief"]["dwv"], "unit": "Personen",
                        "source": "passagierfrequenz", "factRef": "steckbrief.dwv"}],
             "questions": [
                 {"type": "single_choice",
                  "prompt": "Wie viele Personen steigen an einem Werktag ein und aus?",
                  "options": ["120", str(f["steckbrief"]["dwv"]), "9400", "21000"],
                  "correct": 1, "explanation": "Stand 2025.",
                  "factRef": "steckbrief.dwv", "difficulty": 1},
                 {"type": "slider", "prompt": "Auf welcher Höhe über Meer liegt der Bahnhof?",
                  "min": 200, "max": 900, "step": 25,
                  "correct": round(f["stammdaten"]["hoehe_m_ue_m"]),
                  "explanation": "Aus den Stammdaten.",
                  "factRef": "stammdaten.hoehe_m_ue_m", "difficulty": 2},
                 {"type": "true_false", "prompt": "Der Bahnhof liegt über 100 Metern über Meer.",
                  "correct": True, "explanation": "Laut Stammdaten.",
                  "factRef": "stammdaten.hoehe_m_ue_m", "difficulty": 1},
                 {"type": "cloze", "prompt": "Der Bahnhof liegt in der Gemeinde ___.",
                  "options": ["Bure", "Chur", "Olten", "Thun"],
                  "correct": 0, "explanation": "Aus den Stammdaten.",
                  "factRef": "stammdaten.gemeinde", "difficulty": 1},
                 {"type": "true_false", "prompt": "Es ist ein Billettautomat erfasst.",
                  "correct": False, "explanation": "Es ist keiner erfasst.",
                  "factRef": "services.billettautomaten_erfasst", "difficulty": 2}]},
            {"id": "linien", "title": "Linie",
             "body": "Der Bahnhof liegt an der Linie 241.",
             "facts": [{"label": "Linie", "value": 241, "unit": None,
                        "source": "linie-mit-betriebspunkten",
                        "factRef": "linien.items[0].nummer"}],
             "questions": [
                 {"type": "single_choice", "prompt": "An welcher Linie liegt der Bahnhof?",
                  "options": ["Linie 111", "Linie 241", "Linie 500"], "correct": 1,
                  "explanation": "Linie 241.", "factRef": "linien.items[0].nummer",
                  "difficulty": 1}]},
        ],
    }


def main():
    uic = 8500131          # Bure-Casernes: wenig Daten, schnell zu prüfen
    echt = fakten_laden(uic)["steckbrief"]["dwv"]
    erfunden = 1234        # diese Zahl steht nirgends in den Fakten

    modell = GestelltesModell([
        "Hier das Profil:\n```json\n"
        + json.dumps(profil_bauen(uic, erfunden), ensure_ascii=False) + "\n```",
        json.dumps(profil_bauen(uic, echt), ensure_ascii=False),
    ])

    erzeuger = Erzeuger(client=modell, runden=3)
    auftrag = Auftrag(kennung=str(uic), system="Regelwerk", anfrage="Fakten",
                      mitgabe={"uic": uic})

    def pruefer(dok, mitgabe):
        bericht, _ = pruefe(dok, fakten_laden(mitgabe["uic"]), fix=True)
        return bericht

    ergebnis = erzeuger.erzeuge(auftrag, pruefer)

    print("1. Antwort enthielt die erfundene Zahl", erfunden)
    print("2. Anfragen ans Modell:", len(modell.anfragen),
          "(die zweite trägt die Fehlerliste)")
    nachbesserung = modell.anfragen[1]["messages"][-1]["content"]
    print("   Rückmeldung an das Modell:")
    for zeile in nachbesserung.splitlines():
        if zeile.startswith("- "):
            print("     " + zeile)
    print(f"3. Ergebnis nach {ergebnis.runden} Runden: "
          f"{'bestanden' if ergebnis.ok else 'durchgefallen'}")
    print(f"4. Verbrauch: {ergebnis.kosten}")
    im_text = ergebnis.dokument["chapters"][0]["body"]
    print(f"5. Text im gespeicherten Profil: «{im_text}»")
    print(f"6. Lücken von der Pipeline eingetragen: "
          f"{len(ergebnis.dokument.get('luecken', []))}")

    fehler = []
    if len(modell.anfragen) != 2:
        fehler.append("es hätte genau eine Korrekturrunde geben müssen")
    if not ergebnis.ok:
        fehler.append("das berichtigte Profil hätte bestehen müssen")
    if str(erfunden) in im_text:
        fehler.append("die erfundene Zahl steht noch im Profil")
    if "Zahl 1234 steht nicht in den Fakten" not in nachbesserung:
        fehler.append("die Fehlerliste nannte die erfundene Zahl nicht")
    if not ergebnis.dokument.get("luecken"):
        fehler.append("die Lücken wurden nicht eingetragen")

    print()
    if fehler:
        for f in fehler:
            print("FEHLGESCHLAGEN:", f)
        return 1
    print("Alle Prüfpunkte erfüllt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
