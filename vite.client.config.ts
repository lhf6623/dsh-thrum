import { defineConfig } from "vite";
import {
  assertPatchEntryId,
  assertPatchName,
  moduleLoaderWrapPlugin,
  resolve,
  unocssCssPlugin,
} from "./vite.shared.ts";

assertPatchName();
assertPatchEntryId();

// 客户端：Vite lib mode（CJS）+ UnoCSS 生成 + ModuleLoader 包装
export default defineConfig({
  resolve,
  // JSX 自动 runtime（react/jsx-runtime）是 Vite 8 默认值：组件无需 import React
  plugins: [unocssCssPlugin(), moduleLoaderWrapPlugin()],
  build: {
    lib: {
      entry: "src/client/index.tsx",
      formats: ["cjs"],
      fileName: () => "client.cjs.js",
    },
    outDir: "lib",
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      // external 是精确匹配：react/jsx-runtime 也要列出来，运行时由 ModuleLoader 注入
      external: ["react", "react/jsx-runtime"],
    },
  },
});
