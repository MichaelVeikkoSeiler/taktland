"""Züge und Umfang: was beim Schub mit Sins, Seuzach und Steinmaur auffiel."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from baukasten import fakten, perrons, profil, zuege  # noqa: E402
from taktland import pruefe, umfang_erwartet  # noqa: E402


def test_staerkster_abschnitt_im_gueterverkehr_heisst_nicht_personenverkehr():
    # Sins: 99 Güterzüge pro Tag, im Personenverkehr 84 auf beiden Abschnitten
    k = zuege(fakten(8502218))
    assert "Personenverkehr verkehren dort 99" not in k["body"]
    assert "84 Züge pro Tag" in k["body"]
    assert "am stärksten" not in k["body"].lower()  # 84 und 84: Gleichstand
    refs = [x["factRef"] for x in k["facts"]] + [q["factRef"] for q in k["questions"]]
    assert not any("staerkster_abschnitt" in r for r in refs)


def test_validator_meldet_gueterabschnitt_als_personenverkehr():
    f = fakten(8502218)
    d = profil(8502218)
    k = next(k for k in d["chapters"] if k["id"] == "zuege")
    k["facts"][0]["factRef"] = "zuege.staerkster_abschnitt.zuege_pro_tag"
    k["facts"][0]["value"] = 99
    b, _ = pruefe(d, f)
    assert any("Güterverkehr" in str(x) for x in b.fehler)


def test_gueterzuege_pro_tag_null_sind_nicht_keiner():
    # Seuzach: 119 Güterzüge im Jahr, pro Tag gerundet 0
    k = zuege(fakten(8506020))
    assert "keiner" not in k["body"]
    assert "119 Züge im Jahr" in k["body"]


def test_einzelnes_perron_ausdruecklich_nicht_niveaufrei():
    # Beinwil am See: «0 sind als niveaufrei vermerkt, 1 ausdrücklich …»
    k = perrons(fakten(8502034))
    assert "0 sind" not in k["body"]
    assert "Es ist ausdrücklich als nicht niveaufrei vermerkt." in k["body"]


def test_nicht_mehr_fragen_als_die_daten_tragen():
    # Steinmaur: 15 gebaut + 2 Ausstattung, die Daten tragen 14
    from ausstattung_kapitel import kapitel_bauen
    f = fakten(8503316)
    d = profil(8503316)
    a = kapitel_bauen(f["uic"], f["name"], f["ausstattung"])
    n = sum(len(k["questions"]) for k in d["chapters"]) + len(a["questions"])
    assert n <= umfang_erwartet(f)[3]
