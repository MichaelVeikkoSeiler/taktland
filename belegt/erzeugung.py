"""Die Schleife: Auftrag stellen, Antwort prüfen, bei Fehlern nachbessern.

Der Erzeuger kennt den Gegenstand nicht. Er bekommt einen Auftrag, eine
Prüffunktion und gibt zurück, was die Prüfung bestanden hat - oder sagt,
woran es lag.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field


@dataclass
class Auftrag:
    """Ein zu erzeugendes Dokument."""
    kennung: str
    system: str
    anfrage: str
    #: beliebige Mitgabe, die der Aufrufer beim Ergebnis wiedersieht
    mitgabe: dict = field(default_factory=dict)


@dataclass
class Ergebnis:
    kennung: str
    dokument: dict | None
    bericht: object | None
    runden: int = 1
    kosten: dict = field(default_factory=dict)
    fehlermeldung: str | None = None

    @property
    def ok(self):
        return self.dokument is not None and (self.bericht is None or self.bericht.ok)


def json_aus_text(text):
    """Das JSON aus einer Antwort herausholen, auch wenn Prosa drumherum steht."""
    if block := re.search(r"```(?:json)?\s*\n(.*?)```", text, re.S):
        text = block.group(1)
    text = text.strip()
    if not text.startswith("{"):
        anfang = text.find("{")
        ende = text.rfind("}")
        if anfang < 0 or ende < 0:
            raise ValueError("keine JSON-Struktur in der Antwort gefunden")
        text = text[anfang:ende + 1]
    return json.loads(text)


class Erzeuger:
    """Erzeugt Dokumente über die Claude-API und prüft sie.

    `pruefen(dokument, mitgabe)` gibt einen Bericht zurück, der `ok`,
    `fehler` und `warnungen` kennt - etwa `belegt.Bericht`.
    """

    def __init__(self, client=None, modell="claude-opus-5", max_tokens=32000,
                 effort="high", runden=3):
        if client is None:
            import anthropic
            client = anthropic.Anthropic()
        self.client = client
        self.modell = modell
        self.max_tokens = max_tokens
        self.effort = effort
        self.runden = runden

    # ---------- einzeln ----------

    def _anfragen(self, system, verlauf):
        """Ein Aufruf, als Stream, damit auch lange Antworten durchkommen."""
        with self.client.messages.stream(
            model=self.modell,
            max_tokens=self.max_tokens,
            system=system,
            output_config={"effort": self.effort},
            messages=verlauf,
        ) as strom:
            antwort = strom.get_final_message()
        text = "".join(b.text for b in antwort.content if b.type == "text")
        kosten = {"eingabe": antwort.usage.input_tokens,
                  "ausgabe": antwort.usage.output_tokens}
        return text, kosten

    def erzeuge(self, auftrag, pruefen):
        """Erzeugt ein Dokument und lässt bei Fehlern nachbessern."""
        verlauf = [{"role": "user", "content": auftrag.anfrage}]
        kosten = {"eingabe": 0, "ausgabe": 0}
        letzter_bericht = None

        for runde in range(1, self.runden + 1):
            try:
                text, k = self._anfragen(auftrag.system, verlauf)
            except Exception as e:  # noqa: BLE001 - ein Ausfall soll den Lauf nicht beenden
                return Ergebnis(auftrag.kennung, None, None, runde, kosten, str(e))
            kosten = {s: kosten[s] + k[s] for s in kosten}

            try:
                dokument = json_aus_text(text)
            except (ValueError, json.JSONDecodeError) as e:
                verlauf += [{"role": "assistant", "content": text},
                            {"role": "user", "content":
                             f"Die Antwort liess sich nicht als JSON lesen: {e}. "
                             "Gib ausschliesslich das JSON-Dokument zurück, ohne Text davor "
                             "oder danach."}]
                continue

            bericht = pruefen(dokument, auftrag.mitgabe)
            letzter_bericht = bericht
            if bericht.ok:
                return Ergebnis(auftrag.kennung, dokument, bericht, runde, kosten)

            if runde < self.runden:
                verlauf += [
                    {"role": "assistant", "content": json.dumps(dokument, ensure_ascii=False)},
                    {"role": "user", "content":
                     "Die Prüfung hat folgende Fehler gefunden. Gib das vollständige "
                     "Dokument berichtigt zurück, wieder als reines JSON:\n\n"
                     + "\n".join(f"- {f}" for f in bericht.fehler)},
                ]
        return Ergebnis(auftrag.kennung, dokument, letzter_bericht, self.runden, kosten)

    # ---------- als Stapel, zum halben Preis ----------

    def stapel_starten(self, auftraege):
        """Schickt alle Aufträge als Batch los und gibt dessen Kennung zurück."""
        from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
        from anthropic.types.messages.batch_create_params import Request

        anfragen = [
            Request(custom_id=a.kennung,
                    params=MessageCreateParamsNonStreaming(
                        model=self.modell,
                        max_tokens=self.max_tokens,
                        system=a.system,
                        output_config={"effort": self.effort},
                        messages=[{"role": "user", "content": a.anfrage}],
                    ))
            for a in auftraege
        ]
        return self.client.messages.batches.create(requests=anfragen).id

    def stapel_abwarten(self, stapel_id, takt=60, melden=print):
        """Wartet, bis der Stapel fertig ist."""
        while True:
            stand = self.client.messages.batches.retrieve(stapel_id)
            if stand.processing_status == "ended":
                return stand
            z = stand.request_counts
            melden(f"  Stapel {stapel_id}: {stand.processing_status} "
                   f"(fertig {z.succeeded}, offen {z.processing})")
            time.sleep(takt)

    def stapel_ergebnisse(self, stapel_id, pruefen, mitgaben=None):
        """Holt die Antworten ab und prüft sie. Reihenfolge ist beliebig."""
        mitgaben = mitgaben or {}
        raus = {}
        for zeile in self.client.messages.batches.results(stapel_id):
            kennung = zeile.custom_id
            if zeile.result.type != "succeeded":
                raus[kennung] = Ergebnis(kennung, None, None, 1, {},
                                         f"Anfrage {zeile.result.type}")
                continue
            nachricht = zeile.result.message
            text = "".join(b.text for b in nachricht.content if b.type == "text")
            kosten = {"eingabe": nachricht.usage.input_tokens,
                      "ausgabe": nachricht.usage.output_tokens}
            try:
                dokument = json_aus_text(text)
            except (ValueError, json.JSONDecodeError) as e:
                raus[kennung] = Ergebnis(kennung, None, None, 1, kosten, str(e))
                continue
            bericht = pruefen(dokument, mitgaben.get(kennung, {}))
            raus[kennung] = Ergebnis(kennung, dokument, bericht, 1, kosten)
        return raus
