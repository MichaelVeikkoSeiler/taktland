"""Scharfe Umgebung, ein Versuch auf einer kurzen Strecke (Michael, 2026-10-11: «Ist dieser Detailgrad umsetzbar,
nur 200 m links und rechts der Bahnlinie? … die Strecke Müntschemier bis Rosshäusern»).

Nur BAND_M links und rechts der Bahnlinien aus swissTLMRegio (data/kartenlinien.json) entlang der genannten
Bahnhöfe, in Kacheln von KACHEL_M:
- Luftbild: SWISSIMAGE 10 cm (swisstopo), auf 25 cm gemittelt, je Kachel ein JPEG von PX × PX, Zeilen von Norden;
  weiter weg als das Band weiss (dort zeichnet die App nichts, und das JPEG bleibt klein)
- Gelände: swissALTI3D 2 m (swisstopo), an den Ecken eines Rasters von 2 m (PUNKTE × PUNKTE, die Ränder zweier
  Kacheln teilen sich die Punkte), zwischen den Feldern linear; ausserhalb des Bands ohne Höhe

Höhen als .hgz: vorne die tiefste Höhe in Dezimetern (Int32), dann je Punkt die Höhe darüber in Dezimetern (UInt16),
65535 heisst ausserhalb des Bands; gepackt mit gzip. Je Kilometer der neueste Jahrgang; index.json hält je Kachel die
Jahre von Bild und Höhe fest. Gelesen wird nur der Ausschnitt jeder Kachel aus den GeoTIFF von swisstopo.

    .venv/bin/python pipeline/build_scharf.py                     # alle STRECKEN
    .venv/bin/python pipeline/build_scharf.py Kerzers Gümmenen    # andere Orte, in Fahrtreihenfolge
    .venv/bin/python pipeline/build_scharf.py --extern --relief gotthard albula   # entlang der Linie eines Reliefs
    .venv/bin/python pipeline/build_scharf.py --extern --weg Bern Olten "Zürich HB"   # entlang des Wegs der App

--extern schreibt nach data/scharf_extern statt nach data/scharf: diese Kacheln kommen nicht in die App, sondern auf
daten.taktland.ch (cyon, von Hand hochgeladen, Michael, 2026-10-12: «eine Subdomain daten.taktland.ch für die Kacheln»).
Der Index dort wächst mit jedem Lauf; Kacheln, die schon da sind oder schon in data/scharf liegen, entstehen nicht neu.
"""
import gzip
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from scipy.ndimage import map_coordinates

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_gelaende_nah  # noqa: E402
import build_luftbild  # noqa: E402
import build_luftbild_nah  # noqa: E402
import build_relief  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "data" / "scharf"
#: Seite einer Kachel; Bildpunkte je Seite (25 cm); Höhenpunkte je Seite (2 m, mit beiden Rändern)
KACHEL_M, PX, PUNKTE = 250, 1000, 126
#: so weit links und rechts der Linie
BAND_M = 200
#: so weit neben dem Zug durch die Orte gehören Linien dazu
KORRIDOR_M = 700
LEER = 65535
#: die Strecken des Versuchs, je in Fahrtreihenfolge (Michael, 2026-10-11: Müntschemier bis Rosshäusern, dann «weiter bis
#: nach Bern», dann «Bern - Biel Bienne» «Biel/Bienne - Neuchâtel» und «Neuchatel nach Buttes»)
STRECKEN = [
    ["Müntschemier", "Kerzers", "Ferenbalm-Gurbrü", "Gümmenen", "Rosshäusern", "Bern Riedbach", "Bern Bümpliz Nord",
     "Bern Stöckacker", "Bern"],
    ["Bern", "Zollikofen", "Münchenbuchsee", "Schüpfen", "Suberg-Grossaffoltern", "Lyss", "Brügg BE", "Biel/Bienne"],
    ["Biel/Bienne", "Tüscherz", "Twann", "Ligerz", "La Neuveville", "Le Landeron", "Cressier NE", "St-Blaise CFF",
     "Neuchâtel"],
    ["Neuchâtel", "Auvernier", "Bôle", "Champ-du-Moulin", "Noiraigue", "Travers", "La Presta Mines d'asphalte", "Couvet",
     "Môtiers NE", "Fleurier", "Buttes"],
]
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
           GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="3")


def strecken_entlang(orte):
    """die Stücke Bahnlinie bis KORRIDOR_M neben dem Zug durch die Orte, in dieser Reihenfolge (Müntschemier, Kerzers …
    Bern): so bleiben Linien weg, die nur das Rechteck um die Orte kreuzen (um Bern sind es viele)"""
    d = json.loads((ROOT / "data" / "strecken.json").read_text(encoding="utf-8"))
    lage = {name: d["lagen"][abk] for abk, name in d["punkte"].items() if abk in d["lagen"]}
    fehlt = [o for o in orte if o not in lage]
    if fehlt:
        raise SystemExit(f"nicht im Netz: {', '.join(fehlt)}")
    pts = [build_relief.wgs84_zu_lv95(*lage[o]) for o in orte]
    kette = [(a[0], a[1], b[0], b[1]) for a, b in zip(pts, pts[1:])]
    raus = []
    for linie in build_luftbild_nah.linien():
        for (a, b), (c, e) in zip(linie, linie[1:]):
            punkte = np.array([[a, b], [c, e], [(a + c) / 2, (b + e) / 2]])
            if abstand(kette, punkte[:, 0], punkte[:, 1]).max() <= KORRIDOR_M:
                raus.append((a, b, c, e))
    return raus


def abstand(strecken, e, n):
    """kleinster Abstand der Punkte (e, n) zu einer der Strecken"""
    d = np.full(e.shape, np.inf)
    for e0, n0, e1, n1 in strecken:
        de, dn = e1 - e0, n1 - n0
        t = np.clip(((e - e0) * de + (n - n0) * dn) / ((de * de + dn * dn) or 1), 0, 1)
        d = np.minimum(d, np.hypot(e - e0 - t * de, n - n0 - t * dn))
    return d


def kacheln(strecken):
    """{(Ost, Nord in Kacheln): Strecken in der Nähe}, nur Kacheln mit einem Punkt im Band"""
    raus = {}
    for st in strecken:
        e0, n0, e1, n1 = st
        for qe in range(int(min(e0, e1) - BAND_M) // KACHEL_M, int(max(e0, e1) + BAND_M) // KACHEL_M + 1):
            for qn in range(int(min(n0, n1) - BAND_M) // KACHEL_M, int(max(n0, n1) + BAND_M) // KACHEL_M + 1):
                raus.setdefault((qe, qn), []).append(st)
    s = np.linspace(0, KACHEL_M, 26)
    gut = {}
    for (qe, qn), st in raus.items():
        e, n = np.meshgrid(qe * KACHEL_M + s, qn * KACHEL_M + s)
        if abstand(st, e, n).min() <= BAND_M + 10:
            gut[(qe, qn)] = st
    return gut


def bild_quellen(kms):
    raus = {}
    for ex, ny in sorted({(ke // 10, kn // 10) for ke, kn in kms}):
        for k, (jahr, href) in build_luftbild.km_kacheln(ex, ny).items():
            if k in kms:
                # die Fassung mit 10 cm liegt neben der mit 2 m
                raus[k] = (jahr, href.replace("_2_2056.tif", "_0.1_2056.tif"))
    return raus


def hoehen_quellen(kms):
    raus = {}
    for ex, ny in sorted({(ke // 10, kn // 10) for ke, kn in kms}):
        for k, v in build_gelaende_nah.km_quellen(ex, ny).items():
            if k in kms:
                raus[k] = v
    return raus


def hoehen_km(quellen):
    """{(km Ost, km Nord): 2-m-Höhen 500 × 500, Zeilen von Norden}"""
    def lesen(k):
        for _ in range(4):
            try:
                with rasterio.Env(**ENV), rasterio.open("/vsicurl/" + quellen[k][1]) as d:
                    return k, d.read(1, out_shape=(500, 500), resampling=Resampling.average)
            except rasterio.errors.RasterioIOError:
                continue
        return k, None

    with ThreadPoolExecutor(16) as pool:
        return {k: a for k, a in pool.map(lesen, list(quellen)) if a is not None}


def bild_bauen(qe, qn, href, st):
    e0, n0 = qe * KACHEL_M, qn * KACHEL_M
    for _ in range(4):
        try:
            with rasterio.Env(**ENV), rasterio.open("/vsicurl/" + href) as d:
                w = from_bounds(e0, n0, e0 + KACHEL_M, n0 + KACHEL_M, d.transform)
                a = np.transpose(d.read([1, 2, 3], window=w, out_shape=(3, PX, PX), resampling=Resampling.average), (1, 2, 0))
            break
        except rasterio.errors.RasterioIOError:
            continue
    else:
        return False
    s = (np.arange(PX) + 0.5) * KACHEL_M / PX
    e, n = np.meshgrid(e0 + s, n0 + KACHEL_M - s)
    nah = abstand(st, e, n) <= BAND_M + 6
    a = np.where(nah[..., None], np.minimum(a, 245), 255).astype(np.uint8)
    Image.fromarray(a).save(ZIEL / f"{qe}_{qn}.jpg", quality=80, optimize=True, progressive=True)
    return True


def strecken_relief(name):
    """wie strecken_entlang, aber der Zug folgt der Linie eines Reliefs (data/relief/{name}.json, LV95)"""
    r = json.loads((ROOT / "data" / "relief" / f"{name}.json").read_text(encoding="utf-8"))
    w = r["weg"][::4] + [r["weg"][-1]]
    kette = [(a[1], a[2], b[1], b[2]) for a, b in zip(w, w[1:])]
    e = np.array([p[1] for p in w]); n = np.array([p[2] for p in w])
    raus = []
    for linie in build_luftbild_nah.linien():
        xs = np.array([p[0] for p in linie]); ys = np.array([p[1] for p in linie])
        if xs.max() < e.min() - KORRIDOR_M or xs.min() > e.max() + KORRIDOR_M or ys.max() < n.min() - KORRIDOR_M \
                or ys.min() > n.max() + KORRIDOR_M:
            continue
        for (a, b), (c, d) in zip(linie, linie[1:]):
            punkte = np.array([[a, b], [c, d], [(a + c) / 2, (b + d) / 2]])
            if abstand(kette, punkte[:, 0], punkte[:, 1]).max() <= KORRIDOR_M:
                raus.append((a, b, c, d))
    return raus


def strecken_weg(namen):
    """wie strecken_entlang, aber der Zug folgt dem Weg, den die App zwischen den Bahnhöfen sucht (Start, über …, Ziel),
    mit allen Betriebspunkten dazwischen"""
    sys.path.insert(0, str(ROOT / "generator"))
    import strecken as weg_suche  # noqa: E402
    n = weg_suche.laden()
    uic = {json.loads(p.read_text(encoding="utf-8"))["name"]: int(p.stem) for p in weg_suche.FACTS.glob("*.json")}
    fehlt = [x for x in namen if x not in uic]
    if fehlt:
        raise SystemExit(f"unbekannt: {', '.join(fehlt)}")
    punkte = []
    for a, b in zip(namen, namen[1:]):
        w = weg_suche.weg(n, uic[a], uic[b])
        if w is None:
            raise SystemExit(f"kein Weg {a} – {b}")
        abk = n["bahnhoefe"][str(uic[a])]
        kette = [abk]
        for e in w:
            abk = e["nach"] if e["von"] == abk else e["von"]
            kette.append(abk)
        punkte += [k for k in kette if not punkte or k != punkte[-1]]
    pts = [build_relief.wgs84_zu_lv95(*n["lagen"][k]) for k in punkte if k in n["lagen"]]
    kette = [(a[0], a[1], b[0], b[1]) for a, b in zip(pts, pts[1:])]
    e = np.array([p[0] for p in pts]); nn = np.array([p[1] for p in pts])
    raus = []
    for linie in build_luftbild_nah.linien():
        xs = np.array([p[0] for p in linie]); ys = np.array([p[1] for p in linie])
        if xs.max() < e.min() - KORRIDOR_M or xs.min() > e.max() + KORRIDOR_M or ys.max() < nn.min() - KORRIDOR_M \
                or ys.min() > nn.max() + KORRIDOR_M:
            continue
        for (a, b), (c, d) in zip(linie, linie[1:]):
            q = np.array([[a, b], [c, d], [(a + c) / 2, (b + d) / 2]])
            if abstand(kette, q[:, 0], q[:, 1]).max() <= KORRIDOR_M:
                raus.append((a, b, c, d))
    return raus


def main():
    global ZIEL
    argv = [a for a in sys.argv[1:] if a != "--extern"]
    extern = "--extern" in sys.argv
    if extern:
        ZIEL = ROOT / "data" / "scharf_extern"
    strecken, beschrieb = [], []
    if argv[:1] == ["--weg"]:
        strecken = strecken_weg(argv[1:])
        beschrieb.append("weg:" + " – ".join(argv[1:]))
    elif argv[:1] == ["--relief"]:
        for name in argv[1:]:
            strecken += [st for st in strecken_relief(name) if st not in strecken]
            beschrieb.append(f"relief:{name}")
    else:
        for orte in [argv] if argv else STRECKEN:
            strecken += [st for st in strecken_entlang(orte) if st not in strecken]
            beschrieb.append(orte)
    q = kacheln(strecken)
    alt = {}
    if extern and (ZIEL / "index.json").exists():
        alt = json.loads((ZIEL / "index.json").read_text(encoding="utf-8"))
    schon = set(alt.get("kacheln", {}))
    if extern and (ROOT / "data" / "scharf" / "index.json").exists():
        schon |= set(json.loads((ROOT / "data" / "scharf" / "index.json").read_text(encoding="utf-8"))["kacheln"])
    q = {k: v for k, v in q.items() if f"{k[0]}_{k[1]}" not in schon}
    kms = {(qe * KACHEL_M // 1000, qn * KACHEL_M // 1000) for qe, qn in q}
    print(f"{len(strecken)} Stücke Bahnlinie, {len(q)} Kacheln von {KACHEL_M} m in {len(kms)} Kilometern")
    ZIEL.mkdir(parents=True, exist_ok=True)
    bq = bild_quellen(kms)
    # die Höhen auch der Nachbarn: die Punkte am Rand einer Kachel liegen auf der Grenze zum nächsten Kilometer
    nachbarn = {(ke + de, kn + dn) for ke, kn in kms for de in (-1, 0, 1) for dn in (-1, 0, 1)}
    hq = hoehen_quellen(nachbarn)
    hoehen = hoehen_km(hq)
    index = dict(alt.get("kacheln", {})) if extern else {}
    auftraege = []
    for (qe, qn), st in sorted(q.items()):
        k = (qe * KACHEL_M // 1000, qn * KACHEL_M // 1000)
        if k not in bq or k not in hq:
            continue
        e0, n0 = qe * KACHEL_M, qn * KACHEL_M
        s = np.arange(PUNKTE) * (KACHEL_M / (PUNKTE - 1))
        e, n = np.meshgrid(e0 + s, n0 + KACHEL_M - s)
        # ein Feld aus den 3 × 3 Kilometern um die Kachel; die Mitte des Feldes (0, 0) liegt 1 m vom Rand
        ke, kn = k
        feld = np.full((1500, 1500), np.nan, np.float32)
        for de in (-1, 0, 1):
            for dn in (-1, 0, 1):
                a = hoehen.get((ke + de, kn + dn))
                if a is not None:
                    feld[(1 - dn) * 500:(2 - dn) * 500, (de + 1) * 500:(de + 2) * 500] = a
        nord = (kn + 2) * 1000
        z = map_coordinates(feld, [(nord - n) / 2 - 0.5, (e - (ke - 1) * 1000) / 2 - 0.5], order=1, mode="nearest")
        im_band = (abstand(st, e, n) <= BAND_M) & np.isfinite(z)
        if not im_band.any():
            continue
        dm = np.round(np.where(im_band, z, 0) * 10).astype(np.int64)
        tief = int(dm[im_band].min())
        werte = np.where(im_band, dm - tief, LEER).astype("<u2")
        (ZIEL / f"{qe}_{qn}.hgz").write_bytes(gzip.compress(np.int32(tief).tobytes() + werte.tobytes(), 9, mtime=0))
        index[f"{qe}_{qn}"] = [bq[k][0], hq[k][0]]
        auftraege.append((qe, qn, bq[k][1], st))
    with ThreadPoolExecutor(12) as pool:
        ok = list(pool.map(lambda a: bild_bauen(*a), auftraege))
    for (qe, qn, _, _), gut in zip(auftraege, ok):
        if not gut:
            index.pop(f"{qe}_{qn}")
            (ZIEL / f"{qe}_{qn}.hgz").unlink(missing_ok=True)
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "SWISSIMAGE 10 cm (swisstopo) auf 25 cm gemittelt; swissALTI3D 2 m (swisstopo)",
        "geladen": date.today().isoformat(), "kachel_m": KACHEL_M, "px": PX, "punkte": PUNKTE, "band_m": BAND_M,
        "strecken": alt.get("strecken", []) + [b for b in beschrieb if b not in alt.get("strecken", [])] if extern
                    else beschrieb,
        "hinweis": "Versuch: nur band_m neben den Bahnlinien aus swissTLMRegio, die höchstens 700 m neben dem Zug durch die Orte einer Strecke liegen; je Kachel Jahr von Bild und Höhe",
        "kacheln": dict(sorted(index.items())),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    groesse = sum(p.stat().st_size for p in ZIEL.iterdir())
    print(f"{len(index)} Kacheln, {groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
