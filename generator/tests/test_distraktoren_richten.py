"""Das Reparaturskript darf keine Frage zerstoeren.

Anlass: Aus «35,97301 km» wurde einmal «35 ,». Die Frage war unbrauchbar und
fiel erst der Pruefung auf, nicht dem Skript.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from distraktoren_richten import formatierer  # noqa: E402


def test_dezimalzahl_bleibt_unangetastet():
    assert formatierer("35,97301 km", 35.97301) is None
    assert formatierer("145.5485", 145.5485) is None


def test_ganze_zahl_mit_einheit():
    f = formatierer("420 m", 420)
    assert f(420) == "420 m"
    assert f(380) == "380 m"


def test_tausendertrenner_bleibt_erhalten():
    f = formatierer("12'400 Reisende", 12400)
    assert f(9800) == "9'800 Reisende"


def test_text_vor_der_zahl():
    f = formatierer("rund 55 cm", 55)
    assert f(35) == "rund 35 cm"


def test_ohne_zahl_kein_umbau():
    assert formatierer("keine Angabe", 0) is None
