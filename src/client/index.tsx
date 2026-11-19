import { Overlay } from "./components/Overlay";
import { ThrumCard } from "./components/ThrumCard";
import { playAnswerSound, attachAudioPrime } from "./lib/fx/audio";
import { shakePage, attachInputShake } from "./lib/fx/shake";
import { attachFlame } from "./lib/fx/flame";
import { attachAiPresence, feedAiPresence } from "./lib/fx/motion";
import { attachSettings } from "./lib/config";
import { installI18n, t } from "./lib/i18n";
import { pluginName, SETTINGS_ENTRY_ID } from "@/shared/identity";

// configForms：0.2.0 的设置传输面（提供者是 dsh-client-ui-settings，取代已删除的 settingsScope）。
// remote：settings 失效通知随它转发（configForms 的镜像据此刷新），与 ui-theme/ui-chat 同款依赖。
export const inject = ["slots", "remote", "configForms", "locale"];

export function apply(ctx: any) {
  // 副作用都交给 ctx.effect：模块热替换时先释放旧注册，再跑新模块的 apply。
  // 尤其 i18n 的 locale 注册（同 namespace+locale 只允许一个所有者）。
  ctx.effect(() => installI18n(ctx.locale));
  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register({ name: "shell.overlay", id: pluginName() }, Overlay),
  );
  // 独立「氛围」设置标签（settings.section）：显示不依赖 api-proxy 白名单，
  // 与系统设置面板同级的单独配置页。
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: SETTINGS_ENTRY_ID,
        order: 5,
        label: () => t("section"),
      },
      ThrumCard,
    ),
  );
  // 绑定插件自己的 settings 表单：0.2.0 的表单按 **profile entry id** 寻址
  // （见 shared/identity 的 SETTINGS_ENTRY_ID，必须与 cordis.patch.yml 的宿主行 id 一致），
  // 读取 host 的 Config schema 解析值（schema 默认 < cordis.yml entry < 用户覆盖）。
  // namespace 未暴露/远端非 loopback 时快照为 unavailable，读取本地 localStorage 默认值。
  // 写入经表单 set(field, value)，由 settings 文档持久化（不再走 localStorage→scope 的回写协议）。
  ctx.effect(() => attachSettings(ctx.configForms.get(SETTINGS_ENTRY_ID)));
  // 页面级特效（无 React 组件）：火焰 / 输入抖动 / 音频解锁，各自独立，经 ctx.effect 挂载并自动清理
  ctx.effect(attachFlame);
  ctx.effect(attachInputShake);
  ctx.effect(attachAudioPrime);
  // AI 陪伴占位动效：订阅生命周期事件，低打扰光点占位（可关、尊重 reduced-motion）。
  ctx.effect(attachAiPresence);
  if (typeof EventSource !== "undefined") {
    ctx.effect(() => {
      const es = new EventSource("/api/thrum-events");
      es.onmessage = (e) => {
        let data: any = null;
        try {
          data = JSON.parse(e.data);
        } catch {}
        // 生命周期事件（turn/*|step/*|assistant/*|tool/*）喂给 AI 陪伴状态机；
        // answer-done 等非生命周期帧在 feedAiPresence 内部被忽略。
        feedAiPresence(data);
        if (data && data.type === "answer-done") {
          playAnswerSound();
          shakePage();
        }
      };
      return () => {
        es.close();
      };
    });
  }
}
