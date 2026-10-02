import { defineConfig } from "vite";
import {
  ID,
  assertPatchEntryId,
  assertPatchName,
  resolve,
  syncToProfile,
} from "./vite.shared.ts";

assertPatchName();
assertPatchEntryId();

// 宿主：Vite lib mode（ESM，harness 内部包 external）
export default defineConfig({
  resolve,
  plugins: [
    {
      name: `${ID}:sync-host`,
      writeBundle() {
        syncToProfile("lib/index.js");
      },
    },
  ],
  build: {
    lib: {
      entry: "src/host/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "lib",
    emptyOutDir: false,
    rollupOptions: {
      // harness 内部包运行时从 dsh 安装目录解析，不打包避免双实例
      external: ["@deepseek-ai/schemastery"],
    },
  },
});
