#!/usr/bin/env python3
"""Stellt die Daten fuer die App bereit: app/public/data/

- index.json  : alle SBB-Bahnhoefe, mit Angabe ob ein Profil vorliegt
- profile/    : die fertigen Profile
- linien.json : die Linien mit Seite, und welcher Bahnhof auf welcher liegt
- linien/     : die fertigen Linienprofile

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
        })
    eintraege.sort(key=lambda e: (e["dwv"] or 0), reverse=True)

    index = {
        "stand": max(json.loads(f.read_text(encoding="utf-8"))["datenstand"]
                     for f in FACTS.glob("*.json")),
        "bahnhoefe_gesamt": len(eintraege),
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
        })
        for it in f["bahnhoefe"]["items"]:
            nach_bahnhof.setdefault(str(it["uic"]), []).append(d["linie"])
    verzeichnis = {"stand": max(staende) if staende else None, "linien": eintraege,
                   "nach_bahnhof": nach_bahnhof}
    (ZIEL / "linien.json").write_text(json.dumps(verzeichnis, ensure_ascii=False), encoding="utf-8")
    print(f"linien.json: {len(eintraege)} Linien, {len(nach_bahnhof)} Bahnhöfe verknüpft")


if __name__ == "__main__":
    main()
