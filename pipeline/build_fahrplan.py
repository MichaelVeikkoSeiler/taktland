#!/usr/bin/env python3
"""Fahrplan für «Welcher Zug?» (Stufe 1): data/fahrplan/.

Aus dem GTFS von opentransportdata.swiss (pipeline/fetch_fahrplan.py) nur,
was der Fahrtmodus braucht (Michael, 2026-09-26, Merkliste «Welcher Zug?»):
Züge (GTFS route_type 2 und 100–117, keine Busse, Trams, Schiffe, Seilbahnen)
und ihre Halte an Bahnhöfen, die im Netz der Seite «Strecke» liegen, mit den
Zeiten laut Fahrplan und den Verkehrstagen ab heute für TAGE Tage.

Nicht darin, und so in der App benannt: Verspätungen, Ausfälle, Extrazüge,
Ersatzbusse und Baustellen, die nach dem Stand der Datei beschlossen wurden;
Halte an Orten ohne Bahnhof in Taktland; Fahrten, die der Fahrplan nur als
Takt (frequencies.txt) führt.

Ausgabe:
- info.json         Stand, Gültigkeit, Verkehrstage (je eine Bitfolge als Hex)
- halt/{uic}.json   je Bahnhof: [Fahrt, Ankunft, Abfahrt] in Minuten ab
                    Mitternacht des Verkehrstags (über 1440 nach Mitternacht)
- fahrt/{n}.json    je FAHRTEN_JE_DATEI Fahrten: Nummer, Gattung, Linie, Ziel,
                    Verkehrstage und die Halte

    .venv/bin/python pipeline/build_fahrplan.py
"""
import csv
import datetime as dt
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUELLE = ROOT / "data" / "raw" / "gtfs"
ZIEL = ROOT / "data" / "fahrplan"
NETZ = ROOT / "data" / "strecken.json"

#: so viele Tage ab heute; danach sagt die App «kein Fahrplan»
TAGE = 60
FAHRTEN_JE_DATEI = 400
ZUG = {2, *range(100, 118)}


def lesen(pfad: Path):
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


def minuten(zeit: str) -> int | None:
    if not zeit:
        return None
    h, m, _ = zeit.split(":")
    return int(h) * 60 + int(m)


def datum(s: str) -> dt.date:
    return dt.date(int(s[:4]), int(s[4:6]), int(s[6:]))


def main():
    ordner = sorted(p for p in QUELLE.glob("gtfs_fp*") if p.is_dir())
    if not ordner:
        sys.exit("Kein GTFS in data/raw/gtfs: zuerst python3 pipeline/fetch_fahrplan.py")
    g = ordner[-1]
    info = next(lesen(g / "feed_info.txt"))
    feed_von, feed_bis = datum(info["feed_start_date"]), datum(info["feed_end_date"])
    heute = dt.date.today()
    von = max(heute, feed_von)
    bis = min(feed_bis, von + dt.timedelta(days=TAGE - 1))
    if bis < von:
        sys.exit(f"Das GTFS {g.name} gilt nur bis {feed_bis}.")
    n_tage = (bis - von).days + 1
    print(f"{g.name}: Stand {info['feed_version']}, verwendet {von} bis {bis} ({n_tage} Tage)")

    im_netz = {int(u) for u in json.loads(NETZ.read_text(encoding="utf-8"))["bahnhoefe"]}

    # Haltestelle (auch Gleis) → UIC des Bahnhofs
    uic_von = {}
    for s in lesen(g / "stops.txt"):
        d = s.get("didok") or ""
        if d.isdigit() and int(d) in im_netz:
            uic_von[s["stop_id"]] = int(d)

    linien = {}
    for r in lesen(g / "routes.txt"):
        if int(r["route_type"]) in ZUG:
            linien[r["route_id"]] = (r["route_desc"], r["route_short_name"])

    # Fahrten der Züge; Verkehrstage erst danach, nur für ihre service_id
    fahrten = {}
    for t in lesen(g / "trips.txt"):
        if t["route_id"] in linien:
            fahrten[t["trip_id"]] = (t["route_id"], t["service_id"], t["trip_short_name"], t["trip_headsign"])
    dienste = {f[1] for f in fahrten.values()}
    print(f"Züge: {len(fahrten)} Fahrten, {len(dienste)} Verkehrstage-Kennungen")

    tage = {}
    for c in lesen(g / "calendar.txt"):
        if c["service_id"] not in dienste:
            continue
        a, b = datum(c["start_date"]), datum(c["end_date"])
        wt = [c[k] == "1" for k in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")]
        bits = 0
        for i in range(n_tage):
            d = von + dt.timedelta(days=i)
            if a <= d <= b and wt[d.weekday()]:
                bits |= 1 << i
        tage[c["service_id"]] = bits
    for c in lesen(g / "calendar_dates.txt"):
        sid = c["service_id"]
        if sid not in dienste:
            continue
        i = (datum(c["date"]) - von).days
        if not 0 <= i < n_tage:
            continue
        if c["exception_type"] == "1":
            tage[sid] = tage.get(sid, 0) | (1 << i)
        else:
            tage[sid] = tage.get(sid, 0) & ~(1 << i)

    takt = {f["trip_id"] for f in lesen(g / "frequencies.txt")}
    aktiv = {tid for tid, f in fahrten.items() if tage.get(f[1]) and tid not in takt}
    print(f"im Zeitraum: {len(aktiv)} Fahrten; nur als Takt geführt, ausgelassen: "
          f"{sum(1 for t in takt if t in fahrten)}")

    # Halte: stop_times ist nach Fahrt geordnet, aber nicht darauf verlassen
    halte = defaultdict(list)
    for i, s in enumerate(lesen(g / "stop_times.txt")):
        if i % 5_000_000 == 0 and i:
            print(f"  stop_times: {i // 1_000_000} Mio. Zeilen")
        tid = s["trip_id"]
        if tid not in aktiv:
            continue
        uic = uic_von.get(s["stop_id"])
        if uic is None:
            continue
        # weder Ein- noch Ausstieg: kein Halt
        if s["pickup_type"] == "1" and s["drop_off_type"] == "1":
            continue
        halte[tid].append((int(s["stop_sequence"]), uic, minuten(s["arrival_time"]), minuten(s["departure_time"])))

    # gleiche Fahrt an verschiedenen Tagen (andere service_id): eine Fahrt, Tage vereint
    zusammen = {}
    for tid, h in halte.items():
        if len(h) < 2:
            continue
        h.sort()
        rid, sid, nr, ziel = fahrten[tid]
        gattung, linie = linien[rid]
        folge = tuple((u, a, b) for _, u, a, b in h)
        schluessel = (gattung, linie, nr, ziel, folge)
        zusammen[schluessel] = zusammen.get(schluessel, 0) | tage[sid]
    print(f"Fahrten mit mindestens zwei Halten an Taktland-Bahnhöfen: {len(zusammen)}")

    tage_liste, tage_index = [], {}
    liste = sorted(zusammen.items(), key=lambda x: (x[0][4][0][2] or x[0][4][0][1] or 0, x[0][2]))
    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    (ZIEL / "halt").mkdir(parents=True)
    (ZIEL / "fahrt").mkdir()
    je_halt = defaultdict(list)
    datei = []
    for n, ((gattung, linie, nr, ziel, folge), bits) in enumerate(liste):
        if bits not in tage_index:
            tage_index[bits] = len(tage_liste)
            tage_liste.append(format(bits, "x"))
        t = tage_index[bits]
        datei.append({"n": nr, "g": gattung, "l": linie, "z": ziel, "t": t, "h": [list(x) for x in folge]})
        for u, a, b in folge:
            je_halt[u].append([n, a, b, t])
        if len(datei) == FAHRTEN_JE_DATEI:
            (ZIEL / "fahrt" / f"{n // FAHRTEN_JE_DATEI}.json").write_text(
                json.dumps(datei, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            datei = []
    if datei:
        (ZIEL / "fahrt" / f"{(len(liste) - 1) // FAHRTEN_JE_DATEI}.json").write_text(
            json.dumps(datei, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for u, x in je_halt.items():
        x.sort(key=lambda e: (e[2] if e[2] is not None else e[1]))
        (ZIEL / "halt" / f"{u}.json").write_text(json.dumps(x, separators=(",", ":")), encoding="utf-8")

    (ZIEL / "info.json").write_text(json.dumps({
        "quelle": "Fahrplan als GTFS, opentransportdata.swiss",
        "datei": g.name,
        "stand": info["feed_version"],
        "von": von.isoformat(),
        "bis": bis.isoformat(),
        "je_datei": FAHRTEN_JE_DATEI,
        "hinweis": "Nur Züge und nur Halte an Bahnhöfen im Netz der Seite «Strecke», mit den Zeiten "
                   "laut Fahrplan (Minuten ab Mitternacht des Verkehrstags, über 1440 nach Mitternacht). "
                   "tage: je Verkehrstage-Kennung eine Bitfolge als Hex, Bit 0 = von. Nicht darin: "
                   "Verspätungen, Ausfälle, Extrazüge, Ersatzbusse, Baustellen nach dem Stand der Datei, "
                   "Fahrten nur als Takt.",
        "tage": tage_liste,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    groesse = sum(p.stat().st_size for p in ZIEL.rglob("*.json"))
    print(f"data/fahrplan: {len(liste)} Fahrten, {len(je_halt)} Bahnhöfe, {len(tage_liste)} Verkehrstage-Muster, "
          f"{groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
