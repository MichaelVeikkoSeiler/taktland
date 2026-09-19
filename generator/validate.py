#!/usr/bin/env python3
"""Prueft ein Profil gegen seine Faktendatei. Ohne Sprachmodell, rein mechanisch.

Der Storyboard-Agent darf formulieren, nicht ergaenzen. Dieses Skript stellt das fest:
jeder factRef muss aufloesbar sein, jeder Wert muss stimmen, jede Zahl im Text muss
aus den Fakten stammen.

    python generator/validate.py data/profiles/8508001.de.json
    python generator/validate.py --alle
    python generator/validate.py --alle --fix        # Luecken eintragen
    python generator/validate.py --alle --entfernen  # zusaetzlich Ungueltiges loeschen
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "data" / "facts"
PROFILES = ROOT / "data" / "profiles"

FRAGETYPEN = {"single_choice", "multiple_choice", "true_false", "cloze",
              "match", "sort", "hotspot", "slider"}

# Woerter, die eine Vollstaendigkeit behaupten, die die offenen Daten nicht hergeben
VERALLGEMEINERUNG = re.compile(
    r"\b(alle[nrs]?|sämtliche[nrs]?|insgesamt|einzige[nrs]?|gesamte[nrs]?|"
    r"jede[nrs]?|keine weiteren|total)\b", re.I)

ZAHL = re.compile(r"\d[\d'’’.,]*\d|\d")

# Wendungen, die etwas behaupten, was aus offenen Daten nicht folgen kann:
# Deutungen, Vermutungen, Vergleiche mit anderen Bahnhoefen.
VERMUTUNG = re.compile(
    r"\b(stammen aus|stammt aus|gilt als|gelten als|d\u00fcrfte|vermutlich|"
    r"bekannt f\u00fcr|beliebt|typisch|erwarten|erwartet|offenbar|wahrscheinlich|"
    r"traditionell|historisch|Pendlerbahnhof|gilt \w+ als|gelten \w+ als|seit Jahren|seit langem|schon lange|seit jeher|in letzter Zeit|zunehmend)\b"
    # Superlative nur dort, wo sie andere Bahnhoefe vergleichen. "das laengste
    # Perron" ist belegt, "der groesste Bahnhof der Schweiz" nicht.
    r"|\b(gr\u00f6sst|kleinst|wichtigst|bedeutendst|st\u00e4rkst|sch\u00f6nst)\w*\s+"
    r"(Bahnhof|Station|Knoten)|\bder Schweiz\b", re.I)

NORMHOEHEN = {20, 25, 30, 35, 42, 55, 76}   # uebliche Perronhoehen in cm

UMFANG = {"S": (4, 6, 5, 8), "M": (6, 8, 10, 14), "L": (8, 10, 18, 24)}


def zahl(text):
    """'480'900' -> 480900.0 ; '12,5' -> 12.5"""
    t = str(text).replace("'", "").replace("’", "").replace("’", "")
    if "," in t and "." not in t:
        t = t.replace(",", ".")
    else:
        t = t.replace(",", "")
    try:
        return float(t)
    except ValueError:
        return None


def alle_zahlen(obj, raus=None):
    """Jede Zahl, die irgendwo in den Fakten steht."""
    raus = set() if raus is None else raus
    if isinstance(obj, bool):
        return raus
    if isinstance(obj, (int, float)):
        raus.add(float(obj))
    elif isinstance(obj, str):
        n = zahl(obj)
        if n is not None:
            raus.add(n)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("source", "hinweis"):
                continue
            alle_zahlen(v, raus)
            n = zahl(k)          # Schluessel wie "55" in segmente_pro_perronhoehe_cm
            if n is not None:
                raus.add(n)
    elif isinstance(obj, list):
        for v in obj:
            alle_zahlen(v, raus)
    return raus


def aufloesen(facts, pfad):
    """'gleise.items[0].perronhoehen_cm[0]' -> Wert oder KeyError."""
    kurz = pfad
    for teil in re.split(r"\.(?![^\[]*\])", pfad):
        m = re.match(r"^([^\[]+)((?:\[\d+\])*)$", teil)
        if not m:
            raise KeyError(f"Pfad nicht lesbar: {kurz}")
        name, indizes = m.group(1), m.group(2)
        if not isinstance(facts, dict) or name not in facts:
            raise KeyError(f"'{name}' fehlt in den Fakten ({kurz})")
        facts = facts[name]
        for i in re.findall(r"\[(\d+)\]", indizes):
            i = int(i)
            if not isinstance(facts, list) or i >= len(facts):
                raise KeyError(f"Index [{i}] nicht vorhanden ({kurz})")
            facts = facts[i]
    return facts


def einzelzahl(text):
    """'55 cm' -> 55.0. Nur wenn genau eine Zahl im Text steht, sonst None."""
    treffer = ZAHL.findall(str(text))
    return zahl(treffer[0]) if len(treffer) == 1 else None


def passt(wert, referenz):
    """Stimmt der Profilwert mit dem Faktenwert ueberein? Rundung erlaubt."""
    if isinstance(referenz, list):
        return any(passt(wert, r) for r in referenz)
    a, b = zahl(wert), zahl(referenz)
    if a is None:
        # Antworten duerfen ihre Einheit mitschreiben: "55 cm" zu 55
        a = einzelzahl(wert)
    if b is None:
        b = einzelzahl(referenz)
    if a is not None and b is not None:
        if a == b:
            return True
        for stelle in (1, 10, 100, 1000):
            if round(b / stelle) * stelle == a:
                return True
        return False
    return str(wert).strip().lower() == str(referenz).strip().lower()


def belegt(n, erlaubt):
    """Ist die Zahl n durch die Fakten gedeckt, auch gerundet?"""
    if n in erlaubt:
        return True
    for w in erlaubt:
        for stelle in (1, 10, 100, 1000):
            if round(w / stelle) * stelle == n:
                return True
    return False


class Bericht:
    def __init__(self, name):
        self.name = name
        self.fehler = []
        self.warnungen = []

    def fehlt(self, wo, was):
        self.fehler.append(f"{wo}: {was}")

    def warnt(self, wo, was):
        self.warnungen.append(f"{wo}: {was}")

    @property
    def ok(self):
        return not self.fehler


def pruefe_text(text, wo, erlaubt, b, streng=True):
    for roh in ZAHL.findall(text or ""):
        n = zahl(roh)
        if n is None:
            continue
        if not belegt(n, erlaubt):
            (b.fehlt if streng else b.warnt)(wo, f"Zahl {roh} steht nicht in den Fakten")
    m = VERMUTUNG.search(text or "")
    if m:
        b.fehlt(wo, f"«{m.group(0)}» deutet oder vermutet. "
                    "Die offenen Daten geben das nicht her")
    m = VERALLGEMEINERUNG.search(text or "")
    if m and ZAHL.search(text or ""):
        b.warnt(wo, f"«{m.group(0)}» zusammen mit einer Zahl behauptet Vollständigkeit")


def pruefe(profil, facts, fix=False, entfernen=False):
    b = Bericht(profil.get("name", "?"))
    erlaubt = alle_zahlen(facts)
    erlaubt.add(float(facts["uic"]))

    for feld in ("uic", "name", "tier", "lang", "chapters"):
        if feld not in profil:
            b.fehlt("Profil", f"Feld '{feld}' fehlt")
    if b.fehler:
        return b, profil

    if profil["uic"] != facts["uic"]:
        b.fehlt("Profil", f"UIC {profil['uic']} passt nicht zu den Fakten {facts['uic']}")
    if profil["tier"] != facts["tier"]:
        b.fehlt("Profil", f"Stufe {profil['tier']} statt {facts['tier']}")
    if "ß" in json.dumps(profil, ensure_ascii=False):
        b.fehlt("Profil", "ß gefunden, Schweizer Rechtschreibung verlangt ss")

    # Lücken müssen übernommen werden, sonst verschweigt das Profil, was fehlt
    soll = {l["thema"] for l in facts.get("luecken", [])}
    ist = {l.get("thema") for l in profil.get("luecken", [])}
    if fix:
        # Lücken werden nie formuliert, sondern unveraendert uebernommen
        profil["luecken"] = facts.get("luecken", [])
        ist = {l.get("thema") for l in profil["luecken"]}
    if soll and not profil.get("luecken"):
        b.fehlt("Profil", f"Feld 'luecken' fehlt, {len(soll)} Lücken wären anzugeben")
    else:
        for t_ in sorted(soll - ist):
            b.fehlt("Profil/luecken", f"Lücke «{t_}» wird verschwiegen")
        for t_ in sorted(ist - soll):
            b.fehlt("Profil/luecken", f"Lücke «{t_}» steht nicht in den Fakten")

    verfuegbar = set(facts.get("verfuegbare_kapitel", []))
    kapitel_raus, fragen_gesamt = [], 0

    for kap in profil["chapters"]:
        kid = kap.get("id", "?")
        wo = f"Kapitel {kid}"
        if kid not in verfuegbar:
            b.fehlt(wo, f"nicht in verfuegbare_kapitel {sorted(verfuegbar)}")
            continue
        if not kap.get("title") or not kap.get("body"):
            b.fehlt(wo, "title oder body fehlt")
        pruefe_text(kap.get("body", ""), f"{wo}/body", erlaubt, b)
        # Allgemeines Fachwissen gehoert in ein eigenes Feld und darf den Bahnhof
        # nicht nennen, sonst wird aus der Erlaeuterung wieder eine Behauptung.
        erl = kap.get("erlaeuterung")
        if erl:
            if profil["name"].split()[0].lower() in erl.lower():
                b.fehlt(f"{wo}/erlaeuterung",
                        "nennt den Bahnhof. Erläuterungen sind allgemein zu halten")
            for roh in ZAHL.findall(erl):
                n = zahl(roh)
                if n is not None and not belegt(n, erlaubt) and n not in NORMHOEHEN:
                    b.warnt(f"{wo}/erlaeuterung",
                            f"Zahl {roh} ist weder belegt noch eine Normhöhe")

        fakten_raus = []
        for i, fk in enumerate(kap.get("facts", [])):
            fwo = f"{wo}/facts[{i}]"
            ref = fk.get("factRef")
            if not ref:
                b.fehlt(fwo, "factRef fehlt")
                continue
            try:
                wert = aufloesen(facts, ref)
            except KeyError as e:
                b.fehlt(fwo, str(e))
                fakten_raus.append(i)
                continue
            if "value" in fk and not passt(fk["value"], wert):
                b.fehlt(fwo, f"value {fk['value']!r} passt nicht zu {ref} = {wert!r}")
                fakten_raus.append(i)
            if not fk.get("label"):
                b.fehlt(fwo, "label fehlt")

        fragen_raus = []
        for i, fr in enumerate(kap.get("questions", [])):
            qwo = f"{wo}/questions[{i}]"
            typ = fr.get("type")
            if typ not in FRAGETYPEN:
                b.fehlt(qwo, f"unbekannter Fragetyp {typ!r}")
                fragen_raus.append(i)
                continue
            if not fr.get("prompt"):
                b.fehlt(qwo, "prompt fehlt")
            ref = fr.get("factRef")
            if not ref:
                b.fehlt(qwo, "factRef fehlt")
                fragen_raus.append(i)
                continue
            try:
                wert = aufloesen(facts, ref)
            except KeyError as e:
                b.fehlt(qwo, str(e))
                fragen_raus.append(i)
                continue

            # Die richtige Antwort muss dem belegten Wert entsprechen
            opts = fr.get("options")
            if typ in ("single_choice", "multiple_choice"):
                if not isinstance(opts, list) or len(opts) < 2:
                    b.fehlt(qwo, "mindestens zwei options nötig")
                    fragen_raus.append(i)
                    continue
                idx = fr.get("correct")
                idxs = idx if isinstance(idx, list) else [idx]
                if any(not isinstance(x, int) or not 0 <= x < len(opts) for x in idxs):
                    b.fehlt(qwo, f"correct {idx!r} zeigt nicht auf eine Option")
                    fragen_raus.append(i)
                    continue
                for x in idxs:
                    if not passt(opts[x], wert):
                        b.fehlt(qwo, f"richtige Antwort {opts[x]!r} passt nicht zu {ref} = {wert!r}")
                        fragen_raus.append(i)
                # Distraktoren duerfen keinen anderen Faktenwert treffen. Ausnahme:
                # Fragen, deren Optionen von Natur aus aus einer bekannten Menge stammen
                # (Jahre, Gleisnummern, Wochentage). Die muessen das ausdruecklich sagen.
                if not fr.get("optionen_aus_fakten"):
                    for j, o in enumerate(opts):
                        if j in idxs:
                            continue
                        n = zahl(o)
                        if n is not None and n in erlaubt:
                            b.warnt(qwo, f"falsche Antwort {o!r} ist selbst ein Faktenwert. "
                                         "Wenn das gewollt ist: optionen_aus_fakten auf true setzen")
            elif typ == "true_false":
                if fr.get("correct") not in (True, False):
                    b.fehlt(qwo, "correct muss true oder false sein")
            elif typ == "slider":
                if not passt(fr.get("correct"), wert):
                    b.fehlt(qwo, f"correct {fr.get('correct')!r} passt nicht zu {ref} = {wert!r}")

            pruefe_text(fr.get("prompt", ""), f"{qwo}/prompt", erlaubt, b)
            pruefe_text(fr.get("explanation", ""), f"{qwo}/explanation", erlaubt, b)
            if not fr.get("explanation"):
                b.warnt(qwo, "explanation fehlt")

        if entfernen:
            for i in sorted(set(fakten_raus), reverse=True):
                kap["facts"].pop(i)
            for i in sorted(set(fragen_raus), reverse=True):
                kap["questions"].pop(i)
            if not kap.get("questions") and not kap.get("facts"):
                kapitel_raus.append(kap)
        fragen_gesamt += len(kap.get("questions", []))

    if entfernen and kapitel_raus:
        profil["chapters"] = [k for k in profil["chapters"] if k not in kapitel_raus]

    min_k, max_k, min_f, max_f = UMFANG.get(profil["tier"], (0, 99, 0, 99))
    n_k = len(profil["chapters"])
    if not min_k <= n_k <= max_k:
        b.warnt("Umfang", f"{n_k} Kapitel, Stufe {profil['tier']} erwartet {min_k}–{max_k}")
    if not min_f <= fragen_gesamt <= max_f:
        b.warnt("Umfang", f"{fragen_gesamt} Fragen, Stufe {profil['tier']} erwartet {min_f}–{max_f}")

    return b, profil


def main():
    fix = "--fix" in sys.argv or "--entfernen" in sys.argv
    entfernen = "--entfernen" in sys.argv
    pfade = [Path(a) for a in sys.argv[1:] if not a.startswith("--")]
    if "--alle" in sys.argv:
        pfade = sorted(PROFILES.glob("*.json"))
    if not pfade:
        print(__doc__)
        return 1

    schlecht = 0
    for p in pfade:
        profil = json.loads(p.read_text(encoding="utf-8"))
        fpfad = FACTS / f"{profil.get('uic')}.json"
        if not fpfad.exists():
            print(f"✗ {p.name}: keine Faktendatei {fpfad.name}")
            schlecht += 1
            continue
        facts = json.loads(fpfad.read_text(encoding="utf-8"))
        b, profil = pruefe(profil, facts, fix=fix, entfernen=entfernen)
        zeichen = "✓" if b.ok else "✗"
        print(f"{zeichen} {p.name}  {b.name}  "
              f"{len(b.fehler)} Fehler, {len(b.warnungen)} Warnungen")
        for f in b.fehler:
            print(f"    FEHLER   {f}")
        for w in b.warnungen:
            print(f"    Warnung  {w}")
        if fix:
            p.write_text(json.dumps(profil, ensure_ascii=False, indent=2), encoding="utf-8")
        if not b.ok:
            schlecht += 1
    return 1 if schlecht else 0


if __name__ == "__main__":
    sys.exit(main())
