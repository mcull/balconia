import { THROW } from './config'
import { approach, clamp, lerp, noise1, remap, TAU } from '../util/math'

export interface ThrowResult {
  /** Direction the melon leaves, in world radians (0 = downhill, +y up). */
  angle: number
  /** 0..1 fraction of a full wind-up. */
  power: number
  /** Melon spin at release, rad/s. Positive is backspin. */
  spin: number
}

interface Sample { a: number; t: number }

/**
 * One gesture, three axes.
 *
 *  - Where you drag sets the line. It is a slingshot: pull back and down, the
 *    melon goes forward and up.
 *  - How long you hold sets the power. It ramps on its own; you are choosing a
 *    moment, not a distance.
 *  - How you *curl* your wrist in the last instant sets the spin. Backspin
 *    floats the melon out over the trees, topspin drops it short and steep.
 *
 * The aim reads a smoothed version of the drag direction while the spin reads
 * the instantaneous rotation rate, so a flick at the end adds spin without
 * throwing your line away.
 */
export class ThrowController {
  active = false
  /** Seconds held. */
  held = 0
  /** Smoothed aim, world radians. */
  angle = Math.PI * 0.16
  /** Rotation rate of the drag vector, rad/s. */
  curl = 0
  fumbled = false
  /** True once the pull has passed the minimum distance to count. */
  committed = false

  private anchorX = 0
  private anchorY = 0
  private pointerX = 0
  private pointerY = 0
  private rawAngle = this.angle
  private samples: Sample[] = []
  private keyAngle = Math.PI * 0.16
  private keySpin = 0
  private keyboard = false
  private wobbleClock = 0

  /** 0..1, saturating at a full wind-up. */
  get power(): number {
    return clamp(this.held / THROW.chargeTime, 0, 1)
  }

  /** 0..1 measure of how badly your arm is shaking. */
  get shake(): number {
    const f = this.held / THROW.chargeTime
    return remap(f, THROW.steadyFraction, THROW.fumbleAt, 0, 1)
  }

  /** How close you are to dropping it. 1 = gone. */
  get fumbleProgress(): number {
    return clamp(this.held / (THROW.chargeTime * THROW.fumbleAt), 0, 1)
  }

  /** Live aim including the shake, which is what actually gets thrown. */
  get aimAngle(): number {
    const s = this.shake
    if (s <= 0) return this.angle
    const j =
      noise1(this.wobbleClock * 11, 4242) * 0.62 + noise1(this.wobbleClock * 27, 991) * 0.38
    return this.angle + j * s * s * THROW.maxWobble
  }

  /** Spin the melon would leave with right now. */
  get spin(): number {
    if (this.keyboard) return clamp(this.keySpin, -THROW.maxSpin, THROW.maxSpin)
    return clamp(this.curl * THROW.spinGain, -THROW.maxSpin, THROW.maxSpin)
  }

  beginPointer(x: number, y: number): void {
    this.keyboard = false
    this.active = true
    this.committed = false
    this.fumbled = false
    this.held = 0
    this.anchorX = x
    this.anchorY = y
    this.pointerX = x
    this.pointerY = y
    this.samples.length = 0
    this.curl = 0
  }

  movePointer(x: number, y: number): void {
    this.pointerX = x
    this.pointerY = y
  }

  beginKeyboard(): void {
    this.keyboard = true
    this.active = true
    this.committed = true
    this.fumbled = false
    this.held = 0
    this.curl = 0
    this.angle = this.keyAngle
  }

  /** Arrow keys / A-D nudge the line; Q-E load spin. */
  nudge(dAngle: number, dSpin: number): void {
    this.keyboard = true
    this.keyAngle = clamp(this.keyAngle + dAngle, -0.5, 1.45)
    this.keySpin = clamp(this.keySpin + dSpin, -THROW.maxSpin, THROW.maxSpin)
    if (!this.active) this.angle = this.keyAngle
  }

  get keyboardMode(): boolean {
    return this.keyboard
  }

  get pull(): { dx: number; dy: number; len: number } {
    const dx = this.anchorX - this.pointerX
    const dy = this.anchorY - this.pointerY
    return { dx, dy, len: Math.hypot(dx, dy) }
  }

  update(dt: number): void {
    this.wobbleClock += dt
    if (!this.active) {
      this.curl = approach(this.curl, 0, 8, dt)
      return
    }

    if (!this.keyboard) {
      const { dx, dy, len } = this.pull
      this.committed = len >= THROW.minPull
      if (this.committed) {
        // Screen y is down, world y is up: negate to get the world heading.
        const a = Math.atan2(-dy, dx)
        // Unwrap so the smoothed angle never takes the long way round.
        let delta = a - this.rawAngle
        while (delta > Math.PI) delta -= TAU
        while (delta < -Math.PI) delta += TAU
        this.rawAngle += delta

        const now = this.held
        this.samples.push({ a: this.rawAngle, t: now })
        while (this.samples.length > 2 && now - this.samples[0].t > 0.13) this.samples.shift()

        const first = this.samples[0]
        const span = now - first.t
        this.curl = span > 1e-3 ? (this.rawAngle - first.a) / span : 0

        // Aim tracks the pull, but how closely depends on how fast the pull is
        // rotating. Move deliberately and the line follows you one to one;
        // whip the pointer round and the line barely moves, so the flick
        // registers as spin instead of wrecking the shot you had lined up.
        // Without this the two axes fight: a decent flick dragged the aim
        // eighteen degrees, which is more than the whole target is wide.
        const rate = lerp(14, 0.55, clamp(Math.abs(this.curl) / 4, 0, 1))
        this.angle = approach(this.angle, this.rawAngle, rate, dt)
      }
    } else {
      this.angle = this.keyAngle
    }

    // The wind-up only runs once you have actually pulled back. Resting a
    // finger on the button while you read the screen is not a loaded throw,
    // and it must never cost you a melon — there is no charge ring on screen
    // yet to warn you.
    if (this.committed) this.held += dt

    if (this.held >= THROW.chargeTime * THROW.fumbleAt) this.fumbled = true
  }

  /** Ends the gesture and reports what was thrown, or null if nothing was. */
  release(): ThrowResult | null {
    if (!this.active) return null
    const result: ThrowResult | null =
      this.committed && !this.fumbled
        ? { angle: this.aimAngle, power: this.power, spin: this.spin }
        : null
    this.reset()
    if (this.keyboard) this.keySpin = 0
    return result
  }

  cancel(): void {
    this.reset()
  }

  /**
   * Clears the gesture completely. `fumbled` in particular has to be cleared
   * here: the game checks it every frame while aiming, so leaving it set makes
   * every remaining melon drop on the spot with no input at all.
   */
  private reset(): void {
    this.active = false
    this.committed = false
    this.fumbled = false
    this.held = 0
    this.samples.length = 0
    this.curl = 0
  }
}

/** The fastest your arm can move a weightless object, at a given strength. */
export function armSpeed(strength: number): number {
  return Math.min(THROW.armSpeedCap, THROW.armSpeedBase + strength * THROW.armSpeedPerStrength)
}

/**
 * Release speed from strength and melon mass. Whichever limit binds first
 * wins: light melons top out at arm speed, heavy ones at the impulse you can
 * deliver. The crossover sits right around the Crimson Sweet, so the moment
 * you pick up a Carolina Cross you feel your arm give out.
 */
export function releaseSpeed(power: number, strength: number, mass: number): number {
  const impulse = THROW.baseImpulse + strength * THROW.impulsePerStrength
  return Math.min(impulse / mass, armSpeed(strength)) * power
}
