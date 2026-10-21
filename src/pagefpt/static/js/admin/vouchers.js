/* Structured voucher editor. No secrets or customer data are kept in browser storage. */
(() => {
  const $ = (id) => document.getElementById(id),
    el = (tag, text = "", cls = "") => {
      const n = document.createElement(tag);
      n.textContent = text;
      if (cls) n.className = cls;
      return n;
    };

  let rows = [],
    links = [],
    plans = [],
    products = [],
    geos = [],
    inventory = [],
    employees = [],
    selected = null,
    rules = [],
    excluded = new Set(),
    checks = new Set(),
    sort = "code",
    direction = 1,
    busy = false,
    cursor = null,
    geoFailure = false,
    savedForm = "",
    dirty = false,
    cloningRow = null,
    lastReportData = null;

  const money = (n) => new Intl.NumberFormat("vi-VN").format(n || 0) + "đ",
    date = (s) => window.PageFPTDates?.format(s) || s;

  const errors = {
    VERSION_CONFLICT: "Dữ liệu đã thay đổi bởi người khác. Vui lòng tải lại trước khi lưu.",
    PERMISSION_DENIED: "Cần đúng quyền quản trị viên và xác thực 2 bước.",
    FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
    UNAUTHENTICATED: "Phiên đăng nhập đã hết hạn hoặc chưa xác thực. Vui lòng tải lại trang và đăng nhập lại.",
    CSRF_INVALID: "Phiên bảo mật (CSRF) đã hết hạn. Vui lòng làm mới trang.",
    CSRF_MISSING: "Thiếu mã xác thực CSRF. Vui lòng làm mới trang.",
    DATABASE_UNAVAILABLE: "Hệ thống cơ sở dữ liệu tạm thời bận hoặc mất kết nối. Vui lòng thử lại sau.",
    NOT_FOUND: "Không tìm thấy dữ liệu voucher hoặc link yêu cầu trong hệ thống.",
    HTTP_ERROR: "Máy chủ gặp sự cố khi xử lý yêu cầu.",
    VALIDATION_ERROR: "Kiểm tra các trường bắt buộc, mức giảm và thời gian.",
    VOUCHER_CODE_EXISTS: "Mã voucher này đã tồn tại trong hệ thống. Hãy chọn mã khác.",
    VOUCHER_CODE_IMMUTABLE: "Mã đã tạo không được thay đổi; hãy tạo voucher mới.",
    VOUCHER_ARCHIVE_REQUIRED: "Voucher đã công bố, có link hoặc đã dùng. Hãy tạm dừng để giữ lịch sử.",
    INVALID_GIFT: "Quà cần là phụ kiện công bố, tính một lần và đã thiết lập tồn kho.",
    INVALID_LINK_TARGET: "Chọn trang chủ, ưu đãi, đo tốc độ hoặc một landing đã công bố.",
    INVALID_VOUCHER_BENEFIT: "Quy tắc cần khoản giảm thực tế hoặc quà tặng hợp lệ.",
    CSRF_FAILED: "Phiên bảo mật đã hết hạn. Vui lòng tải lại trang.",
    VOUCHER_EXPIRED: "Ngày kết thúc chiến dịch đã qua.",
    VOUCHER_LIMIT_BELOW_COMMITTED: "Hạn mức/ngân sách thấp hơn số đã dùng hoặc đang giữ.",
    INVENTORY_BELOW_COMMITTED: "Tồn kho không được nhỏ hơn số đã dùng/giữ.",
    LINK_SLUG_EXISTS: "Mã đường dẫn rút gọn này đã được sử dụng. Vui lòng chọn tên khác.",
    INVALID_SITE_ORIGIN: "Nguồn trang web không hợp lệ.",
  };

  async function api(path = "", method = "GET", body) {
    const r = await adminFetch("/api/v1/admin/vouchers" + path, {
      method,
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    let d;
    try {
      d = await r.json();
    } catch (_) {
      d = {};
    }
    if (!r.ok) {
      if (r.status === 401 || d.code === "UNAUTHENTICATED") {
        throw Error("Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang và đăng nhập lại.");
      }
      if (r.status === 403 || d.code === "PERMISSION_DENIED" || d.code === "FORBIDDEN") {
        throw Error("Tài khoản chưa đủ quyền thực hiện thao tác này (Cần quyền quản trị và xác thực 2 bước).");
      }
      if (d.code === "CSRF_INVALID" || d.code === "CSRF_MISSING") {
        throw Error("Phiên bảo mật (CSRF) đã hết hạn. Vui lòng tải lại trang.");
      }
      let errMsg = errors[d.code];
      if (!errMsg && d.detail) {
        if (Array.isArray(d.detail)) {
          errMsg = d.detail
            .map((item) => {
              const field = item.loc ? item.loc.slice(1).join(".") : "";
              let msg = item.msg || "";
              msg = msg.replace(/^Value error,\s*/i, "");
              return field ? `${field}: ${msg}` : msg;
            })
            .join("; ");
        } else if (typeof d.detail === "string") {
          errMsg = d.detail;
        }
      }
      if (!errMsg && d.code && d.code !== "DOMAIN_ERROR") {
        errMsg = errors[d.code] || `Lỗi thao tác: ${d.code}`;
      }
      if (!errMsg) {
        errMsg = d.message && d.message !== "Request cannot be completed"
          ? d.message
          : `Không thể hoàn tất yêu cầu (Mã lỗi ${d.code || r.status}).`;
      }
      throw Error(errMsg);
    }
    return d;
  }

  function showNotice(msg, type = "info") {
    const st = $("voucher-status");
    if (st) st.textContent = msg;

    const draftState = $("v-draft-state");
    if (draftState) {
      draftState.textContent = msg;
      draftState.className =
        "voucher-draft-label " +
        (type === "error"
          ? "voucher-state-error"
          : type === "success"
            ? "voucher-state-success"
            : "");
    }

    const errBox = $("voucher-error-summary");
    if (errBox) {
      if (type === "error") {
        errBox.textContent = "⚠️ " + msg;
        errBox.hidden = false;
        errBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        errBox.hidden = true;
      }
    }

    let toast = document.getElementById("voucher-floating-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "voucher-floating-toast";
      toast.className = "voucher-floating-toast";
      document.body.appendChild(toast);
    }
    toast.className = `voucher-floating-toast show ${type}`;
    const icon = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
    toast.replaceChildren(el("span", icon, "toast-icon"), el("span", msg, "toast-msg"));

    if (window._voucherToastTimeout) clearTimeout(window._voucherToastTimeout);
    window._voucherToastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 4500);
  }

  function status(s) {
    const isSuccess =
      s.toLowerCase().includes("đã") ||
      s.toLowerCase().includes("thành công") ||
      s.toLowerCase().includes("hoàn tất");
    showNotice(s, isSuccess ? "success" : "error");
  }

  function highlightField(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add("voucher-field-highlight");
    setTimeout(() => el.classList.remove("voucher-field-highlight"), 2500);
  }

  async function job(fn) {
    if (busy) return;
    busy = true;
    const controls = [
      ...document.querySelectorAll(
        ".voucher-admin input,.voucher-admin select,.voucher-admin textarea",
      ),
    ].map((e) => [e, e.disabled]);
    controls.forEach(([e]) => (e.disabled = true));
    document
      .querySelectorAll(".voucher-admin button")
      .forEach((b) => (b.disabled = true));
    try {
      await fn();
    } catch (e) {
      showNotice(e.message, "error");
    } finally {
      controls.forEach(([e, disabled]) => (e.disabled = disabled));
      busy = false;
      document
        .querySelectorAll(".voucher-admin button")
        .forEach((b) => (b.disabled = false));
      syncButtons();
    }
  }

  function syncButtons() {
    const live = selected?.status === "published";
    const publishBtn = $("voucher-publish");
    if (publishBtn) {
      publishBtn.disabled =
        dirty ||
        !selected ||
        !adminHasPermission("pricing.publish") ||
        window.adminAAL !== "aal2";
    }
    const pauseBtn = $("voucher-pause");
    if (pauseBtn) {
      pauseBtn.disabled = !live || !adminHasPermission("pricing.publish");
    }
    const deleteBtn = $("voucher-delete");
    if (deleteBtn) {
      deleteBtn.disabled =
        !selected ||
        !!selected.published_payload ||
        !adminHasPermission("pricing.publish");
    }
    const shareBanner = $("voucher-share-banner");
    if (shareBanner) {
      if (selected) {
        shareBanner.className = "voucher-share-status-banner";
        shareBanner.innerHTML = `🔗 <strong>Chiến dịch đang chọn:</strong> <span class="voucher-code-badge">${selected.code}</span> — Đã kích hoạt tạo link rút gọn và tải mã QR Marketing.`;
      } else {
        shareBanner.className = "voucher-share-status-banner pending";
        shareBanner.innerHTML = `💡 <strong>Tạo link nhanh:</strong> Nhập link ngắn và chọn kênh phân phối bên dưới. Bấm <strong>"+ Tạo link chia sẻ"</strong> sẽ tự động lưu voucher và xuất mã QR Marketing!`;
      }
    }
    const codeInput = $("v-code");
    if (codeInput) {
      codeInput.readOnly = !!selected;
    }
  }

  function selectOptions(input, options, value) {
    if (!input) return;
    input.replaceChildren();
    for (const [val, title] of options) {
      const o = el("option", title);
      o.value = val;
      input.append(o);
    }
    input.value = value ?? "";
  }

  function inputField(box, title, value, type = "number", options) {
    const l = el("label", title),
      i = el(options ? "select" : "input");
    if (options) selectOptions(i, options, value);
    else {
      i.type = type;
      i.value = value ?? "";
      if (type === "number") i.min = "0";
    }
    l.append(i);
    box.append(l);
    return i;
  }

  function baseRule() {
    return {
      key: "default",
      region_id: null,
      region_name: "Toàn quốc",
      amount: 100000,
      discount_kind: "fixed",
      basis: "initial",
      quota: null,
      cap_vnd: null,
      gift_product_id: null,
    };
  }

  function newRule(g) {
    const template = rules[0] || baseRule();
    return {
      ...template,
      key: g ? "geo-" + g.id : "default",
      region_id: g?.id || null,
      region_name: g?.name || "Toàn quốc",
    };
  }

  function renderRules() {
    const box = $("v-rules");
    if (!box) return;
    box.replaceChildren();
    for (const rule of rules) {
      const card = el("section", "", "voucher-rule"),
        head = el("header"),
        remove = el("button", "Xóa vùng", "btn-action-detail");
      remove.type = "button";
      head.append(
        el("h3", (rule.region_name || rule.region_id || "Toàn quốc")),
        remove,
      );
      remove.onclick = () => {
        rules = rules.filter((x) => x !== rule);
        renderRules();
        renderGeos();
        preview();
      };
      card.append(head);
      const fields = el("div", "", "voucher-fields");
      card.append(fields);
      const kind = inputField(fields, "Kiểu giảm", rule.discount_kind, "", [
        ["fixed", "Số tiền cố định"],
        ["percent", "Phần trăm (%)"],
      ]);
      kind.onchange = () => {
        rule.discount_kind = kind.value;
        if (kind.value === "percent" && rule.amount > 10000) rule.amount = 0;
        renderRules();
        preview();
      };
      const amount = inputField(
        fields,
        rule.discount_kind === "percent" ? "Mức giảm (%)" : "Mức giảm (đ)",
        rule.discount_kind === "percent" ? rule.amount / 100 : rule.amount,
      );
      amount.dataset.vRuleAmount = "";
      amount.step = rule.discount_kind === "percent" ? "0.01" : "1";
      amount.max = rule.discount_kind === "percent" ? "100" : "1000000000";
      amount.oninput = () => {
        rule.amount =
          rule.discount_kind === "percent"
            ? Math.round(Number(amount.value) * 100)
            : Number(amount.value);
        preview();
      };
      const basis = inputField(fields, "Áp dụng vào", rule.basis, "", [
        ["initial", "Thanh toán ban đầu"],
        ["monthly", "Giá gói mỗi tháng"],
        ["setup", "Phí hòa mạng"],
        ["equipment", "Phí thiết bị gói"],
      ]);
      basis.onchange = () => {
        rule.basis = basis.value;
        preview();
      };
      const cap = inputField(
        fields,
        rule.basis === "monthly" ? "Trần giảm / tháng (đ)" : "Trần giảm (đ)",
        rule.cap_vnd,
      );
      cap.placeholder = "Không giới hạn (giảm tiền)";
      cap.oninput = () => {
        rule.cap_vnd = cap.value === "" ? null : Number(cap.value);
        preview();
      };
      const quota = inputField(fields, "Số suất vùng", rule.quota);
      quota.placeholder = "Dùng hạn mức chiến dịch";
      quota.min = "1";
      quota.oninput = () => {
        rule.quota = quota.value === "" ? null : Number(quota.value);
      };
      const gift = inputField(fields, "Quà kèm", rule.gift_product_id, "", [
        ["", "Không tặng thiết bị"],
        ...products
          .filter((p) => p.billing_mode === "one_time")
          .map((p) => [p.id, p.name]),
      ]);
      gift.onchange = () => {
        rule.gift_product_id = gift.value || null;
        preview();
      };
      box.append(card);
    }
  }

  function renderChecks(box, items, chosen, onchange) {
    if (!box) return;
    box.replaceChildren();
    for (const item of items) {
      const l = el("label"),
        i = el("input");
      i.type = "checkbox";
      i.value = item.id;
      i.checked = chosen.has(item.id);
      l.append(i, document.createTextNode(item.name));
      i.onchange = () => onchange(item, i.checked);
      box.append(l);
    }
  }

  function renderGeos() {
    const filter = $("v-geo-search")?.value.trim().toLocaleLowerCase("vi") || "",
      xfilter = $("v-exclude-search")?.value.trim().toLocaleLowerCase("vi") || "";
    const visible = (q) =>
      geos
        .filter((g) =>
          q
            ? g.name.toLocaleLowerCase("vi").includes(q)
            : g.level === "province",
        )
        .slice(0, 150);
    renderChecks(
      $("v-geographies"),
      visible(filter),
      new Set(rules.map((r) => r.region_id)),
      (g, on) => {
        if (on && !rules.some((r) => r.region_id === g.id)) {
          if (rules.length >= 200) {
            status("Tối đa 200 vùng.");
            return;
          }
          rules.push(newRule(g));
        } else if (!on) rules = rules.filter((r) => r.region_id !== g.id);
        renderRules();
        preview();
      },
    );
    renderChecks($("v-exclusions"), visible(xfilter), excluded, (g, on) => {
      if (on) excluded.add(g.id);
      else excluded.delete(g.id);
      preview();
    });
  }

  function formData() {
    const value = (id) => $(id)?.value.trim() || "",
      num = (id) => Number(value(id)),
      ids = (id) =>
        [...($(id)?.querySelectorAll("input:checked") || [])].map((i) => i.value);
    const progType = value("v-program-type") || "cash_discount";
    const giftName = value("v-gift-name");
    const hasGift = progType === "physical_gift" || progType === "combo_gift_cash" || !!giftName;

    return {
      code: value("v-code").toUpperCase(),
      name: value("v-name"),
      label: value("v-label"),
      terms: value("v-terms"),
      start: value("v-start") ? value("v-start") + ":00+07:00" : "",
      end: value("v-end") ? value("v-end") + ":00+07:00" : "",
      quota: num("v-quota"),
      budget_vnd: num("v-budget"),
      per_contact_limit: num("v-per-contact"),
      hold_hours: num("v-hold"),
      redeem_at: value("v-redeem") || "installed",
      stackable: $("v-stackable")?.checked || false,
      plan_ids: ids("v-plans"),
      services: ids("v-services"),
      billing_months: ids("v-months").map(Number),
      rules: rules.map((r) => ({ ...r })),
      exclusions: [...excluded],
      program_type: progType,
      popup_config: {
        eyebrow: value("v-popup-eyebrow") || "🎁 ĐẶC QUYỀN ƯU ĐÃI FPT",
        title: value("v-popup-title") || (value("v-name") || "Chúc mừng! Bạn nhận được ưu đãi"),
        subtitle: value("v-popup-subtitle") || value("v-label") || "",
        hero_prefix: value("v-popup-hero-prefix") || (progType === "physical_gift" ? "TẶNG MIỄN PHÍ" : "GIẢM TRỰC TIẾP"),
        hero_highlight: value("v-popup-hero-highlight") || "",
        hero_sub: value("v-popup-hero-sub") || "Áp dụng trực tiếp vào phí đăng ký lắp đặt FPT",
        cta_text: value("v-popup-cta") || "NHẬN QUÀ & SỬ DỤNG NGAY",
        reassurance_text: value("v-popup-reassurance") || "🔒 Nhân viên liên hệ xác nhận, chưa cần thanh toán ngay.",
        dismiss_text: value("v-popup-dismiss") || "Để sau, tôi muốn xem các gói trước",
        urgency_badge: value("v-popup-urgency") || null,
        theme: "fpt_orange",
      },
      physical_gift: hasGift ? {
        name: giftName,
        market_value_vnd: num("v-gift-market-val") || 0,
        image_url: value("v-gift-image-url") || null,
        delivery_type: value("v-gift-delivery") || "installation",
        condition_note: value("v-gift-condition") || "",
      } : null,
    };
  }

  function updateReviewSummary(data) {
    const container = $("voucher-review-content");
    if (!container) return;
    container.replaceChildren();

    const items = [
      { label: "Mã chiến dịch", val: data.code || "(Chưa nhập)" },
      { label: "Tên chiến dịch", val: data.name || "(Chưa nhập)" },
      {
        label: "Loại chương trình",
        val:
          data.program_type === "physical_gift"
            ? "🎁 Quà tặng sản phẩm thật"
            : data.program_type === "combo_gift_cash"
              ? "🎁+💵 Combo Quà & Giảm tiền"
              : data.program_type === "percent_discount"
                ? "📉 Giảm theo %"
                : "💵 Giảm tiền cước",
      },
      ...(data.physical_gift?.name
        ? [
            {
              label: "Quà tặng sản phẩm",
              val:
                data.physical_gift.name +
                (data.physical_gift.market_value_vnd
                  ? " (Trị giá " + money(data.physical_gift.market_value_vnd) + ")"
                  : ""),
            },
          ]
        : []),
      { label: "Nhãn hiển thị", val: data.label || "Ưu đãi khu vực" },
      {
        label: "Thời gian hiệu lực",
        val:
          (data.start ? date(data.start) : "---") +
          " đến " +
          (data.end ? date(data.end) : "---"),
      },
      { label: "Tổng số suất", val: data.quota ? data.quota + " suất" : "---" },
      {
        label: "Ngân sách tối đa",
        val: data.budget_vnd ? money(data.budget_vnd) : "---",
      },
      {
        label: "Kỳ thanh toán",
        val: data.billing_months.length
          ? data.billing_months.map((m) => m + " tháng").join(", ")
          : "Chưa chọn",
      },
      { label: "Số quy tắc vùng", val: rules.length + " quy tắc" },
      {
        label: "Vùng loại trừ",
        val: excluded.size ? excluded.size + " địa bàn" : "Không có",
      },
      { label: "Cộng dồn", val: data.stackable ? "Cho phép" : "Không" },
      { label: "Thời gian giữ suất", val: data.hold_hours + " giờ" },
      {
        label: "Điều kiện đã dùng",
        val: data.redeem_at === "installed" ? "Đã lắp đặt" : "Khách chốt",
      },
    ];

    items.forEach((it) => {
      const card = el("div", "", "voucher-review-item");
      card.append(el("span", it.label), el("strong", it.val));
      container.append(card);
    });

    const warnBox = $("voucher-warning-banner");
    if (warnBox) {
      const warnings = [];
      for (const r of rules) {
        if (r.discount_kind === "percent" && r.cap_vnd === 0) {
          warnings.push(
            `Quy tắc "${r.region_name || "Toàn quốc"}": Cấu hình trần 0đ cho mức giảm theo % sẽ khiến mức giảm thực tế bằng 0đ!`,
          );
        }
        if (r.amount === 0 && !r.gift_product_id) {
          warnings.push(
            `Quy tắc "${r.region_name || "Toàn quốc"}": Mức giảm là 0đ/0% và không kèm quà tặng.`,
          );
        }
      }
      if (
        data.start &&
        data.end &&
        new Date(data.end) <= new Date(data.start)
      ) {
        warnings.push("Ngày kết thúc phải diễn ra sau ngày bắt đầu.");
      }
      if (warnings.length > 0) {
        warnBox.replaceChildren(
          el("strong", "⚠️ Cảnh báo cấu hình cần chú ý:"),
          ...warnings.map((w) => el("p", "• " + w)),
        );
        warnBox.hidden = false;
      } else {
        warnBox.hidden = true;
      }
    }
  }

  function preview() {
    const data = formData();
    dirty = !!selected && JSON.stringify(data) !== savedForm;
    const draftState = $("v-draft-state");
    if (draftState) {
      draftState.textContent = dirty
        ? "Có thay đổi chưa lưu. Lưu bản nháp trước khi công bố."
        : selected
          ? "Đang xem bản nháp đã lưu. Công bố để khách thấy nội dung này."
          : "";
    }
    if (!busy) syncButtons();

    // Ẩn/hiện khối thiết lập quà tặng sản phẩm thật
    const progType = $("v-program-type")?.value || "cash_discount";
    const giftSection = $("v-gift-section");
    if (giftSection) {
      giftSection.hidden = !(progType === "physical_gift" || progType === "combo_gift_cash");
    }

    // Cập nhật các trường trên Smartphone Simulator
    const eyebrow = $("p-eyebrow");
    if (eyebrow) {
      eyebrow.textContent = $("v-popup-eyebrow")?.value.trim() || "🎁 ĐẶC QUYỀN ƯU ĐÃI FPT";
    }

    const title = $("p-title");
    if (title) {
      title.textContent = $("v-popup-title")?.value.trim() || $("v-name")?.value.trim() || "Chúc mừng! Bạn nhận được ưu đãi";
    }

    const label = $("p-label");
    if (label) {
      label.textContent = $("v-popup-subtitle")?.value.trim() || $("v-label")?.value.trim() || "Ưu đãi khách hàng mới";
    }

    const urgency = $("p-urgency");
    if (urgency) {
      const urgVal = $("v-popup-urgency")?.value.trim();
      if (urgVal) {
        urgency.textContent = urgVal;
        urgency.hidden = false;
      } else {
        urgency.hidden = true;
      }
    }

    // Quà tặng sản phẩm thật (Physical Gift Showcase)
    const giftWrap = $("p-gift-wrap");
    const giftImg = $("p-gift-img");
    const giftMarketBox = $("p-gift-market-box");
    const giftMarketVal = $("p-gift-market-val");
    const giftName = $("v-gift-name")?.value.trim();
    const giftVal = Number($("v-gift-market-val")?.value) || 0;
    const giftImgUrl = $("v-gift-image-url")?.value.trim();

    if (giftWrap) {
      if ((progType === "physical_gift" || progType === "combo_gift_cash") && giftName) {
        giftWrap.hidden = false;
        if (giftImg) {
          if (giftImgUrl) {
            giftImg.src = giftImgUrl;
            giftImg.alt = giftName;
            giftImg.style.display = "block";
          } else {
            giftImg.style.display = "none";
          }
        }
        if (giftMarketBox && giftMarketVal) {
          if (giftVal > 0) {
            giftMarketVal.textContent = money(giftVal);
            giftMarketBox.style.display = "flex";
          } else {
            giftMarketBox.style.display = "none";
          }
        }
      } else {
        giftWrap.hidden = true;
      }
    }

    // Hero Discount / Hero Gift Highlight Zone
    const heroPrefix = $("p-hero-prefix");
    const heroAmount = $("p-hero-amount");
    const heroSub = $("p-hero-sub");
    const customPrefix = $("v-popup-hero-prefix")?.value.trim();
    const customHighlight = $("v-popup-hero-highlight")?.value.trim();
    const customSub = $("v-popup-hero-sub")?.value.trim();

    const firstRule = rules[0];
    if (heroPrefix) {
      heroPrefix.textContent = customPrefix || (progType === "physical_gift" ? "TẶNG MIỄN PHÍ" : "GIẢM TRỰC TIẾP");
    }
    if (heroAmount) {
      if (customHighlight) {
        heroAmount.textContent = customHighlight;
      } else if (progType === "physical_gift" && giftName) {
        heroAmount.textContent = giftName.toUpperCase();
      } else if (firstRule) {
        heroAmount.textContent = firstRule.discount_kind === "percent" ? (firstRule.amount / 100 + "%") : money(firstRule.amount);
      } else {
        heroAmount.textContent = "100.000đ";
      }
    }
    if (heroSub) {
      heroSub.textContent = customSub || (progType === "physical_gift" && giftVal > 0 ? "Trị giá " + money(giftVal) + " khi đăng ký mới" : "Áp dụng trực tiếp vào phí đăng ký lắp đặt FPT");
    }

    // Mã voucher & Hạn dùng
    const codeEl = $("p-code");
    if (codeEl) codeEl.textContent = $("v-code")?.value.trim().toUpperCase() || "VIP-KM";

    const endEl = $("p-end");
    if (endEl) {
      const endVal = $("v-end")?.value;
      endEl.textContent = endVal ? new Date(endVal).toLocaleDateString("vi-VN") : "30 ngày";
    }

    const termsEl = $("p-terms");
    if (termsEl) termsEl.textContent = $("v-terms")?.value.trim() || "Áp dụng cho khách hàng hoàn tất đăng ký lắp đặt mới.";

    const ctaText = $("p-cta-text");
    if (ctaText) ctaText.textContent = $("v-popup-cta")?.value.trim() || "NHẬN QUÀ & SỬ DỤNG NGAY";

    const reassurance = $("p-reassurance");
    if (reassurance) reassurance.textContent = $("v-popup-reassurance")?.value.trim() || "🔒 Nhân viên liên hệ xác nhận, chưa cần thanh toán ngay.";

    const later = $("p-later");
    if (later) later.textContent = $("v-popup-dismiss")?.value.trim() || "Để sau, tôi muốn xem các gói trước";

    // Danh sách quyền lợi trên Smartphone Simulator
    const benefitsBox = $("p-benefits");
    if (benefitsBox) {
      benefitsBox.replaceChildren();
      if ((progType === "physical_gift" || progType === "combo_gift_cash") && giftName) {
        const item = el("p", "🎁 Quà hiện vật: " + giftName + (giftVal > 0 ? " (Trị giá " + money(giftVal) + ")" : ""));
        item.style.cssText = "font-size:10.5px; padding:3px 6px; margin:0; border-left:3px solid #ea580c; background:#fff;";
        benefitsBox.append(item);
      }
      for (const r of rules.slice(0, 2)) {
        const benefit = r.discount_kind === "percent" ? r.amount / 100 + "%" : money(r.amount);
        const text = "✨ " + (r.region_name || "Toàn quốc") + ": Giảm " + benefit + (r.basis === "monthly" ? " cước tháng" : "");
        const item = el("p", text);
        item.style.cssText = "font-size:10.5px; padding:3px 6px; margin:0; border-left:3px solid #f26f21; background:#fff;";
        benefitsBox.append(item);
      }
    }

    updateReviewSummary(data);
  }

  function getDefaultDates() {
    const now = new Date();
    const startYear = now.getFullYear();
    const startMonth = String(now.getMonth() + 1).padStart(2, "0");
    const startDay = String(now.getDate()).padStart(2, "0");
    const startISO = `${startYear}-${startMonth}-${startDay}T00:00`;

    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const endYear = endDate.getFullYear();
    const endMonth = String(endDate.getMonth() + 1).padStart(2, "0");
    const endDay = String(endDate.getDate()).padStart(2, "0");
    const endISO = `${endYear}-${endMonth}-${endDay}T23:59`;
    return { startISO, endISO };
  }

  function goToStep(idx) {
    const tabs = [
      $("v-step-tab-1"),
      $("v-step-tab-2"),
      $("v-step-tab-3"),
    ];
    const sections = [
      $("v-step-1"),
      $("v-step-2"),
      $("v-step-3"),
    ];
    tabs.forEach((tab, i) => {
      if (!tab) return;
      const isActive = i === idx;
      tab.classList.toggle("active", isActive);
      if (isActive) tab.setAttribute("aria-current", "step");
      else tab.removeAttribute("aria-current");
    });
    if (sections[idx]) {
      sections[idx].scrollIntoView({ behavior: "smooth", block: "start" });
      sections[idx].classList.add("active-focus");
      setTimeout(() => sections[idx]?.classList.remove("active-focus"), 1200);
    }
  }

  function validateVoucherForm() {
    const code = $("v-code")?.value.trim().toUpperCase() || "";
    if (!code || code.length < 3 || !/^[A-Z0-9_-]+$/.test(code)) {
      goToStep(0);
      highlightField("v-code");
      showNotice(
        "Mã voucher cần từ 3 đến 40 ký tự (chỉ gồm chữ hoa A-Z, số 0-9, gạch nối: A-Z, 0-9, -, _).",
        "error",
      );
      $("v-code")?.focus();
      return false;
    }

    const name = $("v-name")?.value.trim() || "";
    if (!name) {
      goToStep(0);
      highlightField("v-name");
      showNotice("Vui lòng nhập tên chiến dịch ưu đãi (Bước 1).", "error");
      $("v-name")?.focus();
      return false;
    }

    const termsInput = $("v-terms");
    if (!termsInput?.value.trim()) {
      if (termsInput) {
        termsInput.value =
          "Áp dụng cho khách hàng hoàn tất đăng ký và nghiệm thu lắp đặt mới. Không quy đổi thành tiền mặt.";
      }
    }

    const progType = $("v-program-type")?.value || "cash_discount";
    if (progType === "physical_gift" && !$("v-gift-name")?.value.trim()) {
      goToStep(0);
      highlightField("v-gift-name");
      showNotice("Vui lòng nhập tên sản phẩm quà tặng cho chiến dịch quà hiện vật.", "error");
      $("v-gift-name")?.focus();
      return false;
    }

    const months = [...($("v-months")?.querySelectorAll("input:checked") || [])];
    if (!months.length) {
      goToStep(0);
      showNotice(
        "Vui lòng chọn ít nhất một kỳ thanh toán áp dụng (Hàng tháng, 6 tháng hoặc 12 tháng).",
        "error",
      );
      return false;
    }

    if (!rules || rules.length === 0) {
      rules = [baseRule()];
      renderRules();
    }
    const hasPhysGift = !!($("v-gift-name")?.value.trim() && (progType === "physical_gift" || progType === "combo_gift_cash"));
    for (const rule of rules) {
      if (rule.discount_kind === "percent") {
        if (!rule.amount || rule.amount <= 0 || rule.amount > 10000) {
          goToStep(1);
          showNotice(
            `Quy tắc vùng "${rule.region_name || "Toàn quốc"}": Mức giảm % cần từ 0.01% đến 100%.`,
            "error",
          );
          return false;
        }
        if (!rule.cap_vnd || rule.cap_vnd <= 0) {
          goToStep(1);
          showNotice(
            `Quy tắc vùng "${rule.region_name || "Toàn quốc"}": Giảm theo % bắt buộc phải nhập Trần giảm tối đa (đ).`,
            "error",
          );
          return false;
        }
      } else {
        if ((!rule.amount || rule.amount < 0) && !rule.gift_product_id && !hasPhysGift) {
          goToStep(1);
          showNotice(
            `Quy tắc vùng "${rule.region_name || "Toàn quốc"}": Cần nhập số tiền giảm (VD: 50.000đ) hoặc chọn phụ kiện quà tặng kèm (hoặc thiết lập Quà tặng sản phẩm thật).`,
            "error",
          );
          return false;
        }
      }
    }

    const startVal = $("v-start")?.value.trim();
    const endVal = $("v-end")?.value.trim();
    if (!startVal) {
      goToStep(2);
      highlightField("v-start");
      showNotice("Vui lòng chọn ngày giờ bắt đầu hiệu lực (Bước 3).", "error");
      $("v-start")?.focus();
      return false;
    }
    if (!endVal) {
      goToStep(2);
      highlightField("v-end");
      showNotice("Vui lòng chọn ngày giờ kết thúc hiệu lực (Bước 3).", "error");
      $("v-end")?.focus();
      return false;
    }
    const startDt = new Date(startVal);
    const endDt = new Date(endVal);
    if (endDt <= startDt) {
      goToStep(2);
      highlightField("v-end");
      showNotice(
        "Ngày giờ kết thúc phải sau ngày giờ bắt đầu chiến dịch.",
        "error",
      );
      $("v-end")?.focus();
      return false;
    }

    const quota = Number($("v-quota")?.value);
    if (!quota || quota < 1 || quota > 1000000) {
      goToStep(2);
      highlightField("v-quota");
      showNotice("Vui lòng nhập tổng số suất hợp lệ (từ 1 đến 1.000.000 suất).", "error");
      $("v-quota")?.focus();
      return false;
    }

    const budget = Number($("v-budget")?.value);
    if (!budget || budget < 1) {
      goToStep(2);
      highlightField("v-budget");
      showNotice("Vui lòng nhập ngân sách tối đa hợp lệ (tối thiểu 1đ).", "error");
      $("v-budget")?.focus();
      return false;
    }

    return true;
  }

  function initStepper() {
    const tabs = [
      $("v-step-tab-1"),
      $("v-step-tab-2"),
      $("v-step-tab-3"),
    ];

    tabs.forEach((tab, i) => {
      if (tab) tab.onclick = () => goToStep(i);
    });

    const next2 = $("v-next-to-step-2");
    if (next2)
      next2.onclick = () => {
        goToStep(1);
        $("v-geo-search")?.focus();
      };

    const next3 = $("v-next-to-step-3");
    if (next3)
      next3.onclick = () => {
        goToStep(2);
        $("v-start")?.focus();
      };

    const prev1 = $("v-prev-to-step-1");
    if (prev1)
      prev1.onclick = () => {
        goToStep(0);
        $("v-name")?.focus();
      };

    const prev2 = $("v-prev-to-step-2");
    if (prev2)
      prev2.onclick = () => {
        goToStep(1);
        $("v-geo-search")?.focus();
      };
  }

  function edit(row = null) {
    selected = row;
    if ($("v-link-image")) $("v-link-image").value = "";
    if ($("v-link-image-file")) $("v-link-image-file").value = "";
    if ($("v-link-slug")) $("v-link-slug").value = "";
    if ($("voucher-link-save")) $("voucher-link-save").textContent = "+ Tạo link chia sẻ";
    const p = row?.payload;
    rules = p ? structuredClone(p.rules) : [baseRule()];
    excluded = new Set(p?.exclusions || []);
    const defaultDates = getDefaultDates();
    const values = {
      "v-code": p?.code || "",
      "v-name": p?.name || "",
      "v-label": p?.label || "Ưu đãi khu vực",
      "v-program-type": p?.program_type || "cash_discount",
      "v-gift-name": p?.physical_gift?.name || "",
      "v-gift-market-val": p?.physical_gift?.market_value_vnd || "",
      "v-gift-image-url": p?.physical_gift?.image_url || "",
      "v-gift-delivery": p?.physical_gift?.delivery_type || "installation",
      "v-gift-condition": p?.physical_gift?.condition_note || "",
      "v-popup-eyebrow": p?.popup_config?.eyebrow || "",
      "v-popup-title": p?.popup_config?.title || "",
      "v-popup-subtitle": p?.popup_config?.subtitle || "",
      "v-popup-hero-prefix": p?.popup_config?.hero_prefix || "",
      "v-popup-hero-highlight": p?.popup_config?.hero_highlight || "",
      "v-popup-hero-sub": p?.popup_config?.hero_sub || "",
      "v-popup-cta": p?.popup_config?.cta_text || "",
      "v-popup-reassurance": p?.popup_config?.reassurance_text || "",
      "v-popup-dismiss": p?.popup_config?.dismiss_text || "",
      "v-popup-urgency": p?.popup_config?.urgency_badge || "",
      "v-terms":
        p?.terms ||
        "Áp dụng cho khách hàng hoàn tất đăng ký và nghiệm thu lắp đặt mới. Không quy đổi thành tiền mặt.",
      "v-quota": p?.quota ?? 50,
      "v-budget": p?.budget_vnd ?? 10000000,
      "v-per-contact": p?.per_contact_limit || 1,
      "v-hold": p?.hold_hours || 48,
      "v-redeem": p?.redeem_at || "installed",
    };
    for (const [id, v] of Object.entries(values)) {
      const fieldEl = $(id);
      if (fieldEl) fieldEl.value = v;
    }
    for (const id of ["start", "end"]) {
      const dtEl = $("v-" + id);
      if (dtEl)
        dtEl.value = p
          ? window.PageFPTDates.toISO(
              window.PageFPTDates.format(p[id]),
              "datetime-local",
            )
          : id === "start"
            ? defaultDates.startISO
            : defaultDates.endISO;
    }
    const stackableEl = $("v-stackable");
    if (stackableEl) stackableEl.checked = p?.stackable || false;

    renderChecks($("v-plans"), plans, new Set(p?.plan_ids || []), () =>
      preview(),
    );
    renderChecks(
      $("v-services"),
      [
        { id: "internet", name: "Internet" },
        { id: "combo", name: "Combo" },
        { id: "camera", name: "Camera" },
        { id: "business", name: "Doanh nghiệp" },
        { id: "play", name: "FPT Play" },
      ],
      new Set(p?.services || []),
      () => preview(),
    );
    $("v-months")
      ?.querySelectorAll("input")
      .forEach(
        (i) =>
          (i.checked = p ? p.billing_months.includes(Number(i.value)) : true),
      );
    if ($("v-geo-search")) $("v-geo-search").value = "";
    if ($("v-exclude-search")) $("v-exclude-search").value = "";
    $("voucher-editor").hidden = false;
    $("voucher-editor-title").textContent = p
      ? "Sửa " + p.code
      : "Tạo voucher mới";
    renderRules();
    renderGeos();
    renderLinks();
    savedForm = JSON.stringify(formData());
    preview();
    syncButtons();
    $("v-code")?.focus();
  }

  function openCloneDialog(row) {
    cloningRow = row;
    const dialog = $("voucher-clone-dialog");
    const codeInput = $("v-clone-code");
    if (!dialog || !codeInput) return;
    codeInput.value = ((row.code || "") + "-COPY").toUpperCase().slice(0, 40);
    dialog.showModal();
    codeInput.focus();
  }

  function table() {
    const q = $("voucher-search")?.value.toLocaleLowerCase("vi") || "",
      statusFilter = $("voucher-filter-status")?.value || "all",
      now = new Date();

    const matchesFilter = (r) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "draft") return r.status === "draft";
      if (statusFilter === "paused") return r.status === "paused";
      if (statusFilter === "published") return r.status === "published";
      const endStr = r.published_payload?.end || r.payload.end;
      const startStr = r.published_payload?.start || r.payload.start;
      const endDate = endStr ? new Date(endStr) : null;
      const startDate = startStr ? new Date(startStr) : null;
      if (statusFilter === "active") {
        return (
          r.status === "published" &&
          (!endDate || endDate > now) &&
          (!startDate || startDate <= now)
        );
      }
      if (statusFilter === "upcoming") {
        return r.status === "published" && startDate && startDate > now;
      }
      if (statusFilter === "expired") {
        return r.status === "published" && endDate && endDate <= now;
      }
      return true;
    };

    const visible = rows.filter(
      (r) =>
        (r.code + " " + r.payload.name).toLocaleLowerCase("vi").includes(q) &&
        matchesFilter(r),
    );

    const countBadge = $("voucher-loaded-count");
    if (countBadge) {
      countBadge.textContent = `Hiển thị ${visible.length}/${rows.length} mục đã tải`;
    }

    visible.sort(
      (a, b) =>
        String(
          sort === "name"
            ? a.payload.name
            : sort === "end"
              ? a.payload.end
              : a[sort],
        ).localeCompare(
          String(
            sort === "name"
              ? b.payload.name
              : sort === "end"
                ? b.payload.end
                : b[sort],
          ),
          "vi",
        ) * direction,
    );

    const tbody = $("voucher-table")?.querySelector("tbody");
    if (!tbody) return;
    tbody.replaceChildren();

    for (const row of visible) {
      const tr = el("tr"),
        cb = el("input");
      cb.type = "checkbox";
      cb.checked = checks.has(row.id);
      cb.setAttribute("aria-label", "Chọn " + row.code);
      cb.onchange = () =>
        cb.checked ? checks.add(row.id) : checks.delete(row.id);
      const td = el("td");
      td.append(cb);

      // Nhận diện phân loại voucher để gắn màu sắc
      const p = row.published_payload || row.payload || {};
      let typeClass = "voucher-type-discount";
      if (p.discount_type === "free_month" || p.free_months) {
        typeClass = "voucher-type-free-month";
      } else if (p.discount_type === "gift" || p.gift_name) {
        typeClass = "voucher-type-gift";
      }
      tr.className = "voucher-card-item " + typeClass + " voucher-status-" + row.status;

      let statusText =
        { draft: "Bản nháp", published: "Đang công bố", paused: "Tạm dừng" }[
          row.status
        ] || row.status;

      if (row.status === "published") {
        const endD = (row.published_payload?.end || row.payload.end)
          ? new Date(row.published_payload?.end || row.payload.end)
          : null;
        const startD = (row.published_payload?.start || row.payload.start)
          ? new Date(row.published_payload?.start || row.payload.start)
          : null;
        if (endD && endD <= now) statusText = "Đang công bố (Hết hạn)";
        else if (startD && startD > now) statusText = "Đang công bố (Sắp tới)";
      }

      tr.append(
        td,
        el("td", "🏷️ " + row.code),
        el("td", row.payload.name),
        el("td", "● " + statusText),
        el("td", "📅 " + date(row.published_payload?.end || row.payload.end)),
      );

      const action = el("td"),
        btnGroup = el("div");
      btnGroup.style.display = "flex";
      btnGroup.style.gap = "6px";
      btnGroup.style.flexWrap = "wrap";

      const button = el("button", "Thiết lập", "btn-action-detail");
      button.type = "button";
      button.onclick = () => edit(row);

      const cloneBtn = el("button", "Nhân bản", "btn-action-detail");
      cloneBtn.type = "button";
      cloneBtn.title = "Tạo bản nháp mới kế thừa cấu hình từ voucher này";
      cloneBtn.onclick = () => openCloneDialog(row);

      btnGroup.append(button, cloneBtn);
      action.append(btnGroup);
      tr.append(action);
      tbody.append(tr);
    }

    if (!visible.length) {
      const tr = el("tr"),
        td = el("td", "Chưa có voucher phù hợp. Tạo voucher để bắt đầu.");
      td.colSpan = 6;
      td.style.textAlign = "center";
      td.style.padding = "24px";
      tr.append(td);
      tbody.append(tr);
    }

    const checkAll = $("voucher-check-all");
    if (checkAll) {
      checkAll.checked =
        visible.length > 0 && visible.every((r) => checks.has(r.id));
      checkAll.onchange = (e) => {
        visible.forEach((r) =>
          e.target.checked ? checks.add(r.id) : checks.delete(r.id),
        );
        table();
      };
    }
  }

  function renderLinks() {
    updateSharePreview();
    const box = $("voucher-links");
    if (!box) return;
    box.replaceChildren();
    for (const link of links.filter((l) => l.voucher_id === selected?.id)) {
      const line = el("div", "", "voucher-link-item");
      line.append(
        el("code", location.origin + "/s/" + link.slug),
        el("span", link.channel + " · " + (link.active ? "Đang bật" : "Đã tắt")),
      );
      const published = selected?.published_payload;
      const ready = link.active && selected?.status === "published" &&
        Date.parse(published?.start) <= Date.now() && Date.now() < Date.parse(published?.end);
      const readiness = el("p", ready ? "Khách tới trang đích → xem ưu đãi → gửi form." :
        "Voucher chưa công bố hoặc ngoài lịch hiệu lực. Khách vẫn tới trang đích và có thể gửi tư vấn, nhưng chưa được áp dụng ưu đãi.",
        "voucher-link-readiness");
      readiness.setAttribute("role", "status");
      line.append(readiness);
      const copy = el("button", "Sao chép link", "btn-action-detail");
      copy.type = "button";
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(
            location.origin + "/s/" + link.slug,
          );
          status("Đã sao chép link /s/" + link.slug);
        } catch (_) {
          status("Hãy chọn và sao chép địa chỉ link trên màn hình.");
        }
      };
      const copyMsg = el("button", "📋 Copy tin nhắn", "btn-action-detail");
      copyMsg.type = "button";
      copyMsg.disabled = !ready;
      copyMsg.title = "Sao chép mẫu tin nhắn marketing gửi Zalo / Messenger cho khách";
      copyMsg.onclick = async () => {
        const url = location.origin + "/s/" + link.slug;
        const vName = selected?.payload?.name || selected?.name || "Ưu đãi đặc quyền";
        const vCode = selected?.code || "";
        const shareMsg = `🎁 ƯU ĐÃI ĐẶC QUYỀN TỪ FPT TELECOM!\n` +
          `Nhận ngay ưu đãi "${vName}" (Mã: ${vCode}) khi đăng ký trực tuyến hôm nay.\n` +
          `👉 Nhấp vào link để nhận ưu đãi và giữ suất:\n${url}\n` +
          `(Số lượng suất ưu đãi có hạn, áp dụng theo địa bàn lắp đặt).`;
        try {
          await navigator.clipboard.writeText(shareMsg);
          status("Đã sao chép mẫu tin nhắn marketing!");
        } catch (_) {
          status("Chưa thể sao chép tự động, vui lòng chọn văn bản.");
        }
      };
      const qr = el("a", "Tải QR", "btn-action-detail");
      qr.href = "/api/v1/admin/vouchers/links/" + link.slug + "/qr";
      qr.download = link.slug + ".svg";
      const toggle = el(
        "button",
        link.active ? "Tắt link" : "Bật link",
        "btn-action-detail",
      );
      toggle.type = "button";
      toggle.onclick = () =>
        job(async () => {
          await api("/" + selected.id + "/links", "POST", {
            slug: link.slug,
            target: link.target,
            channel: link.channel,
            employee_id: link.employee_id,
            active: !link.active,
            preview_image_url: link.preview_image_url || "",
          });
          await load();
          renderLinks();
          status("Đã cập nhật link");
        });
      const change = el("button", "Sửa", "btn-action-detail");
      change.type = "button";
      change.onclick = () => {
        if ($("v-link-slug")) $("v-link-slug").value = link.slug;
        if ($("v-link-target")) $("v-link-target").value = link.target;
        if ($("v-link-channel")) $("v-link-channel").value = link.channel;
        if ($("v-link-employee")) $("v-link-employee").value = link.employee_id || "";
        if ($("v-link-image")) $("v-link-image").value = link.preview_image_url || "";
        updateSharePreview();
        $("voucher-link-save").textContent = "Lưu thay đổi link";
        $("v-link-image")?.scrollIntoView({block:"center",behavior:"smooth"});
        $("v-link-image")?.focus({preventScroll:true});
      };
      line.append(copy, copyMsg, qr, toggle, change);
      box.append(line);
    }
  }

  async function load(more = false) {
    const data = await api(more && cursor ? "?before=" + cursor : "");
    rows = more ? [...rows, ...data.items] : data.items;
    links = data.links;
    cursor = data.items.at(-1)?.id || null;
    const moreBtn = $("voucher-more");
    if (moreBtn) moreBtn.hidden = data.items.length < 50;
    table();
  }

  async function report() {
    const d = await api("/report");
    lastReportData = d;
    const box = $("voucher-kpis");
    if (box) {
      box.replaceChildren();
      const kpiDefs = [
        ["requested", "Yêu cầu ưu đãi", "Số hồ sơ khách có yêu cầu voucher; không tính lượt xem trang."],
        ["eligible", "Đã giữ suất", "Số hồ sơ từng được giữ suất, gồm cả suất đã dùng, hết hạn hoặc đã trả."],
        ["held", "Đang giữ suất", "Số suất ưu đãi đang được nhân viên tạm giữ trong thời hạn."],
        ["redeemed", "Đã dùng", "Số suất đã được nghiệm thu hoàn tất sử dụng."],
        ["installed", "Đã lắp đặt", "Số khách yêu cầu voucher đã triển khai lắp đặt thành công."],
        ["cost_vnd", "Chi phí thực tế", "Tổng tiền giảm cước + giá vốn quà tặng từ các voucher đã dùng."],
      ];

      for (const [key, title, hint] of kpiDefs) {
        const card = el("div", "", "voucher-kpi");
        const top = el("div", "", "voucher-kpi-top");
        const titleSpan = el("span", title, "voucher-kpi-title");
        const infoBtn = el("button", "ⓘ", "voucher-kpi-info-btn");
        infoBtn.type = "button";
        infoBtn.title = hint;
        infoBtn.setAttribute("aria-label", "Định nghĩa " + title);
        top.append(titleSpan, infoBtn);

        const valStrong = el(
          "strong",
          key === "cost_vnd" ? money(d.totals[key]) : String(d.totals[key]),
        );
        const tooltip = el("div", hint, "voucher-kpi-tooltip");
        card.append(top, valStrong, tooltip);
        box.append(card);
      }
    }

    const root = $("voucher-report");
    if (root) {
      root.replaceChildren();
      for (const [list, title] of [
        ["campaigns", "Chiến dịch"],
        ["channels", "Kênh & nhân viên"],
        ["regions", "Khu vực"],
      ]) {
        root.append(el("h3", title));
        const max = Math.max(1, ...d[list].map((x) => x.redeemed));
        for (const x of d[list]) {
          const row = el("div", "", "voucher-report-row"),
            label =
              x.name ||
              x.channel ||
              (x.rule_key === "pending_address"
                ? "Chờ xác nhận địa bàn"
                : rows
                    .find((r) => r.id === x.voucher_id)
                    ?.published_payload?.rules.find((r) => r.key === x.rule_key)
                    ?.region_name || x.rule_key);
          const names = el("div");
          names.append(
            el("strong", label),
            el(
              "p",
              `Yêu cầu ${x.requested} · Đã giữ suất ${x.eligible} · Đang giữ ${x.held} · Đã dùng ${x.redeemed} · Đã lắp ${x.installed} · ${money(x.cost_vnd)}${x.employee_id ? " · " + (employees.find((e) => e.id === x.employee_id)?.name || x.employee_id) : ""}`,
            ),
          );
          const bar = el("progress");
          bar.max = max;
          bar.value = x.redeemed;
          bar.setAttribute(
            "aria-label",
            label + ": " + x.redeemed + " voucher đã dùng",
          );
          row.append(names, bar);
          root.append(row);
        }
        if (!d[list].length) root.append(el("p", "Chưa có kết quả."));
      }
    }
  }

  function exportReportCsv() {
    if (!lastReportData) return status("Chưa có dữ liệu báo cáo để xuất.");
    const lines = [
      "Loại dữ liệu,Tên/Kênh/Khu vực,Yêu cầu,Đã giữ suất,Đang giữ,Đã dùng,Đã lắp đặt,Chi phí (VND)",
    ];
    const cell = value => {
      if (typeof value === "number") return String(value);
      let text = String(value ?? "");
      if (/^\s*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const row = (kind, name, item) => [kind, name, item.requested, item.eligible,
      item.held, item.redeemed, item.installed, item.cost_vnd].map(cell).join(",");
    for (const item of lastReportData.campaigns || []) {
      lines.push(
        row("Chiến dịch", item.name || item.code || "", item),
      );
    }
    for (const item of lastReportData.channels || []) {
      const emp = item.employee_id
        ? employees.find((e) => e.id === item.employee_id)?.name || item.employee_id
        : "";
      lines.push(
        row("Kênh / Nhân viên", (item.channel || "") + (emp ? " (" + emp + ")" : ""), item),
      );
    }
    for (const item of lastReportData.regions || []) {
      lines.push(
        row("Khu vực / Quy tắc", item.rule_key || "", item),
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voucher_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    status("Đã xuất tệp CSV báo cáo thành công.");
  }

  async function loadInventory() {
    inventory = (await api("/inventory")).items;
    const box = $("voucher-inventory-list");
    if (!box) return;
    box.replaceChildren();
    for (const row of inventory) {
      box.append(
        el(
          "p",
          (products.find((p) => p.id === row.product_id)?.name ||
            row.product_id) +
            ": " +
            row.stock +
            " sản phẩm tồn kho · Giá vốn " +
            money(row.cost_vnd),
        ),
      );
    }
    inventorySelection();
  }

  function inventorySelection() {
    const row = inventory.find(
      (i) => i.product_id === $("v-inventory-product")?.value,
    );
    if ($("v-inventory-stock")) $("v-inventory-stock").value = row?.stock ?? "";
    if ($("v-inventory-cost")) $("v-inventory-cost").value = row?.cost_vnd ?? "";
  }

  // Bind Event Listeners
  const newBtn = $("voucher-new");
  if (newBtn) newBtn.onclick = () => edit();

  const closeBtn = $("voucher-close");
  if (closeBtn) {
    closeBtn.onclick = () => {
      $("voucher-editor").hidden = true;
    };
  }

  const vForm = $("voucher-form");
  if (vForm) {
    vForm.addEventListener("input", preview);
  }

  const progTypeSelect = $("v-program-type");
  if (progTypeSelect) {
    progTypeSelect.addEventListener("change", () => {
      const isPhys = progTypeSelect.value === "physical_gift" || progTypeSelect.value === "combo_gift_cash";
      const giftSec = $("v-gift-section");
      if (giftSec) giftSec.hidden = !isPhys;
      preview();
    });
  }

  // Preset Gift Buttons
  document.querySelectorAll(".btn-preset-gift").forEach((btn) => {
    btn.onclick = () => {
      if ($("v-gift-name")) $("v-gift-name").value = btn.dataset.giftName || "";
      if ($("v-gift-market-val")) $("v-gift-market-val").value = btn.dataset.giftVal || "";
      if ($("v-gift-image-url")) $("v-gift-image-url").value = btn.dataset.giftImg || "";
      preview();
    };
  });

  // Replay animation on smartphone simulator
  const replayAnimBtn = $("v-preview-replay-anim");
  if (replayAnimBtn) {
    replayAnimBtn.onclick = () => {
      const intro = $("preview-gift-intro");
      const panel = $("preview-ticket-panel");
      if (!intro || !panel) return;

      intro.style.display = "flex";
      intro.classList.remove("is-opening");
      panel.classList.remove("is-revealed");
      panel.style.display = "none";

      setTimeout(() => {
        intro.classList.add("is-opening");
        setTimeout(() => {
          panel.style.display = "block";
          panel.classList.add("is-revealed");
          setTimeout(() => {
            intro.style.display = "none";
          }, 350);
        }, 300);
      }, 500);
    };
  }

  // Toggle view mode on smartphone simulator (Gift box vs Ticket)
  const toggleModeBtn = $("v-preview-toggle-mode");
  if (toggleModeBtn) {
    toggleModeBtn.onclick = () => {
      const intro = $("preview-gift-intro");
      const panel = $("preview-ticket-panel");
      if (!intro || !panel) return;
      if (intro.style.display === "none") {
        intro.style.display = "flex";
        intro.classList.remove("is-opening");
        panel.style.display = "none";
      } else {
        intro.style.display = "none";
        panel.style.display = "block";
        panel.classList.add("is-revealed");
      }
    };
  }

  const previewGiftBox = $("preview-gift-box");
  if (previewGiftBox) {
    previewGiftBox.onclick = () => {
      if (replayAnimBtn) replayAnimBtn.click();
    };
  }

  const vCode = $("v-code");
  if (vCode) {
    vCode.addEventListener("input", () => {
      vCode.value = vCode.value.toUpperCase();
    });
  }

  const defaultRuleBtn = $("v-default-rule");
  if (defaultRuleBtn) {
    defaultRuleBtn.onclick = () => {
      if (!rules.some((r) => !r.region_id)) rules.unshift(newRule());
      renderRules();
      preview();
    };
  }

  const geoSearch = $("v-geo-search");
  if (geoSearch) geoSearch.oninput = renderGeos;

  const excludeSearch = $("v-exclude-search");
  if (excludeSearch) excludeSearch.oninput = renderGeos;

  const vSearch = $("voucher-search");
  if (vSearch) vSearch.oninput = table;

  const vStatusFilter = $("voucher-filter-status");
  if (vStatusFilter) vStatusFilter.onchange = table;

  const invProduct = $("v-inventory-product");
  if (invProduct) invProduct.onchange = inventorySelection;

  const exportCsvBtn = $("voucher-report-export-csv");
  if (exportCsvBtn) exportCsvBtn.onclick = exportReportCsv;

  // Verify target URL button
  const verifyTargetBtn = $("v-link-verify-target");
  if (verifyTargetBtn) {
    let targetCheckSequence = 0;
    verifyTargetBtn.onclick = async () => {
      const sequence = ++targetCheckSequence;
      const targetInput = $("v-link-target");
      const statusEl = $("v-link-target-status");
      const targetVal = targetInput?.value.trim() || "";
      if (!statusEl) return;
      if (!/^\/(?:[a-z0-9][a-z0-9-]{0,99})?$/.test(targetVal)) {
        statusEl.textContent = "⚠️ Nhập / hoặc /ten-landing, không kèm tên miền hay đường dẫn phụ.";
        statusEl.style.color = "#dc2626";
        return;
      }
      if (["/", "/khuyen-mai", "/do-toc-do"].includes(targetVal)) {
        statusEl.textContent = "✅ Trang đích công khai hợp lệ.";
        statusEl.style.color = "#16a34a";
        return;
      }
      const slug = targetVal.slice(1);
      statusEl.textContent = "Đang kiểm tra trang đích " + slug + "…";
      statusEl.style.color = "#64748b";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch("/api/v1/pages/" + encodeURIComponent(slug), {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (sequence !== targetCheckSequence || targetInput.value.trim() !== targetVal) return;
        if (res.ok) {
          statusEl.textContent = "✅ Trang đích công khai hợp lệ (tìm thấy trang).";
          statusEl.style.color = "#16a34a";
        } else {
          statusEl.textContent = "⚠️ Trang " + slug + " chưa được công bố hoặc đã ngừng.";
          statusEl.style.color = "#d97706";
        }
      } catch (_) {
        if (sequence !== targetCheckSequence || targetInput.value.trim() !== targetVal) return;
        statusEl.textContent = "ℹ️ Chưa thể xác minh trang. Thử lại khi kết nối ổn định.";
        statusEl.style.color = "#64748b";
      } finally {
        clearTimeout(timer);
      }
    };
  }

  // Clone Form submit
  const cloneForm = $("voucher-clone-form");
  if (cloneForm) {
    cloneForm.onsubmit = (e) => {
      e.preventDefault();
      if (!cloningRow) return;
      const newCode = $("v-clone-code")?.value.trim().toUpperCase();
      if (!newCode) return;
      $("voucher-clone-dialog")?.close();
      job(async () => {
        const src = cloningRow.published_payload || cloningRow.payload;
        const newPayload = {
          code: newCode,
          name: (src.name || "") + " (Bản sao)",
          label: src.label || "Ưu đãi khu vực",
          terms: src.terms || "",
          start: src.start,
          end: src.end,
          quota: src.quota || 10,
          budget_vnd: src.budget_vnd || 1000000,
          per_contact_limit: src.per_contact_limit || 1,
          hold_hours: src.hold_hours || 48,
          redeem_at: src.redeem_at || "installed",
          stackable: Boolean(src.stackable),
          plan_ids: src.plan_ids ? [...src.plan_ids] : [],
          services: src.services ? [...src.services] : [],
          billing_months: src.billing_months
            ? [...src.billing_months]
            : [1, 6, 12],
          rules: src.rules ? structuredClone(src.rules) : [baseRule()],
          exclusions: src.exclusions ? [...src.exclusions] : [],
        };
        const created = await api("", "POST", newPayload);
        await load();
        edit(created);
        status("Đã nhân bản voucher '" + newCode + "' thành công.");
      });
    };
  }

  // Mobile preview toggle
  const previewToggleMobile = $("voucher-preview-toggle-mobile");
  if (previewToggleMobile) {
    previewToggleMobile.onclick = () => {
      const previewContainer = $("voucher-preview-container");
      if (!previewContainer) return;
      const isVisible =
        previewContainer.style.display !== "none" && !previewContainer.hidden;
      if (isVisible) {
        previewContainer.style.display = "none";
        previewToggleMobile.setAttribute("aria-expanded", "false");
        previewToggleMobile.textContent = "👁 Xem trước bản nháp";
      } else {
        previewContainer.style.display = "block";
        previewContainer.hidden = false;
        previewToggleMobile.setAttribute("aria-expanded", "true");
        previewToggleMobile.textContent = "✕ Đóng xem trước";
        previewContainer.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
  }

  async function saveDraftInternal() {
    if (!validateVoucherForm()) {
      return null;
    }
    const body = formData();
    showNotice("⏳ Đang lưu bản nháp voucher...", "info");
    const row = await api(
      selected ? "/" + selected.id : "",
      selected ? "PUT" : "POST",
      {
        ...body,
        ...(selected ? { expected_version: selected.version } : {}),
      },
    );
    selected = row;
    await load();
    edit(row);
    showNotice("✅ Đã lưu bản nháp thành công! Có thể tạo link chia sẻ bên dưới.", "success");
    return row;
  }

  // Submit Voucher Form (Save draft)
  if (vForm) {
    vForm.onsubmit = (e) => {
      e.preventDefault();
      job(async () => {
        await saveDraftInternal();
      });
    };
  }

  // Actions (Publish / Pause)
  for (const action of ["publish", "pause"]) {
    const actBtn = $("voucher-" + action);
    if (actBtn) {
      actBtn.onclick = () =>
        job(async () => {
          if (!selected) return;
          const row = await api("/" + selected.id + "/" + action, "POST", {
            expected_version: selected.version,
          });
          selected = row;
          await load();
          edit(row);
          await report();
          status(action === "publish" ? "Đã công bố" : "Đã tạm dừng");
        });
    }
  }

  // Delete Draft
  const deleteBtn = $("voucher-delete");
  if (deleteBtn) {
    deleteBtn.onclick = () =>
      job(async () => {
        if (!selected || !confirm("Xóa voucher chưa công bố và chưa có lịch sử?"))
          return;
        await api(
          "/" + selected.id + "?expected_version=" + selected.version,
          "DELETE",
        );
        selected = null;
        $("voucher-editor").hidden = true;
        await load();
        status("Đã xóa voucher");
      });
  }

  function updateSharePreview() {
    const raw = $("v-link-image")?.value.trim() || "";
    let image = "/static/images/device-internet-3d.webp";
    try {
      const parsed = new URL(raw, location.origin);
      if(raw && (parsed.protocol === "https:" || raw.startsWith("/static/")) && !parsed.username && !parsed.password) image = parsed.href;
    } catch (_) {}
    const img = $("v-link-preview-image");
    if(img) {img.hidden=false;img.src=image;}
    const published = selected?.published_payload;
    const live = selected?.status === "published" && Date.parse(published?.start)<=Date.now() && Date.now()<Date.parse(published?.end);
    if($("v-link-preview-title")) $("v-link-preview-title").textContent = live ? published.name : "Tư vấn lắp mạng FPT — Gói cước theo khu vực";
    if($("v-link-preview-description")) $("v-link-preview-description").textContent = live ? (published.terms||"").slice(0,300) : "Chọn gói Internet, truyền hình và camera theo nhu cầu. Liên hệ để được tư vấn giá và điều kiện áp dụng.";
    if($("v-link-preview-domain")) $("v-link-preview-domain").textContent = location.host;
  }
  $("v-link-image")?.addEventListener("input",updateSharePreview);
  $("v-link-image-clear")?.addEventListener("click",()=>{
    $("v-link-image").value="";
    $("v-link-image-file").value="";
    $("v-link-image-help").textContent="Đang dùng ảnh mặc định. Lưu link để áp dụng.";
    updateSharePreview();
  });
  $("v-link-preview-image")?.addEventListener("error",()=>{
    $("v-link-preview-image").hidden=true;
    $("v-link-image-help").textContent="Chưa tải được ảnh xem trước. Kiểm tra URL ảnh có truy cập công khai được không.";
  });
  $("v-link-image-file")?.addEventListener("change",event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    job(async()=>{
      $("v-link-image-help").textContent="Đang tải và kiểm tra ảnh…";
      try {
        const asset=await window.adminUploadImage(file);
        $("v-link-image").value=asset.payload.url;
        updateSharePreview();
        $("v-link-image-help").textContent="Đã tải ảnh. Lưu link để áp dụng ảnh mới.";
      } catch(error) {
        $("v-link-image-help").textContent=error.message;
        throw error;
      } finally {event.target.value="";}
    });
  });
  updateSharePreview();

  // Submit Link Form
  const linkForm = $("voucher-link-form");
  if (linkForm) {
    linkForm.onsubmit = (e) => {
      e.preventDefault();
      job(async () => {
        let slug = $("v-link-slug")?.value.trim().toLowerCase() || "";
        slug = slug.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
        if (!slug || slug.length < 3 || slug.length > 50) {
          showNotice(
            "Mã đường dẫn rút gọn cần từ 3 đến 50 ký tự (chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang).",
            "error",
          );
          $("v-link-slug")?.focus();
          return;
        }

        // Saving the first draft refreshes the voucher editor; freeze link fields first.
        const linkDraft = {
          slug,
          target: $("v-link-target")?.value.trim() || "/",
          channel: $("v-link-channel")?.value || "zalo",
          employee_id: $("v-link-employee")?.value || null,
          active: links.find(link=>link.slug===slug && link.voucher_id===selected?.id)?.active ?? true,
          preview_image_url: $("v-link-image")?.value.trim() || "",
        };
        if (!selected) {
          showNotice("Đang lưu bản nháp voucher trước khi tạo link chia sẻ...", "info");
          const savedRow = await saveDraftInternal();
          if (!savedRow) return;
        }

        $("v-link-slug").value=linkDraft.slug;
        $("v-link-image").value=linkDraft.preview_image_url;
        await api("/" + selected.id + "/links", "POST", linkDraft);
        await load();
        renderLinks();
        showNotice(
          `Đã lưu link /s/${slug} và ảnh xem trước.`,
          "success",
        );
      });
    };
  }

  // Auto clean slug input
  const slugInput = $("v-link-slug");
  if (slugInput) {
    slugInput.addEventListener("input", () => {
      slugInput.value = slugInput.value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-");
    });
  }

  // Submit Inventory Form
  const invForm = $("voucher-inventory-form");
  if (invForm) {
    invForm.onsubmit = (e) => {
      e.preventDefault();
      job(async () => {
        const id = $("v-inventory-product").value;
        await api("/inventory", "PUT", {
          product_id: id,
          stock: Number($("v-inventory-stock").value),
          cost_vnd: Number($("v-inventory-cost").value),
          expected_version:
            inventory.find((x) => x.product_id === id)?.version || 0,
        });
        await loadInventory();
        status("Đã lưu tồn kho");
      });
    };
  }

  // Bulk Pause
  const bulkPauseBtn = $("voucher-bulk-pause");
  if (bulkPauseBtn) {
    bulkPauseBtn.onclick = () =>
      job(async () => {
        let ok = 0;
        const failed = [];
        for (const row of rows.filter(
          (x) => checks.has(x.id) && x.status === "published",
        )) {
          try {
            await api("/" + row.id + "/pause", "POST", {
              expected_version: row.version,
            });
            ok++;
            checks.delete(row.id);
          } catch (e) {
            failed.push(row.code + ": " + e.message);
          }
        }
        await load();
        status(
          "Đã tạm dừng " +
            ok +
            " voucher." +
            (failed.length ? " " + failed.join(" · ") : ""),
        );
      });
  }

  // Refresh
  const refreshBtn = $("voucher-refresh");
  if (refreshBtn) {
    refreshBtn.onclick = () =>
      job(async () => {
        await load();
        await report();
        status("Đã làm mới");
      });
  }

  // More
  const moreBtn = $("voucher-more");
  if (moreBtn) moreBtn.onclick = () => job(() => load(true));

  // Table Sorting
  document.querySelectorAll("[data-v-sort]").forEach((b) => {
    b.onclick = () => {
      direction = sort === b.dataset.vSort ? -direction : 1;
      sort = b.dataset.vSort;
      document.querySelectorAll("[data-v-sort]").forEach((x) =>
        x
          .closest("th")
          .setAttribute(
            "aria-sort",
            x === b ? (direction === 1 ? "ascending" : "descending") : "none",
          ),
      );
      table();
    };
  });

  // Initialization
  initStepper();

  job(async () => {
    const results = await Promise.allSettled([
      fetch("/api/v1/catalog").then((r) => r.json()),
      fetch("/api/v1/accessories").then((r) => r.json()),
      api("/options"),
      api("/employees"),
    ]);
    plans = results[0].status === "fulfilled" ? results[0].value.items : [];
    products = results[1].status === "fulfilled" ? results[1].value.items : [];
    if (results[2].status === "fulfilled")
      geos = results[2].value.provinces.flatMap((p) => [
        { id: p.id, name: p.name, level: "province" },
        ...p.wards.map((w) => ({
          id: w.id,
          name: p.name + " / " + w.name,
          level: "ward",
        })),
      ]);
    else geoFailure = true;
    if (results[3].status === "fulfilled") employees = results[3].value.items;

    selectOptions(
      $("v-link-employee"),
      [
        ["", "Không gắn nhân viên"],
        ...employees.map((e) => [
          e.id,
          e.name || "Nhân viên " + e.id.slice(0, 8),
        ]),
      ],
      "",
    );

    selectOptions(
      $("v-inventory-product"),
      products
        .filter((p) => p.billing_mode === "one_time")
        .map((p) => [p.id, p.name]),
      products.find((p) => p.billing_mode === "one_time")?.id,
    );

    await load();
    await report();
    await loadInventory();
    status(
      geoFailure
        ? "Danh sách địa bàn chưa tải được. Làm mới trang để chọn địa bàn."
        : "Đã tải voucher",
    );
  });
})();
