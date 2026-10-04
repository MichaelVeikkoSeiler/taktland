"""Nennen die Quellen verschiedene Kantone, stehen beide in den Fakten und die Lücke
«Kanton» sagt es (Moutier: BE laut Passagierfrequenz, Jura laut Haltestellendaten)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
KUERZEL = dict(l.split("=") for l in """Aargau=AG Appenzell_Ausserrhoden=AR Appenzell_Innerrhoden=AI
Basel-Landschaft=BL Basel-Stadt=BS Bern=BE Fribourg=FR Genève=GE Glarus=GL Graubünden=GR Jura=JU
Luzern=LU Neuchâtel=NE Nidwalden=NW Obwalden=OW St._Gallen=SG Schaffhausen=SH Schwyz=SZ Solothurn=SO
Thurgau=TG Ticino=TI Uri=UR Valais=VS Vaud=VD Zug=ZG Zürich=ZH""".split())


def test_widerspruch_beim_kanton_ist_benannt():
    for p in sorted((ROOT / "data" / "facts").glob("*.json")):
        f = json.loads(p.read_text(encoding="utf-8"))
        name = ((f.get("stammdaten") or {}).get("kanton") or "").replace(" ", "_")
        k = KUERZEL.get(name)
        if not k or not f.get("kanton") or k == f["kanton"]:
            assert not f.get("kanton_auch"), p.name
            continue
        assert f.get("kanton_auch") == [k], p.name
        assert any(l["thema"] == "Kanton" for l in f["luecken"]), p.name
