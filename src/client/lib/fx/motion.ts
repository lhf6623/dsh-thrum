import { getConfig, subscribeConfig } from '../config'

// —— 通用动效守卫：prefers-reduced-motion ——
export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ===== AI 陪伴：生命周期状态机 + 『生命感光带』动效（页面级）=====
// 订阅 /api/thrum-events 的 8 类会话事件（turn/*|step/*|assistant/chunk|assistant/message|tool/call|tool/result），
// 驱动 idle→thinking→generating→tool→complete 状态机，并把 AI 陪伴渲染成与输入框/overlay 一体的
// 『生命感光带』：思考=柔光呼吸、生成=流动光带（单亮弧环游）、工具=蓝色闪光+冷蓝稳态、完成=轻落回。
// 光带锚定 [data-composer-card] 外缘 8px 圆角描边 + 外发光，跟随输入框移动/缩放/内容增长。
// 受 aiFeedback 开关控制（可关）；prefers-reduced-motion 时降级为静态细描边（零运动）。
// 与现有打字火焰 / 输入抖动 / 回答提示音 / 整页抖动完全解耦：这里不做声音、不抖页面、无粒子。

export type AiPhase = 'idle' | 'thinking' | 'generating' | 'tool' | 'complete'

export type LifecycleEventType =
  | 'turn/start'
  | 'turn/end'
  | 'step/start'
  | 'step/end'
  | 'assistant/chunk'
  | 'assistant/message'
  | 'tool/call'
  | 'tool/result'

export interface LifecycleState {
  phase: AiPhase
  /** 当前 turn 开始时间（ms 时间戳）；用于计算 firstTokenMs。 */
  turnStartAt: number
  /** 首个 assistant/chunk 到达时间；null 表示还没开始生成。 */
  firstTokenAt: number | null
  /** 「思考时长」：turn/start 到首个 chunk 的毫秒数；无法正确推算时为 null。 */
  firstTokenMs: number | null
  /** 已收到的 assistant/chunk 数量（用于「随 chunk 流动/闪烁」）。 */
  chunkCount: number
  /** 最近一个 chunk 到达时间；null 表示尚无 chunk。 */
  lastChunkAt: number | null
  /** 最近一次 tool/call 时间。 */
  toolStartAt: number | null
  /** 当前是否处于工具执行中（tool/call 已到、tool/result 未到）。 */
  activeTool: boolean
  /** assistant/message 已到：该条助手消息（chunk 流）已完成；false 表示 chunk 仍在进行中。 */
  streaming: boolean
  /** turn 结束时间；用于 complete 后短暂停留再落回 idle。 */
  completeAt: number | null
}

export const initialLifecycle: LifecycleState = {
  phase: 'idle',
  turnStartAt: 0,
  firstTokenAt: null,
  firstTokenMs: null,
  chunkCount: 0,
  lastChunkAt: null,
  toolStartAt: null,
  activeTool: false,
  streaming: false,
  completeAt: null,
}

/** firstTokenMs 上限保护：思考时长异常大（如无 turn/start）时不会得到荒谬值。 */
const MAX_FIRST_TOKEN_MS = 30 * 60 * 1000

/** 把 SSE 帧解析为生命周期事件类型；非生命周期帧（如 answer-done、未知帧）返回 null。 */
export function toLifecycleEvent(frame: unknown): LifecycleEventType | null {
  if (!frame || typeof frame !== 'object') return null
  const type = (frame as { type?: unknown }).type
  switch (type) {
    case 'turn/start':
    case 'turn/end':
    case 'step/start':
    case 'step/end':
    case 'assistant/chunk':
    case 'assistant/message':
    case 'tool/call':
    case 'tool/result':
      return type as LifecycleEventType
    default:
      return null
  }
}

/** 纯 reducer：给定旧状态与事件，返回新状态；不产生副作用，便于单测。 */
export function reduceLifecycle(
  prev: LifecycleState,
  ev: LifecycleEventType,
  now: number,
): LifecycleState {
  switch (ev) {
    case 'turn/start':
      return {
        phase: 'thinking',
        turnStartAt: now,
        firstTokenAt: null,
        firstTokenMs: null,
        chunkCount: 0,
        lastChunkAt: null,
        toolStartAt: null,
        activeTool: false,
        streaming: false,
        completeAt: null,
      }

    case 'assistant/chunk': {
      const firstTokenAt = prev.firstTokenAt ?? now
      const firstTokenMs = prev.firstTokenMs ?? (
        prev.turnStartAt > 0 && firstTokenAt > prev.turnStartAt
          ? Math.min(firstTokenAt - prev.turnStartAt, MAX_FIRST_TOKEN_MS)
          : null
      )
      return {
        ...prev,
        phase: 'generating',
        firstTokenAt,
        firstTokenMs,
        chunkCount: prev.chunkCount + 1,
        lastChunkAt: now,
        activeTool: false,
        streaming: false,
        completeAt: null,
      }
    }

    case 'assistant/message':
      return {
        ...prev,
        phase: prev.phase === 'thinking' ? 'generating' : prev.phase,
        streaming: true,
      }

    case 'tool/call':
      return {
        ...prev,
        phase: 'tool',
        toolStartAt: now,
        activeTool: true,
      }

    case 'tool/result':
      return {
        ...prev,
        phase: prev.activeTool ? 'thinking' : prev.phase,
        toolStartAt: null,
        activeTool: false,
      }

    case 'step/start':
      return {
        ...prev,
        phase: prev.phase === 'idle' || prev.phase === 'complete' ? 'thinking' : prev.phase,
      }

    case 'step/end':
      return prev

    case 'turn/end':
      return {
        ...prev,
        phase: 'complete',
        completeAt: now,
        streaming: false,
      }
  }
}

/** 由 turn/end 后的 complete 短暂停留，再落回 idle（驱动层调用）。 */
export function settleToIdle(): LifecycleState {
  return { ...initialLifecycle }
}

// =====================================================================
//  B：『生命感光带』视觉 —— 与输入框/overlay 一体（锚定 composer 外缘 8px）
// =====================================================================

// —— 几何常量 ——
const GAP = 8              // 光带外包盒相对卡片外缘的间隙
const MIN_W = 240          // 光带最小宽
const RADIUS = 14          // 描边圆角
const STROKE_W = 2         // 描边宽
const BAND_Z = '30'        // 光带层级（低于键盘 z-40 / 火焰 z-45）
const COMET_ARC_END = 22   // 彗星亮弧占 conic 的百分比（0→22%）
const MIN_FLOW_SPEED = 160  // 生成环游最小速度 deg/s（tps=0 时；单圈 2.25s）
const MAX_FLOW_SPEED = 420  // 生成环游最大速度 deg/s（单圈 0.86s）
const MIN_INTENSITY = 0.30 // 生成 base glow 最小 alpha
const MAX_INTENSITY = 0.40 // 生成 base glow 最大 alpha
const TPS_WINDOW_MS = 400  // token 吞吐滚动窗口
const PAUSE_DECAY_MS = 600 // 停顿判定：>600ms 无增量则平滑衰减
const MIN_TOOL_FLASH_MS = 500 // 工具蓝闪最小间隔

// —— 明暗主题感知色板（AI 品牌蓝；不依赖 --dsw-alias-brand-primary） ——
interface BandPalette {
  strokeRgb: string  // 品牌蓝 rgb 三信道（深色提亮）
  glowRgb: string
  comet: string      // 彗星头
  tail: string       // 彗星尾（渐隐）
  tool: string       // 工具闪光/稳态冷蓝
  toolRgb: string
  complete: string   // 完成回落
}
const LIGHT_PALETTE: BandPalette = {
  strokeRgb: '74,108,247',
  glowRgb: '74,108,247',
  comet: 'rgba(122,160,255,0.95)',
  tail: 'rgba(122,160,255,0)',
  tool: 'rgba(56,189,248,0.95)',
  toolRgb: '56,189,248',
  complete: 'rgba(74,108,247,0.55)',
}
const DARK_PALETTE: BandPalette = {
  strokeRgb: '130,158,255',
  glowRgb: '90,120,255',
  comet: 'rgba(174,194,255,0.95)',
  tail: 'rgba(174,194,255,0)',
  tool: 'rgba(92,208,255,0.95)',
  toolRgb: '92,208,255',
  complete: 'rgba(130,158,255,0.60)',
}

/** 主题判定：body[data-ds-dark-theme] 优先；缺省按 prefers-color-scheme 兜底。 */
function detectDarkTheme(): boolean {
  const body = document.body
  const attr = body ? body.getAttribute('data-ds-dark-theme') : null
  if (attr != null) {
    const v = attr.toLowerCase()
    return !(v === 'false' || v === '0' || v === 'off')
  }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

function rgba(rgb: string, a: number): string {
  return 'rgba(' + rgb + ',' + a + ')'
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * 从 assistant/chunk 的 data 里抽取内容增量（token 当量）：命中字符串字段则用长度加权
 * （chars/4 ≈ 1 token，至少 1）；无字符串字段时回退 +1。
 * 健壮性：data 形状不保证时仍 ≥1、绝不抛错（内容缺失不阻塞，仍按节奏驱动）。
 */
export function extractIncrement(payload: unknown): number {
  // 兼容 data 本身就是字符串的情形。
  if (typeof payload === 'string') return Math.max(1, Math.floor(payload.length / 4))
  const s = findStringField(payload)
  if (s) return Math.max(1, Math.floor(s.length / 4))
  return 1
}

const TEXT_KEYS = ['content', 'text', 'delta', 'message']
function findStringField(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const o = payload as Record<string, unknown>
  for (const k of TEXT_KEYS) {
    const v = o[k]
    if (typeof v === 'string') return v
  }
  // 嵌套一层 data 对象（data.data.* 递归一层）
  const d = o.data
  if (d && typeof d === 'object') {
    const dd = d as Record<string, unknown>
    for (const k of TEXT_KEYS) {
      const v = dd[k]
      if (typeof v === 'string') return v
    }
  }
  return null
}

// —— 页面级 band 引用 ——
let state: LifecycleState = { ...initialLifecycle }
let attached = false
let band: HTMLElement | null = null      // 外层包裹（定位 + 层级 + 淡入/回落）
let ring: HTMLElement | null = null      // 描边 + 彗星（mask 只留 2px 环）
let glow: HTMLElement | null = null      // 外发光 halo
let mainAnim: Animation | null = null    // 连续呼吸/稳态（glow）
let flashAnim: Animation | null = null   // 一次性工具蓝闪
let fallAnim: Animation | null = null    // complete 回落
let faderAnim: Animation | null = null   // idle→active 淡入
let cometRaf: number | null = null       // rAF 推进 --band-angle
let settleTimer: number | null = null
let unsubscribeCfg: (() => void) | null = null
let lastPhase: AiPhase | null = null
let lastFlashAt = 0
let lastThemeDark: boolean | null = null
let lastRectKey = ''
let bandAngle = 0
let bandSpeed = MIN_FLOW_SPEED
let currentPal: BandPalette = LIGHT_PALETTE
let shown = false
// —— 逐 token 流动状态 ——
let tokenQueue: Array<{ inc: number; ts: number }> = []
let tokenRaf: number | null = null       // rAF/flush 合并
let lastTokenAt = 0                      // 最近一个 token 到达时间
let tps = 0                              // 当前吞吐（近 400ms 增量 / 0.4）
let bandIntensity = MIN_INTENSITY        // 生成 base glow alpha（token 驱动）

function cancelMain(): void {
  if (mainAnim) { try { mainAnim.cancel() } catch {} mainAnim = null }
}
function cancelFlash(): void {
  if (flashAnim) { try { flashAnim.cancel() } catch {} flashAnim = null }
}
function cancelFall(): void {
  if (fallAnim) { try { fallAnim.cancel() } catch {} fallAnim = null }
}
function cancelFader(): void {
  if (faderAnim) { try { faderAnim.cancel() } catch {} faderAnim = null }
}
function stopComet(): void {
  if (cometRaf !== null) { cancelAnimationFrame(cometRaf); cometRaf = null }
}
function cancelAll(): void {
  cancelMain(); cancelFlash(); cancelFall(); cancelFader(); stopComet()
}

// —— 主题与相位颜色 ——
function applyTheme(dark: boolean): void {
  if (!band) return
  currentPal = dark ? DARK_PALETTE : LIGHT_PALETTE
  const p = currentPal
  band.style.setProperty('--band-comet', p.comet)
  band.style.setProperty('--band-tail', p.tail)
  band.style.setProperty('--band-tool', p.tool)
  band.style.setProperty('--band-tool-rgb', p.toolRgb)
  // 外发光 base：alpha 取 0.40（≤ 契约上限），呼吸/稳态强度用 opacity 缩放。
  band.style.setProperty('--band-glow', rgba(p.glowRgb, 0.40))
}

/** 按当前相位设置描边色（--band-stroke），供 ring 的 conic/实色背景使用。 */
function setPhaseStroke(phase: AiPhase, pal: BandPalette = currentPal): void {
  if (!band) return
  let s: string
  switch (phase) {
    case 'tool':
      // 工具稳态：冷蓝描边 alpha 0.32。
      s = rgba(pal.toolRgb, 0.32)
      break
    case 'complete':
      // 完成回落：起落色。
      s = pal.complete
      break
    default:
      // thinking / generating：品牌蓝描边（深色 0.95 / 浅色 0.90）。
      s = rgba(pal.strokeRgb, detectDarkTheme() ? 0.95 : 0.90)
  }
  band.style.setProperty('--band-stroke', s)
}

// —— 定位：锚定 composer 外缘 8px ——
function measureComposer(): { left: number; top: number; width: number; height: number } | null {
  const el =
    document.querySelector('[data-composer-card]') ||
    document.querySelector('[data-composer-seat]')
  if (!el) return null
  const rect = el.getBoundingClientRect()
  // 锚点必须可测（display:none 等返回 0 矩形）：此时视作找不到，走 fallback。
  if (rect.width > 0 || rect.height > 0) {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }
  return null
}

function setBandBox(left: number, top: number, w: number, h: number): void {
  if (!band) return
  const key = left + '|' + top + '|' + w + '|' + h
  if (key === lastRectKey) return
  lastRectKey = key
  band.style.left = left + 'px'
  band.style.top = top + 'px'
  band.style.width = w + 'px'
  band.style.height = h + 'px'
}

function placeBand(): void {
  if (!band) return
  const rect = measureComposer()
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (rect) {
    let w = Math.max(Math.round(rect.width) + 2 * GAP, MIN_W)
    const h = Math.round(rect.height) + 2 * GAP
    let left = Math.round(rect.left) - GAP
    let top = Math.round(rect.top) - GAP
    // 夹在视口内（4px 边距），不出界。
    if (w > vw - 8) w = Math.max(MIN_W, vw - 8)
    left = Math.max(4, Math.min(left, vw - w - 4))
    top = Math.max(4, Math.min(top, vh - h - 4))
    setBandBox(left, top, w, h)
  } else {
    // 兜底：找不到锚点（或不可测）时，视口底部居中（bottom=12px, left=50%）。
    const w = MIN_W
    const h = 40
    const left = Math.round(vw / 2 - w / 2)
    const top = Math.max(4, vh - 12 - h)
    setBandBox(left, top, w, h)
  }
}

// —— 跟随：与 useComposerPosition 相同锚点/触发，rAF 合并 ——
function setupObservers(): () => void {
  let raf = 0
  const schedule = () => {
    if (raf) return
    raf = window.requestAnimationFrame(() => {
      raf = 0
      placeBand()
    })
  }
  placeBand()
  window.addEventListener('resize', schedule)
  // capture 阶段监听，覆盖所有内部滚动容器（聊天区滚动也会移动输入框）
  window.addEventListener('scroll', schedule, true)
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(schedule)
    const seat =
      document.querySelector('[data-composer-card]') ||
      document.querySelector('[data-composer-seat]')
    if (seat) ro.observe(seat)
    // 内容增长会把输入框往下推：观察 body/html 尺寸变化
    try { ro.observe(document.body) } catch {}
    try { ro.observe(document.documentElement) } catch {}
  }
  let mo: MutationObserver | null = null
  const ov = document.querySelector('[data-shell-overlay]')
  const fr = ov ? ov.parentElement : null
  if (fr && typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(schedule)
    mo.observe(fr, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-sidebar-collapsed', 'data-details-collapsed'],
      childList: true,
      subtree: true,
    })
  }
  return () => {
    window.removeEventListener('resize', schedule)
    window.removeEventListener('scroll', schedule, true)
    if (raf) window.cancelAnimationFrame(raf)
    if (ro) ro.disconnect()
    if (mo) mo.disconnect()
  }
}

// —— 主题变更：MutationObserver on body 的 data-ds-* 属性 ——
function setupThemeObserver(): () => void {
  if (typeof MutationObserver === 'undefined') return () => {}
  const mo = new MutationObserver(() => {
    const dark = detectDarkTheme()
    if (dark !== lastThemeDark) {
      lastThemeDark = dark
      applyTheme(dark)
      render()
    }
  })
  mo.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => mo.disconnect()
}

// —— 状态视觉 ——
function setRingSolid(): void {
  if (!ring) return
  ring.style.background = 'var(--band-stroke)'
}
function setRingComet(): void {
  if (!ring) return
  ring.style.background =
    'conic-gradient(from var(--band-angle), ' +
    'var(--band-tail) 0%, var(--band-comet) 10%, var(--band-comet) ' + COMET_ARC_END + '%, ' +
    'var(--band-tail) 34%, var(--band-stroke) 100%) border-box'
}
function setGlowBase(): void {
  if (!glow) return
  glow.style.boxShadow = '0 0 12px var(--band-glow)'
  glow.style.filter = ''
}

/** 工具闪的亮蓝弧（一次性 bloom 用）。 */
function setToolArc(): void {
  if (!ring) return
  ring.style.background =
    'conic-gradient(from 0deg, var(--band-tail) 0%, var(--band-tool) 10%, var(--band-tool) ' +
    COMET_ARC_END + '%, var(--band-tail) 34%, var(--band-stroke) 100%) border-box'
}

/** 思考：柔光呼吸（glow 合成 alpha 0.18↔0.36、blur 10↔16px，2400ms ease-in-out alternate）。
 *  颜色 alpha 恒 0.40，用 opacity 0.45↔0.90 缩放 → 合成 alpha 0.40×(0.45..0.90)=0.18↔0.36；
 *  blur 随 box-shadow 10↔16px 呼吸，均 ≤ 契约上限（描边 ≤0.95、外发光 ≤0.40、blur ≤16px）。 */
function startThinking(): void {
  if (!glow) return
  cancelMain()
  setRingSolid()
  setGlowBase()
  const g = currentPal.glowRgb
  mainAnim = (glow as any).animate(
    [
      { boxShadow: '0 0 10px ' + rgba(g, 0.40), opacity: '0.45' },
      { boxShadow: '0 0 16px ' + rgba(g, 0.40), opacity: '0.90' },
    ],
    { duration: 2400, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
  )
}

/** 生成：单亮弧沿圆角矩形边缘匀速环游（conic 渐变 + mask），流速/glow 随 token 吞吐微调。 */
function startGenerating(): void {
  if (!glow) return
  cancelMain()
  stopComet()
  setRingComet()
  setGlowBase()
  bandAngle = 0
  // 用当前吞吐驱动流速/强度（tps=0 时=min，即停顿→流动放缓/发光回落；不做硬停）。
  computeFlow(performance.now())
  if (ring) ring.style.setProperty('--band-angle', '0deg')
  // 生成态 glow 由 --band-intensity 经 calc 驱动，token 只改 CSS 变量，不重建动画。
  glow.style.opacity = 'calc(var(--band-intensity) / 0.40)'
  startComet()
}

/** 彗星角度推进：rAF 逐帧 += speed*dt，仅改 CSS 变量，不重建动画。
 *  已知近似：conic-gradient(from var(--band-angle)) 以恒定角速度推进，故沿圆角矩形边缘
 *  的线速度并非严格匀速（转角/直边处略有差异）。按 spec §1.5「实现可自选，契约只看行为」，
 *  此角速度近似即为规格接受的实现，记录为已知近似；如需严格沿边匀速，可改 SVG stroke-dashoffset
 *  或按周长加权推进角度（本次保留角速度近似）。 */
function startComet(): void {
  if (cometRaf !== null) return
  let last = performance.now()
  const step = (t: number) => {
    const dt = Math.min(t - last, 50)
    last = t
    bandAngle = (bandAngle + bandSpeed * (dt / 1000)) % 360
    if (ring) ring.style.setProperty('--band-angle', bandAngle.toFixed(2) + 'deg')
    cometRaf = requestAnimationFrame(step)
  }
  cometRaf = requestAnimationFrame(step)
}

// —— 逐 token 流动（B）：读 assistant/chunk 内容增量，驱动流速/强度（只改变量，不重建动画）——
function computeFlow(now: number): void {
  // 滚动窗口（近 400ms）内累计增量，丢弃过期项。
  while (tokenQueue.length && now - tokenQueue[0].ts > TPS_WINDOW_MS) tokenQueue.shift()
  let sum = 0
  for (let i = 0; i < tokenQueue.length; i++) sum += tokenQueue[i].inc
  let t = sum / 0.4
  // 停顿处理：>600ms 无新增量 → 平滑衰减 tps 趋 0（flowSpeed 有 min 下限，故不硬停）。
  if (now - lastTokenAt > PAUSE_DECAY_MS) t *= 0.85
  tps = t
  bandSpeed = clamp(MIN_FLOW_SPEED + tps * 240, MIN_FLOW_SPEED, MAX_FLOW_SPEED)
  bandIntensity = clamp(MIN_INTENSITY + tps * 0.9, MIN_INTENSITY, MAX_INTENSITY)
  // token 只改 CSS 变量（--band-spd/--band-intensity），连续动画实例不重建。
  if (band) {
    band.style.setProperty('--band-spd', String(bandSpeed))
    band.style.setProperty('--band-intensity', String(bandIntensity))
  }
}

function applyGeneratedGlow(): void {
  // 生成态 base glow = bandIntensity/0.40（等带宽上界），用 calc 引用 CSS 变量。
  if (state.phase === 'generating' && glow) {
    glow.style.opacity = 'calc(var(--band-intensity) / 0.40)'
  }
}

function scheduleFlush(): void {
  if (tokenRaf !== null) return
  tokenRaf = requestAnimationFrame(flushTokens)
}

/** rAF/≥40ms 对齐合并：把窗口内增量求和→一次性更新 tps/--band-spd/--band-intensity。 */
function flushTokens(): void {
  tokenRaf = null
  computeFlow(performance.now())
  applyGeneratedGlow()
  // 仍有增量或 tps 未衰减完，则继续下一帧冲刷。
  if (tokenQueue.length || tps > 0.01) scheduleFlush()
}

function resetFlow(): void {
  tokenQueue = []
  tps = 0
  bandSpeed = MIN_FLOW_SPEED
  bandIntensity = MIN_INTENSITY
  lastTokenAt = 0
  if (band) {
    band.style.setProperty('--band-spd', String(bandSpeed))
    band.style.setProperty('--band-intensity', String(bandIntensity))
  }
}

/** 工具蓝闪：一次性 ease-out 亮蓝 bloom（间隔 ≥500ms），然后回到稳态冷蓝。
 *  外发光约束：bloom 颜色用 rgba(toolRgb,≤0.40)，元素 opacity ≤1，故合成 alpha ≤ 0.40（绝不超限）；
 *  亮蓝弧本身在描边环上（alpha ≤0.95），flash 可读性依赖弧与冷蓝稳态。 */
function startToolFlash(): void {
  const now = Date.now()
  if (now - lastFlashAt < MIN_TOOL_FLASH_MS) return
  lastFlashAt = now
  if (!glow || !ring) return
  cancelFlash()
  setToolArc()
  // 外发光（bloom）颜色 alpha 上限 0.40；opacity 峰值 1 → 合成 alpha = 1×0.40 = 0.40。
  glow.style.boxShadow = '0 0 20px ' + rgba(currentPal.toolRgb, 0.40)
  glow.style.filter = ''
  glow.style.opacity = '1'
  flashAnim = (glow as any).animate(
    [{ opacity: '1' }, { opacity: '0.8' }],
    { duration: 380, easing: 'ease-out', fill: 'forwards' },
  )
  if (flashAnim) flashAnim.onfinish = () => {
    // 稳态：冷蓝描边 + 稳定外发光。
    setRingSolid()
    setGlowBase()
    if (glow) glow.style.opacity = '0.8'
  }
}

function startTool(flash: boolean): void {
  if (!glow || !ring) return
  cancelMain()
  if (flash) {
    // 进入 tool：一次亮蓝弧闪，随后冷蓝稳态。
    startToolFlash()
  } else {
    setRingSolid()
    setGlowBase()
    glow.style.opacity = '0.8'
  }
}

/** 完成：先短暂增亮，再随「向下轻落」的压缩感回落（scaleY 1→0.72 + 透明 1→0）。 */
function startComplete(): void {
  if (!band || !glow || !ring) return
  cancelAll()
  setRingSolid()
  setGlowBase()
  glow.style.opacity = '1'
  band.style.transform = 'scaleY(1)'
  band.style.opacity = '1'
  fallAnim = (band as any).animate(
    [{ transform: 'scaleY(1)', opacity: '0.95' }, { transform: 'scaleY(0.72)', opacity: '0' }],
    { duration: 700, easing: 'ease-in-out', fill: 'forwards', delay: 200 },
  )
  if (fallAnim) fallAnim.onfinish = () => {
    shown = false
  }
}

function hideBand(): void {
  cancelAll()
  if (band) {
    band.style.opacity = '0'
    band.style.transform = 'scaleY(1)'
    band.style.filter = ''
  }
  if (glow) glow.style.opacity = '0'
  shown = false
}

function fadeIn(): void {
  if (!band) return
  cancelFader()
  band.style.opacity = '0'
  faderAnim = (band as any).animate(
    [{ opacity: '0' }, { opacity: '1' }],
    { duration: 380, easing: 'ease-out', fill: 'forwards' },
  )
  shown = true
}

/** reduced-motion：静态细描边，零运动，仍以静态色/alpha 区分阶段。 */
function renderStatic(): void {
  if (!band || !glow || !ring) return
  const phase = state.phase
  const p = currentPal
  // 各阶段静态微差别：thinking 最淡，生成/工具/完成逐级略明。
  const a = phase === 'generating' ? 0.30 : phase === 'tool' ? 0.32 : phase === 'complete' ? 0.35 : 0.25
  ring.style.background = rgba(p.strokeRgb, a)
  setGlowBase()
  glow.style.opacity = '0.625'
  band.style.opacity = '1'
  band.style.transform = 'scaleY(1)'
}

/** 把机器状态渲染到光带：门控可关、reduced-motion 降级、四态映射。 */
function render(): void {
  if (!attached || !band || !glow || !ring) return
  // 跟随输入框（位置变了才更新，避免高频重排）。
  placeBand()

  // 低打扰/可关：aiFeedback 关闭或空闲时隐藏。
  if (getConfig().aiFeedback === false || state.phase === 'idle') {
    lastPhase = null
    hideBand()
    return
  }

  // 主题变更即改色。
  const dark = detectDarkTheme()
  if (dark !== lastThemeDark) {
    lastThemeDark = dark
    applyTheme(dark)
  }

  // 尊重 prefers-reduced-motion：静态细描边，零运动。
  if (reducedMotion()) {
    lastPhase = null
    cancelAll()
    renderStatic()
    return
  }

  if (state.phase !== lastPhase) {
    // 相位真正变化：清理上一相位的瞬态动画，回到基态（淡入/复位），再进入新相位，不闪烁。
    cancelMain()
    cancelFlash()
    cancelFall()
    stopComet()
    if (state.phase !== 'complete') {
      if (!shown) {
        fadeIn()
      } else {
        band.style.opacity = '1'
        band.style.transform = 'scaleY(1)'
      }
    }
    setPhaseStroke(state.phase)
    switch (state.phase) {
      case 'thinking':
        startThinking()
        break
      case 'generating':
        startGenerating()
        break
      case 'tool':
        startTool(true)
        break
      case 'complete':
        startComplete()
        break
    }
    lastPhase = state.phase
  }
}

/** 喂入一个 SSE 帧（client 入口的 EventSource 统一转发）。非生命周期帧会被忽略。 */
export function feedAiPresence(frame: unknown): void {
  const ev = toLifecycleEvent(frame)
  if (!ev) return
  // 新一轮开始，清除 pending 的 idle 回落，重置工具闪节流与 token 流动窗口。
  if (ev === 'turn/start') {
    if (settleTimer !== null) {
      clearTimeout(settleTimer)
      settleTimer = null
    }
    lastFlashAt = 0
    resetFlow()
  }
  // assistant/chunk：读 data 内容增量入队（rAF/≥40ms 合并，绝不逐事件重建动画）。
  if (ev === 'assistant/chunk') {
    const inc = extractIncrement((frame as { data?: unknown }).data)
    const ts = performance.now()
    tokenQueue.push({ inc, ts })
    lastTokenAt = ts
  }
  state = reduceLifecycle(state, ev, Date.now())
  render()
  // 喂入 chunk 后冲刷一次（更新 tps/--band-spd/--band-intensity）。
  if (ev === 'assistant/chunk') scheduleFlush()
  // turn/end：complete 短暂停留后自动落回 idle（缩短为 900ms，与回落动画一致）。
  if (ev === 'turn/end') {
    if (settleTimer !== null) clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      state = settleToIdle()
      render()
    }, 900)
  }
}

/** 当前状态机快照（调试/测试用）。 */
export function getLifecycleSnapshot(): LifecycleState {
  return state
}

/**
 * 页面级『生命感光带』：创建并挂载光带到 body，订阅配置变更（aiFeedback 实时生效），
 * 跟随 composer 位置并监听主题变化。返回 disposer，经 client 入口 ctx.effect 挂载并自动清理。
 */
export function attachAiPresence(): () => void {
  if (attached) return () => {}
  attached = true
  state = { ...initialLifecycle }
  lastPhase = null
  lastFlashAt = 0
  lastThemeDark = null
  lastRectKey = ''
  shown = false
  bandSpeed = MIN_FLOW_SPEED
  bandAngle = 0
  tokenQueue = []
  tps = 0
  bandIntensity = MIN_INTENSITY
  lastTokenAt = 0

  // —— 建立 DOM：外层包裹 + 内部 ring（描边/彗星）+ glow（外发光） ——
  const wrap = document.createElement('div')
  wrap.style.position = 'fixed'
  wrap.style.pointerEvents = 'none'
  wrap.style.zIndex = BAND_Z
  wrap.style.borderRadius = RADIUS + 'px'
  wrap.style.opacity = '0'
  wrap.style.willChange = 'opacity, transform'
  document.body.appendChild(wrap)

  const g = document.createElement('div')
  g.style.position = 'absolute'
  g.style.top = '0'
  g.style.left = '0'
  g.style.width = '100%'
  g.style.height = '100%'
  g.style.borderRadius = RADIUS + 'px'
  g.style.pointerEvents = 'none'
  g.style.willChange = 'opacity, filter'
  wrap.appendChild(g)

  const r = document.createElement('div')
  r.style.position = 'absolute'
  r.style.top = '0'
  r.style.left = '0'
  r.style.width = '100%'
  r.style.height = '100%'
  r.style.borderRadius = RADIUS + 'px'
  r.style.border = STROKE_W + 'px solid transparent'
  r.style.pointerEvents = 'none'
  r.style.setProperty('--band-angle', '0deg')
  // 只保留 2px 描边环：mask 排除 padding-box（内芯透明），conic 渐变只画在描边环上。
  const bandMask = 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)'
  r.style.webkitMask = bandMask
  r.style.mask = bandMask
  r.style.webkitMaskComposite = 'xor'
  r.style.maskComposite = 'exclude'
  wrap.appendChild(r)

  band = wrap
  ring = r
  glow = g

  const dark = detectDarkTheme()
  lastThemeDark = dark
  applyTheme(dark)
  setPhaseStroke('thinking')
  resetFlow()
  render()

  const disposers: Array<() => void> = []
  disposers.push(setupObservers())
  disposers.push(setupThemeObserver())
  unsubscribeCfg = subscribeConfig(() => render())

  return () => {
    attached = false
    if (settleTimer !== null) { clearTimeout(settleTimer); settleTimer = null }
    if (unsubscribeCfg) unsubscribeCfg()
    unsubscribeCfg = null
    disposers.forEach((d) => d())
    cancelAll()
    if (tokenRaf !== null) { cancelAnimationFrame(tokenRaf); tokenRaf = null }
    tokenQueue = []
    tps = 0
    bandIntensity = MIN_INTENSITY
    if (band) band.remove()
    band = null
    ring = null
    glow = null
    state = { ...initialLifecycle }
    lastPhase = null
    lastFlashAt = 0
    lastThemeDark = null
    lastRectKey = ''
    shown = false
  }
}