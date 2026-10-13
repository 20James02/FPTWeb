/* A sharing-link cookie is operational context; optional analytics remains consent-gated. */
(() => {
  let voucher = null,
    code = null,
    link = null,
    generation = 0,
    hasContext = false,
    controller = null,
    pillDismissed = false;
  const money = (n) => new Intl.NumberFormat("vi-VN").format(n || 0) + "đ";
  const labels = {
    gift_unavailable: "Quà tặng cần xác nhận lại.",
    gift_incompatible: "Quà không áp dụng cho gói này.",
    gift_selected: "Bỏ chọn thiết bị trả phí trùng quà tặng để nhận ưu đãi.",
    eligible: "Ưu đãi dự kiến; nhân viên xác nhận và giữ suất.",
    unavailable: "Mã không còn khả dụng.",
    address_required: "Chọn địa bàn để xem ưu đãi.",
    area_excluded: "Ưu đãi không áp dụng tại địa bàn này.",
    area_mismatch: "Ưu đãi dành cho địa bàn khác.",
    plan_mismatch: "Ưu đãi dành cho gói khác.",
    term_mismatch: "Chọn kỳ thanh toán phù hợp để nhận ưu đãi.",
    promotion_conflict: "Gói đã có ưu đãi riêng; voucher chưa cộng cùng.",
    sold_out: "Ưu đãi đã hết suất.",
    expired: "Ưu đãi đã hết hạn.",
    not_started: "Ưu đãi chưa bắt đầu.",
  };
  const node = (tag, text = "", className = "") => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (className) e.className = className;
    return e;
  };

  function formatUrgency(endStr) {
    if (!endStr) return "";
    const end = new Date(endStr).getTime();
    const now = Date.now();
    const diff = end - now;
    if (isNaN(diff) || diff <= 0) return "Ưu đãi đã kết thúc";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 7) {
      return "Đến " + (window.PageFPTDates?.format(endStr, false) || new Date(endStr).toLocaleDateString("vi-VN"));
    }
    if (days >= 1) {
      return `⏳ Còn ${days} ngày ${hours > 0 ? hours + "h" : ""}`;
    }
    const mins = Math.max(1, Math.floor((diff % 3600000) / 60000));
    return `🔥 Còn ${hours}h ${mins}p cuối!`;
  }

  let syncFloatingPill = () => {};

  const mount = () => {
    if (document.querySelector("[data-landing-preview=true]")) return null;
    const root =
      document.getElementById("main-content") || document.querySelector("main");
    if (!root) return null;
    const box = node("section", "", "client-voucher-banner");
    box.id = "client-voucher-banner";
    box.setAttribute("aria-label", "Voucher ưu đãi");

    const head = node("header");
    const badge = node("span", "ƯU ĐÃI ĐÃ KÍCH HOẠT", "client-voucher-hero-tag");
    badge.id = "client-voucher-badge";
    badge.hidden = true;

    const title = node("strong", "Mã ưu đãi");
    title.id = "client-voucher-name";

    const urgency = node("span", "", "client-voucher-urgency");
    urgency.id = "client-voucher-urgency";
    urgency.hidden = true;

    const clear = node("button", "Bỏ mã");
    clear.id = "client-voucher-clear";
    clear.type = "button";
    clear.onclick = async () => {
      ++generation;
      controller?.abort();
      try {
        const r = await fetch("/api/v1/vouchers/context", { method: "DELETE" });
        if (!r.ok) throw Error();
      } catch (_) {
        document.getElementById("client-voucher-message").textContent =
          "Chưa bỏ được mã. Vui lòng thử lại.";
        return;
      }
      code = "";
      voucher = null;
      link = null;
      hasContext = false;
      const pillEl = document.getElementById("client-voucher-floating-pill");
      if (pillEl) pillEl.hidden = true;
      render();
      refresh();
    };
    head.append(badge, title, urgency, clear);

    const msg = node("p");
    msg.id = "client-voucher-message";
    msg.setAttribute("role", "status");

    const recovery = node("div", "", "client-voucher-recovery");
    recovery.id = "client-voucher-recovery";
    recovery.hidden = true;

    const cta = node("button", "Xem bảng giá áp dụng ưu đãi ↓", "client-voucher-cta-btn");
    cta.id = "client-voucher-cta";
    cta.type = "button";
    cta.hidden = true;
    cta.onclick = () => {
      const cat = document.getElementById("catalog-section") || document.getElementById("catalog") || document.querySelector(".telecom-catalog");
      if (cat) cat.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const details = node("details");
    const summary = node("summary", "Điều kiện ưu đãi");
    const terms = node("p");
    terms.id = "client-voucher-terms";
    details.append(summary, terms);
    details.id = "client-voucher-conditions";

    const form = node("form", "", "client-voucher-controls");
    const label = node("label", "Mã ưu đãi");
    label.htmlFor = "client-voucher-code";
    const input = node("input");
    input.id = "client-voucher-code";
    input.maxLength = 40;
    input.pattern = "[A-Za-z0-9_-]{3,40}";
    input.placeholder = "Nhập mã (nếu có)";
    const apply = node("button", "Áp dụng");
    apply.type = "submit";
    form.append(label, input, apply);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const next = input.value.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,40}$/.test(next)) return;
      apply.disabled = true;
      await load(next);
      apply.disabled = false;
      refresh();
    };

    const entry = node("details");
    const entryTitle = node("summary", "Có mã ưu đãi?");
    entry.id = "client-voucher-entry";
    entry.append(entryTitle, form);

    box.append(head, msg, recovery, cta, details, entry);
    head.hidden = msg.hidden = details.hidden = true;
    root.prepend(box);

    // Floating Sticky Voucher Mini-Pill
    const pill = node("aside", "", "client-voucher-floating-pill");
    pill.id = "client-voucher-floating-pill";
    pill.setAttribute("aria-label", "Ưu đãi đang kích hoạt");
    pill.hidden = true;

    const pillContent = node("div", "", "client-voucher-pill-content");
    const pillIcon = node("span", "🎁");
    const pillText = node("span", "Ưu đãi FPT");
    pillText.id = "client-voucher-pill-text";
    pillContent.append(pillIcon, pillText);

    const pillCta = node("button", "Nhận ưu đãi", "client-voucher-pill-cta");
    pillCta.id = "client-voucher-pill-cta";
    pillCta.type = "button";
    pillCta.onclick = () => {
      const cat = document.getElementById("catalog-section") || document.getElementById("catalog") || box;
      if (cat) cat.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const pillClose = node("button", "×", "client-voucher-pill-close");
    pillClose.type = "button";
    pillClose.setAttribute("aria-label", "Đóng thông báo");
    pillClose.onclick = () => {
      pillDismissed = true;
      pill.hidden = true;
    };

    pill.append(pillContent, pillCta, pillClose);
    document.body.append(pill);

    syncFloatingPill = () => {
      if (pillDismissed || !voucher) {
        pill.hidden = true;
        return;
      }
      const rect = box.getBoundingClientRect();
      pill.hidden = rect.bottom > 50;
    };
    window.addEventListener("scroll", syncFloatingPill, { passive: true });

    return box;
  };

  function render() {
    const name = document.getElementById("client-voucher-name");
    if (!name) return;
    name.textContent = voucher ? voucher.name : "Mã ưu đãi";
    name.parentElement.hidden = !voucher && !hasContext && !code;

    const badge = document.getElementById("client-voucher-badge");
    if (badge) badge.hidden = !voucher;

    const urgency = document.getElementById("client-voucher-urgency");
    if (urgency) {
      if (voucher && voucher.end) {
        urgency.textContent = formatUrgency(voucher.end);
        urgency.hidden = false;
      } else {
        urgency.hidden = true;
      }
    }

    const cta = document.getElementById("client-voucher-cta");
    if (cta) cta.hidden = !voucher;

    const rec = document.getElementById("client-voucher-recovery");
    if (rec) {
      if (voucher && (voucher.status === "area_mismatch" || voucher.status === "area_excluded")) {
        rec.replaceChildren();
        const t = node("div", "💡 Mã ưu đãi " + voucher.name + " dành riêng cho một số khu vực. FPT vẫn có combo quà tặng và chính sách giá tốt nhất cho địa chỉ của bạn.");
        const b = node("button", "Đăng ký tư vấn khu vực của bạn", "client-voucher-recovery-cta");
        b.type = "button";
        b.onclick = () => {
          if (typeof openBottomSheet === "function") openBottomSheet("Tư vấn ưu đãi theo khu vực", "Ưu đãi khu vực", "", "internet");
        };
        rec.append(t, b);
        rec.hidden = false;
      } else {
        rec.hidden = true;
      }
    }

    const pill = document.getElementById("client-voucher-floating-pill");
    const pillText = document.getElementById("client-voucher-pill-text");
    if (pill && pillText) {
      if (voucher) {
        pillText.textContent = voucher.label || voucher.name || "Ưu đãi FPT";
        syncFloatingPill();
      } else {
        pill.hidden = true;
      }
    }

    document.getElementById("client-voucher-message").hidden =
      !voucher && !hasContext && !code;
    document.getElementById("client-voucher-conditions").hidden = !voucher;
    document.getElementById("client-voucher-terms").textContent =
      voucher?.terms ||
      "Giá và ưu đãi được xác nhận theo địa chỉ lắp đặt. Không cần nhập mã để gửi yêu cầu tư vấn.";
    document.getElementById("client-voucher-message").textContent = voucher
      ? voucher.status && voucher.status !== "active"
        ? labels[voucher.status]
        : voucher.sold_out
          ? "Ưu đãi đã hết suất."
          : voucher.label +
            " · Đến " +
            window.PageFPTDates?.format(voucher.end, false) +
            " · Chờ xác nhận địa bàn"
      : code || hasContext
        ? "Mã không còn khả dụng. Bạn vẫn có thể gửi yêu cầu tư vấn."
        : "Nhập mã nếu bạn được giới thiệu một ưu đãi.";
    document.getElementById("client-voucher-clear").hidden =
      !voucher && !code && !hasContext;
  }

  function refresh() {
    window.PageFPTAccessories?.clearQuotes();
    if (typeof refreshCatalogPrices === "function") refreshCatalogPrices();
    if (typeof refreshActiveQuote === "function") refreshActiveQuote();
  }

  async function load(next) {
    const seq = ++generation;
    controller?.abort();
    const active = new AbortController();
    controller = active;
    const timer = setTimeout(() => active.abort(), 4000);
    try {
      const r = await fetch("/api/v1/vouchers/context", {
        signal: active.signal,
        ...(next
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: next }),
            }
          : {}),
      });
      if (!r.ok) throw Error();
      const data = await r.json();
      if (seq !== generation) return;
      voucher = data.voucher;
      hasContext = Boolean(data.has_context || voucher);
      code = next || voucher?.code || null;
      link = voucher?.link?.slug || null;
      render();
    } catch (_) {
      if (seq !== generation) return;
      document.getElementById("client-voucher-message").textContent =
        "Chưa tải được ưu đãi. Bạn vẫn có thể gửi yêu cầu tư vấn.";
      document.getElementById("client-voucher-message").hidden = false;
    } finally {
      clearTimeout(timer);
    }
  }

  function summary(q) {
    const v = q?.voucher;
    if (!v) return "";
    return v.status === "eligible"
      ? `Voucher: -${money(v.discount_vnd)}${v.basis === "monthly" ? " / kỳ" : " một lần"}${v.gift ? " + Tặng " + v.gift.name : ""}`
      : labels[v.status] || "Ưu đãi cần xác nhận.";
  }

  window.PageFPTVoucher = {
    quoteContext: () => (code === null ? {} : { voucher_code: code }),
    leadContext: () => ({
      ...(code === null ? {} : { voucher_code: code }),
      ...(link ? { voucher_link: link } : {}),
    }),
    summary,
  };

  document.addEventListener("DOMContentLoaded", async () => {
    if (!mount()) return;
    await load();
  });
})();
