"""Wertvergleich: eine Liste muss zu derselben Liste passen.

Anlass: «value [20, 25, 35, 55] passt nicht zu [20, 25, 35, 55]» hat ein
richtiges Profil durchfallen lassen und Geld gekostet.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from belegt.fakten import Faktenbasis  # noqa: E402

FB = Faktenbasis({"hoehen": [20, 25, 35, 55], "laenge": 420, "nr": "3"})


def test_gleiche_liste_passt():
    assert FB.passt([20, 25, 35, 55], [20, 25, 35, 55])


def test_reihenfolge_egal():
    assert FB.passt([55, 20, 35, 25], [20, 25, 35, 55])


def test_fehlender_wert_passt_nicht():
    assert not FB.passt([20, 25, 35], [20, 25, 35, 55])
    assert not FB.passt([20, 25, 35, 99], [20, 25, 35, 55])


def test_einzelwert_gegen_liste_weiterhin_moeglich():
    assert FB.passt(35, [20, 25, 35, 55])
    assert not FB.passt(99, [20, 25, 35, 55])


def test_einheit_am_wert_stoert_nicht():
    assert FB.passt("420 m", 420)


def test_bezeichnung_mit_schraegstrich_gilt_als_belegt():
    """«Perron 1/11» ist eine Bezeichnung, keine Rechnung.

    Anlass: Aigle hat die Perrons 1/11, 12/13 und 14/15. Der Pruefer zerlegte
    sie in einzelne Zahlen und meldete 11, 14 und 15 als unbelegt, obwohl die
    Bezeichnungen wortwoertlich in den Fakten stehen.
    """
    from belegt.bericht import Bericht
    from belegt.regeln import Regelwerk

    fb = Faktenbasis({"perrons": {"items": [{"nr": "1/11", "laenge_m": 375}]}})
    r = Regelwerk()

    b = Bericht("t")
    r.pruefe_text("Perron 1/11 misst 375 Meter.", "x", fb, b)
    assert b.ok

    b = Bericht("t")
    r.pruefe_text("Perron 1/11 misst 999 Meter.", "x", fb, b)
    assert not b.ok

    # eine blosse Zahl bleibt unbelegt, auch wenn sie in einer Bezeichnung vorkommt
    b = Bericht("t")
    r.pruefe_text("Es gibt 11 Perrons.", "x", fb, b)
    assert not b.ok
