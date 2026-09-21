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


def test_tagesrhythmus_fragt_nicht_gegen_knappe_werte():
    # Basel SBB: Freitag 15.4, Donnerstag 15.2 Prozent - der Donnerstag darf
    # nicht zur Auswahl stehen
    from baukasten import tagesrhythmus
    k = tagesrhythmus(fakten(8500010))
    tag = next(q for q in k["questions"] if "Wochentag" in q["prompt"])
    assert "Donnerstag" not in tag["options"]
    assert tag["options"][tag["correct"]] == "Freitag"


def test_tagesrhythmus_gleichstand_ist_kein_einzelsieger():
    # Genève-Aéroport: Dienstag und Mittwoch je 12.8 Prozent
    from baukasten import tagesrhythmus
    k = tagesrhythmus(fakten(8501026))
    assert "der kleinste auf Dienstag und Mittwoch, je 12.8 Prozent" in k["body"]


def test_ziffer_im_namen_ist_keine_zahl():
    # Root D4: die 4 steht im Namen, nicht als Wert in den Fakten
    d = B.bauen("8515997")
    b, _ = pruefe(d, fakten_laden(8515997))
    assert not b.fehler


def test_sortierwerte_stehen_in_der_faktenliste():
    # Reconvilier: «Ordne die Perrons nach erfasster Belagsfläche» fragte nach
    # 347, 202 und 152 Quadratmetern, die im Kapitel nirgends standen
    d = B.bauen("8500101")
    aus = next(k for k in d["chapters"] if k["id"] == "ausstattung")
    zeilen = {f["label"]: f["value"] for f in aus["facts"]}
    assert zeilen["Belagsfläche Perron 2"] == 347
    b, _ = pruefe(d, fakten_laden(8500101))
    assert not b.fehler


def test_unsichtbarer_wert_faellt_auf():
    d = B.bauen("8500101")
    aus = next(k for k in d["chapters"] if k["id"] == "ausstattung")
    aus["facts"] = [f for f in aus["facts"] if not f["label"].startswith("Belagsfläche")]
    b, _ = pruefe(d, fakten_laden(8500101))
    assert any("Faktenliste" in str(x) for x in b.fehler)


def test_gleisnummer_steht_bei_der_laengsten_kante():
    # «Längste erfasste Perronkante» ohne Gleis sagt nicht, welches Gleis
    d = B.bauen("8508004")
    gl = next(k for k in d["chapters"] if k["id"] == "gleise")
    assert any(f["label"] == "Längste erfasste Perronkante (Gleis 1)" for f in gl["facts"])


def test_kein_kapitel_ohne_frage():
    # Immensee liegt bei Kilometer 0.25695 seiner einzigen Linie: kein
    # Schieberegler, nichts zuzuordnen, das Kapitel blieb ohne Frage
    d = B.bauen("8505003")
    li = next(k for k in d["chapters"] if k["id"] == "linien")
    q = li["questions"][0]
    assert q["options"][q["correct"]] == "Linie 600"
    assert all(k["questions"] for k in d["chapters"])


def test_ohne_zuege_und_gleise_passt_der_umfang():
    # Mols: keine Zugzahlen, keine Gleise, der Bau brach mit 11 statt 10 Fragen ab
    d = B.bauen("8509415")
    b, _ = pruefe(d, fakten_laden(8509415))
    assert not b.fehler
    assert all(q.get("factRef") != "services.wlan_erfasst"
               for k in d["chapters"] for q in k["questions"])


def test_jahr_der_fahrgastzahlen_aus_den_fakten():
    # Mols: Fahrgastzahlen aus 2018, die Erklärung sagte «Stand 2025»
    d = B.bauen("8509415")
    st = next(k for k in d["chapters"] if k["id"] == "steckbrief")
    assert "Der Datenstand dieser Zahlen ist 2018." in st["body"]
    assert st["questions"][0]["explanation"].endswith("Stand 2018.")


def test_platzhalter_49_ist_keine_zahl():
    # Courchavon: die Quelle schreibt 49 für «weniger als 50», die App zeigte
    # «an einem freien Tag 49»
    f = fakten_laden(8500141)
    assert f["steckbrief"]["dnwv"] is None and f["steckbrief"]["dnwv_unter"] == 50
    d = B.bauen("8500141")
    st = next(k for k in d["chapters"] if k["id"] == "steckbrief")
    assert "an einem freien Tag weniger als 50" in st["body"]
    assert "49" not in json.dumps(st, ensure_ascii=False)
    assert any(l["thema"] == "Genaue Fahrgastzahl" for l in d["luecken"])
