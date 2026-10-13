"""Gebäude und Bäume aus data/gebaeude_extern und data/baeume_extern als ZIP-Pakete für daten.taktland.ch (Michael,
2026-10-13), wie pipeline/scharf_pakete.py.

Je Paket höchstens GROESSE Bytes, ungepackt gespeichert (.bgz und .bmd sind schon gepackt), Pfade unter gebaeude/ und
baeume/. Die Verzeichnisse der Kantone (index-{Kanton}.json) kommen ins letzte Paket; server/daten/holen.php fügt am Ende
alle zu gebaeude/index.json und baeume/index.json zusammen, erst dann sieht die App die neuen Kacheln.

    .venv/bin/python pipeline/umgebung_pakete.py --teil be
"""
import argparse
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUELLEN = {"gebaeude": ROOT / "data" / "gebaeude_extern", "baeume": ROOT / "data" / "baeume_extern"}
ZIEL = ROOT / "data" / "umgebung_pakete"
GROESSE = 400_000_000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teil", default="a", help="Name der Reihe, steht im Namen der Pakete")
    teil = ap.parse_args().teil
    ZIEL.mkdir(exist_ok=True)
    for alt in ZIEL.glob(f"umgebung-{teil}-*.zip"):
        alt.unlink()
    dateien, verzeichnisse = [], []
    for ordner, quelle in QUELLEN.items():
        if not quelle.exists():
            continue
        for p in sorted(quelle.iterdir()):
            (verzeichnisse if p.suffix == ".json" else dateien).append((p, f"{ordner}/{p.name}"))
    if not verzeichnisse:
        raise SystemExit("nichts gebaut")
    pakete, jetzt, summe = [], [], 0
    for p, pfad in dateien:
        g = p.stat().st_size
        if jetzt and summe + g > GROESSE:
            pakete.append(jetzt); jetzt, summe = [], 0
        jetzt.append((p, pfad)); summe += g
    pakete.append(jetzt + verzeichnisse)
    for i, inhalt in enumerate(pakete, 1):
        name = ZIEL / f"umgebung-{teil}-{i:02d}.zip"
        with zipfile.ZipFile(name, "w", zipfile.ZIP_STORED) as z:
            for p, pfad in inhalt:
                z.write(p, pfad)
        print(f"{name.name}: {len(inhalt)} Dateien, {name.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
