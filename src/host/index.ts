import z from "@deepseek-ai/schemastery";
import { pluginName, SETTINGS_ENTRY_ID } from "@/shared/identity";
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

/**
 * Settings namespace（= profile entry id，见 src/shared/identity.ts 的 SETTINGS_ENTRY_ID）。
 *
 * dsh ≥ 0.2.0 的 settings 服务（`@deepseek-ai/dsh-settings` 的 `SettingsForms`）不再提供
 * `settingsNamespace` / `installSettingsSection` / `settings.register(ns, schema, { base })` /
 * `scope.watch`；表单直接由各 Loader entry 的 Config schema 投影，按 **entry id** 寻址。
 * 因此这里不再注册任何东西：插件只需导出带 `.volatile()` 的 `Config`，并把 namespace
 * 暴露给浏览器侧（client 经 `ctx.configForms.get(id)` 读写同一 entry）。
 */
export const THRUM_SETTINGS_NAMESPACE = SETTINGS_ENTRY_ID;

/**
 * 插件配置（配置式写法，见 cordis-tutorial/05-config）：
 * - 字段类型、枚举、默认值、归一化集中在 src/shared/config.ts（纯 TS，client 也引用）；
 *   这里用 Schemastery 的 z.object 基于共享 CONFIG_FIELDS 生成同名 schema；
 * - 部署者在 cordis.yml 的 entry config 块覆盖（如 profile 的 cordis.patch.yml）；
 * - Cordis 在 apply 前校验（schema 校验），错误配置直接加载失败；配置变更触发 HMR 热替换。
 *
 * 每个字段都必须 `.volatile()`：0.2.0 的设置表单只投影 volatile 字段
 * （`volatileForm()` 选中最近的 volatile 祖先，普通字段被当作部署期配置排除），
 * 未标 volatile 的 entry 在表单里没有任何可写字段，浏览器侧会一直读不到值。
 * volatile 字段在宿主侧解析为 Observable（`config.flame.get()`）；本插件宿主不消费配置值，
 * 所有视觉/音效都在浏览器侧，所以 apply 不再接收 config。
 */
function buildFieldSchema(f: ConfigFieldSpec): z<any> {
  switch (f.kind) {
    case "boolean":
      return z.boolean().default(f.def).volatile();
    case "number":
      return z.number().min(f.min).max(f.max).default(f.def).volatile();
    case "enum":
      return z
        .union([...f.values])
        .default(f.def)
        .volatile();
  }
}

// —— 对外导出的类型：值导出 Config（schema）保持不变，类型导出 Config 保持 "．" 入口与旧版一致；
// 二者同名（一个值一个类型），TS 允许共存。
export type Config = ConfigShape;

// volatile 字段的 schema 输出类型是 Observable 映射，与纯值形状 ConfigShape 不同；
// 对外仍声明为 z<ConfigShape> 以保持 "." 入口的公开类型不变（解析细节由 loader 负责）。
export const Config = z.object(
  Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, buildFieldSchema(f)])),
) as unknown as z<ConfigShape>;

// SSE 转发帧：host 复用的最小 envelope，携带事件 type 与其可选 data。
interface ThrumFrame {
  type: string;
  data?: unknown;
}

// 需要从 session 日志转发给浏览器的事件类型（AI 生命周期阶段）。
// 与既有 answer-done 兼容：turn/end 仍额外下发 answer-done。
// 注意：0.2.0 起不再有 `assistant/chunk` 这个 session 事件（原始 token 流不属于持久化会话事件），
// 逐 token 流动改由下方 agent/assistant-stream 提供，见 streamChunkText。
const FORWARDED_SESSION_EVENT_TYPES: readonly string[] = [
  "turn/start",
  "turn/end",
  "step/start",
  "step/end",
  "assistant/message",
  "tool/call",
  "tool/result",
];

/**
 * 从 `agent/assistant-stream` 的 chunk 帧里取出可见文本增量。
 *
 * 0.2.0 的实时助手流是进程内事件 `agent/assistant-stream`（`@deepseek-ai/dsh-agent`），
 * 载荷 `{ agent, frame }`，frame 为 start | chunk | end；chunk 帧携带 `@deepseek-ai/dsh-llm`
 * 的 StreamChunk。可持久化的只有最终 assistant/message / assistant/attempt，
 * 所以逐 token 流动只能从这里取（旧版是 session/event 的 assistant/chunk）。
 * 只关心带文本的增量（正文与思考），其余 chunk（block-start/usage/finish…）不计入流速。
 */
function streamChunkText(chunk: unknown): string | null {
  if (!chunk || typeof chunk !== "object") return null;
  const c = chunk as { type?: unknown; text?: unknown };
  if (c.type !== "text-delta" && c.type !== "reasoning-delta") return null;
  return typeof c.text === "string" && c.text.length > 0 ? c.text : null;
}

function sseData(frame: ThrumFrame): string {
  return "data: " + JSON.stringify(frame) + "\n\n";
}

export default {
  inject: ["webServer"],
  apply(ctx: any) {
    // —— 设置页归属：本插件自带「氛围」设置页（client 的 settings.section），
    //    这里声明关闭 settings 的自动生成页（否则 entry 会被再投影出一张空表）。
    //    settings 服务可能缺席（精简组合），所以放在可选 inject 子上下文里；
    //    owner 传本插件 fiber —— 策略挂在插件实例上，服务热替换后仍能重新认领。
    ctx.inject(["settings"], (child: any) => {
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
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

    // 转发实时 token 流：沿用客户端既有的 `assistant/chunk` 线协议（客户端状态机/流速计算不变），
    // 但数据源换成 0.2.0 的 agent/assistant-stream（仅 chunk 帧、仅文本增量）。
    ctx.on("agent/assistant-stream", (payload: any) => {
      const frame = payload?.frame;
      if (!frame || frame.type !== "chunk") return;
      const text = streamChunkText(frame.chunk);
      if (text === null) return;
      broadcast({ type: "assistant/chunk", data: { text } });
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
