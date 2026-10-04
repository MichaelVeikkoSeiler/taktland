"""Der Pool für «Bahnhofsuche» (data/erraten.json): jeder Hinweis steht so in den
Fakten, weder Bezirk noch Kanton verraten den Namen, und kein Name kommt zweimal vor."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POOL = json.loads((ROOT / "data" / "erraten.json").read_text(encoding="utf-8"))["bahnhoefe"]


def woerter(s):
    return {w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{3,}", s or "")}


def test_jeder_hinweis_steht_in_den_fakten():
    for b in POOL:
        f = json.loads((ROOT / "data" / "facts" / f"{b['id']}.json").read_text(encoding="utf-8"))
        sb, sd = f["steckbrief"], f["stammdaten"]
        assert b["name"] == f["name"] and b["kt"] == f["kanton"]
        assert b["kanton"] == sd["kanton"] and b.get("bezirk") == sd.get("bezirk")
        assert b["hoehe"] == sd["hoehe_m_ue_m"]
        assert b["bahn"] == sb["isb"] and b["zuege_von"] == sb["evu"]
        assert b.get("dwv") == sb.get("dwv") and b.get("dwv_unter") == sb.get("dwv_unter")


def test_bezirk_verraet_den_namen_nicht():
    assert not [b["name"] for b in POOL if woerter(b.get("bezirk")) & woerter(b["name"])]


def test_kanton_verraet_den_namen_nicht():
    assert not [b["name"] for b in POOL if woerter(b["kanton"]) & woerter(b["name"])]


def test_namen_eindeutig_und_stufen_gesetzt():
    assert len({b["name"] for b in POOL}) == len(POOL)
    assert all(b["s"] in (1, 2, 3) for b in POOL)
