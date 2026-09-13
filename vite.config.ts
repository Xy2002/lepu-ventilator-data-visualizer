import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // 只跑主工作树的 src 测试:.worktrees 里的并行分支与 scripts* 下的
    // 手工验证脚本不应阻塞默认测试与 pre-commit 钩子
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
