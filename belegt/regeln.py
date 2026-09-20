"""Regelwerk: welche Formulierungen gegen die Belegpflicht verstossen.

Die Listen sind Vorgabewerte, keine Vorschrift. Ein Projekt kann sie
erweitern oder ersetzen - was in einem Bereich eine unzulaessige Deutung ist,
kann in einem anderen ein Fachbegriff sein.
"""
import re
from dataclasses import dataclass, field

from belegt.fakten import ZAHL, zahl

# Wendungen, die etwas behaupten, was aus Daten nicht folgt
VERMUTUNG = [
    "stammen aus", "stammt aus", "gilt als", "gelten als", "dürfte", "vermutlich",
    "bekannt für", "beliebt", "typisch", "erwarten", "erwartet", "offenbar",
    "wahrscheinlich", "traditionell", "historisch", "seit Jahren", "seit langem",
    "schon lange", "seit jeher", "in letzter Zeit", "zunehmend",
]

# Woerter, die Vollstaendigkeit behaupten, wo die Daten nur einen Ausschnitt zeigen
VERALLGEMEINERUNG = [
    r"alle[nrs]?", r"sämtliche[nrs]?", "insgesamt", r"einzige[nrs]?", r"gesamte[nrs]?",
    r"jede[nrs]?", "keine weiteren", "total",
]

# Superlative sind erlaubt, wenn sie sich auf die eigenen Daten beziehen
# ("das längste erfasste Perron"), nicht aber im Vergleich mit anderen.
VERGLEICH = r"\b(grösst|kleinst|wichtigst|bedeutendst|stärkst|schönst)\w*\s+(\w+bahnhof|Bahnhof|Station|Knoten)"


@dataclass
class Regelwerk:
    """Was in einem Text stehen darf und was nicht."""

    vermutung: list = field(default_factory=lambda: list(VERMUTUNG))
    verallgemeinerung: list = field(default_factory=lambda: list(VERALLGEMEINERUNG))
    vergleich: str = VERGLEICH
    #: Zahlen ab dieser Stellenzahl brauchen ein Tausenderzeichen
    tausender_ab_stellen: int = 5
    #: Zahlen, die auch ohne Beleg vorkommen duerfen (Normwerte des Fachgebiets)
    normwerte: set = field(default_factory=set)

    def __post_init__(self):
        self._vermutung = re.compile(
            r"\b(" + "|".join(self.vermutung) + r")\b", re.I) if self.vermutung else None
        self._verallgemeinerung = re.compile(
            r"\b(" + "|".join(self.verallgemeinerung) + r")\b", re.I) if self.verallgemeinerung else None
        self._vergleich = re.compile(self.vergleich, re.I) if self.vergleich else None

    def pruefe_text(self, text, wo, faktenbasis, bericht, zahlen_streng=True):
        """Prueft einen Text auf unbelegte Zahlen und unzulaessige Wendungen."""
        text = text or ""
        for roh in ZAHL.findall(text):
            n = zahl(roh)
            if n is None:
                continue
            if roh.isdigit() and len(roh) >= self.tausender_ab_stellen:
                lesbar = f"{int(roh):,}".replace(",", "'")
                bericht.warnt(wo, f"{roh} sollte als {lesbar} geschrieben werden")
            if not faktenbasis.belegt(n, self.normwerte):
                (bericht.fehlt if zahlen_streng else bericht.warnt)(
                    wo, f"Zahl {roh} steht nicht in den Fakten")

        if self._vermutung and (m := self._vermutung.search(text)):
            bericht.fehlt(wo, f"«{m.group(0)}» deutet oder vermutet. "
                              "Die Daten geben das nicht her")
        if self._vergleich and (m := self._vergleich.search(text)):
            bericht.fehlt(wo, f"«{m.group(0)}» vergleicht mit anderen, "
                              "ohne Vergleichswert in den Fakten")
        if self._verallgemeinerung and ZAHL.search(text):
            if m := self._verallgemeinerung.search(text):
                bericht.warnt(wo, f"«{m.group(0)}» zusammen mit einer Zahl "
                                  "behauptet Vollständigkeit")

    def pruefe_allgemein(self, text, wo, gegenstand, bericht):
        """Eine allgemeine Erlaeuterung darf den Gegenstand nicht nennen.

        Geprueft werden der volle Name und Namensteile ab vier Zeichen, mit
        Wortgrenzen: sonst traefe «S.» aus «S. Nazzaro» jedes Wort auf s.
        """
        teile = [gegenstand] + [w for w in re.split(r"[\s/()-]+", gegenstand) if len(w) >= 4]
        for w in teile:
            if re.search(rf"\b{re.escape(w)}\b", text or "", re.I):
                bericht.fehlt(wo, f"nennt «{w}». Erläuterungen sind allgemein zu halten")
                return
