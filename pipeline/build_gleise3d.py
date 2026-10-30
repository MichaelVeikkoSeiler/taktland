#!/usr/bin/env python3
"""Welches Gleis wo liegt, für die Züge in «3D Schweiz» (Michael, 2026-10-30: «Kann man die Züge auf den richtigen Gleisen fahren lassen?
Erkennst du sie und auf welchem Gleis der entsprechende Zug ankommt? Unterirdische Gleise nicht berücksichtigen … Gleiswechsel nur so viel
wie nötig»).

Belegt: die Sektortafeln der SBB (data.sbb.ch, sektortafel) mit Lage und Kundengleisnummer, und die Gleisachsen aus swissTLM3D
(TLM_EISENBAHN, nur Bahn, ohne Tunnel und Standseilbahnen). Je Tafel die Achsen bis NAH_M daneben, höchstens WINKEL schräg zur Richtung,
in der die Tafeln desselben Gleises stehen; je Gleis die Achse, die den meisten Tafeln am nächsten liegt; wählen zwei Gleise eines Bahnhofs
dieselbe Achse, nimmt das mit dem grösseren Abstand seine nächste; zuletzt die Nummern der Reihe nach quer zum Bahnhof (Annahme). Unterirdische Gleise fallen weg: dort gibt es keine Achse ausserhalb von
Tunneln (und in Zürich HB keine Tafeln). Welche Achse ein Gleis ist, ist so geschlossen, nicht angegeben: die Quelle nennt kein Gleis an der
Achse.

Ausgabe data/gleise3d.json: je Bahnhofsnummer je Gleisnummer ein Punkt auf der Achse (LV95, Mitte der Fusspunkte der Tafeln) und ihre
Richtung (Grad, gegen den Uhrzeigersinn ab Osten).

    .venv/bin/python pipeline/build_gleise3d.py      # nach fetch.py und fetch_tlm3d.py
"""
import csv
import json
import math
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "data" / "raw"
ZIEL = ROOT / "data" / "gleise3d.json"
#: so weit darf eine Tafel neben ihrer Achse stehen (Perronkante bis Gleismitte, dazu die Lage der Tafel), gewählt
NAH_M = 9.0
WINKEL = math.cos(math.radians(25))
ZELLE_M = 50
#: so viele Grad darf die Achse eines Gleises von der mittleren Richtung des Bahnhofs abweichen, gewählt
RICHTUNG_ANDERS = 30


def wgs84_zu_lv95(la, lo):
    p = (la * 3600 - 169028.66) / 10000
    l = (lo * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return e, n


def main():
    # Tafeln je Bahnhof und Gleis
    tafeln = defaultdict(lambda: defaultdict(list))
    with open(ROH / "sektortafel.csv", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            g, uic, pos = r["kundengleisnummer"].strip(), r["bpuic"].strip(), r["geopos"].strip()
            if not re.fullmatch(r"\d+", g) or not uic.isdigit() or not pos:
                continue
            la, lo = (float(x) for x in pos.split(","))
            tafeln[int(uic)][int(g)].append(wgs84_zu_lv95(la, lo))
    print(f"{sum(len(v) for v in tafeln.values())} Gleise in {len(tafeln)} Bahnhöfen")

    # Gleisachsen ohne Tunnel, Stücke in Zellen
    bahn = shapefile.Reader(str(ROH / "tlm3d" / "swissTLM3D_TLM_EISENBAHN"), encoding="utf-8")
    felder = [f[0] for f in bahn.fields[1:]]
    zellen = defaultdict(list)
    for i, rec in enumerate(bahn.iterRecords()):
        d = dict(zip(felder, rec))
        if d.get("VERKEHRSMI") != "Bahn" or d.get("STANDSEILB") not in ("Falsch", None, "") \
                or d.get("KUNSTBAUTE") in ("Tunnel", "Unterfuehrung", "in/auf Gebaeude"):
            continue
        s = bahn.shape(i)
        p = s.points
        teile = list(s.parts) + [len(p)]
        for a0, b0 in zip(teile, teile[1:]):
            for k in range(a0, b0 - 1):
                a, b = p[k][:2], p[k + 1][:2]
                for qe in range(int(min(a[0], b[0]) // ZELLE_M), int(max(a[0], b[0]) // ZELLE_M) + 1):
                    for qn in range(int(min(a[1], b[1]) // ZELLE_M), int(max(a[1], b[1]) // ZELLE_M) + 1):
                        zellen[(qe, qn)].append((i, a, b))

    def achsen_bei(e, n, de, dn):
        """je Achse (Index) der nächste Fusspunkt bis NAH_M, nur Stücke etwa in Richtung (de, dn)"""
        best = {}
        for qe in range(int(e // ZELLE_M) - 1, int(e // ZELLE_M) + 2):
            for qn in range(int(n // ZELLE_M) - 1, int(n // ZELLE_M) + 2):
                for i, a, b in zellen.get((qe, qn), ()):
                    se, sn = b[0] - a[0], b[1] - a[1]
                    l2 = se * se + sn * sn
                    if not l2:
                        continue
                    if (de or dn) and abs(se * de + sn * dn) < WINKEL * math.sqrt(l2):
                        continue
                    t = max(0.0, min(1.0, ((e - a[0]) * se + (n - a[1]) * sn) / l2))
                    fe, fn = a[0] + t * se, a[1] + t * sn
                    d = math.hypot(fe - e, fn - n)
                    if d <= NAH_M and (i not in best or d < best[i][0]):
                        best[i] = (d, fe, fn, math.degrees(math.atan2(sn, se)) % 180)
        return best

    raus, zahl, ohne = {}, 0, 0
    for uic, gleise in tafeln.items():
        # je Gleis die Kandidaten: Achse → (Zahl der Tafeln, Summe der Abstände, Fusspunkte)
        wahl = {}
        for g, punkte in gleise.items():
            # Richtung der Tafeln eines Gleises: von der ersten zur fernsten
            de = dn = 0.0
            if len(punkte) >= 2:
                a = punkte[0]
                b = max(punkte, key=lambda q: math.hypot(q[0] - a[0], q[1] - a[1]))
                l = math.hypot(b[0] - a[0], b[1] - a[1])
                if l > 20:
                    de, dn = (b[0] - a[0]) / l, (b[1] - a[1]) / l
            kand = defaultdict(lambda: [0, 0.0, [], 0.0])
            for e, n in punkte:
                for i, (d, fe, fn, w) in achsen_bei(e, n, de, dn).items():
                    k = kand[i]
                    k[0] += 1; k[1] += d; k[2].append((fe, fn)); k[3] = w
            # die nächste Achse je Tafel zählt doppelt: so gewinnt die Achse, an der die Tafeln stehen
            liste = sorted(kand.items(), key=lambda x: (-x[1][0], x[1][1] / x[1][0]))
            if liste:
                wahl[g] = liste
        # jede Achse nur für ein Gleis: die Gleise der Reihe nach vom sichersten (kleinster mittlerer Abstand)
        vergeben, gesetzt = set(), {}
        for g in sorted(wahl, key=lambda g: wahl[g][0][1][1] / wahl[g][0][1][0]):
            for i, (z, summe, fuss, w) in wahl[g]:
                if i in vergeben or z < max(1, len(gleise[g]) // 2):
                    continue
                vergeben.add(i)
                fe = sum(x for x, _ in fuss) / len(fuss); fn = sum(y for _, y in fuss) / len(fuss)
                gesetzt[str(g)] = [round(fe, 1), round(fn, 1), round(w)]
                break
        # quer zum Bahnhof liegen die Gleisnummern der Reihe nach (eine Annahme, in keiner Quelle; auf Mittelperrons stehen die Tafeln
        # beider Gleise fast gleich weit von beiden Achsen, die Wahl allein vertauschte in Zürich HB 4 und 5, 8 und 9, 12 und 13): die
        # gefundenen Achsen nach ihrer Lage quer zur mittleren Richtung, die Nummern der Reihe nach darauf; Gleise mit mehr als RICHTUNG_ANDERS
        # Grad anderer Richtung fallen weg (in Bern 49 und 50, der unterirdische Bahnhof des RBS)
        if len(gesetzt) >= 2:
            richt = sorted(v[2] for v in gesetzt.values())[len(gesetzt) // 2]
            gesetzt = {g: v for g, v in gesetzt.items() if min(abs(v[2] - richt), 180 - abs(v[2] - richt)) <= RICHTUNG_ANDERS}
            w = math.radians(richt); ne, nn = -math.sin(w), math.cos(w)
            quer = {g: v[0] * ne + v[1] * nn for g, v in gesetzt.items()}
            nummern = sorted(gesetzt, key=int)
            achsen = sorted(gesetzt, key=lambda g: quer[g])
            mn = sum(int(g) for g in nummern) / len(nummern); mq = sum(quer.values()) / len(quer)
            if sum((int(g) - mn) * (quer[g] - mq) for g in nummern) < 0:
                achsen.reverse()
            gesetzt = {g: gesetzt[a] for g, a in zip(nummern, achsen)}
        ohne += len(gleise) - len(gesetzt)
        if gesetzt:
            raus[str(uic)] = gesetzt
            zahl += len(gesetzt)
    ZIEL.write_text(json.dumps({
        "quelle": "Sektortafeln (data.sbb.ch, sektortafel) und Gleisachsen aus swissTLM3D (swisstopo), ohne Tunnel",
        "geladen": date.today().isoformat(),
        "hinweis": "Je Bahnhofsnummer und Kundengleisnummer ein Punkt auf der Gleisachse, an der die Sektortafeln dieses Gleises stehen "
                   "(LV95, m) und die Richtung der Achse (Grad ab Osten). Welche Achse welches Gleis ist, ist aus der Lage der Tafeln "
                   "geschlossen; unterirdische Gleise fehlen.",
        "bahnhoefe": raus,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"gleise3d.json: {zahl} Gleise in {len(raus)} Bahnhöfen, {ohne} ohne Achse ({ZIEL.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
