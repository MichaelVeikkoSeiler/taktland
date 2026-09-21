"""Kleine Sprachregeln, die beim Lesen aufgefallen sind."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bauen as B  # noqa: E402
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


def test_einzahl_bei_einem_einzigen_bestand():
    # Vernier: «sind für Vernier 1 Sitzbank erfasst»; «12 Sitzbänke sowie
    # 1 Infopunkt» ist richtig und darf nicht anschlagen
    import re
    from taktland import EINZAHL
    assert re.search(EINZAHL, "In den offenen Daten sind für Vernier 1 Sitzbank erfasst.")
    assert not re.search(EINZAHL, "In den offenen Daten sind für Muttenz 12 Sitzbänke sowie 1 Infopunkt erfasst.")
    assert not re.search(EINZAHL, "In den offenen Daten sind für Zwingen 1 Sitzbank sowie 1 Infopunkt erfasst.")


def test_hilfskante_ist_weiblich():
    # Egnach: «Perron 1 ist ein Hilfskante von 120 Metern»
    d = B.bauen("8506309")
    body = next(k for k in d["chapters"] if k["id"] == "perrons")["body"]
    assert "ist eine Hilfskante von" in body
