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

# Wendungen, die eine Allaussage auf die Datenlage eingrenzen. Steht eine
# davon im selben Satz, ist «alle 5 erfassten Perrons» korrekt und keine
# Vollstaendigkeitsbehauptung ueber die Wirklichkeit.
EINGRENZUNG = [
    r"erfasst\w*", r"erhoben\w*", r"vermerkt\w*", r"eingetragen\w*",
    r"\bDaten\b", r"laut (den )?Quellen", r"nach den Quellen",
]

# Ausgeschriebene Verhaeltnisse. Eine Zahl wie 244 faellt dem Pruefer auf,
# weil sie nicht in den Fakten steht. «Die Hälfte» oder «zwei Drittel» sind
# genauso gerechnet, rutschen aber durch, weil keine Ziffer darin steht.
VERHAELTNIS = (
    r"\b(die |eine |gut die |knapp die |mehr als die |weniger als die |rund die )?"
    r"(Hälfte|Drittel|Viertel|Fünftel|Zehntel)\b"
    r"|\b(doppelt|dreifach|vierfach|zehnfach|halb) so\b"
    r"|\b(zwei|drei|vier|fünf|zehn)mal so\b"
)

# Superlative sind erlaubt, wenn sie sich auf die eigenen Daten beziehen
# ("das längste erfasste Perron"), nicht aber im Vergleich mit anderen.
VERGLEICH = (
    # Superlativ im Vergleich mit anderen Gegenständen
    r"\b(grösst|kleinst|wichtigst|bedeutendst|stärkst|schönst)\w*\s+(\w+bahnhof|Bahnhof|Station|Knoten)"
    # oder ein ausdrücklicher Vergleich mit "anderen"
    r"|\b(mehr|weniger|häufiger|seltener|öfter|besser|schlechter|länger|kürzer|höher|tiefer)"
    r"\s+als\s+(bei\s+)?(anderen?|die\s+meisten|den\s+meisten|üblich|sonst)"
    r"|\bals\s+(bei\s+)?(anderen?|den\s+meisten)\b"
    # Superlativ mit einem Bezugsrahmen ausserhalb dieses Bahnhofs
    r"|\b(eine[rs]|einem|zu)\s+der\s+\w*(grösst|längst|meist\w*|stärkst|höchst|"
    r"kleinst|kürzest)\w*"
    r"|\b(im Bestand|schweizweit|in der (ganzen )?Schweiz|landesweit|"
    r"aller (SBB-)?Bahnhöfe|unter allen Bahnhöfen)\b"
)


#: Zeichen, aus denen eine Bezeichnung wie «1/11» oder «4/5» bestehen kann
BEZEICHNUNG = re.compile(r"[\w/.'’-]+")

#: Benennungen, in denen eine Ziffer Teil des Namens ist und nichts ueber den
#: Gegenstand aussagt. «A4-Blatt» ist ein Papierformat, keine Zahl aus den Daten.
NAMENSZIFFERN = re.compile(r"\bA[0-9]\b|\bDIN\s?A[0-9]\b|\bCOVID-19\b")


def _teil_einer_bezeichnung(text, treffer, faktenbasis):
    """Steht die gefundene Zahl in einer Bezeichnung, die so in den Fakten steht?"""
    texte = getattr(faktenbasis, "texte", None)
    if not texte:
        return False
    for m in BEZEICHNUNG.finditer(text):
        if m.start() <= treffer.start() and m.end() >= treffer.end():
            wort = m.group(0)
            return wort != treffer.group(0) and wort in texte
    return False


def _satz_um(text, pos):
    """Der Satz, in dem die Fundstelle liegt. Die Eingrenzung muss im selben
    Satz stehen, sonst rechtfertigt ein «erfasst» drei Saetze weiter alles."""
    anfang = max((text.rfind(z, 0, pos) for z in ".!?;"), default=-1) + 1
    ende = min((e for e in (text.find(z, pos) for z in ".!?;") if e != -1),
               default=len(text))
    return text[anfang:ende + 1]


@dataclass
class Regelwerk:
    """Was in einem Text stehen darf und was nicht."""

    vermutung: list = field(default_factory=lambda: list(VERMUTUNG))
    verallgemeinerung: list = field(default_factory=lambda: list(VERALLGEMEINERUNG))
    #: Wendungen, die eine Allaussage zulaessig auf die Datenlage eingrenzen
    eingrenzung: list = field(default_factory=lambda: list(EINGRENZUNG))
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
        self._eingrenzung = re.compile(
            "|".join(self.eingrenzung), re.I) if self.eingrenzung else None
        self._vergleich = re.compile(self.vergleich, re.I) if self.vergleich else None

    def pruefe_text(self, text, wo, faktenbasis, bericht, zahlen_streng=True):
        """Prueft einen Text auf unbelegte Zahlen und unzulaessige Wendungen."""
        text = text or ""
        for m in ZAHL.finditer(text):
            roh = m.group(0)
            n = zahl(roh)
            if n is None:
                continue
            # Zahlen, die Teil einer Bezeichnung aus den Fakten sind, zaehlen
            # als belegt: «Perron 1/11» ist eine Bezeichnung, keine Rechnung.
            if _teil_einer_bezeichnung(text, m, faktenbasis):
                continue
            if any(t.start() <= m.start() and t.end() >= m.end()
                   for t in NAMENSZIFFERN.finditer(text)):
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
        if m := re.search(VERHAELTNIS, text, re.I):
            bericht.fehlt(wo, f"«{m.group(0).strip()}» ist ein gerechnetes Verhältnis. "
                              "Es steht nicht in den Fakten. Nenne die beiden Werte, "
                              "den Vergleich zieht der Leser selbst")
        if self._vergleich and (m := self._vergleich.search(text)):
            bericht.fehlt(wo, f"«{m.group(0)}» vergleicht mit anderen, "
                              "ohne Vergleichswert in den Fakten")
        if self._verallgemeinerung:
            for m in self._verallgemeinerung.finditer(text):
                satz = _satz_um(text, m.start())
                if not ZAHL.search(satz):
                    continue
                if self._eingrenzung and self._eingrenzung.search(satz):
                    continue
                bericht.warnt(wo, f"«{m.group(0)}» zusammen mit einer Zahl "
                                  "behauptet Vollständigkeit, ohne die Aussage "
                                  "auf die Datenlage einzugrenzen")
                break

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
