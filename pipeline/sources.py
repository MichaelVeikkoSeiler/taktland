"""Registry der verwendeten Datenquellen von data.sbb.ch.

Stand: im Katalog verifiziert (siehe docs/datenquellen.md).
`key`      : interner Name, zugleich Dateiname in data/raw/
`join`     : Feld, ueber das der Bahnhof identifiziert wird
             bpuic  = 7-stellige DiDok-Nummer (Zielschluessel)
             uic    = wie bpuic, aber als Float geliefert
             bps    = Betriebspunkt-Kuerzel, braucht Uebersetzung
             name   = nur Bahnhofsname, braucht Uebersetzung
`tier`     : core = fuer jedes Profil noetig, extra = Zusatzkapitel
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
    "linie": dict(
        join=None, tier="extra", beschreibung="Streckennetz mit Anfang und Ende"),
    "bilder-von-bahnhofen": dict(
        join="nummer", tier="extra", beschreibung="Bilder von 20 Bahnhoefen"),
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

ATTRIBUTION = "Daten: SBB Open Data (data.sbb.ch), Lizenz mit Quellenangabe"
