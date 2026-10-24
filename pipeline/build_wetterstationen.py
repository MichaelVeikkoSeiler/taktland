"""
Wetterstationen für das echte Wetter in der Modellbahn (Michael, 2026-10-24: «dass bei der Modellbahn immer das reale Wetter
simuliert wird»): die automatischen Messstationen von MeteoSchweiz (SwissMetNet, Open Government Data) mit Kürzel, Name und Lage.
Die App holt die Messwerte selbst (ogd-smn_{kürzel}_t_now.csv, alle 10 Minuten neu, data.geo.admin.ch erlaubt den Abruf von
überall); hier steht nur, wo welche Station steht, und unter welcher Nummer die Prognose für sie steht (Windhose, Michael,
2026-10-24: «wie die Windverhältnisse sind. Auch mit Prognose für die nächste Woche»): die lokale Prognose von MeteoSchweiz
(ogd-local-forecasting, Punkte vom Typ 1 «Station», zu Postleitzahlen und Berggipfeln gibt es eigene).

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
PUNKTE = "https://data.geo.admin.ch/ch.meteoschweiz.ogd-local-forecasting/ogd-local-forecasting_meta_point.csv"


def main():
    roh = urllib.request.urlopen(URL, timeout=60).read().decode("latin-1")
    punkte = urllib.request.urlopen(PUNKTE, timeout=60).read().decode("latin-1")
    prognose = {z["station_abbr"]: int(z["point_id"]) for z in csv.DictReader(io.StringIO(punkte), delimiter=";")
                if z["point_type_id"] == "1" and z["station_abbr"]}
    stationen = []
    for z in csv.DictReader(io.StringIO(roh), delimiter=";"):
        if not z["station_abbr"] or not z["station_coordinates_lv95_east"]:
            continue
        stationen.append([z["station_abbr"], z["station_name"], round(float(z["station_coordinates_lv95_east"])),
                          round(float(z["station_coordinates_lv95_north"])), round(float(z["station_height_masl"] or 0)),
                          prognose.get(z["station_abbr"])])
    stationen.sort()
    ZIEL.write_text(json.dumps({
        "quelle": "MeteoSchweiz, SwissMetNet (Open Government Data), Stationen",
        "geladen": date.today().isoformat(),
        "hinweis": "je Station Kürzel, Name, Ost, Nord (LV95), Höhe in m, Nummer des Punkts in der lokalen Prognose "
                   "(null: keiner); die Messwerte holt die App: "
                   "https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/{kürzel klein}/ogd-smn_{kürzel klein}_t_now.csv, "
                   "die Prognose aus ogd-local-forecasting",
        "stationen": stationen,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(stationen)} Stationen, {sum(1 for s in stationen if s[5] is not None)} mit Prognose")


if __name__ == "__main__":
    main()
