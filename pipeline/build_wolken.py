#!/usr/bin/env python3
"""Wolken für «3D Schweiz» aus dem Wettermodell von MeteoSchweiz (Michael, 2026-10-28: «Jetzt die Wolken angehen»).

ICON-CH1-EPS (MeteoSchweiz, Open Government Data, CC-BY; STAC-Sammlung ch.meteoschweiz.ogd-forecasting-icon-ch1 auf
data.geo.admin.ch, Dateien auf rgw.cscs.ch): der neueste vollständige Lauf, nur der Kontrolllauf (ohne Störungen), je
Stunde der Prognose die Bewölkung in drei Schichten, wie sie das Modell nennt: CLCL «800 hPa – Boden», CLCM «400 – 800 hPa»,
CLCH «0 – 400 hPa», in Prozent. Die Zellen des Modells (etwa 1 km, unstrukturiertes Gitter, Lage aus horizontal_constants)
werden auf ein Raster von RASTER_M in LV95 gemittelt.

Nicht darin, und so in der App benannt: in welcher Höhe innerhalb ihrer Schicht eine Wolke liegt und welche Form sie hat
(die App zeichnet die Schichten auf gewählten Höhen); die Wolkenuntergrenze CEILING des Modells nennt nicht, ob sie über
Meer oder über Boden zählt, darum bleibt sie weg.

Ausgabe nach data/wolken/ (nicht in Git, der Workflow von 3dland.ch baut es alle 3 Stunden):
- index.json   Quelle, Lauf (UTC), Stunden (UTC), Raster (e0, n1, schritt_m, nx, ny), Schichten
- wolken.wgz   gzip: je Stunde je Schicht ny × nx Werte UInt8 in Prozent (255 ohne Angabe), Zeile 0 im Norden

    pip install eccodes numpy; python3 pipeline/build_wolken.py
"""
import gzip
import json
import shutil
import sys
import tempfile
import urllib.request
from collections import defaultdict
from pathlib import Path

import eccodes
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "wolken"
STAC = "https://data.geo.admin.ch/api/stac/v1"
SAMMLUNG = "ch.meteoschweiz.ogd-forecasting-icon-ch1"
SCHICHTEN = [("CLCL", "tief", "800 hPa bis Boden"), ("CLCM", "mittel", "400 bis 800 hPa"), ("CLCH", "hoch", "0 bis 400 hPa")]
#: Raster in LV95, etwas grösser als die Schweiz; Zellen von 2 km (das Modell rechnet mit etwa 1 km)
E0, E1, N0, N1, RASTER_M = 2_470_000, 2_850_000, 1_060_000, 1_310_000, 2000


def holen(url, daten=None):
    anfrage = urllib.request.Request(url, data=json.dumps(daten).encode() if daten else None,
                                     headers={"Content-Type": "application/json"} if daten else {})
    with urllib.request.urlopen(anfrage, timeout=120) as r:
        return r.read()


def eintraege(variable):
    """alle Einträge des Kontrolllaufs einer Grösse: (Lauf, Stunde) → Adresse der Datei"""
    raus, daten = {}, {"collections": [SAMMLUNG], "forecast:variable": variable, "forecast:perturbed": False, "limit": 100}
    url = f"{STAC}/search"
    while url:
        seite = json.loads(holen(url, daten))
        for f in seite["features"]:
            p = f["properties"]
            h = p.get("forecast:horizon")  # P0DT06H00M00S
            if not h:
                continue
            stunde = int(h[1:h.index("D")]) * 24 + int(h[h.index("T") + 1:h.index("H")])
            raus[(p["forecast:reference_datetime"], stunde)] = next(iter(f["assets"].values()))["href"]
        weiter = next((l for l in seite.get("links", []) if l.get("rel") == "next"), None)
        # die nächste Seite: derselbe Filter mit dem Zeiger der Antwort («merge»)
        url, daten = (weiter["href"], {**daten, **weiter.get("body", {})} if weiter.get("merge") else weiter.get("body")) if weiter else (None, None)
    return raus


def werte(pfad):
    raus = {}
    with open(pfad, "rb") as f:
        while (h := eccodes.codes_grib_new_from_file(f)) is not None:
            raus.setdefault(eccodes.codes_get(h, "shortName"), []).append(eccodes.codes_get_values(h))
            eccodes.codes_release(h)
    return raus


def wgs84_zu_lv95(lat, lon):
    """Näherungsformel von swisstopo, auf etwa einen Meter genau (wie pipeline/build_zuege3d.py)"""
    p = (lat * 3600 - 169028.66) / 10000
    l = (lon * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return e, n


def main():
    je = {v: eintraege(v) for v, _, _ in SCHICHTEN}
    stunden_je_lauf = defaultdict(set)
    for v, eintr in je.items():
        for (lauf, st) in eintr:
            stunden_je_lauf[lauf].add((v, st))
    # der neueste Lauf, in dem jede Schicht jede Stunde hat, die irgendeine Schicht hat
    laeufe = sorted(stunden_je_lauf, reverse=True)
    lauf = next((l for l in laeufe if len({st for _, st in stunden_je_lauf[l]}) * len(SCHICHTEN) == len(stunden_je_lauf[l])), None)
    if lauf is None:
        sys.exit("Kein vollständiger Lauf von ICON-CH1-EPS gefunden.")
    stunden = sorted({st for _, st in stunden_je_lauf[lauf]})
    print(f"ICON-CH1-EPS Lauf {lauf}: {len(stunden)} Stunden ({stunden[0]} bis {stunden[-1]})")

    konst = json.loads(holen(f"{STAC}/collections/{SAMMLUNG}/assets"))["assets"]
    hc_url = next(a["href"] for a in konst if a["id"].startswith("horizontal_constants"))
    with tempfile.TemporaryDirectory() as tmp:
        hc = Path(tmp) / "hc.grib2"
        hc.write_bytes(holen(hc_url))
        k = werte(hc)
        e, n = wgs84_zu_lv95(k["tlat"][0], k["tlon"][0])
        nx, ny = (E1 - E0) // RASTER_M, (N1 - N0) // RASTER_M
        ix = np.floor((e - E0) / RASTER_M).astype(int)
        iy = np.floor((N1 - n) / RASTER_M).astype(int)
        drin = (ix >= 0) & (ix < nx) & (iy >= 0) & (iy < ny)
        zelle = iy[drin] * nx + ix[drin]
        anzahl = np.bincount(zelle, minlength=nx * ny)
        print(f"Raster {nx} × {ny} zu {RASTER_M} m, {drin.sum()} Zellen des Modells darin")

        gitter = np.full((len(stunden), len(SCHICHTEN), ny * nx), 255, dtype=np.uint8)
        for i, st in enumerate(stunden):
            for j, (v, _, _) in enumerate(SCHICHTEN):
                pfad = Path(tmp) / f"{v}-{st}.grib2"
                pfad.write_bytes(holen(je[v][(lauf, st)]))
                feld = next(iter(werte(pfad).values()))[0]
                pfad.unlink()
                summe = np.bincount(zelle, weights=feld[drin], minlength=nx * ny)
                mittel = np.divide(summe, anzahl, out=np.zeros_like(summe), where=anzahl > 0)
                gitter[i, j] = np.where(anzahl > 0, np.clip(np.round(mittel), 0, 100), 255).astype(np.uint8)
            print(f"  Stunde {st}: tief {gitter[i, 0][gitter[i, 0] < 255].mean():.0f} %, "
                  f"mittel {gitter[i, 1][gitter[i, 1] < 255].mean():.0f} %, hoch {gitter[i, 2][gitter[i, 2] < 255].mean():.0f} %")

    import datetime as dt
    beginn = dt.datetime.fromisoformat(lauf.replace("Z", "+00:00"))
    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    ZIEL.mkdir(parents=True)
    (ZIEL / "wolken.wgz").write_bytes(gzip.compress(gitter.tobytes(), 9))
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "ICON-CH1-EPS, Kontrolllauf, MeteoSchweiz (Open Government Data, CC-BY)",
        "lauf": beginn.strftime("%Y-%m-%dT%H:%MZ"),
        "stunden": [(beginn + dt.timedelta(hours=st)).strftime("%Y-%m-%dT%H:%MZ") for st in stunden],
        "e0": E0, "n1": N1, "schritt_m": RASTER_M, "nx": int(nx), "ny": int(ny),
        "schichten": [{"name": name, "modell": v, "druck": druck} for v, name, druck in SCHICHTEN],
        "hinweis": "Bewölkung je Schicht in Prozent, je Zelle das Mittel der Modellzellen darin; 255 ohne Angabe. "
                   "In welcher Höhe innerhalb der Schicht die Wolken liegen, sagt diese Grösse nicht.",
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"data/wolken: {(ZIEL / 'wolken.wgz').stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
