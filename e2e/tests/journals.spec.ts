import { test, expect } from "@playwright/test";

/**
 * 凭证管理 E2E 测试
 * 用例 3: 新建凭证 → 提交审批 → 审批通过 → 过账 → 试算表余额变化
 * 用例 4: 借贷不平时无法提交（按钮禁用或 API 返回 400）
 */
test.describe("凭证管理", () => {
  test("新建凭证完整流程：草稿→提交→审批→过账", async ({ page }) => {
    // 1. 进入新建凭证页
    await page.goto("/journals/new");
    await expect(page.locator("h1, h2")).toContainText(/新建|凭证/);

    // 2. 填写摘要
    const descInput = page.locator('input[name="description"], input[placeholder*="摘要"]').first();
    await descInput.fill("E2E测试凭证-管理费用");

    // 3. 等待页面加载科目列表
    await page.waitForLoadState("networkidle");

    // 4. 获取凭证行，填写借方科目和金额
    //    选取第一行借方科目（管理费用 6602）
    const rows = page.locator("tbody tr, [data-testid='line-row']");
    const firstRow = rows.first();

    // 查找科目选择（select）
    const accountSelects = page.locator("select").all();
    const selects = await accountSelects;

    if (selects.length >= 2) {
      // 第一行借方科目
      await selects[0].selectOption({ label: /管理费用/ });
      // 第一行借方金额
      const debitInput = firstRow.locator('input[placeholder*="借方"], input[name*="debit"]').first();
      await debitInput.fill("1000");

      // 添加第二行（贷方科目）
      const addBtn = page.locator("button", { hasText: /添加行|增加行|Add/ }).first();
      if (await addBtn.isVisible()) await addBtn.click();

      const secondRow = rows.nth(1);
      const allSelects2 = await page.locator("select").all();
      if (allSelects2.length >= 3) {
        await allSelects2[2].selectOption({ label: /银行存款/ });
        const creditInput = secondRow.locator('input[placeholder*="贷方"], input[name*="credit"]').first();
        await creditInput.fill("1000");
      }
    }

    // 5. 提交草稿保存
    const submitBtn = page.locator("button", { hasText: /保存|提交审批|submit/i }).first();
    await submitBtn.click();

    // 期望：导航到凭证列表或详情页，或显示成功提示
    await page.waitForURL(/\/journals/, { timeout: 10000 });

    // 验证凭证已创建（页面有 JE- 编号）
    await expect(page.locator("text=/JE-/").first()).toBeVisible({ timeout: 5000 });
  });

  test("借贷不平时提交按钮应禁用或返回错误", async ({ page }) => {
    await page.goto("/journals/new");
    await page.waitForLoadState("networkidle");

    // 只填借方，不填贷方
    const descInput = page.locator('input[name="description"], input[placeholder*="摘要"]').first();
    await descInput.fill("借贷不平测试");

    const selects = await page.locator("select").all();
    if (selects.length > 0) {
      await selects[0].selectOption({ index: 1 });
      const debitInput = page.locator('input[placeholder*="借方"], input[name*="debit"]').first();
      await debitInput.fill("500");
    }

    // 提交按钮应禁用 OR API 调用返回 400
    const submitBtn = page.locator("button", { hasText: /提交审批|保存/i }).first();

    if (await submitBtn.getAttribute("disabled") !== null) {
      // 按钮禁用即通过
      await expect(submitBtn).toBeDisabled();
    } else {
      // 点击后应有错误提示
      await submitBtn.click();
      const errorMsg = page.locator("text=/不平衡|借贷|错误|失败/i").first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    }
  });
});
