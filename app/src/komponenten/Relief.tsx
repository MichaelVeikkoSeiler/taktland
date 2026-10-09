import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { bodenbedeckungLaden, flaechenLaden, holen, seenLaden, sehenswertLaden, streckenLaden } from '../daten'
import type { BodenbedeckungDaten, FlaechenDaten, KodierterZug, SeenDaten, SehenswertDaten } from '../typen'
import { type FahrObjekt, type Fahrweg, wegEnde } from '../fahrt'
import { lv95, useBrilleMoeglich } from '../relief'
import { audioKontext, audioLesen, audioSetzen, useAudio, zuggeraeuschAus, zuggeraeuschTempo } from '../audio'
import { ausschnittLaden, fensterLaden, fensterVorladen, KEINE_HOEHE, type Luftbild, luftbildLaden, type Nahbild, nahbildLaden, type Fein, feinLaden, feinHoehe, feinFeld } from '../gelaende'
import { Zurueck } from './Zurueck'
import { Ladefehler } from './Ladefehler'
import { type Kategorie, SehenswertLegende, useVersteckt } from './Sehenswert'

/**
 * 3D-Relief einer Strecke (Michael, 2026-10-06: zuerst die Gotthard-Bergstrecke, im Browser,
 * später auch mit Brille). Gelände aus swissALTIRegio, Linie, Tunnel, Brücken, Bahnhöfe und
 * Gipfel aus data/relief/{name}.json (pipeline/build_relief.py). Gezeichnet mit three.js, das
 * mit der App ausgeliefert und erst hier geladen wird.
 *
 * Zwei Verwendungen: die eigene Seite (#/relief/gotthard) mit der Linie, und beim Fahren als
 * Ansicht «3D» mit dem Weg der Fahrt und dem Zug, dem die Kamera folgt (ReliefFahrt).
 *
 * Ehrlich bleibt: Die Höhe der Gleise steht in keiner Quelle. Die Linie liegt auf dem Gelände,
 * im Tunnel und auf Brücken gerade zwischen den beiden Enden; das steht dabei. Ist die Höhe
 * überhöht, steht der Faktor sichtbar daneben.
 */

interface Relief {
  titel: string; linie: string; linie_name: string; von_km: number; bis_km: number; datenstand: string
  /** mehrere Linien hintereinander; der Weg zählt dann Meter ab dem Anfang, nicht die Kilometrierung */
  teile?: Array<{ linie: string; linie_name: string; von_km: number; bis_km: number }>
  quellen: string[]
  /** bei Linien anderer Bahnen: woher Tunnel und Brücken kommen */
  hinweis?: string
  /** der Ausschnitt im Raster der Geländekacheln; die Höhen kommen aus ihnen (gelaende.ts) */
  raster: { ost: number; nord: number; m: number; breite: number; hoehe: number }
  /** [Meter der Kilometrierung, Ost, Nord] */
  weg: Array<[number, number, number]>
  bahnhoefe: Array<{ uic: number; name: string; km: number; lage: [number, number] }>
  tunnel: Array<{ name: string | null; laenge_m: number | null; km: number; von_km?: number; bis_km?: number; galerie?: boolean }>
  bruecken: Array<{ name: string | null; von_km: number; bis_km: number; laenge_m: number | null }>
  gipfel: Array<{ name: string; hoehe_m: number | null; lage: [number, number] }>
  /** ganze Strecke in der Brille: nur diese Kacheln und nur, was im Band um die Strecke liegt */
  kacheln?: Set<string>
  innen?: (e: number, n: number) => boolean
}

/** Ein Weg im Relief: Punkte mit ihrer Stelle in Metern, dazu Tunnel und Brücken als Bereiche */
interface Weg {
  punkte: Array<{ m: number; e: number; n: number }>
  bauwerke: Array<{ von: number; bis: number; art: 'tunnel' | 'bruecke' }>
  /** Punkte von Tunneln ohne bekanntes Ende */
  tunnelPunkte: number[]
  /** nur diese Stücke zeichnen (beim Fahren: was im Ausschnitt liegt) */
  stuecke: Array<[number, number]>
}

/** jedes wievielte Feld des Rasters ins Netz kommt; 2 hält das Netz auch auf dem Handy flüssig */
const SCHRITT = 2
/** Knöpfe über dem Gelände beim Fahren */
const KAMERA_KNOPF = 'rounded-lg border border-sbb-cloud bg-white/90 px-2.5 py-1 text-xs font-bold dark:border-sbb-iron dark:bg-sbb-midnight/90'
/** Führerstand: das Auge so hoch über der Linie, so nah zeichnet die Kamera noch (km) */
const FUEHRERSTAND_HOEHE_M = 4, FUEHRERSTAND_NAHE_KM = 0.003
/** Führerstand: feines Gelände (10 m) in einem Quadrat von FEIN_SEITE_M, die Mitte FEIN_VORAUS_M vor dem Zug, neu nach
 *  FEIN_NACH_M Fahrt; FEIN_RAND_M vor dem Rand geht die Linie wieder in die des groben Geländes über */
const FEIN_SEITE_M = 4000, FEIN_VORAUS_M = 1200, FEIN_NACH_M = 800, FEIN_PX_JE_M = 0.4, FEIN_RAND_M = 300
/** Linie im Führerstand: in Metern breit statt in Bildpunkten; Linie über dem feinen Gelände */
const FEIN_LINIE_M = 1.5, FEIN_UEBER_M = 1
/** Nahbild (Luftbild auf 2,5 m entlang der Bahnlinien): so gross um den Blickpunkt, so viele Bildpunkte je Meter;
 *  neu geladen, wenn der Blickpunkt so weit gewandert ist; nur wenn die Kamera näher ist als NAH_BIS_KM */
const NAH_SEITE_M = 6000, NAH_PX_JE_M = 0.4, NAH_NACH_M = 1500, NAH_BIS_KM = 25
/** Masten und Schilder stehen so viel über dem Gelände */
const UEBER_M = 25
/** die Linie liegt so viel über dem gemittelten Gelände; mehr nur dort, wo das Gelände darüber ragt
 *  (Michael, 2026-10-10: «deutlich über dem Boden»: vorher 25 m überall, bei Höhe 2-fach 50 m) */
const LINIE_UEBER_M = 3
/** in der Brille (Michael, 2026-10-06: «Quest 3»): das Relief als Modell so breit, der tiefste Punkt auf
 *  Tischhöhe, so weit vor dir; Linien so dick, dass sie auf diese Grösse noch zu sehen sind */
const BRILLE_BREITE_M = 1.2, BRILLE_TISCH_M = 0.8, BRILLE_ABSTAND_M = 0.9, BRILLE_LINIE_M = 0.0012
/** Radius der Linie und der Bahnhöfe auf dem Bildschirm in km (Michael, 2026-10-06: «ziemlich fett», vorher 60 und 120 m) */
/** Breite der Linie in Bildpunkten, bei jedem Zoom gleich: aussen der dunkle Rand, innen STRICH_INNEN davon heller
 *  (Michael, 2026-10-07: «halb so dick», dann «Innen heller aussen dunkler») */
const STRICH_PX = 3.5, STRICH_INNEN = 0.5
/** so hoch steht der Mast eines Bahnhofs, bevor er mit dem Zoom kürzer wird */
const MAST_KM = 0.5
/** in Modellen über 100 km Seite nur Seen ab dieser Fläche beschriften */
const SEE_NAME_AB_M2 = 8e6
/** Tunnel auf dem Bildschirm: Strich und Lücke je Kilometer Abstand der Kamera (aus 20 km 300 und 200 m;
 *  Michael, 2026-10-07: «Die Längen verdoppeln») */
const STRICH_JE_KM = 0.015, LUECKE_JE_KM = 0.01
/** in der Brille: Strich und Lücke der Tunnel auf dem Tisch, so wie die Striche auf dem Bildschirm aus 0,8 m aussehen */
const BRILLE_STRICH_M = 0.012, BRILLE_LUECKE_M = 0.008
/** Mast und Schild der Bahnhöfe, dunkelgrau (Michael, 2026-10-07: «wesentlich dunkler») */
const BAHNHOF_GRAU = '#2a2a2a'
/** der Zug in der Brille mindestens so breit, damit man ihn auf dem Modell findet */
const BRILLE_ZUG_M = 0.005
/** näher als so viele Meter wird der Zug in der Brille kleiner */
const BRILLE_NAH_M = 0.8
/** so lange fährt der Zug an und bremst er vor dem Ziel, in Sekunden (Michael, 2026-10-09) */
const ANFAHREN_S = 2
/** so gross lässt sich jedes Modell in der Brille höchstens ziehen: Meter auf dem Tisch je Kilometer */
const BRILLE_GROESST_M_JE_KM = 0.3
/** in der Brille wird bis so nahe vor den Augen gezeichnet; mit 10 cm verschwand das Gelände um den Kopf (Michael,
 *  2026-10-08: «Die Landschaft verschwindet dann um einem») */
const BRILLE_NAHE_M = 0.01
/** der Zug (Michael, 2026-10-06: «Lok plus 6 Wagen, Grau mit karminroter Front»): Längen in Metern
 *  entlang der Linie, Breite und Höhe in km; etwa fünfmal so lang wie ein echter Zug (halbiert am
 *  2026-10-06, Michael: «halb so gross»), sonst wäre er
 *  auf dem Gelände kaum zu sehen. Darum steht «Zug nicht massstäblich» dabei. Kein bestimmter Zugtyp. */
/** Lok, vier Wagen und am Schluss ein Steuerwagen mit derselben schrägen Form, ohne Rot (Michael, 2026-10-08) */
const ZUG_LOK_M = 140, ZUG_WAGEN_M = 140, ZUG_WAGEN = 5, ZUG_LUECKE_M = 8
const ZUG_BREITE = 0.045, ZUG_HOEHE = 0.05
/** in diesem Abstand der Kamera (km) hat der Zug seine Grundgrösse; näher kleiner, weiter weg grösser */
const ZUG_NORMAL_KM = 6
/** beim Fahren (Fahrt und Probefahrt) ist der Zug grösser (Michael, 2026-10-07: «bei der Fahrt Live … 150 %») */
const ZUG_FAHRT_FAKTOR = 1.5
/** so stark neigt sich ein Wagen höchstens (im überhöhten Gelände wären es sonst Rampen) */
const ZUG_NEIGUNG_MAX = 0.12
/** Höhe der Linie: alle HOEHE_SCHRITT_M aus dem Gelände, gemittelt über GLAETTEN_M davor und danach */
const HOEHE_SCHRITT_M = 50, GLAETTEN_M = 400
/** Wagen hell, Fensterband, Fahrwerk und Übergänge dunkel, der Kopf karminrot */
const ZUG_HELL = '#dcdcdc', ZUG_DUNKEL = '#2e2e2e'
/** so lange dauert die Probefahrt in der Brille über die ganze Bergstrecke, dann beginnt sie von vorn */
const PROBE_DAUER_S = 150
/** so nah (km) an der Kamera erscheinen die Namen der Kulturgüter */
const NAH_KULTUR = 9

const FARBEN = {
  linie: '#a8102e', weg: '#6e6e6e', tunnel: '#212121', bruecke: '#b45309', bahnhof: '#1e3a8a', gipfel: '#5b3a1e', zug: '#a8102e',
}

function useRelief(name: string | null) {
  const [daten, setDaten] = useState<{ r: Relief; h: Uint16Array } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => {
    if (!name) return
    holen<Relief>(`data/relief/${name}.json`)
      .then(async (r) => setDaten({ r, h: (await ausschnittLaden(r.raster)).h }))
      .catch((e: Error) => setFehler(e.message))
  }, [name])
  return { daten, fehler }
}

/** Was die Karten sonst zeigen, auch im Relief (Michael, 2026-10-06: «die Elemente wie bei anderen
 *  Probefahrten ein- und ausblenden»): Kulturgüter, Seilbahnen, Gebiete, Wald und Siedlung. Fehlt
 *  eine Datei, bleibt das Relief ohne sie. */
interface Zusatz { s: SehenswertDaten | null; f: FlaechenDaten | null; b: BodenbedeckungDaten | null; seen: SeenDaten | null }

let zusatzLaeuft: Promise<Zusatz> | null = null
let zusatzFertig: Zusatz | null = null
function useZusatz() {
  const [z, setZ] = useState<Zusatz | null>(zusatzFertig)
  useEffect(() => {
    if (zusatzFertig) return
    let ab = false
    zusatzLaeuft ??= Promise.all([sehenswertLaden().catch(() => null), flaechenLaden().catch(() => null),
      bodenbedeckungLaden().catch(() => null), seenLaden().catch(() => null)])
      .then(([s, f, b, seen]) => (zusatzFertig = { s, f, b, seen }))
    void zusatzLaeuft.then((x) => { if (!ab) setZ(x) })
    return () => { ab = true }
  }, [])
  return z
}

/** Breite und Länge eines kodierten Zugs (Hunderttausendstel, als Differenzen) */
function zugLesen(z: KodierterZug, faktor = 1e5): Array<[number, number]> {
  let [la, lo] = z.start
  const raus: Array<[number, number]> = [lv95(la / faktor, lo / faktor)]
  for (let i = 0; i < z.d.length; i += 2) {
    la += z.d[i]; lo += z.d[i + 1]
    raus.push(lv95(la / faktor, lo / faktor))
  }
  return raus
}

/** Ein Ring, abgeschnitten am Rechteck (Sutherland-Hodgman); eck im Uhrzeigersinn in Ost, Nord */
function zugInRahmen(ring: Array<[number, number]>, eck: Array<[number, number]>) {
  let aus = ring
  for (let k = 0; k < 4 && aus.length; k++) {
    const [ax, ay] = eck[k], [bx, by] = eck[(k + 1) % 4]
    const innen = ([x, y]: [number, number]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax) <= 0
    const schnitt = (p: [number, number], q: [number, number]): [number, number] => {
      const d1 = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax), d2 = (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax)
      const t = d1 / ((d1 - d2) || 1)
      return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]
    }
    const ein = aus
    aus = []
    ein.forEach((p, i) => {
      const q = ein[(i + 1) % ein.length]
      if (innen(p)) { aus.push(p); if (!innen(q)) aus.push(schnitt(p, q)) }
      else if (innen(q)) aus.push(schnitt(p, q))
    })
  }
  return aus
}

/** Flächen in Landeskoordinaten mit ihrem Rahmen, einmal entpackt für alle Ausschnitte
 *  (beim Fahren wandert der Ausschnitt mit, Wald und Siedlung sind 4 MB) */
interface Ring { pts: Array<[number, number]>; e0: number; e1: number; n0: number; n1: number }
interface Auflage { wald: Array<Array<[number, number]>>; siedlung: Array<Array<[number, number]>>; gebiete: Array<{ art: string; ringe: Array<Array<[number, number]>> }> }
let entpackt: { z: Zusatz; wald: Ring[]; siedlung: Ring[]; gebiete: Array<{ art: string; ringe: Ring[] }> } | null = null
function ringLesen(x: KodierterZug, faktor?: number): Ring {
  const pts = zugLesen(x, faktor)
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity
  for (const [e, n] of pts) { e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, n); n1 = Math.max(n1, n) }
  return { pts, e0, e1, n0, n1 }
}
function auflageFuer(r: Relief, z: Zusatz): Auflage {
  if (entpackt?.z !== z) {
    entpackt = {
      z,
      wald: z.b ? z.b.wald.map((x) => ringLesen(x, z.b!.faktor)) : [],
      siedlung: z.b ? z.b.siedlung.map((x) => ringLesen(x, z.b!.faktor)) : [],
      gebiete: (z.f?.flaechen ?? []).map((g) => ({ art: g.art, ringe: g.ringe.map((x) => ringLesen(x)) })),
    }
  }
  const { ost, nord, m, breite, hoehe } = r.raster
  const drin = (q: Ring) => q.e1 >= ost && q.e0 <= ost + breite * m && q.n1 >= nord - hoehe * m && q.n0 <= nord
  const ringe = (qs: Ring[]) => qs.filter(drin).map((q) => q.pts)
  return {
    wald: ringe(entpackt.wald),
    siedlung: ringe(entpackt.siedlung),
    gebiete: entpackt.gebiete.map((g) => ({ art: g.art, ringe: ringe(g.ringe) })).filter((g) => g.ringe.length),
  }
}

/* ---------- die eigene Seite ---------- */

export default function ReliefSeite({ name, vonLinie = false }: { name: string; vonLinie?: boolean }) {
  const { daten, fehler } = useRelief(name)
  const [faktor, setFaktor] = useState<1 | 2>(1)
  const weg = useMemo(() => (daten ? wegDerLinie(daten.r) : null), [daten])
  // in der Brille (Michael, 2026-10-06: «Quest 3»): nur, wo der Browser WebXR kann
  const brille = useRef<(() => Promise<void>) | null>(null)
  const fahrknopf = useRef<Fahrknopf | null>(null)
  const fuehrerstand = useRef(false)
  const [brilleFehler, setBrilleFehler] = useState<string | null>(null)
  // Probefahrt in der Brille (Michael, 2026-10-06: «Fährt der Zug auf der Brille?»): Startzeit oder null
  const probe = useRef<number | null>(null)
  // die Stelle des Zugs bei der Probefahrt, von der Szene nachgeführt, für das Zuggeräusch
  const probeStelle = useRef<number | null>(null)
  const audio = useZuggeraeusch(probeStelle, weg ? weg.punkte[weg.punkte.length - 1].m : Infinity, useMemo(() => weg?.bauwerke ?? [], [weg]),
                                true, weg ? weg.punkte[0].m : 0)
  // in der Brille steht der Zug am Anfang bereit, A startet ihn (Michael, 2026-10-08: ein Knopf statt zwei)
  const inBrille = () => {
    setBrilleFehler(null)
    probe.current = performance.now()
    brille.current?.().catch((e: Error) => setBrilleFehler(e.message))
  }

  return (
    <div className="px-4 pb-4">
      {/* die Bergstrecken als Modell gehören zur Modellbahn (Michael, 2026-10-08) */}
      {/* zurück dorthin, woher man kam: zur Linie oder zur Modellbahn (Michael, 2026-10-08) */}
      {vonLinie && daten
        ? <Zurueck onClick={() => { window.location.hash = `#/linie/${daten.r.linie}` }} text={`Linie ${daten.r.linie}`} />
        : <Zurueck onClick={() => { window.location.hash = '#/modellbahn' }} text="Modellbahn" />}
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{daten?.r.titel ?? 'Bergstrecke'} als Modell</h1>
      {daten && (
        <p className="mt-1 text-sm text-sbb-metal dark:text-sbb-storm">
          {(daten.r.teile ?? [daten.r]).map((t) => `Linie ${t.linie} ${t.linie_name}, Kilometer ${t.von_km.toLocaleString('de-CH')} bis ${t.bis_km.toLocaleString('de-CH')}`).join('; dann ')}
        </p>
      )}
      {fehler && <Ladefehler className="mt-6" was="Das Relief konnte nicht geladen werden." fehler={fehler} />}
      {!daten && !fehler && <p className="mt-6 text-sbb-metal">Das Relief wird geladen …</p>}
      {daten && weg && (
        <>
          <div className="mt-4"><FaktorWahl faktor={faktor} setFaktor={setFaktor} /></div>
          <Szene r={daten.r} h={daten.h} faktor={faktor} weg={weg} wegFarbe={FARBEN.weg} brille={brille}
                 probe={probe} probeStelle={probeStelle} fahrknopf={fahrknopf} fuehrerstand={fuehrerstand}
                 className="mt-3 w-full overflow-hidden rounded-lg" />
          {/* der lange Hinweis steht eine Ebene weiter vorn, auf der Seite Modellbahn (Michael, 2026-10-09) */}
          <p className="mt-3 text-sm">
            Ein Modell, kein Abbild der Wirklichkeit: Zug, Gleise und Masten sind nicht massstäblich.{' '}
            <a href="#/modellbahn" className="underline underline-offset-2">Was nicht stimmt</a> (unten auf der Seite Modellbahn)
          </p>
          <ModellKnoepfe fahrknopf={fahrknopf} fuehrerstand={fuehrerstand} audio={audio} inBrille={inBrille} brilleFehler={brilleFehler} />
          <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
            Namen, die sich überdecken würden, erscheinen beim Heranzoomen.
            {faktor === 2 && <span className="font-medium text-sbb-black dark:text-sbb-white"> Die Höhe ist 2-fach überhöht.</span>}
          </p>
          <Legende wegText="Linie" wegFarbe={FARBEN.weg} />
          <div className="mt-2"><SehenswertLegende gebieteMitBoden kmNetz /></div>
          <Hinweise r={daten.r} />
        </>
      )}
    </div>
  )
}

/**
 * Zuggeräusch (src/audio.ts): das Tempo aus der Stelle des Zugs über die Zeit, geglättet, vorwärts wie rückwärts
 * (in der Brille fährt der Zug auch zurück). Kommt 1,5 s nichts Neues, steht der Zug; springt die Stelle gegen die
 * Fahrtrichtung weit (die Fahrt beginnt von vorn), fährt er neu an. Vor dem Ziel (ende, rückwärts anfang) klingt es aus.
 */
function useZuggeraeusch(stelle: React.RefObject<number | null>, ende: number, bauwerke: Weg['bauwerke'], aktiv = true,
                         anfang = 0) {
  const audio = useAudio()
  useEffect(() => {
    if (!aktiv) return
    let alt = { s: stelle.current, t: performance.now() }, v = 0, richtung = 1
    const uhr = window.setInterval(() => {
      const s = stelle.current, t = performance.now()
      let neu = false
      if (s !== alt.s) {
        if (s !== null && alt.s !== null) {
          const ds = s - alt.s, dt = (t - alt.t) / 1000, jetzt = Math.abs(ds) / dt
          // ein weiter Sprung gegen die bisherige Richtung: die Fahrt beginnt von vorn
          if (v > 0 && Math.sign(ds) !== richtung && jetzt > 5 * v + 2000) { v = 0; neu = true }
          else { v = v ? v * 0.6 + 0.4 * jetzt : jetzt; richtung = ds >= 0 ? 1 : -1 }
        } else { v = 0; neu = true }
        alt = { s, t }
      } else if (t - alt.t > 1500) v = 0
      const ort = s === null ? null : bauwerke.find((b) => s >= b.von && s <= b.bis)?.art ?? null
      const rest = s === null ? Infinity : richtung > 0 ? ende - s : s - anfang
      zuggeraeuschTempo(neu ? 0 : v, v > 0 ? Math.max(0, rest) / v : Infinity, ort)
    }, 250)
    return () => { window.clearInterval(uhr); zuggeraeuschAus() }
  }, [stelle, ende, bauwerke, aktiv, anfang])
  return audio
}

/** Zuggeräusch ein und aus als Lautsprecher (Michael, 2026-10-08: «ein Icon … eindeutig, ob ein- oder ausgeschaltet»):
 *  an mit Schallwellen, weiss auf Anthrazit wie ein gewählter Knopf; aus mit Kreuz, dunkel auf Weiss */
function GeraeuschKnopf({ audio, className }: { audio: ReturnType<typeof useAudio>; className: string }) {
  const an = audio.zuggeraeusch && audio.an
  const text = !audio.an ? 'Zuggeräusch: die Töne sind in den Einstellungen unter Audio aus'
    : an ? 'Zuggeräusch ist an, ausschalten' : 'Zuggeräusch ist aus, einschalten'
  return (
    <button type="button" aria-pressed={an} disabled={!audio.an} aria-label={text} title={text}
            onClick={() => { void audioKontext()?.resume(); audioSetzen({ zuggeraeusch: !audio.zuggeraeusch }) }}
            className={`inline-flex items-center justify-center rounded-lg disabled:opacity-50 ${an
              ? 'bg-sbb-anthracite text-white' : 'border border-sbb-cloud bg-white/90 text-sbb-black dark:border-sbb-iron dark:bg-sbb-midnight/90 dark:text-sbb-white'} ${className}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
           strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
        {an ? (
          <>
            <path d="M15.5 9a4 4 0 0 1 0 6" />
            <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
          </>
        ) : (
          <path d="M15.5 9.5l5 5m0-5l-5 5" />
        )}
      </svg>
    </button>
  )
}


/** im Modell der ganzen Strecke nur ein Band links und rechts (Michael, 2026-10-08: erst «5 km je Seite», dann «noch
 *  vertretbar erweitern»): so breit, dass das Band etwa BAND_FLAECHE_M2 deckt wie das Modell der Gotthard-Bergstrecke,
 *  das auf der Quest flüssig läuft, aber mindestens 5 und höchstens 15 km; höchstens so viele Felder, sonst gröber */
const BAND_MIN_M = 5000, BAND_MAX_M = 15_000, BAND_FLAECHE_M2 = 2e9
const bandBreite = (laengeM: number) =>
  Math.round(Math.min(BAND_MAX_M, Math.max(BAND_MIN_M, BAND_FLAECHE_M2 / (2 * Math.max(1, laengeM)))) / 500) * 500
const BAND_FELDER = 3_000_000

/**
 * Die ganze Strecke einer Fahrt als Modell für die Brille (Michael, 2026-10-08: «diese Probefahrt auf die Brille
 * projizieren»): das Gelände aus den Kacheln im Rechteck um den Weg, bei langen Strecken gröber gemittelt, sonst wie
 * die Bergstrecken: «Mit VR-Brille» und die Probefahrt mit A, B, X und Y.
 */
export function ModellStrecke({ fahrweg, objekte }: { fahrweg: Fahrweg; objekte: FahrObjekt[] }) {
  const [daten, setDaten] = useState<{ r: Relief; h: Uint16Array } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const brille = useRef<(() => Promise<void>) | null>(null)
  const [brilleFehler, setBrilleFehler] = useState<string | null>(null)
  const probe = useRef<number | null>(null)
  const probeStelle = useRef<number | null>(null)
  const fahrknopf = useRef<Fahrknopf | null>(null)
  const fuehrerstand = useRef(false)
  const BAND_M = useMemo(() => bandBreite(wegEnde(fahrweg)), [fahrweg])
  useEffect(() => {
    let ab = false
    // Punkte auf dem Weg etwa alle 500 m; um jeden ein Kreis von BAND_M ergibt das Band
    const lagen: Array<[number, number]> = []
    let laenge = 0
    const pk = fahrweg.punkte
    for (let i = 0; i < pk.length; i++) {
      const [e, n] = lv95(pk[i].lat, pk[i].lon)
      if (i) {
        const [ea, na] = lagen[lagen.length - 1], d = Math.hypot(e - ea, n - na)
        laenge += d
        for (let t = 500; t < d; t += 500) lagen.push([ea + ((e - ea) * t) / d, na + ((n - na) * t) / d])
      }
      lagen.push([e, n])
    }
    let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity
    for (const [e, n] of lagen) { e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, n); n1 = Math.max(n1, n) }
    const m = 50
    const ost = Math.floor((e0 - BAND_M) / m) * m, nord = Math.ceil((n1 + BAND_M) / m) * m
    const breite = Math.ceil((e1 + BAND_M - ost) / m), hoehe = Math.ceil((nord - n0 + BAND_M) / m)
    // nur die Kacheln, die das Band berühren
    const schritte: number[] = []
    for (let d = -BAND_M; d < BAND_M; d += 5000) schritte.push(d)
    schritte.push(BAND_M)
    const kacheln = new Set<string>()
    for (const [e, n] of lagen) {
      // in Schritten von 5 km bis zum Rand, damit bei breitem Band keine Kachel dazwischen fehlt
      for (const de of schritte) for (const dn of schritte) kacheln.add(`${Math.floor((e + de) / 10_000)}_${Math.floor((n + dn) / 10_000)}`)
    }
    // so fein, wie das Band es zulässt: seine Fläche etwa Länge mal Breite
    const flaecheM2 = Math.min(breite * hoehe * m * m, laenge * 2 * BAND_M + Math.PI * BAND_M * BAND_M)
    const k = Math.max(1, Math.ceil(Math.sqrt(flaecheM2 / (m * m) / BAND_FELDER)))
    void Promise.all([ausschnittLaden({ ost, nord, m, breite, hoehe }, kacheln), streckenLaden(), sehenswertLaden().catch(() => null)])
      .then(([f, netz, sw]) => {
        if (ab) return
        const b2 = Math.floor(breite / k), h2 = Math.floor(hoehe / k), mitte = Math.floor(k / 2), m2 = m * k
        const h = new Uint16Array(b2 * h2)
        // das Band: um jeden Punkt des Wegs ein Kreis, Feld für Feld
        const im = new Uint8Array(b2 * h2), rz = Math.ceil(BAND_M / m2)
        for (const [e, n] of lagen) {
          const ci = Math.floor((e - ost) / m2), cj = Math.floor((nord - n) / m2)
          for (let dj = -rz; dj <= rz; dj++) {
            const j = cj + dj
            if (j < 0 || j >= h2) continue
            const w = Math.floor(Math.sqrt(rz * rz - dj * dj))
            for (let i = Math.max(0, ci - w); i <= Math.min(b2 - 1, ci + w); i++) im[j * b2 + i] = 1
          }
        }
        for (let j = 0; j < h2; j++) {
          for (let i = 0; i < b2; i++) if (im[j * b2 + i]) h[j * b2 + i] = f.h[(j * k + mitte) * breite + i * k + mitte]
        }
        const raster = { ost, nord, m: m2, breite: b2, hoehe: h2 }
        const innen = (e: number, n: number) => {
          const i = Math.floor((e - ost) / m2), j = Math.floor((nord - n) / m2)
          return i >= 0 && j >= 0 && i < b2 && j < h2 && im[j * b2 + i] === 1
        }
        const bahnhoefe = objekte.filter((o) => o.art === 'bahnhof').flatMap((o, i) => {
          const lage = lageAufWeg(fahrweg, o.sOrt ?? o.s)
          return innen(...lage) ? [{ uic: i, name: netz.punkte[o.kennung] ?? o.kennung, km: (o.sOrt ?? o.s) / 1000, lage }] : []
        })
        const gipfel = (sw?.gipfel ?? []).flatMap((g) => {
          const lage = lv95(g.lage[0], g.lage[1])
          return innen(...lage) ? [{ name: g.name, hoehe_m: g.hoehe_m, lage }] : []
        })
        setDaten({
          r: { titel: 'Strecke', linie: '', linie_name: '', von_km: 0, bis_km: 0, datenstand: '', quellen: [f.quelle],
               raster, weg: [], bahnhoefe, tunnel: [], bruecken: [], gipfel, kacheln, innen },
          h,
        })
      })
      .catch((e: Error) => { if (!ab) setFehler(e.message) })
    return () => { ab = true }
  }, [fahrweg, objekte, BAND_M])
  const weg = useMemo(() => (daten ? wegDerFahrt(daten.r, fahrweg, objekte) : null), [daten, fahrweg, objekte])
  const audio = useZuggeraeusch(probeStelle, useMemo(() => wegEnde(fahrweg), [fahrweg]), useMemo(() => weg?.bauwerke ?? [], [weg]),
                                true, fahrweg.punkte[0]?.s ?? 0)
  // in der Brille steht der Zug am Anfang bereit, A startet ihn (Michael, 2026-10-08: ein Knopf statt zwei)
  const inBrille = () => {
    setBrilleFehler(null)
    probe.current = performance.now()
    brille.current?.().catch((e: Error) => setBrilleFehler(e.message))
  }
  const feldM = daten?.r.raster.m
  return (
    <div>
      {fehler && <Ladefehler className="mt-3" was="Das Gelände konnte nicht geladen werden." fehler={fehler} />}
      {!daten && !fehler && <p className="mt-3 text-sm text-sbb-metal">Das Gelände entlang der ganzen Strecke wird geladen …</p>}
      {daten && weg && (
        <>
          <Szene r={daten.r} h={daten.h} faktor={1} weg={weg} wegFarbe={FARBEN.weg} brille={brille}
                 probe={probe} probeStelle={probeStelle} fahrknopf={fahrknopf} fuehrerstand={fuehrerstand}
                 className="mt-3 w-full overflow-hidden rounded-lg" />
          {/* der lange Hinweis steht eine Ebene weiter vorn, auf der Seite Modellbahn (Michael, 2026-10-09) */}
          <p className="mt-3 text-sm">
            Ein Modell, kein Abbild der Wirklichkeit: Zug, Gleise und Masten sind nicht massstäblich.{' '}
            <a href="#/modellbahn" className="underline underline-offset-2">Was nicht stimmt</a> (unten auf der Seite Modellbahn)
          </p>
          <ModellKnoepfe fahrknopf={fahrknopf} fuehrerstand={fuehrerstand} audio={audio} inBrille={inBrille} brilleFehler={brilleFehler} />
          <p className="mt-2 text-xs text-sbb-metal dark:text-sbb-storm">
            Die ganze Strecke als Modell, mit einem Band von {(BAND_M / 1000).toLocaleString('de-CH').replace('.', ',')} km links und rechts der Strecke; was weiter weg
            liegt, fehlt. Gelände aus swissALTIRegio (swisstopo){feldM && feldM > 50 ? `, für diese Strecke auf ${feldM.toLocaleString('de-CH')} m vergröbert` : ', auf 50 m gemittelt'};
            wo vorhanden mit Luftbild SWISSIMAGE (swisstopo), verkleinert. Im Führerstand nah am Zug Gelände aus swissALTI3D
            (swisstopo) auf 10 m und das Luftbild bis 500 m neben den Bahnlinien auf 2,5 m.
          </p>
        </>
      )}
    </div>
  )
}

interface Fahrknopf { los: () => void; halt: () => void }


/** Unter dem Modell: «Mit VR-Brille», der Zug auf dem Bildschirm und das Zuggeräusch (Michael, 2026-10-08: Modellbahn
 *  für alle; der Knopf zur Brille steht immer da, ohne Brille geht er einfach nicht und sagt, was es dafür braucht) */
function ModellKnoepfe({ fahrknopf, fuehrerstand, audio, inBrille, brilleFehler }: {
  fahrknopf: React.RefObject<Fahrknopf | null>
  fuehrerstand: React.MutableRefObject<boolean>
  audio: ReturnType<typeof useZuggeraeusch>
  inBrille: () => void
  brilleFehler: string | null
}) {
  const xr = useBrilleMoeglich()
  const [ohne, setOhne] = useState(false)
  const [vorne, setVorne] = useState(false)
  const weiss = 'rounded-lg border border-sbb-cloud bg-white px-4 py-2 font-bold dark:border-sbb-iron dark:bg-sbb-midnight'
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg bg-sbb-red px-4 py-2 font-bold text-white"
                onClick={() => (xr ? inBrille() : setOhne(true))}>
          Mit VR-Brille
        </button>
        <button type="button" className={weiss} onClick={() => fahrknopf.current?.los()}>
          Zug fahren
        </button>
        <button type="button" className={weiss} onClick={() => fahrknopf.current?.halt()}>Anhalten</button>
        {/* Michael, 2026-10-10: «eine Perspektive aus dem Führerraum»; ein zweiter Tipp zurück ins Modell */}
        <button type="button" aria-pressed={vorne} className={`${weiss} ${vorne ? '!bg-sbb-anthracite !text-white' : ''}`}
                onClick={() => { fuehrerstand.current = !vorne; setVorne(!vorne); if (!vorne) fahrknopf.current?.los() }}>
          Führerstand
        </button>
        <GeraeuschKnopf audio={audio} className="h-10 w-12" />
      </div>
      {brilleFehler && <p className="mt-1 text-sm">Die Brille liess sich nicht starten: {brilleFehler}</p>}
      {!xr && ohne && (
        <p className="mt-2 text-sm font-medium" role="status">
          Auf diesem Gerät ist keine VR-Brille zu finden. Mit einer VR-Brille wie der Meta Quest 3 steht das Modell in
          deinem Raum auf dem Tisch; du siehst deine Umgebung, wo die Brille es kann, und lässt den Zug mit den Controllern
          fahren. Öffne dafür Taktland im Browser der Brille.
        </p>
      )}
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        «Zug fahren» schickt einen Zug in {(PROBE_DAUER_S / 60).toLocaleString('de-CH')} Minuten über die ganze Strecke,
        ein Zeitraffer, kein Fahrplan. Drehen mit einem Finger, zoomen mit zwei, verschieben mit zwei Fingern oder der
        rechten Maustaste.
        {xr && <> In der Brille steht das Modell etwa {BRILLE_BREITE_M.toLocaleString('de-CH')} m breit auf Tischhöhe: ein
          Abzug trägt es, beide ziehen es grösser oder kleiner und drehen es, der Thumbstick dreht und hebt es, die rechte Greiftaste
          stellt es zurück, die linke schaltet das Zuggeräusch ein und aus. Der Zug wartet am Anfang, A startet, B hält an, X langsamer, Y schneller.</>}
      </p>
    </>
  )
}

function FaktorWahl({ faktor, setFaktor, klein = false }: { faktor: 1 | 2; setFaktor: (f: 1 | 2) => void; klein?: boolean }) {
  return (
    <div className="segmente inline-grid grid-cols-2" role="radiogroup" aria-label="Höhe">
      {([1, 2] as const).map((f) => (
        <button key={f} type="button" aria-pressed={faktor === f} onClick={() => setFaktor(f)}
                className={`segment ${klein ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}>{f === 1 ? 'Höhe wie echt' : 'Höhe 2-fach'}</button>
      ))}
    </div>
  )
}

function Legende({ wegText, wegFarbe, zug = false }: { wegText: string; wegFarbe: string; zug?: boolean }) {
  const dunkel = window.matchMedia('(prefers-color-scheme: dark)').matches
  // im Dunkeln heller, sonst verschwindet der Strich auf dem schwarzen Grund
  const hell = (f: string) => (dunkel && f === '#212121' ? '#b5b5b5' : f)
  const strich = (farbe: string, gestrichelt = false) => (
    <span aria-hidden="true" className="inline-block h-1 w-6 rounded"
          style={{ background: gestrichelt ? `repeating-linear-gradient(90deg, ${hell(farbe)} 0 5px, transparent 5px 8px)` : hell(farbe) }} />
  )
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {zug && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-full" style={{ background: FARBEN.zug }} /> Zug</li>}
      <li className="flex items-center gap-1.5">{strich(wegFarbe)} {wegText}</li>
      <li className="flex items-center gap-1.5">{strich(FARBEN.tunnel, true)} Tunnel</li>
      <li className="flex items-center gap-1.5">{strich(FARBEN.bruecke)} Brücke</li>
      <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: FARBEN.bahnhof }} /> Bahnhof</li>
      <li className="flex items-center gap-1.5"><span aria-hidden="true" style={{ color: FARBEN.gipfel }}>▲</span> Gipfel</li>
    </ul>
  )
}

function Hinweise({ r }: { r: Relief }) {
  const ohneEnde = r.tunnel.filter((t) => t.von_km === undefined)
  const [jahre, setJahre] = useState<number[] | null>(null)
  useEffect(() => { void luftbildLaden(r.raster).then((l) => setJahre(l?.jahre ?? null)) }, [r])
  return (
    <div className="mt-4 space-y-2 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
      {jahre && (
        <p>
          Luftbild: SWISSIMAGE (swisstopo), auf 10 m gemittelt, bis 500 m neben den Bahnlinien auf 2,5 m, aufgenommen {jahre.length > 1 ? `${jahre[0]} bis ${jahre[jahre.length - 1]}` : jahre[0]};
          je Kilometer die neueste Aufnahme. Was darauf zu sehen ist, zeigt den Stand der Aufnahme, nicht heute.
        </p>
      )}
      <p>
        Im Führerstand nah am Zug Gelände aus swissALTI3D (swisstopo), auf 10 m gemittelt, wo es bis 500 m neben einer Bahnlinie liegt.
      </p>
      <p>
        Die Höhe der Gleise steht in keiner Quelle. Die Linie ist darum auf das Gelände gelegt, etwas darüber;
        in Tunneln und auf Brücken gerade zwischen ihren beiden Enden. Das zeigt den Verlauf, nicht die
        Höhe der Gleise. Das Gelände ist auf {r.raster.m} m gemittelt; Felsen, Einschnitte und Mauern sind
        darin nicht zu sehen.
      </p>
      {ohneEnde.length > 0 && (
        <p>
          Wo ein Tunnel anfängt und endet, geben die Daten nicht bei allen her. Diese stehen als Punkt beim
          Kilometer der SBB: {ohneEnde.map((t) => t.name ?? 'ohne Namen').join(', ')}.
        </p>
      )}
      {r.hinweis && <p>{r.hinweis} Galerien sind wie Tunnel gezeichnet.</p>}
      <p>Brücken nur, wo Anfang und Ende bekannt sind. Gipfel nur aus Swiss Map Vector 1000.</p>
      <p>Seen aus swissTLMRegio (swisstopo) wie auf den Karten, Seen unter 0,1 km² fehlen; flach gezeichnet auf der
        mittleren Höhe ihres Ufers im Gelände, nicht auf einem gemessenen Seespiegel.</p>
      <p>Kulturgüter von nationaler Bedeutung (BABS), Seilbahnen mit Bundeskonzession (BAV), Gebiete (BAFU), Wald und
        Siedlung (swissTLMRegio) wie auf den Karten. Seilbahnen sind gerade von Station zu Station gezogen; wie hoch
        das Seil hängt, steht in keiner Quelle. Das Kilometernetz folgt den Landeskoordinaten (LV95), eine Linie je
        Kilometer, kräftiger alle 10 km.</p>
      <p>Quellen: {r.quellen.join('; ')}. Datenstand der Linie {r.datenstand.split('-').map(Number).reverse().join('.')}.</p>
    </div>
  )
}

/** Die Linie des Reliefs als Weg, Meter der Kilometrierung */
function wegDerLinie(r: Relief): Weg {
  return {
    punkte: r.weg.map(([m, e, n]) => ({ m, e, n })),
    bauwerke: [
      ...r.tunnel.filter((t) => t.von_km !== undefined).map((t) => ({ von: t.von_km! * 1000, bis: t.bis_km! * 1000, art: 'tunnel' as const })),
      ...r.bruecken.map((b) => ({ von: b.von_km * 1000, bis: b.bis_km * 1000, art: 'bruecke' as const })),
    ],
    tunnelPunkte: r.tunnel.filter((t) => t.von_km === undefined).map((t) => t.km * 1000),
    stuecke: [[r.weg[0][0], r.weg[r.weg.length - 1][0]]],
  }
}

/* ---------- beim Fahren ---------- */

/** Der Weg einer Fahrt im Ausschnitt des Reliefs, Meter entlang des Wegs */
function wegDerFahrt(r: Relief, fahrweg: Fahrweg, objekte: FahrObjekt[]): Weg {
  const { ost, nord, m, breite, hoehe } = r.raster
  const drin = (e: number, n: number) => e >= ost && e <= ost + breite * m && n <= nord && n >= nord - hoehe * m
  const punkte = fahrweg.punkte.map((p) => { const [e, n] = lv95(p.lat, p.lon); return { m: p.s, e, n } })
  // zusammenhängende Stücke im Ausschnitt
  const stuecke: Array<[number, number]> = []
  let anfang: number | null = null
  punkte.forEach((p, i) => {
    if (drin(p.e, p.n)) { anfang ??= p.m }
    else if (anfang !== null) { stuecke.push([anfang, punkte[i - 1].m]); anfang = null }
  })
  if (anfang !== null) stuecke.push([anfang, punkte[punkte.length - 1].m])
  return {
    punkte,
    bauwerke: objekte.filter((o) => (o.art === 'tunnel' || o.art === 'bruecke') && o.sAus !== null)
      .map((o) => ({ von: o.s, bis: o.sAus!, art: o.art as 'tunnel' | 'bruecke' })),
    tunnelPunkte: objekte.filter((o) => o.art === 'tunnel' && o.sAus === null).map((o) => o.s),
    stuecke,
  }
}

/** Seite des Ausschnitts beim Fahren, und wie weit der Zug von seiner Mitte weg sein darf */
const FENSTER_M = 30_000
const WANDERN_M = 12_000
/** die Mitte des Fensters liegt so weit vor dem Zug: hinter ihm sieht man ohnehin wenig, und er bleibt länger im
 *  selben Fenster, bevor es neu gebaut wird (Michael, 2026-10-08: bei hohem Tempo «nicht schnell genug nachgebaut») */
const VORLAUF_M = 7_000

/** Stelle auf dem Weg in Landeskoordinaten */
function lageAufWeg(fahrweg: Fahrweg, s: number): [number, number] {
  const pk = fahrweg.punkte
  let lo = 0, hi = pk.length - 1
  while (lo < hi) { const mid = (lo + hi) >> 1; if (pk[mid].s < s) lo = mid + 1; else hi = mid }
  const b = pk[lo], a = pk[Math.max(0, lo - 1)]
  const t = Math.max(0, Math.min(1, (s - a.s) / ((b.s - a.s) || 1)))
  return lv95(a.lat + t * (b.lat - a.lat), a.lon + t * (b.lon - a.lon))
}

/**
 * «3D» auf jeder Fahrt und Probefahrt (Michael, 2026-10-06: «dass man alle Strecken optional 3D
 * darstellen könnte»): ein Ausschnitt von 30 km aus den Geländekacheln um den Zug, der mitwandert,
 * sobald der Zug 8 km von seiner Mitte weg ist. Der Blick der Kamera bleibt dabei, wie er war.
 */
export function GelaendeFahrt({ fahrweg, objekte, sJetzt, className }: {
  fahrweg: Fahrweg; objekte: FahrObjekt[]; sJetzt: number | null; className: string
}) {
  const [faktor, setFaktor] = useState<1 | 2>(1)
  const [mitte, setMitte] = useState<[number, number] | null>(null)
  const [daten, setDaten] = useState<{ r: Relief; h: Uint16Array } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const zug = useRef<number | null>(sJetzt)
  const blick = useRef<THREE.Vector3 | null>(null)
  useEffect(() => { zug.current = sJetzt }, [sJetzt])
  const ende = useMemo(() => wegEnde(fahrweg), [fahrweg])
  const bauwerke = useMemo(() => objekte.filter((o) => (o.art === 'tunnel' || o.art === 'bruecke') && o.sAus !== null)
    .map((o) => ({ von: o.s, bis: o.sAus!, art: o.art as 'tunnel' | 'bruecke' })), [objekte])
  const audio = useZuggeraeusch(zug, ende, bauwerke)
  // «Hinter den Zug»: die Kamera wieder schräg hinter den Zug wie am Anfang
  const hinterZug = useRef(false)
  // «Führerstand»: die Kamera vorne im Zug (Michael, 2026-10-10)
  const fuehrerstand = useRef(false)
  const [vorne, setVorne] = useState(false)
  // der Ausschnitt wandert mit dem Zug, auf den Kilometer gerundet
  const mitteS = useRef(0)
  useEffect(() => {
    const s = Math.min(ende, (sJetzt ?? 0) + VORLAUF_M)
    const [e, n] = lageAufWeg(fahrweg, s)
    if (!mitte || Math.hypot(e - mitte[0], n - mitte[1]) > WANDERN_M) {
      mitteS.current = s
      setMitte([Math.round(e / 1000) * 1000, Math.round(n / 1000) * 1000])
    }
  }, [fahrweg, sJetzt, mitte, ende])
  useEffect(() => {
    if (!mitte) return
    let ab = false
    void Promise.all([fensterLaden(mitte[0], mitte[1], FENSTER_M), streckenLaden(), sehenswertLaden().catch(() => null)])
      .then(([f, netz, sw]) => {
        if (ab) return
        const { ost, nord, m, breite, hoehe } = f.raster
        const drin = ([e, n]: [number, number]) => e >= ost && e <= ost + breite * m && n <= nord && n >= nord - hoehe * m
        const bahnhoefe = objekte.filter((o) => o.art === 'bahnhof').flatMap((o, i) => {
          const lage = lageAufWeg(fahrweg, o.sOrt ?? o.s)
          return drin(lage) ? [{ uic: i, name: netz.punkte[o.kennung] ?? o.kennung, km: (o.sOrt ?? o.s) / 1000, lage }] : []
        })
        const gipfel = (sw?.gipfel ?? []).flatMap((g) => {
          const lage = lv95(g.lage[0], g.lage[1])
          return drin(lage) ? [{ name: g.name, hoehe_m: g.hoehe_m, lage }] : []
        })
        // das nächste Fenster schon laden, solange der Zug in diesem fährt
        if (mitteS.current < ende) {
          const [e, n] = lageAufWeg(fahrweg, Math.min(ende, mitteS.current + WANDERN_M))
          void fensterVorladen(e, n, FENSTER_M).catch(() => {})
        }
        setDaten({
          r: { titel: 'Gelände', linie: '', linie_name: '', von_km: 0, bis_km: 0, datenstand: '', quellen: [f.quelle],
               raster: f.raster, weg: [], bahnhoefe, tunnel: [], bruecken: [], gipfel },
          h: f.h,
        })
      })
      .catch((e: Error) => { if (!ab) setFehler(e.message) })
    return () => { ab = true }
  }, [mitte, fahrweg, objekte, ende])
  const weg = useMemo(() => (daten ? wegDerFahrt(daten.r, fahrweg, objekte) : null), [daten, fahrweg, objekte])
  if (fehler) return <div className={className}><Ladefehler was="Das Gelände konnte nicht geladen werden." fehler={fehler} /></div>
  if (!daten || !weg) return <div className={`${className} flex items-center justify-center text-sm text-sbb-metal`}>Das Gelände wird geladen …</div>
  return (
    <>
      <div className={`${className} relative`}>
        <Szene r={daten.r} h={daten.h} faktor={faktor} weg={weg} wegFarbe={FARBEN.weg} zug={zug} blick={blick} hinterZug={hinterZug}
               fuehrerstand={fuehrerstand} className="absolute inset-0 overflow-hidden" />
        <div className="absolute left-2 top-2"><FaktorWahl faktor={faktor} setFaktor={setFaktor} klein /></div>
        <GeraeuschKnopf audio={audio} className="absolute right-2 top-2 h-9 w-10" />
        <div className="absolute bottom-2 left-2 flex gap-2">
          <button type="button" onClick={() => { fuehrerstand.current = false; setVorne(false); hinterZug.current = true }}
                  className={KAMERA_KNOPF}>
            Hinter den Zug
          </button>
          <button type="button" aria-pressed={vorne} onClick={() => { fuehrerstand.current = !vorne; setVorne(!vorne) }}
                  className={`${KAMERA_KNOPF} ${vorne ? '!bg-sbb-anthracite !text-white' : ''}`}>
            Führerstand
          </button>
        </div>
      </div>
      {/* die Angaben aufklappbar, sie nahmen beim Fahren viel Platz (Michael, 2026-10-10); sichtbar bleibt, dass
          es ein Modell ist und ob die Höhe überhöht ist */}
      <details className="klapp mt-1 text-xs text-sbb-metal dark:text-sbb-storm">
        <summary className="flex min-h-9 cursor-pointer items-center underline underline-offset-2">
          Modell, nicht massstäblich{faktor === 2 && ', Höhe 2-fach überhöht'}: Quellen und Grenzen
        </summary>
        <p className="mt-1">
          Gelände aus swissALTIRegio (swisstopo), auf 50 m gemittelt, 30 km um den Zug; wo vorhanden mit Luftbild
          SWISSIMAGE (swisstopo), auf 10 m gemittelt, bis 500 m neben den Bahnlinien auf 2,5 m, Stand der Aufnahme. Im Führerstand nah am Zug das
          Gelände aus swissALTI3D (swisstopo), auf 10 m gemittelt, wo es bis 500 m neben einer Bahnlinie liegt. Die Höhe der Gleise steht in
          keiner Quelle; der Weg ist aufs Gelände gelegt, in Tunneln und auf Brücken gerade zwischen den Enden. Tunnel, von denen
          die Quelle nur einen Kilometer kennt und keine Länge, fehlen in 3D; beim Fahren meldet Taktland sie trotzdem. Zug nicht
          massstäblich und kein bestimmter Zugtyp. Das Zuggeräusch ist gerechnet, keine Aufnahme eines Zugs.
        </p>
      </details>
    </>
  )
}

/* ---------- die Zeichnung ---------- */

/** Höhe im Raster bei Ost, Nord, zwischen den Feldern linear */
function hoeheBei(r: Relief, h: Uint16Array, e: number, n: number) {
  const { ost, nord, m, breite, hoehe } = r.raster
  const x = Math.max(0, Math.min(breite - 1.001, (e - ost) / m - 0.5))
  const y = Math.max(0, Math.min(hoehe - 1.001, (nord - n) / m - 0.5))
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  const z = (i: number, j: number) => h[j * breite + i]
  return z(x0, y0) * (1 - fx) * (1 - fy) + z(x0 + 1, y0) * fx * (1 - fy) + z(x0, y0 + 1) * (1 - fx) * fy + z(x0 + 1, y0 + 1) * fx * fy
}

/** Farbe des Geländes nach Höhe, in denselben Stufen wie die Karten (1000, 2000, 3000 m) */
function hoehenFarbe(z: number, c: THREE.Color) {
  const stufen: Array<[number, string]> = [[300, '#cfd8c4'], [1000, '#d8d5c2'], [2000, '#c9c2b4'], [3000, '#e4e2de'], [3600, '#f4f4f4']]
  let i = 0
  while (i < stufen.length - 2 && z > stufen[i + 1][0]) i++
  const [z0, a] = stufen[i], [z1, b] = stufen[i + 1]
  return c.set(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, (z - z0) / (z1 - z0))))
}

function Szene({ r, h, faktor, weg, wegFarbe, zug: zugVonAussen, blick, brille, probe, probeStelle, hinterZug, fuehrerstand, fahrknopf, className }: {
  r: Relief; h: Uint16Array; faktor: 1 | 2; weg: Weg; wegFarbe: string
  /** beim Fahren: die Stelle des Zugs in Metern entlang des Wegs, laufend nachgeführt */
  zug?: React.RefObject<number | null>
  /** beim Fahren: wo die Kamera vom Zug aus steht; bleibt, wenn der Ausschnitt weiterwandert */
  blick?: React.MutableRefObject<THREE.Vector3 | null>
  /** auf der eigenen Seite: hier legt die Szene ab, wie sie in der Brille startet (WebXR) */
  brille?: React.MutableRefObject<(() => Promise<void>) | null>
  /** auf der eigenen Seite: Probefahrt über die ganze Strecke; Startzeit (performance.now) oder null */
  probe?: React.RefObject<number | null>
  /** beim Fahren: true setzt die Kamera wieder schräg hinter den Zug wie am Anfang */
  hinterZug?: React.MutableRefObject<boolean>
  /** true: die Kamera steht vorne im Zug und schaut die Strecke entlang (Michael, 2026-10-10: «Perspektive aus dem Führerraum») */
  fuehrerstand?: React.RefObject<boolean>
  /** auf der eigenen Seite: hier führt die Szene die Stelle des Zugs bei der Probefahrt nach (Zuggeräusch) */
  probeStelle?: React.MutableRefObject<number | null>
  /** Modellbahn auf dem Bildschirm: hier legt die Szene ab, wie der Zug losfährt und anhält */
  fahrknopf?: React.MutableRefObject<Fahrknopf | null>
  className: string
}) {
  const rahmen = useRef<HTMLDivElement>(null)
  // bei der Probefahrt auf der eigenen Seite rechnet die Szene die Stelle des Zugs selbst,
  // in ihrer Schleife: in der Brille läuft keine andere
  const eigenerZugHier = useRef<number | null>(null)
  const eigenerZug = probeStelle ?? eigenerZugHier
  const zug = zugVonAussen ?? (probe ? eigenerZug : undefined)
  const zusatz = useZusatz()
  const [luftbild, setLuftbild] = useState<Luftbild | null>(null)
  useEffect(() => {
    let ab = false
    void luftbildLaden(r.raster, r.kacheln).then((l) => { if (!ab) setLuftbild(l) })
    return () => { ab = true }
  }, [r])
  const aus = useVersteckt()
  const ausJetzt = useRef(aus)
  const anwenden = useRef<((a: Set<Kategorie>) => void) | null>(null)
  // ein- und ausblenden, ohne das Relief neu zu bauen
  useEffect(() => { ausJetzt.current = aus; anwenden.current?.(aus) }, [aus])
  useEffect(() => {
    const el = rahmen.current
    if (!el) return
    const dunkel = window.matchMedia('(prefers-color-scheme: dark)').matches
    const { ost, nord, m, breite, hoehe } = r.raster
    // Mitte des Ausschnitts; eine Einheit ist ein Kilometer
    const me = ost + (breite * m) / 2, mn = nord - (hoehe * m) / 2
    const X = (e: number) => (e - me) / 1000
    const Z = (n: number) => -(n - mn) / 1000
    const Y = (hm: number) => (hm * faktor) / 1000

    const szene = new THREE.Scene()
    szene.background = new THREE.Color(dunkel ? '#141414' : '#f6f6f6')
    const kamera = new THREE.PerspectiveCamera(40, 1, 0.1, 500)
    // durchsichtig, damit die Brille im Passthrough die Umgebung zeigt
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    // für den Zug am Tunnelportal (zugSetzen)
    renderer.localClippingEnabled = true
    renderer.xr.enabled = !!brille
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.touchAction = 'none'
    el.appendChild(renderer.domElement)

    // Gelände als Netz, jedes SCHRITT-te Feld
    const nx = Math.floor((breite - 1) / SCHRITT) + 1, ny = Math.floor((hoehe - 1) / SCHRITT) + 1
    // nur Punkte mit Höhe kommen ins Netz: wo keine Kachel liegt (oder ausserhalb des Bandes um eine ganze
    // Strecke), bleibt das Gelände offen und belegt keinen Speicher
    const nummer = new Int32Array(nx * ny).fill(-1)
    let netzPunkte = 0
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (h[j * SCHRITT * breite + i * SCHRITT] !== KEINE_HOEHE) nummer[j * nx + i] = netzPunkte++
    const pos = new Float32Array(netzPunkte * 3), farben = new Float32Array(netzPunkte * 3), uv = new Float32Array(netzPunkte * 2)
    const c = new THREE.Color()
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = nummer[j * nx + i]
        if (v < 0) continue
        const gi = i * SCHRITT, gj = j * SCHRITT
        const z = h[gj * breite + gi]
        const k = v * 3
        pos[k] = X(ost + (gi + 0.5) * m); pos[k + 1] = Y(z); pos[k + 2] = Z(nord - (gj + 0.5) * m)
        hoehenFarbe(z, c)
        farben[k] = c.r; farben[k + 1] = c.g; farben[k + 2] = c.b
        uv[v * 2] = (gi + 0.5) / breite; uv[v * 2 + 1] = 1 - (gj + 0.5) / hoehe
      }
    }
    let q = 0
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) if (Math.min(nummer[j * nx + i], nummer[j * nx + i + 1], nummer[(j + 1) * nx + i], nummer[(j + 1) * nx + i + 1]) >= 0) q += 6
    const index = new Uint32Array(q)
    q = 0
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = nummer[j * nx + i], b = nummer[j * nx + i + 1], d = nummer[(j + 1) * nx + i], e2 = nummer[(j + 1) * nx + i + 1]
        if (Math.min(a, b, d, e2) < 0) continue
        index[q++] = a; index[q++] = d; index[q++] = b
        index[q++] = b; index[q++] = d; index[q++] = e2
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(farben, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    geo.computeVertexNormals()
    // Auflage auf dem Gelände: Wald, Siedlung, Gebiete und das Kilometernetz, auf eine Leinwand gemalt,
    // die über das Gelände gespannt ist (weiss lässt die Farbe des Geländes, wie sie ist)
    // mit Luftbild feiner, etwa 10 m je Bildpunkt wie das Luftbild selbst
    const PX = (luftbild ? 4096 : 2048) / Math.max(breite, hoehe)
    const leinwand = document.createElement('canvas')
    leinwand.width = Math.round(breite * PX); leinwand.height = Math.round(hoehe * PX)
    const lctx = leinwand.getContext('2d')!
    const lx = (e: number) => ((e - ost) / m) * PX, ly = (n: number) => ((nord - n) / m) * PX
    const grundLeinwand = { ctx: lctx, fx: lx, fy: ly, w: leinwand.width, h: leinwand.height, dicke: 1 }
    const auflageTextur = new THREE.CanvasTexture(leinwand)
    const gelaendeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, map: auflageTextur })
    auflageTextur.colorSpace = THREE.SRGBColorSpace
    auflageTextur.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const auflage = zusatz ? auflageFuer(r, zusatz) : null
    /** auf eine Leinwand: ctx mit fx, fy von Landeskoordinaten in Bildpunkte, dicke für die Breite der Ränder */
    type Malgrund = { ctx: CanvasRenderingContext2D; fx: (e: number) => number; fy: (n: number) => number; w: number; h: number; dicke: number }
    const flaecheMalen = (ringe: Array<Array<[number, number]>>, fuellung: string, rand?: string,
                          { ctx, fx, fy, dicke }: Malgrund = grundLeinwand) => {
      ctx.beginPath()
      for (const ring of ringe) {
        ring.forEach(([e, n], i) => (i ? ctx.lineTo(fx(e), fy(n)) : ctx.moveTo(fx(e), fy(n))))
        ctx.closePath()
      }
      ctx.fillStyle = fuellung; ctx.fill('evenodd')
      if (rand) { ctx.strokeStyle = rand; ctx.lineWidth = 1.5 * dicke; ctx.stroke() }
    }
    const GEBIET: Record<string, [string, string]> = {
      bln: ['rgba(185, 211, 163, 0.35)', '#9dbf84'], park: ['rgba(127, 174, 102, 0.3)', '#6f9e57'], moor: ['rgba(201, 194, 154, 0.4)', '#b0a77a'],
    }
    let grund: HTMLCanvasElement | null = null
    /** die Farben des Geländes, ein Bildpunkt je Feld, abgedunkelt wie das Luftbild aufgehellt wird */
    const grundBild = () => {
      if (grund) return grund
      grund = document.createElement('canvas')
      grund.width = breite; grund.height = hoehe
      const g = grund.getContext('2d')!, bild = g.createImageData(breite, hoehe), rgb = { r: 0, g: 0, b: 0 }
      for (let j = 0; j < hoehe; j++) {
        for (let i = 0; i < breite; i++) {
          hoehenFarbe(h[j * breite + i], c).getRGB(rgb, THREE.SRGBColorSpace)
          const k = (j * breite + i) * 4
          bild.data[k] = (rgb.r * 255) / 1.3; bild.data[k + 1] = (rgb.g * 255) / 1.3; bild.data[k + 2] = (rgb.b * 255) / 1.3; bild.data[k + 3] = 255
        }
      }
      g.putImageData(bild, 0, 0)
      return grund
    }
    const auflageMalen = (a: Set<Kategorie>) => {
      lctx.fillStyle = '#ffffff'
      lctx.fillRect(0, 0, leinwand.width, leinwand.height)
      // das Luftbild ersetzt die Farben des Geländes und zeigt Wald und Siedlung selbst
      const mitBild = !!luftbild && !a.has('luftbild')
      if (mitBild) {
        // darunter die Farben des Geländes: wo ein Bild fehlt oder nicht geladen ist, bleibt es
        // nicht weiss (Michael, 2026-10-07: «Fehlt hier eine Kachel?»)
        lctx.imageSmoothingEnabled = true
        lctx.drawImage(grundBild(), 0, 0, leinwand.width, leinwand.height)
        const seite = (luftbild.kachel_m / m) * PX
        for (const { ex, ny, bild } of luftbild.kacheln) lctx.drawImage(bild, lx(ex * luftbild.kachel_m), ly((ny + 1) * luftbild.kachel_m), seite, seite)
      }
      if (gelaendeMaterial.vertexColors === mitBild) { gelaendeMaterial.vertexColors = !mitBild; gelaendeMaterial.needsUpdate = true }
      // das Luftbild hat seine Schatten schon, mit der Beleuchtung darüber wirkt es sonst zu dunkel
      gelaendeMaterial.color.setScalar(mitBild ? 1.3 : 1)
      if (auflage && !a.has('boden') && !mitBild) {
        flaecheMalen(auflage.wald, 'rgba(118, 168, 92, 0.4)')
        flaecheMalen(auflage.siedlung, 'rgba(140, 128, 118, 0.4)')
      }
      linienMalen(a, mitBild, grundLeinwand)
      auflageTextur.needsUpdate = true
      nahErlaubt = mitBild
      nahZeichnen()
      feinMalen?.()
    }
    /** Umrisse der Gebiete und das Kilometernetz, auf dem Luftbild und dem Nahbild gleich */
    const linienMalen = (a: Set<Kategorie>, mitBild: boolean, grund: Malgrund) => {
      const { ctx, fx, fy, w, h: hp, dicke } = grund
      if (auflage && !a.has('gebiete')) {
        // auf dem Luftbild nur der Umriss, eine Fläche würde das Bild verdecken
        for (const g of auflage.gebiete) flaecheMalen(g.ringe, mitBild ? 'rgba(0,0,0,0)' : (GEBIET[g.art] ?? GEBIET.bln)[0], (GEBIET[g.art] ?? GEBIET.bln)[1], grund)
      }
      if (!a.has('kmnetz')) {
        // Landeskoordinaten: eine Linie je Kilometer, alle 10 km kräftiger
        for (let e = Math.ceil(ost / 1000) * 1000; e <= ost + breite * m; e += 1000) {
          ctx.strokeStyle = e % 10000 === 0 ? 'rgba(60, 60, 60, 0.55)' : 'rgba(60, 60, 60, 0.28)'
          ctx.lineWidth = (e % 10000 === 0 ? 2 : 1) * dicke
          ctx.beginPath(); ctx.moveTo(fx(e), 0); ctx.lineTo(fx(e), hp); ctx.stroke()
        }
        for (let n = Math.ceil((nord - hoehe * m) / 1000) * 1000; n <= nord; n += 1000) {
          ctx.strokeStyle = n % 10000 === 0 ? 'rgba(60, 60, 60, 0.55)' : 'rgba(60, 60, 60, 0.28)'
          ctx.lineWidth = (n % 10000 === 0 ? 2 : 1) * dicke
          ctx.beginPath(); ctx.moveTo(0, fy(n)); ctx.lineTo(w, fy(n)); ctx.stroke()
        }
      }
    }
    const grundNetz = new THREE.Mesh(geo, gelaendeMaterial)
    grundNetz.renderOrder = -2
    szene.add(grundNetz)

    // Nahbild: um den Blickpunkt das Luftbild auf 2,5 m statt 10 m (Michael, 2026-10-10: «die Landschaft ist sehr
    // verschwommen»), nur bis 500 m neben den Bahnlinien. Ein zweites Netz aus denselben Punkten wie das Gelände
    // liegt genau darauf; wo das Nahbild fehlt, ist es durchsichtig, und das Luftbild darunter bleibt
    const nahLeinwand = document.createElement('canvas')
    nahLeinwand.width = nahLeinwand.height = Math.round(NAH_SEITE_M * NAH_PX_JE_M)
    const nahCtx = nahLeinwand.getContext('2d')!
    const nahTextur = new THREE.CanvasTexture(nahLeinwand)
    nahTextur.colorSpace = THREE.SRGBColorSpace
    nahTextur.anisotropy = renderer.capabilities.getMaxAnisotropy()
    // ausgeschnitten statt durchscheinend: so liegt es vor den Rändern der Linie im Ablauf, nicht darüber
    const nahMaterial = new THREE.MeshLambertMaterial({ map: nahTextur, alphaTest: 0.5 })
    nahMaterial.color.setScalar(1.3)
    const nahNetz = new THREE.Mesh(new THREE.BufferGeometry(), nahMaterial)
    nahNetz.renderOrder = -1
    nahNetz.visible = false
    szene.add(nahNetz)
    let nahErlaubt = false, nahAuftrag = 0
    // Führerstand: was dort geladen ist (feinSetzen); solange trägt das feine Netz auch das Nahbild
    let feinStand: { fein: Fein; e0: number; n0: number } | null = null
    let feinMalen: (() => void) | null = null
    let nahMitte: [number, number] | null = null
    let nahStand: { bild: Nahbild; e0: number; n1: number } | null = null
    const nahZeichnen = () => {
      nahNetz.visible = nahErlaubt && !!nahStand && !feinStand
      if (!nahStand) return
      const { bild, e0, n1 } = nahStand
      const fx = (e: number) => (e - e0) * NAH_PX_JE_M, fy = (n: number) => (n1 - n) * NAH_PX_JE_M
      nahCtx.clearRect(0, 0, nahLeinwand.width, nahLeinwand.height)
      const seite = 1000 * NAH_PX_JE_M
      for (const { ke, kn, bild: b } of bild.kacheln) nahCtx.drawImage(b, fx(ke * 1000), fy((kn + 1) * 1000), seite, seite)
      // Umrisse und Kilometernetz wie darunter, nur auf dem Nahbild selbst
      nahCtx.save()
      nahCtx.globalCompositeOperation = 'source-atop'
      linienMalen(ausJetzt.current, true, { ctx: nahCtx, fx, fy, w: nahLeinwand.width, h: nahLeinwand.height, dicke: (NAH_PX_JE_M * m) / PX })
      nahCtx.restore()
      nahTextur.needsUpdate = true
    }
    /** das Netz aus den Punkten des Geländes im Rechteck, mit seinen Normalen, damit das Licht gleich fällt */
    const nahNetzBauen = (e0: number, n1: number) => {
      const normalen = geo.getAttribute('normal').array as Float32Array
      const iVon = Math.max(0, Math.ceil(((e0 - ost) / m - 0.5) / SCHRITT)), iBis = Math.min(nx - 1, Math.floor(((e0 + NAH_SEITE_M - ost) / m - 0.5) / SCHRITT))
      const jVon = Math.max(0, Math.ceil(((nord - n1) / m - 0.5) / SCHRITT)), jBis = Math.min(ny - 1, Math.floor(((nord - n1 + NAH_SEITE_M) / m - 0.5) / SCHRITT))
      const b = iBis - iVon + 1, hh = jBis - jVon + 1
      if (b < 2 || hh < 2) return new THREE.BufferGeometry()
      const p2 = new Float32Array(b * hh * 3), n2 = new Float32Array(b * hh * 3), uv2 = new Float32Array(b * hh * 2)
      const idx: number[] = []
      for (let j = 0; j < hh; j++) {
        for (let i = 0; i < b; i++) {
          const v = nummer[(j + jVon) * nx + i + iVon], k = j * b + i
          if (v >= 0) for (let c3 = 0; c3 < 3; c3++) { p2[k * 3 + c3] = pos[v * 3 + c3]; n2[k * 3 + c3] = normalen[v * 3 + c3] }
          const e = ost + ((i + iVon) * SCHRITT + 0.5) * m, n = nord - ((j + jVon) * SCHRITT + 0.5) * m
          uv2[k * 2] = (e - e0) / NAH_SEITE_M; uv2[k * 2 + 1] = 1 - (n1 - n) / NAH_SEITE_M
          if (i < b - 1 && j < hh - 1) {
            const ecken = [nummer[(j + jVon) * nx + i + iVon], nummer[(j + jVon) * nx + i + 1 + iVon], nummer[(j + 1 + jVon) * nx + i + iVon], nummer[(j + 1 + jVon) * nx + i + 1 + iVon]]
            // dieselben Dreiecke wie im Gelände, sonst liegen die beiden Netze nicht genau aufeinander
            if (Math.min(...ecken) >= 0) idx.push(k, k + b, k + 1, k + 1, k + b, k + b + 1)
          }
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(p2, 3))
      g.setAttribute('normal', new THREE.BufferAttribute(n2, 3))
      g.setAttribute('uv', new THREE.BufferAttribute(uv2, 2))
      g.setIndex(idx)
      return g
    }
    const nahSetzen = async (e: number, n: number) => {
      const auftrag = ++nahAuftrag
      nahMitte = [e, n]
      const e0 = Math.round(e - NAH_SEITE_M / 2), n1 = Math.round(n + NAH_SEITE_M / 2)
      const bild = await nahbildLaden(e0, n1 - NAH_SEITE_M, e0 + NAH_SEITE_M, n1)
      if (!laeuft || auftrag !== nahAuftrag) return
      nahStand = bild ? { bild, e0, n1 } : null
      if (bild) {
        nahNetz.geometry.dispose()
        nahNetz.geometry = nahNetzBauen(e0, n1)
      }
      nahZeichnen()
    }
    szene.add(new THREE.HemisphereLight('#ffffff', '#8a8a7a', 1.6))
    const sonne = new THREE.DirectionalLight('#ffffff', 2.2)
    // Licht von Nordwesten wie auf der Landeskarte
    sonne.position.set(-1, 1.2, -1)
    szene.add(sonne)

    // der Weg: auf dem Gelände, in Tunneln und auf Brücken gerade zwischen den Enden
    const pk = weg.punkte
    const punktBei = (meter: number) => {
      let lo = 1, hi = pk.length - 1
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pk[mid].m < meter) lo = mid + 1; else hi = mid }
      const a = pk[Math.max(0, lo - 1)], b = pk[lo]
      const t = Math.max(0, Math.min(1, (meter - a.m) / ((b.m - a.m) || 1)))
      return [a.e + t * (b.e - a.e), a.n + t * (b.n - a.n)] as const
    }
    // Die Höhe der Gleise steht in keiner Quelle. Das Gelände unter der Linie, Feld für Feld genommen,
    // liess den Zug an jedem Hang auf und ab fahren (Michael, 2026-10-07: «gradliniger»): darum
    // gemittelt über GLAETTEN_M vor und hinter jedem Punkt, für Linie und Zug gleich
    const m0 = pk[0].m, schritte = Math.max(1, Math.ceil((pk[pk.length - 1].m - m0) / HOEHE_SCHRITT_M))
    const summe = new Float64Array(schritte + 2), anzahl = new Uint32Array(schritte + 2)
    for (let i = 0; i <= schritte; i++) {
      const [e, n] = punktBei(m0 + i * HOEHE_SCHRITT_M)
      const z = hoeheBei(r, h, e, n)
      // ohne Kachel steht 0: nicht mitzählen
      summe[i + 1] = summe[i] + (z > KEINE_HOEHE ? z : 0)
      anzahl[i + 1] = anzahl[i] + (z > KEINE_HOEHE ? 1 : 0)
    }
    const breitSchritte = Math.round(GLAETTEN_M / HOEHE_SCHRITT_M)
    const geglaettet = new Float32Array(schritte + 1)
    for (let i = 0; i <= schritte; i++) {
      const a = Math.max(0, i - breitSchritte), b = Math.min(schritte, i + breitSchritte) + 1
      const k = anzahl[b] - anzahl[a]
      geglaettet[i] = k ? (summe[b] - summe[a]) / k : 0
    }
    // Wo das Gelände über die gemittelte Linie ragt (Kuppen, Hänge), hebt sie sich, sonst verschwände sie darin:
    // der grösste Überstand in der Nähe, dann gemittelt, damit der Zug nicht wieder auf und ab fährt. Im
    // flachen Land bleibt so fast nichts, und der Zug liegt auf dem Boden statt 25 m darüber
    const nah = Math.round(150 / HOEHE_SCHRITT_M)
    // das Netz nimmt nur jedes SCHRITT-te Feld und liegt in Mulden darum etwas höher als das Feld selbst
    const netzHoehe = (e: number, n: number) => {
      const x = Math.max(0, Math.min((nx - 1) - 0.001, ((e - ost) / m - 0.5) / SCHRITT))
      const y = Math.max(0, Math.min((ny - 1) - 0.001, ((nord - n) / m - 0.5) / SCHRITT))
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
      const z = (i: number, j: number) => h[j * SCHRITT * breite + i * SCHRITT]
      return z(x0, y0) * (1 - fx) * (1 - fy) + z(x0 + 1, y0) * fx * (1 - fy) + z(x0, y0 + 1) * (1 - fx) * fy + z(x0 + 1, y0 + 1) * fx * fy
    }
    const ueber = new Float32Array(schritte + 1)
    for (let i = 0; i <= schritte; i++) {
      if (anzahl[i + 1] === anzahl[i]) continue
      const [e, n] = punktBei(m0 + i * HOEHE_SCHRITT_M)
      ueber[i] = Math.max(0, summe[i + 1] - summe[i] - geglaettet[i], netzHoehe(e, n) - geglaettet[i])
    }
    const groesst = new Float32Array(schritte + 1)
    for (let i = 0; i <= schritte; i++) {
      let g = 0
      for (let j = Math.max(0, i - nah); j <= Math.min(schritte, i + nah); j++) g = Math.max(g, ueber[j])
      groesst[i] = g
    }
    for (let i = 0; i <= schritte; i++) {
      let t = 0, k = 0
      for (let j = Math.max(0, i - nah); j <= Math.min(schritte, i + nah); j++) { t += groesst[j]; k++ }
      geglaettet[i] += t / k + LINIE_UEBER_M
    }
    const gelaendeAmWeg = (meter: number) => {
      const x = Math.max(0, Math.min(schritte, (meter - m0) / HOEHE_SCHRITT_M))
      const i = Math.min(schritte - 1, Math.floor(x)), t = x - i
      return geglaettet[i] * (1 - t) + geglaettet[i + 1] * t
    }
    const hoeheAmWeg = (meter: number) => {
      const bau = weg.bauwerke.find((x) => meter >= x.von && meter <= x.bis)
      if (!bau) return gelaendeAmWeg(meter)
      const ha = gelaendeAmWeg(bau.von), hb = gelaendeAmWeg(bau.bis)
      return ha + ((meter - bau.von) / ((bau.bis - bau.von) || 1)) * (hb - ha)
    }
    const punkt3d = (meter: number) => {
      const [e, n] = punktBei(meter)
      return new THREE.Vector3(X(e), Y(hoeheAmWeg(meter)), Z(n))
    }
    const strichVon = (von: number, bis: number) => {
      const punkte: THREE.Vector3[] = []
      for (let meter = von; meter < bis; meter += 50) punkte.push(punkt3d(meter))
      punkte.push(punkt3d(bis))
      return punkte
    }
    // in der Brille ist das Relief etwa einen Meter breit: dort eigene, dickere Linien
    const brilleMass = BRILLE_BREITE_M / (Math.max(breite, hoehe) * m / 1000)
    const nurBild = new THREE.Group(), nurBrille = new THREE.Group()
    nurBrille.visible = false
    szene.add(nurBild, nurBrille)
    // auf dem Bildschirm eine Linie mit fester Breite in Bildpunkten, die beim Hineinzoomen nicht dicker
    // wird (Michael, 2026-10-07: «die Strecke beim Einzoomen kleiner»); in der Brille eine Röhre in Metern
    const linienMaterialien: LineMaterial[] = []
    /** gestrichelte Linien auf dem Bildschirm: Strich und Lücke wachsen mit dem Abstand der Kamera, so bleiben
     *  sie auf dem Bildschirm gleich lang (Michael, 2026-10-07: «Wenn man näher geht … viel zu gross») */
    const strichMaterialien: LineMaterial[] = []
    const roehre = (punkte: THREE.Vector3[], farbe: string, durch: boolean, wo: 'beide' | 'bild' | 'brille' = 'beide') => {
      if (punkte.length < 2) return
      if (wo !== 'brille') bildLinie(punkte, farbe, durch)
      if (wo !== 'bild') brillenRoehre(punkte, farbe, durch)
    }
    const randVon = (farbe: string) => '#' + new THREE.Color(farbe).multiplyScalar(0.4).getHexString()
    const bildLinie = (punkte: THREE.Vector3[], farbe: string, durch: boolean) => {
      const lg = new LineGeometry()
      lg.setPositions(punkte.flatMap((p) => [p.x, p.y, p.z]))
      // aussen dunkler Rand, innen heller (Michael, 2026-10-07: «Innen heller aussen dunkler»); der innere
      // Strich kommt danach; der Rand schreibt keine Tiefe, sonst verdeckt er den inneren stellenweise
      ;[[randVon(farbe), STRICH_PX], [farbe, STRICH_PX * STRICH_INNEN]].forEach(([f, breit], k) => {
        const lm = new LineMaterial({ color: f as string, linewidth: (breit as number) * (durch ? 0.85 : 1), depthTest: !durch,
                                      transparent: durch, opacity: durch ? 0.9 : 1, depthWrite: k === 1, dashed: durch })
        linienMaterialien.push(lm)
        if (durch) strichMaterialien.push(lm)
        const strich = new Line2(lg, lm)
        if (durch) strich.computeLineDistances()
        strich.renderOrder = (durch ? 2 : 0) + k
        nurBild.add(strich)
      })
    }
    /** ein flaches Band auf der Linie, waagrecht quer zur Fahrt; breit: halbe Breite */
    const band = (punkte: THREE.Vector3[], breit: number, hoeher: number) => {
      const pos: number[] = [], index: number[] = []
      punkte.forEach((p, i) => {
        const a = punkte[Math.max(0, i - 1)], z = punkte[Math.min(punkte.length - 1, i + 1)]
        const nx = -(z.z - a.z), nz = z.x - a.x, l = Math.hypot(nx, nz) || 1
        pos.push(p.x + (nx / l) * breit, p.y + hoeher, p.z + (nz / l) * breit, p.x - (nx / l) * breit, p.y + hoeher, p.z - (nz / l) * breit)
        if (i) index.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i)
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(index)
      return g
    }
    const brillenRoehre = (punkte: THREE.Vector3[], farbe: string, durch: boolean) => {
      const rand = randVon(farbe)
      if (brille) {
        // wie auf dem Bildschirm aussen dunkel, innen heller, aber als flaches Band, auf dem der Zug fährt; eine Röhre
        // schluckte den Zug, sobald man nahe heranging (Michael, 2026-10-08: «keine rote Röhre … dunkelgrau mit Rändern»)
        const dick = BRILLE_LINIE_M / brilleMass
        ;[[rand, dick, 0], [farbe, dick * STRICH_INNEN, dick * 0.05]].forEach(([f, breit, hoeher], k) => {
          const netz = new THREE.Mesh(band(punkte, breit as number, hoeher as number),
            new THREE.MeshBasicMaterial({ color: f as string, side: THREE.DoubleSide, depthTest: !durch,
                                          transparent: durch, opacity: durch ? 0.9 : 1,
                                          polygonOffset: true, polygonOffsetFactor: -1 - k, polygonOffsetUnits: -1 - k }))
          netz.renderOrder = (durch ? 2 : 0) + k
          nurBrille.add(netz)
        })
      }
    }
    /** gestrichelt (Tunnel): auf dem Bildschirm mit dem Zoom (strichMaterialien); in der Brille wie auf dem Bildschirm
     *  aus der Nähe gesehen, Strich und Lücke auf dem Tisch gleich lang, ob das Modell kurz oder lang ist (Michael,
     *  2026-10-08: «die gestrichelten Tunnellinien … übernehmen»); Punkte alle 50 m */
    const STRICH = Math.max(1, Math.round(BRILLE_STRICH_M / brilleMass / 0.05))
    const LUECKE = Math.max(1, Math.round(BRILLE_LUECKE_M / brilleMass / 0.05))
    const linie = (punkte: THREE.Vector3[], farbe: string, tunnel: boolean) => {
      if (!tunnel || punkte.length <= STRICH) { roehre(punkte, farbe, tunnel); return }
      roehre(punkte, farbe, true, 'bild')
      for (let i = 0; i < punkte.length - 1; i += STRICH + LUECKE) roehre(punkte.slice(i, Math.min(punkte.length, i + STRICH + 1)), farbe, true, 'brille')
    }
    // grau, wo der Weg selbst dunkel ist (beim Fahren), sonst wären Tunnel kaum zu unterscheiden
    const tunnelFarbe = dunkel || wegFarbe === FARBEN.weg ? '#b4b4b4' : FARBEN.tunnel
    const wegVon = nurBild.children.length
    for (const [anfang, ende] of weg.stuecke) {
      const grenzen = weg.bauwerke.filter((g) => g.bis > anfang && g.von < ende).sort((a, b) => a.von - b.von)
      let bei = anfang
      for (const g of grenzen) {
        if (g.von > bei) linie(strichVon(bei, g.von), wegFarbe, false)
        const von = Math.max(g.von, anfang, bei), bis = Math.min(g.bis, ende)
        if (bis > von) linie(strichVon(von, bis), g.art === 'tunnel' ? tunnelFarbe : FARBEN.bruecke, g.art === 'tunnel')
        bei = Math.max(bei, g.bis)
      }
      if (bei < ende) linie(strichVon(bei, ende), wegFarbe, false)
    }
    const imStueck = (meter: number) => weg.stuecke.some(([a, b]) => meter >= a && meter <= b)
    const wegStriche = nurBild.children.slice(wegVon)

    // Führerstand: um den Zug das Gelände auf 10 m (swissALTI3D) statt auf 100 m, darauf Luftbild und Nahbild, und die
    // Linie auf diesem Gelände (Michael, 2026-10-10: «die nähere Umgebung in maximaler Qualität … nur 1 bis 2 km um die
    // Strecke»). Das grobe Gelände sinkt dort unter das feine, und seine Linie ruht, solange der Führerstand gilt
    const aufloesung = new THREE.Vector2(1, 1)
    const feinLeinwand = document.createElement('canvas')
    feinLeinwand.width = feinLeinwand.height = Math.round(FEIN_SEITE_M * FEIN_PX_JE_M)
    const feinCtx = feinLeinwand.getContext('2d')!
    const feinTextur = new THREE.CanvasTexture(feinLeinwand)
    feinTextur.colorSpace = THREE.SRGBColorSpace
    feinTextur.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const feinMaterial = new THREE.MeshLambertMaterial({ map: feinTextur })
    // die Farben des Geländes und das Luftbild sind beide um 1.3 abgedunkelt (grundBild, Luftbild)
    feinMaterial.color.setScalar(1.3)
    const feinNetz = new THREE.Mesh(new THREE.BufferGeometry(), feinMaterial)
    feinNetz.renderOrder = -1
    feinNetz.visible = false
    const feinLinien = new THREE.Group()
    szene.add(feinNetz, feinLinien)
    const grundY = new Float32Array(netzPunkte)
    for (let v = 0; v < netzPunkte; v++) grundY[v] = pos[v * 3 + 1]
    let versenkt: number[] = []
    let feinNah: Nahbild | null = null
    let feinAuftrag = 0
    /** Höhe der Linie im Führerstand: auf dem feinen Gelände, gegen den Rand des Quadrats in die grobe übergehend */
    const feinLinieHoehe = (meter: number) => {
      const grob = hoeheAmWeg(meter)
      if (!feinStand) return grob
      const { fein, e0, n0 } = feinStand
      const amBoden = (mm: number) => {
        const [e, n] = punktBei(mm)
        return feinHoehe(fein, e, n)
      }
      const bau = weg.bauwerke.find((x) => meter >= x.von && meter <= x.bis)
      // gemittelt über 30 m davor und danach; in Tunneln und auf Brücken gerade zwischen den Enden
      const gemittelt = (mm: number) => {
        let t = 0, k = 0
        for (let d = -30; d <= 30; d += 10) { const z = amBoden(mm + d); if (z !== null) { t += z; k++ } }
        return k ? t / k + FEIN_UEBER_M : null
      }
      let z: number | null
      if (bau) {
        const za = gemittelt(bau.von), zb = gemittelt(bau.bis)
        z = za !== null && zb !== null ? za + ((meter - bau.von) / ((bau.bis - bau.von) || 1)) * (zb - za) : null
      } else z = gemittelt(meter)
      if (z === null) return grob
      const [e, n] = punktBei(meter)
      const rand = Math.min(e - e0, e0 + FEIN_SEITE_M - e, n - n0, n0 + FEIN_SEITE_M - n)
      const a = Math.max(0, Math.min(1, rand / FEIN_RAND_M))
      return z * a + grob * (1 - a)
    }
    const feinPunkt3d = (meter: number) => {
      const [e, n] = punktBei(meter)
      return new THREE.Vector3(X(e), Y(feinLinieHoehe(meter)), Z(n))
    }
    feinMalen = () => {
      if (!feinStand) return
      const { e0, n0 } = feinStand, n1 = n0 + FEIN_SEITE_M, w = feinLeinwand.width
      const fx = (e: number) => (e - e0) * FEIN_PX_JE_M, fy = (n: number) => (n1 - n) * FEIN_PX_JE_M
      // darunter die Auflage des ganzen Geländes; ohne Luftbild die Farben des Geländes mit Wald, Siedlung, Gebieten
      const ausschnitt = (bild: HTMLCanvasElement, je: number) =>
        feinCtx.drawImage(bild, ((e0 - ost) / m) * je, ((nord - n1) / m) * je, (FEIN_SEITE_M / m) * je, (FEIN_SEITE_M / m) * je, 0, 0, w, w)
      feinCtx.globalCompositeOperation = 'source-over'
      feinCtx.imageSmoothingEnabled = true
      ausschnitt(grundBild(), 1)
      if (!nahErlaubt) feinCtx.globalCompositeOperation = 'multiply'
      ausschnitt(leinwand, PX)
      feinCtx.globalCompositeOperation = 'source-over'
      if (nahErlaubt && feinNah) {
        const seite = 1000 * FEIN_PX_JE_M
        for (const { ke, kn, bild: b } of feinNah.kacheln) feinCtx.drawImage(b, fx(ke * 1000), fy((kn + 1) * 1000), seite, seite)
        linienMalen(ausJetzt.current, true, { ctx: feinCtx, fx, fy, w, h: w, dicke: (FEIN_PX_JE_M * m) / PX })
      }
      feinTextur.needsUpdate = true
    }
    /** zurück zum groben Gelände und seiner Linie */
    const feinWeg = () => {
      const p = geo.getAttribute('position')
      for (const v of versenkt) (p.array as Float32Array)[v * 3 + 1] = grundY[v]
      if (versenkt.length) p.needsUpdate = true
      versenkt = []
      feinStand = null
      feinNetz.visible = false
      for (const o of feinLinien.children) { (o as Line2).geometry.dispose(); ((o as Line2).material as LineMaterial).dispose() }
      feinLinien.clear()
      for (const o of wegStriche) o.visible = true
      nahZeichnen()
    }
    const feinSetzen = async (stelle: number, richtung: number) => {
      const auftrag = ++feinAuftrag
      const anfang = pk[0].m, ende = pk[pk.length - 1].m
      const [ce, cn] = punktBei(Math.max(anfang, Math.min(ende, stelle + richtung * FEIN_VORAUS_M)))
      const e0 = Math.round((ce - FEIN_SEITE_M / 2) / 10) * 10, n0 = Math.round((cn - FEIN_SEITE_M / 2) / 10) * 10
      const e1 = e0 + FEIN_SEITE_M, n1 = n0 + FEIN_SEITE_M
      const [fein, nahBild] = await Promise.all([feinLaden(e0, n0, e1, n1), luftbild ? nahbildLaden(e0, n0, e1, n1) : null])
      if (!laeuft || auftrag !== feinAuftrag || !imStand) return
      feinWeg()
      if (!fein) return
      feinStand = { fein, e0, n0 }
      feinNah = nahBild
      // das Netz: ein Punkt je Feld von 10 m, nur Vierecke mit vier Höhen
      const I0 = Math.ceil((e0 - 5) / 10), J1 = Math.floor((n1 - 5) / 10), b = FEIN_SEITE_M / 10
      const p2 = new Float32Array(b * b * 3), uv2 = new Float32Array(b * b * 2), da = new Uint8Array(b * b)
      for (let j = 0; j < b; j++) {
        for (let i = 0; i < b; i++) {
          const k = j * b + i, e = (I0 + i) * 10 + 5, n = (J1 - j) * 10 + 5
          const z = feinFeld(fein, I0 + i, J1 - j)
          if (z === null) continue
          da[k] = 1
          p2[k * 3] = X(e); p2[k * 3 + 1] = Y(z); p2[k * 3 + 2] = Z(n)
          uv2[k * 2] = (e - e0) / FEIN_SEITE_M; uv2[k * 2 + 1] = (n - n0) / FEIN_SEITE_M
        }
      }
      const idx: number[] = []
      for (let j = 0; j < b - 1; j++) {
        for (let i = 0; i < b - 1; i++) {
          const k = j * b + i
          if (da[k] && da[k + 1] && da[k + b] && da[k + b + 1]) idx.push(k, k + b, k + 1, k + 1, k + b, k + b + 1)
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(p2, 3))
      g.setAttribute('uv', new THREE.BufferAttribute(uv2, 2))
      g.setIndex(idx)
      g.computeVertexNormals()
      feinNetz.geometry.dispose()
      feinNetz.geometry = g
      feinNetz.visible = true
      feinMalen?.()
      // das grobe Gelände sinkt, wo jedes angrenzende Viereck ganz auf feinem Gelände liegt; so bleibt keine Lücke
      const d = SCHRITT * m, innen = (e: number, n: number) =>
        e > I0 * 10 + 15 && e < (I0 + b - 1) * 10 - 5 && n < J1 * 10 - 5 && n > (J1 - b + 1) * 10 + 15 && fein.km.has(`${Math.floor(e / 1000)}_${Math.floor(n / 1000)}`)
      const pa = geo.getAttribute('position'), parr = pa.array as Float32Array
      for (let j = 0; j < ny; j++) {
        const n = nord - (j * SCHRITT + 0.5) * m
        if (n < n0 || n > n1) continue
        for (let i = 0; i < nx; i++) {
          const v = nummer[j * nx + i]
          if (v < 0) continue
          const e = ost + (i * SCHRITT + 0.5) * m
          if (e < e0 || e > e1) continue
          if (innen(e - d, n - d) && innen(e + d, n - d) && innen(e - d, n + d) && innen(e + d, n + d)) {
            parr[v * 3 + 1] = grundY[v] - Y(300)
            versenkt.push(v)
          }
        }
      }
      if (versenkt.length) pa.needsUpdate = true
      // die Linie auf dem feinen Gelände, 6 km davor und danach, in Metern breit
      const von = Math.max(anfang, stelle - 6000), bis = Math.min(ende, stelle + 6000)
      const strich = (punkte: THREE.Vector3[], farbe: string, tunnel: boolean) => {
        if (punkte.length < 2) return
        const lg = new LineGeometry()
        lg.setPositions(punkte.flatMap((q) => [q.x, q.y, q.z]))
        ;[[randVon(farbe), 1], [farbe, STRICH_INNEN]].forEach(([f, anteil], k) => {
          const lm = new LineMaterial({ color: f as string, linewidth: (FEIN_LINIE_M * (anteil as number)) / 1000, worldUnits: true,
                                        depthTest: !tunnel, transparent: tunnel, opacity: tunnel ? 0.9 : 1, depthWrite: k === 1,
                                        dashed: tunnel, dashSize: 0.02, gapSize: 0.015 })
          lm.resolution.copy(aufloesung)
          const l = new Line2(lg, lm)
          if (tunnel) l.computeLineDistances()
          l.renderOrder = (tunnel ? 2 : 0) + k
          feinLinien.add(l)
        })
      }
      const punkteVon = (a: number, z: number) => {
        const punkte: THREE.Vector3[] = []
        for (let meter = a; meter < z; meter += 10) punkte.push(feinPunkt3d(meter))
        punkte.push(feinPunkt3d(z))
        return punkte
      }
      for (const [a0, z0] of weg.stuecke) {
        const anf = Math.max(a0, von), end = Math.min(z0, bis)
        if (end <= anf) continue
        const grenzen = weg.bauwerke.filter((x) => x.bis > anf && x.von < end).sort((x, y) => x.von - y.von)
        let bei = anf
        for (const x of grenzen) {
          if (x.von > bei) strich(punkteVon(bei, x.von), wegFarbe, false)
          const a = Math.max(x.von, anf, bei), z = Math.min(x.bis, end)
          if (z > a) strich(punkteVon(a, z), x.art === 'tunnel' ? tunnelFarbe : FARBEN.bruecke, x.art === 'tunnel')
          bei = Math.max(bei, x.bis)
        }
        if (bei < end) strich(punkteVon(bei, end), wegFarbe, false)
      }
      for (const o of wegStriche) o.visible = false
      nahZeichnen()
    }

    // Beschriftungen in fester Bildschirmgrösse, auf einem hellen Schild; wo sich zwei
    // überdecken, bleibt die mit dem kleineren Rang stehen (zeichnen() blendet die andere aus)
    const schilder: Array<{ sp: THREE.Sprite; rang: number; folge: number; grundMass: [number, number]; lagen: Array<[number, number]> }> = []
    const gruppen = { gipfel: new THREE.Group(), kgs: new THREE.Group(), seilbahn: new THREE.Group() }
    Object.values(gruppen).forEach((g) => szene.add(g))
    const schild = (text: string, farbe: string, x: number, y: number, z: number, rang: number, folge = 0, ort: THREE.Object3D = szene,
                    lagen: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [1, 1]], ortsschild = false) => {
      const lw = document.createElement('canvas')
      const ctx = lw.getContext('2d')!
      const px = 28, rand = 10
      // Bahnhöfe: eckiges Schild in Dunkelgrau, weisse, dünnere Schrift (Michael, 2026-10-07)
      const schrift = `${ortsschild ? 'normal' : 'bold'} ${px}px Helvetica, Arial, sans-serif`
      ctx.font = schrift
      lw.width = Math.ceil(ctx.measureText(text).width) + 2 * rand; lw.height = px + 16
      ctx.font = schrift
      if (ortsschild) {
        ctx.fillStyle = BAHNHOF_GRAU
        ctx.fillRect(0, 0, lw.width, lw.height)
      } else {
        ctx.fillStyle = dunkel ? 'rgba(20,20,20,0.82)' : 'rgba(255,255,255,0.85)'
        ctx.beginPath(); ctx.roundRect(0, 0, lw.width, lw.height, 8); ctx.fill()
      }
      ctx.fillStyle = ortsschild ? '#ffffff' : farbe
      ctx.fillText(text, rand, px + 2)
      const textur = new THREE.CanvasTexture(lw)
      textur.colorSpace = THREE.SRGBColorSpace // sonst wirken die Farben blasser
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textur, depthTest: false, sizeAttenuation: false }))
      const s = 0.00085
      sp.scale.set(lw.width * s, lw.height * s, 1)
      sp.center.set(0, 0)
      sp.position.set(x, y, z)
      sp.renderOrder = 3
      ort.add(sp)
      schilder.push({ sp, rang, folge, grundMass: [sp.scale.x, sp.scale.y], lagen })
      return sp
    }
    /** Zeichen, die auf dem Bildschirm mit dem Zug beim Hineinzoomen kleiner werden */
    const zeichen: THREE.Object3D[] = []
    // Reihenfolge der Bahnhöfe zwischen den Enden durch Halbieren: zuerst der mittlere, dann die
    // in der Mitte jeder Hälfte usw., damit die Namen in der Übersicht über die Strecke verteilt sind
    const folge = new Map<number, number>()
    const haelften: Array<[number, number]> = [[0, r.bahnhoefe.length - 1]]
    while (haelften.length) {
      const [a, z] = haelften.shift()!
      if (z - a < 2) continue
      const m = Math.floor((a + z) / 2)
      folge.set(m, folge.size)
      haelften.push([a, m], [m, z])
    }
    // Bahnhöfe als dünner Mast senkrecht in den Himmel, oben das Schild mit dem Namen (Michael, 2026-10-07:
    // «Der blaue Punkt wirkte für mich zu grob»); der Mast wird beim Hineinzoomen kürzer wie der Zug
    // in grossen Modellen (eine ganze Strecke) höher, sonst verschwinden sie in der Brille (Michael, 2026-10-08)
    const ausdehnungKm = (Math.max(breite, hoehe) * m) / 1000
    const mastKm = MAST_KM * Math.max(1, ausdehnungKm / 40)
    const masten: Array<{ sp: THREE.Sprite; y: number }> = []
    const mastFarbe = BAHNHOF_GRAU
    r.bahnhoefe.forEach((b, i) => {
      const y = Y(hoeheBei(r, h, b.lage[0], b.lage[1]) + UEBER_M)
      const lg = new LineGeometry()
      lg.setPositions([0, 0, 0, 0, mastKm, 0])
      const lm = new LineMaterial({ color: mastFarbe, linewidth: 1 })
      linienMaterialien.push(lm)
      const mast = new Line2(lg, lm)
      mast.position.set(X(b.lage[0]), y, Z(b.lage[1]))
      nurBild.add(mast)
      zeichen.push(mast)
      if (brille) {
        const stab = new THREE.Mesh(new THREE.CylinderGeometry(BRILLE_LINIE_M * 0.25 / brilleMass, BRILLE_LINIE_M * 0.25 / brilleMass, mastKm, 6),
          new THREE.MeshBasicMaterial({ color: mastFarbe }))
        stab.position.set(X(b.lage[0]), y + mastKm / 2, Z(b.lage[1]))
        nurBrille.add(stab)
      }
      // Anfang und Ende der Strecke zuerst, dann die übrigen Bahnhöfe, dann die Gipfel
      const ende = i === 0 || i === r.bahnhoefe.length - 1
      const sp = schild(b.name, dunkel ? '#9db4ff' : FARBEN.bahnhof, X(b.lage[0]), y + mastKm, Z(b.lage[1]), ende ? 0 : 1, folge.get(i) ?? 0,
                        szene, [[0.5, 0], [0, 0], [1, 0]], true)
      masten.push({ sp, y })
    })
    // Tunnel ohne Länge (nur ein Kilometer in der Quelle) zeigte hier eine graue Kugel auf der Linie; ohne Sinn auf dem
    // Bild (Michael, 2026-10-10: «Brauchts diese?»), darum weggelassen; beim Fahren meldet Taktland sie weiter
    for (const g of r.gipfel) {
      const y = Y(Math.max(g.hoehe_m ?? 0, hoeheBei(r, h, g.lage[0], g.lage[1])))
      const kegel = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), new THREE.MeshBasicMaterial({ color: FARBEN.gipfel }))
      kegel.position.set(X(g.lage[0]), y + 0.12, Z(g.lage[1]))
      gruppen.gipfel.add(kegel)
      zeichen.push(kegel)
      schild(g.hoehe_m != null ? `${g.name} ${g.hoehe_m.toLocaleString('de-CH')} m` : g.name, dunkel ? '#e2c9a8' : FARBEN.gipfel, X(g.lage[0]), y + 0.3, Z(g.lage[1]), 2, 0, gruppen.gipfel)
    }

    const imAusschnitt = (e: number, n: number) => e >= ost && e <= ost + breite * m && n <= nord && n >= nord - hoehe * m
      && (!r.innen || r.innen(e, n))
    // Seen (Michael, 2026-10-06: «Erst Seen dazu»): flach auf Seehöhe, die Höhe ist die mittlere des Ufers im
    // Gelände; was über den Ausschnitt hinausragt, ist abgeschnitten
    const eck: Array<[number, number]> = [[ost, nord], [ost + breite * m, nord], [ost + breite * m, nord - hoehe * m], [ost, nord - hoehe * m]]
    // auf dem Luftbild sind die Seen selbst zu sehen, dort ohne blaue Fläche (Michael, 2026-10-07)
    const seeFlaechen = new THREE.Group()
    const seeMinM2 = (Math.max(breite, hoehe) * m) / 1000 > 100 ? SEE_NAME_AB_M2 : 0
    szene.add(seeFlaechen)
    for (const see of zusatz?.seen?.seen ?? []) {
      const ringe = see.ringe.map((x) => zugInRahmen(zugLesen(x), eck)).filter((q) => q.length >= 3)
      if (!ringe.length) continue
      // ganze Strecke in der Brille: nur Seen, die ins Band um die Strecke reichen
      if (r.innen && !ringe.some((q) => q.some(([e, n]) => r.innen!(e, n)))) continue
      const flaeche = (q: Array<[number, number]>) => Math.abs(q.reduce((a, [e, n], i) => { const [e2, n2] = q[(i + 1) % q.length]; return a + e * n2 - e2 * n }, 0))
      ringe.sort((a, b) => flaeche(b) - flaeche(a))
      const ufer = ringe[0].map(([e, n]) => hoeheBei(r, h, e, n)).sort((a, b) => a - b)
      const pegel = ufer[Math.floor(ufer.length / 2)]
      const form = new THREE.Shape(ringe[0].map(([e, n]) => new THREE.Vector2(X(e), -Z(n))))
      form.holes = ringe.slice(1).map((q) => new THREE.Path(q.map(([e, n]) => new THREE.Vector2(X(e), -Z(n)))))
      const wasser = new THREE.Mesh(new THREE.ShapeGeometry(form), new THREE.MeshLambertMaterial({ color: '#9cc3e6' }))
      wasser.rotation.x = -Math.PI / 2
      wasser.position.y = Y(pegel + 3)
      seeFlaechen.add(wasser)
      // «N_P» setzt swissTLMRegio, wo kein Name steht: ein Platzhalter, kein Name
      if (see.name && see.name !== 'N_P') {
        const [ne, nn] = see.namenspunkt ? lv95(see.namenspunkt[0], see.namenspunkt[1]) : ringe[0][0]
        // grössere Seen zuerst, vor den Gipfeln gleichen Rangs
        // in grossen Modellen nur die grösseren Seen, sonst verdecken ihre Namen alles (Michael, 2026-10-08)
        if (imAusschnitt(ne, nn) && flaeche(ringe[0]) / 2 >= seeMinM2) schild(see.name, dunkel ? '#8fb3d4' : '#3f6a93', X(ne), Y(pegel + 3) + 0.1, Z(nn), 2, -flaeche(ringe[0]))
      }
    }
    for (const k of zusatz?.s?.kgs ?? []) {
      const [e, n] = lv95(k.lage[0], k.lage[1])
      if (!imAusschnitt(e, n)) continue
      const y = Y(hoeheBei(r, h, e, n))
      const raute = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: dunkel ? '#c39be0' : '#6b3fa0' }))
      raute.position.set(X(e), y + 0.08, Z(n))
      gruppen.kgs.add(raute)
      zeichen.push(raute)
      schild(k.name, dunkel ? '#c39be0' : '#6b3fa0', X(e), y + 0.18, Z(n), 3, 0, gruppen.kgs)
    }
    const seilBild = new THREE.Group(), seilBrille = new THREE.Group()
    seilBrille.visible = false
    gruppen.seilbahn.add(seilBild, seilBrille)
    for (const b of zusatz?.s?.seilbahnen ?? []) {
      const pts = b.verlauf.flatMap((v) => zugLesen(v))
      if (pts.length < 2 || !pts.some(([e, n]) => imAusschnitt(e, n))) continue
      // gerade von Station zu Station: wie hoch das Seil hängt, steht in keiner Quelle
      const [ea, na] = pts[0], [eb, nb] = pts[pts.length - 1]
      const a = new THREE.Vector3(X(ea), Y(hoeheBei(r, h, ea, na)) + 0.03, Z(na))
      const z2 = new THREE.Vector3(X(eb), Y(hoeheBei(r, h, eb, nb)) + 0.03, Z(nb))
      // auf dem Bildschirm mit fester Breite, die Röhre wurde beim Hineinzoomen viel zu dick (Michael, 2026-10-07)
      const seilFarbe = dunkel ? '#7cc0cf' : '#0d5c6e'
      const lg = new LineGeometry()
      lg.setPositions([a.x, a.y, a.z, z2.x, z2.y, z2.z])
      const lm = new LineMaterial({ color: seilFarbe, linewidth: 1.5 })
      linienMaterialien.push(lm)
      seilBild.add(new Line2(lg, lm))
      if (brille) {
        seilBrille.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, z2), 8, BRILLE_LINIE_M * 0.5 / brilleMass, 5, false),
          new THREE.MeshBasicMaterial({ color: seilFarbe })))
      }
      for (const p of [a, z2]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: seilFarbe }))
        st.position.copy(p)
        gruppen.seilbahn.add(st)
        zeichen.push(st)
      }
    }
    anwenden.current = (a: Set<Kategorie>) => {
      gruppen.gipfel.visible = !a.has('gipfel')
      gruppen.kgs.visible = !a.has('kgs')
      gruppen.seilbahn.visible = !a.has('seilbahn')
      seeFlaechen.visible = !luftbild || a.has('luftbild')
      auflageMalen(a)
    }
    anwenden.current(ausJetzt.current)

    // der Zug: Lok und Wagen, jeder folgt der Linie; im Tunnel halb durchsichtig über dem Berg
    const zugTeile: Array<{ netz: THREE.Group; durch: THREE.Group; ebeneAussen: THREE.Plane; ebeneDrin: THREE.Plane; ab: number; laenge: number }> = []
    let zugMass = 1
    /** in der Brille: die Grösse des Zugs aus der Ferne, je nach Grösse des Modells */
    let zugMassBrille = 1
    if (zug) {
      let ab = 0
      for (let i = 0; i <= ZUG_WAGEN; i++) {
        const laenge = i === 0 ? ZUG_LOK_M : ZUG_WAGEN_M
        const g = new THREE.Group()
        // hell mit dunklem Fensterband, dunklen Übergängen und karminrotem, gerundetem Kopf
        // (Michael, 2026-10-07: «den Zug in diesem Design»); kein bestimmter Zugtyp
        const W = ZUG_BREITE, H = ZUG_HOEHE, L = laenge / 1000, h = H / 2
        const hell = new THREE.MeshLambertMaterial({ color: ZUG_HELL })
        const schwarz = new THREE.MeshLambertMaterial({ color: ZUG_DUNKEL })
        const materialien = [hell, schwarz]
        const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => { const n = new THREE.Mesh(geo, mat); g.add(n); return n }
        // Kasten: Querschnitt mit gerundetem Dach, über dem Fahrwerk
        const unten = -h + H * 0.14, r = W * 0.32
        const quer = new THREE.Shape()
        quer.moveTo(-W / 2, unten); quer.lineTo(W / 2, unten); quer.lineTo(W / 2, h - r)
        quer.quadraticCurveTo(W / 2, h, W / 2 - r, h); quer.lineTo(-W / 2 + r, h)
        quer.quadraticCurveTo(-W / 2, h, -W / 2, h - r); quer.closePath()
        // vorne bei der Lok ein Stück frei für den Kopf
        // der Steuerwagen am Schluss hat den Kopf hinten
        const hinten = i === ZUG_WAGEN
        const kopf = i === 0 || hinten ? H * 1.6 : 0
        const kasten = new THREE.ExtrudeGeometry(quer, { depth: L - kopf, bevelEnabled: false, curveSegments: 4 })
        kasten.translate(0, 0, hinten ? -L / 2 + kopf : -L / 2)
        mesh(kasten, hell)
        // Fahrwerk dunkel und etwas schmaler
        mesh(new THREE.BoxGeometry(W * 0.86, unten + h, L * 0.96), schwarz).position.y = (-h + unten) / 2
        // Fensterband auf beiden Seiten, knapp vor der Wand
        const band = new THREE.BoxGeometry(W * 1.03, H * 0.22, (L - kopf) * 0.92)
        mesh(band, schwarz).position.set(0, h - r - H * 0.08, hinten ? kopf / 2 : -kopf / 2)
        // Übergang zum nächsten Wagen
        if (i < ZUG_WAGEN) {
          const luecke = ZUG_LUECKE_M / 1000
          mesh(new THREE.BoxGeometry(W * 0.8, H * 0.78, luecke + 0.002), schwarz).position.set(0, unten / 2 + h / 2 - H * 0.02, -L / 2 - luecke / 2)
        }
        if (i === 0 || hinten) {
          // Kopf: derselbe Querschnitt wie der Kasten, der nach vorne in einer Rundung niedriger wird, so geht er
          // ohne Stufe aus dem Kasten hervor (Michael, 2026-10-07: «Siehst du die Stufe?»); rot nur die Spitze
          const z0 = L / 2 - kopf, z1 = L / 2, c = kopf * 0.75, p0y = unten + H * 0.25
          // die Rundung von der Seite: z = z1 - c·t², oben von p0y (t = 0, vorne) bis zum Dach (t = 1)
          const zBei = (t: number) => z1 - c * t * t
          const obenBei = (z: number) => {
            if (z <= z1 - c) return h
            const t = Math.sqrt((z1 - z) / c)
            return (1 - t) * (1 - t) * p0y + (1 - (1 - t) * (1 - t)) * h
          }
          let schnitt = quer.getPoints(6)
          if (schnitt[0].equals(schnitt[schnitt.length - 1])) schnitt = schnitt.slice(0, -1)
          /** Ringe des Querschnitts an den Stellen zs, je nach oben gestaucht; offen = nur ein Stück des Rings */
          const loft = (zs: number[], punkte: THREE.Vector2[], geschlossen: boolean, weiter = 1, deckel = false) => {
            const pos: number[] = [], idx: number[] = []
            const n = punkte.length
            for (const z of zs) {
              const f = (obenBei(z) - unten) / (h - unten)
              for (const q of punkte) pos.push(q.x * weiter, unten + (q.y - unten) * f * weiter, z)
            }
            for (let j = 0; j < zs.length - 1; j++) {
              for (let k = 0; k < (geschlossen ? n : n - 1); k++) {
                const a0 = j * n + k, a1 = j * n + ((k + 1) % n), b0 = a0 + n, b1 = a1 + n
                idx.push(a0, a1, b1, a0, b1, b0)
              }
            }
            if (deckel) {
              // vorne zu: ein Fächer um die Mitte des letzten Rings
              const m = pos.length / 3, j = zs.length - 1
              pos.push(0, unten + (obenBei(zs[j]) - unten) / 2, zs[j])
              for (let k = 0; k < n; k++) idx.push(j * n + k, j * n + ((k + 1) % n), m)
            }
            const geo = new THREE.BufferGeometry()
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
            geo.setIndex(idx)
            geo.computeVertexNormals()
            return geo
          }
          const T = 0.62, stufen = 14
          const tReihe = (von: number, bis: number, k: number) => Array.from({ length: k + 1 }, (_, i) => von + (bis - von) * (i / k))
          hell.side = THREE.DoubleSide
          // beim Steuerwagen ist die Spitze hell, und alles ist um die Senkrechte gedreht, nach hinten gerichtet
          // jede Spitze mit eigener Farbe: rot ist immer die in Fahrtrichtung (Michael, 2026-10-08: «Rot muss immer
          // vorne … sein»), siehe spitzenFaerben
          const spitze = new THREE.MeshLambertMaterial({ color: hinten ? ZUG_HELL : FARBEN.zug, side: THREE.DoubleSide })
          materialien.push(spitze)
          const kopfteil = (geo: THREE.BufferGeometry, mat: THREE.Material) => { if (hinten) geo.rotateY(Math.PI); return mesh(geo, mat) }
          kopfteil(loft([z0, ...tReihe(1, T, 6).map(zBei)], schnitt, true), hell)
          kopfteil(loft(tReihe(T, 0, stufen).map(zBei), schnitt, true, 1, true), spitze).userData.spitze = hinten ? 'hinten' : 'vorn'
          // Frontscheibe: der obere Teil des Querschnitts, eng auf der Rundung
          const scheibeSchnitt = schnitt.filter((q) => q.y >= unten + 0.55 * (h - unten))
          const scheibe = new THREE.MeshLambertMaterial({ color: ZUG_DUNKEL, side: THREE.DoubleSide })
          materialien.push(scheibe)
          kopfteil(loft(tReihe(0.55, 0.12, 8).map(zBei), scheibeSchnitt, false, 1.015), scheibe)
        }
        // im Tunnel derselbe Wagen halb durchsichtig über dem Berg; beide werden am Portal geschnitten, so
        // wechselt der Wagen nicht auf einmal, sondern fliessend (Michael, 2026-10-07: «wagen für wagen … verfeinern»)
        const ebeneAussen = new THREE.Plane(), ebeneDrin = new THREE.Plane()
        const durch = g.clone()
        const ersatz = new Map<THREE.Material, THREE.Material>()
        durch.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return
          const alt = o.material as THREE.Material
          if (!ersatz.has(alt)) {
            const m = alt.clone()
            m.transparent = true; m.opacity = 0.35; m.depthTest = false; m.clippingPlanes = [ebeneDrin]
            ersatz.set(alt, m)
          }
          o.material = ersatz.get(alt)!
          o.renderOrder = 5
        })
        for (const m of materialien) m.clippingPlanes = [ebeneAussen]
        szene.add(g, durch)
        zugTeile.push({ netz: g, durch, ebeneAussen, ebeneDrin, ab, laenge })
        ab += laenge + ZUG_LUECKE_M
      }
    }
    /** rot die Spitze in Fahrtrichtung: vorwärts die Lok, zurück der Steuerwagen, die andere hell */
    let gefaerbt = 1
    const spitzenFaerben = (richtung: number) => {
      gefaerbt = richtung
      for (const t of zugTeile) {
        for (const teil of [t.netz, t.durch]) {
          teil.traverse((o) => {
            const wo = o.userData.spitze
            if (!wo || !(o instanceof THREE.Mesh)) return
            ;(o.material as THREE.MeshLambertMaterial).color.set((wo === 'vorn') === (richtung > 0) ? FARBEN.zug : ZUG_HELL)
          })
        }
      }
    }
    const oben = new THREE.Vector3(0, 1, 0), richtungZug = new THREE.Vector3()
    const augeLage = new THREE.Vector3(), lokWelt = new THREE.Vector3()
    /** die Lok vorne bei s, die Wagen dahinter, je mit seiner Mitte auf der Linie */
    const zugSetzen = (s: number | null) => {
      for (const t of zugTeile) {
        const halb = (t.laenge * zugMass) / 2
        const mitte = s === null ? 0 : s - t.ab * zugMass - halb
        // im Führerstand sitzt man im Zug selbst
        const sichtbar = s !== null && imStueck(mitte) && !imStand
        t.netz.visible = sichtbar
        t.durch.visible = false
        if (!sichtbar) continue
        const a = punkt3d(Math.max(pk[0].m, mitte - halb)), b = punkt3d(Math.min(pk[pk.length - 1].m, mitte + halb))
        t.netz.position.copy(a).add(b).multiplyScalar(0.5)
        t.netz.position.y += (ZUG_HOEHE * zugMass) / 2
        // nur um die Senkrechte drehen und vorn und hinten neigen, nie zur Seite kippen (Michael, 2026-10-07)
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, flach = Math.hypot(dx, dz)
        if (flach > 0) t.netz.rotation.set(-Math.max(-ZUG_NEIGUNG_MAX, Math.min(ZUG_NEIGUNG_MAX, Math.atan2(dy, flach))), Math.atan2(dx, dz), 0, 'YXZ')
        t.netz.scale.setScalar(zugMass)
        t.durch.position.copy(t.netz.position); t.durch.rotation.copy(t.netz.rotation); t.durch.scale.copy(t.netz.scale)
        // ein Wagen ganz draussen, ganz drin oder über einem Portal; dort schneidet eine Ebene quer zur Linie
        const von = mitte - halb, bis = mitte + halb
        const tunnel = weg.bauwerke.filter((x) => x.art === 'tunnel' && x.bis > von && x.von < bis)
        const ganzDrin = tunnel.some((x) => x.von <= von && x.bis >= bis)
        // ohne Schnitt: Ebenen weit weg, die nichts abschneiden bzw. alles
        t.ebeneAussen.set(oben, 1e6); t.ebeneDrin.set(oben, 1e6)
        if (ganzDrin) { t.netz.visible = false; t.durch.visible = true }
        else if (tunnel.length) {
          // das nächste Portal im Wagen: Einfahrt (der Tunnel liegt vorn) oder Ausfahrt (er liegt hinten)
          const x = tunnel[0]
          const einfahrt = x.von > von
          const sp = einfahrt ? x.von : x.bis
          const p = punkt3d(sp), q = punkt3d(Math.min(pk[pk.length - 1].m, sp + 5))
          const vorn = richtungZug.copy(q).sub(p).normalize()
          // three.js schneidet weg, was auf der negativen Seite liegt
          t.ebeneAussen.setFromNormalAndCoplanarPoint(einfahrt ? vorn.clone().negate() : vorn, p)
          t.ebeneDrin.setFromNormalAndCoplanarPoint(einfahrt ? vorn : vorn.clone().negate(), p)
          // in der Brille steht alles in einem verschobenen Modell: die Ebenen in Weltkoordinaten
          const welt = t.netz.parent?.matrixWorld
          if (welt) { t.ebeneAussen.applyMatrix4(welt); t.ebeneDrin.applyMatrix4(welt) }
          t.durch.visible = true
        }
      }
    }

    const steuerung = new OrbitControls(kamera, renderer.domElement)
    steuerung.enableDamping = true
    steuerung.maxPolarAngle = Math.PI * 0.49
    steuerung.minDistance = 1
    steuerung.maxDistance = 120
    // ausgerichtet auf das Gezeichnete, Blick von Norden oder bei breiten Strecken von Westen
    const gezeichnet = pk.filter((p) => imStueck(p.m))
    const xs = gezeichnet.map((p) => X(p.e)), zs = gezeichnet.map((p) => Z(p.n))
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
    const cz = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0
    // die Breite zählt im Hochformat mehr: sonst ragt eine Strecke von Westen nach Osten links und rechts hinaus
    const seitenverhaeltnis = Math.max(0.5, el.clientWidth / Math.max(1, zug ? el.clientHeight : Math.min(window.innerHeight * 0.7, el.clientWidth * 1.1)))
    const breitX = xs.length ? Math.max(...xs) - Math.min(...xs) : 0, tiefZ = zs.length ? Math.max(...zs) - Math.min(...zs) : 0
    // Strecken von West nach Osten von Westen her ansehen: so läuft die Linie im Bild nach oben,
    // die Namen stehen untereinander statt sich nebeneinander zu drängen
    const vonWesten = breitX > tiefZ * 1.3
    const spanne = !xs.length ? 40 : vonWesten ? Math.max(tiefZ * 1.3 / seitenverhaeltnis, breitX * 1.35, 5)
      : Math.max(breitX * 1.3 / seitenverhaeltnis, tiefZ, 5)
    steuerung.target.set(cx, Y(1500), cz)
    if (vonWesten) kamera.position.set(cx - spanne * 1.0, spanne * 0.85, cz + spanne * 0.15)
    else kamera.position.set(cx - spanne * 0.3, spanne * 0.85, cz - spanne * 1.0)
    steuerung.update()

    const groesseSetzen = () => {
      const b = el.clientWidth
      // auf der eigenen Seite bestimmt die Breite die Höhe, beim Fahren der Rahmen
      const hh = zug ? el.clientHeight : Math.round(Math.min(window.innerHeight * 0.7, b * 1.1))
      if (!b || !hh) return
      renderer.setSize(b, hh)
      for (const lm of linienMaterialien) lm.resolution.set(b, hh)
      aufloesung.set(b, hh)
      kamera.aspect = b / hh
      kamera.updateProjectionMatrix()
    }
    groesseSetzen()
    const beobachter = new ResizeObserver(groesseSetzen)
    beobachter.observe(el)

    // Schilder, die ein wichtigeres verdecken würden, ausblenden; bei gleichem Rang gewinnt das nähere
    const projiziert = new THREE.Vector3()
    const kameraLokal = new THREE.Vector3()
    const schilderOrdnen = () => {
      // in der Brille zählt das linke Auge, mit seinem Ausschnitt
      let kam: THREE.PerspectiveCamera = kamera
      let b = renderer.domElement.clientWidth, hh = renderer.domElement.clientHeight
      if (renderer.xr.isPresenting) {
        const auge = renderer.xr.getCamera().cameras[0] as (THREE.PerspectiveCamera & { viewport?: THREE.Vector4 }) | undefined
        if (!auge?.viewport) return
        kam = auge; b = auge.viewport.z; hh = auge.viewport.w
      }
      const pm = kam.projectionMatrix.elements
      const mass = modell.scale.x
      modell.worldToLocal(kam.getWorldPosition(kameraLokal))
      const belegt: Array<[number, number, number, number]> = []
      const liste = schilder.map((x) => ({ ...x, abstand: x.sp.position.distanceToSquared(kameraLokal) }))
        .sort((a, c) => a.rang - c.rang || a.folge - c.folge || a.abstand - c.abstand)
      for (const { sp, rang, abstand, lagen } of liste) {
        if (sp.parent && !sp.parent.visible) continue
        // Kulturgüter nur nah an der Kamera, sonst überdecken ihre Namen im Mittelland alles
        if (rang >= 3 && abstand > NAH_KULTUR ** 2) { sp.visible = false; continue }
        sp.getWorldPosition(projiziert).project(kam)
        if (projiziert.z > 1 || projiziert.z < -1) { sp.visible = false; continue }
        const breite = sp.scale.x * mass * pm[0] * b / 2, hoehe = sp.scale.y * mass * pm[5] * hh / 2
        const px = (projiziert.x + 1) / 2 * b, py = (1 - projiziert.y) / 2 * hh
        // Lagen um den Punkt, meist rechts oben, links oben, rechts unten, links unten, bei Bahnhöfen
        // über dem Mast; die erste, die frei ist und ganz im Bild liegt, gilt
        sp.visible = false
        for (const [cx, cy] of lagen) {
          const x0 = px - cx * breite, x1 = x0 + breite
          const y0 = py - (1 - cy) * hoehe, y1 = y0 + hoehe
          if (x0 < 2 || x1 > b - 2 || y0 < 2 || y1 > hh - 2) continue
          if (belegt.some(([a0, c0, a1, c1]) => x0 < a1 + 4 && x1 > a0 - 4 && y0 < c1 + 2 && y1 > c0 - 2)) continue
          sp.center.set(cx, cy)
          sp.visible = true
          belegt.push([x0, y0, x1, y1])
          break
        }
      }
    }

    // alles Gezeichnete in eine Gruppe, die in der Brille als Modell auf dem Tisch steht
    const modell = new THREE.Group()
    modell.add(...szene.children)
    szene.add(modell)
    const hintergrund = szene.background
    /** in der Brille: je Bild die Tasten auswerten (Sekunden seit dem letzten Bild) */
    let brilleSchritt: ((dt: number) => void) | null = null
    /** in der Brille: die Tafel mit den Tasten zeigen */
    let tafelZeigen: (() => void) | null = null
    /** die Probefahrt auf der eigenen Seite: Stelle in Metern, ob sie läuft, Tempo als Vielfaches;
     *  «signal» ist der letzte Start von der Seite (probe), ein neuer beginnt von vorn */
    const fahrt = { s: null as number | null, laeuft: false, tempo: 1, signal: null as number | null, gestartet: false,
                    /** 1 vorwärts, -1 zurück: dann fährt der Steuerwagen voraus wie bei einem Pendelzug */
                    richtung: 1,
                    /** «Zug fahren» auf dem Bildschirm, im nächsten Bild ausgeführt */
                    losWunsch: false,
                    /** Anteil der vollen Geschwindigkeit: steigt nach dem Anfahren in ANFAHREN_S auf 1 */
                    anteil: 0 }
    if (fahrknopf) {
      fahrknopf.current = {
        los: () => {
          if (probe && probe.current === null) (probe as React.MutableRefObject<number | null>).current = performance.now()
          fahrt.losWunsch = true
        },
        halt: () => { fahrt.laeuft = false },
      }
    }
    /** in der Brille: am Ziel die Knöpfe «Fahrt wiederholen», «Zurückfahren», «Fahrt beenden» zeigen */
    let menueZeigen: (() => void) | null = null
    /** so lang ist der Zug jetzt auf dem Weg, in dessen Metern */
    const zugLaengeS = () => {
      const t = zugTeile[zugTeile.length - 1]
      return t ? (t.ab + t.laenge) * zugMass : 0
    }
    if (brille) {
      let tiefst = Infinity
      for (let i = 1; i < pos.length; i += 3) if (pos[i] !== Y(KEINE_HOEHE)) tiefst = Math.min(tiefst, pos[i])
      // Schilder und Zug behalten ihre Grösse, die Gruppe darüber schrumpft sie sonst mit
      const massAnpassen = (s: number) => {
        for (const { sp, grundMass } of schilder) sp.scale.set(grundMass[0] / s, grundMass[1] / s, 1)
        zugMassBrille = Math.max(1, BRILLE_ZUG_M / (ZUG_BREITE * s))
        zugMass = zugMassBrille
      }
      const setzen = () => {
        modell.scale.setScalar(brilleMass)
        modell.position.set(0, BRILLE_TISCH_M - tiefst * brilleMass, -BRILLE_ABSTAND_M)
        modell.rotation.set(0, 0, 0)
        massAnpassen(brilleMass)
      }

      // Tasten (Michael, 2026-10-06: «die Landschaft mit den beiden Abzügen aufheben und anders hinstellen»):
      // ein Abzug gehalten trägt das Modell mit der Hand, waagrecht; beide Abzüge ziehen es grösser oder
      // kleiner und drehen es; der Thumbstick dreht und hebt; die Greiftaste stellt es zurück an den Anfang.
      // Mit Handtracking gilt das Zusammenführen von Daumen und Zeigefinger als Abzug.
      const steuer = [0, 1].map((i) => renderer.xr.getController(i))
      const haelt = new Set<THREE.Object3D>()
      const lage = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
      const gieren = (o: THREE.Object3D) => {
        const v = new THREE.Vector3(0, 0, -1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()))
        return Math.atan2(-v.x, -v.z)
      }
      // was beim Anfassen galt: Lage der Hand(e) und des Modells
      let griff: { p: THREE.Vector3; gier: number; abstand: number; m: THREE.Vector3; r: number; s: number } | null = null
      const anfassen = () => {
        const h = [...haelt]
        if (!h.length) { griff = null; return }
        const [a, b] = h.map(lage)
        griff = h.length === 1
          ? { p: a, gier: gieren(h[0]), abstand: 0, m: modell.position.clone(), r: modell.rotation.y, s: modell.scale.x }
          : { p: a.clone().add(b).multiplyScalar(0.5), gier: Math.atan2(b.x - a.x, b.z - a.z), abstand: Math.max(0.02, a.distanceTo(b)),
              m: modell.position.clone(), r: modell.rotation.y, s: modell.scale.x }
      }
      for (const c of steuer) {
        c.addEventListener('selectstart', () => {
          // zeigt der Strahl auf einen Knopf am Ziel, gilt der Knopf, nicht das Tragen
          if (knopfUnter?.(c)) return
          haelt.add(c); anfassen()
        })
        c.addEventListener('selectend', () => { haelt.delete(c); anfassen() })
        // rechte Greiftaste: Modell zurück; linke: Zuggeräusch ein und aus (Michael, 2026-10-08: «mit der linken Taste mit
        // dem Mittelfinger»)
        c.addEventListener('squeeze', (e) => {
          if ((e as { data?: XRInputSource }).data?.handedness === 'left') {
            void audioKontext()?.resume()
            const jetzt = audioLesen()
            audioSetzen({ zuggeraeusch: !jetzt.zuggeraeusch })
            hinweisZeigen(!jetzt.an ? 'Töne sind in den Einstellungen aus' : jetzt.zuggeraeusch ? 'Zuggeräusch aus' : 'Zuggeräusch an')
            return
          }
          haelt.clear(); griff = null; setzen()
        })
        szene.add(c)
      }
      const um = new THREE.Vector3()
      const gedrueckt = new Set<string>()
      /** trifft der Strahl dieses Controllers einen Knopf am Ziel? Dann ist er schon ausgelöst */
      let knopfUnter: ((c: THREE.Object3D) => boolean) | null = null
      // ein kurzer Hinweis über dem Modell, wenn sich die Probefahrt ändert
      const hinweisLeinwand = document.createElement('canvas')
      hinweisLeinwand.width = 512; hinweisLeinwand.height = 96
      const hinweisTextur = new THREE.CanvasTexture(hinweisLeinwand)
      hinweisTextur.colorSpace = THREE.SRGBColorSpace
      const hinweis = new THREE.Sprite(new THREE.SpriteMaterial({ map: hinweisTextur, depthTest: false }))
      hinweis.scale.set(0.24, 0.045, 1)
      hinweis.renderOrder = 6
      hinweis.visible = false
      szene.add(hinweis)
      let hinweisBis = 0
      const tempoText = (t: number) => (t === 1 ? 'im Grundtempo' : `${t.toLocaleString('de-CH')}-fach`)
      const hinweisZeigen = (text: string, dauer = 2000) => {
        const g = hinweisLeinwand.getContext('2d')!
        g.clearRect(0, 0, 512, 96)
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.roundRect(0, 0, 512, 96, 16); g.fill()
        g.fillStyle = '#212121'; g.font = 'bold 44px Helvetica, Arial, sans-serif'; g.textAlign = 'center'
        g.fillText(text, 256, 63)
        hinweisTextur.needsUpdate = true
        hinweis.visible = true
        hinweisBis = performance.now() + dauer
      }
      // Tafel mit den Tasten beim Betreten der Brille (Michael, 2026-10-08: «kurze Instruktion … Tastenbelegung»),
      // mitten im Blick; sie bleibt, bis man sie mit «Schliessen» (Strahl und Abzug) oder A schliesst (Michael, 2026-10-08:
      // «manuell schliessen … per Schliessen-Button»); erst das nächste A startet die Probefahrt
      const tafelLeinwand = document.createElement('canvas')
      tafelLeinwand.width = 1024; tafelLeinwand.height = 780
      {
        const g = tafelLeinwand.getContext('2d')!
        g.fillStyle = 'rgba(255,255,255,0.94)'; g.beginPath(); g.roundRect(0, 0, 1024, 780, 24); g.fill()
        g.fillStyle = '#212121'; g.font = 'bold 48px Helvetica, Arial, sans-serif'
        g.fillText('Tasten', 48, 84)
        const zeilen: Array<[string, string]> = [
          ['A', 'Probefahrt starten'], ['B', 'anhalten'], ['X / Y', 'langsamer / schneller'],
          ['Abzug halten', 'Modell tragen'], ['Beide Abzüge', 'grösser, kleiner, drehen'],
          ['Thumbstick', 'drehen, heben, senken'], ['Greiftaste rechts', 'Modell zurück an den Anfang'],
          ['Greiftaste links', 'Zuggeräusch ein, aus'],
        ]
        zeilen.forEach(([taste, was], i) => {
          const y = 160 + i * 62
          g.font = 'bold 38px Helvetica, Arial, sans-serif'; g.fillStyle = '#a8102e'; g.fillText(taste, 48, y)
          g.font = '38px Helvetica, Arial, sans-serif'; g.fillStyle = '#212121'; g.fillText(was, 390, y)
        })
        g.font = '32px Helvetica, Arial, sans-serif'; g.fillStyle = '#767676'
        g.fillText('A und B rechts, X und Y links.', 48, 666)
        // wie auf der Seite davor: hier ist ein Modell, kein Abbild (Michael, 2026-10-08)
        g.fillStyle = '#a8102e'; g.font = 'bold 32px Helvetica, Arial, sans-serif'
        g.fillText('Ein Modell, kein Abbild: vieles ist nicht massstäblich.', 48, 732)
      }
      const tafelTextur = new THREE.CanvasTexture(tafelLeinwand)
      tafelTextur.colorSpace = THREE.SRGBColorSpace
      const tafel = new THREE.Group()
      const tafelFlaeche = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.3352),
        new THREE.MeshBasicMaterial({ map: tafelTextur, transparent: true, depthTest: false }))
      tafelFlaeche.renderOrder = 7
      tafel.add(tafelFlaeche)
      tafel.visible = false
      szene.add(tafel)
      // ein roter Pfeil zeigt von oben auf die Lok, solange der Zug noch nicht fährt, und wippt dabei
      // (Michael, 2026-10-08: «damit man gleich sieht, wo der Zug jetzt steht»); durch Berge hindurch sichtbar
      const pfeil = new THREE.Group()
      {
        const rot = new THREE.MeshBasicMaterial({ color: FARBEN.zug, depthTest: false })
        const spitze = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 16), rot)
        spitze.rotation.x = Math.PI
        spitze.position.y = 0.015
        const schaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 8), rot)
        schaft.position.y = 0.055
        pfeil.add(spitze, schaft)
        pfeil.traverse((o) => { o.renderOrder = 8 })
      }
      pfeil.visible = false
      szene.add(pfeil)
      const lokLage = new THREE.Vector3()
      tafelZeigen = () => { tafel.visible = true }

      // am Ziel drei Knöpfe vor den Augen (Michael, 2026-10-08: «Fahrt wiederholen oder zurückfahren oder Fahrt
      // beenden»): mit dem Strahl zielen und mit dem Abzug drücken, oder A, X und B
      const menue = new THREE.Group()
      menue.visible = false
      szene.add(menue)
      const knopfFlaeche = (text: string, taste: string, haupt: boolean) => {
        const lw = document.createElement('canvas')
        lw.width = 768; lw.height = 160
        const g = lw.getContext('2d')!
        g.fillStyle = haupt ? '#a8102e' : '#ffffff'; g.beginPath(); g.roundRect(4, 4, 760, 152, 24); g.fill()
        if (!haupt) { g.strokeStyle = '#e5e5e5'; g.lineWidth = 4; g.stroke() }
        g.fillStyle = haupt ? '#ffffff' : '#212121'; g.font = 'bold 60px Helvetica, Arial, sans-serif'; g.fillText(text, 44, 100)
        g.font = '48px Helvetica, Arial, sans-serif'; g.fillStyle = haupt ? '#ffffff' : '#767676'; g.textAlign = 'right'; g.fillText(taste, 724, 98)
        const tex = new THREE.CanvasTexture(lw)
        tex.colorSpace = THREE.SRGBColorSpace
        return new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.0625),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }))
      }
      const titel = (() => {
        const lw = document.createElement('canvas')
        lw.width = 768; lw.height = 110
        const g = lw.getContext('2d')!
        g.fillStyle = 'rgba(255,255,255,0.94)'; g.beginPath(); g.roundRect(4, 4, 760, 102, 24); g.fill()
        g.fillStyle = '#212121'; g.font = 'bold 56px Helvetica, Arial, sans-serif'; g.fillText('Am Ziel', 44, 74)
        const tex = new THREE.CanvasTexture(lw)
        tex.colorSpace = THREE.SRGBColorSpace
        return new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.043), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }))
      })()
      const anfangS = pk[0].m, endeS = pk[pk.length - 1].m
      const aktionen: Array<{ netz: THREE.Mesh; tun: () => void }> = [
        { netz: knopfFlaeche('Fahrt wiederholen', 'A', true), tun: () => {
          fahrt.s = fahrt.richtung > 0 ? Math.min(endeS, anfangS + zugLaengeS()) : endeS
          fahrt.laeuft = true
        } },
        { netz: knopfFlaeche('Zurückfahren', 'X', false), tun: () => { fahrt.richtung = -fahrt.richtung; fahrt.laeuft = true } },
        { netz: knopfFlaeche('Fahrt beenden', 'B', false), tun: () => { void renderer.xr.getSession()?.end() } },
      ]
      // «Schliessen» unter der Tafel mit den Tasten
      const schliessen = knopfFlaeche('Schliessen', 'A', true)
      schliessen.position.y = -0.205
      schliessen.renderOrder = 8
      tafel.add(schliessen)
      titel.position.y = 0.075
      aktionen.forEach(({ netz }, k) => { netz.position.y = -k * 0.075; netz.renderOrder = 9; menue.add(netz) })
      titel.renderOrder = 9
      menue.add(titel)
      const waehlen = (k: number) => { menue.visible = false; aktionen[k].tun() }
      menueZeigen = () => {
        // 0,8 m vor den Augen, waagrecht in Blickrichtung, der Person zugewandt
        const auge = renderer.xr.getCamera()
        const kopf = auge.getWorldPosition(new THREE.Vector3())
        const vorn = new THREE.Vector3(0, 0, -1).applyQuaternion(auge.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize()
        menue.position.copy(kopf).addScaledVector(vorn, 0.8).add(new THREE.Vector3(0, -0.05, 0))
        menue.lookAt(kopf.x, menue.position.y, kopf.z)
        menue.visible = true
      }
      // Strahlen aus den Controllern, nur solange die Knöpfe zu sehen sind
      const strahlen = steuer.map((c) => {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1.5)]),
          new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthTest: false }))
        l.visible = false
        l.renderOrder = 9
        c.add(l)
        return l
      })
      const strahl = new THREE.Raycaster()
      const getroffen = (c: THREE.Object3D) => {
        strahl.setFromXRController(c as THREE.XRTargetRaySpace)
        const t = strahl.intersectObjects(aktionen.map((x) => x.netz), false)[0]
        return t ? aktionen.findIndex((x) => x.netz === t.object) : -1
      }
      knopfUnter = (c) => {
        if (tafel.visible) {
          strahl.setFromXRController(c as THREE.XRTargetRaySpace)
          if (!strahl.intersectObject(schliessen, false).length) return false
          tafel.visible = false
          return true
        }
        if (!menue.visible) return false
        const k = getroffen(c)
        if (k < 0) return false
        waehlen(k)
        return true
      }
      brilleSchritt = (dt) => {
        const h = [...haelt]
        if (griff && h.length === 1) {
          const p = lage(h[0]), d = gieren(h[0]) - griff.gier
          um.copy(griff.m).sub(griff.p).applyAxisAngle(new THREE.Vector3(0, 1, 0), d)
          modell.position.copy(p).add(um)
          modell.rotation.y = griff.r + d
        } else if (griff && h.length === 2) {
          const [a, b] = h.map(lage)
          const mitte = a.clone().add(b).multiplyScalar(0.5)
          const f = Math.min(8, Math.max(0.125, a.distanceTo(b) / griff.abstand))
          // grösser bis 8-fach, lange Strecken bis 0,3 m je km wie eine Bergstrecke (Michael, 2026-10-08: «nur begrenzt
          // zum Zug herangehen»)
          const s = Math.min(Math.max(brilleMass * 8, BRILLE_GROESST_M_JE_KM), Math.max(brilleMass / 4, griff.s * f))
          const d = Math.atan2(b.x - a.x, b.z - a.z) - griff.gier
          um.copy(griff.m).sub(griff.p).multiplyScalar(s / griff.s).applyAxisAngle(new THREE.Vector3(0, 1, 0), d)
          modell.position.copy(mitte).add(um)
          modell.rotation.y = griff.r + d
          modell.scale.setScalar(s)
          massAnpassen(s)
        }
        // A startet die Probefahrt oder setzt sie fort, B hält sie an, X langsamer, Y schneller
        // (Michael, 2026-10-06); A und B rechts, X und Y links, je Knopf 4 und 5 der Quest
        if (probe && zug === eigenerZug) {
          for (const quelle of renderer.xr.getSession()?.inputSources ?? []) {
            const knoepfe = quelle.gamepad?.buttons
            if (!knoepfe) continue
            for (const nr of [4, 5]) {
              const schluessel = `${quelle.handedness}${nr}`, an = !!knoepfe[nr]?.pressed
              if (an && !gedrueckt.has(schluessel) && menue.visible) {
                // am Ziel: A wiederholt, X fährt zurück, B beendet
                const rechts = quelle.handedness === 'right'
                if (rechts && nr === 4) waehlen(0)
                else if (!rechts && nr === 4) waehlen(1)
                else if (rechts && nr === 5) waehlen(2)
              } else if (an && !gedrueckt.has(schluessel) && tafel.visible) {
                // solange die Tafel steht, schliesst A sie, sonst nichts
                if (quelle.handedness === 'right' && nr === 4) tafel.visible = false
              } else if (an && !gedrueckt.has(schluessel)) {
                const rechts = quelle.handedness === 'right'
                if (rechts && nr === 4) { fahrt.s ??= pk[0].m; fahrt.laeuft = true; fahrt.gestartet = true }
                else if (rechts) fahrt.laeuft = false
                // X langsamer, Y schneller (Michael, 2026-10-08: «kehre sie um»)
                else if (nr === 4) fahrt.tempo = Math.max(0.25, fahrt.tempo / 2)
                else fahrt.tempo = Math.min(16, fahrt.tempo * 2)
                hinweisZeigen(fahrt.laeuft ? `Probefahrt ${tempoText(fahrt.tempo)}` : 'Probefahrt angehalten')
              }
              if (an) gedrueckt.add(schluessel); else gedrueckt.delete(schluessel)
            }
          }
        }
        // die Knöpfe am Ziel: Strahlen zeigen, der getroffene Knopf wird etwas dunkler
        strahlen.forEach((l) => { l.visible = menue.visible || tafel.visible })
        if (tafel.visible) {
          const t = steuer.some((c) => { strahl.setFromXRController(c as THREE.XRTargetRaySpace); return strahl.intersectObject(schliessen, false).length > 0 })
          ;(schliessen.material as THREE.MeshBasicMaterial).color.setScalar(t ? 0.8 : 1)
        }
        if (menue.visible) {
          const treffer = new Set(steuer.map(getroffen))
          aktionen.forEach(({ netz }, k) => { (netz.material as THREE.MeshBasicMaterial).color.setScalar(treffer.has(k) ? 0.8 : 1) })
        }
        const lok = zugTeile[0]
        // nur bis zum ersten A; nach einem Halt mit B bleibt er weg (Michael, 2026-10-08)
        pfeil.visible = !!probe && zug === eigenerZug && fahrt.s !== null && !fahrt.gestartet && !!lok?.netz.visible
        if (pfeil.visible) {
          lok.netz.getWorldPosition(lokLage)
          // knapp über dem Zug, wippt 1,5 cm auf und ab, etwa einmal pro Sekunde
          pfeil.position.copy(lokLage).add(new THREE.Vector3(0, 0.02 + 0.015 * (1 + Math.sin(performance.now() / 160)), 0))
        }
        if (tafel.visible) {
          // mitten im Blick, 1 m vor den Augen
          const auge = renderer.xr.getCamera()
          const blick = auge.getWorldQuaternion(new THREE.Quaternion())
          const vorn = new THREE.Vector3(0, 0.05, -1).normalize().applyQuaternion(blick)
          tafel.position.copy(auge.getWorldPosition(new THREE.Vector3())).addScaledVector(vorn, 1)
          tafel.quaternion.copy(blick)
        }
        if (hinweis.visible) {
          // am Blick, nicht am Modell: etwas unter der Mitte der Sicht, 0,9 m vor den Augen, so bleibt er im
          // Ausschnitt, wo immer das Modell steht (Michael, 2026-10-08)
          const auge = renderer.xr.getCamera()
          const vorn = new THREE.Vector3(0, -0.18, -1).normalize().applyQuaternion(auge.getWorldQuaternion(new THREE.Quaternion()))
          hinweis.position.copy(auge.getWorldPosition(new THREE.Vector3())).addScaledVector(vorn, 0.9)
          if (performance.now() > hinweisBis) hinweis.visible = false
        }
        // Thumbstick: links und rechts dreht, vor und zurück hebt und senkt
        for (const quelle of renderer.xr.getSession()?.inputSources ?? []) {
          const ax = quelle.gamepad?.axes
          if (!ax || ax.length < 4) continue
          const [x, y] = [ax[2], ax[3]].map((v) => (Math.abs(v) < 0.2 ? 0 : v))
          modell.rotation.y -= x * 1.2 * dt
          modell.position.y -= y * 0.4 * dt
        }
      }
      renderer.xr.addEventListener('sessionend', () => {
        modell.scale.setScalar(1); modell.position.set(0, 0, 0); modell.rotation.set(0, 0, 0)
        for (const { sp, grundMass } of schilder) sp.scale.set(grundMass[0], grundMass[1], 1)
        zugMass = 1
        menue.visible = false
        haelt.clear(); griff = null
        kamera.near = 0.1; kamera.updateProjectionMatrix()
        nurBild.visible = true; nurBrille.visible = false; seilBild.visible = true; seilBrille.visible = false
        szene.background = hintergrund
        groesseSetzen()
      })
      brille.current = async () => {
        const xr = navigator.xr
        if (!xr) return
        // mit Passthrough, wo die Brille es kann, sonst in einem leeren Raum
        const ar = await xr.isSessionSupported('immersive-ar').catch(() => false)
        const sitzung = await xr.requestSession(ar ? 'immersive-ar' : 'immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] })
        renderer.xr.setReferenceSpaceType('local-floor')
        // three gibt camera.near als depthNear an die Brille weiter
        kamera.near = BRILLE_NAHE_M; kamera.updateProjectionMatrix()
        await renderer.xr.setSession(sitzung)
        setzen()
        if (probe?.current != null) tafelZeigen?.()
        for (const z of zeichen) z.scale.setScalar(1)
        nurBild.visible = false; nurBrille.visible = true; seilBild.visible = false; seilBrille.visible = true
        szene.background = ar ? null : hintergrund
      }
    }

    // beim Fahren: die Kamera folgt dem Zug mit demselben Blickwinkel; am Anfang von schräg hinten
    let letzte: THREE.Vector3 | null = null
    let imStand = false
    let feinAb = -Infinity
    let laeuft = true
    const uhr = new THREE.Clock()
    const zeichenMass = () => Math.min(2, Math.max(0.15, kamera.position.distanceTo(steuerung.target) / ZUG_NORMAL_KM))
    const zeichnen = () => {
      if (!laeuft) return
      const dt = Math.min(0.1, uhr.getDelta())
      if (renderer.xr.isPresenting) brilleSchritt?.(dt)
      if (probe && zug === eigenerZug) {
        const anfang = pk[0].m, ende = pk[pk.length - 1].m
        if (probe.current !== fahrt.signal) {
          fahrt.signal = probe.current
          // der ganze Zug steht am Anfang auf der Strecke (sonst lagen die Wagen davor und der Zug war nicht zu
          // sehen), bis A ihn startet (Michael, 2026-10-08: «nicht automatisch starten»)
          fahrt.s = probe.current === null ? null : Math.min(ende, anfang + zugLaengeS())
          fahrt.laeuft = false
          fahrt.gestartet = false
          fahrt.tempo = 1
          fahrt.richtung = 1
        }
        if (fahrt.losWunsch && fahrt.s !== null) {
          fahrt.losWunsch = false
          // am Ziel beginnt «Zug fahren» wieder am Anfang
          if (fahrt.richtung > 0 ? fahrt.s >= ende : fahrt.s - zugLaengeS() <= anfang) {
            fahrt.richtung = 1
            fahrt.s = Math.min(ende, anfang + zugLaengeS())
          }
          fahrt.laeuft = true
          fahrt.gestartet = true
        }
        if (!fahrt.laeuft) fahrt.anteil = 0
        if (fahrt.laeuft && fahrt.s !== null) {
          // langsam anfahren und vor dem Ziel gleichmässig abbremsen, je in ANFAHREN_S (Michael, 2026-10-09: «in 2 sec
          // die normale Geschwindigkeit … am Schluss ebenso abbremsen»); der Bremsweg ist die halbe Strecke, die der
          // Zug in ANFAHREN_S mit voller Fahrt zurücklegt
          const voll = ((ende - anfang) / PROBE_DAUER_S) * fahrt.tempo
          fahrt.anteil = Math.min(1, fahrt.anteil + dt / ANFAHREN_S)
          const rest = fahrt.richtung > 0 ? ende - fahrt.s : fahrt.s - zugLaengeS() - anfang
          const bremsen = Math.sqrt(Math.max(0, rest) / (voll * ANFAHREN_S / 2))
          fahrt.s += fahrt.richtung * voll * Math.max(0.02, Math.min(fahrt.anteil, bremsen)) * dt
          // am Ziel anhalten und fragen, wie es weitergeht, statt von vorn zu beginnen (Michael, 2026-10-08)
          const vorneZiel = fahrt.richtung > 0 && fahrt.s >= ende
          const hintenZiel = fahrt.richtung < 0 && fahrt.s - zugLaengeS() <= anfang
          if (vorneZiel || hintenZiel) {
            fahrt.s = vorneZiel ? ende : Math.min(ende, anfang + zugLaengeS())
            fahrt.laeuft = false
            menueZeigen?.()
          }
        }
        eigenerZug.current = fahrt.s
        if (fahrt.richtung !== gefaerbt) spitzenFaerben(fahrt.richtung)
        if (fahrt.s === null) letzte = null
      }
      // Bahnhöfe, Gipfel und Kulturgüter gleich: aus der Nähe kleiner, aus der Ferne grösser
      if (!renderer.xr.isPresenting) {
        const f = zeichenMass()
        for (const z of zeichen) z.scale.setScalar(f)
        const abstand = kamera.position.distanceTo(steuerung.target)
        for (const lm of strichMaterialien) { lm.dashSize = abstand * STRICH_JE_KM; lm.gapSize = abstand * LUECKE_JE_KM }
        for (const { sp, y } of masten) sp.position.y = y + mastKm * f
      }
      if (hinterZug?.current) { hinterZug.current = false; letzte = null; if (blick) blick.current = null }
      if (zug) {
        const s = zug.current
        const sichtbar = s !== null && imStueck(s)
        // auf dem Bildschirm wächst der Zug mit dem Abstand der Kamera: beim Hineinzoomen kleiner,
        // aus der Ferne noch zu finden (Michael, 2026-10-07)
        if (!renderer.xr.isPresenting) zugMass = zeichenMass() * (zugVonAussen ? ZUG_FAHRT_FAKTOR : 1)
        else if (zugTeile.length) {
          // in der Brille aus der Nähe kleiner, aber nicht im gleichen Mass wie der Abstand (Michael, 2026-10-08:
          // «nicht gerade proportional, aber doch etwas verkleinert»): ab BRILLE_NAH_M voll, darunter mit der
          // Wurzel des Abstands, höchstens bis auf 40 %
          const abstand = renderer.xr.getCamera().getWorldPosition(augeLage).distanceTo(zugTeile[0].netz.getWorldPosition(lokWelt))
          zugMass = zugMassBrille * Math.max(0.4, Math.min(1, Math.sqrt(abstand / BRILLE_NAH_M)))
        }
        zugSetzen(s)
        // Führerstand: vorne an der Spitze in Fahrtrichtung, knapp über der Linie, der Blick auf einen Punkt
        // gemittelt 150 bis 450 m voraus, damit er in Kurven nicht zuckt; Drehen und Zoomen ruhen solange
        const vorne = !renderer.xr.isPresenting && !!fuehrerstand?.current && sichtbar
        if (vorne !== imStand) {
          imStand = vorne
          steuerung.enabled = !vorne
          kamera.near = vorne ? FUEHRERSTAND_NAHE_KM : 0.1
          kamera.updateProjectionMatrix()
          letzte = null
          if (blick) blick.current = null
          feinAb = -Infinity
          if (!vorne) { feinAuftrag++; feinWeg() }
        }
        if (vorne && s !== null) {
          const r = zug === eigenerZug ? fahrt.richtung : 1
          const spitze = r > 0 ? s : s - zugLaengeS()
          const bis = (m: number) => Math.max(pk[0].m, Math.min(pk[pk.length - 1].m, m))
          // das feine Gelände wandert mit, sobald der Zug FEIN_NACH_M weiter ist
          if (Math.abs(s - feinAb) > FEIN_NACH_M) {
            feinAb = s
            void feinSetzen(s, r)
          }
          const auge = feinPunkt3d(bis(spitze + r * 15))
          auge.y += FUEHRERSTAND_HOEHE_M * faktor / 1000
          const ziel = new THREE.Vector3()
          for (const d of [150, 300, 450]) ziel.add(feinPunkt3d(bis(spitze + r * d)))
          ziel.multiplyScalar(1 / 3)
          ziel.y = Math.max(ziel.y, auge.y - 0.02)
          kamera.position.copy(auge)
          steuerung.target.copy(ziel)
          kamera.lookAt(ziel)
        } else if (sichtbar) {
          const p = punkt3d(s)
          // in der Brille steht das Modell still, du schaust dem Zug von aussen zu
          if (renderer.xr.isPresenting) letzte = null
          else if (!letzte && blick?.current) {
            steuerung.target.copy(p)
            kamera.position.copy(p).add(blick.current)
          } else if (!letzte) {
            const hinten = punkt3d(Math.max(pk[0].m, s - 3000))
            const richtung = p.clone().sub(hinten).setY(0).normalize()
            steuerung.target.copy(p)
            kamera.position.copy(p).addScaledVector(richtung, -5).add(new THREE.Vector3(0, 3.2, 0))
          } else {
            const d = p.clone().sub(letzte)
            steuerung.target.add(d); kamera.position.add(d)
          }
          letzte = p
        }
      }
      // im Führerstand nicht: die Steuerung hielte sonst ihren Mindestabstand und zöge die Kamera hinter den Zug
      if (!imStand) steuerung.update()
      // das Nahbild folgt dem Blickpunkt, sobald er mehr als NAH_NACH_M weitergewandert ist
      if (luftbild && !renderer.xr.isPresenting && kamera.position.distanceTo(steuerung.target) < NAH_BIS_KM) {
        const e = steuerung.target.x * 1000 + me, n = -steuerung.target.z * 1000 + mn
        if (!nahMitte || Math.hypot(e - nahMitte[0], n - nahMitte[1]) > NAH_NACH_M) void nahSetzen(e, n)
      }
      if (blick && letzte) blick.current = kamera.position.clone().sub(steuerung.target)
      schilderOrdnen()
      renderer.render(szene, kamera)
    }
    // über die Schleife des Renderers, damit dieselbe Zeichnung auch in der Brille läuft
    renderer.setAnimationLoop(zeichnen)
    return () => {
      laeuft = false
      renderer.setAnimationLoop(null)
      void renderer.xr.getSession()?.end()
      if (brille) brille.current = null
      beobachter.disconnect()
      steuerung.dispose()
      szene.traverse((o) => {
        const x = o as THREE.Mesh
        x.geometry?.dispose()
        const mat = x.material as THREE.Material & { map?: THREE.Texture }
        mat?.map?.dispose(); mat?.dispose?.()
      })
      anwenden.current = null
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [r, h, faktor, weg, wegFarbe, zug, blick, brille, probe, zusatz, luftbild])
  return <div ref={rahmen} className={className} aria-label={`3D-Relief ${r.titel}`} role="img" />
}
