import { getConfig } from '../config'
import type { SoundStyle } from '@/shared/config'
import { onKeyDown } from '../events/keyboard'
import { onMouseDown } from '../events/mouse'

let audioCtx: AudioContext | null = null

function ensureAudio(): AudioContext | null {
  if (!audioCtx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    audioCtx = new AC()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

export function primeAudio(): void {
  try { ensureAudio() } catch {}
}

// —— 按样式播放的函数映射（与 SOUND_STYLES 一一对应）；缺省回退 ding ——
type SoundPlayer = (ctx: AudioContext, now: number) => void

function playDing(ctx: AudioContext, now: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.06)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.55)
}

function playChime(ctx: AudioContext, now: number): void {
  const notes = [659.25, 880, 1318.5]
  for (let i = 0; i < notes.length; i++) {
    const start = now + i * 0.08
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(notes[i], start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.55)
  }
}

function playPop(ctx: AudioContext, now: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(320, now)
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.12)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.15)
}

const SOUND_PLAYERS: Record<SoundStyle, SoundPlayer> = {
  off: () => {},
  ding: playDing,
  chime: playChime,
  pop: playPop,
}

export function playAnswerSound(): void {
  const cfg = getConfig()
  // 回答反馈组总开关：关闭（response=false）时提示音也停
  if (cfg.response === false || cfg.sound === 'off') return
  let ctx: AudioContext | null = null
  try { ctx = ensureAudio() } catch {}
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const play = SOUND_PLAYERS[cfg.sound] ?? SOUND_PLAYERS.ding
    play(ctx, now)
  } catch {}
}

/**
 * 页面级效果：首个键鼠手势解锁 AudioContext（浏览器自动播放限制）。
 * 订阅键盘/鼠标事件源，与其他按键/鼠标消费者互不知晓。返回 disposer。
 */
export function attachAudioPrime(): () => void {
  const offKey = onKeyDown(() => primeAudio())
  const offMouse = onMouseDown(() => primeAudio())
  return () => { offKey(); offMouse() }
}
