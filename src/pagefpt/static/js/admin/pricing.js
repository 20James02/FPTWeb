/* Named geographic scopes; server-enforced CAS and immutable published prices. */
const PRICING_ZERO = "00000000-0000-0000-0000-000000000000";
let availablePlans = [],
  pricingProvinces = [],
  pricingRows = [],
  pricingCursor = null,
  pricingView = "prices";
const pricingResolvedLocations = new Map();
let pricingWards = new Map(),
  pricingIdentity = null,
  editingPrice = null,
  editingPlan = null,
  editingLocation = null;
let pricePicker = null,
  planPicker = null,
  lastCsvApprovalToken = null,
  lastCsvText = "",
  pricingLoadGeneration = 0;
const moneyFormat = new Intl.NumberFormat("vi-VN");
const $p = (id) => document.getElementById(id);
const pricingStatusLabel = (s) =>
  ({ draft: "Bản nháp", published: "Đã công bố", retired: "Đã ngừng" })[s] || s;
const pricingServiceLabel = (s) =>
  ({
    internet: "Internet",
    combo: "Combo",
    camera: "Camera",
    business: "Doanh nghiệp",
    play: "Truyền hình",
  })[s] || s;
function pricingNode(tag, text = "", className = "") {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
function pricingButton(text, action, className = "pricing-btn") {
  const button = pricingNode("button", text, className);
  button.type = "button";
  button.onclick = action;
  return button;
}
function pricingError(id, error) {
  const box = $p(id);
  box.hidden = false;
  box.textContent = error.message || String(error);
  if (error.code === "INVALID_PLAN")
    box.append(
      pricingButton("Mở mục Gói cước", () => {
        const dialog = box.closest("dialog");
        if (dialog?.open) dialog.close();
        pricingShowPlan();
      }),
    );
  box.focus?.();
}
function pricingShowPlan(id) {
  $p("pricing-status").value = "";
  $p("pricing-search").value = "";
  pricingTab("plans");
  const row = id && $p("plans-list").querySelector(`[data-plan-id="${id}"]`);
  if (row) {
    row.scrollIntoView({ block: "center", behavior: "instant" });
    row.querySelector("button")?.focus();
  }
}
function pricingClearError(id) {
  $p(id).hidden = true;
  $p(id).textContent = "";
}
async function pricingApi(path, method = "GET", body, timeout = 12000) {
  const response = await adminFetch(path, {
    method,
    signal: AbortSignal.timeout(timeout),
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = {
      GEOGRAPHY_SCOPE_CONFLICT:
        "Địa bàn đã thuộc chi nhánh khác hoặc có liên kết cần kiểm tra. Giữ chi nhánh đã đồng bộ trước đó.",
      INVALID_PROVINCE_CODE:
        "Mã tỉnh không còn trong nguồn API. Tải lại danh mục để chọn lại.",
      PRICE_OVERLAP:
        "Đã có giá công bố trùng địa bàn, kỳ thanh toán và thời gian. Sửa giá hiện tại hoặc đổi thời gian.",
      VERSION_CONFLICT:
        "Dữ liệu đã thay đổi. Đóng form và làm mới trước khi sửa.",
      PERMISSION_DENIED:
        "Thiếu quyền hoặc xác thực MFA. Vui lòng kiểm tra tài khoản.",
      INVALID_PARENT: "Tỉnh trực thuộc phải hợp lệ và cùng chi nhánh.",
      REGION_HAS_CHILDREN:
        "Cần ngừng các xã/phường trực thuộc trước khi ngừng tỉnh.",
      INVALID_REGION: "Địa bàn chưa được công bố, đã ngừng hoặc không tồn tại.",
      INVALID_PLAN:
        "Cần công bố gói cước trước khi công bố bảng giá. Mở mục Gói cước, chọn Công bố, rồi quay lại Bảng giá. Gói đã ngừng cần chọn gói khác.",
      INVALID_PLAN_IMAGE:
        "Ảnh chưa xử lý xong hoặc đã ngừng sử dụng. Hãy chọn ảnh khác.",
      INVALID_REPLACEMENT_START:
        "Ngày bắt đầu giá mới phải nằm trong khoảng hiệu lực giá đang sửa.",
      PUBLISHED_PRICE_IMMUTABLE: "Giá đã công bố cần tạo phiên bản thay thế.",
      IMMUTABLE_SCOPE:
        "Cấp địa bàn, tỉnh trực thuộc hoặc phạm vi giá không được thay đổi.",
    }[data.code];
    const error = new Error(
      message ||
        (data.code === "VALIDATION_ERROR"
          ? "Thông tin chưa hợp lệ: " +
            Object.keys(data.fields || {}).join(", ")
          : "Không thể lưu dữ liệu (" + (data.code || response.status) + ")."),
    );
    error.code = data.code;
    throw error;
  }
  return data;
}
async function pricingAllPages(path) {
  let rows = [],
    cursor = null;
  do {
    const data = await pricingApi(
      path +
        (path.includes("?") ? "&" : "?") +
        "limit=100" +
        (cursor ? "&before=" + encodeURIComponent(cursor) : ""),
    );
    rows.push(...data.items);
    cursor = data.next_cursor || null;
  } while (cursor);
  return rows;
}
async function loadPricesList() {
  const generation = ++pricingLoadGeneration;
  pricingClearError("pricing-page-error");
  $p("prices-count-badge").textContent = "Đang tải…";
  try {
    const [plans, provinces, prices, identity] = await Promise.all([
      pricingAllPages("/api/v1/admin/plans"),
      pricingAllPages("/api/v1/admin/locations?level=province"),
      pricingApi("/api/v1/admin/prices?limit=100"),
      pricingApi("/api/v1/admin/me"),
    ]);
    if (generation !== pricingLoadGeneration) return;
    availablePlans = plans;
    pricingProvinces = provinces;
    pricingRows = prices.items;
    pricingCursor = pricingRows.length === 100 ? pricingRows.at(-1).id : null;
    pricingIdentity = identity;
    pricingWards.clear();
    pricingResolvedLocations.clear();
    resolvingPricingLocations.clear();
    fillProvinceSelect("location-province-filter", true);
    renderPricing();
  } catch (e) {
    if (generation === pricingLoadGeneration)
      pricingError("pricing-page-error", e);
  }
}
async function loadMorePrices() {
  const button = $p("pricing-load-more");
  button.disabled = true;
  try {
    const data = await pricingApi(
      "/api/v1/admin/prices?limit=100&before=" + pricingCursor,
    );
    const seen = new Set(pricingRows.map((p) => p.id));
    pricingRows.push(...data.items.filter((p) => !seen.has(p.id)));
    pricingCursor = data.items.length === 100 ? data.items.at(-1).id : null;
    renderPricing();
  } catch (e) {
    pricingError("pricing-page-error", e);
  } finally {
    button.disabled = false;
  }
}
function pricingTab(view) {
  pricingView = view;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === view);
    b.setAttribute("aria-current", b.dataset.tab === view ? "page" : "false");
  });
  ["prices", "plans", "locations"].forEach(
    (v) => ($p("pricing-" + v).hidden = v !== view),
  );
  $p("pricing-add").textContent = {
    prices: "+ Thêm giá mới",
    plans: "+ Thêm gói cước",
    locations: "+ Thêm địa bàn",
  }[view];
  renderPricing();
}
function pricingAdd() {
  if (pricingView === "plans") openPlanDialog();
  else if (pricingView === "locations") openLocationDialog();
  else openCreatePriceModal();
}
function pricingFilter(row, text) {
  const status = $p("pricing-status").value;
  return (
    (status === "all" ||
      (status ? row.status === status : row.status !== "retired")) &&
    text
      .toLocaleLowerCase("vi")
      .includes($p("pricing-search").value.trim().toLocaleLowerCase("vi"))
  );
}
function pricingPlanName(id) {
  return (
    availablePlans.find((p) => p.id === id)?.payload.name ||
    "Gói ngoài danh mục truy cập"
  );
}
function pricingLocation(id) {
  return (
    pricingResolvedLocations.get(id) ||
    pricingProvinces.find((r) => r.id === id) ||
    Array.from(pricingWards.values())
      .flat()
      .find((r) => r.id === id)
  );
}
function pricingScopeName(row) {
  if (row.scope_label) return row.scope_label;
  if (row.scope_kind === "default") return "Giá mặc định";
  if (row.scope_kind === "group") return "Nhóm giá";
  const r = pricingLocation(row.scope_id);
  return r
    ? r.payload.level === "ward"
      ? r.payload.name +
        " · " +
        (pricingLocation(r.payload.parent_id)?.payload.name || "Xã/phường")
      : r.payload.name
    : "Địa bàn đã cấu hình";
}
function pricingStatus(row) {
  return pricingNode(
    "span",
    pricingStatusLabel(row.status),
    "pricing-status " + row.status,
  );
}
function renderPricing() {
  const body = $p("prices-tbody");
  body.dataset.bulkContainer = "prices";
  body.replaceChildren();
  const retiredPlans = new Set(
    availablePlans.filter((p) => p.status === "retired").map((p) => p.id),
  );
  const filtered = pricingRows.filter((p) => {
    const effectiveStatus = retiredPlans.has(p.plan_id) ? "retired" : p.status;
    return pricingFilter(
      { ...p, status: effectiveStatus },
      pricingPlanName(p.plan_id) + " " + pricingScopeName(p),
    );
  });
  for (const row of filtered) {
    const tr = document.createElement("tr");
    tr.dataset.priceId = row.id;
    window.PageFPTAdminLists?.bindRow(tr, {
      id: row.id,
      version: row.version,
      kind: "prices",
      status: row.status,
      planStopped: retiredPlans.has(row.plan_id),
      group: "prices",
    });
    body.dataset.bulkContainer = "prices";
    const name = pricingNode("td");
    name.append(
      pricingNode("strong", pricingPlanName(row.plan_id)),
      pricingNode("span", pricingScopeName(row), "pricing-sub"),
    );
    const monthly = pricingNode(
      "td",
      moneyFormat.format(
        Math.round(row.monthly_vnd * Number(row.monthly_coefficient ?? 1)),
      ) + " ₫",
    );
    monthly.append(
      pricingNode(
        "span",
        `Bình quân hiển thị ${moneyFormat.format(row.display_monthly_vnd ?? Math.round(row.monthly_vnd * Number(row.monthly_coefficient ?? 1)))}đ/tháng`,
        "pricing-sub",
      ),
    );
    monthly.append(
      pricingNode(
        "span",
        "Hòa mạng " +
          moneyFormat.format(row.setup_vnd) +
          " · Thiết bị " +
          moneyFormat.format(row.equipment_vnd),
        "pricing-sub",
      ),
    );
    const term = pricingNode("td", row.billing_months + " tháng");
    term.append(
      pricingNode(
        "span",
        (row.vat_included ? "Đã gồm" : "Chưa gồm") +
          " VAT " +
          row.vat_bps / 100 +
          "%",
        "pricing-sub",
      ),
    );
    const effectiveDates = pricingNode(
      "td",
      PageFPTDates.format(row.start || parseEffective(row.effective)[0]),
    );
    effectiveDates.append(
      pricingNode(
        "span",
        row.end
          ? "Đến " + PageFPTDates.format(row.end)
          : "Chưa có ngày kết thúc",
        "pricing-sub",
      ),
    );
    const status = pricingNode("td");
    status.append(
      pricingStatus(row),
      pricingNode("span", "Phiên bản " + row.version, "pricing-sub"),
    );
    if (retiredPlans.has(row.plan_id))
      status.append(
        pricingNode("span", "Gói đã ngừng cung cấp", "pricing-sub"),
      );
    const actions = pricingNode("td");
    const group = pricingNode("div", "", "pricing-actions");
    if (row.status !== "retired" && !retiredPlans.has(row.plan_id)) {
      group.append(
        pricingButton("Nhân bản", () => openCreatePriceModal(row, true)),
      );
      group.append(
        pricingButton(
          row.status === "published" ? "Sửa / thay giá" : "Sửa",
          () => openCreatePriceModal(row),
        ),
      );
      if (row.status === "draft")
        group.append(
          availablePlans.find((p) => p.id === row.plan_id)?.status === "draft"
            ? pricingButton("Công bố gói trước", () =>
                pricingShowPlan(row.plan_id),
              )
            : pricingButton("Công bố", () =>
                publishPriceRecord(row.id, row.version),
              ),
        );
      group.append(
        pricingButton("Ngừng", () => confirmPricingRetire("prices", row)),
      );
    }
    actions.append(group);
    tr.append(name, monthly, term, effectiveDates, status, actions);
    body.append(tr);
  }
  if (!filtered.length) {
    const td = pricingNode(
      "td",
      "Chưa có bản ghi phù hợp. Thêm giá mới hoặc đổi bộ lọc.",
      "pricing-empty",
    );
    td.colSpan = body.closest("table").tHead?.rows[0]?.cells.length || 6;
    const tr = pricingNode("tr");
    tr.append(td);
    body.append(tr);
  }
  $p("prices-count-badge").textContent = filtered.length + " bản ghi";
  $p("pricing-load-more").hidden = !pricingCursor;
  const plans = $p("plans-list");
  plans.dataset.bulkContainer = "plans";
  plans.replaceChildren();
  for (const row of availablePlans.filter((p) =>
    pricingFilter(p, p.payload.name),
  )) {
    const info = pricingNode("div");
    info.append(
      pricingNode("strong", row.payload.name),
      pricingNode(
        "span",
        pricingServiceLabel(row.payload.service) +
          (row.payload.speed_mbps
            ? " · " + row.payload.speed_mbps + " Mbps"
            : "") +
          " · " +
          planLocationSummary(row),
        "pricing-sub",
      ),
      pricingStatus(row),
    );
    if (row.status === "published" && row.version !== row.published_version)
      info.append(
        pricingNode("span", "Có thay đổi chưa công bố", "pricing-sub"),
      );
    const buttons = pricingNode("div", "", "pricing-actions");
    if (row.status !== "retired") {
      buttons.append(
        pricingButton("Sửa", () => openPlanDialog(row)),
        pricingButton("Công bố", () => publishResource("plans", row)),
        pricingButton("Ngừng cung cấp", () =>
          confirmPricingRetire("plans", row),
        ),
      );
    }
    const item = pricingNode("div", "", "pricing-list-row");
    item.dataset.planId = row.id;
    window.PageFPTAdminLists?.bindRow(item, {
      id: row.id,
      version: row.version,
      kind: "plans",
      status: row.status,
      group: "plans",
      publishedVersion: row.published_version,
    });
    plans.dataset.bulkContainer = "plans";
    item.append(info, buttons);
    plans.append(item);
  }
  if (!plans.children.length)
    plans.append(
      pricingNode("p", "Chưa có gói cước phù hợp.", "pricing-empty"),
    );
  renderLocations();
  window.PageFPTAdminLists?.retainSelection(
    "prices",
    filtered.map((row) => row.id),
  );
  window.PageFPTAdminLists?.retainSelection(
    "plans",
    [...plans.querySelectorAll("[data-plan-id]")].map(
      (row) => row.dataset.planId,
    ),
  );
  window.PageFPTAdminLists?.enhance();
  // Resolve scoped names lazily only for prices actually in the loaded page.
  const unresolved = new Set(
    pricingRows
      .filter(
        (p) =>
          p.scope_kind === "region" &&
          !p.scope_label &&
          !pricingLocation(p.scope_id),
      )
      .map((p) => p.scope_id),
  );
  for (const id of unresolved) resolvePricingLocation(id);
}
const resolvingPricingLocations = new Set();
async function resolvePricingLocation(id) {
  if (resolvingPricingLocations.has(id)) return;
  resolvingPricingLocations.add(id);
  const generation = pricingLoadGeneration;
  try {
    const row = await pricingApi("/api/v1/admin/regions/" + id);
    if (generation !== pricingLoadGeneration) return;
    pricingResolvedLocations.set(id, row);
    renderPricing();
  } catch (_) {
    /* Keep a safe generic label when scope access is unavailable. */
  }
}

function planLocationSummary(row) {
  const ids = row.payload.applicable_region_ids || [];
  if (!ids.length) return "Mọi địa bàn";
  return ids
    .map((id) => pricingLocation(id)?.payload.name || "Địa bàn đã chọn")
    .join(", ");
}
function fillProvinceSelect(id, empty = false) {
  const select = $p(id),
    value = select.value;
  select.replaceChildren();
  if (empty) select.append(new Option("Tất cả tỉnh/thành", ""));
  for (const r of pricingProvinces
    .filter((r) => r.status !== "retired")
    .sort((a, b) => a.payload.name.localeCompare(b.payload.name, "vi")))
    select.append(new Option(r.payload.name, r.id));
  if (Array.from(select.options).some((o) => o.value === value))
    select.value = value;
}
async function getPricingWards(parent) {
  if (!pricingWards.has(parent)) {
    const rows = await pricingAllPages(
      "/api/v1/admin/locations?level=ward&parent_id=" + parent,
    );
    pricingWards.set(parent, rows);
  }
  return pricingWards.get(parent);
}
async function loadLocationWards() {
  try {
    if ($p("location-province-filter").value)
      await getPricingWards($p("location-province-filter").value);
    renderPricing();
  } catch (e) {
    pricingError("pricing-page-error", e);
  }
}
function renderLocations() {
  const root = $p("locations-list");
  root.replaceChildren();
  root.dataset.bulkContainer = "regions";
  const parent = $p("location-province-filter").value;
  const rows = parent ? pricingWards.get(parent) || [] : pricingProvinces;
  for (const row of rows.filter((r) => pricingFilter(r, r.payload.name))) {
    const item = pricingNode("div", "", "pricing-list-row"),
      info = pricingNode("div");
    window.PageFPTAdminLists?.bindRow(item, {
      id: row.id,
      version: row.version,
      kind: "regions",
      status: row.status,
      group: "regions",
    });
    info.append(
      pricingNode("strong", row.payload.name),
      pricingNode(
        "span",
        (row.payload.level === "ward" ? "Xã/phường" : "Tỉnh/thành") +
          " · Mã " +
          row.payload.code,
        "pricing-sub",
      ),
      pricingStatus(row),
    );
    const actions = pricingNode("div", "", "pricing-actions");
    if (row.status !== "retired") {
      actions.append(
        pricingButton("Sửa", () => openLocationDialog(row)),
        pricingButton("Công bố", () => publishResource("regions", row)),
        pricingButton("Ngừng", () => confirmPricingRetire("regions", row)),
      );
      if (row.payload.level !== "ward")
        actions.append(
          pricingButton("Xem xã/phường", () => {
            $p("location-province-filter").value = row.id;
            loadLocationWards();
          }),
        );
    }
    item.append(info, actions);
    root.append(item);
  }
  if (!root.children.length)
    root.append(
      pricingNode(
        "p",
        parent
          ? "Chưa có xã/phường. Chọn Thêm địa bàn để cấu hình."
          : "Chưa có tỉnh/thành phù hợp.",
        "pricing-empty",
      ),
    );
}
class PricingLocationPicker {
  constructor(root, selected = []) {
    this.root = root;
    this.selected = new Set(selected);
    this.generation = 0;
    this.render();
  }
  render() {
    const root = this.root;
    root.replaceChildren();
    root.classList.add("location-picker");
    const label = pricingNode("label", "Tìm tỉnh/thành");
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Nhập tên tỉnh/thành…";
    label.append(search);
    const tools = pricingNode("div", "", "location-picker-tools");
    this.count = pricingNode("span", "", "location-picker-count");
    tools.append(
      pricingButton("Chọn các tỉnh đang hiển thị", () => {
        for (const item of this.list.children)
          if (!item.hidden) this.selected.add(item.dataset.id);
        this.sync();
      }),
      pricingButton("Bỏ chọn tất cả", () => {
        this.selected.clear();
        this.sync();
      }),
      this.count,
    );
    this.selectionBar = pricingNode("div", "", "location-picker-tools");
    this.list = pricingNode("div", "", "location-picker-list");
    root.append(label, tools, this.selectionBar, this.list);
    for (const province of pricingProvinces
      .filter((r) => r.status === "published")
      .sort((a, b) => a.payload.name.localeCompare(b.payload.name, "vi"))) {
      const item = pricingNode("div", "", "location-picker-item");
      item.dataset.id = province.id;
      item.dataset.name = province.payload.name.toLocaleLowerCase("vi");
      const head = pricingNode("div"),
        checkbox = this.checkbox(province);
      const children = pricingNode("div", "", "location-picker-wards");
      children.hidden = true;
      head.append(
        checkbox,
        pricingButton("Xã/phường", async () => {
          if (!children.hidden) {
            children.hidden = true;
            return;
          }
          children.hidden = false;
          children.replaceChildren(
            pricingNode("p", "Đang tải…", "pricing-hint"),
          );
          try {
            const rows = await getPricingWards(province.id);
            children.replaceChildren();
            const wardSearch = pricingNode("input");
            wardSearch.type = "search";
            wardSearch.setAttribute(
              "aria-label",
              "Tìm xã/phường của " + province.payload.name,
            );
            wardSearch.placeholder = "Tìm xã/phường…";
            children.append(wardSearch);
            const wardList = pricingNode("div");
            for (const row of rows.filter((r) => r.status === "published"))
              wardList.append(this.checkbox(row));
            children.append(wardList);
            wardSearch.oninput = () => {
              for (const l of wardList.children)
                l.hidden = !l.textContent
                  .toLocaleLowerCase("vi")
                  .includes(wardSearch.value.toLocaleLowerCase("vi"));
            };
            if (!wardList.children.length)
              children.append(
                pricingNode(
                  "p",
                  "Chưa có xã/phường được công bố.",
                  "pricing-hint",
                ),
              );
            this.sync();
          } catch (e) {
            children.replaceChildren(
              pricingNode("p", e.message, "pricing-error"),
            );
          }
        }),
      );
      item.append(head, children);
      this.list.append(item);
    }
    search.oninput = () => {
      for (const item of this.list.children)
        item.hidden = !item.dataset.name.includes(
          search.value.toLocaleLowerCase("vi"),
        );
    };
    this.sync();
    if (!this.list.children.length)
      this.list.append(
        pricingNode(
          "p",
          "Chưa có địa bàn đã công bố. Cấu hình tại tab Địa bàn.",
          "pricing-hint",
        ),
      );
    // Previously selected wards remain visible when editing; no silent loss of scoped IDs.
    for (const id of this.selected)
      if (!pricingProvinces.some((p) => p.id === id))
        resolvePricingLocation(id).then(() => this.sync());
  }
  checkbox(row) {
    const label = pricingNode("label", "", "pricing-check"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.value = row.id;
    input.checked = this.selected.has(row.id);
    input.onchange = () => {
      if (input.checked) this.selected.add(row.id);
      else this.selected.delete(row.id);
      this.sync();
    };
    label.append(input, document.createTextNode(row.payload.name));
    return label;
  }
  sync() {
    for (const input of this.root.querySelectorAll("input[type=checkbox]"))
      input.checked = this.selected.has(input.value);
    this.count.textContent = this.selected.size + " địa bàn đã chọn";
    this.selectionBar.replaceChildren();
    for (const id of this.selected) {
      const row = pricingLocation(id);
      this.selectionBar.append(
        pricingButton((row?.payload.name || "Địa bàn đã chọn") + " ×", () => {
          this.selected.delete(id);
          this.sync();
        }),
      );
    }
  }
}
function openPricingDialog(id) {
  const dialog = $p(id);
  dialog.returnValue = "";
  dialog.showModal();
}
function closePricingDialog(id) {
  $p(id).close();
}
function parseEffective(value) {
  if (!value) return [null, null];
  const [start, end] = value.slice(1, -1).split(",");
  return [start.replaceAll('"', ""), end.replaceAll('"', "") || null];
}
function pricingLocalDate(value) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
}
function pricingMoney(id) {
  const raw = $p(id).value.replaceAll(/[.\s,]/g, "");
  if (!/^\d+$/.test(raw))
    throw new Error("Cước và phí phải là số nguyên VND không âm.");
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n > 1e9)
    throw new Error("Cước/phí tối đa 1.000.000.000 VND.");
  return n;
}
function openCreatePriceModal(row = null, clone = false) {
  return window.PageFPTPriceMatrix.open(row, clone);
}
function closeCreatePriceModal() {
  closePricingDialog("create-price-backdrop");
}
function onScopeKindChange(value) {
  $p("price-location-picker").hidden = value !== "region" || !!editingPrice;
  $p("price-scope-summary").textContent = editingPrice
    ? pricingScopeName(editingPrice)
    : value === "region"
      ? "Chọn các tỉnh/thành hoặc xã/phường cùng dùng mức giá bên dưới."
      : "Giá mặc định cho địa bàn chưa có giá riêng, trong phạm vi gói áp dụng.";
}
function formatPricingMoney() {
  for (const input of document.querySelectorAll("[data-money]")) {
    const raw = input.value.replaceAll(/[.\s,]/g, "");
    if (/^\d+$/.test(raw)) input.value = moneyFormat.format(Number(raw));
    const note = document.querySelector(
      '[data-money-preview="' + input.id + '"]',
    );
    if (note) note.textContent = raw ? input.value + " VND / tháng" : "";
  }
}
async function handleCreatePriceSubmit(event) {
  return window.PageFPTPriceMatrix.save(event);
}
async function publishPriceRecord(id, version) {
  try {
    await pricingApi("/api/v1/admin/prices/" + id + "/publish", "POST", {
      expected_version: version,
    });
    showToast("Đã công bố giá.", "success");
    await loadPricesList();
  } catch (e) {
    pricingError("pricing-page-error", e);
  }
}
let planImageAssets = new Map(),
  planImageGeneration = 0,
  planImageUploading = false;
function openPlanDialog(row = null) {
  editingPlan = row;
  const generation = ++planImageGeneration;
  planImageUploading = false;
  setPlanImageBusy(false);
  $p("plan-form").reset();
  $p("plan-submit").disabled = false;
  $p("plan-image-alt").value = row?.payload.image_alt || "";
  planImageAssets.clear();
  $p("plan-image-id").replaceChildren(new Option("Không sử dụng ảnh", ""));
  if (row?.payload.image_id)
    addPlanImage({ id: row.payload.image_id, payload: row.payload });
  $p("plan-image-id").value = row?.payload.image_id || "";
  previewPlanImage();
  loadPlanImages(generation);
  pricingClearError("plan-error");
  $p("plan-dialog-title").textContent = row ? "Sửa gói cước" : "Thêm gói cước";
  if (row) {
    for (const [id, key] of [
      ["plan-name", "name"],
      ["plan-code", "code"],
      ["plan-service", "service"],
      ["plan-speed", "speed_mbps"],
      ["plan-upload-speed", "upload_speed_mbps"],
      ["plan-description", "description"],
    ])
      $p(id).value = row.payload[key] ?? "";
    $p("plan-equipment").value = (row.payload.equipment || []).join("\n");
  }
  for (const [key, value] of Object.entries({
    badge: "Gói đang cung cấp",
    speed: "Tốc độ",
    offers: "Ưu đãi đi kèm",
    equipment: "Thiết bị",
    register: "Đăng ký gói",
    details: "Chi tiết gói",
  }))
    $p("plan-label-" + key).value = row?.payload.card_labels?.[key] ?? value;
  previewPlanCard();
  $p("plan-all-locations").checked =
    !row?.payload.applicable_region_ids?.length;
  $p("plan-location-picker").hidden = $p("plan-all-locations").checked;
  planPicker = new PricingLocationPicker(
    $p("plan-location-picker"),
    row?.payload.applicable_region_ids || [],
  );
  openPricingDialog("plan-dialog");
}
function addPlanImage(row) {
  const payload = row.payload;
  if (!planImageAssets.has(row.id)) {
    $p("plan-image-id").append(
      new Option(
        payload.filename ||
          payload.image_alt ||
          "Ảnh " +
            (payload.width || payload.image_width || "") +
            " × " +
            (payload.height || payload.image_height || "") +
            " · " +
            row.id.slice(0, 8),
        row.id,
      ),
    );
  }
  planImageAssets.set(row.id, payload);
}
async function loadPlanImages(generation) {
  $p("plan-image-status").textContent = "Đang tải thư viện ảnh…";
  try {
    const data = await pricingApi("/api/v1/admin/workspace/media?limit=100");
    if (generation !== planImageGeneration) return;
    for (const row of data.items)
      if (row.status !== "retired" && row.payload.state === "ready")
        addPlanImage(row);
    $p("plan-image-status").textContent =
      "Chọn trong 100 ảnh gần nhất hoặc tải ảnh mới (JPEG, PNG, WebP ≤10 MB).";
  } catch (e) {
    if (generation === planImageGeneration)
      $p("plan-image-status").textContent =
        "Chưa tải được thư viện ảnh: " + e.message;
  }
}
function previewPlanImage() {
  const payload = planImageAssets.get($p("plan-image-id").value);
  const preview = $p("plan-image-preview");
  const url = payload?.image_url || payload?.url;
  preview.hidden = !url;
  if (url) preview.src = url;
  else preview.removeAttribute("src");
}
function setPlanImageBusy(busy) {
  for (const id of [
    "plan-image-id",
    "plan-image-file",
    "plan-image-clear",
    "plan-submit",
  ])
    $p(id).disabled = busy;
}
function clearPlanImage() {
  if (planImageUploading) return;
  $p("plan-image-id").value = "";
  $p("plan-image-file").value = "";
  previewPlanImage();
}
async function uploadPlanImage(input) {
  const file = input.files[0];
  if (!file || planImageUploading) return;
  const generation = planImageGeneration;
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024 ||
    !file.size
  ) {
    pricingError(
      "plan-error",
      new Error("Chọn ảnh JPEG, PNG hoặc WebP có dung lượng tối đa 10 MB."),
    );
    input.value = "";
    return;
  }
  planImageUploading = true;
  setPlanImageBusy(true);
  $p("plan-image-status").textContent = "Đang tải và xử lý ảnh…";
  try {
    const intent = await pricingApi(
      "/api/v1/admin/media/upload-intents",
      "POST",
      {
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      },
    );
    const response = await fetch(intent.upload_url, {
      method: "PUT",
      headers: intent.headers,
      body: file,
      credentials: "omit",
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error("Không thể tải ảnh lên kho lưu trữ. Vui lòng thử lại.");
    const result = await pricingApi(
      "/api/v1/admin/media/" + intent.id + "/finalize",
      "POST",
      {},
      30000,
    );
    if (generation !== planImageGeneration) return;
    addPlanImage({
      id: result.id,
      payload: { url: result.url, filename: file.name },
    });
    $p("plan-image-id").value = result.id;
    previewPlanImage();
    $p("plan-image-status").textContent =
      "Ảnh đã sẵn sàng. Lưu gói rồi Công bố để khách nhìn thấy.";
  } catch (e) {
    if (generation === planImageGeneration) {
      pricingError("plan-error", e);
      $p("plan-image-status").textContent =
        "Tải ảnh chưa thành công; ảnh đang dùng được giữ nguyên.";
    }
  } finally {
    if (generation === planImageGeneration) {
      planImageUploading = false;
      setPlanImageBusy(false);
      input.value = "";
    }
  }
}
async function savePlan(event) {
  event.preventDefault();
  pricingClearError("plan-error");
  const button = event.target.querySelector("[type=submit]");
  button.disabled = true;
  try {
    if (planImageUploading)
      throw new Error("Chờ ảnh xử lý xong trước khi lưu gói.");
    const scopes = $p("plan-all-locations").checked
      ? []
      : Array.from(planPicker.selected);
    if (!$p("plan-all-locations").checked && !scopes.length)
      throw new Error("Chọn địa bàn cung cấp hoặc chọn tất cả.");
    const payload = {
      name: $p("plan-name").value.trim(),
      code: $p("plan-code").value.trim(),
      service: $p("plan-service").value,
      speed_mbps: $p("plan-speed").value
        ? Number($p("plan-speed").value)
        : null,
      upload_speed_mbps: $p("plan-upload-speed").value
        ? Number($p("plan-upload-speed").value)
        : null,
      description: $p("plan-description").value,
      equipment: $p("plan-equipment")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      card_labels: Object.fromEntries(
        ["badge", "speed", "offers", "equipment", "register", "details"].map(
          (k) => [k, $p("plan-label-" + k).value.trim()],
        ),
      ),
      applicable_region_ids: scopes,
      image_id: $p("plan-image-id").value || null,
      image_alt: $p("plan-image-alt").value.trim(),
    };
    await pricingApi(
      "/api/v1/admin/plans" +
        (editingPlan
          ? "/" + editingPlan.id + "?expected_version=" + editingPlan.version
          : ""),
      editingPlan ? "PUT" : "POST",
      payload,
    );
    closePricingDialog("plan-dialog");
    showToast("Đã lưu gói. Công bố để cập nhật cho khách.", "success");
    await loadPricesList();
  } catch (e) {
    pricingError("plan-error", e);
  } finally {
    button.disabled = false;
  }
}
async function publishResource(kind, row) {
  try {
    await pricingApi(
      "/api/v1/admin/" + kind + "/" + row.id + "/publish",
      "POST",
      { expected_version: row.version },
    );
    showToast("Đã công bố.", "success");
    await loadPricesList();
    if (kind === "regions" && $p("location-province-filter").value)
      await loadLocationWards();
  } catch (e) {
    pricingError("pricing-page-error", e);
  }
}
function openLocationDialog(row = null) {
  editingLocation = row;
  $p("location-form").reset();
  pricingClearError("location-error");
  fillProvinceSelect("location-parent");
  const branch = $p("location-branch");
  branch.replaceChildren();
  const ids = new Set(
    (pricingIdentity?.memberships || []).map((m) => m.branch_id),
  );
  for (const id of ids)
    branch.append(
      new Option(
        id === PRICING_ZERO
          ? "Phạm vi toàn hệ thống"
          : "Chi nhánh của tài khoản",
        id,
      ),
    );
  if (row && !ids.has(row.payload.branch_id || row.branch_id))
    branch.append(
      new Option("Chi nhánh hiện tại", row.payload.branch_id || row.branch_id),
    );
  for (const id of ["location-level", "location-parent", "location-branch"])
    $p(id).disabled = !!row;
  if (row) {
    for (const [id, key] of [
      ["location-name", "name"],
      ["location-code", "code"],
      ["location-level", "level"],
      ["location-parent", "parent_id"],
      ["location-zone", "zone_id"],
      ["location-branch", "branch_id"],
    ])
      $p(id).value =
        row.payload[key] ??
        (key === "level"
          ? "province"
          : key === "branch_id"
            ? row.branch_id
            : "");
  } else if ($p("location-province-filter").value) {
    $p("location-level").value = "ward";
    $p("location-parent").value = $p("location-province-filter").value;
  }
  locationParentChanged();
  openPricingDialog("location-dialog");
}
function locationParentChanged() {
  const ward = $p("location-level").value === "ward";
  $p("location-parent").disabled = !ward || !!editingLocation;
  if (ward) {
    const parent = pricingLocation($p("location-parent").value);
    if (parent) {
      const branch = $p("location-branch");
      if (
        !Array.from(branch.options).some(
          (o) => o.value === (parent.payload.branch_id || parent.branch_id),
        )
      )
        branch.append(
          new Option(
            "Chi nhánh của tỉnh/thành",
            parent.payload.branch_id || parent.branch_id,
          ),
        );
      branch.value = parent.payload.branch_id || parent.branch_id;
      $p("location-zone").value = parent.payload.zone_id || "khac";
    }
  }
  $p("location-branch").disabled = ward || !!editingLocation;
  $p("location-zone").disabled = ward;
}
async function saveLocation(event) {
  event.preventDefault();
  pricingClearError("location-error");
  const button = event.target.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const payload = {
      ...(editingLocation?.payload || {}),
      name: $p("location-name").value.trim(),
      code: $p("location-code").value.trim(),
      level: $p("location-level").value,
      parent_id:
        $p("location-level").value === "ward"
          ? $p("location-parent").value
          : null,
      zone_id: $p("location-zone").value,
      branch_id: $p("location-branch").value,
    };
    await pricingApi(
      "/api/v1/admin/regions" +
        (editingLocation
          ? "/" +
            editingLocation.id +
            "?expected_version=" +
            editingLocation.version
          : ""),
      editingLocation ? "PUT" : "POST",
      payload,
    );
    closePricingDialog("location-dialog");
    showToast(
      "Đã lưu địa bàn. Công bố để đưa vào lựa chọn của khách.",
      "success",
    );
    await loadPricesList();
    if ($p("location-province-filter").value) await loadLocationWards();
  } catch (e) {
    pricingError("location-error", e);
  } finally {
    button.disabled = false;
  }
}
function confirmPricingRetire(kind, row) {
  pricingClearError("confirm-error");
  $p("confirm-message").textContent =
    "Ngừng " +
    (kind === "plans"
      ? row.payload.name
      : kind === "regions"
        ? row.payload.name
        : pricingPlanName(row.plan_id) + " tại " + pricingScopeName(row)) +
    "? Lịch sử đăng ký và báo giá được giữ nguyên.";
  $p("confirm-action").onclick = async () => {
    const button = $p("confirm-action");
    button.disabled = true;
    try {
      await pricingApi(
        "/api/v1/admin/" + kind + "/" + row.id + "/retire",
        "POST",
        { expected_version: row.version },
      );
      closePricingDialog("pricing-confirm");
      await loadPricesList();
      if (kind === "regions" && $p("location-province-filter").value)
        await loadLocationWards();
    } catch (e) {
      pricingError("confirm-error", e);
    } finally {
      button.disabled = false;
    }
  };
  openPricingDialog("pricing-confirm");
}
function openCsvModal() {
  lastCsvApprovalToken = null;
  $p("btn-csv-apply").hidden = true;
  $p("csv-preview-summary").textContent = "";
  $p("csv-preview-errors").hidden = true;
  openPricingDialog("csv-modal-backdrop");
}
function closeCsvModal() {
  closePricingDialog("csv-modal-backdrop");
}
async function handleCsvPreview() {
  lastCsvApprovalToken = null;
  $p("btn-csv-apply").hidden = true;
  lastCsvText = $p("csv-content-input").value;
  try {
    const data = await pricingApi(
      "/api/v1/admin/prices/imports/preview",
      "POST",
      { csv: lastCsvText },
    );
    $p("csv-preview-summary").textContent =
      (data.rows?.length || 0) + " dòng hợp lệ";
    if (data.errors?.length)
      throw new Error(
        data.errors.map((e) => "Dòng " + e.row + ": " + e.code).join("; "),
      );
    lastCsvApprovalToken = data.approval_token;
    $p("csv-preview-errors").hidden = true;
    $p("btn-csv-apply").hidden = !lastCsvApprovalToken;
  } catch (e) {
    pricingError("csv-preview-errors", e);
  }
}
async function handleCsvApply() {
  if (!lastCsvApprovalToken || lastCsvText !== $p("csv-content-input").value) {
    lastCsvApprovalToken = null;
    $p("btn-csv-apply").hidden = true;
    pricingError(
      "csv-preview-errors",
      new Error("Nội dung đã thay đổi. Xem trước lại trước khi áp dụng."),
    );
    return;
  }
  $p("btn-csv-apply").disabled = true;
  try {
    await pricingApi("/api/v1/admin/prices/imports/apply", "POST", {
      csv: lastCsvText,
      approval_token: lastCsvApprovalToken,
    });
    closeCsvModal();
    await loadPricesList();
  } catch (e) {
    pricingError("csv-preview-errors", e);
  } finally {
    $p("btn-csv-apply").disabled = false;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  loadPricesList();
  for (const input of document.querySelectorAll("[data-money]"))
    input.addEventListener("blur", formatPricingMoney);
  for (const form of document.querySelectorAll(".pricing-dialog form"))
    form.addEventListener(
      "invalid",
      (event) => {
        const errorId = {
          "create-price-form": "price-error",
          "plan-form": "plan-error",
          "location-form": "location-error",
        }[form.id];
        if (errorId)
          pricingError(
            errorId,
            new Error(
              "Kiểm tra trường " +
                (event.target.closest("label")?.firstChild?.textContent ||
                  "bắt buộc") +
                ".",
            ),
          );
      },
      true,
    );
});

document.addEventListener("admin:data-changed", () => {
  if (!document.querySelector("dialog[open]")) loadPricesList();
});

let cloningGroupScopeId = null;
function previewDraftPrice() {
  window.PageFPTPriceMatrix?.preview();
}
document.addEventListener("DOMContentLoaded", () => {
  $p("create-price-form")?.addEventListener("input", previewDraftPrice);
});

window.addEventListener("pagefpt-admin-bulk-complete", () => loadPricesList());

function previewPlanCard() {
  const value = (k) => $p("plan-label-" + k).value;
  $p("plan-preview-name").textContent = $p("plan-name").value || "Tên gói cước";
  $p("plan-preview-badge").textContent = value("badge");
  $p("plan-preview-speed").textContent =
    value("speed") +
    " · " +
    "↓ " +
    ($p("plan-speed").value
      ? $p("plan-speed").value + " Mbps"
      : "Chưa cập nhật") +
    " / ↑ " +
    ($p("plan-upload-speed").value
      ? $p("plan-upload-speed").value + " Mbps"
      : "Chưa cập nhật");
  $p("plan-preview-offers").textContent = value("offers");
  $p("plan-preview-equipment").textContent =
    value("equipment") +
    " · " +
    ($p("plan-equipment").value || "Xác nhận theo gói");
  $p("plan-preview-register").textContent = value("register");
  $p("plan-preview-details").textContent = value("details");
}
document
  .getElementById("plan-form")
  ?.addEventListener("input", previewPlanCard);
