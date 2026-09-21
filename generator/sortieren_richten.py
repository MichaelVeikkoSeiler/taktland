#!/usr/bin/env python3
"""Richtet Sortierfragen, deren Reihenfolge Glückssache wäre.

Aufgefallen beim Lesen von Sierre/Siders: «Ordne die Abschnitte nach Zügen
pro Jahr» mit 55'122 und 54'972. Diese Reihenfolge kann niemand wissen, auch
wer das Kapitel gelesen hat. Die Prüfung über alle Profile fand zwei Formen:

- Werte liegen weniger als MINDESTABSTAND (taktland.py) auseinander,
  manchmal sind sie sogar gleich (Arth-Goldau: 18'500 in 2023 und 2024).
- Sortiert wird nach der Beschriftung selbst: Jahreszahlen nach Jahr. Die
  Lösung steht dann schon auf den Karten.

Was das Skript tut, nur bei betroffenen Fragen:

- Jahresverlauf im Steckbrief: neu aus den Fakten, nur klar getrennte Jahre.
- Ausstattung: die Frage aus ausstattung_kapitel.frage_flaeche übernehmen.
  Nur diese Frage, die übrigen des Kapitels bleiben unangetastet.
- Alle anderen: nur die klar getrennten Einträge behalten, die Erklärung aus
  den verbleibenden Werten neu schreiben.
- Bleiben weniger als drei Einträge, entfällt die Frage.

    python generator/sortieren_richten.py --alle              # nur zeigen
    python generator/sortieren_richten.py --alle --schreiben
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ausstattung_kapitel import frage_flaeche  # noqa: E402
from belegt.fakten import zahl  # noqa: E402
from taktland import PROFILES, fakten_laden, klar_getrennt, zu_nah  # noqa: E402

#: Letztes Glied des factRef -> Einheit im Satz «… mit 456 Metern»
EINHEIT = {
    "laenge_m": "Metern", "perronkante_m": "Metern",
    "flaeche_m2": "Quadratmetern", "flaeche_netto_m2": "Quadratmetern",
    "zuege_pro_jahr": "Zügen im Jahr", "zuege_pro_tag": "Zügen pro Tag",
    "prozent": "Prozent", "sektoren_anzahl": "Sektoren",
}


def ch(n):
    if isinstance(n, float) and not n.is_integer():
        return str(n)
    return f"{int(n):,}".replace(",", "'")


def betroffen(q):
    werte = [zahl(it.get("value")) for it in q["items"]]
    if any(w is None for w in werte):
        return False
    w = sorted(werte)
    if any(zu_nah(a, b) for a, b in zip(w, w[1:])):
        return True
    return all(zahl(it.get("label")) == zahl(it.get("value")) for it in q["items"])


def verlauf_neu(q, fakten):
    v = [(i, x) for i, x in enumerate(fakten["steckbrief"].get("verlauf") or []) if x.get("dwv")]
    klar = klar_getrennt(v, wert=lambda t: t[1]["dwv"])
    if len(klar) < 3:
        return None
    klar.reverse()
    reihe = ", ".join(f"{ch(x['dwv'])} ({x['jahr']})" for _, x in klar)
    return {**q,
            "prompt": "Ordne die Jahre nach dem Werktagsverkehr, tiefster Wert zuerst.",
            "richtung": "aufsteigend",
            "items": [{"label": str(x["jahr"]), "value": x["dwv"],
                       "factRef": f"steckbrief.verlauf[{i}].dwv"} for i, x in klar],
            "factRef": "steckbrief.verlauf",
            "explanation": f"Die erfassten Werte, aufsteigend: {reihe}."
                           + (" Jahre mit gleichem oder fast gleichem Wert bleiben weg."
                              if len(klar) < len(v) else "")}


def ausduennen(q):
    klar = klar_getrennt(q["items"], wert=lambda it: zahl(it["value"]))
    if len(klar) < 3:
        return None
    if q.get("richtung") == "aufsteigend":
        klar.reverse()
    feld = klar[0]["factRef"].rsplit(".", 1)[-1]
    def glied(it):
        label = re.sub(r", (Personenverkehr|Güterverkehr)$", r" im \1", it["label"])
        label = re.sub(r"^Von ", "von ", label)  # mitten im Satz klein
        if feld == "km_am_bahnhof":
            return f"{label} bei Kilometer {ch(it['value'])}"
        return f"{label} mit {ch(it['value'])}"
    teile = [glied(it) for it in klar]
    satz = "Richtig ist diese Reihenfolge: " + ", ".join(teile[:-1]) + " und " + teile[-1]
    if feld in EINHEIT:
        satz += " " + EINHEIT[feld]
    return {**q, "items": klar,
            "explanation": satz + ". Einträge mit gleichem oder fast gleichem Wert bleiben weg."}


def richten(profil, fakten):
    """Gibt eine Liste von Meldungen zurück und ändert das Profil an Ort."""
    meldungen = []
    for kap in profil["chapters"]:
        neu = []
        for q in kap.get("questions", []):
            if q.get("type") != "sort" or not betroffen(q):
                neu.append(q)
                continue
            ref = q["items"][0].get("factRef", "")
            if ref.startswith("steckbrief.verlauf"):
                ersatz = verlauf_neu(q, fakten)
            elif ref.startswith("ausstattung.perronbelag"):
                ersatz = frage_flaeche(fakten.get("ausstattung") or {})
            else:
                ersatz = ausduennen(q)
            vorher = ", ".join(f"{it['label']}={it['value']}" for it in q["items"])
            if ersatz:
                nachher = ", ".join(f"{it['label']}={it['value']}" for it in ersatz["items"])
                meldungen.append(f"  {kap['id']}: {vorher}\n      → {nachher}")
                neu.append(ersatz)
            else:
                meldungen.append(f"  {kap['id']}: {vorher}\n      → Frage entfällt")
        kap["questions"] = neu
        if not neu:
            meldungen.append(f"  !! Kapitel {kap['id']} hat keine Frage mehr")
    return meldungen


def main():
    pfade = [Path(x) for x in sys.argv[1:] if not x.startswith("--")]
    if "--alle" in sys.argv:
        pfade = sorted(PROFILES.glob("*.json"))
    if not pfade:
        print(__doc__)
        return 1
    schreiben = "--schreiben" in sys.argv
    n = 0
    for p in pfade:
        profil = json.loads(p.read_text(encoding="utf-8"))
        meldungen = richten(profil, fakten_laden(profil["uic"]))
        if meldungen:
            n += 1
            print(f"{profil['name']} ({p.name})")
            print("\n".join(meldungen))
            if schreiben:
                p.write_text(json.dumps(profil, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{n} Profile {'geändert' if schreiben else 'betroffen (Trockenlauf)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
