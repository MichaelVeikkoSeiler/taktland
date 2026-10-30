"""Masten der Fahrleitung für «3D Schweiz» und den Führerstand (Michael, 2026-10-30: «Kann man auf den Bahnstrecken auch Masten für
die Fahrleitungen setzen?», dann «An beiden Orten bitte»).

Belegt ist nur, wo eine Strecke elektrifiziert ist: das Schienennetz des BAV nennt die Elektrifizierung je Netzsegment (Stand der
Datei). Die Masten selbst sind erfunden: keine unserer Quellen kennt ihre Lage, ihren Abstand oder ihre Gestalt. Daraus gewählt:
- auf jeder Gleisachse aus swissTLM3D (Ebene TLM_EISENBAHN, nur Bahn, ohne Tram und Metro, ohne Standseilbahnen, nicht in Tunneln,
  Galerien, Unterführungen und Gebäuden), deren nächstes Netzsegment des BAV bis NAH_M weit weg elektrifiziert ist, alle ABSTAND_M
  ein Mast;
- SEITE_M neben der Achse, auf der Seite, auf der bis FREI_M kein anderes Gleis liegt; liegt auf beiden Seiten eines (ein Gleis
  zwischen anderen), kein Mast; je Zelle von ZELLE_M höchstens einer;
- ohne Netzsegment in der Nähe kein Mast: dort ist die Elektrifizierung nicht belegt.

Je 10-km-Kachel eine Datei {Ost}_{Nord}.mgz (gzip): die Zahl der Masten (UInt32), dann je Mast Ost und Nord in Metern ab der Ecke der
Kachel (UInt16) und die Richtung vom Mast zum Gleis (UInt8, 0 bis 255 für 0 bis 360°, gegen den Uhrzeigersinn ab Osten). Nach
data/fahrleitung, mit index.json.

    .venv/bin/python pipeline/build_fahrleitung.py      # nach fetch_tlm3d.py und fetch_schienennetz.py
"""
import gzip
import json
import math
import struct
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import shapefile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import schienennetz  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BAHN = ROOT / "data" / "raw" / "tlm3d" / "swissTLM3D_TLM_EISENBAHN"
ZIEL = ROOT / "data" / "fahrleitung"
KACHEL_M = 10_000
#: gewählt, in keiner Quelle
ABSTAND_M = 50
SEITE_M = 3.0
FREI_M = 2.6
ZELLE_M = 15
#: so weit darf das Netzsegment des BAV neben der Gleisachse liegen (Bahnhöfe mit vielen Gleisen um eine Mittellinie)
NAH_M = 60
OHNE = {"Tunnel", "Galerie", "Unterfuehrung", "in/auf Gebaeude"}


def wgs84_zu_lv95(la, lo):
    p = (la * 3600 - 169028.66) / 10000
    l = (lo * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return e, n


def entlang(pts, abstand, rest):
    """Punkte alle abstand Meter entlang einer Linie mit der Richtung dort"""
    raus = []
    for (a, c), (d, e) in zip(pts, pts[1:]):
        l = math.hypot(d - a, e - c)
        if l == 0:
            continue
        s = abstand - rest
        while s <= l:
            t = s / l
            raus.append((a + (d - a) * t, c + (e - c) * t, (d - a) / l, (e - c) / l))
            s += abstand
        rest = l - (s - abstand)
    return raus, rest


def main():
    # Elektrifizierung je Netzsegment, die Stützpunkte in einem Raster von 100 m
    _, _, segmente, stand = schienennetz.lesen()
    bav = defaultdict(list)
    for sg in segmente:
        strom = sg["strom"] != "nicht elektrifiziert"
        pts = [wgs84_zu_lv95(la, lo) for la, lo in sg["zug"]]
        for (a, c), (d, e) in zip(pts, pts[1:]):
            k = max(1, int(math.hypot(d - a, e - c) // 20))
            for j in range(k + 1):
                x, y = a + (d - a) * j / k, c + (e - c) * j / k
                bav[(int(x // 100), int(y // 100))].append((x, y, strom))

    def elektrifiziert(x, y):
        best, wert = NAH_M, None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for a, c, s in bav.get((int(x // 100) + dx, int(y // 100) + dy), ()):
                    d = math.hypot(x - a, y - c)
                    if d < best:
                        best, wert = d, s
        return wert

    # alle Gleisachsen (auch in Tunneln nicht, die stehen nicht im Weg) alle 5 m in einem Raster von 10 m, für den freien Platz
    r = shapefile.Reader(str(BAHN))
    felder = [f[0] for f in r.fields[1:]]
    achsen = []
    gleis = defaultdict(list)
    for i, rec in enumerate(r.iterRecords()):
        d = dict(zip(felder, rec))
        if d.get("VERKEHRSMI") not in ("Bahn", "Tram", "Metro") or d.get("STANDSEILB") not in ("Falsch", None, ""):
            continue
        s = r.shape(i)
        pts = [p[:2] for p in s.points]
        teile = list(s.parts) + [len(pts)]
        for a, b in zip(teile, teile[1:]):
            stueck = pts[a:b]
            for x, y, _, _ in entlang(stueck, 5, 5)[0] + [(*stueck[0], 0, 0), (*stueck[-1], 0, 0)]:
                gleis[(int(x // 10), int(y // 10))].append((x, y, i))
            if d["VERKEHRSMI"] == "Bahn" and d.get("KUNSTBAUTE") not in OHNE:
                achsen.append((i, stueck))

    def frei(x, y, eigene):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for a, c, j in gleis.get((int(x // 10) + dx, int(y // 10) + dy), ()):
                    if math.hypot(x - a, y - c) < (FREI_M if j != eigene else SEITE_M - 0.3):
                        return False
        return True

    masten = defaultdict(list)
    belegt = set()
    zahl = ohne_angabe = 0
    for i, stueck in achsen:
        for x, y, te, tn in entlang(stueck, ABSTAND_M, ABSTAND_M / 2)[0]:
            strom = elektrifiziert(x, y)
            if strom is None:
                ohne_angabe += 1
                continue
            if not strom:
                continue
            # rechts von der Fahrrichtung der Zeichnung (tn, −te), sonst links
            for seite in (1, -1):
                me, mn = x + seite * tn * SEITE_M, y - seite * te * SEITE_M
                if frei(me, mn, i):
                    break
            else:
                continue
            zelle = (int(me // ZELLE_M), int(mn // ZELLE_M))
            if zelle in belegt:
                continue
            belegt.add(zelle)
            winkel = math.atan2(y - mn, x - me) % (2 * math.pi)
            k = (int(me // KACHEL_M), int(mn // KACHEL_M))
            masten[k].append((round(me - k[0] * KACHEL_M), round(mn - k[1] * KACHEL_M), round(winkel / (2 * math.pi) * 256) % 256))
            zahl += 1
    ZIEL.mkdir(parents=True, exist_ok=True)
    for p in ZIEL.glob("*.mgz"):
        p.unlink()
    groesse = 0
    for (ex, ny), liste in masten.items():
        daten = struct.pack("<I", len(liste)) + b"".join(
            struct.pack("<HHB", min(max(a, 0), 65535), min(max(b, 0), 65535), w) for a, b, w in liste)
        datei = ZIEL / f"{ex}_{ny}.mgz"
        datei.write_bytes(gzip.compress(daten, 9, mtime=0))
        groesse += datei.stat().st_size
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": f"Elektrifizierung: Schienennetz (BAV), Stand {stand}; Gleisachsen: swissTLM3D (swisstopo), Ebene Eisenbahn",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M,
        "hinweis": "Masten erfunden: Lage, Abstand und Gestalt in keiner Quelle; belegt ist nur die Elektrifizierung der Strecke. "
                   f"Alle {ABSTAND_M} m auf elektrifizierten Gleisachsen, {SEITE_M} m daneben, wo kein anderes Gleis näher als {FREI_M} m liegt",
        "masten": zahl, "kacheln": sorted(f"{ex}_{ny}" for ex, ny in masten),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{zahl} Masten, {len(masten)} Kacheln, {groesse / 1e6:.1f} MB; {ohne_angabe} Stellen ohne Netzsegment in der Nähe")


if __name__ == "__main__":
    main()
