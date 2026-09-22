"""Die Übersichten «Tunnel» und «Brücken» der App: genau die Einträge aus
den Fakten, jeder mit der Linie, auf der er erfasst ist."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

import export_app  # noqa: E402

LINIEN = ROOT / "data" / "linien"


def fakten():
    return [json.loads(p.read_text(encoding="utf-8")) for p in LINIEN.glob("*.json")]


def ohne_linie(eintraege, nr):
    return [{k: v for k, v in e.items() if k != "linie"} for e in eintraege if e["linie"] == nr]


def test_tunnel_wie_in_den_fakten():
    d = export_app.uebersicht_daten()["tunnel"]
    alle = fakten()
    assert len(d["eintraege"]) == sum((f.get("tunnel") or {}).get("anzahl_erfasst", 0) for f in alle)
    for f in alle:
        assert ohne_linie(d["eintraege"], f["linie"]) == (f.get("tunnel") or {}).get("items", [])
    # jeder Tunnel liegt auf einer Linie mit eigener Seite
    assert all(v["seite"] for v in d["linien"].values())


def test_bruecken_wie_in_den_fakten_samt_linien_ohne_seite():
    d = export_app.uebersicht_daten()["bruecken"]
    u = json.loads((ROOT / "data" / "linien_uebersicht.json").read_text(encoding="utf-8"))
    alle = fakten()
    for f in alle:
        assert ohne_linie(d["eintraege"], f["linie"]) == (f.get("bruecken") or {}).get("items", [])
        if f.get("bruecken"):
            assert d["linien"][str(f["linie"])] == {
                "name": f["name"], "seite": (ROOT / "data" / "linienprofile" / f"{f['linie']}.de.json").exists()}
    ohne = u["bruecken_ohne_seite_liste"]
    assert sum(len(x["items"]) for x in ohne) == u["bruecken_ohne_seite"] == d["ohne_seite"]
    for x in ohne:
        assert ohne_linie(d["eintraege"], x["linie"]) == x["items"]
        assert d["linien"][str(x["linie"])] == {"name": x["name"], "seite": False}
    mit_seite = sum((f.get("bruecken") or {}).get("anzahl_erfasst", 0) for f in alle)
    assert len(d["eintraege"]) == mit_seite + u["bruecken_ohne_seite"]
