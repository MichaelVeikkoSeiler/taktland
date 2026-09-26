#!/usr/bin/env python3
"""Prüft data/strecken.json und sucht Wege darin, wie es die App tut.

Die Seite «Strecke» zählt Tunnel und Brücken entlang eines Wegs. Die Zählung
entsteht in der App aus Listen, die pipeline/build_strecken.py je Abschnitt
vorbereitet. Geprüft wird darum die Grundlage: Steht auf jedem Linienstück
genau, was die Linienfakten zwischen seinen Kilometern führen?

    python generator/strecken.py --validieren
    python generator/strecken.py "Zürich HB" "Lugano"            # Weg zeigen
    python generator/strecken.py "Basel SBB" "Chiasso" "Luzern"   # über Luzern

Nur Standardbibliothek: läuft auch in der Prüfung auf GitHub.
"""
import heapq
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATEI = ROOT / "data" / "strecken.json"
GEOMETRIE = ROOT / "data" / "strecken_geometrie.json"
LINIEN = ROOT / "data" / "linien"
FACTS = ROOT / "data" / "facts"


def laden():
    return json.loads(DATEI.read_text(encoding="utf-8"))


def fakten_objekte():
    """{(«tunnel»|«bruecken», linie): [Einträge]} aus den Linienfakten"""
    raus = {}
    for p in LINIEN.glob("*.json"):
        f = json.loads(p.read_text(encoding="utf-8"))
        for art in ("tunnel", "bruecken"):
            raus[(art, f["linie"])] = (f.get(art) or {}).get("items", [])
    u = json.loads((ROOT / "data" / "linien_uebersicht.json").read_text(encoding="utf-8"))
    for x in u["bruecken_ohne_seite_liste"]:
        raus[("bruecken", x["linie"])] = x["items"]
    return raus


def tunnel_bereich(km, laenge_m, lo, hi):
    """Zweite Meinung zu pipeline/build_strecken.py: Der Tunnel gilt als
    Bereich, wenn seine Länge nur in eine Richtung auf die Linie passt."""
    if not laenge_m:
        return km, km
    lang = laenge_m / 1000
    nach_unten = lo - 0.1 <= km - lang and km <= hi + 0.1
    nach_oben = lo - 0.1 <= km and km + lang <= hi + 0.1
    if nach_unten != nach_oben:
        return (km - lang, km) if nach_unten else (km, km + lang)
    return km, km


def geometrie_bereiche():
    """Je Linie der kleinste und grösste km der Geometrie für den Fahrtmodus"""
    g = json.loads(GEOMETRIE.read_text(encoding="utf-8"))
    raus = {}
    for nr, x in g["linien"].items():
        m = [x["start"][0]]
        for i in range(0, len(x["d"]), 3):
            m.append(m[-1] + x["d"][i])
        raus[int(nr)] = (min(m) / 1000, max(m) / 1000)
    return raus


def validieren():
    n = laden()
    obj = fakten_objekte()
    fehler = []
    punkte = n["punkte"]
    geprueft = 0
    geo = geometrie_bereiche()
    for abk in punkte:
        lage = n["lagen"].get(abk)
        if not lage or not (45.5 < lage[0] < 48.2 and 5.5 < lage[1] < 11):
            fehler.append(f"{punkte[abk]}: Lage {lage} fehlt oder liegt nicht in der Schweiz und Umgebung")
    for e in n["abschnitte"]:
        wo = f"{punkte.get(e['von'], e['von'])} – {punkte.get(e['nach'], e['nach'])}"
        if e["von"] not in punkte or e["nach"] not in punkte:
            fehler.append(f"{wo}: Betriebspunkt fehlt in punkte")
        if not e["gewicht"] > 0:
            fehler.append(f"{wo}: Gewicht {e['gewicht']}")
        if e["isb"] != "SBB" and e.get("teile"):
            fehler.append(f"{wo}: Abschnitt der {e['isb']} mit Tunnel- und Brückendaten, "
                          "die Quellen führen nur die SBB")
        for t in e.get("teile", []):
            nr = t["linie"]
            lo, hi = sorted((t["km_von"], t["km_bis"]))
            bereich = n["linien_bereich"].get(str(nr))
            if not bereich:
                fehler.append(f"{wo}: Linie {nr} ohne Bereich")
                continue
            soll_t = [f"{nr}:{i}" for i, x in enumerate(obj.get(("tunnel", nr), []))
                      if (lambda v, w: w >= lo and v <= hi)(*tunnel_bereich(x["km"], x["laenge_m"], *bereich))]
            soll_b = [f"{nr}:{i}" for i, x in enumerate(obj.get(("bruecken", nr), []))
                      if lo <= x["km"] <= hi]
            geprueft += len(soll_t) + len(soll_b)
            if t["tunnel"] != soll_t:
                fehler.append(f"{wo}, Linie {nr}: Tunnel {t['tunnel']} statt {soll_t}")
            for i in t["tunnel"]:
                x = obj[("tunnel", nr)][int(i.split(":")[1])]
                soll = [round(v, 3) for v in tunnel_bereich(x["km"], x["laenge_m"], *bereich)]
                if n["tunnel_bereiche"].get(i) != soll:
                    fehler.append(f"{wo}: Bereich von Tunnel {i} {n['tunnel_bereiche'].get(i)} statt {soll}")
            # der Fahrtmodus braucht die Lage der Linie über das ganze Stück
            g = geo.get(nr)
            if not g or lo < g[0] - 0.2 or hi > g[1] + 0.2:
                fehler.append(f"{wo}: Geometrie der Linie {nr} {g} deckt km {lo}–{hi} nicht ab")
            if t["bruecken"] != soll_b:
                fehler.append(f"{wo}, Linie {nr}: Brücken weichen von den Fakten ab "
                              f"({len(t['bruecken'])} statt {len(soll_b)})")
    # Bauwerke aus swissTLM3D: nur auf Abschnitten anderer Bahnen mit Verlauf,
    # jeder Punkt höchstens 30 m daneben (wie in pipeline/build_strecken.py)
    g_datei = json.loads((ROOT / "data" / "strecken_geometrie.json").read_text(encoding="utf-8"))
    verlaeufe, bauwerke = g_datei.get("abschnitte", {}), g_datei.get("bauwerke", {})

    def punkte_von(z):
        la, lo = z["start"]
        raus = [(la, lo)]
        for i in range(0, len(z["d"]), 2):
            la += z["d"][i]; lo += z["d"][i + 1]
            raus.append((la, lo))
        return [(a / 1e5 * 111_200, b / 1e5 * 73_000) for a, b in raus]

    def abstand(p, linie):
        best = float("inf")
        for (ax, ay), (bx, by) in zip(linie, linie[1:]):
            dx, dy = bx - ax, by - ay
            l2 = dx * dx + dy * dy or 1
            t = max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2))
            best = min(best, ((ax + t * dx - p[0]) ** 2 + (ay + t * dy - p[1]) ** 2) ** 0.5)
        return best

    for e in n["abschnitte"]:
        if not e.get("tlm"):
            continue
        wo = f"{punkte.get(e['von'])} – {punkte.get(e['nach'])}"
        v = verlaeufe.get(f"{e['von']}|{e['nach']}")
        if e.get("teile") or not v:
            fehler.append(f"{wo}: Bauwerke aus swissTLM3D ohne eigenen Verlauf")
            continue
        linie = punkte_von(v)
        for kb in e["tlm"]:
            b = bauwerke.get(kb)
            geprueft += 1
            if not b:
                fehler.append(f"{wo}: Bauwerk {kb} fehlt in strecken_geometrie.json")
            else:
                # wie pipeline/build_strecken.py: ganz, oder mindestens 100 m und 30 % des
                # Kürzeren von Bauwerk und Abschnitt höchstens 30 m neben dem Verlauf
                p = punkte_von(b)
                proben = [p[0]]
                for (ax, ay), (bx, by) in zip(p, p[1:]):
                    k = max(1, int(((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5 // 25))
                    proben += [(ax + (bx - ax) * j / k, ay + (by - ay) * j / k) for j in range(1, k + 1)]
                nah = sum(1 for q in proben if abstand(q, linie) <= 31)
                lang = lambda z: sum(((b2[0] - a2[0]) ** 2 + (b2[1] - a2[1]) ** 2) ** 0.5 for a2, b2 in zip(z, z[1:]))
                if nah < len(proben) and not ((nah - 1) * 25 >= 100
                                              and (nah - 1) * 25 >= 0.3 * min(lang(proben), lang(linie)) - 30):
                    fehler.append(f"{wo}: Bauwerk {kb} liegt zu wenig nahe am Verlauf")

    # jeder Bahnhof ist im Netz oder ausdrücklich nicht
    uics = {int(p.stem) for p in FACTS.glob("*.json")}
    im = {int(u) for u in n["bahnhoefe"]}
    for u in sorted(uics - im - set(n["nicht_im_netz"])):
        fehler.append(f"Bahnhof {u}: weder im Netz noch unter nicht_im_netz")
    for u, abk in n["bahnhoefe"].items():
        if abk not in punkte:
            fehler.append(f"Bahnhof {u}: Betriebspunkt {abk} fehlt")
    print(f"{len(n['abschnitte'])} Abschnitte, {len(im)} Bahnhöfe im Netz, "
          f"{geprueft} Tunnel und Brücken gegen die Fakten geprüft")
    for f in fehler[:20]:
        print(f"    FEHLER   {f}")
    if fehler:
        print(f"\n{len(fehler)} Fehler")
        return 1
    print("Jede Zuordnung stimmt mit den Linienfakten überein.")
    return 0


def weg(n, von_uic, nach_uic, ueber_uic=None):
    """Der Weg als Liste von Abschnitten, wie die App ihn sucht"""
    if ueber_uic:
        a, b = weg(n, von_uic, ueber_uic), weg(n, ueber_uic, nach_uic)
        return a + b if a is not None and b is not None else None
    start, ziel = n["bahnhoefe"].get(str(von_uic)), n["bahnhoefe"].get(str(nach_uic))
    if not start or not ziel:
        return None
    nachbarn = {}
    for e in n["abschnitte"]:
        nachbarn.setdefault(e["von"], []).append((e["nach"], e))
        nachbarn.setdefault(e["nach"], []).append((e["von"], e))
    dist, vor, heap = {start: 0}, {}, [(0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == ziel:
            break
        if d > dist[u]:
            continue
        for v, e in nachbarn.get(u, []):
            if d + e["gewicht"] < dist.get(v, float("inf")):
                dist[v] = d + e["gewicht"]
                vor[v] = (u, e)
                heapq.heappush(heap, (dist[v], v))
    if ziel not in dist:
        return None
    raus, u = [], ziel
    while u != start:
        u, e = vor[u]
        raus.append(e)
    return raus[::-1]


def entlang(abschnitte):
    """Tunnel und Brücken entlang des Wegs, jede nur einmal, in Wegrichtung"""
    tunnel, bruecken = [], []
    for e in abschnitte:
        for t in e.get("teile", []):
            tunnel += [i for i in t["tunnel"] if i not in tunnel]
            bruecken += [i for i in t["bruecken"] if i not in bruecken]
    return tunnel, bruecken


def main():
    if "--validieren" in sys.argv:
        return validieren()
    namen = {json.loads(p.read_text(encoding="utf-8"))["name"]: int(p.stem) for p in FACTS.glob("*.json")}
    n = laden()
    args = sys.argv[1:]
    w = weg(n, namen[args[0]], namen[args[1]], namen[args[2]] if len(args) > 2 else None)
    if w is None:
        print("kein Weg")
        return 1
    obj = fakten_objekte()
    t, b = entlang(w)
    ohne = [e for e in w if not e.get("teile")]
    print(f"{len(w)} Abschnitte, {len(ohne)} ohne Daten | Tunnel {len(t)} | Brücken {len(b)}")
    for i in t:
        nr, k = i.split(":")
        x = obj[("tunnel", int(nr))][int(k)]
        print(f"   {x['name']} ({x['laenge_m']} m, Linie {nr})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
