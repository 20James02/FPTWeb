const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ""))
  throw Error("Loopback fixture required");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PAGEFPT_CHROME_BINARY,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.route("**/*", (r) =>
    r
      .request()
      .url()
      .startsWith(origin + "/")
      ? r.continue()
      : r.request().url().startsWith("https://media.example.test/images/")
        ? r.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="330" height="238"><rect width="330" height="238" fill="#ff6400"/><text x="24" y="60" fill="white" font-family="Arial" font-size="26" font-weight="bold">COMBO GIGA V.VIP</text><rect x="226" y="105" width="55" height="100" rx="8" fill="white"/><path d="M60 185 Q110 40 175 185" fill="none" stroke="white" stroke-width="6"/></svg>',
          })
        : r.abort(),
  );
  const page = await context.newPage(),
    errors = [],
    layouts = [];
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);
  page.on("pageerror", (e) => errors.push(e.message));
  fs.mkdirSync(".local/qa/reference-cards", { recursive: true });
  try {
    assert.equal(
      (
        await context.request.post(origin + "/api/v1/auth/session", {
          data: {
            email: "qa-admin@example.test",
            password: "qa-only-password",
            otp: "123456",
          },
        })
      ).status(),
      200,
    );
    await page.goto(origin + "/admin/pricing");
    const api = (path, method = "GET", data) =>
      page.evaluate(
        async ({ path, method, data }) => {
          const r = await adminFetch("/api/v1" + path, {
            method,
            headers: { "Content-Type": "application/json" },
            ...(data ? { body: JSON.stringify(data) } : {}),
          });
          const result = await r.json();
          if (!r.ok)
            throw Error(JSON.stringify({ path, status: r.status, result }));
          return result;
        },
        { path, method, data },
      );
    const media = (await api("/admin/workspace/media")).items.find(
        (x) => x.payload.state === "ready",
      ),
      plans = [];
    const region = (await api("/regions")).items[0];
    for (let i = 0; i < 3; i++) {
      const plan = await api("/admin/plans", "POST", {
        name:
          i === 1
            ? "Gói có tên dài cần hiển thị đủ thông tin trong chi tiết"
            : "Combo Giga - V.VIP " + i,
        code: "reference-" + i,
        service: "internet",
        speed_mbps: 300,
        upload_speed_mbps: i === 2 ? null : 150,
        image_id: media.id,
        equipment:
          i === 1
            ? Array.from(
                { length: 20 },
                (_, k) =>
                  "Thiết bị và ưu đãi dài cần cuộn để đọc thông tin " + k,
              )
            : [
                "Modem Wi-Fi 6, tốc độ 300 Mbps",
                "Xem trọn vẹn giải trí trên nhiều thiết bị",
              ],
        description: "Mô tả đầy đủ của gói",
        card_labels: {
          badge: "",
          register: "Đăng ký ngay",
          details: "Xem chi tiết",
        },
      });
      await api("/admin/plans/" + plan.id + "/publish", "POST", {
        expected_version: plan.version,
      });
      plans.push(plan);
      for (const [months, factor] of [
        [1, "1"],
        [6, "0.98"],
        [12, "0.95"],
      ]) {
        const price = await api("/admin/prices", "POST", {
          plan_id: plan.id,
          scope_kind: "default",
          scope_id: "00000000-0000-0000-0000-000000000000",
          billing_months: months,
          monthly_vnd: 220000,
          monthly_coefficient: factor,
          start: "2026-01-01T00:00:00Z",
          source: "QA synthetic",
        });
        await api("/admin/prices/" + price.id + "/publish", "POST", {
          expected_version: price.version,
        });
      }
    }
    // Exercise exactly three published cards, including long copy and unknown upload.
    for (const other of (await api("/catalog")).items.filter(
      (x) => !plans.some((p) => p.id === x.id),
    )) {
      const row = await api("/admin/plans/" + other.id);
      await api("/admin/plans/" + other.id + "/retire", "POST", {
        expected_version: row.version,
      });
    }
    const accessory = await api("/admin/products", "POST", {
      name: "Thiết bị thử nghiệm",
      code: "reference-device",
      service: "internet",
      plan_ids: [plans[0].id],
      price_vnd: 30000,
      original_price_vnd: 50000,
      billing_mode: "monthly",
    });
    await api("/admin/products/" + accessory.id + "/publish", "POST", {
      expected_version: accessory.version,
    });
    const landing = await api("/admin/pages", "POST", {
      title: "Reference landing",
      slug: "reference-landing",
      blocks: [],
      template: "telecom",
      landing: {
        hero_title: "QA",
        plan_ids: plans.map((x) => x.id),
        desktop_columns: 3,
      },
    });
    await api("/admin/pages/" + landing.id + "/publish", "POST", {
      expected_version: landing.version,
    });
    // The optional upload speed round-trips through the actual Admin editor.
    const original = await api("/admin/plans/" + plans[0].id);
    await page.evaluate((row) => openPlanDialog(row), original);
    assert.equal(await page.locator("#plan-upload-speed").inputValue(), "150");
    await page.locator("#plan-upload-speed").fill("300");
    await page.locator("#plan-submit").click();
    await page.locator("#plan-dialog").waitFor({ state: "hidden" });
    const edited = await api("/admin/plans/" + plans[0].id);
    assert.equal(edited.payload.upload_speed_mbps, 300);
    await api("/admin/plans/" + plans[0].id + "/publish", "POST", {
      expected_version: edited.version,
    });
    for (const path of ["/", "/reference-landing"]) {
      await page.goto(origin + path, { waitUntil: "domcontentloaded" });
      if (await page.locator('[data-consent-choice="reject"]').isVisible())
        await page.locator('[data-consent-choice="reject"]').click();
      await page.waitForFunction(
        (id) =>
          [...document.getElementById("home-province-select").options].some(
            (o) => o.value === id,
          ),
        region.id,
      );
      await page.locator("#home-province-select").selectOption(region.id);
      if (path === "/")
        await page.evaluate((id) => {
          currentMultitaskIndex = [
            ...document.querySelectorAll(
              "#plans-slider-track .plan-card-3d-wrapper",
            ),
          ]
            .filter((c) => c.dataset.categoryHidden !== "true")
            .findIndex((c) => c.dataset.planId === id);
          renderMultitaskState(false);
        }, plans[0].id);
      const card = page.locator(
        `.plan-card--reference[data-plan-id="${plans[0].id}"]`,
      );
      const period = card.locator("[data-billing-months]");
      await period.selectOption("12");
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-quote-plan="${id}"]`).textContent ===
          "209.000đ",
        plans[0].id,
      );
      await card.locator(`[data-accessory-id="${accessory.id}"]`).check();
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-quote-plan="${id}"]`).textContent ===
          "239.000đ",
        plans[0].id,
      );
      assert.match(
        await card.locator(".plan-speed-values").textContent(),
        /300 Mbps/,
      );
      await card.locator(".plan-price-info").click();
      await page.locator("#plan-details-dialog[open]").waitFor();
      assert.match(
        await page.locator("#plan-details-description").textContent(),
        /Mô tả đầy đủ/,
      );
      await page.keyboard.press("Escape");
      for (const width of [320, 390, 430, 768, 960, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        if (path === "/")
          await page.evaluate(() => renderMultitaskState(false));
        await page.waitForTimeout(100);
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          cards: [...document.querySelectorAll(".plan-card--reference")].map(
            (c) => {
              const q = (s) => c.querySelector(s),
                css = (s) => getComputedStyle(q(s));
              return {
                width: parseFloat(getComputedStyle(c).width),
                height: parseFloat(getComputedStyle(c).height),
                image: parseFloat(css(".plan-card-image-wrap").height),
                imageFit: css(".plan-card-image").objectFit,
                body: q(".plan-card-body").scrollHeight,
                bodyClient: q(".plan-card-body").clientHeight,
                blue: css(".btn-select-plan").backgroundColor,
                priceColor: css(".plan-price-amount").color,
                actionsBottom:
                  q(".plan-card-actions").getBoundingClientRect().bottom,
                faceBottom:
                  q(".card-face-front").getBoundingClientRect().bottom,
                benefitsHeight: q(".plan-benefits-scroll").clientHeight,
              };
            },
          ),
        }));
        if (metrics.overflow)
          console.error(
            "Overflow elements",
            await page.evaluate(() =>
              [...document.querySelectorAll("body *")]
                .filter(
                  (el) =>
                    el.getClientRects().length &&
                    el.getBoundingClientRect().right > innerWidth + 1,
                )
                .slice(0, 15)
                .map((el) => ({
                  tag: el.tagName,
                  id: el.id,
                  cls: String(el.className),
                  right: el.getBoundingClientRect().right,
                })),
            ),
          );
        assert.equal(
          metrics.overflow,
          false,
          JSON.stringify({ path, width, metrics }),
        );
        for (const m of metrics.cards) {
          assert.equal(m.height, 650);
          assert.equal(m.image, 238);
          assert.equal(m.imageFit, "cover");
          if (!m.bodyClient) continue; // Carousel keeps off-screen cards unmounted from layout.
          assert.ok(
            m.width <= 330 && m.width <= width - 40,
            JSON.stringify({ width, m }),
          );
          assert.ok(
            m.body <= m.bodyClient + 2,
            JSON.stringify({ path, width, m }),
          );
          assert.equal(m.blue, "rgb(70, 91, 237)");
          assert.equal(m.priceColor, "rgb(70, 91, 237)");
          assert.ok(m.benefitsHeight >= 48);
          assert.ok(m.actionsBottom <= m.faceBottom - 10, JSON.stringify(m));
        }
        layouts.push({ path, width, ...metrics });
        if (width === 390 || width === 1440) {
          await card.scrollIntoViewIfNeeded();
          await card.evaluate((el) => {
            window.scrollTo(
              0,
              window.scrollY + el.getBoundingClientRect().top - 160,
            );
            el.querySelector(".plan-benefits-scroll").scrollTop = 0;
            if (document.activeElement instanceof HTMLElement)
              document.activeElement.blur();
          });
          await page.screenshot({
            path: `.local/qa/reference-cards/${path === "/" ? "home" : "landing"}-${width}.png`,
          });
          if (width === 390)
            await card.screenshot({
              path: `.local/qa/reference-cards/${path === "/" ? "home" : "landing"}-card.png`,
            });
        }
      }
      await card.locator(".btn-select-plan").click();
      await page.locator("#bottom-sheet-backdrop.active").waitFor();
      await page.waitForFunction(() =>
        document
          .getElementById("form-plan-fee")
          .textContent.includes("2.868.000"),
      );
      assert.match(
        await page.locator("#form-plan-fee").textContent(),
        /2.868.000/,
      );
      await page.evaluate(() => closeBottomSheet());
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      ".local/qa/reference-cards/result.json",
      JSON.stringify(
        { passed: true, layouts, errors, synthetic_only: true },
        null,
        2,
      ),
    );
    console.log(
      "Reference cards passed: Admin upload speed, billing/accessory totals, popup, registration, 12 mobile/tablet/desktop views",
    );
  } catch (e) {
    console.error(
      "UI debug",
      page.url(),
      await page.locator(".plan-card--reference").count(),
    );
    await page
      .screenshot({ path: ".local/qa/reference-cards/failure.png" })
      .catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
