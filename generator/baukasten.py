"""Baukasten für Taktland-Profile.

Baut die wiederkehrenden Kapitel aus den Fakten und achtet dabei auf die
Fehlerklassen, die beim Schreiben von Hand aufgefallen sind (siehe
generator/SCHEMA.md, «Was beim Schreiben von Hand aufgefallen ist»):

- Gleichstände: keine Sortier-, Hotspot- oder Zuordnungsfrage, wenn Werte
  gleich oder so nah beieinander sind, dass es ein Münzwurf wäre
- Zugang zum Perron in drei Fällen: ja, ausdrücklich nein, keine Angabe
- leere Höhenlisten nicht als Messergebnis ausgeben
- keine gezählten oder gerechneten Zahlen im Text
- Mehrfachauswahl nur mit mindestens einer falschen Option
- kein Kapitel ohne Frage

Der Baukasten ersetzt das Lesen nicht. Jedes Profil wird mit zeigen()
ausgegeben und von Hand gelesen, bevor es gespeichert wird - bei jedem Schub
fiel dabei bisher etwas auf, das keine Regel gefunden hätte.

    from baukasten import profil, zeigen, speichern
    d = profil(8503104, stammdaten=dict(frage="bezirk", distraktoren=["Horgen", "Uster"]))
    zeigen(d)        # lesen
    speichern(d)     # erst danach
"""
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "generator"))
from distraktoren import vorschlaege  # noqa: E402

SEKTOR = ("Sektoren teilen ein Perron in Abschnitte, damit Reisende dort warten "
          "können, wo ihr Wagen zu stehen kommt.")
ZUG = ("Zugzahlen werden pro Streckenabschnitt erhoben, nicht pro Bahnhof. Ein Zug, "
       "der durchfährt, zählt gleich wie einer, der hält.")
H55 = "Eine Perronkante von 55 Zentimetern entspricht der Einstiegshöhe vieler Züge."


def alle_n(n, wort_pl):
    """«beiden erfassten Gleisen» statt «allen 2 erfassten Gleisen»."""
    return f"beiden erfassten {wort_pl}" if n == 2 else f"allen {n} erfassten {wort_pl}"


def ch(n):
    if isinstance(n, float) and not n.is_integer():
        return str(n)
    return f"{int(n):,}".replace(",", "'")


def fakten(uic):
    return json.loads((ROOT / "data" / "facts" / f"{uic}.json").read_text(encoding="utf-8"))


def eindeutig(werte):
    return len(set(werte)) == len(werte)


def auswahl(uic, wert, n=3, einheit="", fmt=ch):
    """Optionen mit dem richtigen Wert, gleichmässig verteilt."""
    frei, alle = vorschlaege(int(uic), wert, n)
    opts = sorted({wert, *frei})
    texte = [f"{fmt(o)}{(' ' + einheit) if einheit else ''}" for o in opts]
    return texte, opts.index(wert), alle


def sc(uic, prompt, wert, erkl, ref, einheit="", n=3, diff=1, typ="single_choice"):
    texte, i, alle = auswahl(uic, wert, n, einheit)
    q = {"type": typ, "prompt": prompt, "options": texte, "correct": i,
         "explanation": erkl, "factRef": ref, "difficulty": diff}
    if not alle:
        q["optionen_aus_fakten"] = True
    return q


def schieber(prompt, wert, erkl, ref, einheit, step=1, diff=2):
    """Spanne unsymmetrisch, Antwort nie am Rand."""
    w = float(wert)
    unten = w * 0.82 if w > 0 else w - 10
    oben = w * 1.45 if w > 0 else w + 20
    runde = 10 if w > 200 else 1
    if w > 5000:
        runde = 500
    mn = int(unten // runde * runde)
    mx = int(-(-oben // runde) * runde)
    if not mn < w < mx:
        mn, mx = int(w) - 5 * runde, int(w) + 9 * runde
    return {"type": "slider", "prompt": prompt, "min": mn, "max": mx,
            "step": step if w < 5000 else 500, "unit": einheit, "correct": wert,
            "explanation": erkl, "factRef": ref, "difficulty": diff}


def tf(prompt, wahr, erkl, ref, diff=2):
    return {"type": "true_false", "prompt": prompt, "correct": wahr,
            "explanation": erkl, "factRef": ref, "difficulty": diff}


def sortier(prompt, items, richtung, erkl, ref, diff=3):
    return {"type": "sort", "prompt": prompt, "richtung": richtung, "items": items,
            "factRef": ref, "explanation": erkl, "difficulty": diff}


# ------------------------------------------------------------------ Kapitel

def steckbrief(f, extra_body="", extra_fragen=()):
    s = f["steckbrief"]; name = f["name"]; uic = f["uic"]
    evu = s.get("evu") or ""
    teile = [f"An einem Werktag steigen in {name} {ch(s['dwv'])} Personen ein und aus.",
             f"Im Tagesmittel über das ganze Jahr sind es {ch(s['dtv'])}, an einem "
             f"freien Tag {ch(s['dnwv'])}."]
    if evu == s.get("isb"):
        teile.append(f"Infrastruktur und Züge sind der {evu} zugeordnet.")
    elif evu:
        teile.append(f"Die Infrastruktur gehört der {s['isb']}, als Bahnunternehmen "
                     f"{'sind' if ',' in evu else 'ist'} {evu.replace(', ', ' und ')} erfasst.")
    if extra_body:
        teile.append(extra_body)
    facts = [
        {"label": "Ein- und Aussteigende an einem Werktag", "value": s["dwv"],
         "unit": "Personen", "source": "passagierfrequenz", "factRef": "steckbrief.dwv"},
        {"label": "Ein- und Aussteigende im Tagesmittel", "value": s["dtv"],
         "unit": "Personen", "source": "passagierfrequenz", "factRef": "steckbrief.dtv"},
        {"label": "Ein- und Aussteigende an einem freien Tag", "value": s["dnwv"],
         "unit": "Personen", "source": "passagierfrequenz", "factRef": "steckbrief.dnwv"}]
    fr = [sc(uic, f"Wie viele Personen steigen an einem Werktag in {name} ein und aus?",
             s["dwv"], f"An einem Werktag sind es {ch(s['dwv'])} Ein- und Aussteigende, "
             "Stand 2025.", "steckbrief.dwv")]
    # Verlauf: nur Jahre mit eindeutigem Wert
    v = [(i, x) for i, x in enumerate(s.get("verlauf") or []) if x.get("dwv")]
    zahlen = [x["dwv"] for _, x in v]
    doppelte = {z for z in zahlen if zahlen.count(z) > 1}
    v = [(i, x) for i, x in v if x["dwv"] not in doppelte]
    if len(v) >= 3:
        v.sort(key=lambda t: t[1]["dwv"])
        items = [{"label": str(x["jahr"]), "value": x["dwv"],
                  "factRef": f"steckbrief.verlauf[{i}].dwv"} for i, x in v]
        reihe = ", ".join(f"{ch(x['dwv'])} ({x['jahr']})" for _, x in v)
        fr.append(sortier("Ordne die Jahre nach dem Werktagsverkehr, tiefster Wert zuerst.",
                          items, "aufsteigend",
                          f"Die erfassten Werte, aufsteigend: {reihe}."
                          + (" Jahre mit gleichem Wert bleiben weg." if doppelte else ""),
                          "steckbrief.verlauf"))
    fr.append(sc(uic, f"An einem freien Tag steigen in {name} ___ Personen ein und aus.",
                 s["dnwv"], f"An einem freien Tag sind es {ch(s['dnwv'])} Personen, an "
                 f"einem Werktag {ch(s['dwv'])}. Gemeint sind Wochenend- und Feiertage "
                 "zusammen.", "steckbrief.dnwv", n=2, diff=2, typ="cloze"))
    if s.get("bemerkung"):
        facts.append({"label": "Abgrenzung der Zahl", "value": s["bemerkung"],
                      "source": "passagierfrequenz", "factRef": "steckbrief.bemerkung"})
    fr += list(extra_fragen)
    return {"id": "steckbrief", "title": "Steckbrief", "body": " ".join(teile),
            "facts": facts, "questions": fr}


def stammdaten(f, frage="abkuerzung", distraktoren=()):
    st = f["stammdaten"]; name = f["name"]
    ort = []
    if st.get("gemeinde"):
        ort.append(f"in der Gemeinde {st['gemeinde']}")
    if st.get("bezirk"):
        ort.append(f"Bezirk {st['bezirk']}")
    kanton_de = {"Zürich", "Bern", "Aargau", "Luzern", "Thurgau", "St. Gallen",
                 "Solothurn", "Schwyz", "Zug", "Glarus", "Basel-Landschaft",
                 "Basel-Stadt", "Uri", "Schaffhausen", "Graubünden", "Jura",
                 "Obwalden", "Nidwalden", "Appenzell Ausserrhoden", "Appenzell Innerrhoden"}
    body = f"{name} liegt auf {st['hoehe_m_ue_m']} Metern über Meer"
    body += (" " + ", ".join(ort)) if ort else ""
    if st.get("kanton") in kanton_de:
        body += f", Kanton {st['kanton']}."
    else:
        body += f". Als Kanton ist in den Stammdaten {st['kanton']} eingetragen."
    if not st.get("bezirk"):
        body += " Ein Bezirk ist in den Stammdaten nicht eingetragen."
    body += (" Betrieben wird die Anlage von den Schweizerischen Bundesbahnen SBB. "
             f"Die offizielle Abkürzung lautet {st['abkuerzung']}.")
    facts = [{"label": "Höhe über Meer", "value": st["hoehe_m_ue_m"], "unit": "m",
              "source": "haltestelle-haltekante", "factRef": "stammdaten.hoehe_m_ue_m"},
             {"label": "Offizielle Abkürzung", "value": st["abkuerzung"],
              "source": "haltestelle-haltekante", "factRef": "stammdaten.abkuerzung"}]
    fr = [schieber(f"Auf welcher Höhe über Meer liegt der Bahnhof {name}?",
                   st["hoehe_m_ue_m"], f"Der Bahnhof liegt auf {st['hoehe_m_ue_m']} "
                   "Metern über Meer.", "stammdaten.hoehe_m_ue_m", "m ü. M.")]
    if frage == "abkuerzung" and distraktoren:
        opts = sorted({st["abkuerzung"], *distraktoren})
        fr.append({"type": "cloze",
                   "prompt": f"Die offizielle Abkürzung des Bahnhofs {name} lautet ___.",
                   "options": opts, "correct": opts.index(st["abkuerzung"]),
                   "optionen_aus_fakten": True,
                   "explanation": f"In den Stammdaten ist {st['abkuerzung']} als "
                                  "Abkürzung erfasst.",
                   "factRef": "stammdaten.abkuerzung", "difficulty": 2})
    elif frage in ("bezirk", "gemeinde") and distraktoren:
        wert = st[frage]
        opts = sorted({wert, *distraktoren})
        facts.append({"label": frage.capitalize(), "value": wert,
                      "source": "haltestelle-haltekante", "factRef": f"stammdaten.{frage}"})
        fr.append({"type": "single_choice",
                   "prompt": f"In welche{'m Bezirk' if frage == 'bezirk' else 'r Gemeinde'} "
                             f"liegt der Bahnhof {name}?",
                   "options": opts, "correct": opts.index(wert),
                   "optionen_aus_fakten": True,
                   "explanation": f"Als {'Bezirk' if frage == 'bezirk' else 'Gemeinde'} "
                                  f"ist {wert} eingetragen.",
                   "factRef": f"stammdaten.{frage}", "difficulty": 2})
    return {"id": "stammdaten", "title": "Stammdaten", "body": body,
            "facts": facts, "questions": fr}


def perrons(f):
    pr = f["perrons"]; name = f["name"]; uic = f["uic"]
    items = pr["items"]; n = pr["anzahl_mit_daten"]
    hf = f.get("hindernisfreiheit") or {}
    ja, nein, ohne = (pr["niveaufrei_erreichbar"], hf.get("perrons_nicht_niveaufrei", 0),
                      hf.get("perrons_ohne_zugangsangabe", 0))
    mit_laenge = [(i, it) for i, it in enumerate(items) if it.get("laenge_m")]
    satz = [f"Zu {n} {'Perron' if n == 1 else 'Perrons'} in {name} liegen offene Daten vor."]
    if n == 1:
        it = items[0]
        satz.append(f"Perron {it['nr']} ist ein {it['typ']} von {it['laenge_m']} Metern.")
    else:
        beschr = ", ".join(f"Perron {it['nr']} misst {it['laenge_m']} Meter"
                           for _, it in sorted(mit_laenge, key=lambda t: -t[1]["laenge_m"])[:4])
        satz.append(beschr[0].upper() + beschr[1:] + ".")
    if ja == n:
        satz.append(("Beide erfassten Perrons sind" if n == 2 else "Alle erfassten Perrons sind")
                    + " niveaufrei erreichbar." if n > 1 else "Es ist niveaufrei erreichbar.")
    else:
        t = f"{ja} {'ist' if ja == 1 else 'sind'} als niveaufrei vermerkt"
        if nein:
            t += f", {nein} ausdrücklich als nicht niveaufrei"
        if ohne:
            t += f", zu {ohne} fehlt die Angabe zum Zugang"
        satz.append(t[0].upper() + t[1:] + ".")
    facts = [{"label": "Perrons mit offenen Daten", "value": n, "source": "perron",
              "factRef": "perrons.anzahl_mit_daten"},
             {"label": "Längstes erfasstes Perron", "value": pr["laengste_m"], "unit": "m",
              "source": "perron", "factRef": "perrons.laengste_m"}]
    fr = []
    laengen = [it["laenge_m"] for _, it in mit_laenge]
    if len(mit_laenge) >= 3 and eindeutig(laengen):
        s = sorted(mit_laenge, key=lambda t: -t[1]["laenge_m"])[:5]
        fr.append(sortier("Ordne die Perrons nach Länge, längstes zuerst.",
                          [{"label": f"Perron {it['nr']}", "value": it["laenge_m"],
                            "factRef": f"perrons.items[{i}].laenge_m"} for i, it in s],
                          "absteigend",
                          ", ".join(f"Perron {it['nr']} misst {it['laenge_m']} Meter"
                                    for _, it in s) + ".", "perrons.items", diff=2))
    else:
        einzig = n == 1
        fr.append(sc(uic, f"Wie lang ist das {'' if einzig else 'längste '}erfasste Perron in {name}?",
                     pr["laengste_m"],
                     f"Das {'' if einzig else 'längste '}erfasste Perron misst {pr['laengste_m']} Meter."
                     + (" Es ist das einzige, zu dem offene Daten vorliegen." if einzig else ""),
                     "perrons.laengste_m", einheit="m", n=3))
    fl = [(i, it) for i, it in enumerate(items) if it.get("flaeche_netto_m2")]
    def deutlich(werte, anteil=0.1):
        w = sorted(werte)
        return all(b - a >= anteil * b for a, b in zip(w, w[1:]))
    if len(fl) >= 2 and deutlich([it["flaeche_netto_m2"] for _, it in fl[:3]]):
        fl = fl[:3]
        fr.append({"type": "match", "prompt": "Welche erfasste Nettofläche gehört zu welchem Perron?",
                   "pairs": [{"links": f"Perron {it['nr']}",
                              "rechts": f"{it['flaeche_netto_m2']} m²",
                              "factRef": f"perrons.items[{i}].flaeche_netto_m2"} for i, it in fl],
                   "factRef": "perrons.items",
                   "explanation": ", ".join(f"Perron {it['nr']} hat {it['flaeche_netto_m2']} "
                                            "Quadratmeter" for _, it in fl) + ".",
                   "difficulty": 3})
    if n >= 2:
        if ja == n:
            fr.append(tf(f"{'Beide' if n == 2 else 'Alle ' + str(n)} erfassten Perrons in "
                         f"{name} sind niveaufrei erreichbar.", True,
                         f"Für {'beide' if n == 2 else 'alle ' + str(n)} Perrons mit Daten ist "
                         "ein niveaufreier Zugang verzeichnet.", "perrons.niveaufrei_erreichbar", diff=1))
        else:
            e = f"Für {ja} der {n} erfassten Perrons ist ein niveaufreier Zugang vermerkt."
            if nein:
                e += f" {nein} {'ist' if nein == 1 else 'sind'} ausdrücklich als nicht niveaufrei erfasst."
            if ohne:
                e += f" Zu {ohne} fehlt die Angabe."
            fr.append(tf(f"Zu allen {n} erfassten Perrons in {name} ist ein niveaufreier "
                         "Zugang vermerkt.", False, e, "perrons.niveaufrei_erreichbar"))
    else:
        fr.append(tf(f"Das erfasste Perron in {name} ist niveaufrei erreichbar.", ja == 1,
                     "Für das Perron mit Daten ist ein niveaufreier Zugang "
                     + ("verzeichnet." if ja else "nicht verzeichnet."),
                     "perrons.niveaufrei_erreichbar", diff=1))
    return {"id": "perrons", "title": "Perrons", "body": " ".join(satz),
            "facts": facts, "questions": fr}


def gleise(f):
    gl = f["gleise"]; name = f["name"]; uic = f["uic"]
    items = gl["items"]; n = gl["anzahl_mit_daten"]
    nummern = gl["nummern"]
    satz = [f"Zu {n} {'Gleis' if n == 1 else 'Gleisen'} liegen offene Daten vor: "
            + (", ".join(nummern[:-1]) + " und " + nummern[-1] if n > 1 else nummern[0]) + "."]
    hoehen = gl["perronhoehen_cm"]
    if not hoehen:
        satz.append("Perronhöhen sind zu diesen Gleisen nicht vermerkt.")
    elif all(it["perronhoehen_cm"] == [55] for it in items if it["perronhoehen_cm"]) \
            and all(it["perronhoehen_cm"] for it in items):
        satz.append(f"An {alle_n(n, 'Gleisen') if n > 1 else 'dem erfassten Gleis'} "
                    "ist eine Perronhöhe von 55 Zentimetern verzeichnet.")
    else:
        satz.append("Erfasst sind Perronhöhen von "
                    + ", ".join(str(h) for h in hoehen[:-1]) + f" und {hoehen[-1]} Zentimetern."
                    if len(hoehen) > 1 else f"Erfasst ist eine Perronhöhe von {hoehen[0]} Zentimetern.")
    kanten = [(i, it) for i, it in enumerate(items) if it.get("perronkante_m")]
    ohne_sektor = [it["nr"] for it in items if not it["sektoren_anzahl"]]
    mit_sektor = [(i, it) for i, it in enumerate(items) if it["sektoren_anzahl"]]
    if ohne_sektor and mit_sektor:
        satz.append(f"Zu {'Gleis ' + ohne_sektor[0] if len(ohne_sektor) == 1 else 'den Gleisen ' + ', '.join(ohne_sektor)} "
                    "sind keine Sektortafeln erfasst.")
    elif not mit_sektor:
        satz.append("Sektortafeln sind zu keinem dieser Gleise erfasst.")
    facts = [{"label": "Gleise mit offenen Daten", "value": n,
              "source": "21197_behig-haltekantesegment", "factRef": "gleise.anzahl_mit_daten"}]
    fr = []
    if len(kanten) >= 2:
        werte = [it["perronkante_m"] for _, it in kanten]
        hoechst = max(werte)
        if werte.count(hoechst) == 1 and len(sorted(set(werte))) >= 2 \
                and hoechst - sorted(werte)[-2] >= max(10, 0.05 * hoechst):
            i, it = next(t for t in kanten if t[1]["perronkante_m"] == hoechst)
            zweit = sorted(werte)[-2]
            facts.append({"label": "Längste erfasste Perronkante", "value": hoechst, "unit": "m",
                          "source": "21197_behig-haltekantesegment",
                          "factRef": f"gleise.items[{i}].perronkante_m"})
            fr.append({"type": "hotspot",
                       "prompt": "Welches Gleis hat die längste erfasste Perronkante?",
                       "schema": "gleise", "correct": it["nr"],
                       "factRef": f"gleise.items[{i}].nr",
                       "explanation": f"Gleis {it['nr']} hat mit {hoechst} Metern die "
                                      f"längste erfasste Perronkante, die nächste misst {zweit} Meter.",
                       "difficulty": 2})
        if len(kanten) >= 3 and eindeutig(werte):
            s = sorted(kanten, key=lambda t: -t[1]["perronkante_m"])[:5]
            fr.append(sortier("Ordne die Gleise nach der erfassten Perronkante, längste zuerst.",
                              [{"label": f"Gleis {it['nr']}", "value": it["perronkante_m"],
                                "factRef": f"gleise.items[{i}].perronkante_m"} for i, it in s],
                              "absteigend",
                              ", ".join(f"Gleis {it['nr']} misst {it['perronkante_m']} Meter"
                                        for _, it in s) + ".", "gleise.items"))
    if mit_sektor:
        i, it = mit_sektor[0]
        k = it["sektoren_anzahl"]
        facts.append({"label": f"Sektoren an Gleis {it['nr']}", "value": k,
                      "source": "sektortafel", "factRef": f"gleise.items[{i}].sektoren_anzahl"})
        texte, idx, alle = auswahl(uic, k, 2)
        q = {"type": "cloze", "prompt": f"An Gleis {it['nr']} in {name} sind ___ Sektoren erfasst.",
             "options": texte, "correct": idx, "optionen_aus_fakten": True,
             "explanation": (f"Gleis {it['nr']} trägt die Sektoren "
                             f"{', '.join(it['sektoren'][:-1])} und {it['sektoren'][-1]}, also {k} Stück."
                             if k > 1 else
                             f"Gleis {it['nr']} trägt nur den Sektor {it['sektoren'][0]}."),
             "factRef": f"gleise.items[{i}].sektoren_anzahl", "difficulty": 2}
        fr.append(q)
    # Mehrfachauswahl nur, wenn mindestens eine Option falsch ist. Bei Coppet
    # trug Gleis 1 alle vier Höhen, und alle vier Optionen waren richtig.
    mehrere = [(i, it) for i, it in enumerate(items) if 2 <= len(it["perronhoehen_cm"]) <= 3]
    if mehrere and len(hoehen) >= 2:
        i, it = mehrere[0]
        eigene = sorted(it["perronhoehen_cm"])
        fremde = [h for h in (20, 25, 30, 35, 42, 55, 76) if h not in eigene]
        # bevorzugt Höhen, die am Bahnhof vorkommen, aber nicht an diesem Gleis
        fremde.sort(key=lambda h: (h not in hoehen, abs(h - eigene[0])))
        opts_h = sorted(eigene + fremde[:4 - len(eigene)])
        if any(h not in eigene for h in opts_h):
            fr.append({"type": "multiple_choice",
                       "prompt": f"Welche Perronhöhen sind für Gleis {it['nr']} in {name} erfasst? (Mehrfachauswahl)",
                       "options": [f"{h} cm" for h in opts_h],
                       "correct": [opts_h.index(h) for h in it["perronhoehen_cm"]],
                       "optionen_aus_fakten": True,
                       "explanation": f"An Gleis {it['nr']} sind "
                                      + (", ".join(str(h) for h in eigene[:-1]) + " und " + str(eigene[-1]))
                                      + " Zentimeter verzeichnet.",
                       "factRef": f"gleise.items[{i}].perronhoehen_cm", "difficulty": 3})
    elif hoehen == [55] and n >= 2:
        fr.append(tf(f"An den erfassten Gleisen in {name} kommt nur eine einzige Perronhöhe vor.",
                     True, f"Für {'beide' if n == 2 else 'alle ' + str(n)} erfassten Gleise sind "
                     "ausschliesslich 55 Zentimeter verzeichnet.", "gleise.perronhoehen_cm"))
    elif not hoehen:
        fr.append(tf(f"Zu den erfassten Gleisen in {name} ist eine Perronhöhe vermerkt.", False,
                     "Zu keinem der erfassten Gleise ist eine Perronhöhe vermerkt. Ob der "
                     "Einstieg stufenfrei ist, sagen die offenen Daten damit nicht.",
                     "gleise.perronhoehen_cm", diff=3))
    # Rückfall: ein Kapitel ohne Frage taugt nicht
    if not fr:
        viel = max(((i, it) for i, it in enumerate(items)), key=lambda t: len(t[1]["perronhoehen_cm"]))
        i, it = viel
        k = len(it["perronhoehen_cm"])
        if k >= 2:
            # nicht «4 verschiedene Höhen» - eine gezählte Zahl stünde nicht in den Fakten
            liste = ", ".join(str(h) for h in it["perronhoehen_cm"][:-1]) + f" und {it['perronhoehen_cm'][-1]}"
            fr.append(tf(f"An Gleis {it['nr']} in {name} sind Perronhöhen von {liste} Zentimetern erfasst.",
                         True, f"An Gleis {it['nr']} kommen mehrere Höhen vor: {liste} Zentimeter. "
                         "An den übrigen erfassten Gleisen ist jeweils nur eine Höhe verzeichnet."
                         if all(len(x["perronhoehen_cm"]) <= 1 for j, x in enumerate(items) if j != i)
                         else f"An Gleis {it['nr']} kommen mehrere Höhen vor: {liste} Zentimeter.",
                         f"gleise.items[{i}].perronhoehen_cm", diff=3))
        elif not mit_sektor:
            fr.append(tf(f"Zu den erfassten Gleisen in {name} sind Sektortafeln verzeichnet.", False,
                         "Zu keinem der erfassten Gleise ist eine Sektortafel in den Daten. Ob "
                         "vor Ort Sektoren angeschrieben sind, sagen die offenen Daten nicht.",
                         f"gleise.items[0].sektoren_anzahl"))
    return {"id": "gleise", "title": "Gleise", "body": " ".join(satz),
            "erlaeuterung": SEKTOR, "facts": facts, "questions": fr}


def hindernisfreiheit(f):
    hf = f["hindernisfreiheit"]; name = f["name"]; uic = f["uic"]
    satz, facts, fr = [], [], []
    seg = hf.get("segmente")
    if seg:
        proh = hf["segmente_pro_perronhoehe_cm"]
        if list(proh) == ["55"]:
            satz.append(f"Für {name} sind {seg} Perronsegmente erfasst, alle mit einer "
                        "Perronhöhe von 55 Zentimetern.")
        else:
            teile = sorted(proh.items(), key=lambda t: -t[1])
            satz.append(f"Für {name} sind {seg} Perronsegmente erfasst: "
                        + ", ".join(f"{a} mit {h} Zentimetern" for h, a in teile) + ".")
        g55, gd = hf.get("gleise_mit_55cm", 0), hf.get("gleise_mit_daten", 0)
        if gd:
            if g55 == gd:
                satz.append(f"An {alle_n(gd, 'Gleisen') if gd > 1 else 'dem erfassten Gleis'} "
                            "liegt ein Abschnitt auf 55 Zentimetern.")
            elif g55:
                satz.append(f"An {g55} der {gd} erfassten Gleise liegt ein Abschnitt auf "
                            "55 Zentimetern.")
        satz.append("Bei keinem Segment ist ein Hilfstritt verzeichnet." if not hf["segmente_mit_hilfstritt"]
                    else f"Bei {hf['segmente_mit_hilfstritt']} Segmenten ist ein Hilfstritt verzeichnet.")
        facts.append({"label": "Erfasste Perronsegmente", "value": seg,
                      "source": "21197_behig-haltekantesegment", "factRef": "hindernisfreiheit.segmente"})
        facts.append({"label": "Gleise mit Perronhöhe 55 cm", "value": g55,
                      "source": "21197_behig-haltekantesegment", "factRef": "hindernisfreiheit.gleise_mit_55cm"})
        texte, i, alle = auswahl(uic, seg, 2)
        fr.append({"type": "cloze", "prompt": f"In {name} sind ___ Perronsegmente erfasst.",
                   "options": texte, "correct": i, "optionen_aus_fakten": True,
                   "explanation": f"Die BehiG-Erhebung führt {seg} Segmente, Stand 2023.",
                   "factRef": "hindernisfreiheit.segmente", "difficulty": 1})
        if not hf["segmente_mit_hilfstritt"]:
            fr.append(tf(f"Bei keinem der {seg} erfassten Perronsegmente ist ein Hilfstritt verzeichnet.",
                         True, f"Die Erhebung weist bei 0 der {seg} Segmente einen Hilfstritt "
                         "aus. Das heisst nicht, dass vor Ort keiner steht.",
                         "hindernisfreiheit.segmente_mit_hilfstritt"))
    else:
        satz.append(f"Perronsegmente zur Hindernisfreiheit sind für {name} keine erhoben.")
        pn, pd = hf.get("perrons_niveaufrei"), hf.get("perrons_mit_daten")
        if pd:
            satz.append(f"Von den {pd} erfassten Perrons "
                        f"{'ist' if pn == 1 else 'sind'} {pn} als niveaufrei erreichbar vermerkt.")
            facts.append({"label": "Niveaufrei erreichbare Perrons", "value": pn,
                          "source": "perron", "factRef": "hindernisfreiheit.perrons_niveaufrei"})
        fr.append(tf(f"Für {name} sind Perronsegmente zur Hindernisfreiheit erhoben.", False,
                     "Die BehiG-Erhebung führt für diesen Bahnhof keine Segmente. Erfasst ist "
                     "nur der Zugang zu den Perrons.", "hindernisfreiheit.perrons_mit_daten", diff=3))
    if hf.get("sicherheitslinie"):
        satz.append("Eine visuell-taktile Sicherheitslinie ist erfasst.")
        facts.append({"label": "Sicherheitslinie", "value": hf["sicherheitslinie"],
                      "source": "haltestelle-visuell-taktile-sicherheitslinie",
                      "factRef": "hindernisfreiheit.sicherheitslinie"})
    if seg:
        satz.append("Der Datenstand dieser Erhebung ist 2023.")
    return {"id": "hindernisfreiheit", "title": "Hindernisfreiheit", "body": " ".join(satz),
            "erlaeuterung": H55, "facts": facts, "questions": fr}


def zuege(f):
    zu = f["zuege"]; name = f["name"]; uic = f["uic"]
    st = zu["staerkster_abschnitt"]
    ab = [(i, a) for i, a in enumerate(zu["abschnitte"])]
    pv = [(i, a) for i, a in ab if a["art"] == "Personenverkehr" and a["zuege_pro_tag"]]
    gv = [(i, a) for i, a in ab if a["art"] == "Gueterverkehr" and a["zuege_pro_tag"]]
    def abschn(a):
        return f"{a['von']} – {a['bis']}"
    satz = [f"Am stärksten befahren ist der Abschnitt {abschn(st)}: Im Personenverkehr "
            f"verkehren dort {st['zuege_pro_tag']} Züge pro Tag, das sind "
            f"{ch(st['zuege_pro_jahr'])} im Jahr."]
    weitere = [a for _, a in pv[1:3]]
    if weitere:
        satz.append("Auf " + " und auf ".join(f"dem Abschnitt {abschn(a)} sind es {a['zuege_pro_tag']}"
                                              for a in weitere) + " Züge pro Tag.")
    if gv:
        m = max(a['zuege_pro_tag'] for _, a in gv)
        satz.append(f"Im Güterverkehr zählt die Erhebung bis zu {m} {'Zug' if m == 1 else 'Züge'} "
                    "pro Tag auf einem Abschnitt.")
    else:
        satz.append("Güterverkehr ist auf diesen Abschnitten keiner erfasst.")
    facts = [{"label": f"Züge pro Tag, Personenverkehr {abschn(st)}", "value": st["zuege_pro_tag"],
              "unit": "Züge/Tag", "source": "zugzahlen",
              "factRef": "zuege.staerkster_abschnitt.zuege_pro_tag"},
             {"label": f"Züge pro Jahr, Personenverkehr {abschn(st)}", "value": st["zuege_pro_jahr"],
              "unit": "Züge/Jahr", "source": "zugzahlen",
              "factRef": "zuege.staerkster_abschnitt.zuege_pro_jahr"}]
    fr = [sc(uic, f"Wie viele Züge pro Tag verkehren im Personenverkehr auf dem Abschnitt {abschn(st)}?",
             st["zuege_pro_tag"], f"Auf diesem Abschnitt zählt die Erhebung {st['zuege_pro_tag']} "
             "Züge pro Tag, beide Richtungen zusammen.", "zuege.staerkster_abschnitt.zuege_pro_tag")]
    alle = [(i, a) for i, a in ab if a["zuege_pro_jahr"] >= 100]
    werte = [a["zuege_pro_jahr"] for _, a in alle]
    if len(alle) >= 3 and eindeutig(werte):
        s = sorted(alle, key=lambda t: -t[1]["zuege_pro_jahr"])[:4]
        art = lambda a: "Personenverkehr" if a["art"] == "Personenverkehr" else "Güterverkehr"
        fr.append(sortier("Ordne die Abschnitte nach Zügen pro Jahr, meiste zuerst.",
                          [{"label": f"{abschn(a)}, {art(a)}", "value": a["zuege_pro_jahr"],
                            "factRef": f"zuege.abschnitte[{i}].zuege_pro_jahr"} for i, a in s],
                          "absteigend",
                          ", ".join(f"{abschn(a)} ({art(a)}) {ch(a['zuege_pro_jahr'])}" for _, a in s)
                          + " Züge im Jahr.", "zuege.abschnitte"))
    else:
        fr.append(schieber(f"Wie viele Züge verkehren im Personenverkehr pro Jahr auf dem Abschnitt {abschn(st)}?",
                           st["zuege_pro_jahr"], f"Die Erhebung zählt {ch(st['zuege_pro_jahr'])} "
                           "Züge im Jahr, beide Richtungen zusammen, Stand 2025.",
                           "zuege.staerkster_abschnitt.zuege_pro_jahr", "Züge/Jahr", diff=3))
    return {"id": "zuege", "title": "Züge", "body": " ".join(satz), "erlaeuterung": ZUG,
            "facts": facts, "questions": fr}


def linien(f):
    li = f["linien"]; name = f["name"]; uic = f["uic"]
    items = li["items"]
    if len(items) == 1:
        it = items[0]
        body = (f"Für {name} ist 1 Linie erfasst: die Linie {it['nummer']} {it['name']}. "
                f"Der Bahnhof ist darauf bei Kilometer {it['km_am_bahnhof']} eingetragen.")
    else:
        teile = [f"die Linie {it['nummer']} {it['name']}" for it in items]
        body = (f"Für {name} sind {len(items)} Linien erfasst: "
                + ", ".join(teile[:-1]) + " und " + teile[-1] + ".")
    facts = [{"label": "Erfasste Linien", "value": li["anzahl"],
              "source": "linie-mit-betriebspunkten", "factRef": "linien.anzahl"}]
    fr = []
    haupt = max(range(len(items)), key=lambda i: items[i]["km_am_bahnhof"] or 0)
    it = items[haupt]
    if it["km_am_bahnhof"] and it["km_am_bahnhof"] > 1:
        facts.append({"label": f"Kilometrierung auf der Linie {it['nummer']}",
                      "value": it["km_am_bahnhof"], "unit": "km",
                      "source": "linie-mit-betriebspunkten",
                      "factRef": f"linien.items[{haupt}].km_am_bahnhof"})
        fr.append(schieber(f"Bei welchem Streckenkilometer der Linie {it['nummer']} ist {name} eingetragen?",
                           it["km_am_bahnhof"], f"Die Kilometrierung von {name} auf der Linie "
                           f"{it['nummer']} beträgt {it['km_am_bahnhof']}. Der Wert nennt den "
                           "Standort des Bahnhofs auf der Linie.",
                           f"linien.items[{haupt}].km_am_bahnhof", "km", diff=3))
    if len(items) >= 2 and eindeutig([x["name"] for x in items]):
        fr.append({"type": "match", "prompt": "Welche Bezeichnung gehört zu welcher Liniennummer?",
                   "pairs": [{"links": f"Linie {x['nummer']}", "rechts": x["name"],
                              "factRef": f"linien.items[{i}].name"} for i, x in enumerate(items[:3])],
                   "factRef": "linien.items",
                   "explanation": ("Die " + ", die ".join(f"Linie {x['nummer']} heisst {x['name']}"
                                                          for x in items[:3]) + "."),
                   "difficulty": 2})
    return {"id": "linien", "title": "Linien", "body": body, "facts": facts, "questions": fr}


def services(f):
    sv = f["services"]; name = f["name"]; uic = f["uic"]
    teile = []
    if sv["billettautomaten_erfasst"]:
        typen = sv.get("automat_typen") or []
        t = f"{sv['billettautomaten_erfasst']} {'Billettautomat' if sv['billettautomaten_erfasst'] == 1 else 'Billettautomaten'}"
        if typen and not any(x in ("Andere", "Altri") for x in typen):
            t += f" vom Typ {' und '.join(typen)}" if len(typen) == 1 else f" der Typen {' und '.join(typen)}"
        teile.append(t)
    if sv["billettentwerter_erfasst"]:
        teile.append(f"{sv['billettentwerter_erfasst']} Billettentwerter")
    if sv["wartehallen_erfasst"]:
        teile.append(f"{sv['wartehallen_erfasst']} {'Wartehalle' if sv['wartehallen_erfasst'] == 1 else 'Wartehallen'}")
    satz = []
    if sv["wlan_erfasst"]:
        satz.append(f"{name} steht in der Liste der WLAN-Standorte.")
    if teile:
        satz.append("Erfasst sind " + (", ".join(teile[:-1]) + " und " + teile[-1] if len(teile) > 1 else teile[0]) + ".")
    fehlt = []
    if not sv["billettautomaten_erfasst"]:
        fehlt.append("Billettautomaten")
    if not sv["wartehallen_erfasst"]:
        fehlt.append("Wartehallen")
    if fehlt:
        satz.append(" und ".join(fehlt) + " sind keine verzeichnet.")
    if not sv["wlan_erfasst"]:
        satz.append(f"{name} steht nicht in der Liste der WLAN-Standorte.")
    facts = [{"label": "WLAN erfasst", "value": sv["wlan_erfasst"], "unit": "",
              "source": "wifistation", "factRef": "services.wlan_erfasst"}]
    for feld, lab, q in (("billettautomaten_erfasst", "Billettautomaten erfasst", "billetautomat"),
                         ("billettentwerter_erfasst", "Billettentwerter erfasst", "billetentwerter")):
        facts.append({"label": lab, "value": sv[feld], "source": q, "factRef": f"services.{feld}"})
    fr = [tf(f"{name} steht in der Liste der WLAN-Standorte.", bool(sv["wlan_erfasst"]),
             "Der Bahnhof ist in den offenen WLAN-Daten "
             + ("aufgeführt." if sv["wlan_erfasst"] else "nicht aufgeführt. Ob vor Ort WLAN "
                "verfügbar ist, sagen die Daten nicht."),
             "services.wlan_erfasst", diff=1 if sv["wlan_erfasst"] else 2)]
    if sv["billettentwerter_erfasst"]:
        w = sv["billettentwerter_erfasst"]
        texte, i, alle = auswahl(uic, w, 2)
        fr.append({"type": "cloze", "prompt": f"In {name} sind ___ Billettentwerter erfasst.",
                   "options": texte, "correct": i, "optionen_aus_fakten": True,
                   "explanation": f"Erfasst sind {w} Billettentwerter. Die Zahl gibt wieder, "
                                  "was in den offenen Daten steht, nicht zwingend, was vor Ort hängt.",
                   "factRef": "services.billettentwerter_erfasst", "difficulty": 2})
    return {"id": "services", "title": "Services", "body": " ".join(satz),
            "facts": facts, "questions": fr}


def bahnhofplan(f):
    bp = f["bahnhofplan"]; name = f["name"]
    if bp.get("a4_pdf"):
        body = (f"Für {name} ist ein Bahnhofplan veröffentlicht, als A4-Blatt und als "
                "Plakat. Eigentümerin der Pläne ist die SBB."
                + (" Ein eigener Shopping-Plan liegt nicht vor." if not bp.get("shopping_pdf") else
                   " Dazu gibt es einen eigenen Shopping-Plan."))
        facts = [{"label": "Plan als A4-Blatt", "value": bp["a4_pdf"],
                  "source": "haltestelle-karte-trafimage", "factRef": "bahnhofplan.a4_pdf"}]
        fr = [tf(f"Für {name} ist ein Bahnhofplan als PDF veröffentlicht.", True,
                 "Es liegen zwei Fassungen vor, ein A4-Blatt und ein Plakat. Pläne gibt es "
                 "nur für einen kleinen Teil der Bahnhöfe.", "bahnhofplan.a4_pdf", diff=1)]
    else:
        body = (f"{name} ist in der Planübersicht aufgeführt, als Eigentümerin ist die SBB "
                "vermerkt. Ein PDF des Plans ist in den offenen Daten aber nicht hinterlegt.")
        facts = [{"label": "Eigentümerin der Pläne", "value": bp["eigentuemer"],
                  "source": "haltestelle-karte-trafimage", "factRef": "bahnhofplan.eigentuemer"}]
        fr = [tf(f"Für {name} ist ein Bahnhofplan als PDF hinterlegt.", False,
                 "Der Bahnhof steht in der Planübersicht, aber kein PDF ist in den Daten verlinkt.",
                 "bahnhofplan.a4_pdf")]
    return {"id": "bahnhofplan", "title": "Bahnhofplan", "body": body, "facts": facts, "questions": fr}


BAUER = {"steckbrief": steckbrief, "stammdaten": stammdaten, "perrons": perrons,
         "gleise": gleise, "hindernisfreiheit": hindernisfreiheit, "zuege": zuege,
         "linien": linien, "services": services, "bahnhofplan": bahnhofplan}


def profil(uic, **pro_kapitel):
    """Baut ein Profil. pro_kapitel: {'steckbrief': dict(extra_body=..., ...), ...}
    oder None, um ein Kapitel auszulassen."""
    f = fakten(uic)
    kap = []
    for kid in f["verfuegbare_kapitel"]:
        if kid in ("ausstattung", "tagesrhythmus"):
            continue
        if kid in pro_kapitel and pro_kapitel[kid] is None:
            continue
        opts = pro_kapitel.get(kid) or {}
        if kid in BAUER:
            kap.append(BAUER[kid](f, **opts))
    quellen = sorted({x["source"] for k in kap for x in k["facts"]})
    return {"uic": f["uic"], "name": f["name"], "tier": f["tier"], "lang": "de",
            "dataYear": 2025, "generated": str(date.today()), "sources": quellen,
            "chapters": kap, "luecken": f["luecken"]}


def speichern(d):
    p = ROOT / "data" / "profiles" / f"{d['uic']}.de.json"
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    return p


def zeigen(d):
    """Lesbare Fassung zum Prüfen von Hand."""
    print("=" * 78)
    print(d["name"], d["uic"])
    for k in d["chapters"]:
        print(f"\n## {k['title']}\n{k['body']}")
        for q in k["questions"]:
            opt = ""
            if q.get("options"):
                c = q["correct"]
                opt = f"  {q['options']} → {c if isinstance(c, list) else q['options'][c]}"
            elif q["type"] == "true_false":
                opt = f"  → {q['correct']}"
            elif q["type"] == "slider":
                opt = f"  [{q['min']}–{q['max']}] → {q['correct']}"
            elif q["type"] == "hotspot":
                opt = f"  → Gleis {q['correct']}"
            elif q.get("items"):
                opt = "  " + " > ".join(f"{x['label']}={x['value']}" for x in q["items"])
            elif q.get("pairs"):
                opt = "  " + "; ".join(f"{x['links']}={x['rechts']}" for x in q["pairs"])
            print(f"  · [{q['type']}] {q['prompt']}{opt}")
            print(f"      {q['explanation']}")
