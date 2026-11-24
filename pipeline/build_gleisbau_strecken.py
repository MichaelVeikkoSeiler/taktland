"""
Echte Strecken als Aufgaben für den Gleisbau (Michael, 2026-11-23, Vorschlag «Echte Strecken nachbauen»): je Strecke einige Bahnhöfe der Reihe
nach und je Paar die Zahl der Tunnel und Brücken auf dem Weg dazwischen, so wie die App den Weg im Netz sucht (generator/strecken.py, weg). SBB-Linien
nach den Tunneln und Brücken der SBB, andere Bahnen nach den Bauwerken aus swissTLM3D (Tunnel und Galerien, Brücken). Welche Strecken und
Bahnhöfe, ist gewählt; die Zahlen stammen aus data/strecken.json. Schreibt app/src/assets/gleisbau-strecken.json.
"""
import json
import sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WURZEL / "generator"))
import strecken  # noqa: E402

# gewählt: bekannte Strecken, je drei oder vier Bahnhöfe
STRECKEN = [
    ("Gotthard-Bergstrecke", ["Erstfeld", "Göschenen", "Airolo", "Biasca"]),
    ("Lötschberg-Bergstrecke", ["Frutigen", "Kandersteg", "Goppenstein", "Brig"]),
    ("Albulalinie", ["Thusis", "Filisur", "Preda", "Samedan"]),
    ("Brig–Zermatt", ["Brig", "Visp", "Stalden-Saas", "Zermatt"]),
    ("Berninalinie", ["Pontresina", "Alp Grüm", "Poschiavo", "Campocologno"]),
    ("Brünig", ["Luzern", "Giswil", "Brünig-Hasliberg", "Meiringen"]),
    ("Bern–Interlaken", ["Bern", "Thun", "Spiez", "Interlaken Ost"]),
    ("Genfersee", ["Lausanne", "Montreux", "Sion", "Brig"]),
    # seit 2026-11-24 dazu (Michael: «Mehr "Echte Strecken nachbauen" vorschlagen»), gewählt
    ("Zürich–St. Gallen", ["Zürich HB", "Winterthur", "Wil SG", "St. Gallen"]),
    ("Hauenstein", ["Basel SBB", "Liestal", "Sissach", "Olten"]),
    ("Genève–Lausanne", ["Genève", "Nyon", "Morges", "Lausanne"]),
    ("Jurasüdfuss", ["Neuchâtel", "Biel/Bienne", "Grenchen Süd", "Solothurn"]),
    ("Prättigau", ["Landquart", "Klosters Platz", "Davos Platz"]),
    ("Montreux–Zweisimmen", ["Montreux", "Les Avants", "Montbovon", "Zweisimmen"]),
    ("Luzern–Engelberg", ["Luzern", "Stans", "Wolfenschiessen", "Engelberg"]),
    ("Furka–Oberalp", ["Disentis/Mustér", "Andermatt", "Oberwald"]),
    ("Monte Ceneri", ["Bellinzona", "Lugano", "Mendrisio", "Chiasso"]),
    ("Linkes Zürichseeufer", ["Zürich HB", "Thalwil", "Wädenswil", "Ziegelbrücke"]),
    ("Thurtal", ["Winterthur", "Frauenfeld", "Weinfelden", "Romanshorn"]),
    ("Fribourg–Lausanne", ["Fribourg/Freiburg", "Romont FR", "Palézieux", "Lausanne"]),
    ("Unterengadin", ["Samedan", "Zernez", "Scuol-Tarasp"]),
    ("Jura", ["Biel/Bienne", "Moutier", "Delémont", "Porrentruy"]),
    ("Rhonetal", ["St-Maurice", "Martigny", "Sierre/Siders", "Visp"]),
]

# Varianten je Bahnhof (Michael, 2026-11-24: «Man kann auch Bahnhöfe eingeben dann gibt es echte Varianten in unterschiedliche Richtungen»): von jedem
# Bahnhof in jede Richtung des Netzes die nächsten Bahnhöfe mit eigener Seite in Taktland, an Verzweigungen auf derselben Linie weiter, sonst möglichst
# gerade (gewählt); höchstens VARIANTE_BAHNHOEFE Bahnhöfe nach dem Start
VARIANTE_BAHNHOEFE = 3
VARIANTE_SCHRITTE = 60


def zaehlen(n, w):
    """Tunnel und Brücken auf einem Weg wie in den Aufgaben"""
    tlm = n["tlm_bauwerke"]
    tunnel, bruecken = strecken.entlang(w)
    t_tlm = {i for e in w for i in e.get("tlm", []) if tlm[i]["art"] in ("tunnel", "galerie")}
    b_tlm = {i for e in w for i in e.get("tlm", []) if tlm[i]["art"] in ("bruecke", "gedeckte_bruecke")}
    ohne = sum(1 for e in w if not e.get("teile") and not e.get("tlm"))
    return len(tunnel) + len(t_tlm), len(bruecken) + len(b_tlm), ohne


def varianten(n, name_von_uic):
    """je Bahnhof die Richtungen: Liste [Bahnhöfe ab dem Start], [Tunnel, Brücken, lückenhaft je Paar]"""
    import math
    abk_name = {abk: name_von_uic[int(u)] for u, abk in n["bahnhoefe"].items() if int(u) in name_von_uic}
    nachbarn = {}
    for e in n["abschnitte"]:
        nachbarn.setdefault(e["von"], []).append((e["nach"], e))
        nachbarn.setdefault(e["nach"], []).append((e["von"], e))
    lage = n["lagen"]
    linie = lambda e: (e.get("teile") or [{}])[0].get("linie")

    def richtung(a, b):
        (y0, x0), (y1, x1) = lage[a], lage[b]
        return math.atan2(y1 - y0, (x1 - x0) * math.cos(math.radians(y0)))

    raus = {}
    for start, start_name in abk_name.items():
        liste, gesehen_folgen = [], set()
        for v0, e0 in nachbarn.get(start, []):
            folge, teile, weg_seit = [start_name], [], [e0]
            vor, jetzt, kante, besucht = start, v0, e0, {start, v0}
            for _ in range(VARIANTE_SCHRITTE):
                if jetzt in abk_name:
                    folge.append(abk_name[jetzt]); teile.append(list(zaehlen(n, weg_seit))); weg_seit = []
                    if len(folge) > VARIANTE_BAHNHOEFE:
                        break
                weiter = [(w, e) for w, e in nachbarn.get(jetzt, []) if w not in besucht]
                if not weiter:
                    break
                gleiche = [x for x in weiter if linie(x[1]) is not None and linie(x[1]) == linie(kante)]
                if gleiche:
                    weiter = gleiche
                r0 = richtung(vor, jetzt)
                w, e = min(weiter, key=lambda x: abs((richtung(jetzt, x[0]) - r0 + math.pi) % (2 * math.pi) - math.pi))
                vor, jetzt, kante = jetzt, w, e
                besucht.add(w); weg_seit.append(e)
            if len(folge) >= 3 and tuple(folge) not in gesehen_folgen:
                gesehen_folgen.add(tuple(folge))
                liste.append([folge, [x for t in teile for x in t]])
        if liste:
            raus[start_name] = liste
    return raus


def main():
    n = strecken.laden()
    namen = {}
    for p in strecken.FACTS.glob("*.json"):
        namen.setdefault(json.loads(p.read_text(encoding="utf-8"))["name"], int(p.stem))
    tlm = n["tlm_bauwerke"]
    raus = []
    for titel, bahnhoefe in STRECKEN:
        teile = []
        for a, b in zip(bahnhoefe, bahnhoefe[1:]):
            w = strecken.weg(n, namen[a], namen[b])
            if w is None:
                raise SystemExit(f"kein Weg {a} – {b}")
            tunnel, bruecken = strecken.entlang(w)
            t_tlm = {i for e in w for i in e.get("tlm", []) if tlm[i]["art"] in ("tunnel", "galerie")}
            b_tlm = {i for e in w for i in e.get("tlm", []) if tlm[i]["art"] in ("bruecke", "gedeckte_bruecke")}
            ohne = sum(1 for e in w if not e.get("teile") and not e.get("tlm"))
            teile.append({"tunnel": len(tunnel) + len(t_tlm), "bruecken": len(bruecken) + len(b_tlm), "ohne_daten": ohne})
        raus.append({"titel": titel, "bahnhoefe": bahnhoefe, "teile": teile})
        print(titel, " | ".join(f"{t['tunnel']} T, {t['bruecken']} B{' (lückenhaft)' if t['ohne_daten'] else ''}" for t in teile))
    ziel = WURZEL / "app/src/assets/gleisbau-strecken.json"
    ziel.write_text(json.dumps({"quelle": "data/strecken.json", "datenstand": n["datenstand"], "strecken": raus}, ensure_ascii=False, indent=1), encoding="utf-8")
    name_von_uic = {u: name for name, u in namen.items()}
    v = varianten(n, name_von_uic)
    ziel_v = WURZEL / "app/src/assets/gleisbau-varianten.json"
    ziel_v.write_text(json.dumps({"datenstand": n["datenstand"], "varianten": v}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(v), "Bahnhöfe mit Varianten,", sum(len(x) for x in v.values()), "Varianten,", ziel_v.stat().st_size // 1024, "KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
