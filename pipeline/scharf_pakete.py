"""Die Kacheln aus data/scharf_extern als ZIP-Pakete für daten.taktland.ch (Michael, 2026-10-12).

Je Paket höchstens GROESSE Bytes, ungepackt gespeichert (JPEG und .hgz sind schon gepackt), Pfade unter scharf/.
index.json kommt allein ins letzte Paket: erst wenn es ausgepackt ist, sieht die App die neuen Kacheln. Dazu
server/daten/holen.php mit der Liste der Pakete, für den Weg über ein GitHub-Release.

    .venv/bin/python pipeline/scharf_pakete.py
"""
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUELLE = ROOT / "data" / "scharf_extern"
ZIEL = ROOT / "data" / "scharf_pakete"
GROESSE = 400_000_000


def main():
    ZIEL.mkdir(exist_ok=True)
    for alt in ZIEL.glob("*.zip"):
        alt.unlink()
    dateien = sorted(p for p in QUELLE.iterdir() if p.name != "index.json")
    pakete, jetzt, summe = [], [], 0
    for p in dateien:
        g = p.stat().st_size
        if jetzt and summe + g > GROESSE:
            pakete.append(jetzt); jetzt, summe = [], 0
        jetzt.append(p); summe += g
    if jetzt:
        pakete.append(jetzt)
    namen = []
    for i, teil in enumerate(pakete + [[QUELLE / "index.json"]], 1):
        name = f"scharf-teil-{i:02d}.zip"
        with zipfile.ZipFile(ZIEL / name, "w", zipfile.ZIP_STORED) as z:
            for p in teil:
                z.write(p, f"scharf/{p.name}")
        namen.append(name)
        print(f"{name}: {len(teil)} Dateien, {(ZIEL / name).stat().st_size / 1e6:.0f} MB")
    php = (ROOT / "server" / "daten" / "holen.php").read_text(encoding="utf-8")
    php = re.sub(r"const PAKETE = \[.*?\];", "const PAKETE = [" + ", ".join(f"'{n}'" for n in namen) + "];", php)
    (ZIEL / "holen.php").write_text(php, encoding="utf-8")


if __name__ == "__main__":
    main()
