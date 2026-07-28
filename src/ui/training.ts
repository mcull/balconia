import { THROW } from '../core/config'
import { EXERCISE_NAMES, type Level } from '../core/levels'
import { clamp, lerp, TAU } from '../util/math'
import { PAL } from '../render/palette'
import { label, roundRect } from '../render/painter'

/**
 * "Do exercises to get strong enough to throw the melons far enough."
 *
 * A needle sweeps a bar; you rep on the beat. Clean reps in the zone add
 * strength, which raises both the impulse you can deliver and the top speed
 * your arm can reach — the two numbers that decide whether the pool is even in
 * range. It is short on purpose. It is a warm-up, not a second game.
 */
export class Training {
  private level: Level | null = null
  /** Reps attempted so far. */
  private rep = 0
  private hits = 0
  private needle = 0
  private dir = 1
  private speed = 1.1
  private zone = 0.22
  private flash = 0
  private flashGood = false
  private introTimer = 0
  private doneTimer = 0
  gained = 0
  active = false
  finished = false

  /** Animation phase for the kid doing the exercise. */
  phase = 0

  start(level: Level): void {
    this.level = level
    this.rep = 0
    this.hits = 0
    this.needle = 0
    this.dir = 1
    this.speed = 1.05
    this.zone = 0.24
    this.flash = 0
    this.gained = 0
    this.active = true
    this.finished = false
    this.introTimer = 1.5
    this.doneTimer = 0
    this.phase = 0
  }

  get exerciseName(): string {
    return this.level ? EXERCISE_NAMES[this.level.exercise] : ''
  }

  get exerciseKind(): Level['exercise'] {
    return this.level?.exercise ?? 'pushup'
  }

  get repsLeft(): number {
    return this.level ? this.level.reps - this.rep : 0
  }

  update(dt: number, onTick: (strong: boolean) => void): void {
    if (!this.active || !this.level) return
    this.flash = Math.max(0, this.flash - dt * 2.6)

    if (this.introTimer > 0) {
      this.introTimer -= dt
      return
    }
    if (this.finished) {
      this.doneTimer += dt
      return
    }

    const prev = this.needle
    this.needle += this.dir * this.speed * dt
    if (this.needle >= 1) { this.needle = 1; this.dir = -1 }
    if (this.needle <= -1) { this.needle = -1; this.dir = 1 }
    // Click at the ends of the sweep, so there is a beat to move to.
    if (Math.sign(prev) !== Math.sign(this.needle) && Math.abs(this.needle) < 0.5) onTick(true)

    this.phase += dt * this.speed * Math.PI
  }

  /** One rep. Returns true if it was clean. */
  attempt(): boolean {
    if (!this.active || !this.level || this.finished || this.introTimer > 0) return false
    const good = Math.abs(this.needle) <= this.zone
    this.rep++
    this.flash = 1
    this.flashGood = good
    if (good) {
      this.hits++
      this.gained += THROW.strengthPerRep
    }
    // Every rep the bar gets faster and the window tighter.
    this.speed = Math.min(3.1, this.speed * 1.13)
    this.zone = Math.max(0.075, this.zone * 0.9)
    if (this.rep >= this.level.reps) {
      // A flawless set is worth an extra rep's strength.
      if (this.hits === this.level.reps) this.gained += THROW.strengthPerRep
      this.finished = true
    }
    return good
  }

  /** True once the player can move on. */
  get readyToLeave(): boolean {
    return this.finished && this.doneTimer > 0.85
  }

  dismiss(): void {
    this.active = false
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number): void {
    if (!this.active || !this.level) return

    const cardW = Math.min(560, w * 0.86)
    const cardH = 260
    const cx = w / 2
    const cy = h * 0.72

    ctx.save()
    // Card.
    ctx.globalAlpha = 0.93
    ctx.fillStyle = 'rgba(28, 22, 16, 0.82)'
    roundRect(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH, 18)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(240, 226, 198, 0.25)'
    ctx.lineWidth = 1
    ctx.stroke()

    label(ctx, this.level.name.toUpperCase(), cx, cy - cardH / 2 + 34, 15, 'rgba(238,226,200,0.6)', 'center')
    label(ctx, this.exerciseName, cx, cy - cardH / 2 + 68, 30, PAL.paper, 'center', '600')

    if (this.introTimer > 0) {
      label(ctx, this.level.note, cx, cy - 6, 16, 'rgba(238,226,200,0.75)', 'center')
      label(
        ctx,
        'Tap on the beat when the needle is in the light.',
        cx, cy + 26, 15, 'rgba(238,226,200,0.5)', 'center',
      )
      ctx.restore()
      return
    }

    // The bar.
    const barW = cardW - 88
    const barH = 26
    const bx = cx - barW / 2
    const by = cy - 6

    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    roundRect(ctx, bx, by, barW, barH, barH / 2)
    ctx.fill()

    // Target zone.
    const zw = barW * this.zone
    const zg = ctx.createLinearGradient(cx - zw, 0, cx + zw, 0)
    zg.addColorStop(0, 'rgba(255, 226, 150, 0.06)')
    zg.addColorStop(0.5, 'rgba(255, 232, 168, 0.85)')
    zg.addColorStop(1, 'rgba(255, 226, 150, 0.06)')
    ctx.fillStyle = zg
    roundRect(ctx, cx - zw, by + 2, zw * 2, barH - 4, (barH - 4) / 2)
    ctx.fill()

    // Needle.
    const nx = cx + (this.needle * barW) / 2
    ctx.fillStyle = PAL.paper
    roundRect(ctx, nx - 2.5, by - 7, 5, barH + 14, 2.5)
    ctx.fill()

    // Rep pips.
    const total = this.level.reps
    for (let i = 0; i < total; i++) {
      const px = cx - (total - 1) * 11 + i * 22
      ctx.beginPath()
      ctx.arc(px, by + barH + 30, 5.5, 0, TAU)
      ctx.fillStyle = i < this.hits ? '#8fd694' : i < this.rep ? '#8a5a52' : 'rgba(240,226,198,0.22)'
      ctx.fill()
    }

    // Strength readout, live.
    const shown = strength + this.gained
    label(ctx, 'ARM', cx - cardW / 2 + 34, cy + cardH / 2 - 26, 13, 'rgba(238,226,200,0.5)')
    const mW = cardW - 150
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    roundRect(ctx, cx - cardW / 2 + 76, cy + cardH / 2 - 36, mW, 10, 5)
    ctx.fill()
    ctx.fillStyle = '#e6b95f'
    roundRect(ctx, cx - cardW / 2 + 76, cy + cardH / 2 - 36, mW * clamp(shown / 22, 0.02, 1), 10, 5)
    ctx.fill()
    label(ctx, shown.toFixed(1), cx + cardW / 2 - 34, cy + cardH / 2 - 26, 15, PAL.paper, 'right')

    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.5
      label(
        ctx, this.flashGood ? 'clean' : 'off the beat',
        cx, by - 22, 17, this.flashGood ? '#a8e5ac' : '#e0917f', 'center',
      )
      ctx.globalAlpha = 1
    }

    if (this.finished) {
      const a = clamp(this.doneTimer * 2, 0, 1)
      ctx.globalAlpha = a
      label(
        ctx,
        this.hits === total ? `Perfect set.  +${this.gained.toFixed(1)} arm` : `+${this.gained.toFixed(1)} arm`,
        cx, by - 22, 19, '#ffe6a8', 'center', '600',
      )
      if (this.readyToLeave) {
        ctx.globalAlpha = 0.55 + Math.sin(this.doneTimer * 4) * 0.2
        label(ctx, 'press anything to throw', cx, cy + cardH / 2 + 32, 15, PAL.paper, 'center')
      }
      ctx.globalAlpha = 1
    }

    ctx.restore()
  }

  /** Where to draw the sparkle when a rep lands, in screen space. */
  flashPoint(w: number, h: number): { x: number; y: number } {
    return { x: w / 2, y: h * 0.72 - 6 }
  }

  /** Eases the exercise animation for the thrower drawing. */
  poseBlend(): number {
    return lerp(0, 1, clamp(this.introTimer <= 0 ? 1 : 0, 0, 1))
  }
}
