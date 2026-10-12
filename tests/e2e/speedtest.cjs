const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8099";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Loopback required");
const fixture = JSON.parse(fs.readFileSync(".local/qa/speedtest-fixture.json"));
const prepaidSpeed = process.env.PAGEFPT_QA_SPEED_SMALL_PAYLOAD ? 100 : 1000;
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: process.env.PAGEFPT_QA_SPEED_MOTION || "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let requests = 0,
    block = false,
    metadataDelay = 0,
    lateMeta = false,
    quotes = [];
  await page.route("https://speed.cloudflare.com/**", async (route) => {
    requests++;
    const url = new URL(route.request().url());
    if (block) return route.abort();
    const meta = url.searchParams.has("pagefpt_meta");
    const bytes = Number(url.searchParams.get("bytes") || 0);
    const headers = {
      "access-control-allow-origin": "*",
      "timing-allow-origin": "*",
      "access-control-expose-headers":
        "server-timing,cf-meta-ip,cf-meta-asn,cf-meta-colo,cf-meta-city,cf-meta-country",
      "server-timing": "cfReqDur;dur=1",
      "cf-meta-ip": lateMeta ? "192.0.2.99" : "192.0.2.2",
      "cf-meta-asn": "12345",
      "cf-meta-colo": "SIN",
      "cf-meta-city": "<img src=x onerror=alert(1)>",
      "cf-meta-country": "VN",
      "cache-control": "no-store",
    };
    await new Promise((r) =>
      setTimeout(r, meta ? metadataDelay : bytes >= 1e6 ? 320 : 25),
    );
    try {
      await route.fulfill({
        status: 200,
        headers,
        contentType: "text/plain",
        body:
          route.request().method() === "POST" ? "" : Buffer.alloc(bytes, 65),
      });
    } catch (_) {}
  });
  await page.route("https://stat.ripe.net/data/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.includes("network-info")
      ? { asns: ["12345"] }
      : path.includes("as-overview")
        ? { holder: "QA Telecom" }
        : {
            located_resources: [
              { locations: [{ city: "Vung Tau", country: "VN" }] },
            ],
          };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
  await page.route("**/api/v1/regions/hierarchy", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        mien_nam: {
          name: "Miền Nam",
          provinces: [
            {
              name: "Tỉnh kiểm thử",
              code: fixture.province,
              zone_id: "mien_nam",
            },
            { name: "Tỉnh khác", code: fixture.other, zone_id: "mien_nam" },
          ],
        },
      }),
    }),
  );
  await page.route("**/api/v1/regions/*/wards?*", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: r.request().url().includes(fixture.province)
          ? [{ id: fixture.ward, name: "Phường kiểm thử" }]
          : [],
        next_cursor: null,
      }),
    }),
  );
  await page.route("**/api/v1/quotes", async (r) => {
    const input = r.request().postDataJSON();
    quotes.push(input);
    const plan = fixture.plans.find((p) => p.id === input.plan_id);
    const allowed =
      !plan?.applicable_region_ids?.length ||
      plan.applicable_region_ids.includes(input.region_id) ||
      (input.region_id === fixture.ward &&
        plan.applicable_region_ids.includes(fixture.province));
    await r.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        allowed
          ? {
              status: "confirmed",
              monthly_vnd: plan.speed_mbps === prepaidSpeed ? null : 220000,
              initial_total_vnd: 1320000,
              vat_included: true,
              billing_months: 6,
            }
          : { status: "not_available" },
      ),
    });
  });
  try {
    await page.goto(origin + "/do-toc-do");
    await page.locator('[data-consent-choice="deny"]').click();
    await page.waitForFunction(
      () => document.getElementById("home-province-select").options.length > 1,
    );
    await page.locator("#home-province-select").selectOption(fixture.province);
    await page.waitForFunction(
      () => document.getElementById("home-ward-select").options.length > 1,
    );
    assert.equal(
      requests,
      0,
      "Opening the page must not transmit speed-test data",
    );
    assert.equal(
      await page.locator('script[src*="cloudflare-speedtest"]').count(),
      0,
    );
    assert.equal(await page.locator("#speed-download").textContent(), "—");
    const ticks = await page.locator(".speed-dial text").evaluateAll((nodes) =>
      nodes.map((node) => {
        const n = Number(node.textContent.replace("+", ""));
        const angle =
          ((135 + 270 * window.PageFPTSpeedModel.gauge(n)) * Math.PI) / 180;
        return {
          value: n,
          error: Math.hypot(
            Number(node.getAttribute("x")) - (200 + 172 * Math.cos(angle)),
            Number(node.getAttribute("y")) - (200 + 172 * Math.sin(angle)),
          ),
        };
      }),
    );
    assert.equal(ticks.length, 6);
    for (const tick of ticks)
      assert.ok(
        tick.error < 0.1,
        "Dial mark must match needle scale: " + tick.value,
      );
    await page.locator("#home-ward-select").selectOption(fixture.ward);
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll(
          "[data-speed-plan]:not([hidden]) .speed-plan-price",
        ),
      ].some((price) => price.textContent.includes("220.000")),
    );
    assert.equal(await page.locator("[data-speed-plan]:visible").count(), 3);
    assert.equal(
      await page
        .locator("[data-speed-plan]:visible")
        .filter({ hasText: "QA Other Region" })
        .count(),
      0,
    );
    if (process.env.PAGEFPT_QA_SPEED_SMALL_PAYLOAD)
      await page.evaluate(() => {
        const original = window.PageFPTSpeedModel.config;
        window.PageFPTSpeedModel.config = () => {
          const config = original();
          config.measurements = config.measurements.map((m) => ({
            ...m,
            ...(m.bytes ? { bytes: Math.min(m.bytes, 1000000) } : {}),
          }));
          return config;
        };
      });
    await page.locator("#speedtest-start").click();
    await page.waitForFunction(
      () =>
        document.getElementById("speedtest-console").dataset.state ===
        "download",
    );
    fs.mkdirSync(".local/qa/speedtest", { recursive: true });
    await page.locator("#speedtest-console").screenshot({
      path:
        ".local/qa/speedtest/measuring-" +
        (process.env.PAGEFPT_QA_SPEED_MOTION || "reduce") +
        ".png",
    });
    assert.equal(
      await page
        .locator(".speed-scan-ring")
        .evaluate((el) => getComputedStyle(el).animationName),
      process.env.PAGEFPT_QA_SPEED_MOTION === "no-preference"
        ? "speed-scan"
        : "none",
    );
    await page.waitForFunction(
      () =>
        document.getElementById("speedtest-console").dataset.state ===
        "complete",
      null,
      { timeout: 30000 },
    );
    assert.ok(
      requests > 12,
      "Official engine must run actual measurement requests",
    );
    assert.ok(
      Number(
        (await page.locator("#speed-download").textContent()).replace(",", "."),
      ) > 0,
    );
    assert.ok(
      Number(
        (await page.locator("#speed-upload").textContent()).replace(",", "."),
      ) > 0,
    );
    assert.equal(
      await page.locator("#speed-meta-asn").textContent(),
      "AS12345",
    );
    assert.equal(
      await page.locator("#speed-meta-isp").textContent(),
      "QA Telecom",
    );
    assert.match(
      await page.locator("#speed-meta-location").textContent(),
      /Vung Tau/,
    );
    assert.equal(
      await page.locator("#speed-meta-location img").count(),
      0,
      "Metadata must render as text",
    );
    assert.ok(
      (await page.locator("#speed-chart-down").getAttribute("d")).startsWith(
        "M",
      ),
    );
    await page.locator(".speed-details summary").click();
    assert.ok(
      (await page.locator("#speed-ping-samples").textContent()) !== "—",
    );
    assert.equal(
      await page
        .locator(".speed-details")
        .textContent()
        .then((t) => t.includes("TURN")),
      false,
    );
    assert.ok(quotes.some((q) => q.region_id === fixture.ward));
    await page.waitForFunction(
      (speed) =>
        Array.from(
          document.querySelectorAll("[data-speed-plan]:not([hidden])"),
        ).some(
          (card) =>
            card.querySelector("h3").textContent === "QA Global" + speed &&
            card
              .querySelector(".speed-plan-price-label")
              .textContent.includes("Thanh toán ban đầu"),
        ),
      prepaidSpeed,
      { timeout: 3000 },
    );
    for (const width of [1440, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      );
      if (width >= 1024)
        assert.ok(
          await page.evaluate(() => {
            const logo = document
                .querySelector(".logo-group")
                .getBoundingClientRect(),
              nav = document
                .querySelector(".main-nav-desktop")
                .getBoundingClientRect(),
              actions = document
                .querySelector(".header-actions")
                .getBoundingClientRect();
            const portal = document.querySelector(".portal-title"),
              range = document.createRange();
            range.selectNodeContents(portal);
            const portalRight =
              getComputedStyle(portal).display === "none"
                ? logo.right
                : range.getBoundingClientRect().right;
            return (
              logo.right <= nav.left + 1 &&
              portalRight <= nav.left + 1 &&
              nav.right <= actions.left + 1
            );
          }),
          "Navbar items must not overlap the brand or contact controls",
        );
      fs.mkdirSync(".local/qa/speedtest", { recursive: true });
      await page.screenshot({
        path: `.local/qa/speedtest/complete-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .locator("[data-speed-plan]:visible .speed-plan-cta")
      .first()
      .click();
    assert.ok(await page.evaluate(() => selectedPlanId));
    await page.evaluate(() => closeBottomSheet());
    metadataDelay = 500;
    lateMeta = true;
    await page.locator("#speedtest-start").click();
    await page.locator("#home-province-select").selectOption(fixture.other);
    await page.waitForTimeout(30);
    assert.equal(
      await page
        .locator("[data-speed-plan]:visible")
        .filter({ hasText: "QA Province300" })
        .count(),
      0,
      "Changing region while measuring must remove old scoped packages",
    );
    assert.equal(
      await page
        .locator("[data-speed-plan]:visible .speed-plan-price")
        .filter({ hasText: "220.000" })
        .count(),
      0,
      "A price from the previous region must never stay visible",
    );
    await page.locator("#speedtest-cancel").click();
    await page.waitForTimeout(650);
    assert.equal(
      await page.locator("#speedtest-console").getAttribute("data-state"),
      "cancelled",
    );
    assert.notEqual(
      await page.locator("#speed-meta-ip").textContent(),
      "192.0.2.99",
      "Aborted metadata cannot replace cancelled results",
    );
    block = true;
    metadataDelay = 0;
    await page.locator("#speedtest-start").click();
    await page.waitForFunction(
      () =>
        document.getElementById("speedtest-console").dataset.state === "error",
    );
    assert.equal(await page.locator("#speed-download").textContent(), "—");
    assert.equal(await page.locator("#speedtest-start").isEnabled(), true);
    block = false;
    await page.locator("#speedtest-start").click();
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      ),
    );
    assert.equal(
      await page.locator("#speedtest-console").getAttribute("data-state"),
      "cancelled",
      "A page restored from browser history must show a stopped measurement",
    );
    const beforeRestore = quotes.length;
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll(
          "[data-speed-plan]:not([hidden]) .speed-plan-price",
        ),
      ].some((price) => price.textContent.includes("220.000")),
    );
    assert.ok(
      quotes.length > beforeRestore,
      "Restoring a page must refresh interrupted regional quotes",
    );
    await page.locator("#speedtest-start").click();
    await page.waitForFunction(() =>
      ["latency", "download"].includes(
        document.getElementById("speedtest-console").dataset.state,
      ),
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(
      await page.locator("#speedtest-console").getAttribute("data-state"),
      "cancelled",
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      ".local/qa/speedtest/result.json",
      JSON.stringify(
        {
          passed: true,
          requests,
          widths: [1440, 1024, 768, 390, 360],
          errors,
          customer_mutations: false,
        },
        null,
        2,
      ),
    );
    console.log(
      "Speedtest browser passed: official engine, no auto transfer, real samples, scoped quotes/intake, cancel/error/retry/hidden, responsive.",
    );
  } catch (error) {
    console.error(
      "Speed test failure snapshot",
      await page.evaluate(() => ({
        state: document.getElementById("speedtest-console")?.dataset.state,
        status: document.getElementById("speedtest-status")?.textContent,
        download: document.getElementById("speed-download")?.textContent,
        upload: document.getElementById("speed-upload")?.textContent,
      })),
      { requests, errors },
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
