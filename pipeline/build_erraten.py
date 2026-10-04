#!/usr/bin/env python3
"""Der Pool für das Spiel «Bahnhofsuche» (Michael, 2026-10-04): data/erraten.json.

Taktland wählt einen Bahnhof, der Spieler deckt Hinweiskarten auf und rät. Jede Karte
ist ein Feld aus data/facts/{uic}.json, nichts wird gerechnet oder ergänzt:

- kanton     stammdaten.kanton (Name laut Quelle), dazu das Kürzel aus kanton
- bezirk     stammdaten.bezirk
- dwv        steckbrief.dwv, Ein- und Aussteigende pro Werktag (SBB); wo die SBB nur
             «weniger als 50» meldet, steht die Grenze in dwv_unter
- hoehe      stammdaten.hoehe_m_ue_m
- bahn       steckbrief.isb, die Infrastruktur
- zuege_von  steckbrief.evu, die Unternehmen, deren Züge dort halten

Diese sechs gibt es bei fast allen Bahnhöfen. Gemeinde, Perronlänge, Linie und
Zugzahlen nicht: die Gemeinde verrät bei 813 von 1187 Bahnhöfen den Namen, die
übrigen fehlen bei einem Viertel bis zur Hälfte (vor allem bei RhB, MGB, zb).

Aufgenommen wird ein Bahnhof nur, wenn die Felder vorhanden sind und der Bezirk den
Namen nicht verrät (Bezirk Meilen bei Meilen prüft nichts, CLAUDE.md Regel 9). Ohne
Bezirk (etwa in Genf, Neuenburg, Zug, Basel-Stadt) bleibt er im Pool; die Karte liegt
dann offen mit «In den Daten nicht angegeben» und kostet nichts.

Stufe nach Rang bei den Ein- und Aussteigenden pro Werktag, wie bei «Geo»: die
obersten LEICHT (20 %) leicht, bis MITTEL (50 %) mittel, der Rest schwer; «weniger
als 50» zählt als kleinster Wert.

    .venv/bin/python pipeline/build_erraten.py
"""
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "data" / "facts"
ZIEL = ROOT / "data" / "erraten.json"
LEICHT, MITTEL = 0.20, 0.50


def woerter(s):
    return {w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{3,}", s or "")}


def main():
    pool, weg = [], Counter()
    for pfad in sorted(FACTS.glob("*.json")):
        f = json.loads(pfad.read_text(encoding="utf-8"))
        sb, sd = f.get("steckbrief") or {}, f.get("stammdaten") or {}
        uic, name = f.get("uic"), (f.get("name") or "").strip()
        if not isinstance(uic, int) or not name:
            weg["ohne Nummer oder Name"] += 1
            continue
        e = {"id": uic, "name": name, "kt": f.get("kanton"), "kanton": sd.get("kanton"), "bezirk": sd.get("bezirk"),
             "dwv": sb.get("dwv"), "dwv_unter": sb.get("dwv_unter"), "hoehe": sd.get("hoehe_m_ue_m"),
             "bahn": sb.get("isb"), "zuege_von": sb.get("evu")}
        # ohne Bezirk bleibt der Bahnhof im Pool: die Karte zeigt offen «nicht angegeben» und kostet nichts
        fehlt = [k for k in ("kt", "kanton", "hoehe", "bahn", "zuege_von") if e[k] in (None, "")]
        if e["dwv"] is None and e["dwv_unter"] is None:
            fehlt.append("dwv")
        if fehlt:
            weg["ohne " + ", ".join(fehlt)] += 1
            continue
        if e["bezirk"] and woerter(e["bezirk"]) & woerter(name):
            weg["Bezirk verrät den Namen"] += 1
            continue
        pool.append({k: v for k, v in e.items() if v is not None})
    # Stufe nach Rang; gleicher Wert, gleiche Reihenfolge nach Name, damit der Bau gleich bleibt
    pool.sort(key=lambda o: (-(o.get("dwv") or 0), o["name"]))
    n = len(pool)
    for i, o in enumerate(pool):
        o["s"] = 1 if i < n * LEICHT else 2 if i < n * MITTEL else 3
    pool.sort(key=lambda o: o["name"])
    doppelt = [k for k, v in Counter(o["name"] for o in pool).items() if v > 1]
    daten = {
        "hinweis": ("Pool für «Bahnhofsuche», gebaut mit pipeline/build_erraten.py aus data/facts. Felder wie in "
                    "den Fakten: kanton und bezirk aus den Stammdaten, dwv (oder dwv_unter: weniger als dieser Wert) "
                    "Ein- und Aussteigende pro Werktag laut SBB, hoehe in m ü. M., bahn die Infrastruktur (isb), "
                    "zuege_von die Unternehmen (evu). s: Stufe nach Rang bei dwv, 1 leicht (oberste 20 %), "
                    "2 mittel (bis 50 %), 3 schwer."),
        "gebaut": date.today().isoformat(),
        "bahnhoefe": pool,
    }
    ZIEL.write_text(json.dumps(daten, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"erraten.json: {n} Bahnhöfe, {ZIEL.stat().st_size / 1024:.0f} KB; Stufen",
          dict(sorted(Counter(o["s"] for o in pool).items())))
    for grund, k in weg.most_common():
        print(f"  weggelassen: {grund}: {k}")
    if doppelt:
        print("  doppelte Namen:", ", ".join(doppelt))
        sys.exit(1)


if __name__ == "__main__":
    main()
