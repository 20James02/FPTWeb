const { chromium, webkit } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8098";
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium,
    b = await type.launch(
      type === chromium
        ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
        : {},
    );
  const ctx = await b.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    p = await ctx.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/*", (r) =>
    r
      .request()
      .url()
      .startsWith(origin + "/")
      ? r.continue()
      : r.abort(),
  );
  const api = (path, method = "GET", data) =>
    p.evaluate(
      async ({ path, method, data }) => {
        const r = await adminFetch("/api/v1" + path, {
          method,
          headers: { "Content-Type": "application/json" },
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
        const d = await r.json();
        if (!r.ok) throw Error(JSON.stringify({ path, status: r.status, d }));
        return d;
      },
      { path, method, data },
    );
  try {
    fs.mkdirSync(".local/qa/landing-campaign", { recursive: true });
    assert.equal(
      (
        await ctx.request.post(origin + "/api/v1/auth/session", {
          data: {
            email: "qa-admin@example.test",
            password: "qa-only-password",
            otp: "123456",
          },
        })
      ).status(),
      200,
    );
    await p.goto(origin + "/admin/landing-pages");
    const suffix = Date.now().toString(36),
      plans = [],
      region = (await api("/regions")).items[0];
    for (let i = 0; i < 3; i++) {
      const plan = await api("/admin/plans", "POST", {
        name: [
          "Giga",
          "Sky gia đình với tên dài để kiểm tra",
          "Camera Internet",
        ][i],
        code: "campaign-" + suffix + "-" + i,
        service: "internet",
        speed_mbps: 300 + i * 200,
        equipment:
          i === 1
            ? [
                "Thiết bị tư vấn theo nhu cầu",
                "Nội dung dài được đọc đầy đủ trong cửa sổ chi tiết",
              ]
            : ["Modem Wi-Fi"],
        description: "Thông tin mô tả toàn bộ gói",
      });
      await api("/admin/plans/" + plan.id + "/publish", "POST", {
        expected_version: plan.version,
      });
      for (const n of [1, 6, 12]) {
        const price = await api("/admin/prices", "POST", {
          plan_id: plan.id,
          scope_kind: "region",
          scope_id: region.id,
          billing_months: n,
          monthly_vnd: 220000,
          source: "Synthetic QA",
          start: "2026-01-01T00:00:00+07:00",
        });
        await api("/admin/prices/" + price.id + "/publish", "POST", {
          expected_version: price.version,
        });
      }
      plans.push(plan);
    }
    await p.locator("#lp-admin-new").click();
    await p.locator("[data-path=slug]").fill("qa-campaign-" + suffix);
    await p.locator("[data-path=title]").fill("QA Campaign " + suffix);
    await p
      .locator('[data-path="landing.hero_title"]')
      .fill("Internet cho gia đình");
    await p.getByRole("button", { name: "Gói & giá", exact: true }).click();
    for (const plan of plans)
      await p.locator(`[data-landing-plan="${plan.id}"]`).check();
    const box = p
      .locator(".lp-admin-plan")
      .filter({ has: p.locator(`[data-landing-plan="${plans[0].id}"]`) });
    await box.locator("summary").click();
    await box.locator('[data-landing-price="6"]').fill("180.000");
    await box.locator('[data-landing-price="12"]').fill("170.000");
    await box
      .locator('input[data-path$=".card_labels.register"]')
      .fill("Nhận ưu đãi");
    await box.locator('input[data-path$=".badge"]').fill("Giá chiến dịch");
    await p.getByRole("button", { name: "Ưu đãi", exact: true }).click();
    await p
      .locator('[data-path="landing.campaign.end"]')
      .fill("31/12/2026 23:59");
    await p
      .locator('[data-path="landing.campaign.conditions"]')
      .fill(
        "Áp dụng theo địa bàn và kỳ thanh toán. Quà xác nhận khi chốt lắp đặt.",
      );
    await p
      .locator('[data-path="landing.campaign.title"]')
      .fill("Tặng camera theo gói");
    await p.locator('[data-path="landing.campaign.stock_total"]').fill("50");
    await p
      .locator('[data-path="landing.campaign.stock_remaining"]')
      .fill("25");
    await p.locator('[data-path="landing.campaign.enabled"]').check();
    await p
      .getByRole("button", { name: "Liên hệ & footer", exact: true })
      .click();
    await p.locator('[data-path="landing.contact_phone"]').fill("0868.247.625");
    await p
      .locator('[data-path="landing.zalo_url"]')
      .fill("https://zalo.me/0868247625");
    await p
      .locator('[data-path="landing.messenger_url"]')
      .fill("https://m.me/pagefpt");
    await p
      .locator('[data-path="landing.contact_icon"]')
      .selectOption("message");
    await p
      .getByRole("button", { name: "+ Thêm danh mục footer", exact: true })
      .click();
    await p
      .locator('[data-path="landing.footer_groups.0.title"]')
      .fill("Thông tin chiến dịch");
    const group = p.locator(".lp-admin-repeat-row").filter({
      has: p.locator('[data-path="landing.footer_groups.0.title"]'),
    });
    await group
      .getByRole("button", { name: "+ Thêm liên kết", exact: true })
      .click();
    await p
      .locator('[data-path="landing.footer_groups.0.links.0.label"]')
      .fill("Điều kiện");
    await p
      .locator('[data-path="landing.footer_groups.0.links.0.href"]')
      .fill("/#lp-offers");
    const saved = p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/admin/pages") &&
        r.request().method() === "POST",
    );
    await p.locator("#lp-admin-save").click();
    const response = await saved;
    assert.equal(response.status(), 201, await response.text());
    let page = await response.json();
    assert.equal(
      page.payload.landing.plan_presentations.find(
        (x) => x.plan_id === plans[0].id,
      ).campaign_prices.length,
      2,
    );
    const published = await api(
      "/admin/pages/" + page.id + "/publish",
      "POST",
      { expected_version: page.version },
    );
    await p.goto(origin + "/qa-campaign-" + suffix, {
      waitUntil: "domcontentloaded",
    });
    await p.waitForLoadState("networkidle");
    // Make an explicit cookie choice before testing the fixed contact control.
    await p.locator('[data-consent-choice="deny"]').click();
    await p.locator("#home-province-select").selectOption(region.id);
    await p.waitForFunction(
      (id) =>
        document.querySelector(`[data-quote-plan="${id}"]`)?.textContent ===
        "180.000đ",
      plans[0].id,
    );
    const card = p.locator(`[data-lp-plan="${plans[0].id}"]`);
    await card.locator("[data-billing-months]").selectOption("12");
    await p.waitForFunction(
      (id) =>
        document.querySelector(`[data-quote-plan="${id}"]`)?.textContent ===
        "170.000đ",
      plans[0].id,
    );
    assert.match(
      await p.locator("#lp-campaign-status").textContent(),
      /Đang áp dụng/,
    );
    assert.match(await p.locator(".lp-stock").textContent(), /25/);
    assert.match(
      await card.locator(".plan-tag-badge").textContent(),
      /Giá chiến dịch/,
    );
    assert.equal(await p.locator("#lp-activity").isVisible(), false);
    for (const width of [320, 390, 430, 768, 1024, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      await p.evaluate(() => window.scrollTo(0, 0));
      const layout = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        cards: [...document.querySelectorAll(".lp-plan-card")].map((c) => {
          const a = c.querySelector(".btn-select-plan").getBoundingClientRect(),
            b = c.getBoundingClientRect(),
            im = c.querySelector(".plan-card-image").getBoundingClientRect();
          return {
            w: Math.round(b.width),
            h: Math.round(b.height),
            contained: a.bottom <= b.bottom + 1 && a.top >= b.top,
            imageWithin: im.width <= b.width,
          };
        }),
      }));
      assert.equal(layout.overflow, false, "overflow " + width);
      assert.equal(new Set(layout.cards.map((c) => c.h)).size, 1);
      assert.equal(new Set(layout.cards.map((c) => c.w)).size, 1);
      assert.ok(
        layout.cards.every((c) => c.contained && c.imageWithin),
        JSON.stringify({ width, layout }),
      );
      await p.screenshot({
        path: `.local/qa/landing-campaign/${type.name()}-${width}.png`,
        fullPage: false,
      });
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator("#lp-plans").scrollIntoViewIfNeeded();
    await p.screenshot({
      path: `.local/qa/landing-campaign/${type.name()}-cards.png`,
      fullPage: false,
    });
    await p.locator('[data-lp-slide="1"]').click();
    await p.waitForFunction(
      () => document.getElementById("lp-card-position")?.textContent === "2/3",
    );
    assert.match(await p.locator("#lp-card-position").textContent(), /2\/3/);
    await p.locator("#lp-contact-open").click();
    assert.equal(await p.locator("#lp-contact-dialog").isVisible(), true);
    assert.equal(
      await p
        .locator('#lp-contact-dialog a[href="https://m.me/pagefpt"]')
        .count(),
      1,
    );
    await p.keyboard.press("Escape");
    assert.equal(await p.locator("#lp-contact-dialog").isVisible(), false);
    const quote = await ctx.request.post(origin + "/api/v1/quotes", {
      data: {
        plan_id: plans[0].id,
        region_id: region.id,
        billing_months: 12,
        landing_slug: "qa-campaign-" + suffix,
      },
    });
    const q = await quote.json();
    assert.equal(q.monthly_vnd, 170000);
    assert.equal(q.landing.id, page.id);
    assert.equal(q.landing.version, published.version);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        browser: type.name(),
        passed: true,
        checks: [
          "simple editor",
          "period prices",
          "card labels",
          "campaign dates and stock",
          "contact and footer CRUD",
          "authoritative independent pricing",
          "320–1440 no overflow/equal cards/contained actions",
          "mobile carousel",
          "contact popup keyboard",
        ],
      }),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
