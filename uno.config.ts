import { defineConfig, presetMini } from "unocss";

// 所有 UnoCSS 生成的原子类都带 vibe- 前缀，避免与 DSH 自身的类名冲突。
// dsh-dark: 变体跟随 DSH 的深色模式属性 body[data-ds-dark-theme]，
// 用于把键帽/鼠标等组件的深色配色也写成原子类。
export default defineConfig({
  presets: [presetMini({ prefix: "vibe-" })],
  // presetMini 未覆盖的翻转 3D/过渡类，这里补成 atom class（带 vibe- 前缀）。
  rules: [
    ["vibe-preserve-3d", { "transform-style": "preserve-3d" }],
    ["vibe-perspective-260", { perspective: "260px" }],
    ["vibe-transition-transform", { "transition-property": "transform" }],
    ["vibe-rotate-y-0", { transform: "rotateY(0deg)" }],
    ["vibe-rotate-y-180", { transform: "rotateY(180deg)" }],
    ["vibe-translate-z-half", { transform: "translateZ(0.5px)" }],
    [
      "vibe-rotate-y-180-translate-z-half",
      { transform: "rotateY(180deg) translateZ(0.5px)" },
    ],
    ["vibe-vis-delay-show", { transition: "visibility 0s 0s" }],
    ["vibe-vis-delay-hide", { transition: "visibility 0s 600ms" }],
  ],
  variants: [
    (matcher: string) => {
      if (!matcher.startsWith("dsh-dark:")) return matcher;
      return {
        matcher: matcher.slice(9),
        selector: (s: string) => `body[data-ds-dark-theme] ${s}`,
      };
    },
    (matcher: string) => {
      if (!matcher.startsWith("motion-reduce:")) return matcher;
      return {
        matcher: matcher.slice("motion-reduce:".length),
        // 减弱动态时关闭过渡：用 parent 字段把规则包进 at-rule，语义等价于
        // presetMini 内部 variantParentMatcher(name, "@media (prefers-reduced-motion: reduce)")。
        parent: "@media (prefers-reduced-motion: reduce)",
      };
    },
  ],
});
