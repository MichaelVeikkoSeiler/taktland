#!/bin/bash
# Die Strecken der scharfen Umgebung für daten.taktland.ch (Michael, 2026-10-12: «so viel Details wie möglich»), in vier
# Reihen, die der Workflow «Scharfe Umgebung» (.github/workflows/scharf.yml) gleichzeitig baut. Jede Reihe schreibt nach
# data/scharf_extern; Kacheln, die schon in der App liegen (data/scharf), entstehen nicht neu.
#   bash pipeline/scharf_reihen.sh 1
set -e
cd "$(dirname "$0")/.."
PY=${PY:-.venv/bin/python}
relief() { echo "== $* $(date +%H:%M)"; $PY pipeline/build_scharf.py --extern --relief "$@" 2>&1 | grep -v Warning | tail -2; }
lauf() { echo "== $* $(date +%H:%M)"; $PY pipeline/build_scharf.py --extern --weg "$@" 2>&1 | grep -v Warning | tail -2; }
case "$1" in
  1)  # die Strecken der Modellbahn
    for r in gotthard loetschberg albula bernina zermatt furka bruenig goldenpass engelberg arosa jurafuss; do relief $r; done ;;
  2)  # Hauptlinien
    lauf Genève Lausanne; lauf Lausanne "Fribourg/Freiburg" Bern; lauf Bern Olten; lauf Olten Aarau "Zürich HB"
    lauf "Basel SBB" Olten; lauf Olten Luzern; lauf "Zürich HB" Winterthur "St. Gallen"; lauf "Zürich HB" Zug "Arth-Goldau" Erstfeld
    lauf Biasca Bellinzona Lugano Chiasso; lauf "Zürich HB" Ziegelbrücke Sargans Chur; lauf Lausanne Montreux Sion Visp Brig
    ;;
  3)
    lauf Bern Thun Spiez Frutigen; lauf "Biel/Bienne" Solothurn Olten; lauf "Basel SBB" "Brugg AG" "Zürich HB"; lauf Winterthur Schaffhausen
    lauf Lausanne "Yverdon-les-Bains" "Biel/Bienne"; lauf Spiez "Interlaken Ost"; lauf "Zürich HB" "Rapperswil SG"; lauf Bellinzona Locarno
    lauf "Basel SBB" Delémont "Biel/Bienne"; lauf Winterthur Romanshorn; lauf Lausanne Vallorbe; lauf Neuchâtel "La Chaux-de-Fonds" "Le Locle"
    lauf "Biel/Bienne" "Sonceboz-Sombeval" "La Chaux-de-Fonds"; lauf "Fribourg/Freiburg" Payerne "Yverdon-les-Bains"
    lauf Bern Burgdorf Herzogenbuchsee Langenthal Olten; lauf Bern Konolfingen "Langnau i.E." Luzern
    ;;
  4)
    lauf "Zürich HB" "Zürich Flughafen" Winterthur; lauf "Zürich HB" "Affoltern am Albis" Zug; lauf Luzern Rotkreuz Zug
    lauf "St. Gallen" Rorschach "Buchs SG" Sargans; lauf Chur Thusis; lauf Landquart "Klosters Platz" "Davos Platz" Filisur
    lauf "Klosters Platz" Zernez "Scuol-Tarasp"; lauf Chur "Disentis/Mustér"; lauf "Zürich HB" Wädenswil "Pfäffikon SZ" Ziegelbrücke Glarus Linthal
    lauf Weinfelden Kreuzlingen; lauf Lenzburg "Wohlen AG" Rotkreuz; lauf "Biel/Bienne" Moutier Delémont Porrentruy; lauf Baden Aarau
    lauf Bern Belp Thun; lauf Luzern Hochdorf Lenzburg; lauf Schaffhausen "Stein am Rhein" Kreuzlingen Romanshorn Rorschach
    lauf Wädenswil Einsiedeln; lauf Luzern "Arth-Goldau"; lauf "Interlaken Ost" Brienz; lauf Burgdorf "Hasle-Rüegsau" Konolfingen Thun
    lauf Solothurn Burgdorf; lauf "Basel SBB" Rheinfelden Frick "Brugg AG"; lauf Olten Zofingen Wolhusen Luzern; lauf Langenthal Huttwil Wolhusen
    lauf "Zürich HB" Bülach Eglisau Koblenz; lauf "Zürich HB" Uster "Wetzikon ZH" "Rapperswil SG"; lauf "Wetzikon ZH" Hinwil
    lauf "Disentis/Mustér" Ilanz; lauf Samedan Pontresina; lauf "St. Moritz" Samedan Zernez; lauf "Le Pont" "Le Brassus"; lauf Aigle Monthey
    lauf "Sierre/Siders" Leuk
    ;;
  *) echo "Reihe 1 bis 4"; exit 1 ;;
esac
