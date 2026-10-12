const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ""))
  throw Error("Disposable loopback fixture required");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.PAGEFPT_CHROME_BINARY
      ? { executablePath: process.env.PAGEFPT_CHROME_BINARY }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Ho_Chi_Minh",
    reducedMotion: "reduce",
  });
  await context.route("**/*", (route) =>
    route
      .request()
      .url()
      .startsWith(origin + "/")
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  const checks = [];
  try {
    await page.goto(origin + "/admin/login");
    await page.locator("#login-email").fill("qa-admin@example.test");
    await page.locator("#login-password").fill("qa-only-password");
    await page.locator("#btn-submit-login").click();
    await page.waitForFunction(
      () => document.getElementById("form-otp-verify").style.display !== "none",
    );
    for (let i = 0; i < 6; i++)
      await page
        .locator(".otp-digit-input")
        .nth(i)
        .fill(String(i + 1));
    await page.locator("#btn-verify-otp").click();
    await page.waitForURL("**/admin/dashboard");
    checks.push("Password + MFA login");
    await page.goto(origin + "/");
    await page.evaluate(() => openBottomSheet());
    await page.locator("#lead-name").fill("Khách QA");
    await page.locator("#lead-phone").fill("0901234567");
    await page.locator("#lead-address").fill("Địa chỉ giả dùng cho kiểm thử");
    await page.locator("#lead-consent").check();
    const receipt = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/v1/leads" && r.request().method() === "POST",
    );
    await page.locator("#btn-submit-lead").click();
    assert.equal((await receipt).status(), 201);
    checks.push("Three-field lead committed to real disposable SQL");
    await page.goto(origin + "/admin/workbench");
    await page.waitForFunction(() =>
      document
        .getElementById("workbench-state")
        .textContent.startsWith("Cập nhật:"),
    );
    assert.equal(await page.locator(".workbench-group").count(), 4);
    assert.ok((await page.locator(".workbench-task").count()) > 0);
    await page.locator(".workbench-task a").first().click();
    await page.waitForFunction(() =>
      document
        .getElementById("lead-next-action")
        .textContent.includes("Thực hiện bước này"),
    );
    assert.equal(await page.locator("#lead-next-action button").count(), 1);
    checks.push("Scoped workbench to actionable lead detail");
    await page.goto(origin + "/admin/leads?overdue=true");
    assert.equal(await page.locator("#filter-overdue").isChecked(), true);
    checks.push("Queue deep-link applies the matching filter");
    const layouts = [];
    for (const path of [
      "/admin/workbench",
      "/admin/dashboard",
      "/admin/reports",
    ]) {
      await page.goto(origin + path);
      if (path.endsWith("dashboard"))
        assert.equal(
          await page.locator(".dashboard-reports").getAttribute("open"),
          null,
        );
      for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
          path + " " + width,
        );
        layouts.push({ path, width });
      }
    }
    await page.goto(origin + "/admin/dashboard");
    await page.locator(".dashboard-reports > summary").click();
    await page.waitForFunction(() =>
      document.getElementById("analytics-state").textContent.includes("Đã tải"),
    );
    assert.ok((await page.locator("#analytics-trend svg").count()) > 0);
    await page.goto(origin + "/admin/workbench");
    await page.locator("#workbench-refresh").click();
    await page.waitForFunction(
      () => !document.getElementById("workbench-refresh").disabled,
    );
    assert.deepEqual(errors, []);
    fs.mkdirSync(".local/qa/audit-upgrades", { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".local/qa/audit-upgrades/workbench-mobile.png",
      fullPage: true,
    });
    fs.writeFileSync(
      ".local/qa/audit-upgrades/browser.json",
      JSON.stringify(
        { checks, layouts, page_errors: errors, synthetic_only: true },
        null,
        2,
      ),
    );
    console.log(
      "Browser smoke passed:",
      checks.join("; "),
      ";",
      layouts.length,
      "responsive views; charts and refresh",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
