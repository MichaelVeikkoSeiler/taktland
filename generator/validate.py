#!/usr/bin/env python3
"""Prüft Profile gegen ihre Faktendatei. Ohne Sprachmodell, rein mechanisch.

    python generator/validate.py data/profiles/8508001.de.json
    python generator/validate.py --alle
    python generator/validate.py --alle --fix        # Lücken eintragen
    python generator/validate.py --alle --entfernen  # zusätzlich Ungültiges löschen

Die Prüflogik steht in generator/taktland.py, der wiederverwendbare Unterbau
in belegt/.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from taktland import FACTS, PROFILES, fakten_laden, pruefe  # noqa: E402


def main():
    fix = "--fix" in sys.argv or "--entfernen" in sys.argv
    entfernen = "--entfernen" in sys.argv
    pfade = [Path(a) for a in sys.argv[1:] if not a.startswith("--")]
    if "--alle" in sys.argv:
        pfade = sorted(PROFILES.glob("*.json"))
    if not pfade:
        print(__doc__)
        return 1

    schlecht = 0
    for p in pfade:
        profil = json.loads(p.read_text(encoding="utf-8"))
        if not (FACTS / f"{profil.get('uic')}.json").exists():
            print(f"✗ {p.name}: keine Faktendatei")
            schlecht += 1
            continue
        b, profil = pruefe(profil, fakten_laden(profil["uic"]), fix=fix, entfernen=entfernen)
        print(f"{b.zusammenfassung().replace(b.name, p.name + '  ' + b.name, 1)}")
        for zeile in b.zeilen():
            print(zeile)
        if fix:
            p.write_text(json.dumps(profil, ensure_ascii=False, indent=2), encoding="utf-8")
        if not b.ok:
            schlecht += 1
    return 1 if schlecht else 0


if __name__ == "__main__":
    sys.exit(main())
