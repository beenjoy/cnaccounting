import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 配置
 * 测试库：DATABASE_URL_TEST（需在 .env.test 中配置）
 * 运行前请确保 Next.js dev server 已启动：npm run dev
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,        // 顺序执行，避免数据库竞争
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  globalSetup: "./e2e/global.setup.ts",

  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/fixtures/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
