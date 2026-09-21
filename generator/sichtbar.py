"""Was gefragt wird, steht im Kapitel.

Die App zeigt zu jedem Kapitel den Text und die Faktenliste, darunter die
Fragen. Sortier- und Zuordnungsfragen verlangten oft Werte, die dort nicht
standen: die Werktagszahlen früherer Jahre, Nettoflächen, Zugzahlen je
Abschnitt, Belagsflächen, Perronkanten. Aufgefallen bei Reconvilier
(«Ordne die Perrons nach erfasster Belagsfläche», 347, 202 und 152
Quadratmeter), betroffen waren rund 1000 Fragen.

Fehlt ein solcher Wert, kommt er als eigene Zeile in die Faktenliste,
beschriftet mit dem, wozu er gehört («Nettofläche Perron 2»). Die Prüfung
dazu ist `unsichtbar()` in taktland.py.
"""
import re

from taktland import Faktenbasis, unsichtbar

ART = {"Personenverkehr": "Personenverkehr", "Gueterverkehr": "Güterverkehr"}

#: factRef eines Werts -> Beschriftung aus dem Eintrag, Einheit, Quelle
ZEILEN = [
    (r"steckbrief\.verlauf\[\d+\]\.dwv",
     lambda e: f"Ein- und Aussteigende an einem Werktag {e['jahr']}", "Personen", "passagierfrequenz"),
    (r"perrons\.items\[\d+\]\.flaeche_netto_m2",
     lambda e: f"Nettofläche Perron {e['nr']}", "m²", "perron"),
    (r"perrons\.items\[\d+\]\.laenge_m",
     lambda e: f"Länge Perron {e['nr']}", "m", "perron"),
    (r"gleise\.items\[\d+\]\.perronkante_m",
     lambda e: f"Perronkante Gleis {e['nr']}", "m", "21197_behig-haltekantesegment"),
    (r"zuege\.abschnitte\[\d+\]\.zuege_pro_jahr",
     lambda e: f"Züge pro Jahr, {ART[e['art']]} {e['von']} – {e['bis']}", "Züge/Jahr", "zugzahlen"),
    (r"ausstattung\.perronbelag\.items\[\d+\]\.flaeche_m2",
     lambda e: f"Belagsfläche Perron {e['nr']}", "m²", "perronoberflache"),
]


def zeile(ref, fb):
    """Die Faktenzeile zu einem Wert, oder ValueError, wenn die Art fehlt."""
    for muster, beschriftung, einheit, quelle in ZEILEN:
        if re.fullmatch(muster, ref):
            eintrag = fb.aufloesen(ref.rsplit(".", 1)[0])
            return {"label": beschriftung(eintrag), "value": fb.aufloesen(ref),
                    "unit": einheit, "source": quelle, "factRef": ref}
    raise ValueError(f"Keine Faktenzeile für {ref}. In sichtbar.ZEILEN ergänzen")


def natuerlich(text):
    """Gleis 2 vor Gleis 10."""
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", text)]


def ergaenzen(d, f):
    """Setzt fehlende Werte von Sortier- und Zuordnungsfragen in die Faktenliste."""
    fb = Faktenbasis(f)
    for k in d["chapters"]:
        neu = []
        for q in k["questions"]:
            if q["type"] not in ("sort", "match") or not unsichtbar(k, q):
                continue
            teile = q.get("items") or q.get("pairs")
            vorhanden = {x["factRef"] for x in k["facts"] + neu}
            for it in teile:
                z = zeile(it["factRef"], fb)
                if z["factRef"] not in vorhanden and unsichtbar(
                        {**k, "facts": k["facts"] + neu}, {**q, "items" if "items" in q else "pairs": [it]}):
                    neu.append(z)
        # in der Reihenfolge der Beschriftung, nicht der Lösung
        k["facts"] += sorted(neu, key=lambda z: natuerlich(z["label"]))
