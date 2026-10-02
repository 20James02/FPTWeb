/** Shared display values. All provider/user text is inserted through textContent. */
const ADMIN_STATUS_LABELS = {
  new: "Mới tiếp nhận",
  assigned: "Đã phân công",
  contacting: "Đang liên hệ",
  contacted: "Đã liên hệ",
  qualified: "Đủ điều kiện",
  survey: "Khảo sát",
  quoted: "Đã báo giá",
  closed: "Khách đồng ý",
  installed: "Đã lắp đặt",
  unreachable: "Chưa liên lạc được",
  no_infrastructure: "Chưa có hạ tầng",
  invalid: "Thông tin không hợp lệ",
  duplicate: "Trùng lặp",
  rejected: "Từ chối / Hủy",
};
function adminStatusLabel(status) {
  return ADMIN_STATUS_LABELS[status] || status || "Chưa có dữ liệu";
}
function adminKanbanGroup(status) {
  return (
    {
      assigned: "new",
      contacted: "contacting",
      unreachable: "contacting",
      quoted: "qualified",
      closed: "qualified",
      no_infrastructure: "survey",
      invalid: "rejected",
      duplicate: "rejected",
    }[status] ||
    ([
      "new",
      "contacting",
      "qualified",
      "survey",
      "installed",
      "rejected",
    ].includes(status)
      ? status
      : "rejected")
  );
}
function adminVietnamDay(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (key) => parts.find((x) => x.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function adminScoreReason(reason) {
  if (typeof reason === "string") return reason;
  if (!reason || typeof reason !== "object") return "Chưa có chi tiết tín hiệu";
  const labels = {
    phone_valid: "Định dạng số hợp lệ",
    otp: "Đã xác thực OTP",
    contacted: "Nhân viên đã liên hệ",
    needs_confirmed: "Đã xác nhận nhu cầu",
    select_plan: "Chọn gói",
    compare_plans: "So sánh gói",
    appointment: "Đặt lịch hẹn",
    view_cost: "Xem chi phí",
    return_visit: "Quay lại website",
    honeypot: "Tín hiệu honeypot",
    burst: "Gửi dồn dập",
    automation_pattern: "Dấu hiệu tự động",
    impossible_sequence: "Chuỗi hành vi bất thường",
  };
  const kinds = {
    confidence: "Tin cậy liên hệ",
    intent: "Nhu cầu",
    risk: "Rủi ro tự động",
  };
  return [
    labels[reason.signal] || reason.signal || "Tín hiệu",
    kinds[reason.kind] || reason.kind,
    reason.weight != null ? `Trọng số: ${reason.weight} điểm` : null,
    reason.age_days != null
      ? `${Number(reason.age_days).toFixed(1)} ngày trước`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
function adminMoney(value) {
  return value == null
    ? "Chưa có dữ liệu"
    : new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(value);
}
function adminNode(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text ?? "";
  node.className = className;
  return node;
}

/** Native dialogs supply focus trapping, keyboard dismissal and accessible form labels. */
async function adminAskText(title, maxLength = 500) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "admin-dialog";
    const form = document.createElement("form"),
      label = adminNode("label", title),
      input = document.createElement("textarea");
    input.required = true;
    input.maxLength = maxLength;
    input.rows = 3;
    label.append(input);
    const actions = adminNode("div", "", "admin-dialog-actions"),
      cancel = adminNode("button", "Hủy", "btn-action-detail"),
      save = adminNode("button", "Xác nhận", "btn-action-call");
    cancel.type = "button";
    save.type = "submit";
    actions.append(cancel, save);
    form.append(label, actions);
    dialog.append(form);
    document.body.append(dialog);
    let result = null;
    cancel.onclick = () => dialog.close();
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      result = input.value.trim();
      dialog.close();
    };
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        resolve(result);
      },
      { once: true },
    );
    dialog.showModal();
    input.focus();
  });
}
async function adminChooseAssignee(leads) {
  if (!leads.length) {
    showToast("Chọn ít nhất một hồ sơ mới / đã phân công.", "error");
    return;
  }
  try {
    const data = await crmRequest("/assignees");
    const dialog = document.createElement("dialog");
    dialog.className = "admin-dialog";
    const form = document.createElement("form"),
      heading = adminNode("h2", `Phân công ${leads.length} hồ sơ`),
      label = adminNode("label", "Nhân viên"),
      select = document.createElement("select");
    select.required = true;
    select.style.width = "100%";
    select.style.minHeight = "44px";
    for (const member of data.items || []) {
      const option = adminNode(
        "option",
        `${member.display_name || member.user_id.slice(0, 8)} · ${member.active_leads}/${member.capacity} hồ sơ`,
      );
      option.value = member.user_id;
      select.append(option);
    }
    label.append(select);
    const error = adminNode("p", "", "workspace-error");
    error.setAttribute("role", "alert");
    const actions = adminNode("div", "", "admin-dialog-actions"),
      cancel = adminNode("button", "Hủy", "btn-action-detail"),
      save = adminNode("button", "Phân công", "btn-action-call");
    cancel.type = "button";
    save.type = "submit";
    save.disabled = !select.options.length;
    actions.append(cancel, save);
    form.append(heading, label, error, actions);
    dialog.append(form);
    document.body.append(dialog);
    cancel.onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await crmRequest("/lead-assignments", "POST", {
          assignee_id: select.value,
          items: leads.map((lead) => ({
            id: lead.id,
            expected_version: lead.version,
          })),
        });
        dialog.close();
        if (typeof crmSelectedLeads !== "undefined") crmSelectedLeads.clear();
        showToast("Đã phân công toàn bộ hồ sơ đã chọn.", "success");
        if (window.location.pathname === "/admin/leads")
          await refreshCrmLeads();
        else if (typeof initLeadDetail === "function") await initLeadDetail();
      } catch (e) {
        error.textContent = e.message;
      } finally {
        save.disabled = false;
      }
    };
    dialog.showModal();
    select.focus();
  } catch (e) {
    showToast(e.message, "error");
  }
}

let adminSoundEnabled = false;
let adminAudio = null;
async function adminEnableSound() {
  try {
    adminAudio = new (window.AudioContext || window.webkitAudioContext)();
    await adminAudio.resume();
    showToast("Đã cho phép phát chuông trên trang này.", "success");
  } catch (_) {
    showToast("Trình duyệt chưa cho phép phát âm thanh.", "error");
  }
}
function adminPlayLeadSound() {
  if (!adminSoundEnabled || !adminAudio || adminAudio.state !== "running")
    return;
  const tone = adminAudio.createOscillator(),
    gain = adminAudio.createGain();
  gain.gain.value = 0.08;
  tone.frequency.value = 660;
  tone.connect(gain);
  gain.connect(adminAudio.destination);
  tone.start();
  tone.stop(adminAudio.currentTime + 0.15);
}
async function adminRefreshLeadCount() {
  if (!adminHasPermission("lead.read")) return;
  try {
    const data = await crmRequest("/lead-counts");
    const counter = document.getElementById("sidebar-new-leads-count");
    if (counter) counter.textContent = String(data.new);
  } catch (_) {
    const counter = document.getElementById("sidebar-new-leads-count");
    if (counter) counter.textContent = "—";
  }
}
document.addEventListener("DOMContentLoaded", async () => {
  adminRefreshLeadCount();
  if (adminHasPermission("lead.read"))
    try {
      adminSoundEnabled = (await crmRequest("/operations/settings")).payload
        .sound_alert;
    } catch (_) {
      adminSoundEnabled = false;
    }
});

function adminDraftCost(price) {
  const beforeVat =
    BigInt(price.monthly_vnd) * BigInt(price.billing_months) +
    BigInt(price.setup_vnd) +
    BigInt(price.equipment_vnd);
  const added = price.vat_included
    ? 0n
    : (beforeVat * BigInt(price.vat_bps) + 5000n) / 10000n;
  return Number(beforeVat + added);
}
