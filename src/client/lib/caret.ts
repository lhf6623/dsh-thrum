export interface CaretPosition {
  x: number
  y: number
}

/** caret 宿主：旧版 textarea（镜像测量）或 0.2.0 的 contenteditable（选区 rect）。 */
export type CaretHost = HTMLTextAreaElement | HTMLElement

const PROPS = [
  'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight',
  'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration',
  'letterSpacing', 'wordSpacing', 'tabSize',
]

// 镜像节点在首次测量时创建一次并常驻（absolutely positioned + hidden），
// 之后每次输入事件复用同一组节点，避免每个按键都创建/挂载/卸载 DOM 造成布局抖动与 GC 压力。
// disposeCaret() 在适当生命周期（如 flame 清理）调用，从 body 移除镜像并清空单例引用，
// 防止 HMR / 组件重挂载时旧节点残留；computeCaretPosition 会在镜像未挂载时按需重新挂载。
let mirrorDiv: HTMLDivElement | null = null
let mirrorSpan: HTMLSpanElement | null = null

function getMirror(): HTMLDivElement {
  if (!mirrorDiv) {
    mirrorDiv = document.createElement('div')
  }
  if (!mirrorDiv.isConnected) {
    document.body.appendChild(mirrorDiv)
  }
  return mirrorDiv
}

function getMirrorSpan(): HTMLSpanElement {
  if (!mirrorSpan) mirrorSpan = document.createElement('span')
  return mirrorSpan
}

/**
 * 计算输入宿主里文字光标的视口坐标。
 * - textarea：沿用镜像节点测量（selectionEnd/value，与 textarea 排版逐像素对齐）；
 * - contenteditable（dsh 0.2.0 的 Lexical composer）：读 Selection/Range 的当前 caret rect。
 * 两者都返回视口坐标（与 getBoundingClientRect 同一坐标系），供全屏 canvas 直接绘制。
 */
export function computeCaretPosition(host: CaretHost): CaretPosition {
  if (isTextControl(host)) return computeTextControlCaret(host)
  return computeEditableCaret(host)
}

function isTextControl(host: CaretHost): host is HTMLTextAreaElement {
  return (
    typeof (host as HTMLTextAreaElement).value === 'string' &&
    typeof (host as HTMLTextAreaElement).selectionEnd === 'number'
  )
}

function computeTextControlCaret(textarea: HTMLTextAreaElement): CaretPosition {
  const position = textarea.selectionEnd || 0
  const value = textarea.value || ''

  const div = getMirror()
  const span = getMirrorSpan()
  const style = div.style
  const computed = getComputedStyle(textarea)

  // 定位样式常驻；测量所依赖的文本度量（width/font/padding 等）每次都从 textarea 重新复制，
  // 以便在字体/尺寸响应式变化时仍保持与 textarea 完全一致的排版。
  style.whiteSpace = 'pre-wrap'
  style.wordWrap = 'break-word'
  style.position = 'absolute'
  style.visibility = 'hidden'
  style.top = '0'
  style.left = '0'
  for (const p of PROPS) {
    ;(style as any)[p] = (computed as any)[p]
  }
  if (textarea.scrollHeight > parseInt(computed.height, 10)) {
    style.overflowY = 'scroll'
  }

  // 复用一个 span 作为光标指示符：前缀作为文本节点，后缀（或一个占位 '.'）放入 span。
  div.textContent = value.substring(0, position)
  span.textContent = value.substring(position) || '.'
  div.appendChild(span)

  const left = span.offsetLeft + (parseInt(computed.borderLeftWidth, 10) || 0) - textarea.scrollLeft
  const top = span.offsetTop + (parseInt(computed.borderTopWidth, 10) || 0) - textarea.scrollTop

  const rect = textarea.getBoundingClientRect()
  return { x: rect.left + left, y: rect.top + top }
}

function computeEditableCaret(host: HTMLElement): CaretPosition {
  const doc = host.ownerDocument ?? document
  const selection = typeof doc.getSelection === 'function' ? doc.getSelection() : null
  const rect = selectionCaretRect(selection, host)
  if (rect) return { x: rect.left, y: rect.top }
  // 选区不可用（未聚焦、选区在别处）：退回归属元素左上角，火焰仍然喷，只是位置保守。
  const box = host.getBoundingClientRect()
  return { x: box.left, y: box.top }
}

/** 当前选区落在 host 内时返回其 caret rect；否则 null。 */
function selectionCaretRect(
  selection: Selection | null,
  host: HTMLElement,
): { left: number; top: number } | null {
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const start = range.startContainer
  if (start !== host && !host.contains(start)) return null
  // 非折叠选区（选中一段再输入/IME 组合）：取最后一个 client rect，即输入将落点所在行。
  const rects = typeof range.getClientRects === 'function' ? range.getClientRects() : null
  if (rects && rects.length > 0) {
    const r = rects[rects.length - 1]
    if (r && (r.width > 0 || r.height > 0)) return { left: r.left, top: r.top }
  }
  // 折叠选区在 Chromium 下 client rects 为空，但 getBoundingClientRect 给出零宽 caret rect。
  const box = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null
  if (box && (box.width > 0 || box.height > 0 || box.left !== 0 || box.top !== 0)) {
    return { left: box.left, top: box.top }
  }
  return null
}

export function disposeCaret(): void {
  if (mirrorDiv && mirrorDiv.isConnected) {
    mirrorDiv.remove()
  }
  if (mirrorSpan && mirrorSpan.isConnected) {
    mirrorSpan.remove()
  }
  mirrorDiv = null
  mirrorSpan = null
}
