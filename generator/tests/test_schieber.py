"""Ein Schieberegler darf nicht mehr als ein Viertel seiner Spanne als richtig werten.

Anlass: Prilly-Malley, Kilometer 2.354 auf einem Regler von 1 bis 4 in
Einerschritten. Mit der Toleranz der App zählten 2 und 3 als richtig.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from baukasten import schieber  # noqa: E402


def trefferanteil(q):
    # wie app/src/komponenten/Frage.tsx
    spanne = q["max"] - q["min"]
    return 2 * max(q["step"], spanne * 0.05) / spanne


def test_kleiner_dezimalwert_bekommt_zehntelschritte():
    q = schieber("x", 2.354, "e", "r", "km")
    assert q["step"] == 0.1
    assert q["min"] < 2.354 < q["max"]
    assert trefferanteil(q) <= 0.25


def test_uebliche_werte_bleiben_unter_einem_viertel():
    for w in (7.24569, 27.43298, 94.111, 341.7, 82586):
        q = schieber("x", w, "e", "r", "")
        assert q["min"] < w < q["max"]
        assert trefferanteil(q) <= 0.25, w
