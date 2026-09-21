"""Feste Texte der App über die Daten müssen zur Pipeline passen."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

import build_facts  # noqa: E402


def test_anleitung_nennt_die_grenze_fuer_mittlere_bahnhoefe():
    # Die Anleitung erklärt die Einteilung. Ändert sich TIER_M_DWV, stimmt
    # ihr Text sonst still nicht mehr.
    text = (ROOT / "app/src/komponenten/Anleitung.tsx").read_text(encoding="utf-8")
    grenze = f"{build_facts.TIER_M_DWV:,}".replace(",", "'")
    assert f"mindestens {grenze} Ein- und Aussteigende" in text
