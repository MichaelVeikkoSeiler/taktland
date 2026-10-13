"""Das Band neben den Bahnlinien je Kanton, für Gebäude und Bäume auf daten.taktland.ch (Michael, 2026-10-13: «zuerst den
Kanton Bern, dann Kanton Wallis, dann Kanton Neuenburg und Waadt, dann der Rest»).

Bahnlinien: swissTLMRegio (data/kartenlinien.json, wie das Nahbild). Kantone: BFS g1, vereinfacht auf 60 m
(data/schweiz11.json). Eine Kachel von KACHEL_M gehört dem Kanton, in dem ihre Mitte liegt; liegt sie im Ausland, dem
Kanton einer ihrer Ecken. So liegt jede Kachel in genau einem Kanton, und die Reihen des Workflows bauen nichts doppelt.
"""
import json
from pathlib import Path

import numpy as np
from matplotlib.path import Path as Pfad

import build_luftbild_nah
import build_relief

ROOT = Path(__file__).resolve().parent.parent
KACHEL_M = 500
BAND_M = 400
#: Reihenfolge laut Michael; «Rest» sind alle übrigen in der Reihenfolge der Kantonsnummer
ZUERST = ["BE", "VS", "NE", "VD"]


def kantone():
    """{Kürzel: [Ringe als Pfade in LV95]}"""
    d = json.loads((ROOT / "data" / "schweiz11.json").read_text(encoding="utf-8"))
    raus = {}
    for k in d["kantone"]:
        ringe = []
        for r in k["ringe"]:
            la, lo = r["start"]
            pts = [(la, lo)]
            for i in range(0, len(r["d"]), 2):
                la += r["d"][i]; lo += r["d"][i + 1]
                pts.append((la, lo))
            ringe.append(Pfad(np.array([build_relief.wgs84_zu_lv95(a / 1e5, o / 1e5) for a, o in pts])))
        raus[k["kt"]] = ringe
    return raus


def alle_kantone():
    rest = [k for k in kantone() if k not in ZUERST]
    return ZUERST + rest


def innen(ringe, pts):
    """gerade-ungerade über alle Ringe"""
    drin = np.zeros(len(pts), bool)
    for r in ringe:
        drin ^= r.contains_points(pts)
    return drin


class Band:
    """die Stücke Bahnlinie und die Kacheln am Band, mit Abstand je Kachel nur gegen die Stücke in der Nähe"""

    def __init__(self):
        self.stuecke = {}
        for pts in build_luftbild_nah.linien():
            for (e0, n0), (e1, n1) in zip(pts, pts[1:]):
                for qe in range(int((min(e0, e1) - BAND_M) // KACHEL_M), int((max(e0, e1) + BAND_M) // KACHEL_M) + 1):
                    for qn in range(int((min(n0, n1) - BAND_M) // KACHEL_M), int((max(n0, n1) + BAND_M) // KACHEL_M) + 1):
                        self.stuecke.setdefault((qe, qn), []).append((e0, n0, e1, n1))

    def abstand(self, qe, qn, e, n):
        d = np.full(np.shape(e), np.inf)
        for e0, n0, e1, n1 in self.stuecke.get((qe, qn), []):
            de, dn = e1 - e0, n1 - n0
            t = np.clip(((e - e0) * de + (n - n0) * dn) / ((de * de + dn * dn) or 1), 0, 1)
            d = np.minimum(d, np.hypot(e - e0 - t * de, n - n0 - t * dn))
        return d

    def kacheln(self, kt, kt_ringe):
        """die Kacheln des Kantons mit einem Punkt im Band"""
        alle = sorted(self.stuecke)
        mitte = np.array([((qe + 0.5) * KACHEL_M, (qn + 0.5) * KACHEL_M) for qe, qn in alle])
        drin = innen(kt_ringe[kt], mitte)
        # Kacheln mit der Mitte in keinem Kanton: dem Kanton einer Ecke
        sonst = np.zeros(len(alle), bool)
        for r in kt_ringe.values():
            sonst |= innen(r, mitte)
        for i in np.nonzero(~sonst)[0]:
            qe, qn = alle[i]
            ecken = np.array([(qe * KACHEL_M + a, qn * KACHEL_M + b) for a in (1, KACHEL_M - 1) for b in (1, KACHEL_M - 1)])
            for k, r in kt_ringe.items():
                if innen(r, ecken).any():
                    drin[i] = k == kt
                    break
        s = np.linspace(0, KACHEL_M, 11)
        raus = set()
        for i in np.nonzero(drin)[0]:
            qe, qn = alle[i]
            gx, gy = np.meshgrid(qe * KACHEL_M + s, qn * KACHEL_M + s)
            if self.abstand(qe, qn, gx.ravel(), gy.ravel()).min() <= BAND_M:
                raus.add((qe, qn))
        return raus

    def nah(self, e, n):
        """welche Punkte bis BAND_M neben einer Bahnlinie liegen"""
        e, n = np.asarray(e, float), np.asarray(n, float)
        raus = np.zeros(len(e), bool)
        qe, qn = (e // KACHEL_M).astype(int), (n // KACHEL_M).astype(int)
        schluessel = qe * 100000 + qn
        for s in np.unique(schluessel):
            w = schluessel == s
            raus[w] = self.abstand(int(s // 100000), int(s % 100000), e[w], n[w]) <= BAND_M
        return raus


def bbox_wgs84(kacheln):
    """das Rechteck um die Kacheln in WGS84 (west, süd, ost, nord), etwas grösser"""
    qe = [k[0] for k in kacheln]; qn = [k[1] for k in kacheln]
    e0, n0, e1, n1 = min(qe) * KACHEL_M, min(qn) * KACHEL_M, (max(qe) + 1) * KACHEL_M, (max(qn) + 1) * KACHEL_M
    la0, lo0 = lv95_zu_wgs84(e0, n0)
    la1, lo1 = lv95_zu_wgs84(e1, n1)
    return lo0 - 0.01, la0 - 0.01, lo1 + 0.01, la1 + 0.01


def lv95_zu_wgs84(e, n):
    """Näherung von swisstopo, genau auf etwa einen Meter"""
    y, x = (e - 2600000) / 1e6, (n - 1200000) / 1e6
    lo = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    la = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3
    return la * 100 / 36, lo * 100 / 36
