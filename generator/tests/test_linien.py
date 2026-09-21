"""Die Linienseiten: gebaut aus data/linien, geprüft wie die Bahnhöfe."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import linien as L  # noqa: E402
import linien_baukasten as lb  # noqa: E402
from belegt import Faktenbasis  # noqa: E402
from belegt.bericht import Bericht  # noqa: E402
from belegt.regeln import Regelwerk  # noqa: E402


def text(d):
    return " ".join([k["body"] for k in d["chapters"]]
                    + [q[f] for k in d["chapters"] for q in k["questions"]
                       for f in ("prompt", "explanation")])


def test_gespeicherte_profile_bestehen_die_pruefung():
    for p in L.PROFILE.glob("*.json"):
        profil = json.loads(p.read_text(encoding="utf-8"))
        b = L.pruefe_linie(profil, lb.fakten(profil["linie"]))
        assert b.ok, (p.name, b.zeilen())


def test_gotthard_basistunnel_mit_bemerkung():
    # liegt auf Linie 594 ohne Bahnhof in Taktland: ohne die Tunnel-Regel fehlte er
    d = L.bauen("594")
    assert "Gotthard-Basistunnel" in text(d)
    assert "«Länge der Oströhre, da länger als Weströhre»" in text(d)


def test_gleichstand_ist_kein_vorsprung():
    # Linie 600: acht Tunnel mit dem Jahr 1874, keiner ist «der älteste»
    tunnel = next(k for k in L.bauen("600")["chapters"] if k["id"] == "tunnel")
    assert "bei 8 der erfassten Tunnel" in tunnel["body"]
    assert "älteste" not in tunnel["body"]


def test_kilometrierung_ist_keine_laenge():
    for nr in ("100", "210", "600"):
        strecke = next(k for k in L.bauen(nr)["chapters"] if k["id"] == "strecke")
        assert "Länge" not in strecke["body"]
        assert all("Länge" not in q["prompt"] for q in strecke["questions"])


def test_antwort_im_namen_der_linie():
    assert lb.verraet("Wil SG", "Wil - Weinfelden")
    assert lb.verraet("Zurich Oerlikon", "ZH Altstetten - ZH Oerlikon, DML")
    assert lb.verraet("Le Day Sud (bif)", "Le Day - Le Brassus")
    assert not lb.verraet("Cham", "Sihlbrugg - Baar Projekt ZBT2")


def test_negativer_kilometer():
    # Linie 220 beginnt bei km -0.4. Das Minus gehört zur Zahl.
    fb = Faktenbasis({"strecke": {"km_anfang": -0.4}})
    b = Bericht("t")
    Regelwerk().pruefe_text("Die Kilometrierung reicht von km -0.4 bis hier.", "x", fb, b)
    assert b.ok
    b = Bericht("t")
    Regelwerk().pruefe_text("Die Kilometrierung reicht von km 0.4 bis hier.", "x", fb, b)
    assert not b.ok


def test_bahnhof_in_der_liste_fuehrt_zu_seiner_seite():
    bh = next(k for k in L.bauen("500")["chapters"] if k["id"] == "bahnhoefe")
    links = [x for x in bh["facts"] if "uic" in x]
    assert links and all(x["label"] for x in links)
    assert [x["value"] for x in links] == sorted(x["value"] for x in links)


def test_bruecken_mit_kantonen_und_baueinheiten():
    k = next(k for k in L.bauen("600")["chapters"] if k["id"] == "bruecken")
    assert "Für die Linie 600 sind 511 Brücken erfasst." in k["body"]
    assert "«Ticino» bei 325 Brücken" in k["body"]
    assert "besteht Viadukt in Brunnen" in k["body"]


def test_bruecken_einzahl_und_mehrzahl():
    # Linie 450: am Ende stand «bei 1 Brücken»
    k = next(k for k in L.bauen("450")["chapters"] if k["id"] == "bruecken")
    assert "bei 1 Brücken" not in k["body"]
    # Linie 580: eine einzige Brücke, also nicht «bei jeder erfassten Brücke»
    k = next(k for k in L.bauen("580")["chapters"] if k["id"] == "bruecken")
    assert "jeder" not in k["body"]


def test_brueckennamen_ohne_deutung():
    # Abkürzungen wie PI, PU, WU erklärt die Quelle nicht, also auch Taktland nicht
    f = lb.fakten("100")
    assert any(l["thema"] == "Namen der Brücken" for l in f["luecken"])
    k = next(k for k in L.bauen("100")["chapters"] if k["id"] == "bruecken")
    for wort in ("Unterführung", "Personenunterführung", "Passage inférieur"):
        assert wort not in k["body"]
