import { Fragment } from "react";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import { setConfig, VibeConfig } from "@/client/lib/config";
import { useConfig } from "@/client/hooks/useConfig";
import { useLocale } from "@/client/lib/i18n";

// —— 系统设置面板行模板（对齐 DSH 通用设置）——
const ROW = clsx(
  "vibe-flex",
  "vibe-items-center",
  "vibe-gap-2",
  "vibe-py-4",
  "vibe-border-0",
  "vibe-border-b",
  "vibe-border-solid",
  "vibe-border-[var(--dsw-alias-border-l2)]",
);
const ROW_LAST = clsx(ROW, "vibe-border-b-0");
// 主开关标题行：加粗标题 + 左右对称，无底边框（关闭时不留残线；非首组加顶部边框分隔）
const HEAD_ROW =
  "vibe-flex vibe-items-center vibe-justify-between vibe-gap-2 vibe-py-4";
const HEAD_ROW_DIV = clsx(
  HEAD_ROW,
  "vibe-border-0",
  "vibe-border-t",
  "vibe-border-solid",
  "vibe-border-[var(--dsw-alias-border-l2)]",
  "vibe-mt-3",
);
// 子项行：左缩进形成层级
const INDENT = clsx("vibe-pl-6");
const ROW_TEXT = "vibe-flex vibe-flex-col vibe-flex-1 vibe-gap-1 vibe-min-w-0";
const TITLE =
  "vibe-text-[14px] vibe-leading-[22px] vibe-text-[var(--dsw-alias-label-primary)]";
const DESC =
  "vibe-text-[12px] vibe-leading-[18px] vibe-text-[var(--dsw-alias-label-tertiary)]";
// 主开关行标题：加粗，与子项区分
const HEAD_TITLE = clsx(TITLE, "vibe-font-semibold");
const CHECKBOX =
  "vibe-accent-[var(--dsw-alias-brand-primary)] vibe-w-[15px] vibe-h-[15px]";
const RANGE = "vibe-accent-[var(--dsw-alias-brand-primary)] vibe-w-[140px]";
const VALUE =
  "vibe-text-[12px] vibe-text-[var(--dsw-alias-label-tertiary)] vibe-tabular-nums vibe-min-w-10 vibe-text-right";
const SELECT = clsx(
  "vibe-box-border",
  "vibe-h-[30px]",
  "vibe-rounded-md",
  "vibe-border",
  "vibe-border-solid",
  "vibe-border-[rgba(0,0,0,0.25)]",
  "vibe-bg-transparent",
  "vibe-px-2",
  "vibe-text-[13px]",
  "vibe-text-[var(--dsw-alias-label-primary)]",
  "dsh-dark:vibe-border-[rgba(255,255,255,0.2)]",
);

// —— 数据驱动：每项配置描述一个字段类型，渲染器按类型出控件；文案用 i18n key ——
type FieldType = "checkbox" | "range" | "select";

interface FieldDef {
  key: keyof VibeConfig;
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
  last?: boolean;
}

interface GroupDef {
  master: keyof VibeConfig;
  titleKey: string;
  fields: FieldDef[];
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

const GROUPS: GroupDef[] = [
  {
    master: "enabled",
    titleKey: "group.appearance",
    fields: [
      {
        key: "opacity",
        titleKey: "keyboard.opacity.label",
        type: "range",
        min: 0.1,
        max: 1,
        step: 0.05,
        suffix: "%",
      },
      {
        key: "moleFrequency",
        titleKey: "mole.frequency.label",
        descKey: "mole.frequency.desc",
        type: "select",
        options: MOLE_OPTION_KEYS,
        last: true,
      },
    ],
  },
  {
    master: "feedback",
    titleKey: "group.typing",
    fields: [
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
        last: true,
      },
    ],
  },
  {
    master: "response",
    titleKey: "group.response",
    fields: [
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
        last: true,
      },
    ],
  },
];

function Row(props: {
  title: string;
  desc?: string;
  last?: boolean;
  indent?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={clsx(props.last ? ROW_LAST : ROW, props.indent && INDENT)}>
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
  value: VibeConfig[keyof VibeConfig];
  onChange: (value: string | number | boolean) => void;
}) {
  const { field, value, onChange } = props;
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

/** 独立「氛围」设置标签（settings.section）：按 GROUPS 数据渲染，文案随 DSH 语言自动切换。 */
export function VibeCard() {
  const cfg = useConfig();
  const { t } = useLocale();
  const update = (patch: Partial<VibeConfig>) => setConfig(patch);
  const setField = (key: keyof VibeConfig, value: string | number | boolean) =>
    update({ [key]: value } as Partial<VibeConfig>);

  return (
    <div className="vibe-flex vibe-flex-col">
      {GROUPS.map((group, gi) => {
        const masterOn = Boolean(cfg[group.master]);
        return (
          <Fragment key={group.titleKey}>
            <div className={gi === 0 ? HEAD_ROW : HEAD_ROW_DIV}>
              <div className={HEAD_TITLE}>{t(group.titleKey)}</div>
              <input
                className={CHECKBOX}
                type="checkbox"
                checked={masterOn}
                onChange={(e) => setField(group.master, e.target.checked)}
              />
            </div>
            {masterOn && (
              <>
                {group.fields.map((field) => (
                  <Row
                    key={field.key as string}
                    title={t(field.titleKey)}
                    desc={field.descKey ? t(field.descKey) : undefined}
                    last={field.last}
                    indent
                  >
                    <FieldControl
                      field={field}
                      value={cfg[field.key]}
                      onChange={(v) => setField(field.key, v)}
                    />
                  </Row>
                ))}
              </>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
