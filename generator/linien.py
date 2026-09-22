#!/usr/bin/env python3
"""Baut und prüft die Linienseiten.

Wie bei den Bahnhöfen ist ein Profil ein Ergebnis: Es entsteht aus
data/linien/{nr}.json (pipeline/build_linien.py) und dem Baukasten in
linien_baukasten.py und wird nie von Hand geändert.

    python generator/linien.py 600 --zeigen      # bauen und lesen, nichts speichern
    python generator/linien.py --alle            # alle Linienprofile bauen
    python generator/linien.py --alle --pruefen  # würde ein Neubau etwas ändern?
    python generator/linien.py --validieren      # gespeicherte Profile gegen die Fakten prüfen
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import linien_baukasten as lb  # noqa: E402
from bauen import kennungen, ohne_datum, unterschiede  # noqa: E402
from baukasten import zeigen as zeigen_bahnhof  # noqa: E402
from belegt import Bericht, Faktenbasis  # noqa: E402
from taktland import FACTS, LAENGE_STATT_STANDORT, pruefe_kapitel, pruefe_rahmen  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PROFILE = ROOT / "data" / "linienprofile"

FELDER = ("linie", "name", "lang", "generated", "sources", "chapters", "luecken", "listen")

#: Ganze Listen für die Seiten hinter den Kacheln «Erfasste Tunnel» usw.
#: Unverändert aus den Fakten übernommen und so geprüft.
LISTEN = ("tunnel", "bruecken", "bahnuebergaenge")

#: Höchstens so viele Fragen je Kapitel. Mehr hiesse, dieselben Werte
#: mehrfach abzufragen.
FRAGEN_JE_KAPITEL = 3


def bauen(nr):
    f = lb.fakten(nr)
    kap = [lb.BAUER[k](f) for k in f["verfuegbare_kapitel"]]
    d = {"linie": f["linie"], "name": f["name"], "lang": "de",
         "generated": str(date.today()), "chapters": kap, "luecken": f["luecken"]}
    kennungen(d)
    d["sources"] = sorted({x["source"] for k in kap for x in k.get("facts", [])})
    listen = {art: f[art]["items"] for art in LISTEN if f.get(art)}
    if listen:
        d["listen"] = listen
    return {k: d[k] for k in FELDER if k in d}


def pfad(nr):
    return PROFILE / f"{nr}.de.json"


def speichern(d):
    p = pfad(d["linie"])
    if p.exists() and ohne_datum(json.loads(p.read_text(encoding="utf-8"))) == ohne_datum(d):
        return False
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    return True


def zeigen(d):
    zeigen_bahnhof({**d, "uic": f"Linie {d['linie']}"})


def pruefe_linie(profil, fakten):
    """Dieselben Kapitelprüfungen wie bei den Bahnhöfen, dazu was nur für
    Linien gilt."""
    fb = Faktenbasis(fakten)
    b = Bericht(f"Linie {profil.get('linie', '?')}")
    for feld in ("linie", "name", "lang", "chapters"):
        if feld not in profil:
            b.fehlt("Profil", f"Feld '{feld}' fehlt")
    if b.fehler:
        return b
    if profil["linie"] != fakten["linie"] or profil["name"] != fakten["name"]:
        b.fehlt("Profil", "Nummer oder Name passt nicht zu den Fakten")
    pruefe_rahmen(profil, fakten, b)
    pruefe_kapitel(profil, fakten, fb, b)

    # Die Listen hinter den Kacheln: genau die Einträge der Fakten, nicht mehr
    # und nicht weniger
    listen = profil.get("listen") or {}
    for art in LISTEN:
        soll = (fakten.get(art) or {}).get("items")
        if soll and listen.get(art) != soll:
            b.fehlt(f"Profil/listen/{art}", "weicht von den Fakten ab oder fehlt. Neu bauen")
        if not soll and art in listen:
            b.fehlt(f"Profil/listen/{art}", "steht nicht in den Fakten")
    for art in set(listen) - set(LISTEN):
        b.fehlt(f"Profil/listen/{art}", "unbekannte Liste")

    # Eine Kachel mit Verweis verspricht so viele Einträge, wie sie zeigt: «Ticino
    # 325 Brücken» führt zu genau 325 Brücken mit Kanton Ticino
    for kap in profil["chapters"]:
        for j, x in enumerate(kap.get("facts", [])):
            if "liste" not in x:
                continue
            wo = f"Kapitel {kap.get('id')}/facts[{j}]"
            eintraege = listen.get(x["liste"])
            if eintraege is None:
                b.fehlt(wo, f"verweist auf die Liste {x['liste']}, die fehlt")
                continue
            # Eine Einzelkachel («Viadukt in Brunnen, 8 Baueinheiten») führt zu
            # ihrem Eintrag: Die Stelle muss die sein, auf die der factRef zeigt,
            # und der Eintrag muss so heissen wie die Kachel
            if "eintrag" in x:
                i = x["eintrag"]
                if not (isinstance(i, int) and 0 <= i < len(eintraege)):
                    b.fehlt(wo, f"Eintrag {i} gibt es in der Liste {x['liste']} nicht")
                elif not x.get("factRef", "").startswith(f"{x['liste']}.items[{i}]."):
                    b.fehlt(wo, f"Eintrag {i}, aber factRef {x.get('factRef')}")
                elif not str(x.get("label", "")).startswith(str(eintraege[i].get("name"))):
                    b.fehlt(wo, f"«{x.get('label')}» führt zu «{eintraege[i].get('name')}»")
                continue
            if x.get("filter"):
                feld, wert = x["filter"]["feld"], x["filter"]["wert"]
                eintraege = [e for e in eintraege if e.get(feld) == wert]
            if len(eintraege) != x.get("value"):
                b.fehlt(wo, f"die Kachel zeigt {x.get('value')}, die Liste dahinter hat "
                            f"{len(eintraege)} Einträge")

    for kap in profil["chapters"]:
        wo = f"Kapitel {kap.get('id')}"
        if len(kap.get("questions", [])) > FRAGEN_JE_KAPITEL:
            b.fehlt(wo, f"{len(kap['questions'])} Fragen, höchstens {FRAGEN_JE_KAPITEL}")
        if kap.get("id") == "strecke":
            # Die Kilometrierung ist ein Standort. Die Länge der Linie steht
            # nicht in den Daten (Linie 210 beginnt bei km 19.115).
            texte = [("body", kap.get("body", ""))]
            texte += [(f"facts[{j}]/label", x.get("label") or "") for j, x in enumerate(kap.get("facts", []))]
            texte += [(f"questions[{i}]/{t}", q.get(t) or "") for i, q in enumerate(kap.get("questions", []))
                      for t in ("prompt", "explanation")]
            for stelle, text in texte:
                if m := re.search(LAENGE_STATT_STANDORT, text, re.I):
                    b.fehlt(f"{wo}/{stelle}", f"«{m.group(0)}»: die Kilometrierung ist ein "
                                              "Standort. Die Länge der Linie steht nicht in den Daten")
        # Anfang und Ende führen zum Bahnhof, den die Pipeline über die Nummer
        # zugeordnet hat
        for j, x in enumerate(kap.get("facts", [])):
            if "bahnhof" not in x:
                continue
            feld = x.get("factRef", "").rsplit(".", 1)[-1]
            if not (FACTS / f"{x['bahnhof']}.json").exists():
                b.fehlt(f"{wo}/facts[{j}]", f"Bahnhof {x['bahnhof']} gibt es nicht")
            elif (fakten.get("strecke") or {}).get(f"{feld}_uic") != x["bahnhof"]:
                b.fehlt(f"{wo}/facts[{j}]", f"{x.get('value')} führt zu einem anderen Bahnhof "
                                            "als in den Fakten")
        # Ein Bahnhof in der Liste führt zu seiner Seite: Er muss es geben,
        # und er muss der sein, auf den der factRef zeigt
        for j, x in enumerate(kap.get("facts", [])):
            if "uic" not in x:
                continue
            if not (FACTS / f"{x['uic']}.json").exists():
                b.fehlt(f"{wo}/facts[{j}]", f"Bahnhof {x['uic']} gibt es nicht")
            try:
                eintrag = fb.aufloesen(x["factRef"].rsplit(".", 1)[0])
            except KeyError:
                continue
            if eintrag.get("uic") != x["uic"] or eintrag.get("name") != x.get("label"):
                b.fehlt(f"{wo}/facts[{j}]", f"{x.get('label')} zeigt auf einen anderen Bahnhof")
    return b


def validieren():
    schlecht = 0
    pfade = sorted(PROFILE.glob("*.json"))
    for p in pfade:
        profil = json.loads(p.read_text(encoding="utf-8"))
        quelle = lb.LINIEN / f"{profil.get('linie')}.json"
        if not quelle.exists():
            print(f"✗ {p.name}: keine Faktendatei")
            schlecht += 1
            continue
        b = pruefe_linie(profil, json.loads(quelle.read_text(encoding="utf-8")))
        print(b.zusammenfassung().replace(b.name, p.name + "  " + b.name, 1))
        for zeile in b.zeilen():
            print(zeile)
        schlecht += not b.ok
    # jede Linie mit Fakten hat ein Profil, und kein Profil ohne Fakten
    fakten = {p.stem for p in lb.LINIEN.glob("*.json")}
    profile = {p.name.split(".")[0] for p in pfade}
    for nr in sorted(fakten - profile, key=int):
        print(f"✗ Linie {nr}: Fakten ohne Profil. Mit --alle bauen")
        schlecht += 1
    return 1 if schlecht else 0


def main():
    if "--validieren" in sys.argv:
        return validieren()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    nummern = sorted((p.stem for p in lb.LINIEN.glob("*.json")), key=int) if "--alle" in sys.argv else args
    if not nummern:
        print(__doc__)
        return 1
    PROFILE.mkdir(parents=True, exist_ok=True)
    pruefen = "--pruefen" in sys.argv
    geaendert = 0
    for nr in nummern:
        d = bauen(nr)
        if "--zeigen" in sys.argv:
            zeigen(d)
            continue
        p = pfad(nr)
        alt = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        if ohne_datum(alt) == ohne_datum(d):
            continue
        geaendert += 1
        print(f"Linie {nr:<6}{'neu' if not alt else '; '.join(unterschiede(alt, d))}")
        if not pruefen:
            speichern(d)
    if not pruefen and "--alle" in sys.argv:
        # Profile ohne Fakten entfernen, etwa wenn eine Linie unter zwei Bahnhöfe fällt
        for p in PROFILE.glob("*.json"):
            if not (lb.LINIEN / f"{p.name.split('.')[0]}.json").exists():
                p.unlink()
                print(f"entfernt: {p.name}")
    if "--zeigen" not in sys.argv:
        print(f"\n{geaendert} von {len(nummern)} Linienprofilen "
              f"{'würden sich ändern' if pruefen else 'neu gebaut'}")
    return 1 if pruefen and geaendert else 0


if __name__ == "__main__":
    sys.exit(main())
