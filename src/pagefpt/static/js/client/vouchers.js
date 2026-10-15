/* A sharing-link cookie is operational context; optional analytics remains consent-gated. */
(() => {
  let voucher = null,
    code = null,
    link = null,
    generation = 0,
    hasContext = false,
    controller = null,
    mutations = Promise.resolve();
  const money = (n) => new Intl.NumberFormat("vi-VN").format(n || 0) + "đ";
  const labels = {
    gift_unavailable: "Quà tặng cần xác nhận lại.",
    gift_incompatible: "Quà không áp dụng cho gói này.",
    gift_selected: "Bỏ chọn thiết bị trả phí trùng quà tặng để nhận ưu đãi.",
    no_benefit: "Mã không có khoản giảm hoặc quà tặng cho báo giá này.",
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
      return `Còn ${days} ngày ${hours > 0 ? hours + "h" : ""}`;
    }
    const mins = Math.max(1, Math.floor((diff % 3600000) / 60000));
    return `Còn ${hours}h ${mins}p cuối!`;
  }

  const mount = () => {
    if (document.querySelector("[data-landing-preview=true]")) return null;
    const slot = document.getElementById("voucher-banner-slot");
    const root =
      slot || document.getElementById("main-content") || document.querySelector("main");
    if (!root) return null;

    const box = node("section", "", "client-voucher-banner");
    box.id = "client-voucher-banner";
    box.setAttribute("aria-label", "Voucher ưu đãi");
    // Hidden by default so it does not clutter the page
    box.hidden = true;

    // Head: compact row shown when voucher is active
    const head = node("header", "", "client-voucher-head");
    const badge = node("span", "CHỜ XÁC NHẬN", "client-voucher-hero-tag");
    badge.id = "client-voucher-badge";
    badge.hidden = true;

    const title = node("strong", "Mã ưu đãi", "client-voucher-title");
    title.id = "client-voucher-name";

    const urgency = node("span", "", "client-voucher-urgency");
    urgency.id = "client-voucher-urgency";
    urgency.hidden = true;

    const clear = node("button", "✕ Bỏ mã", "client-voucher-clear-btn");
    clear.id = "client-voucher-clear";
    clear.type = "button";
    clear.onclick = async () => {
      const seq = ++generation;
      controller?.abort(); // Only read requests use this controller.
      try {
        await mutateContext({ method: "DELETE" });
        code = "";
        voucher = null;
        link = null;
        hasContext = false;
        const codeInp = document.getElementById("client-voucher-code");
        if (codeInp) codeInp.value = "";
        if (seq !== generation) return;
        render();
        window.dispatchEvent(new CustomEvent('pagefpt-voucher-change'));
        refresh();
      } catch (_) {
        if (seq !== generation) return;
        render();
        document.getElementById("client-voucher-message").hidden = false;
        document.getElementById("client-voucher-message").textContent =
          "Chưa bỏ được mã. Vui lòng thử lại.";
      }
    };
    head.append(badge, title, urgency, clear);

    // Form: unified sleek input bar
    const form = node("form", "", "client-voucher-controls");
    const wrap = node("div", "", "client-voucher-input-group");
    const icon = node("span", "🎟️", "client-voucher-input-icon");
    const input = node("input");
    input.id = "client-voucher-code";
    input.maxLength = 40;
    input.pattern = "[A-Za-z0-9_-]{3,40}";
    input.placeholder = "Nhập mã ưu đãi của bạn...";
    input.autocomplete = "off";
    const apply = node("button", "Áp dụng", "client-voucher-apply-btn");
    apply.type = "submit";
    wrap.append(icon, input, apply);
    form.append(wrap);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const next = input.value.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,40}$/.test(next)) return;
      apply.disabled = true;
      await load(next);
      apply.disabled = false;
      refresh();
    };

    const entry = node("div", "", "client-voucher-entry-box");
    entry.id = "client-voucher-entry";
    entry.append(form);

    const msg = node("p", "", "client-voucher-msg");
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
      const cat = document.getElementById("plans-section") || document.getElementById("lp-plans") || document.querySelector(".telecom-catalog");
      if (cat) cat.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const details = node("details", "", "client-voucher-details");
    const summary = node("summary", "Xem điều kiện ưu đãi ▾");
    const terms = node("p", "", "client-voucher-terms-p");
    terms.id = "client-voucher-terms";
    details.append(summary, terms);
    details.id = "client-voucher-conditions";

    box.append(head, entry, msg, recovery, cta, details);
    head.hidden = msg.hidden = details.hidden = true;

    if (slot) {
      slot.append(box);
    } else {
      root.prepend(box);
    }

    // Toggle button from Marquee Line
    const marqueeBtn = document.getElementById("voucher-marquee-btn");
    if (marqueeBtn) {
      marqueeBtn.onclick = () => {
        box.hidden = !box.hidden;
        marqueeBtn.setAttribute("aria-expanded", String(!box.hidden));
        if (!box.hidden) {
          input.focus();
        }
      };
    }

    return box;
  };

  function render() {
    const box = document.getElementById("client-voucher-banner");
    const name = document.getElementById("client-voucher-name");
    if (!name) return;

    name.textContent = voucher ? voucher.name : "Mã ưu đãi";
    name.parentElement.hidden = !voucher && !hasContext && !code;

    const badge = document.getElementById("client-voucher-badge");
    if (badge) badge.hidden = !voucher;

    const urgency = document.getElementById("client-voucher-urgency");
    if (urgency) {
      if (voucher && voucher.end) {
        urgency.textContent = "⏳ " + formatUrgency(voucher.end);
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
        const t = node("div", "💡 Mã ưu đãi " + voucher.name + " dành riêng cho một số khu vực. Nhân viên sẽ kiểm tra gói và ưu đãi phù hợp với địa chỉ của bạn.");
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

    const entryBox = document.getElementById("client-voucher-entry");
    if (entryBox) {
      entryBox.hidden = !!voucher;
    }

    const msgEl = document.getElementById("client-voucher-message");
    if (msgEl) {
      msgEl.hidden = !voucher && !hasContext && !code;
      if (voucher) {
        if (voucher.status && voucher.status !== "active") {
          msgEl.textContent = labels[voucher.status] || "Ưu đãi chưa khả dụng.";
        } else if (voucher.sold_out) {
          msgEl.textContent = "Ưu đãi đã hết suất.";
        } else {
          const appliedCode = voucher.code || code || "ƯU ĐÃI";
          const dateStr = window.PageFPTDates?.format(voucher.end, false) || "";
          msgEl.innerHTML = `
            <div class="client-voucher-applied-box">
              <div class="client-voucher-applied-badge">
                <span class="client-voucher-applied-icon" aria-hidden="true">🎟️</span>
                <span class="client-voucher-applied-code">MÃ: <strong>${appliedCode}</strong></span>
                <span class="client-voucher-applied-tag">✓ Đang áp dụng</span>
              </div>
              <div class="client-voucher-applied-info">
                <strong class="client-voucher-applied-label">${voucher.label || voucher.name}</strong>
                <span class="client-voucher-applied-sub">
                  ${dateStr ? "Hạn dùng: Đến " + dateStr + " · " : ""}Chờ xác nhận địa bàn
                </span>
              </div>
            </div>
          `;
        }
      } else {
        msgEl.textContent = code || hasContext
          ? "Mã không còn khả dụng. Bạn vẫn có thể gửi yêu cầu tư vấn."
          : "Nhập mã nếu bạn được giới thiệu một ưu đãi.";
      }
    }

    document.getElementById("client-voucher-conditions").hidden = !voucher;
    document.getElementById("client-voucher-terms").textContent =
      voucher?.terms ||
      "Giá và ưu đãi được xác nhận theo địa chỉ lắp đặt. Không cần nhập mã để gửi yêu cầu tư vấn.";
    document.getElementById("client-voucher-clear").hidden =
      !voucher && !code && !hasContext;

    // Show box when voucher is loaded or context is active; hide when empty/cleared
    if (box) {
      if (voucher || (code && code.length > 0) || (hasContext && !voucher)) {
        box.hidden = false;
      } else {
        box.hidden = true;
      }
    }

    // Dynamic Marquee updates
    const marqueeBtn = document.getElementById("voucher-marquee-btn");
    const marqueeBtnLabel = document.getElementById("voucher-marquee-btn-label");
    const marqueeText = document.getElementById("voucher-marquee-text");
    const marqueeDup = document.getElementById("voucher-marquee-text-dup");

    if (marqueeBtn) marqueeBtn.classList.toggle("active", Boolean(voucher));
    if (marqueeBtnLabel) marqueeBtnLabel.textContent = voucher
      ? "Xem mã: " + voucher.code
      : "Nhập mã ưu đãi";
    // Campaign names and gift names are plain text, including when they contain HTML.
    const status = voucher && (voucher.sold_out ? "sold_out" : voucher.status);
    const heading = voucher ? "MÃ ƯU ĐÃI:" : "ƯU ĐÃI THEO ĐỊA BÀN:";
    const copy = voucher
      ? " " + voucher.name + " · " + (labels[status] || "Nhân viên xác nhận điều kiện và giữ suất.") +
        (voucher.end ? " · " + formatUrgency(voucher.end) : "")
      : " Nhập mã nếu có; giá, quà tặng và điều kiện được xác nhận theo địa chỉ lắp đặt.";
    for (const target of [marqueeText, marqueeDup]) {
      if (target) target.replaceChildren(node("strong", heading, "voucher-marquee-highlight"), document.createTextNode(copy));
    }
  }

  function refresh() {
    window.PageFPTAccessories?.clearQuotes();
    if (typeof refreshCatalogPrices === "function") refreshCatalogPrices();
    if (typeof refreshActiveQuote === "function") refreshActiveQuote();
  }

  async function timedContext(options) {
    const active = new AbortController();
    const timer = setTimeout(() => active.abort(), 4000);
    try {
      const r = await fetch("/api/v1/vouchers/context", { ...options, signal: active.signal });
      if (!r.ok) throw Error();
      return r.status === 204 ? null : await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Aborting a UI render cannot undo a Set-Cookie response. Finish context writes in
  // intent order, so an older DELETE never clears the cookie of a newer POST.
  function mutateContext(options) {
    const job = mutations.then(() => timedContext(options));
    mutations = job.catch(() => {});
    return job;
  }

  async function load(next) {
    const seq = ++generation;
    controller?.abort();
    let timer;
    try {
      let data;
      if (next) {
        data = await mutateContext({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: next }),
        });
      } else {
        const active = new AbortController();
        controller = active;
        timer = setTimeout(() => active.abort(), 4000);
        const r = await fetch("/api/v1/vouchers/context", { signal: active.signal });
        if (!r.ok) throw Error();
        data = await r.json();
        if (seq !== generation) return;
      }
      if (seq !== generation) return;
      voucher = data.voucher;
      hasContext = Boolean(data.has_context || voucher);
      code = next || voucher?.code || null;
      link = voucher?.link?.slug || null;
      if (seq === generation) { render(); window.dispatchEvent(new CustomEvent('pagefpt-voucher-change')); }
    } catch (_) {
      if (seq !== generation) return;
      render();
      document.getElementById("client-voucher-message").textContent =
        "Chưa tải được ưu đãi. Bạn vẫn có thể gửi yêu cầu tư vấn.";
      document.getElementById("client-voucher-message").hidden = false;
      window.dispatchEvent(new CustomEvent('pagefpt-voucher-change'));
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
    current: () => voucher,
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
