#!/usr/bin/env python3
"""Lädt den Fahrplan als GTFS von opentransportdata.swiss nach data/raw/gtfs/.

Die Plattform veröffentlicht je Fahrplanjahr einen Datensatz
(timetable-{jahr}-gtfs2020) und darin zweimal pro Woche eine neue Datei
(gtfs_fp{jahr}_{JJJJMMTT}.zip). Geladen wird die neueste Datei des
Fahrplanjahrs, das heute gilt; das Fahrplanjahr beginnt am zweiten Samstag im
Dezember, darum gilt ab dem 10. Dezember versuchsweise das nächste Jahr.

Nutzungsbedingungen: https://opentransportdata.swiss/de/terms-of-use
(Open Data, kostenlos, ohne Registrierung für Dateien; Quellenangabe
«opentransportdata.swiss»; die Daten sind regelmässig zu aktualisieren).

    python3 pipeline/fetch_fahrplan.py            # neueste Datei laden
    python3 pipeline/fetch_fahrplan.py --pruefen  # nur zeigen, welche es wäre
"""
import datetime as dt
import re
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "raw" / "gtfs"
KATALOG = "https://data.opentransportdata.swiss/de/dataset/timetable-{jahr}-gtfs2020"
#: ohne eigene Kennung lehnt der Server Anfragen von Python ab (403)
KENNUNG = {"User-Agent": "Taktland/1.0 (Lernprojekt; github.com/MichaelVeikkoSeiler/taktland)"}


def holen(url: str, timeout: int = 60):
    return urllib.request.urlopen(urllib.request.Request(url, headers=KENNUNG), timeout=timeout)


def neueste(jahr: int) -> tuple[str, str] | None:
    """(Adresse, Dateiname) der neuesten Datei des Fahrplanjahrs"""
    try:
        with holen(KATALOG.format(jahr=jahr)) as r:
            html = r.read().decode("utf-8", "replace")
    except OSError:
        return None
    links = set(re.findall(r'href="(https://[^"]+/download/(gtfs_fp%d_(\d{8})\.zip))"' % jahr, html))
    if not links:
        return None
    url, name, _ = max(links, key=lambda x: x[2])
    return url, name


def main():
    heute = dt.date.today()
    jahre = [heute.year + 1, heute.year] if (heute.month, heute.day) >= (12, 10) else [heute.year]
    fund = None
    for j in jahre:
        fund = neueste(j)
        if fund:
            break
    if not fund:
        sys.exit("Keine GTFS-Datei gefunden.")
    url, name = fund
    print(f"neueste Datei: {name}")
    if "--pruefen" in sys.argv:
        return
    ZIEL.mkdir(parents=True, exist_ok=True)
    datei = ZIEL / name
    if not datei.exists():
        teil = datei.with_suffix(".teil")
        with holen(url, 600) as r, open(teil, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        teil.rename(datei)
    ordner = ZIEL / name.removesuffix(".zip")
    if not (ordner / "stop_times.txt").exists():
        with zipfile.ZipFile(datei) as z:
            z.extractall(ordner)
    # ältere Dateien weg: sie sind gross und gelten nicht mehr
    for alt in ZIEL.iterdir():
        if alt.name.startswith("gtfs_fp") and alt.name not in (name, ordner.name):
            if alt.is_dir():
                for f in alt.iterdir():
                    f.unlink()
                alt.rmdir()
            else:
                alt.unlink()
    print(f"entpackt: {ordner.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
