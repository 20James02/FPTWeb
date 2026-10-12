const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = "http://127.0.0.1:8098";
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  fs.mkdirSync(".local/qa/accounts-analytics", { recursive: true });
  async function inspect(label) {
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      labels: Array.from(document.querySelectorAll("input,select,textarea"))
        .filter(
          (e) => e.getClientRects().length && !e.hidden && e.type !== "hidden",
        )
        .filter((e) => !e.labels?.length && !e.getAttribute("aria-label"))
        .map((e) => e.id || e.name),
      underlines: Array.from(document.querySelectorAll(".sidebar-nav a")).some(
        (e) => getComputedStyle(e).textDecorationLine.includes("underline"),
      ),
    }));
    assert.equal(state.overflow, false, label);
    assert.deepEqual(state.labels, [], label);
    assert.equal(state.underlines, false, label);
    checks.push(label);
    await page.screenshot({
      path: ".local/qa/accounts-analytics/" + label + ".png",
      fullPage: true,
    });
  }
  async function api(path, method = "GET", body) {
    return page.evaluate(
      async ({ path, method, body }) => {
        const response = await adminFetch("/api/v1" + path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: response.status, data: await response.json() };
      },
      { path, method, body },
    );
  }
  try {
    const login = await page.request.post(origin + "/api/v1/auth/session", {
      data: {
        email: "qa-admin@example.test",
        password: "qa-only-password",
        otp: "123456",
      },
    });
    assert.equal(login.status(), 200);
    await page.goto(origin + "/admin/account");
    await page.waitForFunction(() =>
      document
        .getElementById("account-state")
        .textContent.includes("Đã tải tài khoản"),
    );
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await inspect("account-" + width);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => toggleAdminTheme());
    await inspect("account-dark");
    await page.evaluate(() => toggleAdminTheme());
    await page.locator("#mfa-name").fill("Thiết bị dự phòng QA");
    await page.locator("#mfa-enroll-form button").click();
    await page.locator("#mfa-setup").waitFor({ state: "visible" });
    await page.locator("#mfa-setup details").click();
    assert.equal(
      await page.locator("#mfa-secret").textContent(),
      "SYNTHETIC-QR-ONLY",
    );
    await inspect("mfa-enrollment");
    await page.locator("#mfa-code").fill("000000");
    await page.locator("#mfa-verify-form button[type=submit]").click();
    await page.waitForFunction(() =>
      document
        .getElementById("account-state")
        .textContent.includes("chưa đúng"),
    );
    assert.equal(await page.locator("#mfa-setup").isVisible(), true);
    await page.locator("#mfa-code").fill("123456");
    await page.locator("#mfa-verify-form button[type=submit]").click();
    await page.waitForFunction(() =>
      document
        .getElementById("account-state")
        .textContent.includes("MFA đã được xác minh"),
    );
    assert.equal(await page.locator("#mfa-setup").isVisible(), false);
    assert.equal(await page.locator("#mfa-secret").textContent(), "");
    assert.equal(await page.locator("#mfa-factors article").count(), 2);
    await inspect("mfa-verified");
    await page.locator("#staff-create-open").click();
    await page.locator("#staff-dialog").waitFor({ state: "visible" });
    await inspect("staff-create-desktop");
    await page.setViewportSize({ width: 360, height: 844 });
    await inspect("staff-create-mobile");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#staff-dialog").isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#staff-create-open").click();
    const form = page.locator("#staff-form");
    await form.locator("[name=display_name]").fill("Nhân viên phân tích QA");
    await form.locator("[name=email]").fill("staff-qa@example.test");
    await form.locator("[name=password]").fill("initial-password-qa123");
    await form.locator("[name=role]").selectOption("marketing");
    await form.locator("button[type=submit]").click();
    await page.waitForFunction(() =>
      document
        .getElementById("account-state")
        .textContent.includes("Đã lưu tài khoản"),
    );
    await page.locator("#staff-search").fill("staff-qa");
    await page.waitForFunction(() =>
      document
        .getElementById("staff-list")
        .textContent.includes("staff-qa@example.test"),
    );
    await page
      .locator("#staff-list article")
      .filter({ hasText: "staff-qa@example.test" })
      .locator("button")
      .click();
    await page.locator("#staff-dialog").waitFor({ state: "visible" });
    await inspect("staff-permissions-desktop");
    await page.setViewportSize({ width: 360, height: 844 });
    await inspect("staff-permissions-mobile");
    assert.equal(await form.locator("[name=role]").inputValue(), "");
    await form.locator("[name=capacity]").fill("12");
    await form.locator("button[type=submit]").click();
    await page.locator("#staff-dialog").waitFor({ state: "hidden" });
    const me = await api("/admin/me");
    const staff = (await api("/admin/staff?q=staff-qa")).data.items[0];
    assert.equal(staff.require_mfa, true);
    assert.equal(staff.capacity, 12);
    assert.equal(staff.version, 2);
    assert.deepEqual(staff.permissions, ["marketing.write", "report.read"]);
    const employee = await browser.newContext({
      viewport: { width: 390, height: 900 },
    });
    const employeePage = await employee.newPage();
    employeePage.on("pageerror", (e) => errors.push(e.message));
    const employeeLogin = await employee.request.post(
      origin + "/api/v1/auth/session",
      {
        data: {
          email: "staff-qa@example.test",
          password: "initial-password-qa123",
        },
      },
    );
    assert.equal(employeeLogin.status(), 200);
    await employeePage.goto(origin + "/admin");
    await employeePage.waitForURL("**/admin/account");
    assert.equal(
      (
        await employee.request.get(origin + "/api/v1/admin/reports/analytics")
      ).status(),
      403,
    );
    await employeePage.waitForFunction(() =>
      document
        .getElementById("account-state")
        .textContent.includes("Đã tải tài khoản"),
    );
    assert.equal(await employeePage.locator("#staff-create-open").count(), 0);
    await employeePage.locator("#mfa-name").fill("Điện thoại nhân viên QA");
    await employeePage.locator("#mfa-enroll-form button").click();
    await employeePage.locator("#mfa-code").fill("123456");
    await employeePage.locator("#mfa-verify-form button[type=submit]").click();
    await employeePage.waitForFunction(() => window.adminAAL === "aal2");
    assert.equal(
      (
        await employee.request.get(origin + "/api/v1/admin/reports/analytics")
      ).status(),
      200,
    );
    assert.equal(
      await employeePage.locator('a[href="/admin/reports"]').count(),
      1,
    );
    assert.equal(await employeePage.locator("#staff-create-open").count(), 0);
    await employee.close();
    checks.push("staff-mfa-bootstrap-and-permissions");
    for (const path of ["/admin/reports", "/admin/dashboard"]) {
      await page.goto(origin + path);
      await page.waitForFunction(() =>
        document
          .getElementById("analytics-state")
          .textContent.startsWith("Đã tải kỳ"),
      );
      assert.equal(await page.locator("#analytics-trend svg").count(), 1);
      const data = (await api("/admin/reports/analytics")).data;
      assert.ok(data.totals.leads > 0);
      assert.ok(data.branches.some((row) => row.label === "Khu vực kiểm thử"));
      for (const width of [1440, 768, 390, 360]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(160);
        await inspect(
          path.endsWith("reports") ? "reports-" + width : "dashboard-" + width,
        );
      }
    }
    await page.goto(origin + "/admin/reports");
    await page.waitForFunction(() =>
      document
        .getElementById("analytics-state")
        .textContent.startsWith("Đã tải kỳ"),
    );
    await page.locator("#analytics-campaign").fill("no-such-campaign");
    await page.locator("#analytics-filter button").click();
    await page.waitForFunction(() =>
      document
        .getElementById("analytics-state")
        .textContent.includes("0 hồ sơ"),
    );
    assert.equal(await page.locator("#analytics-trend svg").count(), 0);
    await inspect("analytics-empty");
    await page.locator("#analytics-campaign").fill("");
    await page.locator("#analytics-start").fill("2025-01-01");
    await page.locator("#analytics-filter button").click();
    await page.waitForFunction(() =>
      document
        .getElementById("analytics-state")
        .textContent.includes("93 ngày"),
    );
    await inspect("analytics-invalid-range");
    await page.goto(origin + "/admin/account");
    await page.waitForFunction(() =>
      document
        .getElementById("account-state")
        .textContent.includes("Đã tải tài khoản"),
    );
    const account = (await api("/auth/account")).data;
    const first = account.factors[0].id;
    assert.equal((await api("/auth/mfa/" + first, "DELETE")).status, 200);
    const updated = (await api("/auth/account")).data;
    assert.equal(updated.factors.length, 1);
    assert.equal(
      (await api("/auth/mfa/" + updated.factors[0].id, "DELETE")).status,
      409,
    );
    await page.reload();
    await page.waitForFunction(() =>
      document
        .getElementById("account-state")
        .textContent.includes("Đã tải tài khoản"),
    );
    await page.locator("#account-current-password").fill("qa-only-password");
    await page.locator("#account-new-password").fill("new-password-qa123");
    await page.locator("#account-password-confirm").fill("new-password-qa123");
    await page.locator("#account-password-otp").fill("123456");
    await page.locator("#account-password-form button[type=submit]").click();
    await page.waitForURL("**/admin/login");
    assert.equal(
      (await page.request.get(origin + "/api/v1/admin/me")).status(),
      401,
    );
    const reLogin = await page.request.post(origin + "/api/v1/auth/session", {
      data: {
        email: "qa-admin@example.test",
        password: "new-password-qa123",
        otp: "123456",
      },
    });
    assert.equal(reLogin.status(), 200);
    checks.push("password-change-and-revoke");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      ".local/qa/accounts-analytics/result.json",
      JSON.stringify(
        { checks, errors, passed: true, production_mutations: false },
        null,
        2,
      ),
    );
    console.log(
      "Passed account/MFA/staff/analytics browser checks:",
      checks.length,
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
