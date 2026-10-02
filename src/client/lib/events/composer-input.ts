import { createEventSource } from './source'

// —— composer 输入事件源：语义化「composer 输入」，原始 document 事件由本模块独占 ——
//
// dsh 0.2.0 起 composer 不再是 `<textarea>`：输入宿主是 Lexical 的 contenteditable
// `div[data-composer-input]`（卡片仍是 `[data-composer-card]`）。Lexical 自己在 root 上
// 处理 `beforeinput` 并 preventDefault，DOM 由它 reconcile，因此：
//   1. 主事件是 `beforeinput`（插入/删除/粘贴都发，且此时选区仍是「插入前」的光标位置）；
//   2. 监听必须走捕获阶段：先于 Lexical 在 root 上的处理拿到事件，且不干扰它的默认行为；
//   3. 兜底再听 `input`（旧版 textarea / 未 preventDefault 的编辑）与 `keydown`：
//      可打印键、Backspace/Delete、Ctrl/Cmd+X/V/Z —— 这些由 Lexical 在 keydown 阶段接管，
//      浏览器不会再派发 beforeinput/input，只能从按键补上（否则回退/删除没有火焰）；
//   4. 一次编辑可能同时命中多个事件（keydown → beforeinput → input），按「同一宿主极短窗口内只算一次」去重。

/** composer 的输入宿主：旧版是 textarea（保留兼容），0.2.0 是 Lexical contenteditable。 */
export type ComposerInputElement = HTMLTextAreaElement | HTMLElement

const CARD_SELECTOR = '[data-composer-card]'
const INPUT_SELECTOR = '[data-composer-input]'

/**
 * 同一次编辑的去重窗口：一次按键会依次派发 keydown / beforeinput / input（约 1–6ms 内），
 * 窗口取值远小于人手连续两次按键的间隔（～100ms+），所以不会吞掉正常连打。
 */
const DEDUPE_MS = 30

/** 事件目标是否为 composer 输入宿主，是则返回该元素，否则 null。 */
function getComposerInput(e: Event): ComposerInputElement | null {
  const el = e.target as ComposerInputElement | null
  if (!el || typeof (el as HTMLElement).closest !== 'function') return null
  const tag = el.tagName
  // 旧版/其他形态：文本控件，必须位于 composer 卡片内
  if (tag === 'TEXTAREA' || tag === 'INPUT') {
    return el.closest(CARD_SELECTOR) ? (el as HTMLTextAreaElement) : null
  }
  // Lexical composer：contenteditable 的输入宿主（标记为 data-composer-input）
  const editable = (el as HTMLElement).isContentEditable || hasMarker(el)
  if (editable && (el.closest(CARD_SELECTOR) || el.matches(INPUT_SELECTOR))) return el
  return null
}

function hasMarker(el: Element): boolean {
  return typeof el.hasAttribute === 'function' && el.hasAttribute('data-composer-input')
}

/** 纯删除键：Lexical 在 keydown 里 preventDefault 后自行删除，不会再有 beforeinput/input。 */
const DELETE_KEYS = new Set(['Backspace', 'Delete'])

/** 带加速键的编辑快捷键（剪切/粘贴/撤销重做）：同样由 keydown 路径接管。 */
const EDIT_SHORTCUT_KEYS = new Set(['x', 'v', 'z'])

/**
 * 折叠光标处是否真的有可删内容：用 Range 的**文本投影**判断，
 * 空段落、文档边界不算内容 —— 所以空输入框按回退不会喷火。
 * 非折叠选区（选中一段）直接算可删；拿不到选区/Range 时不误伤，按可删处理。
 */
function canDelete(host: ComposerInputElement, backward: boolean): boolean {
  const value = (host as HTMLTextAreaElement).value
  if (typeof value === 'string') {
    const start = (host as HTMLTextAreaElement).selectionStart ?? 0
    const end = (host as HTMLTextAreaElement).selectionEnd ?? 0
    if (start !== end) return true
    return backward ? start > 0 : end < value.length
  }
  const doc = host.ownerDocument ?? document
  const selection = typeof doc.getSelection === 'function' ? doc.getSelection() : null
  if (!selection || selection.rangeCount === 0) return true
  const range = selection.getRangeAt(0)
  const start = range.startContainer
  if (start !== host && !host.contains(start)) return true
  if (!range.collapsed) return true
  if (typeof doc.createRange !== 'function') return true
  const probe = doc.createRange()
  try {
    probe.selectNodeContents(host)
    if (backward) probe.setEnd(range.startContainer, range.startOffset)
    else probe.setStart(range.startContainer, range.startOffset)
  } catch {
    return true
  }
  return probe.toString().length > 0
}

/**
 * keydown 兜底：只有「真的改动了文本」的按键才算一次编辑。
 * - 可打印字符（无 Ctrl/Cmd/Alt；Alt 在 macOS 是特殊字符输入，不算）；
 * - Backspace / Delete（Lexical 在 keydown 里 preventDefault 自己删，浏览器不再派发编辑事件），
 *   且仅当光标方向真的还有内容可删；
 * - Ctrl/Cmd + X / V / Z（剪切、粘贴、撤销/重做，同样走 keydown 路径）。
 * 选择键、方向键、纯修饰键、Cmd+A 等不改文本，一律不喷。
 */
function keydownTarget(e: Event): ComposerInputElement | null {
  const kb = e as KeyboardEvent
  const key = kb.key
  if (typeof key !== 'string') return null
  const accel = kb.ctrlKey || kb.metaKey
  const isEdit =
    DELETE_KEYS.has(key) ||
    (key.length === 1 && !accel && !kb.altKey) ||
    (accel && EDIT_SHORTCUT_KEYS.has(key.toLowerCase()))
  if (!isEdit) return null
  const host = getComposerInput(e)
  if (!host) return null
  if (DELETE_KEYS.has(key) && !canDelete(host, key === 'Backspace')) return null
  return host
}

// 捕获阶段监听 document：先于 Lexical 在 root 上的处理拿到事件，且不阻止它的默认行为。
const beforeInputSource = createEventSource<Event, ComposerInputElement>(
  document,
  'beforeinput',
  getComposerInput,
  { capture: true },
)
const inputSource = createEventSource<Event, ComposerInputElement>(
  document,
  'input',
  getComposerInput,
  { capture: true },
)
const keyDownSource = createEventSource<Event, ComposerInputElement>(
  document,
  'keydown',
  keydownTarget,
  { capture: true },
)

let lastFireAt = 0
let lastFireHost: Element | null = null

const subscribers = new Set<(el: ComposerInputElement) => void>()
let nativeOffs: Array<() => void> = []

/**
 * 一次编辑只广播一次：keydown/beforeinput/input 会先后到达，去重判定必须发生在
 * 「所有订阅者之前」——否则第一个订阅者（如火焰）消费掉这次编辑后，第二个订阅者
 * （如输入抖动）会被误判成重复而收不到。
 */
function emit(el: ComposerInputElement): void {
  const now = Date.now()
  if (lastFireHost === el && now - lastFireAt < DEDUPE_MS) return
  lastFireAt = now
  lastFireHost = el
  for (const fn of [...subscribers]) fn(el)
}

function attachNative(): void {
  if (nativeOffs.length > 0) return
  nativeOffs = [
    beforeInputSource(emit),
    inputSource(emit),
    keyDownSource(emit),
  ]
}

function detachNative(): void {
  for (const off of nativeOffs) off()
  nativeOffs = []
  lastFireHost = null
  lastFireAt = 0
}

/**
 * 订阅 composer 输入事件（首个订阅挂监听，最后一个退订摘监听），返回退订函数。
 * 每次有效编辑回调一次，参数为输入宿主（textarea 或 contenteditable）。
 */
export function onComposerInput(fn: (el: ComposerInputElement) => void): () => void {
  subscribers.add(fn)
  attachNative()
  return () => {
    subscribers.delete(fn)
    if (subscribers.size === 0) detachNative()
  }
}
