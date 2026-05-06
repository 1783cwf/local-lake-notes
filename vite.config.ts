import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const opentypeMjsPath = require.resolve("opentype.js/dist/opentype.mjs");

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      // Univer 0.21 依赖旧的 opentype module 文件名；当前 npm 包只提供 .mjs。
      "opentype.js/dist/opentype.module.js": opentypeMjsPath,
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
