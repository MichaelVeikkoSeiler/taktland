"""3D-Relief einer Strecke (Michael, 2026-10-06: «Gotthard Bergstrecke»).

Für einen Ausschnitt einer Linie: der Ausschnitt im Raster der Geländekacheln
(build_gelaende.py, swissALTIRegio auf 50 m; die App setzt das Gelände daraus zusammen), dazu der Verlauf der Linie aus der Kilometrierung der SBB
(data/strecken_geometrie.json), Tunnel und Brücken mit Anfang und Ende, wo bekannt
(data/tunnel_richtung.json, data/bruecken_bereich.json), die Bahnhöfe der Linie
(data/linien/{nr}.json) und die Gipfel im Ausschnitt (data/sehenswert.json).

Nichts wird dazu erfunden: Wo die Daten Anfang und Ende eines Tunnels nicht hergeben,
steht er als Punkt mit «Ende unbekannt». Die Höhe der Gleise steht in keiner Quelle; die
App legt die Linie aufs Gelände und schreibt das dazu.

Ergebnis: data/relief/index.json (die Bergstrecken mit Ausschnitt in LV95 und Probefahrt) und
data/relief/{name}.json (Ausschnitt, Linie, Bauwerke, Bahnhöfe, Gipfel; keine Höhen). Bis
2026-10-06 stand das Gelände je Relief in {name}.bin, jetzt kommt es aus den Kacheln. Lage in
LV95 (Ost, Nord) in Metern.

    .venv/bin/python pipeline/build_relief.py
"""

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "relief"
ALTI_URL = ("/vsicurl/https://data.geo.admin.ch/ch.swisstopo.swissaltiregio/swissaltiregio/"
            "swissaltiregio_2056_5728.tif")

RELIEFS = {
    # Erstfeld (km 41.58) bis Biasca (km 131.80) laut data/linien/600.json
    "gotthard": {"titel": "Gotthard-Bergstrecke", "linie": "600", "von_km": 41.0, "bis_km": 132.4,
                 "rand_m": 2500, "raster_m": 50, "probefahrt": ("Erstfeld", "Biasca", "Airolo")},
    # Linien anderer Bahnen aus dem Schienennetz des BAV (Michael, 2026-10-06: «Albula und Lötschberg»);
    # Tunnel und Brücken dort aus swissTLM3D, ohne Namen
    # Thusis (km 41.26) bis St. Moritz (km 102.94) laut data/linien/940.json
    "albula": {"titel": "Albulalinie", "linie": "940", "quelle": "schienennetz", "von_km": 40.8, "bis_km": 103.0,
               "rand_m": 2500, "raster_m": 50, "probefahrt": ("Thusis", "St. Moritz")},
    # Frutigen (km 13.54) bis Brig-Lötschberg (km 73.52) laut data/linien/300.json
    "loetschberg": {"titel": "Lötschberg-Bergstrecke", "linie": "300", "quelle": "schienennetz", "von_km": 13.0,
                    "bis_km": 73.6, "rand_m": 2500, "raster_m": 50, "probefahrt": ("Frutigen", "Brig", "Kandersteg")},
    # Michael, 2026-10-06: «Brig–Zermatt, Brünig, Furka-Oberalp, Berninalinie»; Kilometer laut Schienennetz
    # Brig Bahnhofplatz (km 0) bis Zermatt (km 43.98)
    "zermatt": {"titel": "Brig–Zermatt", "linie": "140", "quelle": "schienennetz", "von_km": 0.0, "bis_km": 44.0,
                "rand_m": 2500, "raster_m": 50, "probefahrt": ("Brig", "Zermatt")},
    # Luzern Brünig (km 0.13) bis Meiringen (km 45.47)
    "bruenig": {"titel": "Brüniglinie", "linie": "470", "quelle": "schienennetz", "von_km": 0.0, "bis_km": 45.5,
                "rand_m": 2500, "raster_m": 50, "probefahrt": ("Luzern", "Meiringen")},
    # Brig Bahnhofplatz (km 0) bis Disentis/Mustér (km 96.94)
    "furka": {"titel": "Furka-Oberalp", "linie": "610", "quelle": "schienennetz", "von_km": 0.0,
                      "bis_km": 97.0, "rand_m": 2500, "raster_m": 50, "probefahrt": ("Brig", "Disentis/Mustér")},
    # St. Moritz (km 0) bis Campocologno (km 57.65); Tirano liegt in Italien und nicht im Netz der Seite «Strecke»
    "bernina": {"titel": "Berninalinie", "linie": "950", "quelle": "schienennetz", "von_km": 0.0, "bis_km": 57.7,
                "rand_m": 2500, "raster_m": 50, "probefahrt": ("St. Moritz", "Campocologno")},
    # Michael, 2026-10-06: «Chur–Arosa, Montreux–Zweisimmen und Engelberg»; Kilometer laut Schienennetz
    # Chur Arosabahn (km 0) bis Arosa (km 25.68)
    "arosa": {"titel": "Chur–Arosa", "linie": "930", "quelle": "schienennetz", "von_km": 0.0, "bis_km": 25.7,
              "rand_m": 2500, "raster_m": 50, "probefahrt": ("Chur", "Arosa")},
    # Montreux MOB (km 0.07) bis Zweisimmen (km 62.43)
    "goldenpass": {"titel": "Montreux–Zweisimmen", "linie": "120", "quelle": "schienennetz", "von_km": 0.0,
                   "bis_km": 62.5, "rand_m": 2500, "raster_m": 50, "probefahrt": ("Montreux", "Zweisimmen")},
    # Hergiswil NW (km 0) bis Engelberg (km 24.74)
    "engelberg": {"titel": "Hergiswil–Engelberg", "linie": "480", "quelle": "schienennetz", "von_km": 0.0,
                  "bis_km": 24.8, "rand_m": 2500, "raster_m": 50, "probefahrt": ("Hergiswil NW", "Engelberg")},
    # Michael, 2026-10-06: «Solothurn bis Yverdon», dann «Lausanne bis Solothurn» (ersetzt die kürzere):
    # vier Linien der SBB hintereinander, Kilometer laut strecken_geometrie.json: 150 von Lausanne (km 0) bis
    # Renens VD Ouest (km 5.2), 200 bis Daillens (km 19.2), 210 bis Biel/Bienne (km 104.5), 410 zurück bis
    # Solothurn (km 73.82; ihre Geometrie endet bei km 99.3, der Bahnhof Biel kommt aus 210).
    # Der Name «jurafuss» bleibt, damit die Adresse #/fahrt/3d/jurafuss weiter gilt
    "jurafuss": {"titel": "Lausanne–Solothurn", "teile": [{"linie": "150", "von_km": 0.0, "bis_km": 5.2},
                                                          {"linie": "200", "von_km": 5.2, "bis_km": 19.2},
                                                          {"linie": "210", "von_km": 19.2, "bis_km": 104.5},
                                                          {"linie": "410", "von_km": 99.3, "bis_km": 73.5}],
                 "rand_m": 2500, "raster_m": 50, "probefahrt": ("Lausanne", "Solothurn"),
                 # keine Bergstrecke (Michael, 2026-10-08): nicht in der Liste «Bergstrecken», die Seite bleibt über
                 # die Linien 200, 210 und 410 erreichbar
                 "bergstrecke": False},
}

# «probefahrt»: Von, Nach und wenn nötig Über für die Probefahrt im Reiter «3D» (Michael, 2026-10-06:
# «diese Strecken wären doch attraktiv, um sie Probe zu fahren»); Über hält die Fahrt auf der Bergstrecke
# statt im Basistunnel. Die Namen müssen im Netz der Seite «Strecke» stehen (data/strecken.json).


def bahnhof_im_netz(name):
    n = json.loads((ROOT / "data" / "strecken.json").read_text(encoding="utf-8"))
    for uic, abk in n["bahnhoefe"].items():
        if n["punkte"].get(abk) == name:
            return int(uic)
    raise SystemExit(f"{name} steht nicht im Netz (data/strecken.json)")


#: so weit dürfen beide Enden eines Bauwerks aus swissTLM3D neben der Linie liegen
TLM_ABSTAND_M = 40


def wgs84_zu_lv95(lat, lon):
    """Näherungsformel von swisstopo, auf etwa einen Meter genau"""
    p = (lat * 3600 - 169028.66) / 10000
    l = (lon * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = (1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p
         - 194.56 * l * l * p + 119.79 * p ** 3)
    return e, n


def linie_punkte(nr):
    """[(Meter der Kilometrierung, Ost, Nord)] aus der platzsparenden Geometrie"""
    g = json.loads((ROOT / "data" / "strecken_geometrie.json").read_text(encoding="utf-8"))["linien"][nr]
    m, la, lo = g["start"]
    raus = [(m, *wgs84_zu_lv95(la / 1e5, lo / 1e5))]
    d = g["d"]
    for i in range(0, len(d), 3):
        m, la, lo = m + d[i], la + d[i + 1], lo + d[i + 2]
        raus.append((m, *wgs84_zu_lv95(la / 1e5, lo / 1e5)))
    return raus


def linie_punkte_bav(nr):
    """[(Meter der Kilometrierung, Ost, Nord)] aus den Segmenten des Schienennetzes, jedes
    Segment von seinem Anfangs- zum End-Kilometer, die Punkte dazwischen nach ihrem Abstand"""
    import schienennetz
    linien, _ = schienennetz.je_linie()
    l = linien[nr]
    lage = {p["nummer"]: (p["lat"], p["lon"]) for p in l["punkte"]}
    raus = []
    for seg in sorted(l["segmente"], key=lambda x: x["km_anfang"]):
        zug = [wgs84_zu_lv95(la, lo) for la, lo in seg["zug"]]
        anfang = lage.get(seg["von_nummer"])
        if anfang:
            a = wgs84_zu_lv95(*anfang)
            if np.hypot(zug[-1][0] - a[0], zug[-1][1] - a[1]) < np.hypot(zug[0][0] - a[0], zug[0][1] - a[1]):
                zug.reverse()
        laengen = np.concatenate([[0], np.cumsum(np.hypot(np.diff([z[0] for z in zug]), np.diff([z[1] for z in zug])))])
        gesamt = laengen[-1] or 1
        m0, m1 = seg["km_anfang"] * 1000, seg["km_ende"] * 1000
        for (x, y), d in zip(zug, laengen):
            m = m0 + (m1 - m0) * d / gesamt
            if not raus or m > raus[-1][0]:
                raus.append((m, x, y))
    return raus


def tlm_auf_linie(weg):
    """Tunnel, Galerien und Brücken aus swissTLM3D, deren beide Enden höchstens TLM_ABSTAND_M
    neben dem Weg liegen, als Bereich auf dem Weg (Meter)"""
    d = json.loads((ROOT / "data" / "tlm_bauwerke.json").read_text(encoding="utf-8"))["bauwerke"]
    w = np.array([[p[1], p[2]] for p in weg]); mm = np.array([p[0] for p in weg])

    def projektion(x, y):
        a, b = w[:-1], w[1:]
        ab = b - a
        t = np.clip(((x - a[:, 0]) * ab[:, 0] + (y - a[:, 1]) * ab[:, 1]) / np.maximum((ab ** 2).sum(1), 1e-9), 0, 1)
        px, py = a[:, 0] + t * ab[:, 0], a[:, 1] + t * ab[:, 1]
        dist = np.hypot(px - x, py - y)
        i = int(np.argmin(dist))
        return dist[i], mm[i] + t[i] * (mm[i + 1] - mm[i])

    e0, n0, e1, n1 = w[:, 0].min() - 500, w[:, 1].min() - 500, w[:, 0].max() + 500, w[:, 1].max() + 500
    raus = []
    for b in d.values():
        if b["art"] not in ("tunnel", "galerie", "bruecke"):
            continue
        la, lo = b["start"]
        pts = [(la, lo)]
        for i in range(0, len(b["d"]), 2):
            la, lo = la + b["d"][i], lo + b["d"][i + 1]
            pts.append((la, lo))
        (xa, ya), (xb, yb) = wgs84_zu_lv95(pts[0][0] / 1e5, pts[0][1] / 1e5), wgs84_zu_lv95(pts[-1][0] / 1e5, pts[-1][1] / 1e5)
        if not (e0 <= xa <= e1 and n0 <= ya <= n1):
            continue
        (da, ma), (db, mb) = projektion(xa, ya), projektion(xb, yb)
        if da <= TLM_ABSTAND_M and db <= TLM_ABSTAND_M and abs(mb - ma) >= 1:
            raus.append({"art": b["art"], "von": min(ma, mb), "bis": max(ma, mb)})
    return raus


def bei(punkte, km):
    """Ost, Nord beim Kilometer, zwischen den Punkten linear; None ausserhalb"""
    m = km * 1000
    if m < punkte[0][0] or m > punkte[-1][0]:
        return None
    for (m0, e0, n0), (m1, e1, n1) in zip(punkte, punkte[1:]):
        if m0 <= m <= m1:
            t = (m - m0) / ((m1 - m0) or 1)
            return e0 + t * (e1 - e0), n0 + t * (n1 - n0)
    return None


def gelaende(rahmen, raster_m):
    """Mittlere Höhe je raster_m-Feld im Rahmen (Ost min, Nord min, Ost max, Nord max)"""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    with rasterio.open(ALTI_URL) as ds:
        fenster = from_bounds(*rahmen, transform=ds.transform)
        breite = int(round((rahmen[2] - rahmen[0]) / raster_m))
        hoehe = int(round((rahmen[3] - rahmen[1]) / raster_m))
        h = ds.read(1, window=fenster, out_shape=(hoehe, breite), resampling=Resampling.average)
    if np.any(h > 10_000) or np.any(h < -100):
        raise SystemExit("Lücke im Höhenmodell im Ausschnitt; Ausschnitt anpassen")
    return h


def stueck(nr, bav, von_km, bis_km):
    """Linie, Tunnel, Brücken und Bahnhöfe einer Linie zwischen zwei Kilometern, in deren Kilometrierung"""
    punkte = linie_punkte_bav(nr) if bav else linie_punkte(nr)
    lo, hi = min(von_km, bis_km), max(von_km, bis_km)
    weg = [p for p in punkte if lo * 1000 <= p[0] <= hi * 1000]
    linie = json.loads((ROOT / "data" / "linien" / f"{nr}.json").read_text(encoding="utf-8"))
    richtung = json.loads((ROOT / "data" / "tunnel_richtung.json").read_text(encoding="utf-8"))["tunnel"]
    bereich = json.loads((ROOT / "data" / "bruecken_bereich.json").read_text(encoding="utf-8"))["bruecken"]
    drin = lambda km: km is not None and lo <= km <= hi

    tunnel, bruecken = [], []
    if bav:
        for b in tlm_auf_linie(weg):
            eintrag = {"name": None, "laenge_m": None, "km": round((b["von"] + b["bis"]) / 2000, 3),
                       "von_km": round(b["von"] / 1000, 3), "bis_km": round(b["bis"] / 1000, 3)}
            if b["art"] == "bruecke":
                bruecken.append({**eintrag, "laenge_m": None})
            else:
                tunnel.append({**eintrag, "galerie": b["art"] == "galerie"})
    for i, t in enumerate(linie.get("tunnel", {}).get("items", [])):
        if not drin(t.get("km")):
            continue
        rt = richtung.get(f"{nr}:{i}")
        tunnel.append({"name": t["name"], "laenge_m": t.get("laenge_m"), "km": t["km"],
                       **({"von_km": rt["von"], "bis_km": rt["bis"]} if rt else {})})
    for i, b in enumerate(linie.get("bruecken", {}).get("items", [])):
        bb = bereich.get(f"{nr}:{i}")
        # nur Brücken mit Anfang und Ende: ein Punkt allein sagt im Relief nichts
        if bb and drin(b.get("km")):
            bruecken.append({"name": b["name"], "von_km": bb["von"], "bis_km": bb["bis"], "laenge_m": bb["laenge_m"]})
    bahnhoefe = [{"uic": b["uic"], "name": b["name"], "km": b["km"]}
                 for b in linie["bahnhoefe"]["items"] if drin(b.get("km"))]
    for b in list(bahnhoefe):
        lage = bei(punkte, b["km"])
        # liegt ein Bahnhof knapp vor dem Ende der Geometrie (Lausanne bei km 0, die Linie 150 beginnt bei
        # km 0.1), steht er am Ende; weiter weg bleibt er weg, statt geraten zu werden
        if lage is None:
            ende = min((punkte[0], punkte[-1]), key=lambda p: abs(p[0] - b["km"] * 1000))
            if abs(ende[0] - b["km"] * 1000) <= 200:
                lage = (ende[1], ende[2])
        if lage is None:
            bahnhoefe.remove(b)
            continue
        b["lage"] = [round(x) for x in lage]
    return weg, tunnel, bruecken, bahnhoefe, linie


def zusammensetzen(teile):
    """Mehrere Linienstücke hintereinander (Michael, 2026-10-06: «Solothurn bis Yverdon» über die
    Linien 410 und 210). Der Weg zählt dann Meter ab dem Anfang des ersten Stücks, nicht mehr die
    Kilometrierung einer Linie; Tunnel, Brücken und Bahnhöfe werden darauf umgerechnet."""
    weg, tunnel, bruecken, bahnhoefe, linien = [], [], [], [], []
    versatz = 0.0
    for t in teile:
        w, tu, br, bh, linie = stueck(t["linie"], t.get("quelle") == "schienennetz", t["von_km"], t["bis_km"])
        a, z = t["von_km"], t["bis_km"]
        auf = lambda km, a=a, v=versatz: v / 1000 + abs(km - a)
        for m, x, y in sorted(w, key=lambda p: p[0], reverse=z < a):
            mm = versatz + abs(m - a * 1000)
            if not weg or mm > weg[-1][0]:
                weg.append((mm, x, y))
        for x in tu + br:
            x["km"] = round(auf(x["km"]), 3) if "km" in x else None
            if "von_km" in x:
                x["von_km"], x["bis_km"] = sorted((round(auf(x["von_km"]), 3), round(auf(x["bis_km"]), 3)))
        tunnel += tu
        bruecken += br
        for b in sorted(bh, key=lambda b: b["km"], reverse=z < a):
            if all(b["uic"] != c["uic"] for c in bahnhoefe):
                bahnhoefe.append({**b, "km": round(auf(b["km"]), 3)})
        linien.append({"linie": t["linie"], "linie_name": linie["name"], "von_km": a, "bis_km": z,
                       "datenstand": linie["datenstand"]})
        versatz += abs(z - a) * 1000
    return weg, tunnel, bruecken, bahnhoefe, linien


def bauen(name, r):
    teile = r.get("teile")
    if teile:
        weg, tunnel, bruecken, bahnhoefe, linien = zusammensetzen(teile)
        nr, bav = teile[0]["linie"], all(t.get("quelle") == "schienennetz" for t in teile)
        linie = {"name": " / ".join(x["linie_name"] for x in linien), "datenstand": min(x["datenstand"] for x in linien)}
        von_km, bis_km = 0.0, round(weg[-1][0] / 1000, 3)
    else:
        nr = r["linie"]
        bav = r.get("quelle") == "schienennetz"
        weg, tunnel, bruecken, bahnhoefe, linie = stueck(nr, bav, r["von_km"], r["bis_km"])
        von_km, bis_km = r["von_km"], r["bis_km"]
    e = [p[1] for p in weg]
    n = [p[2] for p in weg]
    rm = r["raster_m"]
    rahmen = (int((min(e) - r["rand_m"]) // rm * rm), int((min(n) - r["rand_m"]) // rm * rm),
              int(-(-(max(e) + r["rand_m"]) // rm) * rm), int(-(-(max(n) + r["rand_m"]) // rm) * rm))
    # das Gelände kommt aus den Kacheln (build_gelaende.py, Michael, 2026-10-06: «Bergstrecken auch auf
    # die Kacheln umstellen»); hier steht nur der Ausschnitt, auf deren 50-m-Raster ausgerichtet
    assert rm == 50, "die Geländekacheln haben 50 m"
    breite, hoehe = (rahmen[2] - rahmen[0]) // rm, (rahmen[3] - rahmen[1]) // rm
    print(f"{name}: Ausschnitt {breite} × {hoehe} Felder zu {rm} m")

    sehenswert = json.loads((ROOT / "data" / "sehenswert.json").read_text(encoding="utf-8"))
    gipfel = []
    for g in sehenswert["gipfel"]:
        ge, gn = wgs84_zu_lv95(*g["lage"])
        if rahmen[0] <= ge <= rahmen[2] and rahmen[1] <= gn <= rahmen[3]:
            gipfel.append({"name": g["name"], "hoehe_m": g["hoehe_m"], "lage": [round(ge), round(gn)]})

    ZIEL.mkdir(parents=True, exist_ok=True)
    daten = {
        "titel": r["titel"], "linie": nr, "linie_name": linie["name"], "von_km": von_km, "bis_km": bis_km,
        **({"teile": [{k: x[k] for k in ("linie", "linie_name", "von_km", "bis_km")} for x in linien]} if teile else {}),
        "datenstand": linie["datenstand"],
        "quellen": ["Gelände: swissALTIRegio, Bundesamt für Landestopografie swisstopo, gemittelt auf "
                    f"{rm} m (Geländekacheln)"] + (["Linie und Bahnhöfe: Schienennetz, Bundesamt für Verkehr BAV (Stand 2021)",
                                   "Tunnel, Galerien und Brücken: swissTLM3D, swisstopo"] if bav else
                                  ["Linie, Bahnhöfe, Tunnel und Brücken: SBB Open Data (linienkilometrierung, "
                                   "linie-mit-betriebspunkten, tunnel, brucken)", "Anfang und Ende von Tunneln und "
                                   "Brücken: swissTLM3D, swisstopo"]) + ["Gipfel: Swiss Map Vector 1000, swisstopo"],
        **({"hinweis": "Tunnel, Galerien und Brücken stammen aus swissTLM3D und haben dort keinen Namen. "
                       f"Gezeichnet sind die, deren beide Enden höchstens {TLM_ABSTAND_M} m neben der Linie liegen."}
           if bav else {}),
        "raster": {"ost": rahmen[0], "nord": rahmen[3], "m": rm, "breite": int(breite), "hoehe": int(hoehe)},
        "weg": [[round(m), round(x), round(y)] for m, x, y in weg],
        "bahnhoefe": bahnhoefe, "tunnel": tunnel, "bruecken": bruecken, "gipfel": gipfel,
    }
    (ZIEL / f"{name}.json").write_text(json.dumps(daten, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ohne = sum(1 for t in tunnel if "von_km" not in t)
    print(f"{name}: {len(weg)} Wegpunkte, {len(bahnhoefe)} Bahnhöfe, {len(tunnel)} Tunnel ({ohne} ohne bekanntes Ende), "
          f"{len(bruecken)} Brücken mit Anfang und Ende, {len(gipfel)} Gipfel")
    von, nach, *ueber = r["probefahrt"]
    probefahrt = {"von": bahnhof_im_netz(von), "nach": bahnhof_im_netz(nach),
                  "ueber": bahnhof_im_netz(ueber[0]) if ueber else None}
    return {"name": name, "titel": r["titel"], "linie": nr,
            "linien": [t["linie"] for t in teile] if teile else [nr],
            "rahmen": list(rahmen), "probefahrt": probefahrt, "bergstrecke": r.get("bergstrecke", True)}


if __name__ == "__main__":
    # die Übersicht: welches Relief welchen Ausschnitt deckt, für «3D» beim Fahren
    uebersicht = [bauen(name, r) for name, r in RELIEFS.items()]
    (ZIEL / "index.json").write_text(json.dumps({"reliefs": uebersicht}, ensure_ascii=False, indent=1), encoding="utf-8")
