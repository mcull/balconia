export const TAU = Math.PI * 2

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a)
}

/** Maps v from one range to another, clamped to the destination range. */
export function remap(v: number, inA: number, inB: number, outA: number, outB: number): number {
  return lerp(outA, outB, clamp(invLerp(inA, inB, v), 0, 1))
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Frame-rate independent exponential approach. `rate` is roughly "per second". */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt))
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

/** Shortest distance from point p to segment ab, plus the closest point. */
export function segDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { d: number; cx: number; cy: number; t: number } {
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  const t = len2 === 0 ? 0 : clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1)
  const cx = ax + abx * t
  const cy = ay + aby * t
  return { d: Math.hypot(px - cx, py - cy), cx, cy, t }
}

/** Small deterministic PRNG so the hillside paints identically every frame. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cheap value noise, good enough for wind gusts and wobbly ink lines. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x)
  const f = x - i
  const h = (n: number) => {
    let t = Math.imul(n ^ seed, 0x27d4eb2d)
    t ^= t >>> 15
    return (t >>> 0) / 4294967296
  }
  const u = f * f * (3 - 2 * f)
  return lerp(h(i), h(i + 1), u) * 2 - 1
}
