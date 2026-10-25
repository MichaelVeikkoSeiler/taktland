"""
Seegrund für «3D Schweiz» (Michael, 2026-10-25: «die Seetiefen will ich dann zuerst einmal anschauen»): swissBATHY3D von swisstopo,
das gemessene Höhenmodell des Grunds von 22 Schweizer Seen (je Kilometer ein Raster auf 1 m, Höhen in m ü. M.), hier auf 25 m
gemittelt und in die 10-km-Kacheln des Geländes gelegt (data/gelaende). Dazu je See sein Spiegel: der Median des Geländes
(swissALTIRegio, 50 m) über allen Feldern mit Seegrund, auf den Meter, denn das Gelände zeigt über einem See dessen Oberfläche.

Je Kachel eine .sgz (gzip): Int32 tiefster Grund in dm, dann je Feld (400 × 400, Zeilen von Norden) UInt16 Grund in dm darüber
(65535: kein Seegrund), dann je Feld UInt8 die Nummer des Sees in index.json (255: keiner). Ein Feld von 25 m bekommt einen Grund,
wenn mindestens die Hälfte seiner Meter gemessen ist.

    .venv/bin/python pipeline/build_seegrund.py            # alle Seen (etwa 3 GB laden, je See gleich wieder gelöscht)
    .venv/bin/python pipeline/build_seegrund.py rotsee     # nur einzelne
"""
import gzip
import io
import json
import sys
import urllib.request
import warnings
import zipfile
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "seegrund"
ROH = ROOT / "data" / "raw" / "swissbathy3d"
GELAENDE = ROOT / "data" / "gelaende"
STAC = "https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbathy3d/items?limit=100"
KACHEL_M, RASTER_M = 10_000, 25
ZELLEN = KACHEL_M // RASTER_M
KEIN = 65535
NAMEN = {"aegerisee": "Ägerisee", "baldeggersee": "Baldeggersee", "bielersee": "Bielersee", "bodensee": "Bodensee",
         "brienzersee": "Brienzersee", "hallwilersee": "Hallwilersee", "lacdejoux": "Lac de Joux", "lacleman": "Genfersee",
         "lacneuchatel": "Neuenburgersee", "lagomaggiore": "Lago Maggiore", "lungernsee": "Lungerersee", "murtensee": "Murtensee",
         "rotsee": "Rotsee", "sarnersee": "Sarnersee", "sempachersee": "Sempachersee", "silsersee": "Silsersee",
         "silvaplanersee": "Silvaplanersee", "thunersee": "Thunersee", "vierwaldstaettersee": "Vierwaldstättersee",
         "walensee": "Walensee", "zuerichsee": "Zürichsee", "zugersee": "Zugersee"}


def geladen_gelaende():
    ix = json.loads((GELAENDE / "index.json").read_text())
    z = ix["zellen"]
    vorrat = {}

    def kachel(name):
        if name not in vorrat:
            p = GELAENDE / f"{name}.hgz"
            if not p.exists():
                vorrat[name] = None
            else:
                d = np.frombuffer(gzip.decompress(p.read_bytes()), dtype=np.int16).reshape(z, z).astype(np.int64)
                vorrat[name] = np.cumsum(d, axis=1)
        return vorrat[name]

    def hoehe(e, n):
        k = ix["kachel_m"]
        ex, ny = int(e // k), int(n // k)
        a = kachel(f"{ex}_{ny}")
        if a is None:
            return None
        i = int((e - ex * k) // ix["raster_m"])
        j = int(((ny + 1) * k - n) // ix["raster_m"])
        return float(a[min(z - 1, j), min(z - 1, i)])
    return hoehe


def asc_lesen(roh: bytes):
    kopf, rest = roh.split(b"\n", 6)[:6], roh.split(b"\n", 6)[6]
    k = {z.split()[0].decode().lower(): float(z.split()[1]) for z in kopf}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        a = np.fromstring(rest, dtype=np.float32, sep=" ")
    a = a.reshape(int(k["nrows"]), int(k["ncols"]))
    a[a < -1e30] = np.nan
    return k, a


def main():
    nur = set(sys.argv[1:])
    seen = json.load(urllib.request.urlopen(STAC, timeout=60))["features"]
    ZIEL.mkdir(parents=True, exist_ok=True)
    ROH.mkdir(parents=True, exist_ok=True)
    hoehe = geladen_gelaende()
    # je Kachel: Summe und Zahl der Meter je Feld, und welcher See
    summe, zahl, see = {}, {}, {}
    liste = []
    for nr, f in enumerate(sorted(seen, key=lambda x: x["id"])):
        name = f["id"].removeprefix("swissbathy3d_")
        if nur and name not in nur:
            continue
        href = next(a["href"] for k, a in f["assets"].items() if "esriasciigrid" in k)
        zip_pfad = ROH / href.rsplit("/", 1)[1]
        if not zip_pfad.exists():
            print("lade", name, flush=True)
            urllib.request.urlretrieve(href, zip_pfad)
        nummer = len(liste)
        felder_des_sees = []
        with zipfile.ZipFile(zip_pfad) as z:
            for info in z.infolist():
                if not info.filename.lower().endswith(".asc"):
                    continue
                k, a = asc_lesen(z.read(info))
                cs = k["cellsize"]
                x0, y0 = k["xllcorner"], k["yllcorner"]
                rows, cols = a.shape
                # Meter für Meter in Felder von 25 m (Nord oben): Mitte jeder Zelle
                es = x0 + (np.arange(cols) + 0.5) * cs
                ns = y0 + rows * cs - (np.arange(rows) + 0.5) * cs
                gi = np.floor(es / RASTER_M).astype(np.int64)
                gj = np.floor(ns / RASTER_M).astype(np.int64)
                G_I, G_J = np.meshgrid(gi, gj)
                gut = np.isfinite(a)
                if not gut.any():
                    continue
                schluessel = G_I[gut] * 1_000_000 + G_J[gut]
                werte = a[gut].astype(np.float64)
                einzel, wo = np.unique(schluessel, return_inverse=True)
                s = np.bincount(wo, weights=werte)
                c = np.bincount(wo)
                for kk, ss, cc in zip(einzel, s, c):
                    I, J = int(kk // 1_000_000), int(kk % 1_000_000)
                    ex, ny = I * RASTER_M // KACHEL_M, J * RASTER_M // KACHEL_M
                    t = f"{ex}_{ny}"
                    if t not in summe:
                        summe[t] = np.zeros((ZELLEN, ZELLEN)); zahl[t] = np.zeros((ZELLEN, ZELLEN)); see[t] = np.full((ZELLEN, ZELLEN), 255, np.uint8)
                    i = I - ex * ZELLEN
                    j = (ny + 1) * ZELLEN - 1 - J
                    summe[t][j, i] += ss; zahl[t][j, i] += cc; see[t][j, i] = nummer
                    felder_des_sees.append((I, J))
        # der Spiegel: Median des Geländes über den Feldern mit Seegrund
        hs = [hoehe((I + 0.5) * RASTER_M, (J + 0.5) * RASTER_M) for I, J in set(felder_des_sees)]
        hs = [h for h in hs if h is not None and h > 0]
        spiegel = float(np.median(hs)) if hs else None
        liste.append({"name": name, "titel": NAMEN.get(name, name), "spiegel_m": spiegel})
        print(name, "Spiegel", spiegel, "Felder", len(set(felder_des_sees)), flush=True)
        zip_pfad.unlink()
    kacheln = []
    voll = (RASTER_M * RASTER_M) * 0.5
    for t in sorted(summe):
        gemessen = zahl[t] >= voll
        if not gemessen.any():
            continue
        grund = np.where(gemessen, summe[t] / np.maximum(zahl[t], 1), np.nan)
        unten = int(np.floor(np.nanmin(grund) * 10))
        u = np.where(gemessen, np.clip(np.round(grund * 10) - unten, 0, KEIN - 1), KEIN).astype("<u2")
        s = np.where(gemessen, see[t], 255).astype(np.uint8)
        roh = np.array([unten], "<i4").tobytes() + u.tobytes() + s.tobytes()
        (ZIEL / f"{t}.sgz").write_bytes(gzip.compress(roh, 9))
        kacheln.append(t)
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissBATHY3D, Bundesamt für Landestopografie swisstopo, auf 25 m gemittelt; Seespiegel aus swissALTIRegio (swisstopo)",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "raster_m": RASTER_M, "zellen": ZELLEN,
        "hinweis": "Int32 tiefster Grund in dm, je Feld UInt16 Grund in dm darüber (65535 keiner), je Feld UInt8 Nummer des Sees (255 keiner); "
                   "ein Feld hat Grund, wenn mindestens die Hälfte seiner Meter gemessen ist; der Spiegel ist der Median des Geländes über dem See",
        "seen": liste, "kacheln": kacheln,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(kacheln), "Kacheln nach", ZIEL.relative_to(ROOT))


if __name__ == "__main__":
    main()
