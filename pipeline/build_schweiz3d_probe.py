"""Gebäude und Bäume für «3D Schweiz», zwei Probeausschnitte (Michael, 2026-10-20: «Köniz und Gantrisch mit Gebäuden und
Bäumen versehen als Probeausschnitten»): anders als für den Führerstand (build_gebaeude.py, build_baeume.py) nicht nur neben
den Bahnlinien, sondern alles in einem Rechteck.

Dieselben Quellen und Formate: Gebäude aus swissBUILDINGS3D 3.0 (swisstopo) als .bgz, Bäume aus swissTLM3D (Einzelbaum und
Bodenbedeckung, Waldflächen mit gezeichneten Bäumen gefüllt) als .bmd, je Kachel von 500 m. Die Farbe der Dächer und Kronen
kommt aus SWISSIMAGE (swisstopo, Fassung 2 m, je km auf 2,5 m gemittelt), denn das Nahbild der App gibt es nur entlang der
Bahn. Nach data/schweiz3d_probe/gebaeude und data/schweiz3d_probe/baeume, je mit index.json.

    .venv/bin/python pipeline/build_schweiz3d_probe.py
"""
import json
import sys
from datetime import date
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_baeume  # noqa: E402
import build_gebaeude  # noqa: E402
import build_luftbild  # noqa: E402
import build_schweiz3d_details  # noqa: E402
import umgebung  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "schweiz3d_probe"
K = build_gebaeude.KACHEL_M
#: die Probeausschnitte in LV95 (Ost und Nord von, Ost und Nord bis), auf ganze Kilometer: um den Bahnhof Köniz und um den Gipfel
#: des Gantrisch (Lage aus data/strecken.json und data/sehenswert.json)
GEBIETE = {"Köniz": (2_595_000, 1_194_000, 2_601_000, 1_200_000), "Gantrisch": (2_597_000, 1_169_000, 2_605_000, 1_177_000)}


class Luftbild:
    """Farbe an einer Stelle, aus SWISSIMAGE 2 m je km auf 400 × 400 gemittelt (wie build_gebaeude.Luftbild)"""
    def __init__(self, e0, n0, e1, n1):
        self.km = {}
        for ex in range(e0 // 10_000, (e1 - 1) // 10_000 + 1):
            for ny in range(n0 // 10_000, (n1 - 1) // 10_000 + 1):
                for (ke, kn), (_, href) in build_luftbild.km_kacheln(ex, ny).items():
                    if e0 // 1000 <= ke < e1 // 1000 and n0 // 1000 <= kn < n1 // 1000:
                        a = build_schweiz3d_details.lesen(href, True, 400)
                        self.km[(ke, kn)] = None if a is None else np.transpose(a, (1, 2, 0))

    def farbe(self, e, n):
        a = self.km.get((int(e // 1000), int(n // 1000)))
        if a is None:
            return None
        x, y = int((e % 1000) * 0.4), int((1000 - n % 1000) * 0.4)
        f = a[max(0, y - 1):y + 2, max(0, x - 1):x + 2].reshape(-1, 3).astype(float)
        return tuple(int(v) for v in f.mean(axis=0))


def main():
    (ZIEL / "gebaeude").mkdir(parents=True, exist_ok=True)
    (ZIEL / "baeume").mkdir(parents=True, exist_ok=True)
    jahre_g, zahl_b = {}, {}
    for name, (e0, n0, e1, n1) in GEBIETE.items():
        bild = Luftbild(e0, n0, e1, n1)
        kacheln = {(qe, qn) for qe in range(e0 // K, e1 // K) for qn in range(n0 // K, n1 // K)}
        # Gebäude: alle mit ihrer Mitte im Rechteck
        je, zahl = {}, 0
        for blatt, (jahr, href) in sorted(build_gebaeude.blaetter(None, kacheln, umgebung.bbox_wgs84(kacheln)).items()):
            datei = build_gebaeude.laden(blatt, jahr, href)
            if datei is None:
                print(f"  {blatt}: nicht geladen", flush=True)
                continue
            for fl in build_gebaeude.gebaeude(datei):
                alle = np.concatenate([p for _, p in fl])
                k = (int(alle[:, 0].mean() // K), int(alle[:, 1].mean() // K))
                if k not in kacheln:
                    continue
                build_gebaeude.sammeln(fl, bild, je.setdefault(k, []))
                jahre_g.setdefault(k, set()).add(jahr)
                zahl += 1
        groesse = build_gebaeude.schreiben(ZIEL / "gebaeude", je)
        print(f"{name}: {zahl} Gebäude, {groesse / 1e6:.1f} MB", flush=True)
        # Bäume: Einzelbäume und gezeichnete in den Waldflächen, ohne die im Lichtraum der Gleise
        eb = build_baeume.einzelbaeume(e0, n0, e1, n1)
        eb = np.concatenate([eb, np.zeros((len(eb), 1))], axis=1)
        fl = build_baeume.flaechen(e0, n0, e1, n1, kacheln, np.random.default_rng(len(name)))
        b = np.concatenate([eb, fl])
        b = b[(b[:, 0] >= e0) & (b[:, 0] < e1) & (b[:, 1] >= n0) & (b[:, 1] < n1)]
        b = build_baeume.ohne_gleis(b, build_baeume.gleise(e0, n0, e1, n1))
        z, groesse = build_baeume.schreiben(ZIEL / "baeume", b, bild)
        zahl_b.update(z)
        print(f"{name}: {len(eb)} Einzelbäume, {len(b)} Bäume, {groesse / 1e6:.1f} MB", flush=True)
    gebiete = {n: list(r) for n, r in GEBIETE.items()}
    (ZIEL / "gebaeude" / "index.json").write_text(json.dumps({
        "quelle": "swissBUILDINGS3D 3.0 (swisstopo); Dachfarbe aus SWISSIMAGE (swisstopo) auf 2,5 m",
        "geladen": date.today().isoformat(), "kachel_m": K, "gebiete": gebiete,
        "hinweis": "Probeausschnitte: alle Gebäude in den Rechtecken; Wandfarbe in keiner Quelle; Wände unten "
                   f"{build_gebaeude.WAND_TIEFER_M:g} m verlängert",
        "kacheln": {f"{qe}_{qn}": sorted(j) for (qe, qn), j in sorted(jahre_g.items())},
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (ZIEL / "baeume" / "index.json").write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo): Einzelbaum und Bodenbedeckung; Kronenfarbe aus SWISSIMAGE (swisstopo) auf 2,5 m",
        "geladen": date.today().isoformat(), "kachel_m": K, "gebiete": gebiete,
        "hinweis": "Probeausschnitte: Einzelbäume wie in der Quelle; Waldflächen mit gezeichneten Bäumen gefüllt (Abstand je Art "
                   "in keiner Quelle); Höhe in keiner Quelle",
        "kacheln": zahl_b,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
