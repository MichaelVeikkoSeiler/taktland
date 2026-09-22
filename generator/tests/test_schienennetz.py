"""Linien und Angaben aus dem Schienennetz des BAV (pipeline/schienennetz.py):
keine Tramlinie, jeder Bahnhof mit seinem Namen aus Taktland, jede Zählung
passend zur Liste der Abschnitte."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LINIEN = ROOT / "data" / "linien"
FACTS = ROOT / "data" / "facts"


def fakten():
    return [json.loads(p.read_text(encoding="utf-8")) for p in LINIEN.glob("*.json")]


def name(uic):
    return json.loads((FACTS / f"{uic}.json").read_text(encoding="utf-8"))["name"]


def test_linien_anderer_bahnen_mit_zwei_bahnhoefen():
    bav = [f for f in fakten() if f.get("quelle") == "schienennetz"]
    assert bav, "keine Linie aus dem Schienennetz"
    for f in bav:
        bh = f["bahnhoefe"]
        assert bh["source"] == f["strecke"]["source"] == "schienennetz"
        assert bh["anzahl_in_taktland"] == len(bh["items"]) >= 2, f["linie"]
        assert [it["km"] for it in bh["items"]] == sorted(it["km"] for it in bh["items"])
        for it in bh["items"]:
            assert it["name"] == name(it["uic"]), (f["linie"], it)
        # keine Deutung: Anfang und Ende nennt das Schienennetz nicht
        assert "anfang" not in f["strecke"] and "ende" not in f["strecke"]
        assert any(l["thema"] == "Anfang und Ende" for l in f["luecken"])


def test_weitere_bahnhoefe_nur_was_die_sbb_nicht_fuehrt():
    for f in fakten():
        w = f.get("weitere_bahnhoefe")
        if not w:
            continue
        schon = {it["uic"] for it in f["bahnhoefe"]["items"]}
        assert w["anzahl"] == len(w["items"]) > 0
        for it in w["items"]:
            assert it["uic"] not in schon, (f["linie"], it)
            assert it["name"] == name(it["uic"])


def test_netz_zaehlt_die_abschnitte():
    for f in fakten():
        x = f.get("netz")
        if not x:
            continue
        n = x["abschnitte_erfasst"]
        assert n == len(x["items"]), f["linie"]
        for feld, schluessel in (("nach_isb", "isb"), ("nach_gleisen", "gleise"),
                                 ("nach_spurweite", "spurweite"), ("nach_strom", "strom")):
            assert sum(g["abschnitte"] for g in x[feld]) == n, (f["linie"], feld)
            for g in x[feld]:
                assert g["abschnitte"] == sum(1 for it in x["items"] if it[schluessel] == g["wert"])
        assert x["stand"] and "netz" in f["verfuegbare_kapitel"]
        # mit dem Netz ist die Gleiszahl belegt, die Lücke «Ein- oder mehrspurig» fällt weg
        assert not any(l["thema"] == "Ein- oder mehrspurig" for l in f["luecken"])


def test_strecke_nennt_nur_linien_mit_nummer():
    """Tramlinien tragen im Schienennetz Nummern mit Buchstaben; keine davon
    kommt auf die Seite Strecke."""
    netz = json.loads((ROOT / "data" / "strecken.json").read_text(encoding="utf-8"))
    for e in netz["abschnitte"]:
        if "linie_bav" in e:
            assert isinstance(e["linie_bav"], int) and "teile" not in e
