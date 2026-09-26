#!/usr/bin/env python3
"""Stellt die Daten fuer die App bereit: app/public/data/

- index.json  : alle SBB-Bahnhoefe, mit Angabe ob ein Profil vorliegt
- profile/    : die fertigen Profile
- linien.json : die Linien mit Seite, und welcher Bahnhof auf welcher liegt
- linien/     : die fertigen Linienprofile
- tunnel.json, bruecken.json : alle erfassten Tunnel und Brücken mit ihrer Linie
- strecken.json : das Netz für die Seite «Strecke»
- standort.json : die Lage der Tunnel, Brücken und Bahnübergänge für die Seite «Standort»

Der Index fuehrt auch Bahnhoefe ohne Profil auf. Die App soll zeigen, was es
noch nicht gibt, statt so zu tun, als gaebe es nur die vier fertigen.
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "data" / "facts"
PROFILES = ROOT / "data" / "profiles"
LINIEN = ROOT / "data" / "linien"
LINIENPROFILE = ROOT / "data" / "linienprofile"
ZIEL = ROOT / "app" / "public" / "data"


def main():
    (ZIEL / "profile").mkdir(parents=True, exist_ok=True)
    for alt in (ZIEL / "profile").glob("*.json"):
        alt.unlink()

    # die Vergleichsdaten unveraendert mitnehmen, die App baut daraus Fragen
    quelle = ROOT / "data" / "vergleich.json"
    if quelle.exists():
        shutil.copy(quelle, ZIEL / "vergleich.json")

    mit_profil = {}
    for p in PROFILES.glob("*.json"):
        d = json.loads(p.read_text(encoding="utf-8"))
        mit_profil.setdefault(str(d["uic"]), []).append(d["lang"])
        shutil.copy(p, ZIEL / "profile" / p.name)

    # Bahnhöfe, von denen die Seite «Strecke» einen Weg kennt
    netz = ROOT / "data" / "strecken.json"
    im_netz = set(json.loads(netz.read_text(encoding="utf-8"))["bahnhoefe"]) if netz.exists() else set()
    eintraege = []
    for f in sorted(FACTS.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        sb = d["steckbrief"]
        eintraege.append({
            "uic": d["uic"],
            "name": d["name"],
            "kanton": d["kanton"],
            "tier": d["tier"],
            "dwv": sb.get("dwv"),
            "lat": sb.get("lat"),
            "lon": sb.get("lon"),
            "sprachen": sorted(mit_profil.get(str(d["uic"]), [])),
            # die Bahn, die die Infrastruktur betreibt, wenn es nicht die SBB ist:
            # die App kennzeichnet diese Bahnhöfe
            **({"isb": sb["isb"]} if sb.get("isb") and sb["isb"] != "SBB" else {}),
            "im_netz": str(d["uic"]) in im_netz,
            # alle Linien, auf denen der Bahnhof erfasst ist, mit oder ohne eigene
            # Seite; fehlt das Feld, führen die Daten zu den Linien ihn nicht
            **({"linien": [it["nummer"] for it in d["linien"]["items"]]}
               if d.get("linien") and d["linien"].get("items") else {}),
        })
    eintraege.sort(key=lambda e: (e["dwv"] or 0), reverse=True)

    # gezählt hier, nicht im Text der Startseite
    uebersicht = uebersicht_daten()
    index = {
        "stand": max(json.loads(f.read_text(encoding="utf-8"))["datenstand"]
                     for f in FACTS.glob("*.json")),
        "bahnhoefe_gesamt": len(eintraege),
        "zahlen": {"linien": len(list(LINIENPROFILE.glob("*.json"))),
                   "tunnel": len(uebersicht["tunnel"]["eintraege"]),
                   "bruecken": len(uebersicht["bruecken"]["eintraege"])},
        "mit_profil": sum(1 for e in eintraege if e["sprachen"]),
        "quelle": "data.sbb.ch",
        "bahnhoefe": eintraege,
    }
    (ZIEL / "index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    groesse = (ZIEL / "index.json").stat().st_size
    print(f"index.json: {len(eintraege)} Bahnhöfe, davon {index['mit_profil']} mit Profil "
          f"({groesse/1024:.0f} KB)")
    print(f"profile/: {len(list((ZIEL / 'profile').glob('*.json')))} Dateien")
    linien()
    uebersichten()
    # das Streckennetz unverändert, geprüft mit generator/strecken.py
    for name in ("strecken.json", "strecken_geometrie.json", "karte.json", "standort.json", "seen.json"):
        quelle = ROOT / "data" / name
        if quelle.exists():
            shutil.copy(quelle, ZIEL / name)
            print(f"{name}: {(ZIEL / name).stat().st_size/1024:.0f} KB")


def linien():
    """Das Verzeichnis der Linienseiten. nach_bahnhof führt von der
    Bahnhofsseite zu den Linien, auf denen der Bahnhof erfasst ist."""
    (ZIEL / "linien").mkdir(parents=True, exist_ok=True)
    for alt in (ZIEL / "linien").glob("*.json"):
        alt.unlink()
    eintraege, nach_bahnhof, staende = [], {}, []
    for p in sorted(LINIENPROFILE.glob("*.json"), key=lambda x: int(x.name.split(".")[0])):
        d = json.loads(p.read_text(encoding="utf-8"))
        f = json.loads((LINIEN / f"{d['linie']}.json").read_text(encoding="utf-8"))
        shutil.copy(p, ZIEL / "linien" / p.name)
        staende.append(f["datenstand"])
        eintraege.append({
            "linie": d["linie"],
            "name": d["name"],
            "bahnhoefe": f["bahnhoefe"]["anzahl_in_taktland"],
            "tunnel": (f.get("tunnel") or {}).get("anzahl_erfasst", 0),
            "bruecken": (f.get("bruecken") or {}).get("anzahl_erfasst", 0),
            "bahnuebergaenge": (f.get("bahnuebergaenge") or {}).get("anzahl_erfasst", 0),
            # die Bahn laut Schienennetz des BAV, wenn nicht die SBB; «schienennetz»:
            # die Linie fehlt in den Daten der SBB
            **({"bahn": f["netz"]["bahn"]}
               if f.get("netz") and f["netz"]["bahn"] != "SBB CFF FFS" else {}),
            **({"quelle": "schienennetz"} if f.get("quelle") == "schienennetz" else {}),
            # Bahnhöfe, die nur das Schienennetz des BAV auf dieser Linie führt
            **({"weitere_bahnhoefe": f["weitere_bahnhoefe"]["anzahl"]}
               if f.get("weitere_bahnhoefe") else {}),
        })
        for teil in ("bahnhoefe", "weitere_bahnhoefe"):
            for it in (f.get(teil) or {}).get("items", []):
                if d["linie"] not in nach_bahnhof.setdefault(str(it["uic"]), []):
                    nach_bahnhof[str(it["uic"])].append(d["linie"])
    verzeichnis = {"stand": max(staende) if staende else None, "linien": eintraege,
                   "nach_bahnhof": nach_bahnhof}
    uebersicht = ROOT / "data" / "linien_uebersicht.json"
    if uebersicht.exists():
        u = json.loads(uebersicht.read_text(encoding="utf-8"))
        verzeichnis["nicht_aufgefuehrt"] = {
            "bruecken": u["bruecken_ohne_seite"],
            "bahnuebergaenge": u["bahnuebergaenge_ohne_seite"],
            "linien": u["linien_ohne_seite_mit_bruecken_oder_bahnuebergaengen"],
        }
        # der Name jeder Linie aus «linie», auch ohne eigene Seite
        verzeichnis["namen"] = u["linien_namen"]
    (ZIEL / "linien.json").write_text(json.dumps(verzeichnis, ensure_ascii=False), encoding="utf-8")
    print(f"linien.json: {len(eintraege)} Linien, {len(nach_bahnhof)} Bahnhöfe verknüpft")


def uebersicht_daten():
    """Die Übersichten «Tunnel» und «Brücken»: jeder Eintrag unverändert aus
    den Fakten seiner Linie, dazu die Nummer der Linie. Die Brücken auf Linien
    ohne eigene Seite kommen aus data/linien_uebersicht.json, damit sie nicht
    verloren gehen. generator/tests/test_uebersichten.py prüft beides."""
    linien = {}
    tunnel, bruecken = [], []
    for p in sorted(LINIEN.glob("*.json"), key=lambda x: int(x.stem)):
        f = json.loads(p.read_text(encoding="utf-8"))
        nr = f["linie"]
        linien[str(nr)] = {"name": f["name"], "seite": (LINIENPROFILE / f"{nr}.de.json").exists()}
        tunnel += [{"linie": nr, **it} for it in (f.get("tunnel") or {}).get("items", [])]
        bruecken += [{"linie": nr, **it} for it in (f.get("bruecken") or {}).get("items", [])]
    u = json.loads((ROOT / "data" / "linien_uebersicht.json").read_text(encoding="utf-8"))
    for x in u["bruecken_ohne_seite_liste"]:
        linien[str(x["linie"])] = {"name": x["name"], "seite": False}
        bruecken += [{"linie": x["linie"], **it} for it in x["items"]]
    # der Tag, an dem die eigene Quelle geladen wurde, nicht der neueste aller
    # Quellen der Linien (sonst rückte ein Neuladen von «linie» den Stand vor)
    stand = u["abgerufen"]
    mit_bruecken = {str(b["linie"]) for b in bruecken}
    mit_tunnel = {str(t["linie"]) for t in tunnel}
    return {
        "tunnel": {"stand": stand["tunnel"], "quelle": "tunnel", "eintraege": tunnel,
                   "linien": {k: v for k, v in linien.items() if k in mit_tunnel}},
        "bruecken": {"stand": stand["brucken"], "quelle": "brucken", "eintraege": bruecken,
                     "ohne_seite": u["bruecken_ohne_seite"],
                     "linien": {k: v for k, v in linien.items() if k in mit_bruecken}},
    }


def uebersichten():
    for art, d in uebersicht_daten().items():
        ziel = ZIEL / f"{art}.json"
        ziel.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
        print(f"{art}.json: {len(d['eintraege'])} Einträge auf {len(d['linien'])} Linien "
              f"({ziel.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
