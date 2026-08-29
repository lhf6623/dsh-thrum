import { MouseState } from "@/client/hooks/useMouseState";
import { clsx } from "clsx";

// —— 鼠标：机身/按键/滚轮，配色按状态二选一渲染 ——
const MOUSE_BODY = clsx(
  "thrum-relative thrum-w-[58px] thrum-h-[90px] thrum-rounded-[28px_28px_22px_22px]",
  "thrum-border thrum-border-solid thrum-border-[rgba(0,0,0,0.2)]",
  "thrum-bg-[rgba(255,255,255,0.25)]",
  "thrum-shadow-[0_1px_4px_rgba(0,0,0,0.2)]",
  "dsh-dark:thrum-border-[rgba(255,255,255,0.14)]",
  "dsh-dark:thrum-bg-[rgba(255,255,255,0.07)]",
  "dsh-dark:thrum-shadow-[0_1px_4px_rgba(0,0,0,0.45)]",
);

const MOUSE_BTN = clsx(
  "thrum-absolute thrum-top-0 thrum-w-1/2 thrum-h-[40px]",
  "thrum-border-0 thrum-border-b thrum-border-solid thrum-border-b-[rgba(0,0,0,0.18)]",
  "thrum-transition-[background-color]",
  "dsh-dark:thrum-border-b-[rgba(255,255,255,0.12)]",
);

const MOUSE_BTN_ON =
  "thrum-bg-[rgba(88,150,255,0.18)] dsh-dark:thrum-bg-[rgba(88,150,255,0.3)]";

const WHEEL_BASE = clsx(
  "thrum-absolute thrum-left-1/2 thrum-translate-x--1/2 thrum-w-[9px] thrum-h-[20px] thrum-rounded-[5px]",
  "thrum-border thrum-border-solid thrum-border-[rgba(0,0,0,0.2)]",
  "thrum-transition-[background-color,top]",
  "dsh-dark:thrum-border-[rgba(255,255,255,0.18)]",
);

export function MouseView(props: { mouse: MouseState }) {
  const m = props.mouse;
  const wheelTop = m.middle ? "thrum-top-[6px]" : "thrum-top-[20px]";
  const wheelBg = m.wheel
    ? "thrum-bg-[rgba(88,150,255,0.3)] dsh-dark:thrum-bg-[rgba(88,150,255,0.42)]"
    : "thrum-bg-[rgba(150,150,150,0.55)] dsh-dark:thrum-bg-[rgba(200,200,200,0.42)]";
  return (
    <div className={MOUSE_BODY}>
      <div
        className={clsx(
          MOUSE_BTN,
          "thrum-left-0",
          "thrum-rounded-tl-[28px]",
          m.left && MOUSE_BTN_ON,
        )}
      />
      <div
        className={clsx(
          MOUSE_BTN,
          "thrum-right-0",
          "thrum-rounded-tr-[28px]",
          m.right && MOUSE_BTN_ON,
        )}
      />
      <div className={clsx(WHEEL_BASE, wheelTop, wheelBg)} />
    </div>
  );
}
