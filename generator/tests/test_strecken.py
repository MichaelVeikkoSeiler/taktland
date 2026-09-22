"""Die Seite «Strecke»: Weg durchs Netz, Tunnel und Brücken entlang des Wegs."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import strecken as S  # noqa: E402

NETZ = S.laden()
UIC = {json.loads(p.read_text(encoding="utf-8"))["name"]: int(p.stem) for p in S.FACTS.glob("*.json")}


def objekte(von, nach, ueber=None):
    w = S.weg(NETZ, UIC[von], UIC[nach], UIC[ueber] if ueber else None)
    return w, *S.entlang(w)


def test_jede_zuordnung_wie_in_den_linienfakten():
    assert S.validieren() == 0


def test_gegenprobe_auf_einer_einzigen_linie():
    # Lausanne - Brig liegt ganz auf Linie 100: genau die Tunnel und Brücken
    # zwischen den Kilometern der beiden Bahnhöfe, auch die im Bahnhof bei km 0
    f = json.loads((S.LINIEN / "100.json").read_text(encoding="utf-8"))
    km = {b["name"]: b["km"] for b in f["bahnhoefe"]["items"]}
    lo, hi = sorted((km["Lausanne"], km["Brig"]))
    _, t, b = objekte("Lausanne", "Brig")
    assert set(t) == {f"100:{i}" for i, x in enumerate(f["tunnel"]["items"]) if lo <= x["km"] <= hi}
    assert set(b) == {f"100:{i}" for i, x in enumerate(f["bruecken"]["items"]) if lo <= x["km"] <= hi}


def test_gotthard_und_ceneri_auf_dem_weg_nach_lugano():
    _, t, _ = objekte("Zürich HB", "Lugano")
    namen = {S.fakten_objekte()[("tunnel", int(i.split(":")[0]))][int(i.split(":")[1])]["name"] for i in t}
    assert {"Gotthard-Basistunnel", "Galleria di base del Ceneri", "Zimmerberg Basistunnel"} <= namen


def test_grauholz_statt_alter_linie():
    # Aespli - Löchligut liegt an Linie 450 und 400; auf 450 liegen Schönbühl
    # und Zollikofen dazwischen, also Linie 400 durch den Grauholztunnel
    _, t, _ = objekte("Zürich HB", "Bern")
    assert "400:" + str(next(i for i, x in enumerate(S.fakten_objekte()[("tunnel", 400)])
                             if x["name"] == "Grauholztunnel")) in t


def test_andere_bahnen_ohne_daten():
    # Bern - Brig führt über den Lötschberg der BLS: dort gibt es keine Tunnel-
    # und Brückendaten, und das muss erkennbar sein
    w, _, _ = objekte("Bern", "Brig")
    ohne = [e for e in w if not e.get("teile")]
    assert ohne and all(e["isb"] != "SBB" for e in ohne)


def test_ueber_legt_den_weg_fest():
    w, _, _ = objekte("Basel SBB", "Chiasso", "Luzern")
    luzern = NETZ["bahnhoefe"][str(UIC["Luzern"])]
    assert any(luzern in (e["von"], e["nach"]) for e in w)


def test_pruefer_findet_eine_falsche_zuordnung(tmp_path):
    n = json.loads(S.DATEI.read_text(encoding="utf-8"))
    e = next(e for e in n["abschnitte"] if any(t["bruecken"] for t in e.get("teile", [])))
    e["teile"][0]["bruecken"] = e["teile"][0]["bruecken"][1:]
    falsch = tmp_path / "strecken.json"
    falsch.write_text(json.dumps(n, ensure_ascii=False), encoding="utf-8")
    alt, S.DATEI = S.DATEI, falsch
    try:
        assert S.validieren() == 1
    finally:
        S.DATEI = alt
