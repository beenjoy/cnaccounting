import { chromium } from "@playwright/test";
import { TEST_USER, AUTH_FILE, loginAs } from "./fixtures/auth";
import path from "path";
import fs from "fs";

/**
 * Global setup：
 * 1. 确保 .auth 目录存在
 * 2. 使用测试账号登录，保存 storageState 用于后续测试
 *
 * 注意：需要先创建测试账号。可在 http://localhost:3000/register 注册，
 * 邮箱：e2e_admin@test.com  密码：TestPass123!
 */
async function globalSetup() {
  const authDir = path.join(__dirname, "fixtures", ".auth");
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await page.context().storageState({ path: AUTH_FILE });
    console.log("✅ E2E 登录成功，storageState 已保存");
  } catch (err) {
    console.error("❌ E2E 登录失败：", err);
    console.log("请先访问 http://localhost:3000/register 注册测试账号：");
    console.log(`  邮箱：${TEST_USER.email}`);
    console.log(`  密码：${TEST_USER.password}`);
    throw err;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
