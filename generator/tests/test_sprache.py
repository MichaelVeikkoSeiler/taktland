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


def test_einzahl_muster_trifft_nur_die_falsche_form():
    import re
    from taktland import EINZAHL
    assert re.search(EINZAHL, "Von den 1 erfassten Perrons ist 1 als niveaufrei vermerkt.")
    assert re.search(EINZAHL, "Erfasst sind 1 Infopunkt.")
    assert not re.search(EINZAHL, "Erfasst ist 1 Infopunkt.")
    assert not re.search(EINZAHL, "Erfasst sind 1 Billettautomat, 3 Billettentwerter und 1 Wartehalle.")
    assert not re.search(EINZAHL, "Von den 12 erfassten Perrons sind 10 niveaufrei.")
