"""Die Faktenbasis: was belegt ist, und wie man darauf zeigt."""
import json
import re
from pathlib import Path

# Zahlen mit Tausenderzeichen und Dezimaltrennung
ZAHL = re.compile(r"\d[\d'’’.,]*\d|\d")


def zahl(text):
    """'480'900' -> 480900.0, '12,5' -> 12.5, 'abc' -> None."""
    t = str(text).replace("'", "").replace("’", "").replace("’", "")
    if "," in t and "." not in t:
        t = t.replace(",", ".")
    else:
        t = t.replace(",", "")
    try:
        return float(t)
    except ValueError:
        return None


def einzelzahl(text):
    """'55 cm' -> 55.0. Nur wenn genau eine Zahl im Text steht."""
    treffer = ZAHL.findall(str(text))
    return zahl(treffer[0]) if len(treffer) == 1 else None


class Faktenbasis:
    """Die geprueften Fakten zu einem Gegenstand, plus Zugriff darauf.

    `daten` ist eine beliebig verschachtelte Struktur aus Listen und
    Zuordnungen. Ein Pfad wie `gleise.items[0].perronkante_m` zeigt auf
    einen Wert darin.
    """

    def __init__(self, daten, uebergehen=("source", "hinweis")):
        self.daten = daten
        self._uebergehen = set(uebergehen)
        self._zahlen = None

    @classmethod
    def aus_datei(cls, pfad, **kw):
        return cls(json.loads(Path(pfad).read_text(encoding="utf-8")), **kw)

    def aufloesen(self, pfad):
        """Wert unter dem Pfad, oder KeyError mit lesbarer Begruendung."""
        stelle = self.daten
        for teil in re.split(r"\.(?![^\[]*\])", pfad):
            m = re.match(r"^([^\[]+)((?:\[\d+\])*)$", teil)
            if not m:
                raise KeyError(f"Pfad nicht lesbar: {pfad}")
            name, indizes = m.group(1), m.group(2)
            if not isinstance(stelle, dict) or name not in stelle:
                raise KeyError(f"'{name}' fehlt in den Fakten ({pfad})")
            stelle = stelle[name]
            for i in re.findall(r"\[(\d+)\]", indizes):
                i = int(i)
                if not isinstance(stelle, list) or i >= len(stelle):
                    raise KeyError(f"Index [{i}] nicht vorhanden ({pfad})")
                stelle = stelle[i]
        return stelle

    def passt(self, wert, referenz):
        """Bezeichnet der Wert dasselbe wie die Referenz? Rundung erlaubt."""
        if isinstance(wert, list) and isinstance(referenz, list):
            # Frueher lief eine Liste in den Zweig darunter und wurde als
            # Ganzes gegen jedes einzelne Element geprueft. [20, 25, 35, 55]
            # passte dann nicht zu [20, 25, 35, 55], und ein richtiges Profil
            # wurde zurueckgewiesen.
            return (len(wert) == len(referenz)
                    and all(any(self.passt(w, r) for r in referenz) for w in wert))
        if isinstance(referenz, list):
            return any(self.passt(wert, r) for r in referenz)
        a, b = zahl(wert), zahl(referenz)
        if a is None:
            a = einzelzahl(wert)     # Antworten duerfen ihre Einheit tragen
        if b is None:
            b = einzelzahl(referenz)
        if a is not None and b is not None:
            if a == b:
                return True
            return any(round(b / stelle) * stelle == a for stelle in (1, 10, 100, 1000))
        return str(wert).strip().lower() == str(referenz).strip().lower()

    @property
    def zahlen(self):
        """Jede Zahl, die irgendwo in den Fakten steht."""
        if self._zahlen is None:
            self._zahlen = self._sammeln(self.daten, set())
        return self._zahlen

    def _sammeln(self, obj, raus):
        if isinstance(obj, bool):
            return raus
        if isinstance(obj, (int, float)):
            raus.add(float(obj))
        elif isinstance(obj, str):
            n = zahl(obj)
            if n is not None:
                raus.add(n)
        elif isinstance(obj, dict):
            for k, v in obj.items():
                if k in self._uebergehen:
                    continue
                self._sammeln(v, raus)
                n = zahl(k)          # Schluessel koennen selbst Werte sein
                if n is not None:
                    raus.add(n)
        elif isinstance(obj, list):
            for v in obj:
                self._sammeln(v, raus)
        return raus

    def belegt(self, n, zusaetzlich=()):
        """Ist die Zahl durch die Fakten gedeckt, auch gerundet?"""
        erlaubt = self.zahlen | set(zusaetzlich)
        if n in erlaubt:
            return True
        return any(round(w / stelle) * stelle == n
                   for w in erlaubt for stelle in (1, 10, 100, 1000))
