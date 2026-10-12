const { chromium, webkit } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8098";
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium,
    b = await type.launch(
      type === chromium
        ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
        : {},
    ),
    ctx = await b.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    p = await ctx.newPage(),
    errors = [];
  fs.mkdirSync(".local/qa/landing", { recursive: true });
  p.on("pageerror", (e) => {
    errors.push(e.message);
    console.error(
      "BROWSER_ERROR",
      JSON.stringify({ message: e.message, stack: e.stack, url: p.url() }),
    );
  });
  await p.route("**/*", (r) =>
    r
      .request()
      .url()
      .startsWith(origin + "/")
      ? r.continue()
      : r.request().url().startsWith("https://media.example.test/")
        ? r.fulfill({
            status: 200,
            headers: {
              "access-control-allow-origin": origin,
              "access-control-allow-methods": "PUT",
              "access-control-allow-headers": "content-type",
            },
            ...(r.request().method() === "GET"
              ? {
                  contentType: "image/svg+xml",
                  body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0369ff"/></svg>',
                }
              : {}),
          })
        : r.abort(),
  );
  const api = (path, method = "GET", data) =>
    p.evaluate(
      async ({ path, method, data }) => {
        const r = await adminFetch("/api/v1" + path, {
            method,
            headers: { "Content-Type": "application/json" },
            ...(data ? { body: JSON.stringify(data) } : {}),
          }),
          d = await r.json();
        if (!r.ok) throw Error(JSON.stringify({ path, status: r.status, d }));
        return d;
      },
      { path, method, data },
    );
  try {
    assert.equal(
      (
        await ctx.request.post(origin + "/api/v1/auth/session", {
          data: {
            email: "qa-admin@example.test",
            password: "qa-only-password",
            otp: "123456",
          },
        })
      ).status(),
      200,
    );
    await p.goto(origin + "/admin/landing-pages");
    await p.locator("#lp-admin-new").click();
    await p.locator('[data-path="slug"]').fill("qa-landing-" + Date.now());
    await p
      .locator('[data-path="landing.hero_title"]')
      .fill("Đăng Ký Lắp Đặt Internet");
    const config = await p
        .locator("#landing-defaults")
        .evaluate((el) => JSON.parse(el.textContent)),
      suffix = Date.now().toString(36),
      plans = [];
    const region = (await api("/regions")).items[0];
    assert.ok(region);
    for (let i = 0; i < 9; i++) {
      const plan = await api("/admin/plans", "POST", {
        name:
          [
            "GÓI CƠ BẢN",
            "GÓI PHỔ BIẾN",
            "GÓI GIA ĐÌNH",
            "GÓI COMBO TRUYỀN HÌNH",
            "GÓI INTERNET + CAMERA",
            "GÓI DOANH NGHIỆP",
          ][i % 6] + (i > 5 ? " " + i : ""),
        code: "lp-" + suffix + "-" + i,
        service:
          i === 3
            ? "combo"
            : i === 4
              ? "camera"
              : i === 5
                ? "business"
                : "internet",
        speed_mbps: [150, 300, 500][i % 3],
        equipment: [
          "Internet cáp quang tốc độ cao",
          "Tư vấn modem Wi-Fi theo địa bàn",
          "Hỗ trợ lắp đặt theo lịch",
          "Kỹ thuật xác nhận cấu hình",
        ],
        description: "Mô tả toàn bộ gói QA",
      });
      await api("/admin/plans/" + plan.id + "/publish", "POST", {
        expected_version: plan.version,
      });
      plans.push(plan);
      const price = await api("/admin/prices", "POST", {
        plan_id: plan.id,
        scope_kind: "default",
        scope_id: "00000000-0000-0000-0000-000000000000",
        billing_months: 6,
        monthly_vnd: 180000 + i * 10000,
        start: "2026-01-01T00:00:00Z",
        source: "QA fixture",
        vat_included: true,
      });
      await api("/admin/prices/" + price.id + "/publish", "POST", {
        expected_version: price.version,
      });
    }
    for (const [months, factor] of [
      [1, "1"],
      [12, "0.95"],
    ]) {
      const price = await api("/admin/prices", "POST", {
        plan_id: plans[0].id,
        scope_kind: "default",
        scope_id: "00000000-0000-0000-0000-000000000000",
        billing_months: months,
        monthly_vnd: 180000,
        monthly_coefficient: factor,
        start: "2026-01-01T00:00:00Z",
        source: "QA fixture",
        vat_included: true,
      });
      await api("/admin/prices/" + price.id + "/publish", "POST", {
        expected_version: price.version,
      });
    }
    const accessory = await api("/admin/products", "POST", {
      name: "QA Wi-Fi",
      code: "lp-device-" + suffix,
      service: "internet",
      plan_ids: [plans[0].id],
      price_vnd: 30000,
      original_price_vnd: 50000,
      offer_label: "QA ưu đãi",
      billing_mode: "monthly",
    });
    await api("/admin/products/" + accessory.id + "/publish", "POST", {
      expected_version: accessory.version,
    });
    const landing = {
      ...config,
      billing_months: 12,
      hero_title: "Đăng Ký Lắp Đặt Internet",
      hero_highlight: "Tốc Độ Cao FPT",
      plan_ids: plans.slice(0, 6).map((p) => p.id),
      plan_presentations: plans.map((p, i) => ({
        plan_id: p.id,
        subtitle: "Kết nối phù hợp với nhu cầu",
        badge: i === 1 ? "LỰA CHỌN NỔI BẬT" : i === 3 ? "COMBO TIỆN LỢI" : "",
        accent: [1, 3].includes(i) ? "orange" : "blue",
        features: p.payload.equipment,
      })),
      promo_items: [
        { title: "Tư vấn lắp đặt", text: "Theo địa bàn", icon: "install" },
        { title: "Modem Wi-Fi", text: "Theo gói đã chọn", icon: "wifi" },
        { title: "Camera", text: "Tùy chọn thiết bị", icon: "camera" },
      ],
      stats: [
        { value: "QA", label: "Dữ liệu minh họa", icon: "users" },
        { value: "34", label: "Địa bàn minh họa", icon: "building" },
        { value: "25+", label: "Nội dung QA", icon: "award" },
        { value: "24/7", label: "Thông tin QA", icon: "support" },
      ],
      reviews: [
        {
          name: "Nguyễn Minh Tuấn (QA)",
          quote: "Tốc độ kết nối ổn định, nhân viên hỗ trợ tận tình.",
          location: "Dữ liệu giả",
          rating: 5,
        },
        {
          name: "Trần Thu Hà (QA)",
          quote: "Cấu hình theo nhu cầu sử dụng của gia đình.",
          location: "Dữ liệu giả",
          rating: 5,
        },
        {
          name: "Lê Hoàng Nam (QA)",
          quote: "Nhân viên tư vấn thông tin gói cước rõ ràng.",
          location: "Dữ liệu giả",
          rating: 5,
        },
      ],
      faqs: [
        {
          question: "Thời gian lắp đặt Internet bao lâu?",
          answer: "Nhân viên xác nhận sau khi khảo sát.",
        },
        {
          question: "Có mất phí lắp đặt không?",
          answer: "Xem phí trong báo giá theo gói và khu vực.",
        },
        {
          question: "Tôi có thể nâng cấp gói cước không?",
          answer: "Liên hệ nhân viên để được tư vấn.",
        },
        {
          question: "Làm thế nào để được tư vấn chi tiết?",
          answer: "Để lại số điện thoại trên form.",
        },
      ],
    };
    const data = {
      title: "Landing QA " + suffix,
      slug: "landing-qa-" + suffix,
      description: "Landing QA",
      blocks: [],
      template: "telecom",
      landing,
    };
    let row = await api("/admin/pages", "POST", data);
    await p.goto(origin + "/admin/landing-pages?id=" + row.id);
    await p.locator('[data-path="landing.hero_title"]').waitFor();
    await p
      .locator('[data-path="landing.hero_title"]')
      .fill("Tiêu đề đang nhập");
    await p.waitForFunction(() =>
      document
        .querySelector("#lp-admin-preview-frame")
        .contentDocument?.body?.textContent?.includes("Tiêu đề đang nhập"),
    );
    assert.equal(
      (await api("/admin/pages/" + row.id)).payload.landing.hero_title,
      "Đăng Ký Lắp Đặt Internet",
    );
    const previewFrame = p.frameLocator("#lp-admin-preview-frame");
    await previewFrame.locator("[data-lp-consult]").first().click();
    await previewFrame
      .locator("#toast-container")
      .getByText("Bản xem trước: form gửi yêu cầu đang tắt.")
      .waitFor();
    assert.equal(
      await previewFrame
        .locator("#bottom-sheet-backdrop")
        .evaluate((el) => el.classList.contains("active")),
      false,
    );
    await p.screenshot({
      path: ".local/qa/landing/" + type.name() + "-admin.png",
      fullPage: true,
    });
    // Input typed while a save response is pending remains unsaved.
    let releaseSave, saveStarted;
    const saving = new Promise((resolve) => (saveStarted = resolve));
    await p.route(
      origin + "/api/v1/admin/pages/" + row.id + "?*",
      async (r) => {
        if (r.request().method() !== "PUT") return r.continue();
        const response = await r.fetch();
        saveStarted();
        return new Promise(
          (resolve) =>
            (releaseSave = () => r.fulfill({ response }).then(resolve)),
        );
      },
    );
    await p.locator("#lp-admin-save").click();
    await saving;
    await p
      .locator('[data-path="landing.hero_title"]')
      .fill("Chỉnh sửa mới trong khi lưu");
    await releaseSave();
    await p.waitForFunction(() =>
      document
        .querySelector("#lp-admin-save-state")
        .textContent.includes("Các thay đổi mới chưa lưu"),
    );
    assert.equal(
      (await api("/admin/pages/" + row.id)).payload.landing.hero_title,
      "Tiêu đề đang nhập",
    );
    await p.unroute(origin + "/api/v1/admin/pages/" + row.id + "?*");
    await p
      .locator('[data-path="landing.hero_title"]')
      .fill("Tiêu đề đang nhập");
    await p.locator("#lp-admin-save").click();
    await p.waitForFunction(() =>
      document
        .querySelector("#lp-admin-save-state")
        .textContent.startsWith("Đã lưu bản nháp"),
    );
    row = await api("/admin/pages/" + row.id);
    assert.equal(row.payload.landing.hero_title, "Tiêu đề đang nhập");
    await api("/admin/pages/" + row.id + "/publish", "POST", {
      expected_version: row.version,
    });
    p.on("dialog", (d) => d.accept());
    await p.goto(origin + "/" + data.slug);
    await p.waitForLoadState("networkidle");
    await p.waitForFunction(
      () => document.querySelector("#home-province-select").options.length > 0,
    );
    await p.locator("#home-province-select").selectOption(region.id);
    await p.waitForFunction(
      () =>
        document.querySelector("[data-quote-plan]").textContent === "171.000đ",
    );
    const firstCard = p.locator("[data-lp-plan]").first();
    assert.equal(
      await firstCard.locator("[data-billing-months]").inputValue(),
      "12",
    );
    await firstCard.locator("[data-accessory-id]").check();
    await p.waitForFunction(
      () =>
        document.querySelector("[data-quote-plan]").textContent === "201.000đ",
    );
    assert.match(
      await firstCard.locator("[data-accessory-total]").textContent(),
      /2.412.000/,
    );
    await firstCard.locator("[data-billing-months]").selectOption("1");
    await p.waitForFunction(
      () =>
        document.querySelector("[data-quote-plan]").textContent === "210.000đ",
    );
    assert.match(
      await firstCard.locator("[data-accessory-total]").textContent(),
      /210.000/,
    );
    await firstCard.locator("[data-billing-months]").selectOption("6");
    for (const width of [320, 390, 430, 768, 940, 1440]) {
      await p.setViewportSize({ width, height: 1000 });
      await p.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const size = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        heights: [...document.querySelectorAll(".lp-plan-card")].map((el) =>
          Math.round(el.getBoundingClientRect().height),
        ),
      }));
      assert.equal(size.overflow, false, "overflow " + width);
      assert.equal(new Set(size.heights).size, 1, "equal height " + width);
      if (width >= 768)
        assert.equal(await p.locator(".lp-nav").isVisible(), true);
      if ([390, 940, 1440].includes(width))
        await p.screenshot({
          path: ".local/qa/landing/" + type.name() + "-" + width + ".png",
          fullPage: true,
        });
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator(".lp-menu-toggle").click();
    assert.equal(await p.locator(".lp-nav").isVisible(), true);
    await p.keyboard.press("Escape");
    assert.equal(await p.locator(".lp-nav").isVisible(), false);
    await p
      .locator("[data-lp-plan]")
      .first()
      .locator("[data-plan-detail]")
      .click();
    assert.match(
      await p.locator("#plan-details-description").textContent(),
      /Mô tả toàn bộ/,
    );
    await p.keyboard.press("Escape");
    assert.equal(await p.locator("#pagefpt-google-config").count(), 1);
    assert.equal(
      await p.evaluate(
        () =>
          JSON.parse(
            document.getElementById("pagefpt-google-config").textContent,
          ).preview,
      ),
      false,
    );
    assert.equal(await p.evaluate(() => !!window.PageFPTGoogle), true);
    const form = p.locator("[data-lp-form]").first();
    await form.locator("[name=name]").fill("Khách hàng QA");
    await form
      .locator("[name=phone]")
      .fill("098" + Date.now().toString().slice(-7));
    await form.locator("[name=address]").fill("Địa chỉ giả QA");
    assert.equal(await form.locator("input,select,textarea").count(), 3);
    const contactPhone = await form.locator("[name=phone]").inputValue();
    await form.locator("button[type=submit]").click();
    assert.equal(await p.locator("#lead-name").inputValue(), "Khách hàng QA");
    assert.equal(
      await p.locator("#lead-address").inputValue(),
      "Địa chỉ giả QA",
    );
    assert.equal(await p.evaluate(() => selectedPlanId), null);
    await p.keyboard.press("Escape");
    await p
      .locator("[data-lp-plan]")
      .first()
      .locator(".btn-select-plan")
      .click();
    await p.locator("#lead-name").fill("Khách hàng QA");
    await p.locator("#lead-phone").fill(contactPhone);
    await p.locator("#lead-address").fill("Địa chỉ giả QA");
    const leadResponse = p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/leads") && r.request().method() === "POST",
    );
    await p.locator("#btn-submit-lead").click();
    const lead = await leadResponse;
    assert.ok([200, 201, 202].includes(lead.status()), await lead.text());
    const intake = lead.request().postDataJSON();
    assert.equal(intake.plan_id, plans[0].id);
    assert.deepEqual(intake.accessory_ids, [accessory.id]);
    assert.equal(intake.region_id, region.id);
    assert.match(intake.notes, /Kỳ thanh toán quan tâm: 6 tháng/);
    assert.ok(intake.quote_token);
    await p.locator("#confirmation-backdrop.active").waitFor();
    await p.keyboard.press("Escape");
    for (const count of [3, 9]) {
      await p.goto(origin + "/admin/landing-pages");
      const fresh = await api("/admin/pages/" + row.id);
      row = await api(
        "/admin/pages/" + row.id + "?expected_version=" + fresh.version,
        "PUT",
        {
          ...data,
          landing: {
            ...landing,
            plan_ids: plans.slice(0, count).map((p) => p.id),
          },
        },
      );
      await api("/admin/pages/" + row.id + "/publish", "POST", {
        expected_version: row.version,
      });
      await p.goto(origin + "/" + data.slug);
      await p.waitForLoadState("networkidle");
      assert.equal(await p.locator(".lp-plan-card").count(), count);
      await p.setViewportSize({ width: 1440, height: 1000 });
      const rects = await p.locator(".lp-plan-card").evaluateAll((els) =>
        els.map((el) => ({
          h: Math.round(el.getBoundingClientRect().height),
          w: Math.round(el.getBoundingClientRect().width),
        })),
      );
      assert.equal(new Set(rects.map((r) => r.h)).size, 1);
      assert.equal(new Set(rects.map((r) => r.w)).size, 1);
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
    }
    // Long catalog pagination never expands the homepage on a small phone.
    await p.goto(origin + "/");
    await p.waitForLoadState("networkidle");
    await p.setViewportSize({ width: 320, height: 844 });
    await p.evaluate(() => {
      const dots = document.querySelector("#plans-slider-dots");
      for (let i = 0; i < 40; i++) {
        const dot = document.createElement("span");
        dot.className = "plans-dot";
        dots.append(dot);
      }
    });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    // A stale upload must not lock or mutate a newly opened editor.
    await p.goto(origin + "/admin/landing-pages?id=" + row.id);
    await p.locator('[data-path="slug"]').waitFor();
    await p
      .locator(".lp-admin-photo input[type=file]")
      .first()
      .setInputFiles(".local/qa/package-upload.png");
    await p
      .locator(".lp-admin-photo")
      .first()
      .getByText("Ảnh sẵn sàng · Lưu bản nháp để áp dụng")
      .waitFor();
    await p.locator("#lp-admin-save").click();
    await p.waitForFunction(() =>
      document
        .querySelector("#lp-admin-save-state")
        .textContent.startsWith("Đã lưu bản nháp"),
    );
    assert.ok(
      (await api("/admin/pages/" + row.id)).payload.landing.hero_image_id,
      "Direct upload persists a validated media UUID",
    );
    let releaseUpload, markUpload;
    const uploadStarted = new Promise((resolve) => (markUpload = resolve));
    await p.route("https://media.example.test/uploads/**", (r) => {
      if (r.request().method() === "OPTIONS")
        return r.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-methods": "PUT",
            "access-control-allow-headers": "content-type",
          },
        });
      markUpload();
      return new Promise((resolve) => {
        releaseUpload = () =>
          r
            .fulfill({
              status: 200,
              headers: { "access-control-allow-origin": origin },
            })
            .then(resolve);
      });
    });
    const uploadInput = p.locator(".lp-admin-photo input[type=file]").first();
    await uploadInput.evaluate((el) => (el.value = ""));
    await uploadInput.setInputFiles(".local/qa/package-upload.png");
    let uploadTimer;
    try {
      await Promise.race([
        uploadStarted,
        new Promise(
          (_, reject) =>
            (uploadTimer = setTimeout(
              () => reject(Error("Upload did not start")),
              10000,
            )),
        ),
      ]);
    } finally {
      clearTimeout(uploadTimer);
    }
    const uploadingSlug = await p.locator('[data-path="slug"]').inputValue();
    await p
      .getByRole("button", {
        name: "Dùng nội dung mẫu chiến dịch Camera",
        exact: true,
      })
      .click();
    assert.match(
      await p.locator("#lp-admin-error").textContent(),
      /Đợi ảnh tải xong/,
    );
    assert.equal(
      await p.locator('[data-path="slug"]').inputValue(),
      uploadingSlug,
    );
    assert.equal(
      await uploadInput.isDisabled(),
      true,
      "Uploading field remains connected during blocked rerender",
    );
    assert.equal(
      await p
        .locator(".lp-admin-photo")
        .first()
        .getByRole("button", { name: "Bỏ ảnh", exact: true })
        .isDisabled(),
      true,
    );
    await p.locator("#lp-admin-close").click();
    await p.locator("#lp-admin-new").click();
    await p.locator('[data-path="slug"]').fill("fresh-upload-" + suffix);
    const freshSave = p.waitForResponse(
      (r) =>
        r.url().endsWith("/admin/pages") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await p.locator("#lp-admin-save").click();
    let savedFresh;
    try {
      savedFresh = await (await freshSave).json();
    } catch (e) {
      console.error(
        "FRESH_SAVE_STATE",
        await p.evaluate(() => ({
          error: document.querySelector("#lp-admin-error").textContent,
          disabled: document.querySelector("#lp-admin-save").disabled,
          invalid: [
            ...document.querySelectorAll("#lp-admin-form :invalid"),
          ].map((el) => ({
            path: el.dataset.path,
            value: el.value,
            message: el.validationMessage,
          })),
        })),
      );
      throw e;
    }
    const finalized = p.waitForResponse(
      (r) => r.url().includes("/media/") && r.url().endsWith("/finalize"),
    );
    await releaseUpload();
    await finalized;
    assert.equal(
      (await api("/admin/pages/" + savedFresh.id)).payload.landing
        .hero_image_id,
      null,
    );
    assert.equal(await p.locator("#lp-admin-save").isDisabled(), false);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        browser: type.name(),
        passed: true,
        checks: [
          "unsaved preview",
          "draft/publish",
          "form transfer",
          "region pricing",
          "popup",
          "3/6/9 cards",
          "320–1440 responsive",
          "equal card dimensions",
          "mobile menu",
          "preview cannot send",
          "default 12 months; 1/6/12 switching",
          "accessory totals and real lead payload",
          "upload editor switch isolation",
          "save preserves later edits",
          "long homepage dots stay within mobile",
        ],
      }),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
