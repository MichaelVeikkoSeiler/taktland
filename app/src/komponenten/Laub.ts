import * as THREE from 'three'
import { szenenZeit } from '../zuege3d'

/**
 * Laubbäume durchs Jahr (Michael, 2026-11-16: «Ist es möglich, die Laubbäume saisonal einzufärben? Im Winter sollten sie nur noch Äste haben.
 * Es bräuchte allerdings eine Übergangszeit, dass sie nicht vom einen zum anderen Tag alle Blätter verlieren»): nach dem Tag im Jahr der Szene
 * treibt im Frühling das Laub aus (zuerst heller), färbt sich im Herbst gelb bis rotbraun und fällt, im Winter bleiben nur Äste. Jeder Baum hat
 * seine eigenen Tage (gestreut um STREU_TAGE), höher gelegene treiben später aus und färben früher. Alles gewählt, nach dem Bild im Mittelland,
 * in keiner unserer Quellen: welcher Baum Laub trägt, wann und welche Farbe, steht nirgends (die Farbe im Sommer ist die des Luftbilds).
 * Nur die Laubbäume (istNadel in src/baumart.ts); Nadelbäume bleiben grün.
 */
/** Tage im Jahr: Austrieb, Färben, Laubfall, je von bis (gewählt) */
const AUSTRIEB = [100, 128], FAERBEN = [278, 300], FALL = [292, 322]
/** je Baum so viele Tage früher oder später, und je 100 m über HOEHE_AB_M so viel später im Frühling und früher im Herbst (gewählt) */
const STREU_TAGE = 8, HOEHE_AB_M = 450, FRUEH_JE_100M = 3, HERBST_JE_100M = 2

/** der Tag im Jahr der Szene (mit Bruchteil), für alle Laubbäume */
export const LAUB = { uTag: { value: 180 } }
export function laubTagSetzen() {
  const t = new Date(Date.now() + szenenZeit.versatzMs)
  LAUB.uTag.value = (t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000
}

const VERTEX_KOPF = `
uniform float uTag; uniform float uHoeheMass; uniform float uHoeheNull;
attribute float aKrone;
varying float vLaub; varying float vHerbst; varying float vJung; varying float vKrone; varying float vTon; varying vec3 vObj;`
const VERTEX_RUMPF = `
{
  vKrone = aKrone; vObj = position * uLaubMass;
  float zufall = 0.0, ton = 0.0, hoeheM = 0.0;
  #ifdef USE_INSTANCING
    vec3 ort = instanceMatrix[3].xyz;
    zufall = fract(sin(dot(ort.xz, vec2(1271.7, 3117.3))) * 43758.5453) * 2.0 - 1.0;
    ton = fract(sin(dot(ort.xz, vec2(2693.1, 1499.7))) * 24634.6345);
    hoeheM = ort.y * uHoeheMass + uHoeheNull;
  #endif
  float ueber = max(0.0, hoeheM - ${HOEHE_AB_M}.0) / 100.0;
  float frueh = zufall * ${STREU_TAGE}.0 + ueber * ${FRUEH_JE_100M}.0;
  float herbst = zufall * ${STREU_TAGE}.0 - ueber * ${HERBST_JE_100M}.0;
  float austrieb = smoothstep(${AUSTRIEB[0]}.0 + frueh, ${AUSTRIEB[1]}.0 + frueh, uTag);
  float fall = smoothstep(${FALL[0]}.0 + herbst, ${FALL[1]}.0 + herbst, uTag);
  vLaub = austrieb * (1.0 - fall);
  vHerbst = step(200.0, uTag) * smoothstep(${FAERBEN[0]}.0 + herbst, ${FAERBEN[1]}.0 + herbst, uTag);
  vJung = step(uTag, 200.0) * (1.0 - smoothstep(${AUSTRIEB[1]}.0 + frueh, ${AUSTRIEB[1]}.0 + frueh + 25.0, uTag));
  vTon = ton;
}`
const FRAGMENT_KOPF = `
varying float vLaub; varying float vHerbst; varying float vJung; varying float vKrone; varying float vTon; varying vec3 vObj;
float laubHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float laubRauschen(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(laubHash(i), laubHash(i + vec3(1,0,0)), f.x), mix(laubHash(i + vec3(0,1,0)), laubHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(laubHash(i + vec3(0,0,1)), laubHash(i + vec3(1,0,1)), f.x), mix(laubHash(i + vec3(0,1,1)), laubHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// 1: Blatt, 0: Ast, -1: nichts (Luft zwischen den Ästen)
float laubStelle() {
  if (vKrone < 0.5) return 1.0;
  if (laubHash(floor(vObj * 14.0)) < vLaub) return 1.0;
  float ast = abs(laubRauschen(vObj * 6.0) - 0.5);
  return ast < 0.07 ? 0.0 : -1.0;
}`
/** Äste grau-braun, Herbstfarben von Gelb über Orange bis Rotbraun (linear, gewählt) */
const FRAGMENT_FARBE = `
{
  float stelle = laubStelle();
  if (stelle < -0.5) discard;
  if (vKrone > 0.5) {
    vec3 herbst = vTon < 0.5 ? mix(vec3(0.62, 0.42, 0.05), vec3(0.6, 0.22, 0.03), vTon * 2.0) : mix(vec3(0.6, 0.22, 0.03), vec3(0.32, 0.1, 0.04), vTon * 2.0 - 1.0);
    // so hell wie das Laub im Luftbild, etwas heller (sonst leuchtete der ganze Wald orange)
    float hell = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), hellHerbst = dot(herbst, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, herbst * (1.25 * hell / max(hellHerbst, 1e-4)), vHerbst * 0.75);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 1.3, 0.75), vJung * 0.6);
    if (stelle < 0.5) diffuseColor.rgb = vec3(0.075, 0.065, 0.058);
  }
}`

/**
 * hängt die Jahreszeiten an das Material der Laubbäume (vorhandenes onBeforeCompile, etwa der Wind, bleibt). Die Geometrie braucht das Attribut
 * aKrone (1 Krone, 0 Stamm); mass: so viel der Lage in der Geometrie gilt fürs Muster der Blätter; die Höhe über Meer ist
 * instanceMatrix[3].y · hoeheMass + hoeheNull.
 */
export function laubSaison<T extends THREE.Material>(stoff: T, mass: number, hoeheMass: number, hoeheNull: number): T {
  const vorher = stoff.onBeforeCompile.bind(stoff), schluessel = stoff.customProgramCacheKey.bind(stoff)
  const eigene = { uHoeheMass: { value: hoeheMass }, uHoeheNull: { value: hoeheNull } }
  const tiefe = stoff instanceof THREE.MeshDepthMaterial
  stoff.onBeforeCompile = (sh, r) => {
    vorher(sh, r)
    Object.assign(sh.uniforms, LAUB, eigene)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_KOPF}\nconst float uLaubMass = ${mass.toFixed(3)};`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_RUMPF}`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT_KOPF}`)
    sh.fragmentShader = tiefe
      ? sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (laubStelle() < -0.5) discard;')
      : sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_FARBE}`)
  }
  stoff.customProgramCacheKey = () => `${schluessel()}|laub${mass}`
  return stoff
}

/** der Schatten eines Laubbaums mit denselben Lücken */
export function laubSchatten(mass: number, hoeheMass: number, hoeheNull: number) {
  return laubSaison(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), mass, hoeheMass, hoeheNull)
}

/** aKrone für eine Geometrie, die nur Krone ist */
export function nurKrone(g: THREE.BufferGeometry) {
  g.setAttribute('aKrone', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(1), 1))
  return g
}
