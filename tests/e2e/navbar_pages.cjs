/* Public navigation audit against an isolated database, without sending real leads. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = "http://127.0.0.1:8099",
  dir = ".local/qa/navbar-pages";
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [],
    report = { links: [], pages: [], errors };
  page.on("pageerror", (e) =>
    errors.push({ url: page.url(), message: e.message }),
  );
  await page.route("**/*", (r) =>
    r
      .request()
      .url()
      .startsWith(origin + "/")
      ? r.continue()
      : r.abort(),
  );
  await page.route("**/api/v1/regions/hierarchy", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        nam: {
          name: "Miền Nam",
          provinces: [
            {
              code: "11111111-1111-4111-8111-111111111111",
              name: "Tỉnh kiểm thử",
              zone_id: "nam",
            },
          ],
        },
      }),
    }),
  );
  await page.route("**/api/v1/regions/*/wards?*", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Phường kiểm thử",
          },
        ],
        next_cursor: null,
      }),
    }),
  );
  await page.route("**/api/v1/quotes", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "confirmed",
        monthly_vnd: r.request().postDataJSON().region_id.startsWith("222")
          ? 210000
          : 230000,
        initial_total_vnd: 1380000,
        vat_included: true,
        billing_months: 6,
        service_months: 6,
        quote_token: "qa-token",
        expires_at: "2099-01-01T00:00:00Z",
      }),
    }),
  );
  try {
    await page.goto(origin + "/");
    const links = await page
      .locator(".top-utility-bar a,.site-header a,#mobile-nav-drawer a")
      .evaluateAll((els) => [
        ...new Set(
          els
            .map((el) => el.getAttribute("href"))
            .filter((h) => h?.startsWith("/") && !h.startsWith("//")),
        ),
      ]);
    for (const link of links) {
      const res = await page.goto(origin + link);
      assert.equal(
        (
          res || (await page.request.get(origin + new URL(page.url()).pathname))
        ).status(),
        200,
        link,
      );
      const hash = new URL(page.url()).hash;
      if (hash)
        assert.equal(
          await page
            .locator('[id="' + decodeURIComponent(hash.slice(1)) + '"]')
            .count(),
          1,
          link + " anchor must exist",
        );
      assert.equal(
        await page.locator("main h1").count(),
        1,
        link + " meaningful page heading",
      );
      report.links.push(link);
    }
    const services = [
      ["internet-gia-dinh", "internet"],
      ["internet-doanh-nghiep", "business"],
      ["fpt-play", "play"],
      ["combo-fpt-play", "combo"],
      ["camera-fpt", "camera"],
    ];
    const pages = [
      ...services.map(([slug]) => "/san-pham/" + slug),
      "/khuyen-mai",
      "/do-toc-do",
      "/",
    ];
    for (const path of pages) {
      await page.goto(origin + path);
      await page.waitForTimeout(200);
      for (const width of [1440, 1024, 768, 390, 360]) {
        await page.setViewportSize({ width, height: 900 });
        const data = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          unlabelled: Array.from(
            document.querySelectorAll("input,select,textarea"),
          )
            .filter(
              (el) =>
                el.getClientRects().length &&
                !el.closest("[inert]") &&
                !["hidden", "submit", "button"].includes(el.type) &&
                !el.labels?.length &&
                !el.getAttribute("aria-label") &&
                !el.getAttribute("aria-labelledby"),
            )
            .map((el) => el.id),
        }));
        assert.ok(
          data.scrollWidth <= width + 1,
          path + " overflow at " + width,
        );
        assert.deepEqual(data.unlabelled, [], path + " fields need labels");
        report.pages.push({ path, ...data });
        await page.screenshot({
          path: dir + "/" + path.replaceAll("/", "-") + "-" + width + ".png",
          fullPage: true,
        });
      }
    }
    for (const [slug, service] of services) {
      await page.goto(origin + "/san-pham/" + slug);
      await page.locator(".service-actions button").click();
      assert.equal(await page.evaluate(() => selectedServiceId), service);
      assert.equal(
        await page.evaluate(() => selectedPlanId),
        null,
        "Generic CTA must not preselect a plan",
      );
      await page.evaluate(() => closeBottomSheet());
      await page.locator(".btn-region-inquiry").click();
      assert.equal(await page.evaluate(() => selectedServiceId), service);
      await page.evaluate(() => closeBottomSheet());
      await page.evaluate(() => openBottomSheet());
      assert.equal(
        await page.evaluate(() => selectedServiceId),
        service,
        "Shared CTA keeps current service",
      );
      await page.evaluate(() => closeBottomSheet());
      await page.locator(".btn-mobile-menu-toggle").click();
      await page.locator("#mobile-nav-drawer .btn-primary-hero").click();
      assert.equal(
        await page.evaluate(() => selectedServiceId),
        service,
        "Generic mobile CTA keeps current service",
      );
      await page.evaluate(() => closeBottomSheet());
      const cards = page.locator("[data-service-plan]");
      if (await cards.count()) {
        const card = cards.first(),
          id = await card.getAttribute("data-service-plan");
        await page.locator("#home-ward-select").selectOption("");
        await page.waitForFunction(
          (id) =>
            document
              .querySelector('[data-quote-plan="' + id + '"]')
              .textContent.includes("230.000"),
          id,
        );
        await page
          .locator("#home-ward-select")
          .selectOption("22222222-2222-4222-8222-222222222222");
        await page.waitForFunction(
          (id) =>
            document
              .querySelector('[data-quote-plan="' + id + '"]')
              .textContent.includes("210.000"),
          id,
        );
        await card.locator("button").click();
        assert.equal(await page.evaluate(() => selectedPlanId), id);
        assert.equal(await page.evaluate(() => selectedServiceId), service);
        await page.evaluate(() => closeBottomSheet());
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + "/");
    await page.locator('[aria-controls="mega-internet"]').click();
    await page.getByRole("link", { name: /Internet cho văn phòng/ }).click();
    await page.waitForURL("**/internet-doanh-nghiep#van-phong");
    assert.match(await page.locator("main h1").textContent(), /Doanh Nghiệp/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/");
    await page.locator(".btn-mobile-menu-toggle").click();
    await page.locator('[aria-controls="acc-tv"]').click();
    await page
      .getByRole("link", { name: "Tư vấn nội dung thể thao", exact: true })
      .click();
    await page.waitForURL("**/fpt-play#the-thao");
    assert.equal(
      await page.locator("#mobile-nav-drawer").getAttribute("aria-hidden"),
      "true",
    );
    await page.locator("#the-thao button").click();
    assert.equal(await page.evaluate(() => selectedServiceId), "play");
    await page.evaluate(() => closeBottomSheet());
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        links: report.links.length,
        viewportChecks: report.pages.length,
        errors,
        passed: true,
      }),
    );
  } finally {
    fs.writeFileSync(dir + "/report.json", JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
