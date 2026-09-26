"""Registry der verwendeten Datenquellen von data.sbb.ch.

Stand: im Katalog verifiziert (siehe docs/datenquellen.md).
`key`      : interner Name, zugleich Dateiname in data/raw/
`join`     : Feld, ueber das der Bahnhof identifiziert wird
             bpuic  = 7-stellige DiDok-Nummer (Zielschluessel)
             uic    = wie bpuic, aber als Float geliefert
             bps    = Betriebspunkt-Kuerzel, braucht Uebersetzung
             name   = nur Bahnhofsname, braucht Uebersetzung
`tier`     : core = fuer jedes Profil noetig, extra = Zusatzkapitel,
             linien = nur fuer die Linienseiten
"""

DATASETS = {
    # --- Frequenz und Nutzung ---
    "passagierfrequenz": dict(
        join="uic", tier="core",
        beschreibung="Ein- und Aussteigende pro Tag (DTV/DWV/DNWV), mehrere Jahre"),
    "anzahl-sbb-bahnhofbenutzer": dict(
        join="name", tier="core",
        beschreibung="Bahnhofbenutzer pro Tag (inkl. Passanten), mehrere Jahre"),
    "anzahl-sbb-bahnhofbenutzer-tagesverlauf": dict(
        join="bpuic", tier="extra",
        beschreibung="Prozentualer Anteil der Benutzer pro Stunde"),
    "anzahl-sbb-bahnhofbenutzer-wochentag": dict(
        join="name", tier="extra",
        beschreibung="Prozentualer Anteil der Benutzer pro Wochentag"),
    "zugzahlen": dict(
        join="von_bpuic/bis_bpuic", tier="core",
        beschreibung="Zuege pro Streckenabschnitt und Jahr"),

    # --- Perron und Gleis ---
    "perron": dict(
        join="bpuic", tier="core",
        beschreibung="Perronlaenge, -typ, Flaeche, niveaufreier Zugang"),
    "perronoberflache": dict(
        join="bpuic", tier="extra",
        beschreibung="Perronoberflaeche und Baujahr"),
    "mobiliar-im-bahnhof": dict(
        join="bpuic", tier="extra",
        beschreibung="Mobiliar am Bahnhof: Sitzbaenke, Infopunkte und weiteres. "
                     "Nur teilweise erhoben - Lifte und Toiletten fehlen bei den "
                     "meisten Bahnhoefen und taugen darum nicht fuer Aussagen."),
    "sektortafel": dict(
        join="bpuic", tier="core",
        beschreibung="Sektortafeln pro Kundengleis"),
    "haltestelle-haltekante": dict(
        join="number", tier="core",
        beschreibung="Haltekanten aller Verkehrsmittel, mit Hoehe und Laenge"),

    # --- Hindernisfreiheit ---
    "21197_behig-haltekantesegment": dict(
        join="bps", tier="core",
        beschreibung="BehiG-Konformitaet pro Haltekantensegment"),
    "haltestelle-visuell-taktile-sicherheitslinie": dict(
        join="bpuic", tier="extra",
        beschreibung="Visuell-taktile Sicherheitslinie vorhanden"),

    # --- Services und Ausstattung ---
    "billetautomat": dict(
        join="bps", tier="extra", beschreibung="Billettautomaten pro Standort"),
    "billetentwerter": dict(
        join="bps", tier="extra", beschreibung="Billettentwerter pro Standort"),
    "haltestelle-uhr": dict(
        join="bps_name", tier="extra", beschreibung="Bahnhofsuhren"),
    "haltestelle-wartehallen": dict(
        join="bpuic", tier="extra", beschreibung="Wartehallen und Gebaeude"),
    "wifistation": dict(
        join="bpuic", tier="extra", beschreibung="WLAN am Bahnhof (79 Standorte)"),
    "abfahrtsplakate0": dict(
        join="bpuic", tier="extra", beschreibung="PDF der Abfahrtsplakate"),

    # --- Plaene, Linien, Bilder ---
    "haltestelle-karte-trafimage": dict(
        join="bpuic", tier="extra", beschreibung="Bahnhofplaene als PDF (63 Bahnhoefe)"),
    "linie-mit-betriebspunkten": dict(
        join="bpuic", tier="core",
        beschreibung="Betriebspunkte pro Linie; Bruecke Kuerzel <-> bpuic"),
    # tier «linien»: Die Bahnhofseiten lesen «linie» nicht. Als «extra» hätte ein
    # Neuladen den Datenstand aller Bahnhöfe verschoben (2026-09-22: dazu kam nur
    # das Anschlussgleis 135 St-Triphon Raffinerie)
    "linie": dict(
        join=None, tier="linien", beschreibung="Streckennetz mit Anfang und Ende"),
    "linienkilometrierung": dict(
        join=None, tier="linien",
        beschreibung="Kilometerpunkte der Linien mit Koordinaten, meist alle 100 m. "
                     "Legt jeden Abschnitt der Zugzahlen auf eine Linie (Strecke)"),
    "bilder-von-bahnhofen": dict(
        join="nummer", tier="extra", beschreibung="Bilder von 20 Bahnhoefen"),
    # --- nur fuer die Linienseiten (pipeline/build_linien.py) ---
    "tunnel": dict(
        join="linie", tier="linien",
        beschreibung="Tunnel mit Laenge, Jahr der ersten Inbetriebnahme, Roehren und Spuren"),
    "brucken": dict(
        join="linie", tier="linien",
        beschreibung="Bruecken mit Name, Kilometer, Kanton und Zahl der Baueinheiten. "
                     "Ohne Laenge und Baujahr."),
    "bahnubergang": dict(
        join="linie", tier="linien",
        beschreibung="Bahnuebergaenge mit Sicherungsart, Strassenart und Zahl der "
                     "gekreuzten Gleise. Einige Feldbeschreibungen der Quelle sind aus "
                     "anderen Datensaetzen kopiert (Treppe/Rampe, Prognose)."),
}

# Nicht verwendet, aber geprueft:
#   equipement                     -> existiert nicht; Ausstattung liegt in Einzeldatasets
#   21196_behig-haltekantepunkt    -> 496'783 Records, zu gross fuer den Nutzen
#   dienststellen-gemass-opentransportdataswiss -> 60'111 Records, alle TU der Schweiz

MVP_STATIONS = {
    "8503000": "Zürich HB",
    "8500218": "Olten",
    "8508001": "Schönbühl SBB",
}

# Bahnhoefe ausserhalb der SBB-Infrastruktur. Die Frequenzdaten decken 1178
# Bahnhoefe ab, die Infrastrukturdaten im Wesentlichen nur die der SBB.
# Aufgenommen wird ein Bahnhof einer anderen Bahn, wenn die Daten fuer mindestens
# so viele Kapitel reichen (build_facts.py): Steckbrief, Stammdaten und Services.
# Zuerst lag die Grenze bei 6; Michael, 2026-09-22: «Wenn du es sinnvoll findest
# kannst du auch andere Bahnhöfe von RhB oder SOB etc. einfügen». Mit 3 kommen
# RhB, MGB, MOB, MVR, ZB, SOB, TRAVYS, OeBB und TPF dazu (Zermatt, St. Moritz,
# Stans). Mit 2 Kapiteln bleiben drei weg, etwa Tirano ohne Stammdaten.
ANDERE_AB_KAPITEL = 3

# Von diesen Bahnen kommen alle Bahnhoefe dazu, auch mit weniger Kapiteln
# (Michael, 2026-09-22: «Du kannst auch weitere BLS-Bahnhöfe aufnehmen»). Die
# App kennzeichnet jeden Bahnhof, dessen Infrastruktur nicht die SBB betreibt.
ALLE_BAHNHOEFE_VON = {"BLS"}

# Diese fuenf kamen auf ausdruecklichen Wunsch, bevor es die Regel gab. Sie
# erfuellen sie auch; die Liste bleibt, damit sie nicht an der Regel haengen.
ZUSAETZLICH = {
    8507083: "Köniz",          # BLS
    8504484: "Müntschemier",   # BLS
    8504483: "Ins",            # BLS
    8507483: "Spiez",          # BLS
    8507100: "Thun",           # in passagierfrequenz bis 2024 SBB, ab 2025 BLS
}

# Haltestellen ohne Frequenzdaten: Die Passagierfrequenz der SBB führt sie nicht
# (bei Biel/Bienne und Ins steht «Ohne ASM»). Aufgenommen auf Wunsch (Michael,
# 2026-09-26: «BTI Bahn Biel bis Ins aufnehmen») mit dem, was es gibt: Stammdaten
# aus dem Haltestellenverzeichnis (haltestelle-haltekante) und die Infrastruktur-
# betreiberin laut Schienennetz des BAV. Die Seite hat keine Lernfragen, und
# die Fahrgastzahl steht als Lücke da. Die Liste: alle Betriebspunkte der Linie
# 261 «Biel - Täuffelen - Ins» im Schienennetz, die das Haltestellenverzeichnis
# als Zughalt (TRAIN) führt; Finsterhennen ist dort kein Halt.
HALTESTELLEN_OHNE_FREQUENZ = {
    8504461: "Nidau",
    8504469: "Nidau Beunden",
    8504471: "Ipsach",
    8504470: "Ipsach Herdi",
    8504472: "Sutz",
    8504462: "Lattrigen",
    8504474: "Mörigen",
    8504475: "Gerolfingen",
    8504463: "Täuffelen",
    8504464: "Hagneck",
    8504465: "Lüscherz",
    8504466: "Siselen-Finsterhennen",
    8504467: "Brüttelen",
    8504468: "Ins Dorf",
}

ATTRIBUTION = "Daten: SBB Open Data (data.sbb.ch), Lizenz mit Quellenangabe"
