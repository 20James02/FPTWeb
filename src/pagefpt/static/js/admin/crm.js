/**
 * PAGEFPT ADMIN CRM CONTROLLER
 * Real API integration for Lead Listing, Cursor Pagination, Kanban, Detail Hydration & Actions
 * All mutations wait for API commit; zero fake data
 */

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let crmNextCursor = null;
let crmCurrentStatus = null;
let crmLoadedLeads = [];
const crmSelectedLeads = new Map();

async function crmRequest(path, method = "GET", body = null) {
  const options = {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  };
  const response = await adminFetch("/api/v1/admin" + path, options);
  const value = await response.json();
  if (!response.ok) {
    const err = new Error(
      value.code === "PERMISSION_DENIED"
        ? "Bạn chưa có quyền hoặc cần xác thực 2 lớp (MFA/AAL2) cho thao tác này."
        : value.code === "VERSION_CONFLICT"
          ? "Dữ liệu vừa thay đổi trên máy chủ. Đang tải lại thông tin mới nhất..."
          : value.code === "INVALID_TRANSITION"
            ? "Chuyển trạng thái chưa hợp lệ; cần đúng quy trình, lý do hoặc thông tin nghiệm thu."
            : value.code === "INVALID_CURSOR"
              ? "Phiên phân trang đã hết hạn. Đang tải lại từ đầu."
              : value.message ||
                "Chưa lưu được thay đổi. Vui lòng kiểm tra lại.",
    );
    err.code = value.code;
    err.fields = value.fields;
    const messages = {
      R2_UNCONFIGURED: "Chưa cấu hình R2 trên máy chủ.",
      STORAGE_UNCONFIGURED: "Chưa cấu hình kho lưu trữ trên máy chủ.",
      ASSIGNEE_UNAVAILABLE:
        "Nhân viên đã hết sức chứa, ngoài ca hoặc không có quyền tại chi nhánh này.",
      ASSIGNMENT_NOT_ALLOWED:
        "Hồ sơ đã kết thúc nên không thể phân công lại. Không cần nhập thông tin nghiệm thu cho thao tác này.",
      LAST_OWNER_REQUIRED: "Cần giữ ít nhất một chủ hệ thống đang hoạt động.",
      PRIVILEGE_ESCALATION: "Không thể cấp quyền vượt quá quyền của bạn.",
      IMMUTABLE_SCOPE: "Không thể đổi chi nhánh của bản ghi đã tạo.",
      PAYMENT_DATE_EXISTS:
        "Ngày này đã có một khoản thanh toán. Hãy sửa lịch hiện có hoặc chọn ngày khác.",
      INVALID_BILLING_PLAN:
        "Chọn gói đang được công bố và kỳ thanh toán 1, 6 hoặc 12 tháng.",
      BILLING_REQUIRED:
        "Chọn gói khách đã chốt trước khi thêm lịch thanh toán.",
      BILLING_NOT_ALLOWED:
        "Hồ sơ đã hủy hoặc không hợp lệ; không thể ghi thêm thanh toán.",
      INVALID_PAYMENT_STATE: "Khoản đã thu hoặc đã hủy không thể sửa tiếp.",
      IDEMPOTENCY_CONFLICT:
        "Lần lưu này có dữ liệu khác với lần trước. Tải lại để kiểm tra lịch đã lưu.",
    };
    if (messages[value.code]) err.message = messages[value.code];
    throw err;
  }
  return value;
}

function currentLeadId() {
  const value = new URLSearchParams(window.location.search).get("id") || "";
  if (!uuidPattern.test(value)) {
    throw new Error("Mã hồ sơ không hợp lệ. Hãy chọn hồ sơ thật từ danh sách.");
  }
  return value;
}

/**
 * Load Leads List with Cursor Pagination & Status Filtering
 */
let crmGeneration = 0;
let crmBusy = false;
function crmFilters() {
  const filters = {
    branch_id: document.getElementById("filter-branch")?.value || "",
    assignee_id: document.getElementById("filter-assignee")?.value || "",
    region_id: document.getElementById("filter-region")?.value || "",
    q: document.getElementById("filter-search")?.value.trim() || "",
    start: document.getElementById("filter-start")?.value || "",
    end: document.getElementById("filter-end")?.value || "",
    overdue: document.getElementById("filter-overdue")?.checked ? "true" : "",
  };
  return filters;
}
function crmListUrl(status, cursor, filters) {
  const query = new URLSearchParams({ limit: "30" });
  if (status && status !== "all") query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  for (const [key, value] of Object.entries(filters))
    if (value) query.set(key, value);
  return "/leads?" + query;
}
function renderCrmWindow() {
  const tbody = document.getElementById("crm-table-tbody");
  if (!tbody) return;
  tbody.replaceChildren();
  const mobile = document.getElementById("crm-mobile-cards");
  if (mobile) mobile.replaceChildren();
  for (const key of [
    "new",
    "contacting",
    "qualified",
    "survey",
    "installed",
    "rejected",
  ]) {
    document.getElementById("kanban-list-" + key)?.replaceChildren();
    const count = document.getElementById("kanban-count-" + key);
    if (count) count.textContent = "0";
  }
  for (const lead of crmLoadedLeads) {
    renderLeadTableRow(tbody, lead);
    renderKanbanCard(lead);
    if (mobile) renderMobileLead(mobile, lead);
  }
  if (!crmLoadedLeads.length) {
    const row = document.createElement("tr");
    const cell = adminNode("td", "Chưa có đơn tư vấn theo bộ lọc này.");
    cell.colSpan = 9;
    row.append(cell);
    tbody.append(row);
    if (mobile)
      mobile.append(adminNode("p", "Chưa có đơn tư vấn theo bộ lọc này."));
  }
  const total = document.getElementById("leads-total-counter");
  if (total)
    total.textContent = `Đã tải: ${crmLoadedLeads.length} đơn${crmNextCursor ? " · Còn trang tiếp" : ""}`;
  const pageBox = document.getElementById("crm-pagination-box");
  if (pageBox) pageBox.style.display = crmNextCursor ? "block" : "none";
  const more = document.getElementById("btn-load-more");
  if (more) {
    more.disabled = false;
    more.textContent = "Tải thêm hồ sơ";
  }
}
async function loadCrmLeads(
  status = null,
  cursor = null,
  append = false,
  retainWindow = false,
) {
  if (!document.getElementById("crm-table-tbody")) return true;
  const generation = ++crmGeneration;
  crmBusy = true;
  const filters = crmFilters();
  const target = retainWindow ? Math.max(30, crmLoadedLeads.length) : 30;
  crmCurrentStatus = status;
  try {
    let next = cursor,
      items = [];
    do {
      const data = await crmRequest(crmListUrl(status, next, filters));
      if (generation !== crmGeneration) return false;
      items.push(...(data.items || []));
      next = data.next_cursor || null;
    } while (retainWindow && next && items.length < target);
    crmNextCursor = next;
    const merged = append ? [...crmLoadedLeads, ...items] : items;
    crmLoadedLeads = Array.from(
      new Map(merged.map((lead) => [lead.id, lead])).values(),
    );
    renderCrmWindow();
    return true;
  } catch (error) {
    if (generation !== crmGeneration) return false;
    showToast(error.message, "error");
    const total = document.getElementById("leads-total-counter");
    if (total) total.textContent = "Chưa tải được dữ liệu · Bấm làm mới";
    const more = document.getElementById("btn-load-more");
    if (more) more.disabled = false;
    return false;
  } finally {
    if (generation === crmGeneration) crmBusy = false;
  }
}
async function refreshCrmLeads() {
  if (crmBusy) return false;
  return loadCrmLeads(crmCurrentStatus, null, false, true);
}
function loadMoreLeads() {
  if (crmNextCursor && !crmBusy)
    loadCrmLeads(crmCurrentStatus, crmNextCursor, true);
}
function renderMobileLead(container, lead) {
  const card = adminNode("article", "", "crm-mobile-card");
  const link = adminNode(
    "a",
    `${lead.payload?.phone_masked || "***"} · ${lead.id.slice(0, 8)}`,
    "btn-action-detail",
  );
  link.href = "/admin/leads/detail?id=" + encodeURIComponent(lead.id);
  card.append(link);
  card.append(
    adminNode(
      "p",
      adminStatusLabel(lead.status),
      "status-badge " + lead.status,
    ),
  );
  card.append(
    adminNode(
      "p",
      `${lead.labels?.plan || "Cần tư vấn"} · ${lead.labels?.region || "Cần xác nhận địa bàn"}`,
    ),
  );
  card.append(adminNode("p", lead.labels?.assignee || "Chưa phân công"));
  const overdue =
    ["new", "assigned", "contacting"].includes(lead.status) &&
    lead.sla_due_at &&
    new Date(lead.sla_due_at) < new Date();
  card.append(
    adminNode(
      "p",
      overdue
        ? "Quá thời gian liên hệ"
        : `SLA: ${lead.sla_due_at ? PageFPTDates.format(lead.sla_due_at) : "Chưa có"}`,
      overdue ? "sla-overdue" : "",
    ),
  );
  if (adminHasPermission("lead.assign") && adminCanAssignLead(lead)) {
    const label = adminNode("label", "Chọn hồ sơ này", "admin-check");
    const selected = document.createElement("input");
    selected.type = "checkbox";
    selected.dataset.crmSelect = "true";
    selected.checked = crmSelectedLeads.has(lead.id);
    selected.onchange = () => {
      if (selected.checked) crmSelectedLeads.set(lead.id, lead);
      else crmSelectedLeads.delete(lead.id);
    };
    label.prepend(selected);
    card.append(label);
  }
  container.append(card);
}

function renderLeadTableRow(tbody, lead) {
  const row = document.createElement("tr");
  row.dataset.status = lead.status;
  row.dataset.branch = lead.branch_id || "";

  // 1. Mã đơn & Link
  const tdId = document.createElement("td");
  const linkId = document.createElement("a");
  linkId.href = "/admin/leads/detail?id=" + encodeURIComponent(lead.id);
  linkId.style.fontWeight = "800";
  linkId.style.color = "var(--color-primary)";
  linkId.style.textDecoration = "none";
  linkId.textContent = lead.id.slice(0, 8).toUpperCase();
  if (adminHasPermission("lead.assign") && adminCanAssignLead(lead)) {
    const label = adminNode("label", "", "admin-check");
    const selected = document.createElement("input");
    selected.type = "checkbox";
    selected.dataset.crmSelect = "true";
    selected.checked = crmSelectedLeads.has(lead.id);
    selected.setAttribute("aria-label", "Chọn hồ sơ " + lead.id.slice(0, 8));
    selected.onchange = () => {
      if (selected.checked) crmSelectedLeads.set(lead.id, lead);
      else crmSelectedLeads.delete(lead.id);
    };
    label.append(selected);
    tdId.append(label);
  }
  tdId.appendChild(linkId);
  row.appendChild(tdId);

  // 2. Thời gian tạo & Cảnh báo SLA
  const tdTime = document.createElement("td");
  const dateObj = new Date(lead.created_at);
  const timeFormatted = isNaN(dateObj)
    ? "Vừa xong"
    : PageFPTDates.format(dateObj);
  tdTime.style.fontSize = "0.8rem";
  tdTime.style.color = "var(--text-muted)";
  const isOverdue =
    ["new", "assigned", "contacting"].includes(lead.status) &&
    lead.sla_due_at &&
    new Date(lead.sla_due_at) < new Date();
  if (isOverdue) {
    const timeSpan = adminNode("div", timeFormatted);
    const overdueSpan = adminNode("span", "⚠️ Quá hạn SLA", "badge-sla-overdue");
    tdTime.append(timeSpan, overdueSpan);
  } else {
    tdTime.textContent = timeFormatted;
  }
  row.appendChild(tdTime);

  // 3. Số điện thoại (Masked + Reveal button)
  const tdPhone = document.createElement("td");
  const phoneWrapper = document.createElement("div");
  phoneWrapper.style.display = "flex";
  phoneWrapper.style.alignItems = "center";
  phoneWrapper.style.gap = "8px";

  const phoneSpan = document.createElement("span");
  phoneSpan.style.fontFamily = "monospace";
  phoneSpan.style.fontWeight = "700";
  phoneSpan.textContent = lead.payload?.phone_masked || "***";

  const btnReveal = document.createElement("button");
  btnReveal.type = "button";
  btnReveal.className = "btn-reveal-phone";
  btnReveal.textContent = "Xem số";
  btnReveal.onclick = () => revealLeadPhone(lead.id, phoneSpan);

  phoneWrapper.appendChild(phoneSpan);
  phoneWrapper.appendChild(btnReveal);
  tdPhone.appendChild(phoneWrapper);
  row.appendChild(tdPhone);

  // 4. Gói cước
  const tdPlan = document.createElement("td");
  tdPlan.textContent = lead.labels?.plan || "Cần tư vấn";
  tdPlan.style.fontWeight = "600";
  row.appendChild(tdPlan);

  // 5. Khu vực
  const tdRegion = document.createElement("td");
  tdRegion.textContent = lead.labels?.region || "Cần xác nhận";
  row.appendChild(tdRegion);

  // 6. Trạng thái
  const tdStatus = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "status-badge " + lead.status;
  badge.textContent = adminStatusLabel(lead.status);
  tdStatus.appendChild(badge);
  row.appendChild(tdStatus);

  // 7. Phân công nhân sự
  const tdAssignee = document.createElement("td");
  const assigneeBadge = document.createElement("div");
  assigneeBadge.className = "crm-assignee-badge";
  if (lead.labels?.assignee) {
    const avatar = adminNode("span", "👤", "assignee-avatar");
    const name = adminNode("span", lead.labels.assignee, "assignee-name");
    assigneeBadge.append(avatar, name);
  } else {
    const unassigned = adminNode("span", "Chưa phân công", "assignee-unassigned");
    assigneeBadge.append(unassigned);
  }
  tdAssignee.appendChild(assigneeBadge);
  row.appendChild(tdAssignee);

  // 8. Điểm nhu cầu (Scores)
  const tdScore = document.createElement("td");
  const scoreIntent = lead.scores?.intent;
  if (scoreIntent != null) {
    const pill = document.createElement("span");
    pill.style.padding = "2px 8px";
    pill.style.borderRadius = "4px";
    pill.style.fontWeight = "700";
    pill.style.fontSize = "0.75rem";
    pill.style.background = scoreIntent >= 70 ? "#DCFCE7" : "#FEF3C7";
    pill.style.color = scoreIntent >= 70 ? "#16A34A" : "#D97706";
    pill.textContent = `${scoreIntent}/100`;
    tdScore.appendChild(pill);
  } else {
    tdScore.textContent = "Chưa tính";
    tdScore.style.color = "var(--text-muted)";
    tdScore.style.fontSize = "0.78rem";
  }
  row.appendChild(tdScore);

  // 9. Thao tác
  const tdAction = document.createElement("td");
  const actionWrap = document.createElement("div");
  actionWrap.style.display = "flex";
  actionWrap.style.gap = "6px";
  actionWrap.style.alignItems = "center";

  const btnDetail = document.createElement("a");
  btnDetail.href = "/admin/leads/detail?id=" + encodeURIComponent(lead.id);
  btnDetail.className = "btn-action-detail";
  btnDetail.textContent = "Hồ Sơ";
  actionWrap.appendChild(btnDetail);

  if (adminHasPermission("lead.assign") && adminCanAssignLead(lead) && !lead.labels?.assignee) {
    const btnQuickAssign = document.createElement("button");
    btnQuickAssign.type = "button";
    btnQuickAssign.className = "btn-action-call";
    btnQuickAssign.style.padding = "4px 8px";
    btnQuickAssign.style.fontSize = "0.74rem";
    btnQuickAssign.textContent = "Giao";
    btnQuickAssign.title = "Phân công nhân viên phụ trách";
    btnQuickAssign.onclick = () => adminChooseAssignee([lead]);
    actionWrap.appendChild(btnQuickAssign);
  }
  tdAction.appendChild(actionWrap);
  row.appendChild(tdAction);

  tbody.appendChild(row);
}

function renderKanbanCard(lead) {
  const targetCol = adminKanbanGroup(lead.status);
  const colEl = document.getElementById("kanban-list-" + targetCol);
  if (!colEl) return;

  const card = document.createElement("div");
  card.className = "kanban-card";
  const overdue =
    ["new", "assigned", "contacting"].includes(lead.status) &&
    lead.sla_due_at &&
    new Date(lead.sla_due_at) < new Date();
  if (overdue) card.classList.add("overdue-sla");

  card.tabIndex = 0;
  card.setAttribute("role", "link");
  card.onkeydown = (e) => {
    if (e.key === "Enter") card.click();
  };
  card.onclick = () => {
    window.location.href =
      "/admin/leads/detail?id=" + encodeURIComponent(lead.id);
  };

  const topRow = document.createElement("div");
  topRow.className = "kanban-card-top";

  const nameEl = document.createElement("span");
  nameEl.className = "kanban-customer-name";
  nameEl.textContent = lead.payload?.phone_masked || lead.id.slice(0, 8);

  const badge = document.createElement("span");
  badge.className = "status-badge " + lead.status;
  badge.textContent = adminStatusLabel(lead.status);

  topRow.appendChild(nameEl);
  topRow.appendChild(badge);
  card.appendChild(topRow);

  const planEl = document.createElement("div");
  planEl.className = "kanban-card-plan";
  planEl.textContent = lead.labels?.plan || "Cần tư vấn gói";
  card.appendChild(planEl);

  const footerEl = document.createElement("div");
  footerEl.className = "kanban-card-footer";

  const assigneeEl = document.createElement("span");
  assigneeEl.style.display = "inline-flex";
  assigneeEl.style.alignItems = "center";
  assigneeEl.style.gap = "4px";
  if (lead.labels?.assignee) {
    assigneeEl.textContent = "👤 " + lead.labels.assignee;
    assigneeEl.style.color = "var(--text-primary)";
    assigneeEl.style.fontWeight = "600";
  } else {
    assigneeEl.textContent = "⚪ Chưa phân công";
    assigneeEl.style.color = "var(--text-muted)";
  }

  const regionEl = document.createElement("span");
  regionEl.textContent = lead.labels?.region || "Cần xác nhận";
  regionEl.style.maxWidth = "110px";
  regionEl.style.overflow = "hidden";
  regionEl.style.textOverflow = "ellipsis";
  regionEl.style.whiteSpace = "nowrap";

  footerEl.appendChild(assigneeEl);
  footerEl.appendChild(regionEl);
  card.appendChild(footerEl);

  colEl.appendChild(card);

  // Update kanban column count
  const countEl = document.getElementById("kanban-count-" + targetCol);
  if (countEl) {
    countEl.textContent = String(colEl.children.length);
  }
}

/**
 * Reveal PII (Phone, Name, Address, Notes) via POST /api/v1/admin/leads/{id}/reveal
 */
async function revealLeadPhone(id, element) {
  try {
    if (!uuidPattern.test(id))
      throw new Error("Mã hồ sơ chưa hợp lệ để hiển thị thông tin.");
    const result = await crmRequest("/leads/" + id + "/reveal", "POST", {});
    if (element && result.phone) {
      element.textContent = result.phone;
      element.style.color = "#16A34A";
    }
    showToast("Đã hiển thị thông tin liên hệ.", "success");
    return result;
  } catch (error) {
    showToast(error.message, "error");
    return null;
  }
}

/**
 * State Transition
 */
async function transitionLead(
  id,
  expectedVersion,
  newStatus,
  reason = "",
  installation = null,
) {
  const body = {
    expected_version: expectedVersion,
    status: newStatus === "surveying" ? "survey" : newStatus,
    reason: reason || "",
    installation: installation || undefined,
  };
  return await crmRequest("/leads/" + id + "/transitions", "POST", body);
}

/**
 * Auto Assignment
 */
async function assignLead(id, expectedVersion) {
  return await crmRequest("/leads/" + id + "/assignments", "POST", {
    expected_version: expectedVersion,
  });
}

/**
 * Recompute Intelligence Scores
 */
async function recomputeLead(id) {
  return await crmRequest("/leads/" + id + "/recompute", "POST", {});
}

/**
 * Add Activity / Note
 */
async function saveLeadActivity(id, kind, notes, dueAt = null) {
  const body = {
    kind,
    notes,
    due_at: dueAt || undefined,
  };
  return await crmRequest("/leads/" + id + "/activities", "POST", body);
}

/**
 * Confirm Quote
 */
async function confirmLeadQuote(id, expectedVersion, quoteToken) {
  return await crmRequest("/leads/" + id + "/quotes/confirm", "POST", {
    expected_version: expectedVersion,
    quote_token: quoteToken,
  });
}

/**
 * Appointments
 */
async function loadLeadAppointments(id) {
  return await crmRequest("/leads/" + id + "/appointments", "GET");
}

async function createLeadAppointment(
  id,
  expectedVersion,
  dueAt,
  kind = "callback",
  notes = "",
) {
  return await crmRequest("/leads/" + id + "/appointments", "POST", {
    expected_version: expectedVersion,
    due_at: dueAt,
    kind,
    notes,
  });
}

// Initial Lead List Loader
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname === "/admin/leads") {
    const params = new URLSearchParams(window.location.search);
    const filter = document.getElementById("filter-status");
    const status = params.get("status");
    if (
      filter &&
      Array.from(filter.options).some((option) => option.value === status)
    )
      filter.value = status;
    const overdue = document.getElementById("filter-overdue");
    if (overdue) overdue.checked = params.get("overdue") === "true";
    loadCrmLeads(filter?.value === "all" ? null : filter?.value || null);
  }
});

function crmSelectVisible(checked = true) {
  if (!checked) crmSelectedLeads.clear();
  document.querySelectorAll("[data-crm-select]").forEach((input) => {
    if (input.getClientRects().length && !input.disabled) {
      input.checked = checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}
