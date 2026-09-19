#!/usr/bin/env python3
"""Baut aus dem fertigen Stand eine einzige HTML-Datei: app/dist-einzel/taktland.html

Alles steckt darin - Programm, Gestaltung, Symbole und die Daten der Bahnhöfe.
Damit läuft die Seite an jeder Adresse, auch dort, wo Nebendateien nicht
erreichbar sind. Für die Veröffentlichung als PWA wird weiterhin der normale
Stand aus app/dist verwendet, weil nur dort der Service Worker greift.
"""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "app" / "dist"
ZIEL = ROOT / "app" / "dist-einzel"


def main():
    html = (DIST / "index.html").read_text(encoding="utf-8")

    # Daten einbetten, damit nichts nachgeladen werden muss
    daten = {
        "index": json.loads((DIST / "data" / "index.json").read_text(encoding="utf-8")),
        "profile": {
            p.stem: json.loads(p.read_text(encoding="utf-8"))
            for p in sorted((DIST / "data" / "profile").glob("*.json"))
        },
    }
    einbau = ('<script>window.__TAKTLAND__=' +
              json.dumps(daten, ensure_ascii=False).replace("</", "<\\/") +
              '</script>')

    # Programm und Gestaltung hineinholen
    for treffer in re.findall(r'<script type="module"[^>]*src="\./([^"]+)"></script>', html):
        code = (DIST / treffer).read_text(encoding="utf-8")
        html = re.sub(r'<script type="module"[^>]*src="\./' + re.escape(treffer) + r'"></script>',
                      lambda _: '<script type="module">' + code.replace("</script>", "<\\/script>")
                                + '</script>', html)
    for treffer in re.findall(r'<link rel="stylesheet"[^>]*href="\./([^"]+)">', html):
        css = (DIST / treffer).read_text(encoding="utf-8")
        html = re.sub(r'<link rel="stylesheet"[^>]*href="\./' + re.escape(treffer) + r'">',
                      lambda _: "<style>" + css + "</style>", html)

    # Symbole als Data-URI, das Manifest entfällt in der Einzeldatei
    for name in ("icon-192.png", "apple-touch-icon.png"):
        roh = base64.b64encode((DIST / name).read_bytes()).decode()
        html = html.replace(f'href="./{name}"', f'href="data:image/png;base64,{roh}"')
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)

    html = html.replace("</head>", einbau + "\n  </head>")

    ZIEL.mkdir(parents=True, exist_ok=True)
    ausgabe = ZIEL / "taktland.html"
    ausgabe.write_text(html, encoding="utf-8")
    print(f"{ausgabe.relative_to(ROOT)}: {ausgabe.stat().st_size/1024:.0f} KB, "
          f"{len(daten['profile'])} Profile eingebettet")
    offen = re.findall(r'(?:src|href)="\./[^"]+"', html)
    print("noch nachzuladen:", offen or "nichts")


if __name__ == "__main__":
    main()
