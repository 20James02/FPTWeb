const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomUUID } = require("node:crypto");
const origin = "http://127.0.0.1:8098";
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) =>
    r
      .request()
      .url()
      .startsWith(origin + "/")
      ? r.continue()
      : r.abort(),
  );
  try {
    assert.equal(
      (
        await page.request.post(origin + "/api/v1/auth/session", {
          data: {
            email: "qa-admin@example.test",
            password: "qa-only-password",
            otp: "123456",
          },
        })
      ).status(),
      200,
    );
    await page.goto(origin + "/admin/leads");
    const list = await page.evaluate(
      async () =>
        (await (await adminFetch("/api/v1/admin/leads?status=new")).json())
          .items,
    );
    const lead = list[0];
    await page.evaluate(async (l) => {
      const r = await adminFetch(
        "/api/v1/admin/leads/" + l.id + "/assignments",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expected_version: l.version }),
        },
      );
      if (!r.ok) throw Error(await r.text());
    }, lead);
    await page.goto(origin + "/admin/leads/detail?id=" + lead.id);
    await page.locator("#lead-content-panel").waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: "Chọn gói đã chốt", exact: true })
      .click();
    let d = page.locator("dialog[open]");
    await d.waitFor({ state: "visible" });
    const choices = await d.locator("#billing-plan option").allTextContents();
    assert.ok(choices.length > 1);
    await d.locator("#billing-plan").selectOption({ index: 1 });
    await d.locator("#billing-term").selectOption("1");
    await d.locator("#billing-notes").fill("<img src=x> Ghi chú kiểm thử");
    await d
      .getByRole("button", { name: "Lưu gói đã chốt", exact: true })
      .click();
    await d.waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      document
        .querySelector("#billing-summary")
        .textContent.includes("Hằng tháng"),
    );
    assert.ok(
      (await page.locator("#billing-summary").textContent()).includes(
        "Hằng tháng",
      ),
    );
    await page
      .getByRole("button", { name: "Thêm lịch thanh toán", exact: true })
      .click();
    d = page.locator("dialog[open]");
    const today = await page.evaluate(() => adminVietnamDay());
    await d.locator("#payment-date").fill(today);
    await d.locator("#payment-amount").fill("220000");
    await d.locator("#payment-notes").fill("Ghi chú kỳ đầu");
    await d
      .getByRole("button", { name: "Lưu lịch thanh toán", exact: true })
      .click();
    await d.waitFor({ state: "hidden" });
    await page.locator(".billing-payment").first().waitFor();
    assert.ok(
      (await page.locator(".billing-payment").first().textContent()).includes(
        "220.000",
      ),
    );
    // Draft survives background refresh; a stale edit remains visible and cannot overwrite.
    await page
      .getByRole("button", { name: "Sửa lịch", exact: true })
      .first()
      .click();
    d = page.locator("dialog[open]");
    await d.locator("#payment-notes").fill("Bản nháp đang nhập");
    await page.evaluate(() => refreshAdminView());
    assert.equal(
      await d.locator("#payment-notes").inputValue(),
      "Bản nháp đang nhập",
    );
    await d.press("Escape");
    await d.waitFor({ state: "hidden" });
    await page.locator("#admin-notices-button").click();
    d = page.locator("dialog[open]");
    await d.getByRole("link", { name: "Xem hồ sơ" }).first().waitFor();
    assert.ok((await d.textContent()).includes("220.000"));
    // A background inbox refresh must retain the current keyboard control.
    await d.getByRole("link", { name: "Xem hồ sơ" }).first().focus();
    await page.evaluate(async () => {
      await refreshAdminPaymentNotices();
    });
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      "Xem hồ sơ",
    );
    await d
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .first()
      .click();
    await d.press("Escape");
    assert.ok(
      !(await page.locator("#btn-reveal-text").textContent()).includes("PII"),
    );
    assert.equal(
      await page.locator("#lead-evidence-summary").isVisible(),
      false,
    );
    await page
      .getByRole("button", { name: "Xem cơ sở đánh giá", exact: true })
      .click();
    d = page.locator("dialog[open]");
    assert.equal(await d.locator("#lead-evidence-summary").isVisible(), true);
    await d.press("Escape");
    fs.mkdirSync(".local/qa/lead-billing", { recursive: true });
    for (const width of [1440, 768, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width === 360)
        await page.evaluate(() =>
          document.documentElement.setAttribute("data-theme", "dark"),
        );
      await page
        .getByRole("button", { name: "Sửa lịch", exact: true })
        .first()
        .click();
      d = page.locator("dialog[open]");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
      );
      await page.screenshot({
        path: ".local/qa/lead-billing/form-" + width + ".png",
        fullPage: true,
      });
      await d.press("Escape");
    }
    await page
      .getByRole("button", { name: "Đánh dấu đã thu", exact: true })
      .first()
      .click();
    d = page.locator("dialog[open]");
    await d.locator("#payment-next").check();
    await d
      .getByRole("button", { name: "Xác nhận đã thu", exact: true })
      .click();
    await d.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () => document.querySelectorAll(".billing-payment").length === 2,
    );
    assert.ok(
      (await page.locator("#billing-payments").textContent()).includes(
        "Đã thu",
      ),
    );
    await page
      .getByRole("button", { name: "Hủy lịch", exact: true })
      .first()
      .click();
    d = page.locator("dialog[open]");
    await d.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      document
        .querySelector("#billing-payments")
        .textContent.includes("Đã hủy"),
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      ".local/qa/lead-billing/result.json",
      JSON.stringify(
        {
          passed: true,
          widths: [1440, 768, 360],
          dark: true,
          errors,
          production_mutations: false,
        },
        null,
        2,
      ),
    );
    console.log(
      "Billing browser passed: package/term/payment/inbox/collection/next/cancel/draft/dialog/mobile/dark",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
