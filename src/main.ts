import { Game } from './core/game'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d', { alpha: false })!
const game = new Game()

function resize(): void {
  // Cap the backing store at 2x. Beyond that the painterly layers cost more
  // than they show, especially on phones.
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  // iOS Safari reports an innerHeight that includes area hidden behind its
  // chrome, so laying out against it pushes the bottom of the UI off screen.
  // The visual viewport is what the player can actually see.
  const vv = window.visualViewport
  const w = Math.round(vv?.width ?? window.innerWidth)
  const h = Math.round(vv?.height ?? window.innerHeight)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  game.resize(w, h)
}
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', () => setTimeout(resize, 120))
// Safari fires these when its chrome slides in and out, which changes the
// visible height without firing a window resize.
window.visualViewport?.addEventListener('resize', resize)
window.visualViewport?.addEventListener('scroll', resize)
resize()

// ------------------------------------------------------------------- input

function local(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  canvas.setPointerCapture(e.pointerId)
  const p = local(e)
  game.pointerDown(p.x, p.y)
})
canvas.addEventListener('pointermove', (e) => {
  const p = local(e)
  game.pointerMove(p.x, p.y)
})
const up = (e: PointerEvent): void => {
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
  game.pointerUp()
}
canvas.addEventListener('pointerup', up)
canvas.addEventListener('pointercancel', up)
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

window.addEventListener('keydown', (e) => {
  // Space and the arrows would otherwise scroll or move focus.
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) {
    e.preventDefault()
  }
  game.keyDown(e.code, e.repeat)
})
window.addEventListener('keyup', (e) => game.keyUp(e.code))

// -------------------------------------------------------------------- loop

// Dev handle, so the game can be driven and inspected from the console.
if (import.meta.env.DEV) {
  ;(window as unknown as { game: Game }).game = game
}

let last = performance.now()
function frame(now: number): void {
  // Clamp the step so an alt-tab does not teleport a melon through a redwood.
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  game.update(dt)
  game.draw(ctx)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
