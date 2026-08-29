// [code, label, width] — width in key units (1u = 30px key + 5px gap).
// code === '_spacer' renders a fixed-width gap.
export type KeyDef = [code: string, label: string, width: number];

export const ROWS: KeyDef[][] = [
  [
    ["Escape", "Esc", 1],
    ["_spacer", "", 18],
    ["F1", "F1", 1],
    ["F2", "F2", 1],
    ["F3", "F3", 1],
    ["F4", "F4", 1],
    ["_spacer", "", 18],
    ["F5", "F5", 1],
    ["F6", "F6", 1],
    ["F7", "F7", 1],
    ["F8", "F8", 1],
    ["_spacer", "", 18],
    ["F9", "F9", 1],
    ["F10", "F10", 1],
    ["F11", "F11", 1],
    ["F12", "F12", 1],
  ],
  [
    ["Backquote", "~", 1],
    ["Digit1", "1", 1],
    ["Digit2", "2", 1],
    ["Digit3", "3", 1],
    ["Digit4", "4", 1],
    ["Digit5", "5", 1],
    ["Digit6", "6", 1],
    ["Digit7", "7", 1],
    ["Digit8", "8", 1],
    ["Digit9", "9", 1],
    ["Digit0", "0", 1],
    ["Minus", "-", 1],
    ["Equal", "=", 1],
    ["Backspace", "Del", 2],
  ],
  [
    ["Tab", "Tab", 1.5],
    ["KeyQ", "Q", 1],
    ["KeyW", "W", 1],
    ["KeyE", "E", 1],
    ["KeyR", "R", 1],
    ["KeyT", "T", 1],
    ["KeyY", "Y", 1],
    ["KeyU", "U", 1],
    ["KeyI", "I", 1],
    ["KeyO", "O", 1],
    ["KeyP", "P", 1],
    ["BracketLeft", "[", 1],
    ["BracketRight", "]", 1],
    ["Backslash", "\\", 1.5],
  ],
  [
    ["CapsLock", "Caps", 1.8],
    ["KeyA", "A", 1],
    ["KeyS", "S", 1],
    ["KeyD", "D", 1],
    ["KeyF", "F", 1],
    ["KeyG", "G", 1],
    ["KeyH", "H", 1],
    ["KeyJ", "J", 1],
    ["KeyK", "K", 1],
    ["KeyL", "L", 1],
    ["Semicolon", ";", 1],
    ["Quote", "'", 1],
    ["Enter", "Enter", 2.2],
  ],
  [
    ["ShiftLeft", "Shift", 2.3],
    ["KeyZ", "Z", 1],
    ["KeyX", "X", 1],
    ["KeyC", "C", 1],
    ["KeyV", "V", 1],
    ["KeyB", "B", 1],
    ["KeyN", "N", 1],
    ["KeyM", "M", 1],
    ["Comma", ",", 1],
    ["Period", ".", 1],
    ["Slash", "/", 1],
    ["ShiftRight", "Shift", 2.7],
  ],
  [
    ["ControlLeft", "Ctrl", 1.5],
    ["MetaLeft", "Cmd", 1.3],
    ["AltLeft", "Alt", 1.3],
    ["Space", "", 6.7],
    ["AltRight", "Alt", 1.3],
    ["MetaRight", "Cmd", 1.3],
    ["ControlRight", "Ctrl", 1.5],
  ],
];

// —— 自适应布局宽度常量（派生自 ROWS，单一真源，避免硬编码）——
// 键帽总宽公式与 Key.tsx 保持一致：keyWidthPx(w) = round(w*30 + (w-1)*5)。
// 行内水平间距固定 5px（KeyboardMain 行容器 thrum-gap-[5px]）；spacer 为 18px 固定占位。

export const KEY_UNIT = 30;
export const KEY_GAP = 5;
export const SPACER_WIDTH = 18;

/** 单个键帽渲染宽度（像素）：与 Key.tsx 的 `Math.round(w*30 + (w-1)*5)` 一致。 */
export function keyWidthPx(w: number): number {
  return Math.round(w * KEY_UNIT + (w - 1) * KEY_GAP);
}

/** 一行键盘的像素总宽：键帽宽度和 + 行内间隙（含 spacer 占位）。 */
export function rowWidthPx(row: KeyDef[]): number {
  let sum = 0;
  for (const [code, , w] of row) {
    sum += code === "_spacer" ? SPACER_WIDTH : keyWidthPx(w);
  }
  return sum + (row.length - 1) * KEY_GAP;
}

/** 键盘本体自然宽度：最宽一行的像素宽度。 */
export const KEYBOARD_NATURAL_WIDTH = Math.max(...ROWS.map(rowWidthPx));

/** 右侧列（鼠标 + 方向键）宽度：与 Overlay 右侧 col 一致（ArrowView 最宽 100px）。 */
export const SIDE_COLUMN_WIDTH = 100;

/** 键盘与右侧列之间的水平间距（Overlay 根容器 thrum-gap-[3px]）。 */
export const SIDE_GAP = 3;

/** 完整布局（键盘 + 右侧列）宽度：composer 达到该宽度才展示右侧列。 */
export const KEYBOARD_FULL_WIDTH =
  KEYBOARD_NATURAL_WIDTH + SIDE_GAP + SIDE_COLUMN_WIDTH;
