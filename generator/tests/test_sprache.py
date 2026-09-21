"""Kleine Sprachregeln, die beim Lesen aufgefallen sind."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from baukasten import aufzaehlung  # noqa: E402


def test_aufzaehlung_mit_komma_und_einem_und():
    # Rorschach: «SBB und SOB und Thurbo», Zürich Wollishofen: «BATS und S-POS und ePOS»
    assert aufzaehlung(["SBB"]) == "SBB"
    assert aufzaehlung(["SBB", "SOB"]) == "SBB und SOB"
    assert aufzaehlung(["BATS", "S-POS", "ePOS"]) == "BATS, S-POS und ePOS"
