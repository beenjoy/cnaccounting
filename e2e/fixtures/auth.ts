import { test as base, type Page } from "@playwright/test";
import path from "path";

export const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

export const TEST_USER = {
  email: "e2e_admin@test.com",
  password: "TestPass123!",
  name: "E2E 测试管理员",
};

/**
 * 登录辅助函数（用于 global setup）
 */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // 等待跳转到 dashboard
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

/**
 * 扩展 fixture：自动带 storageState（已在 playwright.config.ts 配置）
 */
export const test = base;
export { expect } from "@playwright/test";
