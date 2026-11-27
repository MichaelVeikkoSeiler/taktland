/**
 * Die Anleitung und die Quellen unter dem Modell von «3D Schweiz» auf Englisch, nur für 3dland.ch (src/sprache.ts; Michael, 2026-11-27).
 * Inhaltlich genau wie die deutschen Texte in Schweiz3D.tsx: wer dort etwas ändert, ändert es hier mit.
 */
import { Abschnitt } from './Anleitung'

/** «Modell, nicht massstäblich: Quellen» */
export function QuellenEn({ anker, seenHier, stufe, umweltHier, umweltGanzDa }: {
  anker: { quellen: string[] }; seenHier: string[]; stufe: string; umweltHier: boolean; umweltGanzDa: boolean
}) {
  return (
    <details className="klapp mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
      <summary className="flex min-h-9 cursor-pointer items-center underline underline-offset-2">Model, not to scale: sources</summary>
      <p className="mt-1">Terrain: {anker.quellen[0]}. Aerial imagery: {anker.quellen[1]}. {seenHier.length
        ? `Lake bed: swissBATHY3D (swisstopo), averaged to 25 m, here ${seenHier.join(', ')}, only in the cross-section of the walls; the surface is the terrain with the aerial image. `
        : 'Lake bed: none measured in this area (swissBATHY3D covers 22 lakes); lakes here only show their surface. '}{stufe !== 'schweiz'
        ? 'Loose rock in the walls down to the bedrock: swissBEDROCK (swisstopo), bedrock surface averaged to 50 m. ' : ''}Places of the 1:1 million national map (swisstopo), a square named after the largest by the population of its municipality (swissBOUNDARIES3D, swisstopo),
        peaks (swisstopo), lakes from swissTLMRegio (swisstopo), cantons and, for the whole of Switzerland, the outline of the country (FSO). Settlements on the masts: swissTLMRegio (swisstopo),
        the larger ones first according to the feature type of the source, spaced apart; selection and mast chosen. A square is a square, not a region or a valley:
        their boundaries are not in any of our sources. Hiking trails: swissTLM3D (swisstopo), all paths recorded there as hiking trail,
        mountain hiking trail or alpine hiking trail, without the sections in tunnels, laid onto the terrain of the model; the colours
        follow the signposts. Wind: the latest measurement of the nearest MeteoSwiss station with wind measurement (SwissMetNet) and its
        local forecast (hourly, up to 8 days); always four windsocks in the middle of the quarters of the view, redistributed after every
        movement, each with the wind of the station nearest to it (not at the station), above it mean wind and gusts in km/h, on the mast the temperature; with «Sun» at the chosen time: earlier as measured (today every 10 minutes, earlier days since 1 January hourly), later the forecast; drawn and much larger than in reality, fully stretched from 28 km/h. Sun and shadows: the position of the sun above the middle of the model, calculated with the approximations
        of the Astronomical Almanac to about a tenth of a degree, without the refraction of the air at the horizon; only the terrain in the
        model casts shadows, mountains outside it do not, clouds and haze are missing. Stars: all down to magnitude 6 from the Hipparcos catalogue of ESA,
        prepared by d3-celestial (Olaf Frohn, BSD licence), their position in the sky calculated, without the movement of the Earth's axis since 2000
        (about a third of a degree), without planets; the Moon with its phase calculated from a short approximation of its orbit (to about one degree,
        without parallax), drawn larger than in the sky, its markings invented; colour from the colour index, size and brightness of the dots and the colours
        of the sky at dusk chosen. The contour lines lie at 1,000, 2,000, 3,000 and 4,000 m above sea level, where the
        terrain reaches that high; their colours are chosen.{umweltHier && <> Buildings: swissBUILDINGS3D 3.0 (swisstopo), roofs in the
        colour of the aerial image, walls grey (in no source); windows and their light at night drawn; storeys of 3 m, a window
        every 3.2 m and the share lit at each hour (in the evening a good third, at 3 a.m. few) are assumptions. Trees: swissTLM3D (swisstopo), single trees as in the source, forest
        filled with drawn trees; spacing, height and shape in no source; broadleaf or conifer from the LFI forest mixture rate (FOEN), where it is missing, up to 800 m above sea level
        40 % conifers in forest, from 1,500 m only conifers, rising in between, an assumption based on the altitude zones, not measured; with very many trees the drawn forest becomes thinner. {umweltGanzDa ? 'For the whole of Switzerland (daten.taktland.ch).' : 'For now only around Köniz and the Gantrisch.'}</>}</p>
    </details>
  )
}

/** die Anleitung unter dem Modell */
export function AnleitungEn({ eigeneSeite }: { eigeneSeite: boolean }) {
  return (<>
    <h2 className="mt-6 text-xl font-bold">Guide</h2>
    <div className="mt-2 space-y-2 text-sm leading-relaxed">
      <Abschnitt titel="Choose and dive in">
        <p>All of Switzerland as a model. Tap a square or search for a place, an address, a peak or a lake. «Dive in» takes you into an area of 128 km, then of 64 km, there into a region of 16 km, then into a square of 4 km and finally into a piece of 1 km.
          A double tap on a square dives in right there; with a mouse, a second click in the selected box does the same. A tap next to the model cancels the selection. The buttons below the model (the outline for all of Switzerland, then 128 km to 1 km side length) take you back to a level you have already chosen.</p>
      </Abschnitt>
      <Abschnitt titel="Rotate and zoom">
        <p>Dragging rotates, two fingers or the mouse wheel zoom; on a computer, in the 1 km square a double click flies closer to the spot, a double click into the sky flies back. The speaker at the bottom right switches the sound off and on again. The heights are real, without exaggeration. The button at the top right shows the
          model in full screen.</p>
      </Abschnitt>
      <Abschnitt titel="At eye level">
        <p>In the 4 km and 1 km squares, the button with the little figure puts you on the terrain, 1.7 m above the ground, where you are currently
          looking. Dragging turns your view, a tap on the terrain moves you there; on a computer, the arrow keys or W, A, S, D walk (faster with the
          Shift key). In the headset there is no button: in the 1 km square the ray shows a little figure on the terrain (not on water,
          buttons, trains or boats), a trigger puts you there, in the model at full size. There an arc shows where you will jump, a
          trigger jumps; the thumbstick walks and turns; aiming at the sky, a trigger takes you back to the table. Eye height and walking speed
          are chosen; up close the terrain is as coarse as its data (in the 1 km square at 5 m, the aerial image at 50 cm).</p>
      </Abschnitt>
      <Abschnitt titel="Buttons">
        <p>The buttons along the right edge of the view switch, from top to bottom, places, trains, boats, cars, people, hiking (hiking trails), contour lines, peaks, clouds
          and weather on and off; when a button is dark with a white symbol, it is on. With a mouse, a button shows its name. At first everything is off. Sun and shadows always apply, at the current time or the time chosen below. Buildings and trees are always there in the 4 km and 1 km squares, without a button. Whatever does not work at a level stays pale in its place.
          In the headset and in XR the same buttons sit on the walls of the base. + and − in the middle
          of a wall, below the base, add a piece there or remove one (from the region on). Plus always works: if the model is as
          large as the device can hold, a row on the opposite side is dropped and the model moves on. The contour lines lie at 1,000, 2,000, 3,000 and
          4,000 m; their number is shown small on the wall.</p>
      </Abschnitt>
      <Abschnitt titel="Buildings">
        <p>In the 4 km and 1 km squares, the buildings of all of Switzerland are always there.</p>
        <p className="mt-2"><b>Real</b>, from swissBUILDINGS3D 3.0 by swisstopo (for each map sheet the latest edition): where each building stands, its
          footprint, its height and the shape of its roof, as the source describes them as roof and wall surfaces. On the roofs lies the
          SWISSIMAGE aerial image by swisstopo, that is, what you really see from above. Because it is taken from above, the roof in the image is slightly off
          on tall buildings, and it shows the state at the time of the image, not today.</p>
        <p className="mt-2"><b>Drawn</b>, because it is in no source: the colour of the walls (for each building one of eight plaster tones, chosen),
          the windows and storeys (each building has its own kind: grid, size and tint of the windows, some with shop windows on the ground floor; dark panes by day, partly lit at night, how many is an assumption; round buildings such as tanks and silos without windows, recognised by their shape, which is why a round residential tower has none either; likewise without windows, whatever the FSO Federal Register of Buildings and Dwellings lists as an industrial building, silo or warehouse), the grain and the
          darker areas at the ground and under the roof. The walls reach 2 m deeper at the bottom than in the data. Where the source has walls and a footprint but no roof above, a flat roof lies there at the average height of the walls so that the house is not open. Doors, balconies, canopies and facades as they really look are not shown in the model. Likewise invented are the street and
          station lamps that shine at night; only where roads and tracks lie is documented.</p>
      </Abschnitt>
      <Abschnitt titel="Light at night">
        <p>When the sun is below the horizon, it becomes night in the model. Then in the 4 km and 1 km squares
          windows, streets and stations light up, and the trains run with their lights on. In the 16 km square, streets and stations glow faintly as larger
          patches, without masts. At the top left, next to or below the search, are the date and time of the scene, written light at night and dark by day.</p>
        <p className="mt-2">Only where the light is is <b>real</b>: streets (swissTLM3D by swisstopo) in settlements and town centres (swissTLMRegio), tracks around
          the stations and the buildings themselves.</p>
        <p className="mt-2"><b>Invented</b>, because no source knows any lamps: the street lamps every 35 m, the station lamps every 30 m up to 250 m around
          the station, their masts (8 m on streets, 10 m at stations, also visible by day), the patches of light on the ground, warm on streets, cooler
          at stations, and how bright they are. Likewise the lit windows (how many are lit at which hour is an assumption, averaged at a distance),
          the light inside the trains, their three white headlights, the two red tail lights and the cones of light in front of the locomotive. There are no lamps
          under roofs over the tracks.</p>
      </Abschnitt>
      <Abschnitt titel="Sounds">
        <p>In the 4 km and 1 km squares you hear the surroundings where you are looking (in the headset: where your head is above the model): in settlements the
          traffic, now and then a bus; in the countryside from May to October from 6 a.m. to 8 p.m. up to 2,000 m cows and cowbells, from March to October
          a tractor; close to a river its rushing; with «Trains» the trains nearby; at lakes from 15 km² seagulls during the day; everywhere now and then an aeroplane (a propeller plane only from 6 a.m. to 8 p.m.); with «Cars» every car driving past nearby; close to a church from 6 a.m. to 10 p.m. the bells on the
          quarter hour (on the full hour with the hour strikes); with «Trains» a whistle 5 seconds before the timetabled departure when the train stops
          nearby; with «Boats» the horn when a boat casts off. The closer you are, the louder; from far away it is silent. The traffic
          of a town carries further, also in the 16 km square and still a good kilometre beside the settlement, more quietly.</p>
        <p className="mt-2">Only where settlements, rivers and churches lie (swissTLMRegio by swisstopo) is <b>real</b>, plus the season and time of day
          of the scene and when trains and boats depart according to the timetable.</p>
        <p className="mt-2">The city traffic, the cowbells and the river are <b>recordings</b> («Background traffic noise» by Froey_, «cowbells2» by
          a deleted account and «Rapidly Flowing Water» by Osiruswaltz, all freesound.org, CC0), not from the place where you are, and they play as a loop;
          likewise the seagulls («ES Seagulls from Window 01» by se2001), the passing car («car9» by lndip), the propeller plane («Propeller plane» by Breviceps), the helicopter («Helicopter Swirling» by Tiagorlp)
          and the horns when «Cars» is on («Beeping car horn from inside car» by misperpodcast, «car horn 1» by 3863, «Car Horn Honk 01» by
          Brett+Butter; all freesound.org, CC0): now and then short, more often on motorways than on other roads, and long only in traffic jams on the motorway;
          how often and how long is chosen. The whistle before departure is a recording («Referee whistle blow, gymnasium» by SpliceSound,
          freesound.org, CC0), shortened; when it is blown is chosen, not as at a real station. The aeroplane and the red helicopter you see flying along with them are drawn and invented.</p>
        <p className="mt-2">All other sounds are <b>invented</b>: they are generated by the program, not recordings, and how often they come is chosen.
          No source says where cows graze, where a tractor drives or someone honks, whether and when a church rings, or how a train or boat departs.</p>
      </Abschnitt>
      <Abschnitt titel="Trains">
        <p>«Trains» shows, in the 4 km and 1 km squares, every train where it is now according to the timetable: like the train of the model railway of Taktland
          (locomotive, four coaches, driving trailer, the front carmine red) on the terrain, in the direction of travel. At a stop it stands still between arrival and departure; at the
          first and last station 5 minutes each before departure and after arrival, an assumption: how long it really stands there
          is not in the timetable. It is the timetable from opentransportdata.swiss, plus real-time data (GTFS-Realtime, also from
          opentransportdata.swiss) where a railway reports it: the delay at the stops to a tenth of a minute and trains that are
          cancelled (they disappear). The real-time data arrives every 30 seconds, somewhat later than in reality; it only applies as long as it
          matches the version of our timetable (the trip numbers change on Mondays and Thursdays); otherwise, and without a connection, the trains run
          to the timetable. Where the train is between two stops, nobody reports; we keep calculating that ourselves, so on the line it may be
          half a minute to a whole minute away from the real one. Extra trains that are not in the timetable are missing, as are engineering works after
          the date of the file. Between two stops
          the train runs evenly along the shortest route in the network; how fast it accelerates and brakes, and which route it really takes where there are several,
          is in no source. A tap on a train (in the headset ray and trigger) shows a sign above it: line or category,
          train number, where it comes from (its first stop in the Taktland network according to the timetable; a train from abroad then comes from the border) and destination, plus the stop where it is standing, or the next one, with the times and the track according to the timetable (the
          letters are the sectors as the timetable names them) and below it the delay according to real-time data, «on time» or «no real-time data reported». A tap next to it hides it. The button with the camera on the sign makes the camera travel with the train: it moves at every moment as far as the train travels, rotating and zooming around it still work; a second tap on it or another train ends it, as does the train leaving the area. A tap next to it only closes the sign, the camera keeps travelling along; a tap on the train shows the sign again. Some trains appear in the timetable under two numbers with the same times (coupled trains); where both run together we show only one, the one with real-time data if it is reported for only one. The red button on the right of the sign takes you into the driver's cab in Taktland: the train
          runs there according to its timetable from now on, with the real clock, so the speed cannot be changed; that too is the timetable, not live. Coming from 3dland.ch, the button «Zurück zu 3D-Land» (back to 3D Land) there brings you back here; in Taktland «Zurück zur Virtuellen Schweiz» (back to the Virtual Switzerland) takes you to where the train is now according to the timetable, at the same level and with the same switches and the same sound as when you switched; the camera is again at the same angle and distance to the train, then stays where it is and watches it go until it leaves the area or you rotate or zoom yourself. With a delay according to real-time data the train may be missing there; the driver's cab runs to the timetable. Only stops at stations in the Taktland network are shown. A train is drawn 200 m
          long, not a specific type of train, with individual windows, larger from a distance so that you can see it; length and shape are not in the timetable.
          The coaches are coupled together and follow a line that is never steeper than 6°; where the terrain or the track axis rises more steeply, the train lies slightly above or below it there.</p>
      </Abschnitt>
      <Abschnitt titel="Boats">
        <p>«Boats» shows, from the 16 km level on, every scheduled boat and every ferry where they are now according to the timetable, on the water in the
          direction of travel. Between two piers a boat travels evenly along the boat routes as swisstopo keeps them for the national map
          (swissTLMRegio), on the shortest way along them; how closely these lines follow the real course is in no
          source. If no way between two piers can be found on the lines, the boat is missing on that section instead of travelling
          across land. At the pier it stays between arrival and departure, at the start and at the end 5 minutes each, an assumption as with the
          trains. It is the timetable from opentransportdata.swiss, not the real position: delays, cancellations and extra sailings
          are missing. A tap on a boat shows the course number, destination and the pier where it is moored, or the next one, with the times
          according to the timetable. A boat is drawn, not a specific boat, larger from a distance so that you can see it.</p>
      </Abschnitt>
      <Abschnitt titel="Cars">
        <p>«Cars» shows, in the 1 km square, moving cars on motorways and expressways and on the other roads. On motorways and expressways, what is documented is where the carriageways
          lie (swissTLM3D) and how much traffic runs there: the Federal Roads Office FEDRO (ASTRA) counts at its counting stations how many vehicles
          pass on average per hour by day (6 a.m. to 10 p.m.) and at night. Each stretch takes the counting station nearest to it across the network;
          that many cars drive there at the time of the scene, fewer at night. Where there is no counting station within 40 km, the
          amount is chosen. How many of them are lorries is also given by the counting station, for day and night (share of heavy traffic; without a counting station 6 % chosen).
          The cars and lorries themselves are invented: shape (roughly every fifth car an SUV, every sixth a small car, every sixth an estate, every fifteenth a pick-up, every twentieth a sports car, every twenty-fifth a minibus, from May to September every sixth of the rest a convertible, distributed at random), colour, lane and speed (right 85 km/h, where all lorries drive, left 115 km/h, on expressways without separation 80 km/h),
          and likewise exactly where each one drives. The direction of travel of separated carriageways is in swissTLM3D. Their axis there usually lies close to the central reservation; if the opposite carriageway lies within 8 m, both lanes run to the right of it. How many lanes a motorway has is in none of our sources, so on wide motorways the right-hand lane stays empty. From a slip road a car merges from the right into the right-hand lane over a good 100 m and accelerates as it does so; how long the acceleration lane really is, is in none of our sources, the length is chosen. A tap on a car or a lorry colours it yellow; «Remove» below it takes it away, for instance out of a traffic jam, until the square is loaded again. Headlights and rear lights shine by day too; every fourth car has round headlights, a good third of the small cars (about every 17th car) two round ones on each side; rear lights square, round, tall and narrow or as a band across the whole width; at night there is also a cone of light in front of each headlight, a little longer or shorter, brighter or darker, warmer or cooler for each car (chosen). In tunnels
          they cannot be seen. While the button is on, the standing cars on the aerial image are painted out: each pixel on the carriageway
          takes the average colour of the carriageway before and after it. Broken lines become paler in the process; in traffic jams cars remain.</p>
        <p>On the other roads (main and minor roads, slip roads on and off) there is no count for each section. There the
          traffic model of the Federal Office for Spatial Development ARE applies (National Passenger Transport Model 2023 and freight transport of DETEC (UVEK)): it calculates for
          each section how many vehicles pass on average per day and how many of them are lorries. That is a model, not a measurement.
          It is split into day and night as on average at the FEDRO counting stations, the lorries equally by day and night. On Sundays and the public holidays of the Sunday driving ban (New Year's Day, Good Friday, Easter Monday, Ascension Day, Whit Monday, 1 August, Christmas Day, St Stephen's Day; by the time of the scene) no lorries drive; special permits are not taken into account. Roads on
          which, according to the model, fewer than 200 vehicles a day drive, remain empty. Invented here in addition are the speed (in built-up areas 25 to 35 km/h as an average
          including stops, outside 50 to 80 km/h, according to the width of the road) and one lane per direction. At junctions and roundabouts every car continues onto one of the roads that
          join there, more often onto one with a lot of traffic; which car turns where is invented. It turns in a curve and adjusts its speed. The
          priority-to-the-right rule applies: if a car comes from the right at the same time, it waits before the junction; whoever is in the roundabout has priority. If it waits longer than 4 seconds, it drives
          anyway as soon as the way is clear. No car drives into another: each brakes when one drives, crosses or turns in in front of it, and keeps about 2 m distance. There can be traffic jams:
          whoever is behind a standing car waits. Only when cars wait for each other in a circle and traffic comes to a complete standstill does one disappear after the other
          until it moves again; it reappears as soon as there is room. Traffic lights, signals, stop roads and turning lanes are in none of our sources and are missing. Roundabouts are marked as
          roundabouts in swissTLM3D and are driven anticlockwise; only where a road ends or the loaded area stops does a car disappear
          and start again at the beginning of its road. Cars are painted out of the
          aerial image only on roads from 6 m wide. In built-up areas a car stops now and then because a pedestrian crosses the road; the cars behind
          wait, then pull away and catch up, sometimes one honks. That too is invented: pedestrian crossings and pedestrians are in none
          of our sources.</p>
        <p>In the 1 km square, the lanes on roads with two-way traffic lie where the aerial image shows the carriageway: across the axis from
          swissTLM3D it is measured every 6 m how far the surface reaches, and each direction drives in the middle of its half (driving on the right). That is an
          estimate from the colours of the image, not information from a source; where it yields nothing usable (pavements in the same grey, shadows, trees),
          a quarter of the width according to the road class beside the axis applies. Where the lanes really are is in none of our sources.</p>
      </Abschnitt>
      <Abschnitt titel="People">
        <p>«People» shows, in the 4 km and 1 km squares, people waiting on the platforms, pedestrians on the pavements and hikers on the
          hiking trails. Documented is where platforms, roads and hiking trails lie, how many people board and alight at a station on a working day (SBB)
          and how many live in a hectare (STATPOP, Federal Statistical Office FSO). How many of them are out and about is counted by no source; that is
          chosen: on the platforms as many wait as if half of those boarding and alighting board, spread over 18 operating hours, and
          each person waits 5 minutes; at night from 1 to 5 a.m. nobody. On the pavements of roads in settlements, per km a quarter of the
          residents of a hectare around it walk, fewer in the evening and at night. On the hiking trails there is about one hiker every 1.7 km by day. On the
          platforms they stand in small groups, a little fewer at the ends; on the pavements some walk in twos or threes. The
          people themselves are invented: shape, clothes, exactly where they stand, where they go and how fast. They carry on at junctions
          and can disappear at the end of a path. When it rains in the model (with «Weather»), every third person carries an umbrella; shape and
          colours are invented.</p>
        <p>If «Trains» is on too, the sliding doors on the platform side open at a stop: a few seconds after the timetabled
          arrival, and they close a few seconds before departure. First up to three people get off at each door and walk away across the
          platform, then people waiting nearby go to the door and board; in their place someone new waits after a few minutes. Who
          boards or alights when and at which door is in no source; that is invented, as are the doors themselves.</p>
      </Abschnitt>
      <Abschnitt titel="Weather: wind and precipitation">
        <p>«Weather» always shows four windsocks, one in the middle of each quarter of the model. The numbers above the mast are the wind in km/h of the station nearest to the spot (the windsock does
          not stand at the station): on the left the mean over 10 minutes, on the right the strongest gust; on the mast is the temperature in °C. When
          «Sun» is on, the windsocks show the chosen time: in the past the measurement (today every 10 minutes, earlier days since
          1 January hourly), in the future the forecast; where there is no information for that time, «–» is shown and the sock hangs grey. Measurement and forecast come from the stations of
          MeteoSwiss (SwissMetNet and local forecast for the station, up to 8 days ahead); a forecast is not a measurement. Rain and wind can also be heard, as calculated sounds,
          louder with their strength; snow stays silent.</p>
        <p>At every level, the white «Clouds» button shows the clouds according to the MeteoSwiss weather model ICON-CH1,
          at the time of the sun or, when the sun is off, now. For each spot of about 1 km the model gives how much of the sky is cloudy in three
          layers: low (from the ground to 800 hPa), medium (800 to 400 hPa) and high (above 400 hPa); here averaged to 2 km,
          updated every 3 hours, up to a good day ahead. The clouds are drawn as many soft, round puffs that always face the viewer,
          as many as the forecast gives cloud cover; without more information each layer lies around a chosen height (1,500, 4,200 and
          9,000 m above sea level, roughly the middle of its pressure range) with a chosen thickness (800, 1,400 and 900 m). For the next 24 hours of the
          latest run there is more: the cloud cover in each of the model's 80 layers with their height above sea level. Then the puffs lie at
          the height the model calculates, and a cloud is as thick as it is there. Shape, size, spacing and brightness of the puffs are
          drawn, not from the source; the larger the model, the larger and further apart the puffs, so that phone and headset can
          draw them. If there is no forecast for the chosen time (for instance late in the evening before the next run is available, or far in the
          past), the clouds are missing; no notice appears in the view then.</p>
        <p>Rain and snow come from the same weather model: for each 2 km spot, how heavily it is falling at that hour, and the
          snow line. They fall from the lowest drawn cloud above down to the ground, above the snow line as
          snow, below it as rain; the same weather at every level. Under a dense cloud you cannot see the rain from above. If the
          model data is missing, as before the precipitation of the nearest station falls evenly over the whole model: rain or snow from 0.1 mm,
          as snow up to 1 °C.</p>
      </Abschnitt>
      <Abschnitt titel="Sun and shadows">
        <p>The model always shows the position of the sun above its centre for the date and time, with shadows, at first now, without a button. In the headset, on the wall,
          −1 h and +1 h shift the time, −1 day and +1 day as well as −1 month and +1 month the date; «Now» sets both to now. At first the
          current time applies, and «Now» is lit. At the top left of the view below the search field are the date and time of the scene; a tap on them opens time travel: date, «Now» and the time with a slider to the minute. A tap next to it closes it. From the chosen time on, the clock keeps running. The time
          also applies to the trains and boats according to the timetable, as far as the loaded timetable reaches (about two weeks from yesterday). When the sun is below
          the horizon, light burns in the windows of the buildings, in many in the evening, in few after midnight. Windows and storeys are in
          no source: they are drawn, by day as dark panes, and how many are lit at night is an assumption. At night the sky becomes dark, and the stars down to magnitude 6 appear where they stand at that time above
          the centre of the model, plus the Moon with that day's phase, its bright side towards the sun.</p>
      </Abschnitt>
      <Abschnitt titel="Lakes and lake depth">
        <p>For 22 lakes the bed is measured: swissBATHY3D by swisstopo, an elevation model of the lake bed. The surface of the lakes remains
          the terrain with the aerial image, as you know them from above; you see the lake in cross-section in the walls, from its surface down
          to the bed, darker further down. The depths are measured. The base follows the surface: if a lake reaches deeper than
          the base, its bed is cut off at the bottom of the base. They are: Ägerisee, Baldeggersee, Bielersee, Bodensee,
          Brienzersee, Genfersee, Hallwilersee, Lac de Joux, Lago Maggiore, Lungerersee, Murtensee, Neuenburgersee, Rotsee, Sarnersee,
          Sempachersee, Silsersee, Silvaplanersee, Thunersee, Vierwaldstättersee, Walensee, Zürichsee and Zugersee. All other lakes
          only show their surface; how deep they are is not in our sources. The bed is averaged to 25 m, for the whole of
          Switzerland to 500 m, there only where at least half of a square is measured. Because it is averaged, it rises evenly over the last 40 m
          to the shore, so that it does not drop vertically there; how the shore really runs in between is not shown in the
          model. The colours of the cross-section are chosen.</p>
      </Abschnitt>
      <Abschnitt titel="Underground in the walls">
        <p>The walls of the base show what lies below the surface, as far as it is measured or mapped: the light, ochre band
          is the loose rock above the bedrock, that is, everything that is not solid rock, such as gravel, sand, moraine or lake sediments.
          Below it the bedrock begins, where the wall stays dark. How deep the bedrock lies comes from swissBEDROCK by swisstopo, a
          model of the bedrock surface for all of Switzerland; the source also states how uncertain it is (not shown here). Here it is
          averaged to 50 m. Where the wall is completely dark, the bedrock lies at the surface or
          swissBEDROCK gives nothing there. Which rock the bedrock is and how the layers lie in it is not shown in the model. The
          band exists from the 128 km area on, not for all of Switzerland seen from above.</p>
      </Abschnitt>
      <Abschnitt titel="My location">
        <p>The crosshair at the top right next to full screen shows you via GPS as a red dot in the model and selects the square around you. Your location stays
          on the device.</p>
      </Abschnitt>
      <Abschnitt titel="With a VR headset">
        <p>The «XR» button at the bottom right of the view starts the headset. With a headset such as the Meta Quest, the model stands on the table. A short trigger press selects a square, another dives in;
          a held trigger carries the model, both together rotate and scale it. The grip button goes back one level, the
          thumbstick rotates and lifts, pressing it resets the model. The buttons on the walls work with ray and trigger. On a phone, where the browser supports it, the «Close» button at the top right ends the view.</p>
      </Abschnitt>
      <Abschnitt titel="Together">
        <p>The symbol with the two phones at the bottom of the view opens the choice below the model: «Open a room» gives a code of four letters; the other person enters it
          on their device, scans the QR code below the model with the camera or opens the copied link. Whoever opens the room leads: the others see the same square at the same level, the same
          switches and the same time, also with the pieces added with + (where the device can hold that many, otherwise only the first square); a new square or a change reaches them after about a second. «Lead» takes over the lead. Whoever leads sees four tools on the left of the view: pin (a tap on the terrain sets it, with a word or a number), line
          (tap point by point, then «Done»), area (corner by corner, a tap on the first point closes it) and bin (delete everything). The
          others see the drawings in carmine on the terrain, even through mountains, and when diving in at the same place.
          Each person sees the others as a blue figure where they are looking into the model, with a line to the spot they are pointing at (mouse,
          in the headset the ray). Whoever follows also sees through the eyes of the leading person at first, the camera glides after them; whoever rotates or zooms themselves looks for themselves again, «Follow view» brings the view back (not in the headset). There is no voice chat; for that you need a phone
          alongside. A room expires after six hours.</p>
      </Abschnitt>
      <Abschnitt titel="Save and share views">
        <p>The star at the bottom of the view immediately saves what you are seeing as «New view»; the pencil renames it; the view then appears in the list below the model. Saved are the level and the square, the camera's view, the
          buttons, the time (now or a time travel) and whether the sound is off. A tap on the name opens the view again. The views stay only on this device and are lost when the browser data is deleted.
          The share symbol gives a link that opens the same view on another device; everything is in the link itself, nothing goes to a server
          of Taktland. Added pieces (+) are not included; in the headset only the square with the buttons applies, without the view. The pencil renames a view, swiping left or a tap on the red star deletes it («Undo» brings it back), «Change order» moves it with ↑ and ↓.</p>
      </Abschnitt>
      <Abschnitt titel="Where the data comes from">
        <ul className="list-disc space-y-1 pl-5">
          <li>Terrain: swissALTIRegio and swissALTI3D, Federal Office of Topography swisstopo; the deeper you dive, the finer (50 m, 10 m, 5 m, along
            the railway lines 2 m).</li>
          <li>Aerial imagery: SWISSIMAGE (swisstopo), for each kilometre the latest image; what you see on it shows the state at the time of the image, not today.</li>
          <li>Names of lakes and rivers: swissTLMRegio (swisstopo); a name only appears where it fits completely on the lake or along the river in the view,
            rivers only in the 4 km and 1 km squares. The lettering is darker than the water in the aerial image at that spot (chosen).</li>
          <li>Lake bed: swissBATHY3D (swisstopo) for 22 lakes, see «Lakes and lake depth».</li>
          <li>Bedrock surface below the loose rock: swissBEDROCK (swisstopo), see «Underground in the walls».</li>
          <li>Settlements, peaks and lakes in the search: swissTLMRegio (swisstopo); places and peaks of the 1:1 million national map; cantons: Federal Statistical Office FSO.</li>
          <li>Addresses in the search: swisstopo search (api3.geo.admin.ch), queried while typing.</li>
          <li>Hiking trails: swissTLM3D (swisstopo), all paths recorded there as hiking trail, mountain hiking trail or alpine hiking trail. Only their
            position is shown, without closures, diversions, condition or hazards; for looking at, not for planning a hike. For that, the signposts on
            site and the official hiking maps apply.</li>
          <li>Buildings: swissBUILDINGS3D 3.0 (swisstopo). Trees and forest: swissTLM3D (swisstopo). Whether broadleaf or conifer: LFI forest mixture rate
            (Federal Office for the Environment FOEN, as of 2023), the share of broadleaf trees in the visible crowns, modelled from satellite images, here averaged to 50 m;
            which individual tree is broadleaf or conifer is distributed accordingly, not measured.</li>
          <li>Trains: timetable as GTFS from opentransportdata.swiss, reloaded {eigeneSeite ? 'daily' : 'on Mondays and Thursdays'}, delays and cancellations as
            GTFS-Realtime from opentransportdata.swiss via spiel.taktland.ch; route between the stops from the
            Taktland network (lines and kilometre points of SBB, SBB Open Data, data.sbb.ch; rail network of the FOT).</li>
          <li>Overhead line masts: only where the FOT rail network lists the line as electrified, on the track axes from swissTLM3D (swisstopo).</li>
          <li>Platforms in the 4 km and 1 km squares: position of the edges and their height above the track (about 35 or 55 cm) according to SBB Open Data
            (BehiG Haltekantesegment, data.sbb.ch), at the height of the track axes from swissTLM3D (swisstopo).</li>
          <li>Bridges of the railway, roads and paths: position and height of the axes on bridges from swissTLM3D (swisstopo).</li>
          <li>Type of bridges: whether a bridge is an arch or truss bridge and made of stone, concrete or steel, according to Wikidata (CC0), where
            the bridge is there with its position.</li>
          <li>City traffic: recording «Background traffic noise» by Froey_, freesound.org (CC0); cowbells: recording «cowbells2»
            by deleted_user_229898, freesound.org (CC0); river: recording «Rapidly Flowing Water (loopable)» by Osiruswaltz, freesound.org (CC0); passing
            car: recording «car9» by lndip, freesound.org (CC0); propeller plane: recording «Propeller plane» by Breviceps, freesound.org (CC0); helicopter: recording «Helicopter Swirling» by Tiagorlp, freesound.org (CC0); whistle: recording «Referee whistle blow, gymnasium» by SpliceSound, freesound.org (CC0); horns: recordings «Beeping car horn from inside car, engine off» by misperpodcast, «car horn 1» by 3863 and «Car Horn Honk 01 - Single, Distant» by Brett+Butter, freesound.org (CC0); seagulls: recording «ES Seagulls from Window 01» by se2001, freesound.org (CC0); area of the lakes from their outline according to swissTLMRegio (swisstopo).</li>
          <li>Buildings without windows: building class industrial building or tanks, silos and warehouses according to the Federal Register of Buildings and Dwellings (GWR),
            Federal Statistical Office FSO.</li>
          <li>Boats: timetable as GTFS from opentransportdata.swiss, reloaded {eigeneSeite ? 'daily' : 'on Mondays and Thursdays'}; boat routes between the
            piers: swissTLMRegio (swisstopo).</li>
          <li>Wind, temperature, rain and snow: measurements by MeteoSwiss (SwissMetNet, every 10 minutes, for earlier days the hourly values since 1 January) and their local forecast, hourly up to 8 days.</li>
          <li>Track of the trains: track according to the timetable (opentransportdata.swiss); where each track lies, from the SBB sector signs (SBB Open Data, data.sbb.ch) and the track axes from swissTLM3D (swisstopo).</li>
          <li>Clouds: weather model ICON-CH1-EPS by MeteoSwiss (Open Government Data, CC-BY), control run, low, medium and high cloud cover, for the next 24 hours the cloud cover in all 80 layers (CLC) with their height (HHL), plus precipitation rate (TOT_PR) and snow line (SNOWLMT), updated every 3 hours.</li>
          <li>Stars: Hipparcos catalogue of ESA, prepared by d3-celestial (Olaf Frohn, BSD licence).</li>
          <li>Position of the sun and starry sky: calculated with the approximations of the Astronomical Almanac; the Moon from a short approximation of its orbit.</li>
          <li>Churches for the bells: swissTLMRegio (swisstopo).</li>
          <li>People: platforms (SBB Open Data), passengers boarding and alighting on a working day per station (SBB Open Data), residents per hectare (STATPOP 2025,
            Federal Statistical Office FSO, data.geo.admin.ch), roads and hiking trails (swissTLM3D), settlements (swissTLMRegio).</li>
          <li>Cars: carriageways of motorways and expressways from swissTLM3D (swisstopo); traffic per hour by day and at night at the counting stations
            of the road traffic count, national network, Federal Roads Office FEDRO (ASTRA, data.geo.admin.ch); on the other roads the
            carriageways from swissTLM3D and the daily traffic according to the model «Belastung Personen- und Güterverkehr Strasse» (road passenger and freight traffic load), Federal Office for
            Spatial Development ARE (NPVM 2023 and AMG of DETEC, data.geo.admin.ch).</li>
        </ul>
      </Abschnitt>
      <Abschnitt titel="What is invented">
        <p>The model is a model, not a picture of reality. What does not come from a source but is invented (drawn, chosen or assumed):</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Base, buttons, masts, signs, windsocks and their sizes; the windsocks do not stand at the stations.</li>
          <li>Clouds: their shape as puffs, their size, spacing, position in the square (shifted at random, partly with smaller puffs alongside) and brightness (greyer underneath); beyond the next 24 hours also their thickness
            and the height of each layer (chosen by the middle of its pressure range).</li>
          <li>Trains and boats: length, shape and colour, the even speed between two stops and the route in between, 5 minutes standing at the first and last station, at stops for which the timetable gives arrival and departure in the same minute, arrival 10 seconds before and departure 20 seconds after, and that every train runs to the left of its route,
            so that trains in opposite directions pass each other. In the station the track according to the timetable applies; which track axis belongs to which track number
            is inferred from the position of the sector signs, not stated, and underground tracks are missing. How the trains change tracks before and after is chosen.</li>
          <li>A square is a square, not a region or a valley: their boundaries are in no source.</li>
          <li>Walls of the buildings: for each building one of eight light plaster tones, slightly lighter or darker, always the same at the same place (chosen, the
            facade colour is in no source); windows, storeys and how many windows are lit at night; a flat roof where the source has
            walls and a footprint but no roof. On the roofs lies the aerial image
            (SWISSIMAGE): it is taken from above, so on tall buildings the roof in the image is slightly off.</li>
          <li>Platforms: SBB gives the position at the track; the edge is drawn 1.65 m beside the track axis and follows the track according to swissTLM3D between the SBB
            points. Where SBB gives only one edge (side and station-building platforms), the platform is 4 m wide, on the side of its
            sector signs; if the side is not known, it is missing. The platforms stand 50 cm higher than in the data, otherwise the averaged
            terrain partly covers them. Colour chosen. Roofs, stairs and underpasses are missing; they are in none
            of our sources with their shape, nor are underground platforms.</li>
          <li>Roofs over tracks (such as the car park above Bern station), where there are buildings: the aerial image there shows the roof; it lies on the
            roof deck, below it the ground is drawn anthracite and grainy (chosen). A roof from swissBUILDINGS3D at least 4 m above
            a track according to swissTLM3D counts as a roof over the tracks; so far only along the lines from Müntschemier via Bern and Biel/Bienne to Neuchâtel.</li>
          <li>Overhead line masts in the 4 km and 1 km squares: position, spacing (every 50 m, 3 m beside the track), height and shape are invented;
            only that the line is electrified is documented. Likewise the contact wire and catenary above: height, sag and droppers are chosen, and
            whether an individual track is electrified is in none of our sources. The trains move onto the nearest track axis there; that is not always the track they really run on. They stay on one track until their path deviates from it by more than 3 m, and then change in an S-curve over a good 120 m; points are in none of our sources, where and how a train changes track is chosen.</li>
          <li>Bridges in the 4 km and 1 km squares: documented are position and height and, for railway bridges, how many tracks lie side by side. Width (for
            roads without information in the class), cross-section with ballast, surface and parapets and the painted appearance are chosen, the same as in the
            driver's cab in Taktland; piers are missing, sections under 12 m are missing. The surface of the road bridges has the colour of the road at their
            ends in the aerial image, and at their ends the bridge rests on the drawn terrain; in between its height according to swissTLM3D is shifted evenly by this
            difference so that it joins the road without a step. Where Wikidata gives an arch or truss bridge, there is
            an arch with supports and piers below or a truss above in the colour of the material: only the type is documented; shape, span,
            number of supports and dimensions are invented. Under every drawn bridge the aerial image is painted over: otherwise the bridge
            on the aerial image would lie as a second bridge down in the valley. What can be seen there, water, slope or ground, is filled in from the image alongside
            and invented, not an image.</li>
          <li>Street and station lights with the buildings: the lamps and their masts are invented, no source knows them. Documented is only where roads, tracks,
            settlements and stations lie (swissTLM3D, swissTLMRegio); spacing, colour, brightness, height and position of the masts are chosen. Likewise the
            interior lighting of the trains, their three white headlights, the two red tail lights and the cones of light.</li>
          <li>People: all of them, their shape, clothes, position, direction and speed, and the shares by which a number is derived from the passengers boarding and alighting and the
            residents; who gets off and on at a stop, the sliding doors of the trains and when they open and close.</li>
          <li>Cars and lorries: their shape (including which are SUVs, pick-ups, small cars, estates, minibuses, sports cars or convertibles), colour, lights and cones of light, lane, their speed and exactly where each one drives; two lanes per carriageway, all lorries on the right;
            on the other roads one lane per direction, the speed according to the width, junctions without traffic lights and priority rules.
            Documented are the carriageways with their direction of travel (swissTLM3D) and the amount per hour at the FEDRO counting stations; on the other
            roads the amount is calculated from the ARE traffic model, not counted. Under the moving cars the aerial image is painted over. The stops for
            pedestrians, the pedestrians themselves, the braking, pulling away and honking involved.</li>
          <li>Sounds of the surroundings: bus, cows, tractor and the aeroplane high up are generated by the program; traffic, cowbells, river, seagulls, the
            passing car and the propeller plane are recordings from another place; the pedestrians for whom cars stop and when someone honks are invented; the aeroplane and the helicopter you see flying along with them are invented: shape, colours, height (150 and 120 m above the terrain), direction and speed; when someone honks is chosen; that seagulls only call at lakes from 15 km² and by day is chosen; that cows graze up to 2,000 m is chosen; how often they come and how loud is chosen; documented is only where settlements and rivers lie.</li>
          <li>Height and shape of the trees, their spacing in the forest, and whether broadleaf or conifer: by altitude, not measured. They sway in the wind
            according to the measured mean of the four windsocks (MeteoSwiss); how strongly and how fast is drawn.</li>
          <li>Broadleaf or conifer: which individual tree it is, distributed according to the FOEN share; only where this is missing, by altitude: up to 800 m in forest
            40 % conifers, for single trees 10 %, more above, from 1,500 m only conifers (chosen).</li>
          <li>Rain and snow fall at a slant: the stronger the wind of the windsocks, the steeper the slant; what counts is the mean of mean wind and gust (the two
            numbers above the windsock), fully slanted from 45 km/h; snow more slanted than rain (chosen).</li>
          <li>Broadleaf trees through the year, by the date of the scene: leaves come out from about mid-April to early May, lighter at first, autumn colours from
            early October, leaf fall from late October to mid-November, in winter only branches; each tree a few days earlier or later, higher up
            later in spring and earlier in autumn. Days and colours are chosen, not measured; the colour in summer is that of the aerial image.</li>
          <li>Church bells and boat horn: generated by the program; documented are only the position of the churches and the departures according to the timetable.</li>
          <li>The Moon: larger than in the sky, its markings drawn; position and phase calculated.</li>
          <li>Cloud cover, rain and snow from the sunshine, precipitation and temperature of the station, where the weather model is missing; density, speed and size
            of the drops and flakes; that they begin at the lowest drawn cloud; rain and wind sound calculated.</li>
          <li>Colours of the contour lines, the hiking trails, the water in the cross-section, the loose rock in the walls and the sky at dusk and at night.</li>
          <li>The depth of the base: it reaches slightly below the lowest point of the surface, for lakes below their water level; the buttons sit in this band, even where a lake lies in the cross-section; what lies below the bedrock is in none of our sources.</li>
          <li>Only what lies in the model casts shadows; mountains outside it, clouds and haze are missing.</li>
        </ul>
      </Abschnitt>
      <Abschnitt titel={eigeneSeite ? 'About 3D Land' : 'About the Virtual Switzerland'}>
        <p>Actually, I just wanted to see Switzerland in 3D. That turned into 3D Land. It started in October 2026 as the game
          «3D Switzerland» in Taktland; since then it has been called 3D Land.</p>
        <p className="mt-2">Who is 3D Land for? For hikers who would like to see their routes in three dimensions for once: all
          the hiking trails of Switzerland lie on the terrain, yellow, red and blue as on the signposts. For everyone who wants to experience the railway: the
          trains run through the model according to the timetable; you tap one and ride along in the driver's cab in Taktland, all the way to its destination. With
          «My location» a red dot travels with you, on a hike as on the train, and you see in the model where you are right now. And
          for everyone who simply likes looking at Switzerland from above, with today's weather and the sun at any hour.</p>
        <p className="mt-2">I can't program a single line myself. 3D Land came about in dialogue with AI. I described what I
          wanted to see, and Claude, an artificial intelligence by Anthropic, wrote the code. Claude also found and prepared the open data from
          swisstopo, MeteoSwiss and public transport. Step by step more was added: level after level down
          to one kilometre, sun and shadows, buildings and trees, hiking trails, weather with windsocks, rain and clouds from the
          weather model, the starry sky, the depth of the lakes, trains and boats according to the timetable and the VR headset.</p>
        <p className="mt-2">My role: having ideas, trying things out, making mistakes and finding mistakes. Deciding. There were many mistakes. The
          lake bed, for example, dropped vertically at the shore all the way to the bottom of the base, in Bern the trains stuck out above the roofs, and on various
          mountain lines the trains rode a rollercoaster. That is how 3D Land grew in many small rounds: a wish, an attempt, a look at it,
          a correction. It still has various flaws that I want to fix step by step.</p>
        <p className="mt-2">It was important to me that as much of the data as possible is real. Terrain, aerial imagery, buildings, lake depths, weather and timetable come from
          the sources named. On the other hand, much of the appearance is invented: the colours of the sky, the shape of the trains and boats, how many windows
          are lit in the evening and how brightly, the trains' cones of light, the shape and thickness of the clouds, whether a tree is broadleaf or conifer.</p>
        <p className="mt-2">Without artificial intelligence there would be no 3D Land, at least not from me. I designed the logo and the header image
          with ChatGPT.</p>
        {eigeneSeite && <p className="mt-2">3D Land is my little homage to public transport in Switzerland.</p>}
        <p className="mt-2">And now have fun discovering Switzerland. From a slightly different perspective.</p>
        {eigeneSeite && <p className="mt-3 font-medium">Michael Veikko Seiler</p>}
      </Abschnitt>
    </div>
  </>)
}
