"""3D-Relief einer Strecke (Michael, 2026-10-06: «Gotthard Bergstrecke»).

Für einen Ausschnitt einer Linie: das Gelände aus swissALTIRegio (swisstopo, 10 m),
gemittelt auf RASTER_M, dazu der Verlauf der Linie aus der Kilometrierung der SBB
(data/strecken_geometrie.json), Tunnel und Brücken mit Anfang und Ende, wo bekannt
(data/tunnel_richtung.json, data/bruecken_bereich.json), die Bahnhöfe der Linie
(data/linien/{nr}.json) und die Gipfel im Ausschnitt (data/sehenswert.json).

Nichts wird dazu erfunden: Wo die Daten Anfang und Ende eines Tunnels nicht hergeben,
steht er als Punkt mit «Ende unbekannt». Die Höhe der Gleise steht in keiner Quelle; die
App legt die Linie aufs Gelände und schreibt das dazu.

Ergebnis: data/relief/index.json (welches Relief welchen Ausschnitt in LV95 deckt),
data/relief/{name}.json (alles ausser den Höhen) und data/relief/{name}.bin
(Höhen in Metern als Uint16, Zeile für Zeile von Norden nach Süden, je Zeile von Westen
nach Osten). Lage in LV95 (Ost, Nord) in Metern.

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
                 "rand_m": 2500, "raster_m": 50},
}


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


def bauen(name, r):
    nr = r["linie"]
    punkte = linie_punkte(nr)
    von, bis = r["von_km"] * 1000, r["bis_km"] * 1000
    weg = [p for p in punkte if von <= p[0] <= bis]
    e = [p[1] for p in weg]
    n = [p[2] for p in weg]
    rm = r["raster_m"]
    rahmen = (int((min(e) - r["rand_m"]) // rm * rm), int((min(n) - r["rand_m"]) // rm * rm),
              int(-(-(max(e) + r["rand_m"]) // rm) * rm), int(-(-(max(n) + r["rand_m"]) // rm) * rm))
    h = gelaende(rahmen, rm)
    print(f"{name}: Gelände {h.shape[1]} × {h.shape[0]} Felder zu {rm} m, "
          f"{np.nanmin(h):.0f} bis {np.nanmax(h):.0f} m ü. M.")

    linie = json.loads((ROOT / "data" / "linien" / f"{nr}.json").read_text(encoding="utf-8"))
    richtung = json.loads((ROOT / "data" / "tunnel_richtung.json").read_text(encoding="utf-8"))["tunnel"]
    bereich = json.loads((ROOT / "data" / "bruecken_bereich.json").read_text(encoding="utf-8"))["bruecken"]
    drin = lambda km: km is not None and r["von_km"] <= km <= r["bis_km"]

    tunnel = []
    for i, t in enumerate(linie["tunnel"]["items"]):
        if not drin(t.get("km")):
            continue
        rt = richtung.get(f"{nr}:{i}")
        tunnel.append({"name": t["name"], "laenge_m": t.get("laenge_m"), "km": t["km"],
                       **({"von_km": rt["von"], "bis_km": rt["bis"]} if rt else {})})
    bruecken = []
    for i, b in enumerate(linie["bruecken"]["items"]):
        bb = bereich.get(f"{nr}:{i}")
        # nur Brücken mit Anfang und Ende: ein Punkt allein sagt im Relief nichts
        if bb and drin(b.get("km")):
            bruecken.append({"name": b["name"], "von_km": bb["von"], "bis_km": bb["bis"], "laenge_m": bb["laenge_m"]})
    bahnhoefe = [{"uic": b["uic"], "name": b["name"], "km": b["km"]}
                 for b in linie["bahnhoefe"]["items"] if drin(b.get("km"))]
    for b in bahnhoefe:
        b["lage"] = [round(x) for x in bei(punkte, b["km"])]

    sehenswert = json.loads((ROOT / "data" / "sehenswert.json").read_text(encoding="utf-8"))
    gipfel = []
    for g in sehenswert["gipfel"]:
        ge, gn = wgs84_zu_lv95(*g["lage"])
        if rahmen[0] <= ge <= rahmen[2] and rahmen[1] <= gn <= rahmen[3]:
            gipfel.append({"name": g["name"], "hoehe_m": g["hoehe_m"], "lage": [round(ge), round(gn)]})

    ZIEL.mkdir(parents=True, exist_ok=True)
    np.clip(np.round(h), 0, 65535).astype("<u2").tofile(ZIEL / f"{name}.bin")
    daten = {
        "titel": r["titel"], "linie": nr, "linie_name": linie["name"], "von_km": r["von_km"], "bis_km": r["bis_km"],
        "datenstand": linie["datenstand"],
        "quellen": ["Gelände: swissALTIRegio, Bundesamt für Landestopografie swisstopo, 10 m, gemittelt auf "
                    f"{rm} m", "Linie, Bahnhöfe, Tunnel und Brücken: SBB Open Data (linienkilometrierung, "
                    "linie-mit-betriebspunkten, tunnel, brucken)", "Anfang und Ende von Tunneln und Brücken: "
                    "swissTLM3D, swisstopo", "Gipfel: Swiss Map Vector 1000, swisstopo"],
        "raster": {"ost": rahmen[0], "nord": rahmen[3], "m": rm, "breite": int(h.shape[1]), "hoehe": int(h.shape[0]),
                   "datei": f"{name}.bin"},
        "weg": [[round(m), round(x), round(y)] for m, x, y in weg],
        "bahnhoefe": bahnhoefe, "tunnel": tunnel, "bruecken": bruecken, "gipfel": gipfel,
    }
    (ZIEL / f"{name}.json").write_text(json.dumps(daten, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ohne = sum(1 for t in tunnel if "von_km" not in t)
    print(f"{name}: {len(weg)} Wegpunkte, {len(bahnhoefe)} Bahnhöfe, {len(tunnel)} Tunnel ({ohne} ohne bekanntes Ende), "
          f"{len(bruecken)} Brücken mit Anfang und Ende, {len(gipfel)} Gipfel")
    return {"name": name, "titel": r["titel"], "linie": nr, "rahmen": list(rahmen)}


if __name__ == "__main__":
    # die Übersicht: welches Relief welchen Ausschnitt deckt, für «3D» beim Fahren
    uebersicht = [bauen(name, r) for name, r in RELIEFS.items()]
    (ZIEL / "index.json").write_text(json.dumps({"reliefs": uebersicht}, ensure_ascii=False, indent=1), encoding="utf-8")
