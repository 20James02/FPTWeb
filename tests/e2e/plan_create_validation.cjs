// Real form + API + disposable PostgreSQL; catches invalid HTML pattern syntax.
const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8098";

(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium;
  const browser = await type.launch(type === chromium
    ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
    : {});
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) => route.request().url().startsWith(origin + "/")
        ? route.continue() : route.abort());
      const session = await context.request.post(origin + "/api/v1/auth/session", {
        data: { email: "qa-admin@example.test", password: "qa-only-password", otp: "123456" },
      });
      assert.equal(session.status(), 200);
      await page.goto(origin + "/admin/pricing");
      await page.waitForFunction(() => document.getElementById("prices-count-badge").textContent.includes("bản ghi"));
      await page.getByRole("button", { name: "Gói cước", exact: true }).click();
      await page.locator("#pricing-add").click();
      const name = "QA Create " + width + " " + Date.now();
      await page.locator("#plan-name").fill(name);
      for (const invalid of ["GIGA", "giga 300", "gói-cước", "giga_300"]) {
        await page.locator("#plan-code").fill(invalid);
        assert.equal(await page.locator("#plan-code").evaluate((el) => el.validity.patternMismatch), true, invalid);
      }
      await page.locator("#plan-submit").click();
      assert.equal(await page.locator("#plan-error").isVisible(), true);
      assert.equal(await page.locator("#plan-dialog").evaluate((el) => el.open), true);
      assert.equal(await page.locator("#plan-name").inputValue(), name);
      const code = "qa-create-" + width + "-" + Date.now();
      await page.locator("#plan-code").fill(code);
      const saved = page.waitForResponse((r) => r.url().endsWith("/api/v1/admin/plans") && r.request().method() === "POST");
      await page.locator("#plan-submit").click();
      const response = await saved;
      assert.equal(response.status(), 201, await response.text());
      const plan = await response.json();
      assert.equal(plan.payload.code, code);
      assert.equal(plan.payload.name, name);
      await page.locator("#plan-dialog").waitFor({ state: "hidden" });
      await page.locator(`[data-plan-id="${plan.id}"]`).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`${type.name()} ${width}px: invalid codes rejected, corrected form creates a visible draft`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
