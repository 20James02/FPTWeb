let operationalVersion = null;
async function loadOperationalSettings() {
  const form = document.getElementById("operational-settings-form");
  if (!form) return;
  try {
    const data = await crmRequest("/operations/settings");
    operationalVersion = data.version;
    adminSoundEnabled = data.payload.sound_alert;
    document.getElementById("setting-sla").value = data.payload.sla_minutes;
    document.getElementById("setting-sound").checked = data.payload.sound_alert;
    document.getElementById("setting-shift-start").value =
      data.payload.shift.start.slice(0, 5);
    document.getElementById("setting-shift-end").value =
      data.payload.shift.end.slice(0, 5);
    document
      .querySelectorAll("[name=workday]")
      .forEach(
        (node) =>
          (node.checked = data.payload.shift.weekdays.includes(
            Number(node.value),
          )),
      );
    document.getElementById("operational-settings-state").textContent =
      "Phiên bản " + data.version;
    document.getElementById("btn-save-operational-settings").disabled = false;
  } catch (e) {
    document.getElementById("operational-settings-state").textContent =
      e.message;
  }
}
async function saveOperationalSettings(event) {
  event.preventDefault();
  const button = document.getElementById("btn-save-operational-settings");
  button.disabled = true;
  try {
    const payload = {
      expected_version: operationalVersion,
      sla_minutes: Number(document.getElementById("setting-sla").value),
      sound_alert: document.getElementById("setting-sound").checked,
      shift: {
        weekdays: Array.from(
          document.querySelectorAll("[name=workday]:checked"),
          (node) => Number(node.value),
        ),
        start: document.getElementById("setting-shift-start").value,
        end: document.getElementById("setting-shift-end").value,
      },
    };
    const saved = await crmRequest("/operations/settings", "PUT", payload);
    operationalVersion = saved.version;
    adminSoundEnabled = saved.payload.sound_alert;
    document.getElementById("operational-settings-state").textContent =
      "Đã lưu phiên bản " + saved.version;
    showToast(
      "Đã lưu cấu hình tiếp nhận. SLA áp dụng cho hồ sơ mới.",
      "success",
    );
  } catch (e) {
    showToast(e.message, "error");
    if (e.code === "VERSION_CONFLICT") await loadOperationalSettings();
  } finally {
    button.disabled = operationalVersion == null;
  }
}
async function loadSystemStatus() {
  const container = document.getElementById("system-status-list");
  if (!container) return;
  const labels = {
    verified: "Đã kiểm tra",
    configured_unverified: "Đã cấu hình · Chưa kiểm chứng cloud",
    unconfigured: "Chưa cấu hình",
    disabled: "Đang tắt",
    unavailable: "Không kết nối được",
  };
  try {
    const data = await crmRequest("/operations/status");
    container.replaceChildren();
    for (const [key, title] of Object.entries({
      database: "Cơ sở dữ liệu",
      storage: "R2",
      auth: "Xác thực",
      conversions: "Chuyển đổi quảng cáo",
      notifications: "Thông báo",
    })) {
      container.append(
        adminNode(
          "div",
          `${title}: ${labels[data[key].status] || data[key].status}${data[key].latency_ms != null ? ` · ${data[key].latency_ms} ms` : ""}`,
          "workspace-item",
        ),
      );
    }
    container.append(
      adminNode(
        "p",
        `Kiểm tra: ${new Date(data.checked_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · ${data.environment}`,
      ),
    );
  } catch (e) {
    container.replaceChildren(adminNode("p", e.message, "workspace-error"));
  }
}
async function saveAdminDisplaySettings(event) {
  event?.preventDefault();
  const button = document.getElementById("btn-save-display-settings");
  button.disabled = true;
  try {
    const banner_zones = {};
    document
      .querySelectorAll(".banner-zone-toggle")
      .forEach((node) => (banner_zones[node.dataset.zone] = node.checked));
    const payload = { expected_version: adminDisplayVersion, banner_zones };
    for (const key of [
      "fpt_anim",
      "runline_enabled",
      "lenis_scroll",
      "tilt_parallax",
    ])
      payload[key] = document.getElementById(
        "setting-" + key.replaceAll("_", "-"),
      ).checked;
    for (const key of ["fpt_anim_style", "runline_speed", "runline_text"])
      payload[key] = document.getElementById(
        "setting-" + key.replaceAll("_", "-"),
      ).value;
    const response = await adminFetch("/api/v1/system/display-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.code === "VERSION_CONFLICT"
          ? "Cấu hình vừa thay đổi. Tải lại trang trước khi lưu."
          : data.message || "Chưa thể lưu.",
      );
    adminDisplayVersion = data.settings.version;
    showToast("Đã lưu cấu hình hiển thị.", "success");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    button.disabled = false;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("operational-settings-form")
    ?.addEventListener("submit", saveOperationalSettings);
  document
    .getElementById("display-settings-form")
    ?.addEventListener("submit", saveAdminDisplaySettings);
  loadOperationalSettings();
  loadSystemStatus();
});
