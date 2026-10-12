const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8099";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Loopback required");
const fixture = JSON.parse(fs.readFileSync(".local/qa/speedtest-fixture.json"));
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const mode of ["granted", "denied", "pending", "failed-lookup"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
        geolocation: { latitude: 10.35, longitude: 107.08, accuracy: 50 },
      });
      if (mode === "granted" || mode === "failed-lookup")
        await context.grantPermissions(["geolocation"], { origin });
      await context.addInitScript((mode) => {
        window.geoCalls = 0;
        if (mode === "pending")
          Object.defineProperty(navigator, "geolocation", {
            value: {
              getCurrentPosition() {
                window.geoCalls++;
              },
            },
          });
        else {
          const original = navigator.geolocation.getCurrentPosition.bind(
            navigator.geolocation,
          );
          navigator.geolocation.getCurrentPosition = (...args) => {
            window.geoCalls++;
            return original(...args);
          };
        }
      }, mode);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      if (mode === "denied") {
        const cdp = await context.newCDPSession(page);
        const { targetInfo } = await cdp.send("Target.getTargetInfo");
        await cdp.send("Browser.setPermission", {
          permission: { name: "geolocation" },
          setting: "denied",
          origin,
          browserContextId: targetInfo.browserContextId,
        });
      }
      let lookups = 0,
        duringMeasurement = 0,
        quotes = [];
      await page.route("https://api.bigdatacloud.net/**", async (r) => {
        lookups++;
        const state = await page
          .locator("#speedtest-console")
          .getAttribute("data-state");
        if (state !== "complete") duringMeasurement++;
        assert.equal(
          new URL(r.request().url()).searchParams.get("latitude"),
          "10.35",
        );
        if (mode === "failed-lookup") return r.abort();
        await r.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            countryCode: "VN",
            lookupSource: "reverseGeocoding",
            principalSubdivision: "Tỉnh kiểm thử",
            locality: "Phường kiểm thử",
          }),
        });
      });
      await page.route("https://speed.cloudflare.com/**", async (r) => {
        const bytes = Number(
          new URL(r.request().url()).searchParams.get("bytes") || 0,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, bytes >= 1e6 ? 250 : 25),
        );
        try {
          await r.fulfill({
            status: 200,
            contentType: "text/plain",
            headers: {
              "access-control-allow-origin": "*",
              "timing-allow-origin": "*",
              "server-timing": "cfReqDur;dur=1",
            },
            body:
              r.request().method() === "POST" ? "" : Buffer.alloc(bytes, 65),
          });
        } catch (_) {}
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
      await page.route("**/api/v1/quotes", (r) => {
        quotes.push(r.request().postDataJSON());
        return r.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            status: "confirmed",
            monthly_vnd: 220000,
            initial_total_vnd: 1320000,
            vat_included: true,
            billing_months: 6,
          }),
        });
      });
      await page.goto(origin + "/do-toc-do");
      assert.equal(await page.evaluate(() => window.geoCalls), 0);
      assert.equal(lookups, 0);
      await page.locator("#speedtest-start").click();
      await page.waitForFunction(
        () =>
          document.getElementById("speedtest-console").dataset.state ===
          "download",
      );
      assert.equal(
        await page.evaluate(() => window.geoCalls),
        1,
        "Location permission must be requested after starting, without blocking measurement",
      );
      assert.equal(
        lookups,
        0,
        "Reverse geocoding must not interfere with measurement traffic",
      );
      await page.waitForFunction(
        () =>
          document.getElementById("speedtest-console").dataset.state ===
          "complete",
        null,
        { timeout: 30000 },
      );
      assert.ok((await page.locator("#speed-download").textContent()) !== "—");
      if (mode === "granted") {
        await page
          .locator("#speed-location-apply")
          .waitFor({ state: "visible" });
        assert.equal(
          await page.locator("#home-province-select").inputValue(),
          fixture.other,
          "Suggestion must not silently overwrite manual/default location",
        );
        await page.locator("#speed-location-apply").click();
        await page.waitForFunction(
          (id) => document.getElementById("home-ward-select").value === id,
          fixture.ward,
        );
        await page.waitForFunction(
          (id) =>
            document.querySelector('[data-speed-plan="' + id + '"]').hidden ===
            false,
          fixture.plans.find((p) => p.name === "QA Ward500").id,
        );
        assert.ok(quotes.some((q) => q.region_id === fixture.ward));
        assert.equal(duringMeasurement, 0);
      } else {
        assert.equal(
          await page.locator("#speed-location-apply").isVisible(),
          false,
        );
        if (mode === "denied" || mode === "pending") assert.equal(lookups, 0);
        if (mode === "denied")
          assert.match(
            await page.locator("#speed-location-status").textContent(),
            /từ chối|không chia sẻ/i,
          );
      }
      assert.equal(
        await page.evaluate(() =>
          Object.keys(localStorage).some((k) =>
            /latitude|longitude|coordinates/i.test(k),
          ),
        ),
        false,
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log("Location scenario passed: " + mode);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
