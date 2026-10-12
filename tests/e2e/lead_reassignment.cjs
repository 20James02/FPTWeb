const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomUUID } = require("node:crypto");
const origin = "http://127.0.0.1:8098";
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) =>
    r
      .request()
      .url()
      .startsWith(origin + "/")
      ? r.continue()
      : r.abort(),
  );
  async function api(path, method = "GET", body) {
    return page.evaluate(
      async ({ path, method, body }) => {
        const r = await adminFetch("/api/v1/admin" + path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: r.status, data: await r.json() };
      },
      { path, method, body },
    );
  }
  try {
    const login = await page.request.post(origin + "/api/v1/auth/session", {
      data: {
        email: "qa-admin@example.test",
        password: "qa-only-password",
        otp: "123456",
      },
    });
    assert.equal(login.status(), 200);
    await page.goto(origin + "/admin/leads");
    const list = (await api("/leads?status=new")).data.items,
      id = list[0].id,
      staff = randomUUID();
    const me = (await api("/me")).data.id;
    assert.equal(
      (
        await api("/memberships", "PUT", {
          user_id: staff,
          branch_id: "00000000-0000-0000-0000-000000000000",
          display_name: "Nhân viên bàn giao QA",
          permissions: ["lead.read", "lead.write"],
          capacity: 1,
          active: true,
          shift: {
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            start: "00:00",
            end: "23:59",
          },
        })
      ).status,
      200,
    );
    let lead = (
      await api("/leads/" + id + "/assignments", "POST", {
        expected_version: list[0].version,
      })
    ).data;
    for (const status of ["contacting", "contacted"]) {
      const r = await api("/leads/" + id + "/transitions", "POST", {
        expected_version: lead.version,
        status,
      });
      assert.equal(r.status, 200);
      lead = r.data;
    }
    fs.mkdirSync(".local/qa/lead-reassignment", { recursive: true });
    for (const width of [1440, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + "/admin/leads/detail?id=" + id);
      await page.waitForFunction(
        () =>
          window.currentLead?.status === "contacted" ||
          (typeof currentLead !== "undefined" &&
            currentLead?.status === "contacted"),
      );
      assert.equal(await page.locator("#btn-manual-assign").isEnabled(), true);
      assert.equal(await page.locator("#btn-assign").isEnabled(), false);
      await page.locator("#btn-manual-assign").click();
      const dialog = page.locator("dialog[open]");
      await dialog.waitFor();
      await dialog.locator("select").selectOption(staff);
      await page.screenshot({
        path: ".local/qa/lead-reassignment/assignment-" + width + ".png",
        fullPage: true,
      });
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/v1/admin/lead-assignments") &&
          r.request().method() === "POST",
      );
      await dialog
        .getByRole("button", { name: "Phân công", exact: true })
        .click();
      assert.equal((await response).status(), 200);
      await dialog.waitFor({ state: "hidden" });
      const result = (await api("/leads/" + id)).data;
      assert.equal(result.status, "contacted");
      assert.equal(result.assignee_id, staff);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
      );
    }
    const members = (await api("/memberships")).data.items;
    assert.equal(members.find((m) => m.user_id === staff).active_leads, 1);
    assert.equal(members.find((m) => m.user_id === me).active_leads, 0);
    const terminal = list[1];
    const ended = await api("/leads/" + terminal.id + "/transitions", "POST", {
      expected_version: terminal.version,
      status: "rejected",
      reason: "Hồ sơ kiểm thử đã kết thúc",
    });
    assert.equal(ended.status, 200);
    await page.goto(origin + "/admin/leads/detail?id=" + terminal.id);
    await page.waitForFunction(
      () =>
        typeof currentLead !== "undefined" &&
        currentLead?.status === "rejected",
    );
    assert.equal(await page.locator("#btn-manual-assign").isEnabled(), false);
    assert.equal(await page.locator("#btn-assign").isEnabled(), false);
    const invalid = await api(
      "/leads/" + terminal.id + "/assignments",
      "POST",
      { expected_version: ended.data.version, assignee_id: staff },
    );
    assert.equal(invalid.status, 409);
    assert.equal(invalid.data.code, "ASSIGNMENT_NOT_ALLOWED");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      ".local/qa/lead-reassignment/result.json",
      JSON.stringify(
        {
          passed: true,
          widths: [1440, 360],
          preserves_status: true,
          capacity_balanced: true,
          terminal_blocked: true,
          errors,
          production_mutations: false,
        },
        null,
        2,
      ),
    );
    console.log(
      "Passed actual reassignment: contacted stays contacted, capacity balanced, mobile/desktop, terminal guards, no pageerrors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
