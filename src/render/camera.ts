import { approach, clamp, noise1 } from '../util/math'

/** A uniform-scale 2D camera. World +y is up; screen +y is down. */
export class Camera {
  x = 4
  y = -3
  /** Pixels per metre. */
  zoom = 26

  private targetX = 4
  private targetY = -3
  private targetZoom = 26
  private shake = 0
  private shakeClock = 0

  viewW = 1
  viewH = 1

  resize(w: number, h: number): void {
    this.viewW = w
    this.viewH = h
  }

  /** Frame a world-space box with a margin, in metres. */
  frame(x0: number, y0: number, x1: number, y1: number, margin: number, maxZoom = 46): void {
    const w = Math.max(1, x1 - x0) + margin * 2
    const h = Math.max(1, y1 - y0) + margin * 2
    const z = Math.min(this.viewW / w, this.viewH / h)
    this.targetZoom = clamp(z, 6, maxZoom)
    this.targetX = (x0 + x1) / 2
    this.targetY = (y0 + y1) / 2
  }

  snap(): void {
    this.x = this.targetX
    this.y = this.targetY
    this.zoom = this.targetZoom
  }

  kick(amount: number): void {
    this.shake = Math.min(1.4, this.shake + amount)
  }

  update(dt: number, responsiveness = 4.2): void {
    this.x = approach(this.x, this.targetX, responsiveness, dt)
    this.y = approach(this.y, this.targetY, responsiveness, dt)
    // Zoom eases more slowly than pan, which keeps long flights from feeling seasick.
    this.zoom = approach(this.zoom, this.targetZoom, responsiveness * 0.62, dt)
    this.shake = approach(this.shake, 0, 5.5, dt)
    this.shakeClock += dt
  }

  private get ox(): number {
    return this.shake < 0.001 ? 0 : noise1(this.shakeClock * 34, 17) * this.shake * 13
  }
  private get oy(): number {
    return this.shake < 0.001 ? 0 : noise1(this.shakeClock * 41, 83) * this.shake * 13
  }

  sx(wx: number): number {
    return (wx - this.x) * this.zoom + this.viewW / 2 + this.ox
  }
  sy(wy: number): number {
    return this.viewH / 2 - (wy - this.y) * this.zoom + this.oy
  }
  /** Metres to pixels. */
  s(m: number): number {
    return m * this.zoom
  }

  /** Screen point back to world, used for pointer-driven aiming aids. */
  toWorldX(px: number): number {
    return (px - this.viewW / 2 - this.ox) / this.zoom + this.x
  }
  toWorldY(py: number): number {
    return (this.viewH / 2 + this.oy - py) / this.zoom + this.y
  }
}
