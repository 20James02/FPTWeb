const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ""))
  throw Error("Loopback required");
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
  const page = await ctx.newPage(),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const login = await ctx.request.post(origin + "/api/v1/auth/session", {
      data: {
        email: "qa-admin@example.test",
        password: "qa-only-password",
        otp: "123456",
      },
    });
    assert.equal(login.status(), 200);
    await page.goto(origin + "/admin/vouchers");
    assert.equal(await page.locator("#voucher-editor").count(), 1);
    await page.locator("#voucher-new").click();
    await page.locator("#v-code").fill("QA-BROWSER");
    await page.locator("#v-code").focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator("#v-name")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator("#v-name").fill("Ưu đãi trình duyệt");
    await page.locator("#v-terms").fill("Chỉ áp dụng sau xác nhận địa chỉ");
    await page
      .locator("#v-start")
      .fill(
        new Date(Date.now() - 86400000).toLocaleDateString("en-GB") + " 00:00",
      );
    await page
      .locator("#v-end")
      .fill(
        new Date(Date.now() + 10 * 86400000).toLocaleDateString("en-GB") +
          " 23:59",
      );
    await page.locator("#v-quota").fill("10");
    await page.locator("#v-budget").fill("1000000");
    await page.locator("[data-v-rule-amount]").first().fill("100000");
    await page.locator("#voucher-save").click();
    await page.waitForFunction(() =>
      document.querySelector("#voucher-status").textContent.includes("Đã lưu"),
    );
    await page.locator("#voucher-publish").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#voucher-status")
        .textContent.includes("Đã công bố"),
    );
    assert.ok(
      (await page.locator("#voucher-table").innerText()).includes("QA-BROWSER"),
    );
    await page.locator("#v-link-slug").fill("qa-browser");
    await page.locator("#voucher-link-save").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#voucher-links")
        .textContent.includes("/s/qa-browser"),
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        "Admin overflow " + width,
      );
    }
    await page.locator("#v-name").fill("Bản nháp chưa công bố");
    assert.equal(await page.locator("#voucher-publish").isDisabled(), true);
    await page
      .locator("#voucher-table button")
      .filter({ hasText: "Thiết lập" })
      .click();
    fs.mkdirSync(".local/qa/vouchers", { recursive: true });
    await page.screenshot({
      path: ".local/qa/vouchers/admin.png",
      fullPage: true,
    });
    await page.goto(origin + "/s/qa-browser");
    await page.waitForFunction(() =>
      document
        .querySelector("#client-voucher-name")
        ?.textContent.includes("Ưu đãi trình duyệt"),
    );
    assert.equal(await page.locator("#client-voucher-banner").count(), 1);
    await page.locator("#client-voucher-conditions summary").focus();
    await page.keyboard.press("Enter");
    assert.ok(
      (await page.locator("#client-voucher-banner").innerText()).includes(
        "Chỉ áp dụng",
      ),
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        "Client overflow " + width,
      );
    }
    const csrf = (await ctx.cookies()).find(
      (c) => c.name === "pagefpt_csrf",
    ).value;
    async function api(path, method = "GET", body) {
      const response = await ctx.request.fetch(origin + path, {
        method,
        headers: { "X-CSRF-Token": csrf },
        ...(body ? { data: body } : {}),
      });
      const result = await response.json();
      assert.ok(response.ok(), path + ": " + JSON.stringify(result));
      return result;
    }
    const plan = (await api("/api/v1/catalog")).items[0];
    const province = (await api("/api/v1/admin/vouchers/options")).provinces[0];
    const synced = await api("/api/v1/admin/locations/sync", "POST", {
      branch_id: (await api("/api/v1/admin/me")).memberships[0].branch_id,
      province_codes: [province.code],
      source: "bundled",
    });
    assert.ok(
      synced.created > 0 ||
        synced.created_count > 0 ||
        synced.result ||
        synced.source,
    );
    const price = await api("/api/v1/admin/prices", "POST", {
      plan_id: plan.id,
      scope_id: province.id,
      scope_kind: "region",
      billing_months: 6,
      monthly_vnd: 200000,
      start: new Date(Date.now() - 86400000).toISOString(),
      source: "QA fixture",
    });
    await api("/api/v1/admin/prices/" + price.id + "/publish", "POST", {
      expected_version: price.version,
    });
    await page.evaluate(
      (p) => openBottomSheet(p.name, "", p.id, p.service),
      plan,
    );
    await page.locator("#lead-name").fill("QA Voucher Browser");
    await page.locator("#lead-phone").fill("0987654321");
    await page.locator("#lead-address").fill("QA address, synthetic only");
    await page.locator("#lead-consent").check();
    const intakeResponse = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/v1/leads" && r.request().method() === "POST",
    );
    await page.locator("#btn-submit-lead").click();
    assert.equal((await intakeResponse).status(), 201);
    const lead = (await api("/api/v1/admin/leads")).items.find(
      (l) => l.payload.phone_masked === "***4321",
    );
    assert.ok(lead);
    assert.equal(lead.payload.voucher_request.code, "QA-BROWSER");
    let updated = await api(
      "/api/v1/admin/leads/" + lead.id + "/profile",
      "PUT",
      {
        expected_version: lead.version,
        name: "QA Voucher Browser",
        installation_address: "QA address, synthetic only",
        province_code: province.code,
        ward_code: province.wards[0].code,
        plan_id: plan.id,
      },
    );
    updated = await api(
      "/api/v1/admin/leads/" + lead.id + "/assignments",
      "POST",
      { expected_version: updated.version },
    );
    for (const status of ["contacting", "contacted", "qualified", "quoted"])
      updated = await api(
        "/api/v1/admin/leads/" + lead.id + "/transitions",
        "POST",
        { expected_version: updated.version, status },
      );
    await page.goto(origin + "/admin/leads/detail?id=" + lead.id);
    await page.locator("#lead-voucher-code").waitFor();
    assert.equal(
      await page.locator("#lead-voucher-code").inputValue(),
      "QA-BROWSER",
    );
    await page
      .locator("#lead-voucher-panel button")
      .filter({ hasText: "Xác nhận & giữ" })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#lead-voucher-panel")
        .textContent.includes("Đang giữ suất"),
    );
    assert.ok(
      (await page.locator("#lead-voucher-panel").innerText()).includes(
        "100.000",
      ),
    );
    assert.ok(
      (await page.locator("#detail-quote-total-val").innerText()).includes(
        "1.100.000",
      ),
    );
    await page.locator("#lead-voucher-reason").fill("QA cancelled by customer");
    await page
      .locator("#lead-voucher-panel button")
      .filter({ hasText: "Hủy & trả suất" })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#lead-voucher-panel")
        .textContent.includes("Đã hủy suất"),
    );
    assert.equal(
      (await api("/api/v1/admin/leads/" + lead.id)).quote_status,
      "needs_confirmation",
    );
    await page
      .locator("#lead-voucher-panel button")
      .filter({ hasText: "Xác nhận & giữ" })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#lead-voucher-panel")
        .textContent.includes("Đang giữ suất"),
    );
    for (const status of ["closed", "installed"]) {
      updated = await api("/api/v1/admin/leads/" + lead.id);
      await api("/api/v1/admin/leads/" + lead.id + "/transitions", "POST", {
        expected_version: updated.version,
        status,
        ...(status === "installed"
          ? { installation: { reference: "QA-BROWSER-INSTALLATION" } }
          : {}),
      });
    }
    await page.reload();
    await page.locator("#lead-voucher-reason").fill("QA installed and checked");
    await page
      .locator("#lead-voucher-panel button")
      .filter({ hasText: "Ghi nhận đã dùng" })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#lead-voucher-panel")
        .textContent.includes("Đã dùng ưu đãi"),
    );
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: ".local/qa/vouchers/lead.png",
      fullPage: true,
    });
    await page.goto(origin + "/admin/vouchers");
    await page.locator("#voucher-table input[type=checkbox]").nth(1).focus();
    await page.keyboard.press("Space");
    assert.equal(
      await page
        .locator("#voucher-table input[type=checkbox]")
        .nth(1)
        .isChecked(),
      true,
    );
    await page.locator("#voucher-bulk-pause").click();
    await page.waitForFunction(() =>
      document.querySelector("#voucher-table").textContent.includes("Tạm dừng"),
    );
    await page.goto(origin + "/");
    await page.waitForFunction(
      () => document.querySelector("#client-voucher-banner") !== null,
    );
    const cleared = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/v1/vouchers/context" &&
        r.request().method() === "DELETE",
    );
    await page.locator("#client-voucher-clear").focus();
    await page.keyboard.press("Enter");
    assert.equal((await cleared).status(), 204);
    await page.waitForFunction(
      () => document.querySelector("#client-voucher-clear").hidden,
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#client-voucher-name").textContent ===
        "Mã ưu đãi",
    );
    assert.equal(
      (await ctx.cookies()).some((c) => c.name === "pagefpt_voucher"),
      false,
    );
    await page.screenshot({
      path: ".local/qa/vouchers/client.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "Voucher browser passed: editor/save/publish/draft guard/link, real lead form, address, hold/release/re-hold/redeem, bulk pause, cookie/clear and 9 layouts",
    );
  } catch (e) {
    console.error(
      "UI status:",
      await page
        .locator("#voucher-status")
        .textContent()
        .catch(() => ""),
    );
    console.error(
      "Form:",
      await page
        .locator("#voucher-form")
        .evaluate((f) =>
          [...f.elements]
            .filter((x) => x.id)
            .map((x) => ({
              id: x.id,
              value: x.value,
              valid: x.checkValidity?.(),
              validation: x.validationMessage,
            })),
        )
        .catch(() => []),
    );
    console.error("Errors:", errors);
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
