#!/usr/bin/env python3
"""Sehenswertes für die Karten: data/sehenswert.json und data/flaechen.json.

Vier amtliche Quellen, alle über data.geo.admin.ch geladen (Michael,
2026-09-26: «Gipfel mit Höhe, KGS Objekte, Seilbahnen und Flächen
übernehmen»). Gezeigt wird nur, was die Quelle führt: Name, Art, Höhe,
Gemeinde; keine Beschreibungen, keine Wertungen.

- Gipfel: Swiss Map Vector 1000 (swisstopo), Ebene T14_DKM1M_NAME_PKT,
  Objektart «Gipfel», mit Name und Höhe. Dieselbe Datei wie für die Seen.
- KGS: Kulturgüterschutz-Inventar (BABS), Objekte von nationaler Bedeutung
  (Kategorie A); Bezeichnung («Beschreibung»), Objektarten, Gemeinde, Kanton.
- Seilbahnen mit Bundeskonzession (BAV): Name der Anlage, Bahntyp,
  Fahrzeugtyp, Betreiber, schiefe Länge und Höhendifferenz, der Verlauf.
- Flächen: Bundesinventar der Landschaften und Naturdenkmäler (BLN, BAFU),
  Pärke von nationaler Bedeutung (BAFU, Perimeter, samt dem Schweizerischen
  Nationalpark), Moorlandschaften von nationaler Bedeutung (BAFU).
- Ohne KGS-Objekte der Gruppe «Sammlungen» (Bestände in Gebäuden).

Lizenz: swisstopo OGD; die übrigen laut data.geo.admin.ch unter den
Nutzungsbedingungen von opendata.swiss bzw. admin.ch, freie Nutzung mit
Pflicht zur Quellenangabe (geprüft 2026-09-26 an den Verweisen im Katalog).

    python3 pipeline/build_sehenswert.py      # lädt fehlende Quellen
"""
import html
import json
import re
import sqlite3
import struct
import sys
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_seen import RAHMEN, laden as smv_laden, nach_wgs84, name_von, vereinfachen, wkb_polygone  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "sehenswert"
ZIEL = ROOT / "data" / "sehenswert.json"
FLAECHEN = ROOT / "data" / "flaechen.json"
BASIS = "https://data.geo.admin.ch"
QUELLEN = {
    "kgs": f"{BASIS}/ch.babs.kulturgueter/kulturgueter/kulturgueter_2056.xtf.zip",
    "seilbahnen": f"{BASIS}/ch.bav.seilbahnen-bundeskonzession/seilbahnen-bundeskonzession/"
                  "seilbahnen-bundeskonzession_2056_de.gpkg",
    "bln": f"{BASIS}/ch.bafu.bundesinventare-bln/bundesinventare-bln/bundesinventare-bln_2056.shp.zip",
    "paerke": f"{BASIS}/ch.bafu.schutzgebiete-paerke_nationaler_bedeutung/"
              "schutzgebiete-paerke_nationaler_bedeutung/schutzgebiete-paerke_nationaler_bedeutung_2056.shp.zip",
    "moor": f"{BASIS}/ch.bafu.bundesinventare-moorlandschaften/bundesinventare-moorlandschaften/"
            "bundesinventare-moorlandschaften_2056.shp.zip",
}
TOLERANZ_FLAECHE_M = 150
TOLERANZ_SEILBAHN_M = 20


def holen(url: str) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    ziel = RAW / url.rsplit("/", 1)[1]
    if not ziel.exists():
        print("lade", url)
        urllib.request.urlretrieve(url, ziel)
    if ziel.suffix == ".zip":
        ordner = RAW / ziel.stem
        if not ordner.exists():
            with zipfile.ZipFile(ziel) as z:
                z.extractall(ordner)
        return ordner
    return ziel


def lage(e: float, n: float) -> list[float]:
    la, lo = nach_wgs84(e, n)
    return [round(la, 5), round(lo, 5)]


def im_rahmen(e: float, n: float) -> bool:
    return RAHMEN[0] <= e <= RAHMEN[2] and RAHMEN[1] <= n <= RAHMEN[3]


def ringe_kodieren(ringe):
    """Ringe in LV95 → [{start: [Breite, Länge]·1e5, d: Differenzen}]"""
    raus = []
    for r in ringe:
        ganz = [tuple(round(v * 1e5) for v in nach_wgs84(e, n)) for e, n in r]
        d = []
        for (a0, b0), (a1, b1) in zip(ganz, ganz[1:]):
            d += [a1 - a0, b1 - b0]
        raus.append({"start": list(ganz[0]), "d": d})
    return raus


# ---------- Gipfel ----------

def gipfel():
    db = sqlite3.connect(smv_laden())
    raus = []
    for shape, name_lang, hoehe in db.execute(
            'select SHAPE, NAME_LANG, HOEHE from "T14_DKM1M_NAME_PKT" where OBJEKTART = ?', ("Gipfel",)):
        e, n = punkt(shape)
        name = name_von(name_lang)
        if not name or not im_rahmen(e, n):
            continue
        raus.append({"name": name, "hoehe_m": hoehe, "lage": lage(e, n)})
    return raus


def punkt(b: bytes):
    """Punkt aus einer GeoPackage-Geometrie"""
    flags = b[3]
    pos = 8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
    ordnung = "<" if b[pos] == 1 else ">"
    return struct.unpack_from(ordnung + "dd", b, pos + 5)


def linie(b: bytes):
    """Linien aus einer GeoPackage-Geometrie (LineString oder MultiLineString)"""
    flags = b[3]
    pos = 8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]

    def lies(pos):
        ordnung = "<" if b[pos] == 1 else ">"
        typ = struct.unpack_from(ordnung + "I", b, pos + 1)[0]
        dim = 3 if typ in (1002, 2002) or (typ & 0x80000000) else 2
        typ %= 1000
        pos += 5
        if typ == 2:
            m = struct.unpack_from(ordnung + "I", b, pos)[0]
            pos += 4
            werte = struct.unpack_from(ordnung + "d" * (dim * m), b, pos)
            pos += 8 * dim * m
            return [list(zip(werte[0::dim], werte[1::dim]))], pos
        if typ == 5:
            n = struct.unpack_from(ordnung + "I", b, pos)[0]
            pos += 4
            alle = []
            for _ in range(n):
                teil, pos = lies(pos)
                alle += teil
            return alle, pos
        raise ValueError(f"Linientyp {typ}")

    return lies(pos)[0]


# ---------- KGS ----------

def kgs():
    ordner = holen(QUELLEN["kgs"])
    xtf = next(ordner.glob("*.xtf")).read_text(encoding="utf-8")
    katalog = next(ordner.glob("*Catalogues*.xml")).read_text(encoding="utf-8")
    arten = dict(re.findall(
        r'Objektarten_Catalogue TID="(\d+)">.*?<Language>de</Language>\s*<Text>(.*?)</Text>', katalog, re.S))
    raus = []
    for tid, o in re.findall(
            r'<KGS_PBC_V2_2\.KGS_Inventar\.KGS_Objekt TID="([^"]+)">(.*?)</KGS_PBC_V2_2\.KGS_Inventar\.KGS_Objekt>',
            xtf, re.S):
        if "<KGS_Kategorie>A" not in o:
            continue
        e = float(re.search(r"<C1>(.*?)</C1>", o).group(1))
        n = float(re.search(r"<C2>(.*?)</C2>", o).group(1))
        if not im_rahmen(e, n):
            continue
        feld = lambda t: (m.group(1).strip() if (m := re.search(fr"<{t}>(.*?)</{t}>", o, re.S)) else None)
        liste = [arten[r] for r in re.findall(r'<Reference REF="(\d+)"', o) if r in arten]
        # Sammlungen (Archive, Bestände in Gebäuden) sind vom Zug aus keine
        # Sehenswürdigkeit; sie bleiben weg
        if not liste or liste[0] == "Sammlungen":
            continue
        raus.append({
            "nr": int(feld("Objekt_Nr")),
            "name": html.unescape(feld("Beschreibung") or ""),
            # Gruppe und erste Objektart, wie die Quelle sie führt
            "gruppe": liste[0],
            **({"art": liste[1]} if len(liste) > 1 else {}),
            "gemeinde": html.unescape(feld("Gemeinde") or ""),
            "kanton": feld("Kanton"),
            "lage": lage(e, n),
        })
    return raus


# ---------- Seilbahnen ----------

def seilbahnen():
    db = sqlite3.connect(holen(QUELLEN["seilbahnen"]))
    anlagen = {}
    for xtf_id, nr, name, typ, fahrzeug, betreiber, ende in db.execute(
            "select xtf_id, AnlageNr, AnlageName, Bahntyp, Fahrzeugtyp, Betreiber_TUAbkuerzung, EndeGueltigkeit "
            "from Anlage"):
        if ende:  # nicht mehr gültig
            continue
        anlagen[xtf_id] = {"nr": nr, "name": name, "bahntyp": typ, "fahrzeugtyp": fahrzeug,
                           "betreiber": betreiber}
    raus = []
    for geom, laenge, hoehe, anlage in db.execute(
            "select geom, LaengeSchief, Hoehendifferenz, rAnlage from Seilbahnstrecke"):
        a = anlagen.get(anlage)
        if not a:
            continue
        stuecke = [vereinfachen(s, TOLERANZ_SEILBAHN_M) for s in linie(geom)]
        if not any(im_rahmen(e, n) for s in stuecke for e, n in s):
            continue
        raus.append({**a, "laenge_schief_m": laenge, "hoehendifferenz_m": hoehe,
                     "verlauf": ringe_kodieren(stuecke)})
    return raus


# ---------- Flächen ----------

def dbf(pfad: Path):
    b = pfad.read_bytes()
    n, hl, rl = struct.unpack("<xxxxIHH", b[:12])
    felder, i = [], 32
    while b[i] != 0x0D:
        felder.append((b[i:i + 11].split(b"\0")[0].decode("latin1"), b[i + 16]))
        i += 32
    zeilen = []
    for r in range(n):
        o, zeile = hl + r * rl + 1, {}
        for name, ln in felder:
            roh = b[o:o + ln]
            try:
                zeile[name] = roh.decode("utf-8").strip()
            except UnicodeDecodeError:
                zeile[name] = roh.decode("latin1").strip()
            o += ln
        zeilen.append(zeile)
    return zeilen


def shp(pfad: Path):
    """Polygone (Typ 5 und 15) als Liste von Ringlisten, je Datensatz"""
    b = pfad.read_bytes()
    pos, raus = 100, []
    while pos < len(b):
        _, laenge = struct.unpack(">ii", b[pos:pos + 8])
        inhalt = b[pos + 8:pos + 8 + laenge * 2]
        pos += 8 + laenge * 2
        typ = struct.unpack("<i", inhalt[:4])[0]
        if typ == 0:
            raus.append([])
            continue
        teile, punkte = struct.unpack("<ii", inhalt[36:44])
        start = list(struct.unpack(f"<{teile}i", inhalt[44:44 + 4 * teile])) + [punkte]
        p0 = 44 + 4 * teile
        xy = struct.unpack(f"<{2 * punkte}d", inhalt[p0:p0 + 16 * punkte])
        raus.append([list(zip(xy[2 * a:2 * b:2], xy[2 * a + 1:2 * b:2])) for a, b in zip(start, start[1:])])
    return raus


def flaechen():
    raus = []

    def dazu(art, name, ringe, nr=None):
        ringe = [vereinfachen(r, TOLERANZ_FLAECHE_M) for r in ringe]
        ringe = [r[:-1] for r in ringe if len(r) >= 4]
        if not ringe:
            return
        eintrag = {"art": art, "name": name, "ringe": ringe_kodieren(ringe)}
        if nr is not None:
            eintrag["nr"] = nr
        raus.append(eintrag)

    for schluessel, art, muster in (("bln", "BLN", "*.shp"), ("moor", "Moorlandschaft", "*.shp")):
        ordner = holen(QUELLEN[schluessel])
        datei = next(ordner.glob(muster))
        for zeile, ringe in zip(dbf(datei.with_suffix(".dbf")), shp(datei)):
            name = zeile.get("TeilObjNam") or zeile["Name"]
            dazu(art, name, ringe, int(zeile["ObjNummer"]))
    ordner = holen(QUELLEN["paerke"])
    datei = next(ordner.glob("*ParkPerimeter*.shp"))
    for zeile, ringe in zip(dbf(datei.with_suffix(".dbf")), shp(datei)):
        dazu(zeile.get("Kategor_de") or "Park", zeile["Name"], ringe, int(zeile["ObjNummer"]))
    # der Schweizerische Nationalpark steht schon bei den Pärken
    return raus


def main():
    daten = {
        "geladen": date.today().isoformat(),
        "quellen": {
            "gipfel": "Swiss Map Vector 1000, Bundesamt für Landestopografie swisstopo",
            "kgs": "KGS-Inventar, Objekte von nationaler Bedeutung, Bundesamt für Bevölkerungsschutz BABS",
            "seilbahnen": "Seilbahnen mit Bundeskonzession, Bundesamt für Verkehr BAV",
            "flaechen": "BLN, Pärke von nationaler Bedeutung, Moorlandschaften: "
                        "Bundesamt für Umwelt BAFU",
        },
        "hinweis": ("Nur, was die Quellen führen: Name, Art, Höhe, Gemeinde. Lagen als [Breite, Länge]; "
                    "Linien und Flächen als start = [Breite, Länge] mal 100000 mit Differenzen. "
                    f"Flächen vereinfacht auf {TOLERANZ_FLAECHE_M} m."),
        "gipfel": gipfel(),
        "kgs": kgs(),
        "seilbahnen": seilbahnen(),
    }
    fl = {"geladen": daten["geladen"], "quelle": daten["quellen"]["flaechen"], "hinweis": daten["hinweis"],
          "flaechen": flaechen()}
    ZIEL.write_text(json.dumps(daten, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    FLAECHEN.write_text(json.dumps(fl, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"sehenswert.json: {len(daten['gipfel'])} Gipfel, {len(daten['kgs'])} KGS-Objekte, "
          f"{len(daten['seilbahnen'])} Seilbahnen, {ZIEL.stat().st_size / 1024:.0f} KB; "
          f"flaechen.json: {len(fl['flaechen'])} Flächen, {FLAECHEN.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
