#!/usr/bin/env python3
"""Brücken für «3D Schweiz» (Michael, 2026-10-30: «Kannst du die Brücken, hier Lorraineviadukt bauen? … Ebenso grössere Autobrücken
oder die Brücken an der Aare um Bern herum bauen», dann «Jetzt die Brücken bauen, Lorraineviadukt zuerst»).

swissTLM3D (swisstopo) führt Gleise (TLM_EISENBAHN) und Strassen und Wege (TLM_STRASSE) als Linien mit Höhe; KUNSTBAUTE sagt, welches
Stück auf einer Brücke liegt. Belegt sind so Lage und Höhe jeder Brücke. Breite, Dicke und Gestalt stehen in keiner Quelle: die App zeichnet
je Stück eine schlichte Platte unter der Achse, ohne Pfeiler. Bei Strassen nennt die Klasse oft eine Breite («4m Strasse»), sonst bleibt
sie leer. Gleise: nur Bahn, Tram und Metro, ohne Standseilbahnen; je Gleis ein Stück.

Je 10-km-Kachel eine Datei {Ost}_{Nord}.bjz (gzip, JSON): [art, breite_m oder null, Ost, Nord, Höhe in dm, [Ost, Nord, Höhe in dm ab dem
ersten Punkt …], zusatz], art 0 Gleis, 1 Strasse, 2 Weg; zusatz bei Gleisen ANZAHL_SPUREN (1, 2 oder null), bei Strassen und Wegen die
Klasse (OBJEKTART, «Autobahn» …; für die Breite, wo der Name keine nennt, wie im Führerstand); ein Stück gehört zu jeder Kachel, die einer
seiner Punkte berührt. Nach data/bruecken3d, mit index.json.

    python3 pipeline/fetch_tlm3d.py --strassen
    .venv/bin/python pipeline/build_bruecken3d.py
"""
import gzip
import json
import math
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "data" / "raw" / "tlm3d"
ZIEL = ROOT / "data" / "bruecken3d"
KACHEL_M = 10_000
BRUECKEN = ("Bruecke", "Bruecke mit Treppe", "Gedeckte Bruecke", "Steg", "Bruecke mit Galerie")
#: kürzere Stücke fallen weg (Durchlässe, kleine Bachbrücken), gewählt
MIN_M = 12
WEGE = {"1m Weg", "1m Wegfragment", "2m Weg", "2m Wegfragment", "Markierte Spur", "Klettersteig", "Fussweg"}


def laenge(p):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(p, p[1:]))


def main():
    kacheln = defaultdict(list)
    zahl = defaultdict(int)

    def legen(art, breite, p, z, zusatz=None):
        if laenge(p) < MIN_M:
            return
        e0, n0, h0 = round(p[0][0]), round(p[0][1]), round(z[0] * 10)
        d = []
        for (e, n), h in zip(p, z):
            d += [round(e - e0, 1), round(n - n0, 1), round(h * 10) - h0]
        eintrag = [art, breite, e0, n0, h0, d, zusatz]
        for k in {(int(e // KACHEL_M), int(n // KACHEL_M)) for e, n in p}:
            kacheln[k].append(eintrag)
        zahl[art] += 1

    bahn = shapefile.Reader(str(ROH / "swissTLM3D_TLM_EISENBAHN"), encoding="utf-8")
    felder = [f[0] for f in bahn.fields[1:]]
    for i, rec in enumerate(bahn.iterRecords()):
        d = dict(zip(felder, rec))
        if d.get("KUNSTBAUTE") not in BRUECKEN or d.get("VERKEHRSMI") not in ("Bahn", "Tram", "Metro") \
                or d.get("STANDSEILB") not in ("Falsch", None, ""):
            continue
        s = bahn.shape(i)
        spuren = int(d["ANZAHL_SPU"]) if str(d.get("ANZAHL_SPU") or "").isdigit() else None
        teile = list(s.parts) + [len(s.points)]
        for a, b in zip(teile, teile[1:]):
            legen(0, None, [q[:2] for q in s.points[a:b]], list(s.z[a:b]), spuren)

    strasse = shapefile.Reader(str(ROH / "swissTLM3D_TLM_STRASSE"), encoding="utf-8")
    for i, (art, kb) in enumerate(strasse.iterRecords(fields=["OBJEKTART", "KUNSTBAUTE"])):
        if kb not in BRUECKEN:
            continue
        s = strasse.shape(i)
        m = re.match(r"(\d+)m ", art)
        teile = list(s.parts) + [len(s.points)]
        for a, b in zip(teile, teile[1:]):
            legen(2 if art in WEGE or kb == "Steg" else 1, int(m.group(1)) if m else None, [q[:2] for q in s.points[a:b]], list(s.z[a:b]), art)

    ZIEL.mkdir(parents=True, exist_ok=True)
    for p in ZIEL.glob("*.bjz"):
        p.unlink()
    groesse = 0
    for (ex, ny), liste in kacheln.items():
        datei = ZIEL / f"{ex}_{ny}.bjz"
        datei.write_bytes(gzip.compress(json.dumps(liste, separators=(",", ":")).encode(), 9, mtime=0))
        groesse += datei.stat().st_size
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "swissTLM3D (swisstopo), TLM_EISENBAHN und TLM_STRASSE, KUNSTBAUTE Brücke",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M,
        "hinweis": "Lage und Höhe der Achsen auf Brücken laut swissTLM3D; Breite (bei Strassen ausser aus dem Namen der Klasse), Dicke und "
                   f"Gestalt in keiner Quelle. Stücke unter {MIN_M} m fehlen.",
        "kacheln": sorted(f"{ex}_{ny}" for ex, ny in kacheln),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Gleise {zahl[0]}, Strassen {zahl[1]}, Wege {zahl[2]}; {len(kacheln)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
