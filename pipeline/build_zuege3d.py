#!/usr/bin/env python3
"""Züge für 3D-Land (3dland.ch), nicht für Taktland (Michael, 2026-10-26: «gehen wir mal die Züge an. Aber NUR für 3DLand»).

Aus dem GTFS von opentransportdata.swiss (pipeline/fetch_fahrplan.py) die Züge (GTFS route_type 2 und 100–117) mit
ihren Halten an Bahnhöfen im Netz der Seite «Strecke» und den Zeiten laut Fahrplan, für TAGE Tage ab heute. Zwischen
zwei Halten sucht das Skript den Weg im Netz (Dijkstra nach dem Gewicht der Abschnitte, wie wegSuchen in der App) und
legt jede Fahrt in jede 10-km-Kachel des Geländes, die dieser Weg berührt. Die App lädt nur die Kacheln ihres Modells
und rechnet dort, wo ein Zug laut Fahrplan gerade ist.

Nicht darin, und so in der App benannt: Verspätungen, Ausfälle, Extrazüge, Ersatzbusse und Baustellen, die nach dem
Stand der Datei beschlossen wurden; Halte an Orten ohne Bahnhof im Netz; Fahrten, die der Fahrplan nur als Takt
(frequencies.txt) führt; der wirkliche Weg zwischen zwei Halten, wo es mehrere gibt (es gilt der kürzeste im Netz).

Ausgabe nach data/zuege3d/ (nicht in Git, der Workflow von 3dland.ch baut es täglich):
- index.json        Quelle, Stand, Zeitraum, Verkehrstage (je eine Bitfolge als Hex, Bit 0 = von), Kacheln
- {ost}_{nord}.json je Kachel die Fahrten: [Nummer, Name, Gattung, Linie, Ziel, Verkehrstage, [Betriebspunkt,
                    Ankunft, Abfahrt, …]] mit den Zeiten in Minuten ab Mitternacht des Verkehrstags (über 1440
                    nach Mitternacht)

    .venv/bin/python pipeline/build_zuege3d.py
"""
import csv
import datetime as dt
import heapq
import json
import math
import shutil
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUELLE = ROOT / "data" / "raw" / "gtfs"
ZIEL = ROOT / "data" / "zuege3d"
NETZ = ROOT / "data" / "strecken.json"

#: so viele Tage ab heute; der Workflow baut täglich neu
TAGE = 14
#: Kacheln wie die des Geländes (data/gelaende)
KACHEL_M = 10_000
#: Abstand der Punkte zwischen zwei Betriebspunkten, an denen die Kachel bestimmt wird
SCHRITT_M = 1_000
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


def wgs84_zu_lv95(lat, lon):
    """Näherungsformel von swisstopo, auf etwa einen Meter genau (wie pipeline/build_relief.py)"""
    p = (lat * 3600 - 169028.66) / 10000
    l = (lon * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = (1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p
         - 194.56 * l * l * p + 119.79 * p ** 3)
    return e, n


def main():
    ordner = sorted(p for p in QUELLE.glob("gtfs_fp*") if p.is_dir())
    if not ordner:
        sys.exit("Kein GTFS in data/raw/gtfs: zuerst python3 pipeline/fetch_fahrplan.py")
    g = ordner[-1]
    info = next(lesen(g / "feed_info.txt"))
    feed_von, feed_bis = datum(info["feed_start_date"]), datum(info["feed_end_date"])
    heute = dt.date.today()
    von = max(heute - dt.timedelta(days=1), feed_von)
    bis = min(feed_bis, von + dt.timedelta(days=TAGE - 1))
    if bis < von:
        sys.exit(f"Das GTFS {g.name} gilt nur bis {feed_bis}.")
    n_tage = (bis - von).days + 1
    print(f"{g.name}: Stand {info['feed_version']}, verwendet {von} bis {bis} ({n_tage} Tage)")

    netz = json.loads(NETZ.read_text(encoding="utf-8"))
    abk_von = {int(u): a for u, a in netz["bahnhoefe"].items() if int(u) > 0}
    lagen = {a: wgs84_zu_lv95(*l) for a, l in netz["lagen"].items()}
    nachbarn = defaultdict(list)
    for e in netz["abschnitte"]:
        nachbarn[e["von"]].append((e["nach"], e["gewicht"]))
        nachbarn[e["nach"]].append((e["von"], e["gewicht"]))

    weg_vorrat = {}

    def weg(a, b):
        """die Betriebspunkte des kürzesten Wegs von a nach b, wie wegSuchen in der App"""
        if (a, b) in weg_vorrat:
            return weg_vorrat[(a, b)]
        dist, vor, haufen = {a: 0}, {}, [(0, a)]
        while haufen:
            d, u = heapq.heappop(haufen)
            if u == b:
                break
            if d > dist[u]:
                continue
            for v, w in nachbarn.get(u, []):
                if d + w < dist.get(v, math.inf):
                    dist[v] = d + w
                    vor[v] = u
                    heapq.heappush(haufen, (dist[v], v))
        raus = None
        if b in dist:
            raus, u = [b], b
            while u != a:
                u = vor[u]
                raus.append(u)
            raus.reverse()
        weg_vorrat[(a, b)] = raus
        return raus

    def kacheln_des_wegs(punkte):
        raus = set()
        for p, q in zip(punkte, punkte[1:] or punkte):
            (e0, n0), (e1, n1) = lagen[p], lagen[q]
            schritte = max(1, int(math.hypot(e1 - e0, n1 - n0) // SCHRITT_M))
            for i in range(schritte + 1):
                t = i / schritte
                raus.add((int((e0 + (e1 - e0) * t) // KACHEL_M), int((n0 + (n1 - n0) * t) // KACHEL_M)))
        return raus

    # Haltestelle (auch Gleis) → Betriebspunkt des Bahnhofs
    halt_von = {}
    for s in lesen(g / "stops.txt"):
        d = s.get("didok") or ""
        if d.isdigit() and int(d) in abk_von and abk_von[int(d)] in lagen:
            halt_von[s["stop_id"]] = abk_von[int(d)]

    linien = {}
    for r in lesen(g / "routes.txt"):
        if int(r["route_type"]) in ZUG:
            linien[r["route_id"]] = (r["route_desc"], r["route_short_name"])
    fahrten = {}
    for t in lesen(g / "trips.txt"):
        if t["route_id"] in linien:
            fahrten[t["trip_id"]] = (t["route_id"], t["service_id"], t["trip_short_name"], t["trip_headsign"])
    dienste = {f[1] for f in fahrten.values()}

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
    print(f"Züge: {len(fahrten)} Fahrten, im Zeitraum {len(aktiv)}")

    halte = defaultdict(list)
    for i, s in enumerate(lesen(g / "stop_times.txt")):
        if i % 5_000_000 == 0 and i:
            print(f"  stop_times: {i // 1_000_000} Mio. Zeilen")
        tid = s["trip_id"]
        if tid not in aktiv:
            continue
        abk = halt_von.get(s["stop_id"])
        if abk is None:
            continue
        # weder Ein- noch Ausstieg: kein Halt
        if s["pickup_type"] == "1" and s["drop_off_type"] == "1":
            continue
        halte[tid].append((int(s["stop_sequence"]), abk, minuten(s["arrival_time"]), minuten(s["departure_time"])))

    # gleiche Fahrt an verschiedenen Tagen (andere service_id): eine Fahrt, Tage vereint
    zusammen = {}
    for tid, h in halte.items():
        h.sort()
        # derselbe Bahnhof zweimal hintereinander (zwei Haltekanten): zusammenlegen
        folge = []
        for _, abk, a, b in h:
            if folge and folge[-1][0] == abk:
                folge[-1] = (abk, folge[-1][1], b)
            else:
                folge.append((abk, a, b))
        if len(folge) < 2:
            continue
        rid, sid, nr, ziel = fahrten[tid]
        gattung, linie = linien[rid]
        schluessel = (gattung, linie, nr, ziel, tuple(folge))
        zusammen[schluessel] = zusammen.get(schluessel, 0) | tage[sid]
    print(f"Fahrten mit mindestens zwei Halten im Netz: {len(zusammen)}")

    tage_liste, tage_index = [], {}
    je_kachel = defaultdict(list)
    ohne_weg = 0
    for n, ((gattung, linie, nr, ziel, folge), bits) in enumerate(sorted(zusammen.items())):
        if bits not in tage_index:
            tage_index[bits] = len(tage_liste)
            tage_liste.append(format(bits, "x"))
        ks = set()
        for (a, _, _), (b, _, _) in zip(folge, folge[1:]):
            w = weg(a, b)
            if w is None:
                ohne_weg += 1
                continue
            ks |= kacheln_des_wegs(w)
        halte_flach = [x for h in folge for x in h]
        eintrag = [n, nr, gattung, linie, ziel, tage_index[bits], halte_flach]
        for k in ks:
            je_kachel[k].append(eintrag)
    print(f"Paare ohne Weg im Netz (ausgelassen): {ohne_weg}")

    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    ZIEL.mkdir(parents=True)
    for (ex, ny), liste in je_kachel.items():
        (ZIEL / f"{ex}_{ny}.json").write_text(json.dumps(liste, ensure_ascii=False, separators=(",", ":")),
                                               encoding="utf-8")
    (ZIEL / "index.json").write_text(json.dumps({
        "quelle": "Fahrplan als GTFS, opentransportdata.swiss",
        "datei": g.name,
        "stand": info["feed_version"],
        "von": von.isoformat(),
        "bis": bis.isoformat(),
        "kachel_m": KACHEL_M,
        "hinweis": "Nur Züge und nur Halte an Bahnhöfen im Netz der Seite «Strecke», mit den Zeiten laut Fahrplan "
                   "(Minuten ab Mitternacht des Verkehrstags, über 1440 nach Mitternacht). Der Weg zwischen zwei "
                   "Halten ist der kürzeste im Netz. Nicht darin: Verspätungen, Ausfälle, Extrazüge, Ersatzbusse, "
                   "Baustellen nach dem Stand der Datei, Fahrten nur als Takt.",
        "tage": tage_liste,
        "kacheln": sorted(f"{ex}_{ny}" for ex, ny in je_kachel),
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    groesse = sum(p.stat().st_size for p in ZIEL.glob("*.json"))
    print(f"data/zuege3d: {len(zusammen)} Fahrten, {len(je_kachel)} Kacheln, {len(tage_liste)} Verkehrstage-Muster, "
          f"{groesse / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
