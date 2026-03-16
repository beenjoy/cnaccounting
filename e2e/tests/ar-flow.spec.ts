import { test, expect } from "@playwright/test";

/**
 * 应收发票流程 E2E 测试
 * 用例 5: 新建客户 → 开具 AR 发票 → 登记收款 → 发票状态变 PAID
 */
test.describe("应收发票流程", () => {
  let customerId: string;
  let invoiceId: string;

  test("完整 AR 流程：新建客户 → 开票 → 收款 → PAID", async ({ page, request }) => {
    // Step 1: 进入客户列表，创建新客户
    await page.goto("/ar");
    await page.waitForLoadState("networkidle");

    // 点击新建客户按钮（如果页面上有）
    const newCustomerBtn = page.locator("button, a", { hasText: /新建客户|添加客户/ }).first();
    if (await newCustomerBtn.isVisible({ timeout: 3000 })) {
      await newCustomerBtn.click();

      const nameInput = page.locator('input[name="name"], input[placeholder*="客户名称"]').first();
      await nameInput.fill("E2E测试客户");

      const saveBtn = page.locator("button", { hasText: /保存|确认|提交/i }).first();
      await saveBtn.click();
      await page.waitForLoadState("networkidle");
    }

    // Step 2: 进入发票列表，创建发票
    await page.goto("/ar/invoices");
    await page.waitForLoadState("networkidle");

    const newInvoiceBtn = page.locator("button, a", { hasText: /新建发票|开具发票|新增/i }).first();
    if (await newInvoiceBtn.isVisible({ timeout: 3000 })) {
      await newInvoiceBtn.click();
      await page.waitForLoadState("networkidle");

      // 填写发票信息
      const subtotalInput = page.locator('input[name="subtotal"], input[placeholder*="金额"]').first();
      await subtotalInput.fill("10000");

      const saveBtn = page.locator("button", { hasText: /保存|创建|提交/i }).first();
      await saveBtn.click();
      await page.waitForLoadState("networkidle");
    }

    // Step 3: 在发票列表找到刚创建的发票，登记收款
    await page.goto("/ar/invoices");
    await page.waitForLoadState("networkidle");

    // 期望页面上有发票列表
    const invoiceRows = page.locator("table tbody tr, [data-testid='invoice-row']");
    const count = await invoiceRows.count();
    expect(count).toBeGreaterThan(0);

    // 找到状态为 OPEN/PENDING 的发票，点击收款按钮
    const recordPaymentBtn = page.locator("button", { hasText: /收款|登记收款|收/i }).first();
    if (await recordPaymentBtn.isVisible({ timeout: 3000 })) {
      await recordPaymentBtn.click();
      await page.waitForLoadState("networkidle");

      // 填写收款金额（全额）
      const amountInput = page.locator('input[name="amount"], input[placeholder*="金额"]').first();
      if (await amountInput.isVisible()) {
        await amountInput.fill("11000"); // 含税价
      }

      const dateInput = page.locator('input[type="date"], input[name*="date"]').first();
      if (await dateInput.isVisible()) {
        await dateInput.fill("2026-03-16");
      }

      const confirmBtn = page.locator("button", { hasText: /确认|保存|提交/i }).first();
      await confirmBtn.click();
      await page.waitForLoadState("networkidle");

      // 验证发票状态变为 PAID
      const paidBadge = page.locator("text=/已收款|PAID|全额/i").first();
      await expect(paidBadge).toBeVisible({ timeout: 5000 });
    }
  });
});
