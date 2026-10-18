"""Die Kacheln aus data/scharf_extern als ZIP-Pakete für daten.taktland.ch (Michael, 2026-10-12).

Je Paket höchstens GROESSE Bytes, ungepackt gespeichert (JPEG und .hgz sind schon gepackt), Pfade unter scharf/.
Der Index der Reihe kommt als scharf/index-{teil}.json ins letzte Paket; holen.php fügt am Ende alle zu scharf/index.json
zusammen, erst dann sieht die App die neuen Kacheln.

    .venv/bin/python pipeline/scharf_pakete.py --teil r1
    .venv/bin/python pipeline/scharf_pakete.py --art schweiz3d --teil t3   # Details für «3D Schweiz», Pfade unter schweiz3d/
"""
import argparse
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GROESSE = 400_000_000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teil", default="a", help="Name der Reihe, steht im Namen der Pakete und des Index")
    ap.add_argument("--art", default="scharf", help="scharf oder schweiz3d: Quelle data/{art}_extern, Pfade unter {art}/")
    a = ap.parse_args()
    teil, art = a.teil, a.art
    QUELLE, ZIEL = ROOT / "data" / f"{art}_extern", ROOT / "data" / f"{art}_pakete"
    ZIEL.mkdir(exist_ok=True)
    for alt in ZIEL.glob(f"{art}-{teil}-*.zip"):
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
        name = ZIEL / f"{art}-{teil}-{i:02d}.zip"
        with zipfile.ZipFile(name, "w", zipfile.ZIP_STORED) as z:
            for p in inhalt:
                z.write(p, f"{art}/{p.name}")
            if i == len(pakete):
                z.write(QUELLE / "index.json", f"{art}/index-{teil}.json")
        print(f"{name.name}: {len(inhalt)} Dateien, {name.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
