const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8000";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error("Loopback required");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(origin + "/admin/login");
    const status = await page.evaluate(async () => {
      const csrf = document.cookie
        .split("; ")
        .find((c) => c.startsWith("pagefpt_csrf="));
      const r = await fetch("/api/v1/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf
            ? { "X-CSRF-Token": decodeURIComponent(csrf.split("=")[1]) }
            : {}),
        },
        body: JSON.stringify({
          email: "qa-admin@example.test",
          password: "qa-only-password",
          otp: "123456",
        }),
      });
      return r.status;
    });
    assert.equal(status, 200);
    await page.goto(origin + "/admin/pricing");
    await page.waitForFunction(() => pricingIdentity !== null);
    await page.evaluate(() => {
      pricingIdentity = null;
    });
    const identity = page.waitForResponse((r) =>
      r.url().endsWith("/api/v1/admin/me"),
    );
    await page.locator("#geography-open").click();
    assert.equal((await identity).status(), 200);
    await page.waitForFunction(
      () => document.querySelector("#geography-branch").options.length > 0,
    );
    assert.equal(
      await page.locator("#geography-provinces input:checked").count(),
      34,
    );
    await page.locator("#geography-search").fill("da nang");
    assert.equal(
      await page.locator("#geography-provinces label:visible").count(),
      1,
    );
    await page.locator("#geography-dialog .pricing-close").click();
    await page.locator("#geography-open").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#geography-provinces input:checked") !== null,
    );
    assert.deepEqual(errors, []);
    const report = {
      checks: [
        "Identity loads independently when workspace is not ready",
        "Unaccented da nang matches uppercase Đà Nẵng",
        "Dialog reopens and mobile checkbox list renders",
      ],
      errors,
    };
    fs.writeFileSync(
      "docs/qa/2026-10-02/geography-api/ready-browser.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
