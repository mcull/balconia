import { PHYS } from '../core/config'
import { windAt } from '../core/world'
import { clamp, mulberry32, TAU } from '../util/math'
import { PAL } from './palette'
import type { Camera } from './camera'

type Kind = 'droplet' | 'pulp' | 'leaf' | 'pollen' | 'ring' | 'foam' | 'spark'

interface P {
  kind: Kind
  x: number; y: number
  vx: number; vy: number
  life: number
  maxLife: number
  size: number
  rot: number
  spin: number
  color: string
  /** Droplets and pulp fall; pollen and leaves drift. */
  gravity: number
  drag: number
}

const rnd = mulberry32(20260727)

export class Particles {
  private items: P[] = []

  get count(): number {
    return this.items.length
  }

  clear(): void {
    this.items.length = 0
  }

  private push(p: P): void {
    // Hard cap keeps a chain of splashes from ever costing a frame.
    if (this.items.length > 900) this.items.shift()
    this.items.push(p)
  }

  /** Ambient pollen and drifting leaves, so the wind is always legible. */
  seedAmbient(x0: number, x1: number, y0: number, y1: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const pollen = rnd() < 0.72
      this.push({
        kind: pollen ? 'pollen' : 'leaf',
        x: x0 + rnd() * (x1 - x0),
        y: y0 + rnd() * (y1 - y0),
        vx: 0, vy: pollen ? -0.05 : -0.5,
        life: 0, maxLife: 18 + rnd() * 22,
        size: pollen ? 0.025 + rnd() * 0.03 : 0.09 + rnd() * 0.09,
        rot: rnd() * TAU,
        spin: (rnd() - 0.5) * 3,
        color: pollen ? 'rgba(255, 244, 206, 0.85)' : PAL.foliageMid,
        gravity: pollen ? 0.02 : 0.55,
        drag: pollen ? 2.6 : 1.5,
      })
    }
  }

  splash(x: number, y: number, speed: number, steepness: number): void {
    const power = clamp(speed / 16, 0.2, 1.7)
    // Steep entries throw a tight tall column; flat ones throw a wide sheet.
    const n = Math.floor(26 + power * 46)
    for (let i = 0; i < n; i++) {
      const spread = 0.35 + (1 - steepness) * 1.1
      const a = Math.PI / 2 + (rnd() - 0.5) * spread * 2
      const s = (1.6 + rnd() * 6.5) * power * (0.55 + steepness * 0.8)
      this.push({
        kind: 'droplet',
        x: x + (rnd() - 0.5) * 0.5,
        y,
        vx: Math.cos(a) * s + (rnd() - 0.5) * 1.4,
        vy: Math.sin(a) * s,
        life: 0, maxLife: 0.55 + rnd() * 0.85,
        size: 0.03 + rnd() * 0.07,
        rot: 0, spin: 0,
        color: rnd() < 0.25 ? PAL.poolFoam : '#bfeaea',
        gravity: 1, drag: 0.25,
      })
    }
    for (let i = 0; i < 3; i++) {
      this.push({
        kind: 'ring',
        x, y,
        vx: 0, vy: 0,
        life: -i * 0.12, maxLife: 1.5 + i * 0.35,
        size: 0.2, rot: 0, spin: 0,
        color: 'rgba(240,255,252,0.75)',
        gravity: 0, drag: 0,
      })
    }
    for (let i = 0; i < 18; i++) {
      this.push({
        kind: 'foam',
        x: x + (rnd() - 0.5) * 1.6,
        y: y + rnd() * 0.2,
        vx: (rnd() - 0.5) * 1.2, vy: rnd() * 0.4,
        life: 0, maxLife: 1.2 + rnd() * 1.4,
        size: 0.1 + rnd() * 0.22,
        rot: 0, spin: 0,
        color: PAL.poolFoam,
        gravity: 0, drag: 1.6,
      })
    }
  }

  /** A melon meeting concrete. */
  burst(x: number, y: number, speed: number): void {
    const power = clamp(speed / 14, 0.3, 1.6)
    for (let i = 0; i < Math.floor(22 + power * 34); i++) {
      const a = rnd() * Math.PI
      const s = (1.5 + rnd() * 5.5) * power
      this.push({
        kind: 'pulp',
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.abs(Math.sin(a)) * s * 0.9,
        life: 0, maxLife: 0.8 + rnd() * 1.2,
        size: 0.04 + rnd() * 0.11,
        rot: rnd() * TAU,
        spin: (rnd() - 0.5) * 12,
        color: rnd() < 0.22 ? PAL.melonRind : PAL.melonFlesh,
        gravity: 1, drag: 0.3,
      })
    }
  }

  /** Needles and leaves knocked loose by a branch strike. */
  shake(x: number, y: number, speed: number): void {
    for (let i = 0; i < Math.floor(6 + clamp(speed, 0, 20)); i++) {
      this.push({
        kind: 'leaf',
        x: x + (rnd() - 0.5) * 0.8,
        y: y + (rnd() - 0.5) * 0.8,
        vx: (rnd() - 0.5) * 2.2,
        vy: rnd() * 1.4,
        life: 0, maxLife: 2.2 + rnd() * 2.4,
        size: 0.07 + rnd() * 0.09,
        rot: rnd() * TAU,
        spin: (rnd() - 0.5) * 5,
        color: rnd() < 0.4 ? PAL.foliageNear : PAL.foliageMid,
        gravity: 0.5, drag: 1.7,
      })
    }
  }

  /** Little warm flecks for scoring pops and training beats. */
  sparkle(x: number, y: number, n = 12, color = '#ffe6a8'): void {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU
      const s = 1 + rnd() * 3.5
      this.push({
        kind: 'spark',
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, maxLife: 0.5 + rnd() * 0.6,
        size: 0.05 + rnd() * 0.06,
        rot: 0, spin: 0,
        color,
        gravity: 0.15, drag: 2.2,
      })
    }
  }

  update(dt: number, t: number, bounds: { x0: number; x1: number; y0: number; y1: number }): void {
    const w = windAt(0, t)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i]
      p.life += dt
      if (p.life > p.maxLife) { this.items.splice(i, 1); continue }
      if (p.life < 0) continue

      if (p.kind === 'ring' || p.kind === 'foam') {
        if (p.kind === 'foam') {
          p.x += p.vx * dt
          p.vx -= p.vx * p.drag * dt
        }
        continue
      }

      const localWind = windAt(p.y, t)
      p.vx += (localWind - p.vx) * p.drag * dt * 0.35
      p.vy -= PHYS.gravity * p.gravity * dt
      if (p.kind === 'pollen') {
        p.vy += Math.sin(t * 1.7 + p.x * 0.6) * 0.12 * dt
        p.vx += w * 0.02 * dt
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.spin * dt

      // Recycle ambient drifters that blow out of frame.
      if (p.kind === 'pollen' || p.kind === 'leaf') {
        if (p.x < bounds.x0) p.x = bounds.x1
        if (p.x > bounds.x1) p.x = bounds.x0
        if (p.y < bounds.y0) { p.y = bounds.y1; p.vy = 0 }
        if (p.y > bounds.y1) p.y = bounds.y0
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    for (const p of this.items) {
      if (p.life < 0) continue
      const k = p.life / p.maxLife
      const x = cam.sx(p.x)
      const y = cam.sy(p.y)
      if (x < -60 || x > cam.viewW + 60 || y < -60 || y > cam.viewH + 60) continue

      ctx.save()
      switch (p.kind) {
        case 'ring': {
          const r = cam.s(0.3 + k * 3.6)
          ctx.globalAlpha = (1 - k) * 0.55
          ctx.strokeStyle = p.color
          ctx.lineWidth = Math.max(1, cam.s(0.045) * (1 - k))
          ctx.beginPath()
          ctx.ellipse(x, y, r, r * 0.22, 0, 0, TAU)
          ctx.stroke()
          break
        }
        case 'foam': {
          ctx.globalAlpha = (1 - k) * 0.8
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.ellipse(x, y, cam.s(p.size), cam.s(p.size) * 0.4, 0, 0, TAU)
          ctx.fill()
          break
        }
        case 'droplet': {
          ctx.globalAlpha = 1 - k * k
          ctx.fillStyle = p.color
          const stretch = clamp(Math.hypot(p.vx, p.vy) / 9, 0.4, 2.4)
          ctx.translate(x, y)
          ctx.rotate(Math.atan2(-p.vy, p.vx))
          ctx.beginPath()
          ctx.ellipse(0, 0, cam.s(p.size) * stretch, cam.s(p.size) * 0.8, 0, 0, TAU)
          ctx.fill()
          break
        }
        case 'leaf': {
          ctx.globalAlpha = clamp(1 - k, 0, 1) * 0.9
          ctx.fillStyle = p.color
          ctx.translate(x, y)
          ctx.rotate(p.rot)
          ctx.beginPath()
          ctx.ellipse(0, 0, cam.s(p.size), cam.s(p.size) * 0.32, 0, 0, TAU)
          ctx.fill()
          break
        }
        case 'pollen': {
          ctx.globalAlpha = 0.5 + Math.sin(p.rot + p.life * 3) * 0.3
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(x, y, Math.max(0.7, cam.s(p.size)), 0, TAU)
          ctx.fill()
          break
        }
        case 'pulp':
        case 'spark': {
          ctx.globalAlpha = 1 - k
          ctx.fillStyle = p.color
          ctx.translate(x, y)
          ctx.rotate(p.rot)
          ctx.beginPath()
          ctx.ellipse(0, 0, cam.s(p.size), cam.s(p.size) * 0.66, 0, 0, TAU)
          ctx.fill()
          break
        }
      }
      ctx.restore()
    }
  }
}
