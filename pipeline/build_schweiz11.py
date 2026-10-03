"""Der Pool für das Spiel «Schweiz 1:1» (Michael, 2026-10-03): jedes Objekt, das
man auf der Karte suchen kann, mit Ziel, Kanton und Schwierigkeit.

Liest nur, was Taktland schon hat:
- Bahnhöfe: app/public/data/index.json (aus export_app.py), Lage und Ein- und
  Aussteigende pro Werktag (dwv) aus den Fakten
- Tunnel: die Tunnel der SBB (Übersicht aus export_app.uebersicht_daten, Lage
  laut Quelle in data/standort.json, Bereich auf der Linie in data/karte.json)
  und die benannten Tunnel und Galerien anderer Bahnen aus swissTLM3D
  (data/strecken.json tlm_bauwerke, Zeichnung in data/strecken_geometrie.json)
- Brücken: die Brücken der SBB mit Anfang und Ende laut swissTLM3D
  (data/strecken.json bruecken_bereiche) und die benannten Brücken anderer Bahnen
- Kantone: BFS g1 (data/raw/grenzen/g1_kanton.geojson, wie build_kartengrund.py)

Ziel ist der Mittelpunkt: bei Bahnhöfen ihre Lage; bei Tunneln und Brücken die Mitte
zwischen Anfang und Ende entlang der gezeichneten Linie, wo beide bekannt sind, sonst
der Punkt laut Quelle (Tunnel der SBB ohne bekannte Richtung). Der Kanton ergibt sich
aus der Lage des Ziels in den Kantonsflächen, damit jedes Ziel im Spielgebiet liegt,
in dem man den Pin setzen darf.

Schwierigkeit 1 (leicht) bis 3 (schwer) je Art aus einer Zahl der Daten, nach Rang:
Bahnhöfe nach Ein- und Aussteigenden, Tunnel und Brücken nach Länge. Die obersten
20 % sind leicht, die nächsten 30 % mittel, der Rest schwer. Objekte ohne diese
Zahl kommen nicht ins Spiel.

    .venv/bin/python pipeline/build_schweiz11.py   # nach export_app.py
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

from build_seen import vereinfachen  # noqa: E402
from schienennetz import lv95_zu_wgs84  # noqa: E402
import export_app  # noqa: E402

DATA = ROOT / "data"
ZIEL = DATA / "schweiz11.json"
TOLERANZ_KANTON_M = 60
LEICHT, MITTEL = 0.20, 0.50


def kodieren(pts):
    """[Breite, Länge] mal 100000, erster Punkt und Differenzen, wie kartengrund.json"""
    ganz = []
    for la, lo in pts:
        p = (round(la * 1e5), round(lo * 1e5))
        if not ganz or p != ganz[-1]:
            ganz.append(p)
    return {"start": list(ganz[0]), "d": [v for (a0, o0), (a1, o1) in zip(ganz, ganz[1:]) for v in (a1 - a0, o1 - o0)]}


def kantone():
    d = json.loads((DATA / "raw" / "grenzen" / "g1_kanton.geojson").read_text(encoding="utf-8"))
    raus = []
    for f in d["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        ringe = []
        for poly in polys:
            for ring in poly:
                r = vereinfachen([tuple(p[:2]) for p in ring], TOLERANZ_KANTON_M)
                if len(r) >= 4:
                    ringe.append([lv95_zu_wgs84(e, n) for e, n in r])
        raus.append({"kt": f["properties"]["KTKZ"], "flaeche_km2": round(f["properties"]["AREA_HA"] / 100), "ringe": ringe})
    return raus


def innen(la, lo, ringe):
    """gerade-ungerade über alle Ringe: Löcher und Enklaven zählen richtig"""
    drin = False
    for r in ringe:
        j = len(r) - 1
        for i in range(len(r)):
            (ai, oi), (aj, oj) = r[i], r[j]
            if (ai > la) != (aj > la) and lo < (oj - oi) * (la - ai) / (aj - ai) + oi:
                drin = not drin
            j = i
    return drin


def kanton_von(la, lo, kt_liste):
    for k in kt_liste:
        if innen(la, lo, k["ringe"]):
            return k["kt"]
    return None


def linien_lesen():
    """karte.json: je Linie Stücke mit km, Breite, Länge"""
    k = json.loads((DATA / "karte.json").read_text(encoding="utf-8"))
    raus = {}
    for nr, stuecke in k["linien"].items():
        liste = []
        for s in stuecke:
            m, la, lo = s["start"]
            pts = [(m / 1000, la / 1e5, lo / 1e5)]
            dd = s["d"]
            for i in range(0, len(dd), 3):
                m += dd[i]; la += dd[i + 1]; lo += dd[i + 2]
                pts.append((m / 1000, la / 1e5, lo / 1e5))
            liste.append(pts)
        raus[int(nr)] = liste
    return raus, k["tunnel"]


def punkt_bei(stuecke, km):
    """Lage bei km auf der Linie, zwischen den Punkten linear; None ausserhalb"""
    for pts in stuecke:
        for (k0, a0, o0), (k1, a1, o1) in zip(pts, pts[1:]):
            if min(k0, k1) <= km <= max(k0, k1) and k0 != k1:
                t = (km - k0) / (k1 - k0)
                return (a0 + t * (a1 - a0), o0 + t * (o1 - o0))
    return None


def abstand(a, b):
    la = math.radians((a[0] + b[0]) / 2)
    return math.hypot((b[0] - a[0]) * 111_200, (b[1] - a[1]) * 111_200 * math.cos(la))


def mitte_zug(pts):
    """Punkt auf halber Länge einer Linie und ihre Länge"""
    laengen = [abstand(p, q) for p, q in zip(pts, pts[1:])]
    total = sum(laengen)
    halb, s = total / 2, 0.0
    for (p, q), l in zip(zip(pts, pts[1:]), laengen):
        if s + l >= halb and l > 0:
            t = (halb - s) / l
            return (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])), total
        s += l
    return pts[len(pts) // 2], total


def entpacken(z):
    la, lo = z["start"]
    pts = [(la / 1e5, lo / 1e5)]
    d = z["d"]
    for i in range(0, len(d), 2):
        la += d[i]; lo += d[i + 1]
        pts.append((la / 1e5, lo / 1e5))
    return pts


def stufen(objekte, wert):
    """Rang je Art nach wert, absteigend: 1 leicht, 2 mittel, 3 schwer"""
    liste = sorted(objekte, key=wert, reverse=True)
    n = len(liste)
    for i, o in enumerate(liste):
        o["s"] = 1 if i < n * LEICHT else 2 if i < n * MITTEL else 3


def main():
    kt = kantone()
    index = json.loads((ROOT / "app" / "public" / "data" / "index.json").read_text(encoding="utf-8"))
    ueb = export_app.uebersicht_daten()
    standort = json.loads((DATA / "standort.json").read_text(encoding="utf-8"))
    netz = json.loads((DATA / "strecken.json").read_text(encoding="utf-8"))
    geo = json.loads((DATA / "strecken_geometrie.json").read_text(encoding="utf-8"))
    linien, tunnel_bereich = linien_lesen()
    uebersprungen = {}

    def weg(grund):
        uebersprungen[grund] = uebersprungen.get(grund, 0) + 1

    # Bahnhöfe: Lage und Ein- und Aussteigende
    bahnhoefe = []
    for b in index["bahnhoefe"]:
        if b.get("lat") is None or b.get("lon") is None:
            weg("bahnhof ohne Lage"); continue
        if not b.get("dwv"):
            weg("bahnhof ohne Ein- und Aussteigende"); continue
        k = kanton_von(b["lat"], b["lon"], kt)
        if not k:
            weg("bahnhof ausserhalb der Kantone"); continue
        bahnhoefe.append({"t": "b", "id": str(b["uic"]), "name": b["name"], "la": b["lat"], "lo": b["lon"],
                          "kt": k, "_w": b["dwv"]})
    stufen(bahnhoefe, lambda o: o["_w"])

    # Tunnel der SBB: Mitte zwischen Anfang und Ende auf der Linie, sonst Lage laut Quelle
    lage_sbb = {f"{z[0]}:{z[1]}": (z[3], z[4]) for z in standort["tunnel"] if z[3] is not None}
    zaehler = {}
    tunnel = []
    for e in ueb["tunnel"]["eintraege"]:
        i = zaehler.get(e["linie"], 0); zaehler[e["linie"]] = i + 1
        kid = f"{e['linie']}:{i}"
        if not e.get("name") or not e.get("laenge_m"):
            weg("tunnel ohne Name oder Länge"); continue
        bereich = tunnel_bereich.get(kid)
        ziel, g = None, None
        if bereich and bereich[0] != bereich[1]:
            ziel = punkt_bei(linien.get(e["linie"], []), (bereich[0] + bereich[1]) / 2)
            if ziel:
                g = [e["linie"], min(bereich), max(bereich)]
        ziel = ziel or lage_sbb.get(kid)
        if not ziel:
            weg("tunnel ohne Lage"); continue
        k = kanton_von(ziel[0], ziel[1], kt)
        if not k:
            weg("tunnel ausserhalb der Kantone"); continue
        o = {"t": "t", "id": kid, "name": e["name"], "la": round(ziel[0], 5), "lo": round(ziel[1], 5), "kt": k,
             "_w": e["laenge_m"], "m": e["laenge_m"], "linie": e["linie"], "jahr": e.get("inbetriebnahme_jahr")}
        if g:
            o["g"] = g
        tunnel.append(o)

    # Bauwerke anderer Bahnen aus swissTLM3D, nur mit Namen: Mitte und Länge der Zeichnung
    bruecken = []
    for tid, b in (netz.get("tlm_bauwerke") or {}).items():
        if not b.get("name"):
            continue
        z = geo["bauwerke"].get(tid)
        if not z:
            weg("tlm ohne Zeichnung"); continue
        pts = entpacken(z)
        ziel, laenge = mitte_zug(pts)
        k = kanton_von(ziel[0], ziel[1], kt)
        if not k:
            weg("tlm ausserhalb der Kantone"); continue
        o = {"t": "t" if b["art"] in ("tunnel", "galerie") else "r", "id": f"tlm:{tid}", "name": b["name"],
             "la": round(ziel[0], 5), "lo": round(ziel[1], 5), "kt": k, "_w": laenge, "zm": round(laenge),
             "art": b["art"], "z": {"start": z["start"], "d": z["d"]}}
        (tunnel if o["t"] == "t" else bruecken).append(o)

    # Brücken der SBB mit Anfang und Ende laut swissTLM3D
    zaehler = {}
    for e in ueb["bruecken"]["eintraege"]:
        i = zaehler.get(e["linie"], 0); zaehler[e["linie"]] = i + 1
        kid = f"{e['linie']}:{i}"
        bb = (netz.get("bruecken_bereiche") or {}).get(kid)
        if not bb:
            continue
        if not e.get("name"):
            weg("brücke ohne Name"); continue
        ziel = punkt_bei(linien.get(e["linie"], []), (bb[0] + bb[1]) / 2)
        if not ziel:
            weg("brücke ohne Lage auf der Linie"); continue
        k = kanton_von(ziel[0], ziel[1], kt)
        if not k:
            weg("brücke ausserhalb der Kantone"); continue
        bruecken.append({"t": "r", "id": kid, "name": e["name"], "la": round(ziel[0], 5), "lo": round(ziel[1], 5),
                         "kt": k, "_w": bb[2], "zm": bb[2], "be": e.get("baueinheiten"), "linie": e["linie"],
                         "g": [e["linie"], min(bb[0], bb[1]), max(bb[0], bb[1])]})

    stufen(tunnel, lambda o: o["_w"])
    stufen(bruecken, lambda o: o["_w"])
    objekte = [{k: v for k, v in o.items() if not k.startswith("_")} for o in bahnhoefe + tunnel + bruecken]

    raus = {
        "hinweis": "Pool für «Schweiz 1:1», gebaut mit pipeline/build_schweiz11.py. Ziel la/lo: Bahnhof laut "
                   "Fakten, Tunnel und Brücken in der Mitte zwischen Anfang und Ende entlang der Linie (g: "
                   "Linie, km von, km bis in karte.json; z: Zeichnung aus swissTLM3D), sonst Lage laut Quelle. "
                   "kt: Kanton, in dessen Fläche das Ziel liegt (BFS g1). s: 1 leicht, 2 mittel, 3 schwer, nach "
                   "Rang je Art (Bahnhöfe nach Ein- und Aussteigenden, Tunnel und Brücken nach Länge).",
        "kantone": [{"kt": k["kt"], "flaeche_km2": k["flaeche_km2"], "ringe": [kodieren(r) for r in k["ringe"]]}
                    for k in kt],
        "objekte": objekte,
    }
    ZIEL.write_text(json.dumps(raus, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    zahl = lambda t, s=None: sum(1 for o in objekte if o["t"] == t and (s is None or o["s"] == s))  # noqa: E731
    print(f"schweiz11.json: {ZIEL.stat().st_size / 1024:.0f} KB; Bahnhöfe {zahl('b')}, Tunnel {zahl('t')}, "
          f"Brücken {zahl('r')}; leicht/mittel/schwer Bahnhöfe {zahl('b', 1)}/{zahl('b', 2)}/{zahl('b', 3)}")
    for g, n in sorted(uebersprungen.items()):
        print(f"  übersprungen: {g}: {n}")


if __name__ == "__main__":
    main()
