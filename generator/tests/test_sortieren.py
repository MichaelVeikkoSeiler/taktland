"""Sortierfragen dürfen keine Glückssache sein.

Anlass: Sierre/Siders, 55'122 gegen 54'972 Züge im Jahr. Dazu sechs Profile,
die Jahreszahlen nach Jahr sortieren liessen.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from taktland import klar_getrennt, zu_nah  # noqa: E402
from sortieren_richten import betroffen  # noqa: E402


def werte(items):
    return [it["value"] for it in items]


def test_fast_gleiche_werte_fallen_weg():
    items = [{"value": v} for v in (380, 420, 417)]
    assert werte(klar_getrennt(items)) == [420, 380]
    # 420 gegen 400 liegen 4,8 % auseinander, also knapp zu nah
    assert werte(klar_getrennt([{"value": 420}, {"value": 400}])) == [420]


def test_gleiche_werte_sind_zu_nah_auch_bei_null():
    assert zu_nah(0, 0)
    assert zu_nah(18500, 18500)
    assert not zu_nah(100, 90)


def test_kette_wird_vom_hoechsten_wert_aus_geduennt():
    # 10'500, 10'200, 10'100 liegen je unter 5 % auseinander, 9'900 nicht mehr
    items = [{"value": v} for v in (9000, 9900, 10100, 10200, 10500)]
    assert werte(klar_getrennt(items)) == [10500, 9900, 9000]


def test_jahreszahlen_nach_jahr_sind_betroffen():
    q = {"items": [{"label": str(j), "value": j} for j in (2018, 2022, 2023)]}
    assert betroffen(q)


def test_klar_getrennte_werte_bleiben_unangetastet():
    q = {"items": [{"label": "Gleis 1", "value": 420},
                   {"label": "Gleis 2", "value": 300},
                   {"label": "Gleis 3", "value": 150}]}
    assert not betroffen(q)
