import { PHYS, WORLD, type MelonKind } from './config'
import { isOverNeighbourRoof, isOverPool, terrainY, windAt, type Tree } from './world'
import { clamp, lerp as lerpNum, segDist } from '../util/math'

/** How far out along a branch there is still wood worth hitting. */
const WOODY_FRACTION = 0.62
/** Inside this fraction the limb is thick enough to stop a melon dead. */
const INNER_LIMB = 0.3
/** Fraction of a trunk's height that is thick enough to be a wall. */
const TRUNK_SOLID = 0.6

export type MelonState = 'flight' | 'water' | 'splat' | 'stolen'

export interface Melon {
  kind: MelonKind
  x: number
  y: number
  vx: number
  vy: number
  /** Angular velocity, rad/s. Positive is backspin for a rightward throw. */
  spin: number
  /** Visual rotation. */
  angle: number
  state: MelonState
  /** Branches glanced off en route. Style points if it still lands. */
  bounces: number
  /** Squirrels dodged by a whisker. */
  nearMisses: number
  /** Speed and spin at the instant of water entry, kept for scoring. */
  entrySpeed: number
  entryAngle: number
  entrySpin: number
  /** How long it has been in flight, for the trail and the hang-time readout. */
  airtime: number
  /** Time spent barely moving, used to notice a melon wedged in a tree. */
  restTime: number
  /** Brief blindness to branches after crashing through one. */
  branchCooldown: number
  /** Trail of past positions in world space. */
  trail: { x: number; y: number }[]
  /** Set once it has settled, so the round can end. */
  settled: boolean
}

export type PhysEvent =
  | { type: 'branch'; x: number; y: number; speed: number }
  | { type: 'trunk'; x: number; y: number; speed: number }
  | { type: 'rail'; x: number; y: number; speed: number }
  | { type: 'water'; x: number; y: number; speed: number; angle: number }
  | { type: 'splat'; x: number; y: number; speed: number; onRoof: boolean }
  | { type: 'lodged'; x: number; y: number }

export function makeMelon(kind: MelonKind, x: number, y: number, vx: number, vy: number, spin: number): Melon {
  return {
    kind, x, y, vx, vy, spin,
    angle: 0,
    state: 'flight',
    bounces: 0,
    nearMisses: 0,
    entrySpeed: 0,
    entryAngle: 0,
    entrySpin: 0,
    airtime: 0,
    restTime: 0,
    branchCooldown: 0,
    trail: [],
    settled: false,
  }
}

/** Frontal area of the melon. */
function area(m: Melon): number {
  return Math.PI * m.kind.radius * m.kind.radius
}

/**
 * Aerodynamic acceleration: quadratic drag against the *relative* wind, plus
 * Magnus lift from spin. Drag on a 5kg melon at 15 m/s is only about 8% of its
 * weight, so this reads as a subtle late-flight sag rather than a brick wall.
 */
function aero(m: Melon, wind: number, out: { ax: number; ay: number }): void {
  const vrx = m.vx - wind
  const vry = m.vy
  const v = Math.hypot(vrx, vry)
  if (v < 1e-4) { out.ax = 0; out.ay = 0; return }

  const q = 0.5 * PHYS.airDensity * area(m) * v
  const drag = q * PHYS.dragCoefficient
  let ax = (-drag * vrx) / m.kind.mass
  let ay = (-drag * vry) / m.kind.mass

  // Lift coefficient rises with spin ratio and saturates, as it does in reality.
  // The force itself is quadratic in speed like drag; only its *direction* is
  // the unit perpendicular, which is why there is no division by v here.
  const spinRatio = (m.kind.radius * Math.abs(m.spin)) / v
  const cl = clamp(0.5 * spinRatio, 0, 0.4)
  const lift = (q * cl * PHYS.magnusGain) / m.kind.mass
  const s = Math.sign(m.spin)
  ax += lift * -vry * s
  ay += lift * vrx * s

  out.ax = ax
  out.ay = ay
}

const acc = { ax: 0, ay: 0 }

function reflect(m: Melon, nx: number, ny: number, restitution: number, friction: number): number {
  const vn = m.vx * nx + m.vy * ny
  const tx = -ny
  const ty = nx
  const vt = m.vx * tx + m.vy * ty
  const speed = Math.hypot(m.vx, m.vy)
  const nvn = -vn * restitution
  const nvt = vt * (1 - friction)
  m.vx = nx * nvn + tx * nvt
  m.vy = ny * nvn + ty * nvt
  // A glancing hit spins the melon up; a square hit kills the spin.
  m.spin = m.spin * 0.55 - (vt / Math.max(0.2, m.kind.radius)) * 0.16
  return speed
}

/** Push the melon out of an overlap so it cannot tunnel or stick. */
function separate(m: Melon, cx: number, cy: number, minDist: number): { nx: number; ny: number } {
  let nx = m.x - cx
  let ny = m.y - cy
  let d = Math.hypot(nx, ny)
  if (d < 1e-5) { nx = 0; ny = 1; d = 1 }
  nx /= d
  ny /= d
  m.x = cx + nx * minDist
  m.y = cy + ny * minDist
  return { nx, ny }
}

function collideTrees(m: Melon, trees: Tree[], events: PhysEvent[]): void {
  for (const tree of trees) {
    // Cheap reject: is the melon anywhere near this tree's bounding column?
    const spread = tree.height * 0.55 + 2
    if (m.x < tree.x - spread || m.x > tree.x + spread) continue
    if (m.y < tree.baseY - 1 || m.y > tree.baseY + tree.height + 2) continue

    // Trunk, as a tapering vertical capsule.
    //
    // Only the lower part is solid. Above that a redwood is a thin whippy
    // leader that a five-kilo melon goes straight through, which matters more
    // than it sounds: in a side-on view a full-height trunk is a wall across
    // the entire corridor with no way round it, and the game is unplayable.
    // Throwing over the canopy of trees growing downslope is also simply what
    // you do from a third-storey balcony.
    const topY = tree.baseY + tree.height
    const th = clamp((m.y - tree.baseY) / tree.height, 0, 1)
    const tr = tree.trunkR * (1 - th * 0.62)
    const trunk = segDist(m.x, m.y, tree.x, tree.baseY, tree.x, topY)
    if (trunk.d < tr + m.kind.radius) {
      if (th < TRUNK_SOLID) {
        const { nx, ny } = separate(m, trunk.cx, trunk.cy, tr + m.kind.radius + 0.001)
        const speed = reflect(m, nx, ny, 0.24, 0.45)
        events.push({ type: 'trunk', x: m.x, y: m.y, speed })
        return
      }
      if (m.branchCooldown <= 0) {
        const f = clamp((th - TRUNK_SOLID) / (1 - TRUNK_SOLID), 0, 1)
        const keep = lerpNum(0.70, 0.95, f)
        const speed = Math.hypot(m.vx, m.vy)
        m.vx *= keep
        m.vy *= keep
        m.vy -= (1 - f) * 1.4
        m.branchCooldown = 0.12
        events.push({ type: 'branch', x: m.x, y: m.y, speed })
      }
    }

    if (m.branchCooldown > 0) continue

    for (const b of tree.branches) {
      const s = segDist(m.x, m.y, b.x1, b.y1, b.x2, b.y2)
      // Only the woody inner two thirds of a branch is solid. Past that it is
      // needles and small stuff, drawn but not collided — which is what makes
      // the canopy something you fly through rather than a wall.
      if (s.t > WOODY_FRACTION) continue
      // Taper: a limb is thickest where it leaves the trunk.
      const r = b.r * (1 - s.t * 0.55)
      const hit = r + m.kind.radius
      if (s.d >= hit) continue

      const { nx, ny } = separate(m, s.cx, s.cy, hit + 0.001)
      const speed = Math.hypot(m.vx, m.vy)
      m.bounces++
      events.push({ type: 'branch', x: m.x, y: m.y, speed })

      if (s.t < INNER_LIMB) {
        // Thick inner limb, close to the trunk. This one actually stops you.
        reflect(m, nx, ny, 0.34, 0.34)
      } else {
        // Outer wood: you crash through, but it costs speed and kicks the
        // line sideways, and the cost rises the closer to the trunk you clip.
        const f = clamp((s.t - INNER_LIMB) / (WOODY_FRACTION - INNER_LIMB), 0, 1)
        const keep = lerpNum(0.72, 0.94, f)
        m.vx *= keep
        m.vy *= keep
        const kick = (1 - f) * 2.6
        m.vx += nx * kick
        m.vy += ny * kick
        m.spin -= (m.vx * ny - m.vy * nx) * 0.5
        m.branchCooldown = 0.09
      }
      return
    }
  }
}

function collideStructure(m: Melon, events: PhysEvent[]): void {
  // The underside of the roof eave, which only a genuinely silly lob reaches.
  // The corridor that shapes ordinary throws is the rail below.
  if (m.y > 1.9 && m.x < 1.3) {
    const eave = segDist(m.x, m.y, -6, 3.96, 1.0, 2.78)
    if (eave.d < 0.06 + m.kind.radius) {
      const { nx, ny } = separate(m, eave.cx, eave.cy, 0.06 + m.kind.radius + 0.001)
      const speed = reflect(m, nx, ny, 0.3, 0.3)
      events.push({ type: 'rail', x: m.x, y: m.y, speed })
      return
    }
  }

  // Balcony rail, right in front of you. Clip it and the round is a comedy.
  const rail = segDist(m.x, m.y, WORLD.railX, WORLD.railTop - 1.15, WORLD.railX, WORLD.railTop)
  if (rail.d < 0.05 + m.kind.radius) {
    const { nx, ny } = separate(m, rail.cx, rail.cy, 0.05 + m.kind.radius + 0.001)
    const speed = reflect(m, nx, ny, 0.42, 0.14)
    events.push({ type: 'rail', x: m.x, y: m.y, speed })
    return
  }
  // Deck floor behind the rail, for throws that go badly backwards.
  if (m.x < WORLD.railX && m.y - m.kind.radius < -1.15 && m.vy < 0) {
    m.y = -1.15 + m.kind.radius
    const speed = reflect(m, 0, 1, 0.2, 0.5)
    events.push({ type: 'splat', x: m.x, y: m.y, speed, onRoof: false })
    m.state = 'splat'
  }
}

function collideGround(m: Melon, events: PhysEvent[]): void {
  const pool = WORLD.pool
  // The pool is a hole cut in the patio. The terrain polyline runs straight
  // across it, so over the water the ground check has to be skipped entirely
  // or every melon splats on thin air four hundred millimetres above the pool.
  if (isOverPool(m.x)) {
    if (m.y - m.kind.radius <= pool.surfaceY) {
      const speed = Math.hypot(m.vx, m.vy)
      m.entrySpeed = speed
      // 0 = skimming flat, 1 = straight down.
      m.entryAngle = Math.abs(m.vy) / Math.max(0.01, speed)
      m.entrySpin = Math.abs(m.spin)
      m.state = 'water'
      events.push({ type: 'water', x: m.x, y: pool.surfaceY, speed, angle: m.entryAngle })
    }
    return
  }
  const g = terrainY(m.x)
  if (m.y - m.kind.radius <= g) {
    const speed = Math.hypot(m.vx, m.vy)
    m.y = g + m.kind.radius
    m.state = 'splat'
    events.push({ type: 'splat', x: m.x, y: m.y, speed, onRoof: isOverNeighbourRoof(m.x) })
  }
}

/**
 * Underwater: buoyancy plus heavy drag. A watermelon is very slightly denser
 * than water at about 0.97, so it plunges, stalls, and wallows back up to sit
 * mostly submerged — which is exactly what you want to watch after a good one.
 */
function stepWater(m: Melon, dt: number): void {
  const pool = WORLD.pool
  const r = m.kind.radius
  const submerged = clamp((pool.surfaceY - (m.y - r)) / (2 * r), 0, 1)
  const vol = (4 / 3) * Math.PI * r * r * r
  const displaced = vol * submerged
  const buoy = (1000 * PHYS.gravity * displaced) / m.kind.mass
  const waterDrag = 12.5 * submerged

  m.vy += (buoy - PHYS.gravity) * dt
  m.vx -= m.vx * waterDrag * dt
  m.vy -= m.vy * waterDrag * dt
  m.x += m.vx * dt
  m.y += m.vy * dt
  m.spin -= m.spin * 5 * dt
  m.angle += m.spin * dt

  // Do not let it swim out through the pool walls.
  m.x = clamp(m.x, pool.left + r, pool.right - r)
  if (m.y - r < pool.surfaceY - pool.depth) {
    m.y = pool.surfaceY - pool.depth + r
    m.vy = Math.abs(m.vy) * 0.2
  }
  if (Math.hypot(m.vx, m.vy) < 0.12) m.settled = true
}

function stepSplat(m: Melon, dt: number): void {
  m.vx -= m.vx * 6 * dt
  m.x += m.vx * dt
  m.spin -= m.spin * 8 * dt
  if (Math.abs(m.vx) < 0.15) m.settled = true
}

/**
 * Advance one melon. Substeps internally at a fixed 240 Hz so a fast melon
 * cannot tunnel through a branch, and appends anything worth reacting to.
 */
export function stepMelon(m: Melon, trees: Tree[], dt: number, t: number, events: PhysEvent[]): void {
  if (m.state === 'stolen') return
  if (m.state === 'water') { stepWater(m, dt); return }
  if (m.state === 'splat') { stepSplat(m, dt); return }

  const steps = Math.max(1, Math.ceil(dt / PHYS.step))
  const h = dt / steps

  for (let i = 0; i < steps && m.state === 'flight'; i++) {
    const wind = windAt(m.y, t + i * h)
    aero(m, wind, acc)

    // Velocity Verlet: position from the current acceleration, then average in
    // the new acceleration. Stable enough to integrate a whole flight cleanly.
    const ax0 = acc.ax
    const ay0 = acc.ay - PHYS.gravity
    m.x += m.vx * h + 0.5 * ax0 * h * h
    m.y += m.vy * h + 0.5 * ay0 * h * h

    aero(m, wind, acc)
    m.vx += 0.5 * (ax0 + acc.ax) * h
    m.vy += 0.5 * (ay0 + (acc.ay - PHYS.gravity)) * h

    m.spin -= m.spin * PHYS.spinDecay * h
    m.angle += m.spin * h
    m.airtime += h
    if (m.branchCooldown > 0) m.branchCooldown -= h

    collideStructure(m, events)
    if (m.state !== 'flight') break
    collideTrees(m, trees, events)
    if (m.state !== 'flight') break
    collideGround(m, events)

    // A melon can come to rest wedged in a fork, where it would otherwise sit
    // separating and re-colliding against gravity forever and the round would
    // never end. Once it has stopped moving, call it: it is up the tree now.
    if (Math.hypot(m.vx, m.vy) < 0.45) {
      m.restTime += h
      if (m.restTime > 0.4) {
        m.state = 'splat'
        m.settled = true
        events.push({ type: 'lodged', x: m.x, y: m.y })
        break
      }
    } else {
      m.restTime = 0
    }
  }

  const last = m.trail[m.trail.length - 1]
  if (!last || Math.hypot(m.x - last.x, m.y - last.y) > 0.35) {
    m.trail.push({ x: m.x, y: m.y })
    if (m.trail.length > 90) m.trail.shift()
  }
}

/**
 * Dry-run the flight with the same integrator to draw a short aim preview.
 * Deliberately truncated: you get to see the first metre or two of the arc,
 * never the landing spot.
 */
export function previewArc(
  kind: MelonKind,
  vx: number, vy: number, spin: number,
  t: number, samples: number, dt: number,
): { x: number; y: number }[] {
  const ghost = makeMelon(kind, WORLD.throwPoint.x, WORLD.throwPoint.y, vx, vy, spin)
  const pts: { x: number; y: number }[] = [{ x: ghost.x, y: ghost.y }]
  const scratch: PhysEvent[] = []
  for (let i = 0; i < samples; i++) {
    stepMelon(ghost, [], dt, t, scratch)
    pts.push({ x: ghost.x, y: ghost.y })
    if (ghost.state !== 'flight') break
  }
  return pts
}
