"""Die Kacheln aus data/scharf_extern als ZIP-Pakete für daten.taktland.ch (Michael, 2026-10-12).

Je Paket höchstens GROESSE Bytes, ungepackt gespeichert (JPEG und .hgz sind schon gepackt), Pfade unter scharf/.
Der Index der Reihe kommt als scharf/index-{teil}.json ins letzte Paket; holen.php fügt am Ende alle zu scharf/index.json
zusammen, erst dann sieht die App die neuen Kacheln.

    .venv/bin/python pipeline/scharf_pakete.py --teil r1
"""
import argparse
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUELLE = ROOT / "data" / "scharf_extern"
ZIEL = ROOT / "data" / "scharf_pakete"
GROESSE = 400_000_000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teil", default="a", help="Name der Reihe, steht im Namen der Pakete und des Index")
    teil = ap.parse_args().teil
    ZIEL.mkdir(exist_ok=True)
    for alt in ZIEL.glob(f"scharf-{teil}-*.zip"):
        alt.unlink()
    dateien = sorted(p for p in QUELLE.iterdir() if p.name != "index.json")
    pakete, jetzt, summe = [], [], 0
    for p in dateien:
        g = p.stat().st_size
        if jetzt and summe + g > GROESSE:
            pakete.append(jetzt); jetzt, summe = [], 0
        jetzt.append(p); summe += g
    pakete.append(jetzt)
    for i, inhalt in enumerate(pakete, 1):
        name = ZIEL / f"scharf-{teil}-{i:02d}.zip"
        with zipfile.ZipFile(name, "w", zipfile.ZIP_STORED) as z:
            for p in inhalt:
                z.write(p, f"scharf/{p.name}")
            if i == len(pakete):
                z.write(QUELLE / "index.json", f"scharf/index-{teil}.json")
        print(f"{name.name}: {len(inhalt)} Dateien, {name.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
