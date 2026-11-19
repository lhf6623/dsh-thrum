// —— 页面失活事件源：window blur + document 隐藏，向订阅者广播 ——
// 对应 Cordis 事件模型：事件源由一个模块拥有，
// 订阅者互不知晓（emit 语义：纯观察、广播）；退订即效果清理。
// 切标签页时 blur 与 visibilitychange 常先后触发，订阅者处理函数需幂等。

const listeners = new Set<() => void>()
let attached = false

function emit(): void {
  for (const fn of [...listeners]) fn()
}

function onVisibility(): void { if (document.hidden) emit() }
function onBlur(): void { emit() }

/** 订阅「页面失活」（窗口失焦或页面隐藏）事件，返回退订函数。 */
export function onPageDeactivate(fn: () => void): () => void {
  listeners.add(fn)
  if (!attached) {
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    attached = true
  }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0 && attached) {
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      attached = false
    }
  }
}
