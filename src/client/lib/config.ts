import { configStorageKey } from '@/shared/identity'
import {
  DEFAULTS,
  normalizeConfig,
  type Config as ThrumConfig,
  type ShakeLevel,
  type MoleFrequency,
} from '@/shared/config'

export { DEFAULTS, normalizeConfig }
export type { ThrumConfig, ShakeLevel, MoleFrequency }

// 持久化键：localStorage（浏览器本地）。
// 系统 settings 表单（0.2.0 的 ctx.configForms.get(entryId)）可用时以系统值为准并回写本地；
// 表单 unavailable（远端非 loopback / namespace 未暴露）时 localStorage 是唯一存储。
const KEY = configStorageKey()

function loadLocal(): ThrumConfig {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(KEY)
      if (raw) return normalizeConfig(JSON.parse(raw))
    }
  } catch {}
  return { ...DEFAULTS }
}

function saveLocal(c: ThrumConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(KEY, JSON.stringify(c))
    }
  } catch {}
}

// —— 系统 settings 表单（可选增强）：ready 时用系统值并回写 localStorage ——
// 只声明用到的 ConfigForm 形状（@deepseek-ai/dsh-client-ui-settings 的 ctx.configForms.get()），
// 避免客户端 bundle 引入 @deepseek-ai 依赖；字段与 ConfigFormSnapshot<T> 保持一致。
export interface ConfigFormLike<T> {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable'
    value: T | undefined
    base: unknown
    user: unknown
    revision: number | undefined
    writable: boolean
    mode: 'host' | 'memory'
  }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<boolean>
  unset(field: string): Promise<boolean>
  mutate(ops: readonly unknown[], expectedRevision?: number): Promise<boolean>
}

let scope: ConfigFormLike<ThrumConfig> | null = null
let config: ThrumConfig = loadLocal()
const listeners = new Set<(c: ThrumConfig) => void>()

/** 绑定插件自己的 settings 表单（由 client/index.tsx 在 apply 时调用一次）。 */
export function attachSettings(s: ConfigFormLike<ThrumConfig>): void {
  scope = s
  const snap = s.getSnapshot()
  if (snap.status === 'ready' && snap.value) {
    config = normalizeConfig(snap.value)
    saveLocal(config)
  }
  s.subscribe(() => {
    const cur = s.getSnapshot()
    if (cur.status === 'ready' && cur.value) {
      config = normalizeConfig(cur.value)
      saveLocal(config)
      for (const fn of listeners) fn(config)
    }
  })
  // 兼容旧 scope 的主动读取入口；ConfigForm 由共享镜像驱动，没有 load() 时直接跳过
  // （提供者会在连接建立/失效通知时刷新，订阅已就位所以不会漏掉首帧）。
  const p = (s as any).load?.()
  if (p && typeof p.then === 'function') p.catch(() => {})
}

export function getConfig(): ThrumConfig {
  return config
}

/** 修改配置：先本地即时生效并持久化到 localStorage；表单可用时同步写入系统 settings。 */
export function setConfig(patch: Partial<ThrumConfig>): void {
  const next = normalizeConfig({ ...config, ...patch })
  config = next
  saveLocal(next)
  for (const fn of listeners) fn(config)
  if (scope) {
    for (const [k, v] of Object.entries(patch)) {
      scope.set(k, v).catch(() => {})
    }
  }
}

export function subscribeConfig(fn: (c: ThrumConfig) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
