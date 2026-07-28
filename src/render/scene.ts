import { WORLD } from '../core/config'
import { poolRipple, terrainPoints, type Backdrop, type Tree } from '../core/world'
import { clamp, lerp, mulberry32, TAU } from '../util/math'
import type { Camera } from './camera'
import { PAL, SUN } from './palette'
import { blobPath, fillBlob, foliageClump, inkLine, sunHaze } from './painter'

type Ctx = CanvasRenderingContext2D

/** Parallax projector for one depth plane. depth 1 = the action plane. */
function plane(cam: Camera, depth: number) {
  const z = cam.zoom
  return {
    x: (wx: number) => (wx - cam.x) * depth * z + cam.viewW / 2,
    y: (wy: number) => cam.viewH / 2 - (wy - cam.y) * depth * z,
    s: (m: number) => m * depth * z,
  }
}

export class SceneRenderer {
  constructor(
    private trees: Tree[],
    private backdrop: Backdrop,
  ) {}

  // ---------------------------------------------------------------- sky

  private sky(ctx: Ctx, cam: Camera): number {
    const { viewW: W, viewH: H } = cam
    // The horizon drifts slowly as the camera falls, the way a real one does.
    const horizon = H * 0.44 + (cam.y + 6) * cam.zoom * 0.1

    const g = ctx.createLinearGradient(0, -H * 0.15, 0, horizon + H * 0.06)
    g.addColorStop(0, PAL.skyHigh)
    g.addColorStop(0.42, PAL.skyMid)
    g.addColorStop(0.82, PAL.skyHaze)
    g.addColorStop(1, PAL.horizonWarm)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, horizon + 2)

    sunHaze(ctx, W * SUN.x, horizon - H * 0.28, Math.max(W, H) * 0.55, PAL.sunGlow)
    sunHaze(ctx, W * SUN.x, horizon - H * 0.28, H * 0.12, 'rgba(255,250,232,0.85)')
    return horizon
  }

  // ---------------------------------------------------------------- bay

  private bay(ctx: Ctx, cam: Camera, horizon: number, t: number): void {
    const { viewW: W, viewH: H } = cam
    const p = plane(cam, 0.07)

    const water = ctx.createLinearGradient(0, horizon, 0, horizon + H * 0.24)
    water.addColorStop(0, PAL.bayFar)
    water.addColorStop(1, PAL.bayNear)
    ctx.fillStyle = water
    ctx.fillRect(0, horizon, W, H * 0.3)

    // A band of glitter under the sun.
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = '#fdf6e2'
    ctx.lineWidth = 1
    const rnd = mulberry32(555)
    for (let i = 0; i < 90; i++) {
      const gy = horizon + rnd() * H * 0.14
      const gx = W * SUN.x + (rnd() - 0.5) * W * 0.7
      const len = 3 + rnd() * 16
      ctx.globalAlpha = 0.06 + rnd() * 0.22 * (1 - Math.abs(gx / W - SUN.x) * 1.6)
      const drift = Math.sin(t * 0.6 + i) * 4
      ctx.beginPath()
      ctx.moveTo(gx + drift, gy)
      ctx.lineTo(gx + drift + len, gy)
      ctx.stroke()
    }
    ctx.restore()

    // Islands and the far Marin ridge.
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = PAL.islands
    for (const isl of this.backdrop.islands) {
      const cx = p.x(isl.x)
      const w = p.s(isl.w) * 6
      const h = p.s(isl.h) * 6
      ctx.beginPath()
      ctx.moveTo(cx - w, horizon + 1)
      ctx.quadraticCurveTo(cx - w * 0.35, horizon - h, cx, horizon - h * 0.82)
      ctx.quadraticCurveTo(cx + w * 0.45, horizon - h * 1.05, cx + w, horizon + 1)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  // ------------------------------------------------------------- flats

  private flats(ctx: Ctx, cam: Camera, horizon: number): void {
    const { viewW: W, viewH: H } = cam
    // The city below, compressed into hazy bands. Detail here would only
    // compete with the melon.
    for (let band = 0; band < 3; band++) {
      const p = plane(cam, 0.12 + band * 0.055)
      const y = horizon + H * (0.055 + band * 0.05)
      ctx.save()
      ctx.globalAlpha = 0.42 - band * 0.08
      ctx.fillStyle = band === 0 ? PAL.flatsHaze : PAL.foliageFar
      ctx.fillRect(0, y, W, H)
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = 0.3 - band * 0.07
      ctx.fillStyle = PAL.flatsRoof
      const rnd = mulberry32(400 + band * 31)
      for (let i = 0; i < 60; i++) {
        const wx = -40 + rnd() * 220
        const x = p.x(wx)
        const w = 4 + rnd() * 14
        const h = 2 + rnd() * 7
        ctx.fillRect(x, y - h + rnd() * 8, w, h)
      }
      ctx.restore()
    }
  }

  // --------------------------------------------------- neighbour houses

  private neighbours(ctx: Ctx, cam: Camera): void {
    for (const r of this.backdrop.roofs) {
      const p = plane(cam, 0.34 + r.depth)
      const x = p.x(r.x)
      const y = p.y(r.y)
      const w = p.s(r.w)
      const h = p.s(r.h)
      if (x < -w * 2 || x > cam.viewW + w * 2) continue
      ctx.save()
      ctx.globalAlpha = 0.62
      ctx.fillStyle = '#8d8478'
      ctx.fillRect(x - w / 2, y, w, h * 2.2)
      ctx.fillStyle = '#5f5b52'
      ctx.beginPath()
      ctx.moveTo(x - w * 0.58, y)
      ctx.lineTo(x, y - h * r.pitch)
      ctx.lineTo(x + w * 0.58, y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }

  // ------------------------------------------------------ backdrop trees

  private backdropFoliage(ctx: Ctx, cam: Camera): void {
    for (const m of this.backdrop.masses) {
      const p = plane(cam, m.depth)
      const x = p.x(m.x)
      const y = p.y(m.y)
      const rx = p.s(m.rx)
      const ry = p.s(m.ry)
      if (x < -rx * 2 || x > cam.viewW + rx * 2) continue
      if (y < -ry * 2 || y > cam.viewH + ry * 2) continue
      const far = m.depth < 0.4
      ctx.save()
      ctx.globalAlpha = far ? 0.62 : 0.88
      const base = far ? PAL.foliageFar : PAL.foliageMid
      fillBlob(ctx, x, y, rx, ry, Math.floor(m.x * 977 + m.y * 31), base, 0.24)
      ctx.globalAlpha = far ? 0.2 : 0.35
      fillBlob(
        ctx,
        x + rx * 0.28, y - ry * 0.3,
        rx * 0.5, ry * 0.42,
        Math.floor(m.tone * 9999),
        far ? '#c9dcb2' : PAL.foliageRim, 0.3,
      )
      ctx.restore()
    }
  }

  // --------------------------------------------------------- the hillside

  private hillside(ctx: Ctx, cam: Camera): void {
    const p = plane(cam, 1)
    const pts = terrainPoints()
    ctx.beginPath()
    ctx.moveTo(p.x(pts[0][0]), p.y(pts[0][1]))
    for (let i = 1; i < pts.length; i++) ctx.lineTo(p.x(pts[i][0]), p.y(pts[i][1]))
    ctx.lineTo(p.x(pts[pts.length - 1][0]), cam.viewH + 100)
    ctx.lineTo(p.x(pts[0][0]), cam.viewH + 100)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, cam.sy(-6), 0, cam.sy(-34))
    g.addColorStop(0, '#4a5c3a')
    g.addColorStop(0.35, PAL.soil)
    g.addColorStop(1, PAL.soilShadow)
    ctx.fillStyle = g
    ctx.fill()

    // Undergrowth crowding the slope. Three bands, planted from the back of
    // the hill forward and each a little darker and larger, because a bare
    // fill of soil colour reads as a flat slab rather than a planted hillside.
    ctx.save()
    for (let band = 0; band < 3; band++) {
      const rnd = mulberry32(8181 + band * 4409)
      const lift = 2.6 - band * 1.1
      const count = 70 - band * 12
      const deep = band === 0 ? PAL.foliageMid : PAL.foliageDeep
      const mid = band === 0 ? PAL.foliageFar : band === 1 ? PAL.foliageMid : PAL.foliageNear
      for (let i = 0; i < count; i++) {
        const wx = -16 + rnd() * 82
        const wy = lerpTerrain(wx) + lift + rnd() * 2.4
        const x = p.x(wx)
        const y = p.y(wy)
        const r = p.s((0.7 + rnd() * 1.7) * (1 + band * 0.25))
        if (x < -r * 3 || x > cam.viewW + r * 3) continue
        if (y < -r * 3 || y > cam.viewH + r * 3) continue
        ctx.globalAlpha = band === 0 ? 0.85 : 1
        foliageClump(
          ctx, x, y, r, Math.floor(rnd() * 1e6),
          deep, mid, PAL.foliageRim,
          SUN.x > 0.5 ? 1 : -1, 1, band === 0 ? 0.3 : 0.6,
        )
      }
    }
    // A second pass hanging *below* the terrain line. Without it the ground
    // reads as a single flat wedge of soil with a fringe of bushes sitting on
    // top of it, which is the giveaway that it is a filled polygon.
    const under = mulberry32(5150)
    ctx.save()
    for (let i = 0; i < 90; i++) {
      const wx = -18 + rnd0(under) * 86
      const wy = lerpTerrain(wx) - rnd0(under) * 4.5
      const x = p.x(wx)
      const y = p.y(wy)
      const r = p.s(0.8 + rnd0(under) * 2.2)
      if (x < -r * 3 || x > cam.viewW + r * 3) continue
      if (y < -r * 3 || y > cam.viewH + r * 3) continue
      ctx.globalAlpha = 0.9
      foliageClump(
        ctx, x, y, r, Math.floor(rnd0(under) * 1e6),
        '#1b2a1e', PAL.foliageDeep, PAL.foliageNear, 1, 1, 0.25,
      )
    }
    ctx.restore()

  }

  // ------------------------------------------------------------- the pool

  private pool(ctx: Ctx, cam: Camera, t: number): void {
    const p = plane(cam, 1)
    const { pool } = WORLD

    // Paved apron, sitting on the hillside as a terrace with a retaining wall
    // under it rather than as a slab floating in the foliage.
    const patioTop = p.y(WORLD.patioY)
    const pl = p.x(WORLD.patioLeft)
    const pw = p.s(WORLD.patioRight - WORLD.patioLeft)
    ctx.fillStyle = PAL.patio
    ctx.fillRect(pl, patioTop, pw, p.s(0.42))
    ctx.fillStyle = '#8a5f49'
    ctx.fillRect(pl, patioTop + p.s(0.42), pw, p.s(3.2))
    ctx.save()
    ctx.globalAlpha = 0.28
    ctx.strokeStyle = '#5d3c2d'
    ctx.lineWidth = Math.max(1, p.s(0.03))
    for (let by = 0.42; by < 3.4; by += 0.42) {
      ctx.beginPath()
      ctx.moveTo(pl, patioTop + p.s(by))
      ctx.lineTo(pl + pw, patioTop + p.s(by))
      ctx.stroke()
    }
    ctx.restore()

    const left = p.x(pool.left)
    const right = p.x(pool.right)
    const surface = p.y(pool.surfaceY)
    const bottom = p.y(pool.surfaceY - pool.depth)
    const wallT = p.s(0.22)

    // Basin: plaster shell, then the water inside it.
    ctx.fillStyle = '#dfe7e2'
    ctx.fillRect(left - wallT, surface - p.s(0.4), right - left + wallT * 2, bottom - surface + p.s(0.4) + wallT)

    const g = ctx.createLinearGradient(0, surface, 0, bottom)
    g.addColorStop(0, '#7fd8cf')
    g.addColorStop(0.45, PAL.poolLight)
    g.addColorStop(1, PAL.poolDeep)
    ctx.fillStyle = g
    ctx.fillRect(left, surface, right - left, bottom - surface)

    // Caustics: slow diagonal nets of light on the floor, not vertical bars.
    ctx.save()
    ctx.beginPath()
    ctx.rect(left, surface, right - left, bottom - surface)
    ctx.clip()
    ctx.globalAlpha = 0.13
    ctx.strokeStyle = '#f2fffc'
    ctx.lineWidth = Math.max(1, p.s(0.04))
    for (let i = 0; i < 10; i++) {
      const phase = t * 0.5 + i * 0.9
      ctx.beginPath()
      for (let d = 0; d <= 10; d++) {
        const wy = pool.surfaceY - (d / 10) * pool.depth
        const wx = pool.left + ((i + 0.5) / 10) * (pool.right - pool.left)
          + Math.sin(phase + d * 0.55) * 0.55 + d * 0.16
        if (d === 0) ctx.moveTo(p.x(wx), p.y(wy))
        else ctx.lineTo(p.x(wx), p.y(wy))
      }
      ctx.stroke()
    }
    ctx.restore()

    // Waterline tile band and coping lip.
    ctx.fillStyle = '#4f9fb0'
    ctx.fillRect(left, surface, right - left, p.s(0.12))
    ctx.fillStyle = PAL.coping
    ctx.fillRect(left - p.s(0.62), p.y(WORLD.patioY), p.s(0.62), p.s(0.44))
    ctx.fillRect(right, p.y(WORLD.patioY), p.s(0.62), p.s(0.44))

    // Two loungers on the near coping, as in the reference photo.
    ctx.save()
    ctx.strokeStyle = '#e8e2d4'
    ctx.lineWidth = Math.max(1, p.s(0.05))
    ctx.lineCap = 'round'
    for (const lx of [WORLD.patioLeft + 0.9, WORLD.patioLeft + 2.3]) {
      const by = p.y(WORLD.patioY)
      ctx.beginPath()
      ctx.moveTo(p.x(lx), by)
      ctx.lineTo(p.x(lx + 0.95), by - p.s(0.28))
      ctx.lineTo(p.x(lx + 1.35), by - p.s(0.62))
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p.x(lx + 0.15), by)
      ctx.lineTo(p.x(lx + 0.15), by + p.s(0.28))
      ctx.moveTo(p.x(lx + 0.9), by - p.s(0.26))
      ctx.lineTo(p.x(lx + 0.9), by + p.s(0.28))
      ctx.stroke()
    }
    ctx.restore()

    // Surface line, rippling.
    ctx.save()
    ctx.strokeStyle = 'rgba(244,255,252,0.75)'
    ctx.lineWidth = Math.max(1.2, p.s(0.045))
    ctx.beginPath()
    for (let i = 0; i <= 40; i++) {
      const wx = lerp(pool.left, pool.right, i / 40)
      const wy = pool.surfaceY + poolRipple(wx, t)
      const px = p.x(wx)
      const py = p.y(wy)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.restore()

    // Planting spilling over both ends of the terrace. Drawn last so it
    // overlaps the coping — without something breaking those two hard
    // rectangular edges the whole pool reads as a slab hovering in the trees.
    const edge = mulberry32(2468)
    ctx.save()
    for (let i = 0; i < 34; i++) {
      const onLeft = i % 2 === 0
      const wx = onLeft
        ? WORLD.patioLeft - 3.4 + edge() * 4.2
        : WORLD.patioRight - 1.0 + edge() * 4.4
      const wy = WORLD.patioY - 1.4 + edge() * 3.2
      const r = p.s(0.8 + edge() * 1.9)
      const x = p.x(wx)
      const y = p.y(wy)
      if (x < -r * 2 || x > cam.viewW + r * 2) continue
      foliageClump(
        ctx, x, y, r, Math.floor(edge() * 1e6),
        PAL.foliageDeep, edge() < 0.35 ? PAL.foliageMid : PAL.foliageNear, PAL.foliageRim,
        1, 1, 0.5,
      )
    }
    ctx.restore()

    // The bullseye: a faint sun-lozenge floating dead centre of the water.
    const cx = (pool.left + pool.right) / 2
    ctx.save()
    ctx.globalAlpha = 0.3 + Math.sin(t * 1.6) * 0.06
    ctx.fillStyle = '#f4fffb'
    ctx.beginPath()
    ctx.ellipse(p.x(cx), surface + p.s(0.1), p.s(1.05), p.s(0.16), 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  // ------------------------------------------------------------- the trees

  private tree(ctx: Ctx, cam: Camera, tree: Tree, t: number): void {
    const p = plane(cam, 1)
    const sway = Math.sin(t * 0.7 + tree.x) * 0.05

    // Trunk, tapering, with a lit edge on the bay side.
    const topY = tree.baseY + tree.height
    ctx.beginPath()
    ctx.moveTo(p.x(tree.x - tree.trunkR), p.y(tree.baseY))
    ctx.lineTo(p.x(tree.x + tree.trunkR), p.y(tree.baseY))
    ctx.lineTo(p.x(tree.x + tree.trunkR * 0.34 + sway), p.y(topY))
    ctx.lineTo(p.x(tree.x - tree.trunkR * 0.34 + sway), p.y(topY))
    ctx.closePath()
    ctx.fillStyle = PAL.barkDark
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = PAL.barkLight
    ctx.fillRect(p.x(tree.x + tree.trunkR * 0.15), p.y(topY), p.s(tree.trunkR), p.s(tree.height))
    ctx.restore()

    // Bark striations.
    ctx.save()
    ctx.globalAlpha = 0.28
    ctx.strokeStyle = PAL.barkDark
    ctx.lineWidth = Math.max(1, p.s(0.02))
    const rnd = mulberry32(tree.seed)
    for (let i = 0; i < 12; i++) {
      const off = (rnd() - 0.5) * 1.6 * tree.trunkR
      const y0 = tree.baseY + rnd() * tree.height * 0.9
      const len = tree.height * (0.08 + rnd() * 0.22)
      inkLine(
        ctx,
        p.x(tree.x + off), p.y(y0),
        p.x(tree.x + off * 0.4 + sway), p.y(y0 + len),
        tree.seed + i, p.s(0.05), 4,
      )
    }
    ctx.restore()

    // Branches, back to front, with their foliage.
    for (const b of tree.branches) {
      ctx.strokeStyle = PAL.barkDark
      ctx.lineWidth = Math.max(1, p.s(b.r * 2))
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x(b.x1), p.y(b.y1))
      ctx.quadraticCurveTo(
        p.x(lerp(b.x1, b.x2, 0.5)), p.y(lerp(b.y1, b.y2, 0.5) + 0.12),
        p.x(b.x2 + sway), p.y(b.y2),
      )
      ctx.stroke()

      for (const puff of b.puffs) {
        const x = p.x(puff.x + sway * 1.6)
        const y = p.y(puff.y)
        const r = p.s(puff.r)
        if (x < -r * 2 || x > cam.viewW + r * 2) continue
        if (y < -r * 2 || y > cam.viewH + r * 2) continue
        foliageClump(
          ctx, x, y, r,
          Math.floor(puff.x * 731 + puff.y * 197) + tree.seed,
          PAL.foliageDeep, PAL.foliageNear, PAL.foliageRim,
          1, 1, 0.75,
        )
      }
    }
  }

  // ------------------------------------------------------------- the house

  /** Windows punched into a wall, with the bay reflected back out of them. */
  private glazing(ctx: Ctx, cam: Camera, x0: number, y0: number, x1: number, y1: number, mullions: number): void {
    const p = plane(cam, 1)
    ctx.fillStyle = PAL.glass
    ctx.fillRect(p.x(x0), p.y(y0), p.s(x1 - x0), p.s(y0 - y1))
    ctx.save()
    ctx.globalAlpha = 0.32
    const g = ctx.createLinearGradient(p.x(x0), p.y(y0), p.x(x1), p.y(y1))
    g.addColorStop(0, '#dff0f6')
    g.addColorStop(0.55, 'rgba(255,255,255,0.05)')
    g.addColorStop(1, '#c2d8de')
    ctx.fillStyle = g
    ctx.fillRect(p.x(x0), p.y(y0), p.s(x1 - x0), p.s(y0 - y1))
    ctx.restore()
    ctx.fillStyle = PAL.houseTrim
    const w = Math.max(1, p.s(0.13))
    for (let i = 0; i <= mullions; i++) {
      const fx = lerp(x0, x1, i / mullions)
      ctx.fillRect(p.x(fx) - w / 2, p.y(y0), w, p.s(y0 - y1))
    }
    ctx.fillRect(p.x(x0), p.y(y0), p.s(x1 - x0), w)
    ctx.fillRect(p.x(x0), p.y(y1) - w, p.s(x1 - x0), w)
  }

  /**
   * Three storeys of it, which is the entire premise — the drop has to be
   * legible as a building you could fall off, not a platform floating in
   * space. Each storey steps back into the hill, as the reference house does.
   */
  private house(ctx: Ctx, cam: Camera): void {
    const p = plane(cam, 1)
    const deckY = -1.15
    const backX = -9.6

    // --- lower two storeys, stepping back into the slope
    const storeys: [number, number, number][] = [
      // [front x, top y, bottom y]
      [0.5, -1.9, -5.3],
      [-0.1, -5.3, WORLD.houseBaseY],
    ]
    for (const [frontX, top, bot] of storeys) {
      ctx.fillStyle = PAL.houseWall
      ctx.fillRect(p.x(backX), p.y(top), p.s(frontX - backX), p.s(top - bot))
      // Board-and-batten shadow lines.
      ctx.save()
      ctx.globalAlpha = 0.16
      ctx.strokeStyle = PAL.barkDark
      ctx.lineWidth = Math.max(1, p.s(0.03))
      for (let bx = backX + 0.5; bx < frontX; bx += 0.7) {
        ctx.beginPath()
        ctx.moveTo(p.x(bx), p.y(top))
        ctx.lineTo(p.x(bx), p.y(bot))
        ctx.stroke()
      }
      ctx.restore()
      this.glazing(ctx, cam, frontX - 3.4, top - 0.5, frontX - 0.5, bot + 0.9, 3)
      // Floor band between storeys.
      ctx.fillStyle = PAL.deckShade
      ctx.fillRect(p.x(backX), p.y(top), p.s(frontX - backX), p.s(0.3))
    }

    // Posts carrying the cantilevered deck down to grade.
    ctx.fillStyle = PAL.barkDark
    for (const px of [0.55, -2.4]) {
      ctx.fillRect(p.x(px), p.y(deckY), p.s(0.22), p.s(deckY - WORLD.houseBaseY))
    }

    // --- top storey: the one you are standing on
    const wallX = -2.6
    ctx.fillStyle = PAL.houseWall
    ctx.fillRect(p.x(backX), p.y(3.55), p.s(wallX - backX), p.s(3.55 - deckY))
    this.glazing(ctx, cam, -8.4, 2.62, wallX - 0.35, deckY + 0.08, 3)

    // --- the low shed roof
    // The overhang stops just short of the rail, the way it does in the
    // reference. Its underside is still a collider, so a wild enough lob puts
    // the melon into your own roof, but the corridor that actually shapes
    // every throw is the rail below.
    const eaveOuter = 1.0
    ctx.fillStyle = PAL.deckShade
    ctx.beginPath()
    ctx.moveTo(p.x(backX), p.y(4.3))
    ctx.lineTo(p.x(eaveOuter), p.y(3.12))
    ctx.lineTo(p.x(eaveOuter), p.y(2.78))
    ctx.lineTo(p.x(backX), p.y(3.96))
    ctx.closePath()
    ctx.fill()
    // Fascia board on the outer edge, so the roof reads as having thickness.
    ctx.fillStyle = PAL.barkDark
    ctx.fillRect(p.x(eaveOuter - 0.13), p.y(3.12), p.s(0.26), p.s(0.36))
    // Soffit shadow, only across the strip of deck actually under the roof.
    ctx.save()
    ctx.globalAlpha = 0.2
    ctx.fillStyle = '#150f0a'
    ctx.beginPath()
    ctx.moveTo(p.x(wallX), p.y(3.62))
    ctx.lineTo(p.x(eaveOuter), p.y(2.78))
    ctx.lineTo(p.x(eaveOuter), p.y(2.5))
    ctx.lineTo(p.x(wallX), p.y(3.34))
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // Deck boards running away from you.
    const deckTop = p.y(deckY)
    ctx.fillStyle = PAL.deck
    ctx.fillRect(p.x(backX), deckTop, p.s(WORLD.railX - backX), p.s(0.75))
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = PAL.deckLine
    ctx.lineWidth = Math.max(1, p.s(0.02))
    for (let i = 0; i < 7; i++) {
      const y = deckTop + p.s(0.1 + i * 0.115)
      ctx.beginPath()
      ctx.moveTo(p.x(backX), y)
      ctx.lineTo(p.x(WORLD.railX), y)
      ctx.stroke()
    }
    ctx.restore()
    ctx.fillStyle = PAL.deckShade
    ctx.fillRect(p.x(backX), deckTop + p.s(0.75), p.s(WORLD.railX - backX), p.s(0.5))

    // Rail: cap, bottom rail, and the thin balusters from the photos.
    const capY = p.y(WORLD.railTop)
    ctx.save()
    ctx.strokeStyle = '#2f2119'
    ctx.lineWidth = Math.max(1, p.s(0.035))
    for (let bx = backX + 0.2; bx <= WORLD.railX; bx += 0.16) {
      ctx.beginPath()
      ctx.moveTo(p.x(bx), capY + p.s(0.1))
      ctx.lineTo(p.x(bx), deckTop)
      ctx.stroke()
    }
    ctx.restore()
    ctx.fillStyle = PAL.deckShade
    ctx.fillRect(p.x(backX), capY, p.s(WORLD.railX - backX + 0.18), p.s(0.16))
    ctx.fillStyle = PAL.deck
    ctx.fillRect(p.x(backX), capY, p.s(WORLD.railX - backX + 0.18), p.s(0.05))
  }

  // ------------------------------------------- out-of-focus framing leaves

  private foreground(ctx: Ctx, cam: Camera, t: number): void {
    const p = plane(cam, 1.42)
    const rnd = mulberry32(777)
    const supportsBlur = typeof ctx.filter === 'string'
    ctx.save()
    if (supportsBlur) ctx.filter = 'blur(9px)'
    ctx.globalAlpha = 0.75
    for (let i = 0; i < 16; i++) {
      const wx = 2 + rnd() * 46
      const wy = -2 - rnd() * 26
      const sway = Math.sin(t * 0.55 + i) * 0.22
      const x = p.x(wx + sway)
      const y = p.y(wy)
      const r = p.s(1.4 + rnd() * 2.6)
      // Only keep the ones hugging the edges of frame; centre clutter is rude.
      const edge = Math.min(x, cam.viewW - x) / cam.viewW
      if (edge > 0.16) continue
      blobPath(ctx, x, y, r, r * 0.8, i * 91, 0.3)
      ctx.fillStyle = i % 3 === 0 ? PAL.foliageDeep : '#1e3324'
      ctx.fill()
    }
    ctx.restore()
  }

  /** Everything behind the actors. */
  drawBack(ctx: Ctx, cam: Camera, t: number): void {
    const horizon = this.sky(ctx, cam)
    this.bay(ctx, cam, horizon, t)
    this.flats(ctx, cam, horizon)
    this.neighbours(ctx, cam)
    this.backdropFoliage(ctx, cam)
    this.hillside(ctx, cam)
    this.pool(ctx, cam, t)
    for (const tree of this.trees) {
      if (tree.kind === 'redwood') this.tree(ctx, cam, tree, t)
    }
    this.house(ctx, cam)
  }

  /**
   * Everything in front of the actors — the oak that leans out over the pool,
   * and the blurred leaves framing the shot. Drawing the oak last is what sells
   * the depth of the drop.
   */
  drawFront(ctx: Ctx, cam: Camera, t: number): void {
    for (const tree of this.trees) {
      if (tree.kind === 'oak') this.tree(ctx, cam, tree, t)
    }
    this.foreground(ctx, cam, t)
  }

  /** Slim light shafts through the canopy. Cheap, and it makes the air read. */
  godRays(ctx: Ctx, cam: Camera, t: number): void {
    const { viewW: W, viewH: H } = cam
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    const rnd = mulberry32(313)
    for (let i = 0; i < 5; i++) {
      const x = W * (0.15 + rnd() * 0.8) + Math.sin(t * 0.15 + i) * 20
      const w = 30 + rnd() * 90
      const g = ctx.createLinearGradient(x, 0, x - H * 0.35, H)
      g.addColorStop(0, `rgba(255, 238, 200, ${0.022 + rnd() * 0.028})`)
      g.addColorStop(1, 'rgba(255, 238, 200, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(x, -10)
      ctx.lineTo(x + w, -10)
      ctx.lineTo(x + w - H * 0.35, H + 10)
      ctx.lineTo(x - H * 0.35, H + 10)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }
}

/** Pulls the next value from a seeded generator; keeps the passes readable. */
function rnd0(gen: () => number): number {
  return gen()
}

/** Local copy of terrainY to avoid a circular import in the undergrowth pass. */
function lerpTerrain(x: number): number {
  const pts = terrainPoints()
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    if (x <= bx) return lerp(ay, by, clamp((x - ax) / (bx - ax), 0, 1))
  }
  return pts[pts.length - 1][1]
}
