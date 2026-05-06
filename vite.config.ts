import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      // Univer 0.21 依赖旧的 opentype module 文件名；当前 npm 包只提供 .mjs。
      "opentype.js/dist/opentype.module.js": "opentype.js/dist/opentype.mjs",
      // Tauri WebView 没有 Node 的 process 对象，ExcelJS 默认入口会在解析 XLSX 时访问 process.browser。
      // 这里固定使用官方浏览器包，避免生产桌面端打开本地表格时因为运行时环境差异失败。
      exceljs: "exceljs/dist/exceljs.min.js",
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
  },
});
