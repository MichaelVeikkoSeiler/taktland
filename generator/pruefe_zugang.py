#!/usr/bin/env python3
"""Prüft, ob der API-Schlüssel funktioniert. Kostet praktisch nichts.

    python generator/pruefe_zugang.py
"""
import os
import sys


def main():
    schluessel = os.environ.get("ANTHROPIC_API_KEY")
    if not schluessel:
        print("Es ist kein Schlüssel gesetzt.\n\n"
              "    export ANTHROPIC_API_KEY=sk-ant-...\n\n"
              "Den Schlüssel gibt es auf console.anthropic.com unter API Keys.")
        return 1
    if not schluessel.startswith("sk-ant-"):
        print(f"Der Schlüssel beginnt mit «{schluessel[:7]}…», erwartet wäre «sk-ant-».\n"
              "Vermutlich ist etwas anderes in der Variable gelandet.")
        return 1

    print(f"Schlüssel gefunden: {schluessel[:12]}…{schluessel[-4:]}")
    try:
        import anthropic
    except ImportError:
        print("Das Paket anthropic fehlt:  .venv/bin/pip install anthropic")
        return 1

    client = anthropic.Anthropic(max_retries=0)
    try:
        # Opus 5 denkt vor dem Antworten. Bei zu knappem Limit gehen alle Token
        # dafür drauf und es kommt kein Text zurück.
        antwort = client.messages.create(
            model="claude-opus-5",
            max_tokens=200,
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": "Antworte nur mit dem Wort: bereit"}],
        )
        text = "".join(b.text for b in antwort.content if b.type == "text").strip()
        print(f"Antwort vom Modell: «{text}»" if text
              else "Das Modell hat geantwortet, aber ohne Text "
                   f"(stop_reason: {antwort.stop_reason})")
        print(f"Verbrauch: {antwort.usage.input_tokens} Eingabe-, "
              f"{antwort.usage.output_tokens} Ausgabe-Token "
              f"(unter einem Rappen)")
        print("\nDer Zugang funktioniert. Weiter mit:\n"
              "    python generator/erzeuge.py 8506308")
        return 0
    except anthropic.AuthenticationError:
        print("\nDer Schlüssel wird nicht angenommen (401).\n"
              "Prüfe, ob du ihn vollständig kopiert hast und ob er noch gültig ist.")
        return 1
    except anthropic.PermissionDeniedError as e:
        print(f"\nZugriff verweigert (403): {e.message[:200]}")
        return 1
    except anthropic.BadRequestError as e:
        meldung = str(e.message)
        if "credit" in meldung.lower() or "balance" in meldung.lower():
            print("\nDas Konto hat kein Guthaben.\n"
                  "Auf console.anthropic.com unter Billing aufladen, "
                  "5 Dollar genügen für den Anfang.")
        else:
            print(f"\nFehlerhafte Anfrage (400): {meldung[:300]}")
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"\n{type(e).__name__}: {str(e)[:250]}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
