"""Taktland als Anwendung von `belegt`.

Hier steht alles, was mit Bahnhöfen zu tun hat: welche Kapitel es gibt, welche
Fragetypen, wie ein Profil geprüft wird und wie der Auftrag an das Sprachmodell
lautet. Der prüfende Unterbau in `belegt/` kennt davon nichts.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from belegt import Bericht, Faktenbasis, Regelwerk  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "data" / "facts"
PROFILES = ROOT / "data" / "profiles"
SCHEMA = ROOT / "generator" / "SCHEMA.md"

FRAGETYPEN = {"single_choice", "multiple_choice", "true_false", "cloze",
              "match", "sort", "hotspot", "slider"}

KAPITEL_REIHENFOLGE = ["steckbrief", "stammdaten", "tagesrhythmus", "perrons", "gleise",
                       "hindernisfreiheit", "zuege", "linien", "services", "bahnhofplan"]

#: Übliche Perronhöhen in Zentimetern. Sie dürfen in allgemeinen Erläuterungen
#: vorkommen, auch wenn sie bei diesem Bahnhof nicht erfasst sind.
NORMHOEHEN = {20, 25, 30, 35, 42, 55, 76}

#: Wendungen, die formal stimmen, aber nichts aussagen
#: Feldnamen aus den Fakten gehören nicht in den Text
FELDJARGON = [r"\bdwv\b", r"\bdtv\b", r"\bdnwv\b", r"\bisb\b", r"\bevu\b",
              r"\bbpuic\b", r"\buic-?Wert", r"factRef"]

#: Falsch aufgelöste Abkürzungen
FALSCHDEUTUNG = [
    (r"Werktagsverkehr an Nichtwerktagen",
     "dnwv heisst Nicht-Werktagsverkehr, nicht Werktagsverkehr an Nichtwerktagen"),
    (r"(dnwv|Nicht-?Werktag\w*)[^.]{0,40}\bam Wochenende\b|\bam Wochenende\b[^.]{0,40}(dnwv)",
     "der Wert umfasst Wochenenden und Feiertage, nicht nur das Wochenende"),
    (r"Gleisquerung (ist )?(nötig|notwendig|erforderlich)|mit einer Gleisquerung zu rechnen",
     "eine fehlende Zugangsangabe heisst nicht, dass man die Gleise queren muss. "
     "Die Daten sagen nur, dass zu diesem Perron nichts vermerkt ist"),
    (r"\bGleis(e)?\s+(zu\s+)?(über)?queren\b",
     "«niveaufrei» ist eine Angabe zum Zugang. Ob man dabei ein Gleis quert, "
     "steht nicht in den Daten (Cortébert, Pfäffikon SZ: «man muss also kein "
     "Gleis überqueren»)"),
    (r"deckt (also |damit |somit )?nicht den (gesamten|ganzen)",
     "«Ohne X.» sagt nur, dass X nicht mitgezählt ist. Was daraus für den Verkehr "
     "am Bahnhof folgt, ist ein Schluss. Gib die Bemerkung wieder, mehr nicht"),
]

# In linie-mit-betriebspunkten steht die Kilometrierung des Bahnhofs auf der
# Linie, nicht die Laenge der Linie. Beweis: Linie 100 steht in Lausanne bei
# 0.0 km, in Brig bei 145.5 km. Das Modell hat das mehrfach als Laenge gelesen.
LAENGE_STATT_STANDORT = r"Streckenl\u00e4nge|\bL\u00e4nge\b|\blang\b|\bmisst\b"

# Ausstattung, die nur als Zahl erhoben ist: eine 0 heisst «nicht erfasst»,
# nicht «steht nicht da». «vorhanden» waere eine Aussage ueber die Wirklichkeit.
# Der Zwischenraum darf kein Satzzeichen enthalten, sonst trifft die Regel
# ueber Teilsaetze hinweg: «Sicherheitslinie ist vorhanden, ein Hilfstritt ist
# bei keinem Segment erfasst» ist korrekt und darf nicht anschlagen.
NUR_ERFASST = (r"(Hilfstritt|Billettautomat\w*|Billettentwerter\w*|Wartehalle\w*)"
               r"[^.,;]{0,40}\b(vorhanden|gibt es|existiert|fehlt)\b"
               r"|\b(vorhanden|gibt es|existiert|fehlt)\b[^.,;]{0,40}"
               r"(Hilfstritt|Billettautomat\w*|Billettentwerter\w*|Wartehalle\w*)")

#: Mindestabstand zwischen Werten, deren Reihenfolge gefragt wird. Liegen zwei
#: Werte näher beieinander, ist die Antwort Glückssache: 55'122 gegen 54'972
#: Züge im Jahr kann niemand wissen, auch wer das Kapitel gelesen hat. Beim
#: Hotspot gilt dieselbe Schwelle.
MINDESTABSTAND = 0.05


def zu_nah(a, b, anteil=MINDESTABSTAND):
    """Zwei Werte, die man beim Lernen nicht auseinanderhalten kann."""
    return a == b or abs(a - b) < anteil * max(abs(a), abs(b))


def klar_getrennt(items, anteil=MINDESTABSTAND, wert=lambda it: it["value"]):
    """Behält von fast gleichen Werten nur den höheren, absteigend geordnet.

    Aus 420, 417, 380 m wird 420, 380 m. Die Aufrufer brauchen danach
    mindestens drei Einträge, sonst entfällt die Sortierfrage.
    """
    raus = []
    for it in sorted(items, key=lambda it: -wert(it)):
        if not raus or not zu_nah(wert(raus[-1]), wert(it), anteil):
            raus.append(it)
    return raus


#: Lücke gefolgt von einem Wort in der Mehrzahl. Setzt man 1 ein, stimmt der
#: Satz nicht mehr: «An Gleis 1 sind 1 Sektoren erfasst».
MEHRZAHL_NACH_LUECKE = (r"___ (Sektoren|Perrons|Gleise[n]?|Züge[n]?|Personen|Linien|"
                        r"Billettentwerter|Billettautomaten|Wartehallen|Perronsegmente|"
                        r"Sitzbänke|Infopunkte|Schliessfächer|Segmente|Meter[n]?)\b")

#: Sätze, die für mehrere geschrieben sind und bei genau einem nicht passen
#: (Pont-Céard: ein Gleis, ein Perron, ein Entwerter)
EINZAHL = r"\b1 (Segmenten|Gleisen|Abschnitten|Zügen|Wartehallen|Billettautomaten)\b|\b[Dd]en 1 \w+|\b[Ee]rfasst sind 1 [\wäöüÄÖÜ-]+\.|\bsind 1 [\wäöüÄÖÜ-]+ (erfasst|verzeichnet|vermerkt)\b"

LEERFORMELN = [
    r"hat sich \w+ verändert", r"unterscheide[nt] sich (leicht|etwas|geringfügig)",
    r"ist unterschiedlich", r"variiert", r"in gewissem Masse", r"mehr oder weniger",
]

REGELWERK = Regelwerk(
    vermutung=Regelwerk().vermutung + ["Pendlerbahnhof", r"gilt \w+ als", r"gelten \w+ als"],
    normwerte=NORMHOEHEN,
)


def _stoff_ausstattung(fakten):
    """Wie viel das Kapitel Ausstattung an Fragestoff hergibt."""
    a = fakten.get("ausstattung") or {}
    bestaende = sum(1 for f in ("sitzbaenke", "infopunkte", "schliessfaecher") if f in a)
    belag = (a.get("perronbelag") or {}).get("anzahl_perrons_mit_daten", 0)
    return bestaende + min(belag, 3)


#: So viel mehr Fragen als die Richtzahl sind noch erlaubt. Darüber fragt ein
#: Profil dieselben Werte mehrfach ab. Gilt für den Validator und für
#: kuerzen() im Baukasten, damit es nur eine Grenze gibt.
TOLERANZ = 1.15


def hoechstens_fragen(fakten):
    return int(umfang_erwartet(fakten)[3] * TOLERANZ)


def umfang_erwartet(fakten):
    """Wie viele Kapitel und Fragen die Datenlage eines Bahnhofs hergibt.

    Früher hing das an der Grössenstufe. Das brach bei kleinen Bahnhöfen mit
    Bahnhofplan: Stufe L verlangte 18 Fragen, die Daten gaben 10 her.
    """
    kapitel = len(fakten.get("verfuegbare_kapitel", []))
    gl = fakten.get("gleise") or {}
    pr = fakten.get("perrons") or {}
    zu = fakten.get("zuege") or {}
    stoff = (len(gl.get("items", [])) + len(gl.get("perronhoehen_cm", []))
             + len(pr.get("items", [])) + min(len(zu.get("abschnitte", [])), 4)
             + (fakten.get("linien") or {}).get("anzahl", 0)
             + (3 if fakten.get("tagesrhythmus") else 0)
             + (2 if fakten.get("bahnhofplan") else 0)
             + _stoff_ausstattung(fakten)
             + 4)
    return (max(3, kapitel - 3), kapitel,
            max(5, round(stoff * 0.5)), max(max(5, round(stoff * 0.5)) + 4, round(stoff * 1.3)))


def _pruefe_frage(fr, i, kap_id, fb, fakten, b, raus):
    """Eine Frage gegen die Fakten prüfen. Fügt ihren Index zu `raus` hinzu,
    wenn sie nicht zu retten ist."""
    wo = f"Kapitel {kap_id}/questions[{i}]"
    typ = fr.get("type")
    if typ not in FRAGETYPEN:
        b.fehlt(wo, f"unbekannter Fragetyp {typ!r}")
        raus.append(i)
        return
    if not fr.get("prompt"):
        b.fehlt(wo, "prompt fehlt")
    ref = fr.get("factRef")
    if not ref:
        b.fehlt(wo, "factRef fehlt")
        raus.append(i)
        return
    try:
        wert = fb.aufloesen(ref)
    except KeyError as e:
        b.fehlt(wo, str(e))
        raus.append(i)
        return

    opts = fr.get("options")
    if typ in ("single_choice", "multiple_choice", "cloze"):
        if typ == "cloze" and "___" not in (fr.get("prompt") or ""):
            b.fehlt(wo, "cloze braucht ___ als Lücke im prompt")
        if not isinstance(opts, list) or len(opts) < 2:
            b.fehlt(wo, "mindestens zwei options nötig")
            raus.append(i)
            return
        idx = fr.get("correct")
        idxs = idx if isinstance(idx, list) else [idx]
        if any(not isinstance(x, int) or not 0 <= x < len(opts) for x in idxs):
            b.fehlt(wo, f"correct {idx!r} zeigt nicht auf eine Option")
            raus.append(i)
            return
        for x in idxs:
            if not fb.passt(opts[x], wert):
                b.fehlt(wo, f"richtige Antwort {opts[x]!r} passt nicht zu {ref} = {wert!r}")
                raus.append(i)
        if not fr.get("optionen_aus_fakten"):
            for j, o in enumerate(opts):
                if j in idxs:
                    continue
                from belegt.fakten import zahl
                n = zahl(o)
                if n is not None and n in fb.zahlen:
                    b.warnt(wo, f"falsche Antwort {o!r} ist selbst ein Faktenwert. "
                                "Wenn das gewollt ist: optionen_aus_fakten auf true setzen")

    elif typ == "true_false":
        if fr.get("correct") not in (True, False):
            b.fehlt(wo, "correct muss true oder false sein")

    elif typ == "slider":
        if not fb.passt(fr.get("correct"), wert):
            b.fehlt(wo, f"correct {fr.get('correct')!r} passt nicht zu {ref} = {wert!r}")
        mn, mx, c = fr.get("min"), fr.get("max"), fr.get("correct")
        if all(isinstance(x, (int, float)) for x in (mn, mx, c)):
            if not mn < c < mx:
                b.fehlt(wo, f"die Antwort {c} liegt am Rand der Spanne {mn} bis {mx}. "
                            "Der Regler startet unten, damit wäre sie verschenkt")
            # Toleranz wie in app/src/komponenten/Frage.tsx (Schieberegler):
            # eine Schrittweite, mindestens 5 % der Spanne.
            elif (anteil := 2 * max(fr.get("step") or 1, (mx - mn) * 0.05) / (mx - mn)) > 0.25:
                b.fehlt(wo, f"{anteil:.0%} der Spanne {mn} bis {mx} zählen als richtig, "
                            "weil die App eine Schrittweite Toleranz gibt. Das ist Raten: "
                            "feinere Schritte, oder bei kleinen Zählwerten eine Auswahlfrage")

    elif typ == "hotspot":
        if not fr.get("schema"):
            b.fehlt(wo, "hotspot braucht ein schema")
        if not fb.passt(fr.get("correct"), wert):
            b.fehlt(wo, f"correct {fr.get('correct')!r} passt nicht zu {ref} = {wert!r}")

    elif typ == "sort":
        items = fr.get("items")
        if not isinstance(items, list) or len(items) < 3:
            b.fehlt(wo, "sort braucht mindestens drei items")
            raus.append(i)
            return
        from belegt.fakten import zahl
        werte = []
        for j, it in enumerate(items):
            r2 = it.get("factRef")
            if not it.get("label") or not r2:
                b.fehlt(wo, f"items[{j}]: label oder factRef fehlt")
                continue
            try:
                soll = fb.aufloesen(r2)
            except KeyError as e:
                b.fehlt(wo, f"items[{j}]: {e}")
                continue
            if not fb.passt(it.get("value"), soll):
                b.fehlt(wo, f"items[{j}]: value {it.get('value')!r} passt nicht zu {r2} = {soll!r}")
            werte.append(zahl(it.get("value")))
        if all(w is not None for w in werte) and len(werte) > 1:
            richtung = fr.get("richtung", "absteigend")
            ab = all(werte[k] >= werte[k + 1] for k in range(len(werte) - 1))
            auf = all(werte[k] <= werte[k + 1] for k in range(len(werte) - 1))
            if richtung == "absteigend" and not ab:
                b.fehlt(wo, f"items sind nicht absteigend sortiert: {werte}")
            if richtung == "aufsteigend" and not auf:
                b.fehlt(wo, f"items sind nicht aufsteigend sortiert: {werte}")
            w = sorted(werte)
            if nah := [(x, y) for x, y in zip(w, w[1:]) if zu_nah(x, y)]:
                x, y = nah[0]
                b.fehlt(wo, f"{x:g} und {y:g} liegen weniger als "
                            f"{MINDESTABSTAND:.0%} auseinander, die Reihenfolge "
                            "wäre Glückssache. Einen der beiden weglassen")
            if all(zahl(it.get("label")) == zahl(it.get("value")) for it in items):
                b.fehlt(wo, "sortiert wird nach der Beschriftung selbst "
                            "(etwa Jahreszahlen), die Lösung steht schon auf den Karten")

    elif typ == "match":
        paare = fr.get("pairs")
        if not isinstance(paare, list) or len(paare) < 2:
            b.fehlt(wo, "match braucht mindestens zwei pairs")
            raus.append(i)
            return
        if len({p.get("rechts") for p in paare}) < len(paare):
            b.fehlt(wo, "zwei Paare haben dieselbe rechte Seite, "
                        "die Zuordnung wäre nicht eindeutig")
        for j, paar in enumerate(paare):
            r2 = paar.get("factRef")
            if not paar.get("links") or not paar.get("rechts") or not r2:
                b.fehlt(wo, f"pairs[{j}]: links, rechts oder factRef fehlt")
                continue
            try:
                soll = fb.aufloesen(r2)
            except KeyError as e:
                b.fehlt(wo, f"pairs[{j}]: {e}")
                continue
            if not fb.passt(paar["rechts"], soll):
                b.fehlt(wo, f"pairs[{j}]: {paar['rechts']!r} passt nicht zu {r2} = {soll!r}")

    for it in fr.get("items", []) or []:
        REGELWERK.pruefe_text(str(it.get("label", "")), f"{wo}/items", fb, b)
    for paar in fr.get("pairs", []) or []:
        REGELWERK.pruefe_text(str(paar.get("links", "")), f"{wo}/pairs", fb, b)
    REGELWERK.pruefe_text(fr.get("prompt", ""), f"{wo}/prompt", fb, b)
    REGELWERK.pruefe_text(fr.get("explanation", ""), f"{wo}/explanation", fb, b)
    if typ == "cloze" and isinstance(fr.get("correct"), int) and fr.get("options"):
        try:
            eingesetzt = str(fr["options"][fr["correct"]]).strip()
        except IndexError:
            eingesetzt = ""
        if eingesetzt == "1" and (m := re.search(MEHRZAHL_NACH_LUECKE, fr.get("prompt", ""))):
            b.fehlt(wo, f"«1 {m.group(1)}»: mit der Antwort 1 passt die Mehrzahl nicht. "
                        "Anders fragen, etwa «Wie viele … sind erfasst?»")

    # Zwei gleich beschriftete Karten kann niemand ordnen oder zuordnen (Muri AG:
    # zwei Perrons mit der Nummer 1)
    beschriftungen = ([it.get("label") for it in fr.get("items") or []]
                      + [pr.get("links") for pr in fr.get("pairs") or []])
    if len(beschriftungen) != len(set(beschriftungen)):
        doppelt = sorted({x for x in beschriftungen if beschriftungen.count(x) > 1}, key=str)
        b.fehlt(wo, f"gleiche Beschriftung mehrfach: {doppelt}")

    if not fr.get("explanation"):
        b.fehlt(wo, "explanation fehlt. Wer falsch antwortet, muss erfahren warum")
    elif len(fr["explanation"]) < 15:
        b.warnt(wo, f"explanation ist sehr knapp: «{fr['explanation']}»")


def pruefe(profil, fakten, fix=False, entfernen=False):
    """Prüft ein Profil gegen die Fakten seines Bahnhofs."""
    fb = Faktenbasis(fakten)
    b = Bericht(profil.get("name", "?"))

    for feld in ("uic", "name", "tier", "lang", "chapters"):
        if feld not in profil:
            b.fehlt("Profil", f"Feld '{feld}' fehlt")
    if b.fehler:
        return b, profil

    if profil["uic"] != fakten["uic"]:
        b.fehlt("Profil", f"UIC {profil['uic']} passt nicht zu den Fakten {fakten['uic']}")
    if profil["tier"] != fakten["tier"]:
        b.fehlt("Profil", f"Stufe {profil['tier']} statt {fakten['tier']}")
    if "ß" in json.dumps(profil, ensure_ascii=False):
        b.fehlt("Profil", "ß gefunden, Schweizer Rechtschreibung verlangt ss")

    if fix:
        profil["luecken"] = fakten.get("luecken", [])
        if any(f.get("type") == "hotspot"
               for k in profil.get("chapters", []) for f in k.get("questions", [])):
            profil["gleise"] = (fakten.get("gleise") or {}).get("items", [])
        else:
            profil.pop("gleise", None)

    # Die Gleisfrage zum Antippen braucht das Schema. Fehlte es, zeigte die
    # App bei 49 Bahnhöfen «Zu diesem Bahnhof liegt kein Schema vor».
    if any(f.get("type") == "hotspot"
           for k in profil.get("chapters", []) for f in k.get("questions", [])):
        if profil.get("gleise") != (fakten.get("gleise") or {}).get("items"):
            b.fehlt("Profil", "Gleisfrage ohne passendes Gleisschema: 'gleise' fehlt "
                              "oder weicht von den Fakten ab")

    # Die Lizenz verlangt die Quellenangabe. Das Kapitel Ausstattung nutzte
    # zwei Datensätze, die in 'sources' fehlten.
    genutzt = {x.get("source") for k in profil.get("chapters", [])
               for x in k.get("facts", []) if x.get("source")}
    if fehlend := sorted(genutzt - set(profil.get("sources", []))):
        b.fehlt("Profil", f"Quelle genutzt, aber nicht genannt: {', '.join(fehlend)}")

    soll = {l["thema"] for l in fakten.get("luecken", [])}
    ist = {l.get("thema") for l in profil.get("luecken", [])}
    if soll and not profil.get("luecken"):
        b.fehlt("Profil", f"Feld 'luecken' fehlt, {len(soll)} Lücken wären anzugeben")
    else:
        for t in sorted(soll - ist):
            b.fehlt("Profil/luecken", f"Lücke «{t}» wird verschwiegen")
        for t in sorted(ist - soll):
            b.fehlt("Profil/luecken", f"Lücke «{t}» steht nicht in den Fakten")
        # unverändert übernommen, auch im Wortlaut: Als die Pipeline «60 der
        # 769» zu «60 der 771» korrigierte, blieben die Profile sonst beim alten
        if soll == ist and profil.get("luecken") != fakten.get("luecken"):
            b.fehlt("Profil/luecken", "Lücken weichen im Wortlaut oder in der Reihenfolge "
                                      "von den Fakten ab. Neu bauen")

    verfuegbar = set(fakten.get("verfuegbare_kapitel", []))
    kapitel_raus, fragen_gesamt = [], 0

    for kap in profil["chapters"]:
        kid = kap.get("id", "?")
        wo = f"Kapitel {kid}"
        if kid not in verfuegbar:
            b.fehlt(wo, f"nicht in verfuegbare_kapitel {sorted(verfuegbar)}")
            continue
        if not kap.get("title") or not kap.get("body"):
            b.fehlt(wo, "title oder body fehlt")
        REGELWERK.pruefe_text(kap.get("body", ""), f"{wo}/body", fb, b)
        for muster in FELDJARGON:
            if m := re.search(muster, kap.get("body", ""), re.I):
                b.fehlt(f"{wo}/body", f"«{m.group(0)}» ist ein Feldname aus den Daten. "
                                      "Schreibe, was der Wert bedeutet")
        for feld, text in [("body", kap.get("body", ""))] + [
                (f"questions[{i}]/{f}", q.get(f) or "")
                for i, q in enumerate(kap.get("questions", []))
                for f in ("prompt", "explanation")]:
            for muster, warum in FALSCHDEUTUNG:
                if m := re.search(muster, text, re.I):
                    b.fehlt(f"{wo}/{feld}", f"«{m.group(0)}»: {warum}")
            if m := re.search(EINZAHL, text):
                b.fehlt(f"{wo}/{feld}", f"«{m.group(0)}»: bei genau einem passt die Mehrzahl nicht")
            # Namen aus den Daten enden manchmal mit einem Abkürzungspunkt
            if m := re.search(r"\S{0,20}[^.]\.\.(?!\.)", text):
                b.fehlt(f"{wo}/{feld}", f"«{m.group(0)}»: doppelter Punkt")
        for muster in LEERFORMELN:
            if m := re.search(muster, kap.get("body", ""), re.I):
                b.fehlt(f"{wo}/body", f"«{m.group(0)}» sagt nichts aus. "
                                      "Nenne den Wert statt ihn zu umschreiben")
        for feld, text in [("body", kap.get("body", ""))] + [
                (f"questions[{i}]/{f}", q.get(f) or "")
                for i, q in enumerate(kap.get("questions", []))
                for f in ("prompt", "explanation")]:
            if m := re.search(NUR_ERFASST, text, re.I):
                b.fehlt(f"{wo}/{feld}",
                        f"«{m.group(0)[:50]}»: die Daten sagen nur, was erfasst ist. "
                        "Schreibe «erfasst» oder «verzeichnet», nicht «vorhanden»")

        if kid == "zuege" and (zu := fakten.get("zuege")) and zu.get("abschnitte"):
            # Personenverkehr und Güterverkehr: Was der Text sagt, muss zur
            # Art des Abschnitts passen, auf den der factRef zeigt. In Sins war
            # der stärkste Abschnitt ein Güterabschnitt und hiess im Text
            # «Personenverkehr».
            eintraege = [(f"facts[{i}]", x.get("label") or "", x.get("factRef") or "")
                         for i, x in enumerate(kap.get("facts") or [])]
            for i, q in enumerate(kap.get("questions", [])):
                eintraege.append((f"questions[{i}]", q.get("prompt") or "", q.get("factRef") or ""))
                eintraege += [(f"questions[{i}]/items[{j}]", it.get("label") or "", it.get("factRef") or "")
                              for j, it in enumerate(q.get("items") or [])]
            for stelle, text, ref in eintraege:
                try:
                    art = fb.aufloesen(ref.rsplit(".", 1)[0]).get("art")
                except (KeyError, AttributeError):
                    continue
                # nur was der Art ausdrücklich widerspricht; «Sargans - Bad Ragaz»
                # nennt keine Art, «mehr Güter- als Personenzüge» nennt beide
                pv = bool(re.search(r"Personen(verkehr|z[uü]g|-)", text))
                gv = bool(re.search(r"Güter(verkehr|z[uü]g|-)", text))
                if art and pv != gv and pv != (art == "Personenverkehr"):
                    b.fehlt(f"{wo}/{stelle}", f"«{text[:60]}» zeigt auf einen Abschnitt im "
                                              f"{'Personenverkehr' if art == 'Personenverkehr' else 'Güterverkehr'}")
            # Güterzüge pro Tag können auf 0 gerundet sein, im Jahr sind es
            # trotzdem welche (Seuzach: 119). Dann ist «keiner» falsch.
            gueter = [a for a in zu["abschnitte"]
                      if a.get("art") == "Gueterverkehr" and a.get("zuege_pro_jahr")]
            if gueter and (m := re.search(r"Güterverkehr ist [^.]*keiner", kap.get("body", ""))):
                b.fehlt(f"{wo}/body", f"«{m.group(0)}»: im Güterverkehr zählt die Erhebung bis zu "
                                      f"{max(a['zuege_pro_jahr'] for a in gueter)} Züge im Jahr")

        if kid == "zuege" and (zu := fakten.get("zuege")) and zu.get("staerkster_abschnitt"):
            # der Text spricht vom Personenverkehr, also zählt dessen stärkster Abschnitt
            st = zu.get("staerkster_personenverkehr") or zu["staerkster_abschnitt"]
            gleich = [a for a in zu.get("abschnitte", [])
                      if a.get("art") == st.get("art") and a is not st
                      and (a.get("von"), a.get("bis")) != (st.get("von"), st.get("bis"))
                      and a.get("zuege_pro_tag") == st.get("zuege_pro_tag")]
            text = " ".join([kap.get("body", "")] + [q.get(f) or "" for q in kap.get("questions", [])
                                                      for f in ("prompt", "explanation")])
            einzig = len([a for a in zu.get("abschnitte", [])
                          if a.get("art") == st.get("art") and a.get("zuege_pro_tag")]) <= 1
            if einzig and (m := re.search(r"am stärksten|stärkste[nr]? (befahren|Abschnitt)", text, re.I)):
                b.fehlt(f"{wo}", f"«{m.group(0)}»: es ist nur ein Abschnitt erfasst, "
                                 "ein Superlativ ohne Vergleich sagt nichts")
            if gleich and (m := re.search(r"am stärksten|stärkste[nr]? (befahren|Abschnitt)",
                                          text, re.I)):
                b.fehlt(f"{wo}", f"«{m.group(0)}»: pro Tag zählt die Erhebung auf "
                                 f"{gleich[0]['von']} – {gleich[0]['bis']} gleich viele Züge "
                                 f"({st['zuege_pro_tag']}). Nenne die Werte, ohne einen Abschnitt vorzuziehen")

        if kid == "services" and (sv := fakten.get("services")):
            # Eine 0 heisst «nicht erfasst». Der Text muss das sagen, nicht schweigen
            # (Emmenbrücke Gersag: Entwerter fehlten im Satz einfach).
            for feld, wort in (("billettautomaten_erfasst", "Billettautomat"),
                               ("billettentwerter_erfasst", "Billettentwerter"),
                               ("wartehallen_erfasst", "Wartehalle")):
                if feld in sv and not sv[feld] and wort not in kap.get("body", ""):
                    b.fehlt(f"{wo}/body", f"{wort}: 0 erfasst, der Text verschweigt es. "
                                          "Schreibe «… sind keine verzeichnet»")
                # Ohne Zahl (Köniz: keine Zuordnung in der Quelle) ist «keine
                # verzeichnet» eine erfundene 0
                if feld not in sv and feld != "wartehallen_erfasst" and (m := re.search(
                        rf"{wort}\w*[^.]*\bkeine?\b[^.]*\b(verzeichnet|erfasst)\b", kap.get("body", ""))):
                    b.fehlt(f"{wo}/body", f"«{m.group(0)}»: dazu liegen keine Daten vor, "
                                          "auch keine 0. Schreibe das so")

        if kid == "perrons" and (pr := fakten.get("perrons")):
            # Ein Perron ohne Länge darf im Text nicht einfach fehlen (Zwingen)
            if any(not it.get("laenge_m") for it in pr.get("items") or []) \
                    and "Länge" not in kap.get("body", ""):
                b.fehlt(f"{wo}/body", "zu einem Perron ist keine Länge erfasst, "
                                      "der Text verschweigt es")

        if kid == "linien":
            for feld, text in [("body", kap.get("body", ""))] + [
                    (f"facts[{j}]/label", f.get("label") or "")
                    for j, f in enumerate(kap.get("facts", []))] + [
                    (f"questions[{i}]/{f}", q.get(f) or "")
                    for i, q in enumerate(kap.get("questions", []))
                    for f in ("prompt", "explanation")]:
                if m := re.search(LAENGE_STATT_STANDORT, text, re.I):
                    b.fehlt(f"{wo}/{feld}",
                            f"«{m.group(0)}»: km_am_bahnhof ist die Kilometrierung "
                            "des Bahnhofs auf der Linie, nicht die Länge der Linie. "
                            "Die Länge steht in den offenen Daten nicht")

        if erl := kap.get("erlaeuterung"):
            REGELWERK.pruefe_allgemein(erl, f"{wo}/erlaeuterung", profil["name"], b)
            for roh in re.findall(r"\d+", erl):
                n = float(roh)
                if not fb.belegt(n, NORMHOEHEN):
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
                wert = fb.aufloesen(ref)
            except KeyError as e:
                b.fehlt(fwo, str(e))
                fakten_raus.append(i)
                continue
            if "value" in fk and not fb.passt(fk["value"], wert):
                b.fehlt(fwo, f"value {fk['value']!r} passt nicht zu {ref} = {wert!r}")
                fakten_raus.append(i)
            if not fk.get("label"):
                b.fehlt(fwo, "label fehlt")

        fragen_raus = []
        for i, fr in enumerate(kap.get("questions", [])):
            _pruefe_frage(fr, i, kid, fb, fakten, b, fragen_raus)

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

    min_k, max_k, min_f, max_f = umfang_erwartet(fakten)
    n_k = len(profil["chapters"])
    if not min_k <= n_k <= max_k:
        b.warnt("Umfang", f"{n_k} Kapitel, die Datenlage trägt {min_k}–{max_k}")
    if fragen_gesamt > hoechstens_fragen(fakten):
        b.fehlt("Umfang", f"{fragen_gesamt} Fragen, die Datenlage trägt höchstens {max_f}. "
                          "Mehr Fragen heisst hier, dieselben Werte mehrfach abzufragen")
    elif not min_f <= fragen_gesamt <= max_f:
        b.warnt("Umfang", f"{fragen_gesamt} Fragen, die Datenlage trägt {min_f}–{max_f}")

    return b, profil


def fakten_laden(uic):
    return json.loads((FACTS / f"{uic}.json").read_text(encoding="utf-8"))
