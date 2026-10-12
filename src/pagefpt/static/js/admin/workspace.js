/** Typed admin forms use existing domain APIs. Never accept provider secrets in the browser. */
const WS_DEFINITIONS = {
  campaigns: {
    title: "Chiến dịch",
    kind: "campaign",
    permission: "marketing.write",
    path: "/campaigns",
    fields: [
      ["name", "Tên chiến dịch", "text", true],
      [
        "platform",
        "Nền tảng",
        "select",
        true,
        ["google", "meta", "tiktok", "zalo", "seo", "referral"],
      ],
      ["utm_campaign", "Mã UTM campaign", "text", true],
      ["branch_id", "Chi nhánh (tùy chọn)", "branch"],
    ],
    description:
      "Quản lý campaign và tạo liên kết UTM. Liên kết chỉ ghi attribution khi người dùng đồng ý analytics.",
  },
  experiments: {
    title: "Thử nghiệm A/B",
    kind: "experiment",
    permission: "marketing.write",
    path: "/experiments",
    fields: [
      ["name", "Tên thử nghiệm", "text", true],
      ["salt", "Khóa phân nhóm ổn định", "text", true],
    ],
    special: "variants",
    publish: true,
    description:
      "Tổng trọng số biến thể phải bằng 10.000 BPS (100%). Phân nhóm cần consent analytics; chưa có dữ liệu thì không suy đoán biến thể thắng.",
  },
  integrations: {
    title: "Tích hợp",
    kind: "integration",
    permission: "marketing.write",
    path: "/integrations",
    fields: [
      ["name", "Tên kết nối", "text", true],
      [
        "platform",
        "Nền tảng",
        "select",
        true,
        ["google", "meta", "tiktok", "notification"],
      ],
      ["enabled", "Bật tích hợp", "checkbox"],
      ["description", "Mô tả", "textarea"],
    ],
    description:
      "Credential và gateway được cấu hình phía server. Bật bản ghi không đồng nghĩa nhà cung cấp đã kết nối; xem Cài đặt để kiểm tra.",
  },
  costs: {
    title: "Chi phí",
    kind: "cost",
    permission: "marketing.write",
    path: "/costs",
    fields: [
      ["campaign_id", "Chiến dịch", "campaign", true],
      ["day", "Ngày chi phí (Việt Nam)", "date", true],
      ["cost_vnd", "Chi phí VND", "number", true],
    ],
    description:
      "Mỗi bản ghi là một khoản chi. Chỉnh sửa bản ghi nếu nhập sai; không nhập lặp lại cùng khoản chi. Báo cáo CPL chỉ có giá trị khi đã nhập đủ chi phí.",
  },
  pages: {
    title: "Landing page",
    kind: "page",
    permission: "content.write",
    path: "/pages",
    fields: [
      ["title", "Tiêu đề", "text", true],
      ["slug", "Đường dẫn (slug)", "text", true],
      ["description", "Mô tả tìm kiếm", "textarea"],
      ["canonical_path", "Canonical path (tùy chọn)", "text"],
    ],
    special: "blocks",
    publish: true,
    description:
      "Soạn nội dung bằng khối, lưu nháp trước khi công bố. Liên kết CTA có thể trỏ tới form liên hệ; lịch công bố cần worker đang chạy.",
  },
  promotions: {
    title: "Ưu đãi",
    kind: "promotion",
    permission: "catalog.write",
    path: "/promotions",
    fields: [
      ["name", "Tên ưu đãi", "text", true],
      ["discount_vnd", "Giảm giá VND", "number", true],
      ["priority", "Độ ưu tiên", "number", true],
      ["group", "Nhóm loại trừ", "text", true],
      ["start", "Bắt đầu (giờ Việt Nam)", "datetime-local", true],
      ["end", "Kết thúc (giờ Việt Nam)", "datetime-local", true],
    ],
    special: "scopes",
    publish: true,
    description:
      "Áp dụng theo gói và địa bàn, có thời hạn. Trong cùng nhóm chỉ chọn ưu đãi ưu tiên cao nhất; nháp chưa tác động báo giá.",
  },
  media: {
    title: "Hình ảnh",
    kind: "media",
    permission: "content.write",
    path: "/media",
    fields: [["file", "Ảnh JPEG / PNG / WebP ≤10 MB", "file", true]],
    description:
      "Tải lên R2 qua URL tạm thời, sau đó server kiểm tra ảnh và chuyển sang WebP. Chỉ ảnh có trạng thái ready mới dùng trong nội dung.",
  },
  jobs: {
    title: "Hàng đợi",
    permission: "workflow.manage",
    path: "/jobs",
    readonly: true,
    description:
      "100 công việc gần nhất. Chỉ retry công việc failed; worker tự retry theo backoff. Không đưa khóa worker ra trình duyệt.",
  },
  audit: {
    title: "Nhật ký",
    permission: "governance.audit",
    path: "/audit",
    readonly: true,
    description:
      "Nhật ký có phân quyền/MFA và phân trang tăng dần. Không ghi số điện thoại hoặc IP thô vào nhật ký quảng cáo.",
  },
  memberships: {
    title: "Nhân sự & Quyền",
    permission: "identity.manage",
    path: "/memberships",
    fields: [
      ["user_id", "User ID từ Supabase Auth", "text", true],
      ["display_name", "Tên hiển thị", "text"],
      ["branch_id", "Chi nhánh", "branch", true],
      ["capacity", "Sức chứa lead đang xử lý", "number", true],
      ["active", "Đang hoạt động", "checkbox"],
      ["shift_start", "Ca bắt đầu", "time", true],
      ["shift_end", "Ca kết thúc", "time", true],
    ],
    special: "permissions",
    description:
      "Thiết lập quyền cho tài khoản đã tồn tại trong Supabase Auth. Ca làm không phải trạng thái online; chủ cuối cùng và quyền vượt cấp được server bảo vệ.",
  },
  exports: {
    title: "Xuất dữ liệu",
    kind: "export",
    permission: "governance.export",
    path: "/exports",
    fields: [
      ["branch_id", "Chi nhánh (để trống = phạm vi được phép)", "branch"],
    ],
    description:
      "Yêu cầu CSV metadata theo scope, theo dõi trạng thái và tải khi complete. URL tải có thời hạn; R2 và worker phải được cấu hình.",
  },
  privacy: {
    title: "Yêu cầu dữ liệu",
    kind: "privacy",
    permission: "governance.write",
    path: "/privacy/requests",
    fields: [
      ["lead_id", "Mã hồ sơ từ CRM", "text", true],
      ["action", "Yêu cầu", "select", true, ["stop_marketing", "delete"]],
      ["reason", "Lý do", "textarea", true],
    ],
    description:
      "Ghi yêu cầu ngừng marketing hoặc xóa dữ liệu theo quyền/MFA. Thực thi là thao tác riêng có quyền governance.delete.",
  },
};
const WS_TABS = {
  marketing: ["campaigns", "experiments", "integrations", "costs"],
  content: ["pages", "promotions", "media"],
  operations: ["jobs", "audit", "memberships", "exports", "privacy"],
};
let workspaceTab = null,
  workspaceRows = [],
  workspaceNext = null,
  workspaceGeneration = 0,
  workspaceEditing = null;
let workspaceLookups = { campaigns: [], plans: [], regions: [], media: [] };
const WS_PERMISSION_NAMES = [
  "identity.manage",
  "catalog.write",
  "pricing.write",
  "pricing.publish",
  "content.write",
  "content.publish",
  "lead.read",
  "lead.write",
  "lead.all",
  "lead.assign",
  "lead.pii",
  "intelligence.write",
  "marketing.write",
  "care.write",
  "care.approve",
  "report.read",
  "governance.write",
  "governance.delete",
  "governance.export",
  "governance.audit",
  "workflow.manage",
];
function workspaceDefinition() {
  return WS_DEFINITIONS[workspaceTab];
}
function workspaceButton(text, action) {
  const node = adminNode("button", text, "btn-action-detail");
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
function workspaceDatetime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(" ", "T");
}
function workspaceUtc(value) {
  return value ? new Date(value + ":00+07:00").toISOString() : null;
}
function workspaceBranchOptions() {
  const seen = new Set();
  return window.adminPermissions
    .filter((m) => {
      if (seen.has(m.branch_id)) return false;
      seen.add(m.branch_id);
      return true;
    })
    .map((m) => ({
      id: m.branch_id,
      name:
        m.branch_id === "00000000-0000-0000-0000-000000000000"
          ? "Toàn hệ thống"
          : m.branch_id,
    }));
}
async function loadWorkspace(append = false) {
  const def = workspaceDefinition();
  if (!def) return;
  const generation = ++workspaceGeneration;
  const state = document.getElementById("workspace-state");
  state.textContent = "Đang tải…";
  document.getElementById("workspace-create").hidden = !!def.readonly;
  document.getElementById("workspace-more").disabled = true;
  try {
    let path = def.kind ? "/workspace/" + def.kind + "?limit=30" : def.path;
    if (append && workspaceNext != null)
      path +=
        (path.includes("?") ? "&" : "?") +
        (workspaceTab === "audit" ? "after=" : "before=") +
        encodeURIComponent(workspaceNext);
    const data = await crmRequest(path);
    if (generation !== workspaceGeneration) return;
    const rows = data.items || [];
    workspaceRows = append ? [...workspaceRows, ...rows] : rows;
    workspaceNext =
      data.next_before ??
      (workspaceTab === "audit" && rows.length === 100 ? rows.at(-1).id : null);
    renderWorkspaceRows();
    state.textContent = `${workspaceRows.length} bản ghi${workspaceNext != null ? " · Còn trang tiếp" : ""}`;
    document.getElementById("workspace-more").hidden = workspaceNext == null;
  } catch (error) {
    if (generation === workspaceGeneration) state.textContent = error.message;
  } finally {
    if (generation === workspaceGeneration)
      document.getElementById("workspace-more").disabled = false;
  }
}
function renderWorkspaceRows() {
  const container = document.getElementById("workspace-list");
  container.replaceChildren();
  if (!workspaceRows.length) {
    container.append(
      adminNode("p", "Chưa có dữ liệu trong phạm vi được phép."),
    );
    return;
  }
  const query =
    document
      .getElementById("workspace-search")
      ?.value.trim()
      .toLocaleLowerCase("vi") || "";
  for (const row of workspaceRows.filter((row) =>
    JSON.stringify(row).toLocaleLowerCase("vi").includes(query),
  )) {
    const def = workspaceDefinition(),
      payload = row.payload || {},
      card = adminNode("article", "", "workspace-item");
    container.dataset.bulkContainer = "workspace-" + workspaceTab;
    window.PageFPTAdminLists?.bindRow(card, {
      id: row.id || row.user_id,
      version: row.version,
      kind:
        def.readonly ||
        ["media", "exports", "privacy", "memberships"].includes(workspaceTab)
          ? "readonly"
          : def.path?.replace(/^\//, "") || workspaceTab,
      status: row.status || row.state,
      group: "workspace-" + workspaceTab,
    });
    card.append(
      adminNode(
        "h2",
        payload.name ||
          payload.title ||
          row.display_name ||
          row.kind ||
          row.action ||
          row.user_id ||
          row.id,
      ),
    );
    card.append(
      adminNode(
        "p",
        `${adminStatusLabel(row.state || row.status || "")} ${row.version ? "· Bản " + row.version : ""}`,
      ),
    );
    const details =
      workspaceTab === "jobs"
        ? {
            queue: row.queue,
            attempts: row.attempt,
            next_attempt_at: row.next_attempt_at,
            error: row.last_error,
          }
        : workspaceTab === "memberships"
          ? {
              branch_id: row.branch_id,
              capacity: row.capacity,
              active_leads: row.active_leads,
              active: row.active,
              shift: row.shift,
              permissions: row.permissions,
            }
          : workspaceTab === "audit"
            ? {
                actor_id: row.actor_id,
                branch_id: row.branch_id,
                created_at: row.created_at,
              }
            : Object.fromEntries(
                Object.entries(payload).filter(
                  ([key]) =>
                    ![
                      "salt",
                      "blocks",
                      "variants",
                      "object_key",
                      "quarantine_key",
                      "parts",
                      "name",
                      "title",
                    ].includes(key),
                ),
              );
    const technical = adminNode("details"),
      summary = adminNode("summary", "Thông tin chi tiết");
    technical.append(summary);
    const labels = {
      description: "Mô tả",
      slug: "Đường dẫn",
      platform: "Nền tảng",
      budget_vnd: "Ngân sách",
      discount_vnd: "Giảm giá",
      source: "Nguồn",
      amount_vnd: "Số tiền",
      next_attempt_at: "Lần thử tiếp",
      attempts: "Số lần thử",
      error: "Lỗi cuối",
      queue: "Hàng đợi",
      created_at: "Thời gian",
      capacity: "Sức chứa",
      active_leads: "Hồ sơ đang xử lý",
      active: "Đang hoạt động",
      permissions: "Quyền",
      shift: "Ca làm",
    };
    technical.append(
      adminNode("p", "Mã bản ghi: " + (row.id || row.user_id || "")),
    );
    for (const [key, value] of Object.entries(details))
      if (value != null)
        (labels[key] && typeof value !== "object" ? card : technical).append(
          adminNode(
            "p",
            `${labels[key] || key}: ${typeof value === "object" ? JSON.stringify(value) : /^(start|end|created_at|updated_at|due_at|next_attempt_at|expires_at)$/.test(key) ? PageFPTDates.format(value) : value}`,
          ),
        );
    card.append(technical);
    const actions = adminNode("div", "", "workspace-item-actions");
    if (
      !def.readonly &&
      !["media", "exports", "privacy"].includes(workspaceTab)
    )
      actions.append(workspaceButton("Sửa", () => openWorkspaceEditor(row)));
    if (
      def.path &&
      def.kind &&
      !["media", "exports", "privacy"].includes(workspaceTab)
    )
      actions.append(
        workspaceButton("Ngừng sử dụng", () => workspaceRetire(row)),
      );
    if (
      def.publish &&
      row.status !== "retired" &&
      adminHasPermission(
        workspaceTab === "pages"
          ? "content.publish"
          : workspaceTab === "experiments"
            ? "marketing.write"
            : "catalog.write",
      )
    )
      actions.append(workspaceButton("Công bố", () => workspacePublish(row)));
    if (workspaceTab === "pages" && adminHasPermission("content.publish"))
      actions.append(
        workspaceButton("Hẹn giờ công bố", () => workspaceSchedule(row)),
      );
    if (workspaceTab === "pages") {
      const link = adminNode("a", "Xem trước", "btn-action-detail");
      link.href = "/admin/pages/" + row.id + "/preview";
      link.target = "_blank";
      link.rel = "noopener";
      actions.append(link);
    }
    if (workspaceTab === "experiments")
      actions.append(
        workspaceButton("Kết quả A/B", async () => {
          try {
            const r = await adminFetch(
              "/api/v1/admin/experiments/" + row.id + "/results",
            );
            const d = await r.json();
            if (!r.ok) throw Error(d.error || "Chưa tải được kết quả");
            let result = card.querySelector("[data-experiment-results]");
            if (!result) {
              result = adminNode("section");
              result.dataset.experimentResults = "";
              card.append(result);
            }
            result.replaceChildren();
            for (const v of d.variants)
              result.append(
                adminNode(
                  "p",
                  `${v.name}: ${v.exposures} phiên · ${v.leads} yêu cầu tư vấn`,
                ),
              );
            result.append(adminNode("p", d.note));
          } catch (e) {
            document.getElementById("workspace-state").textContent = e.message;
          }
        }),
      );
    if (workspaceTab === "campaigns")
      actions.append(
        workspaceButton("Tạo liên kết UTM", () => workspaceUtm(row)),
      );
    if (workspaceTab === "jobs" && row.state === "failed")
      actions.append(
        workspaceButton("Retry công việc", () => workspaceReplay(row)),
      );
    if (workspaceTab === "exports")
      actions.append(
        workspaceButton("Kiểm tra / Tải kết quả", () =>
          workspaceExport(row, card),
        ),
      );
    if (
      workspaceTab === "privacy" &&
      adminHasPermission("governance.delete") &&
      row.status !== "complete"
    )
      actions.append(
        workspaceButton("Thực thi yêu cầu", () => workspacePrivacy(row)),
      );
    if (workspaceTab === "media" && payload.state === "quarantine")
      actions.append(
        workspaceButton("Kiểm tra ảnh đã tải", () =>
          workspaceFinalizeMedia(row),
        ),
      );
    if (workspaceTab === "media" && payload.url) {
      const link = adminNode("a", "Xem ảnh", "btn-action-detail");
      link.href = payload.url;
      link.target = "_blank";
      link.rel = "noopener";
      actions.append(link);
    }
    card.append(actions);
    container.append(card);
  }
}
async function workspaceMutation(action) {
  try {
    await action();
    showToast("Máy chủ đã xác nhận thay đổi.", "success");
    await loadWorkspace();
  } catch (error) {
    showToast(error.message, "error");
  }
}
async function workspaceRetire(row) {
  if (!(await adminConfirm("Ngừng sử dụng bản ghi này?"))) return;
  await workspaceMutation(() =>
    crmRequest(workspaceDefinition().path + "/" + row.id + "/retire", "POST", {
      expected_version: row.version,
    }),
  );
}
async function workspacePublish(row) {
  if (!(await adminConfirm("Công bố phiên bản này?"))) return;
  await workspaceMutation(() =>
    crmRequest(workspaceDefinition().path + "/" + row.id + "/publish", "POST", {
      expected_version: row.version,
    }),
  );
}
async function workspaceReplay(row) {
  if (!(await adminConfirm("Xếp hàng chạy lại công việc thất bại?"))) return;
  await workspaceMutation(() =>
    crmRequest("/jobs/" + row.id + "/replay", "POST", {}),
  );
}
async function workspacePrivacy(row) {
  if (
    !(await adminConfirm(
      "Thực thi yêu cầu dữ liệu này? Thao tác xóa sẽ không thể hoàn tác.",
      true,
    ))
  )
    return;
  await workspaceMutation(() =>
    crmRequest("/privacy/requests/" + row.id + "/execute", "POST", {}),
  );
}
async function workspaceFinalizeMedia(row) {
  await workspaceMutation(() =>
    crmRequest("/media/" + row.id + "/finalize", "POST", {}),
  );
}
async function workspaceExport(row, card) {
  try {
    const result = await crmRequest("/exports/" + row.id);
    const output = adminNode("div", "", "workspace-item-actions");
    output.append(adminNode("p", "Trạng thái: " + result.status));
    if (result.status === "complete")
      for (const [index, url] of (result.download_urls || []).entries()) {
        const link = adminNode(
          "a",
          `Tải CSV phần ${index + 1}`,
          "btn-action-detail",
        );
        link.href = url;
        link.rel = "noopener";
        output.append(link);
      }
    card.querySelector("[data-export-result]")?.remove();
    output.dataset.exportResult = "true";
    card.append(output);
  } catch (error) {
    showToast(error.message, "error");
  }
}
async function workspaceLoadLookup(kind) {
  const path =
    kind === "plans"
      ? "/plans?limit=100"
      : kind === "regions"
        ? "/locations?level=province&limit=100"
        : "/workspace/" +
          (kind === "campaigns" ? "campaign" : "media") +
          "?limit=100";
  let next = null,
    rows = [];
  do {
    const data = await crmRequest(
      path + (next ? "&before=" + encodeURIComponent(next) : ""),
    );
    rows.push(...(data.items || []));
    next = data.next_before || null;
  } while (next);
  workspaceLookups[kind] = rows;
  return rows;
}
function workspaceField(field, value) {
  const [key, title, type, required, options] = field;
  const label = adminNode("label", title + (required ? " *" : "")),
    id = "ws-" + key;
  let input;
  if (["select", "branch", "campaign"].includes(type)) {
    input = document.createElement("select");
    const values =
      type === "branch"
        ? workspaceBranchOptions()
        : type === "campaign"
          ? workspaceLookups.campaigns.map((row) => ({
              id: row.id,
              name: row.payload.name,
            }))
          : options.map((option) => ({ id: option, name: option }));
    const placeholder = adminNode(
      "option",
      required ? "Chọn " + title.toLocaleLowerCase("vi") : "Không chỉ định",
    );
    placeholder.value = "";
    input.append(placeholder);
    for (const v of values) {
      const option = adminNode("option", v.name);
      option.value = v.id;
      input.append(option);
    }
  } else if (type === "textarea") {
    input = document.createElement("textarea");
    input.rows = 3;
    input.maxLength = key === "description" ? 300 : 2000;
  } else {
    input = document.createElement("input");
    input.type = type === "branch" ? "text" : type;
  }
  input.id = id;
  input.name = key;
  input.required = !!required;
  label.htmlFor = id;
  if (type === "number") {
    input.min = key === "capacity" ? 1 : 0;
    input.max =
      key === "priority" ? 1000 : key === "capacity" ? 1000 : 100000000000;
    input.step = 1;
  }
  if (type === "file") input.accept = "image/jpeg,image/png,image/webp";
  if (key === "utm_campaign" || key === "slug") {
    input.pattern = key === "slug" ? "[a-z0-9-]+" : "[a-zA-Z0-9_-]+";
    input.maxLength = 100;
  }
  if (type === "checkbox") {
    input.checked = !!value;
    label.className = "admin-check";
  } else if (type === "datetime-local") input.value = workspaceDatetime(value);
  else if (type !== "file")
    input.value =
      value ??
      (key === "day"
        ? adminVietnamDay()
        : key === "group"
          ? "exclusive"
          : key === "capacity"
            ? 20
            : key === "priority"
              ? 100
              : key === "salt"
                ? Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
                    v.toString(16).padStart(2, "0"),
                  ).join("")
                : type === "number"
                  ? 0
                  : "");
  if (workspaceEditing && ["user_id", "branch_id"].includes(key))
    input.disabled = true;
  label.append(input);
  return label;
}
function workspaceChecks(container, name, options, selected = []) {
  for (const item of options) {
    const label = adminNode("label", item.name, "admin-check");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = item.id;
    input.checked = selected.includes(item.id);
    label.prepend(input);
    container.append(label);
  }
}
function workspaceRepeatRow(type, value = {}) {
  const container = adminNode("fieldset", "", "workspace-item");
  container.dataset.repeat = type;
  if (type === "variants") {
    for (const field of [
      ["name", "Tên biến thể", "text", true],
      ["weight", "Trọng số BPS", "number", true],
      ["cta_label", "Nhãn nút tư vấn (tối đa 24 ký tự)", "text", false],
    ]) {
      const label = workspaceField(field, value[field[0]]);
      label.querySelector("input").id = "";
      label.querySelector("input").name = "repeat-" + field[0];
      label.removeAttribute("for");
      container.append(label);
    }
  } else {
    for (const field of [
      [
        "type",
        "Loại khối",
        "select",
        true,
        ["heading", "text", "cta", "image", "pricing", "faq"],
      ],
      ["text", "Nội dung", "textarea"],
      ["url", "Liên kết (tùy chọn)", "text"],
      ["media_id", "Media ID (tùy chọn)", "text"],
    ]) {
      const label = workspaceField(field, value[field[0]]);
      const input = label.querySelector("input,select,textarea");
      input.id = "";
      input.name = "repeat-" + field[0];
      if (field[0] === "text") input.maxLength = 5000;
      label.removeAttribute("for");
      container.append(label);
    }
  }
  container.append(workspaceButton("Xóa dòng", () => container.remove()));
  return container;
}
async function openWorkspaceEditor(row = null) {
  if (workspaceTab === "pages" && row?.payload.template === "telecom") { location.href = "/admin/landing-pages?id=" + encodeURIComponent(row.id); return; }
  workspaceEditing = row;
  const def = workspaceDefinition(),
    payload = workspaceTab === "memberships" ? row || {} : row?.payload || {};
  const fields = document.getElementById("workspace-fields"),
    special = document.getElementById("workspace-special-fields");
  fields.replaceChildren();
  special.replaceChildren();
  document.getElementById("workspace-editor-error").textContent = "";
  document.getElementById("workspace-editor-title").textContent =
    (row ? "Sửa " : "Thêm ") + def.title;
  try {
    if (workspaceTab === "costs") await workspaceLoadLookup("campaigns");
    for (const field of def.fields || []) {
      let value = payload[field[0]];
      if (field[0] === "shift_start") value = payload.shift?.start || "08:00";
      if (field[0] === "shift_end") value = payload.shift?.end || "18:00";
      fields.append(workspaceField(field, value));
    }
    if (["variants", "blocks"].includes(def.special)) {
      const values =
        payload[def.special] ||
        (def.special === "variants"
          ? [
              { name: "A", weight: 5000 },
              { name: "B", weight: 5000 },
            ]
          : [
              { type: "heading", text: "" },
              { type: "cta", text: "Nhận tư vấn", url: "/#lead-form" },
            ]);
      const rows = adminNode("div", "", "workspace-list");
      rows.id = "workspace-repeat-rows";
      for (const value of values)
        rows.append(workspaceRepeatRow(def.special, value));
      special.append(
        rows,
        workspaceButton("Thêm dòng", () =>
          rows.append(workspaceRepeatRow(def.special)),
        ),
      );
    }
    if (def.special === "permissions") {
      special.append(adminNode("h3", "Quyền được cấp"));
      workspaceChecks(
        special,
        "permissions",
        WS_PERMISSION_NAMES.filter((permission) =>
          adminHasPermission(permission),
        ).map((id) => ({ id, name: id })),
        payload.permissions || [],
      );
      if (adminHasPermission("*"))
        workspaceChecks(
          special,
          "permissions",
          [{ id: "*", name: "Chủ hệ thống (*)" }],
          payload.permissions || [],
        );
      special.append(adminNode("h3", "Ngày làm việc"));
      workspaceChecks(
        special,
        "weekdays",
        [0, 1, 2, 3, 4, 5, 6].map((id) => ({
          id: String(id),
          name: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"][id],
        })),
        (payload.shift?.weekdays || [0, 1, 2, 3, 4, 5]).map(String),
      );
    }
    if (def.special === "scopes") {
      await workspaceLoadLookup("plans");
      await workspaceLoadLookup("regions");
      special.append(adminNode("h3", "Gói áp dụng (không chọn = mọi gói)"));
      workspaceChecks(
        special,
        "plan_ids",
        workspaceLookups.plans.map((item) => ({
          id: item.id,
          name: item.payload.name,
        })),
        payload.plan_ids || [],
      );
      special.append(
        adminNode("h3", "Địa bàn áp dụng (không chọn = mọi địa bàn)"),
      );
      const areas = adminNode("div", "", "workspace-list");
      for (const area of workspaceLookups.regions) {
        const group = adminNode("div", "", "workspace-item");
        workspaceChecks(
          group,
          "region_ids",
          [{ id: area.id, name: area.payload.name }],
          payload.region_ids || [],
        );
        const wards = adminNode("div", "", "admin-form-grid");
        let loaded = false;
        const button = workspaceButton("Chọn xã/phường", async () => {
          if (loaded) {
            wards.hidden = !wards.hidden;
            return;
          }
          button.disabled = true;
          try {
            let next = null,
              items = [];
            do {
              const data = await crmRequest(
                "/locations?level=ward&parent_id=" +
                  area.id +
                  "&limit=100" +
                  (next ? "&before=" + next : ""),
              );
              items.push(...data.items);
              next = data.next_before;
            } while (next);
            workspaceChecks(
              wards,
              "region_ids",
              items.map((item) => ({ id: item.id, name: item.payload.name })),
              payload.region_ids || [],
            );
            loaded = true;
          } catch (e) {
            showToast(e.message, "error");
          } finally {
            button.disabled = false;
          }
        });
        group.append(button, wards);
        areas.append(group);
      }
      special.append(areas);
      const selected = payload.region_ids || [],
        loadedIds = new Set(workspaceLookups.regions.map((area) => area.id));
      for (const id of selected)
        if (!loadedIds.has(id)) {
          const label = adminNode(
            "label",
            "Xã/phường đã chọn: " + id,
            "admin-check",
          );
          const input = document.createElement("input");
          input.type = "checkbox";
          input.name = "preserved_region_ids";
          input.value = id;
          input.checked = true;
          label.prepend(input);
          special.append(label);
        }
    }
    document.getElementById("workspace-editor").showModal();
  } catch (error) {
    showToast(error.message, "error");
  }
}
function workspacePayload() {
  const def = workspaceDefinition(),
    data = {};
  for (const [key, , type] of def.fields || []) {
    const input = document.getElementById("ws-" + key);
    data[key] =
      type === "checkbox"
        ? input.checked
        : type === "number"
          ? Number(input.value)
          : type === "datetime-local"
            ? workspaceUtc(input.value)
            : input.value || null;
  }
  if (def.special === "variants" || def.special === "blocks")
    data[def.special] = Array.from(
      document.querySelectorAll("[data-repeat]"),
      (row) => {
        const value = {};
        for (const input of row.querySelectorAll("input,select,textarea"))
          value[input.name.slice(7)] =
            input.type === "number" ? Number(input.value) : input.value || null;
        if (def.special === "blocks") value.text = value.text || "";
        return value;
      },
    );
  if (def.special === "permissions") {
    if (workspaceEditing?.version)
      data.expected_version = workspaceEditing.version;
    data.permissions = Array.from(
      document.querySelectorAll("[name=permissions]:checked"),
      (input) => input.value,
    );
    data.shift = {
      weekdays: Array.from(
        document.querySelectorAll("[name=weekdays]:checked"),
        (input) => Number(input.value),
      ),
      start: data.shift_start,
      end: data.shift_end,
    };
    delete data.shift_start;
    delete data.shift_end;
    data.display_name = data.display_name || "";
  }
  if (def.special === "scopes") {
    data.plan_ids = Array.from(
      document.querySelectorAll("[name=plan_ids]:checked"),
      (input) => input.value,
    );
    data.region_ids = Array.from(
      new Set(
        Array.from(
          document.querySelectorAll(
            "[name=region_ids]:checked,[name=preserved_region_ids]:checked",
          ),
          (input) => input.value,
        ),
      ),
    );
  }
  if (workspaceTab === "pages") {
    data.description = data.description || "";
    for (const block of data.blocks) if (!block.url) delete block.url;
  }
  if (workspaceTab === "integrations")
    data.description = data.description || "";
  if (workspaceTab === "exports") data.format = "csv";
  return data;
}
async function saveWorkspace(event) {
  event.preventDefault();
  const button = document.getElementById("workspace-save");
  button.disabled = true;
  try {
    const def = workspaceDefinition();
    if (workspaceTab === "media") await workspaceUpload();
    else {
      const data = workspacePayload();
      if (
        workspaceTab === "experiments" &&
        data.variants.reduce((sum, item) => sum + item.weight, 0) !== 10000
      )
        throw new Error("Tổng trọng số phải bằng 10.000 BPS.");
      if (workspaceTab === "memberships")
        await crmRequest(def.path, "PUT", data);
      else
        await crmRequest(
          def.path +
            (workspaceEditing
              ? "/" +
                workspaceEditing.id +
                "?expected_version=" +
                workspaceEditing.version
              : ""),
          workspaceEditing ? "PUT" : "POST",
          data,
        );
    }
    document.getElementById("workspace-editor").close();
    showToast("Máy chủ đã xác nhận lưu.", "success");
    await loadWorkspace();
  } catch (error) {
    document.getElementById("workspace-editor-error").textContent =
      error.message +
      (error.fields && Object.keys(error.fields).length
        ? " · " + Object.keys(error.fields).join(", ")
        : "");
  } finally {
    button.disabled = false;
  }
}
async function workspaceUpload() {
  const file = document.getElementById("ws-file").files[0];
  if (
    !file ||
    file.size > 10 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("Chọn ảnh JPEG, PNG hoặc WebP, tối đa 10 MB.");
  const intent = await crmRequest("/media/upload-intents", "POST", {
    filename: file.name,
    content_type: file.type,
    size_bytes: file.size,
  });
  const response = await fetch(intent.upload_url, {
    method: "PUT",
    headers: intent.headers,
    body: file,
  });
  if (!response.ok)
    throw new Error("R2 chưa nhận ảnh. Kiểm tra CORS của bucket và kết nối.");
  await crmRequest("/media/" + intent.id + "/finalize", "POST", {});
}
function workspaceUtility(title, fields, submit) {
  workspaceEditing = null;
  document.getElementById("workspace-editor-title").textContent = title;
  document
    .getElementById("workspace-fields")
    .replaceChildren(...fields.map((field) => workspaceField(field, "")));
  document.getElementById("workspace-special-fields").replaceChildren();
  document.getElementById("workspace-editor-error").textContent = "";
  const form = document.getElementById("workspace-form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = document.getElementById("workspace-save");
    button.disabled = true;
    try {
      await submit();
    } catch (e) {
      document.getElementById("workspace-editor-error").textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };
  document.getElementById("workspace-editor").showModal();
}
function workspaceSchedule(row) {
  workspaceUtility(
    "Hẹn giờ công bố",
    [["publish_at", "Thời điểm (Việt Nam)", "datetime-local", true]],
    async () => {
      await crmRequest("/pages/" + row.id + "/schedule", "POST", {
        expected_version: row.version,
        publish_at: workspaceUtc(
          document.getElementById("ws-publish_at").value,
        ),
      });
      document.getElementById("workspace-editor").close();
      showToast("Đã xếp lịch công bố.", "success");
    },
  );
}
function adminUtmUrl(base, campaign, medium) {
  const url = new URL(base, window.location.origin);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Đường dẫn phải là HTTP/HTTPS, không chứa tài khoản.");
  url.searchParams.set("utm_source", campaign.platform);
  url.searchParams.set("utm_medium", medium || "cpc");
  url.searchParams.set("utm_campaign", campaign.utm_campaign);
  return url.toString();
}
function workspaceUtm(row) {
  workspaceUtility(
    "Tạo liên kết UTM",
    [
      ["url", "URL trang đích", "url", true],
      ["medium", "UTM medium", "text", true],
    ],
    async () => {
      const url = adminUtmUrl(
        document.getElementById("ws-url").value,
        row.payload,
        document.getElementById("ws-medium").value,
      );
      let output = document.getElementById("utm-generated-url");
      if (!output) {
        output = adminNode("textarea", "");
        output.id = "utm-generated-url";
        output.readOnly = true;
        output.setAttribute("aria-label", "Liên kết UTM đã tạo");
        document.getElementById("workspace-special-fields").append(output);
      }
      output.value = url;
      await navigator.clipboard.writeText(url);
      showToast("Đã tạo và sao chép liên kết UTM.", "success");
    },
  );
  document.getElementById("ws-url").value = window.location.origin + "/";
  document.getElementById("ws-medium").value = "cpc";
}
function selectWorkspaceTab(tab) {
  if (
    !WS_TABS[window.adminWorkspace].includes(tab) ||
    !adminHasPermission(WS_DEFINITIONS[tab].permission)
  )
    return;
  workspaceTab = tab;
  workspaceNext = null;
  workspaceRows = [];
  document.getElementById("workspace-description").textContent =
    workspaceDefinition().description;
  for (const button of document.querySelectorAll("#workspace-tabs button"))
    button.setAttribute("aria-current", String(button.dataset.tab === tab));
  loadWorkspace();
}
document.addEventListener("DOMContentLoaded", () => {
  const tabs = WS_TABS[window.adminWorkspace].filter((tab) =>
    adminHasPermission(WS_DEFINITIONS[tab].permission),
  );
  for (const tab of tabs) {
    const button = workspaceButton(WS_DEFINITIONS[tab].title, () =>
      selectWorkspaceTab(tab),
    );
    button.dataset.tab = tab;
    document.getElementById("workspace-tabs").append(button);
  }
  document.getElementById("workspace-refresh").onclick = () => loadWorkspace();
  document.getElementById("workspace-more").onclick = () => loadWorkspace(true);
  document.getElementById("workspace-create").onclick = () => {
    document.getElementById("workspace-form").onsubmit = saveWorkspace;
    openWorkspaceEditor();
  };
  document.getElementById("workspace-cancel").onclick = () =>
    document.getElementById("workspace-editor").close();
  document.getElementById("workspace-form").onsubmit = saveWorkspace;
  document
    .getElementById("workspace-editor")
    .addEventListener(
      "close",
      () =>
        (document.getElementById("workspace-form").onsubmit = saveWorkspace),
    );
  const desired = new URLSearchParams(window.location.search).get("tab");
  selectWorkspaceTab(tabs.includes(desired) ? desired : tabs[0]);
});

document.addEventListener("admin:data-changed", () => {
  if (!document.getElementById("workspace-editor").open) loadWorkspace();
});

document
  .getElementById("workspace-search")
  ?.addEventListener("input", renderWorkspaceRows);

window.addEventListener("pagefpt-admin-bulk-complete", () => loadWorkspace());
