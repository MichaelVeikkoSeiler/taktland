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

Vor dem Beginn des neuesten Laufs kommen die Stunden bis ZURUECK_H zurück aus den früheren Läufen (je Stunde der neueste,
der sie hat; lauf_je_stunde im Index), damit auch die Zeit am Anfang von «Sonne» (heute 12 Uhr) Wolken hat.

Ausgabe nach data/wolken/ (nicht in Git, der Workflow von 3dland.ch baut es alle 3 Stunden):
- index.json   Quelle, Lauf (UTC), Stunden (UTC), Raster (e0, n1, schritt_m, nx, ny), Schichten
- wolken.wgz   gzip: je Stunde je Schicht ny × nx Werte UInt8 in Prozent (255 ohne Angabe), Zeile 0 im Norden
- niederschlag.wgz  gzip: je Stunde TOT_PR (0,1 mm je Stunde) und SNOWLMT (50 m) je ny × nx Werte UInt8 (255 ohne Angabe)

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
#: Niederschlag aus demselben Lauf (Michael, 2026-10-28: «Regen soll aus den Wolken kommen»): TOT_PR, die Rate in kg m⁻² s⁻¹ im Augenblick
#: der Stunde (mal 3600 mm je Stunde), und SNOWLMT, die Schneefallgrenze in m ü. M.
NIEDER = ["TOT_PR", "SNOWLMT"]
#: Niederschlag in Schritten von 0,1 mm je Stunde, mehr als 25,4 mm je Stunde als 25,4; Schneefallgrenze in Schritten von 50 m
NIEDER_MM_SCHRITT, GRENZE_M_SCHRITT = 0.1, 50
#: Raster in LV95, etwas grösser als die Schweiz; Zellen von 2 km (das Modell rechnet mit etwa 1 km)
E0, E1, N0, N1, RASTER_M = 2_470_000, 2_850_000, 1_060_000, 1_310_000, 2000
#: so viele Stunden vor dem neuesten Lauf kommen aus früheren Läufen, soweit die STAC-Sammlung sie noch hat
ZURUECK_H = 24


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
    nieder_je = {v: eintraege(v) for v in NIEDER}
    stunden_je_lauf = defaultdict(set)
    for v, eintr in je.items():
        for (lauf, st) in eintr:
            stunden_je_lauf[lauf].add((v, st))
    # der neueste Lauf, in dem jede Schicht jede Stunde hat, die irgendeine Schicht hat
    laeufe = sorted(stunden_je_lauf, reverse=True)
    lauf = next((l for l in laeufe if len({st for _, st in stunden_je_lauf[l]}) * len(SCHICHTEN) == len(stunden_je_lauf[l])), None)
    if lauf is None:
        sys.exit("Kein vollständiger Lauf von ICON-CH1-EPS gefunden.")
    import datetime as dt
    zeit = lambda l, st: dt.datetime.fromisoformat(l.replace("Z", "+00:00")) + dt.timedelta(hours=st)
    beginn = zeit(lauf, 0)
    # je Zeitpunkt der neueste Lauf, der ihn mit allen Schichten hat: vom neuesten Lauf alles, davor bis ZURUECK_H die früheren
    # Läufe (Michael, 2026-10-28: «Ich sehe keine Wolken»: mit «Sonne» an beginnt die Zeit um 12 Uhr, der neueste Lauf erst später)
    quelle_je_zeit = {}
    for l in laeufe:
        if l > lauf:
            continue
        for st in sorted({st for _, st in stunden_je_lauf[l]}):
            z = zeit(l, st)
            if z in quelle_je_zeit or (l != lauf and not (beginn - dt.timedelta(hours=ZURUECK_H) <= z < beginn)):
                continue
            if all((v, st) in stunden_je_lauf[l] for v, _, _ in SCHICHTEN):
                quelle_je_zeit[z] = (l, st)
    zeiten = sorted(quelle_je_zeit)
    print(f"ICON-CH1-EPS Lauf {lauf}: {len(zeiten)} Stunden ({zeiten[0]:%d.%m. %H} bis {zeiten[-1]:%d.%m. %H} UTC), "
          f"davon {sum(1 for z in zeiten if z < beginn)} aus früheren Läufen")

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

        gitter = np.full((len(zeiten), len(SCHICHTEN), ny * nx), 255, dtype=np.uint8)
        nieder = np.full((len(zeiten), len(NIEDER), ny * nx), 255, dtype=np.uint8)

        def gemittelt(v, eintr, l, st):
            """Mittel je Zelle des Rasters, nur über Modellzellen mit Wert (eccodes meldet fehlende als 9999); None ohne Datei"""
            if (l, st) not in eintr:
                return None
            pfad = Path(tmp) / f"{v}-{st}.grib2"
            pfad.write_bytes(holen(eintr[(l, st)]))
            feld = next(iter(werte(pfad).values()))[0][drin]
            pfad.unlink()
            gut = np.isfinite(feld) & (feld < 9000)
            n = np.bincount(zelle, weights=gut.astype(float), minlength=nx * ny)
            summe = np.bincount(zelle, weights=np.where(gut, feld, 0), minlength=nx * ny)
            return np.divide(summe, n, out=np.full(nx * ny, np.nan), where=n > 0)
        for i, z in enumerate(zeiten):
            l, st = quelle_je_zeit[z]
            for j, (v, _, _) in enumerate(SCHICHTEN):
                pfad = Path(tmp) / f"{v}-{st}.grib2"
                pfad.write_bytes(holen(je[v][(l, st)]))
                feld = next(iter(werte(pfad).values()))[0]
                pfad.unlink()
                summe = np.bincount(zelle, weights=feld[drin], minlength=nx * ny)
                mittel = np.divide(summe, anzahl, out=np.zeros_like(summe), where=anzahl > 0)
                gitter[i, j] = np.where(anzahl > 0, np.clip(np.round(mittel), 0, 100), 255).astype(np.uint8)
            rate = gemittelt("TOT_PR", nieder_je["TOT_PR"], l, st)
            if rate is not None:
                mm = rate * 3600
                nieder[i, 0] = np.where(np.isfinite(mm), np.clip(np.round(mm / NIEDER_MM_SCHRITT), 0, 254), 255).astype(np.uint8)
            grenze = gemittelt("SNOWLMT", nieder_je["SNOWLMT"], l, st)
            if grenze is not None:
                nieder[i, 1] = np.where(np.isfinite(grenze), np.clip(np.round(grenze / GRENZE_M_SCHRITT), 0, 254), 255).astype(np.uint8)
            nass = nieder[i, 0][(nieder[i, 0] < 255)]
            print(f"  {z:%d.%m. %H} UTC (Lauf {l}, Stunde {st}): nass {(nass >= 1).mean() * 100:.0f} %, tief {gitter[i, 0][gitter[i, 0] < 255].mean():.0f} %, "
                  f"mittel {gitter[i, 1][gitter[i, 1] < 255].mean():.0f} %, hoch {gitter[i, 2][gitter[i, 2] < 255].mean():.0f} %")

    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    ZIEL.mkdir(parents=True)
    (ZIEL / "wolken.wgz").write_bytes(gzip.compress(gitter.tobytes(), 9))
    (ZIEL / "niederschlag.wgz").write_bytes(gzip.compress(nieder.tobytes(), 9))
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "ICON-CH1-EPS, Kontrolllauf, MeteoSchweiz (Open Government Data, CC-BY)",
        "lauf": beginn.strftime("%Y-%m-%dT%H:%MZ"),
        "stunden": [z.strftime("%Y-%m-%dT%H:%MZ") for z in zeiten],
        "lauf_je_stunde": [quelle_je_zeit[z][0] for z in zeiten],
        "e0": E0, "n1": N1, "schritt_m": RASTER_M, "nx": int(nx), "ny": int(ny),
        "schichten": [{"name": name, "modell": v, "druck": druck} for v, name, druck in SCHICHTEN],
        "niederschlag": {"datei": "niederschlag.wgz", "felder": [
            {"name": "mm_je_stunde", "modell": "TOT_PR", "schritt": NIEDER_MM_SCHRITT,
             "text": "Niederschlagsrate im Augenblick der Stunde, in Schritten von 0,1 mm je Stunde, 254 heisst 25,4 oder mehr"},
            {"name": "schneefallgrenze_m", "modell": "SNOWLMT", "schritt": GRENZE_M_SCHRITT,
             "text": "Schneefallgrenze in m ü. M., in Schritten von 50 m"}],
            "hinweis": "je Stunde je Feld ny × nx Werte UInt8, 255 ohne Angabe"},
        "hinweis": "Bewölkung je Schicht in Prozent, je Zelle das Mittel der Modellzellen darin; 255 ohne Angabe. "
                   "In welcher Höhe innerhalb der Schicht die Wolken liegen, sagt diese Grösse nicht.",
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"data/wolken: {(ZIEL / 'wolken.wgz').stat().st_size / 1e3:.0f} KB, "
          f"niederschlag.wgz {(ZIEL / 'niederschlag.wgz').stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
