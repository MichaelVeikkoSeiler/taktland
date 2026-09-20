"""Sammelt, was bei einer Pruefung auffaellt."""
from dataclasses import dataclass, field


@dataclass
class Bericht:
    """Fehler verhindern die Veroeffentlichung, Warnungen nicht."""

    name: str = ""
    fehler: list = field(default_factory=list)
    warnungen: list = field(default_factory=list)

    def fehlt(self, wo, was):
        self.fehler.append(f"{wo}: {was}")

    def warnt(self, wo, was):
        self.warnungen.append(f"{wo}: {was}")

    @property
    def ok(self):
        return not self.fehler

    def zusammenfassung(self):
        zeichen = "✓" if self.ok else "✗"
        return (f"{zeichen} {self.name}  {len(self.fehler)} Fehler, "
                f"{len(self.warnungen)} Warnungen")

    def zeilen(self):
        return ([f"    FEHLER   {f}" for f in self.fehler]
                + [f"    Warnung  {w}" for w in self.warnungen])
