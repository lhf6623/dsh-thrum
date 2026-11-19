import type { ReactNode } from "react";
import { clsx } from "clsx";
import { setConfig, ThrumConfig } from "@/client/lib/config";
import { useConfig } from "@/client/hooks/useConfig";
import { useLocale } from "@/client/lib/i18n";

// —— 系统设置面板行模板（对齐 DSH 通用设置）——
const ROW = clsx(
  "thrum-flex",
  "thrum-items-center",
  "thrum-gap-2",
  "thrum-py-3",
  "thrum-border-0",
  "thrum-border-b",
  "thrum-border-solid",
  "thrum-border-[var(--dsw-alias-border-l2)]",
);
const ROW_LAST = clsx(ROW, "thrum-border-b-0");
// 依赖项置灰：仍可见、可看，但不随键盘隐藏而消失（避免列表跳动）
const ROW_DISABLED = "thrum-opacity-60";
const ROW_TEXT = "thrum-flex thrum-flex-col thrum-flex-1 thrum-gap-1 thrum-min-w-0";
const TITLE =
  "thrum-text-[14px] thrum-leading-[22px] thrum-text-[var(--dsw-alias-label-primary)]";
const DESC =
  "thrum-text-[12px] thrum-leading-[18px] thrum-text-[var(--dsw-alias-label-tertiary)]";
const CHECKBOX =
  "thrum-accent-[var(--dsw-alias-brand-primary)] thrum-w-[15px] thrum-h-[15px]";
const RANGE = "thrum-accent-[var(--dsw-alias-brand-primary)] thrum-w-[140px]";
const VALUE =
  "thrum-text-[12px] thrum-text-[var(--dsw-alias-label-tertiary)] thrum-tabular-nums thrum-min-w-10 thrum-text-right";
const SELECT = clsx(
  "thrum-box-border",
  "thrum-h-[30px]",
  "thrum-rounded-md",
  "thrum-border",
  "thrum-border-solid",
  "thrum-border-[rgba(0,0,0,0.25)]",
  "thrum-bg-transparent",
  "thrum-px-2",
  "thrum-text-[13px]",
  "thrum-text-[var(--dsw-alias-label-primary)]",
  "dsh-dark:thrum-border-[rgba(255,255,255,0.2)]",
);

// —— 扁平列表：每个字段一行，没有分组标题、没有总开关 ——
type FieldType = "checkbox" | "range" | "select";

interface FieldDef {
  key: keyof ThrumConfig;
  titleKey: string;
  descKey?: string;
  type: FieldType;
  // range
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  // select
  options?: { value: string; labelKey: string }[];
  /** 依赖「显示键盘与鼠标」：该开关关闭时本行置灰 */
  needsKeyboard?: boolean;
}

const SHAKE_OPTION_KEYS = [
  { value: "off", labelKey: "option.off" },
  { value: "light", labelKey: "option.light" },
  { value: "medium", labelKey: "option.medium" },
  { value: "strong", labelKey: "option.strong" },
];
const MOLE_OPTION_KEYS = [
  { value: "off", labelKey: "option.off" },
  { value: "low", labelKey: "option.low" },
  { value: "medium", labelKey: "option.medium" },
  { value: "high", labelKey: "option.high" },
];
const FLAME_OPTION_KEYS = [
  { value: "off", labelKey: "option.off" },
  { value: "ember", labelKey: "option.ember" },
  { value: "blue", labelKey: "option.blue" },
  { value: "spark", labelKey: "option.spark" },
];
const SOUND_OPTION_KEYS = [
  { value: "off", labelKey: "option.off" },
  { value: "ding", labelKey: "option.ding" },
  { value: "chime", labelKey: "option.chime" },
  { value: "pop", labelKey: "option.pop" },
];

const ITEMS: FieldDef[] = [
  {
    key: "enabled",
    titleKey: "keyboard.visible.label",
    descKey: "keyboard.visible.desc",
    type: "checkbox",
  },
  {
    key: "opacity",
    titleKey: "keyboard.opacity.label",
    type: "range",
    min: 0.1,
    max: 1,
    step: 0.05,
    suffix: "%",
    needsKeyboard: true,
  },
  {
    key: "moleFrequency",
    titleKey: "mole.frequency.label",
    descKey: "mole.frequency.desc",
    type: "select",
    options: MOLE_OPTION_KEYS,
    needsKeyboard: true,
  },
  {
    key: "flame",
    titleKey: "feedback.flame.label",
    descKey: "feedback.flame.desc",
    type: "select",
    options: FLAME_OPTION_KEYS,
  },
  {
    key: "shake",
    titleKey: "feedback.shake.label",
    type: "select",
    options: SHAKE_OPTION_KEYS,
  },
  {
    key: "pageShakeLevel",
    titleKey: "response.pageShake.label",
    type: "select",
    options: SHAKE_OPTION_KEYS,
  },
  {
    key: "sound",
    titleKey: "response.sound.label",
    descKey: "response.sound.desc",
    type: "select",
    options: SOUND_OPTION_KEYS,
  },
  {
    key: "aiFeedback",
    titleKey: "ai.feedback.label",
    type: "checkbox",
  },
];

function Row(props: {
  title: string;
  desc?: string;
  last?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={clsx(props.last ? ROW_LAST : ROW, props.disabled && ROW_DISABLED)}>
      <div className={ROW_TEXT}>
        <div className={TITLE}>{props.title}</div>
        {props.desc ? <div className={DESC}>{props.desc}</div> : null}
      </div>
      {props.children}
    </div>
  );
}

function FieldControl(props: {
  field: FieldDef;
  value: ThrumConfig[keyof ThrumConfig];
  disabled?: boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const { field, value, disabled, onChange } = props;
  const { t } = useLocale();
  if (field.type === "checkbox") {
    return (
      <input
        className={CHECKBOX}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (field.type === "range") {
    return (
      <>
        <input
          className={RANGE}
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={Number(value)}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span className={VALUE}>
          {Math.round(Number(value) * 100)}
          {field.suffix}
        </span>
      </>
    );
  }
  return (
    <select
      className={SELECT}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {(field.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {t(o.labelKey)}
        </option>
      ))}
    </select>
  );
}

/** 独立「氛围」设置标签（settings.section）：扁平列表，字段顺序见 ITEMS。 */
export function ThrumCard() {
  const cfg = useConfig();
  const { t } = useLocale();
  const update = (patch: Partial<ThrumConfig>) => setConfig(patch);
  const setField = (key: keyof ThrumConfig, value: string | number | boolean) =>
    update({ [key]: value } as Partial<ThrumConfig>);

  return (
    <div className="thrum-flex thrum-flex-col">
      {ITEMS.map((item, i) => {
        const disabled = item.needsKeyboard === true && !cfg.enabled;
        return (
          <Row
            key={item.key as string}
            title={t(item.titleKey)}
            desc={item.descKey ? t(item.descKey) : undefined}
            last={i === ITEMS.length - 1}
            disabled={disabled}
          >
            <FieldControl
              field={item}
              value={cfg[item.key]}
              disabled={disabled}
              onChange={(v) => setField(item.key, v)}
            />
          </Row>
        );
      })}
    </div>
  );
}
