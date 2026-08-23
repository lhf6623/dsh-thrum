// 纯 TS：配置字段类型、字段规格、默认值、归一化、枚举值与字段名的唯一真源。
// 不 import schemastery / @deepseek-ai —— client bundle 禁止引入这些依赖。
// host/index.ts 用它生成 Schemastery schema；client/lib/config.ts 从这里导入类型/默认值/归一化。

// —— 枚举值（字段可选字面量）——
export const SHAKE_LEVELS = ["off", "light", "medium", "strong"] as const;
export type ShakeLevel = (typeof SHAKE_LEVELS)[number];

export const MOLE_FREQUENCIES = ["off", "low", "medium", "high"] as const;
export type MoleFrequency = (typeof MOLE_FREQUENCIES)[number];

export const FLAME_STYLES = ["off", "ember", "blue", "spark"] as const;
export type FlameStyle = (typeof FLAME_STYLES)[number];

export const SOUND_STYLES = ["off", "ding", "chime", "pop"] as const;
export type SoundStyle = (typeof SOUND_STYLES)[number];

// —— 配置字段类型（接口）——
export interface Config {
  enabled: boolean;
  opacity: number;
  moleFrequency: MoleFrequency;
  feedback: boolean;
  flame: FlameStyle;
  shake: ShakeLevel;
  response: boolean;
  pageShakeLevel: ShakeLevel;
  sound: SoundStyle;
}

// —— 字段规格（唯一真源：字段名、类型约束、默认值）——
// host 用它生成 Schemastery schema；client 用它派生 DEFAULTS 与 normalizeConfig。
export type ConfigFieldSpec =
  | { key: "enabled"; kind: "boolean"; def: boolean }
  | { key: "opacity"; kind: "number"; min: number; max: number; def: number }
  | {
      key: "moleFrequency";
      kind: "enum";
      values: readonly MoleFrequency[];
      def: MoleFrequency;
    }
  | { key: "feedback"; kind: "boolean"; def: boolean }
  | {
      key: "flame";
      kind: "enum";
      values: readonly FlameStyle[];
      def: FlameStyle;
    }
  | {
      key: "shake";
      kind: "enum";
      values: readonly ShakeLevel[];
      def: ShakeLevel;
    }
  | { key: "response"; kind: "boolean"; def: boolean }
  | {
      key: "pageShakeLevel";
      kind: "enum";
      values: readonly ShakeLevel[];
      def: ShakeLevel;
    }
  | {
      key: "sound";
      kind: "enum";
      values: readonly SoundStyle[];
      def: SoundStyle;
    };

export const CONFIG_FIELDS: readonly ConfigFieldSpec[] = [
  { key: "enabled", kind: "boolean", def: true },
  { key: "opacity", kind: "number", min: 0.1, max: 1, def: 0.5 },
  {
    key: "moleFrequency",
    kind: "enum",
    values: MOLE_FREQUENCIES,
    def: "medium",
  },
  { key: "feedback", kind: "boolean", def: true },
  { key: "flame", kind: "enum", values: FLAME_STYLES, def: "ember" },
  { key: "shake", kind: "enum", values: SHAKE_LEVELS, def: "off" },
  { key: "response", kind: "boolean", def: true },
  { key: "pageShakeLevel", kind: "enum", values: SHAKE_LEVELS, def: "off" },
  { key: "sound", kind: "enum", values: SOUND_STYLES, def: "ding" },
];

// 字段名（遍历/校验保持一致，派生自 CONFIG_FIELDS，避免第二处硬编码）
export const CONFIG_FIELD_NAMES = CONFIG_FIELDS.map(
  (f) => f.key,
) as unknown as readonly (keyof Config)[];
export type ConfigFieldName = (typeof CONFIG_FIELD_NAMES)[number];

// —— 已删除/改名的历史字段（旧 localStorage 兼容）——
// 这些键曾存在于旧版本配置，现已从契约中移除或改名：
//   - molePoolSize：旧的「动物池上限」，现固定为 useKeyAnimals 里的 MOLE_POOL_SIZE(10)，无对应字段；
//   - pageShake：旧版「整页抖动强度」的字段名，现改名/重命名 pageShakeLevel。
// 归一化时显式容忍并丢弃这些键（不写入结果），保证旧 localStorage 数据仍能安全读取而不报错。

// —— 默认值（派生自字段规格，与 schema 默认保持一致）——
export const DEFAULTS: Config = Object.fromEntries(
  CONFIG_FIELDS.map((f) => [f.key, f.def]),
) as unknown as Config;

function clamp(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === "number" && !Number.isNaN(v) ? v : def;
  return Math.min(max, Math.max(min, n));
}

// —— 归一化（client 侧 lenient 读取；与 schema 默认语义一致）——
export function normalizeConfig(input: unknown): Config {
  // 迁移：结果只保留 CONFIG_FIELDS 声明的字段，其余一律丢弃。
  // 旧版本的 molePoolSize / pageShake 等键因此被容忍并安全丢弃，
  // 使旧 localStorage 数据读取不报错，且返回值始终是当前契约（Config）形状。
  const o = (input ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of CONFIG_FIELDS) {
    const raw = o[f.key];
    switch (f.kind) {
      case "boolean":
        // 尊重 f.def：raw 缺失时回退字段默认值；否则按布尔真值归一化（当前布尔 def 均 true，行为不变）。
        out[f.key] = raw === undefined ? f.def : raw !== false;
        break;
      case "number":
        out[f.key] = clamp(raw, f.min, f.max, f.def);
        break;
      case "enum":
        // 兼容旧布尔持久化值：true -> 该字段默认值（如 ember/ding），false -> "off"；
        // 否则仅接受合法字面量，非法/缺失时回退字段默认值。
        if (typeof raw === "boolean") {
          out[f.key] = raw ? (f.def as string) : "off";
        } else {
          out[f.key] = (f.values as readonly unknown[]).includes(raw)
            ? raw
            : f.def;
        }
        break;
    }
  }
  return out as unknown as Config;
}
