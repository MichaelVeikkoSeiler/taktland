#!/usr/bin/env python3
"""Erzeugt data/facts/{uic}.json: geprueftc Fakten pro Bahnhof, ohne jeden Text.

Nur was hier steht, darf spaeter in einem Profil auftauchen.
Jeder Block nennt das Dataset, aus dem er stammt.

Aufruf:
    python pipeline/build_facts.py 8503000 8500218 8508001
    python pipeline/build_facts.py --all
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sources import ZUSAETZLICH  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "facts"

# Grenzwerte der Groessenstufen. L richtet sich nach dem Bahnhofplan,
# weil nur dort die Plan-Kapitel moeglich sind.
TIER_M_DWV = 5000


def load(name, **kw):
    return pd.read_csv(RAW / f"{name}.csv", sep=";", low_memory=False, **kw)


def as_uic(series):
    return pd.to_numeric(series, errors="coerce").astype("Int64")


def num(v):
    """Numpy-Typen in JSON-taugliche Werte verwandeln."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if pd.isna(v):
        return None
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def txt(v):
    if v is None or pd.isna(v):
        return None
    s = str(v).strip()
    return s or None


class Data:
    """Laedt die Rohdaten einmal und haelt sie fuer alle Bahnhoefe bereit."""

    def __init__(self):
        pf = load("passagierfrequenz")
        pf["uic"] = as_uic(pf.uic)
        pf["jahr"] = pd.to_numeric(pf.jahr_annee_anno, errors="coerce")
        self.pf = pf.dropna(subset=["uic", "jahr"])

        self.perron = self._with_uic("perron", "bpuic")
        self.perronoberflache = self._with_uic("perronoberflache", "bpuic")
        self.sektor = self._with_uic("sektortafel", "bpuic")
        self.wartehalle = self._with_uic("haltestelle-wartehallen", "bpuic")
        self.sicherheitslinie = self._with_uic("haltestelle-visuell-taktile-sicherheitslinie", "bpuic")
        self.wifi = self._with_uic("wifistation", "bpuic")
        self.plakat = self._with_uic("abfahrtsplakate0", "bpuic")
        self.plan = self._with_uic("haltestelle-karte-trafimage", "bpuic")
        self.betriebspunkte = self._with_uic("linie-mit-betriebspunkten", "bpuic")
        self.tagesverlauf = self._with_uic("anzahl-sbb-bahnhofbenutzer-tagesverlauf", "bpuic")

        # Trotz des Namens enthaelt dieses Dataset keine Haltekanten, sondern
        # Stammdaten der Dienststellen (Hoehe ue. M., Gemeinde, Verkehrsmittel).
        hk = load("haltestelle-haltekante")
        hk["uic"] = as_uic(hk["number"])
        self.dienststelle = hk[hk.validto.astype(str).str.startswith("9999")]

        zz = load("zugzahlen")
        zz["jahr"] = pd.to_numeric(zz.jahr, errors="coerce")
        zz["von_bpuic"] = as_uic(zz.von_bpuic)
        zz["bis_bpuic"] = as_uic(zz.bis_bpuic)
        self.zugzahlen = zz[zz.jahr == zz.jahr.max()]

        # Ausstattung haengt am Betriebspunkt-Kuerzel, nicht am UIC
        paare = self.betriebspunkte.dropna(subset=["abkurzung_bpk", "uic"])
        self.bps2uic = dict(zip(paare.abkurzung_bpk.astype(str), paare.uic))
        self.uic2bps = {}
        for k, v in self.bps2uic.items():
            self.uic2bps.setdefault(int(v), k)
        self.automat = load("billetautomat")
        self.entwerter = load("billetentwerter")
        # didok ist die DiDok-Nummer ohne Laenderpraefix: 3000 -> 8503000
        behig = load("21197_behig-haltekantesegment")
        behig["uic"] = 8500000 + pd.to_numeric(behig.didok, errors="coerce").astype("Int64")
        self.behig = behig
        self.uhr = load("haltestelle-uhr")

        self.benutzer = load("anzahl-sbb-bahnhofbenutzer")
        self.wochentag = load("anzahl-sbb-bahnhofbenutzer-wochentag")

    def _with_uic(self, name, col):
        df = load(name)
        df["uic"] = as_uic(df[col])
        return df

    def alle_sbb(self):
        neu = self.pf.sort_values("jahr").groupby("uic").tail(1)
        uics = [int(u) for u in neu[neu.isb_gi.astype(str).str.strip() == "SBB"].uic]
        # ausdruecklich gewuenschte Bahnhoefe anderer Betreiberinnen
        vorhanden = set(neu.uic.astype("int64"))
        uics += [u for u in ZUSAETZLICH if u in vorhanden and u not in uics]
        return uics


def steckbrief(d, uic):
    zeilen = d.pf[d.pf.uic == uic].sort_values("jahr")
    if zeilen.empty:
        return None
    r = zeilen.iloc[-1]
    lon = lat = None
    if isinstance(r.geopos, str) and "," in r.geopos:
        try:
            lat, lon = (round(float(x), 6) for x in r.geopos.split(",", 1))
        except ValueError:
            lat = lon = None
    verlauf = [
        {"jahr": int(z.jahr), "dwv": num(z.dwv_tmjo_tfm)}
        for _, z in zeilen.iterrows() if pd.notna(z.dwv_tmjo_tfm)
    ]
    return {
        "source": "passagierfrequenz",
        "jahr": int(r.jahr),
        "name": txt(r.bahnhof_gare_stazione),
        "kanton": txt(r.kt_ct_cantone),
        "isb": txt(r.isb_gi),
        "evu": txt(r.evu_ef_itf),
        "lon": lon, "lat": lat,
        "dwv": num(r.dwv_tmjo_tfm),      # Werktag
        "dtv": num(r.dtv_tjm_tgm),       # Tagesmittel
        "dnwv": num(r.dnwv_tmjno_tmgnl), # Nicht-Werktag
        "bemerkung": txt(r.bemerkungen),
        "verlauf": verlauf,
    }


def perrons(d, uic):
    df = d.perron[d.perron.uic == uic]
    items = []
    for _, r in df.iterrows():
        items.append({
            "nr": txt(r.p_nr),
            "typ": txt(r.perrontyp),
            "laenge_m": num(r.p_lange),
            "flaeche_netto_m2": num(r.perronflach_netto_m2),
            "niveaufreier_zugang": txt(r.z_schienenfrei),
            "linie": num(r.linie),
        })
    if not items:
        return None
    laengen = [i["laenge_m"] for i in items if i["laenge_m"]]
    niveaufrei = sum(1 for i in items if str(i["niveaufreier_zugang"]).lower() == "ja")
    return {
        "source": "perron",
        "hinweis": "Nur Perrons, zu denen offene Daten vorliegen.",
        "anzahl_mit_daten": len(items),
        "niveaufrei_erreichbar": niveaufrei,
        "laengste_m": max(laengen) if laengen else None,
        "kuerzeste_m": min(laengen) if laengen else None,
        "items": sorted(items, key=lambda i: (i["laenge_m"] or 0), reverse=True),
    }


def gleisnr(v):
    """'3', 3.0 und '3.0' sind dasselbe Gleis."""
    s = txt(v)
    if not s:
        return None
    try:
        f = float(s)
        return str(int(f)) if f.is_integer() else str(f)
    except ValueError:
        return s


def perronhoehe(konformitaet):
    """'P 55 / - / ...' -> (55, False); 'P 35 HT / ...' -> (35, True)."""
    m = re.match(r"\s*(<=)?\s*P\s*(\d+)\s*(HT)?", str(konformitaet))
    if not m:
        return None, False
    return int(m.group(2)), bool(m.group(3))


def stammdaten(d, uic):
    df = d.dienststelle[d.dienststelle.uic == uic]
    if df.empty:
        return None
    r = df.iloc[0]
    verkehrsmittel = [v for v in str(r.meansoftransport).split("|") if v and v != "nan"]
    return {
        "source": "haltestelle-haltekante",
        "bezeichnung_offiziell": txt(r.designationofficial),
        "abkuerzung": txt(r.abbreviation),
        "hoehe_m_ue_m": num(r.height),
        "gemeinde": txt(r.municipalityname),
        "ortschaft": txt(r.localityname),
        "bezirk": txt(r.districtname),
        "kanton": txt(r.cantonname),
        "verkehrsmittel": verkehrsmittel,
        "betreiber": txt(r.businessorganisationdescriptionde),
    }


def gleise(d, uic):
    """Kundengleise aus den BehiG-Segmenten, ergaenzt um die Sektortafeln."""
    seg = d.behig[d.behig.uic == uic]
    sek = d.sektor[d.sektor.uic == uic]
    if seg.empty and sek.empty:
        return None
    pro_gleis = {}
    for _, r in seg.iterrows():
        g = gleisnr(r.kundengleisnr)
        if not g:
            continue
        e = pro_gleis.setdefault(g, {"nr": g, "perronhoehen_cm": set(), "hilfstritt": False,
                                     "perrontyp": None, "perronkante_m": None, "sektoren": []})
        h, ht = perronhoehe(r.konformitaet)
        if h:
            e["perronhoehen_cm"].add(h)
        e["hilfstritt"] = e["hilfstritt"] or ht
        e["perrontyp"] = e["perrontyp"] or txt(r.perrontyp)
        laenge = num(r.perronkante_laenge)
        if laenge:
            e["perronkante_m"] = max(e["perronkante_m"] or 0, round(float(laenge)))
    for _, r in sek.iterrows():
        g = gleisnr(r.kundengleisnummer)
        s = txt(r.sektor_vorderseite) or txt(r.sektor_ruckseiter)
        if not g:
            continue
        e = pro_gleis.setdefault(g, {"nr": g, "perronhoehen_cm": set(), "hilfstritt": False,
                                     "perrontyp": None, "perronkante_m": None, "sektoren": []})
        if s in ("-", "?"):   # Platzhalter in der Quelle, kein Sektor
            s = None
        if s and s not in e["sektoren"]:
            e["sektoren"].append(s)
    if not pro_gleis:
        return None
    items = []
    def sortkey(g):
        try:
            return (0, float(g), "")
        except ValueError:
            return (1, 0.0, g)

    for g in sorted(pro_gleis, key=sortkey):
        e = pro_gleis[g]
        e["perronhoehen_cm"] = sorted(e["perronhoehen_cm"])
        e["sektoren"] = sorted(e["sektoren"])
        items.append(e)
    alle_hoehen = sorted({h for e in items for h in e["perronhoehen_cm"]})
    return {
        "source": "21197_behig-haltekantesegment, sektortafel",
        "hinweis": "Nur Gleise, zu denen offene Daten vorliegen. Unterirdische und "
                   "fremdbetriebene Gleise fehlen teilweise. Nicht als Gesamtzahl der "
                   "Gleise des Bahnhofs verwenden.",
        "anzahl_mit_daten": len(items),
        "nummern": [e["nr"] for e in items],
        "perronhoehen_cm": alle_hoehen,
        "items": items,
    }


def hindernisfreiheit(d, uic, gl, pr):
    out = {"source": "21197_behig-haltekantesegment, "
                     "haltestelle-visuell-taktile-sicherheitslinie, perron"}
    if pr:
        frei = pr["niveaufrei_erreichbar"]
        gesamt = pr["anzahl_mit_daten"]
        out["perrons_niveaufrei"] = frei
        out["perrons_mit_daten"] = gesamt
        if frei < gesamt:
            out["gleisquerung_noetig"] = True
    seg = d.behig[d.behig.uic == uic]
    if not seg.empty:
        out["segmente"] = int(len(seg))
        hoehen = {}
        hilfstritt = 0
        for _, r in seg.iterrows():
            h, ht = perronhoehe(r.konformitaet)
            if h:
                hoehen[h] = hoehen.get(h, 0) + 1
            hilfstritt += int(ht)
        out["segmente_pro_perronhoehe_cm"] = dict(sorted(hoehen.items()))
        out["segmente_mit_hilfstritt"] = hilfstritt
        out["datenstand_quelle"] = "2023"
    sl = d.sicherheitslinie[d.sicherheitslinie.uic == uic]
    if not sl.empty:
        out["sicherheitslinie"] = txt(sl.iloc[0].tsli_am_01_01_2018)
    if gl:
        # 55 cm gilt als Referenzhoehe fuer den stufenfreien Einstieg
        out["gleise_mit_55cm"] = sum(1 for e in gl["items"] if 55 in e["perronhoehen_cm"])
        out["gleise_mit_daten"] = gl["anzahl_mit_daten"]
    return out if len(out) > 1 else None


def zuege(d, uic):
    zz = d.zugzahlen
    df = zz[(zz.von_bpuic == uic) | (zz.bis_bpuic == uic)]
    if df.empty:
        return None
    # Je Abschnitt und Verkehrsart liegen zwei Zeilen vor, eine pro Richtung.
    gruppen = df.groupby(
        [df.strecke_nummer, df.bp_von_abschnitt_bezeichnung.astype(str),
         df.bp_bis_abschnitt_bezeichnung.astype(str), df.geschaeftscode.astype(str)],
        dropna=False)
    abschnitte = []
    for (strecke, von, bis, art), g in gruppen:
        jahr_summe = num(g.anzahl_zuege.sum())
        if not jahr_summe:
            continue
        abschnitte.append({
            "von": von, "bis": bis,
            "strecke_nr": num(strecke),
            "strecke": txt(g.iloc[0].strecke_bezeichnung),
            "art": art,
            "richtungen": int(len(g)),
            "zuege_pro_jahr": jahr_summe,
            "zuege_pro_tag": round(jahr_summe / 365),
        })
    if not abschnitte:
        return None
    abschnitte.sort(key=lambda a: a["zuege_pro_jahr"], reverse=True)
    personen = [a for a in abschnitte if a["art"] == "Personenverkehr"]
    return {
        "source": "zugzahlen",
        "jahr": int(df.jahr.iloc[0]),
        "hinweis": "Zuege pro Jahr auf einem Streckenabschnitt, beide Richtungen zusammen. "
                   "Nicht die Zahl der Zuege, die am Bahnhof halten.",
        "staerkster_abschnitt": abschnitte[0],
        "staerkster_personenverkehr": personen[0] if personen else None,
        "abschnitte": abschnitte,
    }


def linien(d, uic):
    df = d.betriebspunkte[d.betriebspunkte.uic == uic]
    if df.empty:
        return None
    items = []
    for _, r in df.drop_duplicates("linie").iterrows():
        items.append({"nummer": num(r.linie), "name": txt(r.linienname), "km": num(r.km)})
    return {"source": "linie-mit-betriebspunkten", "anzahl": len(items), "items": items}


def services(d, uic):
    bps = d.uic2bps.get(uic)
    out = {"source": "wifistation, billetautomat, billetentwerter, haltestelle-uhr, "
                     "haltestelle-wartehallen, abfahrtsplakate0",
           "hinweis": "Zahlen geben an, was in den offenen Daten erfasst ist. "
                      "Eine 0 bedeutet nicht, dass es das vor Ort nicht gibt."}
    out["wlan_erfasst"] = bool((d.wifi.uic == uic).any())
    if bps:
        aut = d.automat[d.automat.bps.astype(str) == bps]
        out["billettautomaten_erfasst"] = int(len(aut))
        if not aut.empty:
            out["automat_typen"] = sorted({t for t in aut.typ_text.dropna().astype(str)})
        out["billettentwerter_erfasst"] = int(len(d.entwerter[d.entwerter.bps.astype(str) == bps]))
    wh = d.wartehalle[d.wartehalle.uic == uic]
    out["wartehallen_erfasst"] = int(len(wh))
    pl = d.plakat[d.plakat.uic == uic]
    if not pl.empty:
        out["abfahrtsplakat_pdf"] = txt(pl.iloc[0].file)
    return out


def luecken(d, uic, f):
    """Was zu diesem Bahnhof fehlt - ausdruecklich benannt statt weggelassen.

    Der Nutzer der App soll den Unterschied sehen zwischen
    "gibt es nicht" und "steht nicht in den offenen Daten".
    """
    fehlt = []

    def lueckt(thema, grund, quelle):
        fehlt.append({"thema": thema, "grund": grund, "quelle": quelle})

    if not f.get("bahnhofplan"):
        lueckt("Bahnhofplan",
               "Für diesen Bahnhof ist kein Bahnhofplan veröffentlicht. "
               "Pläne liegen für 60 der 769 SBB-Bahnhöfe vor.",
               "haltestelle-karte-trafimage")
    if not f.get("tagesrhythmus"):
        lueckt("Tagesrhythmus",
               "Wie sich die Besucherzahl über den Tag verteilt, ist nur für "
               "26 grosse Bahnhöfe erhoben.",
               "anzahl-sbb-bahnhofbenutzer-tagesverlauf")
    if not f.get("bahnhofbenutzer"):
        lueckt("Bahnhofbenutzer",
               "Die Zahl aller Bahnhofbenutzer, auch ohne Zugfahrt, ist nur für "
               "28 Bahnhöfe erhoben. Erfasst sind hier nur Ein- und Aussteigende.",
               "anzahl-sbb-bahnhofbenutzer")
    gl = f.get("gleise")
    if not gl:
        lueckt("Gleise",
               "Zu den Gleisen dieses Bahnhofs liegen keine offenen Daten vor.",
               "21197_behig-haltekantesegment")
    else:
        lueckt("Vollständigkeit der Gleise",
               f"Erfasst sind {gl['anzahl_mit_daten']} Gleise "
               f"({', '.join(gl['nummern'])}). Ob der Bahnhof weitere Gleise hat, "
               "etwa unterirdische oder solche anderer Bahnen, sagen die offenen Daten nicht.",
               "21197_behig-haltekantesegment")
        ohne = [e["nr"] for e in gl["items"] if not e["sektoren"]]
        if ohne:
            lueckt("Sektoren",
                   f"Zu {'Gleis' if len(ohne) == 1 else 'den Gleisen'} "
                   f"{', '.join(ohne)} sind keine Sektortafeln erfasst.",
                   "sektortafel")
    hf = f.get("hindernisfreiheit") or {}
    if hf.get("gleisquerung_noetig"):
        frei, gesamt = hf.get("perrons_niveaufrei", 0), hf.get("perrons_mit_daten", 0)
        lueckt("Zugang zum Perron",
               f"Von {gesamt} erfassten Perrons {'ist' if frei == 1 else 'sind'} "
               f"{frei} niveaufrei erreichbar. Für die übrigen ist in den Daten kein "
               "niveaufreier Zugang vermerkt, es ist also mit einer Gleisquerung zu rechnen.",
               "perron")
    if hf and hf.get("gleise_mit_daten") and hf.get("gleise_mit_55cm") == 0:
        lueckt("Stufenfreier Einstieg",
               "An keinem erfassten Gleis liegt die Perronkante auf 55 Zentimetern, der "
               "Referenzhöhe für den stufenfreien Einstieg.",
               "21197_behig-haltekantesegment")

    sv = f.get("services") or {}
    if not sv.get("wlan_erfasst"):
        lueckt("WLAN",
               "Dieser Bahnhof steht nicht in der Liste der WLAN-Standorte. "
               "Die Liste umfasst 79 Standorte und ist keine vollständige Auskunft.",
               "wifistation")
    if sv.get("billettautomaten_erfasst") == 0:
        lueckt("Billettautomaten",
               "Es ist kein Billettautomat erfasst. Das schliesst nicht aus, "
               "dass vor Ort einer steht.",
               "billetautomat")
    h = f.get("hindernisfreiheit")
    if not h:
        lueckt("Hindernisfreiheit",
               "Zur Hindernisfreiheit liegen für diesen Bahnhof keine Daten vor.",
               "21197_behig-haltekantesegment")
    elif h.get("datenstand_quelle"):
        lueckt("Stand der BehiG-Daten",
               f"Die Angaben zu Perronhöhen und Hindernisfreiheit haben den Stand "
               f"{h['datenstand_quelle']}, die übrigen Daten sind neuer.",
               "21197_behig-haltekantesegment")
    bem = (f.get("steckbrief") or {}).get("bemerkung")
    if bem:
        lueckt("Abgrenzung der Frequenzzahl",
               f"Die Quelle vermerkt zur Zahl der Ein- und Aussteigenden: «{bem}» "
               "Die Zahl deckt also nicht zwingend dasselbe ab wie die Gleis- und Perrondaten.",
               "passagierfrequenz")
    if (f.get("services") or {}).get("wartehallen_erfasst") == 0:
        lueckt("Wartehallen",
               "Es ist keine Wartehalle erfasst. Das schliesst nicht aus, "
               "dass es vor Ort einen Warteraum gibt.",
               "haltestelle-wartehallen")
    lueckt("Fahrplan",
           "Welche Züge hier halten und wohin sie fahren, ist nicht Teil dieser Daten. "
           "Die Zugzahlen zählen Fahrten auf den Streckenabschnitten.",
           "zugzahlen")
    return fehlt


def bahnhofplan(d, uic):
    df = d.plan[d.plan.uic == uic]
    if df.empty:
        return None
    r = df.iloc[0]
    return {
        "source": "haltestelle-karte-trafimage",
        "a4_pdf": txt(r.url_format_a4),
        "plakat_pdf": txt(r.url_oev_plakat),
        "shopping_pdf": txt(r.url_shopping_im_bahnhof_plakat),
        "eigentuemer": txt(r.plan_owner),
    }


def tagesrhythmus(d, uic, name):
    tv = d.tagesverlauf[d.tagesverlauf.uic == uic]
    tv = tv.dropna(subset=["uhrzeit", "prozentsatz"])   # Quelle enthaelt Leerzeilen
    out = {}
    if not tv.empty:
        jahr = tv.jahr_annee_anno_year.max()
        tv = tv[tv.jahr_annee_anno_year == jahr].sort_values("uhrzeit")
        stunden = [{"stunde": num(r.uhrzeit), "prozent": round(float(r.prozentsatz), 2)}
                   for _, r in tv.iterrows()]
        spitze = max(stunden, key=lambda s: s["prozent"])
        out.update({"source": "anzahl-sbb-bahnhofbenutzer-tagesverlauf",
                    "jahr": num(jahr), "stunden": stunden,
                    "spitzenstunde": spitze["stunde"], "spitzenanteil": spitze["prozent"]})
    wt = d.wochentag[d.wochentag.bahnhof_gare_stazione_station.astype(str).str.strip() == (name or "")]
    if not wt.empty:
        jahr = wt.jahr_annee_anno_year.max()
        wt = wt[wt.jahr_annee_anno_year == jahr]
        tage = [{"tag": wochentag_name(r.wochentag), "code": txt(r.wochentag),
                 "prozent": round(float(r.prozentsatz), 2)} for _, r in wt.iterrows()]
        reihenfolge = {v: k for k, v in WOCHENTAGE.items()}
        out["wochentage"] = sorted(tage, key=lambda t: reihenfolge.get(t["tag"], 99))
        if out["wochentage"]:
            staerkster = max(out["wochentage"], key=lambda t: t["prozent"])
            out["staerkster_wochentag"] = staerkster["tag"]
            out["staerkster_wochentag_prozent"] = staerkster["prozent"]
        out.setdefault("source", "anzahl-sbb-bahnhofbenutzer-wochentag")
    return out or None


WOCHENTAGE = {1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag",
              5: "Freitag", 6: "Samstag", 7: "Sonntag"}


def wochentag_name(code):
    """'2_Di_Mar_Mar_Tu' -> 'Dienstag'. Die fuehrende Ziffer ist der Wochentag."""
    s = txt(code)
    if not s:
        return None
    kopf = s.split("_", 1)[0]
    return WOCHENTAGE.get(int(kopf)) if kopf.isdigit() else s


def bahnhofbenutzer(d, name):
    df = d.benutzer[d.benutzer.bahnhof_gare_stazione.astype(str).str.strip() == (name or "")]
    if df.empty:
        return None
    df = df.sort_values("jahr")
    r = df.iloc[-1]
    return {
        "source": "anzahl-sbb-bahnhofbenutzer",
        "jahr": num(r.jahr),
        "anzahl_pro_tag": num(r.anzahl_bahnhofbenutzer),
        "einheit": txt(r.unite),
        "verlauf": [{"jahr": num(x.jahr), "anzahl": num(x.anzahl_bahnhofbenutzer)}
                    for _, x in df.iterrows()],
    }


def bestimme_tier(sb, plan):
    if plan:
        return "L"
    if sb and sb.get("dwv") and sb["dwv"] >= TIER_M_DWV:
        return "M"
    return "S"


def build(d, uic):
    sb = steckbrief(d, uic)
    if not sb:
        return None
    name = sb["name"]
    plan = bahnhofplan(d, uic)
    gl = gleise(d, uic)
    pr = perrons(d, uic)
    f = {
        "uic": uic,
        "name": name,
        "kanton": sb["kanton"],
        "bps": d.uic2bps.get(uic),
        "tier": bestimme_tier(sb, plan),
        "datenstand": str(date.today()),
        "steckbrief": sb,
        "stammdaten": stammdaten(d, uic),
        "bahnhofbenutzer": bahnhofbenutzer(d, name),
        "tagesrhythmus": tagesrhythmus(d, uic, name),
        "perrons": pr,
        "gleise": gl,
        "hindernisfreiheit": hindernisfreiheit(d, uic, gl, pr),
        "zuege": zuege(d, uic),
        "linien": linien(d, uic),
        "services": services(d, uic),
        "bahnhofplan": plan,
    }
    f["luecken"] = luecken(d, uic, f)
    f["verfuegbare_kapitel"] = [k for k in
                                ["steckbrief", "stammdaten", "tagesrhythmus", "perrons", "gleise",
                                 "hindernisfreiheit", "zuege", "linien", "services", "bahnhofplan"]
                                if f.get(k)]
    return f


def main():
    args = sys.argv[1:]
    d = Data()
    uics = d.alle_sbb() if "--all" in args else [int(a) for a in args if a.isdigit()]
    if not uics:
        print("Aufruf: build_facts.py <uic> [<uic> ...] | --all")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    for uic in uics:
        f = build(d, uic)
        if not f:
            print(f"FEHL {uic}: nicht in passagierfrequenz")
            continue
        (OUT / f"{uic}.json").write_text(
            json.dumps(f, ensure_ascii=False, indent=2), encoding="utf-8")
        if len(uics) <= 10:
            print(f"ok   {uic}  {f['name']:<20} Stufe {f['tier']}  "
                  f"Kapitel: {', '.join(f['verfuegbare_kapitel'])}")
    if len(uics) > 10:
        print(f"{len(uics)} Bahnhoefe geschrieben nach {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
