#!/usr/bin/env python3
"""Prueft data/vergleich.json Wert fuer Wert gegen die Faktendateien.

Die Vergleichsfragen entstehen erst in der App, es gibt also kein Profil, das
der uebliche Pruefer lesen koennte. Geprueft wird darum die Grundlage: Stimmt
jede Zahl mit der Faktendatei ueberein, aus der sie stammt?

Zusaetzlich wird geprueft, dass keine Kategorie erfasste Bestaende als
Messwerte ausgibt. Ein Vergleich von Bestaenden darf nur ueber die Daten
sprechen, nicht ueber die Wirklichkeit.

    python generator/validate_vergleich.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))

from build_vergleich import KATEGORIEN, LINIEN_KATEGORIEN, TUNNEL_KATEGORIEN, holen  # noqa: E402

FACTS = ROOT / "data" / "facts"
LINIEN = ROOT / "data" / "linien"
DATEI = ROOT / "data" / "vergleich.json"

#: Die zweite Meinung: Nur diese Felder duerfen als Messwert gelten, also als
#: Groesse, ueber die sich eine Aussage zur Wirklichkeit treffen laesst. Die
#: Liste steht bewusst hier und nicht in der Pipeline - sonst pruefte die
#: Pipeline sich selbst. Wer eine Kategorie hinzufuegt, muss hier begruenden,
#: dass der Wert fuer jeden Bahnhof erhoben wurde und nicht bloss erfasst ist.
MESSWERTE = {
    "steckbrief.dwv",                          # Zaehlung der SBB, alle Bahnhoefe
    "steckbrief.dtv",
    "steckbrief.dnwv",
    "stammdaten.hoehe_m_ue_m",                 # Lage, keine Erhebungsfrage
    "zuege.staerkster_abschnitt.zuege_pro_tag",  # Fahrplanzaehlung je Abschnitt
    # Tunnel: Laenge und Jahr stehen fuer alle 289 Tunnel der Quelle, das
    # Verzeichnis ist das Tunnelinventar der SBB, kein erfasster Bestand
    "tunnel.laenge_m",
    "tunnel.inbetriebnahme_jahr",
}

#: Die zweite Meinung zu den Kantonen der Tunnel: Kürzel und die Schreibweisen,
#: unter denen die Quelle den Kanton führen darf. Unabhängig von der Tabelle
#: in pipeline/build_vergleich.py geschrieben.
KANTONSNAMEN = {
    "AG": {"Aargau"}, "AI": {"Appenzell Innerrhoden"}, "AR": {"Appenzell Ausserrhoden"},
    "BE": {"Bern", "Berne"}, "BL": {"Basel-Landschaft"}, "BS": {"Basel-Stadt"},
    "FR": {"Fribourg", "Freiburg"}, "GE": {"Genève", "Genf"}, "GL": {"Glarus"},
    "GR": {"Graubünden", "Grischun", "Grigioni"}, "JU": {"Jura"}, "LU": {"Luzern"},
    "NE": {"Neuchâtel", "Neuenburg"}, "NW": {"Nidwalden"}, "OW": {"Obwalden"},
    "SG": {"St. Gallen"}, "SH": {"Schaffhausen"}, "SO": {"Solothurn"}, "SZ": {"Schwyz"},
    "TG": {"Thurgau"}, "TI": {"Ticino", "Tessin"}, "UR": {"Uri"},
    "VD": {"Vaud", "Waadt"}, "VS": {"Valais", "Wallis"}, "ZG": {"Zug"}, "ZH": {"Zürich"},
}


def kantone_soll(wert):
    teile = [t.strip() for t in (wert or "").split("/")]
    return sorted({k for t in teile for k, namen in KANTONSNAMEN.items() if t in namen})


def main():
    if not DATEI.exists():
        print("data/vergleich.json fehlt. Zuerst pipeline/build_vergleich.py laufen lassen.")
        return 1
    v = json.loads(DATEI.read_text(encoding="utf-8"))
    pfade = {k["id"]: k["pfad"] for k in KATEGORIEN}
    pfade.update({k["id"]: ["tunnel", *k["pfad"]] for k in TUNNEL_KATEGORIEN})
    pfade.update({k["id"]: k["pfad"] for k in LINIEN_KATEGORIEN})
    fehler = []

    for kat in v["kategorien"] + v.get("tunnel_kategorien", []) + v.get("linien_kategorien", []):
        pfad = pfade[kat["id"]]
        if kat["art"] == "messwert" and ".".join(pfad) not in MESSWERTE:
            fehler.append(f"Kategorie «{kat['id']}»: {'.'.join(pfad)} gilt als "
                          "Messwert, steht aber nicht auf der geprüften Liste. "
                          "Entweder begründen und eintragen, oder art auf "
                          "«erfasst» setzen")
        if kat["art"] == "erfasst" and "erfasst" not in kat["frage"].lower():
            fehler.append(f"Kategorie «{kat['id']}»: vergleicht den Datenbestand, "
                          "die Frage sagt das aber nicht")
        if kat["art"] == "erfasst" and "daten" not in (kat.get("hinweis") or "").lower():
            fehler.append(f"Kategorie «{kat['id']}»: braucht einen Hinweis, der "
                          "sagt, dass der Datenbestand verglichen wird. Die App "
                          "zeigt genau diesen Satz")
        if kat["min_abstand"] <= 0 and kat["min_anteil"] <= 0:
            fehler.append(f"Kategorie «{kat['id']}»: ohne Mindestabstand entstehen "
                          "Fragen, die ein Münzwurf sind")

    geprueft = 0
    for b in v["bahnhoefe"]:
        p = FACTS / f"{b['uic']}.json"
        if not p.exists():
            fehler.append(f"{b['name']} ({b['uic']}): keine Faktendatei")
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        if d["name"] != b["name"]:
            fehler.append(f"{b['uic']}: Name «{b['name']}» statt «{d['name']}»")
        for kid, wert in b["werte"].items():
            soll = holen(d, pfade[kid])
            geprueft += 1
            if soll != wert:
                fehler.append(f"{b['name']} ({b['uic']}), {kid}: "
                              f"{wert!r} statt {soll!r} aus den Fakten")

    # Tunnel: jeder Wert gegen die Faktendatei seiner Linie
    for t in v.get("tunnel", []):
        nr, i = t["id"].split(":")
        p = LINIEN / f"{nr}.json"
        if not p.exists():
            fehler.append(f"Tunnel {t['name']}: keine Faktendatei für Linie {nr}")
            continue
        items = (json.loads(p.read_text(encoding="utf-8")).get("tunnel") or {}).get("items", [])
        soll = items[int(i)] if int(i) < len(items) else {}
        if soll.get("name") != t["name"] or soll.get("bemerkung") != t.get("bemerkung"):
            fehler.append(f"Tunnel {t['id']}: Name oder Bemerkung weicht von der Linie {nr} ab")
        # Der Kanton entscheidet, in welcher Kantonsauswahl der Tunnel antritt
        if t.get("kantone") != kantone_soll(soll.get("kanton")):
            fehler.append(f"Tunnel {t['name']}: Kantone {t.get('kantone')} passen nicht zum "
                          f"Eintrag «{soll.get('kanton')}» der Quelle")
        for kid, wert in t["werte"].items():
            geprueft += 1
            if soll.get(pfade[kid][-1]) != wert:
                fehler.append(f"Tunnel {t['name']}, {kid}: {wert!r} statt "
                              f"{soll.get(pfade[kid][-1])!r} aus den Fakten")

    # Linien: jeder Wert gegen ihre Faktendatei; ein erfasster Bestand unter 1
    # tritt nicht an
    for li in v.get("linien", []):
        p = LINIEN / f"{li['linie']}.json"
        if not p.exists():
            fehler.append(f"Linie {li['linie']}: keine Faktendatei")
            continue
        f = json.loads(p.read_text(encoding="utf-8"))
        if f["name"] != li["name"]:
            fehler.append(f"Linie {li['linie']}: Name «{li['name']}» statt «{f['name']}»")
        for kid, wert in li["werte"].items():
            geprueft += 1
            soll = holen(f, pfade[kid])
            if soll != wert or wert < 1:
                fehler.append(f"Linie {li['linie']}, {kid}: {wert!r} statt {soll!r} aus den Fakten")

    print(f"{len(v['bahnhoefe'])} Bahnhöfe, {len(v.get('tunnel', []))} Tunnel und "
          f"{len(v.get('linien', []))} Linien, {geprueft} Werte geprüft")
    for f in fehler[:20]:
        print(f"    FEHLER   {f}")
    if fehler:
        print(f"\n{len(fehler)} Fehler")
        return 1
    print("Jeder Wert stimmt mit der Faktendatei überein.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
