import z from "@deepseek-ai/schemastery";
import {
  installSettingsSection,
  settingsNamespace,
} from "@deepseek-ai/dsh-settings";
import { pluginName } from "@/shared/identity";
import {
  CONFIG_FIELDS,
  type Config as ConfigShape,
  type ConfigFieldSpec,
} from "@/shared/config";

// —— 枚举值/类型：唯一真源在 src/shared/config.ts，这里仅再导出以保持对外接口（"." 入口）不变 ——
export {
  SHAKE_LEVELS,
  MOLE_FREQUENCIES,
  FLAME_STYLES,
  SOUND_STYLES,
} from "@/shared/config";
export type {
  ShakeLevel,
  MoleFrequency,
  FlameStyle,
  SoundStyle,
} from "@/shared/config";

export const name = pluginName();

/** Settings namespace owned by this plugin（浏览器侧经 settingsScope 读写）。 */
export const THRUM_SETTINGS_NAMESPACE = settingsNamespace(pluginName());

/**
 * 插件配置（配置式写法，见 cordis-tutorial/05-config）：
 * - 字段类型、枚举、默认值、归一化集中在 src/shared/config.ts（纯 TS，client 也引用）；
 *   这里用 Schemastery 的 z.object 基于共享 CONFIG_FIELDS 生成同名 schema；
 * - 部署者在 cordis.yml 的 entry config 块覆盖（如 profile 的 cordis.patch.yml）；
 * - Cordis 在 apply 前校验（schema 校验），错误配置直接加载失败；配置变更触发 HMR 热替换。
 * 经官方 installSettingsSection（cookbook/adding-a-settings-card）注册为 settings namespace：
 * entry 配置层叠在用户文档之下，解析值 = schema 默认 < cordis.yml entry < 用户覆盖。
 */
function buildFieldSchema(f: ConfigFieldSpec): z<any> {
  switch (f.kind) {
    case "boolean":
      return z.boolean().default(f.def);
    case "number":
      return z.number().min(f.min).max(f.max).default(f.def);
    case "enum":
      return z.union([...f.values]).default(f.def);
  }
}

// —— 对外导出的类型：值导出 Config（schema）保持不变，类型导出 Config 保持 "．" 入口与旧版一致；
// 二者同名（一个值一个类型），TS 允许共存。
export type Config = ConfigShape;

export const Config: z<ConfigShape> = z.object(
  Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, buildFieldSchema(f)])),
) as z<ConfigShape>;

// SSE 转发帧：host 复用的最小 envelope，携带事件 type 与其可选 data。
interface ThrumFrame {
  type: string;
  data?: unknown;
}

// 需要从 session 日志转发给浏览器的事件类型（AI 生命周期阶段）。
// 与既有 answer-done 兼容：turn/end 仍额外下发 answer-done。
const FORWARDED_SESSION_EVENT_TYPES: readonly string[] = [
  "turn/start",
  "turn/end",
  "step/start",
  "step/end",
  "assistant/chunk",
  "assistant/message",
  "tool/call",
  "tool/result",
];

function sseData(frame: ThrumFrame): string {
  return "data: " + JSON.stringify(frame) + "\n\n";
}

export default {
  inject: ["webServer"],
  apply(ctx: any, config: ConfigShape) {
    // host 不消费配置值：所有视觉/音效均在浏览器侧（client）渲染，浏览器经
    // settingsScope 读到同一解析值。宿主只把 entry config 交给 installSettingsSection
    // 作为 settings 的 base 层（schema 校验由 installSettingsSection / settings 服务完成）。
    // 因此 attach / detach / 变更时宿主侧没有需要重算的派生状态 —— 两个 hook 均为空实现，
    // 不再存储/读取 source thunk，避免「保持来源最新但无人消费」的无意义乒乓。
    installSettingsSection(ctx, THRUM_SETTINGS_NAMESPACE, Config, config, {
      setSource: () => {},
      onChange: () => {},
    });

    const connections = new Set<any>();

    function broadcast(frame: ThrumFrame) {
      const line = sseData(frame);
      for (const res of connections) {
        try {
          res.write(line);
        } catch {}
      }
    }

    // 转发 AI 生命周期事件（保留 type+data），并保持既有 answer-done 兼容：
    // turn/end 仍额外下发一条 answer-done，历史客户端行为不变。
    ctx.on("session/event", (_session: any, event: any) => {
      if (!event || typeof event.type !== "string") return;
      if (event.type === "turn/end") broadcast({ type: "answer-done" });
      // 只要命中转发生命周期事件即转发：data 存在则下发 {type,data}，缺失则下发 {type}，
      // 不因 data 缺失而丢弃事件 —— data-less 生命周期帧仍能驱动客户端状态机。
      if (FORWARDED_SESSION_EVENT_TYPES.includes(event.type)) {
        broadcast(
          event.data !== undefined
            ? { type: event.type, data: event.data }
            : { type: event.type },
        );
      }
    });

    ctx.effect(() => {
      const disposeRoute = ctx.webServer.register({
        kind: "exact",
        path: "/api/thrum-events",
        handler: (req: any, res: any) => {
          if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405);
            res.end();
            return;
          }
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          res.write(": connected\n\n");
          connections.add(res);
          res.on("close", () => {
            connections.delete(res);
          });
        },
      });
      return () => {
        disposeRoute();
        for (const res of connections) res.destroy();
        connections.clear();
      };
    });
  },
};
