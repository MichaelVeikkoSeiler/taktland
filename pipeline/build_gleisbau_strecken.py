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
]


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
    return 0


if __name__ == "__main__":
    sys.exit(main())
