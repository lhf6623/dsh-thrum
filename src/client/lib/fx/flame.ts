import { reducedMotion } from './motion'
import { getConfig } from '../config'
import type { FlameStyle } from '@/shared/config'
import { computeCaretPosition, disposeCaret } from '../caret'
import { onComposerInput } from '../events/composer-input'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  size: number
  spec: FlameSpec
}

// 火焰样式 -> 粒子参数（与 FLAME_STYLES 一一对应）；缺省回退 ember。
interface FlameSpec {
  hueBase: number
  hueRange: number
  sat: number
  lightBase: number
  lightRange: number
  count: number
  sizeMul: number
  speedMul: number
  decayMul: number
}

const FLAME_SPECS: Record<FlameStyle, FlameSpec> = {
  off: {
    hueBase: 0,
    hueRange: 0,
    sat: 0,
    lightBase: 0,
    lightRange: 0,
    count: 0,
    sizeMul: 1,
    speedMul: 1,
    decayMul: 1,
  },
  ember: {
    hueBase: 12,
    hueRange: 40,
    sat: 100,
    lightBase: 42,
    lightRange: 24,
    count: 16,
    sizeMul: 1,
    speedMul: 1,
    decayMul: 1,
  },
  blue: {
    hueBase: 190,
    hueRange: 40,
    sat: 100,
    lightBase: 50,
    lightRange: 24,
    count: 14,
    sizeMul: 1,
    speedMul: 1,
    decayMul: 1,
  },
  spark: {
    hueBase: 45,
    hueRange: 15,
    sat: 100,
    lightBase: 70,
    lightRange: 20,
    count: 22,
    sizeMul: 0.7,
    speedMul: 1.4,
    decayMul: 1.3,
  },
}

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let raf: number | null = null

function initFlame(c: HTMLCanvasElement | null): void {
  canvas = c
  ctx = c ? c.getContext('2d') : null
}

function spawnFlame(x: number, y: number): void {
  const style = getConfig().flame
  if (reducedMotion() || getConfig().feedback === false || style === 'off') return
  if (!ctx) return
  const spec = FLAME_SPECS[style] ?? FLAME_SPECS.ember
  for (let i = 0; i < spec.count; i++) {
    const a = Math.random() * Math.PI * 2
    const speed = (0.6 + Math.random() * 2.6) * spec.speedMul
    particles.push({
      x: x + (Math.random() - 0.5) * 3,
      y: y + (Math.random() - 0.5) * 2,
      vx: Math.cos(a) * speed * 0.5,
      vy: -Math.abs(Math.sin(a)) * speed - 1.2,
      life: 1,
      decay: (0.02 + Math.random() * 0.03) * spec.decayMul,
      size: (2 + Math.random() * 4) * spec.sizeMul,
      spec,
    })
  }
  if (particles.length > 500) particles.splice(0, particles.length - 500)
  if (raf === null) raf = requestAnimationFrame(frame)
}

function frame(): void {
  raf = null
  const c = canvas
  if (!c || !ctx) { particles = []; return }
  if (c.width !== window.innerWidth || c.height !== window.innerHeight) {
    c.width = window.innerWidth
    c.height = window.innerHeight
  }
  const g = ctx
  g.clearRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'lighter'
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life -= p.decay
    if (p.life <= 0) { particles.splice(i, 1); continue }
    p.x += p.vx
    p.y += p.vy
    p.vy -= 0.05
    p.vx *= 0.97
    const t = p.life
    const spec = p.spec
    g.fillStyle =
      'hsla(' + (spec.hueBase + spec.hueRange * t) + ', ' + spec.sat + '%, ' +
      (spec.lightBase + spec.lightRange * t) + '%, ' + t + ')'
    g.beginPath()
    g.arc(p.x, p.y, p.size * t, 0, Math.PI * 2)
    g.fill()
  }
  g.globalCompositeOperation = 'source-over'
  if (particles.length > 0) raf = requestAnimationFrame(frame)
}

function stopFlame(): void {
  if (raf !== null) { cancelAnimationFrame(raf); raf = null }
  particles = []
  canvas = null
  ctx = null
}

const CANVAS_CLASS = 'vibe-fixed vibe-top-0 vibe-left-0 vibe-w-full vibe-h-full vibe-z-45 vibe-pointer-events-none'

/**
 * 页面级打字特效（无 React 组件）：自建全屏火焰画布挂到 body，
 * 订阅 composer 输入事件（见 events/composer-input.ts）——在文字光标处喷火焰粒子。
 * 返回 disposer，经 client 入口的 ctx.effect 挂载并自动清理。
 */
export function attachFlame(): () => void {
  const c = document.createElement('canvas')
  c.className = CANVAS_CLASS
  document.body.appendChild(c)
  initFlame(c)

  const off = onComposerInput((t) => {
    const pos = computeCaretPosition(t)
    spawnFlame(pos.x, pos.y)
  })

  return () => {
    off()
    stopFlame()
    c.remove()
    disposeCaret()
  }
}
