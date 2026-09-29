#!/usr/bin/env python3
"""Anfang und Ende von SBB-Brücken aus swissTLM3D: data/bruecken_bereich.json.

Die Quelle «brucken» der SBB nennt je Brücke einen Kilometer und die Zahl der
Baueinheiten, aber keine Länge (docs/datenlage.md). swissTLM3D zeichnet Brücken
der Bahn als Linien (pipeline/build_tlm_bauwerke.py). Michael, 2026-09-29: «Ist
es möglich, dort wo angegeben, [die Brückenlänge] einzubauen und auch dort dann
die Streckenlinie wie bei den Tunneln doppelt so dick zu machen».

Gesucht werden Brücken aus swissTLM3D, deren beide Enden auf der Linie liegen
(höchstens AUF_LINIE_KM daneben). Stücke, die auf der Linie aneinanderstossen
(Lücke höchstens LUECKE_KM), gelten als eine Brücke. Liegt der Kilometer laut
SBB in genau einer solchen Brücke oder höchstens NEBEN_KM daneben und liegt
keine andere SBB-Brücke darin, auch keine einer anderen Linie (der Viadukt der
Lorraine in Bern ist in swissTLM3D ein Stück, bei der SBB vier Brücken), gelten
ihr Anfang und Ende auf der Linie; die Länge ist der Abstand dieser Kilometer.
Sonst bleibt es beim Punkt ohne Länge. Die Länge stammt damit aus der
Zeichnung von swisstopo, nicht aus den Daten der SBB.

    .venv/bin/python pipeline/build_bruecken_bereich.py
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_strecken import KM_LAT, KM_LON, linienzuege, projektion  # noqa: E402
from build_tunnel_richtung import punkt_bei  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LINIEN = ROOT / "data" / "linien"
ZIEL = ROOT / "data" / "bruecken_bereich.json"

AUF_LINIE_KM = 0.05
LUECKE_KM = 0.01
NEBEN_KM = 0.03
#: so weit quer zur Linie zählen andere SBB-Brücken mit, auch auf parallelen Gleisen
DANEBEN_KM = 0.08
#: kürzer gilt nicht als Brücke mit Länge: meist eine Unterführung, die swissTLM3D kaum zeichnet
KUERZESTE_M = 5


def tlm_bruecken():
    d = json.loads((ROOT / "data" / "tlm_bauwerke.json").read_text(encoding="utf-8"))
    raus = []
    for b in d["bauwerke"].values():
        if b["art"] not in ("bruecke", "gedeckte_bruecke"):
            continue
        la, lo = b["start"]
        pts = [(la, lo)]
        for i in range(0, len(b["d"]), 2):
            la += b["d"][i]; lo += b["d"][i + 1]
            pts.append((la, lo))
        xy = [(p[1] / 1e5 * KM_LON, p[0] / 1e5 * KM_LAT) for p in pts]
        raus.append((xy[0], xy[-1], sum(math.dist(a, c) for a, c in zip(xy, xy[1:]))))
    return raus, d["stand"]


def sbb_punkte():
    """Lage jeder SBB-Brücke laut Quelle, alle Linien"""
    d = json.loads((ROOT / "data" / "standort.json").read_text(encoding="utf-8"))
    return [(x[4] * KM_LON, x[3] * KM_LAT) for x in d["bruecken"] if x[3] is not None]


def main():
    zuege, _ = linienzuege()
    tlm, stand = tlm_bruecken()
    alle_sbb = sbb_punkte()
    raus, ohne, gesamt = {}, 0, 0
    for p in sorted(LINIEN.glob("*.json"), key=lambda x: int(x.stem)):
        f = json.loads(p.read_text(encoding="utf-8"))
        nr = f["linie"]
        if nr not in zuege:
            continue
        zug = zuege[nr]
        for i, b in enumerate((f.get("bruecken") or {}).get("items", [])):
            gesamt += 1
            km = b["km"]
            hier = punkt_bei(zug, km)
            spannen = []
            for a, e, lang in tlm:
                # nur Brücken in der Nähe; dann beide Enden auf die Linie
                if min(math.dist(a, hier), math.dist(e, hier)) > lang + 0.3:
                    continue
                (da, ka), (de, ke) = projektion(a, zug), projektion(e, zug)
                if da > AUF_LINIE_KM or de > AUF_LINIE_KM:
                    continue
                spannen.append([min(ka, ke), max(ka, ke)])
            # aneinanderstossende Stücke zusammen
            spannen.sort()
            zusammen = []
            for v, w in spannen:
                if zusammen and v <= zusammen[-1][1] + LUECKE_KM:
                    zusammen[-1][1] = max(zusammen[-1][1], w)
                else:
                    zusammen.append([v, w])
            treffer = [(v, w) for v, w in zusammen if v - NEBEN_KM <= km <= w + NEBEN_KM]
            allein = False
            if len(treffer) == 1:
                v, w = treffer[0]
                darin = 0
                for q in alle_sbb:
                    if math.dist(q, hier) > (w - v) + 0.3:
                        continue
                    dq, kq = projektion(q, zug)
                    if dq <= DANEBEN_KM and v - NEBEN_KM <= kq <= w + NEBEN_KM:
                        darin += 1
                allein = darin == 1
            if allein and (treffer[0][1] - treffer[0][0]) * 1000 >= KUERZESTE_M:
                v, w = treffer[0]
                raus[f"{nr}:{i}"] = {"von": round(v, 3), "bis": round(w, 3), "laenge_m": round((w - v) * 1000)}
            else:
                ohne += 1
    # dieselbe Spanne für zwei Brücken derselben Linie: welche es ist, bleibt offen
    zaehler = {}
    for k, x in raus.items():
        zaehler.setdefault((k.split(":")[0], x["von"], x["bis"]), []).append(k)
    for ks in zaehler.values():
        if len(ks) > 1:
            for k in ks:
                del raus[k]
                ohne += 1
    ZIEL.write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo), Brücken aus pipeline/build_tlm_bauwerke.py",
        "stand": stand,
        "hinweis": "Anfang und Ende auf der Linie (Kilometer der Linie, auf die Enden der Brücke in "
                   "swissTLM3D gelegt) für SBB-Brücken. Nur wenn der Kilometer laut SBB in genau einer "
                   "Brücke von swissTLM3D liegt, deren Enden auf der Linie liegen. laenge_m: Abstand "
                   "dieser Kilometer, also laut Zeichnung von swisstopo, nicht laut SBB.",
        "bruecken": raus,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"bruecken_bereich.json: {len(raus)} von {gesamt} Brücken mit Anfang und Ende aus "
          f"swissTLM3D, {ohne} ohne eindeutigen Treffer")


if __name__ == "__main__":
    main()
