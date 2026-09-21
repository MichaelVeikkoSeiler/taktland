"""Feste Texte der App über die Daten müssen zur Pipeline passen."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_anleitung_nennt_die_grenze_fuer_mittlere_bahnhoefe():
    # Die Anleitung erklärt die Einteilung. Ändert sich TIER_M_DWV, stimmt
    # ihr Text sonst still nicht mehr. Aus dem Quelltext gelesen, weil die
    # Tests auf GitHub ohne pandas laufen.
    quelle = (ROOT / "pipeline/build_facts.py").read_text(encoding="utf-8")
    wert = int(re.search(r"^TIER_M_DWV = (\d+)$", quelle, re.M).group(1))
    text = (ROOT / "app/src/komponenten/Anleitung.tsx").read_text(encoding="utf-8")
    grenze = f"{wert:,}".replace(",", "'")
    assert f"mindestens {grenze} Ein- und Aussteigende" in text
