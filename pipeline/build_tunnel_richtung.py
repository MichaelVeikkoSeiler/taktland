#!/usr/bin/env python3
"""Richtung der SBB-Tunnel aus swissTLM3D: data/tunnel_richtung.json.

Die Quelle «tunnel» der SBB nennt je Tunnel einen Kilometer und die Länge,
nicht aber, an welchem Portal der Kilometer liegt. Passt die Länge in beide
Richtungen auf die Linie, kennt Taktland die Ausfahrt nicht (250 von 265
Tunneln, darunter Gotthard und Ceneri). Michael, 2026-09-26: «ja zur
Tunnelrichtung».

swissTLM3D zeichnet jeden Bahntunnel als Linie mit zwei Enden
(pipeline/build_tlm_bauwerke.py). Gesucht wird ein Tunnel, dessen Enden auf der Linie
liegen (höchstens AUF_LINIE_KM daneben), dessen Länge dort höchstens TOLERANZ
von der Länge laut SBB abweicht und in dem oder neben dem (PORTAL_KM) der
Kilometer laut SBB liegt. Dieser Kilometer liegt nicht immer an einem Portal:
beim Gotthardtunnel (km 77.397) liegt er mitten drin, swissTLM3D legt den
Tunnel auf km 70.78 bis 85.793, genau 15 km wie laut SBB. Gibt es genau einen
solchen Tunnel, gelten seine Enden als Anfang und Ende; sonst bleibt es beim
Punkt.

    .venv/bin/python pipeline/build_tunnel_richtung.py
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_strecken import KM_LAT, KM_LON, linienzuege, projektion, tunnel_bereich  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LINIEN = ROOT / "data" / "linien"
ZIEL = ROOT / "data" / "tunnel_richtung.json"

PORTAL_KM = 0.3
AUF_LINIE_KM = 0.15
#: so weit darf die Länge in swissTLM3D von der Länge laut SBB abweichen
TOLERANZ = 0.1


def punkt_bei(zug, km):
    """Lage auf der Linie beim Kilometer, zwischen den Punkten linear"""
    x, y, k = zug
    i = max(1, min(len(k) - 1, int(__import__("numpy").searchsorted(k, km))))
    t = (km - k[i - 1]) / ((k[i] - k[i - 1]) or 1)
    t = max(0.0, min(1.0, t))
    return x[i - 1] + t * (x[i] - x[i - 1]), y[i - 1] + t * (y[i] - y[i - 1])


def tlm_tunnel():
    d = json.loads((ROOT / "data" / "tlm_bauwerke.json").read_text(encoding="utf-8"))
    raus = {}
    for k, b in d["bauwerke"].items():
        if b["art"] not in ("tunnel", "galerie"):
            continue
        la, lo = b["start"]
        pts = [(la, lo)]
        for i in range(0, len(b["d"]), 2):
            la += b["d"][i]; lo += b["d"][i + 1]
            pts.append((la, lo))
        ende = [(p[1] / 1e5 * KM_LON, p[0] / 1e5 * KM_LAT) for p in (pts[0], pts[-1])]
        raus[k] = {"enden": ende, "name": b.get("name")}
    return raus, d["stand"]


def gruppen(tlm):
    """Tunnel mit gleichem Namen gelten als ein Tunnel (der Ceneri-Basistunnel
    liegt in swissTLM3D in zwei Stücken); ohne Namen jedes Stück für sich"""
    raus = {}
    for k, x in tlm.items():
        schluessel = f"n:{x['name']}" if x["name"] else k
        g = raus.setdefault(schluessel, {"enden": [], "ids": [], "name": x["name"]})
        g["enden"] += x["enden"]
        g["ids"].append(k)
    return raus


def main():
    zuege, _ = linienzuege()
    tlm, stand = tlm_tunnel()
    alle = gruppen(tlm)
    raus, ohne, schon = {}, 0, 0
    for p in sorted(LINIEN.glob("*.json"), key=lambda x: int(x.stem)):
        f = json.loads(p.read_text(encoding="utf-8"))
        nr = f["linie"]
        if nr not in zuege:
            continue
        zug = zuege[nr]
        lo, hi = float(zug[2].min()), float(zug[2].max())
        portal_bei = None
        for i, t in enumerate((f.get("tunnel") or {}).get("items", [])):
            km, lm = t["km"], t["laenge_m"]
            if not lm:
                continue
            v, w = tunnel_bereich(km, lm, lo, hi)
            if v != w:
                schon += 1
                continue
            lang = lm / 1000
            portal_bei = punkt_bei(zug, km)
            passend = []
            for g in alle.values():
                # nur Tunnel in der Nähe; dann jedes Ende auf die Linie
                if min(math.dist(e, portal_bei) for e in g["enden"]) > lang + 2:
                    continue
                pr = [projektion(e, zug) for e in g["enden"]]
                if any(d > AUF_LINIE_KM for d, _ in pr):
                    continue
                a, b = min(k for _, k in pr), max(k for _, k in pr)
                # Länge wie laut SBB, und der Kilometer der SBB im Tunnel oder direkt daneben
                if abs((b - a) - lang) <= max(TOLERANZ * lang, 0.05) and a - PORTAL_KM <= km <= b + PORTAL_KM:
                    passend.append((round(a, 3), round(b, 3), g["ids"]))
            if len({(a, b) for a, b, _ in passend}) == 1:
                a, b, ids = passend[0]
                raus[f"{nr}:{i}"] = {"von": a, "bis": b, "tlm": sorted(ids, key=lambda k: int(k[1:]))}
            else:
                ohne += 1
    ZIEL.write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo), Tunnel aus pipeline/build_tlm_bauwerke.py",
        "stand": stand,
        "hinweis": "Anfang und Ende auf der Linie (Kilometer der Linie, auf die Enden des Tunnels in "
                   "swissTLM3D gelegt) für SBB-Tunnel, bei denen die Länge laut SBB in beide Richtungen "
                   "passt. Nur wenn genau ein Tunnel in swissTLM3D auf der Linie liegt, dessen Länge "
                   "höchstens 10 % von der Länge laut SBB abweicht und in dem oder neben dem der "
                   "Kilometer laut SBB liegt. tlm: die Stücke in swissTLM3D.",
        "tunnel": raus,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"tunnel_richtung.json: {len(raus)} Tunnel mit Anfang und Ende aus swissTLM3D, {ohne} ohne "
          f"eindeutigen Treffer, {schon} hatten die Richtung schon aus der Länge")


if __name__ == "__main__":
    main()
