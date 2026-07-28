import { MELONS, THROW, type MelonKind } from '../core/config'
import { clamp, lerp, remap, TAU } from '../util/math'
import type { Camera } from './camera'
import { PAL } from './palette'
import { drawMelonShape } from './actors'
import { label, roundRect } from './painter'

export interface Toast {
  text: string
  sub?: string
  x: number
  y: number
  life: number
  maxLife: number
  color: string
  size: number
  /** World-space toasts rise with the camera; screen-space ones do not. */
  screen?: boolean
}

export function drawToasts(ctx: CanvasRenderingContext2D, cam: Camera, toasts: Toast[]): void {
  for (const t of toasts) {
    const k = t.life / t.maxLife
    const x = t.screen ? t.x : cam.sx(t.x)
    const y = (t.screen ? t.y : cam.sy(t.y)) - k * 46
    ctx.save()
    ctx.globalAlpha = clamp((1 - k) * 2.2, 0, 1)
    label(ctx, t.text, x, y, t.size, t.color, 'center', '600')
    if (t.sub) {
      ctx.globalAlpha *= 0.75
      label(ctx, t.sub, x, y + t.size * 0.95, t.size * 0.55, t.color, 'center')
    }
    ctx.restore()
  }
}

/** Wind gauge: a bar that leans the way the air is pushing. */
export function drawWind(ctx: CanvasRenderingContext2D, w: number, wind: number): void {
  const cx = w / 2
  const y = 46
  const mag = clamp(Math.abs(wind) / 6, 0, 1)
  const dir = Math.sign(wind) || 1

  ctx.save()
  label(ctx, 'WIND', cx, y - 16, 11, 'rgba(240,230,206,0.75)', 'center')
  ctx.strokeStyle = 'rgba(240,230,206,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - 70, y)
  ctx.lineTo(cx + 70, y)
  ctx.stroke()

  const len = 8 + mag * 62
  ctx.strokeStyle = mag > 0.6 ? '#f0a887' : '#f3ead6'
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, y)
  ctx.lineTo(cx + dir * len, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + dir * len, y)
  ctx.lineTo(cx + dir * (len - 9), y - 6)
  ctx.moveTo(cx + dir * len, y)
  ctx.lineTo(cx + dir * (len - 9), y + 6)
  ctx.stroke()

  label(
    ctx,
    `${Math.abs(wind).toFixed(1)} m/s ${dir < 0 ? 'onshore' : 'downhill'}`,
    cx, y + 22, 12, 'rgba(240,230,206,0.72)', 'center',
  )
  ctx.restore()
}

export interface StatusInfo {
  levelName: string
  score: number
  combo: number
  landed: number
  quota: number
  melonsLeft: number
  strength: number
  crate: number[]
  selected: number
  muted: boolean
}

export function drawStatus(ctx: CanvasRenderingContext2D, w: number, h: number, s: StatusInfo): void {
  ctx.save()

  // Level and score, top left.
  label(ctx, s.levelName.toUpperCase(), 24, 36, 13, 'rgba(240,230,206,0.72)', 'left', '600')
  label(ctx, String(Math.round(s.score)), 24, 72, 34, PAL.paper, 'left', '600')
  if (s.combo > 1) {
    label(ctx, `${s.combo}x streak`, 24, 94, 14, '#ffbd7a', 'left', '600')
  }
  if (Number.isFinite(s.quota)) {
    label(ctx, `${s.landed} / ${s.quota} in the pool`, 24, s.combo > 1 ? 116 : 94, 14, 'rgba(240,230,206,0.7)')
  } else {
    label(ctx, `${s.landed} in the pool`, 24, s.combo > 1 ? 116 : 94, 14, 'rgba(240,230,206,0.7)')
  }

  // Arm strength, top right.
  const rx = w - 24
  label(ctx, 'ARM', rx, 36, 11, 'rgba(240,230,206,0.7)', 'right')
  const barW = 96
  ctx.fillStyle = 'rgba(20,15,10,0.4)'
  roundRect(ctx, rx - barW, 44, barW, 8, 4)
  ctx.fill()
  ctx.fillStyle = '#e8b45c'
  roundRect(ctx, rx - barW, 44, barW * clamp(s.strength / 22, 0.02, 1), 8, 4)
  ctx.fill()

  // The crate: what is left to throw, and which one is loaded.
  const crateY = 82
  let cxp = rx - 16
  let selName = ''
  for (let i = s.crate.length - 1; i >= 0; i--) {
    const kind = MELONS[s.crate[i]]
    const on = s.crate[i] === s.selected
    const r = on ? 15 : 11
    ctx.save()
    ctx.globalAlpha = on ? 1 : 0.42
    drawMelonShape(ctx, cxp, crateY, r, -0.35, kind)
    if (on) {
      selName = kind.name
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(245,236,214,0.8)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cxp, crateY, r + 5, 0, TAU)
      ctx.stroke()
    }
    ctx.restore()
    cxp -= r * 2 + 12
  }
  // Name goes on its own line under the crate so it never collides with the
  // melons themselves.
  if (selName) label(ctx, selName, rx, crateY + 34, 13, 'rgba(240,230,206,0.85)', 'right')

  // Melons remaining, as a little row of them along the bottom.
  if (Number.isFinite(s.melonsLeft)) {
    const n = Math.min(12, s.melonsLeft)
    for (let i = 0; i < n; i++) {
      drawMelonShape(ctx, 30 + i * 22, h - 30, 9, i * 0.7, MELONS[s.selected])
    }
    if (s.melonsLeft > 12) {
      label(ctx, `+${s.melonsLeft - 12}`, 30 + 12 * 22, h - 25, 14, 'rgba(240,230,206,0.75)')
    }
  } else {
    label(ctx, 'unlimited melons', 24, h - 26, 14, 'rgba(240,230,206,0.7)')
  }

  if (s.muted) label(ctx, 'muted', w - 24, h - 26, 12, 'rgba(240,230,206,0.6)', 'right')

  ctx.restore()
}

export interface AimInfo {
  active: boolean
  committed: boolean
  power: number
  shake: number
  fumbleProgress: number
  angle: number
  spin: number
  kind: MelonKind
  anchor: { x: number; y: number } | null
  pointer: { x: number; y: number } | null
  preview: { x: number; y: number }[]
  keyboard: boolean
}

/**
 * The aim overlay. Three readouts because the gesture has three axes: a charge
 * ring for power, a heading line for the lane, and a spin dial for the curl.
 */
export function drawAim(ctx: CanvasRenderingContext2D, cam: Camera, a: AimInfo): void {
  const hx = cam.sx(0)
  const hy = cam.sy(0)

  // Predicted opening of the arc. Truncated on purpose — you get the first
  // moment of the flight, never the landing spot.
  if (a.active && a.committed && a.preview.length > 1) {
    ctx.save()
    ctx.setLineDash([7, 8])
    ctx.lineWidth = 2
    for (let i = 1; i < a.preview.length; i++) {
      const k = i / a.preview.length
      ctx.globalAlpha = (1 - k) * 0.55
      ctx.strokeStyle = '#fff4d8'
      ctx.beginPath()
      ctx.moveTo(cam.sx(a.preview[i - 1].x), cam.sy(a.preview[i - 1].y))
      ctx.lineTo(cam.sx(a.preview[i].x), cam.sy(a.preview[i].y))
      ctx.stroke()
    }
    ctx.restore()
  }

  if (!a.active) return

  // Slingshot line back to where you pressed.
  if (a.anchor && a.pointer && !a.keyboard) {
    ctx.save()
    ctx.globalAlpha = a.committed ? 0.4 : 0.2
    ctx.strokeStyle = '#f3ead6'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(a.anchor.x, a.anchor.y)
    ctx.lineTo(a.pointer.x, a.pointer.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(a.anchor.x, a.anchor.y, THROW.minPull, 0, TAU)
    ctx.globalAlpha = a.committed ? 0.12 : 0.3
    ctx.stroke()
    ctx.restore()
  }

  if (!a.committed) return

  const R = 46
  // Charge ring.
  ctx.save()
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(20,15,10,0.45)'
  ctx.beginPath()
  ctx.arc(hx, hy, R, -Math.PI * 0.62, Math.PI * 0.62)
  ctx.stroke()

  const hot = remap(a.power, THROW.steadyFraction, 1, 0, 1)
  const danger = a.fumbleProgress
  ctx.strokeStyle = danger > 0.82
    ? '#c2402d'
    : hot > 0
      ? `rgb(${Math.round(lerp(214, 200, hot))}, ${Math.round(lerp(160, 78, hot))}, 60)`
      : '#d6a03c'
  ctx.beginPath()
  ctx.arc(hx, hy, R, -Math.PI * 0.62, -Math.PI * 0.62 + Math.PI * 1.24 * a.power)
  ctx.stroke()

  // Tick where your arm stops being steady.
  const tickA = -Math.PI * 0.62 + Math.PI * 1.24 * THROW.steadyFraction
  ctx.strokeStyle = 'rgba(245,236,214,0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(hx + Math.cos(tickA) * (R - 9), hy + Math.sin(tickA) * (R - 9))
  ctx.lineTo(hx + Math.cos(tickA) * (R + 9), hy + Math.sin(tickA) * (R + 9))
  ctx.stroke()

  // Warn from the moment power is full, not at the last instant. Past here
  // holding buys nothing and risks the melon, so the ring says so the whole
  // way rather than surprising you with a drop.
  if (a.power >= 1) {
    const urgency = remap(danger, 1 / THROW.fumbleAt, 1, 0, 1)
    ctx.globalAlpha = 0.55 + Math.sin(performance.now() / (140 - urgency * 95)) * 0.4
    ctx.strokeStyle = urgency > 0.5 ? '#c2402d' : '#d68a3c'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(hx, hy, R + 9 + urgency * 5, -Math.PI * 0.62, Math.PI * 0.62)
    ctx.stroke()
    label(
      ctx,
      urgency > 0.5 ? 'LET GO' : 'full power',
      hx, hy - R - 20, urgency > 0.5 ? 16 : 13,
      urgency > 0.5 ? '#e8624a' : '#f0c07a', 'center', '700',
    )
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // Heading line.
  ctx.save()
  const len = 60 + a.power * 70
  const ex = hx + Math.cos(a.angle) * len
  const ey = hy - Math.sin(a.angle) * len
  ctx.globalAlpha = 0.75
  ctx.strokeStyle = '#fff4d8'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(hx + Math.cos(a.angle) * 24, hy - Math.sin(a.angle) * 24)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - Math.cos(a.angle - 0.4) * 12, ey + Math.sin(a.angle - 0.4) * 12)
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - Math.cos(a.angle + 0.4) * 12, ey + Math.sin(a.angle + 0.4) * 12)
  ctx.stroke()
  ctx.restore()

  // Spin dial: a curved arrow whose length and side show the curl you have
  // loaded. Up is backspin, which floats the melon further out.
  const sp = clamp(a.spin / THROW.maxSpin, -1, 1)
  if (Math.abs(sp) > 0.04) {
    ctx.save()
    ctx.translate(hx, hy)
    const rr = 30
    const sweep = Math.abs(sp) * Math.PI * 1.25
    const ccw = sp < 0
    ctx.strokeStyle = sp > 0 ? '#6fc4b0' : '#d98a5c'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + (ccw ? -sweep : sweep), ccw)
    ctx.stroke()
    const endA = -Math.PI / 2 + (ccw ? -sweep : sweep)
    const tipX = Math.cos(endA) * rr
    const tipY = Math.sin(endA) * rr
    const tanA = endA + (ccw ? -Math.PI / 2 : Math.PI / 2)
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX - Math.cos(tanA - 0.5) * 10, tipY - Math.sin(tanA - 0.5) * 10)
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX - Math.cos(tanA + 0.5) * 10, tipY - Math.sin(tanA + 0.5) * 10)
    ctx.stroke()
    ctx.globalAlpha = 0.85
    label(ctx, sp > 0 ? 'backspin' : 'topspin', 0, -rr - 34, 12, sp > 0 ? '#9fe6d3' : '#f2b183', 'center', '600')
    ctx.restore()
  }
}

/** The card between rounds and at the end. */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  title: string, lines: string[], hint: string, alpha = 1,
): void {
  const cardW = Math.min(560, w * 0.86)
  const cardH = 84 + lines.length * 30
  const cx = w / 2
  const cy = h * 0.5
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(28, 22, 16, 0.84)'
  roundRect(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH, 18)
  ctx.fill()
  ctx.strokeStyle = 'rgba(240, 226, 198, 0.25)'
  ctx.lineWidth = 1
  ctx.stroke()
  label(ctx, title, cx, cy - cardH / 2 + 46, 28, PAL.paper, 'center', '600')
  lines.forEach((l, i) => {
    label(ctx, l, cx, cy - cardH / 2 + 84 + i * 30, 16, 'rgba(238,226,200,0.8)', 'center')
  })
  ctx.globalAlpha = alpha * (0.55 + Math.sin(performance.now() / 420) * 0.2)
  label(ctx, hint, cx, cy + cardH / 2 + 30, 15, PAL.paper, 'center')
  ctx.restore()
}

/** The game is named for the balcony, not for what you throw off it. */
const WORDMARK = 'BALCONIA'
const TAGLINE = 'three storeys, one pool, several opinionated squirrels'

export function drawTitle(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  ctx.save()
  const cy = h * 0.36

  ctx.globalAlpha = 0.9
  ctx.fillStyle = 'rgba(28, 22, 16, 0.35)'
  ctx.fillRect(0, 0, w, h)

  // One word, so fit it to the viewport by measuring rather than guessing at a
  // size that happens to look right on a laptop.
  let size = Math.min(150, h * 0.21)
  ctx.font = `700 ${size}px ui-serif, Georgia, 'Iowan Old Style', serif`
  const measured = ctx.measureText(WORDMARK).width
  const target = w * 0.74
  if (measured > target) size *= target / measured

  label(ctx, WORDMARK, w / 2, cy, size, PAL.paper, 'center', '700')
  ctx.globalAlpha = 0.72
  label(ctx, TAGLINE, w / 2, cy + size * 0.5, Math.max(13, size * 0.16), PAL.paper, 'center')

  const y = h * 0.74
  ctx.globalAlpha = 0.8
  label(ctx, 'DRAG BACK to aim  ·  HOLD to load  ·  FLICK your wrist for spin', w / 2, y, 15, PAL.paper, 'center')
  ctx.globalAlpha = 0.55
  label(ctx, 'keyboard: ← → aim  ·  Q E spin  ·  hold SPACE  ·  1-3 pick a melon  ·  M mute', w / 2, y + 26, 13, PAL.paper, 'center')
  ctx.globalAlpha = 0.5 + Math.sin(t * 2.6) * 0.3
  label(ctx, 'press anything to begin', w / 2, y + 62, 17, PAL.paper, 'center', '600')
  ctx.restore()
}

export function fmtScore(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
}

export { lerp }
