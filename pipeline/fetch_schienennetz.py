#!/usr/bin/env python3
"""Lädt das «Schienennetz» des Bundesamts für Verkehr (BAV) nach data/raw/.

Die SBB-Daten führen nur die Linien der SBB. Das Schienennetz des BAV führt
die Linien aller Bahnen (BLS, SOB, RhB …) mit Nummer, Name, Betriebspunkten,
Kilometer und Infrastrukturbetreiberin. Lizenz: Opendata BY, freie Nutzung,
Quellenangabe Pflicht (Bundesamt für Verkehr BAV).

Aufruf:
    python pipeline/fetch_schienennetz.py           # nur, wenn noch nicht da
    python pipeline/fetch_schienennetz.py --force   # neu laden
"""
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

URL = "https://data.geo.admin.ch/ch.bav.schienennetz/schienennetz/schienennetz_2056_de.xtf"
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
ZIEL = RAW / "schienennetz_2056_de.xtf"


def main():
    if ZIEL.exists() and "--force" not in sys.argv:
        print(f"skip {ZIEL.name} (vorhanden, --force zum Neuladen)")
        return
    RAW.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(URL, headers={"User-Agent": "taktland-fetch/0.1"})
    with urllib.request.urlopen(req, timeout=600) as r:
        daten = r.read()
        geaendert = r.headers.get("Last-Modified")
    ZIEL.write_bytes(daten)
    # Abrufdatum wie bei den SBB-Daten, dazu das Änderungsdatum der Datei beim BAV
    pfad = RAW / "_abruf.json"
    abruf = json.loads(pfad.read_text(encoding="utf-8")) if pfad.exists() else {}
    abruf["schienennetz"] = str(date.today())
    pfad.write_text(json.dumps(dict(sorted(abruf.items())), indent=1), encoding="utf-8")
    (RAW / "schienennetz_geaendert.txt").write_text(geaendert or "", encoding="utf-8")
    print(f"{ZIEL.name}: {len(daten) / 1e6:.1f} MB, beim BAV geändert: {geaendert}")


if __name__ == "__main__":
    main()
