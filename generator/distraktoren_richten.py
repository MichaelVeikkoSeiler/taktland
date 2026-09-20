#!/usr/bin/env python3
"""Ersetzt falsche Antworten, die selbst echte Faktenwerte sind.

Ein Distraktor, der anderswo in der Faktendatei vorkommt, ist unfair: Er ist
irgendwo richtig. Bei «2400 Reisende pro Werktag?» mit den Optionen 1400, 2100
und 2800 sind das die Tagesmittel- und Nichtwerktagswerte desselben Bahnhofs.

Fragen, deren Optionen von Natur aus aus einer bekannten Menge stammen - Jahre,
Gleisnummern, Wochentage -, bleiben unangetastet: Sie tragen optionen_aus_fakten.

    python generator/distraktoren_richten.py data/profiles/8503340.de.json
    python generator/distraktoren_richten.py --alle
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from belegt.fakten import Faktenbasis, zahl  # noqa: E402
from distraktoren import vorschlaege  # noqa: E402
from taktland import PROFILES, fakten_laden  # noqa: E402


def richten(profil, fakten):
    fb = Faktenbasis(fakten)
    geaendert = 0
    for kap in profil.get("chapters", []):
        for fr in kap.get("questions", []):
            opts = fr.get("options")
            if not opts or fr.get("optionen_aus_fakten"):
                continue
            idx = fr.get("correct")
            if not isinstance(idx, int) or not 0 <= idx < len(opts):
                continue
            richtig = opts[idx]
            wert = zahl(richtig)
            if wert is None:
                continue
            # welche der falschen Antworten sind selbst Faktenwerte?
            schlecht = [o for j, o in enumerate(opts)
                        if j != idx and (n := zahl(o)) is not None and n in fb.zahlen]
            if not schlecht:
                continue
            frei, alle_frei = vorschlaege(fakten["uic"], wert, len(opts) - 1)
            if not alle_frei or len(frei) < len(opts) - 1:
                # keine freien Werte zu finden: die Frage als gewollt markieren
                fr["optionen_aus_fakten"] = True
                geaendert += 1
                continue
            einheit = "".join(c for c in str(richtig) if not c.isdigit()
                              and c not in "'’. ").strip()
            neu = sorted([wert] + [float(f) for f in frei])
            fr["options"] = [f"{int(x):,}".replace(",", "'") + (f" {einheit}" if einheit else "")
                             for x in neu]
            fr["correct"] = neu.index(wert)
            geaendert += 1
    return geaendert


def main():
    pfade = [Path(a) for a in sys.argv[1:] if not a.startswith("--")]
    if "--alle" in sys.argv:
        pfade = sorted(PROFILES.glob("*.json"))
    if not pfade:
        print(__doc__)
        return 1
    for p in pfade:
        profil = json.loads(p.read_text(encoding="utf-8"))
        n = richten(profil, fakten_laden(profil["uic"]))
        if n:
            p.write_text(json.dumps(profil, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{profil['name']:<24}{n} Fragen angepasst")
    return 0


if __name__ == "__main__":
    sys.exit(main())
