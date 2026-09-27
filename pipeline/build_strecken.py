#!/usr/bin/env python3
"""Das Streckennetz für die Seite «Strecke»: data/strecken.json.

Wer Start und Ziel wählt, bekommt einen Weg durch das Netz und die erfassten
Tunnel und Brücken entlang dieses Wegs. Einen Fahrplan gibt es in den Daten
nicht. Der Weg ist darum berechnet, und die App sagt das.

Das Netz: alle Abschnitte der Zugzahlen, auf denen im neuesten Jahr
Personenzüge fahren. So fallen geplante Linien weg, die
linie-mit-betriebspunkten ebenfalls führt («Projekt Juradurchstich», 9501),
und Strecken nur für Güterzüge.

Die Zuordnung: Jeder Betriebspunkt wird über seine Lage auf die
Kilometrierung der Linien projiziert (linienkilometrierung, Punkte meist alle
100 m). Liegen beide Enden eines Abschnitts auf derselben Linie der SBB, gehören
die Tunnel und Brücken dieser Linie zwischen den beiden Kilometern zum
Abschnitt. Sie stammen aus data/linien/{nr}.json und, für Linien ohne eigene
Seite, aus data/linien_uebersicht.json. Tunnel und Brücken sind nur für die
Infrastruktur der SBB erfasst: Abschnitte anderer Bahnen (Lötschberg, BLS)
haben keine Daten, und die App nennt sie als Lücke.

Der Weg: kürzeste Luftlinie der Abschnitte, wobei Abschnitte mit wenig
Personenzügen teurer sind. So nimmt Basel - Olten den Hauenstein-Basistunnel
und nicht die Linie über Läufelfingen. Das Gewicht ist eine Suchhilfe, keine
Angabe: Die App zeigt es nicht an.

    .venv/bin/python pipeline/build_strecken.py
"""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import schienennetz  # noqa: E402
from build_seen import vereinfachen  # noqa: E402
from sources import DATASETS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
LINIEN = ROOT / "data" / "linien"
FACTS = ROOT / "data" / "facts"
ZIEL = ROOT / "data" / "strecken.json"
#: Lage der Linien für den Fahrtmodus, erst beim Start geladen
GEOMETRIE = ROOT / "data" / "strecken_geometrie.json"

QUELLEN = ["zugzahlen", "linienkilometrierung", "linie-mit-betriebspunkten", "linie", "tunnel",
           "brucken"]
#: vom BAV: die Linie auf Abschnitten anderer Bahnen (pipeline/schienennetz.py)
QUELLEN_BAV = ["schienennetz"]
#: von swisstopo: Tunnel und Brücken auf Abschnitten anderer Bahnen
QUELLEN_SWISSTOPO = ["swisstlm3d"]

#: So weit darf ein Betriebspunkt von einer Linie entfernt liegen, um auf ihr
#: zu gelten. 150 m genügen fast überall; an Übergängen zwischen zwei Linien
#: (Olten, Wanzwil) liegt der Punkt weiter weg, dann gilt die zweite Grenze.
NAH_KM = 0.15
UEBERGANG_KM = 0.6

#: Das Gewicht eines Abschnitts: Luftlinie mal (1 + STRAFE / Personenzüge pro
#: Tag, beide Richtungen zusammen), dazu ZUSCHLAG_KM je Abschnitt. Der Zuschlag
#: bildet ab, dass ein Fernzug Strecken ohne Halt bevorzugt: Zürich - Thalwil
#: durch den Zimmerberg-Basistunnel ist kaum kürzer als dem See entlang über
#: fünf Bahnhöfe, aber schneller.
#: Gewählt an 27 Strecken mit bekanntem Weg der Fernzüge (Basel - Zürich über
#: Brugg, Zürich - Lugano durch den Zimmerberg-Basistunnel, Bern - Brig über
#: Spiez, Lausanne - Bern über Fribourg ...): 26 stimmen, für jeden Zuschlag
#: von 0.25 bis 1 und jede Strafe von 0 bis 15 gleich viele. Vorher (Strafe 25
#: je Richtung, kein Zuschlag) waren es 20. Winterthur - Chur bleibt über
#: Rapperswil: ohne Fahrplan lässt sich eine S-Bahn nicht von einem Fernzug
#: unterscheiden; «Über Zürich HB» legt den Weg fest.
STRAFE = 10
ZUSCHLAG_KM = 0.5

#: km pro Grad in der Schweiz, für Abstände in der Ebene
KM_LON, KM_LAT = 73.0, 111.2


def ebene(lon, lat):
    return lon * KM_LON, lat * KM_LAT


def load(name):
    return pd.read_csv(RAW / f"{name}.csv", sep=";", low_memory=False)


def abschnitte():
    """Abschnitte mit Personenzügen im neuesten Jahr, ohne Richtung."""
    zz = load("zugzahlen")
    pv = zz[(zz.geschaeftscode == "Personenverkehr") & (zz.anzahl_zuege > 0)]
    jahr = int(pv.jahr.max())
    pv = pv[pv.jahr == jahr]
    kanten, punkte = {}, {}
    for r in pv.itertuples():
        try:
            pts = json.loads(r.verbindung)["coordinates"]
        except (TypeError, ValueError, KeyError):
            continue
        a, b = r.bp_von_abschnitt, r.bp_bis_abschnitt
        if a == b:
            continue
        for abk, name, uic, p in ((a, r.bp_von_abschnitt_bezeichnung, r.von_bpuic, pts[0]),
                                  (b, r.bp_bis_abschnitt_bezeichnung, r.bis_bpuic, pts[-1])):
            punkte[abk] = {"name": name, "uic": int(uic) if pd.notna(uic) else None,
                           "lage": ebene(*p), "wgs": (round(p[1], 5), round(p[0], 5))}
        km = sum(math.dist(ebene(*p), ebene(*q)) for p, q in zip(pts, pts[1:]))
        # je Richtung eine Zeile: die Züge beider Richtungen zusammen
        schluessel = tuple(sorted((a, b)))
        alt = kanten.get(schluessel)
        zuege = r.anzahl_zuege / 365
        kanten[schluessel] = {"km": alt["km"] if alt else km, "isb": alt["isb"] if alt else r.isb,
                              "zuege": (alt["zuege"] if alt else 0) + zuege}
    return jahr, kanten, punkte


#: Endpunkte ohne Bahnhofsnummer und ohne Linienzug in den Zugzahlen (Michael,
#: 2026-09-27: «Brig nach Iselle», die Durchfahrt durch den Simplon). Die Zugzahlen
#: führen den Abschnitt Staz. della Galleria Sempione – Iselle di Trasquera mit
#: Personenzügen, aber ohne Verlauf und ohne UIC für Iselle. Die Lage ist das Ende
#: der Linienkilometrierung der Linie; die App wählt den Punkt mit der Nummer «ziel»
#: (kein UIC, nur für die App), zeigt ihn ohne Bahnhofseite.
GRENZPUNKTE = {"IS": {"linie": 100, "ziel": -1}}


def grenzpunkte_ergaenzen(jahr, kanten, punkte):
    """Abschnitte zu GRENZPUNKTE aus den Zugzahlen, die abschnitte() mangels
    Verlauf überspringt; Länge für die Wegsuche aus der Kilometrierung."""
    zz = load("zugzahlen")
    pv = zz[(zz.geschaeftscode == "Personenverkehr") & (zz.anzahl_zuege > 0) & (zz.jahr == jahr)]
    km_linie = load("linienkilometrierung")
    amtlich = load("linie-mit-betriebspunkten")
    for abk, g in GRENZPUNKTE.items():
        zeilen = pv[(pv.bp_von_abschnitt == abk) | (pv.bp_bis_abschnitt == abk)]
        if zeilen.empty:
            continue
        linie = km_linie[km_linie.linienr == g["linie"]]
        ende = linie.loc[linie.km.idxmax()]
        la, lo = (float(x) for x in ende.geo_point_2d.split(","))
        name = (zeilen.bp_bis_abschnitt_bezeichnung if (zeilen.bp_bis_abschnitt == abk).any()
                else zeilen.bp_von_abschnitt_bezeichnung).iloc[0]
        punkte[abk] = {"name": name, "uic": None, "ziel": g["ziel"], "lage": ebene(lo, la),
                       "wgs": (round(la, 5), round(lo, 5))}
        for r in zeilen.itertuples():
            andere = r.bp_von_abschnitt if r.bp_bis_abschnitt == abk else r.bp_bis_abschnitt
            km_andere = amtlich[(amtlich.abkurzung_bpk == andere) & (amtlich.linie == g["linie"])].km
            if andere not in punkte or km_andere.empty:
                continue
            schluessel = tuple(sorted((abk, andere)))
            alt = kanten.get(schluessel)
            kanten[schluessel] = {"km": abs(float(ende.km) - float(km_andere.iloc[0])), "isb": r.isb,
                                  "zuege": (alt["zuege"] if alt else 0) + r.anzahl_zuege / 365}


#: Linien ohne Zugzahlen, die trotzdem ins Netz kommen, aus dem Schienennetz des
#: BAV (Michael, 2026-09-26: «BTI Bahn Biel bis Ins aufnehmen»). Die Zugzahlen
#: der SBB führen die BTI nicht; jeder Abschnitt des Schienennetzes wird ein
#: Abschnitt des Netzes. Ohne Zugzahlen zählt er für die Wegsuche wie ein
#: Abschnitt mit einem Zug pro Tag (siehe main).
BAV_OHNE_ZUGZAHLEN = {"261"}
#: Dazu kommen Stücke weiterer Linien (Michael, 2026-09-26: «Meiringen ist nicht
#: erfasst»; RhB, MGB, MOB, MVR, zb …), ausgewählt nach den Daten in
#: bav_stuecke_waehlen(): Jede Linie wird an den Punkten geteilt, die schon im
#: Netz liegen; ein Stück kommt dazu, wenn an ihm ein Bahnhof mit Faktendatei liegt,
#: der sonst nicht im Netz läge (Oberdorf SO – Moutier, Rafz – Neuhausen mit
#: Lottstetten und Jestetten). Stücke ohne solchen Bahnhof bleiben weg, so kommt
#: nichts doppelt, was die Zugzahlen schon führen.
#: Ohne: die Museumsbahnen Blonay-Chamby und Furka-Bergstrecke. Ihre Bahnhöfe
#: liegen an anderen Linien, und ein Weg Brig – Andermatt soll nicht über den Pass.
BAV_OHNE_DATENHERR = {"cmBC", "DFB"}
#: Für die Wegsuche zählt ein solches Stück wie ein Abschnitt mit so vielen
#: Zügen pro Tag (die BTI wie einer mit einem Zug, siehe main). Keine Angabe über
#: die Züge, nur eine Suchhilfe. Gewählt an 600 zufälligen Wegen zwischen
#: Bahnhöfen, die schon vorher im Netz lagen, und an Wegen auf den neuen Bahnen:
#: Mit 5 bleiben 599 gleich, und Zürich HB – Meiringen läuft über den Brünig,
#: Montreux – Zweisimmen über die MOB, Brig – Andermatt über die MGB. Mit 1 liefen
#: diese über Bern und Thun, mit 15 änderten sich 12 der alten Wege. Luzern –
#: Interlaken Ost bleibt über Bern; «Über Meiringen» legt den Brünig fest.
ZUEGE_OHNE_ZAEHLUNG = 5
#: Die BTI zählt wie ein Abschnitt mit so vielen Zügen pro Tag (Michael,
#: 2026-09-27: «diese Linie bevorzugen, wenn man Ins oder Ins Dorf bis Biel
#: eingibt»). Mit 20 laufen Ins – Biel und Ins Dorf – Biel über Täuffelen,
#: Dornach – Marin-Epagnier bleibt auf SBB und BLS, von 600 zufälligen Wegen
#: ändern sich 4 (Wege nach Brüttelen über Biel statt über Ins). Mit 1 lief
#: sogar Ins Dorf – Biel über Kerzers und Lyss.
ZUEGE_BTI = 20
#: Abkürzungen des Schienennetzes, wie die Zugzahlen sie schreiben, und bei
#: mehrsprachigen nur die erste. So bekommen SBB-Stücke ihre Linie und damit
#: Tunnel und Brücken der SBB (Mols, Grandgourt).
ISB_WIE_ZUGZAHLEN = {"SBB CFF FFS": "SBB", "BLSN": "BLS", "TPFH": "TPF", "RhB FR VR": "RhB"}
#: Die Bahn eines Abschnitts in der Auswahl «Bahnen» der App: die Infrastruktur,
#: bei der MGB die Linie der MGB auf der Infrastruktur der MGI
BAHN = {"MGI": "MGB"}


def bahn(isb):
    return BAHN.get(isb, isb)


#: Endpunkte, die das Schienennetz als eigenen Betriebspunkt im Bahnhof führt
#: («Biel/Bienne [Gleis 11/voie 11]»): Sie gelten als dieser Bahnhof, damit die
#: BTI an Biel/Bienne und Ins anschliesst.
BAV_GLEIS_IM_BAHNHOF = {8530750: 8504300, 8516177: 8504483}
#: umgekehrt, je Linie: welcher Punkt des Schienennetzes für den Bahnhof steht
BAV_GLEIS_IM_BAHNHOF_ZURUECK = {261: {8504300: 8530750, 8504483: 8516177}}
#: Punkte des Schienennetzes im Bahnhof, die eine Linie statt des Bahnhofs führt
#: («Kerzers BLS» 104 m neben «Kerzers», Linie 220): Sie gelten für den Verlauf als
#: dieser Bahnhof, wenn ihr Name mit dem Namen des Bahnhofs beginnt und sie höchstens
#: IM_BAHNHOF_M entfernt liegen. Weiter weg liegen Abzweigungen («Kerzers Süd
#: (Abzw)»), die bleiben eigene Punkte. Vorher fehlte darum zwischen Gümmenen und
#: Kerzers der Verlauf und mit ihm der Tunnel aus swissTLM3D (Michael, 2026-09-26).
IM_BAHNHOF_M = 150
#: Bahnhof (UIC) → Punkte des Schienennetzes, die für ihn stehen; gefüllt in main()
IM_BAHNHOF: dict = {}


def bav_stuecke_waehlen(bav, punkte, facts):
    """Je Linie die Segmente, die ins Netz kommen (siehe BAV_OHNE_DATENHERR)"""
    im_netz = {p["uic"] for p in punkte.values() if p.get("uic")}
    raus = {}
    for nummer, l in bav.items():
        if not nummer.isdigit() or l["datenherr"] in BAV_OHNE_DATENHERR or nummer in BAV_OHNE_ZUGZAHLEN:
            continue
        # Stücke zwischen Punkten im Netz, in der Reihenfolge der Kilometer
        segmente = sorted(l["segmente"], key=lambda g: (min(g["km_anfang"], g["km_ende"]), max(g["km_anfang"], g["km_ende"])))
        stueck, neu = [], False
        def abschliessen():
            if stueck and neu:
                raus.setdefault(nummer, []).extend(stueck)
        for g in segmente:
            vorn, hinten = (g["von_nummer"], g["bis_nummer"]) if g["km_anfang"] <= g["km_ende"] \
                else (g["bis_nummer"], g["von_nummer"])
            if not stueck or vorn in im_netz:
                abschliessen()
                stueck, neu = [], False
            stueck.append(g)
            neu = neu or any(n in facts and n not in im_netz for n in (vorn, hinten))
        abschliessen()
    return raus


def bav_abschnitte(kanten, punkte, facts):
    """Die Abschnitte der Linien in BAV_OHNE_ZUGZAHLEN und aus bav_linien_waehlen(),
    in kanten und punkte eingefügt wie die aus den Zugzahlen, mit zuege None.
    Abschnitte, die die Zugzahlen schon führen, bleiben, wie sie sind."""
    bav, _ = schienennetz.je_linie()
    abk_von = {p["uic"]: abk for abk, p in punkte.items() if p["uic"]}
    # Punkte des Schienennetzes im Bahnhof («Interlaken Ost Brünig», «Landquart RhB»):
    # Name beginnt mit dem des Bahnhofs, höchstens IM_BAHNHOF_M entfernt (wie in main)
    bahnhoefe = [(p["uic"], p["name"], p["wgs"]) for p in punkte.values() if p.get("uic") in facts]
    def im_bahnhof(p):
        for uic, name, (la, lo) in bahnhoefe:
            if p["name"].startswith(name + " ") and \
                    math.hypot((p["lat"] - la) * 111_200, (p["lon"] - lo) * 73_000) <= IM_BAHNHOF_M:
                return uic
        return None
    stuecke = bav_stuecke_waehlen(bav, punkte, facts)
    stuecke.update({n: bav[n]["segmente"] for n in BAV_OHNE_ZUGZAHLEN})
    for nummer in sorted(stuecke, key=int):
        l = bav[nummer]
        lage = {p["nummer"]: p for p in l["punkte"]}
        def abk(nr):
            bahnhof = BAV_GLEIS_IM_BAHNHOF.get(nr, nr)
            if bahnhof in abk_von:
                return abk_von[bahnhof]
            p = lage[nr]
            dort = im_bahnhof(p)
            if dort in abk_von:
                abk_von[nr] = abk_von[dort]
                BAV_GLEIS_IM_BAHNHOF_ZURUECK.setdefault(int(nummer), {})[dort] = nr
                return abk_von[dort]
            # dieselbe Abkürzung für einen anderen Punkt: die Nummer anhängen
            # ohne Abkürzung in der Quelle die Nummer
            a = p["abkuerzung"] or str(nr)
            a = a if a not in punkte else f"{a}~{nr}"
            punkte.setdefault(a, {"name": p["name"], "uic": nr,
                                  "lage": ebene(p["lon"], p["lat"]),
                                  "wgs": (round(p["lat"], 5), round(p["lon"], 5))})
            abk_von[nr] = a
            return a
        for g in stuecke[nummer]:
            a, b = abk(g["von_nummer"]), abk(g["bis_nummer"])
            if a == b or tuple(sorted((a, b))) in kanten:
                continue
            km = math.dist(punkte[a]["lage"], punkte[b]["lage"])
            kanten[tuple(sorted((a, b)))] = {"km": km, "isb": ISB_WIE_ZUGZAHLEN.get(g["isb"], g["isb"]),
                                             "zuege": None,
                                             "linie_bav": int(nummer),
                                             "stueck": nummer not in BAV_OHNE_ZUGZAHLEN}
    return set(stuecke)


#: So nah muss jeder Punkt eines Bauwerks aus swissTLM3D an der Linie des
#: Schienennetzes liegen, damit es zum Abschnitt gehört (beide sind Karten mit
#: eigener Genauigkeit; parallele Strecken liegen meist weiter auseinander)
TLM_NAH_M = 30
M_LAT, M_LON = 111_200, 73_000


def bav_verlauf(bav, nummer, von_nr, bis_nr):
    """Die Linie des Schienennetzes zwischen zwei Betriebspunkten, als Liste
    (Breite, Länge) von von_nr nach bis_nr, oder None"""
    l = bav.get(str(nummer))
    if not l:
        return None
    km = {p["nummer"]: p["km"] for p in l["punkte"]}
    von_nr = BAV_GLEIS_IM_BAHNHOF_ZURUECK.get(nummer, {}).get(von_nr, von_nr)
    bis_nr = BAV_GLEIS_IM_BAHNHOF_ZURUECK.get(nummer, {}).get(bis_nr, bis_nr)

    def auf_linie(nr):
        return nr if nr in km else next((x for x in IM_BAHNHOF.get(nr, []) if x in km), nr)
    von_nr, bis_nr = auf_linie(von_nr), auf_linie(bis_nr)
    if von_nr not in km or bis_nr not in km:
        return None
    lo, hi = sorted((km[von_nr], km[bis_nr]))
    pts = []
    for g in sorted(l["segmente"], key=lambda g: min(g["km_anfang"], g["km_ende"])):
        a, b = sorted((g["km_anfang"], g["km_ende"]))
        if a < lo - 1e-6 or b > hi + 1e-6:
            continue
        zug = g["zug"] if g["km_anfang"] <= g["km_ende"] else g["zug"][::-1]
        pts += zug if not pts else zug[1:]
    if len(pts) < 2:
        return None
    return pts if km[von_nr] <= km[bis_nr] else pts[::-1]


#: Fehlt ein Ende im Schienennetz (Spurweichen und Abzweigungen wie «Wiler Nord»,
#: auch «Sattel») oder liegen die Enden auf verschiedenen Linien, sucht
#: verlauf_nach_lage() eine Linie, deren Zeichnung an beiden Enden höchstens so nah
#: vorbeiführt, und nimmt das Stück dazwischen (Michael, 2026-09-26: 52 Abschnitte
#: ohne Verlauf und darum ohne Tunnel und Brücken beim Fahren)
LAGE_NAH_M = 150


def linien_zuege(bav):
    """Je Linie die Zeichnung aller Segmente hintereinander, nach Kilometer, in Metern"""
    raus = {}
    for nummer, l in bav.items():
        if not nummer.isdigit():
            continue
        pts = []
        for g in sorted(l["segmente"], key=lambda g: min(g["km_anfang"], g["km_ende"])):
            zug = g["zug"] if g["km_anfang"] <= g["km_ende"] else g["zug"][::-1]
            pts += zug if not pts else zug[1:]
        if len(pts) >= 2:
            m = np.array([(lo * M_LON, la * M_LAT) for la, lo in pts])
            raus[nummer] = (pts, m, np.concatenate([[0], np.cumsum(np.hypot(*np.diff(m, axis=0).T))]))
    return raus


def _projizieren(m, s, x, y):
    """Abstand und Stelle (Meter entlang) des nächsten Punkts der Zeichnung"""
    a, b = m[:-1], m[1:]
    d = b - a
    l2 = np.where((d ** 2).sum(1) == 0, 1, (d ** 2).sum(1))
    t = np.clip(((x - a[:, 0]) * d[:, 0] + (y - a[:, 1]) * d[:, 1]) / l2, 0, 1)
    px, py = a[:, 0] + t * d[:, 0], a[:, 1] + t * d[:, 1]
    ab = np.hypot(px - x, py - y)
    i = int(np.argmin(ab))
    return float(ab[i]), float(s[i] + t[i] * math.sqrt(l2[i])), i, float(t[i])


def verlauf_nach_lage(zuege_bav, wgs_a, wgs_b, km_luft):
    """Das Stück einer Linie des Schienennetzes zwischen zwei Lagen, oder None"""
    xa, ya = wgs_a[1] * M_LON, wgs_a[0] * M_LAT
    xb, yb = wgs_b[1] * M_LON, wgs_b[0] * M_LAT
    best = None
    for nummer, (pts, m, s) in zuege_bav.items():
        if not (m[:, 0].min() - LAGE_NAH_M <= min(xa, xb) and max(xa, xb) <= m[:, 0].max() + LAGE_NAH_M
                and m[:, 1].min() - LAGE_NAH_M <= min(ya, yb) and max(ya, yb) <= m[:, 1].max() + LAGE_NAH_M):
            continue
        da, sa, ia, ta = _projizieren(m, s, xa, ya)
        db, sb, ib, tb = _projizieren(m, s, xb, yb)
        if max(da, db) > LAGE_NAH_M or abs(sb - sa) > km_luft * 3000 + 500 or abs(sb - sa) < 1:
            continue
        if best is None or max(da, db) < best[0]:
            best = (max(da, db), nummer, (ia, ta), (ib, tb))
    if not best:
        return None
    pts = zuege_bav[best[1]][0]
    def punkt(i, t):
        (la0, lo0), (la1, lo1) = pts[i], pts[i + 1]
        return (la0 + (la1 - la0) * t, lo0 + (lo1 - lo0) * t)
    (ia, ta), (ib, tb) = best[2], best[3]
    if (ia, ta) <= (ib, tb):
        return [punkt(ia, ta)] + pts[ia + 1:ib + 1] + [punkt(ib, tb)]
    return ([punkt(ib, tb)] + pts[ib + 1:ia + 1] + [punkt(ia, ta)])[::-1]


def tlm_laden():
    """Bauwerke aus swissTLM3D (pipeline/build_tlm_bauwerke.py), mit Punkten in Metern"""
    pfad = ROOT / "data" / "tlm_bauwerke.json"
    if not pfad.exists():
        return {}, None
    d = json.loads(pfad.read_text(encoding="utf-8"))
    raus = {}
    for k, b in d["bauwerke"].items():
        la, lo = b["start"]
        pts = [(la / 1e5, lo / 1e5)]
        for i in range(0, len(b["d"]), 2):
            la += b["d"][i]; lo += b["d"][i + 1]
            pts.append((la / 1e5, lo / 1e5))
        raus[k] = {**b, "pts": pts}
    return raus, d


#: So viel eines Bauwerks muss neben dem Verlauf liegen, damit es zum Abschnitt
#: gehört. Ein langer Tunnel reicht über mehrere Abschnitte (Lötschbergtunnel:
#: Eggenschwand – Tunnelstation – Goppenstein); er gehört zu jedem, an dem
#: mindestens so viel von ihm liegt. Vorher musste er ganz in einem liegen und
#: fehlte darum (Michael, 2026-09-26: «Ist der Lötschbergtunnel erfasst?»).
TLM_MIN_M = 100
TLM_SCHRITT_M = 25
#: und mindestens dieser Anteil des Kürzeren von Bauwerk und Abschnitt: Der
#: Lötschbergtunnel liegt im Grundriss über dem Basistunnel und kreuzt ihn auf
#: 150 m (1 %); echte Zuordnungen decken mindestens 35 % ab
TLM_MIN_ANTEIL = 0.3


def proben(pts):
    """Punkte des Bauwerks alle TLM_SCHRITT_M, in Metern"""
    m = [(lo * M_LON, la * M_LAT) for la, lo in pts]
    raus = [m[0]]
    for (ax, ay), (bx, by) in zip(m, m[1:]):
        n = max(1, int(math.hypot(bx - ax, by - ay) // TLM_SCHRITT_M))
        raus += [(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(1, n + 1)]
    return raus


def nah_an(pts_bauwerk, verlauf):
    """Liegen mindestens TLM_MIN_M des Bauwerks höchstens TLM_NAH_M neben dem Verlauf?"""
    v = np.array([(lo * M_LON, la * M_LAT) for la, lo in verlauf])
    ax, ay, bx, by = v[:-1, 0], v[:-1, 1], v[1:, 0], v[1:, 1]
    dx, dy = bx - ax, by - ay
    l2 = np.where(dx * dx + dy * dy == 0, 1, dx * dx + dy * dy)
    p = proben(pts_bauwerk)
    lang_v = float(np.sum(np.hypot(dx, dy)))
    lang_b = sum(math.dist(a, b) for a, b in zip(p, p[1:]))
    nah = 0
    for x, y in p:
        t = np.clip(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1)
        if np.min(np.hypot(ax + t * dx - x, ay + t * dy - y)) <= TLM_NAH_M:
            nah += 1
    # ein kurzes Bauwerk ganz, ein langes mit mindestens TLM_MIN_M, beides mit TLM_MIN_ANTEIL
    if nah == len(p):
        return True
    nah_m = (nah - 1) * TLM_SCHRITT_M
    return nah_m >= TLM_MIN_M and nah_m >= TLM_MIN_ANTEIL * min(lang_b, lang_v)


def stelle(pts_bauwerk, verlauf):
    """Wie weit entlang des Verlaufs das Bauwerk beginnt, für die Reihenfolge in
    Wegrichtung (Meter der gezeichneten Linie, nur zum Ordnen)"""
    v = [(lo * M_LON, la * M_LAT) for la, lo in verlauf]
    la, lo = pts_bauwerk[0]
    p = (lo * M_LON, la * M_LAT)
    best, weit, s = float("inf"), 0.0, 0.0
    for (ax, ay), (bx, by) in zip(v, v[1:]):
        dx, dy = bx - ax, by - ay
        l = math.hypot(dx, dy)
        t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (l * l or 1)))
        d = math.hypot(ax + t * dx - p[0], ay + t * dy - p[1])
        if d < best:
            best, weit = d, s + t * l
        s += l
    return weit


def kodieren(pts):
    ganz = [(round(la * 1e5), round(lo * 1e5)) for la, lo in pts]
    return {"start": list(ganz[0]),
            "d": [v for (a0, o0), (a1, o1) in zip(ganz, ganz[1:]) for v in (a1 - a0, o1 - o0)]}


def linienzuege():
    """Je Linie die Kilometerpunkte als Linienzug, nach km geordnet, dazu
    Breite und Länge für die Geometrie des Fahrtmodus."""
    lk = load("linienkilometrierung")
    lat, lon = zip(*(map(float, s.split(",")) for s in lk.geo_point_2d))
    lk["lat"], lk["lon"] = lat, lon
    lk["x"], lk["y"] = np.array(lon) * KM_LON, np.array(lat) * KM_LAT
    zuege, wgs = {}, {}
    for nr, g in lk.groupby("linienr"):
        g = g.sort_values("km")
        zuege[int(nr)] = (g.x.values, g.y.values, g.km.values)
        wgs[int(nr)] = (g.km.values, g.lat.values, g.lon.values)
    return zuege, wgs


def geometrie_schreiben(wgs, linien, stand, abschnitte=None, bauwerke=None):
    """Je Linie die Punkte als Differenzen in ganzen Zahlen: Meter der
    Kilometrierung, Breite und Länge in Hunderttausendstel Grad (etwa 1 m).
    So wird die Datei ein Drittel so gross wie mit ausgeschriebenen Zahlen."""
    raus = {}
    for nr in sorted(linien):
        km, lat, lon = wgs[nr]
        m = np.round(km * 1000).astype(int)
        la = np.round(lat * 1e5).astype(int)
        lo = np.round(lon * 1e5).astype(int)
        raus[str(nr)] = {"start": [int(m[0]), int(la[0]), int(lo[0])],
                         "d": [int(v) for trio in zip(np.diff(m), np.diff(la), np.diff(lo)) for v in trio]}
    GEOMETRIE.write_text(json.dumps({"datenstand": stand, "quelle": "linienkilometrierung",
                                     "hinweis": "Je Linie start = [Meter, Breite, Länge] als ganze "
                                                "Zahlen (Breite und Länge mal 100000), d = Differenzen "
                                                "zum Vorgänger in derselben Reihenfolge.",
                                     "linien": raus,
                                     # Abschnitte anderer Bahnen: Verlauf laut Schienennetz des BAV,
                                     # «von|nach» wie in strecken.json, [Breite, Länge] mal 100000
                                     "abschnitte": abschnitte or {},
                                     # Tunnel und Brücken aus swissTLM3D auf diesen Abschnitten
                                     "bauwerke": bauwerke or {}}, separators=(",", ":")) + "\n",
                          encoding="utf-8")


def projektion(p, zug):
    """Abstand zum Linienzug und km am nächsten Punkt darauf, zwischen zwei
    Kilometerpunkten linear verteilt. Ein Sprung in der Kilometrierung (zwei
    Punkte weit auseinander) wird nicht überbrückt."""
    x, y, km = zug
    if len(x) == 1:
        return math.dist(p, (x[0], y[0])), km[0]
    ax, ay, bx, by = x[:-1], y[:-1], x[1:], y[1:]
    dx, dy = bx - ax, by - ay
    laenge2 = dx * dx + dy * dy
    t = np.clip(((p[0] - ax) * dx + (p[1] - ay) * dy) / np.where(laenge2 == 0, 1, laenge2), 0, 1)
    px, py = ax + t * dx, ay + t * dy
    d = np.hypot(px - p[0], py - p[1])
    # zwei Punkte, die mehr als 1 km auseinanderliegen, sind kein Gleisstück
    d = np.where(np.sqrt(laenge2) > 1.0, np.inf, d)
    i = int(np.argmin(d))
    return float(d[i]), float(km[i] + t[i] * (km[i + 1] - km[i]))


def lagen(punkte, zuege):
    """Je Betriebspunkt: {linie: (abstand, km)} für Linien bis UEBERGANG_KM.

    Nennt linie-mit-betriebspunkten den Kilometer des Punkts auf dieser Linie,
    gilt dieser statt der Projektion. Lausanne liegt dort bei km 0, die Lage auf
    der Karte ergab km 0.1, und drei Bauwerke im Bahnhof fielen heraus."""
    amtlich = defaultdict(list)
    for r in load("linie-mit-betriebspunkten").itertuples():
        amtlich[(r.abkurzung_bpk, int(r.linie))].append(float(r.km))
    mitte = {nr: (z[0].mean(), z[1].mean(), max(np.ptp(z[0]), np.ptp(z[1]))) for nr, z in zuege.items()}
    raus = {}
    for abk, p in punkte.items():
        x, y = p["lage"]
        treffer = {}
        for nr, z in zuege.items():
            mx, my, ausdehnung = mitte[nr]
            if math.dist((x, y), (mx, my)) > ausdehnung + UEBERGANG_KM + 1:
                continue
            d, km = projektion((x, y), z)
            if d <= UEBERGANG_KM:
                # steht der Punkt zweimal auf der Linie (Biel/Bienne auf 210), der nähere
                kms = amtlich.get((abk, nr))
                treffer[nr] = (d, min(kms, key=lambda k: abs(k - km)) if kms else km)
        raus[abk] = treffer
    return raus


def punkte_je_linie(lage):
    """Je Linie die Betriebspunkte des Netzes, die auf ihr liegen, mit km"""
    raus = defaultdict(list)
    for abk, treffer in lage.items():
        for nr, (d, km) in treffer.items():
            if d <= NAH_KM:
                raus[nr].append((km, abk))
    return raus


def dazwischen(nr, ka, kb, a, b, auf_linie):
    """Liegt auf der Linie ein weiterer Betriebspunkt des Netzes zwischen den
    beiden Enden? Dann führt der Abschnitt nicht über diese Linie: Er verbindet
    benachbarte Punkte. Aespli – Löchligut liegt an der alten Linie 450 und an
    der Neubaustrecke 400; auf der alten liegen Schönbühl und Zollikofen
    dazwischen, also ist es die Neubaustrecke durch den Grauholztunnel."""
    lo, hi = sorted((ka, kb))
    return any(lo + 0.2 < km < hi - 0.2 and abk not in (a, b) for km, abk in auf_linie.get(nr, []))


def zuordnen(a, b, geo, lage, sbb_linien, auf_linie):
    """Die Linie der SBB, auf der beide Enden liegen, und ihre Kilometer. Die
    Kilometerdifferenz muss zur Luftlinie passen: nicht kürzer als diese (mit
    Spielraum für die Rasterung), nicht mehr als dreimal so lang."""
    kandidaten = []
    for nr in set(lage[a]) & set(lage[b]) & sbb_linien:
        (da, ka), (db, kb) = lage[a][nr], lage[b][nr]
        strecke = abs(kb - ka)
        if not (geo * 0.9 - 0.2 <= strecke <= geo * 3 + 0.5):
            continue
        nah = da <= NAH_KM and db <= NAH_KM
        kandidaten.append((dazwischen(nr, ka, kb, a, b, auf_linie), not nah, da + db, nr, ka, kb))
    if not kandidaten:
        return None
    *_, nr, ka, kb = min(kandidaten)
    return nr, ka, kb


def zweigeteilt(a, b, geo, lage, zuege, sbb_linien, auf_linie):
    """Ein Abschnitt, der auf zwei Linien nacheinander liegt (Olten – Rothrist:
    erst Linie 500, ab Olten Süd Linie 450). Gesucht ist der Punkt, an dem die
    zweite Linie die erste berührt, und die Summe der beiden Kilometerstücke
    muss zur Luftlinie passen wie bei einer einzigen Linie."""
    beste = None
    for l1 in set(lage[a]) & sbb_linien:
        for l2 in set(lage[b]) & sbb_linien:
            if l1 == l2:
                continue
            x2, y2, km2 = zuege[l2]
            for j in range(len(x2)):
                d, k1 = projektion((x2[j], y2[j]), zuege[l1])
                if d > 0.1:
                    continue
                ka, kb = lage[a][l1][1], lage[b][l2][1]
                strecke = abs(k1 - ka) + abs(kb - km2[j])
                if not (geo * 0.9 - 0.2 <= strecke <= geo * 1.5 + 0.5):
                    continue
                wert = (dazwischen(l1, ka, k1, a, b, auf_linie) or dazwischen(l2, km2[j], kb, a, b, auf_linie),
                        strecke - geo, lage[a][l1][0] + lage[b][l2][0])
                if beste is None or wert < beste[0]:
                    beste = (wert, [(l1, ka, k1), (l2, float(km2[j]), kb)])
    return beste[1] if beste else None


def objekte():
    """Tunnel und Brücken je Linie aus den Fakten, mit ihrer Kennung
    «Linie:Stelle» in der Liste der Linie."""
    tunnel, bruecken = defaultdict(list), defaultdict(list)
    for p in LINIEN.glob("*.json"):
        f = json.loads(p.read_text(encoding="utf-8"))
        for i, t in enumerate((f.get("tunnel") or {}).get("items", [])):
            tunnel[f["linie"]].append((f"{f['linie']}:{i}", t["km"], t["laenge_m"]))
        for i, b in enumerate((f.get("bruecken") or {}).get("items", [])):
            bruecken[f["linie"]].append((f"{f['linie']}:{i}", b["km"]))
    u = json.loads((ROOT / "data" / "linien_uebersicht.json").read_text(encoding="utf-8"))
    for x in u["bruecken_ohne_seite_liste"]:
        for i, b in enumerate(x["items"]):
            bruecken[x["linie"]].append((f"{x['linie']}:{i}", b["km"]))
    return tunnel, bruecken


def tunnel_aus_tlm():
    """Anfang und Ende laut swissTLM3D für Tunnel ohne Richtung
    (pipeline/build_tunnel_richtung.py), «Linie:Stelle» → (von, bis)"""
    pfad = ROOT / "data" / "tunnel_richtung.json"
    if not pfad.exists():
        return {}
    return {k: (v["von"], v["bis"])
            for k, v in json.loads(pfad.read_text(encoding="utf-8"))["tunnel"].items()}


def tunnel_bereich_mit_tlm(kennung, km, laenge_m, lo, hi, aus_tlm):
    """Wie tunnel_bereich; gibt die Länge keine Richtung her, gelten Anfang und
    Ende laut swissTLM3D, wenn es sie gibt"""
    v, w = tunnel_bereich(km, laenge_m, lo, hi)
    if v == w and kennung in aus_tlm:
        return aus_tlm[kennung]
    return v, w


def tunnel_bereich(km, laenge_m, lo, hi):
    """Der Kilometer eines Tunnels liegt an einem Portal, welchem, sagt die
    Quelle nicht. Passt die Länge nur in eine Richtung auf die Linie
    (Gotthard-Basistunnel, km 256.455, 57 km nach Norden), gilt dieser
    Bereich, sonst nur der Punkt."""
    if not laenge_m:
        return km, km
    lang = laenge_m / 1000
    rueck = lo - 0.1 <= km - lang and km <= hi + 0.1
    vor = lo - 0.1 <= km and km + lang <= hi + 0.1
    if rueck and not vor:
        return km - lang, km
    if vor and not rueck:
        return km, km + lang
    return km, km


def main():
    abruf = json.loads((RAW / "_abruf.json").read_text(encoding="utf-8"))
    stand = max(abruf[q] for q in QUELLEN + QUELLEN_BAV)
    jahr, kanten, punkte = abschnitte()
    grenzpunkte_ergaenzen(jahr, kanten, punkte)
    namen = {json.loads(p.read_text(encoding="utf-8"))["uic"]: json.loads(p.read_text(encoding="utf-8"))["name"]
             for p in FACTS.glob("*.json")}
    bav_gewaehlt = bav_abschnitte(kanten, punkte, namen)
    zuege, wgs = linienzuege()
    lage = lagen(punkte, zuege)
    auf_linie = punkte_je_linie(lage)
    sbb_linien = set(load("linie").linie.astype(int))
    tunnel, bruecken = objekte()
    aus_tlm = tunnel_aus_tlm()
    bereich = {nr: (float(z[2].min()), float(z[2].max())) for nr, z in zuege.items()}
    # Linien des Schienennetzes je Betriebspunkt, ohne Tramlinien (Buchstaben)
    bav_linien, _ = schienennetz.je_linie()
    bav_je_punkt = defaultdict(set)
    for nummer, l in bav_linien.items():
        if nummer.isdigit():
            for x in l["punkte"]:
                bav_je_punkt[x["nummer"]].add(int(nummer))
    # Punkte im Bahnhof, die für ihn stehen (IM_BAHNHOF_M); ihre Linien zählen für den Bahnhof
    bahnhof_lage = {p["uic"]: (p["name"], p["wgs"]) for p in punkte.values() if p.get("uic") and p.get("wgs")}
    IM_BAHNHOF.clear()
    for nummer, l in bav_linien.items():
        if not nummer.isdigit():
            continue
        for x in l["punkte"]:
            for uic, (name, (la, lo)) in bahnhof_lage.items():
                if x["nummer"] == uic or not x["name"].startswith(name + " "):
                    continue
                if math.hypot((x["lat"] - la) * 111_200, (x["lon"] - lo) * 73_000) <= IM_BAHNHOF_M:
                    if x["nummer"] not in IM_BAHNHOF.setdefault(uic, []):
                        IM_BAHNHOF[uic].append(x["nummer"])
                    bav_je_punkt[uic].add(int(nummer))
    print(f"Punkte des Schienennetzes im Bahnhof: {sum(len(v) for v in IM_BAHNHOF.values())} "
          f"bei {len(IM_BAHNHOF)} Bahnhöfen")

    zuege_bav, nach_lage = linien_zuege(bav_linien), 0
    tlm, tlm_datei = tlm_laden()
    tlm_rahmen = {k: (min(p[0] for p in b["pts"]), max(p[0] for p in b["pts"]),
                      min(p[1] for p in b["pts"]), max(p[1] for p in b["pts"])) for k, b in tlm.items()}
    verlaeufe, bauwerke_genutzt = {}, {}
    liste, ohne_zuordnung, bereiche = [], [], {}
    for (a, b), k in sorted(kanten.items()):
        # ohne Zugzahlen (BAV_OHNE_ZUGZAHLEN) wie ein Abschnitt mit ZUEGE_BTI
        # Zügen: Ohne Strafe lief Dornach – Marin-Epagnier über Täuffelen.
        # Stücke anderer Bahnen (bav_stuecke_waehlen) wie ein Abschnitt mit
        # ZUEGE_OHNE_ZAEHLUNG Zügen pro Tag, siehe dort
        pro_tag = k["zuege"] or (ZUEGE_OHNE_ZAEHLUNG if k.get("stueck") else ZUEGE_BTI)
        strafe = STRAFE / max(pro_tag, 1)
        eintrag = {"von": a, "nach": b,
                   "gewicht": round(k["km"] * (1 + strafe) + ZUSCHLAG_KM, 3),
                   "isb": k["isb"], "bahn": bahn(k["isb"])}
        teile = None
        if k["isb"] == "SBB":
            eine = zuordnen(a, b, k["km"], lage, sbb_linien, auf_linie)
            teile = [eine] if eine else zweigeteilt(a, b, k["km"], lage, zuege, sbb_linien, auf_linie)
        if teile:
            eintrag["teile"] = []
            for nr, ka, kb in teile:
                # erst runden, dann zählen: generator/strecken.py rechnet mit
                # den gespeicherten Werten nach
                ka, kb = round(ka, 3), round(kb, 3)
                lo, hi = min(ka, kb), max(ka, kb)
                ll, lh = bereich[nr]
                auf_teil = []
                for i, km, lm in tunnel.get(nr, []):
                    v, w = tunnel_bereich_mit_tlm(i, km, lm, ll, lh, aus_tlm)
                    if w >= lo and v <= hi:
                        auf_teil.append(i)
                        # Anfang und Ende, damit der Fahrtmodus die Einfahrt kennt
                        bereiche[i] = [round(v, 3), round(w, 3)]
                eintrag["teile"].append({
                    "linie": nr, "km_von": ka, "km_bis": kb,
                    "tunnel": auf_teil,
                    "bruecken": [i for i, km in bruecken.get(nr, []) if lo <= km <= hi],
                })
        else:
            if k["isb"] == "SBB":
                ohne_zuordnung.append((a, b, k["km"]))
            # Ohne Linie der SBB: die Linie laut Schienennetz des BAV, wenn genau
            # eine beide Enden führt (Ins – Müntschemier: 220). Nur die Nummer;
            # Tunnel und Brücken gibt es dafür nicht.
            gemeinsam = (bav_je_punkt.get(punkte[a]["uic"], set())
                         & bav_je_punkt.get(punkte[b]["uic"], set()))
            if "linie_bav" in k:
                eintrag["linie_bav"] = k["linie_bav"]
            elif len(gemeinsam) == 1:
                eintrag["linie_bav"] = gemeinsam.pop()
            # der Verlauf laut Schienennetz und die Bauwerke darauf aus swissTLM3D
            verlauf = (bav_verlauf(bav_linien, eintrag["linie_bav"], punkte[a]["uic"], punkte[b]["uic"])
                       if "linie_bav" in eintrag else None)
            # führen mehrere Linien beide Enden (Mitholz – Ferden: 330 und 331), der
            # kürzeste Verlauf, der zur Luftlinie passt; linie_bav bleibt dann leer
            if not verlauf and len(gemeinsam) > 1:
                kandidaten = []
                for nr in sorted(gemeinsam):
                    v = bav_verlauf(bav_linien, nr, punkte[a]["uic"], punkte[b]["uic"])
                    if v:
                        lang = sum(math.dist(ebene(p[1], p[0]), ebene(q[1], q[0])) for p, q in zip(v, v[1:]))
                        if lang <= k["km"] * 3 + 0.5:
                            kandidaten.append((lang, nr, v))
                if kandidaten:
                    verlauf = min(kandidaten)[2]
            if not verlauf:
                verlauf = verlauf_nach_lage(zuege_bav, punkte[a]["wgs"], punkte[b]["wgs"], k["km"])
                if verlauf:
                    nach_lage += 1
            if verlauf:
                eintrag["verlauf_bav"] = True
                # vereinfacht auf 5 m, in Metern gerechnet; die Datei lädt der Fahrtmodus beim Start
                meter = vereinfachen([(lo * M_LON, la * M_LAT) for la, lo in verlauf], 5)
                verlaeufe[f"{a}|{b}"] = kodieren([(y / M_LAT, x / M_LON) for x, y in meter])
                las, los = [p[0] for p in verlauf], [p[1] for p in verlauf]
                rand = 0.001
                # Rahmen überlappen (nicht: enthalten), sonst fielen lange Tunnel wieder weg
                auf = [kb for kb, (a0, a1, o0, o1) in tlm_rahmen.items()
                       if a1 > min(las) - rand and a0 < max(las) + rand and o1 > min(los) - rand
                       and o0 < max(los) + rand and nah_an(tlm[kb]["pts"], verlauf)]
                if auf:
                    # in Richtung von → nach geordnet; die App dreht um, wenn der Weg andersherum führt
                    eintrag["tlm"] = sorted(auf, key=lambda x: stelle(tlm[x]["pts"], verlauf))
                    for kb in auf:
                        bauwerke_genutzt[kb] = {x: v for x, v in tlm[kb].items() if x != "pts"}
        liste.append(eintrag)

    im_netz = {p["uic"]: abk for abk, p in punkte.items() if p["uic"] in namen}
    # Endpunkte ohne Bahnhofsnummer (GRENZPUNKTE), nur für die Auswahl in der App
    im_netz.update({p["ziel"]: abk for abk, p in punkte.items() if p.get("ziel") and abk in
                    {x for e in liste for x in (e["von"], e["nach"])}})
    raus = {
        "datenstand": stand,
        "zugzahlen_jahr": jahr,
        "quellen": QUELLEN + QUELLEN_BAV + QUELLEN_SWISSTOPO,
        "hinweis": "Abschnitte mit Personenzügen laut zugzahlen, dazu die Linie 261 (BTI) und die Linien "
                   "anderer Bahnen (bav_linien) aus dem Schienennetz des BAV, die die Zugzahlen nicht führen. "
                   "bahn: die Bahn laut Quelle, für die Auswahl «Bahnen» in der App. tlm: Tunnel und Brücken aus swissTLM3D "
                   "auf Abschnitten anderer Bahnen (strecken_geometrie.json, bauwerke). teile: die Linie der SBB, "
                   "auf der der Abschnitt liegt (selten zwei nacheinander), mit Kilometrierung "
                   "(ein Standort, keine Länge). tunnel und bruecken: Kennungen «Linie:Stelle» "
                   "in den Listen der Linienfakten. Ohne teile: keine Tunnel- und Brückendaten; "
                   "linie_bav: die Linie laut Schienennetz des BAV, wenn genau eine beide Enden führt. "
                   "gewicht dient nur der Wegsuche.",
        "linien_bereich": {str(nr): [round(lo, 3), round(hi, 3)] for nr, (lo, hi) in sorted(bereich.items())
                           if any(t["linie"] == nr for e in liste for t in e.get("teile", []))},
        "punkte": {abk: p["name"] for abk, p in sorted(punkte.items())},
        # Breite, Länge: für Abschnitte ohne Linie verbindet der Fahrtmodus die Enden gerade
        "lagen": {abk: list(p["wgs"]) for abk, p in sorted(punkte.items())},
        # Tunnel: km von, km bis (bei unbekannter Richtung beide gleich, siehe tunnel_bereich)
        "tunnel_bereiche": dict(sorted(bereiche.items())),
        "bahnhoefe": {str(u): abk for u, abk in sorted(im_netz.items())},
        "nicht_im_netz": sorted(u for u in namen if u not in im_netz),
        # Art und Name der Bauwerke aus swissTLM3D, für die Zählung auf der Seite «Strecke»
        "tlm_bauwerke": {k: {"art": b["art"], **({"name": b["name"]} if b.get("name") else {})}
                         for k, b in sorted(bauwerke_genutzt.items(), key=lambda x: int(x[0][1:]))},
        # Linien anderer Bahnen aus dem Schienennetz (bav_linien_waehlen), mit Name und Bahn
        "bav_linien": {n: {"name": bav_linien[n]["name"], "bahn": bahn(bav_linien[n]["datenherr"])}
                       for n in sorted(bav_gewaehlt | BAV_OHNE_ZUGZAHLEN, key=int)},
        "abschnitte": liste,
    }
    ZIEL.write_text(json.dumps(raus, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    genutzt = {t["linie"] for e in liste for t in e.get("teile", [])}
    geometrie_schreiben(wgs, genutzt, stand, verlaeufe, bauwerke_genutzt)

    sbb = [e for e in liste if e["isb"] == "SBB"]
    zugeordnet = [e for e in sbb if "teile" in e]
    geteilt = sum(1 for e in sbb if len(e.get("teile", [])) == 2)
    km_sbb = sum(kanten[tuple(sorted((e["von"], e["nach"])))]["km"] for e in sbb)
    km_ohne = sum(k for *_, k in ohne_zuordnung)
    print(f"strecken.json: {len(liste)} Abschnitte, {len(punkte)} Betriebspunkte, "
          f"{len(im_netz)} von {len(namen)} Bahnhöfen im Netz ({ZIEL.stat().st_size/1024:.0f} KB)")
    print(f"  SBB-Abschnitte: {len(zugeordnet)} von {len(sbb)} einer Linie zugeordnet, "
          f"davon {geteilt} auf zwei Linien, ohne Zuordnung ~{km_ohne:.0f} von ~{km_sbb:.0f} km Luftlinie")
    print(f"  andere Bahnen (keine Tunnel- und Brückendaten): {len(liste) - len(sbb)} Abschnitte, "
          f"davon {sum(1 for e in liste if e['isb'] != 'SBB' and 'linie_bav' in e)} mit Linie laut BAV")
    print(f"  davon {nach_lage} mit Verlauf nach der Lage der Enden (verlauf_nach_lage)")
    print(f"  andere Bahnen: {len(verlaeufe)} Abschnitte mit Verlauf laut BAV, {len(bauwerke_genutzt)} "
          f"Bauwerke aus swissTLM3D darauf")
    print(f"  Linien anderer Bahnen aus dem Schienennetz: {len(bav_gewaehlt)}: "
          + ", ".join(f"{n} {bav_linien[n]['name']}" for n in sorted(bav_gewaehlt, key=int)))
    from collections import Counter
    print("  Abschnitte je Bahn: " + ", ".join(f"{b} {z}" for b, z in Counter(e["bahn"] for e in liste).most_common()))
    print(f"strecken_geometrie.json: {len(genutzt)} Linien ({GEOMETRIE.stat().st_size/1024:.0f} KB)")
    for a, b, km in sorted(ohne_zuordnung, key=lambda x: -x[2])[:12]:
        print(f"    ohne Zuordnung: {punkte[a]['name']} – {punkte[b]['name']} ({km:.1f} km)")


if __name__ == "__main__":
    assert all(q in DATASETS for q in QUELLEN), "Quelle fehlt in sources.py"
    main()
