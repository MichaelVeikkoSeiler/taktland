#!/usr/bin/env python3
"""Nennt die naechsten Bahnhoefe ohne Profil, groesste zuerst.

Bewusst ohne Abhaengigkeit zum Anthropic-Paket: Dieses Skript laeuft auch
dort, wo kein Schluessel gesetzt ist, etwa in einem naechtlichen Lauf.

    python generator/offen.py 10
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "data" / "facts"
PROFILES = ROOT / "data" / "profiles"


def offene(n=10):
    fertig = {p.name.split(".")[0] for p in PROFILES.glob("*.json")}
    raus = []
    for p in FACTS.glob("*.json"):
        if p.stem in fertig:
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        raus.append(((d.get("steckbrief") or {}).get("dwv") or 0, d))
    raus.sort(key=lambda x: -x[0])
    return [d for _, d in raus[:n]]


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    liste = offene(n)
    fertig = len(list(PROFILES.glob("*.json")))
    gesamt = len(list(FACTS.glob("*.json")))
    print(f"{fertig} von {gesamt} Bahnhöfen haben ein Profil, "
          f"{gesamt - fertig} sind offen.\n")
    for d in liste:
        kap = ", ".join(d["verfuegbare_kapitel"])
        print(f"{d['uic']}  {d['name'][:26]:<27}{d.get('kanton') or '--':<4}"
              f"Stufe {d['tier']}  {(d.get('steckbrief') or {}).get('dwv', 0):>7} pro Werktag")
        print(f"          Kapitel: {kap}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
