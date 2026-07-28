import { clamp } from '../util/math'

/**
 * Everything you hear is synthesised at runtime — there is not a single audio
 * file in this repo. Noise through a moving filter turns out to be a very good
 * splash, and a couple of detuned sines make a passable squirrel.
 */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private windGain: GainNode | null = null
  private windFilter: BiquadFilterNode | null = null
  muted = false

  /** Must be called from inside a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)
    this.master = master

    // Two seconds of white noise, reused for every noisy sound in the game.
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.noiseBuf = buf

    this.startWindBed()
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55
    return this.muted
  }

  private noise(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null
    const s = this.ctx.createBufferSource()
    s.buffer = this.noiseBuf
    s.loop = true
    return s
  }

  /** A permanent bed of hillside wind, opened up when the gusts pick up. */
  private startWindBed(): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const src = this.noise()
    if (!src) return
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 420
    filter.Q.value = 0.55
    const gain = ctx.createGain()
    gain.gain.value = 0.02
    src.connect(filter).connect(gain).connect(this.master)
    src.start()
    this.windGain = gain
    this.windFilter = filter
  }

  /** Called every frame with the current wind speed so the bed breathes. */
  setWind(speed: number): void {
    if (!this.ctx || !this.windGain || !this.windFilter) return
    const s = clamp(Math.abs(speed) / 6, 0, 1)
    const now = this.ctx.currentTime
    this.windGain.gain.setTargetAtTime(0.012 + s * 0.05, now, 0.4)
    this.windFilter.frequency.setTargetAtTime(320 + s * 620, now, 0.4)
  }

  private env(node: AudioNode, peak: number, attack: number, decay: number): GainNode | null {
    if (!this.ctx || !this.master) return null
    const g = this.ctx.createGain()
    const now = this.ctx.currentTime
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay)
    node.connect(g).connect(this.master)
    return g
  }

  /** Melon leaving your hands: a short air-rip whose pitch tracks power. */
  throwWhoosh(power: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const src = this.noise()
    if (!src) return
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.4
    const now = ctx.currentTime
    f.frequency.setValueAtTime(320, now)
    f.frequency.exponentialRampToValueAtTime(320 + power * 1900, now + 0.09)
    f.frequency.exponentialRampToValueAtTime(240, now + 0.34)
    src.connect(f)
    this.env(f, 0.13 + power * 0.16, 0.02, 0.32)
    src.start(now)
    src.stop(now + 0.4)
  }

  /** Melon through pine needles. */
  rustle(speed: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const src = this.noise()
    if (!src) return
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 1800
    src.connect(f)
    this.env(f, clamp(speed / 20, 0.05, 0.3), 0.005, 0.22)
    const now = ctx.currentTime
    src.start(now)
    src.stop(now + 0.3)
  }

  /** Melon off solid wood. */
  knock(speed: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    const now = ctx.currentTime
    osc.frequency.setValueAtTime(180, now)
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.12)
    this.env(osc, clamp(speed / 24, 0.06, 0.34), 0.004, 0.16)
    osc.start(now)
    osc.stop(now + 0.24)
  }

  /** The good one. A hard plunge, then the water closing over it. */
  splash(speed: number, steepness: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const power = clamp(speed / 16, 0.25, 1.4)
    const now = ctx.currentTime

    const src = this.noise()
    if (src) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(280, now)
      f.frequency.exponentialRampToValueAtTime(4200 * (0.5 + steepness), now + 0.06)
      f.frequency.exponentialRampToValueAtTime(500, now + 0.7)
      src.connect(f)
      this.env(f, 0.2 + power * 0.35, 0.012, 0.8)
      src.start(now)
      src.stop(now + 0.95)
    }

    // The hollow "bloop" of the cavity collapsing behind the melon.
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(520 * (0.7 + steepness * 0.6), now + 0.02)
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.3)
    this.env(osc, 0.12 + power * 0.14, 0.02, 0.3)
    osc.start(now + 0.02)
    osc.stop(now + 0.4)
  }

  /** Melon meeting brick. */
  splat(speed: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const src = this.noise()
    if (src) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(1400, now)
      f.frequency.exponentialRampToValueAtTime(180, now + 0.22)
      src.connect(f)
      this.env(f, clamp(speed / 15, 0.1, 0.45), 0.004, 0.3)
      src.start(now)
      src.stop(now + 0.4)
    }
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, now)
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.18)
    this.env(osc, 0.22, 0.004, 0.2)
    osc.start(now)
    osc.stop(now + 0.3)
  }

  /** Squirrel. Angry, or delighted — same sound either way. */
  chitter(): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      const t0 = now + i * 0.052
      const f0 = 1500 + Math.random() * 900
      osc.frequency.setValueAtTime(f0, t0)
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t0 + 0.035)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04)
      osc.connect(g)
      if (this.master) g.connect(this.master)
      osc.start(t0)
      osc.stop(t0 + 0.06)
    }
  }

  /** Score pop. Rises with the combo so a streak sounds like a streak. */
  ping(step = 0): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19]
    const semi = scale[Math.min(step, scale.length - 1)]
    const freq = 523.25 * Math.pow(2, semi / 12)
    for (const [mul, gain, dec] of [[1, 0.15, 0.7], [2, 0.05, 0.45], [3, 0.025, 0.3]] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq * mul
      this.env(osc, gain, 0.008, dec)
      osc.start(now)
      osc.stop(now + dec + 0.1)
    }
  }

  /** Metronome click for the training minigame. */
  tick(strong = false): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = strong ? 880 : 620
    this.env(osc, strong ? 0.09 : 0.05, 0.002, 0.05)
    osc.start(now)
    osc.stop(now + 0.08)
  }

  /** A dud: the fumble, the roof, the miss. */
  buzz(): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(190, now)
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.28)
    this.env(osc, 0.09, 0.01, 0.3)
    osc.start(now)
    osc.stop(now + 0.4)
  }
}
