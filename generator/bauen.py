#!/usr/bin/env python3
"""Baut Profile aus den Fakten und dem Bauplan.

Ein Profil ist ein Ergebnis, kein Werkstück. Wer etwas ändern will, ändert
den Baukasten, die Fakten oder den Bauplan und baut neu. So wirkt eine neue
Regel mit einem Befehl auf alle Bahnhöfe, und neue Jahreszahlen brauchen
keine Handarbeit.

    python generator/bauen.py 8502218              # bauen und speichern
    python generator/bauen.py 8502218 --zeigen     # nur zeigen, nichts speichern
    python generator/bauen.py --alle --pruefen     # welche Profile würden sich ändern?
    python generator/bauen.py --alle               # alle Profile im Bauplan neu bauen

Der Bauplan (data/bauplan.json) hält fest, was pro Bahnhof von Hand
entschieden ist, und nur das:

    "8506020": {"stammdaten": {"frage": "abkuerzung", "distraktoren": ["SE", "SZH"]}}

- stammdaten: welche zweite Frage (abkuerzung, bezirk, gemeinde, kanton) und
  welche falschen Antworten. Ohne Eintrag gibt es nur die Frage zur Höhe.
- steckbrief: extra_body (ein Satz mehr), extra_fragen (von Hand geschriebene
  Fragen, etwa zu einer längeren Bemerkung der Quelle).
- ein Kapitel mit null: wird ausgelassen.

Ein Bahnhof mit Profil steht im Bauplan, auch wenn nichts zu entscheiden war
({}). Der Bauplan ist damit auch die Liste dessen, was gebaut wird.
"""
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import baukasten as b  # noqa: E402
from ausstattung_kapitel import einfuegen  # noqa: E402
from distraktoren_richten import richten  # noqa: E402
from taktland import PROFILES, fakten_laden  # noqa: E402

BAUPLAN = Path(__file__).resolve().parent.parent / "data" / "bauplan.json"

#: Reihenfolge der Felder im gespeicherten Profil
FELDER = ("uic", "name", "tier", "lang", "dataYear", "generated", "sources",
          "chapters", "luecken", "gleise")


def plan_laden():
    return json.loads(BAUPLAN.read_text(encoding="utf-8"))


def plan_speichern(plan):
    plan = {k: plan[k] for k in sorted(plan)}
    BAUPLAN.write_text(json.dumps(plan, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def bauen(uic, eintrag=None):
    """Das fertige Profil, so wie es in data/profiles liegen soll."""
    if eintrag is None:
        eintrag = plan_laden()[str(uic)]
    d = b.profil(int(uic), **eintrag)
    f = fakten_laden(d["uic"])
    einfuegen(d, f)        # Kapitel Ausstattung hinter services
    richten(d, f)          # keine falsche Antwort, die anderswo richtig ist
    # Die Gleisfrage zum Antippen braucht das Schema im Profil. Fehlte es,
    # zeigte die App bei 49 Bahnhöfen «Zu diesem Bahnhof liegt kein Schema vor».
    if any(q["type"] == "hotspot" for k in d["chapters"] for q in k["questions"]):
        d["gleise"] = f["gleise"]["items"]
    kennungen(d)
    # Quellen erst am Schluss: auch das Kapitel Ausstattung hat eine
    d["sources"] = sorted({x["source"] for k in d["chapters"] for x in k.get("facts", [])})
    return {k: d[k] for k in FELDER if k in d}


def kennungen(d):
    """Jede Frage bekommt eine feste Kennung aus Kapitel, Art, factRef und
    Wortlaut. Die App merkte sich Antworten nach der Stelle («steckbrief:0»);
    fiel eine Frage weg, hing die alte Antwort an der nächsten. Ändert sich
    eine Frage, ändert sich ihre Kennung, und die alte Antwort gilt nicht mehr."""
    for k in d["chapters"]:
        vergeben = set()
        for j, q in enumerate(k["questions"]):
            q.pop("id", None)
            roh = json.dumps([q["type"], q.get("factRef"), q.get("prompt")], ensure_ascii=False)
            kennung = f"{k['id']}:{hashlib.sha1(roh.encode()).hexdigest()[:8]}"
            while kennung in vergeben:          # gleiche Frage zweimal im Kapitel
                kennung += "+"
            vergeben.add(kennung)
            k["questions"][j] = {"id": kennung, **q}


def ohne_datum(d):
    return {k: v for k, v in d.items() if k != "generated"}


def pfad(uic):
    return PROFILES / f"{uic}.de.json"


def speichern(d):
    """Schreibt nur, wenn sich inhaltlich etwas ändert. Das Datum bleibt sonst
    stehen, damit ein Neubau ohne Änderung keine Spuren hinterlässt."""
    p = pfad(d["uic"])
    if p.exists():
        alt = json.loads(p.read_text(encoding="utf-8"))
        if ohne_datum(alt) == ohne_datum(d):
            return False
    d = {**d, "generated": str(date.today())}
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    return True


def unterschiede(alt, neu):
    """Kurze Liste, was sich zwischen zwei Fassungen eines Profils ändert."""
    raus = []
    for feld in ("sources", "luecken", "gleise"):
        if alt.get(feld) != neu.get(feld):
            raus.append(feld)
    ka = {k["id"]: k for k in alt.get("chapters", [])}
    kn = {k["id"]: k for k in neu.get("chapters", [])}
    for kid in [*kn, *[k for k in ka if k not in kn]]:
        if kid not in ka:
            raus.append(f"{kid} neu")
        elif kid not in kn:
            raus.append(f"{kid} entfällt")
        elif ka[kid] != kn[kid]:
            teile = [t for t in ("title", "body", "erlaeuterung", "facts") if ka[kid].get(t) != kn[kid].get(t)]
            qa, qn = ka[kid]["questions"], kn[kid]["questions"]
            if qa != qn:
                teile.append(f"Fragen {len(qa)}→{len(qn)}" if len(qa) != len(qn) else "Fragen")
            raus.append(f"{kid} ({', '.join(teile)})")
    if [k["id"] for k in alt.get("chapters", [])] != [k["id"] for k in neu.get("chapters", [])] \
            and set(ka) == set(kn):
        raus.append("Reihenfolge der Kapitel")
    return raus


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    plan = plan_laden()
    uics = sorted(plan) if "--alle" in sys.argv else args
    if not uics:
        print(__doc__)
        return 1
    fehlt = [u for u in uics if u not in plan]
    if fehlt:
        print(f"Nicht im Bauplan: {', '.join(fehlt)}. Zuerst dort eintragen.")
        return 1
    pruefen = "--pruefen" in sys.argv
    geaendert = 0
    for u in uics:
        d = bauen(u, plan[u])
        if "--zeigen" in sys.argv:
            b.zeigen(d)
            continue
        p = pfad(u)
        alt = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        if ohne_datum(alt) == ohne_datum(d):
            continue
        geaendert += 1
        print(f"{d['name']:<28}{'neu' if not alt else '; '.join(unterschiede(alt, d))}")
        if not pruefen:
            speichern(d)
    if "--zeigen" not in sys.argv:
        print(f"\n{geaendert} von {len(uics)} Profilen "
              f"{'würden sich ändern' if pruefen else 'neu gebaut'}")
    return 1 if pruefen and geaendert else 0


if __name__ == "__main__":
    sys.exit(main())
