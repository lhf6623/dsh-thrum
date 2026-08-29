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

// 持久化键：localStorage（浏览器本地，发布后依然有效）。
// 系统 settings（settingsScope）可用时（白名单暴露）优先读系统值并回写，未暴露时 localStorage 是唯一存储。
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

// —— 系统 settings（可选增强）：scope ready 时用系统值并回写 localStorage ——
// 只声明用到的客户端 scope 形状，避免客户端 bundle 引入 @deepseek-ai 依赖。
export interface SettingsScopeLike<T> {
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
  set(field: string, value: unknown): Promise<void>
}

let scope: SettingsScopeLike<ThrumConfig> | null = null
let config: ThrumConfig = loadLocal()
const listeners = new Set<(c: ThrumConfig) => void>()

/** 绑定系统 settings namespace 的客户端 scope（由 client.tsx 在 apply 时调用一次）。 */
export function attachSettings(s: SettingsScopeLike<ThrumConfig>): void {
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
  // 触发首次后台读取（不阻塞激活；controller 已排队则无害）
  const p = (s as any).load?.()
  if (p && typeof p.then === 'function') p.catch(() => {})
}

export function getConfig(): ThrumConfig {
  return config
}

/** 修改配置：写 localStorage 持久化；scope 可用时同步写入系统 settings。 */
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
