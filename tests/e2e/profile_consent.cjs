const { chromium, webkit, request } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = "http://127.0.0.1:8098";
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium;
  const b = await type.launch(
    type === chromium
      ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
      : {},
  );
  try {
    const c = await b.newContext({ viewport: { width: 390, height: 844 } }),
      p = await c.newPage(),
      errors = [];
    p.setDefaultTimeout(5000);
    p.setDefaultNavigationTimeout(10000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) =>
      r
        .request()
        .url()
        .startsWith(origin + "/")
        ? r.continue()
        : r.abort(),
    );
    await c.request.post(origin + "/api/v1/auth/session", {
      data: {
        email: "qa-admin@example.test",
        password: "qa-only-password",
        otp: "123456",
      },
    });
    const api = await request.newContext({
      storageState: await c.storageState(),
      extraHTTPHeaders: {
        "X-CSRF-Token": (await c.cookies()).find(
          (c) => c.name === "pagefpt_csrf",
        ).value,
      },
    });
    const exp = await (
      await api.post(origin + "/api/v1/admin/experiments", {
        data: {
          name: "QA Consent CTA",
          salt: "q".repeat(32),
          variants: [
            { name: "a", weight: 5000, cta_label: "QA nhận tư vấn" },
            { name: "b", weight: 5000, cta_label: "QA chọn gói" },
          ],
        },
      })
    ).json();
    assert.ok(exp.id);
    await api.post(
      origin + "/api/v1/admin/experiments/" + exp.id + "/publish",
      { data: { expected_version: exp.version } },
    );
    const settings = await (
      await api.get(origin + "/api/v1/system/display-settings")
    ).json();
    await api.post(origin + "/api/v1/system/display-settings", {
      data: { expected_version: settings.version, hero_experiment_id: exp.id },
    });
    let variantCalls = 0;
    p.on("request", (r) => {
      if (r.url().includes("/variant")) variantCalls++;
    });
    await p.goto(origin + "/");
    const original = await p
      .locator("[data-experiment-cta]")
      .first()
      .textContent();
    assert.equal(variantCalls, 0);
    await p
      .getByRole("button", { name: "Lựa chọn dữ liệu", exact: true })
      .click();
    await p.locator("#consent-analytics").check();
    await p.getByRole("button", { name: "Lưu lựa chọn", exact: true }).click();
    await p.waitForFunction(() =>
      document
        .querySelector("[data-experiment-cta]")
        .textContent.startsWith("QA"),
    );
    await p.evaluate(() => flushEvents());
    assert.ok(variantCalls > 0);
    const report = await (
      await api.get(origin + "/api/v1/admin/experiments/" + exp.id + "/results")
    ).json();
    assert.equal(
      report.variants.reduce((n, v) => n + v.exposures, 0),
      1,
    );
    await p
      .getByRole("button", { name: "Lựa chọn dữ liệu", exact: true })
      .click();
    await p.locator("#consent-analytics").uncheck();
    await p.getByRole("button", { name: "Lưu lựa chọn", exact: true }).click();
    await p.waitForFunction(
      (text) =>
        document.querySelector("[data-experiment-cta]").textContent === text,
      original,
    );
    const phone = "098" + String(Date.now()).slice(-7);
    const leadRes = await api.post(origin + "/api/v1/leads", {
      headers: { "Idempotency-Key": "qa-profile-" + Date.now() },
      data: {
        phone,
        name: "QA initial",
        installation_address: "QA original address",
        consent_version: "qa",
      },
    });
    assert.equal(leadRes.status(), 201);
    const listing = await (
      await api.get(origin + "/api/v1/admin/leads?limit=100")
    ).json();
    const lead = listing.items.find(
      (x) =>
        x.phone_masked?.endsWith(phone.slice(-4)) ||
        x.payload.phone_masked?.endsWith(phone.slice(-4)),
    );
    assert.ok(lead);
    const plan = (await (await api.get(origin + "/api/v1/catalog")).json())
      .items[0];
    assert.ok(plan?.id && plan?.code);
    const device = await (
      await api.post(origin + "/api/v1/admin/products", {
        data: {
          name: "QA Profile Device",
          code: "qa-profile-device-" + Date.now(),
          service: plan.service,
          plan_ids: [plan.id],
          price_vnd: 30000,
          billing_mode: "monthly",
        },
      })
    ).json();
    assert.ok(device.id);
    assert.equal(
      (
        await api.post(
          origin + "/api/v1/admin/products/" + device.id + "/publish",
          { data: { expected_version: device.version } },
        )
      ).status(),
      200,
    );
    await p.goto(origin + "/admin/leads/detail?id=" + lead.id);
    await p.locator("#btn-edit-profile").waitFor({ state: "visible" });
    await p.locator("#btn-edit-profile").click();
    await p.locator("#profile-name").fill("QA edited via UI");
    await p.locator("#profile-plan").selectOption({ label: plan.name });
    assert.equal(await p.locator("#profile-plan").inputValue(), plan.id);
    await p.locator('dialog input[value="' + device.id + '"]').check();
    await p
      .locator("#profile-phone")
      .isEditable()
      .then((v) => assert.equal(v, false));
    const province = (
      await p
        .locator("#profile-province option")
        .evaluateAll((a) => a.map((o) => o.value).filter(Boolean))
    )[0];
    await p.locator("#profile-province").selectOption(province);
    await p.locator("#profile-ward:not(:disabled)").waitFor();
    const ward = (
      await p
        .locator("#profile-ward option")
        .evaluateAll((a) => a.map((o) => o.value).filter(Boolean))
    )[0];
    await p.locator("#profile-ward").selectOption(ward);
    await p.locator("#profile-address").fill("QA confirmed specific address");
    // Simulate a rejected request: readable validation and draft preservation.
    const profileUrl = origin + "/api/v1/admin/leads/" + lead.id + "/profile";
    const reject = (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 422,
            contentType: "application/json",
            body: JSON.stringify({
              code: "VALIDATION_ERROR",
              message: "Request cannot be completed",
              fields: { "body.plan_id": "uuid_parsing" },
            }),
          })
        : route.continue();
    await p.route(profileUrl, reject);
    await p
      .getByRole("button", { name: "Lưu & xác nhận địa chỉ", exact: true })
      .click();
    await p
      .locator("dialog .billing-error")
      .filter({
        hasText: "Gói cước không hợp lệ. Hãy chọn lại gói trong danh sách.",
      })
      .waitFor();
    assert.equal(
      await p.locator("#profile-name").inputValue(),
      "QA edited via UI",
    );
    assert.equal(
      await p.locator("#profile-address").inputValue(),
      "QA confirmed specific address",
    );
    assert.ok(
      await p.locator('dialog input[value="' + device.id + '"]').isChecked(),
    );
    await p.unroute(profileUrl, reject);
    const saving = p.waitForResponse(
      (r) =>
        r.url().endsWith("/leads/" + lead.id + "/profile") &&
        r.request().method() === "PUT",
    );
    await p
      .getByRole("button", { name: "Lưu & xác nhận địa chỉ", exact: true })
      .click();
    const saved = await saving;
    const savedBody = await saved.json();
    assert.equal(
      saved.status(),
      200,
      JSON.stringify({ code: savedBody.code, fields: savedBody.fields }),
    );
    await p.locator("dialog:has(#profile-name)").waitFor({ state: "hidden" });
    const after = await (
      await api.get(origin + "/api/v1/admin/leads/" + lead.id + "/profile")
    ).json();
    assert.equal(after.pii.phone, "+84" + phone.slice(1));
    assert.equal(after.pii.name, "QA edited via UI");
    assert.equal(after.lead.payload.plan_id, plan.id);
    assert.deepEqual(after.lead.payload.accessory_ids, [device.id]);
    assert.equal(after.lead.payload.accessory_snapshot[0].price_vnd, 30000);
    await p.locator("#btn-edit-profile").click();
    await p.locator("#profile-plan").waitFor();
    assert.equal(await p.locator("#profile-plan").inputValue(), plan.id);
    assert.ok(
      await p.locator('dialog input[value="' + device.id + '"]').isChecked(),
    );
    await p
      .locator("dialog:has(#profile-name)")
      .getByRole("button", { name: "Hủy", exact: true })
      .click();
    assert.equal(
      after.lead.payload.address_confirmation.ward_code,
      Number(ward),
    );
    assert.deepEqual(errors, []);
    fs.mkdirSync(".local/qa/profile", { recursive: true });
    await p.screenshot({
      path: ".local/qa/profile/mobile.png",
      fullPage: true,
    });
    console.log(
      "Explicit analytics consent, A/B exposure/report, withdrawal, profile address/immutable phone passed",
    );
    await api.dispose();
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
