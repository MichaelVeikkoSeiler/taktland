"""Die Seite «Standort»: Jede Zeile in data/standort.json gehört zu einem
Eintrag in den Fakten der Linien, mit demselben Namen an derselben Stelle,
und kein Tunnel, keine Brücke, kein Bahnübergang fehlt."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LINIEN = ROOT / "data" / "linien"
STANDORT = ROOT / "data" / "standort.json"
UEBERSICHT = ROOT / "data" / "linien_uebersicht.json"
APP = ROOT / "app" / "public" / "data" / "standort.json"

ARTEN = ("tunnel", "bruecken", "bahnuebergaenge")


def laden():
    return json.loads(STANDORT.read_text(encoding="utf-8"))


def fakten():
    return {int(p.stem): json.loads(p.read_text(encoding="utf-8")) for p in LINIEN.glob("*.json")}


def test_jede_zeile_gehoert_zu_ihrem_eintrag():
    s, f = laden(), fakten()
    u = json.loads(UEBERSICHT.read_text(encoding="utf-8"))
    ohne = {"bruecken": {x["linie"]: x["items"] for x in u["bruecken_ohne_seite_liste"]},
            "bahnuebergaenge": {x["linie"]: x["items"] for x in u["bahnuebergaenge_ohne_seite_liste"]}}
    for art in ARTEN:
        for linie, stelle, name, _, _ in s[art]:
            name_linie, seite = s["linien"].get(str(linie), [None, False])
            assert seite == (linie in f), (art, linie)
            items = f[linie][art]["items"] if seite else ohne[art][linie]
            assert items[stelle]["name"] == name, (art, linie, stelle)


def test_keiner_fehlt_keiner_doppelt():
    s, f = laden(), fakten()
    u = json.loads(UEBERSICHT.read_text(encoding="utf-8"))
    mit_seite = {art: sum((x.get(art) or {}).get("anzahl_erfasst", 0) for x in f.values())
                 for art in ARTEN}
    assert len(s["tunnel"]) == mit_seite["tunnel"]
    assert len(s["bruecken"]) == mit_seite["bruecken"] + u["bruecken_ohne_seite"]
    assert len(s["bahnuebergaenge"]) == mit_seite["bahnuebergaenge"] + u["bahnuebergaenge_ohne_seite"]
    for art in ARTEN:
        schluessel = [(z[0], z[1]) for z in s[art]]
        assert len(schluessel) == len(set(schluessel)), art


def test_lage_in_der_gegend():
    """Grob um die Schweiz: ein vertauschtes Paar Breite/Länge fiele auf"""
    for art in ARTEN:
        for linie, stelle, _, la, lo in laden()[art]:
            assert la is None or 45.5 < la < 48.2, (art, linie, stelle)
            assert lo is None or 5.5 < lo < 11.0, (art, linie, stelle)


def test_app_hat_dieselbe_datei():
    if APP.exists():
        assert json.loads(APP.read_text(encoding="utf-8")) == laden()
