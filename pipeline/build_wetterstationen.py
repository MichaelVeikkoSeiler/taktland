"""
Wetterstationen für das echte Wetter in der Modellbahn (Michael, 2026-10-24: «dass bei der Modellbahn immer das reale Wetter
simuliert wird»): die automatischen Messstationen von MeteoSchweiz (SwissMetNet, Open Government Data) mit Kürzel, Name und Lage.
Die App holt die Messwerte selbst (ogd-smn_{kürzel}_t_now.csv, alle 10 Minuten neu, data.geo.admin.ch erlaubt den Abruf von
überall); hier steht nur, wo welche Station steht.

    python3 pipeline/build_wetterstationen.py
"""
import csv
import io
import json
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "wetterstationen.json"
URL = "https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv"


def main():
    roh = urllib.request.urlopen(URL, timeout=60).read().decode("latin-1")
    stationen = []
    for z in csv.DictReader(io.StringIO(roh), delimiter=";"):
        if not z["station_abbr"] or not z["station_coordinates_lv95_east"]:
            continue
        stationen.append([z["station_abbr"], z["station_name"], round(float(z["station_coordinates_lv95_east"])),
                          round(float(z["station_coordinates_lv95_north"])), round(float(z["station_height_masl"] or 0))])
    stationen.sort()
    ZIEL.write_text(json.dumps({
        "quelle": "MeteoSchweiz, SwissMetNet (Open Government Data), Stationen",
        "geladen": date.today().isoformat(),
        "hinweis": "je Station Kürzel, Name, Ost, Nord (LV95), Höhe in m; die Messwerte holt die App: "
                   "https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/{kürzel klein}/ogd-smn_{kürzel klein}_t_now.csv",
        "stationen": stationen,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(stationen)} Stationen")


if __name__ == "__main__":
    main()
