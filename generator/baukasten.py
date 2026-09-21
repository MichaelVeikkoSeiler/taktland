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
import functools
import json
import math
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "generator"))
from distraktoren import vorschlaege  # noqa: E402
from taktland import SAMMELANGABEN, hoechstens_fragen, klar_getrennt, zu_nah  # noqa: E402

SEKTOR = ("Sektoren teilen ein Perron in Abschnitte, damit Reisende dort warten "
          "können, wo ihr Wagen zu stehen kommt.")
# ohne das Wort «Zug» für sich allein: Beim Bahnhof Zug hielt der Validator
# es für den Bahnhofsnamen in einer Erläuterung
ZUG = ("Zugzahlen werden pro Streckenabschnitt erhoben, nicht pro Bahnhof. "
       "Durchfahrende Züge zählen gleich wie haltende.")
#: Jahr, das die App als «Daten von …» zeigt
DATENJAHR = 2025
H55 = "Eine Perronkante von 55 Zentimetern entspricht der Einstiegshöhe vieler Züge."


def alle_n(n, wort_pl):
    """«beiden erfassten Gleisen» statt «allen 2 erfassten Gleisen»."""
    return f"beiden erfassten {wort_pl}" if n == 2 else f"allen {n} erfassten {wort_pl}"


def ch(n):
    if isinstance(n, float) and not n.is_integer():
        return str(n)
    return f"{int(n):,}".replace(",", "'")


def aufzaehlung(teile):
    """«A», «A und B», «A, B und C». Zweimal stand hier «A und B und C»,
    einmal bei den Bahnunternehmen, einmal bei den Automatentypen."""
    teile = [str(t) for t in teile]
    return teile[0] if len(teile) == 1 else ", ".join(teile[:-1]) + " und " + teile[-1]


def punkt(text):
    """Satzende ohne doppelten Punkt: Linie 260 heisst «… Biel/Bienne Aebistr.»."""
    return text if text.endswith(".") else text + "."


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
    # Kleine Werte wie Kilometer 2.354: In Einerschritten zählte die App bei
    # 1 bis 4 km die Hälfte aller Stellungen als richtig (Toleranz = Schritt).
    if 0 < w < 20 and not w.is_integer():
        runde, step = 0.5, 0.1
    fest = (lambda x: round(x, 1)) if runde < 1 else int
    mn = fest(unten // runde * runde)
    mx = fest(-(-oben // runde) * runde)
    if not mn < w < mx:
        mn, mx = fest(w - 5 * runde), fest(w + 9 * runde)
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
    if s.get("jahr") and s["jahr"] != DATENJAHR:
        # Die App zeigt «Daten von 2025», die Fahrgastzahlen von Mols sind
        # aus 2018. Ohne diesen Satz läse man sie als Stand 2025.
        teile.append(f"Der Datenstand dieser Zahlen ist {s['jahr']}.")
    if evu == s.get("isb"):
        teile.append(f"Infrastruktur und Züge sind der {evu} zugeordnet.")
    elif evu:
        namen = evu.split(", ")
        liste = aufzaehlung(namen)
        teile.append(f"Die Infrastruktur gehört der {s['isb']}, als Bahnunternehmen "
                     f"{'sind' if len(namen) > 1 else 'ist'} {liste} erfasst.")
    if s.get("bemerkung"):
        # wörtlich, damit keine Auslegung entsteht (siehe «Ohne AB.» in SCHEMA.md)
        teile.append(f"Die Quelle vermerkt zu diesen Zahlen: «{s['bemerkung'].strip()}»")
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
             # das Jahr aus den Fakten: Mols und Matran zählen 2018, Bôle 2022
             s["dwv"], f"An einem Werktag sind es {ch(s['dwv'])} Ein- und Aussteigende, "
             f"Stand {s['jahr']}.", "steckbrief.dwv")]
    # Verlauf: nur Jahre, deren Werte man auseinanderhalten kann
    # neueste Jahre zuerst: bei gleichem Wert bleibt das neuere Jahr stehen
    alle_v = sorted([(i, x) for i, x in enumerate(s.get("verlauf") or []) if x.get("dwv")],
                    key=lambda t: -t[1]["jahr"])
    v = klar_getrennt(alle_v, wert=lambda t: t[1]["dwv"])
    doppelte = len(v) < len(alle_v)
    if len(v) >= 3:
        v.sort(key=lambda t: t[1]["dwv"])
        items = [{"label": str(x["jahr"]), "value": x["dwv"],
                  "factRef": f"steckbrief.verlauf[{i}].dwv"} for i, x in v]
        reihe = ", ".join(f"{ch(x['dwv'])} ({x['jahr']})" for _, x in v)
        fr.append(sortier("Ordne die Jahre nach dem Werktagsverkehr, tiefster Wert zuerst.",
                          items, "aufsteigend",
                          f"Die erfassten Werte, aufsteigend: {reihe}."
                          + (" Jahre mit gleichem oder fast gleichem Wert bleiben weg." if doppelte else ""),
                          "steckbrief.verlauf"))
    fr.append(sc(uic, f"An einem freien Tag steigen in {name} ___ Personen ein und aus.",
                 s["dnwv"], f"An einem freien Tag sind es {ch(s['dnwv'])} Personen, an "
                 f"einem Werktag {ch(s['dwv'])}. Gemeint sind Wochenend- und Feiertage "
                 "zusammen.", "steckbrief.dnwv", n=2, diff=2, typ="cloze"))
    if s.get("bemerkung"):
        facts.append({"label": "Abgrenzung der Zahl", "value": s["bemerkung"],
                      "source": "passagierfrequenz", "factRef": "steckbrief.bemerkung"})
        # «Ohne AB.» grenzt die wichtigste Zahl des Steckbriefs ein und
        # verdient eine eigene Frage. Nur die einfache Form wird automatisch
        # gebaut; längere Bemerkungen schreibe ich von Hand.
        import re
        # Grenzbahnhöfe (Buchs SG, St. Margrethen): wörtlich dieselbe Bemerkung
        ausland = "Einsteigende in Richtung Ausland und Aussteigende aus dem Ausland sind nur zum Teil erfasst."
        if s["bemerkung"].strip() == ausland:
            fr.append(tf(f"Die Zahl der Ein- und Aussteigenden in {name} erfasst den Verkehr "
                         "ins und aus dem Ausland vollständig.", False,
                         f"Die Quelle vermerkt: «{ausland}»", "steckbrief.bemerkung", diff=3))
        # nur einfache Namen: Aus «Ohne FLP; RhB: Bus.» (Lugano) wurde sonst
        # «umfasst auch FLP; RhB: Bus» und «Wofür FLP; RhB: Bus steht»
        m = re.fullmatch(r"Ohne ([\w\s,-]+)\.", s["bemerkung"].strip())
        if m:
            wer = m.group(1)
            fr.append(tf(f"Die Zahl der Ein- und Aussteigenden in {name} umfasst auch {wer}.",
                         False, f"Die Quelle vermerkt zu dieser Zahl «{s['bemerkung']}». "
                         f"Wofür {wer} {'stehen' if ' und ' in wer else 'steht'}, führt sie nicht aus.",
                         "steckbrief.bemerkung", diff=3))
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
    elif frage in ("bezirk", "gemeinde", "kanton") and distraktoren:
        # Kanton: etwa Moutier, das in den Stammdaten beim Kanton Jura steht
        wert = st[frage]
        opts = sorted({wert, *distraktoren})
        wort = {"bezirk": "Bezirk", "gemeinde": "Gemeinde", "kanton": "Kanton"}[frage]
        facts.append({"label": wort, "value": wert,
                      "source": "haltestelle-haltekante", "factRef": f"stammdaten.{frage}"})
        fr.append({"type": "single_choice",
                   "prompt": f"In welche{'r' if frage == 'gemeinde' else 'm'} {wort} "
                             f"liegt der Bahnhof {name}?",
                   "options": opts, "correct": opts.index(wert),
                   "optionen_aus_fakten": True,
                   "explanation": f"Als {wort} ist {wert} eingetragen.",
                   "factRef": f"stammdaten.{frage}", "difficulty": 2})
    return {"id": "stammdaten", "title": "Stammdaten", "body": body,
            "facts": facts, "questions": fr}


TAG = ("Bahnhofbenutzer sind alle Personen im Bahnhof, auch solche ohne Zugfahrt. "
       "Die Anteile zeigen, wie sich ihre Zahl auf die Stunden eines Tages und auf "
       "die Wochentage verteilt.")


def tagesrhythmus(f):
    """Stunden und Wochentage. Die alten Profile fragten «Welcher Wochentag ist
    der stärkste?» auch bei Freitag 15.4 gegen Donnerstag 15.2 Prozent (Basel
    SBB). Gefragt wird darum nur gegen klar kleinere Werte, und Gleichstand
    heisst nie «am meisten»."""
    t = f["tagesrhythmus"]; name = f["name"]
    st = t.get("stunden") or []
    wt = t.get("wochentage") or []
    QS, QW = "anzahl-sbb-bahnhofbenutzer-tagesverlauf", "anzahl-sbb-bahnhofbenutzer-wochentag"
    satz, facts, fr = [], [], []
    if st:
        top = max(x["prozent"] for x in st)
        spitze = [x for x in st if x["prozent"] == top]
        ab = aufzaehlung([str(x["stunde"]) for x in spitze])
        satz.append(f"Die meisten Bahnhofbenutzer zählt die Erhebung in {name} in der Stunde "
                    f"ab {ab} Uhr: {top} Prozent des ganzen Tages." if len(spitze) == 1 else
                    f"Die meisten Bahnhofbenutzer zählt die Erhebung in {name} in den Stunden "
                    f"ab {ab} Uhr, je {top} Prozent des ganzen Tages.")
        facts += [{"label": "Stunde mit dem grössten Anteil", "value": t["spitzenstunde"],
                   "unit": "Uhr", "source": QS, "factRef": "tagesrhythmus.spitzenstunde"},
                  {"label": "Anteil dieser Stunde am Tag", "value": t["spitzenanteil"],
                   "unit": "%", "source": QS, "factRef": "tagesrhythmus.spitzenanteil"}]
        andere = sorted([x for x in st if not zu_nah(x["prozent"], top)],
                        key=lambda x: -x["prozent"])[:3]
        if len(spitze) == 1 and len(andere) == 3:
            opts = sorted([spitze[0], *andere], key=lambda x: x["stunde"])
            fr.append({"type": "single_choice",
                       "prompt": f"In welcher Stunde zählt die Erhebung in {name} die meisten "
                                 "Bahnhofbenutzer?",
                       "options": [f"ab {x['stunde']} Uhr" for x in opts],
                       "correct": opts.index(spitze[0]), "optionen_aus_fakten": True,
                       "explanation": "Anteil am ganzen Tag: " + ", ".join(
                           f"ab {x['stunde']} Uhr {x['prozent']}" for x in [spitze[0], *andere])
                           + " Prozent.",
                       "factRef": "tagesrhythmus.spitzenstunde", "difficulty": 1})
        # eigene Spanne: Bei «10.0» rechnete schieber() in ganzen Schritten, und
        # der Regler zählte mehr als ein Viertel seiner Spanne als richtig
        fr.append({"type": "slider",
                   "prompt": f"Welcher Anteil der Bahnhofbenutzer eines Tages entfällt in {name} "
                             f"auf die Stunde ab {t['spitzenstunde']} Uhr?",
                   "min": 0, "max": int(max(20, -(-top * 2 // 5) * 5)), "step": 0.1, "unit": "%",
                   "correct": top,
                   "explanation": f"In der Stunde ab {t['spitzenstunde']} Uhr zählt die Erhebung "
                                  f"{top} Prozent der Bahnhofbenutzer des ganzen Tages.",
                   "factRef": "tagesrhythmus.spitzenanteil", "difficulty": 3})
    else:
        satz.append(f"Wie sich die Besuche über die Stunden des Tages verteilen, ist für {name} "
                    "nicht erfasst.")
    if wt:
        hoch = max(x["prozent"] for x in wt); tief = min(x["prozent"] for x in wt)
        oben = [x for x in wt if x["prozent"] == hoch]
        unten = [x for x in wt if x["prozent"] == tief]
        def auf(tage, wert):
            if len(tage) == 1:
                return f"auf den {tage[0]['tag']}, {wert} Prozent"
            return f"auf {aufzaehlung([x['tag'] for x in tage])}, je {wert} Prozent"
        satz.append(f"Über die Woche entfällt der grösste Anteil {auf(oben, hoch)}, "
                    f"der kleinste {auf(unten, tief)}.")
        if len(oben) == 1:
            facts += [{"label": "Wochentag mit dem grössten Anteil", "value": t["staerkster_wochentag"],
                       "source": QW, "factRef": "tagesrhythmus.staerkster_wochentag"},
                      {"label": "Anteil dieses Wochentags", "value": t["staerkster_wochentag_prozent"],
                       "unit": "%", "source": QW, "factRef": "tagesrhythmus.staerkster_wochentag_prozent"}]
        if len(unten) == 1:
            i = wt.index(unten[0])
            facts += [{"label": "Wochentag mit dem kleinsten Anteil", "value": unten[0]["tag"],
                       "source": QW, "factRef": f"tagesrhythmus.wochentage[{i}].tag"},
                      {"label": "Anteil dieses Wochentags", "value": tief, "unit": "%",
                       "source": QW, "factRef": f"tagesrhythmus.wochentage[{i}].prozent"}]

        def tagfrage(ziel, wort, absteigend):
            reihe = sorted(wt, key=lambda x: -x["prozent"] if absteigend else x["prozent"])
            andere = [x for x in reihe if not zu_nah(x["prozent"], ziel["prozent"])][:3]
            if len(andere) < 3:
                return None
            opts = sorted([ziel, *andere], key=wt.index)
            return {"type": "single_choice",
                    "prompt": f"Auf welchen Wochentag entfällt in {name} der {wort} Anteil "
                              "der Bahnhofbenutzer?",
                    "options": [x["tag"] for x in opts], "correct": opts.index(ziel),
                    "optionen_aus_fakten": True,
                    "explanation": "Anteil an der Woche: " + ", ".join(
                        f"{x['tag']} {x['prozent']}" for x in [ziel, *andere]) + " Prozent.",
                    "factRef": f"tagesrhythmus.wochentage[{wt.index(ziel)}].tag", "difficulty": 2}
        q = tagfrage(oben[0], "grösste", True) if len(oben) == 1 else None
        if q is None and len(unten) == 1:
            q = tagfrage(unten[0], "kleinste", False)
        if q:
            fr.append(q)
    else:
        satz.append(f"Wie sich die Besuche über die Wochentage verteilen, ist für {name} "
                    "nicht erfasst.")
    return {"id": "tagesrhythmus", "title": "Tagesrhythmus", "body": " ".join(satz),
            "erlaeuterung": TAG, "facts": facts, "questions": fr}


def perrons(f):
    pr = f["perrons"]; name = f["name"]; uic = f["uic"]
    items = pr["items"]; n = pr["anzahl_mit_daten"]
    hf = f.get("hindernisfreiheit") or {}
    ja, nein, ohne = (pr["niveaufrei_erreichbar"], hf.get("perrons_nicht_niveaufrei", 0),
                      hf.get("perrons_ohne_zugangsangabe", 0))
    mit_laenge = [(i, it) for i, it in enumerate(items) if it.get("laenge_m")]
    # Muri AG führt zwei Perrons mit der Nummer 1. Zwei gleich beschriftete
    # Karten kann niemand ordnen oder zuordnen: doppelte Nummern bleiben aus
    # Sortier- und Zuordnungsfragen, der Text nennt die Doppelung.
    nummern = [str(it["nr"]) for it in items]
    doppelt = {x for x in nummern if nummern.count(x) > 1}
    satz = [f"Zu {n} {'Perron' if n == 1 else 'Perrons'} in {name} liegen offene Daten vor."]
    if n == 1:
        it = items[0]
        # «Hilfskante» ist weiblich: «Perron 1 ist ein Hilfskante» (Egnach)
        artikel = "eine" if it["typ"].endswith("kante") else "ein"
        satz.append(f"Perron {it['nr']} ist {artikel} {it['typ']} von {it['laenge_m']} Metern.")
    else:
        reihe = [it for _, it in sorted(mit_laenge, key=lambda t: -t[1]["laenge_m"])]
        if len(reihe) <= 4:
            beschr = ", ".join(f"Perron {it['nr']} misst {it['laenge_m']} Meter" for it in reihe)
            satz.append(beschr[0].upper() + beschr[1:] + ".")
        else:
            # Basel SBB: «Zu 14 Perrons … Perron 30/31 misst 572 Meter, …» nannte
            # vier und las sich wie alle. Gleich lange an der Grenze bleiben dabei.
            grenze = reihe[3]["laenge_m"]
            lang = [it for it in reihe if it["laenge_m"] >= grenze]
            satz.append("Am längsten sind " + aufzaehlung(
                [f"Perron {it['nr']} mit {it['laenge_m']} Metern" for it in lang]) + ".")
        # Ein Perron ohne Länge wird genannt, nicht übergangen (Zwingen)
        ohne_l = [str(it["nr"]) for it in items if not it.get("laenge_m")]
        if ohne_l:
            satz.append(f"Zu {'Perron' if len(ohne_l) == 1 else 'den Perrons'} "
                        f"{aufzaehlung(ohne_l)} ist keine Länge erfasst.")
        for x in sorted(doppelt):
            satz.append(f"Die Nummer {x} kommt in den Daten zweimal vor.")
    if ja == n:
        satz.append(("Beide erfassten Perrons sind" if n == 2 else "Alle erfassten Perrons sind")
                    + " niveaufrei erreichbar." if n > 1 else "Es ist niveaufrei erreichbar.")
    elif n == 1:
        # ein einziges Perron (Beinwil am See): kein «0 sind …, 1 …»
        satz.append("Es ist ausdrücklich als nicht niveaufrei vermerkt." if nein
                    else "Zum Zugang fehlt die Angabe.")
    elif nein == n:
        # Rorschach Hafen: «0 sind als niveaufrei vermerkt, 2 ausdrücklich …»
        satz.append(("Beide erfassten Perrons sind" if n == 2 else f"Alle {n} erfassten Perrons sind")
                    + " ausdrücklich als nicht niveaufrei vermerkt.")
    else:
        teile = []
        if ja:
            teile.append(f"{ja} {'ist' if ja == 1 else 'sind'} als niveaufrei vermerkt")
        if nein:
            teile.append(f"{nein} ausdrücklich als nicht niveaufrei" if teile else
                         f"{nein} {'ist' if nein == 1 else 'sind'} ausdrücklich als nicht niveaufrei vermerkt")
        if ohne:
            teile.append(f"zu {ohne} fehlt die Angabe zum Zugang")
        t = ", ".join(teile)
        satz.append(t[0].upper() + t[1:] + ".")
    facts = [{"label": "Perrons mit offenen Daten", "value": n, "source": "perron",
              "factRef": "perrons.anzahl_mit_daten"},
             {"label": "Längstes erfasstes Perron", "value": pr["laengste_m"], "unit": "m",
              "source": "perron", "factRef": "perrons.laengste_m"}]
    fr = []
    klar = klar_getrennt([t for t in mit_laenge if str(t[1]["nr"]) not in doppelt],
                         wert=lambda t: t[1]["laenge_m"])
    if len(klar) >= 3:
        s = klar[:5]
        fr.append(sortier("Ordne die Perrons nach Länge, längstes zuerst.",
                          [{"label": f"Perron {it['nr']}", "value": it["laenge_m"],
                            "factRef": f"perrons.items[{i}].laenge_m"} for i, it in s],
                          "absteigend",
                          ", ".join(f"Perron {it['nr']} misst {it['laenge_m']} Meter"
                                    for _, it in s) + "."
                          + (" Perrons mit fast gleicher Länge bleiben weg."
                             if len(klar) < len(mit_laenge) else ""), "perrons.items", diff=2))
    else:
        einzig = n == 1
        fr.append(sc(uic, f"Wie lang ist das {'' if einzig else 'längste '}erfasste Perron in {name}?",
                     pr["laengste_m"],
                     f"Das {'' if einzig else 'längste '}erfasste Perron misst {pr['laengste_m']} Meter."
                     + (" Es ist das einzige, zu dem offene Daten vorliegen." if einzig else ""),
                     "perrons.laengste_m", einheit="m", n=3))
    fl = [(i, it) for i, it in enumerate(items)
          if it.get("flaeche_netto_m2") and str(it["nr"]) not in doppelt]
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
            fr.append(tf(f"Zu {alle_n(n, 'Perrons')} in {name} ist ein niveaufreier "
                         "Zugang vermerkt.", False, e, "perrons.niveaufrei_erreichbar"))
    elif ja or nein:  # ohne Angabe wäre «falsch» eine erfundene Tatsache
        fr.append(tf(f"Das erfasste Perron in {name} ist niveaufrei erreichbar.", ja == 1,
                     "Für das Perron mit Daten ist ein niveaufreier Zugang verzeichnet." if ja
                     else "Das Perron mit Daten ist ausdrücklich als nicht niveaufrei vermerkt."
                     if nein else "Für das Perron mit Daten fehlt die Angabe zum Zugang.",
                     "perrons.niveaufrei_erreichbar", diff=1))
    return {"id": "perrons", "title": "Perrons", "body": " ".join(satz),
            "facts": facts, "questions": fr}


def gleise(f):
    gl = f["gleise"]; name = f["name"]; uic = f["uic"]
    items = gl["items"]; n = gl["anzahl_mit_daten"]
    nummern = gl["nummern"]
    satz = [f"Zu Gleis {nummern[0]} liegen offene Daten vor." if n == 1 else
            f"Zu {n} Gleisen liegen offene Daten vor: " + aufzaehlung(nummern) + "."]
    hoehen = gl["perronhoehen_cm"]
    if not hoehen:
        satz.append("Zu diesem Gleis ist keine Perronhöhe vermerkt." if n == 1
                    else "Perronhöhen sind zu diesen Gleisen nicht vermerkt.")
    elif len(hoehen) == 1 and all(it["perronhoehen_cm"] for it in items):
        # eine einzige Höhe an allen Gleisen, nicht nur bei 55 cm (Münsingen: 30)
        satz.append(f"An {alle_n(n, 'Gleisen') if n > 1 else 'dem erfassten Gleis'} "
                    f"ist eine Perronhöhe von {hoehen[0]} Zentimetern verzeichnet.")
    elif len(hoehen) == 1:
        mit_h = [it["nr"] for it in items if it["perronhoehen_cm"]]
        ohne_h = [it["nr"] for it in items if not it["perronhoehen_cm"]]
        # die übrigen Gleise beim Namen nennen: «zu den übrigen» passte nicht,
        # wenn nur eines übrig blieb (Richterswil)
        satz.append(f"Zu {'Gleis' if len(mit_h) == 1 else 'den Gleisen'} {aufzaehlung(mit_h)} ist eine "
                    f"Perronhöhe von {hoehen[0]} Zentimetern vermerkt, zu "
                    f"{'Gleis' if len(ohne_h) == 1 else 'den Gleisen'} {aufzaehlung(ohne_h)} keine.")
    else:
        satz.append("Erfasst sind Perronhöhen von "
                    + ", ".join(str(h) for h in hoehen[:-1]) + f" und {hoehen[-1]} Zentimetern."
                    if len(hoehen) > 1 else f"Erfasst ist eine Perronhöhe von {hoehen[0]} Zentimetern.")
    kanten = [(i, it) for i, it in enumerate(items) if it.get("perronkante_m")]
    ohne_sektor = [it["nr"] for it in items if not it["sektoren_anzahl"]]
    mit_sektor = [(i, it) for i, it in enumerate(items) if it["sektoren_anzahl"]]
    if ohne_sektor and mit_sektor:
        liste = (ohne_sektor[0] if len(ohne_sektor) == 1
                 else ", ".join(ohne_sektor[:-1]) + " und " + ohne_sektor[-1])
        satz.append(f"Zu {'Gleis' if len(ohne_sektor) == 1 else 'den Gleisen'} {liste} "
                    "sind keine Sektortafeln erfasst.")
    elif not mit_sektor:
        satz.append("Zu diesem Gleis ist keine Sektortafel erfasst." if n == 1
                    else "Sektortafeln sind zu keinem dieser Gleise erfasst.")
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
            facts.append({"label": f"Längste erfasste Perronkante (Gleis {it['nr']})",
                          "value": hoechst, "unit": "m",
                          "source": "21197_behig-haltekantesegment",
                          "factRef": f"gleise.items[{i}].perronkante_m"})
            fr.append({"type": "hotspot",
                       "prompt": "Welches Gleis hat die längste erfasste Perronkante?",
                       "schema": "gleise", "correct": it["nr"],
                       "factRef": f"gleise.items[{i}].nr",
                       "explanation": f"Gleis {it['nr']} hat mit {hoechst} Metern die "
                                      f"längste erfasste Perronkante, die nächste misst {zweit} Meter.",
                       "difficulty": 2})
        klar = klar_getrennt(kanten, wert=lambda t: t[1]["perronkante_m"])
        if len(klar) >= 3:
            s = klar[:5]
            fr.append(sortier("Ordne die Gleise nach der erfassten Perronkante, längste zuerst.",
                              [{"label": f"Gleis {it['nr']}", "value": it["perronkante_m"],
                                "factRef": f"gleise.items[{i}].perronkante_m"} for i, it in s],
                              "absteigend",
                              ", ".join(f"Gleis {it['nr']} misst {it['perronkante_m']} Meter"
                                        for _, it in s) + "."
                              + (" Gleise mit fast gleicher Kante bleiben weg."
                                 if len(klar) < len(kanten) else ""), "gleise.items"))
    if mit_sektor:
        # Lieber ein Gleis mit mehreren Sektoren: «An Gleis 1 sind ___ Sektoren
        # erfasst» mit der Antwort 1 ergab «1 Sektoren» (Giubiasco, Delémont).
        i, it = sorted(mit_sektor, key=lambda t: t[1]["sektoren_anzahl"] < 2)[0]
        k = it["sektoren_anzahl"]
        facts.append({"label": f"Sektoren an Gleis {it['nr']}", "value": k,
                      "source": "sektortafel", "factRef": f"gleise.items[{i}].sektoren_anzahl"})
        texte, idx, alle = auswahl(uic, k, 2)
        q = {"type": "cloze" if k > 1 else "single_choice",
             "prompt": (f"An Gleis {it['nr']} in {name} sind ___ Sektoren erfasst." if k > 1 else
                        f"Wie viele Sektoren sind an Gleis {it['nr']} in {name} erfasst?"),
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
                                      + aufzaehlung(eigene)
                                      + " Zentimeter verzeichnet.",
                       "factRef": f"gleise.items[{i}].perronhoehen_cm", "difficulty": 3})
    elif len(hoehen) == 1 and n >= 2 and all(it["perronhoehen_cm"] for it in items):
        # «alle» nur, wenn wirklich jedes Gleis eine Höhe trägt
        fr.append(tf(f"An den erfassten Gleisen in {name} kommt nur eine einzige Perronhöhe vor.",
                     True, f"Für {'beide' if n == 2 else 'alle ' + str(n)} erfassten Gleise sind "
                     f"ausschliesslich {hoehen[0]} Zentimeter verzeichnet.", "gleise.perronhoehen_cm"))
    elif not hoehen:
        # Pont-Céard hat ein einziges Gleis: dann in der Einzahl fragen
        fr.append(tf((f"Zum erfassten Gleis in {name} ist eine Perronhöhe vermerkt." if n == 1 else
                      f"Zu den erfassten Gleisen in {name} ist eine Perronhöhe vermerkt."), False,
                     ("Zum erfassten Gleis ist keine Perronhöhe vermerkt." if n == 1 else
                      "Zu keinem der erfassten Gleise ist eine Perronhöhe vermerkt.")
                     + " Ob der Einstieg stufenfrei ist, sagen die offenen Daten damit nicht.",
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
            fr.append(tf((f"Zum erfassten Gleis in {name} sind Sektortafeln verzeichnet." if n == 1 else
                          f"Zu den erfassten Gleisen in {name} sind Sektortafeln verzeichnet."), False,
                         ("Zum erfassten Gleis ist keine Sektortafel in den Daten." if n == 1 else
                          "Zu keinem der erfassten Gleise ist eine Sektortafel in den Daten.")
                         + " Ob vor Ort Sektoren angeschrieben sind, sagen die offenen Daten nicht.",
                         f"gleise.items[0].sektoren_anzahl"))
    return {"id": "gleise", "title": "Gleise", "body": " ".join(satz),
            "erlaeuterung": SEKTOR, "facts": facts, "questions": fr}


def hindernisfreiheit(f):
    hf = f["hindernisfreiheit"]; name = f["name"]; uic = f["uic"]
    satz, facts, fr = [], [], []
    seg = hf.get("segmente")
    if seg:
        proh = hf["segmente_pro_perronhoehe_cm"]
        # Blumenau: zu keinem Segment eine Höhe («erfasst: .»), Chur: zu 14
        # von 72 keine. Beides wird genannt, nicht übergangen.
        ohne_hoehe = seg - sum(proh.values())
        if not proh:
            satz.append(f"Für {name} sind {seg} Perronsegmente erfasst. Eine Perronhöhe ist "
                        "zu keinem davon vermerkt.")
        elif len(proh) == 1 and not ohne_hoehe:
            satz.append(f"Für {name} sind {seg} Perronsegmente erfasst, "
                        f"{'beide' if seg == 2 else 'alle'} mit einer "
                        f"Perronhöhe von {next(iter(proh))} Zentimetern.")
        else:
            teile = sorted(proh.items(), key=lambda t: -t[1])
            satz.append(f"Für {name} sind {seg} Perronsegmente erfasst: "
                        + ", ".join(f"{a} mit {h} Zentimetern" for h, a in teile)
                        + (f", zu {ohne_hoehe} ist keine Perronhöhe vermerkt." if ohne_hoehe > 0 else "."))
        g55, gd = hf.get("gleise_mit_55cm", 0), hf.get("gleise_mit_daten", 0)
        if gd:
            if g55 == gd:
                satz.append(f"An {alle_n(gd, 'Gleisen') if gd > 1 else 'dem erfassten Gleis'} "
                            "liegt ein Abschnitt auf 55 Zentimetern.")
            elif g55:
                satz.append(f"An {g55} der {gd} erfassten Gleise liegt ein Abschnitt auf "
                            "55 Zentimetern.")
        satz.append("Bei keinem Segment ist ein Hilfstritt verzeichnet." if not hf["segmente_mit_hilfstritt"]
                    else f"Bei {hf['segmente_mit_hilfstritt']} "
                         f"{'Segment' if hf['segmente_mit_hilfstritt'] == 1 else 'Segmenten'} "
                         "ist ein Hilfstritt verzeichnet.")
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
            if pd == 1:
                satz.append("Das erfasste Perron ist "
                            f"{'' if pn == 1 else 'nicht '}als niveaufrei erreichbar vermerkt.")
            elif pn == 0:
                # Meggen, Rorschach Hafen: «Von den 2 erfassten Perrons sind 0 als
                # niveaufrei erreichbar vermerkt» - eine Null als Satzgegenstand
                satz.append(f"Keines der {pd} erfassten Perrons ist als niveaufrei erreichbar vermerkt.")
            else:
                satz.append(f"Von den {pd} erfassten Perrons "
                            f"{'ist' if pn == 1 else 'sind'} {pn} als niveaufrei erreichbar vermerkt.")
            facts.append({"label": "Niveaufrei erreichbare Perrons", "value": pn,
                          "source": "perron", "factRef": "hindernisfreiheit.perrons_niveaufrei"})
        fr.append(tf(f"Für {name} sind Perronsegmente zur Hindernisfreiheit erhoben.", False,
                     "Die BehiG-Erhebung führt für diesen Bahnhof keine Segmente. Erfasst ist "
                     f"nur der Zugang {'zum Perron' if pd == 1 else 'zu den Perrons'}.",
                     "hindernisfreiheit.perrons_mit_daten", diff=3))
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
    # Der stärkste Abschnitt überhaupt kann ein Güterabschnitt sein (Sins:
    # 99 Güterzüge, 84 im Personenverkehr). Der Text spricht vom
    # Personenverkehr, also gilt dessen stärkster Abschnitt.
    st = zu["staerkster_personenverkehr"]
    ab = [(i, a) for i, a in enumerate(zu["abschnitte"])]
    pv = [(i, a) for i, a in ab if a["art"] == "Personenverkehr" and a["zuege_pro_tag"]]
    # Güterzüge zählen nach dem Jahr: 119 im Jahr sind pro Tag gerundet 0,
    # aber nicht «keiner» (Seuzach).
    gv = [(i, a) for i, a in ab if a["art"] == "Gueterverkehr" and a["zuege_pro_jahr"]]
    def abschn(a):
        return f"{a['von']} – {a['bis']}"
    weitere = [a for _, a in pv if a != st][:2]
    # Steht ein anderer Abschnitt pro Tag gleich, wäre «am stärksten» ein
    # Vorzug, den nur die Jahreszahl hergibt. Dann nennen wir nur die Werte.
    gleichauf = any(a["zuege_pro_tag"] == st["zuege_pro_tag"] for a in weitere)
    # Ist nur ein Abschnitt im Personenverkehr erfasst (Hinwil), gibt es
    # nichts, gegenüber dem er «am stärksten» wäre.
    if gleichauf or not weitere:
        satz = [f"Im Personenverkehr zählt die Erhebung auf dem Abschnitt {abschn(st)} "
                f"{st['zuege_pro_tag']} Züge pro Tag, das sind {ch(st['zuege_pro_jahr'])} im Jahr."]
    else:
        satz = [f"Am stärksten befahren ist der Abschnitt {abschn(st)}: Im Personenverkehr "
                f"verkehren dort {st['zuege_pro_tag']} Züge pro Tag, das sind "
                f"{ch(st['zuege_pro_jahr'])} im Jahr."]
    if weitere:
        satz.append("Auf " + " und auf ".join(
            f"dem Abschnitt {abschn(a)} sind es "
            f"{'ebenfalls ' if a['zuege_pro_tag'] == st['zuege_pro_tag'] else ''}{a['zuege_pro_tag']}"
            for a in weitere) + " Züge pro Tag.")
    if gv and (m := max(a['zuege_pro_tag'] for _, a in gv)):
        satz.append(f"Im Güterverkehr zählt die Erhebung bis zu {m} {'Zug' if m == 1 else 'Züge'} "
                    "pro Tag auf einem Abschnitt.")
    elif gv:
        mj = max(a['zuege_pro_jahr'] for _, a in gv)
        satz.append(f"Im Güterverkehr zählt die Erhebung bis zu {ch(mj)} "
                    f"{'Zug' if mj == 1 else 'Züge'} im Jahr auf einem Abschnitt.")
    else:
        # ein einziger Abschnitt (Niederweningen, Endstation): Einzahl
        satz.append("Güterverkehr ist auf diesem Abschnitt keiner erfasst." if len(ab) == 1
                    else "Güterverkehr ist auf diesen Abschnitten keiner erfasst.")
    facts = [{"label": f"Züge pro Tag, Personenverkehr {abschn(st)}", "value": st["zuege_pro_tag"],
              "unit": "Züge/Tag", "source": "zugzahlen",
              "factRef": "zuege.staerkster_personenverkehr.zuege_pro_tag"},
             {"label": f"Züge pro Jahr, Personenverkehr {abschn(st)}", "value": st["zuege_pro_jahr"],
              "unit": "Züge/Jahr", "source": "zugzahlen",
              "factRef": "zuege.staerkster_personenverkehr.zuege_pro_jahr"}]
    fr = [sc(uic, f"Wie viele Züge pro Tag verkehren im Personenverkehr auf dem Abschnitt {abschn(st)}?",
             st["zuege_pro_tag"], f"Auf diesem Abschnitt zählt die Erhebung {st['zuege_pro_tag']} "
             "Züge pro Tag, beide Richtungen zusammen.", "zuege.staerkster_personenverkehr.zuege_pro_tag")]
    alle = [(i, a) for i, a in ab if a["zuege_pro_jahr"] >= 100]
    klar = klar_getrennt(alle, wert=lambda t: t[1]["zuege_pro_jahr"])
    if len(klar) >= 3:
        s = klar[:4]
        art = lambda a: "Personenverkehr" if a["art"] == "Personenverkehr" else "Güterverkehr"
        fr.append(sortier("Ordne die Abschnitte nach Zügen pro Jahr, meiste zuerst.",
                          [{"label": f"{abschn(a)}, {art(a)}", "value": a["zuege_pro_jahr"],
                            "factRef": f"zuege.abschnitte[{i}].zuege_pro_jahr"} for i, a in s],
                          "absteigend",
                          ", ".join(f"{abschn(a)} ({art(a)}) {ch(a['zuege_pro_jahr'])}" for _, a in s)
                          + " Züge im Jahr."
                          + (" Abschnitte mit fast gleicher Zahl bleiben weg."
                             if len(klar) < len(alle) else ""), "zuege.abschnitte"))
    else:
        fr.append(schieber(f"Wie viele Züge verkehren im Personenverkehr pro Jahr auf dem Abschnitt {abschn(st)}?",
                           st["zuege_pro_jahr"], f"Die Erhebung zählt {ch(st['zuege_pro_jahr'])} "
                           f"Züge im Jahr, beide Richtungen zusammen, Stand {zu['jahr']}.",
                           "zuege.staerkster_personenverkehr.zuege_pro_jahr", "Züge/Jahr", diff=3))
    return {"id": "zuege", "title": "Züge", "body": " ".join(satz), "erlaeuterung": ZUG,
            "facts": facts, "questions": fr}


@functools.lru_cache(maxsize=1)
def _linien_nach_ort():
    """uic -> (Breite, Länge, Liniennummern) aus allen Faktendateien."""
    raus = {}
    for p in (ROOT / "data" / "facts").glob("*.json"):
        g = json.loads(p.read_text(encoding="utf-8"))
        sb = g.get("steckbrief") or {}
        if sb.get("lat") and (g.get("linien") or {}).get("items"):
            raus[g["uic"]] = (sb["lat"], sb["lon"], [x["nummer"] for x in g["linien"]["items"]])
    return raus


def linien_in_der_naehe(f, n=3):
    """Nummern anderer Linien, gesammelt bei den nächstgelegenen Bahnhöfen."""
    eigene = {x["nummer"] for x in f["linien"]["items"]}
    lat, lon = f["steckbrief"]["lat"], f["steckbrief"]["lon"]
    raus = []
    for _, (la, lo, nummern) in sorted(_linien_nach_ort().items(),
                                      key=lambda t: math.hypot(t[1][0] - lat, (t[1][1] - lon) * 0.67)):
        raus += [nr for nr in nummern if nr not in eigene and nr not in raus]
        if len(raus) >= n:
            break
    return raus[:n]


def linien(f):
    li = f["linien"]; name = f["name"]; uic = f["uic"]
    items = li["items"]
    if len(items) == 1:
        it = items[0]
        body = (punkt(f"Für {name} ist 1 Linie erfasst: die Linie {it['nummer']} {it['name']}")
                + f" Der Bahnhof ist darauf bei Kilometer {it['km_am_bahnhof']} eingetragen.")
    else:
        teile = [f"die Linie {it['nummer']} {it['name']}" for it in items]
        body = (f"Für {name} sind {len(items)} Linien erfasst: "
                + punkt(", ".join(teile[:-1]) + " und " + teile[-1]))
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
                   "explanation": punkt("Die " + ", die ".join(f"Linie {x['nummer']} heisst {x['name']}"
                                                               for x in items[:3])),
                   "difficulty": 2})
    if not fr and f["steckbrief"].get("lat"):
        # Zürich HB, Sargans und Immensee liegen am Anfang ihrer einzigen
        # Linie. Kilometer 0 bis 1 taugt nicht für den Schieberegler, und
        # ohne zweite Linie gibt es nichts zuzuordnen. Ein Kapitel ohne Frage
        # taugt nicht: gefragt wird die Nummer, die falschen Antworten sind
        # Linien der nächstgelegenen Bahnhöfe.
        it = items[0]
        opts = sorted([it["nummer"], *linien_in_der_naehe(f, 3)])
        fr.append({"type": "single_choice",
                   "prompt": f"Auf welcher Linie ist {name} in den offenen Daten erfasst?",
                   "options": [f"Linie {x}" for x in opts], "correct": opts.index(it["nummer"]),
                   "optionen_aus_fakten": True, "factRef": "linien.items[0].nummer",
                   "explanation": punkt(f"{name} ist auf der Linie {it['nummer']} {it['name']} erfasst"),
                   "difficulty": 1})
    return {"id": "linien", "title": "Linien", "body": body, "facts": facts, "questions": fr}


def services(f):
    sv = f["services"]; name = f["name"]; uic = f["uic"]
    # Ohne Betriebspunkt-Kürzel ordnet die Quelle keine Automaten und
    # Entwerter zu (Köniz, Müntschemier). Dann gibt es keine Zahl, auch keine 0,
    # und «sind keine verzeichnet» wäre eine erfundene Tatsache.
    ohne_geraete = "billettautomaten_erfasst" not in sv
    teile = []
    if sv.get("billettautomaten_erfasst"):
        typen = sv.get("automat_typen") or []
        t = f"{sv['billettautomaten_erfasst']} {'Billettautomat' if sv['billettautomaten_erfasst'] == 1 else 'Billettautomaten'}"
        # Sammelbezeichnungen in drei Sprachen, «Autre» bei Le Day
        if typen and not any(x.lower() in SAMMELANGABEN for x in typen):
            # mehrere Typen in Klammern, sonst verschachteln sich zwei Listen:
            # «der Typen BATS, S-POS und ePOS und 2 Billettentwerter»
            t += f" vom Typ {typen[0]}" if len(typen) == 1 else f" (Typen {aufzaehlung(typen)})"
        teile.append(t)
    if sv.get("billettentwerter_erfasst"):
        teile.append(f"{sv['billettentwerter_erfasst']} Billettentwerter")
    if sv["wartehallen_erfasst"]:
        teile.append(f"{sv['wartehallen_erfasst']} {'Wartehalle' if sv['wartehallen_erfasst'] == 1 else 'Wartehallen'}")
    satz = []
    if sv["wlan_erfasst"]:
        satz.append(f"{name} steht in der Liste der WLAN-Standorte.")
    if teile:
        # «Erfasst ist 1 Billettentwerter.» (Ostermundigen), sonst «sind»
        einzeln = len(teile) == 1 and teile[0].startswith("1 ")
        satz.append(f"Erfasst {'ist' if einzeln else 'sind'} " + aufzaehlung(teile) + ".")
    # Jede fehlende Angabe wird genannt. Die Entwerter fehlten hier, und bei
    # Emmenbrücke Gersag verschwieg der Text, dass keine verzeichnet sind.
    fehlt = []
    if not ohne_geraete and not sv["billettautomaten_erfasst"]:
        fehlt.append("Billettautomaten")
    if not ohne_geraete and not sv["billettentwerter_erfasst"]:
        fehlt.append("Billettentwerter")
    if not sv["wartehallen_erfasst"]:
        fehlt.append("Wartehallen")
    if fehlt:
        satz.append(aufzaehlung(fehlt) + " sind keine verzeichnet.")
    if ohne_geraete:
        satz.append("Zu Billettautomaten und Billettentwertern liegen für diesen "
                    "Bahnhof keine Daten vor.")
    if not sv["wlan_erfasst"]:
        satz.append(f"{name} steht nicht in der Liste der WLAN-Standorte.")
    facts = [{"label": "WLAN erfasst", "value": sv["wlan_erfasst"], "unit": "",
              "source": "wifistation", "factRef": "services.wlan_erfasst"}]
    for feld, lab, q in (("billettautomaten_erfasst", "Billettautomaten erfasst", "billetautomat"),
                         ("billettentwerter_erfasst", "Billettentwerter erfasst", "billetentwerter")):
        if feld in sv:
            facts.append({"label": lab, "value": sv[feld], "source": q, "factRef": f"services.{feld}"})
    fr = [tf(f"{name} steht in der Liste der WLAN-Standorte.", bool(sv["wlan_erfasst"]),
             "Der Bahnhof ist in den offenen WLAN-Daten "
             + ("aufgeführt." if sv["wlan_erfasst"] else "nicht aufgeführt. Ob vor Ort WLAN "
                "verfügbar ist, sagen die Daten nicht."),
             "services.wlan_erfasst", diff=1 if sv["wlan_erfasst"] else 2)]
    if sv.get("billettentwerter_erfasst"):
        w = sv["billettentwerter_erfasst"]
        texte, i, alle = auswahl(uic, w, 2)
        fr.append({"type": "cloze" if w > 1 else "single_choice",
                   "prompt": (f"In {name} sind ___ Billettentwerter erfasst." if w > 1 else
                              f"Wie viele Billettentwerter sind in {name} erfasst?"),
                   "options": texte, "correct": i, "optionen_aus_fakten": True,
                   "explanation": f"Erfasst {'sind' if w > 1 else 'ist'} {w} Billettentwerter. Die Zahl gibt wieder, "
                                  "was in den offenen Daten steht, nicht zwingend, was vor Ort hängt.",
                   "factRef": "services.billettentwerter_erfasst", "difficulty": 2})
    return {"id": "services", "title": "Services", "body": " ".join(satz),
            "facts": facts, "questions": fr}


def bahnhofplan(f):
    bp = f["bahnhofplan"]; name = f["name"]
    if bp.get("a4_pdf"):
        body = (f"Für {name} ist ein Bahnhofplan veröffentlicht, als A4-Blatt"
                + (" und als Plakat." if bp.get("plakat_pdf") else ".")
                + " Eigentümerin der Pläne ist die SBB."
                + (" Ein eigener Shopping-Plan liegt nicht vor." if not bp.get("shopping_pdf") else
                   " Dazu gibt es einen eigenen Shopping-Plan."))
        facts = [{"label": "Plan als A4-Blatt", "value": bp["a4_pdf"],
                  "source": "haltestelle-karte-trafimage", "factRef": "bahnhofplan.a4_pdf"}]
        # «Pläne gibt es nur für einen kleinen Teil der Bahnhöfe» war eine
        # Menge in Worten (Regel 8). Die Zahl steht bei Bahnhöfen ohne Plan
        # als Lücke, gezählt von der Pipeline.
        fr = [tf(f"Für {name} ist ein Bahnhofplan als PDF veröffentlicht.", True,
                 "Es liegen zwei Fassungen vor, ein A4-Blatt und ein Plakat." if bp.get("plakat_pdf")
                 else "Er liegt als A4-Blatt vor.", "bahnhofplan.a4_pdf", diff=1)]
    else:
        body = (f"{name} ist in der Planübersicht aufgeführt, als Eigentümerin ist die SBB "
                "vermerkt. Ein PDF des Plans ist in den offenen Daten aber nicht hinterlegt.")
        facts = [{"label": "Eigentümerin der Pläne", "value": bp["eigentuemer"],
                  "source": "haltestelle-karte-trafimage", "factRef": "bahnhofplan.eigentuemer"}]
        fr = [tf(f"Für {name} ist ein Bahnhofplan als PDF hinterlegt.", False,
                 "Der Bahnhof steht in der Planübersicht, aber kein PDF ist in den Daten verlinkt.",
                 "bahnhofplan.a4_pdf")]
    return {"id": "bahnhofplan", "title": "Bahnhofplan", "body": body, "facts": facts, "questions": fr}


BAUER = {"steckbrief": steckbrief, "stammdaten": stammdaten, "tagesrhythmus": tagesrhythmus,
         "perrons": perrons,
         "gleise": gleise, "hindernisfreiheit": hindernisfreiheit, "zuege": zuege,
         "linien": linien, "services": services, "bahnhofplan": bahnhofplan}


#: Was zuerst wegfällt, wenn die Daten weniger Fragen tragen, als gebaut
#: sind (Steinmaur: 17, erlaubt sind 16). Zuerst, was einen schon
#: gefragten Wert wiederholt.
VERZICHTBAR = [
    # Züge pro Jahr auf demselben Abschnitt wie die Frage nach Zügen pro Tag
    lambda kid, q: kid == "zuege" and q["type"] == "slider"
    and q.get("factRef", "").endswith(".zuege_pro_jahr"),
    # der Jahresverlauf enthält den Werktagswert noch einmal
    lambda kid, q: kid == "steckbrief" and q["type"] == "sort",
    # «keine Perronhöhe vermerkt» steht schon im Text
    lambda kid, q: kid == "gleise" and q.get("factRef") == "gleise.perronhoehen_cm"
    and q["type"] == "true_false" and q.get("correct") is False,
    # zuletzt: «steht nicht in der WLAN-Liste» prüft ein Fehlen, keinen Wert.
    # Mols hat weder Zugzahlen noch Gleise, keine der Regeln davor griff.
    lambda kid, q: kid == "services" and q.get("factRef") == "services.wlan_erfasst"
    and q.get("correct") is False,
]


def kuerzen(kap, f):
    """Streicht Fragen nach VERZICHTBAR, bis der Umfang zur Datenlage passt.
    Das Kapitel Ausstattung kommt später dazu und zählt schon mit."""
    from ausstattung_kapitel import kapitel_bauen
    hoechst = hoechstens_fragen(f)
    a = kapitel_bauen(f["uic"], f["name"], f["ausstattung"]) if f.get("ausstattung") else None
    spaeter = len(a["questions"]) if a else 0
    zahl = lambda: sum(len(k["questions"]) for k in kap) + spaeter
    for weg in VERZICHTBAR:
        for k in kap:
            if zahl() <= hoechst:
                return
            treffer = [q for q in k["questions"] if weg(k["id"], q)]
            if treffer and len(k["questions"]) > len(treffer):
                k["questions"] = [q for q in k["questions"] if q not in treffer]
    if zahl() > hoechst:
        raise ValueError(f"{f['name']}: {zahl()} Fragen, die Daten tragen höchstens {hoechst}. "
                         "VERZICHTBAR ergänzen")


def profil(uic, **pro_kapitel):
    """Baut ein Profil. pro_kapitel: {'steckbrief': dict(extra_body=..., ...), ...}
    oder None, um ein Kapitel auszulassen."""
    f = fakten(uic)
    kap = []
    for kid in f["verfuegbare_kapitel"]:
        if kid == "ausstattung":  # kommt in bauen.py dazu
            continue
        if kid in pro_kapitel and pro_kapitel[kid] is None:
            continue
        opts = pro_kapitel.get(kid) or {}
        if kid in BAUER:
            kap.append(BAUER[kid](f, **opts))
    kuerzen(kap, f)
    quellen = sorted({x["source"] for k in kap for x in k["facts"]})
    return {"uic": f["uic"], "name": f["name"], "tier": f["tier"], "lang": "de",
            "dataYear": DATENJAHR, "generated": str(date.today()), "sources": quellen,
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
