/* Real Admin renderer and SQL fixture; delayed responses exercise stale-save races. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ""))
  throw Error("Loopback required");
const only = process.env.PAGEFPT_STUDIO_CASE;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PAGEFPT_CHROME_BINARY,
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await ctx.route("**/*", (r) =>
    r
      .request()
      .url()
      .startsWith(origin + "/")
      ? r.continue()
      : r.abort(),
  );
  const errors = [];
  let page;
  let passed = 0,
    failed = 0;
  try {
    const login = await ctx.request.post(origin + "/api/v1/auth/session", {
      data: {
        email: "qa-admin@example.test",
        password: "qa-only-password",
        otp: "123456",
      },
    });
    assert.equal(login.status(), 200);
    const csrf = (await ctx.cookies()).find(
      (c) => c.name === "pagefpt_csrf",
    ).value;
    const api = async (path, method = "GET", data) => {
      const response = await ctx.request.fetch(origin + "/api/v1" + path, {
        method,
        data,
        headers: { "X-CSRF-Token": csrf, Origin: origin },
      });
      assert.ok(response.ok(), await response.text());
      return response.json();
    };
    const plan = await api("/admin/plans", "POST", {
      name: "QA Studio Plan",
      code: "qa-studio-plan",
      service: "internet",
      speed_mbps: 300,
    });
    await api(`/admin/plans/${plan.id}/publish`, "POST", {
      expected_version: plan.version,
    });
    const data = (slug, title) => ({
      title,
      slug,
      template: "telecom",
      blocks: [],
      landing: {
        hero_title: title,
        plan_ids: [plan.id],
        plan_presentations: [{ plan_id: plan.id, features: ["QA feature"] }],
      },
    });
    const a = await api(
      "/admin/pages",
      "POST",
      data("qa-studio-a", "QA Studio A"),
    );
    const b = await api(
      "/admin/pages",
      "POST",
      data("qa-studio-b", "QA Studio B"),
    );
    const create = async () => {
      await page.goto(origin + "/admin/landing-pages");
      await page.locator("#lp-admin-new").click();
      await page.locator('[data-path="landing.hero_title"]').waitFor();
    };
    const open = async (name) => {
      await page.goto(origin + "/admin/landing-pages");
      await page
        .locator(".lp-admin-page")
        .filter({ has: page.getByRole("heading", { name, exact: true }) })
        .getByRole("button", { name: "Chỉnh sửa", exact: true })
        .click();
      await page.locator('[data-path="landing.hero_title"]').waitFor();
    };
    const test = async (name, fn) => {
      if (only && !only.split(",").includes(name)) return;
      page = await ctx.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.error("BROWSER", name, e.message);
      });
      page.on("dialog", (dialog) => dialog.accept());
      const start = errors.length;
      try {
        await fn();
        assert.deepEqual(
          errors.slice(start),
          [],
          "No runtime errors for " + name,
        );
        passed++;
        console.log("PASS", name);
      } catch (e) {
        failed++;
        console.error("FAIL", name, e.message);
      } finally {
        await page.close();
      }
    };
    await test("sidebar", async () => {
      await create();
      const first = await page
        .locator(".lp-sidebar-item")
        .first()
        .getAttribute("data-block-key");
      await page
        .locator(".lp-sidebar-item")
        .first()
        .locator('[title="Di chuyển xuống dưới"]')
        .click();
      assert.notEqual(
        await page
          .locator(".lp-sidebar-item")
          .first()
          .getAttribute("data-block-key"),
        first,
      );
      assert.equal(
        await page.locator("#lp-admin-dirty-badge").isVisible(),
        true,
      );
      const compare = page.locator('[data-block-key="compare"] input');
      await compare.uncheck();
      await page.locator("#lp-admin-preview-refresh").click();
      await page.waitForFunction(() =>
        document
          .getElementById("lp-admin-preview-state")
          .textContent.includes("Chưa công bố"),
      );
      assert.equal(
        await page
          .frameLocator("#lp-admin-preview-frame")
          .locator(".lp-comparison-section")
          .count(),
        0,
      );
    });
    await test("features-undo", async () => {
      await open("QA Studio A");
      await page
        .locator('[data-section-id="s-plans"]')
        .evaluate((el) => (el.open = true));
      const box = page
        .locator(".lp-admin-plan")
        .filter({ has: page.locator(`[data-landing-plan="${plan.id}"]`) });
      await box.locator("summary").click();
      await box
        .locator('textarea[data-path$=".features"]')
        .fill("Changed benefit\nAnother benefit");
      await page.locator("#lp-admin-undo").click();
      await page
        .locator('[data-section-id="s-plans"]')
        .evaluate((el) => (el.open = true));
      await box.locator("summary").click();
      assert.equal(
        await box.locator('textarea[data-path$=".features"]').inputValue(),
        "QA feature",
      );
      await page.locator("#lp-admin-redo").click();
      await page
        .locator('[data-section-id="s-plans"]')
        .evaluate((el) => (el.open = true));
      await box.locator("summary").click();
      assert.equal(
        await box.locator('textarea[data-path$=".features"]').inputValue(),
        "Changed benefit\nAnother benefit",
      );
    });
    await test("deep-link", async () => {
      await page.goto(origin + `/admin/landing-pages?id=${a.id}`);
      await page.waitForFunction(
        () => !document.getElementById("lp-admin-editor").hidden,
      );
      assert.equal(
        await page.locator('[data-path="title"]').inputValue(),
        "QA Studio A",
      );
    });
    await test("copy-preview", async () => {
      await open("QA Studio A");
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (text) => {
              window.qaCopied = text;
            },
          },
          configurable: true,
        }),
      );
      await page.locator("#lp-admin-preview-copy-link").click();
      await page.waitForFunction(() => window.qaCopied);
      assert.equal(
        await page.evaluate(() => window.qaCopied),
        origin + `/admin/pages/${a.id}/preview`,
      );
      const response = await ctx.request.get(
        await page.evaluate(() => window.qaCopied),
      );
      assert.equal(response.status(), 200);
    });
    await test("phone", async () => {
      const live = await api(
        "/admin/pages",
        "POST",
        data("qa-studio-phone", "QA Phone"),
      );
      await api(`/admin/pages/${live.id}/publish`, "POST", {
        expected_version: live.version,
      });
      await page.goto(origin + "/qa-studio-phone");
      const phone = page
        .locator("[data-lp-form]")
        .first()
        .locator('[name="phone"]');
      await phone.fill("+84901234567");
      assert.equal(
        (await phone.inputValue()).replace(/[ .-]/g, ""),
        "+84901234567",
      );
      await page
        .locator("[data-lp-form]")
        .first()
        .locator('[type="submit"]')
        .click();
      assert.equal(
        await page
          .locator("#bottom-sheet-backdrop")
          .getAttribute("aria-hidden"),
        "false",
      );
      assert.equal(
        (await page.locator("#lead-phone").inputValue()).replace(/[ .-]/g, ""),
        "+84901234567",
      );
    });
    await test("preset-facts", async () => {
      await create();
      await page.locator("#lp-admin-preset-select").selectOption("megasale");
      await page.locator("#lp-admin-preset-apply").click();
      const get = (key) =>
        page.locator(`[data-path="landing.${key}"]`).inputValue();
      assert.equal(await get("campaign.stock_total"), "");
      assert.equal(await get("campaign.stock_remaining"), "");
      assert.equal(await get("campaign.end"), "");
      assert.equal(
        await page
          .locator('[data-path="landing.campaign.enabled"]')
          .isChecked(),
        false,
      );
      assert.ok(!(await get("hero_highlight")).includes("30%"));
    });
    await test("stock-undo", async () => {
      await create();
      for (const key of ["stock_total", "stock_remaining"]) {
        await page
          .locator('[data-section-id="s-campaign"]')
          .evaluate((el) => (el.open = true));
        const input = page.locator(`[data-path="landing.campaign.${key}"]`);
        await input.fill("17");
        await input.fill("");
        await page.locator("#lp-admin-undo").click();
        assert.equal(
          await input.inputValue(),
          "17",
          key + " returns to previous count",
        );
      }
    });
    await test("photo-undo", async () => {
      await create();
      await page.locator('[data-path="slug"]').fill("qa-photo-undo");
      const id = "d2b6d83e-3e38-4381-9e8e-930c15dbb388";
      await page.evaluate((assetId) => {
        window.adminUploadImage = async () => ({
          id: assetId,
          payload: {
            url: location.origin + "/static/images/fpt-telecom-logo.svg",
          },
        });
      }, id);
      const photo = page.locator(".lp-admin-photo").first();
      await photo.locator('input[type="file"]').setInputFiles({
        name: "qa.png",
        mimeType: "image/png",
        buffer: Buffer.from("fixture"),
      });
      await photo
        .getByRole("status")
        .filter({ hasText: "Ảnh sẵn sàng" })
        .waitFor();
      await photo.getByRole("button", { name: "Bỏ ảnh", exact: true }).click();
      await page.locator("#lp-admin-undo").click();
      assert.equal(await photo.locator("img").isVisible(), true);
      let saved;
      await page.route(origin + "/api/v1/admin/pages", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        saved = route.request().postDataJSON();
        await route.abort();
      });
      await page.locator("#lp-admin-save").click();
      await page.waitForResponse(() => false, { timeout: 300 }).catch(() => {});
      assert.equal(
        saved.landing.hero_image_id,
        id,
        "Restored thumbnail and saved image agree",
      );
      await page.locator("#lp-admin-undo").click();
      assert.equal(
        await photo.locator("img").isVisible(),
        false,
        "One Undo reverts the whole upload",
      );
    });
    await test("change-plan", async () => {
      const live = await api(
        "/admin/pages",
        "POST",
        data("qa-studio-change", "QA Change"),
      );
      await api(`/admin/pages/${live.id}/publish`, "POST", {
        expected_version: live.version,
      });
      await page.goto(origin + "/qa-studio-change");
      await page.locator(".lp-plan-card .btn-select-plan").first().click();
      await page.getByRole("button", { name: "Đổi gói", exact: true }).click();
      assert.equal(
        await page
          .locator("#bottom-sheet-backdrop")
          .getAttribute("aria-hidden"),
        "true",
      );
      await page.waitForFunction(
        () =>
          Math.abs(
            document.getElementById("lp-plans").getBoundingClientRect().top,
          ) < 150,
      );
    });
    await test("responsive-editor", async () => {
      await create();
      for (const width of [320, 390, 768, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          (await page.locator("#lp-admin-preset-select").boundingBox()).width >=
            100,
          `Preset selector readable at ${width}px`,
        );
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        const offenders = await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter(
              (el) =>
                el.getBoundingClientRect().right > innerWidth + 1 &&
                el.getBoundingClientRect().width > 0,
            )
            .slice(0, 8)
            .map((el) => el.tagName + "." + el.className),
        );
        assert.ok(
          overflow <= 1,
          `Admin ${width}px overflows ${overflow}px: ${offenders.join(", ")}`,
        );
        const labelsReadable = await page
          .locator(".lp-sidebar-item-label")
          .evaluateAll((labels) =>
            labels.every(
              (label) =>
                getComputedStyle(label).whiteSpace === "normal" &&
                label.scrollWidth <= label.clientWidth + 1,
            ),
          );
        assert.equal(
          labelsReadable,
          true,
          `Sidebar labels readable at ${width}px`,
        );
        if ([390, 1440].includes(width)) {
          await page.screenshot({
            path: `.local/qa/pre-push-2026-10-12/studio-${width}.png`,
            fullPage: false,
          });
          await page
            .locator(".lp-admin-nav-sidebar")
            .screenshot({
              path: `.local/qa/pre-push-2026-10-12/studio-nav-${width}.png`,
            });
        }
        if (width < 1280) {
          await page.locator("#lp-tab-preview").click();
          assert.equal(
            await page.locator("#lp-tab-preview").getAttribute("aria-selected"),
            "true",
          );
          assert.equal(
            await page.locator(".lp-admin-inspector-wrap").isVisible(),
            false,
          );
          await page.locator("#lp-tab-edit").click();
        }
      }
    });
    await test("layout-controls", async () => {
      await create();
      await page
        .locator('[data-section-id="s-theme"]')
        .evaluate((el) => (el.open = true));
      for (const [hero, plans] of [
        ["centered", "carousel"],
        ["minimal", "list"],
        ["split", "grid"],
      ]) {
        await page
          .locator('[data-path="landing.hero_layout"]')
          .selectOption(hero);
        await page
          .locator('[data-path="landing.plans_layout"]')
          .selectOption(plans);
        await page.locator("#lp-admin-preview-refresh").click();
        await page.waitForFunction(
          () =>
            document.querySelector("#lp-admin-preview-frame").contentDocument
              ?.body?.dataset.heroLayout ===
            document.querySelector('[data-path="landing.hero_layout"]').value,
        );
        const styles = await page
          .frameLocator("#lp-admin-preview-frame")
          .locator("body")
          .evaluate((body) => {
            const heroStyle = getComputedStyle(
              body.querySelector(".lp-hero-grid"),
            );
            const planStyle = getComputedStyle(
              body.querySelector(".lp-plan-grid"),
            );
            return {
              hero: body.dataset.heroLayout,
              plans: body.dataset.plansLayout,
              heroColumns: heroStyle.gridTemplateColumns.split(" ").length,
              plansDisplay: planStyle.display,
              plansColumns: planStyle.gridTemplateColumns.split(" ").length,
              featuresHidden:
                getComputedStyle(body.querySelector(".lp-hero-features"))
                  .display === "none",
            };
          });
        assert.equal(styles.hero, hero);
        assert.equal(styles.plans, plans);
        if (hero !== "split") assert.equal(styles.heroColumns, 1);
        if (hero === "minimal") assert.equal(styles.featuresHidden, true);
        if (plans === "carousel") assert.equal(styles.plansDisplay, "flex");
        if (plans === "list") assert.equal(styles.plansColumns, 1);
      }
    });
    await test("edit-during-save", async () => {
      await open("QA Studio A");
      let release, arrived;
      const pause = new Promise((r) => (release = r)),
        ready = new Promise((r) => (arrived = r));
      await page.route(`**/api/v1/admin/pages/${a.id}?*`, async (route) => {
        if (route.request().method() !== "PUT") return route.continue();
        const response = await route.fetch();
        arrived();
        await pause;
        await route.fulfill({ response });
      });
      await page.locator('[data-path="title"]').fill("QA Studio A saved");
      await page.locator("#lp-admin-save").click();
      await ready;
      await page.locator('[data-path="title"]').fill("QA Studio A unsaved");
      release();
      await page.waitForFunction(
        () => !document.getElementById("lp-admin-save").disabled,
      );
      assert.equal(
        await page.locator("#lp-admin-dirty-badge").isVisible(),
        true,
      );
      assert.equal(
        (await api(`/admin/pages/${a.id}`)).payload.title,
        "QA Studio A saved",
      );
    });
    await test("switch-during-save", async () => {
      await open("QA Studio B");
      let release, arrived;
      const pause = new Promise((r) => (release = r)),
        ready = new Promise((r) => (arrived = r));
      await page.route(`**/api/v1/admin/pages/${b.id}?*`, async (route) => {
        if (route.request().method() !== "PUT") return route.continue();
        const response = await route.fetch();
        arrived();
        await pause;
        await route.fulfill({ response });
      });
      await page.locator('[data-path="title"]').fill("QA Studio B saved");
      await page.locator("#lp-admin-save").click();
      await ready;
      await page.locator("#lp-admin-new").click();
      await page.locator('[data-path="title"]').fill("QA Studio fresh");
      await page.locator('[data-path="slug"]').fill("qa-studio-fresh");
      release();
      // Wait for the old response to reach the UI, then save the independent new draft.
      await page.waitForTimeout(300);
      await page.locator("#lp-admin-save").click();
      await page.waitForFunction(() =>
        document
          .getElementById("lp-admin-save-state")
          .textContent.includes("Đã lưu"),
      );
      assert.equal(
        (await api(`/admin/pages/${b.id}`)).payload.slug,
        "qa-studio-b",
      );
      const pages = (await api("/admin/pages?limit=100")).items;
      assert.ok(pages.some((p) => p.payload.slug === "qa-studio-fresh"));
    });
    await test("upload-guard", async () => {
      await create();
      await page.evaluate(
        () => (window.adminUploadImage = () => new Promise(() => {})),
      );
      const upload = page.locator('input[type="file"]').first();
      await upload.setInputFiles({
        name: "qa.png",
        mimeType: "image/png",
        buffer: Buffer.from("fixture"),
      });
      const marker = await upload.evaluate((el) => {
        el.dataset.qaPending = "yes";
        return el.dataset.qaPending;
      });
      await page.locator("#lp-admin-preset-select").selectOption("camera");
      await page.locator("#lp-admin-preset-apply").click();
      assert.equal(
        await page.locator('input[data-qa-pending="yes"]').count(),
        1,
        marker,
      );
      assert.equal(await page.locator("#lp-admin-save").isDisabled(), true);
      assert.ok(
        (await page.locator("#lp-admin-error").textContent()).includes(
          "Đợi ảnh",
        ),
      );
    });
    await test("dark-controls", async () => {
      const live = await api("/admin/pages", "POST", {
        ...data("qa-studio-dark", "QA Dark"),
        landing: { ...data("qa", "QA").landing, theme_preset: "modern_dark" },
      });
      await api(`/admin/pages/${live.id}/publish`, "POST", {
        expected_version: live.version,
      });
      await page.goto(origin + "/qa-studio-dark");
      for (const selector of [
        ".lp-consult-form input",
        ".lp-inline-form input",
        ".lp-comparison tbody td",
      ]) {
        const contrast = await page
          .locator(selector)
          .first()
          .evaluate((element) => {
            const rgb = (color) =>
              color
                .match(/[\d.]+/g)
                .slice(0, 3)
                .map(Number);
            const luminance = (values) =>
              values
                .map((v) => {
                  v /= 255;
                  return v <= 0.04045
                    ? v / 12.92
                    : ((v + 0.055) / 1.055) ** 2.4;
                })
                .reduce(
                  (sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i],
                  0,
                );
            let parent = element,
              background;
            while (parent) {
              background = getComputedStyle(parent).backgroundColor;
              if (background !== "rgba(0, 0, 0, 0)") break;
              parent = parent.parentElement;
            }
            const a = luminance(rgb(getComputedStyle(element).color)),
              b = luminance(rgb(background));
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          });
        assert.ok(contrast >= 4.5, `${selector}: contrast ${contrast}`);
      }
    });
    fs.mkdirSync(".local/qa/pre-push-2026-10-12", { recursive: true });
    console.log(`Landing studio: ${passed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
