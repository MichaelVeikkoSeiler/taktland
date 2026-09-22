"""Baukasten für die Linienseiten.

Dieselben Regeln wie bei den Bahnhöfen (CLAUDE.md, generator/SCHEMA.md):
jede Zahl aus data/linien/{nr}.json, keine Deutung, keine gerechnete Grösse,
Gleichstand ist kein Vorsprung, was gefragt wird, steht im Kapitel.

Dazu, was bei Linien besonders ist:
- Die Kilometrierung ist ein Standort, keine Länge. Das Kapitel Strecke darf
  das Wort Länge nicht brauchen (Prüfung in linien.py).
- Tunnelnamen stehen ohne Artikel: «der Galleria Crocetto» wäre falsch, und
  das Geschlecht lässt sich aus den Daten nicht ablesen.
- Bemerkungen der Quelle zu einem Tunnel stehen im Wortlaut dabei, sobald der
  Tunnel genannt wird («Länge der Oströhre, da länger als Weströhre»).
"""
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "generator"))
sys.path.insert(0, str(ROOT))
from baukasten import DATENJAHR, aufzaehlung, ch, punkt, schieber, sortier  # noqa: E402
from belegt import Faktenbasis  # noqa: E402
from distraktoren import vorschlaege  # noqa: E402
from taktland import SAMMELANGABEN, geschenkt, klar_getrennt, zu_nah  # noqa: E402

LINIEN = ROOT / "data" / "linien"

KILOMETRIERUNG = ("Die Kilometrierung gibt Standorte entlang einer Linie an, so wie die "
                  "Kilometertafeln an der Strecke. Die Differenz zweier Kilometerangaben "
                  "ist nicht in jedem Fall die Strecke dazwischen.")

#: Tunnelsysteme, nach denen gefragt wird. «Andere» ist die Sammelangabe der
#: Quelle und taugt weder als Antwort noch als falsche Antwort.
TUNNELSYSTEME = ["1-Röhre / 1-Spur", "1-Röhre / 2-Spuren",
                 "2-Röhren / 2 x 1-Spur", "Y / 2-Spur + 2x 1-Spur"]

#: So viele Tunnel zeigt die Faktenliste, die längsten zuerst
TUNNEL_IN_LISTE = 6


def fakten(nr):
    return json.loads((LINIEN / f"{nr}.json").read_text(encoding="utf-8"))


def km(x):
    return ch(x)


def streuung(schluessel, n):
    """Feste, aber nicht immer gleiche Wahl: derselbe Schlüssel gibt beim
    nächsten Bau dieselbe Zahl."""
    return int(hashlib.md5(str(schluessel).encode()).hexdigest(), 16) % n


def _ordnung(o):
    """Zahlen nach Wert, sonst alphabetisch: «206 km» stand vor «70 km»."""
    try:
        return (0, float(str(o).split(" ")[0].replace("'", "")), "")
    except ValueError:
        return (1, 0, str(o))


def auswahl_frage(prompt, optionen, richtig, erkl, ref, aus_fakten=False, diff=1):
    opts = sorted(set(optionen), key=_ordnung)
    q = {"type": "single_choice", "prompt": prompt, "options": opts,
         "correct": opts.index(richtig), "explanation": erkl, "factRef": ref,
         "difficulty": diff}
    if aus_fakten:
        q["optionen_aus_fakten"] = True
    return q


# ------------------------------------------------------------------ Strecke

def strecke(f):
    if f.get("quelle") == "schienennetz":
        return strecke_bav(f)
    s = f["strecke"]; nr = f["linie"]
    body = (f"Die Linie {nr} heisst in den offenen Daten «{f['name']}». Als Anfang ist der "
            f"Betriebspunkt {s['anfang']} erfasst, als Ende {punkt(s['ende'])} Die "
            f"Kilometrierung reicht von km {km(s['km_anfang'])} bis km {km(s['km_ende'])}.")
    facts = [
        {"label": "Anfang", "value": s["anfang"], "source": "linie", "factRef": "strecke.anfang"},
        {"label": "Ende", "value": s["ende"], "source": "linie", "factRef": "strecke.ende"},
        {"label": "Kilometer am Anfang", "value": s["km_anfang"], "unit": "km",
         "source": "linie", "factRef": "strecke.km_anfang"},
        {"label": "Kilometer am Ende", "value": s["km_ende"], "unit": "km",
         "source": "linie", "factRef": "strecke.km_ende"},
    ]
    # Ist der Anfang oder das Ende ein Bahnhof aus Taktland, führt die Kachel zu
    # seiner Seite. «bahnhof» statt «uic»: sonst stünde sie in der Bahnhofsliste
    for x, feld in ((facts[0], "anfang_uic"), (facts[1], "ende_uic")):
        if s.get(feld):
            x["bahnhof"] = s[feld]
    # Ein einzelner Bahnhof hat kein eigenes Kapitel, er steht hier
    bh = f["bahnhoefe"]
    if bh["anzahl_in_taktland"] == 1:
        it = bh["items"][0]
        body += f" Als Bahnhof in Taktland ist auf dieser Linie {it['name']} erfasst, bei km {km(it['km'])}."
        facts.append({"label": it["name"], "value": it["km"], "unit": "km",
                      "source": "linie-mit-betriebspunkten", "factRef": "bahnhoefe.items[0].km",
                      "uic": it["uic"]})
    elif not bh["anzahl_in_taktland"]:
        body += " Keiner der erfassten Betriebspunkte dieser Linie ist ein Bahnhof in Taktland."
    fr = [schieber(f"Bis zu welchem Kilometer reicht die Kilometrierung der Linie {nr}?",
                   s["km_ende"], f"Die Kilometrierung der Linie {nr} reicht bis km "
                   f"{km(s['km_ende'])}. Der Wert ist ein Standort auf der Linie.",
                   "strecke.km_ende", "km", diff=2)]
    if s["km_anfang"] and s["km_anfang"] > 1:
        # Linie 210 beginnt bei km 19.115: nicht jede Linie fängt bei 0 an
        fr.append(schieber(f"Bei welchem Kilometer beginnt die Kilometrierung der Linie {nr}?",
                           s["km_anfang"], f"Die Kilometrierung der Linie {nr} beginnt bei km "
                           f"{km(s['km_anfang'])}.", "strecke.km_anfang", "km", diff=3))
    # Anfang oder Ende als Frage, aber nur, wenn der Name der Linie die
    # Antwort nicht schon verrät («Immensee - Bellinzona - Chiasso», Ende
    # «Chiasso Est»)
    andere = sorted({g[k] for g in alle_strecken() if g is not s
                     for k in ("anfang", "ende")} - {s["anfang"], s["ende"]})
    for feld, wort in (("ende", "Ende"), ("anfang", "Anfang")):
        if len(fr) >= 3 or verraet(s[feld], f["name"]):
            continue
        # gleiche Form wie die Antwort: Stand nur sie mit Klammer da («Pozzo
        # Negro (dira)») oder nur sie ohne, verriet die Form die Lösung
        mit_klammer = "(" in s[feld]
        falsch = [a for a in andere if not verraet(a, f["name"]) and ("(" in a) == mit_klammer]
        if len(falsch) < 3:
            continue
        start = streuung(f"{nr}:{feld}", len(falsch))
        drei = [falsch[(start + i * 7) % len(falsch)] for i in range(3)]
        if len(set(drei)) < 3:
            continue
        fr.append(auswahl_frage(
            f"Welcher Betriebspunkt ist als {wort} der Linie {nr} erfasst?",
            [s[feld], *drei], s[feld],
            f"Als {wort} der Linie {nr} ist {s[feld]} erfasst.", f"strecke.{feld}", diff=2))
        break
    return {"id": "strecke", "title": "Strecke", "body": body, "facts": facts,
            "erlaeuterung": KILOMETRIERUNG, "questions": fr}


def strecke_bav(f):
    """Eine Linie aus dem Schienennetz des BAV. Anfang und Ende nennt die
    Quelle nicht, nur den Kilometer jedes Betriebspunkts: Genannt sind der
    kleinste und der grösste."""
    s = f["strecke"]; nr = f["linie"]
    body = (f"Die Linie {nr} fehlt in den Daten der SBB. Im Schienennetz des Bundesamts für "
            f"Verkehr heisst sie «{f['name']}». Den kleinsten Kilometer hat dort der "
            f"Betriebspunkt {s['kleinster_km_bei']} mit km {km(s['kleinster_km'])}, den grössten "
            f"{s['groesster_km_bei']} mit km {km(s['groesster_km'])}.")
    facts = [
        {"label": "Kleinster Kilometer bei", "value": s["kleinster_km_bei"],
         "source": "schienennetz", "factRef": "strecke.kleinster_km_bei"},
        {"label": "Kleinster Kilometer", "value": s["kleinster_km"], "unit": "km",
         "source": "schienennetz", "factRef": "strecke.kleinster_km"},
        {"label": "Grösster Kilometer bei", "value": s["groesster_km_bei"],
         "source": "schienennetz", "factRef": "strecke.groesster_km_bei"},
        {"label": "Grösster Kilometer", "value": s["groesster_km"], "unit": "km",
         "source": "schienennetz", "factRef": "strecke.groesster_km"},
    ]
    for x, feld in ((facts[0], "kleinster_km_bei_uic"), (facts[2], "groesster_km_bei_uic")):
        if s.get(feld):
            x["bahnhof"] = s[feld]
    fr = [schieber(f"Welchen Kilometer hat {s['groesster_km_bei']}, der grösste auf der Linie {nr}?",
                   s["groesster_km"], f"{s['groesster_km_bei']} liegt auf der Linie {nr} bei km "
                   f"{km(s['groesster_km'])}. Der Wert ist ein Standort auf der Linie.",
                   "strecke.groesster_km", "km", diff=2)]
    return {"id": "strecke", "title": "Strecke", "body": body, "facts": facts,
            "erlaeuterung": KILOMETRIERUNG, "questions": fr}


def _grund(text):
    """«Zürich» und «Zurich» sind für den Vergleich dasselbe Wort."""
    return unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode().lower()


def verraet(antwort, name):
    """Steckt die Antwort im Namen der Linie? Strenger als geschenkt() bei den
    Bahnhöfen: Linie 748 heisst «ZH Altstetten - ZH Oerlikon, DML», das Ende
    «Zurich Oerlikon». Komma und Umlaut verdeckten den Treffer."""
    teile = re.findall(r"[a-z]{4,}", _grund(name))
    # auch kurze Abschnitte des Namens: «Wil - Weinfelden», Ende «Wil SG»;
    # «Le Day - Le Brassus», Anfang «Le Day Sud (bif)»
    abschnitte = [a.strip() for a in re.split(r"\s+-\s+|,", _grund(name)) if len(a.strip()) >= 3]
    a = _grund(antwort)
    return (geschenkt(antwort, name) or any(t in a for t in teile)
            or any(re.search(rf"\b{re.escape(x)}\b", a) for x in abschnitte))


_STRECKEN = None


def alle_strecken():
    """Anfangs- und Endpunkte aller Linien, als falsche Antworten."""
    global _STRECKEN
    if _STRECKEN is None:
        # nur Linien der SBB: Im Schienennetz des BAV gibt es kein Anfang und Ende
        _STRECKEN = [s for p in sorted(LINIEN.glob("*.json"))
                     if "anfang" in (s := json.loads(p.read_text(encoding="utf-8"))["strecke"])]
    return _STRECKEN


# ------------------------------------------------------------------ Bahnhöfe

def bahnhoefe(f):
    bh = f["bahnhoefe"]; nr = f["linie"]; items = bh["items"]
    n, m = bh["anzahl_in_taktland"], bh["betriebspunkte_erfasst"]
    quelle = bh["source"]
    if quelle == "schienennetz":
        body = (f"Im Schienennetz des BAV liegen auf der Linie {nr} {m} Betriebspunkte. "
                f"Davon sind {n} Bahnhöfe in Taktland. Sie stehen hier nach ihrem Kilometer "
                "auf der Linie geordnet, der kleinste zuerst.")
    else:
        body = (f"Für die Linie {nr} führt die Liste der Betriebspunkte {m} Einträge. "
                f"Davon sind {n} Bahnhöfe in Taktland. Sie stehen hier nach ihrem Kilometer "
                "auf der Linie geordnet, der kleinste zuerst.")
    facts = [
        {"label": "Erfasste Betriebspunkte", "value": m, "source": quelle,
         "factRef": "bahnhoefe.betriebspunkte_erfasst"},
        {"label": "Bahnhöfe in Taktland", "value": n, "source": quelle,
         "factRef": "bahnhoefe.anzahl_in_taktland"},
    ] + [{"label": it["name"], "value": it["km"], "unit": "km",
          "source": quelle, "factRef": f"bahnhoefe.items[{i}].km",
          "uic": it["uic"]} for i, it in enumerate(items)]

    fr = []
    mit_index = [{"i": i, **it} for i, it in enumerate(items)]
    # klar getrennt, damit die Reihenfolge nicht an Nachkommastellen hängt
    getrennt = sorted(klar_getrennt(mit_index, wert=lambda x: x["km"]), key=lambda x: x["km"])
    if len(getrennt) >= 3:
        k = min(4, len(getrennt))
        schritt = (len(getrennt) - 1) / (k - 1)
        wahl = [getrennt[round(j * schritt)] for j in range(k)]
        fr.append(sortier(
            f"Ordne diese Bahnhöfe nach ihrem Kilometer auf der Linie {nr}, kleinster zuerst.",
            [{"label": x["name"], "value": x["km"], "factRef": f"bahnhoefe.items[{x['i']}].km"}
             for x in wahl],
            "aufsteigend",
            punkt(aufzaehlung([f"{x['name']} bei km {km(x['km'])}" for x in wahl])),
            "bahnhoefe.items"))
    # nach dem Kilometer eines Bahnhofs aus der Mitte; die falschen Antworten
    # sind die Kilometer anderer Bahnhöfe derselben Linie
    # Zum Nachlesen genügt es, dass die Werte verschieden sind: Die Liste
    # nennt jeden Kilometer (Basel St. Johann 137.8, Basel SBB 142.2 liegen
    # unter 5 % auseinander, sind aber klar zu lesen)
    auswahl = getrennt if len(getrennt) >= 2 else mit_index
    if len({x["km"] for x in auswahl}) >= 2:
        positiv = [x for x in auswahl if x["km"] >= 0]
        mitte = positiv[len(positiv) // 2] if positiv else auswahl[len(auswahl) // 2]
        andere = [x for x in auswahl if x is not mitte and x["km"] != mitte["km"]]
        falsch = [andere[round(j * (len(andere) - 1) / 2)] for j in range(3)] if len(andere) >= 3 else andere
        falsch = list({x["i"]: x for x in falsch}.values())
        opts = [f"{km(x['km'])} km" for x in [mitte, *falsch]]
        fr.append(auswahl_frage(
            f"Bei welchem Kilometer der Linie {nr} liegt {mitte['name']}?",
            opts, f"{km(mitte['km'])} km",
            f"{mitte['name']} liegt auf der Linie {nr} bei km {km(mitte['km'])}.",
            f"bahnhoefe.items[{mitte['i']}].km", aus_fakten=True, diff=2))
    return {"id": "bahnhoefe", "title": "Bahnhöfe", "body": body, "facts": facts, "questions": fr}


# ------------------------------------------------------------------ Tunnel

def tunnel_satz(t):
    """«Gotthardtunnel, 15'000 Meter, erstmals in Betrieb 1882, Tunnelsystem …»"""
    teile = [t["name"]]
    if t.get("laenge_m") is not None:
        teile.append(f"{ch(t['laenge_m'])} Meter")
    if t.get("inbetriebnahme_jahr") is not None:
        teile.append(f"erstmals in Betrieb {t['inbetriebnahme_jahr']}")
    if t.get("tunnelsystem"):
        teile.append(f"Tunnelsystem «{t['tunnelsystem']}»")
    return ", ".join(teile)


def bemerkungen(tunnel_liste):
    return "".join(f" Die Quelle vermerkt zu {t['name']}: «{t['bemerkung']}»."
                   for t in tunnel_liste if t.get("bemerkung"))


def jahr_distraktoren(fb, jahr, schluessel):
    """Drei andere Jahre im Abstand von Jahrzehnten, keines davon ein Wert
    aus den Fakten und keines nach dem Datenjahr."""
    kandidaten = [jahr + d for d in (-36, -24, -12, 12, 24, 36)
                  if 1840 <= jahr + d <= DATENJAHR and float(jahr + d) not in fb.zahlen]
    if len(kandidaten) < 3:
        return None
    start = streuung(schluessel, len(kandidaten) - 2)
    return kandidaten[start:start + 3]


def tunnel(f):
    tu = f["tunnel"]; nr = f["linie"]; items = tu["items"]
    fb = Faktenbasis(f)
    k = tu["anzahl_erfasst"]
    fr = []

    if k == 1:
        t = items[0]
        body = punkt(f"Für die Linie {nr} ist 1 Tunnel erfasst: {tunnel_satz(t)}") + bemerkungen([t])
        facts = [{"label": "Erfasste Tunnel", "value": 1, "source": "tunnel",
                  "factRef": "tunnel.anzahl_erfasst", "liste": "tunnel"}]
        if t.get("laenge_m") is not None:
            facts.append({"label": t["name"], "value": t["laenge_m"], "unit": "m",
                          "source": "tunnel", "factRef": "tunnel.items[0].laenge_m",
                          "liste": "tunnel", "eintrag": 0})
            frei, alle = vorschlaege(f"L{nr}", t["laenge_m"], 3, fb=fb)
            opts = [f"{ch(x)} m" for x in sorted({t["laenge_m"], *frei})]
            fr.append(auswahl_frage(f"{t['name']}: Wie lang ist dieser Tunnel laut den Daten?", opts,
                                    f"{ch(t['laenge_m'])} m",
                                    f"Erfasst sind {ch(t['laenge_m'])} Meter.",
                                    "tunnel.items[0].laenge_m", aus_fakten=not alle))
        gezeigt = [0]
    else:
        body = f"Für die Linie {nr} sind {k} Tunnel erfasst."
        lang = tu["laengste"]
        if len(lang) == 1:
            body += " " + punkt(f"Der längste: {tunnel_satz(items[lang[0]])}")
        else:
            body += (f" Gleich lang und am längsten sind "
                     f"{aufzaehlung([items[i]['name'] for i in lang])} mit je "
                     f"{ch(items[lang[0]]['laenge_m'])} Metern.")
        alt = tu["aelteste"]
        jahr = items[alt[0]]["inbetriebnahme_jahr"] if alt else None
        # Tunnelnamen ohne Artikel: «bei Galleria Crocetto» statt «der Galleria»
        if alt and len(alt) <= 3 and alt != lang:
            body += " " + punkt(f"Das früheste Jahr der ersten Inbetriebnahme ist {jahr}, bei "
                                f"{aufzaehlung([items[i]['name'] for i in alt])}")
        elif alt and len(alt) > 3:
            body += (f" Das früheste Jahr der ersten Inbetriebnahme ist {jahr}, bei "
                     f"{tu['anzahl_aelteste']} der erfassten Tunnel.")
        # die längsten in die Faktenliste
        nach_laenge = sorted((i for i, t in enumerate(items) if t.get("laenge_m") is not None),
                             key=lambda i: -items[i]["laenge_m"])
        gezeigt = nach_laenge[:TUNNEL_IN_LISTE]
        facts = [{"label": "Erfasste Tunnel", "value": k, "source": "tunnel",
                  "factRef": "tunnel.anzahl_erfasst", "liste": "tunnel"}]
        # «eintrag»: die Kachel führt zu diesem Tunnel in der ganzen Liste
        facts += [{"label": items[i]["name"], "value": items[i]["laenge_m"], "unit": "m",
                   "source": "tunnel", "factRef": f"tunnel.items[{i}].laenge_m",
                   "liste": "tunnel", "eintrag": i} for i in gezeigt]
        if k > len(gezeigt):
            body += " Die Liste zeigt die längsten davon."
        genannt = sorted(set(gezeigt) | set(lang) | (set(alt) if len(alt) <= 3 else set()))
        body += bemerkungen([items[i] for i in genannt])

        # Sortieren nach Länge, nur klar getrennte Werte
        kandidaten = klar_getrennt([{"i": i, "value": items[i]["laenge_m"]} for i in gezeigt])
        if len(kandidaten) >= 3:
            wahl = kandidaten[:4]
            fr.append(sortier(
                "Ordne diese Tunnel nach ihrer Länge, längster zuerst.",
                [{"label": items[x["i"]]["name"], "value": x["value"],
                  "factRef": f"tunnel.items[{x['i']}].laenge_m"} for x in wahl],
                "absteigend",
                punkt(aufzaehlung([f"{items[x['i']]['name']} {ch(x['value'])} m" for x in wahl])),
                "tunnel.items"))

    # Jahr und Tunnelsystem des längsten (oder einzigen) Tunnels: beides steht im Text
    haupt = tu["laengste"][0] if k > 1 and len(tu["laengste"]) == 1 else (0 if k == 1 else None)
    if haupt is not None:
        t = items[haupt]
        if t.get("inbetriebnahme_jahr") is not None:
            falsch = jahr_distraktoren(fb, t["inbetriebnahme_jahr"], f"{nr}:{haupt}")
            if falsch:
                fr.append(auswahl_frage(
                    f"{t['name']}: In welchem Jahr ging dieser Tunnel erstmals in Betrieb?",
                    [str(t["inbetriebnahme_jahr"]), *map(str, falsch)],
                    str(t["inbetriebnahme_jahr"]),
                    f"Als Jahr der ersten Inbetriebnahme ist {t['inbetriebnahme_jahr']} erfasst.",
                    f"tunnel.items[{haupt}].inbetriebnahme_jahr", diff=2))
        sys_ = t.get("tunnelsystem")
        if sys_ in TUNNELSYSTEME and sys_.lower() not in SAMMELANGABEN and len(fr) < 3:
            fr.append(auswahl_frage(
                f"{t['name']}: Welches Tunnelsystem ist für diesen Tunnel erfasst?",
                TUNNELSYSTEME, sys_,
                f"Erfasst ist «{sys_}». Das Tunnelsystem ist die einzige Angabe in diesen "
                "Daten dazu, wie viele Spuren es gibt, und gilt nur für den Tunnel.",
                f"tunnel.items[{haupt}].tunnelsystem", diff=2))
    return {"id": "tunnel", "title": "Tunnel", "body": body, "facts": facts, "questions": fr[:3]}


# ------------------------------------------------------------------ Brücken

#: Die Beschreibung der Quelle, sinngemäss. Allgemein, ohne Bezug auf die Linie.
BRUECKE = ("Eine Brücke ist ein Bauwerk, das über eine Strasse oder über ein Hindernis "
           "führt. Eine kleine Brücke bis zwei Meter wird als Durchlass bezeichnet. Die "
           "Daten bilden eine Brücke als Ganzes ab, bestehend aus einzelnen Baueinheiten.")

#: So viele Brücken zeigt die Faktenliste höchstens, die mit den meisten
#: Baueinheiten zuerst. Eine Gruppe mit gleich vielen wird nie angeschnitten.
BRUECKEN_IN_LISTE = 8

#: Kantone als falsche Antworten, wenn die Linie weniger als vier berührt.
#: Nur einzelne Kantone: «Aargau / Bern» und «Deutschland» stehen auch im Feld.
KANTONE_ERSATZ = ["Aargau", "Bern", "Fribourg", "Graubünden", "Luzern", "Solothurn",
                  "St. Gallen", "Thurgau", "Ticino", "Valais", "Vaud", "Zürich"]


def einheiten(n):
    return f"{n} Baueinheit" if n == 1 else f"{n} Baueinheiten"


def gruppen_bis(items, grenze):
    """Die Brücken mit den meisten Baueinheiten, ganze Gleichstandsgruppen,
    höchstens `grenze`. Passt schon die erste Gruppe nicht, bleibt die Liste leer."""
    werte = sorted({it["baueinheiten"] for it in items if it["baueinheiten"]}, reverse=True)
    gewaehlt = []
    for w in werte:
        gruppe = [i for i, it in enumerate(items) if it["baueinheiten"] == w]
        if len(gewaehlt) + len(gruppe) > grenze:
            break
        gewaehlt += gruppe
    return gewaehlt


def bruecken(f):
    br = f["bruecken"]; nr = f["linie"]; items = br["items"]
    fb = Faktenbasis(f)
    n = br["anzahl_erfasst"]
    kantone = br["nach_kanton"]
    # zwei Brücken mit demselben Namen (Aarebrücke) trennt der Kilometer
    namen = [it["name"] for it in items]
    def nenne(i):
        it = items[i]
        return f"{it['name']} (km {km(it['km'])})" if namen.count(it["name"]) > 1 else it["name"]

    if n == 1:
        it = items[0]
        body = (f"Für die Linie {nr} ist 1 Brücke erfasst: {it['name']}, "
                f"{einheiten(it['baueinheiten'])}, bei km {km(it['km'])}.")
    else:
        body = f"Für die Linie {nr} sind {n} Brücken erfasst."
    if len(kantone) == 1 and n == 1:
        body += f" Als Kanton ist «{kantone[0]['kanton']}» eingetragen."
    elif len(kantone) == 1:
        body += f" Als Kanton ist bei jeder erfassten Brücke «{kantone[0]['kanton']}» eingetragen."
    elif kantone:
        # das Wort «Brücken» beim ersten Wert: am Ende hiess es «bei 1 Brücken» (Linie 450)
        erster = kantone[0]
        teile = [f"«{erster['kanton']}» bei {erster['anzahl']} "
                 f"{'Brücke' if erster['anzahl'] == 1 else 'Brücken'}"]
        teile += [f"«{k['kanton']}» bei {k['anzahl']}" for k in kantone[1:]]
        body += f" Als Kanton eingetragen ist {aufzaehlung(teile)}."

    meiste, mit = br["meiste_baueinheiten"], br["mit_meisten"]
    if n > 1 and meiste == 1:
        body += " Jede erfasste Brücke besteht aus 1 Baueinheit."
    elif n > 1 and len(mit) == 1:
        # Namen enden manchmal mit Abkürzungspunkt («Schaffhauserstr.»)
        body += " " + punkt(f"Aus den meisten Baueinheiten, {meiste}, besteht {nenne(mit[0])}")
    elif n > 1 and len(mit) <= 3:
        body += " " + punkt(f"Aus den meisten Baueinheiten, {meiste}, bestehen "
                            f"{aufzaehlung([nenne(i) for i in mit])}")
    elif n > 1:
        body += (f" Aus den meisten Baueinheiten, {meiste}, bestehen "
                 f"{br['anzahl_mit_meisten']} der erfassten Brücken.")

    # «liste» und «filter»: Die App verlinkt die Kachel auf die ganze Liste
    facts = [{"label": "Erfasste Brücken", "value": n, "source": "brucken",
              "factRef": "bruecken.anzahl_erfasst", "liste": "bruecken"}]
    if len(kantone) > 1:
        facts += [{"label": k["kanton"], "value": k["anzahl"], "unit": "Brücken",
                   "source": "brucken", "factRef": f"bruecken.nach_kanton[{j}].anzahl",
                   "liste": "bruecken", "filter": {"feld": "kanton", "wert": k["kanton"]}}
                  for j, k in enumerate(kantone)]
    gezeigt = gruppen_bis(items, BRUECKEN_IN_LISTE) if n > 1 and meiste and meiste > 1 else []
    facts += [{"label": nenne(i), "value": items[i]["baueinheiten"], "unit": "Baueinheiten",
               "source": "brucken", "factRef": f"bruecken.items[{i}].baueinheiten",
               "liste": "bruecken", "eintrag": i}
              for i in gezeigt]
    if gezeigt and len(gezeigt) < n:
        body += " Die Liste zeigt die Brücken mit den meisten Baueinheiten."

    fr = []
    frei, alle = vorschlaege(f"B{nr}", n, 3, fb=fb)
    opts = [ch(x) for x in sorted({n, *frei})]
    fr.append(auswahl_frage(f"Wie viele Brücken sind für die Linie {nr} erfasst?", opts, ch(n),
                            f"Erfasst sind {n} Brücken. Die Zahl gibt wieder, was in den offenen "
                            "Daten steht." if n > 1 else "Erfasst ist 1 Brücke.",
                            "bruecken.anzahl_erfasst", aus_fakten=not alle))

    # Kanton mit den meisten Brücken: nur mit klarem Vorsprung
    if len(kantone) >= 2 and not zu_nah(kantone[0]["anzahl"], kantone[1]["anzahl"]):
        eigene = [k["kanton"] for k in kantone]
        ersatz = [k for k in KANTONE_ERSATZ if k not in eigene]
        start = streuung(f"{nr}:kanton", len(ersatz))
        dazu = [ersatz[(start + j * 5) % len(ersatz)] for j in range(max(0, 4 - len(eigene)))]
        fr.append(auswahl_frage(
            f"Welcher Kanton ist bei den meisten Brücken der Linie {nr} eingetragen?",
            (eigene[:4] + dazu)[:4] if kantone[0]["kanton"] in eigene[:4] else eigene[:4],
            kantone[0]["kanton"],
            f"Bei «{kantone[0]['kanton']}» sind {kantone[0]['anzahl']} der erfassten Brücken eingetragen.",
            "bruecken.nach_kanton[0].kanton", diff=2))

    # Die Brücke mit den meisten Baueinheiten, gegen andere aus der Liste
    if len(mit) == 1 and gezeigt:
        andere = [i for i in gezeigt if i != mit[0] and namen.count(items[i]["name"]) == 1]
        if len(andere) >= 1 and namen.count(items[mit[0]]["name"]) == 1:
            wahl = andere[:3]
            fr.append(auswahl_frage(
                "Welche dieser Brücken besteht laut den Daten aus den meisten Baueinheiten?",
                [items[i]["name"] for i in [mit[0], *wahl]], items[mit[0]]["name"],
                f"{items[mit[0]]['name']} besteht aus {meiste} Baueinheiten, "
                + aufzaehlung([f"{items[i]['name']} aus {items[i]['baueinheiten']}" for i in wahl]) + ".",
                f"bruecken.items[{mit[0]}].name", diff=2))
    return {"id": "bruecken", "title": "Brücken", "body": body, "facts": facts,
            "erlaeuterung": BRUECKE, "questions": fr[:3]}


# ------------------------------------------------------------------ Bahnübergänge

#: Die Beschreibung der Quelle, sinngemäss. Allgemein, ohne Bezug auf die Linie.
BAHNUEBERGANG = ("Bahnübergänge sind niveaugleiche Gleisquerungen. Sie sind signaltechnisch "
                 "gesichert, mit Blinklicht oder Schranken oder mit einer "
                 "Verkehrsregelungsanlage, oder ungesichert.")

#: Sicherungsarten, wie die Quelle sie schreibt, als falsche Antworten. «Andere»
#: ist die Sammelangabe und taugt weder als Antwort noch als falsche Antwort.
SICHERUNGSARTEN = ["Schrankenanlage", "Blinklichtanlage", "Halbschrankeanlage",
                   "Bedarfsschrankenanl", "VRA", "unbewacht"]


def uebergaenge_wort(n, dativ=False):
    if n == 1:
        return "Bahnübergang"
    return "Bahnübergängen" if dativ else "Bahnübergänge"


def bahnuebergaenge(f):
    ue = f["bahnuebergaenge"]; nr = f["linie"]; items = ue["items"]
    fb = Faktenbasis(f)
    n = ue["anzahl_erfasst"]
    arten = ue["nach_sicherungsart"]
    namen = [it["name"] for it in items]
    def nenne(i):
        it = items[i]
        return f"{it['name']} (km {km(it['km'])})" if namen.count(it["name"]) > 1 else it["name"]

    if n == 1:
        it = items[0]
        body = f"Für die Linie {nr} ist 1 Bahnübergang erfasst: {it['name']}, bei km {km(it['km'])}."
        if it["sicherungsart"]:
            body += f" Als Sicherungsart ist «{it['sicherungsart']}» eingetragen."
        if it["gleise"]:
            body += f" Eingetragen {'ist 1 gekreuztes Gleis' if it['gleise'] == 1 else 'sind ' + str(it['gleise']) + ' gekreuzte Gleise'}."
    else:
        body = f"Für die Linie {nr} sind {n} Bahnübergänge erfasst."
        if len(arten) == 1 and not ue["ohne_sicherungsart"]:
            body += f" Als Sicherungsart ist bei jedem erfassten Bahnübergang «{arten[0]['wert']}» eingetragen."
        elif arten:
            erster = arten[0]
            teile = [f"«{erster['wert']}» bei {erster['anzahl']} {uebergaenge_wort(erster['anzahl'], True)}"]
            teile += [f"«{a['wert']}» bei {a['anzahl']}" for a in arten[1:]]
            body += f" Als Sicherungsart eingetragen ist {aufzaehlung(teile)}."
        if ue["ohne_sicherungsart"]:
            body += (f" Bei {ue['ohne_sicherungsart']} der erfassten Bahnübergänge ist keine "
                     "Sicherungsart eingetragen."
                     if arten else " Eine Sicherungsart ist bei keinem eingetragen.")
        mg, mit = ue["meiste_gleise"], ue["mit_meisten_gleisen"]
        if mg and len(mit) <= 3:
            body += " " + punkt(f"Die grösste eingetragene Zahl gekreuzter Gleise ist {mg}, bei "
                                f"{aufzaehlung([nenne(i) for i in mit])}")
        elif mg:
            body += (f" Die grösste eingetragene Zahl gekreuzter Gleise ist {mg}, bei "
                     f"{ue['anzahl_mit_meisten_gleisen']} der erfassten Bahnübergänge.")

    facts = [{"label": "Erfasste Bahnübergänge", "value": n, "source": "bahnubergang",
              "factRef": "bahnuebergaenge.anzahl_erfasst", "liste": "bahnuebergaenge"}]
    if n > 1:
        facts += [{"label": f"«{a['wert']}»", "value": a["anzahl"], "unit": uebergaenge_wort(a["anzahl"]),
                   "source": "bahnubergang", "factRef": f"bahnuebergaenge.nach_sicherungsart[{j}].anzahl",
                   "liste": "bahnuebergaenge",
                   "filter": {"feld": "sicherungsart", "wert": a["wert"]}}
                  for j, a in enumerate(arten)]
        if ue["ohne_sicherungsart"]:
            facts.append({"label": "Ohne eingetragene Sicherungsart", "value": ue["ohne_sicherungsart"],
                          "source": "bahnubergang", "factRef": "bahnuebergaenge.ohne_sicherungsart",
                          "liste": "bahnuebergaenge",
                          "filter": {"feld": "sicherungsart", "wert": None}})
    mg, mit = ue["meiste_gleise"], ue["mit_meisten_gleisen"]
    gezeigt = []
    if n > 1 and mg and mg > 1:
        mit_zahl = [dict(it, baueinheiten=it["gleise"]) for it in items]   # gleiche Gruppierung wie bei den Brücken
        gezeigt = gruppen_bis(mit_zahl, BRUECKEN_IN_LISTE)
        facts += [{"label": nenne(i), "value": items[i]["gleise"], "unit": "Gleise",
                   "source": "bahnubergang", "factRef": f"bahnuebergaenge.items[{i}].gleise",
                   "liste": "bahnuebergaenge", "eintrag": i}
                  for i in gezeigt]
        if gezeigt and len(gezeigt) < n:
            body += " Die Liste zeigt die Bahnübergänge mit den meisten gekreuzten Gleisen."

    fr = []
    frei, alle = vorschlaege(f"U{nr}", n, 3, fb=fb)
    opts = [ch(x) for x in sorted({n, *frei})]
    fr.append(auswahl_frage(f"Wie viele Bahnübergänge sind für die Linie {nr} erfasst?", opts, ch(n),
                            f"Erfasst sind {n} Bahnübergänge. Die Zahl gibt wieder, was in den "
                            "offenen Daten steht." if n > 1 else "Erfasst ist 1 Bahnübergang.",
                            "bahnuebergaenge.anzahl_erfasst", aus_fakten=not alle))

    # Sicherungsart: die häufigste, nur mit klarem Vorsprung und nie die Sammelangabe
    oben = arten[0]["wert"] if arten else None
    klar = len(arten) == 1 or (len(arten) > 1 and not zu_nah(arten[0]["anzahl"], arten[1]["anzahl"]))
    if oben and oben in SICHERUNGSARTEN and klar and (n > 1 or len(fr) < 3):
        eigene = [a["wert"] for a in arten if a["wert"] in SICHERUNGSARTEN]
        ersatz = [x for x in SICHERUNGSARTEN if x not in eigene]
        # Linie 650 hat alle sechs Sicherungsarten: dann bleibt nichts zu ergänzen
        start = streuung(f"{nr}:sicherung", len(ersatz)) if ersatz else 0
        dazu = [ersatz[(start + j) % len(ersatz)] for j in range(min(len(ersatz), max(0, 4 - len(eigene))))]
        optionen = (eigene + dazu)[:4] if oben in (eigene + dazu)[:4] else [oben, *(eigene + dazu)[:3]]
        if n == 1:
            frage = f"Welche Sicherungsart ist beim Bahnübergang der Linie {nr} eingetragen?"
        elif len(arten) == 1 and not ue["ohne_sicherungsart"]:
            frage = f"Welche Sicherungsart ist bei den Bahnübergängen der Linie {nr} eingetragen?"
        else:
            frage = f"Welche Sicherungsart ist bei den meisten Bahnübergängen der Linie {nr} eingetragen?"
        fr.append(auswahl_frage(
            frage, optionen, oben,
            f"Eingetragen ist «{oben}»" + (f", bei {arten[0]['anzahl']} der erfassten Bahnübergänge."
                                         if n > 1 else "."),
            "bahnuebergaenge.nach_sicherungsart[0].wert" if n > 1 else "bahnuebergaenge.items[0].sicherungsart",
            diff=2))

    # der Bahnübergang mit den meisten gekreuzten Gleisen, gegen andere aus der Liste
    if len(mit) == 1 and gezeigt and namen.count(items[mit[0]]["name"]) == 1:
        andere = [i for i in gezeigt if i != mit[0] and namen.count(items[i]["name"]) == 1][:3]
        if andere:
            fr.append(auswahl_frage(
                "Bei welchem dieser Bahnübergänge sind die meisten gekreuzten Gleise eingetragen?",
                [items[i]["name"] for i in [mit[0], *andere]], items[mit[0]]["name"],
                f"Bei {items[mit[0]]['name']} sind {mg} Gleise eingetragen, "
                + aufzaehlung([f"bei {items[i]['name']} {items[i]['gleise']}" for i in andere]) + ".",
                f"bahnuebergaenge.items[{mit[0]}].name", diff=2))
    return {"id": "bahnuebergaenge", "title": "Bahnübergänge", "body": body, "facts": facts,
            "erlaeuterung": BAHNUEBERGANG, "questions": fr[:3]}


# ------------------------------------------------------------------ Schienennetz des BAV

SCHIENENNETZ = ("Das Schienennetz des Bundesamts für Verkehr (BAV) beschreibt die Linien aller "
                "Bahnen in der Schweiz, Abschnitt für Abschnitt zwischen zwei Betriebspunkten. "
                "Die Spurweite ist der innere Abstand zwischen den beiden Schienen eines Gleises.")


def weitere_bahnhoefe(f):
    """Bahnhöfe, die nur das Schienennetz des BAV auf dieser Linie führt,
    etwa die der BLS auf Linie 220."""
    w = f["weitere_bahnhoefe"]; nr = f["linie"]; items = w["items"]
    n = w["anzahl"]
    body = (f"Auf der Linie {nr} führt das Schienennetz des BAV "
            f"{'einen Bahnhof aus Taktland' if n == 1 else f'{n} Bahnhöfe aus Taktland'}, "
            f"{'der' if n == 1 else 'die'} in der Liste der Betriebspunkte der SBB "
            f"{'fehlt' if n == 1 else 'fehlen'}"
            + (f": {aufzaehlung([it['name'] for it in items])}." if n <= 3 else ".")
            + " Die Kilometer sind die des Schienennetzes.")
    facts = [{"label": "Weitere Bahnhöfe", "value": n, "source": "schienennetz",
              "factRef": "weitere_bahnhoefe.anzahl"}] + [
        {"label": it["name"], "value": it["km"], "unit": "km", "source": "schienennetz",
         "factRef": f"weitere_bahnhoefe.items[{i}].km", "uic": it["uic"]}
        for i, it in enumerate(items)]
    fr = []
    mit_index = [{"i": i, **it} for i, it in enumerate(items)]
    getrennt = sorted(klar_getrennt(mit_index, wert=lambda x: x["km"]), key=lambda x: x["km"])
    if len(getrennt) >= 3:
        k = min(4, len(getrennt))
        schritt = (len(getrennt) - 1) / (k - 1)
        wahl = [getrennt[round(j * schritt)] for j in range(k)]
        fr.append(sortier(
            f"Ordne diese Bahnhöfe nach ihrem Kilometer auf der Linie {nr}, kleinster zuerst.",
            [{"label": x["name"], "value": x["km"], "factRef": f"weitere_bahnhoefe.items[{x['i']}].km"}
             for x in wahl],
            "aufsteigend",
            punkt(aufzaehlung([f"{x['name']} bei km {km(x['km'])}" for x in wahl])),
            "weitere_bahnhoefe.items"))
    else:
        # Zu wenige zum Ordnen: Welcher liegt auf der Linie? Die falschen
        # Antworten sind Bahnhöfe, die weder die SBB noch das BAV auf dieser
        # Linie führen, aber auf einer anderen Linie mit Seite
        hier = {it["uic"] for it in items} | {it["uic"] for it in f["bahnhoefe"]["items"]}
        falsch = sorted(n for n in andere_bahnhoefe() if n not in hier_namen(hier))
        if len(falsch) >= 3:
            start = streuung(f"{nr}:weitere", len(falsch))
            drei = sorted({falsch[(start + i * 11) % len(falsch)] for i in range(3)})
            if len(drei) == 3:
                richtig = items[0]["name"]
                fr.append(auswahl_frage(
                    f"Welcher dieser Bahnhöfe liegt laut Schienennetz des BAV auf der Linie {nr}?",
                    [richtig, *drei], richtig,
                    f"{richtig} liegt laut Schienennetz auf der Linie {nr}, bei km {km(items[0]['km'])}.",
                    "weitere_bahnhoefe.items[0].name", diff=2))
    return {"id": "weitere_bahnhoefe", "title": "Weitere Bahnhöfe laut BAV", "body": body,
            "facts": facts, "erlaeuterung": SCHIENENNETZ, "questions": fr}


_BAHNHOEFE = None


def andere_bahnhoefe():
    """Namen aller Bahnhöfe, die auf irgendeiner Linie mit Seite stehen"""
    global _BAHNHOEFE
    if _BAHNHOEFE is None:
        _BAHNHOEFE = {}
        for p in LINIEN.glob("*.json"):
            f = json.loads(p.read_text(encoding="utf-8"))
            for teil in ("bahnhoefe", "weitere_bahnhoefe"):
                for it in (f.get(teil) or {}).get("items", []):
                    _BAHNHOEFE[it["name"]] = it["uic"]
    return _BAHNHOEFE


def hier_namen(uics):
    return {n for n, u in andere_bahnhoefe().items() if u in uics}


def abschnitte(n, dativ=False):
    if n == 1:
        return "einem Abschnitt" if dativ else "ein Abschnitt"
    return f"{n} Abschnitten" if dativ else f"{n} Abschnitte"


def netz(f):
    """Je Abschnitt Infrastrukturbetreiberin, Streckengleise, Spurweite und
    Elektrifizierung, gezählt in der Pipeline. Die Abkürzungen stehen wie in
    der Quelle, in Guillemets: «zb» läse sich sonst wie «z. B.»."""
    x = f["netz"]; nr = f["linie"]; n = x["abschnitte_erfasst"]
    spur, strom, gleise = x["nach_spurweite"], x["nach_strom"], x["nach_gleisen"]

    def verteilung(wort, liste, zeigen=lambda w: w):
        if len(liste) == 1:
            return f"{wort}: {zeigen(liste[0]['wert'])} bei " + (
                "dem einen erfassten Abschnitt." if n == 1 else f"allen {n} erfassten Abschnitten.")
        return f"{wort}: " + ", ".join(
            f"{zeigen(g['wert'])} ({abschnitte(g['abschnitte'])})" for g in liste) + "."

    body = " ".join([
        f"Im Schienennetz des BAV besteht die Linie {nr} aus {abschnitte(n, dativ=True)} zwischen "
        f"Betriebspunkten. Datenherr der Linie ist «{x['bahn']}».",
        verteilung("Infrastruktur", x["nach_isb"], lambda w: f"«{w}»"),
        verteilung("Streckengleise", gleise),
        verteilung("Spurweite", spur),
        verteilung("Strom", strom),
    ])
    facts = [
        {"label": "Datenherr der Linie", "value": x["bahn"], "source": "schienennetz",
         "factRef": "netz.bahn"},
        {"label": "Abschnitte", "value": n, "source": "schienennetz", "factRef": "netz.abschnitte_erfasst"},
    ]
    for liste, feld, wort in ((x["nach_isb"], "nach_isb", "Infrastruktur"),
                              (gleise, "nach_gleisen", "Streckengleise"),
                              (spur, "nach_spurweite", "Spurweite"),
                              (strom, "nach_strom", "Strom")):
        for j, g in enumerate(liste):
            facts.append({"label": f"{wort}: {g['wert']}", "value": g["abschnitte"],
                          "unit": "Abschnitte" if g["abschnitte"] != 1 else "Abschnitt",
                          "source": "schienennetz", "factRef": f"netz.{feld}[{j}].abschnitte"})
    fr = []
    # Spurweite nur, wenn sie auf der ganzen Linie dieselbe ist
    if len(spur) == 1 and spur[0]["wert"] in ("1435 mm", "1000 mm", "800 mm"):
        opts = ["1435 mm", "1000 mm", "800 mm", "750 mm"]
        fr.append(auswahl_frage(f"Welche Spurweite hat die Linie {nr} laut Schienennetz?",
                                opts, spur[0]["wert"],
                                f"Alle {n} erfassten Abschnitte der Linie {nr} haben die Spurweite "
                                f"{spur[0]['wert']}." if n > 1 else
                                f"Der Abschnitt der Linie {nr} hat die Spurweite {spur[0]['wert']}.",
                                "netz.nach_spurweite[0].wert", diff=1))
    if len(strom) == 1 and strom[0]["wert"] in ("Wechselstrom 16,7 Hz", "Gleichstrom"):
        fr.append(auswahl_frage(f"Mit welchem Strom ist die Linie {nr} laut Schienennetz elektrifiziert?",
                                ["Wechselstrom 16,7 Hz", "Gleichstrom", "Wechselstrom 50 Hz",
                                 "nicht elektrifiziert"], strom[0]["wert"],
                                f"Im Schienennetz steht für die Linie {nr}: {strom[0]['wert']}.",
                                "netz.nach_strom[0].wert", diff=2))
    return {"id": "netz", "title": "Netz", "body": body, "facts": facts,
            "erlaeuterung": SCHIENENNETZ, "questions": fr}


BAUER = {"strecke": strecke, "bahnhoefe": bahnhoefe, "weitere_bahnhoefe": weitere_bahnhoefe,
         "netz": netz, "tunnel": tunnel, "bruecken": bruecken, "bahnuebergaenge": bahnuebergaenge}
