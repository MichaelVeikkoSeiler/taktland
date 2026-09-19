#!/usr/bin/env python3
"""Prueft, wie viele Bahnhoefe je Dataset abgedeckt sind und ob die Joins halten."""
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
MVP = {8503000: "Zürich HB", 8500218: "Olten", 8508001: "Schönbühl SBB"}


def load(name, **kw):
    return pd.read_csv(RAW / f"{name}.csv", sep=";", low_memory=False, **kw)


def uics(series):
    """Serie beliebigen Typs in eine Menge ganzzahliger UIC-Codes verwandeln."""
    s = pd.to_numeric(series, errors="coerce").dropna().astype("int64")
    return set(s[(s > 1_000_000) & (s < 100_000_000)])


def main():
    print("=" * 72)
    print("1. REFERENZ: Welche Bahnhoefe gibt es ueberhaupt?")
    print("=" * 72)
    pf = load("passagierfrequenz")
    pf["uic"] = pd.to_numeric(pf["uic"], errors="coerce")
    pf = pf.dropna(subset=["uic"])
    pf["uic"] = pf["uic"].astype("int64")
    pf["jahr"] = pd.to_numeric(pf["jahr_annee_anno"], errors="coerce")
    print(f"passagierfrequenz: {len(pf)} Zeilen, Jahre {int(pf.jahr.min())}-{int(pf.jahr.max())}")
    print(pf.groupby("jahr").size().tail(6).to_string())
    letztes = int(pf.jahr.max())
    # pro Bahnhof das juengste verfuegbare Jahr
    neueste = pf.sort_values("jahr").groupby("uic").tail(1)
    print(f"\ndistinct Bahnhoefe gesamt: {pf.uic.nunique()}")
    print(f"davon mit Daten aus {letztes}: {pf[pf.jahr == letztes].uic.nunique()}")
    print("ISB-Verteilung im letzten Jahr:")
    print(pf[pf.jahr == letztes].isb_gi.value_counts().head(8).to_string())

    ref = set(neueste.uic)

    print("\n" + "=" * 72)
    print("2. ABDECKUNG pro Dataset (gemessen an den Frequenz-Bahnhoefen)")
    print("=" * 72)
    checks = [
        ("anzahl-sbb-bahnhofbenutzer-tagesverlauf", "bpuic"),
        ("perron", "bpuic"),
        ("perronoberflache", "bpuic"),
        ("sektortafel", "bpuic"),
        ("haltestelle-visuell-taktile-sicherheitslinie", "bpuic"),
        ("haltestelle-wartehallen", "bpuic"),
        ("wifistation", "bpuic"),
        ("abfahrtsplakate0", "bpuic"),
        ("haltestelle-karte-trafimage", "bpuic"),
        ("linie-mit-betriebspunkten", "bpuic"),
    ]
    print(f"{'dataset':<46}{'eigene':>8}{'∩ Freq':>8}{'Anteil':>8}")
    for name, col in checks:
        df = load(name)
        own = uics(df[col])
        hit = own & ref
        print(f"{name:<46}{len(own):>8}{len(hit):>8}{len(hit)/len(ref):>7.0%}")

    # Haltekante: eigener Schluessel + Verkehrsmittel-Filter
    hk = load("haltestelle-haltekante")
    train = hk[hk.meansoftransport.astype(str).str.contains("TRAIN", na=False)]
    own = uics(train["number"])
    print(f"{'haltestelle-haltekante (nur TRAIN)':<46}{len(own):>8}{len(own & ref):>8}{len(own & ref)/len(ref):>7.0%}")

    print("\n" + "=" * 72)
    print("3. BRUECKE bps-Kuerzel -> bpuic")
    print("=" * 72)
    br = load("linie-mit-betriebspunkten")[["abkurzung_bpk", "bpuic", "bezeichnung_offiziell"]]
    br = br.dropna()
    br["bpuic"] = pd.to_numeric(br.bpuic, errors="coerce").dropna().astype("int64")
    paare = br.drop_duplicates(subset=["abkurzung_bpk", "bpuic"])
    mehrdeutig = paare.groupby("abkurzung_bpk").size()
    print(f"Kuerzel gesamt: {paare.abkurzung_bpk.nunique()}, davon mehrdeutig: {(mehrdeutig > 1).sum()}")
    mapping = dict(zip(paare.abkurzung_bpk, paare.bpuic))
    for name, col in [("billetautomat", "bps"), ("billetentwerter", "bps"),
                      ("21197_behig-haltekantesegment", "bps")]:
        df = load(name)
        kuerzel = set(df[col].dropna().astype(str))
        treffer = {k for k in kuerzel if k in mapping}
        gefunden = {mapping[k] for k in treffer} & ref
        print(f"{name:<46}{len(kuerzel):>5} Kuerzel, {len(treffer):>5} aufloesbar -> {len(gefunden)} Bahnhoefe")

    print("\n" + "=" * 72)
    print("4. MVP-BAHNHOEFE: stimmen die UIC-Codes?")
    print("=" * 72)
    for uic, name in MVP.items():
        treffer = pf[pf.uic == uic]
        if treffer.empty:
            print(f"  {uic}  {name:<16} NICHT in passagierfrequenz")
            aehnlich = pf[pf.bahnhof_gare_stazione.astype(str).str.contains(name.split()[0], case=False, na=False)]
            for _, r in aehnlich.drop_duplicates("uic").head(5).iterrows():
                print(f"       Kandidat: {int(r.uic)}  {r.bahnhof_gare_stazione}")
        else:
            j = treffer.sort_values("jahr").iloc[-1]
            print(f"  {uic}  {name:<16} OK -> '{j.bahnhof_gare_stazione}' ({j.kt_ct_cantone}), "
                  f"Jahr {int(j.jahr)}, DWV {j.dwv_tmjo_tfm}")


if __name__ == "__main__":
    main()
