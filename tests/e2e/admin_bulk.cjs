const { chromium, request } = require("playwright"),
  assert = require("node:assert/strict");
const origin = "http://127.0.0.1:8098";
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  try {
    const ctx = await b.newContext(),
      p = await ctx.newPage(),
      errors = [];
    p.setDefaultTimeout(10000);
    p.on("pageerror", (e) => errors.push(e.message));
    await ctx.request.post(origin + "/api/v1/auth/session", {
      data: {
        email: "qa-admin@example.test",
        password: "qa-only-password",
        otp: "123456",
      },
    });
    const api = await request.newContext({
      storageState: await ctx.storageState(),
      extraHTTPHeaders: {
        "X-CSRF-Token": (await ctx.cookies()).find(
          (c) => c.name === "pagefpt_csrf",
        ).value,
      },
    });
    const suffix = Date.now().toString(36),
      rows = [];
    for (let i = 0; i < 2; i++) {
      const body = {
        name: "Bulk " + suffix + " " + i,
        code: "bulk-" + suffix + "-" + i,
        service: "internet",
        price_vnd: 10000,
      };
      const row = await (
        await api.post(origin + "/api/v1/admin/products", { data: body })
      ).json();
      assert.ok(row.id);
      rows.push(row);
    }
    await p.goto(origin + "/admin/accessories");
    await p.locator("#accessory-search").fill(suffix);
    await p.locator("[data-bulk-select]").first().waitFor();
    await p
      .getByRole("button", { name: "Chọn tất cả đang hiển thị", exact: true })
      .click();
    assert.equal(await p.locator("[data-bulk-select]:checked").count(), 2);
    const first = rows[0];
    assert.equal(
      (
        await api.put(
          origin +
            "/api/v1/admin/products/" +
            first.id +
            "?expected_version=" +
            first.version,
          { data: { ...first.payload, description: "Concurrent QA edit" } },
        )
      ).status(),
      200,
    );
    await p
      .getByRole("button", { name: "Công bố đã chọn", exact: true })
      .click();
    await p
      .getByRole("dialog", { name: "Xác nhận thao tác" })
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await p.waitForFunction(() =>
      document
        .querySelector("[data-bulk-toolbar] [role=status]")
        ?.textContent.includes("Thành công 1/2"),
    );
    assert.equal(await p.locator("[data-bulk-select]:checked").count(), 1);
    const list = await (
      await api.get(origin + "/api/v1/admin/products?limit=100")
    ).json();
    assert.equal(
      list.items.find((x) => x.id === rows[1].id).status,
      "published",
    );
    assert.equal(list.items.find((x) => x.id === rows[0].id).status, "draft");
    await p.getByRole("button", { name: "Bỏ chọn", exact: true }).click();
    assert.equal(await p.locator("[data-bulk-select]:checked").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "Bulk selects filtered visible records, CAS partial failure retained, successful rows published, clear works",
    );
    await api.dispose();
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
