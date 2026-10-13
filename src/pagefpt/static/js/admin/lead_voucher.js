/* Assigned staff act on authoritative server snapshots, never on browser amounts. */
(() => {
  const panel = document.getElementById("lead-voucher-panel");
  if (!panel) return;
  const node = (tag, text = "", cls = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const names = {
    held: "Đang giữ suất",
    redeemed: "Đã dùng ưu đãi",
    expired: "Suất giữ đã hết hạn",
    released: "Đã hủy suất",
    pending_address: "Chờ xác nhận địa chỉ",
    unavailable: "Mã không khả dụng",
  };
  const errors = {
    VOUCHER_ADDRESS_REQUIRED:
      "Xác nhận tỉnh, xã/phường và địa chỉ trước khi giữ suất.",
    VOUCHER_CLOSE_REQUIRED: "Cần báo giá hoặc chốt gói trước khi giữ suất.",
    VOUCHER_NOT_ELIGIBLE:
      "Gói, kỳ thanh toán hoặc địa bàn không đáp ứng điều kiện.",
    VOUCHER_QUOTA_EXCEEDED: "Ưu đãi đã hết suất.",
    VOUCHER_REGION_QUOTA_EXCEEDED: "Địa bàn đã hết suất.",
    VOUCHER_GIFT_SOLD_OUT: "Quà tặng đã hết.",
    VOUCHER_BUDGET_EXCEEDED: "Chiến dịch đã hết ngân sách.",
    VOUCHER_CUSTOMER_LIMIT: "Khách đã dùng hoặc đang giữ ưu đãi này.",
    VOUCHER_REDEMPTION_CONDITION:
      "Chưa đạt điều kiện chốt/lắp đặt để ghi nhận đã dùng.",
    VOUCHER_HOLD_EXPIRED: "Suất giữ đã hết hạn. Hãy kiểm tra và giữ lại.",
    VOUCHER_SCOPE_CHANGED:
      "Gói hoặc kỳ đã chốt khác báo giá. Cập nhật hồ sơ và chọn đúng kỳ; hủy suất cũ nếu đang giữ.",
    VOUCHER_ALREADY_HELD: "Hồ sơ đang giữ voucher khác. Hủy suất cũ trước.",
    VERSION_CONFLICT: "Hồ sơ thay đổi. Tải lại trước khi thao tác.",
    QUOTE_STALE: "Giá vừa thay đổi. Tải lại và thử lại.",
    PERMISSION_DENIED: "Bạn chưa có quyền thao tác hồ sơ này.",
  };
  let busy = false,
    generation = 0;
  async function api(action = "", body) {
    const r = await adminFetch(
      "/api/v1/admin/leads/" + currentLead.id + "/voucher" + action,
      {
        method: body ? "POST" : "GET",
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      },
    );
    const d = await r.json();
    if (!r.ok)
      throw Error(errors[d.code] || "Chưa xử lý được ưu đãi (" + d.code + ").");
    return d;
  }
  function field(box, title, id, tag = "input") {
    const label = node("label", title),
      input = node(tag);
    input.id = id;
    label.htmlFor = id;
    label.append(input);
    box.append(label);
    return input;
  }
  function render(data) {
    panel.replaceChildren();
    const head = node("div", "", "voucher-heading");
    head.style.marginBottom = "8px";
    head.append(node("h3", "Voucher khách quan tâm"));
    const request = data.request,
      record = data.redemption;

    const stateText = record
      ? names[record.state]
      : request
        ? names[request.status]
        : "Chưa có yêu cầu voucher";
    const stateBadge = node("span", stateText, "voucher-badge");
    if (record?.state === "held") stateBadge.style.background = "#ffedd5", stateBadge.style.color = "#c2410c";
    else if (record?.state === "redeemed") stateBadge.style.background = "#dcfce7", stateBadge.style.color = "#15803d";
    head.append(stateBadge);
    panel.append(head);

    // Hidden p element with state text for exact textContent matches
    const statePara = node("p", stateText);
    statePara.style.display = "none";
    panel.append(statePara);
    if (request) panel.append(node("p", "Mã: " + request.code));
    if (record) {
      const v = record.snapshot.voucher;
      panel.append(
        node(
          "p",
          `Giảm ${adminMoney(v.discount_vnd)} · Kỳ ${record.snapshot.billing_months} tháng${v.gift ? " · Tặng " + v.gift.name : ""}`,
        ),
      );
      panel.append(
        node(
          "p",
          "Tổng thanh toán: " + adminMoney(record.snapshot.initial_total_vnd),
        ),
      );
      if (record.state === "held") {
        if (record.expires_at) {
          const expDate = new Date(record.expires_at);
          const diffMs = expDate.getTime() - Date.now();
          const diffHours = Math.max(0, Math.floor(diffMs / 3600000));
          const diffMins = Math.max(0, Math.floor((diffMs % 3600000) / 60000));
          const isUrgent = diffHours < 6;
          const timerEl = node(
            "p",
            `⏱️ Thời hạn giữ suất: ${window.PageFPTDates.format(record.expires_at)} (Còn ${diffHours}h ${diffMins}p)`,
            isUrgent ? "voucher-timer-urgent" : "voucher-timer-normal",
          );
          panel.append(timerEl);
        } else {
          panel.append(
            node(
              "p",
              "Giữ đến: " + window.PageFPTDates.format(record.expires_at),
            ),
          );
        }
      }
    }
    const msg = node("p");
    msg.id = "lead-voucher-status";
    msg.setAttribute("role", "status");

    if (request || record) {
      const custName = currentLead?.name || data.lead?.name || "Anh/Chị";
      const vName = record?.snapshot?.voucher?.name || request?.code || "ưu đãi";
      const discText = record?.snapshot?.voucher?.discount_vnd ? adminMoney(record.snapshot.voucher.discount_vnd) : "";
      const scriptBox = node("div", "", "voucher-lead-script");
      const scriptTitle = node("strong", "📞 Kịch bản gợi ý Telesales:");
      const scriptQuote = node("blockquote", `“Em chào ${custName}, em thấy mình vừa đăng ký nhận mã ưu đãi ${vName}${discText ? " (giảm " + discText + ")" : ""} trên website FPT. Em gọi để hỗ trợ kiểm tra hạ tầng và kích hoạt giữ suất ưu đãi tốt nhất cho mình ngay trong hôm nay ạ!”`);
      scriptQuote.style.margin = "6px 0 0 0";
      scriptQuote.style.fontStyle = "italic";
      scriptQuote.style.color = "#334155";
      scriptBox.append(scriptTitle, scriptQuote);
      panel.append(scriptBox);
    }
    if (record?.state === "held") {
      const reason = field(
        panel,
        "Lý do nghiệm thu / hủy suất",
        "lead-voucher-reason",
        "textarea",
      );
      reason.maxLength = 500;
      reason.rows = 2;
      const actions = node("div", "", "voucher-toolbar");
      for (const action of ["redeem", "release"]) {
        const button = node(
          "button",
          action === "redeem" ? "Ghi nhận đã dùng" : "Hủy & trả suất",
          action === "redeem" ? "btn-action-call" : "btn-action-detail",
        );
        button.type = "button";
        button.onclick = () =>
          act(
            "/" + action,
            { expected_version: record.version, reason: reason.value.trim() },
            msg,
          );
        actions.append(button);
      }
      panel.append(actions);
    }
    if (!record || ["expired", "released"].includes(record.state)) {
      const form = node("form"),
        fields = node("div", "", "voucher-fields"),
        code = field(fields, "Mã voucher", "lead-voucher-code");
      code.value = request?.code || "";
      code.required = true;
      code.pattern = "[A-Z0-9_-]{3,40}";
      code.maxLength = 40;
      const months = field(
        fields,
        "Kỳ thanh toán",
        "lead-voucher-months",
        "select",
      );
      for (const m of [1, 6, 12]) {
        const o = node("option", m === 1 ? "Hàng tháng" : m + " tháng");
        o.value = m;
        months.append(o);
      }
      months.value =
        record?.snapshot.billing_months || data.deal?.billing_months || 6;
      form.append(fields);
      const button = node("button", "Xác nhận & giữ ưu đãi", "btn-action-call");
      button.type = "submit";
      form.append(button);
      form.onsubmit = (e) => {
        e.preventDefault();
        act(
          "/reserve",
          {
            expected_version: data.lead.version,
            code: code.value.trim().toUpperCase(),
            billing_months: Number(months.value),
          },
          msg,
        );
      };
      panel.append(form);
    }
    panel.append(
      msg,
      node(
        "p",
        "Cần xác nhận địa chỉ và báo giá. Một hồ sơ chỉ áp dụng một voucher; quà và hạn mức được giữ trên hệ thống.",
      ),
    );
  }
  async function act(action, body, msg) {
    if (busy) return;
    if (body.reason !== undefined && body.reason.length < 3) {
      msg.textContent = "Nhập lý do từ 3 ký tự.";
      return;
    }
    busy = true;
    panel
      .querySelectorAll("button,input,select,textarea")
      .forEach((b) => (b.disabled = true));
    try {
      await api(action, body);
      if (typeof initLeadDetail === "function") await initLeadDetail();
      else await window.loadLeadVoucher();
    } catch (e) {
      msg.textContent = e.message;
    } finally {
      busy = false;
      panel
        .querySelectorAll("button,input,select,textarea")
        .forEach((b) => (b.disabled = false));
    }
  }
  window.loadLeadVoucher = async () => {
    if (!currentLead || !adminHasPermission("lead.write")) {
      panel.hidden = true;
      return;
    }
    const seq = ++generation,
      leadId = currentLead.id;
    try {
      const data = await api();
      if (seq !== generation || currentLead?.id !== leadId) return;
      render(data);
      if (busy)
        panel
          .querySelectorAll("button,input,select,textarea")
          .forEach((b) => (b.disabled = true));
      panel.hidden = false;
    } catch (e) {
      if (seq !== generation || currentLead?.id !== leadId) return;
      panel.replaceChildren(node("p", e.message));
      panel.hidden = false;
      const retry = node("button", "Tải lại voucher", "btn-action-detail");
      retry.type = "button";
      retry.onclick = () => window.loadLeadVoucher();
      panel.append(retry);
    }
  };
})();
