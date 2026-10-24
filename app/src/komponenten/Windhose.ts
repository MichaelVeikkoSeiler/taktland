/**
 * Eine Windhose (Windsack) als Zeichen für den Wind in der Modellbahn und in «3D Schweiz» (Michael, 2026-10-24: «eine Windhose
 * hinzufügen, wo man sehen kann, wie die Windverhältnisse sind»): ein Mast, oben drehbar ein Sack aus fünf Ringen, abwechselnd
 * rot und weiss. Der Sack zeigt dorthin, wohin der Wind weht, und hebt sich mit der Stärke: wie bei Windsäcken an Flugplätzen
 * ganz gestreckt ab VOLL_KMH (15 Knoten, etwa 28 km/h), ohne Wind hängt er am Mast. Nicht massstäblich; Gestalt und Farben
 * gewählt, nicht aus einer Quelle.
 *
 * Masse in Einheiten der Höhe des Masts (1): die Gruppe wird dort, wo sie steht, auf die gewünschte Höhe skaliert.
 */
import * as THREE from 'three'

/** ab dieser Stärke ist der Sack ganz gestreckt */
export const VOLL_KMH = 28
const RINGE = 5, SACK_LANG = 0.6, SACK_VORNE = 0.11, SACK_HINTEN = 0.06

export interface Windhose {
  gruppe: THREE.Group
  /** Wind setzen: Stärke in km/h, woher er weht in Grad (0 Nord, 90 Ost); ohne Angabe hängt der Sack und ist grau */
  setzen: (kmh: number | null, richtung: number | null) => void
  /** je Bild: der Sack flattert ein wenig, stärker bei mehr Wind */
  schritt: (zeitS: number) => void
  entsorgen: () => void
}

export function windhoseBauen(): Windhose {
  const gruppe = new THREE.Group()
  gruppe.name = 'windhose'
  const teile: Array<THREE.BufferGeometry | THREE.Material> = []
  const mastForm = new THREE.CylinderGeometry(0.022, 0.03, 1, 8)
  mastForm.translate(0, 0.5, 0)
  const mastStoff = new THREE.MeshLambertMaterial({ color: '#8a8f94' })
  teile.push(mastForm, mastStoff)
  gruppe.add(new THREE.Mesh(mastForm, mastStoff))
  // oben dreht der Sack um den Mast (gieren), darin hebt er sich (neigen); x zeigt entlang des Sacks
  const gieren = new THREE.Group(), neigen = new THREE.Group()
  gieren.position.y = 0.97
  gruppe.add(gieren); gieren.add(neigen)
  const rot = new THREE.MeshLambertMaterial({ color: '#d2232a', side: THREE.DoubleSide })
  const weiss = new THREE.MeshLambertMaterial({ color: '#f4f4f4', side: THREE.DoubleSide })
  const grau = new THREE.MeshLambertMaterial({ color: '#9a9a9a', side: THREE.DoubleSide })
  teile.push(rot, weiss, grau)
  const ringe: THREE.Mesh[] = []
  for (let i = 0; i < RINGE; i++) {
    const r0 = SACK_VORNE + (SACK_HINTEN - SACK_VORNE) * (i / RINGE), r1 = SACK_VORNE + (SACK_HINTEN - SACK_VORNE) * ((i + 1) / RINGE)
    const l = SACK_LANG / RINGE
    const f = new THREE.CylinderGeometry(r1, r0, l, 14, 1, true)
    // entlang x statt y, vom Mast weg
    f.rotateZ(-Math.PI / 2); f.translate(l * (i + 0.5), 0, 0)
    teile.push(f)
    const m = new THREE.Mesh(f, i % 2 === 0 ? rot : weiss)
    ringe.push(m)
    neigen.add(m)
  }
  // der Ring am Mast, an dem der Sack hängt
  const halter = new THREE.TorusGeometry(SACK_VORNE, 0.01, 6, 16)
  halter.rotateY(Math.PI / 2)
  teile.push(halter)
  neigen.add(new THREE.Mesh(halter, mastStoff))

  let staerke = 0, ziel = 0, gierZiel = 0, gier = 0, bekannt = false
  const setzen = (kmh: number | null, richtung: number | null) => {
    bekannt = kmh !== null && richtung !== null
    ringe.forEach((m, i) => { m.material = !bekannt ? grau : i % 2 === 0 ? rot : weiss })
    ziel = bekannt ? Math.min(1, Math.max(0, kmh!) / VOLL_KMH) : 0
    // der Sack zeigt dorthin, wohin der Wind weht: Richtung + 180°; x nach Osten, z nach Süden, gieren um y
    if (bekannt) gierZiel = Math.PI / 2 - ((richtung! + 180) * Math.PI) / 180
  }
  const schritt = (zeitS: number) => {
    staerke += (ziel - staerke) * 0.08
    // auf dem kürzeren Weg drehen
    const d = Math.atan2(Math.sin(gierZiel - gier), Math.cos(gierZiel - gier))
    gier += d * 0.08
    const flattern = bekannt ? (0.02 + 0.05 * staerke) * Math.sin(zeitS * (3 + 6 * staerke)) : 0
    gieren.rotation.y = gier + flattern
    // hängend fast senkrecht am Mast (85° nach unten), gestreckt waagrecht, bei starkem Wind leicht zitternd
    neigen.rotation.z = -(1 - staerke) * (Math.PI * 85 / 180) + (bekannt ? 0.03 * staerke * Math.sin(zeitS * 11) : 0)
  }
  setzen(null, null)
  return { gruppe, setzen, schritt, entsorgen: () => { for (const t of teile) t.dispose() } }
}
