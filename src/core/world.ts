import { WORLD, WIND } from './config'
import { clamp, lerp, mulberry32, noise1, remap, TAU } from '../util/math'

export interface Branch {
  x1: number; y1: number
  x2: number; y2: number
  /** Collision radius of the woody part. */
  r: number
  /** Foliage puffs hanging off this branch, drawn but not collided. */
  puffs: { x: number; y: number; r: number }[]
  /** Squirrels perch here. */
  perchable: boolean
}

export interface Tree {
  kind: 'redwood' | 'oak'
  x: number
  baseY: number
  height: number
  trunkR: number
  branches: Branch[]
  /** Painterly hue jitter so no two trees read the same. */
  hueShift: number
  seed: number
}

/** The hillside cross-section, west (house) to east (neighbours), in metres. */
const TERRAIN: [number, number][] = [
  [-20, WORLD.houseBaseY],
  [WORLD.houseFrontX, WORLD.houseBaseY],
  [3.0, -9.5],
  [6.5, -11.9],
  [10.0, -14.6],
  [14.0, -17.7],
  [18.0, -20.4],
  [21.4, -22.6],
  [WORLD.patioLeft, WORLD.patioY],
  [WORLD.patioRight, WORLD.patioY],
  [38.4, -24.3],
  [39.6, WORLD.neighbourRoofY],
  [WORLD.neighbourRoofRight, WORLD.neighbourRoofY],
  [70, -32],
]

/** Ground height at a given x. */
export function terrainY(x: number): number {
  if (x <= TERRAIN[0][0]) return TERRAIN[0][1]
  for (let i = 1; i < TERRAIN.length; i++) {
    const [ax, ay] = TERRAIN[i - 1]
    const [bx, by] = TERRAIN[i]
    if (x <= bx) return lerp(ay, by, (x - ax) / (bx - ax))
  }
  return TERRAIN[TERRAIN.length - 1][1]
}

export function terrainPoints(): [number, number][] {
  return TERRAIN
}

export function isOverPool(x: number): boolean {
  return x >= WORLD.pool.left && x <= WORLD.pool.right
}

export function poolCentreX(): number {
  return (WORLD.pool.left + WORLD.pool.right) / 2
}

export function isOverNeighbourRoof(x: number): boolean {
  return x >= WORLD.neighbourRoofLeft && x <= WORLD.neighbourRoofRight
}

/**
 * Per-level multiplier on the prevailing wind. There is exactly one hillside,
 * so this lives here rather than being threaded through every physics call.
 */
let windScale = 1
export function setWindScale(s: number): void {
  windScale = s
}

/**
 * Wind at a point. Onshore breeze off the bay pushing back toward the house,
 * gusting over time, and sheltered down in the pool grotto where the hill and
 * the trees break it up.
 */
export function windAt(y: number, t: number): number {
  const gust =
    noise1(t * WIND.gustRate, 1301) * 0.68 + noise1(t * WIND.gustRate * 2.7, 7717) * 0.32
  const raw = WIND.baseSpeed + gust * WIND.gustAmplitude
  const shelter = remap(y, WORLD.pool.surfaceY, WORLD.throwPoint.y, WIND.shelterAtPool, 1)
  return raw * shelter * windScale
}

function makeRedwood(x: number, height: number, seed: number): Tree {
  const rnd = mulberry32(seed)
  const baseY = terrainY(x)
  const trunkR = height * 0.021
  const branches: Branch[] = []

  // Redwoods branch in loose whorls, short near the crown and long lower down,
  // and they droop.
  const whorls = Math.floor(height / 1.9)
  for (let i = 2; i < whorls; i++) {
    const f = i / whorls
    const y = baseY + height * f
    const perSide = f > 0.75 ? 1 : 2
    for (let s = 0; s < perSide * 2; s++) {
      const dir = s % 2 === 0 ? 1 : -1
      // Longest branches sit two thirds of the way up; the crown tapers.
      const len = height * 0.13 * (0.35 + Math.sin(f * Math.PI) * 0.9) * (0.7 + rnd() * 0.6)
      if (len < 0.5) continue
      const droop = -len * (0.18 + rnd() * 0.3)
      const x2 = x + dir * len
      const y2 = y + droop
      const puffs: { x: number; y: number; r: number }[] = []
      const n = 2 + Math.floor(len * 1.3)
      for (let p = 0; p < n; p++) {
        const t = 0.25 + (p / n) * 0.85
        puffs.push({
          x: lerp(x, x2, t) + (rnd() - 0.5) * 0.5,
          y: lerp(y, y2, t) + (rnd() - 0.5) * 0.5,
          r: lerp(0.75, 0.42, t) * (0.8 + rnd() * 0.5) * (0.6 + len * 0.13),
        })
      }
      branches.push({
        x1: x, y1: y, x2, y2,
        r: Math.max(0.05, trunkR * (0.55 - f * 0.3)),
        puffs,
        perchable: len > height * 0.055 && f > 0.18 && f < 0.85,
      })
    }
  }

  // A crown tuft, so the trunk does not finish as a bare pole in the sky.
  const crownY = baseY + height
  branches.push({
    x1: x, y1: crownY - height * 0.06,
    x2: x, y2: crownY,
    r: 0.04,
    puffs: [
      { x, y: crownY - height * 0.035, r: 0.85 },
      { x: x - 0.5, y: crownY - height * 0.06, r: 0.7 },
      { x: x + 0.45, y: crownY - height * 0.055, r: 0.65 },
      { x, y: crownY + 0.25, r: 0.5 },
    ],
    perchable: false,
  })

  return { kind: 'redwood', x, baseY, height, trunkR, branches, hueShift: (rnd() - 0.5) * 14, seed }
}

/**
 * The big spreading oak that leans out over the pool in the reference photo.
 * Fewer, thicker, wider limbs than a redwood — and much harder to throw past.
 */
function makeOak(x: number, height: number, lean: number, seed: number): Tree {
  const rnd = mulberry32(seed)
  const baseY = terrainY(x)
  const trunkR = height * 0.038
  const branches: Branch[] = []
  const limbs = 7
  for (let i = 0; i < limbs; i++) {
    const f = 0.42 + (i / limbs) * 0.55
    const y = baseY + height * f
    const dir = i % 2 === 0 ? lean : -lean * 0.55
    const len = height * (0.42 - f * 0.18) * (0.75 + rnd() * 0.5)
    const x2 = x + dir * len
    const y2 = y + len * (0.12 + rnd() * 0.35)
    const puffs: { x: number; y: number; r: number }[] = []
    const n = 3 + Math.floor(len * 1.1)
    for (let p = 0; p < n; p++) {
      const t = 0.3 + (p / n) * 0.8
      puffs.push({
        x: lerp(x, x2, t) + (rnd() - 0.5) * 1.1,
        y: lerp(y, y2, t) + (rnd() - 0.5) * 0.9,
        r: (1.0 + rnd() * 0.9) * lerp(1.1, 0.7, t),
      })
    }
    branches.push({
      x1: x, y1: y, x2, y2,
      r: Math.max(0.07, trunkR * (0.6 - f * 0.25)),
      puffs,
      perchable: true,
    })
  }
  return { kind: 'oak', x, baseY, height, trunkR, branches, hueShift: (rnd() - 0.5) * 10, seed }
}

/**
 * The gauntlet. Four trees staggered down the corridor between the balcony and
 * the water, each one intersecting the flight path at a different altitude, so
 * there is no single arc that clears everything — you pick a lane.
 *
 * The first redwood is deliberately held back past x=10. Closer in, its upper
 * branches reach back to within a couple of metres of the rail and there is no
 * throw that gets off the balcony at all.
 */
export function buildTrees(): Tree[] {
  return [
    makeRedwood(11.0, 19.0, 12007),
    makeRedwood(17.2, 22.5, 44101),
    makeRedwood(22.6, 16.0, 90210),
    makeOak(35.4, 12.5, -1.35, 31337),
  ]
}

/** Distant foliage and rooftops, painted only. Never collided. */
export interface Backdrop {
  masses: { x: number; y: number; rx: number; ry: number; depth: number; tone: number }[]
  roofs: { x: number; y: number; w: number; h: number; depth: number; pitch: number }[]
  islands: { x: number; y: number; w: number; h: number }[]
}

export function buildBackdrop(): Backdrop {
  const rnd = mulberry32(6626)
  const masses: Backdrop['masses'] = []
  // Three parallax bands of hillside greenery running down the slope.
  for (let band = 0; band < 3; band++) {
    const depth = 0.28 + band * 0.22
    const count = 26 - band * 5
    for (let i = 0; i < count; i++) {
      const x = -18 + rnd() * 96
      const groundish = terrainY(x) - band * 2.4
      masses.push({
        x,
        y: groundish + rnd() * 7 + band * 1.5,
        rx: 2.2 + rnd() * 5.5,
        ry: 1.8 + rnd() * 4.2,
        depth,
        tone: rnd(),
      })
    }
  }
  const roofs: Backdrop['roofs'] = []
  for (let i = 0; i < 14; i++) {
    const x = 20 + rnd() * 80
    roofs.push({
      x,
      y: -30 - rnd() * 12 - i * 0.35,
      w: 6 + rnd() * 9,
      h: 2.4 + rnd() * 3,
      depth: 0.12 + rnd() * 0.16,
      pitch: 0.3 + rnd() * 0.5,
    })
  }
  const islands: Backdrop['islands'] = [
    { x: 96, y: -44, w: 30, h: 5.5 },
    { x: 132, y: -45, w: 18, h: 3.4 },
    { x: 158, y: -44.5, w: 26, h: 6.6 },
  ]
  return { masses, roofs, islands }
}

/** Ripple phase helper shared by the pool renderer and the splash particles. */
export function poolRipple(x: number, t: number): number {
  return (
    Math.sin(x * 1.7 + t * 1.9) * 0.035 +
    Math.sin(x * 3.9 - t * 2.7) * 0.018 +
    Math.sin(x * 0.7 + t * 0.8) * 0.02
  )
}

export function angleWrap(a: number): number {
  return ((a % TAU) + TAU) % TAU
}

export { clamp }
