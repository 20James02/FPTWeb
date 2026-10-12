const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8092";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error("Loopback fixture required");
const out = "docs/qa/2026-10-02/geography-api";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Ho_Chi_Minh",
  });
  const page = await context.newPage();
  const errors = [];
  const report = { checks: [], mobile: [], errors };
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  const api = async (path, method = "GET", body) =>
    page.evaluate(
      async ({ path, method, body }) => {
        const csrf = document.cookie
          .split("; ")
          .find((c) => c.startsWith("pagefpt_csrf="));
        const r = await fetch(path, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(csrf
              ? { "X-CSRF-Token": decodeURIComponent(csrf.split("=")[1]) }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, data: await r.json() };
      },
      { path, method, body },
    );
  try {
    await page.goto(origin + "/admin/login");
    assert.equal(
      (
        await api("/api/v1/auth/session", "POST", {
          email: "qa-admin@example.test",
          password: "qa-only-password",
          otp: "123456",
        })
      ).status,
      200,
    );
    await page.goto(origin + "/admin/pricing");
    await page.waitForFunction(
      () => pricingIdentity && pricingProvinces.length,
    );
    await page.locator("#geography-open").click();
    await page.waitForFunction(() => geographyPreview?.provinces.length === 34);
    assert.equal(
      await page.locator("#geography-provinces input:checked").count(),
      34,
    );
    await page.locator("#geography-all").uncheck();
    assert.equal(await page.locator("#geography-submit").isDisabled(), true);
    await page.locator("#geography-search").fill("ha noi");
    assert.equal(
      await page.locator("#geography-provinces label:visible").count(),
      1,
    );
    await page.locator("#geography-provinces label:visible input").check();
    assert.match(await page.locator("#geography-selection").innerText(), /126/);
    await page.locator("#geography-source").selectOption("bundled");
    const sync = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/admin/locations/sync") &&
        r.request().method() === "POST",
    );
    await page.locator("#geography-submit").click();
    const r = await sync;
    assert.ok(r.ok(), await r.text());
    assert.equal((await r.json()).created, 127);
    await page.waitForFunction(() => !geographyBusy);
    report.checks.push(
      "Checkbox province search without accents; 126 wards imported with Hanoi",
    );
    await page.locator("#geography-search").fill("");
    await page.locator("#geography-all").check();
    const full = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/admin/locations/sync") &&
        r.request().method() === "POST",
    );
    await page.locator("#geography-submit").click();
    const fr = await full;
    assert.ok(fr.ok(), await fr.text());
    await page.waitForFunction(() => !geographyBusy);
    report.source = (await fr.json()).source;
    assert.equal((await fr.json()).created, 3355 - 127);
    report.checks.push(
      "All 34 provinces / 3321 wards in database; idempotent first province",
    );
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.locator("#geography-dialog").evaluate((d) => ({
        width: d.getBoundingClientRect().width,
        scroll: d.scrollWidth,
        client: d.clientWidth,
        inputs: [
          ...d.querySelectorAll("select,input:not([type=checkbox])"),
        ].map((i) => ({
          height: i.getBoundingClientRect().height,
          font: parseFloat(getComputedStyle(i).fontSize),
        })),
      }));
      assert.ok(layout.scroll <= layout.client + 1, JSON.stringify(layout));
      assert.ok(
        layout.inputs.every((i) => i.height >= 44 && i.font >= 16),
        JSON.stringify(layout),
      );
      report.mobile.push({ viewport: width, ...layout });
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: out + "/admin-mobile.png" });
    await page.locator("#geography-dialog .pricing-close").click();
    const provinces = (await api("/api/v1/admin/locations")).data.items;
    const hanoi = provinces.find((p) => p.payload.code === "vn2025-province-1");
    assert.ok(hanoi);
    const first = (
      await api("/api/v1/regions/" + hanoi.id + "/wards?limit=100")
    ).data;
    const second = (
      await api(
        "/api/v1/regions/" +
          hanoi.id +
          "/wards?limit=100&before=" +
          first.next_cursor,
      )
    ).data;
    const ward = [...first.items, ...second.items].find(
      (w) => w.code === "vn2025-ward-4",
    );
    assert.ok(ward);
    await page.goto(origin + "/");
    await page.waitForFunction(
      () => document.querySelector("#home-zone-select")?.value === "all",
    );
    assert.ok(
      (await page.locator("#home-province-select option").count()) >= 34,
    );
    await page.locator("#home-province-select").selectOption(hanoi.id);
    await page.waitForFunction(
      () => !document.querySelector("#home-ward-select").disabled,
    );
    assert.equal(await page.locator("#home-ward-select option").count(), 127);
    await page.locator("#home-ward-select").selectOption(ward.id);
    assert.equal(await page.evaluate(() => getSelectedRegionId()), ward.id);
    assert.equal(
      await page.evaluate(() => currentSelectedProvince.code),
      hanoi.id,
    );
    assert.equal(await page.evaluate(() => getSelectedRegionId()), ward.id);
    await page.reload();
    await page.waitForFunction((id) => getSelectedRegionId() === id, ward.id);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false);
    await page.screenshot({ path: out + "/client-mobile.png" });
    report.checks.push(
      "Client all-province selection; lazy paginated wards; ward UUID synchronized with form and persists reload",
    );
    if (process.env.PAGEFPT_VERIFY_LIVE_SOURCE === "1") {
      await page.goto(origin + "/admin/pricing");
      const live = await api("/api/v1/admin/locations/sync", "POST", {
        branch_id: "00000000-0000-0000-0000-000000000000",
        source: "live",
      });
      assert.equal(live.status, 200, JSON.stringify(live));
      report.live_sync = live.data;
      report.checks.push(
        "Live source sync request succeeded; actual source mode recorded",
      );
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.writeFileSync(out + "/browser.json", JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
