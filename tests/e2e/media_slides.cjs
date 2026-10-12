/* Media-only hero, link destination, lazy video and mobile layout on real SQL fixtures. */
const { chromium, webkit } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8098";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Loopback required");
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium;
  const browser = await type.launch(
    type === chromium
      ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
      : {},
  );
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [];
  let videoLoads = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) => {
    const url = r.request().url();
    if (url.startsWith(origin + "/")) return r.continue();
    if (url === "https://media.example.test/promo.mp4") {
      videoLoads++;
      return r.fulfill({
        contentType: "video/mp4",
        body: fs.readFileSync(".local/qa/promo-video.mp4"),
      });
    }
    if (url.startsWith("https://media.example.test/images/"))
      return r.fulfill({
        contentType: "image/png",
        body: fs.readFileSync(".local/qa/package-upload.png"),
      });
    return r.abort();
  });
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
    await page.goto(origin + "/admin/appearance");
    await page.waitForFunction(() =>
      document
        .getElementById("home-merchandising-state")
        .textContent.includes("Đã tải"),
    );
    const saved = await page.evaluate(async () => {
      const settings = await (
        await adminFetch("/api/v1/system/display-settings")
      ).json();
      const media = await (
        await adminFetch("/api/v1/admin/workspace/media?limit=100")
      ).json();
      const image = media.items.find((x) => x.payload.state === "ready");
      const response = await adminFetch("/api/v1/system/display-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_version: settings.version,
          promo_slides: [
            {
              title: "Ảnh QA",
              description: "Không được phủ chữ lên ảnh",
              image_id: image.id,
              href: "/khuyen-mai",
            },
            {
              title: "Video QA",
              image_id: image.id,
              video_url: "https://media.example.test/promo.mp4",
              href: "/khuyen-mai",
            },
          ],
        }),
      });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#home-slide-editor details").length === 2,
    );
    await page
      .locator("#home-slide-editor details")
      .first()
      .locator("[data-key=href]")
      .fill("/chinh-sach-bao-mat");
    assert.equal(
      await page
        .locator(
          "#appearance-slide-preview h3,#appearance-slide-preview button",
        )
        .count(),
      0,
    );
    assert.equal(await page.locator("[data-key=cta_label]").count(), 0);
    await page.goto(origin + "/");
    await page.locator('[data-consent-choice="deny"]').click();
    assert.equal(videoLoads, 0, "No video bytes before play");
    assert.equal(
      await page
        .locator(
          ".home-promo-slide h1,.home-promo-slide p,.home-promo-slide button",
        )
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator(
          '.main-nav-desktop a[href*="/do-toc-do"],.mobile-nav-body a[href*="/do-toc-do"]',
        )
        .count(),
      0,
    );
    assert.equal(
      await page.locator("#home-speedtest-prompt a").getAttribute("href"),
      "/do-toc-do",
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      );
      const rect = await page
        .locator(".home-promo-slide:visible .home-promo-media")
        .boundingBox();
      assert.ok(
        Math.abs(rect.x) < 1 && Math.abs(rect.width - width) < 1,
        `Full width at ${width}`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-promo-next]").click();
    assert.equal(videoLoads, 0, "Selecting video only shows its poster");
    await page.locator("[data-promo-video]").click();
    await page.waitForFunction(() => {
      const v = document.querySelector(".home-promo-slide:not([hidden]) video");
      return v && !v.paused && v.readyState >= 2;
    });
    assert.ok(videoLoads > 0);
    await page.locator("[data-promo-video]").click();
    assert.equal(await page.locator("video").evaluate((v) => v.paused), true);
    await page.locator("[data-promo-prev]").click();
    await page.locator(".home-promo-slide:visible .home-promo-media").click();
    await page.waitForURL(origin + "/khuyen-mai");
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        browser: type.name(),
        mediaOnly: true,
        fullWidth: [320, 390, 768, 1440],
        lazyVideo: true,
        videoPlayPause: true,
        configuredLink: true,
        noSpeedtestInNavbar: true,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
