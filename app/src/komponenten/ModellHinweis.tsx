/** Was im Modell nicht der Wirklichkeit entspricht (Michael, 2026-10-08: «Proportionen, Gleisdesign … grenzt diesen
 *  Teil mit der VR-Brille vom Rest von Taktland ab, wo sonst alles realitätsgetreu ist»); seit 2026-10-09 einmal auf der
 *  Seite Modellbahn statt unter jedem Modell, dort nur ein Satz mit Link hierher */
export function ModellHinweis() {
  return (
    <div className="mt-3 border-l-4 border-sbb-red bg-sbb-milk p-3 text-sm dark:bg-sbb-charcoal">
      <p className="font-bold">Modellbahn: ein Modell zum Anschauen, kein Abbild der Wirklichkeit</p>
      <p className="mt-1">Anders als im übrigen Taktland stimmt hier nicht alles mit der Wirklichkeit überein:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        <li>Der Zug ist nicht massstäblich und kein bestimmter Zugtyp.</li>
        <li>Die Strecke ist eine gezeichnete Linie, keine Gleise; Bahnhofsmasten und Schilder sind nicht massstäblich.</li>
        <li>Die Höhe der Gleise steht in keiner Quelle: Die Linie folgt dem Gelände, Tunnel und Brücken gerade zwischen ihren Enden.</li>
        <li>Gelände und Luftbild sind vereinfacht und gemittelt.</li>
        <li>Die Fahrt ist ein Zeitraffer, kein Fahrplan; das Zuggeräusch ist gerechnet.</li>
      </ul>
    </div>
  )
}
