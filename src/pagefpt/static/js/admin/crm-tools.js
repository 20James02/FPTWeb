/** Personal saved filters and scoped staff/location selectors. */
let crmSavedViews = [];
async function crmLoadViews() {
  const select = document.getElementById("crm-saved-view");
  if (!select) return;
  try {
    crmSavedViews = (await crmRequest("/lead-views")).items;
    select.replaceChildren(new Option("Bộ lọc đã lưu", ""));
    for (const view of crmSavedViews)
      select.append(new Option(view.payload.name, view.id));
  } catch (e) {
    showToast(e.message, "error");
  }
}
async function crmSaveView() {
  const name = await adminAskText("Tên bộ lọc cá nhân", 80);
  if (!name) return;
  try {
    const filters = crmFilters();
    for (const [key, value] of Object.entries(filters))
      if (!value) delete filters[key];
    filters.overdue = document.getElementById("filter-overdue").checked;
    filters.status = crmCurrentStatus;
    await crmRequest("/lead-views", "POST", {
      name,
      expected_version: 0,
      filters,
    });
    await crmLoadViews();
    showToast("Đã lưu bộ lọc cá nhân.", "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}
function crmApplyView(id) {
  const view = crmSavedViews.find((item) => item.id === id);
  if (!view) return;
  const filters = view.payload.filters;
  for (const [key, field] of Object.entries({
    q: "filter-search",
    start: "filter-start",
    end: "filter-end",
    branch_id: "filter-branch",
    assignee_id: "filter-assignee",
    region_id: "filter-region",
  })) {
    const element = document.getElementById(field);
    if (element) {
      if (
        element.tagName === "SELECT" &&
        filters[key] &&
        !Array.from(element.options).some(
          (option) => option.value === filters[key],
        )
      )
        element.append(
          new Option("Giá trị đã lưu: " + filters[key], filters[key]),
        );
      element.value = filters[key] || "";
    }
  }
  document.getElementById("filter-overdue").checked = filters.overdue;
  document.getElementById("filter-status").value = filters.status || "all";
  reloadCrmData();
}
async function crmDeleteView() {
  const selected = document.getElementById("crm-saved-view").value,
    view = crmSavedViews.find((item) => item.id === selected);
  if (!view) return;
  try {
    await crmRequest(
      "/lead-views/" + view.id + "?expected_version=" + view.version,
      "DELETE",
    );
    await crmLoadViews();
    showToast("Đã xóa bộ lọc cá nhân.", "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}
async function crmLoadSelectors() {
  try {
    const me = await crmRequest("/me"),
      branches = document.getElementById("filter-branch"),
      staff = document.getElementById("filter-assignee");
    const seen = new Set();
    for (const member of me.memberships) {
      if (
        member.branch_id === "00000000-0000-0000-0000-000000000000" ||
        seen.has(member.branch_id)
      )
        continue;
      seen.add(member.branch_id);
      branches.append(new Option(member.branch_id, member.branch_id));
    }
    staff.append(new Option("Bạn", me.id));
    if (adminHasPermission("lead.assign")) {
      const items = (await crmRequest("/assignees")).items;
      for (const member of items)
        if (member.user_id !== me.id)
          staff.append(
            new Option(
              member.display_name || member.user_id.slice(0, 8),
              member.user_id,
            ),
          );
    }
    const response = await fetch("/api/v1/regions/hierarchy");
    if (!response.ok) throw new Error("Không thể tải danh mục địa bàn.");
    const hierarchy = await response.json();
    const regions = document.getElementById("filter-region");
    for (const zone of Object.values(hierarchy))
      for (const province of zone.provinces)
        regions.append(new Option(province.name, province.code));
  } catch (e) {
    showToast(e.message, "error");
  }
}
document.addEventListener("DOMContentLoaded", () => {
  crmLoadViews();
  crmLoadSelectors();
});
