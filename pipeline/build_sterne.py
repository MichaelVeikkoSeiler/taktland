"""
Sterne für den Nachthimmel in «3D Schweiz» (Michael, 2026-10-24: «Himmel nachts dunkler und mit Sternen machen»): alle Sterne
bis zur Helligkeit 6 (was man von blossem Auge etwa sieht) aus dem Hipparcos-Katalog (ESA), wie ihn d3-celestial von Olaf Frohn
aufbereitet hat (BSD-Lizenz, Datei data/stars.6.json im npm-Paket): Rektaszension und Deklination in Grad, Helligkeit und
Farbindex B−V. Wo ein Stern zu einer Stunde am Himmel steht, rechnet die App (src/sterne.ts).

    python3 pipeline/build_sterne.py
"""
import io
import json
import tarfile
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "sterne.json"
VERSION = "0.7.35"
URL = f"https://registry.npmjs.org/d3-celestial/-/d3-celestial-{VERSION}.tgz"


def main():
    roh = urllib.request.urlopen(URL, timeout=120).read()
    with tarfile.open(fileobj=io.BytesIO(roh), mode="r:gz") as tar:
        daten = json.load(tar.extractfile("package/data/stars.6.json"))
    sterne = []
    for f in daten["features"]:
        lon, lat = f["geometry"]["coordinates"]
        mag = f["properties"]["mag"]
        try:
            bv = float(f["properties"]["bv"])
        except (TypeError, ValueError):
            bv = None
        # Rektaszension 0 bis 360 Grad (die Quelle schreibt −180 bis 180), auf 0,01 Grad
        sterne.append([round((lon % 360) * 100), round(lat * 100), round(mag * 10), None if bv is None else round(bv * 100)])
    sterne.sort(key=lambda s: s[2])
    ZIEL.write_text(json.dumps({
        "quelle": f"Hipparcos-Katalog (ESA), aufbereitet von d3-celestial {VERSION} (Olaf Frohn, BSD-Lizenz)",
        "geladen": date.today().isoformat(),
        "hinweis": "Sterne bis zur Helligkeit 6; je Stern Rektaszension und Deklination in hundertstel Grad (J2000), "
                   "Helligkeit in Zehnteln, Farbindex B−V in Hundertsteln (null: ohne Angabe)",
        "sterne": sterne,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(sterne)} Sterne nach {ZIEL.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
