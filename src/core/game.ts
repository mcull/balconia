import { Sfx } from '../audio/sfx'
import { Camera } from '../render/camera'
import { Particles } from '../render/particles'
import { SceneRenderer } from '../render/scene'
import { drawMelon, drawSquirrel, drawThrower, heldMelonPos, drawMelonShape, type ThrowerPose } from '../render/actors'
import { applyGrain, label, roundRect, vignette } from '../render/painter'
import {
  drawAim, drawCard, drawStatus, drawTitle, drawToasts, drawWind,
  type AimInfo, type Toast,
} from '../render/hud'
import { Training } from '../ui/training'
import { MELONS, SCORING, THROW, WORLD } from './config'
import { LEVELS, type Level } from './levels'
import { makeMelon, previewArc, stepMelon, type Melon, type PhysEvent } from './physics'
import {
  collectNearMisses, placeSquirrels, resetSquirrelsForThrow, stepSquirrels,
  type Squirrel, type SquirrelEvent,
} from './squirrel'
import { ThrowController, releaseSpeed } from './throwInput'
import { buildBackdrop, buildTrees, poolCentreX, setWindScale, windAt, type Tree } from './world'
import { approach, clamp } from '../util/math'

type Phase = 'title' | 'training' | 'aim' | 'flight' | 'settle' | 'levelCard' | 'failCard' | 'finale'

export class Game {
  private trees: Tree[] = buildTrees()
  private scene = new SceneRenderer(this.trees, buildBackdrop())
  cam = new Camera()
  private fx = new Particles()
  private sfx = new Sfx()
  private training = new Training()
  private ctl = new ThrowController()

  private phase: Phase = 'title'
  private t = 0
  private phaseTime = 0
  private timeScale = 1
  private targetTimeScale = 1

  private levelIndex = 0
  private strength = THROW.startStrength
  private score = 0
  private landed = 0
  private combo = 0
  private bestCombo = 0
  private melonsLeft = 0
  private selected = 0
  private squirrels: Squirrel[] = []
  private melon: Melon | null = null
  private toasts: Toast[] = []

  private physEvents: PhysEvent[] = []
  private sqEvents: SquirrelEvent[] = []
  private pointer: { x: number; y: number } | null = null
  private anchor: { x: number; y: number } | null = null
  private followThrough = 0
  private hasThrownEver = false

  private get level(): Level {
    return LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)]
  }

  get muted(): boolean {
    return this.sfx.muted
  }

  constructor() {
    this.fx.seedAmbient(-10, 48, -28, 6, 150)
    this.cam.frame(-5, -8, 13, 4, 1)
    this.cam.snap()
  }

  // ------------------------------------------------------------------ input

  private anyKeyAdvance(): boolean {
    if (this.phase === 'title') { this.startLevel(0); return true }
    if (this.phase === 'training' && this.training.readyToLeave) { this.beginRound(); return true }
    if (this.phase === 'levelCard' && this.phaseTime > 0.7) { this.nextLevel(); return true }
    if (this.phase === 'failCard' && this.phaseTime > 0.7) { this.startLevel(this.levelIndex); return true }
    if (this.phase === 'finale' && this.phaseTime > 0.9) { this.startLevel(0); this.score = 0; return true }
    return false
  }

  pointerDown(x: number, y: number): void {
    this.sfx.unlock()
    if (this.anyKeyAdvance()) return

    if (this.phase === 'training') {
      this.repAttempt()
      return
    }
    // Tapping the crate corner swaps melons — the touch equivalent of 1/2/3.
    if (this.phase === 'aim' && x > this.cam.viewW - 190 && y < 110) {
      this.cycleMelon()
      return
    }
    if (this.phase !== 'aim') return
    this.anchor = { x, y }
    this.pointer = { x, y }
    this.ctl.beginPointer(x, y)
  }

  pointerMove(x: number, y: number): void {
    if (!this.ctl.active || this.ctl.keyboardMode) return
    this.pointer = { x, y }
    this.ctl.movePointer(x, y)
  }

  pointerUp(): void {
    if (this.phase !== 'aim' || !this.ctl.active) return
    const r = this.ctl.release()
    this.anchor = null
    this.pointer = null
    if (r) this.launch(r.angle, r.power, r.spin)
  }

  keyDown(code: string, repeat: boolean): void {
    this.sfx.unlock()
    if (code === 'KeyM') { this.sfx.toggleMute(); return }

    if (this.phase === 'training') {
      if (!repeat && (code === 'Space' || code === 'Enter')) {
        if (this.training.readyToLeave) this.beginRound()
        else this.repAttempt()
      }
      return
    }
    if (!repeat && this.anyKeyAdvance()) return
    if (this.phase !== 'aim') return

    if (code === 'Digit1') this.selectMelon(0)
    if (code === 'Digit2') this.selectMelon(1)
    if (code === 'Digit3') this.selectMelon(2)
    if (code === 'Tab') this.cycleMelon()

    const step = 0.045
    if (code === 'ArrowLeft' || code === 'KeyA') this.ctl.nudge(step, 0)
    if (code === 'ArrowRight' || code === 'KeyD') this.ctl.nudge(-step, 0)
    if (code === 'KeyQ') this.ctl.nudge(0, 4)
    if (code === 'KeyE') this.ctl.nudge(0, -4)
    if (code === 'Space' && !repeat && !this.ctl.active) this.ctl.beginKeyboard()
  }

  keyUp(code: string): void {
    if (code !== 'Space') return
    if (this.phase !== 'aim' || !this.ctl.active) return
    const r = this.ctl.release()
    if (r) this.launch(r.angle, r.power, r.spin)
  }

  private repAttempt(): void {
    const good = this.training.attempt()
    this.sfx.tick(good)
    if (good) {
      this.sfx.ping(Math.min(6, this.training.gained | 0))
      const p = this.training.flashPoint(this.cam.viewW, this.cam.viewH)
      this.toasts.push({
        text: '+arm', x: p.x, y: p.y - 40, life: 0, maxLife: 0.9,
        color: '#ffe6a8', size: 18, screen: true,
      })
    } else {
      this.sfx.buzz()
    }
  }

  private selectMelon(i: number): void {
    if (!this.level.crate.includes(i)) return
    this.selected = i
  }

  private cycleMelon(): void {
    const crate = this.level.crate
    const at = crate.indexOf(this.selected)
    this.selected = crate[(at + 1) % crate.length]
  }

  // ------------------------------------------------------------ level flow

  private startLevel(i: number): void {
    this.levelIndex = i
    const lv = this.level
    setWindScale(lv.wind)
    this.landed = 0
    this.combo = 0
    this.melonsLeft = lv.melons
    this.selected = lv.crate[0]
    this.melon = null
    this.squirrels = placeSquirrels(this.trees, lv.squirrels, lv.squirrelSkill, 1000 + i * 977)
    this.training.start(lv)
    this.setPhase('training')
  }

  private beginRound(): void {
    this.training.dismiss()
    this.strength += this.training.gained
    this.setPhase('aim')
  }

  private nextLevel(): void {
    if (this.levelIndex + 1 >= LEVELS.length) {
      // The endless afternoon repeats; you have already seen the credits.
      this.startLevel(LEVELS.length - 1)
      return
    }
    this.startLevel(this.levelIndex + 1)
  }

  private setPhase(p: Phase): void {
    this.phase = p
    this.phaseTime = 0
  }

  // --------------------------------------------------------------- throwing

  private launch(angle: number, power: number, spin: number): void {
    const kind = MELONS[this.selected]
    const v = releaseSpeed(power, this.strength, kind.mass)
    this.melon = makeMelon(kind, WORLD.throwPoint.x, WORLD.throwPoint.y, Math.cos(angle) * v, Math.sin(angle) * v, spin)
    if (Number.isFinite(this.melonsLeft)) this.melonsLeft--
    this.hasThrownEver = true
    this.followThrough = 1
    resetSquirrelsForThrow(this.squirrels)
    this.sfx.throwWhoosh(power)
    this.setPhase('flight')
  }

  private fumble(): void {
    // Held it too long. The melon rolls off the deck and that is that.
    const kind = MELONS[this.selected]
    this.melon = makeMelon(kind, 0.4, -0.2, 1.1, 0.2, -3)
    if (Number.isFinite(this.melonsLeft)) this.melonsLeft--
    this.ctl.cancel()
    this.anchor = null
    this.pointer = null
    this.sfx.buzz()
    this.toast('dropped it', 0, 0.8, '#c2402d', 22, 'arms give out')
    this.combo = 0
    this.setPhase('flight')
  }

  // ---------------------------------------------------------------- scoring

  private toast(text: string, x: number, y: number, color: string, size = 24, sub?: string): void {
    this.toasts.push({ text, sub, x, y, life: 0, maxLife: 1.9, color, size })
  }

  private scoreSplash(m: Melon): void {
    const cx = poolCentreX()
    const half = (WORLD.pool.right - WORLD.pool.left) / 2
    const off = clamp(1 - Math.abs(m.x - cx) / half, 0, 1)

    const parts: [string, number][] = []
    let total = SCORING.splash
    parts.push(['splash', SCORING.splash])

    const bull = SCORING.bullseye * Math.pow(off, 1.6)
    if (bull > 6) { total += bull; parts.push([off > 0.86 ? 'dead centre' : 'good line', bull]) }

    const vert = SCORING.verticalBonus * Math.pow(m.entryAngle, 2.2)
    if (vert > 6) { total += vert; parts.push([m.entryAngle > 0.9 ? 'cannonball' : 'steep', vert]) }

    if (m.bounces > 0) {
      const b = SCORING.trickBounce * m.bounces
      total += b
      parts.push([m.bounces > 1 ? `${m.bounces} branches` : 'off the branch', b])
    }

    const misses = collectNearMisses(this.squirrels, m)
    if (misses > 0) {
      const nm = SCORING.nearMiss * misses
      total += nm
      parts.push([misses > 1 ? `${misses} squirrels dodged` : 'squirrel dodged', nm])
      m.nearMisses = misses
    }

    const spin = SCORING.spinStyle * m.entrySpin
    if (spin > 8) { total += spin; parts.push(['spin', spin]) }

    total *= m.kind.score
    this.combo++
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    const comboMul = 1 + Math.min(1.5, (this.combo - 1) * 0.25)
    total *= comboMul

    this.score += total
    this.landed++

    const headline = parts.length > 3 ? parts[1][0] : off > 0.86 ? 'dead centre' : 'in the pool'
    this.toast(
      `+${Math.round(total)}`,
      m.x, WORLD.pool.surfaceY + 1.4,
      '#fff3d0', 30,
      this.combo > 1 ? `${headline} · ${this.combo}x` : headline,
    )
    this.sfx.ping(Math.min(8, this.combo - 1 + (off > 0.86 ? 2 : 0)))
    this.fx.sparkle(m.x, WORLD.pool.surfaceY + 0.6, 18)
  }

  // ----------------------------------------------------------------- update

  update(rawDt: number): void {
    const dt = Math.min(0.05, rawDt) * this.timeScale
    this.t += dt
    this.phaseTime += rawDt
    this.timeScale = approach(this.timeScale, this.targetTimeScale, 6, rawDt)

    this.sfx.setWind(windAt(0, this.t))

    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life += rawDt
      if (this.toasts[i].life > this.toasts[i].maxLife) this.toasts.splice(i, 1)
    }

    this.fx.update(dt, this.t, {
      x0: this.cam.x - 26, x1: this.cam.x + 26,
      y0: this.cam.y - 20, y1: this.cam.y + 20,
    })

    if (this.phase === 'training') {
      this.training.update(rawDt, (strong) => this.sfx.tick(strong))
      this.cam.frame(-5, -6, 9, 5, 1)
      this.cam.update(rawDt)
      return
    }

    this.followThrough = Math.max(0, this.followThrough - rawDt * 2.4)
    this.ctl.update(rawDt)
    if (this.phase === 'aim' && this.ctl.fumbled) this.fumble()

    // Squirrels stay awake between throws so the trees are never still.
    this.sqEvents.length = 0
    stepSquirrels(this.squirrels, this.melon, dt, this.sqEvents)
    for (const e of this.sqEvents) {
      if (e.type === 'steal') {
        this.sfx.chitter()
        this.combo = 0
        this.toast('robbed', e.x, e.y + 1, '#d98a5c', 24, 'the squirrel got it')
        this.cam.kick(0.35)
        this.settle(1.1)
      } else if (e.type === 'whiff' && this.melon?.state === 'flight') {
        this.sfx.chitter()
      }
    }

    if (this.melon) this.stepFlight(dt)

    this.updateCamera(rawDt)
    this.cam.update(rawDt, this.phase === 'flight' ? 5.5 : 4.2)
  }

  private stepFlight(dt: number): void {
    const m = this.melon!
    this.physEvents.length = 0
    stepMelon(m, this.trees, dt, this.t, this.physEvents)

    for (const e of this.physEvents) {
      switch (e.type) {
        case 'branch':
          this.sfx.rustle(e.speed)
          this.fx.shake(e.x, e.y, e.speed)
          this.cam.kick(0.06)
          break
        case 'trunk':
        case 'rail':
          this.sfx.knock(e.speed)
          this.fx.shake(e.x, e.y, e.speed * 0.4)
          this.cam.kick(0.12)
          break
        case 'water':
          this.fx.splash(e.x, e.y, e.speed, e.angle)
          this.sfx.splash(e.speed, e.angle)
          this.cam.kick(0.15 + e.angle * 0.2)
          this.scoreSplash(m)
          this.targetTimeScale = 0.3
          this.settle(1.5)
          break
        case 'lodged':
          this.sfx.rustle(4)
          this.fx.shake(e.x, e.y, 6)
          this.combo = 0
          this.toast('up the tree', e.x, e.y + 1.2, '#b08a6a', 22, 'that one is gone')
          this.settle(0.9)
          break
        case 'splat': {
          this.fx.burst(e.x, e.y, e.speed)
          this.sfx.splat(e.speed)
          this.cam.kick(0.2)
          this.combo = 0
          if (e.onRoof) {
            this.score += SCORING.roofPenalty
            this.toast('the neighbours', e.x, e.y + 1.4, '#c2402d', 24, `${SCORING.roofPenalty} and an apology`)
          } else if (e.x > WORLD.patioLeft && e.x < WORLD.patioRight) {
            this.toast('so close', e.x, e.y + 1.4, '#d9b06a', 22, 'all over the patio')
          } else {
            this.toast('short', e.x, e.y + 1.4, '#b08a6a', 22, 'into the hillside')
          }
          this.settle(1.0)
          break
        }
      }
    }

    if (m.settled && this.phase === 'flight') this.settle(0.5)
  }

  private settle(delay: number): void {
    if (this.phase !== 'flight') return
    this.setPhase('settle')
    this.phaseTime = -delay
  }

  private finishThrow(): void {
    this.targetTimeScale = 1
    this.melon = null
    const lv = this.level

    if (this.landed >= lv.quota) {
      this.setPhase(this.levelIndex + 1 >= LEVELS.length ? 'finale' : 'levelCard')
      return
    }
    if (this.melonsLeft <= 0) {
      this.setPhase('failCard')
      return
    }
    this.setPhase('aim')
  }

  private updateCamera(dt: number): void {
    void dt
    const m = this.melon
    if (this.phase === 'aim' || this.phase === 'title') {
      // Wide enough to read the house, the rail and the first of the trees.
      // The pool stays out of frame on purpose — you cannot see it from the
      // balcony either, and the camera falling to find it is the good part.
      this.cam.frame(-7, -15, 22, 5, 1, 34)
      return
    }
    if (this.phase === 'levelCard' || this.phase === 'failCard' || this.phase === 'finale') {
      this.cam.frame(20, -27, 40, -16, 2, 46)
      return
    }
    if (!m) return

    if (m.state === 'water') {
      // Sit on the water and watch it bob.
      this.cam.frame(
        WORLD.pool.left - 3.2, WORLD.pool.surfaceY - 3.6,
        WORLD.pool.right + 3.2, WORLD.pool.surfaceY + 4.4,
        0.8, 42,
      )
      return
    }
    // Chase, leading slightly in the direction of travel so you can read ahead.
    const leadX = clamp(m.vx * 0.55, -4, 8)
    const leadY = clamp(m.vy * 0.35, -6, 4)
    const cx = m.x + leadX
    const cy = m.y + leadY
    this.cam.frame(cx - 9, cy - 7, cx + 9, cy + 6, 0.5, 46)
  }

  // ------------------------------------------------------------------- draw

  draw(ctx: CanvasRenderingContext2D): void {
    const { viewW: W, viewH: H } = this.cam

    if (this.phase === 'settle' && this.phaseTime > 0) this.finishThrow()

    this.scene.drawBack(ctx, this.cam, this.t)

    for (const s of this.squirrels) drawSquirrel(ctx, this.cam, s, this.t)

    const pose = this.thrower()
    drawThrower(ctx, this.cam, pose, this.t)

    // The melon still in your hands, before you let go of it.
    if (!this.melon && this.phase === 'aim') {
      const hp = heldMelonPos(pose)
      const kind = MELONS[this.selected]
      drawMelonShape(ctx, this.cam.sx(hp.x), this.cam.sy(hp.y), Math.max(3, this.cam.s(kind.radius)), this.t * 0.4, kind)
    }

    if (this.melon) drawMelon(ctx, this.cam, this.melon)

    this.fx.draw(ctx, this.cam)
    this.scene.drawFront(ctx, this.cam, this.t)
    this.scene.godRays(ctx, this.cam, this.t)

    vignette(ctx, W, H, 0.42)
    applyGrain(ctx, W, H)

    // ---- interface

    if (this.phase === 'aim') {
      drawAim(ctx, this.cam, this.aimInfo())
      if (!this.hasThrownEver) this.firstThrowHint(ctx, W, H)
    }

    if (this.phase !== 'title' && this.phase !== 'training') {
      drawWind(ctx, W, windAt(0, this.t))
      drawStatus(ctx, W, H, {
        levelName: this.level.name,
        score: this.score,
        combo: this.combo,
        landed: this.landed,
        quota: this.level.quota,
        melonsLeft: this.melonsLeft,
        strength: this.strength,
        crate: this.level.crate,
        selected: this.selected,
        muted: this.sfx.muted,
      })
    }

    drawToasts(ctx, this.cam, this.toasts)

    if (this.phase === 'training') {
      this.training.draw(ctx, W, H, this.strength)
    }

    if (this.phase === 'levelCard') {
      drawCard(ctx, W, H, 'Round cleared', [
        `${this.level.name} — ${this.landed} in the pool`,
        `Score ${Math.round(this.score)}   ·   best streak ${this.bestCombo}x`,
        LEVELS[Math.min(this.levelIndex + 1, LEVELS.length - 1)].note,
      ], 'press anything for the next round', clamp(this.phaseTime * 2, 0, 1))
    }
    if (this.phase === 'failCard') {
      drawCard(ctx, W, H, 'Out of melons', [
        `${this.landed} of ${this.level.quota} made it in.`,
        'The crate is empty. There are more in the garage.',
      ], 'press anything to go again', clamp(this.phaseTime * 2, 0, 1))
    }
    if (this.phase === 'finale') {
      drawCard(ctx, W, H, 'The light goes', [
        `Final score ${Math.round(this.score)}`,
        `Best streak ${this.bestCombo}x   ·   arm ${this.strength.toFixed(1)}`,
        'Someone is calling you in for dinner.',
      ], 'press anything to start over', clamp(this.phaseTime * 2, 0, 1))
    }
    if (this.phase === 'title') drawTitle(ctx, W, H, this.t)
  }

  private thrower(): ThrowerPose {
    const ex = this.phase === 'training'
      ? { kind: this.training.exerciseKind, phase: this.training.phase }
      : null
    return {
      windup: this.ctl.active ? this.ctl.power : 0,
      follow: this.followThrough,
      aim: this.ctl.active ? this.ctl.aimAngle : 0.35,
      shake: this.ctl.active ? this.ctl.shake : 0,
      exercise: ex,
      strength: this.strength,
    }
  }

  private aimInfo(): AimInfo {
    const kind = MELONS[this.selected]
    const committed = this.ctl.active && this.ctl.committed
    let preview: { x: number; y: number }[] = []
    if (committed) {
      const a = this.ctl.aimAngle
      const v = releaseSpeed(this.ctl.power, this.strength, kind.mass)
      // Only the opening of the arc. Where it lands is yours to judge.
      preview = previewArc(kind, Math.cos(a) * v, Math.sin(a) * v, this.ctl.spin, this.t, 11, 1 / 60)
    }
    return {
      active: this.ctl.active,
      committed,
      power: this.ctl.power,
      shake: this.ctl.shake,
      fumbleProgress: this.ctl.fumbleProgress,
      angle: this.ctl.aimAngle,
      spin: this.ctl.spin,
      kind,
      anchor: this.anchor,
      pointer: this.pointer,
      preview,
      keyboard: this.ctl.keyboardMode,
    }
  }

  private firstThrowHint(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (this.ctl.active) return
    ctx.save()
    ctx.globalAlpha = 0.45 + Math.sin(this.t * 2.4) * 0.18
    ctx.fillStyle = 'rgba(28,22,16,0.7)'
    const w = 430
    roundRect(ctx, W / 2 - w / 2, H - 132, w, 52, 12)
    ctx.fill()
    ctx.globalAlpha = 0.9
    label(ctx, 'Drag back and hold. Flick your wrist as you let go.', W / 2, H - 100, 15, '#efe6d4', 'center')
    ctx.restore()
  }

  resize(w: number, h: number): void {
    this.cam.resize(w, h)
  }
}
