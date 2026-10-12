const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const origin = "http://127.0.0.1:8098";
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let pricePublishes = 0;
  page.on("request", (r) => {
    if (/\/prices\/[^/]+\/publish$/.test(r.url())) pricePublishes++;
  });
  async function api(path, body) {
    return page.evaluate(
      async ({ path, body }) => {
        const cookie = document.cookie
          .split("; ")
          .find((x) => x.startsWith("pagefpt_csrf="));
        const response = await fetch("/api/v1" + path, {
          method: body ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            ...(cookie ? { "X-CSRF-Token": cookie.split("=")[1] } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, data: await response.json() };
      },
      { path, body },
    );
  }
  try {
    await page.goto(origin + "/admin/login");
    assert.equal(
      (
        await api("/auth/session", {
          email: "qa-admin@example.test",
          password: "qa-only-password",
          otp: "123456",
        })
      ).status,
      200,
    );
    const plan = await api("/admin/plans", {
      name: "QA Draft Dependency",
      code: "qa-publish-" + Date.now(),
      service: "internet",
      speed_mbps: 300,
    });
    assert.equal(plan.status, 201);
    const price = {
      plan_id: plan.data.id,
      scope_kind: "default",
      scope_id: "00000000-0000-0000-0000-000000000000",
      billing_months: 6,
      monthly_vnd: 220000,
      source: "Synthetic QA",
      start: new Date(Date.now() - 60000).toISOString(),
    };
    const saved = await api("/admin/prices/bulk", {
      rows: [price],
      publish: false,
    });
    assert.equal(saved.status, 201);
    // Characterize the actual backend dependency, without changing published state.
    const blocked = await api(
      "/admin/prices/" + saved.data.items[0].id + "/publish",
      { expected_version: saved.data.items[0].version },
    );
    assert.equal(blocked.status, 422);
    assert.equal(blocked.data.code, "INVALID_PLAN");
    await page.goto(origin + "/admin/pricing");
    await page.waitForFunction(() =>
      availablePlans.some((p) => p.payload.name === "QA Draft Dependency"),
    );
    const row = page.locator(
      '[data-price-id="' + saved.data.items[0].id + '"]',
    );
    const guide = row.getByRole("button", {
      name: "Công bố gói trước",
      exact: true,
    });
    assert.equal(
      await guide.count(),
      1,
      "Draft package must guide users to publish the package before its price",
    );
    const before = pricePublishes;
    await guide.click();
    assert.equal(pricePublishes, before);
    const planRow = page.locator('[data-plan-id="' + plan.data.id + '"]');
    await planRow.getByRole("button", { name: "Công bố", exact: true }).click();
    await page.waitForFunction(
      (id) => availablePlans.find((p) => p.id === id)?.status === "published",
      plan.data.id,
    );
    await page.evaluate(() => pricingTab("prices"));
    await row.getByRole("button", { name: "Công bố", exact: true }).click();
    await page.waitForFunction(
      (id) => pricingRows.find((p) => p.id === id)?.status === "published",
      saved.data.items[0].id,
    );
    const region = (await api("/regions")).data.items[0];
    const quote = await api("/quotes", {
      plan_id: plan.data.id,
      region_id: region.id,
      billing_months: 6,
    });
    assert.equal(quote.status, 200);
    assert.equal(quote.data.status, "confirmed");
    assert.equal(quote.data.monthly_vnd, 220000);
    assert.deepEqual(errors, []);
    console.log(
      "Catalog publish workflow passed: draft dependency, guided package publication, price publication and confirmed public quote; synthetic data only.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
