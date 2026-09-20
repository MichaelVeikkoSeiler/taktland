#!/usr/bin/env python3
"""Qualitätsbericht über alle Profile.

Der Validator prüft jedes Profil für sich. Dieses Werkzeug schaut über den
ganzen Bestand: wo häufen sich Warnungen, wiederholen sich Formulierungen,
sind die Fragetypen ausgewogen, welche Profile sollte ein Mensch lesen.

    python generator/qualitaet.py
    python generator/qualitaet.py --stichprobe 8
"""
import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from taktland import PROFILES, fakten_laden, pruefe, umfang_erwartet  # noqa: E402

#: Wendungen, die kein Validator sicher fassen kann, die aber oft auf
#: Weltwissen oder Deutung hindeuten. Für das menschliche Auge, nicht zum Sperren.
VERDACHT = re.compile(
    r"\b(vermutlich|wohl|etwa dort|in der Nähe|unweit|bekanntlich|natürlich|"
    r"selbstverständlich|offensichtlich|wichtig|zentral\b(?!bahn)|bedeutend|"
    r"beliebt|attraktiv|modern|historisch|malerisch|idyllisch|"
    r"Tourist\w*|Pendler\w*|Ausflug\w*|Altstadt|Innenstadt|Zentrum)\b", re.I)


def laden():
    raus = []
    for f in sorted(PROFILES.glob("*.json")):
        profil = json.loads(f.read_text(encoding="utf-8"))
        fakten = fakten_laden(profil["uic"])
        bericht, _ = pruefe(json.loads(json.dumps(profil)), fakten)
        raus.append((f, profil, fakten, bericht))
    return raus


def saetze(profil):
    for kap in profil.get("chapters", []):
        yield kap["id"], "body", kap.get("body", "")
        if kap.get("erlaeuterung"):
            yield kap["id"], "erlaeuterung", kap["erlaeuterung"]
        for i, fr in enumerate(kap.get("questions", [])):
            yield kap["id"], f"q{i}/prompt", fr.get("prompt", "")
            yield kap["id"], f"q{i}/expl", fr.get("explanation", "")


def main():
    alle = laden()
    if not alle:
        print("keine Profile gefunden")
        return 1

    print(f"{'='*74}\nBESTAND\n{'='*74}")
    fehlerhaft = [p for _, p, _, b in alle if not b.ok for p in [p]]
    warnungen = sum(len(b.warnungen) for _, _, _, b in alle)
    fragen = sum(sum(len(k["questions"]) for k in p["chapters"]) for _, p, _, _ in alle)
    print(f"{len(alle)} Profile, {fragen} Fragen")
    print(f"{len(fehlerhaft)} mit Fehlern, {warnungen} Warnungen insgesamt")

    print(f"\n{'='*74}\nWARNUNGEN NACH ART\n{'='*74}")
    arten = collections.Counter()
    for _, p, _, b in alle:
        for w in b.warnungen:
            art = re.sub(r"«[^»]*»", "«…»", w.split(": ", 1)[-1])
            art = re.sub(r"\d+", "N", art)[:70]
            arten[art] += 1
    for art, n in arten.most_common(8):
        print(f"  {n:>4}  {art}")

    print(f"\n{'='*74}\nFRAGETYPEN\n{'='*74}")
    typen = collections.Counter()
    for _, p, _, _ in alle:
        for k in p["chapters"]:
            for fr in k["questions"]:
                typen[fr["type"]] += 1
    for typ, n in typen.most_common():
        print(f"  {typ:<18}{n:>5}  {n / fragen:>5.0%}")
    fehlend = {"single_choice", "multiple_choice", "true_false", "cloze",
               "match", "sort", "hotspot", "slider"} - set(typen)
    if fehlend:
        print(f"  nie verwendet: {', '.join(sorted(fehlend))}")

    print(f"\n{'='*74}\nWIEDERHOLTE SÄTZE\n{'='*74}")
    print("(erwartbar bei Erläuterungen, verdächtig bei Beschreibungen)")
    haeufig = collections.Counter()
    herkunft = collections.defaultdict(set)
    for _, p, _, _ in alle:
        for kid, feld, text in saetze(p):
            for satz in re.split(r"(?<=[.!?])\s+", text or ""):
                satz = satz.strip()
                if len(satz) > 45:
                    haeufig[satz] += 1
                    herkunft[satz].add(p["name"])
    for satz, n in haeufig.most_common(5):
        if n < 3:
            break
        print(f"  {n}x  {satz[:88]}")

    print(f"\n{'='*74}\nZU PRÜFEN VON HAND\n{'='*74}")
    verdaechtig = []
    for f, p, fakten, b in alle:
        treffer = [(kid, feld, m.group(0), text)
                   for kid, feld, text in saetze(p)
                   for m in [VERDACHT.search(text or "")] if m]
        if treffer:
            verdaechtig.append((p["name"], treffer))
    if verdaechtig:
        for name, treffer in verdaechtig[:10]:
            print(f"\n  {name}:")
            for kid, feld, wort, text in treffer[:3]:
                stelle = text.find(wort)
                print(f"    [{kid}/{feld}] «{wort}»  …{text[max(0, stelle-40):stelle+45].strip()}…")
    else:
        print("  keine verdächtigen Wendungen gefunden")

    print(f"\n{'='*74}\nUMFANG GEGEN DATENLAGE\n{'='*74}")
    schief = []
    for f, p, fakten, b in alle:
        n = sum(len(k["questions"]) for k in p["chapters"])
        min_k, max_k, min_f, max_f = umfang_erwartet(fakten)
        if not min_f <= n <= max_f:
            schief.append((p["name"], n, min_f, max_f))
    if schief:
        for name, n, lo, hi in sorted(schief, key=lambda x: -abs(x[1] - (x[2] + x[3]) / 2))[:8]:
            print(f"  {name:<24}{n:>3} Fragen, Datenlage trägt {lo}–{hi}")
    else:
        print("  alle Profile im Rahmen")

    if "--stichprobe" in sys.argv:
        n = int(sys.argv[sys.argv.index("--stichprobe") + 1])
        print(f"\n{'='*74}\nSTICHPROBE ZUM LESEN\n{'='*74}")
        # gestreut über Grösse und Datenlage, damit die Auswahl etwas aussagt
        sortiert = sorted(alle, key=lambda x: -(x[2]["steckbrief"].get("dwv") or 0))
        schritt = max(1, len(sortiert) // n)
        for f, p, fakten, b in sortiert[::schritt][:n]:
            fragen_n = sum(len(k["questions"]) for k in p["chapters"])
            print(f"  {p['name']:<24}{p['tier']}  DWV {fakten['steckbrief'].get('dwv') or 0:>7}  "
                  f"{len(p['chapters'])} Kapitel, {fragen_n} Fragen, "
                  f"{len(b.warnungen)} Warnungen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
