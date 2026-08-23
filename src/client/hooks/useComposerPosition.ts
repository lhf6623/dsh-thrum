import { useEffect, useState } from "react";

/**
 * 输入框上方悬浮层的位置测量：bottom = 距视口底部，left = composer 水平中心。
 *
 * 定位锚点直接取 composer 自身的 bounding rect（视觉中心），而非猜 shell 的 grid 列：
 * getBoundingClientRect() 是布局后的最终真值，天然包含右侧插件面板、滚动条 gutter、
 * sticky/absolute seat、中列内的子网格等一切 factor。若强依赖 gridTemplateColumns，
 * 一旦右侧被插件占用（面板收窄中列 / 加额外列）、出现滚动条、或 CSS 过渡进行中读到的是
 * 目标终值而非当前渲染值，中心就会偏移；解析失败时更会退化为 null 把键盘整体隐藏。
 *
 * 用同一个 rect 同时算 left 与 bottom，避免两套测量互相漂移。
 *
 * 监听来源：视口缩放、任意滚动（含内部容器，capture 捕获）、ResizeObserver
 * （composer seat + body + documentElement，覆盖内容增长把输入框往下推），以及
 * MutationObserver（frame 上 style/class/折叠态、子节点重排）。用 rAF 合并高频触发，
 * 只有位置实际变化才更新 state。
 */
export function useComposerPosition(): {
  bottom: number;
  left: number;
  width: number;
} {
  const [bottom, setBottom] = useState(170);
  const [left, setLeft] = useState<number>(() =>
    typeof window === "undefined" ? 0 : Math.round(window.innerWidth / 2),
  );
  // composer 宽度：驱动 Overlay 的自适应布局（完整 / 仅键盘 / 隐藏）。
  const [width, setWidth] = useState<number>(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );

  useEffect(() => {
    function measure() {
      const el =
        document.querySelector("[data-composer-card]") ||
        document.querySelector("[data-composer-seat]");
      if (el) {
        // 同一个 rect 同时得出水平中心与底部距离，消除两类测量的漂移。
        const rect = el.getBoundingClientRect();
        // 锚点必须可测（display:none 等会返回 0 矩形）：此时视作找不到，走下方 fallback。
        if (rect.width > 0 || rect.height > 0) {
          const l = Math.round(rect.left + rect.width / 2);
          const b = Math.round(window.innerHeight - rect.top + 10);
          const w = Math.round(rect.width);
          setLeft((prev) => (prev === l ? prev : l));
          setBottom((prev) => (prev === b ? prev : b));
          setWidth((prev) => (prev === w ? prev : w));
          return;
        }
      }
      // fallback：找不到锚点（或不可测）时用视口中心，键盘仍显示而非消失。
      // 宽度同样视作足够宽（显示完整键盘），避免误隐藏。
      const l = Math.round(window.innerWidth / 2);
      setLeft((prev) => (prev === l ? prev : l));
      setWidth((prev) =>
        prev === window.innerWidth ? prev : window.innerWidth,
      );
    }
    let rafId: number | null = null;
    function scheduleMeasure() {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    }
    measure();
    window.addEventListener("resize", scheduleMeasure);
    // capture 阶段监听，覆盖所有内部滚动容器（聊天区滚动也会移动输入框）
    window.addEventListener("scroll", scheduleMeasure, true);
    let obs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      obs = new ResizeObserver(scheduleMeasure);
      const seat =
        document.querySelector("[data-composer-card]") ||
        document.querySelector("[data-composer-seat]");
      if (seat) obs.observe(seat);
      // 内容增长（如 AI 流式回复）会把输入框往下推：观察 body/html 尺寸变化
      obs.observe(document.body);
      obs.observe(document.documentElement);
    }
    let mo: MutationObserver | null = null;
    const ov = document.querySelector("[data-shell-overlay]");
    const fr = ov ? ov.parentElement : null;
    if (fr && typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(scheduleMeasure);
      // childList + subtree：输入框被移动/重排、聊天内容插入等都会触发重新测量
      mo.observe(fr, {
        attributes: true,
        attributeFilter: [
          "style",
          "class",
          "data-sidebar-collapsed",
          "data-details-collapsed",
        ],
        childList: true,
        subtree: true,
      });
    }
    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (obs) obs.disconnect();
      if (mo) mo.disconnect();
    };
  }, []);

  return { bottom, left, width };
}
