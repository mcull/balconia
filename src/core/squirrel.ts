import { SQUIRREL, PHYS } from './config'
import type { Melon } from './physics'
import type { Tree } from './world'
import { clamp, lerp, mulberry32 } from '../util/math'

export type SquirrelState = 'perched' | 'crouch' | 'leap' | 'return' | 'carrying' | 'gone'

export interface Squirrel {
  /** Home branch position. */
  hx: number
  hy: number
  x: number
  y: number
  /** Which way it faces. */
  dir: 1 | -1
  state: SquirrelState
  timer: number
  /** Leap start and target, interpolated over leapTime. */
  sx: number; sy: number
  tx: number; ty: number
  /** 0 = wildly optimistic rodent, 1 = calculates intercepts like a hawk. */
  skill: number
  /** Animation phase for the tail. */
  phase: number
  /** Closest the melon has come this flight, for near-miss credit. */
  closest: number
  creditedNearMiss: boolean
  respawnIn: number
}

/** Squirrels perch on the outer third of a branch, where the melons fly. */
export function placeSquirrels(trees: Tree[], count: number, skill: number, seed: number): Squirrel[] {
  const rnd = mulberry32(seed)
  const perches: { x: number; y: number; dir: 1 | -1 }[] = []
  for (const tree of trees) {
    for (const b of tree.branches) {
      if (!b.perchable) continue
      const t = 0.62 + rnd() * 0.28
      const x = lerp(b.x1, b.x2, t)
      const y = lerp(b.y1, b.y2, t)
      // Only branches inside the throwing corridor are worth staking out.
      if (y < -23 || y > 4) continue
      perches.push({ x, y, dir: x > tree.x ? -1 : 1 })
    }
  }
  // Shuffle, then spread them out so you never get four squirrels in a clump.
  for (let i = perches.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[perches[i], perches[j]] = [perches[j], perches[i]]
  }
  const chosen: typeof perches = []
  for (const p of perches) {
    if (chosen.length >= count) break
    if (chosen.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 3.4)) continue
    chosen.push(p)
  }

  return chosen.map((p, i) => ({
    hx: p.x, hy: p.y,
    x: p.x, y: p.y,
    dir: p.dir,
    state: 'perched' as SquirrelState,
    timer: 0,
    sx: p.x, sy: p.y, tx: p.x, ty: p.y,
    skill: clamp(skill + (rnd() - 0.5) * 0.25, 0, 1),
    phase: rnd() * 10,
    closest: Infinity,
    creditedNearMiss: false,
    respawnIn: 0,
    // Stagger their reaction times a touch.
    ...(i % 2 === 0 ? {} : {}),
  }))
}

/**
 * Where the squirrel *thinks* the melon will be. It extrapolates with gravity
 * but no drag, and scales its error by skill — so a low-skill squirrel
 * consistently leaps behind a fast melon.
 */
function predict(m: Melon, dt: number, skill: number): { x: number; y: number } {
  const err = (1 - skill) * 0.9
  return {
    x: m.x + m.vx * dt * (1 - err * 0.55),
    y: m.y + m.vy * dt - 0.5 * PHYS.gravity * dt * dt,
  }
}

export function resetSquirrelsForThrow(squirrels: Squirrel[]): void {
  for (const s of squirrels) {
    s.closest = Infinity
    s.creditedNearMiss = false
    if (s.state === 'leap' || s.state === 'crouch') {
      s.state = 'return'
      s.timer = 0
      s.sx = s.x; s.sy = s.y
    }
  }
}

export interface SquirrelEvent {
  type: 'leap' | 'steal' | 'whiff'
  x: number
  y: number
}

export function stepSquirrels(
  squirrels: Squirrel[],
  melon: Melon | null,
  dt: number,
  events: SquirrelEvent[],
): void {
  for (const s of squirrels) {
    s.phase += dt

    if (s.state === 'gone') {
      s.respawnIn -= dt
      if (s.respawnIn <= 0) {
        s.state = 'perched'
        s.x = s.hx
        s.y = s.hy
      }
      continue
    }

    if (s.state === 'carrying') {
      // Scampers back along the branch toward the trunk and out of sight.
      s.timer += dt
      s.x += -s.dir * 3.2 * dt
      s.y += Math.sin(s.timer * 22) * 0.35 * dt + 0.7 * dt
      if (s.timer > 1.4) {
        s.state = 'gone'
        s.respawnIn = SQUIRREL.respawn
      }
      continue
    }

    if (s.state === 'return') {
      s.timer += dt
      const k = clamp(s.timer / 0.45, 0, 1)
      s.x = lerp(s.sx, s.hx, k)
      s.y = lerp(s.sy, s.hy, k) + Math.sin(k * Math.PI) * 0.45
      if (k >= 1) { s.state = 'perched'; s.timer = 0 }
      continue
    }

    if (s.state === 'crouch') {
      s.timer += dt
      if (s.timer >= 0.16) {
        s.state = 'leap'
        s.timer = 0
        s.sx = s.x
        s.sy = s.y
        events.push({ type: 'leap', x: s.x, y: s.y })
      }
      continue
    }

    if (s.state === 'leap') {
      s.timer += dt
      const k = clamp(s.timer / SQUIRREL.leapTime, 0, 1)
      s.x = lerp(s.sx, s.tx, k)
      s.y = lerp(s.sy, s.ty, k) + Math.sin(k * Math.PI) * 0.55

      if (melon && melon.state === 'flight') {
        const d = Math.hypot(melon.x - s.x, melon.y - s.y)
        s.closest = Math.min(s.closest, d)
        const speed = Math.hypot(melon.vx, melon.vy)
        if (d < SQUIRREL.grabRadius + melon.kind.radius && speed < SQUIRREL.maxCatchSpeed) {
          melon.state = 'stolen'
          s.state = 'carrying'
          s.timer = 0
          events.push({ type: 'steal', x: s.x, y: s.y })
          continue
        }
      }
      if (k >= 1) {
        s.state = 'return'
        s.timer = 0
        s.sx = s.x
        s.sy = s.y
        events.push({ type: 'whiff', x: s.x, y: s.y })
      }
      continue
    }

    // perched: watch the sky.
    if (!melon || melon.state !== 'flight') continue
    const d = Math.hypot(melon.x - s.hx, melon.y - s.hy)
    s.closest = Math.min(s.closest, d)
    if (melon.x > s.hx) s.dir = -1
    else s.dir = 1

    if (d > SQUIRREL.alertRadius) continue

    // Would a leap right now put it on the melon? Check a few lead times.
    let best: { x: number; y: number; d: number } | null = null
    for (let i = 1; i <= 6; i++) {
      const lead = (i / 6) * SQUIRREL.leapTime
      const p = predict(melon, lead, s.skill)
      const reach = Math.hypot(p.x - s.hx, p.y - s.hy)
      if (reach > SQUIRREL.reach) continue
      if (!best || reach < best.d) best = { x: p.x, y: p.y, d: reach }
    }
    if (best) {
      s.state = 'crouch'
      s.timer = 0
      s.tx = best.x
      s.ty = best.y
    }
  }
}

/**
 * After the melon has landed, hand out near-miss credit for every squirrel it
 * threaded past. Called once per throw so you cannot farm the same squirrel.
 */
export function collectNearMisses(squirrels: Squirrel[], melon: Melon): number {
  let n = 0
  const window = (SQUIRREL.grabRadius + melon.kind.radius) * 2.6
  for (const s of squirrels) {
    if (s.creditedNearMiss) continue
    if (s.state === 'carrying' || s.state === 'gone') continue
    if (s.closest < window) {
      s.creditedNearMiss = true
      n++
    }
  }
  return n
}
