import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { bodenbedeckungLaden, flaechenLaden, holen, seenLaden, sehenswertLaden, streckenLaden, szeneLaden } from '../daten'
import type { BodenbedeckungDaten, FlaechenDaten, KodierterZug, SeenDaten, SehenswertDaten } from '../typen'
import { type FahrObjekt, type Fahrweg, gerundetM, wegEnde } from '../fahrt'
import type { ObjektText } from './Fahrtmodus'
import { type Ankuendigung, Fuehrerpult, type PultAussen, type TempoQuelle } from './Fuehrerpult'
import { lv95, MODELL_HOECHSTENS_M, useBrilleMoeglich } from '../relief'
import { audioKontext, audioLesen, audioSetzen, useAudio, zuggeraeuschAus, zuggeraeuschTempo } from '../audio'
import { ausschnittLaden, fensterLaden, fensterVorladen, KEINE_HOEHE, type Luftbild, luftbildLaden, type Nahbild, nahbildLaden, type Fein, feinLaden, feinHoehe, feinFeld, type Scharf, scharfLaden, scharfHoehe, scharfBild, SCHARF_KACHEL_M, SCHARF_PUNKTE, gebaeudeNamen, gebaeudeKachel, baumNamen, baumKachel } from '../gelaende'
import { Zurueck } from './Zurueck'
import { Ladefehler } from './Ladefehler'
import { Ladebalken } from './Ladebalken'
import { useEchtesVollbild, VollbildKnopf } from './Netzkarte'
import { type Kategorie, SehenswertLegende, useVersteckt } from './Sehenswert'
import { Klappe } from './Klappe'

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
/** das Auge im Führerstand so hoch über der Linie; vorher 4 m, damit fuhr man durch die Dächer der Perrons (Michael, 2026-10-15:
 *  «circa einen Meter tiefer … unter dem Dach der Bahnsteige durchfahren»), in keiner Quelle */
const FUEHRERSTAND_HOEHE_M = 3, FUEHRERSTAND_NAHE_KM = 0.003
/** Führerstand: feines Gelände (10 m) in einem Quadrat von FEIN_SEITE_M, die Mitte FEIN_VORAUS_M vor dem Zug, neu nach
 *  FEIN_NACH_M Fahrt; FEIN_RAND_M vor dem Rand geht die Linie wieder in die des groben Geländes über */
const FEIN_SEITE_M = 4000, FEIN_VORAUS_M = 1200, FEIN_NACH_M = 800, FEIN_PX_JE_M = 0.4, FEIN_RAND_M = 300
/** Linie im Führerstand: in Metern breit statt in Bildpunkten; Linie über dem feinen Gelände */
// 1,95 m breit, vorher 1,5 (Michael, 2026-10-13: «ca. 130 %»)
const FEIN_UEBER_M = 1
/** Schienen im Führerstand (Michael, 2026-10-14): Abstand der Mitten und Breite einer Schiene in Metern; Normalspur überall,
 *  die Spurweite einer Strecke steht in keiner Quelle; breiter als ein echter Schienenkopf (7 cm), sonst aus der Kabine kaum zu sehen */
const SPUR_M = 1.435 + 0.07, SCHIENE_M = 0.15
/** scharfe Umgebung (Versuch): Kacheln mit eigenem Luftbild bis SCHARF_BILD_M um einen Punkt SCHARF_VORAUS_M vor dem
 *  Zug, weiter als SCHARF_LOS_M wieder ohne; darunter sinkt das feine Gelände um SCHARF_TIEFER_M */
/** Führerstand: Brücken als Platte so dick (Breite: brueckeQuer) */
const BRUECKE_DICK_M = 1.8
/** Führerstand: Namen erst so nah an der Kamera (km) */
const SCHILD_FUEHRERSTAND_KM = 1
/** Führerstand: so weit vor und nach einem Tunnel fährt der Zug gerade auf das Portal zu */
const TUNNEL_ANLAUF_M = 150
/** Führerstand: Höhe der Linie als Median über so viele Meter davor und danach, dann gemittelt über so viele, und nach
 *  Brücken und Tunneln noch einmal über so viele */
const PROFIL_MEDIAN_M = 50, PROFIL_MITTEL_M = 40, PROFIL_UEBERGANG_M = 30
/** Führerstand: Täler und Buckel unter der Linie ohne Brücke oder Tunnel in den Daten: so breit höchstens, so tief
 *  mindestens, irgendwo so steil (Anteil, 0.08 = 8 %) */
const TAL_FENSTER_M = 1500, TAL_TIEFE_M = 6, TAL_STEIGUNG = 0.08
const SCHARF_BILD_M = 800, SCHARF_LOS_M = 1300, SCHARF_VORAUS_M = 400, SCHARF_TIEFER_M = 5
/** mit dem Tempo rückt der Punkt weiter voraus, so viele Sekunden Fahrt, höchstens so weit: bei 2'000 km/h fuhr der Zug sonst
 *  durch die Kacheln, bevor ihre Bilder geladen waren (Michael, 2026-10-14: bei Wankdorf «alles extrem unscharf») */
const SCHARF_VORAUS_S = 4, SCHARF_VORAUS_MAX_M = 1600
/** Führerstand im Tunnel: so dunkel, eingeblendet über so viele Meter ab dem Portal */
// im Tunnel bleibt vom Tageslicht nur so viel übrig (Michael, 2026-10-13: «dunkler, so dass es deutlich heller wird, wenn man
// das Licht anlässt»); das Stirnlicht leuchtet dann die Röhre aus; vorher eine dunkle Fläche über dem Bild (0,97, dann 0,2)
const TUNNEL_TAGESLICHT = 0.07, TUNNEL_DUNKEL_M = 40
/** Dämmerung im Führerstand (Michael, 2026-10-13: «Schalter für Dämmerungsstimmung»), eine Stimmung, keine Tageszeit aus einer
 *  Quelle: so viel vom Licht des Himmels und der Sonne bleibt, die Sonne rötlich, der Himmel gemalt wie himmel() */
const DAEMMERUNG_HIMMEL = 0.3, DAEMMERUNG_SONNE = 0.25
/** Tunnel als Röhre, durch die der Zug fährt und durch die man blicken kann (Michael, 2026-10-12: «in eine Röhre
 *  fahren … durch den Berg bewegen … durch die Röhre blicken»). Querschnitt, Farbe und Licht stehen in keiner Quelle.
 *  Seit 2026-10-13 nach Michaels Vorbild einer Modellbahn: ein Hufeisen, senkrechte Wände ROEHRE_HALB_M neben der Linie
 *  bis ROEHRE_KAEMPFER_M über ihr, darüber ein Halbkreis, der Boden flach ROEHRE_BODEN_M unter der Linie. Nur von innen
 *  gezeichnet: wo das Gelände tiefer liegt als die Röhre, stand sie sonst in der Landschaft. Gemauerte Portale gab es kurz,
 *  sie waren zu massiv (Michael, 2026-10-13). Dunkel wird es erst PORTAL_INNEN_M im Tunnel (Michael: «ca. 20 m», sonst war
 *  es hinter dem Eingang gleich wieder hell) */
const ROEHRE_HALB_M = 4.2, ROEHRE_KAEMPFER_M = 2.8, ROEHRE_BODEN_M = 0.4, ROEHRE_BOGEN_TEILE = 14
const PORTAL_INNEN_M = 20
// Fels an der Wand (Michael, 2026-10-13: «echte Wände mit Fels»): gezeichnet, nicht aus einer Quelle; die Wand weicht bis
// ROEHRE_RAUH_M von der Form ab, Ringe höchstens ROEHRE_RING_M auseinander, das Felsbild wiederholt sich alle FELS_BILD_M
const ROEHRE_RAUH_M = 0.3, ROEHRE_RING_M = 4, FELS_BILD_M = 6
/** Querschnitt der Röhre: q quer zur Fahrt, h über der Linie (m), nq/nh nach aussen, rauh: Fels; einmal rundum, der letzte
 *  Punkt ist der erste (für das Felsbild); zuletzt der Boden */
const ROEHRE_PROFIL = (() => {
  const b = ROEHRE_HALB_M, k = ROEHRE_KAEMPFER_M, u = -ROEHRE_BODEN_M
  const p: Array<{ q: number; h: number; nq: number; nh: number; rauh: boolean }> = []
  for (const t of [0, 0.34, 0.67]) p.push({ q: b, h: u + (k - u) * t, nq: 1, nh: 0, rauh: t > 0 })
  for (let i = 0; i <= ROEHRE_BOGEN_TEILE; i++) {
    const w = (i / ROEHRE_BOGEN_TEILE) * Math.PI
    p.push({ q: Math.cos(w) * b, h: k + Math.sin(w) * b, nq: Math.cos(w), nh: Math.sin(w), rauh: true })
  }
  for (const t of [0.33, 0.66, 1]) p.push({ q: -b, h: k + (u - k) * t, nq: -1, nh: 0, rauh: t < 1 })
  for (const t of [0.25, 0.5, 0.75, 1]) p.push({ q: -b + 2 * b * t, h: u, nq: 0, nh: -1, rauh: false })
  return p
})()
/** erst so weit im Tunnel wird es dunkel; bei kurzen Tunneln weniger */
const portalInnen = (laenge: number) => Math.min(PORTAL_INNEN_M, laenge / 4)
/** so viele Abschnitte des Querschnitts gehören zur Wand, der Rest ist Boden */
const ROEHRE_WAND_TEILE = ROEHRE_PROFIL.length - 1 - 4
/** Nahbild (Luftbild auf 2,5 m entlang der Bahnlinien): so gross um den Blickpunkt, so viele Bildpunkte je Meter;
 *  neu geladen, wenn der Blickpunkt so weit gewandert ist; nur wenn die Kamera näher ist als NAH_BIS_KM */
const NAH_SEITE_M = 6000, NAH_PX_JE_M = 0.4, NAH_NACH_M = 1500, NAH_BIS_KM = 25
/** Himmel (Michael, 2026-10-11: «einen hellblauen natürlichen Himmel»): oben kräftiger blau, zum Horizont hin heller
 *  und dunstig, unter dem Horizont fast weiss; als Rundum-Bild, damit er beim Drehen und Neigen der Kamera stimmt. Ein
 *  gemaltes Bild, kein Wetter und keine Tageszeit */
function himmel(dunkel: boolean, daemmerung = false) {
  const c = document.createElement('canvas')
  c.width = 4; c.height = 512
  const g = c.getContext('2d')!
  // in der Mitte der Höhe liegt der Horizont
  const v = g.createLinearGradient(0, 0, 0, c.height)
  const stufen: Array<[number, string]> = daemmerung
    ? [[0, '#1b2140'], [0.28, '#363b66'], [0.43, '#866c8c'], [0.485, '#e0956a'], [0.5, '#efae7a'], [0.54, '#4a3c40'], [1, '#2a2428']]
    : dunkel
    ? [[0, '#0b1a2e'], [0.3, '#16304d'], [0.46, '#2b4562'], [0.5, '#3a5068'], [0.56, '#2a3440'], [1, '#1c2228']]
    : [[0, '#4f8fd0'], [0.25, '#76aee2'], [0.42, '#a9cdee'], [0.49, '#dbe9f5'], [0.5, '#e8f0f6'], [1, '#eef2f4']]
  for (const [t, f] of stufen) v.addColorStop(t, f)
  g.fillStyle = v
  g.fillRect(0, 0, c.width, c.height)
  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

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
/** Führerstand in der Brille (Michael, 2026-10-12: «im VR-Modus in der Brille im Führerstand sitzen und sich mit dem Kopf
 *  wirklich drehen können»): die Welt in Originalgrösse um den Kopf, das Gelände bis 40 km weit; Schilder etwa 5 m hoch;
 *  der Zug etwa 3 m breit statt der Modellgrösse */
/** das Pult auf dem Bildschirm, gegenüber der Lage in der Brille verschoben */
const PULT_BILD_HOCH_M = -0.02, PULT_BILD_WEG_M = 0.25
/** Sichtfeld im Führerstand auf dem Bildschirm, Landschaft und Pult je mit eigenem Ausschnitt (Michael, 2026-10-14: «In beiden
 *  Formaten soll die Sicht auf die Strecke möglichst attraktiv sein»): das Pult füllt die Breite mit beiden Hebeln und sitzt am
 *  unteren Rand, quer höchstens PULT_ANTEIL der Höhe. Hoch sieht man es von schräg oben, um PULT_KIPP_HOCH gedreht um seine
 *  Mitte und PULT_WEITER_HOCH weiter weg: so ist es etwa doppelt so hoch und weniger verzogen (Michael, 2026-10-14: «viel zu
 *  extrem verzogen … darf doch circa doppelt so hoch sein»), der Rahmen bleibt gerade (rahmenKamera). Die Landschaft hat ihr
 *  eigenes Sichtfeld, der Horizont liegt in 50 % (quer) oder 55 % (hoch) des Fensters über dem Pult von oben. */
const PULT_ANTEIL = 0.45, PULT_KIPP_HOCH = (24 * Math.PI) / 180, PULT_WEITER_HOCH = 1.3
/** Abdeckung über den Anzeigen: so hoch, dass Sicht links, Schliessen und Sicht rechts darauf Platz haben */
const HAUBE_M = 0.2
/** Punkte des Pults vom Auge aus (die Gruppe steht PULT_BILD_* verschoben): Mitte, Fuss der Hebel, Oberkante der Abdeckung,
 *  äusserer Rand der Hebel; unten der Fuss der Hebel, die zweite Tastenreihe und die Knäufe, je nach Blick liegt einer zuunterst */
const PULT_MITTE = new THREE.Vector3(0, -0.47, -1.0)
const PULT_FUSS = [new THREE.Vector3(0, -0.666, -0.9), new THREE.Vector3(0, -0.57, -0.78), new THREE.Vector3(0.72, -0.62, -0.74)]
const PULT_KANTE = new THREE.Vector3(0, -0.165 + HAUBE_M, -1.35)
const PULT_RAND = new THREE.Vector3(0.92, -0.6, -0.9)
const pultHilfe = new THREE.PerspectiveCamera()
let bildZuletzt: { a: number; b: ReturnType<typeof fuehrerstandBildRechnen> } | null = null
function fuehrerstandBild(aspect: number) {
  if (bildZuletzt?.a !== aspect) bildZuletzt = { a: aspect, b: fuehrerstandBildRechnen(aspect) }
  return bildZuletzt.b
}
function fuehrerstandBildRechnen(aspect: number) {
  const a = Math.max(0.3, aspect)
  // hoch: von schräg oben und weiter weg, dazwischen gleitend; quer gerade wie das Auge
  const t = Math.max(0, Math.min(1, (1 - a) / 0.55))
  const kipp = PULT_KIPP_HOCH * t, weiter = 1 + (PULT_WEITER_HOCH - 1) * t
  const lage = PULT_MITTE.clone().add(new THREE.Vector3().sub(PULT_MITTE).multiplyScalar(weiter).applyAxisAngle(new THREE.Vector3(1, 0, 0), -kipp))
  pultHilfe.position.copy(lage)
  pultHilfe.rotation.set(-kipp, 0, 0)
  pultHilfe.updateMatrixWorld()
  const tan = (p: THREE.Vector3) => { const q = p.clone().applyMatrix4(pultHilfe.matrixWorldInverse); return [q.x / -q.z, q.y / -q.z] }
  const unten = Math.max(...PULT_FUSS.map((p) => -tan(p)[1]) ) + 0.02, kante = tan(PULT_KANTE)[1]
  const pultX = Math.max(tan(PULT_RAND)[0], ((unten + kante) * a) / (2 * PULT_ANTEIL))
  const pultHoehe = (2 * pultX) / a
  const anteil = (unten + kante) / pultHoehe
  // der Rahmen gerade vom Auge aus, seine Unterkante (0,22 m unter dem Auge in 1,39 m) auf der Höhe der Kante des Pults
  const rahmenX = 1.1, rahmenHoehe = (2 * rahmenX) / a
  const rahmenUnten = anteil * rahmenHoehe + 0.22 / 1.39
  // die Landschaft: waagrecht etwa 80° quer, 70° hoch
  const weltX = Math.min(0.84, Math.max(0.7, 0.62 + 0.13 * a))
  const weltHoehe = (2 * weltX) / a
  // in der Mitte des Fensters, hoch etwas tiefer: sonst füllte der Boden direkt vor dem Zug das halbe Bild
  const horizont = a < 1 ? 0.55 : 0.5
  const oben = horizont * (1 - anteil) * weltHoehe
  return { lage, kipp, pultX, pultOben: pultHoehe - unten, pultUnten: unten,
    rahmenX, rahmenOben: rahmenHoehe - rahmenUnten, rahmenUnten,
    weltX, weltOben: oben, weltUnten: weltHoehe - oben, fov: (2 * Math.atan(weltHoehe / 2) * 180) / Math.PI }
}
const fuehrerstandFov = (aspect: number) => fuehrerstandBild(aspect).fov
/** einen Ausschnitt als Tangens links/rechts, oben/unten setzen */
function bildAusschnitt(k: THREE.PerspectiveCamera, x: number, oben: number, unten: number) {
  const n = k.near
  k.projectionMatrix.makePerspective(-x * n, x * n, oben * n, -unten * n, n, k.far)
  k.projectionMatrixInverse.copy(k.projectionMatrix).invert()
}
/** in der Brille sitzt das Auge so viel höher über dem Pult als auf dem Bildschirm */
const KABINE_HOEHER_M = 0.15
/** Höhe und Breite der Krone gezeichneter Bäume in Metern je Art (0 Einzelbaum, 1 Wald, 2 Wald offen, 3 Gebüschwald,
 *  4 Gehölzfläche), in keiner Quelle: swissTLM3D hat Lage und Art, aber keine Höhe (Michael, 2026-10-13: «zuerst ohne
 *  gemessene Baumhöhen») */
const BAUM_FORM: [number, number][] = [[12, 3.5], [20, 3.2], [15, 4], [4, 2.2], [9, 3]]
const OBEN = new THREE.Vector3(0, 1, 0)
/** Breite von Strassenbrücken in m, wo die Klasse in swissTLM3D keine nennt: Annahmen, in keiner Quelle (je Fahrbahn) */
const STRASSE_BREITE_ANNAHME: Record<string, number> = { Autobahn: 12, Autostrasse: 9, Einfahrt: 6, Ausfahrt: 6, Zufahrt: 4, Dienstzufahrt: 4 }
/** halbe Breite einer gezeichneten Strassenbrücke mit Brüstung */
const strasseHalb = (b: { b: number | null; art: string }) => (b.b ?? STRASSE_BREITE_ANNAHME[b.art] ?? 6) / 2 + 0.5
interface Strassenbruecken { bruecken: Array<{ e: number; n: number; h: number; b: number | null; art: string; d: number[] }> }
let strassenbrueckenVerz: Promise<Strassenbruecken> | null = null
const strassenbrueckenLaden = () => (strassenbrueckenVerz ??= holen<Strassenbruecken>('data/strassenbruecken.json')
  .catch((e) => { strassenbrueckenVerz = null; throw e }))
/** Bahnbrücken im Führerstand so breit wie ihre Gleise (Michael, 2026-10-15: «gemäß der Anzahl Gleise, die du auf der Karte
 *  siehst»): swissTLM3D hat je Gleis eine Achse (pipeline/build_bahnbruecken.py). Gezählt werden Achsen bis BRUECKE_SUCHE_M
 *  neben der Linie, die ihr höchstens 30° schräg folgen; die Platte reicht BRUECKE_RAND_M über die äussersten hinaus, trägt
 *  eine einzelne Achse laut Quelle zwei Gleise, liegen sie GLEISABSTAND_M auseinander. Rand und Abstand in keiner Quelle */
const BRUECKE_RAND_M = 3.5, GLEISABSTAND_M = 4.5, BRUECKE_SUCHE_M = 20, GLEIS_NAH_M = 3
interface Bahnbruecken { achsen: Array<{ e: number; n: number; s: number | null; d: number[] }> }
type AchsStueck = { id: number; ae: number; an: number; be: number; bn: number; s: number | null }
let bahnbrueckenVerz: Promise<Map<string, AchsStueck[]>> | null = null
const bahnbrueckenLaden = () => (bahnbrueckenVerz ??= holen<Bahnbruecken>('data/bahnbruecken.json').then((d) => {
  const zellen = new Map<string, AchsStueck[]>()
  d.achsen.forEach((x, id) => {
    for (let i = 0; i + 3 < x.d.length; i += 2) {
      const st = { id, ae: x.e + x.d[i] / 10, an: x.n + x.d[i + 1] / 10, be: x.e + x.d[i + 2] / 10, bn: x.n + x.d[i + 3] / 10, s: x.s }
      for (let qe = Math.floor(Math.min(st.ae, st.be) / 100); qe <= Math.floor(Math.max(st.ae, st.be) / 100); qe++) {
        for (let qn = Math.floor(Math.min(st.an, st.bn) / 100); qn <= Math.floor(Math.max(st.an, st.bn) / 100); qn++) {
          const k = `${qe}_${qn}`
          const l = zellen.get(k)
          if (l) l.push(st); else zellen.set(k, [st])
        }
      }
    }
  })
  return zellen
}).catch((e) => { bahnbrueckenVerz = null; throw e }))
/** Breite einer Bahnbrücke an der Stelle e, n mit der Richtung te, tn (Einheit): Abstand links und rechts der Linie,
 *  gemessen quer zu ihr (positiv nach links, q = (-tn, te)) */
function brueckeQuer(zellen: Map<string, AchsStueck[]> | null, e: number, n: number, te: number, tn: number,
                     gleise?: Map<number, number>): [number, number] {
  const qe = -tn, qn = te, lage = new Map<number, { d: number; s: number | null }>()
  if (zellen) {
    for (let ze = Math.floor((e - BRUECKE_SUCHE_M) / 100); ze <= Math.floor((e + BRUECKE_SUCHE_M) / 100); ze++) {
      for (let zn = Math.floor((n - BRUECKE_SUCHE_M) / 100); zn <= Math.floor((n + BRUECKE_SUCHE_M) / 100); zn++) {
        for (const st of zellen.get(`${ze}_${zn}`) ?? []) {
          const se = st.be - st.ae, sn = st.bn - st.an, l = Math.hypot(se, sn)
          if (l < 0.1 || Math.abs((se * te + sn * tn) / l) < Math.cos(Math.PI / 6)) continue
          // Schnitt der Querlinie durch e, n mit dem Stück
          const nenner = se * qn - sn * qe
          if (Math.abs(nenner) < 1e-9) continue
          const t = ((e - st.ae) * qn - (n - st.an) * qe) / nenner
          if (t < -0.01 || t > 1.01) continue
          const d = (st.ae + t * se - e) * qe + (st.an + t * sn - n) * qn
          if (Math.abs(d) > BRUECKE_SUCHE_M) continue
          const alt = lage.get(st.id)
          if (!alt || Math.abs(d) < Math.abs(alt.d)) lage.set(st.id, { d, s: st.s })
        }
      }
    }
  }
  let lo = 0, hi = 0
  for (const [id, { d }] of lage) { lo = Math.min(lo, d); hi = Math.max(hi, d); gleise?.set(id, d) }
  if (lage.size === 1) {
    const [x] = lage.values()
    if (x.s === 2) { lo = Math.min(lo, x.d - GLEISABSTAND_M / 2); hi = Math.max(hi, x.d + GLEISABSTAND_M / 2) }
  }
  return [lo - BRUECKE_RAND_M, hi + BRUECKE_RAND_M]
}
/** Oberflächen gezeichneter Brücken (Michael, 2026-10-15: «ein bisschen Körnung, ein bisschen Ambient Occlusion, eine
 *  Struktur, die repräsentativ ist für eine allgemeine Brücke»): gemalt, nicht aus einer Quelle; ein Bild deckt BRUECKE_BILD_M
 *  im Quadrat. Beton mit Körnung, Flecken und Schalungsfugen, Schotter für Bahnbrücken, Belag für Strassenbrücken */
const BRUECKE_BILD_M = 4
type BrueckenArt = 'beton' | 'schotter' | 'belag'
const brueckenBilder = new Map<BrueckenArt, THREE.CanvasTexture>()
function brueckenBild(art: BrueckenArt) {
  let t = brueckenBilder.get(art)
  if (t) return t
  const N = 256, c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!, bild = g.createImageData(N, N)
  // kachelbares Rauschen: Zufallsgitter mit q Feldern je Seite, weich dazwischen
  const rauschen = (q: number) => {
    const gitter = Array.from({ length: q * q }, () => Math.random() * 2 - 1)
    return (x: number, y: number) => {
      const fx = (x / N) * q, fy = (y / N) * q, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j
      const w = (a: number, b: number) => gitter[((b % q + q) % q) * q + ((a % q + q) % q)]
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v)
      return (w(i, j) * (1 - su) + w(i + 1, j) * su) * (1 - sv) + (w(i, j + 1) * (1 - su) + w(i + 1, j + 1) * su) * sv
    }
  }
  const grob = rauschen(4), mittel = rauschen(16), fein = rauschen(64)
  const grund = art === 'beton' ? [176, 173, 165] : art === 'schotter' ? [128, 121, 112] : [84, 84, 86]
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let d = 0
      if (art === 'beton') {
        d = grob(x, y) * 10 + mittel(x, y) * 6 + (Math.random() - 0.5) * 14
        // Schalungsfugen: Bretter quer, je 1 m eine Fuge, dazu Ankerlöcher
        if (y % (N / 4) < 2) d -= 22
        if (y % (N / 4) === 32 && x % 64 === 20) d -= 40
      } else if (art === 'schotter') {
        d = fein(x, y) * 26 + mittel(x, y) * 8 + (Math.random() - 0.5) * 40
      } else {
        d = grob(x, y) * 6 + (Math.random() - 0.5) * 18 + (Math.random() < 0.02 ? 30 : 0)
      }
      const k = (y * N + x) * 4
      for (let c2 = 0; c2 < 3; c2++) bild.data[k + c2] = grund[c2] + d + (art === 'beton' ? grob(y, x) * 4 * (c2 - 1) : 0)
      bild.data[k + 3] = 255
    }
  }
  g.putImageData(bild, 0, 0)
  t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  brueckenBilder.set(art, t)
  return t
}
/** eine Fläche im Querschnitt einer Brücke: von a0, h0 nach a1, h1 (Abstand quer zur Achse, Höhe über ihr, in m), ihr
 *  Bild und ihre Helligkeit an beiden Kanten (Ambient Occlusion von Hand: dunkel in Ecken und unten, in keiner Quelle) */
interface QuerFlaeche { a0: number; h0: number; a1: number; h1: number; art: BrueckenArt; hell0: number; hell1: number }
/** Querschnitt einer Bahnbrücke zwischen lo und hi: Schotter zwischen zwei Randbalken, darunter die Platte */
function bahnQuerschnitt(lo: number, hi: number, oben: number, dick: number): QuerFlaeche[] {
  const rb = 0.5, rh = 0.4, ao = 0.9, unten = oben - dick
  return [
    { a0: lo, h0: unten, a1: lo, h1: oben + rh, art: 'beton', hell0: 0.62, hell1: 0.95 },
    { a0: lo, h0: oben + rh, a1: lo + rb, h1: oben + rh, art: 'beton', hell0: 1, hell1: 1 },
    { a0: lo + rb, h0: oben + rh, a1: lo + rb, h1: oben, art: 'beton', hell0: 0.9, hell1: 0.6 },
    { a0: lo + rb, h0: oben, a1: lo + rb + ao, h1: oben, art: 'schotter', hell0: 0.55, hell1: 1 },
    { a0: lo + rb + ao, h0: oben, a1: hi - rb - ao, h1: oben, art: 'schotter', hell0: 1, hell1: 1 },
    { a0: hi - rb - ao, h0: oben, a1: hi - rb, h1: oben, art: 'schotter', hell0: 1, hell1: 0.55 },
    { a0: hi - rb, h0: oben, a1: hi - rb, h1: oben + rh, art: 'beton', hell0: 0.6, hell1: 0.9 },
    { a0: hi - rb, h0: oben + rh, a1: hi, h1: oben + rh, art: 'beton', hell0: 1, hell1: 1 },
    { a0: hi, h0: oben + rh, a1: hi, h1: unten, art: 'beton', hell0: 0.95, hell1: 0.62 },
    { a0: hi, h0: unten, a1: lo, h1: unten, art: 'beton', hell0: 0.45, hell1: 0.45 },
  ]
}
/** Querschnitt einer Strassenbrücke mit halber Breite w: Trog aus Platte (1 m) und Brüstungen (0,3 m dick, 1 m hoch) */
function strassenQuerschnitt(w: number): QuerFlaeche[] {
  const b = 0.3, ao = 0.6
  return [
    { a0: -w, h0: -1, a1: -w, h1: 1, art: 'beton', hell0: 0.62, hell1: 0.95 },
    { a0: -w, h0: 1, a1: -w + b, h1: 1, art: 'beton', hell0: 1, hell1: 1 },
    { a0: -w + b, h0: 1, a1: -w + b, h1: 0, art: 'beton', hell0: 0.92, hell1: 0.6 },
    { a0: -w + b, h0: 0, a1: -w + b + ao, h1: 0, art: 'belag', hell0: 0.6, hell1: 1 },
    { a0: -w + b + ao, h0: 0, a1: w - b - ao, h1: 0, art: 'belag', hell0: 1, hell1: 1 },
    { a0: w - b - ao, h0: 0, a1: w - b, h1: 0, art: 'belag', hell0: 1, hell1: 0.6 },
    { a0: w - b, h0: 0, a1: w - b, h1: 1, art: 'beton', hell0: 0.6, hell1: 0.92 },
    { a0: w - b, h0: 1, a1: w, h1: 1, art: 'beton', hell0: 1, hell1: 1 },
    { a0: w, h0: 1, a1: w, h1: -1, art: 'beton', hell0: 0.95, hell1: 0.62 },
    { a0: w, h0: -1, a1: -w, h1: -1, art: 'beton', hell0: 0.45, hell1: 0.45 },
  ]
}
/** Retusche (Michael, 2026-10-15: «wegzuretuschieren, damit die Straße auf der Brücke und nicht unterhalb … verläuft»):
 *  das Luftbild ist auf das Gelände gelegt, eine Brücke darin liegt unten im Tal oder auf dem Gleis darunter. Unter jeder
 *  gezeichneten Brücke wird es quer zur Brücke zwischen den beiden Rändern aufgefüllt, RETUSCHE_RAND_M breiter als die Brücke
 *  (die Brücke liegt im Luftbild je nach Höhe etwas daneben); keine künstliche Intelligenz, nicht aus einer Quelle */
const RETUSCHE_RAND_M = 2.5, RETUSCHE_MITTEL_M = 8
/** ein Streifen unter einer Brücke: Achse in Landeskoordinaten und je Punkt der Abstand links und rechts wie brueckeQuer */
interface Streifen { p: Array<[number, number]>; lo: number[]; hi: number[] }
function retuschieren(ctx: CanvasRenderingContext2D, w: number, h: number, e0: number, n1: number, pxJeM: number, streifen: Streifen[]) {
  for (const s of streifen) {
    // Rechteck des Streifens in Bildpunkten
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    s.p.forEach(([e, n], i) => {
      const r = Math.max(-s.lo[i], s.hi[i]) + RETUSCHE_RAND_M + RETUSCHE_MITTEL_M + 3
      x0 = Math.min(x0, (e - r - e0) * pxJeM); x1 = Math.max(x1, (e + r - e0) * pxJeM)
      y0 = Math.min(y0, (n1 - n - r) * pxJeM); y1 = Math.max(y1, (n1 - n + r) * pxJeM)
    })
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1))
    if (x1 - x0 < 1 || y1 - y0 < 1) continue
    const bw = x1 - x0, bh = y1 - y0
    const bild = ctx.getImageData(x0, y0, bw, bh), q = bild.data, z = new Uint8ClampedArray(q)
    const hol = (e: number, n: number, k: number) => {
      const x = Math.max(0, Math.min(bw - 1, Math.floor((e - e0) * pxJeM) - x0)), y = Math.max(0, Math.min(bh - 1, Math.floor((n1 - n) * pxJeM) - y0))
      return q[(y * bw + x) * 4 + k]
    }
    const pxM = 1 / pxJeM
    for (let i = 0; i + 1 < s.p.length; i++) {
      const [ae, an] = s.p[i], [be, bn] = s.p[i + 1], l = Math.hypot(be - ae, bn - an)
      if (l < 0.01) continue
      const ue = (be - ae) / l, un = (bn - an) / l, qe = -un, qn = ue
      const r = Math.max(-s.lo[i], s.hi[i], -s.lo[i + 1], s.hi[i + 1]) + RETUSCHE_RAND_M
      const xa = Math.max(x0, Math.floor((Math.min(ae, be) - r - e0) * pxJeM)), xb = Math.min(x1, Math.ceil((Math.max(ae, be) + r - e0) * pxJeM))
      const ya = Math.max(y0, Math.floor((n1 - Math.max(an, bn) - r) * pxJeM)), yb = Math.min(y1, Math.ceil((n1 - Math.min(an, bn) + r) * pxJeM))
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const e = e0 + (x + 0.5) * pxM, n = n1 - (y + 0.5) * pxM
          const t = (e - ae) * ue + (n - an) * un
          if (t < 0 || t > l) continue
          const d = (e - ae) * qe + (n - an) * qn, f = t / l
          const lo = s.lo[i] + f * (s.lo[i + 1] - s.lo[i]) - RETUSCHE_RAND_M, hi = s.hi[i] + f * (s.hi[i + 1] - s.hi[i]) + RETUSCHE_RAND_M
          if (d < lo || d > hi) continue
          // zwischen den beiden Rändern verlaufend; jeder Rand gemittelt über RETUSCHE_MITTEL_M längs und 2 m nach aussen,
          // sonst zieht jeder Bildpunkt am Rand einen Streifen. Gespiegelt wäre die Zeichnung schärfer, erfand aber Häuser
          const me = ae + ue * t, mn = an + un * t, g = (d - lo) / ((hi - lo) || 1)
          const o = ((y - y0) * bw + (x - x0)) * 4
          let r0 = 0, g0 = 0, b0 = 0, r1 = 0, g1 = 0, b1 = 0, k2 = 0
          for (const sl of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
            for (const aus of [0.5, 2]) {
              const ve = me + ue * sl * RETUSCHE_MITTEL_M, vn = mn + un * sl * RETUSCHE_MITTEL_M
              const le = ve + qe * (lo - aus), ln = vn + qn * (lo - aus), re = ve + qe * (hi + aus), rn = vn + qn * (hi + aus)
              r0 += hol(le, ln, 0); g0 += hol(le, ln, 1); b0 += hol(le, ln, 2)
              r1 += hol(re, rn, 0); g1 += hol(re, rn, 1); b1 += hol(re, rn, 2)
              k2++
            }
          }
          z[o] = (r0 * (1 - g) + r1 * g) / k2; z[o + 1] = (g0 * (1 - g) + g1 * g) / k2; z[o + 2] = (b0 * (1 - g) + b1 * g) / k2
        }
      }
    }
    bild.data.set(z)
    ctx.putImageData(bild, x0, y0)
  }
}
/** Bahnhofsschilder im Führerstand (Michael, 2026-10-14: «in Bodennähe und so dass man es beim Vorbeifahren gut lesen kann»):
 *  je Bahnhof eines rechts der Linie in ihrer Richtung (Michael, 2026-10-14: «immer nur eine Ortstafel»), so weit neben ihr, so breit und hoch, die Unterkante so hoch über der Linie, gegen
 *  das Gleis gedreht; Lage, Grösse und Gestalt stehen in keiner Quelle, die Stelle ist die des Bahnhofs in den Daten */
const TAFEL_SEITE_M = 7.5, TAFEL_BREITE_M = 9, TAFEL_HOEHE_M = 1.8, TAFEL_UEBER_M = 1.8, TAFEL_DREHUNG = (35 * Math.PI) / 180
/** Bäume nur bis so weit um die Mitte des feinen Geländes (1,2 km voraus), Krone mit 20 Dreiecken: sonst zu viel für Handy und Brille */
const BAUM_BIS_M = 1700
/** so viel Platz bleibt zwischen Krone und Mitte der gezeichneten Strecke frei (Lichtraum fürs Bild, in keiner Quelle) */
const BAUM_LICHTRAUM_M = 5
const KABINE_NAHE_M = 0.3, KABINE_WEIT_M = 40_000, KABINE_SCHILD_KM = 0.005, KABINE_ZUG = 0.003 / 0.045, KABINE_ZEICHEN = 0.1
/** der Zug (Michael, 2026-10-06: «Lok plus 6 Wagen, Grau mit karminroter Front»): Längen in Metern
 *  entlang der Linie, Breite und Höhe in km; etwa fünfmal so lang wie ein echter Zug (halbiert am
 *  2026-10-06, Michael: «halb so gross»), sonst wäre er
 *  auf dem Gelände kaum zu sehen. Darum steht «Zug nicht massstäblich» dabei. Kein bestimmter Zugtyp. */
/** Lok, vier Wagen und am Schluss ein Steuerwagen mit derselben schrägen Form, ohne Rot (Michael, 2026-10-08) */
const ZUG_LOK_M = 140, ZUG_WAGEN_M = 140, ZUG_WAGEN = 5, ZUG_LUECKE_M = 8
const ZUG_BREITE = 0.045, ZUG_HOEHE = 0.05
/** in diesem Abstand der Kamera (km) hat der Zug seine Grundgrösse; näher kleiner, weiter weg grösser */
const ZUG_NORMAL_KM = 6
/** beim Fahren: so weit nach dem Anfang des Wegs steht der eigene Standort in der Mitte des Zugs statt an seinem Ende */
const ZUG_VORNE_BIS_M = 800
/** beim Fahren (Fahrt und Probefahrt) ist der Zug grösser (Michael, 2026-10-07: «bei der Fahrt Live … 150 %») */
const ZUG_FAHRT_FAKTOR = 1.5
/** so stark neigt sich ein Wagen höchstens, 4° (im überhöhten Gelände wären es sonst Rampen; vorher 7°, Michael, 2026-10-10) */
const ZUG_NEIGUNG_MAX = (4 * Math.PI) / 180
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
  useEffect(() => szeneLaden(), [])
  const { daten, fehler } = useRelief(name)
  const [faktor, setFaktor] = useState<1 | 2>(1)
  const stand = useModellStand()
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
      <div className={ZWEI_SPALTEN}>
      <div className="min-w-0">
      {!fehler && (
        <ModellKarte laedt="Das Relief wird geladen …" faktor={faktor} setFaktor={setFaktor} fahrknopf={fahrknopf}
                     fuehrerstand={fuehrerstand} audio={audio} stand={stand}
                     szene={daten && weg ? (fuellen, className) => (
                       <Szene r={daten.r} h={daten.h} faktor={faktor} weg={weg} wegFarbe={FARBEN.weg} brille={brille}
                              probe={probe} probeStelle={probeStelle} fahrknopf={fahrknopf} fuehrerstand={fuehrerstand}
                              aussen={stand.aussen} seitenblick={stand.seitenblick} fuellen={fuellen} className={className} />
                     ) : null} />
      )}
      </div>
      <div className="min-w-0 xl:pt-4">
      {daten && weg && (
        <>
          {/* unter der Karte, damit man von ihr mehr sieht (Michael, 2026-10-10) */}
          <div className="mt-3"><FaktorWahl faktor={faktor} setFaktor={setFaktor} /></div>
          <div className="mt-2"><SehenswertLegende gebieteMitBoden kmNetz /></div>
          {/* der lange Hinweis steht eine Ebene weiter vorn, auf der Seite Modellbahn (Michael, 2026-10-09) */}
          <p className="mt-3 text-sm">
            Ein Modell, kein Abbild der Wirklichkeit: Zug, Gleise und Masten sind nicht massstäblich.{' '}
            <a href="#/modellbahn" className="underline underline-offset-2">Was nicht stimmt</a> (unten auf der Seite Modellbahn)
          </p>
          <ModellKnoepfe fahrknopf={fahrknopf} fuehrerstand={fuehrerstand} audio={audio} inBrille={inBrille} brilleFehler={brilleFehler} stand={stand} />
          <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
            Namen, die sich überdecken würden, erscheinen beim Heranzoomen.
            {faktor === 2 && <span className="font-medium text-sbb-black dark:text-sbb-white"> Die Höhe ist 2-fach überhöht.</span>}
          </p>
          <Legende wegText="Linie" wegFarbe={FARBEN.weg} />
          <Hinweise r={daten.r} />
        </>
      )}
      </div>
      </div>
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

/** das Band der ganzen Strecke (BAND_M links und rechts) aus den Geländekacheln, für die Modellbahn einer Strecke und für die
 *  Probefahrt in 3D (Michael, 2026-10-14: an beiden Orten dieselbe 3D-Ansicht, auch mit der Brille) */
function bandLaden(fahrweg: Fahrweg, objekte: FahrObjekt[], BAND_M: number): Promise<{ r: Relief; h: Uint16Array }> {
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
  return Promise.all([ausschnittLaden({ ost, nord, m, breite, hoehe }, kacheln), streckenLaden(), sehenswertLaden().catch(() => null)])
    .then(([f, netz, sw]) => {
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
      return {
        r: { titel: 'Strecke', linie: '', linie_name: '', von_km: 0, bis_km: 0, datenstand: '', quellen: [f.quelle],
             raster, weg: [], bahnhoefe, tunnel: [], bruecken: [], gipfel, kacheln, innen },
        h,
      }
    })
}

/**
 * Die ganze Strecke einer Fahrt als Modell für die Brille (Michael, 2026-10-08: «diese Probefahrt auf die Brille
 * projizieren»): das Gelände aus den Kacheln im Rechteck um den Weg, bei langen Strecken gröber gemittelt, sonst wie
 * die Bergstrecken: «Mit VR-Brille» und die Probefahrt mit A, B, X und Y.
 */
export function ModellStrecke({ fahrweg, objekte, text, name }: {
  fahrweg: Fahrweg; objekte: FahrObjekt[]
  /** «Start → Ziel» für die Anzeige im Führerstand */
  name?: string
  /** Name und Baueinheiten der Tunnel und Brücken, für die Vorankündigung */
  text?: (o: FahrObjekt) => ObjektText | undefined
}) {
  useEffect(() => szeneLaden(), [])
  const [daten, setDaten] = useState<{ r: Relief; h: Uint16Array } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const brille = useRef<(() => Promise<void>) | null>(null)
  const [brilleFehler, setBrilleFehler] = useState<string | null>(null)
  const probe = useRef<number | null>(null)
  const probeStelle = useRef<number | null>(null)
  const fahrknopf = useRef<Fahrknopf | null>(null)
  const fuehrerstand = useRef(false)
  const stand = useModellStand()
  const BAND_M = useMemo(() => bandBreite(wegEnde(fahrweg)), [fahrweg])
  useEffect(() => {
    let ab = false
    bandLaden(fahrweg, objekte, BAND_M).then((d) => { if (!ab) setDaten(d) }).catch((e: Error) => { if (!ab) setFehler(e.message) })
    return () => { ab = true }
  }, [fahrweg, objekte, BAND_M])
  const weg = useMemo(() => (daten ? wegDerFahrt(daten.r, fahrweg) : null), [daten, fahrweg])
  // Namen der Tunnel und Brücken für die Anzeige «Voraus» im Führerstand
  const bauNamen = useMemo(() => objekte.flatMap((o): Ankuendigung[] => (o.art === 'tunnel' || o.art === 'bruecke')
    ? [{ s: o.s, art: o.art, name: text?.(o)?.name ?? (o.tlm?.art === 'galerie' ? 'Galerie ohne Namen' : o.art === 'tunnel' ? 'Tunnel ohne Namen' : 'Brücke ohne Namen') }]
    : []), [objekte, text])
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
      <div className={ZWEI_SPALTEN}>
      <div className="min-w-0">
      {!fehler && (
        <ModellKarte laedt="Das Gelände entlang der ganzen Strecke wird geladen …" fahrknopf={fahrknopf}
                     fuehrerstand={fuehrerstand} audio={audio} stand={stand}
                     ansage={stand.vorne ? null : <Vorankuendigung stelle={probeStelle} objekte={objekte} text={text} />}
                     szene={daten && weg ? (fuellen, className) => (
                       <Szene r={daten.r} h={daten.h} faktor={1} weg={weg} wegFarbe={FARBEN.weg} brille={brille}
                              probe={probe} probeStelle={probeStelle} fahrknopf={fahrknopf} fuehrerstand={fuehrerstand}
                              aussen={stand.aussen} seitenblick={stand.seitenblick} fuellen={fuellen} bauNamen={bauNamen} endNamen={name?.split(' → ') as [string, string] | undefined} className={className} />
                     ) : null} />
      )}
      </div>
      <div className="min-w-0 xl:pt-4">
      {daten && weg && (
        <>
          {/* was das Modell zeigt (Michael, 2026-10-12: «Kultur, Brücken, Tunnel und so weiter») */}
          <div className="mt-2"><SehenswertLegende gebieteMitBoden kmNetz bauwerke /></div>
          {/* der lange Hinweis steht eine Ebene weiter vorn, auf der Seite Modellbahn (Michael, 2026-10-09) */}
          <p className="mt-3 text-sm">
            Ein Modell, kein Abbild der Wirklichkeit: Zug, Gleise und Masten sind nicht massstäblich.{' '}
            <a href="#/modellbahn" className="underline underline-offset-2">Was nicht stimmt</a> (unten auf der Seite Modellbahn)
          </p>
          <ModellKnoepfe fahrknopf={fahrknopf} fuehrerstand={fuehrerstand} audio={audio} inBrille={inBrille} brilleFehler={brilleFehler} stand={stand} />
          <Klappe className="mt-2 text-xs text-sbb-metal dark:text-sbb-storm">
          <p className="mt-2 text-xs text-sbb-metal dark:text-sbb-storm">
            Die ganze Strecke als Modell, mit einem Band von {(BAND_M / 1000).toLocaleString('de-CH').replace('.', ',')} km links und rechts der Strecke; was weiter weg
            liegt, fehlt. Gelände aus swissALTIRegio (swisstopo){feldM && feldM > 50 ? `, für diese Strecke auf ${feldM.toLocaleString('de-CH')} m vergröbert` : ', auf 50 m gemittelt'};
            wo vorhanden mit Luftbild SWISSIMAGE (swisstopo), verkleinert. Im Führerstand nah am Zug Gelände aus swissALTI3D
            (swisstopo) auf 10 m und das Luftbild bis 500 m neben den Bahnlinien auf 2,5 m.
          </p>
          </Klappe>
        </>
      )}
      </div>
      </div>
    </div>
  )
}

/** Auf dem Desktop links das Modell, rechts die Knöpfe und Schalter (Michael, 2026-10-12: «links und rechts ist viel Raum») */
const ZWEI_SPALTEN = 'xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-6'

/** tempo: null fährt in PROBE_DAUER_S über die ganze Strecke, sonst als Vielfaches von MODELL_TEMPO */
interface Fahrknopf { los: () => void; halt: () => void; tempo: (t: number | null) => void }
/** Modellbahn auf dem Bildschirm: wählbares Tempo (Michael, 2026-10-10: «Originalgeschwindigkeit … doppelte, vierfache,
 *  achtfache»); wie schnell Züge auf einer Strecke fahren, steht in keiner Quelle: 1× ist wie bei der Probefahrt 100 km/h */
const MODELL_TEMPO = 100 / 3.6
const MODELL_TEMPI = [null, 1, 2, 4, 8, 16, 32] as const


/** Unter dem Modell: «Mit VR-Brille», der Zug auf dem Bildschirm und das Zuggeräusch (Michael, 2026-10-08: Modellbahn
 *  für alle; der Knopf zur Brille steht immer da, ohne Brille geht er einfach nicht und sagt, was es dafür braucht) */
/**
 * Die Karte eines Modells mit ihrem Ladebalken ganz oben und einem Knopf fürs Vollbild (Michael, 2026-10-10: «Wenn man die
 * Karte auf Vollbildmodus macht, soll es auch Vollbild sein, mit den nötigen Buttons und Knöpfen darin»): im Vollbild
 * füllt sie den Bildschirm, und Höhe, Zuggeräusch, Zug fahren, Anhalten, Führerstand und Tempo liegen auf der Karte.
 * Die Szene bleibt dieselbe, sie wird beim Umschalten nicht neu gebaut.
 */
function ModellKarte({ szene, laedt, faktor, setFaktor, fahrknopf, fuehrerstand, audio, stand, ansage }: {
  /** die Szene, mit fuellen und className von hier; null, solange die Daten laden */
  szene: ((fuellen: boolean, className: string) => React.ReactNode) | null
  /** Text, solange die Daten laden */
  laedt: React.ReactNode
  faktor?: 1 | 2
  setFaktor?: (f: 1 | 2) => void
  fahrknopf: React.RefObject<Fahrknopf | null>
  fuehrerstand: React.MutableRefObject<boolean>
  audio: ReturnType<typeof useZuggeraeusch>
  stand: ModellStand
  /** über dem Modell unten: die Vorankündigung der Tunnel und Brücken */
  ansage?: React.ReactNode
}) {
  const [voll, setVoll] = useState(false)
  const [filter, setFilter] = useState(false)
  useEchtesVollbild(voll, setVoll)
  const { vorne, setVorne } = stand
  const cockpit = voll && vorne
  // am Pult: Höhe und «Hinter den Zug» von hier
  stand.aussen.current = {
    hoehe: () => faktor ?? 1, hoeheSetzen: setFaktor,
    hinterZug: () => { fuehrerstand.current = false; stand.seitenblick.current = 0; setVorne(false) },
    seite: (r) => seitenblickDrehen(stand.seitenblick, r), schliessen: voll ? () => setVoll(false) : undefined,
  }
  return (
    <div className={voll
      ? 'fixed inset-0 z-[80] bg-sbb-white pb-[env(safe-area-inset-bottom)] dark:bg-sbb-midnight'
      : 'relative mt-4 overflow-hidden rounded-lg'}>
      {szene ? szene(voll, voll ? 'absolute inset-0 overflow-hidden' : 'relative w-full overflow-hidden rounded-lg')
        : <div className="flex h-[min(60vh,440px)] items-center justify-center rounded-lg bg-sbb-milk text-sm text-sbb-metal dark:bg-sbb-charcoal">{laedt}</div>}
      <Ladebalken inKarte />
      {szene && !cockpit && ansage}
      {szene && !cockpit && (
        <div className="absolute right-2 top-2 flex gap-2">
          {voll && <GeraeuschKnopf audio={audio} className="h-8 w-9" />}
          <VollbildKnopf voll={voll} umschalten={() => setVoll(!voll)} />
        </div>
      )}
      {/* im Führerstand im Vollbild nur das Bild (Michael, 2026-10-14: «ein echtes Vollformat … alle Bedienelemente als Knöpfe
          auf dem Führerpult oder teilweise auch oben»): fahren, bremsen, Tempo und Zuggeräusch am Pult */}
      {szene && voll && !cockpit && (
        <>
          {faktor && setFaktor && <div className="absolute left-2 top-2"><FaktorWahl faktor={faktor} setFaktor={setFaktor} klein /></div>}
          {/* oben: unten legt Android im Vollbild seinen Hinweis zum Beenden darüber (Michael, 2026-10-11) */}
          <div className="absolute inset-x-2 top-12 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={KAMERA_KNOPF} onClick={() => fahrknopf.current?.los()}>Zug fahren</button>
              <button type="button" className={KAMERA_KNOPF} onClick={() => fahrknopf.current?.halt()}>Anhalten</button>
              <button type="button" aria-pressed={vorne} className={`${KAMERA_KNOPF} ${vorne ? '!bg-sbb-anthracite !text-white' : ''}`}
                      onClick={() => { fuehrerstand.current = !vorne; setVorne(!vorne); if (!vorne) fahrknopf.current?.los() }}>
                Führerstand
              </button>
              {/* auch im Vollbild wählen, was das Modell zeigt (Michael, 2026-10-12) */}
              <button type="button" aria-pressed={filter} aria-expanded={filter}
                      className={`${KAMERA_KNOPF} ${filter ? '!bg-sbb-anthracite !text-white' : ''}`} onClick={() => setFilter(!filter)}>
                Ein- und ausblenden
              </button>
            </div>
            <div className="max-w-md"><TempoWahl stand={stand} fahrknopf={fahrknopf} klein /></div>
            {filter && (
              <div className="max-w-xl rounded-lg bg-white/90 p-1.5 dark:bg-sbb-midnight/90">
                <SehenswertLegende gebieteMitBoden kmNetz bauwerke />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** so viele Sekunden im gefahrenen Tempo vorher kündigt das Modell einen Tunnel oder eine Brücke an, mindestens VORAUS_MIN_M */
const VORAUS_S = 10
const VORAUS_MIN_M = 200

/**
 * Vorankündigung im Modell (Michael, 2026-10-12: «Wenn man Tunnel ausblendet, dann sollen nur die Vorankündigungen nicht
 * mehr kommen»): der nächste Tunnel oder die nächste Brücke vor dem Zug, gezeichnet bleiben sie immer. Brücken wie beim
 * Fahren erst ab 3 Baueinheiten oder, bei anderen Bahnen, ab 100 m Zeichnung. Die Schalter «Tunnel melden» und «Brücken
 * melden» stehen in der Legende unter dem Modell.
 */
function Vorankuendigung({ stelle, objekte, text }: {
  stelle: React.RefObject<number | null>; objekte: FahrObjekt[]; text?: (o: FahrObjekt) => ObjektText | undefined
}) {
  const aus = useVersteckt()
  const liste = useMemo(() => objekte.filter((o) => (o.art === 'tunnel' && !aus.has('tunnel'))
    || (o.art === 'bruecke' && !aus.has('bruecke') && ((text?.(o)?.baueinheiten ?? 0) >= 3 || text?.(o)?.gross === true)))
    .sort((a, b) => a.s - b.s), [objekte, text, aus])
  const [jetzt, setJetzt] = useState<{ o: FahrObjekt; d: number } | null>(null)
  useEffect(() => {
    let vorher: [number, number] | null = null
    let v = 0
    const id = setInterval(() => {
      const s = stelle.current, t = performance.now()
      if (s === null) { vorher = null; v = 0; setJetzt(null); return }
      if (vorher && t > vorher[1]) v = 0.6 * v + 0.4 * Math.max(0, (s - vorher[0]) / ((t - vorher[1]) / 1000))
      vorher = [s, t]
      const o = v < 1 ? undefined : liste.find((x) => x.s > s && x.s - s <= Math.max(VORAUS_MIN_M, v * VORAUS_S))
      setJetzt((alt) => (o ? (alt?.o === o && Math.abs(alt.d - (o.s - s)) < 5 ? alt : { o, d: o.s - s }) : null))
    }, 250)
    return () => clearInterval(id)
  }, [stelle, liste])
  if (!jetzt) return null
  const { o, d } = jetzt
  const art = o.tlm?.art === 'galerie' ? 'Galerie' : o.art === 'tunnel' ? 'Tunnel' : 'Brücke'
  const name = text?.(o)?.name
  const m = gerundetM(d)
  return (
    <div role="status" className="pointer-events-none absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg bg-sbb-charcoal/90 px-3 py-1.5 text-sm font-bold text-white">
      {art}{name && name !== art ? ` ${name}` : ''} in {m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`}
    </div>
  )
}

/** was auf dem Bildschirm gewählt ist, für die Knöpfe unter dem Modell und die im Vollbild gleich */
function useModellStand() {
  const [vorne, setVorne] = useState(false)
  const [tempo, setTempo] = useState<number | null>(null)
  // im Führerstand: Blick zur Seite und was das Pult ausserhalb bedient
  const seitenblick = useRef(0)
  const aussen = useRef<PultAussen | null>(null)
  return { vorne, setVorne, tempo, setTempo, seitenblick, aussen }
}

/** Blick zur Seite im Führerstand (Michael, 2026-10-14: «Sicht gegen links, Schliessen, Sicht gegen rechts», als Tasten auf der
 *  Abdeckung über den Anzeigen): je SEITENBLICK_SCHRITT, höchstens SEITENBLICK_MAX */
const SEITENBLICK_SCHRITT = Math.PI / 4, SEITENBLICK_MAX = (3 * Math.PI) / 4
function seitenblickDrehen(seitenblick: React.MutableRefObject<number>, richtung: 1 | -1) {
  seitenblick.current = Math.max(-SEITENBLICK_MAX, Math.min(SEITENBLICK_MAX,
    Math.round((seitenblick.current + richtung * SEITENBLICK_SCHRITT) / SEITENBLICK_SCHRITT) * SEITENBLICK_SCHRITT))
}
type ModellStand = ReturnType<typeof useModellStand>

/** Tempo des Zugs: 2,5 Minuten über die ganze Strecke oder ein Vielfaches von 100 km/h */
function TempoWahl({ stand, fahrknopf, klein = false }: { stand: ModellStand; fahrknopf: React.RefObject<Fahrknopf | null>; klein?: boolean }) {
  return (
    <div className={`segmente gap-0.5 ${klein ? 'bg-white/90 dark:bg-sbb-midnight/90' : 'mt-3'}`} role="group" aria-label="Tempo des Zugs">
      {MODELL_TEMPI.map((t) => (
        <button key={String(t)} type="button" aria-pressed={stand.tempo === t}
                className={`segment flex-1 tabular-nums ${klein ? 'min-h-8 px-1.5 text-xs' : 'min-h-9 px-1 text-sm'}`}
                aria-label={t === null ? `in ${(PROBE_DAUER_S / 60).toLocaleString('de-CH')} Minuten über die ganze Strecke` : t === 1 ? 'etwa 100 km/h' : `${t}-mal 100 km/h`}
                onClick={() => { stand.setTempo(t); fahrknopf.current?.tempo(t) }}>
          {t === null ? `${(PROBE_DAUER_S / 60).toLocaleString('de-CH')} Min.` : `${t}×`}
        </button>
      ))}
    </div>
  )
}

function ModellKnoepfe({ fahrknopf, fuehrerstand, audio, inBrille, brilleFehler, stand }: {
  fahrknopf: React.RefObject<Fahrknopf | null>
  fuehrerstand: React.MutableRefObject<boolean>
  audio: ReturnType<typeof useZuggeraeusch>
  inBrille: () => void
  brilleFehler: string | null
  stand: ModellStand
}) {
  const xr = useBrilleMoeglich()
  const [ohne, setOhne] = useState(false)
  const { vorne, setVorne } = stand
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
      <TempoWahl stand={stand} fahrknopf={fahrknopf} />
      {brilleFehler && <p className="mt-1 text-sm">Die Brille liess sich nicht starten: {brilleFehler}</p>}
      {!xr && ohne && (
        <p className="mt-2 text-sm font-medium" role="status">
          Auf diesem Gerät ist keine VR-Brille zu finden. Mit einer VR-Brille wie der Meta Quest 3 steht das Modell in
          deinem Raum auf dem Tisch; du siehst deine Umgebung, wo die Brille es kann, und lässt den Zug mit den Controllern
          fahren. Öffne dafür Taktland im Browser der Brille.
        </p>
      )}
      <Klappe className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm" titel="Bedienung und Tempo">
      <p className="mt-2 text-sm text-sbb-metal dark:text-sbb-storm">
        Mit «{(PROBE_DAUER_S / 60).toLocaleString('de-CH')} Min.» fährt der Zug in {(PROBE_DAUER_S / 60).toLocaleString('de-CH')} Minuten über die ganze Strecke,
        ein Zeitraffer, kein Fahrplan. 1× ist etwa 100 km/h, 2× bis 32× entsprechend schneller; wie schnell Züge auf dieser
        Strecke wirklich fahren, steht in keiner Quelle von Taktland. Drehen mit einem Finger, zoomen mit zwei, verschieben mit zwei Fingern oder der
        rechten Maustaste.
        {xr && <> In der Brille steht das Modell etwa {BRILLE_BREITE_M.toLocaleString('de-CH')} m breit auf Tischhöhe: ein
          Abzug trägt es, beide ziehen es grösser oder kleiner und drehen es, der Thumbstick dreht und hebt es, die rechte Greiftaste
          stellt es zurück, die linke schaltet das Zuggeräusch ein und aus. Der Zug wartet am Anfang, A startet, B hält an, X langsamer, Y schneller.
          Thumbstick drücken setzt dich in den Führerstand: die Landschaft in Originalgrösse um dich, du drehst den Kopf frei;
          nochmals drücken stellt das Modell zurück auf den Tisch. Ist «Führerstand» hier gewählt, beginnt die Brille dort.</>}
      </p>
      </Klappe>
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
    <Klappe className="mt-4 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
    <div className="mt-4 space-y-2 text-xs leading-relaxed text-sbb-metal dark:text-sbb-storm">
      {jahre && (
        <p>
          Luftbild: SWISSIMAGE (swisstopo), auf 10 m gemittelt, bis 500 m neben den Bahnlinien auf 2,5 m, aufgenommen {jahre.length > 1 ? `${jahre[0]} bis ${jahre[jahre.length - 1]}` : jahre[0]};
          je Kilometer die neueste Aufnahme. Was darauf zu sehen ist, zeigt den Stand der Aufnahme, nicht heute.
        </p>
      )}
      <p>
        Im Führerstand nah am Zug Gelände aus swissALTI3D (swisstopo), auf 10 m gemittelt, wo es bis 500 m neben einer Bahnlinie liegt.
        Ein Versuch, bis 400 m neben den Bahnlinien, wo die Kacheln schon gebaut sind (zwischen Müntschemier, Bern, Biel/Bienne und Neuchâtel, weitere je Kanton):
        Gebäude aus swissBUILDINGS3D (swisstopo), die Dächer in der Farbe des Luftbilds, die Wände grau (in keiner Quelle); Bäume aus swissTLM3D (swisstopo),
        Einzelbäume dort, wo die Quelle sie hat, Waldflächen mit gezeichneten Bäumen gefüllt (wo im Wald ein Baum steht, steht in keiner Quelle), die Krone in
        der Farbe des Luftbilds; Höhe und Form der Bäume in keiner Quelle, je nach Art 4 bis 20 m.
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
    </Klappe>
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
function wegDerFahrt(r: Relief, fahrweg: Fahrweg): Weg {
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
    // Tunnel und Brücken immer alle, auch wenn ihre Zeichen ausgeschaltet sind: sie tragen die Höhe der Linie (Michael,
    // 2026-10-11: mit «Brücken» aus fuhr der Zug bei Gümmenen wieder ins Tal)
    // dazu Brücken aus swissTLM3D, wo die SBB keine mit Länge kennt (nurBild, Michael, 2026-10-14: in Bern «schwebt» das
    // Gleis über der Aare, der Viadukt der Lorraine fehlte), nur wo kein anderes Bauwerk liegt
    bauwerke: (() => {
      const da = fahrweg.objekte.filter((o) => (o.art === 'tunnel' || o.art === 'bruecke') && o.sAus !== null)
        .map((o) => ({ von: o.s, bis: o.sAus!, art: o.art as 'tunnel' | 'bruecke' }))
      const dazu = (fahrweg.nurBild ?? []).filter((b) => !da.some((x) => x.von < b.bis && x.bis > b.von))
        .map((b) => ({ ...b, art: 'bruecke' as const }))
      return [...da, ...dazu].sort((a, b) => a.von - b.von)
    })(),
    tunnelPunkte: fahrweg.objekte.filter((o) => o.art === 'tunnel' && o.sAus === null).map((o) => o.s),
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
export function GelaendeFahrt({ fahrweg, objekte, sJetzt, className, tempo = null, tempoQuelle = 'gps', start, ziel, aussen, voll = false,
  schliessen, vorneMelden }: {
  start?: string; ziel?: string
  /** Probefahrt: Tempo und Anhalten vom Pult aus */
  aussen?: { current: PultAussen | null }
  /** im Vollbild: im Führerstand nur das Bild, «Hinter den Zug» und «Schliessen» oben, alles andere am Pult */
  voll?: boolean
  schliessen?: () => void
  vorneMelden?: (vorne: boolean) => void
  fahrweg: Fahrweg; objekte: FahrObjekt[]; sJetzt: number | null; className: string
  /** m/s für den Tacho im Führerstand, aus dem GPS oder der Probefahrt */
  tempo?: number | null
  tempoQuelle?: TempoQuelle
}) {
  const tempoRef = useRef<number | null>(tempo)
  tempoRef.current = tempo
  useEffect(() => szeneLaden(), [])
  const [faktor, setFaktor] = useState<1 | 2>(1)
  const [mitte, setMitte] = useState<[number, number] | null>(null)
  const [daten, setDaten] = useState<{ r: Relief; h: Uint16Array } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  // eine Probefahrt vor dem Start: der Zug steht am Anfang, damit es den Führerstand schon gibt und das Pult ihn starten kann
  const stelle = sJetzt ?? (tempoQuelle === 'probe' ? 0 : null)
  const zug = useRef<number | null>(stelle)
  const blick = useRef<THREE.Vector3 | null>(null)
  useEffect(() => { zug.current = stelle }, [stelle])
  const ende = useMemo(() => wegEnde(fahrweg), [fahrweg])
  const bauwerke = useMemo(() => fahrweg.objekte.filter((o) => (o.art === 'tunnel' || o.art === 'bruecke') && o.sAus !== null)
    .map((o) => ({ von: o.s, bis: o.sAus!, art: o.art as 'tunnel' | 'bruecke' })), [fahrweg])
  const audio = useZuggeraeusch(zug, ende, bauwerke)
  // «Hinter den Zug»: die Kamera wieder schräg hinter den Zug wie am Anfang
  const hinterZug = useRef(false)
  // «Führerstand»: die Kamera vorne im Zug (Michael, 2026-10-10)
  const fuehrerstand = useRef(false)
  const [vorne, setVorneRoh] = useState(false)
  const setVorne = (v: boolean) => { setVorneRoh(v); vorneMelden?.(v) }
  const cockpit = voll && vorne
  const seitenblick = useRef(0)
  // was am Pult bedient wird: dazu Höhe und «Hinter den Zug» von hier
  const pultAussen = useRef<PultAussen | null>(null)
  pultAussen.current = {
    ...(aussen?.current ?? {}), hoehe: () => faktor, hoeheSetzen: setFaktor,
    hinterZug: () => { fuehrerstand.current = false; seitenblick.current = 0; setVorne(false); hinterZug.current = true },
    seite: (r) => seitenblickDrehen(seitenblick, r), schliessen: voll ? schliessen : undefined,
  }
  // ohne 3D gibt es keinen Führerstand mehr
  const melden = useRef(vorneMelden)
  melden.current = vorneMelden
  useEffect(() => () => melden.current?.(false), [])
  // bis MODELL_HOECHSTENS_M die ganze Strecke als Band wie in der Modellbahn (Michael, 2026-10-14: an beiden Orten dieselbe
  // 3D-Ansicht): die Szene wird unterwegs nie neu gebaut, darum geht hier auch die Brille; länger der Ausschnitt, der mitwandert
  const ganz = ende <= MODELL_HOECHSTENS_M
  const BAND_M = useMemo(() => bandBreite(ende), [ende])
  useEffect(() => {
    if (!ganz) return
    let ab = false
    // die Bahnhöfe aus dem ganzen Weg, nicht aus der Auswahl: sonst baute jedes Umschalten der Meldungen das Band neu
    bandLaden(fahrweg, fahrweg.objekte, BAND_M).then((d) => { if (!ab) setDaten(d) }).catch((e: Error) => { if (!ab) setFehler(e.message) })
    return () => { ab = true }
  }, [ganz, fahrweg, BAND_M])
  const brille = useRef<(() => Promise<void>) | null>(null)
  const xr = useBrilleMoeglich()
  const [brilleHinweis, setBrilleHinweis] = useState<string | null>(null)
  useEffect(() => {
    if (!brilleHinweis) return
    const t = setTimeout(() => setBrilleHinweis(null), 8000)
    return () => clearTimeout(t)
  }, [brilleHinweis])
  const inBrille = () => {
    if (!xr) { setBrilleHinweis('Auf diesem Gerät ist keine VR-Brille zu finden. Öffne Taktland im Browser einer VR-Brille wie der Meta Quest 3.'); return }
    setBrilleHinweis(null)
    brille.current?.().catch((e: Error) => setBrilleHinweis(`Die Brille liess sich nicht starten: ${e.message}`))
  }
  // der Ausschnitt wandert mit dem Zug, auf den Kilometer gerundet
  const mitteS = useRef(0)
  useEffect(() => {
    if (ganz) return
    const s = Math.min(ende, (sJetzt ?? 0) + VORLAUF_M)
    const [e, n] = lageAufWeg(fahrweg, s)
    if (!mitte || Math.hypot(e - mitte[0], n - mitte[1]) > WANDERN_M) {
      mitteS.current = s
      setMitte([Math.round(e / 1000) * 1000, Math.round(n / 1000) * 1000])
    }
  }, [fahrweg, sJetzt, mitte, ende, ganz])
  useEffect(() => {
    if (!mitte || ganz) return
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
  }, [mitte, fahrweg, objekte, ende, ganz])
  const weg = useMemo(() => (daten ? wegDerFahrt(daten.r, fahrweg) : null), [daten, fahrweg])
  if (fehler) return <div className={className}><Ladefehler was="Das Gelände konnte nicht geladen werden." fehler={fehler} /></div>
  if (!daten || !weg) return <div className={`${className} relative flex items-center justify-center text-sm text-sbb-metal`}><Ladebalken inKarte />Das Gelände wird geladen …</div>
  return (
    <>
      <div className={`${className} relative`}>
        <Szene r={daten.r} h={daten.h} faktor={faktor} weg={weg} wegFarbe={FARBEN.weg} zug={zug} blick={blick} hinterZug={hinterZug}
               fuehrerstand={fuehrerstand} tempoAussen={tempoRef} tempoQuelle={tempoQuelle} aussen={pultAussen}
               seitenblick={seitenblick} brille={ganz ? brille : undefined}
               endNamen={start ? [start, ziel ?? 'ohne Ziel'] : undefined} className="absolute inset-0 overflow-hidden" />
        <Ladebalken inKarte />
        {cockpit ? (
          // im Führerstand im Vollbild nur das Bild (Michael, 2026-10-14: «ein echtes Vollformat», «alle Bedienelemente nicht als
          // zweidimensionale Steuerknöpfe, sondern visuell dreidimensional»): alles am Pult, auch Sicht links, Schliessen, Sicht rechts
          null
        ) : (
          <>
            <div className="absolute left-2 top-2"><FaktorWahl faktor={faktor} setFaktor={setFaktor} klein /></div>
            <GeraeuschKnopf audio={audio} className="absolute right-2 top-2 h-9 w-10" />
            {/* oben: unten legt Android im Vollbild seinen Hinweis zum Beenden darüber (Michael, 2026-10-11) */}
            <div className="absolute left-2 top-12 flex gap-2">
              <button type="button" onClick={() => { fuehrerstand.current = false; setVorne(false); hinterZug.current = true }}
                      className={KAMERA_KNOPF}>
                Hinter den Zug
              </button>
              <button type="button" aria-pressed={vorne} onClick={() => { fuehrerstand.current = !vorne; setVorne(!vorne) }}
                      className={`${KAMERA_KNOPF} ${vorne ? '!bg-sbb-anthracite !text-white' : ''}`}>
                Führerstand
              </button>
              {/* wie in der Modellbahn (Michael, 2026-10-14: «Aktuell kann ich ja nur im Spiel auf die VR-Brille wechseln») */}
              {ganz && (
                <button type="button" onClick={inBrille}
                        className="rounded-lg bg-sbb-red px-2.5 py-1 text-xs font-bold text-white">
                  Mit VR-Brille
                </button>
              )}
            </div>
            {brilleHinweis && (
              <p role="status" className="absolute inset-x-2 top-24 rounded-lg bg-white/95 p-2 text-xs font-medium dark:bg-sbb-midnight/95">
                {brilleHinweis}
              </p>
            )}
          </>
        )}
      </div>
      {/* die Angaben aufklappbar, sie nahmen beim Fahren viel Platz (Michael, 2026-10-10); sichtbar bleibt, dass
          es ein Modell ist und ob die Höhe überhöht ist */}
      <details className={`klapp mt-1 text-xs text-sbb-metal dark:text-sbb-storm ${cockpit ? 'hidden' : ''}`}>
        <summary className="flex min-h-9 cursor-pointer items-center underline underline-offset-2">
          Modell, nicht massstäblich{faktor === 2 && ', Höhe 2-fach überhöht'}: Quellen und Grenzen
        </summary>
        <p className="mt-1">
          Gelände aus swissALTIRegio (swisstopo), auf 50 m gemittelt, {ganz ? `bis ${(BAND_M / 1000).toLocaleString('de-CH')} km links und rechts der ganzen Strecke wie in der Modellbahn` : '30 km um den Zug'}; wo vorhanden mit Luftbild
          SWISSIMAGE (swisstopo), auf 10 m gemittelt, bis 500 m neben den Bahnlinien auf 2,5 m, Stand der Aufnahme. Im Führerstand nah am Zug das
          Gelände aus swissALTI3D (swisstopo), auf 10 m gemittelt, wo es bis 500 m neben einer Bahnlinie liegt; bis 400 m neben den Bahnlinien, wo
          schon gebaut, ein Versuch: Gebäude aus swissBUILDINGS3D (swisstopo), die Dächer in der Farbe des Luftbilds, die Wände grau; Bäume aus swissTLM3D
          (swisstopo), im Wald gezeichnet, Höhe in keiner Quelle. Die Höhe der Gleise steht in
          keiner Quelle; der Weg ist aufs Gelände gelegt, in Tunneln und auf Brücken gerade zwischen den Enden. Tunnel, von denen
          die Quelle nur einen Kilometer kennt und keine Länge, fehlen in 3D; beim Fahren meldet Taktland sie trotzdem. Zug nicht
          massstäblich und kein bestimmter Zugtyp. Das Zuggeräusch ist gerechnet, keine Aufnahme eines Zugs.
        </p>
      </details>
    </>
  )
}

/* ---------- die Zeichnung ---------- */

/** Höhe des Modells auf der Seite: auf dem Handy etwas höher als breit, ab 600 px Breite quer (Michael, 2026-10-12:
 *  «Dieses Bild kann gerne querformatig sein»), nie höher als 70 % des Fensters */
function bildHoehe(b: number) {
  return Math.round(Math.min(window.innerHeight * 0.7, b * (b >= 600 ? 0.62 : 1.1)))
}

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

function Szene({ r, h, faktor, weg, wegFarbe, zug: zugVonAussen, blick, brille, probe, probeStelle, hinterZug, fuehrerstand, fahrknopf, fuellen = false,
  tempoAussen, tempoQuelle, bauNamen, endNamen, aussen, seitenblick, className }: {
  /** was am Pult bedient wird und ausserhalb liegt: Probefahrt, Höhe, «Hinter den Zug», Meldungen */
  aussen?: { current: PultAussen | null }
  /** im Führerstand: so weit (Bogenmass) blickt man nach links (+) oder rechts (−) */
  seitenblick?: React.RefObject<number>
  /** Start und Ziel für die Anzeige im Führerstand; sonst der erste und letzte Bahnhof des Reliefs */
  endNamen?: [string, string]
  r: Relief; h: Uint16Array; faktor: 1 | 2; weg: Weg; wegFarbe: string
  /** beim Fahren: Tempo in m/s, wie es der Fahrtmodus kennt (GPS oder Probefahrt), für den Tacho im Führerstand */
  tempoAussen?: React.RefObject<number | null>
  tempoQuelle?: TempoQuelle
  /** Namen der Tunnel und Brücken für die Anzeige «Voraus» im Führerstand; sonst aus dem Relief oder ohne Namen */
  bauNamen?: Ankuendigung[]
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
  /** so hoch wie der Rahmen (Vollbild), sonst richtet sich die Höhe nach der Breite */
  fuellen?: boolean
  className: string
}) {
  const fuellenJetzt = useRef(fuellen)
  fuellenJetzt.current = fuellen
  const rahmen = useRef<HTMLDivElement>(null)
  // bei der Probefahrt auf der eigenen Seite rechnet die Szene die Stelle des Zugs selbst,
  // in ihrer Schleife: in der Brille läuft keine andere
  const eigenerZugHier = useRef<number | null>(null)
  const eigenerZug = probeStelle ?? eigenerZugHier
  const zug = zugVonAussen ?? (probe ? eigenerZug : undefined)
  const zusatz = useZusatz()
  // auch wenn die Szene neu gebaut wird (beim Fahren alle 12 km ein neuer Ausschnitt)
  useEffect(() => szeneLaden(), [])
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
    szene.background = himmel(dunkel)
    const kamera = new THREE.PerspectiveCamera(40, 1, 0.1, 500)
    // durchsichtig, damit die Brille im Passthrough die Umgebung zeigt
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    // für den Zug am Tunnelportal (zugSetzen)
    renderer.localClippingEnabled = true
    renderer.xr.enabled = !!brille
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.touchAction = 'none'
    el.appendChild(renderer.domElement)
    // das Pult im Führerstand (Fuehrerpult.ts), nur wo es einen Führerstand gibt; seine Rückmeldung kurz oben im Bild
    const pult = fuehrerstand ? new Fuehrerpult(Boolean(tempoAussen)) : null
    /** der Blick zur Seite jetzt, folgt seitenblick sanft */
    let seitenJetzt = 0
    if (pult) pult.aussen = aussen ?? null
    const pultMeldung = document.createElement('div')
    Object.assign(pultMeldung.style, { position: 'absolute', left: '50%', top: '56px', transform: 'translateX(-50%)', padding: '4px 10px',
      borderRadius: '8px', background: 'rgba(33,33,33,0.85)', color: '#fff', font: 'bold 13px Helvetica, Arial, sans-serif',
      pointerEvents: 'none', opacity: '0', transition: 'opacity 200ms', whiteSpace: 'nowrap' })
    pultMeldung.setAttribute('role', 'status')
    el.appendChild(pultMeldung)
    let pultMeldungBis = 0
    const pultMelden = (text: string | null) => {
      if (!text) return
      pultMeldung.textContent = text; pultMeldung.style.opacity = '1'; pultMeldungBis = performance.now() + 1600
    }

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
    const himmelLicht = new THREE.HemisphereLight('#ffffff', '#8a8a7a', 1.6)
    szene.add(himmelLicht)
    // Stirnlicht des Zugs im Führerstand; aus heisst Stärke 0, damit das Umschalten die Shader nicht neu baut
    const stirnlicht = new THREE.SpotLight('#fff3dc', 0, 0.4, 0.55, 0.8, 0)
    szene.add(stirnlicht, stirnlicht.target)
    const sonne = new THREE.DirectionalLight('#ffffff', 2.2)
    // Licht von Nordwesten wie auf der Landeskarte
    sonne.position.set(-1, 1.2, -1)
    szene.add(sonne)
    /** im Führerstand im Tunnel dunkel (Michael, 2026-10-10: «In Tunneln soll es dunkel werden»): das Tageslicht schwindet an den
     *  Portalen über TUNNEL_DUNKEL_M; 0 ist draussen, 1 tief im Tunnel */
    const tagHimmel = szene.background
    let daemmerHimmel: THREE.Texture | null = null
    const tunnelDunkel = (k: number, daemmerung = false) => {
      const f = 1 - (1 - TUNNEL_TAGESLICHT) * k
      himmelLicht.intensity = 1.6 * f * (daemmerung ? DAEMMERUNG_HIMMEL : 1)
      himmelLicht.color.set(daemmerung ? '#b9a9cf' : '#ffffff')
      sonne.intensity = 2.2 * f * (daemmerung ? DAEMMERUNG_SONNE : 1)
      sonne.color.set(daemmerung ? '#ff9a5c' : '#ffffff')
      // nur den gemalten Himmel tauschen; in der Brille mit Durchsicht bleibt er leer
      if (daemmerung && !daemmerHimmel) daemmerHimmel = himmel(dunkel, true)
      if (szene.background && (szene.background === tagHimmel || szene.background === daemmerHimmel)) {
        szene.background = daemmerung ? daemmerHimmel : tagHimmel
      }
      if (pult) {
        pult.umgebung((1 - 0.8 * k) * (daemmerung ? 0.12 : 1))
        // im Tunnel und in der Dämmerung leuchten die Tasten (Michael, 2026-10-13)
        pult.nacht = Math.max(k, daemmerung ? 1 : 0)
      }
    }

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
    /** Rauheit der Felswand, -1 bis 1, glatt im Raum (Meter/3 entlang, Seite rundum) */
    const felsZufall = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x) }
    const felsRauh = (t: number, k: number) => {
      let summe = 0
      for (const [stufe, gewicht] of [[1, 0.65], [2.7, 0.35]] as const) {
        const x = t * stufe, i = Math.floor(x), f = x - i, glatt = f * f * (3 - 2 * f)
        const k1 = Math.floor(k * stufe) % ROEHRE_PROFIL.length
        summe += gewicht * ((felsZufall(i, k1) * (1 - glatt) + felsZufall(i + 1, k1) * glatt) * 2 - 1)
      }
      return summe
    }
    /** ein Felsbild, gezeichnet: Flecken, Schichten und Risse; dasselbe Bild hebt die Wand im Licht (bumpMap) */
    let fels: THREE.MeshLambertMaterial | null = null
    const felsMaterial = () => {
      if (fels) return fels
      const lw = document.createElement('canvas')
      lw.width = lw.height = 256
      const c = lw.getContext('2d')!
      let zz = 7
      const z = () => { zz = (zz * 16807) % 2147483647; return zz / 2147483647 }
      c.fillStyle = '#7d776d'
      c.fillRect(0, 0, 256, 256)
      // Flecken, über die Kante hinaus wiederholt, damit das Bild nahtlos kachelt
      for (let n = 0; n < 900; n++) {
        const x = z() * 256, y = z() * 256, r = 2 + z() * 14, h = 70 + z() * 90
        c.fillStyle = `rgba(${h + 8},${h + 4},${h - 4},${0.12 + z() * 0.25})`
        for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
          c.beginPath(); c.ellipse(x + dx, y + dy, r, r * (0.5 + z() * 0.5), z() * Math.PI, 0, Math.PI * 2); c.fill()
        }
      }
      // Risse
      c.strokeStyle = 'rgba(30,27,24,0.55)'
      for (let n = 0; n < 40; n++) {
        let x = z() * 256, y = z() * 256
        c.lineWidth = 0.6 + z() * 1.4
        c.beginPath(); c.moveTo(x, y)
        for (let s = 0; s < 6; s++) { x += (z() - 0.5) * 30; y += (z() - 0.3) * 18; c.lineTo(x, y) }
        c.stroke()
      }
      const tex = new THREE.CanvasTexture(lw)
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      fels = new THREE.MeshLambertMaterial({ color: dunkel ? '#a29d94' : '#ffffff', map: tex, bumpMap: tex, bumpScale: 3,
        emissive: '#0b0a09', side: THREE.BackSide })
      return fels
    }
    const bodenMaterial = new THREE.MeshLambertMaterial({ color: '#4d4943', emissive: '#080706', side: THREE.BackSide })
    /** die Röhre eines Tunnels um die Punkte der Linie, nur von innen sichtbar (die Flächen zeigen nach aussen), dazu ein
     *  Lichtband */
    const tunnelRoehre = (roh: THREE.Vector3[], ziel: THREE.Object3D) => {
      if (roh.length < 2) return
      // dichter, damit der Fels auch entlang der Röhre Buckel hat
      const dicht: THREE.Vector3[] = [roh[0]]
      for (let i = 1; i < roh.length; i++) {
        const n = Math.ceil((roh[i].distanceTo(roh[i - 1]) * 1000) / ROEHRE_RING_M)
        for (let j = 1; j <= n; j++) dicht.push(roh[i - 1].clone().lerp(roh[i], j / n))
      }
      const punkte = dicht
      const pos: number[] = [], uv: number[] = [], wand: number[] = [], boden: number[] = [], licht: number[] = []
      const reihe = ROEHRE_PROFIL.length
      let laenge = 0
      punkte.forEach((p, i) => { if (i) laenge += Math.hypot(p.x - punkte[i - 1].x, p.z - punkte[i - 1].z) * 1000 })
      // Umfang bis zu jedem Punkt des Querschnitts, für das Felsbild
      const umfang = [0]
      for (let k = 1; k < reihe; k++) umfang.push(umfang[k - 1] + Math.hypot(ROEHRE_PROFIL[k].q - ROEHRE_PROFIL[k - 1].q, ROEHRE_PROFIL[k].h - ROEHRE_PROFIL[k - 1].h))
      let bisher = 0
      punkte.forEach((p, i) => {
        if (i) bisher += Math.hypot(p.x - punkte[i - 1].x, p.z - punkte[i - 1].z) * 1000
        const a = punkte[Math.max(0, i - 1)], z = punkte[Math.min(punkte.length - 1, i + 1)]
        const nx = -(z.z - a.z), nz = z.x - a.x, l = Math.hypot(nx, nz) || 1
        const sx = nx / l, sz = nz / l
        // an den Enden glatt
        const rand = Math.min(1, bisher / 6, (laenge - bisher) / 6)
        ROEHRE_PROFIL.forEach((x, k) => {
          const d = x.rauh ? ROEHRE_RAUH_M * rand * felsRauh(bisher / 3, k % (reihe - 1)) : 0
          const q = x.q + x.nq * d, h = x.h + x.nh * d
          pos.push(p.x + (sx * q) / 1000, p.y + (h * faktor) / 1000, p.z + (sz * q) / 1000)
          uv.push(umfang[k] / FELS_BILD_M, bisher / FELS_BILD_M)
          if (i && k < reihe - 1) {
            const v = (i - 1) * reihe, u = i * reihe
            ;(k < ROEHRE_WAND_TEILE ? wand : boden).push(v + k, u + k, v + k + 1, v + k + 1, u + k, u + k + 1)
          }
        })
        // Lichtband an einer Wand, etwas über dem Auge
        const lq = (ROEHRE_HALB_M - 0.35) * Math.cos(0.35), lh = ROEHRE_KAEMPFER_M + (ROEHRE_HALB_M - 0.35) * Math.sin(0.35)
        licht.push(p.x + (sx * lq) / 1000, p.y + (lh * faktor) / 1000, p.z + (sz * lq) / 1000)
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      g.setIndex([...wand, ...boden])
      g.addGroup(0, wand.length, 0)
      g.addGroup(wand.length, boden.length, 1)
      g.computeVertexNormals()
      ziel.add(new THREE.Mesh(g, [felsMaterial(), bodenMaterial]))
      const lg = new THREE.BufferGeometry()
      lg.setAttribute('position', new THREE.Float32BufferAttribute(licht, 3))
      ziel.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#ffe8a3' })))
    }
    const wegVon = nurBild.children.length
    for (const [anfang, ende] of weg.stuecke) {
      const grenzen = weg.bauwerke.filter((g) => g.bis > anfang && g.von < ende).sort((a, b) => a.von - b.von)
      let bei = anfang
      for (const g of grenzen) {
        if (g.von > bei) linie(strichVon(bei, g.von), wegFarbe, false)
        const von = Math.max(g.von, anfang, bei), bis = Math.min(g.bis, ende)
        if (bis > von) linie(strichVon(von, bis), g.art === 'tunnel' ? tunnelFarbe : FARBEN.bruecke, g.art === 'tunnel')
        if (bis > von && g.art === 'tunnel') tunnelRoehre(strichVon(von, bis), nurBild)
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
    // halb durchsichtig (Michael, 2026-10-15: «noch etwas markant … mit 50% Transparenz»)
    const schienenMaterial = new THREE.MeshBasicMaterial({ color: '#c4c8cd', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      transparent: true, opacity: 0.5, depthWrite: false })
    szene.add(feinNetz, feinLinien)
    // scharfe Umgebung, ein Versuch zwischen Müntschemier und Rosshäusern (Michael, 2026-10-11: «Ist dieser Detailgrad
    // umsetzbar, nur 200 m links und rechts der Bahnlinie?»): je Kachel von 250 m ein Netz auf 2 m (swissALTI3D) mit dem
    // Luftbild auf 25 cm, nur im Band neben der Linie; bis sein Bild geladen ist, trägt es die Leinwand des feinen Geländes
    const scharfGruppe = new THREE.Group()
    szene.add(scharfGruppe)
    // Gebäude, ein Versuch auf Gümmenen–Bern (Michael, 2026-10-13; pipeline/build_gebaeude.py): je Kachel ein Netz, nur im
    // Führerstand, geladen mit dem feinen Gelände, was nicht mehr darin liegt, fällt weg
    const gebaeudeGruppe = new THREE.Group()
    gebaeudeGruppe.visible = false
    szene.add(gebaeudeGruppe)
    const gebaeudeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    const gebaeudeNetze = new Map<string, THREE.Mesh>()
    let gebaeudeAuftrag = 0
    const gebaeudeSetzen = async (e0: number, n0: number, e1: number, n1: number) => {
      const auftrag = ++gebaeudeAuftrag
      const namen = await gebaeudeNamen(e0, n0, e1, n1)
      if (!laeuft || auftrag !== gebaeudeAuftrag) return
      for (const [name, netz] of gebaeudeNetze) {
        if (namen.includes(name)) continue
        gebaeudeGruppe.remove(netz); netz.geometry.dispose(); gebaeudeNetze.delete(name)
      }
      for (const name of namen) {
        if (gebaeudeNetze.has(name)) continue
        const k = await gebaeudeKachel(name)
        if (!laeuft || auftrag !== gebaeudeAuftrag) return
        if (!k || gebaeudeNetze.has(name)) continue
        const n = k.ecken.length / 3, pos = new Float32Array(n * 3), farbe = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
          pos[i * 3] = X(k.e0 + k.ecken[i * 3] / 10)
          pos[i * 3 + 1] = Y((k.h0 + k.ecken[i * 3 + 1]) / 10)
          pos[i * 3 + 2] = Z(k.n0 + k.ecken[i * 3 + 2] / 10)
          for (let c = 0; c < 3; c++) { const f = k.farben[i * 3 + c] / 255; farbe[i * 3 + c] = f <= 0.04045 ? f / 12.92 : ((f + 0.055) / 1.055) ** 2.4 }
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        g.setAttribute('color', new THREE.BufferAttribute(farbe, 3))
        g.computeVertexNormals()
        const netz = new THREE.Mesh(g, gebaeudeMaterial)
        gebaeudeGruppe.add(netz)
        gebaeudeNetze.set(name, netz)
      }
    }
    // Strassen- und Wegbrücken über der Bahn (Michael, 2026-10-15: «Ist es möglich, eine Autobrücke zu konstruieren?»;
    // pipeline/build_strassenbruecken.py): Verlauf und Höhe der Strassenachse aus swissTLM3D, die Breite aus dem Namen der
    // Klasse, sonst STRASSE_BREITE_ANNAHME; gezeichnet als Trog mit Platte und zwei Brüstungen, Masse in keiner Quelle
    const strassenGruppe = new THREE.Group()
    strassenGruppe.visible = false
    szene.add(strassenGruppe)
    const brueckenMaterial = new Map<BrueckenArt, THREE.MeshLambertMaterial>()
    for (const art of ['beton', 'schotter', 'belag'] as const) {
      const m2 = new THREE.MeshLambertMaterial({ map: brueckenBild(art), vertexColors: true, side: THREE.DoubleSide })
      m2.userData.geteilt = true
      brueckenMaterial.set(art, m2)
    }
    /** ein Querschnitt entlang einer Achse: je Stelle Lage (e, n), Richtung quer (qe, qn), Höhe der Achse (m), Meter
     *  entlang ihr und der Querschnitt dort; je Bild ein Netz, Bilder in Metern (BRUECKE_BILD_M) */
    const querschnittNetze = (stellen: Array<{ e: number; n: number; qe: number; qn: number; z: number; s: number; quer: QuerFlaeche[] }>) => {
      const teile = new Map<BrueckenArt, { pos: number[]; uv: number[]; farbe: number[] }>()
      for (let i = 0; i + 1 < stellen.length; i++) {
        const A = stellen[i], B = stellen[i + 1]
        A.quer.forEach((fa, k) => {
          const fb = B.quer[k]
          let t = teile.get(fa.art)
          if (!t) { t = { pos: [], uv: [], farbe: [] }; teile.set(fa.art, t) }
          const flach = Math.abs(fa.h1 - fa.h0) < Math.abs(fa.a1 - fa.a0)
          const ecke = (S: typeof A, a: number, h: number, hell: number) => {
            t!.pos.push(X(S.e + S.qe * a), Y(S.z + h), Z(S.n + S.qn * a))
            t!.uv.push(S.s / BRUECKE_BILD_M, (flach ? a : h) / BRUECKE_BILD_M)
            t!.farbe.push(hell, hell, hell)
          }
          const e1 = () => ecke(A, fa.a0, fa.h0, fa.hell0), e2 = () => ecke(A, fa.a1, fa.h1, fa.hell1)
          const e3 = () => ecke(B, fb.a1, fb.h1, fb.hell1), e4 = () => ecke(B, fb.a0, fb.h0, fb.hell0)
          e1(); e2(); e3(); e1(); e3(); e4()
        })
      }
      return [...teile].map(([art, t]) => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3))
        g.setAttribute('uv', new THREE.Float32BufferAttribute(t.uv, 2))
        g.setAttribute('color', new THREE.Float32BufferAttribute(t.farbe, 3))
        g.computeVertexNormals()
        return new THREE.Mesh(g, brueckenMaterial.get(art)!)
      })
    }
    let strassenAuftrag = 0
    const strassenSetzen = async (e0: number, n0: number, e1: number, n1: number) => {
      const auftrag = ++strassenAuftrag
      const d = await strassenbrueckenLaden().catch(() => null)
      if (!laeuft || auftrag !== strassenAuftrag || !d) return
      for (const c of strassenGruppe.children) (c as THREE.Mesh).geometry.dispose()
      strassenGruppe.clear()
      for (const b of d.bruecken) {
        const pk: Array<[number, number, number]> = []
        for (let i = 0; i < b.d.length; i += 3) pk.push([b.e + b.d[i] / 10, b.n + b.d[i + 1] / 10, (b.h + b.d[i + 2]) / 10])
        if (pk.length < 2 || !pk.some(([e, n]) => e >= e0 && e <= e1 && n >= n0 && n <= n1)) continue
        const quer = strassenQuerschnitt(strasseHalb(b))
        let lang = 0
        const stellen = pk.map(([e, n, z], i) => {
          const [ea, na] = pk[Math.max(0, i - 1)], [eb, nb] = pk[Math.min(pk.length - 1, i + 1)]
          const l = Math.hypot(eb - ea, nb - na) || 1
          if (i) lang += Math.hypot(e - pk[i - 1][0], n - pk[i - 1][1])
          return { e, n, qe: -(nb - na) / l, qn: (eb - ea) / l, z, s: lang, quer }
        })
        for (const netz of querschnittNetze(stellen)) strassenGruppe.add(netz)
      }
    }
    // Bäume und Wald, ein Versuch auf den Strecken der Gebäude (Michael, 2026-10-13; pipeline/build_baeume.py): je Kachel ein
    // InstancedMesh, Einzelbäume wo swissTLM3D sie hat, Waldflächen mit gezeichneten Bäumen gefüllt; Höhe und Breite je Art
    // in keiner Quelle (BAUM_FORM), je Baum bis 25 % grösser oder kleiner, der Fuss auf dem Gelände der App
    const baumGruppe = new THREE.Group()
    baumGruppe.visible = false
    szene.add(baumGruppe)
    const baumForm = (() => {
      const krone = new THREE.IcosahedronGeometry(1, 0)
      krone.scale(1, 0.62, 1); krone.translate(0, 0.62, 0)
      const stamm = new THREE.CylinderGeometry(0.06, 0.09, 0.4, 4, 1, true)
      stamm.translate(0, 0.2, 0)
      const teile = [krone.toNonIndexed(), stamm.toNonIndexed()]
      const pos: number[] = [], farbe: number[] = [], nrm: number[] = []
      teile.forEach((t, i) => {
        const a = t.getAttribute('position').array
        for (let k = 0; k < a.length; k++) pos.push(a[k])
        // die Krone gerundet beleuchtet wie eine Kugel, mit nur 20 Dreiecken; der Stamm flach
        if (i === 0) for (let k = 0; k < a.length; k += 3) { const v = new THREE.Vector3(a[k], (a[k + 1] - 0.62) / 0.62, a[k + 2]).normalize(); nrm.push(v.x, v.y, v.z) }
        else { t.computeVertexNormals(); const n = t.getAttribute('normal').array; for (let k = 0; k < n.length; k++) nrm.push(n[k]) }
        for (let k = 0; k < a.length / 3; k++) farbe.push(...(i === 0 ? [1, 1, 1] : [0.35, 0.22, 0.25]))
        t.dispose()
      })
      krone.dispose(); stamm.dispose()
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(farbe, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
      return g
    })()
    const baumMaterial = new THREE.MeshLambertMaterial({ vertexColors: true })
    const baumNetze = new Map<string, THREE.InstancedMesh>()
    let baumAuftrag = 0
    /** die gezeichnete Strecke im Rechteck als Stücke von 5 m (wie im Führerstand gezeichnet, glattBei) */
    const gleisIn = (e0: number, n0: number, e1: number, n1: number) => {
      const rand = 400
      const stuecke: number[] = []
      let von: number | null = null, bis = 0
      const abschliessen = () => {
        if (von === null) return
        let alt = glattBei(Math.max(pk[0].m, von - 400))
        for (let meter = Math.max(pk[0].m, von - 400) + 5; meter <= Math.min(pk[pk.length - 1].m, bis + 400); meter += 5) {
          const neu = glattBei(meter)
          stuecke.push(alt[0], alt[1], neu[0], neu[1])
          alt = neu
        }
        von = null
      }
      for (const p of pk) {
        const drin = p.e > e0 - rand && p.e < e1 + rand && p.n > n0 - rand && p.n < n1 + rand
        if (drin) { if (von === null) von = p.m; bis = p.m } else abschliessen()
      }
      abschliessen()
      return stuecke
    }
    const gleisAbstand = (stuecke: number[], e: number, n: number) => {
      let d = Infinity
      for (let i = 0; i < stuecke.length; i += 4) {
        const ax = stuecke[i], ay = stuecke[i + 1], dx = stuecke[i + 2] - ax, dy = stuecke[i + 3] - ay
        const t = Math.max(0, Math.min(1, ((e - ax) * dx + (n - ay) * dy) / (dx * dx + dy * dy || 1)))
        d = Math.min(d, Math.hypot(e - ax - t * dx, n - ay - t * dy))
      }
      return d
    }
    const baumSetzen = async (e0: number, n0: number, e1: number, n1: number) => {
      const auftrag = ++baumAuftrag
      // nur bis BAUM_BIS_M um die Mitte des feinen Geländes: im dichtesten Wald stehen im ganzen Quadrat bis 67'000 Bäume
      const ce = (e0 + e1) / 2, cn = (n0 + n1) / 2
      const namen = (await baumNamen(e0, n0, e1, n1)).filter((name) => {
        const [qe, qn] = name.split('_').map(Number)
        return Math.hypot((qe + 0.5) * 500 - ce, (qn + 0.5) * 500 - cn) <= BAUM_BIS_M
      })
      if (!laeuft || auftrag !== baumAuftrag) return
      for (const [name, netz] of baumNetze) {
        if (namen.includes(name)) continue
        baumGruppe.remove(netz); netz.dispose(); baumNetze.delete(name)
      }
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color()
      for (const name of namen) {
        if (baumNetze.has(name)) continue
        const k = await baumKachel(name)
        if (!laeuft || auftrag !== baumAuftrag) return
        const fs = feinStand
        if (!k || !fs || baumNetze.has(name)) continue
        const n = k.art.length
        const netz = new THREE.InstancedMesh(baumForm, baumMaterial, n)
        const gleis = gleisIn(k.e0, k.n0, k.e0 + 500, k.n0 + 500)
        let z = 0
        for (let i = 0; i < n; i++) {
          const e = k.e0 + k.lage[i * 2] / 10, nn = k.n0 + k.lage[i * 2 + 1] / 10
          const h = (scharfStand && scharfHoehe(scharfStand, e, nn)) ?? feinHoehe(fs.fein, e, nn)
          if (h === null) continue
          const [hoehe, breite] = BAUM_FORM[k.art[i]] ?? BAUM_FORM[0]
          // gleichmässig gestreut, aber je Baum immer gleich
          const r = Math.sin(e * 12.9898 + nn * 78.233) * 43758.5453, f = 0.75 + 0.5 * (r - Math.floor(r))
          // Lichtraum: keine Krone über dem Gleis (Michael, 2026-10-14: «Teilweise liegen Bäume auf der Strecke»)
          if (gleisAbstand(gleis, e, nn) < breite * f + BAUM_LICHTRAUM_M) continue
          v.set(X(e), Y(h - 0.5), Z(nn))
          s.set(X(breite * f) - X(0), Y(hoehe * f) - Y(0), X(breite * f) - X(0))
          q.setFromAxisAngle(OBEN, f * 20)
          netz.setMatrixAt(z, m.compose(v, q, s))
          const lin = (x: number) => { const t = x / 255; return t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4 }
          netz.setColorAt(z, c.setRGB(lin(k.farben[i * 3]), lin(k.farben[i * 3 + 1]), lin(k.farben[i * 3 + 2]), THREE.LinearSRGBColorSpace))
          z++
        }
        netz.count = z
        netz.instanceMatrix.needsUpdate = true
        if (netz.instanceColor) netz.instanceColor.needsUpdate = true
        netz.computeBoundingSphere()
        baumGruppe.add(netz)
        baumNetze.set(name, netz)
      }
    }
    let scharfStand: Scharf | null = null
    let scharfMitBild = false
    /** Tempo des Zugs in m/s, geglättet, und seine letzte Stelle, für das Vorausladen der Bilder */
    let scharfV = 0, scharfAltS: number | null = null
    interface ScharfNetz { name: string; netz: THREE.Mesh; mitte: [number, number]; uvFein: THREE.BufferAttribute; uvEigen: THREE.BufferAttribute; bild: 'nein' | 'laedt' | 'da' }
    let scharfNetze: ScharfNetz[] = []
    const scharfWeg = () => {
      for (const x of scharfNetze) {
        const mat = x.netz.material as THREE.MeshLambertMaterial
        if (mat.map !== feinTextur) mat.map?.dispose()
        mat.dispose(); x.netz.geometry.dispose()
      }
      scharfNetze = []
      scharfGruppe.clear()
      scharfStand = null
    }
    /** eigene Bilder nur nahe beim Punkt e, n; weiter weg wieder die Leinwand des feinen Geländes */
    const scharfBilderPflegen = (e: number, n: number) => {
      for (const x of scharfNetze) {
        const d = Math.hypot(x.mitte[0] - e, x.mitte[1] - n), mat = x.netz.material as THREE.MeshLambertMaterial
        if (d < SCHARF_BILD_M && x.bild === 'nein') {
          x.bild = 'laedt'
          scharfBild(x.name).then((bm) => {
            if (!scharfNetze.includes(x) || x.bild !== 'laedt') { bm.close(); return }
            // unter Brücken retuschiert (retuschieren), sonst das Bild, wie es kommt
            const [qe, qn] = x.name.split('_').map(Number), ke0 = qe * SCHARF_KACHEL_M, kn1 = (qn + 1) * SCHARF_KACHEL_M
            const trifft = feinStreifen.filter((st) => st.p.some(([e, n], i) => {
              const r = Math.max(-st.lo[i], st.hi[i]) + RETUSCHE_RAND_M + 30
              return e > ke0 - r && e < ke0 + SCHARF_KACHEL_M + r && n > kn1 - SCHARF_KACHEL_M - r && n < kn1 + r
            }))
            let quelle: ImageBitmap | HTMLCanvasElement = bm
            if (trifft.length) {
              const c = document.createElement('canvas')
              c.width = bm.width; c.height = bm.height
              const cx = c.getContext('2d', { willReadFrequently: true })!
              cx.drawImage(bm, 0, 0)
              bm.close()
              retuschieren(cx, c.width, c.height, ke0, kn1, c.width / SCHARF_KACHEL_M, trifft)
              quelle = c
            }
            const t = new THREE.Texture(quelle)
            t.flipY = false
            t.colorSpace = THREE.SRGBColorSpace
            t.anisotropy = renderer.capabilities.getMaxAnisotropy()
            t.needsUpdate = true
            mat.map = t
            x.netz.geometry.setAttribute('uv', x.uvEigen)
            x.bild = 'da'
          }).catch(() => { if (x.bild === 'laedt') x.bild = 'nein' })
        } else if (d > SCHARF_LOS_M && x.bild !== 'nein') {
          if (x.bild === 'da') { const t = mat.map!; (t.image as ImageBitmap).close?.(); t.dispose() }
          mat.map = feinTextur
          x.netz.geometry.setAttribute('uv', x.uvFein)
          x.bild = 'nein'
        }
      }
    }
    const grundY = new Float32Array(netzPunkte)
    for (let v = 0; v < netzPunkte; v++) grundY[v] = pos[v * 3 + 1]
    let versenkt: number[] = []
    let feinNah: Nahbild | null = null
    /** unter den gezeichneten Brücken: Streifen für die Retusche und je Bahnbrücke die Breite (brueckeQuer) alle 10 m */
    let feinStreifen: Streifen[] = []
    let brueckenBreite = new Map<object, { von: number; lo: number[]; hi: number[]; gleise: number[] }>()
    let feinAuftrag = 0
    /** Lage im Führerstand: der Verlauf ist ein Zug aus Geraden mit Ecken alle 100 bis 350 m. Früher über 80 m davor
     *  und danach gemittelt (Michael, 2026-10-11: «die Kurven noch runder»), das zog die Linie in jeder Kurve um 5 bis 10 m
     *  nach innen (Michael, 2026-10-14: «dass die Strecke die Kurven zu stark schneidet»). Jetzt eine Kurve durch jeden Punkt
     *  der Quelle (Catmull-Rom, zentripetal): dort liegt sie auf dem Gleis, dazwischen folgt sie dem Bogen statt der Sehne */
    const glattBei = (meter: number): readonly [number, number] => {
      let lo = 1, hi = pk.length - 1
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pk[mid].m < meter) lo = mid + 1; else hi = mid }
      const i1 = Math.max(0, lo - 1), i2 = lo
      const p1 = pk[i1], p2 = pk[i2]
      const t = Math.max(0, Math.min(1, (meter - p1.m) / ((p2.m - p1.m) || 1)))
      // die Nachbarn, an den Enden gespiegelt
      const p0 = i1 > 0 ? pk[i1 - 1] : { e: 2 * p1.e - p2.e, n: 2 * p1.n - p2.n }
      const p3 = i2 < pk.length - 1 ? pk[i2 + 1] : { e: 2 * p2.e - p1.e, n: 2 * p2.n - p1.n }
      const knoten = (a: { e: number; n: number }, b: { e: number; n: number }) => Math.max(1e-3, Math.sqrt(Math.hypot(b.e - a.e, b.n - a.n)))
      const t0 = 0, t1 = t0 + knoten(p0, p1), t2 = t1 + knoten(p1, p2), t3 = t2 + knoten(p2, p3)
      const u = t1 + t * (t2 - t1)
      const mix = (a: number, b: number, ta: number, tb: number) => ((tb - u) * a + (u - ta) * b) / (tb - ta)
      const wert = (k: 'e' | 'n') => {
        const a1 = mix(p0[k], p1[k], t0, t1), a2 = mix(p1[k], p2[k], t1, t2), a3 = mix(p2[k], p3[k], t2, t3)
        const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3)
        return mix(b1, b2, t1, t2)
      }
      return [wert('e'), wert('n')]
    }
    /** Höhe der Linie im Führerstand, je PROFIL_SCHRITT_M einmal gerechnet, wenn das feine Gelände kommt (profilRechnen) */
    let profil: { von: number; h: Float32Array } | null = null
    const PROFIL_SCHRITT_M = 10
    const profilRechnen = (stelle: number) => {
      profil = null
      if (!feinStand) return
      const { fein } = feinStand
      const anfang = pk[0].m, ende = pk[pk.length - 1].m
      const von = Math.max(anfang, stelle - 7000), bis = Math.min(ende, stelle + 7000)
      const n = Math.max(2, Math.floor((bis - von) / PROFIL_SCHRITT_M) + 1)
      const bei = (i: number) => Math.min(bis, von + i * PROFIL_SCHRITT_M)
      const imBau = (mm: number) => weg.bauwerke.some((x) => mm > x.von && mm < x.bis)
      // das Gelände unter der Linie; unter Brücken und über Tunneln zählt es nicht (swissALTI3D zeigt dort den Talgrund
      // oder den Berg)
      const roh = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const mm = bei(i), [e, n2] = glattBei(mm)
        const z = imBau(mm) ? null : (scharfStand && scharfHoehe(scharfStand, e, n2)) ?? feinHoehe(fein, e, n2)
        roh[i] = z === null ? NaN : z
      }
      // Unebenheiten (Michael, 2026-10-11: «teilweise … noch kleine Unebenheiten»): Unterführungen, Gräben, Strassen
      // unter der Bahn und Bäume am Rand zogen die Linie auf und ab. Zuerst der Median über PROFIL_MEDIAN_M davor und
      // danach, der einzelne Ausreisser übergeht, dann das Mittel über PROFIL_MITTEL_M
      const median = new Float32Array(n), w = [] as number[]
      const km = Math.round(PROFIL_MEDIAN_M / PROFIL_SCHRITT_M), kg = Math.round(PROFIL_MITTEL_M / PROFIL_SCHRITT_M)
      for (let i = 0; i < n; i++) {
        w.length = 0
        for (let k = Math.max(0, i - km); k <= Math.min(n - 1, i + km); k++) if (!Number.isNaN(roh[k])) w.push(roh[k])
        if (w.length < 3) { median[i] = NaN; continue }
        w.sort((a, b) => a - b)
        median[i] = w[w.length >> 1]
      }
      // Täler und Buckel ohne Brücke oder Tunnel in den Daten (Michael, 2026-10-11, Bern: über die Lorrainebrücke fiel die
      // Linie 40 m ins Aaretal, weil die Quelle für diese Brücke keine Länge nennt). Ein Gleis steigt und fällt nur
      // wenige Prozent; ist das Gelände schmaler als TAL_FENSTER_M um mehr als TAL_TIEFE_M tiefer oder höher als
      // ringsum und dabei steiler als TAL_STEIGUNG, führt die Linie gerade darüber oder darunter durch. Ob dort eine
      // Brücke oder ein Tunnel steht, sagt das nicht; gezeichnet wird keine
      const kt = Math.round(TAL_FENSTER_M / 2 / PROFIL_SCHRITT_M)
      const fenster = (a: Float32Array, i: number, max: boolean) => {
        let v = NaN
        for (let k = Math.max(0, i - kt); k <= Math.min(n - 1, i + kt); k++) {
          if (Number.isNaN(a[k])) continue
          if (Number.isNaN(v) || (max ? a[k] > v : a[k] < v)) v = a[k]
        }
        return v
      }
      const huelle = (max: boolean) => {
        const zuerst = new Float32Array(n), dann = new Float32Array(n)
        for (let i = 0; i < n; i++) zuerst[i] = fenster(median, i, max)
        for (let i = 0; i < n; i++) dann[i] = fenster(zuerst, i, !max)
        return dann
      }
      for (const tal of [true, false]) {
        const h2 = huelle(tal)
        let i = 0
        while (i < n) {
          const tief = (k: number) => !Number.isNaN(median[k]) && !Number.isNaN(h2[k]) && (tal ? h2[k] - median[k] : median[k] - h2[k]) > TAL_TIEFE_M
          if (!tief(i)) { i++; continue }
          let z = i
          while (z + 1 < n && tief(z + 1)) z++
          const a0 = Math.max(0, i - 3), z0 = Math.min(n - 1, z + 3)
          let steil = false
          for (let k = a0; k < z0; k++) {
            if (!Number.isNaN(median[k]) && !Number.isNaN(median[k + 1]) && Math.abs(median[k + 1] - median[k]) / PROFIL_SCHRITT_M > TAL_STEIGUNG) steil = true
          }
          if (steil && !Number.isNaN(median[a0]) && !Number.isNaN(median[z0])) {
            for (let k = a0 + 1; k < z0; k++) median[k] = median[a0] + ((k - a0) / (z0 - a0)) * (median[z0] - median[a0])
          }
          i = z + 1
        }
      }
      const boden = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        let t = 0, k2 = 0
        for (let k = Math.max(0, i - kg); k <= Math.min(n - 1, i + kg); k++) if (!Number.isNaN(median[k])) { t += median[k]; k2++ }
        boden[i] = k2 ? t / k2 + FEIN_UEBER_M : NaN
      }
      const bodenBei = (mm: number) => {
        const i = Math.round((mm - von) / PROFIL_SCHRITT_M)
        if (i < 0 || i >= n) return null
        return Number.isNaN(boden[i]) ? null : boden[i]
      }
      // liegt ein Ende ausserhalb des feinen Geländes (ein langer Tunnel wie bei Rosshäusern), nimmt es die grobe Höhe dort,
      // um den Unterschied am anderen Ende verschoben; vorher fiel der ganze Tunnel auf die grobe Höhe, 20 m zu hoch
      const enden = (a: number, b: number, za0: number | null, zb0: number | null): [number, number] | null => {
        if (za0 !== null && zb0 !== null) return [za0, zb0]
        if (za0 !== null) return [za0, hoeheAmWeg(b) + za0 - hoeheAmWeg(a)]
        if (zb0 !== null) return [hoeheAmWeg(a) + zb0 - hoeheAmWeg(b), zb0]
        return null
      }
      const h = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const meter = bei(i)
        let z: number | null
        // vor einem Tunnel steigt das Gelände zum Hang hinauf, oft schon vor dem Anfang laut swissTLM3D; die Linie stieg mit
        // und fiel dann in den Tunnel (Michael, 2026-10-11: «kurz vor dem Tunnelportal in die Höhe»). Darum gilt von
        // TUNNEL_ANLAUF_M davor bis ebenso weit danach eine Gerade, und davor und danach liegt die Linie nie über ihr
        const tunnel = weg.bauwerke.find((x) => x.art === 'tunnel' && meter >= x.von - TUNNEL_ANLAUF_M && meter <= x.bis + TUNNEL_ANLAUF_M)
        const bau = weg.bauwerke.find((x) => meter >= x.von && meter <= x.bis)
        const va = tunnel ? Math.max(anfang, tunnel.von - TUNNEL_ANLAUF_M) : 0, vb = tunnel ? Math.min(ende, tunnel.bis + TUNNEL_ANLAUF_M) : 0
        const ez = tunnel ? enden(va, vb, bodenBei(va), bodenBei(vb)) : null
        if (tunnel && ez) {
          const gerade = ez[0] + ((meter - va) / ((vb - va) || 1)) * (ez[1] - ez[0])
          const hier = meter > tunnel.von && meter < tunnel.bis ? null : bodenBei(meter)
          z = hier === null ? gerade : Math.min(hier, gerade)
        } else if (bau) {
          // in Tunneln und auf Brücken gerade zwischen den Enden
          const eb = enden(bau.von, bau.bis, bodenBei(bau.von), bodenBei(bau.bis))
          z = eb ? eb[0] + ((meter - bau.von) / ((bau.bis - bau.von) || 1)) * (eb[1] - eb[0]) : null
        } else z = bodenBei(meter)
        h[i] = z ?? hoeheAmWeg(meter)
      }
      // zuletzt leicht gemittelt, damit auch die Übergänge an Brücken und Tunnelportalen keinen Knick haben
      const kl = Math.round(PROFIL_UEBERGANG_M / PROFIL_SCHRITT_M), glatt = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        let t = 0, k2 = 0
        for (let k = Math.max(0, i - kl); k <= Math.min(n - 1, i + kl); k++) { t += h[k]; k2++ }
        glatt[i] = t / k2
      }
      h.set(glatt)
      profil = { von, h }
    }
    /** Höhe der Linie im Führerstand: aus dem Profil, gegen den Rand des Quadrats in die grobe übergehend */
    const feinLinieHoehe = (meter: number) => {
      const grob = hoeheAmWeg(meter)
      if (!feinStand || !profil) return grob
      const { e0, n0 } = feinStand, { von, h } = profil
      const x = (meter - von) / PROFIL_SCHRITT_M
      if (x < 0 || x > h.length - 1) return grob
      const i = Math.min(h.length - 2, Math.floor(x)), t = x - i
      const z = h[i] * (1 - t) + h[i + 1] * t
      const [e, n] = punktBei(meter)
      const rand = Math.min(e - e0, e0 + FEIN_SEITE_M - e, n - n0, n0 + FEIN_SEITE_M - n)
      const a = Math.max(0, Math.min(1, rand / FEIN_RAND_M))
      return z * a + grob * (1 - a)
    }
    const feinPunkt3d = (meter: number) => {
      const [e, n] = glattBei(meter)
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
        retuschieren(feinCtx, w, w, e0, n1, FEIN_PX_JE_M, feinStreifen)
        // schmal: aus dem Führerstand gesehen wirkten Ränder in der Breite wie darunter (etwa 10 m) als Streifen neben dem Gleis
        linienMalen(ausJetzt.current, true, { ctx: feinCtx, fx, fy, w, h: w, dicke: 0.6 })
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
      profil = null
      tafelnSetzen()
      feinNetz.visible = false
      gebaeudeGruppe.visible = false
      strassenGruppe.visible = false
      baumGruppe.visible = false
      // Röhren haben zwei Materialien; Fels und Boden teilen alle Tunnel
      feinLinien.traverse((o) => {
        const x = o as THREE.Mesh
        x.geometry?.dispose()
        if (x.material && !Array.isArray(x.material) && x.material !== fels && x.material !== schienenMaterial && !x.material.userData.geteilt) x.material.dispose()
      })
      feinLinien.clear()
      scharfWeg()
      for (const o of wegStriche) o.visible = true
      nahZeichnen()
    }
    const feinSetzen = async (stelle: number, richtung: number) => {
      const auftrag = ++feinAuftrag
      const anfang = pk[0].m, ende = pk[pk.length - 1].m
      const [ce, cn] = punktBei(Math.max(anfang, Math.min(ende, stelle + richtung * FEIN_VORAUS_M)))
      const e0 = Math.round((ce - FEIN_SEITE_M / 2) / 10) * 10, n0 = Math.round((cn - FEIN_SEITE_M / 2) / 10) * 10
      const e1 = e0 + FEIN_SEITE_M, n1 = n0 + FEIN_SEITE_M
      scharfMitBild = nahErlaubt
      const [fein, nahBild, scharf, achsen, strassen] = await Promise.all([feinLaden(e0, n0, e1, n1), luftbild ? nahbildLaden(e0, n0, e1, n1) : null,
                                                          nahErlaubt ? scharfLaden(e0, n0, e1, n1) : null,
                                                          bahnbrueckenLaden().catch(() => null), strassenbrueckenLaden().catch(() => null)])
      if (!laeuft || auftrag !== feinAuftrag || !imStand) return
      feinWeg()
      if (!fein) return
      feinStand = { fein, e0, n0 }
      feinNah = nahBild
      scharfStand = scharf
      profilRechnen(stelle)
      tafelnSetzen()
      // Bahnbrücken: Breite alle 10 m, leicht gemittelt; dazu die Strassenbrücken, wie strassenSetzen sie zeichnet
      feinStreifen = []
      brueckenBreite = new Map()
      const wVon = Math.max(anfang, stelle - 6000), wBis = Math.min(ende, stelle + 6000)
      for (const x of weg.bauwerke) {
        if (x.art !== 'bruecke' || x.bis <= wVon || x.von >= wBis) continue
        const a = Math.max(x.von, wVon), z = Math.min(x.bis, wBis), pkt: Array<[number, number]> = [], lo: number[] = [], hi: number[] = []
        const gleise = new Map<number, Array<[number, number]>>()
        for (let mm = a; ; mm = Math.min(z, mm + 10)) {
          const [pe, pn] = glattBei(mm), [ve, vn] = glattBei(Math.max(anfang, mm - 5)), [he, hn] = glattBei(Math.min(ende, mm + 5))
          const hier = new Map<number, number>()
          const l = Math.hypot(he - ve, hn - vn) || 1, [l0, h0] = brueckeQuer(achsen, pe, pn, (he - ve) / l, (hn - vn) / l, hier)
          for (const [id, d] of hier) { const g = gleise.get(id); if (g) g.push([mm, d]); else gleise.set(id, [[mm, d]]) }
          pkt.push([pe, pn]); lo.push(l0); hi.push(h0)
          if (mm >= z) break
        }
        // je Gleis ein fester Abstand über die ganze Brücke, der Median (Michael, 2026-10-15: «dass die Gleise parallel
        // zueinander laufen»): die Achsen von swissTLM3D und die gezeichnete Linie weichen um ein paar Meter voneinander ab,
        // alle 10 m neu gemessen liefen die Gleise schräg; näher als GLEIS_NAH_M beieinander gilt als dasselbe Gleis
        const median = (a2: number[]) => { const t = [...a2].sort((u, v) => u - v); return t[Math.floor(t.length / 2)] }
        const versatz = [0]
        for (const d of [...gleise.values()].filter((g) => g.length > 1).map((g) => median(g.map(([, d2]) => d2))).sort((u, v) => Math.abs(u) - Math.abs(v))) {
          if (versatz.every((v) => Math.abs(v - d) >= GLEIS_NAH_M)) versatz.push(d)
        }
        // eine Achse mit zwei Gleisen laut Quelle (brueckeQuer) verbreitert die Platte, ohne eigenes Gleis darauf
        const lo1 = Math.min(median(lo) + BRUECKE_RAND_M, ...versatz) - BRUECKE_RAND_M, hi1 = Math.max(median(hi) - BRUECKE_RAND_M, ...versatz) + BRUECKE_RAND_M
        const lo2 = lo.map(() => lo1), hi2 = hi.map(() => hi1)
        brueckenBreite.set(x, { von: a, lo: lo2, hi: hi2, gleise: versatz.slice(1) })
        feinStreifen.push({ p: pkt, lo: lo2, hi: hi2 })
      }
      for (const b of strassen?.bruecken ?? []) {
        const pk2: Array<[number, number]> = []
        for (let i = 0; i < b.d.length; i += 3) pk2.push([b.e + b.d[i] / 10, b.n + b.d[i + 1] / 10])
        if (pk2.length < 2 || !pk2.some(([e, n]) => e >= e0 && e <= e1 && n >= n0 && n <= n1)) continue
        const w2 = strasseHalb(b)
        feinStreifen.push({ p: pk2, lo: pk2.map(() => -w2), hi: pk2.map(() => w2) })
      }
      // unter dem scharfen Band sinkt das feine Gelände, wo es rundum scharfe Höhen gibt
      const scharfDa = (e: number, n: number) => !!scharf && [[0, 0], [-10, 0], [10, 0], [0, -10], [0, 10]].every(([de, dn]) => scharfHoehe(scharf, e + de, n + dn) !== null)
      // das Netz: ein Punkt je Feld von 10 m, nur Vierecke mit vier Höhen
      const I0 = Math.ceil((e0 - 5) / 10), J1 = Math.floor((n1 - 5) / 10), b = FEIN_SEITE_M / 10
      const p2 = new Float32Array(b * b * 3), uv2 = new Float32Array(b * b * 2), da = new Uint8Array(b * b)
      for (let j = 0; j < b; j++) {
        for (let i = 0; i < b; i++) {
          const k = j * b + i, e = (I0 + i) * 10 + 5, n = (J1 - j) * 10 + 5
          let z = feinFeld(fein, I0 + i, J1 - j)
          if (z === null) continue
          if (scharfDa(e, n)) z -= SCHARF_TIEFER_M
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
      gebaeudeGruppe.visible = true
      void gebaeudeSetzen(e0, n0, e1, n1)
      strassenGruppe.visible = true
      void strassenSetzen(e0, n0, e1, n1)
      baumGruppe.visible = true
      void baumSetzen(e0, n0, e1, n1)
      feinMalen?.()
      if (scharf) {
        const P = SCHARF_PUNKTE, schritt = SCHARF_KACHEL_M / (P - 1)
        for (const [name, a] of scharf.kacheln) {
          const [qe, qn] = name.split('_').map(Number)
          const p3 = new Float32Array(P * P * 3), uvF = new Float32Array(P * P * 2), uvE = new Float32Array(P * P * 2)
          for (let j = 0; j < P; j++) {
            for (let i = 0; i < P; i++) {
              const k = j * P + i, e = qe * SCHARF_KACHEL_M + i * schritt, n = (qn + 1) * SCHARF_KACHEL_M - j * schritt
              p3[k * 3] = X(e); p3[k * 3 + 1] = Y(Number.isNaN(a[k]) ? 0 : a[k]); p3[k * 3 + 2] = Z(n)
              uvF[k * 2] = (e - e0) / FEIN_SEITE_M; uvF[k * 2 + 1] = (n - n0) / FEIN_SEITE_M
              uvE[k * 2] = i / (P - 1); uvE[k * 2 + 1] = j / (P - 1)
            }
          }
          const idx: number[] = []
          for (let j = 0; j < P - 1; j++) {
            for (let i = 0; i < P - 1; i++) {
              const k = j * P + i
              if (!Number.isNaN(a[k]) && !Number.isNaN(a[k + 1]) && !Number.isNaN(a[k + P]) && !Number.isNaN(a[k + P + 1])) idx.push(k, k + P, k + 1, k + 1, k + P, k + P + 1)
            }
          }
          if (!idx.length) continue
          const g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.BufferAttribute(p3, 3))
          const uvFein = new THREE.BufferAttribute(uvF, 2), uvEigen = new THREE.BufferAttribute(uvE, 2)
          g.setAttribute('uv', uvFein)
          g.setIndex(idx)
          g.computeVertexNormals()
          const mat = new THREE.MeshLambertMaterial({ map: feinTextur })
          mat.color.setScalar(1.3)
          const netz = new THREE.Mesh(g, mat)
          scharfGruppe.add(netz)
          scharfNetze.push({ name, netz, mitte: [(qe + 0.5) * SCHARF_KACHEL_M, (qn + 0.5) * SCHARF_KACHEL_M], uvFein, uvEigen, bild: 'nein' })
        }
        const [pe, pn] = punktBei(Math.max(anfang, Math.min(ende, stelle + richtung * SCHARF_VORAUS_M)))
        scharfBilderPflegen(pe, pn)
      }
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
      // auch im Tunnel durchgezogen (Michael, 2026-10-13), die Röhre zeigt den Tunnel
      const strich = (punkte: THREE.Vector3[], farbe: string) => {
        if (punkte.length < 2) return
        // ein flaches Band, quer zur Fahrt immer waagrecht (Michael, 2026-10-10: «die Linien … immer schön plan»); eine
        // Linie in Metern dreht sich zur Kamera und wirkte an Hängen seitlich gekippt
        // statt eines Bandes zwei Schienen auf dem Luftbild (Michael, 2026-10-14: «Nur zwei Schienen»; vorher ein dunkelgraues
        // Band); Spurweite und Schienenbreite stehen in keiner Quelle: überall Normalspur gezeichnet
        void farbe
        for (const seite of [-1, 1]) {
          const versetzt = punkte.map((p, i) => {
            const a = punkte[Math.max(0, i - 1)], z = punkte[Math.min(punkte.length - 1, i + 1)]
            const nx = -(z.z - a.z), nz = z.x - a.x, l = Math.hypot(nx, nz) || 1
            const d = (seite * SPUR_M) / 2 / 1000
            return new THREE.Vector3(p.x + (nx / l) * d, p.y, p.z + (nz / l) * d)
          })
          const netz = new THREE.Mesh(band(versetzt, SCHIENE_M / 2000, 0), schienenMaterial)
          feinLinien.add(netz)
        }
      }
      const punkteVon = (a: number, z: number) => {
        const punkte: THREE.Vector3[] = []
        for (let meter = a; meter < z; meter += 10) punkte.push(feinPunkt3d(meter))
        punkte.push(feinPunkt3d(z))
        return punkte
      }
      // eine Brücke als schlichte Platte unter der Linie (Michael, 2026-10-11: «durch Aufbau von Brücken, damit die Strecke
      // … flach darüber führt»); Form und Pfeiler stehen in keiner Quelle, darum ohne Pfeiler; so breit wie die Gleise
      // darauf laut swissTLM3D (brueckeQuer, Michael, 2026-10-15)
      const platte = (x: object, a: number, z: number) => {
        const br = brueckenBreite.get(x)
        const quer = (mm: number): [number, number] => {
          if (!br) return [-BRUECKE_RAND_M, BRUECKE_RAND_M]
          const f = Math.max(0, Math.min(br.lo.length - 1, (mm - br.von) / 10)), i = Math.min(br.lo.length - 2, Math.floor(f)), t = f - Math.max(0, i)
          if (br.lo.length < 2) return [br.lo[0], br.hi[0]]
          return [br.lo[i] + t * (br.lo[i + 1] - br.lo[i]), br.hi[i] + t * (br.hi[i + 1] - br.hi[i])]
        }
        const meter: number[] = []
        for (let mm = a; mm < z; mm += 10) meter.push(mm)
        meter.push(z)
        const stellen = meter.map((mm) => {
          const [e, n] = glattBei(mm), [ve, vn] = glattBei(Math.max(anfang, mm - 5)), [he, hn] = glattBei(Math.min(ende, mm + 5))
          const l = Math.hypot(he - ve, hn - vn) || 1, [lo, hi] = quer(mm)
          // Schotter knapp unter den Schienen, die auf der Höhe der Linie liegen
          return { e, n, qe: -(hn - vn) / l, qn: (he - ve) / l, z: feinLinieHoehe(mm), s: mm, quer: bahnQuerschnitt(lo, hi, -0.15, BRUECKE_DICK_M) }
        })
        for (const netz of querschnittNetze(stellen)) feinLinien.add(netz)
        // die anderen Gleise auf der Brücke laut swissTLM3D, als Schienen wie das eigene
        for (const d of br?.gleise ?? []) {
          const punkte = meter.map((mm) => {
            const [e, n] = glattBei(mm), [ve, vn] = glattBei(Math.max(anfang, mm - 5)), [he, hn] = glattBei(Math.min(ende, mm + 5))
            const l = Math.hypot(he - ve, hn - vn) || 1
            return new THREE.Vector3(X(e - ((hn - vn) / l) * d), Y(feinLinieHoehe(mm)), Z(n + ((he - ve) / l) * d))
          })
          strich(punkte, wegFarbe)
        }
      }
      for (const [a0, z0] of weg.stuecke) {
        const anf = Math.max(a0, von), end = Math.min(z0, bis)
        if (end <= anf) continue
        const grenzen = weg.bauwerke.filter((x) => x.bis > anf && x.von < end).sort((x, y) => x.von - y.von)
        let bei = anf
        for (const x of grenzen) {
          if (x.von > bei) strich(punkteVon(bei, x.von), wegFarbe)
          const a = Math.max(x.von, anf, bei), z = Math.min(x.bis, end)
          if (z > a) strich(punkteVon(a, z), x.art === 'tunnel' ? tunnelFarbe : FARBEN.bruecke)
          if (z > a && x.art === 'bruecke') platte(x, a, z)
          if (z > a && x.art === 'tunnel') {
            // die Röhre nur, wo das Gelände sie ganz überdeckt; sonst stand sie in der Landschaft (Michael, 2026-10-13)
            const bedeckt = (mm: number) => {
              const [e, n] = punktBei(mm), h = feinHoehe(fein, e, n)
              return h !== null && h >= feinLinieHoehe(mm) + ROEHRE_KAEMPFER_M + ROEHRE_HALB_M + 0.5
            }
            let a2 = a, z2 = z
            while (a2 < z2 && !bedeckt(a2)) a2 += 5
            while (z2 > a2 && !bedeckt(z2)) z2 -= 5
            if (z2 - a2 >= 10) tunnelRoehre(punkteVon(a2, z2), feinLinien)
          }
          bei = Math.max(bei, x.bis)
        }
        if (bei < end) strich(punkteVon(bei, end), wegFarbe)
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
    /** Mast und Fahne der Bahnhöfe: im Führerstand aus, dort stehen die Schilder am Gleis */
    const mastTeile: THREE.Object3D[] = []
    const bahnhofSprites = new Set<THREE.Sprite>()
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
      mastTeile.push(mast)
      zeichen.push(mast)
      if (brille) {
        const stab = new THREE.Mesh(new THREE.CylinderGeometry(BRILLE_LINIE_M * 0.25 / brilleMass, BRILLE_LINIE_M * 0.25 / brilleMass, mastKm, 6),
          new THREE.MeshBasicMaterial({ color: mastFarbe }))
        stab.position.set(X(b.lage[0]), y + mastKm / 2, Z(b.lage[1]))
        nurBrille.add(stab)
        mastTeile.push(stab)
      }
      // Anfang und Ende der Strecke zuerst, dann die übrigen Bahnhöfe, dann die Gipfel
      const ende = i === 0 || i === r.bahnhoefe.length - 1
      const sp = schild(b.name, dunkel ? '#9db4ff' : FARBEN.bahnhof, X(b.lage[0]), y + mastKm, Z(b.lage[1]), ende ? 0 : 1, folge.get(i) ?? 0,
                        szene, [[0.5, 0], [0, 0], [1, 0]], true)
      masten.push({ sp, y })
      bahnhofSprites.add(sp)
    })
    // Bahnhofsschilder am Gleis, nur im Führerstand: zwei Pfosten, eine dunkelgraue Tafel mit dem Namen in Weiss auf beiden
    // Seiten; der Name gross genug für die Fahrt vorbei
    const tafelGruppe = new THREE.Group()
    tafelGruppe.visible = false
    szene.add(tafelGruppe)
    const pfostenForm = new THREE.BoxGeometry(1, 1, 1)
    const pfostenMaterial = new THREE.MeshLambertMaterial({ color: '#3a3a3a' })
    const tafelBild = (name: string) => {
      const lw = document.createElement('canvas')
      lw.width = 1024; lw.height = Math.round(1024 * TAFEL_HOEHE_M / TAFEL_BREITE_M)
      const g = lw.getContext('2d')!
      g.fillStyle = BAHNHOF_GRAU; g.fillRect(0, 0, lw.width, lw.height)
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(10, 10, lw.width - 20, lw.height - 20)
      let px = 120
      g.font = `bold ${px}px Helvetica, Arial, sans-serif`
      while (px > 40 && g.measureText(name).width > lw.width - 80) { px -= 4; g.font = `bold ${px}px Helvetica, Arial, sans-serif` }
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(name, lw.width / 2, lw.height / 2 + px * 0.04)
      const t = new THREE.CanvasTexture(lw)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      return t
    }
    const tafeln: Array<{ s: number; teile: THREE.Group[] }> = []
    for (const b of r.bahnhoefe) {
      const s0 = b.km * 1000
      if (s0 < pk[0].m || s0 > pk[pk.length - 1].m) continue
      const material = new THREE.MeshBasicMaterial({ map: tafelBild(b.name), toneMapped: false })
      const teile: THREE.Group[] = []
      // nur eine Tafel je Bahnhof, rechts der Linie (Michael, 2026-10-14: «braucht es bei den Bahnhöfen immer nur eine Ortstafel»)
      {
        const tafel = new THREE.Group()
        const flaeche = new THREE.PlaneGeometry(1, 1)
        // vorne und hinten je eine Fläche, beide von vorn lesbar
        for (const dreh of [0, Math.PI]) {
          const f = new THREE.Mesh(flaeche, material)
          f.rotation.y = dreh
          f.position.z = dreh ? -0.002 : 0.002
          tafel.add(f)
        }
        const brett = new THREE.Mesh(pfostenForm, pfostenMaterial)
        brett.scale.set(1.04, 1.08, 0.003)
        tafel.add(brett)
        for (const x of [-0.38, 0.38]) {
          const pfosten = new THREE.Mesh(pfostenForm, pfostenMaterial)
          pfosten.name = 'pfosten'
          pfosten.position.x = x
          tafel.add(pfosten)
        }
        tafelGruppe.add(tafel)
        teile.push(tafel)
      }
      tafeln.push({ s: s0, teile })
    }
    /** die Schilder auf die Höhe der Linie setzen, im feinen Gelände auf deren feine Höhe */
    const tafelnSetzen = () => {
      const breite = X(TAFEL_BREITE_M) - X(0), hoch = Y(TAFEL_HOEHE_M) - Y(0)
      for (const { s: s0, teile } of tafeln) {
        const [e1, n1] = punktBei(s0 - 20), [e2, n2] = punktBei(s0 + 20)
        const l = Math.hypot(e2 - e1, n2 - n1) || 1
        const de = (e2 - e1) / l, dn = (n2 - n1) / l
        const [e, n] = punktBei(s0)
        const linie = feinLinieHoehe(s0)
        teile.forEach((tafel, i) => {
          const seite = i === 0 ? 1 : -1
          // quer zur Linie: rechts von der Fahrtrichtung (de, dn) liegt (dn, -de)
          const te = e + seite * dn * TAFEL_SEITE_M, tn = n + seite * -de * TAFEL_SEITE_M
          const boden = Math.min(linie, (scharfStand && scharfHoehe(scharfStand, te, tn)) ?? (feinStand && feinHoehe(feinStand.fein, te, tn)) ?? linie)
          const unten = linie + TAFEL_UEBER_M
          tafel.position.set(X(te), Y(unten + TAFEL_HOEHE_M / 2), Z(tn))
          // die Vorderseite schaut gegen die Fahrtrichtung und zum Gleis hin, um TAFEL_DREHUNG aus der Linie gedreht
          const gegen = Math.atan2(-de, dn) // Winkel der Richtung (−de, −dn) in der Ebene x, −z
          tafel.rotation.set(0, gegen + seite * TAFEL_DREHUNG, 0)
          tafel.scale.set(breite, hoch, breite)
          // die Pfosten von der Unterkante bis unter den Boden, in Einheiten der Tafel
          const pfostenHoch = (Y(unten) - Y(boden - 1)) / hoch
          for (const o of tafel.children) {
            if (o.name !== 'pfosten') continue
            o.scale.set(0.012, pfostenHoch, 0.012)
            o.position.y = -0.5 - pfostenHoch / 2
          }
        })
      }
    }
    tafelnSetzen()
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
        // im Tunnel derselbe Wagen durchsichtig über dem Berg (Deckkraft 0,28, vorher 0,35; Michael, 2026-10-12); beide werden am Portal geschnitten, so
        // wechselt der Wagen nicht auf einmal, sondern fliessend (Michael, 2026-10-07: «wagen für wagen … verfeinern»)
        const ebeneAussen = new THREE.Plane(), ebeneDrin = new THREE.Plane()
        const durch = g.clone()
        const ersatz = new Map<THREE.Material, THREE.Material>()
        durch.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return
          const alt = o.material as THREE.Material
          if (!ersatz.has(alt)) {
            const m = alt.clone()
            m.transparent = true; m.opacity = 0.28; m.depthTest = false; m.clippingPlanes = [ebeneDrin]
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
    const seitenverhaeltnis = Math.max(0.5, el.clientWidth / Math.max(1, zugVonAussen || fuellenJetzt.current ? el.clientHeight : bildHoehe(el.clientWidth)))
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

    // was die Anzeige «Voraus» nennt: Bahnhöfe des Reliefs, Tunnel und Brücken des Wegs mit Namen, wo sie bekannt sind
    const ankuendigungen: Ankuendigung[] = [
      ...r.bahnhoefe.map((b) => ({ s: b.km * 1000, art: 'bahnhof' as const, name: b.name })),
      ...weg.bauwerke.map((x) => {
        const genannt = bauNamen?.find((b) => b.art === x.art && Math.abs(b.s - x.von) < 60)?.name
          ?? (x.art === 'tunnel' ? r.tunnel.find((t) => t.von_km !== undefined && Math.abs(t.von_km * 1000 - x.von) < 60)?.name
            : r.bruecken.find((b) => Math.abs(b.von_km * 1000 - x.von) < 60)?.name)
        return { s: x.von, art: x.art, name: genannt ?? (x.art === 'tunnel' ? 'Tunnel ohne Namen' : 'Brücke ohne Namen') }
      }),
    ]
    const bahnhofFolge = [...r.bahnhoefe].sort((a, b) => a.km - b.km)
    const pultVon = endNamen?.[0] ?? bahnhofFolge[0]?.name ?? r.titel
    const pultNach = endNamen?.[1] ?? bahnhofFolge[bahnhofFolge.length - 1]?.name ?? r.titel
    // Tempo für den Tacho, wenn es nicht hier simuliert wird: aus der Stelle des Zugs über die Zeit, geglättet
    let altS: number | null = null, gemessen = 0
    // Maus und Finger auf dem Pult: Hover (Hervorheben, Name als Tooltip) und Auslösen
    const pultStrahl = new THREE.Raycaster()
    const pultTreffer = (e: PointerEvent) => {
      if (!pult || !imStand || renderer.xr.isPresenting) return null
      const rahmen = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(((e.clientX - rahmen.left) / rahmen.width) * 2 - 1, -((e.clientY - rahmen.top) / rahmen.height) * 2 + 1)
      pultStrahl.setFromCamera(ndc, pult.kamera)
      return pultStrahl.intersectObjects(pult.bedienbar, false)[0]?.object ?? null
    }
    const pultBewegt = (e: PointerEvent) => {
      if (!pult) return
      const t = pultTreffer(e)
      const name = pult.hover(t)
      renderer.domElement.style.cursor = t ? 'pointer' : ''
      renderer.domElement.title = name ?? ''
    }
    const pultDruck = (e: PointerEvent) => {
      const t = pultTreffer(e)
      if (!t || !pult) return
      e.preventDefault(); e.stopPropagation()
      pultMelden(pult.ausloesen(t))
    }
    const pultTaste = (e: KeyboardEvent) => {
      if (!pult || !imStand || renderer.xr.isPresenting) return
      const ziel = e.target as HTMLElement | null
      if (ziel && /^(INPUT|TEXTAREA|SELECT)$/.test(ziel.tagName)) return
      const text = pult.taste_(e.code)
      if (text) { e.preventDefault(); pultMelden(text) }
    }
    renderer.domElement.addEventListener('pointermove', pultBewegt)
    renderer.domElement.addEventListener('pointerdown', pultDruck, { capture: true })
    window.addEventListener('keydown', pultTaste)
    const groesseSetzen = () => {
      const b = el.clientWidth
      // auf der eigenen Seite bestimmt die Breite die Höhe, beim Fahren und im Vollbild der Rahmen; nicht bei der Probefahrt
      // (zug), sonst behielt das Bild nach dem Vollbild dessen Höhe (Michael, 2026-10-12: «ein sehr hohes Bild»)
      const hh = zugVonAussen || fuellenJetzt.current ? el.clientHeight : bildHoehe(b)
      if (!b || !hh) return
      renderer.setSize(b, hh)
      // Schilder haben eine feste Grösse im Verhältnis zur Höhe des Bildes: im Vollbild der Modellbahn so gross wie
      // daneben, sonst wachsen sie mit der Höhe des Bildschirms
      if (fuellenJetzt.current && !zugVonAussen) {
        const f = Math.min(1, bildHoehe(b) / hh)
        for (const { sp, grundMass } of schilder) sp.scale.set(grundMass[0] * f, grundMass[1] * f, 1)
      } else if (!renderer.xr.isPresenting) for (const { sp, grundMass } of schilder) sp.scale.set(grundMass[0], grundMass[1], 1)
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
        // im Führerstand alle Namen erst kurz vor dem Ort (Michael, 2026-10-11: «Es reicht, wenn sie einen Kilometer vor
        // Erreichen des Standorts angezeigt werden»)
        if (imStand && abstand > SCHILD_FUEHRERSTAND_KM ** 2) { sp.visible = false; continue }
        // Bahnhöfe stehen im Führerstand als Schild am Gleis, ohne Fahne (Michael, 2026-10-14)
        if (imStand && bahnhofSprites.has(sp)) { sp.visible = false; continue }
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
                    anteil: 0,
                    /** Tempo auf dem Bildschirm (Fahrknopf.tempo): null über die ganze Strecke in PROBE_DAUER_S */
                    echt: null as number | null }
    if (fahrknopf) {
      fahrknopf.current = {
        los: () => {
          if (probe && probe.current === null) (probe as React.MutableRefObject<number | null>).current = performance.now()
          fahrt.losWunsch = true
          // im Führerstand löst «Zug fahren» auch die Bremse (Michael, 2026-10-13: «Man soll aber auch wieder fahren können»)
          pult?.losfahren()
        },
        halt: () => { fahrt.laeuft = false; if (imStand) pult?.anhalten() },
        tempo: (t) => { fahrt.echt = t },
      }
    }
    /** in der Brille: am Ziel die Knöpfe «Fahrt wiederholen», «Zurückfahren», «Fahrt beenden» zeigen */
    let menueZeigen: (() => void) | null = null
    /** in der Brille im Führerstand statt vor dem Modell auf dem Tisch; anker: wo der Kopf beim Einsteigen war und wohin er
     *  schaute, dorthin kommt das Auge im Zug; gier: die Drehung der Welt, geglättet */
    const kabine = { an: false, anker: null as THREE.Vector3 | null, kopfGier: 0, gier: null as number | null }
    /** in der Brille: zurück aufs Modell auf dem Tisch */
    let tischSetzen: (() => void) | null = null
    /** ob die Brille mit Passthrough läuft (dann ohne Himmel, ausser im Führerstand) */
    let mitDurchsicht = false
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
      tischSetzen = setzen

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
          if (kabine.an) {
            // im Führerstand: der Strahl bedient das Pult
            if (pult) {
              strahl.setFromXRController(c as THREE.XRTargetRaySpace)
              const t = strahl.intersectObjects(pult.bedienbar, false)[0]?.object
              if (t) hinweisZeigen(pult.ausloesen(t) ?? '')
            }
            return
          }
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
          if (kabine.an) return
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
          ['Greiftaste links', 'Zuggeräusch ein, aus'], ['Thumbstick drücken', 'Führerstand ein, aus'],
        ]
        zeilen.forEach(([taste, was], i) => {
          const y = 150 + i * 56
          g.font = 'bold 38px Helvetica, Arial, sans-serif'; g.fillStyle = '#a8102e'; g.fillText(taste, 48, y)
          g.font = '38px Helvetica, Arial, sans-serif'; g.fillStyle = '#212121'; g.fillText(was, 390, y)
        })
        g.font = '32px Helvetica, Arial, sans-serif'; g.fillStyle = '#767676'
        g.fillText('A, B rechts; X, Y links. Im Führerstand: A, B Tempo; X, Y Bremse;', 48, 650)
        g.fillText('der Strahl bedient das Pult.', 48, 688)
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
              } else if (an && !gedrueckt.has(schluessel) && kabine.an && pult) {
                // im Führerstand bedienen die Tasten das Pult: A schneller, B langsamer, X bremsen, Y Bremse lösen
                const rechts = quelle.handedness === 'right'
                fahrt.gestartet = true
                hinweisZeigen(pult.tun(rechts ? (nr === 4 ? 'sollPlus' : 'sollMinus') : nr === 4 ? 'bremsePlus' : 'bremseMinus'))
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
        // bei der Probefahrt aus «Fahren» (Michael, 2026-10-14: «die gleichen Funktionen»): im Führerstand bedienen die Tasten das
        // Pult wie oben, sonst A weiter, B anhalten, X langsamer, Y schneller, alles über die Probefahrt selbst
        const probefahrt = zugVonAussen && pult ? pult.aussen?.current?.probe : undefined
        if (probefahrt) {
          for (const quelle of renderer.xr.getSession()?.inputSources ?? []) {
            const knoepfe = quelle.gamepad?.buttons
            if (!knoepfe) continue
            for (const nr of [4, 5]) {
              const schluessel = `${quelle.handedness}${nr}`, an = !!knoepfe[nr]?.pressed
              if (an && !gedrueckt.has(schluessel)) {
                const rechts = quelle.handedness === 'right'
                if (kabine.an) hinweisZeigen(pult!.tun(rechts ? (nr === 4 ? 'sollPlus' : 'sollMinus') : nr === 4 ? 'bremsePlus' : 'bremseMinus'))
                else if (rechts) { probefahrt.anhalten(nr === 5); hinweisZeigen(nr === 5 ? 'Probefahrt angehalten' : 'Probefahrt') }
                else {
                  const i = Math.max(0, Math.min(probefahrt.stufen.length - 1, probefahrt.stufe() + (nr === 4 ? -1 : 1)))
                  probefahrt.waehlen(i)
                  hinweisZeigen(`Etwa ${probefahrt.stufen[i].toLocaleString('de-CH')} km/h`)
                }
              }
              if (an) gedrueckt.add(schluessel); else gedrueckt.delete(schluessel)
            }
          }
        }
        // die Knöpfe am Ziel: Strahlen zeigen, der getroffene Knopf wird etwas dunkler; im Führerstand zeigt der Strahl aufs Pult
        strahlen.forEach((l) => { l.visible = menue.visible || tafel.visible || kabine.an })
        if (kabine.an && pult) {
          let t: THREE.Object3D | null = null
          for (const c of steuer) {
            strahl.setFromXRController(c as THREE.XRTargetRaySpace)
            t ??= strahl.intersectObjects(pult.bedienbar, false)[0]?.object ?? null
          }
          pult.hover(t)
        }
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
        // Thumbstick drücken: in den Führerstand oder zurück zum Modell auf dem Tisch
        for (const quelle of renderer.xr.getSession()?.inputSources ?? []) {
          const schluessel = `${quelle.handedness}3`, an = !!quelle.gamepad?.buttons[3]?.pressed
          if (an && !gedrueckt.has(schluessel) && !tafel.visible) {
            kabine.an = !kabine.an
            hinweisZeigen(kabine.an ? 'Führerstand' : 'Modell auf dem Tisch')
          }
          if (an) gedrueckt.add(schluessel); else gedrueckt.delete(schluessel)
        }
        // Thumbstick: links und rechts dreht, vor und zurück hebt und senkt; im Führerstand nicht
        for (const quelle of kabine.an ? [] : renderer.xr.getSession()?.inputSources ?? []) {
          const ax = quelle.gamepad?.axes
          if (!ax || ax.length < 4) continue
          const [x, y] = [ax[2], ax[3]].map((v) => (Math.abs(v) < 0.2 ? 0 : v))
          modell.rotation.y -= x * 1.2 * dt
          modell.position.y -= y * 0.4 * dt
        }
      }
      renderer.xr.addEventListener('sessionend', () => {
        kabine.an = false; kabine.anker = null; kabine.gier = null
        kamera.far = 500
        imStand = false
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
        mitDurchsicht = ar
        szene.background = ar ? null : hintergrund
        // war auf dem Bildschirm der Führerstand gewählt, beginnt die Brille dort
        kabine.an = !!fuehrerstand?.current
        // der Wechsel in den Führerstand der Brille wird im nächsten Bild neu eingerichtet, auch wenn der Bildschirm schon dort war
        imStand = false
      }
    }

    // beim Fahren: die Kamera folgt dem Zug mit demselben Blickwinkel; am Anfang von schräg hinten
    let letzte: THREE.Vector3 | null = null
    let imStand = false
    /** Beim Fahren (Michael, 2026-10-11: «beim Start mein GPS-Standort der hinterste Punkt … bei allen Zwischenbahnhöfen
     *  und am Ziel der Mittelpunkt des Zuges»): am Anfang des Wegs steht der ganze Zug vor dem Standort, über die ersten
     *  ZUG_VORNE_BIS_M rückt der Standort sanft in die Mitte des Zugs und bleibt dort; die Spitze nie über das Ende des Wegs */
    const stelleDerSpitze = (standort: number | null) => {
      if (standort === null) return null
      const anfang = pk[0].m, ende = pk[pk.length - 1].m, laenge = zugLaengeS()
      const t = Math.max(0, Math.min(1, (standort - anfang) / ZUG_VORNE_BIS_M))
      const vor = laenge * (1 - 0.5 * t * t * (3 - 2 * t))
      return Math.min(ende, standort + vor)
    }
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
        if (imStand && pult && fahrt.s !== null && fahrt.gestartet) {
          // im Führerstand fährt der Zug nach dem Pult: gewählte Geschwindigkeit, Bremse, Schnellbremse (Fuehrerpult.schritt)
          const rest = fahrt.richtung > 0 ? ende - fahrt.s : fahrt.s - zugLaengeS() - anfang
          fahrt.s += fahrt.richtung * pult.schritt(dt, rest) * dt
          fahrt.s = Math.max(anfang + Math.min(zugLaengeS(), ende - anfang), Math.min(ende, fahrt.s))
          fahrt.laeuft = false
          fahrt.gestartet = true
        } else if (fahrt.laeuft && fahrt.s !== null) {
          // langsam anfahren und vor dem Ziel gleichmässig abbremsen, je in ANFAHREN_S (Michael, 2026-10-09: «in 2 sec
          // die normale Geschwindigkeit … am Schluss ebenso abbremsen»); der Bremsweg ist die halbe Strecke, die der
          // Zug in ANFAHREN_S mit voller Fahrt zurücklegt
          const voll = (fahrt.echt === null || renderer.xr.isPresenting ? (ende - anfang) / PROBE_DAUER_S : MODELL_TEMPO * fahrt.echt) * fahrt.tempo
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
        // im Führerstand so klein wie in der Brille: sonst schwebte ein Kulturgut als riesiger Klotz am Himmel
        const f = imStand ? KABINE_ZEICHEN : zeichenMass()
        for (const z of zeichen) z.scale.setScalar(f)
        const abstand = kamera.position.distanceTo(steuerung.target)
        for (const lm of strichMaterialien) { lm.dashSize = abstand * STRICH_JE_KM; lm.gapSize = abstand * LUECKE_JE_KM }
        for (const { sp, y } of masten) sp.position.y = y + mastKm * f
      }
      if (hinterZug?.current) { hinterZug.current = false; letzte = null; if (blick) blick.current = null }
      if (zug) {
        // beim Fahren ist zug.current der eigene Standort; gezeichnet wird der Zug ab seiner Spitze (stelleDerSpitze)
        const s = zugVonAussen ? stelleDerSpitze(zug.current) : zug.current
        const sichtbar = s !== null && imStueck(s)
        // auf dem Bildschirm wächst der Zug mit dem Abstand der Kamera: beim Hineinzoomen kleiner,
        // aus der Ferne noch zu finden (Michael, 2026-10-07)
        if (!renderer.xr.isPresenting) zugMass = zeichenMass() * (zugVonAussen ? ZUG_FAHRT_FAKTOR : 1)
        else if (kabine.an) zugMass = KABINE_ZUG
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
        const inBrille = renderer.xr.isPresenting
        const vorne = (inBrille ? kabine.an : !!fuehrerstand?.current) && sichtbar
        if (vorne !== imStand) {
          if (!vorne) tunnelDunkel(0)
          imStand = vorne
          for (const o of mastTeile) o.visible = !vorne
          tafelGruppe.visible = vorne
          steuerung.enabled = !vorne
          if (inBrille) {
            // die Welt in Originalgrösse um den Kopf; die Linien und Seile für den Tisch sind dann zu dick
            kamera.near = vorne ? KABINE_NAHE_M : BRILLE_NAHE_M
            kamera.far = vorne ? KABINE_WEIT_M : 500
            nurBrille.visible = !vorne; seilBrille.visible = !vorne; nurBild.visible = vorne; seilBild.visible = vorne
            szene.background = vorne || !mitDurchsicht ? hintergrund : null
            kabine.anker = null; kabine.gier = null
            // steht der Zug noch am Anfang, dort mit seiner neuen Länge: sonst stand er mit der Länge des Tischmodells
            // kilometerweit im Weg
            if (zug === eigenerZug && !fahrt.gestartet && fahrt.s !== null) {
              zugMass = vorne ? KABINE_ZUG : zugMassBrille
              fahrt.s = Math.min(pk[pk.length - 1].m, pk[0].m + zugLaengeS())
              eigenerZug.current = fahrt.s
            }
            // Zeichen (Gipfel, Kulturgüter) sind fürs Modell gross, in Originalgrösse wären sie Dutzende Meter
            for (const z of zeichen) z.scale.setScalar(vorne ? KABINE_ZEICHEN : 1)
            if (vorne) {
              for (const { sp, grundMass } of schilder) sp.scale.set(grundMass[0] / grundMass[1] * KABINE_SCHILD_KM, KABINE_SCHILD_KM, 1)
            } else tischSetzen?.()
          } else {
            kamera.near = vorne ? FUEHRERSTAND_NAHE_KM : 0.1
            // im Führerstand ein weiteres Sichtfeld wie aus einem Fenster, sonst das enge des Modells
            kamera.fov = vorne && pult ? fuehrerstandFov(kamera.aspect) : 40
          }
          kamera.updateProjectionMatrix()
          if (pult) {
            pult.v = 0
            pult.raum.visible = inBrille && vorne
            if (inBrille && vorne) { szene.add(pult.gruppe); pult.rahmenStrecken(1, 1, false); pult.haubeSetzen(0) }
            else {
              // auf dem Bildschirm etwas weiter weg und höher als in der Brille: das Sichtfeld ist kleiner als das der Augen,
              // so bleiben Anzeigen, Tasten und Hebel im Bild
              pult.szene.add(pult.gruppe)
              pult.gruppe.position.set(0, PULT_BILD_HOCH_M, -PULT_BILD_WEG_M)
              pult.gruppe.rotation.set(0, 0, 0)
            }
            pult.hover(null)
            renderer.domElement.style.cursor = ''
          }
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
          if (Math.abs(s - feinAb) > FEIN_NACH_M || scharfMitBild !== nahErlaubt) {
            feinAb = s
            void feinSetzen(s, r)
          }
          if (scharfNetze.length) {
            if (scharfAltS !== null && dt > 0) scharfV += (Math.min(2000, Math.abs(spitze - scharfAltS) / dt) - scharfV) * Math.min(1, dt)
            scharfAltS = spitze
            const [pe, pn] = punktBei(bis(spitze + r * (SCHARF_VORAUS_M + Math.min(SCHARF_VORAUS_MAX_M, scharfV * SCHARF_VORAUS_S))))
            scharfBilderPflegen(pe, pn)
          }
          const augeM = bis(spitze + r * 15)
          const tunnel = weg.bauwerke.find((x) => x.art === 'tunnel' && augeM > x.von && augeM < x.bis)
          const tief = tunnel ? Math.min(augeM - tunnel.von, tunnel.bis - augeM) - portalInnen(tunnel.bis - tunnel.von) : 0
          tunnelDunkel(Math.min(1, Math.max(0, tief) / TUNNEL_DUNKEL_M), pult?.daemmerung)
          const auge = feinPunkt3d(augeM)
          auge.y += FUEHRERSTAND_HOEHE_M * faktor / 1000
          // der Blick folgt der Richtung des Gleises unter dem Auge, nicht einem Punkt weit voraus: so schwenkte die Kamera
          // schon vor jeder Kurve zur Seite (Michael, 2026-10-11: «schwenkt immer schon vor der Kurve … bleibt nicht schön
          // auf der Strecke»); geneigt zur Linie 300 m voraus
          const vorn = feinPunkt3d(bis(augeM + r * 40)), hinten = feinPunkt3d(bis(augeM - r * 40))
          const rx = vorn.x - hinten.x, rz = vorn.z - hinten.z, l = Math.hypot(rx, rz) || 1
          const ziel = new THREE.Vector3(auge.x + (rx / l) * 0.3, feinPunkt3d(bis(spitze + r * 300)).y, auge.z + (rz / l) * 0.3)
          ziel.y = Math.max(ziel.y, auge.y - 0.02)
          if (pult) {
            const v = zug === eigenerZug && !zugVonAussen ? pult.v : (() => {
              const aussen = tempoAussen?.current
              if (aussen != null) return aussen
              if (altS !== null && dt > 0) gemessen += ((Math.abs(s - altS) / dt) - gemessen) * Math.min(1, dt * 2)
              altS = s
              return gemessen
            })()
            pult.aktualisieren(dt, { s: spitze, richtung: r, anfang: pk[0].m, ende: pk[pk.length - 1].m, v,
              quelle: zug === eigenerZug && !zugVonAussen ? 'simulation' : tempoQuelle ?? 'gps', ankuendigungen, von: pultVon, nach: pultNach })
          }
          if (inBrille) {
            // die Welt so legen, dass das Auge im Zug dort ist, wo der Kopf beim Einsteigen war, und die Strecke dorthin
            // läuft, wohin er schaute; die Welt dreht sich mit dem Gleis (wie ein Wagen in der Kurve), der Kopf bleibt frei
            if (!kabine.anker) {
              const kopf = renderer.xr.getCamera()
              kabine.anker = kopf.getWorldPosition(new THREE.Vector3())
              const v = new THREE.Vector3(0, 0, -1).applyQuaternion(kopf.getWorldQuaternion(new THREE.Quaternion()))
              kabine.kopfGier = Math.atan2(-v.x, -v.z)
            }
            const soll = kabine.kopfGier - Math.atan2(-rx, -rz)
            if (kabine.gier === null) kabine.gier = soll
            else {
              let d = soll - kabine.gier
              d = Math.atan2(Math.sin(d), Math.cos(d))
              kabine.gier += d * Math.min(1, dt * 4)
            }
            modell.scale.setScalar(1000)
            modell.rotation.set(0, kabine.gier, 0)
            modell.position.copy(kabine.anker).sub(auge.clone().multiplyScalar(1000).applyAxisAngle(new THREE.Vector3(0, 1, 0), kabine.gier))
          } else {
            // Blick zur Seite (Knöpfe «Sicht links», «Sicht rechts»), sanft gedreht um das Auge
            seitenJetzt += ((seitenblick?.current ?? 0) - seitenJetzt) * Math.min(1, dt * 5)
            if (Math.abs(seitenJetzt) > 1e-4) {
              const d = ziel.clone().sub(auge).applyAxisAngle(new THREE.Vector3(0, 1, 0), seitenJetzt)
              ziel.copy(auge).add(d)
            }
            kamera.position.copy(auge)
            steuerung.target.copy(ziel)
            kamera.lookAt(ziel)
          }
          if (pult) {
            // Stirnlicht: vom Auge aus die Strecke entlang, auf dem Bildschirm in Kilometern, in der Brille in Metern
            const quelle = inBrille ? renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()) : kamera.position.clone()
            const richtung = inBrille ? new THREE.Vector3(-Math.sin(kabine.kopfGier), -0.06, -Math.cos(kabine.kopfGier))
              : kamera.getWorldDirection(new THREE.Vector3())
            const weit = inBrille ? 400 : 0.4
            stirnlicht.position.copy(quelle).addScaledVector(new THREE.Vector3(0, -1, 0), inBrille ? 1.5 : 0.0015)
            stirnlicht.target.position.copy(quelle).addScaledVector(richtung, weit * 0.6)
            stirnlicht.distance = weit
            stirnlicht.intensity = pult.stirnlicht ? 6 : 0
            if (inBrille) {
              // das Pult steht dort, wo der Kopf beim Einsteigen war, in Fahrtrichtung
              pult.gruppe.position.copy(kabine.anker ?? quelle)
              // etwas höher sitzen als zuerst, so ist das Pult leichter zu bedienen (Michael, 2026-10-13)
              pult.gruppe.position.y -= KABINE_HOEHER_M
              pult.gruppe.rotation.set(0, kabine.kopfGier, 0)
            }
          }
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
      if (!imStand) stirnlicht.intensity = 0
      if (pultMeldungBis && performance.now() > pultMeldungBis) { pultMeldung.style.opacity = '0'; pultMeldungBis = 0 }
      // das Nahbild folgt dem Blickpunkt, sobald er mehr als NAH_NACH_M weitergewandert ist
      if (luftbild && !renderer.xr.isPresenting && kamera.position.distanceTo(steuerung.target) < NAH_BIS_KM) {
        const e = steuerung.target.x * 1000 + me, n = -steuerung.target.z * 1000 + mn
        if (!nahMitte || Math.hypot(e - nahMitte[0], n - nahMitte[1]) > NAH_NACH_M) void nahSetzen(e, n)
      }
      if (blick && letzte) blick.current = kamera.position.clone().sub(steuerung.target)
      schilderOrdnen()
      if (pult && imStand && !renderer.xr.isPresenting) {
        const bild = fuehrerstandBild(kamera.aspect)
        if (kamera.fov !== bild.fov) { kamera.fov = bild.fov; kamera.updateProjectionMatrix() }
        bildAusschnitt(kamera, bild.weltX, bild.weltOben, bild.weltUnten)
      }
      renderer.render(szene, kamera)
      if (pult && imStand && !renderer.xr.isPresenting) {
        const bild = fuehrerstandBild(kamera.aspect)
        // das Pult in seiner eigenen Szene darüber, unten am Bildrand; der Rahmen gerade und bis an den Rand gestreckt, das Pult
        // darüber (hoch von schräg oben)
        pult.gruppe.position.y = PULT_BILD_HOCH_M
        pult.haubeSetzen(HAUBE_M)
        // Dachkante 1,33 m über dem Fuss des Rahmens in 0,85 m Abstand knapp über den oberen Rand, Säulen 1,2 m aussen in 1,39 m
        pult.rahmenStrecken(Math.max(1, (bild.rahmenX * 1.39 * 0.9) / 1.2),
          Math.max(0.6, (bild.rahmenOben * 0.85 + 0.25 - PULT_BILD_HOCH_M) / 1.31))
        pult.rahmenKamera.aspect = kamera.aspect
        bildAusschnitt(pult.rahmenKamera, bild.rahmenX, bild.rahmenOben, bild.rahmenUnten)
        pult.kamera.position.copy(bild.lage)
        pult.kamera.rotation.set(-bild.kipp, 0, 0)
        pult.kamera.updateMatrixWorld()
        pult.kamera.aspect = kamera.aspect
        bildAusschnitt(pult.kamera, bild.pultX, bild.pultOben, bild.pultUnten)
        renderer.autoClear = false
        renderer.clearDepth()
        renderer.render(pult.szene, pult.rahmenKamera)
        renderer.clearDepth()
        renderer.render(pult.szene, pult.kamera)
        renderer.autoClear = true
      }
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
        for (const mat of ([] as Array<THREE.Material & { map?: THREE.Texture }>).concat(x.material ?? [])) { mat.map?.dispose(); mat.dispose() }
      })
      anwenden.current = null
      renderer.dispose()
      renderer.domElement.remove()
      pultMeldung.remove()
      renderer.domElement.removeEventListener('pointermove', pultBewegt)
      renderer.domElement.removeEventListener('pointerdown', pultDruck, { capture: true })
      window.removeEventListener('keydown', pultTaste)
      pult?.entsorgen()
    }
  }, [r, h, faktor, weg, wegFarbe, zug, blick, brille, probe, zusatz, luftbild, bauNamen, tempoQuelle, tempoAussen, endNamen?.join('→')])
  return <div ref={rahmen} className={className} aria-label={`3D-Relief ${r.titel}`} role="img" />
}
