import type { CSSProperties } from "react";
import { clsx } from "clsx";
import { useConfig } from "@/client/hooks/useConfig";
import { useMouseState } from "@/client/hooks/useMouseState";
import { useComposerPosition } from "@/client/hooks/useComposerPosition";
import { useKeyAnimals } from "./keyboard/useKeyAnimals";
import { KeyboardMain } from "./keyboard/KeyboardMain";
import { ArrowView } from "./keyboard/ArrowView";
import { MouseView } from "./keyboard/MouseView";
import { KEYBOARD_NATURAL_WIDTH, KEYBOARD_FULL_WIDTH } from "./keyboard/layout";

export function Overlay() {
  const cfg = useConfig();
  const mouse = useMouseState();
  const { bottom, left, width } = useComposerPosition();
  const animals = useKeyAnimals();

  // 自适应：按 composer 宽度决定渲染模式。
  //   full    ：能容纳键盘 + 右侧列（≥ KEYBOARD_FULL_WIDTH）。
  //   keyboard：仅放得下键盘（≥ KEYBOARD_NATURAL_WIDTH），隐藏右侧列。
  //   hidden  ：连键盘都放不下（< KEYBOARD_NATURAL_WIDTH），整体不渲染。
  const mode =
    width >= KEYBOARD_FULL_WIDTH
      ? "full"
      : width >= KEYBOARD_NATURAL_WIDTH
        ? "keyboard"
        : "hidden";

  const rootStyle: CSSProperties = { bottom: bottom + "px", left: left + "px" };
  rootStyle.opacity = cfg.opacity;

  // 定位逻辑保持不变（composer 中心锚 + fallback）；仅当宽度不足时整体隐藏。
  if (mode === "hidden") return null;

  const keyboard = (
    <div
      className={clsx(
        "vibe-fixed vibe-z-40 vibe-pointer-events-none vibe-origin-[50%_100%] vibe-transition-[left,bottom] vibe-duration-100 [@media(max-width:920px)]:vibe-hidden motion-reduce:vibe-transition-none",
        "vibe-translate-x--1/2",
        !cfg.enabled && "vibe-hidden",
      )}
      style={rootStyle}
    >
      <div className="vibe-flex vibe-items-stretch vibe-gap-[3px]">
        <KeyboardMain animals={animals} />
        {mode === "full" && (
          <div className="vibe-flex vibe-flex-col vibe-justify-between vibe-items-center">
            <MouseView mouse={mouse} />
            <ArrowView animals={animals} />
          </div>
        )}
      </div>
    </div>
  );

  return keyboard;
}
