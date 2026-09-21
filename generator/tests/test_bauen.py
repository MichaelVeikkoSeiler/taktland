"""Der Baubefehl: ein Profil entsteht aus Fakten und Bauplan, immer gleich."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bauen as B  # noqa: E402
from baukasten import fakten, services  # noqa: E402
from taktland import fakten_laden, pruefe  # noqa: E402


def test_zweimal_gebaut_ist_gleich():
    assert B.bauen("8502218") == B.bauen("8502218")


def test_neubau_entspricht_dem_gespeicherten_profil():
    # Sins wurde mit dem Baukasten gebaut: der Neubau darf nichts ändern
    alt = json.loads(B.pfad("8502218").read_text(encoding="utf-8"))
    assert B.ohne_datum(B.bauen("8502218")) == B.ohne_datum(alt)


def test_gleisfrage_bringt_das_schema_mit():
    # Sins hat eine Gleisfrage zum Antippen, das Schema fehlte im Profil
    d = B.bauen("8502218")
    assert any(q["type"] == "hotspot" for k in d["chapters"] for q in k["questions"])
    assert d["gleise"] == fakten_laden(8502218)["gleise"]["items"]
    b, _ = pruefe({k: v for k, v in d.items() if k != "gleise"}, fakten_laden(8502218))
    assert any("Gleisschema" in str(x) for x in b.fehler)


def test_jede_genutzte_quelle_wird_genannt():
    d = B.bauen("8502218")
    genutzt = {x["source"] for k in d["chapters"] for x in k["facts"]}
    assert genutzt <= set(d["sources"])
    assert "mobiliar-im-bahnhof" in d["sources"]  # Kapitel Ausstattung


def test_ohne_geraetedaten_keine_erfundene_null():
    # Köniz: die Quelle ordnet keine Automaten und Entwerter zu
    k = services(fakten(8507083))
    assert "Billettentwerter sind keine verzeichnet" not in k["body"]
    assert "Zu Billettautomaten und Billettentwertern liegen für diesen Bahnhof keine Daten vor." in k["body"]
