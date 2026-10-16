/* Native dialog keeps focus, keyboard dismissal and the existing selection state. */
(() => {
  const dialog = document.getElementById("plan-details-dialog");
  if (!dialog) return;
  const $ = (id) => document.getElementById(id),
    money = (v) =>
      Number.isFinite(v)
        ? new Intl.NumberFormat("vi-VN").format(v) + "đ"
        : "Cần tư vấn";
  let active = null,
    trigger = null;
  const node = (tag, text) => {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  };
  function fill() {
    const plan = getPublishedPlans().find((p) => p.id === active);
    if (!plan) return;
    $("plan-details-title").textContent = plan.name;
    $("plan-details-description").textContent =
      plan.description || "Nhân viên tư vấn theo nhu cầu và địa chỉ lắp đặt.";
    const img = $("plan-details-image");
    img.hidden = !plan.image_url;
    if (plan.image_url) {
      img.src = plan.image_url;
      img.alt = plan.image_alt || plan.name;
    } else img.removeAttribute("src");
    const q = window.PageFPTAccessories?.current(active),
      a = window.PageFPTAccessories?.parts(active) || { once: 0, monthly: 0 };
    const fields = [
      [
        "Download",
        plan.speed_mbps ? plan.speed_mbps + " Mbps" : "Chưa cập nhật",
      ],
      [
        "Upload",
        plan.upload_speed_mbps
          ? plan.upload_speed_mbps + " Mbps"
          : "Chưa cập nhật",
      ],
      [
        "Kỳ thanh toán",
        (window.PageFPTAccessories?.term(active) || 6) + " tháng",
      ],
    ];
    if (q)
      fields.push(
        ...(q.display_monthly_vnd == null ? [] : [["Giá bình quân hiển thị / tháng", money(q.display_monthly_vnd)]]),
        ["Cước mỗi tháng", money(q.monthly_vnd)],
        ["Cước trả trước cả kỳ", money(q.line_items?.term_vnd)],
        ["Phụ kiện mỗi tháng", money(a.monthly)],
        ["Phụ kiện một lần", money(a.once)],
        ["Phí hòa mạng", money(q.line_items?.setup_vnd || 0)],
        ["Phí thiết bị gói", money(q.line_items?.equipment_vnd || 0)],
        ["VAT bổ sung", money(q.line_items?.vat_added_vnd || 0)],
        ["Ưu đãi giảm tiền", money(q.line_items?.discount_vnd || 0)],
        [
          "Tháng sử dụng",
          (q.gift_months === 1 || (q.service_months && q.billing_months && q.service_months - q.billing_months === 1))
            ? `${q.service_months} tháng (Tặng 1 tháng)`
            : String(q.service_months),
        ],
        ...((q.gift_months === 1 || (q.service_months && q.billing_months && q.service_months - q.billing_months === 1))
          ? [["Ưu đãi tặng kèm", "Tặng 1 tháng cước sử dụng"]]
          : []),
      );
    else fields.push(["Giá cước", "Cần xác nhận theo địa bàn/kỳ đã chọn"]);
    $("plan-details-facts").replaceChildren(
      ...fields.flatMap(([key, value]) => {
        const dt = node("dt", key);
        const dd = node("dd", String(value));
        const k = key.toLowerCase();
        if (k.includes("tổng thanh toán")) {
          dt.className = "fact-highlight fact-total-dt";
          dd.className = "fact-highlight fact-total-dd";
        } else if (k.includes("bình quân") || k.includes("cước mỗi tháng")) {
          dt.className = "fact-accent-dt";
          dd.className = "fact-accent-dd";
        }
        return [dt, dd];
      }),
    );
    $("plan-details-equipment").replaceChildren(
      ...((q?.equipment ?? plan.equipment)?.length
        ? (q?.equipment ?? plan.equipment)
        : q?.equipment ? ["Không kèm thiết bị."] : ["Xác nhận thiết bị theo địa bàn."]
      ).map((text) => node("li", text)),
    );
    let products = [];
    try {
      products = JSON.parse(
        $("published-accessories-data")?.textContent || "[]",
      );
    } catch (_) {}
    const eligible = products.filter(
      (p) =>
        p.price_vnd != null &&
        p.service === plan.service &&
        (!p.plan_ids?.length || p.plan_ids.includes(active)),
    );
    $("plan-details-accessories").replaceChildren(
      ...eligible.map((p) => {
        const el = node("div", p.name);
        el.className = "detail-accessory";
        el.append(
          node(
            "small",
            `Giá gốc ${money(p.original_price_vnd ?? p.price_vnd)} · Giá ưu đãi ${money(p.price_vnd)} / ${p.billing_mode === "monthly" ? "tháng" : "một lần"}`,
          ),
        );
        if (p.offer_label) el.append(node("small", p.offer_label));
        if (p.description) el.append(node("small", p.description));
        return el;
      }),
    );
    if (!eligible.length)
      $("plan-details-accessories").append(
        node("p", "Chưa có ưu đãi phụ kiện."),
      );
    $("plan-details-register").textContent =
      plan.card_labels?.register || "Đăng ký gói";
    $("plan-details-register").onclick = () => {
      dialog.close();
      openBottomSheet(plan.name, "", plan.id);
    };
    $("plan-details-compare").onclick = () => {
      dialog.close();
      toggleCompare(
        plan.id,
        plan.name,
        plan.speed_mbps || "Cần tư vấn",
        q ? money(window.PageFPTAccessories.display(active, q)) : "Cần tư vấn",
        (q?.equipment ?? plan.equipment ?? []).join(", "),
      );
    };
  }
  window.openPublishedPlanDetails = (button) => {
    active = button.dataset.planDetail || button.dataset.planId;
    trigger = button;
    fill();
    dialog.showModal();
  };
  dialog.addEventListener("close", () => trigger?.focus());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
  document.addEventListener("pagefpt:plan-price", (e) => {
    if (dialog.open && e.detail.plan === active) fill();
  });
})();
