/* Published period previews change immediately; the selected quote is confirmed on the server. */
(() => {
  let products = [];
  try {
    products = JSON.parse(
      document.getElementById("published-accessories-data")?.textContent ||
        "[]",
    );
  } catch (_) {}
  const devices = new Map(
    products
      .filter((p) => p.price_vnd !== null && p.price_vnd !== undefined)
      .map((p) => [p.id, p]),
  );
  let latestRevision = 0;
  const selected = new Map(),
    months = new Map(),
    quotes = new Map(),
    options = new Map(),
    generation = new Map();
  const money = (v) => new Intl.NumberFormat("vi-VN").format(v) + "đ";
  const ids = (plan) => [...(selected.get(plan) || new Set())].sort();
  const term = (plan) => months.get(plan) || 6;
  const valid = (q) =>
    q?.status === "confirmed" &&
    (q.revision || 0) >= latestRevision &&
    (!q.expires_at || Date.parse(q.expires_at) > Date.now());
  function parts(plan) {
    let once = 0,
      monthly = 0;
    for (const id of ids(plan)) {
      const p = devices.get(id);
      if (p?.billing_mode === "monthly") monthly += p.price_vnd;
      else if (p) once += p.price_vnd;
    }
    return { once, monthly };
  }
  function current(plan) {
    const validSelection = (q) =>
      valid(q) && (!q.voucher ||
        JSON.stringify([...(q.accessory_ids || [])].sort()) === JSON.stringify(ids(plan)));
    const q = quotes.get(plan);
    if (q?.status === "not_available") return null;
    if (q?.billing_months === term(plan) && validSelection(q)) return q;
    const preview = options
      .get(plan)
      ?.find((o) => o.billing_months === term(plan));
    return validSelection(preview) ? preview : null;
  }
  function total(plan, q = current(plan)) {
    if (!q) return null;
    const a = parts(plan);
    return (
      q.initial_total_vnd -
      (q.accessory_once_vnd || 0) -
      (q.accessory_monthly_vnd || 0) * term(plan) +
      a.once +
      a.monthly * term(plan)
    );
  }
  function display(plan, q = current(plan)) {
    if (!q) return null;
    const monthly = parts(plan).monthly;
    return q.display_monthly_vnd == null ? q.monthly_vnd + monthly
      : q.display_monthly_vnd + Math.round(monthly * term(plan) / (q.service_months || term(plan)));
  }
  function render(plan) {
    const a = parts(plan),
      q = current(plan),
      amount = q ? money(display(plan, q)) : "Cần tư vấn";
    const t = total(plan, q);
    document.querySelectorAll("[data-quote-plan]").forEach((el) => {
      if (el.dataset.quotePlan === plan) el.textContent = amount;
    });
    document.querySelectorAll("[data-quote-note]").forEach((el) => {
      if (el.dataset.quoteNote === plan)
        el.textContent = q
          ? `${q.vat_included ? "Đã gồm VAT" : "Chưa gồm VAT"} · ${q.display_monthly_vnd == null ? "Giá mỗi tháng" : "Giá bình quân mỗi tháng"} · Trả trước ${q.billing_months} tháng · Sử dụng ${q.service_months || q.billing_months} tháng${window.PageFPTVoucher?.summary(q) ? " · " + window.PageFPTVoucher.summary(q) : ""}`
          : "Chọn khu vực hoặc kỳ có giá để được tư vấn.";
    });
    document.querySelectorAll("[data-period-average]").forEach(el => {
      if (el.dataset.periodAverage !== plan) return;
      el.hidden = !q || q.display_monthly_vnd == null;
      el.textContent = "Bình quân/tháng";
    });
    const giftMonths = q
      ? (q.gift_months ?? ((q.service_months && q.billing_months) ? (q.service_months - q.billing_months) : 0))
      : 0;
    document.querySelectorAll("[data-period-gift]").forEach(el => {
      if (el.dataset.periodGift !== plan) return;
      const isOne = giftMonths === 1;
      el.hidden = !isOne;
      if (isOne) {
        el.textContent = "🎁 Tặng 1 tháng";
      }
    });
    const published = typeof getPublishedPlans === 'function' ? getPublishedPlans().find(p => p.id === plan) : null;
    const equipment = q?.equipment ?? published?.equipment;
    document.querySelectorAll("[data-period-equipment]").forEach(el => {
      if (el.dataset.periodEquipment !== plan || !Array.isArray(equipment)) return;
      el.replaceChildren(...(equipment.length ? equipment : ["Không kèm thiết bị."]).map(text => {
        const li = document.createElement('li'); li.className = 'plan-feature-item'; li.textContent = text; return li;
      }));
    });
    document.querySelectorAll("[data-accessory-total]").forEach((el) => {
      if (el.dataset.accessoryTotal !== plan) return;
      el.textContent =
        t === null
          ? a.once || a.monthly
            ? `Phụ kiện: ${money(a.once)} một lần · ${money(a.monthly)}/tháng`
            : ""
          : `Ban đầu: ${money(t)}${a.once ? ` · Thiết bị một lần ${money(a.once)}` : ""}`;
    });
    if (typeof compareItems !== "undefined") {
      const item = compareItems.find((i) => i.id === plan);
      if (item) {
        item.fee = amount;
        if (Array.isArray(equipment)) item.modem = equipment.join(', ') || 'Không kèm thiết bị';
        if (typeof renderCompareCards === "function") renderCompareCards();
      }
    }
    document.dispatchEvent(
      new CustomEvent("pagefpt:plan-price", { detail: { plan } }),
    );
  }
  function syncDevices(snapshot) {
    for (const item of snapshot || []) {
      if (!devices.has(item.id)) continue;
      devices.set(item.id, { ...devices.get(item.id), ...item });
      products = products.map((p) =>
        p.id === item.id ? { ...p, ...item } : p,
      );
      document.querySelectorAll("[data-accessory-price]").forEach((el) => {
        if (el.dataset.accessoryPrice !== item.id) return;
        el.replaceChildren();
        if (
          item.original_price_vnd != null &&
          item.original_price_vnd > item.price_vnd
        ) {
          const original = document.createElement("del");
          original.textContent = money(item.original_price_vnd);
          el.append(original, document.createTextNode(" → "));
        }
        const price = document.createElement("b");
        price.textContent = money(item.price_vnd);
        el.append(
          price,
          document.createTextNode(
            " / " + (item.billing_mode === "monthly" ? "tháng" : "một lần"),
          ),
        );
        if (item.offer_label) {
          const offer = document.createElement("em");
          offer.textContent = item.offer_label;
          el.append(offer);
        }
      });
    }
    const data = document.getElementById("published-accessories-data");
    if (data) data.textContent = JSON.stringify(products);
  }
  function accept(plan, q) {
    const revision = q.revision || 0;
    if (revision < latestRevision) return false;
    if (
      (q.accessory_ids &&
        JSON.stringify([...q.accessory_ids].sort()) !==
          JSON.stringify(ids(plan))) ||
      (q.status === "confirmed" && q.billing_months !== term(plan))
    )
      return false;
    if (revision > latestRevision) {
      latestRevision = revision;
      for (const id of new Set([...quotes.keys(), ...options.keys()]))
        if (id !== plan) {
          quotes.delete(id);
          options.delete(id);
          render(id);
        }
    }
    syncDevices(q.accessory_snapshot);
    if (q.status === "not_available") options.delete(plan);
    else if (q.billing_options) options.set(plan, q.billing_options);
    quotes.set(plan, q);
    render(plan);
    return true;
  }
  async function refresh(plan) {
    const seq = (generation.get(plan) || 0) + 1;
    generation.set(plan, seq);
    const region =
      typeof getSelectedRegionId === "function" ? getSelectedRegionId() : null;
    try {
      const r = await fetch("/api/v1/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          plan_id: plan,
          region_id: region,
          billing_months: term(plan),
          accessory_ids: ids(plan),
          ...(window.PageFPTLanding?.quoteContext?.() || {}),
            ...(window.PageFPTVoucher?.quoteContext?.() || {}),
        }),
      });
      if (!r.ok) throw Error();
      const q = await r.json();
      if (generation.get(plan) !== seq) return;
      accept(plan, q);
      return q;
    } catch (_) {
      if (generation.get(plan) === seq) {
        quotes.delete(plan);
        render(plan);
        document.querySelectorAll("[data-quote-note]").forEach((el) => {
          if (el.dataset.quoteNote === plan)
            el.textContent = current(plan)
              ? "Giá tham khảo · Xác nhận lại khi đăng ký"
              : "Chưa tải được giá · Vui lòng thử lại.";
        });
      }
    }
  }
  window.PageFPTAccessories = {
    ids,
    term,
    parts,
    refresh,
    acceptQuote: accept,
    current,
    total,
    display,
    render,
    clearQuotes: () => {
      quotes.clear();
      options.clear();
      for (const [id, seq] of generation) generation.set(id, seq + 1);
      for (const el of document.querySelectorAll("[data-billing-months]"))
        render(el.dataset.billingMonths);
    },
  };
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches("[data-accessory-id]")) {
      const plan = el.dataset.planId,
        set = selected.get(plan) || new Set();
      el.checked
        ? set.add(el.dataset.accessoryId)
        : set.delete(el.dataset.accessoryId);
      selected.set(plan, set);
      document.querySelectorAll("[data-accessory-id]").forEach((i) => {
        if (i.dataset.planId === plan)
          i.checked = set.has(i.dataset.accessoryId);
      });
      render(plan);
      refresh(plan);
    }
    if (el.matches("[data-billing-months]")) {
      const plan = el.dataset.billingMonths;
      months.set(plan, Number(el.value));
      quotes.delete(plan);
      document.querySelectorAll("[data-billing-months]").forEach((i) => {
        if (i.dataset.billingMonths === plan) i.value = el.value;
      });
      render(plan);
      refresh(plan);
    }
  });
  for (const el of document.querySelectorAll("[data-billing-months]")) {
    months.set(el.dataset.billingMonths, Number(el.value) || 6);
    render(el.dataset.billingMonths);
  }
})();
