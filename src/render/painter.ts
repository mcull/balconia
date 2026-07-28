import { mulberry32, TAU } from '../util/math'

type Ctx = CanvasRenderingContext2D

/**
 * A closed, slightly lumpy ellipse. Everything organic in this game is built
 * out of these so nothing reads as a perfect computer circle.
 */
export function blobPath(
  ctx: Ctx,
  cx: number, cy: number,
  rx: number, ry: number,
  seed: number,
  wobble = 0.16,
  lobes = 9,
): void {
  const rnd = mulberry32(seed)
  const offs: number[] = []
  for (let i = 0; i < lobes; i++) offs.push(1 + (rnd() - 0.5) * 2 * wobble)

  ctx.beginPath()
  for (let i = 0; i <= lobes; i++) {
    const a0 = (i / lobes) * TAU
    const a1 = ((i + 1) / lobes) * TAU
    const k0 = offs[i % lobes]
    const k1 = offs[(i + 1) % lobes]
    const x0 = cx + Math.cos(a0) * rx * k0
    const y0 = cy + Math.sin(a0) * ry * k0
    const x1 = cx + Math.cos(a1) * rx * k1
    const y1 = cy + Math.sin(a1) * ry * k1
    // Control point pushed out along the bisector gives a soft petal edge.
    const am = (a0 + a1) / 2
    const bulge = 1.14
    const cxp = cx + Math.cos(am) * rx * ((k0 + k1) / 2) * bulge
    const cyp = cy + Math.sin(am) * ry * ((k0 + k1) / 2) * bulge
    if (i === 0) ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(cxp, cyp, x1, y1)
  }
  ctx.closePath()
}

export function fillBlob(
  ctx: Ctx,
  cx: number, cy: number, rx: number, ry: number,
  seed: number, color: string, wobble = 0.16,
): void {
  blobPath(ctx, cx, cy, rx, ry, seed, wobble)
  ctx.fillStyle = color
  ctx.fill()
}

/**
 * A clump of leaves: a dark body, a mid tone lifted toward the sun, and a thin
 * rim of hot light on the sunward edge. Three passes is all it takes to stop
 * flat vector foliage looking like flat vector foliage.
 */
export function foliageClump(
  ctx: Ctx,
  cx: number, cy: number, r: number,
  seed: number,
  deep: string, mid: string, rim: string,
  sunX: number, sunY: number,
  rimStrength = 1,
): void {
  fillBlob(ctx, cx, cy, r, r * 0.86, seed, deep, 0.22)
  fillBlob(ctx, cx - sunX * r * 0.1, cy - sunY * r * 0.14, r * 0.78, r * 0.66, seed + 7, mid, 0.26)
  if (rimStrength > 0.02) {
    ctx.save()
    ctx.globalAlpha = 0.55 * rimStrength
    fillBlob(
      ctx,
      cx + sunX * r * 0.38, cy - sunY * r * 0.4,
      r * 0.42, r * 0.3, seed + 13, rim, 0.3,
    )
    ctx.restore()
  }
}

/** Hand-drawn-feeling line: a stroke that wanders a little off true. */
export function inkLine(
  ctx: Ctx,
  x0: number, y0: number, x1: number, y1: number,
  seed: number, jitter = 1.4, segments = 5,
): void {
  const rnd = mulberry32(seed)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const nx = x0 + (x1 - x0) * t + (rnd() - 0.5) * jitter
    const ny = y0 + (y1 - y0) * t + (rnd() - 0.5) * jitter
    ctx.lineTo(nx, ny)
  }
  ctx.stroke()
}

let grainCanvas: HTMLCanvasElement | null = null

/** A cached tile of paper tooth, multiplied over the finished frame. */
export function grainTile(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas
  const size = 192
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  const rnd = mulberry32(99)
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (rnd() - 0.5) * 74
    img.data[i * 4 + 0] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  grainCanvas = c
  return c
}

export function applyGrain(ctx: Ctx, w: number, h: number, alpha = 0.055): void {
  const tile = grainTile()
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'overlay'
  const pat = ctx.createPattern(tile, 'repeat')
  if (pat) {
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()
}

export function vignette(ctx: Ctx, w: number, h: number, strength = 0.4): void {
  const g = ctx.createRadialGradient(
    w / 2, h * 0.46, Math.min(w, h) * 0.22,
    w / 2, h * 0.5, Math.max(w, h) * 0.78,
  )
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(24, 18, 12, ${strength})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** Warm bloom lifted over the brightest part of the sky. */
export function sunHaze(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(255,240,210,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** Text with a soft warm shadow, used for every readout in the game. */
export function label(
  ctx: Ctx,
  text: string, x: number, y: number,
  size: number, color: string,
  align: CanvasTextAlign = 'left',
  weight = '400',
): void {
  ctx.save()
  ctx.font = `${weight} ${size}px ui-serif, Georgia, 'Iowan Old Style', serif`
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  // A soft dark halo rather than a single offset shadow. The camera travels
  // from bright sky down into deep foliage in one throw, so every readout has
  // to survive both without the palette turning into an outline font.
  ctx.shadowColor = 'rgba(18, 13, 9, 0.85)'
  ctx.shadowBlur = Math.max(3, size * 0.34)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.shadowBlur = 0
  ctx.fillText(text, x, y)
  ctx.restore()
}
