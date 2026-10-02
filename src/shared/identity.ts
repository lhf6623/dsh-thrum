// 具名导入：打包时只取 name 字段（rollup JSON 树摇），不把整份 package.json 打进产物。
// with { type: "json" }：Vite 未来 native config loader 要求的 import attributes。
import { name as packageName } from "../../package.json" with { type: "json" };

/**
 * 插件身份唯一真源：package.json 的 name。
 * 宿主/客户端各处需要插件名时统一从这里取，不要各自 import package.json 再拼接。
 */

/** 插件名（= package.json name，harness 按它解析插件行与客户端模块 id）。 */
export function pluginName(): string {
  return packageName;
}

/**
 * 设置表单的 namespace（dsh ≥ 0.2.0）。
 *
 * 0.2.0 起 settings 服务换成 `SettingsForms`：表单由各 Loader entry 的 Config schema
 * 投影而来，以 **profile entry id** 寻址，`settingsNamespace` / `installSettingsSection` /
 * `register(ns, schema, { base })` / `scope.watch` 这套自报 namespace 的 API 已全部移除。
 * 所以本插件的 namespace 就是 cordis.patch.yml 里宿主行的 `id`（= 本常量），
 * 浏览器侧经 `ctx.configForms.get(SETTINGS_ENTRY_ID)` 读写同一个 entry。
 * 两处必须一致 —— 构建期由 vite.shared.ts 的 assertPatchEntryId() 校验。
 */
export const SETTINGS_ENTRY_ID = "thrum";

/** localStorage 配置持久化键（`<包名>.config`）。 */
export function configStorageKey(): string {
  return `${packageName}.config`;
}
