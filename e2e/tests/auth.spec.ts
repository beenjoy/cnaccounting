import { test, expect } from "@playwright/test";

/**
 * 认证流程 E2E 测试
 * 用例 1: 正确邮箱密码登录 → 跳转 /dashboard
 * 用例 2: 错误密码登录 → 页面显示错误提示
 */
test.describe("认证流程", () => {
  // 这两个测试不需要已登录状态，清空 storageState
  test.use({ storageState: { cookies: [], origins: [] } });

  test("正确凭据登录后跳转 dashboard", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[name="email"]', "e2e_admin@test.com");
    await page.fill('input[name="password"]', "TestPass123!");
    await page.click('button[type="submit"]');

    // 期望跳转至 dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // dashboard 应有导航元素
    await expect(page.locator("nav, aside, [data-testid='sidebar']").first()).toBeVisible();
  });

  test("错误密码登录显示错误提示", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[name="email"]', "e2e_admin@test.com");
    await page.fill('input[name="password"]', "WrongPassword999!");
    await page.click('button[type="submit"]');

    // 应停留在登录页并显示错误
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

    // 页面上应有错误文字
    const errorText = page.locator("text=/密码|错误|失败|invalid|incorrect/i").first();
    await expect(errorText).toBeVisible({ timeout: 5000 });
  });
});
