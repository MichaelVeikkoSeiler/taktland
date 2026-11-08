"""Gebäudeklasse aus dem eidgenössischen Gebäude- und Wohnungsregister (GWR, BFS) für die Gebäude in 3D.

Michael, 2026-11-08, Bümpliz: «dieses Gebäude in Bümpliz hat keine Fenster. Es ist ein Industriegebäude», vorher bei der
Raffinerie von Cressier: «brauchen die Silos keine Fenster». swissBUILDINGS3D nennt die Art eines Gebäudes nicht, das GWR
schon: je Gebäude die Gebäudeklasse (GKLAS) und eine Koordinate (GKODE, GKODN, LV95). Ein Gebäude aus swissBUILDINGS3D wird
ohne Fenster gezeichnet, wenn mindestens ein Punkt des GWR in seinem Grundriss (den Dachflächen, von oben gesehen) liegt und
alle Punkte darin eine Klasse aus OHNE_FENSTER haben. Ohne Punkt bleibt es, wie es war (mit gezeichneten Fenstern).

Das ganze Register als CSV von https://public.madd.bfs.admin.ch/ch.zip (Open Government Data des BFS); die Sitzung von Claude
erreicht diesen Server nicht, die Workflows auf GitHub schon. Fehlt die Datei oder lässt sie sich nicht lesen, bleibt alles
wie vorher, mit einem Hinweis im Protokoll.
"""
import csv
import io
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATEI = ROOT / "data" / "raw" / "gwr" / "ch.zip"
URL = "https://public.madd.bfs.admin.ch/ch.zip"
# Gebäudeklassen (GKLAS) des GWR, die ohne Fenster gezeichnet werden (Michael, 2026-11-08: Industriegebäude, Silos)
OHNE_FENSTER = {1251: "Industriegebäude", 1252: "Behälter, Silos und Lagergebäude"}
ZELLE_M = 100


def laden(e_von=None, e_bis=None):
    """die Punkte des GWR (Ost, Nord, Klasse) als Raster je ZELLE_M, nur zwischen e_von und e_bis; None, wenn nicht lesbar"""
    try:
        if not DATEI.exists():
            DATEI.parent.mkdir(parents=True, exist_ok=True)
            print(f"GWR laden: {URL}", flush=True)
            urllib.request.urlretrieve(URL, DATEI)
        with zipfile.ZipFile(DATEI) as z:
            namen = [n for n in z.namelist() if n.lower().endswith((".csv", ".txt"))]
            # die Datei der Gebäude: die mit GKLAS, GKODE und GKODN im Kopf
            for name in sorted(namen, key=lambda n: ("gebaeude" not in n.lower() and "geb" not in n.lower(), n)):
                with z.open(name) as f:
                    text = io.TextIOWrapper(f, encoding="utf-8-sig", newline="")
                    kopf = text.readline()
                    trenn = "\t" if kopf.count("\t") >= kopf.count(";") and kopf.count("\t") >= kopf.count(",") else (";" if ";" in kopf else ",")
                    spalten = [s.strip().upper() for s in kopf.rstrip("\r\n").split(trenn)]
                    if not {"GKLAS", "GKODE", "GKODN"} <= set(spalten):
                        continue
                    ie, in_, ik = spalten.index("GKODE"), spalten.index("GKODN"), spalten.index("GKLAS")
                    raster, zahl = defaultdict(list), 0
                    for zeile in csv.reader(text, delimiter=trenn):
                        try:
                            e, n, k = float(zeile[ie]), float(zeile[in_]), int(float(zeile[ik]))
                        except (ValueError, IndexError):
                            continue
                        if (e_von is not None and e < e_von) or (e_bis is not None and e >= e_bis):
                            continue
                        raster[(int(e // ZELLE_M), int(n // ZELLE_M))].append((e, n, k))
                        zahl += 1
                    print(f"GWR: {zahl} Gebäude mit Koordinate und Klasse aus {name}", flush=True)
                    return raster
        print("GWR: keine Datei mit GKLAS, GKODE und GKODN gefunden, alle Gebäude mit Fenstern", flush=True)
    except Exception as e:  # noqa: BLE001  ohne GWR bleibt alles wie vorher
        print(f"GWR nicht gelesen ({e}), alle Gebäude mit Fenstern", flush=True)
    return None


def _innen(px, py, ring):
    innen, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            innen = not innen
        j = i
    return innen


def ohne_fenster(raster, fl):
    """1, wenn alle Punkte des GWR im Grundriss des Gebäudes (fl: [(Art, Punkte n × 3)]) eine Klasse aus OHNE_FENSTER haben
    und es mindestens einen gibt, sonst 0"""
    if not raster:
        return 0
    daecher = [p for art, p in fl if art == "RoofSurface" and len(p) >= 3]
    if not daecher:
        return 0
    alle = np.concatenate(daecher)
    e0, n0 = alle[:, 0].min(), alle[:, 1].min()
    e1, n1 = alle[:, 0].max(), alle[:, 1].max()
    klassen = []
    for ze in range(int(e0 // ZELLE_M), int(e1 // ZELLE_M) + 1):
        for zn in range(int(n0 // ZELLE_M), int(n1 // ZELLE_M) + 1):
            for e, n, k in raster.get((ze, zn), ()):
                if e0 <= e <= e1 and n0 <= n <= n1 and any(_innen(e, n, p) for p in daecher):
                    klassen.append(k)
    return 1 if klassen and all(k in OHNE_FENSTER for k in klassen) else 0
