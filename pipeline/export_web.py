#!/usr/bin/env python3
"""Die Seite für taktland.ch zusammenstellen: web/ nach _site/, die gebaute App
nach _site/app/. Die Zahlen auf der Seite (data-zahl) kommen dabei aus dem
Index der App, damit sie nie veralten (Michael, 2026-09-29).

    python3 pipeline/export_web.py        # nach npm run build in app/
"""
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "_site"


def zahl(n: int) -> str:
    """Zahlen über 9999 mit Apostroph, wie in der App"""
    return f"{n:,}".replace(",", "'") if n > 9999 else str(n)


def main():
    index = json.loads((ROOT / "app" / "dist" / "data" / "index.json").read_text(encoding="utf-8"))
    werte = {"bahnhoefe": index["bahnhoefe_gesamt"], **index["zahlen"]}
    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    shutil.copytree(ROOT / "web", ZIEL)
    shutil.copytree(ROOT / "app" / "dist", ZIEL / "app")
    seite = ZIEL / "index.html"
    html = seite.read_text(encoding="utf-8")
    gefunden = set()

    def ersetzen(m):
        gefunden.add(m.group(2))
        return f"{m.group(1)}{zahl(werte[m.group(2)])}{m.group(3)}"

    html = re.sub(r'(<[^>]*data-zahl="(\w+)"[^>]*>)[^<]*(<)', ersetzen, html)
    fehlt = set(werte) - gefunden
    if fehlt:
        sys.exit(f"web/index.html: keine Stelle für {sorted(fehlt)}")
    seite.write_text(html, encoding="utf-8")
    print("taktland.ch: " + ", ".join(f"{k} {zahl(v)}" for k, v in werte.items()))


if __name__ == "__main__":
    main()
