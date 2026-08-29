import { Fragment } from "react";
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
  "thrum-py-4",
  "thrum-border-0",
  "thrum-border-b",
  "thrum-border-solid",
  "thrum-border-[var(--dsw-alias-border-l2)]",
);
const ROW_LAST = clsx(ROW, "thrum-border-b-0");
// 主开关标题行：加粗标题 + 左右对称，无底边框（关闭时不留残线；非首组加顶部边框分隔）
const HEAD_ROW =
  "thrum-flex thrum-items-center thrum-justify-between thrum-gap-2 thrum-py-4";
const HEAD_ROW_DIV = clsx(
  HEAD_ROW,
  "thrum-border-0",
  "thrum-border-t",
  "thrum-border-solid",
  "thrum-border-[var(--dsw-alias-border-l2)]",
  "thrum-mt-3",
);
// 子项行：左缩进形成层级
const INDENT = clsx("thrum-pl-6");
const ROW_TEXT = "thrum-flex thrum-flex-col thrum-flex-1 thrum-gap-1 thrum-min-w-0";
const TITLE =
  "thrum-text-[14px] thrum-leading-[22px] thrum-text-[var(--dsw-alias-label-primary)]";
const DESC =
  "thrum-text-[12px] thrum-leading-[18px] thrum-text-[var(--dsw-alias-label-tertiary)]";
// 主开关行标题：加粗，与子项区分
const HEAD_TITLE = clsx(TITLE, "thrum-font-semibold");
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

// —— 数据驱动：每项配置描述一个字段类型，渲染器按类型出控件；文案用 i18n key ——
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
  last?: boolean;
}

interface GroupDef {
  master: keyof ThrumConfig;
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
  {
    master: "aiFeedback",
    titleKey: "group.aiFeedback",
    fields: [],
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
  value: ThrumConfig[keyof ThrumConfig];
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
export function ThrumCard() {
  const cfg = useConfig();
  const { t } = useLocale();
  const update = (patch: Partial<ThrumConfig>) => setConfig(patch);
  const setField = (key: keyof ThrumConfig, value: string | number | boolean) =>
    update({ [key]: value } as Partial<ThrumConfig>);

  return (
    <div className="thrum-flex thrum-flex-col">
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
