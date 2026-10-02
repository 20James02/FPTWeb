/** Durable scoped polling. Advance cursor only after the current view refresh succeeds. */
let changeCursor = 0;
let changesInFlight = false;
let changeTimer = null;
let changesFailures = 0;
async function refreshAdminView() {
  const path = window.location.pathname;
  if (path === "/admin/leads") return await refreshCrmLeads();
  if (
    path === "/admin/dashboard" &&
    typeof loadDashboardRealData === "function"
  ) {
    if ((await loadDashboardRealData()) === false) return false;
  }
  if (path === "/admin/leads/detail" && typeof initLeadDetail === "function")
    if ((await initLeadDetail()) === false) return false;
  if (path === "/admin/reports" && typeof loadReportsData === "function")
    if ((await loadReportsData()) === false) return false;
  document.dispatchEvent(new CustomEvent("admin:data-changed"));
  return true;
}
async function refreshAdminChanges() {
  if (
    changesInFlight ||
    document.visibilityState === "hidden" ||
    window.location.pathname.includes("/login") ||
    !adminHasPermission("lead.read")
  )
    return;
  changesInFlight = true;
  const label = document.getElementById("realtime-status-text");
  try {
    const response = await adminFetch(
      "/api/v1/admin/changes?after=" + changeCursor,
    );
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.items.length) {
      const refreshed = await refreshAdminView();
      if (refreshed === false) throw new Error();
      await adminRefreshLeadCount();
      changeCursor = Math.max(
        changeCursor,
        ...data.items.map((item) => item.cursor),
      );
      if (
        typeof adminPlayLeadSound === "function" &&
        data.items.some((item) => item.type === "lead.created")
      )
        adminPlayLeadSound();
    }

    changesFailures = 0;
    if (label)
      label.textContent =
        "Kiểm tra thay đổi: " + new Date().toLocaleTimeString("vi-VN");
  } catch (_) {
    changesFailures = Math.min(changesFailures + 1, 4);
    if (label) label.textContent = "Chờ kết nối lại";
  } finally {
    changesInFlight = false;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(
      refreshAdminChanges,
      Math.min(30000, 5000 * 2 ** changesFailures),
    );
  }
}
document.addEventListener("DOMContentLoaded", () => {
  if (adminHasPermission("lead.read")) refreshAdminChanges();
  else {
    const label = document.getElementById("realtime-status-text");
    if (label) label.textContent = "Cập nhật bằng nút làm mới";
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshAdminChanges();
});
