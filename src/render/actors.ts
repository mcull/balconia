import type { MelonKind } from '../core/config'
import type { Melon } from '../core/physics'
import type { Squirrel } from '../core/squirrel'
import { clamp, lerp, TAU } from '../util/math'
import type { Camera } from './camera'
import { PAL } from './palette'

type Ctx = CanvasRenderingContext2D

// ------------------------------------------------------------------ melon

export function drawMelonShape(
  ctx: Ctx, x: number, y: number, r: number, angle: number, kind: MelonKind,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)

  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  ctx.fillStyle = kind.tint
  ctx.fill()

  // Stripes, clipped to the sphere and bowed to follow its curve.
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = PAL.melonStripe
  ctx.lineWidth = r * 0.24
  for (let i = -3; i <= 3; i++) {
    const off = (i / 3.4) * r
    ctx.beginPath()
    ctx.moveTo(off * 1.15, -r * 1.1)
    ctx.quadraticCurveTo(off * 0.72, 0, off * 1.15, r * 1.1)
    ctx.stroke()
  }
  // Terminator shading and a specular pop.
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.25)
  g.addColorStop(0, 'rgba(255,255,240,0.30)')
  g.addColorStop(0.45, 'rgba(255,255,240,0)')
  g.addColorStop(1, 'rgba(10, 24, 12, 0.45)')
  ctx.fillStyle = g
  ctx.fillRect(-r, -r, r * 2, r * 2)
  ctx.restore()

  ctx.restore()
}

export function drawMelon(ctx: Ctx, cam: Camera, m: Melon): void {
  if (m.state === 'stolen') return
  const x = cam.sx(m.x)
  const y = cam.sy(m.y)
  const r = Math.max(2, cam.s(m.kind.radius))

  // Motion trail: the arc you just threw, fading out behind it.
  if (m.trail.length > 2 && m.state === 'flight') {
    ctx.save()
    ctx.lineCap = 'round'
    for (let i = 1; i < m.trail.length; i++) {
      const a = i / m.trail.length
      ctx.globalAlpha = a * 0.3
      ctx.strokeStyle = '#fff6dd'
      ctx.lineWidth = Math.max(0.6, r * 0.32 * a)
      ctx.beginPath()
      ctx.moveTo(cam.sx(m.trail[i - 1].x), cam.sy(m.trail[i - 1].y))
      ctx.lineTo(cam.sx(m.trail[i].x), cam.sy(m.trail[i].y))
      ctx.stroke()
    }
    ctx.restore()
  }

  if (m.state === 'splat') {
    // A ruined melon: flattened rind, seeds everywhere (those are particles).
    ctx.save()
    ctx.translate(x, y + r * 0.5)
    ctx.fillStyle = kindShade(m.kind.tint)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 1.5, r * 0.42, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = PAL.melonFlesh
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.08, r * 1.15, r * 0.26, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
    return
  }

  drawMelonShape(ctx, x, y, r, m.angle, m.kind)

  // A little underwater refraction wobble once it is in the pool.
  if (m.state === 'water') {
    ctx.save()
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#bff0ea'
    ctx.beginPath()
    ctx.arc(x, y, r * 1.25, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

function kindShade(hex: string): string {
  return hex
}

// -------------------------------------------------------------- squirrel

export function drawSquirrel(ctx: Ctx, cam: Camera, s: Squirrel, t: number): void {
  if (s.state === 'gone') return
  const x = cam.sx(s.x)
  const y = cam.sy(s.y)
  const u = Math.max(1.4, cam.s(0.16)) // one squirrel-unit in pixels
  if (x < -50 || x > cam.viewW + 50 || y < -50 || y > cam.viewH + 50) return

  const leaping = s.state === 'leap'
  const crouching = s.state === 'crouch'
  const stretch = leaping ? 1.45 : crouching ? 0.72 : 1
  const squash = leaping ? 0.72 : crouching ? 1.3 : 1

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s.dir, 1)
  if (leaping) ctx.rotate(Math.atan2(s.ty - s.sy, Math.abs(s.tx - s.sx)) * -0.5)

  // Tail — the whole read of the character. A fat S-curve that whips when it
  // leaps and curls over the back when it is sitting.
  const flick = Math.sin(t * 3.1 + s.phase) * 0.25
  ctx.beginPath()
  if (leaping) {
    ctx.moveTo(-u * 0.9, -u * 0.1)
    ctx.quadraticCurveTo(-u * 3.4, -u * 0.9 + flick * u, -u * 4.4, u * 0.7)
    ctx.quadraticCurveTo(-u * 3.2, u * 0.1, -u * 0.9, u * 0.5)
  } else {
    ctx.moveTo(-u * 0.8, u * 0.2)
    ctx.quadraticCurveTo(-u * 3.1, u * 0.1 + flick * u, -u * 2.2, -u * 2.6)
    ctx.quadraticCurveTo(-u * 1.2, -u * 1.4, -u * 0.4, -u * 0.6)
  }
  ctx.closePath()
  ctx.fillStyle = PAL.squirrel
  ctx.fill()
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.fillStyle = '#c99a6d'
  ctx.fill()
  ctx.restore()

  // Body.
  ctx.beginPath()
  ctx.ellipse(0, 0, u * 1.15 * stretch, u * 0.85 * squash, leaping ? -0.2 : 0.18, 0, TAU)
  ctx.fillStyle = PAL.squirrel
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(u * 0.2, u * 0.28, u * 0.7 * stretch, u * 0.44, 0, 0, TAU)
  ctx.fillStyle = PAL.squirrelBelly
  ctx.fill()

  // Head, ear, eye.
  const hx = u * (leaping ? 1.5 : 1.05)
  const hy = -u * (leaping ? 0.3 : 0.65)
  ctx.beginPath()
  ctx.ellipse(hx, hy, u * 0.6, u * 0.52, 0, 0, TAU)
  ctx.fillStyle = PAL.squirrel
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(hx - u * 0.3, hy - u * 0.5, u * 0.24, u * 0.3, -0.3, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(hx + u * 0.28, hy - u * 0.02, u * 0.13, 0, TAU)
  ctx.fillStyle = PAL.ink
  ctx.fill()
  ctx.beginPath()
  ctx.arc(hx + u * 0.58, hy + u * 0.16, u * 0.08, 0, TAU)
  ctx.fill()

  // Paws, out in front when it is committing to a leap.
  ctx.strokeStyle = PAL.squirrel
  ctx.lineWidth = u * 0.28
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(u * 0.5, u * 0.3)
  ctx.lineTo(u * (leaping ? 1.9 : 0.9), u * (leaping ? -0.1 : 0.75))
  ctx.stroke()

  // Carrying the loot.
  if (s.state === 'carrying') {
    drawMelonShape(ctx, u * 1.5, u * 0.5, u * 0.72, t * 3, {
      name: 'stolen', mass: 1, radius: 1, tint: PAL.melonSkin, score: 1,
    } as unknown as MelonKind)
  }

  ctx.restore()

  // Alert tick above a squirrel that has locked on.
  if (crouching) {
    ctx.save()
    ctx.globalAlpha = 0.85
    ctx.fillStyle = '#ffdf8a'
    ctx.beginPath()
    ctx.arc(x, y - u * 3.2, u * 0.3, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

// --------------------------------------------------------------- thrower

export interface ThrowerPose {
  /** 0 = relaxed, 1 = fully wound up. */
  windup: number
  /** 0..1, decays after release. */
  follow: number
  /** Aim direction in world radians. */
  aim: number
  /** Shake from over-holding, 0..1. */
  shake: number
  /** Rep animation phase while training, or null. */
  exercise: { kind: 'pushup' | 'pullup' | 'curl' | 'row'; phase: number } | null
  strength: number
}

/**
 * The kid on the balcony. Deliberately simple — a few tapered limbs and a
 * silhouette that reads at a glance — because on a good throw the camera
 * leaves them behind within half a second.
 */
export function drawThrower(ctx: Ctx, cam: Camera, pose: ThrowerPose, t: number): void {
  const footY = -1.15
  const baseX = -0.55
  const u = cam.s(1)
  if (u < 4) return

  const shake = pose.shake > 0 ? Math.sin(t * 46) * pose.shake * 0.035 : 0
  const lean = -pose.windup * 0.28 + pose.follow * 0.34
  // Muscle: a little wider in the shoulders as strength climbs.
  const build = 1 + clamp(pose.strength / 14, 0, 0.5)

  ctx.save()
  ctx.translate(cam.sx(baseX) + shake * u, cam.sy(footY))
  ctx.scale(u, u)

  const ex = pose.exercise
  let hipY = -0.78
  let torsoLean = lean
  if (ex) {
    const p = ex.phase
    if (ex.kind === 'pushup') { hipY = -0.28 - Math.abs(Math.sin(p)) * 0.14; torsoLean = 1.35 }
    else if (ex.kind === 'pullup') { hipY = -1.05 - Math.abs(Math.sin(p)) * 0.28; torsoLean = 0 }
    else if (ex.kind === 'curl') { hipY = -0.78; torsoLean = 0.04 }
    else { hipY = -0.72; torsoLean = 0.55 }
  }

  // Legs.
  ctx.strokeStyle = '#3b2f4d'
  ctx.lineWidth = 0.135
  ctx.lineCap = 'round'
  const stance = ex?.kind === 'pushup' ? 0.5 : 0.26 + pose.windup * 0.16
  ctx.beginPath()
  ctx.moveTo(-stance, 0)
  ctx.lineTo(-0.05, hipY)
  ctx.moveTo(stance, 0)
  ctx.lineTo(0.05, hipY)
  ctx.stroke()

  // Torso.
  ctx.save()
  ctx.translate(0, hipY)
  ctx.rotate(torsoLean * 0.5)
  ctx.fillStyle = '#e6b95f'
  ctx.beginPath()
  ctx.moveTo(-0.17 * build, 0.04)
  ctx.quadraticCurveTo(-0.22 * build, -0.34, -0.19 * build, -0.6)
  ctx.lineTo(0.19 * build, -0.6)
  ctx.quadraticCurveTo(0.22 * build, -0.34, 0.17 * build, 0.04)
  ctx.closePath()
  ctx.fill()

  // Head.
  ctx.fillStyle = '#c98d5f'
  ctx.beginPath()
  ctx.arc(0.04, -0.78, 0.175, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#3a2a22'
  ctx.beginPath()
  ctx.arc(0.02, -0.83, 0.178, Math.PI * 0.92, Math.PI * 2.15)
  ctx.fill()

  // Arms. The throwing arm cocks back with the wind-up and snaps through the
  // aim line on release.
  const shoulderY = -0.56
  const armAngle = ex
    ? exerciseArmAngle(ex)
    : lerp(-2.55, pose.aim, clamp(pose.follow, 0, 1)) + (1 - pose.follow) * -pose.windup * 0.55
  ctx.strokeStyle = '#c98d5f'
  ctx.lineWidth = 0.115
  const ax = Math.cos(armAngle) * 0.52
  const ay = -Math.sin(armAngle) * 0.52
  ctx.beginPath()
  ctx.moveTo(0.12 * build, shoulderY)
  ctx.quadraticCurveTo(0.12 * build + ax * 0.55, shoulderY + ay * 0.4, 0.12 * build + ax, shoulderY + ay)
  ctx.stroke()
  // Lead arm points down the line you are throwing, the way a thrower aims.
  const leadA = ex ? -0.5 : pose.aim
  const lx = Math.cos(leadA) * 0.46
  const ly = -Math.sin(leadA) * 0.46
  ctx.beginPath()
  ctx.moveTo(-0.08 * build, shoulderY)
  ctx.quadraticCurveTo(lx * 0.5, shoulderY + ly * 0.35, lx, shoulderY + ly)
  ctx.stroke()
  ctx.restore()
  ctx.restore()
}

function exerciseArmAngle(ex: NonNullable<ThrowerPose['exercise']>): number {
  const p = Math.abs(Math.sin(ex.phase))
  switch (ex.kind) {
    case 'pullup': return Math.PI / 2
    case 'pushup': return -Math.PI * 0.15
    case 'curl': return lerp(-1.35, 0.6, p)
    case 'row': return lerp(-0.4, -2.2, p)
  }
}

/**
 * Where the melon sits while you are winding up: cradled at the hand, pulled
 * back behind the shoulder as the charge builds.
 */
export function heldMelonPos(pose: ThrowerPose): { x: number; y: number } {
  const back = pose.windup * 0.75
  return { x: -0.1 - back * 0.9, y: 0.05 + back * 0.32 }
}
