import { Overlay } from "./components/Overlay";
import { ThrumCard } from "./components/ThrumCard";
import { playAnswerSound, attachAudioPrime } from "./lib/fx/audio";
import { shakePage, attachInputShake } from "./lib/fx/shake";
import { attachFlame } from "./lib/fx/flame";
import { attachAiPresence, feedAiPresence } from "./lib/fx/motion";
import { attachSettings, normalizeConfig } from "./lib/config";
import { installI18n, t } from "./lib/i18n";
import { pluginName } from "@/shared/identity";

export const inject = [
  "slots",
  "connection",
  "remote",
  "settingsScope",
  "locale",
];

export function apply(ctx: any) {
  installI18n(ctx.locale);
  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register({ name: "shell.overlay", id: pluginName() }, Overlay),
  );
  // 独立「氛围」设置标签（settings.section）：显示不依赖 api-proxy 白名单，
  // 与系统设置面板同级的单独配置页。
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "thrum",
        order: 5,
        label: () => t("section"),
      },
      ThrumCard,
    ),
  );
  // 绑定系统 settings namespace：配置来自 cordis.yml（Config schema）经 settings 服务解析，
  // 浏览器只读；namespace 未被 api-proxy 白名单暴露时 scope 为 unavailable，读取默认值。
  ctx.inject(["settingsScope"], (sctx: any) => {
    const scope = sctx.settingsScope.bind({
      namespace: pluginName(),
      decode: (raw: unknown) => normalizeConfig(raw),
    });
    attachSettings(scope);
  });
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
