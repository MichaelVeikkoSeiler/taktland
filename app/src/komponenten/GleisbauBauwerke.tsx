/**
 * Die Bauwerke, die es seit 2026-11-27 im Gleisbau gibt (Michael: «Tönt ja alles super - bitte alles bauen»): von Hand gezeichnet im Stil der Bilder, bis
 * Michael eigene Bilder schickt; Gestalt, Masse und Farben gewählt, nicht aus einer Vorlage. Je Feld eine Einheit gross, Mitte bei (i + 0,5, j + 0,5)
 */
import type { Feld, Objektart } from '../gleisbau'

const DUNKEL = '#3a3a3c', SCHATTEN = 'rgba(0,0,0,.18)'

/** Wasserturm, Tankstelle, Stellwerk, Unterwerk, Hafenkran: ein Objekt allein im Feld, unten in der Mitte auf dem Boden */
export function NeuesObjektBild({ art, i, j }: { art: Objektart; i: number; j: number }) {
  const x = i + 0.5, y = j + 0.5
  if (art === 'wasserturm') {
    return (
      <g pointerEvents="none">
        <ellipse cx={x + 0.04} cy={y + 0.36} rx={0.2} ry={0.06} fill={SCHATTEN} />
        {/* Turm aus Backstein, oben der Behälter mit Kegeldach */}
        <rect x={x - 0.08} y={y - 0.12} width={0.16} height={0.48} rx={0.02} fill="#b5543a" stroke={DUNKEL} strokeWidth={0.012} />
        {[0, 1, 2].map((k) => <line key={k} x1={x - 0.08} x2={x + 0.08} y1={y + 0.02 + k * 0.1} y2={y + 0.02 + k * 0.1} stroke="#8f3f2a" strokeWidth={0.008} />)}
        <rect x={x - 0.02} y={y + 0.22} width={0.04} height={0.14} rx={0.01} fill="#5a3a2a" />
        <rect x={x - 0.17} y={y - 0.3} width={0.34} height={0.2} rx={0.03} fill="#d9d4c7" stroke={DUNKEL} strokeWidth={0.012} />
        <path d={`M${x - 0.19},${y - 0.3} L${x},${y - 0.44} L${x + 0.19},${y - 0.3} Z`} fill="#6a6a6a" stroke={DUNKEL} strokeWidth={0.012} />
        <line x1={x + 0.12} y1={y - 0.1} x2={x + 0.12} y2={y + 0.1} stroke={DUNKEL} strokeWidth={0.02} strokeLinecap="round" />
      </g>
    )
  }
  if (art === 'tankstelle') {
    return (
      <g pointerEvents="none">
        <ellipse cx={x + 0.03} cy={y + 0.34} rx={0.34} ry={0.07} fill={SCHATTEN} />
        {/* liegender Tank auf zwei Sockeln, daneben eine Zapfsäule für Dieselloks */}
        <rect x={x - 0.3} y={y + 0.12} width={0.06} height={0.2} fill="#7a7a7a" />
        <rect x={x - 0.02} y={y + 0.12} width={0.06} height={0.2} fill="#7a7a7a" />
        <rect x={x - 0.38} y={y - 0.08} width={0.5} height={0.22} rx={0.11} fill="#e9e6dc" stroke={DUNKEL} strokeWidth={0.012} />
        <rect x={x - 0.38} y={y + 0.01} width={0.5} height={0.04} fill="#a8102e" />
        <rect x={x + 0.2} y={y - 0.02} width={0.12} height={0.34} rx={0.02} fill="#f2c230" stroke={DUNKEL} strokeWidth={0.012} />
        <rect x={x + 0.225} y={y + 0.03} width={0.07} height={0.06} rx={0.01} fill="#2b2b2e" />
        <path d={`M${x + 0.32},${y + 0.08} q0.06,0.02 0.04,0.14`} fill="none" stroke={DUNKEL} strokeWidth={0.014} />
      </g>
    )
  }
  if (art === 'stellwerk') {
    return (
      <g pointerEvents="none">
        <ellipse cx={x + 0.04} cy={y + 0.36} rx={0.24} ry={0.06} fill={SCHATTEN} />
        {/* zweistöckig, oben rundum Fenster, Walmdach */}
        <rect x={x - 0.18} y={y - 0.04} width={0.36} height={0.4} fill="#e2d8c3" stroke={DUNKEL} strokeWidth={0.012} />
        <rect x={x - 0.2} y={y - 0.2} width={0.4} height={0.17} fill="#f4f1ea" stroke={DUNKEL} strokeWidth={0.012} />
        {[0, 1, 2, 3].map((k) => <rect key={k} x={x - 0.18 + k * 0.095} y={y - 0.18} width={0.08} height={0.12} fill="#7fa3c2" />)}
        <path d={`M${x - 0.25},${y - 0.2} L${x - 0.12},${y - 0.33} L${x + 0.12},${y - 0.33} L${x + 0.25},${y - 0.2} Z`} fill="#c4452f" stroke={DUNKEL} strokeWidth={0.012} />
        <rect x={x - 0.04} y={y + 0.2} width={0.08} height={0.16} fill="#7a4a2a" />
        <rect x={x - 0.15} y={y + 0.06} width={0.07} height={0.08} fill="#7fa3c2" />
        <rect x={x + 0.08} y={y + 0.06} width={0.07} height={0.08} fill="#7fa3c2" />
      </g>
    )
  }
  if (art === 'unterwerk') {
    return (
      <g pointerEvents="none">
        <ellipse cx={x + 0.03} cy={y + 0.36} rx={0.36} ry={0.06} fill={SCHATTEN} />
        {/* eingezäuntes Feld mit Transformatoren und Masten */}
        <rect x={x - 0.38} y={y - 0.2} width={0.76} height={0.54} rx={0.02} fill="#bdb8ab" stroke="#8a8a8a" strokeWidth={0.014} strokeDasharray="0.03 0.02" />
        {[-0.2, 0.08].map((dx) => (
          <g key={dx}>
            <rect x={x + dx} y={y - 0.02} width={0.16} height={0.2} rx={0.02} fill="#6f7a82" stroke={DUNKEL} strokeWidth={0.012} />
            {[0, 1, 2].map((k) => <rect key={k} x={x + dx + 0.02 + k * 0.045} y={y - 0.08} width={0.025} height={0.07} rx={0.01} fill="#c9cfd4" stroke={DUNKEL} strokeWidth={0.006} />)}
          </g>
        ))}
        <path d={`M${x - 0.3},${y + 0.3} L${x - 0.3},${y - 0.3} M${x + 0.3},${y + 0.3} L${x + 0.3},${y - 0.3} M${x - 0.34},${y - 0.26} L${x + 0.34},${y - 0.26}`} stroke={DUNKEL} strokeWidth={0.016} />
        {/* gelbes Warnschild mit Blitz */}
        <rect x={x - 0.07} y={y + 0.22} width={0.14} height={0.1} rx={0.01} fill="#f2c230" stroke={DUNKEL} strokeWidth={0.008} />
        <path d={`M${x + 0.01},${y + 0.235} L${x - 0.025},${y + 0.275} L${x},${y + 0.275} L${x - 0.01},${y + 0.31} L${x + 0.03},${y + 0.265} L${x + 0.005},${y + 0.265} Z`} fill={DUNKEL} />
      </g>
    )
  }
  if (art === 'hafenkran') {
    return (
      <g pointerEvents="none">
        <ellipse cx={x + 0.03} cy={y + 0.36} rx={0.28} ry={0.06} fill={SCHATTEN} />
        {/* Portalkran: zwei Beine, Ausleger nach oben links, Haken mit Container */}
        <path d={`M${x - 0.16},${y + 0.34} L${x - 0.08},${y - 0.12} M${x + 0.16},${y + 0.34} L${x + 0.08},${y - 0.12}`} stroke="#d9a21c" strokeWidth={0.04} strokeLinecap="round" />
        <rect x={x - 0.12} y={y - 0.2} width={0.24} height={0.1} rx={0.02} fill="#f2b705" stroke={DUNKEL} strokeWidth={0.012} />
        <rect x={x - 0.04} y={y - 0.28} width={0.12} height={0.08} rx={0.01} fill="#e9e6dc" stroke={DUNKEL} strokeWidth={0.01} />
        <path d={`M${x + 0.02},${y - 0.16} L${x - 0.42},${y - 0.42}`} stroke="#d9a21c" strokeWidth={0.035} strokeLinecap="round" />
        <line x1={x - 0.34} y1={y - 0.37} x2={x - 0.34} y2={y - 0.08} stroke={DUNKEL} strokeWidth={0.008} />
        <rect x={x - 0.43} y={y - 0.08} width={0.18} height={0.09} rx={0.01} fill="#2f6fb0" stroke={DUNKEL} strokeWidth={0.01} />
      </g>
    )
  }
  return null
}

/**
 * Lärmschutzwand an einer Geraden: eine Wand auf einer Seite des Gleises, nochmals tippen dreht sie auf die andere (Drehung 0 und 2 links und rechts eines
 * senkrechten Gleises, 1 und 3 oben und unten eines waagrechten)
 */
export function LaermBild({ f, i, j }: { f: Feld; i: number; j: number }) {
  const d = f.gleis?.dreh ?? 0
  return (
    <g transform={`rotate(${d * 90} ${i + 0.5} ${j + 0.5})`} pointerEvents="none">
      <rect x={i + 0.2} y={j} width={0.07} height={1} fill="rgba(0,0,0,.2)" transform="translate(0.03 0)" />
      <rect x={i + 0.17} y={j} width={0.07} height={1} fill="#8fa07a" stroke="#5e6b50" strokeWidth={0.01} />
      {[0.12, 0.37, 0.62, 0.87].map((y) => <line key={y} x1={i + 0.17} x2={i + 0.24} y1={j + y} y2={j + y} stroke="#5e6b50" strokeWidth={0.012} />)}
    </g>
  )
}

/** Unterführung an einem geraden Bahnhof: ein Treppenabgang aussen auf dem Perron, hinter dem Dach */
export function UnterfuehrungBild({ f, i, j }: { f: Feld; i: number; j: number }) {
  const d = f.gleis?.dreh ?? 0, x = i + 0.76, y = j + 0.765
  return (
    <g transform={`rotate(${d * 90} ${i + 0.5} ${j + 0.5})`} pointerEvents="none">
      <rect x={x} y={y} width={0.14} height={0.2} rx={0.015} fill="#5a5a5a" stroke={DUNKEL} strokeWidth={0.01} />
      {Array.from({ length: 4 }, (_, k) => <line key={k} x1={x + 0.01} x2={x + 0.13} y1={y + 0.04 + k * 0.045} y2={y + 0.04 + k * 0.045} stroke="#c9c9c9" strokeWidth={0.012} />)}
      <rect x={x - 0.005} y={y - 0.005} width={0.15} height={0.21} rx={0.02} fill="none" stroke="#a8102e" strokeWidth={0.012} />
    </g>
  )
}

/** Viadukt: unter dem Gleis Steinbögen, gezeichnet entlang der Punkte des Gleises (Breite und Bögen gewählt) */
export function ViaduktBild({ punkte }: { punkte: Array<{ x: number; y: number; w: number }> }) {
  if (punkte.length < 2) return null
  const lin = (o: number) => punkte.map((q, k) => `${k ? 'L' : 'M'}${(q.x - Math.sin(q.w) * o).toFixed(3)},${(q.y + Math.cos(q.w) * o).toFixed(3)}`).join(' ')
  const d = lin(0)
  return (
    <g pointerEvents="none">
      <path d={d} transform="translate(0.05 0.08)" fill="none" stroke="rgba(0,0,0,.22)" strokeWidth={0.46} />
      <path d={d} fill="none" stroke="#b9ab92" strokeWidth={0.44} />
      {/* Steinfugen quer und die Bögen als dunkle Halbkreise am Rand */}
      <path d={d} fill="none" stroke="#9c8e76" strokeWidth={0.44} strokeDasharray="0.02 0.1" />
      <path d={lin(0.2)} fill="none" stroke="#6e624f" strokeWidth={0.03} strokeDasharray="0.14 0.06" />
      <path d={lin(-0.2)} fill="none" stroke="#6e624f" strokeWidth={0.03} strokeDasharray="0.14 0.06" />
    </g>
  )
}

/** Drehscheibe: eine runde Grube mit drei Gleisen hinaus, die Bühne zeigt zum gestellten Gleis (Stellung 0 gerade, 1 rechts, 2 links) */
export function DrehscheibeBild({ f, i, j }: { f: Feld; i: number; j: number }) {
  const g = f.gleis!, cx = i + 0.5, cy = j + 0.5
  const ziel = [0, 1, 3][g.stellung ?? 0], winkel = (((ziel + g.dreh) % 4) * 90) - 90
  // kurze Gleise von den vier Kanten bis an die Grube
  const stummel = [0, 1, 2, 3].map((e) => {
    const dx = [0, 1, 0, -1][e], dy = [-1, 0, 1, 0][e], qx = -dy, qy = dx
    return (
      <g key={e}>
        <line x1={cx + dx * 0.5} y1={cy + dy * 0.5} x2={cx + dx * 0.36} y2={cy + dy * 0.36} stroke="#cfc9bb" strokeWidth={0.3} />
        {[-0.065, 0.065].map((o) => <line key={o} x1={cx + dx * 0.5 + qx * o} y1={cy + dy * 0.5 + qy * o} x2={cx + dx * 0.38 + qx * o} y2={cy + dy * 0.38 + qy * o} stroke="#6b6b6b" strokeWidth={0.028} />)}
      </g>
    )
  })
  return (
    <g pointerEvents="none">
      {stummel}
      <circle cx={cx} cy={cy} r={0.4} fill="#7d776c" stroke={DUNKEL} strokeWidth={0.02} />
      <circle cx={cx} cy={cy} r={0.36} fill="#9a937f" />
      <circle cx={cx} cy={cy} r={0.36} fill="none" stroke="#6f6a5e" strokeWidth={0.012} strokeDasharray="0.03 0.03" />
      {/* die Bühne: von der Mitte zum Gleis im Süden und zum gestellten */}
      <g transform={`rotate(${winkel} ${cx} ${cy})`}>
        <rect x={cx - 0.39} y={cy - 0.07} width={0.78} height={0.14} rx={0.02} fill="#5a5a5a" stroke={DUNKEL} strokeWidth={0.012} />
        <line x1={cx - 0.39} x2={cx + 0.39} y1={cy - 0.035} y2={cy - 0.035} stroke="#c8c8c8" strokeWidth={0.02} />
        <line x1={cx - 0.39} x2={cx + 0.39} y1={cy + 0.035} y2={cy + 0.035} stroke="#c8c8c8" strokeWidth={0.02} />
      </g>
      <circle cx={cx} cy={cy} r={0.04} fill={DUNKEL} />
    </g>
  )
}
