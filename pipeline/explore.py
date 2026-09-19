#!/usr/bin/env python3
"""Schemas und Beispielrecords der Kandidaten-Datasets von data.sbb.ch abrufen.

Reine Erkundung: schreibt data/raw/_schemas.json und druckt eine Uebersicht.
Keine Abhaengigkeiten ausser der Standardbibliothek.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://data.sbb.ch/api/explore/v2.1/catalog/datasets"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "_schemas.json"

CANDIDATES = [
    # Frequenz / Nutzung
    "passagierfrequenz",
    "anzahl-sbb-bahnhofbenutzer",
    "anzahl-sbb-bahnhofbenutzer-tagesverlauf",
    "anzahl-sbb-bahnhofbenutzer-wochentag",
    "zugzahlen",
    # Stammdaten
    "dienststellen-gemass-opentransportdataswiss",
    # Perron / Infrastruktur
    "perron",
    "perronoberflache",
    "haltestelle-haltekante",
    "sektortafel",
    # Hindernisfreiheit
    "21196_behig-haltekantepunkt",
    "21197_behig-haltekantesegment",
    "haltestelle-visuell-taktile-sicherheitslinie",
    # Services / Ausstattung
    "billetautomat",
    "billetentwerter",
    "haltestelle-uhr",
    "haltestelle-wartehallen",
    "mobiliar-im-bahnhof",
    "wifistation",
    "abfahrtsplakate0",
    # Plaene / Linien / Bilder
    "haltestelle-karte-trafimage",
    "linie",
    "linie-mit-betriebspunkten",
    "bilder-von-bahnhofen",
]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "taktland-explore/0.1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def explore(dataset_id):
    meta = get(f"{BASE}/{urllib.parse.quote(dataset_id)}")
    fields = [
        {"name": f.get("name"), "type": f.get("type"), "label": f.get("label")}
        for f in meta.get("fields", [])
    ]
    sample = get(f"{BASE}/{urllib.parse.quote(dataset_id)}/records?limit=1")
    results = sample.get("results", [])
    return {
        "dataset_id": dataset_id,
        "title": meta.get("metas", {}).get("default", {}).get("title"),
        "records_count": meta.get("metas", {}).get("default", {}).get("records_count"),
        "modified": meta.get("metas", {}).get("default", {}).get("modified"),
        "license": meta.get("metas", {}).get("default", {}).get("license"),
        "fields": fields,
        "sample": results[0] if results else None,
    }


def main():
    ids = sys.argv[1:] or CANDIDATES
    out = {}
    for did in ids:
        try:
            out[did] = explore(did)
            n = len(out[did]["fields"])
            print(f"ok   {did:<48} {n:>3} Felder, {out[did]['records_count']} Records")
        except Exception as e:  # noqa: BLE001 - Erkundung soll nicht abbrechen
            out[did] = {"dataset_id": did, "error": str(e)}
            print(f"FEHL {did:<48} {e}")
        time.sleep(0.3)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n-> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
