import { useSyncExternalStore } from "react";

export const LOCALE_NS = "thrum";

/** DSH 客户端 locale 服务的最小形状（由 @deepseek-ai/dsh-client-locale 提供）。 */
export interface LocaleService {
  register(
    ns: string,
    dicts: Record<string, Record<string, string>>,
  ): () => void;
  getSnapshot(): { active: string; revision: number };
  subscribe(fn: () => void): () => void;
  bind(ns: string): (key: string) => string;
}

const zh: Record<string, string> = {
  section: "氛围",
  "group.appearance": "键盘外观",
  "group.typing": "打字反馈",
  "group.response": "回答反馈",
  "keyboard.opacity.label": "键盘透明度",
  "mole.frequency.label": "翻出频率",
  "mole.frequency.desc": "空闲自动翻出节奏；「关」=不自动翻，按键翻出并自动翻回",
  "feedback.flame.label": "打字火焰",
  "feedback.shake.label": "输入抖动",
  "response.pageShake.label": "整页抖动强度",
  "response.sound.label": "回答提示音",
  "option.off": "关",
  "option.light": "轻",
  "option.medium": "中",
  "option.strong": "强",
  "option.low": "低",
  "option.high": "高",
  "option.ember": "火星",
  "option.blue": "蓝焰",
  "option.spark": "花火",
  "option.ding": "叮",
  "option.chime": "风铃",
  "option.pop": "泡泡",
  "feedback.flame.desc": "打字光标处喷出的粒子样式；「关」=不显示",
  "response.sound.desc": "回答完成时的提示音；「关」=不播放",
  "group.aiFeedback": "AI 陪伴",
};

const en: Record<string, string> = {
  section: "Thrum",
  "group.appearance": "Keyboard",
  "group.typing": "Typing Feedback",
  "group.response": "Answer Feedback",
  "keyboard.opacity.label": "Keyboard Opacity",
  "mole.frequency.label": "Mole Frequency",
  "mole.frequency.desc": "Idle flip cadence; Off = no auto flip, keys flip then return",
  "feedback.flame.label": "Typing Flame",
  "feedback.shake.label": "Input Shake",
  "response.pageShake.label": "Page Shake Level",
  "response.sound.label": "Answer Sound",
  "option.off": "Off",
  "option.light": "Light",
  "option.medium": "Medium",
  "option.strong": "Strong",
  "option.low": "Low",
  "option.high": "High",
  "option.ember": "Ember",
  "option.blue": "Blue",
  "option.spark": "Spark",
  "option.ding": "Ding",
  "option.chime": "Chime",
  "option.pop": "Pop",
  "feedback.flame.desc": "Particle style at the typing caret; Off = hidden",
  "response.sound.desc": "Sound when an answer finishes; Off = silent",
  "group.aiFeedback": "AI Companion",
};

let service: LocaleService | null = null;
let locale = "zh";
let translate: (key: string) => string = (key) => key;
const listeners = new Set<() => void>();

function sync(): void {
  if (!service) return;
  locale = service.getSnapshot().active;
  translate = service.bind(LOCALE_NS);
  for (const fn of listeners) fn();
}

/** 注册本插件字典并订阅 locale 服务（客户端入口 apply 时调用一次）。 */
export function installI18n(s: LocaleService): void {
  s.register(LOCALE_NS, { zh, en });
  service = s;
  sync();
  s.subscribe(sync);
}

/** 当前语言 id：zh / en。 */
export function getLocale(): string {
  return locale;
}

/** 按当前语言取文案的翻译函数。 */
export function getT(): (key: string) => string {
  return translate;
}

/** 取当前语言的一段文案。 */
export function t(key: string): string {
  return translate(key);
}

/** React 版：订阅 locale 变更，随语言切换重渲染。 */
export function useLocale(): { locale: string; t: (key: string) => string } {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => locale,
  );
  return { locale, t: translate };
}
