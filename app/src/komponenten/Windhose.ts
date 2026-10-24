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

/** wie gross eine Windhose auf dem Bildschirm erscheint: der Mast so hoch wie dieser Teil des Abstands zur Kamera */
const BILD_HOEHE = 0.09
/** so lange nach der letzten Bewegung der Kamera verteilt sie die Windhosen neu (ms) */
const RUHE_MS = 500
/** wo die vier im Bild stehen (Bildkoordinaten −1 bis 1, unten −1): in der Mitte jedes Viertels des Bilds (Michael, 2026-10-24:
 *  «jeweils in die Mitte des Quadrates, wenn man den Ausschnitt in 4 Quadrate teilen würde») */
const BILDPLAETZE: Array<[number, number]> = [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]]

export interface VierWindhosen {
  /** je Bild: Grösse nach dem Abstand, Flattern, nach der Ruhe neu verteilen */
  schritt: () => void
  /** was jede zeigt (Wind und Name der Station), in der Reihenfolge der Plätze; null: grau */
  setzen: (werte: Array<{ wind: Wind | null; name: string | null } | null>) => void
  entsorgen: () => void
}

interface Wind { kmh: number | null; boe: number | null; richtung: number | null }

/**
 * Immer vier Windhosen im Bild (Michael, 2026-10-24: «Egal welche Zoomstufe und auch beim von Hand stufenlosen Zoomen: immer 4 Orte»;
 * «Zahl dazu»): nach jeder Bewegung der Kamera stehen sie wieder an vier Stellen des sichtbaren Geländes, gefunden mit dem Strahl
 * durch die Mitten der vier Viertel des Bilds; auf dem Bildschirm immer gleich gross, über dem Mast klein die Stärke in km/h (die
 * Station nennt die Tafel). In der Brille bleiben sie, wo sie sind (dort gibt es keinen Bildschirm), ohne Schild.
 * eltern: wohin sie gehören (ihr Raum ist der des Modells); hoehe: Gelände an x, z im Raum der Eltern, null ausserhalb;
 * neuePlaetze: die vier Stellen im Raum der Eltern, wenn sie neu verteilt sind.
 */
export function vierWindhosenBauen(eltern: THREE.Object3D, kamera: THREE.PerspectiveCamera, hoehe: (x: number, z: number) => number | null,
  inBrille: () => boolean, neuePlaetze: (stellen: THREE.Vector3[]) => void, groesseBrille: number): VierWindhosen {
  const hosen = BILDPLAETZE.map(() => windhoseBauen())
  const schilder = hosen.map(() => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, sizeAttenuation: false, transparent: true }))
    sp.center.set(0.5, 0); sp.renderOrder = 7; sp.visible = false
    return sp
  })
  hosen.forEach((h, i) => { h.gruppe.visible = false; eltern.add(h.gruppe); eltern.add(schilder[i]) })
  const strahl = new THREE.Raycaster(), a = new THREE.Vector3(), b = new THREE.Vector3(), auge = new THREE.Vector3()
  /** wo der Strahl durch den Bildpunkt das Gelände trifft, im Raum der Eltern */
  const treffen = (bx: number, by: number): THREE.Vector3 | null => {
    strahl.setFromCamera(new THREE.Vector2(bx, by), kamera)
    a.copy(strahl.ray.origin); b.copy(strahl.ray.origin).addScaledVector(strahl.ray.direction, kamera.far)
    eltern.worldToLocal(a); eltern.worldToLocal(b)
    const schritte = 600
    let vorher = a.clone()
    for (let i = 1; i <= schritte; i++) {
      const p = a.clone().lerp(b, i / schritte)
      const g = hoehe(p.x, p.z)
      if (g !== null && p.y <= g) {
        // zwischen vorher und p halbieren
        let lo = vorher, hi = p
        for (let k = 0; k < 12; k++) { const m = lo.clone().lerp(hi, 0.5); const gm = hoehe(m.x, m.z); if (gm !== null && m.y <= gm) hi = m; else lo = m }
        const y = hoehe(hi.x, hi.z)
        return y === null ? null : new THREE.Vector3(hi.x, y, hi.z)
      }
      vorher = p
    }
    return null
  }
  let altPos = new THREE.Vector3(Infinity, 0, 0), altQuat = new THREE.Quaternion(), bewegt = 0, verteilt = false
  const verteilen = () => {
    const stellen = BILDPLAETZE.map(([x, y]) => {
      // trifft der Strahl kein Gelände (Himmel, neben dem Modell), im selben Viertel weiter unten und zur Mitte hin versuchen
      for (const [dx, dy] of [[0, 0], [0, -0.2], [0, -0.4], [-0.2, -0.2], [-0.2, -0.4]]) {
        const t = treffen(x + Math.sign(x) * dx, y + dy)
        if (t) return t
      }
      return null
    })
    const da = stellen.filter((s): s is THREE.Vector3 => !!s)
    if (!da.length) return
    stellen.forEach((s, i) => { if (s) hosen[i].gruppe.position.copy(s) })
    neuePlaetze(stellen.map((s, i) => s ?? hosen[i].gruppe.position.clone()))
    verteilt = true
  }
  const start = performance.now()
  return {
    schritt: () => {
      const t = (performance.now() - start) / 1000
      const brille = inBrille()
      if (!brille) {
        // bewegt sich die Kamera, wartet sie die Ruhe ab und verteilt dann neu
        if (!kamera.position.equals(altPos) || !kamera.quaternion.equals(altQuat)) { altPos = kamera.position.clone(); altQuat = kamera.quaternion.clone(); bewegt = performance.now() }
        else if (bewegt && performance.now() - bewegt > RUHE_MS) { bewegt = 0; verteilen() }
        if (!verteilt && !bewegt) verteilen()
      }
      kamera.getWorldPosition(auge)
      hosen.forEach((h, i) => {
        h.gruppe.visible = verteilt
        if (brille) h.gruppe.scale.setScalar(groesseBrille)
        else {
          // gleich gross auf dem Bildschirm: nach dem Abstand im Raum der Eltern
          const w = h.gruppe.getWorldPosition(a), d = w.distanceTo(auge)
          const massstab = eltern.getWorldScale(b).x || 1
          h.gruppe.scale.setScalar((d * BILD_HOEHE) / massstab)
        }
        h.schritt(t)
        const sp = schilder[i]
        sp.visible = verteilt && !brille && !!sp.material.map
        sp.position.copy(h.gruppe.position).y += h.gruppe.scale.y * 1.15
      })
    },
    setzen: (werte) => {
      hosen.forEach((h, i) => {
        const w = werte[i]
        h.setzen(w?.wind?.kmh ?? null, w?.wind?.richtung ?? null)
        const sp = schilder[i]
        sp.material.map?.dispose(); sp.material.map = null
        if (!w) { sp.material.needsUpdate = true; return }
        // nur die Zahl in km/h, klein über dem Mast (Michael, 2026-10-24: «Viel zu präsente Infos. Nur Zahl (zB 22)»)
        const kmh = w.wind?.kmh
        const text = kmh === null || kmh === undefined ? '–' : String(Math.round(kmh))
        const c = document.createElement('canvas'), x = c.getContext('2d')!
        const px = 22, schrift = `bold ${px}px Helvetica, Arial, sans-serif`
        x.font = schrift; c.width = Math.ceil(x.measureText(text).width) + 12; c.height = px + 8
        x.font = schrift; x.fillStyle = '#2a2a2a'; x.fillRect(0, 0, c.width, c.height)
        x.fillStyle = '#ffffff'; x.fillText(text, 6, px - 1)
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
        sp.material.map = tex; sp.material.needsUpdate = true
        sp.scale.set(c.width * 0.0007, c.height * 0.0007, 1)
      })
    },
    entsorgen: () => {
      hosen.forEach((h, i) => { eltern.remove(h.gruppe); h.entsorgen(); eltern.remove(schilder[i]); schilder[i].material.map?.dispose(); schilder[i].material.dispose() })
    },
  }
}
