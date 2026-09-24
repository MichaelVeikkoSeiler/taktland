const BASIS = import.meta.env.BASE_URL

/**
 * Ein Video der App zum Zeigen (Michael, 2026-09-25: «Demoversion als Video»,
 * «unter einem neuen Reiter Demo zwischen Logbuch und Info»). Aufgenommen im
 * Browser in Handygrösse; der Fahrtmodus läuft darin als Probefahrt.
 */
export function Demo() {
  return (
    <div className="px-4 pb-16">
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Demo</h1>
      <p className="mt-2 leading-relaxed">
        Taktland in gut anderthalb Minuten: ein Bahnhof mit Fragen, ein Duell und der
        Fahrtmodus. Der Fahrtmodus läuft im Video als Probefahrt von Lugano nach Bellinzona,
        20-mal schneller als im Zug. Das Video hat keinen Ton.
      </p>
      <video controls playsInline preload="metadata" poster={`${BASIS}demo/taktland-demo.webp`}
             className="mx-auto mt-5 block w-full max-w-sm rounded-lg border border-sbb-cloud
                        dark:border-sbb-iron">
        <source src={`${BASIS}demo/taktland-demo.mp4`} type="video/mp4" />
      </video>
      <p className="mt-3 text-sm text-sbb-metal dark:text-sbb-storm">
        Aufgenommen im September 2026 mit dem damaligen Stand der App. Die Texteinblendungen
        gehören zum Video, nicht zur App.
      </p>
    </div>
  )
}
