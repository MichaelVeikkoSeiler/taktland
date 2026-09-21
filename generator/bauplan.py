#!/usr/bin/env python3
"""Trägt neue Bahnhöfe in den Bauplan ein, mit einem Vorschlag für die zweite
Stammdaten-Frage. Der Vorschlag wird beim Lesen geprüft und bei Bedarf im
Bauplan von Hand geändert.

    python generator/bauplan.py 8502226 8506300     # eintragen und Vorschläge zeigen

Regel für die Frage, in dieser Reihenfolge:

1. Gemeinde, wenn sie nicht im Namen des Bahnhofs steckt (Rotkreuz liegt in
   Risch). Falsche Antworten: die Gemeinden der nächstgelegenen Bahnhöfe.
2. Bezirk, wenn der Kanton mindestens vier Bezirke hat und der Bezirk nicht
   im Namen steckt (Thalwil liegt im Bezirk Horgen). Falsche Antworten: die
   Bezirke der nächstgelegenen Bahnhöfe im selben Kanton.
3. Sonst die Abkürzung, mit den Abkürzungen der zwei nächstgelegenen Bahnhöfe.

Die Antwort darf nicht im Namen stecken («In welchem Bezirk liegt Meilen?»
prüft nichts). Die falschen Antworten sind echte Namen aus den Fakten.
"""
import collections
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bauen import plan_laden, plan_speichern  # noqa: E402
from taktland import FACTS, geschenkt  # noqa: E402


def alle_fakten():
    fs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(FACTS.glob("*.json"))]
    return [f for f in fs if f.get("stammdaten") and f["steckbrief"].get("lat")]


def nach_naehe(f, alle):
    a = f["steckbrief"]
    return sorted((g for g in alle if g["uic"] != f["uic"]),
                  key=lambda g: math.hypot(g["steckbrief"]["lat"] - a["lat"],
                                           (g["steckbrief"]["lon"] - a["lon"]) * 0.67))


def vorschlag(f, alle):
    """Eintrag für den Bauplan, oder {} ohne Stammdaten."""
    st = f.get("stammdaten")
    if not st:
        return {}
    nah = nach_naehe(f, alle)

    def sammeln(feld, n, passt=lambda g: True):
        raus = []
        for g in nah:
            x = g["stammdaten"].get(feld)
            if x and x != st[feld] and x not in raus and passt(g):
                raus.append(x)
            if len(raus) == n:
                break
        return raus

    gem = st.get("gemeinde")
    if gem and not geschenkt(gem, f["name"]):
        return {"stammdaten": {"frage": "gemeinde", "distraktoren": sammeln("gemeinde", 3)}}
    bezirke = {g["stammdaten"]["bezirk"] for g in alle
               if g["stammdaten"].get("kanton") == st.get("kanton") and g["stammdaten"].get("bezirk")}
    if st.get("bezirk") and len(bezirke) >= 4 and not geschenkt(st["bezirk"], f["name"]):
        d = sammeln("bezirk", 3, lambda g: g["stammdaten"].get("kanton") == st["kanton"])
        return {"stammdaten": {"frage": "bezirk", "distraktoren": d}}
    return {"stammdaten": {"frage": "abkuerzung", "distraktoren": sammeln("abkuerzung", 2)}}


def main():
    uics = [a for a in sys.argv[1:] if a.isdigit()]
    if not uics:
        print(__doc__)
        return 1
    alle = alle_fakten()
    nach_uic = {str(f["uic"]): f for f in alle}
    plan = plan_laden()
    for u in uics:
        if u in plan:
            print(f"{u}  steht schon im Bauplan")
            continue
        f = nach_uic.get(u) or json.loads((FACTS / f"{u}.json").read_text(encoding="utf-8"))
        plan[u] = vorschlag(f, alle)
        s = plan[u].get("stammdaten")
        print(f"{u}  {f['name']:<26}" + (f"{s['frage']:<11}{f['stammdaten'][s['frage']]:<22}"
                                          f"← {', '.join(s['distraktoren'])}" if s else "ohne Stammdaten"))
    plan_speichern(plan)
    return 0


if __name__ == "__main__":
    sys.exit(main())
