import type { Plugin } from "vite";
import { createGenerator } from "unocss";
import { loadConfig } from "@unocss/config";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { pluginName } from "./src/shared/identity.ts";

/** 插件身份唯一真源：src/shared/identity（读取 package.json 的 name）。 */
export const ID = pluginName();

/** `@/` → src/（与 tsconfig 的 paths 保持一致），供各 vite 配置展开使用。 */
export const resolve = {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
  },
};

/**
 * 运行中 harness 的插件安装位置 (dsh-client-hmr 轮询监控这里的 client.js)。
 * 构建/监听后把产物同步过去，客户端改动即可被 harness 检测 -> SSE 通知浏览器热替换。
 * 解析顺序:
 *   1. 环境变量 DSH_THRUM_PROFILE_LIB (完整路径, 最优先)
 *   2. 环境变量 DSH_THRUM_PROFILE (profile 名, 如 'web')
 *   3. 自动扫描 ~/.dsh/profiles 下所有装了本插件的 profile (取第一个存在的)
 * 找不到则禁用同步 (静默跳过)。
 */
function discoverProfileLib(): string | null {
  try {
    const profilesRoot = join(homedir(), ".dsh", "profiles");
    for (const name of readdirSync(profilesRoot)) {
      const candidate = join(profilesRoot, name, "node_modules", ID, "lib");
      if (existsSync(candidate)) return candidate;
    }
  } catch {}
  return null;
}

const PROFILE_LIB =
  process.env.DSH_THRUM_PROFILE_LIB ||
  (process.env.DSH_THRUM_PROFILE
    ? join(
        homedir(),
        ".dsh",
        "profiles",
        process.env.DSH_THRUM_PROFILE,
        "node_modules",
        ID,
        "lib",
      )
    : "") ||
  discoverProfileLib() ||
  "";

/** 把 lib/ 下某产物复制到 profile（未发现 profile 则跳过）。 */
export function syncToProfile(file: string): void {
  try {
    if (!PROFILE_LIB || !existsSync(PROFILE_LIB)) return;
    copyFileSync(file, join(PROFILE_LIB, basename(file)));
    console.log(`[${ID}] synced`, basename(file), "→", PROFILE_LIB);
  } catch {}
}

// 递归收集 src/ 下全部 .ts/.tsx（含子目录）
function collectSource(dir = "src"): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      files.push(...collectSource(p));
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      files.push(p);
    }
  }
  return files;
}

// 扫描源码提取 thrum-* 原子类生成 CSS（preflights 开：tabular-nums / translate 依赖 --un-* 变量）
async function generateUnoCss(): Promise<string> {
  const { config } = await loadConfig(process.cwd());
  const uno = await createGenerator(config);
  const source = collectSource()
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const extracted = await uno.applyExtractors(source);
  const { css } = await uno.generate(extracted, {
    preflights: true,
    minify: true,
  });
  return css;
}

/**
 * UnoCSS 插件：@unocss/vite 的 build 靠 transformIndexHtml 注入 CSS，lib mode 无 HTML
 * 不生效；这里用官方 unocss API 在产物写出后落盘 lib/client.css，供包装插件内联。
 */
export function unocssCssPlugin(): Plugin {
  return {
    name: `${ID}:unocss-css`,
    async writeBundle() {
      writeFileSync("lib/client.css", await generateUnoCss());
    },
  };
}

/**
 * DSH 客户端插件包装：把 Vite 产出的 CJS + 内联 CSS 包进 ModuleLoader 工厂
 * （window.__ModuleLoader__.load），浏览器运行时动态注入 <style data-plugin>。
 */
export function moduleLoaderWrapPlugin(): Plugin {
  return {
    name: `${ID}:module-loader-wrap`,
    async writeBundle() {
      const js = readFileSync("lib/client.cjs.js", "utf8");
      const css = readFileSync("lib/client.css", "utf8");
      const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(ID)},
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin="' + ${JSON.stringify(ID)} + '"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = ${JSON.stringify(ID)}
      tag.textContent = ${JSON.stringify(css)}
      document.head.appendChild(tag)
    }
${js}
    return module.exports
  },
})
`;
      writeFileSync("lib/client.js", wrapped);
      rmSync("lib/client.cjs.js", { force: true });
      rmSync("lib/client.css", { force: true });
      syncToProfile("lib/client.js");
    },
  };
}

/**
 * 构建期校验：cordis.patch.yml 的宿主行 name 必须等于包名。
 * harness 按包名解析插件行（Node 模块解析才能找到已安装代码），
 * patch 是静态 YAML 无法 import，所以用校验保证它与 package.json 同步。
 * 逐行检查、忽略注释——注释里的示例写法不能顶替真实行。
 * 由各 vite 配置在启动构建时调用。
 */
export function assertPatchName(): void {
  const patch = readFileSync("cordis.patch.yml", "utf8");
  for (const line of patch.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = /^name:\s*["']([^"']+)["']$/.exec(trimmed);
    if (m && m[1] !== ID) {
      throw new Error(
        `cordis.patch.yml 的宿主行 name "${m[1]}" 必须等于包名 "${ID}"（与 package.json 同步）`,
      );
    }
  }
}
