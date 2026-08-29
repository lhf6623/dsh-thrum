import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

// —— 键帽：单一静态外观（按键反馈由动物翻面表达）——
const KEY_BASE = clsx(
  "thrum-flex thrum-items-center thrum-justify-center thrum-h-[30px] thrum-box-border thrum-rounded-md thrum-border thrum-border-solid thrum-text-[10px] thrum-font-mono",
  "thrum-border-[rgba(0,0,0,0.2)]",
  "thrum-bg-[rgba(255,255,255,0.25)]",
  "thrum-text-[rgba(0,0,0,0.45)]",
  "thrum-shadow-[0_1px_0_rgba(0,0,0,0.08)]",
  "dsh-dark:thrum-border-[rgba(255,255,255,0.14)]",
  "dsh-dark:thrum-bg-[rgba(255,255,255,0.07)]",
  "dsh-dark:thrum-text-[rgba(255,255,255,0.72)]",
  "dsh-dark:thrum-shadow-[0_1px_0_rgba(0,0,0,0.35)]",
);

export function Key(props: { label: string; w: number; animal?: string }) {
  const flipRef = useRef<HTMLDivElement | null>(null);
  // 背面展示的动物：props.animal 消失时先播翻回动画、结束再清空（避免动物瞬移消失）；
  // 已翻面时换动物只替换内容，不重播动画。
  const [shown, setShown] = useState<string | undefined>(props.animal);
  const [flipped, setFlipped] = useState(false);
  const flippedRef = useRef(false);

  useEffect(() => {
    if (props.animal !== undefined) {
      setShown(props.animal);
      setFlipped(true);
      flippedRef.current = true;
      return;
    }
    if (!flippedRef.current) return;
    flippedRef.current = false;
    setFlipped(false);
    const el = flipRef.current;
    if (!el) {
      setShown(undefined);
      return;
    }
    const onEnd = (ev: TransitionEvent) => {
      if (ev.propertyName !== "transform") return;
      setShown(undefined);
      el.removeEventListener("transitionend", onEnd);
    };
    el.addEventListener("transitionend", onEnd);
    return () => el.removeEventListener("transitionend", onEnd);
  }, [props.animal]);

  return (
    <div
      className={clsx(KEY_BASE, "thrum-relative", "thrum-perspective-260")}
      style={{
        width: Math.round(props.w * 30 + (props.w - 1) * 5) + "px",
      }}
    >
      {/* 键帽不动，内部内容层翻面；transition 驱动出现/离开的翻面动画 */}
      <div
        ref={flipRef}
        className={clsx(
          "thrum-absolute thrum-inset-0 thrum-preserve-3d thrum-transition-transform thrum-duration-600 thrum-ease-in-out",
          flipped ? "thrum-rotate-y-180" : "thrum-rotate-y-0",
        )}
      >
        <div
          className={clsx(
            "thrum-absolute thrum-inset-0 thrum-flex thrum-items-center thrum-justify-center thrum-backface-hidden thrum-translate-z-half",
            flipped
              ? "thrum-invisible thrum-vis-delay-hide"
              : "thrum-visible thrum-vis-delay-show",
          )}
        >
          {props.label}
        </div>
        <div
          className={clsx(
            "thrum-absolute thrum-inset-0 thrum-flex thrum-items-center thrum-justify-center thrum-backface-hidden thrum-rotate-y-180-translate-z-half thrum-text-[20px] thrum-leading-none",
            flipped
              ? "thrum-visible thrum-vis-delay-show"
              : "thrum-invisible thrum-vis-delay-hide",
          )}
        >
          {shown ?? ""}
        </div>
      </div>
    </div>
  );
}
